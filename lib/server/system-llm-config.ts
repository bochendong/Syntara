import { createLogger } from '@/lib/logger';
import { getPrismaOrNull } from '@/lib/server/prisma-safe';

const log = createLogger('SystemLLMConfig');

export const DEFAULT_OPENAI_MODEL = process.env.DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
export const DEFAULT_OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';

export interface SystemLLMConfigView {
  providerId: 'openai';
  modelId: string;
  baseUrl?: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  source: 'database' | 'environment';
}

export interface SystemLLMRuntimeConfig {
  providerId: 'openai';
  modelId: string;
  baseUrl?: string;
  apiKey: string;
  source: 'database' | 'environment';
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export async function getSystemLLMRuntimeConfig(): Promise<SystemLLMRuntimeConfig> {
  const prisma = getPrismaOrNull();
  if (prisma) {
    try {
      const row = await prisma.systemLLMConfig.findUnique({ where: { id: 'default' } });
      if (row?.apiKey?.trim()) {
        return {
          providerId: 'openai',
          modelId: row.modelId?.trim() || DEFAULT_OPENAI_MODEL,
          baseUrl: row.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL,
          apiKey: row.apiKey.trim(),
          source: 'database',
        };
      }
    } catch (error) {
      log.warn('Failed to read DB system config, falling back to env:', error);
    }
  }

  return {
    providerId: 'openai',
    modelId: DEFAULT_OPENAI_MODEL,
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY?.trim() || '',
    source: 'environment',
  };
}

export async function getSystemLLMConfigView(): Promise<SystemLLMConfigView> {
  const config = await getSystemLLMRuntimeConfig();
  return {
    providerId: 'openai',
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    apiKeyMasked: maskApiKey(config.apiKey),
    hasApiKey: Boolean(config.apiKey),
    source: config.source,
  };
}

export async function updateSystemLLMConfig(input: {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}): Promise<SystemLLMConfigView> {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    throw new Error('DATABASE_URL 未配置，无法保存系统 OpenAI 配置。');
  }

  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error('系统 OpenAI API Key 不能为空。');
  }

  const modelId = input.modelId?.trim() || DEFAULT_OPENAI_MODEL;
  const baseUrl = input.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;

  await prisma.systemLLMConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      providerId: 'openai',
      modelId,
      apiKey,
      baseUrl,
    },
    update: {
      providerId: 'openai',
      modelId,
      apiKey,
      baseUrl,
    },
  });

  return getSystemLLMConfigView();
}
