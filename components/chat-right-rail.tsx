'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, ChevronLeft, ChevronRight, Loader2, NotebookPen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppCoreNavList } from '@/components/app-core-nav-list';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
  courseOrchestratorChatHref,
  resolveCourseOrchestratorAvatar,
} from '@/lib/constants/course-chat';
import { OrchestratorGenerateOptionsPanel } from '@/components/chat/orchestrator-generate-options-panel';
import { listAgentsForCourse, type CourseAgentListItem } from '@/lib/utils/course-agents';
import { listStagesByCourse, loadStageData, type StageListItem } from '@/lib/utils/stage-storage';
import { listActiveAgentTasksByCourse } from '@/lib/utils/agent-task-storage';
import type { AgentTaskRecord } from '@/lib/utils/database';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Scene, SlideContent } from '@/lib/types/stage';
import { ScenePreviewDialog } from '@/components/slide-renderer/components/scene-preview-dialog';

const surfaceClass = cn(
  'flex h-full flex-col overflow-hidden apple-glass-heavy',
  'rounded-[20px] transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
);

const thinScrollbarClass =
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30';

const scrollClass = cn('min-h-0 flex-1 overflow-y-auto px-3 py-3', thinScrollbarClass);

/** 资料 Tab：外层不滚动，仅内部长文案区滚动 */
const profileTabShellClass = 'mt-0 min-h-0 flex flex-1 flex-col overflow-hidden px-3 py-3';

const profileIntroScrollClass = cn(
  'mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5',
  thinScrollbarClass,
);

const profileSectionLabel = cn(
  'text-[10px] font-semibold uppercase tracking-[0.08em] text-[#86868b] dark:text-[#a1a1a6]',
);

const profileBodyText = cn(
  'text-[13px] leading-relaxed text-[#1d1d1f]/88 dark:text-white/[0.82]',
);

const sceneLikeItemClass = cn(
  'group relative flex cursor-pointer flex-col rounded-[12px] p-2 transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
  'border border-slate-900/[0.06] bg-white/55 hover:bg-white/75 dark:border-white/[0.1] dark:bg-black/20 dark:hover:bg-black/35',
);

function notebookTagClass() {
  return cn(
    'max-w-full truncate rounded-md border border-black/[0.08] bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-[#1d1d1f]/80',
    'dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-white/78',
  );
}

function rowClass(collapsed: boolean) {
  return cn(
    'flex w-full items-center gap-3 rounded-[12px] py-2.5 text-left text-sm transition-colors duration-200',
    collapsed ? 'justify-center px-2' : 'px-3',
    'text-[#1d1d1f]/80 hover:bg-black/[0.04] dark:text-white/75 dark:hover:bg-white/[0.06]',
  );
}

function isImageAvatar(src: string) {
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

/** 已绑定笔记本时进入互动教室；否则进入创建页；无课程时回退到聊天。 */
function taskProgressHref(courseId: string | null | undefined, t: AgentTaskRecord): string {
  const nid = t.notebookId?.trim();
  if (nid && t.status === 'done') {
    return `/classroom/${encodeURIComponent(nid)}`;
  }
  const cid = courseId?.trim();
  if (cid) {
    return courseOrchestratorChatHref('generate-notebook');
  }
  if (t.contactKind === 'notebook') {
    return `/chat?notebook=${encodeURIComponent(t.contactId)}`;
  }
  return `/chat?agent=${encodeURIComponent(t.contactId)}`;
}

function taskKindLabel(kind: AgentTaskRecord['contactKind']): string {
  return kind === 'notebook' ? '笔记本' : 'Agent';
}

function isMockTaskLike(task: Pick<AgentTaskRecord, 'title' | 'detail'>): boolean {
  return /mock/i.test(task.title || '') || /\[mock\]/i.test(task.detail || '');
}

export interface ChatRightRailProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/**
 * 聊天页右侧玻璃侧栏：Tab「当前」展示会话对象资料；Tab「进行中」展示课程内活跃 Agent 任务。
 */
export function ChatRightRail({ collapsed, onCollapsedChange }: ChatRightRailProps) {
  const searchParams = useSearchParams();
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const orchestratorAgentLive = useMemo((): CourseAgentListItem => {
    return {
      id: COURSE_ORCHESTRATOR_ID,
      name: COURSE_ORCHESTRATOR_NAME,
      avatar: resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl),
      role: 'teacher',
      persona: '课程总控，主要用于直接创建笔记本；也可并行调度本课程下的多个笔记本与子任务。',
      color: '#007AFF',
      priority: 100,
      isGenerated: false,
    };
  }, [courseId, courseAvatarUrl]);
  const notebookId = searchParams.get('notebook');
  const agentId = searchParams.get('agent');
  const composer = searchParams.get('composer');
  const isOrchestratorGenerateMode =
    agentId === COURSE_ORCHESTRATOR_ID && !notebookId && composer === 'generate-notebook';

  const [notebookStage, setNotebookStage] = useState<StageListItem | null>(null);
  const [resolvedAgent, setResolvedAgent] = useState<CourseAgentListItem | null>(null);
  const [courseStages, setCourseStages] = useState<StageListItem[]>([]);
  const [courseAgents, setCourseAgents] = useState<CourseAgentListItem[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeTasks, setActiveTasks] = useState<AgentTaskRecord[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [notebookScenes, setNotebookScenes] = useState<Scene[]>([]);
  const [notebookScenesLoading, setNotebookScenesLoading] = useState(false);
  const [railTab, setRailTab] = useState('profile');
  const prevOrchestratorGenRef = useRef(false);

  const createHref = courseId ? courseOrchestratorChatHref('generate-notebook') : '/create';

  useEffect(() => {
    if (isOrchestratorGenerateMode && !prevOrchestratorGenRef.current) {
      setRailTab('generate-options');
    }
    prevOrchestratorGenRef.current = isOrchestratorGenerateMode;
  }, [isOrchestratorGenerateMode]);

  useEffect(() => {
    if (!isOrchestratorGenerateMode && railTab === 'generate-options') {
      setRailTab('profile');
    }
  }, [isOrchestratorGenerateMode, railTab]);

  useEffect(() => {
    if (!courseId) {
      setNotebookStage(null);
      setResolvedAgent(null);
      setCourseStages([]);
      setCourseAgents([]);
      return;
    }
    let alive = true;
    (async () => {
      setProfileLoading(true);
      try {
        const [stages, agents] = await Promise.all([
          listStagesByCourse(courseId),
          listAgentsForCourse(courseId),
        ]);
        if (!alive) return;
        setCourseStages(stages);
        setCourseAgents(agents);
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

  useEffect(() => {
    if (!courseId) {
      setActiveTasks([]);
      return;
    }
    let alive = true;
    const load = async () => {
      setTasksLoading(true);
      try {
        const tasks = await listActiveAgentTasksByCourse(courseId);
        if (!alive) return;
        setActiveTasks(tasks.filter((t) => !isMockTaskLike(t)));
      } catch {
        if (alive) setActiveTasks([]);
      } finally {
        if (alive) setTasksLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [courseId]);

  const activeTaskCount = activeTasks.length;

  const taskContactAvatar = (t: AgentTaskRecord) => {
    if (t.contactKind === 'agent') {
      const agent =
        t.contactId === COURSE_ORCHESTRATOR_ID
          ? orchestratorAgentLive
          : courseAgents.find((a) => a.id === t.contactId);
      const src = agent?.avatar?.trim() || '';
      if (src && isImageAvatar(src)) {
        return (
          <img
            src={src}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
          />
        );
      }
      return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-800 ring-1 ring-black/5 dark:text-violet-200 dark:ring-white/10">
          {(agent?.name || 'A').slice(0, 1)}
        </div>
      );
    }
    const notebook = courseStages.find((s) => s.id === t.contactId);
    const src = notebook?.avatarUrl?.trim() || '';
    if (src && isImageAvatar(src)) {
      return (
        <img
          src={src}
          alt=""
          className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
        />
      );
    }
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <NotebookPen className="size-3.5" strokeWidth={1.8} />
      </div>
    );
  };

  const taskActorLabel = (t: AgentTaskRecord): string => {
    if (t.contactKind === 'agent') {
      if (t.contactId === COURSE_ORCHESTRATOR_ID) return COURSE_ORCHESTRATOR_NAME;
      return courseAgents.find((a) => a.id === t.contactId)?.name || `Agent · ${t.contactId.slice(0, 10)}`;
    }
    return courseStages.find((s) => s.id === t.contactId)?.name || `笔记本 · ${t.contactId.slice(0, 10)}`;
  };

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
                    <NotebookPen className="size-8 text-[#007AFF]/70 dark:text-[#0A84FF]/75" strokeWidth={1.5} />
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
                    {notebookStage.tags.map((tag) => (
                      <span key={tag} className={notebookTagClass()} title={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
            <p className={cn(profileSectionLabel, 'shrink-0')}>简介</p>
            <div className={profileIntroScrollClass}>
              {notebookStage.description ? (
                <p className={profileBodyText}>{notebookStage.description}</p>
              ) : (
                <p className="text-[12px] leading-relaxed text-[#86868b] dark:text-[#a1a1a6]">
                  暂无描述，可在课程空间中为笔记本补充简介。
                </p>
              )}
            </div>
          </div>

          <Link
            href={`/classroom/${encodeURIComponent(notebookId)}`}
            className={cn(
              'mt-3 flex h-9 w-full shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold transition-colors',
              'bg-[#007AFF] text-white shadow-sm hover:opacity-[0.92] active:opacity-85',
              'dark:bg-[#0A84FF] dark:hover:opacity-[0.92]',
            )}
            aria-label={`进入笔记本：${notebookStage.name}`}
          >
            进入笔记本
          </Link>
        </div>
      );
    }
    if (agentId) {
      if (!resolvedAgent) {
        return (
          <div className="px-1 py-4 text-center">
            <Bot className="mx-auto mb-3 size-9 text-[#86868b] dark:text-[#a1a1a6]" strokeWidth={1.5} />
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
            <p className="mt-3 shrink-0 text-[11px] text-[#86868b] dark:text-[#a1a1a6]">课程生成角色</p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="px-1 py-4 text-center">
        <Bot className="mx-auto mb-3 size-9 text-[#86868b] opacity-70 dark:text-[#a1a1a6]" strokeWidth={1.5} />
        <p className={cn(profileBodyText, 'text-[12px] text-[#86868b] dark:text-[#a1a1a6]')}>
          请在左侧选择笔记本或课程 Agent，将在此显示头像与说明。
        </p>
      </div>
    );
  };

  const activeTasksEmptyWrap = (children: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-8 text-center">
      {children}
    </div>
  );

  const activeTasksBody = () => {
    if (!courseId) {
      return activeTasksEmptyWrap(
        <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
          进入课程后即可查看进行中的调度任务。
        </p>,
      );
    }
    if (tasksLoading && activeTasks.length === 0) {
      return activeTasksEmptyWrap(
        <Loader2 className="size-6 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />,
      );
    }
    if (activeTasks.length === 0) {
      return activeTasksEmptyWrap(
        <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
          当前没有运行中或等待中的 Agent 任务。向总控发指令或触发笔记本生成后，会在此列出。
        </p>,
      );
    }
    return (
      <ul className="flex list-none flex-col gap-2 p-0">
        {activeTasks.map((t) => (
          <li key={t.id}>
            <Link
              href={taskProgressHref(courseId, t)}
              title="进入互动教室查看生成进度"
              className="block rounded-[12px] border border-slate-900/[0.08] bg-white/50 p-2.5 transition-colors hover:bg-white/80 dark:border-white/[0.1] dark:bg-black/20 dark:hover:bg-black/35"
            >
              <div className="flex items-start gap-2.5">
                {taskContactAvatar(t)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {t.title}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        t.status === 'waiting'
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                      )}
                    >
                      {t.status === 'waiting' ? '等待' : '运行'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {taskKindLabel(t.contactKind)} · {taskActorLabel(t)}
                  </p>
                  {t.detail ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {t.detail}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-muted-foreground/90">
                    {t.status === 'done' && t.notebookId?.trim()
                      ? '点击进入互动教室'
                      : '点击查看当前生成进度'}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  const sceneLikeBody = () => {
    if (!courseId) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            进入课程后可查看该课程下的笔记本侧栏导航。
          </p>
        </div>
      );
    }
    if (!notebookId) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            请先在「当前对象」中选择一个笔记本，即可在这里看到该对象的 slides 列表。
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
            当前对象还没有可展示的 slides。
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

  return (
    <aside
      className={cn(
        'pointer-events-none fixed right-4 top-4 z-[1290] h-[calc(100dvh-2rem)]',
        collapsed ? 'w-[88px]' : 'w-[min(270px,calc(100vw-2rem))]',
      )}
      aria-label="聊天信息侧栏"
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
                <li>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={createHref} className={rowClass(true)}>
                        <NotebookPen className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="left">创建笔记本</TooltipContent>
                  </Tooltip>
                </li>
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
              <div className="border-t border-slate-900/[0.08] pt-2 dark:border-white/[0.08]">
                <AppCoreNavList
                  collapsed
                  tooltipSide="left"
                  chatRightRailOrder
                  excludeKeys={[
                    'top-up',
                    'credits-market',
                    'store',
                    'chat',
                    'notifications',
                    'live2d',
                    'profile',
                    'settings',
                    'contact-support',
                    'report-issue',
                  ]}
                />
              </div>
            </div>
          </nav>
        ) : (
          <>
            <Tabs
              value={railTab}
              onValueChange={setRailTab}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-900/[0.08] px-2 pb-2 pt-2 dark:border-white/[0.08]">
                <TabsList
                  className={cn(
                    'grid min-h-9 min-w-0 flex-1',
                    isOrchestratorGenerateMode || notebookId ? 'grid-cols-3' : 'grid-cols-2',
                  )}
                  variant="default"
                >
                  {isOrchestratorGenerateMode ? (
                    <TabsTrigger value="generate-options" className="text-xs">
                      生成选项
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="profile" className="text-xs">
                    当前对象
                  </TabsTrigger>
                  <TabsTrigger
                    value="active"
                    title={activeTaskCount > 0 ? `${activeTaskCount} 个进行中的任务` : undefined}
                    className="relative text-xs"
                  >
                    <span className={activeTaskCount > 0 ? 'pr-3.5' : undefined}>进行中</span>
                    {activeTaskCount > 0 ? (
                      <span
                        className="pointer-events-none absolute right-1 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#007AFF] px-1 text-[8px] font-bold leading-none text-white tabular-nums dark:bg-[#0A84FF]"
                        aria-hidden
                      >
                        {activeTaskCount > 99 ? '99+' : activeTaskCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  {notebookId ? (
                    <TabsTrigger value="scene-like" className="text-xs">
                      侧栏导航
                    </TabsTrigger>
                  ) : null}
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

              {isOrchestratorGenerateMode ? (
                <TabsContent
                  value="generate-options"
                  className={cn(profileTabShellClass, 'min-h-0 overflow-y-auto', thinScrollbarClass)}
                >
                  <OrchestratorGenerateOptionsPanel />
                </TabsContent>
              ) : null}
              <TabsContent value="profile" className={profileTabShellClass}>
                {profileBody()}
              </TabsContent>
              <TabsContent
                value="active"
                className={cn(scrollClass, 'mt-0 flex min-h-0 flex-1 flex-col')}
              >
                {activeTasksBody()}
              </TabsContent>
              {notebookId ? (
                <TabsContent
                  value="scene-like"
                  className={cn(scrollClass, 'mt-0 flex min-h-0 flex-1 flex-col')}
                >
                  {sceneLikeBody()}
                </TabsContent>
              ) : null}
            </Tabs>
            {railTab !== 'generate-options' ? (
              <div className="shrink-0 border-t border-slate-900/[0.08] px-2 py-2 dark:border-white/[0.08]">
                <AppCoreNavList
                  collapsed={false}
                  tooltipSide="left"
                  chatRightRailOrder
                  excludeKeys={[
                    'top-up',
                    'credits-market',
                    'store',
                    'chat',
                    'notifications',
                    'live2d',
                    'profile',
                    'settings',
                    'contact-support',
                    'report-issue',
                  ]}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
