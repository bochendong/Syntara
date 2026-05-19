import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  DEFAULT_USER_CASH_CREDITS,
  DEFAULT_USER_COMPUTE_CREDITS,
  DEFAULT_USER_PURCHASE_CREDITS,
} from '@/lib/utils/credits';
import { ensureUserCreditsInitialized, getUserCreditBalances } from '@/lib/server/credits';
import {
  countUserCreditTransactions,
  listUserCreditTransactions,
} from '@/lib/server/repositories/credit-ledger-repository';

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const url = new URL(request.url);
  const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSizeRaw = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE),
  );

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      balance: DEFAULT_USER_CASH_CREDITS,
      balances: {
        cash: DEFAULT_USER_CASH_CREDITS,
        compute: DEFAULT_USER_COMPUTE_CREDITS,
        purchase: DEFAULT_USER_PURCHASE_CREDITS,
      },
      recentTransactions: [],
      pagination: {
        page: 1,
        pageSize,
        totalCount: 0,
        totalPages: 1,
      },
    });
  }

  await ensureUserCreditsInitialized(prisma, auth.userId);

  const transactionTotal = await countUserCreditTransactions(prisma, auth.userId);
  const totalPages = Math.max(1, Math.ceil(transactionTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;

  const [balances, recentTransactions] = await Promise.all([
    getUserCreditBalances(prisma, auth.userId),
    listUserCreditTransactions(prisma, {
      userId: auth.userId,
      skip,
      take: pageSize,
    }),
  ]);

  return apiSuccess({
    databaseEnabled: true,
    balance: balances.creditsBalance,
    balances: {
      cash: balances.creditsBalance,
      compute: balances.computeCreditsBalance,
      purchase: balances.purchaseCreditsBalance,
    },
    recentTransactions: recentTransactions.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      page: safePage,
      pageSize,
      totalCount: transactionTotal,
      totalPages,
    },
  });
}
