import { creditsFromUsd } from '@/lib/utils/credits';

export type OpenAITextPricing = {
  canonicalModelId: string;
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type OpenAIImageUsage = {
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  textInputTokens?: number | null;
  imageInputTokens?: number | null;
};

export const OPENAI_WEB_SEARCH_USD_PER_1000_CALLS = 10;
export const OPENAI_RETAIL_MARKUP_MULTIPLIER = 1.5;

export const OPENAI_IMAGE_PRICING = {
  'gpt-image-2': {
    imageInputUsdPerMillionTokens: 8,
    imageCachedInputUsdPerMillionTokens: 2,
    imageOutputUsdPerMillionTokens: 30,
    textInputUsdPerMillionTokens: 5,
    textCachedInputUsdPerMillionTokens: 1.25,
    textOutputUsdPerMillionTokens: 0,
  },
  'gpt-image-1.5': {
    imageInputUsdPerMillionTokens: 8,
    imageCachedInputUsdPerMillionTokens: 2,
    imageOutputUsdPerMillionTokens: 32,
    textInputUsdPerMillionTokens: 5,
    textCachedInputUsdPerMillionTokens: 1.25,
    textOutputUsdPerMillionTokens: 10,
  },
  'gpt-image-1-mini': {
    imageInputUsdPerMillionTokens: 2.5,
    imageCachedInputUsdPerMillionTokens: 0.25,
    imageOutputUsdPerMillionTokens: 8,
    textInputUsdPerMillionTokens: 2,
    textCachedInputUsdPerMillionTokens: 0.2,
    textOutputUsdPerMillionTokens: 0,
  },
} as const;

export const OPENAI_REALTIME_PRICING = {
  'gpt-realtime-1.5': {
    audioInputUsdPerMillionTokens: 32,
    audioCachedInputUsdPerMillionTokens: 0.4,
    audioOutputUsdPerMillionTokens: 64,
    textInputUsdPerMillionTokens: 4,
    textCachedInputUsdPerMillionTokens: 0.4,
    textOutputUsdPerMillionTokens: 16,
    imageInputUsdPerMillionTokens: 5,
    imageCachedInputUsdPerMillionTokens: 0.5,
  },
} as const;

const OPENAI_TEXT_PRICING: Record<string, OpenAITextPricing> = {
  'gpt-5.4': {
    canonicalModelId: 'gpt-5.4',
    inputUsdPerMillionTokens: 2.5,
    cachedInputUsdPerMillionTokens: 0.25,
    outputUsdPerMillionTokens: 15,
  },
  'gpt-5.4-mini': {
    canonicalModelId: 'gpt-5.4-mini',
    inputUsdPerMillionTokens: 0.75,
    cachedInputUsdPerMillionTokens: 0.075,
    outputUsdPerMillionTokens: 4.5,
  },
  'gpt-5.4-nano': {
    canonicalModelId: 'gpt-5.4-nano',
    inputUsdPerMillionTokens: 0.2,
    cachedInputUsdPerMillionTokens: 0.02,
    outputUsdPerMillionTokens: 1.25,
  },
};

const OPENAI_TEXT_MODEL_ALIASES: Record<string, string> = {
  'gpt-5': 'gpt-5.4',
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5-nano': 'gpt-5.4-nano',
};

const OPENAI_IMAGE_MODEL_ALIASES: Record<string, string> = {
  'gpt-image-1': 'gpt-image-1.5',
};

function normalizeModelKey(modelIdOrString: string | null | undefined): string {
  const raw = (modelIdOrString || '').trim().toLowerCase();
  if (!raw) return '';
  const modelId = raw.includes(':') ? raw.split(':').pop() || raw : raw;
  return OPENAI_TEXT_MODEL_ALIASES[modelId] || modelId;
}

function normalizeImageModelKey(modelIdOrString: string | null | undefined): string {
  const raw = (modelIdOrString || '').trim().toLowerCase();
  if (!raw) return '';
  const modelId = raw.includes(':') ? raw.split(':').pop() || raw : raw;
  return OPENAI_IMAGE_MODEL_ALIASES[modelId] || modelId;
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function getOpenAITextPricing(
  modelIdOrString: string | null | undefined,
  providerId?: string | null,
): OpenAITextPricing | null {
  const normalizedProviderId = providerId?.trim().toLowerCase();
  if (normalizedProviderId && normalizedProviderId !== 'openai') return null;
  const normalizedModelId = normalizeModelKey(modelIdOrString);
  return OPENAI_TEXT_PRICING[normalizedModelId] ?? null;
}

export function estimateOpenAITextUsageBaseCostUsd(args: {
  modelId?: string | null;
  modelString?: string | null;
  providerId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
}): number | null {
  const pricing = getOpenAITextPricing(args.modelString || args.modelId, args.providerId);
  if (!pricing) return null;

  const inputTokens = toSafeInt(args.inputTokens);
  const outputTokens = toSafeInt(args.outputTokens);
  const cachedInputTokens = Math.min(toSafeInt(args.cachedInputTokens), inputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  return (
    (uncachedInputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}

export function estimateOpenAITextUsageRetailCostUsd(args: {
  modelId?: string | null;
  modelString?: string | null;
  providerId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
}): number | null {
  const baseUsd = estimateOpenAITextUsageBaseCostUsd(args);
  if (baseUsd == null) return null;
  return baseUsd * OPENAI_RETAIL_MARKUP_MULTIPLIER;
}

export function estimateOpenAITextUsageRetailCostCredits(args: {
  modelId?: string | null;
  modelString?: string | null;
  providerId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
}): number | null {
  const usd = estimateOpenAITextUsageRetailCostUsd(args);
  if (usd == null) return null;
  return creditsFromUsd(usd, 'ceil');
}

export function estimateOpenAIImageGenerationBaseCostUsd(
  usage: OpenAIImageUsage | null | undefined,
): number | null {
  const normalizedModelId = normalizeImageModelKey(usage?.modelId);
  const pricing = OPENAI_IMAGE_PRICING[normalizedModelId as keyof typeof OPENAI_IMAGE_PRICING];
  if (!pricing) return null;

  const inputTokens = toSafeInt(usage?.inputTokens);
  const reportedTextInputTokens = toSafeInt(usage?.textInputTokens);
  const imageInputTokens = toSafeInt(usage?.imageInputTokens);
  const textInputTokens =
    reportedTextInputTokens > 0 || imageInputTokens > 0 ? reportedTextInputTokens : inputTokens;
  const outputTokens = toSafeInt(usage?.outputTokens);

  return (
    (textInputTokens / 1_000_000) * pricing.textInputUsdPerMillionTokens +
    (imageInputTokens / 1_000_000) * pricing.imageInputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * pricing.imageOutputUsdPerMillionTokens
  );
}

export function estimateOpenAIImageGenerationRetailCostUsd(
  usage: OpenAIImageUsage | null | undefined,
): number | null {
  const baseUsd = estimateOpenAIImageGenerationBaseCostUsd(usage);
  if (baseUsd == null) return null;
  return baseUsd * OPENAI_RETAIL_MARKUP_MULTIPLIER;
}

export function estimateOpenAIImageGenerationRetailCostCredits(
  usage: OpenAIImageUsage | null | undefined,
): number | null {
  const usd = estimateOpenAIImageGenerationRetailCostUsd(usage);
  if (usd == null) return null;
  return creditsFromUsd(usd, 'ceil');
}

export function estimateOpenAIImageGenerationCost(usage: OpenAIImageUsage | null | undefined): {
  baseUsd: number;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number;
} | null {
  const baseUsd = estimateOpenAIImageGenerationBaseCostUsd(usage);
  const retailUsd = estimateOpenAIImageGenerationRetailCostUsd(usage);
  const computeCredits = estimateOpenAIImageGenerationRetailCostCredits(usage);
  if (baseUsd == null || retailUsd == null || computeCredits == null) return null;
  return {
    baseUsd,
    retailUsd,
    computeCredits,
    markupMultiplier: OPENAI_RETAIL_MARKUP_MULTIPLIER,
  };
}

export function estimateWebSearchBaseCostUsd(callCount = 1): number {
  const safeCallCount = Math.max(0, Math.round(callCount));
  return (safeCallCount / 1000) * OPENAI_WEB_SEARCH_USD_PER_1000_CALLS;
}

export function estimateWebSearchRetailCostUsd(callCount = 1): number {
  return estimateWebSearchBaseCostUsd(callCount) * OPENAI_RETAIL_MARKUP_MULTIPLIER;
}

export function estimateWebSearchRetailCostCredits(callCount = 1): number {
  return creditsFromUsd(estimateWebSearchRetailCostUsd(callCount), 'ceil');
}
