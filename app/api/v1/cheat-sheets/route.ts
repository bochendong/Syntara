import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { POST as generateImage } from '@/app/api/generate/image/route';
import { parseSourceUploadPayload } from '@/app/api/courses/[id]/source-ingest/route';
import { prepareSourceCoverPrompt } from '@/features/memory/server/source-upload-ingestion';
import type { ImageGenerationCostEstimate, ImageGenerationResult } from '@/lib/media/types';
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

type InternalImageResponse = {
  success?: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate;
  error?: string;
};

function imageDataUrl(result: ImageGenerationResult): string | null {
  if (result.base64) {
    return result.base64.startsWith('data:')
      ? result.base64
      : `data:image/png;base64,${result.base64}`;
  }
  return result.url || null;
}

function inlineImage(result: ImageGenerationResult): { contentType: string; bytes: Buffer } | null {
  if (!result.base64) return null;
  const matched = result.base64.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (matched) {
    return { contentType: matched[1] || 'image/png', bytes: Buffer.from(matched[2], 'base64') };
  }
  return { contentType: 'image/png', bytes: Buffer.from(result.base64, 'base64') };
}

function safeDownloadName(title: string): string {
  const normalized = title
    .replace(/[\\/:*?"<>|\r\n]+/g, '-')
    .trim()
    .slice(0, 80);
  return `${normalized || 'syntara-cheat-sheet'}.png`;
}

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  try {
    const payload = await parseSourceUploadPayload(request, {
      outputMode: 'cover_prompt',
      allowClientProviderConfig: false,
    });
    if (payload instanceof NextResponse) {
      return normalizeUpstreamApiError(payload, requestId, 'The source file could not be parsed.');
    }

    const resolved = await resolveOpenAIResponsesModelFromHeaders(request);
    const preview = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/cheat-sheets',
        operationCode: 'public_cheat_sheet_content',
        chargeReason: '生成 Cheat Sheet 内容',
      },
      () =>
        prepareSourceCoverPrompt({
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
          coverTitle: payload.coverTitle,
          coverCourseLabel: payload.coverCourseLabel,
          coverFocus: payload.coverFocus,
          model: resolved.model,
          modelProviderId: resolved.providerId,
        }),
    );

    const imageRequest = new NextRequest(new URL('/api/generate/image', request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-image-provider': 'openai-image',
        'x-image-model': 'gpt-image-2',
        'x-user-id': principal.userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({
        prompt: preview.prompt,
        negativePrompt:
          '乱码、伪汉字、无意义文字、无关公式、写实照片、广告海报、黑色背景、logo、水印',
        width: 1024,
        height: 1448,
        style: 'detailed A4 portrait Chinese study cheat sheet',
        quality: 'medium',
      }),
    });
    const imageResponse = await generateImage(imageRequest);
    const imagePayload = (await imageResponse
      .clone()
      .json()
      .catch(() => null)) as InternalImageResponse | null;
    if (!imageResponse.ok || !imagePayload?.result) {
      return normalizeUpstreamApiError(
        imageResponse,
        requestId,
        imagePayload?.error || 'Cheat Sheet image generation failed.',
      );
    }

    const result = imagePayload.result;
    const wantsImage = request.headers.get('accept')?.toLowerCase().includes('image/');
    if (wantsImage) {
      const image = inlineImage(result);
      if (!image) {
        return publicApiError(
          requestId,
          502,
          'generation_failed',
          'The image provider returned a URL that could not be materialized as image bytes.',
        );
      }
      return new NextResponse(new Uint8Array(image.bytes), {
        status: 200,
        headers: {
          'content-type': image.contentType,
          'content-length': String(image.bytes.byteLength),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(preview.classification.topic || preview.source.title))}`,
          'cache-control': 'no-store',
          'x-request-id': requestId,
          'x-syntara-object-id': `cs_${randomUUID()}`,
        },
      });
    }

    const dataUrl = imageDataUrl(result);
    if (!dataUrl) {
      return publicApiError(
        requestId,
        502,
        'generation_failed',
        'The image provider completed without returning image data.',
      );
    }

    return publicApiSuccess(requestId, {
      id: `cs_${randomUUID()}`,
      object: 'cheat_sheet',
      created_at: new Date().toISOString(),
      title: preview.classification.topic || preview.source.title,
      summary: preview.summary,
      sections: preview.sections,
      source: {
        title: preview.source.title,
        hash: preview.source.hash,
        ai_input: preview.source.aiSynthesisInput,
      },
      image: {
        data_url: dataUrl,
        width: result.width || 1024,
        height: result.height || 1448,
        mime_type: 'image/png',
      },
      model: {
        text: resolved.modelString,
        image: result.usage?.modelId || 'gpt-image-2',
      },
      usage: result.usage || null,
      cost_estimate: imagePayload.costEstimate || null,
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Cheat Sheet generation failed.',
    );
  }
}
