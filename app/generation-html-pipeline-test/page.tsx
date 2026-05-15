'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  FileText,
  ImageIcon,
  Layers3,
  LockKeyhole,
  Loader2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
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
import type { SceneOutline } from '@/lib/types/generation';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';

const HTML_PIPELINE_MODEL = 'gpt-5.4';
const TEST_RESULT_ID = 'html-pipeline';
const HTML_SLIDE_GENERATION_CONCURRENCY = 2;
const HTML_SLIDE_REQUEST_TIMEOUT_MS = 210_000;

type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
type CheckStatus = 'pass' | 'warn' | 'fail';
type PipelineStepState = 'locked' | 'ready' | 'running' | 'pass' | 'warn' | 'fail';
type PipelineStepId =
  | 'source'
  | 'course-plan'
  | 'slide-outlines'
  | 'html-prompts'
  | 'cover-page'
  | 'html-pages';

interface SourcePackagePage {
  sourceIndex: number;
  title: string;
  summary: string;
  rawText?: string;
  keyPoints: string[];
  concreteAnchor: string;
  sourceLabel: string;
  suggestedPageKind: string;
  imageIds?: string[];
}

interface SourcePackageImage {
  id: string;
  src?: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

interface SourcePackageImageStats {
  rawCount: number;
  keptCount: number;
  filteredSmallCount: number;
  filteredLargeCount: number;
  filteredLimitCount: number;
}

interface SourcePackage {
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  sourceText: string;
  sourcePages: SourcePackagePage[];
  sourceImages: SourcePackageImage[];
  imageMapping?: Record<string, string>;
  imageStats?: SourcePackageImageStats;
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
  canvasMode?: string;
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

interface LessonSlidePlan {
  id: string;
  order: number;
  title: string;
  pageKind: string;
  canvasMode?: string;
  canvasHeight?: number;
  courseRoute?: string;
  csRoute?: string;
  mathRoute?: string;
  density: string;
  objective: string;
  learnerQuestion?: string;
  sourceCoverage: string[];
  sourceAnchors?: string[];
  sourceImageIds?: string[];
  sourceUseRationale?: string;
  visualPlan?: string;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
  htmlPrompt: string;
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
  planningQuality?: PlanningQualityReport | null;
  planningRetryCount?: number;
  planningRetryReasons?: PlanningQualityIssue[];
  error?: string;
  details?: string;
}

interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

interface HtmlCostEstimate {
  baseUsd?: number | null;
  retailUsd?: number | null;
  computeCredits?: number | null;
  markupMultiplier?: number | null;
  source?: string;
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

interface PipelineCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

interface HtmlPageResult {
  slideId: string;
  slideTitle: string;
  order: number;
  html: string;
  htmlLength: number;
  elementCount: number;
  textNodeCount: number;
  durationMs: number;
  canvasMode: string;
  canvasHeight: number;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  sourceImageUsage?: GenerateHtmlPptResponse['sourceImageUsage'];
  createdAt: number;
}

interface HtmlPageError {
  slideId: string;
  slideTitle: string;
  order: number;
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

interface SavedPipelinePayload {
  mode: 'notebook';
  fixtureId: string;
  fixtureTitle: string;
  tier: PageCountTier;
  generatedAt: number;
  checks: Record<string, PipelineCheck[]>;
  plan?: LessonPlan;
  planningQuality?: PlanningQualityReport | null;
  coverPage?: HtmlPageResult | null;
  coverPageError?: HtmlPageError | null;
  htmlPages?: Record<string, HtmlPageResult>;
  htmlPageErrors?: Record<string, HtmlPageError>;
}

const TIER_OPTIONS: Array<{ value: PageCountTier; label: string }> = [
  { value: 'under5', label: '5 页以下' },
  { value: 'under10', label: '10 页以下' },
  { value: 'under20', label: '20 页以下' },
  { value: 'over20', label: '20 页以上' },
];

const PIPELINE_STEP_LABELS: Record<
  PipelineStepId,
  { order: number; title: string; artifact: string }
> = {
  source: {
    order: 1,
    title: 'Source Package',
    artifact: 'sourcePackage / sourcePages / sourceImages',
  },
  'course-plan': {
    order: 2,
    title: 'coursePlan',
    artifact: 'courseGoal / narrativeArc / coreQuestions',
  },
  'slide-outlines': {
    order: 3,
    title: 'slideOutlines',
    artifact: 'learnerQuestion / sourceAnchors / visualPlan',
  },
  'html-prompts': {
    order: 4,
    title: 'slides[].htmlPrompt',
    artifact: 'pageKind / canvasMode / mandatoryVisibleContent',
  },
  'cover-page': {
    order: 5,
    title: '封面页视觉',
    artifact: 'cover HTML / built-in background / title-only',
  },
  'html-pages': {
    order: 6,
    title: 'HTML 页面生成',
    artifact: '整本 notebook 输出回归',
  },
};

function getPipelineHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_PIPELINE_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function pipelineResultKey(fixtureId: string, tier: PageCountTier): string {
  return `notebook:${fixtureId}:${tier}`;
}

function formatSavedAt(value: string | number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function getSlideCanvasMode(slide: Pick<LessonSlidePlan, 'canvasMode'>): string {
  if (slide.canvasMode === 'long') return 'long';
  if (slide.canvasMode === 'tall') return 'tall';
  return 'slide';
}

function getSlideCanvasHeight(slide: Pick<LessonSlidePlan, 'canvasMode' | 'canvasHeight'>): number {
  const mode = getSlideCanvasMode(slide);
  if (mode === 'slide') return 900;
  if (mode === 'tall') {
    const height = typeof slide.canvasHeight === 'number' ? slide.canvasHeight : 1200;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const height = typeof slide.canvasHeight === 'number' ? slide.canvasHeight : 2200;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatCost(value?: HtmlCostEstimate | null): string {
  if (!value) return '-';
  if (typeof value.computeCredits === 'number') return `${value.computeCredits.toFixed(2)} credits`;
  if (typeof value.retailUsd === 'number') return `$${value.retailUsd.toFixed(4)}`;
  return '-';
}

function analyzeHtml(html: string): { elementCount: number; textNodeCount: number } {
  const elementCount = (html.match(/<([a-z][a-z0-9-]*)(\s|>)/gi) || []).length;
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textNodeCount = text ? text.split(/[。！？.!?]\s+|\n+/).filter(Boolean).length : 0;
  return { elementCount, textNodeCount };
}

function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasCoverVisualBackground(html: string): boolean {
  const text = html.toLowerCase();
  const hasBuiltInImage = /\/slide-backgrounds\/|built_in_hero_background/.test(text);
  const hasGradient = /\b(?:linear|radial|conic)-gradient\s*\(/i.test(html);
  const hasBackgroundImage = /background(?:-image)?\s*:\s*(?!\s*(?:#fff|#ffffff|white)\b)/i.test(
    html,
  );
  const hasVisualLayer =
    /class=["'][^"']*(?:hero|cover|visual|backdrop|glow|mesh|grid|network|poster|cinematic)[^"']*["']/i.test(
      html,
    );
  return hasBuiltInImage || hasGradient || (hasBackgroundImage && hasVisualLayer);
}

function hasExternalCoverAsset(html: string): boolean {
  return (
    /\b(?:src|href)\s*=\s*["']https?:\/\//i.test(html) || /url\(\s*["']?https?:\/\//i.test(html)
  );
}

async function requestHtmlSlide(args: {
  fixture: TestfileFixture | null;
  plan: LessonPlan;
  slide: LessonSlidePlan;
}): Promise<{ result?: HtmlPageResult; error?: HtmlPageError }> {
  const startedAt = Date.now();
  try {
    const assignedSourceImages = assignedSourceImagesForSlide(args.fixture, args.slide);
    const canvasMode = getSlideCanvasMode(args.slide);
    const canvasHeight = getSlideCanvasHeight(args.slide);
    const htmlPrompt = [
      args.slide.htmlPrompt,
      '',
      buildStructuredSlideContext(args.slide, args.plan),
    ]
      .filter(Boolean)
      .join('\n');
    const response = await backendFetchWithTimeout(
      '/api/generate/html-ppt-slide',
      {
        method: 'POST',
        headers: getPipelineHeaders(),
        body: JSON.stringify({
          prompt: htmlPrompt,
          pageKind: args.slide.pageKind,
          canvasMode,
          canvasHeight,
          courseRoute: args.slide.courseRoute,
          csRoute: args.slide.csRoute,
          mathRoute: args.slide.mathRoute,
          codeRoute:
            args.slide.csRoute === 'memory-diagram'
              ? 'memory-trace'
              : args.slide.csRoute === 'execution-trace'
                ? 'execution-trace'
                : undefined,
          densityContract: buildDensityContract(args.slide),
          assignedSourceImages,
        }),
      },
      HTML_SLIDE_REQUEST_TIMEOUT_MS,
    );
    const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
    if (!response.ok || data.success === false || !data.html) {
      return {
        error: {
          slideId: args.slide.id,
          slideTitle: args.slide.title,
          order: args.slide.order,
          message: data.error || `HTML 生成失败：HTTP ${response.status}`,
          details: data.details,
          httpStatus: response.status,
          createdAt: Date.now(),
        },
      };
    }
    const stats = analyzeHtml(data.html);
    return {
      result: {
        slideId: args.slide.id,
        slideTitle: args.slide.title,
        order: args.slide.order,
        html: data.html,
        htmlLength: data.html.length,
        elementCount: stats.elementCount,
        textNodeCount: stats.textNodeCount,
        durationMs: Date.now() - startedAt,
        canvasMode,
        canvasHeight,
        usage: data.usage || null,
        costEstimate: data.costEstimate || null,
        generationAttempts: data.generationAttempts,
        retryReasons: data.retryReasons,
        sourceImageUsage: data.sourceImageUsage,
        createdAt: Date.now(),
      },
    };
  } catch (caught) {
    return {
      error: {
        slideId: args.slide.id,
        slideTitle: args.slide.title,
        order: args.slide.order,
        message:
          caught instanceof DOMException && caught.name === 'AbortError'
            ? 'HTML 生成请求超时'
            : caught instanceof Error
              ? caught.message
              : String(caught),
        details:
          caught instanceof DOMException && caught.name === 'AbortError'
            ? `单页生成超过 ${Math.round(HTML_SLIDE_REQUEST_TIMEOUT_MS / 1000)} 秒。`
            : undefined,
        createdAt: Date.now(),
      },
    };
  }
}

function buildDensityContract(slide: LessonSlidePlan): string {
  const required = slide.mandatoryVisibleContent?.length
    ? slide.mandatoryVisibleContent.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : 'No explicit mandatoryVisibleContent was provided; preserve the objective and source anchors.';
  return [
    `Density: ${slide.density || 'standard'}`,
    `Page kind: ${slide.pageKind}`,
    `Canvas: ${getSlideCanvasMode(slide)} ${getSlideCanvasHeight(slide)}px`,
    'Mandatory visible content:',
    required,
  ].join('\n');
}

function buildStructuredSlideContext(slide: LessonSlidePlan, plan: LessonPlan): string {
  return [
    '--- Pipeline slide contract ---',
    `Lesson title: ${plan.lessonTitle}`,
    `Slide ${slide.order}/${plan.pageCount}: ${slide.title}`,
    `Learner question: ${slide.learnerQuestion || 'N/A'}`,
    `Objective: ${slide.objective}`,
    `Page kind: ${slide.pageKind}`,
    `Canvas mode: ${getSlideCanvasMode(slide)} ${getSlideCanvasHeight(slide)}px`,
    `Density: ${slide.density}`,
    slide.sourceCoverage?.length ? `Source coverage:\n${slide.sourceCoverage.join('\n')}` : '',
    slide.sourceAnchors?.length ? `Source anchors:\n${slide.sourceAnchors.join('\n')}` : '',
    slide.sourceUseRationale ? `Source use rationale:\n${slide.sourceUseRationale}` : '',
    slide.mandatoryVisibleContent?.length
      ? `Mandatory visible content:\n${slide.mandatoryVisibleContent.join('\n')}`
      : '',
    slide.optionalContent?.length ? `Optional content:\n${slide.optionalContent.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function assignedSourceImagesForSlide(
  fixture: TestfileFixture | null,
  slide: LessonSlidePlan,
): SourcePackageImage[] {
  const ids = new Set(slide.sourceImageIds || []);
  if (!ids.size) return [];
  return (fixture?.sourcePackage?.sourceImages || []).filter((image) => ids.has(image.id));
}

function sourcePagesFromFixture(fixture: TestfileFixture): SourcePackagePage[] {
  if (fixture.sourcePackage?.sourcePages?.length) return fixture.sourcePackage.sourcePages;
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    sourceLabel: `SceneOutline ${index + 1}`,
    title: outline.title,
    summary: outline.description,
    rawText: [outline.title, outline.description, ...(outline.keyPoints || [])].join('\n'),
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: outline.archetype || 'auto',
    imageIds: [],
  }));
}

function sourceTextFromFixture(fixture: TestfileFixture | null): string {
  if (!fixture) return '';
  return fixture.sourcePackage?.sourceText || '';
}

function sourceTextPreview(fixture: TestfileFixture | null, maxLength = 6000): string {
  const text = sourceTextFromFixture(fixture).trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}\n\n... 已截断预览，完整 sourceText 长度 ${text.length} 字符。`;
}

function expectedSourcePagesForTier(tier: PageCountTier): number {
  if (tier === 'under5') return 4;
  if (tier === 'under10') return 8;
  if (tier === 'under20') return 16;
  return 24;
}

function isSpecificAnchor(value: string): boolean {
  const text = value.trim();
  if (text.length < 8) return false;
  if (/^(源页|第\s*\d+\s*页|page\s*\d+)[:：\s-]*$/i.test(text)) return false;
  return /[:：；,，。()\[\]{}]|[∈⊆×≤≥→↔=]|\d|定义|公式|例|图|表|代码|片段|命题|证明|推导|Figure|class|def|self/i.test(
    text,
  );
}

function makeCheck(
  id: string,
  title: string,
  passed: boolean,
  detail: string,
  warn = false,
): PipelineCheck {
  return { id, title, status: passed ? 'pass' : warn ? 'warn' : 'fail', detail };
}

function evaluateSourcePackage(
  fixture: TestfileFixture | null,
  tier: PageCountTier,
): PipelineCheck[] {
  if (!fixture) {
    return [makeCheck('source-loaded', '源材料已选择', false, '还没有选择 source fixture。')];
  }
  const pages = sourcePagesFromFixture(fixture);
  const sourceText = sourceTextFromFixture(fixture);
  const sourceTextLength = sourceText.length || fixture.sourceTextLength;
  const imageCount = fixture.sourcePackage?.sourceImages?.length || 0;
  const imageStats = fixture.sourcePackage?.imageStats;
  const rawImageCount = imageStats?.rawCount ?? imageCount;
  const filteredImageCount = imageStats
    ? imageStats.filteredSmallCount + imageStats.filteredLargeCount + imageStats.filteredLimitCount
    : 0;
  const sourcePackagePageCount = fixture.sourcePackage?.pageCount || pages.length;
  const expectedPages = Math.min(sourcePackagePageCount, expectedSourcePagesForTier(tier));
  const weakSummaryCount = pages.filter((page) => page.summary.trim().length < 40).length;
  const warningCount = fixture.sourcePackage?.warnings?.length || 0;
  const mappedImageCount = Object.keys(fixture.sourcePackage?.imageMapping || {}).length;
  const sourceFiles = fixture.sourceFiles || [];
  return [
    makeCheck(
      'source-package',
      'sourcePackage 已构建',
      Boolean(fixture.sourcePackage),
      fixture.sourcePackage
        ? `parser=${fixture.sourcePackage.parser || 'fixture-builder'}，pageCount=${sourcePackagePageCount}。`
        : '当前只从 SceneOutline fallback，缺少完整 sourcePackage。',
    ),
    makeCheck(
      'source-pages',
      'sourcePages 数量足够',
      pages.length >= expectedPages,
      `当前读取 sourcePages=${pages.length}，原始段/页=${sourcePackagePageCount}，当前页数档位至少需要 ${expectedPages} 段。`,
    ),
    makeCheck(
      'source-page-coverage',
      'sourcePages 覆盖完整 source',
      pages.length >= sourcePackagePageCount,
      pages.length >= sourcePackagePageCount
        ? `sourcePages 已覆盖全部 ${sourcePackagePageCount} 段。`
        : `sourcePages 只覆盖 ${pages.length}/${sourcePackagePageCount} 段，source 不完整时不能进入 coursePlan。`,
    ),
    makeCheck(
      'source-text',
      '完整 sourceText 可用',
      sourceTextLength >= Math.max(800, fixture.sourceTextLength * 0.8),
      `sourceText=${sourceTextLength || 0} 字符，fixture.sourceTextLength=${fixture.sourceTextLength || 0}。`,
      sourceTextLength > 0,
    ),
    makeCheck(
      'source-page-summaries',
      '每个 sourcePage 有摘要',
      pages.length > 0 && weakSummaryCount === 0,
      weakSummaryCount
        ? `${weakSummaryCount} 个 sourcePage 摘要过短。`
        : `已检查 ${pages.length} 个 sourcePage 摘要。`,
    ),
    makeCheck(
      'notebook-source-files',
      'notebook 源文件已盘点',
      fixture.fileType !== 'notebook' ||
        (sourceFiles.length > 0 && sourceFiles.length >= (fixture.fileCount || 1)),
      fixture.fileType === 'notebook'
        ? `sourceFiles=${sourceFiles.length}，fileCount=${fixture.fileCount || 0}。`
        : '非 notebook fixture 不需要 sourceFiles。',
    ),
    makeCheck(
      'source-images',
      '图片素材已盘点',
      imageCount === 0 || mappedImageCount >= imageCount,
      fixture.fileType === 'notebook'
        ? `notebook sourceImages=${imageCount}/${rawImageCount} 可用，imageMapping=${mappedImageCount}，已过滤 ${filteredImageCount} 张。`
        : `sourceImages=${imageCount}/${rawImageCount} 可用，imageMapping=${mappedImageCount}，已过滤 ${filteredImageCount} 张。`,
      true,
    ),
    makeCheck(
      'source-warnings',
      '解析警告可见',
      warningCount === 0,
      warningCount ? `${warningCount} 条解析/截断 warning 已暴露。` : '没有解析 warning。',
      true,
    ),
  ];
}

function evaluateCoursePlan(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const coursePlan = plan?.coursePlan;
  if (!coursePlan) {
    return [
      makeCheck('course-plan-present', 'coursePlan 已生成', false, '规划响应缺少 coursePlan。'),
    ];
  }
  return [
    makeCheck(
      'course-goal',
      '课程目标具体',
      coursePlan.courseGoal.trim().length >= 24,
      `courseGoal：${coursePlan.courseGoal || '空'}`,
    ),
    makeCheck(
      'narrative-arc',
      '叙事弧线完整',
      coursePlan.narrativeArc.length >= 3,
      `narrativeArc 数量：${coursePlan.narrativeArc.length}。`,
    ),
    makeCheck(
      'core-questions',
      '核心问题足够',
      coursePlan.coreQuestions.length >= 2,
      `coreQuestions 数量：${coursePlan.coreQuestions.length}。`,
    ),
    makeCheck(
      'source-digest',
      '源材料取舍已说明',
      coursePlan.sourceDigest.length >= 2,
      `sourceDigest 数量：${coursePlan.sourceDigest.length}。`,
    ),
  ];
}

function evaluateSlideOutlines(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const outlines = plan?.slideOutlines || [];
  const slides = plan?.slides || [];
  if (!plan) {
    return [makeCheck('slide-outlines-present', 'slideOutlines 已生成', false, '还没有 plan。')];
  }
  const nonCover = outlines.filter((outline) => outline.order !== 1);
  const missingQuestions = nonCover.filter((outline) => !outline.learnerQuestion?.trim()).length;
  const weakAnchors = nonCover.filter(
    (outline) => !(outline.sourceAnchors || []).some(isSpecificAnchor),
  ).length;
  const missingVisualPlan = outlines.filter((outline) => !outline.visualPlan?.trim()).length;
  const hasIntro = slides.length >= 4 && slides[1]?.pageKind === 'intro';
  const hasSummary = slides.length >= 4 && slides[slides.length - 1]?.pageKind === 'summary';
  const hasCover = slides[0]?.pageKind === 'cover';
  return [
    makeCheck(
      'outline-count-match',
      'outline 与 slides 一一对应',
      outlines.length > 0 && outlines.length === slides.length,
      `slideOutlines=${outlines.length}，slides=${slides.length}。`,
    ),
    makeCheck(
      'learner-questions',
      '每页有学生问题',
      missingQuestions === 0,
      missingQuestions
        ? `${missingQuestions} 个正文页缺少 learnerQuestion。`
        : '正文页均有 learnerQuestion。',
    ),
    makeCheck(
      'cover-structure',
      '第 1 页是封面页',
      hasCover,
      `第 1 页 pageKind=${slides[0]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'intro-structure',
      '第 2 页是介绍页',
      hasIntro,
      `第 2 页 pageKind=${slides[1]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'summary-structure',
      '最后 1 页是总结页',
      hasSummary,
      `最后 1 页 pageKind=${slides[slides.length - 1]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'source-anchors',
      '每页绑定具体 sourceAnchors',
      weakAnchors === 0,
      weakAnchors
        ? `${weakAnchors} 个正文页缺少具体 source anchor。`
        : '正文页均有具体 source anchor。',
    ),
    makeCheck(
      'visual-plan',
      '每页有 visualPlan',
      missingVisualPlan === 0,
      missingVisualPlan ? `${missingVisualPlan} 页缺少 visualPlan。` : '每页均有 visualPlan。',
    ),
  ];
}

function evaluateHtmlPrompts(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const slides = plan?.slides || [];
  if (!slides.length) {
    return [makeCheck('html-prompts-present', 'htmlPrompt 已生成', false, 'plan.slides 为空。')];
  }
  const shortPrompts = slides.filter((slide) => slide.htmlPrompt.trim().length < 220).length;
  const missingCanvas = slides.filter(
    (slide) => !/(1600|画布|canvasMode|16:9|长页面|中高课件页)/i.test(slide.htmlPrompt),
  ).length;
  const teachingSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  const missingMandatory = teachingSlides.filter(
    (slide) => !(slide.mandatoryVisibleContent?.length || /必需|必须|保留/.test(slide.htmlPrompt)),
  ).length;
  const weakSourceUse = teachingSlides.filter(
    (slide) => !(slide.sourceUseRationale?.trim() || /源材料取舍|source/i.test(slide.htmlPrompt)),
  ).length;
  return [
    makeCheck(
      'prompt-count',
      '每页有 htmlPrompt',
      slides.every((slide) => Boolean(slide.htmlPrompt?.trim())),
      `slides 数量：${slides.length}。`,
    ),
    makeCheck(
      'prompt-length',
      'prompt 足够可执行',
      shortPrompts === 0,
      shortPrompts ? `${shortPrompts} 页 htmlPrompt 过短。` : '所有 htmlPrompt 都有足够约束。',
    ),
    makeCheck(
      'canvas-contract',
      '包含画布契约',
      missingCanvas === 0,
      missingCanvas
        ? `${missingCanvas} 页缺少 1600/画布/canvasMode 约束。`
        : '每页都包含画布约束。',
    ),
    makeCheck(
      'mandatory-content',
      '包含必需内容清单',
      missingMandatory === 0,
      missingMandatory ? `${missingMandatory} 页缺少必需内容约束。` : '每页都有必需内容约束。',
    ),
    makeCheck(
      'source-rationale',
      '保留源材料取舍理由',
      weakSourceUse === 0,
      weakSourceUse
        ? `${weakSourceUse} 个非封面页缺少源材料取舍说明。`
        : '非封面页都携带源材料取舍理由。',
    ),
  ];
}

function evaluateCoverPage(
  plan: LessonPlan | null | undefined,
  result: HtmlPageResult | null,
  error: HtmlPageError | null,
): PipelineCheck[] {
  const cover = plan?.slides?.[0];
  if (!cover) {
    return [makeCheck('cover-slide-present', '存在封面页规划', false, 'plan.slides[0] 为空。')];
  }
  const coverPrompt = cover.htmlPrompt || '';
  const promptHasBuiltInVisual =
    /tech_hero_title|cinematic_title_frame|academic_hero_cover|image_title_overlay|封面背景|主视觉|\/slide-backgrounds\//.test(
      coverPrompt,
    );
  const promptIsTitleFirst =
    /主标题|大标题|标题/.test(coverPrompt) &&
    /唯一必须|只保留|只包含|文字克制|不要放目录|不展开正文/.test(coverPrompt);
  const visibleText = result ? visibleTextFromHtml(result.html) : '';
  const titleVisible =
    Boolean(result) && normalizeSearchText(visibleText).includes(normalizeSearchText(cover.title));
  const textIsLight =
    Boolean(result) && visibleText.length <= 260 && (result?.textNodeCount ?? 0) <= 8;
  const hasVisualBackground = Boolean(result) && hasCoverVisualBackground(result?.html ?? '');
  const hasExternalAsset = Boolean(result) && hasExternalCoverAsset(result?.html ?? '');
  return [
    makeCheck(
      'cover-slide-present',
      '存在封面页规划',
      cover.pageKind === 'cover',
      `第 1 页 pageKind=${cover.pageKind || '缺'}，title=${cover.title || '缺'}。`,
    ),
    makeCheck(
      'cover-prompt-visual',
      '封面 prompt 指向内置背景',
      promptHasBuiltInVisual,
      promptHasBuiltInVisual
        ? '封面 prompt 已选择内置背景/主视觉语言。'
        : '封面 prompt 缺少 tech/cinematic/academic/image overlay 或内置背景路径。',
    ),
    makeCheck(
      'cover-prompt-title-first',
      '封面 prompt 以标题为主',
      promptIsTitleFirst,
      promptIsTitleFirst
        ? '封面 prompt 明确限制为标题优先、少文字。'
        : '封面 prompt 没有明确“主标题为唯一必需文字/不要展开正文”。',
    ),
    makeCheck(
      'cover-html-generated',
      '封面 HTML 已生成',
      Boolean(result) && !error,
      error ? error.message : result ? '封面 HTML 已生成。' : '还没有生成封面 HTML。',
    ),
    makeCheck(
      'cover-title-visible',
      '封面标题可见',
      titleVisible,
      titleVisible ? '生成结果包含封面标题。' : '生成结果中没有检测到封面标题。',
      !result,
    ),
    makeCheck(
      'cover-background-visible',
      '封面背景/主视觉可见',
      hasVisualBackground,
      hasVisualBackground
        ? '生成结果包含内置背景、渐变或封面主视觉层。'
        : '生成结果没有检测到明显封面背景或主视觉层。',
      !result,
    ),
    makeCheck(
      'cover-text-light',
      '封面文字克制',
      textIsLight,
      result
        ? `可见文本约 ${visibleText.length} 字，文本块 ${result.textNodeCount} 个。`
        : '还没有封面 HTML 可检测。',
      !result,
    ),
    makeCheck(
      'cover-no-external-asset',
      '不依赖外链背景',
      !hasExternalAsset,
      hasExternalAsset ? '封面 HTML 使用了外链资源。' : '没有检测到 http(s) 外链背景/图片。',
      !result,
    ),
  ];
}

function evaluateHtmlPages(
  plan: LessonPlan | null | undefined,
  pages: Record<string, HtmlPageResult>,
  errors: Record<string, HtmlPageError>,
): PipelineCheck[] {
  const slides = plan?.slides || [];
  if (!slides.length) {
    return [makeCheck('html-pages-plan', '有可生成的 slides', false, 'plan.slides 为空。')];
  }
  const generatedCount = slides.filter((slide) => pages[slide.id]).length;
  const errorCount = slides.filter((slide) => errors[slide.id]).length;
  const shortHtmlCount = slides.filter((slide) => {
    const page = pages[slide.id];
    return page && page.htmlLength < 900;
  }).length;
  const lowElementCount = slides.filter((slide) => {
    const page = pages[slide.id];
    return page && page.elementCount < 12;
  }).length;
  return [
    makeCheck(
      'html-page-count',
      '整本 HTML 已生成',
      generatedCount === slides.length,
      `已生成 ${generatedCount}/${slides.length} 页 HTML。`,
    ),
    makeCheck(
      'html-page-errors',
      '没有页面生成错误',
      errorCount === 0,
      errorCount ? `${errorCount} 页生成失败。` : '没有页面生成错误。',
    ),
    makeCheck(
      'html-page-length',
      'HTML 内容非空且足够',
      generatedCount > 0 && shortHtmlCount === 0,
      shortHtmlCount ? `${shortHtmlCount} 页 HTML 过短。` : '已生成页面 HTML 长度正常。',
      generatedCount > 0,
    ),
    makeCheck(
      'html-page-structure',
      'DOM 结构有基本复杂度',
      generatedCount > 0 && lowElementCount === 0,
      lowElementCount ? `${lowElementCount} 页 DOM 元素过少。` : '已生成页面 DOM 结构正常。',
      generatedCount > 0,
    ),
  ];
}

function statusClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function statusIcon(status: CheckStatus) {
  if (status === 'pass') return CheckCircle2;
  if (status === 'warn') return AlertTriangle;
  return XCircle;
}

function hasBlockingFailure(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

function hasWarning(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'warn');
}

function checksToStepState(checks: PipelineCheck[]): PipelineStepState {
  if (hasBlockingFailure(checks)) return 'fail';
  if (hasWarning(checks)) return 'warn';
  return 'pass';
}

function stepBadgeLabel(state: PipelineStepState): string {
  if (state === 'locked') return '锁定';
  if (state === 'ready') return '待测';
  if (state === 'running') return '运行中';
  if (state === 'pass') return '通过';
  if (state === 'warn') return '通过，有警告';
  return '未通过';
}

function stepBadgeClassName(state: PipelineStepState): string {
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  if (state === 'ready') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-700';
}

function StepStatusIcon({ state }: { state: PipelineStepState }) {
  if (state === 'locked') return <LockKeyhole className="size-4" />;
  if (state === 'running') return <Loader2 className="size-4 animate-spin" />;
  if (state === 'pass') return <CheckCircle2 className="size-4" />;
  if (state === 'warn') return <AlertTriangle className="size-4" />;
  if (state === 'fail') return <XCircle className="size-4" />;
  return <PlayCircle className="size-4" />;
}

function PagerControls({
  index,
  total,
  onPrevious,
  onNext,
  unit = '页',
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  unit?: string;
}) {
  const isFirst = index <= 0;
  const isLast = index >= total - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isFirst || total <= 0}
        onClick={onPrevious}
        className="h-9 rounded-lg"
      >
        <ChevronUp className="size-4" />
        上一{unit}
      </Button>
      <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
        {total > 0 ? `${index + 1} / ${total}` : `0 / 0`}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={isLast || total <= 0}
        onClick={onNext}
        className="h-9 rounded-lg"
      >
        <ChevronDown className="size-4" />
        下一{unit}
      </Button>
    </div>
  );
}

function GateCheckList({ checks }: { checks: PipelineCheck[] }) {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-600">Gate checks</span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 font-semibold',
            failed
              ? 'border-red-200 bg-red-50 text-red-700'
              : warned
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {failed ? `${failed} fail` : warned ? `${warned} warn` : 'pass'}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {checks.map((check) => {
          const Icon = statusIcon(check.status);
          return (
            <div
              key={check.id}
              className={cn('rounded-xl border px-3 py-2 text-sm', statusClassName(check.status))}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="size-4" />
                {check.title}
              </div>
              <p className="mt-1 text-xs leading-5 opacity-90">{check.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceEvidencePanel({ fixture }: { fixture: TestfileFixture | null }) {
  const [activeSourcePageIndex, setActiveSourcePageIndex] = useState(0);

  useEffect(() => {
    setActiveSourcePageIndex(0);
  }, [fixture?.id]);

  if (!fixture) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 source fixture。
      </div>
    );
  }

  const pages = sourcePagesFromFixture(fixture);
  const sourcePackage = fixture.sourcePackage;
  const sourceImages = sourcePackage?.sourceImages || [];
  const imageStats = sourcePackage?.imageStats;
  const rawImageCount = imageStats?.rawCount ?? sourceImages.length;
  const filteredSmallImageCount = imageStats?.filteredSmallCount || 0;
  const filteredLargeImageCount = imageStats?.filteredLargeCount || 0;
  const filteredLimitImageCount = imageStats?.filteredLimitCount || 0;
  const filteredImageCount =
    filteredSmallImageCount + filteredLargeImageCount + filteredLimitImageCount;
  const sourceFiles = fixture.sourceFiles || [];
  const warnings = sourcePackage?.warnings || [];
  const sourceText = sourceTextPreview(fixture);
  const boundedSourcePageIndex = pages.length
    ? Math.min(activeSourcePageIndex, pages.length - 1)
    : 0;
  const activeSourcePage = pages[boundedSourcePageIndex] || null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourcePages</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {pages.length}/{sourcePackage?.pageCount || pages.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceText</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {(sourcePackage?.sourceText?.length || fixture.sourceTextLength || 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceFiles</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">{sourceFiles.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceImages</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {sourceImages.length}/{rawImageCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">过滤 {filteredImageCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">warnings</div>
          <div
            className={cn(
              'mt-1 text-lg font-semibold',
              warnings.length ? 'text-amber-700' : 'text-slate-950',
            )}
          >
            {warnings.length}
          </div>
        </div>
      </div>

      {sourceFiles.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500">Notebook source files</div>
          <div className="mt-2 grid gap-2">
            {sourceFiles.map((file) => (
              <div
                key={file.id}
                className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-[1fr_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{file.title}</div>
                  <div className="truncate">{file.fileName}</div>
                </div>
                <div>{file.fileType}</div>
                <div>{file.pageCount} 页/段</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <div className="font-semibold">Source warnings</div>
          <ul className="mt-2 grid gap-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-500">逐页/逐段解析预览</div>
            {activeSourcePage ? (
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {activeSourcePage.sourceLabel || `Source ${activeSourcePage.sourceIndex}`} ·{' '}
                {activeSourcePage.title}
              </div>
            ) : null}
          </div>
          <Badge variant="outline" className="rounded-md">
            {pages.length ? `${boundedSourcePageIndex + 1}/${pages.length}` : '0 段'}
          </Badge>
        </div>
        <div className="mt-3">
          {activeSourcePage ? (
            <div
              key={`${activeSourcePage.sourceLabel}-${activeSourcePage.sourceIndex}`}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-500">
                  {activeSourcePage.sourceLabel || `Source ${activeSourcePage.sourceIndex}`}
                </span>
                <span className="font-semibold text-slate-950">{activeSourcePage.title}</span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                  {activeSourcePage.suggestedPageKind}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{activeSourcePage.summary}</p>
              {activeSourcePage.keyPoints?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeSourcePage.keyPoints.slice(0, 5).map((point) => (
                    <span
                      key={point}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">
                {activeSourcePage.concreteAnchor || '缺少 concreteAnchor'}
              </div>
              <details className="mt-2 rounded-md border border-slate-200 bg-white">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-600">
                  查看这一页/这一段的原始 source
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-100 p-2 font-mono text-[11px] leading-5 text-slate-700">
                  {activeSourcePage.rawText || '当前 sourcePage 没有 rawText；请检查 fixture API。'}
                </pre>
              </details>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              当前 source 没有可预览的 sourcePages。
            </div>
          )}
        </div>
        <div className="mt-3">
          <PagerControls
            index={boundedSourcePageIndex}
            total={pages.length}
            unit="段"
            onPrevious={() => setActiveSourcePageIndex((index) => Math.max(0, index - 1))}
            onNext={() =>
              setActiveSourcePageIndex((index) => Math.min(pages.length - 1, index + 1))
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-500">源文件图片/页面视觉预览</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              {sourceImages.length} 张可用
            </Badge>
            {filteredImageCount ? (
              <Badge
                variant="outline"
                className="rounded-md border-amber-200 bg-amber-50 text-amber-800"
              >
                已过滤 {filteredImageCount} 张
              </Badge>
            ) : null}
          </div>
        </div>
        {imageStats ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>原始 {rawImageCount}</span>
            <span>可用 {sourceImages.length}</span>
            <span>过小 {filteredSmallImageCount}</span>
            <span>过大 {filteredLargeImageCount}</span>
            <span>超出上限 {filteredLimitImageCount}</span>
          </div>
        ) : null}
        <div className="mt-3 grid max-h-[420px] gap-3 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {sourceImages.length ? (
            sourceImages.map((image) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-xs leading-5 text-slate-600"
              >
                {image.src ? (
                  <div className="aspect-video w-full overflow-hidden bg-white">
                    <img
                      src={image.src}
                      alt={image.description || `${image.id} source image`}
                      className="size-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="px-3 py-2">
                  <div className="font-semibold text-slate-950">
                    {image.id} · page {image.pageNumber}
                  </div>
                  <div>{image.description || '无图片描述'}</div>
                  {image.width && image.height ? (
                    <div className="text-slate-500">
                      {image.width}×{image.height}
                      {image.byteLength ? ` · ${Math.round(image.byteLength / 1024)} KB` : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {rawImageCount
                ? `原始 source 解析到 ${rawImageCount} 张图片，但没有达到可复用教学素材阈值；请看上方逐页/逐段解析预览和下方完整文本预览。`
                : '当前 source 没有可复用原文图片；请看上方逐页/逐段解析预览和下方完整文本预览。'}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-500">完整源文件文本预览</div>
          <Badge variant="outline" className="rounded-md">
            sourceText
          </Badge>
        </div>
        <Textarea
          readOnly
          value={sourceText || '当前 fixture 没有暴露 sourcePackage.sourceText。'}
          className="mt-3 min-h-[360px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </div>
    </div>
  );
}

function TextList({
  items,
  empty,
  ordered = false,
}: {
  items: string[];
  empty: string;
  ordered?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
        {empty}
      </div>
    );
  }
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <ListTag className="grid gap-2">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700"
        >
          <span className="mr-2 font-semibold text-slate-950">
            {ordered ? String(index + 1).padStart(2, '0') : '•'}
          </span>
          {item}
        </li>
      ))}
    </ListTag>
  );
}

function CoursePlanReadablePanel({ coursePlan }: { coursePlan: CoursePlan }) {
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
            narrativeArc {coursePlan.narrativeArc.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            coreQuestions {coursePlan.coreQuestions.length}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            sourceDigest {coursePlan.sourceDigest.length}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-950">叙事弧线</h4>
            <Badge variant="secondary" className="rounded-md">
              {coursePlan.narrativeArc.length} 步
            </Badge>
          </div>
          <div className="mt-3">
            <TextList items={coursePlan.narrativeArc} empty="缺少 narrativeArc。" ordered />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-950">源材料取舍</h4>
            <Badge variant="secondary" className="rounded-md">
              {coursePlan.sourceDigest.length} 条
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {coursePlan.sourceDigest.length ? (
              coursePlan.sourceDigest.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700"
                >
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                缺少 sourceDigest。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-950">先修假设</h4>
          <div className="mt-3">
            <TextList
              items={coursePlan.prerequisiteAssumptions}
              empty="未声明 prerequisiteAssumptions。"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-950">节奏策略</h4>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {coursePlan.pacingStrategy || '未声明 pacingStrategy。'}
          </p>
        </section>
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">调试 JSON</summary>
        <Textarea
          readOnly
          value={JSON.stringify(coursePlan, null, 2)}
          className="mt-3 min-h-[220px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </details>
    </div>
  );
}

function PlanningQualityReadablePanel({ report }: { report: PlanningQualityReport }) {
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

function PillList({ items, empty, limit = 6 }: { items: string[]; empty: string; limit?: number }) {
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

function SlideOutlinesReadablePanel({ outlines }: { outlines: SlideTeachingOutline[] }) {
  const [activeOutlineIndex, setActiveOutlineIndex] = useState(0);
  const firstOutlineId = outlines[0]?.id || '';

  useEffect(() => {
    setActiveOutlineIndex(0);
  }, [firstOutlineId, outlines.length]);

  const withAnchors = outlines.filter((outline) => outline.sourceAnchors.length > 0).length;
  const withImages = outlines.filter((outline) => outline.sourceImageIds.length > 0).length;
  const withVisualPlan = outlines.filter((outline) => outline.visualPlan.trim()).length;
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
          onPrevious={() => setActiveOutlineIndex((index) => Math.max(0, index - 1))}
          onNext={() => setActiveOutlineIndex((index) => Math.min(outlines.length - 1, index + 1))}
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

function promptPreview(prompt: string, maxLength = 520): string {
  const text = prompt.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function splitHtmlPromptForDisplay(prompt: string): { variablePart: string; fixedPart: string } {
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

function PromptTextBlock({
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

function PromptSlidePagerCard({
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

function HtmlPromptsReadablePanel({ plan }: { plan: LessonPlan | null }) {
  const slides = plan?.slides || [];
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const withMandatoryContent = slides.filter(
    (slide) => slide.mandatoryVisibleContent?.length,
  ).length;
  const withAnchors = slides.filter((slide) => slide.sourceAnchors?.length).length;
  const longPrompts = slides.filter((slide) => slide.htmlPrompt.trim().length >= 220).length;
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

function HtmlPagesReadablePanel({
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
  const generatedCount = slides.filter((slide) => pages[slide.id]).length;
  const errorCount = slides.filter((slide) => errors[slide.id]).length;
  const totalHtmlLength = slides.reduce(
    (sum, slide) => sum + (pages[slide.id]?.htmlLength || 0),
    0,
  );
  const totalCost = slides.reduce(
    (sum, slide) => sum + (pages[slide.id]?.costEstimate?.retailUsd || 0),
    0,
  );

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
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {slides.map((slide) => {
          const result = pages[slide.id];
          const error = errors[slide.id];
          const isRunning = generatingIds.includes(slide.id);
          const status = result ? 'pass' : error ? 'fail' : isRunning ? 'running' : 'ready';
          return (
            <section key={slide.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
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
                    <h4 className="min-w-0 text-base font-semibold tracking-normal text-slate-950">
                      {slide.title}
                    </h4>
                    <Badge
                      variant={status === 'fail' ? 'destructive' : result ? 'secondary' : 'outline'}
                      className="rounded-md"
                    >
                      {status === 'running'
                        ? '生成中'
                        : status === 'pass'
                          ? 'HTML OK'
                          : status === 'fail'
                            ? '失败'
                            : '待生成'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {slide.objective || slide.learnerQuestion || '缺少页面目标。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="rounded-md">
                    {getSlideCanvasMode(slide)} {getSlideCanvasHeight(slide)}px
                  </Badge>
                  {result ? (
                    <Badge variant="outline" className="rounded-md">
                      {result.htmlLength.toLocaleString()} chars
                    </Badge>
                  ) : null}
                  {result?.durationMs ? (
                    <Badge variant="outline" className="rounded-md">
                      {formatDuration(result.durationMs)}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
                  <div className="font-semibold">{error.message}</div>
                  {error.details ? <p className="mt-1 text-xs">{error.details}</p> : null}
                </div>
              ) : null}

              {result ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                    <div className="font-semibold text-slate-950">生成指标</div>
                    <div className="mt-2 grid gap-1">
                      <div>elements: {result.elementCount}</div>
                      <div>text blocks: {result.textNodeCount}</div>
                      <div>attempts: {result.generationAttempts || 1}</div>
                      <div>cost: {formatCost(result.costEstimate)}</div>
                    </div>
                  </div>
                  <details className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      查看 HTML 预览
                    </summary>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <iframe
                        title={`${slide.title} HTML preview`}
                        srcDoc={result.html}
                        className="h-[360px] w-full bg-white"
                        sandbox="allow-scripts"
                      />
                    </div>
                    <Textarea
                      readOnly
                      value={result.html}
                      className="mt-3 min-h-[180px] resize-y rounded-xl font-mono text-xs leading-5"
                    />
                  </details>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CoverPageReadablePanel({
  plan,
  result,
  error,
  isGenerating,
}: {
  plan: LessonPlan | null;
  result: HtmlPageResult | null;
  error: HtmlPageError | null;
  isGenerating: boolean;
}) {
  const cover = plan?.slides?.[0];
  if (!plan || !cover) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待 htmlPrompt 通过后生成封面页。
      </div>
    );
  }

  const visibleText = result ? visibleTextFromHtml(result.html) : '';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            cover visual test
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">
            {cover.title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这个 step 只看封面是否像封面：标题清楚、文字少、背景/主视觉选对。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            {cover.pageKind}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {cover.courseRoute || 'route auto'}
          </Badge>
          {result ? (
            <Badge variant="outline" className="rounded-md">
              text {visibleText.length}
            </Badge>
          ) : null}
        </div>
      </div>

      {isGenerating ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Loader2 className="size-4 animate-spin" />
          正在生成封面页。
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
          <div className="font-semibold">{error.message}</div>
          {error.details ? <p className="mt-1 text-xs">{error.details}</p> : null}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <iframe
              title={`${cover.title} cover preview`}
              srcDoc={result.html}
              className="h-[520px] w-full bg-white"
              sandbox="allow-scripts"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <div className="font-semibold text-slate-950">封面检测指标</div>
            <div className="mt-2 grid gap-1">
              <div>elements: {result.elementCount}</div>
              <div>text blocks: {result.textNodeCount}</div>
              <div>visible text: {visibleText.length}</div>
              <div>duration: {formatDuration(result.durationMs)}</div>
              <div>cost: {formatCost(result.costEstimate)}</div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-slate-700">HTML</summary>
              <Textarea
                readOnly
                value={result.html}
                className="mt-2 min-h-[220px] resize-y rounded-xl font-mono text-xs leading-5"
              />
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PipelineStepCard({
  order,
  title,
  artifact,
  description,
  state,
  actionLabel,
  onAction,
  actionDisabled,
  disabledReason,
  children,
}: {
  order: number;
  title: string;
  artifact: string;
  description: string;
  state: PipelineStepState;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}) {
  const locked = state === 'locked';
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm',
        locked ? 'border-slate-200 opacity-75' : 'border-slate-200',
      )}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                locked ? 'bg-slate-100 text-slate-400' : 'bg-emerald-600 text-white',
              )}
            >
              {order}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-normal text-slate-950">{title}</h2>
              <p className="truncate text-xs font-medium text-slate-500">{artifact}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold',
                stepBadgeClassName(state),
              )}
            >
              <StepStatusIcon state={state} />
              {stepBadgeLabel(state)}
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
          {locked && disabledReason ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              {disabledReason}
            </div>
          ) : null}
        </div>

        {actionLabel && onAction ? (
          <Button
            type="button"
            variant={state === 'fail' ? 'destructive' : locked ? 'outline' : 'default'}
            disabled={locked || actionDisabled}
            onClick={onAction}
            className="w-full lg:w-auto"
          >
            {state === 'running' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            {actionLabel}
          </Button>
        ) : null}
      </div>

      {!locked && children ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </section>
  );
}

function PipelineSidebar({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: Array<{
    id: PipelineStepId;
    order: number;
    title: string;
    artifact: string;
    state: PipelineStepState;
    failCount: number;
    warnCount: number;
  }>;
  selectedStepId: PipelineStepId;
  onSelectStep: (stepId: PipelineStepId) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Layers3 className="size-4" />
          HTML 生成管线
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          左侧选择 step，右侧只显示当前 step 的测试结果。
        </p>
      </div>

      <div className="mt-2 grid gap-2">
        {steps.map((step) => {
          const selected = step.id === selectedStepId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={cn(
                'block w-full min-w-0 max-w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition',
                selected
                  ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="flex min-w-0 flex-1 gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {step.order}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {step.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                      {step.artifact}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'ml-auto inline-flex max-w-[92px] shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
                    stepBadgeClassName(step.state),
                  )}
                >
                  <span className="shrink-0">
                    <StepStatusIcon state={step.state} />
                  </span>
                  <span className="truncate">{stepBadgeLabel(step.state)}</span>
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">fail</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.failCount ? 'text-red-600' : 'text-slate-700',
                    )}
                  >
                    {step.failCount}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">warn</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.warnCount ? 'text-amber-700' : 'text-slate-700',
                    )}
                  >
                    {step.warnCount}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function GenerationHtmlPipelineTestPage() {
  const [selectedTier, setSelectedTier] = useState<PageCountTier>('under10');
  const [fixtures, setFixtures] = useState<TestfileFixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isLoadingSavedResult, setIsLoadingSavedResult] = useState(false);
  const [generatingHtmlSlideIds, setGeneratingHtmlSlideIds] = useState<string[]>([]);
  const [isGeneratingCoverPage, setIsGeneratingCoverPage] = useState(false);
  const [coverPageResult, setCoverPageResult] = useState<HtmlPageResult | null>(null);
  const [coverPageError, setCoverPageError] = useState<HtmlPageError | null>(null);
  const [htmlPageResults, setHtmlPageResults] = useState<Record<string, HtmlPageResult>>({});
  const [htmlPageErrors, setHtmlPageErrors] = useState<Record<string, HtmlPageError>>({});
  const [htmlRunMessage, setHtmlRunMessage] = useState('');
  const [error, setError] = useState('');
  const [planResponse, setPlanResponse] = useState<LessonPlanResponse | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [selectedStepId, setSelectedStepId] = useState<PipelineStepId>('source');

  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) || fixtures[0] || null;
  const plan = planResponse?.plan || null;
  const sourceChecks = useMemo(
    () => evaluateSourcePackage(selectedFixture, selectedTier),
    [selectedFixture, selectedTier],
  );
  const coursePlanChecks = useMemo(() => evaluateCoursePlan(plan), [plan]);
  const slideOutlineChecks = useMemo(() => evaluateSlideOutlines(plan), [plan]);
  const htmlPromptChecks = useMemo(() => evaluateHtmlPrompts(plan), [plan]);
  const coverPageChecks = useMemo(
    () => evaluateCoverPage(plan, coverPageResult, coverPageError),
    [coverPageError, coverPageResult, plan],
  );
  const htmlPageChecks = useMemo(
    () => evaluateHtmlPages(plan, htmlPageResults, htmlPageErrors),
    [htmlPageErrors, htmlPageResults, plan],
  );
  const sourcePassed = Boolean(selectedFixture) && !hasBlockingFailure(sourceChecks);
  const coursePlanStarted = Boolean(plan?.coursePlan);
  const coursePlanPassed = coursePlanStarted && !hasBlockingFailure(coursePlanChecks);
  const slideOutlineStarted = Boolean(plan);
  const slideOutlinePassed =
    coursePlanPassed && slideOutlineStarted && !hasBlockingFailure(slideOutlineChecks);
  const htmlPromptStarted = Boolean(plan);
  const htmlPromptPassed =
    slideOutlinePassed && htmlPromptStarted && !hasBlockingFailure(htmlPromptChecks);
  const coverPageStarted = Boolean(coverPageResult || coverPageError || isGeneratingCoverPage);
  const coverPagePassed =
    htmlPromptPassed && Boolean(coverPageResult) && !hasBlockingFailure(coverPageChecks);
  const htmlPageStarted =
    Object.keys(htmlPageResults).length > 0 ||
    Object.keys(htmlPageErrors).length > 0 ||
    generatingHtmlSlideIds.length > 0;
  const allChecks = useMemo(
    () => [
      ...sourceChecks,
      ...(coursePlanStarted ? coursePlanChecks : []),
      ...(coursePlanPassed && slideOutlineStarted ? slideOutlineChecks : []),
      ...(slideOutlinePassed && htmlPromptStarted ? htmlPromptChecks : []),
      ...(htmlPromptPassed && coverPageStarted ? coverPageChecks : []),
      ...(coverPagePassed && htmlPageStarted ? htmlPageChecks : []),
    ],
    [
      coverPageChecks,
      coverPagePassed,
      coverPageStarted,
      coursePlanChecks,
      coursePlanPassed,
      coursePlanStarted,
      htmlPromptChecks,
      htmlPageChecks,
      htmlPageStarted,
      htmlPromptPassed,
      htmlPromptStarted,
      slideOutlineChecks,
      slideOutlinePassed,
      slideOutlineStarted,
      sourceChecks,
    ],
  );
  const failCount = allChecks.filter((check) => check.status === 'fail').length;
  const warnCount = allChecks.filter((check) => check.status === 'warn').length;
  const sourceStepState: PipelineStepState = isLoadingFixtures
    ? 'running'
    : sourcePassed
      ? checksToStepState(sourceChecks)
      : selectedFixture
        ? 'fail'
        : 'ready';
  const coursePlanStepState: PipelineStepState = !sourcePassed
    ? 'locked'
    : isPlanning
      ? 'running'
      : coursePlanStarted
        ? checksToStepState(coursePlanChecks)
        : 'ready';
  const slideOutlineStepState: PipelineStepState = !coursePlanPassed
    ? 'locked'
    : slideOutlineStarted
      ? checksToStepState(slideOutlineChecks)
      : 'ready';
  const htmlPromptStepState: PipelineStepState = !slideOutlinePassed
    ? 'locked'
    : htmlPromptStarted
      ? checksToStepState(htmlPromptChecks)
      : 'ready';
  const coverPageStepState: PipelineStepState = !htmlPromptPassed
    ? 'locked'
    : isGeneratingCoverPage
      ? 'running'
      : coverPageStarted
        ? checksToStepState(coverPageChecks)
        : 'ready';
  const htmlPagesStepState: PipelineStepState = !coverPagePassed
    ? 'locked'
    : generatingHtmlSlideIds.length > 0
      ? 'running'
      : htmlPageStarted
        ? checksToStepState(htmlPageChecks)
        : 'ready';
  const pipelineSteps = useMemo(
    () =>
      [
        {
          id: 'source' as const,
          state: sourceStepState,
          checks: sourceChecks,
        },
        {
          id: 'course-plan' as const,
          state: coursePlanStepState,
          checks: coursePlanStarted ? coursePlanChecks : [],
        },
        {
          id: 'slide-outlines' as const,
          state: slideOutlineStepState,
          checks: coursePlanPassed && slideOutlineStarted ? slideOutlineChecks : [],
        },
        {
          id: 'html-prompts' as const,
          state: htmlPromptStepState,
          checks: slideOutlinePassed && htmlPromptStarted ? htmlPromptChecks : [],
        },
        {
          id: 'cover-page' as const,
          state: coverPageStepState,
          checks: htmlPromptPassed && coverPageStarted ? coverPageChecks : [],
        },
        {
          id: 'html-pages' as const,
          state: htmlPagesStepState,
          checks: htmlPageStarted ? htmlPageChecks : [],
        },
      ].map((step) => ({
        ...step,
        ...PIPELINE_STEP_LABELS[step.id],
        failCount: step.checks.filter((check) => check.status === 'fail').length,
        warnCount: step.checks.filter((check) => check.status === 'warn').length,
      })),
    [
      coverPageChecks,
      coverPageStarted,
      coverPageStepState,
      coursePlanChecks,
      coursePlanPassed,
      coursePlanStarted,
      coursePlanStepState,
      htmlPagesStepState,
      htmlPromptChecks,
      htmlPromptPassed,
      htmlPageChecks,
      htmlPageStarted,
      htmlPromptStarted,
      htmlPromptStepState,
      slideOutlineChecks,
      slideOutlinePassed,
      slideOutlineStarted,
      slideOutlineStepState,
      sourceChecks,
      sourceStepState,
    ],
  );
  const outputTestHref = '/generation-html-notebook-test';
  const outputTestLabel = '进入整本 notebook HTML 生成';

  const loadFixtures = useCallback(async () => {
    setIsLoadingFixtures(true);
    setError('');
    setPlanResponse(null);
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(false);
    setGeneratingHtmlSlideIds([]);
    setHtmlRunMessage('');
    setSaveMessage('');
    setSelectedStepId('source');
    try {
      const response = await backendFetch(
        `/api/generation-quality/testfile-fixtures?mode=subject-notebooks&ts=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      const nextFixtures = data.notebooks || [];
      if (!response.ok || data.success === false || nextFixtures.length === 0) {
        setError(data.error || `读取 fixtures 失败：HTTP ${response.status}`);
        setFixtures([]);
        setSelectedFixtureId('');
        return;
      }
      setFixtures(nextFixtures);
      setSelectedFixtureId(nextFixtures[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoadingFixtures(false);
    }
  }, []);

  useEffect(() => {
    void loadFixtures();
  }, [loadFixtures]);

  useEffect(() => {
    if (!selectedFixtureId || isLoadingFixtures || isPlanning) return;
    let cancelled = false;
    setIsLoadingSavedResult(true);
    void loadTestResult<SavedPipelinePayload>({
      testId: TEST_RESULT_ID,
      resultKey: pipelineResultKey(selectedFixtureId, selectedTier),
    })
      .then((row) => {
        if (cancelled) return;
        const payload = row?.payload;
        if (
          row &&
          payload?.plan &&
          payload.fixtureId === selectedFixtureId &&
          payload.tier === selectedTier
        ) {
          setPlanResponse({
            success: true,
            plan: payload.plan,
            planningQuality: payload.planningQuality ?? null,
          });
          setCoverPageResult(payload.coverPage || null);
          setCoverPageError(payload.coverPageError || null);
          setHtmlPageResults(payload.htmlPages || {});
          setHtmlPageErrors(payload.htmlPageErrors || {});
          setSaveMessage(`已恢复 ${formatSavedAt(row.updatedAt)} 保存的分步测试结果。`);
          setSelectedStepId(
            payload.htmlPages && Object.keys(payload.htmlPages).length
              ? 'html-pages'
              : 'course-plan',
          );
          return;
        }
        setPlanResponse(null);
        setCoverPageResult(null);
        setCoverPageError(null);
        setHtmlPageResults({});
        setHtmlPageErrors({});
        setSaveMessage('');
        setSelectedStepId('source');
      })
      .catch(() => {
        if (cancelled) return;
        setSaveMessage('');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSavedResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoadingFixtures, isPlanning, selectedFixtureId, selectedTier]);

  const persistPipelinePayload = useCallback(
    async (
      nextPlan: LessonPlan,
      planningQuality: PlanningQualityReport | null | undefined,
      nextHtmlPages: Record<string, HtmlPageResult>,
      nextHtmlErrors: Record<string, HtmlPageError>,
      nextCoverPage: HtmlPageResult | null = coverPageResult,
      nextCoverError: HtmlPageError | null = coverPageError,
    ) => {
      if (!selectedFixture) return;
      const checksByStage = {
        source: evaluateSourcePackage(selectedFixture, selectedTier),
        coursePlan: evaluateCoursePlan(nextPlan),
        slideOutlines: evaluateSlideOutlines(nextPlan),
        htmlPrompts: evaluateHtmlPrompts(nextPlan),
        coverPage: evaluateCoverPage(nextPlan, nextCoverPage, nextCoverError),
        htmlPages: evaluateHtmlPages(nextPlan, nextHtmlPages, nextHtmlErrors),
      };
      const visibleChecks = [
        ...checksByStage.source,
        ...checksByStage.coursePlan,
        ...checksByStage.slideOutlines,
        ...checksByStage.htmlPrompts,
        ...(nextCoverPage || nextCoverError ? checksByStage.coverPage : []),
        ...(Object.keys(nextHtmlPages).length || Object.keys(nextHtmlErrors).length
          ? checksByStage.htmlPages
          : []),
      ];
      const errorCount = visibleChecks.filter((check) => check.status === 'fail').length;
      const generatedHtmlCount = nextPlan.slides.filter((slide) => nextHtmlPages[slide.id]).length;
      const payload: SavedPipelinePayload = {
        mode: 'notebook',
        fixtureId: selectedFixture.id,
        fixtureTitle: selectedFixture.title,
        tier: selectedTier,
        generatedAt: Date.now(),
        checks: checksByStage,
        plan: nextPlan,
        planningQuality: planningQuality || null,
        coverPage: nextCoverPage,
        coverPageError: nextCoverError,
        htmlPages: nextHtmlPages,
        htmlPageErrors: nextHtmlErrors,
      };
      await saveTestResult({
        testId: TEST_RESULT_ID,
        resultKey: pipelineResultKey(selectedFixture.id, selectedTier),
        status: errorCount ? 'failed' : 'passed',
        title: `Notebook pipeline · ${selectedFixture.title}`,
        summary: {
          generatedCount: nextPlan.slides.length,
          htmlGeneratedCount: generatedHtmlCount,
          htmlErrorCount: Object.keys(nextHtmlErrors).length,
          errorCount,
          lastUpdatedAt: Date.now(),
        },
        payload,
      }).catch(() => null);
    },
    [coverPageError, coverPageResult, selectedFixture, selectedTier],
  );

  const generatePlan = useCallback(async () => {
    if (!selectedFixture) return;
    setIsPlanning(true);
    setError('');
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(false);
    setGeneratingHtmlSlideIds([]);
    setHtmlRunMessage('');
    setSaveMessage('');
    try {
      const sourcePages = sourcePagesFromFixture(selectedFixture);
      const body = {
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
        sourcePages,
        sourcePackage: selectedFixture.sourcePackage,
      };
      const response = await backendFetch('/api/generation-quality/html-lesson-plan', {
        method: 'POST',
        headers: getPipelineHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as LessonPlanResponse;
      if (!response.ok || data.success === false || !data.plan) {
        setError(data.error || `生成 plan 失败：HTTP ${response.status}`);
        setPlanResponse(null);
        return;
      }
      setPlanResponse(data);
      setSelectedStepId('course-plan');
      const visibleChecks = [
        ...evaluateSourcePackage(selectedFixture, selectedTier),
        ...evaluateCoursePlan(data.plan),
        ...evaluateSlideOutlines(data.plan),
        ...evaluateHtmlPrompts(data.plan),
      ];
      const errorCount = visibleChecks.filter((check) => check.status === 'fail').length;
      await persistPipelinePayload(data.plan, data.planningQuality || null, {}, {}, null, null);
      setSaveMessage(errorCount ? `已保存，仍有 ${errorCount} 个 gate 未通过。` : '已保存，通过。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsPlanning(false);
    }
  }, [persistPipelinePayload, selectedFixture, selectedTier]);

  const generateCoverPage = useCallback(async () => {
    if (!plan || !htmlPromptPassed) return;
    const cover = plan.slides[0];
    if (!cover) return;

    setError('');
    setSaveMessage('');
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(true);
    setSelectedStepId('cover-page');
    try {
      const { result, error: nextError } = await requestHtmlSlide({
        fixture: selectedFixture,
        plan,
        slide: cover,
      });
      setCoverPageResult(result || null);
      setCoverPageError(nextError || null);
      await persistPipelinePayload(
        plan,
        planResponse?.planningQuality || null,
        htmlPageResults,
        htmlPageErrors,
        result || null,
        nextError || null,
      );
      setSaveMessage(
        nextError
          ? `封面页生成失败：${nextError.message}`
          : result
            ? '封面页视觉测试已保存。'
            : '封面页没有生成结果。',
      );
    } finally {
      setIsGeneratingCoverPage(false);
    }
  }, [
    htmlPageErrors,
    htmlPageResults,
    htmlPromptPassed,
    persistPipelinePayload,
    plan,
    planResponse?.planningQuality,
    selectedFixture,
  ]);

  const generateAllHtmlPages = useCallback(async () => {
    if (!plan || !coverPagePassed) return;
    const slides = plan.slides;
    if (!slides.length) return;

    const nextResults: Record<string, HtmlPageResult> = {};
    const nextErrors: Record<string, HtmlPageError> = {};
    let completedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let nextIndex = 0;
    const concurrency = Math.min(HTML_SLIDE_GENERATION_CONCURRENCY, slides.length);

    setError('');
    setSaveMessage('');
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setSelectedStepId('html-pages');
    setHtmlRunMessage(`整本 HTML 生成：0/${slides.length} 完成 · 并发 ${concurrency}`);

    const runWorker = async () => {
      while (true) {
        const slide = slides[nextIndex];
        nextIndex += 1;
        if (!slide) return;

        setGeneratingHtmlSlideIds((previous) =>
          previous.includes(slide.id) ? previous : [...previous, slide.id],
        );
        try {
          const { result, error: nextError } = await requestHtmlSlide({
            fixture: selectedFixture,
            plan,
            slide,
          });
          if (nextError || !result) {
            nextErrors[slide.id] =
              nextError ||
              ({
                slideId: slide.id,
                slideTitle: slide.title,
                order: slide.order,
                message: 'HTML 生成没有返回结果。',
                createdAt: Date.now(),
              } satisfies HtmlPageError);
            failedCount += 1;
            setHtmlPageErrors({ ...nextErrors });
          } else {
            nextResults[slide.id] = result;
            successCount += 1;
            setHtmlPageResults({ ...nextResults });
          }
        } catch (caught) {
          nextErrors[slide.id] = {
            slideId: slide.id,
            slideTitle: slide.title,
            order: slide.order,
            message:
              caught instanceof DOMException && caught.name === 'AbortError'
                ? 'HTML 生成请求超时'
                : caught instanceof Error
                  ? caught.message
                  : String(caught),
            details:
              caught instanceof DOMException && caught.name === 'AbortError'
                ? `单页生成超过 ${Math.round(HTML_SLIDE_REQUEST_TIMEOUT_MS / 1000)} 秒。`
                : undefined,
            createdAt: Date.now(),
          };
          failedCount += 1;
          setHtmlPageErrors({ ...nextErrors });
        } finally {
          completedCount += 1;
          setGeneratingHtmlSlideIds((previous) => previous.filter((id) => id !== slide.id));
          setHtmlRunMessage(
            `整本 HTML 生成：${completedCount}/${slides.length} 完成 · 成功 ${successCount} · 失败 ${failedCount} · 并发 ${concurrency}`,
          );
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
    await persistPipelinePayload(
      plan,
      planResponse?.planningQuality || null,
      nextResults,
      nextErrors,
    );
    setHtmlRunMessage('');
    setSaveMessage(
      failedCount
        ? `整本 HTML 已保存：成功 ${successCount} 页，失败 ${failedCount} 页。`
        : `整本 HTML 已保存：${successCount} 页全部生成。`,
    );
  }, [
    coverPagePassed,
    persistPipelinePayload,
    plan,
    planResponse?.planningQuality,
    selectedFixture,
  ]);

  const selectedSourcePages = selectedFixture ? sourcePagesFromFixture(selectedFixture) : [];
  const selectedSourceTextLength = selectedFixture
    ? selectedFixture.sourcePackage?.sourceText?.length || selectedFixture.sourceTextLength || 0
    : 0;
  const selectedParser = selectedFixture?.sourcePackage?.parser || 'fixture-builder';
  const selectedImageCount = selectedFixture?.sourcePackage?.sourceImages?.length || 0;
  const selectedImageStats = selectedFixture?.sourcePackage?.imageStats;
  const selectedRawImageCount = selectedImageStats?.rawCount ?? selectedImageCount;
  const selectedFilteredImageCount = selectedImageStats
    ? selectedImageStats.filteredSmallCount +
      selectedImageStats.filteredLargeCount +
      selectedImageStats.filteredLimitCount
    : 0;

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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Layers3 className="size-4" />
                HTML Pipeline Stage QA
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal">
                HTML 整本 notebook 管线分步测试
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                专门验收中间产物：Source Package、coursePlan、slideOutlines 和
                slides[].htmlPrompt，并在最后一步生成整本 HTML 页面。这里固定使用整本 notebook
                source，不再切换单文件 lesson。
              </p>
            </div>
            <div className="grid min-w-[340px] grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">模型</div>
                <div className="mt-1 font-semibold">{HTML_PIPELINE_MODEL}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">失败 gate</div>
                <div className={cn('mt-1 font-semibold', failCount ? 'text-red-600' : '')}>
                  {failCount}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">警告</div>
                <div className={cn('mt-1 font-semibold', warnCount ? 'text-amber-600' : '')}>
                  {warnCount}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
                    <FileText className="size-3.5" />
                    Source Package 输入
                  </div>
                  <h2 className="mt-1 truncate text-lg font-semibold tracking-normal text-slate-950">
                    {selectedFixture?.title || '选择 notebook source'}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    固定整本 notebook source；修改 source 或页数档位会回到 Source Package step。
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  step 1 起点
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,420px)_180px]">
                <label className="block min-w-0 text-xs font-medium text-slate-600">
                  源材料
                  <Select
                    value={selectedFixture?.id || ''}
                    onValueChange={(value) => {
                      setSelectedFixtureId(value);
                      setPlanResponse(null);
                      setCoverPageResult(null);
                      setCoverPageError(null);
                      setIsGeneratingCoverPage(false);
                      setHtmlPageResults({});
                      setHtmlPageErrors({});
                      setGeneratingHtmlSlideIds([]);
                      setHtmlRunMessage('');
                      setSaveMessage('');
                      setSelectedStepId('source');
                    }}
                    disabled={isLoadingFixtures || !fixtures.length}
                  >
                    <SelectTrigger className="mt-1 h-11 rounded-xl border-slate-200 bg-slate-50/70 shadow-none">
                      <SelectValue placeholder="选择 source fixture" />
                    </SelectTrigger>
                    <SelectContent>
                      {fixtures.map((fixture) => (
                        <SelectItem key={fixture.id} value={fixture.id}>
                          {fixture.title || fixture.fileName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  页数档位
                  <Select
                    value={selectedTier}
                    onValueChange={(value) => {
                      setSelectedTier(value as PageCountTier);
                      setPlanResponse(null);
                      setCoverPageResult(null);
                      setCoverPageError(null);
                      setIsGeneratingCoverPage(false);
                      setHtmlPageResults({});
                      setHtmlPageErrors({});
                      setGeneratingHtmlSlideIds([]);
                      setHtmlRunMessage('');
                      setSaveMessage('');
                      setSelectedStepId('source');
                    }}
                  >
                    <SelectTrigger className="mt-1 h-11 rounded-xl border-slate-200 bg-slate-50/70 shadow-none">
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
              </div>

              {selectedFixture ? (
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="inline-flex max-w-full min-w-0 items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="shrink-0 font-semibold text-slate-900">文件</span>
                    <span className="ml-1 min-w-0 truncate">{selectedFixture.fileName}</span>
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold text-slate-900">类型</span>
                    <span className="ml-1">{selectedFixture.fileType}</span>
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold text-slate-900">源页</span>
                    <span className="ml-1">{selectedSourcePages.length}</span>
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold text-slate-900">原文</span>
                    <span className="ml-1">{selectedSourceTextLength.toLocaleString()}</span>
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="font-semibold text-slate-900">解析器</span>
                    <span className="ml-1">{selectedParser}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <ImageIcon className="size-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-900">图片</span>
                    <span>
                      {selectedImageCount}/{selectedRawImageCount}
                    </span>
                    {selectedFilteredImageCount ? (
                      <span className="text-amber-700">过滤 {selectedFilteredImageCount}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col justify-between gap-4 border-t border-slate-100 bg-slate-50/70 p-4 xl:border-l xl:border-t-0">
              <div>
                <div className="text-xs font-semibold text-slate-500">测试模式</div>
                <div className="mt-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800">
                  整本 notebook source
                </div>
              </div>

              <Button
                type="button"
                disabled={isLoadingFixtures || isPlanning}
                onClick={() => void loadFixtures()}
                className="h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              >
                {isLoadingFixtures ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                读 source
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                测试失败
              </div>
              <p className="mt-1 text-xs leading-5">{error}</p>
            </div>
          ) : null}
          {saveMessage ? (
            <div className="mx-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
              {saveMessage}
            </div>
          ) : null}
          {isLoadingSavedResult ? (
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <Loader2 className="size-3.5 animate-spin" />
              正在检查是否有已保存的分步测试结果。
            </div>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <PipelineSidebar
            steps={pipelineSteps}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />

          <div className="min-w-0">
            {selectedStepId === 'source' ? (
              <PipelineStepCard
                order={1}
                title="读取并验收 Source Package"
                artifact="sourcePackage / sourcePages / sourceImages"
                description="先确认真实 PPT、PDF 或 notebook 已经被解析成可规划的源材料包。后面的 coursePlan 只能基于这里通过的 source 继续。"
                state={sourceStepState}
                actionLabel="重新读取 source"
                onAction={() => void loadFixtures()}
                actionDisabled={isLoadingFixtures || isPlanning}
              >
                <div className="grid gap-4">
                  <GateCheckList checks={sourceChecks} />
                  <SourceEvidencePanel fixture={selectedFixture} />
                </div>
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'course-plan' ? (
              <PipelineStepCard
                order={2}
                title="生成并验收 coursePlan"
                artifact="courseGoal / narrativeArc / coreQuestions / sourceDigest"
                description="这一步只关心整本 notebook 应该怎样被教：先定目标、叙事弧线、核心问题和源材料取舍，不允许直接跳到页面 HTML。"
                state={coursePlanStepState}
                actionLabel={coursePlanStarted ? '重新生成 coursePlan' : '生成 coursePlan'}
                onAction={() => void generatePlan()}
                actionDisabled={!sourcePassed || isPlanning || isLoadingFixtures}
                disabledReason="Step 1 的 Source Package gate 通过后，才可以生成 coursePlan。"
              >
                {coursePlanStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={coursePlanChecks} />
                    {plan?.coursePlan ? (
                      <CoursePlanReadablePanel coursePlan={plan.coursePlan} />
                    ) : null}
                    {planResponse?.planningQuality ? (
                      <PlanningQualityReadablePanel report={planResponse.planningQuality} />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                    Source 已通过。点击“生成 coursePlan”调用规划 API；后续 slideOutlines 和
                    htmlPrompt 会作为产物返回，但页面会继续按 gate 分步验收。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'slide-outlines' ? (
              <PipelineStepCard
                order={3}
                title="验收 slideOutlines"
                artifact="learnerQuestion / teachingObjective / sourceAnchors / visualPlan"
                description="coursePlan 通过以后，才检查它是否被拆成逐页教学问题、目标、证据锚点和视觉计划。这里失败时，不应该继续验收 htmlPrompt。"
                state={slideOutlineStepState}
                disabledReason="Step 2 的 coursePlan gate 通过后，才可以检查 slideOutlines。"
              >
                {slideOutlineStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={slideOutlineChecks} />
                    <SlideOutlinesReadablePanel outlines={plan?.slideOutlines || []} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    等待 coursePlan 通过。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'html-prompts' ? (
              <PipelineStepCard
                order={4}
                title="验收 slides[].htmlPrompt"
                artifact="pageKind / canvasMode / density / mandatoryVisibleContent"
                description="只有 slideOutlines 通过以后，才检查每一页是否已经被降解成单页 HTML 生成器能执行的页面契约。这里通过后才适合进入真实 HTML 页面生成。"
                state={htmlPromptStepState}
                disabledReason="Step 3 的 slideOutlines gate 通过后，才可以检查每页 htmlPrompt。"
              >
                {htmlPromptStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={htmlPromptChecks} />
                    <HtmlPromptsReadablePanel plan={plan || null} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    等待 slideOutlines 通过。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'cover-page' ? (
              <PipelineStepCard
                order={5}
                title="单独验收封面页视觉"
                artifact="cover HTML / built-in background / title-only"
                description="slides[].htmlPrompt 通过以后，先单独生成第 1 页封面。这里不看正文教学，只看标题是否清楚、文字是否克制、背景/主视觉是否选对。"
                state={coverPageStepState}
                actionLabel={coverPageStarted ? '重新生成封面页' : '生成封面页'}
                onAction={() => void generateCoverPage()}
                actionDisabled={!htmlPromptPassed || isGeneratingCoverPage}
                disabledReason="Step 4 的 htmlPrompt gate 通过后，才可以单独验收封面页视觉。"
              >
                <div className="grid gap-4">
                  {coverPageStarted ? <GateCheckList checks={coverPageChecks} /> : null}
                  {!coverPageStarted ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                      htmlPrompt 已通过。点击“生成封面页”只调用第 1 页，检查封面背景和标题。
                    </div>
                  ) : null}
                  <CoverPageReadablePanel
                    plan={plan}
                    result={coverPageResult}
                    error={coverPageError}
                    isGenerating={isGeneratingCoverPage}
                  />
                </div>
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'html-pages' ? (
              <PipelineStepCard
                order={6}
                title="生成并验收整本 HTML"
                artifact="html pages / iframe preview / generation errors"
                description="封面页视觉测试通过以后，在当前 pipeline 内逐页调用真实 HTML 生成接口，保存整本 notebook 的 HTML 结果、错误和预览。"
                state={htmlPagesStepState}
                actionLabel={
                  htmlPageStarted || Object.keys(htmlPageResults).length
                    ? '重新生成整本 HTML'
                    : '生成整本 HTML'
                }
                onAction={() => void generateAllHtmlPages()}
                actionDisabled={!coverPagePassed || generatingHtmlSlideIds.length > 0}
                disabledReason="Step 5 的封面页视觉测试通过后，才可以进入完整 HTML 页面生成。"
              >
                <div className="grid gap-4">
                  {htmlRunMessage ? (
                    <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      <Loader2 className="size-4 animate-spin" />
                      {htmlRunMessage}
                    </div>
                  ) : null}
                  {htmlPageStarted ? <GateCheckList checks={htmlPageChecks} /> : null}
                  {!htmlPageStarted ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                      <div className="font-semibold">封面视觉和规划链路已通过</div>
                      <div className="mt-1 text-xs">
                        点击“生成整本 HTML”会在当前页面逐页调用真实 HTML
                        生成接口。独立调试页仍保留：
                        <Link
                          href={outputTestHref}
                          className="ml-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                        >
                          {outputTestLabel}
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  <HtmlPagesReadablePanel
                    plan={plan}
                    pages={htmlPageResults}
                    errors={htmlPageErrors}
                    generatingIds={generatingHtmlSlideIds}
                  />
                </div>
              </PipelineStepCard>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
