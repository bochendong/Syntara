import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generatePublicExplanation } from '@/features/public-api/server/explanation';
import {
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { withRequestContext } from '@/lib/server/request-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const requestSchema = z.object({
  kind: z.enum(['concept', 'problem']).default('concept'),
  topic: z.string().trim().min(1).max(12_000),
  course_name: z.string().trim().max(200).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  source_notes: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(240),
        content: z.string().trim().min(1).max(30_000),
        source_ref: z.string().trim().max(500).optional(),
      }),
    )
    .max(12)
    .default([]),
});

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return publicApiError(
        requestId,
        400,
        'invalid_request',
        'Invalid text-explanation request.',
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;
    const resolved = await resolveModelFromHeaders(request);
    const result = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/explanations/text',
        operationCode: 'public_text_explanation',
        chargeReason: '生成文字讲解',
      },
      () =>
        generatePublicExplanation({
          model: resolved.model,
          input: {
            kind: input.kind,
            topic: input.topic,
            courseName: input.course_name,
            language: input.language,
            sourceNotes: input.source_notes.map((note) => ({
              title: note.title,
              content: note.content,
              sourceRef: note.source_ref,
            })),
          },
        }),
    );
    return publicApiSuccess(requestId, {
      id: `exp_${randomUUID()}`,
      object: 'text_explanation',
      created_at: new Date().toISOString(),
      kind: input.kind,
      topic: input.topic,
      markdown: result.markdown,
      evidence_mode: input.source_notes.length ? 'provided_notes' : 'general_knowledge',
      model: resolved.modelString,
      usage: result.usage || null,
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Text explanation generation failed.',
    );
  }
}
