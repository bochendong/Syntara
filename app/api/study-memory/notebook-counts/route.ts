import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

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

    const owned = await prisma.notebook.findMany({
      where: { ownerId: auth.userId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = owned.map((notebook) => notebook.id);
    if (ownedIds.length === 0) return NextResponse.json({ counts: {}, storage: 'database' });

    const rows = await prisma.studyMemory.groupBy({
      by: ['notebookId', 'scope'],
      where: {
        ownerId: auth.userId,
        targetType: 'notebook',
        status: 'active',
        notebookId: { in: ownedIds },
      },
      _count: { _all: true },
    });

    const counts: Record<string, { public: number; private: number; total: number }> = {};
    for (const id of ownedIds) {
      counts[id] = { public: 0, private: 0, total: 0 };
    }
    for (const row of rows) {
      if (!row.notebookId) continue;
      const current = counts[row.notebookId] || { public: 0, private: 0, total: 0 };
      const count = row._count._all;
      if (row.scope === 'public') current.public += count;
      if (row.scope === 'private') current.private += count;
      current.total += count;
      counts[row.notebookId] = current;
    }

    return NextResponse.json({ counts, storage: 'database' });
  });
}
