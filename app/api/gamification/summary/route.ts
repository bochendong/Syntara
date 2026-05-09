import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  buildGamificationDisabledSummary,
  getGamificationSummary,
  logGamificationError,
} from '@/lib/server/gamification';
import type { GamificationSummaryResponse } from '@/lib/types/gamification';

const SUMMARY_CACHE_TTL_MS = 15_000;
const summaryCache = new Map<string, { expiresAt: number; summary: GamificationSummaryResponse }>();
const summaryInflight = new Map<string, Promise<GamificationSummaryResponse>>();

export async function GET() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({ ...buildGamificationDisabledSummary() });
  }

  try {
    const cached = summaryCache.get(auth.userId);
    if (cached && cached.expiresAt > Date.now()) {
      return apiSuccess({ ...cached.summary });
    }

    const existingTask = summaryInflight.get(auth.userId);
    const task =
      existingTask ??
      getGamificationSummary(prisma, auth.userId).then((summary) => {
        summaryCache.set(auth.userId, {
          expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
          summary,
        });
        return summary;
      });

    if (!existingTask) {
      summaryInflight.set(auth.userId, task);
    }

    const summary = await task;
    summaryInflight.delete(auth.userId);
    return apiSuccess({ ...summary });
  } catch (error) {
    summaryInflight.delete(auth.userId);
    logGamificationError('Failed to load gamification summary', error);
    return apiSuccess({ ...buildGamificationDisabledSummary() });
  }
}
