'use client';

import type { UIMessage } from 'ai';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import { buildCourseChatContext } from '@/lib/chat/course-chat-context';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type {
  ChatMessageMetadata,
  CourseChatContext,
  StatelessChatRequest,
} from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';

export type AskCourseOrchestratorOptions = {
  courseId: string;
  question: string;
  courseName?: string;
  orchestratorAvatarUrl?: string | null;
  conversation?: UIMessage<ChatMessageMetadata>[];
  courseContext?: CourseChatContext;
  userProfile?: { nickname?: string; bio?: string };
  signal?: AbortSignal;
  onMessages?: (messages: UIMessage<ChatMessageMetadata>[]) => void;
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
    .find((message) => message.role === 'assistant');
  return latestAssistant ? messageText(latestAssistant) : '';
}

function buildUserMessage(question: string): UIMessage<ChatMessageMetadata> {
  const now = Date.now();
  return {
    id: `course-question-${now}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    parts: [{ type: 'text', text: question }],
    metadata: {
      senderName: '你',
      originalRole: 'user',
      createdAt: now,
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

export async function askCourseOrchestrator(
  options: AskCourseOrchestratorOptions,
): Promise<AskCourseOrchestratorResult> {
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig.isServerConfigured) {
    throw new Error('系统模型尚未配置，请联系管理员。');
  }

  const courseContext =
    options.courseContext ??
    (await buildCourseChatContext({
      courseId: options.courseId,
      courseName: options.courseName,
      question: options.question,
      target: {
        kind: 'orchestrator',
        id: COURSE_ORCHESTRATOR_ID,
        name: COURSE_ORCHESTRATOR_NAME,
        role: 'teacher',
      },
    }));

  let messages = [...(options.conversation || []), buildUserMessage(options.question)];
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
