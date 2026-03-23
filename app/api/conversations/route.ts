import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';

const createConversationSchema = z.object({
  courseId: z.string().trim().min(1).optional(),
  notebookId: z.string().trim().min(1).optional(),
  kind: z.enum(['notebook', 'agent', 'system']),
  targetId: z.string().trim().max(120).optional(),
  title: z.string().trim().max(200).optional(),
  meta: z.unknown().optional(),
});

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim();
    const notebookId = searchParams.get('notebookId')?.trim();
    const kind = searchParams.get('kind')?.trim();
    const targetId = searchParams.get('targetId')?.trim();
    const kindFilter = kind && ['notebook', 'agent', 'system'].includes(kind) ? kind : undefined;

    const conversations = await prisma.conversation.findMany({
      where: {
        ownerId: userId,
        ...(courseId ? { courseId } : {}),
        ...(notebookId ? { notebookId } : {}),
        ...(targetId ? { targetId } : {}),
        ...(kindFilter ? { kind: kindFilter as 'notebook' | 'agent' | 'system' } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ conversations });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const payload = createConversationSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    if (payload.data.courseId) {
      const ownCourse = await prisma.course.findFirst({
        where: { id: payload.data.courseId, ownerId: userId },
        select: { id: true },
      });
      if (!ownCourse) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    if (payload.data.notebookId) {
      const ownNotebook = await prisma.notebook.findFirst({
        where: { id: payload.data.notebookId, ownerId: userId },
        select: { id: true },
      });
      if (!ownNotebook) return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const conversation = await prisma.conversation.create({
      data: {
        ownerId: userId,
        ...payload.data,
        meta: toPrismaNullableJson(payload.data.meta),
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  });
}
