import { z } from 'zod';

import type { LearnHandoffPacket, LearnRunContext, LearnToolId } from '../domain/types';
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
    '- plan_review: create a review/preview/practice activity plan artifact.',
    '- propose_calendar_change: create a confirmation-required calendar add/update/delete proposal.',
    '- propose_memory_write: create a confirmation-required teaching memory write proposal.',
    '- propose_practice_generation: create a confirmation-required bank-backed practice/quiz proposal.',
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
    '- The latest learner message overrides recent artifacts when it narrows or corrects scope. If the learner says they only want linked list after a broader plan, replace the scope with linked list instead of reusing the old plan.',
    '- Review requests are simple: choose either concept review or practice. If the learner says "复习/review <topic>" without asking for questions, use concept review: answerMode="client_activity_plan", planningDecision.intent="review_plan", and one review_plan artifact with at least title and tasks. If the learner asks to "刷题/出题/选题/quiz/practice", use client_practice_plan or practice.propose_generation grounded in the problem bank.',
    '- If the learner gives an explicit topic to review, build a client_activity_plan with planningDecision.intent="review_plan", scopeHint="explicit_topic", focusTopics containing the topic, and shouldAskProgressFirst=false unless the learner explicitly asks you to choose unknown-scope practice questions. Example: "我需要复习 linked list" means arrange linked-list review now.',
    '- A minimal concept-review artifact is enough. In the strict artifact shape, set kind="review_plan", planType="review", tasks to 1-3 useful review tasks, calendarDraftItems/items to [], scope to {"label":"linked list","startDate":"","endDate":"","eventIds":[],"rationale":"The learner explicitly asked for linked list."}, sourceArtifactId/summary/reason to short strings.',
    '- If progress confirmation is truly required, return a learner_progress.request_confirmation proposal or directCall. Do not rely on shouldAskProgressFirst alone; the client will not synthesize a local progress-confirmation flow from that boolean.',
    '- If the learner gives an execution constraint such as "three days", "三天后考试", "20 minutes per day", or a deadline, preserve it in planningDecision.scopeResolution.executionWindow and in the plan artifact calendarDraftItems. Do not fall back to 7 days when the learner gave a different window.',
    '- For answerMode="client_activity_plan", you must include a concise student-facing replyText and at least one durable artifact: activity_plan, review_plan, or calendar_draft. The artifact should contain id, title, planType when applicable, tasks, calendarDraftItems when dates are useful, and scope. Do not return only planningDecision for client-side reconstruction.',
    '- If the learner asks for bank-backed exercises, quiz, selected questions, or diagnostics, use client_practice_plan or a confirmation-required practice.propose_generation proposal grounded in problem-bank availability.',
    '- If the learner asks a normal course question, asks for explanation, or asks for uploaded-source/table/numeric evidence, use answerMode="course_answer". Include selectedToolIds that name the resources the answerer should use and provide a non-null handoff.',
    '- If answerMode is "course_answer", replyText should usually be empty; the course_answerer will produce the content response.',
    '- If the learner asks for current external facts, latest information, package/API/library status, or web evidence outside course materials, use action_only with a read-only web.search directCall.',
    '- If the learner asks to read calendar, memory, syllabus, sources, or recent activity state, use action_only with the appropriate read-only directCall or course_answer handoff when a prose answer is needed.',
    '- Calendar edits, memory writes, image generation, classroom generation, and large practice generation are proposals unless the latest message clearly confirms a prior proposal.',
    '- Durable memory writes store teaching-control signals: mastery, weakness, cause, correction, evidence, and next teaching move. Do not store raw transcript as the main memory.',
    '- If information is missing, route to the best useful next step and name missingEvidence in the handoff or reason. Do not invent a generic default branch.',
    '- The reason field is a concise audit explanation: entry type, selected resources, and why writes were or were not proposed. Do not reveal chain-of-thought.',
    '',
    'Learning workflow recipes:',
    '- Explicit topic review: classify concept-review vs practice; read memory signals; read schedule/deadline context; inspect problem-bank availability; then output a review_plan artifact for concept review or a practice proposal for刷题.',
    '- Exam preparation: identify exam/deadline and remaining days; read memory weaknesses and recent attempts; inspect schedule load; inspect problem bank; output a calendar-aware activity_plan/review_plan and practice proposal when questions are available.',
    '- Concept explanation: use course_answer handoff with search_course_materials and search_memory; require the answerer to explain the concept, check prerequisites, and optionally propose follow-up practice/memory write after the explanation.',
    '- Review without explicit scope: read memory, current progress, schedule, and recent artifacts; if a useful scope can be inferred, propose it with evidence; if not, return learner_progress.request_confirmation rather than guessing a full-course plan.',
    '- Preview: read current progress and upcoming course schedule/materials; output a preview activity_plan that names prerequisites, first concepts, and a lightweight self-check.',
    '- Practice request: inspect problem bank and recent attempts first; if bank-backed questions exist, use client_practice_plan or practice.propose_generation; if not, state the missing problem bank instead of inventing bank questions.',
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
