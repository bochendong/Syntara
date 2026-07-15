import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildMiniLectureDeck,
  buildMiniLecturePrompt,
} from '@/features/learn-core/client-mini-lecture';
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
  topic: z.string().trim().min(1).max(4000),
  course_name: z.string().trim().max(200).optional().default('当前课程'),
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
        'Invalid slide-explanation request.',
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;
    const resolved = await resolveModelFromHeaders(request);
    const question = `请讲解知识点「${input.topic}」，并准备一个不超过 2 页的临时迷你课堂。`;
    const explanation = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/explanations/slides',
        operationCode: 'public_slide_explanation',
        chargeReason: '生成迷你课堂讲解',
      },
      () =>
        generatePublicExplanation({
          model: resolved.model,
          input: {
            kind: 'concept',
            topic: question,
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
    const prompt = buildMiniLecturePrompt({
      question,
      answer: explanation.markdown,
      course: { name: input.course_name },
    });
    if (!prompt) {
      return publicApiError(
        requestId,
        422,
        'generation_failed',
        'The generated explanation was not suitable for a mini lecture deck.',
      );
    }
    const deck = buildMiniLectureDeck(prompt);
    return publicApiSuccess(requestId, {
      id: `deck_${randomUUID()}`,
      object: 'slide_explanation',
      created_at: new Date().toISOString(),
      title: deck.title,
      source_question: deck.sourceQuestion,
      source_markdown: deck.sourceAnswer,
      pages: deck.pages.map((page, index) => ({
        index,
        id: page.id,
        title: page.title,
        image_data_url: page.imageDataUrl,
        regions: page.regions,
        actions: page.actions,
      })),
      marker_protocol: deck.markerProtocol,
      model: resolved.modelString,
      usage: explanation.usage || null,
      storage: 'none',
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Slide explanation generation failed.',
    );
  }
}
