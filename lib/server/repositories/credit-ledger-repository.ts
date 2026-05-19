import type { Prisma, CreditAccountType } from '@/lib/server/generated-prisma';
import { CreditTransactionKind } from '@/lib/server/generated-prisma';
import type { DbClient } from '@/lib/server/repositories/types';
import {
  DEFAULT_USER_CASH_CREDITS,
  DEFAULT_USER_COMPUTE_CREDITS,
  DEFAULT_USER_PURCHASE_CREDITS,
} from '@/lib/utils/credits';

export type BalanceField = 'creditsBalance' | 'computeCreditsBalance' | 'purchaseCreditsBalance';

export type UserCreditBalances = {
  creditsBalance: number;
  computeCreditsBalance: number;
  purchaseCreditsBalance: number;
};

export interface ApplyCreditDeltaArgs {
  userId: string;
  delta: number;
  kind: CreditTransactionKind;
  accountType?: CreditAccountType;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}

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

export function getCreditBalanceField(accountType: CreditAccountType): BalanceField {
  if (accountType === 'CASH') return 'creditsBalance';
  if (accountType === 'PURCHASE') return 'purchaseCreditsBalance';
  return 'computeCreditsBalance';
}

export function getCreditBalance(
  balances: UserCreditBalances,
  accountType: CreditAccountType,
): number {
  return balances[getCreditBalanceField(accountType)];
}

export async function loadUserCreditBalances(
  db: DbClient,
  userId: string,
): Promise<UserCreditBalances | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      creditsBalance: true,
      computeCreditsBalance: true,
      purchaseCreditsBalance: true,
    },
  });
}

export async function ensureCreditLedgerInitialized(db: DbClient, userId: string): Promise<number> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return 0;

  const [user, existingInitRows] = await Promise.all([
    loadUserCreditBalances(db, normalizedUserId),
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
  const nextBalances: UserCreditBalances = { ...user };

  for (const item of ACCOUNT_INIT_CONFIG) {
    if (existingInitRefs.has(item.referenceType)) continue;

    const field = getCreditBalanceField(item.accountType);
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

export async function getUserCreditBalances(
  db: DbClient,
  userId: string,
): Promise<UserCreditBalances> {
  await ensureCreditLedgerInitialized(db, userId);
  const balances = await loadUserCreditBalances(db, userId.trim());
  return (
    balances ?? {
      creditsBalance: 0,
      computeCreditsBalance: 0,
      purchaseCreditsBalance: 0,
    }
  );
}

function insufficientCreditError(accountType: CreditAccountType): Error {
  if (accountType === 'COMPUTE') return new Error('算力积分不足，无法继续使用模型能力');
  if (accountType === 'PURCHASE') return new Error('购买积分不足，无法继续购买课程或笔记本');
  return new Error('积分不足，请先补充 credits');
}

export async function applyCreditDelta(db: DbClient, args: ApplyCreditDeltaArgs): Promise<number> {
  const userId = args.userId.trim();
  const accountType = args.accountType ?? 'CASH';
  if (!userId) throw new Error('Invalid user for credit transaction');

  await ensureCreditLedgerInitialized(db, userId);

  const field = getCreditBalanceField(accountType);
  const delta = Math.round(args.delta);
  const result =
    delta < 0
      ? await db.user.updateMany({
          where: {
            id: userId,
            [field]: { gte: Math.abs(delta) },
          },
          data: {
            [field]: { decrement: Math.abs(delta) },
          },
        })
      : await db.user.updateMany({
          where: { id: userId },
          data: {
            [field]: { increment: delta },
          },
        });

  if (result.count === 0) {
    const existing = await loadUserCreditBalances(db, userId);
    if (!existing) throw new Error('User not found');
    if (delta < 0) throw insufficientCreditError(accountType);
    throw new Error('Credit balance update failed');
  }

  const balances = await loadUserCreditBalances(db, userId);
  if (!balances) throw new Error('User not found');
  const balanceAfter = getCreditBalance(balances, accountType);

  await db.creditTransaction.create({
    data: {
      userId,
      kind: args.kind,
      accountType,
      delta,
      balanceAfter,
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
    },
  });

  return balanceAfter;
}

export function countUserCreditTransactions(db: DbClient, userId: string) {
  return db.creditTransaction.count({
    where: { userId },
  });
}

export function listUserCreditTransactions(
  db: DbClient,
  args: {
    userId: string;
    skip: number;
    take: number;
  },
) {
  return db.creditTransaction.findMany({
    where: {
      userId: args.userId,
      accountType: {
        in: ['CASH', 'COMPUTE', 'PURCHASE'],
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: args.skip,
    take: args.take,
    select: {
      id: true,
      kind: true,
      accountType: true,
      delta: true,
      balanceAfter: true,
      description: true,
      createdAt: true,
    },
  });
}
