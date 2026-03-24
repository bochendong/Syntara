import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

export async function GET() {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      summary: {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
      },
      rows: [],
    });
  }

  try {
    const [rows, aggregate] = await Promise.all([
      prisma.lLMUsageLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.lLMUsageLog.aggregate({
        _count: { id: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      }),
    ]);

    return apiSuccess({
      summary: {
        totalRequests: aggregate._count.id,
        totalInputTokens: aggregate._sum.inputTokens ?? 0,
        totalOutputTokens: aggregate._sum.outputTokens ?? 0,
        totalTokens: aggregate._sum.totalTokens ?? 0,
      },
      rows: rows.map((row: (typeof rows)[number]) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.userEmail,
        userName: row.userName,
        route: row.route,
        source: row.source,
        providerId: row.providerId,
        modelId: row.modelId,
        modelString: row.modelString,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
