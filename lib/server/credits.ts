import type { Prisma, PrismaClient } from '@prisma/client';
import { CreditTransactionKind } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { DEFAULT_USER_CREDITS, creditsFromTokenUsage } from '@/lib/utils/credits';

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
  totalTokens?: number | null;
  route?: string | null;
  source?: string | null;
  modelString?: string | null;
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

  const requestedCreditsCost = creditsFromTokenUsage(args.totalTokens);
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

  const prisma = getOptionalPrisma();
  if (!prisma) return;

  await prisma.$transaction(async (tx) => {
    const currentBalance = await ensureUserCreditsInitialized(tx, userId);
    const creditsCost = Math.min(currentBalance, requestedCreditsCost);
    if (creditsCost <= 0) {
      if (args.route?.startsWith('/api/generate/')) {
        log.warn('Generation credits charge resolved to zero because balance is empty', {
          userId,
          route: args.route ?? null,
          source: args.source ?? null,
          totalTokens: args.totalTokens ?? 0,
          requestedCreditsCost,
          currentBalance,
        });
      }
      return;
    }

    await applyCreditDelta(tx, {
      userId,
      delta: -creditsCost,
      kind: CreditTransactionKind.TOKEN_USAGE,
      description: `LLM usage charge: ${creditsCost} credits`,
      referenceType: 'llm_usage',
      referenceId: args.route?.trim() || undefined,
      metadata: {
        totalTokens: args.totalTokens ?? 0,
        route: args.route ?? null,
        source: args.source ?? null,
        modelString: args.modelString ?? null,
      },
    });

    if (args.route?.startsWith('/api/generate/')) {
      log.info('Charged credits for generation usage', {
        userId,
        route: args.route ?? null,
        source: args.source ?? null,
        modelString: args.modelString ?? null,
        totalTokens: args.totalTokens ?? 0,
        requestedCreditsCost,
        chargedCredits: creditsCost,
        previousBalance: currentBalance,
        nextBalance: currentBalance - creditsCost,
      });
    }
  });
}
