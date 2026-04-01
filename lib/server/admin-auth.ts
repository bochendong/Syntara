import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';
import { getOptionalPrisma, isDatabaseConfigured } from '@/lib/server/prisma-safe';

export interface AdminIdentity {
  userId: string;
  email?: string;
  name?: string;
}

export const ADMIN_SESSION_COOKIE = 'openmaic-admin-session';

function buildFallbackUserId(email: string): string {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `admin-${safe || 'anonymous'}`;
}

function getAdminLoginConfig() {
  const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase() || '';
  const password = process.env.ADMIN_LOGIN_PASSWORD?.trim() || '';
  const secret =
    process.env.ADMIN_LOGIN_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.ADMIN_LOGIN_PASSWORD?.trim() ||
    '';
  return {
    enabled: Boolean(email && password && secret),
    email,
    password,
    secret,
  };
}

export function isAdminLoginConfigured(): boolean {
  return getAdminLoginConfig().enabled;
}

function safeEqualStrings(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function createAdminSessionToken(email: string, secret: string): string {
  const payload = JSON.stringify({
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
): { email: string; exp: number } | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqualStrings(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    const email = parsed.email?.trim().toLowerCase() || '';
    const exp = typeof parsed.exp === 'number' ? parsed.exp : 0;
    if (!email || !exp || exp < Date.now()) return null;
    return { email, exp };
  } catch {
    return null;
  }
}

export async function resolveAdminLoginIdentity(): Promise<AdminIdentity | null> {
  const config = getAdminLoginConfig();
  if (!config.enabled) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token, config.secret);
  if (!session || session.email !== config.email) return null;

  const prisma = getOptionalPrisma();
  if (prisma) {
    try {
      const user = await prisma.user.findFirst({
        where: { email: session.email },
        select: { id: true, email: true, name: true },
      });
      if (user?.id) {
        return {
          userId: user.id,
          email: user.email ?? session.email,
          name: user.name ?? 'Admin',
        };
      }
    } catch {
      // fall through to synthetic identity
    }
  }

  return {
    userId: buildFallbackUserId(session.email),
    email: session.email,
    name: 'Admin',
  };
}

export function issueAdminSessionCookie(email: string): string | null {
  const config = getAdminLoginConfig();
  if (!config.enabled) return null;
  const normalized = email.trim().toLowerCase();
  if (normalized !== config.email) return null;
  return createAdminSessionToken(normalized, config.secret);
}

export function validateAdminLogin(email: string, password: string): boolean {
  const config = getAdminLoginConfig();
  if (!config.enabled) return false;
  const normalized = email.trim().toLowerCase();
  return normalized === config.email && safeEqualStrings(password.trim(), config.password);
}

function fallbackAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function fallbackAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isFallbackAdmin(identity: AdminIdentity): boolean {
  const email = identity.email?.trim().toLowerCase();
  const adminEmails = fallbackAdminEmails();
  const adminIds = fallbackAdminIds();
  return Boolean((email && adminEmails.includes(email)) || adminIds.includes(identity.userId));
}

async function resolveIdentity(): Promise<AdminIdentity | null> {
  const cookieIdentity = await resolveAdminLoginIdentity();
  if (cookieIdentity) {
    return cookieIdentity;
  }

  const session = await requireServerSession();
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    await ensureUserForApi(sessionUserId);
    return {
      userId: sessionUserId,
      email: session?.user?.email?.trim().toLowerCase() || undefined,
      name: session?.user?.name?.trim() || undefined,
    };
  }

  const h = await headers();
  const userId = h.get('x-user-id')?.trim();
  if (!userId) return null;

  await ensureUserForApi(userId);
  return {
    userId,
    email: h.get('x-user-email')?.trim().toLowerCase() || undefined,
    name: h.get('x-user-name')?.trim() || undefined,
  };
}

export async function requireAdmin() {
  const identity = await resolveIdentity();
  if (!identity) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }

  if (!isDatabaseConfigured()) {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json(
        { error: 'Admin access requires DATABASE_URL or ADMIN_EMAILS/ADMIN_USER_IDS.' },
        { status: 403 },
      ),
    } as const;
  }

  const prisma = getOptionalPrisma();
  if (!prisma) {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 }),
    } as const;
  }

  let emailFromDb: string | null = null;
  let nameFromDb: string | null = null;
  let dbRole: string | null = null;
  try {
    const profile = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { email: true, name: true },
    });
    emailFromDb = profile?.email ?? null;
    nameFromDb = profile?.name ?? null;
  } catch {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 }),
    } as const;
  }

  try {
    // 与 findUnique 分开：数据库若尚未执行含 role 的迁移，此处失败则仅跳过 DB 角色判定。
    const roleRows = await prisma.$queryRaw<Array<{ role: string }>>(
      Prisma.sql`SELECT role::text AS "role" FROM "User" WHERE id = ${identity.userId} LIMIT 1`,
    );
    dbRole = roleRows[0]?.role ?? null;
  } catch {
    dbRole = null;
  }

  const resolvedIdentity: AdminIdentity = {
    ...identity,
    email: emailFromDb || identity.email,
    name: nameFromDb || identity.name,
  };

  if (dbRole === 'ADMIN' || isFallbackAdmin(resolvedIdentity)) {
    return {
      identity: resolvedIdentity,
    } as const;
  }

  return {
    response: NextResponse.json(
      {
        error:
          'Forbidden. Add your login email to ADMIN_EMAILS on Railway, or set this user role to ADMIN in the database.',
      },
      { status: 403 },
    ),
  } as const;
}

export async function requireResolvedUser() {
  const identity = await resolveIdentity();
  if (!identity) return null;
  return {
    id: identity.userId,
    email: identity.email,
    name: identity.name,
  };
}
