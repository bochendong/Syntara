import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
} from '@/lib/server/provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getSystemLLMConfigView } from '@/lib/server/system-llm-config';

const log = createLogger('ServerProviders');

export async function GET() {
  try {
    const systemLLM = await getSystemLLMConfigView();
    const providers = getServerProviders();
    return apiSuccess({
      providers: {
        ...providers,
        openai: {
          ...(providers.openai || {}),
          models: [systemLLM.modelId],
          baseUrl: systemLLM.baseUrl,
        },
      },
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image: getServerImageProviders(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
