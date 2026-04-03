import type Stripe from 'stripe';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  fulfillTopUpOrderFromCheckoutSession,
  getTopUpOrderIdFromCheckoutSession,
} from '@/lib/server/stripe-top-up-fulfillment';
import {
  getStripeClient,
  getStripeWebhookSecret,
  isStripeConfigured,
  isStripeWebhookConfigured,
} from '@/lib/server/stripe';

const log = createLogger('StripeWebhook');

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return apiError('MISSING_API_KEY', 503, 'STRIPE_SECRET_KEY 未配置，无法验证 Stripe webhook。');
  }
  if (!isStripeWebhookConfigured()) {
    return apiError(
      'MISSING_API_KEY',
      503,
      'STRIPE_WEBHOOK_SECRET 未配置，无法验证 Stripe webhook。',
    );
  }

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, 'DATABASE_URL 未配置，无法处理 Stripe webhook。');
  }

  const signature = request.headers.get('stripe-signature')?.trim();
  if (!signature) {
    return apiError('INVALID_REQUEST', 400, '缺少 Stripe-Signature 请求头。');
  }

  const payload = await request.text();
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Stripe webhook 验签失败。',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (event.type !== 'checkout.session.completed') {
    return apiSuccess({ received: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = getTopUpOrderIdFromCheckoutSession(session);
  if (!orderId) {
    log.warn('Received checkout.session.completed without top-up order id', {
      stripeEventId: event.id,
      checkoutSessionId: session.id,
    });
    return apiSuccess({ received: true, ignored: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const inserted = await tx.stripeWebhookEvent.createMany({
        data: [
          {
            stripeEventId: event.id,
            eventType: event.type,
          },
        ],
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        return;
      }

      await fulfillTopUpOrderFromCheckoutSession(tx, session, {
        stripeEventId: event.id,
        fulfillmentSource: 'stripe_webhook',
      });
    });

    return apiSuccess({ received: true });
  } catch (error) {
    log.error('Failed to process Stripe checkout completion', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '处理 Stripe webhook 失败。',
    );
  }
}
