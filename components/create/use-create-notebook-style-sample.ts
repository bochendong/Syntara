'use client';

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { NotebookGenerationModelMode } from '@/lib/constants/notebook-generation-model-presets';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { backendFetch } from '@/lib/utils/backend-api';
import { createLogger } from '@/lib/logger';
import type { ImageNotebookStyleBrief } from '@/lib/generation/image-notebook-quality';
import type {
  NotebookStageModelOverrides,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
import type { Stage } from '@/lib/types/stage';
import {
  NOTEBOOK_IMAGE2_MODEL_ID,
  NOTEBOOK_IMAGE2_PROVIDER_ID,
  PALETTES,
  STYLE_OPTIONS,
  actionCount,
  attachImageNotebookPlanToOutlines,
  buildStyleSamplePrompt,
  filterSelectedSourceMedia,
  getFullPageImageUrlFromContent,
  outlineRowsToSceneOutlines,
  type ExtractedSourceImage,
  type FormState,
  type ImageNotebookBriefsResponse,
  type NotebookPageContentResponse,
  type OutlineRow,
  type SourceGenerationExtract,
  type StyleSample,
  type StyleSampleStatus,
} from './create-notebook-workspace-model';

const log = createLogger('CreateNotebookStyleSample');

type UseCreateNotebookStyleSampleArgs = {
  courseId: string;
  currentStyleSampleKey: string;
  drawingStylePrompt: string;
  imageNotebookStyleBrief: ImageNotebookStyleBrief;
  form: FormState;
  hasCustomDrawingStyle: boolean;
  includeQuizScenes: boolean;
  language: 'zh-CN' | 'en-US';
  modelIdOverride: string | null;
  notebookModelMode: NotebookGenerationModelMode;
  notebookStageModelOverrides: NotebookStageModelOverrides;
  outlineRows: OutlineRow[];
  selectedOutline?: OutlineRow;
  selectedOutlineIndex: number;
  selectedPalette: (typeof PALETTES)[number];
  selectedSourceImages: ExtractedSourceImage[];
  selectedStyle: (typeof STYLE_OPTIONS)[number];
  selectedStyleId: string;
  sourceExtract: SourceGenerationExtract;
  selectedSourceImageIds: string[];
  hasSelectableSourceImages: boolean;
  styleSampleAbortRef: MutableRefObject<AbortController | null>;
  setError: (message: string | null) => void;
  setStyleSample: Dispatch<SetStateAction<StyleSample | null>>;
  setStyleSampleError: Dispatch<SetStateAction<string>>;
  setStyleSampleStatus: Dispatch<SetStateAction<StyleSampleStatus>>;
  workedExampleLevel: OrchestratorWorkedExampleLevel;
};

export function useCreateNotebookStyleSample({
  courseId,
  currentStyleSampleKey,
  drawingStylePrompt,
  imageNotebookStyleBrief,
  form,
  hasCustomDrawingStyle,
  includeQuizScenes,
  language,
  modelIdOverride,
  notebookModelMode,
  notebookStageModelOverrides,
  outlineRows,
  selectedOutline,
  selectedOutlineIndex,
  selectedPalette,
  selectedSourceImages,
  selectedStyle,
  selectedStyleId,
  sourceExtract,
  selectedSourceImageIds,
  hasSelectableSourceImages,
  styleSampleAbortRef,
  setError,
  setStyleSample,
  setStyleSampleError,
  setStyleSampleStatus,
  workedExampleLevel,
}: UseCreateNotebookStyleSampleArgs) {
  return useCallback(async () => {
    if (!selectedOutline) {
      setError('请先生成并选择一页规划，再跑单页质检。');
      return;
    }

    styleSampleAbortRef.current?.abort();
    const abortController = new AbortController();
    styleSampleAbortRef.current = abortController;

    const prompt = buildStyleSamplePrompt({
      outline: selectedOutline,
      outlineIndex: selectedOutlineIndex,
      totalOutlines: Math.max(outlineRows.length, 1),
      sourceFileName: form.sourceFile?.name,
      requirement: form.requirement,
      language,
      style: selectedStyle,
      customStylePrompt: drawingStylePrompt,
      styleBrief: imageNotebookStyleBrief,
      palette: selectedPalette,
      sourceImages: selectedSourceImages,
      includeQuizScenes,
      workedExampleLevel,
    });

    setError(null);
    setStyleSampleError('');
    setStyleSampleStatus('loading');

    try {
      const baseHeaders = getApiHeaders({
        imageGenerationEnabled: true,
        modelIdOverride,
        notebookStageModelOverrides,
        notebookModelMode,
        testNoCharge: true,
      });
      const qualityCheckStage: Stage = {
        id: `create-notebook-image-quality-check-${courseId || 'draft'}`,
        courseId,
        name: form.sourceFile?.name
          ? `图片 notebook 质检：${form.sourceFile.name}`
          : '图片 notebook 质检',
        description: [
          `绘画风格：${selectedStyle.label}。`,
          `绘画风格 prompt：${drawingStylePrompt}`,
          `配色：${selectedPalette.label}，核心色 ${selectedPalette.colors.join(' / ')}。`,
          form.requirement.trim() || '根据当前输入创建一套中文图片笔记本。',
        ]
          .filter(Boolean)
          .join('\n'),
        language,
        style: [
          selectedStyle.label,
          hasCustomDrawingStyle && selectedStyleId !== 'custom' ? '自定义' : '',
          selectedPalette.label,
        ]
          .filter(Boolean)
          .join(' · '),
        imageNotebookStyle: imageNotebookStyleBrief,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const courseContext = {
        name: qualityCheckStage.name,
        description: qualityCheckStage.description,
        tags: ['image-ppt', selectedStyle.label, selectedPalette.label],
        purpose: 'university' as const,
        language,
      };
      const baseOutlines = outlineRowsToSceneOutlines(outlineRows, language);
      const briefResponse = await backendFetch('/api/generate/image-notebook-briefs', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          stage: qualityCheckStage,
          outlines: baseOutlines,
          courseContext,
          language,
          sourceSummary: [prompt, sourceExtract.text].filter(Boolean).join('\n\n').slice(0, 12000),
        }),
        signal: abortController.signal,
      });
      const briefData = (await briefResponse
        .json()
        .catch(() => ({}))) as ImageNotebookBriefsResponse;
      if (!briefResponse.ok || !briefData.success || !briefData.plan) {
        throw new Error(briefData.error || `教师 brief 生成失败：HTTP ${briefResponse.status}`);
      }

      const plannedOutlines = attachImageNotebookPlanToOutlines(baseOutlines, briefData.plan);
      const qualityCheckOutline =
        plannedOutlines.find((outline) => outline.id === selectedOutline.id) || plannedOutlines[0];
      if (!qualityCheckOutline) {
        throw new Error('没有可用于单页质检的页面。');
      }
      const selectedMedia = filterSelectedSourceMedia({
        pdfImages: sourceExtract.pdfImages,
        imageMapping: sourceExtract.imageMapping,
        selectedImageIds: hasSelectableSourceImages ? selectedSourceImageIds : undefined,
      });
      const pageContentResponse = await backendFetch('/api/generate/notebook-page-content', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          outline: qualityCheckOutline,
          allOutlines: plannedOutlines,
          stage: qualityCheckStage,
          agents: [],
          courseContext,
          pdfImages: selectedMedia.pdfImages,
          imageMapping: selectedMedia.imageMapping,
          slideGenerationRoute: 'image-ppt',
          imageNotebookMaxAttempts: 1,
          includeActions: true,
        }),
        signal: abortController.signal,
      });
      const pageContentData = (await pageContentResponse
        .json()
        .catch(() => ({}))) as NotebookPageContentResponse;
      if (!pageContentResponse.ok || !pageContentData.success || !pageContentData.contentBundle) {
        throw new Error(
          pageContentData.error || `单页内容生成失败：HTTP ${pageContentResponse.status}`,
        );
      }
      const contentBundle = pageContentData.contentBundle;
      const imageUrl =
        pageContentData.image?.imageUrl ||
        getFullPageImageUrlFromContent(contentBundle.contents?.[0]);
      if (!imageUrl) {
        throw new Error('单页质检生成成功，但响应里没有可展示的整页图片。');
      }
      const qualityCheckScene = pageContentData.actionsResult?.scenes?.[0];
      const effectiveOutline =
        pageContentData.actionsResult?.effectiveOutlines?.[0] ||
        contentBundle.effectiveOutlines?.[0] ||
        qualityCheckOutline;
      const qa =
        contentBundle.imageNotebookQaByOutlineId?.[effectiveOutline.id] ||
        contentBundle.imageNotebookQaByOutlineId?.[qualityCheckOutline.id] ||
        Object.values(contentBundle.imageNotebookQaByOutlineId || {})[0];

      setStyleSample({
        imageUrl,
        prompt: String(
          pageContentData.image?.imagePrompt ||
            (contentBundle.contents?.[0] as { remark?: unknown } | undefined)?.remark ||
            prompt,
        ),
        key: currentStyleSampleKey,
        width: 1000,
        height: 562.5,
        providerId: pageContentData.image?.providerId || NOTEBOOK_IMAGE2_PROVIDER_ID,
        modelId: pageContentData.image?.modelId || NOTEBOOK_IMAGE2_MODEL_ID,
        qa,
        briefPageCount: briefData.plan.pageBriefs.length,
        speechCount: actionCount(qualityCheckScene, 'speech'),
        focusCount: actionCount(qualityCheckScene, 'focus'),
        sceneTitle: effectiveOutline.title,
        generatedAt: Date.now(),
      });
      setStyleSampleStatus('ready');
    } catch (err) {
      if (abortController.signal.aborted) return;
      const message = err instanceof Error ? err.message : '单页质检生成失败';
      log.error('Style sample generation failed:', err);
      setStyleSampleError(message);
      setStyleSampleStatus('error');
      setError(message);
    } finally {
      if (styleSampleAbortRef.current === abortController) {
        styleSampleAbortRef.current = null;
      }
    }
  }, [
    courseId,
    currentStyleSampleKey,
    drawingStylePrompt,
    form.requirement,
    form.sourceFile?.name,
    hasCustomDrawingStyle,
    hasSelectableSourceImages,
    imageNotebookStyleBrief,
    includeQuizScenes,
    language,
    modelIdOverride,
    notebookModelMode,
    notebookStageModelOverrides,
    outlineRows,
    selectedOutline,
    selectedOutlineIndex,
    selectedPalette,
    selectedSourceImages,
    selectedSourceImageIds,
    selectedStyle,
    selectedStyleId,
    setError,
    setStyleSample,
    setStyleSampleError,
    setStyleSampleStatus,
    sourceExtract.imageMapping,
    sourceExtract.pdfImages,
    sourceExtract.text,
    styleSampleAbortRef,
    workedExampleLevel,
  ]);
}
