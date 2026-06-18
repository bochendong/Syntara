import type { NotebookChatMessage } from '@/components/chat/chat-page-types';
import type { NotebookMemorySourceReference } from '@/lib/learning/study-memory';

type UserNotebookMessage = Extract<NotebookChatMessage, { role: 'user' }>;
type AssistantNotebookMessage = Extract<NotebookChatMessage, { role: 'assistant' }>;

export type NotebookConversationTurn = {
  id: string;
  title: string;
  preview: string;
  text: string;
  question?: string;
  answer?: string;
  knowledgeGap?: boolean;
  sourceReferences: NotebookMemorySourceReference[];
  updatedAt?: number;
};

function compactConversationText(input: string, maxLength: number): string {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function referencesFromAssistant(
  message?: AssistantNotebookMessage,
): NotebookMemorySourceReference[] {
  return (message?.references || []).map((reference) => ({
    order: reference.order,
    title: reference.title,
    why: reference.why,
  }));
}

function turnText(args: {
  user?: UserNotebookMessage;
  assistant?: AssistantNotebookMessage;
}): string {
  const parts: string[] = [];
  if (args.user) {
    parts.push('## 用户原文', '', args.user.text.trim());
  }
  if (args.assistant) {
    parts.push('## 助手原文', '', args.assistant.answer.trim());
    if (args.assistant.knowledgeGap) {
      parts.push('', '## 学习缺口', '', '本轮出现了可长期记住的学习缺口。');
    }
  }
  return parts.join('\n').trim() || '暂无最近互动原文。';
}

export function buildNotebookConversationTurns(
  messages: NotebookChatMessage[],
  limit = 10,
): NotebookConversationTurn[] {
  const recent = messages.slice(-limit);
  const buckets: Array<{
    user?: UserNotebookMessage;
    assistant?: AssistantNotebookMessage;
    index: number;
  }> = [];
  let pendingUser: UserNotebookMessage | null = null;

  recent.forEach((message, index) => {
    if (message.role === 'user') {
      if (pendingUser) {
        buckets.push({ user: pendingUser, index });
      }
      pendingUser = message;
      return;
    }

    if (pendingUser) {
      buckets.push({ user: pendingUser, assistant: message, index });
      pendingUser = null;
      return;
    }

    buckets.push({ assistant: message, index });
  });

  if (pendingUser) {
    buckets.push({ user: pendingUser, index: recent.length });
  }

  return buckets.map((bucket, index) => {
    const updatedAt = bucket.assistant?.at || bucket.user?.at;
    const question = bucket.user?.text.trim();
    const answer = bucket.assistant?.answer.trim();
    const title = question
      ? `最近提问：${compactConversationText(question, 44)}`
      : answer
        ? `最近回复：${compactConversationText(answer, 44)}`
        : `最近互动 ${index + 1}`;
    const preview = compactConversationText(
      [
        question ? `用户：${question}` : '',
        answer ? `助手：${answer}` : '',
        bucket.assistant?.knowledgeGap ? '学习缺口：本轮出现了可长期记住的学习缺口。' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      180,
    );

    return {
      id: [bucket.user?.at || 'u', bucket.assistant?.at || 'a', index].join('-'),
      title,
      preview,
      text: turnText(bucket),
      question,
      answer,
      knowledgeGap: bucket.assistant?.knowledgeGap,
      sourceReferences: referencesFromAssistant(bucket.assistant),
      updatedAt,
    };
  });
}

export function findNotebookConversationTurn(
  messages: NotebookChatMessage[],
  turnId: string,
): NotebookConversationTurn | null {
  return buildNotebookConversationTurns(messages).find((turn) => turn.id === turnId) || null;
}
