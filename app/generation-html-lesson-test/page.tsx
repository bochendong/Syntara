'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
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
import { getApiHeaders } from '@/lib/create/generation-headers';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import { useSettingsStore } from '@/lib/store/settings';
import type { SceneOutline } from '@/lib/types/generation';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { db } from '@/lib/utils/database';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

const LEGACY_STORAGE_KEY = 'syntara:html-lesson-generation-test:v1';
const TEST_RESULT_ID = 'html-lesson';
const TEST_RESULT_KEY = 'state';
const HTML_LESSON_MODEL = 'gpt-5.4';
const RESULT_RENDER_VERSION = 'html-lesson-v3';
const IMAGE_ASSET_TOKEN = '__SYNTARA_GENERATED_SLIDE_IMAGE_ASSET__';
const HTML_IMAGE_SLOT_ATTR = 'data-syntara-ai-image-slot';
const HTML_SLIDE_GENERATION_CONCURRENCY = 3;

type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
type InferredHtmlPageKind = HtmlPageKind | 'auto';
type HtmlCodeRoute = 'execution-trace' | 'memory-trace';
type HtmlCsRoute =
  | 'standard'
  | 'execution-trace'
  | 'memory-diagram'
  | 'call-stack'
  | 'pointer-diagram'
  | 'tree-diagram'
  | 'graph-trace'
  | 'linear-structure'
  | 'dictionary-diagram'
  | 'invariant-check'
  | 'composite-operation';
type HtmlMathRoute =
  | 'standard'
  | 'definition-theorem'
  | 'formula-focus'
  | 'derivation'
  | 'proof'
  | 'worked-example'
  | 'concept-map'
  | 'comparison-table';
type HtmlCourseRoute =
  | 'general'
  | 'math'
  | 'computer-science'
  | 'science'
  | 'business'
  | 'humanities'
  | 'social-science';
type DensityLevel = 'light' | 'standard' | 'dense';

interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx';
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
}

interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
}

interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

interface HtmlCostEstimate {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
}

interface LessonSlidePlan {
  id: string;
  order: number;
  title: string;
  pageKind: HtmlPageKind;
  density: DensityLevel;
  objective: string;
  sourceCoverage: string[];
  sourceUsage: 'direct' | 'adapted' | 'new-example' | 'synthesis';
  contentBudget: {
    visibleCharsMin: number;
    visibleCharsMax: number;
    mainRegions: number;
    blockCount: number;
    mustDeleteIfCrowded: string[];
  };
  htmlPrompt: string;
}

interface LessonPlan {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  planningNotes: string[];
  slides: LessonSlidePlan[];
}

interface LessonPlanResponse {
  success?: boolean;
  plan?: LessonPlan;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

interface HtmlRetryReason {
  code?: string;
  title: string;
  details?: string[];
}

interface GenerateHtmlPptResponse {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

interface GenerateSlideImageResponse {
  success?: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
}

interface HtmlImageAsset {
  sourceType: 'pending' | 'url' | 'indexeddb';
  url?: string;
  storageId?: string;
  mimeType?: string;
  size?: number;
  providerId: ImageProviderId;
  providerName: string;
  modelId: string;
  prompt: string;
  width?: number;
  height?: number;
  estimatedCostLabel?: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
}

interface LessonRunTiming {
  mode: 'whole-lesson' | 'missing-slides';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  planningDurationMs?: number;
  slideDurationMs: number;
  generatedSlideCount: number;
  failedSlideCount: number;
  totalSlideCount: number;
  concurrency?: number;
}

interface LessonPlanResult {
  plan: LessonPlan;
  fixtureId: string;
  pageCountTier: PageCountTier;
  signature: string;
  rawResponse: LessonPlanResponse;
  planningDurationMs?: number;
  lastRun?: LessonRunTiming;
  createdAt: number;
}

interface HtmlSlideResult {
  html: string;
  slide: LessonSlidePlan;
  prompt: string;
  planSignature: string;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  rawResponse: GenerateHtmlPptResponse;
  imageAsset?: HtmlImageAsset | null;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
  durationMs?: number;
  createdAt: number;
}

interface GenerationErrorResult {
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

interface SavedState {
  selectedFixtureId?: string;
  selectedTier?: PageCountTier;
  selectedSlideIdByPlan?: Record<string, string>;
  plansByKey?: Record<string, LessonPlanResult>;
  htmlBySlide?: Record<string, HtmlSlideResult>;
  errorsBySlide?: Record<string, GenerationErrorResult>;
  planErrorsByKey?: Record<string, GenerationErrorResult>;
}

interface PreviewStats {
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
  clippedCount: number;
  clippedSamples: string[];
  textNodeCount: number;
  visibleCharCount: number;
  mathCount: number;
  tableCount: number;
  preCount: number;
}

const TIER_OPTIONS: Array<{
  value: PageCountTier;
  label: string;
  detail: string;
}> = [
  { value: 'under5', label: '5 页以下', detail: '4-5 页，极简导入/概览' },
  { value: 'under10', label: '10 页以下', detail: '7-10 页，标准微课' },
  { value: 'under20', label: '20 页以下', detail: '14-20 页，完整小节' },
  { value: 'over20', label: '20 页以上', detail: '21-24 页，测试上限 24' },
];

function getHtmlLessonTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_LESSON_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getCreatedAt(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const createdAt = value.createdAt;
  return typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : null;
}

function summarizeSavedState(state: SavedState) {
  const plansByKey = isRecord(state.plansByKey) ? state.plansByKey : {};
  const htmlBySlide = isRecord(state.htmlBySlide) ? state.htmlBySlide : {};
  const errorsBySlide = isRecord(state.errorsBySlide) ? state.errorsBySlide : {};
  const planErrorsByKey = isRecord(state.planErrorsByKey) ? state.planErrorsByKey : {};
  const timestamps = [
    ...Object.values(plansByKey),
    ...Object.values(htmlBySlide),
    ...Object.values(errorsBySlide),
    ...Object.values(planErrorsByKey),
  ]
    .map(getCreatedAt)
    .filter((value): value is number => value !== null);

  return {
    generatedCount: Object.keys(htmlBySlide).length,
    errorCount: Object.keys(errorsBySlide).length + Object.keys(planErrorsByKey).length,
    planCount: Object.keys(plansByKey).length,
    lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function readLegacySavedState(): SavedState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedState;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readSavedState(): Promise<SavedState> {
  try {
    const row = await loadTestResult<SavedState>({
      testId: TEST_RESULT_ID,
      resultKey: TEST_RESULT_KEY,
    });
    if (row?.payload && isRecord(row.payload)) return row.payload as SavedState;
  } catch {
    // Keep the QA page usable even if the test-result database endpoint is temporarily unavailable.
  }

  const legacyState = readLegacySavedState();
  if (Object.keys(legacyState).length === 0) return {};
  try {
    await writeSavedState(legacyState);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Leave the legacy copy in place if the database write fails.
  }
  return legacyState;
}

async function writeSavedState(state: SavedState): Promise<void> {
  await saveTestResult({
    testId: TEST_RESULT_ID,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: 'HTML 整节课生成测试',
    summary: summarizeSavedState(state),
    payload: state,
  });
}

function emptyPreviewStats(): PreviewStats {
  return {
    scrollWidth: 0,
    scrollHeight: 0,
    slideCount: 0,
    hasSlideContent: false,
    outOfBoundsCount: 0,
    outOfBoundsSamples: [],
    clippedCount: 0,
    clippedSamples: [],
    textNodeCount: 0,
    visibleCharCount: 0,
    mathCount: 0,
    tableCount: 0,
    preCount: 0,
  };
}

function buildErrorResult(
  data: FixturesResponse | LessonPlanResponse | GenerateHtmlPptResponse,
  status: number,
  fallback: string,
): GenerationErrorResult {
  return {
    message: data.error || fallback,
    details: data.details,
    httpStatus: status,
    createdAt: Date.now(),
  };
}

function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}

function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function pageKindLabel(kind: InferredHtmlPageKind): string {
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

function densityLabel(level: DensityLevel): string {
  if (level === 'light') return '轻量';
  if (level === 'dense') return '信息密集';
  return '标准';
}

function sourceUsageLabel(usage: LessonSlidePlan['sourceUsage']): string {
  if (usage === 'direct') return '直接使用源材料';
  if (usage === 'adapted') return '改写源材料';
  if (usage === 'new-example') return '新例子替换';
  return '综合整理';
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return Math.max(0, Math.round(value)).toLocaleString();
}

function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '暂无 token 用量';
  const inputTokens = toSafeInt(usage.inputTokens);
  const outputTokens = toSafeInt(usage.outputTokens);
  const totalTokens = toSafeInt(usage.totalTokens ?? inputTokens + outputTokens);
  return `${formatNumber(totalTokens)} tokens · 输入 ${formatNumber(inputTokens)} / 输出 ${formatNumber(outputTokens)}`;
}

function formatCostEstimate(cost: HtmlCostEstimate | null | undefined): string {
  if (!cost) return '暂无估算';
  const sourceLabel = cost.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
  return `${formatComputeCreditsLabel(cost.computeCredits)} · ${formatUsdLabel(cost.retailUsd)} · ${sourceLabel}`;
}

function formatImageCostLabel(costEstimate: ImageGenerationCostEstimate | null | undefined) {
  if (!costEstimate) return '图片费用待估算';
  return `${formatComputeCreditsLabel(costEstimate.computeCredits)} · ${formatUsdLabel(costEstimate.retailUsd)} · OpenAI 图片定价估算`;
}

function getEstimatedImageCostLabel(providerId: ImageProviderId, modelId: string): string {
  if (providerId === 'openai-image') {
    if (modelId.includes('mini')) return '预计约 3-10 算力积分 · $0.02-$0.08';
    if (modelId.includes('gpt-image-2')) return '预计约 10-35 算力积分 · $0.09-$0.35';
    return '预计约 10-35 算力积分 · $0.09-$0.33';
  }
  return '预计按当前图片服务计费；本测试请求不扣本地积分';
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
}

function resultToImageUrl(result: ImageGenerationResult): string {
  if (result.url) return result.url;
  if (!result.base64) return '';
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:image/png;base64,${result.base64}`;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildImagePlaceholderDataUrl(asset: HtmlImageAsset, isGenerating: boolean): string {
  const title = isGenerating ? '正在生成 AI 插图...' : '点击生成 AI 插图';
  const description = compact(asset.prompt, 42) || '本页教学插图素材';
  const estimate =
    asset.estimatedCostLabel || getEstimatedImageCostLabel(asset.providerId, asset.modelId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fcff"/>
      <stop offset="1" stop-color="#eefaf6"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2f7ee6"/>
      <stop offset="1" stop-color="#22b88a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="720" rx="44" fill="url(#bg)"/>
  <rect x="58" y="58" width="844" height="604" rx="36" fill="#ffffff" stroke="#d9e9f6" stroke-width="3"/>
  <circle cx="314" cy="278" r="78" fill="#edf7ff" stroke="#d7e9f7" stroke-width="3"/>
  <circle cx="480" cy="278" r="78" fill="#effaf5" stroke="#d6eee5" stroke-width="3"/>
  <circle cx="646" cy="278" r="78" fill="#f1f5ff" stroke="#dbe5ff" stroke-width="3"/>
  <path d="M392 278h10m156 0h10" stroke="url(#accent)" stroke-width="10" stroke-linecap="round"/>
  <path d="M282 306c70-72 130-74 190 0s114 66 160-8" fill="none" stroke="#2f7ee6" stroke-width="10" stroke-linecap="round"/>
  <path d="M560 260l92-46" stroke="#22b88a" stroke-width="8" stroke-linecap="round"/>
  <text x="480" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#153047">${escapeXmlText(title)}</text>
  <text x="480" y="558" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#48657d">${escapeXmlText(description)}</text>
  <text x="480" y="608" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6b7f92">${escapeXmlText(estimate)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function base64ImageToBlob(base64: string): Blob {
  const match = base64.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'image/png';
  const raw = match?.[2] || base64;
  const binary = window.atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function persistImageResultToAsset({
  result,
  prompt,
  slide,
  providerId,
  modelId,
  costEstimate,
  skippedCreditCharge,
}: {
  result: ImageGenerationResult;
  prompt: string;
  slide: LessonSlidePlan;
  providerId: ImageProviderId;
  modelId: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
}): Promise<HtmlImageAsset> {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  if (result.url) {
    return {
      sourceType: 'url',
      url: result.url,
      providerId,
      providerName,
      modelId,
      prompt,
      width: result.width,
      height: result.height,
      costEstimate: costEstimate ?? null,
      skippedCreditCharge,
    };
  }

  if (!result.base64) {
    throw new Error('图片生成成功，但响应里没有可持久化的 URL 或 base64 数据。');
  }

  const blob = base64ImageToBlob(result.base64);
  const storageId = `generation-html-lesson-test:${slide.id}:${Date.now()}`;
  await db.mediaFiles.put({
    id: storageId,
    stageId: 'generation-html-lesson-test',
    type: 'image',
    blob,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    prompt,
    params: JSON.stringify({
      providerId,
      modelId,
      aspectRatio: '4:3',
      slideId: slide.id,
      slideTitle: slide.title,
      source: 'html-lesson-test',
    }),
    createdAt: Date.now(),
  });

  return {
    sourceType: 'indexeddb',
    storageId,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    providerId,
    providerName,
    modelId,
    prompt,
    width: result.width,
    height: result.height,
    costEstimate: costEstimate ?? null,
    skippedCreditCharge,
  };
}

function buildPendingImageAsset({
  providerId,
  modelId,
  prompt,
}: {
  providerId: ImageProviderId;
  modelId: string;
  prompt: string;
}): HtmlImageAsset {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  return {
    sourceType: 'pending',
    providerId,
    providerName,
    modelId,
    prompt,
    estimatedCostLabel: getEstimatedImageCostLabel(providerId, modelId),
    width: 960,
    height: 720,
    costEstimate: null,
    skippedCreditCharge: true,
  };
}

async function resolveImageAssetUrl(
  asset: HtmlImageAsset | null | undefined,
  isGenerating: boolean,
): Promise<string> {
  if (!asset) return '';
  if (asset.sourceType === 'pending') return buildImagePlaceholderDataUrl(asset, isGenerating);
  if (asset.sourceType === 'url') return asset.url || '';
  if (!asset.storageId) return '';
  const record = await db.mediaFiles.get(asset.storageId);
  if (!record?.blob) return '';
  return URL.createObjectURL(record.blob);
}

function markImageSlotHtml(html: string): string {
  if (!html.includes(IMAGE_ASSET_TOKEN)) return html;
  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    if (!attrs.includes(IMAGE_ASSET_TOKEN) || attrs.includes(HTML_IMAGE_SLOT_ATTR)) return match;
    return `<img ${HTML_IMAGE_SLOT_ATTR}="true" title="点击生成 AI 插图"${attrs}>`;
  });
}

function injectImageAssetIntoHtml(html: string, imageUrl: string): string {
  if (!imageUrl) return html;
  return html.split(IMAGE_ASSET_TOKEN).join(imageUrl);
}

function inferHtmlPageKind(outline: SceneOutline, pageIndex: number): InferredHtmlPageKind {
  const template = outline.layoutIntent?.layoutTemplate || '';
  const role = outline.teachingRole || '';
  const discipline = outline.layoutIntent?.disciplineStyle || '';
  const profile = outline.contentProfile || '';
  const anchor = outline.teachingPagePlan?.concreteAnchor || '';
  const hasConcreteCode =
    /```|<pre|<code/i.test(anchor) ||
    /^\s*(class|def|import|from|for|while|if|elif|else|return)\b/m.test(anchor) ||
    /^\s*[A-Za-z_]\w*\s*=\s*.+$/m.test(anchor);
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    template,
    role,
    discipline,
    profile,
    anchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();

  if (pageIndex === 0 || /cover|title|封面/.test(text)) {
    return 'cover';
  }
  if (outline.archetype === 'intro' || /hero|divider|导入|介绍/.test(text)) {
    return 'intro';
  }
  if (/pipeline_table|comparison_matrix|table|matrix|compare|comparison|表格|对比/.test(text)) {
    return 'table';
  }
  if (
    outline.workedExampleConfig?.kind === 'code' ||
    (/code|trace|代码|追踪/.test(text) && hasConcreteCode) ||
    hasConcreteCode
  ) {
    return 'code';
  }
  if (
    discipline === 'math' ||
    profile === 'math' ||
    /formula|derivation|proof|math|equation|函数|公式|证明|推导|定理|导数|矩阵/.test(text)
  ) {
    return 'math';
  }
  if (/process|timeline|steps|pipeline|flow|road|流程|步骤|路径/.test(text)) {
    return 'process';
  }
  if (outline.archetype === 'example' || outline.workedExampleConfig) return 'example';
  if (outline.archetype === 'summary' || /summary|recap|takeaway|总结|回顾/.test(text)) {
    return 'summary';
  }
  return 'auto';
}

function inferHtmlCodeRouteFromText(value: string): HtmlCodeRoute | undefined {
  const text = value.toLowerCase();
  if (
    /memory|heap|stack|alias|reference|object|self|attribute|class|node|linked list|内存|堆|栈|调用栈|引用|指向|对象|属性|字段|链表|节点|指针/.test(
      text,
    )
  ) {
    return 'memory-trace';
  }
  if (/trace|state|loop|line|execute|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return undefined;
}

function inferHtmlCourseRouteFromText(
  value: string,
  pageKind?: HtmlPageKind | InferredHtmlPageKind,
): HtmlCourseRoute {
  const text = value.toLowerCase();
  if (
    pageKind === 'math' ||
    /math|formula|derivation|proof|equation|calculus|matrix|probability|函数|公式|证明|推导|定理|导数|积分|矩阵|概率/.test(
      text,
    )
  ) {
    return 'math';
  }
  if (
    pageKind === 'code' ||
    /code|program|python|javascript|typescript|java|class|object|oop|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|代码|编程|程序|算法|调用栈|内存|堆|栈|对象|属性|字段|链表|指针/.test(
      text,
    )
  ) {
    return 'computer-science';
  }
  if (
    /science|physics|chemistry|biology|experiment|lab|物理|化学|生物|实验|科学|细胞|力学|电路/.test(
      text,
    )
  ) {
    return 'science';
  }
  if (
    /business|finance|economics|market|revenue|cost|profit|pricing|商业|财务|经济|市场|营收|成本|利润|盈亏|定价/.test(
      text,
    )
  ) {
    return 'business';
  }
  if (
    /history|literature|philosophy|source|argument|text|历史|文学|哲学|文本|史料|论证|修辞/.test(
      text,
    )
  ) {
    return 'humanities';
  }
  if (
    /policy|society|sociology|psychology|geography|case study|政策|社会|心理|地理|案例/.test(text)
  ) {
    return 'social-science';
  }
  return 'general';
}

function inferHtmlCsRouteFromText(value: string): HtmlCsRoute {
  const text = value.toLowerCase();
  const hasPointer =
    /linked\s*list|doubly|pointer|node|prev|next|front|链表|节点|指针|前驱|后继/.test(text);
  const hasInvariant = /invariant|合法|不变量|结构承诺|size|ordering|connectivity/.test(text);
  if (hasPointer && hasInvariant) return 'composite-operation';
  if (/graph|bfs|dfs|frontier|visited|neighbor|图搜索|广度|深度|邻居/.test(text)) {
    return 'graph-trace';
  }
  if (
    /bst|binary search tree|tree|root|parent|child|subtree|树|二叉搜索树|父节点|子节点/.test(text)
  ) {
    return 'tree-diagram';
  }
  if (hasPointer) return 'pointer-diagram';
  if (
    /dictionary|dict|hash|key|value|lookup|mutation|counts|字典|哈希|键|值|映射|查找/.test(text)
  ) {
    return 'dictionary-diagram';
  }
  if (/stack|queue|push|pop|enqueue|dequeue|lifo|fifo|栈|队列/.test(text)) {
    return 'linear-structure';
  }
  if (hasInvariant) return 'invariant-check';
  if (/recursion|recursive|call stack|frame|base case|递归|调用栈|栈帧|返回值/.test(text)) {
    return 'call-stack';
  }
  if (
    /memory|heap|alias|reference|object|self|attribute|class|field|内存|堆|引用|指向|对象|属性|字段/.test(
      text,
    )
  ) {
    return 'memory-diagram';
  }
  if (/trace|state|loop|line|execute|variable|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return 'standard';
}

function inferHtmlMathRouteFromText(
  value: string,
  pageKind?: HtmlPageKind | InferredHtmlPageKind,
): HtmlMathRoute {
  const text = value.toLowerCase();
  if (/proof|prove|证明|证毕|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|推导|化简|求导过程|递推|等价变形/.test(text)) return 'derivation';
  if (
    pageKind === 'example' ||
    /worked example|example|solve|problem|例题|求解|计算|答案/.test(text)
  ) {
    return 'worked-example';
  }
  if (/definition|theorem|lemma|proposition|corollary|定义|定理|引理|命题|推论/.test(text)) {
    return 'definition-theorem';
  }
  if (/formula|equation|identity|公式|方程|恒等式|核心公式/.test(text)) return 'formula-focus';
  if (/concept map|relationship|关系|图谱|概念图|包含关系|映射关系/.test(text))
    return 'concept-map';
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) {
    return 'comparison-table';
  }
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

function courseRoutePromptLabel(route: HtmlCourseRoute): string {
  const labels: Record<HtmlCourseRoute, string> = {
    general: '通用',
    math: '数学',
    'computer-science': '计算机科学',
    science: '自然科学',
    business: '商科经济',
    humanities: '人文',
    'social-science': '社科',
  };
  return labels[route];
}

function csRoutePromptLabel(route: HtmlCsRoute): string {
  const labels: Record<HtmlCsRoute, string> = {
    standard: 'standard（标准 CS 课程页）',
    'execution-trace': 'Execution Trace / 代码执行追踪',
    'memory-diagram': 'Memory Diagram / Stack + Heap + References',
    'call-stack': 'Call Stack / 递归调用栈',
    'pointer-diagram': 'Pointer Diagram / 链表指针图',
    'tree-diagram': 'Tree / BST Diagram',
    'graph-trace': 'Graph Trace / frontier + visited',
    'linear-structure': 'Linear Structure / Stack or Queue',
    'dictionary-diagram': 'Dictionary Diagram / key-value 映射',
    'invariant-check': 'Invariant Check / 结构合法性检查',
    'composite-operation': 'Composite Operation / 综合操作页',
  };
  return labels[route];
}

function mathRoutePromptLabel(route: HtmlMathRoute): string {
  const labels: Record<HtmlMathRoute, string> = {
    standard: 'standard（标准数学课程页）',
    'definition-theorem': 'Definition / Theorem Board',
    'formula-focus': 'Formula Focus / 核心公式页',
    derivation: 'Derivation Ladder / 推导阶梯',
    proof: 'Proof Walkthrough / 证明讲解',
    'worked-example': 'Worked Example / 例题拆解',
    'concept-map': 'Concept Map / 概念关系图',
    'comparison-table': 'Comparison / Case Table',
  };
  return labels[route];
}

function buildPlanKey(fixtureId: string, tier: PageCountTier): string {
  return `${RESULT_RENDER_VERSION}:${HTML_LESSON_MODEL}:${fixtureId}:${tier}`;
}

function buildPlanSignature(result: {
  fixtureId: string;
  pageCountTier: PageCountTier;
  plan: LessonPlan;
}): string {
  return [
    RESULT_RENDER_VERSION,
    HTML_LESSON_MODEL,
    result.fixtureId,
    result.pageCountTier,
    result.plan.lessonTitle,
    result.plan.pageCount,
    ...result.plan.slides.map((slide) =>
      [slide.id, slide.order, slide.title, slide.pageKind, slide.density, slide.htmlPrompt].join(
        '/',
      ),
    ),
  ].join('::');
}

function buildSlideKey(planSignature: string, slideId: string): string {
  return `${planSignature}:${slideId}`;
}

function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}

function sourcePagesFromFixture(fixture: TestfileFixture) {
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    title: outline.title,
    summary: outline.description,
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: pageKindLabel(inferHtmlPageKind(outline, index)),
  }));
}

function shouldUseGeneratedIllustration(slide: LessonSlidePlan): boolean {
  if (slide.pageKind === 'cover' || slide.pageKind === 'intro') return true;
  if (slide.pageKind === 'code' || slide.pageKind === 'table' || slide.density === 'dense') {
    return false;
  }
  const text = [slide.title, slide.objective, slide.htmlPrompt].join('\n');
  if (/不要图片|不需要图片|不用图片|不要插图|纯文本|no image/i.test(text)) return false;
  return /插图|图示|示意|视觉|直观|生活情境|场景|概念图|导入|开场|motivation|visual/i.test(text);
}

function buildSlideIllustrationPrompt(slide: LessonSlidePlan, lessonTitle: string): string {
  const common = [
    'Create one standalone inset illustration asset for a Chinese educational PowerPoint slide.',
    'The image is not a presentation page, not a slide background, not a UI screenshot, and not an infographic.',
    'Style: clean premium educational illustration, white and light blue background, blue and emerald accents, calm classroom visual language.',
    'Composition: one coherent object/scene only, centered, with generous clean negative space.',
    'Hard constraints: no readable text, no letters, no words, no numbers, no formulas, no labels, no axis labels, no watermark, no logo.',
  ];

  if (slide.pageKind === 'cover') {
    return [
      ...common,
      `Lesson: ${lessonTitle}.`,
      `Cover title: ${slide.title}.`,
      `Teaching objective: ${slide.objective}.`,
      'Create a compact notebook cover illustration that can sit inside a reserved 4:3 figure area.',
      'Do not draw a full 16:9 page. Do not include cards, panels, title text, captions, bullet lists, code, or math notation.',
      `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
    ].join('\n');
  }

  if (slide.pageKind === 'intro') {
    return [
      ...common,
      `Lesson: ${lessonTitle}.`,
      `Slide title: ${slide.title}.`,
      `Teaching objective: ${slide.objective}.`,
      'Create a small conceptual teaching illustration that can sit inside a reserved 4:3 figure area on the slide.',
      'Do not draw a full 16:9 page. Do not include cards, panels, title text, captions, or bullet lists.',
      `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
    ].join('\n');
  }

  return [
    ...common,
    `Lesson: ${lessonTitle}.`,
    `Slide title: ${slide.title}.`,
    `Page type: ${pageKindLabel(slide.pageKind)}.`,
    `Teaching objective: ${slide.objective}.`,
    'Create a compact concept illustration that supports the slide without replacing editable HTML text.',
    'Do not include any source text, code, math notation, table, or final answer in the image.',
    `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
  ].join('\n');
}

function buildDensityContract(slide: LessonSlidePlan): string {
  return [
    `密度档：${densityLabel(slide.density)}`,
    `主标题必须逐字显示：${slide.title}`,
    `可见中文/等价字符：${slide.contentBudget.visibleCharsMin}-${slide.contentBudget.visibleCharsMax}`,
    `主要内容区：最多 ${slide.contentBudget.mainRegions} 个`,
    `内容块：最多 ${slide.contentBudget.blockCount} 个`,
    '这是整节课规划后的单页 prompt；不要额外扩写，不要补第二主题。',
    'prompt 里明确要求的标题、数量、公式、步骤、短理由、结论和检查点都是必需保留内容。',
    '如果标题或 prompt 写了 5 个/4 步/3 条等数量，实际可见条目数量必须一致。',
    '主内容必须用正常 flex/grid flow，不能让底部条、例子卡或结论卡覆盖上方卡片。',
    '承载正文/公式/表格/步骤的卡片不能通过固定高度和 overflow:hidden 裁切内容。',
    slide.contentBudget.mustDeleteIfCrowded.length
      ? `如果拥挤，优先删除：${slide.contentBudget.mustDeleteIfCrowded.join('、')}`
      : '如果拥挤，优先删除次要说明、装饰标签、额外结论。',
  ].join('\n');
}

function evaluatePreview(iframe: HTMLIFrameElement | null): PreviewStats {
  const doc = iframe?.contentDocument;
  if (!doc) return emptyPreviewStats();
  const body = doc.body;
  const slide = doc.querySelector('.slide');
  const slideContent = doc.querySelector('.slide-content');
  const outOfBoundsSamples: string[] = [];
  const clippedSamples: string[] = [];
  let outOfBoundsCount = 0;
  let clippedCount = 0;

  const elementLabel = (element: HTMLElement) => {
    const className = typeof element.className === 'string' ? `.${element.className}` : '';
    return `${element.tagName.toLowerCase()}${className.split(/\s+/).slice(0, 2).join('.')}`;
  };

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const overflow =
      rect.left < -0.5 || rect.top < -0.5 || rect.right > 1600.5 || rect.bottom > 900.5;
    if (!overflow) return;
    outOfBoundsCount += 1;
    if (outOfBoundsSamples.length < 5) {
      outOfBoundsSamples.push(
        `${elementLabel(element)} ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(rect.right)},${Math.round(rect.bottom)}`,
      );
    }
  });

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    if (element.matches('style,script,br')) return;
    const hasText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
    const hasVisualChild = Boolean(element.querySelector('img,svg,math,table,pre,code'));
    if (!hasText && !hasVisualChild) return;
    const clipped =
      element.scrollWidth > element.clientWidth + 2 ||
      element.scrollHeight > element.clientHeight + 2;
    if (!clipped) return;
    clippedCount += 1;
    if (clippedSamples.length < 5) {
      clippedSamples.push(
        `${elementLabel(element)} ${element.scrollWidth}×${element.scrollHeight} > ${element.clientWidth}×${element.clientHeight}`,
      );
    }
  });

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let textNodeCount = 0;
  let visibleCharCount = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!text) continue;
    textNodeCount += 1;
    visibleCharCount += text.length;
  }

  return {
    scrollWidth: Math.max(body.scrollWidth, doc.documentElement.scrollWidth),
    scrollHeight: Math.max(body.scrollHeight, doc.documentElement.scrollHeight),
    slideCount: doc.querySelectorAll('.slide').length,
    hasSlideContent: Boolean(slide && slideContent),
    outOfBoundsCount,
    outOfBoundsSamples,
    clippedCount,
    clippedSamples,
    textNodeCount,
    visibleCharCount,
    mathCount: doc.querySelectorAll('math').length,
    tableCount: doc.querySelectorAll('table').length,
    preCount: doc.querySelectorAll('pre').length,
  };
}

function getPreviewStatus(stats: PreviewStats): 'pass' | 'fail' | 'empty' {
  if (stats.scrollWidth <= 0 || stats.scrollHeight <= 0) return 'empty';
  if (
    stats.slideCount === 1 &&
    stats.hasSlideContent &&
    stats.scrollWidth <= 1601 &&
    stats.scrollHeight <= 901 &&
    stats.outOfBoundsCount === 0 &&
    stats.clippedCount === 0
  ) {
    return 'pass';
  }
  return 'fail';
}

export default function GenerationHtmlLessonTestPage() {
  const imageProviderId = useSettingsStore((state) => state.imageProviderId);
  const imageModelId = useSettingsStore((state) => state.imageModelId);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);

  const [fixtures, setFixtures] = useState<TestfileFixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [fixtureError, setFixtureError] = useState<GenerationErrorResult | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [selectedTier, setSelectedTier] = useState<PageCountTier>('under10');
  const [selectedSlideIdByPlan, setSelectedSlideIdByPlan] = useState<Record<string, string>>({});
  const [plansByKey, setPlansByKey] = useState<Record<string, LessonPlanResult>>({});
  const [htmlBySlide, setHtmlBySlide] = useState<Record<string, HtmlSlideResult>>({});
  const [errorsBySlide, setErrorsBySlide] = useState<Record<string, GenerationErrorResult>>({});
  const [planErrorsByKey, setPlanErrorsByKey] = useState<Record<string, GenerationErrorResult>>({});
  const [isPlanning, setIsPlanning] = useState(false);
  const [generatingSlideIds, setGeneratingSlideIds] = useState<string[]>([]);
  const [isGeneratingImageAsset, setIsGeneratingImageAsset] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [previewStats, setPreviewStats] = useState<PreviewStats>(emptyPreviewStats);
  const [previewScale, setPreviewScale] = useState(0.7);
  const [resolvedPreviewHtml, setResolvedPreviewHtml] = useState('');
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadFixtures = useCallback(async () => {
    setIsLoadingFixtures(true);
    setFixtureError(null);
    try {
      const response = await backendFetch(
        `/api/generation-quality/testfile-fixtures?ts=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      if (!response.ok || data.success === false || !data.fixtures?.length) {
        setFixtureError(
          buildErrorResult(data, response.status, `读取 testfile 失败：HTTP ${response.status}`),
        );
        return;
      }
      setFixtures(data.fixtures);
      setSelectedFixtureId((previous) =>
        previous && data.fixtures?.some((fixture) => fixture.id === previous)
          ? previous
          : data.fixtures?.[0]?.id || '',
      );
    } catch (error) {
      setFixtureError(buildUnknownErrorResult(error));
    } finally {
      setIsLoadingFixtures(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readSavedState()
      .then((saved) => {
        if (cancelled) return;
        setSelectedFixtureId(saved.selectedFixtureId || '');
        setSelectedTier(saved.selectedTier || 'under10');
        setSelectedSlideIdByPlan(saved.selectedSlideIdByPlan || {});
        setPlansByKey(saved.plansByKey || {});
        setHtmlBySlide(saved.htmlBySlide || {});
        setErrorsBySlide(saved.errorsBySlide || {});
        setPlanErrorsByKey(saved.planErrorsByKey || {});
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void loadFixtures();
  }, [isHydrated, loadFixtures]);

  useEffect(() => {
    if (!isHydrated) return;
    const timer = window.setTimeout(() => {
      void writeSavedState({
        selectedFixtureId,
        selectedTier,
        selectedSlideIdByPlan,
        plansByKey,
        htmlBySlide,
        errorsBySlide,
        planErrorsByKey,
      }).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    errorsBySlide,
    htmlBySlide,
    isHydrated,
    planErrorsByKey,
    plansByKey,
    selectedFixtureId,
    selectedSlideIdByPlan,
    selectedTier,
  ]);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedFixtureId) || fixtures[0] || null,
    [fixtures, selectedFixtureId],
  );
  const currentPlanKey = selectedFixture ? buildPlanKey(selectedFixture.id, selectedTier) : '';
  const currentPlan = currentPlanKey ? plansByKey[currentPlanKey] || null : null;
  const currentPlanError = currentPlanKey ? planErrorsByKey[currentPlanKey] || null : null;
  const selectedSlideId =
    currentPlan && selectedSlideIdByPlan[currentPlanKey]
      ? selectedSlideIdByPlan[currentPlanKey]
      : currentPlan?.plan.slides[0]?.id || '';
  const currentSlide =
    currentPlan?.plan.slides.find((slide) => slide.id === selectedSlideId) ||
    currentPlan?.plan.slides[0] ||
    null;
  const generatingSlideIdSet = useMemo(() => new Set(generatingSlideIds), [generatingSlideIds]);
  const currentSlideKey =
    currentPlan && currentSlide ? buildSlideKey(currentPlan.signature, currentSlide.id) : '';
  const currentHtmlResult = currentSlideKey ? htmlBySlide[currentSlideKey] || null : null;
  const currentSlideError = currentSlideKey ? errorsBySlide[currentSlideKey] || null : null;
  const selectedImageProvider = IMAGE_PROVIDERS[imageProviderId];
  const selectedImageModelId =
    imageModelId || selectedImageProvider?.models[0]?.id || 'doubao-seedream-5-0-260128';
  const generatedCount = currentPlan
    ? currentPlan.plan.slides.filter((slide) =>
        Boolean(htmlBySlide[buildSlideKey(currentPlan.signature, slide.id)]),
      ).length
    : 0;
  const errorCount = currentPlan
    ? currentPlan.plan.slides.filter((slide) =>
        Boolean(errorsBySlide[buildSlideKey(currentPlan.signature, slide.id)]),
      ).length
    : 0;
  const totalHtmlCost = currentPlan
    ? currentPlan.plan.slides.reduce((sum, slide) => {
        const result = htmlBySlide[buildSlideKey(currentPlan.signature, slide.id)];
        return sum + (result?.rawResponse.costEstimate?.retailUsd || 0);
      }, currentPlan.rawResponse.costEstimate?.retailUsd || 0)
    : 0;
  const imageCapableCount = currentPlan
    ? currentPlan.plan.slides.filter((slide) => shouldUseGeneratedIllustration(slide)).length
    : 0;
  const pendingImageCount = currentPlan
    ? currentPlan.plan.slides.filter((slide) => {
        const result = htmlBySlide[buildSlideKey(currentPlan.signature, slide.id)];
        return result?.imageAsset?.sourceType === 'pending';
      }).length
    : 0;
  const generatedImageCount = currentPlan
    ? currentPlan.plan.slides.filter((slide) => {
        const result = htmlBySlide[buildSlideKey(currentPlan.signature, slide.id)];
        return Boolean(result?.imageAsset && result.imageAsset.sourceType !== 'pending');
      }).length
    : 0;
  const totalImageCost = currentPlan
    ? currentPlan.plan.slides.reduce((sum, slide) => {
        const result = htmlBySlide[buildSlideKey(currentPlan.signature, slide.id)];
        return sum + (result?.imageAsset?.costEstimate?.retailUsd || 0);
      }, 0)
    : 0;

  useEffect(() => {
    if (!currentHtmlResult) {
      setPreviewStats(emptyPreviewStats());
      setResolvedPreviewHtml('');
    }
  }, [currentHtmlResult]);

  useEffect(() => {
    let cancelled = false;
    if (!currentHtmlResult) {
      setResolvedPreviewHtml('');
      return;
    }
    const resolve = async () => {
      const imageUrl = await resolveImageAssetUrl(
        currentHtmlResult.imageAsset,
        isGeneratingImageAsset,
      );
      if (cancelled) return;
      setResolvedPreviewHtml(injectImageAssetIntoHtml(currentHtmlResult.html, imageUrl));
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [currentHtmlResult, currentSlideKey, isGeneratingImageAsset]);

  useEffect(() => {
    if (!currentHtmlResult) return;
    const element = previewFrameRef.current;
    if (!element) return;
    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const nextScale = Math.min(rect.width / 1600, rect.height / 900);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 0.7);
    };
    updateScale();
    const animationFrame = window.requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [currentSlideKey, currentHtmlResult]);

  const setSelectedSlideId = useCallback(
    (slideId: string) => {
      if (!currentPlanKey) return;
      setSelectedSlideIdByPlan((previous) => ({
        ...previous,
        [currentPlanKey]: slideId,
      }));
    },
    [currentPlanKey],
  );

  const generatePlan = useCallback(async (): Promise<LessonPlanResult | null> => {
    if (!selectedFixture) return null;
    const key = buildPlanKey(selectedFixture.id, selectedTier);
    const startedAt = Date.now();
    setIsPlanning(true);
    setRunMessage('正在规划整节课大纲和每页 HTML prompt...');
    setPlanErrorsByKey((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });

    try {
      const response = await backendFetch('/api/generation-quality/html-lesson-plan', {
        method: 'POST',
        headers: getHtmlLessonTestHeaders(),
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          fileName: selectedFixture.fileName,
          fileType: selectedFixture.fileType,
          title: selectedFixture.title,
          description: selectedFixture.description,
          sourceTextLength: selectedFixture.sourceTextLength,
          pageCountTier: selectedTier,
          sourcePages: sourcePagesFromFixture(selectedFixture),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as LessonPlanResponse;
      if (!response.ok || data.success === false || !data.plan?.slides?.length) {
        setPlanErrorsByKey((previous) => ({
          ...previous,
          [key]: buildErrorResult(data, response.status, `整节课规划失败：HTTP ${response.status}`),
        }));
        return null;
      }
      const result: LessonPlanResult = {
        plan: data.plan,
        fixtureId: selectedFixture.id,
        pageCountTier: selectedTier,
        signature: buildPlanSignature({
          fixtureId: selectedFixture.id,
          pageCountTier: selectedTier,
          plan: data.plan,
        }),
        rawResponse: data,
        planningDurationMs: Date.now() - startedAt,
        createdAt: Date.now(),
      };
      setPlansByKey((previous) => ({ ...previous, [key]: result }));
      setSelectedSlideIdByPlan((previous) => ({
        ...previous,
        [key]: data.plan?.slides[0]?.id || '',
      }));
      return result;
    } catch (error) {
      setPlanErrorsByKey((previous) => ({
        ...previous,
        [key]: buildUnknownErrorResult(error),
      }));
      return null;
    } finally {
      setIsPlanning(false);
      setRunMessage('');
    }
  }, [selectedFixture, selectedTier]);

  const generateSlide = useCallback(
    async (
      planResult: LessonPlanResult,
      slide: LessonSlidePlan,
      options?: { silentProgress?: boolean },
    ): Promise<boolean> => {
      const key = buildSlideKey(planResult.signature, slide.id);
      const startedAt = Date.now();
      const silentProgress = Boolean(options?.silentProgress);
      const imageAsset = shouldUseGeneratedIllustration(slide)
        ? buildPendingImageAsset({
            providerId: imageProviderId,
            modelId: selectedImageModelId,
            prompt: buildSlideIllustrationPrompt(slide, planResult.plan.lessonTitle),
          })
        : null;
      setGeneratingSlideIds((previous) =>
        previous.includes(slide.id) ? previous : [...previous, slide.id],
      );
      if (!silentProgress) {
        setRunMessage(`正在生成第 ${slide.order}/${planResult.plan.pageCount} 页：${slide.title}`);
      }
      setErrorsBySlide((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        const routeText = [
          planResult.plan.lessonTitle,
          slide.title,
          slide.objective,
          slide.htmlPrompt,
          ...slide.sourceCoverage,
        ].join('\n');
        const courseRoute = inferHtmlCourseRouteFromText(routeText, slide.pageKind);
        const csRoute =
          courseRoute === 'computer-science' ? inferHtmlCsRouteFromText(routeText) : undefined;
        const mathRoute =
          courseRoute === 'math'
            ? inferHtmlMathRouteFromText(routeText, slide.pageKind)
            : undefined;
        const routeInstruction = [
          `课程路线：${courseRoutePromptLabel(courseRoute)}`,
          csRoute ? `CS 版式：${csRoutePromptLabel(csRoute)}` : '',
          mathRoute ? `数学版式：${mathRoutePromptLabel(mathRoute)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        const htmlPrompt = [slide.htmlPrompt, '', routeInstruction].filter(Boolean).join('\n');
        const response = await backendFetch('/api/generate/html-ppt-slide', {
          method: 'POST',
          headers: getHtmlLessonTestHeaders(),
          body: JSON.stringify({
            prompt: htmlPrompt,
            pageKind: slide.pageKind,
            codeRoute:
              slide.pageKind === 'code' ? inferHtmlCodeRouteFromText(routeText) : undefined,
            courseRoute,
            csRoute,
            mathRoute,
            densityContract: buildDensityContract(slide),
            imageAsset: imageAsset
              ? {
                  src: IMAGE_ASSET_TOKEN,
                  alt: `${slide.title} AI 插图`,
                  description: imageAsset.prompt,
                  aspectRatio: '4:3',
                }
              : undefined,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
        if (!response.ok || data.success === false || !data.html) {
          setErrorsBySlide((previous) => ({
            ...previous,
            [key]: buildErrorResult(
              data,
              response.status,
              `HTML 生成失败：HTTP ${response.status}`,
            ),
          }));
          return false;
        }
        const html = imageAsset ? markImageSlotHtml(data.html) : data.html;
        const htmlStats = analyzeHtml(html);
        setHtmlBySlide((previous) => ({
          ...previous,
          [key]: {
            html: html || '',
            slide,
            prompt: htmlPrompt,
            planSignature: planResult.signature,
            courseRoute,
            csRoute,
            mathRoute,
            rawResponse: data,
            imageAsset,
            ...htmlStats,
            durationMs: Date.now() - startedAt,
            createdAt: Date.now(),
          },
        }));
        return true;
      } catch (error) {
        setErrorsBySlide((previous) => ({
          ...previous,
          [key]: buildUnknownErrorResult(error),
        }));
        return false;
      } finally {
        setGeneratingSlideIds((previous) => previous.filter((id) => id !== slide.id));
        if (!silentProgress) setRunMessage('');
      }
    },
    [imageProviderId, selectedImageModelId],
  );

  const handleGeneratePlanOnly = useCallback(() => {
    void generatePlan();
  }, [generatePlan]);

  const handleGenerateCurrentSlide = useCallback(() => {
    if (!currentPlan || !currentSlide) return;
    void generateSlide(currentPlan, currentSlide);
  }, [currentPlan, currentSlide, generateSlide]);

  const handleGenerateImageForCurrentSlide = useCallback(async () => {
    if (!currentHtmlResult || !currentSlideKey) return;
    const pendingAsset = currentHtmlResult.imageAsset;
    if (!pendingAsset || pendingAsset.sourceType !== 'pending') return;
    if (isGeneratingImageAsset) return;

    setIsGeneratingImageAsset(true);
    setRunMessage(
      `正在生成第 ${currentHtmlResult.slide.order} 页插图：${currentHtmlResult.slide.title}`,
    );
    setErrorsBySlide((previous) => {
      const next = { ...previous };
      delete next[currentSlideKey];
      return next;
    });

    try {
      const imageResponse = await backendFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': pendingAsset.providerId,
          'x-image-model': pendingAsset.modelId,
          'x-api-key': imageProvidersConfig[pendingAsset.providerId]?.apiKey || '',
          'x-base-url': imageProvidersConfig[pendingAsset.providerId]?.baseUrl || '',
          'x-generation-test-no-charge': 'true',
        },
        body: JSON.stringify({
          prompt: pendingAsset.prompt,
          negativePrompt:
            'text, letters, words, numbers, formulas, labels, axis labels, caption, title, watermark, logo, UI screenshot, complete presentation slide, infographic cards, panels',
          aspectRatio: '4:3',
          notebookContext: {
            name: 'HTML 整节课生成测试',
            sceneTitle: currentHtmlResult.slide.title,
            sceneOrder: currentHtmlResult.slide.order,
            sceneType: 'generation-html-lesson-test',
          },
        }),
      });
      const imageData = (await imageResponse
        .json()
        .catch(() => ({}))) as GenerateSlideImageResponse;
      if (!imageResponse.ok || !imageData.success || !imageData.result) {
        throw new Error(imageData.error || `AI 插图生成失败：HTTP ${imageResponse.status}`);
      }
      if (!resultToImageUrl(imageData.result)) {
        throw new Error('AI 插图生成成功，但响应里没有可展示的图片数据。');
      }

      const nextAsset = await persistImageResultToAsset({
        result: imageData.result,
        prompt: pendingAsset.prompt,
        slide: currentHtmlResult.slide,
        providerId: pendingAsset.providerId,
        modelId: imageData.result.usage?.modelId || pendingAsset.modelId,
        costEstimate: imageData.costEstimate,
        skippedCreditCharge: imageData.skippedCreditCharge,
      });

      setHtmlBySlide((previous) => {
        const existing = previous[currentSlideKey];
        if (!existing || existing.createdAt !== currentHtmlResult.createdAt) return previous;
        return {
          ...previous,
          [currentSlideKey]: {
            ...existing,
            imageAsset: nextAsset,
          },
        };
      });
      setPreviewStats(emptyPreviewStats());
    } catch (error) {
      setErrorsBySlide((previous) => ({
        ...previous,
        [currentSlideKey]: {
          message: error instanceof Error ? error.message : String(error),
          details: 'AI 插图生成失败，HTML 页面本身仍保留。',
          createdAt: Date.now(),
        },
      }));
    } finally {
      setIsGeneratingImageAsset(false);
      setRunMessage('');
    }
  }, [currentHtmlResult, currentSlideKey, imageProvidersConfig, isGeneratingImageAsset]);

  const attachImageSlotClickHandler = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const pending = currentHtmlResult?.imageAsset?.sourceType === 'pending';
    if (!doc || !pending) return;

    const slotImage = doc.querySelector(
      `img[${HTML_IMAGE_SLOT_ATTR}="true"]`,
    ) as HTMLElement | null;
    if (!slotImage) return;
    const clickTarget = (slotImage.closest('figure') as HTMLElement | null) || slotImage;
    clickTarget.style.cursor = isGeneratingImageAsset ? 'wait' : 'pointer';
    clickTarget.setAttribute(
      'title',
      isGeneratingImageAsset ? '正在生成 AI 插图' : '点击生成 AI 插图',
    );
    clickTarget.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleGenerateImageForCurrentSlide();
    };
  }, [currentHtmlResult, handleGenerateImageForCurrentSlide, isGeneratingImageAsset]);

  useEffect(() => {
    if (currentHtmlResult?.imageAsset?.sourceType !== 'pending') return;
    const timers = [0, 100, 350].map((delay) =>
      window.setTimeout(() => attachImageSlotClickHandler(), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [attachImageSlotClickHandler, currentHtmlResult, resolvedPreviewHtml]);

  const recordRunTiming = useCallback((planResult: LessonPlanResult, timing: LessonRunTiming) => {
    const key = buildPlanKey(planResult.fixtureId, planResult.pageCountTier);
    setPlansByKey((previous) => {
      const existing = previous[key] || planResult;
      return {
        ...previous,
        [key]: {
          ...existing,
          lastRun: timing,
        },
      };
    });
  }, []);

  const generateSlidesInParallel = useCallback(
    async ({
      planResult,
      slides,
      mode,
      runStartedAt,
      planningDurationMs,
    }: {
      planResult: LessonPlanResult;
      slides: LessonSlidePlan[];
      mode: LessonRunTiming['mode'];
      runStartedAt: number;
      planningDurationMs?: number;
    }) => {
      if (!slides.length) return;

      const concurrency = Math.min(HTML_SLIDE_GENERATION_CONCURRENCY, slides.length);
      let nextIndex = 0;
      let completedSlideCount = 0;
      let generatedSlideCount = 0;
      let failedSlideCount = 0;
      const totalSlideCount = slides.length;

      setRunMessage(`并行生成 HTML：0/${totalSlideCount} 完成 · 并发 ${concurrency}`);

      const runWorker = async () => {
        while (true) {
          const slide = slides[nextIndex];
          nextIndex += 1;
          if (!slide) return;

          const ok = await generateSlide(planResult, slide, { silentProgress: true });
          completedSlideCount += 1;
          if (ok) generatedSlideCount += 1;
          else failedSlideCount += 1;
          setRunMessage(
            `并行生成 HTML：${completedSlideCount}/${totalSlideCount} 完成 · 成功 ${generatedSlideCount} · 失败 ${failedSlideCount} · 并发 ${concurrency}`,
          );
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

      const completedAt = Date.now();
      recordRunTiming(planResult, {
        mode,
        startedAt: runStartedAt,
        completedAt,
        durationMs: completedAt - runStartedAt,
        planningDurationMs,
        slideDurationMs:
          mode === 'whole-lesson'
            ? Math.max(0, completedAt - runStartedAt - (planningDurationMs || 0))
            : completedAt - runStartedAt,
        generatedSlideCount,
        failedSlideCount,
        totalSlideCount,
        concurrency,
      });
      setRunMessage('');
    },
    [generateSlide, recordRunTiming],
  );

  const handleGenerateMissingSlides = useCallback(async () => {
    if (!currentPlan) return;
    const runStartedAt = Date.now();
    const missingSlides = currentPlan.plan.slides.filter((slide) => {
      const key = buildSlideKey(currentPlan.signature, slide.id);
      return !htmlBySlide[key];
    });
    if (!missingSlides.length) return;
    setSelectedSlideId(missingSlides[0]?.id || currentPlan.plan.slides[0]?.id || '');
    await generateSlidesInParallel({
      planResult: currentPlan,
      slides: missingSlides,
      mode: 'missing-slides',
      runStartedAt,
    });
  }, [currentPlan, generateSlidesInParallel, htmlBySlide, setSelectedSlideId]);

  const handleGenerateWholeLesson = useCallback(async () => {
    const runStartedAt = Date.now();
    const planResult = await generatePlan();
    if (!planResult) return;
    setSelectedSlideIdByPlan((previous) => ({
      ...previous,
      [buildPlanKey(planResult.fixtureId, planResult.pageCountTier)]:
        planResult.plan.slides[0]?.id || '',
    }));
    await generateSlidesInParallel({
      planResult,
      slides: planResult.plan.slides,
      mode: 'whole-lesson',
      runStartedAt,
      planningDurationMs: planResult.planningDurationMs,
    });
  }, [generatePlan, generateSlidesInParallel]);

  const clearCurrentPlan = useCallback(() => {
    if (!currentPlanKey) return;
    const signature = currentPlan?.signature;
    setPlansByKey((previous) => {
      const next = { ...previous };
      delete next[currentPlanKey];
      return next;
    });
    setPlanErrorsByKey((previous) => {
      const next = { ...previous };
      delete next[currentPlanKey];
      return next;
    });
    if (signature) {
      setHtmlBySlide((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([, result]) => result.planSignature !== signature),
        ),
      );
      setErrorsBySlide((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(signature))),
      );
    }
  }, [currentPlan, currentPlanKey]);

  const previewStatus = getPreviewStatus(previewStats);
  const isBusy = isPlanning || generatingSlideIds.length > 0 || isGeneratingImageAsset;
  const activePipelinePhase = currentPlan
    ? generatedCount > 0
      ? 'html-pages'
      : 'html-prompts'
    : 'course-plan';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
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
                HTML Lesson Deck QA
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
                HTML 整节课生成测试
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                模拟“上传文件 → 选择页数档位 → 先规划整节课 → 给每页写 HTML prompt → 逐页生成
                HTML”的链路。这里先不生成讲解动作和讲稿，只看页面容量分配和 HTML 结果。
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-6 xl:min-w-[620px] xl:max-w-[760px]">
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
                <div className="text-xs text-slate-500">总耗时</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {formatDuration(currentPlan?.lastRun?.durationMs)}
                </div>
              </div>
            </div>
          </div>
        </header>

        <HtmlTestProgressionPanel currentStageId="html-lesson" />
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

        <section className="grid gap-5 xl:grid-cols-[minmax(340px,3fr)_minmax(0,7fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">整节课设置</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                选择 testfile 文件和页数档位，先让 AI 分配页面容量。
              </p>

              <div className="mt-4 grid gap-3">
                <label className="block text-xs font-medium text-slate-600">
                  源文件
                  <Select
                    value={selectedFixture?.id || ''}
                    onValueChange={setSelectedFixtureId}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="选择 testfile 文件" />
                    </SelectTrigger>
                    <SelectContent>
                      {fixtures.map((fixture) => (
                        <SelectItem key={fixture.id} value={fixture.id}>
                          {fixture.fileName}
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
                  规划阶段决定页面容量；HTML 生成阶段按最多 {HTML_SLIDE_GENERATION_CONCURRENCY}{' '}
                  路并行执行。
                </div>

                <Button
                  type="button"
                  disabled={!selectedFixture || isBusy}
                  onClick={handleGenerateWholeLesson}
                >
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  并行生成整节课 slides
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
                    disabled={!currentPlan && !currentPlanError}
                    onClick={clearCurrentPlan}
                  >
                    <Trash2 className="size-4" />
                    清当前
                  </Button>
                </div>
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
                    每页都是一个即将发送给 HTML 接口的 prompt。
                  </p>
                </div>
                <Badge variant="outline">
                  {generatedCount}/{currentPlan?.plan.pageCount || 0}
                  {errorCount ? ` · ${errorCount} 错` : ''}
                </Badge>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {currentPlan?.plan.slides.length ? (
                  currentPlan.plan.slides.map((slide) => {
                    const key = buildSlideKey(currentPlan.signature, slide.id);
                    const result = htmlBySlide[key] || null;
                    const error = errorsBySlide[key] || null;
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
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-500',
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
                              <span>{densityLabel(slide.density)}</span>
                              <span>·</span>
                              <span>{sourceUsageLabel(slide.sourceUsage)}</span>
                            </div>
                          </div>
                          <Badge
                            variant={result ? 'default' : error ? 'destructive' : 'outline'}
                            className="shrink-0"
                          >
                            {generatingSlideIdSet.has(slide.id)
                              ? '生成中'
                              : result
                                ? 'HTML OK'
                                : error
                                  ? '错误'
                                  : '待生成'}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    先生成整节课规划。
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedFixture?.fileName || 'testfile'}</Badge>
                    <Badge variant="secondary">{currentPlan?.plan.lessonTitle || '暂无规划'}</Badge>
                    {currentSlide ? (
                      <>
                        <Badge variant="outline">{pageKindLabel(currentSlide.pageKind)}</Badge>
                        <Badge variant="outline">{densityLabel(currentSlide.density)}</Badge>
                      </>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-normal text-slate-950">
                    {currentSlide?.title || '等待生成整节课规划'}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {currentSlide?.objective ||
                      '规划阶段会决定每一页讲什么、放多少内容、用原例子还是改写例子。'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {currentHtmlResult?.imageAsset ? (
                    <Button
                      type="button"
                      variant={
                        currentHtmlResult.imageAsset.sourceType === 'pending'
                          ? 'default'
                          : 'outline'
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
                        <div className="font-semibold">
                          {currentSlide.contentBudget.mainRegions}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">内容块</div>
                        <div className="font-semibold">{currentSlide.contentBudget.blockCount}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">素材策略</div>
                        <div className="font-semibold">
                          {sourceUsageLabel(currentSlide.sourceUsage)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-500">源材料覆盖</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {currentSlide.sourceCoverage.join(' / ') || '未标注'}
                    </p>
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
                      {currentHtmlResult.elementCount} elements · {currentHtmlResult.htmlLength}{' '}
                      chars
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">HTML 预览</h2>
                  <p className="text-xs text-slate-500">
                    iframe 按 1600×900 渲染，检查滚动、越界、裁切和基础 DOM 结构。
                  </p>
                </div>
                {currentHtmlResult ? (
                  <Badge
                    variant={previewStatus === 'pass' ? 'default' : 'destructive'}
                    className="gap-1"
                  >
                    {previewStatus === 'pass' ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    {previewStatus === 'pass' ? 'QA 通过' : 'QA 待看'}
                  </Badge>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className="relative mx-auto aspect-video w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                >
                  {currentHtmlResult ? (
                    <iframe
                      key={`${currentSlideKey}-${currentHtmlResult.createdAt}-${currentHtmlResult.imageAsset?.sourceType || 'no-image'}-${isGeneratingImageAsset ? 'image-loading' : 'ready'}`}
                      ref={iframeRef}
                      title="HTML lesson slide preview"
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      srcDoc={resolvedPreviewHtml || currentHtmlResult.html}
                      onLoad={() => {
                        setPreviewStats(evaluatePreview(iframeRef.current));
                        attachImageSlotClickHandler();
                      }}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      {generatingSlideIds.length > 0 ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <Code2 className="size-8" />
                      )}
                      <div className="text-sm font-medium">
                        {generatingSlideIds.length > 0
                          ? '正在生成 HTML...'
                          : '生成当前页后在这里预览'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {currentHtmlResult ? (
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-6">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">预览缩放</div>
                    <div className="mt-1 font-semibold">{previewScale.toFixed(3)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">滚动尺寸</div>
                    <div className="mt-1 font-semibold">
                      {previewStats.scrollWidth || '-'} × {previewStats.scrollHeight || '-'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">越界元素</div>
                    <div className="mt-1 font-semibold">{previewStats.outOfBoundsCount}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">裁切风险</div>
                    <div className="mt-1 font-semibold">{previewStats.clippedCount}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">结构</div>
                    <div className="mt-1 font-semibold">
                      slide {previewStats.slideCount} · content{' '}
                      {previewStats.hasSlideContent ? '有' : '缺'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">内容节点</div>
                    <div className="mt-1 font-semibold">
                      {previewStats.textNodeCount} text · {previewStats.visibleCharCount} chars
                    </div>
                  </div>
                  {previewStats.outOfBoundsSamples.length ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-6">
                      {previewStats.outOfBoundsSamples.join(' / ')}
                    </div>
                  ) : null}
                  {previewStats.clippedSamples.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:col-span-6">
                      {previewStats.clippedSamples.join(' / ')}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {currentPlan ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <FileCode2 className="size-4 text-slate-500" />
                    <h2 className="text-sm font-semibold">发送给 HTML 接口的 prompt</h2>
                  </div>
                  <Textarea
                    readOnly
                    className="min-h-[360px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                    value={currentSlide?.htmlPrompt || ''}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold">整节课规划备注</h2>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    {currentPlan.plan.planningNotes.length ? (
                      currentPlan.plan.planningNotes.map((note, index) => (
                        <div key={`${note}-${index}`} className="rounded-xl bg-slate-50 p-3">
                          {note}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
                        暂无备注。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
