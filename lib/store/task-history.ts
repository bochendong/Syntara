'use client';

import { create } from 'zustand';

const TASK_HISTORY_STORAGE_KEY = 'syntara-task-history-v1';
const MAX_TASK_HISTORY_RECORDS = 200;
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 280;
const MAX_ERROR_CHARS = 360;
const MAX_CHIP_CHARS = 48;
const MAX_ID_CHARS = 160;
const MAX_KIND_CHARS = 80;
const MAX_URL_CHARS = 360;
const FALLBACK_PERSIST_RECORDS = 40;

export type TaskHistorySource = 'ai_task' | 'memory_activity';

export type TaskHistoryStatus =
  | 'queued'
  | 'running'
  | 'needs_attention'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type TaskHistoryRecord = {
  id: string;
  source: TaskHistorySource;
  sourceId: string;
  kind: string;
  title: string;
  description: string;
  status: TaskHistoryStatus;
  chips: string[];
  contextPath?: string;
  detailHref?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

export type TaskHistoryInput = {
  source: TaskHistorySource;
  sourceId: string;
  kind: string;
  title: string;
  description?: string;
  status: TaskHistoryStatus;
  chips?: string[];
  contextPath?: string;
  detailHref?: string;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

type TaskHistoryState = {
  records: TaskHistoryRecord[];
  upsertRecord: (input: TaskHistoryInput) => void;
  clearRecords: () => void;
};

function isFinishedStatus(status: TaskHistoryStatus) {
  return (
    status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'skipped'
  );
}

function currentContextPath() {
  if (typeof window === 'undefined') return undefined;
  const { pathname, search } = window.location;
  return `${pathname}${search || ''}`;
}

function readStoredHistory(): TaskHistoryRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(TASK_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isTaskHistoryRecord)
      .map(sanitizeRecord)
      .slice(0, MAX_TASK_HISTORY_RECORDS);
  } catch {
    try {
      window.localStorage.removeItem(TASK_HISTORY_STORAGE_KEY);
    } catch {
      // Storage may be unavailable in some browser contexts.
    }
    return [];
  }
}

function persistHistory(records: TaskHistoryRecord[]) {
  if (typeof window === 'undefined') return;

  const safeRecords = records.map(sanitizeRecord).slice(0, MAX_TASK_HISTORY_RECORDS);

  try {
    window.localStorage.setItem(TASK_HISTORY_STORAGE_KEY, JSON.stringify(safeRecords));
  } catch {
    try {
      window.localStorage.setItem(
        TASK_HISTORY_STORAGE_KEY,
        JSON.stringify(safeRecords.slice(0, FALLBACK_PERSIST_RECORDS)),
      );
    } catch {
      // History is a convenience layer; failing to persist should not block user work.
    }
  }
}

function isTaskHistoryRecord(value: unknown): value is TaskHistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<TaskHistoryRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.source === 'string' &&
    typeof record.sourceId === 'string' &&
    typeof record.kind === 'string' &&
    typeof record.title === 'string' &&
    typeof record.description === 'string' &&
    typeof record.status === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    Array.isArray(record.chips)
  );
}

function normalizeRecord(input: TaskHistoryInput, existing?: TaskHistoryRecord): TaskHistoryRecord {
  const now = Date.now();
  const createdAt = existing?.createdAt ?? input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const finishedAt = isFinishedStatus(input.status)
    ? (input.finishedAt ?? existing?.finishedAt ?? updatedAt)
    : undefined;

  return sanitizeRecord({
    id: `${input.source}:${input.sourceId}`,
    source: input.source,
    sourceId: input.sourceId,
    kind: input.kind,
    title: input.title || existing?.title || '后台任务',
    description: input.description ?? existing?.description ?? '',
    status: input.status,
    chips: input.chips ?? existing?.chips ?? [],
    contextPath: input.contextPath ?? existing?.contextPath ?? currentContextPath(),
    detailHref: input.detailHref ?? existing?.detailHref,
    error: input.error ?? existing?.error,
    createdAt,
    updatedAt,
    startedAt: input.startedAt ?? existing?.startedAt,
    finishedAt,
  });
}

function compactText(value: string | undefined, maxChars: number) {
  const text = (value ?? '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function compactOptionalText(value: string | undefined, maxChars: number) {
  if (value == null) return undefined;
  const text = compactText(value, maxChars);
  return text || undefined;
}

function sanitizeRecord(record: TaskHistoryRecord): TaskHistoryRecord {
  return {
    ...record,
    id: compactText(record.id, MAX_ID_CHARS) || 'task-history-record',
    sourceId: compactText(record.sourceId, MAX_ID_CHARS) || 'unknown',
    kind: compactText(record.kind, MAX_KIND_CHARS) || 'other',
    title: compactText(record.title, MAX_TITLE_CHARS) || '后台任务',
    description: compactText(record.description, MAX_DESCRIPTION_CHARS),
    chips: record.chips
      .filter((chip): chip is string => typeof chip === 'string' && chip.trim().length > 0)
      .slice(0, 6)
      .map((chip) => compactText(chip, MAX_CHIP_CHARS)),
    contextPath: compactOptionalText(record.contextPath, MAX_URL_CHARS),
    detailHref: compactOptionalText(record.detailHref, MAX_URL_CHARS),
    error: compactOptionalText(record.error, MAX_ERROR_CHARS),
  };
}

export const useTaskHistoryStore = create<TaskHistoryState>()((set) => ({
  records: readStoredHistory(),
  upsertRecord: (input) => {
    set((state) => {
      const id = `${input.source}:${input.sourceId}`;
      const existing = state.records.find((record) => record.id === id);
      const next = normalizeRecord(input, existing);
      const records = [next, ...state.records.filter((record) => record.id !== id)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_TASK_HISTORY_RECORDS);
      persistHistory(records);
      return { records };
    });
  },
  clearRecords: () => {
    persistHistory([]);
    set({ records: [] });
  },
}));

export function recordTaskHistory(input: TaskHistoryInput) {
  useTaskHistoryStore.getState().upsertRecord(input);
}
