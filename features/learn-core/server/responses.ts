import type {
  LearnAction,
  LearnArtifact,
  LearnPlanningDecision,
  LearnTurnDecision,
} from '../domain/types';

const REQUIRED_CONFIRMATION_ACTIONS = new Set<LearnAction['kind']>([
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'memory.propose_write',
  'review_mode.request_choice',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'image.propose_generation',
]);

export function normalizeLearnAction(action: LearnAction): LearnAction {
  if (!REQUIRED_CONFIRMATION_ACTIONS.has(action.kind)) return action;
  return {
    ...action,
    confirmation: 'required',
    payload: {
      ...(action.payload || {}),
      requiresConfirmation: true,
    },
  };
}

export function createLearnTurnDecision(args: {
  answerMode: LearnTurnDecision['answerMode'];
  replyText?: string;
  planningDecision?: LearnPlanningDecision | null;
  directCalls?: LearnAction[];
  proposals?: LearnAction[];
  artifacts?: LearnArtifact[];
  reason: string;
  confidence?: number;
  trace: LearnTurnDecision['trace'];
}): LearnTurnDecision {
  return {
    answerMode: args.answerMode,
    replyText: args.replyText || '',
    planningDecision: args.planningDecision ?? null,
    directCalls: (args.directCalls || []).map(normalizeLearnAction),
    proposals: (args.proposals || []).map(normalizeLearnAction),
    artifacts: args.artifacts || [],
    reason: args.reason,
    confidence: args.confidence ?? 0.85,
    trace: args.trace,
  };
}

export function coerceLearnTurnDecisionOutput(
  output: Omit<LearnTurnDecision, 'trace'> & { trace?: unknown },
  trace: LearnTurnDecision['trace'],
): LearnTurnDecision {
  return createLearnTurnDecision({
    answerMode: output.answerMode || 'course_answer',
    replyText: output.replyText || '',
    planningDecision: output.planningDecision ?? null,
    directCalls: output.directCalls || [],
    proposals: output.proposals || [],
    artifacts: output.artifacts || [],
    reason: output.reason || 'Returned by AI semantic router.',
    confidence: typeof output.confidence === 'number' ? output.confidence : 0.55,
    trace,
  });
}
