import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import type { MemoryKnowledgeMatch } from '@/lib/server/memory-knowledge-search';
import type { MemoryEvidencePacket } from '@/lib/server/memory-source-evidence';
import type { ReadableStudyMemoryTarget } from '@/lib/server/study-memory-store';

export type KnowledgeCacheSourceType = 'problem_bank' | 'markdown_section' | 'problem';

export type KnowledgeCacheEntry = {
  id: string;
  cacheKey: string;
  ownerId: string;
  targetType: 'course' | 'notebook';
  courseId: string | null;
  notebookId: string | null;
  sourceType: KnowledgeCacheSourceType;
  sourceId: string;
  title: string;
  previewText: string;
  metadata: unknown;
  firstQuery: string;
  lastQuery: string;
  hitCount: number;
  score: number;
  firstAccessedAt: string;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
};

type RawKnowledgeCacheRow = Omit<
  KnowledgeCacheEntry,
  'sourceType' | 'firstAccessedAt' | 'lastAccessedAt' | 'createdAt' | 'updatedAt'
> & {
  sourceType: string;
  firstAccessedAt: Date | string;
  lastAccessedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type KnowledgeCacheWrite = {
  sourceType: KnowledgeCacheSourceType;
  sourceId: string;
  title: string;
  previewText: string;
  metadata: unknown;
  score: number;
};

function cacheTargetType(target: ReadableStudyMemoryTarget): 'course' | 'notebook' | null {
  if (target.targetType === 'course' || target.targetType === 'notebook') return target.targetType;
  return null;
}

let ensureKnowledgeCacheTablePromise: Promise<void> | null = null;

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function serializeDate(value: Date | string): string {
  return new Date(value).toISOString();
}

function normalizeSourceType(value: string): KnowledgeCacheSourceType {
  if (value === 'markdown_section' || value === 'problem') return value;
  return 'problem_bank';
}

function serializeRow(row: RawKnowledgeCacheRow): KnowledgeCacheEntry {
  return {
    ...row,
    sourceType: normalizeSourceType(row.sourceType),
    hitCount: Number(row.hitCount) || 0,
    score: Number(row.score) || 0,
    firstAccessedAt: serializeDate(row.firstAccessedAt),
    lastAccessedAt: serializeDate(row.lastAccessedAt),
    createdAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
  };
}

function jsonParam(value: unknown): string {
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

function targetCourseId(target: ReadableStudyMemoryTarget): string | null {
  return target.courseId || (target.targetType === 'course' ? target.targetId : null);
}

function targetNotebookId(target: ReadableStudyMemoryTarget): string | null {
  return target.notebookId || (target.targetType === 'notebook' ? target.targetId : null);
}

function cacheKey(args: {
  ownerId: string;
  targetType: 'course' | 'notebook';
  courseId: string | null;
  notebookId: string | null;
  sourceType: KnowledgeCacheSourceType;
  sourceId: string;
}): string {
  return createHash('sha256')
    .update(
      [
        args.ownerId,
        args.targetType,
        args.courseId || '',
        args.notebookId || '',
        args.sourceType,
        args.sourceId,
      ].join('\u001f'),
    )
    .digest('hex');
}

function cacheId(): string {
  return `knowledge_cache_${randomUUID().replace(/-/g, '')}`;
}

function normalize(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query);
  const latin = normalized.match(/[a-z0-9_+\-]{2,}/g) || [];
  const han = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  return unique([...latin, ...han]).slice(0, 24);
}

function metadataText(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const raw = metadata as Record<string, unknown>;
  const tags = Array.isArray(raw.tags) ? raw.tags.join(' ') : '';
  const notebookName = typeof raw.notebookName === 'string' ? raw.notebookName : '';
  return [tags, notebookName].filter(Boolean).join(' ');
}

function textScore(entry: KnowledgeCacheEntry, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = normalize(
    [entry.title, entry.previewText, metadataText(entry.metadata)].filter(Boolean).join('\n'),
  );
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 8 : score), 0);
}

function recencyScore(entry: KnowledgeCacheEntry): number {
  const ageMs = Date.now() - new Date(entry.lastAccessedAt).getTime();
  const ageDays = Math.max(0, ageMs / 86_400_000);
  return Math.max(0, 14 - ageDays);
}

function rankEntry(entry: KnowledgeCacheEntry, terms: string[]): number {
  return textScore(entry, terms) + Math.min(entry.hitCount, 20) * 2 + recencyScore(entry);
}

function stableEntries(entries: KnowledgeCacheEntry[]): KnowledgeCacheEntry[] {
  const seen = new Set<string>();
  const result: KnowledgeCacheEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.cacheKey)) continue;
    seen.add(entry.cacheKey);
    result.push(entry);
  }
  return result;
}

export async function ensureKnowledgeCacheTable(prisma: PrismaClient): Promise<void> {
  if (!ensureKnowledgeCacheTablePromise) {
    ensureKnowledgeCacheTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "MemoryKnowledgeCache" (
          "id" TEXT PRIMARY KEY,
          "cacheKey" TEXT NOT NULL UNIQUE,
          "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "targetType" TEXT NOT NULL,
          "courseId" TEXT REFERENCES "Course"("id") ON DELETE CASCADE,
          "notebookId" TEXT REFERENCES "Notebook"("id") ON DELETE CASCADE,
          "sourceType" TEXT NOT NULL,
          "sourceId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "previewText" TEXT NOT NULL,
          "metadata" JSONB,
          "firstQuery" TEXT NOT NULL,
          "lastQuery" TEXT NOT NULL,
          "hitCount" INTEGER NOT NULL DEFAULT 1,
          "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "firstAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryKnowledgeCache_owner_course_recent_idx"
        ON "MemoryKnowledgeCache" ("ownerId", "targetType", "courseId", "lastAccessedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryKnowledgeCache_owner_notebook_recent_idx"
        ON "MemoryKnowledgeCache" ("ownerId", "targetType", "notebookId", "lastAccessedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryKnowledgeCache_owner_source_idx"
        ON "MemoryKnowledgeCache" ("ownerId", "sourceType", "sourceId")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryKnowledgeCache_owner_hot_recent_idx"
        ON "MemoryKnowledgeCache" ("ownerId", "hitCount", "lastAccessedAt" DESC)
      `);
    })().catch((error) => {
      ensureKnowledgeCacheTablePromise = null;
      throw error;
    });
  }
  return ensureKnowledgeCacheTablePromise;
}

export function knowledgeCacheWritesFromResults(args: {
  knowledgeMatches: MemoryKnowledgeMatch[];
  sourceEvidence: MemoryEvidencePacket[];
  limit?: number;
}): KnowledgeCacheWrite[] {
  const writes: KnowledgeCacheWrite[] = [
    ...args.knowledgeMatches.map((match) => ({
      sourceType: 'problem_bank' as const,
      sourceId: match.id,
      title: match.title,
      previewText: compact(match.text, 900),
      metadata: match.metadata,
      score: match.score,
    })),
    ...args.sourceEvidence
      .filter(
        (packet) => packet.sourceType === 'markdown_section' || packet.sourceType === 'problem',
      )
      .map((packet) => ({
        sourceType: packet.sourceType as KnowledgeCacheSourceType,
        sourceId: packet.sourceId || packet.id,
        title: packet.title,
        previewText: compact(packet.renderedText || packet.originalText, 900),
        metadata: packet.metadata,
        score: packet.score,
      })),
  ];

  return writes
    .filter((entry) => entry.sourceId && entry.title && entry.previewText)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(args.limit ?? 10, 20)));
}

export async function refreshKnowledgeCache(args: {
  prisma: PrismaClient;
  ownerId: string;
  target: ReadableStudyMemoryTarget;
  query: string;
  entries: KnowledgeCacheWrite[];
}): Promise<void> {
  if (args.entries.length === 0) return;
  await ensureKnowledgeCacheTable(args.prisma);
  const courseId = targetCourseId(args.target);
  const notebookId = targetNotebookId(args.target);
  const targetType = cacheTargetType(args.target);
  if (!targetType) return;
  const query = compact(args.query, 800) || 'N/A';

  for (const entry of stableEntries(
    args.entries.map((item) => ({
      id: cacheId(),
      cacheKey: cacheKey({
        ownerId: args.ownerId,
        targetType,
        courseId,
        notebookId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
      }),
      ownerId: args.ownerId,
      targetType,
      courseId,
      notebookId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: compact(item.title, 240),
      previewText: compact(item.previewText, 1200),
      metadata: item.metadata,
      firstQuery: query,
      lastQuery: query,
      hitCount: 1,
      score: item.score,
      firstAccessedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  )) {
    await args.prisma.$executeRawUnsafe(
      `
        INSERT INTO "MemoryKnowledgeCache" (
          "id", "cacheKey", "ownerId", "targetType", "courseId", "notebookId",
          "sourceType", "sourceId", "title", "previewText", "metadata",
          "firstQuery", "lastQuery", "hitCount", "score",
          "firstAccessedAt", "lastAccessedAt", "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11::jsonb,
          $12, $13, 1, $14,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("cacheKey") DO UPDATE
        SET
          "title" = EXCLUDED."title",
          "previewText" = EXCLUDED."previewText",
          "metadata" = EXCLUDED."metadata",
          "lastQuery" = EXCLUDED."lastQuery",
          "hitCount" = "MemoryKnowledgeCache"."hitCount" + 1,
          "score" = GREATEST("MemoryKnowledgeCache"."score", EXCLUDED."score"),
          "lastAccessedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      `,
      entry.id,
      entry.cacheKey,
      entry.ownerId,
      entry.targetType,
      entry.courseId,
      entry.notebookId,
      entry.sourceType,
      entry.sourceId,
      entry.title,
      entry.previewText,
      jsonParam(entry.metadata),
      entry.firstQuery,
      entry.lastQuery,
      entry.score,
    );
  }
}

export async function listKnowledgeCache(args: {
  prisma: PrismaClient;
  ownerId: string;
  target: ReadableStudyMemoryTarget;
  query: string;
  limit?: number;
}): Promise<KnowledgeCacheEntry[]> {
  await ensureKnowledgeCacheTable(args.prisma);
  const courseId = targetCourseId(args.target);
  const notebookId = targetNotebookId(args.target);
  const targetType = cacheTargetType(args.target);
  if (!targetType) return [];
  const rows = await args.prisma.$queryRawUnsafe<RawKnowledgeCacheRow[]>(
    `
      SELECT
        "id", "cacheKey", "ownerId", "targetType", "courseId", "notebookId",
        "sourceType", "sourceId", "title", "previewText", "metadata",
        "firstQuery", "lastQuery", "hitCount", "score",
        "firstAccessedAt", "lastAccessedAt", "createdAt", "updatedAt"
      FROM "MemoryKnowledgeCache"
      WHERE "ownerId" = $1
        AND (
          ($4::text = 'course' AND $2::text IS NOT NULL AND "courseId" = $2)
          OR (
            $4::text = 'notebook'
            AND (
              ($3::text IS NOT NULL AND "notebookId" = $3)
              OR (
                $2::text IS NOT NULL
                AND "targetType" = 'course'
                AND "courseId" = $2
              )
            )
          )
        )
      ORDER BY "lastAccessedAt" DESC
      LIMIT 120
    `,
    args.ownerId,
    courseId,
    notebookId,
    targetType,
  );

  const terms = queryTerms(args.query);
  const entries = rows.map(serializeRow);
  const scored = entries.map((entry) => ({
    entry,
    rank: rankEntry(entry, terms),
    textScore: textScore(entry, terms),
  }));
  const matched = terms.length > 0 ? scored.filter((item) => item.textScore > 0) : [];
  const pool = matched.length > 0 ? matched : scored;
  return pool
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        b.entry.hitCount - a.entry.hitCount ||
        new Date(b.entry.lastAccessedAt).getTime() - new Date(a.entry.lastAccessedAt).getTime(),
    )
    .slice(0, Math.max(1, Math.min(args.limit ?? 8, 20)))
    .map((item) => item.entry);
}

export function uniqueKnowledgeCacheEntries(entries: KnowledgeCacheEntry[]): KnowledgeCacheEntry[] {
  return stableEntries(entries);
}
