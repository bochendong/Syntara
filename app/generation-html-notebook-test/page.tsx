'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const LEGACY_STORAGE_KEY = 'syntara:html-notebook-generation-test:v3';
const TEST_RESULT_ID = 'html-notebook';
const TEST_RESULT_KEY = 'state';
const HTML_LESSON_MODEL = 'gpt-5.4';
const RESULT_RENDER_VERSION = 'html-notebook-v7';
const IMAGE_ASSET_TOKEN = '__SYNTARA_GENERATED_SLIDE_IMAGE_ASSET__';
const HTML_IMAGE_SLOT_ATTR = 'data-syntara-ai-image-slot';
const HTML_SLIDE_GENERATION_CONCURRENCY = 2;
const HTML_SLIDE_REQUEST_TIMEOUT_MS = 210_000;

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
type HtmlCanvasMode = 'slide' | 'tall' | 'long';

interface SourcePackageImage {
  id: string;
  src: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

interface SourcePackagePage {
  sourceIndex: number;
  title: string;
  summary: string;
  keyPoints: string[];
  concreteAnchor: string;
  sourceLabel: string;
  suggestedPageKind: string;
  imageIds?: string[];
}

interface SourcePackage {
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  sourceText: string;
  sourcePages: SourcePackagePage[];
  sourceImages: SourcePackageImage[];
  imageMapping: Record<string, string>;
  pageCount: number;
  parser?: string;
  warnings?: string[];
}

interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  fileCount?: number;
  sourceFiles?: Array<{
    id: string;
    fileName: string;
    fileType: 'md' | 'pdf' | 'pptx';
    title: string;
    sourceTextLength: number;
    pageCount: number;
  }>;
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
  sourcePackage?: SourcePackage;
}

interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
  notebooks?: TestfileFixture[];
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
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  densityTarget?: DensityLevel;
  objective: string;
  learnerQuestion?: string;
  keyPoints?: string[];
  sourceCoverage: string[];
  sourceAnchors?: string[];
  sourceImageIds?: string[];
  sourceUseRationale?: string;
  visualPlan?: string;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
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

interface CoursePlan {
  targetLearner: string;
  courseGoal: string;
  narrativeArc: string[];
  prerequisiteAssumptions: string[];
  coreQuestions: string[];
  sourceDigest: string[];
  pacingStrategy: string;
}

interface SlideTeachingOutline {
  id: string;
  order: number;
  title: string;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  learnerQuestion: string;
  teachingObjective: string;
  keyPoints: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  sourceUseRationale: string;
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
}

interface LessonPlan {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  coursePlan?: CoursePlan;
  slideOutlines?: SlideTeachingOutline[];
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
  planningQuality?: PlanningQualityReport | null;
  planningRetryCount?: number;
  planningRetryReasons?: PlanningQualityIssue[];
  error?: string;
  details?: string;
}

interface PlanningQualityIssue {
  code: string;
  title: string;
  severity: 'error' | 'warning';
  details: string[];
}

interface PlanningQualityReport {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  issues: PlanningQualityIssue[];
  summary: string;
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
  sourceImageUsage?: {
    assignedIds: string[];
    usedIds: string[];
    missingIds: string[];
    inventedIds: string[];
  };
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
  assignedSourceImages?: SourcePackageImage[];
  sourceImageUsage?: GenerateHtmlPptResponse['sourceImageUsage'];
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

type HtmlSlideGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface HtmlSlideGenerationJob {
  status: HtmlSlideGenerationJobStatus;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  message?: string;
  details?: string;
}

interface SavedState {
  selectedFixtureId?: string;
  selectedTier?: PageCountTier;
  selectedSlideIdByPlan?: Record<string, string>;
  plansByKey?: Record<string, LessonPlanResult>;
  htmlBySlide?: Record<string, HtmlSlideResult>;
  errorsBySlide?: Record<string, GenerationErrorResult>;
  jobsBySlide?: Record<string, HtmlSlideGenerationJob>;
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
  overlapCount: number;
  overlapSamples: string[];
  mathRouteIssueCount: number;
  mathRouteIssueSamples: string[];
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

function sanitizePersistedJobs(
  jobs: SavedState['jobsBySlide'],
): Record<string, HtmlSlideGenerationJob> {
  if (!jobs || !isRecord(jobs)) return {};
  return Object.fromEntries(
    Object.entries(jobs).filter(([, job]) => {
      if (!isRecord(job)) return false;
      return job.status !== 'queued' && job.status !== 'running';
    }),
  ) as Record<string, HtmlSlideGenerationJob>;
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
    if (!isRecord(parsed)) return {};
    const state = parsed as SavedState;
    return {
      ...state,
      jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
    };
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
    if (row?.payload && isRecord(row.payload)) {
      const state = row.payload as SavedState;
      return {
        ...state,
        jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
      };
    }
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
  const sanitizedState = {
    ...state,
    jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
  };
  await saveTestResult({
    testId: TEST_RESULT_ID,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: 'HTML 整本笔记本生成测试',
    summary: summarizeSavedState(sanitizedState),
    payload: sanitizedState,
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
    overlapCount: 0,
    overlapSamples: [],
    mathRouteIssueCount: 0,
    mathRouteIssueSamples: [],
    textNodeCount: 0,
    visibleCharCount: 0,
    mathCount: 0,
    tableCount: 0,
    preCount: 0,
  };
}

function normalizePreviewStats(stats: Partial<PreviewStats> | null | undefined): PreviewStats {
  const base = emptyPreviewStats();
  return {
    ...base,
    ...(stats || {}),
    outOfBoundsSamples: stats?.outOfBoundsSamples || [],
    clippedSamples: stats?.clippedSamples || [],
    overlapSamples: stats?.overlapSamples || [],
    mathRouteIssueSamples: stats?.mathRouteIssueSamples || [],
    mathRouteIssueCount: stats?.mathRouteIssueCount || 0,
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
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'HTML 生成请求超时',
      details: `单页生成超过 ${Math.round(HTML_SLIDE_REQUEST_TIMEOUT_MS / 1000)} 秒没有返回，已跳过这一页并继续后续队列。`,
      createdAt: Date.now(),
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}

async function backendFetchWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await backendFetch(path, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
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

function getSlideCanvasMode(
  slide: Pick<LessonSlidePlan, 'canvasMode'> | null | undefined,
): HtmlCanvasMode {
  if (slide?.canvasMode === 'long') return 'long';
  if (slide?.canvasMode === 'tall') return 'tall';
  return 'slide';
}

function getSlideCanvasHeight(
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

function canvasModeLabel(
  slide: Pick<LessonSlidePlan, 'canvasMode' | 'canvasHeight'> | null | undefined,
): string {
  const mode = getSlideCanvasMode(slide);
  if (mode === 'tall') return `中高页 ${getSlideCanvasHeight(slide)}px`;
  if (mode === 'long') return `长页 ${getSlideCanvasHeight(slide)}px`;
  return '16:9';
}

function sourceUsageLabel(usage: LessonSlidePlan['sourceUsage']): string {
  if (usage === 'direct') return '直接使用源材料';
  if (usage === 'adapted') return '改写源材料';
  if (usage === 'new-example') return '新例子替换';
  return '综合整理';
}

function slideJobStatusLabel(status: HtmlSlideGenerationJobStatus): string {
  const labels: Record<HtmlSlideGenerationJobStatus, string> = {
    queued: '排队中',
    running: '生成中',
    succeeded: 'HTML OK',
    failed: '失败',
    skipped: '已跳过',
  };
  return labels[status];
}

function slideJobStatusClassName(status: HtmlSlideGenerationJobStatus): string {
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'queued') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'succeeded') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

function planningQualityClassName(quality: PlanningQualityReport | null | undefined): string {
  if (!quality) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (!quality.passed) return 'border-red-200 bg-red-50 text-red-800';
  if (quality.warningIssueCount > 0) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
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
  const sourceLabel = cost.source === 'token_fallback' ? '按 token 粗略估算' : 'OpenAI 定价估算';
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
  const storageId = `generation-html-notebook-test:${slide.id}:${Date.now()}`;
  await db.mediaFiles.put({
    id: storageId,
    stageId: 'generation-html-notebook-test',
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
      source: 'html-notebook-test',
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
    result.plan.coursePlan?.courseGoal || '',
    (result.plan.coursePlan?.narrativeArc || []).join('|'),
    (result.plan.coursePlan?.coreQuestions || []).join('|'),
    ...(result.plan.slideOutlines || []).map((outline) =>
      [
        outline.id,
        outline.title,
        outline.learnerQuestion,
        outline.teachingObjective,
        outline.visualPlan,
        (outline.sourceAnchors || []).join('|'),
        (outline.mandatoryVisibleContent || []).join('|'),
      ].join('/'),
    ),
    ...result.plan.slides.map((slide) =>
      [
        slide.id,
        slide.order,
        slide.title,
        slide.pageKind,
        slide.courseRoute || '',
        slide.csRoute || '',
        slide.mathRoute || '',
        slide.density,
        slide.learnerQuestion || '',
        (slide.keyPoints || []).join('|'),
        (slide.mandatoryVisibleContent || []).join('|'),
        slide.sourceUseRationale || '',
        slide.visualPlan || '',
        slide.htmlPrompt,
      ].join('/'),
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
  if (fixture.sourcePackage?.sourcePages?.length) {
    return fixture.sourcePackage.sourcePages;
  }
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    title: outline.title,
    summary: outline.description,
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: pageKindLabel(inferHtmlPageKind(outline, index)),
  }));
}

function sourceImageKb(image: SourcePackageImage): number {
  if (typeof image.byteLength === 'number') return Math.round(image.byteLength / 1024);
  const base64 = image.src.match(/^data:[^;]+;base64,(.+)$/)?.[1];
  if (base64) return Math.round(Math.ceil((base64.length * 3) / 4) / 1024);
  return Math.round(image.src.length / 1024);
}

function sourceImageLabel(image: SourcePackageImage): string {
  const size =
    image.width && image.height ? ` · ${Math.round(image.width)}×${Math.round(image.height)}` : '';
  return `${image.id} · 第 ${image.pageNumber} 页${size} · ${sourceImageKb(image)} KB`;
}

function getAssignedSourceImages(
  fixture: TestfileFixture | null | undefined,
  slide: LessonSlidePlan,
): SourcePackageImage[] {
  const ids = slide.sourceImageIds || [];
  if (!ids.length || !fixture?.sourcePackage?.sourceImages?.length) return [];
  const idSet = new Set(ids);
  return fixture.sourcePackage.sourceImages.filter((image) => idSet.has(image.id)).slice(0, 4);
}

function shouldUseGeneratedIllustration(slide: LessonSlidePlan): boolean {
  if (slide.sourceImageIds?.length) return false;
  if (slide.courseRoute === 'math' || slide.mathRoute) return false;
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
  const canvasMode = getSlideCanvasMode(slide);
  const canvasHeight = getSlideCanvasHeight(slide);
  return [
    `画布模式：${
      canvasMode === 'long'
        ? `长页面，宽 1600px，高约 ${canvasHeight}px`
        : canvasMode === 'tall'
          ? `中高课件页，宽 1600px，高约 ${canvasHeight}px`
          : '标准 16:9，1600×900'
    }`,
    `密度档：${densityLabel(slide.density)}`,
    `主标题必须逐字显示：${slide.title}`,
    `可见中文/等价字符：${slide.contentBudget.visibleCharsMin}-${slide.contentBudget.visibleCharsMax}`,
    `主要内容区：最多 ${slide.contentBudget.mainRegions} 个`,
    `内容块：最多 ${slide.contentBudget.blockCount} 个`,
    '这是整本 notebook 规划后的单页 prompt；不要额外扩写，不要补第二主题。',
    'prompt 里明确要求的标题、数量、公式、步骤、短理由、结论和检查点都是必需保留内容。',
    '如果标题或 prompt 写了 5 个/4 步/3 条等数量，实际可见条目数量必须一致。',
    canvasMode === 'slide'
      ? '主内容必须用正常 flex/grid flow，不能让底部条、例子卡或结论卡覆盖上方卡片。'
      : '这是规划好的增高画布：用纵向 section 自然展开，不能把结论、结果、检查点或例子卡覆盖到前面的内容上。',
    '承载正文/公式/表格/步骤的卡片不能通过固定高度和 overflow:hidden 裁切内容。',
    slide.contentBudget.mustDeleteIfCrowded.length
      ? `如果拥挤，优先删除：${slide.contentBudget.mustDeleteIfCrowded.join('、')}`
      : '如果拥挤，优先删除次要说明、装饰标签、额外结论。',
  ].join('\n');
}

function buildStructuredSlideContext(slide: LessonSlidePlan, plan: LessonPlan): string {
  const coursePlan = plan.coursePlan;
  const outline =
    plan.slideOutlines?.find((item) => item.id === slide.id || item.order === slide.order) || null;
  const canvasMode = getSlideCanvasMode(slide);
  const canvasHeight = getSlideCanvasHeight(slide);
  return [
    '结构化单页教学 outline（优先级高于自由 prompt）：',
    `整本课程目标：${coursePlan?.courseGoal || plan.lessonTitle}`,
    coursePlan?.narrativeArc?.length ? `整本叙事弧线：${coursePlan.narrativeArc.join(' -> ')}` : '',
    coursePlan?.coreQuestions?.length ? `整本核心问题：${coursePlan.coreQuestions.join('；')}` : '',
    outline ? `规划层本页标题：${outline.title}` : '',
    `本页学习问题：${outline?.learnerQuestion || slide.learnerQuestion || slide.objective}`,
    `本页教学目标：${outline?.teachingObjective || slide.objective}`,
    outline?.keyPoints?.length || slide.keyPoints?.length
      ? `本页关键点：${(outline?.keyPoints?.length ? outline.keyPoints : slide.keyPoints || []).join('；')}`
      : '',
    outline?.visualPlan || slide.visualPlan
      ? `本页视觉计划：${outline?.visualPlan || slide.visualPlan}`
      : '',
    slide.mandatoryVisibleContent?.length
      ? `本页必需可见内容：${slide.mandatoryVisibleContent.join('；')}`
      : outline?.mandatoryVisibleContent?.length
        ? `本页必需可见内容：${outline.mandatoryVisibleContent.join('；')}`
        : '',
    outline?.optionalContent?.length
      ? `规划层可压缩/可删除内容：${outline.optionalContent.join('；')}`
      : '',
    slide.optionalContent?.length ? `可压缩/可删除内容：${slide.optionalContent.join('；')}` : '',
    outline?.sourceAnchors?.length || slide.sourceAnchors?.length
      ? `源材料锚点：${(outline?.sourceAnchors?.length ? outline.sourceAnchors : slide.sourceAnchors || []).join('；')}`
      : '',
    outline?.sourceUseRationale || slide.sourceUseRationale
      ? `源材料取舍理由：${outline?.sourceUseRationale || slide.sourceUseRationale}`
      : '',
    `画布模式：${
      canvasMode === 'long'
        ? `长页面，宽 1600px，高约 ${canvasHeight}px；允许纵向展开，禁止横向滚动和内容重叠。`
        : canvasMode === 'tall'
          ? `中高课件页，宽 1600px，高约 ${canvasHeight}px；允许比 16:9 更高的正常文档流，禁止横向滚动和内容重叠。`
          : '标准 16:9，1600×900；禁止纵向滚动和内容重叠。'
    }`,
    slide.sourceImageIds?.length
      ? `必须使用的原文图片 ID：${slide.sourceImageIds.join(', ')}`
      : '本页没有分配原文图片，不要虚构 source image。',
    '生成要求：页面只回答本页学习问题；不要加入下一页/上一页的讲稿内容，不要新增第二主题。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildActualHtmlPromptPreview(slide: LessonSlidePlan, plan: LessonPlan): string {
  const routeText = [
    plan.lessonTitle,
    slide.title,
    slide.objective,
    slide.htmlPrompt,
    ...slide.sourceCoverage,
    ...(slide.sourceAnchors || []),
    ...(slide.sourceImageIds || []),
    slide.sourceUseRationale || '',
  ].join('\n');
  const courseRoute = slide.courseRoute || inferHtmlCourseRouteFromText(routeText, slide.pageKind);
  const csRoute =
    courseRoute === 'computer-science'
      ? slide.csRoute || inferHtmlCsRouteFromText(routeText)
      : undefined;
  const mathRoute =
    courseRoute === 'math'
      ? slide.mathRoute || inferHtmlMathRouteFromText(routeText, slide.pageKind)
      : undefined;
  const routeInstruction = [
    `课程路线：${courseRoutePromptLabel(courseRoute)}`,
    csRoute ? `CS 版式：${csRoutePromptLabel(csRoute)}` : '',
    mathRoute ? `数学版式：${mathRoutePromptLabel(mathRoute)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [slide.htmlPrompt, '', buildStructuredSlideContext(slide, plan), '', routeInstruction]
    .filter(Boolean)
    .join('\n');
}

function buildActualHtmlRequestPreview(args: {
  slide: LessonSlidePlan;
  plan: LessonPlan;
  htmlResult?: HtmlSlideResult | null;
  assignedSourceImages: SourcePackageImage[];
}): string {
  const prompt = args.htmlResult?.prompt || buildActualHtmlPromptPreview(args.slide, args.plan);
  const sourceImageSummary = args.assignedSourceImages.length
    ? args.assignedSourceImages.map((image) => sourceImageLabel(image)).join('\n')
    : '无';
  return [
    'prompt 字段：',
    prompt,
    '',
    'densityContract 字段：',
    buildDensityContract(args.slide),
    '',
    'assignedSourceImages：',
    sourceImageSummary,
  ].join('\n');
}

function isTransparentColor(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
}

function hasPaintedBox(style: CSSStyleDeclaration, element: HTMLElement): boolean {
  const borderWidth =
    Number.parseFloat(style.borderTopWidth || '0') +
    Number.parseFloat(style.borderRightWidth || '0') +
    Number.parseFloat(style.borderBottomWidth || '0') +
    Number.parseFloat(style.borderLeftWidth || '0');
  return (
    !isTransparentColor(style.backgroundColor) ||
    style.backgroundImage !== 'none' ||
    style.boxShadow !== 'none' ||
    borderWidth > 0 ||
    ['ARTICLE', 'SECTION', 'FIGURE', 'TABLE', 'PRE', 'FOOTER', 'HEADER', 'MAIN'].includes(
      element.tagName,
    )
  );
}

function evaluateMathRouteStructure(doc: Document, mathRoute?: HtmlMathRoute): string[] {
  if (!mathRoute || mathRoute === 'standard') return [];
  const text = doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  const mathCount = doc.querySelectorAll('math').length;
  const tableCount = doc.querySelectorAll('table').length;
  const stepSignals = (text.match(/(?:步骤|第\s*\d+\s*步|\b[1-5][.、]|①|②|③|④|⑤)/g) || []).length;
  const issues: string[] = [];
  const requireText = (pattern: RegExp, message: string) => {
    if (!pattern.test(text)) issues.push(message);
  };
  const requireMath = (min: number, message: string) => {
    if (mathCount < min) issues.push(message);
  };

  switch (mathRoute) {
    case 'definition-theorem':
      requireText(/定义|定理|命题|判定|对象|符号/, '定义/定理页缺少数学入口。');
      requireText(/条件|假设|当且仅当|满足/, '定义/定理页缺少条件或假设。');
      requireText(/结论|读法|因此|所以|例|检查/, '定义/定理页缺少结论、例子或检查点。');
      requireMath(1, '定义/定理页缺少 MathML 公式/符号块。');
      break;
    case 'formula-focus':
      requireMath(1, '公式页缺少主 MathML 公式。');
      requireText(/符号|含义|条件|使用|代入|解释/, '公式页缺少符号解释或使用条件。');
      break;
    case 'derivation':
      requireMath(3, '推导页 MathML 推导行不足 3 个。');
      if (stepSignals < 2) issues.push('推导页缺少分步结构。');
      requireText(/因为|由|代入|得到|所以|化简|归一化|两边/, '推导页缺少每步理由。');
      break;
    case 'proof':
      requireMath(2, '证明页 MathML 公式/符号判断不足。');
      requireText(/证明目标|要证|假设|条件|构造|结论|证毕/, '证明页缺少目标、假设、构造或结论。');
      break;
    case 'worked-example':
      requireMath(2, '例题页 MathML 公式/符号块不足。');
      requireText(/题干|问题|求|已知|给定|输入/, '例题页缺少题干或已知条件。');
      if (stepSignals < 2) issues.push('例题页缺少 2 个以上求解步骤。');
      requireText(/答案|结果|结论|检查|验证/, '例题页缺少答案/结果/检查。');
      break;
    case 'concept-map':
      requireText(
        /定义|条件|结论|例子|关系|推出|属于|等价|偏序|映射/,
        '概念图缺少数学节点或关系词。',
      );
      requireText(/→|->|到|推出|对应|包含|分成|连接|关系/, '概念图缺少关系边或连接说明。');
      break;
    case 'comparison-table':
      if (tableCount < 1) issues.push('对比页没有使用真实 HTML table。');
      requireText(
        /条件|适用|场景|结论|反例|比较|对比|情况/,
        '对比表缺少条件、适用场景或结论维度。',
      );
      break;
    default:
      break;
  }

  return Array.from(new Set(issues)).slice(0, 5);
}

function evaluatePreview(
  iframe: HTMLIFrameElement | null,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
  mathRoute?: HtmlMathRoute,
): PreviewStats {
  const doc = iframe?.contentDocument;
  if (!doc) return emptyPreviewStats();
  const body = doc.body;
  const slide = doc.querySelector('.slide');
  const slideContent = doc.querySelector('.slide-content');
  const outOfBoundsSamples: string[] = [];
  const clippedSamples: string[] = [];
  const overlapSamples: string[] = [];
  let outOfBoundsCount = 0;
  let clippedCount = 0;
  let overlapCount = 0;

  const elementLabel = (element: HTMLElement) => {
    const className = typeof element.className === 'string' ? `.${element.className}` : '';
    return `${element.tagName.toLowerCase()}${className.split(/\s+/).slice(0, 2).join('.')}`;
  };

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const maxBottom = canvasMode === 'slide' ? 900.5 : canvasHeight + 80;
    const overflow =
      rect.left < -0.5 || rect.top < -0.5 || rect.right > 1600.5 || rect.bottom > maxBottom;
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

  const layoutRoot = (slideContent as HTMLElement | null) || body;
  const candidates = Array.from(
    layoutRoot.querySelectorAll<HTMLElement>(
      'section, article, div, figure, table, pre, header, main, footer, aside',
    ),
  )
    .filter((element) => {
      if (element === slide || element === slideContent) return false;
      const style = doc.defaultView?.getComputedStyle(element);
      if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
      if (!hasPaintedBox(style, element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 60 || rect.height < 36 || rect.width * rect.height < 8000) return false;
      const hasText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
      const hasVisualChild = Boolean(element.querySelector('img,math,table,pre,code'));
      return hasText || hasVisualChild;
    })
    .map((element) => ({
      element,
      label: elementLabel(element),
      rect: element.getBoundingClientRect(),
    }));

  for (let index = 0; index < candidates.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex += 1) {
      const first = candidates[index];
      const second = candidates[otherIndex];
      if (!first || !second) continue;
      if (first.element.contains(second.element) || second.element.contains(first.element)) {
        continue;
      }
      const left = Math.max(first.rect.left, second.rect.left);
      const top = Math.max(first.rect.top, second.rect.top);
      const right = Math.min(first.rect.right, second.rect.right);
      const bottom = Math.min(first.rect.bottom, second.rect.bottom);
      const width = right - left;
      const height = bottom - top;
      if (width <= 12 || height <= 12) continue;
      const overlapArea = width * height;
      const firstArea = first.rect.width * first.rect.height;
      const secondArea = second.rect.width * second.rect.height;
      if (overlapArea < 1200 || overlapArea < Math.min(firstArea, secondArea) * 0.04) continue;
      overlapCount += 1;
      if (overlapSamples.length < 5) {
        overlapSamples.push(
          `${first.label} ↔ ${second.label} overlap ${Math.round(left)},${Math.round(top)}-${Math.round(right)},${Math.round(bottom)}`,
        );
      }
    }
  }

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let textNodeCount = 0;
  let visibleCharCount = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!text) continue;
    textNodeCount += 1;
    visibleCharCount += text.length;
  }
  const mathRouteIssueSamples = evaluateMathRouteStructure(doc, mathRoute);

  return {
    scrollWidth: Math.max(body.scrollWidth, doc.documentElement.scrollWidth),
    scrollHeight: Math.max(body.scrollHeight, doc.documentElement.scrollHeight),
    slideCount: doc.querySelectorAll('.slide').length,
    hasSlideContent: Boolean(slide && slideContent),
    outOfBoundsCount,
    outOfBoundsSamples,
    clippedCount,
    clippedSamples,
    overlapCount,
    overlapSamples,
    mathRouteIssueCount: mathRouteIssueSamples.length,
    mathRouteIssueSamples,
    textNodeCount,
    visibleCharCount,
    mathCount: doc.querySelectorAll('math').length,
    tableCount: doc.querySelectorAll('table').length,
    preCount: doc.querySelectorAll('pre').length,
  };
}

function getPreviewStatus(
  stats: PreviewStats,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
): 'pass' | 'fail' | 'empty' {
  if (stats.scrollWidth <= 0 || stats.scrollHeight <= 0) return 'empty';
  const scrollHeightOk =
    canvasMode === 'slide' ? stats.scrollHeight <= 901 : stats.scrollHeight <= canvasHeight + 120;
  if (
    stats.slideCount === 1 &&
    stats.hasSlideContent &&
    stats.scrollWidth <= 1601 &&
    scrollHeightOk &&
    stats.outOfBoundsCount === 0 &&
    stats.clippedCount === 0 &&
    stats.overlapCount === 0 &&
    stats.mathRouteIssueCount === 0
  ) {
    return 'pass';
  }
  return 'fail';
}

function buildPreviewQualityFeedback(
  stats: PreviewStats,
  htmlResult?: HtmlSlideResult | null,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
): string {
  const lines: string[] = [];
  if (
    stats.scrollWidth > 1601 ||
    (canvasMode === 'slide' ? stats.scrollHeight > 901 : stats.scrollHeight > canvasHeight + 120)
  ) {
    lines.push(
      canvasMode === 'slide'
        ? `滚动尺寸异常：${stats.scrollWidth}×${stats.scrollHeight}，目标是 1600×900。`
        : `滚动尺寸异常：${stats.scrollWidth}×${stats.scrollHeight}，目标是宽 1600、高约 ${canvasHeight} 的${canvasMode === 'tall' ? '中高课件页' : '长页面'}。`,
    );
  }
  if (stats.outOfBoundsCount > 0) {
    lines.push(`越界元素 ${stats.outOfBoundsCount} 个：${stats.outOfBoundsSamples.join(' / ')}`);
  }
  if (stats.clippedCount > 0) {
    lines.push(`裁切风险 ${stats.clippedCount} 个：${stats.clippedSamples.join(' / ')}`);
  }
  if (stats.overlapCount > 0) {
    lines.push(`内容块重叠 ${stats.overlapCount} 组：${stats.overlapSamples.join(' / ')}`);
  }
  if (stats.mathRouteIssueCount > 0) {
    lines.push(`数学版式结构不足：${stats.mathRouteIssueSamples.join(' / ')}`);
  }
  const sourceUsage = htmlResult?.sourceImageUsage;
  if (sourceUsage?.missingIds.length) {
    lines.push(`缺少分配的原文图片：${sourceUsage.missingIds.join(', ')}`);
  }
  if (sourceUsage?.inventedIds.length) {
    lines.push(`引用了未分配图片 ID：${sourceUsage.inventedIds.join(', ')}`);
  }
  if (!lines.length) return '';
  return [
    '本地 iframe QA 失败，必须重写布局：',
    ...lines.map((line) => `- ${line}`),
    '- 禁止用 absolute/fixed/sticky/z-index 把底部卡片、例子卡、插图卡或结论条叠到主内容上。',
    canvasMode === 'slide'
      ? '- 必须改成正常 flex/grid flow：header / main / footer 三段或两行 grid；每个内容区都占用自己的行列。'
      : '- 本页已经允许更高画布，必须改成纵向 section 正常文档流；不要再把结果、检查点或底部条覆盖到中间内容上。',
    stats.mathRouteIssueCount > 0
      ? '- 如果本页是数学专属版式，必须补齐该版式可验出的数学结构：定义/条件/结论、推导阶梯、例题步骤、证明目标或对比表。'
      : '',
  ].join('\n');
}

export default function GenerationHtmlNotebookTestPage() {
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
  const [jobsBySlide, setJobsBySlide] = useState<Record<string, HtmlSlideGenerationJob>>({});
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
        `/api/generation-quality/testfile-fixtures?mode=subject-notebooks&ts=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      const notebooks = data.notebooks || data.fixtures || [];
      if (!response.ok || data.success === false || notebooks.length === 0) {
        setFixtureError(
          buildErrorResult(
            data,
            response.status,
            `读取文件 notebook fixtures 失败：HTTP ${response.status}`,
          ),
        );
        return;
      }
      setFixtures(notebooks);
      setSelectedFixtureId((previous) =>
        previous && notebooks.some((fixture) => fixture.id === previous)
          ? previous
          : notebooks[0]?.id || '',
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
        setJobsBySlide(saved.jobsBySlide || {});
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
        jobsBySlide,
        planErrorsByKey,
      }).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    errorsBySlide,
    htmlBySlide,
    isHydrated,
    jobsBySlide,
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
  const currentSlideIndex =
    currentPlan && currentSlide
      ? currentPlan.plan.slides.findIndex((slide) => slide.id === currentSlide.id)
      : -1;
  const currentSlideOutline =
    currentPlan && currentSlideIndex >= 0
      ? currentPlan.plan.slideOutlines?.[currentSlideIndex] || null
      : null;
  const previousSlide =
    currentPlan && currentSlideIndex > 0 ? currentPlan.plan.slides[currentSlideIndex - 1] : null;
  const nextSlide =
    currentPlan && currentSlideIndex >= 0
      ? currentPlan.plan.slides[currentSlideIndex + 1] || null
      : null;
  const generatingSlideIdSet = useMemo(() => new Set(generatingSlideIds), [generatingSlideIds]);
  const currentSlideKey =
    currentPlan && currentSlide ? buildSlideKey(currentPlan.signature, currentSlide.id) : '';
  const currentHtmlResult = currentSlideKey ? htmlBySlide[currentSlideKey] || null : null;
  const actualHtmlRequestPreview =
    currentPlan && currentSlide
      ? buildActualHtmlRequestPreview({
          slide: currentSlide,
          plan: currentPlan.plan,
          htmlResult: currentHtmlResult,
          assignedSourceImages: getAssignedSourceImages(selectedFixture, currentSlide),
        })
      : '';
  const currentSourceUseRationale =
    currentSlide?.sourceUseRationale || currentSlideOutline?.sourceUseRationale || '';
  const currentSlideError = currentSlideKey ? errorsBySlide[currentSlideKey] || null : null;
  const currentSlideJob = currentSlideKey ? jobsBySlide[currentSlideKey] || null : null;
  const currentCanvasMode = getSlideCanvasMode(currentHtmlResult?.slide || currentSlide);
  const currentCanvasHeight = getSlideCanvasHeight(currentHtmlResult?.slide || currentSlide);
  const safePreviewStats = useMemo(() => normalizePreviewStats(previewStats), [previewStats]);
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
  const slideJobSummary = currentPlan
    ? currentPlan.plan.slides.reduce(
        (summary, slide) => {
          const job = jobsBySlide[buildSlideKey(currentPlan.signature, slide.id)];
          if (!job) return summary;
          if (job.status === 'queued') summary.queuedCount += 1;
          if (job.status === 'running') summary.runningCount += 1;
          if (job.status === 'failed') summary.failedCount += 1;
          if (job.status === 'succeeded') summary.succeededCount += 1;
          if (job.status === 'skipped') summary.skippedCount += 1;
          return summary;
        },
        {
          queuedCount: 0,
          runningCount: 0,
          failedCount: 0,
          succeededCount: 0,
          skippedCount: 0,
        },
      )
    : {
        queuedCount: 0,
        runningCount: 0,
        failedCount: 0,
        succeededCount: 0,
        skippedCount: 0,
      };
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
  const sourceImageCount = selectedFixture?.sourcePackage?.sourceImages?.length || 0;
  const sourceImageUsageCount = currentPlan
    ? currentPlan.plan.slides.reduce((sum, slide) => sum + (slide.sourceImageIds?.length || 0), 0)
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
      const nextScale =
        currentCanvasMode !== 'slide'
          ? rect.width / 1600
          : Math.min(rect.width / 1600, rect.height / 900);
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
  }, [currentCanvasMode, currentSlideKey, currentHtmlResult]);

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

  const handleSelectPreviousSlide = useCallback(() => {
    if (!previousSlide) return;
    setSelectedSlideId(previousSlide.id);
  }, [previousSlide, setSelectedSlideId]);

  const handleSelectNextSlide = useCallback(() => {
    if (!nextSlide) return;
    setSelectedSlideId(nextSlide.id);
  }, [nextSlide, setSelectedSlideId]);

  const generatePlan = useCallback(async (): Promise<LessonPlanResult | null> => {
    if (!selectedFixture) return null;
    const key = buildPlanKey(selectedFixture.id, selectedTier);
    const startedAt = Date.now();
    setIsPlanning(true);
    setRunMessage('正在规划整本 notebook 大纲和每页 HTML prompt...');
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
          mode: 'notebook',
          fixtureId: selectedFixture.id,
          fileName: selectedFixture.fileName,
          fileType: selectedFixture.fileType,
          subject: selectedFixture.subject || selectedFixture.title,
          sourceFileCount: selectedFixture.fileCount || selectedFixture.sourceFiles?.length || 0,
          title: selectedFixture.title,
          description: selectedFixture.description,
          sourceTextLength: selectedFixture.sourceTextLength,
          pageCountTier: selectedTier,
          pageBudgetTier: selectedTier,
          imageUsePolicy: selectedFixture.sourcePackage?.sourceImages?.length
            ? 'prefer-source-images'
            : 'text-first',
          sourcePages: sourcePagesFromFixture(selectedFixture),
          sourcePackage: selectedFixture.sourcePackage,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as LessonPlanResponse;
      if (!response.ok || data.success === false || !data.plan?.slides?.length) {
        setPlanErrorsByKey((previous) => ({
          ...previous,
          [key]: buildErrorResult(
            data,
            response.status,
            `整本 notebook 规划失败：HTTP ${response.status}`,
          ),
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
      options?: { silentProgress?: boolean; qualityFeedback?: string },
    ): Promise<boolean> => {
      const key = buildSlideKey(planResult.signature, slide.id);
      const startedAt = Date.now();
      const silentProgress = Boolean(options?.silentProgress);
      const sourceFixture =
        fixtures.find((fixture) => fixture.id === planResult.fixtureId) || selectedFixture;
      const assignedSourceImages = getAssignedSourceImages(sourceFixture, slide);
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
      setJobsBySlide((previous) => {
        const previousJob = previous[key];
        return {
          ...previous,
          [key]: {
            status: 'running',
            queuedAt: previousJob?.queuedAt || startedAt,
            startedAt,
            message: `正在生成第 ${slide.order} 页 HTML`,
          },
        };
      });

      try {
        const routeText = [
          planResult.plan.lessonTitle,
          slide.title,
          slide.objective,
          slide.htmlPrompt,
          ...slide.sourceCoverage,
          ...(slide.sourceAnchors || []),
          ...(slide.sourceImageIds || []),
          slide.sourceUseRationale || '',
          ...assignedSourceImages.map((image) => image.description || sourceImageLabel(image)),
        ].join('\n');
        const courseRoute =
          slide.courseRoute || inferHtmlCourseRouteFromText(routeText, slide.pageKind);
        const csRoute =
          courseRoute === 'computer-science'
            ? slide.csRoute || inferHtmlCsRouteFromText(routeText)
            : undefined;
        const mathRoute =
          courseRoute === 'math'
            ? slide.mathRoute || inferHtmlMathRouteFromText(routeText, slide.pageKind)
            : undefined;
        const codeRoute =
          csRoute === 'memory-diagram'
            ? 'memory-trace'
            : csRoute === 'execution-trace'
              ? 'execution-trace'
              : slide.pageKind === 'code'
                ? inferHtmlCodeRouteFromText(routeText)
                : undefined;
        const routeInstruction = [
          `课程路线：${courseRoutePromptLabel(courseRoute)}`,
          csRoute ? `CS 版式：${csRoutePromptLabel(csRoute)}` : '',
          mathRoute ? `数学版式：${mathRoutePromptLabel(mathRoute)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        const htmlPrompt = [
          slide.htmlPrompt,
          '',
          buildStructuredSlideContext(slide, planResult.plan),
          '',
          routeInstruction,
        ]
          .filter(Boolean)
          .join('\n');
        const canvasMode = getSlideCanvasMode(slide);
        const canvasHeight = getSlideCanvasHeight(slide);
        const response = await backendFetchWithTimeout(
          '/api/generate/html-ppt-slide',
          {
            method: 'POST',
            headers: getHtmlLessonTestHeaders(),
            body: JSON.stringify({
              prompt: htmlPrompt,
              pageKind: slide.pageKind,
              canvasMode,
              canvasHeight,
              codeRoute,
              courseRoute,
              csRoute,
              mathRoute,
              densityContract: buildDensityContract(slide),
              qualityFeedback: options?.qualityFeedback,
              assignedSourceImages,
              imageAsset: imageAsset
                ? {
                    src: IMAGE_ASSET_TOKEN,
                    alt: `${slide.title} AI 插图`,
                    description: imageAsset.prompt,
                    aspectRatio: '4:3',
                  }
                : undefined,
            }),
          },
          HTML_SLIDE_REQUEST_TIMEOUT_MS,
        );
        const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
        if (!response.ok || data.success === false || !data.html) {
          const errorResult = buildErrorResult(
            data,
            response.status,
            `HTML 生成失败：HTTP ${response.status}`,
          );
          setErrorsBySlide((previous) => ({
            ...previous,
            [key]: errorResult,
          }));
          setJobsBySlide((previous) => ({
            ...previous,
            [key]: {
              status: 'failed',
              queuedAt: previous[key]?.queuedAt,
              startedAt,
              completedAt: Date.now(),
              durationMs: Date.now() - startedAt,
              message: errorResult.message,
              details: errorResult.details,
            },
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
            assignedSourceImages,
            sourceImageUsage: data.sourceImageUsage,
            ...htmlStats,
            durationMs: Date.now() - startedAt,
            createdAt: Date.now(),
          },
        }));
        setJobsBySlide((previous) => ({
          ...previous,
          [key]: {
            status: 'succeeded',
            queuedAt: previous[key]?.queuedAt,
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            message: `第 ${slide.order} 页 HTML 已生成`,
          },
        }));
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorResult: GenerationErrorResult = {
          ...buildUnknownErrorResult(error),
          details:
            message === 'Failed to fetch'
              ? '浏览器没有拿到 API 响应。常见原因是请求体过大、开发服务器连接被中断，或本地 API 进程暂时不可用。本次已避免再发送整本 sourceImageMapping，只发送当前页分配到的原文图片。'
              : undefined,
        };
        setErrorsBySlide((previous) => ({
          ...previous,
          [key]: errorResult,
        }));
        setJobsBySlide((previous) => ({
          ...previous,
          [key]: {
            status: 'failed',
            queuedAt: previous[key]?.queuedAt,
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            message: errorResult.message,
            details: errorResult.details,
          },
        }));
        return false;
      } finally {
        setGeneratingSlideIds((previous) => previous.filter((id) => id !== slide.id));
        if (!silentProgress) setRunMessage('');
      }
    },
    [fixtures, imageProviderId, selectedFixture, selectedImageModelId],
  );

  const handleGeneratePlanOnly = useCallback(() => {
    void generatePlan();
  }, [generatePlan]);

  const handleGenerateCurrentSlide = useCallback(() => {
    if (!currentPlan || !currentSlide) return;
    const currentPreviewStatus = getPreviewStatus(
      safePreviewStats,
      currentCanvasMode,
      currentCanvasHeight,
    );
    const currentSourceImageIssue = Boolean(
      currentHtmlResult?.sourceImageUsage &&
      (currentHtmlResult.sourceImageUsage.missingIds.length > 0 ||
        currentHtmlResult.sourceImageUsage.inventedIds.length > 0),
    );
    const qualityFeedback =
      currentHtmlResult && (currentPreviewStatus === 'fail' || currentSourceImageIssue)
        ? buildPreviewQualityFeedback(
            safePreviewStats,
            currentHtmlResult,
            currentCanvasMode,
            currentCanvasHeight,
          )
        : '';
    void generateSlide(currentPlan, currentSlide, { qualityFeedback });
  }, [
    currentCanvasHeight,
    currentCanvasMode,
    currentHtmlResult,
    currentPlan,
    currentSlide,
    generateSlide,
    safePreviewStats,
  ]);

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
            name: 'HTML 整本笔记本生成测试',
            sceneTitle: currentHtmlResult.slide.title,
            sceneOrder: currentHtmlResult.slide.order,
            sceneType: 'generation-html-notebook-test',
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
      const queuedAt = Date.now();

      setJobsBySlide((previous) => {
        const next = { ...previous };
        for (const slide of slides) {
          const key = buildSlideKey(planResult.signature, slide.id);
          next[key] = {
            status: 'queued',
            queuedAt,
            message: `等待生成第 ${slide.order} 页 HTML`,
          };
        }
        return next;
      });

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
    if (planResult.rawResponse.planningQuality?.passed === false) {
      setRunMessage('规划 QA 未通过，已暂停 HTML 并行生成。请先查看课程规划层里的失败项。');
      return;
    }
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
    setSelectedSlideIdByPlan((previous) => {
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
      setJobsBySlide((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(signature))),
      );
    }
  }, [currentPlan, currentPlanKey]);

  const previewStatus = getPreviewStatus(safePreviewStats, currentCanvasMode, currentCanvasHeight);
  const hasSourceImageContractIssue = Boolean(
    currentHtmlResult?.sourceImageUsage &&
    (currentHtmlResult.sourceImageUsage.missingIds.length > 0 ||
      currentHtmlResult.sourceImageUsage.inventedIds.length > 0),
  );
  const effectivePreviewStatus =
    previewStatus === 'pass' && !hasSourceImageContractIssue ? 'pass' : previewStatus;
  const isBusy =
    isPlanning ||
    generatingSlideIds.length > 0 ||
    slideJobSummary.queuedCount > 0 ||
    slideJobSummary.runningCount > 0 ||
    isGeneratingImageAsset;
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

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(340px,3fr)_minmax(0,7fr)]">
          <aside className="min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-3rem)]">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">整本笔记本设置</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                选择 testfile/科目测试 下的单个文件和页数档位，先让 AI 分配整本 notebook
                的页面容量。
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
                  规划阶段决定页面容量；HTML 生成阶段一次最多并发{' '}
                  {HTML_SLIDE_GENERATION_CONCURRENCY} 页，完成后会继续跑后续页面。
                </div>

                <div className="grid gap-2">
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
                    const isRunning =
                      generatingSlideIdSet.has(slide.id) || job?.status === 'running';
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
                        <Badge variant={currentCanvasMode !== 'slide' ? 'secondary' : 'outline'}>
                          {canvasModeLabel(currentSlide)}
                        </Badge>
                        {currentSlide.courseRoute ? (
                          <Badge variant="outline">
                            {courseRoutePromptLabel(currentSlide.courseRoute)}
                          </Badge>
                        ) : null}
                        {currentSlide.csRoute ? (
                          <Badge variant="outline">
                            {csRoutePromptLabel(currentSlide.csRoute)}
                          </Badge>
                        ) : null}
                        {currentSlide.mathRoute ? (
                          <Badge variant="outline">
                            {mathRoutePromptLabel(currentSlide.mathRoute)}
                          </Badge>
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
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                      {currentSlideJob.details}
                    </p>
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
                          <Badge
                            key={id}
                            variant="outline"
                            className="border-emerald-200 text-emerald-700"
                          >
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
                    currentCanvasMode !== 'slide'
                      ? 'overflow-auto'
                      : 'aspect-video overflow-hidden',
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
                      {currentSlideJob?.status === 'running' ||
                      currentSlideJob?.status === 'queued' ? (
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
                      {safePreviewStats.textNodeCount} text · {safePreviewStats.visibleCharCount}{' '}
                      chars
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

            {currentPlan ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <FileCode2 className="size-4 text-slate-500" />
                      <h2 className="text-sm font-semibold">规划生成 prompt</h2>
                    </div>
                    <p className="mb-3 text-xs leading-5 text-slate-500">
                      这是 lesson plan 阶段写入 slides[].htmlPrompt
                      的内容，代表规划层希望这一页怎么讲。
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
                          <p className="mt-1 text-blue-950">
                            {currentPlan.plan.coursePlan.courseGoal}
                          </p>
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
                      <div className="text-xs font-semibold text-slate-500">
                        整本 notebook 规划备注
                      </div>
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
          </div>
        </section>
      </div>
    </main>
  );
}
