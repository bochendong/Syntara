'use client';

import { useCallback, useRef } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/generation-pipeline';
import type { Scene } from '@/lib/types/stage';
import type { MouthCue, SpeechAction, SpeechVisemeCue } from '@/lib/types/action';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';
import { createLogger } from '@/lib/logger';
import {
  buildTtsCacheKey,
  getCachedTtsAudio,
  setCachedTtsAudio,
} from '@/lib/utils/tts-audio-cache';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import { backendFetch } from '@/lib/utils/backend-api';

const log = createLogger('SceneGenerator');
const MAX_TTS_PARALLELISM = 3;

export interface SpeechAudioProgress {
  done: number;
  total: number;
  active: number;
  parallelism: number;
}

interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
}

interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
}

function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-requires-api-key': String(config.requiresApiKey ?? false),
    // Image generation provider
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    // Video generation provider
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    // Media generation toggles
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (data?.error?.trim()) return data.error.trim();
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}

function buildPayloadTooLargeMessage(language: 'zh-CN' | 'en-US'): string {
  return language === 'en-US'
    ? 'This page still carries too much source-document context for the current deployment platform. Keep fewer image-heavy pages or switch them to screenshots.'
    : '当前这一页携带的源文档上下文仍然过大，请继续减少重图片页面，或把它们改成整页截图。';
}

/** Call POST /api/generate/scene-content (step 1) */
async function fetchSceneContent(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    stageId: string;
    pdfImages?: PdfImage[];
    imageMapping?: ImageMapping;
    stageInfo: {
      name: string;
      description?: string;
      language?: string;
      style?: string;
    };
    agents?: AgentInfo[];
    courseContext?: CoursePersonalizationContext;
  },
  signal?: AbortSignal,
): Promise<SceneContentResult> {
  const preferredImageIds = params.outline.suggestedImageIds || [];
  const filteredPdfImages =
    preferredImageIds.length > 0
      ? (params.pdfImages || []).filter((image) => preferredImageIds.includes(image.id))
      : undefined;
  const basePayload = {
    outline: params.outline,
    allOutlines: params.allOutlines,
    stageId: params.stageId,
    stageInfo: params.stageInfo,
    agents: params.agents,
    courseContext: params.courseContext,
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: filteredPdfImages,
    imageMapping: params.imageMapping,
    preferredImageIds,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  const headers = getApiHeaders();
  const sendRequest = (payload: Record<string, unknown>) =>
    backendFetch('/api/generate/scene-content', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

  let response = await sendRequest({
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
    ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
  });

  if (response.status === 413 && budgetedMedia.imageMapping) {
    log.warn('[SceneGenerator] Scene payload still too large, retrying without vision images', {
      outlineId: params.outline.id,
      outlineTitle: params.outline.title,
    });
    response = await sendRequest({
      ...basePayload,
      ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
    });
  }

  if (!response.ok) {
    const language: 'zh-CN' | 'en-US' = params.stageInfo.language === 'en-US' ? 'en-US' : 'zh-CN';
    const fallback =
      response.status === 413 ? buildPayloadTooLargeMessage(language) : `HTTP ${response.status}`;
    const message = await readApiErrorMessage(response, fallback);
    log.error('[SceneGenerator] Scene content request failed', {
      outlineId: params.outline.id,
      outlineTitle: params.outline.title,
      stageId: params.stageId,
      status: response.status,
      error: message || fallback,
    });
    return { success: false, error: message || fallback };
  }

  return response.json();
}

/** Call POST /api/generate/scene-actions (step 2) */
async function fetchSceneActions(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    content: unknown;
    stageId: string;
    notebookName?: string;
    agents?: AgentInfo[];
    previousSpeeches?: string[];
    userProfile?: string;
    courseContext?: CoursePersonalizationContext;
  },
  signal?: AbortSignal,
): Promise<SceneActionsResult> {
  const response = await backendFetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    const message = data.details || data.error || `HTTP ${response.status}`;
    log.error('[SceneGenerator] Scene actions request failed', {
      outlineId: params.outline.id,
      outlineTitle: params.outline.title,
      stageId: params.stageId,
      status: response.status,
      error: message,
    });
    return { success: false, error: message };
  }

  return response.json();
}

/** Generate TTS for one speech action; uses local IndexedDB cache when possible. */
export async function generateAndStoreTTS(
  audioId: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ audioUrl: string; visemes?: SpeechVisemeCue[]; mouthCues?: MouthCue[] }> {
  const settings = useSettingsStore.getState();
  if (settings.ttsProviderId === 'browser-native-tts') return { audioUrl: '' };
  const spokenText = verbalizeNarrationText(text);

  const cacheKey = await buildTtsCacheKey(
    settings.ttsProviderId,
    settings.ttsVoice,
    settings.ttsSpeed,
    spokenText,
  );
  const cached = await getCachedTtsAudio(cacheKey);
  if (cached) {
    return {
      audioUrl: `data:audio/${cached.format};base64,${cached.base64}`,
      visemes: cached.visemes,
      mouthCues: cached.mouthCues,
    };
  }

  const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
  const response = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: spokenText,
      audioId,
      ttsProviderId: settings.ttsProviderId,
      ttsVoice: settings.ttsVoice,
      ttsSpeed: settings.ttsSpeed,
      ttsApiKey: ttsProviderConfig?.apiKey || undefined,
      ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
    }),
    signal,
  });

  const data = await response
    .json()
    .catch(() => ({ success: false, error: response.statusText || 'Invalid TTS response' }));
  if (!response.ok || !data.success || !data.base64 || !data.format) {
    const err = new Error(
      data.details || data.error || `TTS request failed: HTTP ${response.status}`,
    );
    log.warn('TTS failed for', audioId, ':', err);
    throw err;
  }
  void audioId;
  await setCachedTtsAudio(cacheKey, data.format, data.base64, data.visemes, data.mouthCues);
  return {
    audioUrl: `data:audio/${data.format};base64,${data.base64}`,
    visemes: data.visemes,
    mouthCues: data.mouthCues,
  };
}

/**
 * Populate missing audio for speech actions with a small worker pool so long
 * scenes do not wait for each segment strictly one-by-one.
 */
export async function ensureSpeechActionsHaveAudio(
  speechActions: SpeechAction[],
  signal?: AbortSignal,
  onProgress?: (progress: SpeechAudioProgress) => void,
): Promise<{ ok: boolean; error?: string }> {
  const missing = speechActions.filter((action) => !action.audioUrl);
  if (missing.length === 0) return { ok: true };

  const total = missing.length;
  const parallelism = Math.min(MAX_TTS_PARALLELISM, total);
  let active = 0;
  onProgress?.({ done: 0, total, active, parallelism });

  let nextIndex = 0;
  let done = 0;
  let firstError: string | null = null;

  const runWorker = async () => {
    while (!firstError) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= total) return;

      const action = missing[currentIndex];
      const audioId = action.audioId || `tts_${action.id}`;
      action.audioId = audioId;
      active += 1;
      onProgress?.({ done, total, active, parallelism });

      try {
        const { audioUrl, visemes, mouthCues } = await generateAndStoreTTS(
          audioId,
          action.text,
          signal,
        );
        if (audioUrl) action.audioUrl = audioUrl;
        if (visemes?.length) action.visemes = visemes;
        if (mouthCues?.length) action.mouthCues = mouthCues;
        done += 1;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          active = Math.max(0, active - 1);
          onProgress?.({ done, total, active, parallelism });
          throw error;
        }
        firstError =
          error instanceof Error ? error.message : `TTS failed for speech action ${action.id}`;
      } finally {
        active = Math.max(0, active - 1);
        onProgress?.({ done, total, active, parallelism });
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: parallelism }, () => runWorker()));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    firstError = error instanceof Error ? error.message : String(error);
  }

  if (firstError) {
    return { ok: false, error: firstError };
  }

  return { ok: true };
}

/**
 * Ensure every speech action on the current scene has audioUrl (non–browser-native TTS).
 * Mutates the scene's actions in place so PlaybackEngine keeps the same object references.
 */
export async function ensureMissingSpeechAudioForScene(
  scene: Scene,
  signal?: AbortSignal,
  onProgress?: (progress: SpeechAudioProgress) => void,
): Promise<{ ok: boolean; error?: string }> {
  const settings = useSettingsStore.getState();
  if (!settings.ttsEnabled || settings.ttsProviderId === 'browser-native-tts') {
    return { ok: true };
  }

  const nextActions = splitLongSpeechActions(scene.actions || [], settings.ttsProviderId);
  if (nextActions !== scene.actions) {
    scene.actions = nextActions;
    useStageStore.getState().touchScenes();
  }

  const speechActions =
    scene.actions?.filter((a): a is SpeechAction => a.type === 'speech' && Boolean(a.text)) ?? [];
  let lastDone = -1;
  return ensureSpeechActionsHaveAudio(speechActions, signal, (progress) => {
    onProgress?.(progress);
    if (progress.done !== lastDone) {
      lastDone = progress.done;
      // 只在真实完成数变化时刷新，避免活跃任务数波动导致过多重渲染。
      useStageStore.getState().touchScenes();
    }
  });
}

export interface UseSceneGeneratorOptions {
  onSceneGenerated?: (scene: Scene, index: number) => void;
  onSceneFailed?: (outline: SceneOutline, error: string) => void;
  onPhaseChange?: (phase: 'content' | 'actions', outline: SceneOutline) => void;
  onComplete?: () => void;
}

export interface GenerationParams {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  userProfile?: string;
  courseContext?: CoursePersonalizationContext;
}

export function useSceneGenerator(options: UseSceneGeneratorOptions = {}) {
  const abortRef = useRef(false);
  const generatingRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerationParams | null>(null);
  const generateRemainingRef = useRef<((params: GenerationParams) => Promise<void>) | null>(null);

  const store = useStageStore;

  const generateRemaining = useCallback(
    async (params: GenerationParams) => {
      lastParamsRef.current = params;
      if (generatingRef.current) return;
      generatingRef.current = true;
      abortRef.current = false;
      const removeGeneratingOutline = (outlineId: string) => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Create a new AbortController for this generation run
      fetchAbortRef.current = new AbortController();
      const signal = fetchAbortRef.current.signal;

      const state = store.getState();
      const { outlines, scenes, stage } = state;
      const startEpoch = state.generationEpoch;
      if (!stage || outlines.length === 0) {
        generatingRef.current = false;
        return;
      }

      store.getState().setGenerationStatus('generating');

      // Determine pending outlines
      const completedOrders = new Set(scenes.map((s) => s.order));
      const pending = outlines
        .filter((o) => !completedOrders.has(o.order))
        .sort((a, b) => a.order - b.order);

      if (pending.length === 0) {
        store.getState().setGenerationStatus('completed');
        store.getState().setGeneratingOutlines([]);
        options.onComplete?.();
        generatingRef.current = false;
        return;
      }

      store.getState().setGeneratingOutlines(pending);

      // Get previousSpeeches from last completed scene
      let previousSpeeches: string[] = [];
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      if (sortedScenes.length > 0) {
        const lastScene = sortedScenes[sortedScenes.length - 1];
        previousSpeeches = (lastScene.actions || [])
          .filter((a): a is SpeechAction => a.type === 'speech')
          .map((a) => a.text);
      }

      // Serial generation loop — two-step per outline
      try {
        let pausedByFailureOrAbort = false;
        for (const outline of pending) {
          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          store.getState().setCurrentGeneratingOrder(outline.order);

          // Step 1: Generate content
          options.onPhaseChange?.('content', outline);
          const contentResult = await fetchSceneContent(
            {
              outline,
              allOutlines: outlines,
              stageId: stage.id,
              pdfImages: params.pdfImages,
              imageMapping: params.imageMapping,
              stageInfo: params.stageInfo,
              agents: params.agents,
              courseContext: params.courseContext,
            },
            signal,
          );

          if (!contentResult.success || !contentResult.content) {
            log.warn(
              '[SceneGenerator] Scene content generation failed; pausing remaining generation',
              {
                outlineId: outline.id,
                outlineTitle: outline.title,
                stageId: stage.id,
                error: contentResult.error || 'Content generation failed',
              },
            );
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, contentResult.error || 'Content generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          // Step 2: Generate actions + assemble scene
          options.onPhaseChange?.('actions', outline);
          const actionsResult = await fetchSceneActions(
            {
              outline: contentResult.effectiveOutline || outline,
              allOutlines: outlines,
              content: contentResult.content,
              stageId: stage.id,
              notebookName: stage.name,
              agents: params.agents,
              previousSpeeches,
              userProfile: params.userProfile,
              courseContext: params.courseContext,
            },
            signal,
          );

          if (actionsResult.success && actionsResult.scene) {
            const scene = actionsResult.scene;
            // Epoch changed — stage switched, discard this scene
            if (store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }

            removeGeneratingOutline(outline.id);
            store.getState().addScene(scene);
            {
              const nextState = store.getState();
              log.info('[SceneGenerator] Scene committed to store', {
                stageId: stage.id,
                outlineId: outline.id,
                outlineOrder: outline.order,
                outlineTitle: outline.title,
                displayedSceneCount: nextState.scenes.length,
                displayedSceneOrders: nextState.scenes.map((item) => item.order),
                pendingOutlineCount: nextState.generatingOutlines.length,
                pageGenerationCompleted:
                  nextState.outlines.length > 0 &&
                  nextState.generatingOutlines.length === 0 &&
                  nextState.scenes.length >= nextState.outlines.length,
              });
            }
            options.onSceneGenerated?.(scene, outline.order);
            previousSpeeches = actionsResult.previousSpeeches || [];
          } else {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, actionsResult.error || 'Actions generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }
        }

        if (!abortRef.current && !pausedByFailureOrAbort) {
          store.getState().setGenerationStatus('completed');
          store.getState().setGeneratingOutlines([]);
          {
            const finalState = store.getState();
            log.info('[SceneGenerator] Page generation completed', {
              stageId: stage.id,
              outlineCount: finalState.outlines.length,
              displayedSceneCount: finalState.scenes.length,
              displayedSceneOrders: finalState.scenes.map((scene) => scene.order),
              pendingOutlineCount: finalState.generatingOutlines.length,
            });
          }
          options.onComplete?.();
        }
      } catch (err: unknown) {
        // AbortError is expected when stop() is called — don't treat as failure
        if (err instanceof DOMException && err.name === 'AbortError') {
          log.info('Generation aborted');
          store.getState().setGenerationStatus('paused');
        } else {
          throw err;
        }
      } finally {
        generatingRef.current = false;
        fetchAbortRef.current = null;
      }
    },
    [options, store],
  );

  // Keep ref in sync so retrySingleOutline can call it
  generateRemainingRef.current = generateRemaining;

  const stop = useCallback(() => {
    abortRef.current = true;
    store.getState().bumpGenerationEpoch();
    fetchAbortRef.current?.abort();
  }, [store]);

  const isGenerating = useCallback(() => generatingRef.current, []);

  /** Retry a single failed outline from scratch (content → actions). */
  const retrySingleOutline = useCallback(
    async (outlineId: string) => {
      const state = store.getState();
      const outline = state.failedOutlines.find((o) => o.id === outlineId);
      const params = lastParamsRef.current;
      if (!outline || !state.stage || !params) return;

      const removeGeneratingOutline = () => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Remove from failed list and mark as generating
      store.getState().retryFailedOutline(outlineId);
      store.getState().setGenerationStatus('generating');
      const currentGenerating = store.getState().generatingOutlines;
      if (!currentGenerating.some((o) => o.id === outline.id)) {
        store.getState().setGeneratingOutlines([...currentGenerating, outline]);
      }

      const abortController = new AbortController();
      const signal = abortController.signal;

      try {
        // Step 1: Content
        const contentResult = await fetchSceneContent(
          {
            outline,
            allOutlines: state.outlines,
            stageId: state.stage.id,
            pdfImages: params.pdfImages,
            imageMapping: params.imageMapping,
            stageInfo: params.stageInfo,
            agents: params.agents,
            courseContext: params.courseContext,
          },
          signal,
        );

        if (!contentResult.success || !contentResult.content) {
          log.warn('[SceneGenerator] Single outline retry content generation failed', {
            outlineId,
            outlineTitle: outline.title,
            stageId: state.stage.id,
            error: contentResult.error || 'Content generation failed',
          });
          store.getState().addFailedOutline(outline);
          return;
        }

        // Step 2: Actions
        const sortedScenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
        const lastScene = sortedScenes[sortedScenes.length - 1];
        const previousSpeeches = lastScene
          ? (lastScene.actions || [])
              .filter((a): a is SpeechAction => a.type === 'speech')
              .map((a) => a.text)
          : [];

        const actionsResult = await fetchSceneActions(
          {
            outline: contentResult.effectiveOutline || outline,
            allOutlines: state.outlines,
            content: contentResult.content,
            stageId: state.stage.id,
            agents: params.agents,
            previousSpeeches,
            userProfile: params.userProfile,
            courseContext: params.courseContext,
          },
          signal,
        );

        if (!actionsResult.success || !actionsResult.scene) {
          store.getState().addFailedOutline(outline);
          return;
        }

        if (signal.aborted) {
          return;
        }

        removeGeneratingOutline();
        store.getState().addScene(actionsResult.scene);
        {
          const nextState = store.getState();
          log.info('[SceneGenerator] Single outline retry committed scene', {
            stageId: state.stage.id,
            outlineId,
            displayedSceneCount: nextState.scenes.length,
            displayedSceneOrders: nextState.scenes.map((scene) => scene.order),
            pendingOutlineCount: nextState.generatingOutlines.length,
          });
        }

        // Resume remaining generation if there are pending outlines
        if (store.getState().generatingOutlines.length > 0 && lastParamsRef.current) {
          generateRemainingRef.current?.(lastParamsRef.current);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          store.getState().addFailedOutline(outline);
        }
      }
    },
    [store],
  );

  return { generateRemaining, retrySingleOutline, stop, isGenerating };
}
