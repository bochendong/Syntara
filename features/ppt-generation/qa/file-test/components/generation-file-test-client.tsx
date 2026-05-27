'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileJson,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { DEFAULT_SLIDE_GENERATION_ROUTE } from '@/lib/generation/slide-generation-route';
import { markSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { useCanvasStore } from '@/lib/store/canvas';
import { useStageStore } from '@/lib/store/stage';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { PPTElement, PPTImageElement, Slide, SlideTheme } from '@/lib/types/slides';
import type { Scene, SceneGenerationDiagnostics, SlideContent, Stage } from '@/lib/types/stage';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:file-page-generation-test:v14';
const RESULT_RENDER_VERSION = 'classic-math-render-v3-definition-contract';
const STAGE_ID = 'testfile-page-generation';
const TEST_LIST_PAGE_SIZE = 8;

type FilePageStatusFilter = 'all' | 'pending' | 'generated' | 'error';

function getGenerationTestHeaders(): HeadersInit {
  const headers = new Headers(getApiHeaders({ imageGenerationEnabled: false }));
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

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

interface SceneContentResponse {
  success?: boolean;
  error?: string;
  details?: string;
  content?: unknown;
  contents?: unknown[];
  effectiveOutline?: SceneOutline;
  effectiveOutlines?: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: SceneCostEstimate | null;
  skippedCreditCharge?: boolean;
}

interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

interface SceneCostEstimate {
  baseUsd: number | null;
  retailUsd: number | null;
  computeCredits: number | null;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
}

interface GenerationResult {
  scene: Scene;
  outline: SceneOutline;
  rawResponse: SceneContentResponse;
  generatedContentCount: number;
  createdAt: number;
}

interface GenerationErrorResult {
  message: string;
  details?: string;
  diagnostics?: SceneGenerationDiagnostics;
  httpStatus?: number;
  createdAt: number;
}

interface SavedState {
  selectedFixtureId?: string;
  selectedPageIndexByFixture?: Record<string, number>;
  fixtureSignatures?: Record<string, string>;
  resultsByPage?: Record<string, GenerationResult>;
  errorsByPage?: Record<string, GenerationErrorResult>;
}

const DEFAULT_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#64748b'],
  fontColor: '#111827',
  fontName: 'Microsoft YaHei',
  outline: { color: '#2563eb', width: 2, style: 'solid' },
  shadow: { h: 0, v: 4, blur: 16, color: 'rgba(15, 23, 42, 0.18)' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isGeneratedSlideContent(value: unknown): value is GeneratedSlideContent {
  return isRecord(value) && Array.isArray(value.elements);
}

function pageKey(fixtureId: string, outlineId: string): string {
  return `${fixtureId}:${outlineId}`;
}

function buildOutlineSignature(outline: SceneOutline): string {
  return [
    RESULT_RENDER_VERSION,
    outline.id,
    outline.title,
    outline.description,
    outline.archetype,
    outline.layoutIntent?.layoutTemplate,
    outline.layoutIntent?.layoutFamily,
    outline.layoutIntent?.deckStyle,
    outline.layoutIntent?.backgroundStyleId,
    outline.teachingPagePlan?.concreteAnchor,
    ...(outline.keyPoints || []),
  ].join('/');
}

function buildFixtureSignature(fixture: TestfileFixture): string {
  const outlineSignature = fixture.outlines.map(buildOutlineSignature).join('|');
  return [
    fixture.fileName,
    fixture.fileType,
    fixture.sourceTextLength,
    fixture.outlines.length,
    outlineSignature,
  ].join('::');
}

function buildFixtureSignatures(fixtures: TestfileFixture[]): Record<string, string> {
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.id, buildFixtureSignature(fixture)]),
  );
}

function staleFixtureIds(
  previous: Record<string, string>,
  next: Record<string, string>,
): Set<string> {
  return new Set(
    Object.entries(next)
      .filter(([fixtureId, signature]) => previous[fixtureId] !== signature)
      .map(([fixtureId]) => fixtureId),
  );
}

function pruneStalePageMap<T>(record: Record<string, T>, staleIds: Set<string>): Record<string, T> {
  if (staleIds.size === 0) return record;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => {
      const fixtureId = key.split(':')[0];
      return !staleIds.has(fixtureId);
    }),
  );
}

function resultMatchesOutline(
  result: GenerationResult | null,
  outline: SceneOutline | null,
): boolean {
  return Boolean(
    result && outline && buildOutlineSignature(result.outline) === buildOutlineSignature(outline),
  );
}

function buildStage(language: 'zh-CN' | 'en-US' = 'en-US'): Stage {
  return {
    id: STAGE_ID,
    name: 'Testfile 逐页生成测试',
    description: 'Read source fixtures from testfile and generate one slide at a time.',
    language,
    style: `file-page-test; route=${DEFAULT_SLIDE_GENERATION_ROUTE}`,
    createdAt: 0,
    updatedAt: 0,
  };
}

function buildErrorResult(
  data: SceneContentResponse | FixturesResponse,
  status: number,
  fallback: string,
): GenerationErrorResult {
  return {
    message: data.error || fallback,
    details: data.details,
    diagnostics: 'generationDiagnostics' in data ? data.generationDiagnostics : undefined,
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

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatCostEstimate(cost: SceneCostEstimate | null | undefined): string {
  if (!cost) return '暂无估算';
  const credits =
    typeof cost.computeCredits === 'number' && Number.isFinite(cost.computeCredits)
      ? `${formatNumber(cost.computeCredits)} 算力积分`
      : '积分未知';
  const usd = formatUsd(cost.retailUsd);
  const source = cost.source === 'openai_pricing' ? 'OpenAI 定价估算' : '按 token 兜底估算';
  return `${credits} · ${usd} · ${source}`;
}

function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '暂无 token 用量';
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  return `${formatNumber(totalTokens)} tokens · 输入 ${formatNumber(inputTokens)} / 输出 ${formatNumber(outputTokens)}`;
}

function isGeneratedImagePlaceholder(src: unknown): src is string {
  return typeof src === 'string' && /^gen_img_/.test(src);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlaceholderImage(outline: SceneOutline, elementId: string): string {
  const title = escapeSvgText(outline.title || 'Generated visual');
  const template = escapeSvgText(outline.layoutIntent?.layoutTemplate || 'slide');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eff6ff"/>
      <stop offset="1" stop-color="#fff7ed"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#bg)"/>
  <rect x="58" y="58" width="524" height="244" rx="24" fill="#ffffff" stroke="#bfdbfe" filter="url(#shadow)"/>
  <text x="92" y="124" fill="#1d4ed8" font-family="Arial, sans-serif" font-size="26" font-weight="800">${title}</text>
  <text x="92" y="178" fill="#475569" font-family="Menlo, monospace" font-size="18">${template}</text>
  <text x="92" y="226" fill="#0f172a" font-family="Arial, sans-serif" font-size="18">QA placeholder for ${escapeSvgText(elementId)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function materializeMediaPlaceholders(elements: PPTElement[], outline: SceneOutline): PPTElement[] {
  return elements.map((element) => {
    if (element.type !== 'image' || !isGeneratedImagePlaceholder(element.src)) return element;
    const imageElement = element as PPTImageElement;
    return {
      ...imageElement,
      src: buildPlaceholderImage(outline, imageElement.src),
    };
  });
}

function buildSceneFromGeneratedContent(args: {
  content: GeneratedSlideContent;
  outline: SceneOutline;
  diagnostics?: SceneGenerationDiagnostics;
}): Scene {
  const slide: Slide = {
    id: `file-test-slide-${Date.now()}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: args.content.theme || DEFAULT_THEME,
    elements: materializeMediaPlaceholders(args.content.elements, args.outline),
    background: args.content.background,
  };

  const renderedContent = markSemanticSlideContent({
    type: 'slide',
    canvas: slide,
    syntaraMarkup: args.content.syntaraMarkup,
    semanticDocument: args.content.contentDocument,
  });
  const slideContent: SlideContent =
    renderedContent.type === 'slide'
      ? {
          ...renderedContent,
          canvas: {
            ...renderedContent.canvas,
            elements: materializeMediaPlaceholders(renderedContent.canvas.elements, args.outline),
          },
        }
      : renderedContent;

  const now = Date.now();
  return {
    id: `file-test-scene-${now}`,
    stageId: STAGE_ID,
    type: 'slide',
    title: args.outline.title,
    order: args.outline.order,
    content: slideContent,
    actions: [],
    generationDiagnostics: args.diagnostics,
    createdAt: now,
    updatedAt: now,
  };
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
    // The generated slide JSON can become large; failing to persist should not block testing.
  }
}

function SingleScenePreview({ scene }: { readonly scene: Scene }) {
  useEffect(() => {
    const stageLanguage =
      scene.content.type === 'slide' && scene.content.semanticDocument?.language === 'zh-CN'
        ? 'zh-CN'
        : 'en-US';
    const stage = buildStage(stageLanguage);
    const viewportSize =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportSize ?? 1000) : 1000;
    const viewportRatio =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportRatio ?? 0.5625) : 0.5625;
    useStageStore.setState({
      stage,
      scenes: [scene],
      currentSceneId: scene.id,
      outlines: [],
      mode: 'playback',
      generationStatus: 'completed',
    });
    useCanvasStore.setState({
      viewportSize,
      viewportRatio,
      canvasPercentage: 100,
      canvasDragged: false,
      activeElementIdList: [],
      handleElementId: '',
      spotlightElementId: '',
      spotlightOptions: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      semanticStepTarget: null,
      zoomTarget: null,
    });
  }, [scene]);

  return (
    <SceneProvider>
      <SceneRenderer scene={scene} mode="playback" />
    </SceneProvider>
  );
}

export default function GenerationFileTestClient() {
  const [fixtures, setFixtures] = useState<TestfileFixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [fixtureError, setFixtureError] = useState<GenerationErrorResult | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('');
  const [selectedPageIndexByFixture, setSelectedPageIndexByFixture] = useState<
    Record<string, number>
  >({});
  const [fixtureSignatures, setFixtureSignatures] = useState<Record<string, string>>({});
  const fixtureSignaturesRef = useRef<Record<string, string>>({});
  const [resultsByPage, setResultsByPage] = useState<Record<string, GenerationResult>>({});
  const [errorsByPage, setErrorsByPage] = useState<Record<string, GenerationErrorResult>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState<FilePageStatusFilter>('all');
  const [fixtureFilter, setFixtureFilter] = useState('all');
  const [testPage, setTestPage] = useState(1);

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

      const nextSignatures = buildFixtureSignatures(data.fixtures);
      const staleIds = staleFixtureIds(fixtureSignaturesRef.current, nextSignatures);
      setFixtures(data.fixtures);
      setSelectedFixtureId((previous) =>
        previous && data.fixtures?.some((fixture) => fixture.id === previous)
          ? previous
          : data.fixtures?.[0]?.id || '',
      );
      if (staleIds.size > 0) {
        setSelectedPageIndexByFixture((previous) => ({
          ...previous,
          ...Object.fromEntries(Array.from(staleIds).map((fixtureId) => [fixtureId, 0])),
        }));
        setResultsByPage((previous) => pruneStalePageMap(previous, staleIds));
        setErrorsByPage((previous) => pruneStalePageMap(previous, staleIds));
      }
      fixtureSignaturesRef.current = nextSignatures;
      setFixtureSignatures(nextSignatures);
    } catch (error) {
      setFixtureError(buildUnknownErrorResult(error));
    } finally {
      setIsLoadingFixtures(false);
    }
  }, []);

  useEffect(() => {
    const saved = readSavedState();
    setSelectedFixtureId(saved.selectedFixtureId || '');
    setSelectedPageIndexByFixture(saved.selectedPageIndexByFixture || {});
    fixtureSignaturesRef.current = saved.fixtureSignatures || {};
    setFixtureSignatures(saved.fixtureSignatures || {});
    setResultsByPage(saved.resultsByPage || {});
    setErrorsByPage(saved.errorsByPage || {});
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void loadFixtures();
    const refreshOnFocus = () => {
      void loadFixtures();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [isHydrated, loadFixtures]);

  useEffect(() => {
    if (!isHydrated) return;
    writeSavedState({
      selectedFixtureId,
      selectedPageIndexByFixture,
      fixtureSignatures,
      resultsByPage,
      errorsByPage,
    });
  }, [
    errorsByPage,
    fixtureSignatures,
    isHydrated,
    resultsByPage,
    selectedFixtureId,
    selectedPageIndexByFixture,
  ]);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedFixtureId) || fixtures[0] || null,
    [fixtures, selectedFixtureId],
  );
  const selectedPageIndex = selectedFixture
    ? Math.min(
        Math.max(selectedPageIndexByFixture[selectedFixture.id] || 0, 0),
        Math.max(0, selectedFixture.outlines.length - 1),
      )
    : 0;
  const currentOutline = selectedFixture?.outlines[selectedPageIndex] || null;
  const currentPageKey =
    selectedFixture && currentOutline ? pageKey(selectedFixture.id, currentOutline.id) : '';
  const savedCurrentResult = currentPageKey ? resultsByPage[currentPageKey] || null : null;
  const currentResult = resultMatchesOutline(savedCurrentResult, currentOutline)
    ? savedCurrentResult
    : null;
  const currentError = currentPageKey ? errorsByPage[currentPageKey] || null : null;
  const generatedCount = selectedFixture
    ? selectedFixture.outlines.filter((outline) =>
        resultMatchesOutline(
          resultsByPage[pageKey(selectedFixture.id, outline.id)] || null,
          outline,
        ),
      ).length
    : 0;
  const totalPageCount = fixtures.reduce((sum, fixture) => sum + fixture.outlines.length, 0);
  const totalGeneratedCount = fixtures.reduce(
    (sum, fixture) =>
      sum +
      fixture.outlines.filter((outline) =>
        resultMatchesOutline(resultsByPage[pageKey(fixture.id, outline.id)] || null, outline),
      ).length,
    0,
  );
  const totalErrorCount = Object.keys(errorsByPage).length;
  const currentStatus = currentResult ? 'generated' : currentError ? 'error' : 'pending';
  const currentScore = currentResult ? '1/1' : '0/1';
  const selectedFixtureListIndex = selectedFixture
    ? fixtures.findIndex((fixture) => fixture.id === selectedFixture.id)
    : -1;
  const currentGlobalIndex =
    selectedFixture && selectedFixtureListIndex >= 0
      ? fixtures
          .slice(0, selectedFixtureListIndex)
          .reduce((sum, fixture) => sum + fixture.outlines.length, 0) + selectedPageIndex
      : 0;
  const filePageListItems = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    return fixtures
      .flatMap((fixture) =>
        fixture.outlines.map((outline, pageIndex) => {
          const key = pageKey(fixture.id, outline.id);
          const result = resultMatchesOutline(resultsByPage[key] || null, outline)
            ? resultsByPage[key]
            : null;
          const error = errorsByPage[key] || null;
          const status: Exclude<FilePageStatusFilter, 'all'> = result
            ? 'generated'
            : error
              ? 'error'
              : 'pending';
          return {
            fixture,
            outline,
            pageIndex,
            key,
            result,
            error,
            status,
            sortTime: result?.createdAt || error?.createdAt || 0,
          };
        }),
      )
      .filter((item) => fixtureFilter === 'all' || item.fixture.id === fixtureFilter)
      .filter((item) => testStatusFilter === 'all' || item.status === testStatusFilter)
      .filter((item) => {
        if (!query) return true;
        return [
          item.fixture.title,
          item.fixture.fileName,
          item.outline.title,
          item.outline.id,
          item.outline.layoutIntent?.layoutTemplate,
          item.outline.teachingRole,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.sortTime !== b.sortTime) return b.sortTime - a.sortTime;
        const fixtureDelta = fixtures.indexOf(a.fixture) - fixtures.indexOf(b.fixture);
        if (fixtureDelta !== 0) return fixtureDelta;
        return a.pageIndex - b.pageIndex;
      });
  }, [errorsByPage, fixtureFilter, fixtures, resultsByPage, testSearch, testStatusFilter]);
  const testPageCount = Math.max(1, Math.ceil(filePageListItems.length / TEST_LIST_PAGE_SIZE));
  const safeTestPage = Math.min(testPage, testPageCount);
  const visibleFilePageListItems = filePageListItems.slice(
    (safeTestPage - 1) * TEST_LIST_PAGE_SIZE,
    safeTestPage * TEST_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setTestPage(1);
  }, [fixtureFilter, testSearch, testStatusFilter]);

  const setSelectedPageIndex = useCallback((fixtureId: string, pageIndex: number) => {
    setSelectedPageIndexByFixture((previous) => ({
      ...previous,
      [fixtureId]: pageIndex,
    }));
  }, []);

  const generatePageAt = useCallback(
    async (fixture: TestfileFixture, pageIndex: number) => {
      const outline = fixture.outlines[pageIndex];
      if (!outline) return;
      const key = pageKey(fixture.id, outline.id);
      setSelectedFixtureId(fixture.id);
      setSelectedPageIndex(fixture.id, pageIndex);
      setGeneratingKey(key);
      setErrorsByPage((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        const response = await backendFetch('/api/generate/scene-content', {
          method: 'POST',
          headers: getGenerationTestHeaders(),
          body: JSON.stringify({
            outline,
            allOutlines: fixture.outlines,
            stageInfo: {
              name: fixture.title,
              description: fixture.description,
              language: outline.language || 'en-US',
              style: `file-page-test; source=${fixture.fileName}`,
            },
            stageId: STAGE_ID,
            agents: [],
            slideGenerationRoute: DEFAULT_SLIDE_GENERATION_ROUTE,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as SceneContentResponse;
        if (!response.ok || data.success === false) {
          setErrorsByPage((previous) => ({
            ...previous,
            [key]: buildErrorResult(data, response.status, `生成失败：HTTP ${response.status}`),
          }));
          return;
        }

        const contents =
          Array.isArray(data.contents) && data.contents.length > 0
            ? data.contents
            : data.content
              ? [data.content]
              : [];
        const firstContent = contents[0];
        if (!isGeneratedSlideContent(firstContent)) {
          throw new Error('接口没有返回可渲染的 slide content。');
        }

        const effectiveOutline = data.effectiveOutline || outline;
        const scene = buildSceneFromGeneratedContent({
          content: firstContent,
          outline: effectiveOutline,
          diagnostics: data.generationDiagnostics,
        });
        setResultsByPage((previous) => ({
          ...previous,
          [key]: {
            scene,
            outline: effectiveOutline,
            rawResponse: data,
            generatedContentCount: contents.length,
            createdAt: Date.now(),
          },
        }));
      } catch (error) {
        setErrorsByPage((previous) => ({
          ...previous,
          [key]: buildUnknownErrorResult(error),
        }));
      } finally {
        setGeneratingKey(null);
      }
    },
    [setSelectedPageIndex],
  );

  const handleGenerateCurrent = useCallback(() => {
    if (!selectedFixture) return;
    void generatePageAt(selectedFixture, selectedPageIndex);
  }, [generatePageAt, selectedFixture, selectedPageIndex]);

  const handleGenerateNext = useCallback(() => {
    if (!selectedFixture) return;
    const nextIndex = Math.min(selectedPageIndex + 1, selectedFixture.outlines.length - 1);
    void generatePageAt(selectedFixture, nextIndex);
  }, [generatePageAt, selectedFixture, selectedPageIndex]);

  const clearCurrent = useCallback(() => {
    if (!currentPageKey) return;
    setResultsByPage((previous) => {
      const next = { ...previous };
      delete next[currentPageKey];
      return next;
    });
    setErrorsByPage((previous) => {
      const next = { ...previous };
      delete next[currentPageKey];
      return next;
    });
  }, [currentPageKey]);

  const clearAll = useCallback(() => {
    setResultsByPage({});
    setErrorsByPage({});
  }, []);

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
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <FileJson className="size-4" />
                Testfile Page Generation QA
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
                文件逐页生成测试
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                后端读取 testfile 中的三个固定样本，转成 SceneOutline 队列；这一页逐页调用正式
                scene-content，并持久化每页结果、模型、token 用量和费用估算。
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">文件</div>
                <div className="mt-1 font-semibold text-slate-950">{fixtures.length || 3}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">页面</div>
                <div className="mt-1 font-semibold text-slate-950">{totalPageCount || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">已生成</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {totalGeneratedCount}/{totalPageCount || 0}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(fixtures.length > 0 ? fixtures : []).map((fixture) => (
              <Badge key={fixture.id} variant="outline">
                {fixture.fileName} · {fixture.outlines.length} 页
              </Badge>
            ))}
            {fixtures.length === 0 ? (
              <>
                <Badge variant="outline">oop.md</Badge>
                <Badge variant="outline">Functions PDF</Badge>
                <Badge variant="outline">Victimization PPTX</Badge>
              </>
            ) : null}
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

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,3fr)_minmax(0,7fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">测试列表</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    按最近生成时间排序；每页 {TEST_LIST_PAGE_SIZE}{' '}
                    条，支持按源文件、状态和关键词筛选。
                  </p>
                </div>
                <Badge variant="outline">
                  {filePageListItems.length}/{totalPageCount || 0}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  搜索
                  <Input
                    className="mt-1"
                    placeholder="标题、文件、版式..."
                    value={testSearch}
                    onChange={(event) => setTestSearch(event.target.value)}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    状态
                    <Select
                      value={testStatusFilter}
                      onValueChange={(value) => setTestStatusFilter(value as FilePageStatusFilter)}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="pending">待测</SelectItem>
                        <SelectItem value="generated">通过</SelectItem>
                        <SelectItem value="error">错误</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    源文件
                    <Select value={fixtureFilter} onValueChange={setFixtureFilter}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {fixtures.map((fixture) => (
                          <SelectItem key={fixture.id} value={fixture.id}>
                            {fixture.fileName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isLoadingFixtures}
                  onClick={() => void loadFixtures()}
                >
                  {isLoadingFixtures ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {isLoadingFixtures ? '正在解析 testfile...' : '重新读取 testfile'}
                </Button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleFilePageListItems.length > 0 ? (
                  visibleFilePageListItems.map((item) => {
                    const isSelected =
                      item.fixture.id === selectedFixture?.id &&
                      item.pageIndex === selectedPageIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setSelectedFixtureId(item.fixture.id);
                          setSelectedPageIndex(item.fixture.id, item.pageIndex);
                        }}
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
                                {item.pageIndex + 1}
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {item.outline.title}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">
                              {item.fixture.fileName} · {item.outline.layoutIntent?.layoutTemplate}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge
                              variant={
                                item.status === 'generated'
                                  ? 'default'
                                  : item.status === 'error'
                                    ? 'destructive'
                                    : 'outline'
                              }
                            >
                              {item.status === 'generated'
                                ? '通过 1/1'
                                : item.status === 'error'
                                  ? '错误 0/1'
                                  : '待测 0/1'}
                            </Badge>
                            <span className="text-[11px] text-slate-400">
                              {item.status === 'generated'
                                ? '通过'
                                : item.status === 'error'
                                  ? '错误'
                                  : '待测'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span>
                            {item.sortTime
                              ? `最近 ${new Date(item.sortTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}`
                              : '未生成'}
                          </span>
                          {item.outline.teachingRole ? (
                            <span>· {item.outline.teachingRole}</span>
                          ) : null}
                          {item.outline.layoutIntent?.backgroundStyleId ? (
                            <span>· bg {item.outline.layoutIntent.backgroundStyleId}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    没有匹配的测试页。
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage <= 1}
                  onClick={() => setTestPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>
                <div className="text-center text-xs text-slate-500">
                  {safeTestPage}/{testPageCount} · {filePageListItems.length} pages
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage >= testPageCount}
                  onClick={() => setTestPage((page) => Math.min(testPageCount, page + 1))}
                >
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {currentOutline ? currentGlobalIndex + 1 : 0}/{totalPageCount || 0}
                    </Badge>
                    <Badge variant="outline">{selectedFixture?.fileName || 'testfile'}</Badge>
                    <Badge
                      variant={
                        currentStatus === 'generated'
                          ? 'default'
                          : currentStatus === 'error'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {currentStatus === 'generated'
                        ? '已生成'
                        : currentStatus === 'error'
                          ? '生成失败'
                          : '未生成'}
                    </Badge>
                    <Badge
                      variant={currentResult ? 'default' : currentError ? 'destructive' : 'outline'}
                    >
                      当前 {currentScore}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                    {currentOutline?.title || '等待读取 testfile'}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {currentOutline?.description ||
                      '后端会读取 testfile 里的源文件，转成 SceneOutline 队列，然后逐页调用正式 scene-content。'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedFixture || selectedPageIndex === 0 || Boolean(generatingKey)}
                    onClick={() =>
                      selectedFixture &&
                      setSelectedPageIndex(selectedFixture.id, selectedPageIndex - 1)
                    }
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      !selectedFixture ||
                      selectedPageIndex >= selectedFixture.outlines.length - 1 ||
                      Boolean(generatingKey)
                    }
                    onClick={() =>
                      selectedFixture &&
                      setSelectedPageIndex(selectedFixture.id, selectedPageIndex + 1)
                    }
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-4">
                <div>
                  <div className="font-semibold text-slate-800">当前版式</div>
                  <div>{currentOutline?.layoutIntent?.layoutTemplate || '-'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">教学角色</div>
                  <div>{currentOutline?.teachingRole || '-'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">源文件进度</div>
                  <div>
                    {generatedCount}/{selectedFixture?.outlines.length || 0}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">总进度</div>
                  <div>
                    {totalGeneratedCount}/{totalPageCount || 0}
                    {totalErrorCount ? ` · error ${totalErrorCount}` : ''}
                  </div>
                </div>
              </div>

              {currentError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" />
                    生成失败
                  </div>
                  <p className="mt-1">{currentError.message}</p>
                  {currentError.details ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs">{currentError.details}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  disabled={!selectedFixture || !currentOutline || Boolean(generatingKey)}
                  onClick={handleGenerateCurrent}
                >
                  {generatingKey === currentPageKey ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  生成当前页
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !selectedFixture ||
                    Boolean(generatingKey) ||
                    selectedPageIndex >= selectedFixture.outlines.length - 1
                  }
                  onClick={handleGenerateNext}
                >
                  {generatingKey && generatingKey !== currentPageKey ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  生成下一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!currentResult && !currentError}
                  onClick={clearCurrent}
                >
                  <Trash2 className="size-4" />
                  清当前
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    Object.keys(resultsByPage).length === 0 &&
                    Object.keys(errorsByPage).length === 0
                  }
                  onClick={clearAll}
                >
                  <Trash2 className="size-4" />
                  清全部
                </Button>
              </div>

              {currentResult ? (
                <div className="mt-4 grid gap-3 text-sm lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">模型</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentResult.rawResponse.model || '未返回'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">费用</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCostEstimate(currentResult.rawResponse.costEstimate)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">用量</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatTokenUsage(currentResult.rawResponse.usage)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">生成输出</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentResult.generatedContentCount} 页内容
                    </div>
                  </div>
                  {currentResult.rawResponse.skippedCreditCharge ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 lg:col-span-4">
                      测试请求跳过本地积分扣费，仅展示估算费用。
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">渲染预览</h2>
                  <p className="text-xs text-slate-500">只渲染当前页；下一页必须再点一次生成。</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedFixture || !currentOutline || Boolean(generatingKey)}
                    onClick={handleGenerateCurrent}
                  >
                    {generatingKey === currentPageKey ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {generatingKey === currentPageKey ? '生成中...' : '生成'}
                  </Button>
                  <Badge variant="outline">
                    {currentOutline ? selectedPageIndex + 1 : 0}/
                    {selectedFixture?.outlines.length || 0}
                  </Badge>
                  {currentResult ? (
                    <Badge variant="outline">
                      {new Date(currentResult.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div className="mx-auto aspect-video w-full max-w-[1040px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {currentResult ? (
                    <SingleScenePreview key={currentResult.scene.id} scene={currentResult.scene} />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      {generatingKey ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <Sparkles className="size-8" />
                      )}
                      <div className="text-sm font-medium">
                        {generatingKey ? '正在生成这一页...' : '生成当前页后在这里预览'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {currentOutline && selectedFixture ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="size-4 text-slate-500" />
                    <h2 className="text-sm font-semibold">发送给 scene-content 的 payload</h2>
                  </div>
                  <pre className="max-h-[240px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    {JSON.stringify(
                      {
                        outline: currentOutline,
                        allOutlines: selectedFixture.outlines,
                        stageInfo: {
                          name: selectedFixture.title,
                          description: selectedFixture.description,
                          language: currentOutline.language || 'en-US',
                          style: `file-page-test; source=${selectedFixture.fileName}`,
                        },
                        stageId: STAGE_ID,
                        agents: [],
                        slideGenerationRoute: DEFAULT_SLIDE_GENERATION_ROUTE,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <FileJson className="size-4 text-slate-500" />
                      <h2 className="text-sm font-semibold">生成结果 JSON</h2>
                    </div>
                    {currentResult ? (
                      <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {JSON.stringify(
                          {
                            effectiveOutline: currentResult.outline,
                            generationDiagnostics: currentResult.rawResponse.generationDiagnostics,
                            model: currentResult.rawResponse.model,
                            usage: currentResult.rawResponse.usage,
                            costEstimate: currentResult.rawResponse.costEstimate,
                            skippedCreditCharge: currentResult.rawResponse.skippedCreditCharge,
                            generatedContentCount: currentResult.generatedContentCount,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                        还没有生成结果。
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h2 className="text-sm font-semibold">源片段 / concrete anchor</h2>
                    <Textarea
                      readOnly
                      className="mt-3 min-h-[420px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                      value={
                        currentOutline.teachingPagePlan?.concreteAnchor ||
                        currentOutline.description
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
