import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  fulfillTopUpOrderFromCheckoutSession,
  getTopUpOrderIdFromCheckoutSession,
} from '@/lib/server/stripe-top-up-fulfillment';
import { getStripeClient, isStripeConfigured } from '@/lib/server/stripe';

const log = createLogger('TopUpCheckoutStatus');

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

  let order = await prisma.topUpOrder.findFirst({
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

  // Local / test: webhook 常未送达（未配置 stripe listen 或公网 URL），支付已成功但订单仍为 pending。
  // 主动向 Stripe 拉取 Session 并对账入账；与 webhook 共用幂等逻辑（creditTransaction.referenceId）。
  if (order.status !== 'fulfilled' && isStripeConfigured()) {
    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.id !== sessionId) {
        return apiError('INVALID_REQUEST', 400, 'Checkout Session 不匹配。');
      }
      const orderIdFromSession = getTopUpOrderIdFromCheckoutSession(session);
      if (orderIdFromSession !== order.id) {
        return apiError('INVALID_REQUEST', 400, '订单与 Checkout Session 不一致。');
      }
      const metaUserId = session.metadata?.userId?.trim();
      if (metaUserId && metaUserId !== auth.userId) {
        return apiError('INVALID_REQUEST', 403, '无权查询该支付会话。');
      }

      await prisma.$transaction(async (tx) => {
        await fulfillTopUpOrderFromCheckoutSession(tx, session, {
          fulfillmentSource: 'checkout_status_sync',
        });
      });

      order = await prisma.topUpOrder.findFirst({
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
        return apiError('INTERNAL_ERROR', 500, '对账后未找到订单。');
      }
    } catch (error) {
      log.warn('Stripe checkout status sync failed', {
        sessionId,
        userId: auth.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!order) {
    return apiError('INTERNAL_ERROR', 500, '订单不存在。');
  }

  return apiSuccess({
    order: {
      ...order,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    },
  });
}
