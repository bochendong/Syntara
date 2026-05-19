import { applyCreditDelta, ensureUserCreditsInitialized } from '@/lib/server/credits';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import {
  findCoursePurchaseWithClonedCourse,
  findNotebookPurchaseWithClonedNotebook,
  findPublicCourseForClone,
  findPublicNotebookForClone,
} from '@/lib/server/repositories/store-repository';
import type { RootDbClient } from '@/lib/server/repositories/types';
import { pickRandomCourseAvatarUrl } from '@/lib/constants/course-avatars';
import { creditsFromPriceCents } from '@/lib/utils/credits';

export type StorePurchaseResult<T> =
  | { status: 'not_found' }
  | { status: 'existing'; item: T }
  | { status: 'created'; item: T };

export async function cloneStoreCourseForUser(
  db: RootDbClient,
  userId: string,
  sourceCourseId: string,
) {
  const source = await findPublicCourseForClone(db, userId, sourceCourseId);
  if (!source) return { status: 'not_found' } as const;

  const existingPurchase = await findCoursePurchaseWithClonedCourse(db, userId, source.id);
  if (existingPurchase?.clonedCourse) {
    return { status: 'existing', item: existingPurchase.clonedCourse } as const;
  }

  const avatarUrl = source.avatarUrl?.trim() || pickRandomCourseAvatarUrl();
  const courseCostCredits = creditsFromPriceCents(source.coursePriceCents ?? 0);
  const creatorSaleCredits = creditsFromPriceCents(source.coursePriceCents ?? 0);

  const course = await db.$transaction(async (tx) => {
    await ensureUserCreditsInitialized(tx, userId);
    await ensureUserCreditsInitialized(tx, source.ownerId);

    if (courseCostCredits > 0) {
      await applyCreditDelta(tx, {
        userId,
        delta: -courseCostCredits,
        kind: 'COURSE_PURCHASE',
        accountType: 'PURCHASE',
        description: `Purchased course "${source.name}"`,
        referenceType: 'course',
        referenceId: source.id,
      });
      if (creatorSaleCredits > 0) {
        await applyCreditDelta(tx, {
          userId: source.ownerId,
          delta: creatorSaleCredits,
          kind: 'CREATOR_COURSE_SALE',
          accountType: 'CASH',
          description: `Course sale: "${source.name}"`,
          referenceType: 'course',
          referenceId: source.id,
        });
      }
    }

    const clonedCourse = await tx.course.create({
      data: {
        ownerId: userId,
        name: source.name,
        description: source.description ?? undefined,
        language: source.language,
        tags: source.tags,
        purpose: source.purpose,
        university: source.university ?? undefined,
        courseCode: source.courseCode ?? undefined,
        avatarUrl,
        listedInCourseStore: false,
        coursePriceCents: 0,
        sourceCourseId: source.id,
      },
    });

    for (const notebook of source.notebooks) {
      const clonedNotebook = await tx.notebook.create({
        data: {
          ownerId: userId,
          courseId: clonedCourse.id,
          name: notebook.name,
          description: notebook.description ?? undefined,
          tags: notebook.tags,
          avatarUrl: notebook.avatarUrl ?? undefined,
          language: notebook.language ?? undefined,
          style: notebook.style ?? undefined,
          listedInNotebookStore: false,
          notebookPriceCents: 0,
          sourceNotebookId: notebook.id,
        },
      });

      if (notebook.scenes.length > 0) {
        await tx.scene.createMany({
          data: notebook.scenes.map((scene) => ({
            notebookId: clonedNotebook.id,
            title: scene.title,
            type: scene.type,
            order: scene.order,
            content: toPrismaJson(scene.content),
            actions: toPrismaNullableJson(scene.actions),
            whiteboard: toPrismaNullableJson(scene.whiteboard),
          })),
        });
      }
    }

    await tx.coursePurchase.create({
      data: {
        buyerId: userId,
        sourceCourseId: source.id,
        clonedCourseId: clonedCourse.id,
        priceCents: source.coursePriceCents ?? 0,
      },
    });

    return clonedCourse;
  });

  return { status: 'created', item: course } as const;
}

export async function cloneStoreNotebookForUser(
  db: RootDbClient,
  userId: string,
  sourceNotebookId: string,
) {
  const source = await findPublicNotebookForClone(db, userId, sourceNotebookId);
  if (!source) return { status: 'not_found' } as const;

  const existingPurchase = await findNotebookPurchaseWithClonedNotebook(db, userId, source.id);
  if (existingPurchase?.clonedNotebook) {
    return { status: 'existing', item: existingPurchase.clonedNotebook } as const;
  }

  const notebookCostCredits = creditsFromPriceCents(source.notebookPriceCents ?? 0);
  const creatorSaleCredits = creditsFromPriceCents(source.notebookPriceCents ?? 0);

  const notebook = await db.$transaction(async (tx) => {
    await ensureUserCreditsInitialized(tx, userId);
    await ensureUserCreditsInitialized(tx, source.ownerId);

    if (notebookCostCredits > 0) {
      await applyCreditDelta(tx, {
        userId,
        delta: -notebookCostCredits,
        kind: 'NOTEBOOK_PURCHASE',
        accountType: 'PURCHASE',
        description: `Purchased notebook "${source.name}"`,
        referenceType: 'notebook',
        referenceId: source.id,
      });
      if (creatorSaleCredits > 0) {
        await applyCreditDelta(tx, {
          userId: source.ownerId,
          delta: creatorSaleCredits,
          kind: 'CREATOR_NOTEBOOK_SALE',
          accountType: 'CASH',
          description: `Notebook sale: "${source.name}"`,
          referenceType: 'notebook',
          referenceId: source.id,
        });
      }
    }

    const clonedNotebook = await tx.notebook.create({
      data: {
        ownerId: userId,
        courseId: null,
        name: source.name,
        description: source.description ?? undefined,
        tags: source.tags,
        avatarUrl: source.avatarUrl ?? undefined,
        language: source.language ?? undefined,
        style: source.style ?? undefined,
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sourceNotebookId: source.id,
      },
    });

    if (source.scenes.length > 0) {
      await tx.scene.createMany({
        data: source.scenes.map((scene) => ({
          notebookId: clonedNotebook.id,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: toPrismaJson(scene.content),
          actions: toPrismaNullableJson(scene.actions),
          whiteboard: toPrismaNullableJson(scene.whiteboard),
        })),
      });
    }

    await tx.notebookPurchase.create({
      data: {
        buyerId: userId,
        sourceNotebookId: source.id,
        clonedNotebookId: clonedNotebook.id,
        priceCents: source.notebookPriceCents ?? 0,
      },
    });

    return clonedNotebook;
  });

  return { status: 'created', item: notebook } as const;
}
