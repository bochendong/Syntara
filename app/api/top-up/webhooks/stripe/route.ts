import type Stripe from 'stripe';
import { CreditTransactionKind, Prisma } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { applyCreditDelta } from '@/lib/server/credits';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  getStripeClient,
  getStripeWebhookSecret,
  isStripeConfigured,
  isStripeWebhookConfigured,
} from '@/lib/server/stripe';

const log = createLogger('StripeWebhook');

export const runtime = 'nodejs';

function asJsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Prisma.JsonObject) };
}

function extractStripeId(value: string | Stripe.PaymentIntent | Stripe.Customer | null): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.id;
}

function getOrderIdFromSession(session: Stripe.Checkout.Session): string {
  const clientReferenceId = session.client_reference_id?.trim();
  if (clientReferenceId) return clientReferenceId;

  const metadataOrderId = session.metadata?.topUpOrderId?.trim();
  return metadataOrderId || '';
}

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
  const orderId = getOrderIdFromSession(session);
  if (!orderId) {
    log.warn('Received checkout.session.completed without top-up order id', {
      stripeEventId: event.id,
      checkoutSessionId: session.id,
    });
    return apiSuccess({ received: true, ignored: true });
  }

  const stripeCustomerId = extractStripeId(session.customer as string | Stripe.Customer | null);
  const stripePaymentIntentId = extractStripeId(
    session.payment_intent as string | Stripe.PaymentIntent | null,
  );

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

      const order = await tx.topUpOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          packId: true,
          packTitle: true,
          credits: true,
          currency: true,
          amountTotal: true,
          status: true,
          fulfilledAt: true,
          stripeCustomerId: true,
          metadata: true,
        },
      });

      if (!order) {
        throw new Error(`Top-up order ${orderId} not found for Stripe event ${event.id}`);
      }

      const baseMetadata = asJsonObject(order.metadata);
      const nextMetadata: Prisma.InputJsonValue = {
        ...baseMetadata,
        checkoutSessionId: session.id,
        checkoutSessionStatus: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        stripeEventId: event.id,
      };

      if (stripeCustomerId) {
        await tx.user.update({
          where: { id: order.userId },
          data: { stripeCustomerId },
        });
      }

      if (order.fulfilledAt || order.status === 'fulfilled') {
        await tx.topUpOrder.update({
          where: { id: order.id },
          data: {
            stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: stripePaymentIntentId || undefined,
            metadata: nextMetadata,
          },
        });
        return;
      }

      if (session.payment_status !== 'paid') {
        await tx.topUpOrder.update({
          where: { id: order.id },
          data: {
            status: session.status === 'expired' ? 'expired' : 'pending',
            stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: stripePaymentIntentId || undefined,
            metadata: nextMetadata,
          },
        });
        return;
      }

      const nextBalance = await applyCreditDelta(tx, {
        userId: order.userId,
        delta: order.credits,
        kind: CreditTransactionKind.WELCOME_BONUS,
        description: `Stripe top-up: ${order.packTitle}`,
        referenceType: 'stripe_top_up',
        referenceId: order.id,
        metadata: {
          amountTotal: order.amountTotal,
          checkoutSessionId: session.id,
          credits: order.credits,
          currency: order.currency,
          packId: order.packId,
          packTitle: order.packTitle,
          paymentIntentId: stripePaymentIntentId || null,
          stripeCustomerId: stripeCustomerId || null,
          stripeEventId: event.id,
        },
      });

      await tx.topUpOrder.update({
        where: { id: order.id },
        data: {
          status: 'fulfilled',
          fulfilledAt: new Date(),
          stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: stripePaymentIntentId || undefined,
          metadata: {
            ...(nextMetadata as Prisma.JsonObject),
            balanceAfterFulfillment: nextBalance,
          },
        },
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
