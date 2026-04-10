import type { Prisma, PrismaClient, CreditAccountType } from '@prisma/client';
import { CreditTransactionKind } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  DEFAULT_USER_CASH_CREDITS,
  DEFAULT_USER_COMPUTE_CREDITS,
  DEFAULT_USER_PURCHASE_CREDITS,
  creditsFromTokenUsage,
  creditsFromUsd,
  formatUsdLabel,
} from '@/lib/utils/credits';
import {
  estimateOpenAIImageGenerationRetailCostUsd,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
  estimateWebSearchRetailCostUsd,
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
} from '@/lib/utils/openai-pricing';

type CreditDbClient = PrismaClient | Prisma.TransactionClient;
const log = createLogger('Credits');

type BalanceField = 'creditsBalance' | 'computeCreditsBalance' | 'purchaseCreditsBalance';

type UserBalances = {
  creditsBalance: number;
  computeCreditsBalance: number;
  purchaseCreditsBalance: number;
};

const ACCOUNT_INIT_CONFIG: Array<{
  accountType: CreditAccountType;
  defaultAmount: number;
  referenceType: string;
  descriptionWhenGranted: string;
  descriptionWhenEmpty: string;
}> = [
  {
    accountType: 'CASH',
    defaultAmount: DEFAULT_USER_CASH_CREDITS,
    referenceType: 'welcome_init_cash',
    descriptionWhenGranted: 'Initial cash credits',
    descriptionWhenEmpty: 'Cash credits ledger initialized',
  },
  {
    accountType: 'COMPUTE',
    defaultAmount: DEFAULT_USER_COMPUTE_CREDITS,
    referenceType: 'welcome_init_compute',
    descriptionWhenGranted: 'Welcome compute credits',
    descriptionWhenEmpty: 'Compute credits ledger initialized',
  },
  {
    accountType: 'PURCHASE',
    defaultAmount: DEFAULT_USER_PURCHASE_CREDITS,
    referenceType: 'welcome_init_purchase',
    descriptionWhenGranted: 'Welcome purchase credits',
    descriptionWhenEmpty: 'Purchase credits ledger initialized',
  },
];

interface ApplyCreditDeltaArgs {
  userId: string;
  delta: number;
  kind: CreditTransactionKind;
  accountType?: CreditAccountType;
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

function getBalanceField(accountType: CreditAccountType): BalanceField {
  if (accountType === 'CASH') return 'creditsBalance';
  if (accountType === 'PURCHASE') return 'purchaseCreditsBalance';
  return 'computeCreditsBalance';
}

function getBalance(user: UserBalances, accountType: CreditAccountType): number {
  return user[getBalanceField(accountType)];
}

async function loadUserBalances(
  db: CreditDbClient,
  userId: string,
): Promise<UserBalances | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      creditsBalance: true,
      computeCreditsBalance: true,
      purchaseCreditsBalance: true,
    },
  });
}

export async function getUserCreditBalances(
  db: CreditDbClient,
  userId: string,
): Promise<UserBalances> {
  await ensureUserCreditsInitialized(db, userId);
  const user = await loadUserBalances(db, userId.trim());
  return (
    user ?? {
      creditsBalance: 0,
      computeCreditsBalance: 0,
      purchaseCreditsBalance: 0,
    }
  );
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
  if (!userId) return null;

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

  let chargeSummary:
    | {
        requestedCreditsCost: number;
        chargedCredits: number;
        previousBalance: number;
        nextBalance: number;
      }
    | null = null;

  await prisma.$transaction(async (tx) => {
    const balances = await getUserCreditBalances(tx, userId);
    const currentBalance = balances.computeCreditsBalance;
    const chargedCredits = Math.min(currentBalance, requestedCreditsCost);
    if (chargedCredits <= 0) return;

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

  const [user, existingInitRows] = await Promise.all([
    loadUserBalances(db, normalizedUserId),
    db.creditTransaction.findMany({
      where: {
        userId: normalizedUserId,
        referenceType: {
          in: ACCOUNT_INIT_CONFIG.map((item) => item.referenceType),
        },
      },
      select: { referenceType: true },
    }),
  ]);

  if (!user) return 0;

  const existingInitRefs = new Set(existingInitRows.map((row) => row.referenceType || ''));
  const nextBalances: UserBalances = { ...user };

  for (const item of ACCOUNT_INIT_CONFIG) {
    if (existingInitRefs.has(item.referenceType)) continue;

    const field = getBalanceField(item.accountType);
    const currentBalance = nextBalances[field];
    const grant = currentBalance > 0 ? 0 : item.defaultAmount;
    const balanceAfter = currentBalance + grant;

    if (grant > 0) {
      await db.user.update({
        where: { id: normalizedUserId },
        data: { [field]: balanceAfter },
      });
      nextBalances[field] = balanceAfter;
    }

    await db.creditTransaction.create({
      data: {
        userId: normalizedUserId,
        kind: CreditTransactionKind.WELCOME_BONUS,
        accountType: item.accountType,
        delta: grant,
        balanceAfter,
        description: grant > 0 ? item.descriptionWhenGranted : item.descriptionWhenEmpty,
        referenceType: item.referenceType,
      },
    });
  }

  return nextBalances.creditsBalance;
}

export async function applyCreditDelta(
  db: CreditDbClient,
  args: ApplyCreditDeltaArgs,
): Promise<number> {
  const userId = args.userId.trim();
  const accountType = args.accountType ?? 'CASH';
  if (!userId) throw new Error('Invalid user for credit transaction');

  await ensureUserCreditsInitialized(db, userId);

  const user = await loadUserBalances(db, userId);
  if (!user) throw new Error('User not found');

  const field = getBalanceField(accountType);
  const previousBalance = user[field];
  const nextBalance = previousBalance + args.delta;
  if (nextBalance < 0) {
    if (accountType === 'COMPUTE') throw new Error('算力积分不足，无法继续使用模型能力');
    if (accountType === 'PURCHASE') throw new Error('购买积分不足，无法继续购买课程或笔记本');
    throw new Error('积分不足，请先补充 credits');
  }

  await db.user.update({
    where: { id: userId },
    data: { [field]: nextBalance },
  });

  await db.creditTransaction.create({
    data: {
      userId,
      kind: args.kind,
      accountType,
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

export async function assertUserHasCredits(
  userId?: string | null,
  accountType: CreditAccountType = 'COMPUTE',
): Promise<void> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return;

  const prisma = getOptionalPrisma();
  if (!prisma) return;

  const balances = await getUserCreditBalances(prisma, normalizedUserId);
  if (getBalance(balances, accountType) > 0) return;

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
