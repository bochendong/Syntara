import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getProvider } from '@/lib/ai/providers';
import type { ModelConfig, ModelInfo, ProviderId, ThinkingConfig } from '@/lib/types/provider';

/**
 * Model instance with its configuration info.
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

function getProxyUrl(explicitProxy?: string): string | undefined {
  return (
    explicitProxy ||
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY ||
    undefined
  );
}

function createProxyFetch(proxyUrl: string): typeof fetch {
  const agent = new ProxyAgent(proxyUrl);
  const fetchWithDispatcher = undiciFetch as unknown as (
    input: RequestInfo | URL,
    init?: RequestInit & { dispatcher?: unknown },
  ) => Promise<Response>;

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithDispatcher(input, {
      ...(init as Record<string, unknown>),
      dispatcher: agent,
    }).then((r: unknown) => r as Response)) as typeof fetch;
}

function getCompatThinkingBodyParams(
  providerId: ProviderId,
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  if (config.enabled === false) {
    switch (providerId) {
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'disabled' } };
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: false };
      default:
        return undefined;
    }
  }

  if (config.enabled === true) {
    switch (providerId) {
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'enabled' } };
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: true };
      default:
        return undefined;
    }
  }

  return undefined;
}

/**
 * Get a configured language model instance with its info.
 *
 * This server-side factory uses static imports so Next/Vercel can trace the
 * provider SDK packages into serverless function bundles.
 */
export function getServerModel(config: ModelConfig): ModelWithInfo {
  let providerType = config.providerType;
  let requiresApiKey = config.requiresApiKey ?? true;
  const provider = getProvider(config.providerId);

  if (!providerType) {
    if (provider) {
      providerType = provider.type;
      requiresApiKey = provider.requiresApiKey;
    } else {
      throw new Error(`Unknown provider: ${config.providerId}. Please provide providerType.`);
    }
  }

  if (requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  const effectiveApiKey = config.apiKey || '';
  const effectiveBaseUrl = config.baseUrl || provider?.defaultBaseUrl || undefined;

  let model: LanguageModel;

  switch (providerType) {
    case 'openai': {
      const openaiOptions: Parameters<typeof createOpenAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      const proxyUrl = getProxyUrl(config.proxy);
      const proxyFetch = proxyUrl ? createProxyFetch(proxyUrl) : undefined;

      if (proxyFetch || config.providerId !== 'openai') {
        const providerId = config.providerId;
        openaiOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
          let requestInit = init;

          if (providerId !== 'openai') {
            const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
              | { getStore?: () => unknown }
              | undefined;
            const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;
            if (thinking && requestInit?.body && typeof requestInit.body === 'string') {
              const extra = getCompatThinkingBodyParams(providerId, thinking);
              if (extra) {
                try {
                  const body = JSON.parse(requestInit.body);
                  Object.assign(body, extra);
                  requestInit = { ...requestInit, body: JSON.stringify(body) };
                } catch {
                  /* leave body as-is */
                }
              }
            }
          }

          return proxyFetch ? proxyFetch(url, requestInit) : globalThis.fetch(url, requestInit);
        };
      }

      model = createOpenAI(openaiOptions).chat(config.modelId);
      break;
    }

    case 'anthropic': {
      model = createAnthropic({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      }).chat(config.modelId);
      break;
    }

    case 'google': {
      const googleOptions: Parameters<typeof createGoogleGenerativeAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      if (config.proxy) {
        googleOptions.fetch = createProxyFetch(config.proxy);
      }

      model = createGoogleGenerativeAI(googleOptions).chat(config.modelId);
      break;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }

  return {
    model,
    modelInfo: provider?.models.find((m) => m.id === config.modelId) || null,
  };
}
