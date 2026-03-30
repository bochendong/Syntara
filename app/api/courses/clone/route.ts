import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { pickRandomCourseAvatarUrl } from '@/lib/constants/course-avatars';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';

const bodySchema = z.object({
  sourceCourseId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const source = await prisma.course.findFirst({
      where: {
        id: parsed.data.sourceCourseId,
        listedInCourseStore: true,
        ownerId: { not: userId },
      },
      include: {
        notebooks: {
          include: {
            scenes: {
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { updatedAt: 'asc' },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: '课程不存在或未在商城公开' }, { status: 404 });
    }

    const avatarUrl = source.avatarUrl?.trim() || pickRandomCourseAvatarUrl();

    const existingPurchase = await prisma.coursePurchase.findFirst({
      where: { buyerId: userId, sourceCourseId: source.id },
      include: { clonedCourse: true },
    });
    if (existingPurchase?.clonedCourse) {
      return NextResponse.json({ course: existingPurchase.clonedCourse });
    }

    const course = await prisma.$transaction(async (tx) => {
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

    return NextResponse.json({ course }, { status: 201 });
  });
}
