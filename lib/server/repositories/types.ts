import type { Prisma, PrismaClient } from '@/lib/server/generated-prisma';

export type DbClient = PrismaClient | Prisma.TransactionClient;
export type RootDbClient = PrismaClient;
