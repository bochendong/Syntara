'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import {
  listAgentsForCourse,
  type CourseAgentListItem,
} from '@/lib/utils/course-agents';
import { listActiveAgentTasksByCourse } from '@/lib/utils/agent-task-storage';
import {
  COURSE_ORCHESTRATOR_AVATAR,
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
} from '@/lib/constants/course-chat';

function isImageAvatar(src: string) {
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

function contactRowClass(collapsed: boolean, active: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-[10px] py-2 text-left text-sm transition-all duration-200',
    collapsed ? 'justify-center px-2' : 'px-2',
    active
      ? 'bg-violet-600/14 font-medium text-foreground dark:bg-violet-400/[0.18]'
      : 'font-normal text-foreground/85 hover:bg-violet-600/[0.08] dark:hover:bg-white/[0.06]',
  );
}

function NotebookThumb({ stage }: { stage: StageListItem }) {
  if (stage.avatarUrl && isImageAvatar(stage.avatarUrl)) {
    return (
      <img
        src={stage.avatarUrl}
        alt=""
        className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
      <BookOpen className="size-4 text-slate-400" strokeWidth={1.75} />
    </div>
  );
}

function AgentThumb({ item }: { item: CourseAgentListItem }) {
  if (isImageAvatar(item.avatar)) {
    return (
      <img
        src={item.avatar}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-medium">
      {item.avatar || item.name.slice(0, 1)}
    </div>
  );
}

export function ChatContactsRail({
  courseId,
  collapsed,
}: {
  courseId: string | null | undefined;
  collapsed: boolean;
}) {
  const searchParams = useSearchParams();
  const selNotebook = searchParams.get('notebook');
  const selAgent = searchParams.get('agent');

  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [agents, setAgents] = useState<CourseAgentListItem[]>([]);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) {
      setNotebooks([]);
      setAgents([]);
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      const nbs = await listStagesByCourse(courseId);
      const ags = await listAgentsForCourse(courseId);
      if (!alive) return;
      setNotebooks(nbs);
      setAgents(ags);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  useEffect(() => {
    if (!courseId) {
      setBusyKeys(new Set());
      return;
    }
    let alive = true;
    const sync = async () => {
      const tasks = await listActiveAgentTasksByCourse(courseId);
      if (!alive) return;
      const keys = new Set<string>();
      for (const t of tasks) {
        keys.add(`${t.contactKind}:${t.contactId}`);
      }
      setBusyKeys(keys);
    };
    void sync();
    const timer = window.setInterval(sync, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [courseId]);

  const agentsWithOrchestrator: CourseAgentListItem[] = [
    {
      id: COURSE_ORCHESTRATOR_ID,
      name: COURSE_ORCHESTRATOR_NAME,
      avatar: COURSE_ORCHESTRATOR_AVATAR,
      role: 'teacher',
      persona: '课程总控，会并行调度本课程笔记本完成任务。',
      color: '#7c3aed',
      priority: 100,
      isGenerated: false,
    },
    ...agents,
  ];

  if (!courseId) {
    return (
      <div className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
        请先从「我的课程」进入一门课，侧栏会保留课程上下文后再打开聊天。
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1.5 pb-2 pt-1">
      <section aria-label="笔记本">
        {!collapsed && (
          <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            笔记本
          </h3>
        )}
        {notebooks.length === 0 ? (
          !collapsed && (
            <p className="px-2 text-xs text-muted-foreground">本课程暂无笔记本</p>
          )
        ) : (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {notebooks.map((nb) => {
              const active = selNotebook === nb.id && !selAgent;
              const href = `/chat?notebook=${encodeURIComponent(nb.id)}`;
              const busy = busyKeys.has(`notebook:${nb.id}`);
              return (
                <li key={nb.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={contactRowClass(collapsed, active)}
                        aria-current={active ? 'page' : undefined}
                      >
                        <NotebookThumb stage={nb} />
                        {!collapsed && (
                          <span className="min-w-0 flex-1 truncate font-medium">{nb.name}</span>
                        )}
                        {busy ? (
                          <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-label="处理中" />
                        ) : null}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && <TooltipContent side="right">{nb.name}</TooltipContent>}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="课程 Agent">
        {!collapsed && (
          <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            课程 Agent
          </h3>
        )}
        {agentsWithOrchestrator.length === 0 ? (
          !collapsed && <p className="px-2 text-xs text-muted-foreground">暂无 Agent</p>
        ) : (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {agentsWithOrchestrator.map((ag) => {
              const active = selAgent === ag.id;
              const href = `/chat?agent=${encodeURIComponent(ag.id)}`;
              const busy = busyKeys.has(`agent:${ag.id}`);
              return (
                <li key={ag.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={contactRowClass(collapsed, active)}
                        aria-current={active ? 'page' : undefined}
                      >
                        <AgentThumb item={ag} />
                        {!collapsed && (
                          <span className="min-w-0 flex-1 truncate font-medium">{ag.name}</span>
                        )}
                        {busy ? (
                          <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-label="处理中" />
                        ) : null}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && <TooltipContent side="right">{ag.name}</TooltipContent>}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
