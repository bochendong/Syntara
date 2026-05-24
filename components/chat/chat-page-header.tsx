import Link from 'next/link';
import { Brain, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CourseChatGroupMeta } from '@/lib/types/chat';
import type { OrchestratorChildTaskView } from './chat-page-types';

export function NoCourseChatState() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
      <BookOpen className="size-12 text-muted-foreground/40" strokeWidth={1.25} />
      <div className="max-w-md space-y-2">
        <p className="text-base font-medium text-foreground">尚未选择课程</p>
        <p className="text-[13px] leading-5 text-muted-foreground">
          请先从「我的课程」进入一门课，或从课堂返回以保留侧栏课程上下文，再使用聊天。
        </p>
      </div>
      <Button asChild variant="default" className="rounded-xl">
        <Link href="/my-courses">前往我的课程</Link>
      </Button>
    </div>
  );
}

export function ChatPageHeader({
  titleLine,
  mode,
  groupMeta,
  contactTaskHint,
  isCourseOrchestrator,
  orchestratorChildTasks,
  selectedChildTaskId,
  setSelectedChildTaskId,
  notebookAction,
}: {
  titleLine: string;
  mode: 'notebook' | 'agent' | 'none';
  groupMeta?: CourseChatGroupMeta | null;
  contactTaskHint: string | null;
  isCourseOrchestrator: boolean;
  orchestratorChildTasks: OrchestratorChildTaskView[];
  selectedChildTaskId: string | null;
  setSelectedChildTaskId: (id: string | null) => void;
  notebookAction?: {
    id: string;
    name: string;
  } | null;
}) {
  const groupMemberNames = groupMeta?.participants
    .map((participant) => participant.name)
    .join('、');
  return (
    <header className="shrink-0 border-b border-slate-900/[0.06] bg-background/90 px-5 backdrop-blur-md dark:border-white/[0.08]">
      <div className="flex min-h-14 min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {titleLine}
          </h1>
          {groupMeta ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {groupMeta.participants.length} 位成员 · 课程总控调度
            </p>
          ) : null}
          {mode === 'agent' && contactTaskHint ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              任务状态：{contactTaskHint}
            </p>
          ) : null}
        </div>
        {notebookAction ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/classroom/${encodeURIComponent(notebookAction.id)}`}
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-[10px] px-3 text-xs font-semibold transition-colors',
                'bg-[#007AFF] text-white shadow-sm hover:opacity-[0.92] active:opacity-85',
                'dark:bg-[#0A84FF] dark:hover:opacity-[0.92]',
              )}
              aria-label={`进入笔记本：${notebookAction.name}`}
            >
              进入笔记本
            </Link>
            <Link
              href={`/classroom/${encodeURIComponent(notebookAction.id)}/memory`}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition-colors',
                'border border-[#007AFF]/18 bg-[#007AFF]/[0.06] text-[#0057B8] hover:bg-[#007AFF]/10',
                'dark:border-[#0A84FF]/24 dark:bg-[#0A84FF]/12 dark:text-[#B9DCFF] dark:hover:bg-[#0A84FF]/18',
              )}
              aria-label={`查看记忆：${notebookAction.name}`}
              title="查看记忆"
            >
              <Brain className="size-3.5" strokeWidth={1.8} />
              记忆
            </Link>
          </div>
        ) : groupMeta ? (
          <div
            className="flex shrink-0 items-center justify-end gap-2 overflow-hidden"
            title={groupMemberNames}
          >
            <div className="flex -space-x-2">
              {groupMeta.participants.slice(0, 5).map((participant) =>
                participant.avatarUrl ? (
                  <img
                    key={participant.id}
                    src={participant.avatarUrl}
                    alt=""
                    className="size-7 rounded-lg border border-background object-cover"
                  />
                ) : (
                  <span
                    key={participant.id}
                    className="flex size-7 items-center justify-center rounded-lg border border-background bg-violet-100 text-[10px] font-semibold text-violet-700 dark:bg-white/10 dark:text-violet-100"
                  >
                    {participant.name.trim().slice(0, 1) || '群'}
                  </span>
                ),
              )}
            </div>
            <span className="text-xs text-muted-foreground">成员</span>
          </div>
        ) : null}
      </div>
      {mode === 'agent' && isCourseOrchestrator && orchestratorChildTasks.length > 0 ? (
        <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-slate-900/[0.08] bg-white/70 px-2 py-1 text-[11px] dark:border-white/[0.1] dark:bg-black/30">
          {orchestratorChildTasks.slice(0, 8).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedChildTaskId(task.id)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                selectedChildTaskId === task.id ? 'bg-black/5 dark:bg-white/10' : '',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  task.status === 'done'
                    ? 'bg-emerald-500'
                    : task.status === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-amber-500',
                )}
                aria-hidden
              />
              <span className="truncate text-foreground">
                {task.title.replace(/^子任务：/, '')}
              </span>
              <span className="truncate text-muted-foreground">{task.detail || ''}</span>
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}
