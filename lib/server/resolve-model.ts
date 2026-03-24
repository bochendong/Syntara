/**
 * Shared model resolution utilities for API routes.
 *
 * LLM access is centralized and forced to the system-managed OpenAI config.
 * Client-supplied model / apiKey / baseUrl are ignored for production use.
 */

import type { NextRequest } from 'next/server';
import { getModel, type ModelWithInfo } from '@/lib/ai/providers';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';

export interface ResolvedModel extends ModelWithInfo {
  /** Original model string (e.g. "openai/gpt-4o-mini") */
  modelString: string;
}

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
}): Promise<ResolvedModel> {
  const config = await getSystemLLMRuntimeConfig();
  const providerId = 'openai';
  const modelId = config.modelId;
  const modelString = `${providerId}:${modelId}`;
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    providerType: 'openai',
    requiresApiKey: true,
  });

  return { model, modelInfo, modelString };
}

/**
 * Resolve a language model from standard request headers.
 *
 * Reads: x-model, x-api-key, x-base-url, x-provider-type, x-requires-api-key
 */
export async function resolveModelFromHeaders(req: NextRequest): Promise<ResolvedModel> {
  return resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    apiKey: req.headers.get('x-api-key') || undefined,
    baseUrl: req.headers.get('x-base-url') || undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
    requiresApiKey: req.headers.get('x-requires-api-key') === 'true' ? true : undefined,
  });
}
