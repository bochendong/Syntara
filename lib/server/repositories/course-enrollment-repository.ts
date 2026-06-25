import crypto from 'node:crypto';
import type { DbClient } from '@/lib/server/repositories/types';

export type CourseAccessRole = 'owner' | 'enrolled';

export type CourseEnrollmentRow = {
  id: string;
  userId: string;
  courseId: string;
  priceCents: number;
  joinedAt: Date;
  createdAt: Date;
};

let ensureCourseEnrollmentTablePromise: Promise<void> | null = null;

export async function ensureCourseEnrollmentTable(db: DbClient): Promise<void> {
  ensureCourseEnrollmentTablePromise ??= (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CourseEnrollment" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
        "priceCents" INTEGER NOT NULL DEFAULT 0,
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CourseEnrollment_userId_courseId_key" UNIQUE ("userId", "courseId")
      )
    `);
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "CourseEnrollment_userId_joinedAt_idx" ON "CourseEnrollment"("userId", "joinedAt" DESC)',
    );
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "CourseEnrollment_courseId_joinedAt_idx" ON "CourseEnrollment"("courseId", "joinedAt" DESC)',
    );
  })();
  await ensureCourseEnrollmentTablePromise;
}

export async function findCourseEnrollment(
  db: DbClient,
  userId: string,
  courseId: string,
): Promise<CourseEnrollmentRow | null> {
  await ensureCourseEnrollmentTable(db);
  const rows = await db.$queryRaw<CourseEnrollmentRow[]>`
    SELECT "id", "userId", "courseId", "priceCents", "joinedAt", "createdAt"
    FROM "CourseEnrollment"
    WHERE "userId" = ${userId} AND "courseId" = ${courseId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function hasCourseEnrollment(
  db: DbClient,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const enrollment = await findCourseEnrollment(db, userId, courseId);
  if (enrollment) return true;

  const legacyPurchase = await db.coursePurchase.findFirst({
    where: { buyerId: userId, sourceCourseId: courseId },
    select: { id: true },
  });
  return Boolean(legacyPurchase);
}

export async function findCourseAccessRole(
  db: DbClient,
  userId: string,
  courseId: string,
): Promise<CourseAccessRole | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true },
  });
  if (!course) return null;
  if (course.ownerId === userId) return 'owner';
  return (await hasCourseEnrollment(db, userId, courseId)) ? 'enrolled' : null;
}

export async function requireCourseReadAccess(
  db: DbClient,
  userId: string,
  courseId: string,
): Promise<CourseAccessRole> {
  const role = await findCourseAccessRole(db, userId, courseId);
  if (!role) throw new Error('Course not found');
  return role;
}

export async function createCourseEnrollment(
  db: DbClient,
  args: {
    userId: string;
    courseId: string;
    priceCents: number;
  },
): Promise<CourseEnrollmentRow> {
  await ensureCourseEnrollmentTable(db);
  const id = crypto.randomUUID();
  const rows = await db.$queryRaw<CourseEnrollmentRow[]>`
    INSERT INTO "CourseEnrollment" (
      "id",
      "userId",
      "courseId",
      "priceCents",
      "joinedAt",
      "createdAt"
    )
    VALUES (
      ${id},
      ${args.userId},
      ${args.courseId},
      ${args.priceCents},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId", "courseId") DO UPDATE SET
      "priceCents" = "CourseEnrollment"."priceCents"
    RETURNING "id", "userId", "courseId", "priceCents", "joinedAt", "createdAt"
  `;
  return rows[0];
}

export async function listCourseEnrollmentsForUser(
  db: DbClient,
  userId: string,
): Promise<CourseEnrollmentRow[]> {
  await ensureCourseEnrollmentTable(db);
  return db.$queryRaw<CourseEnrollmentRow[]>`
    SELECT "id", "userId", "courseId", "priceCents", "joinedAt", "createdAt"
    FROM "CourseEnrollment"
    WHERE "userId" = ${userId}
    ORDER BY "joinedAt" DESC
  `;
}

export async function removeCourseEnrollmentForUser(
  db: DbClient,
  userId: string,
  courseId: string,
): Promise<number> {
  await ensureCourseEnrollmentTable(db);
  const result = await db.$executeRaw`
    DELETE FROM "CourseEnrollment"
    WHERE "userId" = ${userId} AND "courseId" = ${courseId}
  `;
  return result;
}
