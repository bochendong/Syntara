import type { Prisma } from '@/lib/server/generated-prisma';
import type { DbClient, RootDbClient } from '@/lib/server/repositories/types';

export type CreateOwnedCourseData = Omit<
  Prisma.CourseUncheckedCreateInput,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;

export type UpdateOwnedCourseData = Omit<
  Prisma.CourseUncheckedUpdateManyInput,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;

export function findOwnedCourse(db: DbClient, userId: string, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, ownerId: userId },
  });
}

export function listOwnedCourses(db: DbClient, userId: string) {
  return db.course.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export function listOwnedCoursesWithCloneSourceOwner(db: DbClient, userId: string) {
  return db.course.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      clonePurchase: {
        select: {
          sourceCourse: {
            select: {
              owner: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
}

export async function backfillOwnedCourseAvatars(
  db: RootDbClient,
  courses: Array<{ id: string; avatarUrl: string | null }>,
  pickAvatarUrl: (courseId: string) => string,
) {
  const missingAvatar = courses.filter((course) => !course.avatarUrl?.trim());
  if (missingAvatar.length === 0) return;

  await db.$transaction(
    missingAvatar.map((course) =>
      db.course.update({
        where: { id: course.id },
        data: { avatarUrl: pickAvatarUrl(course.id) },
      }),
    ),
  );
}

export function createOwnedCourse(db: DbClient, userId: string, data: CreateOwnedCourseData) {
  return db.course.create({
    data: {
      ownerId: userId,
      ...data,
    },
  });
}

export async function updateOwnedCourse(
  db: DbClient,
  userId: string,
  courseId: string,
  data: UpdateOwnedCourseData,
) {
  const result = await db.course.updateMany({
    where: { id: courseId, ownerId: userId },
    data,
  });
  if (result.count === 0) return null;
  return findOwnedCourse(db, userId, courseId);
}

export function countPurchasedNotebooksInOwnedCourse(
  db: DbClient,
  userId: string,
  courseId: string,
) {
  return db.notebook.count({
    where: {
      ownerId: userId,
      courseId,
      sourceNotebookId: { not: null },
    },
  });
}

export function syncOwnedCourseNotebookStoreState(
  db: DbClient,
  userId: string,
  courseId: string,
  listedInStore: boolean,
) {
  return db.notebook.updateMany({
    where: { courseId, ownerId: userId },
    data: {
      listedInNotebookStore: listedInStore,
      storePublishedAt: listedInStore ? new Date() : null,
    },
  });
}

export function deleteOwnedCourseWithNotebooks(db: RootDbClient, userId: string, courseId: string) {
  return db.$transaction([
    db.notebook.deleteMany({
      where: {
        ownerId: userId,
        courseId,
      },
    }),
    db.course.delete({ where: { id: courseId } }),
  ]);
}
