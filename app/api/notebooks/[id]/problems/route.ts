import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { listNotebookProblemsForUser } from '@/lib/server/notebook-problems/service';

function toClientProblem(problem: Awaited<ReturnType<typeof listNotebookProblemsForUser>>[number]) {
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
    latestAttempt: problem.latestAttempt ?? null,
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
