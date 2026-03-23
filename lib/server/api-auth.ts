import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';

export async function requireUserId() {
  const session = await requireServerSession();
  const userId = session?.user?.id?.trim();
  if (userId) {
    await ensureUserForApi(userId);
    return { userId } as const;
  }

  // Temporary compatibility path: allow existing client-side auth store userId.
  const h = await headers();
  const fallbackUserId = h.get('x-user-id')?.trim();
  if (fallbackUserId) {
    await ensureUserForApi(fallbackUserId);
    return { userId: fallbackUserId } as const;
  }

  return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
}
