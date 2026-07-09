import type { LearnAction, LearnActionConfirmation, LearnActionKind } from './domain/types';

export type LearnClientActionStatus =
  | 'proposed'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type LearnClientActionConfirmation = LearnActionConfirmation | 'optional';

export type LearnClientActionExecutionResult = {
  status: LearnClientActionStatus;
  executor: 'learn-client' | 'server' | 'simulator';
  executedAt: number;
  summary: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  trace?: {
    actionId: string;
    actionKind: LearnActionKind;
    courseId?: string;
    conversationId?: string;
  };
};

export type LearnClientActionEvidence = {
  sourceType:
    | 'notebook'
    | 'memory'
    | 'problem_bank'
    | 'calendar'
    | 'source'
    | 'web'
    | 'user'
    | 'system';
  sourceId?: string;
  title?: string;
  reason?: string;
};

export type LearnClientAction = {
  id: string;
  kind: LearnActionKind;
  label: string;
  summary?: string;
  status?: LearnClientActionStatus;
  confirmation?: LearnClientActionConfirmation;
  payload?: Record<string, unknown>;
  result?: LearnClientActionExecutionResult;
  evidence?: LearnClientActionEvidence[];
};

export type LearnClientMessageWithActions<TAction extends LearnClientAction = LearnClientAction> = {
  text: string;
  learningActions?: TAction[];
};

export type LearnRecentActionForTurn<TAction extends LearnClientAction = LearnClientAction> =
  TAction & {
    messageText?: string;
  };

const CONFIRMATION_REQUIRED_ACTION_KINDS = new Set<LearnActionKind>([
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'memory.propose_write',
  'review_mode.request_choice',
  'image.propose_generation',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
]);

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function learnActionRequiresConfirmation(kind: LearnActionKind): boolean {
  return CONFIRMATION_REQUIRED_ACTION_KINDS.has(kind);
}

export function learnActionToClientAction(args: {
  action: LearnAction;
  id: string;
  defaultConfirmation?: LearnActionConfirmation;
}): LearnClientAction {
  const defaultConfirmation =
    args.defaultConfirmation ||
    (learnActionRequiresConfirmation(args.action.kind) ? 'required' : 'none');
  const requiresConfirmation = args.action.confirmation
    ? args.action.confirmation === 'required'
    : defaultConfirmation === 'required';
  return {
    id: args.id,
    kind: args.action.kind,
    label: args.action.label || args.action.kind,
    summary: args.action.summary,
    status: 'proposed',
    confirmation: requiresConfirmation ? 'required' : 'none',
    payload: payloadRecord(args.action.payload),
  };
}

export function learnActionHasPendingConfirmation(action: LearnClientAction): boolean {
  return action.confirmation === 'required' && (!action.status || action.status === 'proposed');
}

export function learnActionHasExecutionState(action: LearnClientAction): boolean {
  return (
    Boolean(action.result) || ['completed', 'failed', 'cancelled'].includes(action.status || '')
  );
}

export function latestLearningActionsForTurn<TAction extends LearnClientAction>(
  messages: LearnClientMessageWithActions<TAction>[],
  limit = 10,
): Array<LearnRecentActionForTurn<TAction>> {
  const actions: Array<LearnRecentActionForTurn<TAction>> = [];
  for (const message of messages.slice().reverse()) {
    if (!message.learningActions?.length) continue;
    for (const action of message.learningActions) {
      if (!learnActionHasPendingConfirmation(action) && !learnActionHasExecutionState(action)) {
        continue;
      }
      actions.push({
        ...action,
        messageText: message.text.trim().slice(0, 600),
      });
      if (actions.length >= limit) return actions;
    }
  }
  return actions;
}

export function isMemoryRecallQuestion(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/(帮我记住|记下来|记录一下|写入记忆|加入记忆)/.test(normalized)) return false;
  return /(你记得|记得我|记忆里|刚才|薄弱点|哪里不会|不会什么|会了什么|掌握状态|为什么觉得我不会|现在.*不会|当前.*不会)/.test(
    normalized,
  );
}

export function filterLearningActionsForQuestion<TAction extends LearnClientAction>(
  actions: TAction[],
  questionText: string,
): TAction[] {
  if (!actions.length) return actions;
  if (!isMemoryRecallQuestion(questionText)) return actions;
  return actions.filter((action) => action.kind !== 'memory.propose_write');
}

export function hasPendingMemoryWriteAction(actions: LearnClientAction[]): boolean {
  return actions.some(
    (action) =>
      action.kind === 'memory.propose_write' &&
      action.status !== 'completed' &&
      action.status !== 'confirmed',
  );
}

export function neutralizeUnconfirmedMemoryWriteClaim(
  answer: string,
  learningActions: LearnClientAction[],
): string {
  if (!hasPendingMemoryWriteAction(learningActions)) return answer;
  const neutralized = answer
    .replace(/^记住了[，,。]?\s*/u, '我先准备了一条学习记忆候选，等你确认后再写入。')
    .replace(/^已记住[，,。]?\s*/u, '我先准备了一条学习记忆候选，等你确认后再写入。')
    .replace(/^记住这个/u, '把这个作为学习记忆候选')
    .replace(/^记住这点/u, '这点')
    .replace(/记住这点/u, '这点')
    .replace(/我已经记住了/u, '我先准备了一条学习记忆候选')
    .replace(/我会记住/u, '我会在你确认后记录')
    .replace(/已经写入(?:学习)?记忆/u, '已准备为学习记忆候选');
  if (/学习记忆候选|确认后再写入|确认后记录/.test(neutralized)) {
    return neutralized;
  }
  return `我先准备了一条学习记忆候选，等你确认后再写入。\n\n${neutralized}`;
}

export function createLearnActionExecutionResult(
  action: Pick<LearnClientAction, 'id' | 'kind' | 'label' | 'summary' | 'payload'>,
  args: {
    status: LearnClientActionStatus;
    executor?: LearnClientActionExecutionResult['executor'];
    executedAt?: number;
    summary?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    courseId?: string;
    conversationId?: string;
  },
): LearnClientActionExecutionResult {
  return {
    status: args.status,
    executor: args.executor || 'learn-client',
    executedAt: args.executedAt || Date.now(),
    summary: args.summary || action.summary || action.label,
    input: args.input,
    output: args.output,
    error: args.error,
    trace: {
      actionId: action.id,
      actionKind: action.kind,
      courseId: args.courseId,
      conversationId: args.conversationId,
    },
  };
}
