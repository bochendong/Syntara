import type { NextRequest } from 'next/server';
import {
  CHAT_STREAM_MAX_DURATION_SECONDS,
  handleStatelessChatRequest,
} from '@/features/chat/server';

export const maxDuration = CHAT_STREAM_MAX_DURATION_SECONDS;

export async function POST(req: NextRequest) {
  return handleStatelessChatRequest(req);
}
