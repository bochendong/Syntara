import type { ImageGenerationCostEstimate, ImageProviderId } from '@/lib/media/types';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';

import {
  DEFAULT_SLIDE_HEIGHT,
  type DensityProfile,
  type HtmlCanvasMode,
  type HtmlCourseRoute,
  type HtmlCsRoute,
  type HtmlMathRoute,
  type StoredRun,
  type TokenUsage,
} from './types';

export function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function getUsageTotal(usage: TokenUsage | null | undefined): number {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  return toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
}

export function formatUsageLabel(usage: TokenUsage | null | undefined): string | null {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const totalTokens = getUsageTotal(usage);
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return null;
  return `${totalTokens.toLocaleString()} tokens · 输入 ${inputTokens.toLocaleString()} / 输出 ${outputTokens.toLocaleString()}`;
}

export function formatCostLabel(run: StoredRun): string {
  if (run.costEstimate) {
    const sourceLabel =
      run.costEstimate.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
    return `${formatComputeCreditsLabel(run.costEstimate.computeCredits)} · ${formatUsdLabel(run.costEstimate.retailUsd)} · ${sourceLabel}`;
  }
  const usageLabel = formatUsageLabel(run.usage);
  return usageLabel ? `${usageLabel} · 费用待估算` : '费用未知';
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

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function courseRouteLabel(route: HtmlCourseRoute | undefined): string {
  const labels: Record<HtmlCourseRoute, string> = {
    general: '通用',
    math: '数学',
    'computer-science': 'CS',
    science: '科学',
    business: '商科',
    humanities: '人文',
    'social-science': '社科',
  };
  return labels[route || 'general'];
}

export function csRouteLabel(route: HtmlCsRoute | undefined): string {
  const labels: Record<HtmlCsRoute, string> = {
    standard: 'CS 标准',
    'execution-trace': '执行追踪',
    'memory-diagram': '内存图',
    'call-stack': '调用栈',
    'pointer-diagram': '指针图',
    'tree-diagram': '树图',
    'graph-trace': '图追踪',
    'linear-structure': '栈/队列',
    'dictionary-diagram': '字典图',
    'invariant-check': '不变量',
    'composite-operation': '综合操作',
  };
  return labels[route || 'standard'];
}

export function mathRouteLabel(route: HtmlMathRoute | undefined): string {
  const labels: Record<HtmlMathRoute, string> = {
    standard: '数学标准',
    'definition-theorem': '定义/定理',
    'formula-focus': '公式聚焦',
    derivation: '推导阶梯',
    proof: '证明讲解',
    'worked-example': '数学例题',
    'concept-map': '概念图',
    'comparison-table': '判别表',
  };
  return labels[route || 'standard'];
}

export function buildDensityContract(
  profile: DensityProfile,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = DEFAULT_SLIDE_HEIGHT,
): string {
  return [
    canvasMode === 'long'
      ? `画布：长页面，宽度固定 1600px，目标高度约 ${canvasHeight}px；允许纵向阅读，但禁止横向滚动。`
      : '画布：16:9 单屏，固定 1600×900；不能滚动。',
    `密度档：${profile.label}（${profile.level}）`,
    `可见中文字数/等价字符：${profile.textChars.min}-${profile.textChars.max}`,
    `可见文本节点/块数：${profile.textBlocks.min}-${profile.textBlocks.max}`,
    `主要内容覆盖画布面积：${formatPercent(profile.contentCoverage.min)}-${formatPercent(profile.contentCoverage.max)}`,
    `正文可读字号：低于 ${profile.smallTextThresholdPx}px 的文字占比不超过 ${formatPercent(profile.maxSmallTextRatio)}`,
    '大卡片/大面板约束：面积超过画布 8% 的容器不能只有顶部少量文字；要么压缩高度，要么填入真实结构、图示、列表或步骤。',
    `密度说明：${profile.guidance}`,
  ].join('\n');
}
