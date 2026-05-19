import { handleNotificationFeedRequest } from '@/features/notifications/server';

export async function GET() {
  return handleNotificationFeedRequest();
}
