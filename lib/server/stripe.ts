import Stripe from 'stripe';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import {
  STRIPE_TOP_UP_CHECKOUT_CURRENCY,
  getTopUpPackCheckoutAmount,
  type TopUpCurrency,
  type TopUpPack,
} from '@/lib/utils/top-up';

type StripeDbClient = PrismaClient | Prisma.TransactionClient;
type StripeUserSnapshot = Pick<User, 'id' | 'email' | 'name' | 'stripeCustomerId'>;

const log = createLogger('Stripe');
let stripeClient: Stripe | null = null;
let stripeClientKey = '';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || '';
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(getStripeWebhookSecret());
}

export function getStripeClient(): Stripe {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey);
    stripeClientKey = secretKey;
  }

  return stripeClient;
}

export function resolveAppBaseUrl(request: Request): string {
  const configuredUrl = process.env.NEXTAUTH_URL?.trim();
  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  return trimTrailingSlash(new URL(request.url).origin);
}

export function normalizeTopUpCurrency(raw: string | null | undefined): TopUpCurrency {
  const normalized = raw?.trim().toUpperCase();
  if (normalized === 'USD' || normalized === 'CAD' || normalized === 'CNY') {
    return normalized;
  }
  return STRIPE_TOP_UP_CHECKOUT_CURRENCY;
}

function extractStripeId(
  value: string | Stripe.Price | Stripe.Customer | null | undefined,
): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.id;
}

export async function ensureStripeCustomerForUser(
  db: StripeDbClient,
  stripe: Stripe,
  user: StripeUserSnapshot,
): Promise<string> {
  const existingCustomerId = user.stripeCustomerId?.trim();
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email?.trim() || undefined,
    name: user.name?.trim() || undefined,
    metadata: {
      appUserId: user.id,
    },
  });

  await db.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  log.info('Created Stripe customer for user', {
    userId: user.id,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

export async function ensureStripeTopUpPrice(
  db: StripeDbClient,
  stripe: Stripe,
  pack: TopUpPack,
  currency: TopUpCurrency,
) {
  const unitAmount = getTopUpPackCheckoutAmount(pack, currency);
  if (unitAmount == null) {
    throw new Error(`Unsupported top-up currency for Stripe checkout: ${currency}`);
  }

  const existing = await db.creditTopUpPrice.findUnique({
    where: {
      packId_currency: {
        packId: pack.id,
        currency,
      },
    },
  });

  if (
    existing &&
    existing.credits === pack.credits &&
    existing.unitAmount === unitAmount &&
    existing.active
  ) {
    return existing;
  }

  const product = await stripe.products.create({
    name: pack.checkoutName,
    description: pack.checkoutDescription,
    default_price_data: {
      currency: currency.toLowerCase(),
      unit_amount: unitAmount,
      metadata: {
        appPackId: pack.id,
        credits: String(pack.credits),
        currency,
      },
    },
    metadata: {
      appPackId: pack.id,
      credits: String(pack.credits),
      currency,
      purpose: 'syntara_top_up',
    },
  });

  const stripePriceId = extractStripeId(product.default_price);
  if (!stripePriceId) {
    throw new Error(`Stripe product ${product.id} was created without a default price`);
  }

  return db.creditTopUpPrice.upsert({
    where: {
      packId_currency: {
        packId: pack.id,
        currency,
      },
    },
    create: {
      packId: pack.id,
      currency,
      credits: pack.credits,
      unitAmount,
      stripeProductId: product.id,
      stripePriceId,
      active: true,
    },
    update: {
      credits: pack.credits,
      unitAmount,
      stripeProductId: product.id,
      stripePriceId,
      active: true,
    },
  });
}
