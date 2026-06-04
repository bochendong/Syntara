import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { findCourseAccessRole } from '@/lib/server/repositories/course-enrollment-repository';

function parseNotebookIds(request: Request): string[] {
  const url = new URL(request.url);
  const rawIds = url.searchParams.get('ids') || '';
  return Array.from(
    new Set(
      rawIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 120),
    ),
  );
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) return NextResponse.json({ counts: {}, storage: 'unavailable' });

    const ids = parseNotebookIds(request);
    if (ids.length === 0) return NextResponse.json({ counts: {}, storage: 'database' });

    const notebooks = await prisma.notebook.findMany({
      where: { id: { in: ids } },
      select: { id: true, ownerId: true, courseId: true },
    });
    const readable = (
      await Promise.all(
        notebooks.map(async (notebook) => {
          if (notebook.ownerId === auth.userId) return notebook;
          if (!notebook.courseId) return null;
          const accessRole = await findCourseAccessRole(prisma, auth.userId, notebook.courseId);
          return accessRole ? notebook : null;
        }),
      )
    ).filter((notebook): notebook is (typeof notebooks)[number] => Boolean(notebook));
    if (readable.length === 0) return NextResponse.json({ counts: {}, storage: 'database' });

    const readableIds = readable.map((notebook) => notebook.id);
    const counts: Record<string, { public: number; private: number; total: number }> =
      Object.fromEntries(
        readableIds.map((notebookId) => [notebookId, { public: 0, private: 0, total: 0 }]),
      );
    const rows = await prisma.studyMemory.groupBy({
      by: ['notebookId', 'scope'],
      where: {
        targetType: 'notebook',
        status: 'active',
        notebookId: { in: readableIds },
        OR: [
          { ownerId: auth.userId, scope: 'private' },
          ...readable.map((notebook) => ({
            notebookId: notebook.id,
            ownerId: notebook.ownerId,
            scope: 'public' as const,
          })),
        ],
      },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (!row.notebookId) continue;
      const current = counts[row.notebookId];
      if (!current) continue;
      const count = row._count._all;
      if (row.scope === 'public') current.public += count;
      if (row.scope === 'private') current.private += count;
      current.total += count;
    }

    return NextResponse.json({ counts, storage: 'database' });
  });
}
