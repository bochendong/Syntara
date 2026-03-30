import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';

const bodySchema = z.object({
  sourceNotebookId: z.string().trim().min(1),
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

    const source = await prisma.notebook.findFirst({
      where: {
        id: parsed.data.sourceNotebookId,
        listedInNotebookStore: true,
        ownerId: { not: userId },
      },
      include: {
        scenes: { orderBy: { order: 'asc' } },
      },
    });
    if (!source) {
      return NextResponse.json({ error: '笔记本不存在或未在商城公开' }, { status: 404 });
    }

    const existingPurchase = await prisma.notebookPurchase.findFirst({
      where: { buyerId: userId, sourceNotebookId: source.id },
      include: { clonedNotebook: true },
    });
    if (existingPurchase?.clonedNotebook) {
      return NextResponse.json({ notebook: existingPurchase.clonedNotebook });
    }

    const notebook = await prisma.$transaction(async (tx) => {
      const clonedNotebook = await tx.notebook.create({
        data: {
          ownerId: userId,
          courseId: null,
          name: source.name,
          description: source.description ?? undefined,
          tags: source.tags,
          avatarUrl: source.avatarUrl ?? undefined,
          language: source.language ?? undefined,
          style: source.style ?? undefined,
          listedInNotebookStore: false,
          notebookPriceCents: 0,
          sourceNotebookId: source.id,
        },
      });

      if (source.scenes.length > 0) {
        await tx.scene.createMany({
          data: source.scenes.map((scene) => ({
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

      await tx.notebookPurchase.create({
        data: {
          buyerId: userId,
          sourceNotebookId: source.id,
          clonedNotebookId: clonedNotebook.id,
          priceCents: source.notebookPriceCents ?? 0,
        },
      });

      return clonedNotebook;
    });

    return NextResponse.json({ notebook }, { status: 201 });
  });
}
