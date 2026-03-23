import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';

const sceneInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(60),
  order: z.number().int().min(0),
  content: z.unknown(),
  actions: z.unknown().optional(),
  whiteboards: z.unknown().optional(),
});

const replaceScenesSchema = z.object({
  scenes: z.array(sceneInputSchema).max(500),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const notebook = await prisma.notebook.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const scenes = await prisma.scene.findMany({
      where: { notebookId: id },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json({ scenes });
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = replaceScenesSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: id } }),
      prisma.scene.createMany({
        data: payload.data.scenes.map((s) => ({
          id: s.id,
          notebookId: id,
          title: s.title,
          type: s.type,
          order: s.order,
          content: toPrismaJson(s.content),
          actions: toPrismaNullableJson(s.actions),
          whiteboard: toPrismaNullableJson(s.whiteboards),
        })),
      }),
      prisma.notebook.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ]);

    const scenes = await prisma.scene.findMany({
      where: { notebookId: id },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json({ scenes });
  });
}
