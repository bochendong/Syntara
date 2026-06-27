import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const planningMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().max(2500),
});

const planningIntentRequestSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  recentMessages: z.array(planningMessageSchema).max(10).default([]),
  hasSyllabus: z.boolean().default(false),
  progressKnown: z.boolean().default(false),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
});

const planningIntentResponseSchema = z.object({
  intent: z.enum(['none', 'review_plan', 'preview_plan', 'practice_plan']),
  practiceMode: z.enum(['practice', 'quiz']).nullable().optional(),
  scopeHint: z
    .enum([
      'first_half',
      'second_half',
      'next_two_weeks',
      'upcoming',
      'full_course',
      'explicit_topic',
    ])
    .nullable()
    .optional(),
  isFollowUpToPlan: z.boolean().default(false),
  shouldAskProgressFirst: z.boolean().default(false),
  useSyllabusAsDefaultScope: z.boolean().default(false),
  resolvedPrompt: z.string().trim().max(4000).default(''),
  focusTopics: z.array(z.string().trim().max(120)).max(8).default([]),
  constraintsSummary: z.string().trim().max(500).default(''),
  reason: z.string().trim().max(800).default(''),
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

function formatRecentMessages(messages: z.infer<typeof planningMessageSchema>[]) {
  if (!messages.length) return 'No prior messages.';
  return messages
    .map((message, index) => `${index + 1}. ${message.role}: ${message.text}`)
    .join('\n');
}

function buildPrompt(input: z.infer<typeof planningIntentRequestSchema>) {
  return [
    'You are an AI intent planner for a learning platform. Classify the latest student message semantically. Do not use keyword matching rules; infer intent from meaning and conversation context.',
    '',
    'Return ONLY one JSON object with this exact shape:',
    '{',
    '  "intent": "none" | "review_plan" | "preview_plan" | "practice_plan",',
    '  "practiceMode": "practice" | "quiz" | null,',
    '  "scopeHint": "first_half" | "second_half" | "next_two_weeks" | "upcoming" | "full_course" | "explicit_topic" | null,',
    '  "isFollowUpToPlan": boolean,',
    '  "shouldAskProgressFirst": boolean,',
    '  "useSyllabusAsDefaultScope": boolean,',
    '  "resolvedPrompt": string,',
    '  "focusTopics": string[],',
    '  "constraintsSummary": string,',
    '  "reason": string,',
    '  "confidence": number',
    '}',
    '',
    'Decision policy:',
    '- A review or preview plan may be requested without using the exact words "plan" or "review"; infer from intent.',
    '- If the latest message supplies missing planning details after the assistant asked for scope/time/progress, treat it as a follow-up to the earlier plan request and combine the old request with the new details in resolvedPrompt.',
    '- If the student asks for a schedule-scoped review/preview plan and syllabus is available, set useSyllabusAsDefaultScope=true and shouldAskProgressFirst=false. The system should produce a default plan from today plus syllabus dates and let the student revise it.',
    '- If the student asks to choose practice problems, generate a quiz, or select from a problem bank, and progress is unknown, set shouldAskProgressFirst=true because choosing questions depends on learned scope.',
    '- If there is no planning intent, return intent="none".',
    '- scopeHint captures the requested planning window semantically: first half of term, second half, next two weeks, upcoming schedule, whole course, or explicit topic-only scope.',
    '- focusTopics should include explicit student constraints such as "反常积分" when present.',
    '- constraintsSummary should summarize time/scope constraints in the student language, for example "覆盖到反常积分；每周 3-4 小时".',
    '',
    `Course: ${[input.courseCode, input.courseName].filter(Boolean).join(' · ') || 'unknown'}`,
    `Syllabus available: ${input.hasSyllabus ? 'yes' : 'no'}`,
    `Student-confirmed progress available: ${input.progressKnown ? 'yes' : 'no'}`,
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
    '/api/learn/planning-intent',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = planningIntentRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid planning intent request', details: payload.error.flatten() },
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
        const parsed = planningIntentResponseSchema.parse(extractJsonObject(result.text));

        return NextResponse.json(parsed);
      }),
    {
      operationCode: 'learn_planning_intent',
      chargeReason: '学习计划意图判断',
    },
  );
}
