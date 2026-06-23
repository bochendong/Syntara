import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { generateEvidenceBasedReviewPlan } from '@/features/teaching-orchestrator/server/review-plan';

const scheduleEventSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  date: z.string().trim().min(1).max(40),
  kind: z.enum(['assignment', 'exam', 'progress', 'tutorial', 'holiday', 'other']).optional(),
  sourceName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const reviewPlanRequestSchema = z.object({
  targetType: z.enum(['course', 'notebook']),
  targetId: z.string().trim().min(1),
  query: z.string().trim().max(4000).default('帮我制定今天的复习计划'),
  conversationId: z.string().trim().min(1).max(120).nullable().optional(),
  scheduleEvents: z.array(scheduleEventSchema).max(120).optional(),
  constraints: z
    .object({
      totalMinutes: z.number().int().min(15).max(240).optional(),
      questionCount: z.number().int().min(1).max(20).optional(),
      maxTasks: z.number().int().min(1).max(8).optional(),
      today: z.string().trim().min(1).max(40).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/teaching/review-plan',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = reviewPlanRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid request body', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const decision = await generateEvidenceBasedReviewPlan({
          userId: auth.userId,
          targetType: payload.data.targetType,
          targetId: payload.data.targetId,
          query: payload.data.query,
          conversationId: payload.data.conversationId ?? null,
          scheduleEvents: payload.data.scheduleEvents,
          constraints: payload.data.constraints,
        });

        return NextResponse.json({ decision });
      }),
    {
      operationCode: 'teaching_review_plan',
      chargeReason: '生成证据化复习计划',
    },
  );
}
