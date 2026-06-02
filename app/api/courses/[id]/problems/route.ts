import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  listCourseProblemSummariesForUser,
  listCourseProblemsForUser,
} from '@/features/problems/server/service';

function toClientProblem(problem: Awaited<ReturnType<typeof listCourseProblemsForUser>>[number]) {
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
  };
}

function toClientProblemSummary(
  problem: Awaited<ReturnType<typeof listCourseProblemSummariesForUser>>[number],
) {
  return {
    id: problem.id,
    courseId: problem.courseId ?? null,
    notebookId: problem.notebookId,
    notebookName: problem.notebookName,
    title: problem.title,
    status: problem.status,
    tags: problem.tags,
    latestAttempt: problem.latestAttempt ?? null,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;
    const url = new URL(request.url);
    if (url.searchParams.get('summary') === '1') {
      const problems = await listCourseProblemSummariesForUser(auth.userId, id);
      return NextResponse.json({ problems: problems.map(toClientProblemSummary) });
    }

    const problems = await listCourseProblemsForUser(auth.userId, id);
    return NextResponse.json({ problems: problems.map(toClientProblem) });
  });
}
