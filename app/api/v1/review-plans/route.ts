import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEvidenceBasedReviewPlan } from '@/features/teaching-orchestrator/server/review-plan';
import {
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';
import { withRequestContext } from '@/lib/server/request-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const scheduleEventSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['assignment', 'exam', 'progress', 'tutorial', 'holiday', 'other']).optional(),
  source_name: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const requestSchema = z.object({
  target_type: z.enum(['course', 'notebook']),
  target_id: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(4000),
  conversation_id: z.string().trim().min(1).max(120).nullable().optional(),
  schedule_events: z.array(scheduleEventSchema).max(120).default([]),
  constraints: z
    .object({
      total_minutes: z.number().int().min(15).max(240).optional(),
      question_count: z.number().int().min(1).max(20).optional(),
      max_tasks: z.number().int().min(1).max(8).optional(),
      today: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return publicApiError(
        requestId,
        400,
        'invalid_request',
        'Invalid review-plan request.',
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;
    const decision = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/review-plans',
        operationCode: 'public_review_plan',
        chargeReason: '生成证据化复习计划',
      },
      () =>
        generateEvidenceBasedReviewPlan({
          userId: principal.userId,
          targetType: input.target_type,
          targetId: input.target_id,
          query: input.query,
          conversationId: input.conversation_id,
          scheduleEvents: input.schedule_events.map((event) => ({
            id: event.id,
            title: event.title,
            date: event.date,
            kind: event.kind,
            sourceName: event.source_name,
            notes: event.notes,
          })),
          constraints: input.constraints
            ? {
                totalMinutes: input.constraints.total_minutes,
                questionCount: input.constraints.question_count,
                maxTasks: input.constraints.max_tasks,
                today: input.constraints.today,
              }
            : undefined,
        }),
    );
    return publicApiSuccess(requestId, {
      id: `rplan_${randomUUID()}`,
      object: 'review_plan',
      created_at: new Date().toISOString(),
      decision,
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Review plan generation failed.',
    );
  }
}
