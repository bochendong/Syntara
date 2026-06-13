import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildNotebookProblemDraftsFromReviewInsertRequest,
  ReviewProblemInsertError,
  reviewProblemInsertRequestSchema,
} from '@/lib/problem-bank/review-problem-insert';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  createNotebookProblemsFromDrafts,
  listNotebookProblemsForUser,
} from '@/features/problems/server/service';

function toClientProblem(problem: Awaited<ReturnType<typeof listNotebookProblemsForUser>>[number]) {
  return {
    id: problem.id,
    courseId: problem.courseId ?? null,
    notebookId: problem.notebookId,
    notebookName: problem.notebookName,
    title: problem.title,
    type: problem.type,
    status: problem.status,
    source: problem.source,
    order: problem.order,
    problemNumber: problem.problemNumber ?? null,
    points: problem.points,
    tags: problem.tags,
    difficulty: problem.difficulty,
    publicContent: problem.publicContent,
    grading: problem.grading,
    sourceMeta: problem.sourceMeta,
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    latestAttempt: problem.latestAttempt ?? null,
    ...(problem.secretJudge ? { secretJudge: problem.secretJudge } : {}),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;
    const problems = await listNotebookProblemsForUser(auth.userId, id);
    return NextResponse.json({ problems: problems.map(toClientProblem) });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const payload = reviewProblemInsertRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    let drafts;
    try {
      drafts = buildNotebookProblemDraftsFromReviewInsertRequest(payload.data);
    } catch (error) {
      const message =
        error instanceof ReviewProblemInsertError || error instanceof z.ZodError
          ? error.message
          : 'Failed to normalize review problems';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const problems = await createNotebookProblemsFromDrafts({
      userId: auth.userId,
      notebookId: id,
      drafts,
    });
    return NextResponse.json(
      {
        insertedCount: drafts.length,
        problems: problems.map(toClientProblem),
      },
      { status: 201 },
    );
  });
}
