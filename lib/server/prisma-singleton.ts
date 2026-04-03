import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var -- reused across HMR in dev
  var __synatraPrisma__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __synatraPrismaUrl__: string | undefined;
}

function requireDatabaseUrl(): string {
  const u = process.env.DATABASE_URL?.trim();
  if (!u) {
    throw new Error(
      'DATABASE_URL 未设置：请在 .env.local 中配置 PostgreSQL；若刚修改过，请停止所有 pnpm dev，删除 .next 后再启动。',
    );
  }
  return u;
}

function createClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });
}

/** 惰性创建全局 PrismaClient（需已配置 DATABASE_URL） */
export function getOrCreatePrisma(): PrismaClient {
  const url = requireDatabaseUrl();

  // 开发时 HMR 可能让模块重载，但 global 上仍挂着「旧连接串」下创建的 Client，导致
  // `User was denied access on the database (not available)` 等异常；URL 变化则重建。
  if (process.env.NODE_ENV !== 'production') {
    if (global.__synatraPrisma__ && global.__synatraPrismaUrl__ !== url) {
      void global.__synatraPrisma__.$disconnect().catch(() => {});
      global.__synatraPrisma__ = undefined;
    }
    global.__synatraPrismaUrl__ = url;
  }

  if (!global.__synatraPrisma__) {
    global.__synatraPrisma__ = createClient(url);
  }
  return global.__synatraPrisma__;
}
