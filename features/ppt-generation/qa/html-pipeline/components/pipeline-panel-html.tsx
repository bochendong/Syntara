'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  formatCost,
  formatDuration,
  getSlideCanvasHeight,
  getSlideCanvasMode,
  HTML_SLIDE_GENERATION_CONCURRENCY,
} from '../lib/pipeline-core';
import type { HtmlPageError, HtmlPageResult, LessonPlan } from '../lib/pipeline-core';
import { ScaledHtmlPreview } from './pipeline-panel-primitives';

export function HtmlPagesReadablePanel({
  plan,
  pages,
  errors,
  generatingIds,
}: {
  plan: LessonPlan | null;
  pages: Record<string, HtmlPageResult>;
  errors: Record<string, HtmlPageError>;
  generatingIds: string[];
}) {
  const slides = plan?.slides || [];
  const pageSelectionKey = slides.map((slide) => slide.id).join('|');
  const [pageSelection, setPageSelection] = useState({ key: '', index: 0 });
  const rawActivePageIndex = pageSelection.key === pageSelectionKey ? pageSelection.index : 0;
  const activePageIndex = slides.length
    ? Math.min(Math.max(rawActivePageIndex, 0), slides.length - 1)
    : 0;
  const activeSlide = slides[activePageIndex] || null;
  const activeResult = activeSlide ? pages[activeSlide.id] : null;
  const activeError = activeSlide ? errors[activeSlide.id] : null;
  const activeIsRunning = activeSlide ? generatingIds.includes(activeSlide.id) : false;
  const activeStatus = activeResult
    ? 'pass'
    : activeError
      ? 'fail'
      : activeIsRunning
        ? 'running'
        : 'ready';
  const generatedCount = slides.filter((slide) => pages[slide.id]).length;
  const errorCount = slides.filter((slide) => errors[slide.id]).length;
  const runningCount = slides.filter((slide) => generatingIds.includes(slide.id)).length;
  const maxConcurrency = slides.length
    ? Math.min(HTML_SLIDE_GENERATION_CONCURRENCY, slides.length)
    : 0;
  const totalHtmlLength = slides.reduce(
    (sum, slide) => sum + (pages[slide.id]?.htmlLength || 0),
    0,
  );
  const totalCost = slides.reduce(
    (sum, slide) => sum + (pages[slide.id]?.costEstimate?.retailUsd || 0),
    0,
  );
  const setActivePageIndex = (nextIndex: number) => {
    setPageSelection({
      key: pageSelectionKey,
      index: Math.min(Math.max(nextIndex, 0), Math.max(slides.length - 1, 0)),
    });
  };

  if (!plan) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待前置规划通过。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            full notebook HTML run
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            整本 HTML 页面生成结果
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            generated {generatedCount}/{slides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            并发 {maxConcurrency}
          </Badge>
          {runningCount > 0 ? (
            <Badge variant="secondary" className="rounded-md">
              running {runningCount}
            </Badge>
          ) : null}
          <Badge variant={errorCount ? 'destructive' : 'outline'} className="rounded-md">
            errors {errorCount}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            html {totalHtmlLength.toLocaleString()}
          </Badge>
          {totalCost > 0 ? (
            <Badge variant="outline" className="rounded-md">
              ${totalCost.toFixed(4)}
            </Badge>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={activePageIndex <= 0}
              onClick={() => setActivePageIndex(activePageIndex - 1)}
              className="h-8 rounded-md px-2.5 text-xs"
            >
              <ChevronUp className="size-3.5" />
              上一页
            </Button>
            <Badge variant="secondary" className="rounded-md">
              {slides.length ? activePageIndex + 1 : 0}/{slides.length}
            </Badge>
            <Button
              type="button"
              variant="outline"
              disabled={!slides.length || activePageIndex >= slides.length - 1}
              onClick={() => setActivePageIndex(activePageIndex + 1)}
              className="h-8 rounded-md px-2.5 text-xs"
            >
              <ChevronDown className="size-3.5" />
              下一页
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {slides.map((slide, index) => {
            const result = pages[slide.id];
            const error = errors[slide.id];
            const isRunning = generatingIds.includes(slide.id);
            const status = result ? 'pass' : error ? 'fail' : isRunning ? 'running' : 'ready';
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActivePageIndex(index)}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left transition',
                  index === activePageIndex
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      result
                        ? 'bg-emerald-600 text-white'
                        : error
                          ? 'bg-red-600 text-white'
                          : isRunning
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {slide.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                        {slide.title}
                      </p>
                      <Badge
                        variant={
                          status === 'fail' ? 'destructive' : result ? 'secondary' : 'outline'
                        }
                        className="shrink-0 rounded-md"
                      >
                        {status === 'running'
                          ? '生成中'
                          : status === 'pass'
                            ? 'OK'
                            : status === 'fail'
                              ? '失败'
                              : '待生成'}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {slide.objective || slide.learnerQuestion || '缺少页面目标。'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="rounded-md">
                        {getSlideCanvasMode(slide)} {getSlideCanvasHeight(slide)}px
                      </Badge>
                      {result ? (
                        <Badge variant="outline" className="rounded-md">
                          {result.htmlLength.toLocaleString()} chars
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {activeSlide ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        activeResult
                          ? 'bg-emerald-600 text-white'
                          : activeError
                            ? 'bg-red-600 text-white'
                            : activeIsRunning
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-600',
                      )}
                    >
                      {activeSlide.order}
                    </span>
                    <h4 className="min-w-0 text-lg font-semibold tracking-normal text-slate-950">
                      {activeSlide.title}
                    </h4>
                    <Badge
                      variant={
                        activeStatus === 'fail'
                          ? 'destructive'
                          : activeResult
                            ? 'secondary'
                            : 'outline'
                      }
                      className="rounded-md"
                    >
                      {activeStatus === 'running'
                        ? '生成中'
                        : activeStatus === 'pass'
                          ? 'HTML OK'
                          : activeStatus === 'fail'
                            ? '失败'
                            : '待生成'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {activeSlide.objective || activeSlide.learnerQuestion || '缺少页面目标。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="rounded-md">
                    {getSlideCanvasMode(activeSlide)} {getSlideCanvasHeight(activeSlide)}px
                  </Badge>
                  {activeResult ? (
                    <>
                      <Badge variant="outline" className="rounded-md">
                        {activeResult.htmlLength.toLocaleString()} chars
                      </Badge>
                      <Badge variant="outline" className="rounded-md">
                        {formatDuration(activeResult.durationMs)}
                      </Badge>
                    </>
                  ) : null}
                </div>
              </div>

              {activeIsRunning ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <Loader2 className="size-4 animate-spin" />
                  当前页正在生成。
                </div>
              ) : null}

              {activeError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
                  <div className="font-semibold">{activeError.message}</div>
                  {activeError.details ? (
                    <p className="mt-1 text-xs">{activeError.details}</p>
                  ) : null}
                </div>
              ) : null}

              {activeResult ? (
                <div className="mt-4 space-y-3">
                  <ScaledHtmlPreview
                    title={`${activeSlide.title} HTML preview`}
                    html={activeResult.html}
                    canvasHeight={activeResult.canvasHeight || getSlideCanvasHeight(activeSlide)}
                  />
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-950">当前页生成指标</span>
                      <Badge variant="outline" className="rounded-md">
                        elements {activeResult.elementCount}
                      </Badge>
                      <Badge variant="outline" className="rounded-md">
                        text blocks {activeResult.textNodeCount}
                      </Badge>
                      <Badge variant="outline" className="rounded-md">
                        attempts {activeResult.generationAttempts || 1}
                      </Badge>
                      <Badge variant="outline" className="rounded-md">
                        {formatDuration(activeResult.durationMs)}
                      </Badge>
                      <Badge variant="outline" className="rounded-md">
                        {formatCost(activeResult.costEstimate)}
                      </Badge>
                    </div>
                    {activeResult.retryReasons?.length ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                        <div className="font-semibold">retry reasons</div>
                        <ul className="mt-1 list-inside list-disc">
                          {activeResult.retryReasons.map((reason, index) => (
                            <li key={`${reason.title}-${index}`}>{reason.title}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <details className="mt-3">
                      <summary className="cursor-pointer font-semibold text-slate-700">
                        当前页 HTML
                      </summary>
                      <Textarea
                        readOnly
                        value={activeResult.html}
                        className="mt-2 min-h-[220px] resize-y rounded-xl font-mono text-xs leading-5"
                      />
                    </details>
                  </div>
                </div>
              ) : !activeError && !activeIsRunning ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  当前页还没有生成 HTML。
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              没有可查看的页面。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
