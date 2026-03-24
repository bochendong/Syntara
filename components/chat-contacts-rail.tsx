'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Loader2, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import {
  lastNotebookChatActivityAt,
  lastNotebookChatPreview,
  type NotebookContactChatMessage,
} from '@/lib/utils/notebook-contact-chat-preview';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listActiveAgentTasksByCourse } from '@/lib/utils/agent-task-storage';
import {
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

function CourseAgentThumb({
  avatarUrl,
  label,
}: {
  avatarUrl?: string | null;
  label: string;
}) {
  const src =
    avatarUrl && isImageAvatar(avatarUrl) ? avatarUrl : '/avatars/assist-2.png';
  return (
    <img
      src={src}
      alt=""
      className="size-9 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      title={label}
    />
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

function GroupChatThumb() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
      <MessagesSquare className="size-4 text-slate-400" strokeWidth={1.75} />
    </div>
  );
}

const NOTEBOOK_CHAT_PREVIEW_EVENT = 'openmaic-notebook-chat-updated';

function matchesContactSearch(
  needle: string,
  nb: StageListItem,
  lastPreview?: string,
): boolean {
  if (!needle) return true;
  if (nb.name.toLowerCase().includes(needle)) return true;
  if (nb.description?.toLowerCase().includes(needle)) return true;
  if (nb.tags?.some((t) => t.toLowerCase().includes(needle))) return true;
  if (lastPreview && lastPreview.toLowerCase().includes(needle)) return true;
  return false;
}

export function ChatContactsRail({
  courseId,
  collapsed,
  courseName,
  courseAvatarUrl,
  searchQuery = '',
}: {
  courseId: string | null | undefined;
  collapsed: boolean;
  /** 与侧栏顶部课程卡片一致，用于课程总控入口展示 */
  courseName?: string | null;
  courseAvatarUrl?: string | null;
  /** 过滤课程总控与笔记本（名称、简介、标签） */
  searchQuery?: string;
}) {
  const searchParams = useSearchParams();
  const selNotebook = searchParams.get('notebook');
  const selAgent = searchParams.get('agent');

  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notebookLastPreview, setNotebookLastPreview] = useState<Record<string, string>>({});
  const [notebookActivityAt, setNotebookActivityAt] = useState<Record<string, number>>({});

  const refreshNotebookPreviews = useCallback(async () => {
    if (!courseId || notebooks.length === 0) {
      setNotebookLastPreview({});
      setNotebookActivityAt({});
      return;
    }
    const results = await Promise.all(
      notebooks.map(async (nb) => {
        try {
          const msgs = await loadContactMessages<NotebookContactChatMessage>(
            courseId,
            'notebook',
            nb.id,
          );
          const p = lastNotebookChatPreview(msgs);
          const activity = lastNotebookChatActivityAt(msgs);
          return { id: nb.id, preview: p, activityAt: activity };
        } catch {
          return { id: nb.id, preview: null, activityAt: 0 };
        }
      }),
    );
    const nextPreview: Record<string, string> = {};
    const nextActivity: Record<string, number> = {};
    for (const r of results) {
      if (r.preview) nextPreview[r.id] = r.preview;
      if (r.activityAt > 0) nextActivity[r.id] = r.activityAt;
    }
    setNotebookLastPreview(nextPreview);
    setNotebookActivityAt(nextActivity);
  }, [courseId, notebooks]);

  useEffect(() => {
    void refreshNotebookPreviews();
  }, [refreshNotebookPreviews]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshNotebookPreviews();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshNotebookPreviews]);

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<{ courseId?: string; notebookId?: string }>;
      const d = ce.detail;
      const nid = d?.notebookId;
      if (!courseId || d?.courseId !== courseId || !nid) return;
      void (async () => {
        try {
          const msgs = await loadContactMessages<NotebookContactChatMessage>(
            courseId,
            'notebook',
            nid,
          );
          const p = lastNotebookChatPreview(msgs);
          const activity = lastNotebookChatActivityAt(msgs);
          setNotebookLastPreview((prev) => {
            const next = { ...prev };
            if (p) next[nid] = p;
            else delete next[nid];
            return next;
          });
          setNotebookActivityAt((prev) => {
            const next = { ...prev };
            if (activity > 0) next[nid] = activity;
            else delete next[nid];
            return next;
          });
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener(NOTEBOOK_CHAT_PREVIEW_EVENT, onUpdated as EventListener);
    return () => window.removeEventListener(NOTEBOOK_CHAT_PREVIEW_EVENT, onUpdated as EventListener);
  }, [courseId]);

  useEffect(() => {
    if (!courseId) {
      setNotebooks([]);
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      const nbs = await listStagesByCourse(courseId);
      if (!alive) return;
      setNotebooks(nbs);
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

  const needle = searchQuery.trim().toLowerCase();
  const filteredNotebooks = useMemo(() => {
    if (!courseId) return [];
    return needle
      ? notebooks.filter((nb) => matchesContactSearch(needle, nb, notebookLastPreview[nb.id]))
      : notebooks;
  }, [courseId, needle, notebooks, notebookLastPreview]);

  /** 最近有聊天的在上；无聊天记录时用笔记本 updatedAt */
  const displayNotebooks = useMemo(() => {
    const list = filteredNotebooks.slice();
    list.sort((a, b) => {
      const ta = notebookActivityAt[a.id] ?? a.updatedAt ?? 0;
      const tb = notebookActivityAt[b.id] ?? b.updatedAt ?? 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return list;
  }, [filteredNotebooks, notebookActivityAt]);

  if (!courseId) {
    return (
      <div className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
        请先从「我的课程」进入一门课，侧栏会保留课程上下文后再打开聊天。
      </div>
    );
  }

  const courseAgentLabel = (courseName?.trim() || '课程').trim();
  const orchestratorMatches =
    !needle ||
    courseAgentLabel.toLowerCase().includes(needle) ||
    COURSE_ORCHESTRATOR_NAME.toLowerCase().includes(needle);
  const orchestratorHref = `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`;
  const orchestratorActive = selAgent === COURSE_ORCHESTRATOR_ID && !selNotebook;
  const orchestratorBusy = busyKeys.has(`agent:${COURSE_ORCHESTRATOR_ID}`);
  const groupChatLabel = '群聊';

  const courseAgentSection = orchestratorMatches ? (
    <section aria-label="课程 Agent">
      {!collapsed && (
        <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          课程 Agent
        </h3>
      )}
      <ul className="flex list-none flex-col gap-0.5 p-0">
        <li>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={orchestratorHref}
                className={contactRowClass(collapsed, orchestratorActive)}
                aria-current={orchestratorActive ? 'page' : undefined}
              >
                <CourseAgentThumb avatarUrl={courseAvatarUrl} label={courseAgentLabel} />
                {!collapsed && (
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="w-full truncate font-medium leading-tight">{courseAgentLabel}</span>
                    <span className="w-full truncate text-[10px] font-normal text-muted-foreground">
                      {COURSE_ORCHESTRATOR_NAME}
                    </span>
                  </span>
                )}
                {orchestratorBusy ? (
                  <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-label="处理中" />
                ) : null}
              </Link>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                {courseAgentLabel} · {COURSE_ORCHESTRATOR_NAME}
              </TooltipContent>
            )}
          </Tooltip>
        </li>
      </ul>
    </section>
  ) : null;

  const groupChatSection = orchestratorMatches ? (
    <section aria-label="群聊">
      {!collapsed && (
        <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          群聊
        </h3>
      )}
      <ul className="flex list-none flex-col gap-0.5 p-0">
        <li>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={orchestratorHref}
                className={contactRowClass(collapsed, orchestratorActive)}
                aria-current={orchestratorActive ? 'page' : undefined}
              >
                <GroupChatThumb />
                {!collapsed && (
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="w-full truncate font-medium leading-tight">{groupChatLabel}</span>
                    <span className="w-full truncate text-[10px] font-normal text-muted-foreground">
                      课程内协作会话
                    </span>
                  </span>
                )}
                {orchestratorBusy ? (
                  <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-label="处理中" />
                ) : null}
              </Link>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                {groupChatLabel} · 课程内协作会话
              </TooltipContent>
            )}
          </Tooltip>
        </li>
      </ul>
    </section>
  ) : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-1.5 pb-2 pt-1">
        {courseAgentSection}
        {groupChatSection}
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1.5 pb-2 pt-1">
      {courseAgentSection}
      {groupChatSection}
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
        ) : displayNotebooks.length === 0 ? (
          !collapsed && (
            <p className="px-2 text-xs text-muted-foreground">无匹配的笔记本或联系人</p>
          )
        ) : (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {displayNotebooks.map((nb) => {
              const active = selNotebook === nb.id && !selAgent;
              const href = `/chat?notebook=${encodeURIComponent(nb.id)}`;
              const busy = busyKeys.has(`notebook:${nb.id}`);
              const lastPreview = notebookLastPreview[nb.id];
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
                          <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                            <span className="truncate font-medium leading-tight">{nb.name}</span>
                            {lastPreview ? (
                              <span
                                className="line-clamp-2 text-left text-[10px] leading-snug text-muted-foreground"
                                title={lastPreview}
                              >
                                {lastPreview}
                              </span>
                            ) : nb.tags && nb.tags.length > 0 ? (
                              <span className="flex flex-wrap gap-1">
                                {nb.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="max-w-[5.5rem] truncate rounded border border-slate-900/[0.08] bg-black/[0.03] px-1 py-px text-[9px] font-medium text-muted-foreground dark:border-white/[0.1] dark:bg-white/[0.06]"
                                    title={tag}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {nb.tags.length > 3 ? (
                                  <span className="text-[9px] text-muted-foreground">
                                    +{nb.tags.length - 3}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </span>
                        )}
                        {busy ? (
                          <span className="size-2.5 shrink-0 rounded-full bg-amber-500" aria-label="处理中" />
                        ) : null}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">
                        <span className="block max-w-[220px]">
                          {nb.name}
                          {lastPreview ? (
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              {lastPreview}
                            </span>
                          ) : nb.tags && nb.tags.length > 0 ? (
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              {nb.tags.join(' · ')}
                            </span>
                          ) : null}
                        </span>
                      </TooltipContent>
                    )}
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
