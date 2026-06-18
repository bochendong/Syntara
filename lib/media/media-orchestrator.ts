'use client';

/**
 * Media Generation Orchestrator
 *
 * Dispatches media generation API calls for all mediaGenerations across outlines.
 * Runs entirely on the frontend — calls /api/generate/image and /api/generate/video,
 * fetches result blobs, and updates the Zustand store.
 */

import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import { useSettingsStore } from '@/lib/store/settings';
import type { SceneOutline } from '@/lib/types/generation';
import type { MediaGenerationRequest } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { backendFetch } from '@/lib/utils/backend-api';

const log = createLogger('MediaOrchestrator');

/** Error with a structured errorCode from the API */
class MediaApiError extends Error {
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

/**
 * Launch media generation for all mediaGenerations declared in outlines.
 * This is an explicit/manual step and does not run unless the user triggers it.
 */
export async function generateMediaForOutlines(
  outlines: SceneOutline[],
  stageId: string,
  notebookName?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  const requests = outlines.flatMap((outline) => outline.mediaGenerations || []);
  return generateMediaRequests(requests, stageId, notebookName, abortSignal);
}

export async function generateMediaRequests(
  requests: MediaGenerationRequest[],
  stageId: string,
  notebookName?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  const settings = useSettingsStore.getState();
  const store = useMediaGenerationStore.getState();

  // Collect all media requests
  const allRequests: MediaGenerationRequest[] = [];
  for (const mg of requests) {
    // Filter by enabled flags
    if (mg.type === 'image' && !settings.imageGenerationEnabled) continue;
    if (mg.type === 'video' && !settings.videoGenerationEnabled) continue;
    // Skip anything already tracked to keep manual retries idempotent.
    const existing = store.getTask(mg.elementId);
    if (existing) continue;
    allRequests.push(mg);
  }

  if (allRequests.length === 0) return;

  // Enqueue all as pending
  useMediaGenerationStore.getState().enqueueTasks(stageId, allRequests);

  // Process requests serially — image/video APIs have limited concurrency
  for (const req of allRequests) {
    if (abortSignal?.aborted) break;
    try {
      await generateSingleMedia(req, stageId, notebookName, abortSignal);
    } catch {
      if (abortSignal?.aborted) break;
    }
  }
}

/**
 * Retry a single failed media task.
 */
export async function retryMediaTask(elementId: string): Promise<void> {
  const store = useMediaGenerationStore.getState();
  const task = store.getTask(elementId);
  if (!task || task.status !== 'failed') return;

  // Check if the corresponding generation type is still enabled in global settings
  const settings = useSettingsStore.getState();
  if (task.type === 'image' && !settings.imageGenerationEnabled) {
    store.markFailed(elementId, 'Generation disabled', 'GENERATION_DISABLED');
    return;
  }
  if (task.type === 'video' && !settings.videoGenerationEnabled) {
    store.markFailed(elementId, 'Generation disabled', 'GENERATION_DISABLED');
    return;
  }

  store.markPendingForRetry(elementId);
  await generateSingleMedia(
    {
      type: task.type,
      prompt: task.prompt,
      elementId: task.elementId,
      aspectRatio: task.params.aspectRatio as MediaGenerationRequest['aspectRatio'],
      style: task.params.style,
    },
    task.stageId,
    undefined,
  ).catch(() => undefined);
}

// ==================== Internal ====================

async function generateSingleMedia(
  req: MediaGenerationRequest,
  stageId: string,
  notebookName?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  return runQueuedAiTask(
    {
      kind: req.type === 'image' ? 'image-generation' : 'video-generation',
      title: req.type === 'image' ? '图片生成' : '视频生成',
      description: describeMediaTask(req, notebookName),
      signal: abortSignal,
    },
    async ({ signal }) => {
      const store = useMediaGenerationStore.getState();
      store.markGenerating(req.elementId);

      try {
        let resultUrl: string;
        let posterUrl: string | undefined;

        if (req.type === 'image') {
          const result = await callImageApi(req, stageId, notebookName, signal);
          resultUrl = result.url;
        } else {
          const result = await callVideoApi(req, signal);
          resultUrl = result.url;
          posterUrl = result.poster;
        }

        throwIfAborted(signal);

        // Fetch blob from URL
        const blob = await fetchAsBlob(resultUrl, signal);
        const posterBlob = posterUrl
          ? await fetchAsBlob(posterUrl, signal).catch(() => undefined)
          : undefined;
        throwIfAborted(signal);

        // Update store with object URL
        const objectUrl = URL.createObjectURL(blob);
        const posterObjectUrl = posterBlob ? URL.createObjectURL(posterBlob) : undefined;
        useMediaGenerationStore.getState().markDone(req.elementId, objectUrl, posterObjectUrl);
      } catch (err) {
        const aborted =
          signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
        const message = aborted ? '已取消' : err instanceof Error ? err.message : String(err);
        const errorCode = aborted
          ? 'CANCELLED'
          : err instanceof MediaApiError
            ? err.errorCode
            : undefined;
        if (!aborted) log.error(`Failed ${req.elementId}:`, message);
        useMediaGenerationStore.getState().markFailed(req.elementId, message, errorCode);
        if (aborted) {
          throw new DOMException('Media generation was cancelled', 'AbortError');
        }
        throw err;
      }
    },
  );
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Media generation was cancelled', 'AbortError');
}

function describeMediaTask(req: MediaGenerationRequest, notebookName?: string) {
  const kindLabel = req.type === 'image' ? '图片' : '视频';
  const prompt = compactPrompt(req.prompt);
  if (notebookName) return `正在为「${notebookName}」生成${kindLabel}：${prompt}`;
  return `正在生成${kindLabel}：${prompt}`;
}

function compactPrompt(prompt: string) {
  const text = prompt.replace(/\s+/g, ' ').trim();
  if (!text) return '未命名内容';
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

async function callImageApi(
  req: MediaGenerationRequest,
  stageId: string,
  notebookName: string | undefined,
  abortSignal?: AbortSignal,
): Promise<{ url: string }> {
  const settings = useSettingsStore.getState();
  const providerConfig = settings.imageProvidersConfig?.[settings.imageProviderId];

  const response = await backendFetch('/api/generate/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-image-provider': settings.imageProviderId || '',
      'x-image-model': settings.imageModelId || '',
      'x-api-key': providerConfig?.apiKey || '',
      'x-base-url': providerConfig?.baseUrl || '',
    },
    body: JSON.stringify({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      style: req.style,
      notebookContext: {
        id: stageId,
        name: notebookName,
      },
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new MediaApiError(data.error || `Image API returned ${response.status}`, data.errorCode);
  }

  const data = await response.json();
  if (!data.success)
    throw new MediaApiError(data.error || 'Image generation failed', data.errorCode);

  // Result may have url or base64
  const url =
    data.result?.url || (data.result?.base64 ? `data:image/png;base64,${data.result.base64}` : '');
  if (!url) throw new Error('No image URL in response');
  return { url };
}

async function callVideoApi(
  req: MediaGenerationRequest,
  abortSignal?: AbortSignal,
): Promise<{ url: string; poster?: string }> {
  const settings = useSettingsStore.getState();
  const providerConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  const response = await fetch('/api/generate/video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-video-provider': settings.videoProviderId || '',
      'x-video-model': settings.videoModelId || '',
      'x-api-key': providerConfig?.apiKey || '',
      'x-base-url': providerConfig?.baseUrl || '',
    },
    body: JSON.stringify({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new MediaApiError(data.error || `Video API returned ${response.status}`, data.errorCode);
  }

  const data = await response.json();
  if (!data.success)
    throw new MediaApiError(data.error || 'Video generation failed', data.errorCode);

  const url = data.result?.url;
  if (!url) throw new Error('No video URL in response');
  return { url, poster: data.result?.poster };
}

async function fetchAsBlob(url: string, abortSignal?: AbortSignal): Promise<Blob> {
  // For data URLs, convert directly
  if (url.startsWith('data:')) {
    const res = await fetch(url, { signal: abortSignal });
    return res.blob();
  }
  // For remote URLs, proxy through our server to bypass CORS restrictions
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch('/api/proxy-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: abortSignal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Proxy fetch failed: ${res.status}`);
    }
    return res.blob();
  }
  // Relative URLs (shouldn't happen, but handle gracefully)
  const res = await fetch(url, { signal: abortSignal });
  if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
  return res.blob();
}
