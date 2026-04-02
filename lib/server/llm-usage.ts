import { createLogger } from '@/lib/logger';
import { chargeCreditsForTokenUsage } from '@/lib/server/credits';
import { getPrismaOrNull } from '@/lib/server/prisma-safe';

const log = createLogger('LLMUsage');

export interface LLMUsagePayload {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

function toInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export async function recordLLMUsage(payload: LLMUsagePayload): Promise<void> {
  const prisma = getPrismaOrNull();
  if (!prisma) return;

  try {
    const totalTokens =
      payload.totalTokens != null
        ? toInt(payload.totalTokens)
        : toInt(payload.inputTokens) + toInt(payload.outputTokens);

    if (!payload.userId?.trim()) {
      log.warn('Recording LLM usage without userId; credits charging will be skipped', {
        route: payload.route,
        source: payload.source,
        modelString: payload.modelString,
        totalTokens,
        userEmail: payload.userEmail ?? null,
      });
    } else if (payload.route.startsWith('/api/generate/')) {
      log.info('Recording generation LLM usage', {
        route: payload.route,
        source: payload.source,
        modelString: payload.modelString,
        totalTokens,
        userId: payload.userId,
      });
    }

    await prisma.lLMUsageLog.create({
      data: {
        userId: payload.userId || null,
        userEmail: payload.userEmail || null,
        userName: payload.userName || null,
        route: payload.route,
        source: payload.source,
        providerId: payload.providerId,
        modelId: payload.modelId,
        modelString: payload.modelString,
        inputTokens: toInt(payload.inputTokens),
        outputTokens: toInt(payload.outputTokens),
        totalTokens,
      },
    });

    await chargeCreditsForTokenUsage({
      userId: payload.userId,
      totalTokens,
      route: payload.route,
      source: payload.source,
      modelString: payload.modelString,
    });
  } catch (error) {
    log.warn('Failed to record LLM usage:', error);
  }
}
