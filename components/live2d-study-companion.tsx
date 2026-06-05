'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock3, ListChecks, Loader2 } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AiTaskRecord } from '@/lib/store/ai-task-queue';
import { useAiTaskQueueStore } from '@/lib/store/ai-task-queue';
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
            'inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-full border border-white/[0.65] bg-black/38 px-2 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)] backdrop-blur-md transition hover:bg-black/52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            runningCount > 0 && 'bg-sky-600/82 hover:bg-sky-600/92',
          )}
          onClick={() => setQueueOpen((open) => !open)}
        >
          {runningCount > 0 ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} />
          ) : (
            <ListChecks className="size-3.5" strokeWidth={2.2} />
          )}
          <span className="tabular-nums text-[11px] font-semibold leading-none">
            {runningCount}
          </span>
          {queuedCount > 0 ? (
            <span className="rounded-full bg-white/18 px-1 text-[10px] font-semibold leading-4">
              +{queuedCount}
            </span>
          ) : null}
        </button>
      </div>

      {queueOpen ? (
        <div
          data-study-companion-action
          className="absolute bottom-full right-0 z-20 mb-2 flex w-[min(292px,calc(100vw-2rem))] flex-col items-end gap-2 text-slate-900 dark:text-slate-50"
        >
          {queueTasks.length > 0 ? (
            <ul className="flex max-h-60 w-full flex-col items-end gap-2 overflow-y-auto pr-1">
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
              暂无运行中的 AI 任务
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
