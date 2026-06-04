import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { findReadableNotebookId } from '@/lib/server/repositories/notebook-repository';
import type { Slide } from '@/lib/types/slides';

type FirstSlideRow = {
  notebookId: string;
  content: unknown;
};

type FirstSlidePreviewRow = {
  notebookId: string;
  slideId: string | null;
  viewportSize: number | string | null;
  viewportRatio: number | string | null;
  image: unknown;
};

type CachedCoverSlideRow = {
  id: string;
  coverSlideJson: unknown;
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

function shouldReturnPreviewSlides(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get('preview') === '1';
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

function isPreviewableImageSrc(src: unknown): src is string {
  const value = typeof src === 'string' ? src.trim() : '';
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slidePreviewFromRow(row: FirstSlidePreviewRow): Slide | null {
  if (!row.image || typeof row.image !== 'object' || Array.isArray(row.image)) return null;
  const image = row.image as Slide['elements'][number] & { src?: unknown };
  if (image.type !== 'image' || !isPreviewableImageSrc(image.src)) return null;
  return {
    id: row.slideId || `${row.notebookId}-preview`,
    type: 'content',
    theme: {
      fontName: 'Inter',
      fontColor: '#0f172a',
      themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
      backgroundColor: '#ffffff',
    },
    background: { type: 'solid', color: '#ffffff' },
    viewportSize: toFiniteNumber(row.viewportSize, 1000),
    viewportRatio: toFiniteNumber(row.viewportRatio, 1.777777777777778),
    elements: [image],
  };
}

function slidePreviewFromCachedCover(row: CachedCoverSlideRow): Slide | null {
  if (!row.coverSlideJson || typeof row.coverSlideJson !== 'object') return null;
  if (Array.isArray(row.coverSlideJson)) return null;
  const slide = row.coverSlideJson as Partial<Slide>;
  if (!Array.isArray(slide.elements) || slide.elements.length === 0) return null;
  return slide as Slide;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const preview = shouldReturnPreviewSlides(request);
    const ids = parseNotebookIds(request);
    if (ids.length === 0) return NextResponse.json({ slides: {} });

    const readable = await Promise.all(
      ids.map((id) => findReadableNotebookId(prisma, auth.userId, id)),
    );
    const readableIds = readable
      .map((notebook) => notebook?.id)
      .filter((id): id is string => Boolean(id));
    if (readableIds.length === 0) return NextResponse.json({ slides: {} });

    if (preview) {
      const cachedRows = (await prisma.notebook.findMany({
        where: { id: { in: readableIds } },
        select: { id: true, coverSlideJson: true },
      })) as CachedCoverSlideRow[];

      const slides: Record<string, Slide> = {};
      for (const row of cachedRows) {
        const slide = slidePreviewFromCachedCover(row);
        if (slide) slides[row.id] = slide;
      }

      const missingIds = readableIds.filter((id) => !slides[id]);
      if (missingIds.length === 0) {
        return NextResponse.json({ slides });
      }

      const rows = await prisma.$queryRawUnsafe<FirstSlidePreviewRow[]>(
        `
          SELECT DISTINCT ON (s."notebookId")
            s."notebookId",
            s."content"->'canvas'->>'id' AS "slideId",
            s."content"->'canvas'->>'viewportSize' AS "viewportSize",
            s."content"->'canvas'->>'viewportRatio' AS "viewportRatio",
            element.value AS "image"
          FROM "Scene" s
          CROSS JOIN LATERAL jsonb_array_elements(s."content"->'canvas'->'elements') AS element(value)
          WHERE s."notebookId" = ANY($1::text[])
            AND s."content"->>'type' = 'slide'
            AND element.value->>'type' = 'image'
            AND (
              element.value->>'src' LIKE '/%'
              OR element.value->>'src' LIKE 'http://%'
              OR element.value->>'src' LIKE 'https://%'
            )
          ORDER BY
            s."notebookId",
            s."order" ASC,
            COALESCE(NULLIF(element.value->>'width', '')::double precision, 0)
              * COALESCE(NULLIF(element.value->>'height', '')::double precision, 0) DESC
        `,
        missingIds,
      );

      for (const row of rows) {
        const slide = slidePreviewFromRow(row);
        if (slide) slides[row.notebookId] = slide;
      }
      return NextResponse.json({ slides });
    }

    const rows = await prisma.$queryRawUnsafe<FirstSlideRow[]>(
      `
        SELECT DISTINCT ON ("notebookId") "notebookId", "content"
        FROM "Scene"
        WHERE "notebookId" = ANY($1::text[])
          AND "content"->>'type' = 'slide'
        ORDER BY "notebookId", "order" ASC
      `,
      readableIds,
    );

    const slides: Record<string, Slide> = {};
    for (const row of rows) {
      const slide = slideFromContent(row.content);
      if (slide) slides[row.notebookId] = slide;
    }

    return NextResponse.json({ slides });
  });
}
