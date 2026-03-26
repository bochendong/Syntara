import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

const log = createLogger('EnsureUser');

export interface EnsureUserPayload {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * 保证 User 表中存在该行，以满足 Course/Notebook 等 ownerId 外键。
 * NextAuth 用户通常已存在；客户端 zustand 用邮箱派生的 id（如 user-foo）时需在此补一行。
 */
export async function ensureUserForApi(payload: string | EnsureUserPayload): Promise<void> {
  const normalized =
    typeof payload === 'string'
      ? { userId: payload }
      : {
          userId: payload.userId,
          email: payload.email?.trim() || null,
          name: payload.name?.trim() || null,
        };

  const id = normalized.userId.trim();
  if (!id) return;

  const prisma = getOptionalPrisma();
  if (!prisma) return;

  try {
    await prisma.user.upsert({
      where: { id },
      create: {
        id,
        email: normalized.email,
        name: normalized.name,
      },
      update: {
        ...(normalized.email ? { email: normalized.email } : {}),
        ...(normalized.name ? { name: normalized.name } : {}),
      },
    });
  } catch (error) {
    // 在无数据库或数据库暂不可用的本地优先模式下，不应让整个请求链路直接失败。
    log.warn('Failed to ensure user in database:', error);
  }
}
