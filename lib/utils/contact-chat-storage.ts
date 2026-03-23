import type { ContactConversationKind } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';

const MAX_CONTACT_MESSAGES = 300;

type ConversationRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  kind: ContactConversationKind;
  targetId: string | null;
  title: string | null;
  meta: unknown;
};

type MessageRow = {
  id: string;
  role: string;
  content: unknown;
  createdAt: string;
};

async function ensureConversation(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
}): Promise<string> {
  const q = new URLSearchParams({
    courseId: args.courseId,
    kind: args.kind,
    targetId: args.targetId,
  });
  const listed = await backendJson<{ conversations: ConversationRow[] }>(`/api/conversations?${q.toString()}`);
  if (listed.conversations.length > 0) {
    return listed.conversations[0].id;
  }

  const created = await backendJson<{ conversation: ConversationRow }>('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: args.courseId,
      notebookId: args.kind === 'notebook' ? args.targetId : undefined,
      kind: args.kind,
      targetId: args.targetId,
      title: args.targetName,
      meta: { targetName: args.targetName, storageMode: 'snapshot' },
    }),
  });
  return created.conversation.id;
}

export async function loadContactMessages<T>(
  courseId: string,
  kind: ContactConversationKind,
  targetId: string,
): Promise<T[]> {
  const q = new URLSearchParams({
    courseId,
    kind,
    targetId,
  });
  const listed = await backendJson<{ conversations: ConversationRow[] }>(`/api/conversations?${q.toString()}`);
  const conversation = listed.conversations[0];
  if (!conversation) return [];

  const messages = await backendJson<{ messages: MessageRow[] }>(
    `/api/conversations/${encodeURIComponent(conversation.id)}/messages`,
  );
  const snapshots = messages.messages.filter((m) => m.role === 'snapshot');
  const latest = snapshots[snapshots.length - 1];
  if (!latest || !latest.content || typeof latest.content !== 'object') return [];
  const payload = latest.content as { messages?: unknown[] };
  return (payload.messages || []) as T[];
}

export async function saveContactMessages<T>(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
  messages: T[];
}): Promise<void> {
  const conversationId = await ensureConversation(args);
  await backendJson<{ message: MessageRow }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'snapshot',
        content: {
          messages: args.messages.slice(-MAX_CONTACT_MESSAGES),
        },
        meta: {
          targetName: args.targetName,
        },
      }),
    },
  );
}
