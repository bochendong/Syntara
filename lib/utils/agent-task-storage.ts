import {
  db,
  type AgentTaskContactKind,
  type AgentTaskRecord,
  type AgentTaskStatus,
} from './database';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';
import { backendJson } from '@/lib/utils/backend-api';

const MOCK_COURSE_CHAT_ID = 'syntara-mock-course-chat';
const LOCAL_TASK_ID_PREFIX = 'local-agent-task:';

type AgentTaskApi = {
  id: string;
  courseId: string | null;
  notebookId?: string | null;
  sourceAgentId: string | null;
  targetAgentId: string | null;
  taskType: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  request: unknown;
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

function toLegacyStatus(status: AgentTaskApi['status']): AgentTaskStatus {
  if (status === 'queued') return 'running';
  if (status === 'completed') return 'done';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return status;
}

function fromLegacyStatus(status?: AgentTaskStatus): AgentTaskApi['status'] {
  if (status === 'done') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'waiting') return 'waiting';
  return 'running';
}

function toLegacyRecord(
  api: AgentTaskApi,
  contactKind: AgentTaskContactKind,
  contactId: string,
): AgentTaskRecord {
  const req = (api.request || {}) as {
    detail?: string;
    parentTaskId?: string;
    contactKind?: AgentTaskContactKind;
    contactId?: string;
  };
  const detailFromRequest = typeof req.detail === 'string' ? req.detail : undefined;
  return {
    id: api.id,
    courseId: api.courseId || '',
    notebookId: api.notebookId?.trim() || undefined,
    parentTaskId: req.parentTaskId?.trim() || undefined,
    contactKind,
    contactId,
    status: toLegacyStatus(api.status),
    title: api.taskType,
    detail: detailFromRequest || api.error || undefined,
    createdAt: Date.parse(api.createdAt),
    updatedAt: Date.parse(api.updatedAt),
  };
}

function isLocalTaskId(id: string): boolean {
  return id.startsWith(LOCAL_TASK_ID_PREFIX);
}

function shouldUseLocalTasksForCourse(courseId: string): boolean {
  return courseId === MOCK_COURSE_CHAT_ID;
}

function createLocalTaskId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${LOCAL_TASK_ID_PREFIX}${random}`;
}

function sortTasks(tasks: AgentTaskRecord[]): AgentTaskRecord[] {
  return [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeTasks(
  remoteTasks: AgentTaskRecord[],
  localTasks: AgentTaskRecord[],
): AgentTaskRecord[] {
  const byId = new Map<string, AgentTaskRecord>();
  for (const task of remoteTasks) byId.set(task.id, task);
  for (const task of localTasks) byId.set(task.id, task);
  return sortTasks([...byId.values()]);
}

function mapRemoteTasks(tasks: AgentTaskApi[]): AgentTaskRecord[] {
  return tasks.map((r) => {
    const req = (r.request || {}) as { contactKind?: AgentTaskContactKind; contactId?: string };
    return toLegacyRecord(
      r,
      req.contactKind || 'agent',
      req.contactId || r.sourceAgentId || 'unknown',
    );
  });
}

function isRunningTask(task: AgentTaskRecord): boolean {
  return task.status === 'running' || task.status === 'waiting';
}

async function readLocalTasksByCourse(courseId: string): Promise<AgentTaskRecord[]> {
  try {
    return await db.agentTasks.where('courseId').equals(courseId).toArray();
  } catch {
    return [];
  }
}

async function readLocalTasksForContact(
  contactKind: AgentTaskContactKind,
  contactId: string,
): Promise<AgentTaskRecord[]> {
  try {
    const tasks = await db.agentTasks.toArray();
    return tasks.filter((task) => task.contactKind === contactKind && task.contactId === contactId);
  } catch {
    return [];
  }
}

async function readLocalChildTasks(parentTaskId: string): Promise<AgentTaskRecord[]> {
  try {
    const tasks = await db.agentTasks.where('parentTaskId').equals(parentTaskId).toArray();
    return tasks;
  } catch {
    return [];
  }
}

async function createLocalAgentTask(args: {
  courseId: string;
  parentTaskId?: string;
  contactKind: AgentTaskContactKind;
  contactId: string;
  title: string;
  detail?: string;
  status?: AgentTaskStatus;
  lastEnvelope?: ProtocolMessageEnvelope;
}): Promise<string> {
  const now = Date.now();
  const id = createLocalTaskId();
  const task: AgentTaskRecord = {
    id,
    courseId: args.courseId,
    parentTaskId: args.parentTaskId,
    notebookId: args.contactKind === 'notebook' ? args.contactId : undefined,
    contactKind: args.contactKind,
    contactId: args.contactId,
    status: args.status || 'running',
    title: args.title,
    detail: args.detail,
    lastEnvelope: args.lastEnvelope,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.agentTasks.put(task);
  } catch {
    // Local task persistence is best-effort; callers only need a stable id to keep chat moving.
  }
  return id;
}

async function updateLocalAgentTask(
  id: string,
  updates: Partial<
    Pick<AgentTaskRecord, 'status' | 'detail' | 'title' | 'lastEnvelope' | 'notebookId'>
  >,
): Promise<void> {
  const existing = await db.agentTasks.get(id).catch(() => undefined);
  if (!existing) return;

  const next: AgentTaskRecord = {
    ...existing,
    updatedAt: Date.now(),
  };
  if (updates.status !== undefined) next.status = updates.status;
  if (updates.detail !== undefined) next.detail = updates.detail;
  if (updates.title !== undefined) next.title = updates.title;
  if (updates.lastEnvelope !== undefined) next.lastEnvelope = updates.lastEnvelope;
  if (updates.notebookId !== undefined) {
    next.notebookId = updates.notebookId.trim() || undefined;
  }
  await db.agentTasks.put(next).catch(() => undefined);
}

export async function createAgentTask(args: {
  courseId: string;
  parentTaskId?: string;
  contactKind: AgentTaskContactKind;
  contactId: string;
  title: string;
  detail?: string;
  status?: AgentTaskStatus;
  lastEnvelope?: ProtocolMessageEnvelope;
}): Promise<string> {
  if (shouldUseLocalTasksForCourse(args.courseId)) {
    return createLocalAgentTask(args);
  }

  try {
    const data = await backendJson<{ task: AgentTaskApi }>('/api/agent-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: args.courseId,
        notebookId: args.contactKind === 'notebook' ? args.contactId : undefined,
        sourceAgentId: args.contactKind === 'agent' ? args.contactId : undefined,
        taskType: args.title,
        status: fromLegacyStatus(args.status),
        request: {
          parentTaskId: args.parentTaskId,
          contactKind: args.contactKind,
          contactId: args.contactId,
          detail: args.detail,
        },
        result: args.lastEnvelope ? { lastEnvelope: args.lastEnvelope } : undefined,
        error: undefined,
      }),
    });
    return data.task.id;
  } catch {
    return createLocalAgentTask(args);
  }
}

export async function updateAgentTask(
  id: string,
  updates: Partial<
    Pick<AgentTaskRecord, 'status' | 'detail' | 'title' | 'lastEnvelope' | 'notebookId'>
  >,
): Promise<void> {
  if (isLocalTaskId(id)) {
    await updateLocalAgentTask(id, updates);
    return;
  }

  try {
    await backendJson<{ envelope: { id: string } }>(
      `/api/agent-tasks/${encodeURIComponent(id)}/envelopes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envelopeType: 'task_partial',
          payload: {
            title: updates.title,
            detail: updates.detail,
            lastEnvelope: updates.lastEnvelope,
          },
          taskStatus: updates.status ? fromLegacyStatus(updates.status) : undefined,
          taskNotebookId: updates.notebookId?.trim() || undefined,
          taskResult: updates.lastEnvelope ? { lastEnvelope: updates.lastEnvelope } : undefined,
          taskError: updates.status === 'failed' ? updates.detail || '任务失败' : undefined,
        }),
      },
    );
  } catch {
    // Task tracking is best-effort; chat generation should not fail if the progress row cannot sync.
  }
}

export async function cancelAgentTask(id: string, detail = '任务已取消'): Promise<void> {
  if (isLocalTaskId(id)) {
    await updateLocalAgentTask(id, { status: 'failed', detail });
    return;
  }

  try {
    await backendJson<{ envelope: { id: string } }>(
      `/api/agent-tasks/${encodeURIComponent(id)}/envelopes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envelopeType: 'task_partial',
          payload: {
            detail,
          },
          taskStatus: 'cancelled',
          taskError: detail,
        }),
      },
    );
  } catch {
    // Best-effort only.
  }
}

export async function listActiveAgentTasksByCourse(courseId: string): Promise<AgentTaskRecord[]> {
  const localTasks = (await readLocalTasksByCourse(courseId)).filter(isRunningTask);
  if (shouldUseLocalTasksForCourse(courseId)) return sortTasks(localTasks);

  try {
    const data = await backendJson<{ tasks: AgentTaskApi[] }>(
      `/api/agent-tasks?courseId=${encodeURIComponent(courseId)}`,
    );
    const remoteTasks = mapRemoteTasks(data.tasks).filter(isRunningTask);
    return mergeTasks(remoteTasks, localTasks);
  } catch {
    return sortTasks(localTasks);
  }
}

/** 课程下全部任务（含已完成/失败），用于检测总控创建任务是否结束 */
export async function listAgentTasksByCourse(courseId: string): Promise<AgentTaskRecord[]> {
  const localTasks = await readLocalTasksByCourse(courseId);
  if (shouldUseLocalTasksForCourse(courseId)) return sortTasks(localTasks);

  try {
    const data = await backendJson<{ tasks: AgentTaskApi[] }>(
      `/api/agent-tasks?courseId=${encodeURIComponent(courseId)}`,
    );
    return mergeTasks(mapRemoteTasks(data.tasks), localTasks);
  } catch {
    return sortTasks(localTasks);
  }
}

export async function listTasksForContact(
  contactKind: AgentTaskContactKind,
  contactId: string,
): Promise<AgentTaskRecord[]> {
  const localTasks = await readLocalTasksForContact(contactKind, contactId);
  try {
    const data = await backendJson<{ tasks: AgentTaskApi[] }>('/api/agent-tasks');
    const remoteTasks = mapRemoteTasks(data.tasks).filter(
      (task) => task.contactKind === contactKind && task.contactId === contactId,
    );
    return mergeTasks(remoteTasks, localTasks);
  } catch {
    return sortTasks(localTasks);
  }
}

export async function listChildTasks(parentTaskId: string): Promise<AgentTaskRecord[]> {
  const localTasks = await readLocalChildTasks(parentTaskId);
  try {
    const data = await backendJson<{ tasks: AgentTaskApi[] }>('/api/agent-tasks');
    const remoteTasks = mapRemoteTasks(data.tasks).filter(
      (task) => task.parentTaskId === parentTaskId,
    );
    return mergeTasks(remoteTasks, localTasks);
  } catch {
    return sortTasks(localTasks);
  }
}
