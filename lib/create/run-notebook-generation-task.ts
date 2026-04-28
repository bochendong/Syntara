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
import type { Scene, Stage } from '@/lib/types/stage';
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
import {
  confirmComputeCreditsForGeneration,
  estimateNotebookGenerationComputeCredits,
} from '@/lib/utils/generation-credit-preflight';
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
import { ensureTitleCoverOutline } from '@/lib/generation/title-cover';
import {
  normalizeSlideGenerationRoute,
  type SlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
import {
  createLinkedAbortController,
  errorMessage,
  generateSceneActionsFromContent,
  generateSceneContentBundle,
  type SceneContentJobResult,
} from './scene-content-jobs';
import { generateNotebookMetadata } from './notebook-metadata';
import { maybeRunWebSearch, type WebSearchSource } from './research';

type OutlineStreamEvent =
  | { type: 'outline'; data: SceneOutline }
  | { type: 'retry' }
  | { type: 'done'; outlines?: SceneOutline[] }
  | { type: 'error'; error: string };

const MAX_PARALLEL_SCENE_CONTENT = 2;

export type NotebookGenerationProgress =
  | { stage: 'preparing'; detail: string }
  | { stage: 'pdf-analysis'; detail: string }
  | { stage: 'research'; detail: string; sources?: WebSearchSource[] }
  | { stage: 'metadata'; detail: string }
  | { stage: 'notebook-ready'; detail: string; notebookId: string }
  | { stage: 'agents'; detail: string }
  | { stage: 'outline'; detail: string; completed?: number }
  | { stage: 'scene'; detail: string; completed: number; total: number }
  | { stage: 'saving'; detail: string }
  | { stage: 'completed'; detail: string; notebookId: string; notebookName: string };

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
  /** 默认 true；关闭时只创建仓库笔记本，不生成 agents / 大纲 / PPT 页面 */
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
  /** 覆盖设置里的「AI 配图」开关；不传则沿用全局设置 */
  imageGenerationEnabledOverride?: boolean;
  /** 传入后由大纲 API 注入额外策略（总控侧栏「生成选项」） */
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
  failedScenes?: Array<{ outlineId: string; title: string; error: string }>;
};

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
    backendFetch('/api/generate/scene-outlines-stream', {
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
          ? 'Outline generation failed'
          : '大纲生成失败';
    const message = await readApiErrorMessage(response, fallback);
    throw new Error(message || fallback);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取大纲流');

  const decoder = new TextDecoder();
  let buffer = '';
  const outlines: SceneOutline[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const evt = JSON.parse(line.slice(6)) as OutlineStreamEvent;
        if (evt.type === 'outline') {
          outlines.push({
            ...evt.data,
            language: args.language,
          });
          args.onOutline?.(outlines.length);
        } else if (evt.type === 'retry') {
          outlines.length = 0;
          args.onOutline?.(0);
        } else if (evt.type === 'done') {
          return applyOutlineLanguage(
            evt.outlines?.length ? evt.outlines : outlines,
            args.language,
          );
        } else if (evt.type === 'error') {
          throw new Error(evt.error || '大纲生成失败');
        }
      }
    }

    if (done) {
      return applyOutlineLanguage(outlines, args.language);
    }
  }
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
    );
  }

  let currentOutlines = normalizeOutlineCollection(
    applyOutlineLanguage(
      applyOutlinePreferenceHardConstraints(args.outlines, {
        coursePurpose: args.coursePurpose,
        outlinePreferences: args.outlinePreferences,
      }),
      args.language,
    ),
  );
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
          ? `正在补充大纲：还差 ${coverage.missingSceneCount} 页，缺少 ${coverage.missingWorkedExampleSequences} 组完整例题…`
          : `Repairing outline: ${coverage.missingSceneCount} more scenes and ${coverage.missingWorkedExampleSequences} more worked-example sequences needed…`,
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
              ? `正在补充缺失页面（已新增 ${count} 个大纲节点）…`
              : `Generating supplemental outline pages (${count} added so far)…`,
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
    );

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
  const slideGenerationRoute = normalizeSlideGenerationRoute(input.slideGenerationRoute);
  const settings = useSettingsStore.getState();
  const effectiveMediaFlags: EffectiveMediaFlags = {
    imageEnabled:
      input.imageGenerationEnabledOverride !== undefined
        ? input.imageGenerationEnabledOverride
        : (settings.imageGenerationEnabled ?? false),
    videoEnabled: settings.videoGenerationEnabled ?? false,
  };
  const estimatedCredits = estimateNotebookGenerationComputeCredits({
    generateSlides,
    outlineLength: input.outlinePreferences?.length ?? 'standard',
    workedExampleLevel: input.outlinePreferences?.workedExampleLevel ?? 'moderate',
    includeQuizScenes: input.outlinePreferences?.includeQuizScenes ?? true,
    webSearch,
    imageGenerationEnabled: effectiveMediaFlags.imageEnabled,
    sourceFileSize: sourceFile?.size ?? 0,
  });
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
    });
  input.onProgress?.({ stage: 'preparing', detail: '正在初始化创建任务…' });

  try {
    await confirmComputeCreditsForGeneration({
      requiredCredits: estimatedCredits,
      actionLabel: generateSlides ? '生成笔记本' : '加入笔记本仓库',
    });
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
        detail: `已加入仓库：${stage.name}（未生成 PPT 课件）`,
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

    input.onProgress?.({ stage: 'outline', detail: '正在生成课程大纲…', completed: 0 });
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
          detail: count > 0 ? `已生成 ${count} 个大纲节点…` : '正在重新整理课程结构…',
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
          ? '正在检查大纲页数与例题覆盖，并按需补充缺失页面…'
          : 'Validating outline length and worked-example coverage before scene generation…',
      completed: filteredOutlines.length,
    });

    let outlines = await repairOutlinesIfNeeded({
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
    outlines = normalizeOutlineStructure(
      ensureTitleCoverOutline(outlines, {
        title: stage.name,
        language,
      }),
    );

    if (!outlines.length) throw new Error('未生成任何课程大纲');
    writePersistedStageOutlines(stage.id, outlines);

    const scenes: Scene[] = [];
    const failedScenes: Array<{ outlineId: string; title: string; error: string }> = [];
    let previousSpeeches: string[] = [];
    const userProfile =
      input.userNickname || input.userBio
        ? `Student: ${input.userNickname || 'Unknown'}${input.userBio ? ` — ${input.userBio}` : ''}`
        : undefined;

    let sceneContentGeneration = 0;
    let sceneContentCursor = 0;
    const sceneContentJobs = new Map<
      string,
      {
        generation: number;
        abortController: AbortController;
        promise: Promise<SceneContentJobResult>;
      }
    >();

    const enqueueSceneContentJob = (outline: SceneOutline) => {
      if (sceneContentJobs.has(outline.id)) return;
      const generation = sceneContentGeneration;
      const allOutlinesSnapshot = outlines;
      const abortController = createLinkedAbortController(input.signal);
      const promise = generateSceneContentBundle({
        outline,
        allOutlines: allOutlinesSnapshot,
        stage,
        agents,
        courseContext,
        signal: abortController.signal,
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

      sceneContentJobs.set(outline.id, {
        generation,
        abortController,
        promise,
      });
    };

    const fillSceneContentQueue = () => {
      while (
        sceneContentJobs.size < MAX_PARALLEL_SCENE_CONTENT &&
        sceneContentCursor < outlines.length
      ) {
        const outline = outlines[sceneContentCursor];
        enqueueSceneContentJob(outline);
        sceneContentCursor += 1;
      }
    };

    const resetSceneContentQueue = (nextIndex: number) => {
      sceneContentGeneration += 1;
      for (const job of sceneContentJobs.values()) {
        job.abortController.abort();
      }
      sceneContentJobs.clear();
      sceneContentCursor = nextIndex;
    };

    for (let i = 0; i < outlines.length; i += 1) {
      const outline = outlines[i];
      input.onProgress?.({
        stage: 'scene',
        detail:
          language === 'zh-CN'
            ? `正在生成第 ${i + 1}/${outlines.length} 页：${outline.title}（并行准备后续页面内容）`
            : `Generating page ${i + 1}/${outlines.length}: ${outline.title} (preparing later page content in parallel)`,
        completed: i,
        total: outlines.length,
      });
      try {
        fillSceneContentQueue();
        let contentJob = sceneContentJobs.get(outline.id);
        if (!contentJob) {
          enqueueSceneContentJob(outline);
          contentJob = sceneContentJobs.get(outline.id);
        }
        if (!contentJob) throw new Error('页面内容生成任务创建失败');

        const contentResult = await contentJob.promise;
        sceneContentJobs.delete(outline.id);
        fillSceneContentQueue();

        if (contentJob.generation !== sceneContentGeneration) {
          i -= 1;
          continue;
        }
        if (!contentResult.success) {
          throw new Error(contentResult.error);
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
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : '页面生成失败';
        const shortReason = buildShortFailureReason(message);
        failedScenes.push({
          outlineId: outline.id,
          title: outline.title,
          error: message,
        });
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
