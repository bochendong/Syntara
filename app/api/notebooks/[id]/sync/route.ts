import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const target = await prisma.notebook.findFirst({
      where: { id, ownerId: userId },
      select: {
        id: true,
        ownerId: true,
        courseId: true,
        listedInNotebookStore: true,
        notebookPriceCents: true,
        sourceNotebookId: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }
    if (!target.sourceNotebookId) {
      return NextResponse.json({ error: '当前笔记本不是购买副本，无法更新' }, { status: 400 });
    }

    const source = await prisma.notebook.findFirst({
      where: { id: target.sourceNotebookId },
      include: {
        scenes: {
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!source) {
      return NextResponse.json({ error: '发布者原始笔记本不存在，无法更新' }, { status: 404 });
    }

    const notebook = await prisma.$transaction(async (tx) => {
      await tx.notebook.update({
        where: { id: target.id },
        data: {
          name: source.name,
          description: source.description,
          tags: source.tags,
          avatarUrl: source.avatarUrl,
          language: source.language,
          style: source.style,
          // 保持用户自己的归属课程和商城状态不变，仅同步内容。
          courseId: target.courseId,
          listedInNotebookStore: target.listedInNotebookStore,
          notebookPriceCents: target.notebookPriceCents,
        },
      });

      await tx.scene.deleteMany({
        where: { notebookId: target.id },
      });

      if (source.scenes.length > 0) {
        await tx.scene.createMany({
          data: source.scenes.map((scene) => ({
            notebookId: target.id,
            title: scene.title,
            type: scene.type,
            order: scene.order,
            content: toPrismaJson(scene.content),
            actions: toPrismaNullableJson(scene.actions),
            whiteboard: toPrismaNullableJson(scene.whiteboard),
          })),
        });
      }

      return tx.notebook.findUnique({
        where: { id: target.id },
        include: {
          scenes: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    return NextResponse.json({
      notebook,
      syncedFromSourceNotebookId: target.sourceNotebookId,
    });
  });
}
