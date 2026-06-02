import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { summarizeSpeechReadinessFromScenes } from '@/lib/audio/speech-readiness-summary';
import type { Action } from '@/lib/types/action';
import { findOwnedCourse } from '@/lib/server/repositories/course-repository';
import {
  createOwnedNotebook,
  findNotebookOwner,
  listOwnedNotebooks,
  listOwnedNotebooksWithSpeechActions,
  updateOwnedNotebook,
} from '@/lib/server/repositories/notebook-repository';

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
    const includeSpeech = searchParams.get('includeSpeech') === '1';

    if (!includeSpeech) {
      const notebooks = await listOwnedNotebooks(prisma, userId, courseId);
      return NextResponse.json({ notebooks });
    }

    const notebooks = await listOwnedNotebooksWithSpeechActions(prisma, userId, courseId);
    return NextResponse.json({
      notebooks: notebooks.map(({ scenes, ...notebook }) => {
        const speech = summarizeSpeechReadinessFromScenes(
          scenes.map((scene) => ({
            actions: (scene.actions as unknown as Action[] | undefined) ?? undefined,
          })),
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
      const ownCourse = await findOwnedCourse(prisma, userId, rest.courseId);
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    if (clientId) {
      const existing = await findNotebookOwner(prisma, clientId);
      if (existing) {
        if (existing.ownerId !== userId) {
          return NextResponse.json({ error: 'Notebook id already in use' }, { status: 409 });
        }
        const notebook = await updateOwnedNotebook(prisma, userId, clientId, rest);
        if (!notebook) {
          return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
        }
        return NextResponse.json({ notebook });
      }
    }

    const notebook = await createOwnedNotebook(prisma, userId, {
      ...(clientId ? { id: clientId } : {}),
      ...rest,
    });

    return NextResponse.json({ notebook }, { status: 201 });
  });
}
