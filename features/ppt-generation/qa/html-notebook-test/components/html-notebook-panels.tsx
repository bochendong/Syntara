'use client';

import Link from 'next/link';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileCode2,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  HtmlGenerationPipelinePanel,
  HtmlTestProgressionPanel,
} from '@/components/generation/html-test-progression-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatUsdLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

import {
  canvasModeLabel,
  buildSlideKey,
  courseRoutePromptLabel,
  csRoutePromptLabel,
  densityLabel,
  evaluatePreview,
  formatCostEstimate,
  formatDuration,
  formatImageCostLabel,
  formatTime,
  formatTokenUsage,
  getEstimatedImageCostLabel,
  getSlideCanvasMode,
  HTML_LESSON_MODEL,
  HTML_SLIDE_GENERATION_CONCURRENCY,
  mathRoutePromptLabel,
  PageCountTier,
  pageKindLabel,
  planningQualityClassName,
  PreviewStats,
  slideJobStatusClassName,
  slideJobStatusLabel,
  sourceImageLabel,
  sourceUsageLabel,
  TIER_OPTIONS,
  type GenerationErrorResult,
  type HtmlCanvasMode,
  type HtmlSlideGenerationJob,
  type HtmlSlideResult,
  type LessonPlanResult,
  type LessonSlidePlan,
  type SlideTeachingOutline,
  type TestfileFixture,
} from '../lib/page-core';

type SlideJobSummary = {
  queuedCount: number;
  runningCount: number;
  failedCount: number;
  succeededCount: number;
  skippedCount: number;
};

type PipelinePhase = 'course-plan' | 'html-prompts' | 'html-pages';

type PreviewStatus = 'pass' | 'fail' | 'empty';

type HtmlNotebookHeaderProps = {
  activePipelinePhase: PipelinePhase;
  currentPlan: LessonPlanResult | null;
  errorCount: number;
  fixtureError: GenerationErrorResult | null;
  generatedCount: number;
  generatedImageCount: number;
  imageCapableCount: number;
  pendingImageCount: number;
  slideJobSummary: SlideJobSummary;
  sourceImageCount: number;
  sourceImageUsageCount: number;
  totalHtmlCost: number;
  totalImageCost: number;
};

export function HtmlNotebookHeader({
  activePipelinePhase,
  currentPlan,
  errorCount,
  fixtureError,
  generatedCount,
  generatedImageCount,
  imageCapableCount,
  pendingImageCount,
  slideJobSummary,
  sourceImageCount,
  sourceImageUsageCount,
  totalHtmlCost,
  totalImageCost,
}: HtmlNotebookHeaderProps) {
  return (
    <>
      <div>
        <Link
          href="/test"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
        >
          <ChevronLeft className="size-4" />
          返回所有测试
        </Link>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <Layers3 className="size-4" />
              HTML Notebook Deck QA
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
              HTML 整本笔记本生成测试
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              模拟“选择文件 notebook → 选择页数档位 → 先规划全书结构 → 给每页写 HTML prompt →
              逐页生成 HTML”的链路。这里先不生成讲解动作和讲稿，只看跨文件内容分配和 HTML 结果。
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-7 xl:min-w-[720px] xl:max-w-[880px]">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">模型</div>
              <div className="mt-1 font-semibold text-slate-950">{HTML_LESSON_MODEL}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">计划页数</div>
              <div className="mt-1 font-semibold text-slate-950">
                {currentPlan?.plan.pageCount || '-'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">已生成</div>
              <div className="mt-1 font-semibold text-slate-950">
                {generatedCount}/{currentPlan?.plan.pageCount || 0}
                {slideJobSummary.queuedCount || slideJobSummary.runningCount ? (
                  <span className="block text-xs text-blue-600">
                    运行 {slideJobSummary.runningCount} · 排队 {slideJobSummary.queuedCount}
                  </span>
                ) : errorCount ? (
                  <span className="block text-xs text-red-600">{errorCount} 失败</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">估算费用</div>
              <div className="mt-1 font-semibold text-slate-950">
                {totalHtmlCost > 0 ? formatUsdLabel(totalHtmlCost) : '-'}
                {totalImageCost > 0 ? (
                  <span className="block text-xs text-slate-500">
                    图片 {formatUsdLabel(totalImageCost)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">AI 插图</div>
              <div className="mt-1 font-semibold text-slate-950">
                {generatedImageCount}/{imageCapableCount}
                {pendingImageCount ? (
                  <span className="block text-xs text-blue-600">{pendingImageCount} 待点击</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">原文图</div>
              <div className="mt-1 font-semibold text-slate-950">
                {sourceImageCount}
                {sourceImageUsageCount ? (
                  <span className="block text-xs text-emerald-700">
                    规划 {sourceImageUsageCount}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">总耗时</div>
              <div className="mt-1 font-semibold text-slate-950">
                {formatDuration(currentPlan?.lastRun?.durationMs)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <HtmlTestProgressionPanel currentStageId="html-notebook" />
      <HtmlGenerationPipelinePanel activePhase={activePipelinePhase} />

      {fixtureError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            读取 fixture 失败
          </div>
          <p className="mt-1">{fixtureError.message}</p>
          {fixtureError.details ? <p className="mt-1 text-xs">{fixtureError.details}</p> : null}
        </div>
      ) : null}
    </>
  );
}

type HtmlNotebookSidebarProps = {
  clearCurrentPlan: () => void;
  currentPlan: LessonPlanResult | null;
  currentPlanError: GenerationErrorResult | null;
  currentSlide: LessonSlidePlan | null;
  errorCount: number;
  errorsBySlide: Record<string, GenerationErrorResult>;
  fixtures: TestfileFixture[];
  generatedCount: number;
  generatingSlideIdSet: Set<string>;
  handleGenerateMissingSlides: () => Promise<void>;
  handleGeneratePlanOnly: () => void;
  handleGenerateWholeLesson: () => Promise<void>;
  htmlBySlide: Record<string, HtmlSlideResult>;
  isBusy: boolean;
  isLoadingFixtures: boolean;
  isPlanning: boolean;
  jobsBySlide: Record<string, HtmlSlideGenerationJob>;
  loadFixtures: () => Promise<void>;
  runMessage: string;
  selectedFixture: TestfileFixture | null;
  selectedTier: PageCountTier;
  setSelectedFixtureId: Dispatch<SetStateAction<string>>;
  setSelectedSlideId: (slideId: string) => void;
  setSelectedTier: Dispatch<SetStateAction<PageCountTier>>;
  slideJobSummary: SlideJobSummary;
};

export function HtmlNotebookSidebar({
  clearCurrentPlan,
  currentPlan,
  currentPlanError,
  currentSlide,
  errorCount,
  errorsBySlide,
  fixtures,
  generatedCount,
  generatingSlideIdSet,
  handleGenerateMissingSlides,
  handleGeneratePlanOnly,
  handleGenerateWholeLesson,
  htmlBySlide,
  isBusy,
  isLoadingFixtures,
  isPlanning,
  jobsBySlide,
  loadFixtures,
  runMessage,
  selectedFixture,
  selectedTier,
  setSelectedFixtureId,
  setSelectedSlideId,
  setSelectedTier,
  slideJobSummary,
}: HtmlNotebookSidebarProps) {
  return (
    <aside className="min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-3rem)]">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">整本笔记本设置</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          选择 testfile/科目测试 下的单个文件和页数档位，先让 AI 分配整本 notebook 的页面容量。
        </p>

        <div className="mt-4 grid min-w-0 gap-3">
          <label className="block text-xs font-medium text-slate-600">
            文件 notebook
            <Select
              value={selectedFixture?.id || ''}
              onValueChange={setSelectedFixtureId}
              disabled={isBusy}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="选择科目里的文件" />
              </SelectTrigger>
              <SelectContent>
                {fixtures.map((fixture) => (
                  <SelectItem key={fixture.id} value={fixture.id}>
                    {fixture.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            页数档位
            <Select
              value={selectedTier}
              onValueChange={(value) => setSelectedTier(value as PageCountTier)}
              disabled={isBusy}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((tier) => (
                  <SelectItem key={tier.value} value={tier.value}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            {TIER_OPTIONS.find((tier) => tier.value === selectedTier)?.detail}
            <br />
            规划阶段决定页面容量；HTML 生成阶段一次最多并发 {HTML_SLIDE_GENERATION_CONCURRENCY}{' '}
            页，完成后会继续跑后续页面。
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              disabled={!selectedFixture || isBusy}
              onClick={handleGenerateWholeLesson}
            >
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              并行生成整本 notebook
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!selectedFixture || isBusy}
                onClick={handleGeneratePlanOnly}
              >
                {isPlanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                只生成规划
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!currentPlan || isBusy}
                onClick={() => void handleGenerateMissingSlides()}
              >
                <Play className="size-4" />
                并行生成缺失
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingFixtures || isBusy}
                onClick={() => void loadFixtures()}
              >
                {isLoadingFixtures ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                重新读取
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selectedFixture || isBusy}
                onClick={clearCurrentPlan}
                title="清空当前文件和页数档位下的规划、HTML、错误与生成状态"
              >
                <Trash2 className="size-4" />
                清空当前结果
              </Button>
            </div>
          </div>

          {selectedFixture?.sourcePackage ? (
            <div className="min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
              <div className="font-semibold">源材料包</div>
              <div className="mt-1">
                {selectedFixture.sourcePackage.parser || selectedFixture.fileType} ·{' '}
                {selectedFixture.sourcePackage.pageCount || '-'} 页/段 · 原文图片{' '}
                {selectedFixture.sourcePackage.sourceImages.length} 张
              </div>
              {selectedFixture.sourcePackage.warnings?.length ? (
                <div className="mt-1 text-amber-700">
                  {selectedFixture.sourcePackage.warnings.slice(0, 2).join(' / ')}
                </div>
              ) : null}
              {selectedFixture.sourcePackage.sourceImages.length ? (
                <div className="mt-2 grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
                  {selectedFixture.sourcePackage.sourceImages.slice(0, 6).map((image) => (
                    <div
                      key={image.id}
                      className="min-w-0 overflow-hidden rounded-lg border border-emerald-100 bg-white"
                      title={sourceImageLabel(image)}
                    >
                      <img
                        src={image.src}
                        alt={image.description || image.id}
                        className="h-12 w-full object-contain"
                      />
                      <div className="truncate px-1.5 py-1 text-[10px] text-emerald-900">
                        {image.id} · p{image.pageNumber}
                      </div>
                    </div>
                  ))}
                  {selectedFixture.sourcePackage.sourceImages.length > 6 ? (
                    <div className="flex min-h-[72px] min-w-0 items-center justify-center rounded-lg border border-dashed border-emerald-200 bg-white/70 px-2 text-center text-[10px] font-semibold text-emerald-700">
                      +{selectedFixture.sourcePackage.sourceImages.length - 6} 张
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {runMessage ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {runMessage}
          </div>
        ) : null}

        {currentPlanError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="font-semibold">规划失败</div>
            <p className="mt-1">{currentPlanError.message}</p>
            {currentPlanError.details ? (
              <p className="mt-1 whitespace-pre-wrap">{currentPlanError.details}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">规划出的 slides</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              每页有规划 prompt；生成时会追加结构化 outline、密度契约和源图片。
            </p>
          </div>
          <Badge variant="outline">
            {generatedCount}/{currentPlan?.plan.pageCount || 0}
            {slideJobSummary.runningCount || slideJobSummary.queuedCount
              ? ` · 运行 ${slideJobSummary.runningCount} · 排队 ${slideJobSummary.queuedCount}`
              : errorCount
                ? ` · ${errorCount} 错`
                : ''}
          </Badge>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {currentPlan?.plan.slides.length ? (
            currentPlan.plan.slides.map((slide) => {
              const key = buildSlideKey(currentPlan.signature, slide.id);
              const result = htmlBySlide[key] || null;
              const error = errorsBySlide[key] || null;
              const job = jobsBySlide[key] || null;
              const isRunning = generatingSlideIdSet.has(slide.id) || job?.status === 'running';
              const isQueued = job?.status === 'queued';
              const statusText = isRunning
                ? slideJobStatusLabel('running')
                : isQueued
                  ? slideJobStatusLabel('queued')
                  : error
                    ? slideJobStatusLabel('failed')
                    : result
                      ? slideJobStatusLabel('succeeded')
                      : '待生成';
              const statusClassName = isRunning
                ? slideJobStatusClassName('running')
                : isQueued
                  ? slideJobStatusClassName('queued')
                  : error
                    ? slideJobStatusClassName('failed')
                    : result
                      ? slideJobStatusClassName('succeeded')
                      : slideJobStatusClassName('skipped');
              const isSelected = currentSlide?.id === slide.id;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setSelectedSlideId(slide.id)}
                  className={cn(
                    'block w-full rounded-xl border px-3 py-2 text-left transition',
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {slide.order}
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {slide.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                        <span>{pageKindLabel(slide.pageKind)}</span>
                        <span>·</span>
                        <span
                          className={
                            getSlideCanvasMode(slide) !== 'slide'
                              ? 'font-semibold text-purple-700'
                              : ''
                          }
                        >
                          {canvasModeLabel(slide)}
                        </span>
                        {slide.courseRoute ? (
                          <>
                            <span>·</span>
                            <span>{courseRoutePromptLabel(slide.courseRoute)}</span>
                          </>
                        ) : null}
                        {slide.csRoute ? (
                          <>
                            <span>·</span>
                            <span className="text-indigo-700">
                              CS {slide.csRoute === 'standard' ? '标准' : slide.csRoute}
                            </span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{densityLabel(slide.density)}</span>
                        <span>·</span>
                        <span>{sourceUsageLabel(slide.sourceUsage)}</span>
                        {slide.sourceImageIds?.length ? (
                          <>
                            <span>·</span>
                            <span className="text-emerald-700">
                              原图 {slide.sourceImageIds.join(', ')}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0', statusClassName)}>
                      {statusText}
                    </Badge>
                  </div>
                  {job?.message && (isQueued || isRunning || error) ? (
                    <div className="mt-2 line-clamp-2 text-xs text-slate-500">
                      {job.message}
                      {job.durationMs ? ` · ${formatDuration(job.durationMs)}` : ''}
                    </div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
              先生成整本 notebook 规划。
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

type HtmlNotebookSlidePanelProps = {
  currentCanvasMode: HtmlCanvasMode;
  currentHtmlResult: HtmlSlideResult | null;
  currentPlan: LessonPlanResult | null;
  currentSlide: LessonSlidePlan | null;
  currentSlideError: GenerationErrorResult | null;
  currentSlideJob: HtmlSlideGenerationJob | null;
  currentSlideOutline: SlideTeachingOutline | null;
  currentSourceUseRationale: string;
  generatingSlideIdSet: Set<string>;
  handleGenerateCurrentSlide: () => void;
  handleGenerateImageForCurrentSlide: () => Promise<void>;
  isBusy: boolean;
  isGeneratingImageAsset: boolean;
  selectedFixture: TestfileFixture | null;
};

export function HtmlNotebookSlidePanel({
  currentCanvasMode,
  currentHtmlResult,
  currentPlan,
  currentSlide,
  currentSlideError,
  currentSlideJob,
  currentSlideOutline,
  currentSourceUseRationale,
  generatingSlideIdSet,
  handleGenerateCurrentSlide,
  handleGenerateImageForCurrentSlide,
  isBusy,
  isGeneratingImageAsset,
  selectedFixture,
}: HtmlNotebookSlidePanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selectedFixture?.fileName || 'testfile'}</Badge>
            <Badge variant="secondary">{currentPlan?.plan.lessonTitle || '暂无规划'}</Badge>
            {currentSlide ? (
              <>
                <Badge variant="outline">{pageKindLabel(currentSlide.pageKind)}</Badge>
                <Badge variant={currentCanvasMode !== 'slide' ? 'secondary' : 'outline'}>
                  {canvasModeLabel(currentSlide)}
                </Badge>
                {currentSlide.courseRoute ? (
                  <Badge variant="outline">
                    {courseRoutePromptLabel(currentSlide.courseRoute)}
                  </Badge>
                ) : null}
                {currentSlide.csRoute ? (
                  <Badge variant="outline">{csRoutePromptLabel(currentSlide.csRoute)}</Badge>
                ) : null}
                {currentSlide.mathRoute ? (
                  <Badge variant="outline">{mathRoutePromptLabel(currentSlide.mathRoute)}</Badge>
                ) : null}
                <Badge variant="outline">{densityLabel(currentSlide.density)}</Badge>
              </>
            ) : null}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">
            {currentSlide?.title || '等待生成整本 notebook 规划'}
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            {currentSlide?.objective ||
              '规划阶段会决定每一页讲什么、放多少内容、用原例子还是改写例子。'}
          </p>
          {currentSlide ? (
            <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 lg:grid-cols-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="font-semibold text-blue-900">学习问题</div>
                <p className="mt-1 text-blue-950">
                  {currentSlide.learnerQuestion ||
                    currentSlideOutline?.learnerQuestion ||
                    currentSlide.objective}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-800">关键点</div>
                <p className="mt-1">
                  {(currentSlide.keyPoints?.length
                    ? currentSlide.keyPoints
                    : currentSlideOutline?.keyPoints || []
                  ).join(' / ') || '未标注'}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="font-semibold text-emerald-900">视觉计划</div>
                <p className="mt-1 text-emerald-950">
                  {currentSlide.visualPlan || currentSlideOutline?.visualPlan || '未标注'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {currentHtmlResult?.imageAsset ? (
            <Button
              type="button"
              variant={
                currentHtmlResult.imageAsset.sourceType === 'pending' ? 'default' : 'outline'
              }
              disabled={isBusy || currentHtmlResult.imageAsset.sourceType !== 'pending'}
              onClick={() => void handleGenerateImageForCurrentSlide()}
            >
              {isGeneratingImageAsset ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageIcon className="size-4" />
              )}
              {currentHtmlResult.imageAsset.sourceType === 'pending'
                ? '生成这张插图'
                : '插图已生成'}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!currentPlan || !currentSlide || isBusy}
            onClick={handleGenerateCurrentSlide}
          >
            {currentSlide && generatingSlideIdSet.has(currentSlide.id) ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            生成当前页 HTML
          </Button>
        </div>
      </div>

      {currentPlan ? (
        <>
          <div className="grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 md:grid-cols-6">
            <div>
              <div className="font-semibold text-slate-800">规划模型</div>
              <div>{currentPlan.rawResponse.model || '-'}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">规划费用</div>
              <div>{formatCostEstimate(currentPlan.rawResponse.costEstimate)}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">规划用量</div>
              <div>{formatTokenUsage(currentPlan.rawResponse.usage)}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">规划耗时</div>
              <div>{formatDuration(currentPlan.planningDurationMs)}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">上次总耗时</div>
              <div>
                {formatDuration(currentPlan.lastRun?.durationMs)}
                {currentPlan.lastRun
                  ? ` · ${currentPlan.lastRun.generatedSlideCount}/${currentPlan.lastRun.totalSlideCount}${
                      currentPlan.lastRun.concurrency
                        ? ` · 并发 ${currentPlan.lastRun.concurrency}`
                        : ''
                    }`
                  : ''}
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">保存时间</div>
              <div>{formatTime(currentPlan.createdAt)}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-800">测试扣费</div>
              <div>{currentPlan.rawResponse.skippedCreditCharge ? '已跳过' : '正常'}</div>
            </div>
          </div>

          {currentPlan.rawResponse.planningQuality ? (
            <div
              className={cn(
                'mt-4 rounded-xl border p-3 text-sm',
                planningQualityClassName(currentPlan.rawResponse.planningQuality),
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  {currentPlan.rawResponse.planningQuality.passed ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                  规划 QA：{currentPlan.rawResponse.planningQuality.summary}
                </div>
                <div className="text-xs">
                  重试 {currentPlan.rawResponse.planningRetryCount || 0} 次
                </div>
              </div>
              {currentPlan.rawResponse.planningQuality.issues.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {currentPlan.rawResponse.planningQuality.issues.map((issue) => (
                    <div
                      key={`${issue.code}-${issue.title}`}
                      className="rounded-lg border border-current/10 bg-white/60 p-2"
                    >
                      <div className="text-xs font-semibold">
                        {issue.severity === 'error' ? '阻塞' : '提醒'} · {issue.title}
                      </div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5">
                        {issue.details.map((detail, index) => (
                          <li key={`${issue.code}-${index}`}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {currentSlideJob ? (
        <div
          className={cn(
            'mt-4 rounded-xl border p-3 text-sm',
            slideJobStatusClassName(currentSlideJob.status),
          )}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-semibold">
              当前页状态：{slideJobStatusLabel(currentSlideJob.status)}
            </div>
            <div className="text-xs">
              {currentSlideJob.durationMs
                ? `本次耗时 ${formatDuration(currentSlideJob.durationMs)}`
                : currentSlideJob.startedAt
                  ? `开始于 ${formatTime(currentSlideJob.startedAt)}`
                  : currentSlideJob.queuedAt
                    ? `排队于 ${formatTime(currentSlideJob.queuedAt)}`
                    : ''}
            </div>
          </div>
          {currentSlideJob.message ? (
            <p className="mt-1 text-xs leading-5">{currentSlideJob.message}</p>
          ) : null}
          {currentSlideJob.details ? (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{currentSlideJob.details}</p>
          ) : null}
        </div>
      ) : null}

      {currentSlide ? (
        <div className="mt-4 grid gap-3 text-sm lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">容量预算</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <div>
                <div className="text-slate-500">字符</div>
                <div className="font-semibold">
                  {currentSlide.contentBudget.visibleCharsMin}-
                  {currentSlide.contentBudget.visibleCharsMax}
                </div>
              </div>
              <div>
                <div className="text-slate-500">内容区</div>
                <div className="font-semibold">{currentSlide.contentBudget.mainRegions}</div>
              </div>
              <div>
                <div className="text-slate-500">内容块</div>
                <div className="font-semibold">{currentSlide.contentBudget.blockCount}</div>
              </div>
              <div>
                <div className="text-slate-500">素材策略</div>
                <div className="font-semibold">{sourceUsageLabel(currentSlide.sourceUsage)}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">源材料覆盖</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {currentSlide.sourceCoverage.join(' / ') || '未标注'}
            </p>
            {currentSlide.sourceAnchors?.length ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                锚点：{currentSlide.sourceAnchors.join(' / ')}
              </p>
            ) : null}
            {currentSourceUseRationale ? (
              <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                取舍理由：{currentSourceUseRationale}
              </p>
            ) : null}
            {currentSlide.sourceImageIds?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {currentSlide.sourceImageIds.map((id) => (
                  <Badge key={id} variant="outline" className="border-emerald-200 text-emerald-700">
                    原文图 {id}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {currentSlideError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            当前页生成失败
          </div>
          <p className="mt-1">{currentSlideError.message}</p>
          {currentSlideError.details ? (
            <p className="mt-1 whitespace-pre-wrap text-xs">{currentSlideError.details}</p>
          ) : null}
        </div>
      ) : null}

      {currentHtmlResult ? (
        <div className="mt-4 grid gap-3 text-sm lg:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">HTML 模型</div>
            <div className="mt-1 font-semibold text-slate-950">
              {currentHtmlResult.rawResponse.model || '未返回'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">费用</div>
            <div className="mt-1 font-semibold text-slate-950">
              {formatCostEstimate(currentHtmlResult.rawResponse.costEstimate)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">用量</div>
            <div className="mt-1 font-semibold text-slate-950">
              {formatTokenUsage(currentHtmlResult.rawResponse.usage)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">本页耗时</div>
            <div className="mt-1 font-semibold text-slate-950">
              {formatDuration(currentHtmlResult.durationMs)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">HTML 输出</div>
            <div className="mt-1 font-semibold text-slate-950">
              {currentHtmlResult.elementCount} elements · {currentHtmlResult.htmlLength} chars
            </div>
          </div>
          {currentHtmlResult.imageAsset ? (
            <div
              className={cn(
                'rounded-xl p-3 lg:col-span-5',
                currentHtmlResult.imageAsset.sourceType === 'pending'
                  ? 'border border-blue-100 bg-blue-50'
                  : 'bg-slate-50',
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                    <ImageIcon className="size-3.5" />
                    AI 插图
                  </div>
                  <div className="mt-1 font-semibold text-slate-950">
                    {currentHtmlResult.imageAsset.providerName} ·{' '}
                    {currentHtmlResult.imageAsset.modelId}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {currentHtmlResult.imageAsset.sourceType === 'pending'
                      ? `待生成 · 点击预览里的图片占位图或右上按钮生成 · ${currentHtmlResult.imageAsset.estimatedCostLabel || getEstimatedImageCostLabel(currentHtmlResult.imageAsset.providerId, currentHtmlResult.imageAsset.modelId)}`
                      : `4:3 插图素材 · ${formatImageCostLabel(currentHtmlResult.imageAsset.costEstimate)}${
                          currentHtmlResult.imageAsset.sourceType === 'indexeddb'
                            ? ' · 已存资源库'
                            : ''
                        }`}
                  </div>
                </div>
                {currentHtmlResult.imageAsset.sourceType === 'pending' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-blue-200 bg-white"
                    disabled={isGeneratingImageAsset}
                    onClick={() => void handleGenerateImageForCurrentSlide()}
                  >
                    {isGeneratingImageAsset ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                    {isGeneratingImageAsset ? '正在生成插图' : '生成这张插图'}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {currentHtmlResult.assignedSourceImages?.length ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 lg:col-span-5">
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <ImageIcon className="size-3.5" />
                原文图片素材
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {currentHtmlResult.assignedSourceImages.map((image) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-2 py-1.5 text-xs text-emerald-950"
                  >
                    <img
                      src={image.src}
                      alt={image.description || image.id}
                      className="h-8 w-12 rounded object-contain"
                    />
                    <span>{sourceImageLabel(image)}</span>
                  </div>
                ))}
              </div>
              {currentHtmlResult.sourceImageUsage ? (
                <div className="mt-2 text-xs leading-5 text-emerald-800">
                  已用：{currentHtmlResult.sourceImageUsage.usedIds.join(', ') || '-'}
                  {currentHtmlResult.sourceImageUsage.missingIds.length
                    ? ` · 缺失：${currentHtmlResult.sourceImageUsage.missingIds.join(', ')}`
                    : ''}
                  {currentHtmlResult.sourceImageUsage.inventedIds.length
                    ? ` · 虚构：${currentHtmlResult.sourceImageUsage.inventedIds.join(', ')}`
                    : ''}
                </div>
              ) : null}
            </div>
          ) : null}
          {currentHtmlResult.rawResponse.retryReasons?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-4">
              <div className="font-semibold">自动重试原因</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                {currentHtmlResult.rawResponse.retryReasons.map((reason, index) => (
                  <li key={`${reason.code || reason.title}-${index}`}>
                    {reason.title}
                    {reason.details?.length ? `：${reason.details.join(' / ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type HtmlNotebookPreviewPanelProps = {
  attachImageSlotClickHandler: () => void;
  currentCanvasHeight: number;
  currentCanvasMode: HtmlCanvasMode;
  currentHtmlResult: HtmlSlideResult | null;
  currentPlan: LessonPlanResult | null;
  currentSlide: LessonSlidePlan | null;
  currentSlideIndex: number;
  currentSlideJob: HtmlSlideGenerationJob | null;
  currentSlideKey: string;
  effectivePreviewStatus: PreviewStatus;
  handleGenerateCurrentSlide: () => void;
  handleSelectNextSlide: () => void;
  handleSelectPreviousSlide: () => void;
  hasSourceImageContractIssue: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  isBusy: boolean;
  isGeneratingImageAsset: boolean;
  nextSlide: LessonSlidePlan | null;
  previewFrameRef: RefObject<HTMLDivElement | null>;
  previewScale: number;
  previousSlide: LessonSlidePlan | null;
  resolvedPreviewHtml: string;
  safePreviewStats: PreviewStats;
  setPreviewStats: Dispatch<SetStateAction<PreviewStats>>;
};

export function HtmlNotebookPreviewPanel({
  attachImageSlotClickHandler,
  currentCanvasHeight,
  currentCanvasMode,
  currentHtmlResult,
  currentPlan,
  currentSlide,
  currentSlideIndex,
  currentSlideJob,
  currentSlideKey,
  effectivePreviewStatus,
  handleGenerateCurrentSlide,
  handleSelectNextSlide,
  handleSelectPreviousSlide,
  hasSourceImageContractIssue,
  iframeRef,
  isBusy,
  isGeneratingImageAsset,
  nextSlide,
  previewFrameRef,
  previewScale,
  previousSlide,
  resolvedPreviewHtml,
  safePreviewStats,
  setPreviewStats,
}: HtmlNotebookPreviewPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">HTML 预览</h2>
          <p className="text-xs text-slate-500">
            {currentCanvasMode !== 'slide'
              ? `iframe 按 1600×${currentCanvasHeight} ${currentCanvasMode === 'tall' ? '中高课件页' : '长页面'}渲染，检查横向滚动、越界、裁切、重叠和基础 DOM 结构。`
              : 'iframe 按 1600×900 渲染，检查滚动、越界、裁切、重叠和基础 DOM 结构。'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled={!previousSlide}
            onClick={handleSelectPreviousSlide}
          >
            <ChevronLeft className="size-3.5" />
            上一页
          </Button>
          {currentPlan && currentSlideIndex >= 0 ? (
            <Badge variant="outline">
              {currentSlideIndex + 1}/{currentPlan.plan.pageCount}
            </Badge>
          ) : null}
          {currentHtmlResult ? (
            <Badge
              variant={effectivePreviewStatus === 'pass' ? 'default' : 'destructive'}
              className="gap-1"
            >
              {effectivePreviewStatus === 'pass' ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <XCircle className="size-3.5" />
              )}
              {effectivePreviewStatus === 'pass' ? 'QA 通过' : 'QA 待看'}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled={!nextSlide}
            onClick={handleSelectNextSlide}
          >
            下一页
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-100 p-4">
        <div
          ref={previewFrameRef}
          className={cn(
            'relative mx-auto w-full max-w-[1120px] rounded-2xl border border-slate-200 bg-white shadow-xl',
            currentCanvasMode !== 'slide' ? 'overflow-auto' : 'aspect-video overflow-hidden',
          )}
          style={
            currentCanvasMode !== 'slide'
              ? { height: Math.min(currentCanvasHeight * previewScale, 760) }
              : undefined
          }
        >
          {currentHtmlResult ? (
            <div
              className="relative"
              style={{
                width: 1600 * previewScale,
                height: currentCanvasHeight * previewScale,
              }}
            >
              <iframe
                key={`${currentSlideKey}-${currentHtmlResult.createdAt}-${currentHtmlResult.imageAsset?.sourceType || 'no-image'}-${isGeneratingImageAsset ? 'image-loading' : 'ready'}`}
                ref={iframeRef}
                title="HTML notebook slide preview"
                className="absolute left-0 top-0 border-0"
                style={{
                  width: 1600,
                  height: currentCanvasHeight,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
                srcDoc={resolvedPreviewHtml || currentHtmlResult.html}
                onLoad={() => {
                  setPreviewStats(
                    evaluatePreview(
                      iframeRef.current,
                      currentCanvasMode,
                      currentCanvasHeight,
                      currentHtmlResult.mathRoute || currentSlide?.mathRoute,
                    ),
                  );
                  attachImageSlotClickHandler();
                }}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              {currentSlideJob?.status === 'running' || currentSlideJob?.status === 'queued' ? (
                <Loader2 className="size-8 animate-spin" />
              ) : (
                <Code2 className="size-8" />
              )}
              <div className="text-sm font-medium">
                {currentSlideJob?.status === 'running'
                  ? '正在生成本页 HTML...'
                  : currentSlideJob?.status === 'queued'
                    ? '本页已进入生成队列...'
                    : currentSlide
                      ? `第 ${currentSlide.order} 页尚未生成 HTML`
                      : '生成当前页后在这里预览'}
              </div>
              {currentSlide &&
              currentSlideJob?.status !== 'running' &&
              currentSlideJob?.status !== 'queued' ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!currentPlan || isBusy}
                  onClick={handleGenerateCurrentSlide}
                >
                  <Send className="size-3.5" />
                  生成本页 HTML
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {currentHtmlResult ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-8">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">预览缩放</div>
            <div className="mt-1 font-semibold">{previewScale.toFixed(3)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">画布</div>
            <div className="mt-1 font-semibold">{canvasModeLabel(currentSlide)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">滚动尺寸</div>
            <div className="mt-1 font-semibold">
              {safePreviewStats.scrollWidth || '-'} × {safePreviewStats.scrollHeight || '-'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">越界元素</div>
            <div className="mt-1 font-semibold">{safePreviewStats.outOfBoundsCount}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">裁切风险</div>
            <div className="mt-1 font-semibold">{safePreviewStats.clippedCount}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">重叠风险</div>
            <div className="mt-1 font-semibold">{safePreviewStats.overlapCount}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">数学结构</div>
            <div className="mt-1 font-semibold">{safePreviewStats.mathRouteIssueCount}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">结构</div>
            <div className="mt-1 font-semibold">
              slide {safePreviewStats.slideCount} · content{' '}
              {safePreviewStats.hasSlideContent ? '有' : '缺'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">内容节点</div>
            <div className="mt-1 font-semibold">
              {safePreviewStats.textNodeCount} text · {safePreviewStats.visibleCharCount} chars
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500">原图契约</div>
            <div className="mt-1 font-semibold">
              {currentHtmlResult.sourceImageUsage?.assignedIds.length
                ? `${currentHtmlResult.sourceImageUsage.usedIds.length}/${currentHtmlResult.sourceImageUsage.assignedIds.length}`
                : '-'}
            </div>
          </div>
          {safePreviewStats.outOfBoundsSamples.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-8">
              {safePreviewStats.outOfBoundsSamples.join(' / ')}
            </div>
          ) : null}
          {safePreviewStats.clippedSamples.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:col-span-8">
              {safePreviewStats.clippedSamples.join(' / ')}
            </div>
          ) : null}
          {safePreviewStats.overlapSamples.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-8">
              {safePreviewStats.overlapSamples.join(' / ')}
            </div>
          ) : null}
          {safePreviewStats.mathRouteIssueSamples.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-8">
              数学结构问题：{safePreviewStats.mathRouteIssueSamples.join(' / ')}
            </div>
          ) : null}
          {hasSourceImageContractIssue && currentHtmlResult.sourceImageUsage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-8">
              原文图片问题：
              {currentHtmlResult.sourceImageUsage.missingIds.length
                ? ` 缺失 ${currentHtmlResult.sourceImageUsage.missingIds.join(', ')}`
                : ''}
              {currentHtmlResult.sourceImageUsage.inventedIds.length
                ? ` 虚构 ${currentHtmlResult.sourceImageUsage.inventedIds.join(', ')}`
                : ''}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type HtmlNotebookPlanDetailsPanelProps = {
  actualHtmlRequestPreview: string;
  currentPlan: LessonPlanResult | null;
  currentSlide: LessonSlidePlan | null;
};

export function HtmlNotebookPlanDetailsPanel({
  actualHtmlRequestPreview,
  currentPlan,
  currentSlide,
}: HtmlNotebookPlanDetailsPanelProps) {
  return (
    <>
      {currentPlan ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileCode2 className="size-4 text-slate-500" />
                <h2 className="text-sm font-semibold">规划生成 prompt</h2>
              </div>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                这是 lesson plan 阶段写入 slides[].htmlPrompt 的内容，代表规划层希望这一页怎么讲。
              </p>
              <Textarea
                readOnly
                className="min-h-[220px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                value={currentSlide?.htmlPrompt || ''}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileCode2 className="size-4 text-blue-500" />
                <h2 className="text-sm font-semibold">实际发送给 HTML 的完整请求</h2>
              </div>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                生成时会在规划 prompt 后追加结构化
                outline、课程路线、密度契约和已分配源图片；已生成页面会显示当时保存的请求。
              </p>
              <Textarea
                readOnly
                className="min-h-[420px] resize-y rounded-xl bg-blue-50/60 font-mono text-[13px] leading-6 text-slate-800"
                value={actualHtmlRequestPreview}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">课程规划层</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              {currentPlan.plan.coursePlan ? (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <div className="text-xs font-semibold text-blue-800">课程目标</div>
                    <p className="mt-1 text-blue-950">{currentPlan.plan.coursePlan.courseGoal}</p>
                    <p className="mt-2 text-xs text-blue-800">
                      目标学习者：{currentPlan.plan.coursePlan.targetLearner}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-500">叙事弧线</div>
                    <p className="mt-1">
                      {currentPlan.plan.coursePlan.narrativeArc.join(' -> ') || '未标注'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-500">核心问题</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {currentPlan.plan.coursePlan.coreQuestions.length ? (
                        currentPlan.plan.coursePlan.coreQuestions.map((question, index) => (
                          <li key={`${question}-${index}`}>{question}</li>
                        ))
                      ) : (
                        <li>未标注</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-500">节奏策略</div>
                    <p className="mt-1">{currentPlan.plan.coursePlan.pacingStrategy}</p>
                  </div>
                  {currentPlan.plan.coursePlan.sourceDigest.length ? (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">源材料取舍</div>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {currentPlan.plan.coursePlan.sourceDigest.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
                  暂无课程规划层。
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">整本 notebook 规划备注</div>
                <div className="mt-2 space-y-2">
                  {currentPlan.plan.planningNotes.length ? (
                    currentPlan.plan.planningNotes.map((note, index) => (
                      <div key={`${note}-${index}`} className="rounded-lg bg-slate-50 p-2">
                        {note}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">暂无备注。</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
