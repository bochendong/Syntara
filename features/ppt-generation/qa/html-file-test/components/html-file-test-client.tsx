'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { HtmlTestProgressionPanel } from '@/components/generation/html-test-progression-panel';
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
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

import {
  buildErrorResult,
  buildDensityContract,
  buildFixtureSignatures,
  buildHtmlPrompt,
  buildUnknownErrorResult,
  buildOutlineSignature,
  analyzeHtml,
  densityLevelForOutline,
  emptyPreviewStats,
  evaluatePreview,
  formatCostEstimate,
  formatTime,
  formatTokenUsage,
  getHtmlFileTestHeaders,
  getPreviewStatus,
  HTML_FILE_PAGE_MODEL,
  inferHtmlCodeRoute,
  inferHtmlCourseRoute,
  inferHtmlCsRoute,
  inferHtmlMathRoute,
  pageKey,
  pageKindLabel,
  readSavedState,
  RESULT_RENDER_VERSION,
  resultMatchesOutline,
  staleFixtureIds,
  TEST_LIST_PAGE_SIZE,
  inferHtmlPageKind,
  pruneStalePageMap,
  writeSavedState,
  type FilePageStatusFilter,
  type GenerationErrorResult,
  type GenerateHtmlPptResponse,
  type HtmlGenerationResult,
  type PreviewStats,
  type TestfileFixture,
  type FixturesResponse,
} from '../lib/html-file-test-utils';
export function GenerationHtmlFileTestClient() {
  const [fixtures, setFixtures] = useState<TestfileFixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [fixtureError, setFixtureError] = useState<GenerationErrorResult | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [selectedPageIndexByFixture, setSelectedPageIndexByFixture] = useState<
    Record<string, number>
  >({});
  const [fixtureSignatures, setFixtureSignatures] = useState<Record<string, string>>({});
  const fixtureSignaturesRef = useRef<Record<string, string>>({});
  const [resultsByPage, setResultsByPage] = useState<Record<string, HtmlGenerationResult>>({});
  const [errorsByPage, setErrorsByPage] = useState<Record<string, GenerationErrorResult>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState<FilePageStatusFilter>('all');
  const [fixtureFilter, setFixtureFilter] = useState('all');
  const [testPage, setTestPage] = useState(1);
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
  const currentPageKind = currentOutline
    ? inferHtmlPageKind(currentOutline, selectedPageIndex)
    : 'auto';
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
            pageKind: inferHtmlPageKind(outline, pageIndex),
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
          pageKindLabel(item.pageKind),
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

  useEffect(() => {
    if (!currentResult) {
      setPreviewStats(emptyPreviewStats());
    }
  }, [currentResult]);

  useEffect(() => {
    if (!currentResult) return;
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
  }, [currentPageKey, currentResult]);

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
      const pageKind = inferHtmlPageKind(outline, pageIndex);
      const courseRoute = inferHtmlCourseRoute(outline);
      const csRoute = courseRoute === 'computer-science' ? inferHtmlCsRoute(outline) : undefined;
      const mathRoute = courseRoute === 'math' ? inferHtmlMathRoute(outline, pageKind) : undefined;
      const prompt = buildHtmlPrompt({ fixture, outline, pageIndex, pageKind });
      setSelectedFixtureId(fixture.id);
      setSelectedPageIndex(fixture.id, pageIndex);
      setGeneratingKey(key);
      setErrorsByPage((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        const response = await backendFetch('/api/generate/html-ppt-slide', {
          method: 'POST',
          headers: getHtmlFileTestHeaders(),
          body: JSON.stringify({
            prompt,
            pageKind: pageKind === 'auto' ? undefined : pageKind,
            codeRoute: pageKind === 'code' ? inferHtmlCodeRoute(outline) : undefined,
            courseRoute,
            csRoute,
            mathRoute,
            densityContract: buildDensityContract(densityLevelForOutline(outline), pageKind),
          }),
        });

        const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
        if (!response.ok || data.success === false || !data.html) {
          setErrorsByPage((previous) => ({
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
        setResultsByPage((previous) => ({
          ...previous,
          [key]: {
            html: data.html || '',
            prompt,
            outline,
            signature: buildOutlineSignature(outline),
            renderVersion: RESULT_RENDER_VERSION,
            pageKind,
            courseRoute,
            csRoute,
            mathRoute,
            rawResponse: data,
            ...htmlStats,
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

  const previewStatus = getPreviewStatus(previewStats);

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
                <FileCode2 className="size-4" />
                Testfile HTML Page Generation QA
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
                文件逐页 HTML 生成测试
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                同样读取 testfile 的三个固定样本和逐页队列，但每页直接生成一张 1600×900 HTML/CSS
                PPT；用于对比 HTML 单页链路在真实文件输入下是否稳定。
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-4 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">模型</div>
                <div className="mt-1 font-semibold text-slate-950">{HTML_FILE_PAGE_MODEL}</div>
              </div>
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

        <HtmlTestProgressionPanel currentStageId="html-file-page" />

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
                    三个 testfile 样本逐页展开；每次只生成当前页的 HTML。
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
                    placeholder="标题、文件、HTML 类型..."
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
                              {item.fixture.fileName} · {pageKindLabel(item.pageKind)}
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
                              {item.sortTime ? formatTime(item.sortTime) : '未生成'}
                            </span>
                          </div>
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
                    <Badge variant="outline">{pageKindLabel(currentPageKind)}</Badge>
                    <Badge
                      variant={currentResult ? 'default' : currentError ? 'destructive' : 'outline'}
                    >
                      {currentResult ? '已生成' : currentError ? '生成失败' : '未生成'}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                    {currentOutline?.title || '等待读取 testfile'}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {currentOutline?.description ||
                      '后端会读取 testfile，转成逐页队列；这里把每页改用 HTML PPT 生成链路。'}
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

              <div className="mb-4 grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-5">
                <div>
                  <div className="font-semibold text-slate-800">HTML 类型</div>
                  <div>{pageKindLabel(currentPageKind)}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">原始版式</div>
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
                  生成当前页 HTML
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
                    <div className="text-xs font-medium text-slate-500">HTML 输出</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentResult.elementCount} elements · {currentResult.htmlLength} chars
                    </div>
                  </div>
                  {currentResult.rawResponse.retryReasons?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-4">
                      <div className="font-semibold">自动重试原因</div>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                        {currentResult.rawResponse.retryReasons.map((reason, index) => (
                          <li key={`${reason.code || reason.title}-${index}`}>
                            {reason.title}
                            {reason.details?.length ? `：${reason.details.join(' / ')}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
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
                  <h2 className="text-sm font-semibold">HTML 预览</h2>
                  <p className="text-xs text-slate-500">
                    iframe 按 1600×900 渲染；生成后自动检查滚动、越界和基础 DOM 结构。
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {currentResult ? (
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
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className="relative mx-auto aspect-video w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                >
                  {currentResult ? (
                    <iframe
                      key={`${currentPageKey}-${currentResult.createdAt}`}
                      ref={iframeRef}
                      title="HTML file page preview"
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      srcDoc={currentResult.html}
                      onLoad={() => setPreviewStats(evaluatePreview(iframeRef.current))}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      {generatingKey ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <Code2 className="size-8" />
                      )}
                      <div className="text-sm font-medium">
                        {generatingKey ? '正在生成 HTML...' : '生成当前页后在这里预览'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {currentResult ? (
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

            {currentOutline && selectedFixture ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="size-4 text-slate-500" />
                    <h2 className="text-sm font-semibold">发送给 HTML 生成接口的 prompt</h2>
                  </div>
                  <Textarea
                    readOnly
                    className="min-h-[280px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                    value={
                      currentResult?.prompt ||
                      buildHtmlPrompt({
                        fixture: selectedFixture,
                        outline: currentOutline,
                        pageIndex: selectedPageIndex,
                        pageKind: currentPageKind,
                      })
                    }
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <FileCode2 className="size-4 text-slate-500" />
                      <h2 className="text-sm font-semibold">生成结果 JSON</h2>
                    </div>
                    {currentResult ? (
                      <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {JSON.stringify(
                          {
                            pageKind: currentResult.pageKind,
                            model: currentResult.rawResponse.model,
                            usage: currentResult.rawResponse.usage,
                            costEstimate: currentResult.rawResponse.costEstimate,
                            generationAttempts: currentResult.rawResponse.generationAttempts,
                            retryReasons: currentResult.rawResponse.retryReasons,
                            skippedCreditCharge: currentResult.rawResponse.skippedCreditCharge,
                            htmlStats: {
                              htmlLength: currentResult.htmlLength,
                              textNodeCount: currentResult.textNodeCount,
                              elementCount: currentResult.elementCount,
                              mathElementCount: currentResult.mathElementCount,
                            },
                            previewStats,
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
