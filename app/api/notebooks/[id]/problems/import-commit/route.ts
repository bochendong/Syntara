import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { notebookProblemImportDraftSchema } from '@/lib/problem-bank';
import { createNotebookProblemsFromDrafts } from '@/lib/server/notebook-problems/service';

const commitSchema = z.object({
  drafts: z.array(notebookProblemImportDraftSchema).min(1).max(200),
});

function toClientProblem(
  problem: Awaited<ReturnType<typeof createNotebookProblemsFromDrafts>>[number],
) {
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
    points: problem.points,
    tags: problem.tags,
    difficulty: problem.difficulty,
    publicContent: problem.publicContent,
    sourceMeta: problem.sourceMeta,
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    latestAttempt: problem.latestAttempt ?? null,
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const payload = commitSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const problems = await createNotebookProblemsFromDrafts({
      userId: auth.userId,
      notebookId: id,
      drafts: payload.data.drafts,
    });
    return NextResponse.json({ problems: problems.map(toClientProblem) });
  });
}
