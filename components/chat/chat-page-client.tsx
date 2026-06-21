'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { BookOpenText, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getStoredApplyNotebookWrites,
  subscribeApplyNotebookWrites,
} from '@/lib/utils/notebook-write-preference';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useNotificationStore } from '@/lib/store/notifications';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { ChatMessageMetadata, CourseChatGroupMeta } from '@/lib/types/chat';
import { listAgentsForCourse, type CourseAgentListItem } from '@/lib/utils/course-agents';
import type { Scene } from '@/lib/types/stage';
import type { SettingsSection } from '@/lib/types/settings';
import {
  courseChatGroupTargetId,
  loadContactMessages,
  loadCourseChatGroupMeta,
  saveContactMessages,
} from '@/lib/utils/contact-chat-storage';
import { listStagesByCourse, loadStageData } from '@/lib/utils/stage-storage';
import {
  cancelAgentTask,
  listAgentTasksByCourse,
  listChildTasks,
  listTasksForContact,
  updateAgentTask,
} from '@/lib/utils/agent-task-storage';
import {
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
  createNotebookHref,
  resolveCourseOrchestratorAvatar,
} from '@/lib/constants/course-chat';
import type { NotebookGenerationProgress } from '@/lib/create/run-notebook-generation-task';
import {
  buildStudyCompanionNotification,
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  STUDY_MEMORY_UPDATED_EVENT,
  type NotebookWorkingMemory,
} from '@/lib/learning/study-memory';
import { PdfPageSelectionDialog } from '@/components/create/pdf-page-selection-dialog';
import {
  OrchestratorNotebookProgressPanel,
  OrchestratorRemoteTaskBanner,
} from '@/components/chat/orchestrator-notebook-progress';
import {
  buildChatMessage,
  hydrateAgentThread,
  hydrateNotebookThread,
  isMockAgentMessage,
  isMockTaskLike,
  revokeAgentAttachmentUrls,
  revokeNotebookAttachmentUrls,
  stripAttachmentUrlsFromAgentMessages,
  stripAttachmentUrlsFromNotebookMessages,
} from '@/components/chat/chat-message-utils';
import {
  NOTEBOOK_CHAT_HANDOFF_QUERY_PARAM,
  takeNotebookChatHandoff,
} from '@/components/chat/chat-notebook-handoff';
import { OrchestratorChildTaskDialog } from '@/components/chat/orchestrator-child-task-dialog';
import { ChatComposer } from '@/components/chat/chat-composer';
import { AgentMessageThread, NotebookMessageThread } from '@/components/chat/chat-message-threads';
import { ChatPageHeader, NoCourseChatState } from '@/components/chat/chat-page-header';
import { useInlineLessonDeckActions } from '@/components/chat/use-inline-lesson-deck-actions';
import { useNotebookChatActions } from '@/components/chat/use-notebook-chat-actions';
import { useAgentChatActions } from '@/components/chat/use-agent-chat-actions';
import { useChatAttachments } from '@/components/chat/use-chat-attachments';
import { useChatMessageActions } from '@/components/chat/use-chat-message-actions';
import {
  COURSE_CHAT_GROUPS_UPDATED_EVENT,
  makeNotebookParticipant,
  makeOrchestratorParticipant,
  refreshGroupParticipants,
  updateGroupActivity,
} from '@/components/chat/course-chat-groups';
import type {
  NotebookChatMessage,
  OrchestratorChildTaskView,
  OrchestratorComposerMode,
  OrchestratorViewMode,
} from '@/components/chat/chat-page-types';

const ORCHESTRATOR_REMOTE_TASK_POLL_INTERVAL_MS = 5000;
const CONTACT_TASK_HINT_POLL_INTERVAL_MS = 5000;
const ORCHESTRATOR_CHILD_TASK_POLL_INTERVAL_MS = 3000;
const chatMessageScrollClassName = cn(
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8',
  '[scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(15,23,42,0.16)_transparent]',
  'dark:[scrollbar-color:rgba(255,255,255,0.18)_transparent]',
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/10',
  'hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/20',
  'dark:[&::-webkit-scrollbar-thumb]:bg-white/15 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/25',
);

function canPollInCurrentTab(): boolean {
  return document.visibilityState === 'visible';
}

function isNotebookCreationTaskLike(task: { title: string; detail?: string; notebookId?: string }) {
  const haystack = `${task.title} ${task.detail || ''}`;
  return (
    Boolean(task.notebookId?.trim()) ||
    /(创建笔记本|生成笔记本|笔记本正在生成|创建完成)/.test(haystack)
  );
}

function compactStatusLine(input: string | undefined, maxLength = 180): string | null {
  const text = input?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function appendWorkingMemoryLine(lines: string[], label: string, value: string | undefined) {
  const text = compactStatusLine(value);
  if (text) lines.push(`- ${label}：${text}`);
}

function buildRecentStatusSummaryQuickInput(args: {
  notebookId: string | null;
  notebookName?: string | null;
}): string | null {
  if (!args.notebookId) return null;

  let workingMemory: NotebookWorkingMemory | undefined;
  let weakPoints: string[] = [];
  try {
    const profile = loadStudyMemory(getLocalStudyMemoryUserId(), args.notebookId);
    workingMemory = profile.workingMemory;
    weakPoints = profile.weakPoints
      .filter((item) => item.status === 'open')
      .slice(0, 3)
      .map((item) => item.title)
      .filter(Boolean);
  } catch {
    workingMemory = undefined;
    weakPoints = [];
  }

  const target = args.notebookName ? `《${args.notebookName}》` : '这个笔记本';
  const lines = [
    `请帮我总结一下我在${target}里的最近学习状态。`,
    '请用三小段回答：已经比较稳的地方、还卡住或容易错的地方、下一步最该做什么。',
  ];

  const clueLines: string[] = [];
  if (workingMemory) {
    appendWorkingMemoryLine(clueLines, '当前任务', workingMemory.currentTask);
    appendWorkingMemoryLine(clueLines, '卡点', workingMemory.stuckPoint);
    appendWorkingMemoryLine(clueLines, '掌握信号', workingMemory.masteredSignal);
    appendWorkingMemoryLine(clueLines, '下一步', workingMemory.nextTeachingMove);
    appendWorkingMemoryLine(clueLines, '短期摘要', workingMemory.summary);
  }
  if (weakPoints.length > 0) {
    clueLines.push(`- 待复习弱点：${weakPoints.map((point) => `「${point}」`).join('、')}`);
  }

  if (clueLines.length > 0) {
    lines.push('', '我这边记录到的线索：', ...clueLines);
  } else {
    lines.push('如果最近状态线索不足，请先根据当前对话和笔记本内容判断，并告诉我还需要补充什么。');
  }

  return lines.join('\n');
}

export function ChatPageClient() {
  const router = useRouter();
  const openSettings = (section?: SettingsSection) => {
    if (section) {
      router.push(`/settings?section=${encodeURIComponent(section)}`);
    } else {
      router.push('/settings');
    }
  };
  const searchParams = useSearchParams();
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const courseAvatarUrlStored = useCurrentCourseStore((s) => s.avatarUrl);
  const enqueueCompanionBanner = useNotificationStore((s) => s.enqueueBanner);
  const orchestratorAvatar = useMemo(
    () => resolveCourseOrchestratorAvatar(courseId, courseAvatarUrlStored),
    [courseId, courseAvatarUrlStored],
  );
  const notebookId = searchParams.get('notebook');
  const agentId = searchParams.get('agent');
  const chatView = searchParams.get('view');
  const groupId = searchParams.get('group');
  const sessionId = searchParams.get('session')?.trim() || '';

  const nickname = useUserProfileStore((s) => s.nickname);
  const userAvatar = useUserProfileStore((s) => s.avatar);

  const [stageMeta, setStageMeta] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [notebookScenes, setNotebookScenes] = useState<Scene[]>([]);
  const [notebookScenesLoading, setNotebookScenesLoading] = useState(false);
  const [agents, setAgents] = useState<CourseAgentListItem[]>([]);
  const [nbThread, setNbThread] = useState<NotebookChatMessage[]>([]);
  const [nbThreadHydrated, setNbThreadHydrated] = useState(false);
  const [agThread, setAgThread] = useState<UIMessage<ChatMessageMetadata>[]>([]);
  const [agThreadHydrated, setAgThreadHydrated] = useState(false);
  const [currentGroupMeta, setCurrentGroupMeta] = useState<CourseChatGroupMeta | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notebookPendingAction, setNotebookPendingAction] = useState<'chat' | 'import' | null>(
    null,
  );
  const [applyNotebookWrites, setApplyNotebookWrites] = useState(true);
  const [, refreshStudyMemorySnapshot] = useState(0);
  useEffect(() => {
    setApplyNotebookWrites(getStoredApplyNotebookWrites());
    return subscribeApplyNotebookWrites(() => {
      setApplyNotebookWrites(getStoredApplyNotebookWrites());
    });
  }, []);
  const agThreadRef = useRef(agThread);
  const nbThreadRef = useRef(nbThread);
  const nbThreadOwnerIdRef = useRef<string | null>(null);
  agThreadRef.current = agThread;
  nbThreadRef.current = nbThread;
  const [pickContactDone, setPickContactDone] = useState(false);
  const [contactTaskHint, setContactTaskHint] = useState<string | null>(null);
  const [activeOrchestratorTaskId, setActiveOrchestratorTaskId] = useState<string | null>(null);
  const [orchestratorChildTasks, setOrchestratorChildTasks] = useState<OrchestratorChildTaskView[]>(
    [],
  );
  const [selectedChildTaskId, setSelectedChildTaskId] = useState<string | null>(null);
  /** 总控创建笔记本：与右侧「进行中」任务同步的进度文案 */
  const [orchestratorPipelineProgress, setOrchestratorPipelineProgress] =
    useState<NotebookGenerationProgress | null>(null);
  /** 本地进度丢失时，与右侧「进行中」同步的总控创建任务（轮询 API） */
  const [orchestratorRemoteTask, setOrchestratorRemoteTask] = useState<{
    detail: string;
  } | null>(null);
  const [orchestratorTaskCancelling, setOrchestratorTaskCancelling] = useState(false);
  const [orchestratorComposerMode, setOrchestratorComposerMode] =
    useState<OrchestratorComposerMode>('send-message');
  const [orchestratorPdfSelectionDialogOpen, setOrchestratorPdfSelectionDialogOpen] =
    useState(false);
  const [orchestratorPdfSelectionFile, setOrchestratorPdfSelectionFile] = useState<File | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlHeight = html.style.height;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyHeight = body.style.height;
    const previousBodyPosition = body.style.position;
    const previousBodyInset = body.style.inset;
    const previousBodyWidth = body.style.width;
    window.scrollTo(0, 0);
    html.style.overflow = 'hidden';
    html.style.height = '100dvh';
    body.style.overflow = 'hidden';
    body.style.height = '100dvh';
    body.style.position = 'fixed';
    body.style.inset = '0';
    body.style.width = '100%';
    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.height = previousHtmlHeight;
      body.style.overflow = previousBodyOverflow;
      body.style.height = previousBodyHeight;
      body.style.position = previousBodyPosition;
      body.style.inset = previousBodyInset;
      body.style.width = previousBodyWidth;
    };
  }, []);

  useEffect(() => {
    const comp = searchParams.get('composer');
    if (agentId !== COURSE_ORCHESTRATOR_ID) return;
    if (comp === 'generate-notebook') {
      router.replace(createNotebookHref(courseId), { scroll: false });
      return;
    }
    if (comp !== 'send-message') return;
    setOrchestratorComposerMode(comp as OrchestratorComposerMode);
  }, [searchParams, agentId, courseId, router]);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** 总控「创建笔记本」任务 id，用于轮询检测完成并补发气泡 */
  const trackedOrchestratorCreateTaskIdRef = useRef<string | null>(null);
  const orchestratorCompletionAnnouncedRef = useRef<string | null>(null);
  const ORCHESTRATOR_TASK_STALE_MS = 20 * 60 * 1000;

  const effectiveAgentId = groupId ? COURSE_ORCHESTRATOR_ID : agentId;
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === effectiveAgentId) ?? null,
    [agents, effectiveAgentId],
  );
  const selectedChildTask = useMemo(
    () => orchestratorChildTasks.find((t) => t.id === selectedChildTaskId) || null,
    [orchestratorChildTasks, selectedChildTaskId],
  );
  const isCourseOrchestrator = effectiveAgentId === COURSE_ORCHESTRATOR_ID;
  const orchestratorViewMode: OrchestratorViewMode =
    isCourseOrchestrator && (chatView === 'group' || groupId) ? 'group' : 'private';
  const agentConversationTargetId =
    groupId && isCourseOrchestrator
      ? courseChatGroupTargetId(groupId)
      : isCourseOrchestrator && agentId
        ? orchestratorViewMode === 'group'
          ? `${agentId}::group`
          : `${agentId}::private`
        : agentId;
  const agentConversationStorageTargetId =
    agentConversationTargetId && sessionId && !groupId
      ? `${agentConversationTargetId}::session:${sessionId}`
      : agentConversationTargetId;
  const notebookConversationStorageTargetId =
    notebookId && sessionId ? `${notebookId}::session:${sessionId}` : notebookId;

  const mode = notebookId
    ? ('notebook' as const)
    : agentId || groupId
      ? ('agent' as const)
      : ('none' as const);
  const supportsComposerAttachments = mode === 'notebook';
  const recentStatusQuickInput = buildRecentStatusSummaryQuickInput({
    notebookId,
    notebookName: stageMeta?.name,
  });

  useEffect(() => {
    if (!notebookId) return;
    const onMemoryUpdated = (event: Event) => {
      const stageId = (event as CustomEvent<{ stageId?: string }>).detail?.stageId;
      if (stageId && stageId !== notebookId) return;
      refreshStudyMemorySnapshot((revision) => revision + 1);
    };
    window.addEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
    return () =>
      window.removeEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
  }, [notebookId]);

  const {
    fileInputRef,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    isComposerDragging,
    onPickAttachments,
    openAttachmentPicker,
    pendingAttachments,
    removePendingAttachment,
    setPendingAttachments,
  } = useChatAttachments({
    supportsComposerAttachments,
    sending,
  });

  const handleCancelOrchestratorTask = useCallback(async () => {
    const taskId = activeOrchestratorTaskId || trackedOrchestratorCreateTaskIdRef.current;
    if (!taskId || orchestratorTaskCancelling) return;

    setOrchestratorTaskCancelling(true);
    try {
      abortRef.current?.abort();
      await cancelAgentTask(taskId, '任务已取消。可重新发起创建或继续修改需求。');
      trackedOrchestratorCreateTaskIdRef.current = null;
      orchestratorCompletionAnnouncedRef.current = taskId;
      setActiveOrchestratorTaskId(null);
      setOrchestratorPipelineProgress(null);
      setOrchestratorRemoteTask(null);
      setSending(false);
      setContactTaskHint(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '取消任务失败';
      setAgThread((prev) => [
        ...prev,
        buildChatMessage(`取消任务失败：${message}`, {
          senderName: '系统',
          originalRole: 'agent',
        }),
      ]);
    } finally {
      setOrchestratorTaskCancelling(false);
    }
  }, [activeOrchestratorTaskId, orchestratorTaskCancelling]);

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    (async () => {
      const ags = await listAgentsForCourse(courseId);
      if (!alive) return;
      setAgents([
        {
          id: COURSE_ORCHESTRATOR_ID,
          name: COURSE_ORCHESTRATOR_NAME,
          avatar: orchestratorAvatar,
          role: 'teacher',
          persona:
            '你是课程总控老师。先判断用户的问题应该由现有笔记回答、补充笔记，还是协同多个笔记本完成；在直接回答时，要像耐心的课程导师一样讲清概念、步骤、例子和易错点。',
          color: '#7c3aed',
          priority: 100,
          isGenerated: false,
        },
        ...ags,
      ]);
    })();
    return () => {
      alive = false;
    };
  }, [courseId, orchestratorAvatar]);

  useEffect(() => {
    const nb = searchParams.get('notebook');
    const ag = searchParams.get('agent');
    const grp = searchParams.get('group');
    if (nb && (ag || grp)) {
      router.replace(`/chat?notebook=${encodeURIComponent(nb)}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (agentId !== COURSE_ORCHESTRATOR_ID || chatView !== 'group' || groupId) return;
    router.replace(`/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`, {
      scroll: false,
    });
  }, [agentId, chatView, groupId, router]);

  useEffect(() => {
    if (!courseId) {
      setPickContactDone(true);
      return;
    }
    const nb = searchParams.get('notebook');
    const ag = searchParams.get('agent');
    const grp = searchParams.get('group');
    if (nb || ag || grp) {
      setPickContactDone(true);
      return;
    }
    let cancelled = false;
    setPickContactDone(false);
    (async () => {
      await listStagesByCourse(courseId);
      await listAgentsForCourse(courseId);
      if (cancelled) return;
      const next = new URLSearchParams();
      next.set('agent', COURSE_ORCHESTRATOR_ID);
      const v = searchParams.get('view');
      if (v) next.set('view', v);
      const comp = searchParams.get('composer');
      if (comp === 'send-message') next.set('composer', comp);
      router.replace(`/chat?${next.toString()}`);
      setPickContactDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, router, searchParams]);

  useEffect(() => {
    if (!courseId || !agentId) return;
    if (agents.length === 0) return;
    if (!agents.some((a) => a.id === agentId)) {
      router.replace('/chat');
    }
  }, [courseId, agentId, agents, router]);

  useEffect(() => {
    if (!courseId || !groupId) {
      setCurrentGroupMeta(null);
      return;
    }
    let alive = true;
    void (async () => {
      const meta = await loadCourseChatGroupMeta(courseId, groupId);
      if (!alive) return;
      if (!meta) {
        setCurrentGroupMeta(null);
        return;
      }
      const groupParticipantIds = new Set(meta.participants.map((participant) => participant.id));
      const stages = await listStagesByCourse(courseId);
      if (!alive) return;
      const freshParticipants = [
        ...(groupParticipantIds.has(COURSE_ORCHESTRATOR_ID)
          ? [
              makeOrchestratorParticipant({
                avatarUrl: orchestratorAvatar,
                joinedAt: meta.createdAt,
              }),
            ]
          : []),
        ...stages
          .filter((stage) => groupParticipantIds.has(stage.id))
          .map((stage) => makeNotebookParticipant(stage, meta.createdAt)),
      ];
      setCurrentGroupMeta(refreshGroupParticipants(meta, freshParticipants));
    })();
    return () => {
      alive = false;
    };
  }, [courseId, groupId, orchestratorAvatar]);

  useEffect(() => {
    if (!notebookId) {
      setNotebookScenes([]);
      setNotebookScenesLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    // 切换笔记本时先清空，避免旧线程被保存到新 notebook 会话
    nbThreadOwnerIdRef.current = null;
    setNbThread([]);
    setNbThreadHydrated(false);
  }, [notebookConversationStorageTargetId]);

  useEffect(() => {
    if (!notebookId || !courseId) {
      setStageMeta(null);
      return;
    }
    let alive = true;
    listStagesByCourse(courseId).then((stages) => {
      if (!alive) return;
      const st = stages.find((s) => s.id === notebookId);
      if (!st || st.courseId !== courseId) {
        setStageMeta(null);
        router.replace('/chat');
        return;
      }
      setStageMeta({ id: st.id, name: st.name, avatarUrl: st.avatarUrl });
    });
    return () => {
      alive = false;
    };
  }, [notebookId, courseId, router]);

  const reloadNotebookScenes = useCallback(async () => {
    if (!notebookId) {
      setNotebookScenes([]);
      return;
    }
    setNotebookScenesLoading(true);
    try {
      const data = await loadStageData(notebookId);
      const list = data?.scenes?.slice().sort((a, b) => a.order - b.order) ?? [];
      setNotebookScenes(list);
    } finally {
      setNotebookScenesLoading(false);
    }
  }, [notebookId]);

  const {
    generateInlineLessonDeck,
    lessonGeneratingAt,
    lessonSavingAt,
    saveInlineLessonDeckToNotebook,
  } = useInlineLessonDeckActions({
    courseId,
    notebookId,
    nbThreadRef,
    setNbThread,
    reloadNotebookScenes,
  });

  useEffect(() => {
    void reloadNotebookScenes();
  }, [reloadNotebookScenes]);

  useEffect(() => {
    if (!notebookId || !notebookConversationStorageTargetId) {
      nbThreadOwnerIdRef.current = null;
      revokeNotebookAttachmentUrls(nbThreadRef.current);
      setNbThread([]);
      setNbThreadHydrated(false);
      return;
    }
    if (courseId && stageMeta?.id !== notebookId) {
      nbThreadOwnerIdRef.current = null;
      setNbThreadHydrated(false);
      return;
    }
    let cancelled = false;
    loadContactMessages<NotebookChatMessage>(
      courseId,
      'notebook',
      notebookConversationStorageTargetId,
      {
        ignoreCourseId: true,
        expectedTargetName: stageMeta?.name,
      },
    ).then(async (messages) => {
      const hydrated = await hydrateNotebookThread(messages);
      if (cancelled) {
        revokeNotebookAttachmentUrls(hydrated);
        return;
      }
      nbThreadOwnerIdRef.current = notebookConversationStorageTargetId;
      setNbThread(hydrated);
      setNbThreadHydrated(true);
    });
    return () => {
      cancelled = true;
      revokeNotebookAttachmentUrls(nbThreadRef.current);
    };
  }, [notebookId, notebookConversationStorageTargetId, courseId, stageMeta?.id, stageMeta?.name]);

  useEffect(() => {
    if (!notebookId || !notebookConversationStorageTargetId || !courseId || !nbThreadHydrated) {
      return;
    }
    if (nbThreadOwnerIdRef.current !== notebookConversationStorageTargetId) return;
    let cancelled = false;
    void (async () => {
      try {
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebookConversationStorageTargetId,
          targetName: stageMeta?.name || '笔记本',
          messages: stripAttachmentUrlsFromNotebookMessages(nbThread),
        });
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent('synatra-notebook-chat-updated', {
            detail: { courseId, notebookId },
          }),
        );
      } catch {
        /* 无 DB 或未登录时保存失败，侧栏仍依赖初次 load / visibility 刷新 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    notebookId,
    notebookConversationStorageTargetId,
    courseId,
    stageMeta?.name,
    nbThread,
    nbThreadHydrated,
  ]);

  useEffect(() => {
    if (!agentConversationStorageTargetId || !courseId) {
      revokeAgentAttachmentUrls(agThreadRef.current);
      setAgThread([]);
      setAgThreadHydrated(false);
      return;
    }
    let cancelled = false;
    setAgThreadHydrated(false);
    setAgThread([]);
    loadContactMessages<UIMessage<ChatMessageMetadata>>(
      courseId,
      'agent',
      agentConversationStorageTargetId,
    ).then(async (messages) => {
      const filtered = messages.filter((m) => !isMockAgentMessage(m));
      const hydrated = await hydrateAgentThread(filtered);
      if (cancelled) {
        revokeAgentAttachmentUrls(hydrated);
        return;
      }
      setAgThread(hydrated);
      setAgThreadHydrated(true);
    });
    return () => {
      cancelled = true;
      revokeAgentAttachmentUrls(agThreadRef.current);
    };
  }, [agentConversationStorageTargetId, courseId]);

  useEffect(() => {
    if (!courseId || !groupId || !agentConversationStorageTargetId) return;
    let cancelled = false;
    const reloadGroupThread = async () => {
      const messages = await loadContactMessages<UIMessage<ChatMessageMetadata>>(
        courseId,
        'agent',
        agentConversationStorageTargetId,
      );
      const hydrated = await hydrateAgentThread(messages.filter((m) => !isMockAgentMessage(m)));
      if (cancelled) {
        revokeAgentAttachmentUrls(hydrated);
        return;
      }
      revokeAgentAttachmentUrls(agThreadRef.current);
      setAgThread(hydrated);
      setAgThreadHydrated(true);
      const meta = await loadCourseChatGroupMeta(courseId, groupId);
      if (!cancelled && meta) setCurrentGroupMeta(meta);
    };
    const onGroupUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ courseId?: string; groupId?: string }>).detail;
      if (detail?.courseId !== courseId || detail?.groupId !== groupId) return;
      void reloadGroupThread();
    };
    window.addEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onGroupUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(COURSE_CHAT_GROUPS_UPDATED_EVENT, onGroupUpdated);
    };
  }, [agentConversationStorageTargetId, courseId, groupId]);

  useEffect(() => {
    if (!agentConversationStorageTargetId || !courseId || !selectedAgent || !agThreadHydrated) {
      return;
    }
    const groupMeta =
      groupId && currentGroupMeta ? updateGroupActivity(currentGroupMeta, agThread) : undefined;
    void saveContactMessages<UIMessage<ChatMessageMetadata>>({
      courseId,
      kind: 'agent',
      targetId: agentConversationStorageTargetId,
      targetName: groupMeta
        ? groupMeta.name
        : isCourseOrchestrator && orchestratorViewMode === 'group'
          ? `${selectedAgent.name} · 群聊`
          : selectedAgent.name,
      meta: groupMeta,
      messages: stripAttachmentUrlsFromAgentMessages(
        agThread.filter((m) => !isMockAgentMessage(m)),
      ),
    }).then(() => {
      if (!groupMeta || !courseId) return;
      window.dispatchEvent(
        new CustomEvent(COURSE_CHAT_GROUPS_UPDATED_EVENT, {
          detail: { courseId, groupId: groupMeta.groupId },
        }),
      );
    });
  }, [
    agentConversationStorageTargetId,
    courseId,
    selectedAgent,
    agThread,
    agThreadHydrated,
    currentGroupMeta,
    groupId,
    isCourseOrchestrator,
    orchestratorViewMode,
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [nbThread, agThread, sending, orchestratorRemoteTask?.detail]);

  useEffect(() => {
    return () => {
      for (const m of agThreadRef.current) {
        m.metadata?.attachments?.forEach((a) => {
          if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
        });
      }
      for (const m of nbThreadRef.current) {
        if (m.role === 'user' && m.attachments) {
          m.attachments.forEach((a) => {
            if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
          });
        }
      }
    };
  }, []);

  /** 与右侧栏「进行中」对齐：轮询任务列表，显示远程进度 + 检测完成后补发完成/失败气泡 */
  useEffect(() => {
    if (!courseId?.trim() || !isCourseOrchestrator || orchestratorViewMode !== 'private') {
      setOrchestratorRemoteTask(null);
      return;
    }
    let alive = true;
    const sync = async () => {
      try {
        const allTasks = await listAgentTasksByCourse(courseId.trim());
        if (!alive) return;

        const createActive = allTasks.find(
          (t) =>
            t.contactKind === 'agent' &&
            t.contactId === COURSE_ORCHESTRATOR_ID &&
            isNotebookCreationTaskLike(t) &&
            (t.status === 'running' || t.status === 'waiting'),
        );

        if (
          createActive &&
          !orchestratorPipelineProgress &&
          !sending &&
          Date.now() - createActive.updatedAt > ORCHESTRATOR_TASK_STALE_MS
        ) {
          await updateAgentTask(createActive.id, {
            status: 'failed',
            detail: '任务已超时中断，可能是浏览器或电脑在生成过程中关闭。请重新发起。',
          });
          if (!alive) return;
          if (trackedOrchestratorCreateTaskIdRef.current === createActive.id) {
            trackedOrchestratorCreateTaskIdRef.current = null;
          }
          setOrchestratorRemoteTask(null);
          return;
        }

        if (createActive) {
          trackedOrchestratorCreateTaskIdRef.current = createActive.id;
        }

        if (!orchestratorPipelineProgress) {
          if (createActive && (createActive.detail?.trim() || createActive.notebookId?.trim())) {
            setOrchestratorRemoteTask({
              detail:
                createActive.detail?.trim() ||
                '笔记本正在生成中，请稍候。进度与右侧「进行中」同步。',
            });
          } else {
            setOrchestratorRemoteTask(null);
          }
        } else {
          setOrchestratorRemoteTask(null);
        }

        const tid = trackedOrchestratorCreateTaskIdRef.current;
        if (
          tid &&
          orchestratorCompletionAnnouncedRef.current !== tid &&
          !orchestratorPipelineProgress
        ) {
          const task = allTasks.find((t) => t.id === tid);
          if (!task) return;
          const isCreateNotebookTask =
            task.contactId === COURSE_ORCHESTRATOR_ID && task.title.startsWith('总控任务');

          if (
            task.status === 'done' &&
            isCreateNotebookTask &&
            (task.detail?.includes('创建完成') || Boolean(task.notebookId?.trim()))
          ) {
            const m = task.detail?.match(/创建完成：(.+)/);
            const name = m?.[1]?.trim() || '新笔记本';
            const nid = task.notebookId?.trim();
            orchestratorCompletionAnnouncedRef.current = tid;
            trackedOrchestratorCreateTaskIdRef.current = null;
            setOrchestratorRemoteTask(null);
            if (courseId && nid) {
              window.dispatchEvent(
                new CustomEvent('synatra-notebook-list-updated', {
                  detail: { courseId, notebookId: nid },
                }),
              );
            }
            enqueueCompanionBanner(
              buildStudyCompanionNotification({
                id: `notebook-ready:${nid || tid}`,
                sourceKind: 'notebook_ready',
                title: '笔记本生成好了',
                body: `笔记本「${name}」已创建完成。`,
                amountLabel: '生成好了',
                sourceLabel: '笔记本生成',
                details: [{ key: 'notebook', label: '笔记本', value: name }],
              }),
            );
            setAgThread((prev) => [
              ...prev,
              {
                ...buildChatMessage(
                  `笔记本「${name}」已创建完成。现在可以直接打开它开始提问、查看内容或听讲。`,
                  {
                    senderName: COURSE_ORCHESTRATOR_NAME,
                    senderAvatar: orchestratorAvatar,
                    originalRole: 'teacher',
                    actions: nid
                      ? [
                          {
                            id: `open-notebook:${nid}`,
                            label: '打开笔记本',
                            variant: 'highlight',
                          },
                        ]
                      : [],
                  },
                ),
                id: `orch-create-done-${tid}`,
              },
            ]);
          } else if (task.status === 'failed' && isCreateNotebookTask) {
            orchestratorCompletionAnnouncedRef.current = tid;
            trackedOrchestratorCreateTaskIdRef.current = null;
            setOrchestratorRemoteTask(null);
            setAgThread((prev) => [
              ...prev,
              {
                ...buildChatMessage(`笔记本生成失败：${task.detail?.trim() || '请重试'}`, {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                }),
                id: `orch-create-failed-${tid}`,
              },
            ]);
          }
        }
      } catch {
        if (alive) setOrchestratorRemoteTask(null);
      }
    };
    const poll = () => {
      if (canPollInCurrentTab()) void sync();
    };
    void sync();
    const timer = window.setInterval(poll, ORCHESTRATOR_REMOTE_TASK_POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [
    courseId,
    enqueueCompanionBanner,
    isCourseOrchestrator,
    orchestratorAvatar,
    orchestratorViewMode,
    orchestratorPipelineProgress,
    sending,
    ORCHESTRATOR_TASK_STALE_MS,
  ]);

  useEffect(() => {
    setPendingAttachments([]);
    setActiveOrchestratorTaskId(null);
    setSelectedChildTaskId(null);
  }, [notebookId, agentId, groupId, setPendingAttachments]);

  useEffect(() => {
    if (!agentId) {
      setContactTaskHint(null);
      return;
    }
    let alive = true;
    const sync = async () => {
      const tasks = await listTasksForContact('agent', agentId);
      const realTasks = tasks.filter((t) => !isMockTaskLike(t));
      if (!alive) return;
      const active = realTasks.find((t) => t.status === 'running' || t.status === 'waiting');
      if (active && Date.now() - active.updatedAt > ORCHESTRATOR_TASK_STALE_MS) {
        await updateAgentTask(active.id, {
          status: 'failed',
          detail: '任务已超时中断，可能是浏览器或电脑在处理中关闭。请重新发起。',
        });
        if (!alive) return;
        setContactTaskHint(null);
        return;
      }
      setContactTaskHint(active?.detail || (active ? active.title : null));
    };
    const poll = () => {
      if (canPollInCurrentTab()) void sync().catch(() => undefined);
    };
    void sync().catch(() => undefined);
    const timer = window.setInterval(poll, CONTACT_TASK_HINT_POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [agentId, ORCHESTRATOR_TASK_STALE_MS]);

  useEffect(() => {
    if (!courseId || !isCourseOrchestrator || orchestratorViewMode !== 'private') return;
    let cancelled = false;
    void (async () => {
      try {
        const tasks = await listTasksForContact('agent', COURSE_ORCHESTRATOR_ID);
        const staleMockTasks = tasks.filter(
          (t) => isMockTaskLike(t) && (t.status === 'running' || t.status === 'waiting'),
        );
        for (const t of staleMockTasks) {
          if (cancelled) return;
          await updateAgentTask(t.id, {
            status: 'done',
            detail: '已清理历史 mock 任务',
          });
        }
      } catch {
        /* ignore cleanup errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, isCourseOrchestrator, orchestratorViewMode]);

  useEffect(() => {
    if (!activeOrchestratorTaskId || !isCourseOrchestrator) {
      setOrchestratorChildTasks([]);
      return;
    }
    let alive = true;
    const sync = async () => {
      const rows = await listChildTasks(activeOrchestratorTaskId);
      if (!alive) return;
      setOrchestratorChildTasks(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          detail: r.detail,
          status: r.status,
          contactId: r.contactId,
          updatedAt: r.updatedAt,
          lastEnvelope: r.lastEnvelope,
        })),
      );
    };
    const poll = () => {
      if (canPollInCurrentTab()) void sync().catch(() => undefined);
    };
    void sync().catch(() => undefined);
    const timer = window.setInterval(poll, ORCHESTRATOR_CHILD_TASK_POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [activeOrchestratorTaskId, isCourseOrchestrator]);

  useEffect(() => {
    if (!selectedChildTaskId) return;
    if (!orchestratorChildTasks.some((t) => t.id === selectedChildTaskId)) {
      setSelectedChildTaskId(null);
    }
  }, [selectedChildTaskId, orchestratorChildTasks]);

  const { copyMessageText, deleteAgentMessageById, deleteNotebookMessageAt } =
    useChatMessageActions({
      setAgThread,
      setNbThread,
    });

  const replaceWithGroupChat = useCallback(
    (nextGroupId: string) => {
      router.replace(
        `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}&view=group&group=${encodeURIComponent(nextGroupId)}`,
        { scroll: false },
      );
    },
    [router],
  );

  const replaceWithNotebookChat = useCallback(
    (nextNotebookId: string, handoffId?: string | null) => {
      const next = new URLSearchParams();
      next.set('notebook', nextNotebookId);
      if (handoffId) next.set(NOTEBOOK_CHAT_HANDOFF_QUERY_PARAM, handoffId);
      router.replace(`/chat?${next.toString()}`, { scroll: false });
    },
    [router],
  );

  const { handleImportNotebookProblemBank, handleSendNotebook, runNotebookSubtask } =
    useNotebookChatActions({
      courseId,
      notebookId,
      draft,
      pendingAttachments,
      sending,
      nbThread,
      notebookName: stageMeta?.name,
      notebookAvatarUrl: stageMeta?.avatarUrl,
      applyNotebookWrites,
      reloadNotebookScenes,
      setNbThread,
      setDraft,
      setSending,
      setNotebookPendingAction,
      setPendingAttachments,
    });

  const notebookHandoffId = searchParams.get(NOTEBOOK_CHAT_HANDOFF_QUERY_PARAM);
  const handledNotebookHandoffIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!notebookHandoffId || !notebookId || !courseId || !nbThreadHydrated || sending) return;
    if (handledNotebookHandoffIdsRef.current.has(notebookHandoffId)) return;
    handledNotebookHandoffIdsRef.current.add(notebookHandoffId);

    const next = new URLSearchParams(searchParams.toString());
    next.delete(NOTEBOOK_CHAT_HANDOFF_QUERY_PARAM);
    router.replace(`/chat?${next.toString()}`, { scroll: false });

    const handoff = takeNotebookChatHandoff(notebookHandoffId);
    if (
      !handoff ||
      handoff.courseId !== courseId ||
      handoff.notebookId !== notebookId ||
      !handoff.question.trim()
    ) {
      return;
    }
    void handleSendNotebook({ text: handoff.question });
  }, [
    courseId,
    handleSendNotebook,
    nbThreadHydrated,
    notebookHandoffId,
    notebookId,
    router,
    searchParams,
    sending,
  ]);

  const handleSendAgent = useAgentChatActions({
    agentId,
    selectedAgent,
    sending,
    draft,
    pendingAttachments,
    orchestratorViewMode,
    orchestratorComposerMode,
    groupId,
    currentGroupMeta,
    setCurrentGroupMeta,
    replaceWithGroupChat,
    replaceWithNotebookChat,
    setOrchestratorPdfSelectionFile,
    setOrchestratorPdfSelectionDialogOpen,
    abortRef,
    nickname,
    userAvatar,
    agThread,
    setAgThread,
    setDraft,
    setPendingAttachments,
    setSending,
    courseId,
    courseName,
    trackedOrchestratorCreateTaskIdRef,
    setActiveOrchestratorTaskId,
    setOrchestratorPipelineProgress,
    orchestratorAvatar,
    runNotebookSubtask,
  });

  const hasStreamingNotebookMessage = nbThread.some(
    (message) => message.role === 'assistant' && (message.streaming || message.statusText),
  );
  const hasStreamingAgentMessage = agThread.some((message) => message.metadata?.streaming);
  const shouldShowSendingStatus =
    sending &&
    (mode === 'notebook'
      ? notebookPendingAction === 'import' || !hasStreamingNotebookMessage
      : mode === 'agent'
        ? !hasStreamingAgentMessage
        : true);

  const titleLine = useMemo(() => {
    if (!courseId) return '聊天';
    if (mode === 'notebook' && stageMeta) return stageMeta.name;
    if (mode === 'agent' && selectedAgent) {
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID && orchestratorViewMode === 'group') {
        return currentGroupMeta?.name || '课程讨论群';
      }
      return selectedAgent.name;
    }
    return '选择联系人';
  }, [courseId, currentGroupMeta?.name, mode, stageMeta, selectedAgent, orchestratorViewMode]);
  const notebookEmptyPrompts = useMemo(
    () => [
      {
        label: '总结我的最近学习状态',
        text: recentStatusQuickInput || '请帮我总结一下我在这个笔记本里的最近学习状态。',
      },
      { label: '帮我总结这个笔记本的核心概念', text: '帮我总结这个笔记本的核心概念' },
      { label: '根据 slides 出 3 道练习题', text: '根据 slides 出 3 道练习题' },
      { label: '我想复习最容易混淆的地方', text: '我想复习最容易混淆的地方' },
    ],
    [recentStatusQuickInput],
  );

  if (!courseId) {
    return <NoCourseChatState />;
  }

  return (
    <div
      data-chat-page-root
      className={cn(
        'flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
      )}
    >
      <ChatPageHeader
        titleLine={titleLine}
        mode={mode}
        groupMeta={
          isCourseOrchestrator && orchestratorViewMode === 'group' ? currentGroupMeta : null
        }
        contactTaskHint={contactTaskHint}
        isCourseOrchestrator={isCourseOrchestrator}
        orchestratorChildTasks={orchestratorChildTasks}
        selectedChildTaskId={selectedChildTaskId}
        setSelectedChildTaskId={setSelectedChildTaskId}
        notebookAction={
          mode === 'notebook' && stageMeta ? { id: stageMeta.id, name: stageMeta.name } : null
        }
      />

      <div ref={scrollRef} className={chatMessageScrollClassName}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {mode === 'none' && courseId && pickContactDone ? (
            <p className="text-center text-sm text-muted-foreground">
              本课程下还没有笔记本或 Agent。请回到课程页新建笔记本，或从课程内创建界面开始生成。
            </p>
          ) : null}
          {mode === 'none' && courseId && !pickContactDone ? (
            <p className="text-center text-sm text-muted-foreground">正在打开会话…</p>
          ) : null}

          {mode === 'agent' &&
          isCourseOrchestrator &&
          agThread.length === 0 &&
          !orchestratorPipelineProgress &&
          !orchestratorRemoteTask ? (
            <p className="mx-auto max-w-md px-2 text-center text-sm leading-relaxed text-muted-foreground">
              {orchestratorViewMode === 'group'
                ? '这里是课程内协作群聊，会显示课程总控与被调度笔记本的协作过程。'
                : '在此直接向课程总控提问：课程安排、概念解释、与笔记本无关的答疑等。创建笔记本请使用课程内创建界面。'}
            </p>
          ) : null}

          {mode === 'notebook' && nbThreadHydrated && nbThread.length === 0 && stageMeta ? (
            <div className="mx-auto mt-[12vh] w-full max-w-2xl px-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#64B5FF]">
                  <BookOpenText className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    从《{stageMeta.name}》开始
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {notebookEmptyPrompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        type="button"
                        onClick={() => setDraft(prompt.text)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#007AFF]/20 bg-[#007AFF]/5 px-3 text-xs font-medium text-[#0B5CAD] transition-colors hover:bg-[#007AFF]/10 hover:text-[#004A99] dark:border-[#0A84FF]/25 dark:bg-[#0A84FF]/10 dark:text-[#9DCCFF] dark:hover:bg-[#0A84FF]/15"
                      >
                        <Sparkles className="size-3.5" strokeWidth={1.7} />
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'notebook' ? (
            <NotebookMessageThread
              messages={nbThread}
              notebookScenes={notebookScenes}
              notebookScenesLoading={notebookScenesLoading}
              copyMessageText={copyMessageText}
              deleteNotebookMessageAt={deleteNotebookMessageAt}
              lessonGeneratingAt={lessonGeneratingAt}
              generateInlineLessonDeck={generateInlineLessonDeck}
              lessonSavingAt={lessonSavingAt}
              saveInlineLessonDeckToNotebook={saveInlineLessonDeckToNotebook}
            />
          ) : null}

          {mode === 'agent' ? (
            <AgentMessageThread
              messages={agThread}
              selectedAgent={selectedAgent}
              groupMeta={
                isCourseOrchestrator && orchestratorViewMode === 'group' ? currentGroupMeta : null
              }
              copyMessageText={copyMessageText}
              deleteAgentMessageById={deleteAgentMessageById}
            />
          ) : null}

          {mode === 'agent' && isCourseOrchestrator && orchestratorPipelineProgress ? (
            <OrchestratorNotebookProgressPanel progress={orchestratorPipelineProgress} />
          ) : mode === 'agent' && isCourseOrchestrator && orchestratorRemoteTask ? (
            <OrchestratorRemoteTaskBanner
              detail={orchestratorRemoteTask.detail}
              onCancel={handleCancelOrchestratorTask}
              cancelPending={orchestratorTaskCancelling}
            />
          ) : shouldShowSendingStatus ? (
            <div className="mx-auto flex w-full max-w-5xl items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {mode === 'notebook'
                ? notebookPendingAction === 'import'
                  ? '正在导入题库…'
                  : '正在询问笔记本…'
                : isCourseOrchestrator
                  ? '正在查找合适的笔记本…'
                  : '正在回复…'}
            </div>
          ) : null}
        </div>
      </div>

      <PdfPageSelectionDialog
        open={orchestratorPdfSelectionDialogOpen}
        file={orchestratorPdfSelectionFile}
        language="zh-CN"
        onOpenChange={(open) => {
          setOrchestratorPdfSelectionDialogOpen(open);
          if (!open) setOrchestratorPdfSelectionFile(null);
        }}
        onConfirm={(selection) => {
          setOrchestratorPdfSelectionDialogOpen(false);
          const selectedFile = orchestratorPdfSelectionFile;
          setOrchestratorPdfSelectionFile(null);
          if (!selectedFile) return;
          void handleSendAgent(selection);
        }}
      />

      <ChatComposer
        mode={mode}
        isCourseOrchestrator={isCourseOrchestrator}
        orchestratorViewMode={orchestratorViewMode}
        supportsComposerAttachments={supportsComposerAttachments}
        isComposerDragging={isComposerDragging}
        handleComposerDragEnter={handleComposerDragEnter}
        handleComposerDragOver={handleComposerDragOver}
        handleComposerDragLeave={handleComposerDragLeave}
        handleComposerDrop={handleComposerDrop}
        pendingAttachments={pendingAttachments}
        removePendingAttachment={removePendingAttachment}
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        handleSendNotebook={handleSendNotebook}
        handleSendAgent={() => handleSendAgent()}
        openAttachmentPicker={openAttachmentPicker}
        fileInputRef={fileInputRef}
        onPickAttachments={onPickAttachments}
        handleImportNotebookProblemBank={() => handleImportNotebookProblemBank()}
        openSettings={openSettings}
        readOnlyReason={
          mode === 'agent' && isCourseOrchestrator && orchestratorViewMode === 'group'
            ? '群聊由课程总控调度，请回到课程总控发送问题'
            : null
        }
      />

      <OrchestratorChildTaskDialog
        task={selectedChildTask}
        onOpenChange={(open) => {
          if (!open) setSelectedChildTaskId(null);
        }}
      />
    </div>
  );
}
