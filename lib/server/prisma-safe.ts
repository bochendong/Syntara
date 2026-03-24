import { prisma } from '@/lib/server/prisma';

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isDatabaseAvailable(): boolean {
  return isDatabaseConfigured();
}

export function getOptionalPrisma() {
  return isDatabaseConfigured() ? prisma : null;
}

export function getPrismaOrNull() {
  return getOptionalPrisma();
}

export function getPrismaSafely() {
  return getOptionalPrisma();
}

export async function withPrismaSafely<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    return await fn();
  } catch (error) {
    console.warn('[prisma-safe] database operation failed', error);
    return null;
  }
}

export { prisma };
