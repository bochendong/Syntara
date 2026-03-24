import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';
import { getOptionalPrisma, isDatabaseConfigured } from '@/lib/server/prisma-safe';

export interface AdminIdentity {
  userId: string;
  email?: string;
  name?: string;
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

  let user:
    | {
        role: 'USER' | 'ADMIN';
        email: string | null;
        name: string | null;
      }
    | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { role: true, email: true, name: true },
    });
  } catch {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 }),
    } as const;
  }

  if (user?.role === 'ADMIN' || isFallbackAdmin(identity)) {
    return {
      identity: {
        ...identity,
        email: user?.email || identity.email,
        name: user?.name || identity.name,
      },
    } as const;
  }

  return {
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
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

