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

function contactRowClass(collapsed: boolean, active: boolean, lightSolidSurface = false) {
  return cn(
    'flex w-full items-center gap-2 rounded-[10px] py-2 text-left text-sm transition-all duration-200',
    collapsed ? 'justify-center px-2' : 'px-2',
    active
      ? lightSolidSurface
        ? 'bg-violet-200/50 font-medium text-violet-900'
        : 'bg-violet-500/20 font-medium text-violet-100'
      : lightSolidSurface
        ? 'font-normal text-slate-800/90 hover:bg-black/[0.05]'
        : 'font-normal text-zinc-200/90 hover:bg-white/[0.08]',
  );
}

function CourseAgentThumb({ avatarUrl, label }: { avatarUrl?: string | null; label: string }) {
  const src = avatarUrl && isImageAvatar(avatarUrl) ? avatarUrl : COURSE_ORCHESTRATOR_AVATAR;
  return (
    <img
      src={src}
      alt=""
      className="size-9 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      title={label}
    />
  );
}

function NotebookThumb({
  stage,
  lightSolidSurface,
}: {
  stage: StageListItem;
  lightSolidSurface?: boolean;
}) {
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
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg border',
        lightSolidSurface ? 'border-slate-200/80 bg-white/60' : 'border-white/12 bg-white/5',
      )}
    >
      <BookOpen
        className={cn('size-4', lightSolidSurface ? 'text-slate-500' : 'text-zinc-500')}
        strokeWidth={1.75}
      />
    </div>
  );
}

function GroupChatThumb({ lightSolidSurface }: { lightSolidSurface?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg border',
        lightSolidSurface ? 'border-slate-200/80 bg-white/60' : 'border-white/12 bg-white/5',
      )}
    >
      <MessagesSquare
        className={cn('size-4', lightSolidSurface ? 'text-slate-500' : 'text-zinc-500')}
        strokeWidth={1.75}
      />
    </div>
  );
}

const NOTEBOOK_CHAT_PREVIEW_EVENT = 'synatra-notebook-chat-updated';
const NOTEBOOK_LIST_UPDATED_EVENT = 'synatra-notebook-list-updated';

function matchesContactSearch(needle: string, nb: StageListItem, lastPreview?: string): boolean {
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
  lightSolidSurface = false,
}: {
  courseId: string | null | undefined;
  collapsed: boolean;
  /** 与侧栏顶部课程卡片一致，用于课程总控入口展示 */
  courseName?: string | null;
  courseAvatarUrl?: string | null;
  /** 过滤课程总控与笔记本（名称、简介、标签） */
  searchQuery?: string;
  /** 与浅色实色侧栏底搭配时的文字/边框（浅色主题 + 淡色纯色底） */
  lightSolidSurface?: boolean;
}) {
  const railMuted = lightSolidSurface ? 'text-slate-500' : 'text-zinc-500';

  const searchParams = useSearchParams();
  const selNotebook = searchParams.get('notebook');
  const selAgent = searchParams.get('agent');
  /** 与「课程总控」同一会话，但侧栏分两个入口时需区分高亮 */
  const chatView = searchParams.get('view');

  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notebookLastPreview, setNotebookLastPreview] = useState<Record<string, string>>({});
  const [notebookActivityAt, setNotebookActivityAt] = useState<Record<string, number>>({});
  const [groupChatHasMessages, setGroupChatHasMessages] = useState(false);

  const refreshNotebooks = useCallback(async () => {
    if (!courseId) {
      setNotebooks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const nbs = await listStagesByCourse(courseId);
    setNotebooks(nbs);
    setLoading(false);
  }, [courseId]);

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
            { ignoreCourseId: true },
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
            { ignoreCourseId: true },
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
    return () =>
      window.removeEventListener(NOTEBOOK_CHAT_PREVIEW_EVENT, onUpdated as EventListener);
  }, [courseId]);

  useEffect(() => {
    if (!courseId) {
      setGroupChatHasMessages(false);
      return;
    }
    let alive = true;
    const groupTargetId = `${COURSE_ORCHESTRATOR_ID}::group`;
    const sync = async () => {
      try {
        const msgs = await loadContactMessages<unknown[]>(courseId, 'agent', groupTargetId);
        if (!alive) return;
        setGroupChatHasMessages(msgs.length > 0);
      } catch {
        if (alive) setGroupChatHasMessages(false);
      }
    };
    void sync();
    const timer = window.setInterval(sync, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
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
    const onNotebookListUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<{ courseId?: string }>;
      if (!courseId || ce.detail?.courseId !== courseId) return;
      void refreshNotebooks();
    };
    window.addEventListener(NOTEBOOK_LIST_UPDATED_EVENT, onNotebookListUpdated as EventListener);
    return () =>
      window.removeEventListener(
        NOTEBOOK_LIST_UPDATED_EVENT,
        onNotebookListUpdated as EventListener,
      );
  }, [courseId, refreshNotebooks]);

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
      <div className={cn('px-3 py-6 text-center text-xs leading-relaxed', railMuted)}>
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
  const groupChatHref = `${orchestratorHref}&view=group`;
  const orchestratorActive =
    selAgent === COURSE_ORCHESTRATOR_ID && !selNotebook && chatView !== 'group';
  const groupChatActive =
    selAgent === COURSE_ORCHESTRATOR_ID && !selNotebook && chatView === 'group';
  const orchestratorBusy = busyKeys.has(`agent:${COURSE_ORCHESTRATOR_ID}`);
  const groupChatLabel = '群聊';

  const courseAgentSection = orchestratorMatches ? (
    <section aria-label="课程 Agent">
      {!collapsed && (
        <h3
          className={cn('mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide', railMuted)}
        >
          课程 Agent
        </h3>
      )}
      <ul className="flex list-none flex-col gap-0.5 p-0">
        <li>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={orchestratorHref}
                className={contactRowClass(collapsed, orchestratorActive, lightSolidSurface)}
                aria-current={orchestratorActive ? 'page' : undefined}
              >
                <CourseAgentThumb avatarUrl={courseAvatarUrl} label={courseAgentLabel} />
                {!collapsed && (
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="w-full truncate font-medium leading-tight">
                      {courseAgentLabel}
                    </span>
                    <span className={cn('w-full truncate text-[10px] font-normal', railMuted)}>
                      {COURSE_ORCHESTRATOR_NAME}
                    </span>
                  </span>
                )}
                {orchestratorBusy ? (
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-amber-500"
                    aria-label="处理中"
                  />
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
        <h3
          className={cn('mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide', railMuted)}
        >
          群聊
        </h3>
      )}
      <ul className="flex list-none flex-col gap-0.5 p-0">
        {groupChatHasMessages ? (
          <li>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={groupChatHref}
                  className={contactRowClass(collapsed, groupChatActive, lightSolidSurface)}
                  aria-current={groupChatActive ? 'page' : undefined}
                >
                  <GroupChatThumb lightSolidSurface={lightSolidSurface} />
                  {!collapsed && (
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="w-full truncate font-medium leading-tight">
                        {groupChatLabel}
                      </span>
                      <span className={cn('w-full truncate text-[10px] font-normal', railMuted)}>
                        课程内协作会话
                      </span>
                    </span>
                  )}
                  {orchestratorBusy ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-amber-500"
                      aria-label="处理中"
                    />
                  ) : null}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">{groupChatLabel} · 课程内协作会话</TooltipContent>
              )}
            </Tooltip>
          </li>
        ) : !collapsed ? (
          <li>
            <p className={cn('px-2 py-2 text-xs', railMuted)}>本课程暂无群聊</p>
          </li>
        ) : null}
      </ul>
    </section>
  ) : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-1.5 pb-2 pt-1">
        {courseAgentSection}
        {groupChatSection}
        <div className="flex justify-center py-8">
          <Loader2 className={cn('size-6 animate-spin', railMuted)} />
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
          <h3
            className={cn(
              'mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide',
              railMuted,
            )}
          >
            笔记本
          </h3>
        )}
        {notebooks.length === 0 ? (
          !collapsed && <p className={cn('px-2 text-xs', railMuted)}>本课程暂无笔记本</p>
        ) : displayNotebooks.length === 0 ? (
          !collapsed && <p className={cn('px-2 text-xs', railMuted)}>无匹配的笔记本或联系人</p>
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
                        className={contactRowClass(collapsed, active, lightSolidSurface)}
                        aria-current={active ? 'page' : undefined}
                      >
                        <NotebookThumb stage={nb} lightSolidSurface={lightSolidSurface} />
                        {!collapsed && (
                          <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                            <span className="truncate font-medium leading-tight">{nb.name}</span>
                            {lastPreview ? (
                              <span
                                className={cn(
                                  'line-clamp-2 text-left text-[10px] leading-snug',
                                  railMuted,
                                )}
                                title={lastPreview}
                              >
                                {lastPreview}
                              </span>
                            ) : nb.tags && nb.tags.length > 0 ? (
                              <span className="flex flex-wrap gap-1">
                                {nb.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className={cn(
                                      'max-w-[5.5rem] truncate rounded border px-1 py-px text-[9px] font-medium',
                                      lightSolidSurface
                                        ? 'border-slate-200/80 bg-white/50 text-slate-600'
                                        : 'border-white/12 bg-white/10 text-zinc-400',
                                    )}
                                    title={tag}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {nb.tags.length > 3 ? (
                                  <span className={cn('text-[9px]', railMuted)}>
                                    +{nb.tags.length - 3}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </span>
                        )}
                        {busy ? (
                          <span
                            className="size-2.5 shrink-0 rounded-full bg-amber-500"
                            aria-label="处理中"
                          />
                        ) : null}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">
                        <span className="block max-w-[220px]">
                          {nb.name}
                          {lastPreview ? (
                            <span className={cn('mt-1 block text-[11px]', railMuted)}>
                              {lastPreview}
                            </span>
                          ) : nb.tags && nb.tags.length > 0 ? (
                            <span className={cn('mt-1 block text-[11px]', railMuted)}>
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
