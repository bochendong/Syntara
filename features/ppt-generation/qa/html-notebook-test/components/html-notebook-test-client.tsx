'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch } from '@/lib/utils/backend-api';

import {
  analyzeHtml,
  backendFetchWithTimeout,
  buildActualHtmlRequestPreview,
  buildDensityContract,
  buildErrorResult,
  buildPendingImageAsset,
  buildPlanKey,
  buildPlanSignature,
  buildPreviewQualityFeedback,
  buildSlideIllustrationPrompt,
  buildSlideKey,
  buildStructuredSlideContext,
  buildUnknownErrorResult,
  courseRoutePromptLabel,
  csRoutePromptLabel,
  emptyPreviewStats,
  FixturesResponse,
  GenerateHtmlPptResponse,
  GenerateSlideImageResponse,
  GenerationErrorResult,
  getAssignedSourceImages,
  getHtmlLessonTestHeaders,
  getPreviewStatus,
  getSlideCanvasHeight,
  getSlideCanvasMode,
  HTML_IMAGE_SLOT_ATTR,
  HTML_SLIDE_GENERATION_CONCURRENCY,
  HTML_SLIDE_REQUEST_TIMEOUT_MS,
  HtmlSlideGenerationJob,
  HtmlSlideResult,
  IMAGE_ASSET_TOKEN,
  inferHtmlCodeRouteFromText,
  inferHtmlCourseRouteFromText,
  inferHtmlCsRouteFromText,
  inferHtmlMathRouteFromText,
  injectImageAssetIntoHtml,
  LessonPlanResponse,
  LessonPlanResult,
  LessonRunTiming,
  LessonSlidePlan,
  markImageSlotHtml,
  mathRoutePromptLabel,
  normalizePreviewStats,
  PageCountTier,
  persistImageResultToAsset,
  PreviewStats,
  readSavedState,
  resolveImageAssetUrl,
  resultToImageUrl,
  shouldUseGeneratedIllustration,
  sourceImageLabel,
  sourcePagesFromFixture,
  TestfileFixture,
  writeSavedState,
} from '../lib/page-core';
import {
  HtmlNotebookHeader,
  HtmlNotebookPlanDetailsPanel,
  HtmlNotebookPreviewPanel,
  HtmlNotebookSidebar,
  HtmlNotebookSlidePanel,
} from './html-notebook-panels';

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
              lessonPlan: planResult.plan,
              slidePlan: slide,
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
        <HtmlNotebookHeader
          activePipelinePhase={activePipelinePhase}
          currentPlan={currentPlan}
          errorCount={errorCount}
          fixtureError={fixtureError}
          generatedCount={generatedCount}
          generatedImageCount={generatedImageCount}
          imageCapableCount={imageCapableCount}
          pendingImageCount={pendingImageCount}
          slideJobSummary={slideJobSummary}
          sourceImageCount={sourceImageCount}
          sourceImageUsageCount={sourceImageUsageCount}
          totalHtmlCost={totalHtmlCost}
          totalImageCost={totalImageCost}
        />

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(340px,3fr)_minmax(0,7fr)]">
          <HtmlNotebookSidebar
            clearCurrentPlan={clearCurrentPlan}
            currentPlan={currentPlan}
            currentPlanError={currentPlanError}
            currentSlide={currentSlide}
            errorCount={errorCount}
            errorsBySlide={errorsBySlide}
            fixtures={fixtures}
            generatedCount={generatedCount}
            generatingSlideIdSet={generatingSlideIdSet}
            handleGenerateMissingSlides={handleGenerateMissingSlides}
            handleGeneratePlanOnly={handleGeneratePlanOnly}
            handleGenerateWholeLesson={handleGenerateWholeLesson}
            htmlBySlide={htmlBySlide}
            isBusy={isBusy}
            isLoadingFixtures={isLoadingFixtures}
            isPlanning={isPlanning}
            jobsBySlide={jobsBySlide}
            loadFixtures={loadFixtures}
            runMessage={runMessage}
            selectedFixture={selectedFixture}
            selectedTier={selectedTier}
            setSelectedFixtureId={setSelectedFixtureId}
            setSelectedSlideId={setSelectedSlideId}
            setSelectedTier={setSelectedTier}
            slideJobSummary={slideJobSummary}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <HtmlNotebookSlidePanel
              currentCanvasMode={currentCanvasMode}
              currentHtmlResult={currentHtmlResult}
              currentPlan={currentPlan}
              currentSlide={currentSlide}
              currentSlideError={currentSlideError}
              currentSlideJob={currentSlideJob}
              currentSlideOutline={currentSlideOutline}
              currentSourceUseRationale={currentSourceUseRationale}
              generatingSlideIdSet={generatingSlideIdSet}
              handleGenerateCurrentSlide={handleGenerateCurrentSlide}
              handleGenerateImageForCurrentSlide={handleGenerateImageForCurrentSlide}
              isBusy={isBusy}
              isGeneratingImageAsset={isGeneratingImageAsset}
              selectedFixture={selectedFixture}
            />

            <HtmlNotebookPreviewPanel
              attachImageSlotClickHandler={attachImageSlotClickHandler}
              currentCanvasHeight={currentCanvasHeight}
              currentCanvasMode={currentCanvasMode}
              currentHtmlResult={currentHtmlResult}
              currentPlan={currentPlan}
              currentSlide={currentSlide}
              currentSlideIndex={currentSlideIndex}
              currentSlideJob={currentSlideJob}
              currentSlideKey={currentSlideKey}
              effectivePreviewStatus={effectivePreviewStatus}
              handleGenerateCurrentSlide={handleGenerateCurrentSlide}
              handleSelectNextSlide={handleSelectNextSlide}
              handleSelectPreviousSlide={handleSelectPreviousSlide}
              hasSourceImageContractIssue={hasSourceImageContractIssue}
              iframeRef={iframeRef}
              isBusy={isBusy}
              isGeneratingImageAsset={isGeneratingImageAsset}
              nextSlide={nextSlide}
              previewFrameRef={previewFrameRef}
              previewScale={previewScale}
              previousSlide={previousSlide}
              resolvedPreviewHtml={resolvedPreviewHtml}
              safePreviewStats={safePreviewStats}
              setPreviewStats={setPreviewStats}
            />

            <HtmlNotebookPlanDetailsPanel
              actualHtmlRequestPreview={actualHtmlRequestPreview}
              currentPlan={currentPlan}
              currentSlide={currentSlide}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
