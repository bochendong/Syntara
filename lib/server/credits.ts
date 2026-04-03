import type { Prisma, PrismaClient } from '@prisma/client';
import { CreditTransactionKind } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  DEFAULT_USER_CREDITS,
  creditsFromUsd,
  creditsFromTokenUsage,
  formatUsdLabel,
} from '@/lib/utils/credits';
import {
  estimateOpenAIImageGenerationRetailCostUsd,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
  estimateWebSearchRetailCostUsd,
} from '@/lib/utils/openai-pricing';

type CreditDbClient = PrismaClient | Prisma.TransactionClient;
const log = createLogger('Credits');

interface ApplyCreditDeltaArgs {
  userId: string;
  delta: number;
  kind: CreditTransactionKind;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
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

async function chargeCreditsForUsdCost(
  args: ChargeCreditsForUsdArgs,
): Promise<
  | {
      requestedCreditsCost: number;
      chargedCredits: number;
      previousBalance: number;
      nextBalance: number;
    }
  | null
> {
  const userId = args.userId?.trim();
  if (!userId) {
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
  if (requestedCreditsCost <= 0) {
    return null;
  }

  const prisma = getOptionalPrisma();
  if (!prisma) return null;

  let chargeSummary:
    | {
        requestedCreditsCost: number;
        chargedCredits: number;
        previousBalance: number;
        nextBalance: number;
      }
    | null = null;

  await prisma.$transaction(async (tx) => {
    const currentBalance = await ensureUserCreditsInitialized(tx, userId);
    const chargedCredits = Math.min(currentBalance, requestedCreditsCost);
    if (chargedCredits <= 0) {
      return;
    }

    await applyCreditDelta(tx, {
      userId,
      delta: -chargedCredits,
      kind: CreditTransactionKind.TOKEN_USAGE,
      description: hasUsdCost
        ? `${args.descriptionPrefix}: ${chargedCredits} credits (${formatUsdLabel(usdCost)})`
        : `${args.descriptionPrefix}: ${chargedCredits} credits`,
      referenceType: args.referenceType,
      referenceId: args.referenceId?.trim() || undefined,
      metadata: {
        ...(args.metadata ?? {}),
        estimatedUsdCost: hasUsdCost ? usdCost : null,
        requestedCreditsCost,
        chargedCredits,
      },
    });

    chargeSummary = {
      requestedCreditsCost,
      chargedCredits,
      previousBalance: currentBalance,
      nextBalance: currentBalance - chargedCredits,
    };
  });

  return chargeSummary;
}

export async function ensureUserCreditsInitialized(
  db: CreditDbClient,
  userId: string,
): Promise<number> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return 0;

  const [user, existingTransactions] = await Promise.all([
    db.user.findUnique({
      where: { id: normalizedUserId },
      select: { creditsBalance: true },
    }),
    db.creditTransaction.count({
      where: { userId: normalizedUserId },
    }),
  ]);

  if (!user) return 0;
  if (existingTransactions > 0) return user.creditsBalance;

  const grant = user.creditsBalance > 0 ? 0 : DEFAULT_USER_CREDITS;
  const nextBalance = user.creditsBalance + grant;

  if (grant > 0) {
    await db.user.update({
      where: { id: normalizedUserId },
      data: { creditsBalance: nextBalance },
    });
  }

  await db.creditTransaction.create({
    data: {
      userId: normalizedUserId,
      kind: CreditTransactionKind.WELCOME_BONUS,
      delta: grant,
      balanceAfter: nextBalance,
      description: grant > 0 ? 'Initial welcome credits' : 'Credits ledger initialized',
    },
  });

  return nextBalance;
}

export async function applyCreditDelta(
  db: CreditDbClient,
  args: ApplyCreditDeltaArgs,
): Promise<number> {
  const userId = args.userId.trim();
  if (!userId) throw new Error('Invalid user for credit transaction');

  await ensureUserCreditsInitialized(db, userId);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  if (!user) throw new Error('User not found');

  const nextBalance = user.creditsBalance + args.delta;
  if (nextBalance < 0) {
    throw new Error('积分不足，请先补充 credits');
  }

  await db.user.update({
    where: { id: userId },
    data: { creditsBalance: nextBalance },
  });

  await db.creditTransaction.create({
    data: {
      userId,
      kind: args.kind,
      delta: args.delta,
      balanceAfter: nextBalance,
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
    },
  });

  return nextBalance;
}

export async function assertUserHasCredits(userId?: string | null): Promise<void> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return;

  const prisma = getOptionalPrisma();
  if (!prisma) return;

  await ensureUserCreditsInitialized(prisma, normalizedUserId);
  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: { creditsBalance: true },
  });

  if (!user || user.creditsBalance <= 0) {
    throw new Error('积分不足，无法继续使用模型能力');
  }
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
      log.warn('Skipped generation credits charge because request had no userId', {
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
      log.info('Skipped generation credits charge because token usage was zero', {
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
      retailMarkupMultiplier:
        estimatedUsdCost == null ? null : OPENAI_RETAIL_MARKUP_MULTIPLIER,
      pricingMode: estimatedUsdCost == null ? 'legacy-token-fallback' : 'openai-retail',
    },
  });

  if (!chargeSummary) {
    if (args.route?.startsWith('/api/generate/')) {
      log.warn('Generation credits charge resolved to zero because balance is empty', {
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
    log.info('Charged credits for generation usage', {
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
