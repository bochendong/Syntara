import type { DbClient } from '@/lib/server/repositories/types';
import { findCourseEnrollment } from '@/lib/server/repositories/course-enrollment-repository';

export function listPublicStoreCoursesForUser(db: DbClient, userId: string) {
  return db.course.findMany({
    where: {
      listedInCourseStore: true,
      ownerId: { not: userId },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { notebooks: true } },
      notebooks: {
        select: {
          sceneCount: true,
          speechReadyCount: true,
          speechTotalCount: true,
          speechStatus: true,
        },
      },
    },
  });
}

export function findPublicStoreCourseDetail(db: DbClient, userId: string, courseId: string) {
  return db.course.findFirst({
    where: {
      id: courseId,
      listedInCourseStore: true,
      ownerId: { not: userId },
    },
    include: {
      owner: { select: { name: true, email: true } },
      notebooks: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          tags: true,
          avatarUrl: true,
          listedInNotebookStore: true,
          notebookPriceCents: true,
          updatedAt: true,
          createdAt: true,
          sceneCount: true,
          problemCount: true,
          publishedProblemCount: true,
          speechReadyCount: true,
          speechTotalCount: true,
          speechStatus: true,
        },
      },
    },
  });
}

export function listCourseReviewRatings(db: DbClient, courseIds: string[]) {
  return db.courseReview.findMany({
    where: { courseId: { in: courseIds } },
    select: { courseId: true, rating: true },
  });
}

export async function listCoursePurchasesForSources(
  db: DbClient,
  buyerId: string,
  sourceCourseIds: string[],
) {
  const [legacyPurchases, enrollmentRows] = await Promise.all([
    db.coursePurchase.findMany({
      where: { buyerId, sourceCourseId: { in: sourceCourseIds } },
      select: { sourceCourseId: true },
    }),
    Promise.all(
      sourceCourseIds.map(async (sourceCourseId) => {
        const enrollment = await findCourseEnrollment(db, buyerId, sourceCourseId);
        return enrollment ? { sourceCourseId } : null;
      }),
    ),
  ]);
  return [
    ...legacyPurchases,
    ...enrollmentRows.filter((row): row is { sourceCourseId: string } => Boolean(row)),
  ];
}

export async function findCoursePurchase(db: DbClient, buyerId: string, sourceCourseId: string) {
  const enrollment = await findCourseEnrollment(db, buyerId, sourceCourseId);
  if (enrollment) {
    return { id: enrollment.id, clonedCourseId: null };
  }
  return db.coursePurchase.findFirst({
    where: { buyerId, sourceCourseId },
    select: { id: true, clonedCourseId: true },
  });
}

export function findCoursePurchaseWithClonedCourse(
  db: DbClient,
  buyerId: string,
  sourceCourseId: string,
) {
  return db.coursePurchase.findFirst({
    where: { buyerId, sourceCourseId },
    include: { clonedCourse: true },
  });
}

export function listCourseReviewsWithReviewer(db: DbClient, courseId: string) {
  return db.courseReview.findMany({
    where: { courseId },
    orderBy: { updatedAt: 'desc' },
    include: {
      reviewer: { select: { name: true, email: true, image: true } },
    },
  });
}

export function upsertCourseReview(
  db: DbClient,
  args: {
    courseId: string;
    reviewerId: string;
    rating: number;
    comment?: string | null;
  },
) {
  return db.courseReview.upsert({
    where: {
      courseId_reviewerId: {
        courseId: args.courseId,
        reviewerId: args.reviewerId,
      },
    },
    update: {
      rating: args.rating,
      comment: args.comment,
    },
    create: {
      courseId: args.courseId,
      reviewerId: args.reviewerId,
      rating: args.rating,
      comment: args.comment,
    },
  });
}

export function listNotebookPurchasesForSources(
  db: DbClient,
  buyerId: string,
  sourceNotebookIds: string[],
) {
  return db.notebookPurchase.findMany({
    where: {
      buyerId,
      sourceNotebookId: { in: sourceNotebookIds },
    },
    select: { sourceNotebookId: true, clonedNotebookId: true },
  });
}

export function findPublicCourseForClone(db: DbClient, userId: string, sourceCourseId: string) {
  return db.course.findFirst({
    where: {
      id: sourceCourseId,
      listedInCourseStore: true,
      ownerId: { not: userId },
    },
    include: {
      notebooks: {
        include: {
          scenes: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { updatedAt: 'asc' },
      },
    },
  });
}

export function findPublicCourseForEnrollment(
  db: DbClient,
  userId: string,
  sourceCourseId: string,
) {
  return db.course.findFirst({
    where: {
      id: sourceCourseId,
      listedInCourseStore: true,
      ownerId: { not: userId },
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      coursePriceCents: true,
    },
  });
}

export function findPublicNotebookForClone(db: DbClient, userId: string, sourceNotebookId: string) {
  return db.notebook.findFirst({
    where: {
      id: sourceNotebookId,
      listedInNotebookStore: true,
      ownerId: { not: userId },
    },
    include: {
      scenes: { orderBy: { order: 'asc' } },
      markdownSections: { orderBy: { order: 'asc' } },
    },
  });
}

export function findNotebookPurchaseWithClonedNotebook(
  db: DbClient,
  buyerId: string,
  sourceNotebookId: string,
) {
  return db.notebookPurchase.findFirst({
    where: { buyerId, sourceNotebookId },
    include: { clonedNotebook: true },
  });
}

export function listPublishedCourseProblemsForClone(
  db: DbClient,
  sourceCourseId: string,
  sourceNotebookIds: string[],
) {
  return db.notebookProblem.findMany({
    where: {
      status: 'published',
      OR:
        sourceNotebookIds.length > 0
          ? [{ courseId: sourceCourseId }, { notebookId: { in: sourceNotebookIds } }]
          : [{ courseId: sourceCourseId }],
    },
    include: { secret: true },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
}

export function listPublishedNotebookProblemsForClone(db: DbClient, sourceNotebookId: string) {
  return db.notebookProblem.findMany({
    where: {
      status: 'published',
      notebookId: sourceNotebookId,
    },
    include: { secret: true },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
}
