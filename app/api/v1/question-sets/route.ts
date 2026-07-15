import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { POST as routeQuestionSource } from '@/app/api/platform-tests/question-source/route';
import {
  normalizeUpstreamApiError,
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';

export const runtime = 'nodejs';
export const maxDuration = 300;

const requestSchema = z.object({
  course_code: z.enum(['MAT136', 'CSC148']),
  source_case: z.enum([
    'empty_no_notes',
    'empty_with_notes',
    'sufficient_bank',
    'partial_no_notes',
    'partial_with_notes',
  ]),
  topic: z.string().trim().min(1).max(500),
  requested_count: z.number().int().min(1).max(12),
  partial_bank_size: z.number().int().min(0).max(11).optional(),
  notebook_content: z.string().trim().max(30_000).optional().default(''),
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
        'Invalid question-set request.',
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;
    const internalRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': principal.userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({
        courseCode: input.course_code,
        sourceCase: input.source_case,
        topic: input.topic,
        requestedCount: input.requested_count,
        partialBankSize: input.partial_bank_size,
        notebookContent: input.notebook_content,
      }),
    });
    const response = await routeQuestionSource(internalRequest);
    if (!response.ok) {
      return normalizeUpstreamApiError(response, requestId, 'Question routing failed.');
    }
    const result = (await response.json()) as Record<string, unknown>;
    return publicApiSuccess(requestId, {
      id: `qset_${randomUUID()}`,
      object: 'question_set',
      created_at: new Date().toISOString(),
      ...result,
      storage: 'none',
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Question routing failed.',
    );
  }
}
