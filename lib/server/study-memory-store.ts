import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/lib/server/generated-prisma';

export type StudyMemoryTargetType = 'course' | 'notebook';
export type StudyMemoryScopeValue = 'public' | 'private';
export type StudyMemoryStatusValue = 'active' | 'archived';

export type StudyMemoryRecord = {
  id: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: StudyMemoryTargetType;
  scope: StudyMemoryScopeValue;
  kind: string;
  status: StudyMemoryStatusValue;
  source: string;
  title: string;
  text: string;
  reason: string | null;
  question: string | null;
  sourceReferences: unknown;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
};

type RawStudyMemoryRow = Omit<StudyMemoryRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type StudyMemoryTarget = {
  targetType: StudyMemoryTargetType;
  targetId: string;
  courseId: string | null;
  notebookId: string | null;
};

let ensureStudyMemoryTablePromise: Promise<void> | null = null;

function serializeRow(row: RawStudyMemoryRow): StudyMemoryRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function createMemoryId(): string {
  return `memory_${randomUUID().replace(/-/g, '')}`;
}

export async function ensureStudyMemoryTable(prisma: PrismaClient): Promise<void> {
  if (!ensureStudyMemoryTablePromise) {
    ensureStudyMemoryTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "StudyMemory" (
          "id" TEXT PRIMARY KEY,
          "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "courseId" TEXT REFERENCES "Course"("id") ON DELETE CASCADE,
          "notebookId" TEXT REFERENCES "Notebook"("id") ON DELETE CASCADE,
          "targetType" TEXT NOT NULL,
          "scope" TEXT NOT NULL,
          "kind" TEXT NOT NULL DEFAULT 'manual',
          "status" TEXT NOT NULL DEFAULT 'active',
          "source" TEXT NOT NULL DEFAULT 'manual',
          "title" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "reason" TEXT,
          "question" TEXT,
          "sourceReferences" JSONB,
          "confidence" DOUBLE PRECISION,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "StudyMemory_owner_target_course_updated_idx"
        ON "StudyMemory" ("ownerId", "targetType", "courseId", "updatedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "StudyMemory_owner_target_notebook_updated_idx"
        ON "StudyMemory" ("ownerId", "targetType", "notebookId", "updatedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "StudyMemory_owner_scope_status_updated_idx"
        ON "StudyMemory" ("ownerId", "scope", "status", "updatedAt" DESC)
      `);
    })().catch((error) => {
      ensureStudyMemoryTablePromise = null;
      throw error;
    });
  }
  return ensureStudyMemoryTablePromise;
}

export async function resolveOwnedStudyMemoryTarget(
  prisma: PrismaClient,
  userId: string,
  targetType: StudyMemoryTargetType,
  targetId: string,
): Promise<StudyMemoryTarget | null> {
  if (targetType === 'course') {
    const course = await prisma.course.findFirst({
      where: { id: targetId, ownerId: userId },
      select: { id: true },
    });
    if (!course) return null;
    return { targetType, targetId, courseId: course.id, notebookId: null };
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id: targetId, ownerId: userId },
    select: { id: true, courseId: true },
  });
  if (!notebook) return null;
  return { targetType, targetId, courseId: notebook.courseId, notebookId: notebook.id };
}

export async function listStudyMemories(
  prisma: PrismaClient,
  userId: string,
  target: StudyMemoryTarget,
): Promise<StudyMemoryRecord[]> {
  await ensureStudyMemoryTable(prisma);
  const rows =
    target.targetType === 'course'
      ? await prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
          `
          SELECT * FROM "StudyMemory"
          WHERE "ownerId" = $1 AND "targetType" = 'course' AND "courseId" = $2
          ORDER BY "updatedAt" DESC
          LIMIT 120
        `,
          userId,
          target.courseId,
        )
      : await prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
          `
          SELECT * FROM "StudyMemory"
          WHERE "ownerId" = $1 AND "targetType" = 'notebook' AND "notebookId" = $2
          ORDER BY "updatedAt" DESC
          LIMIT 120
        `,
          userId,
          target.notebookId,
        );
  return rows.map(serializeRow);
}

export async function createStudyMemory(args: {
  prisma: PrismaClient;
  userId: string;
  target: StudyMemoryTarget;
  scope: StudyMemoryScopeValue;
  kind: string;
  source: string;
  title: string;
  text: string;
  status?: StudyMemoryStatusValue;
  reason?: string | null;
  question?: string | null;
  sourceReferences?: unknown;
  confidence?: number | null;
}): Promise<StudyMemoryRecord> {
  await ensureStudyMemoryTable(args.prisma);
  const id = createMemoryId();
  const sourceReferences =
    args.sourceReferences === undefined ? null : JSON.stringify(args.sourceReferences);
  const rows = await args.prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
    `
      INSERT INTO "StudyMemory" (
        "id", "ownerId", "courseId", "notebookId", "targetType",
        "scope", "kind", "status", "source", "title", "text",
        "reason", "question", "sourceReferences", "confidence",
        "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `,
    id,
    args.userId,
    args.target.courseId,
    args.target.notebookId,
    args.target.targetType,
    args.scope,
    args.kind,
    args.status ?? 'active',
    args.source,
    args.title,
    args.text,
    args.reason ?? null,
    args.question ?? null,
    sourceReferences,
    args.confidence ?? null,
  );
  return serializeRow(rows[0]);
}

export async function updateStudyMemoryStatus(args: {
  prisma: PrismaClient;
  userId: string;
  memoryId: string;
  status: StudyMemoryStatusValue;
}): Promise<StudyMemoryRecord | null> {
  await ensureStudyMemoryTable(args.prisma);
  const rows = await args.prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
    `
      UPDATE "StudyMemory"
      SET "status" = $3, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1 AND "ownerId" = $2
      RETURNING *
    `,
    args.memoryId,
    args.userId,
    args.status,
  );
  return rows[0] ? serializeRow(rows[0]) : null;
}

export async function deleteStudyMemory(args: {
  prisma: PrismaClient;
  userId: string;
  memoryId: string;
}): Promise<boolean> {
  await ensureStudyMemoryTable(args.prisma);
  const rows = await args.prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      DELETE FROM "StudyMemory"
      WHERE "id" = $1 AND "ownerId" = $2
      RETURNING "id"
    `,
    args.memoryId,
    args.userId,
  );
  return rows.length > 0;
}
