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

function normalizeLearningActionKind(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (learningActionKindSchema.options.includes(value as (typeof learningActionKindSchema.options)[number])) {
    return value;
  }
  if (/calendar/.test(normalized) && /(delete|remove|删除|移除)/.test(normalized)) {
    return 'calendar.propose_delete';
  }
  if (/calendar/.test(normalized) && /(update|modify|shift|reschedule|顺延|修改|调整)/.test(normalized)) {
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

const learningActionSchema = z.object({
  kind: z.preprocess(normalizeLearningActionKind, learningActionKindSchema),
  label: z.string().trim().max(120),
  summary: z.string().trim().max(800).optional().default(''),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  confirmation: z.enum(['none', 'required']).optional(),
});

const learnArtifactKindSchema = z.enum([
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
  if (learnArtifactKindSchema.options.includes(normalized as (typeof learnArtifactKindSchema.options)[number])) {
    return normalized;
  }
  if (/calendar|schedule/.test(normalized)) return 'calendar_draft';
  if (/activity|review|plan/.test(normalized)) return 'activity_plan';
  if (/memory|weakness|mastery/.test(normalized)) return 'memory_candidate';
  if (/web|search/.test(normalized)) return 'web_search_result';
  if (/image|prompt|diagram|visual/.test(normalized)) return 'image_prompt_draft';
  return 'answer_evidence';
}

const artifactSchema = z
  .object({
    kind: z.preprocess(normalizeArtifactKind, learnArtifactKindSchema),
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

function currentTorontoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildPrompt(input: z.infer<typeof learnTurnRequestSchema>) {
  const today = currentTorontoDate();
  return [
    'You are the /learn semantic turn planner for an intelligent learning platform.',
    'Plan the next turn using typed actions and durable artifacts. Do not execute writes or expensive generations.',
    'Infer intent semantically. Do not rely on keyword-only rules.',
    '',
    'Platform resources and boundaries:',
    '- The app has course calendar activities, learner history/memory, uploaded sources/notebooks, and an optional course problem bank. Use those resources before generic tutoring.',
    '- Students often write terse messages such as "我要开始第一个复习了", "这个题咋做", "帮我检查一下作业", "我要复习什么知识点", or "给我一份课程提纲". Resolve these using platform context; do not require perfect command wording.',
    '- If the learner asks for help on "this problem" but no problem text/image is present, ask them to paste or upload the problem. Do not invent the missing problem.',
    '- If the learner asks to check homework but no homework/answer/rubric is present, ask for the materials first.',
    '- If the learner asks for an outline, base it on uploaded sources, notebooks, syllabus, and memory; if those are missing, say what is missing.',
    '- For activity diagnostics and tests, prefer the course problem bank. If the problem bank is unavailable, say so explicitly and do not pretend generated questions came from the bank.',
    '',
    'Decision protocol:',
    '- Before choosing actions, resolve what object the learner is referring to: current calendar activity, latest plan/artifact, pasted problem, uploaded file, homework, course outline, memory status, or ordinary course question.',
    '- Choose resources in this order when relevant: explicit pasted/uploaded material, current activity/artifact, learner history/memory, course problem bank, uploaded sources/notebooks, syllabus/calendar, web for current external facts only.',
    '- Decide execution boundary: reads/searches can be direct; calendar/memory/image/large practice writes require confirmation or client executor.',
    '- Do not reveal hidden chain-of-thought. Use the "reason" field as a concise audit trace naming the entry type, resources used, and why no write happened yet.',
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
    '- If the learner asks only to start/open/continue the nearest, recent, next, or today activity and recentActivities has items, use calendar.start_recent directCalls with payload.activityId. Do not create a new plan.',
    '- If the learner says only "我要开始第一个复习了", "开始第一个", "开始最近活动", or similar start/open wording, this is a start action: use calendar.start_recent directCalls. Do not answer with your own activity lesson.',
    '- Phrases like "不要再从 base case 开始讲", "不要从基础开始", or "我已经会 X" are mastery/preference signals, not start/open actions. Do not use calendar.start_recent for them.',
    '- If the learner asks how to do, review, prepare for, or connect "this activity", "the first one", "the current one", or a recently started activity to another course topic with wording like "怎么复习/怎么做/有什么关系/为什么", resolve the reference before answering: prefer recentArtifacts.kind="active_activity", then the first item in the latest calendar_draft/activity_plan artifact, then recentActivities[0]. Use answerMode="action_only" with a concrete activity-specific replyText and no calendar.start_recent directCall. Include the resolved activity title, duration if available, syllabus/rawText basis if available, and a short timed sequence for this activity. Do not fall back to the learner snapshot current notebook or create a new plan.',
    '- If the resolved activity is from an ai_plan/review calendar item, keep the answer anchored to that activity title and its syllabus/rawText evidence. The current date only determines doing the activity now; it must not replace the activity topic.',
    '- Activity execution replies must not be generic checklists. First use learner history/memory to identify relevant weak points or failed/partial attempts, then explain the activity topic enough to start now.',
    '- For a knowledge review/preview activity, replyText should include: "开始活动：...", "历史检查：...", "这次目标：...", and "核心抓手：" with 2-4 topic-specific points. Do not self-author diagnostic exercises in replyText.',
    '- If there is no relevant learner history and the course problem bank is available, ask the executor/client to open a small problem-bank diagnostic or use practice.propose_generation with source="problem_bank" when the learner explicitly asks to do questions. If the problem bank is unavailable, say that no bank-backed test can be started.',
    '- For a short-practice/mixed-practice activity, use problem-bank practice when available. Do not create a practice_plan unless the learner explicitly asks for problem-bank practice, quiz, exercises, or doing problems.',
    '- Activity execution replies should be concise, around 500-700 Chinese characters. Use plain text formulas only: never use $...$, $$...$$, \\(...\\), \\[...\\], or \\frac in replyText.',
    '- If the learner confirms a recent required action, return the same action in directCalls with confirmation="none".',
    '- If the learner asks to add the latest plan to calendar, use recentArtifacts calendar_draft/activity_plan calendarDraftItems or a recent calendar.propose_add action. Do not reconstruct from prose if artifacts exist.',
    '- Calendar delete/update must target explicit event ids when possible. If ambiguous, use calendar.search/open calendar rather than guessing.',
    '- Calendar update/delete requests such as missed days, shifting, rescheduling, deleting Friday review, or changing a calendar item must return calendar.propose_update/delete or calendar.search. Never reply only "I will adjust it".',
    '- Web search is direct only for latest/current/external information. It must show sources after execution.',
    '- Image generation always requires confirmation.',
    '- Memory writes store teaching-control signals only: mastery, weakness, error cause, next teaching move, correction. Do not store raw transcript as the main memory.',
    '- memory.propose_write always requires confirmation. Never set confirmation="none" for durable memory writes.',
    '- Memory recall/status questions such as "你记得我哪里不会吗", "我的薄弱点是什么", "我现在会了什么/不会什么", or "为什么觉得我不会..." are read/diagnosis turns. Do not propose memory.propose_write for those unless the learner explicitly asks you to save, correct, or update memory.',
    '- Memory correction/mastery statements such as "其实我会 X，只是不熟 Y" or "不要再把我当成完全不会" should propose memory.propose_write with memoryType="correction" or "mastery" when they would affect future teaching.',
    '',
    'Planning policy:',
    '- Review/preview/activity planning is not practice generation. Use client_activity_plan with planningDecision intent review_plan or preview_plan.',
    '- Activity plans may include knowledge review, short exercises, reading, catch-up, and reflection. They are not problem-bank practice cards.',
    '- Only use practice_plan / practice.propose_generation when the learner explicitly asks for questions, exercises, problem-bank selection, quiz, or doing problems.',
    '- Questions like "我要复习什么知识点", "该复习哪些知识点", or "我应该补什么概念" are diagnosis/status turns, not activity-plan turns, unless the learner explicitly asks for a schedule, calendar, days, weeks, or timetable. Answer/read with memory and learner snapshot; do not create a plan.',
    '- Separate contentScope from executionWindow. contentScope answers "what course material is covered"; executionWindow answers "when the learner will do the work".',
    '- Current date may set executionWindow.startDate. It must NOT rewrite a user content scope such as first half of term, before Test 2, through improper integrals, chapters 1-4, or previous units into "upcoming".',
    '- When the learner gives a scope phrase and syllabus/calendar events are available, resolve contentScope semantically from the full calendar timeline. Include matching eventIds whenever possible, plus startDate/endDate and a short rationale.',
    '- Set useSyllabusAsDefaultScope=true when the client can build a provisional activity plan from the resolved syllabus contentScope. This does not mean "upcoming"; the selected contentScope controls the material.',
    '- If no explicit content scope is provided, choose the best provisional scope from syllabus, memory, artifacts, or recent context and label it clearly. Ask for clarification only when the ambiguity would materially change the plan.',
    '- If no syllabus/progress evidence exists and the plan depends on missing progress/time, use learner progress confirmation only when needed. Available time may be defaulted for a draft plan unless the learner asks for a precise load.',
    '',
    'Answer-grounding policy:',
    '- For normal course questions, answerMode="course_answer" and replyText must usually be empty. The course answerer will use uploaded sources, notebook excerpts, problem bank evidence, and layered memory.',
    '- If source/table/numeric details are requested, let course_answer handle it with source evidence unless a web search is needed. Do not answer, deny, or summarize uploaded-source availability inside the planner.',
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
    `Problem bank: ${compactJson(input.problemBank, 3000)}`,
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

function isMemoryRecallQuestion(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/(帮我记住|记下来|记录一下|写入记忆|加入记忆|更新记忆|改成|纠正记忆)/.test(normalized)) {
    return false;
  }
  return /(你记得|记得我|记忆里|刚才|薄弱点|哪里不会|不会什么|会了什么|掌握状态|为什么觉得我不会|现在.*不会|当前.*不会)/.test(
    normalized,
  );
}

function isKnowledgePriorityQuestion(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const asksPriority =
    /(复习什么知识点|复习哪些知识点|该复习什么|要复习什么|补什么知识点|哪些知识点.*复习|知识点.*复习|what.*review|which.*concept)/i.test(
      normalized,
    );
  if (!asksPriority) return false;
  return !/(计划|日历|安排|schedule|calendar|天|周|week|day|加入|添加)/i.test(normalized);
}

function isStartOnlyActivityRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (
    /(怎么|如何|为什么|关系|建议|应该|复习什么|哪些知识点|讲|解释|说明|不要|别|已经会)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(开始|打开|进入|继续).{0,12}(第一个|第一项|最近|下一个|活动|复习|小测)|(?:第一个|第一项|最近|下一个).{0,12}(开始|打开|进入|继续)/.test(
    normalized,
  );
}

function isCalendarMutationRequest(text: string): 'delete' | 'update' | 'add' | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (/(删除|删掉|移除|取消).{0,24}(日历|活动|复习|安排|周|星期|ddl|作业|小测)/i.test(normalized)) {
    return 'delete';
  }
  if (
    /(顺延|推迟|延期|改到|调整|重新排|没学|没做|missed|reschedule|shift).{0,40}(日历|活动|复习|安排|后面|后续|周|星期|今天|明天)?/i.test(
      normalized,
    )
  ) {
    return 'update';
  }
  if (/(加入|添加|放进).{0,24}(日历|calendar)/i.test(normalized)) return 'add';
  return null;
}

function hasCalendarMutationAction(actions: z.infer<typeof learningActionSchema>[]) {
  return actions.some(
    (action) =>
      action.kind === 'calendar.propose_add' ||
      action.kind === 'calendar.propose_update' ||
      action.kind === 'calendar.propose_delete' ||
      action.kind === 'calendar.search',
  );
}

function isMemoryCorrectionOrMasteryRequest(text: string): 'correction' | 'mastery' | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (/(其实|不是|纠正|改成|更准确).{0,30}(我会|我不会|不熟|薄弱|掌握|记忆)/.test(normalized)) {
    return 'correction';
  }
  if (/(我已经会|我会).{0,40}(不要|别|不需要|跳过|不用).{0,40}(基础|base case|从.*开始)/i.test(normalized)) {
    return 'mastery';
  }
  if (/(不要|别|不需要|跳过|不用).{0,40}(从.*开始|base case|基础).{0,40}(我已经会|我会)?/i.test(normalized)) {
    return 'mastery';
  }
  return null;
}

function hasMemoryWriteAction(actions: z.infer<typeof learningActionSchema>[]) {
  return actions.some((action) => action.kind === 'memory.propose_write');
}

function actionMustBeConfirmed(kind: z.infer<typeof learningActionKindSchema>) {
  return (
    kind === 'calendar.propose_add' ||
    kind === 'calendar.propose_update' ||
    kind === 'calendar.propose_delete' ||
    kind === 'memory.propose_write' ||
    kind === 'practice.propose_generation' ||
    kind === 'classroom.propose_temporary_explanation' ||
    kind === 'image.propose_generation'
  );
}

function normalizeActionConfirmation(
  action: z.infer<typeof learningActionSchema>,
): z.infer<typeof learningActionSchema> {
  if (!actionMustBeConfirmed(action.kind)) return action;
  return {
    ...action,
    payload: {
      ...(action.payload || {}),
      requiresConfirmation: true,
    },
    confirmation: 'required',
  };
}

function isTextConfirmationForRecentAction(
  action: z.infer<typeof learningActionSchema>,
  input: z.infer<typeof learnTurnRequestSchema>,
  question: string,
) {
  if (!input.recentActions.length) return false;
  if (!/(确认|同意|可以|好的|好啊|就这样|执行|添加|加入|删除|修改|yes|ok)/i.test(question)) {
    return false;
  }
  return input.recentActions.some((recentAction) => eventString(recentAction, 'kind') === action.kind);
}

function normalizeSafetyBoundaries(
  parsed: z.infer<typeof learnTurnResponseSchema>,
  input: z.infer<typeof learnTurnRequestSchema>,
  question: string,
): z.infer<typeof learnTurnResponseSchema> {
  const proposals = parsed.proposals.map(normalizeActionConfirmation);
  const directCalls: z.infer<typeof learningActionSchema>[] = [];
  for (const action of parsed.directCalls) {
    if (actionMustBeConfirmed(action.kind) && !isTextConfirmationForRecentAction(action, input, question)) {
      proposals.push(normalizeActionConfirmation(action));
    } else {
      directCalls.push(action);
    }
  }
  const hasOnlyMemoryProposal =
    !parsed.replyText.trim() &&
    directCalls.length === 0 &&
    proposals.some((action) => action.kind === 'memory.propose_write');
  return {
    ...parsed,
    directCalls,
    proposals,
    replyText: hasOnlyMemoryProposal
      ? '收到，这会影响之后怎么教你；确认后我再写入学习记忆。'
      : parsed.replyText,
  };
}

function isSourceDetailQuestion(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(表格|table|benchmark|数字|数据|数值|页码|原文|论文|paper|vs\.?|对比|比较|准确率|指标|BLEU|F1|AUC|RMSE|MAE)/i.test(
    normalized,
  );
}

function isExternalCurrentLookupQuestion(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(最新|今天|现在|current|latest|today|news|新闻|网页|联网|web|internet|search|查一下|搜一下|API|价格|版本|release|documentation|docs)/i.test(
    normalized,
  );
}

function sourceLookupArtifact(
  input: z.infer<typeof learnTurnRequestSchema>,
  question: string,
): z.infer<typeof artifactSchema> | null {
  if (!input.sourceUploads.length || !isSourceDetailQuestion(question)) return null;
  return {
    kind: 'answer_evidence',
    id: `source-evidence-${Date.now()}`,
    query: question,
    requiredLookup: 'uploaded_source',
    mustCite: true,
    sourceCandidates: input.sourceUploads.slice(0, 8).map((source) => ({
      id:
        typeof source.id === 'string'
          ? source.id
          : typeof source.sourceHash === 'string'
            ? source.sourceHash
            : '',
      title: typeof source.title === 'string' ? source.title : '',
      kind: typeof source.kind === 'string' ? source.kind : '',
      ragEntryIds: Array.isArray(source.ragEntryIds) ? source.ragEntryIds : [],
    })),
  };
}

function eventString(event: Record<string, unknown>, key: string) {
  const value = event[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isDatedSyllabusEvent(event: Record<string, unknown>) {
  const origin = eventString(event, 'origin');
  const date = eventString(event, 'date');
  return (!origin || origin === 'syllabus') && /^\d{4}-\d{2}-\d{2}/.test(date);
}

function firstHalfSyllabusScope(input: z.infer<typeof learnTurnRequestSchema>) {
  const syllabusEvents = input.calendarEvents
    .filter(isDatedSyllabusEvent)
    .sort((a, b) => eventString(a, 'date').localeCompare(eventString(b, 'date')));
  if (!syllabusEvents.length) return null;

  const progressEvents = syllabusEvents.filter((event) => {
    const kind = eventString(event, 'kind').toLowerCase();
    return !kind || kind === 'progress' || kind === 'lecture' || kind === 'tutorial';
  });
  const contentEvents = progressEvents.length ? progressEvents : syllabusEvents;
  const testOne = syllabusEvents.find((event) => {
    const title = eventString(event, 'title');
    return /\btest\s*1\b|term\s*test\s*1|midterm|期中|第一次/i.test(title);
  });
  const selected = testOne
    ? contentEvents.filter((event) => eventString(event, 'date') <= eventString(testOne, 'date'))
    : contentEvents.slice(0, Math.max(1, Math.ceil(contentEvents.length / 2)));
  if (!selected.length) return null;

  return {
    label: '前半学期复习',
    kind: 'first_half' as const,
    basis: 'calendar_semantic' as const,
    eventIds: selected.map((event) => eventString(event, 'id')).filter(Boolean),
    startDate: eventString(selected[0], 'date'),
    endDate: eventString(selected[selected.length - 1], 'date'),
    rationale: testOne
      ? '根据 syllabus timeline，前半学期按 Test 1 / midterm 之前的课程内容处理。'
      : '根据 syllabus timeline，前半学期按课程进度事件的前半段处理；今天只决定执行开始日期。',
    confidence: 0.92,
  };
}

function weekdayFromDate(date: string) {
  const parsedDate = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const day = parsedDate.getUTCDay();
  return Number.isFinite(day) ? day : null;
}

function requestedWeekdays(question: string) {
  const matches: number[] = [];
  const pairs: Array<[RegExp, number]> = [
    [/周日|星期日|礼拜日|周天|星期天|礼拜天/, 0],
    [/周一|星期一|礼拜一/, 1],
    [/周二|星期二|礼拜二/, 2],
    [/周三|星期三|礼拜三/, 3],
    [/周四|星期四|礼拜四/, 4],
    [/周五|星期五|礼拜五/, 5],
    [/周六|星期六|礼拜六/, 6],
  ];
  for (const [pattern, weekday] of pairs) {
    if (pattern.test(question)) matches.push(weekday);
  }
  return matches;
}

function preferredCalendarEventTarget(
  input: z.infer<typeof learnTurnRequestSchema>,
  question: string,
) {
  const weekdays = requestedWeekdays(question);
  const wantsReview = /复习|review/i.test(question);
  const wantsPractice = /练习|刷题|做题|practice|quiz|小测/i.test(question);
  const scored = input.calendarEvents
    .map((event) => {
      const id = eventString(event, 'id');
      const title = eventString(event, 'title');
      const date = eventString(event, 'date');
      if (!id || !date) return null;
      const origin = eventString(event, 'origin');
      const kind = eventString(event, 'kind');
      const weekday = weekdayFromDate(date);
      let score = 0;
      if (['ai_plan', 'manual', 'practice', 'exam_prep'].includes(origin)) score += 10;
      if (weekdays.length && weekday != null && weekdays.includes(weekday)) score += 8;
      if (wantsReview && /复习|review/i.test(title)) score += 4;
      if (wantsPractice && /练习|刷题|practice|quiz|小测/i.test(title)) score += 4;
      if (/progress|practice|review/i.test(kind)) score += 1;
      return { id, title, date, score };
    })
    .filter((item): item is { id: string; title: string; date: string; score: number } =>
      Boolean(item),
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

  if (!scored.length) return null;
  const topScore = scored[0].score;
  const top = scored.filter((item) => item.score === topScore);
  return {
    isAmbiguous: top.length > 1,
    candidates: top,
    event: top.length === 1 ? top[0] : null,
  };
}

function normalizeCalendarMutationActions(
  parsed: z.infer<typeof learnTurnResponseSchema>,
  mutation: 'delete' | 'update' | 'add',
  input: z.infer<typeof learnTurnRequestSchema>,
  question: string,
): z.infer<typeof learnTurnResponseSchema> {
  const expectedKind =
    mutation === 'delete'
      ? 'calendar.propose_delete'
      : mutation === 'add'
        ? 'calendar.propose_add'
        : 'calendar.propose_update';
  const target = mutation === 'add' ? null : preferredCalendarEventTarget(input, question);
  const rewrite = (action: z.infer<typeof learningActionSchema>) => {
    if (
      action.kind !== 'calendar.propose_add' &&
      action.kind !== 'calendar.propose_update' &&
      action.kind !== 'calendar.propose_delete'
    ) {
      return null;
    }
    const targetPayload =
      target?.event && mutation === 'delete'
        ? { eventId: target.event.id, eventIds: [target.event.id] }
        : target?.event && mutation === 'update'
          ? { eventId: target.event.id, eventIds: [target.event.id] }
          : target?.isAmbiguous
            ? {
                target: 'ambiguous',
                candidateEventIds: target.candidates.map((candidate) => candidate.id),
              }
            : {};
    return normalizeActionConfirmation({
      ...action,
      kind: expectedKind,
      payload: {
        ...(action.payload || {}),
        ...targetPayload,
        query: question,
      },
    });
  };

  const normalizedActions = [...parsed.proposals, ...parsed.directCalls]
    .map(rewrite)
    .filter((action): action is z.infer<typeof learningActionSchema> => Boolean(action));
  if (!normalizedActions.length) return parsed;
  return {
    ...parsed,
    answerMode: 'action_only',
    replyText:
      mutation === 'delete'
        ? target?.event
          ? `我找到候选活动「${target.event.title}」，确认后再删除。`
          : '我需要先确认要删除的日历活动，不会直接猜着删。'
        : mutation === 'update'
          ? '我先准备日历调整候选，确认后再修改课程日历。'
          : '我先准备日历添加候选，确认后再写入课程日历。',
    directCalls: parsed.directCalls.filter(
      (action) =>
        action.kind !== 'calendar.propose_add' &&
        action.kind !== 'calendar.propose_update' &&
        action.kind !== 'calendar.propose_delete',
    ),
    proposals: normalizedActions,
    reason: 'Calendar mutation normalized to required confirmation with deterministic event candidates.',
  };
}

function normalizeLearnTurnResponse(
  parsed: z.infer<typeof learnTurnResponseSchema>,
  question: string,
  input: z.infer<typeof learnTurnRequestSchema>,
): z.infer<typeof learnTurnResponseSchema> {
  const safetyNormalized = normalizeSafetyBoundaries(parsed, input, question);
  const withoutRedundantMemoryWrites = isMemoryRecallQuestion(question)
    ? {
        ...safetyNormalized,
        proposals: safetyNormalized.proposals.filter(
          (action) => action.kind !== 'memory.propose_write',
        ),
      }
    : safetyNormalized;

  if (isStartOnlyActivityRequest(question) && input.recentActivities.length > 0) {
    const activity = input.recentActivities[0];
    const activityId =
      typeof activity.id === 'string'
        ? activity.id
        : typeof activity.sourceId === 'string'
          ? activity.sourceId
          : '';
    return {
      ...withoutRedundantMemoryWrites,
      answerMode: 'action_only',
      replyText: '',
      planningDecision: null,
      directCalls: [
        {
          kind: 'calendar.start_recent',
          label: '开始最近活动',
          summary: '用户只要求开始已有学习活动，交给客户端执行器处理。',
          payload: {
            activityId,
          },
          confirmation: 'none',
        },
      ],
      proposals: [],
      artifacts: [],
      reason: 'Start-only activity request; delegated to calendar.start_recent executor.',
    };
  }

  const allActions = [
    ...withoutRedundantMemoryWrites.directCalls,
    ...withoutRedundantMemoryWrites.proposals,
  ];

  const calendarMutation = isCalendarMutationRequest(question);
  if (calendarMutation && hasCalendarMutationAction(allActions)) {
    return normalizeCalendarMutationActions(
      withoutRedundantMemoryWrites,
      calendarMutation,
      input,
      question,
    );
  }
  if (calendarMutation && !hasCalendarMutationAction(allActions)) {
    const kind =
      calendarMutation === 'delete'
        ? 'calendar.propose_delete'
        : calendarMutation === 'add'
          ? 'calendar.propose_add'
          : 'calendar.propose_update';
    return {
      ...withoutRedundantMemoryWrites,
      answerMode: 'action_only',
      replyText:
        calendarMutation === 'delete'
          ? '我先找对应的日历活动，确认后再删除，不会直接猜着删。'
          : calendarMutation === 'add'
            ? '我先准备日历添加候选，确认后再写入课程日历。'
            : '我先准备日历调整候选，确认后再修改课程日历。',
      planningDecision: null,
      directCalls: [],
      proposals: [
        {
          kind,
          label:
            calendarMutation === 'delete'
              ? '确认删除日历活动'
              : calendarMutation === 'add'
                ? '确认添加到日历'
                : '确认调整日历活动',
          summary: question,
          payload: {
            query: question,
            target: 'ambiguous',
            requiresConfirmation: true,
          },
          confirmation: 'required',
        },
      ],
      artifacts: [],
      reason: 'Calendar mutation request requires a typed confirmation action.',
    };
  }

  const memoryUpdateType = isMemoryCorrectionOrMasteryRequest(question);
  if (memoryUpdateType && !hasMemoryWriteAction(allActions)) {
    return {
      ...withoutRedundantMemoryWrites,
      answerMode: 'action_only',
      replyText:
        memoryUpdateType === 'mastery'
          ? '收到，这会影响之后怎么教你：我不会再默认从最基础处讲起；这条需要你确认后才写入学习记忆。'
          : '收到，这是一条学习记忆纠错候选；确认后我会用它修正之后的薄弱点判断。',
      planningDecision: null,
      directCalls: [],
      proposals: [
        {
          kind: 'memory.propose_write',
          label: memoryUpdateType === 'mastery' ? '记录已掌握内容' : '修正学习记忆',
          summary: question,
          payload: {
            memoryType: memoryUpdateType,
            summary: question,
            evidence: [question],
            requiresConfirmation: true,
          },
          confirmation: 'required',
        },
      ],
      artifacts: [],
      reason: 'Learner provided a mastery/correction signal that should update teaching memory only after confirmation.',
    };
  }

  if (
    isKnowledgePriorityQuestion(question) &&
    (withoutRedundantMemoryWrites.answerMode === 'client_activity_plan' ||
      withoutRedundantMemoryWrites.planningDecision?.intent === 'review_plan')
  ) {
    return {
      ...withoutRedundantMemoryWrites,
      answerMode: 'action_only',
      planningDecision: {
        intent: 'none',
        practiceMode: null,
        scopeHint: null,
        scopeResolution: null,
        isFollowUpToPlan: false,
        shouldAskProgressFirst: false,
        useSyllabusAsDefaultScope: false,
        resolvedPrompt: '',
        focusTopics: [],
        constraintsSummary: '',
        reason: 'Knowledge-priority diagnosis is not an activity plan.',
        confidence: 0.9,
      },
      directCalls: [],
      proposals: [],
      artifacts: [],
      replyText: withoutRedundantMemoryWrites.replyText
        .replace(/接下来[，,]?\s*我(?:将|会).*?(?:计划|日程|安排).*?。?/g, '')
        .trim(),
      reason:
        withoutRedundantMemoryWrites.reason ||
        'Knowledge-priority diagnosis; use learner memory/snapshot, no write or calendar action.',
    };
  }

  const sourceEvidenceArtifact = sourceLookupArtifact(input, question);
  const sourceGroundedResponse =
    sourceEvidenceArtifact && withoutRedundantMemoryWrites.answerMode === 'course_answer'
      ? {
          ...withoutRedundantMemoryWrites,
          replyText: '',
          artifacts: [
            sourceEvidenceArtifact,
            ...withoutRedundantMemoryWrites.artifacts.filter(
              (artifact) => artifact.kind !== 'answer_evidence',
            ),
	          ],
	          reason:
	            'Uploaded-source detail question; delegated to course answerer with required source evidence.',
	        }
	      : withoutRedundantMemoryWrites;
  const webGuardedResponse =
    sourceGroundedResponse.answerMode === 'course_answer' &&
    !isExternalCurrentLookupQuestion(question)
      ? {
          ...sourceGroundedResponse,
          directCalls: sourceGroundedResponse.directCalls.filter(
            (action) => action.kind !== 'web.search',
          ),
          reason: sourceGroundedResponse.directCalls.some((action) => action.kind === 'web.search')
            ? 'Stable course question; removed web.search so the course answerer uses course sources, memory, and notebooks first.'
            : sourceGroundedResponse.reason,
        }
      : sourceGroundedResponse;

  const shouldNormalizeFirstHalfScope =
    input.hasSyllabus &&
    (webGuardedResponse.planningDecision?.scopeHint === 'first_half' ||
      /前半学期|前半段|first half/i.test(question));
  const deterministicFirstHalfScope = shouldNormalizeFirstHalfScope
    ? firstHalfSyllabusScope(input)
    : null;
  const basePlanningDecision =
    webGuardedResponse.planningDecision ||
    (deterministicFirstHalfScope
      ? {
          intent: 'review_plan' as const,
          practiceMode: null,
          scopeHint: 'first_half' as const,
          scopeResolution: null,
          isFollowUpToPlan: false,
          shouldAskProgressFirst: false,
          useSyllabusAsDefaultScope: true,
          resolvedPrompt: question,
          focusTopics: [],
          constraintsSummary: '',
          reason: 'First-half scope inferred from learner wording and syllabus timeline.',
          confidence: 0.85,
        }
      : null);

  const normalizedPlanningDecision = basePlanningDecision
    ? {
        ...basePlanningDecision,
        scopeHint:
          deterministicFirstHalfScope && !basePlanningDecision.scopeHint
            ? 'first_half'
            : basePlanningDecision.scopeHint,
        scopeResolution: deterministicFirstHalfScope
          ? {
              ...(basePlanningDecision.scopeResolution || {}),
              contentScope: deterministicFirstHalfScope,
              executionWindow: basePlanningDecision.scopeResolution?.executionWindow || {
                startDate: currentTorontoDate(),
                days: 7,
                minutesPerDay: 45,
                rationale: '默认从今天开始做一个可调整的 7 天活动计划。',
              },
              needsClarification: false,
              clarificationQuestion: '',
            }
          : basePlanningDecision.scopeResolution,
        useSyllabusAsDefaultScope:
          basePlanningDecision.useSyllabusAsDefaultScope ||
          Boolean(basePlanningDecision.scopeHint) ||
          Boolean(deterministicFirstHalfScope) ||
          Boolean(
            basePlanningDecision.scopeResolution?.contentScope?.eventIds?.length,
          ),
      }
    : webGuardedResponse.planningDecision;
  const normalizedResponse = {
    ...webGuardedResponse,
    planningDecision: normalizedPlanningDecision,
  };

  if (
    normalizedResponse.answerMode === 'action_only' &&
    normalizedResponse.replyText.trim()
  ) {
    return {
      ...normalizedResponse,
      directCalls: normalizedResponse.directCalls.filter(
        (action) => action.kind !== 'calendar.start_recent',
      ),
    };
  }
  const planningIntent = normalizedResponse.planningDecision?.intent || 'none';
  if (
    (normalizedResponse.answerMode === 'client_activity_plan' ||
      normalizedResponse.answerMode === 'client_practice_plan') &&
    planningIntent === 'none' &&
    normalizedResponse.directCalls.length === 0 &&
    normalizedResponse.proposals.length === 0 &&
    normalizedResponse.artifacts.length === 0
  ) {
    return {
      ...normalizedResponse,
      answerMode: 'course_answer',
      replyText: '',
      planningDecision: null,
    };
  }
  return normalizedResponse;
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
          payload.data.question,
          payload.data,
        );

        return NextResponse.json(parsed);
      }),
    {
      operationCode: 'learn_turn_runtime',
      chargeReason: '学习页回合规划',
    },
  );
}
