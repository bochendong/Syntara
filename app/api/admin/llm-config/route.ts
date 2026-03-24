import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import {
  getSystemLLMConfigView,
  updateSystemLLMConfig,
} from '@/lib/server/system-llm-config';

export async function GET() {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const config = await getSystemLLMConfigView();
  return apiSuccess({
    config: {
      providerId: config.providerId,
      modelId: config.modelId,
      baseUrl: config.baseUrl || '',
      hasApiKey: config.hasApiKey,
      maskedApiKey: config.apiKeyMasked,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  try {
    const body = (await req.json()) as Partial<{
      modelId: string;
      apiKey: string;
      baseUrl?: string;
    }>;
    const modelId = body.modelId?.trim();
    const apiKey = body.apiKey?.trim();
    const baseUrl = body.baseUrl?.trim() || undefined;

    if (!modelId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'modelId is required');
    }

    if (!apiKey) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'apiKey is required');
    }

    const saved = await updateSystemLLMConfig({ modelId, apiKey, baseUrl });
    return apiSuccess({
      config: {
        providerId: saved.providerId,
        modelId: saved.modelId,
        baseUrl: saved.baseUrl || '',
        hasApiKey: saved.hasApiKey,
        maskedApiKey: saved.apiKeyMasked,
      },
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to save config',
    );
  }
}
