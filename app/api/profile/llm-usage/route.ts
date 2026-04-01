import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

const DEFAULT_RECORDS_PAGE_SIZE = 8;
const MAX_RECORDS_PAGE_SIZE = 50;

const usageRecordSelect = {
  id: true,
  route: true,
  source: true,
  providerId: true,
  modelId: true,
  modelString: true,
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  createdAt: true,
} as const;

type UsageSummary = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

type ModelBreakdownRow = {
  modelString: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageRecordRow = {
  id: string;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
};

function buildEmptySummary(): UsageSummary {
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
  };
}

function mapUsageRow(row: {
  id: string;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: Date;
}): UsageRecordRow {
  return {
    id: row.id,
    route: row.route,
    source: row.source,
    providerId: row.providerId,
    modelId: row.modelId,
    modelString: row.modelString,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const url = new URL(request.url);
  const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSizeRaw = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_RECORDS_PAGE_SIZE), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSize = Math.min(
    MAX_RECORDS_PAGE_SIZE,
    Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : DEFAULT_RECORDS_PAGE_SIZE),
  );

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      summary: buildEmptySummary(),
      modelBreakdown: [] as ModelBreakdownRow[],
      usageRecords: [] as UsageRecordRow[],
      latestRecord: null as UsageRecordRow | null,
      pagination: {
        page: 1,
        pageSize,
        totalCount: 0,
        totalPages: 1,
      },
    });
  }

  const userId = auth.userId;

  const [aggregate, modelGroups, recordsTotal, latestRow] = await Promise.all([
    prisma.lLMUsageLog.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    }),
    prisma.lLMUsageLog.groupBy({
      by: ['modelString'],
      where: { userId },
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    }),
    prisma.lLMUsageLog.count({ where: { userId } }),
    prisma.lLMUsageLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: usageRecordSelect,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(recordsTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;

  const recordsPage = await prisma.lLMUsageLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip,
    take: pageSize,
    select: usageRecordSelect,
  });

  const modelBreakdown: ModelBreakdownRow[] = modelGroups
    .map((g) => ({
      modelString: g.modelString,
      requestCount: g._count.id,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      totalTokens: g._sum.totalTokens ?? 0,
    }))
    .sort((a, b) => {
      if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
      return b.requestCount - a.requestCount;
    });

  return apiSuccess({
    databaseEnabled: true,
    summary: {
      totalCalls: aggregate._count.id,
      totalInputTokens: aggregate._sum.inputTokens ?? 0,
      totalOutputTokens: aggregate._sum.outputTokens ?? 0,
      totalTokens: aggregate._sum.totalTokens ?? 0,
    },
    modelBreakdown,
    usageRecords: recordsPage.map(mapUsageRow),
    latestRecord: latestRow ? mapUsageRow(latestRow) : null,
    pagination: {
      page: safePage,
      pageSize,
      totalCount: recordsTotal,
      totalPages,
    },
  });
}
