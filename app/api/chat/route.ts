import type { NextRequest } from 'next/server';
import { handleStatelessChatRequest } from '@/features/chat/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleStatelessChatRequest(req);
}
