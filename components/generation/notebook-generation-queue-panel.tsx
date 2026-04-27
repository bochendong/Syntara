'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useNotebookGenerationQueueStore,
  type NotebookGenerationQueueTask,
} from '@/lib/store/notebook-generation-queue';

function taskTitle(task: NotebookGenerationQueueTask): string {
  const trimmed = task.notebookName?.trim() || task.requirement.trim();
  if (!trimmed) return '未命名笔记本';
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

function taskDetail(task: NotebookGenerationQueueTask, index: number): string {
  if (task.status === 'queued') {
    return `${task.generateSlides ? '排队生成' : '排队入库'} · 第 ${index + 1} 个`;
  }
  if (task.status === 'running') {
    const progress = task.progress;
    if (progress?.stage === 'scene') {
      return `${progress.detail} · ${Math.min(progress.completed + 1, progress.total)}/${progress.total}`;
    }
    return progress?.detail || '正在生成…';
  }
  if (task.status === 'completed') {
    return task.generateSlides ? '已完成' : '已加入仓库（未生成 PPT）';
  }
  if (task.status === 'cancelled') return '已取消';
  return task.error || '生成失败';
}

function StatusIcon({ task }: { task: NotebookGenerationQueueTask }) {
  if (task.status === 'running') return <Loader2 className="size-3.5 animate-spin" />;
  if (task.status === 'queued') return <Clock3 className="size-3.5" />;
  if (task.status === 'completed') return <CheckCircle2 className="size-3.5" />;
  if (task.status === 'failed') return <AlertCircle className="size-3.5" />;
  return <X className="size-3.5" />;
}

export function NotebookGenerationQueuePanel({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const tasks = useNotebookGenerationQueueStore((s) => s.tasks);
  const cancel = useNotebookGenerationQueueStore((s) => s.cancel);
  const clearFinished = useNotebookGenerationQueueStore((s) => s.clearFinished);
  const hasActiveTasks = tasks.some(
    (task) => task.status === 'queued' || task.status === 'running',
  );

  useEffect(() => {
    if (!hasActiveTasks) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveTasks]);

  if (tasks.length === 0) return null;

  const visibleTasks = compact ? tasks.slice(-4) : tasks;
  const queuedTasks = tasks.filter((task) => task.status === 'queued');
  const hasFinished = tasks.some(
    (task) =>
      task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled',
  );

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-900/[0.08] bg-white/80 p-3 shadow-sm backdrop-blur dark:border-white/[0.1] dark:bg-black/30',
        className,
      )}
      aria-label="笔记本生成队列"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">笔记本生成队列</p>
          <p className="text-[11px] text-muted-foreground">
            一次生成一本，已排队的上传会自动接续。
          </p>
        </div>
        {hasFinished ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={clearFinished}
          >
            清理完成项
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {visibleTasks.map((task) => {
          const queueIndex = queuedTasks.findIndex((item) => item.id === task.id);
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-lg border border-slate-900/[0.06] bg-white/70 px-2.5 py-2 text-xs dark:border-white/[0.08] dark:bg-white/[0.04]"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  task.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : task.status === 'failed'
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : task.status === 'cancelled'
                        ? 'bg-slate-500/10 text-muted-foreground'
                        : 'bg-violet-500/10 text-violet-700 dark:text-violet-200',
                )}
              >
                <StatusIcon task={task} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{taskTitle(task)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {taskDetail(task, Math.max(0, queueIndex))}
                  {task.fileName ? ` · ${task.fileName}` : ''}
                </p>
              </div>
              {task.status === 'completed' && task.notebookId ? (
                <Link
                  href={`/classroom/${encodeURIComponent(task.notebookId)}`}
                  className="shrink-0 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-500/15 dark:text-violet-200"
                >
                  打开
                </Link>
              ) : null}
              {task.status === 'queued' || task.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => cancel(task.id)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
                  aria-label="取消生成任务"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
