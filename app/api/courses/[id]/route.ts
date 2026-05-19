import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { pickStableCourseAvatarUrl } from '@/lib/constants/course-avatars';
import { getCoursePublishBlockReasonFromFlags } from '@/lib/utils/course-publish';
import {
  countPurchasedNotebooksInOwnedCourse,
  deleteOwnedCourseWithNotebooks,
  findOwnedCourse,
  syncOwnedCourseNotebookStoreState,
  updateOwnedCourse,
} from '@/lib/server/repositories/course-repository';

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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    let course = await findOwnedCourse(prisma, userId, id);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    if (!course.avatarUrl?.trim()) {
      course =
        (await updateOwnedCourse(prisma, userId, id, {
          avatarUrl: pickStableCourseAvatarUrl(id),
        })) ?? course;
    }
    return NextResponse.json({ course });
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
    return NextResponse.json({ course });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const existing = await findOwnedCourse(prisma, userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    await deleteOwnedCourseWithNotebooks(prisma, userId, id);
    return NextResponse.json({ ok: true });
  });
}
