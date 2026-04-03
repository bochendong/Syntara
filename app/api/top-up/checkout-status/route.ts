import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, 'DATABASE_URL 未配置，无法查询充值状态。');
  }

  const sessionId = new URL(request.url).searchParams.get('sessionId')?.trim() || '';
  if (!sessionId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, '缺少 sessionId。');
  }

  const order = await prisma.topUpOrder.findFirst({
    where: {
      userId: auth.userId,
      stripeCheckoutSessionId: sessionId,
    },
    select: {
      id: true,
      packId: true,
      packTitle: true,
      credits: true,
      currency: true,
      amountTotal: true,
      status: true,
      fulfilledAt: true,
    },
  });

  if (!order) {
    return apiError('INVALID_REQUEST', 404, '未找到对应的充值订单。');
  }

  return apiSuccess({
    order: {
      ...order,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    },
  });
}
