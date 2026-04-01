import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { listUserNotifications } from '@/lib/server/notifications';

function resolveLimit(request: Request): number {
  const { searchParams } = new URL(request.url);
  const raw = Number.parseInt(searchParams.get('limit') || '', 10);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(1, Math.min(raw, 100));
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      notifications: [],
    });
  }

  const notifications = await listUserNotifications(prisma, auth.userId, resolveLimit(request));

  return apiSuccess({
    databaseEnabled: true,
    notifications,
  });
}
