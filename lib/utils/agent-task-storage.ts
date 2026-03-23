import type { AgentTaskContactKind, AgentTaskRecord, AgentTaskStatus } from './database';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';
import { backendJson } from '@/lib/utils/backend-api';

type AgentTaskApi = {
  id: string;
  courseId: string | null;
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

function toLegacyRecord(api: AgentTaskApi, contactKind: AgentTaskContactKind, contactId: string): AgentTaskRecord {
  return {
    id: api.id,
    courseId: api.courseId || '',
    contactKind,
    contactId,
    status: toLegacyStatus(api.status),
    title: api.taskType,
    detail: api.error || undefined,
    createdAt: Date.parse(api.createdAt),
    updatedAt: Date.parse(api.updatedAt),
  };
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
}

export async function updateAgentTask(
  id: string,
  updates: Partial<Pick<AgentTaskRecord, 'status' | 'detail' | 'title' | 'lastEnvelope'>>,
): Promise<void> {
  await backendJson<{ envelope: { id: string } }>(`/api/agent-tasks/${encodeURIComponent(id)}/envelopes`, {
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
      taskResult: updates.lastEnvelope ? { lastEnvelope: updates.lastEnvelope } : undefined,
      taskError: updates.status === 'failed' ? updates.detail || '任务失败' : undefined,
    }),
  });
}

export async function listActiveAgentTasksByCourse(courseId: string): Promise<AgentTaskRecord[]> {
  const data = await backendJson<{ tasks: AgentTaskApi[] }>(
    `/api/agent-tasks?courseId=${encodeURIComponent(courseId)}`,
  );
  return data.tasks
    .filter((r) => r.status === 'running' || r.status === 'waiting')
    .map((r) => {
      const req = (r.request || {}) as { contactKind?: AgentTaskContactKind; contactId?: string };
      return toLegacyRecord(r, req.contactKind || 'agent', req.contactId || r.sourceAgentId || 'unknown');
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listTasksForContact(
  contactKind: AgentTaskContactKind,
  contactId: string,
): Promise<AgentTaskRecord[]> {
  const data = await backendJson<{ tasks: AgentTaskApi[] }>('/api/agent-tasks');
  return data.tasks
    .map((r) => {
      const req = (r.request || {}) as { contactKind?: AgentTaskContactKind; contactId?: string };
      return toLegacyRecord(r, req.contactKind || 'agent', req.contactId || r.sourceAgentId || 'unknown');
    })
    .filter((r) => r.contactKind === contactKind && r.contactId === contactId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listChildTasks(parentTaskId: string): Promise<AgentTaskRecord[]> {
  const data = await backendJson<{ tasks: AgentTaskApi[] }>('/api/agent-tasks');
  return data.tasks
    .map((r) => {
      const req = (r.request || {}) as {
        parentTaskId?: string;
        contactKind?: AgentTaskContactKind;
        contactId?: string;
      };
      return {
        record: toLegacyRecord(r, req.contactKind || 'agent', req.contactId || r.sourceAgentId || 'unknown'),
        parentTaskId: req.parentTaskId,
      };
    })
    .filter((x) => x.parentTaskId === parentTaskId)
    .map((x) => x.record)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
