import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { planSourceMemoryIngestion } from '@/features/memory/server/source-ingestion';

const targetTypeSchema = z.enum(['course', 'notebook']);

const ingestionPlanRequestSchema = z.object({
  targetType: targetTypeSchema.optional(),
  targetId: z.string().trim().min(1).optional(),
  courseCode: z.string().trim().min(1).max(40).optional(),
  sourceTitle: z.string().trim().min(1).max(240),
  sourceKind: z
    .enum(['pdf', 'markdown', 'plain_text', 'problem_bank', 'other'])
    .default('plain_text'),
  audience: z.enum(['creator', 'learner']).default('creator'),
  text: z.string().trim().min(1).max(200000),
});

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const payload = ingestionPlanRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const plan = planSourceMemoryIngestion(payload.data);
    return NextResponse.json({
      storage: 'planned',
      planner: 'features/memory/source-ingestion',
      plan,
      counts: {
        artifacts: plan.artifacts.length,
        writeCandidates: plan.writeCandidates.length,
        staticInjectionCandidates: plan.artifacts.filter((item) => item.staticInjectionCandidate)
          .length,
        dynamicDiscoveryCandidates: plan.artifacts.filter((item) => item.dynamicDiscoveryCandidate)
          .length,
      },
    });
  });
}
