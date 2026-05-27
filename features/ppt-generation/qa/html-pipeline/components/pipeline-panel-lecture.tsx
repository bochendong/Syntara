'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { getSlideCanvasHeight } from '../lib/pipeline-core';
import type {
  HtmlPageResult,
  LectureActionType,
  LecturePageResult,
  LessonPlan,
} from '../lib/pipeline-core';
import { ScaledHtmlPreview } from './pipeline-panel-primitives';

export function lectureActionClassName(actionType: LectureActionType): string {
  if (actionType === 'speech') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (actionType === 'spotlight') return 'border-slate-300 bg-slate-950 text-white';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export function LectureActionsReadablePanel({
  plan,
  results,
  isGenerating,
}: {
  plan: LessonPlan | null;
  results: Record<string, LecturePageResult>;
  isGenerating: boolean;
}) {
  const slides = plan?.slides || [];
  const pageSelectionKey = slides.map((slide) => slide.id).join('|');
  const [pageSelection, setPageSelection] = useState({ key: '', index: 0 });
  const [actionSelection, setActionSelection] = useState({ key: '', index: 0 });
  const activePageIndex =
    pageSelection.key === pageSelectionKey
      ? Math.min(Math.max(pageSelection.index, 0), Math.max(0, slides.length - 1))
      : 0;
  const activeSlide = slides[activePageIndex] || null;
  const activeResult = activeSlide ? results[activeSlide.id] : null;
  const activeActions = activeResult?.actions || [];
  const activeActionKey = activeResult?.slideId || '';
  const activeActionIndex =
    actionSelection.key === activeActionKey
      ? Math.min(Math.max(actionSelection.index, 0), Math.max(0, activeActions.length - 1))
      : 0;
  const activeAction = activeActions[activeActionIndex] || null;
  const activeActionTarget =
    activeAction?.targetId && activeResult
      ? activeResult.targets.find((target) => target.id === activeAction.targetId) || null
      : null;
  const generatedCount = slides.filter((slide) => results[slide.id]).length;
  const totalActions = Object.values(results).reduce(
    (sum, result) => sum + result.actions.length,
    0,
  );
  const totalTargets = Object.values(results).reduce(
    (sum, result) => sum + result.targets.length,
    0,
  );
  const setActivePageIndex = (nextIndex: number) => {
    setPageSelection({
      key: pageSelectionKey,
      index: Math.min(Math.max(nextIndex, 0), Math.max(slides.length - 1, 0)),
    });
    setActionSelection({ key: '', index: 0 });
  };
  const setActiveActionIndex = (nextIndex: number) => {
    setActionSelection({
      key: activeActionKey,
      index: Math.min(Math.max(nextIndex, 0), Math.max(activeActions.length - 1, 0)),
    });
  };

  if (!plan) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待整本 HTML 生成通过。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            lecture action plan
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            讲解稿与讲解动作
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            基于每页实际 HTML DOM 生成
            speech、spotlight、laser；这里先验收讲稿和动作序列，不做音频合成。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            pages {generatedCount}/{slides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            actions {totalActions}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            targets {totalTargets}
          </Badge>
          {isGenerating ? (
            <Badge variant="secondary" className="rounded-md">
              generating
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {slides.map((slide, index) => {
            const result = results[slide.id];
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
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      result ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {slide.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {slide.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="rounded-md">
                        {slide.pageKind}
                      </Badge>
                      {result ? (
                        <Badge variant="secondary" className="rounded-md">
                          {result.actions.length} actions
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-md">
                          待生成
                        </Badge>
                      )}
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
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                      {activeSlide.order}
                    </span>
                    <h4 className="min-w-0 text-lg font-semibold tracking-normal text-slate-950">
                      {activeSlide.title}
                    </h4>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {activeSlide.learnerQuestion || activeSlide.objective || '缺少页面目标。'}
                  </p>
                </div>
                {activeResult ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="rounded-md">
                      targets {activeResult.targets.length}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                      actions {activeResult.actions.length}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                      script {activeResult.scriptText.length}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeActionIndex <= 0}
                      onClick={() => setActiveActionIndex(activeActionIndex - 1)}
                      className="h-8 rounded-md px-2.5 text-xs"
                    >
                      <ChevronUp className="size-3.5" />
                      上一动作
                    </Button>
                    <Badge variant="secondary" className="rounded-md">
                      {activeActions.length ? activeActionIndex + 1 : 0}/{activeActions.length}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !activeActions.length || activeActionIndex >= activeActions.length - 1
                      }
                      onClick={() => setActiveActionIndex(activeActionIndex + 1)}
                      className="h-8 rounded-md px-2.5 text-xs"
                    >
                      <ChevronDown className="size-3.5" />
                      下一动作
                    </Button>
                  </div>
                ) : null}
              </div>

              {activeResult ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  {activeAction ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950 lg:col-span-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="rounded-md">
                          当前动作 {activeActionIndex + 1}
                        </Badge>
                        <span
                          className={cn(
                            'rounded-md border px-2 py-0.5 text-xs font-semibold',
                            lectureActionClassName(activeAction.type),
                          )}
                        >
                          {activeAction.type}
                        </span>
                        <span className="font-semibold">{activeAction.title}</span>
                      </div>
                      {activeActionTarget ? (
                        <div className="mt-2 text-xs text-blue-800">
                          target: {activeActionTarget.id} · {activeActionTarget.label} · x{' '}
                          {Math.round(activeActionTarget.rect.x)} · y{' '}
                          {Math.round(activeActionTarget.rect.y)}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-blue-800">
                          {activeAction.type === 'speech'
                            ? 'speech 动作不绑定遮罩 target。'
                            : '这个动作还没有绑定 target。'}
                        </div>
                      )}
                      {activeAction.text ? (
                        <div className="mt-2 rounded-lg border border-blue-100 bg-white/70 p-2 text-xs text-slate-700">
                          {activeAction.text}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">讲解稿 speech 文本</div>
                    <Textarea
                      readOnly
                      value={activeResult.scriptText || '当前页没有 speech 文本。'}
                      className="mt-3 min-h-[260px] resize-y rounded-xl text-sm leading-6"
                    />
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">动作序列</div>
                    <div className="mt-3 grid gap-2">
                      {activeResult.actions.map((action, index) => {
                        const target = action.targetId
                          ? activeResult.targets.find((item) => item.id === action.targetId)
                          : null;
                        const selected = index === activeActionIndex;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => setActiveActionIndex(index)}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-left text-xs leading-5 transition',
                              selected
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-md">
                                {index + 1}
                              </Badge>
                              <span
                                className={cn(
                                  'rounded-md border px-2 py-0.5 font-semibold',
                                  lectureActionClassName(action.type),
                                )}
                              >
                                {action.type}
                              </span>
                              <span className="font-semibold text-slate-950">{action.title}</span>
                            </div>
                            {target ? (
                              <div className="mt-1 text-slate-600">
                                target: {target.id} · {target.label}
                              </div>
                            ) : null}
                            {action.text ? (
                              <div className="mt-1 text-slate-600">{action.text}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {activeResult.warnings.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 lg:col-span-2">
                      <div className="font-semibold">Warnings</div>
                      <ul className="mt-1 list-inside list-disc">
                        {activeResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  当前页还没有讲解动作。
                </div>
              )}
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

export function LecturePositioningReadablePanel({
  plan,
  pages,
  results,
}: {
  plan: LessonPlan | null;
  pages: Record<string, HtmlPageResult>;
  results: Record<string, LecturePageResult>;
}) {
  const slides = plan?.slides || [];
  const maskSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  const pageSelectionKey = maskSlides.map((slide) => slide.id).join('|');
  const [pageSelection, setPageSelection] = useState({ key: '', index: 0 });
  const [focusActionIndex, setFocusActionIndex] = useState(0);
  const activePageIndex =
    pageSelection.key === pageSelectionKey
      ? Math.min(Math.max(pageSelection.index, 0), Math.max(0, maskSlides.length - 1))
      : 0;
  const activeSlide = maskSlides[activePageIndex] || null;
  const activeResult = activeSlide ? results[activeSlide.id] : null;
  const activePage = activeSlide ? pages[activeSlide.id] : null;
  const positionedResultCount = maskSlides.filter((slide) => results[slide.id]).length;
  const focusActions = (activeResult?.actions || []).filter(
    (action) => action.targetId && (action.type === 'spotlight' || action.type === 'laser'),
  );
  const safeFocusActionIndex = focusActions.length
    ? Math.min(Math.max(focusActionIndex, 0), focusActions.length - 1)
    : 0;
  const activeFocusAction = focusActions[safeFocusActionIndex] || null;
  const activeTarget = activeFocusAction?.targetId
    ? activeResult?.targets.find((target) => target.id === activeFocusAction.targetId) || null
    : null;
  const setActivePageIndex = (nextIndex: number) => {
    setPageSelection({
      key: pageSelectionKey,
      index: Math.min(Math.max(nextIndex, 0), Math.max(maskSlides.length - 1, 0)),
    });
    setFocusActionIndex(0);
  };

  if (!plan) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待讲解动作生成。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            lecture positioning test
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            讲解遮罩与定位预览
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            只验收非封面正文页：action 先指向目标，再由渲染层测量 DOM
            rect，用遮罩或激光笔落到具体位置。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            pages {positionedResultCount}/{maskSlides.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            focus {focusActions.length}
          </Badge>
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
              {maskSlides.length ? activePageIndex + 1 : 0}/{maskSlides.length}
            </Badge>
            <Button
              type="button"
              variant="outline"
              disabled={!maskSlides.length || activePageIndex >= maskSlides.length - 1}
              onClick={() => setActivePageIndex(activePageIndex + 1)}
              className="h-8 rounded-md px-2.5 text-xs"
            >
              <ChevronDown className="size-3.5" />
              下一页
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {activeSlide && activePage ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                      {activeSlide.order}
                    </span>
                    <h4 className="min-w-0 text-lg font-semibold tracking-normal text-slate-950">
                      {activeSlide.title}
                    </h4>
                    {activeFocusAction ? (
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-xs font-semibold',
                          lectureActionClassName(activeFocusAction.type),
                        )}
                      >
                        {activeFocusAction.type}
                      </span>
                    ) : null}
                  </div>
                  {activeTarget ? (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      当前 target：{activeTarget.id} · {activeTarget.label}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      当前页没有可预览的 spotlight/laser action。
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeResult ? (
                    <Badge variant="outline" className="rounded-md">
                      targets {activeResult.targets.length}
                    </Badge>
                  ) : null}
                  {activeTarget ? (
                    <Badge variant="outline" className="rounded-md">
                      {Math.round(activeTarget.rect.width)}×{Math.round(activeTarget.rect.height)}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-4">
                <ScaledHtmlPreview
                  title={`${activeSlide.title} lecture mask preview`}
                  html={activePage.html}
                  canvasHeight={activePage.canvasHeight || getSlideCanvasHeight(activeSlide)}
                  overlayRect={activeTarget?.rect || null}
                  overlayLabel={
                    activeTarget ? `${activeFocusAction?.type}: ${activeTarget.id}` : ''
                  }
                  overlayTone={activeFocusAction?.type === 'laser' ? 'laser' : 'spotlight'}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              当前页还没有 HTML 或讲解定位结果。
            </div>
          )}
        </section>

        <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500">定位目标与动作</div>
          {focusActions.length ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={safeFocusActionIndex <= 0}
                onClick={() => setFocusActionIndex((index) => Math.max(0, index - 1))}
                className="h-8 rounded-md px-2.5 text-xs"
              >
                <ChevronUp className="size-3.5" />
                上一个
              </Button>
              <Badge variant="secondary" className="rounded-md">
                {safeFocusActionIndex + 1}/{focusActions.length}
              </Badge>
              <Button
                type="button"
                variant="outline"
                disabled={safeFocusActionIndex >= focusActions.length - 1}
                onClick={() =>
                  setFocusActionIndex((index) => Math.min(focusActions.length - 1, index + 1))
                }
                className="h-8 rounded-md px-2.5 text-xs"
              >
                <ChevronDown className="size-3.5" />
                下一个
              </Button>
            </div>
          ) : null}

          <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {activeResult?.targets.length ? (
              activeResult.targets.map((target) => {
                const usedByAction = focusActions.some((action) => action.targetId === target.id);
                const selected = activeTarget?.id === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => {
                      const actionIndex = focusActions.findIndex(
                        (action) => action.targetId === target.id,
                      );
                      if (actionIndex >= 0) setFocusActionIndex(actionIndex);
                    }}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-xs leading-5 transition',
                      selected
                        ? 'border-blue-300 bg-blue-50'
                        : usedByAction
                          ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                          : 'border-slate-100 bg-white opacity-80',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-950">{target.id}</span>
                      <Badge
                        variant={usedByAction ? 'secondary' : 'outline'}
                        className="rounded-md"
                      >
                        {target.kind}
                      </Badge>
                    </div>
                    <div className="mt-1 text-slate-600">{target.label}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500">
                      x {Math.round(target.rect.x)} · y {Math.round(target.rect.y)} · w{' '}
                      {Math.round(target.rect.width)} · h {Math.round(target.rect.height)}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      {target.selector}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                当前页没有解析到 target。
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
