import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const plannerMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().max(2500),
});

const plannerActionKindSchema = z.enum([
  'calendar.search',
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'memory.search',
  'memory.propose_write',
  'web.search',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'image.propose_generation',
]);

const plannerActionSchema = z.object({
  kind: plannerActionKindSchema,
  label: z.string().trim().max(120),
  summary: z.string().trim().max(800).optional().default(''),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  confirmation: z.enum(['none', 'required']).optional(),
});

const plannerArtifactSchema = z
  .object({
    kind: z.enum([
      'review_plan',
      'calendar_draft',
      'web_search_result',
      'image_prompt_draft',
      'memory_candidate',
    ]),
  })
  .passthrough();

const actionPlannerRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  recentMessages: z.array(plannerMessageSchema).max(10).default([]),
  courseId: z.string().trim().max(200).optional(),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
  learnerSnapshot: z.unknown().optional(),
  calendarEvents: z.array(z.record(z.string(), z.unknown())).max(80).default([]),
  recentPlans: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  recentArtifacts: z.array(z.record(z.string(), z.unknown())).max(16).default([]),
  recentActions: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  layeredMemorySummary: z.string().trim().max(3000).optional().default(''),
});

const actionPlannerResponseSchema = z.object({
  replyText: z.string().trim().max(3000).default(''),
  directCalls: z.array(plannerActionSchema).max(4).default([]),
  proposals: z.array(plannerActionSchema).max(5).default([]),
  artifacts: z.array(plannerArtifactSchema).max(6).default([]),
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

function formatRecentMessages(messages: z.infer<typeof plannerMessageSchema>[]) {
  if (!messages.length) return 'No recent conversation.';
  return messages
    .map((message, index) => `${index + 1}. ${message.role}: ${message.text}`)
    .join('\n');
}

function buildPrompt(input: z.infer<typeof actionPlannerRequestSchema>) {
  return [
    'You are the /learn action planner for an intelligent learning platform.',
    'Your job is to decide whether the latest student message needs typed tool actions, durable artifacts, or neither.',
    'Do not execute tools. Return only structured JSON.',
    '',
    'Return ONLY one JSON object with this exact shape:',
    '{',
    '  "replyText": string,',
    '  "directCalls": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "proposals": [{"kind": string, "label": string, "summary": string, "payload": object, "confirmation": "none" | "required"}],',
    '  "artifacts": [object],',
    '  "reason": string,',
    '  "confidence": number',
    '}',
    '',
    'Allowed action kinds:',
    '- calendar.search: read-only calendar lookup; directCalls, confirmation none.',
    '- memory.search: read-only memory lookup; directCalls, confirmation none.',
    '- web.search: read-only web search; directCalls, confirmation none.',
    '- calendar.propose_add/update/delete: state-changing calendar action; proposals, confirmation required.',
    '- memory.propose_write: durable learner memory write; proposals, confirmation required.',
    '- image.propose_generation: image/media generation; proposals, confirmation required.',
    '- practice.propose_generation: use proposals when it creates a larger practice set or depends on confirmation.',
    '- classroom.propose_temporary_explanation: use proposals when the learner asks for a temporary classroom/mini-lesson.',
    '',
    'Decision rules:',
    '- If the message is a normal course question or explanation request, return empty directCalls/proposals/artifacts and replyText="".',
    '- If the learner asks to create a new review/preview/study activity plan, return empty directCalls/proposals/artifacts; a separate syllabus-aware planner will build the plan.',
    '- Do not turn a review/preview/activity plan into practice.propose_generation unless the learner explicitly asks for practice questions, a quiz, a problem set, or problem-bank selection.',
    '- If the latest message clearly confirms a recentActions item that required confirmation, return that same action in directCalls with confirmation="none". This user message is the confirmation; do not ask for confirmation again.',
    '- If the learner asks to add a recent plan to the calendar, use recentArtifacts calendarDraftItems or calendar_draft items. Do not reconstruct from prose unless no artifact exists; if no draft exists, ask them to generate a plan first.',
    '- Calendar update/delete must target explicit event ids from calendarEvents when possible. If ambiguous, return calendar.search instead of a destructive proposal.',
    '- If the learner asks for latest/current/external information, use web.search with a concise query.',
    '- If the learner asks what you remember, why a weak point exists, or memory evidence, use memory.search.',
    '- If the learner asks to generate an image or visual, create image.propose_generation and an image_prompt_draft artifact. Do not execute image generation directly.',
    '- If proposing a memory write, store teaching-control signals: mastery, weakness, error type, evidence, next teaching move. Do not store raw transcript as the main memory.',
    '- For proposals, replyText should say what will happen after confirmation, not that it already happened.',
    '- For direct calls, replyText may be a short transition such as "我先查一下..."',
    '',
    `Course: ${[input.courseCode, input.courseName].filter(Boolean).join(' · ') || input.courseId || 'unknown'}`,
    `Learner snapshot: ${compactJson(input.learnerSnapshot, 1800)}`,
    `Calendar events: ${compactJson(input.calendarEvents, 5000)}`,
    `Recent plans: ${compactJson(input.recentPlans, 4000)}`,
    `Recent artifacts: ${compactJson(input.recentArtifacts, 6000)}`,
    `Recent proposed actions: ${compactJson(input.recentActions, 5000)}`,
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

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/learn/action-planner',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = actionPlannerRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid action planner request', details: payload.error.flatten() },
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
        const parsed = actionPlannerResponseSchema.parse(extractJsonObject(result.text));

        return NextResponse.json(parsed);
      }),
    {
      operationCode: 'learn_action_planner',
      chargeReason: '学习工具动作规划',
    },
  );
}
