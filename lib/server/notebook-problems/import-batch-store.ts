import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/lib/server/generated-prisma';

export type ProblemImportTargetType = 'course' | 'notebook';
export type ProblemImportBatchStatus = 'previewed' | 'committed' | 'cancelled';

export type ProblemImportBatchRecord = {
  id: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: ProblemImportTargetType;
  source: string;
  status: ProblemImportBatchStatus;
  sourceFileName: string | null;
  sourceFileMime: string | null;
  sourceTextHash: string | null;
  draftCount: number;
  committedCount: number;
  draftSnapshotJson: unknown;
  usageJson: unknown;
  webSearchJson: unknown;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
};

type RawProblemImportBatchRow = Omit<ProblemImportBatchRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

let ensureProblemImportBatchTablePromise: Promise<void> | null = null;

function createBatchId(): string {
  return `problem_import_${randomUUID().replace(/-/g, '')}`;
}

function hashSourceText(sourceText?: string | null): string | null {
  const text = sourceText?.trim();
  if (!text) return null;
  return createHash('sha256').update(text).digest('hex');
}

function jsonParam(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function cleanOptionalText(value?: string | null): string | null {
  const text = value?.trim();
  return text ? text.slice(0, 240) : null;
}

function serializeRow(row: RawProblemImportBatchRow): ProblemImportBatchRecord {
  return {
    ...row,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function ensureProblemImportBatchTable(prisma: PrismaClient): Promise<void> {
  if (!ensureProblemImportBatchTablePromise) {
    ensureProblemImportBatchTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProblemImportBatch" (
          "id" TEXT PRIMARY KEY,
          "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "courseId" TEXT REFERENCES "Course"("id") ON DELETE CASCADE,
          "notebookId" TEXT REFERENCES "Notebook"("id") ON DELETE SET NULL,
          "targetType" TEXT NOT NULL,
          "source" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'previewed',
          "sourceFileName" TEXT,
          "sourceFileMime" TEXT,
          "sourceTextHash" TEXT,
          "draftCount" INTEGER NOT NULL DEFAULT 0,
          "committedCount" INTEGER NOT NULL DEFAULT 0,
          "draftSnapshotJson" JSONB,
          "usageJson" JSONB,
          "webSearchJson" JSONB,
          "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProblemImportBatch_owner_target_course_updated_idx"
        ON "ProblemImportBatch" ("ownerId", "targetType", "courseId", "updatedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProblemImportBatch_owner_target_notebook_updated_idx"
        ON "ProblemImportBatch" ("ownerId", "targetType", "notebookId", "updatedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ProblemImportBatch_owner_status_updated_idx"
        ON "ProblemImportBatch" ("ownerId", "status", "updatedAt" DESC)
      `);
    })().catch((error) => {
      ensureProblemImportBatchTablePromise = null;
      throw error;
    });
  }
  return ensureProblemImportBatchTablePromise;
}

export async function createProblemImportBatch(args: {
  prisma: PrismaClient;
  userId: string;
  targetType: ProblemImportTargetType;
  courseId?: string | null;
  notebookId?: string | null;
  source: string;
  sourceText?: string | null;
  sourceFileName?: string | null;
  sourceFileMime?: string | null;
  draftSnapshot?: unknown;
  draftCount: number;
  usage?: unknown;
  webSearch?: unknown;
  warnings?: string[];
}): Promise<ProblemImportBatchRecord> {
  await ensureProblemImportBatchTable(args.prisma);
  const rows = await args.prisma.$queryRawUnsafe<RawProblemImportBatchRow[]>(
    `
      INSERT INTO "ProblemImportBatch" (
        "id", "ownerId", "courseId", "notebookId", "targetType", "source",
        "status", "sourceFileName", "sourceFileMime", "sourceTextHash",
        "draftCount", "committedCount", "draftSnapshotJson", "usageJson",
        "webSearchJson", "warnings", "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        'previewed', $7, $8, $9,
        $10, 0, $11::jsonb, $12::jsonb,
        $13::jsonb, $14::text[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `,
    createBatchId(),
    args.userId,
    args.courseId ?? null,
    args.notebookId ?? null,
    args.targetType,
    args.source,
    cleanOptionalText(args.sourceFileName),
    cleanOptionalText(args.sourceFileMime),
    hashSourceText(args.sourceText),
    args.draftCount,
    jsonParam(args.draftSnapshot),
    jsonParam(args.usage),
    jsonParam(args.webSearch),
    args.warnings ?? [],
  );
  return serializeRow(rows[0]);
}

export async function getProblemImportBatchForTarget(args: {
  prisma: PrismaClient;
  userId: string;
  batchId: string;
  targetType: ProblemImportTargetType;
  courseId?: string | null;
  notebookId?: string | null;
}): Promise<ProblemImportBatchRecord | null> {
  await ensureProblemImportBatchTable(args.prisma);
  const rows = await args.prisma.$queryRawUnsafe<RawProblemImportBatchRow[]>(
    `
      SELECT * FROM "ProblemImportBatch"
      WHERE "id" = $1
        AND "ownerId" = $2
        AND "targetType" = $3
        AND (
          ($3 = 'course' AND "courseId" = $4)
          OR ($3 = 'notebook' AND "notebookId" = $5)
        )
      LIMIT 1
    `,
    args.batchId,
    args.userId,
    args.targetType,
    args.courseId ?? null,
    args.notebookId ?? null,
  );
  return rows[0] ? serializeRow(rows[0]) : null;
}

export async function markProblemImportBatchCommitted(args: {
  prisma: PrismaClient;
  userId: string;
  batchId: string;
  committedCount: number;
}): Promise<ProblemImportBatchRecord | null> {
  await ensureProblemImportBatchTable(args.prisma);
  const rows = await args.prisma.$queryRawUnsafe<RawProblemImportBatchRow[]>(
    `
      UPDATE "ProblemImportBatch"
      SET "status" = 'committed',
          "committedCount" = $3,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1 AND "ownerId" = $2
      RETURNING *
    `,
    args.batchId,
    args.userId,
    args.committedCount,
  );
  return rows[0] ? serializeRow(rows[0]) : null;
}
