/**
 * 侧栏课程聊天：无 StreamBuffer，直接消费 /api/chat 的 SSE 并更新消息列表。
 * 行为与 use-chat-sessions 中的 agent loop 对齐（含 director 多轮）。
 */

import type { UIMessage } from 'ai';
import type {
  ChatMessageMetadata,
  DirectorState,
  StatelessChatRequest,
  StatelessEvent,
} from '@/lib/types/chat';
import { useSettingsStore } from '@/lib/store/settings';
import { createLogger } from '@/lib/logger';
import { emitDebugLog } from '@/lib/debug/client-debug-log';

const log = createLogger('CourseSideChat');

export interface RunCourseSideChatParams {
  initialMessages: UIMessage<ChatMessageMetadata>[];
  agentIds: string[];
  /** 非默认 Agent（如课程生成角色）需传完整配置 */
  agentConfigs?: StatelessChatRequest['config']['agentConfigs'];
  getStoreState: () => StatelessChatRequest['storeState'];
  userProfile?: { nickname?: string; bio?: string };
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
    metadata: msg.metadata ? { ...msg.metadata } : undefined,
  })) as UIMessage<ChatMessageMetadata>[];
}

async function consumeOneResponse(
  response: Response,
  signal: AbortSignal,
  working: UIMessage<ChatMessageMetadata>[],
  onMessages: (m: UIMessage<ChatMessageMetadata>[]) => void,
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
  let cueUserReceived = false;
  let doneData: {
    totalAgents: number;
    agentHadContent?: boolean;
    directorState?: DirectorState;
  } | null = null;

  const findTextPartIndex = (msg: UIMessage<ChatMessageMetadata>) =>
    msg.parts.findIndex((p) => p.type === 'text');

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
          case 'agent_start': {
            const { messageId, agentId, agentName, agentAvatar, agentColor } = event.data;
            currentMessageId = messageId;
            // #region agent log
            emitDebugLog({
              hypothesisId: 'B',
              location: 'lib/chat/run-course-side-chat-loop.ts:96',
              message: 'SSE agent_start received',
              data: {
                messageId,
                agentId,
                agentName,
              },
            });
            // #endregion
            working.push({
              id: messageId,
              role: 'assistant',
              parts: [{ type: 'text', text: '' }],
              metadata: {
                senderName: agentName,
                senderAvatar: agentAvatar,
                agentId,
                agentColor,
                originalRole: 'agent',
                createdAt: Date.now(),
              },
            });
            onMessages(cloneMessages(working));
            break;
          }
          case 'text_delta': {
            const targetId = event.data.messageId ?? currentMessageId;
            if (!targetId) break;
            const msg = working.find((m) => m.id === targetId);
            if (!msg) break;
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
          case 'cue_user': {
            cueUserReceived = true;
            break;
          }
          case 'done': {
            // #region agent log
            emitDebugLog({
              hypothesisId: 'B',
              location: 'lib/chat/run-course-side-chat-loop.ts:143',
              message: 'SSE done received',
              data: {
                totalAgents: event.data.totalAgents,
                agentHadContent: event.data.agentHadContent ?? null,
                turnCount: event.data.directorState?.turnCount ?? null,
              },
            });
            // #endregion
            doneData = {
              totalAgents: event.data.totalAgents,
              agentHadContent: event.data.agentHadContent,
              directorState: event.data.directorState,
            };
            break;
          }
          case 'error': {
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

export async function runCourseSideChatLoop(params: RunCourseSideChatParams): Promise<void> {
  const {
    initialMessages,
    agentIds,
    agentConfigs,
    getStoreState,
    userProfile,
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
  let working = cloneMessages(initialMessages);
  let consecutiveEmptyTurns = 0;

  while (turnCount < maxTurns && !signal.aborted) {
    const storeState = getStoreState();

    const config: StatelessChatRequest['config'] = {
      agentIds,
      sessionType: 'qa',
    };
    if (agentConfigs && agentConfigs.length > 0) {
      config.agentConfigs = agentConfigs;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: working,
        storeState,
        config,
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

    const { cueUserReceived, doneData } = await consumeOneResponse(
      response,
      signal,
      working,
      onMessages,
    );

    if (signal.aborted) break;

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
