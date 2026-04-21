import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { extractProblemDraftsFromText } from '@/lib/server/notebook-problems/import';
import { listNotebookProblemsForUser } from '@/lib/server/notebook-problems/service';

const previewSchema = z.object({
  source: z.enum(['chat', 'pdf', 'manual']).default('manual'),
  text: z.string().trim().min(1).max(120000),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    await listNotebookProblemsForUser(auth.userId, id);

    const payload = previewSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { model } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });
    const drafts = await runWithRequestContext(req, '/api/notebooks/problems/import-preview', () =>
      extractProblemDraftsFromText({
        text: payload.data.text,
        source: payload.data.source,
        language: payload.data.language,
        model,
      }),
    );

    return NextResponse.json({ drafts });
  });
}
