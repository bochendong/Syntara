import { applyCreditDelta, ensureUserCreditsInitialized } from '@/lib/server/credits';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import {
  findCoursePurchaseWithClonedCourse,
  findNotebookPurchaseWithClonedNotebook,
  findPublicCourseForClone,
  findPublicNotebookForClone,
  listPublishedCourseProblemsForClone,
  listPublishedNotebookProblemsForClone,
} from '@/lib/server/repositories/store-repository';
import type { RootDbClient } from '@/lib/server/repositories/types';
import type { Prisma } from '@/lib/server/generated-prisma';
import { pickRandomCourseAvatarUrl } from '@/lib/constants/course-avatars';
import { creditsFromPriceCents } from '@/lib/utils/credits';

export type StorePurchaseResult<T> =
  | { status: 'not_found' }
  | { status: 'existing'; item: T }
  | { status: 'created'; item: T };

type PublishedProblemForClone = Awaited<
  ReturnType<typeof listPublishedCourseProblemsForClone>
>[number];

async function clonePublishedProblemTx(args: {
  tx: Prisma.TransactionClient;
  problem: PublishedProblemForClone;
  courseId: string | null;
  notebookId: string | null;
}) {
  const clonedProblem = await args.tx.notebookProblem.create({
    data: {
      courseId: args.courseId,
      notebookId: args.notebookId,
      title: args.problem.title,
      type: args.problem.type,
      status: args.problem.status,
      source: args.problem.source,
      order: args.problem.order,
      problemNumber: args.problem.problemNumber,
      points: args.problem.points,
      tags: args.problem.tags,
      difficulty: args.problem.difficulty,
      publicContentJson: toPrismaJson(args.problem.publicContentJson),
      gradingJson: toPrismaJson(args.problem.gradingJson),
      sourceMeta: toPrismaNullableJson(args.problem.sourceMeta),
    },
  });

  if (args.problem.secret?.secretJudgeJson) {
    await args.tx.notebookProblemSecret.create({
      data: {
        problemId: clonedProblem.id,
        secretJudgeJson: toPrismaJson(args.problem.secret.secretJudgeJson),
      },
    });
  }
}

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
  const sourceNotebookIds = source.notebooks.map((notebook) => notebook.id);
  const sourceProblems = await listPublishedCourseProblemsForClone(
    db,
    source.id,
    sourceNotebookIds,
  );

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

    const clonedNotebookIdBySourceId = new Map<string, string>();
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
      clonedNotebookIdBySourceId.set(notebook.id, clonedNotebook.id);
    }

    for (const problem of sourceProblems) {
      const clonedNotebookId = problem.notebookId
        ? (clonedNotebookIdBySourceId.get(problem.notebookId) ?? null)
        : null;
      await clonePublishedProblemTx({
        tx,
        problem,
        courseId: clonedCourse.id,
        notebookId: clonedNotebookId,
      });
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
  const sourceProblems = await listPublishedNotebookProblemsForClone(db, source.id);

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

    for (const problem of sourceProblems) {
      await clonePublishedProblemTx({
        tx,
        problem,
        courseId: null,
        notebookId: clonedNotebook.id,
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
