import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { judgeNotebookCodeProblem } from '@/lib/server/notebook-problems/judge';
import {
  createNotebookProblemAttempt,
  getNotebookProblemForUser,
} from '@/lib/server/notebook-problems/service';

const runSchema = z.object({
  code: z.string().trim().min(1).max(120000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; problemId: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, problemId } = await context.params;

    const payload = runSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const loaded = await getNotebookProblemForUser(auth.userId, id, problemId);
    if (loaded.problem.type !== 'code') {
      return NextResponse.json(
        { error: 'Run is only supported for code problems' },
        { status: 400 },
      );
    }

    const judged = await judgeNotebookCodeProblem({
      problem: loaded.problem,
      secretJudge: loaded.secretJudge,
      kind: 'run',
      userAnswer: { code: payload.data.code },
    });
    const attempt = await createNotebookProblemAttempt({
      userId: auth.userId,
      problemId,
      kind: 'run',
      status: judged.status,
      score: judged.score,
      answer: { code: payload.data.code },
      result: judged.result,
    });

    return NextResponse.json({
      attempt,
      result: judged.result,
    });
  });
}
