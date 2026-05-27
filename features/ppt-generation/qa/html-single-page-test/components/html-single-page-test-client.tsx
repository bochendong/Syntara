'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Code2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { HtmlTestProgressionPanel } from '@/components/generation/html-test-progression-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

import {
  analyzeHtml,
  buildDensityContract,
  buildPendingImageAsset,
  buildQualityChecks,
  buildRegenerationFeedback,
  buildSlideIllustrationPrompt,
  buildStoredQuality,
  courseRouteLabel,
  csRouteLabel,
  DEFAULT_PRESET,
  DEFAULT_SLIDE_HEIGHT,
  emptyStats,
  formatCostLabel,
  formatImageCostLabel,
  formatPercent,
  formatTime,
  formatUsageLabel,
  GenerateHtmlPptResponse,
  GenerateSlideImageResponse,
  getEstimatedImageCostLabel,
  getHtmlSinglePageHeaders,
  getPresetCanvasHeight,
  getPresetCanvasMode,
  getPresetSignature,
  getRetryCount,
  hasDeprecatedErrorValues,
  hasDeprecatedRunValues,
  hasMeaningfulBoxClass,
  hasPendingImageAsset,
  hasQualityProblem,
  hasStepContainerClass,
  HTML_IMAGE_SLOT_ATTR,
  HTML_SINGLE_PAGE_MODEL,
  HtmlImageAsset,
  IMAGE_ASSET_TOKEN,
  injectImageAssetIntoHtml,
  isRunExpired,
  isSameStoredQuality,
  markImageSlotHtml,
  mathRouteLabel,
  PAGE_PRESETS,
  persistImageResultToAsset,
  PreviewStats,
  readStoredState,
  resolveImageAssetUrl,
  resultToImageUrl,
  sanitizeErrorsByPreset,
  sanitizePromptByPreset,
  sanitizeRunsByPreset,
  shouldReplaceCachedPrompt,
  shouldUseGeneratedIllustration,
  statusIcon,
  StoredError,
  StoredRun,
  summarizeChecks,
  writeStoredState,
} from '../lib/page-core';

export default function GenerationHtmlSinglePageTestPage() {
  const imageProviderId = useSettingsStore((state) => state.imageProviderId);
  const imageModelId = useSettingsStore((state) => state.imageModelId);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);

  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);
  const [prompt, setPrompt] = useState(DEFAULT_PRESET.prompt);
  const [promptByPreset, setPromptByPreset] = useState<Record<string, string>>({});
  const [runsByPreset, setRunsByPreset] = useState<Record<string, StoredRun>>({});
  const [errorsByPreset, setErrorsByPreset] = useState<Record<string, StoredError>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImageAsset, setIsGeneratingImageAsset] = useState(false);
  const [generationStage, setGenerationStage] = useState<'idle' | 'image' | 'html'>('idle');
  const [previewStats, setPreviewStats] = useState<PreviewStats>(emptyStats);
  const [previewScale, setPreviewScale] = useState(1);
  const [resolvedPreviewHtml, setResolvedPreviewHtml] = useState('');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const qaTimerRef = useRef<number | null>(null);

  const selectedPreset = useMemo(
    () => PAGE_PRESETS.find((preset) => preset.id === selectedPresetId) || PAGE_PRESETS[0],
    [selectedPresetId],
  );
  const selectedCanvasMode = getPresetCanvasMode(selectedPreset);
  const selectedCanvasHeight = getPresetCanvasHeight(selectedPreset);
  const selectedIsLongPage = selectedCanvasMode === 'long';
  const result = runsByPreset[selectedPresetId] || null;
  const error = errorsByPreset[selectedPresetId] || null;
  const selectedImageProvider = IMAGE_PROVIDERS[imageProviderId];
  const selectedImageModelId =
    imageModelId || selectedImageProvider?.models[0]?.id || 'doubao-seedream-5-0-260128';
  const selectedUsesIllustration = shouldUseGeneratedIllustration(selectedPreset);
  const selectedResultExpired = isRunExpired(result || undefined, selectedPreset);
  const selectedImagePending = hasPendingImageAsset(result);
  const qualityChecks = useMemo(
    () =>
      result && !selectedResultExpired ? buildQualityChecks(selectedPreset, previewStats) : [],
    [previewStats, result, selectedPreset, selectedResultExpired],
  );
  const checkSummary = useMemo(() => summarizeChecks(qualityChecks), [qualityChecks]);
  const selectedHasQualityProblem =
    Boolean(result) &&
    qualityChecks.length > 0 &&
    (checkSummary.failed > 0 || checkSummary.warned > 0);
  const regenerationFeedback = useMemo(
    () =>
      result
        ? [
            selectedResultExpired ? '- 当前结果使用的是旧版 preset/prompt，必须重新生成。' : null,
            buildRegenerationFeedback(previewStats, qualityChecks, selectedPreset),
          ]
            .filter(Boolean)
            .join('\n') || null
        : null,
    [previewStats, qualityChecks, result, selectedPreset, selectedResultExpired],
  );
  const history = useMemo(
    () => Object.values(runsByPreset).sort((left, right) => right.createdAt - left.createdAt),
    [runsByPreset],
  );

  useEffect(() => {
    const saved = readStoredState();
    const savedPresetId =
      saved.selectedPresetId && PAGE_PRESETS.some((preset) => preset.id === saved.selectedPresetId)
        ? saved.selectedPresetId
        : DEFAULT_PRESET.id;
    const savedPromptByPreset = sanitizePromptByPreset(saved.promptByPreset || {});
    const savedPreset =
      PAGE_PRESETS.find((preset) => preset.id === savedPresetId) || DEFAULT_PRESET;
    setSelectedPresetId(savedPresetId);
    setPromptByPreset(savedPromptByPreset);
    setPrompt(savedPromptByPreset[savedPresetId] || savedPreset.prompt);
    setRunsByPreset(sanitizeRunsByPreset(saved.runsByPreset));
    setErrorsByPreset(sanitizeErrorsByPreset(saved.errorsByPreset));
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    writeStoredState({
      selectedPresetId,
      promptByPreset,
      runsByPreset,
      errorsByPreset,
    });
  }, [errorsByPreset, isHydrated, promptByPreset, runsByPreset, selectedPresetId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (shouldReplaceCachedPrompt(prompt)) {
      setPrompt(selectedPreset.prompt);
      setPromptByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: selectedPreset.prompt,
      }));
      return;
    }

    setPromptByPreset((previous) => {
      if (previous[selectedPresetId] === prompt) return previous;
      return { ...previous, [selectedPresetId]: prompt };
    });
  }, [isHydrated, prompt, selectedPreset.id, selectedPreset.prompt, selectedPresetId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (hasDeprecatedRunValues(runsByPreset)) {
      setRunsByPreset((previous) => sanitizeRunsByPreset(previous));
    }
    if (hasDeprecatedErrorValues(errorsByPreset)) {
      setErrorsByPreset((previous) => sanitizeErrorsByPreset(previous));
    }
  }, [errorsByPreset, isHydrated, runsByPreset]);

  useEffect(() => {
    let isCancelled = false;
    let objectUrl = '';

    if (!result) {
      setResolvedPreviewHtml('');
      return () => {};
    }

    const resolve = async () => {
      try {
        const imageUrl = await resolveImageAssetUrl(result.imageAsset, isGeneratingImageAsset);
        if (isCancelled) {
          if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
          return;
        }
        objectUrl = imageUrl.startsWith('blob:') ? imageUrl : '';
        setResolvedPreviewHtml(injectImageAssetIntoHtml(result.html, imageUrl));
      } catch {
        if (!isCancelled) setResolvedPreviewHtml(result.html);
      }
    };

    void resolve();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isGeneratingImageAsset, result]);

  useEffect(() => {
    if (
      !isHydrated ||
      !result ||
      selectedResultExpired ||
      qualityChecks.length === 0 ||
      previewStats.slideCount <= 0
    ) {
      return;
    }

    const nextQuality = buildStoredQuality(checkSummary, previewStats);
    if (isSameStoredQuality(result.quality, nextQuality)) return;

    setRunsByPreset((previous) => {
      const current = previous[selectedPresetId];
      if (!current || current.id !== result.id) return previous;
      return {
        ...previous,
        [selectedPresetId]: {
          ...current,
          quality: nextQuality,
        },
      };
    });
  }, [
    checkSummary,
    isHydrated,
    previewStats,
    qualityChecks.length,
    result,
    selectedPresetId,
    selectedResultExpired,
  ]);

  useEffect(() => {
    const element = previewFrameRef.current;
    if (!element) return;

    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const nextScale =
        selectedCanvasMode === 'long'
          ? rect.width / 1600
          : Math.min(rect.width / 1600, rect.height / DEFAULT_SLIDE_HEIGHT);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedCanvasHeight, selectedCanvasMode]);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PAGE_PRESETS.find((item) => item.id === presetId) || PAGE_PRESETS[0];
      setSelectedPresetId(preset.id);
      setPrompt(promptByPreset[preset.id] || preset.prompt);
      setPreviewStats(emptyStats());
    },
    [promptByPreset],
  );

  const inspectPreviewLayout = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = doc?.defaultView;
    if (!doc?.documentElement || !doc.body || !win) {
      setPreviewStats(emptyStats());
      return;
    }

    const root = doc.documentElement;
    const body = doc.body;
    const allElements = Array.from(body.querySelectorAll('*'));
    const canvasMode = getPresetCanvasMode(selectedPreset);
    const canvasHeight = getPresetCanvasHeight(selectedPreset);
    const measuredScrollWidth = Math.ceil(Math.max(root.scrollWidth, body.scrollWidth));
    const measuredScrollHeight = Math.ceil(Math.max(root.scrollHeight, body.scrollHeight));
    const allowedBottom =
      canvasMode === 'long'
        ? Math.max(canvasHeight + 80, measuredScrollHeight + 1)
        : DEFAULT_SLIDE_HEIGHT + 1;
    const canvasArea = 1600 * canvasHeight;
    const textLengths: number[] = [];
    let visibleCharCount = 0;
    let fontCharCount = 0;
    let smallTextCharCountUnder20 = 0;
    let smallTextCharCountUnder22 = 0;
    let smallTextCharCountUnder24 = 0;
    const walker = doc.createTreeWalker(body, win.NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const text = current.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (text) {
        const charCount = text.replace(/\s/g, '').length;
        textLengths.push(text.length);
        visibleCharCount += charCount;

        const parentElement = current.parentElement;
        const fontSize = parentElement
          ? Number.parseFloat(win.getComputedStyle(parentElement).fontSize)
          : Number.NaN;
        if (Number.isFinite(fontSize)) {
          fontCharCount += charCount;
          if (fontSize < 20) smallTextCharCountUnder20 += charCount;
          if (fontSize < 22) smallTextCharCountUnder22 += charCount;
          if (fontSize < 24) smallTextCharCountUnder24 += charCount;
        }
      }
      current = walker.nextNode();
    }

    const outOfBoundsElements = allElements.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.left < -1 || rect.top < -1 || rect.right > 1601 || rect.bottom > allowedBottom;
    });
    const outOfBoundsSamples = outOfBoundsElements.slice(0, 5).map((element) => {
      const rect = element.getBoundingClientRect();
      const className =
        typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';
      const label = [element.tagName.toLowerCase(), className ? `.${className}` : '']
        .join('')
        .trim();
      return `${label} ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(rect.right)},${Math.round(rect.bottom)}`;
    });
    const classText = (element: Element) =>
      `${element.getAttribute('class') || ''} ${element.getAttribute('aria-label') || ''}`.toLowerCase();
    const cardishCount = allElements.filter((element) => hasMeaningfulBoxClass(element)).length;
    const stepishCount = allElements.filter((element) => hasStepContainerClass(element)).length;
    const preOverflowCount = Array.from(body.querySelectorAll('pre, code')).filter((element) => {
      const htmlElement = element as HTMLElement;
      return htmlElement.scrollWidth > htmlElement.clientWidth + 2;
    }).length;
    const images = Array.from(body.querySelectorAll('img'));
    const largeImageCount = images.filter((element) => {
      const rect = element.getBoundingClientRect();
      const slot = element.closest('figure, .visual-slot, .image-frame');
      const slotRect = slot?.getBoundingClientRect();
      const imageAreaRatio = (rect.width * rect.height) / canvasArea;
      const slotAreaRatio = slotRect ? (slotRect.width * slotRect.height) / canvasArea : 0;
      return (
        (rect.width >= 200 && rect.height >= 140 && imageAreaRatio >= 0.04) ||
        (slotAreaRatio >= 0.06 && rect.width > 0 && rect.height > 0)
      );
    }).length;
    const contentRects = allElements
      .filter((element) => {
        if (element.matches('.slide, .slide-content, style')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const hasMeaningfulText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
        return (
          hasMeaningfulText ||
          element.matches('table,thead,tbody,tr,th,td,pre,code,math,svg,img,figure,article,section')
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: Math.max(0, rect.left),
          top: Math.max(0, rect.top),
          right: Math.min(1600, rect.right),
          bottom: Math.min(canvasHeight, rect.bottom),
        };
      })
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    const contentCoverageRatio =
      contentRects.length > 0
        ? ((Math.max(...contentRects.map((rect) => rect.right)) -
            Math.min(...contentRects.map((rect) => rect.left))) *
            (Math.max(...contentRects.map((rect) => rect.bottom)) -
              Math.min(...contentRects.map((rect) => rect.top)))) /
          canvasArea
        : 0;
    const getElementLabel = (element: Element) => {
      const className =
        typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';
      return [element.tagName.toLowerCase(), className ? `.${className}` : ''].join('').trim();
    };
    const getTextBounds = (element: Element) => {
      const textWalker = doc.createTreeWalker(element, win.NodeFilter.SHOW_TEXT);
      let textNode = textWalker.nextNode();
      const rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      while (textNode) {
        const text = textNode.textContent?.replace(/\s+/g, '').trim() || '';
        if (text) {
          const range = doc.createRange();
          range.selectNodeContents(textNode);
          Array.from(range.getClientRects()).forEach((rect) => {
            if (rect.width > 0 && rect.height > 0) {
              rects.push({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              });
            }
          });
          range.detach();
        }
        textNode = textWalker.nextNode();
      }
      if (rects.length === 0) return null;
      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        top: Math.min(...rects.map((rect) => rect.top)),
        right: Math.max(...rects.map((rect) => rect.right)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    };
    const isVisualContainer = (element: Element) => {
      if (element.matches('.slide, .slide-content, style, table, thead, tbody, tr, th, td')) {
        return false;
      }
      const tagName = element.tagName.toLowerCase();
      if (!['div', 'article', 'section', 'aside', 'li'].includes(tagName)) return false;
      const classes = classText(element);
      if (/\b(slide|slide-content|grid|layout|wrapper|content|main|row|columns?)\b/.test(classes)) {
        return false;
      }
      const style = win.getComputedStyle(element);
      const hasContainerClass = hasMeaningfulBoxClass(element);
      const hasVisibleBox =
        style.borderStyle !== 'none' ||
        Number.parseFloat(style.borderRadius) >= 8 ||
        style.boxShadow !== 'none' ||
        !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor);
      return hasContainerClass || hasVisibleBox;
    };
    const largeVisualContainers = allElements.filter((element) => {
      if (!isVisualContainer(element)) return false;
      const rect = element.getBoundingClientRect();
      const areaRatio = (rect.width * rect.height) / canvasArea;
      return areaRatio >= 0.08 && Boolean(element.textContent?.replace(/\s+/g, '').trim());
    });
    const sparseLargeContainers = largeVisualContainers.filter((element) => {
      const rect = element.getBoundingClientRect();
      const hasLargeVisualChild = largeVisualContainers.some((other) => {
        if (other === element || !element.contains(other)) return false;
        const otherRect = other.getBoundingClientRect();
        return (otherRect.width * otherRect.height) / canvasArea >= 0.06;
      });
      if (hasLargeVisualChild) return false;
      if (element.querySelector('img')) return false;

      const textChars = element.textContent?.replace(/\s+/g, '').length || 0;
      const textBounds = getTextBounds(element);
      const textHeightRatio = textBounds ? (textBounds.bottom - textBounds.top) / rect.height : 0;
      const classes = classText(element);
      if (/\b(question|bar|strip)\b/.test(classes) && textChars >= 15 && textHeightRatio >= 0.25) {
        return false;
      }
      if (textChars >= 12 && textHeightRatio >= 0.5) return false;
      return textChars < 30 || textHeightRatio < 0.35;
    });
    const sparseLargeContainerSamples = sparseLargeContainers.slice(0, 5).map((element) => {
      const rect = element.getBoundingClientRect();
      const textChars = element.textContent?.replace(/\s+/g, '').length || 0;
      const textBounds = getTextBounds(element);
      const textHeightRatio = textBounds ? (textBounds.bottom - textBounds.top) / rect.height : 0;
      return `${getElementLabel(element)} ${formatPercent((rect.width * rect.height) / canvasArea)}面积 / ${textChars}字 / ${formatPercent(textHeightRatio)}文字高度`;
    });

    setPreviewStats({
      scrollWidth: measuredScrollWidth,
      scrollHeight: measuredScrollHeight,
      slideCount: doc.querySelectorAll('.slide').length,
      hasSlideContent: Boolean(doc.querySelector('.slide-content')),
      outOfBoundsCount: outOfBoundsElements.length,
      outOfBoundsSamples,
      headingCount: doc.querySelectorAll('h1,h2,h3').length,
      tableCount: doc.querySelectorAll('table').length,
      tableRowCount: doc.querySelectorAll('table tr').length,
      mathCount: doc.querySelectorAll('math').length,
      mspaceCount: doc.querySelectorAll('mspace').length,
      preCount: doc.querySelectorAll('pre').length,
      codeCount: doc.querySelectorAll('code').length,
      listItemCount: doc.querySelectorAll('li').length,
      cardishCount,
      stepishCount,
      textNodeCount: textLengths.length,
      visibleCharCount,
      maxTextLength: Math.max(0, ...textLengths),
      imageCount: images.length,
      largeImageCount,
      contentCoverageRatio,
      sparseLargeContainerCount: sparseLargeContainers.length,
      sparseLargeContainerSamples,
      smallTextRatioUnder20: fontCharCount > 0 ? smallTextCharCountUnder20 / fontCharCount : 0,
      smallTextRatioUnder22: fontCharCount > 0 ? smallTextCharCountUnder22 / fontCharCount : 0,
      smallTextRatioUnder24: fontCharCount > 0 ? smallTextCharCountUnder24 / fontCharCount : 0,
      visibleText: body.innerText || '',
      scriptLikeCount: doc.querySelectorAll('script,iframe,form,object,embed').length,
      preOverflowCount,
    });
  }, [selectedPreset]);

  const schedulePreviewInspection = useCallback(() => {
    if (qaTimerRef.current != null) window.clearTimeout(qaTimerRef.current);
    qaTimerRef.current = window.setTimeout(() => {
      qaTimerRef.current = null;
      inspectPreviewLayout();
    }, 100);
  }, [inspectPreviewLayout]);

  useEffect(() => {
    if (!result) return;
    const timers = [160, 500, 1000].map((delay) => window.setTimeout(inspectPreviewLayout, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (qaTimerRef.current != null) {
        window.clearTimeout(qaTimerRef.current);
        qaTimerRef.current = null;
      }
    };
  }, [inspectPreviewLayout, result]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = (promptTextareaRef.current?.value ?? prompt).trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setGenerationStage('html');
    setPreviewStats(emptyStats());
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPreset.id];
      return next;
    });

    try {
      const imagePrompt = shouldUseGeneratedIllustration(selectedPreset)
        ? buildSlideIllustrationPrompt(selectedPreset, trimmedPrompt)
        : '';
      const imageAsset: HtmlImageAsset | null = shouldUseGeneratedIllustration(selectedPreset)
        ? buildPendingImageAsset({
            providerId: imageProviderId,
            modelId: selectedImageModelId,
            prompt: imagePrompt,
          })
        : null;
      const response = await backendFetch('/api/generate/html-ppt-slide', {
        method: 'POST',
        headers: getHtmlSinglePageHeaders(),
        body: JSON.stringify({
          prompt: trimmedPrompt,
          pageKind: selectedPreset.kind,
          codeRoute: selectedPreset.codeRoute,
          courseRoute: selectedPreset.courseRoute || 'general',
          csRoute: selectedPreset.csRoute,
          mathRoute: selectedPreset.mathRoute,
          densityContract: buildDensityContract(
            selectedPreset.densityProfile,
            getPresetCanvasMode(selectedPreset),
            getPresetCanvasHeight(selectedPreset),
          ),
          canvasMode: getPresetCanvasMode(selectedPreset),
          canvasHeight: getPresetCanvasHeight(selectedPreset),
          qualityFeedback: regenerationFeedback || undefined,
          imageAsset: imageAsset
            ? {
                src: IMAGE_ASSET_TOKEN,
                alt: `${selectedPreset.label} AI 插图`,
                description: imageAsset.prompt,
                aspectRatio: '4:3',
              }
            : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
      if (!response.ok || data.success === false || !data.html) {
        throw new Error(data.error || `HTML 单页生成失败：HTTP ${response.status}`);
      }

      const html = imageAsset ? markImageSlotHtml(data.html) : data.html;
      const run: StoredRun = {
        id: `${Date.now()}`,
        presetId: selectedPreset.id,
        pageKind: selectedPreset.kind,
        canvasMode: getPresetCanvasMode(selectedPreset),
        canvasHeight: getPresetCanvasHeight(selectedPreset),
        codeRoute: selectedPreset.codeRoute,
        courseRoute: selectedPreset.courseRoute || 'general',
        csRoute: selectedPreset.csRoute,
        mathRoute: selectedPreset.mathRoute,
        label: selectedPreset.label,
        createdAt: Date.now(),
        presetSignature: getPresetSignature(selectedPreset),
        prompt: trimmedPrompt,
        model: data.model,
        html,
        usage: data.usage ?? null,
        costEstimate: data.costEstimate ?? null,
        imageAsset,
        generationAttempts: data.generationAttempts,
        retryReasons: data.retryReasons || [],
        skippedCreditCharge: data.skippedCreditCharge,
        ...analyzeHtml(html),
      };
      setRunsByPreset((previous) => ({ ...previous, [selectedPreset.id]: run }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorsByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: {
          presetId: selectedPreset.id,
          pageKind: selectedPreset.kind,
          label: selectedPreset.label,
          createdAt: Date.now(),
          prompt: trimmedPrompt,
          message,
        },
      }));
    } finally {
      setIsGenerating(false);
      setGenerationStage('idle');
    }
  }, [
    imageProviderId,
    isGenerating,
    prompt,
    regenerationFeedback,
    selectedImageModelId,
    selectedPreset,
  ]);

  const handleGenerateImageForCurrentRun = useCallback(async () => {
    const currentRun = runsByPreset[selectedPresetId];
    const pendingAsset = currentRun?.imageAsset;
    if (!currentRun || !pendingAsset || pendingAsset.sourceType !== 'pending') return;
    if (isGeneratingImageAsset) return;

    setIsGeneratingImageAsset(true);
    setGenerationStage('image');
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPreset.id];
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
            name: 'HTML 单页质量测试',
            sceneTitle: selectedPreset.label,
            sceneType: 'generation-html-single-page-test',
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
        preset: selectedPreset,
        providerId: pendingAsset.providerId,
        modelId: imageData.result.usage?.modelId || pendingAsset.modelId,
        costEstimate: imageData.costEstimate,
        skippedCreditCharge: imageData.skippedCreditCharge,
      });

      setRunsByPreset((previous) => {
        const existing = previous[selectedPresetId];
        if (!existing || existing.id !== currentRun.id) return previous;
        return {
          ...previous,
          [selectedPresetId]: {
            ...existing,
            imageAsset: nextAsset,
          },
        };
      });
      setPreviewStats(emptyStats());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorsByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: {
          presetId: selectedPreset.id,
          pageKind: selectedPreset.kind,
          label: selectedPreset.label,
          createdAt: Date.now(),
          prompt: currentRun.prompt,
          message,
        },
      }));
    } finally {
      setIsGeneratingImageAsset(false);
      setGenerationStage('idle');
    }
  }, [
    imageProvidersConfig,
    isGeneratingImageAsset,
    runsByPreset,
    selectedPreset,
    selectedPresetId,
  ]);

  const attachImageSlotClickHandler = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const currentRun = runsByPreset[selectedPresetId];
    const isPending = currentRun?.imageAsset?.sourceType === 'pending';
    if (!doc || !isPending) return;

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
      void handleGenerateImageForCurrentRun();
    };
  }, [handleGenerateImageForCurrentRun, isGeneratingImageAsset, runsByPreset, selectedPresetId]);

  const clearAll = useCallback(() => {
    setRunsByPreset({});
    setErrorsByPreset({});
    setPreviewStats(emptyStats());
  }, []);

  const currentUsageLabel = useMemo(() => formatUsageLabel(result?.usage), [result?.usage]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/test">
              <ArrowLeft className="size-4" />
              返回所有测试
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">HTML 单页</Badge>
            <Badge variant="secondary">
              已保存 {Object.keys(runsByPreset).length}/{PAGE_PRESETS.length}
            </Badge>
            {Object.keys(errorsByPreset).length > 0 ? (
              <Badge variant="destructive">失败 {Object.keys(errorsByPreset).length}</Badge>
            ) : null}
          </div>
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Presentation className="size-4" />
                HTML Single Page QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">HTML 单页质量测试</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                现在这一页直接测试 HTML 生成单页，不走 SceneOutline / layoutTemplate。
                每个样本只指定页面类型和内容目标，用真实 iframe 检查 16:9
                和同宽长页面的结构、越界和类型稳定性。
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              默认模型 {HTML_SINGLE_PAGE_MODEL}
            </Badge>
          </div>
        </header>

        <HtmlTestProgressionPanel currentStageId="html-single-page" />

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">页面类型测试</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    不选 layout template，只看 HTML 单页和长页面在不同教学页面类型下是否稳定。
                  </p>
                </div>
                <Badge variant="outline">{PAGE_PRESETS.length} tests</Badge>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {PAGE_PRESETS.map((preset, index) => {
                  const saved = runsByPreset[preset.id];
                  const savedError = errorsByPreset[preset.id];
                  const isSelected = preset.id === selectedPresetId;
                  const presetCanvasMode = getPresetCanvasMode(preset);
                  const presetCanvasHeight = getPresetCanvasHeight(preset);
                  const savedExpired = isRunExpired(saved, preset);
                  const hasLiveQuality = isSelected && saved && qualityChecks.length > 0;
                  const hasSavedQualityProblem = hasLiveQuality
                    ? checkSummary.failed > 0 || checkSummary.warned > 0
                    : hasQualityProblem(saved?.quality);
                  const savedImagePending = hasPendingImageAsset(saved);
                  const statusLabel = saved
                    ? savedExpired
                      ? '过期'
                      : hasSavedQualityProblem
                        ? '待修正'
                        : savedImagePending
                          ? '待生成图'
                          : '通过'
                    : savedError
                      ? '失败'
                      : '待测';
                  const statusVariant = saved
                    ? savedExpired || hasSavedQualityProblem
                      ? 'destructive'
                      : savedImagePending
                        ? 'outline'
                        : 'secondary'
                    : savedError
                      ? 'destructive'
                      : 'outline';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={cn(
                        'block w-full rounded-xl border px-3 py-3 text-left transition',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">{preset.label}</span>
                            <Badge variant={presetCanvasMode === 'long' ? 'secondary' : 'outline'}>
                              {presetCanvasMode === 'long'
                                ? `长页 ${presetCanvasHeight}px`
                                : '16:9'}
                            </Badge>
                            {preset.codeRoute ? (
                              <Badge variant="outline">
                                {preset.codeRoute === 'memory-trace' ? 'memory' : 'trace'}
                              </Badge>
                            ) : null}
                            <Badge variant="outline">{courseRouteLabel(preset.courseRoute)}</Badge>
                            {preset.courseRoute === 'computer-science' ? (
                              <Badge variant="outline">{csRouteLabel(preset.csRoute)}</Badge>
                            ) : null}
                            {preset.courseRoute === 'math' ? (
                              <Badge variant="outline">{mathRouteLabel(preset.mathRoute)}</Badge>
                            ) : null}
                            <Badge variant="outline">{preset.densityProfile.label}</Badge>
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {preset.requiredSignal}
                          </div>
                          {saved ? (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {formatTime(saved.createdAt)} · {saved.mathElementCount} math ·{' '}
                              {saved.elementCount} elements
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {history.length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="size-4" />
                清空本页 HTML 历史
              </Button>
            ) : null}
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedPreset.label}</Badge>
                    <Badge variant="outline">{selectedPreset.kind}</Badge>
                    <Badge variant="outline">
                      {courseRouteLabel(selectedPreset.courseRoute)}路线
                    </Badge>
                    {selectedPreset.courseRoute === 'computer-science' ? (
                      <Badge variant="outline">{csRouteLabel(selectedPreset.csRoute)}</Badge>
                    ) : null}
                    {selectedPreset.courseRoute === 'math' ? (
                      <Badge variant="outline">{mathRouteLabel(selectedPreset.mathRoute)}</Badge>
                    ) : null}
                    <Badge variant={selectedIsLongPage ? 'secondary' : 'outline'}>
                      {selectedIsLongPage ? `长页 1600×${selectedCanvasHeight}` : '16:9 1600×900'}
                    </Badge>
                    {selectedPreset.codeRoute ? (
                      <Badge variant="outline">
                        {selectedPreset.codeRoute === 'memory-trace'
                          ? 'Memory Trace 路线'
                          : 'Execution Trace 路线'}
                      </Badge>
                    ) : null}
                    <Badge
                      variant={
                        result
                          ? selectedResultExpired || selectedHasQualityProblem
                            ? 'destructive'
                            : selectedImagePending
                              ? 'outline'
                              : 'default'
                          : error
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {result
                        ? selectedResultExpired
                          ? '过期'
                          : selectedHasQualityProblem
                            ? '待修正'
                            : selectedImagePending
                              ? '待生成图'
                              : '通过'
                        : error
                          ? '生成失败'
                          : '未生成'}
                    </Badge>
                    {result && !selectedResultExpired ? (
                      <Badge
                        variant={
                          checkSummary.failed > 0
                            ? 'destructive'
                            : checkSummary.warned > 0
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        QA {checkSummary.passed}/{checkSummary.total}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-normal">
                    {selectedPreset.description}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    目标信号：{selectedPreset.requiredSignal}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    密度目标：{selectedPreset.densityProfile.label} ·{' '}
                    {selectedPreset.densityProfile.textChars.min}-
                    {selectedPreset.densityProfile.textChars.max} 字符 · 覆盖{' '}
                    {formatPercent(selectedPreset.densityProfile.contentCoverage.min)}-
                    {formatPercent(selectedPreset.densityProfile.contentCoverage.max)}
                  </p>
                  {selectedIsLongPage ? (
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      长页模式：宽度仍为 1600px，只允许纵向展开；适合代码题、证明题和长推导。
                    </p>
                  ) : null}
                  {selectedUsesIllustration ? (
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      插图策略：HTML 先放可点击占位图，用户确认后再生成 4:3 AI 教学插图并持久化。
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  disabled={isGenerating || isGeneratingImageAsset || !prompt.trim()}
                  onClick={() => void handleGenerate()}
                >
                  {isGenerating || isGeneratingImageAsset ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {isGenerating
                    ? generationStage === 'image'
                      ? '生成 AI 插图...'
                      : '生成 HTML...'
                    : isGeneratingImageAsset
                      ? '生成 AI 插图...'
                      : regenerationFeedback
                        ? '带 QA 反馈重生成'
                        : '生成 HTML 单页'}
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <label className="block text-xs font-medium text-slate-600">
                  Prompt
                  <Textarea
                    ref={promptTextareaRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="mt-1 min-h-[270px] resize-y rounded-xl font-mono text-xs leading-5"
                  />
                </label>

                <div className="space-y-3 text-sm">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-950">
                    <div className="font-semibold">HTML 生成契约</div>
                    <div className="mt-1">
                      {selectedIsLongPage
                        ? `固定宽 1600px，目标高度约 ${selectedCanvasHeight}px；一张 .slide；不用 layout template；所有内容是 DOM 和 CSS；长内容自然纵向展开。`
                        : '固定 1600×900；一张 .slide；不用 layout template；所有内容是 DOM 和 CSS；数学用 MathML，代码用 pre/code。'}
                    </div>
                    {selectedUsesIllustration ? (
                      <div className="mt-2 rounded-lg border border-blue-100 bg-white/70 px-2 py-1.5">
                        本页会先生成带占位图的 HTML。占位图会显示图片内容说明和预估费用，
                        点击占位图后才真正调用图片模型。
                      </div>
                    ) : null}
                    <div className="mt-2 whitespace-pre-line border-t border-blue-100 pt-2">
                      {buildDensityContract(
                        selectedPreset.densityProfile,
                        getPresetCanvasMode(selectedPreset),
                        getPresetCanvasHeight(selectedPreset),
                      )}
                    </div>
                  </div>
                  {regenerationFeedback ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                      <div className="font-semibold">下次生成会携带 QA 失败详情</div>
                      <div className="mt-1">
                        当前结果存在质检问题，点击生成会把越界/滚动等失败原因一并发给模型修复。
                      </div>
                    </div>
                  ) : null}
                  {result ? (
                    <>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">本次生成模型</div>
                        <div className="font-semibold">
                          {result.model || '未知'}
                          {selectedResultExpired ? (
                            <span className="ml-2 text-xs font-medium text-red-600">旧结果</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">费用</div>
                        <div className="font-semibold">{formatCostLabel(result)}</div>
                      </div>
                      {result.imageAsset ? (
                        <div
                          className={cn(
                            'rounded-xl px-3 py-2',
                            result.imageAsset.sourceType === 'pending'
                              ? 'border border-blue-100 bg-blue-50'
                              : 'bg-slate-50',
                          )}
                        >
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <ImageIcon className="size-3.5" />
                            AI 插图
                          </div>
                          <div className="mt-1 font-semibold">
                            {result.imageAsset.providerName} · {result.imageAsset.modelId}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {result.imageAsset.sourceType === 'pending'
                              ? `待生成 · 点击预览里的图片占位图后生成 · ${result.imageAsset.estimatedCostLabel || getEstimatedImageCostLabel(result.imageAsset.providerId, result.imageAsset.modelId)}`
                              : `4:3 插图素材 · ${formatImageCostLabel(result.imageAsset.costEstimate)}${
                                  result.imageAsset.sourceType === 'indexeddb'
                                    ? ' · 已存 IndexedDB'
                                    : ''
                                }`}
                          </div>
                          {result.imageAsset.sourceType === 'pending' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 w-full border-blue-200 bg-white"
                              disabled={isGeneratingImageAsset}
                              onClick={() => void handleGenerateImageForCurrentRun()}
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
                      ) : null}
                      {currentUsageLabel ? (
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">用量</div>
                          <div className="font-semibold">{currentUsageLabel}</div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">元素</div>
                          <div className="font-semibold">{result.elementCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">MathML</div>
                          <div className="font-semibold">{result.mathElementCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">可见字符</div>
                          <div className="font-semibold">{previewStats.visibleCharCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">覆盖</div>
                          <div className="font-semibold">
                            {formatPercent(previewStats.contentCoverageRatio)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">图片</div>
                          <div className="font-semibold">{previewStats.imageCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">滚动尺寸</div>
                          <div className="font-semibold">
                            {previewStats.scrollWidth || '-'} × {previewStats.scrollHeight || '-'}
                          </div>
                        </div>
                      </div>
                      {getRetryCount(result) > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                          <div className="font-semibold">自动重试 {getRetryCount(result)} 次</div>
                          {result.retryReasons && result.retryReasons.length > 0 ? (
                            <div className="mt-1 space-y-1">
                              {result.retryReasons.map((reason, reasonIndex) => (
                                <div key={`${reason.code || reason.title}-${reasonIndex}`}>
                                  <div className="font-medium">
                                    {reasonIndex + 1}. {reason.title}
                                  </div>
                                  {reason.details && reason.details.length > 0 ? (
                                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                                      {reason.details.slice(0, 3).map((detail, detailIndex) => (
                                        <li key={`${detail}-${detailIndex}`}>{detail}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1">
                              后端进行了自动重试，但这条旧记录没有保存具体原因；重新生成后会记录原因。
                            </div>
                          )}
                        </div>
                      ) : null}
                      {result.skippedCreditCharge ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                          <Save className="mr-1 inline size-3.5" />
                          测试请求跳过本地积分扣费，仅展示估算费用。
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-800">
                      {error.message}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isGenerating}
                    onClick={() => {
                      setPrompt(selectedPreset.prompt);
                      setPromptByPreset((previous) => ({
                        ...previous,
                        [selectedPreset.id]: selectedPreset.prompt,
                      }));
                    }}
                  >
                    <RefreshCw className="size-4" />
                    重置当前 prompt
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">HTML 单页预览</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedIsLongPage
                      ? `真实 iframe 1600×${selectedCanvasHeight}，外层只缩放预览；生成后会检查横向滚动、越界、结构和页面类型信号。`
                      : '真实 iframe 1600×900。生成后会自动检查滚动、越界、结构和页面类型信号。'}
                  </p>
                </div>
                {result ? <Badge variant="outline">{formatTime(result.createdAt)}</Badge> : null}
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className={cn(
                    'relative mx-auto w-full max-w-[1120px] rounded-xl border border-slate-200 bg-white shadow-xl',
                    selectedIsLongPage ? 'overflow-auto' : 'aspect-video overflow-hidden',
                  )}
                  style={
                    selectedIsLongPage
                      ? { height: Math.min(selectedCanvasHeight * previewScale, 760) }
                      : undefined
                  }
                >
                  {isGenerating ? (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                      <Loader2 className="size-8 animate-spin text-blue-700" />
                      {generationStage === 'image' ? '正在生成页面插图' : '正在生成 HTML 单页'}
                    </div>
                  ) : result ? (
                    <div
                      className="relative"
                      style={{
                        width: 1600 * previewScale,
                        height: selectedCanvasHeight * previewScale,
                      }}
                    >
                      <iframe
                        ref={iframeRef}
                        title="Generated HTML single page preview"
                        srcDoc={resolvedPreviewHtml || result.html}
                        className="absolute left-0 top-0 border-0"
                        style={{
                          width: 1600,
                          height: selectedCanvasHeight,
                          transform: `scale(${previewScale})`,
                          transformOrigin: 'top left',
                        }}
                        onLoad={() => {
                          schedulePreviewInspection();
                          attachImageSlotClickHandler();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-slate-400">
                      <Presentation className="size-10" />
                      <div className="text-sm font-medium">生成一页后在这里预览</div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">本地质检</h2>
                  {result ? (
                    <Badge
                      variant={
                        checkSummary.failed > 0
                          ? 'destructive'
                          : checkSummary.warned > 0
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {checkSummary.passed}/{checkSummary.total}
                    </Badge>
                  ) : null}
                </div>
                {qualityChecks.length > 0 ? (
                  <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                    {qualityChecks.map((check) => (
                      <div
                        key={`${check.label}-${check.detail}`}
                        className={cn(
                          'rounded-xl border px-3 py-2',
                          check.status === 'pass' && 'border-emerald-100 bg-emerald-50/60',
                          check.status === 'warn' && 'border-amber-100 bg-amber-50/70',
                          check.status === 'fail' && 'border-red-100 bg-red-50/70',
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {statusIcon(check.status)}
                          {check.label}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                    还没有生成结果。
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Code2 className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">HTML 源码</h2>
                </div>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {result?.html || '等待 HTML 生成结果...'}
                </pre>
              </div>
            </section>

            {history.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">最近生成</h2>
                </div>
                <div className="grid gap-2">
                  {history.slice(0, 8).map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => {
                        applyPreset(run.presetId);
                        setPrompt(run.prompt);
                        setPreviewStats(emptyStats());
                      }}
                      className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-blue-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {run.label} · {run.model || 'unknown'} · {run.elementCount} elements
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {formatCostLabel(run)}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-500">
                        {formatTime(run.createdAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
