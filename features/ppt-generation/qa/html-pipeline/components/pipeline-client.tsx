'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  FileText,
  ImageIcon,
  Layers3,
  Loader2,
  RefreshCw,
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
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';

import {
  backendFetchWithTimeout,
  buildLecturePageResult,
  buildSceneOutlineForLecture,
  checksToStepState,
  COURSE_PLAN_REQUEST_TIMEOUT_MS,
  evaluateCoursePlan,
  evaluateCoverPage,
  evaluateHtmlPages,
  evaluateHtmlPrompts,
  evaluateLectureActions,
  evaluateLecturePositioning,
  evaluateRouteContracts,
  evaluateSlideOutlines,
  evaluateSourcePackage,
  extractLectureTargetsFromHtml,
  FixturesResponse,
  formatDuration,
  formatPlanRunMessage,
  formatSavedAt,
  formatStructuredPlanRunMessage,
  getPipelineHeaders,
  getSinglePageTrialSlide,
  getSlideCanvasHeight,
  hasBlockingFailure,
  HTML_PIPELINE_MODEL,
  HTML_SLIDE_GENERATION_CONCURRENCY,
  HTML_SLIDE_REQUEST_TIMEOUT_MS,
  HtmlPageError,
  HtmlPageResult,
  LecturePageResult,
  LessonPlan,
  LessonPlanResponse,
  PageCountTier,
  PIPELINE_RESULT_CONTRACT_VERSION,
  PIPELINE_STEP_LABELS,
  pipelineResultKey,
  PipelineStepId,
  PipelineStepState,
  PlanningQualityReport,
  requestHtmlSlide,
  requestOpenMaicLecturePageResult,
  SavedPipelinePayload,
  sourcePagesFromFixture,
  STRUCTURED_PLAN_REQUEST_TIMEOUT_MS,
  TEST_RESULT_ID,
  TestfileFixture,
  TIER_OPTIONS,
} from '../lib/pipeline-core';
import {
  CoursePlanReadablePanel,
  CoverPageReadablePanel,
  GateCheckList,
  HtmlPagesReadablePanel,
  HtmlPromptsReadablePanel,
  LectureActionsReadablePanel,
  LecturePositioningReadablePanel,
  PipelineSidebar,
  PipelineStepCard,
  PlanningQualityReadablePanel,
  RouteContractReadablePanel,
  SlideOutlinesReadablePanel,
  SourceEvidencePanel,
} from './pipeline-panels';

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
  const [planRunMessage, setPlanRunMessage] = useState('');
  const [isGeneratingStructuredPlan, setIsGeneratingStructuredPlan] = useState(false);
  const [structuredPlanRunMessage, setStructuredPlanRunMessage] = useState('');
  const [lectureResults, setLectureResults] = useState<Record<string, LecturePageResult>>({});
  const [isGeneratingLectureActions, setIsGeneratingLectureActions] = useState(false);
  const [lectureRunMessage, setLectureRunMessage] = useState('');
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
  const routeChecks = useMemo(
    () => evaluateRouteContracts(plan, selectedFixture),
    [plan, selectedFixture],
  );
  const htmlPromptChecks = useMemo(() => evaluateHtmlPrompts(plan), [plan]);
  const singlePageTrialSlide = useMemo(() => getSinglePageTrialSlide(plan), [plan]);
  const coverPageChecks = useMemo(
    () => evaluateCoverPage(plan, coverPageResult, coverPageError),
    [coverPageError, coverPageResult, plan],
  );
  const htmlPageChecks = useMemo(
    () => evaluateHtmlPages(plan, htmlPageResults, htmlPageErrors),
    [htmlPageErrors, htmlPageResults, plan],
  );
  const lectureActionChecks = useMemo(
    () => evaluateLectureActions(plan, htmlPageResults, lectureResults),
    [htmlPageResults, lectureResults, plan],
  );
  const lecturePositioningChecks = useMemo(
    () => evaluateLecturePositioning(plan, lectureResults),
    [lectureResults, plan],
  );
  const sourcePassed = Boolean(selectedFixture) && !hasBlockingFailure(sourceChecks);
  const coursePlanStarted = Boolean(plan?.coursePlan);
  const coursePlanPassed = coursePlanStarted && !hasBlockingFailure(coursePlanChecks);
  const slideOutlineStarted = Boolean(plan?.slideOutlines?.length && plan?.slides?.length);
  const slideOutlinePassed =
    coursePlanPassed && slideOutlineStarted && !hasBlockingFailure(slideOutlineChecks);
  const routeStarted = slideOutlineStarted;
  const routePassed = slideOutlinePassed && routeStarted && !hasBlockingFailure(routeChecks);
  const htmlPromptStarted = slideOutlineStarted;
  const htmlPromptPassed =
    routePassed && htmlPromptStarted && !hasBlockingFailure(htmlPromptChecks);
  const coverPageStarted = Boolean(coverPageResult || coverPageError || isGeneratingCoverPage);
  const coverPagePassed =
    htmlPromptPassed && Boolean(coverPageResult) && !hasBlockingFailure(coverPageChecks);
  const htmlPageStarted =
    Object.keys(htmlPageResults).length > 0 ||
    Object.keys(htmlPageErrors).length > 0 ||
    generatingHtmlSlideIds.length > 0;
  const htmlPagesPassed = coverPagePassed && htmlPageStarted && !hasBlockingFailure(htmlPageChecks);
  const lectureActionsStarted =
    Object.keys(lectureResults).length > 0 || isGeneratingLectureActions;
  const lectureActionsPassed =
    htmlPagesPassed && lectureActionsStarted && !hasBlockingFailure(lectureActionChecks);
  const lecturePositioningStarted = lectureActionsStarted;
  const allChecks = useMemo(
    () => [
      ...sourceChecks,
      ...(coursePlanStarted ? coursePlanChecks : []),
      ...(coursePlanPassed && slideOutlineStarted ? slideOutlineChecks : []),
      ...(slideOutlinePassed && routeStarted ? routeChecks : []),
      ...(routePassed && htmlPromptStarted ? htmlPromptChecks : []),
      ...(htmlPromptPassed && coverPageStarted ? coverPageChecks : []),
      ...(coverPagePassed && htmlPageStarted ? htmlPageChecks : []),
      ...(htmlPagesPassed && lectureActionsStarted ? lectureActionChecks : []),
      ...(lectureActionsPassed && lecturePositioningStarted ? lecturePositioningChecks : []),
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
      htmlPagesPassed,
      htmlPromptPassed,
      htmlPromptStarted,
      lectureActionChecks,
      lectureActionsPassed,
      lectureActionsStarted,
      lecturePositioningChecks,
      lecturePositioningStarted,
      routeChecks,
      routePassed,
      routeStarted,
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
    : isGeneratingStructuredPlan
      ? 'running'
      : slideOutlineStarted
        ? checksToStepState(slideOutlineChecks)
        : 'ready';
  const routeStepState: PipelineStepState = !slideOutlinePassed
    ? 'locked'
    : routeStarted
      ? checksToStepState(routeChecks)
      : 'ready';
  const htmlPromptStepState: PipelineStepState = !routePassed
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
  const lectureActionsStepState: PipelineStepState = !htmlPagesPassed
    ? 'locked'
    : isGeneratingLectureActions
      ? 'running'
      : lectureActionsStarted
        ? checksToStepState(lectureActionChecks)
        : 'ready';
  const lecturePositioningStepState: PipelineStepState = !lectureActionsPassed
    ? 'locked'
    : lecturePositioningStarted
      ? checksToStepState(lecturePositioningChecks)
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
          id: 'route-contract' as const,
          state: routeStepState,
          checks: slideOutlinePassed && routeStarted ? routeChecks : [],
        },
        {
          id: 'html-prompts' as const,
          state: htmlPromptStepState,
          checks: routePassed && htmlPromptStarted ? htmlPromptChecks : [],
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
        {
          id: 'lecture-actions' as const,
          state: lectureActionsStepState,
          checks: htmlPagesPassed && lectureActionsStarted ? lectureActionChecks : [],
        },
        {
          id: 'lecture-positioning' as const,
          state: lecturePositioningStepState,
          checks: lectureActionsPassed && lecturePositioningStarted ? lecturePositioningChecks : [],
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
      htmlPagesPassed,
      htmlPromptStarted,
      htmlPromptStepState,
      lectureActionChecks,
      lectureActionsPassed,
      lectureActionsStarted,
      lectureActionsStepState,
      lecturePositioningChecks,
      lecturePositioningStarted,
      lecturePositioningStepState,
      routeChecks,
      routePassed,
      routeStarted,
      routeStepState,
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
    setPlanRunMessage('');
    setIsGeneratingStructuredPlan(false);
    setStructuredPlanRunMessage('');
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(false);
    setGeneratingHtmlSlideIds([]);
    setHtmlRunMessage('');
    setLectureResults({});
    setIsGeneratingLectureActions(false);
    setLectureRunMessage('');
    setSaveMessage('');
    setSelectedStepId('source');
    try {
      const params = new URLSearchParams({
        mode: 'subject-notebooks',
        subject: '计算机',
        fileName: '02 - Inheritance I.pdf',
        fast: '1',
        ts: String(Date.now()),
      });
      const response = await backendFetch(`/api/generation-quality/testfile-fixtures?${params}`, {
        cache: 'no-store',
      });
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
    if (!selectedFixtureId || isLoadingFixtures || isPlanning || isGeneratingStructuredPlan) return;
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
          payload.contractVersion === PIPELINE_RESULT_CONTRACT_VERSION &&
          payload.fixtureId === selectedFixtureId &&
          payload.tier === selectedTier
        ) {
          setPlanRunMessage('');
          setStructuredPlanRunMessage('');
          setPlanResponse({
            success: true,
            plan: payload.plan,
            planningQuality: payload.planningQuality ?? null,
          });
          setCoverPageResult(payload.coverPage || null);
          setCoverPageError(payload.coverPageError || null);
          setHtmlPageResults(payload.htmlPages || {});
          setHtmlPageErrors(payload.htmlPageErrors || {});
          setLectureResults(payload.lectureResults || {});
          setLectureRunMessage('');
          setSaveMessage(`已恢复 ${formatSavedAt(row.updatedAt)} 保存的分步测试结果。`);
          setSelectedStepId(
            payload.lectureResults && Object.keys(payload.lectureResults).length
              ? 'lecture-positioning'
              : payload.htmlPages && Object.keys(payload.htmlPages).length
                ? 'html-pages'
                : 'course-plan',
          );
          return;
        }
        setPlanResponse(null);
        setPlanRunMessage('');
        setStructuredPlanRunMessage('');
        setCoverPageResult(null);
        setCoverPageError(null);
        setHtmlPageResults({});
        setHtmlPageErrors({});
        setLectureResults({});
        setLectureRunMessage('');
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
  }, [isGeneratingStructuredPlan, isLoadingFixtures, isPlanning, selectedFixtureId, selectedTier]);

  const persistPipelinePayload = useCallback(
    async (
      nextPlan: LessonPlan,
      planningQuality: PlanningQualityReport | null | undefined,
      nextHtmlPages: Record<string, HtmlPageResult>,
      nextHtmlErrors: Record<string, HtmlPageError>,
      nextCoverPage: HtmlPageResult | null = coverPageResult,
      nextCoverError: HtmlPageError | null = coverPageError,
      nextLectureResults: Record<string, LecturePageResult> = lectureResults,
    ) => {
      if (!selectedFixture) return;
      const checksByStage = {
        source: evaluateSourcePackage(selectedFixture, selectedTier),
        coursePlan: evaluateCoursePlan(nextPlan),
        slideOutlines: evaluateSlideOutlines(nextPlan),
        routeContract: evaluateRouteContracts(nextPlan, selectedFixture),
        htmlPrompts: evaluateHtmlPrompts(nextPlan),
        coverPage: evaluateCoverPage(nextPlan, nextCoverPage, nextCoverError),
        htmlPages: evaluateHtmlPages(nextPlan, nextHtmlPages, nextHtmlErrors),
        lectureActions: evaluateLectureActions(nextPlan, nextHtmlPages, nextLectureResults),
        lecturePositioning: evaluateLecturePositioning(nextPlan, nextLectureResults),
      };
      const visibleChecks = [
        ...checksByStage.source,
        ...checksByStage.coursePlan,
        ...checksByStage.slideOutlines,
        ...checksByStage.routeContract,
        ...checksByStage.htmlPrompts,
        ...(nextCoverPage || nextCoverError ? checksByStage.coverPage : []),
        ...(Object.keys(nextHtmlPages).length || Object.keys(nextHtmlErrors).length
          ? checksByStage.htmlPages
          : []),
        ...(Object.keys(nextLectureResults).length ? checksByStage.lectureActions : []),
        ...(Object.keys(nextLectureResults).length ? checksByStage.lecturePositioning : []),
      ];
      const errorCount = visibleChecks.filter((check) => check.status === 'fail').length;
      const generatedHtmlCount = nextPlan.slides.filter((slide) => nextHtmlPages[slide.id]).length;
      const generatedLectureCount = nextPlan.slides.filter(
        (slide) => nextLectureResults[slide.id],
      ).length;
      const payload: SavedPipelinePayload = {
        mode: 'notebook',
        contractVersion: PIPELINE_RESULT_CONTRACT_VERSION,
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
        lectureResults: nextLectureResults,
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
          lectureGeneratedCount: generatedLectureCount,
          errorCount,
          lastUpdatedAt: Date.now(),
        },
        payload,
      }).catch(() => null);
    },
    [coverPageError, coverPageResult, lectureResults, selectedFixture, selectedTier],
  );

  const generatePlan = useCallback(async () => {
    if (!selectedFixture) return;
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      setPlanRunMessage(formatPlanRunMessage(Date.now() - startedAt));
    }, 1000);
    setIsPlanning(true);
    setError('');
    setPlanResponse(null);
    setPlanRunMessage(formatPlanRunMessage(0));
    setIsGeneratingStructuredPlan(false);
    setStructuredPlanRunMessage('');
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(false);
    setGeneratingHtmlSlideIds([]);
    setHtmlRunMessage('');
    setLectureResults({});
    setIsGeneratingLectureActions(false);
    setLectureRunMessage('');
    setSaveMessage('');
    setSelectedStepId('course-plan');
    try {
      const sourcePages = sourcePagesFromFixture(selectedFixture);
      const body = {
        mode: 'notebook',
        planningStage: 'course-spine',
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
      const response = await backendFetchWithTimeout(
        '/api/generation-quality/html-lesson-plan',
        {
          method: 'POST',
          headers: getPipelineHeaders(),
          body: JSON.stringify(body),
        },
        COURSE_PLAN_REQUEST_TIMEOUT_MS,
      );
      const data = (await response.json().catch(() => ({}))) as LessonPlanResponse;
      if (!response.ok || data.success === false || !data.plan) {
        const details = data.details ? `：${data.details}` : '';
        setError(`${data.error || `生成 coursePlan 失败：HTTP ${response.status}`}${details}`);
        setPlanResponse(null);
        return;
      }
      setPlanResponse(data);
      setSelectedStepId('course-plan');
      const visibleChecks = [
        ...evaluateSourcePackage(selectedFixture, selectedTier),
        ...evaluateCoursePlan(data.plan),
      ];
      const errorCount = visibleChecks.filter((check) => check.status === 'fail').length;
      await persistPipelinePayload(data.plan, data.planningQuality || null, {}, {}, null, null, {});
      setSaveMessage(errorCount ? `已保存，仍有 ${errorCount} 个 gate 未通过。` : '已保存，通过。');
    } catch (caught) {
      const caughtError = caught instanceof Error ? caught : null;
      const isTimeout = caughtError?.name === 'AbortError';
      setPlanResponse(null);
      setError(
        isTimeout
          ? `coursePlan 生成超过 ${formatDuration(COURSE_PLAN_REQUEST_TIMEOUT_MS)} 仍未返回，已停止等待。可以先换 gpt-5.4-mini 或减少页数档位复测；如果多次复现，说明卡在规划 LLM 返回或 JSON 解析阶段。`
          : caughtError?.message || String(caught),
      );
    } finally {
      window.clearInterval(progressTimer);
      setPlanRunMessage('');
      setIsPlanning(false);
    }
  }, [persistPipelinePayload, selectedFixture, selectedTier]);

  const generateStructuredPlan = useCallback(async () => {
    if (!selectedFixture || !plan?.coursePlan || !plan.courseSpine) return;
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      setStructuredPlanRunMessage(formatStructuredPlanRunMessage(Date.now() - startedAt));
    }, 1000);
    setIsGeneratingStructuredPlan(true);
    setError('');
    setStructuredPlanRunMessage(formatStructuredPlanRunMessage(0));
    setHtmlPageResults({});
    setHtmlPageErrors({});
    setCoverPageResult(null);
    setCoverPageError(null);
    setIsGeneratingCoverPage(false);
    setGeneratingHtmlSlideIds([]);
    setHtmlRunMessage('');
    setLectureResults({});
    setIsGeneratingLectureActions(false);
    setLectureRunMessage('');
    setSaveMessage('');
    setSelectedStepId('slide-outlines');
    try {
      const sourcePages = sourcePagesFromFixture(selectedFixture);
      const body = {
        mode: 'notebook',
        planningStage: 'full',
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
        coursePlanSeed: plan.coursePlan,
        courseSpineSeed: plan.courseSpine,
      };
      const response = await backendFetchWithTimeout(
        '/api/generation-quality/html-lesson-plan',
        {
          method: 'POST',
          headers: getPipelineHeaders(),
          body: JSON.stringify(body),
        },
        STRUCTURED_PLAN_REQUEST_TIMEOUT_MS,
      );
      const data = (await response.json().catch(() => ({}))) as LessonPlanResponse;
      if (!response.ok || data.success === false || !data.plan) {
        const details = data.details ? `：${data.details}` : '';
        setError(`${data.error || `生成 slideOutlines 失败：HTTP ${response.status}`}${details}`);
        return;
      }
      setPlanResponse(data);
      setSelectedStepId('slide-outlines');
      const visibleChecks = [
        ...evaluateSourcePackage(selectedFixture, selectedTier),
        ...evaluateCoursePlan(data.plan),
        ...evaluateSlideOutlines(data.plan),
        ...evaluateRouteContracts(data.plan, selectedFixture),
        ...evaluateHtmlPrompts(data.plan),
      ];
      const errorCount = visibleChecks.filter((check) => check.status === 'fail').length;
      await persistPipelinePayload(data.plan, data.planningQuality || null, {}, {}, null, null, {});
      setSaveMessage(errorCount ? `已保存，仍有 ${errorCount} 个 gate 未通过。` : '已保存，通过。');
    } catch (caught) {
      const caughtError = caught instanceof Error ? caught : null;
      const isTimeout = caughtError?.name === 'AbortError';
      setError(
        isTimeout
          ? `slideOutlines 生成超过 ${formatDuration(STRUCTURED_PLAN_REQUEST_TIMEOUT_MS)} 仍未返回，已停止等待。`
          : caughtError?.message || String(caught),
      );
    } finally {
      window.clearInterval(progressTimer);
      setStructuredPlanRunMessage('');
      setIsGeneratingStructuredPlan(false);
    }
  }, [persistPipelinePayload, plan?.coursePlan, plan?.courseSpine, selectedFixture, selectedTier]);

  const generateCoverPage = useCallback(async () => {
    if (!plan || !htmlPromptPassed) return;
    const trialSlide = getSinglePageTrialSlide(plan);
    if (!trialSlide) return;

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
        slide: trialSlide,
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
          ? `第 ${trialSlide.order} 页单页试跑失败：${nextError.message}`
          : result
            ? `第 ${trialSlide.order} 页单页试跑结果已保存。`
            : '单页试跑没有生成结果。',
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
    setLectureResults({});
    setLectureRunMessage('');
    setSelectedStepId('html-pages');
    setHtmlRunMessage(`并发生成 HTML：0/${slides.length} 完成 · 并发 ${concurrency}`);

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
            `并发生成 HTML：${completedCount}/${slides.length} 完成 · 成功 ${successCount} · 失败 ${failedCount} · 并发 ${concurrency}`,
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
      coverPageResult,
      coverPageError,
      {},
    );
    setHtmlRunMessage('');
    setSaveMessage(
      failedCount
        ? `整本 HTML 已保存：成功 ${successCount} 页，失败 ${failedCount} 页。`
        : `整本 HTML 已保存：${successCount} 页全部生成。`,
    );
  }, [
    coverPageError,
    coverPagePassed,
    coverPageResult,
    persistPipelinePayload,
    plan,
    planResponse?.planningQuality,
    selectedFixture,
  ]);

  const generateLectureActions = useCallback(async () => {
    if (!plan || !htmlPagesPassed) return;
    const slides = plan.slides;
    const nextResults: Record<string, LecturePageResult> = {};
    const allOutlines = slides.map((slide) => buildSceneOutlineForLecture(plan, slide, []));
    let previousSpeeches: string[] = [];
    let completedCount = 0;
    let generatedCount = 0;

    setError('');
    setSaveMessage('');
    setLectureResults({});
    setIsGeneratingLectureActions(true);
    setSelectedStepId('lecture-actions');
    setLectureRunMessage(`生成讲解稿与动作：0/${slides.length} 完成`);

    try {
      for (const slide of slides) {
        const page = htmlPageResults[slide.id];
        if (!page) {
          completedCount += 1;
          setLectureRunMessage(
            `生成讲解稿与动作：${completedCount}/${slides.length} 完成 · ${generatedCount} 页可用`,
          );
          continue;
        }
        try {
          const targets = await extractLectureTargetsFromHtml({
            html: page.html,
            canvasHeight: page.canvasHeight || getSlideCanvasHeight(slide),
          });
          const openMaicResult = await requestOpenMaicLecturePageResult({
            plan,
            slide,
            page,
            targets,
            allOutlines,
            previousSpeeches,
          }).catch(() => null);
          if (openMaicResult) {
            nextResults[slide.id] = openMaicResult.result;
            previousSpeeches = openMaicResult.previousSpeeches;
          } else {
            nextResults[slide.id] = buildLecturePageResult({
              plan,
              slide,
              page,
              targets,
            });
            nextResults[slide.id].warnings.push(
              'OpenMAIC slide-actions API 不可用，已使用本地讲稿 fallback。',
            );
            previousSpeeches = nextResults[slide.id].scriptText.split('\n\n').filter(Boolean);
          }
          generatedCount += 1;
          setLectureResults({ ...nextResults });
        } catch (caught) {
          nextResults[slide.id] = buildLecturePageResult({
            plan,
            slide,
            page,
            targets: [],
          });
          nextResults[slide.id].warnings.push(
            caught instanceof Error ? caught.message : String(caught),
          );
          generatedCount += 1;
          setLectureResults({ ...nextResults });
        } finally {
          completedCount += 1;
          setLectureRunMessage(
            `生成讲解稿与动作：${completedCount}/${slides.length} 完成 · ${generatedCount} 页可用`,
          );
        }
      }

      await persistPipelinePayload(
        plan,
        planResponse?.planningQuality || null,
        htmlPageResults,
        htmlPageErrors,
        coverPageResult,
        coverPageError,
        nextResults,
      );
      setSaveMessage(
        `讲解稿与动作已保存：${generatedCount} 页，${Object.values(nextResults).reduce(
          (sum, result) => sum + result.actions.length,
          0,
        )} 个 action。`,
      );
    } finally {
      setIsGeneratingLectureActions(false);
      setLectureRunMessage('');
    }
  }, [
    coverPageError,
    coverPageResult,
    htmlPageErrors,
    htmlPageResults,
    htmlPagesPassed,
    persistPipelinePayload,
    plan,
    planResponse?.planningQuality,
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
      selectedImageStats.filteredLimitCount +
      (selectedImageStats.dedupedCount || 0)
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
                专门验收中间产物：Source Package、coursePlan、slideOutlines、课程路线和
                slides[].htmlPrompt；之后先试跑单页 HTML，通过后再全量生成整本页面，最后检查讲解稿、
                讲解动作和遮罩定位。这里固定使用整本 notebook source，不再切换单文件 lesson。
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
                      setPlanRunMessage('');
                      setIsGeneratingStructuredPlan(false);
                      setStructuredPlanRunMessage('');
                      setCoverPageResult(null);
                      setCoverPageError(null);
                      setIsGeneratingCoverPage(false);
                      setHtmlPageResults({});
                      setHtmlPageErrors({});
                      setGeneratingHtmlSlideIds([]);
                      setHtmlRunMessage('');
                      setLectureResults({});
                      setIsGeneratingLectureActions(false);
                      setLectureRunMessage('');
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
                      setPlanRunMessage('');
                      setIsGeneratingStructuredPlan(false);
                      setStructuredPlanRunMessage('');
                      setCoverPageResult(null);
                      setCoverPageError(null);
                      setIsGeneratingCoverPage(false);
                      setHtmlPageResults({});
                      setHtmlPageErrors({});
                      setGeneratingHtmlSlideIds([]);
                      setHtmlRunMessage('');
                      setLectureResults({});
                      setIsGeneratingLectureActions(false);
                      setLectureRunMessage('');
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
                disabled={isLoadingFixtures || isPlanning || isGeneratingStructuredPlan}
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
                actionDisabled={isLoadingFixtures || isPlanning || isGeneratingStructuredPlan}
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
                artifact="courseGoal / coreQuestions / courseSpine"
                description="这一步只验收轻量导演阐述：一句课程目标、2-3 个核心问题和电影脚本主线；叙事推进只看 courseSpine.acts，详细源材料取舍留给逐页 outline。"
                state={coursePlanStepState}
                actionLabel={coursePlanStarted ? '重新生成 coursePlan' : '生成 coursePlan'}
                onAction={() => void generatePlan()}
                actionDisabled={
                  !sourcePassed || isPlanning || isLoadingFixtures || isGeneratingStructuredPlan
                }
                disabledReason="Step 1 的 Source Package gate 通过后，才可以生成 coursePlan。"
              >
                {isPlanning ? (
                  <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                    <div>
                      <div className="font-semibold">正在等待规划 API 返回</div>
                      <div className="mt-1 text-xs leading-5">
                        {planRunMessage || formatPlanRunMessage(0)}
                      </div>
                    </div>
                  </div>
                ) : coursePlanStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={coursePlanChecks} />
                    {plan?.coursePlan ? (
                      <CoursePlanReadablePanel
                        coursePlan={plan.coursePlan}
                        courseSpine={plan.courseSpine}
                      />
                    ) : null}
                    {planResponse?.planningQuality ? (
                      <PlanningQualityReadablePanel report={planResponse.planningQuality} />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                    Source 已通过。点击“生成 coursePlan”只调用轻量主线规划 API；逐页 slideOutlines
                    和 htmlPrompt 会在下一步单独生成。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'slide-outlines' ? (
              <PipelineStepCard
                order={3}
                title="验收 slideOutlines"
                artifact="learnerQuestion / sourceAnchors / visualPlan / continuity"
                description="coursePlan 通过以后，再单独生成并检查逐页教学问题、目标、证据锚点、视觉计划和 continuity。这里失败时，不应该继续验收 htmlPrompt。"
                state={slideOutlineStepState}
                actionLabel={slideOutlineStarted ? '重新生成 slideOutlines' : '生成 slideOutlines'}
                onAction={() => void generateStructuredPlan()}
                actionDisabled={!coursePlanPassed || isGeneratingStructuredPlan || isPlanning}
                disabledReason="Step 2 的 coursePlan gate 通过后，才可以检查 slideOutlines。"
              >
                {isGeneratingStructuredPlan ? (
                  <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                    <div>
                      <div className="font-semibold">正在展开逐页规划</div>
                      <div className="mt-1 text-xs leading-5">
                        {structuredPlanRunMessage || formatStructuredPlanRunMessage(0)}
                      </div>
                    </div>
                  </div>
                ) : slideOutlineStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={slideOutlineChecks} />
                    <SlideOutlinesReadablePanel outlines={plan?.slideOutlines || []} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                    coursePlan 已通过后，点击这里才会生成逐页 slideOutlines；slides[].htmlPrompt
                    会由后端根据 outline 自动合成。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'html-prompts' ? (
              <PipelineStepCard
                order={5}
                title="验收 slides[].htmlPrompt"
                artifact="pageKind / canvasMode / density / mandatoryVisibleContent"
                description="只有课程路线通过以后，才检查每一页是否已经被降解成单页 HTML 生成器能执行的页面契约。这里通过后才适合进入真实 HTML 页面生成。"
                state={htmlPromptStepState}
                disabledReason="Step 4 的课程路线 gate 通过后，才可以检查每页 htmlPrompt。"
              >
                {htmlPromptStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={htmlPromptChecks} />
                    <HtmlPromptsReadablePanel plan={plan || null} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    等待课程路线通过。
                  </div>
                )}
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'route-contract' ? (
              <PipelineStepCard
                order={4}
                title="验收课程路线"
                artifact="courseRoute / csRoute / mathRoute / route prompt"
                description="slideOutlines 通过以后，单独检查这本 notebook 是否走对科目生成线路：数学、CS、社科等不能混成通用模板；CS/数学还要选择自己的子版式。"
                state={routeStepState}
                disabledReason="Step 3 的 slideOutlines gate 通过后，才可以检查课程路线。"
              >
                {routeStarted ? (
                  <div className="grid gap-4">
                    <GateCheckList checks={routeChecks} />
                    <RouteContractReadablePanel plan={plan || null} fixture={selectedFixture} />
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
                order={6}
                title="先试跑单页 HTML"
                artifact="single page HTML / iframe QA / retry feedback"
                description="slides[].htmlPrompt 通过以后，先只生成第一张非封面正文页作为单页 gate。单页通过后再开放整本全量生成，避免把同类版式问题一次性放大。"
                state={coverPageStepState}
                actionLabel={
                  coverPageStarted
                    ? '重新试跑正文单页'
                    : singlePageTrialSlide
                      ? `试跑第 ${singlePageTrialSlide.order} 页`
                      : '试跑正文单页'
                }
                onAction={() => void generateCoverPage()}
                actionDisabled={!htmlPromptPassed || isGeneratingCoverPage}
                disabledReason="Step 5 的 htmlPrompt gate 通过后，才可以先试跑单页 HTML。"
              >
                <div className="grid gap-4">
                  {coverPageStarted ? <GateCheckList checks={coverPageChecks} /> : null}
                  {!coverPageStarted ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                      htmlPrompt 已通过。点击试跑只调用第一张非封面正文页的 HTML
                      生成接口，先看正文页是否能通过 iframe 和视觉 gate。
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
                order={7}
                title="再全量生成整本 HTML"
                artifact="html pages / iframe preview / generation errors"
                description={`单页 gate 通过以后，在当前 pipeline 内并发调用真实 HTML 生成接口（最多 ${HTML_SLIDE_GENERATION_CONCURRENCY} 页同时生成），保存整本 notebook 的 HTML 结果、错误和预览。`}
                state={htmlPagesStepState}
                actionLabel={
                  htmlPageStarted || Object.keys(htmlPageResults).length
                    ? '重新生成整本 HTML'
                    : '生成整本 HTML'
                }
                onAction={() => void generateAllHtmlPages()}
                actionDisabled={!coverPagePassed || generatingHtmlSlideIds.length > 0}
                disabledReason="Step 6 的单页试跑通过后，才可以进入完整 HTML 页面生成。"
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
                      <div className="font-semibold">单页 gate 和规划链路已通过</div>
                      <div className="mt-1 text-xs">
                        点击“生成整本 HTML”会在当前页面并发调用真实 HTML
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

            {selectedStepId === 'lecture-actions' ? (
              <PipelineStepCard
                order={8}
                title="最后生成讲解稿与动作"
                artifact="script / speech / spotlight / laser"
                description="整本 HTML 通过以后，从每页真实 DOM 里提取可定位目标，再生成讲解稿正文和 spotlight/laser 动作。这里验证讲解稿不空泛，且动作能被课堂播放链路理解。"
                state={lectureActionsStepState}
                actionLabel={lectureActionsStarted ? '重新生成讲解稿' : '生成讲解稿'}
                onAction={() => void generateLectureActions()}
                actionDisabled={!htmlPagesPassed || isGeneratingLectureActions}
                disabledReason="Step 7 的整本 HTML 页面生成通过后，才可以生成讲解稿和讲解动作。"
              >
                <div className="grid gap-4">
                  {lectureRunMessage ? (
                    <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      <Loader2 className="size-4 animate-spin" />
                      {lectureRunMessage}
                    </div>
                  ) : null}
                  {lectureActionsStarted ? (
                    <GateCheckList checks={lectureActionChecks} />
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                      HTML 页面已经生成。点击“生成讲解稿”会读取每页 iframe DOM
                      的标题、代码块、图表、卡片等可讲目标，生成讲解稿、speech 和 spotlight/laser
                      动作。
                    </div>
                  )}
                  <LectureActionsReadablePanel
                    plan={plan}
                    results={lectureResults}
                    isGenerating={isGeneratingLectureActions}
                  />
                </div>
              </PipelineStepCard>
            ) : null}

            {selectedStepId === 'lecture-positioning' ? (
              <PipelineStepCard
                order={9}
                title="验收讲解遮罩定位"
                artifact="target rect / mask preview / selector"
                description="讲解动作通过以后，只检查非封面正文页的 spotlight/laser targetId 是否能解析成 HTML 画布内的 rect，并用遮罩预览确认定位真的落到页面内容上。"
                state={lecturePositioningStepState}
                disabledReason="Step 8 的讲解动作 gate 通过后，才可以检查正文页遮罩与定位能力。"
              >
                <div className="grid gap-4">
                  {lecturePositioningStarted ? (
                    <GateCheckList checks={lecturePositioningChecks} />
                  ) : null}
                  <LecturePositioningReadablePanel
                    plan={plan}
                    pages={htmlPageResults}
                    results={lectureResults}
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
