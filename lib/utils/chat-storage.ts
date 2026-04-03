/**
 * Chat Storage - Persist chat sessions to IndexedDB
 *
 * Independent from stage/scene storage cycle.
 * Handles serialization, truncation, and batch writes.
 */

import type { ChatSession, ChatMessageMetadata, SessionStatus } from '@/lib/types/chat';
import type { UIMessage } from 'ai';
import type { ChatSessionRecord } from './database';

/** Maximum messages per session to avoid IndexedDB bloat */
const MAX_MESSAGES_PER_SESSION = 200;
const KEY_PREFIX = 'synatra-chat-sessions:';

function readStageSessions(stageId: string): ChatSessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${stageId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStageSessions(stageId: string, records: ChatSessionRecord[]) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`${KEY_PREFIX}${stageId}`, JSON.stringify(records));
}

/**
 * Save chat sessions for a stage to IndexedDB.
 * - Active sessions are saved as 'interrupted' (streaming context lost on refresh)
 * - pendingToolCalls are cleared (runtime-only state)
 * - Messages are truncated to MAX_MESSAGES_PER_SESSION
 */
export async function saveChatSessions(stageId: string, sessions: ChatSession[]): Promise<void> {
  if (!sessions || sessions.length === 0) {
    if (typeof window !== 'undefined') sessionStorage.removeItem(`${KEY_PREFIX}${stageId}`);
    return;
  }

  const records: ChatSessionRecord[] = sessions.map((session) => ({
    id: session.id,
    stageId,
    type: session.type,
    title: session.title,
    // Mark active sessions as interrupted (streaming context lost on refresh)
    status: (session.status === 'active' ? 'interrupted' : session.status) as SessionStatus,
    // Truncate messages and strip non-serializable data
    messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
    config: session.config,
    toolCalls: session.toolCalls,
    pendingToolCalls: [], // Clear runtime state
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    sceneId: session.sceneId,
    lastActionIndex: session.lastActionIndex,
  }));

  writeStageSessions(stageId, records);
}

/**
 * Load chat sessions for a stage from IndexedDB.
 * Returns sessions sorted by createdAt.
 */
export async function loadChatSessions(stageId: string): Promise<ChatSession[]> {
  const records = readStageSessions(stageId).sort((a, b) => a.createdAt - b.createdAt);

  return records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    status: record.status,
    messages: record.messages as UIMessage<ChatMessageMetadata>[],
    config: record.config,
    toolCalls: record.toolCalls,
    pendingToolCalls: record.pendingToolCalls,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sceneId: record.sceneId,
    lastActionIndex: record.lastActionIndex,
  }));
}

/**
 * Delete all chat sessions for a stage.
 */
export async function deleteChatSessions(stageId: string): Promise<void> {
  if (typeof window !== 'undefined') sessionStorage.removeItem(`${KEY_PREFIX}${stageId}`);
}
