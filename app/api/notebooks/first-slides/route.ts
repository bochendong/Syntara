import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import type { Slide } from '@/lib/types/slides';

type FirstSlideRow = {
  notebookId: string;
  content: unknown;
};

function parseNotebookIds(request: Request): string[] {
  const url = new URL(request.url);
  const rawIds = url.searchParams.get('ids') || '';
  return Array.from(
    new Set(
      rawIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 80),
    ),
  );
}

function slideFromContent(content: unknown): Slide | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const record = content as { type?: unknown; canvas?: unknown };
  if (record.type !== 'slide') return null;
  if (!record.canvas || typeof record.canvas !== 'object' || Array.isArray(record.canvas)) {
    return null;
  }
  return record.canvas as Slide;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const ids = parseNotebookIds(request);
    if (ids.length === 0) return NextResponse.json({ slides: {} });

    const owned = await prisma.notebook.findMany({
      where: { ownerId: auth.userId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = owned.map((notebook) => notebook.id);
    if (ownedIds.length === 0) return NextResponse.json({ slides: {} });

    const rows = await prisma.$queryRawUnsafe<FirstSlideRow[]>(
      `
        SELECT DISTINCT ON ("notebookId") "notebookId", "content"
        FROM "Scene"
        WHERE "notebookId" = ANY($1::text[])
          AND "content"->>'type' = 'slide'
        ORDER BY "notebookId", "order" ASC
      `,
      ownedIds,
    );

    const slides: Record<string, Slide> = {};
    for (const row of rows) {
      const slide = slideFromContent(row.content);
      if (slide) slides[row.notebookId] = slide;
    }

    return NextResponse.json({ slides });
  });
}
