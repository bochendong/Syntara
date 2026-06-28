import { z } from 'zod';

import type { LearnTurnDecision } from '../domain/types';
import { learnPlanningDecisionSchema, learnTurnMessageSchema } from './schemas';

export const compatPlanningIntentRequestSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  recentMessages: z.array(learnTurnMessageSchema).max(10).default([]),
  hasSyllabus: z.boolean().default(false),
  progressKnown: z.boolean().default(false),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
});

export const compatPlanningIntentResponseSchema = learnPlanningDecisionSchema;

export function compatPlanningIntentInputToLearnTurnInput(
  input: z.infer<typeof compatPlanningIntentRequestSchema>,
) {
  return {
    question: input.question,
    recentMessages: input.recentMessages,
    courseName: input.courseName,
    courseCode: input.courseCode,
    hasSyllabus: input.hasSyllabus,
    progressKnown: input.progressKnown,
    learnerSnapshot: { progressKnown: input.progressKnown },
    calendarEvents: [],
    recentPlans: [],
    recentArtifacts: [],
    recentActions: [],
    recentActivities: [],
    problemBank: { available: false, activeCount: 0, samples: [] },
    sourceUploads: [],
    layeredMemorySummary: '',
  };
}

function emptyPlanningIntentResponse(): z.infer<typeof compatPlanningIntentResponseSchema> {
  return {
    intent: 'none',
    practiceMode: null,
    scopeHint: null,
    isFollowUpToPlan: false,
    shouldAskProgressFirst: false,
    useSyllabusAsDefaultScope: false,
    resolvedPrompt: '',
    focusTopics: [],
    constraintsSummary: '',
    reason: 'AI semantic router did not return a planning intent.',
    confidence: 0.65,
  };
}

export function planningDecisionToPlanningIntentResponse(
  decision: Pick<LearnTurnDecision, 'planningDecision' | 'reason' | 'confidence'>,
): z.infer<typeof compatPlanningIntentResponseSchema> {
  const planningDecision = decision.planningDecision;
  if (!planningDecision || planningDecision.intent === 'none') return emptyPlanningIntentResponse();
  return {
    intent: planningDecision.intent,
    practiceMode: planningDecision.practiceMode || null,
    scopeHint: planningDecision.scopeHint || null,
    isFollowUpToPlan: planningDecision.isFollowUpToPlan === true,
    shouldAskProgressFirst: planningDecision.shouldAskProgressFirst === true,
    useSyllabusAsDefaultScope: planningDecision.useSyllabusAsDefaultScope === true,
    resolvedPrompt: planningDecision.resolvedPrompt || '',
    focusTopics: planningDecision.focusTopics || [],
    constraintsSummary: planningDecision.constraintsSummary || '',
    reason: planningDecision.reason || decision.reason,
    confidence:
      typeof planningDecision.confidence === 'number'
        ? planningDecision.confidence
        : decision.confidence,
  };
}
