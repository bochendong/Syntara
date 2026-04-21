import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  notebookProblemGradingSchema,
  notebookProblemPublicContentSchema,
} from '@/lib/problem-bank';
import {
  getNotebookProblemForUser,
  updateNotebookProblem,
} from '@/lib/server/notebook-problems/service';

const updateProblemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  points: z.number().int().min(0).max(1000).optional(),
  order: z.number().int().min(0).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  publicContent: notebookProblemPublicContentSchema.optional(),
  grading: notebookProblemGradingSchema.optional(),
  secretJudge: z.unknown().nullable().optional(),
});

function toClientProblem(
  problem: Awaited<ReturnType<typeof getNotebookProblemForUser>>['problem'],
) {
  return {
    id: problem.id,
    notebookId: problem.notebookId,
    title: problem.title,
    type: problem.type,
    status: problem.status,
    source: problem.source,
    order: problem.order,
    points: problem.points,
    tags: problem.tags,
    difficulty: problem.difficulty,
    publicContent: problem.publicContent,
    sourceMeta: problem.sourceMeta,
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; problemId: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, problemId } = await context.params;
    const { problem } = await getNotebookProblemForUser(auth.userId, id, problemId);
    return NextResponse.json({ problem: toClientProblem(problem) });
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; problemId: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, problemId } = await context.params;

    const payload = updateProblemSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const problem = await updateNotebookProblem({
      userId: auth.userId,
      notebookId: id,
      problemId,
      patch: payload.data,
    });
    return NextResponse.json({ problem: toClientProblem(problem) });
  });
}
