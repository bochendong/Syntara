export const NOTEBOOK_CHAT_HANDOFF_QUERY_PARAM = 'handoff';

const NOTEBOOK_CHAT_HANDOFF_STORAGE_PREFIX = 'synatra:notebook-chat-handoff:';
const NOTEBOOK_CHAT_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

export type NotebookChatHandoff = {
  id: string;
  courseId: string;
  notebookId: string;
  question: string;
  createdAt: number;
};

function handoffStorageKey(id: string): string {
  return `${NOTEBOOK_CHAT_HANDOFF_STORAGE_PREFIX}${id}`;
}

export function saveNotebookChatHandoff(args: {
  courseId: string;
  notebookId: string;
  question: string;
}): string | null {
  if (typeof window === 'undefined') return null;
  const id = `handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const payload: NotebookChatHandoff = {
    id,
    courseId: args.courseId,
    notebookId: args.notebookId,
    question: args.question,
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(handoffStorageKey(id), JSON.stringify(payload));
    return id;
  } catch {
    return null;
  }
}

export function takeNotebookChatHandoff(id: string): NotebookChatHandoff | null {
  if (typeof window === 'undefined' || !id.trim()) return null;
  const key = handoffStorageKey(id);
  try {
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotebookChatHandoff>;
    if (
      parsed.id !== id ||
      typeof parsed.courseId !== 'string' ||
      typeof parsed.notebookId !== 'string' ||
      typeof parsed.question !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > NOTEBOOK_CHAT_HANDOFF_MAX_AGE_MS) return null;
    return {
      id: parsed.id,
      courseId: parsed.courseId,
      notebookId: parsed.notebookId,
      question: parsed.question,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
