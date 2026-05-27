/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the specified provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (default: 'seedream')
 *   x-api-key: string (optional, server fallback)
 *   x-base-url: string (optional, server fallback)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { generateImage, aspectRatioToDimensions } from '@/lib/media/image-providers';
import { resolveImageApiKey, resolveImageBaseUrl } from '@/lib/server/provider-config';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { assertUserHasCredits, chargeCreditsForImageGeneration } from '@/lib/server/credits';
import { getRequestContext, runWithRequestContext } from '@/lib/server/request-context';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { estimateOpenAIImageGenerationCost } from '@/lib/utils/openai-pricing';

const log = createLogger('ImageGeneration API');

export const maxDuration = 60;

function shouldSkipCreditChargeForTestRequest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;

  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

function createImageCostEstimate(
  providerId: ImageProviderId,
  modelId: string,
  result: ImageGenerationResult,
): ImageGenerationCostEstimate | null {
  if (providerId !== 'openai-image' || !result.usage) return null;

  const inputTokens = result.usage.inputTokens || 0;
  const outputTokens = result.usage.outputTokens || 0;
  const totalTokens = result.usage.totalTokens || inputTokens + outputTokens;
  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return null;

  const estimate = estimateOpenAIImageGenerationCost({
    modelId,
    ...result.usage,
  });
  if (!estimate) return null;

  return {
    providerId,
    modelId,
    currency: 'USD',
    baseUsd: estimate.baseUsd,
    retailUsd: estimate.retailUsd,
    computeCredits: estimate.computeCredits,
    markupMultiplier: estimate.markupMultiplier,
    pricingSource: 'openai-api-pricing',
    isEstimate: true,
  };
}

const ASPECT_RATIO_OUTPUT_SIZES: Record<
  NonNullable<ImageGenerationOptions['aspectRatio']>,
  { width: number; height: number }
> = {
  '16:9': { width: 1792, height: 1008 },
  '4:3': { width: 1536, height: 1152 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 1008, height: 1792 },
};

function parseImageBase64(data: string): string {
  return data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function isAspectRatioClose(result: ImageGenerationResult, aspectRatio: string): boolean {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h || !result.width || !result.height) return true;
  const expected = w / h;
  const actual = result.width / result.height;
  return Math.abs(actual - expected) < 0.01;
}

async function normalizeOpenAiImageAspectRatio(
  result: ImageGenerationResult,
  aspectRatio?: ImageGenerationOptions['aspectRatio'],
): Promise<ImageGenerationResult> {
  if (!aspectRatio || isAspectRatioClose(result, aspectRatio)) return result;

  const targetSize = ASPECT_RATIO_OUTPUT_SIZES[aspectRatio];
  if (!targetSize) return result;

  let sourceBuffer: Buffer | null = null;
  if (result.base64) {
    sourceBuffer = Buffer.from(parseImageBase64(result.base64), 'base64');
  } else if (result.url) {
    const response = await fetch(result.url);
    if (response.ok) {
      sourceBuffer = Buffer.from(await response.arrayBuffer());
    }
  }

  if (!sourceBuffer) return result;

  const sharp = (await import('sharp')).default;
  const normalized = await sharp(sourceBuffer)
    .resize(targetSize.width, targetSize.height, {
      fit: 'contain',
      background: '#ffffff',
    })
    .png()
    .toBuffer();

  return {
    ...result,
    url: undefined,
    base64: normalized.toString('base64'),
    width: targetSize.width,
    height: targetSize.height,
  };
}

async function materializeImageResultInline(
  result: ImageGenerationResult,
): Promise<ImageGenerationResult> {
  if (result.base64 || !result.url) return result;
  try {
    const response = await fetch(result.url);
    if (!response.ok) return result;
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) return result;
    const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
    return {
      ...result,
      base64: `data:${contentType};base64,${base64}`,
    };
  } catch {
    return result;
  }
}

export async function POST(request: NextRequest) {
  return runWithRequestContext(request, '/api/generate/image', async () => {
    try {
      const body = (await request.json()) as ImageGenerationOptions & {
        notebookContext?: {
          id?: string;
          name?: string;
          courseId?: string;
          courseName?: string;
          sceneId?: string;
          sceneTitle?: string;
          sceneOrder?: number;
          sceneType?: string;
        };
      };

      if (!body.prompt) {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
      }

      const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
      const clientApiKey = request.headers.get('x-api-key') || undefined;
      const clientBaseUrl = request.headers.get('x-base-url') || undefined;
      const clientModel = request.headers.get('x-image-model') || undefined;

      if (clientBaseUrl && process.env.NODE_ENV === 'production') {
        const ssrfError = validateUrlForSSRF(clientBaseUrl);
        if (ssrfError) {
          return apiError('INVALID_URL', 403, ssrfError);
        }
      }

      const apiKey = clientBaseUrl
        ? clientApiKey || ''
        : resolveImageApiKey(providerId, clientApiKey);
      if (!apiKey) {
        return apiError(
          'MISSING_API_KEY',
          401,
          `No API key configured for image provider: ${providerId}`,
        );
      }

      const baseUrl = clientBaseUrl
        ? clientBaseUrl
        : resolveImageBaseUrl(providerId, clientBaseUrl);

      // Resolve dimensions from aspect ratio if not explicitly set
      if (!body.width && !body.height && body.aspectRatio) {
        const dims = aspectRatioToDimensions(body.aspectRatio);
        body.width = dims.width;
        body.height = dims.height;
      }

      log.info(
        `Generating image: provider=${providerId}, model=${clientModel || 'default'}, ` +
          `prompt="${body.prompt.slice(0, 80)}...", size=${body.width ?? 'auto'}x${body.height ?? 'auto'}`,
      );

      const skipCreditCharge = shouldSkipCreditChargeForTestRequest(request);

      if (providerId === 'openai-image' && !skipCreditCharge) {
        await assertUserHasCredits(getRequestContext()?.userId);
      }

      const rawResult = await generateImage(
        { providerId, apiKey, baseUrl, model: clientModel },
        body,
      );
      const normalizedResult =
        providerId === 'openai-image'
          ? await normalizeOpenAiImageAspectRatio(rawResult, body.aspectRatio)
          : rawResult;
      const result = await materializeImageResultInline(normalizedResult);
      const resolvedModelId = result.usage?.modelId || clientModel || 'gpt-image-2';
      const costEstimate = createImageCostEstimate(providerId, resolvedModelId, result);

      if (providerId === 'openai-image' && !skipCreditCharge) {
        await chargeCreditsForImageGeneration({
          userId: getRequestContext()?.userId,
          providerId,
          modelId: resolvedModelId,
          route: '/api/generate/image',
          prompt: body.prompt,
          notebookGenerationSessionId: getRequestContext()?.notebookGenerationSessionId,
          notebookGenerationTaskId: getRequestContext()?.notebookGenerationTaskId,
          notebookId: body.notebookContext?.id,
          notebookName: body.notebookContext?.name,
          courseId: body.notebookContext?.courseId,
          courseName: body.notebookContext?.courseName,
          sceneId: body.notebookContext?.sceneId,
          sceneTitle: body.notebookContext?.sceneTitle,
          sceneOrder: body.notebookContext?.sceneOrder,
          sceneType: body.notebookContext?.sceneType,
          operationCode: 'media_image_generation',
          chargeReason: '生成笔记本媒体图片',
          serviceLabel: 'OpenAI Image API',
          usage: result.usage,
        });
      }

      const responseBody: {
        result: ImageGenerationResult;
        costEstimate?: ImageGenerationCostEstimate;
        skippedCreditCharge?: boolean;
      } = { result, skippedCreditCharge: skipCreditCharge };
      if (costEstimate) responseBody.costEstimate = costEstimate;

      return apiSuccess(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Detect content safety filter rejections (e.g. Seedream OutputImageSensitiveContentDetected)
      if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
        log.warn(`Image blocked by content safety filter: ${message}`);
        return apiError('CONTENT_SENSITIVE', 400, message);
      }
      log.error('Image generation error:', error);
      return apiError('INTERNAL_ERROR', 500, message);
    }
  });
}
