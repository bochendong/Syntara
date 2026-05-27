import {
  COURSE_PLAN_REQUEST_TIMEOUT_MS,
  STRUCTURED_PLAN_REQUEST_TIMEOUT_MS,
  PIPELINE_RESULT_CONTRACT_VERSION,
  type HtmlCostEstimate,
  type LessonSlidePlan,
  type PageCountTier,
} from './pipeline-types';

export function pipelineResultKey(fixtureId: string, tier: PageCountTier): string {
  return `notebook:${fixtureId}:${tier}:${PIPELINE_RESULT_CONTRACT_VERSION}`;
}

export function formatSavedAt(value: string | number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getSlideCanvasMode(slide: Pick<LessonSlidePlan, 'canvasMode'>): string {
  if (slide.canvasMode === 'long') return 'long';
  if (slide.canvasMode === 'tall') return 'tall';
  return 'slide';
}

export function getSlideCanvasHeight(
  slide: Pick<LessonSlidePlan, 'canvasMode' | 'canvasHeight'>,
): number {
  const mode = getSlideCanvasMode(slide);
  if (mode === 'slide') return 900;
  if (mode === 'tall') {
    const height = typeof slide.canvasHeight === 'number' ? slide.canvasHeight : 1200;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const height = typeof slide.canvasHeight === 'number' ? slide.canvasHeight : 2200;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

export function formatDuration(ms?: number): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatPlanRunMessage(elapsedMs: number): string {
  return `正在生成轻量 coursePlan，已等待 ${formatDuration(elapsedMs)}。这一步会读取整本 notebook，压出一句目标、2-3 个核心问题、电影脚本式 courseSpine 和逐页 continuity；叙事推进只放在 courseSpine 里，最长等待 ${formatDuration(COURSE_PLAN_REQUEST_TIMEOUT_MS)}。`;
}

export function formatStructuredPlanRunMessage(elapsedMs: number): string {
  return `正在生成 slideOutlines，已等待 ${formatDuration(elapsedMs)}。这一步只让模型展开逐页教学动作、sourceAnchors、视觉计划和内容预算；slides[].htmlPrompt 会由后端自动合成，最长等待 ${formatDuration(STRUCTURED_PLAN_REQUEST_TIMEOUT_MS)}。`;
}

export function formatCost(value?: HtmlCostEstimate | null): string {
  if (!value) return '-';
  if (typeof value.computeCredits === 'number') return `${value.computeCredits.toFixed(2)} credits`;
  if (typeof value.retailUsd === 'number') return `$${value.retailUsd.toFixed(4)}`;
  return '-';
}
