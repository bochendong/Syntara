import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

export const learnTurnMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().max(2500),
});

export const learnActionKindSchema = z.enum([
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

function normalizeLearningActionKind(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    learnActionKindSchema.options.includes(value as (typeof learnActionKindSchema.options)[number])
  ) {
    return value;
  }
  if (/calendar/.test(normalized) && /(delete|remove|删除|移除)/.test(normalized)) {
    return 'calendar.propose_delete';
  }
  if (
    /calendar/.test(normalized) &&
    /(update|modify|shift|reschedule|顺延|修改|调整)/.test(normalized)
  ) {
    return 'calendar.propose_update';
  }
  if (/calendar/.test(normalized) && /(add|create|加入|添加)/.test(normalized)) {
    return 'calendar.propose_add';
  }
  if (/calendar/.test(normalized) && /(search|find|lookup|查|找)/.test(normalized)) {
    return 'calendar.search';
  }
  if (/memory/.test(normalized) && /(write|save|update|correct|记|存|改)/.test(normalized)) {
    return 'memory.propose_write';
  }
  if (/memory/.test(normalized) && /(search|read|recall|查|读|记得)/.test(normalized)) {
    return 'memory.search';
  }
  if (/practice|quiz|problem/.test(normalized)) return 'practice.propose_generation';
  if (/classroom|lecture|explanation/.test(normalized)) {
    return 'classroom.propose_temporary_explanation';
  }
  if (/image|diagram|visual|图/.test(normalized)) return 'image.propose_generation';
  if (/web|search|网页|联网/.test(normalized)) return 'web.search';
  return value;
}

export const learnActionSchema = z.object({
  kind: z.preprocess(normalizeLearningActionKind, learnActionKindSchema),
  label: z.string().trim().max(120),
  summary: z.string().trim().max(800).optional().default(''),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  confirmation: z.enum(['none', 'required']).optional(),
});

export const learnArtifactKindSchema = z.enum([
  'activity_plan',
  'review_plan',
  'calendar_draft',
  'active_activity',
  'answer_evidence',
  'web_search_result',
  'image_prompt_draft',
  'memory_candidate',
]);

function normalizeArtifactKind(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    learnArtifactKindSchema.options.includes(
      normalized as (typeof learnArtifactKindSchema.options)[number],
    )
  ) {
    return normalized;
  }
  if (/calendar|schedule/.test(normalized)) return 'calendar_draft';
  if (/activity|review|plan/.test(normalized)) return 'activity_plan';
  if (/memory|weakness|mastery/.test(normalized)) return 'memory_candidate';
  if (/web|search/.test(normalized)) return 'web_search_result';
  if (/image|prompt|diagram|visual/.test(normalized)) return 'image_prompt_draft';
  return 'answer_evidence';
}

export const learnArtifactSchema = z
  .object({
    kind: z.preprocess(normalizeArtifactKind, learnArtifactKindSchema),
  })
  .passthrough();

export const learnScopeHintSchema = z.enum([
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
  if (
    learnScopeHintSchema.options.includes(
      normalized as (typeof learnScopeHintSchema.options)[number],
    )
  ) {
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

export const tolerantLearnScopeHintSchema = z.preprocess(
  normalizeScopeHint,
  learnScopeHintSchema.nullable().optional(),
);

const nullableStringSchema = (max: number) =>
  z.preprocess(
    (value) => (value == null ? '' : value),
    z.string().trim().max(max).optional().default(''),
  );

const nullableNumberSchema = (fallback: number, min: number, max: number) =>
  z.preprocess((value) => {
    if (value == null || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) return undefined;
    return numeric;
  }, z.number().min(min).max(max).optional().default(fallback));

const nullableIntegerSchema = (fallback: number, min: number, max: number) =>
  z.preprocess((value) => {
    if (value == null || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) return undefined;
    return Math.trunc(numeric);
  }, z.number().int().min(min).max(max).optional().default(fallback));

function normalizeScopeBasis(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    ['user_explicit', 'calendar_semantic', 'memory', 'artifact', 'model_inference'].includes(
      normalized,
    )
  ) {
    return normalized;
  }
  if (/user|student|explicit|用户|学生|明确/.test(normalized)) return 'user_explicit';
  if (/calendar|syllabus|schedule|semantic|日历|课表|大纲|时间/.test(normalized)) {
    return 'calendar_semantic';
  }
  if (/memory|记忆/.test(normalized)) return 'memory';
  if (/artifact|draft|草稿/.test(normalized)) return 'artifact';
  return 'model_inference';
}

export const learnScopeResolutionSchema = z
  .object({
    contentScope: z
      .object({
        label: nullableStringSchema(160),
        kind: tolerantLearnScopeHintSchema,
        basis: z
          .preprocess(
            normalizeScopeBasis,
            z.enum(['user_explicit', 'calendar_semantic', 'memory', 'artifact', 'model_inference']),
          )
          .default('model_inference'),
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
        days: nullableIntegerSchema(7, 1, 60),
        minutesPerDay: nullableIntegerSchema(45, 5, 600),
        rationale: nullableStringSchema(500),
      })
      .nullable()
      .optional(),
    needsClarification: z.boolean().default(false),
    clarificationQuestion: nullableStringSchema(300),
  })
  .nullable()
  .optional();

export const learnPlanningIntentValues = [
  'none',
  'review_plan',
  'preview_plan',
  'practice_plan',
] as const;

export const learnPlanningDecisionSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return learnPlanningIntentValues.includes(
      record.intent as (typeof learnPlanningIntentValues)[number],
    )
      ? record
      : { ...record, intent: 'none' };
  },
  z.object({
    intent: z.enum(learnPlanningIntentValues).default('none'),
    practiceMode: z.enum(['practice', 'quiz']).nullable().optional(),
    scopeHint: tolerantLearnScopeHintSchema,
    scopeResolution: learnScopeResolutionSchema,
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

export const learnTurnRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  recentMessages: z.array(learnTurnMessageSchema).max(12).default([]),
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
  problemBank: z
    .object({
      available: z.boolean().default(false),
      activeCount: z.number().int().min(0).max(100000).default(0),
      samples: z.array(z.record(z.string(), z.unknown())).max(12).default([]),
    })
    .optional()
    .default({ available: false, activeCount: 0, samples: [] }),
  sourceUploads: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
  layeredMemorySummary: z.string().trim().max(4000).optional().default(''),
});

export const learnTurnResponseSchema = z.object({
  answerMode: z
    .enum(['course_answer', 'action_only', 'client_activity_plan', 'client_practice_plan', 'none'])
    .default('course_answer'),
  replyText: z.string().trim().max(3500).default(''),
  planningDecision: learnPlanningDecisionSchema.optional().nullable(),
  directCalls: z.array(learnActionSchema).max(5).default([]),
  proposals: z.array(learnActionSchema).max(6).default([]),
  artifacts: z.array(learnArtifactSchema).max(8).default([]),
  reason: z.string().trim().max(1000).default(''),
  confidence: z.number().min(0).max(1).default(0.5),
});

export function extractJsonObject(text: string): unknown {
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
