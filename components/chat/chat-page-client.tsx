'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { BookOpen, Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { NotebookKnowledgeReference } from '@/lib/types/notebook-message';
import { sendMessageToNotebook } from '@/lib/notebook/send-message';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  listAgentsForCourse,
  toChatAgentConfig,
  type CourseAgentListItem,
} from '@/lib/utils/course-agents';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type { Scene } from '@/lib/types/stage';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import {
  createAgentTask,
  listChildTasks,
  listTasksForContact,
  updateAgentTask,
} from '@/lib/utils/agent-task-storage';
import {
  COURSE_ORCHESTRATOR_AVATAR,
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
} from '@/lib/constants/course-chat';
import type {
  ProtocolMessageEnvelope,
  TaskDispatchPayload,
  TaskErrorPayload,
  TaskResultPayload,
  TaskWaitPayload,
} from '@/lib/types/agent-chat-protocol';

type NotebookChatMessage =
  | {
      role: 'user';
      text: string;
      at: number;
      attachments?: Array<{ id: string; name: string; mimeType: string; size: number }>;
    }
  | {
      role: 'assistant';
      answer: string;
      references: NotebookKnowledgeReference[];
      knowledgeGap: boolean;
      prerequisiteHints?: string[];
      webSearchUsed?: boolean;
      appliedLabel?: string;
      at: number;
    };

type NotebookAttachmentInput = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
};

type OrchestratorChildTaskView = {
  id: string;
  title: string;
  detail?: string;
  status: 'running' | 'waiting' | 'done' | 'failed';
  contactId: string;
  updatedAt: number;
  lastEnvelope?: ProtocolMessageEnvelope;
};

function messageText(m: UIMessage<ChatMessageMetadata>) {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function formatAppliedSummary(result: Awaited<ReturnType<typeof sendMessageToNotebook>>) {
  const a = result.applied;
  if (!a) return '';
  const bits: string[] = [];
  if (a.insertedPageRange) bits.push(`已插入页：${a.insertedPageRange}`);
  if (a.updatedPages?.length) bits.push(`已更新页：${a.updatedPages.join(', ')}`);
  if (a.deletedPages?.length) bits.push(`已删除页：${a.deletedPages.join(', ')}`);
  return bits.join(' · ') || '';
}

function isImageAvatarUrl(src: string | undefined | null): boolean {
  if (!src) return false;
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

/** 当前用户头像（侧气泡右侧） */
function ChatUserAvatar({
  src,
  displayName,
  className,
}: {
  src?: string | null;
  displayName: string;
  className?: string;
}) {
  const resolved = src?.trim() || USER_AVATAR;
  if (isImageAvatarUrl(resolved)) {
    return (
      <img
        src={resolved}
        alt=""
        className={cn(
          'size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10',
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
      aria-hidden
    >
      {displayName.trim().slice(0, 1) || '我'}
    </div>
  );
}

/** 笔记本「助手」侧头像（左侧，方角与侧栏笔记本一致） */
function NotebookPeerAvatar({
  avatarUrl,
  notebookName,
}: {
  avatarUrl?: string | null;
  notebookName: string;
}) {
  if (avatarUrl && isImageAvatarUrl(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5"
      title={notebookName}
    >
      <BookOpen className="size-4 text-slate-400" strokeWidth={1.75} />
    </div>
  );
}

/** Agent 回复侧头像 */
function AgentPeerAvatar({
  avatarSrc,
  agentName,
}: {
  avatarSrc?: string | null;
  agentName: string;
}) {
  const src = avatarSrc?.trim() || '';
  if (isImageAvatarUrl(src)) {
    return (
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-medium text-violet-800 ring-1 ring-black/5 dark:text-violet-200 dark:ring-white/10"
      title={agentName}
      aria-hidden
    >
      {src && !isImageAvatarUrl(src) ? src.slice(0, 1) : agentName.slice(0, 1) || 'A'}
    </div>
  );
}

const TEXT_LIKE_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];
const TEXT_LIKE_FILE_EXT = [
  '.md',
  '.txt',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.sql',
  '.yaml',
  '.yml',
];

function isTextLikeFile(file: File): boolean {
  const mime = file.type || '';
  if (TEXT_LIKE_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  const lower = file.name.toLowerCase();
  return TEXT_LIKE_FILE_EXT.some((ext) => lower.endsWith(ext));
}

async function extractTextExcerpt(file: File): Promise<string | undefined> {
  if (!isTextLikeFile(file)) return undefined;
  try {
    const raw = await file.text();
    const cleaned = raw.replace(/\u0000/g, '').trim();
    if (!cleaned) return undefined;
    return cleaned.slice(0, 6000);
  } catch {
    return undefined;
  }
}

function makeProtocolEnvelope<TPayload>(args: {
  conversationId: string;
  courseId: string;
  type: ProtocolMessageEnvelope<TPayload>['type'];
  sender: ProtocolMessageEnvelope<TPayload>['sender'];
  receiver: ProtocolMessageEnvelope<TPayload>['receiver'];
  parentMessageId?: string;
  payload: TPayload;
}): ProtocolMessageEnvelope<TPayload> {
  return {
    protocol: 'openmaic.a2a.v1',
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId: args.conversationId,
    parentMessageId: args.parentMessageId,
    courseId: args.courseId,
    sender: args.sender,
    receiver: args.receiver,
    type: args.type,
    createdAt: Date.now(),
    payload: args.payload,
  };
}

function formatTs(ts?: number): string {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString();
}

export function ChatPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);

  const notebookId = searchParams.get('notebook');
  const agentId = searchParams.get('agent');

  const nickname = useUserProfileStore((s) => s.nickname);
  const userAvatar = useUserProfileStore((s) => s.avatar);

  const [stageMeta, setStageMeta] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [agents, setAgents] = useState<CourseAgentListItem[]>([]);
  const [nbThread, setNbThread] = useState<NotebookChatMessage[]>([]);
  const [agThread, setAgThread] = useState<UIMessage<ChatMessageMetadata>[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [applyNotebookWrites, setApplyNotebookWrites] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<NotebookAttachmentInput[]>([]);
  const [pickContactDone, setPickContactDone] = useState(false);
  const [contactTaskHint, setContactTaskHint] = useState<string | null>(null);
  const [activeOrchestratorTaskId, setActiveOrchestratorTaskId] = useState<string | null>(null);
  const [orchestratorChildTasks, setOrchestratorChildTasks] = useState<OrchestratorChildTaskView[]>([]);
  const [selectedChildTaskId, setSelectedChildTaskId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  );
  const selectedChildTask = useMemo(
    () => orchestratorChildTasks.find((t) => t.id === selectedChildTaskId) || null,
    [orchestratorChildTasks, selectedChildTaskId],
  );
  const isCourseOrchestrator = selectedAgent?.id === COURSE_ORCHESTRATOR_ID;

  const mode = notebookId ? ('notebook' as const) : agentId ? ('agent' as const) : ('none' as const);

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
          avatar: COURSE_ORCHESTRATOR_AVATAR,
          role: 'teacher',
          persona: '课程总控，会并行调度本课程笔记本完成任务。',
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
  }, [courseId]);

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
      const nbs = await listStagesByCourse(courseId);
      const ags = await listAgentsForCourse(courseId);
      if (cancelled) return;
      if (nbs[0]) {
        router.replace(`/chat?notebook=${encodeURIComponent(nbs[0].id)}`);
      } else if (ags[0]) {
        router.replace(`/chat?agent=${encodeURIComponent(ags[0].id)}`);
      } else {
        router.replace(`/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`);
      }
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

  useEffect(() => {
    if (!notebookId || !courseId) {
      setNbThread([]);
      return;
    }
    let cancelled = false;
    loadContactMessages<NotebookChatMessage>(courseId, 'notebook', notebookId).then((messages) => {
      if (cancelled) return;
      setNbThread(messages);
    });
    return () => {
      cancelled = true;
    };
  }, [notebookId, courseId]);

  useEffect(() => {
    if (!notebookId || !courseId) return;
    void saveContactMessages<NotebookChatMessage>({
      courseId,
      kind: 'notebook',
      targetId: notebookId,
      targetName: stageMeta?.name || '笔记本',
      messages: nbThread,
    });
  }, [notebookId, courseId, stageMeta?.name, nbThread]);

  useEffect(() => {
    if (!agentId || !courseId) {
      setAgThread([]);
      return;
    }
    let cancelled = false;
    loadContactMessages<UIMessage<ChatMessageMetadata>>(courseId, 'agent', agentId).then((messages) => {
      if (cancelled) return;
      setAgThread(messages);
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, courseId]);

  useEffect(() => {
    if (!agentId || !courseId || !selectedAgent) return;
    void saveContactMessages<UIMessage<ChatMessageMetadata>>({
      courseId,
      kind: 'agent',
      targetId: agentId,
      targetName: selectedAgent.name,
      messages: agThread,
    });
  }, [agentId, courseId, selectedAgent, agThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [nbThread.length, agThread.length, sending]);

  useEffect(() => {
    setPendingAttachments([]);
    setActiveOrchestratorTaskId(null);
    setSelectedChildTaskId(null);
  }, [notebookId, agentId]);

  useEffect(() => {
    if (!agentId) {
      setContactTaskHint(null);
      return;
    }
    let alive = true;
    const sync = async () => {
      const tasks = await listTasksForContact('agent', agentId);
      if (!alive) return;
      const active = tasks.find((t) => t.status === 'running' || t.status === 'waiting');
      setContactTaskHint(active?.detail || (active ? active.title : null));
    };
    void sync();
    const timer = window.setInterval(sync, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [agentId]);

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
    void sync();
    const timer = window.setInterval(sync, 1200);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeOrchestratorTaskId, isCourseOrchestrator]);

  useEffect(() => {
    if (!selectedChildTaskId) return;
    if (!orchestratorChildTasks.some((t) => t.id === selectedChildTaskId)) {
      setSelectedChildTaskId(null);
    }
  }, [selectedChildTaskId, orchestratorChildTasks]);

  const openAttachmentPicker = () => {
    fileInputRef.current?.click();
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const onPickAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, 6);
    const built: NotebookAttachmentInput[] = [];
    for (const file of selected) {
      const textExcerpt = await extractTextExcerpt(file);
      built.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        textExcerpt,
      });
    }
    setPendingAttachments((prev) => [...prev, ...built].slice(-6));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendNotebook = async () => {
    const text = draft.trim();
    if (!text || !notebookId || sending) return;
    const mc = getCurrentModelConfig();
    if (!mc.apiKey?.trim() && !mc.isServerConfigured) {
      window.alert('请先在设置中配置 API Key，或使用已配置的服务端模型。');
      return;
    }

    const userMsg: NotebookChatMessage = {
      role: 'user',
      text,
      at: Date.now(),
      attachments: pendingAttachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      })),
    };
    setNbThread((t) => [...t, userMsg]);
    setDraft('');
    setSending(true);
    const taskId =
      courseId && notebookId
        ? await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: `笔记本问答：${text.slice(0, 36)}`,
            detail: '正在生成回答…',
            status: 'running',
          })
        : null;
    try {
      const conversation = [...nbThread, userMsg]
        .slice(-12)
        .map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, content: m.text, at: m.at }
            : { role: 'assistant' as const, content: m.answer, at: m.at },
        );
      const result = await sendMessageToNotebook(notebookId, text, {
        applyChanges: applyNotebookWrites,
        preferWebSearch: true,
        conversation,
        attachments: pendingAttachments,
      });
      const appliedLabel = formatAppliedSummary(result);
      const assistantMsg: NotebookChatMessage = {
        role: 'assistant',
        answer: result.answer,
        references: result.references || [],
        knowledgeGap: result.knowledgeGap,
        prerequisiteHints: result.prerequisiteHints,
        webSearchUsed: result.webSearchUsed,
        appliedLabel: appliedLabel || undefined,
        at: Date.now(),
      };
      setNbThread((t) => [...t, assistantMsg]);
      setPendingAttachments([]);
      if (taskId) {
        await updateAgentTask(taskId, {
          status: 'done',
          detail: result.knowledgeGap ? '已完成（含知识缺口建议）' : '已完成',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNbThread((t) => [
        ...t,
        {
          role: 'assistant',
          answer: `请求失败：${msg}`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        },
      ]);
      if (taskId) {
        await updateAgentTask(taskId, { status: 'failed', detail: msg.slice(0, 300) });
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendAgent = async () => {
    const text = draft.trim();
    if (!text || !agentId || !selectedAgent || sending) return;
    const mc = getCurrentModelConfig();
    if (!mc.apiKey?.trim() && !mc.isServerConfigured) {
      window.alert('请先在设置中配置 API Key，或使用已配置的服务端模型。');
      return;
    }

    if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
      const now = Date.now();
      const userMessage: UIMessage<ChatMessageMetadata> = {
        id: `user-${now}`,
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: {
          senderName: nickname.trim() || '我',
          senderAvatar: userAvatar || USER_AVATAR,
          originalRole: 'user',
          createdAt: now,
        },
      };
      const nextThread = [...agThread, userMessage];
      setAgThread(nextThread);
      setDraft('');
      setSending(true);

      const taskId = await createAgentTask({
        courseId: courseId!,
        contactKind: 'agent',
        contactId: selectedAgent.id,
        title: `调度课程笔记本：${text.slice(0, 36)}`,
        detail: '正在收集课程笔记本列表…',
        status: 'running',
      });
      setActiveOrchestratorTaskId(taskId);

      try {
        const orchestratorConversationId = `course:${courseId}:orchestrator:${taskId}`;
        const stages = await listStagesByCourse(courseId!);
        if (stages.length === 0) {
          const assistantMsg: UIMessage<ChatMessageMetadata> = {
            id: `assist-${Date.now()}`,
            role: 'assistant',
            parts: [{ type: 'text', text: '当前课程还没有笔记本，无法调度。请先创建至少一个笔记本。' }],
            metadata: {
              senderName: selectedAgent.name,
              senderAvatar: selectedAgent.avatar,
              originalRole: 'agent',
              createdAt: Date.now(),
            },
          };
          setAgThread((t) => [...t, assistantMsg]);
          const errEnvelope = makeProtocolEnvelope<TaskErrorPayload>({
            conversationId: orchestratorConversationId,
            courseId: courseId!,
            type: 'task.error',
            sender: {
              role: 'course_agent',
              id: selectedAgent.id,
              name: selectedAgent.name,
            },
            receiver: {
              role: 'user',
              id: 'user',
              name: nickname.trim() || '我',
            },
            payload: {
              taskId,
              code: 'NO_NOTEBOOKS',
              message: '当前课程没有可调度的笔记本',
              retryable: true,
            },
          });
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: '无可调度笔记本',
            lastEnvelope: errEnvelope,
          });
          return;
        }

        const rootWaitEnvelope = makeProtocolEnvelope<TaskWaitPayload>({
          conversationId: orchestratorConversationId,
          courseId: courseId!,
          type: 'task.wait',
          sender: {
            role: 'course_agent',
            id: selectedAgent.id,
            name: selectedAgent.name,
          },
          receiver: {
            role: 'user',
            id: 'user',
            name: nickname.trim() || '我',
          },
          payload: {
            taskId,
            waitingFor: 'subagent',
            progressText: `已派发任务，等待 ${stages.length} 个笔记本回复…`,
          },
        });
        await updateAgentTask(taskId, {
          status: 'waiting',
          detail: `已派发任务，等待 ${stages.length} 个笔记本回复…`,
          lastEnvelope: rootWaitEnvelope,
        });

        const contextWindow = nextThread
          .slice(-10)
          .map((m) => ({
            role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: messageText(m),
            at: m.metadata?.createdAt,
          }))
          .filter((x) => x.content.trim().length > 0);

        let finished = 0;
        let succeeded = 0;
        let failed = 0;
        const responses = await Promise.all(
          stages.map(async (stage) => {
            const dispatchPayload: TaskDispatchPayload = {
              taskId,
              intent: 'qa',
              message: text,
              contextWindow,
              constraints: {
                allowWrite: false,
              },
            };
            const dispatchEnvelope = makeProtocolEnvelope<TaskDispatchPayload>({
              conversationId: orchestratorConversationId,
              courseId: courseId!,
              type: 'task.dispatch',
              sender: {
                role: 'course_agent',
                id: selectedAgent.id,
                name: selectedAgent.name,
              },
              receiver: {
                role: 'notebook_agent',
                id: stage.id,
                name: stage.name,
              },
              payload: dispatchPayload,
            });

            const childTaskId = await createAgentTask({
              courseId: courseId!,
              parentTaskId: taskId,
              contactKind: 'notebook',
              contactId: stage.id,
              title: `子任务：${stage.name}`,
              detail: 'task.dispatch 已发送',
              status: 'running',
              lastEnvelope: dispatchEnvelope,
            });

            const childWaitEnvelope = makeProtocolEnvelope<TaskWaitPayload>({
              conversationId: orchestratorConversationId,
              courseId: courseId!,
              type: 'task.wait',
              sender: {
                role: 'notebook_agent',
                id: stage.id,
                name: stage.name,
              },
              receiver: {
                role: 'course_agent',
                id: selectedAgent.id,
                name: selectedAgent.name,
              },
              parentMessageId: dispatchEnvelope.messageId,
              payload: {
                taskId,
                waitingFor: 'tool',
                progressText: '正在检索笔记本上下文并生成回答',
              },
            });
            await updateAgentTask(childTaskId, {
              status: 'waiting',
              detail: '等待笔记本回答…',
              lastEnvelope: childWaitEnvelope,
            });

            try {
              const result = await sendMessageToNotebook(stage.id, text, {
                applyChanges: false,
                preferWebSearch: true,
                conversation: contextWindow,
              });
              const childResultEnvelope = makeProtocolEnvelope<TaskResultPayload>({
                conversationId: orchestratorConversationId,
                courseId: courseId!,
                type: 'task.result',
                sender: {
                  role: 'notebook_agent',
                  id: stage.id,
                  name: stage.name,
                },
                receiver: {
                  role: 'course_agent',
                  id: selectedAgent.id,
                  name: selectedAgent.name,
                },
                parentMessageId: childWaitEnvelope.messageId,
                payload: {
                  taskId,
                  summary: result.answer,
                  references: (result.references || []).map((r) => ({
                    page: r.order,
                    title: r.title,
                    why: r.why,
                  })),
                },
              });
              await updateAgentTask(childTaskId, {
                status: 'done',
                detail: '已收到回复',
                lastEnvelope: childResultEnvelope,
              });
              finished += 1;
              succeeded += 1;
              const progressEnvelope = makeProtocolEnvelope<TaskWaitPayload>({
                conversationId: orchestratorConversationId,
                courseId: courseId!,
                type: 'task.wait',
                sender: {
                  role: 'course_agent',
                  id: selectedAgent.id,
                  name: selectedAgent.name,
                },
                receiver: {
                  role: 'user',
                  id: 'user',
                  name: nickname.trim() || '我',
                },
                payload: {
                  taskId,
                  waitingFor: 'subagent',
                  progressText: `已完成 ${finished}/${stages.length}（成功 ${succeeded}，失败 ${failed}）`,
                },
              });
              await updateAgentTask(taskId, {
                status: finished < stages.length ? 'waiting' : 'running',
                detail: `已完成 ${finished}/${stages.length}（成功 ${succeeded}，失败 ${failed}）`,
                lastEnvelope: progressEnvelope,
              });
              return { stage, result, error: null as string | null };
            } catch (error) {
              const errMessage = error instanceof Error ? error.message : String(error);
              const childErrorEnvelope = makeProtocolEnvelope<TaskErrorPayload>({
                conversationId: orchestratorConversationId,
                courseId: courseId!,
                type: 'task.error',
                sender: {
                  role: 'notebook_agent',
                  id: stage.id,
                  name: stage.name,
                },
                receiver: {
                  role: 'course_agent',
                  id: selectedAgent.id,
                  name: selectedAgent.name,
                },
                parentMessageId: childWaitEnvelope.messageId,
                payload: {
                  taskId,
                  code: 'NOTEBOOK_SEND_FAILED',
                  message: errMessage,
                  retryable: true,
                },
              });
              await updateAgentTask(childTaskId, {
                status: 'failed',
                detail: errMessage.slice(0, 200),
                lastEnvelope: childErrorEnvelope,
              });
              finished += 1;
              failed += 1;
              const progressEnvelope = makeProtocolEnvelope<TaskWaitPayload>({
                conversationId: orchestratorConversationId,
                courseId: courseId!,
                type: 'task.wait',
                sender: {
                  role: 'course_agent',
                  id: selectedAgent.id,
                  name: selectedAgent.name,
                },
                receiver: {
                  role: 'user',
                  id: 'user',
                  name: nickname.trim() || '我',
                },
                payload: {
                  taskId,
                  waitingFor: 'subagent',
                  progressText: `已完成 ${finished}/${stages.length}（成功 ${succeeded}，失败 ${failed}）`,
                },
              });
              await updateAgentTask(taskId, {
                status: finished < stages.length ? 'waiting' : 'running',
                detail: `已完成 ${finished}/${stages.length}（成功 ${succeeded}，失败 ${failed}）`,
                lastEnvelope: progressEnvelope,
              });
              return { stage, result: null as Awaited<ReturnType<typeof sendMessageToNotebook>> | null, error: errMessage };
            }
          }),
        );

        const blocks = responses.map(({ stage, result, error }) => {
          if (error) {
            return [`【${stage.name}】`, `失败：${error}`].join('\n');
          }
          if (!result) {
            return [`【${stage.name}】`, '失败：无结果'].join('\n');
          }
          const refs = (result.references || [])
            .slice(0, 3)
            .map((r) => `第${r.order}页(${r.title})`)
            .join('、');
          return [
            `【${stage.name}】`,
            result.answer || '（无回答）',
            refs ? `引用：${refs}` : '',
            result.knowledgeGap ? '标记：存在知识缺口' : '',
          ]
            .filter(Boolean)
            .join('\n');
        });
        const summaryText =
          `我已调度 ${responses.length} 个笔记本并汇总（成功 ${succeeded}，失败 ${failed}）：\n\n${blocks.join('\n\n')}`;

        const assistantMsg: UIMessage<ChatMessageMetadata> = {
          id: `assist-${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'text', text: summaryText }],
          metadata: {
            senderName: selectedAgent.name,
            senderAvatar: selectedAgent.avatar,
            originalRole: 'agent',
            createdAt: Date.now(),
          },
        };
        setAgThread((t) => [...t, assistantMsg]);
        const resultEnvelope = makeProtocolEnvelope<TaskResultPayload>({
          conversationId: orchestratorConversationId,
          courseId: courseId!,
          type: 'task.result',
          sender: {
            role: 'course_agent',
            id: selectedAgent.id,
            name: selectedAgent.name,
          },
          receiver: {
            role: 'user',
            id: 'user',
            name: nickname.trim() || '我',
          },
          payload: {
            taskId,
            summary: summaryText,
          },
        });
        await updateAgentTask(taskId, {
          status: failed > 0 ? 'failed' : 'done',
          detail: `已完成：成功 ${succeeded}，失败 ${failed}`,
          lastEnvelope: resultEnvelope,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const errId = `err-${Date.now()}`;
        setAgThread((t) => [
          ...t,
          {
            id: errId,
            role: 'assistant',
            parts: [{ type: 'text', text: `总控调度失败：${msg}` }],
            metadata: {
              senderName: selectedAgent.name,
              senderAvatar: selectedAgent.avatar,
              originalRole: 'agent',
              createdAt: Date.now(),
            },
          },
        ]);
        const errEnvelope = makeProtocolEnvelope<TaskErrorPayload>({
          conversationId: `course:${courseId}:orchestrator:${taskId}`,
          courseId: courseId!,
          type: 'task.error',
          sender: {
            role: 'course_agent',
            id: selectedAgent.id,
            name: selectedAgent.name,
          },
          receiver: {
            role: 'user',
            id: 'user',
            name: nickname.trim() || '我',
          },
          payload: {
            taskId,
            code: 'ORCHESTRATOR_FAILED',
            message: msg,
            retryable: true,
          },
        });
        await updateAgentTask(taskId, {
          status: 'failed',
          detail: msg.slice(0, 300),
          lastEnvelope: errEnvelope,
        });
      } finally {
        setSending(false);
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const now = Date.now();
    const userMessage: UIMessage<ChatMessageMetadata> = {
      id: `user-${now}`,
      role: 'user',
      parts: [{ type: 'text', text }],
      metadata: {
        senderName: nickname.trim() || '我',
        senderAvatar: userAvatar || USER_AVATAR,
        originalRole: 'user',
        createdAt: now,
      },
    };

    const nextThread = [...agThread, userMessage];
    setAgThread(nextThread);
    setDraft('');
    setSending(true);

    const agentConfigs = selectedAgent.id.startsWith('default-')
      ? undefined
      : [toChatAgentConfig(selectedAgent)];

    const getStoreState = () => ({
      stage: null,
      scenes: [] as Scene[],
      currentSceneId: null,
      mode: 'playback' as const,
      whiteboardOpen: false,
    });

    try {
      await runCourseSideChatLoop({
        initialMessages: nextThread,
        agentIds: [selectedAgent.id],
        agentConfigs,
        getStoreState,
        userProfile: { nickname: nickname.trim() || undefined },
        apiKey: mc.apiKey,
        baseUrl: mc.baseUrl || undefined,
        model: mc.modelString,
        signal: controller.signal,
        onMessages: setAgThread,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      const errId = `err-${Date.now()}`;
      setAgThread((t) => [
        ...t,
        {
          id: errId,
          role: 'assistant',
          parts: [{ type: 'text', text: `发送失败：${msg}` }],
          metadata: {
            senderName: '系统',
            originalRole: 'agent',
            createdAt: Date.now(),
          },
        },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  };

  const titleLine = useMemo(() => {
    if (!courseId) return '聊天';
    if (mode === 'notebook' && stageMeta) return stageMeta.name;
    if (mode === 'agent' && selectedAgent) return selectedAgent.name;
    return '选择联系人';
  }, [courseId, mode, stageMeta, selectedAgent]);

  const subtitle =
    mode === 'notebook'
      ? '笔记本 · 问答与页引用'
      : mode === 'agent'
        ? isCourseOrchestrator
          ? '课程总控 · 可并行调度本课程笔记本'
          : '课程 Agent'
        : '';

  if (!courseId) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
        <BookOpen className="size-12 text-muted-foreground/40" strokeWidth={1.25} />
        <div className="max-w-md space-y-2">
          <p className="text-lg font-medium text-foreground">尚未选择课程</p>
          <p className="text-sm text-muted-foreground">
            请先从「我的课程」进入一门课，或从课堂返回以保留侧栏课程上下文，再使用聊天。
          </p>
        </div>
        <Button asChild variant="default" className="rounded-xl">
          <Link href="/my-courses">前往我的课程</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.35),transparent_38%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]',
        'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.25),transparent_45%),linear-gradient(180deg,#0b0f16_0%,#111827_100%)]',
      )}
    >
      <header className="shrink-0 border-b border-slate-900/[0.06] bg-white/60 px-5 py-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-black/25">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {courseName || '当前课程'}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{titleLine}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        {mode === 'agent' && contactTaskHint ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">任务状态：{contactTaskHint}</p>
        ) : null}
        {mode === 'agent' && isCourseOrchestrator && orchestratorChildTasks.length > 0 ? (
          <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-slate-900/[0.08] bg-white/70 px-2 py-1 text-[11px] dark:border-white/[0.1] dark:bg-black/30">
            {orchestratorChildTasks.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedChildTaskId(t.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                  selectedChildTaskId === t.id ? 'bg-black/5 dark:bg-white/10' : '',
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    t.status === 'done'
                      ? 'bg-emerald-500'
                      : t.status === 'failed'
                        ? 'bg-rose-500'
                        : 'bg-amber-500',
                  )}
                  aria-hidden
                />
                <span className="truncate text-foreground">{t.title.replace(/^子任务：/, '')}</span>
                <span className="truncate text-muted-foreground">{t.detail || ''}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        {mode === 'none' && courseId && pickContactDone ? (
          <p className="text-center text-sm text-muted-foreground">
            本课程下还没有笔记本或 Agent。请先创建笔记本，或从生成流程创建课程角色。
          </p>
        ) : null}
        {mode === 'none' && courseId && !pickContactDone ? (
          <p className="text-center text-sm text-muted-foreground">正在打开会话…</p>
        ) : null}

        {mode === 'notebook'
          ? nbThread.map((m, i) =>
              m.role === 'user' ? (
                <div key={`u-${m.at}-${i}`} className="flex items-end justify-end gap-2">
                  <div className="max-w-[min(100%,520px)] rounded-2xl bg-violet-600 px-4 py-2.5 text-sm text-white dark:bg-violet-500">
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    {m.attachments && m.attachments.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {m.attachments.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] text-white/90"
                          >
                            📎 {a.name}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <ChatUserAvatar
                    src={userAvatar}
                    displayName={nickname.trim() || '我'}
                  />
                </div>
              ) : (
                <div key={`a-${m.at}-${i}`} className="flex items-start justify-start gap-2">
                  <NotebookPeerAvatar
                    avatarUrl={stageMeta?.avatarUrl}
                    notebookName={stageMeta?.name ?? '笔记本'}
                  />
                  <div className="max-w-[min(100%,640px)] rounded-2xl border border-slate-900/[0.08] bg-white/90 px-4 py-3 text-sm shadow-sm dark:border-white/[0.1] dark:bg-black/40">
                    <p className="whitespace-pre-wrap break-words text-foreground">{m.answer}</p>
                    {m.references.length > 0 ? (
                      <div className="mt-3 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.08]">
                        <p className="text-xs font-semibold text-muted-foreground">页码引用</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                          {m.references.map((r, j) => (
                            <li key={j}>
                              <span className="font-medium text-foreground">第 {r.order} 节 · {r.title}</span>
                              {r.why ? <span> — {r.why}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {m.prerequisiteHints && m.prerequisiteHints.length > 0 ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        前置提示：{m.prerequisiteHints.join('；')}
                      </p>
                    ) : null}
                    {m.knowledgeGap ? (
                      <p className="mt-2 text-xs text-muted-foreground">模型判断存在知识缺口，可能已尝试补充内容。</p>
                    ) : null}
                    {m.webSearchUsed ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">已使用联网检索</p>
                    ) : null}
                    {m.appliedLabel ? (
                      <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">{m.appliedLabel}</p>
                    ) : null}
                  </div>
                </div>
              ),
            )
          : null}

        {mode === 'agent'
          ? agThread.map((m) => {
              const isUser = m.role === 'user';
              const text = messageText(m);
              const meta = m.metadata;
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex gap-2',
                    isUser ? 'flex-row-reverse items-end' : 'flex-row items-start',
                  )}
                >
                  {isUser ? (
                    <ChatUserAvatar
                      src={meta?.senderAvatar || userAvatar}
                      displayName={meta?.senderName || nickname.trim() || '我'}
                    />
                  ) : (
                    <AgentPeerAvatar
                      avatarSrc={meta?.senderAvatar ?? selectedAgent?.avatar}
                      agentName={meta?.senderName || selectedAgent?.name || 'Agent'}
                    />
                  )}
                  <div
                    className={cn(
                      'max-w-[min(100%,560px)] rounded-2xl px-4 py-2.5 text-sm',
                      isUser
                        ? 'bg-violet-600 text-white dark:bg-violet-500'
                        : 'border border-slate-900/[0.08] bg-white/90 text-foreground dark:border-white/[0.1] dark:bg-black/40',
                    )}
                  >
                    {!isUser && meta?.senderName ? (
                      <p className="mb-1 text-[10px] font-medium opacity-70">{meta.senderName}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                </div>
              );
            })
          : null}

        {sending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {mode === 'notebook' ? '正在询问笔记本…' : '正在回复…'}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-900/[0.08] bg-white/70 p-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-black/30">
        {mode === 'notebook' ? (
          <>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={applyNotebookWrites}
                onCheckedChange={(v) => setApplyNotebookWrites(v === true)}
              />
              允许根据回答写入笔记本（插入 / 更新 / 删除页）
            </label>
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={openAttachmentPicker}
                disabled={sending}
              >
                <Paperclip className="mr-1 size-3.5" />
                添加附件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onPickAttachments(e.target.files);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                支持文本文件提取上下文；图片会随元数据一起发送。
              </p>
            </div>
            {pendingAttachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pendingAttachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-white/15 dark:bg-black/25 dark:text-slate-200"
                  >
                    <Paperclip className="size-3" />
                    <span className="max-w-[200px] truncate">{a.name}</span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => removePendingAttachment(a.id)}
                      aria-label={`移除附件 ${a.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mode === 'none'
                ? '请选择左侧联系人…'
                : mode === 'notebook'
                  ? '向该笔记本提问…'
                  : `与 ${selectedAgent?.name ?? 'Agent'} 对话…`
            }
            disabled={mode === 'none' || sending}
            className="min-h-[52px] flex-1 resize-none rounded-xl text-sm"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (mode === 'notebook') void handleSendNotebook();
                else if (mode === 'agent') void handleSendAgent();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="size-12 shrink-0 rounded-xl"
            disabled={mode === 'none' || sending || !draft.trim()}
            aria-label="发送"
            onClick={() => {
              if (mode === 'notebook') void handleSendNotebook();
              else if (mode === 'agent') void handleSendAgent();
            }}
          >
            {sending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <SendHorizontal className="size-5" strokeWidth={1.75} />
            )}
          </Button>
        </div>
      </footer>

      <Dialog
        open={Boolean(selectedChildTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedChildTaskId(null);
        }}
      >
        <DialogContent className="max-h-[80dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedChildTask?.title || '子任务详情'}</DialogTitle>
            <DialogDescription>
              查看该子任务的协议事件快照、路由信息与最新 payload。
            </DialogDescription>
          </DialogHeader>

          {selectedChildTask ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-900/[0.08] bg-muted/20 p-3 dark:border-white/[0.1]">
                <div>
                  <p className="text-[11px] text-muted-foreground">状态</p>
                  <p className="font-medium">{selectedChildTask.status}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">更新时间</p>
                  <p className="font-medium">{formatTs(selectedChildTask.updatedAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground">详情</p>
                  <p className="font-medium">{selectedChildTask.detail || 'N/A'}</p>
                </div>
              </div>

              {selectedChildTask.lastEnvelope ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Protocol Envelope
                  </p>
                  <div className="rounded-lg border border-slate-900/[0.08] bg-white/70 p-3 dark:border-white/[0.1] dark:bg-black/30">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">type</span>
                        <p className="font-medium">{selectedChildTask.lastEnvelope.type}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">protocol</span>
                        <p className="font-medium">{selectedChildTask.lastEnvelope.protocol}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">messageId</span>
                        <p className="font-mono text-[11px] break-all">
                          {selectedChildTask.lastEnvelope.messageId}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">conversationId</span>
                        <p className="font-mono text-[11px] break-all">
                          {selectedChildTask.lastEnvelope.conversationId}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">sender</span>
                        <p>
                          {selectedChildTask.lastEnvelope.sender.name} ({selectedChildTask.lastEnvelope.sender.role})
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">receiver</span>
                        <p>
                          {selectedChildTask.lastEnvelope.receiver.name} ({selectedChildTask.lastEnvelope.receiver.role})
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">createdAt</span>
                        <p>{formatTs(selectedChildTask.lastEnvelope.createdAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">payload</p>
                      <pre className="max-h-72 overflow-auto rounded bg-black/90 p-3 text-[11px] leading-relaxed text-slate-100">
                        {JSON.stringify(selectedChildTask.lastEnvelope.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">该任务尚无 envelope 快照。</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
