import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { pickStableCourseAvatarUrl } from '@/lib/constants/course-avatars';
import { getCoursePublishBlockReasonFromFlags } from '@/lib/utils/course-publish';
import {
  findCourseAccessRole,
  removeCourseEnrollmentForUser,
} from '@/lib/server/repositories/course-enrollment-repository';
import {
  countPurchasedNotebooksInOwnedCourse,
  deleteOwnedCourseWithNotebooks,
  findOwnedCourse,
  syncOwnedCourseNotebookStoreState,
  updateOwnedCourse,
} from '@/lib/server/repositories/course-repository';
import { publishCourseProblemBankForUser } from '@/features/problems/server/service';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) return e.split('@')[0] || e;
  return '匿名创作者';
}

const updateCourseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  language: z.enum(['zh-CN', 'en-US']).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  purpose: z.enum(['research', 'university', 'daily']).optional(),
  university: z.string().trim().max(120).optional(),
  courseCode: z.string().trim().max(60).optional(),
  avatarUrl: z.string().trim().max(2048).optional(),
  listedInCourseStore: z.boolean().optional(),
  coursePriceCents: z.number().int().min(0).max(100000000).optional(),
});

async function countPublicCourseMemoriesForPublish(userId: string, courseId: string) {
  const notebooks = await prisma.notebook.findMany({
    where: { ownerId: userId, courseId },
    select: { id: true },
  });
  const notebookIds = notebooks.map((notebook) => notebook.id);
  return prisma.studyMemory.count({
    where: {
      ownerId: userId,
      scope: 'public',
      status: 'active',
      OR:
        notebookIds.length > 0
          ? [
              { targetType: 'course', courseId },
              { targetType: 'notebook', notebookId: { in: notebookIds } },
            ]
          : [{ targetType: 'course', courseId }],
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const accessRole = await findCourseAccessRole(prisma, userId, id);
    let course = accessRole
      ? await prisma.course.findUnique({
          where: { id },
          include: { owner: { select: { name: true, email: true } } },
        })
      : null;
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    if (accessRole === 'owner' && !course.avatarUrl?.trim()) {
      const updatedCourse = await updateOwnedCourse(prisma, userId, id, {
        avatarUrl: pickStableCourseAvatarUrl(id),
      });
      if (updatedCourse) {
        course = {
          ...updatedCourse,
          owner: course.owner,
        };
      }
    }
    const { owner, ...courseWithoutRelations } = course;
    return NextResponse.json({
      course: {
        ...courseWithoutRelations,
        accessRole,
        sourceOwnerName: accessRole === 'enrolled' ? ownerDisplayName(owner) : undefined,
      },
    });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = updateCourseSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await findOwnedCourse(prisma, userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    if (payload.data.listedInCourseStore === true) {
      const purchasedNotebookCount = await countPurchasedNotebooksInOwnedCourse(prisma, userId, id);
      const publishBlockReason = getCoursePublishBlockReasonFromFlags(
        existing,
        purchasedNotebookCount > 0,
      );
      if (publishBlockReason) {
        return NextResponse.json({ error: publishBlockReason }, { status: 400 });
      }
    }

    const shouldPublishCourse = payload.data.listedInCourseStore === true;
    const shouldUnpublishCourse = payload.data.listedInCourseStore === false;
    const course = await updateOwnedCourse(prisma, userId, id, {
      ...payload.data,
      ...(shouldPublishCourse ? { storePublishedAt: new Date() } : {}),
      ...(shouldUnpublishCourse ? { storePublishedAt: null } : {}),
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    if (payload.data.listedInCourseStore !== undefined) {
      await syncOwnedCourseNotebookStoreState(prisma, userId, id, payload.data.listedInCourseStore);
    }
    let publishScope:
      | {
          problemBank: Awaited<ReturnType<typeof publishCourseProblemBankForUser>> | null;
          publicMemoryCount: number;
          sourceFilesUploaded: false;
          privateContentUploaded: false;
        }
      | undefined;
    if (shouldPublishCourse) {
      // Course publishing deliberately does not copy or upload source files, private study memory,
      // learner progress, or chat transcripts. Public course/notebook memories remain readable
      // through the shared course context; only the problem bank gets an explicit publish pass.
      const [problemBank, publicMemoryCount] = await Promise.all([
        publishCourseProblemBankForUser({ userId, courseId: id }),
        countPublicCourseMemoriesForPublish(userId, id),
      ]);
      publishScope = {
        problemBank,
        publicMemoryCount,
        sourceFilesUploaded: false,
        privateContentUploaded: false,
      };
    }
    return NextResponse.json({ course, publishScope });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const accessRole = await findCourseAccessRole(prisma, userId, id);
    if (!accessRole) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    if (accessRole === 'owner') {
      await deleteOwnedCourseWithNotebooks(prisma, userId, id);
      return NextResponse.json({ ok: true, action: 'deleted' });
    }

    const { removedEnrollment, removedLegacyPurchases } = await prisma.$transaction(async (tx) => ({
      removedEnrollment: await removeCourseEnrollmentForUser(tx, userId, id),
      removedLegacyPurchases: await tx.coursePurchase.deleteMany({
        where: {
          buyerId: userId,
          sourceCourseId: id,
        },
      }),
    }));

    if (removedEnrollment === 0 && removedLegacyPurchases.count === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, action: 'removed' });
  });
}
