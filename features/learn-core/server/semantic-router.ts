import { z } from 'zod';

import type { LearnHandoffPacket, LearnRunContext, LearnToolId } from '../domain/types';
import { teachingWorkflowPromptSections } from '../../teaching-orchestrator/domain/fixed-workflows';
import {
  extractJsonObject,
  learnActionKindSchema,
  learnArtifactKindSchema,
  learnTurnRequestSchema,
  learnTurnResponseSchema,
} from './schemas';

const learnRouterToolIdSchema = z.enum([
  'semantic_router',
  'resolve_reference',
  'classify_intent',
  'search_memory',
  'search_schedule',
  'search_course_materials',
  'search_problem_bank',
  'resolve_fixed_review_workflow',
  'plan_review',
  'propose_calendar_change',
  'propose_memory_write',
  'propose_practice_generation',
  'answer_course_question',
]);

export const learnSemanticRouterHandoffSchema = z.object({
  reasonSummary: z.string().trim().min(1).max(1000),
  requiredBehavior: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
  forbiddenBehavior: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
  missingEvidence: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export const learnSemanticRouterOutputSchema = learnTurnResponseSchema.extend({
  selectedToolIds: z.array(learnRouterToolIdSchema).max(12).default([]),
  handoff: learnSemanticRouterHandoffSchema.nullable().optional(),
});

const structuredHandoffSchema = z.object({
  reasonSummary: z.string(),
  requiredBehavior: z.array(z.string()).max(8),
  forbiddenBehavior: z.array(z.string()).max(8),
  missingEvidence: z.array(z.string()).max(8),
});

const structuredScopeHintSchema = z
  .enum([
    'first_half',
    'second_half',
    'next_two_weeks',
    'upcoming',
    'full_course',
    'explicit_topic',
  ])
  .nullable();

const structuredCalendarItemSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  title: z.string(),
  date: z.string(),
  start: z.string(),
  durationMinutes: z.number(),
  courseId: z.string(),
  reason: z.string(),
});

const structuredPlanTaskSchema = z.object({
  title: z.string(),
  kind: z.enum(['review', 'preview', 'practice', 'reading', 'reflection', 'catch_up', 'other']),
  concepts: z.array(z.string()).max(12),
  minutes: z.number(),
  reason: z.string(),
  problemIds: z.array(z.string()).max(20),
});

const structuredReviewFocusPointSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  checkQuestion: z.string(),
});

const structuredReviewSelfCheckSchema = z.object({
  question: z.string(),
  expectedAnswer: z.string(),
  concept: z.string(),
  difficulty: z.enum(['warmup', 'core', 'stretch']),
});

const structuredReviewPracticeBridgeSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    problemIds: z.array(z.string()).max(12),
    generatedPrompts: z.array(z.string()).max(6),
  })
  .nullable();

const structuredArtifactScopeSchema = z.object({
  label: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  eventIds: z.array(z.string()).max(80),
  rationale: z.string(),
});

const structuredArtifactSchema = z.object({
  kind: learnArtifactKindSchema,
  id: z.string(),
  title: z.string(),
  planType: z.enum(['review', 'preview', 'study', 'catch_up']).nullable(),
  tasks: z.array(structuredPlanTaskSchema).max(16),
  calendarDraftItems: z.array(structuredCalendarItemSchema).max(30),
  items: z.array(structuredCalendarItemSchema).max(30),
  scope: structuredArtifactScopeSchema.nullable(),
  learningGoal: z.string(),
  focusPoints: z.array(structuredReviewFocusPointSchema).max(10),
  selfChecks: z.array(structuredReviewSelfCheckSchema).max(8),
  practiceBridge: structuredReviewPracticeBridgeSchema,
  nextSteps: z.array(z.string()).max(8),
  sourceArtifactId: z.string(),
  summary: z.string(),
  reason: z.string(),
});

const structuredActionPayloadSchema = z.object({
  prompt: z.string(),
  query: z.string(),
  topic: z.string(),
  title: z.string(),
  date: z.string(),
  start: z.string(),
  targetId: z.string(),
  planId: z.string(),
  mode: z.string(),
  memoryType: z.string(),
  reason: z.string(),
  summary: z.string(),
  courseId: z.string(),
  minutes: z.number(),
  problemIds: z.array(z.string()).max(50),
  eventIds: z.array(z.string()).max(50),
  focusTopics: z.array(z.string()).max(12),
  evidence: z.array(z.string()).max(12),
  options: z.array(z.string()).max(12),
});

const structuredActionSchema = z.object({
  kind: learnActionKindSchema,
  label: z.string(),
  summary: z.string(),
  payload: structuredActionPayloadSchema,
  confirmation: z.enum(['none', 'required']),
});

const structuredContentScopeSchema = z.object({
  label: z.string(),
  kind: structuredScopeHintSchema,
  basis: z.enum(['user_explicit', 'calendar_semantic', 'memory', 'artifact', 'model_inference']),
  eventIds: z.array(z.string()).max(80),
  startDate: z.string(),
  endDate: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

const structuredExecutionWindowSchema = z.object({
  startDate: z.string(),
  days: z.number().int().min(1).max(60),
  minutesPerDay: z.number().int().min(5).max(600),
  rationale: z.string(),
});

const structuredScopeResolutionSchema = z.object({
  contentScope: structuredContentScopeSchema.nullable(),
  executionWindow: structuredExecutionWindowSchema.nullable(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string(),
});

const structuredPlanningDecisionSchema = z.object({
  intent: z.enum(['none', 'review_plan', 'preview_plan', 'practice_plan']),
  practiceMode: z.enum(['practice', 'quiz']).nullable(),
  scopeHint: structuredScopeHintSchema,
  scopeResolution: structuredScopeResolutionSchema.nullable(),
  isFollowUpToPlan: z.boolean(),
  shouldAskProgressFirst: z.boolean(),
  useSyllabusAsDefaultScope: z.boolean(),
  resolvedPrompt: z.string(),
  focusTopics: z.array(z.string()).max(8),
  constraintsSummary: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export const learnSemanticRouterStructuredOutputSchema = z.object({
  answerMode: z.enum([
    'course_answer',
    'action_only',
    'client_activity_plan',
    'client_practice_plan',
    'none',
  ]),
  replyText: z.string(),
  planningDecision: structuredPlanningDecisionSchema.nullable(),
  directCalls: z.array(structuredActionSchema).max(5),
  proposals: z.array(structuredActionSchema).max(6),
  artifacts: z.array(structuredArtifactSchema).max(8),
  selectedToolIds: z.array(learnRouterToolIdSchema).max(12),
  handoff: structuredHandoffSchema.nullable(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export type LearnSemanticRouterOutput = z.infer<typeof learnSemanticRouterOutputSchema>;
export type LearnSemanticRouterHandoffOutput = z.infer<typeof learnSemanticRouterHandoffSchema>;

function compactJson(value: unknown, maxChars: number) {
  const text = JSON.stringify(value ?? null);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function formatRecentMessages(messages: z.infer<typeof learnTurnRequestSchema>['recentMessages']) {
  if (!messages.length) return 'No recent conversation.';
  return messages
    .map((message, index) => `${index + 1}. ${message.role}: ${message.text}`)
    .join('\n');
}

function toolVocabulary() {
  return [
    '- semantic_router: the AI router itself; always include it in selectedToolIds.',
    '- resolve_reference: identify what "this activity/problem/source/plan" refers to before deciding.',
    '- classify_intent: semantic intent classification.',
    '- search_memory: read learner state, mastery, weakness, teaching-control memory, or prior attempts.',
    '- search_schedule: read syllabus/calendar/deadline/activity context.',
    '- search_course_materials: retrieve uploaded sources, notebooks, source passages, and answer evidence.',
    '- search_problem_bank: retrieve bank-backed questions and problem metadata for targeted practice.',
    '- resolve_fixed_review_workflow: apply the fixed review state machine before planning or answering.',
    '- plan_review: create a review/preview/practice activity plan artifact.',
    '- propose_calendar_change: create a confirmation-required calendar add/update/delete proposal.',
    '- propose_memory_write: create a confirmation-required teaching memory write proposal.',
    '- propose_practice_generation: create a confirmation-required practice/quiz proposal, including course-grounded question generation that persists to the problem bank when no bank-backed selection exists.',
    '- answer_course_question: hand off to the course answerer with explicit evidence and behavior requirements.',
  ].join('\n');
}

export function buildLearnSemanticRouterPrompt(
  ctx: Pick<LearnRunContext, 'input' | 'currentDate'>,
) {
  const input = learnTurnRequestSchema.parse(ctx.input);
  return [
    'You are the AI semantic router for /learn in an intelligent learning platform.',
    'Your job is to choose the next typed route. You do not execute tools, write memory, edit calendar, generate images, or answer course content yourself unless replyText is explicitly for a lightweight action transition.',
    '',
    'Return ONLY one JSON object. Do not wrap it in markdown.',
    'Structured output uses a strict schema: include every object property. Use "" for unused strings, [] for unused arrays, 0 for unused numbers, and null for unused nullable objects. For action payloads, fill the fixed payload fields with empty values when irrelevant.',
    '',
    'Output shape:',
    '{',
    '  "answerMode": "course_answer" | "action_only" | "client_activity_plan" | "client_practice_plan" | "none",',
    '  "replyText": string,',
    '  "planningDecision": {',
    '    "intent": "none" | "review_plan" | "preview_plan" | "practice_plan",',
    '    "practiceMode": "practice" | "quiz" | null,',
    '    "scopeHint": "first_half" | "second_half" | "next_two_weeks" | "upcoming" | "full_course" | "explicit_topic" | null,',
    '    "scopeResolution": {',
    '      "contentScope": { "label": string, "kind": string | null, "basis": "user_explicit" | "calendar_semantic" | "memory" | "artifact" | "model_inference", "eventIds": string[], "startDate": string, "endDate": string, "rationale": string, "confidence": number } | null,',
    '      "executionWindow": { "startDate": string, "days": number, "minutesPerDay": number, "rationale": string } | null,',
    '      "needsClarification": boolean,',
    '      "clarificationQuestion": string',
    '    } | null,',
    '    "isFollowUpToPlan": boolean,',
    '    "shouldAskProgressFirst": boolean,',
    '    "useSyllabusAsDefaultScope": boolean,',
    '    "resolvedPrompt": string,',
    '    "focusTopics": string[],',
    '    "constraintsSummary": string,',
    '    "reason": string,',
    '    "confidence": number',
    '  } | null,',
    '  "directCalls": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "proposals": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "artifacts": [object],',
    '  "selectedToolIds": string[],',
    '  "handoff": { "reasonSummary": string, "requiredBehavior": string[], "forbiddenBehavior": string[], "missingEvidence": string[] } | null,',
    '  "reason": string,',
    '  "confidence": number',
    '}',
    '',
    'Available function tools:',
    toolVocabulary(),
    '',
    'Decision policy:',
    '- Infer semantically from the latest learner message and context. Do not use keyword-only routing.',
    '- The latest learner message overrides recent artifacts when it narrows or corrects scope. When the learner semantically corrects a prior broad plan into a narrower concept, replace the scope with that concept instead of reusing the old plan.',
    '- Review requests are simple: choose the route from the learner intent. Explanation-only concept review is a course_answer handoff, not a plan artifact. Practice or assessment intent uses client_practice_plan or practice.propose_generation grounded in the problem bank. Mixed explanation + practice can use client_activity_plan with a review_plan artifact.',
    '- If the learner gives an explicit topic to review but does not choose explanation, practice, or both, the fixed review workflow asks for mode before the router plans. When the mode is already explicit, preserve scopeHint="explicit_topic", focusTopics containing the topic, and shouldAskProgressFirst=false unless the learner explicitly asks you to choose unknown-scope practice questions.',
    '- If the learner confirms an explanation-only concept review such as "我想听讲解：<target>", use answerMode="course_answer", planningDecision.intent="none", no review_plan/activity_plan/calendar artifact, selectedToolIds including search_memory, search_course_materials, and answer_course_question, and a non-null handoff. Required behavior: teach the target now in the chat in clear Chinese using this internal rhythm: plain intuition -> visible compact "复习地图" when the target is broad -> concrete tiny walk-through -> main operation/state change -> likely confusion or pitfall. For broad data-structure topics, do not stop after traversal/insertion/deletion; the map must include representation, traversal/search, insertion/deletion cases, complexity tradeoffs, variants/classic patterns, and pitfalls, then trace only the most central case in detail. If variants/classic patterns are not central in the attached course context, mention them as "了解层面" in one short bullet. For code topics, walk through the example before code. Forbidden behavior: do not greet by name, do not expose internal labels such as "核心心智模型" or "状态追踪", do not open with missing-context/source caveats, do not interrupt the core analogy/walk-through with citations, and do not offer classroom, calendar, practice, review_plan, or special UI blocks unless the learner explicitly asks for them.',
    '- If the learner confirms practice such as "我想练题目：<target>", prefer client_practice_plan when problemBank.available or problemBank.activeCount > 0: preserve focusTopics, do not ask for progress first, and let the client select real problem-bank items. Use practice.propose_generation with source="generated_from_course" and persistToProblemBank=true when no bank-backed selection exists; use source="self_generated" only when the learner explicitly asks for temporary unpersisted exercises. If the learner confirms "我想讲解和练题都有：<target>", treat it as the executable mixed review request for <target> and include explanation tasks, self-checks, and a practiceBridge in the same review_plan artifact.',
    '- A review_plan artifact is not a schedule stub. It must begin the review now: include learningGoal, useful tasks, focusPoints with short explanations, selfChecks with expected answers, a practiceBridge that uses real problemIds when available or generatedPrompts when no bank item is available, and nextSteps.',
    '- If progress confirmation is truly required, return a learner_progress.request_confirmation proposal or directCall. Do not rely on shouldAskProgressFirst alone; the client will not synthesize a local progress-confirmation flow from that boolean.',
    '- If the learner gives an execution constraint such as "three days", "三天后考试", "20 minutes per day", or a deadline, preserve it in planningDecision.scopeResolution.executionWindow and in the plan artifact calendarDraftItems. Do not fall back to 7 days when the learner gave a different window.',
    '- For answerMode="client_activity_plan", you must include a concise student-facing replyText and at least one durable artifact: activity_plan, review_plan, or calendar_draft. The artifact should contain id, title, planType when applicable, tasks, calendarDraftItems when dates are useful, and scope. For review_plan, also include the review-session fields above. Do not return only planningDecision for client-side reconstruction.',
    '- If the learner asks for bank-backed exercises, quiz, selected questions, or diagnostics, use client_practice_plan when the problem bank has strict usable matches. When the bank has no usable matches or no active questions, propose course-grounded generation with source="generated_from_course" and persistToProblemBank=true; only use source="self_generated" for explicitly temporary unpersisted exercises.',
    '- If the learner asks a normal course question, asks for explanation, or asks for uploaded-source/table/numeric evidence, use answerMode="course_answer". Include selectedToolIds that name the resources the answerer should use and provide a non-null handoff.',
    '- If answerMode is "course_answer", replyText should usually be empty; the course_answerer will produce the content response.',
    '- If the learner asks for current external facts, latest information, package/API/library status, or web evidence outside course materials, use action_only with a read-only web.search directCall.',
    '- If the learner asks to read calendar, memory, syllabus, sources, or recent activity state, use action_only with the appropriate read-only directCall or course_answer handoff when a prose answer is needed.',
    '- Calendar edits, memory writes, image generation, classroom generation, and large practice generation are proposals unless the latest message clearly confirms a prior proposal.',
    '- Durable memory writes store teaching-control signals: mastery, weakness, cause, correction, evidence, and next teaching move. Do not store raw transcript as the main memory.',
    '- If information is missing, route to the best useful next step and name missingEvidence in the handoff or reason. Do not invent a generic default branch.',
    '- The reason field is a concise audit explanation: entry type, selected resources, and why writes were or were not proposed. Do not reveal chain-of-thought.',
    '',
    teachingWorkflowPromptSections(),
    'Other learning workflow recipes:',
    '- Preview: read current progress and upcoming course schedule/materials; output a preview activity_plan that names prerequisites, first concepts, and a lightweight self-check.',
    '- Course question answering: use course_answer handoff with search_course_materials and search_memory; require the answerer to cite local evidence and optionally propose follow-up practice or memory write after the explanation.',
    '',
    'Course and run context:',
    `Course: ${[input.courseCode, input.courseName].filter(Boolean).join(' · ') || input.courseId || 'unknown'}`,
    `Current date: ${ctx.currentDate}`,
    `Syllabus available: ${input.hasSyllabus ? 'yes' : 'no'}`,
    `Student-confirmed progress available: ${input.progressKnown ? 'yes' : 'no'}`,
    `Learner snapshot: ${compactJson(input.learnerSnapshot, 1800)}`,
    `Calendar events: ${compactJson(input.calendarEvents, 10000)}`,
    `Recent plans: ${compactJson(input.recentPlans, 3000)}`,
    `Recent artifacts: ${compactJson(input.recentArtifacts, 7000)}`,
    `Recent proposed actions: ${compactJson(input.recentActions, 5000)}`,
    `Recent calendar activities: ${compactJson(input.recentActivities, 5000)}`,
    `Problem bank: ${compactJson(input.problemBank, 3000)}`,
    `Uploaded sources: ${compactJson(input.sourceUploads, 4000)}`,
    input.layeredMemorySummary
      ? `Layered memory summary:\n${input.layeredMemorySummary}`
      : 'Layered memory summary: none.',
    '',
    'Recent conversation:',
    formatRecentMessages(input.recentMessages),
    '',
    `Latest learner message: ${input.question}`,
  ].join('\n');
}

export function parseLearnSemanticRouterOutput(text: string): LearnSemanticRouterOutput {
  return learnSemanticRouterOutputSchema.parse(extractJsonObject(text));
}

export function selectedToolIdsForTrace(output: LearnSemanticRouterOutput): LearnToolId[] {
  return output.selectedToolIds.filter((toolId): toolId is LearnToolId => toolId !== undefined);
}

export function handoffOutputToPacketArgs(args: {
  output: LearnSemanticRouterOutput;
  evidence: LearnHandoffPacket['evidence'];
}) {
  const handoff = args.output.handoff;
  if (!handoff) return null;
  return {
    from: 'ai_semantic_router',
    to: 'course_answerer',
    intent: 'course_answer' as const,
    reasonSummary: handoff.reasonSummary,
    evidence: args.evidence,
    requiredBehavior: handoff.requiredBehavior,
    forbiddenBehavior: handoff.forbiddenBehavior,
    missingEvidence: handoff.missingEvidence,
  };
}
