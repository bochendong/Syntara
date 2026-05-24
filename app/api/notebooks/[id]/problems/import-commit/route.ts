import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  getProblemImportBatchForTarget,
  markProblemImportBatchCommitted,
} from '@/lib/server/notebook-problems/import-batch-store';
import { notebookProblemImportDraftSchema } from '@/features/problems';
import { createNotebookProblemsFromDrafts } from '@/features/problems/server/service';

const commitSchema = z.object({
  drafts: z.array(notebookProblemImportDraftSchema).min(1).max(200),
  importBatchId: z.string().trim().min(1).optional(),
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

    const importBatchId = payload.data.importBatchId?.trim() || null;
    if (importBatchId) {
      const batch = await getProblemImportBatchForTarget({
        prisma,
        userId: auth.userId,
        batchId: importBatchId,
        targetType: 'notebook',
        notebookId: id,
      });
      if (!batch) {
        return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
      }
    }

    const problems = await createNotebookProblemsFromDrafts({
      userId: auth.userId,
      notebookId: id,
      drafts: payload.data.drafts,
      importBatchId,
    });
    if (importBatchId) {
      await markProblemImportBatchCommitted({
        prisma,
        userId: auth.userId,
        batchId: importBatchId,
        committedCount: payload.data.drafts.length,
      });
    }
    return NextResponse.json({ problems: problems.map(toClientProblem) });
  });
}
