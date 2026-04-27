import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  buildGamificationDisabledSummary,
  logGamificationError,
  unlockProfileCosmetic,
} from '@/lib/server/gamification';

const bodySchema = z.object({
  cosmeticKey: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  let body: { cosmeticKey: string };
  try {
    body = bodySchema.parse(await request.json());
  } catch (error) {
    return apiError('INVALID_REQUEST', 400, error instanceof Error ? error.message : '请求体无效');
  }

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({ ...buildGamificationDisabledSummary() });
  }

  try {
    const summary = await prisma.$transaction((tx) =>
      unlockProfileCosmetic(tx, auth.userId, body.cosmeticKey),
    );
    return apiSuccess({ ...summary });
  } catch (error) {
    logGamificationError('Failed to unlock profile cosmetic', error);
    return apiError('INVALID_REQUEST', 400, error instanceof Error ? error.message : '解锁失败');
  }
}
