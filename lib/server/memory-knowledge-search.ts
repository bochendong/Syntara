import type { PrismaClient } from '@/lib/server/generated-prisma';

export type MemoryKnowledgeMatch = {
  id: string;
  sourceType: 'problem_bank';
  title: string;
  text: string;
  score: number;
  metadata: {
    courseId: string | null;
    notebookId: string | null;
    problemType: string;
    difficulty: string;
    tags: string[];
    status: string;
  };
};

type RawProblemKnowledgeRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  title: string;
  type: string;
  status: string;
  tags: string[];
  difficulty: string;
  publicText: string;
  gradingText: string;
  updatedAt: Date | string;
};

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query);
  const latin = normalized.match(/[a-z0-9_+\-]{2,}/g) || [];
  const han = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  const compactHan = han.flatMap((term) => {
    if (term.length <= 4) return [term];
    const windows: string[] = [];
    for (let i = 0; i <= term.length - 2; i += 1) {
      windows.push(term.slice(i, i + 2));
    }
    return [term, ...windows];
  });
  return unique([...latin, ...compactHan]).slice(0, 24);
}

function previewText(row: RawProblemKnowledgeRow): string {
  const body = [row.publicText, row.gradingText]
    .join(' ')
    .replace(/[{}"\[\],:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body.slice(0, 520) || row.title;
}

function scoreProblem(row: RawProblemKnowledgeRow, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = normalize(row.title);
  const tags = row.tags.map(normalize);
  const publicText = normalize(row.publicText);
  const gradingText = normalize(row.gradingText);
  let score = 0;

  for (const term of terms) {
    if (tags.some((tag) => tag === term || tag.includes(term) || term.includes(tag))) score += 12;
    if (title.includes(term)) score += 8;
    if (publicText.includes(term)) score += 3;
    if (gradingText.includes(term)) score += 2;
  }

  if (row.status === 'published') score += 1;
  if (row.difficulty === 'hard') score += 0.5;
  return score;
}

export async function searchProblemBankKnowledge(args: {
  prisma: PrismaClient;
  query: string;
  notebookId?: string | null;
  courseId?: string | null;
  limit?: number;
}): Promise<MemoryKnowledgeMatch[]> {
  const terms = queryTerms(args.query);
  if (terms.length === 0 || (!args.notebookId && !args.courseId)) return [];

  const rows = await args.prisma.$queryRawUnsafe<RawProblemKnowledgeRow[]>(
    `
      SELECT
        "id",
        "courseId",
        "notebookId",
        "title",
        "type"::text AS "type",
        "status"::text AS "status",
        "tags",
        "difficulty"::text AS "difficulty",
        "publicContentJson"::text AS "publicText",
        "gradingJson"::text AS "gradingText",
        "updatedAt"
      FROM "NotebookProblem"
      WHERE "status" <> 'archived'
        AND (
          ($1::text IS NOT NULL AND "notebookId" = $1)
          OR ($2::text IS NOT NULL AND "courseId" = $2)
        )
      ORDER BY "updatedAt" DESC
      LIMIT 160
    `,
    args.notebookId || null,
    args.courseId || null,
  );

  const limit = Math.max(1, Math.min(args.limit ?? 6, 20));
  return rows
    .map((row, index) => ({
      row,
      index,
      score: scoreProblem(row, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: row.id,
      sourceType: 'problem_bank',
      title: row.title,
      text: previewText(row),
      score,
      metadata: {
        courseId: row.courseId,
        notebookId: row.notebookId,
        problemType: row.type,
        difficulty: row.difficulty,
        tags: row.tags,
        status: row.status,
      },
    }));
}
