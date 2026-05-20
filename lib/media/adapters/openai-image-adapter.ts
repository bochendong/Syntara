/**
 * OpenAI Images API — GPT Image models (e.g. gpt-image-2)
 *
 * POST {baseUrl}/images/generations
 * GPT image models return base64 by default (URLs are not supported).
 *
 * @see https://platform.openai.com/docs/api-reference/images/create
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

type OpenAiImageSize = '1024x1024' | '1024x1536' | '1536x1024';

function parseSizeDims(size: OpenAiImageSize): { width: number; height: number } {
  const [w, h] = size.split('x').map(Number);
  return { width: w || 1024, height: h || 1024 };
}

function resolveOpenAiSize(options: ImageGenerationOptions): OpenAiImageSize {
  if (options.aspectRatio) {
    switch (options.aspectRatio) {
      case '1:1':
        return '1024x1024';
      case '9:16':
        return '1024x1536';
      case '16:9':
        return '1536x1024';
      case '4:3':
        return '1536x1024';
      default:
        return '1536x1024';
    }
  }
  const w = options.width || 1024;
  const h = options.height || 1024;
  const r = w / h;
  if (r > 1.2) return '1536x1024';
  if (r < 0.85) return '1024x1536';
  return '1024x1024';
}

/**
 * Validates the API key via GET /models (no image generation charge).
 */
export async function testOpenAiImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      return {
        success: false,
        message: `OpenAI auth failed (${response.status}): ${text}`,
      };
    }
    if (!response.ok) {
      const text = await response.text();
      return { success: false, message: `OpenAI error (${response.status}): ${text}` };
    }
    return { success: true, message: 'Connected to OpenAI API' };
  } catch (err) {
    return { success: false, message: `OpenAI connectivity error: ${err}` };
  }
}

export async function generateWithOpenAiImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const model = config.model || DEFAULT_MODEL;
  const size = resolveOpenAiSize(options);
  const { width, height } = parseSizeDims(size);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      n: 1,
      size,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI image generation failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];
  const usage = data.usage
    ? {
        providerId: config.providerId,
        modelId: model,
        inputTokens: Number(data.usage.input_tokens) || 0,
        outputTokens: Number(data.usage.output_tokens) || 0,
        totalTokens: Number(data.usage.total_tokens) || 0,
        textInputTokens: Number(data.usage.input_tokens_details?.text_tokens) || 0,
        imageInputTokens: Number(data.usage.input_tokens_details?.image_tokens) || 0,
      }
    : undefined;
  if (!imageData) {
    throw new Error('OpenAI returned empty image response');
  }

  if (imageData.b64_json) {
    return {
      base64: imageData.b64_json,
      width,
      height,
      usage,
    };
  }

  if (imageData.url) {
    return {
      url: imageData.url,
      width,
      height,
      usage,
    };
  }

  throw new Error('OpenAI image response missing b64_json and url');
}
