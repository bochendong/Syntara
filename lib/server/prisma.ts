import { getOrCreatePrisma } from '@/lib/server/prisma-singleton';

export { getOrCreatePrisma } from '@/lib/server/prisma-singleton';

/** 导入此模块即初始化 Prisma（需 DATABASE_URL）；无库场景请用 prisma-safe */
export const prisma = getOrCreatePrisma();
