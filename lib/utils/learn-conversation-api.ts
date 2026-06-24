import { backendJson } from '@/lib/utils/backend-api';

export type RemoteLearnChatSession = {
  id: string;
  conversationId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type RemoteLearnMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  plan?: unknown;
  progressProposal?: unknown;
  pendingAction?: unknown;
  lecturePrompt?: unknown;
  lectureDeck?: unknown;
  learningActions?: unknown;
  attachments?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
  }>;
};

export type RemoteLearnConversationResponse = {
  storage: 'database' | 'unavailable';
  session: RemoteLearnChatSession | null;
  messages: RemoteLearnMessage[];
};

export type RemoteLearnSessionListResponse = {
  storage: 'database' | 'unavailable';
  sessions: RemoteLearnChatSession[];
};

export type RemoteLearnMessagePayload = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  plan?: unknown;
  progressProposal?: unknown;
  pendingAction?: unknown;
  lecturePrompt?: unknown;
  lectureDeck?: unknown;
  learningActions?: unknown;
  attachments?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
  }>;
};

function paramsFor(courseId: string, sessionId?: string) {
  const params = new URLSearchParams({ courseId });
  if (sessionId) params.set('sessionId', sessionId);
  return params.toString();
}

export async function listRemoteLearnSessions(
  courseId: string,
): Promise<RemoteLearnSessionListResponse | null> {
  try {
    return await backendJson<RemoteLearnSessionListResponse>(
      `/api/learn/conversations?${paramsFor(courseId)}`,
    );
  } catch (error) {
    console.warn('[learn-conversation-api] failed to list sessions', error);
    return null;
  }
}

export async function loadRemoteLearnConversation(
  courseId: string,
  sessionId: string,
): Promise<RemoteLearnConversationResponse | null> {
  try {
    return await backendJson<RemoteLearnConversationResponse>(
      `/api/learn/conversations?${paramsFor(courseId, sessionId)}`,
    );
  } catch (error) {
    console.warn('[learn-conversation-api] failed to load conversation', error);
    return null;
  }
}

export async function syncRemoteLearnConversation(args: {
  courseId: string;
  sessionId: string;
  title: string;
  messages: RemoteLearnMessagePayload[];
}): Promise<boolean> {
  try {
    const response = await backendJson<{ ok: boolean; storage: 'database' | 'unavailable' }>(
      '/api/learn/conversations',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      },
    );
    return response.storage === 'database' && response.ok;
  } catch (error) {
    console.warn('[learn-conversation-api] failed to sync conversation', error);
    return false;
  }
}

export async function deleteRemoteLearnConversation(
  courseId: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const response = await backendJson<{ ok: boolean; storage: 'database' | 'unavailable' }>(
      `/api/learn/conversations?${paramsFor(courseId, sessionId)}`,
      { method: 'DELETE' },
    );
    return response.storage === 'database' && response.ok;
  } catch (error) {
    console.warn('[learn-conversation-api] failed to delete conversation', error);
    return false;
  }
}
