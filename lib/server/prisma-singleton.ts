import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var -- reused across HMR in dev
  var __openmaicPrisma__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __openmaicPrismaUrl__: string | undefined;
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
    if (global.__openmaicPrisma__ && global.__openmaicPrismaUrl__ !== url) {
      void global.__openmaicPrisma__.$disconnect().catch(() => {});
      global.__openmaicPrisma__ = undefined;
    }
    global.__openmaicPrismaUrl__ = url;
  }

  if (!global.__openmaicPrisma__) {
    global.__openmaicPrisma__ = createClient(url);
  }
  return global.__openmaicPrisma__;
}
