import type { Prisma, CreditAccountType } from '@/lib/server/generated-prisma';
import { CreditTransactionKind } from '@/lib/server/generated-prisma';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { creditsFromTokenUsage, creditsFromUsd, formatUsdLabel } from '@/lib/utils/credits';
import {
  applyCreditDelta as applyCreditDeltaToLedger,
  ensureCreditLedgerInitialized,
  getCreditBalance,
  getUserCreditBalances as getLedgerCreditBalances,
  type ApplyCreditDeltaArgs,
  type UserCreditBalances,
} from '@/lib/server/repositories/credit-ledger-repository';
import type { DbClient } from '@/lib/server/repositories/types';
import {
  estimateOpenAIImageGenerationRetailCostUsd,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
  estimateWebSearchRetailCostUsd,
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
} from '@/lib/utils/openai-pricing';

const log = createLogger('Credits');

function isComputeCreditSpendingDisabledForTesting(): boolean {
  if (process.env.SYNTARA_ENABLE_COMPUTE_CREDIT_SPENDING === 'true') return false;
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_DISABLE_COMPUTE_CREDIT_SPENDING === 'true' ||
    process.env.SYNTARA_TEST_NO_CHARGE === 'true'
  );
}

interface ChargeCreditsForUsdArgs {
  userId?: string | null;
  usdCost?: number | null;
  requestedCreditsCostOverride?: number | null;
  route?: string | null;
  source?: string | null;
  descriptionPrefix: string;
  referenceType: string;
  referenceId?: string | null;
  metadata?: Prisma.InputJsonObject;
}

function isInsufficientCreditError(error: unknown): boolean {
  return error instanceof Error && /积分不足|credits/i.test(error.message);
}

export async function getUserCreditBalances(
  db: DbClient,
  userId: string,
): Promise<UserCreditBalances> {
  return getLedgerCreditBalances(db, userId);
}

async function chargeCreditsForUsdCost(args: ChargeCreditsForUsdArgs): Promise<{
  requestedCreditsCost: number;
  chargedCredits: number;
  previousBalance: number;
  nextBalance: number;
} | null> {
  const userId = args.userId?.trim();
  if (!userId) return null;
  if (isComputeCreditSpendingDisabledForTesting()) {
    log.info('Skipped compute credit charge in test mode', {
      userId,
      route: args.route ?? null,
      source: args.source ?? null,
      referenceType: args.referenceType,
    });
    return null;
  }

  const usdCost =
    typeof args.usdCost === 'number' && !Number.isNaN(args.usdCost) ? Math.max(0, args.usdCost) : 0;
  const hasUsdCost = typeof args.usdCost === 'number' && !Number.isNaN(args.usdCost);
  const requestedCreditsCost =
    typeof args.requestedCreditsCostOverride === 'number' &&
    !Number.isNaN(args.requestedCreditsCostOverride)
      ? Math.max(0, Math.round(args.requestedCreditsCostOverride))
      : creditsFromUsd(usdCost, 'ceil');
  if (requestedCreditsCost <= 0) return null;

  const prisma = getOptionalPrisma();
  if (!prisma) return null;

  let chargeSummary: {
    requestedCreditsCost: number;
    chargedCredits: number;
    previousBalance: number;
    nextBalance: number;
  } | null = null;

  await prisma.$transaction(async (tx) => {
    const balances = await getUserCreditBalances(tx, userId);
    const currentBalance = balances.computeCreditsBalance;
    const chargedCredits = Math.min(currentBalance, requestedCreditsCost);
    if (chargedCredits <= 0) return;

    try {
      await applyCreditDelta(tx, {
        userId,
        delta: -chargedCredits,
        kind: CreditTransactionKind.TOKEN_USAGE,
        accountType: 'COMPUTE',
        description: hasUsdCost
          ? `${args.descriptionPrefix}: ${chargedCredits} compute credits (${formatUsdLabel(usdCost)})`
          : `${args.descriptionPrefix}: ${chargedCredits} compute credits`,
        referenceType: args.referenceType,
        referenceId: args.referenceId?.trim() || undefined,
        metadata: {
          ...(args.metadata ?? {}),
          estimatedUsdCost: hasUsdCost ? usdCost : null,
          requestedCreditsCost,
          chargedCredits,
        },
      });
    } catch (error) {
      if (isInsufficientCreditError(error)) return;
      throw error;
    }

    chargeSummary = {
      requestedCreditsCost,
      chargedCredits,
      previousBalance: currentBalance,
      nextBalance: currentBalance - chargedCredits,
    };
  });

  return chargeSummary;
}

export async function ensureUserCreditsInitialized(db: DbClient, userId: string): Promise<number> {
  return ensureCreditLedgerInitialized(db, userId);
}

export async function applyCreditDelta(db: DbClient, args: ApplyCreditDeltaArgs): Promise<number> {
  return applyCreditDeltaToLedger(db, args);
}

export async function assertUserHasCredits(
  userId?: string | null,
  accountType: CreditAccountType = 'COMPUTE',
): Promise<void> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return;
  if (accountType === 'COMPUTE' && isComputeCreditSpendingDisabledForTesting()) return;

  const prisma = getOptionalPrisma();
  if (!prisma) return;

  const balances = await getUserCreditBalances(prisma, normalizedUserId);
  if (getCreditBalance(balances, accountType) > 0) return;

  if (accountType === 'PURCHASE') {
    throw new Error('购买积分不足，无法继续购买课程或笔记本');
  }
  if (accountType === 'CASH') {
    throw new Error('余额不足，请先充值');
  }
  throw new Error('算力积分不足，无法继续使用模型能力');
}

export async function convertCashCredits(args: {
  userId: string;
  amount: number;
  targetAccountType: Extract<CreditAccountType, 'COMPUTE' | 'PURCHASE'>;
}): Promise<{ cashBalance: number; targetBalance: number }> {
  const prisma = getOptionalPrisma();
  if (!prisma) throw new Error('数据库不可用，暂时无法转换积分');

  const amount = Math.max(0, Math.round(args.amount));
  if (amount <= 0) throw new Error('转换积分必须大于 0');

  return prisma.$transaction(async (tx) => {
    const transferKind =
      args.targetAccountType === 'COMPUTE'
        ? CreditTransactionKind.CASH_TO_COMPUTE_TRANSFER
        : CreditTransactionKind.CASH_TO_PURCHASE_TRANSFER;
    const targetLabel = args.targetAccountType === 'COMPUTE' ? '算力积分' : '购买积分';

    const cashBalance = await applyCreditDelta(tx, {
      userId: args.userId,
      delta: -amount,
      kind: transferKind,
      accountType: 'CASH',
      description: `Transfer to ${targetLabel}`,
      referenceType: 'credits_transfer_out',
      metadata: {
        amount,
        targetAccountType: args.targetAccountType,
      },
    });
    const targetBalance = await applyCreditDelta(tx, {
      userId: args.userId,
      delta: amount,
      kind: transferKind,
      accountType: args.targetAccountType,
      description: `Received from 现金积分`,
      referenceType: 'credits_transfer_in',
      metadata: {
        amount,
        sourceAccountType: 'CASH',
      },
    });

    return { cashBalance, targetBalance };
  });
}

export async function chargeCreditsForTokenUsage(args: {
  userId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
  route?: string | null;
  source?: string | null;
  modelString?: string | null;
  notebookGenerationSessionId?: string | null;
  notebookGenerationTaskId?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  sceneId?: string | null;
  sceneTitle?: string | null;
  sceneOrder?: number | null;
  sceneType?: string | null;
  operationCode?: string | null;
  chargeReason?: string | null;
  serviceLabel?: string | null;
}): Promise<void> {
  const userId = args.userId?.trim();
  if (!userId) {
    if (args.route?.startsWith('/api/generate/')) {
      log.warn('Skipped generation compute charge because request had no userId', {
        route: args.route ?? null,
        source: args.source ?? null,
        modelString: args.modelString ?? null,
        totalTokens: args.totalTokens ?? 0,
      });
    }
    return;
  }

  const estimatedBaseUsdCost = estimateOpenAITextUsageBaseCostUsd({
    providerId: args.providerId,
    modelId: args.modelId,
    modelString: args.modelString,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cachedInputTokens: args.cachedInputTokens,
  });
  const estimatedUsdCost = estimateOpenAITextUsageRetailCostUsd({
    providerId: args.providerId,
    modelId: args.modelId,
    modelString: args.modelString,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cachedInputTokens: args.cachedInputTokens,
  });
  const requestedCreditsCost =
    estimateOpenAITextUsageRetailCostCredits({
      providerId: args.providerId,
      modelId: args.modelId,
      modelString: args.modelString,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cachedInputTokens: args.cachedInputTokens,
    }) ?? creditsFromTokenUsage(args.totalTokens);
  if (requestedCreditsCost <= 0) {
    if (args.route?.startsWith('/api/generate/')) {
      log.info('Skipped generation compute charge because token usage was zero', {
        userId,
        route: args.route ?? null,
        source: args.source ?? null,
        totalTokens: args.totalTokens ?? 0,
      });
    }
    return;
  }

  const chargeSummary = await chargeCreditsForUsdCost({
    userId,
    usdCost: estimatedUsdCost,
    requestedCreditsCostOverride: estimatedUsdCost == null ? requestedCreditsCost : undefined,
    route: args.route,
    source: args.source,
    descriptionPrefix: 'LLM usage charge',
    referenceType: 'llm_usage',
    referenceId: args.route?.trim() || undefined,
    metadata: {
      providerId: args.providerId ?? null,
      modelId: args.modelId ?? null,
      inputTokens: args.inputTokens ?? 0,
      outputTokens: args.outputTokens ?? 0,
      cachedInputTokens: args.cachedInputTokens ?? 0,
      totalTokens: args.totalTokens ?? 0,
      route: args.route ?? null,
      source: args.source ?? null,
      modelString: args.modelString ?? null,
      notebookGenerationSessionId: args.notebookGenerationSessionId ?? null,
      notebookGenerationTaskId: args.notebookGenerationTaskId ?? null,
      notebookId: args.notebookId ?? null,
      notebookName: args.notebookName ?? null,
      courseId: args.courseId ?? null,
      courseName: args.courseName ?? null,
      sceneId: args.sceneId ?? null,
      sceneTitle: args.sceneTitle ?? null,
      sceneOrder:
        typeof args.sceneOrder === 'number' && Number.isFinite(args.sceneOrder)
          ? Math.max(0, Math.round(args.sceneOrder))
          : null,
      sceneType: args.sceneType ?? null,
      operationCode: args.operationCode ?? null,
      chargeReason: args.chargeReason ?? null,
      serviceLabel: args.serviceLabel ?? null,
      estimatedBaseUsdCost,
      retailMarkupMultiplier: estimatedUsdCost == null ? null : OPENAI_RETAIL_MARKUP_MULTIPLIER,
      pricingMode: estimatedUsdCost == null ? 'legacy-token-fallback' : 'openai-retail',
    },
  });

  if (!chargeSummary) {
    if (args.route?.startsWith('/api/generate/')) {
      log.warn('Generation compute charge resolved to zero because balance is empty', {
        userId,
        route: args.route ?? null,
        source: args.source ?? null,
        totalTokens: args.totalTokens ?? 0,
        requestedCreditsCost,
      });
    }
    return;
  }

  if (args.route?.startsWith('/api/generate/')) {
    log.info('Charged compute credits for generation usage', {
      userId,
      route: args.route ?? null,
      source: args.source ?? null,
      modelString: args.modelString ?? null,
      totalTokens: args.totalTokens ?? 0,
      requestedCreditsCost: chargeSummary.requestedCreditsCost,
      chargedCredits: chargeSummary.chargedCredits,
      previousBalance: chargeSummary.previousBalance,
      nextBalance: chargeSummary.nextBalance,
    });
  }
}

export async function chargeCreditsForImageGeneration(args: {
  userId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  route?: string | null;
  prompt?: string | null;
  notebookGenerationSessionId?: string | null;
  notebookGenerationTaskId?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  sceneId?: string | null;
  sceneTitle?: string | null;
  sceneOrder?: number | null;
  sceneType?: string | null;
  operationCode?: string | null;
  chargeReason?: string | null;
  serviceLabel?: string | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    textInputTokens?: number | null;
    imageInputTokens?: number | null;
  } | null;
}): Promise<void> {
  const providerId = args.providerId?.trim().toLowerCase();
  if (providerId && providerId !== 'openai-image') return;

  const estimatedUsdCost = estimateOpenAIImageGenerationRetailCostUsd({
    modelId: args.modelId,
    ...args.usage,
  });
  if (estimatedUsdCost == null || estimatedUsdCost <= 0) return;

  await chargeCreditsForUsdCost({
    userId: args.userId,
    usdCost: estimatedUsdCost,
    route: args.route,
    source: 'image-generation',
    descriptionPrefix: 'Image generation charge',
    referenceType: 'image_generation',
    referenceId: args.route?.trim() || undefined,
    metadata: {
      providerId: args.providerId ?? null,
      modelId: args.modelId ?? null,
      notebookGenerationSessionId: args.notebookGenerationSessionId ?? null,
      notebookGenerationTaskId: args.notebookGenerationTaskId ?? null,
      notebookId: args.notebookId ?? null,
      notebookName: args.notebookName ?? null,
      courseId: args.courseId ?? null,
      courseName: args.courseName ?? null,
      sceneId: args.sceneId ?? null,
      sceneTitle: args.sceneTitle ?? null,
      sceneOrder:
        typeof args.sceneOrder === 'number' && Number.isFinite(args.sceneOrder)
          ? Math.max(0, Math.round(args.sceneOrder))
          : null,
      sceneType: args.sceneType ?? null,
      operationCode: args.operationCode ?? null,
      chargeReason: args.chargeReason ?? null,
      serviceLabel: args.serviceLabel ?? null,
      promptPreview: args.prompt?.trim().slice(0, 200) || null,
      inputTokens: args.usage?.inputTokens ?? 0,
      outputTokens: args.usage?.outputTokens ?? 0,
      totalTokens: args.usage?.totalTokens ?? 0,
      textInputTokens: args.usage?.textInputTokens ?? 0,
      imageInputTokens: args.usage?.imageInputTokens ?? 0,
      retailMarkupMultiplier: OPENAI_RETAIL_MARKUP_MULTIPLIER,
    },
  });
}

export async function chargeCreditsForWebSearch(args: {
  userId?: string | null;
  route?: string | null;
  query?: string | null;
  callCount?: number | null;
  source?: string | null;
  notebookGenerationSessionId?: string | null;
  notebookGenerationTaskId?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  sceneId?: string | null;
  sceneTitle?: string | null;
  sceneOrder?: number | null;
  sceneType?: string | null;
  operationCode?: string | null;
  chargeReason?: string | null;
  serviceLabel?: string | null;
}): Promise<void> {
  const callCount =
    typeof args.callCount === 'number' && !Number.isNaN(args.callCount)
      ? Math.max(0, Math.round(args.callCount))
      : 1;
  if (callCount <= 0) return;

  const estimatedUsdCost = estimateWebSearchRetailCostUsd(callCount);
  await chargeCreditsForUsdCost({
    userId: args.userId,
    usdCost: estimatedUsdCost,
    route: args.route,
    source: args.source ?? 'web-search',
    descriptionPrefix: 'Web search charge',
    referenceType: 'web_search',
    referenceId: args.route?.trim() || undefined,
    metadata: {
      notebookGenerationSessionId: args.notebookGenerationSessionId ?? null,
      notebookGenerationTaskId: args.notebookGenerationTaskId ?? null,
      notebookId: args.notebookId ?? null,
      notebookName: args.notebookName ?? null,
      courseId: args.courseId ?? null,
      courseName: args.courseName ?? null,
      sceneId: args.sceneId ?? null,
      sceneTitle: args.sceneTitle ?? null,
      sceneOrder:
        typeof args.sceneOrder === 'number' && Number.isFinite(args.sceneOrder)
          ? Math.max(0, Math.round(args.sceneOrder))
          : null,
      sceneType: args.sceneType ?? null,
      operationCode: args.operationCode ?? null,
      chargeReason: args.chargeReason ?? null,
      serviceLabel: args.serviceLabel ?? null,
      queryPreview: args.query?.trim().slice(0, 200) || null,
      callCount,
      retailMarkupMultiplier: OPENAI_RETAIL_MARKUP_MULTIPLIER,
    },
  });
}
