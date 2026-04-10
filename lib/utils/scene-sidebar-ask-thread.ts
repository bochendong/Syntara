import type { ChatSession, ChatMessageMetadata } from '@/lib/types/chat';
import type { UIMessage } from 'ai';

export type SceneSidebarAskBubble = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending: boolean;
};

export function flattenUIMessageText(message: UIMessage<ChatMessageMetadata>): string {
  const parts = (message.parts || []) as Array<{ type?: string; text?: string }>;
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

export function buildSceneSidebarAskThreadFromMessages(
  messages: UIMessage<ChatMessageMetadata>[],
  isStreaming: boolean,
): SceneSidebarAskBubble[] {
  return messages
    .map((m, idx) => {
      const content = flattenUIMessageText(m);
      const isLast = idx === messages.length - 1;
      const pending =
        isStreaming && isLast && m.role === 'assistant' && content.trim() === '';
      return {
        id: m.id,
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content,
        pending,
      };
    })
    .filter((row) => row.content.trim() || row.pending);
}

/**
 * 与右侧 Chat 区当前线程对齐：优先展示进行中的会话，否则最近更新的 QA/讨论会话。
 */
export function buildSceneSidebarAskThread(
  chatSessions: ChatSession[],
  isStreaming: boolean,
): SceneSidebarAskBubble[] {
  if (chatSessions.length === 0) return [];
  const active = chatSessions.find((s) => s.status === 'active');
  const sess = active ?? [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!sess) return [];

  return buildSceneSidebarAskThreadFromMessages(sess.messages ?? [], isStreaming);
}
