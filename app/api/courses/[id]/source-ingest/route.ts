import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import {
  ingestCourseSourceUpload,
  type SourceUploadKind,
} from '@/features/memory/server/source-upload-ingestion';

const sourceUploadSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(240),
  sourceKind: z
    .enum(['pdf', 'markdown', 'plain_text', 'pptx', 'problem_bank', 'other'])
    .default('plain_text'),
  sourceFileMime: z.string().trim().max(160).optional(),
  targetNotebookId: z.string().trim().min(1).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  text: z.string().trim().min(1).max(220000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const payload = sourceUploadSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const resolved = await resolveModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    }).catch(() => null);
    const result = await ingestCourseSourceUpload({
      prisma,
      userId: auth.userId,
      courseId: id,
      sourceTitle: payload.data.sourceTitle,
      sourceKind: payload.data.sourceKind as SourceUploadKind,
      sourceFileMime: payload.data.sourceFileMime,
      targetNotebookId: payload.data.targetNotebookId,
      language: payload.data.language,
      text: payload.data.text,
      model: resolved?.model,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Source ingest failed';
      if (message === 'Course not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message === 'Uploaded source text is empty') {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw error;
    });

    if (result instanceof NextResponse) return result;

    return NextResponse.json({
      storage: 'database',
      ingest: result,
    });
  });
}
