'use client';

import type { ReactNode } from 'react';
import { Layers3, Loader2, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  formatCost,
  formatDuration,
  getSinglePageTrialSlide,
  stepBadgeClassName,
  stepBadgeLabel,
  visibleTextFromHtml,
} from '../lib/pipeline-core';
import type {
  HtmlPageError,
  HtmlPageResult,
  LessonPlan,
  PipelineStepId,
  PipelineStepState,
} from '../lib/pipeline-core';
import { ScaledHtmlPreview, StepStatusIcon } from './pipeline-panel-primitives';

export function CoverPageReadablePanel({
  plan,
  result,
  error,
  isGenerating,
}: {
  plan: LessonPlan | null;
  result: HtmlPageResult | null;
  error: HtmlPageError | null;
  isGenerating: boolean;
}) {
  const trialSlide =
    result && plan?.slides?.length
      ? plan.slides.find((slide) => slide.id === result.slideId) || getSinglePageTrialSlide(plan)
      : getSinglePageTrialSlide(plan);
  if (!plan || !trialSlide) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待 htmlPrompt 通过后试跑第一张非封面正文页。
      </div>
    );
  }

  const visibleText = result ? visibleTextFromHtml(result.html) : '';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            single page gate
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            {trialSlide.title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这个 step 先只看第 {trialSlide.order} 页正文 HTML 是否能生成、预览和通过视觉
            gate；通过后再全量生成整本。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            第 {trialSlide.order} 页
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {trialSlide.pageKind}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {trialSlide.courseRoute || 'route auto'}
          </Badge>
          {result ? (
            <Badge variant="outline" className="rounded-md">
              text {visibleText.length}
            </Badge>
          ) : null}
        </div>
      </div>

      {isGenerating ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Loader2 className="size-4 animate-spin" />
          正在试跑第 {trialSlide.order} 页。
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
          <div className="font-semibold">{error.message}</div>
          {error.details ? <p className="mt-1 text-xs">{error.details}</p> : null}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <ScaledHtmlPreview title={`${trialSlide.title} single page preview`} html={result.html} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <div className="font-semibold text-slate-950">单页检测指标</div>
            <div className="mt-2 grid gap-1">
              <div>elements: {result.elementCount}</div>
              <div>text blocks: {result.textNodeCount}</div>
              <div>visible text: {visibleText.length}</div>
              <div>duration: {formatDuration(result.durationMs)}</div>
              <div>cost: {formatCost(result.costEstimate)}</div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-slate-700">HTML</summary>
              <Textarea
                readOnly
                value={result.html}
                className="mt-2 min-h-[220px] resize-y rounded-xl font-mono text-xs leading-5"
              />
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PipelineStepCard({
  order,
  title,
  artifact,
  description,
  state,
  actionLabel,
  onAction,
  actionDisabled,
  disabledReason,
  children,
}: {
  order: number;
  title: string;
  artifact: string;
  description: string;
  state: PipelineStepState;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}) {
  const locked = state === 'locked';
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm',
        locked ? 'border-slate-200 opacity-75' : 'border-slate-200',
      )}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                locked ? 'bg-slate-100 text-slate-400' : 'bg-emerald-600 text-white',
              )}
            >
              {order}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-normal text-slate-950">{title}</h2>
              <p className="truncate text-xs font-medium text-slate-500">{artifact}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold',
                stepBadgeClassName(state),
              )}
            >
              <StepStatusIcon state={state} />
              {stepBadgeLabel(state)}
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
          {locked && disabledReason ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              {disabledReason}
            </div>
          ) : null}
        </div>

        {actionLabel && onAction ? (
          <Button
            type="button"
            variant={state === 'fail' ? 'destructive' : locked ? 'outline' : 'default'}
            disabled={locked || actionDisabled}
            onClick={onAction}
            className="w-full lg:w-auto"
          >
            {state === 'running' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            {actionLabel}
          </Button>
        ) : null}
      </div>

      {!locked && children ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </section>
  );
}

export function PipelineSidebar({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: Array<{
    id: PipelineStepId;
    order: number;
    title: string;
    artifact: string;
    state: PipelineStepState;
    failCount: number;
    warnCount: number;
  }>;
  selectedStepId: PipelineStepId;
  onSelectStep: (stepId: PipelineStepId) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Layers3 className="size-4" />
          HTML 生成管线
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          左侧选择 step，右侧只显示当前 step 的测试结果。
        </p>
      </div>

      <div className="mt-2 grid gap-2">
        {steps.map((step) => {
          const selected = step.id === selectedStepId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={cn(
                'block w-full min-w-0 max-w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition',
                selected
                  ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="flex min-w-0 flex-1 gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {step.order}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {step.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                      {step.artifact}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'ml-auto inline-flex max-w-[92px] shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
                    stepBadgeClassName(step.state),
                  )}
                >
                  <span className="shrink-0">
                    <StepStatusIcon state={step.state} />
                  </span>
                  <span className="truncate">{stepBadgeLabel(step.state)}</span>
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">fail</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.failCount ? 'text-red-600' : 'text-slate-700',
                    )}
                  >
                    {step.failCount}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">warn</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.warnCount ? 'text-amber-700' : 'text-slate-700',
                    )}
                  >
                    {step.warnCount}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
