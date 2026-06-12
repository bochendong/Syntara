'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  ListChecks,
  Loader2,
  X,
} from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AiTaskRecord } from '@/lib/store/ai-task-queue';
import { useAiTaskQueueStore } from '@/lib/store/ai-task-queue';
import {
  MEMORY_ACTIVITY_EVENT,
  isActiveMemoryActivityStatus,
  useMemoryActivityStore,
  type MemoryActivityEventDetail,
  type MemoryActivityRecord,
} from '@/lib/store/memory-activity';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara-live2d-study-companion-position-v2';
const EDGE_PADDING = 12;
const DESKTOP_SIZE = { width: 190, height: 270 };
const MOBILE_SIZE = { width: 112, height: 168 };

type CompanionMode = 'desktop' | 'mobile';

type CompanionPosition = {
  x: number;
  y: number;
};

type CompanionSize = typeof DESKTOP_SIZE;

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
};

export function Live2DStudyCompanion() {
  const modelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const tasks = useAiTaskQueueStore((state) => state.tasks);
  const memoryActivities = useMemoryActivityStore((state) => state.activities);
  const addMemoryActivity = useMemoryActivityStore((state) => state.addActivity);
  const updateMemoryActivity = useMemoryActivityStore((state) => state.updateActivity);
  const dismissMemoryActivity = useMemoryActivityStore((state) => state.dismissActivity);
  const [size, setSize] = useState<CompanionSize>(DESKTOP_SIZE);
  const [position, setPosition] = useState<CompanionPosition | null>(null);
  const latestPositionRef = useRef<CompanionPosition | null>(null);
  const latestModeRef = useRef<CompanionMode | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const queueTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === 'running' || task.status === 'queued')
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
          return a.createdAt - b.createdAt;
        }),
    [tasks],
  );
  const runningCount = queueTasks.filter((task) => task.status === 'running').length;
  const queuedCount = queueTasks.filter((task) => task.status === 'queued').length;
  const visibleMemoryActivities = useMemo(
    () =>
      memoryActivities
        .slice()
        .sort((a, b) => {
          const aActive = isActiveMemoryActivityStatus(a.status);
          const bActive = isActiveMemoryActivityStatus(b.status);
          if (aActive !== bActive) return aActive ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        })
        .slice(0, 8),
    [memoryActivities],
  );
  const activeMemoryCount = visibleMemoryActivities.filter((activity) =>
    isActiveMemoryActivityStatus(activity.status),
  ).length;
  const writingMemoryCount = visibleMemoryActivities.filter(
    (activity) =>
      activity.status === 'detecting' ||
      activity.status === 'writing_fact' ||
      activity.status === 'writing_study_memory' ||
      activity.status === 'indexing_source',
  ).length;
  const needsMemoryConfirmationCount = visibleMemoryActivities.filter(
    (activity) => activity.status === 'needs_confirmation',
  ).length;
  const recentCompletedMemoryCount = visibleMemoryActivities.filter(
    (activity) => activity.status === 'completed',
  ).length;
  const attentionCount = runningCount + writingMemoryCount;
  const secondaryCount = queuedCount + needsMemoryConfirmationCount;
  const hasPanelItems = queueTasks.length > 0 || visibleMemoryActivities.length > 0;

  useEffect(() => {
    const handleMemoryActivity = (event: Event) => {
      const detail = (event as CustomEvent<MemoryActivityEventDetail>).detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.type === 'add') {
        addMemoryActivity(detail.activity);
        return;
      }
      if (detail.type === 'update') {
        updateMemoryActivity(detail.id, detail.patch);
        return;
      }
      if (detail.type === 'dismiss') {
        dismissMemoryActivity(detail.id);
      }
    };
    window.addEventListener(MEMORY_ACTIVITY_EVENT, handleMemoryActivity);
    return () => window.removeEventListener(MEMORY_ACTIVITY_EVENT, handleMemoryActivity);
  }, [addMemoryActivity, dismissMemoryActivity, updateMemoryActivity]);

  useEffect(() => {
    if (activeMemoryCount <= 0) return undefined;
    const frameId = window.requestAnimationFrame(() => setQueueOpen(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [activeMemoryCount]);

  const moveTo = useCallback(
    (nextPosition: CompanionPosition, nextSize: CompanionSize = size) => {
      const clamped = clampPosition(nextPosition, nextSize);
      latestPositionRef.current = clamped;
      setPosition(clamped);
    },
    [size],
  );

  useLayoutEffect(() => {
    const syncPosition = () => {
      const nextMode = resolveCompanionMode();
      const nextSize = resolveCompanionSize();
      const modeChanged = latestModeRef.current !== nextMode;
      const storedPosition = nextMode === 'desktop' ? readStoredPosition() : null;

      latestModeRef.current = nextMode;
      setSize(nextSize);
      moveTo(
        modeChanged
          ? (storedPosition ?? getDefaultPosition(nextSize))
          : (latestPositionRef.current ?? storedPosition ?? getDefaultPosition(nextSize)),
        nextSize,
      );
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    return () => window.removeEventListener('resize', syncPosition);
  }, [moveTo]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isCompanionAction(event.target)) return;

    const startPosition = position ?? getDefaultPosition(size);
    latestPositionRef.current = startPosition;
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: startPosition.x,
      startY: startPosition.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    moveTo({
      x: dragState.startX + event.clientX - dragState.originX,
      y: dragState.startY + event.clientY - dragState.originY,
    });
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (resolveCompanionMode() === 'desktop') {
      persistPosition(latestPositionRef.current);
    }
  };

  const style: CSSProperties = position
    ? {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }
    : {
        right: 20,
        bottom: 18,
        width: size.width,
        height: size.height,
      };

  return (
    <div
      data-study-companion-root
      className={cn(
        'pointer-events-auto fixed z-[1450] select-none bg-transparent touch-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
    >
      <TalkingAvatarOverlay
        layout="card"
        cardFraming="stage"
        speaking={false}
        cadence="idle"
        speechText={null}
        modelIdOverride={modelId}
        showBadge={false}
        className="h-full min-h-0"
      />

      <div
        data-study-companion-action
        className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1"
      >
        <button
          type="button"
          aria-label={queueOpen ? '关闭任务队列' : '打开任务队列'}
          title="任务队列"
          className={cn(
            'relative inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-full border border-white/[0.65] bg-black/38 px-2 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)] backdrop-blur-md transition hover:bg-black/52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            (runningCount > 0 || writingMemoryCount > 0) && 'bg-sky-600/82 hover:bg-sky-600/92',
            activeMemoryCount > 0 &&
              runningCount === 0 &&
              'bg-emerald-600/82 hover:bg-emerald-600/92',
          )}
          onClick={() => setQueueOpen((open) => !open)}
        >
          {runningCount > 0 || writingMemoryCount > 0 ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} />
          ) : activeMemoryCount > 0 || recentCompletedMemoryCount > 0 ? (
            <BrainCircuit className="size-3.5" strokeWidth={2.2} />
          ) : (
            <ListChecks className="size-3.5" strokeWidth={2.2} />
          )}
          <span className="tabular-nums text-[11px] font-semibold leading-none">
            {attentionCount}
          </span>
          {secondaryCount > 0 ? (
            <span className="rounded-full bg-white/18 px-1 text-[10px] font-semibold leading-4">
              +{secondaryCount}
            </span>
          ) : null}
          {recentCompletedMemoryCount > 0 && activeMemoryCount === 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border border-white bg-emerald-300"
            />
          ) : null}
        </button>
      </div>

      {queueOpen ? (
        <div
          data-study-companion-action
          className="absolute bottom-full right-0 z-20 mb-2 flex w-[min(292px,calc(100vw-2rem))] flex-col items-end gap-2 text-slate-900 dark:text-slate-50"
        >
          {hasPanelItems ? (
            <ul className="flex max-h-60 w-full flex-col items-end gap-2 overflow-y-auto pr-1">
              {visibleMemoryActivities.map((activity) => (
                <li
                  key={activity.id}
                  className={cn(
                    'relative w-full max-w-[272px] rounded-2xl border px-3 py-2.5 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl',
                    memoryActivityBubbleClass(activity),
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -bottom-1 right-7 size-3 rotate-45 border-b border-r',
                      memoryActivityTailClass(activity),
                    )}
                  />
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                        memoryActivityIconClass(activity),
                      )}
                    >
                      {memoryActivityIcon(activity)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold">{activity.title}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px]',
                            memoryActivityStatusClass(activity),
                          )}
                        >
                          {memoryActivityStatusLabel(activity)}
                        </span>
                      </div>
                      <p className="mt-0.5 max-h-10 overflow-hidden text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                        {compactTaskDescription(activity.description || '记忆活动已同步')}
                      </p>
                      {activity.chips.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {activity.chips.slice(0, 4).map((chip) => (
                            <span
                              key={chip}
                              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
                            >
                              {memoryActivityChipLabel(chip)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {memoryActivityHasActions(activity) ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          {activity.detailHref ? (
                            <a
                              href={activity.detailHref}
                              className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                            >
                              查看
                            </a>
                          ) : null}
                          {activity.status === 'needs_confirmation' ? (
                            <button
                              type="button"
                              className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15"
                              onClick={() => dismissMemoryActivity(activity.id)}
                            >
                              稍后
                            </button>
                          ) : null}
                          {activity.status === 'failed' ||
                          activity.status === 'completed' ||
                          activity.status === 'skipped' ? (
                            <button
                              type="button"
                              title="关闭"
                              aria-label={`关闭${activity.title}`}
                              className="inline-flex size-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
                              onClick={() => dismissMemoryActivity(activity.id)}
                            >
                              <X className="size-3.5" strokeWidth={2.1} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
              {queueTasks.map((task) => (
                <li
                  key={task.id}
                  className="relative w-full max-w-[272px] rounded-2xl border border-white/75 bg-white/[0.92] px-3 py-2.5 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/[0.86]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 right-7 size-3 rotate-45 border-b border-r border-white/75 bg-white/[0.92] dark:border-white/15 dark:bg-slate-950/[0.86]"
                  />
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                        task.status === 'running'
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                      )}
                    >
                      {task.status === 'running' ? (
                        <Loader2 className="size-3 animate-spin" strokeWidth={2.2} />
                      ) : (
                        <Clock3 className="size-3" strokeWidth={2.2} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold">{task.title}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px]',
                            taskStatusClass(task),
                          )}
                        >
                          {taskStatusLabel(task)}
                        </span>
                      </div>
                      <p className="mt-0.5 max-h-10 overflow-hidden text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                        {compactTaskDescription(task.description)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative w-full max-w-[272px] rounded-2xl border border-dashed border-slate-200/90 bg-white/[0.9] px-3 py-3 text-[12px] text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/[0.82] dark:text-slate-400">
              <span
                aria-hidden="true"
                className="absolute -bottom-1 right-7 size-3 rotate-45 border-b border-r border-dashed border-slate-200/90 bg-white/[0.9] dark:border-white/12 dark:bg-slate-950/[0.82]"
              />
              暂无运行中的 AI 任务或记忆活动
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function taskStatusLabel(task: AiTaskRecord) {
  if (task.status === 'running') return '运行中';
  if (task.status === 'queued') return '排队中';
  return '已结束';
}

function taskStatusClass(task: AiTaskRecord) {
  if (task.status === 'running') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';
}

function memoryActivityIcon(activity: MemoryActivityRecord) {
  if (
    activity.status === 'detecting' ||
    activity.status === 'writing_fact' ||
    activity.status === 'writing_study_memory' ||
    activity.status === 'indexing_source'
  ) {
    return <Loader2 className="size-3 animate-spin" strokeWidth={2.2} />;
  }
  if (activity.status === 'completed') {
    return <CheckCircle2 className="size-3" strokeWidth={2.2} />;
  }
  if (activity.status === 'failed') {
    return <AlertCircle className="size-3" strokeWidth={2.2} />;
  }
  if (activity.layer === 'knowledge_index') {
    return <Database className="size-3" strokeWidth={2.2} />;
  }
  return <BrainCircuit className="size-3" strokeWidth={2.2} />;
}

function memoryActivityStatusLabel(activity: MemoryActivityRecord) {
  if (activity.status === 'detecting') return '判断中';
  if (activity.status === 'writing_fact') return '更新中';
  if (activity.status === 'writing_study_memory') return '写入中';
  if (activity.status === 'indexing_source') return '索引中';
  if (activity.status === 'needs_confirmation') return '待确认';
  if (activity.status === 'completed') return '已写入';
  if (activity.status === 'failed') return '失败';
  return '已跳过';
}

function memoryActivityStatusClass(activity: MemoryActivityRecord) {
  if (activity.status === 'completed') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200';
  }
  if (activity.status === 'failed') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200';
  }
  if (activity.status === 'needs_confirmation') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200';
  }
  if (activity.status === 'skipped') {
    return 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';
  }
  return 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200';
}

function memoryActivityIconClass(activity: MemoryActivityRecord) {
  if (activity.status === 'completed') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200';
  }
  if (activity.status === 'failed') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200';
  }
  if (activity.status === 'needs_confirmation') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200';
  }
  if (activity.layer === 'knowledge_index') {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200';
  }
  return 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200';
}

function memoryActivityBubbleClass(activity: MemoryActivityRecord) {
  if (activity.status === 'completed') {
    return 'border-emerald-200/80 bg-emerald-50/[0.94] dark:border-emerald-300/20 dark:bg-emerald-950/[0.74]';
  }
  if (activity.status === 'failed') {
    return 'border-rose-200/80 bg-rose-50/[0.94] dark:border-rose-300/20 dark:bg-rose-950/[0.74]';
  }
  if (activity.status === 'needs_confirmation') {
    return 'border-amber-200/80 bg-amber-50/[0.94] dark:border-amber-300/20 dark:bg-amber-950/[0.74]';
  }
  return 'border-white/75 bg-white/[0.92] dark:border-white/15 dark:bg-slate-950/[0.86]';
}

function memoryActivityTailClass(activity: MemoryActivityRecord) {
  if (activity.status === 'completed') {
    return 'border-emerald-200/80 bg-emerald-50/[0.94] dark:border-emerald-300/20 dark:bg-emerald-950/[0.74]';
  }
  if (activity.status === 'failed') {
    return 'border-rose-200/80 bg-rose-50/[0.94] dark:border-rose-300/20 dark:bg-rose-950/[0.74]';
  }
  if (activity.status === 'needs_confirmation') {
    return 'border-amber-200/80 bg-amber-50/[0.94] dark:border-amber-300/20 dark:bg-amber-950/[0.74]';
  }
  return 'border-white/75 bg-white/[0.92] dark:border-white/15 dark:bg-slate-950/[0.86]';
}

function memoryActivityHasActions(activity: MemoryActivityRecord) {
  return (
    Boolean(activity.detailHref) ||
    activity.status === 'needs_confirmation' ||
    activity.status === 'failed' ||
    activity.status === 'completed' ||
    activity.status === 'skipped'
  );
}

function memoryActivityChipLabel(chip: string) {
  if (chip === 'public') return '公共';
  if (chip === 'private') return '私有';
  if (chip === 'course') return '课程';
  if (chip === 'notebook') return '笔记本';
  if (chip === 'user') return '全局';
  if (chip === 'conversation') return '当前对话';
  return chip;
}

function compactTaskDescription(description: string) {
  const text = description.replace(/\s+/g, ' ').trim();
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function resolveCompanionSize(): CompanionSize {
  if (typeof window === 'undefined') return DESKTOP_SIZE;
  return resolveCompanionMode() === 'mobile' ? MOBILE_SIZE : DESKTOP_SIZE;
}

function resolveCompanionMode(): CompanionMode {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 1024 ? 'mobile' : 'desktop';
}

function getDefaultPosition(size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return clampPosition(
    {
      x: window.innerWidth - size.width - 20,
      y: window.innerHeight - size.height - 18,
    },
    size,
  );
}

function clampPosition(position: CompanionPosition, size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - size.width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - size.height - EDGE_PADDING);

  return {
    x: Math.min(Math.max(position.x, EDGE_PADDING), maxX),
    y: Math.min(Math.max(position.y, EDGE_PADDING), maxY),
  };
}

function readStoredPosition(): CompanionPosition | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompanionPosition>;
    const { x, y } = parsed;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function persistPosition(position: CompanionPosition | null) {
  if (typeof window === 'undefined' || !position) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Position persistence is a convenience only.
  }
}

function isCompanionAction(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-study-companion-action]') != null;
}
