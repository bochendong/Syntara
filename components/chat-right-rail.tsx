'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FilePlus2,
  LibraryBig,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  NotebookPen,
  Settings,
  Target,
  UploadCloud,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
  createNotebookHref,
  resolveCourseOrchestratorAvatar,
} from '@/lib/constants/course-chat';
import { OrchestratorGenerateOptionsPanel } from '@/components/chat/orchestrator-generate-options-panel';
import { listAgentsForCourse, type CourseAgentListItem } from '@/lib/utils/course-agents';
import { listStagesByCourse, loadStageData, type StageListItem } from '@/lib/utils/stage-storage';
import { loadCourseChatGroupMeta } from '@/lib/utils/contact-chat-storage';
import type { CourseChatGroupMeta } from '@/lib/types/chat';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Scene, SlideContent } from '@/lib/types/stage';
import { ScenePreviewDialog } from '@/components/slide-renderer/components/scene-preview-dialog';
import { COURSE_CHAT_GROUPS_UPDATED_EVENT } from '@/components/chat/course-chat-groups';
import { useAuthStore } from '@/lib/store/auth';
import {
  listPracticePlans,
  loadLearnerCourseState,
  saveLearnerCourseState,
  savePracticePlan,
  type LearnerCourseState,
  type PracticePlan,
} from '@/lib/learning/course-learner-state';
import {
  listRemotePracticePlans,
  loadRemoteLearnerCourseState,
} from '@/lib/utils/learner-course-api';

const surfaceClass = cn(
  'flex h-full flex-col overflow-hidden border-0 bg-background/72 shadow-none backdrop-blur-xl',
  'transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
);

const thinScrollbarClass =
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30';

const scrollClass = cn('min-h-0 flex-1 overflow-y-auto px-3 py-3', thinScrollbarClass);

const profileIntroScrollClass = cn(
  'mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5',
  thinScrollbarClass,
);

const profileSectionLabel = cn(
  'text-[10px] font-semibold uppercase tracking-[0.08em] text-[#86868b] dark:text-[#a1a1a6]',
);

const profileBodyText = cn('text-[13px] leading-relaxed text-[#1d1d1f]/88 dark:text-white/[0.82]');

const sceneLikeItemClass = cn(
  'group relative flex cursor-pointer flex-col rounded-[12px] p-2 transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
  'border border-slate-900/[0.06] bg-white/55 hover:bg-white/75 dark:border-white/[0.1] dark:bg-black/20 dark:hover:bg-black/35',
);

const rightRailTabTriggerClass =
  'text-xs data-active:text-[#007AFF] dark:data-active:text-[#64B5FF]';
const CHAT_SESSION_INDEX_PREFIX = 'syntara-chat-session-index:v1';

const notebookTagToneClasses = [
  'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/12 dark:text-sky-200',
  'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/12 dark:text-emerald-200',
  'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/12 dark:text-violet-200',
  'border-amber-500/25 bg-amber-500/12 text-amber-800 dark:border-amber-300/22 dark:bg-amber-400/14 dark:text-amber-200',
  'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-300/20 dark:bg-rose-400/12 dark:text-rose-200',
  'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:border-teal-300/20 dark:bg-teal-400/12 dark:text-teal-200',
];

function notebookTagClass(index: number) {
  return cn(
    'max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-sm shadow-black/[0.015]',
    notebookTagToneClasses[index % notebookTagToneClasses.length],
  );
}

function rowClass(collapsed: boolean) {
  return cn(
    'flex w-full items-center gap-3 rounded-[12px] py-2.5 text-left text-sm transition-colors duration-200',
    collapsed ? 'justify-center px-2' : 'px-3',
    'text-[#1d1d1f]/80 hover:bg-black/[0.04] dark:text-white/75 dark:hover:bg-white/[0.06]',
  );
}

type ChatSideSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type SessionTarget = {
  kind: 'agent' | 'notebook';
  id: string;
  name: string;
};

function makeSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sessionKey(courseId: string, target: SessionTarget) {
  return [
    CHAT_SESSION_INDEX_PREFIX,
    encodeURIComponent(courseId),
    encodeURIComponent(target.kind),
    encodeURIComponent(target.id),
  ].join(':');
}

function readSessions(courseId: string, target: SessionTarget): ChatSideSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(sessionKey(courseId, target));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ChatSideSession>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChatSideSession =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.createdAt === 'number' &&
          typeof item.updatedAt === 'number',
        ),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeSessions(courseId: string, target: SessionTarget, sessions: ChatSideSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      sessionKey(courseId, target),
      JSON.stringify(sessions.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12)),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function mergePlans(local: PracticePlan[], remote: PracticePlan[]): PracticePlan[] {
  const byId = new Map<string, PracticePlan>();
  for (const plan of [...local, ...remote]) {
    const previous = byId.get(plan.id);
    if (!previous || plan.updatedAt >= previous.updatedAt) byId.set(plan.id, plan);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function isImageAvatar(src: string) {
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

type GroupParticipant = CourseChatGroupMeta['participants'][number];

function participantKindLabel(kind: GroupParticipant['kind']): string {
  if (kind === 'orchestrator') return '主持';
  if (kind === 'notebook') return '笔记本';
  return 'Agent';
}

function participantRoleHint(kind: GroupParticipant['kind']): string {
  if (kind === 'orchestrator') return '负责拉群、分配和收束';
  if (kind === 'notebook') return '只补充相关资料';
  return '按需参与回答';
}

function participantHref(participant: GroupParticipant): string {
  if (participant.kind === 'notebook')
    return `/chat?notebook=${encodeURIComponent(participant.id)}`;
  return `/chat?agent=${encodeURIComponent(participant.id || COURSE_ORCHESTRATOR_ID)}`;
}

function ParticipantAvatar({
  participant,
  size = 'md',
}: {
  participant: GroupParticipant;
  size?: 'sm' | 'md';
}) {
  const sizeClass = size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl';
  const fallbackSizeClass = size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl';
  if (participant.avatarUrl && isImageAvatar(participant.avatarUrl)) {
    return (
      <img
        src={participant.avatarUrl}
        alt=""
        className={cn(sizeClass, 'shrink-0 object-cover ring-1 ring-black/5 dark:ring-white/10')}
      />
    );
  }
  return (
    <span
      className={cn(
        fallbackSizeClass,
        'flex shrink-0 items-center justify-center bg-violet-100 text-xs font-semibold text-violet-700 ring-1 ring-black/5 dark:bg-white/10 dark:text-violet-100 dark:ring-white/10',
      )}
    >
      {participant.name.trim().slice(0, 1) || '群'}
    </span>
  );
}

export interface ChatRightRailProps {
  collapsed: boolean;
  hasGlobalHeader?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mode?: 'chat' | 'notebook-create';
}

/**
 * 聊天页右侧玻璃侧栏：展示会话对象资料，笔记本会话额外展示内容目录。
 */
export function ChatRightRail({
  collapsed,
  hasGlobalHeader = true,
  onCollapsedChange,
  mode = 'chat',
}: ChatRightRailProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isNotebookCreateMode = mode === 'notebook-create';
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const userId = useAuthStore((s) => s.userId);
  const orchestratorAgentLive = useMemo((): CourseAgentListItem => {
    return {
      id: COURSE_ORCHESTRATOR_ID,
      name: COURSE_ORCHESTRATOR_NAME,
      avatar: resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl),
      role: 'teacher',
      persona:
        '课程总控，用于课程安排、概念解释、跨笔记本协作与学习答疑。创建笔记本请使用课程内创建界面。',
      color: '#007AFF',
      priority: 100,
      isGenerated: false,
    };
  }, [courseId, courseAvatarUrl]);
  const notebookId = searchParams.get('notebook');
  const agentId = searchParams.get('agent');
  const chatView = searchParams.get('view');
  const groupId = searchParams.get('group');
  const sessionId = searchParams.get('session')?.trim() || '';
  const isGroupChat =
    agentId === COURSE_ORCHESTRATOR_ID && (chatView === 'group' || Boolean(groupId));

  const [notebookStage, setNotebookStage] = useState<StageListItem | null>(null);
  const [resolvedAgent, setResolvedAgent] = useState<CourseAgentListItem | null>(null);
  const [groupMeta, setGroupMeta] = useState<CourseChatGroupMeta | null>(null);
  const [groupMetaLoading, setGroupMetaLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notebookScenes, setNotebookScenes] = useState<Scene[]>([]);
  const [notebookScenesLoading, setNotebookScenesLoading] = useState(false);
  const [railTab, setRailTab] = useState(isNotebookCreateMode ? 'generate-options' : 'sessions');
  const [sessions, setSessions] = useState<ChatSideSession[]>([]);
  const [learnerState, setLearnerState] = useState<LearnerCourseState | null>(null);
  const [practicePlans, setPracticePlans] = useState<PracticePlan[]>([]);
  const [learningLoading, setLearningLoading] = useState(false);

  useEffect(() => {
    if (isNotebookCreateMode) {
      setRailTab('generate-options');
      return;
    }
    setRailTab((current) =>
      current === 'sessions' || current === 'materials' || current === 'learning'
        ? current
        : 'sessions',
    );
  }, [isNotebookCreateMode]);

  const sessionTarget = useMemo<SessionTarget | null>(() => {
    if (notebookId) {
      return {
        kind: 'notebook',
        id: notebookId,
        name: notebookStage?.name || '当前笔记本',
      };
    }
    if (agentId && !isGroupChat) {
      return {
        kind: 'agent',
        id: agentId,
        name:
          resolvedAgent?.name ||
          (agentId === COURSE_ORCHESTRATOR_ID ? COURSE_ORCHESTRATOR_NAME : '当前 Agent'),
      };
    }
    return null;
  }, [agentId, isGroupChat, notebookId, notebookStage?.name, resolvedAgent?.name]);

  const activeSessionId = sessionId || 'default';

  const sessionHref = (targetSessionId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (targetSessionId === 'default') next.delete('session');
    else next.set('session', targetSessionId);
    return `/chat?${next.toString()}`;
  };

  useEffect(() => {
    if (!courseId || !sessionTarget) {
      setSessions([]);
      return;
    }
    const now = Date.now();
    const existing = readSessions(courseId, sessionTarget);
    const byId = new Map<string, ChatSideSession>();
    byId.set('default', {
      id: 'default',
      title: '默认会话',
      createdAt: existing.find((item) => item.id === 'default')?.createdAt ?? now,
      updatedAt: existing.find((item) => item.id === 'default')?.updatedAt ?? now,
    });
    for (const session of existing) byId.set(session.id, session);
    const current = byId.get(activeSessionId);
    byId.set(activeSessionId, {
      id: activeSessionId,
      title: current?.title || (activeSessionId === 'default' ? '默认会话' : '新会话'),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    const next = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    writeSessions(courseId, sessionTarget, next);
    setSessions(next);
  }, [activeSessionId, courseId, sessionTarget]);

  const createNewSession = () => {
    if (!courseId || !sessionTarget) return;
    const now = Date.now();
    const nextSession: ChatSideSession = {
      id: makeSessionId(),
      title: `新会话 ${sessions.filter((item) => item.id !== 'default').length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    const next = [nextSession, ...sessions];
    writeSessions(courseId, sessionTarget, next);
    setSessions(next);
    router.push(sessionHref(nextSession.id));
  };

  useEffect(() => {
    if (!courseId) {
      setLearnerState(null);
      setPracticePlans([]);
      setLearningLoading(false);
      return;
    }
    let alive = true;
    const localUserId = userId || 'anonymous';
    setLearningLoading(true);
    const localState = loadLearnerCourseState({ userId: localUserId, courseId });
    const localPlans = listPracticePlans(localUserId, courseId);
    setLearnerState(localState);
    setPracticePlans(localPlans);
    void (async () => {
      const [remoteState, remotePlans] = await Promise.all([
        loadRemoteLearnerCourseState(courseId),
        listRemotePracticePlans(courseId),
      ]);
      if (!alive) return;
      if (remoteState) {
        saveLearnerCourseState(remoteState);
        setLearnerState(remoteState);
      }
      remotePlans.forEach(savePracticePlan);
      setPracticePlans(mergePlans(localPlans, remotePlans));
      setLearningLoading(false);
    })().catch(() => {
      if (alive) setLearningLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [courseId, userId]);

  useEffect(() => {
    if (!courseId) {
      setNotebookStage(null);
      setResolvedAgent(null);
      return;
    }
    let alive = true;
    (async () => {
      setProfileLoading(true);
      try {
        const shouldLoadStages = Boolean(notebookId);
        const shouldLoadAgents = Boolean(agentId && agentId !== COURSE_ORCHESTRATOR_ID);
        const [stages, agents] = await Promise.all([
          shouldLoadStages ? listStagesByCourse(courseId) : Promise.resolve<StageListItem[]>([]),
          shouldLoadAgents
            ? listAgentsForCourse(courseId)
            : Promise.resolve<CourseAgentListItem[]>([]),
        ]);
        if (!alive) return;
        if (notebookId) {
          setNotebookStage(stages.find((s) => s.id === notebookId) ?? null);
        } else {
          setNotebookStage(null);
        }
        if (agentId) {
          if (agentId === COURSE_ORCHESTRATOR_ID) {
            setResolvedAgent(orchestratorAgentLive);
          } else {
            setResolvedAgent(agents.find((a) => a.id === agentId) ?? null);
          }
        } else {
          setResolvedAgent(null);
        }
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId, notebookId, agentId, orchestratorAgentLive]);

  useEffect(() => {
    if (!courseId || !groupId || !isGroupChat) {
      setGroupMeta(null);
      setGroupMetaLoading(false);
      return;
    }
    let alive = true;
    const load = async () => {
      setGroupMetaLoading(true);
      try {
        const meta = await loadCourseChatGroupMeta(courseId, groupId);
        if (alive) setGroupMeta(meta);
      } catch {
        if (alive) setGroupMeta(null);
      } finally {
        if (alive) setGroupMetaLoading(false);
      }
    };
    void load();
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ courseId?: string; groupId?: string }>).detail;
      if (detail?.courseId !== courseId) return;
      if (detail?.groupId && detail.groupId !== groupId) return;
      void load();
    };
    window.addEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onUpdated as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onUpdated as EventListener);
    };
  }, [courseId, groupId, isGroupChat]);

  useEffect(() => {
    if (!notebookId) {
      setNotebookScenes([]);
      setNotebookScenesLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setNotebookScenesLoading(true);
      try {
        const data = await loadStageData(notebookId);
        if (!alive) return;
        const scenes = (data?.scenes ?? []).slice().sort((a, b) => a.order - b.order);
        setNotebookScenes(scenes);
      } catch {
        if (alive) setNotebookScenes([]);
      } finally {
        if (alive) setNotebookScenesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [notebookId]);

  const profileBody = () => {
    if (!courseId) {
      return (
        <div className="px-1 py-2 text-center">
          <NotebookPen
            className="mx-auto mb-3 size-9 text-[#86868b] opacity-80 dark:text-[#a1a1a6]"
            strokeWidth={1.5}
          />
          <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
            无课程上下文。请从「我的课程」进入后再打开聊天。
          </p>
        </div>
      );
    }
    if (profileLoading) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="size-7 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
        </div>
      );
    }
    if (isGroupChat) {
      if (!groupId) {
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-8 text-center">
            <Users className="mb-3 size-9 text-[#86868b] opacity-80 dark:text-[#a1a1a6]" />
            <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
              发起多笔记本协作后，这里会显示当前群聊成员。
            </p>
          </div>
        );
      }
      if (groupMetaLoading && !groupMeta) {
        return (
          <div className="flex justify-center py-12">
            <Loader2 className="size-7 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
          </div>
        );
      }
      if (!groupMeta) {
        return (
          <div className="px-1 py-4 text-center">
            <Users
              className="mx-auto mb-3 size-9 text-[#86868b] dark:text-[#a1a1a6]"
              strokeWidth={1.5}
            />
            <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
              未找到这个群聊，可能已经被删除。
            </p>
          </div>
        );
      }
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0.5 pb-2">
          <div className="shrink-0 text-center">
            <div className="mb-3 flex justify-center -space-x-2">
              {groupMeta.participants.slice(0, 5).map((participant) => (
                <span
                  key={participant.id}
                  className="rounded-xl border-2 border-white shadow-sm dark:border-slate-950"
                >
                  <ParticipantAvatar participant={participant} size="md" />
                </span>
              ))}
            </div>
            <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-[#1d1d1f] dark:text-white/95">
              {groupMeta.name}
            </h2>
            <p className="mt-1 text-xs text-[#86868b] dark:text-[#a1a1a6]">
              {groupMeta.participants.length} 位成员 · 课程总控调度
            </p>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
            <p className={cn(profileSectionLabel, 'shrink-0')}>成员</p>
            <div
              className={cn(
                'mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5',
                thinScrollbarClass,
              )}
            >
              {groupMeta.participants.map((participant) => (
                <Link
                  key={`${participant.kind}:${participant.id}`}
                  href={participantHref(participant)}
                  className="flex items-center gap-2.5 rounded-[12px] border border-slate-900/[0.06] bg-white/55 p-2 transition-colors hover:bg-white/80 dark:border-white/[0.1] dark:bg-black/20 dark:hover:bg-black/35"
                  title={participant.name}
                >
                  <ParticipantAvatar participant={participant} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {participant.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
                        {participantKindLabel(participant.kind)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {participantRoleHint(participant.kind)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {groupMeta.createdReason ? (
            <div className="mt-3 shrink-0 rounded-[12px] border border-slate-900/[0.06] bg-slate-50/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.05]">
              {groupMeta.createdReason}
            </div>
          ) : null}
        </div>
      );
    }
    if (notebookId) {
      if (!notebookStage) {
        return (
          <div className="px-1 py-4 text-center">
            <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
              未找到该笔记本，可能已删除或暂无权限加载。
            </p>
          </div>
        );
      }
      const av = notebookStage.avatarUrl && isImageAvatar(notebookStage.avatarUrl);
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0.5 pb-2">
          <div className="shrink-0">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  'relative mb-3',
                  'after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:ring-1 after:ring-inset after:ring-[#007AFF]/20 dark:after:ring-[#0A84FF]/25',
                )}
              >
                {av ? (
                  <img
                    src={notebookStage.avatarUrl}
                    alt=""
                    className="size-[72px] rounded-2xl object-cover shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_28px_rgba(0,0,0,0.35)]"
                  />
                ) : (
                  <div className="flex size-[72px] items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 dark:from-[#0a1c33]/80 dark:to-[#0d2240]/60">
                    <NotebookPen
                      className="size-8 text-[#007AFF]/70 dark:text-[#0A84FF]/75"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
              </div>
              <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-[#1d1d1f] dark:text-white/95">
                {notebookStage.name}
              </h2>
              {notebookStage.tags && notebookStage.tags.length > 0 ? (
                <div className="mt-4 w-full">
                  <p className={cn(profileSectionLabel, 'w-full text-left')}>标签</p>
                  <div className="mt-2 flex w-full flex-wrap justify-start gap-1.5 px-0.5">
                    {notebookStage.tags.map((tag, index) => (
                      <span key={tag} className={notebookTagClass(index)} title={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex shrink-0 flex-col border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
            <p className={cn(profileSectionLabel, 'shrink-0')}>简介</p>
            <div className={cn(profileIntroScrollClass, 'max-h-32 flex-none')}>
              {notebookStage.description ? (
                <p className={profileBodyText}>{notebookStage.description}</p>
              ) : (
                <p className="text-[12px] leading-relaxed text-[#86868b] dark:text-[#a1a1a6]">
                  暂无描述，可在课程空间中为笔记本补充简介。
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (agentId) {
      if (!resolvedAgent) {
        return (
          <div className="px-1 py-4 text-center">
            <Bot
              className="mx-auto mb-3 size-9 text-[#86868b] dark:text-[#a1a1a6]"
              strokeWidth={1.5}
            />
            <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
              未在课程 Agent 列表中解析到该 ID，可能为旧链接或注册表未同步。
            </p>
          </div>
        );
      }
      const av = resolvedAgent.avatar && isImageAvatar(resolvedAgent.avatar);
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0.5 pb-2">
          <div className="shrink-0">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  'relative mb-3',
                  'after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-inset after:ring-[#007AFF]/22 dark:after:ring-[#0A84FF]/28',
                )}
              >
                {av ? (
                  <img
                    src={resolvedAgent.avatar}
                    alt=""
                    className="size-[72px] rounded-full object-cover shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_28px_rgba(0,0,0,0.35)]"
                  />
                ) : (
                  <div className="flex size-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#007AFF]/18 to-[#5856D6]/14 text-xl font-semibold text-[#007AFF] dark:from-[#0A84FF]/22 dark:to-[#6360E0]/18 dark:text-[#64b5ff]">
                    {resolvedAgent.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-[#1d1d1f] dark:text-white/95">
                {resolvedAgent.name}
              </h2>
            </div>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <p className={cn(profileSectionLabel, 'shrink-0')}>说明</p>
            <div className={profileIntroScrollClass}>
              <p className={profileBodyText}>{resolvedAgent.persona}</p>
            </div>
          </div>

          {resolvedAgent.isGenerated ? (
            <p className="mt-3 shrink-0 text-[11px] text-[#86868b] dark:text-[#a1a1a6]">
              课程生成角色
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="px-1 py-4 text-center">
        <Bot
          className="mx-auto mb-3 size-9 text-[#86868b] opacity-70 dark:text-[#a1a1a6]"
          strokeWidth={1.5}
        />
        <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
          请在左侧选择笔记本或课程 Agent，将在此显示头像与说明。
        </p>
      </div>
    );
  };

  const sceneLikeBody = () => {
    if (!courseId) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            进入课程后可查看该课程下的笔记本内容目录。
          </p>
        </div>
      );
    }
    if (!notebookId) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            请先选择一个笔记本，这里会显示该笔记本的内容目录。
          </p>
        </div>
      );
    }
    if (profileLoading || notebookScenesLoading) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center py-10">
          <Loader2 className="size-6 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
        </div>
      );
    }
    if (notebookScenes.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            当前笔记本还没有可展示的内容页。
          </p>
        </div>
      );
    }
    return (
      <ul className="flex list-none flex-col gap-2 p-0">
        {notebookScenes.map((scene, idx) => {
          const isSlide = scene.type === 'slide';
          const slideContent = isSlide ? (scene.content as SlideContent) : null;
          return (
            <li key={scene.id}>
              <ScenePreviewDialog
                scene={scene}
                previewMode="thumbnail"
                description="放大当前目录缩略图。"
                trigger={
                  <button
                    type="button"
                    className={cn(
                      sceneLikeItemClass,
                      'w-full text-left ring-1 ring-[rgba(0,122,255,0.22)] bg-[rgba(0,122,255,0.08)] dark:ring-[rgba(10,132,255,0.35)] dark:bg-[rgba(10,132,255,0.14)]',
                    )}
                    title={scene.title}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="relative mb-1.5 aspect-video w-full overflow-hidden rounded-[9px] ring-1 ring-slate-900/[0.08] dark:ring-white/[0.1]">
                        {isSlide && slideContent ? (
                          <div className="relative h-full w-full">
                            <ThumbnailSlide
                              slide={slideContent.canvas}
                              size={223}
                              viewportSize={slideContent.canvas.viewportSize ?? 1000}
                              viewportRatio={slideContent.canvas.viewportRatio ?? 0.5625}
                            />
                            <span
                              className={cn(
                                'pointer-events-none absolute right-1.5 top-1.5 z-[8] inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shadow-sm',
                                'bg-[#007AFF] text-white dark:bg-[#0A84FF]',
                              )}
                              aria-hidden
                            >
                              {idx + 1}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex h-full w-full items-center justify-center bg-slate-100/80 text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                              {scene.type === 'quiz'
                                ? '测验'
                                : scene.type === 'interactive'
                                  ? '交互'
                                  : scene.type === 'pbl'
                                    ? '项目式学习'
                                    : scene.type}
                            </div>
                            <span
                              className={cn(
                                'pointer-events-none absolute right-1.5 top-1.5 z-[8] inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shadow-sm',
                                'bg-[#007AFF] text-white dark:bg-[#0A84FF]',
                              )}
                              aria-hidden
                            >
                              {idx + 1}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
    );
  };

  const sessionBody = () => {
    if (!courseId) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[230px] text-xs leading-relaxed text-muted-foreground">
            进入课程后，右侧会显示当前 Agent 或笔记本的会话管理。
          </p>
        </div>
      );
    }
    if (isGroupChat) {
      return (
        <div className="space-y-3">
          <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-violet-600 dark:text-violet-200" />
              <p className="text-sm font-semibold text-foreground">群聊会话</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              群聊由课程总控按问题动态调度，不在这里拆分新会话。要重新开始，回到课程总控发起新问题。
            </p>
          </div>
          {profileBody()}
        </div>
      );
    }
    if (!sessionTarget) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[230px] text-xs leading-relaxed text-muted-foreground">
            请先在左侧选择一个 Agent 或笔记本。
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <p className={profileSectionLabel}>当前对象</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {sessionTarget.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sessionTarget.kind === 'agent' ? 'Agent 会话' : '笔记本会话'}
          </p>
        </div>

        <button
          type="button"
          onClick={createNewSession}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] bg-black text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
        >
          <MessageSquarePlus className="size-4" />
          添加新会话
        </button>

        <div className="space-y-2">
          <p className={profileSectionLabel}>会话列表</p>
          <div className="flex flex-col gap-1.5">
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <Link
                  key={session.id}
                  href={sessionHref(session.id)}
                  className={cn(
                    'rounded-[14px] border px-3 py-2 transition-colors',
                    active
                      ? 'border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-300/30 dark:bg-sky-400/12 dark:text-sky-100'
                      : 'border-slate-900/[0.06] bg-white/55 text-foreground hover:bg-white/85 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold">{session.title}</span>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-200">
                        当前
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock3 className="size-3" />
                    {formatShortDate(session.updatedAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const materialsBody = () => {
    const resourceHref = courseId
      ? `/course/${encodeURIComponent(courseId)}/resources`
      : '/my-courses';
    const uploadHref = courseId ? createNotebookHref(courseId) : '/my-courses';
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Link
            href={uploadHref}
            className="flex items-center gap-3 rounded-[16px] border border-sky-300/40 bg-sky-50/85 p-3 text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-300/20 dark:bg-sky-400/12 dark:text-sky-100 dark:hover:bg-sky-400/18"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-white/10">
              <UploadCloud className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">上传更多资料</span>
              <span className="block truncate text-[11px] opacity-80">
                PDF、讲义或素材进入课程资料
              </span>
            </span>
          </Link>
          <Link
            href={resourceHref}
            className="flex items-center gap-3 rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 text-foreground transition-colors hover:bg-white/85 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-white/10">
              <LibraryBig className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">课程资料库</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                查看记忆、笔记本和题库资料
              </span>
            </span>
          </Link>
        </div>

        <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/45 p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
          <p className={profileSectionLabel}>对象资料</p>
          <div className="mt-3">{profileBody()}</div>
        </div>

        {notebookId ? (
          <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/45 p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
            <p className={profileSectionLabel}>笔记本目录</p>
            <div className="mt-3">{sceneLikeBody()}</div>
          </div>
        ) : null}
      </div>
    );
  };

  const learningBody = () => {
    const activePlans = practicePlans.filter((plan) => plan.status !== 'completed').slice(0, 4);
    const recentPlans = practicePlans.slice(0, 4);
    const weakPoints =
      learnerState?.activeWeakPoints.filter((point) => point.status !== 'resolved').slice(0, 4) ??
      [];
    const recentAttempts = learnerState?.recentProblemAttempts.slice(0, 4) ?? [];
    const progressLabel =
      learnerState?.lastPlanningScope?.label ||
      learnerState?.progressCheckpoint?.label ||
      '还没有确认学习进度';
    const learnHref = courseId ? `/learn?courseId=${encodeURIComponent(courseId)}` : '/learn';

    return (
      <div className="space-y-3">
        <Link
          href={learnHref}
          className="flex items-center gap-3 rounded-[16px] border border-emerald-300/35 bg-emerald-50/80 p-3 text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-300/20 dark:bg-emerald-400/12 dark:text-emerald-100"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-white/10">
            <BookOpenCheck className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">学习状态和计划</span>
            <span className="block truncate text-[11px] opacity-80">
              {courseName || '当前课程'}
            </span>
          </span>
        </Link>

        <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-emerald-600 dark:text-emerald-200" />
            <p className="text-sm font-semibold text-foreground">当前进度</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{progressLabel}</p>
        </div>

        {learningLoading ? (
          <div className="flex justify-center py-5">
            <Loader2 className="size-5 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
          </div>
        ) : null}

        <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-2">
            <p className={profileSectionLabel}>进行中的计划</p>
            <ListChecks className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 space-y-1.5">
            {(activePlans.length > 0 ? activePlans : recentPlans).length > 0 ? (
              (activePlans.length > 0 ? activePlans : recentPlans).map((plan) => (
                <Link
                  key={plan.id}
                  href={`/practice/${encodeURIComponent(plan.id)}`}
                  className="block rounded-[12px] border border-slate-900/[0.06] bg-white/55 px-2.5 py-2 hover:bg-white/85 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                >
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {plan.title}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {plan.mode === 'quiz' ? '测验' : '刷题'} · {plan.problemIds.length} 题 ·{' '}
                    {plan.estimatedMinutes} 分钟
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                还没有计划。可以在聊天里说“帮我安排复习/刷题”。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <p className={profileSectionLabel}>薄弱点</p>
          <div className="mt-2 space-y-1.5">
            {weakPoints.length > 0 ? (
              weakPoints.map((point) => (
                <div key={point.id} className="rounded-[12px] bg-amber-500/10 px-2.5 py-2">
                  <p className="truncate text-xs font-semibold text-amber-900 dark:text-amber-100">
                    {point.title || point.concept}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-amber-900/70 dark:text-amber-100/70">
                    {point.evidence}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                暂无明确薄弱点。继续聊天或做题后会自动更新。
              </p>
            )}
          </div>
        </div>

        {recentAttempts.length > 0 ? (
          <div className="rounded-[16px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <p className={profileSectionLabel}>最近做题</p>
            <div className="mt-2 space-y-1.5">
              {recentAttempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center gap-2 text-xs">
                  <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{attempt.problemTitle}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {attempt.status === 'passed'
                      ? '掌握'
                      : attempt.status === 'partial'
                        ? '半会'
                        : '还不会'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'pointer-events-none fixed right-4 z-[1290]',
        hasGlobalHeader ? 'top-[76px] h-[calc(100dvh-92px)]' : 'top-4 h-[calc(100dvh-2rem)]',
        collapsed ? 'w-[88px]' : 'w-[min(330px,calc(100vw-2rem))]',
      )}
      aria-label={isNotebookCreateMode ? '创建笔记本设置侧栏' : '聊天信息侧栏'}
    >
      <div className={cn('pointer-events-auto h-full', surfaceClass)}>
        {collapsed ? (
          <div
            className={cn(
              'relative flex shrink-0 flex-col border-b border-slate-900/[0.08] dark:border-white/[0.08]',
              'items-center px-2 py-3',
            )}
          >
            <button
              type="button"
              onClick={() => onCollapsedChange(!collapsed)}
              className="mb-2 flex size-8 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground"
              aria-label="展开右侧栏"
            >
              <ChevronLeft className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        ) : null}

        {collapsed ? (
          <nav
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5"
            aria-label="快捷操作"
          >
            <div className={cn(scrollClass, 'flex flex-col gap-2 px-0')}>
              <ul className="flex flex-col gap-0.5">
                {[
                  { key: 'sessions', label: '会话', Icon: MessageSquarePlus },
                  { key: 'materials', label: '资料', Icon: UploadCloud },
                  { key: 'learning', label: '学习', Icon: BookOpenCheck },
                ].map(({ key, label, Icon }) => (
                  <li key={key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={rowClass(true)}
                          onClick={() => {
                            setRailTab(key);
                            onCollapsedChange(false);
                          }}
                          aria-label={label}
                        >
                          <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{label}</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
                <li>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/settings" className={rowClass(true)}>
                        <Settings className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="left">设置</TooltipContent>
                  </Tooltip>
                </li>
              </ul>
            </div>
          </nav>
        ) : isNotebookCreateMode ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-900/[0.08] px-3 py-2.5 dark:border-white/[0.08]">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">创建设置</p>
              <button
                type="button"
                onClick={() => onCollapsedChange(true)}
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground"
                aria-label="收起右侧栏"
              >
                <ChevronRight className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
              <OrchestratorGenerateOptionsPanel />
            </div>
          </>
        ) : (
          <>
            <Tabs
              value={railTab}
              onValueChange={setRailTab}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-slate-900/[0.08] px-2 py-0 dark:border-white/[0.08]">
                <TabsList className="grid min-h-9 min-w-0 flex-1 grid-cols-3" variant="default">
                  <TabsTrigger value="sessions" className={rightRailTabTriggerClass}>
                    会话
                  </TabsTrigger>
                  <TabsTrigger value="materials" className={rightRailTabTriggerClass}>
                    资料
                  </TabsTrigger>
                  <TabsTrigger value="learning" className={rightRailTabTriggerClass}>
                    学习
                  </TabsTrigger>
                </TabsList>
                <button
                  type="button"
                  onClick={() => onCollapsedChange(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground"
                  aria-label="收起右侧栏"
                >
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                </button>
              </div>

              <TabsContent
                value="sessions"
                className={cn(scrollClass, 'mt-0 flex min-h-0 flex-1 flex-col')}
              >
                {sessionBody()}
              </TabsContent>
              <TabsContent
                value="materials"
                className={cn(scrollClass, 'mt-0 flex min-h-0 flex-1 flex-col')}
              >
                {materialsBody()}
              </TabsContent>
              <TabsContent
                value="learning"
                className={cn(scrollClass, 'mt-0 flex min-h-0 flex-1 flex-col')}
              >
                {learningBody()}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </aside>
  );
}
