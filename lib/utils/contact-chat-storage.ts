import type { ContactConversationKind } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';
import type { CourseChatGroupMeta } from '@/lib/types/chat';

const MAX_CONTACT_MESSAGES = 300;
const MAX_LOCAL_CONTACT_SNAPSHOT_BYTES = 512 * 1024;
const MIN_LOCAL_CONTACT_MESSAGES = 25;
const LOCAL_CONTACT_MESSAGES_PREFIX = 'syntara-contact-chat:v2';
const MOCK_COURSE_CHAT_ID = 'syntara-mock-course-chat';
export const COURSE_CHAT_GROUP_TARGET_PREFIX = 'course-group:';

const unavailableBackendKeys = new Set<string>();
const pendingBackendKeys = new Set<string>();

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

type LocalMessageSnapshot<T> = {
  messages: T[];
  updatedAt: number | null;
  meta?: unknown;
  target?: unknown;
};

type PersistedAuthState = {
  state?: {
    userId?: string;
    email?: string;
    isLoggedIn?: boolean;
  };
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizeKeyPart(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '_';
}

function currentLocalUserKeyPart(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const raw = localStorage.getItem('synatra-auth');
    if (!raw) return 'anonymous';
    const parsed = JSON.parse(raw) as PersistedAuthState;
    const userId = parsed.state?.userId?.trim();
    if (userId) return userId;
    const email = parsed.state?.email?.trim().toLowerCase();
    if (email) return `email:${email}`;
  } catch {
    /* localStorage may be unavailable */
  }
  return 'anonymous';
}

function localStorageKey(args: {
  courseId?: string | null;
  kind: ContactConversationKind;
  targetId: string;
  ignoreCourseId?: boolean;
}): string {
  const userPart = normalizeKeyPart(currentLocalUserKeyPart());
  const coursePart =
    args.ignoreCourseId || args.kind === 'notebook' ? '_' : normalizeKeyPart(args.courseId);
  return [
    LOCAL_CONTACT_MESSAGES_PREFIX,
    encodeURIComponent(userPart),
    encodeURIComponent(coursePart),
    encodeURIComponent(args.kind),
    encodeURIComponent(args.targetId),
  ].join(':');
}

function readLocalSnapshot<T>(args: {
  courseId?: string | null;
  kind: ContactConversationKind;
  targetId: string;
  ignoreCourseId?: boolean;
}): LocalMessageSnapshot<T> {
  if (typeof window === 'undefined') return { messages: [], updatedAt: null };
  try {
    const raw = localStorage.getItem(localStorageKey(args));
    if (!raw) return { messages: [], updatedAt: null };
    const parsed = JSON.parse(raw) as {
      messages?: unknown[];
      updatedAt?: unknown;
      meta?: unknown;
      target?: unknown;
    };
    const updatedAt =
      typeof parsed.updatedAt === 'string'
        ? Date.parse(parsed.updatedAt)
        : Number(parsed.updatedAt);
    return {
      messages: (Array.isArray(parsed.messages) ? parsed.messages : []) as T[],
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
      meta: parsed.meta,
      target: parsed.target,
    };
  } catch {
    return { messages: [], updatedAt: null };
  }
}

function writeLocalMessages<T>(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName?: string;
  messages: T[];
  meta?: unknown;
}): void {
  if (typeof window === 'undefined') return;
  const storageKey = localStorageKey(args);
  const updatedAt = new Date().toISOString();
  let messages = args.messages.slice(-MAX_CONTACT_MESSAGES);
  let includeMeta = args.meta !== undefined;

  try {
    while (messages.length > MIN_LOCAL_CONTACT_MESSAGES) {
      const serialized = JSON.stringify({
        updatedAt,
        target: {
          version: 1,
          kind: args.kind,
          targetId: args.targetId,
          targetName: args.targetName,
        },
        messages,
        ...(includeMeta ? { meta: args.meta } : {}),
      });
      if (byteLength(serialized) <= MAX_LOCAL_CONTACT_SNAPSHOT_BYTES) {
        localStorage.setItem(storageKey, serialized);
        return;
      }
      messages = messages.slice(Math.ceil(messages.length / 2));
    }

    for (const metaEnabled of [includeMeta, false]) {
      const serialized = JSON.stringify({
        updatedAt,
        target: {
          version: 1,
          kind: args.kind,
          targetId: args.targetId,
          targetName: args.targetName,
        },
        messages,
        ...(metaEnabled ? { meta: args.meta } : {}),
      });
      if (byteLength(serialized) <= MAX_LOCAL_CONTACT_SNAPSHOT_BYTES) {
        localStorage.setItem(storageKey, serialized);
        return;
      }
      includeMeta = false;
    }

    localStorage.removeItem(storageKey);
  } catch {
    /* localStorage may be unavailable; backend persistence remains best-effort */
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isLegacyNotebookDispatchPrompt(text: string): boolean {
  return (
    (text.startsWith('@') &&
      text.includes(' 请基于你的笔记回答：') &&
      text.includes('。先直接解决问题，再用一句话说明依据或复杂度。')) ||
    (text.startsWith('@') &&
      text.includes(' 请只补你这个笔记本最相关的一点：') &&
      text.includes('。最多 4 句，能引用页码就引用。')) ||
    text.includes('请以课程微信群里的笔记本成员身份回答：最多 4 句；只讲你这个笔记本最相关的一个点')
  );
}

function stripLegacyNotebookDispatchMessages<T>(kind: ContactConversationKind, messages: T[]): T[] {
  if (kind !== 'notebook' || messages.length === 0) return messages;

  const next: T[] = [];
  let skipNextAssistant = false;
  for (const message of messages) {
    const record = isPlainRecord(message) ? message : null;
    const role = record?.role;
    if (
      record &&
      role === 'user' &&
      typeof record.text === 'string' &&
      isLegacyNotebookDispatchPrompt(record.text.trim())
    ) {
      skipNextAssistant = true;
      continue;
    }
    if (skipNextAssistant && role === 'assistant') {
      skipNextAssistant = false;
      continue;
    }
    skipNextAssistant = false;
    next.push(message);
  }
  return next.length === messages.length ? messages : next;
}

function removeLocalSnapshot(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(localStorageKey(args));
  } catch {
    /* localStorage may be unavailable */
  }
}

function removeLocalSnapshotsForTarget(kind: ContactConversationKind, targetId: string): void {
  if (typeof window === 'undefined') return;
  const userPart = encodeURIComponent(normalizeKeyPart(currentLocalUserKeyPart()));
  const encodedKind = encodeURIComponent(kind);
  const encodedTargetId = encodeURIComponent(targetId);
  const keySuffix = `:${encodedKind}:${encodedTargetId}`;
  const keyPrefix = `${LOCAL_CONTACT_MESSAGES_PREFIX}:${userPart}:`;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(keyPrefix) && key.endsWith(keySuffix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    /* localStorage may be unavailable */
  }
}

function backendKey(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
}): string {
  const coursePart = args.kind === 'notebook' ? '_' : normalizeKeyPart(args.courseId);
  return `${normalizeKeyPart(currentLocalUserKeyPart())}:${coursePart}:${args.kind}:${args.targetId}`;
}

function shouldUseLocalOnly(courseId: string): boolean {
  return courseId === MOCK_COURSE_CHAT_ID;
}

function isNotebookConversationTitleCompatible(
  kind: ContactConversationKind,
  conversation: ConversationRow,
  expectedTargetName?: string | null,
): boolean {
  if (kind !== 'notebook') return true;
  const expected = expectedTargetName?.trim();
  if (!expected) return true;
  const title = conversation.title?.trim();
  return !title || title === '笔记本' || title === expected;
}

function isLocalSnapshotTargetCompatible<T>(
  kind: ContactConversationKind,
  targetId: string,
  snapshot: LocalMessageSnapshot<T>,
  expectedTargetName?: string | null,
): boolean {
  if (kind !== 'notebook') return true;
  const expected = expectedTargetName?.trim();
  if (!expected) return true;
  if (!isPlainRecord(snapshot.target)) return false;
  if (snapshot.target.kind !== kind || snapshot.target.targetId !== targetId) return false;
  const targetName =
    typeof snapshot.target.targetName === 'string' ? snapshot.target.targetName.trim() : '';
  return !targetName || targetName === '笔记本' || targetName === expected;
}

async function ensureConversation(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
  meta?: unknown;
}): Promise<string> {
  const q = new URLSearchParams({
    kind: args.kind,
    targetId: args.targetId,
  });
  // notebook 会话按 targetId 复用，避免因 course 上下文变化创建重复会话
  if (args.kind !== 'notebook') {
    q.set('courseId', args.courseId);
  }
  const listed = await backendJson<{ conversations: ConversationRow[] }>(
    `/api/conversations?${q.toString()}`,
  );
  const reusable = listed.conversations.find((conversation) =>
    isNotebookConversationTitleCompatible(args.kind, conversation, args.targetName),
  );
  if (reusable) {
    return reusable.id;
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
      meta: args.meta ?? { targetName: args.targetName, storageMode: 'snapshot' },
    }),
  });
  return created.conversation.id;
}

export function courseChatGroupTargetId(groupId: string): string {
  return `${COURSE_CHAT_GROUP_TARGET_PREFIX}${groupId}`;
}

export function groupIdFromCourseChatTargetId(targetId: string | null | undefined): string | null {
  if (!targetId?.startsWith(COURSE_CHAT_GROUP_TARGET_PREFIX)) return null;
  return targetId.slice(COURSE_CHAT_GROUP_TARGET_PREFIX.length) || null;
}

function parseCourseChatGroupMeta(value: unknown): CourseChatGroupMeta | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CourseChatGroupMeta>;
  if (record.version !== 1) return null;
  if (typeof record.groupId !== 'string' || !record.groupId.trim()) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (!Array.isArray(record.participants)) return null;
  return {
    version: 1,
    groupId: record.groupId,
    name: record.name,
    participants: record.participants
      .filter((p) => p && typeof p === 'object')
      .map((p) => {
        const participant = p as CourseChatGroupMeta['participants'][number];
        const kind: CourseChatGroupMeta['participants'][number]['kind'] =
          participant.kind === 'notebook' ||
          participant.kind === 'agent' ||
          participant.kind === 'orchestrator'
            ? participant.kind
            : 'orchestrator';
        return {
          id: String(participant.id || ''),
          kind,
          name: String(participant.name || ''),
          avatarUrl: participant.avatarUrl || null,
          joinedAt:
            typeof participant.joinedAt === 'number' && Number.isFinite(participant.joinedAt)
              ? participant.joinedAt
              : Date.now(),
        };
      })
      .filter((p) => p.id && p.name),
    createdReason: typeof record.createdReason === 'string' ? record.createdReason : undefined,
    workingMemory:
      record.workingMemory &&
      typeof record.workingMemory === 'object' &&
      typeof record.workingMemory.updatedAt === 'number'
        ? {
            lastUserQuestion:
              typeof record.workingMemory.lastUserQuestion === 'string'
                ? record.workingMemory.lastUserQuestion
                : undefined,
            dispatchSummary:
              typeof record.workingMemory.dispatchSummary === 'string'
                ? record.workingMemory.dispatchSummary
                : undefined,
            recentSources: Array.isArray(record.workingMemory.recentSources)
              ? record.workingMemory.recentSources
                  .filter((source) => source && typeof source === 'object')
                  .map((source) => {
                    const recordSource = source as {
                      notebookId?: unknown;
                      notebookName?: unknown;
                      order?: unknown;
                      title?: unknown;
                    };
                    return {
                      notebookId:
                        typeof recordSource.notebookId === 'string'
                          ? recordSource.notebookId
                          : undefined,
                      notebookName:
                        typeof recordSource.notebookName === 'string'
                          ? recordSource.notebookName
                          : undefined,
                      order: Number(recordSource.order),
                      title: String(recordSource.title || ''),
                    };
                  })
                  .filter(
                    (source) => Number.isFinite(source.order) && source.order > 0 && source.title,
                  )
                  .slice(0, 8)
              : undefined,
            updatedAt: record.workingMemory.updatedAt,
          }
        : undefined,
    lastRoutingReason:
      typeof record.lastRoutingReason === 'string' ? record.lastRoutingReason : undefined,
    memberSummary: typeof record.memberSummary === 'string' ? record.memberSummary : undefined,
    lastMessagePreview:
      typeof record.lastMessagePreview === 'string' ? record.lastMessagePreview : undefined,
    lastActiveAt:
      typeof record.lastActiveAt === 'number' && Number.isFinite(record.lastActiveAt)
        ? record.lastActiveAt
        : Date.now(),
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
  };
}

function listLocalCourseChatGroups(courseId: string): CourseChatGroupMeta[] {
  if (typeof window === 'undefined') return [];
  const metas: CourseChatGroupMeta[] = [];
  const userPart = encodeURIComponent(normalizeKeyPart(currentLocalUserKeyPart()));
  const coursePart = encodeURIComponent(normalizeKeyPart(courseId));
  const kindPart = encodeURIComponent('agent');
  const targetPrefix = encodeURIComponent(COURSE_CHAT_GROUP_TARGET_PREFIX);
  const prefix = `${LOCAL_CONTACT_MESSAGES_PREFIX}:${userPart}:${coursePart}:${kindPart}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const encodedTarget = key.slice(prefix.length);
      if (!encodedTarget.startsWith(targetPrefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { meta?: unknown };
      const meta = parseCourseChatGroupMeta(parsed.meta);
      if (meta) metas.push(meta);
    }
  } catch {
    return metas;
  }
  return metas;
}

function mergeGroupMetas(
  left: CourseChatGroupMeta[],
  right: CourseChatGroupMeta[],
): CourseChatGroupMeta[] {
  const byId = new Map<string, CourseChatGroupMeta>();
  for (const meta of [...left, ...right]) {
    const prev = byId.get(meta.groupId);
    if (!prev || meta.updatedAt >= prev.updatedAt) byId.set(meta.groupId, meta);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadContactMessages<T>(
  courseId: string | null | undefined,
  kind: ContactConversationKind,
  targetId: string,
  options?: {
    /** 为 notebook 会话提供「仅按 targetId」读取能力，避免受当前课程上下文影响 */
    ignoreCourseId?: boolean;
    expectedTargetName?: string | null;
  },
): Promise<T[]> {
  const localSnapshotRaw = readLocalSnapshot<T>({
    courseId,
    kind,
    targetId,
    ignoreCourseId: options?.ignoreCourseId,
  });
  const localSnapshot: LocalMessageSnapshot<T> = isLocalSnapshotTargetCompatible(
    kind,
    targetId,
    localSnapshotRaw,
    options?.expectedTargetName,
  )
    ? {
        ...localSnapshotRaw,
        messages: stripLegacyNotebookDispatchMessages(kind, localSnapshotRaw.messages),
      }
    : { messages: [], updatedAt: null };
  if (courseId?.trim() && shouldUseLocalOnly(courseId.trim())) {
    return localSnapshot.messages;
  }

  const q = new URLSearchParams({
    kind,
    targetId,
  });
  if (courseId?.trim() && !options?.ignoreCourseId) {
    q.set('courseId', courseId.trim());
  }
  let conversation: ConversationRow | undefined;
  try {
    const listed = await backendJson<{ conversations: ConversationRow[] }>(
      `/api/conversations?${q.toString()}`,
    );
    conversation =
      listed.conversations.find((row) =>
        isNotebookConversationTitleCompatible(kind, row, options?.expectedTargetName),
      ) || (!options?.expectedTargetName ? listed.conversations[0] : undefined);
  } catch {
    return localSnapshot.messages;
  }

  if (!conversation) {
    return localSnapshot.messages;
  }

  let messages: { messages: MessageRow[] };
  try {
    messages = await backendJson<{ messages: MessageRow[] }>(
      `/api/conversations/${encodeURIComponent(conversation.id)}/messages`,
    );
  } catch {
    return localSnapshot.messages;
  }
  const snapshots = messages.messages.filter((m) => m.role === 'snapshot');
  const latest = snapshots[snapshots.length - 1];
  if (!latest || !latest.content || typeof latest.content !== 'object') {
    return localSnapshot.messages;
  }
  const payload = latest.content as { messages?: unknown[] };
  const remoteMessages = stripLegacyNotebookDispatchMessages(kind, (payload.messages || []) as T[]);
  const remoteUpdatedAt = Date.parse(latest.createdAt);
  if (
    localSnapshot.messages.length > 0 &&
    (remoteMessages.length === 0 ||
      (localSnapshot.updatedAt !== null &&
        (!Number.isFinite(remoteUpdatedAt) || localSnapshot.updatedAt > remoteUpdatedAt)))
  ) {
    return localSnapshot.messages;
  }
  return remoteMessages;
}

export async function listCourseChatGroups(courseId: string): Promise<CourseChatGroupMeta[]> {
  const localGroups = listLocalCourseChatGroups(courseId);
  if (shouldUseLocalOnly(courseId)) return localGroups;

  try {
    const q = new URLSearchParams({ kind: 'agent', courseId });
    const listed = await backendJson<{ conversations: ConversationRow[] }>(
      `/api/conversations?${q.toString()}`,
    );
    const groupRows = listed.conversations.filter((row) =>
      groupIdFromCourseChatTargetId(row.targetId),
    );
    const remoteGroups = await Promise.all(
      groupRows.map(async (row) => {
        const fromConversation = parseCourseChatGroupMeta(row.meta);
        try {
          const messages = await backendJson<{ messages: MessageRow[] }>(
            `/api/conversations/${encodeURIComponent(row.id)}/messages`,
          );
          const snapshots = messages.messages.filter((m) => m.role === 'snapshot');
          const latest = snapshots[snapshots.length - 1];
          const content =
            latest?.content && typeof latest.content === 'object'
              ? (latest.content as { groupMeta?: unknown })
              : null;
          return parseCourseChatGroupMeta(content?.groupMeta) || fromConversation;
        } catch {
          return fromConversation;
        }
      }),
    );
    return mergeGroupMetas(
      localGroups,
      remoteGroups.filter((meta): meta is CourseChatGroupMeta => Boolean(meta)),
    );
  } catch {
    return localGroups;
  }
}

export async function loadCourseChatGroupMeta(
  courseId: string,
  groupId: string,
): Promise<CourseChatGroupMeta | null> {
  const targetId = courseChatGroupTargetId(groupId);
  const localSnapshot = readLocalSnapshot<unknown>({
    courseId,
    kind: 'agent',
    targetId,
  });
  const localMeta = parseCourseChatGroupMeta(localSnapshot.meta);
  if (shouldUseLocalOnly(courseId)) return localMeta;

  try {
    const q = new URLSearchParams({ kind: 'agent', targetId, courseId });
    const listed = await backendJson<{ conversations: ConversationRow[] }>(
      `/api/conversations?${q.toString()}`,
    );
    const conversation = listed.conversations[0];
    if (!conversation) return localMeta;
    const fromConversation = parseCourseChatGroupMeta(conversation.meta);
    const messages = await backendJson<{ messages: MessageRow[] }>(
      `/api/conversations/${encodeURIComponent(conversation.id)}/messages`,
    );
    const snapshots = messages.messages.filter((m) => m.role === 'snapshot');
    const latest = snapshots[snapshots.length - 1];
    const content =
      latest?.content && typeof latest.content === 'object'
        ? (latest.content as { groupMeta?: unknown })
        : null;
    const remoteMeta = parseCourseChatGroupMeta(content?.groupMeta) || fromConversation;
    if (localMeta && (!remoteMeta || localMeta.updatedAt >= remoteMeta.updatedAt)) return localMeta;
    return remoteMeta || localMeta;
  } catch {
    return localMeta;
  }
}

export async function deleteCourseChatGroup(courseId: string, groupId: string): Promise<void> {
  const targetId = courseChatGroupTargetId(groupId);
  const key = backendKey({ courseId, kind: 'agent', targetId });
  unavailableBackendKeys.delete(key);
  pendingBackendKeys.delete(key);

  removeLocalSnapshot({ courseId, kind: 'agent', targetId });

  if (shouldUseLocalOnly(courseId)) return;

  try {
    const q = new URLSearchParams({ kind: 'agent', targetId, courseId });
    const listed = await backendJson<{ conversations: ConversationRow[] }>(
      `/api/conversations?${q.toString()}`,
    );
    await Promise.all(
      listed.conversations.map((row) =>
        backendJson<{ ok: true }>(`/api/conversations/${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
        }),
      ),
    );
  } catch {
    /* Backend persistence is best-effort; local-first deletion already completed. */
  }
}

export async function deleteContactMessages(args: {
  courseId?: string | null;
  kind: ContactConversationKind;
  targetId: string;
  ignoreCourseId?: boolean;
}): Promise<void> {
  removeLocalSnapshotsForTarget(args.kind, args.targetId);

  const courseId = args.courseId?.trim() || '';
  if (courseId && shouldUseLocalOnly(courseId)) return;

  try {
    const q = new URLSearchParams({
      kind: args.kind,
      targetId: args.targetId,
    });
    if (courseId && !args.ignoreCourseId) {
      q.set('courseId', courseId);
    }
    const listed = await backendJson<{ conversations: ConversationRow[] }>(
      `/api/conversations?${q.toString()}`,
    );
    await Promise.all(
      listed.conversations.map((row) =>
        backendJson<{ ok: true }>(`/api/conversations/${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
        }),
      ),
    );
  } catch {
    /* Backend persistence is best-effort; local-first deletion already completed. */
  }
}

export async function saveContactMessages<T>(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
  messages: T[];
  meta?: unknown;
}): Promise<void> {
  writeLocalMessages(args);

  if (shouldUseLocalOnly(args.courseId)) return;

  const key = backendKey(args);
  if (unavailableBackendKeys.has(key) || pendingBackendKeys.has(key)) return;

  pendingBackendKeys.add(key);
  try {
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
            ...(args.meta === undefined ? {} : { groupMeta: args.meta }),
          },
          meta: {
            targetName: args.targetName,
            ...(args.meta === undefined ? {} : { groupMeta: args.meta }),
          },
        }),
      },
    );
  } catch {
    unavailableBackendKeys.add(key);
  } finally {
    pendingBackendKeys.delete(key);
  }
}
