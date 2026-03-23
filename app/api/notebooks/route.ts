import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

const createNotebookSchema = z.object({
  courseId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  avatarUrl: z.string().trim().max(2048).optional(),
  language: z.string().trim().max(24).optional(),
  style: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim();

    const notebooks = await prisma.notebook.findMany({
      where: {
        ownerId: userId,
        ...(courseId ? { courseId } : {}),
      },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ notebooks });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const payload = createNotebookSchema.safeParse(await request.json());
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
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    const notebook = await prisma.notebook.create({
      data: {
        ownerId: userId,
        ...payload.data,
      },
    });

    return NextResponse.json({ notebook }, { status: 201 });
  });
}
