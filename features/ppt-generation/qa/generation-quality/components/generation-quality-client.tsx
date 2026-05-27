'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileJson,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SLIDE_GENERATION_ROUTE,
  SLIDE_GENERATION_ROUTE_LABELS,
  type SlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
import type { SceneOutline } from '@/lib/types/generation';
import type { Stage } from '@/lib/types/stage';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

import {
  buildDefaultPresetInput,
  buildGenerationErrorResult,
  buildOutline,
  buildQualityAllOutlines,
  buildSceneFromGeneratedContent,
  buildStage,
  buildUnknownErrorResult,
  DECK_STYLE_OPTIONS,
  DECK_STYLE_VALUES,
  DeckStyleValue,
  ErrorsByPreset,
  evaluateResult,
  GenerationErrorPanel,
  GenerationResultsByPreset,
  getGenerationQualityHeaders,
  getPresetGroupDescription,
  getPresetGroupLabel,
  getQualityPreset,
  inferInputLanguage,
  isGeneratedSlideContent,
  isLayoutOptionValue,
  LAYOUT_OPTIONS,
  LayoutOptionValue,
  normalizePresetInput,
  PRESET_GROUP_ORDER,
  presetInputMatches,
  PresetInputsByPreset,
  PresetInputState,
  PromptPreviewResponse,
  PromptPreviewsByPreset,
  PromptReadonlyBlock,
  QUALITY_PRESETS,
  readGenerationQualitySavedState,
  SceneContentResponse,
  SingleScenePreview,
  statusBadgeVariant,
  statusIcon,
  TEST_LIST_PAGE_SIZE,
  TestListStatus,
  testStatusBadgeVariant,
  TestStatusFilter,
  testStatusLabel,
  writeGenerationQualitySavedState,
} from '../lib/page-core';

type GenerationQualityPageProps = {
  slideGenerationRoute?: SlideGenerationRoute;
  pageTitle?: string;
  pageDescription?: string;
  storageKey?: string;
  stageId?: string;
  stageName?: string;
  stageDescription?: string;
};

function stripOpenMaicTeachingContract(outline: SceneOutline): SceneOutline {
  const {
    teachingPlanId: _teachingPlanId,
    teachingPagePlan: _teachingPagePlan,
    selectedSkillIds: _selectedSkillIds,
    skillReasons: _skillReasons,
    pagePatternId: _pagePatternId,
    ...rest
  } = outline;
  return rest;
}

function prepareOutlineForRoute(outline: SceneOutline, route: SlideGenerationRoute): SceneOutline {
  return route === 'openmaic-legacy' ? stripOpenMaicTeachingContract(outline) : outline;
}

export default function GenerationQualityPage({
  slideGenerationRoute = DEFAULT_SLIDE_GENERATION_ROUTE,
  pageTitle = '单页生成质量测试',
  pageDescription = '只调用一次 scene-content，检查单页 PPT 内容生成、渲染和本地 QA。',
  storageKey,
  stageId,
  stageName,
  stageDescription,
}: GenerationQualityPageProps = {}) {
  const initialPreset = QUALITY_PRESETS[0];
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id);
  const [outlineDescription, setOutlineDescription] = useState(initialPreset.outlineDescription);
  const [keyPointsText, setKeyPointsText] = useState(initialPreset.keyPoints.join('\n'));
  const [title, setTitle] = useState(initialPreset.title);
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutOptionValue>(
    initialPreset.layoutTemplate,
  );
  const [deckStyle, setDeckStyle] = useState<DeckStyleValue>(initialPreset.deckStyle);
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewingPrompt, setIsPreviewingPrompt] = useState(false);
  const [errorsByPreset, setErrorsByPreset] = useState<ErrorsByPreset>({});
  const [promptPreviewErrorsByPreset, setPromptPreviewErrorsByPreset] = useState<ErrorsByPreset>(
    {},
  );
  const [resultsByPreset, setResultsByPreset] = useState<GenerationResultsByPreset>({});
  const [promptPreviewsByPreset, setPromptPreviewsByPreset] = useState<PromptPreviewsByPreset>({});
  const [inputsByPreset, setInputsByPreset] = useState<PresetInputsByPreset>({});
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState<TestStatusFilter>('all');
  const [testGroupFilter, setTestGroupFilter] = useState<
    'all' | (typeof PRESET_GROUP_ORDER)[number]
  >('all');
  const [testPage, setTestPage] = useState(1);
  const routeLabel = SLIDE_GENERATION_ROUTE_LABELS[slideGenerationRoute];
  const allowLegacyCanvas = slideGenerationRoute === 'openmaic-legacy';
  const promptPreviewSupported = slideGenerationRoute !== 'openmaic-legacy';

  const applyPresetInput = useCallback((presetId: string, input: PresetInputState) => {
    setSelectedPresetId(presetId);
    setOutlineDescription(input.outlineDescription);
    setKeyPointsText(input.keyPointsText);
    setTitle(input.title);
    setLayoutTemplate(input.layoutTemplate);
    setDeckStyle(input.deckStyle);
    setLanguage(input.language);
  }, []);

  useEffect(() => {
    const savedState = readGenerationQualitySavedState(storageKey);
    if (!savedState) {
      setIsStorageHydrated(true);
      return;
    }

    const restoredInputs = savedState.inputsByPreset || {};
    const presetId = savedState.selectedPresetId || initialPreset.id;
    const restoredInput =
      restoredInputs[presetId] || buildDefaultPresetInput(getQualityPreset(presetId));

    setInputsByPreset(restoredInputs);
    setResultsByPreset(savedState.resultsByPreset || {});
    setErrorsByPreset(savedState.errorsByPreset || {});
    setPromptPreviewErrorsByPreset(savedState.promptPreviewErrorsByPreset || {});
    applyPresetInput(presetId, restoredInput);
    setIsStorageHydrated(true);
  }, [applyPresetInput, initialPreset.id, storageKey]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    const nextInput: PresetInputState = {
      title,
      outlineDescription,
      keyPointsText,
      layoutTemplate,
      deckStyle,
      language,
      updatedAt: Date.now(),
    };
    setInputsByPreset((previous) => {
      if (presetInputMatches(previous[selectedPresetId], nextInput)) return previous;
      return {
        ...previous,
        [selectedPresetId]: nextInput,
      };
    });
  }, [
    deckStyle,
    isStorageHydrated,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    selectedPresetId,
    title,
  ]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    writeGenerationQualitySavedState(
      {
        selectedPresetId,
        inputsByPreset,
        resultsByPreset,
        errorsByPreset,
        promptPreviewErrorsByPreset,
      },
      storageKey,
    );
  }, [
    errorsByPreset,
    inputsByPreset,
    isStorageHydrated,
    promptPreviewErrorsByPreset,
    resultsByPreset,
    selectedPresetId,
    storageKey,
  ]);

  const selectedPreset = useMemo(() => getQualityPreset(selectedPresetId), [selectedPresetId]);
  const result = resultsByPreset[selectedPresetId] || null;
  const promptPreview = promptPreviewsByPreset[selectedPresetId] || null;
  const error = errorsByPreset[selectedPresetId] || null;
  const promptPreviewError = promptPreviewErrorsByPreset[selectedPresetId] || null;
  const selectedPresetIndex = useMemo(
    () =>
      Math.max(
        0,
        QUALITY_PRESETS.findIndex((preset) => preset.id === selectedPresetId),
      ),
    [selectedPresetId],
  );
  const selectedPresetGroup = useMemo(() => getPresetGroupLabel(selectedPreset), [selectedPreset]);
  const previousPreset =
    QUALITY_PRESETS[(selectedPresetIndex - 1 + QUALITY_PRESETS.length) % QUALITY_PRESETS.length];
  const nextPreset = QUALITY_PRESETS[(selectedPresetIndex + 1) % QUALITY_PRESETS.length];
  const presetGroups = useMemo(
    () =>
      PRESET_GROUP_ORDER.map((group) => ({
        group,
        description: getPresetGroupDescription(group),
        presets: QUALITY_PRESETS.filter((preset) => getPresetGroupLabel(preset) === group),
      })).filter((group) => group.presets.length > 0),
    [],
  );
  const generatedPresetCount = useMemo(
    () => QUALITY_PRESETS.filter((preset) => resultsByPreset[preset.id]).length,
    [resultsByPreset],
  );
  const nextUngeneratedPreset = useMemo(() => {
    if (generatedPresetCount >= QUALITY_PRESETS.length) return null;
    for (let offset = 1; offset <= QUALITY_PRESETS.length; offset += 1) {
      const candidate = QUALITY_PRESETS[(selectedPresetIndex + offset) % QUALITY_PRESETS.length];
      if (!resultsByPreset[candidate.id]) return candidate;
    }
    return null;
  }, [generatedPresetCount, resultsByPreset, selectedPresetIndex]);
  const hasAnySavedResult =
    generatedPresetCount > 0 ||
    Object.keys(promptPreviewsByPreset).length > 0 ||
    Object.keys(errorsByPreset).length > 0 ||
    Object.keys(promptPreviewErrorsByPreset).length > 0;
  const hasCurrentSavedResult = Boolean(result || promptPreview || error || promptPreviewError);

  const applyPreset = useCallback(
    (presetId: string) => {
      const currentInput: PresetInputState = {
        title,
        outlineDescription,
        keyPointsText,
        layoutTemplate,
        deckStyle,
        language,
        updatedAt: Date.now(),
      };
      setInputsByPreset((previous) =>
        presetInputMatches(previous[selectedPresetId], currentInput)
          ? previous
          : {
              ...previous,
              [selectedPresetId]: currentInput,
            },
      );
      const preset = getQualityPreset(presetId);
      applyPresetInput(preset.id, normalizePresetInput(inputsByPreset[preset.id], preset));
    },
    [
      applyPresetInput,
      deckStyle,
      inputsByPreset,
      keyPointsText,
      language,
      layoutTemplate,
      outlineDescription,
      selectedPresetId,
      title,
    ],
  );

  const resetCurrentPresetInput = useCallback(() => {
    const preset = getQualityPreset(selectedPresetId);
    const defaultInput = buildDefaultPresetInput(preset);
    setInputsByPreset((previous) => {
      const next = { ...previous };
      delete next[preset.id];
      return next;
    });
    applyPresetInput(preset.id, defaultInput);
  }, [applyPresetInput, selectedPresetId]);

  const goToPresetOffset = useCallback(
    (offset: number) => {
      const nextIndex =
        (selectedPresetIndex + offset + QUALITY_PRESETS.length) % QUALITY_PRESETS.length;
      applyPreset(QUALITY_PRESETS[nextIndex].id);
    },
    [applyPreset, selectedPresetIndex],
  );

  const goToNextUngeneratedPreset = useCallback(() => {
    if (!nextUngeneratedPreset) return;
    applyPreset(nextUngeneratedPreset.id);
  }, [applyPreset, nextUngeneratedPreset]);

  const clearCurrentPresetResult = useCallback(() => {
    setResultsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setPromptPreviewsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setPromptPreviewErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
  }, [selectedPresetId]);

  const clearAllPresetResults = useCallback(() => {
    setResultsByPreset({});
    setPromptPreviewsByPreset({});
    setErrorsByPreset({});
    setPromptPreviewErrorsByPreset({});
  }, []);

  const outlineKeyPoints = useMemo(
    () =>
      keyPointsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [keyPointsText],
  );

  const outlinePreview = useMemo(
    () =>
      buildOutline({
        presetId: selectedPreset.id,
        title,
        description: outlineDescription,
        keyPoints: outlineKeyPoints,
        layoutTemplate,
        deckStyle,
        language,
      }),
    [
      deckStyle,
      language,
      layoutTemplate,
      outlineDescription,
      outlineKeyPoints,
      selectedPreset.id,
      title,
    ],
  );

  const qualityChecks = useMemo(
    () =>
      evaluateResult({
        scene: result?.scene || null,
        expectedTemplate: layoutTemplate,
        expectedDeckStyle: deckStyle,
        expectedAnchors: selectedPreset.expectedAnchors,
        generatedContentCount: result?.generatedContentCount || 0,
        generationDiagnostics: result?.rawResponse.generationDiagnostics,
      }),
    [deckStyle, layoutTemplate, result, selectedPreset.expectedAnchors],
  );

  const checkSummary = useMemo(() => {
    const total = qualityChecks.length;
    const failed = qualityChecks.filter((check) => check.status === 'fail').length;
    const warned = qualityChecks.filter((check) => check.status === 'warn').length;
    return { total, failed, warned, passed: total - failed - warned };
  }, [qualityChecks]);

  const testListItems = useMemo(
    () =>
      QUALITY_PRESETS.map((preset, index) => {
        const savedResult = resultsByPreset[preset.id];
        const savedError = errorsByPreset[preset.id];
        const savedPrompt = promptPreviewsByPreset[preset.id];
        const sortTime =
          savedResult?.createdAt || savedError?.createdAt || savedPrompt?.createdAt || 0;
        const group = getPresetGroupLabel(preset);
        let status: TestListStatus = 'pending';
        let passed = 0;
        let total = 0;
        let failed = 0;
        let warned = 0;

        if (savedResult) {
          const expectedTemplate = isLayoutOptionValue(
            savedResult.outline.layoutIntent?.layoutTemplate,
          )
            ? savedResult.outline.layoutIntent.layoutTemplate
            : preset.layoutTemplate;
          const outlineDeckStyle = savedResult.outline.layoutIntent?.deckStyle;
          const expectedDeckStyle =
            typeof outlineDeckStyle === 'string' && DECK_STYLE_VALUES.has(outlineDeckStyle)
              ? (outlineDeckStyle as DeckStyleValue)
              : preset.deckStyle;
          const checks = evaluateResult({
            scene: savedResult.scene,
            expectedTemplate,
            expectedDeckStyle,
            expectedAnchors: preset.expectedAnchors,
            generatedContentCount: savedResult.generatedContentCount,
            generationDiagnostics: savedResult.rawResponse.generationDiagnostics,
          });
          total = checks.length;
          failed = checks.filter((check) => check.status === 'fail').length;
          warned = checks.filter((check) => check.status === 'warn').length;
          passed = total - failed - warned;
          status = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';
        } else if (savedError) {
          status = 'error';
        }

        return {
          preset,
          index,
          group,
          status,
          passed,
          total,
          failed,
          warned,
          hasPromptPreview: Boolean(savedPrompt),
          sortTime,
        };
      }),
    [errorsByPreset, promptPreviewsByPreset, resultsByPreset],
  );

  const sortedTestListItems = useMemo(() => {
    return [...testListItems].sort((left, right) => {
      if (left.sortTime !== right.sortTime) return right.sortTime - left.sortTime;
      return left.index - right.index;
    });
  }, [testListItems]);

  const filteredTestListItems = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    return sortedTestListItems.filter((item) => {
      if (testGroupFilter !== 'all' && item.group !== testGroupFilter) return false;
      if (testStatusFilter !== 'all' && item.status !== testStatusFilter) return false;
      if (!query) return true;
      return [
        item.preset.label,
        item.preset.id,
        item.preset.description,
        item.preset.layoutTemplate,
        item.preset.deckStyle,
      ]
        .join('\n')
        .toLowerCase()
        .includes(query);
    });
  }, [sortedTestListItems, testGroupFilter, testSearch, testStatusFilter]);

  const testPageCount = Math.max(1, Math.ceil(filteredTestListItems.length / TEST_LIST_PAGE_SIZE));
  const safeTestPage = Math.min(testPage, testPageCount);
  const visibleTestListItems = filteredTestListItems.slice(
    (safeTestPage - 1) * TEST_LIST_PAGE_SIZE,
    safeTestPage * TEST_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setTestPage(1);
  }, [testGroupFilter, testSearch, testStatusFilter]);

  const rawJson = useMemo(() => {
    if (!result) return '';
    return JSON.stringify(
      {
        effectiveOutline: result.outline,
        semanticDocument:
          result.scene.content.type === 'slide' ? result.scene.content.semanticDocument : null,
        webRenderMode:
          result.scene.content.type === 'slide' ? result.scene.content.webRenderMode : null,
        generationDiagnostics: result.rawResponse.generationDiagnostics,
      },
      null,
      2,
    );
  }, [result]);

  const buildSceneContentPayload = useCallback(
    (outline: SceneOutline, stage: Stage) => {
      const routeOutline = prepareOutlineForRoute(outline, slideGenerationRoute);
      return {
        outline: routeOutline,
        allOutlines: buildQualityAllOutlines(outline).map((candidate) =>
          prepareOutlineForRoute(candidate, slideGenerationRoute),
        ),
        stageInfo: {
          name: stage.name,
          description: stage.description,
          language: stage.language,
          style: stage.style,
        },
        stageId: stage.id,
        agents: [],
        slideGenerationRoute,
      };
    },
    [slideGenerationRoute],
  );

  const handlePreviewPrompt = useCallback(async () => {
    if (!promptPreviewSupported) return;
    const now = Date.now();
    const activePresetId = selectedPreset.id;
    const effectiveLanguage =
      inferInputLanguage({ title, outlineDescription, keyPointsText }) || language;
    if (effectiveLanguage !== language) setLanguage(effectiveLanguage);
    const outline = buildOutline({
      presetId: activePresetId,
      title,
      description: outlineDescription,
      keyPoints: outlineKeyPoints,
      layoutTemplate,
      deckStyle,
      language: effectiveLanguage,
      id: `qa-outline-${now}`,
    });
    const stage = buildStage(effectiveLanguage, deckStyle, now, {
      id: stageId,
      name: stageName,
      description: stageDescription,
    });
    setIsPreviewingPrompt(true);
    setPromptPreviewErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[activePresetId];
      return next;
    });

    try {
      const response = await backendFetch('/api/generate/scene-content/prompt-preview', {
        method: 'POST',
        headers: getGenerationQualityHeaders({ allowLegacyCanvas }),
        body: JSON.stringify(buildSceneContentPayload(outline, stage)),
      });
      const data = (await response.json().catch(() => ({}))) as PromptPreviewResponse;
      if (!response.ok || data.success === false) {
        setPromptPreviewErrorsByPreset((previous) => ({
          ...previous,
          [activePresetId]: buildGenerationErrorResult(
            data,
            response.status,
            `Prompt 预览失败：HTTP ${response.status}`,
          ),
        }));
        return;
      }
      setPromptPreviewsByPreset((previous) => ({
        ...previous,
        [activePresetId]: { response: data, createdAt: Date.now() },
      }));
    } catch (err) {
      setPromptPreviewErrorsByPreset((previous) => ({
        ...previous,
        [activePresetId]: buildUnknownErrorResult(err),
      }));
    } finally {
      setIsPreviewingPrompt(false);
    }
  }, [
    allowLegacyCanvas,
    buildSceneContentPayload,
    deckStyle,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    outlineKeyPoints,
    promptPreviewSupported,
    selectedPreset.id,
    stageDescription,
    stageId,
    stageName,
    title,
  ]);

  const handleGenerate = useCallback(async () => {
    const now = Date.now();
    const activePresetId = selectedPreset.id;
    const effectiveLanguage =
      inferInputLanguage({ title, outlineDescription, keyPointsText }) || language;
    if (effectiveLanguage !== language) setLanguage(effectiveLanguage);
    const outline = buildOutline({
      presetId: activePresetId,
      title,
      description: outlineDescription,
      keyPoints: outlineKeyPoints,
      layoutTemplate,
      deckStyle,
      language: effectiveLanguage,
      id: `qa-outline-${now}`,
    });
    const stage = buildStage(effectiveLanguage, deckStyle, now, {
      id: stageId,
      name: stageName,
      description: stageDescription,
    });
    setIsGenerating(true);
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[activePresetId];
      return next;
    });

    try {
      const response = await backendFetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getGenerationQualityHeaders({ allowLegacyCanvas }),
        body: JSON.stringify(buildSceneContentPayload(outline, stage)),
      });

      const data = (await response.json().catch(() => ({}))) as SceneContentResponse;
      if (!response.ok || data.success === false) {
        setErrorsByPreset((previous) => ({
          ...previous,
          [activePresetId]: buildGenerationErrorResult(
            data,
            response.status,
            `生成失败：HTTP ${response.status}`,
          ),
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

      setResultsByPreset((previous) => ({
        ...previous,
        [activePresetId]: {
          scene,
          outline: effectiveOutline,
          rawResponse: data,
          generatedContentCount: contents.length,
          createdAt: Date.now(),
        },
      }));
    } catch (err) {
      setErrorsByPreset((previous) => ({
        ...previous,
        [activePresetId]: buildUnknownErrorResult(err),
      }));
    } finally {
      setIsGenerating(false);
    }
  }, [
    allowLegacyCanvas,
    buildSceneContentPayload,
    deckStyle,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    outlineKeyPoints,
    selectedPreset.id,
    stageDescription,
    stageId,
    stageName,
    title,
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/generation-tests"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              <ChevronLeft className="size-4" />
              返回所有测试
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">
              {pageTitle}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{pageDescription}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge variant="secondary">route: {routeLabel}</Badge>
            {allowLegacyCanvas ? <Badge variant="outline">x-allow-legacy-canvas</Badge> : null}
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,3fr)_minmax(0,7fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">测试列表</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    按最近生成时间排序；每页 {TEST_LIST_PAGE_SIZE}{' '}
                    条，支持按名称、版式、状态和分组筛选。
                  </p>
                </div>
                <Badge variant="outline">
                  {filteredTestListItems.length}/{QUALITY_PRESETS.length}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  搜索
                  <Input
                    className="mt-1"
                    placeholder="名称、ID、版式..."
                    value={testSearch}
                    onChange={(event) => setTestSearch(event.target.value)}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    状态
                    <Select
                      value={testStatusFilter}
                      onValueChange={(value) => setTestStatusFilter(value as TestStatusFilter)}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="pending">待测</SelectItem>
                        <SelectItem value="pass">通过</SelectItem>
                        <SelectItem value="warn">警告</SelectItem>
                        <SelectItem value="fail">失败</SelectItem>
                        <SelectItem value="error">错误</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    分组
                    <Select
                      value={testGroupFilter}
                      onValueChange={(value) =>
                        setTestGroupFilter(value as 'all' | (typeof PRESET_GROUP_ORDER)[number])
                      }
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {presetGroups.map((group) => (
                          <SelectItem key={group.group} value={group.group}>
                            {group.group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleTestListItems.length > 0 ? (
                  visibleTestListItems.map((item) => {
                    const isSelected = item.preset.id === selectedPresetId;
                    return (
                      <button
                        key={item.preset.id}
                        type="button"
                        onClick={() => applyPreset(item.preset.id)}
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
                                {item.index + 1}
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {item.preset.label}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">
                              {item.group} · {item.preset.layoutTemplate}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={testStatusBadgeVariant(item.status)}>
                              {item.total > 0 ? `通过 ${item.passed}/${item.total}` : '未计分'}
                            </Badge>
                            <span className="text-[11px] text-slate-400">
                              {testStatusLabel(item.status)}
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
                          {item.warned > 0 ? <span>· warn {item.warned}</span> : null}
                          {item.failed > 0 ? <span>· fail {item.failed}</span> : null}
                          {item.hasPromptPreview ? <span>· prompt</span> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    没有匹配的测试。
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
                  {safeTestPage}/{testPageCount} · {filteredTestListItems.length} tests
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
                      {selectedPresetIndex + 1}/{QUALITY_PRESETS.length}
                    </Badge>
                    <Badge variant="outline">{selectedPresetGroup}</Badge>
                    <Badge variant={result ? 'default' : error ? 'destructive' : 'outline'}>
                      {result ? '已生成' : error ? '生成失败' : '未生成'}
                    </Badge>
                    <Badge
                      variant={statusBadgeVariant(
                        checkSummary.failed ? 'fail' : checkSummary.warned ? 'warn' : 'pass',
                      )}
                    >
                      当前 {checkSummary.passed}/{checkSummary.total}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                    {selectedPreset.label}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {selectedPreset.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(1)}
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-4">
                <div>
                  <div className="font-semibold text-slate-800">当前版式</div>
                  <div>
                    {selectedPreset.layoutTemplate} / {selectedPreset.deckStyle}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">教学角色</div>
                  <div>{selectedPreset.teachingRole}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">上一种</div>
                  <button
                    type="button"
                    className="text-left text-blue-700 hover:underline"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    {previousPreset.label}
                  </button>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">下一种</div>
                  <button
                    type="button"
                    className="text-left text-blue-700 hover:underline"
                    onClick={() => goToPresetOffset(1)}
                  >
                    {nextPreset.label}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.32fr)]">
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-600">
                    outline.title
                    <Input
                      className="mt-1"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    outline.description
                    <Textarea
                      className="mt-1 min-h-[120px] resize-y font-mono text-[13px] leading-6"
                      value={outlineDescription}
                      onChange={(event) => setOutlineDescription(event.target.value)}
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    outline.keyPoints（一行一条）
                    <Textarea
                      className="mt-1 min-h-[110px] resize-y font-mono text-[13px] leading-6"
                      value={keyPointsText}
                      onChange={(event) => setKeyPointsText(event.target.value)}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                    <label className="block text-xs font-medium text-slate-600">
                      layoutTemplate
                      <Select
                        value={layoutTemplate}
                        onValueChange={(value) => setLayoutTemplate(value as LayoutOptionValue)}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LAYOUT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="block text-xs font-medium text-slate-600">
                      deckStyle
                      <Select
                        value={deckStyle}
                        onValueChange={(value) => setDeckStyle(value as DeckStyleValue)}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DECK_STYLE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-slate-600">
                    language
                    <Select
                      value={language}
                      onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">zh-CN</SelectItem>
                        <SelectItem value="en-US">en-US</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="border-l-2 border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                    <div className="font-semibold">当前模板意图</div>
                    <div>
                      {LAYOUT_OPTIONS.find((option) => option.value === layoutTemplate)?.hint}
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={isGenerating || !outlineDescription.trim()}
                    onClick={handleGenerate}
                  >
                    {isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {isGenerating ? '正在生成一页...' : '生成并质检'}
                  </Button>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={
                      !promptPreviewSupported || isPreviewingPrompt || !outlineDescription.trim()
                    }
                    onClick={handlePreviewPrompt}
                  >
                    {isPreviewingPrompt ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileJson className="size-4" />
                    )}
                    {!promptPreviewSupported
                      ? '旧链路暂不预览 Prompt'
                      : isPreviewingPrompt
                        ? '正在组装 Prompt...'
                        : '查看完整 Prompt'}
                  </Button>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={!nextUngeneratedPreset || isGenerating || isPreviewingPrompt}
                    onClick={goToNextUngeneratedPreset}
                  >
                    下一个未生成
                    <ChevronRight className="size-4" />
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasCurrentSavedResult || isGenerating || isPreviewingPrompt}
                      onClick={clearCurrentPresetResult}
                    >
                      <XCircle className="size-4" />
                      清当前
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasAnySavedResult || isGenerating || isPreviewingPrompt}
                      onClick={clearAllPresetResults}
                    >
                      <XCircle className="size-4" />
                      清全部
                    </Button>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    size="sm"
                    onClick={resetCurrentPresetInput}
                  >
                    <RefreshCw className="size-4" />
                    重置输入
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="mt-4">
                  <GenerationErrorPanel title="生成失败" error={error} />
                </div>
              ) : null}

              {promptPreviewError ? (
                <div className="mt-4">
                  <GenerationErrorPanel title="Prompt 预览失败" error={promptPreviewError} />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">渲染预览</h2>
                  <p className="text-xs text-slate-500">
                    这里复用课堂 slide renderer；如果结果是长页或半成品，会在预览和质检里同时暴露。
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isGenerating || !outlineDescription.trim()}
                    onClick={handleGenerate}
                  >
                    {isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {isGenerating ? '生成中...' : '生成'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Badge variant="outline">
                    {selectedPresetIndex + 1}/{QUALITY_PRESETS.length}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(1)}
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                  {result ? (
                    <Badge variant="outline">
                      {new Date(result.createdAt).toLocaleTimeString([], {
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
                  {result ? (
                    <SingleScenePreview key={result.scene.id} scene={result.scene} />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      <Sparkles className="size-8" />
                      <div className="text-sm font-medium">生成一页后在这里预览</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="size-4 text-slate-500" />
                <h2 className="text-sm font-semibold">发送给 scene-content 的 payload</h2>
              </div>
              <pre className="max-h-[240px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {JSON.stringify(
                  {
                    outline: prepareOutlineForRoute(outlinePreview, slideGenerationRoute),
                    stageInfo: buildStage(language, deckStyle, 0, {
                      id: stageId,
                      name: stageName,
                      description: stageDescription,
                    }),
                    slideGenerationRoute,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">本地质检</h2>
                  <Badge
                    variant={statusBadgeVariant(
                      checkSummary.failed ? 'fail' : checkSummary.warned ? 'warn' : 'pass',
                    )}
                  >
                    {checkSummary.passed}/{checkSummary.total}
                  </Badge>
                </div>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
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
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <FileJson className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">生成结果 JSON</h2>
                </div>
                {rawJson ? (
                  <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    {rawJson}
                  </pre>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                    还没有生成结果。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">完整模型 Prompt</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    后端复用正式 scene-content prompt builder 组装；这里只预览，不调用模型。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {promptPreview ? (
                    <>
                      <Badge variant="outline">
                        {new Date(promptPreview.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </Badge>
                      <Badge variant="outline">{promptPreview.response.promptId || 'prompt'}</Badge>
                      <Badge variant="outline">
                        route:{' '}
                        {promptPreview.response.slideGenerationRoute ||
                          DEFAULT_SLIDE_GENERATION_ROUTE}
                      </Badge>
                      <Badge
                        variant={promptPreview.response.templateDriven ? 'secondary' : 'outline'}
                      >
                        {promptPreview.response.templateDriven ? 'template driven' : 'model prompt'}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline">等待预览</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <PromptReadonlyBlock
                  label="System Prompt"
                  value={promptPreview?.response.systemPrompt}
                  placeholder="点击“查看完整 Prompt”后，这里显示最终 system prompt。"
                  minHeightClassName="min-h-[300px] max-h-[420px]"
                />
                <PromptReadonlyBlock
                  label="User Prompt"
                  value={promptPreview?.response.userPrompt}
                  placeholder="点击“查看完整 Prompt”后，这里显示最终 user prompt。"
                  minHeightClassName="min-h-[300px] max-h-[420px]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
