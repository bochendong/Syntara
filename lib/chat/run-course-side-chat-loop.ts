/**
 * 侧栏课程聊天：无 StreamBuffer，直接消费 /api/chat 的 SSE 并更新消息列表。
 * 行为与 use-chat-sessions 中的 agent loop 对齐（含 director 多轮）。
 */

import type { UIMessage } from 'ai';
import {
  buildCourseReplyProgress,
  dispatchCourseReplyProgress,
  type CourseReplyProgressPhase,
} from '@/lib/chat/course-reply-progress';
import type {
  ChatMessageMetadata,
  CourseChatContext,
  DirectorState,
  LearningAction,
  LearningActionKind,
  StatelessChatRequest,
  StatelessEvent,
} from '@/lib/types/chat';
import { useSettingsStore } from '@/lib/store/settings';
import { createLogger } from '@/lib/logger';
import { runQueuedAiTask, updateQueuedAiTask } from '@/lib/store/ai-task-queue';

const log = createLogger('CourseSideChat');

export interface RunCourseSideChatParams {
  initialMessages: UIMessage<ChatMessageMetadata>[];
  agentIds: string[];
  /** 非默认 Agent（如课程生成角色）需传完整配置 */
  agentConfigs?: StatelessChatRequest['config']['agentConfigs'];
  getStoreState: () => StatelessChatRequest['storeState'];
  userProfile?: { nickname?: string; bio?: string };
  surface?: StatelessChatRequest['config']['surface'];
  courseContext?: CourseChatContext;
  apiKey: string;
  baseUrl?: string;
  model: string;
  signal: AbortSignal;
  onMessages: (messages: UIMessage<ChatMessageMetadata>[]) => void;
}

function cloneMessages(m: UIMessage<ChatMessageMetadata>[]) {
  return m.map((msg) => ({
    ...msg,
    parts: msg.parts.map((p) => ({ ...p })),
    metadata: msg.metadata
      ? {
          ...msg.metadata,
          learningActions: msg.metadata.learningActions?.map((action) => ({
            ...action,
            payload: action.payload ? { ...action.payload } : undefined,
            evidence: action.evidence?.map((item) => ({ ...item })),
          })),
        }
      : undefined,
  })) as UIMessage<ChatMessageMetadata>[];
}

const LEARNING_ACTION_KINDS = new Set<LearningActionKind>([
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'calendar.search',
  'memory.search',
  'web.search',
  'learner_progress.request_confirmation',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'image.propose_generation',
  'memory.propose_write',
]);

function toLearningActionKind(actionName: string): LearningActionKind | null {
  return LEARNING_ACTION_KINDS.has(actionName as LearningActionKind)
    ? (actionName as LearningActionKind)
    : null;
}

function makeLearningAction(
  event: Extract<StatelessEvent, { type: 'action' }>,
): LearningAction | null {
  const kind = toLearningActionKind(event.data.actionName);
  if (!kind) return null;
  const params = event.data.params || {};
  const rawLabel = params.label || params.title || params.topic || event.data.actionName;
  const label = typeof rawLabel === 'string' ? rawLabel : event.data.actionName;
  const rawSummary = params.summary || params.reason;
  const summary = typeof rawSummary === 'string' ? rawSummary : undefined;
  const requiresConfirmation =
    params.requiresConfirmation === true ||
    (kind !== 'calendar.search' && params.requiresConfirmation !== false);
  return {
    id: event.data.actionId,
    kind,
    label,
    summary,
    status: 'proposed',
    confirmation: requiresConfirmation ? 'required' : 'none',
    payload: params,
  };
}

async function consumeOneResponse(
  response: Response,
  signal: AbortSignal,
  working: UIMessage<ChatMessageMetadata>[],
  onMessages: (m: UIMessage<ChatMessageMetadata>[]) => void,
  taskId?: string,
  initialProgressMessageId?: string | null,
): Promise<{
  cueUserReceived: boolean;
  doneData: {
    totalAgents: number;
    agentHadContent?: boolean;
    directorState?: DirectorState;
  } | null;
}> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let sseBuffer = '';
  let currentMessageId: string | null = null;
  let currentAgentName: string | null = null;
  let pendingProgressMessageId: string | null = initialProgressMessageId ?? null;
  let cueUserReceived = false;
  const streamingStartedMessageIds = new Set<string>();
  let doneData: {
    totalAgents: number;
    agentHadContent?: boolean;
    directorState?: DirectorState;
  } | null = null;

  const findTextPartIndex = (msg: UIMessage<ChatMessageMetadata>) =>
    msg.parts.findIndex((p) => p.type === 'text');

  const messageText = (msg: UIMessage<ChatMessageMetadata>) =>
    msg.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');

  const applyProgress = (
    phase: CourseReplyProgressPhase,
    targetId?: string | null,
    agentName?: string | null,
    options: { ensureMessage?: boolean } = {},
  ) => {
    const progress = buildCourseReplyProgress({ phase, messageId: targetId, agentName });
    const ensureMessage = options.ensureMessage ?? true;
    let resolvedTargetId = targetId || currentMessageId || pendingProgressMessageId;
    let changedMessage = false;

    if (!resolvedTargetId && ensureMessage) {
      resolvedTargetId = `assistant-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingProgressMessageId = resolvedTargetId;
      working.push({
        id: resolvedTargetId,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        metadata: {
          senderName: agentName?.trim() || '课程老师',
          originalRole: 'agent',
          createdAt: Date.now(),
          streaming: true,
          progressOnly: true,
          statusText: progress.line,
          publicProgressSteps: progress.steps,
        },
      });
      changedMessage = true;
    } else if (resolvedTargetId) {
      const msg = working.find((m) => m.id === resolvedTargetId);
      if (msg) {
        msg.metadata = {
          ...msg.metadata,
          senderName: msg.metadata?.senderName || agentName?.trim() || '课程老师',
          originalRole: msg.metadata?.originalRole || 'agent',
          createdAt: msg.metadata?.createdAt || Date.now(),
          streaming: true,
          progressOnly: msg.metadata?.progressOnly,
          statusText: progress.line,
          publicProgressSteps: progress.steps,
        };
        changedMessage = true;
      }
    }

    const detail = {
      ...progress,
      messageId: resolvedTargetId || progress.messageId,
    };
    if (taskId) {
      updateQueuedAiTask(taskId, { description: detail.line });
    }
    dispatchCourseReplyProgress(detail);
    if (changedMessage) onMessages(cloneMessages(working));
    return resolvedTargetId;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const eventStr of events) {
        const line = eventStr.trim();
        if (!line.startsWith('data: ')) continue;

        let event: StatelessEvent;
        try {
          event = JSON.parse(line.slice(6)) as StatelessEvent;
        } catch {
          continue;
        }

        switch (event.type) {
          case 'thinking': {
            applyProgress(
              event.data.stage === 'director' ? 'director' : 'agent_loading',
              currentMessageId ?? pendingProgressMessageId,
              currentAgentName,
            );
            break;
          }
          case 'agent_start': {
            const { messageId, agentId, agentName, agentAvatar, agentColor } = event.data;
            currentMessageId = messageId;
            currentAgentName = agentName;
            const progress = buildCourseReplyProgress({
              phase: 'agent_started',
              messageId,
              agentName,
            });
            const pendingMessage = pendingProgressMessageId
              ? working.find((m) => m.id === pendingProgressMessageId)
              : null;
            const pendingText = pendingMessage ? messageText(pendingMessage).trim() : '';
            const nextMetadata: ChatMessageMetadata = {
              senderName: agentName,
              senderAvatar: agentAvatar,
              agentId,
              agentColor,
              originalRole: 'agent',
              createdAt: pendingMessage?.metadata?.createdAt || Date.now(),
              streaming: true,
              statusText: progress.line,
              publicProgressSteps: progress.steps,
            };
            if (pendingMessage && !pendingText) {
              pendingMessage.id = messageId;
              pendingMessage.metadata = nextMetadata;
              pendingProgressMessageId = null;
            } else {
              working.push({
                id: messageId,
                role: 'assistant',
                parts: [{ type: 'text', text: '' }],
                metadata: nextMetadata,
              });
            }
            if (taskId) updateQueuedAiTask(taskId, { description: progress.line });
            dispatchCourseReplyProgress(progress);
            onMessages(cloneMessages(working));
            break;
          }
          case 'text_delta': {
            const targetId = event.data.messageId ?? currentMessageId;
            if (!targetId) break;
            const msg = working.find((m) => m.id === targetId);
            if (!msg) break;
            if (!streamingStartedMessageIds.has(targetId)) {
              streamingStartedMessageIds.add(targetId);
              const progress = buildCourseReplyProgress({
                phase: 'streaming',
                messageId: targetId,
                agentName: msg.metadata?.senderName || currentAgentName,
              });
              msg.metadata = {
                ...msg.metadata,
                streaming: true,
                statusText: progress.line,
                publicProgressSteps: progress.steps,
              };
              if (taskId) updateQueuedAiTask(taskId, { description: progress.line });
              dispatchCourseReplyProgress(progress);
            }
            const ti = findTextPartIndex(msg);
            if (ti < 0) {
              msg.parts.push({ type: 'text', text: event.data.content });
            } else {
              const part = msg.parts[ti];
              if (part.type === 'text') {
                part.text = (part.text || '') + event.data.content;
              }
            }
            onMessages(cloneMessages(working));
            break;
          }
          case 'action': {
            const learningAction = makeLearningAction(event);
            if (!learningAction) break;
            const targetId = event.data.messageId ?? currentMessageId;
            if (!targetId) break;
            const msg = working.find((m) => m.id === targetId);
            if (!msg) break;
            msg.metadata = {
              ...msg.metadata,
              learningActions: [...(msg.metadata?.learningActions || []), learningAction],
            };
            onMessages(cloneMessages(working));
            break;
          }
          case 'agent_end': {
            const msg = working.find((m) => m.id === event.data.messageId);
            if (msg?.metadata) {
              msg.metadata = {
                ...msg.metadata,
                streaming: false,
                statusText: undefined,
                publicProgressSteps: undefined,
              };
              onMessages(cloneMessages(working));
            }
            currentMessageId = null;
            currentAgentName = null;
            break;
          }
          case 'cue_user': {
            cueUserReceived = true;
            break;
          }
          case 'done': {
            doneData = {
              totalAgents: event.data.totalAgents,
              agentHadContent: event.data.agentHadContent,
              directorState: event.data.directorState,
            };
            if (!currentMessageId && pendingProgressMessageId) {
              const pendingIndex = working.findIndex((m) => m.id === pendingProgressMessageId);
              if (pendingIndex >= 0 && !messageText(working[pendingIndex]).trim()) {
                working.splice(pendingIndex, 1);
                pendingProgressMessageId = null;
                onMessages(cloneMessages(working));
              }
            }
            applyProgress('completed', currentMessageId, currentAgentName, {
              ensureMessage: false,
            });
            break;
          }
          case 'error': {
            applyProgress('failed', currentMessageId, currentAgentName, { ensureMessage: false });
            throw new Error(event.data.message);
          }
          default:
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { cueUserReceived, doneData };
}

function summarizeChatPrompt(messages: UIMessage<ChatMessageMetadata>[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const text = lastUser?.parts
    ?.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || '正在生成聊天回复';
}

export async function runCourseSideChatLoop(params: RunCourseSideChatParams): Promise<void> {
  return runQueuedAiTask(
    {
      kind: 'chat-reply',
      title: '聊天回复',
      description: summarizeChatPrompt(params.initialMessages),
      signal: params.signal,
    },
    ({ taskId }) => runCourseSideChatLoopUnqueued(params, taskId),
  );
}

async function runCourseSideChatLoopUnqueued(
  params: RunCourseSideChatParams,
  taskId?: string,
): Promise<void> {
  const {
    initialMessages,
    agentIds,
    agentConfigs,
    getStoreState,
    userProfile,
    surface,
    courseContext,
    apiKey,
    baseUrl,
    model,
    signal,
    onMessages,
  } = params;

  const settingsState = useSettingsStore.getState();
  const defaultMaxTurns = agentIds.length <= 1 ? 1 : 10;
  const maxTurns = settingsState.maxTurns
    ? parseInt(settingsState.maxTurns, 10) || defaultMaxTurns
    : defaultMaxTurns;

  let directorState: DirectorState | undefined;
  let turnCount = 0;
  const working = cloneMessages(initialMessages);
  let consecutiveEmptyTurns = 0;

  const addQueuedProgressMessage = () => {
    const progress = buildCourseReplyProgress({ phase: 'queued' });
    const messageId = `assistant-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    working.push({
      id: messageId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      metadata: {
        senderName: '课程老师',
        originalRole: 'agent',
        createdAt: Date.now(),
        streaming: true,
        progressOnly: true,
        statusText: progress.line,
        publicProgressSteps: progress.steps,
      },
    });
    if (taskId) updateQueuedAiTask(taskId, { description: progress.line });
    dispatchCourseReplyProgress({ ...progress, messageId });
    onMessages(cloneMessages(working));
    return messageId;
  };

  const removeQueuedProgressMessage = (messageId: string | null) => {
    if (!messageId) return;
    const index = working.findIndex((message) => message.id === messageId);
    if (index < 0 || !working[index].metadata?.progressOnly) return;
    working.splice(index, 1);
    onMessages(cloneMessages(working));
  };

  while (turnCount < maxTurns && !signal.aborted) {
    const queuedProgressMessageId = addQueuedProgressMessage();
    const storeState = getStoreState();

    const config: StatelessChatRequest['config'] = {
      agentIds,
      sessionType: 'qa',
      surface,
    };
    if (agentConfigs && agentConfigs.length > 0) {
      config.agentConfigs = agentConfigs;
    }

    let cueUserReceived = false;
    let doneData: {
      totalAgents: number;
      agentHadContent?: boolean;
      directorState?: DirectorState;
    } | null = null;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: working.filter((message) => !message.metadata?.progressOnly),
          storeState,
          config,
          courseContext,
          userProfile,
          directorState,
          apiKey,
          baseUrl: baseUrl || undefined,
          model,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const consumed = await consumeOneResponse(
        response,
        signal,
        working,
        onMessages,
        taskId,
        queuedProgressMessageId,
      );
      cueUserReceived = consumed.cueUserReceived;
      doneData = consumed.doneData;
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        removeQueuedProgressMessage(queuedProgressMessageId);
      } else {
        const progress = buildCourseReplyProgress({
          phase: 'failed',
          messageId: queuedProgressMessageId,
        });
        if (taskId) updateQueuedAiTask(taskId, { description: progress.line });
        dispatchCourseReplyProgress(progress);
        removeQueuedProgressMessage(queuedProgressMessageId);
      }
      throw error;
    }

    if (signal.aborted) {
      removeQueuedProgressMessage(queuedProgressMessageId);
      break;
    }

    if (doneData?.directorState) {
      directorState = doneData.directorState;
    }
    turnCount = directorState?.turnCount ?? turnCount + 1;

    if (cueUserReceived) break;
    if (doneData && doneData.totalAgents === 0) break;

    if (doneData?.agentHadContent === false) {
      consecutiveEmptyTurns++;
      if (consecutiveEmptyTurns >= 2) {
        log.warn('[CourseSideChat] consecutive empty turns, stopping');
        break;
      }
    } else {
      consecutiveEmptyTurns = 0;
    }
  }
}
