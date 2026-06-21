import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  createNotebookProblemAttempt,
  getCourseProblemForUser,
} from '@/features/problems/server/service';

const selfReportSchema = z.object({
  status: z.enum(['passed', 'partial', 'failed']),
  text: z.string().max(40000).optional(),
  selectedOptionIds: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  blanks: z.record(z.string(), z.string().max(4000)).optional(),
  code: z.string().max(120000).optional(),
});

function scoreRatio(status: 'passed' | 'partial' | 'failed') {
  if (status === 'passed') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

function feedback(status: 'passed' | 'partial' | 'failed') {
  if (status === 'passed') return '学生自评：已掌握。';
  if (status === 'partial') return '学生自评：部分掌握，需要做变式巩固。';
  return '学生自评：还不会，需要回到概念和例题。';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; problemId: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, problemId } = await context.params;

    const payload = selfReportSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const loaded = await getCourseProblemForUser(auth.userId, id, problemId);
    const score = scoreRatio(payload.data.status) * loaded.problem.points;
    const attempt = await createNotebookProblemAttempt({
      userId: auth.userId,
      problemId,
      kind: 'answer',
      status: payload.data.status,
      score,
      answer: {
        text: payload.data.text,
        selectedOptionIds: payload.data.selectedOptionIds,
        blanks: payload.data.blanks,
        code: payload.data.code,
      },
      result: {
        correct: payload.data.status === 'passed',
        feedback: feedback(payload.data.status),
        earnedPoints: score,
        publicCases: [],
      },
    });

    return NextResponse.json({ attempt, result: attempt.result });
  });
}
