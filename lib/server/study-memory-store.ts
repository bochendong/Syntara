import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import {
  findCourseAccessRole,
  type CourseAccessRole,
} from '@/lib/server/repositories/course-enrollment-repository';
import { indexStudyMemoryRecord } from '@/lib/server/study-memory-vector-store';

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
  createdAt: string;
  updatedAt: string;
};

type RawStudyMemoryRow = Omit<StudyMemoryRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

const STUDY_MEMORY_COLUMNS = `
  "id", "ownerId", "courseId", "notebookId", "targetType", "scope", "kind", "status",
  "source", "title", "text", "reason", "question", "sourceReferences", "createdAt", "updatedAt"
`;

export type StudyMemoryTarget = {
  targetType: StudyMemoryTargetType;
  targetId: string;
  courseId: string | null;
  notebookId: string | null;
};

export type ReadableStudyMemoryTarget = StudyMemoryTarget & {
  targetOwnerId: string;
  accessRole: CourseAccessRole;
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
          "confidence" DOUBLE PRECISION DEFAULT 1,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "StudyMemory"
        ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION DEFAULT 1
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

export async function resolveReadableStudyMemoryTarget(
  prisma: PrismaClient,
  userId: string | null | undefined,
  targetType: StudyMemoryTargetType,
  targetId: string,
): Promise<ReadableStudyMemoryTarget | null> {
  if (targetType === 'course') {
    const course = await prisma.course.findUnique({
      where: { id: targetId },
      select: { id: true, ownerId: true },
    });
    if (!course) return null;
    if (course.ownerId === userId) {
      return {
        targetType,
        targetId,
        courseId: course.id,
        notebookId: null,
        targetOwnerId: course.ownerId,
        accessRole: 'owner',
      };
    }
    if (!userId) {
      return {
        targetType,
        targetId,
        courseId: course.id,
        notebookId: null,
        targetOwnerId: course.ownerId,
        accessRole: 'enrolled',
      };
    }
    const accessRole = await findCourseAccessRole(prisma, userId, course.id);
    if (!accessRole) return null;
    return {
      targetType,
      targetId,
      courseId: course.id,
      notebookId: null,
      targetOwnerId: course.ownerId,
      accessRole,
    };
  }

  const notebook = await prisma.notebook.findUnique({
    where: { id: targetId },
    select: { id: true, ownerId: true, courseId: true },
  });
  if (!notebook) return null;
  if (notebook.ownerId === userId) {
    return {
      targetType,
      targetId,
      courseId: notebook.courseId,
      notebookId: notebook.id,
      targetOwnerId: notebook.ownerId,
      accessRole: 'owner',
    };
  }
  if (!userId) {
    return {
      targetType,
      targetId,
      courseId: notebook.courseId,
      notebookId: notebook.id,
      targetOwnerId: notebook.ownerId,
      accessRole: 'enrolled',
    };
  }
  if (!notebook.courseId) return null;
  const accessRole = await findCourseAccessRole(prisma, userId, notebook.courseId);
  if (!accessRole) return null;
  return {
    targetType,
    targetId,
    courseId: notebook.courseId,
    notebookId: notebook.id,
    targetOwnerId: notebook.ownerId,
    accessRole,
  };
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
          SELECT ${STUDY_MEMORY_COLUMNS} FROM "StudyMemory"
          WHERE "ownerId" = $1 AND "targetType" = 'course' AND "courseId" = $2
          ORDER BY
            CASE
              WHEN "kind" = 'course_teaching_control' THEN 0
              WHEN "kind" = 'notebook_teaching_control' THEN 1
              WHEN "source" = 'manual_teaching_control_memory' THEN 2
              ELSE 3
            END ASC,
            CASE WHEN "scope" = 'public' THEN 0 ELSE 1 END ASC,
            "updatedAt" DESC
          LIMIT 120
        `,
          userId,
          target.courseId,
        )
      : await prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
          `
          SELECT ${STUDY_MEMORY_COLUMNS} FROM "StudyMemory"
          WHERE "ownerId" = $1 AND "targetType" = 'notebook' AND "notebookId" = $2
          ORDER BY
            CASE
              WHEN "kind" = 'course_teaching_control' THEN 0
              WHEN "kind" = 'notebook_teaching_control' THEN 1
              WHEN "source" = 'manual_teaching_control_memory' THEN 2
              ELSE 3
            END ASC,
            CASE WHEN "scope" = 'public' THEN 0 ELSE 1 END ASC,
            "updatedAt" DESC
          LIMIT 120
        `,
          userId,
          target.notebookId,
        );
  return rows.map(serializeRow);
}

export async function listStudyMemoriesForViewer(
  prisma: PrismaClient,
  userId: string | null | undefined,
  target: ReadableStudyMemoryTarget,
): Promise<StudyMemoryRecord[]> {
  await ensureStudyMemoryTable(prisma);
  const rows =
    target.targetType === 'course'
      ? await prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
          `
          SELECT ${STUDY_MEMORY_COLUMNS} FROM "StudyMemory"
          WHERE "targetType" = 'course'
            AND "courseId" = $1
            AND "status" = 'active'
            AND (
              ("ownerId" = $2 AND "scope" = 'public')
              OR ($3::text IS NOT NULL AND "ownerId" = $3 AND "scope" = 'private')
            )
          ORDER BY
            CASE
              WHEN "kind" = 'course_teaching_control' THEN 0
              WHEN "kind" = 'notebook_teaching_control' THEN 1
              WHEN "source" = 'manual_teaching_control_memory' THEN 2
              ELSE 3
            END ASC,
            CASE WHEN "scope" = 'public' THEN 0 ELSE 1 END ASC,
            "updatedAt" DESC
          LIMIT 120
        `,
          target.courseId,
          target.targetOwnerId,
          userId,
        )
      : await prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
          `
          SELECT ${STUDY_MEMORY_COLUMNS} FROM "StudyMemory"
          WHERE "targetType" = 'notebook'
            AND "notebookId" = $1
            AND "status" = 'active'
            AND (
              ("ownerId" = $2 AND "scope" = 'public')
              OR ($3::text IS NOT NULL AND "ownerId" = $3 AND "scope" = 'private')
            )
          ORDER BY
            CASE
              WHEN "kind" = 'course_teaching_control' THEN 0
              WHEN "kind" = 'notebook_teaching_control' THEN 1
              WHEN "source" = 'manual_teaching_control_memory' THEN 2
              ELSE 3
            END ASC,
            CASE WHEN "scope" = 'public' THEN 0 ELSE 1 END ASC,
            "updatedAt" DESC
          LIMIT 120
        `,
          target.notebookId,
          target.targetOwnerId,
          userId,
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
}): Promise<StudyMemoryRecord> {
  await ensureStudyMemoryTable(args.prisma);
  const existing = await args.prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
    `
      SELECT ${STUDY_MEMORY_COLUMNS}
      FROM "StudyMemory"
      WHERE
        "ownerId" = $1
        AND "targetType" = $2
        AND "scope" = $3
        AND "status" = $4
        AND "title" = $5
        AND "text" = $6
        AND (
          ($7::text IS NULL AND "courseId" IS NULL)
          OR "courseId" = $7
        )
        AND (
          ($8::text IS NULL AND "notebookId" IS NULL)
          OR "notebookId" = $8
        )
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    args.userId,
    args.target.targetType,
    args.scope,
    args.status ?? 'active',
    args.title,
    args.text,
    args.target.courseId,
    args.target.notebookId,
  );
  if (existing[0]) {
    const memory = serializeRow(existing[0]);
    try {
      await indexStudyMemoryRecord(args.prisma, memory);
    } catch (error) {
      console.warn('[study-memory-store] failed to index existing memory', {
        memoryId: memory.id,
        error,
      });
    }
    return memory;
  }

  const id = createMemoryId();
  const sourceReferences =
    args.sourceReferences === undefined ? null : JSON.stringify(args.sourceReferences);
  const rows = await args.prisma.$queryRawUnsafe<RawStudyMemoryRow[]>(
    `
      INSERT INTO "StudyMemory" (
        "id", "ownerId", "courseId", "notebookId", "targetType",
        "scope", "kind", "status", "source", "title", "text",
        "reason", "question", "sourceReferences",
        "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING ${STUDY_MEMORY_COLUMNS}
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
  );
  const memory = serializeRow(rows[0]);
  try {
    await indexStudyMemoryRecord(args.prisma, memory);
  } catch (error) {
    console.warn('[study-memory-store] failed to index created memory', {
      memoryId: memory.id,
      error,
    });
  }
  return memory;
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
      RETURNING ${STUDY_MEMORY_COLUMNS}
    `,
    args.memoryId,
    args.userId,
    args.status,
  );
  if (!rows[0]) return null;
  const memory = serializeRow(rows[0]);
  try {
    await indexStudyMemoryRecord(args.prisma, memory);
  } catch (error) {
    console.warn('[study-memory-store] failed to update memory vector index', {
      memoryId: memory.id,
      error,
    });
  }
  return memory;
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
