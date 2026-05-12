'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getStoredApplyNotebookWrites,
  subscribeApplyNotebookWrites,
} from '@/lib/utils/notebook-write-preference';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useNotificationStore } from '@/lib/store/notifications';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import { listAgentsForCourse, type CourseAgentListItem } from '@/lib/utils/course-agents';
import type { Scene } from '@/lib/types/stage';
import type { SettingsSection } from '@/lib/types/settings';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
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
import { buildStudyCompanionNotification } from '@/lib/learning/study-memory';
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
import { OrchestratorChildTaskDialog } from '@/components/chat/orchestrator-child-task-dialog';
import { ChatComposer } from '@/components/chat/chat-composer';
import { AgentMessageThread, NotebookMessageThread } from '@/components/chat/chat-message-threads';
import { ChatPageHeader, NoCourseChatState } from '@/components/chat/chat-page-header';
import { useInlineLessonDeckActions } from '@/components/chat/use-inline-lesson-deck-actions';
import { useNotebookChatActions } from '@/components/chat/use-notebook-chat-actions';
import { useAgentChatActions } from '@/components/chat/use-agent-chat-actions';
import { useChatAttachments } from '@/components/chat/use-chat-attachments';
import { useChatMessageActions } from '@/components/chat/use-chat-message-actions';
import type {
  NotebookChatMessage,
  OrchestratorChildTaskView,
  OrchestratorComposerMode,
  OrchestratorViewMode,
} from '@/components/chat/chat-page-types';

const ORCHESTRATOR_REMOTE_TASK_POLL_INTERVAL_MS = 5000;
const CONTACT_TASK_HINT_POLL_INTERVAL_MS = 5000;
const ORCHESTRATOR_CHILD_TASK_POLL_INTERVAL_MS = 3000;

function canPollInCurrentTab(): boolean {
  return document.visibilityState === 'visible';
}

export function ChatPageClient() {
  const { t } = useI18n();
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
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notebookPendingAction, setNotebookPendingAction] = useState<'chat' | 'import' | null>(
    null,
  );
  const [applyNotebookWrites, setApplyNotebookWrites] = useState(true);
  useEffect(() => {
    setApplyNotebookWrites(getStoredApplyNotebookWrites());
    return subscribeApplyNotebookWrites(() => {
      setApplyNotebookWrites(getStoredApplyNotebookWrites());
    });
  }, []);
  const agThreadRef = useRef(agThread);
  const nbThreadRef = useRef(nbThread);
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

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  );
  const selectedChildTask = useMemo(
    () => orchestratorChildTasks.find((t) => t.id === selectedChildTaskId) || null,
    [orchestratorChildTasks, selectedChildTaskId],
  );
  const isCourseOrchestrator = agentId === COURSE_ORCHESTRATOR_ID;
  const orchestratorViewMode: OrchestratorViewMode =
    isCourseOrchestrator && chatView === 'group' ? 'group' : 'private';
  const shouldRenderGroupReplies = isCourseOrchestrator && orchestratorViewMode === 'group';
  const agentConversationTargetId =
    isCourseOrchestrator && agentId
      ? orchestratorViewMode === 'group'
        ? `${agentId}::group`
        : `${agentId}::private`
      : agentId;

  const mode = notebookId
    ? ('notebook' as const)
    : agentId
      ? ('agent' as const)
      : ('none' as const);
  const supportsComposerAttachments = mode === 'notebook';

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
    if (nb && ag) {
      router.replace(`/chat?notebook=${encodeURIComponent(nb)}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!courseId) {
      setPickContactDone(true);
      return;
    }
    const nb = searchParams.get('notebook');
    const ag = searchParams.get('agent');
    if (nb || ag) {
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
    if (!notebookId) {
      setNotebookScenes([]);
      setNotebookScenesLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    // 切换笔记本时先清空，避免旧线程被保存到新 notebook 会话
    setNbThread([]);
    setNbThreadHydrated(false);
  }, [notebookId]);

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
    if (!notebookId) {
      revokeNotebookAttachmentUrls(nbThreadRef.current);
      setNbThread([]);
      setNbThreadHydrated(false);
      return;
    }
    let cancelled = false;
    loadContactMessages<NotebookChatMessage>(courseId, 'notebook', notebookId, {
      ignoreCourseId: true,
    }).then(async (messages) => {
      const hydrated = await hydrateNotebookThread(messages);
      if (cancelled) {
        revokeNotebookAttachmentUrls(hydrated);
        return;
      }
      setNbThread(hydrated);
      setNbThreadHydrated(true);
    });
    return () => {
      cancelled = true;
      revokeNotebookAttachmentUrls(nbThreadRef.current);
    };
  }, [notebookId, courseId]);

  useEffect(() => {
    if (!notebookId || !courseId || !nbThreadHydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebookId,
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
  }, [notebookId, courseId, stageMeta?.name, nbThread, nbThreadHydrated]);

  useEffect(() => {
    if (!agentConversationTargetId || !courseId) {
      revokeAgentAttachmentUrls(agThreadRef.current);
      setAgThread([]);
      return;
    }
    let cancelled = false;
    loadContactMessages<UIMessage<ChatMessageMetadata>>(
      courseId,
      'agent',
      agentConversationTargetId,
    ).then(async (messages) => {
      const filtered = messages.filter((m) => !isMockAgentMessage(m));
      const hydrated = await hydrateAgentThread(filtered);
      if (cancelled) {
        revokeAgentAttachmentUrls(hydrated);
        return;
      }
      setAgThread(hydrated);
    });
    return () => {
      cancelled = true;
      revokeAgentAttachmentUrls(agThreadRef.current);
    };
  }, [agentConversationTargetId, courseId]);

  useEffect(() => {
    if (!agentConversationTargetId || !courseId || !selectedAgent) return;
    void saveContactMessages<UIMessage<ChatMessageMetadata>>({
      courseId,
      kind: 'agent',
      targetId: agentConversationTargetId,
      targetName:
        isCourseOrchestrator && orchestratorViewMode === 'group'
          ? `${selectedAgent.name} · 群聊`
          : selectedAgent.name,
      messages: stripAttachmentUrlsFromAgentMessages(
        agThread.filter((m) => !isMockAgentMessage(m)),
      ),
    });
  }, [
    agentConversationTargetId,
    courseId,
    selectedAgent,
    agThread,
    isCourseOrchestrator,
    orchestratorViewMode,
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [nbThread.length, agThread.length, sending, orchestratorRemoteTask?.detail]);

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
            (t.title.startsWith('总控任务') || Boolean(t.notebookId?.trim())) &&
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
  }, [notebookId, agentId, setPendingAttachments]);

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

  const { handleImportNotebookProblemBank, handleSendNotebook, runNotebookSubtask } =
    useNotebookChatActions({
      courseId,
      notebookId,
      draft,
      pendingAttachments,
      sending,
      nbThread,
      selectedNotebookId: notebookId,
      applyNotebookWrites,
      notebookWritesDisabledHint: t('chat.notebookWritesDisabledHint'),
      reloadNotebookScenes,
      setNbThread,
      setDraft,
      setSending,
      setNotebookPendingAction,
      setPendingAttachments,
    });

  const handleSendAgent = useAgentChatActions({
    agentId,
    selectedAgent,
    sending,
    draft,
    pendingAttachments,
    orchestratorViewMode,
    orchestratorComposerMode,
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
    shouldRenderGroupReplies,
    runNotebookSubtask,
  });

  const titleLine = useMemo(() => {
    if (!courseId) return '聊天';
    if (mode === 'notebook' && stageMeta) return stageMeta.name;
    if (mode === 'agent' && selectedAgent) {
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID && orchestratorViewMode === 'group') {
        return '群聊 · 课程内协作会话';
      }
      return selectedAgent.name;
    }
    return '选择联系人';
  }, [courseId, mode, stageMeta, selectedAgent, orchestratorViewMode]);

  if (!courseId) {
    return <NoCourseChatState />;
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.35),transparent_38%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]',
        'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.25),transparent_45%),linear-gradient(180deg,#0b0f16_0%,#111827_100%)]',
      )}
    >
      <ChatPageHeader
        titleLine={titleLine}
        mode={mode}
        contactTaskHint={contactTaskHint}
        isCourseOrchestrator={isCourseOrchestrator}
        orchestratorChildTasks={orchestratorChildTasks}
        selectedChildTaskId={selectedChildTaskId}
        setSelectedChildTaskId={setSelectedChildTaskId}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
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

        {mode === 'notebook' ? (
          <NotebookMessageThread
            messages={nbThread}
            userAvatar={userAvatar}
            nickname={nickname}
            stageMeta={stageMeta}
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
            userAvatar={userAvatar}
            nickname={nickname}
            selectedAgent={selectedAgent}
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
        ) : sending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {mode === 'notebook'
              ? notebookPendingAction === 'import'
                ? '正在导入题库…'
                : '正在询问笔记本…'
              : '正在回复…'}
          </div>
        ) : null}
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
        selectedAgent={selectedAgent}
        sending={sending}
        handleSendNotebook={handleSendNotebook}
        handleSendAgent={() => handleSendAgent()}
        openAttachmentPicker={openAttachmentPicker}
        fileInputRef={fileInputRef}
        onPickAttachments={onPickAttachments}
        handleImportNotebookProblemBank={() => handleImportNotebookProblemBank()}
        openSettings={openSettings}
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
