import type Stripe from 'stripe';
import { CreditTransactionKind, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { applyCreditDelta } from '@/lib/server/credits';

type DbTx = PrismaClient | Prisma.TransactionClient;

function asJsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Prisma.JsonObject) };
}

export function extractStripeId(
  value: string | Stripe.PaymentIntent | Stripe.Customer | null,
): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.id;
}

/** Resolve top-up order id from Checkout Session (matches Stripe session creation). */
export function getTopUpOrderIdFromCheckoutSession(session: Stripe.Checkout.Session): string {
  const clientReferenceId = session.client_reference_id?.trim();
  if (clientReferenceId) return clientReferenceId;

  const metadataOrderId = session.metadata?.topUpOrderId?.trim();
  return metadataOrderId || '';
}

export type TopUpFulfillmentSource = 'stripe_webhook' | 'checkout_status_sync';

/**
 * Apply credits for a paid Checkout Session if the order is still pending.
 * Idempotent: if a credit row already exists for this order (`stripe_top_up` + order id), only repairs order state.
 */
export async function fulfillTopUpOrderFromCheckoutSession(
  tx: DbTx,
  session: Stripe.Checkout.Session,
  options: {
    stripeEventId?: string | null;
    fulfillmentSource: TopUpFulfillmentSource;
  },
): Promise<{ applied: boolean; reason?: string }> {
  const orderId = getTopUpOrderIdFromCheckoutSession(session);
  if (!orderId) {
    return { applied: false, reason: 'missing_order_id' };
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
    throw new Error(`Top-up order ${orderId} not found for Stripe session ${session.id}`);
  }

  const stripeCustomerId = extractStripeId(session.customer as string | Stripe.Customer | null);
  const stripePaymentIntentId = extractStripeId(
    session.payment_intent as string | Stripe.PaymentIntent | null,
  );

  const baseMetadata = asJsonObject(order.metadata);
  const nextMetadata: Prisma.InputJsonValue = {
    ...baseMetadata,
    checkoutSessionId: session.id,
    checkoutSessionStatus: session.status ?? null,
    paymentStatus: session.payment_status ?? null,
    ...(options.stripeEventId ? { stripeEventId: options.stripeEventId } : {}),
    fulfillmentSource: options.fulfillmentSource,
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
    return { applied: false, reason: 'already_fulfilled' };
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
    return { applied: false, reason: 'not_paid' };
  }

  const existingCredit = await tx.creditTransaction.findFirst({
    where: { referenceType: 'stripe_top_up', referenceId: order.id },
    select: { id: true },
  });

  if (existingCredit) {
    await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        status: 'fulfilled',
        fulfilledAt: order.fulfilledAt ?? new Date(),
        stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: stripePaymentIntentId || undefined,
        metadata: {
          ...(nextMetadata as Prisma.JsonObject),
          repairedFulfillment: true,
        },
      },
    });
    return { applied: false, reason: 'idempotent_skip' };
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
      stripeEventId: options.stripeEventId ?? null,
      fulfillmentSource: options.fulfillmentSource,
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

  return { applied: true };
}
