'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageModelInfo,
  ImageProviderId,
} from '@/lib/media/types';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';

const STORAGE_KEY = 'syntara:ppt-image-generation-test:v1';

const DEFAULT_PROMPT =
  'Create a realistic screenshot of a single 16:9 PowerPoint slide, not an illustration. The slide topic is "AI-Powered Learning". Use a clean white presentation canvas with a clear top title area, a short subtitle, three concise bullet cards on the left, a simple data chart or process diagram on the right, a small footer line, generous margins, aligned grid layout, professional SaaS presentation style, crisp readable English text, no logos, no watermarks.';

type ServerProvidersResponse = {
  image?: Record<string, { baseUrl?: string; models?: string[] }>;
};

type GenerationResponse = {
  success: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate;
  error?: string;
};

type StoredRun = {
  providerId: ImageProviderId;
  providerName: string;
  modelId: string;
  prompt: string;
  createdAt: number;
  width?: number;
  height?: number;
  costEstimate?: ImageGenerationCostEstimate | null;
};

type StoredError = {
  providerId: ImageProviderId;
  modelId: string;
  prompt: string;
  createdAt: number;
  message: string;
};

type StoredState = {
  history: StoredRun[];
  errors: StoredError[];
};

type RenderedResult = StoredRun & {
  imageUrl: string;
  usage?: ImageGenerationResult['usage'];
};

function emptyStoredState(): StoredState {
  return { history: [], errors: [] };
}

function isImageProviderId(value: string): value is ImageProviderId {
  return Object.prototype.hasOwnProperty.call(IMAGE_PROVIDERS, value);
}

function readStoredRuns(): StoredState {
  if (typeof window === 'undefined') return emptyStoredState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStoredState();
    const parsed = JSON.parse(raw) as { history?: unknown; errors?: unknown };
    return {
      history: Array.isArray(parsed.history) ? (parsed.history as StoredRun[]) : [],
      errors: Array.isArray(parsed.errors) ? (parsed.errors as StoredError[]) : [],
    };
  } catch {
    return emptyStoredState();
  }
}

function writeStoredRuns(next: StoredState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      history: next.history.slice(0, 20),
      errors: next.errors.slice(0, 20),
    }),
  );
}

function resultToImageUrl(result: ImageGenerationResult): string {
  if (result.url) return result.url;
  if (!result.base64) return '';
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:image/png;base64,${result.base64}`;
}

function getProviderModels(
  providerId: ImageProviderId,
  serverModels: string[] | undefined,
  customModels: ImageModelInfo[] | undefined,
): ImageModelInfo[] {
  const builtIn = IMAGE_PROVIDERS[providerId]?.models || [];
  if (serverModels?.length) {
    return serverModels.map((modelId) => {
      const known = builtIn.find((model) => model.id === modelId);
      return known || { id: modelId, name: modelId };
    });
  }
  return [...builtIn, ...(customModels || [])];
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCostEstimate(costEstimate: ImageGenerationCostEstimate | null | undefined): string {
  if (!costEstimate) return '无成本估算';
  return [
    `OpenAI ${formatUsdLabel(costEstimate.baseUsd)}`,
    `平台 ${formatUsdLabel(costEstimate.retailUsd)}`,
    formatComputeCreditsLabel(costEstimate.computeCredits),
  ].join(' · ');
}

function getAspectRatioStatus(width: number | undefined, height: number | undefined) {
  if (!width || !height) return null;
  const actual = width / height;
  const target = 16 / 9;
  const delta = Math.abs(actual - target) / target;
  return {
    actual,
    isClose: delta < 0.03,
    label: `${actual.toFixed(2)}:1`,
  };
}

export default function GenerationPptImageTestPage() {
  const settingsProviderId = useSettingsStore((state) => state.imageProviderId);
  const settingsModelId = useSettingsStore((state) => state.imageModelId);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);

  const [serverProviders, setServerProviders] = useState<
    Record<string, { baseUrl?: string; models?: string[] }>
  >({});
  const [serverStatus, setServerStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedProviderId, setSelectedProviderId] = useState<ImageProviderId>(settingsProviderId);
  const [selectedModelId, setSelectedModelId] = useState(settingsModelId);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<RenderedResult | null>(null);
  const [storedRuns, setStoredRuns] = useState<StoredState>(emptyStoredState);

  const refreshServerProviders = useCallback(async (showLoading = true) => {
    if (showLoading) setServerStatus('loading');
    try {
      const response = await fetch('/api/server-providers');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ServerProvidersResponse;
      setServerProviders(data.image || {});
      setServerStatus('ready');
    } catch {
      setServerProviders({});
      setServerStatus('error');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setStoredRuns(readStoredRuns()), 0);
    void refreshServerProviders(false);
    return () => window.clearTimeout(timer);
  }, [refreshServerProviders]);

  const serverProviderIds = useMemo(
    () => Object.keys(serverProviders).filter(isImageProviderId),
    [serverProviders],
  );

  const providerOptions = useMemo(() => {
    const ids =
      serverProviderIds.length > 0
        ? serverProviderIds
        : (Object.keys(IMAGE_PROVIDERS) as ImageProviderId[]);
    return ids.map((providerId) => ({
      ...IMAGE_PROVIDERS[providerId],
      isServerConfigured: Boolean(serverProviders[providerId]),
    }));
  }, [serverProviderIds, serverProviders]);

  const selectedProvider = IMAGE_PROVIDERS[selectedProviderId];
  const selectedProviderConfig = imageProvidersConfig[selectedProviderId];
  const selectedProviderServer = serverProviders[selectedProviderId];
  const currentModels = useMemo(
    () =>
      getProviderModels(
        selectedProviderId,
        selectedProviderServer?.models,
        selectedProviderConfig?.customModels,
      ),
    [selectedProviderConfig?.customModels, selectedProviderId, selectedProviderServer?.models],
  );
  const selectedModel = currentModels.find((model) => model.id === selectedModelId);
  const isServerConfigured = Boolean(
    selectedProviderServer || selectedProviderConfig?.isServerConfigured,
  );
  const hasClientApiKey = Boolean(selectedProviderConfig?.apiKey?.trim());
  const canGenerate = Boolean(
    prompt.trim() && selectedModelId && (isServerConfigured || hasClientApiKey),
  );
  const aspectRatioStatus = getAspectRatioStatus(result?.width, result?.height);

  useEffect(() => {
    if (!providerOptions.length) return;
    if (!providerOptions.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(providerOptions[0].id);
    }
  }, [providerOptions, selectedProviderId]);

  useEffect(() => {
    if (!currentModels.length) {
      setSelectedModelId('');
      return;
    }
    if (!currentModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(currentModels[0].id);
    }
  }, [currentModels, selectedModelId]);

  const persistRun = useCallback((run: StoredRun) => {
    setStoredRuns((prev) => {
      const next = {
        history: [run, ...prev.history].slice(0, 20),
        errors: prev.errors,
      };
      writeStoredRuns(next);
      return next;
    });
  }, []);

  const persistError = useCallback((imageError: StoredError) => {
    setStoredRuns((prev) => {
      const next = {
        history: prev.history,
        errors: [imageError, ...prev.errors].slice(0, 20),
      };
      writeStoredRuns(next);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || isGenerating) return;
    const cleanPrompt = prompt.trim();
    setIsGenerating(true);
    setErrorMessage('');

    try {
      const response = await backendFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': selectedProviderId,
          'x-image-model': selectedModelId,
          'x-api-key': selectedProviderConfig?.apiKey || '',
          'x-base-url': selectedProviderConfig?.baseUrl || '',
        },
        body: JSON.stringify({
          prompt: cleanPrompt,
          aspectRatio: '16:9',
          notebookContext: {
            name: 'PPT 图片测试',
            sceneTitle: 'PPT 16:9 图片生成测试',
            sceneType: 'generation-ppt-image-test',
          },
        }),
      });

      const data = (await response.json().catch(() => ({}))) as GenerationResponse;
      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || `PPT 图片生成失败：HTTP ${response.status}`);
      }

      const imageUrl = resultToImageUrl(data.result);
      if (!imageUrl) {
        throw new Error('图片生成成功，但响应里没有可展示的图片 URL 或 base64 数据。');
      }

      const run: StoredRun = {
        providerId: selectedProviderId,
        providerName: selectedProvider?.name || selectedProviderId,
        modelId: selectedModelId,
        prompt: cleanPrompt,
        createdAt: Date.now(),
        width: data.result.width,
        height: data.result.height,
        costEstimate: data.costEstimate ?? null,
      };
      setResult({ ...run, imageUrl, usage: data.result.usage });
      persistRun(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      persistError({
        providerId: selectedProviderId,
        modelId: selectedModelId,
        prompt: cleanPrompt,
        createdAt: Date.now(),
        message,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    canGenerate,
    isGenerating,
    persistError,
    persistRun,
    prompt,
    selectedModelId,
    selectedProvider?.name,
    selectedProviderConfig?.apiKey,
    selectedProviderConfig?.baseUrl,
    selectedProviderId,
  ]);

  const selectedBadgeLabel = isServerConfigured
    ? '系统托管'
    : hasClientApiKey
      ? '本地 Key'
      : '未配置 Key';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/test">
              <ArrowLeft className="size-4" />
              返回所有测试
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">PPT 图 {storedRuns.history.length}</Badge>
            {storedRuns.errors.length > 0 && (
              <Badge variant="destructive">失败 {storedRuns.errors.length}</Badge>
            )}
          </div>
        </div>

        <header className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                <Presentation className="size-4" />
                PPT Image QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">PPT 图片测试</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                只测图片模型能不能生成适合放进幻灯片的 16:9 PPT 位图。SVG 转换在独立页面测试，
                不混在这里。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshServerProviders()}
            >
              <RefreshCw className={cn('size-4', serverStatus === 'loading' && 'animate-spin')} />
              刷新模型
            </Button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="size-4 text-indigo-700" />
              生成参数
            </div>

            <div className="mt-5 grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ppt-image-provider">图片服务</Label>
                <Select
                  value={selectedProviderId}
                  onValueChange={(value) => setSelectedProviderId(value as ImageProviderId)}
                >
                  <SelectTrigger id="ppt-image-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                        {provider.isServerConfigured ? ' · 系统托管' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ppt-image-model">模型</Label>
                <Select
                  value={selectedModelId}
                  onValueChange={setSelectedModelId}
                  disabled={!currentModels.length}
                >
                  <SelectTrigger id="ppt-image-model" className="w-full">
                    <SelectValue placeholder="暂无可选模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>目标比例</Label>
                  <div className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm">
                    16:9
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>配置</Label>
                  <div className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm">
                    <span
                      className={cn(
                        'mr-2 size-2 rounded-full',
                        isServerConfigured || hasClientApiKey ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                    />
                    {selectedBadgeLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ppt-image-prompt">Prompt</Label>
                <Textarea
                  id="ppt-image-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-40 resize-y"
                />
              </div>

              {!canGenerate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                  请选择模型并配置系统托管 Key 或本地 API Key 后再生成。
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                  {errorMessage}
                </div>
              )}

              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageIcon className="size-4" />
                )}
                {isGenerating ? '生成中' : '生成 PPT 图片'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">PPT 位图预览</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedProvider?.name || selectedProviderId} ·{' '}
                  {selectedModel?.name || selectedModelId}
                </p>
              </div>
              {result && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {aspectRatioStatus && (
                    <Badge variant={aspectRatioStatus.isClose ? 'secondary' : 'destructive'}>
                      {aspectRatioStatus.isClose
                        ? '16:9 OK'
                        : `非 16:9 · ${aspectRatioStatus.label}`}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3.5" />
                    {formatTime(result.createdAt)}
                  </Badge>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-100 p-4">
              <div className="aspect-video overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {isGenerating ? (
                  <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                    <Loader2 className="size-8 animate-spin text-indigo-700" />
                    正在生成 16:9 PPT 图片
                  </div>
                ) : result ? (
                  <img
                    src={result.imageUrl}
                    alt="PPT 图片测试生成结果"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
                    <Presentation className="size-10 text-slate-300" />
                    还没有生成 PPT 图片。
                  </div>
                )}
              </div>
            </div>

            {result && (
              <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-400">Provider</div>
                  <div className="mt-1 font-medium text-slate-900">{result.providerName}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-400">Model</div>
                  <div className="mt-1 font-medium text-slate-900">{result.modelId}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-400">Size</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {result.width && result.height ? `${result.width} x ${result.height}` : '16:9'}
                  </div>
                  {aspectRatioStatus && !aspectRatioStatus.isClose && (
                    <div className="mt-1 text-xs font-medium text-red-600">
                      实际比例不是 16:9，预览会按 PPT 画幅裁切。
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-400">Usage</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {result.usage ? `${result.usage.totalTokens} tokens` : '无 usage 数据'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 md:col-span-2">
                  <div className="text-xs text-slate-400">Cost</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {formatCostEstimate(result.costEstimate)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {storedRuns.history.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">最近 PPT 图片生成</h2>
            <div className="mt-3 grid gap-2">
              {storedRuns.history.slice(0, 5).map((run) => (
                <div
                  key={`${run.createdAt}-${run.providerId}-${run.modelId}`}
                  className="flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 font-medium text-slate-900">
                    {run.providerName} · {run.modelId}
                  </div>
                  <div className="text-xs text-slate-500">{formatTime(run.createdAt)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
