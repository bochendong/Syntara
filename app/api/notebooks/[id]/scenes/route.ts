import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  findOwnedNotebookId,
  listNotebookScenes,
  replaceOwnedNotebookScenes,
} from '@/lib/server/repositories/notebook-repository';

const sceneInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(60),
  order: z.number().int().min(0),
  content: z.unknown(),
  actions: z.unknown().optional(),
  whiteboards: z.unknown().optional(),
  generationDiagnostics: z.unknown().optional(),
});

const replaceScenesSchema = z.object({
  scenes: z.array(sceneInputSchema).max(500),
});

const SCENE_CONTENT_DIAGNOSTICS_KEY = '__generationDiagnostics';

function attachGenerationDiagnosticsToContent(content: unknown, diagnostics: unknown): unknown {
  if (!diagnostics || !content || typeof content !== 'object' || Array.isArray(content)) {
    return content;
  }
  return {
    ...(content as Record<string, unknown>),
    [SCENE_CONTENT_DIAGNOSTICS_KEY]: diagnostics,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const notebook = await findOwnedNotebookId(prisma, userId, id);
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const scenes = await listNotebookScenes(prisma, id);
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

    const scenes = await replaceOwnedNotebookScenes(
      prisma,
      userId,
      id,
      payload.data.scenes.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        order: s.order,
        content: toPrismaJson(
          attachGenerationDiagnosticsToContent(s.content, s.generationDiagnostics),
        ),
        actions: toPrismaNullableJson(s.actions),
        whiteboard: toPrismaNullableJson(s.whiteboards),
      })),
    );
    if (!scenes) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }
    return NextResponse.json({ scenes });
  });
}
