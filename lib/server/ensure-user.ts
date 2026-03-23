import { prisma } from '@/lib/server/prisma';

/**
 * 保证 User 表中存在该行，以满足 Course/Notebook 等 ownerId 外键。
 * NextAuth 用户通常已存在；客户端 zustand 用邮箱派生的 id（如 user-foo）时需在此补一行。
 */
export async function ensureUserForApi(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;

  await prisma.user.upsert({
    where: { id },
    create: { id },
    update: {},
  });
}
