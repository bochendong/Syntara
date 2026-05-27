'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { courseRouteLabel, getSlideCanvasMode, routeCoverageSummary } from '../lib/pipeline-core';
import type { LessonPlan, LessonSlidePlan } from '../lib/pipeline-core';

export function promptPreview(prompt: string, maxLength = 520): string {
  const text = prompt.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

export function splitHtmlPromptForDisplay(prompt: string): {
  variablePart: string;
  fixedPart: string;
} {
  const marker = '硬性生成契约（必须逐条遵守）：';
  const index = prompt.indexOf(marker);
  if (index < 0) {
    return { variablePart: prompt.trim(), fixedPart: '' };
  }
  return {
    variablePart: prompt.slice(0, index).trim(),
    fixedPart: prompt.slice(index).trim(),
  };
}

export function PromptTextBlock({
  title,
  value,
  tone = 'slate',
}: {
  title: string;
  value: string;
  tone?: 'slate' | 'blue';
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border p-3',
        tone === 'blue' ? 'border-blue-100 bg-blue-50/60' : 'border-slate-200 bg-slate-50',
      )}
    >
      <div
        className={cn(
          'text-xs font-semibold',
          tone === 'blue' ? 'text-blue-700' : 'text-slate-500',
        )}
      >
        {title}
      </div>
      <pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-700">
        {value || '空'}
      </pre>
    </div>
  );
}

export function PromptSlidePagerCard({
  slide,
  index,
  total,
  onPrevious,
  onNext,
}: {
  slide: LessonSlidePlan;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const promptSplit = splitHtmlPromptForDisplay(slide.htmlPrompt);
  const isFirst = index === 0;
  const isLast = index >= total - 1;

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
              {slide.order}
            </span>
            <h4 className="min-w-0 text-base font-semibold tracking-normal text-slate-950">
              {slide.title}
            </h4>
            <Badge variant="secondary" className="rounded-md">
              第 {index + 1}/{total} 页
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {slide.objective || slide.learnerQuestion || '缺少页面目标。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="rounded-md">
            {slide.pageKind}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            route {courseRouteLabel(slide.courseRoute)}
          </Badge>
          {slide.csRoute ? (
            <Badge variant="outline" className="rounded-md">
              CS {slide.csRoute}
            </Badge>
          ) : null}
          {slide.mathRoute ? (
            <Badge variant="outline" className="rounded-md">
              math {slide.mathRoute}
            </Badge>
          ) : null}
          <Badge variant="outline" className="rounded-md">
            {slide.density}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {getSlideCanvasMode(slide)}
          </Badge>
          <Badge variant={promptSplit.fixedPart ? 'outline' : 'destructive'} className="rounded-md">
            {promptSplit.fixedPart ? 'fixed contract' : 'missing contract'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">
            实际 htmlPrompt：AI 生成段 / 系统固定段
          </div>
          <Badge variant={promptSplit.fixedPart ? 'outline' : 'destructive'} className="rounded-md">
            {promptSplit.fixedPart ? 'split' : 'missing fixed'}
          </Badge>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <PromptTextBlock
            title="AI 生成段：规划器返回的本页 HTML prompt"
            value={promptPreview(promptSplit.variablePart, 2600)}
            tone="blue"
          />
          <PromptTextBlock
            title="系统固定段：后端代码追加的硬性生成契约"
            value={promptPreview(promptSplit.fixedPart, 2600)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isFirst}
          onClick={onPrevious}
          className="h-9 rounded-lg"
        >
          <ChevronUp className="size-4" />
          上一页
        </Button>
        <div className="text-xs font-medium text-slate-500">
          {index + 1} / {total}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isLast}
          onClick={onNext}
          className="h-9 rounded-lg"
        >
          <ChevronDown className="size-4" />
          下一页
        </Button>
      </div>
    </section>
  );
}

export function HtmlPromptsReadablePanel({ plan }: { plan: LessonPlan | null }) {
  const slides = plan?.slides || [];
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const withMandatoryContent = slides.filter(
    (slide) => slide.mandatoryVisibleContent?.length,
  ).length;
  const withAnchors = slides.filter((slide) => slide.sourceAnchors?.length).length;
  const longPrompts = slides.filter((slide) => slide.htmlPrompt.trim().length >= 220).length;
  const routeSummary = routeCoverageSummary(slides);
  const safeActiveSlideIndex = Math.min(activeSlideIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[safeActiveSlideIndex] || slides[0];

  if (!slides.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 slides[].htmlPrompt。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            htmlPrompt readable view
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            单页 HTML 生成契约
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            prompts {slides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            complete {longPrompts}/{slides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            visibleContent {withMandatoryContent}/{slides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            anchors {withAnchors}/{slides.length}
          </Badge>
          {routeSummary ? (
            <Badge variant="outline" className="rounded-md">
              {routeSummary}
            </Badge>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={safeActiveSlideIndex === 0}
              onClick={() => setActiveSlideIndex((index) => Math.max(0, index - 1))}
              className="h-8 rounded-md px-2.5 text-xs"
            >
              <ChevronUp className="size-3.5" />
              上一页
            </Button>
            <Badge variant="secondary" className="rounded-md">
              {safeActiveSlideIndex + 1}/{slides.length}
            </Badge>
            <Button
              type="button"
              variant="outline"
              disabled={safeActiveSlideIndex >= slides.length - 1}
              onClick={() => setActiveSlideIndex((index) => Math.min(slides.length - 1, index + 1))}
              className="h-8 rounded-md px-2.5 text-xs"
            >
              <ChevronDown className="size-3.5" />
              下一页
            </Button>
          </div>
        </div>
      </div>

      {activeSlide ? (
        <PromptSlidePagerCard
          slide={activeSlide}
          index={safeActiveSlideIndex}
          total={slides.length}
          onPrevious={() => setActiveSlideIndex((index) => Math.max(0, index - 1))}
          onNext={() => setActiveSlideIndex((index) => Math.min(slides.length - 1, index + 1))}
        />
      ) : null}

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">调试 JSON</summary>
        <Textarea
          readOnly
          value={JSON.stringify(
            {
              htmlPrompts: slides.map((slide) => ({
                id: slide.id,
                title: slide.title,
                pageKind: slide.pageKind,
                canvasMode: slide.canvasMode,
                density: slide.density,
                sourceAnchors: slide.sourceAnchors,
                courseRoute: slide.courseRoute,
                csRoute: slide.csRoute,
                mathRoute: slide.mathRoute,
                mandatoryVisibleContent: slide.mandatoryVisibleContent,
                sourceUseRationale: slide.sourceUseRationale,
                htmlPrompt: slide.htmlPrompt,
              })),
            },
            null,
            2,
          )}
          className="mt-3 min-h-[260px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </details>
    </div>
  );
}
