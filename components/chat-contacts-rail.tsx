'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Loader2, MessagesSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  deleteCourseChatGroup,
  listCourseChatGroups,
  loadContactMessages,
} from '@/lib/utils/contact-chat-storage';
import type { CourseChatGroupMeta } from '@/lib/types/chat';
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
import { COURSE_CHAT_GROUPS_UPDATED_EVENT } from '@/components/chat/course-chat-groups';

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
        ? 'bg-[#007AFF]/10 font-medium text-[#0057B8]'
        : 'bg-[#0A84FF]/18 font-medium text-sky-100'
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

function GroupChatThumb({
  group,
  lightSolidSurface,
}: {
  group?: CourseChatGroupMeta;
  lightSolidSurface?: boolean;
}) {
  const participants = group?.participants.slice(0, 4) || [];
  if (participants.length > 0) {
    return (
      <div className="grid size-9 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10">
        {participants.map((participant) =>
          participant.avatarUrl && isImageAvatar(participant.avatarUrl) ? (
            <img
              key={participant.id}
              src={participant.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span
              key={participant.id}
              className={cn(
                'flex size-full items-center justify-center text-[10px] font-semibold',
                lightSolidSurface ? 'bg-violet-100 text-violet-700' : 'bg-white/10 text-zinc-200',
              )}
            >
              {participant.name.trim().slice(0, 1) || '群'}
            </span>
          ),
        )}
      </div>
    );
  }
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
const GROUP_CHAT_PREVIEW_POLL_INTERVAL_MS = 8000;
const ACTIVE_CONTACT_TASK_POLL_INTERVAL_MS = 8000;

function canPollInCurrentTab(): boolean {
  return document.visibilityState === 'visible';
}

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

  const router = useRouter();
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
  const [groupChats, setGroupChats] = useState<CourseChatGroupMeta[]>([]);
  const [groupPendingDelete, setGroupPendingDelete] = useState<CourseChatGroupMeta | null>(null);
  const [groupDeleting, setGroupDeleting] = useState(false);

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
            { ignoreCourseId: true, expectedTargetName: nb.name },
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
    const timeout = window.setTimeout(() => {
      void refreshNotebookPreviews();
    }, 0);
    return () => window.clearTimeout(timeout);
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
            {
              ignoreCourseId: true,
              expectedTargetName: notebooks.find((notebook) => notebook.id === nid)?.name,
            },
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
  }, [courseId, notebooks]);

  const refreshGroupChats = useCallback(async () => {
    if (!courseId) {
      setGroupChats([]);
      return;
    }
    const groups = await listCourseChatGroups(courseId);
    setGroupChats(groups);
  }, [courseId]);

  const confirmDeleteGroup = useCallback(async () => {
    const group = groupPendingDelete;
    if (!courseId || !group || groupDeleting) return;
    setGroupDeleting(true);
    try {
      const activeGroupId = searchParams.get('group');
      const deletingActiveGroup =
        selAgent === COURSE_ORCHESTRATOR_ID &&
        chatView === 'group' &&
        activeGroupId === group.groupId;

      setGroupChats((prev) => prev.filter((item) => item.groupId !== group.groupId));
      await deleteCourseChatGroup(courseId, group.groupId);
      window.dispatchEvent(
        new CustomEvent(COURSE_CHAT_GROUPS_UPDATED_EVENT, {
          detail: { courseId, groupId: group.groupId, deleted: true },
        }),
      );

      if (deletingActiveGroup) {
        router.replace(`/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`);
      }
      setGroupPendingDelete(null);
    } finally {
      setGroupDeleting(false);
    }
  }, [chatView, courseId, groupDeleting, groupPendingDelete, router, searchParams, selAgent]);

  useEffect(() => {
    if (!courseId) {
      const timeout = window.setTimeout(() => setGroupChats([]), 0);
      return () => window.clearTimeout(timeout);
    }
    let alive = true;
    const sync = async () => {
      try {
        const groups = await listCourseChatGroups(courseId);
        if (!alive) return;
        setGroupChats(groups);
      } catch {
        if (alive) setGroupChats([]);
      }
    };
    const poll = () => {
      if (canPollInCurrentTab()) void sync();
    };
    void sync();
    const timer = window.setInterval(poll, GROUP_CHAT_PREVIEW_POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [courseId]);

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<{ courseId?: string }>;
      if (!courseId || ce.detail?.courseId !== courseId) return;
      void refreshGroupChats().catch(() => undefined);
    };
    window.addEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onUpdated as EventListener);
    return () =>
      window.removeEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onUpdated as EventListener);
  }, [courseId, refreshGroupChats]);

  useEffect(() => {
    if (!courseId) {
      const timeout = window.setTimeout(() => {
        setNotebooks([]);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
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
      const timeout = window.setTimeout(() => setBusyKeys(new Set()), 0);
      return () => window.clearTimeout(timeout);
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
    const poll = () => {
      if (canPollInCurrentTab()) void sync().catch(() => undefined);
    };
    void sync().catch(() => undefined);
    const timer = window.setInterval(poll, ACTIVE_CONTACT_TASK_POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
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

  const filteredGroupChats = useMemo(() => {
    if (!needle) return groupChats;
    return groupChats.filter((group) => {
      if (group.name.toLowerCase().includes(needle)) return true;
      if (group.lastMessagePreview?.toLowerCase().includes(needle)) return true;
      return group.participants.some((participant) =>
        participant.name.toLowerCase().includes(needle),
      );
    });
  }, [groupChats, needle]);

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

  const shouldShowGroupChatSection = !needle || filteredGroupChats.length > 0;
  const groupChatSection = shouldShowGroupChatSection ? (
    <section aria-label="群聊">
      {!collapsed && (
        <h3
          className={cn('mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide', railMuted)}
        >
          群聊
        </h3>
      )}
      <ul className="flex list-none flex-col gap-0.5 p-0">
        {filteredGroupChats.length > 0 ? (
          filteredGroupChats.map((group) => {
            const href = `${groupChatHref}&group=${encodeURIComponent(group.groupId)}`;
            const activeGroupId = searchParams.get('group');
            const active = groupChatActive && activeGroupId === group.groupId;
            return (
              <li key={group.groupId} className="group relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      className={cn(
                        contactRowClass(collapsed, active, lightSolidSurface),
                        !collapsed && 'pr-9',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <GroupChatThumb group={group} lightSolidSurface={lightSolidSurface} />
                      {!collapsed && (
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                          <span className="w-full truncate font-medium leading-tight">
                            {group.name}
                          </span>
                          <span
                            className={cn('w-full truncate text-[10px] font-normal', railMuted)}
                          >
                            {group.lastMessagePreview ||
                              `${group.participants.length} 位成员 · 课程内群聊`}
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
                      {group.name} · {group.participants.length} 位成员
                    </TooltipContent>
                  )}
                </Tooltip>
                {!collapsed && (
                  <button
                    type="button"
                    className={cn(
                      'absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
                      lightSolidSurface
                        ? 'text-slate-400 hover:bg-slate-900/5 hover:text-red-600'
                        : 'text-zinc-500 hover:bg-white/10 hover:text-red-300',
                    )}
                    aria-label={`删除群聊 ${group.name}`}
                    title="删除群聊"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setGroupPendingDelete(group);
                    }}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </li>
            );
          })
        ) : !collapsed ? (
          <li
            className={cn(
              'rounded-2xl px-3 py-2 text-[11px] leading-5',
              lightSolidSurface
                ? 'bg-slate-100/55 text-slate-500'
                : 'bg-white/[0.04] text-zinc-500',
            )}
          >
            多笔记本协作时，课程总控会自动创建群聊。
          </li>
        ) : null}
      </ul>
    </section>
  ) : null;

  const deleteGroupDialog = (
    <AlertDialog
      open={Boolean(groupPendingDelete)}
      onOpenChange={(open) => {
        if (!open && !groupDeleting) setGroupPendingDelete(null);
      }}
    >
      <AlertDialogContent className="max-w-[min(92vw,420px)] rounded-[22px] border-slate-200/80 bg-white/95 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/95">
        <div className="p-5">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogMedia className="mb-1 size-12 rounded-2xl bg-red-500/10 text-red-600 dark:bg-red-400/15 dark:text-red-300">
              <Trash2 className="size-5" strokeWidth={1.8} />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-base font-semibold">删除群聊？</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm leading-relaxed">
              将移除「{groupPendingDelete?.name || '该群聊'}
              」的会话、历史快照和侧栏入口。笔记本本身不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="border-t border-slate-200/80 bg-slate-50/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.04]">
          <AlertDialogCancel
            disabled={groupDeleting}
            className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
          >
            取消
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="rounded-xl bg-red-600 text-white hover:bg-red-700"
            disabled={groupDeleting}
            onClick={() => void confirmDeleteGroup()}
          >
            {groupDeleting ? '删除中…' : '删除群聊'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (loading) {
    return (
      <>
        <div className="flex flex-col gap-4 px-1.5 pb-2 pt-1">
          {courseAgentSection}
          {groupChatSection}
          <div className="flex justify-center py-8">
            <Loader2 className={cn('size-6 animate-spin', railMuted)} />
          </div>
        </div>
        {deleteGroupDialog}
      </>
    );
  }

  return (
    <>
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
      {deleteGroupDialog}
    </>
  );
}
