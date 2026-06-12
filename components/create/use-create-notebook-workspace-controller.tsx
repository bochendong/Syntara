'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BotOff } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { buildStudyCompanionNotification } from '@/lib/learning/study-memory';
import { createLogger } from '@/lib/logger';
import { toast } from '@/lib/notifications/client-toast';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useOrchestratorNotebookGenStore } from '@/lib/store/orchestrator-notebook-generation';
import { useNotebookGenerationQueueStore } from '@/lib/store/notebook-generation-queue';
import { useNotificationStore } from '@/lib/store/notifications';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { SceneOutline } from '@/lib/types/generation';
import {
  PDF_PAGE_SELECTION_MAX_BYTES,
  getPdfSourceFileSignature,
  type PdfSourceSelection,
} from '@/lib/pdf/page-selection';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { readApiErrorMessage } from '@/lib/create/api-errors';
import { backendFetch } from '@/lib/utils/backend-api';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import type { ImageNotebookBriefPlan } from '@/lib/generation/image-notebook-quality';
import {
  MOCK_COURSE_SPINE,
  PLANNING_MOCK_STATE_LABELS,
  PLANNING_PHASE_ORDER,
  buildImageNotebookStyleBrief,
  buildMockPlanningPagesForPhase,
  buildMockPlanningRows,
  buildPlanningPhaseMockText,
  buildRuntimeImageGenerationRows,
  buildStyleSamplePrompt,
  fileKindLabel,
  filterSelectedSourceMedia,
  formatImageNotebookStyleBriefPreview,
  formatFileSize,
  getWorkspaceProgressIndex,
  getWorkspaceProgressLabel,
  isPdfSourceFile,
  mergePagePlanningPreviews,
  outlineLengthLabel,
  outlineLengthStrategyText,
  outlineRowsToSceneOutlines,
  pagePlanningPreviewsFromBlueprint,
  pagePlanningPreviewsFromOutlines,
  pickMockPlanningPage,
  readImageNotebookPlanStream,
  sceneOutlinesToRows,
  takeImageGenerationRowsWithFallback,
  workedExampleLevelLabel,
  type ImageGenerationMockPageCount,
  type ImageNotebookPlanQualityReport,
  type OutlineGenerationStatus,
  type OutlineRow,
  type PagePlanningPreview,
  type PlanningMockPhaseState,
  type PlanningMockPhaseStates,
  type PlanningMockStreams,
  type PlanningPhase,
  type PreparedSourceInput,
  type WorkspaceProgressStep,
  type WorkspaceStep,
} from './create-notebook-workspace-model';
import {
  buildCourseSpineWriterText,
  buildPlanningWriterText,
} from './create-notebook-workspace-panels';
import { useCreateNotebookSourceInput } from './use-create-notebook-source-input';
import { useCreateNotebookStyleSample } from './use-create-notebook-style-sample';
import { useCreateNotebookStyleState } from './use-create-notebook-style-state';

const log = createLogger('CreateNotebookWorkspace');

type CreateNotebookWorkspaceControllerArgs = {
  courseId: string;
};

type NotebookKindSelection = 'image' | 'markdown';

type MarkdownNotebookSectionDraft = {
  title: string;
  order: number;
  markdown: string;
  summary?: string;
  sourceMeta?: Record<string, unknown>;
};

const MARKDOWN_SECTION_TARGET_CHARS = 4200;
const MARKDOWN_SECTION_MAX_CHARS = 7200;
const MARKDOWN_SECTION_LIMIT = 80;

function stripMarkdownForSummary(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTitle(input: string, fallback: string): string {
  const normalized = stripMarkdownForSummary(input).replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 64 ? `${normalized.slice(0, 64)}…` : normalized;
}

function splitPlainTextIntoChunks(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (
      current &&
      current.length + paragraph.length > MARKDOWN_SECTION_TARGET_CHARS &&
      current.length >= 800
    ) {
      chunks.push(current.trim());
      current = paragraph;
      continue;
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current.length >= MARKDOWN_SECTION_MAX_CHARS) {
      chunks.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitMarkdownTextByHeadings(text: string): Array<{ title: string; markdown: string }> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current?.lines.some((item) => item.trim())) sections.push(current);
      current = { title: heading[2].trim(), lines: [line] };
      continue;
    }
    if (!current) {
      current = { title: '', lines: [] };
    }
    current.lines.push(line);
  }
  if (current?.lines.some((item) => item.trim())) sections.push(current);

  if (sections.length <= 1) return [];
  return sections
    .map((section, index) => {
      const markdown = section.lines.join('\n').trim();
      return {
        title: compactTitle(section.title || markdown.split('\n')[0] || '', `第 ${index + 1} 节`),
        markdown,
      };
    })
    .filter((section) => section.markdown);
}

function buildMarkdownNotebookSections(args: {
  requirement: string;
  sourceText: string;
  sourceFileName?: string;
}): MarkdownNotebookSectionDraft[] {
  const requirement = args.requirement.trim();
  const sourceText = args.sourceText.trim();
  const primaryText = sourceText || requirement;
  if (!primaryText) return [];

  const headingSections = splitMarkdownTextByHeadings(primaryText);
  const sourceMeta = {
    sourceFileName: args.sourceFileName || null,
    createdFrom: sourceText ? 'source-text' : 'requirement',
  };
  const rawSections =
    headingSections.length > 0
      ? headingSections
      : splitPlainTextIntoChunks(primaryText).map((markdown, index) => ({
          title:
            index === 0
              ? compactTitle(requirement || markdown.split('\n')[0] || '', '概览')
              : compactTitle(markdown.split('\n')[0] || '', `续写 ${index + 1}`),
          markdown: markdown.startsWith('#')
            ? markdown
            : index === 0
              ? `# ${compactTitle(requirement || markdown, '概览')}\n\n${markdown}`
              : markdown,
        }));

  const sections = rawSections.slice(0, MARKDOWN_SECTION_LIMIT).map((section, index) => ({
    title: section.title || `Markdown ${index + 1}`,
    order: index,
    markdown: section.markdown,
    summary: stripMarkdownForSummary(section.markdown).slice(0, 420),
    sourceMeta,
  }));

  if (requirement && sourceText && !stripMarkdownForSummary(sourceText).includes(requirement)) {
    return [
      {
        title: '学习目标',
        order: 0,
        markdown: `# 学习目标\n\n${requirement}`,
        summary: requirement.slice(0, 420),
        sourceMeta: { ...sourceMeta, createdFrom: 'requirement' },
      },
      ...sections.slice(0, MARKDOWN_SECTION_LIMIT - 1).map((section, index) => ({
        ...section,
        order: index + 1,
      })),
    ];
  }

  return sections;
}

function buildMarkdownNotebookName(args: {
  requirement: string;
  sourceFileName?: string;
  firstSectionTitle?: string;
}): string {
  const sourceBase = args.sourceFileName?.replace(/\.[^.]+$/, '').trim();
  const candidate = args.requirement.trim().split('\n')[0] || sourceBase || args.firstSectionTitle;
  return compactTitle(candidate || '', 'Markdown 笔记本');
}

export function useCreateNotebookWorkspaceController({
  courseId,
}: CreateNotebookWorkspaceControllerArgs) {
  const { t } = useI18n();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stylePromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const outlineAbortRef = useRef<AbortController | null>(null);
  const planningRevealTimeoutRef = useRef<number | null>(null);
  const planningMockStreamTimersRef = useRef<number[]>([]);
  const [activeStep, setActiveStep] = useState<WorkspaceStep>('input');
  const [outlineRows, setOutlineRows] = useState<OutlineRow[]>([]);
  const [selectedOutlineId, setSelectedOutlineId] = useState('');
  const [outlineGenerationStatus, setOutlineGenerationStatus] =
    useState<OutlineGenerationStatus>('idle');
  const [outlineGenerationMessage, setOutlineGenerationMessage] =
    useState('输入后会直接生成一版规划与画图 prompt。');
  const [planningCourseSpine, setPlanningCourseSpine] = useState<
    ImageNotebookBriefPlan['courseSpine'] | null
  >(null);
  const [planningPages, setPlanningPages] = useState<PagePlanningPreview[]>([]);
  const [confirmedImageNotebookPlan, setConfirmedImageNotebookPlan] = useState<{
    outlines: SceneOutline[];
    plan: ImageNotebookBriefPlan;
  } | null>(null);
  const [planningLiveDraft, setPlanningLiveDraft] = useState<{
    phase: 'blueprint' | 'batch';
    detail: string;
    text: string;
  } | null>(null);
  const [, setPlanningStreamEvents] = useState<string[]>([]);
  const [_planningQuality, setPlanningQuality] = useState<ImageNotebookPlanQualityReport | null>(
    null,
  );
  const [planningPhase, setPlanningPhase] = useState<PlanningPhase>('course-spine');
  const [planningMockStreams, setPlanningMockStreams] = useState<PlanningMockStreams>({});
  const [planningMockPhaseStates, setPlanningMockPhaseStates] = useState<PlanningMockPhaseStates>(
    {},
  );
  const [planningRealPhaseStates, setPlanningRealPhaseStates] = useState<PlanningMockPhaseStates>(
    {},
  );
  const [planningMockStreamingPhases, setPlanningMockStreamingPhases] = useState<PlanningPhase[]>(
    [],
  );
  const [imageGenerationMockPageCount, setImageGenerationMockPageCount] =
    useState<ImageGenerationMockPageCount | null>(null);
  const [activeGenerationTaskId, setActiveGenerationTaskId] = useState<string | null>(null);
  const [notebookKind, setNotebookKind] = useState<NotebookKindSelection>('image');
  const [currentPlanningPageNumbers, setCurrentPlanningPageNumbers] = useState<number[]>([]);
  const [revealingPlanningPageNumbers, setRevealingPlanningPageNumbers] = useState<number[]>([]);
  const [planningRevealRevision, setPlanningRevealRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSelectionDialogOpen, setPageSelectionDialogOpen] = useState(false);

  const currentModelId = useSettingsStore((s) => s.modelId);
  const generationTasks = useNotebookGenerationQueueStore((s) => s.tasks);
  const enqueueNotebookGeneration = useNotebookGenerationQueueStore((s) => s.enqueue);
  const enqueueCompanionBanner = useNotificationStore((s) => s.enqueueBanner);
  const notebookModelMode = useOrchestratorNotebookGenStore((s) => s.notebookModelMode);
  const modelIdOverride = useOrchestratorNotebookGenStore((s) => s.modelIdOverride);
  const notebookStageModelOverrides = useOrchestratorNotebookGenStore(
    (s) => s.notebookStageModelOverrides,
  );
  const language = useOrchestratorNotebookGenStore((s) => s.language);
  const setLanguage = useOrchestratorNotebookGenStore((s) => s.setLanguage);
  const setGenerateSlides = useOrchestratorNotebookGenStore((s) => s.setGenerateSlides);
  const outlineLength = useOrchestratorNotebookGenStore((s) => s.outlineLength);
  const setOutlineLength = useOrchestratorNotebookGenStore((s) => s.setOutlineLength);
  const workedExampleLevel = useOrchestratorNotebookGenStore((s) => s.workedExampleLevel);
  const setWorkedExampleLevel = useOrchestratorNotebookGenStore((s) => s.setWorkedExampleLevel);
  const includeQuizScenes = useOrchestratorNotebookGenStore((s) => s.includeQuizScenes);
  const setIncludeQuizScenes = useOrchestratorNotebookGenStore((s) => s.setIncludeQuizScenes);
  const setUseAiImages = useOrchestratorNotebookGenStore((s) => s.setUseAiImages);
  const invalidateSourcePlan = useCallback(() => {
    setConfirmedImageNotebookPlan(null);
  }, []);
  const {
    form,
    materials,
    sourceDragActive,
    sourcePageSelection,
    sourcePreview,
    sourceExtract,
    selectedSourceImageIds,
    setSourcePageSelection,
    updateRequirement,
    handleFileSelect,
    handleSourceInputDragEnter,
    handleSourceInputDragOver,
    handleSourceInputDragLeave,
    handleSourceInputDrop,
    clearSourceFile,
    prepareSourceInputForPlanning,
    setSourceImageSelection,
    setAllSourceImagesSelected,
    setMaterialKeep,
    resetSourceInput,
  } = useCreateNotebookSourceInput({
    activeStep,
    busy,
    language,
    fileTooLargeMessage: t('upload.fileTooLarge'),
    onError: setError,
    onSourceChanged: invalidateSourcePlan,
  });

  const clearPlanningMockStreamTimers = useCallback(() => {
    planningMockStreamTimersRef.current.forEach((timerId) => window.clearInterval(timerId));
    planningMockStreamTimersRef.current = [];
  }, []);

  useEffect(() => {
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });
  }, []);

  useEffect(() => {
    setGenerateSlides(notebookKind === 'image');
    setUseAiImages(notebookKind === 'image');
  }, [notebookKind, setGenerateSlides, setUseAiImages]);

  useEffect(() => {
    return () => {
      outlineAbortRef.current?.abort();
      clearPlanningMockStreamTimers();
      if (planningRevealTimeoutRef.current != null) {
        window.clearTimeout(planningRevealTimeoutRef.current);
      }
    };
  }, [clearPlanningMockStreamTimers]);

  const outlineIsLoading = outlineGenerationStatus === 'loading';
  const selectedOutline = outlineRows.find((row) => row.id === selectedOutlineId) ?? outlineRows[0];
  const selectedOutlineIndex = Math.max(
    0,
    outlineRows.findIndex((row) => row.id === selectedOutline?.id),
  );
  const planningByPageNumber = new Map(planningPages.map((page) => [page.pageNumber, page]));
  const planningListPages =
    outlineRows.length > 0
      ? outlineRows.map((row, index) => {
          const pageNumber = index + 1;
          const planned = planningByPageNumber.get(pageNumber);
          return {
            ...(planned || {
              id: row.id,
              pageNumber,
              title: row.title,
              currentJob: row.focus || '等待页面规划写入…',
              mustShow: [],
              formulas: [],
              exampleSteps: [],
              commonPitfalls: [],
              markerComponents: [],
              markerCount: 0,
              focusRegions: [],
              focusCount: 0,
              status: outlineIsLoading ? 'indexed' : 'planned',
            }),
            id: row.id,
            title: row.title || planned?.title || `第 ${pageNumber} 页`,
            currentJob: planned?.currentJob || row.focus || '等待页面规划写入…',
          } as PagePlanningPreview;
        })
      : planningPages;
  const selectedPlanningPage =
    planningByPageNumber.get(selectedOutlineIndex + 1) ||
    (selectedOutline
      ? ({
          id: selectedOutline.id,
          pageNumber: selectedOutlineIndex + 1,
          title: selectedOutline.title,
          currentJob: selectedOutline.focus || '等待页面规划写入…',
          mustShow: [],
          formulas: [],
          exampleSteps: [],
          commonPitfalls: [],
          markerComponents: [],
          markerCount: 0,
          focusRegions: [],
          focusCount: 0,
          status: outlineIsLoading ? 'indexed' : 'planned',
        } as PagePlanningPreview)
      : undefined);
  const currentPlanningPageSet = new Set(currentPlanningPageNumbers);
  const revealingPlanningPageSet = new Set(revealingPlanningPageNumbers);
  const selectedPlanningIsWriting =
    Boolean(selectedPlanningPage) &&
    ((outlineIsLoading && currentPlanningPageSet.has(selectedPlanningPage?.pageNumber || -1)) ||
      revealingPlanningPageSet.has(selectedPlanningPage?.pageNumber || -1));
  const selectedPlanningMockValue = planningMockStreams[planningPhase];
  const selectedPlanningMockHasState = Object.prototype.hasOwnProperty.call(
    planningMockStreams,
    planningPhase,
  );
  const selectedPlanningMockPhaseState = planningMockPhaseStates[planningPhase];
  const selectedPlanningRealPhaseState = planningRealPhaseStates[planningPhase];
  const selectedPlanningEffectivePhaseState =
    selectedPlanningMockPhaseState ?? selectedPlanningRealPhaseState;
  const selectedPlanningMockText =
    typeof selectedPlanningMockValue === 'string' ? selectedPlanningMockValue : undefined;
  const selectedPlanningMockIsConfirmingInput =
    selectedPlanningMockHasState &&
    (selectedPlanningMockValue === null || selectedPlanningMockPhaseState === 'input');
  const selectedPlanningMockIsLoadingState = Boolean(
    selectedPlanningMockPhaseState &&
    selectedPlanningMockPhaseState !== 'input' &&
    selectedPlanningMockPhaseState !== 'done',
  );
  const selectedPlanningMockIsStreaming = planningMockStreamingPhases.includes(planningPhase);
  const hasPlanningMockStreams = Object.keys(planningMockStreams).length > 0;
  const selectedPlanningRealIsLoadingState = Boolean(
    !hasPlanningMockStreams &&
    outlineIsLoading &&
    selectedPlanningRealPhaseState &&
    selectedPlanningRealPhaseState !== 'input' &&
    selectedPlanningRealPhaseState !== 'done',
  );
  const planningLiveDraftText = planningLiveDraft
    ? `${planningLiveDraft.detail}\n\n${planningLiveDraft.text}`
    : undefined;
  const selectedPlanningStepText = hasPlanningMockStreams
    ? selectedPlanningMockText
    : planningLiveDraftText
      ? planningLiveDraftText
      : planningPhase === 'course-spine'
        ? planningCourseSpine
          ? buildCourseSpineWriterText(planningCourseSpine)
          : undefined
        : selectedPlanningPage
          ? buildPlanningWriterText(selectedPlanningPage)
          : undefined;
  const hasSelectedPlanningStepText = selectedPlanningStepText !== undefined;
  const selectedPlanningStepIsWriting = hasPlanningMockStreams
    ? selectedPlanningMockIsStreaming
    : planningLiveDraftText
      ? outlineIsLoading
      : planningPhase === 'course-spine'
        ? outlineIsLoading && !planningCourseSpine
        : selectedPlanningIsWriting;
  const planningMockCompletedPhases = PLANNING_PHASE_ORDER.filter(
    (phase) =>
      typeof planningMockStreams[phase] === 'string' &&
      !planningMockStreamingPhases.includes(phase),
  );
  const realPlanningCompletedPhases = hasPlanningMockStreams
    ? []
    : PLANNING_PHASE_ORDER.filter((phase) => {
        if (phase === 'course-spine') return Boolean(planningCourseSpine || planningPages.length);
        if (phase === 'page-brief') {
          return planningPages.some((page) => page.status === 'planned');
        }
        return false;
      });
  const completedPlanningPhases = hasPlanningMockStreams
    ? planningMockCompletedPhases
    : realPlanningCompletedPhases;
  const realPlanningStreamingPhases = !hasPlanningMockStreams
    ? PLANNING_PHASE_ORDER.filter((phase) => {
        const state = planningRealPhaseStates[phase];
        return outlineIsLoading && Boolean(state && state !== 'input' && state !== 'done');
      })
    : [];
  const displayedPlanningStreamingPhases = hasPlanningMockStreams
    ? planningMockStreamingPhases
    : realPlanningStreamingPhases;
  const selectedPlanningStructuredOutput =
    Boolean(selectedPlanningStepText?.trim()) &&
    !selectedPlanningStepIsWriting &&
    completedPlanningPhases.includes(planningPhase);
  const selectedPlanningStructuredLoading = hasPlanningMockStreams
    ? selectedPlanningMockIsLoadingState && !selectedPlanningMockIsConfirmingInput
    : selectedPlanningRealIsLoadingState;
  const selectedPlanningStructuredLoadingState = selectedPlanningStructuredLoading
    ? selectedPlanningMockPhaseState || selectedPlanningRealPhaseState
    : undefined;
  const showPlanningInputOnly = selectedPlanningMockIsConfirmingInput;
  const showPlanningOutputPanel = Boolean(
    !showPlanningInputOnly &&
    (hasSelectedPlanningStepText ||
      selectedPlanningStepIsWriting ||
      selectedPlanningStructuredOutput ||
      selectedPlanningStructuredLoading),
  );
  const hidePlanningInputPanel =
    showPlanningOutputPanel &&
    (selectedPlanningStructuredOutput || selectedPlanningStructuredLoading);
  const structuredPlanningCourseSpine = hasPlanningMockStreams
    ? MOCK_COURSE_SPINE
    : planningCourseSpine;
  const keptMaterials = materials.filter((item) => item.keep);
  const selectedSourceImageIdSet = new Set(selectedSourceImageIds);
  const selectedSourceImages = sourcePreview.imagePreviews.filter((image) =>
    selectedSourceImageIdSet.has(image.id),
  );
  const hasSelectableSourceImages = sourcePreview.imagePreviews.length > 0;
  const missingSourceImagePreviewCount = Math.max(
    0,
    sourcePreview.imageCount -
      sourcePreview.imagePreviews.length -
      sourcePreview.imageDuplicateCount,
  );
  const hasInput = Boolean(form.requirement.trim() || form.sourceFile);
  const activeStepIndex = getWorkspaceProgressIndex(activeStep, planningPhase);
  const activeStepLabel = getWorkspaceProgressLabel(activeStep, planningPhase);
  const outlineNeedsInitialGeneration =
    activeStep === 'outline' &&
    planningPhase === 'course-spine' &&
    !outlineIsLoading &&
    !hasPlanningMockStreams &&
    !planningCourseSpine &&
    planningPages.length === 0 &&
    outlineRows.length === 0;
  const outlineNextDisabled =
    activeStep === 'outline'
      ? outlineNeedsInitialGeneration
        ? false
        : outlineGenerationStatus !== 'ready' || outlineRows.length === 0
      : false;
  const outlinePlanKey = outlineRows
    .map((row, index) => `${index + 1}:${row.id}:${row.title}:${row.focus}`)
    .join('||');

  const {
    styleSampleAbortRef,
    selectedStyleId,
    selectedStyle,
    customStylePrompt,
    setCustomStylePrompt,
    selectedPaletteId,
    setSelectedPaletteId,
    selectedPalette,
    drawingStylePrompt,
    hasCustomDrawingStyle,
    currentStyleSampleKey,
    styleSampleStatus,
    setStyleSampleStatus,
    styleSample,
    setStyleSample,
    styleSampleError,
    setStyleSampleError,
    styleSampleIsCurrent,
    styleSampleIsStale,
    styleSampleQualityPassed,
    selectDrawingStyle,
    abortStyleSampleRequest,
    resetStyleSample,
    resetStyleState,
  } = useCreateNotebookStyleState({
    outlinePlanKey,
    selectedOutline,
    drawingLanguage: language,
    onStyleChanged: invalidateSourcePlan,
    onCustomStyleSelected: () =>
      window.setTimeout(() => stylePromptTextareaRef.current?.focus(), 0),
  });

  useEffect(() => {
    return abortStyleSampleRequest;
  }, [abortStyleSampleRequest]);

  const imageNotebookStyleBrief = useMemo(
    () =>
      buildImageNotebookStyleBrief({
        style: selectedStyle,
        customStylePrompt: drawingStylePrompt,
        palette: selectedPalette,
        density: outlineLength === 'minimal' ? 'sparse' : 'medium',
      }),
    [drawingStylePrompt, outlineLength, selectedPalette, selectedStyle],
  );
  const imageNotebookStyleBriefPreview = useMemo(
    () => formatImageNotebookStyleBriefPreview(imageNotebookStyleBrief),
    [imageNotebookStyleBrief],
  );

  const startPlanningReveal = (pageNumbers: number[]) => {
    const normalized = Array.from(
      new Set(pageNumbers.filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0)),
    );
    if (planningRevealTimeoutRef.current != null) {
      window.clearTimeout(planningRevealTimeoutRef.current);
      planningRevealTimeoutRef.current = null;
    }
    if (normalized.length === 0) {
      setRevealingPlanningPageNumbers([]);
      return;
    }
    setRevealingPlanningPageNumbers(normalized);
    setPlanningRevealRevision((revision) => revision + 1);
    planningRevealTimeoutRef.current = window.setTimeout(() => {
      setRevealingPlanningPageNumbers([]);
      planningRevealTimeoutRef.current = null;
    }, 9000);
  };

  const selectPlanningPhase = (phase: PlanningPhase) => {
    setError(null);
    setActiveStep('outline');
    setPlanningPhase(phase);

    if (!hasPlanningMockStreams) {
      setCurrentPlanningPageNumbers([]);
      return;
    }

    const mockPages = buildMockPlanningPagesForPhase(phase);
    const page = pickMockPlanningPage(phase, mockPages);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage(
      `Mock：正在查看 ${getWorkspaceProgressLabel('outline', phase)} 的并行 stream。`,
    );
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(mockPages);
    setSelectedOutlineId(page.id);
    setCurrentPlanningPageNumbers([]);
    setPlanningRevealRevision((revision) => revision + 1);
    startPlanningReveal([page.pageNumber]);
  };

  const selectProgressStep = (step: WorkspaceProgressStep) => {
    setError(null);
    if (step.id === 'input') {
      setActiveStep('input');
      return;
    }
    if (step.planningPhase || step.planningPhases?.length) {
      selectPlanningPhase(
        step.planningPhase || planningPhase || step.planningPhases?.[0] || 'course-spine',
      );
      return;
    }
    if (step.id === 'result') {
      const hasExistingGenerationTask = activeGenerationTaskId
        ? generationTasks.some(
            (task) =>
              task.id === activeGenerationTaskId &&
              task.status !== 'failed' &&
              task.status !== 'cancelled',
          )
        : generationTasks.some(
            (task) =>
              task.courseId === courseId &&
              task.generateSlides &&
              (task.status === 'queued' || task.status === 'running'),
          );
      if (
        !hasExistingGenerationTask &&
        outlineGenerationStatus === 'ready' &&
        outlineRows.length > 0
      ) {
        void handleGenerate();
        return;
      }
      setActiveStep('result');
    }
  };

  const clearPlanningMockOverride = () => {
    clearPlanningMockStreamTimers();
    setPlanningMockStreams({});
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([]);
  };

  const setPlanningMockPhaseState = (phase: PlanningPhase, state: PlanningMockPhaseState) => {
    clearPlanningMockStreamTimers();

    const mockPages = buildMockPlanningPagesForPhase(phase);
    const page = pickMockPlanningPage(phase, mockPages);
    const isLoadingState = state !== 'input' && state !== 'done';
    const mockText =
      state === 'input' ? null : state === 'done' ? buildPlanningPhaseMockText(phase, page) : '';

    setError(null);
    setActiveStep('outline');
    setPlanningPhase(phase);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage(
      `Mock：${getWorkspaceProgressLabel('outline', phase)} · ${PLANNING_MOCK_STATE_LABELS[state]}。`,
    );
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(mockPages);
    setSelectedOutlineId(page.id);
    setCurrentPlanningPageNumbers([]);
    setRevealingPlanningPageNumbers([]);
    setPlanningMockStreams({ [phase]: mockText });
    setPlanningMockPhaseStates({ [phase]: state });
    setPlanningMockStreamingPhases(isLoadingState ? [phase] : []);
    setPlanningRevealRevision((revision) => revision + 1);
  };

  const startParallelPlanningMockStreams = (initialPhase: PlanningPhase = planningPhase) => {
    clearPlanningMockStreamTimers();

    const initialMockPages = buildMockPlanningPagesForPhase(initialPhase);
    const initialPage = pickMockPlanningPage(initialPhase, initialMockPages);
    const initialStreams = Object.fromEntries(
      PLANNING_PHASE_ORDER.map((phase) => [phase, '']),
    ) as PlanningMockStreams;
    setError(null);
    setActiveStep('outline');
    setPlanningPhase(initialPhase);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage('Mock：页面规划和画图 prompt 正在同一条链路里写入。');
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(initialMockPages);
    setSelectedOutlineId(initialPage.id);
    setCurrentPlanningPageNumbers([]);
    setPlanningMockStreams(initialStreams);
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([...PLANNING_PHASE_ORDER]);
    setPlanningRevealRevision((revision) => revision + 1);
    startPlanningReveal([initialPage.pageNumber]);

    PLANNING_PHASE_ORDER.forEach((phase, phaseIndex) => {
      const mockPages = buildMockPlanningPagesForPhase(phase);
      const page = pickMockPlanningPage(phase, mockPages);
      const fullText = buildPlanningPhaseMockText(phase, page);
      let length = 0;
      const chunkSize = phase === 'course-spine' ? 12 : 16;
      const intervalMs = 38 + phaseIndex * 8;
      const timerId = window.setInterval(() => {
        length = Math.min(fullText.length, length + chunkSize);
        setPlanningMockStreams((current) => ({
          ...current,
          [phase]: fullText.slice(0, length),
        }));
        if (length >= fullText.length) {
          window.clearInterval(timerId);
          planningMockStreamTimersRef.current = planningMockStreamTimersRef.current.filter(
            (id) => id !== timerId,
          );
          setPlanningMockStreamingPhases((current) =>
            current.filter((streamingPhase) => streamingPhase !== phase),
          );
        }
      }, intervalMs);
      planningMockStreamTimersRef.current.push(timerId);
    });
  };

  const generateStyleSample = useCreateNotebookStyleSample({
    courseId,
    currentStyleSampleKey,
    drawingStylePrompt,
    imageNotebookStyleBrief,
    form,
    hasCustomDrawingStyle,
    hasSelectableSourceImages,
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
    sourceExtract,
    styleSampleAbortRef,
    setError,
    setStyleSample,
    setStyleSampleError,
    setStyleSampleStatus,
    workedExampleLevel,
  });

  useEffect(() => {
    if (activeStep !== 'style') return;
    if (!selectedOutline) return;
    if (styleSampleStatus !== 'idle') return;
    if (styleSample?.imageUrl) return;
    void generateStyleSample();
  }, [activeStep, generateStyleSample, selectedOutline, styleSample?.imageUrl, styleSampleStatus]);

  const openSettings = () => {
    router.push('/settings');
  };

  const showSetupToast = (icon: ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="flex w-[356px] cursor-pointer items-start gap-3 rounded-xl border border-amber-200/60 bg-white p-4 shadow-lg shadow-amber-500/10 dark:border-amber-800/40 dark:bg-slate-900"
          onClick={() => {
            toast.dismiss(id);
            openSettings();
          }}
        >
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200/50 dark:bg-amber-900/40 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-amber-900 dark:text-amber-200">
              {title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/70">
              {desc}
            </p>
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const buildConfirmedRequirement = () => {
    const requirement = form.requirement.trim();
    const lines = [
      requirement || (form.sourceFile ? '请根据上传资料创建一套完整的图片 notebook。' : ''),
      '',
      '用户已确认以下生成方案：',
      `- 输出形式：整页图片 notebook，每页先由图像模型生成 16:9 课堂板书位图，再进入课堂播放。`,
      '页面风格 brief：',
      imageNotebookStyleBriefPreview,
      `- 篇幅档位：${outlineLengthLabel(outlineLength)}。`,
      `- 篇幅策略：${outlineLengthStrategyText(outlineLength)}`,
      `- 例题数量：${workedExampleLevelLabel(workedExampleLevel)}。`,
      `- 是否包含测验页：${includeQuizScenes ? '包含' : '不包含'}。`,
      styleSample?.qa
        ? `- 单页质量检查：QA ${styleSample.qa.passed ? '通过' : '未通过'}，speech ${
            styleSample.speechCount ?? 0
          } 段，focus ${styleSample.focusCount ?? 0} 个。`
        : '- 单页质量检查：尚未记录。',
      '',
      '本轮输入来源：',
      ...keptMaterials.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`),
      ...(hasSelectableSourceImages
        ? [
            `图片保留：${selectedSourceImages.length}/${sourcePreview.imagePreviews.length} 张缩略图会进入生成依据。`,
            selectedSourceImages.length > 0
              ? `保留图片：${selectedSourceImages.map((image) => image.title).join('、')}`
              : '保留图片：无。',
          ]
        : []),
      '',
      '用户确认的页面规划顺序：',
      ...outlineRows.map((row, index) => `${index + 1}. ${row.title}：${row.focus}`),
    ];
    return lines.filter(Boolean).join('\n');
  };

  const buildOutlineGenerationRequirement = (sourceInput?: PreparedSourceInput) => {
    const requirement = form.requirement.trim();
    const preview = sourceInput?.preview ?? sourcePreview;
    const selectedIds = sourceInput?.selectedImageIds ?? selectedSourceImageIds;
    const selectedImageIdSet = new Set(selectedIds);
    const previewImages = preview.imagePreviews || [];
    const selectedImages = previewImages.filter((image) => selectedImageIdSet.has(image.id));
    const hasPreviewImages = previewImages.length > 0;
    const sourceItems = preview.items.slice(0, 5);
    const keptPdfPages =
      form.sourceFile && sourcePageSelection?.type === 'pdf'
        ? sourcePageSelection.pages
            .filter((page) => page.keep)
            .map((page) => page.pageNumber)
            .sort((a, b) => a - b)
        : [];
    const sourceFlowLines = form.sourceFile
      ? [
          `文件：${form.sourceFile.name}（${fileKindLabel(form.sourceFile)}，${formatFileSize(form.sourceFile.size)}）`,
          keptPdfPages.length ? `选中页码：${keptPdfPages.join(', ')}` : '',
          sourceItems.length
            ? '已解析内容：'
            : preview.status === 'loading'
              ? '已解析内容：正在读取文件流。'
              : '已解析内容：暂未得到可展示片段，继续使用文件文本流进入规划。',
          ...sourceItems.map(
            (item, index) => `${index + 1}. ${item.title}（${item.kind}）：${item.detail}`,
          ),
          hasPreviewImages
            ? `图片/图形区域：保留 ${selectedImages.length}/${previewImages.length} 张，供后续画图 prompt 和图片生成参考。`
            : '',
          preview.warnings.length ? `读取提示：${preview.warnings.slice(0, 2).join('；')}` : '',
          preview.status === 'error' ? `读取错误：${preview.message}` : '',
        ].filter(Boolean)
      : ['无上传文件，仅基于用户主题/问题生成。'];
    const lines = [
      '输入来源：',
      `用户需求：${
        requirement ||
        (form.sourceFile ? '未填写额外文字需求；根据上传参考资料生成。' : '未填写明确主题。')
      }`,
      ...sourceFlowLines,
      '',
      '规划规则：',
      '根据当前输入直接生成一版可编辑页面规划，不需要单独确认素材；文件内容和文字需求都作为输入流进入规划。',
      '先决定整课主线、页面数量、每页涉及的知识点和教学动作。',
      '本步骤的输出是“页面规划 + 每页画图 prompt”，但规划规则只负责教学推进。',
      '页面风格 brief（进入 deterministic prompt compiler）：',
      imageNotebookStyleBriefPreview,
      `篇幅档位：${outlineLengthLabel(outlineLength)}。`,
      `篇幅策略：${outlineLengthStrategyText(outlineLength)}`,
      `例题数量：${workedExampleLevelLabel(workedExampleLevel)}。`,
      `测验页：${includeQuizScenes ? '可以包含轻量测验页' : '不要单独生成测验页'}。`,
      '',
      '教学边界：',
      '页面规划 AI 的任务只跟知识点和教学推进有关：不要把课号、校区、week/日期、作者/导师、页眉页脚、免责声明、logo/水印当作页面内容。',
      '第 1 页必须是学生视角的 overview / hook：用第一个真实知识点、公式、例题或方法提出“我们为什么要解决这个问题”，但不要从课程身份或来源信息开始，也不要写成教师路线图。',
      '第 2 页进入第一个实质讲解动作：定义边界、公式使用、例题走读、代码走读或证明走读。',
      '每页只安排一个清楚教学动作，避免把完整课堂压进单页。',
      '最后一页做总结、迁移练习或下一节课钩子。',
      '',
      '画图 prompt 规则：',
      '页面规划完成后，同一步会把页面分批交给画图 prompt 线程；每个线程最多负责 4 页。',
      '每页 prompt 必须写清定义全文、公式全文、代码全文、题目原文、例题步骤和必须避免的误区。',
      'marker/recover 协议由代码固定编译，页面规划 AI 不负责选择 marker 颜色。',
    ];
    return lines.join('\n');
  };

  const generateOutlineForReview = async () => {
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      openSettings();
      return;
    }

    if (!hasInput) {
      setError('请先输入想听的主题/问题，或上传一份参考资料。');
      setActiveStep('input');
      return;
    }

    setError(null);
    setActiveStep('outline');
    setOutlineGenerationStatus('loading');
    setOutlineGenerationMessage(
      form.sourceFile ? '正在读取参考资料并生成规划+prompt…' : '正在根据主题生成规划+prompt…',
    );
    setOutlineRows([]);
    setSelectedOutlineId('');
    setPlanningCourseSpine(null);
    setPlanningPages([]);
    setConfirmedImageNotebookPlan(null);
    setPlanningLiveDraft(null);
    setPlanningStreamEvents([]);
    setPlanningQuality(null);
    setPlanningPhase('course-spine');
    clearPlanningMockStreamTimers();
    setPlanningMockStreams({});
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([]);
    setPlanningRealPhaseStates({ 'course-spine': 'connecting' });
    setCurrentPlanningPageNumbers([]);
    setRevealingPlanningPageNumbers([]);
    setPlanningRevealRevision(0);
    if (planningRevealTimeoutRef.current != null) {
      window.clearTimeout(planningRevealTimeoutRef.current);
      planningRevealTimeoutRef.current = null;
    }
    resetStyleSample();

    outlineAbortRef.current?.abort();
    const abortController = new AbortController();
    outlineAbortRef.current = abortController;

    try {
      const preparedSource = await prepareSourceInputForPlanning(abortController.signal);
      if (abortController.signal.aborted) return;
      const userProfile = useUserProfileStore.getState();
      const selectedMedia = filterSelectedSourceMedia({
        pdfImages: preparedSource.extract.pdfImages,
        imageMapping: preparedSource.extract.imageMapping,
        selectedImageIds:
          preparedSource.preview.imagePreviews.length > 0
            ? preparedSource.selectedImageIds
            : undefined,
      });
      const basePayload = {
        requirements: {
          requirement: buildOutlineGenerationRequirement(preparedSource),
          language,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          webSearch: false,
        },
        pdfText: preparedSource.extract.text,
        agents: [],
        coursePurpose: 'university',
        notebookContext: {
          courseId,
        },
        outlinePreferences: {
          length: outlineLength,
          includeQuizScenes,
          workedExampleLevel,
        },
        style: {
          label: selectedStyle.label,
          prompt: drawingStylePrompt,
          palette: `${selectedPalette.label}: ${selectedPalette.colors.join(' / ')}`,
        },
        imageNotebookStyle: imageNotebookStyleBrief,
      };
      const budgetedMedia = buildBudgetedGenerationMedia({
        basePayload,
        pdfImages: selectedMedia.pdfImages,
        imageMapping: selectedMedia.imageMapping,
        preferredImageIds: selectedSourceImageIds,
        maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
      });
      const payload = {
        ...basePayload,
        ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
        ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
      };

      const headers = new Headers(
        getApiHeaders({
          imageGenerationEnabled: true,
          modelIdOverride,
          notebookStageModelOverrides,
          notebookModelMode,
          testNoCharge: true,
        }),
      );
      headers.set('Accept', 'text/event-stream');

      setOutlineGenerationMessage('正在生成整课主线和页面索引…');
      setPlanningStreamEvents(['启动整本页面规划流']);
      const response = await backendFetch('/api/generate/image-notebook-plan-stream', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const message = await readApiErrorMessage(response, '页面规划生成失败');
        throw new Error(message);
      }

      let streamedOutlines: SceneOutline[] = [];
      let expectedPlanningPageCount = 0;
      const mergeStreamedOutlines = (incoming: SceneOutline[]) => {
        const next = [...streamedOutlines];
        for (const outline of incoming) {
          const index = Math.max(0, (outline.order || next.length + 1) - 1);
          next[index] = outline;
        }
        streamedOutlines = next.filter(Boolean);
        return streamedOutlines;
      };
      const appendStreamEvent = (message: string) => {
        setPlanningStreamEvents((events) => [message, ...events].slice(0, 8));
      };

      await readImageNotebookPlanStream(response, (event) => {
        if (abortController.signal.aborted) return;
        if (event.type === 'status') {
          setOutlineGenerationMessage(event.detail);
          if (!planningCourseSpine && !planningPages.length) {
            setPlanningRealPhaseStates((current) => ({
              ...current,
              'course-spine': 'spine-loading',
            }));
          }
          appendStreamEvent(event.detail);
          return;
        }
        if (event.type === 'draft') {
          const detail =
            event.detail ||
            (event.phase === 'batch' ? '正在接收画图 prompt 草稿…' : '正在接收页面规划草稿…');
          setPlanningLiveDraft({
            phase: event.phase,
            detail,
            text: event.text || '',
          });
          setOutlineGenerationMessage(detail);
          setPlanningPhase(event.phase === 'batch' ? 'page-brief' : 'course-spine');
          setPlanningRealPhaseStates((current) => ({
            ...current,
            [event.phase === 'batch' ? 'page-brief' : 'course-spine']:
              event.phase === 'batch' ? 'index-loading' : 'spine-loading',
          }));
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'blueprint') {
          setPlanningLiveDraft(null);
          if (event.courseSpine) setPlanningCourseSpine(event.courseSpine);
          if (event.quality) setPlanningQuality(event.quality);
          const previews = pagePlanningPreviewsFromBlueprint(event.pageIndex);
          expectedPlanningPageCount = previews.length;
          setPlanningPages(previews);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief': previews.length > 0 ? 'connecting' : current['page-brief'],
          }));
          const rows = (event.pageIndex || []).map((page, index) => ({
            id: `outline-${page.pageNumber || index + 1}`,
            title: page.title?.trim() || `第 ${index + 1} 页`,
            focus:
              page.currentJob?.trim() ||
              page.keyPoints?.filter(Boolean).slice(0, 4).join('；') ||
              '等待详细页面规划…',
          }));
          if (rows.length > 0) {
            setOutlineRows(rows);
            setSelectedOutlineId((current) => current || rows[0]?.id || '');
            setOutlineGenerationMessage(
              `已生成 ${rows.length} 页页面规划，正在每批 4 页并行生成画图 prompt…`,
            );
            appendStreamEvent(`页面规划完成：${rows.length} 页`);
          }
          return;
        }
        if (event.type === 'batch-start') {
          setPlanningLiveDraft(null);
          setPlanningPhase('page-brief');
          const pageNumbers =
            event.pageNumbers?.filter((pageNumber) => Number.isFinite(pageNumber)) ||
            (event.startPage && event.endPage
              ? Array.from(
                  { length: Math.max(0, event.endPage - event.startPage + 1) },
                  (_, index) => event.startPage! + index,
                )
              : []);
          setCurrentPlanningPageNumbers(pageNumbers);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief': 'index-loading',
          }));
          const label =
            event.startPage && event.endPage
              ? `第 ${event.startPage}-${event.endPage} 页`
              : `第 ${(event.batchIndex ?? 0) + 1} 批`;
          const detail =
            event.attempt && event.attempt > 0
              ? `正在重试${label}画图 prompt…`
              : `正在生成${label}画图 prompt…`;
          setOutlineGenerationMessage(detail);
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'pages') {
          setPlanningLiveDraft(null);
          const incomingPageNumbers = Array.from(
            new Set(
              (
                event.pageNumbers ||
                event.outlines
                  ?.map((outline, index) => outline.order || (event.startPage || 1) + index)
                  .filter(Boolean) ||
                []
              ).filter((pageNumber) => Number.isFinite(pageNumber)),
            ),
          );
          const batchLabel =
            event.startPage && event.endPage
              ? `第 ${event.startPage}-${event.endPage} 页`
              : undefined;
          const merged = mergeStreamedOutlines(event.outlines || []);
          const completedPageCount = merged.length;
          const incomingRows = sceneOutlinesToRows(event.outlines || []);
          setOutlineRows((current) => {
            const next = current.length ? [...current] : sceneOutlinesToRows(merged);
            incomingRows.forEach((row, index) => {
              const order = Math.max(
                0,
                (event.outlines?.[index]?.order || (event.startPage || 1) + index) - 1,
              );
              next[order] = row;
            });
            return next.filter(Boolean);
          });
          setSelectedOutlineId((current) => {
            if (current && incomingRows.some((row) => row.id === current)) return current;
            return current || incomingRows[0]?.id || '';
          });
          setPlanningPages((pages) =>
            mergePagePlanningPreviews(
              pages,
              pagePlanningPreviewsFromOutlines(event.outlines, event.pageBriefs, batchLabel),
            ),
          );
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief':
              expectedPlanningPageCount > 0 && completedPageCount >= expectedPlanningPageCount
                ? 'done'
                : completedPageCount > 0
                  ? 'index-first-page'
                  : 'index-loading',
          }));
          startPlanningReveal(incomingPageNumbers);
          const detail = `${batchLabel || '一批页面'}画图 prompt 完成`;
          setOutlineGenerationMessage(detail);
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'quality') {
          setPlanningLiveDraft(null);
          if (event.quality) setPlanningQuality(event.quality);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': current['course-spine'] || 'done',
            'page-brief': 'done',
          }));
          appendStreamEvent(
            event.quality?.passed
              ? '页面规划和画图 prompt 检查通过'
              : '页面规划和画图 prompt 需要检查',
          );
          return;
        }
        if (event.type === 'done') {
          setPlanningLiveDraft(null);
          streamedOutlines = event.outlines?.length ? event.outlines : streamedOutlines;
          if (event.plan?.courseSpine) setPlanningCourseSpine(event.plan.courseSpine);
          if (event.planQuality) setPlanningQuality(event.planQuality);
          setPlanningRealPhaseStates({
            'course-spine': 'done',
            'page-brief': 'done',
          });
          if (event.plan && streamedOutlines.length) {
            setConfirmedImageNotebookPlan({
              outlines: streamedOutlines,
              plan: event.plan,
            });
          }
          setCurrentPlanningPageNumbers([]);
          setRevealingPlanningPageNumbers([]);
          if (planningRevealTimeoutRef.current != null) {
            window.clearTimeout(planningRevealTimeoutRef.current);
            planningRevealTimeoutRef.current = null;
          }
          setPlanningPages(
            pagePlanningPreviewsFromOutlines(streamedOutlines, event.plan?.pageBriefs, '最终规划'),
          );
          appendStreamEvent(
            `页面规划和画图 prompt 完成：${event.outlines?.length || streamedOutlines.length} 页`,
          );
        }
      });

      if (!streamedOutlines.length) {
        throw new Error('没有生成可用页面规划');
      }
      const rows = sceneOutlinesToRows(streamedOutlines);
      if (rows.length === 0) {
        throw new Error('没有生成可用页面规划');
      }
      setOutlineRows(rows);
      setSelectedOutlineId(rows[0]?.id || '');
      setOutlineGenerationStatus('ready');
      setCurrentPlanningPageNumbers([]);
      setRevealingPlanningPageNumbers([]);
      setPlanningLiveDraft(null);
      setPlanningRealPhaseStates({
        'course-spine': 'done',
        'page-brief': 'done',
      });
      setOutlineGenerationMessage(
        `已生成 ${rows.length} 页页面规划和画图 prompt，可以并行生成图片。`,
      );
    } catch (err) {
      if (abortController.signal.aborted) return;
      log.error('Outline review generation failed:', err);
      const message = err instanceof Error ? err.message : '页面规划生成失败';
      setOutlineGenerationStatus('error');
      setCurrentPlanningPageNumbers([]);
      setPlanningLiveDraft(null);
      setPlanningRealPhaseStates({});
      setOutlineGenerationMessage(message);
      setError(message);
    } finally {
      if (outlineAbortRef.current === abortController) {
        outlineAbortRef.current = null;
      }
    }
  };

  const handleCreateMarkdownNotebook = async () => {
    if (!hasInput) {
      setError('请先输入想听的主题/问题，或上传一份参考资料。');
      setActiveStep('input');
      return;
    }

    const cid = courseId.trim();
    if (!cid) {
      setError('请先从「我的课程」进入某一门课程，再创建笔记本。');
      return;
    }

    setError(null);
    setBusy(true);
    setActiveStep('result');

    try {
      const preparedSource = await prepareSourceInputForPlanning();
      const sections = buildMarkdownNotebookSections({
        requirement: form.requirement,
        sourceText: preparedSource.extract.text,
        sourceFileName: form.sourceFile?.name,
      });
      if (sections.length === 0) {
        throw new Error('没有可写入的 Markdown 内容，请输入主题/内容或上传一份可解析的资料。');
      }
      const notebookName = buildMarkdownNotebookName({
        requirement: form.requirement,
        sourceFileName: form.sourceFile?.name,
        firstSectionTitle: sections[0]?.title,
      });
      const response = await backendFetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: cid,
          name: notebookName,
          description: `纯文字 Markdown 笔记本，按文档结构连续阅读。`,
          tags: ['Markdown', '纯文字'],
          language,
          style: 'markdown',
          notebookKind: 'markdown',
          markdownSections: sections,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Markdown 笔记本创建失败'));
      }
      const data = (await response.json()) as { notebook?: { id?: string; name?: string } };
      const notebookId = data.notebook?.id?.trim();
      if (!notebookId) throw new Error('Markdown 笔记本创建失败：服务端没有返回 notebook id');
      window.dispatchEvent(
        new CustomEvent('synatra-notebook-list-updated', {
          detail: { courseId: cid, notebookId },
        }),
      );
      toast.success(`已创建「${data.notebook?.name || notebookName}」`);
      router.push(`/classroom/${encodeURIComponent(notebookId)}`);
    } catch (err) {
      log.error('Error creating markdown notebook:', err);
      setActiveStep('input');
      setError(err instanceof Error ? err.message : 'Markdown 笔记本创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async (forcedSelection?: PdfSourceSelection) => {
    if (!hasInput) {
      setError('请先输入想听的主题/问题，或上传一份参考资料。');
      setActiveStep('input');
      return;
    }

    const cid = courseId.trim();
    if (!cid) {
      setError('请先从「我的课程」进入某一门课程，再创建笔记本。');
      return;
    }

    const effectiveSelection = (() => {
      const sourceFile = form.sourceFile;
      if (!sourceFile || !isPdfSourceFile(sourceFile)) return undefined;
      const signature = getPdfSourceFileSignature(sourceFile);
      const candidate = forcedSelection ?? sourcePageSelection ?? undefined;
      return candidate?.fileSignature === signature ? candidate : undefined;
    })();

    if (
      form.sourceFile &&
      isPdfSourceFile(form.sourceFile) &&
      form.sourceFile.size > PDF_PAGE_SELECTION_MAX_BYTES &&
      !effectiveSelection
    ) {
      setPageSelectionDialogOpen(true);
      return;
    }

    if (notebookKind === 'markdown') {
      void handleCreateMarkdownNotebook();
      return;
    }

    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      openSettings();
      return;
    }

    setError(null);
    setBusy(true);
    setActiveStep('result');

    try {
      const userProfile = useUserProfileStore.getState();
      const generationTask = enqueueNotebookGeneration(
        {
          courseId: cid,
          requirement: buildConfirmedRequirement(),
          notebookModelMode,
          modelIdOverride,
          notebookStageModelOverrides,
          language,
          webSearch: false,
          generateSlides: true,
          slideGenerationRoute: 'image-ppt',
          sourceFile: form.sourceFile,
          sourcePageSelection: effectiveSelection,
          sourceImageIds: hasSelectableSourceImages ? selectedSourceImageIds : undefined,
          confirmedImageNotebookOutlines:
            confirmedImageNotebookPlan?.outlines ||
            (outlineGenerationStatus === 'ready' && outlineRows.length > 0
              ? outlineRowsToSceneOutlines(outlineRows, language)
              : undefined),
          confirmedImageNotebookPlan: confirmedImageNotebookPlan?.plan,
          imageNotebookStyle: imageNotebookStyleBrief,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          imageGenerationEnabledOverride: true,
          outlinePreferences: {
            length: outlineLength,
            includeQuizScenes,
            workedExampleLevel,
          },
        },
        {
          onProgress: (_task, progress) => {
            if (progress.stage === 'notebook-ready') {
              window.dispatchEvent(
                new CustomEvent('synatra-notebook-list-updated', {
                  detail: { courseId: cid, notebookId: progress.notebookId },
                }),
              );
            }
          },
          onCompleted: (_task, result) => {
            window.dispatchEvent(
              new CustomEvent('synatra-notebook-list-updated', {
                detail: { courseId: cid, notebookId: result.stage.id },
              }),
            );
            enqueueCompanionBanner(
              buildStudyCompanionNotification({
                id: `notebook-ready:${result.stage.id}`,
                sourceKind: 'notebook_ready',
                title: '笔记本生成好了',
                body:
                  result.scenes.length > 0
                    ? `笔记本「${result.stage.name}」已创建完成，共 ${result.scenes.length} 页。`
                    : `笔记本「${result.stage.name}」已加入仓库。`,
                amountLabel: '生成好了',
                sourceLabel: '笔记本生成',
                details: [
                  { key: 'notebook', label: '笔记本', value: result.stage.name },
                  { key: 'pages', label: '页面数', value: String(result.scenes.length) },
                ],
              }),
            );
          },
          onFailed: (_task, message) => {
            toast.error(`笔记本生成失败：${message}`);
          },
          onCancelled: () => {
            toast.info('已取消笔记本生成任务');
          },
        },
      );
      setActiveGenerationTaskId(generationTask.id);
      toast.success('已加入生成队列');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (activeStep === 'input') {
      if (!hasInput) {
        setError('请先输入想听的主题/问题，或上传一份参考资料。');
        return;
      }
      if (notebookKind === 'markdown') {
        void handleGenerate();
        return;
      }
      void generateOutlineForReview();
    } else if (activeStep === 'materials') {
      if (notebookKind === 'markdown') {
        void handleGenerate();
        return;
      }
      void generateOutlineForReview();
    } else if (activeStep === 'outline') {
      if (outlineNeedsInitialGeneration) {
        void generateOutlineForReview();
        return;
      }
      if (outlineGenerationStatus === 'loading') {
        setError('页面规划和画图 prompt 还在生成中，完成后再并行生成图片。');
        return;
      }
      if (outlineGenerationStatus !== 'ready' || outlineRows.length === 0) {
        setError('请先生成并确认页面规划。');
        return;
      }
      void handleGenerate();
    } else if (activeStep === 'style') {
      if (!styleSampleQualityPassed) {
        setError('请先在当前生成方案下跑通单页质量检查。');
        return;
      }
      void handleGenerate();
    }
  };

  const goBack = () => {
    if (activeStep === 'materials') setActiveStep('input');
    if (activeStep === 'outline') {
      setActiveStep('input');
    }
    if (activeStep === 'style') {
      setPlanningPhase('page-brief');
      setActiveStep('outline');
    }
    if (activeStep === 'result') setActiveStep('outline');
  };

  const addOutlineRow = () => {
    const id = `custom-${Date.now()}`;
    setConfirmedImageNotebookPlan(null);
    setOutlineRows((rows) => [
      ...rows,
      { id, title: '新增页面', focus: '补充一个需要单独讲清楚的知识点。' },
    ]);
    setSelectedOutlineId(id);
  };

  const confirmedGenerationPromptPreview = outlineRows.length ? buildConfirmedRequirement() : '';
  const planningInputPageLines = planningListPages.length
    ? planningListPages.map((page) =>
        [
          `${String(page.pageNumber).padStart(2, '0')}. ${page.title}`,
          `   role: ${page.pageRole || 'pending'}`,
          `   currentJob: ${page.currentJob}`,
        ].join('\n'),
      )
    : outlineRows.map((row, index) =>
        [`${String(index + 1).padStart(2, '0')}. ${row.title}`, `   focus: ${row.focus}`].join(
          '\n',
        ),
      );
  const planningPromptBatchNumbers =
    currentPlanningPageNumbers.length > 0
      ? currentPlanningPageNumbers
      : planningListPages.length > 0
        ? planningListPages.map((page) => page.pageNumber).slice(0, 4)
        : outlineRows.map((_row, index) => index + 1).slice(0, 4);
  const planningInputPreview =
    planningPhase === 'course-spine'
      ? buildOutlineGenerationRequirement()
      : [
          '画图 prompt 生成输入',
          '',
          '并行策略：每个 thread 负责 4 页，根据页面规划生成完整画图 prompt。',
          planningPromptBatchNumbers.length
            ? `当前批次页码：${planningPromptBatchNumbers.join(', ')}`
            : '当前批次页码：等待页面规划。',
          '',
          '页面风格 brief：',
          imageNotebookStyleBriefPreview,
          `篇幅档位：${outlineLengthLabel(outlineLength)}`,
          '',
          '规划结果输入：',
          ...(planningInputPageLines.length ? planningInputPageLines : ['等待页面规划输出…']),
          '',
          '画图 prompt 必须写清：定义全文、公式全文、代码全文、题目原文、例题步骤和必须避免的误区。',
        ].join('\n');
  const activeGenerationTask =
    (activeGenerationTaskId
      ? generationTasks.find((task) => task.id === activeGenerationTaskId)
      : undefined) ||
    [...generationTasks]
      .reverse()
      .find(
        (task) =>
          task.courseId === courseId &&
          task.generateSlides &&
          ['queued', 'running'].includes(task.status),
      ) ||
    null;
  const runtimeImageGenerationRows = buildRuntimeImageGenerationRows(activeGenerationTask);
  const plannedImageGenerationRows =
    runtimeImageGenerationRows.length > 0 ? runtimeImageGenerationRows : outlineRows;
  const imageGenerationMockEnabled = imageGenerationMockPageCount !== null && !activeGenerationTask;
  const imageGenerationGridRows = imageGenerationMockEnabled
    ? takeImageGenerationRowsWithFallback(plannedImageGenerationRows, imageGenerationMockPageCount)
    : plannedImageGenerationRows;
  const canStartImageGenerationFromResult =
    !activeGenerationTask &&
    outlineGenerationStatus === 'ready' &&
    outlineRows.length > 0 &&
    imageGenerationMockPageCount === null;
  const currentPilotImagePromptPreview =
    selectedPlanningPage?.drawingPrompt ||
    (selectedOutline
      ? buildStyleSamplePrompt({
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
        })
      : '');
  const visiblePilotImagePrompt = styleSample?.prompt || currentPilotImagePromptPreview;
  const copyPrompt = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch (err) {
      log.error('Copy prompt failed:', err);
      toast.error(`${label}复制失败`);
    }
  };
  const drawingStylePromptCharacterCount = customStylePrompt.trim().length;

  return {
    activeGenerationTask,
    activeStep,
    activeStepIndex,
    activeStepLabel,
    addOutlineRow,
    busy,
    canStartImageGenerationFromResult,
    clearPlanningMockOverride,
    clearSourceFile,
    completedPlanningPhases,
    confirmedGenerationPromptPreview,
    copyPrompt,
    customStylePrompt,
    displayedPlanningStreamingPhases,
    drawingStylePromptCharacterCount,
    error,
    fileInputRef,
    form,
    generateOutlineForReview,
    generateStyleSample,
    goBack,
    goNext,
    handleFileSelect,
    handleGenerate,
    handleSourceInputDragEnter,
    handleSourceInputDragLeave,
    handleSourceInputDragOver,
    handleSourceInputDrop,
    hasCustomDrawingStyle,
    hasInput,
    hasPlanningMockStreams,
    hasSelectableSourceImages,
    hasSelectedPlanningStepText,
    hidePlanningInputPanel,
    imageGenerationGridRows,
    imageGenerationMockEnabled,
    imageGenerationMockPageCount,
    includeQuizScenes,
    keptMaterials,
    language,
    materials,
    missingSourceImagePreviewCount,
    notebookKind,
    outlineGenerationMessage,
    outlineGenerationStatus,
    outlineIsLoading,
    outlineLength,
    outlineNeedsInitialGeneration,
    outlineNextDisabled,
    outlineRows,
    pageSelectionDialogOpen,
    planningInputPreview,
    planningListPages,
    planningPhase,
    planningRevealRevision,
    resetSourceInput,
    resetStyleState,
    selectDrawingStyle,
    selectedOutline,
    selectedPalette,
    selectedPaletteId,
    selectedPlanningEffectivePhaseState,
    selectedPlanningIsWriting,
    selectedPlanningMockPhaseState,
    selectedPlanningPage,
    selectedPlanningRealPhaseState,
    selectedPlanningStepIsWriting,
    selectedPlanningStepText,
    selectedPlanningStructuredLoadingState,
    selectedPlanningStructuredOutput,
    selectedSourceImageIdSet,
    selectedSourceImages,
    selectedStyle,
    selectedStyleId,
    selectProgressStep,
    setActiveStep,
    setAllSourceImagesSelected,
    setConfirmedImageNotebookPlan,
    setCurrentPlanningPageNumbers,
    setCustomStylePrompt,
    setImageGenerationMockPageCount,
    setIncludeQuizScenes,
    setLanguage,
    setMaterialKeep,
    setNotebookKind,
    setOutlineGenerationMessage,
    setOutlineGenerationStatus,
    setOutlineLength,
    setOutlineRows,
    setPageSelectionDialogOpen,
    setPlanningCourseSpine,
    setPlanningLiveDraft,
    setPlanningMockPhaseState,
    setPlanningMockPhaseStates,
    setPlanningMockStreamingPhases,
    setPlanningMockStreams,
    setPlanningPages,
    setPlanningQuality,
    setPlanningRealPhaseStates,
    setPlanningStreamEvents,
    setSelectedOutlineId,
    setSelectedPaletteId,
    setSourceImageSelection,
    setSourcePageSelection,
    setWorkedExampleLevel,
    showPlanningInputOnly,
    showPlanningOutputPanel,
    sourceDragActive,
    sourcePreview,
    startParallelPlanningMockStreams,
    structuredPlanningCourseSpine,
    stylePromptTextareaRef,
    styleSample,
    styleSampleError,
    styleSampleIsCurrent,
    styleSampleIsStale,
    styleSampleQualityPassed,
    styleSampleStatus,
    updateRequirement,
    visiblePilotImagePrompt,
    workedExampleLevel,
  };
}

export type CreateNotebookWorkspaceController = ReturnType<
  typeof useCreateNotebookWorkspaceController
>;
