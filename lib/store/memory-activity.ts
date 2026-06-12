'use client';

import { nanoid } from 'nanoid';
import { create } from 'zustand';

export const MEMORY_ACTIVITY_EVENT = 'synatra-memory-activity';

const FINISHED_ACTIVITY_RETENTION_MS = 90 * 1000;
const MAX_FINISHED_ACTIVITIES = 10;

export type MemoryActivityStatus =
  | 'detecting'
  | 'writing_fact'
  | 'writing_study_memory'
  | 'indexing_source'
  | 'needs_confirmation'
  | 'completed'
  | 'failed'
  | 'skipped';

export type MemoryActivityLayer =
  | 'structured_fact'
  | 'study_memory'
  | 'knowledge_index'
  | 'business_record'
  | 'none';

export type MemoryActivityRecord = {
  id: string;
  title: string;
  description: string;
  status: MemoryActivityStatus;
  layer: MemoryActivityLayer;
  chips: string[];
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  detailHref?: string;
  error?: string;
};

export type MemoryActivityInput = {
  id?: string;
  title: string;
  description?: string;
  status: MemoryActivityStatus;
  layer?: MemoryActivityLayer;
  chips?: string[];
  detailHref?: string;
  error?: string;
};

export type MemoryActivityEventDetail =
  | { type: 'add'; activity: MemoryActivityInput }
  | { type: 'update'; id: string; patch: Partial<MemoryActivityInput> }
  | { type: 'dismiss'; id: string };

type MemoryActivityState = {
  activities: MemoryActivityRecord[];
  addActivity: (input: MemoryActivityInput) => string;
  updateActivity: (id: string, patch: Partial<MemoryActivityInput>) => void;
  dismissActivity: (id: string) => void;
  clearFinished: () => void;
};

function isActiveStatus(status: MemoryActivityStatus) {
  return (
    status === 'detecting' ||
    status === 'writing_fact' ||
    status === 'writing_study_memory' ||
    status === 'indexing_source' ||
    status === 'needs_confirmation'
  );
}

function isFinishedStatus(status: MemoryActivityStatus) {
  return status === 'completed' || status === 'failed' || status === 'skipped';
}

function pruneActivities(activities: MemoryActivityRecord[]) {
  const now = Date.now();
  const active = activities.filter((activity) => isActiveStatus(activity.status));
  const finished = activities
    .filter((activity) => {
      if (!isFinishedStatus(activity.status)) return false;
      const finishedAt = activity.finishedAt ?? activity.updatedAt;
      return now - finishedAt <= FINISHED_ACTIVITY_RETENTION_MS;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_FINISHED_ACTIVITIES);
  return [...active, ...finished].sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeActivity(
  input: Partial<MemoryActivityInput> & { id?: string },
  existing?: MemoryActivityRecord,
) {
  const now = Date.now();
  const status = input.status ?? existing?.status ?? 'detecting';
  const finishedAt = isFinishedStatus(status) ? (existing?.finishedAt ?? now) : undefined;
  return {
    id: input.id || existing?.id || nanoid(),
    title: input.title?.trim() || existing?.title || '记忆活动',
    description: input.description?.trim() ?? existing?.description ?? '',
    status,
    layer: input.layer ?? existing?.layer ?? 'none',
    chips: input.chips ?? existing?.chips ?? [],
    detailHref: input.detailHref ?? existing?.detailHref,
    error: input.error ?? existing?.error,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    finishedAt,
  } satisfies MemoryActivityRecord;
}

export const useMemoryActivityStore = create<MemoryActivityState>()((set) => ({
  activities: [],
  addActivity: (input) => {
    const id = input.id || nanoid();
    set((state) => ({
      activities: pruneActivities([
        normalizeActivity({ ...input, id }),
        ...state.activities.filter((activity) => activity.id !== id),
      ]),
    }));
    return id;
  },
  updateActivity: (id, patch) => {
    set((state) => ({
      activities: pruneActivities(
        state.activities.map((activity) =>
          activity.id === id ? normalizeActivity({ ...patch, id }, activity) : activity,
        ),
      ),
    }));
  },
  dismissActivity: (id) => {
    set((state) => ({
      activities: state.activities.filter((activity) => activity.id !== id),
    }));
  },
  clearFinished: () => {
    set((state) => ({
      activities: state.activities.filter((activity) => !isFinishedStatus(activity.status)),
    }));
  },
}));

export function addMemoryActivity(input: MemoryActivityInput) {
  return useMemoryActivityStore.getState().addActivity(input);
}

export function updateMemoryActivity(id: string, patch: Partial<MemoryActivityInput>) {
  useMemoryActivityStore.getState().updateActivity(id, patch);
}

export function dismissMemoryActivity(id: string) {
  useMemoryActivityStore.getState().dismissActivity(id);
}

export function emitMemoryActivityEvent(detail: MemoryActivityEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MemoryActivityEventDetail>(MEMORY_ACTIVITY_EVENT, { detail }),
  );
}

export function isActiveMemoryActivityStatus(status: MemoryActivityStatus) {
  return isActiveStatus(status);
}
