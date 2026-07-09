'use client';

import type { UIMessage } from 'ai';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import { buildCourseChatContext } from '@/lib/chat/course-chat-context';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type {
  ChatMessageMetadata,
  CourseChatContext,
  CourseChatLayeredMemoryContext,
  StatelessChatRequest,
} from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { backendJson } from '@/lib/utils/backend-api';

const LAYERED_MEMORY_CONTEXT_TIMEOUT_MS = 6000;

export type AskCourseOrchestratorOptions = {
  courseId: string;
  question: string;
  attachments?: CourseChatImageAttachment[];
  courseName?: string;
  orchestratorAvatarUrl?: string | null;
  conversation?: UIMessage<ChatMessageMetadata>[];
  courseContext?: CourseChatContext;
  learnerContext?: CourseChatContext['learner'];
  answererHandoff?: CourseChatContext['answererHandoff'];
  userProfile?: { nickname?: string; bio?: string };
  signal?: AbortSignal;
  onMessages?: (messages: UIMessage<ChatMessageMetadata>[]) => void;
};

export type CourseChatImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export type AskCourseOrchestratorResult = {
  answer: string;
  messages: UIMessage<ChatMessageMetadata>[];
  courseContext: CourseChatContext;
};

function messageText(message: UIMessage<ChatMessageMetadata>): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function latestAssistantAnswer(messages: UIMessage<ChatMessageMetadata>[]): string {
  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant' && !message.metadata?.progressOnly);
  return latestAssistant ? messageText(latestAssistant) : '';
}

function buildUserMessage(
  question: string,
  attachments: CourseChatImageAttachment[] = [],
): UIMessage<ChatMessageMetadata> {
  const now = Date.now();
  const parts = [
    { type: 'text' as const, text: question },
    ...attachments.map((attachment) => ({
      type: 'file' as const,
      url: attachment.dataUrl,
      mediaType: attachment.mimeType,
      filename: attachment.name,
    })),
  ] as UIMessage<ChatMessageMetadata>['parts'];
  return {
    id: `course-question-${now}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    parts,
    metadata: {
      senderName: '你',
      originalRole: 'user',
      createdAt: now,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
    },
  };
}

function buildOrchestratorAgentConfig(
  avatarUrl?: string | null,
): NonNullable<StatelessChatRequest['config']['agentConfigs']>[number] {
  return {
    id: COURSE_ORCHESTRATOR_ID,
    name: COURSE_ORCHESTRATOR_NAME,
    avatar: avatarUrl || '',
    role: 'teacher',
    persona:
      '你是课程总控老师。先判断用户的问题应该由现有笔记回答、补充笔记，还是协同多个笔记本完成；在直接回答时，要像耐心的课程导师一样讲清概念、步骤、例子和易错点。',
    color: '#7c3aed',
    allowedActions: [],
    priority: 100,
    isGenerated: false,
  };
}

async function loadLayeredMemoryForCourseChat(args: {
  courseId: string;
  question: string;
  signal?: AbortSignal;
}): Promise<CourseChatLayeredMemoryContext | undefined> {
  const question = args.question.trim();
  if (!question) return undefined;

  const params = new URLSearchParams({
    targetType: 'course',
    targetId: args.courseId,
    message: question,
  });

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LAYERED_MEMORY_CONTEXT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  args.signal?.addEventListener('abort', abortFromParent, { once: true });
  if (args.signal?.aborted) controller.abort();

  try {
    return await backendJson<CourseChatLayeredMemoryContext>(
      `/api/memory/context?${params.toString()}`,
      { cache: 'no-store', signal: controller.signal },
    );
  } catch (error) {
    console.warn(
      '[ask-course-orchestrator] Failed to load layered memory context:',
      error instanceof Error ? error.message : error,
    );
    return undefined;
  } finally {
    window.clearTimeout(timeoutId);
    args.signal?.removeEventListener('abort', abortFromParent);
  }
}

export async function askCourseOrchestrator(
  options: AskCourseOrchestratorOptions,
): Promise<AskCourseOrchestratorResult> {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig.isServerConfigured) {
    throw new Error('系统模型尚未配置，请联系管理员。');
  }

  const baseCourseContext =
    options.courseContext ??
    (await buildCourseChatContext({
      courseId: options.courseId,
      courseName: options.courseName,
      question: options.question,
      learner: options.learnerContext,
      target: {
        kind: 'orchestrator',
        id: COURSE_ORCHESTRATOR_ID,
        name: COURSE_ORCHESTRATOR_NAME,
        role: 'teacher',
      },
    }));
  const layeredMemory =
    baseCourseContext.layeredMemory ||
    (await loadLayeredMemoryForCourseChat({
      courseId: options.courseId,
      question: options.question,
      signal: options.signal,
    }));
  const courseContextWithMemory = layeredMemory
    ? { ...baseCourseContext, layeredMemory }
    : baseCourseContext;
  const courseContext = options.answererHandoff
    ? { ...courseContextWithMemory, answererHandoff: options.answererHandoff }
    : courseContextWithMemory;

  let messages = [
    ...(options.conversation || []),
    buildUserMessage(options.question, options.attachments),
  ];
  const controller = options.signal ? null : new AbortController();

  await runCourseSideChatLoop({
    initialMessages: messages,
    agentIds: [COURSE_ORCHESTRATOR_ID],
    agentConfigs: [buildOrchestratorAgentConfig(options.orchestratorAvatarUrl)],
    getStoreState: () => ({
      stage: null,
      scenes: [] as Scene[],
      currentSceneId: null,
      mode: 'playback' as const,
      whiteboardOpen: false,
    }),
    userProfile: options.userProfile,
    surface: 'course-chat',
    courseContext,
    apiKey: modelConfig.apiKey,
    baseUrl: modelConfig.baseUrl || undefined,
    model: modelConfig.modelString,
    signal: options.signal ?? controller!.signal,
    onMessages: (nextMessages) => {
      messages = nextMessages;
      options.onMessages?.(nextMessages);
    },
  });

  return {
    answer: latestAssistantAnswer(messages),
    messages,
    courseContext,
  };
}
