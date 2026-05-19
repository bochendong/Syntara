import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

export async function handleNotificationFeedRequest() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      notifications: [],
    });
  }

  // Credit transaction notifications are disabled; keep the endpoint for non-credit clients.
  return apiSuccess({
    databaseEnabled: true,
    notifications: [],
  });
}
