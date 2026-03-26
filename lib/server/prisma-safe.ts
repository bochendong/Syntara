export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isDatabaseAvailable(): boolean {
  return isDatabaseConfigured();
}

export function getOptionalPrisma() {
  if (!isDatabaseConfigured()) return null;
  const runtimeRequire = eval('require') as NodeRequire;
  const { prisma } = runtimeRequire('@/lib/server/prisma') as typeof import('@/lib/server/prisma');
  return prisma;
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
