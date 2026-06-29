import type {
  LearnAction,
  LearnArtifact,
  LearnEvidenceLink,
  LearnHandoffPacket,
  LearnPlanningDecision,
  LearnPlanningScopeHint,
  LearnScopeResolution,
  LearnTrace,
  LearnTurnAnswerMode,
  LearnTurnMessage,
} from './domain/types';

export type LearnClientPlanningIntent =
  | {
      kind: 'practice_plan';
      mode: 'practice' | 'quiz';
    }
  | {
      kind: 'review_plan';
    }
  | {
      kind: 'preview_plan';
    };

export type LearnClientPlanningDecision = {
  intent: LearnClientPlanningIntent;
  scopeHint: LearnPlanningScopeHint | null;
  scopeResolution: LearnScopeResolution;
  isFollowUpToPlan: boolean;
  shouldAskProgressFirst: boolean;
  useSyllabusAsDefaultScope: boolean;
  resolvedPrompt: string;
  focusTopics: string[];
  constraintsSummary: string;
  reason: string;
  confidence: number;
};

export type LearnAnswererHandoffEvidence = {
  sourceType: string;
  sourceId?: string;
  title?: string;
  quoteOrSummary: string;
  supports: string;
  confidence?: number;
};

export type LearnAnswererHandoff = {
  runId: string;
  intent: string;
  reasonSummary: string;
  evidence: LearnAnswererHandoffEvidence[];
  requiredBehavior: string[];
  forbiddenBehavior: string[];
  missingEvidence: string[];
};

export type LearnTurnClientResponse = {
  answerMode?: LearnTurnAnswerMode;
  replyText?: string;
  planningDecision?: LearnPlanningDecision | null;
  directCalls?: LearnAction[];
  proposals?: LearnAction[];
  artifacts?: LearnArtifact[];
  reason?: string;
  confidence?: number;
  trace?: Partial<LearnTrace> & {
    handoffs?: Array<
      Partial<Omit<LearnHandoffPacket, 'evidence'>> & {
        evidence?: Array<Partial<LearnEvidenceLink>>;
      }
    >;
  };
};

export type { LearnPlanningScopeHint, LearnScopeResolution, LearnTurnMessage };

export function planningDecisionHasResolvedSyllabusScope(
  scopeResolution: LearnScopeResolution | undefined,
): boolean {
  const contentScope = scopeResolution?.contentScope;
  if (!contentScope) return false;
  return Boolean(
    contentScope.eventIds?.length ||
    contentScope.startDate?.trim() ||
    contentScope.endDate?.trim() ||
    contentScope.kind ||
    contentScope.label?.trim(),
  );
}

export function planningDecisionFromLearnTurn(
  response: LearnTurnClientResponse | null,
  fallbackQuestion: string,
): LearnClientPlanningDecision | null {
  const decision = response?.planningDecision;
  if (!decision || decision.intent === 'none') return null;
  const intent =
    decision.intent === 'practice_plan'
      ? ({ kind: 'practice_plan', mode: decision.practiceMode || 'practice' } as const)
      : decision.intent === 'preview_plan'
        ? ({ kind: 'preview_plan' } as const)
        : decision.intent === 'review_plan'
          ? ({ kind: 'review_plan' } as const)
          : null;
  if (!intent) return null;
  return {
    intent,
    scopeHint: decision.scopeHint || null,
    scopeResolution: decision.scopeResolution || null,
    isFollowUpToPlan: decision.isFollowUpToPlan === true,
    shouldAskProgressFirst: decision.shouldAskProgressFirst === true,
    useSyllabusAsDefaultScope: decision.useSyllabusAsDefaultScope === true,
    resolvedPrompt: decision.resolvedPrompt?.trim() || fallbackQuestion,
    focusTopics: (decision.focusTopics || []).map((topic) => topic.trim()).filter(Boolean),
    constraintsSummary: decision.constraintsSummary?.trim() || '',
    reason: decision.reason?.trim() || '',
    confidence: typeof decision.confidence === 'number' ? decision.confidence : 0.5,
  };
}

export function answererHandoffFromLearnTurn(
  response: LearnTurnClientResponse | null,
): LearnAnswererHandoff | undefined {
  const trace = response?.trace;
  const handoff = trace?.handoffs?.find((item) => item?.to === 'course_answerer');
  if (!trace?.runId || !handoff) return undefined;
  return {
    runId: trace.runId,
    intent: handoff.intent || 'course_answer',
    reasonSummary: handoff.reasonSummary || response?.reason || 'Learn-core routed this turn.',
    evidence: (handoff.evidence || [])
      .map((item) => ({
        sourceType: item.sourceType || 'system',
        sourceId: item.sourceId,
        title: item.title,
        quoteOrSummary: item.quoteOrSummary || '',
        supports: item.supports || '',
        confidence: item.confidence,
      }))
      .filter((item) => item.quoteOrSummary || item.supports)
      .slice(0, 8),
    requiredBehavior: (handoff.requiredBehavior || []).filter(Boolean).slice(0, 8),
    forbiddenBehavior: (handoff.forbiddenBehavior || []).filter(Boolean).slice(0, 8),
    missingEvidence: (handoff.missingEvidence || []).filter(Boolean).slice(0, 8),
  };
}
