import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  pickRandomCourseAvatarUrl,
  pickStableCourseAvatarUrl,
} from '@/lib/constants/course-avatars';

const createCourseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  purpose: z.enum(['research', 'university', 'daily']).default('daily'),
  university: z.string().trim().max(120).optional(),
  courseCode: z.string().trim().max(60).optional(),
  avatarUrl: z.string().trim().max(2048).optional(),
});

export async function GET() {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const rows = await prisma.course.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });
    const missingAvatar = rows.filter((r) => !r.avatarUrl?.trim());
    if (missingAvatar.length > 0) {
      await prisma.$transaction(
        missingAvatar.map((c) =>
          prisma.course.update({
            where: { id: c.id },
            data: { avatarUrl: pickStableCourseAvatarUrl(c.id) },
          }),
        ),
      );
    }
    const courses = await prisma.course.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ courses });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const payload = createCourseSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const avatarUrl =
      payload.data.avatarUrl?.trim() || pickRandomCourseAvatarUrl();

    const course = await prisma.course.create({
      data: {
        ownerId: userId,
        ...payload.data,
        avatarUrl,
      },
    });

    return NextResponse.json({ course }, { status: 201 });
  });
}
