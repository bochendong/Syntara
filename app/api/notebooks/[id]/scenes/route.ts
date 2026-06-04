import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';
import { persistLocalGeneratedNotebookImages } from '@/lib/server/notebook-scene-image-assets';
import { stripPrivateSpeechAudioFromActions } from '@/lib/server/speech-action-assets';
import {
  findReadableNotebookId,
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
const IMAGE_NOTEBOOK_FOCUS_REPAIR_KEY = 'imageNotebookFocusRepair';

function attachGenerationDiagnosticsToContent(content: unknown, diagnostics: unknown): unknown {
  if (!diagnostics || !content || typeof content !== 'object' || Array.isArray(content)) {
    return content;
  }
  return {
    ...(content as Record<string, unknown>),
    [SCENE_CONTENT_DIAGNOSTICS_KEY]: diagnostics,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getCanvasElements(content: unknown): Array<Record<string, unknown>> {
  if (!isRecord(content)) return [];
  const canvas = content.canvas;
  if (!isRecord(canvas) || !Array.isArray(canvas.elements)) return [];
  return canvas.elements.filter(isRecord);
}

function hasFullPageBitmap(content: unknown): boolean {
  return getCanvasElements(content).some((element) => {
    if (element.type !== 'image') return false;
    const name = String(element.name || '');
    const width = Number(element.width || 0);
    const height = Number(element.height || 0);
    return /full_page_bitmap/i.test(name) || (width >= 900 && height >= 500);
  });
}

function hasImageNotebookFocusRepair(content: unknown): boolean {
  if (!isRecord(content)) return false;
  const diagnostics = content[SCENE_CONTENT_DIAGNOSTICS_KEY];
  return isRecord(diagnostics) && isRecord(diagnostics[IMAGE_NOTEBOOK_FOCUS_REPAIR_KEY]);
}

function shouldPreserveRepairedImageNotebookContent(
  existingContent: unknown,
  incomingContent: unknown,
) {
  return (
    hasImageNotebookFocusRepair(existingContent) &&
    hasFullPageBitmap(existingContent) &&
    hasFullPageBitmap(incomingContent) &&
    !hasImageNotebookFocusRepair(incomingContent)
  );
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const notebook = await findReadableNotebookId(prisma, userId, id);
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    const scenes = await listNotebookScenes(prisma, id);
    return NextResponse.json({
      scenes: scenes.map((scene) => ({
        ...scene,
        actions: stripPrivateSpeechAudioFromActions(scene.actions),
      })),
    });
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

    const existingScenes = await listNotebookScenes(prisma, id);
    const existingById = new Map(existingScenes.map((scene) => [scene.id, scene]));
    const existingByOrder = new Map(existingScenes.map((scene) => [scene.order, scene]));

    const sceneData = await Promise.all(
      payload.data.scenes.map(async (s) => {
        const contentWithDiagnostics = attachGenerationDiagnosticsToContent(
          s.content,
          s.generationDiagnostics,
        );
        const { content } = await persistLocalGeneratedNotebookImages(
          prisma,
          contentWithDiagnostics,
        );
        const existingScene =
          (s.id ? existingById.get(s.id) : undefined) || existingByOrder.get(s.order);
        const mergedContent = shouldPreserveRepairedImageNotebookContent(
          existingScene?.content,
          content,
        )
          ? existingScene?.content
          : content;
        return {
          id: s.id,
          title: s.title,
          type: s.type,
          order: s.order,
          content: toPrismaJson(mergedContent),
          actions: toPrismaNullableJson(stripPrivateSpeechAudioFromActions(s.actions)),
          whiteboard: toPrismaNullableJson(s.whiteboards),
        };
      }),
    );

    const scenes = await replaceOwnedNotebookScenes(prisma, userId, id, sceneData);
    if (!scenes) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }
    return NextResponse.json({ scenes });
  });
}
