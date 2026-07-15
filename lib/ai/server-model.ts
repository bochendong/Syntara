import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getProvider } from '@/lib/ai/providers';
import type { ModelConfig, ModelInfo, ProviderId, ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import { proxyFetch as sharedProxyFetch } from '@/lib/server/proxy-fetch';

const log = createLogger('ServerModel');
const OPENAI_BACKGROUND_POLL_INTERVAL_MS = 2_000;
const OPENAI_BACKGROUND_TIMEOUT_MS = 15 * 60_000;

type OpenAIBackgroundResponse = {
  id?: unknown;
  status?: unknown;
  error?: unknown;
};

function cloneResponseHeaders(headers: Headers): Headers {
  const cloned = new Headers(headers);
  cloned.delete('content-encoding');
  cloned.delete('content-length');
  cloned.delete('transfer-encoding');
  cloned.set('content-type', 'application/json');
  return cloned;
}

function jsonResponse(payload: unknown, source: Response): Response {
  return new Response(JSON.stringify(payload), {
    status: source.status,
    statusText: source.statusText,
    headers: cloneResponseHeaders(source.headers),
  });
}

function isOpenAIResponsesCreateRequest(url: string, init?: RequestInit): boolean {
  const method = String(init?.method || 'GET').toUpperCase();
  return method === 'POST' && /\/responses\/?(?:\?.*)?$/.test(url);
}

function isBackgroundPending(payload: OpenAIBackgroundResponse): boolean {
  return payload.status === 'queued' || payload.status === 'in_progress';
}

function createBackgroundResponsesFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isOpenAIResponsesCreateRequest(url, init) || typeof init?.body !== 'string') {
      return sharedProxyFetch(url, init);
    }

    let requestBody: Record<string, unknown>;
    try {
      requestBody = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return sharedProxyFetch(url, init);
    }
    if (requestBody.stream === true) {
      return sharedProxyFetch(url, init);
    }

    const startedAt = Date.now();
    const createResponse = await sharedProxyFetch(url, {
      ...init,
      body: JSON.stringify({ ...requestBody, background: true, store: true }),
    });
    const created = (await createResponse
      .clone()
      .json()
      .catch(() => null)) as OpenAIBackgroundResponse | null;
    if (!createResponse.ok || !created || !isBackgroundPending(created)) {
      return createResponse;
    }

    const responseId = typeof created.id === 'string' ? created.id : '';
    if (!responseId) return createResponse;
    log.info('OpenAI background response started.', { responseId });

    const requestHeaders = new Headers(init.headers);
    requestHeaders.delete('content-length');
    requestHeaders.delete('content-type');
    const retrieveUrl = `${url.replace(/\/responses\/?(?:\?.*)?$/, '/responses')}/${encodeURIComponent(responseId)}`;
    let lastPayload: OpenAIBackgroundResponse = created;
    let lastResponse = createResponse;

    while (
      isBackgroundPending(lastPayload) &&
      Date.now() - startedAt < OPENAI_BACKGROUND_TIMEOUT_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, OPENAI_BACKGROUND_POLL_INTERVAL_MS));
      try {
        const polled = await sharedProxyFetch(retrieveUrl, {
          method: 'GET',
          headers: requestHeaders,
        });
        const payload = (await polled
          .clone()
          .json()
          .catch(() => null)) as OpenAIBackgroundResponse | null;
        if (!polled.ok || !payload) return polled;
        lastResponse = polled;
        lastPayload = payload;
      } catch (error) {
        // Polling the existing response is idempotent. A transient proxy failure
        // must not submit the paid generation again; keep polling the same ID.
        log.warn('OpenAI background response poll failed; keeping the same response id.', {
          responseId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (isBackgroundPending(lastPayload)) {
      throw new Error(
        `OpenAI background response ${responseId} did not finish within ${OPENAI_BACKGROUND_TIMEOUT_MS / 60_000} minutes.`,
      );
    }
    log.info('OpenAI background response reached a terminal state.', {
      responseId,
      status: lastPayload.status,
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse(lastPayload, lastResponse);
  }) as typeof fetch;
}

/**
 * Model instance with its configuration info.
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

function createOpenAIProvider(config: ModelConfig, fetchOverride?: typeof fetch) {
  const provider = getProvider(config.providerId);
  const effectiveApiKey = config.apiKey || '';
  const effectiveBaseUrl = config.baseUrl || provider?.defaultBaseUrl || undefined;
  if (!effectiveApiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  const openaiOptions: Parameters<typeof createOpenAI>[0] = {
    apiKey: effectiveApiKey,
    baseURL: effectiveBaseUrl,
  };
  const proxyUrl = getProxyUrl(config.proxy);
  if (fetchOverride) openaiOptions.fetch = fetchOverride;
  else if (proxyUrl) openaiOptions.fetch = createProxyFetch(proxyUrl);
  return createOpenAI(openaiOptions);
}

/**
 * Native OpenAI Responses model for source-file inputs.
 *
 * Keep this separate from the general chat-model factory: uploaded PDF file IDs
 * must be sent as Responses API `input_file` parts so the model receives both
 * the PDF text and rendered page images.
 */
export function getServerOpenAIResponsesModel(config: ModelConfig): ModelWithInfo {
  if (config.providerId !== 'openai' || (config.providerType && config.providerType !== 'openai')) {
    throw new Error('OpenAI Responses models require the native OpenAI provider.');
  }
  const provider = getProvider('openai');
  return {
    model: createOpenAIProvider(config, createBackgroundResponsesFetch()).responses(config.modelId),
    modelInfo: provider?.models.find((model) => model.id === config.modelId) || null,
  };
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
