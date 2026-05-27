import type { ImageGenerationCostEstimate, ImageProviderId } from '@/lib/media/types';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';

import type {
  DensityLevel,
  HtmlCanvasMode,
  HtmlCostEstimate,
  HtmlSlideGenerationJobStatus,
  InferredHtmlPageKind,
  LessonSlidePlan,
  PlanningQualityReport,
  TokenUsage,
} from './types';

export function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function pageKindLabel(kind: InferredHtmlPageKind): string {
  const labels: Record<InferredHtmlPageKind, string> = {
    cover: '封面页',
    intro: '介绍页',
    summary: '总结页',
    process: '流程页',
    table: '表格页',
    math: '数学页',
    code: '代码页',
    example: '例题页',
    auto: '自动',
  };
  return labels[kind];
}

export function densityLabel(level: DensityLevel): string {
  if (level === 'light') return '轻量';
  if (level === 'dense') return '信息密集';
  return '标准';
}

export function getSlideCanvasMode(
  slide: Pick<LessonSlidePlan, 'canvasMode'> | null | undefined,
): HtmlCanvasMode {
  if (slide?.canvasMode === 'long') return 'long';
  if (slide?.canvasMode === 'tall') return 'tall';
  return 'slide';
}

export function getSlideCanvasHeight(
  slide: Pick<LessonSlidePlan, 'canvasMode' | 'canvasHeight'> | null | undefined,
): number {
  const mode = getSlideCanvasMode(slide);
  if (mode === 'slide') return 900;
  if (mode === 'tall') {
    const height = typeof slide?.canvasHeight === 'number' ? slide.canvasHeight : 1200;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const height = typeof slide?.canvasHeight === 'number' ? slide.canvasHeight : 2200;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

export function canvasModeLabel(
  slide: Pick<LessonSlidePlan, 'canvasMode' | 'canvasHeight'> | null | undefined,
): string {
  const mode = getSlideCanvasMode(slide);
  if (mode === 'tall') return `中高页 ${getSlideCanvasHeight(slide)}px`;
  if (mode === 'long') return `长页 ${getSlideCanvasHeight(slide)}px`;
  return '16:9';
}

export function sourceUsageLabel(usage: LessonSlidePlan['sourceUsage']): string {
  if (usage === 'direct') return '直接使用源材料';
  if (usage === 'adapted') return '改写源材料';
  if (usage === 'new-example') return '新例子替换';
  return '综合整理';
}

export function slideJobStatusLabel(status: HtmlSlideGenerationJobStatus): string {
  const labels: Record<HtmlSlideGenerationJobStatus, string> = {
    queued: '排队中',
    running: '生成中',
    succeeded: 'HTML OK',
    failed: '失败',
    skipped: '已跳过',
  };
  return labels[status];
}

export function slideJobStatusClassName(status: HtmlSlideGenerationJobStatus): string {
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'queued') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'succeeded') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

export function planningQualityClassName(
  quality: PlanningQualityReport | null | undefined,
): string {
  if (!quality) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (!quality.passed) return 'border-red-200 bg-red-50 text-red-800';
  if (quality.warningIssueCount > 0) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

export function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return Math.max(0, Math.round(value)).toLocaleString();
}

export function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '暂无 token 用量';
  const inputTokens = toSafeInt(usage.inputTokens);
  const outputTokens = toSafeInt(usage.outputTokens);
  const totalTokens = toSafeInt(usage.totalTokens ?? inputTokens + outputTokens);
  return `${formatNumber(totalTokens)} tokens · 输入 ${formatNumber(inputTokens)} / 输出 ${formatNumber(outputTokens)}`;
}

export function formatCostEstimate(cost: HtmlCostEstimate | null | undefined): string {
  if (!cost) return '暂无估算';
  const sourceLabel = cost.source === 'token_fallback' ? '按 token 粗略估算' : 'OpenAI 定价估算';
  return `${formatComputeCreditsLabel(cost.computeCredits)} · ${formatUsdLabel(cost.retailUsd)} · ${sourceLabel}`;
}

export function formatImageCostLabel(costEstimate: ImageGenerationCostEstimate | null | undefined) {
  if (!costEstimate) return '图片费用待估算';
  return `${formatComputeCreditsLabel(costEstimate.computeCredits)} · ${formatUsdLabel(costEstimate.retailUsd)} · OpenAI 图片定价估算`;
}

export function getEstimatedImageCostLabel(providerId: ImageProviderId, modelId: string): string {
  if (providerId === 'openai-image') {
    if (modelId.includes('mini')) return '预计约 3-10 算力积分 · $0.02-$0.08';
    if (modelId.includes('gpt-image-2')) return '预计约 10-35 算力积分 · $0.09-$0.35';
    return '预计约 10-35 算力积分 · $0.09-$0.33';
  }
  return '预计按当前图片服务计费；本测试请求不扣本地积分';
}

export function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
}
