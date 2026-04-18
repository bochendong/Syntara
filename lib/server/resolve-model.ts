/**
 * Shared model resolution utilities for API routes.
 *
 * LLM access is centralized and forced to the system-managed OpenAI config.
 * Client-supplied model / apiKey / baseUrl are ignored for production use.
 */

import type { NextRequest } from 'next/server';
import { getModel, parseModelString, type ModelWithInfo } from '@/lib/ai/providers';
import {
  NOTEBOOK_GENERATION_MODEL_STAGE_HEADER_KEYS,
  type NotebookGenerationModelStage,
} from '@/lib/constants/notebook-generation-model-stages';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Original model string (e.g. "openai/gpt-4o-mini") */
  modelString: string;
  /** Resolved provider ID (kept for compatibility with older call sites). */
  providerId: string;
  /** Effective API key (server-resolved; may be empty if not configured). */
  apiKey: string;
}

type ResolveModelOptions = {
  /**
   * Allow per-request model overrides, but only for the system-managed OpenAI provider.
   * API key and base URL still come from server-side system config.
   */
  allowOpenAIModelOverride?: boolean;
};

/**
 * Resolve a language model from explicit parameters.
 *
 * Use this when model config comes from the request body.
 */
export async function resolveModel(_params: {
  modelString?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  requiresApiKey?: boolean;
}, options: ResolveModelOptions = {}): Promise<ResolvedModel> {
  const config = await getSystemLLMRuntimeConfig();
  const providerId = 'openai';
  let modelId = config.modelId;
  const requestedModelString = _params.modelString?.trim();

  if (options.allowOpenAIModelOverride && requestedModelString) {
    const requested = parseModelString(requestedModelString);
    if (requested.providerId === 'openai' && requested.modelId.trim()) {
      modelId = requested.modelId.trim();
    }
  }

  const modelString = `${providerId}:${modelId}`;
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    providerType: 'openai',
    requiresApiKey: true,
  });

  return { model, modelInfo, modelString, providerId, apiKey: config.apiKey };
}

/**
 * Resolve a language model from standard request headers.
 *
 * Reads: x-model, x-api-key, x-base-url, x-provider-type, x-requires-api-key
 */
export async function resolveModelFromHeaders(
  req: NextRequest,
  options: ResolveModelOptions = {},
): Promise<ResolvedModel> {
  return resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    apiKey: req.headers.get('x-api-key') || undefined,
    baseUrl: req.headers.get('x-base-url') || undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
    requiresApiKey: req.headers.get('x-requires-api-key') === 'true' ? true : undefined,
  }, options);
}

/**
 * Notebook 创建专用：优先读 `x-notebook-model-{stage}`，否则回退 `x-model`，再回退系统默认。
 */
export async function resolveModelFromHeadersForNotebookStage(
  req: NextRequest,
  stage: NotebookGenerationModelStage,
  options: ResolveModelOptions = {},
): Promise<ResolvedModel> {
  const headerName = NOTEBOOK_GENERATION_MODEL_STAGE_HEADER_KEYS[stage];
  const stageModel = req.headers.get(headerName)?.trim();
  const fallbackModel = req.headers.get('x-model')?.trim();
  const modelString = stageModel || fallbackModel || undefined;
  return resolveModel(
    {
      modelString,
      apiKey: req.headers.get('x-api-key') || undefined,
      baseUrl: req.headers.get('x-base-url') || undefined,
      providerType: req.headers.get('x-provider-type') || undefined,
      requiresApiKey: req.headers.get('x-requires-api-key') === 'true' ? true : undefined,
    },
    options,
  );
}
