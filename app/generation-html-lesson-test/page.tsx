'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Code2,
  FileCode2,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trash2,
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
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:html-lesson-generation-test:v1';
const HTML_LESSON_MODEL = 'gpt-5.4';
const RESULT_RENDER_VERSION = 'html-lesson-v1';

type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
type HtmlPageKind = 'intro' | 'summary' | 'process' | 'table' | 'math' | 'code' | 'example';
type InferredHtmlPageKind = HtmlPageKind | 'auto';
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

interface LessonPlanResult {
  plan: LessonPlan;
  fixtureId: string;
  pageCountTier: PageCountTier;
  signature: string;
  rawResponse: LessonPlanResponse;
  createdAt: number;
}

interface HtmlSlideResult {
  html: string;
  slide: LessonSlidePlan;
  prompt: string;
  planSignature: string;
  rawResponse: GenerateHtmlPptResponse;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
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

function readSavedState(): SavedState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedState;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSavedState(state: SavedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // HTML generations can be large; persistence failure should not block the QA surface.
  }
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

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  if (pageIndex === 0 || outline.archetype === 'intro' || /cover|hero|title|divider/.test(text)) {
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

function buildDensityContract(slide: LessonSlidePlan): string {
  return [
    `密度档：${densityLabel(slide.density)}`,
    `可见中文/等价字符：${slide.contentBudget.visibleCharsMin}-${slide.contentBudget.visibleCharsMax}`,
    `主要内容区：最多 ${slide.contentBudget.mainRegions} 个`,
    `内容块：最多 ${slide.contentBudget.blockCount} 个`,
    '这是整节课规划后的单页 prompt；不要额外扩写，不要补第二主题。',
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
  const [generatingSlideId, setGeneratingSlideId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const [previewStats, setPreviewStats] = useState<PreviewStats>(emptyPreviewStats);
  const [previewScale, setPreviewScale] = useState(0.7);
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
    const saved = readSavedState();
    setSelectedFixtureId(saved.selectedFixtureId || '');
    setSelectedTier(saved.selectedTier || 'under10');
    setSelectedSlideIdByPlan(saved.selectedSlideIdByPlan || {});
    setPlansByKey(saved.plansByKey || {});
    setHtmlBySlide(saved.htmlBySlide || {});
    setErrorsBySlide(saved.errorsBySlide || {});
    setPlanErrorsByKey(saved.planErrorsByKey || {});
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void loadFixtures();
  }, [isHydrated, loadFixtures]);

  useEffect(() => {
    if (!isHydrated) return;
    writeSavedState({
      selectedFixtureId,
      selectedTier,
      selectedSlideIdByPlan,
      plansByKey,
      htmlBySlide,
      errorsBySlide,
      planErrorsByKey,
    });
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
  const currentSlideKey =
    currentPlan && currentSlide ? buildSlideKey(currentPlan.signature, currentSlide.id) : '';
  const currentHtmlResult = currentSlideKey ? htmlBySlide[currentSlideKey] || null : null;
  const currentSlideError = currentSlideKey ? errorsBySlide[currentSlideKey] || null : null;
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

  useEffect(() => {
    if (!currentHtmlResult) setPreviewStats(emptyPreviewStats());
  }, [currentHtmlResult]);

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
    async (planResult: LessonPlanResult, slide: LessonSlidePlan) => {
      const key = buildSlideKey(planResult.signature, slide.id);
      setGeneratingSlideId(slide.id);
      setRunMessage(`正在生成第 ${slide.order}/${planResult.plan.pageCount} 页：${slide.title}`);
      setErrorsBySlide((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        const response = await backendFetch('/api/generate/html-ppt-slide', {
          method: 'POST',
          headers: getHtmlLessonTestHeaders(),
          body: JSON.stringify({
            prompt: slide.htmlPrompt,
            pageKind: slide.pageKind,
            densityContract: buildDensityContract(slide),
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
          return;
        }
        const htmlStats = analyzeHtml(data.html);
        setHtmlBySlide((previous) => ({
          ...previous,
          [key]: {
            html: data.html || '',
            slide,
            prompt: slide.htmlPrompt,
            planSignature: planResult.signature,
            rawResponse: data,
            ...htmlStats,
            createdAt: Date.now(),
          },
        }));
      } catch (error) {
        setErrorsBySlide((previous) => ({
          ...previous,
          [key]: buildUnknownErrorResult(error),
        }));
      } finally {
        setGeneratingSlideId(null);
        setRunMessage('');
      }
    },
    [],
  );

  const handleGeneratePlanOnly = useCallback(() => {
    void generatePlan();
  }, [generatePlan]);

  const handleGenerateCurrentSlide = useCallback(() => {
    if (!currentPlan || !currentSlide) return;
    void generateSlide(currentPlan, currentSlide);
  }, [currentPlan, currentSlide, generateSlide]);

  const handleGenerateMissingSlides = useCallback(async () => {
    if (!currentPlan) return;
    for (const slide of currentPlan.plan.slides) {
      const key = buildSlideKey(currentPlan.signature, slide.id);
      if (htmlBySlide[key]) continue;
      setSelectedSlideId(slide.id);
      await generateSlide(currentPlan, slide);
    }
  }, [currentPlan, generateSlide, htmlBySlide, setSelectedSlideId]);

  const handleGenerateWholeLesson = useCallback(async () => {
    const planResult = await generatePlan();
    if (!planResult) return;
    for (const slide of planResult.plan.slides) {
      setSelectedSlideIdByPlan((previous) => ({
        ...previous,
        [buildPlanKey(planResult.fixtureId, planResult.pageCountTier)]: slide.id,
      }));
      await generateSlide(planResult, slide);
    }
  }, [generatePlan, generateSlide]);

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
  const isBusy = isPlanning || Boolean(generatingSlideId);

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
            <div className="grid min-w-[360px] grid-cols-4 gap-2 text-sm">
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
                </div>
              </div>
            </div>
          </div>
        </header>

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
                  规划阶段会决定每页主题、页型、密度、是否使用原例子或改写例子。
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
                  一键生成整节课 slides
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
                    生成缺失
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
                            {generatingSlideId === slide.id
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
                  <Button
                    type="button"
                    disabled={!currentPlan || !currentSlide || isBusy}
                    onClick={handleGenerateCurrentSlide}
                  >
                    {generatingSlideId === currentSlide?.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    生成当前页 HTML
                  </Button>
                </div>
              </div>

              {currentPlan ? (
                <div className="grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 md:grid-cols-5">
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
                <div className="mt-4 grid gap-3 text-sm lg:grid-cols-4">
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
                    <div className="text-xs font-medium text-slate-500">HTML 输出</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentHtmlResult.elementCount} elements · {currentHtmlResult.htmlLength}{' '}
                      chars
                    </div>
                  </div>
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
                      key={`${currentSlideKey}-${currentHtmlResult.createdAt}`}
                      ref={iframeRef}
                      title="HTML lesson slide preview"
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      srcDoc={currentHtmlResult.html}
                      onLoad={() => setPreviewStats(evaluatePreview(iframeRef.current))}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      {generatingSlideId ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <Code2 className="size-8" />
                      )}
                      <div className="text-sm font-medium">
                        {generatingSlideId ? '正在生成 HTML...' : '生成当前页后在这里预览'}
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
