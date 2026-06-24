'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  FileSearch,
  History,
  ImageIcon,
  ListChecks,
  Loader2,
  MessagesSquare,
  Presentation,
  Video,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import {
  COURSE_REPLY_PROGRESS_EVENT,
  type CourseReplyProgressEventDetail,
} from '@/lib/chat/course-reply-progress';
import { useAiTaskQueueStore, type AiTaskRecord } from '@/lib/store/ai-task-queue';
import {
  MEMORY_ACTIVITY_EVENT,
  isActiveMemoryActivityStatus,
  useMemoryActivityStore,
  type MemoryActivityEventDetail,
  type MemoryActivityRecord,
} from '@/lib/store/memory-activity';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
import { ClassroomTaskHistoryPopup } from '@/components/task-history/classroom-task-history-page-client';

const STORAGE_KEY = 'syntara-live2d-study-companion-position-v2';
const MEMORY_STATUS_MOCK_QUERY_PARAM = 'memoryStatusMock';
const MEMORY_STATUS_MOCK_ACTIVITY_IDS = [
  'live2d-memory-status-mock-schedule',
  'live2d-memory-status-mock-preference',
  'live2d-memory-status-mock-progress',
  'live2d-memory-status-mock-weakness',
  'live2d-memory-status-mock-mastery',
  'live2d-memory-status-mock-source',
  'live2d-memory-status-mock-next-step',
] as const;
const EDGE_PADDING = 12;
const DESKTOP_SIZE = { width: 190, height: 270 };
const MOBILE_SIZE = { width: 112, height: 168 };
const LEARN_MOBILE_SIZE = { width: 76, height: 114 };

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

type MemoryStatusMockMode = 'off' | 'running' | 'flow';
type StatusTone = 'running' | 'queued' | 'attention' | 'completed' | 'failed' | 'skipped';
type QueueTone = 'idle' | 'running' | 'attention' | 'completed';

export function Live2DStudyCompanion({ onCollapse }: { onCollapse?: () => void }) {
  const modelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const setLive2DPresenterVisible = useSettingsStore((state) => state.setLive2DPresenterVisible);
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
  const memoryStatusMockTimersRef = useRef<number[]>([]);
  const replyProgressClearTimerRef = useRef<number | null>(null);
  const appliedMemoryStatusMockModeRef = useRef<MemoryStatusMockMode>('off');
  const [dragging, setDragging] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [replyProgress, setReplyProgress] = useState<CourseReplyProgressEventDetail | null>(null);
  const [memoryStatusMockMode, setMemoryStatusMockMode] = useState<MemoryStatusMockMode>(() =>
    readMemoryStatusMockModeFromLocation(),
  );
  const locationMemoryStatusMockMode = readMemoryStatusMockModeFromLocation();
  const effectiveMemoryStatusMockMode =
    memoryStatusMockMode === 'off' && locationMemoryStatusMockMode !== 'off'
      ? locationMemoryStatusMockMode
      : memoryStatusMockMode;

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
  const queueTone = resolveQueueTone({
    runningCount,
    writingMemoryCount,
    needsMemoryConfirmationCount,
    activeMemoryCount,
    recentCompletedMemoryCount,
  });

  const clearMemoryStatusMockTimers = useCallback(() => {
    for (const timerId of memoryStatusMockTimersRef.current) {
      window.clearTimeout(timerId);
    }
    memoryStatusMockTimersRef.current = [];
  }, []);

  const openTaskHistory = useCallback(() => {
    setQueueOpen(false);
    setTaskHistoryOpen(true);
  }, []);

  const dismissMemoryStatusMockActivities = useCallback(() => {
    for (const id of MEMORY_STATUS_MOCK_ACTIVITY_IDS) {
      dismissMemoryActivity(id);
    }
  }, [dismissMemoryActivity]);

  const showRunningMemoryStatusMock = useCallback(() => {
    clearMemoryStatusMockTimers();
    dismissMemoryStatusMockActivities();

    addMemoryActivity({
      id: 'live2d-memory-status-mock-schedule',
      title: '课程安排已更新',
      description:
        '课程安排：CSC108 下周五有 midterm。之后安排复习和小测时，我会优先避开考试前的高压时间。',
      status: 'completed',
      layer: 'study_memory',
      chips: ['课程安排', '考试'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-preference',
      title: '学习偏好已更新',
      description:
        '学习偏好：你更希望先看一个具体例子，再回到定义和规则。之后讲新概念时我会按这个顺序来。',
      status: 'completed',
      layer: 'structured_fact',
      chips: ['学习偏好'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-progress',
      title: '学习进度写入中',
      description: '学习进度：正在学习 03 循环，重点是 range、for、while 和嵌套循环。',
      status: 'writing_study_memory',
      layer: 'study_memory',
      chips: ['学习进度', 'CSC108'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-weakness',
      title: '薄弱点写入中',
      description:
        '薄弱点：循环边界和 range 的停止位置还不稳，尤其容易把最后一次循环是否执行判断错。',
      status: 'writing_study_memory',
      layer: 'study_memory',
      chips: ['薄弱点', '循环'],
    });
    setQueueOpen(true);
  }, [addMemoryActivity, clearMemoryStatusMockTimers, dismissMemoryStatusMockActivities]);

  const replayMemoryStatusMock = useCallback(() => {
    clearMemoryStatusMockTimers();
    dismissMemoryStatusMockActivities();

    addMemoryActivity({
      id: 'live2d-memory-status-mock-schedule',
      title: '课程安排写入中',
      description: '课程安排：你说 CSC108 下周五有 midterm，我正在把它放进之后的复习规划里。',
      status: 'writing_study_memory',
      layer: 'study_memory',
      chips: ['课程安排', '考试'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-preference',
      title: '学习偏好写入中',
      description: '学习偏好：你更喜欢先看例子，再看定义。之后我会按这个顺序组织讲解。',
      status: 'writing_fact',
      layer: 'structured_fact',
      chips: ['学习偏好'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-progress',
      title: '学习进度写入中',
      description: '学习进度：正在学习 03 循环，范围包括 range、for、while 和嵌套循环。',
      status: 'writing_study_memory',
      layer: 'study_memory',
      chips: ['学习进度', 'CSC108'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-weakness',
      title: '薄弱点写入中',
      description: '薄弱点：循环边界和 range 的停止位置还不稳，需要用小题继续确认。',
      status: 'writing_study_memory',
      layer: 'study_memory',
      chips: ['薄弱点', '循环'],
    });
    addMemoryActivity({
      id: 'live2d-memory-status-mock-source',
      title: '资料理解写入中',
      description: '资料理解：我正在把循环讲义和刚才的小测题整理成之后可以检索的课程依据。',
      status: 'indexing_source',
      layer: 'knowledge_index',
      chips: ['资料理解', '题目'],
    });
    setQueueOpen(true);

    const timers = [
      window.setTimeout(() => {
        updateMemoryActivity('live2d-memory-status-mock-schedule', {
          title: '课程安排已更新',
          status: 'completed',
          description:
            '课程安排：CSC108 下周五有 midterm。之后安排复习和小测时，我会优先围绕这个时间倒排。',
        });
      }, 700),
      window.setTimeout(() => {
        updateMemoryActivity('live2d-memory-status-mock-preference', {
          title: '学习偏好已更新',
          status: 'completed',
          description:
            '学习偏好：你更喜欢先看例子，再看定义。之后讲新概念时我会先给一个可运行的小例子。',
        });
      }, 1200),
      window.setTimeout(() => {
        updateMemoryActivity('live2d-memory-status-mock-progress', {
          title: '学习进度已更新',
          status: 'completed',
          description:
            '学习进度：你现在定位在 03 循环。下一轮复习会从 range、for、while 和嵌套循环接上。',
        });
      }, 1700),
      window.setTimeout(() => {
        addMemoryActivity({
          id: 'live2d-memory-status-mock-mastery',
          title: '掌握情况已更新',
          description: '掌握情况：你已经能读懂简单 for 循环，并能说出循环变量每轮怎样变化。',
          status: 'completed',
          layer: 'study_memory',
          chips: ['掌握情况', '循环'],
        });
      }, 2300),
      window.setTimeout(() => {
        updateMemoryActivity('live2d-memory-status-mock-weakness', {
          title: '薄弱点已更新',
          status: 'completed',
          description:
            '薄弱点：range 的停止位置和 while 的终止条件还不稳。下一步要用 2-3 道边界小题来补。',
        });
      }, 2800),
      window.setTimeout(() => {
        addMemoryActivity({
          id: 'live2d-memory-status-mock-next-step',
          title: '下一步学习建议已更新',
          description:
            '下一步：先做一组循环边界判断题，再让你自己写一个带 accumulator 的 while 循环。',
          status: 'completed',
          layer: 'study_memory',
          chips: ['下一步', '练习'],
        });
      }, 3400),
      window.setTimeout(() => {
        updateMemoryActivity('live2d-memory-status-mock-source', {
          title: '资料理解已更新',
          status: 'completed',
          description:
            '资料理解：循环讲义和小测题已经整理好。之后问到 range/for/while，我可以回到这些材料里找依据。',
        });
      }, 4100),
    ];
    memoryStatusMockTimersRef.current = timers;
  }, [
    addMemoryActivity,
    clearMemoryStatusMockTimers,
    dismissMemoryStatusMockActivities,
    updateMemoryActivity,
  ]);

  useEffect(() => {
    const syncMemoryStatusMock = () => {
      setMemoryStatusMockMode(readMemoryStatusMockModeFromLocation());
    };

    syncMemoryStatusMock();
    window.addEventListener('popstate', syncMemoryStatusMock);
    return () => window.removeEventListener('popstate', syncMemoryStatusMock);
  }, []);

  useEffect(() => {
    if (effectiveMemoryStatusMockMode === 'off') {
      clearMemoryStatusMockTimers();
      dismissMemoryStatusMockActivities();
      appliedMemoryStatusMockModeRef.current = 'off';
      return undefined;
    }

    if (appliedMemoryStatusMockModeRef.current === effectiveMemoryStatusMockMode) {
      return undefined;
    }

    const mode = effectiveMemoryStatusMockMode;
    const timerId = window.setTimeout(() => {
      appliedMemoryStatusMockModeRef.current = mode;
      if (mode === 'flow') {
        replayMemoryStatusMock();
        return;
      }
      showRunningMemoryStatusMock();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [
    clearMemoryStatusMockTimers,
    dismissMemoryStatusMockActivities,
    effectiveMemoryStatusMockMode,
    replayMemoryStatusMock,
    showRunningMemoryStatusMock,
  ]);

  useEffect(
    () => () => {
      clearMemoryStatusMockTimers();
      dismissMemoryStatusMockActivities();
      appliedMemoryStatusMockModeRef.current = 'off';
    },
    [clearMemoryStatusMockTimers, dismissMemoryStatusMockActivities],
  );

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
    const clearReplyProgressTimer = () => {
      if (replyProgressClearTimerRef.current == null) return;
      window.clearTimeout(replyProgressClearTimerRef.current);
      replyProgressClearTimerRef.current = null;
    };

    const handleReplyProgress = (event: Event) => {
      const detail = (event as CustomEvent<CourseReplyProgressEventDetail>).detail;
      if (!detail || typeof detail !== 'object') return;
      clearReplyProgressTimer();
      setReplyProgress(detail);
      if (detail.phase === 'completed' || detail.phase === 'failed') {
        replyProgressClearTimerRef.current = window.setTimeout(
          () => setReplyProgress(null),
          detail.phase === 'failed' ? 5200 : 3000,
        );
      }
    };

    window.addEventListener(COURSE_REPLY_PROGRESS_EVENT, handleReplyProgress);
    return () => {
      clearReplyProgressTimer();
      window.removeEventListener(COURSE_REPLY_PROGRESS_EVENT, handleReplyProgress);
    };
  }, []);

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
        speaking={Boolean(replyProgress)}
        cadence={replyProgress?.phase === 'failed' ? 'pause' : replyProgress ? 'active' : 'idle'}
        speechText={replyProgress?.line ?? null}
        modelIdOverride={modelId}
        showBadge={false}
        className="h-full min-h-0"
      />

      {replyProgress ? (
        <div
          data-study-companion-action
          className="absolute bottom-full right-0 z-10 mb-12 w-[min(278px,calc(100vw-2rem))] rounded-2xl border border-sky-200/80 bg-white/92 px-3 py-2.5 text-slate-700 shadow-[0_16px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-sky-300/20 dark:bg-slate-950/90 dark:text-slate-100 lg:bottom-auto lg:right-full lg:top-9 lg:mb-0 lg:mr-3"
        >
          <span
            aria-hidden="true"
            className="absolute -bottom-1 right-8 size-3 rotate-45 border-b border-r border-sky-200/80 bg-white/92 dark:border-sky-300/20 dark:bg-slate-950/90 lg:bottom-auto lg:-right-1 lg:top-8 lg:border-b-0 lg:border-l-0 lg:border-r lg:border-t"
          />
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100">
              {replyProgress.phase === 'completed' ? (
                <CheckCircle2 className="size-4" strokeWidth={2.2} />
              ) : replyProgress.phase === 'failed' ? (
                <AlertCircle className="size-4" strokeWidth={2.2} />
              ) : (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold leading-5 text-slate-900 dark:text-slate-50">
                {replyProgress.title || '课程回复进度'}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                {replyProgress.line}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {replyProgress.steps.map((step) => (
                  <span
                    key={step.id}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      step.status === 'complete'
                        ? 'bg-emerald-500'
                        : step.status === 'active'
                          ? 'bg-sky-500'
                          : 'bg-slate-200 dark:bg-slate-700',
                    )}
                    title={step.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        data-study-companion-action
        className="absolute bottom-full right-0 z-20 mb-2 flex items-center gap-1"
      >
        <button
          type="button"
          onClick={() => {
            if (onCollapse) {
              onCollapse();
              return;
            }
            setLive2DPresenterVisible(false);
          }}
          aria-label="关闭伴学角色"
          title="关闭伴学角色"
          className="inline-flex size-8 items-center justify-center rounded-full border border-white/[0.65] bg-white/82 text-slate-500 shadow-[0_8px_22px_rgba(15,23,42,0.18)] backdrop-blur-md transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 dark:bg-slate-950/72 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          <X className="size-3.5" strokeWidth={2.1} />
        </button>
        <button
          type="button"
          onClick={openTaskHistory}
          aria-label="打开任务历史"
          title="任务历史"
          className="inline-flex size-8 items-center justify-center rounded-full border border-white/[0.65] bg-white/82 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.18)] backdrop-blur-md transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 dark:bg-slate-950/72 dark:text-slate-100 dark:hover:bg-slate-900"
        >
          <History className="size-3.5" strokeWidth={2.1} />
        </button>
        <button
          type="button"
          aria-label={queueOpen ? '关闭任务队列' : '打开任务队列'}
          title="任务队列"
          className={cn(
            'relative inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-full border border-white/[0.65] px-2 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)] backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            queueButtonToneClass(queueTone),
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
          className="absolute bottom-full right-0 z-20 mb-12 flex w-[min(292px,calc(100vw-2rem))] flex-col items-end gap-2 text-slate-900 dark:text-slate-50"
        >
          {hasPanelItems ? (
            <ul className="flex max-h-48 w-full flex-col items-end gap-1.5 overflow-y-auto pr-1">
              {visibleMemoryActivities.map((activity) => (
                <li
                  key={activity.id}
                  className={cn(
                    'relative w-full max-w-[278px] rounded-xl border px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.15)] backdrop-blur-xl',
                    memoryActivityBubbleClass(activity),
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -bottom-1 right-6 size-2.5 rotate-45 border-b border-r',
                      memoryActivityTailClass(activity),
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <TaskLogoBadge
                      logo={memoryActivityLogo(activity)}
                      logoClassName={memoryActivityLogoClass(activity)}
                      tone={memoryActivityTone(activity)}
                    >
                      {memoryActivityStatusIcon(activity)}
                    </TaskLogoBadge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium leading-5 text-slate-700 dark:text-slate-200">
                        {activity.description || activity.title}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
              {queueTasks.map((task) => (
                <li
                  key={task.id}
                  className={cn(
                    'relative w-full max-w-[278px] rounded-xl border px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.15)] backdrop-blur-xl',
                    taskBubbleClass(task.status === 'running' ? 'running' : 'queued'),
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -bottom-1 right-6 size-2.5 rotate-45 border-b border-r',
                      taskTailClass(task.status === 'running' ? 'running' : 'queued'),
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <TaskLogoBadge
                      logo={aiTaskLogo(task)}
                      logoClassName={aiTaskLogoClass(task)}
                      tone={task.status === 'running' ? 'running' : 'queued'}
                    >
                      {aiTaskStatusIcon(task)}
                    </TaskLogoBadge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium leading-5 text-slate-700 dark:text-slate-200">
                        {task.description || task.title}
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
      <ClassroomTaskHistoryPopup open={taskHistoryOpen} onOpenChange={setTaskHistoryOpen} />
    </div>
  );
}

function TaskLogoBadge({
  logo,
  logoClassName,
  tone,
  children,
}: {
  logo: ReactNode;
  logoClassName: string;
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg border shadow-sm',
        logoClassName,
      )}
    >
      {logo}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full border border-white dark:border-slate-950',
          statusBadgeClass(tone),
        )}
      >
        {children}
      </span>
    </span>
  );
}

function memoryActivityStatusIcon(activity: MemoryActivityRecord) {
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
  if (activity.status === 'needs_confirmation') {
    return <AlertCircle className="size-3" strokeWidth={2.2} />;
  }
  if (activity.status === 'skipped') {
    return <Clock3 className="size-3" strokeWidth={2.2} />;
  }
  if (activity.layer === 'knowledge_index') {
    return <Database className="size-3" strokeWidth={2.2} />;
  }
  return <BrainCircuit className="size-3" strokeWidth={2.2} />;
}

function memoryActivityLogo(activity: MemoryActivityRecord) {
  const kind = memoryActivityVisualKind(activity);
  if (kind === 'source_index') return <Database className="size-4" strokeWidth={2} />;
  if (kind === 'study_memory') return <BrainCircuit className="size-4" strokeWidth={2} />;
  if (kind === 'evaluation') return <ClipboardCheck className="size-4" strokeWidth={2} />;
  if (kind === 'reply') return <MessagesSquare className="size-4" strokeWidth={2} />;
  if (kind === 'fact') return <FileSearch className="size-4" strokeWidth={2} />;
  return <History className="size-4" strokeWidth={2} />;
}

function memoryActivityLogoClass(activity: MemoryActivityRecord) {
  const kind = memoryActivityVisualKind(activity);
  if (kind === 'source_index') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-100';
  }
  if (kind === 'study_memory') {
    return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-100';
  }
  if (kind === 'evaluation') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100';
  }
  if (kind === 'reply') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100';
  }
  if (kind === 'fact') {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/12 dark:bg-white/10 dark:text-slate-200';
}

function memoryActivityVisualKind(activity: MemoryActivityRecord) {
  const text = `${activity.title} ${activity.description}`.toLowerCase();
  if (activity.layer === 'knowledge_index' || activity.status === 'indexing_source') {
    return 'source_index';
  }
  if (activity.layer === 'study_memory' || activity.status === 'writing_study_memory') {
    return 'study_memory';
  }
  if (activity.layer === 'structured_fact' || activity.status === 'writing_fact') {
    return 'fact';
  }
  if (text.includes('回复') || text.includes('答案') || activity.chips.includes('conversation')) {
    return 'reply';
  }
  if (text.includes('判断') || text.includes('正误') || text.includes('提交')) {
    return 'evaluation';
  }
  return 'memory';
}

function aiTaskStatusIcon(task: AiTaskRecord) {
  if (task.status === 'running') {
    return <Loader2 className="size-3 animate-spin" strokeWidth={2.2} />;
  }
  return <Clock3 className="size-3" strokeWidth={2.2} />;
}

function aiTaskLogo(task: AiTaskRecord) {
  if (task.kind === 'speech-generation') return <Volume2 className="size-4" strokeWidth={2} />;
  if (task.kind === 'image-generation') return <ImageIcon className="size-4" strokeWidth={2} />;
  if (task.kind === 'video-generation') return <Video className="size-4" strokeWidth={2} />;
  if (task.kind === 'micro-lesson') return <Presentation className="size-4" strokeWidth={2} />;
  if (task.kind === 'slide-repair') return <Wrench className="size-4" strokeWidth={2} />;
  if (task.kind === 'chat-reply' || task.kind === 'pbl-chat') {
    return <MessagesSquare className="size-4" strokeWidth={2} />;
  }
  if (task.kind === 'problem-evaluation' || task.kind === 'quiz-grading') {
    return <ClipboardCheck className="size-4" strokeWidth={2} />;
  }
  if (task.kind === 'review-route') return <ListChecks className="size-4" strokeWidth={2} />;
  if (task.kind === 'course-generation') return <FileSearch className="size-4" strokeWidth={2} />;
  return <BrainCircuit className="size-4" strokeWidth={2} />;
}

function aiTaskLogoClass(task: AiTaskRecord) {
  if (task.kind === 'speech-generation') {
    return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-300/20 dark:bg-teal-400/10 dark:text-teal-100';
  }
  if (task.kind === 'image-generation') {
    return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-100';
  }
  if (task.kind === 'video-generation') {
    return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-300/20 dark:bg-purple-400/10 dark:text-purple-100';
  }
  if (task.kind === 'micro-lesson') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100';
  }
  if (task.kind === 'slide-repair') {
    return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-300/20 dark:bg-orange-400/10 dark:text-orange-100';
  }
  if (task.kind === 'chat-reply' || task.kind === 'pbl-chat') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100';
  }
  if (task.kind === 'problem-evaluation' || task.kind === 'quiz-grading') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100';
  }
  if (task.kind === 'review-route') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100';
  }
  if (task.kind === 'course-generation') {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/12 dark:bg-white/10 dark:text-slate-200';
}

function memoryActivityBubbleClass(activity: MemoryActivityRecord) {
  return taskBubbleClass(memoryActivityTone(activity));
}

function memoryActivityTailClass(activity: MemoryActivityRecord) {
  return taskTailClass(memoryActivityTone(activity));
}

function memoryActivityTone(activity: MemoryActivityRecord): StatusTone {
  if (activity.status === 'completed') return 'completed';
  if (activity.status === 'failed') return 'failed';
  if (activity.status === 'needs_confirmation') return 'attention';
  if (activity.status === 'skipped') return 'skipped';
  return 'running';
}

function statusBadgeClass(tone: StatusTone) {
  if (tone === 'running') {
    return 'bg-blue-600 text-white shadow-[0_0_0_2px_rgba(37,99,235,0.12)]';
  }
  if (tone === 'completed') {
    return 'bg-emerald-600 text-white shadow-[0_0_0_2px_rgba(5,150,105,0.12)]';
  }
  if (tone === 'failed') {
    return 'bg-rose-600 text-white shadow-[0_0_0_2px_rgba(225,29,72,0.12)]';
  }
  if (tone === 'attention') {
    return 'bg-amber-500 text-white shadow-[0_0_0_2px_rgba(245,158,11,0.14)]';
  }
  return 'bg-slate-500 text-white shadow-[0_0_0_2px_rgba(100,116,139,0.12)]';
}

function taskBubbleClass(tone: StatusTone) {
  if (tone === 'running') {
    return 'border-blue-200/80 bg-white/[0.94] dark:border-blue-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'completed') {
    return 'border-emerald-200/80 bg-white/[0.94] dark:border-emerald-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'failed') {
    return 'border-rose-200/80 bg-white/[0.94] dark:border-rose-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'attention') {
    return 'border-amber-200/80 bg-white/[0.94] dark:border-amber-300/20 dark:bg-slate-950/[0.88]';
  }
  return 'border-slate-200/80 bg-white/[0.94] dark:border-white/15 dark:bg-slate-950/[0.88]';
}

function taskTailClass(tone: StatusTone) {
  if (tone === 'running') {
    return 'border-blue-200/80 bg-white/[0.94] dark:border-blue-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'completed') {
    return 'border-emerald-200/80 bg-white/[0.94] dark:border-emerald-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'failed') {
    return 'border-rose-200/80 bg-white/[0.94] dark:border-rose-300/20 dark:bg-slate-950/[0.88]';
  }
  if (tone === 'attention') {
    return 'border-amber-200/80 bg-white/[0.94] dark:border-amber-300/20 dark:bg-slate-950/[0.88]';
  }
  return 'border-slate-200/80 bg-white/[0.94] dark:border-white/15 dark:bg-slate-950/[0.88]';
}

function resolveQueueTone(args: {
  runningCount: number;
  writingMemoryCount: number;
  needsMemoryConfirmationCount: number;
  activeMemoryCount: number;
  recentCompletedMemoryCount: number;
}): QueueTone {
  if (args.runningCount > 0 || args.writingMemoryCount > 0) return 'running';
  if (args.needsMemoryConfirmationCount > 0) return 'attention';
  if (args.activeMemoryCount > 0 || args.recentCompletedMemoryCount > 0) return 'completed';
  return 'idle';
}

function queueButtonToneClass(tone: QueueTone) {
  if (tone === 'running') return 'bg-blue-600/86 hover:bg-blue-600/95';
  if (tone === 'attention') return 'bg-amber-500/90 hover:bg-amber-500';
  if (tone === 'completed') return 'bg-emerald-600/84 hover:bg-emerald-600/94';
  return 'bg-slate-950/48 hover:bg-slate-950/64 dark:bg-slate-900/74 dark:hover:bg-slate-800/86';
}

function resolveWorkingMemoryMockDetailHref() {
  if (typeof window === 'undefined') return undefined;
  const pathname = window.location.pathname.replace(/\/$/, '');
  if (!pathname.endsWith('/memory')) return undefined;
  return `${pathname}/detail?memoryId=working%3Alocal`;
}

function memoryStatusMockModeFromQuery(value: string | null): MemoryStatusMockMode {
  if (value === 'flow' || value === 'play') return 'flow';
  if (value === '1' || value === 'running' || value === 'active') return 'running';
  return 'off';
}

function readMemoryStatusMockModeFromLocation(): MemoryStatusMockMode {
  if (typeof window === 'undefined') return 'off';
  const value = new URLSearchParams(window.location.search).get(MEMORY_STATUS_MOCK_QUERY_PARAM);
  return memoryStatusMockModeFromQuery(value);
}

function resolveCompanionSize(): CompanionSize {
  if (typeof window === 'undefined') return DESKTOP_SIZE;
  if (resolveCompanionMode() !== 'mobile') return DESKTOP_SIZE;
  return isLearnPathname() ? LEARN_MOBILE_SIZE : MOBILE_SIZE;
}

function resolveCompanionMode(): CompanionMode {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 1024 ? 'mobile' : 'desktop';
}

function getDefaultPosition(size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const bottomOffset = resolveCompanionMode() === 'mobile' && isLearnPathname() ? 280 : 18;
  return clampPosition(
    {
      x: window.innerWidth - size.width - 20,
      y: window.innerHeight - size.height - bottomOffset,
    },
    size,
  );
}

function clampPosition(position: CompanionPosition, size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return position;
  const minX = minimumCompanionX(size);
  const minY = minimumCompanionY(size);
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - size.width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - size.height - EDGE_PADDING);

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function minimumCompanionX(size: CompanionSize): number {
  if (typeof window === 'undefined') return EDGE_PADDING;
  if (resolveCompanionMode() !== 'desktop' || !isLearnPathname()) return EDGE_PADDING;
  return Math.max(EDGE_PADDING, window.innerWidth - size.width - 72);
}

function minimumCompanionY(size: CompanionSize): number {
  if (typeof window === 'undefined') return EDGE_PADDING;
  if (resolveCompanionMode() !== 'desktop' || !isLearnPathname()) return EDGE_PADDING;
  return Math.max(EDGE_PADDING, window.innerHeight - size.height - 72);
}

function isLearnPathname(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/$/, '') === '/learn';
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
