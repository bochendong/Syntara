/**
 * Director Graph — LangGraph StateGraph for Multi-Agent Orchestration
 *
 * Unified graph topology (same for single and multi-agent):
 *
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ director (loop)
 *
 * The director node adapts its strategy based on agent count:
 *   - Single agent: pure code logic (no LLM). Dispatches the agent on
 *     turn 0, then cues the user on subsequent turns.
 *   - Multi agent: LLM-based decision (with code fast-paths for turn 0
 *     trigger agent and turn limits).
 *
 * Uses LangGraph's custom stream mode: each node pushes StatelessEvent
 * chunks via config.writer() for real-time SSE delivery.
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { LanguageModel } from 'ai';

import { AISdkLangGraphAdapter } from './ai-sdk-adapter';
import type { CourseChatContext, StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import {
  buildStructuredPrompt,
  summarizeConversation,
  convertMessagesToOpenAI,
  convertedMessageContentToText,
  type ConvertedMessageContent,
} from './prompt-builder';
import { buildDirectorPrompt, parseDirectorDecision } from './director-prompt';
import { COURSE_CHAT_LEARNING_ACTIONS, getEffectiveActions } from './tool-schemas';
import type { AgentTurnSummary, WhiteboardActionRecord } from './director-prompt';
import { parseStructuredChunk, createParserState, finalizeParser } from './stateless-generate';
import { createLogger } from '@/lib/logger';

const log = createLogger('DirectorGraph');

function toLangChainHumanContent(content: ConvertedMessageContent) {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image' && typeof part.image === 'string') {
      return {
        type: 'image_url',
        image_url: { url: part.image },
        mime_type: part.mediaType,
      };
    }
    return { type: 'text', text: '[Image attachment]' };
  });
}

function latestUserText(messages: ReturnType<typeof convertMessagesToOpenAI>): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'user') {
      return convertedMessageContentToText(message.content);
    }
  }
  return '';
}

function makeLearningActionId() {
  return `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function userConfirmsPreviouslyProposedAction(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (/请.{0,12}(确认|让我确认|给我.{0,8}确认|提出.{0,8}确认)/i.test(text)) {
    return false;
  }
  return (
    /已经.{0,16}(确认|同意).{0,8}(了|这个|这项|加入|添加|修改|删除|生成|写入|更新)|已确认.{0,8}(这个|这项|加入|添加|修改|删除|生成|写入|更新|按钮|卡片|日历|练习|记忆)|点击.{0,8}确认|confirmed/i.test(
      text,
    ) ||
    /点击了?.{0,16}(加入日历|添加|修改|删除|生成|写入|确认)/i.test(text) ||
    /(我|本人).{0,4}(确认|同意|选择)/i.test(text) ||
    /(确认|同意)(写入|添加|加入|修改|删除|生成|更新)/i.test(text) ||
    /在确认(框|卡).{0,12}(同意|选择|提交)/i.test(text)
  );
}

function userRejectsRepeatConfirmation(userText: string): boolean {
  return /不要再.{0,12}(让)?我.{0,4}确认|不要重复.{0,8}确认|别再.{0,8}确认|do not ask .*confirm again/i.test(
    userText,
  );
}

function userRejectsCalendarChange(userText: string): boolean {
  return /(?:不要|别|无需|不用|先不要).{0,24}(?:日历|日程|calendar|schedule|加入|添加|写入|同步|add)/i.test(
    userText,
  );
}

function userRejectsAssistantInitiatedAction(userText: string, actionName: string): boolean {
  if (actionName.startsWith('calendar.')) return userRejectsCalendarChange(userText);
  if (actionName === 'practice.propose_generation') {
    return /(?:不要|别|无需|不用|先不要).{0,24}(?:练习|题目|习题|题库|生成|practice|exercise|problem)/i.test(
      userText,
    );
  }
  if (actionName === 'memory.propose_write') {
    return /(?:不要|别|无需|不用|先不要).{0,24}(?:记忆|薄弱点|学习记录|写入|保存|更新|memory|weakness)/i.test(
      userText,
    );
  }
  return false;
}

type InferredCourseChatAction = {
  actionName: string;
  params: Record<string, unknown>;
  allowAssistantInitiated?: boolean;
};

function inferCourseChatActionFallback(args: {
  userText: string;
  assistantText: string;
  courseId?: string;
}): InferredCourseChatAction | null {
  const combined = `${args.userText}\n${args.assistantText}`.toLowerCase();
  const original = `${args.userText}\n${args.assistantText}`;
  const userOriginal = args.userText;
  const assistantText = args.assistantText;
  const wantsConfirmation =
    /确认|先让|先给.{0,12}(确认|按钮|确认卡|确认框)|不要直接|按钮|弹窗|确认框|confirm|confirmation|button|popup/i.test(
      original,
    );
  const mentionsCalendar = /日历|日程|calendar|schedule/i.test(original);
  const mentionsStudyPlanItem =
    /学习计划|复习计划|预习计划|课程计划|原计划|计划安排|学习安排|复习事项|学习块|学习事项|复习块/i.test(
      original,
    );
  const userMentionsPractice =
    /(?:给我|帮我|请|想|要|需要|开始|继续|生成|出|挑选|选择|安排).{0,24}(?:练习|题库|题目|习题|做题|practice|exercise|problem set|quiz)|(?:练习|题库|题目|习题|做题).{0,24}(?:给我|帮我|生成|挑选|选择|安排|计划|下一组|再来|开始)|(?:[0-9一二三四五六七八九十]+|几|一些).{0,4}道.{0,4}题|生成.{0,8}题|出.{0,8}题|practice|exercise|problem set|quiz/i.test(
      userOriginal,
    );
  const userMentionsClassroom =
    /临时课堂|课堂讲解|生成.{0,8}课堂|讲解课堂|classroom|mini-lesson|lesson/i.test(userOriginal);
  const mentionsMemory = /记忆|薄弱点|掌握|写入|更新|memory|weakness|mastery/i.test(original);
  const mentionsProgress =
    /进度|学习状态|学到哪里|可用.{0,6}时间|学习时间|每天.{0,8}时间|每周.{0,8}时间|复习范围|考试日期|progress|available time|study time|exam date|scope/i.test(
      original,
    );
  const userConfirmedExistingAction = userConfirmsPreviouslyProposedAction(args.userText);
  const userRequestsAnotherConfirmation =
    !userRejectsRepeatConfirmation(args.userText) &&
    /给我.{0,12}确认|提供.{0,12}确认|先给.{0,12}(确认|按钮|确认卡|确认框)|先让.{0,8}确认|让我.{0,8}确认|确认(按钮|框|卡)|不要直接|confirmation|button|popup/i.test(
      args.userText,
    );
  const assistantRequestsProgressInfo =
    /需要.{0,40}(学习进度|学习状态|可用|时间|掌握|信息)|请告诉|告诉我|提供.{0,40}(时间|进度)|请确认.{0,30}(学习进度|可用时间)|每天.{0,12}(投入|学习).{0,12}时间|当前进度如何|进度如何/i.test(
      assistantText,
    );
  const assistantHasConcreteCalendarProposal =
    /将.{0,30}(计划|安排|内容|这些).{0,20}(加入|添加|写入).{0,12}(学习)?(日历|日程)|确认.{0,30}(是否可以)?.{0,20}(加入|添加).{0,12}(学习)?(日历|日程)|是否可以将.{0,30}(计划|安排|内容|这些).{0,20}(加入|添加|写入).{0,12}(学习)?(日历|日程)/i.test(
      assistantText,
    );
  const userProvidedPlanningInfo =
    /确认卡里选择|确认卡中选择|每天.{0,12}(分钟|小时|时间|学习)|每周.{0,12}(分钟|小时|时间|学习)|可用.{0,8}时间|当前进度|掌握|薄弱|progress|available time|study time/i.test(
      userOriginal,
    );

  if (
    mentionsProgress &&
    assistantRequestsProgressInfo &&
    !assistantHasConcreteCalendarProposal &&
    (!userConfirmedExistingAction || userProvidedPlanningInfo) &&
    (wantsConfirmation ||
      /需要|告诉我|提供|确认|不确定|need|tell me|provide|confirm/i.test(original))
  ) {
    return {
      actionName: 'learner_progress.request_confirmation',
      params: {
        label: '确认学习进度',
        fields: ['progress', 'available_time'],
        summary: args.assistantText || '确认学习进度后再生成计划。',
        courseId: args.courseId,
      },
    };
  }

  if (mentionsCalendar || mentionsStudyPlanItem) {
    if (userConfirmedExistingAction && !userRequestsAnotherConfirmation) {
      return null;
    }
    if (/删除|删掉|remove|delete/.test(userOriginal)) {
      return {
        actionName: 'calendar.propose_delete',
        params: {
          label: '确认删除日历事项',
          summary: args.assistantText || '确认后删除指定学习日程。',
          targets: [],
          courseId: args.courseId,
          requiresConfirmation: true,
        },
      };
    }
    if (/修改|调整|顺延|推迟|压缩|改|update|modify|shift|reschedule/.test(userOriginal)) {
      return {
        actionName: 'calendar.propose_update',
        params: {
          label: '确认修改日历',
          summary: args.assistantText || '确认后修改学习日程。',
          courseId: args.courseId,
          requiresConfirmation: true,
        },
      };
    }
    if (/查|查看|搜索|lookup|search/.test(userOriginal)) {
      return {
        actionName: 'calendar.search',
        params: {
          label: '查看学习日程',
          query: args.userText,
          courseId: args.courseId,
        },
      };
    }
    const userRequestsCalendarAdd =
      /(加入|添加|写入|同步|放进|放到|add).{0,18}(日历|日程|calendar|schedule)?/i.test(
        userOriginal,
      );
    const assistantRequestsCalendarAddConfirmation =
      assistantHasConcreteCalendarProposal &&
      wantsConfirmation &&
      !userRejectsCalendarChange(userOriginal);
    if (mentionsCalendar && (wantsConfirmation || userRequestsCalendarAdd)) {
      return {
        actionName: 'calendar.propose_add',
        params: {
          label: '确认加入日历',
          summary: args.assistantText || '确认后把学习计划加入日历。',
          items: [],
          courseId: args.courseId,
          requiresConfirmation: true,
        },
        allowAssistantInitiated: assistantRequestsCalendarAddConfirmation,
      };
    }
  }

  if (userConfirmedExistingAction && !userRequestsAnotherConfirmation) {
    return null;
  }

  if (userMentionsClassroom && wantsConfirmation) {
    return {
      actionName: 'classroom.propose_temporary_explanation',
      params: {
        label: '生成临时课堂',
        topic: args.userText.slice(0, 120),
        summary: args.assistantText || '确认后生成临时课堂讲解。',
        courseId: args.courseId,
        requiresConfirmation: true,
      },
    };
  }

  const userRequestsMemoryWrite =
    /记成|记录|写入|保存|更新.{0,8}(记忆|薄弱点|掌握|待复习)|薄弱点.{0,12}(怎么改|改成|修正|纠正|更新)|记忆.{0,12}(怎么改|改成|修正|纠正|更新)|算.{0,8}(我(的)?)?薄弱点|是否.{0,8}薄弱点|待复习点|write|save|record/i.test(
      userOriginal,
    );
  if (mentionsMemory && userRequestsMemoryWrite) {
    const memoryType = /修正|纠正|改成|怎么改|actually|not .* but/i.test(userOriginal)
      ? 'correction'
      : 'weakness';
    return {
      actionName: 'memory.propose_write',
      params: {
        label: '确认写入记忆',
        summary: args.assistantText || '确认后更新本课程学习记忆。',
        memoryType,
        courseId: args.courseId,
        requiresConfirmation: true,
      },
    };
  }

  const assistantOffersPracticeWorkflow =
    /生成.{0,8}(练习|题目|习题)|设计.{0,8}(练习|题目|习题)|挑选.{0,8}(题|练习)|选择.{0,8}(题|练习)|以下.{0,12}(练习|题目|习题)|practice|exercise|problem/i.test(
      assistantText,
    );
  const assistantRequestsPracticeGeneration =
    /(?:我可以|接下来我可以|可以为你|是否|要不要|你觉得如何).{0,36}(?:生成|出|挑选|选择|设计).{0,24}(?:练习|题目|习题|题库|practice|exercise|problem)/i.test(
      assistantText,
    );
  const userAsksPracticePolicy =
    /如果(之后|以后).{0,20}(练习|题库|题目)|应该怎么处理|才不会假装|不要假装|原则|policy|hypothetical/i.test(
      userOriginal,
    );

  if (
    (userMentionsPractice || assistantRequestsPracticeGeneration) &&
    !userAsksPracticePolicy &&
    (wantsConfirmation || assistantOffersPracticeWorkflow)
  ) {
    return {
      actionName: 'practice.propose_generation',
      params: {
        label: '确认生成练习',
        summary: args.assistantText || '确认后生成针对练习。',
        source: 'mixed',
        courseId: args.courseId,
        requiresConfirmation: true,
      },
      allowAssistantInitiated: assistantRequestsPracticeGeneration && !userMentionsPractice,
    };
  }

  const assistantOffersMemoryWorkflow =
    /记成|记录到|记录为|记录下来|学习记录|记录.{0,12}(薄弱点|困惑|待复习)|写入.{0,8}(记忆|薄弱点|待复习)|保存.{0,8}(记忆|薄弱点|待复习)|更新.{0,12}(记忆|薄弱点|学习记录)|record|save/i.test(
      assistantText,
    );

  if (
    mentionsMemory &&
    (userRequestsMemoryWrite ||
      assistantOffersMemoryWorkflow ||
      (wantsConfirmation && /写入|保存|更新|记录|记成|write|save|record/i.test(original)))
  ) {
    const memoryType = /修正|纠正|改成|怎么改|actually|not .* but/i.test(userOriginal)
      ? 'correction'
      : 'weakness';
    return {
      actionName: 'memory.propose_write',
      params: {
        label: '确认写入记忆',
        summary: args.assistantText || '确认后更新本课程学习记忆。',
        memoryType,
        courseId: args.courseId,
        requiresConfirmation: true,
      },
      allowAssistantInitiated: assistantOffersMemoryWorkflow && !userRequestsMemoryWrite,
    };
  }

  return null;
}

function fallbackTextForActionOnly(actionNames: string[], language?: string): string {
  const english = language === 'en-US';
  const first = actionNames[0] || '';
  if (english) {
    if (first === 'calendar.search') return 'I prepared a schedule lookup for you below.';
    if (first.startsWith('calendar.')) {
      return 'I prepared a calendar change proposal for you below. Please confirm before it is applied.';
    }
    if (first === 'learner_progress.request_confirmation') {
      return 'I need you to confirm your current progress below before I make the plan precise.';
    }
    if (first === 'practice.propose_generation') {
      return 'I prepared a practice-generation proposal for you below. Please confirm before I create it.';
    }
    if (first === 'classroom.propose_temporary_explanation') {
      return 'I can generate a temporary classroom explanation for this. Please confirm below.';
    }
    return 'I prepared a learning action for you below. Please confirm before it is applied.';
  }

  if (first === 'calendar.search') return '我已经准备好下面的日程查找操作。';
  if (first.startsWith('calendar.')) return '我已经准备好日历操作，请在下方确认后再执行。';
  if (first === 'learner_progress.request_confirmation') {
    return '我需要先确认你的学习进度和可用时间，再把计划排准。请在下方确认。';
  }
  if (first === 'practice.propose_generation') {
    return '我已经准备好练习生成方案，请在下方确认后再生成。';
  }
  if (first === 'classroom.propose_temporary_explanation') {
    return '我可以为这个问题生成临时课堂讲解，请在下方确认。';
  }
  return '我已经准备好一个学习操作，请在下方确认后再执行。';
}

function userConfirmationSuppressesAction(userText: string, actionName: string): boolean {
  const confirmed = userConfirmsPreviouslyProposedAction(userText);
  if (!confirmed) return false;
  if (userRequestsAdditionalConfirmationForAction(userText, actionName)) return false;
  if (actionName === 'memory.propose_write')
    return /记忆|薄弱点|掌握|memory|weakness/i.test(userText);
  if (actionName === 'practice.propose_generation')
    return /练习|题库|题目|习题|practice|exercise/i.test(userText);
  if (actionName === 'classroom.propose_temporary_explanation') {
    return /临时课堂|课堂讲解|课堂|classroom|lesson/i.test(userText);
  }
  if (actionName === 'learner_progress.request_confirmation') {
    return /进度|学习状态|确认卡|progress/i.test(userText);
  }
  if (actionName.startsWith('calendar.')) {
    return /日历|日程|calendar|schedule/i.test(userText);
  }
  return false;
}

function userRequestsAdditionalConfirmationForAction(
  userText: string,
  actionName: string,
): boolean {
  if (actionName === 'learner_progress.request_confirmation') return false;
  if (userRejectsRepeatConfirmation(userText)) return false;
  const asksForConfirmation =
    /给我.{0,12}确认|提供.{0,12}确认|先给.{0,12}(确认|按钮|确认卡|确认框)|先让.{0,8}确认|让我.{0,8}确认|确认(按钮|框)|不要直接|confirmation|button|popup/i.test(
      userText,
    );
  if (!asksForConfirmation) return false;
  const onlyDescribesPastConfirmation =
    /已经.{0,16}(确认|同意)|已确认|在确认(框|卡).{0,12}(同意|选择|提交)/i.test(userText) &&
    !/给我|提供|先给|先让|让我|不要直接|button|popup/i.test(userText);
  if (onlyDescribesPastConfirmation) return false;
  if (actionName.startsWith('calendar.')) return /日历|日程|calendar|schedule/i.test(userText);
  if (actionName === 'practice.propose_generation') {
    return /练习|题库|题目|习题|做题|出题|practice|exercise/i.test(userText);
  }
  if (actionName === 'classroom.propose_temporary_explanation') {
    return /临时课堂|课堂讲解|讲解|课堂|classroom|lesson/i.test(userText);
  }
  if (actionName === 'memory.propose_write') {
    return /记忆|薄弱点|掌握|修正|纠正|memory|weakness|mastery/i.test(userText);
  }
  return false;
}

function userRequestsReadOnlyMemoryAnswer(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  const asksReadOnly =
    /你(还)?记得|哪里不会|会了什么|不会什么|为什么(觉得|认为)|引用.{0,8}(证据|记忆)|已确认的(证据|薄弱点|记忆)|(?:基于|根据).{0,24}(刚才|之前|已确认).{0,24}(薄弱点|记忆|weakness|memory)|总结.{0,24}(最近|问过|提问|薄弱|掌握|卡在)|最近.{0,12}(问过|提问)|卡在哪些概念|接下来该补|what.*remember|why.*think/i.test(
      text,
    );
  if (!asksReadOnly) return false;
  return !/写入|更新|修改|改成|记成|记录|保存|纠正|修正|确认写入|write|update|save|correct/i.test(
    text,
  );
}

function calendarTextMatchesActionFamily(userText: string, actionName: string): boolean {
  const text = userText.trim();
  if (!text) return false;

  const mentionsCalendarSurface = /日历|日程|calendar|schedule/i.test(text);
  const mentionsStudyPlanItem =
    /学习计划|复习计划|预习计划|课程计划|原计划|计划安排|学习安排|复习事项|学习块|学习事项|复习块/i.test(
      text,
    );

  if (actionName === 'calendar.search') {
    return (
      mentionsCalendarSurface || (/查|查看|搜索|lookup|search/i.test(text) && mentionsStudyPlanItem)
    );
  }

  if (actionName === 'calendar.propose_add') {
    return (
      mentionsCalendarSurface ||
      /(加入|添加|写入|同步|放进|放到).{0,12}(日历|日程|calendar|schedule)/i.test(text)
    );
  }

  if (actionName === 'calendar.propose_update') {
    return (
      mentionsCalendarSurface ||
      (/(修改|调整|顺延|推迟|压缩|改|update|modify|shift|reschedule)/i.test(text) &&
        mentionsStudyPlanItem)
    );
  }

  if (actionName === 'calendar.propose_delete') {
    return (
      mentionsCalendarSurface ||
      (/(删除|删掉|移除|remove|delete)/i.test(text) && mentionsStudyPlanItem)
    );
  }

  return mentionsCalendarSurface;
}

function userTextMatchesActionFamily(userText: string, actionName: string): boolean {
  if (actionName === 'practice.propose_generation') {
    return /练习|题库|题目|习题|做题|出题|practice|exercise|problem set|quiz/i.test(userText);
  }
  if (actionName.startsWith('calendar.')) {
    return calendarTextMatchesActionFamily(userText, actionName);
  }
  if (actionName === 'learner_progress.request_confirmation') {
    return /进度|学习状态|学到哪里|可用.{0,6}时间|学习时间|复习计划|课程计划|预习计划|考试|progress|available time|study time|review plan|study plan/i.test(
      userText,
    );
  }
  return true;
}

function shouldSuppressCourseChatAction(userText: string, actionName: string): boolean {
  if (userConfirmationSuppressesAction(userText, actionName)) return true;
  if (actionName === 'memory.propose_write' && userRequestsReadOnlyMemoryAnswer(userText)) {
    return true;
  }
  if (!userTextMatchesActionFamily(userText, actionName)) return true;
  return false;
}

// ==================== State Definition ====================

/**
 * LangGraph state annotation for the orchestration graph
 */
const OrchestratorState = Annotation.Root({
  // Input (set once at graph entry)
  messages: Annotation<StatelessChatRequest['messages']>,
  storeState: Annotation<StatelessChatRequest['storeState']>,
  availableAgentIds: Annotation<string[]>,
  maxTurns: Annotation<number>,
  languageModel: Annotation<LanguageModel>,
  thinkingConfig: Annotation<ThinkingConfig | null>,
  discussionContext: Annotation<{ topic: string; prompt?: string } | null>,
  surface: Annotation<StatelessChatRequest['config']['surface']>,
  courseContext: Annotation<CourseChatContext | null>,
  triggerAgentId: Annotation<string | null>,
  userProfile: Annotation<{ nickname?: string; bio?: string } | null>,
  /** Request-scoped agent configs for generated agents (not in the default registry) */
  agentConfigOverrides: Annotation<Record<string, AgentConfig>>,

  // Mutable (updated by nodes)
  currentAgentId: Annotation<string | null>,
  turnCount: Annotation<number>,
  agentResponses: Annotation<AgentTurnSummary[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  whiteboardLedger: Annotation<WhiteboardActionRecord[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  shouldEnd: Annotation<boolean>,
  totalActions: Annotation<number>,
});

type OrchestratorStateType = typeof OrchestratorState.State;

/**
 * Look up an agent config: request-scoped overrides first, then global registry.
 * This keeps the server stateless — generated agent configs travel with the request.
 */
function resolveAgent(state: OrchestratorStateType, agentId: string): AgentConfig | undefined {
  return state.agentConfigOverrides[agentId] ?? useAgentRegistry.getState().getAgent(agentId);
}

function compactText(input: string | undefined, maxLength: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildPlainTextFallbackPrompt(
  agentConfig: AgentConfig,
  courseContext: CourseChatContext | null,
): string {
  const course = courseContext?.course;
  const responseLanguage =
    course?.language === 'en-US'
      ? 'English'
      : course?.language === 'zh-CN'
        ? 'Simplified Chinese'
        : 'the same language as the student';
  const learner = courseContext?.learner;
  const notebooks =
    courseContext?.notebooks
      ?.slice(0, 3)
      .map((notebook, notebookIndex) => {
        const pages = notebook.pages
          .slice(0, 3)
          .map((page) => `   - p.${page.order} ${page.title}: ${compactText(page.digest, 260)}`)
          .join('\n');
        return `${notebookIndex + 1}. ${notebook.name}${pages ? `\n${pages}` : ''}`;
      })
      .join('\n') || 'No relevant notebook excerpts.';
  const problemMatches =
    courseContext?.layeredMemory?.knowledgeMatches
      ?.slice(0, 5)
      .map((match, index) => {
        const tags = match.metadata?.tags?.slice(0, 4).join(', ');
        const notebook = match.metadata?.notebookName;
        return `${index + 1}. ${match.title}${notebook ? ` (${notebook})` : ''}${
          tags ? ` tags=${tags}` : ''
        }`;
      })
      .join('\n') || 'No attached problem-bank matches.';
  const memoryPrompt = compactText(courseContext?.layeredMemory?.prompt, 2400);

  return `You are ${agentConfig.name}, a course tutor.
Answer the student's latest message directly in ${responseLanguage}.
Return plain text only. Do not return JSON, markdown code fences, tool calls, or actions.
If the student asks about memory, plans, weak points, schedules, or problem selection, answer using the evidence below and be explicit when evidence is missing.
Keep course memories isolated to this course; do not update or infer another course's weak points from this course unless the student explicitly asks for a comparison.
If the student asks whether this course affects another course's weak-point judgment, say it should not automatically affect or be written into the other course's record. Explain transferable background separately.
Preserve technical terms; when translating an ambiguous course term, keep the original term in parentheses.
Calculus terminology guardrail: translate "improper integral" as "反常积分 (improper integral)", not "不定积分"; "indefinite integral" is "不定积分".
For problem-bank selection, choose only from the attached problem-bank matches below. If none are attached, say no available problem-bank match is attached for this turn. If you create new practice yourself, label it as self-generated practice and do not call it problem-bank content.

Course:
- name: ${course?.name || 'current course'}
- id: ${course?.id || 'unknown'}
- code: ${course?.courseCode || 'unknown'}
- tags: ${course?.tags?.join(', ') || 'none'}

Learner signals:
- progress: ${learner?.progressLabel || 'unknown'} (${learner?.progressPercent ?? 0}%)
- weak concepts: ${learner?.weakConcepts?.join(', ') || 'none attached'}
- next concepts: ${learner?.nextConcepts?.join(', ') || 'none attached'}
- recent questions: ${learner?.recentQuestions?.slice(0, 5).join(' | ') || 'none attached'}
- recent attempts: ${
    learner?.recentAttempts
      ?.slice(0, 5)
      .map((attempt) => `${attempt.title}: ${attempt.status}`)
      .join(' | ') || 'none attached'
  }

Problem-bank matches:
${problemMatches}

Layered memory summary:
${memoryPrompt || 'No layered memory prompt attached.'}

Notebook excerpts:
${notebooks}`;
}

// ==================== Director Node ====================

/**
 * Unified director: decides which agent speaks next.
 *
 * Strategy varies by agent count:
 *   Single agent — pure code logic, zero LLM calls:
 *     turn 0: dispatch the sole agent
 *     turn 1+: cue user to speak (keeps session active for follow-ups)
 *
 *   Multi agent — LLM-based with code fast-paths:
 *     turn 0 + triggerAgentId: dispatch trigger agent (skip LLM)
 *     otherwise: LLM decides next agent / USER / END
 */
async function directorNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch {
      /* controller closed after abort */
    }
  };
  const isSingleAgent = state.availableAgentIds.length <= 1;

  // ── Turn limit check (applies to both single & multi) ──
  if (state.turnCount >= state.maxTurns) {
    log.info(`[Director] Turn limit reached (${state.turnCount}/${state.maxTurns}), ending`);
    return { shouldEnd: true };
  }

  // ── Single agent: code-only director ──
  if (isSingleAgent) {
    const agentId = state.availableAgentIds[0] || 'default-1';

    if (state.turnCount === 0) {
      // First turn: dispatch the agent
      log.info(`[Director] Single agent: dispatching "${agentId}"`);
      write({ type: 'thinking', data: { stage: 'agent_loading', agentId } });
      return { currentAgentId: agentId, shouldEnd: false };
    }

    // Agent already responded: cue user for follow-up
    log.info(`[Director] Single agent: cueing user after "${agentId}"`);
    write({ type: 'cue_user', data: { fromAgentId: agentId } });
    return { shouldEnd: true };
  }

  // ── Multi agent: fast-path for first turn with trigger ──
  if (state.turnCount === 0 && state.triggerAgentId) {
    const triggerId = state.triggerAgentId;
    if (state.availableAgentIds.includes(triggerId)) {
      log.info(`[Director] First turn: dispatching trigger agent "${triggerId}"`);
      write({
        type: 'thinking',
        data: { stage: 'agent_loading', agentId: triggerId },
      });
      return { currentAgentId: triggerId, shouldEnd: false };
    }
    log.warn(
      `[Director] Trigger agent "${triggerId}" not in available agents, falling through to LLM`,
    );
  }

  // ── Multi agent: LLM-based decision ──
  const agents: AgentConfig[] = state.availableAgentIds
    .map((id) => resolveAgent(state, id))
    .filter((a): a is AgentConfig => a != null);

  if (agents.length === 0) {
    return { shouldEnd: true };
  }

  write({ type: 'thinking', data: { stage: 'director' } });

  const openaiMessages = convertMessagesToOpenAI(state.messages);
  const conversationSummary = summarizeConversation(openaiMessages);

  const prompt = buildDirectorPrompt(
    agents,
    conversationSummary,
    state.agentResponses,
    state.turnCount,
    state.discussionContext,
    state.triggerAgentId,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.storeState.whiteboardOpen,
  );

  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  try {
    const result = await adapter._generate(
      [new SystemMessage(prompt), new HumanMessage('Decide which agent should speak next.')],
      { signal: config.signal } as Record<string, unknown>,
    );

    const content = result.generations[0]?.text || '';
    log.info(`[Director] Raw decision: ${content}`);

    const decision = parseDirectorDecision(content);

    if (decision.shouldEnd || !decision.nextAgentId) {
      log.info('[Director] Decision: END');
      return { shouldEnd: true };
    }

    if (decision.nextAgentId === 'USER') {
      log.info('[Director] Decision: cue USER to speak');
      write({
        type: 'cue_user',
        data: { fromAgentId: state.currentAgentId || undefined },
      });
      return { shouldEnd: true };
    }

    const agentExists = agents.some((a) => a.id === decision.nextAgentId);
    if (!agentExists) {
      log.warn(`[Director] Unknown agent "${decision.nextAgentId}", ending`);
      return { shouldEnd: true };
    }

    write({
      type: 'thinking',
      data: { stage: 'agent_loading', agentId: decision.nextAgentId },
    });

    log.info(`[Director] Decision: dispatch agent "${decision.nextAgentId}"`);
    return {
      currentAgentId: decision.nextAgentId,
      shouldEnd: false,
    };
  } catch (error) {
    log.error('[Director] Error:', error);
    return { shouldEnd: true };
  }
}

function directorCondition(state: OrchestratorStateType): 'agent_generate' | typeof END {
  return state.shouldEnd ? END : 'agent_generate';
}

// ==================== Agent Generate Node ====================

/**
 * Run generation for one agent. Streams agent_start, text_delta,
 * action, and agent_end events via config.writer().
 */
async function runAgentGeneration(
  state: OrchestratorStateType,
  agentId: string,
  config: LangGraphRunnableConfig,
): Promise<{
  contentPreview: string;
  actionCount: number;
  whiteboardActions: WhiteboardActionRecord[];
}> {
  const agentConfig = resolveAgent(state, agentId);
  if (!agentConfig) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch (e) {
      log.warn(`[AgentGenerate] write failed for ${agentId}:`, e);
    }
  };
  const messageId = `assistant-${agentId}-${Date.now()}`;

  write({
    type: 'agent_start',
    data: {
      messageId,
      agentId,
      agentName: agentConfig.name,
      agentAvatar: agentConfig.avatar,
      agentColor: agentConfig.color,
    },
  });

  // Compute effective actions: filter by scene type for defense-in-depth
  // e.g. spotlight/laser stripped for non-slide scenes even if in static allowedActions
  const currentScene = state.storeState.currentSceneId
    ? state.storeState.scenes.find((s) => s.id === state.storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;
  const isCourseChat = state.surface === 'course-chat';
  const effectiveActions = isCourseChat
    ? [...COURSE_CHAT_LEARNING_ACTIONS]
    : getEffectiveActions(agentConfig.allowedActions, sceneType);

  const discussionContext = state.discussionContext || undefined;
  const systemPrompt = buildStructuredPrompt(
    agentConfig,
    state.storeState,
    discussionContext,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.agentResponses,
    {
      surface: state.surface,
      courseContext: state.courseContext || undefined,
    },
  );
  const openaiMessages = convertMessagesToOpenAI(state.messages, agentId);
  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  const lcMessages = [
    new SystemMessage(systemPrompt),
    ...openaiMessages.map((m) =>
      m.role === 'user'
        ? new HumanMessage({ content: toLangChainHumanContent(m.content) })
        : new AIMessage(convertedMessageContentToText(m.content)),
    ),
  ];

  // Ensure the message list ends with a HumanMessage.
  // After agent-aware role mapping, other agents' messages become user role,
  // so trailing AIMessage is less likely. But guard against edge cases
  // (e.g. agent's own previous response is last in history).
  const lastMsg = lcMessages[lcMessages.length - 1];
  if (!lcMessages.some((m) => m instanceof HumanMessage)) {
    lcMessages.push(new HumanMessage('Please begin.'));
  } else if (lastMsg instanceof AIMessage) {
    lcMessages.push(new HumanMessage("It's your turn to speak. Respond from your perspective."));
  }

  const parserState = createParserState();
  let fullText = '';
  let actionCount = 0;
  const emittedActionKeys = new Set<string>();
  const emittedActionNames: string[] = [];
  const latestUserTextForActionSuppression = latestUserText(openaiMessages);
  const whiteboardActions: WhiteboardActionRecord[] = [];

  const normalizeTextDelta = (rawText: string) => {
    let text = rawText.replace(/^>+\s?/gm, '');
    const structuredResidueIndex = text.search(/\{\s*"type"\s*:\s*"(text|action)"/);
    if (structuredResidueIndex >= 0) {
      text = text.slice(0, structuredResidueIndex).trimEnd();
    }
    if (!text) return '';
    if (fullText && text.startsWith(fullText)) {
      text = text.slice(fullText.length);
    }
    if (!text || (text.length > 16 && fullText.endsWith(text))) {
      return '';
    }
    return text;
  };

  const emitParseResult = (parseResult: ReturnType<typeof parseStructuredChunk>) => {
    // Emit events in original interleaved order via the `ordered` array.
    // The ordered array tracks complete items from Step 5 of the parser;
    // trailing partial text deltas (Step 6) are in textChunks but not in ordered.
    let emittedTextCount = 0;
    if (parseResult.ordered.length > 0 || parseResult.textChunks.length > 0) {
      log.debug(
        `[AgentGenerate] Parse: ordered=${parseResult.ordered.length} (${parseResult.ordered.map((e) => e.type).join(',')}), textChunks=${parseResult.textChunks.length}, actions=${parseResult.actions.length}, done=${parseResult.isDone}`,
      );
    }
    for (const entry of parseResult.ordered) {
      if (entry.type === 'text') {
        const rawText = parseResult.textChunks[entry.index];
        if (!rawText) {
          log.warn(
            `[AgentGenerate] Ordered text entry index=${entry.index} but textChunks[${entry.index}] is empty`,
          );
          continue;
        }
        const text = normalizeTextDelta(rawText);
        if (!text) continue;
        fullText += text;
        write({
          type: 'text_delta',
          data: { content: text, messageId },
        });
        emittedTextCount++;
      } else if (entry.type === 'action') {
        const ac = parseResult.actions[entry.index];
        if (!ac) continue;
        const actionKey = `${ac.actionName}:${JSON.stringify(ac.params || {})}`;
        if (emittedActionKeys.has(actionKey)) {
          continue;
        }
        if (
          isCourseChat &&
          shouldSuppressCourseChatAction(latestUserTextForActionSuppression, ac.actionName)
        ) {
          continue;
        }
        if (!effectiveActions.includes(ac.actionName)) {
          log.warn(
            `[AgentGenerate] Agent ${agentConfig.name} attempted disallowed action: ${ac.actionName}, skipping`,
          );
          continue;
        }
        emittedActionKeys.add(actionKey);
        actionCount++;
        // Record whiteboard actions to the ledger
        if (ac.actionName.startsWith('wb_')) {
          whiteboardActions.push({
            actionName: ac.actionName as WhiteboardActionRecord['actionName'],
            agentId,
            agentName: agentConfig.name,
            params: ac.params,
          });
        }
        write({
          type: 'action',
          data: {
            actionId: ac.actionId,
            actionName: ac.actionName,
            params: ac.params,
            agentId,
            messageId,
          },
        });
        emittedActionNames.push(ac.actionName);
      }
    }

    // Emit trailing partial text deltas not covered by ordered
    for (let i = emittedTextCount; i < parseResult.textChunks.length; i++) {
      const rawText = parseResult.textChunks[i];
      if (!rawText) continue;
      const text = normalizeTextDelta(rawText);
      if (!text) continue;
      fullText += text;
      write({
        type: 'text_delta',
        data: { content: text, messageId },
      });
    }
  };

  try {
    for await (const chunk of adapter.streamGenerate(lcMessages, {
      signal: config.signal,
    })) {
      if (chunk.type === 'delta') {
        const parseResult = parseStructuredChunk(chunk.content, parserState);
        emitParseResult(parseResult);
      } else if (chunk.type === 'done') {
        const finalContent = chunk.content.trim();
        if (finalContent) {
          const completeState = createParserState();
          emitParseResult(parseStructuredChunk(finalContent, completeState));
          emitParseResult(finalizeParser(completeState));
        }
      }
    }

    // Finalize: emit any remaining content if the model didn't produce valid JSON
    const finalResult = finalizeParser(parserState);
    emitParseResult(finalResult);

    if (!fullText.trim() && actionCount === 0) {
      log.warn(
        `[AgentGenerate] Empty structured response for ${agentConfig.name}; retrying once with plain-text fallback`,
      );
      const fallbackParserState = createParserState();
      const fallbackPrompt = buildPlainTextFallbackPrompt(agentConfig, state.courseContext);
      const fallbackMessages = [
        new SystemMessage(fallbackPrompt),
        ...openaiMessages.map((m) =>
          m.role === 'user'
            ? new HumanMessage({ content: toLangChainHumanContent(m.content) })
            : new AIMessage(convertedMessageContentToText(m.content)),
        ),
      ];
      for await (const retryChunk of adapter.streamGenerate(fallbackMessages, {
        signal: config.signal,
      })) {
        if (retryChunk.type === 'delta') {
          emitParseResult(parseStructuredChunk(retryChunk.content, fallbackParserState));
        } else if (retryChunk.type === 'done') {
          const finalContent = retryChunk.content.trim();
          if (finalContent) {
            const completeState = createParserState();
            emitParseResult(parseStructuredChunk(finalContent, completeState));
            emitParseResult(finalizeParser(completeState));
          }
        }
      }
      emitParseResult(finalizeParser(fallbackParserState));
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    log.error(`[AgentGenerate] Error for ${agentConfig.name}:`, error);
    write({
      type: 'error',
      data: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  if (isCourseChat) {
    const currentUserText = latestUserText(openaiMessages);
    const inferredAction = inferCourseChatActionFallback({
      userText: currentUserText,
      assistantText: fullText,
      courseId: state.courseContext?.course.id,
    });
    const suppressed =
      inferredAction && shouldSuppressCourseChatAction(currentUserText, inferredAction.actionName);
    const allowAssistantInitiated =
      inferredAction?.allowAssistantInitiated === true &&
      !userRejectsAssistantInitiatedAction(currentUserText, inferredAction.actionName);
    if (
      inferredAction &&
      effectiveActions.includes(inferredAction.actionName) &&
      (!suppressed || allowAssistantInitiated) &&
      !emittedActionNames.includes(inferredAction.actionName)
    ) {
      actionCount++;
      emittedActionNames.push(inferredAction.actionName);
      write({
        type: 'action',
        data: {
          actionId: makeLearningActionId(),
          actionName: inferredAction.actionName,
          params: inferredAction.params,
          agentId,
          messageId,
        },
      });
    }
  }

  if (isCourseChat && actionCount > 0 && !fullText.trim()) {
    const fallbackText = fallbackTextForActionOnly(
      emittedActionNames,
      state.courseContext?.course.language,
    );
    fullText = fallbackText;
    write({
      type: 'text_delta',
      data: { content: fallbackText, messageId },
    });
  }

  write({
    type: 'agent_end',
    data: { messageId, agentId },
  });

  return {
    contentPreview: fullText.slice(0, 300),
    actionCount,
    whiteboardActions,
  };
}

/**
 * Agent generate node — runs one agent, then loops back to director.
 */
async function agentGenerateNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const agentId = state.currentAgentId;
  if (!agentId) {
    return { shouldEnd: true };
  }

  const agentConfig = resolveAgent(state, agentId);
  const result = await runAgentGeneration(state, agentId, config);

  if (!result.contentPreview && result.actionCount === 0) {
    log.warn(
      `[AgentGenerate] Agent "${agentConfig?.name || agentId}" produced empty response (no text, no actions)`,
    );
  }

  return {
    turnCount: state.turnCount + 1,
    totalActions: state.totalActions + result.actionCount,
    agentResponses: [
      {
        agentId,
        agentName: agentConfig?.name || agentId,
        contentPreview: result.contentPreview,
        actionCount: result.actionCount,
        whiteboardActions: result.whiteboardActions,
      },
    ],
    whiteboardLedger: result.whiteboardActions,
    currentAgentId: null,
  };
}

// ==================== Graph Construction ====================

/**
 * Create the orchestration LangGraph StateGraph.
 *
 * Topology:
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ director (loop)
 */
export function createOrchestrationGraph() {
  const graph = new StateGraph(OrchestratorState)
    .addNode('director', directorNode)
    .addNode('agent_generate', agentGenerateNode)
    .addEdge(START, 'director')
    .addConditionalEdges('director', directorCondition, {
      agent_generate: 'agent_generate',
      [END]: END,
    })
    .addEdge('agent_generate', 'director');

  return graph.compile();
}

/**
 * Build initial state for the orchestration graph from a StatelessChatRequest
 * and a pre-created LanguageModel instance.
 */
export function buildInitialState(
  request: StatelessChatRequest,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): typeof OrchestratorState.State {
  // Build request-scoped agent config overrides for generated agents.
  // These travel with each request — no server-side persistence needed.
  const agentConfigOverrides: Record<string, AgentConfig> = {};
  if (request.config.agentConfigs?.length) {
    for (const cfg of request.config.agentConfigs) {
      agentConfigOverrides[cfg.id] = {
        ...cfg,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  const discussionContext = request.config.discussionTopic
    ? {
        topic: request.config.discussionTopic,
        prompt: request.config.discussionPrompt,
      }
    : null;

  const incoming = request.directorState;
  const turnCount = incoming?.turnCount ?? 0;

  return {
    messages: request.messages,
    storeState: request.storeState,
    availableAgentIds: request.config.agentIds,
    maxTurns: turnCount + 1, // Allow exactly one more director→agent cycle
    languageModel,
    thinkingConfig: thinkingConfig ?? null,
    discussionContext,
    surface: request.config.surface || 'classroom',
    courseContext: request.courseContext || null,
    triggerAgentId: request.config.triggerAgentId || null,
    userProfile: request.userProfile || null,
    agentConfigOverrides,
    currentAgentId: null,
    turnCount,
    agentResponses: incoming?.agentResponses ?? [],
    whiteboardLedger: incoming?.whiteboardLedger ?? [],
    shouldEnd: false,
    totalActions: 0,
  };
}
