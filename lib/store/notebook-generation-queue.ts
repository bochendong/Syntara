'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  getFullPageImageUrlFromScene,
  runNotebookGenerationTask,
  type NotebookGeneratedPageThumbnail,
  type NotebookGenerationProgress,
  type NotebookGenerationTaskInput,
  type NotebookGenerationTaskResult,
} from '@/lib/create/run-notebook-generation-task';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';

export type NotebookGenerationQueueStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const NOTEBOOK_GENERATION_QUEUE_MAX_PENDING = 5;
export const NOTEBOOK_GENERATION_QUEUE_MAX_SOURCE_BYTES = 100 * 1024 * 1024;

type QueueableNotebookInput = Omit<
  NotebookGenerationTaskInput,
  'signal' | 'onProgress' | 'sourceFile' | 'pdfFile'
> & {
  sourceFile?: File | null;
};

export type NotebookGenerationQueueTask = {
  id: string;
  courseId?: string;
  requirement: string;
  status: NotebookGenerationQueueStatus;
  fileName?: string;
  fileSize?: number;
  generateSlides: boolean;
  createdAt: number;
  updatedAt: number;
  progress?: NotebookGenerationProgress;
  plannedPages?: Array<{ id: string; title: string; focus: string }>;
  generatedPageThumbnails?: Record<number, string>;
  notebookId?: string;
  notebookName?: string;
  error?: string;
};

export type NotebookGenerationQueueCallbacks = {
  onProgress?: (task: NotebookGenerationQueueTask, progress: NotebookGenerationProgress) => void;
  onCompleted?: (task: NotebookGenerationQueueTask, result: NotebookGenerationTaskResult) => void;
  onFailed?: (task: NotebookGenerationQueueTask, error: string) => void;
  onCancelled?: (task: NotebookGenerationQueueTask) => void;
};

type QueueRuntime = {
  input: QueueableNotebookInput;
  callbacks?: NotebookGenerationQueueCallbacks;
};

type NotebookGenerationQueueState = {
  tasks: NotebookGenerationQueueTask[];
  enqueue: (
    input: QueueableNotebookInput,
    callbacks?: NotebookGenerationQueueCallbacks,
  ) => NotebookGenerationQueueTask;
  cancel: (taskId: string) => void;
  clearFinished: () => void;
};

const runtimeByTaskId = new Map<string, QueueRuntime>();
const sourceFileByTaskId = new Map<string, File>();
let activeController: AbortController | null = null;
let runnerScheduled = false;

function pendingTasks(tasks: NotebookGenerationQueueTask[]) {
  return tasks.filter((task) => task.status === 'queued' || task.status === 'running');
}

function pendingSourceBytes(tasks: NotebookGenerationQueueTask[]) {
  return pendingTasks(tasks).reduce((sum, task) => sum + (task.fileSize ?? 0), 0);
}

function taskSort(a: NotebookGenerationQueueTask, b: NotebookGenerationQueueTask) {
  return a.createdAt - b.createdAt;
}

function buildQueuedPlannedPages(
  input: QueueableNotebookInput,
): NotebookGenerationQueueTask['plannedPages'] {
  return input.confirmedImageNotebookOutlines?.map((outline, index) => {
    const focus = [
      outline.teachingObjective,
      outline.studentThinkingMove,
      outline.description,
      ...(outline.keyPoints || []).slice(0, 2),
    ]
      .filter((item): item is string => Boolean(item?.trim()))
      .join(' ');
    return {
      id: outline.id || `${index + 1}`,
      title: outline.title || `第 ${index + 1} 页`,
      focus: focus || '等待当前页面规划内容。',
    };
  });
}

function mergeGeneratedPageThumbnails(
  current: NotebookGenerationQueueTask['generatedPageThumbnails'],
  updates?: NotebookGeneratedPageThumbnail[],
): NotebookGenerationQueueTask['generatedPageThumbnails'] | undefined {
  if (!updates?.length) return current;
  const next: Record<number, string> = { ...(current || {}) };
  for (const update of updates) {
    if (update.pageNumber > 0 && update.imageUrl.trim()) {
      next[update.pageNumber] = update.imageUrl;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function collectGeneratedPageThumbnails(
  result: NotebookGenerationTaskResult,
): NotebookGenerationQueueTask['generatedPageThumbnails'] | undefined {
  const updates = result.scenes
    .map((scene, index) => {
      const imageUrl = getFullPageImageUrlFromScene(scene);
      if (!imageUrl) return null;
      const pageNumber = Number.isFinite(scene.order) && scene.order > 0 ? scene.order : index + 1;
      return { pageNumber, imageUrl };
    })
    .filter((entry): entry is NotebookGeneratedPageThumbnail => Boolean(entry));
  return mergeGeneratedPageThumbnails(undefined, updates);
}

function getTask(taskId: string): NotebookGenerationQueueTask | undefined {
  return useNotebookGenerationQueueStore.getState().tasks.find((task) => task.id === taskId);
}

function patchTask(taskId: string, patch: Partial<NotebookGenerationQueueTask>) {
  useNotebookGenerationQueueStore.setState((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch, updatedAt: Date.now() } : task,
    ),
  }));
}

function releaseTaskRuntime(taskId: string) {
  runtimeByTaskId.delete(taskId);
  sourceFileByTaskId.delete(taskId);
}

function scheduleRunner() {
  if (runnerScheduled) return;
  runnerScheduled = true;
  queueMicrotask(() => {
    runnerScheduled = false;
    void runNextTask();
  });
}

async function runNextTask() {
  if (activeController) return;

  const nextTask = useNotebookGenerationQueueStore
    .getState()
    .tasks.filter((task) => task.status === 'queued')
    .sort(taskSort)[0];
  if (!nextTask) return;

  const runtime = runtimeByTaskId.get(nextTask.id);
  if (!runtime) {
    patchTask(nextTask.id, {
      status: 'failed',
      error: '任务运行数据已丢失，请重新提交。',
    });
    scheduleRunner();
    return;
  }

  const controller = new AbortController();
  activeController = controller;
  patchTask(nextTask.id, { status: 'running', error: undefined });

  try {
    const result = await runQueuedAiTask(
      {
        kind: 'course-generation',
        title: '课程生成',
        description: nextTask.requirement || nextTask.fileName || '正在生成课程笔记本',
        signal: controller.signal,
      },
      ({ signal }) =>
        runNotebookGenerationTask({
          ...runtime.input,
          sourceFile: sourceFileByTaskId.get(nextTask.id) ?? null,
          signal,
          onProgress: (progress) => {
            const notebookId =
              'notebookId' in progress && typeof progress.notebookId === 'string'
                ? progress.notebookId
                : undefined;
            const notebookName =
              'notebookName' in progress && typeof progress.notebookName === 'string'
                ? progress.notebookName
                : undefined;
            const currentTask = getTask(nextTask.id);
            const generatedPageThumbnails =
              progress.stage === 'scene'
                ? mergeGeneratedPageThumbnails(
                    currentTask?.generatedPageThumbnails,
                    progress.generatedPageThumbnails,
                  )
                : currentTask?.generatedPageThumbnails;
            patchTask(nextTask.id, {
              progress,
              ...(generatedPageThumbnails ? { generatedPageThumbnails } : {}),
              ...(notebookId ? { notebookId } : {}),
              ...(notebookName ? { notebookName } : {}),
            });
            const fresh = getTask(nextTask.id);
            if (fresh) runtime.callbacks?.onProgress?.(fresh, progress);
          },
        }),
    );

    const latestAfterRun = getTask(nextTask.id);
    if (controller.signal.aborted && latestAfterRun?.status === 'cancelled') {
      runtime.callbacks?.onCancelled?.(latestAfterRun);
      return;
    }

    patchTask(nextTask.id, {
      status: 'completed',
      notebookId: result.stage.id,
      notebookName: result.stage.name,
      generatedPageThumbnails:
        mergeGeneratedPageThumbnails(
          latestAfterRun?.generatedPageThumbnails,
          Object.entries(collectGeneratedPageThumbnails(result) || {}).map(
            ([pageNumber, imageUrl]) => ({
              pageNumber: Number(pageNumber),
              imageUrl,
            }),
          ),
        ) || latestAfterRun?.generatedPageThumbnails,
      progress: {
        stage: 'completed',
        detail:
          runtime.input.generateSlides === false
            ? '已加入仓库（未生成图片 notebook）'
            : result.failedScenes && result.failedScenes.length > 0
              ? `已完成，成功生成 ${result.scenes.length} 页，跳过 ${result.failedScenes.length} 页失败页面`
              : `已完成，共生成 ${result.scenes.length} 页`,
        notebookId: result.stage.id,
        notebookName: result.stage.name,
      },
    });
    const fresh = getTask(nextTask.id);
    if (fresh) runtime.callbacks?.onCompleted?.(fresh, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fresh = getTask(nextTask.id);
    if (controller.signal.aborted && fresh?.status === 'cancelled') {
      if (fresh) runtime.callbacks?.onCancelled?.(fresh);
    } else {
      patchTask(nextTask.id, { status: 'failed', error: message });
      const failed = getTask(nextTask.id);
      if (failed) runtime.callbacks?.onFailed?.(failed, message);
    }
  } finally {
    if (activeController === controller) activeController = null;
    releaseTaskRuntime(nextTask.id);
    scheduleRunner();
  }
}

export const useNotebookGenerationQueueStore = create<NotebookGenerationQueueState>()(
  (set, get) => ({
    tasks: [],
    enqueue: (input, callbacks) => {
      const file = input.sourceFile ?? null;
      const active = pendingTasks(get().tasks);
      if (active.length >= NOTEBOOK_GENERATION_QUEUE_MAX_PENDING) {
        throw new Error(
          `生成队列最多保留 ${NOTEBOOK_GENERATION_QUEUE_MAX_PENDING} 个待处理任务，请等待或取消部分任务后再提交。`,
        );
      }
      if (
        pendingSourceBytes(get().tasks) + (file?.size ?? 0) >
        NOTEBOOK_GENERATION_QUEUE_MAX_SOURCE_BYTES
      ) {
        throw new Error('生成队列中的源文件总大小已超过 100MB，请等待或取消部分任务后再提交。');
      }

      const id = input.generationTaskId?.trim() || nanoid(12);
      const now = Date.now();
      const task: NotebookGenerationQueueTask = {
        id,
        courseId: input.courseId,
        requirement: input.requirement,
        status: 'queued',
        fileName: file?.name,
        fileSize: file?.size,
        generateSlides: input.generateSlides ?? true,
        plannedPages: buildQueuedPlannedPages(input),
        createdAt: now,
        updatedAt: now,
      };
      const { sourceFile: _sourceFile, ...runtimeInput } = input;
      runtimeByTaskId.set(id, {
        input: runtimeInput,
        callbacks,
      });
      if (file) sourceFileByTaskId.set(id, file);
      set((state) => ({ tasks: [...state.tasks, task] }));
      scheduleRunner();
      return task;
    },
    cancel: (taskId) => {
      const task = getTask(taskId);
      if (!task) return;
      if (task.status === 'queued') {
        patchTask(taskId, { status: 'cancelled' });
        const runtime = runtimeByTaskId.get(taskId);
        const fresh = getTask(taskId);
        releaseTaskRuntime(taskId);
        if (fresh) runtime?.callbacks?.onCancelled?.(fresh);
        return;
      }
      if (task.status === 'running') {
        patchTask(taskId, { status: 'cancelled' });
        activeController?.abort();
      }
    },
    clearFinished: () => {
      set((state) => ({
        tasks: state.tasks.filter((task) => task.status === 'queued' || task.status === 'running'),
      }));
    },
  }),
);
