import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

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

async function getNotebookForUser(userId: string, id: string) {
  return prisma.notebook.findFirst({
    where: { id, ownerId: userId },
    include: {
      scenes: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const notebook = await getNotebookForUser(userId, id);
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

    const existing = await prisma.notebook.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const nextCourseId = payload.data.courseId;
    if (typeof nextCourseId === 'string') {
      const ownCourse = await prisma.course.findFirst({
        where: { id: nextCourseId, ownerId: userId },
        select: { id: true },
      });
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    const shouldPublishNotebook = payload.data.listedInNotebookStore === true;
    const shouldUnpublishNotebook = payload.data.listedInNotebookStore === false;
    const notebook = await prisma.notebook.update({
      where: { id },
      data: {
        ...payload.data,
        ...(payload.data.courseId === null ? { courseId: null } : {}),
        ...(shouldPublishNotebook ? { storePublishedAt: new Date() } : {}),
        ...(shouldUnpublishNotebook ? { storePublishedAt: null } : {}),
      },
    });
    return NextResponse.json({ notebook });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const existing = await prisma.notebook.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    await prisma.notebook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
