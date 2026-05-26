'use client';

import {
  NOTEBOOK_MODEL_PRESET_FULL,
  NOTEBOOK_MODEL_RECOMMENDED_BY_STAGE,
  type NotebookGenerationModelMode,
} from '@/lib/constants/notebook-generation-model-presets';
import {
  NOTEBOOK_GENERATION_MODEL_STAGE_HEADER_KEYS,
  NOTEBOOK_GENERATION_MODEL_STAGES,
} from '@/lib/constants/notebook-generation-model-stages';
import type { NotebookStageModelOverrides } from '@/lib/store/orchestrator-notebook-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { getCurrentModelConfig } from '@/lib/utils/model-config';

export const GENERATION_TEST_NO_CHARGE_HEADER = 'x-generation-test-no-charge';

export function getApiHeaders(overrides?: {
  imageGenerationEnabled?: boolean;
  modelIdOverride?: string | null;
  notebookStageModelOverrides?: NotebookStageModelOverrides | null;
  notebookModelMode?: NotebookGenerationModelMode;
  notebookGenerationSessionId?: string | null;
  notebookGenerationTaskId?: string | null;
  testNoCharge?: boolean;
}): HeadersInit {
  const modelConfig = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
  const imageGenEnabled =
    overrides?.imageGenerationEnabled !== undefined
      ? overrides.imageGenerationEnabled
      : (settings.imageGenerationEnabled ?? false);
  const mode = overrides?.notebookModelMode ?? 'recommended';

  let modelString = overrides?.modelIdOverride?.trim()
    ? `openai:${overrides.modelIdOverride.trim()}`
    : modelConfig.modelString;
  if (mode === 'max') {
    modelString = `openai:${NOTEBOOK_MODEL_PRESET_FULL}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-model': modelString,
    'x-api-key': modelConfig.apiKey,
    'x-base-url': modelConfig.baseUrl,
    'x-provider-type': modelConfig.providerType || '',
    'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(imageGenEnabled),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };

  if (mode === 'recommended') {
    for (const stage of NOTEBOOK_GENERATION_MODEL_STAGES) {
      headers[NOTEBOOK_GENERATION_MODEL_STAGE_HEADER_KEYS[stage]] =
        `openai:${NOTEBOOK_MODEL_RECOMMENDED_BY_STAGE[stage]}`;
    }
  } else if (mode === 'custom') {
    const stageOv = overrides?.notebookStageModelOverrides;
    if (stageOv) {
      for (const stage of NOTEBOOK_GENERATION_MODEL_STAGES) {
        const id = stageOv[stage]?.trim();
        if (id) {
          headers[NOTEBOOK_GENERATION_MODEL_STAGE_HEADER_KEYS[stage]] = `openai:${id}`;
        }
      }
    }
  }

  const notebookGenerationSessionId = overrides?.notebookGenerationSessionId?.trim();
  const notebookGenerationTaskId = overrides?.notebookGenerationTaskId?.trim();
  if (notebookGenerationSessionId) {
    headers['x-notebook-generation-session-id'] = notebookGenerationSessionId;
  }
  if (notebookGenerationTaskId) {
    headers['x-notebook-generation-task-id'] = notebookGenerationTaskId;
  }
  if (overrides?.testNoCharge) {
    headers[GENERATION_TEST_NO_CHARGE_HEADER] = 'true';
  }

  return headers;
}

export function getNotebookGenerationTrackingHeaders(tracking?: {
  notebookGenerationSessionId?: string | null;
  notebookGenerationTaskId?: string | null;
  testNoCharge?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  const notebookGenerationSessionId = tracking?.notebookGenerationSessionId?.trim();
  const notebookGenerationTaskId = tracking?.notebookGenerationTaskId?.trim();

  if (notebookGenerationSessionId) {
    headers['x-notebook-generation-session-id'] = notebookGenerationSessionId;
  }
  if (notebookGenerationTaskId) {
    headers['x-notebook-generation-task-id'] = notebookGenerationTaskId;
  }
  if (tracking?.testNoCharge) {
    headers[GENERATION_TEST_NO_CHARGE_HEADER] = 'true';
  }

  return headers;
}
