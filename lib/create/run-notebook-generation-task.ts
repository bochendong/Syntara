'use client';

import { nanoid } from 'nanoid';
import { useSettingsStore } from '@/lib/store/settings';
import { ensureLegacyCourseBucket, getCourse, LEGACY_COURSE_ID } from '@/lib/utils/course-storage';
import { pickStableNotebookAgentAvatarUrl } from '@/lib/constants/notebook-agent-avatars';
import { saveStageData } from '@/lib/utils/stage-storage';
import {
  persistGeneratedAgentsForStage,
  useAgentRegistry,
} from '@/lib/orchestration/registry/store';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { PageGenerationFailureRecord, Scene, Stage } from '@/lib/types/stage';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import { spliceGeneratedOutlines } from '@/lib/generation/continuation-pages';
import type { NotebookGenerationModelMode } from '@/lib/constants/notebook-generation-model-presets';
import type {
  NotebookStageModelOverrides,
  OrchestratorOutlineLength,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
import type { PdfSourceSelection } from '@/lib/pdf/page-selection';
import { backendFetch } from '@/lib/utils/backend-api';
import { writeMemoryWithActivity } from '@/lib/utils/memory-write-api';
import { writePersistedStageOutlines } from '@/lib/utils/stage-outline-storage';
import { getApiHeaders } from './generation-headers';
import {
  isMarkdownSourceFile,
  isPdfSourceFile,
  isPptxSourceFile,
  parseMarkdownLikeGenerationInput,
  parsePdfLikeGenerationPreview,
  parsePptxLikeGenerationPreview,
} from './source-input';
import {
  analyzeOutlineCoverage,
  applyOutlineLanguage,
  applyOutlinePreferenceHardConstraints,
  buildOutlineRepairRequirement,
  filterOutlineMediaGenerations,
  mergeSupplementalOutlines,
  normalizeOutlineCollection,
  type EffectiveMediaFlags,
} from './outline-preferences';
import {
  buildPayloadTooLargeMessage,
  buildShortFailureReason,
  readApiErrorMessage,
} from './api-errors';
import { normalizeOutlineStructure } from '@/lib/generation/outline-structure';
import { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
import { ensureTitleCoverOutline, isTitleCoverOutline } from '@/lib/generation/title-cover';
import {
  DEFAULT_NOTEBOOK_SLIDE_GENERATION_ROUTE,
  normalizeNotebookSlideGenerationRoute,
  type SlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
import type {
  ImageNotebookBriefPlan,
  ImageNotebookStyleBrief,
} from '@/lib/generation/image-notebook-quality';
import { attachImageNotebookPromptPlan } from '@/lib/generation/image-notebook-prompt-plan';
import {
  recordNotebookPublicMemory,
  type NotebookMemorySourceReference,
} from '@/lib/learning/study-memory';
import {
  createLinkedAbortController,
  errorMessage,
  generateSceneActionsFromContent,
  type GeneratedSceneContentBundle,
  type SceneContentJobResult,
} from './scene-content-jobs';
import { generateNotebookMetadata } from './notebook-metadata';
import { maybeRunWebSearch, type WebSearchSource } from './research';
import { ParallelTaskQueue } from '@/lib/utils/parallel-task-queue';

type NotebookOutlinesApiResponse = {
  success?: boolean;
  outlines?: SceneOutline[];
  error?: string;
};

type ImageNotebookPlanQualityReport = {
  passed: boolean;
  minPageCount?: number;
  findings?: string[];
  blockedPhrases?: string[];
  retryCount?: number;
};

type ImageNotebookPageIndexPreview = {
  pageNumber: number;
  pageRole: string;
  title: string;
  archetype?: string;
  currentJob?: string;
  keyPoints?: string[];
};

type ImageNotebookPlanStreamEvent =
  | { type: 'status'; detail: string }
  | {
      type: 'draft';
      phase?: 'blueprint' | 'batch';
      detail?: string;
      text?: string;
      batchIndex?: number;
      pageNumbers?: number[];
      attempt?: number;
    }
  | {
      type: 'blueprint';
      courseSpine?: ImageNotebookBriefPlan['courseSpine'];
      pageIndex?: ImageNotebookPageIndexPreview[];
      quality?: ImageNotebookPlanQualityReport;
      attempt?: number;
    }
  | {
      type: 'batch-start';
      batchIndex?: number;
      batchCount?: number;
      pageNumbers?: number[];
      startPage?: number;
      endPage?: number;
      attempt?: number;
    }
  | {
      type: 'pages';
      batchIndex?: number;
      batchCount?: number;
      pageNumbers?: number[];
      startPage?: number;
      endPage?: number;
      outlines?: SceneOutline[];
      pageBriefs?: ImageNotebookBriefPlan['pageBriefs'];
    }
  | { type: 'quality'; quality?: ImageNotebookPlanQualityReport }
  | {
      type: 'done';
      outlines?: SceneOutline[];
      plan?: ImageNotebookBriefPlan;
      plannerMode?: string;
      planBatchCount?: number;
      planQuality?: ImageNotebookPlanQualityReport;
      planQualityAttempts?: ImageNotebookPlanQualityReport[];
      model?: string;
    }
  | { type: 'error'; error?: string };

const MAX_PARALLEL_STANDARD_SCENE_CONTENT = 2;
const MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES = 5;
const NOTEBOOK_GENERATION_TEST_NO_CHARGE = true;

export type NotebookGenerationProgress =
  | { stage: 'preparing'; detail: string }
  | { stage: 'pdf-analysis'; detail: string }
  | { stage: 'research'; detail: string; sources?: WebSearchSource[] }
  | { stage: 'metadata'; detail: string }
  | { stage: 'notebook-ready'; detail: string; notebookId: string }
  | { stage: 'agents'; detail: string }
  | { stage: 'outline'; detail: string; completed?: number }
  | { stage: 'image-prep'; detail: string; completed?: number; total?: number }
  | {
      stage: 'scene';
      detail: string;
      completed: number;
      total: number;
      generatedPageThumbnails?: NotebookGeneratedPageThumbnail[];
    }
  | { stage: 'saving'; detail: string }
  | { stage: 'completed'; detail: string; notebookId: string; notebookName: string };

export type NotebookGeneratedPageThumbnail = {
  pageNumber: number;
  imageUrl: string;
};

type SlideCanvasImageElementLike = {
  type?: unknown;
  name?: unknown;
  src?: unknown;
  left?: unknown;
  top?: unknown;
  width?: unknown;
  height?: unknown;
};

type SlideCanvasLike = {
  elements?: unknown;
  viewportSize?: unknown;
  viewportRatio?: unknown;
};

export type NotebookGenerationTaskInput = {
  courseId?: string;
  generationTaskId?: string | null;
  requirement: string;
  /** 仅覆盖本次 notebook 创建链路所用的 OpenAI 模型；null/undefined 时沿用当前设置 */
  modelIdOverride?: string | null;
  /** 按创建步骤分别覆盖模型；未指定的步骤使用 `modelIdOverride`（再回退当前全局模型）；仅 `notebookModelMode === 'custom'` 时生效 */
  notebookStageModelOverrides?: NotebookStageModelOverrides | null;
  /** 默认 `recommended`：推荐 mini/主模型搭配；`max` 时全程 gpt-5.4 */
  notebookModelMode?: NotebookGenerationModelMode;
  language?: 'zh-CN' | 'en-US';
  webSearch?: boolean;
  /** 默认 true；关闭时只创建仓库笔记本，不生成 agents / 页面规划 / 图片页面 */
  generateSlides?: boolean;
  /** 页面内容生成路线：当前 Syntara 语义页或旧版 OpenMAIC Canvas */
  slideGenerationRoute?: SlideGenerationRoute | null;
  userNickname?: string;
  userBio?: string;
  signal?: AbortSignal;
  onProgress?: (progress: NotebookGenerationProgress) => void;
  /** 上传的源文档，支持 PDF / Markdown；`pdfFile` 保留兼容旧调用方 */
  sourceFile?: File | null;
  pdfFile?: File | null;
  sourcePageSelection?: PdfSourceSelection;
  /** 创建页输入流保留下来的源图片 id；传空数组表示不使用任何源图片 */
  sourceImageIds?: string[];
  /** 创建页已经审查通过的整本图片 notebook 页面规划；传入后并行生图阶段不会重新规划。 */
  confirmedImageNotebookOutlines?: SceneOutline[];
  confirmedImageNotebookPlan?: ImageNotebookBriefPlan | null;
  imageNotebookStyle?: ImageNotebookStyleBrief;
  /** 覆盖设置里的「AI 配图」开关；不传则沿用全局设置 */
  imageGenerationEnabledOverride?: boolean;
  /** 传入后由页面规划 API 注入额外策略（总控侧栏「生成选项」） */
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
};

export type NotebookGenerationTaskResult = {
  stage: Stage;
  scenes: Scene[];
  outlines: SceneOutline[];
  agents: AgentInfo[];
  researchSources: WebSearchSource[];
  failedScenes?: PageGenerationFailureRecord[];
};

function numericCanvasValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function imageElementArea(element: SlideCanvasImageElementLike) {
  return numericCanvasValue(element.width, 0) * numericCanvasValue(element.height, 0);
}

function getFullPageImageUrlFromSlideCanvas(canvas: SlideCanvasLike | undefined): string {
  const elements = canvas?.elements;
  if (!Array.isArray(elements)) return '';
  const imageElements = elements.filter(
    (element): element is SlideCanvasImageElementLike & { src: string } =>
      typeof element === 'object' &&
      element !== null &&
      (element as SlideCanvasImageElementLike).type === 'image' &&
      typeof (element as SlideCanvasImageElementLike).src === 'string' &&
      Boolean(((element as SlideCanvasImageElementLike).src as string).trim()),
  );
  const fullPageImage = imageElements.find((element) => element.name === 'full_page_bitmap');
  if (fullPageImage) return fullPageImage.src;

  const canvasWidth = numericCanvasValue(canvas?.viewportSize, 1000);
  const canvasHeight = canvasWidth * numericCanvasValue(canvas?.viewportRatio, 0.5625);
  const fullBleedImage = imageElements.find((element) => {
    const left = numericCanvasValue(element.left, Number.POSITIVE_INFINITY);
    const top = numericCanvasValue(element.top, Number.POSITIVE_INFINITY);
    const width = numericCanvasValue(element.width, 0);
    const height = numericCanvasValue(element.height, 0);
    return (
      left <= canvasWidth * 0.03 &&
      top <= canvasHeight * 0.03 &&
      width >= canvasWidth * 0.82 &&
      height >= canvasHeight * 0.82
    );
  });
  if (fullBleedImage) return fullBleedImage.src;

  return imageElements.reduce<string>((bestSrc, element) => {
    if (!bestSrc) return element.src;
    const best = imageElements.find((candidate) => candidate.src === bestSrc);
    return imageElementArea(element) > imageElementArea(best || {}) ? element.src : bestSrc;
  }, '');
}

export function getFullPageImageUrlFromScene(scene: Scene | undefined): string {
  if (scene?.content?.type !== 'slide') return '';
  return getFullPageImageUrlFromSlideCanvas(scene.content.canvas);
}

function generatedPageThumbnailsFromScenes(scenes: Scene[]): NotebookGeneratedPageThumbnail[] {
  return scenes
    .map((scene, index) => {
      const imageUrl = getFullPageImageUrlFromScene(scene);
      if (!imageUrl) return null;
      const pageNumber = Number.isFinite(scene.order) && scene.order > 0 ? scene.order : index + 1;
      return { pageNumber, imageUrl };
    })
    .filter((entry): entry is NotebookGeneratedPageThumbnail => Boolean(entry));
}

function generatedPageThumbnailsFromContentBundle(
  bundle: GeneratedSceneContentBundle,
  fallbackPageNumber: number,
): NotebookGeneratedPageThumbnail[] {
  return bundle.contents
    .map((content, index) => {
      if (
        typeof content !== 'object' ||
        content === null ||
        (content as { type?: unknown }).type !== 'slide'
      ) {
        return null;
      }
      const imageUrl = getFullPageImageUrlFromSlideCanvas(
        (content as { canvas?: SlideCanvasLike }).canvas,
      );
      if (!imageUrl) return null;
      const outline = bundle.effectiveOutlines[index];
      const pageNumber =
        outline && Number.isFinite(outline.order) && outline.order > 0
          ? outline.order
          : fallbackPageNumber + index;
      return { pageNumber, imageUrl };
    })
    .filter((entry): entry is NotebookGeneratedPageThumbnail => Boolean(entry));
}

function filterSourceImagesBySelection(args: {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  selectedImageIds?: string[];
}): { pdfImages?: PdfImage[]; imageMapping?: ImageMapping } {
  if (!args.selectedImageIds) {
    return { pdfImages: args.pdfImages, imageMapping: args.imageMapping };
  }

  const selected = new Set(args.selectedImageIds);
  const pdfImages = (args.pdfImages || []).filter((image) => selected.has(image.id));
  const imageMapping = Object.fromEntries(
    Object.entries(args.imageMapping || {}).filter(([imageId]) => selected.has(imageId)),
  );

  return { pdfImages, imageMapping };
}

function getPresetAgents(): AgentInfo[] {
  const settings = useSettingsStore.getState();
  const registry = useAgentRegistry.getState();
  return settings.selectedAgentIds
    .map((id) => registry.getAgent(id))
    .filter(Boolean)
    .map((agent) => ({
      id: agent!.id,
      name: agent!.name,
      role: agent!.role,
      persona: agent!.persona,
    }));
}

function inferPageGenerationFailurePhase(message: string): PageGenerationFailureRecord['phase'] {
  if (/actions?|讲解|narration|speech/i.test(message)) return 'actions';
  if (/content|semantic|layout|页面内容|语义|渲染|生成失败/i.test(message)) return 'content';
  return 'unknown';
}

function withPageGenerationFailure(stage: Stage, failure: PageGenerationFailureRecord): Stage {
  const failures = (stage.pageGenerationFailures || [])
    .filter((item) => item.outlineId !== failure.outlineId)
    .concat(failure)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

  return {
    ...stage,
    updatedAt: Math.max(stage.updatedAt || 0, Date.now()),
    pageGenerationFailures: failures,
  };
}

function compactPublicMemoryLine(value: string | undefined | null, maxLength = 160): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function uniquePublicMemoryLines(
  values: Array<string | undefined | null>,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const value of values) {
    const line = compactPublicMemoryLine(value);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
    if (lines.length >= limit) break;
  }
  return lines;
}

function getTeachingOutlinesForPublicMemory(outlines: SceneOutline[]): SceneOutline[] {
  const teachingOutlines = outlines.filter((outline) => !isTitleCoverOutline(outline));
  return teachingOutlines.length > 0 ? teachingOutlines : outlines;
}

function buildNotebookPublicMemoryText(args: {
  stage: Stage;
  outlines: SceneOutline[];
  language: 'zh-CN' | 'en-US';
}): string {
  const teachingOutlines = getTeachingOutlinesForPublicMemory(args.outlines);
  const keyPoints = uniquePublicMemoryLines(
    teachingOutlines.flatMap((outline) => outline.keyPoints || []),
    18,
  );
  const teachingMoves = uniquePublicMemoryLines(
    teachingOutlines.flatMap((outline) => [
      outline.teachingObjective,
      outline.studentThinkingMove,
      outline.description,
    ]),
    12,
  );
  const workedExamples = uniquePublicMemoryLines(
    teachingOutlines.flatMap((outline) => [
      outline.workedExampleConfig?.problemStatement,
      ...(outline.workedExampleConfig?.solutionPlan || []),
      ...(outline.workedExampleConfig?.commonPitfalls || []),
    ]),
    8,
  );
  const pageRows = teachingOutlines.slice(0, 18).map((outline, index) => {
    const pageNumber = outline.order > 0 ? outline.order : index + 1;
    const focus =
      outline.teachingObjective ||
      outline.studentThinkingMove ||
      outline.keyPoints?.[0] ||
      outline.description;
    return `| ${pageNumber} | ${compactPublicMemoryLine(outline.title, 48)} | ${compactPublicMemoryLine(focus, 88)} |`;
  });

  const objective =
    compactPublicMemoryLine(args.stage.description, 260) ||
    (args.language === 'en-US'
      ? `Notebook: ${compactPublicMemoryLine(args.stage.name, 120)}`
      : `笔记本：${compactPublicMemoryLine(args.stage.name, 120)}`);
  const sections = [
    '## 笔记本目标',
    `- ${objective}`,
    '',
    '## 涉及知识点',
    ...(keyPoints.length > 0 ? keyPoints.map((line) => `- ${line}`) : ['- 暂未提取明确知识点']),
    '',
    '## 讲解重点',
    ...(teachingMoves.length > 0
      ? teachingMoves.map((line) => `- ${line}`)
      : ['- 暂未提取明确讲解重点']),
  ];

  if (workedExamples.length > 0) {
    sections.push('', '## 例题与易错点', ...workedExamples.map((line) => `- ${line}`));
  }

  if (pageRows.length > 0) {
    sections.push('', '## 页面索引', '| 页码 | 页面 | 重点 |', '| --- | --- | --- |', ...pageRows);
  }

  return sections.join('\n').slice(0, 12000);
}

function buildNotebookPublicMemorySourceReferences(args: {
  stage: Stage;
  outlines: SceneOutline[];
}): NotebookMemorySourceReference[] {
  return getTeachingOutlinesForPublicMemory(args.outlines)
    .slice(0, 12)
    .map((outline, index) => ({
      notebookId: args.stage.id,
      notebookName: args.stage.name,
      order: outline.order > 0 ? outline.order : index + 1,
      title: compactPublicMemoryLine(outline.title, 80),
      why: compactPublicMemoryLine(
        outline.teachingObjective ||
          outline.studentThinkingMove ||
          outline.description ||
          outline.keyPoints?.[0],
        160,
      ),
    }));
}

async function persistNotebookPublicMemoryToDatabase(args: {
  stageId: string;
  title: string;
  text: string;
  reason: string;
  sourceReferences: NotebookMemorySourceReference[];
}): Promise<void> {
  if (!args.text.trim()) return;
  try {
    await writeMemoryWithActivity({
      candidate: {
        trigger: 'source_import',
        contentType: 'notebook_requirement',
        targetType: 'notebook',
        targetId: args.stageId,
        privacy: 'public',
        source: 'notebook_generation',
        title: args.title,
        text: args.text,
        studyMemory: {
          targetType: 'notebook',
          targetId: args.stageId,
          scope: 'public',
          kind: 'manual',
          title: args.title,
          text: args.text,
          reason: args.reason,
          sourceReferences: args.sourceReferences,
        },
      },
    });
  } catch (memoryError) {
    console.warn('[NotebookGeneration] Failed to persist database public memory', {
      stageId: args.stageId,
      error: errorMessage(memoryError, '数据库公共记忆写入失败'),
    });
  }
}

function persistNotebookPublicMemory(args: {
  stage: Stage;
  outlines: SceneOutline[];
  language: 'zh-CN' | 'en-US';
}): void {
  const title = '涉及知识点与讲解重点';
  const text = buildNotebookPublicMemoryText(args);
  const reason = '笔记本生成时根据最终页面规划自动写入，供问答和复习路线读取。';
  const sourceReferences = buildNotebookPublicMemorySourceReferences(args);
  try {
    recordNotebookPublicMemory({
      stageId: args.stage.id,
      title,
      text,
      reason,
      kind: 'manual',
      source: 'notebook_generation',
      sourceReferences,
    });
  } catch (memoryError) {
    console.warn('[NotebookGeneration] Failed to persist public memory', {
      stageId: args.stage.id,
      error: errorMessage(memoryError, '公共记忆写入失败'),
    });
  }
  void persistNotebookPublicMemoryToDatabase({
    stageId: args.stage.id,
    title,
    text,
    reason,
    sourceReferences,
  });
}

function attachImageNotebookBriefPlan(
  outlines: SceneOutline[],
  plan: ImageNotebookBriefPlan,
): SceneOutline[] {
  const briefsByOutlineId = new Map(plan.pageBriefs.map((brief) => [brief.outlineId, brief]));
  return outlines.map((outline) => ({
    ...outline,
    imageNotebookCourseSpine: plan.courseSpine,
    imageNotebookBrief: briefsByOutlineId.get(outline.id) || outline.imageNotebookBrief,
  }));
}

function ensureImageNotebookPromptPlans(args: {
  outlines: SceneOutline[];
  stage: Stage;
  language: 'zh-CN' | 'en-US';
}): SceneOutline[] {
  if (
    args.outlines.every((outline) => outline.imageNotebookPromptPlan?.compiledImagePrompt) ||
    args.outlines.every((outline) => !outline.imageNotebookBrief)
  ) {
    return args.outlines;
  }

  return args.outlines.map((outline) => {
    if (outline.imageNotebookPromptPlan?.compiledImagePrompt || !outline.imageNotebookBrief) {
      return outline;
    }
    return attachImageNotebookPromptPlan(outline, {
      outline,
      allOutlines: args.outlines,
      notebookTitle: args.stage.name,
      notebookGoal: args.stage.description,
      language: outline.language || args.language,
      stylePrompt: args.stage.style || args.stage.description,
      styleBrief: args.stage.imageNotebookStyle,
    });
  });
}

async function generateImageNotebookBriefPlan(args: {
  stage: Stage;
  outlines: SceneOutline[];
  language: 'zh-CN' | 'en-US';
  courseContext?: CoursePersonalizationContext;
  sourceSummary?: string;
  researchContext?: string;
  signal?: AbortSignal;
  getHeaders?: () => HeadersInit;
}): Promise<ImageNotebookBriefPlan> {
  const response = await backendFetch('/api/generate/image-notebook-briefs', {
    method: 'POST',
    headers: (args.getHeaders ?? (() => getApiHeaders()))(),
    body: JSON.stringify({
      stage: {
        id: args.stage.id,
        name: args.stage.name,
        description: args.stage.description,
        language: args.language,
        courseId: args.stage.courseId,
        courseName: args.courseContext?.name,
      },
      outlines: args.outlines,
      courseContext: args.courseContext,
      language: args.language,
      sourceSummary: args.sourceSummary,
      researchContext: args.researchContext,
    }),
    signal: args.signal,
  });
  if (!response.ok) {
    const message = await readApiErrorMessage(response, '图片 notebook 页面教学 brief 生成失败');
    throw new Error(message || '图片 notebook 页面教学 brief 生成失败');
  }
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    plan?: ImageNotebookBriefPlan;
    error?: string;
  };
  if (!data.success || !data.plan) {
    throw new Error(data.error || '图片 notebook 页面教学 brief 生成失败：响应为空');
  }
  return data.plan;
}

async function readImageNotebookPlanStream(
  response: Response,
  onEvent: (event: ImageNotebookPlanStreamEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取图片笔记本页面规划流');
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;
    if (!trimmed.startsWith('data: ')) return;
    const event = JSON.parse(trimmed.slice(6)) as ImageNotebookPlanStreamEvent;
    onEvent(event);
    if (event.type === 'error') {
      throw new Error(event.error || '图片笔记本整本页面规划生成失败');
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) consumeLine(line);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

function mergeStreamedImagePlanOutlines(
  current: SceneOutline[],
  incoming?: SceneOutline[],
): SceneOutline[] {
  if (!incoming?.length) return current;
  const next = [...current];
  for (const outline of incoming) {
    const index = Math.max(0, (outline.order || next.length + 1) - 1);
    next[index] = outline;
  }
  return next.filter(Boolean);
}

async function generateImageNotebookFullPlan(args: {
  requirement: string;
  language: 'zh-CN' | 'en-US';
  stage: Stage;
  courseContext?: CoursePersonalizationContext;
  coursePurpose?: 'research' | 'university' | 'daily';
  researchContext?: string;
  signal?: AbortSignal;
  pdfText?: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  imageNotebookStyle?: ImageNotebookStyleBrief;
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
  getHeaders?: () => HeadersInit;
  onProgress?: (progress: NotebookGenerationProgress) => void;
}): Promise<{ outlines: SceneOutline[]; plan: ImageNotebookBriefPlan }> {
  const basePayload = {
    requirements: {
      requirement: args.requirement,
      language: args.language,
    },
    pdfText: args.pdfText,
    researchContext: args.researchContext,
    coursePurpose: args.coursePurpose,
    courseContext: args.courseContext,
    outlinePreferences: args.outlinePreferences ?? null,
    style: {
      label: args.stage.style,
      prompt: args.stage.description,
    },
    imageNotebookStyle: args.imageNotebookStyle,
    notebookContext: {
      id: args.stage.id,
      name: args.stage.name,
      courseId: args.stage.courseId,
      courseName: args.courseContext?.name,
    },
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: args.pdfImages,
    imageMapping: args.imageMapping,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });
  const requestPayload = {
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
    ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
  };
  const abortController = createLinkedAbortController(args.signal);
  const timeoutId = window.setTimeout(() => abortController.abort(), 420_000);
  const headers = new Headers((args.getHeaders ?? (() => getApiHeaders()))());
  headers.set('Accept', 'text/event-stream');
  const response = await backendFetch('/api/generate/image-notebook-plan-stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestPayload),
    signal: abortController.signal,
  }).finally(() => window.clearTimeout(timeoutId));
  if (!response.ok) {
    const message = await readApiErrorMessage(response, '图片笔记本整本页面规划生成失败');
    throw new Error(message || '图片笔记本整本页面规划生成失败');
  }

  let streamedOutlines: SceneOutline[] = [];
  let finalOutlines: SceneOutline[] = [];
  let finalPlan: ImageNotebookBriefPlan | undefined;
  let finalQuality: ImageNotebookPlanQualityReport | undefined;

  await readImageNotebookPlanStream(response, (event) => {
    if (abortController.signal.aborted) return;

    if (event.type === 'status') {
      args.onProgress?.({ stage: 'outline', detail: event.detail, completed: 0 });
      return;
    }

    if (event.type === 'draft') {
      if (event.detail) {
        args.onProgress?.({
          stage: 'outline',
          detail: event.detail,
          completed: streamedOutlines.length,
        });
      }
      return;
    }

    if (event.type === 'blueprint') {
      finalQuality = event.quality || finalQuality;
      const pageCount = event.pageIndex?.length || 0;
      args.onProgress?.({
        stage: 'outline',
        detail:
          pageCount > 0
            ? `页面规划完成：${pageCount} 页，正在按每批 4 页并行生成画图 prompt…`
            : '页面规划已生成，正在按每批 4 页并行生成画图 prompt…',
        completed: 0,
      });
      return;
    }

    if (event.type === 'batch-start') {
      const label =
        event.startPage && event.endPage
          ? `第 ${event.startPage}-${event.endPage} 页`
          : `第 ${(event.batchIndex ?? 0) + 1} 批`;
      args.onProgress?.({
        stage: 'outline',
        detail:
          event.attempt && event.attempt > 0
            ? `正在按反馈重试${label}画图 prompt…`
            : `正在生成${label}画图 prompt…`,
        completed: streamedOutlines.length,
      });
      return;
    }

    if (event.type === 'pages') {
      streamedOutlines = mergeStreamedImagePlanOutlines(streamedOutlines, event.outlines);
      const label =
        event.startPage && event.endPage ? `第 ${event.startPage}-${event.endPage} 页` : '一批页面';
      args.onProgress?.({
        stage: 'outline',
        detail: `${label}画图 prompt 完成`,
        completed: streamedOutlines.length,
      });
      return;
    }

    if (event.type === 'quality') {
      finalQuality = event.quality || finalQuality;
      args.onProgress?.({
        stage: 'outline',
        detail: event.quality?.passed ? '整本页面规划质量门通过' : '整本页面规划质量门需要检查',
        completed: streamedOutlines.length,
      });
      return;
    }

    if (event.type === 'done') {
      finalOutlines = event.outlines?.length ? event.outlines : streamedOutlines;
      finalPlan = event.plan;
      finalQuality = event.planQuality || finalQuality;
      args.onProgress?.({
        stage: 'outline',
        detail: `页面规划和画图 prompt 完成：${finalOutlines.length} 页，准备按最多 ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} 页并行生成图片…`,
        completed: finalOutlines.length,
      });
    }
  });

  const resolvedOutlines = finalOutlines.length ? finalOutlines : streamedOutlines;
  if (!resolvedOutlines.length || !finalPlan) {
    throw new Error('图片笔记本整本页面规划生成失败：响应为空');
  }
  if (finalQuality && !finalQuality.passed) {
    const findings = finalQuality.findings?.join('；') || '质量门未通过';
    throw new Error(`图片笔记本整本页面规划未通过质量检查：${findings}`);
  }
  return {
    outlines: applyOutlineLanguage(resolvedOutlines, args.language),
    plan: finalPlan,
  };
}

async function generateNotebookPageContentBundle(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  agents: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  slideGenerationRoute?: SlideGenerationRoute | null;
  getHeaders?: () => HeadersInit;
}): Promise<GeneratedSceneContentBundle> {
  const response = await backendFetch('/api/generate/notebook-page-content', {
    method: 'POST',
    headers: (args.getHeaders ?? (() => getApiHeaders()))(),
    body: JSON.stringify({
      outline: args.outline,
      allOutlines: args.allOutlines,
      stage: args.stage,
      agents: args.agents,
      courseContext: args.courseContext,
      pdfImages: args.pdfImages,
      imageMapping: args.imageMapping,
      slideGenerationRoute: args.slideGenerationRoute,
      includeActions: false,
    }),
    signal: args.signal,
  });
  if (!response.ok) {
    const message = await readApiErrorMessage(response, '页面内容生成失败');
    throw new Error(message || '页面内容生成失败');
  }
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    contentBundle?: GeneratedSceneContentBundle;
    error?: string;
  };
  if (!data.success || !data.contentBundle) {
    throw new Error(data.error || '页面内容生成失败：响应为空');
  }
  return data.contentBundle;
}

function buildFinalImageNotebookPublicMemoryText(args: {
  stage: Stage;
  outlines: SceneOutline[];
  scenes: Scene[];
  language: 'zh-CN' | 'en-US';
}): string {
  const teachingOutlines = getTeachingOutlinesForPublicMemory(args.outlines);
  const spine = teachingOutlines.find(
    (outline) => outline.imageNotebookCourseSpine,
  )?.imageNotebookCourseSpine;
  const sceneByOrder = new Map(args.scenes.map((scene) => [scene.order, scene]));
  const sceneByTitle = new Map(args.scenes.map((scene) => [scene.title, scene]));
  const pageRows = teachingOutlines.slice(0, 24).map((outline, index) => {
    const brief = outline.imageNotebookBrief;
    const pageNumber = outline.order > 0 ? outline.order : index + 1;
    const scene = sceneByOrder.get(outline.order) || sceneByTitle.get(outline.title);
    const speechCount = scene?.actions?.filter((action) => action.type === 'speech').length || 0;
    const focusCount =
      scene?.actions?.filter((action) => action.type === 'spotlight' || action.type === 'laser')
        .length || 0;
    return `| ${pageNumber} | ${compactPublicMemoryLine(outline.title, 42)} | ${compactPublicMemoryLine(brief?.pageRole || outline.archetype || 'page', 18)} | ${compactPublicMemoryLine(brief?.pageMove.currentJob || outline.teachingObjective || outline.description, 90)} | ${speechCount}/${focusCount} |`;
  });
  const examples = uniquePublicMemoryLines(
    teachingOutlines.flatMap((outline) => [
      outline.imageNotebookBrief?.visibleContent.exampleSteps.join(' -> '),
      outline.workedExampleConfig?.problemStatement,
      ...(outline.workedExampleConfig?.walkthroughSteps || []),
    ]),
    10,
  );
  const pitfalls = uniquePublicMemoryLines(
    teachingOutlines.flatMap((outline) => [
      ...(outline.imageNotebookBrief?.visibleContent.commonPitfalls || []),
      ...(outline.workedExampleConfig?.commonPitfalls || []),
    ]),
    10,
  );
  const sections = [
    '## 最终图片笔记本主线',
    `- ${compactPublicMemoryLine(spine?.logline || args.stage.description || args.stage.name, 260)}`,
    `- 主问题：${compactPublicMemoryLine(spine?.centralQuestion || args.stage.name, 220)}`,
    `- 收束：${compactPublicMemoryLine(spine?.closingCallback || '回到本节主线，整理可执行检查表。', 220)}`,
    '',
    '## 页面索引',
    '| 页码 | 页面 | 角色 | 教学动作 | speech/focus |',
    '| --- | --- | --- | --- | --- |',
    ...pageRows,
  ];
  if (examples.length > 0) {
    sections.push('', '## 核心例题/证明动作', ...examples.map((line) => `- ${line}`));
  }
  if (pitfalls.length > 0) {
    sections.push('', '## 易错点', ...pitfalls.map((line) => `- ${line}`));
  }
  return sections.join('\n').slice(0, 12000);
}

function persistFinalImageNotebookPublicMemory(args: {
  stage: Stage;
  outlines: SceneOutline[];
  scenes: Scene[];
  language: 'zh-CN' | 'en-US';
}): void {
  const title = '最终图片笔记本教学主线';
  const text = buildFinalImageNotebookPublicMemoryText(args);
  const reason = '整本图片 notebook 页面、遮罩和讲解稿通过生成流程后自动写入。';
  const sourceReferences = buildNotebookPublicMemorySourceReferences(args);
  try {
    recordNotebookPublicMemory({
      stageId: args.stage.id,
      title,
      text,
      reason,
      kind: 'manual',
      source: 'notebook_generation',
      sourceReferences,
    });
  } catch (memoryError) {
    console.warn('[NotebookGeneration] Failed to persist final image notebook memory', {
      stageId: args.stage.id,
      error: errorMessage(memoryError, '最终公共记忆写入失败'),
    });
  }
  void persistNotebookPublicMemoryToDatabase({
    stageId: args.stage.id,
    title,
    text,
    reason,
    sourceReferences,
  });
}

async function maybeGenerateAgents(args: {
  stage: Stage;
  language: 'zh-CN' | 'en-US';
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  getHeaders?: () => HeadersInit;
}): Promise<AgentInfo[]> {
  const settings = useSettingsStore.getState();
  if (settings.agentMode !== 'auto') {
    return getPresetAgents();
  }

  const allAvatars = [
    '/avatars/assist.png',
    '/avatars/assist-2.png',
    '/avatars/clown.png',
    '/avatars/clown-2.png',
    '/avatars/curious.png',
    '/avatars/curious-2.png',
    '/avatars/note-taker.png',
    '/avatars/note-taker-2.png',
    '/avatars/teacher.png',
    '/avatars/teacher-2.png',
    '/avatars/thinker.png',
    '/avatars/thinker-2.png',
  ];

  const resp = await backendFetch('/api/generate/agent-profiles', {
    method: 'POST',
    headers: (args.getHeaders ?? (() => getApiHeaders()))(),
    body: JSON.stringify({
      stageInfo: { name: args.stage.name, description: args.stage.description },
      language: args.language,
      availableAvatars: allAvatars,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!resp.ok) {
    return getPresetAgents();
  }

  const data = await resp.json();
  if (!data?.success || !Array.isArray(data.agents) || data.agents.length === 0) {
    return getPresetAgents();
  }

  persistGeneratedAgentsForStage(args.stage.id, data.agents);
  return data.agents.map((agent: AgentInfo) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    persona: agent.persona,
  }));
}

async function generateOutlines(args: {
  requirement: string;
  language: 'zh-CN' | 'en-US';
  researchContext?: string;
  agents: AgentInfo[];
  notebookContext?: {
    id: string;
    name: string;
    courseId?: string;
    courseName?: string;
  };
  coursePurpose?: 'research' | 'university' | 'daily';
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  onOutline?: (count: number) => void;
  pdfText?: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
  getHeaders?: () => HeadersInit;
}): Promise<SceneOutline[]> {
  const basePayload = {
    requirements: {
      requirement: args.requirement,
      language: args.language,
    },
    pdfText: args.pdfText,
    researchContext: args.researchContext,
    agents: args.agents,
    coursePurpose: args.coursePurpose,
    courseContext: args.courseContext,
    outlinePreferences: args.outlinePreferences ?? null,
    notebookContext: args.notebookContext,
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: args.pdfImages,
    imageMapping: args.imageMapping,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  if (
    budgetedMedia.omittedVisionImageIds.length > 0 ||
    budgetedMedia.omittedPdfImageIds.length > 0
  ) {
    console.warn('[NotebookGeneration] Trimmed outline payload media to stay under request limit', {
      requestBytes: budgetedMedia.requestBytes,
      omittedVisionImageIds: budgetedMedia.omittedVisionImageIds,
      omittedPdfImageIds: budgetedMedia.omittedPdfImageIds,
    });
  }

  const headers = (args.getHeaders ?? (() => getApiHeaders()))();
  const sendOutlineRequest = (payload: Record<string, unknown>) =>
    backendFetch('/api/generate/notebook-outlines', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: args.signal,
    });

  const primaryPayload = {
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
    ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
  };
  const fallbackPayload = {
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
  };

  let response = await sendOutlineRequest(primaryPayload);
  if (response.status === 413 && budgetedMedia.imageMapping) {
    console.warn(
      '[NotebookGeneration] Outline payload still too large, retrying without vision images',
    );
    response = await sendOutlineRequest(fallbackPayload);
  }

  if (!response.ok) {
    const fallback =
      response.status === 413
        ? buildPayloadTooLargeMessage(args.language, 'outline')
        : args.language === 'en-US'
          ? 'Page planning failed'
          : '页面规划生成失败';
    const message = await readApiErrorMessage(response, fallback);
    throw new Error(message || fallback);
  }

  const data = (await response.json().catch(() => ({}))) as NotebookOutlinesApiResponse;
  if (!data.success || !data.outlines?.length) {
    throw new Error(
      data.error || (args.language === 'en-US' ? 'No page plan generated' : '没有生成可用页面规划'),
    );
  }
  args.onOutline?.(data.outlines.length);
  return applyOutlineLanguage(data.outlines, args.language);
}

async function repairOutlinesIfNeeded(args: {
  outlines: SceneOutline[];
  originalRequirement: string;
  language: 'zh-CN' | 'en-US';
  researchContext?: string;
  agents: AgentInfo[];
  notebookContext?: {
    id: string;
    name: string;
    courseId?: string;
    courseName?: string;
  };
  coursePurpose?: 'research' | 'university' | 'daily';
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  onProgress?: (progress: NotebookGenerationProgress) => void;
  pdfText?: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
  effectiveMediaFlags: EffectiveMediaFlags;
  getHeaders?: () => HeadersInit;
}): Promise<SceneOutline[]> {
  if (!args.outlinePreferences) {
    return normalizeOutlineCollection(
      applyOutlineLanguage(
        applyOutlinePreferenceHardConstraints(args.outlines, {
          coursePurpose: args.coursePurpose,
          outlinePreferences: args.outlinePreferences,
        }),
        args.language,
      ),
    ).map(normalizeComputerScienceSceneOutline);
  }

  let currentOutlines = normalizeOutlineCollection(
    applyOutlineLanguage(
      applyOutlinePreferenceHardConstraints(args.outlines, {
        coursePurpose: args.coursePurpose,
        outlinePreferences: args.outlinePreferences,
      }),
      args.language,
    ),
  ).map(normalizeComputerScienceSceneOutline);
  const maxRepairPasses = 2;

  for (let pass = 1; pass <= maxRepairPasses; pass += 1) {
    const coverage = analyzeOutlineCoverage({
      outlines: currentOutlines,
      outlinePreferences: args.outlinePreferences,
    });

    if (
      !coverage ||
      (coverage.missingSceneCount === 0 && coverage.missingWorkedExampleSequences === 0)
    ) {
      return currentOutlines;
    }

    args.onProgress?.({
      stage: 'outline',
      detail:
        args.language === 'zh-CN'
          ? `正在补充页面规划：还差 ${coverage.missingSceneCount} 页，缺少 ${coverage.missingWorkedExampleSequences} 组完整例题…`
          : `Repairing page plan: ${coverage.missingSceneCount} more scenes and ${coverage.missingWorkedExampleSequences} more worked-example sequences needed…`,
    });

    const repairRequirement = buildOutlineRepairRequirement({
      language: args.language,
      originalRequirement: args.originalRequirement,
      currentOutlines,
      coverage,
      passNumber: pass,
    });

    const supplementalRawOutlines = await generateOutlines({
      requirement: repairRequirement,
      language: args.language,
      researchContext: args.researchContext,
      agents: args.agents,
      notebookContext: args.notebookContext,
      coursePurpose: args.coursePurpose,
      courseContext: args.courseContext,
      signal: args.signal,
      onOutline: (count) => {
        args.onProgress?.({
          stage: 'outline',
          detail:
            args.language === 'zh-CN'
              ? `正在补充缺失页面（已新增 ${count} 个规划节点）…`
              : `Generating supplemental page-plan nodes (${count} added so far)…`,
          completed: currentOutlines.length + count,
        });
      },
      pdfText: args.pdfText,
      pdfImages: args.pdfImages,
      imageMapping: args.imageMapping,
      outlinePreferences: null,
      getHeaders: args.getHeaders,
    });

    const supplementalOutlines = applyOutlinePreferenceHardConstraints(
      filterOutlineMediaGenerations(supplementalRawOutlines, args.effectiveMediaFlags),
      {
        coursePurpose: args.coursePurpose,
        outlinePreferences: args.outlinePreferences,
      },
    );
    const mergedOutlines = mergeSupplementalOutlines(
      currentOutlines,
      applyOutlineLanguage(supplementalOutlines, args.language),
    ).map(normalizeComputerScienceSceneOutline);

    if (mergedOutlines.length === currentOutlines.length) {
      return currentOutlines;
    }

    currentOutlines = mergedOutlines;
  }

  return currentOutlines;
}

export async function runNotebookGenerationTask(
  input: NotebookGenerationTaskInput,
): Promise<NotebookGenerationTaskResult> {
  let requirement = input.requirement.trim();
  const sourceFile = input.sourceFile ?? input.pdfFile ?? null;
  if (!requirement && !sourceFile) throw new Error('缺少笔记本创建需求或上传文档');
  if (!requirement && sourceFile) {
    requirement = isMarkdownSourceFile(sourceFile)
      ? '请根据上传的 Markdown 文档创建笔记本。'
      : '请根据上传的 PDF 创建笔记本。';
  }

  const language = input.language || 'zh-CN';
  const webSearch = input.webSearch ?? true;
  const generateSlides = input.generateSlides ?? true;
  const slideGenerationRoute = normalizeNotebookSlideGenerationRoute(
    input.slideGenerationRoute ?? DEFAULT_NOTEBOOK_SLIDE_GENERATION_ROUTE,
  );
  const settings = useSettingsStore.getState();
  const effectiveMediaFlags: EffectiveMediaFlags = {
    imageEnabled:
      input.imageGenerationEnabledOverride !== undefined
        ? input.imageGenerationEnabledOverride
        : (settings.imageGenerationEnabled ?? false),
    videoEnabled: settings.videoGenerationEnabled ?? false,
  };
  const notebookGenerationSessionId = nanoid(12);
  const getHeaders = () =>
    getApiHeaders({
      imageGenerationEnabled:
        input.imageGenerationEnabledOverride !== undefined
          ? input.imageGenerationEnabledOverride
          : undefined,
      modelIdOverride: input.modelIdOverride,
      notebookStageModelOverrides: input.notebookStageModelOverrides ?? undefined,
      notebookModelMode: input.notebookModelMode ?? 'recommended',
      notebookGenerationSessionId,
      notebookGenerationTaskId: input.generationTaskId,
      testNoCharge: NOTEBOOK_GENERATION_TEST_NO_CHARGE,
    });
  input.onProgress?.({ stage: 'preparing', detail: '正在初始化创建任务…' });

  try {
    await ensureLegacyCourseBucket();
    const resolvedCourseId = input.courseId?.trim() || LEGACY_COURSE_ID;
    const currentCourse = await getCourse(resolvedCourseId);
    const courseContext: CoursePersonalizationContext | undefined = currentCourse
      ? {
          name: currentCourse.name,
          description: currentCourse.description,
          tags: currentCourse.tags,
          purpose: currentCourse.purpose,
          university: currentCourse.university,
          courseCode: currentCourse.courseCode,
          language: currentCourse.language,
        }
      : undefined;

    let pdfText: string | undefined;
    let pdfImages: PdfImage[] | undefined;
    let imageMapping: ImageMapping | undefined;

    if (sourceFile) {
      if (isPdfSourceFile(sourceFile)) {
        input.onProgress?.({ stage: 'pdf-analysis', detail: '正在解析 PDF（与创建页相同流程）…' });
        const parsed = await parsePdfLikeGenerationPreview({
          pdfFile: sourceFile,
          signal: input.signal,
          language,
          sourcePageSelection: input.sourcePageSelection,
          imageLimit: input.sourceImageIds !== undefined ? null : undefined,
          includeVisualRegionImages: true,
        });
        pdfText = parsed.pdfText;
        pdfImages = parsed.pdfImages;
        imageMapping = parsed.imageMapping;
        input.onProgress?.({
          stage: 'pdf-analysis',
          detail:
            parsed.truncationWarnings.length > 0
              ? `PDF 已解析。${parsed.truncationWarnings.join(' ')}`
              : 'PDF 已解析，已提取文本与配图信息。',
        });
      } else if (isPptxSourceFile(sourceFile)) {
        input.onProgress?.({ stage: 'pdf-analysis', detail: '正在解析 PPTX 文档…' });
        const parsed = await parsePptxLikeGenerationPreview({
          pptxFile: sourceFile,
          signal: input.signal,
        });
        pdfText = parsed.pdfText;
        pdfImages = parsed.pdfImages;
        imageMapping = parsed.imageMapping;
        input.onProgress?.({
          stage: 'pdf-analysis',
          detail:
            parsed.truncationWarnings.length > 0
              ? `PPTX 已解析。${parsed.truncationWarnings.join(' ')}`
              : 'PPTX 已解析，已提取每页文字、备注与图片。',
        });
      } else if (isMarkdownSourceFile(sourceFile)) {
        input.onProgress?.({ stage: 'pdf-analysis', detail: '正在读取 Markdown 文档…' });
        const parsed = await parseMarkdownLikeGenerationInput({ file: sourceFile });
        pdfText = parsed.pdfText;
        input.onProgress?.({
          stage: 'pdf-analysis',
          detail:
            parsed.truncationWarnings.length > 0
              ? `Markdown 已读取。${parsed.truncationWarnings.join(' ')}`
              : 'Markdown 已读取，已提取正文内容。',
        });
      } else {
        throw new Error('目前只支持 PDF、PPTX 或 Markdown（.md）文件用于创建笔记本。');
      }
    }

    if (sourceFile && input.sourceImageIds !== undefined) {
      const filteredSourceImages = filterSourceImagesBySelection({
        pdfImages,
        imageMapping,
        selectedImageIds: input.sourceImageIds,
      });
      pdfImages = filteredSourceImages.pdfImages;
      imageMapping = filteredSourceImages.imageMapping;
      input.onProgress?.({
        stage: 'pdf-analysis',
        detail:
          input.sourceImageIds.length > 0
            ? `已按输入设置保留 ${input.sourceImageIds.length} 张源图片。`
            : '已按输入设置移除源图片。',
      });
    }

    let researchContext: string | undefined;
    let researchSources: WebSearchSource[] = [];
    if (webSearch) {
      input.onProgress?.({ stage: 'research', detail: '正在补充联网研究资料…' });
      const research = await maybeRunWebSearch({
        requirement,
        enabled: webSearch,
        signal: input.signal,
        tracking: {
          notebookGenerationSessionId,
          notebookGenerationTaskId: input.generationTaskId,
          testNoCharge: NOTEBOOK_GENERATION_TEST_NO_CHARGE,
        },
        usageContext: {
          courseId: currentCourse?.id,
          courseName: currentCourse?.name,
          operationCode: 'notebook_research',
          chargeReason: '为新笔记本补充联网资料',
        },
      });
      researchContext = research.context;
      researchSources = research.sources;
      input.onProgress?.({
        stage: 'research',
        detail:
          research.sources.length > 0
            ? `已整理 ${research.sources.length} 条外部资料`
            : '未找到可用外部资料，继续本地生成',
        sources: research.sources,
      });
    }

    input.onProgress?.({ stage: 'metadata', detail: '正在生成笔记本标题与简介…' });
    const notebookMeta = await generateNotebookMetadata({
      requirement,
      language,
      webSearch,
      courseContext,
      signal: input.signal,
      pdfText,
      getHeaders,
    });

    const stageId = nanoid(10);
    let stage: Stage = {
      id: stageId,
      courseId: resolvedCourseId,
      avatarUrl: pickStableNotebookAgentAvatarUrl(stageId),
      name: notebookMeta.name,
      description: notebookMeta.description,
      tags: notebookMeta.tags,
      language,
      style: 'professional',
      imageNotebookStyle: input.imageNotebookStyle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveStageData(stage.id, {
      stage,
      scenes: [],
      currentSceneId: null,
      chats: [],
    });
    input.onProgress?.({
      stage: 'notebook-ready',
      detail: generateSlides
        ? `已进入教室「${stage.name}」，正在准备讲解角色与页面内容…`
        : `已创建笔记本「${stage.name}」，正在保存到仓库…`,
      notebookId: stage.id,
    });

    if (!generateSlides) {
      writePersistedStageOutlines(stage.id, []);
      input.onProgress?.({ stage: 'saving', detail: '正在保存笔记本到仓库…' });
      input.onProgress?.({
        stage: 'completed',
        detail: `已加入仓库：${stage.name}（未生成图片 notebook）`,
        notebookId: stage.id,
        notebookName: stage.name,
      });
      return {
        stage,
        scenes: [],
        outlines: [],
        agents: [],
        researchSources,
      };
    }

    input.onProgress?.({ stage: 'agents', detail: '正在准备讲解角色…' });
    const agents = await maybeGenerateAgents({
      stage,
      language,
      courseContext,
      signal: input.signal,
      getHeaders,
    });

    let outlines: SceneOutline[] = [];
    if (slideGenerationRoute === 'image-ppt') {
      const confirmedImageNotebookOutlines = input.confirmedImageNotebookOutlines?.length
        ? input.confirmedImageNotebookOutlines
        : [];
      if (confirmedImageNotebookOutlines.length) {
        const confirmedOutlines = filterOutlineMediaGenerations(
          applyOutlineLanguage(confirmedImageNotebookOutlines, language),
          effectiveMediaFlags,
        );
        outlines = input.confirmedImageNotebookPlan
          ? attachImageNotebookBriefPlan(confirmedOutlines, input.confirmedImageNotebookPlan)
          : confirmedOutlines;
        input.onProgress?.({
          stage: 'image-prep',
          detail:
            language === 'zh-CN'
              ? input.confirmedImageNotebookPlan
                ? `使用已确认的 ${outlines.length} 页页面规划，直接进入最多 ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} 页并行图片生成…`
                : `使用已确认的 ${outlines.length} 页页面顺序，补齐图片 brief 后进入最多 ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} 页并行生成…`
              : `Using ${outlines.length} confirmed planned pages; starting image generation with up to ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} pages in parallel…`,
          completed: outlines.length,
          total: outlines.length,
        });
      }
    }

    if (slideGenerationRoute === 'image-ppt' && outlines.length === 0) {
      input.onProgress?.({
        stage: 'outline',
        detail:
          language === 'zh-CN'
            ? '正在用整本页面规划生成图片 notebook 主线、逐页内容、遮罩区域…'
            : 'Generating the full image notebook page plan…',
        completed: 0,
      });
      try {
        const fullPlan = await generateImageNotebookFullPlan({
          requirement,
          language,
          stage,
          courseContext,
          coursePurpose: currentCourse?.purpose,
          researchContext,
          signal: input.signal,
          pdfText,
          pdfImages,
          imageMapping,
          imageNotebookStyle: input.imageNotebookStyle,
          outlinePreferences: input.outlinePreferences ?? null,
          getHeaders,
          onProgress: input.onProgress,
        });
        outlines = attachImageNotebookBriefPlan(
          filterOutlineMediaGenerations(fullPlan.outlines, effectiveMediaFlags),
          fullPlan.plan,
        );
        input.onProgress?.({
          stage: 'image-prep',
          detail:
            language === 'zh-CN'
              ? `已生成 ${outlines.length} 页整本页面规划，准备按最多 ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} 页并行生图…`
              : `Generated ${outlines.length} planned image notebook pages; preparing up to ${MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES} pages in parallel…`,
          completed: outlines.length,
          total: outlines.length,
        });
      } catch (plannerError) {
        console.warn('[NotebookGeneration] Full image notebook planner failed; falling back', {
          stageId: stage.id,
          error: errorMessage(plannerError, '整本页面规划失败'),
        });
        input.onProgress?.({
          stage: 'outline',
          detail:
            language === 'zh-CN'
              ? '整本页面规划未通过，回退到分步页面规划 + 页面 brief 链路…'
              : 'Full page planner failed; falling back to staged page planning + brief generation…',
          completed: 0,
        });
      }
    }

    if (outlines.length === 0) {
      input.onProgress?.({ stage: 'outline', detail: '正在生成页面规划…', completed: 0 });
      const rawOutlines = await generateOutlines({
        requirement,
        language,
        researchContext,
        agents,
        notebookContext: {
          id: stage.id,
          name: stage.name,
          courseId: stage.courseId,
          courseName: currentCourse?.name,
        },
        coursePurpose: currentCourse?.purpose,
        courseContext,
        signal: input.signal,
        onOutline: (count) => {
          input.onProgress?.({
            stage: 'outline',
            detail: count > 0 ? `已生成 ${count} 个页面规划节点…` : '正在重新整理课程结构…',
            completed: count,
          });
        },
        pdfText,
        pdfImages,
        imageMapping,
        outlinePreferences: input.outlinePreferences ?? null,
        getHeaders,
      });

      const filteredOutlines = applyOutlinePreferenceHardConstraints(
        filterOutlineMediaGenerations(rawOutlines, effectiveMediaFlags),
        {
          coursePurpose: currentCourse?.purpose,
          outlinePreferences: input.outlinePreferences ?? null,
        },
      );

      input.onProgress?.({
        stage: 'outline',
        detail:
          language === 'zh-CN'
            ? '正在检查页面规划页数与例题覆盖，并按需补充缺失页面…'
            : 'Validating page-plan length and worked-example coverage before scene generation…',
        completed: filteredOutlines.length,
      });

      outlines = await repairOutlinesIfNeeded({
        outlines: filteredOutlines,
        originalRequirement: requirement,
        language,
        researchContext,
        agents,
        notebookContext: {
          id: stage.id,
          name: stage.name,
          courseId: stage.courseId,
          courseName: currentCourse?.name,
        },
        coursePurpose: currentCourse?.purpose,
        courseContext,
        signal: input.signal,
        onProgress: input.onProgress,
        pdfText,
        pdfImages,
        imageMapping,
        outlinePreferences: input.outlinePreferences ?? null,
        effectiveMediaFlags,
        getHeaders,
      });
    }

    outlines = normalizeOutlineStructure(
      ensureTitleCoverOutline(outlines, {
        title: stage.name,
        language,
        insertMissing: slideGenerationRoute === 'image-ppt' ? false : undefined,
      }),
    ).map(normalizeComputerScienceSceneOutline);

    if (!outlines.length) throw new Error('未生成任何页面规划');
    if (slideGenerationRoute === 'image-ppt') {
      const missingBriefs = outlines.some((outline) => !outline.imageNotebookBrief);
      if (missingBriefs) {
        input.onProgress?.({
          stage: 'image-prep',
          detail:
            language === 'zh-CN'
              ? '正在补齐图片 notebook 页面 brief（主线、每页视觉计划、遮罩区域）…'
              : 'Completing teacher briefs for image-first notebook pages…',
          completed: outlines.length,
          total: outlines.length,
        });
        const briefPlan = await generateImageNotebookBriefPlan({
          stage,
          outlines,
          language,
          courseContext,
          sourceSummary: [requirement, pdfText].filter(Boolean).join('\n\n').slice(0, 12000),
          researchContext,
          signal: input.signal,
          getHeaders,
        });
        outlines = attachImageNotebookBriefPlan(outlines, briefPlan).map(
          normalizeComputerScienceSceneOutline,
        );
      }
      outlines = ensureImageNotebookPromptPlans({ outlines, stage, language }).map(
        normalizeComputerScienceSceneOutline,
      );
    }
    writePersistedStageOutlines(stage.id, outlines);
    persistNotebookPublicMemory({ stage, outlines, language });

    const scenes: Scene[] = [];
    const failedScenes: PageGenerationFailureRecord[] = [];
    let previousSpeeches: string[] = [];
    const userProfile =
      input.userNickname || input.userBio
        ? `Student: ${input.userNickname || 'Unknown'}${input.userBio ? ` — ${input.userBio}` : ''}`
        : undefined;

    const maxParallelSceneContent =
      slideGenerationRoute === 'image-ppt'
        ? MAX_PARALLEL_IMAGE_NOTEBOOK_PAGES
        : MAX_PARALLEL_STANDARD_SCENE_CONTENT;
    const sceneContentQueue = new ParallelTaskQueue<SceneOutline, SceneContentJobResult>({
      items: outlines,
      concurrency: maxParallelSceneContent,
      parentSignal: input.signal,
      getKey: (outline) => outline.id,
      run: ({ item: outline, signal }) => {
        const allOutlinesSnapshot = outlines;
        return generateNotebookPageContentBundle({
          outline,
          allOutlines: allOutlinesSnapshot,
          stage,
          agents,
          courseContext,
          signal,
          pdfImages,
          imageMapping,
          slideGenerationRoute,
          getHeaders,
        })
          .then((bundle): SceneContentJobResult => ({ success: true, bundle }))
          .catch(
            (error): SceneContentJobResult => ({
              success: false,
              error: errorMessage(error, '页面内容生成失败'),
            }),
          );
      },
    });

    const resetSceneContentQueue = (nextIndex: number) => {
      sceneContentQueue.reset(nextIndex, outlines);
    };

    for (let i = 0; i < outlines.length; i += 1) {
      const outline = outlines[i];
      const activeImageGenerationEnd = Math.min(outlines.length, i + maxParallelSceneContent);
      input.onProgress?.({
        stage: 'scene',
        detail:
          language === 'zh-CN'
            ? slideGenerationRoute === 'image-ppt'
              ? `正在生成第 ${i + 1}-${activeImageGenerationEnd}/${outlines.length} 页图片（最多 ${maxParallelSceneContent} 页同时生图，按页序保存第 ${i + 1} 页）`
              : `正在生成第 ${i + 1}/${outlines.length} 页：${outline.title}（并行准备后续页面内容）`
            : slideGenerationRoute === 'image-ppt'
              ? `Generating image pages ${i + 1}-${activeImageGenerationEnd}/${outlines.length} (up to ${maxParallelSceneContent} in parallel, saving page ${i + 1} in order)`
              : `Generating page ${i + 1}/${outlines.length}: ${outline.title} (preparing later page content in parallel)`,
        completed: i,
        total: outlines.length,
      });
      try {
        sceneContentQueue.fill();
        const contentQueueResult = await sceneContentQueue.take(i);
        const contentResult = contentQueueResult.result;

        if (contentQueueResult.stale) {
          i -= 1;
          continue;
        }
        if (!contentResult.success) {
          throw new Error(contentResult.error);
        }

        const contentGeneratedPageThumbnails = generatedPageThumbnailsFromContentBundle(
          contentResult.bundle,
          i + 1,
        );
        if (contentGeneratedPageThumbnails.length > 0) {
          input.onProgress?.({
            stage: 'scene',
            detail:
              language === 'zh-CN'
                ? `已生成第 ${i + 1}/${outlines.length} 页图片，正在准备讲解动作…`
                : `Generated image page ${i + 1}/${outlines.length}; preparing narration actions...`,
            completed: Math.min(outlines.length, i + 1),
            total: outlines.length,
            generatedPageThumbnails: contentGeneratedPageThumbnails,
          });
        }

        const result = await generateSceneActionsFromContent({
          bundle: contentResult.bundle,
          outline,
          stage,
          agents,
          previousSpeeches,
          userProfile,
          courseContext,
          signal: input.signal,
          getHeaders,
        });
        if (result.effectiveOutlines.length > 1) {
          const spliced = spliceGeneratedOutlines(outlines, outline.id, result.effectiveOutlines);
          outlines = spliced.outlines;
          writePersistedStageOutlines(stage.id, outlines);
          i += result.effectiveOutlines.length - 1;
          resetSceneContentQueue(i + 1);
        }
        scenes.push(...result.scenes);
        previousSpeeches = result.previousSpeeches;
        stage = {
          ...stage,
          updatedAt: Date.now(),
        };
        await saveStageData(stage.id, {
          stage,
          scenes,
          currentSceneId: scenes[0]?.id || null,
          chats: [],
        });
        const generatedPageThumbnails = generatedPageThumbnailsFromScenes(result.scenes);
        if (generatedPageThumbnails.length > 0) {
          input.onProgress?.({
            stage: 'scene',
            detail:
              language === 'zh-CN'
                ? `已保存第 ${i + 1}/${outlines.length} 页图片，继续按顺序生成后续页面…`
                : `Saved image page ${i + 1}/${outlines.length}; continuing in order...`,
            completed: Math.min(outlines.length, i + 1),
            total: outlines.length,
            generatedPageThumbnails,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '页面生成失败';
        const shortReason = buildShortFailureReason(message);
        const failure: PageGenerationFailureRecord = {
          outlineId: outline.id,
          outlineTitle: outline.title,
          order: outline.order,
          source: 'initial_generation',
          phase: inferPageGenerationFailurePhase(message),
          error: message,
          shortReason,
          failedAt: Date.now(),
        };
        failedScenes.push(failure);
        stage = withPageGenerationFailure(stage, failure);
        try {
          await saveStageData(stage.id, {
            stage,
            scenes,
            currentSceneId: scenes[0]?.id || null,
            chats: [],
          });
        } catch (saveError) {
          console.warn('[NotebookGeneration] Failed to persist page generation failure', {
            outlineId: outline.id,
            outlineTitle: outline.title,
            error: errorMessage(saveError, '保存失败页面记录失败'),
          });
        }
        input.onProgress?.({
          stage: 'scene',
          detail: `已跳过失败页面 ${i + 1}/${outlines.length}：${outline.title}（${shortReason}）`,
          completed: i + 1,
          total: outlines.length,
        });
      }
    }

    if (scenes.length === 0) {
      const firstFailure = failedScenes[0];
      throw new Error(firstFailure?.error || '未能生成任何页面');
    }

    input.onProgress?.({ stage: 'saving', detail: '正在保存笔记本与页面…' });
    stage = {
      ...stage,
      updatedAt: Date.now(),
    };
    await saveStageData(stage.id, {
      stage,
      scenes,
      currentSceneId: scenes[0]?.id || null,
      chats: [],
    });
    writePersistedStageOutlines(stage.id, outlines);
    if (slideGenerationRoute === 'image-ppt' && failedScenes.length === 0) {
      persistFinalImageNotebookPublicMemory({ stage, outlines, scenes, language });
    }

    input.onProgress?.({
      stage: 'completed',
      detail:
        failedScenes.length > 0
          ? `已完成，成功生成 ${scenes.length} 页，跳过 ${failedScenes.length} 页失败页面`
          : `已完成，共生成 ${scenes.length} 页`,
      notebookId: stage.id,
      notebookName: stage.name,
    });
    return {
      stage,
      scenes,
      outlines,
      agents,
      researchSources,
      failedScenes: failedScenes.length > 0 ? failedScenes : undefined,
    };
  } catch (error) {
    throw error;
  }
}
