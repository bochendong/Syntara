import { createLogger } from '@/lib/logger';
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
        totalTokens:
          payload.totalTokens != null
            ? toInt(payload.totalTokens)
            : toInt(payload.inputTokens) + toInt(payload.outputTokens),
      },
    });
  } catch (error) {
    log.warn('Failed to record LLM usage:', error);
  }
}
