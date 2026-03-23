import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

const updateCourseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  language: z.enum(['zh-CN', 'en-US']).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  purpose: z.enum(['research', 'university', 'daily']).optional(),
  university: z.string().trim().max(120).optional(),
  courseCode: z.string().trim().max(60).optional(),
  avatarUrl: z.string().trim().max(2048).optional(),
});

async function getCourseForUser(userId: string, id: string) {
  return prisma.course.findFirst({
    where: { id, ownerId: userId },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const course = await getCourseForUser(userId, id);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
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

    const existing = await getCourseForUser(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const course = await prisma.course.update({
      where: { id },
      data: payload.data,
    });
    return NextResponse.json({ course });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const existing = await getCourseForUser(userId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.notebook.deleteMany({
        where: {
          ownerId: userId,
          courseId: id,
        },
      }),
      prisma.course.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  });
}
