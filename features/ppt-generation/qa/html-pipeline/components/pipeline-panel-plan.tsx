'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  courseRouteLabel,
  inferExpectedCourseRouteFromFixture,
  routeCoverageSummary,
} from '../lib/pipeline-core';
import type {
  CoursePlan,
  CourseSpine,
  LessonPlan,
  PlanningQualityReport,
  SlideTeachingOutline,
  TestfileFixture,
} from '../lib/pipeline-core';
import { PagerControls, TextList } from './pipeline-panel-primitives';

export function CoursePlanReadablePanel({
  coursePlan,
  courseSpine,
}: {
  coursePlan: CoursePlan;
  courseSpine?: CourseSpine;
}) {
  const spineActs = Array.isArray(courseSpine?.acts) ? courseSpine.acts : [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            coursePlan readable view
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            课程规划文本预览
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            coreQuestions {coursePlan.coreQuestions.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            acts {spineActs.length}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-purple-100 bg-purple-50/60 p-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-950">整课电影脚本主线</h4>
            <Badge variant="secondary" className="rounded-md">
              {spineActs.length} 幕
            </Badge>
          </div>
          {courseSpine ? (
            <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-800 lg:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-purple-700">Logline</div>
                <p className="mt-1">{courseSpine.logline || '缺少 logline。'}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-purple-700">中心问题</div>
                <p className="mt-1">{courseSpine.centralQuestion || '缺少 centralQuestion。'}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-purple-700">开场钩子</div>
                <p className="mt-1">{courseSpine.openingHook || '缺少 openingHook。'}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-purple-700">结尾回扣</div>
                <p className="mt-1">{courseSpine.closingCallback || '缺少 closingCallback。'}</p>
              </div>
              <div className="lg:col-span-2">
                <div className="text-xs font-semibold text-purple-700">Acts</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {spineActs.length ? (
                    spineActs.map((act) => (
                      <div
                        key={act.id}
                        className="rounded-lg border border-purple-100 bg-white p-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-normal text-purple-700">
                          {act.act} · {act.pages?.join(', ') || '-'}
                        </div>
                        <div className="mt-1 font-medium text-slate-950">{act.title}</div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{act.purpose}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-purple-200 p-3 text-sm text-slate-500">
                      缺少 acts。
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-purple-200 bg-white p-3 text-sm text-slate-500">
              缺少 courseSpine。
            </div>
          )}
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="text-xs font-semibold text-blue-700">课程目标</div>
          <p className="mt-2 text-sm leading-7 text-slate-800">
            {coursePlan.courseGoal || '缺少课程目标。'}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-500">目标学习者</div>
          <p className="mt-2 text-sm leading-7 text-slate-800">
            {coursePlan.targetLearner || '未说明目标学习者。'}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-950">核心问题</h4>
            <Badge variant="secondary" className="rounded-md">
              {coursePlan.coreQuestions.length} 个
            </Badge>
          </div>
          <div className="mt-3">
            <TextList items={coursePlan.coreQuestions} empty="缺少 coreQuestions。" />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
          <h4 className="text-sm font-semibold text-slate-950">轻量边界</h4>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            coursePlan 只保留导演阐述；叙事推进由 courseSpine.acts
            承担，源材料取舍、先修细节和每页节奏下沉到 slideOutlines / htmlPrompt。
          </p>
        </section>
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">调试 JSON</summary>
        <Textarea
          readOnly
          value={JSON.stringify({ coursePlan, courseSpine }, null, 2)}
          className="mt-3 min-h-[220px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </details>
    </div>
  );
}

export function PlanningQualityReadablePanel({ report }: { report: PlanningQualityReport }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Planning QA
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-950">{report.summary}</p>
        </div>
        <Badge variant={report.passed ? 'default' : 'destructive'} className="rounded-md">
          {report.blockingIssueCount} error / {report.warningIssueCount} warn
        </Badge>
      </div>

      {report.issues.length ? (
        <div className="mt-3 grid gap-2">
          {report.issues.map((issue) => (
            <div
              key={issue.code}
              className={cn(
                'rounded-xl border bg-white p-3',
                issue.severity === 'error' ? 'border-red-200' : 'border-amber-200',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={issue.severity === 'error' ? 'destructive' : 'outline'}
                  className="rounded-md"
                >
                  {issue.severity}
                </Badge>
                <span className="text-sm font-semibold text-slate-950">{issue.title}</span>
              </div>
              <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-600">
                {issue.details.map((detail, index) => (
                  <p key={`${issue.code}-${index}`}>{detail}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          没有 planning quality issue。
        </div>
      )}
    </div>
  );
}

export function PillList({
  items,
  empty,
  limit = 6,
}: {
  items: string[];
  empty: string;
  limit?: number;
}) {
  const visibleItems = items.filter(Boolean).slice(0, limit);
  const overflow = Math.max(0, items.filter(Boolean).length - visibleItems.length);
  if (!visibleItems.length) {
    return <span className="text-xs text-slate-400">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleItems.map((item, index) => (
        <span
          key={`${item}-${index}`}
          title={item}
          className="inline-flex max-w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium leading-5 text-slate-700"
        >
          <span className="min-w-0 whitespace-normal break-words">{item}</span>
        </span>
      ))}
      {overflow ? (
        <Badge variant="secondary" className="rounded-md">
          +{overflow}
        </Badge>
      ) : null}
    </div>
  );
}

export function SlideOutlinesReadablePanel({ outlines }: { outlines: SlideTeachingOutline[] }) {
  const firstOutlineId = outlines[0]?.id || '';
  const outlineSelectionKey = `${firstOutlineId}:${outlines.length}`;
  const [outlineSelection, setOutlineSelection] = useState({ key: '', index: 0 });
  const activeOutlineIndex =
    outlineSelection.key === outlineSelectionKey ? outlineSelection.index : 0;
  const updateActiveOutlineIndex = useCallback(
    (getNextIndex: (currentIndex: number) => number) => {
      setOutlineSelection((previous) => {
        const currentIndex = previous.key === outlineSelectionKey ? previous.index : 0;
        return { key: outlineSelectionKey, index: getNextIndex(currentIndex) };
      });
    },
    [outlineSelectionKey],
  );

  const withAnchors = outlines.filter((outline) => outline.sourceAnchors.length > 0).length;
  const withImages = outlines.filter((outline) => outline.sourceImageIds.length > 0).length;
  const withVisualPlan = outlines.filter((outline) => outline.visualPlan.trim()).length;
  const withContinuity = outlines.filter(
    (outline) =>
      outline.continuity?.fromPrevious &&
      outline.continuity.pageMove &&
      outline.continuity.toNext &&
      outline.continuity.callbackToSpine,
  ).length;
  const boundedOutlineIndex = outlines.length
    ? Math.min(activeOutlineIndex, outlines.length - 1)
    : 0;
  const activeOutline = outlines[boundedOutlineIndex] || null;

  if (!outlines.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 slideOutlines。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            slideOutlines readable view
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            逐页教学大纲
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            slides {outlines.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            anchors {withAnchors}/{outlines.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            visualPlan {withVisualPlan}/{outlines.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            continuity {withContinuity}/{outlines.length}
          </Badge>
          {withImages ? (
            <Badge variant="outline" className="rounded-md">
              images {withImages}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {activeOutline ? (
          <section
            key={activeOutline.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                    {activeOutline.order}
                  </span>
                  <h4 className="min-w-0 text-base font-semibold tracking-normal text-slate-950">
                    {activeOutline.title}
                  </h4>
                  <Badge variant="secondary" className="rounded-md">
                    第 {boundedOutlineIndex + 1}/{outlines.length} 页
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-blue-800">
                  {activeOutline.learnerQuestion || '缺少 learnerQuestion。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeOutline.canvasMode ? (
                  <Badge variant="secondary" className="rounded-md">
                    {activeOutline.canvasMode}
                  </Badge>
                ) : null}
                {activeOutline.canvasHeight ? (
                  <Badge variant="outline" className="rounded-md">
                    {activeOutline.canvasHeight}px
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-500">教学目标</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {activeOutline.teachingObjective || '缺少 teachingObjective。'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-500">视觉计划</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {activeOutline.visualPlan || '缺少 visualPlan。'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 lg:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-slate-500">分镜承接</div>
                  {activeOutline.continuity ? (
                    <Badge variant="outline" className="rounded-md">
                      {activeOutline.continuity.rhetoricalRole}
                    </Badge>
                  ) : null}
                </div>
                {activeOutline.continuity ? (
                  <div className="mt-2 grid gap-2 text-sm leading-6 text-slate-700 md:grid-cols-2">
                    <p>
                      <span className="font-medium text-slate-950">承接：</span>
                      {activeOutline.continuity.fromPrevious}
                    </p>
                    <p>
                      <span className="font-medium text-slate-950">推进：</span>
                      {activeOutline.continuity.pageMove}
                    </p>
                    <p>
                      <span className="font-medium text-slate-950">转场：</span>
                      {activeOutline.continuity.toNext}
                    </p>
                    <p>
                      <span className="font-medium text-slate-950">回扣：</span>
                      {activeOutline.continuity.callbackToSpine}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">缺少 continuity。</p>
                )}
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-500">关键点</div>
                <div className="mt-2">
                  <TextList items={activeOutline.keyPoints} empty="缺少 keyPoints。" />
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-500">源材料证据</div>
                <div className="mt-2">
                  <PillList items={activeOutline.sourceAnchors} empty="缺少 sourceAnchors。" />
                </div>
                {activeOutline.sourceUseRationale ? (
                  <p className="mt-3 break-words text-xs leading-5 text-slate-500">
                    {activeOutline.sourceUseRationale}
                  </p>
                ) : null}
                {activeOutline.sourceImageIds.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activeOutline.sourceImageIds.map((imageId) => (
                      <Badge key={imageId} variant="outline" className="rounded-md">
                        {imageId}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            没有可预览的 slideOutline。
          </div>
        )}
      </div>

      <div className="mt-3">
        <PagerControls
          index={boundedOutlineIndex}
          total={outlines.length}
          onPrevious={() => updateActiveOutlineIndex((index) => Math.max(0, index - 1))}
          onNext={() =>
            updateActiveOutlineIndex((index) => Math.min(outlines.length - 1, index + 1))
          }
        />
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">调试 JSON</summary>
        <Textarea
          readOnly
          value={JSON.stringify({ slideOutlines: outlines }, null, 2)}
          className="mt-3 min-h-[260px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </details>
    </div>
  );
}

export function RouteContractReadablePanel({
  plan,
  fixture,
}: {
  plan: LessonPlan | null;
  fixture: TestfileFixture | null;
}) {
  const slides = plan?.slides || [];
  const expectedRoute = inferExpectedCourseRouteFromFixture(fixture);
  const teachingSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  const routeSummary = routeCoverageSummary(slides);
  const specializedSlides = teachingSlides.filter(
    (slide) =>
      (slide.courseRoute === 'computer-science' && slide.csRoute && slide.csRoute !== 'standard') ||
      (slide.courseRoute === 'math' && slide.mathRoute && slide.mathRoute !== 'standard'),
  );

  if (!slides.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 slides，无法检查课程路线。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            route contract readable view
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            课程路线与专属生成线路
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这里不是看页面风格，而是检查规划产物是否把科目路线写成结构化字段，并交给后续 HTML
            生成器。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            expected {expectedRoute.label}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {routeSummary || '无路线'}
          </Badge>
          <Badge
            variant={specializedSlides.length ? 'secondary' : 'outline'}
            className="rounded-md"
          >
            specialized {specializedSlides.length}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm leading-6 text-blue-900">
        <div className="font-semibold">Source route hint：{expectedRoute.label}</div>
        <div className="mt-1 text-xs text-blue-800">
          {expectedRoute.evidence || '基于 sourcePackage / 文件名 / 科目目录推断。'}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_140px_150px_150px] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          <div>页</div>
          <div>标题</div>
          <div>courseRoute</div>
          <div>csRoute</div>
          <div>mathRoute</div>
        </div>
        <div className="divide-y divide-slate-100 bg-white">
          {slides.map((slide) => (
            <div
              key={slide.id}
              className="grid grid-cols-[56px_minmax(0,1fr)_140px_150px_150px] gap-2 px-3 py-2 text-xs leading-5 text-slate-700"
            >
              <div className="font-semibold text-slate-500">{slide.order}</div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-950">{slide.title}</div>
                <div className="truncate text-slate-500">{slide.pageKind}</div>
              </div>
              <div>{courseRouteLabel(slide.courseRoute)}</div>
              <div>{slide.csRoute || '-'}</div>
              <div>{slide.mathRoute || '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
