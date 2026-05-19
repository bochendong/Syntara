'use client';

import { useEffect } from 'react';
import { XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import { useStageStore } from '@/lib/store/stage';
import type { Scene } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

import { readableFailureReason, uniqueNonEmpty } from './page-evaluation';
import { buildStage } from './page-scene';
import type { GenerationErrorResult } from './page-types';

export function GenerationErrorPanel({
  title,
  error,
}: {
  readonly title: string;
  readonly error: GenerationErrorResult;
}) {
  const diagnostics = error.diagnostics;
  const reasons = uniqueNonEmpty([
    ...(diagnostics?.failureReasons || []),
    ...(diagnostics?.semanticFailureReasons || []),
    ...(diagnostics?.skillValidationFailures || []),
  ]);
  const stage = diagnostics?.failureStage || 'unknown';
  const retryLabel =
    diagnostics?.semanticRetryCount || diagnostics?.layoutRetryCount
      ? `semantic retry ${diagnostics.semanticRetryCount || 0} / layout retry ${diagnostics.layoutRetryCount || 0}`
      : 'no retry data';

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
      <div className="flex flex-wrap items-center gap-2">
        <XCircle className="size-4 text-red-600" />
        <span className="font-semibold">{title}</span>
        {error.httpStatus ? <Badge variant="destructive">HTTP {error.httpStatus}</Badge> : null}
        {diagnostics?.pipeline ? <Badge variant="outline">{diagnostics.pipeline}</Badge> : null}
        <Badge variant="outline">{stage}</Badge>
      </div>
      <p className="mt-2 leading-6">{error.message}</p>

      {diagnostics ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-red-100 bg-white/70 p-3 text-xs leading-5 text-slate-700 sm:grid-cols-2">
          <div>
            <div className="font-semibold text-slate-900">失败层级</div>
            <div>{stage}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">重试情况</div>
            <div>{retryLabel}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">route</div>
            <div>{diagnostics.slideGenerationRoute || 'unknown'}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">fallback</div>
            <div>
              {diagnostics.contentFallbackUsed
                ? diagnostics.fallbackKind || 'used'
                : '未使用，失败会暴露出来'}
            </div>
          </div>
        </div>
      ) : null}

      {reasons.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold text-red-950">我会优先看的错误</div>
          {reasons.slice(0, 8).map((reason, index) => {
            const readable = readableFailureReason(reason);
            return (
              <div key={`${reason}-${index}`} className="rounded-lg bg-white/75 p-2">
                <div className="text-xs leading-5 text-slate-800">{readable}</div>
                {readable !== reason ? (
                  <code className="mt-1 block break-words rounded bg-slate-100 px-2 py-1 text-[11px] leading-4 text-slate-500">
                    {reason}
                  </code>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {error.details && !diagnostics ? (
        <code className="mt-3 block whitespace-pre-wrap break-words rounded bg-white/75 px-2 py-1 text-xs leading-5 text-slate-600">
          {error.details}
        </code>
      ) : null}
    </div>
  );
}

export function SingleScenePreview({ scene }: { readonly scene: Scene }) {
  useEffect(() => {
    const stage = buildStage('zh-CN', 'classic_business');
    const viewportSize =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportSize ?? 1000) : 1000;
    const viewportRatio =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportRatio ?? 0.5625) : 0.5625;
    useStageStore.setState({
      stage,
      scenes: [scene],
      currentSceneId: scene.id,
      outlines: [],
      mode: 'playback',
      generationStatus: 'completed',
    });
    useCanvasStore.setState({
      viewportSize,
      viewportRatio,
      canvasPercentage: 100,
      canvasDragged: false,
      activeElementIdList: [],
      handleElementId: '',
      spotlightElementId: '',
      spotlightOptions: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      semanticStepTarget: null,
      zoomTarget: null,
    });
  }, [scene]);

  return (
    <SceneProvider>
      <SceneRenderer scene={scene} mode="playback" />
    </SceneProvider>
  );
}

export function PromptReadonlyBlock({
  label,
  value,
  placeholder,
  minHeightClassName,
}: {
  readonly label: string;
  readonly value?: string | null;
  readonly placeholder: string;
  readonly minHeightClassName: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <Textarea
        readOnly
        className={cn(
          'mt-2 resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800 shadow-inner',
          minHeightClassName,
        )}
        placeholder={placeholder}
        value={value || ''}
      />
    </label>
  );
}
