import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { DEFAULT_USER_CREDITS } from '@/lib/utils/credits';
import { ensureUserCreditsInitialized } from '@/lib/server/credits';

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
      balance: DEFAULT_USER_CREDITS,
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

  const transactionTotal = await prisma.creditTransaction.count({
    where: { userId: auth.userId },
  });
  const totalPages = Math.max(1, Math.ceil(transactionTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;

  const [user, recentTransactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { creditsBalance: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        delta: true,
        balanceAfter: true,
        description: true,
        createdAt: true,
      },
    }),
  ]);

  return apiSuccess({
    databaseEnabled: true,
    balance: user?.creditsBalance ?? DEFAULT_USER_CREDITS,
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
