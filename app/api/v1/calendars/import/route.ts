import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { POST as parseSyllabus } from '@/app/api/syllabus/parse/route';
import {
  normalizeUpstreamApiError,
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';

export const runtime = 'nodejs';
export const maxDuration = 300;

type SyllabusResponse = {
  courseTitle?: string | null;
  events?: Array<{
    id: string;
    title: string;
    kind: 'assignment' | 'exam' | 'progress' | 'tutorial' | 'holiday' | 'other';
    date: string;
    week?: string | null;
    sourceColumn?: string | null;
    rawText?: string | null;
    confidence?: number | null;
  }>;
  warnings?: string[];
  modelId?: string;
};

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  try {
    const rawBody = await request.arrayBuffer();
    const headers = new Headers(request.headers);
    headers.set('x-user-id', principal.userId);
    headers.set('x-request-id', requestId);
    headers.delete('authorization');
    const internalRequest = new NextRequest(request.url, {
      method: 'POST',
      headers,
      body: rawBody,
    });
    const response = await parseSyllabus(internalRequest);
    if (!response.ok) {
      return normalizeUpstreamApiError(response, requestId, 'Syllabus parsing failed.');
    }
    const payload = (await response.json()) as SyllabusResponse;
    const createdAt = Date.now();
    const events = (payload.events || []).map((event) => ({
      id: event.id,
      title: event.title,
      kind: event.kind,
      date: event.date,
      week: event.week,
      source_column: event.sourceColumn,
      raw_text: event.rawText,
      confidence: event.confidence,
      source_name: payload.courseTitle || 'Syllabus AI import',
      origin: 'syllabus' as const,
      created_at: createdAt,
    }));

    return publicApiSuccess(requestId, {
      id: `cal_${randomUUID()}`,
      object: 'calendar',
      created_at: new Date(createdAt).toISOString(),
      course_title: payload.courseTitle || null,
      timezone: request.nextUrl.searchParams.get('timezone') || 'Asia/Shanghai',
      events,
      warnings: payload.warnings || [],
      model: payload.modelId || null,
      persistence: 'caller_managed',
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Calendar import failed.',
    );
  }
}
