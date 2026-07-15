import type { Metadata } from 'next';
import { Csc148AiChatPageClient } from '@/features/qa/test-center/csc148/csc148-ai-chat-page-client';

export const metadata: Metadata = {
  title: 'CSC148 AI 问答闭环测试',
};

export default function Csc148EndToEndChatTestPage() {
  return <Csc148AiChatPageClient />;
}
