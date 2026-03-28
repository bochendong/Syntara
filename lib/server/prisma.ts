import type { PrismaClient } from '@prisma/client';
import { getOrCreatePrisma } from '@/lib/server/prisma-singleton';

export { getOrCreatePrisma } from '@/lib/server/prisma-singleton';

let prismaSingleton: PrismaClient | undefined;

function getPrismaInstance(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = getOrCreatePrisma();
  }
  return prismaSingleton;
}

/**
 * Lazily initialized Prisma client.
 * Importing this module does not read DATABASE_URL — only the first property access does.
 * This allows `next build` without DATABASE_URL; runtime API routes still require it when used.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaInstance();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
