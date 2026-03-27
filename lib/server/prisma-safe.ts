import { getOrCreatePrisma } from '@/lib/server/prisma-singleton';

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isDatabaseAvailable(): boolean {
  return isDatabaseConfigured();
}

/**
 * 仅 DATABASE_URL 已配置时创建客户端。不用 runtime require('@/…')，避免 Node 无法解析路径别名。
 */
export function getOptionalPrisma() {
  if (!isDatabaseConfigured()) return null;
  return getOrCreatePrisma();
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
