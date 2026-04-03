import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  ensureStripeCustomerForUser,
  ensureStripeTopUpPrice,
  getStripeClient,
  isStripeConfigured,
  isStripeWebhookConfigured,
  normalizeTopUpCurrency,
  resolveAppBaseUrl,
} from '@/lib/server/stripe';
import {
  STRIPE_TOP_UP_CHECKOUT_CURRENCY,
  getTopUpPackById,
  getTopUpPackCheckoutAmount,
} from '@/lib/utils/top-up';

const log = createLogger('CreateTopUpCheckoutSession');

type CreateCheckoutSessionBody = {
  packId?: string;
  currency?: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  if (!isStripeConfigured()) {
    return apiError('MISSING_API_KEY', 503, 'STRIPE_SECRET_KEY 未配置，无法创建 Stripe Checkout。');
  }
  if (!isStripeWebhookConfigured()) {
    return apiError('MISSING_API_KEY', 503, 'STRIPE_WEBHOOK_SECRET 未配置，无法安全处理支付结果。');
  }

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, 'DATABASE_URL 未配置，无法持久化充值订单与积分。');
  }

  let body: CreateCheckoutSessionBody;
  try {
    body = (await request.json()) as CreateCheckoutSessionBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, '请求体不是有效 JSON。');
  }

  const packId = body.packId?.trim() || '';
  const currency = normalizeTopUpCurrency(body.currency);
  const pack = getTopUpPackById(packId);
  if (!pack) {
    return apiError('INVALID_REQUEST', 400, '无效的充值档位。');
  }
  if (getTopUpPackCheckoutAmount(pack, currency) == null) {
    return apiError(
      'INVALID_REQUEST',
      400,
      `当前仅支持 ${STRIPE_TOP_UP_CHECKOUT_CURRENCY} 结账，请切换后重试。`,
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });
    if (!user) {
      return apiError('INTERNAL_ERROR', 404, '未找到当前用户。');
    }

    const stripe = getStripeClient();
    const [customerId, catalogPrice] = await Promise.all([
      ensureStripeCustomerForUser(prisma, stripe, user),
      ensureStripeTopUpPrice(prisma, stripe, pack, currency),
    ]);

    const order = await prisma.topUpOrder.create({
      data: {
        userId: auth.userId,
        packId: pack.id,
        packTitle: pack.checkoutName,
        credits: pack.credits,
        currency,
        amountTotal: catalogPrice.unitAmount,
        stripeCustomerId: customerId,
        stripeProductId: catalogPrice.stripeProductId,
        stripePriceId: catalogPrice.stripePriceId,
        metadata: {
          checkoutDescription: pack.checkoutDescription,
          displayTitle: pack.title,
          highlight: pack.highlight ?? null,
        },
      },
    });

    const appBaseUrl = resolveAppBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: catalogPrice.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      client_reference_id: order.id,
      success_url: `${appBaseUrl}/top-up?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/top-up?checkout=cancelled`,
      metadata: {
        topUpOrderId: order.id,
        userId: auth.userId,
        packId: pack.id,
        credits: String(pack.credits),
        currency,
      },
      payment_intent_data: {
        metadata: {
          topUpOrderId: order.id,
          userId: auth.userId,
          packId: pack.id,
          credits: String(pack.credits),
          currency,
        },
      },
    });

    if (!session.url) {
      return apiError('UPSTREAM_ERROR', 502, 'Stripe 未返回可跳转的 Checkout URL。');
    }

    await prisma.topUpOrder.update({
      where: { id: order.id },
      data: {
        stripeCheckoutSessionId: session.id,
      },
    });

    return apiSuccess({
      orderId: order.id,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    log.error('Failed to create Stripe checkout session', error);
    return apiError(
      'UPSTREAM_ERROR',
      502,
      error instanceof Error ? error.message : '创建 Stripe Checkout 失败。',
    );
  }
}
