import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  pickRandomCourseAvatarUrl,
  pickStableCourseAvatarUrl,
} from '@/lib/constants/course-avatars';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) return e.split('@')[0] || e;
  return '匿名创作者';
}

const createCourseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  purpose: z.enum(['research', 'university', 'daily']).default('daily'),
  university: z.string().trim().max(120).optional(),
  courseCode: z.string().trim().max(60).optional(),
  avatarUrl: z.string().trim().max(2048).optional(),
  listedInCourseStore: z.boolean().optional(),
  coursePriceCents: z.number().int().min(0).max(100000000).optional(),
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
      include: {
        clonePurchase: {
          select: {
            sourceCourse: {
              select: {
                owner: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    });
    return NextResponse.json({
      courses: courses.map((course) => {
        const sourceOwner = course.clonePurchase?.sourceCourse.owner;
        const { clonePurchase: _clonePurchase, ...courseWithoutRelations } = course;
        return {
          ...courseWithoutRelations,
          sourceOwnerName: sourceOwner ? ownerDisplayName(sourceOwner) : undefined,
        };
      }),
    });
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

    const avatarUrl = payload.data.avatarUrl?.trim() || pickRandomCourseAvatarUrl();

    const { listedInCourseStore, ...rest } = payload.data;
    const course = await prisma.course.create({
      data: {
        ownerId: userId,
        ...rest,
        avatarUrl,
        ...(listedInCourseStore ? { storePublishedAt: new Date() } : {}),
        ...(listedInCourseStore !== undefined ? { listedInCourseStore } : {}),
      },
    });

    return NextResponse.json({ course }, { status: 201 });
  });
}
