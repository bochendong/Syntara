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
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatUsdLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

import { getHtmlLessonTestHeaders } from '../lib/api';
import {
  buildErrorResult,
  buildUnknownErrorResult,
  densityLabel,
  emptyPreviewStats,
  formatCostEstimate,
  formatDuration,
  formatImageCostLabel,
  formatTime,
  formatTokenUsage,
  getEstimatedImageCostLabel,
  pageKindLabel,
  sourceUsageLabel,
} from '../lib/format';
import {
  buildPendingImageAsset,
  injectImageAssetIntoHtml,
  markImageSlotHtml,
  persistImageResultToAsset,
  resolveImageAssetUrl,
  resultToImageUrl,
} from '../lib/image-assets';
import {
  analyzeHtml,
  buildDensityContract,
  buildPlanKey,
  buildPlanSignature,
  buildSlideIllustrationPrompt,
  buildSlideKey,
  courseRoutePromptLabel,
  csRoutePromptLabel,
  inferHtmlCodeRouteFromText,
  inferHtmlCourseRouteFromText,
  inferHtmlCsRouteFromText,
  inferHtmlMathRouteFromText,
  mathRoutePromptLabel,
  shouldUseGeneratedIllustration,
  sourcePagesFromFixture,
} from '../lib/planning';
import { evaluatePreview, getPreviewStatus } from '../lib/preview';
import { readSavedState, writeSavedState } from '../lib/storage';
import {
  HTML_IMAGE_SLOT_ATTR,
  HTML_LESSON_MODEL,
  IMAGE_ASSET_TOKEN,
  HTML_SLIDE_GENERATION_CONCURRENCY,
  TIER_OPTIONS,
  type FixturesResponse,
  type GenerateHtmlPptResponse,
  type GenerateSlideImageResponse,
  type GenerationErrorResult,
  type HtmlSlideResult,
  type LessonPlanResponse,
  type LessonPlanResult,
  type LessonRunTiming,
  type LessonSlidePlan,
  type PageCountTier,
  type PreviewStats,
  type TestfileFixture,
} from '../lib/types';

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
