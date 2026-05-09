import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { ensureUserCreditsInitialized } from '@/lib/server/credits';

const log = createLogger('EnsureUser');
const ENSURE_USER_CACHE_TTL_MS = 60_000;

const ensureUserCache = new Map<string, { expiresAt: number; resolvedUserId: string }>();
const ensureUserInflight = new Map<string, Promise<string | undefined>>();

export interface EnsureUserPayload {
  userId: string;
  email?: string | null;
  name?: string | null;
}

function ensureUserCacheKey(payload: {
  userId: string;
  email?: string | null;
  name?: string | null;
}): string {
  return JSON.stringify([payload.userId, payload.email ?? '', payload.name ?? '']);
}

async function ensureUserForApiUncached(normalized: {
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<string | undefined> {
  const id = normalized.userId.trim();
  if (!id) return;

  const prisma = getOptionalPrisma();
  if (!prisma) return id;

  try {
    const normalizedEmail = normalized.email?.toLowerCase() || null;
    if (normalizedEmail) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, name: true },
      });
      if (existingByEmail?.id) {
        if (normalized.name && normalized.name !== existingByEmail.name) {
          await prisma.user.update({
            where: { id: existingByEmail.id },
            data: { name: normalized.name },
          });
        }
        await ensureUserCreditsInitialized(prisma, existingByEmail.id);
        return existingByEmail.id;
      }
    }

    await prisma.user.upsert({
      where: { id },
      create: {
        id,
        email: normalizedEmail,
        name: normalized.name,
      },
      update: {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalized.name ? { name: normalized.name } : {}),
      },
    });
    await ensureUserCreditsInitialized(prisma, id);
    return id;
  } catch (error) {
    if (normalized.email) {
      try {
        const existingByEmail = await prisma.user.findUnique({
          where: { email: normalized.email.toLowerCase() },
          select: { id: true },
        });
        if (existingByEmail?.id) {
          await ensureUserCreditsInitialized(prisma, existingByEmail.id);
          return existingByEmail.id;
        }
      } catch {
        // fall through to warning below
      }
    }
    // 在无数据库或数据库暂不可用的本地优先模式下，不应让整个请求链路直接失败。
    log.warn('Failed to ensure user in database:', error);
    return id;
  }
}

/**
 * 保证 User 表中存在该行，以满足 Course/Notebook 等 ownerId 外键。
 * NextAuth 用户通常已存在；客户端 zustand 用邮箱派生的 id（如 user-foo）时需在此补一行。
 */
export async function ensureUserForApi(
  payload: string | EnsureUserPayload,
): Promise<string | undefined> {
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

  const key = ensureUserCacheKey(normalized);
  const cached = ensureUserCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.resolvedUserId;
  }

  const existingTask = ensureUserInflight.get(key);
  if (existingTask) return existingTask;

  const task = ensureUserForApiUncached(normalized).then((resolvedUserId) => {
    if (resolvedUserId) {
      ensureUserCache.set(key, {
        expiresAt: Date.now() + ENSURE_USER_CACHE_TTL_MS,
        resolvedUserId,
      });
    }
    return resolvedUserId;
  });
  ensureUserInflight.set(key, task);
  try {
    return await task;
  } finally {
    ensureUserInflight.delete(key);
  }
}
