import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseSourceUploadPayload } from '@/app/api/courses/[id]/source-ingest/route';
import { prepareSourceMarkdownNotebook } from '@/features/memory/server/source-upload-ingestion';
import {
  normalizeUpstreamApiError,
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';
import { withRequestContext } from '@/lib/server/request-context';
import { resolveOpenAIResponsesModelFromHeaders } from '@/lib/server/resolve-model';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  try {
    const payload = await parseSourceUploadPayload(request, {
      outputMode: 'notebook_content',
      allowClientProviderConfig: false,
    });
    if (payload instanceof NextResponse) {
      return normalizeUpstreamApiError(payload, requestId, 'The source file could not be parsed.');
    }

    const resolved = await resolveOpenAIResponsesModelFromHeaders(request);
    const preview = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/structured-notes',
        operationCode: 'public_structured_note',
        chargeReason: '生成结构化笔记',
      },
      () =>
        prepareSourceMarkdownNotebook({
          sourceTitle: payload.sourceTitle,
          sourceKind: payload.sourceKind,
          sourceFileMime: payload.sourceFileMime,
          text: payload.text,
          rawFileHash: payload.rawFileHash,
          openaiFileId: payload.openaiFileId,
          parser: payload.parser,
          pageCount: payload.pageCount,
          slideCount: payload.slideCount,
          language: payload.language,
          usageProfile: payload.usageProfile,
          model: resolved.model,
          modelProviderId: resolved.providerId,
        }),
    );
    const fullMarkdown = [
      `# ${preview.title || preview.source.title}`,
      ...preview.sections.map((section) => `## ${section.title}\n\n${section.markdown}`),
    ].join('\n\n');

    return publicApiSuccess(requestId, {
      id: `note_${randomUUID()}`,
      object: 'structured_note',
      created_at: new Date().toISOString(),
      title: preview.title || preview.source.title,
      source: {
        title: preview.source.title,
        hash: preview.source.hash,
        ai_input: preview.source.aiSynthesisInput,
      },
      classification: preview.classification,
      routing: preview.routing,
      study_guide: preview.studyGuide,
      sections: preview.sections,
      answer_contract: preview.answerContract,
      full_markdown: fullMarkdown,
      model: resolved.modelString,
      storage: 'none',
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Structured note generation failed.',
    );
  }
}
