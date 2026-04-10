import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { summarizeSpeechReadinessFromScenes } from '@/lib/audio/speech-readiness-summary';

const createNotebookSchema = z.object({
  /** 客户端生成（如 nanoid）的笔记本 id；不传则使用数据库默认 cuid */
  id: z.string().trim().min(8).max(64).optional(),
  courseId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  avatarUrl: z.string().trim().max(2048).optional(),
  language: z.string().trim().max(24).optional(),
  style: z.string().trim().max(80).optional(),
  listedInNotebookStore: z.boolean().optional(),
  notebookPriceCents: z.number().int().min(0).max(100000000).optional(),
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
        scenes: {
          select: { actions: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      notebooks: notebooks.map(({ scenes, ...notebook }) => {
        const speech = summarizeSpeechReadinessFromScenes(
          scenes.map((scene) => ({ actions: (scene.actions as any[] | undefined) ?? undefined })),
        );
        return {
          ...notebook,
          speechReadyCount: speech.ready,
          speechTotalCount: speech.total,
          speechStatus: speech.status,
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

    const payload = createNotebookSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { id: clientId, ...rest } = payload.data;

    if (rest.courseId) {
      const ownCourse = await prisma.course.findFirst({
        where: { id: rest.courseId, ownerId: userId },
        select: { id: true },
      });
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    if (clientId) {
      const existing = await prisma.notebook.findFirst({
        where: { id: clientId },
        select: { id: true, ownerId: true },
      });
      if (existing) {
        if (existing.ownerId !== userId) {
          return NextResponse.json({ error: 'Notebook id already in use' }, { status: 409 });
        }
        const notebook = await prisma.notebook.update({
          where: { id: clientId },
          data: rest,
        });
        return NextResponse.json({ notebook });
      }
    }

    const notebook = await prisma.notebook.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        ownerId: userId,
        ...rest,
      },
    });

    return NextResponse.json({ notebook }, { status: 201 });
  });
}
