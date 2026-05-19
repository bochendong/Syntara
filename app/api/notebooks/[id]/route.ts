import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { findOwnedCourse } from '@/lib/server/repositories/course-repository';
import {
  deleteOwnedNotebook,
  findOwnedNotebookForStoreUpdate,
  findOwnedNotebookId,
  findOwnedNotebookWithScenes,
  updateOwnedNotebook,
} from '@/lib/server/repositories/notebook-repository';

const updateNotebookSchema = z.object({
  courseId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(3000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).optional(),
  avatarUrl: z.string().trim().max(2048).optional(),
  language: z.string().trim().max(24).optional(),
  style: z.string().trim().max(80).optional(),
  listedInNotebookStore: z.boolean().optional(),
  notebookPriceCents: z.number().int().min(0).max(100000000).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const notebook = await findOwnedNotebookWithScenes(prisma, userId, id);
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }
    return NextResponse.json({ notebook });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = updateNotebookSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await findOwnedNotebookForStoreUpdate(prisma, userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    if (payload.data.listedInNotebookStore === true && existing.sourceNotebookId) {
      return NextResponse.json(
        { error: '购买得到的笔记本副本不能再次发布到商城' },
        { status: 400 },
      );
    }

    const nextCourseId = payload.data.courseId;
    if (typeof nextCourseId === 'string') {
      const ownCourse = await findOwnedCourse(prisma, userId, nextCourseId);
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    const shouldPublishNotebook = payload.data.listedInNotebookStore === true;
    const shouldUnpublishNotebook = payload.data.listedInNotebookStore === false;
    const notebook = await updateOwnedNotebook(prisma, userId, id, {
      ...payload.data,
      ...(payload.data.courseId === null ? { courseId: null } : {}),
      ...(shouldPublishNotebook ? { storePublishedAt: new Date() } : {}),
      ...(shouldUnpublishNotebook ? { storePublishedAt: null } : {}),
    });
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }
    return NextResponse.json({ notebook });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const existing = await findOwnedNotebookId(prisma, userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    await deleteOwnedNotebook(prisma, userId, id);
    return NextResponse.json({ ok: true });
  });
}
