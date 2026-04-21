import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { evaluateNotebookNonCodeProblem } from '@/lib/server/notebook-problems/evaluate';
import { judgeNotebookCodeProblem } from '@/lib/server/notebook-problems/judge';
import {
  createNotebookProblemAttempt,
  getNotebookProblemForUser,
} from '@/lib/server/notebook-problems/service';

const submitSchema = z.object({
  text: z.string().max(40000).optional(),
  selectedOptionIds: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  blanks: z.record(z.string(), z.string().max(4000)).optional(),
  code: z.string().max(120000).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; problemId: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, problemId } = await context.params;

    const payload = submitSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const loaded = await getNotebookProblemForUser(auth.userId, id, problemId);
    const answer = {
      text: payload.data.text,
      selectedOptionIds: payload.data.selectedOptionIds,
      blanks: payload.data.blanks,
      code: payload.data.code,
    };

    const evaluated = await runWithRequestContext(
      req,
      '/api/notebooks/problems/attempts/submit',
      async () => {
        if (loaded.problem.type === 'code') {
          return judgeNotebookCodeProblem({
            problem: loaded.problem,
            secretJudge: loaded.secretJudge,
            kind: 'submit',
            userAnswer: answer,
          });
        }

        const { model } = await resolveModelFromHeaders(req, {
          allowOpenAIModelOverride: true,
        });
        return evaluateNotebookNonCodeProblem({
          problem: loaded.problem,
          answer,
          model,
          language: payload.data.language,
        });
      },
    );

    const attempt = await createNotebookProblemAttempt({
      userId: auth.userId,
      problemId,
      kind: loaded.problem.type === 'code' ? 'submit' : 'answer',
      status: evaluated.status,
      score: evaluated.score,
      answer,
      result: evaluated.result,
    });

    return NextResponse.json({
      attempt,
      result: evaluated.result,
    });
  });
}
