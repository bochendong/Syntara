import { createLogger } from '@/lib/logger';
import { getPrismaOrNull } from '@/lib/server/prisma-safe';

const log = createLogger('SystemLLMConfig');

export const DEFAULT_OPENAI_MODEL = process.env.DEFAULT_MODEL?.trim() || 'gpt-5.4';
export const DEFAULT_OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';

export interface SystemLLMConfigView {
  providerId: 'openai';
  modelId: string;
  baseUrl?: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  source: 'database' | 'environment';
  /** 仅当 key 来自数据库中的管理员配置时有值 */
  updatedAt: string | null;
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
  const preferDbInDev = process.env.NODE_ENV === 'development';
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
      if (preferDbInDev) {
        log.warn(
          'Development mode: System LLM config row has no API key, falling back to env OPENAI_API_KEY.',
        );
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
  let updatedAt: string | null = null;
  const prisma = getPrismaOrNull();
  if (prisma && config.source === 'database') {
    try {
      const row = await prisma.systemLLMConfig.findUnique({
        where: { id: 'default' },
        select: { updatedAt: true },
      });
      updatedAt = row?.updatedAt ? row.updatedAt.toISOString() : null;
    } catch (error) {
      log.warn('Failed to read SystemLLMConfig updatedAt:', error);
    }
  }
  return {
    providerId: 'openai',
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    apiKeyMasked: maskApiKey(config.apiKey),
    hasApiKey: Boolean(config.apiKey),
    source: config.source,
    updatedAt,
  };
}

export async function updateSystemLLMConfig(input: {
  apiKey?: string;
  modelId?: string;
  baseUrl?: string;
}): Promise<SystemLLMConfigView> {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    throw new Error('DATABASE_URL 未配置，无法保存系统 OpenAI 配置。');
  }

  const existing = await prisma.systemLLMConfig.findUnique({ where: { id: 'default' } });
  const trimmedNewKey = input.apiKey?.trim() ?? '';
  let apiKey = trimmedNewKey;
  if (!apiKey) {
    if (existing?.apiKey?.trim()) {
      apiKey = existing.apiKey.trim();
    } else {
      throw new Error('首次保存必须填写 OpenAI API Key。');
    }
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
