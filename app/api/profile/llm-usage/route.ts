import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

const TREND_DAYS = 14;

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

type DailyTrendRow = {
  date: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  topModel: string | null;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildEmptySummary(): UsageSummary {
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
  };
}

function buildDateWindow(days: number): string[] {
  const result: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - offset);
    result.push(toDateKey(d));
  }
  return result;
}

export async function GET() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      summary: buildEmptySummary(),
      modelBreakdown: [] as ModelBreakdownRow[],
      dailyTrend: buildDateWindow(TREND_DAYS).map(
        (date): DailyTrendRow => ({
          date,
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          topModel: null,
        }),
      ),
    });
  }

  const userId = auth.userId;
  const trendStart = new Date();
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));

  const [aggregate, usageRows] = await Promise.all([
    prisma.lLMUsageLog.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    }),
    prisma.lLMUsageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        modelString: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        createdAt: true,
      },
    }),
  ]);

  const modelMap = new Map<string, ModelBreakdownRow>();
  const trendMap = new Map<
    string,
    DailyTrendRow & {
      modelTotals: Map<string, number>;
    }
  >();

  for (const row of usageRows) {
    const modelRow = modelMap.get(row.modelString) ?? {
      modelString: row.modelString,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    modelRow.requestCount += 1;
    modelRow.inputTokens += row.inputTokens;
    modelRow.outputTokens += row.outputTokens;
    modelRow.totalTokens += row.totalTokens;
    modelMap.set(row.modelString, modelRow);

    if (row.createdAt >= trendStart) {
      const dateKey = toDateKey(row.createdAt);
      const trendRow = trendMap.get(dateKey) ?? {
        date: dateKey,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        topModel: null,
        modelTotals: new Map<string, number>(),
      };
      trendRow.requestCount += 1;
      trendRow.inputTokens += row.inputTokens;
      trendRow.outputTokens += row.outputTokens;
      trendRow.totalTokens += row.totalTokens;
      trendRow.modelTotals.set(
        row.modelString,
        (trendRow.modelTotals.get(row.modelString) ?? 0) + row.totalTokens,
      );
      trendMap.set(dateKey, trendRow);
    }
  }

  const dailyTrend = buildDateWindow(TREND_DAYS).map((date): DailyTrendRow => {
    const row = trendMap.get(date);
    if (!row) {
      return {
        date,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        topModel: null,
      };
    }
    let topModel: string | null = null;
    let topTokens = -1;
    for (const [modelString, totalTokens] of row.modelTotals.entries()) {
      if (totalTokens > topTokens) {
        topTokens = totalTokens;
        topModel = modelString;
      }
    }
    return {
      date: row.date,
      requestCount: row.requestCount,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      topModel,
    };
  });

  return apiSuccess({
    databaseEnabled: true,
    summary: {
      totalCalls: aggregate._count.id,
      totalInputTokens: aggregate._sum.inputTokens ?? 0,
      totalOutputTokens: aggregate._sum.outputTokens ?? 0,
      totalTokens: aggregate._sum.totalTokens ?? 0,
    },
    modelBreakdown: Array.from(modelMap.values()).sort((a, b) => {
      if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
      return b.requestCount - a.requestCount;
    }),
    dailyTrend,
  });
}
