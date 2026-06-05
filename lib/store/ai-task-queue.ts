'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';

export const AI_TASK_QUEUE_MAX_ACTIVE = 5;
const FINISHED_TASK_RETENTION_MS = 2 * 60 * 1000;
const MAX_FINISHED_TASKS = 8;

export type AiTaskKind =
  | 'course-generation'
  | 'problem-evaluation'
  | 'review-route'
  | 'chat-reply'
  | 'speech-generation'
  | 'quiz-grading'
  | 'other';

export type AiTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AiTaskRecord = {
  id: string;
  kind: AiTaskKind;
  title: string;
  description: string;
  status: AiTaskStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

type AiTaskQueueState = {
  tasks: AiTaskRecord[];
  enqueueTask: (input: Omit<AiTaskRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (taskId: string, patch: Partial<Omit<AiTaskRecord, 'id' | 'createdAt'>>) => void;
  clearFinished: () => void;
};

type Runtime = {
  controller: AbortController;
  runner: (args: { taskId: string; signal: AbortSignal }) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const runtimes = new Map<string, Runtime>();
let runnerScheduled = false;

function isActiveStatus(status: AiTaskStatus) {
  return status === 'queued' || status === 'running';
}

function isFinishedStatus(status: AiTaskStatus) {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function pruneTasks(tasks: AiTaskRecord[]) {
  const now = Date.now();
  const active = tasks.filter((task) => isActiveStatus(task.status));
  const finished = tasks
    .filter((task) => {
      if (!isFinishedStatus(task.status)) return false;
      const finishedAt = task.finishedAt ?? task.updatedAt;
      return now - finishedAt <= FINISHED_TASK_RETENTION_MS;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_FINISHED_TASKS);
  return [...active, ...finished].sort((a, b) => a.createdAt - b.createdAt);
}

function abortError(message = 'AI task was cancelled') {
  return new DOMException(message, 'AbortError');
}

export const useAiTaskQueueStore = create<AiTaskQueueState>()((set) => ({
  tasks: [],
  enqueueTask: (input) => {
    const now = Date.now();
    const id = nanoid();
    set((state) => ({
      tasks: pruneTasks([
        ...state.tasks,
        {
          ...input,
          id,
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        },
      ]),
    }));
    scheduleRunner();
    return id;
  },
  updateTask: (taskId, patch) => {
    const now = Date.now();
    set((state) => ({
      tasks: pruneTasks(
        state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...patch,
                updatedAt: now,
              }
            : task,
        ),
      ),
    }));
  },
  clearFinished: () => {
    set((state) => ({
      tasks: state.tasks.filter((task) => !isFinishedStatus(task.status)),
    }));
  },
}));

function scheduleRunner() {
  if (runnerScheduled) return;
  runnerScheduled = true;
  queueMicrotask(() => {
    runnerScheduled = false;
    startRunnableTasks();
  });
}

function startRunnableTasks() {
  const tasks = useAiTaskQueueStore.getState().tasks;
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const availableSlots = Math.max(0, AI_TASK_QUEUE_MAX_ACTIVE - runningCount);
  if (availableSlots === 0) return;

  const queued = tasks
    .filter((task) => task.status === 'queued' && runtimes.has(task.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, availableSlots);

  for (const task of queued) {
    startTask(task.id);
  }
}

function startTask(taskId: string) {
  const runtime = runtimes.get(taskId);
  if (!runtime) return;

  const now = Date.now();
  useAiTaskQueueStore.getState().updateTask(taskId, {
    status: 'running',
    startedAt: now,
  });

  runtime
    .runner({ taskId, signal: runtime.controller.signal })
    .then((result) => {
      useAiTaskQueueStore.getState().updateTask(taskId, {
        status: 'completed',
        finishedAt: Date.now(),
      });
      runtime.resolve(result);
    })
    .catch((error) => {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      useAiTaskQueueStore.getState().updateTask(taskId, {
        status: isAbort ? 'cancelled' : 'failed',
        error: isAbort ? undefined : error instanceof Error ? error.message : String(error),
        finishedAt: Date.now(),
      });
      runtime.reject(error);
    })
    .finally(() => {
      runtimes.delete(taskId);
      scheduleRunner();
    });
}

export function updateQueuedAiTask(
  taskId: string,
  patch: Partial<Pick<AiTaskRecord, 'title' | 'description'>>,
) {
  useAiTaskQueueStore.getState().updateTask(taskId, patch);
}

export function runQueuedAiTask<TResult>(
  input: {
    kind: AiTaskKind;
    title: string;
    description: string;
    signal?: AbortSignal;
  },
  runner: (args: { taskId: string; signal: AbortSignal }) => Promise<TResult>,
): Promise<TResult> {
  const taskId = useAiTaskQueueStore.getState().enqueueTask({
    kind: input.kind,
    title: input.title,
    description: input.description,
  });

  return new Promise<TResult>((resolve, reject) => {
    const controller = new AbortController();
    const runtime: Runtime = {
      controller,
      runner,
      resolve: (value) => resolve(value as TResult),
      reject,
    };
    runtimes.set(taskId, runtime);

    const cancelQueuedTask = () => {
      const task = useAiTaskQueueStore.getState().tasks.find((item) => item.id === taskId);
      if (!task || task.status === 'completed' || task.status === 'failed') return;
      controller.abort();
      if (task.status === 'queued') {
        runtimes.delete(taskId);
        useAiTaskQueueStore.getState().updateTask(taskId, {
          status: 'cancelled',
          finishedAt: Date.now(),
        });
        reject(abortError());
        scheduleRunner();
      }
    };

    if (input.signal) {
      if (input.signal.aborted) {
        cancelQueuedTask();
      } else {
        input.signal.addEventListener('abort', cancelQueuedTask, { once: true });
      }
    }

    scheduleRunner();
  });
}
