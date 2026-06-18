'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
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
  Trash2,
  Video,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { SyntaraMark } from '@/components/brand/syntara-mark';
import {
  useTaskHistoryStore,
  type TaskHistoryRecord,
  type TaskHistoryStatus,
} from '@/lib/store/task-history';
import { cn } from '@/lib/utils';

type HistoryFilter = 'all' | 'active' | 'completed' | 'failed';
type TaskHistoryPanelMode = 'page' | 'popup';

const FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '异常' },
];

export function ClassroomTaskHistoryPageClient({ classroomId }: { classroomId: string }) {
  const decodedClassroomId = decodeURIComponent(classroomId);
  const backHref = `/classroom/${encodeURIComponent(decodedClassroomId)}`;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6">
      <TaskHistoryPanel backHref={backHref} mode="page" />
    </div>
  );
}

export function ClassroomTaskHistoryPopup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[1600] text-slate-950 dark:text-slate-50"
      data-study-companion-action
      data-task-history-popup
      role="dialog"
    >
      <button
        type="button"
        aria-label="关闭任务历史弹层背景"
        className="absolute inset-0 cursor-default bg-slate-950/14 backdrop-blur-[2px] dark:bg-black/32"
        onClick={() => onOpenChange(false)}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <section className="absolute inset-x-3 bottom-3 top-[72px] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/[0.025] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/94 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(78dvh,720px)] sm:w-[min(94vw,940px)]">
        <TaskHistoryPanel mode="popup" onClose={() => onOpenChange(false)} />
      </section>
    </div>
  );
}

function TaskHistoryPanel({
  backHref,
  mode,
  onClose,
}: {
  backHref?: string;
  mode: TaskHistoryPanelMode;
  onClose?: () => void;
}) {
  const records = useTaskHistoryStore((state) => state.records);
  const clearRecords = useTaskHistoryStore((state) => state.clearRecords);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const filteredRecords = useMemo(
    () => records.filter((record) => matchesFilter(record, filter)),
    [filter, records],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-4',
        mode === 'page' ? 'mx-auto max-w-6xl' : 'h-full p-3 sm:p-4',
      )}
    >
      <header
        className={cn(
          'rounded-lg border border-slate-200/80 bg-white/92 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/68',
          mode === 'popup' && 'shrink-0 shadow-none',
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {mode === 'page' ? (
              <SyntaraMark className="size-11 rounded-lg shadow-sm" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100">
                <History className="size-5" strokeWidth={1.8} />
              </span>
            )}
            <div className="min-w-0">
              {mode === 'page' && backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                >
                  <ArrowLeft className="size-3.5" strokeWidth={1.9} />
                  返回课堂
                </Link>
              ) : (
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-300">任务历史</p>
              )}
              <h1 className="mt-1 truncate text-xl font-semibold tracking-normal">
                任务历史与完成情况
              </h1>
              <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
                记录右下角任务雷达出现过的 AI 队列、语音生成、记忆写入和判断任务。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {records.length > 0 ? (
              <button
                type="button"
                onClick={clearRecords}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-rose-300/25 dark:hover:bg-rose-400/10 dark:hover:text-rose-100"
              >
                <Trash2 className="size-4" strokeWidth={1.9} />
                清空历史
              </button>
            ) : null}
            {mode === 'popup' ? (
              <button
                type="button"
                aria-label="关闭任务历史"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section
        className={cn(
          'min-h-[420px] rounded-lg border border-slate-200/80 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.055)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/68',
          mode === 'popup' && 'flex min-h-0 flex-1 flex-col overflow-hidden shadow-none',
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200/75 px-4 py-3 dark:border-white/10 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-300">历史任务流</p>
            <h2 className="mt-0.5 text-base font-semibold">所有后台动作</h2>
          </div>
          <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.04] md:w-auto">
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    'h-8 flex-1 rounded-md px-3 text-xs font-semibold transition md:flex-none',
                    active
                      ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )}
                >
                  {item.label}
                  <span className="ml-1 tabular-nums">{filterCount(records, item.key)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn(mode === 'popup' && 'min-h-0 flex-1 overflow-y-auto')}>
          {filteredRecords.length > 0 ? (
            <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
              {filteredRecords.map((record) => (
                <TaskHistoryRow key={record.id} record={record} />
              ))}
            </ul>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-white/15 dark:bg-white/[0.04]">
                  <History className="size-6" strokeWidth={1.6} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  暂无任务历史
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  课堂回复、语音生成、正误判断和记忆写入开始后，会自动出现在这里。
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TaskHistoryRow({ record }: { record: TaskHistoryRecord }) {
  const meta = statusMeta(record.status);
  return (
    <li className="flex min-w-0 flex-col gap-3 px-4 py-3 transition hover:bg-slate-50/80 dark:hover:bg-white/[0.035] md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TaskLogoBadge record={record} status={record.status}>
          {meta.icon}
        </TaskLogoBadge>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {record.title || kindLabel(record)}
            </p>
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold',
                meta.chipClassName,
              )}
            >
              {meta.label}
            </span>
          </div>
          {record.description ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {record.description}
            </p>
          ) : null}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {kindIconElement(record)}
              {kindLabel(record)}
            </span>
            <span>{sourceLabel(record)}</span>
            <span>{formatTime(record.updatedAt)}</span>
            {record.startedAt && record.finishedAt ? (
              <span>耗时 {formatDuration(record.finishedAt - record.startedAt)}</span>
            ) : null}
            {record.contextPath ? (
              <span className="max-w-full truncate">
                来源 {cleanContextPath(record.contextPath)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {record.detailHref ? (
        <Link
          href={record.detailHref}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-blue-300/25 dark:hover:bg-blue-400/10 dark:hover:text-blue-100"
        >
          详情
          <ArrowUpRight className="size-3" strokeWidth={2} />
        </Link>
      ) : null}
    </li>
  );
}

function TaskLogoBadge({
  record,
  status,
  children,
}: {
  record: TaskHistoryRecord;
  status: TaskHistoryStatus;
  children: ReactNode;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        'relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm',
        kindLogoClass(record),
      )}
    >
      {kindIconElement(record, 'size-5', 2)}
      <span
        className={cn(
          'absolute -bottom-1 -right-1 inline-flex size-5 items-center justify-center rounded-full border-2 border-white dark:border-slate-950',
          meta.badgeClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}

function matchesFilter(record: TaskHistoryRecord, filter: HistoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') return isActiveStatus(record.status);
  if (filter === 'completed') return record.status === 'completed';
  return isProblemStatus(record.status);
}

function filterCount(records: TaskHistoryRecord[], filter: HistoryFilter) {
  return records.filter((record) => matchesFilter(record, filter)).length;
}

function isActiveStatus(status: TaskHistoryStatus) {
  return status === 'queued' || status === 'running' || status === 'needs_attention';
}

function isProblemStatus(status: TaskHistoryStatus) {
  return status === 'failed' || status === 'cancelled';
}

function statusMeta(status: TaskHistoryStatus) {
  if (status === 'running') {
    return {
      label: '进行中',
      icon: <Loader2 className="size-3 animate-spin" strokeWidth={2.2} />,
      badgeClassName: 'bg-blue-600 text-white',
      chipClassName: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-100',
    };
  }
  if (status === 'queued') {
    return {
      label: '排队中',
      icon: <Clock3 className="size-3" strokeWidth={2.2} />,
      badgeClassName: 'bg-slate-500 text-white',
      chipClassName: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    };
  }
  if (status === 'needs_attention') {
    return {
      label: '待处理',
      icon: <AlertCircle className="size-3" strokeWidth={2.2} />,
      badgeClassName: 'bg-amber-500 text-white',
      chipClassName: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100',
    };
  }
  if (status === 'completed') {
    return {
      label: '已完成',
      icon: <CheckCircle2 className="size-3" strokeWidth={2.2} />,
      badgeClassName: 'bg-emerald-600 text-white',
      chipClassName: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100',
    };
  }
  if (status === 'failed') {
    return {
      label: '失败',
      icon: <AlertCircle className="size-3" strokeWidth={2.2} />,
      badgeClassName: 'bg-rose-600 text-white',
      chipClassName: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-100',
    };
  }
  if (status === 'cancelled') {
    return {
      label: '已取消',
      icon: <Clock3 className="size-3" strokeWidth={2.2} />,
      badgeClassName: 'bg-slate-500 text-white',
      chipClassName: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    };
  }
  return {
    label: '已跳过',
    icon: <Clock3 className="size-3" strokeWidth={2.2} />,
    badgeClassName: 'bg-slate-500 text-white',
    chipClassName: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  };
}

function kindIconElement(record: TaskHistoryRecord, className = 'size-3.5', strokeWidth = 1.8) {
  const visualKind = historyRecordVisualKind(record);
  if (visualKind === 'speech') {
    return <Volume2 className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'image') {
    return <ImageIcon className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'video') {
    return <Video className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'micro_lesson') {
    return <Presentation className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'repair') {
    return <Wrench className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'reply') {
    return <MessagesSquare className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'evaluation') {
    return <ClipboardCheck className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'study_memory') {
    return <BrainCircuit className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'fact') {
    return <FileSearch className={className} strokeWidth={strokeWidth} />;
  }
  if (visualKind === 'source_index') {
    return <Database className={className} strokeWidth={strokeWidth} />;
  }
  if (record.source === 'memory_activity') {
    return <History className={className} strokeWidth={strokeWidth} />;
  }
  return <ListChecks className={className} strokeWidth={strokeWidth} />;
}

function kindLogoClass(record: TaskHistoryRecord) {
  const visualKind = historyRecordVisualKind(record);
  if (visualKind === 'speech') {
    return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-300/20 dark:bg-teal-400/10 dark:text-teal-100';
  }
  if (visualKind === 'image') {
    return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-100';
  }
  if (visualKind === 'video') {
    return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-300/20 dark:bg-purple-400/10 dark:text-purple-100';
  }
  if (visualKind === 'micro_lesson') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100';
  }
  if (visualKind === 'repair') {
    return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-300/20 dark:bg-orange-400/10 dark:text-orange-100';
  }
  if (visualKind === 'reply') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100';
  }
  if (visualKind === 'evaluation') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100';
  }
  if (visualKind === 'study_memory') {
    return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-100';
  }
  if (visualKind === 'fact') {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100';
  }
  if (visualKind === 'source_index') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-100';
  }
  if (record.source === 'memory_activity') {
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/12 dark:bg-white/10 dark:text-slate-200';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100';
}

function kindLabel(record: TaskHistoryRecord) {
  const visualKind = historyRecordVisualKind(record);
  if (visualKind === 'speech') return '讲解语音';
  if (visualKind === 'image') return '图片生成';
  if (visualKind === 'video') return '视频生成';
  if (visualKind === 'micro_lesson') return '临时PPT';
  if (visualKind === 'repair') return '页面修复';
  if (record.kind === 'pbl-chat') return 'PBL 对话';
  if (visualKind === 'reply') return '课堂回复';
  if (visualKind === 'evaluation') return '正误判断';
  if (record.kind === 'course-generation') return '课程生成';
  if (record.kind === 'review-route') return '复习规划';
  if (visualKind === 'fact') return '结构化记忆';
  if (visualKind === 'study_memory') return '短期状态';
  if (visualKind === 'source_index') return '来源索引';
  if (record.kind === 'business_record') return '业务记录';
  return record.source === 'memory_activity' ? '记忆活动' : 'AI 任务';
}

function historyRecordVisualKind(record: TaskHistoryRecord) {
  const text = `${record.kind} ${record.title} ${record.description}`.toLowerCase();
  if (record.kind === 'speech-generation') return 'speech';
  if (record.kind === 'image-generation') return 'image';
  if (record.kind === 'video-generation') return 'video';
  if (record.kind === 'micro-lesson') return 'micro_lesson';
  if (record.kind === 'slide-repair') return 'repair';
  if (record.kind === 'pbl-chat') return 'reply';
  if (record.kind === 'chat-reply') return 'reply';
  if (record.kind === 'problem-evaluation' || record.kind === 'quiz-grading') return 'evaluation';
  if (record.kind === 'study_memory') return 'study_memory';
  if (record.kind === 'structured_fact') return 'fact';
  if (record.kind === 'knowledge_index') return 'source_index';
  if (text.includes('回复') || text.includes('答案')) return 'reply';
  if (text.includes('图片') || text.includes('image')) return 'image';
  if (text.includes('视频') || text.includes('video')) return 'video';
  if (text.includes('ppt') || text.includes('课件') || text.includes('临时讲解')) {
    return 'micro_lesson';
  }
  if (text.includes('修复') || text.includes('重写')) return 'repair';
  if (text.includes('判断') || text.includes('正误') || text.includes('提交')) {
    return 'evaluation';
  }
  if (text.includes('来源') || text.includes('索引')) return 'source_index';
  if (text.includes('短期') || text.includes('状态写入') || text.includes('记忆写入')) {
    return 'study_memory';
  }
  return record.source === 'memory_activity' ? 'memory' : 'task';
}

function sourceLabel(record: TaskHistoryRecord) {
  return record.source === 'memory_activity' ? '记忆系统' : 'AI 队列';
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`;
}

function cleanContextPath(path: string) {
  return path.split('?')[0] || path;
}
