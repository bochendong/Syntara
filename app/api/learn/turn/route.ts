import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const turnMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().max(2500),
});

const learningActionKindSchema = z.enum([
  'calendar.search',
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'calendar.start_recent',
  'memory.search',
  'memory.propose_write',
  'web.search',
  'learner_progress.request_confirmation',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'image.propose_generation',
]);

const learningActionSchema = z.object({
  kind: learningActionKindSchema,
  label: z.string().trim().max(120),
  summary: z.string().trim().max(800).optional().default(''),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  confirmation: z.enum(['none', 'required']).optional(),
});

const artifactSchema = z
  .object({
    kind: z.enum([
      'activity_plan',
      'review_plan',
      'calendar_draft',
      'answer_evidence',
      'web_search_result',
      'image_prompt_draft',
      'memory_candidate',
    ]),
  })
  .passthrough();

const scopeHintSchema = z.enum([
  'first_half',
  'second_half',
  'next_two_weeks',
  'upcoming',
  'full_course',
  'explicit_topic',
]);

function normalizeScopeHint(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (scopeHintSchema.options.includes(normalized as (typeof scopeHintSchema.options)[number])) {
    return normalized;
  }
  if (/first|front|前半/.test(normalized)) return 'first_half';
  if (/second|back|后半/.test(normalized)) return 'second_half';
  if (/two.*week|2.*week|两周|next_two/.test(normalized)) return 'next_two_weeks';
  if (/upcoming|next|接下来|近期/.test(normalized)) return 'upcoming';
  if (/full|whole|entire|整门|全/.test(normalized)) return 'full_course';
  if (/topic|chapter|unit|concept|主题|章节|到_/.test(normalized)) return 'explicit_topic';
  return null;
}

const tolerantScopeHintSchema = z.preprocess(
  normalizeScopeHint,
  scopeHintSchema.nullable().optional(),
);

const nullableStringSchema = (max: number) =>
  z.preprocess(
    (value) => (value == null ? '' : value),
    z.string().trim().max(max).optional().default(''),
  );

const nullableNumberSchema = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value == null ? undefined : value),
    z.number().min(min).max(max).optional().default(fallback),
  );

function normalizeScopeBasis(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    ['user_explicit', 'calendar_semantic', 'memory', 'artifact', 'fallback'].includes(normalized)
  ) {
    return normalized;
  }
  if (/user|student|explicit|用户|学生|明确/.test(normalized)) return 'user_explicit';
  if (/calendar|syllabus|schedule|semantic|日历|课表|大纲|时间/.test(normalized)) {
    return 'calendar_semantic';
  }
  if (/memory|记忆/.test(normalized)) return 'memory';
  if (/artifact|draft|草稿/.test(normalized)) return 'artifact';
  return 'fallback';
}

const scopeResolutionSchema = z
  .object({
    contentScope: z
      .object({
        label: nullableStringSchema(160),
        kind: tolerantScopeHintSchema,
        basis: z
          .preprocess(
            normalizeScopeBasis,
            z.enum(['user_explicit', 'calendar_semantic', 'memory', 'artifact', 'fallback']),
          )
          .default('fallback'),
        eventIds: z.array(z.string().trim().max(200)).max(80).default([]),
        startDate: nullableStringSchema(32),
        endDate: nullableStringSchema(32),
        rationale: nullableStringSchema(800),
        confidence: nullableNumberSchema(0.5, 0, 1),
      })
      .nullable()
      .optional(),
    executionWindow: z
      .object({
        startDate: nullableStringSchema(32),
        days: z.preprocess(
          (value) => (value == null ? undefined : value),
          z.number().int().min(1).max(60).optional().default(7),
        ),
        minutesPerDay: z.preprocess(
          (value) => (value == null ? undefined : value),
          z.number().int().min(5).max(600).optional().default(45),
        ),
        rationale: nullableStringSchema(500),
      })
      .nullable()
      .optional(),
    needsClarification: z.boolean().default(false),
    clarificationQuestion: nullableStringSchema(300),
  })
  .nullable()
  .optional();

const planningIntentValues = ['none', 'review_plan', 'preview_plan', 'practice_plan'] as const;

const planningDecisionSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return planningIntentValues.includes(record.intent as (typeof planningIntentValues)[number])
      ? record
      : { ...record, intent: 'none' };
  },
  z.object({
    intent: z.enum(['none', 'review_plan', 'preview_plan', 'practice_plan']).default('none'),
    practiceMode: z.enum(['practice', 'quiz']).nullable().optional(),
    scopeHint: tolerantScopeHintSchema,
    scopeResolution: scopeResolutionSchema,
    isFollowUpToPlan: z.boolean().default(false),
    shouldAskProgressFirst: z.boolean().default(false),
    useSyllabusAsDefaultScope: z.boolean().default(false),
    resolvedPrompt: z.string().trim().max(4000).default(''),
    focusTopics: z.array(z.string().trim().max(120)).max(8).default([]),
    constraintsSummary: z.string().trim().max(500).default(''),
    reason: z.string().trim().max(800).default(''),
    confidence: z.number().min(0).max(1).default(0.5),
  }),
);

const learnTurnRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  recentMessages: z.array(turnMessageSchema).max(12).default([]),
  courseId: z.string().trim().max(200).optional(),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
  hasSyllabus: z.boolean().default(false),
  progressKnown: z.boolean().default(false),
  learnerSnapshot: z.unknown().optional(),
  calendarEvents: z.array(z.record(z.string(), z.unknown())).max(200).default([]),
  recentPlans: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  recentArtifacts: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
  recentActions: z.array(z.record(z.string(), z.unknown())).max(10).default([]),
  recentActivities: z.array(z.record(z.string(), z.unknown())).max(10).default([]),
  sourceUploads: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
  layeredMemorySummary: z.string().trim().max(4000).optional().default(''),
});

const learnTurnResponseSchema = z.object({
  answerMode: z
    .enum(['course_answer', 'action_only', 'client_activity_plan', 'client_practice_plan', 'none'])
    .default('course_answer'),
  replyText: z.string().trim().max(3500).default(''),
  planningDecision: planningDecisionSchema.optional().nullable(),
  directCalls: z.array(learningActionSchema).max(5).default([]),
  proposals: z.array(learningActionSchema).max(6).default([]),
  artifacts: z.array(artifactSchema).max(8).default([]),
  reason: z.string().trim().max(1000).default(''),
  confidence: z.number().min(0).max(1).default(0.5),
});

function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonrepair(candidate));
}

function compactJson(value: unknown, maxChars: number) {
  const text = JSON.stringify(value ?? null);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function formatRecentMessages(messages: z.infer<typeof turnMessageSchema>[]) {
  if (!messages.length) return 'No recent conversation.';
  return messages
    .map((message, index) => `${index + 1}. ${message.role}: ${message.text}`)
    .join('\n');
}

function buildPrompt(input: z.infer<typeof learnTurnRequestSchema>) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return [
    'You are the /learn semantic turn planner for an intelligent learning platform.',
    'Plan the next turn using typed actions and durable artifacts. Do not execute writes or expensive generations.',
    'Infer intent semantically. Do not rely on keyword-only rules.',
    '',
    'Return ONLY one JSON object with this exact shape:',
    '{',
    '  "answerMode": "course_answer" | "action_only" | "client_activity_plan" | "client_practice_plan" | "none",',
    '  "replyText": string,',
    '  "planningDecision": {',
    '    "intent": "none" | "review_plan" | "preview_plan" | "practice_plan",',
    '    "scopeHint": "first_half" | "second_half" | "next_two_weeks" | "upcoming" | "full_course" | "explicit_topic" | null,',
    '    "scopeResolution": {',
    '      "contentScope": { "label": string, "kind": string | null, "basis": string, "eventIds": string[], "startDate": string, "endDate": string, "rationale": string, "confidence": number } | null,',
    '      "executionWindow": { "startDate": string, "days": number, "minutesPerDay": number, "rationale": string } | null,',
    '      "needsClarification": boolean,',
    '      "clarificationQuestion": string',
    '    } | null,',
    '    "...": "other compatible planning fields"',
    '  } | null,',
    '  "directCalls": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "proposals": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "artifacts": [object],',
    '  "reason": string,',
    '  "confidence": number',
    '}',
    '',
    'Action policy:',
    '- Read-only direct calls: calendar.search, calendar.start_recent, memory.search, web.search.',
    '- State-changing or costly actions require proposals unless the latest message is clearly confirming a previously proposed action: calendar.propose_add/update/delete, memory.propose_write, practice.propose_generation, classroom.propose_temporary_explanation, image.propose_generation.',
    '- The AI never claims a write/generation happened. Only the executor can say that after success.',
    '- If the learner asks to start/open/continue the nearest, recent, next, or today activity and recentActivities has items, use calendar.start_recent directCalls with payload.activityId. Do not create a new plan.',
    '- If the learner confirms a recent required action, return the same action in directCalls with confirmation="none".',
    '- If the learner asks to add the latest plan to calendar, use recentArtifacts calendar_draft/activity_plan calendarDraftItems or a recent calendar.propose_add action. Do not reconstruct from prose if artifacts exist.',
    '- Calendar delete/update must target explicit event ids when possible. If ambiguous, use calendar.search/open calendar rather than guessing.',
    '- Web search is direct only for latest/current/external information. It must show sources after execution.',
    '- Image generation always requires confirmation.',
    '- Memory writes store teaching-control signals only: mastery, weakness, error cause, next teaching move, correction. Do not store raw transcript as the main memory.',
    '',
    'Planning policy:',
    '- Review/preview/activity planning is not practice generation. Use client_activity_plan with planningDecision intent review_plan or preview_plan.',
    '- Activity plans may include knowledge review, short exercises, reading, catch-up, and reflection. They are not problem-bank practice cards.',
    '- Only use practice_plan / practice.propose_generation when the learner explicitly asks for questions, exercises, problem-bank selection, quiz, or doing problems.',
    '- Separate contentScope from executionWindow. contentScope answers "what course material is covered"; executionWindow answers "when the learner will do the work".',
    '- Current date may set executionWindow.startDate. It must NOT rewrite a user content scope such as first half of term, before Test 2, through improper integrals, chapters 1-4, or previous units into "upcoming".',
    '- When the learner gives a scope phrase and syllabus/calendar events are available, resolve contentScope semantically from the full calendar timeline. Include matching eventIds whenever possible, plus startDate/endDate and a short rationale.',
    '- Set useSyllabusAsDefaultScope=true when the client can build a provisional activity plan from the resolved syllabus contentScope. This does not mean "upcoming"; the selected contentScope controls the material.',
    '- If no explicit content scope is provided, choose the best provisional scope from syllabus, memory, artifacts, or recent context and label it clearly. Ask for clarification only when the ambiguity would materially change the plan.',
    '- If no syllabus/progress evidence exists and the plan depends on missing progress/time, use learner progress confirmation only when needed. Available time may be defaulted for a draft plan unless the learner asks for a precise load.',
    '',
    'Answer-grounding policy:',
    '- For normal course questions, answerMode="course_answer" and usually no replyText. The course answerer will use uploaded sources, notebook excerpts, problem bank evidence, and layered memory.',
    '- If source/table/numeric details are requested, let course_answer handle it with source evidence unless a web search is needed.',
    '- If the learner exposes a durable weakness while asking a course question, you may include memory.propose_write in proposals while keeping answerMode="course_answer" so the answer still happens.',
    '',
    `Course: ${[input.courseCode, input.courseName].filter(Boolean).join(' · ') || input.courseId || 'unknown'}`,
    `Current date: ${today}`,
    `Syllabus available: ${input.hasSyllabus ? 'yes' : 'no'}`,
    `Student-confirmed progress available: ${input.progressKnown ? 'yes' : 'no'}`,
    `Learner snapshot: ${compactJson(input.learnerSnapshot, 1800)}`,
    `Calendar events (full available course timeline, not only upcoming): ${compactJson(input.calendarEvents, 10000)}`,
    `Recent plans: ${compactJson(input.recentPlans, 3000)}`,
    `Recent artifacts: ${compactJson(input.recentArtifacts, 7000)}`,
    `Recent proposed actions: ${compactJson(input.recentActions, 5000)}`,
    `Recent calendar activities: ${compactJson(input.recentActivities, 5000)}`,
    `Uploaded sources: ${compactJson(input.sourceUploads, 4000)}`,
    input.layeredMemorySummary
      ? `Layered memory summary:\n${input.layeredMemorySummary}`
      : 'Layered memory summary: none.',
    '',
    'Recent conversation:',
    formatRecentMessages(input.recentMessages),
    '',
    `Latest student message: ${input.question}`,
  ].join('\n');
}

function normalizeLearnTurnResponse(
  parsed: z.infer<typeof learnTurnResponseSchema>,
): z.infer<typeof learnTurnResponseSchema> {
  const planningIntent = parsed.planningDecision?.intent || 'none';
  if (
    (parsed.answerMode === 'client_activity_plan' ||
      parsed.answerMode === 'client_practice_plan') &&
    planningIntent === 'none' &&
    parsed.directCalls.length === 0 &&
    parsed.proposals.length === 0 &&
    parsed.artifacts.length === 0
  ) {
    return {
      ...parsed,
      answerMode: 'course_answer',
      replyText: '',
      planningDecision: null,
    };
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/learn/turn',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = learnTurnRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid learn turn request', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const { model } = await resolveModelFromHeaders(request, {
          allowOpenAIModelOverride: true,
        });
        const result = await generateText({
          model,
          temperature: 0,
          prompt: buildPrompt(payload.data),
        });
        const parsed = normalizeLearnTurnResponse(
          learnTurnResponseSchema.parse(extractJsonObject(result.text)),
        );

        return NextResponse.json(parsed);
      }),
    {
      operationCode: 'learn_turn_runtime',
      chargeReason: '学习页回合规划',
    },
  );
}
