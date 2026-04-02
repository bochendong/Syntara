'use client';

import { nanoid } from 'nanoid';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
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
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import { loadImageMapping, storeImages } from '@/lib/utils/image-storage';
import type {
  OrchestratorOutlineLength,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import type { PdfSourceSelection } from '@/lib/pdf/page-selection';
import { backendFetch } from '@/lib/utils/backend-api';

type NotebookMetadata = {
  name: string;
  description: string;
  tags: string[];
};

type WebSearchSource = {
  title: string;
  url: string;
};

type EffectiveMediaFlags = {
  imageEnabled: boolean;
  videoEnabled: boolean;
};

type OutlineCoverageCheck = {
  totalScenes: number;
  minSceneCount: number;
  workedExampleSequenceCount: number;
  minWorkedExampleSequenceCount: number;
  missingSceneCount: number;
  missingWorkedExampleSequences: number;
  candidateExampleTopics: string[];
};

type OutlineStreamEvent =
  | { type: 'outline'; data: SceneOutline }
  | { type: 'retry' }
  | { type: 'done'; outlines?: SceneOutline[] }
  | { type: 'error'; error: string };

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
  requirement: string;
  /** 仅覆盖本次 notebook 创建链路所用的 OpenAI 模型；null/undefined 时沿用当前设置 */
  modelIdOverride?: string | null;
  language?: 'zh-CN' | 'en-US';
  webSearch?: boolean;
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
};

function getApiHeaders(overrides?: {
  imageGenerationEnabled?: boolean;
  modelIdOverride?: string | null;
}): HeadersInit {
  const modelConfig = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
  const imageGenEnabled =
    overrides?.imageGenerationEnabled !== undefined
      ? overrides.imageGenerationEnabled
      : (settings.imageGenerationEnabled ?? false);
  const modelString = overrides?.modelIdOverride?.trim()
    ? `openai:${overrides.modelIdOverride.trim()}`
    : modelConfig.modelString;
  return {
    'Content-Type': 'application/json',
    'x-model': modelString,
    'x-api-key': modelConfig.apiKey,
    'x-base-url': modelConfig.baseUrl,
    'x-provider-type': modelConfig.providerType || '',
    'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(imageGenEnabled),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (data?.error?.trim()) return data.error.trim();
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}

function buildPayloadTooLargeMessage(
  language: 'zh-CN' | 'en-US',
  stage: 'outline' | 'scene',
): string {
  if (language === 'en-US') {
    return stage === 'outline'
      ? 'Outline generation payload is still too large for the current deployment platform. Keep fewer pages or switch image-heavy pages to screenshots.'
      : 'Slide generation payload is still too large for the current deployment platform. Keep fewer image-heavy pages or switch them to screenshots.';
  }

  return stage === 'outline'
    ? '当前大纲生成请求体仍然过大，请继续减少保留页面，或把重图片页改成整页截图。'
    : '当前页面生成请求体仍然过大，请继续减少重图片页面，或把它们改成整页截图。';
}

function isPdfSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return mime === 'application/pdf' || lowerName.endsWith('.pdf');
}

function isMarkdownSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return mime === 'text/markdown' || mime === 'text/x-markdown' || lowerName.endsWith('.md');
}

function isPptxSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lowerName.endsWith('.pptx')
  );
}

async function parseMarkdownLikeGenerationInput(args: {
  file: File;
}): Promise<{ pdfText: string; truncationWarnings: string[] }> {
  const file = args.file;
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Markdown 文件无效或为空');
  }
  const raw = (await file.text()).replace(/\u0000/g, '').trim();
  if (!raw) {
    throw new Error('Markdown 文件为空，无法用于生成');
  }
  const truncationWarnings: string[] = [];
  let pdfText = raw;
  if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
    pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
    truncationWarnings.push(`正文已截断至前 ${MAX_PDF_CONTENT_CHARS} 字符`);
  }
  return { pdfText, truncationWarnings };
}

/** 与 `app/generation-preview/page.tsx` 中 PDF 解析步骤一致（FormData → /api/parse-pdf → storeImages） */
async function parsePdfLikeGenerationPreview(args: {
  pdfFile: File;
  signal?: AbortSignal;
  language?: 'zh-CN' | 'en-US';
  sourcePageSelection?: PdfSourceSelection;
}): Promise<{
  pdfText: string;
  pdfImages: PdfImage[];
  imageStorageIds: string[];
  imageMapping: ImageMapping;
  truncationWarnings: string[];
}> {
  const settings = useSettingsStore.getState();
  const pdfFile = args.pdfFile;
  return parsePdfForGeneration({
    pdfFile,
    signal: args.signal,
    language: args.language || 'zh-CN',
    providerId: settings.pdfProviderId,
    providerConfig: settings.pdfProvidersConfig?.[settings.pdfProviderId]
      ? {
          apiKey: settings.pdfProvidersConfig[settings.pdfProviderId]?.apiKey,
          baseUrl: settings.pdfProvidersConfig[settings.pdfProviderId]?.baseUrl,
        }
      : undefined,
    selection: args.sourcePageSelection,
  });
}

async function parsePptxLikeGenerationPreview(args: {
  pptxFile: File;
  signal?: AbortSignal;
}): Promise<{
  pdfText: string;
  pdfImages: PdfImage[];
  imageStorageIds: string[];
  imageMapping: ImageMapping;
  truncationWarnings: string[];
}> {
  const pptxFile = args.pptxFile;
  if (!(pptxFile instanceof File) || pptxFile.size === 0) {
    throw new Error('PPTX 文件无效或为空');
  }

  const parseFormData = new FormData();
  parseFormData.append('pptx', pptxFile);

  const parseResponse = await fetch('/api/parse-pptx', {
    method: 'POST',
    body: parseFormData,
    signal: args.signal,
  });

  if (!parseResponse.ok) {
    const errorData = await parseResponse.json().catch(() => ({ error: 'PPTX 解析失败' }));
    throw new Error((errorData as { error?: string }).error || 'PPTX 解析失败');
  }

  const parseResult = await parseResponse.json();
  if (!parseResult.success || !parseResult.data) {
    throw new Error('PPTX 解析失败');
  }

  let pdfText = parseResult.data.text as string;
  if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
    pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
  }

  const rawPdfImages = parseResult.data.metadata?.pdfImages || [];
  const images = rawPdfImages.map(
    (img: {
      id: string;
      src?: string;
      pageNumber?: number;
      description?: string;
      width?: number;
      height?: number;
    }) => ({
      id: img.id,
      src: img.src || '',
      pageNumber: img.pageNumber || 1,
      description: img.description,
      width: img.width,
      height: img.height,
    }),
  );

  const imageStorageIds = await storeImages(images);
  const pdfImages: PdfImage[] = images.map(
    (
      img: {
        id: string;
        src: string;
        pageNumber: number;
        description?: string;
        width?: number;
        height?: number;
      },
      i: number,
    ) => ({
      id: img.id,
      src: '',
      pageNumber: img.pageNumber,
      description: img.description,
      width: img.width,
      height: img.height,
      storageId: imageStorageIds[i],
    }),
  );
  const imageMapping = await loadImageMapping(imageStorageIds);

  const truncationWarnings: string[] = [];
  if ((parseResult.data.text as string).length > MAX_PDF_CONTENT_CHARS) {
    truncationWarnings.push(`正文已截断至前 ${MAX_PDF_CONTENT_CHARS} 字符`);
  }
  if (images.length > MAX_VISION_IMAGES) {
    truncationWarnings.push(`图片数量已截断：保留 ${MAX_VISION_IMAGES} / ${images.length} 张`);
  }

  return { pdfText, pdfImages, imageStorageIds, imageMapping, truncationWarnings };
}

function extractTopicFromRequirement(requirement: string): string {
  const trimmed = requirement.trim();
  if (!trimmed) return '未命名笔记本';
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.substring(0, 28).trim()}...`;
}

function buildFallbackNotebookMetadata(
  requirement: string,
  language: 'zh-CN' | 'en-US',
  courseContext?: CoursePersonalizationContext,
): NotebookMetadata {
  const name = extractTopicFromRequirement(requirement);
  const normalized = requirement.replace(/[，。、“”‘’！？;；,.!?()[\]{}<>]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const unique = Array.from(new Set(words)).slice(0, 5);
  const defaultTags =
    language === 'en-US' ? ['learning', 'notebook', 'ai-generated'] : ['学习', '笔记本', 'AI生成'];
  const tags = Array.from(
    new Set([...(courseContext?.tags || []), ...(unique.length > 0 ? unique : defaultTags)]),
  ).slice(0, 8);
  const description =
    language === 'en-US'
      ? `Includes: ${name}. Not included: Deep dives beyond the current requirement or unrelated topics.`
      : `包含：${name}相关核心内容与关键知识点。不包含：超出当前需求范围的深度延展或无关主题。`;
  return { name, description, tags };
}

async function generateNotebookMetadata(args: {
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  pdfText?: string;
  getHeaders?: () => HeadersInit;
}): Promise<NotebookMetadata> {
  const resp = await backendFetch('/api/generate/notebook-metadata', {
    method: 'POST',
    headers: (args.getHeaders ?? (() => getApiHeaders()))(),
    body: JSON.stringify({
      requirements: {
        requirement: args.requirement,
        language: args.language,
        webSearch: args.webSearch,
      },
      pdfText: args.pdfText || '',
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!resp.ok) {
    const fallback = buildFallbackNotebookMetadata(
      args.requirement,
      args.language,
      args.courseContext,
    );
    return fallback;
  }

  const data = await resp.json();
  if (!data?.success || !data?.name || !data?.description) {
    return buildFallbackNotebookMetadata(args.requirement, args.language, args.courseContext);
  }

  return {
    name: String(data.name),
    description: String(data.description),
    tags: Array.isArray(data.tags) ? data.tags.map((x: unknown) => String(x)).slice(0, 8) : [],
  };
}

async function maybeRunWebSearch(args: {
  requirement: string;
  enabled: boolean;
  signal?: AbortSignal;
}): Promise<{ context?: string; sources: WebSearchSource[] }> {
  if (!args.enabled) return { context: undefined, sources: [] };

  const settings = useSettingsStore.getState();
  const apiKey =
    settings.webSearchProvidersConfig?.[settings.webSearchProviderId]?.apiKey || undefined;

  const res = await fetch('/api/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: args.requirement, apiKey }),
    signal: args.signal,
  });

  if (!res.ok) {
    return { context: undefined, sources: [] };
  }

  const data = await res.json();
  return {
    context: data.context || undefined,
    sources: Array.isArray(data.sources) ? data.sources.slice(0, 8) : [],
  };
}

function filterOutlineMediaGenerations(
  outlines: SceneOutline[],
  flags: EffectiveMediaFlags,
): SceneOutline[] {
  return outlines.map((outline) => {
    if (!outline.mediaGenerations?.length) return outline;

    const mediaGenerations = outline.mediaGenerations.filter((media) => {
      if (media.type === 'image' && !flags.imageEnabled) return false;
      if (media.type === 'video' && !flags.videoEnabled) return false;
      return true;
    });

    if (mediaGenerations.length === outline.mediaGenerations.length) {
      return outline;
    }

    if (mediaGenerations.length === 0) {
      const nextOutline = { ...outline };
      delete nextOutline.mediaGenerations;
      return nextOutline;
    }

    return {
      ...outline,
      mediaGenerations,
    };
  });
}

function applyOutlinePreferenceHardConstraints(
  outlines: SceneOutline[],
  args: {
    coursePurpose?: 'research' | 'university' | 'daily';
    outlinePreferences?: {
      length: OrchestratorOutlineLength;
      includeQuizScenes: boolean;
      workedExampleLevel?: OrchestratorWorkedExampleLevel;
    } | null;
  },
): SceneOutline[] {
  const prefs = args.outlinePreferences;
  const disallowInteractive = args.coursePurpose === 'research';

  if ((!prefs || prefs.includeQuizScenes) && !disallowInteractive) return outlines;

  return outlines.map((outline) => {
    if (!prefs?.includeQuizScenes && outline.type === 'quiz') {
      const nextOutline: SceneOutline = {
        ...outline,
        type: 'slide',
      };
      delete nextOutline.quizConfig;
      return nextOutline;
    }

    if (disallowInteractive && outline.type === 'interactive') {
      const nextOutline: SceneOutline = {
        ...outline,
        type: 'slide',
      };
      delete nextOutline.interactiveConfig;
      return nextOutline;
    }

    return outline;
  });
}

function getMinimumSceneCount(length: OrchestratorOutlineLength): number {
  switch (length) {
    case 'compact':
      return 6;
    case 'extended':
      return 21;
    case 'standard':
    default:
      return 10;
  }
}

function getBaseWorkedExampleMinimum(level: OrchestratorWorkedExampleLevel): number {
  switch (level) {
    case 'none':
      return 0;
    case 'light':
      return 1;
    case 'heavy':
      return 5;
    case 'moderate':
    default:
      return 2;
  }
}

function countWorkedExampleSequences(outlines: SceneOutline[]): number {
  const seenExampleIds = new Set<string>();
  let contiguousFallbackSequences = 0;
  let previousWasFallbackExample = false;

  for (const outline of outlines) {
    const cfg = outline.workedExampleConfig;
    if (!cfg) {
      previousWasFallbackExample = false;
      continue;
    }

    const exampleId = cfg.exampleId?.trim();
    if (exampleId) {
      seenExampleIds.add(exampleId);
      previousWasFallbackExample = false;
      continue;
    }

    if (!previousWasFallbackExample) {
      contiguousFallbackSequences += 1;
    }
    previousWasFallbackExample = true;
  }

  return seenExampleIds.size + contiguousFallbackSequences;
}

function collectWorkedExampleCandidateTopics(outlines: SceneOutline[], limit = 6): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const outline of outlines) {
    if (outline.type !== 'slide' || outline.workedExampleConfig) continue;
    const title = outline.title.trim();
    if (!title) continue;

    const signature = title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(signature)) continue;
    seen.add(signature);

    const firstKeyPoint = outline.keyPoints.find((item) => item.trim().length > 0)?.trim();
    topics.push(firstKeyPoint ? `${title} — ${firstKeyPoint}` : title);
    if (topics.length >= limit) break;
  }

  return topics;
}

function analyzeOutlineCoverage(args: {
  outlines: SceneOutline[];
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
}): OutlineCoverageCheck | null {
  const prefs = args.outlinePreferences;
  if (!prefs) return null;

  const totalScenes = args.outlines.length;
  const minSceneCount = getMinimumSceneCount(prefs.length);
  const pageBudget = Math.max(totalScenes, minSceneCount);
  const maxWorkedExamplesByBudget = Math.max(0, pageBudget - 4);
  const desiredWorkedExamples = getBaseWorkedExampleMinimum(prefs.workedExampleLevel ?? 'moderate');
  const minWorkedExampleSequenceCount = Math.min(desiredWorkedExamples, maxWorkedExamplesByBudget);
  const workedExampleSequenceCount = countWorkedExampleSequences(args.outlines);

  return {
    totalScenes,
    minSceneCount,
    workedExampleSequenceCount,
    minWorkedExampleSequenceCount,
    missingSceneCount: Math.max(0, minSceneCount - totalScenes),
    missingWorkedExampleSequences: Math.max(
      0,
      minWorkedExampleSequenceCount - workedExampleSequenceCount,
    ),
    candidateExampleTopics: collectWorkedExampleCandidateTopics(args.outlines),
  };
}

function normalizeOutlineCollection(outlines: SceneOutline[]): SceneOutline[] {
  const seenIds = new Set<string>();
  return outlines.map((outline, index) => {
    let id = outline.id?.trim() || nanoid();
    if (seenIds.has(id)) id = nanoid();
    seenIds.add(id);
    return {
      ...outline,
      id,
      order: index + 1,
    };
  });
}

function buildOutlineDedupSignature(outline: SceneOutline): string {
  const normalizedTitle = outline.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const cfg = outline.workedExampleConfig;
  return [outline.type, normalizedTitle, cfg?.exampleId?.trim() || '', cfg?.role || ''].join('|');
}

function mergeSupplementalOutlines(
  currentOutlines: SceneOutline[],
  supplementalOutlines: SceneOutline[],
): SceneOutline[] {
  if (!supplementalOutlines.length) return currentOutlines;

  const seen = new Set(currentOutlines.map(buildOutlineDedupSignature));
  const uniqueSupplemental = supplementalOutlines.filter((outline) => {
    const signature = buildOutlineDedupSignature(outline);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  if (!uniqueSupplemental.length) return currentOutlines;
  return normalizeOutlineCollection([...currentOutlines, ...uniqueSupplemental]);
}

function buildOutlineRepairRequirement(args: {
  language: 'zh-CN' | 'en-US';
  originalRequirement: string;
  currentOutlines: SceneOutline[];
  coverage: OutlineCoverageCheck;
  passNumber: number;
}): string {
  const targetAdditionalScenes = Math.max(
    args.coverage.missingSceneCount,
    args.coverage.missingWorkedExampleSequences > 0
      ? args.coverage.missingWorkedExampleSequences * 2
      : 0,
  );
  const currentSummary = args.currentOutlines
    .slice(0, 24)
    .map((outline, index) => {
      const suffix = outline.workedExampleConfig
        ? ` [example:${outline.workedExampleConfig.exampleId || outline.workedExampleConfig.role}]`
        : '';
      return `${index + 1}. [${outline.type}] ${outline.title}${suffix} — ${outline.description}`;
    })
    .join('\n');

  if (args.language === 'zh-CN') {
    const topicLines =
      args.coverage.candidateExampleTopics.length > 0
        ? args.coverage.candidateExampleTopics.map((topic) => `- ${topic}`).join('\n')
        : '- 优先围绕当前 notebook 里尚未配套例题的核心知识点、方法与易错点补充';

    return [
      '你不是在重写整本 notebook，而是在补充已有 notebook 缺失的大纲页。',
      '',
      '## 原始用户需求',
      args.originalRequirement,
      '',
      '## 当前大纲缺口',
      `- 当前共有 ${args.coverage.totalScenes} 个场景，需要至少 ${args.coverage.minSceneCount} 个，因此还需补充至少 ${args.coverage.missingSceneCount} 个场景。`,
      `- 当前共有 ${args.coverage.workedExampleSequenceCount} 组完整例题 / 走读序列，需要至少 ${args.coverage.minWorkedExampleSequenceCount} 组，因此还需补充至少 ${args.coverage.missingWorkedExampleSequences} 组新的例题序列。`,
      `- 这是第 ${args.passNumber} 次补充，请优先补足缺口而不是重复已有页。`,
      '',
      '## 已有场景摘要（禁止重复）',
      currentSummary || '暂无',
      '',
      '## 例题优先覆盖的知识点',
      topicLines,
      '',
      '## 补充输出要求',
      `- 只输出“新增”的 scene outlines JSON 数组，不要重写整本课。目标新增约 ${Math.max(1, targetAdditionalScenes)} 个场景。`,
      '- 不要复用已有标题，不要生成近似重复的页面。',
      '- 如果补充例题序列，优先使用 `slide` + `workedExampleConfig`，并让序列首张通常为 `role: "problem_statement"`。',
      '- 每个新增例题都必须有具体原题；数学/矩阵/线性系统类例题必须写出实际方程、矩阵、行变换、中间结果，不能写成“给定一个矩阵”这种空壳题。',
      '- 若页数不足但例题数量已够，请优先补充承上启下的概念解释、易错点、总结、对比页，而不是堆空标题。',
      '- 新增内容必须与已有 notebook 连续衔接，形成“概念 -> 例题 -> 概念 -> 例题”的节奏。',
    ].join('\n');
  }

  const topicLines =
    args.coverage.candidateExampleTopics.length > 0
      ? args.coverage.candidateExampleTopics.map((topic) => `- ${topic}`).join('\n')
      : '- Prefer major concepts, methods, and pitfalls that still lack their own worked examples';

  return [
    'Do not rewrite the whole notebook. You are extending an existing notebook with missing outline pages only.',
    '',
    '## Original User Requirement',
    args.originalRequirement,
    '',
    '## Current Gaps',
    `- The notebook currently has ${args.coverage.totalScenes} scenes, but it needs at least ${args.coverage.minSceneCount}, so add at least ${args.coverage.missingSceneCount} more scenes.`,
    `- It currently has ${args.coverage.workedExampleSequenceCount} worked-example sequences, but it needs at least ${args.coverage.minWorkedExampleSequenceCount}, so add at least ${args.coverage.missingWorkedExampleSequences} new worked-example sequences.`,
    `- This is repair pass ${args.passNumber}; prioritize filling the gaps instead of repeating existing pages.`,
    '',
    '## Existing Scenes Summary (do not duplicate)',
    currentSummary || 'None',
    '',
    '## Topics That Should Gain Worked Examples First',
    topicLines,
    '',
    '## Output Rules',
    `- Output only the NEW scene outlines as a JSON array. Do not regenerate the full notebook. Aim for about ${Math.max(1, targetAdditionalScenes)} additional scenes.`,
    '- Do not reuse existing titles or produce near-duplicate pages.',
    '- When adding worked-example sequences, prefer `slide` scenes with `workedExampleConfig`, and usually start each new sequence with `role: "problem_statement"`.',
    '- Every new worked example must contain a concrete original problem. For math / matrix / linear-system topics, include actual equations, matrices, row operations, and intermediate results instead of placeholder wording.',
    '- If page count is short but worked-example count is already sufficient, add bridging concept slides, pitfalls, comparisons, or recap pages instead of hollow filler.',
    '- The added pages should create a clear "concept -> worked example -> concept -> worked example" rhythm with the existing notebook.',
  ].join('\n');
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
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: args.pdfImages,
    imageMapping: args.imageMapping,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  if (budgetedMedia.omittedVisionImageIds.length > 0 || budgetedMedia.omittedPdfImageIds.length > 0) {
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
    console.warn('[NotebookGeneration] Outline payload still too large, retrying without vision images');
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
          outlines.push(evt.data);
          args.onOutline?.(outlines.length);
        } else if (evt.type === 'retry') {
          outlines.length = 0;
          args.onOutline?.(0);
        } else if (evt.type === 'done') {
          return evt.outlines?.length ? evt.outlines : outlines;
        } else if (evt.type === 'error') {
          throw new Error(evt.error || '大纲生成失败');
        }
      }
    }

    if (done) {
      return outlines;
    }
  }
}

async function repairOutlinesIfNeeded(args: {
  outlines: SceneOutline[];
  originalRequirement: string;
  language: 'zh-CN' | 'en-US';
  researchContext?: string;
  agents: AgentInfo[];
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
      applyOutlinePreferenceHardConstraints(args.outlines, {
        coursePurpose: args.coursePurpose,
        outlinePreferences: args.outlinePreferences,
      }),
    );
  }

  let currentOutlines = normalizeOutlineCollection(
    applyOutlinePreferenceHardConstraints(args.outlines, {
      coursePurpose: args.coursePurpose,
      outlinePreferences: args.outlinePreferences,
    }),
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
    const mergedOutlines = mergeSupplementalOutlines(currentOutlines, supplementalOutlines);

    if (mergedOutlines.length === currentOutlines.length) {
      return currentOutlines;
    }

    currentOutlines = mergedOutlines;
  }

  return currentOutlines;
}

async function generateSingleScene(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  agents: AgentInfo[];
  previousSpeeches: string[];
  userProfile?: string;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  getHeaders?: () => HeadersInit;
}): Promise<{ scene: Scene; previousSpeeches: string[] }> {
  const suggestedIds = args.outline.suggestedImageIds || [];
  const filteredPdfImages =
    suggestedIds.length > 0
      ? (args.pdfImages || []).filter((image) => suggestedIds.includes(image.id))
      : undefined;
  const basePayload = {
    outline: args.outline,
    allOutlines: args.allOutlines,
    stageInfo: {
      name: args.stage.name,
      description: args.stage.description,
      language: args.stage.language,
      style: args.stage.style,
    },
    stageId: args.stage.id,
    agents: args.agents,
    courseContext: args.courseContext,
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: filteredPdfImages,
    imageMapping: args.imageMapping,
    preferredImageIds: suggestedIds,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  const headers = (args.getHeaders ?? (() => getApiHeaders()))();
  const sendSceneContentRequest = (payload: Record<string, unknown>) =>
    backendFetch('/api/generate/scene-content', {
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

  let contentResp = await sendSceneContentRequest(primaryPayload);
  if (contentResp.status === 413 && budgetedMedia.imageMapping) {
    console.warn('[NotebookGeneration] Scene payload still too large, retrying without vision images', {
      outlineId: args.outline.id,
      outlineTitle: args.outline.title,
    });
    contentResp = await sendSceneContentRequest(fallbackPayload);
  }

  if (!contentResp.ok) {
    const responseLanguage: 'zh-CN' | 'en-US' = args.stage.language === 'en-US' ? 'en-US' : 'zh-CN';
    const fallback =
      contentResp.status === 413
        ? buildPayloadTooLargeMessage(responseLanguage, 'scene')
        : responseLanguage === 'en-US'
          ? 'Scene content generation failed'
          : '页面内容生成失败';
    const message = await readApiErrorMessage(contentResp, fallback);
    throw new Error(message || fallback);
  }

  const contentData = await contentResp.json();
  if (!contentData?.success || !contentData?.content) {
    throw new Error(contentData?.error || '页面内容生成失败');
  }

  const actionsResp = await backendFetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: (args.getHeaders ?? (() => getApiHeaders()))(),
    body: JSON.stringify({
      outline: contentData.effectiveOutline || args.outline,
      allOutlines: args.allOutlines,
      content: contentData.content,
      stageId: args.stage.id,
      agents: args.agents,
      previousSpeeches: args.previousSpeeches,
      userProfile: args.userProfile,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!actionsResp.ok) {
    const data = await actionsResp.json().catch(() => ({ error: '页面讲解生成失败' }));
    throw new Error(data.error || '页面讲解生成失败');
  }

  const actionsData = await actionsResp.json();
  if (!actionsData?.success || !actionsData?.scene) {
    throw new Error(actionsData?.error || '页面讲解生成失败');
  }

  return {
    scene: actionsData.scene as Scene,
    previousSpeeches: Array.isArray(actionsData.previousSpeeches)
      ? actionsData.previousSpeeches
      : [],
  };
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
  const settings = useSettingsStore.getState();
  const effectiveMediaFlags: EffectiveMediaFlags = {
    imageEnabled:
      input.imageGenerationEnabledOverride !== undefined
        ? input.imageGenerationEnabledOverride
        : (settings.imageGenerationEnabled ?? false),
    videoEnabled: settings.videoGenerationEnabled ?? false,
  };
  const mediaForHeaders =
    input.imageGenerationEnabledOverride !== undefined || input.modelIdOverride !== undefined
      ? {
          imageGenerationEnabled: input.imageGenerationEnabledOverride,
          modelIdOverride: input.modelIdOverride,
        }
      : undefined;
  const getHeaders = () => getApiHeaders(mediaForHeaders);
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
    const stage: Stage = {
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
      detail: `已进入教室「${stage.name}」，正在准备讲解角色与页面内容…`,
      notebookId: stage.id,
    });

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

    const outlines = await repairOutlinesIfNeeded({
      outlines: filteredOutlines,
      originalRequirement: requirement,
      language,
      researchContext,
      agents,
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

    if (!outlines.length) throw new Error('未生成任何课程大纲');

    const scenes: Scene[] = [];
    let previousSpeeches: string[] = [];
    const userProfile =
      input.userNickname || input.userBio
        ? `Student: ${input.userNickname || 'Unknown'}${input.userBio ? ` — ${input.userBio}` : ''}`
        : undefined;

    for (let i = 0; i < outlines.length; i += 1) {
      const outline = outlines[i];
      input.onProgress?.({
        stage: 'scene',
        detail: `正在生成第 ${i + 1}/${outlines.length} 页：${outline.title}`,
        completed: i,
        total: outlines.length,
      });
      const result = await generateSingleScene({
        outline,
        allOutlines: outlines,
        stage,
        agents,
        previousSpeeches,
        userProfile,
        courseContext,
        signal: input.signal,
        pdfImages,
        imageMapping,
        getHeaders,
      });
      scenes.push(result.scene);
      previousSpeeches = result.previousSpeeches;
    }

    input.onProgress?.({ stage: 'saving', detail: '正在保存笔记本与页面…' });
    await saveStageData(stage.id, {
      stage: {
        ...stage,
        updatedAt: Date.now(),
      },
      scenes,
      currentSceneId: scenes[0]?.id || null,
      chats: [],
    });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`stage-outlines:${stage.id}`, JSON.stringify(outlines));
    }

    input.onProgress?.({
      stage: 'completed',
      detail: `已完成，共生成 ${scenes.length} 页`,
      notebookId: stage.id,
      notebookName: stage.name,
    });
    return {
      stage,
      scenes,
      outlines,
      agents,
      researchSources,
    };
  } catch (error) {
    throw error;
  }
}
