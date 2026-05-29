'use client';

import { nanoid } from 'nanoid';
import { useSettingsStore } from '@/lib/store/settings';
import { spliceGeneratedOutlines } from '@/lib/generation/continuation-pages';
import { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
import { isTitleCoverOutline } from '@/lib/generation/title-cover';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import {
  buildHtmlSlideDensityContract,
  buildHtmlSlidePromptFromPlan,
  getHtmlSlideCanvasHeight,
  getHtmlSlideCanvasMode,
  type HtmlLessonPlanContract,
  type HtmlSlideOutlineContract,
  type HtmlSlidePlanContract,
} from '@/features/ppt-generation/html-slide-contracts';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import type {
  SceneActionContinuityContext,
  SceneActionCourseSpineContext,
  SceneActionFocusPlanItem,
  SceneActionNarrationPolicy,
} from '@/lib/generation/pipeline-types';
import type { SlideGenerationRoute } from '@/lib/generation/slide-generation-route';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics, Stage } from '@/lib/types/stage';
import type { ImageGenerationResult } from '@/lib/media/types';
import type { PPTElement, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { SourceImageAsset } from '@/features/ppt-generation/server/html-ppt-slide/types';
import {
  formatImageNotebookBriefForPrompt,
  type ImageNotebookFocusRegion,
  type ImageNotebookQaResult,
} from '@/lib/generation/image-notebook-quality';
import { buildImageNotebookPromptPlan } from '@/lib/generation/image-notebook-prompt-plan';
import { backendFetch } from '@/lib/utils/backend-api';
import { buildPayloadTooLargeMessage, readApiErrorMessage } from './api-errors';
import { getApiHeaders } from './generation-headers';
import { isCountedTeachingOutline } from './outline-preferences';

const NOTEBOOK_IMAGE2_PROVIDER_ID = 'openai-image';
const NOTEBOOK_IMAGE2_MODEL_ID = 'gpt-image-2';

const IMAGE_FIRST_NOTEBOOK_STYLE_SPEC = [
  'Visual style baseline:',
  '- Follow the selected drawing / illustration style first. The style may be notebook handwriting, cartoon illustration, minimalist line art, watercolor, or another user-specified art direction.',
  '- Make this look like a finished educational illustration or illustrated notebook page for students, not a teacher handout, lesson plan, or frontend template.',
  '- Use a full-bleed 16:9 canvas whose background, paper texture, board surface, or illustration treatment touches all four image edges.',
  '- Do not draw a centered paper/card/slide inside a larger canvas. No pillarboxing, letterboxing, white side bars, or outer frame.',
  '- Keep normal classroom padding for content, but never leave blank vertical columns on the left or right edges.',
  '- Use visual treatment consistent with the chosen art direction for titles, diagrams, highlights, characters, objects, and annotations.',
  '- The page should feel like one clear learning idea captured as a single bitmap image.',
  '- Keep a consistent course notebook feel: friendly, careful, readable, sparse, and projector-safe.',
  '- Use student-facing phrasing such as "我们先看", "你会先判断什么", "下一步怎么来"; avoid teacher-planning phrasing.',
  '- Never write visible meta labels like "让学生看到", "教学目标", "本页主线", "可迁移动作", "Teacher move", "Page role", or "QA checklist".',
  '- Avoid flat vector UI cards, generic corporate slide templates, stock-photo layouts, glossy gradients, browser chrome, app UI, and placeholder blocks.',
  '- Do not make an HTML/CSS-looking dashboard; do not put UI panels inside other panels.',
  '- Keep all formulas, code, and labels large enough to read at thumbnail size. Prefer 2-3 clear teaching regions over dense handout notes.',
].join('\n');

export type GeneratedSceneContentBundle = {
  contents: unknown[];
  effectiveOutlines: SceneOutline[];
  allOutlinesForActions: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
  imageNotebookQaByOutlineId?: Record<string, ImageNotebookQaResult>;
  contentDiagnosticsByOutlineId?: Record<string, SceneGenerationDiagnostics>;
  actionContextsByOutlineId?: Record<
    string,
    {
      courseSpine?: SceneActionCourseSpineContext;
      continuity?: SceneActionContinuityContext;
      focusPlan?: SceneActionFocusPlanItem[];
      narrationPolicy?: SceneActionNarrationPolicy;
    }
  >;
};

export type SceneContentJobResult =
  | { success: true; bundle: GeneratedSceneContentBundle }
  | { success: false; error: string };

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : fallback;
}

export function createLinkedAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) {
    controller.abort();
  } else {
    parent.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function outlineText(outline: SceneOutline, stage?: Stage): string {
  return [
    stage?.name,
    stage?.description,
    outline.title,
    outline.description,
    outline.teachingObjective,
    outline.studentThinkingMove,
    ...(outline.keyPoints || []),
    outline.workedExampleConfig?.kind,
    outline.workedExampleConfig?.problemStatement,
    ...(outline.workedExampleConfig?.walkthroughSteps || []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function inferHtmlCourseRoute(outline: SceneOutline, stage: Stage): string {
  const text = outlineText(outline, stage);
  if (
    /\b(code|python|javascript|class|object|method|inheritance|recursion|array|queue|stack|graph|tree|bfs|dfs|指针|链表|递归|算法|数据结构|继承|对象|方法|函数)\b/i.test(
      text,
    )
  ) {
    return 'computer-science';
  }
  if (
    /数学|定理|证明|公式|函数|积分|导数|极限|矩阵|方程|概率|集合|几何|代数|calculus|integral|derivative|limit|theorem|proof|equation|matrix/.test(
      text,
    ) ||
    outline.workedExampleConfig?.kind === 'math' ||
    outline.workedExampleConfig?.kind === 'proof'
  ) {
    return 'math';
  }
  if (/实验|物理|化学|生物|science|physics|chemistry|biology/.test(text)) return 'science';
  if (/增长|收入|市场|用户|指标|business|revenue|market|customer|kpi/.test(text)) {
    return 'business';
  }
  return 'general';
}

function inferHtmlCsRoute(outline: SceneOutline): string | undefined {
  const text = outlineText(outline);
  if (/memory|内存|引用|对象图|属性|object|reference/.test(text)) return 'memory-diagram';
  if (/call stack|栈帧|递归|recursion/.test(text)) return 'call-stack';
  if (/linked list|链表|pointer|指针/.test(text)) return 'pointer-diagram';
  if (/\btree\b|树|bst|二叉/.test(text)) return 'tree-diagram';
  if (/\bgraph\b|图|bfs|dfs|frontier|visited/.test(text)) return 'graph-trace';
  if (/queue|stack|队列|栈/.test(text)) return 'linear-structure';
  if (/dict|dictionary|map|hash|字典|映射/.test(text)) return 'dictionary-diagram';
  if (/invariant|不变量|合法性/.test(text)) return 'invariant-check';
  if (/trace|执行|逐行|代码/.test(text)) return 'execution-trace';
  return 'standard';
}

function inferHtmlMathRoute(outline: SceneOutline): string | undefined {
  const text = outlineText(outline);
  if (/证明|proof/.test(text) || outline.workedExampleConfig?.kind === 'proof') return 'proof';
  if (/推导|derive|derivation/.test(text)) return 'derivation';
  if (/例题|worked example|example/.test(text) || outline.workedExampleConfig?.kind === 'math') {
    return 'worked-example';
  }
  if (/定义|定理|definition|theorem/.test(text)) return 'definition-theorem';
  if (/公式|formula|equation/.test(text)) return 'formula-focus';
  if (/对比|比较|table|表/.test(text)) return 'comparison-table';
  return 'standard';
}

const COVER_BACKGROUNDS_BY_ROUTE: Record<string, string[]> = {
  'computer-science': [
    '/slide-backgrounds/dark-tech-neural.png',
    '/slide-backgrounds/sci-fi-data-cockpit.png',
    '/slide-backgrounds/product-launch-dark-photo.png',
    '/slide-backgrounds/workspace-desk-photo.png',
  ],
  math: [
    '/slide-backgrounds/academic-blueprint-photo.png',
    '/slide-backgrounds/deep-space-astronomy.png',
    '/slide-backgrounds/lecture-hall-photo.png',
    '/slide-backgrounds/science-lab-photo.png',
  ],
  science: [
    '/slide-backgrounds/science-lab-photo.png',
    '/slide-backgrounds/deep-space-astronomy.png',
    '/slide-backgrounds/academic-blueprint-photo.png',
    '/slide-backgrounds/sci-fi-data-cockpit.png',
  ],
  business: [
    '/slide-backgrounds/city-strategy-photo.png',
    '/slide-backgrounds/workspace-desk-photo.png',
    '/slide-backgrounds/product-launch-dark-photo.png',
  ],
  humanities: [
    '/slide-backgrounds/cinematic-stage-photo.png',
    '/slide-backgrounds/historical-manuscript.png',
    '/slide-backgrounds/magazine-courtyard-photo.png',
  ],
  general: [
    '/slide-backgrounds/lecture-hall-photo.png',
    '/slide-backgrounds/workspace-desk-photo.png',
    '/slide-backgrounds/academy-watercolor.png',
    '/slide-backgrounds/forest-path-photo.png',
  ],
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickCoverBackgroundUrl(args: {
  courseRoute: string;
  outline: SceneOutline;
  stage: Stage;
}): string {
  const candidates =
    COVER_BACKGROUNDS_BY_ROUTE[args.courseRoute] || COVER_BACKGROUNDS_BY_ROUTE.general;
  const key = [args.stage.id, args.stage.name, args.outline.title, args.courseRoute].join('|');
  return candidates[stableHash(key) % candidates.length];
}

function getTeachingPageOrder(
  outline: SceneOutline,
  allOutlines: SceneOutline[],
): number | undefined {
  if (!isCountedTeachingOutline(outline)) return undefined;
  let order = 0;
  for (const item of allOutlines) {
    if (!isCountedTeachingOutline(item)) continue;
    order += 1;
    if (item.id === outline.id) return order;
  }
  return undefined;
}

function getTeachingPageCount(outlines: SceneOutline[]): number {
  return outlines.filter(isCountedTeachingOutline).length;
}

function inferHtmlPageKind(
  outline: SceneOutline,
  totalTeachingPages: number,
  teachingPageOrder?: number,
): string {
  const text = outlineText(outline);
  if (outline.order <= 1 || /封面|cover|title cover/.test(text)) return 'cover';
  if (
    (teachingPageOrder != null && teachingPageOrder >= totalTeachingPages) ||
    /总结|回顾|summary|recap|takeaway/.test(text)
  ) {
    return 'summary';
  }
  if (/导入|intro|overview|引入/.test(text) || outline.archetype === 'intro') return 'intro';
  if (/代码|code|trace|执行/.test(text)) return 'code';
  if (
    /数学|证明|公式|推导|例题|math|proof|formula|derivation/.test(text) ||
    outline.workedExampleConfig?.kind === 'math' ||
    outline.workedExampleConfig?.kind === 'proof'
  ) {
    return 'math';
  }
  if (/表格|对比|比较|table|comparison/.test(text)) return 'table';
  if (/过程|步骤|流程|process|step/.test(text)) return 'process';
  if (/例子|案例|example|case/.test(text)) return 'example';
  return 'concept';
}

function chooseHtmlCanvas(
  outline: SceneOutline,
): Pick<HtmlSlidePlanContract, 'canvasMode' | 'canvasHeight'> {
  const textLength = outlineText(outline).length;
  const needsLongFlow =
    outline.workedExampleConfig?.walkthroughSteps?.length ||
    /证明|推导|derivation|proof|call stack|递归|长过程/.test(outlineText(outline));

  if (needsLongFlow) return { canvasMode: 'long', canvasHeight: 2200 };
  if ((outline.keyPoints || []).length > 4 || textLength > 520) {
    return { canvasMode: 'tall', canvasHeight: 1200 };
  }
  return { canvasMode: 'slide', canvasHeight: 900 };
}

function toHtmlSlideSeed(
  outline: SceneOutline,
): HtmlSlideOutlineContract & Pick<HtmlSlidePlanContract, 'contentBudget'> {
  const isSystemCover = isTitleCoverOutline(outline);
  const keyPoints = isSystemCover ? [] : outline.keyPoints || [];
  const mandatoryVisibleContent = isSystemCover ? [] : keyPoints.slice(0, 4);
  const optionalContent = isSystemCover ? [] : keyPoints.slice(4);
  return {
    id: outline.id,
    order: outline.order,
    title: outline.title,
    learnerQuestion: isSystemCover
      ? '这本 notebook 的主题是什么？'
      : outline.studentThinkingMove || outline.teachingObjective || outline.description,
    teachingObjective: isSystemCover
      ? '只建立 notebook 主题识别，不展开正文。'
      : outline.teachingObjective || outline.description,
    keyPoints,
    sourceAnchors: outline.sourceFactIds,
    visualPlan: isSystemCover
      ? '封面页：全幅本地背景图，标题直接叠在背景上；只保留主标题和最多一行短副标题/元信息，不放正文卡片。'
      : outline.layoutIntent?.layoutTemplate || outline.contentProfile
        ? `参考现有教学页面意图：${[outline.contentProfile, outline.layoutIntent?.layoutTemplate]
            .filter(Boolean)
            .join(' / ')}`
        : '使用旧版 HTML/CSS PPT 的正常网格/卡片/图解排版，避免重叠。',
    mandatoryVisibleContent,
    optionalContent,
    contentBudget: {
      visibleCharsMax: 520,
      mainRegions: 3,
      blockCount: 5,
      mustDeleteIfCrowded: optionalContent.length ? optionalContent : ['次要说明', '装饰标签'],
    },
    continuity: {
      fromPrevious: outline.continuity?.previousHandoff,
      pageMove: outline.continuity?.currentJob || outline.description,
      toNext: outline.continuity?.nextHandoff,
    },
  };
}

function toHtmlSlideOutline(outline: SceneOutline): HtmlSlideOutlineContract {
  const { contentBudget: _contentBudget, ...slideOutline } = toHtmlSlideSeed(outline);
  return slideOutline;
}

function toHtmlSlidePlan(outline: SceneOutline): HtmlSlidePlanContract {
  const seed = toHtmlSlideSeed(outline);
  const { teachingObjective, ...slidePlan } = seed;
  return {
    ...slidePlan,
    objective: teachingObjective,
  };
}

function buildNotebookHtmlPlan(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
}): { lessonPlan: HtmlLessonPlanContract; slidePlan: HtmlSlidePlanContract } {
  const totalPages = Math.max(getTeachingPageCount(args.allOutlines), 1);
  const teachingPageOrder = getTeachingPageOrder(args.outline, args.allOutlines);
  const slideBase = toHtmlSlidePlan(args.outline);
  const courseRoute = inferHtmlCourseRoute(args.outline, args.stage);
  const pageKind = inferHtmlPageKind(args.outline, totalPages, teachingPageOrder);
  const canvas = chooseHtmlCanvas(args.outline);
  const coverBackgroundUrl =
    pageKind === 'cover'
      ? pickCoverBackgroundUrl({ courseRoute, outline: args.outline, stage: args.stage })
      : undefined;
  const slidePlan: HtmlSlidePlanContract = {
    ...slideBase,
    order: teachingPageOrder,
    pageKind,
    ...canvas,
    courseRoute,
    coverBackgroundUrl,
    csRoute: courseRoute === 'computer-science' ? inferHtmlCsRoute(args.outline) : undefined,
    mathRoute: courseRoute === 'math' ? inferHtmlMathRoute(args.outline) : undefined,
    density: canvas.canvasMode === 'slide' ? 'standard' : 'dense',
    objective:
      pageKind === 'cover'
        ? '只建立 notebook 主题识别，不展开正文。'
        : args.outline.teachingObjective || args.outline.description,
    sourceCoverage: [args.stage.name, args.outline.description].filter(Boolean),
    sourceUsage: 'adapted',
    sourceUseRationale:
      '正式生成使用旧版 HTML PPT 路线，将当前 notebook outline 压缩为单页教学课件。',
    htmlPrompt: [
      '生成一页旧版 HTML/CSS PPT 课件，不要生成 Syntara Markup，不要生成网页长文阅读页。',
      `本页标题必须是：${args.outline.title}`,
      `本页只完成一个教学动作：${args.outline.description}`,
      '使用正常 CSS grid/flex 文档流；所有正文卡片、底部结论、公式、图示都必须预留空间，不能互相覆盖。',
      '如果内容过密，删除可选说明，而不是缩小到不可读、裁切或重叠。',
      pageKind === 'cover'
        ? `封面背景必须使用这张本地图片：${coverBackgroundUrl}。不要换成固定默认图，也不要只用纯渐变。`
        : '',
    ].join('\n'),
  };
  const slideOutlines = args.allOutlines.map((outline) => ({
    ...toHtmlSlideOutline(outline),
    order: getTeachingPageOrder(outline, args.allOutlines),
  }));
  const teachingOutlines = args.allOutlines.filter(isCountedTeachingOutline);
  const lessonPlan: HtmlLessonPlanContract = {
    lessonTitle: args.stage.name,
    pageCount: totalPages,
    coursePlan: {
      targetLearner: '正在学习本 notebook 的学生。',
      courseGoal: args.stage.description || args.stage.name,
      coreQuestions: teachingOutlines.slice(0, 3).map((outline) => outline.title),
      pacingStrategy: '每页只推进一个教学动作，避免把整段讲稿塞进单页。',
    },
    courseSpine: {
      logline: args.stage.description || args.stage.name,
      centralQuestion: args.stage.name,
      acts: [
        {
          id: 'act-main',
          act: 'development',
          title: args.stage.name,
          purpose: '按 notebook 页面顺序推进核心理解。',
          pages: teachingOutlines.map(
            (outline) => getTeachingPageOrder(outline, args.allOutlines) || 0,
          ),
          keyQuestion: args.outline.teachingObjective || args.outline.title,
        },
      ],
      closingCallback: '回到本 notebook 的核心目标并收束为可执行检查点。',
    },
    slideOutlines,
    slides: args.allOutlines.map((outline) => ({
      ...toHtmlSlidePlan(outline),
      order: getTeachingPageOrder(outline, args.allOutlines),
      pageKind: inferHtmlPageKind(
        outline,
        totalPages,
        getTeachingPageOrder(outline, args.allOutlines),
      ),
      ...chooseHtmlCanvas(outline),
      courseRoute: inferHtmlCourseRoute(outline, args.stage),
      coverBackgroundUrl:
        inferHtmlPageKind(outline, totalPages, getTeachingPageOrder(outline, args.allOutlines)) ===
        'cover'
          ? pickCoverBackgroundUrl({
              courseRoute: inferHtmlCourseRoute(outline, args.stage),
              outline,
              stage: args.stage,
            })
          : undefined,
    })),
  };

  return { lessonPlan, slidePlan };
}

function buildHtmlRouteInstruction(slidePlan: HtmlSlidePlanContract): string {
  return [
    `课程路线：${slidePlan.courseRoute || 'general'}`,
    slidePlan.csRoute ? `CS 版式：${slidePlan.csRoute}` : '',
    slidePlan.mathRoute ? `数学版式：${slidePlan.mathRoute}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sourceImagesFromMedia(args: {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
}): SourceImageAsset[] {
  return (args.pdfImages || [])
    .map((image) => ({
      id: image.id,
      src: image.src || args.imageMapping?.[image.id],
      pageNumber: image.pageNumber,
      description: image.description,
      width: image.width,
      height: image.height,
    }))
    .filter((image) => Boolean(image.id && image.src));
}

function headersInitToRecord(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function buildImageGenerationHeaders(baseHeaders: HeadersInit): Record<string, string> {
  const settings = useSettingsStore.getState();
  const openAiConfig = settings.imageProvidersConfig?.[NOTEBOOK_IMAGE2_PROVIDER_ID];
  const currentProviderId = settings.imageProviderId || NOTEBOOK_IMAGE2_PROVIDER_ID;
  const useNotebookImage2 =
    currentProviderId === NOTEBOOK_IMAGE2_PROVIDER_ID ||
    Boolean(openAiConfig?.isServerConfigured || openAiConfig?.apiKey?.trim());
  const providerId = useNotebookImage2 ? NOTEBOOK_IMAGE2_PROVIDER_ID : currentProviderId;
  const providerConfig = settings.imageProvidersConfig?.[providerId];
  const trackingHeaders = headersInitToRecord(baseHeaders);

  return {
    'Content-Type': 'application/json',
    'x-image-provider': providerId,
    'x-image-model':
      providerId === NOTEBOOK_IMAGE2_PROVIDER_ID
        ? NOTEBOOK_IMAGE2_MODEL_ID
        : settings.imageModelId || '',
    'x-api-key': providerConfig?.apiKey || '',
    'x-base-url': providerConfig?.baseUrl || '',
    ...(trackingHeaders['x-notebook-generation-session-id']
      ? {
          'x-notebook-generation-session-id': trackingHeaders['x-notebook-generation-session-id'],
        }
      : {}),
    ...(trackingHeaders['x-notebook-generation-task-id']
      ? {
          'x-notebook-generation-task-id': trackingHeaders['x-notebook-generation-task-id'],
        }
      : {}),
    ...(trackingHeaders['x-generation-test-no-charge']
      ? {
          'x-generation-test-no-charge': trackingHeaders['x-generation-test-no-charge'],
        }
      : {}),
  };
}

function imageResultToUrl(result: ImageGenerationResult | undefined): string {
  if (!result) return '';
  if (result.base64) {
    return result.base64.startsWith('data:')
      ? result.base64
      : `data:image/png;base64,${result.base64}`;
  }
  return result.url || '';
}

function compactLine(value: string | undefined, maxLength = 240): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

const GENERATED_FOCUS_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

type SceneActionContextSeed = NonNullable<
  GeneratedSceneContentBundle['actionContextsByOutlineId']
>[string];

function outlineHaystack(outline: SceneOutline, stage?: Stage): string {
  return [
    stage?.name,
    stage?.description,
    outline.title,
    outline.description,
    outline.teachingObjective,
    outline.studentThinkingMove,
    outline.teachingPagePlan?.role,
    outline.teachingPagePlan?.layoutFamily,
    outline.teachingPagePlan?.layoutTemplate,
    outline.workedExampleConfig?.kind,
    outline.workedExampleConfig?.codeSnippet,
    ...(outline.keyPoints || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function isCodeLikeOutline(outline: SceneOutline, stage?: Stage): boolean {
  return /computer|program|code|racket|scheme|function|algorithm|recursion|tree|stack|queue|HTDF|HTDD|代码|函数|程序|递归|算法|数据结构/i.test(
    outlineHaystack(outline, stage),
  );
}

function isMathLikeOutline(outline: SceneOutline, stage?: Stage): boolean {
  return /math|calculus|integral|derivative|proof|formula|theorem|matrix|algebra|set|logic|函数|积分|导数|证明|公式|定理|集合|逻辑|矩阵/i.test(
    outlineHaystack(outline, stage),
  );
}

function generatedFocusShape(args: {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}): PPTElement {
  return {
    id: args.id,
    name: `lecture-focus-generated: ${args.label}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: GENERATED_FOCUS_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function focusRegionToShape(region: ImageNotebookFocusRegion): PPTElement {
  return generatedFocusShape({
    id: region.id,
    label: region.label,
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
}

function generatedImageFocusElements(outline: SceneOutline, stage?: Stage): PPTElement[] {
  if (outline.imageNotebookBrief?.focusRegions?.length) {
    return outline.imageNotebookBrief.focusRegions
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, 6)
      .map(focusRegionToShape);
  }

  const page = String(outline.order || 1).padStart(2, '0');
  const prefix = `${outline.id || 'scene'}-s${page}-lecture-focus-generated`;
  const title = generatedFocusShape({
    id: `${prefix}-title`,
    label: '页面标题与入口问题',
    left: 40,
    top: 24,
    width: 920,
    height: 72,
  });
  const takeaway = generatedFocusShape({
    id: `${prefix}-takeaway`,
    label: '本页收束与转场',
    left: 60,
    top: 488,
    width: 880,
    height: 52,
  });

  if (isCodeLikeOutline(outline, stage)) {
    return [
      title,
      generatedFocusShape({
        id: `${prefix}-code-entry`,
        label: '代码入口、签名或数据定义',
        left: 500,
        top: 118,
        width: 430,
        height: 96,
      }),
      generatedFocusShape({
        id: `${prefix}-code-body`,
        label: '分支、条件或模板结构',
        left: 500,
        top: 225,
        width: 430,
        height: 126,
      }),
      generatedFocusShape({
        id: `${prefix}-code-return`,
        label: '递归调用、helper 调用或返回值',
        left: 500,
        top: 365,
        width: 430,
        height: 92,
      }),
      generatedFocusShape({
        id: `${prefix}-concept-board`,
        label: '左侧概念、例子或执行状态',
        left: 60,
        top: 128,
        width: 400,
        height: 320,
      }),
      takeaway,
    ];
  }

  if (isMathLikeOutline(outline, stage)) {
    return [
      title,
      generatedFocusShape({
        id: `${prefix}-problem-or-definition`,
        label: '定义、题目或已知条件',
        left: 60,
        top: 118,
        width: 880,
        height: 112,
      }),
      generatedFocusShape({
        id: `${prefix}-formula-main`,
        label: '主公式、图像或关键表达式',
        left: 80,
        top: 245,
        width: 840,
        height: 128,
      }),
      generatedFocusShape({
        id: `${prefix}-method-check`,
        label: '推导步骤、判断方法或易错检查',
        left: 80,
        top: 388,
        width: 840,
        height: 76,
      }),
      takeaway,
    ];
  }

  return [
    title,
    generatedFocusShape({
      id: `${prefix}-main-anchor`,
      label: '主概念或核心问题',
      left: 60,
      top: 122,
      width: 880,
      height: 132,
    }),
    generatedFocusShape({
      id: `${prefix}-supporting-evidence`,
      label: '例子、图示或证据区',
      left: 70,
      top: 275,
      width: 860,
      height: 172,
    }),
    takeaway,
  ];
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function elementsFromGeneratedContent(content: unknown): PPTElement[] {
  if (!isRecordValue(content) || !Array.isArray(content.elements)) return [];
  return content.elements.filter(
    (item): item is PPTElement => isRecordValue(item) && typeof item.id === 'string',
  );
}

function stripElementText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function focusLabelForElement(element: PPTElement): string {
  const record = element as PPTElement & { label?: unknown; text?: { content?: unknown } };
  const name = typeof element.name === 'string' ? element.name : '';
  const label = typeof record.label === 'string' ? record.label : '';
  const text =
    element.type === 'text'
      ? stripElementText(element.content)
      : stripElementText(record.text?.content);
  return compactLine(
    label ||
      name.replace(/^lecture-focus-generated:\s*/, '').replace(/^semantic-hit-map:\s*/, '') ||
      text ||
      element.id,
    96,
  );
}

function focusRoleForElement(element: PPTElement, label: string): string {
  const haystack = `${element.id} ${element.name || ''} ${label}`;
  if (/title|标题|入口/.test(haystack)) return 'opening';
  if (/code-entry|signature|purpose|data definition|签名|数据定义|入口/.test(haystack)) {
    return 'code-entry';
  }
  if (/code-body|branch|case|condition|template|分支|条件|模板/.test(haystack)) {
    return 'code-structure';
  }
  if (/recursive|return|helper|递归|返回/.test(haystack)) return 'code-result';
  if (/formula|equation|表达式|公式/.test(haystack)) return 'formula';
  if (/problem|definition|given|题目|定义|已知/.test(haystack)) return 'setup';
  if (/method|check|takeaway|summary|转场|收束|检查|方法/.test(haystack)) return 'takeaway';
  if (/visual|diagram|example|图|例子|证据/.test(haystack)) return 'example-or-visual';
  return element.type;
}

function isPreferredFocusElement(element: PPTElement): boolean {
  const name = element.name || '';
  if (/lecture-focus-generated|semantic-hit-map/i.test(`${element.id} ${name}`)) return true;
  if (element.type === 'latex' || element.type === 'table') return true;
  if (element.type === 'text') {
    const text = stripElementText(element.content);
    return text.length >= 8 && text.length <= 320;
  }
  return false;
}

function buildFocusPlanFromContent(content: unknown): SceneActionFocusPlanItem[] {
  const elements = elementsFromGeneratedContent(content);
  const preferred = elements.filter(isPreferredFocusElement);
  const targets = (
    preferred.length ? preferred : elements.filter((element) => element.type !== 'image')
  ).slice(0, 10);
  return targets.map((element, index) => {
    const label = focusLabelForElement(element);
    return {
      targetId: element.id,
      label,
      role: focusRoleForElement(element, label),
      order: index + 1,
    };
  });
}

function buildNarrationPolicy(outline: SceneOutline, stage?: Stage): SceneActionNarrationPolicy {
  const isCover = isTitleCoverOutline(outline);
  const isImageNotebookTeachingPage = Boolean(outline.imageNotebookBrief && !isCover);
  const minSpeechSegments = isCover
    ? 3
    : isImageNotebookTeachingPage ||
        isCodeLikeOutline(outline, stage) ||
        isMathLikeOutline(outline, stage)
      ? 8
      : 6;
  return {
    minSpeechSegments,
    preferredSpeechSegments: isCover
      ? '封面只建立主题、主问题和进入下一页的期待。'
      : isImageNotebookTeachingPage
        ? '整页图片课件要像老师带着看板书：先聚焦区域，再讲观察、原因、停顿、迁移和下一页过渡；正文页通常 8-16 段。'
        : isCodeLikeOutline(outline, stage)
          ? '代码页要按设计动作慢讲，通常 8-12 段；每段只讲一个签名、例子、模板、分支、递归或返回值判断。'
          : isMathLikeOutline(outline, stage)
            ? '数学页要按题目/定义、关键表达式、每一步依据、最后检查慢讲，通常 8-12 段。'
            : '正文页通常 6-9 段；每段只推进一个观察、例子、比较或收束动作。',
    maxConsecutiveSpeechWithoutFocus: 3,
    requireFocusBeforeSpeech: true,
    requireSpeechAfterFocus: true,
    directAddress: true,
  };
}

function defaultCourseSpine(args: {
  stage: Stage;
  allOutlines: SceneOutline[];
}): SceneActionCourseSpineContext {
  const teachingOutlines = args.allOutlines.filter(isCountedTeachingOutline);
  return {
    logline: args.stage.description || args.stage.name,
    centralQuestion: args.stage.name,
    acts: [
      {
        id: 'act-main',
        act: 'development',
        title: args.stage.name,
        purpose: '按 notebook 页面顺序推进核心理解。',
        pages: teachingOutlines.map(
          (outline) => getTeachingPageOrder(outline, args.allOutlines) || 0,
        ),
        keyQuestion: teachingOutlines[0]?.teachingObjective || teachingOutlines[0]?.title,
      },
    ],
    closingCallback: '回到本 notebook 的核心目标并收束为可执行检查点。',
  };
}

function continuityForActionContext(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  lessonPlan?: HtmlLessonPlanContract;
  slidePlan?: HtmlSlidePlanContract;
}): SceneActionContinuityContext {
  const pageOrder = getTeachingPageOrder(args.outline, args.allOutlines) || args.outline.order || 1;
  const slideContinuity =
    args.slidePlan?.continuity ||
    args.lessonPlan?.slides?.find(
      (slide) => slide.id === args.outline.id || slide.order === pageOrder,
    )?.continuity ||
    args.lessonPlan?.slideOutlines?.find(
      (slide) => slide.id === args.outline.id || slide.order === pageOrder,
    )?.continuity;
  const previous = args.allOutlines.find((outline) => outline.order === args.outline.order - 1);
  const next = args.allOutlines.find((outline) => outline.order === args.outline.order + 1);
  return {
    actId: slideContinuity?.actId,
    rhetoricalRole:
      slideContinuity?.rhetoricalRole ||
      args.outline.teachingRole ||
      args.outline.teachingPagePlan?.role ||
      inferHtmlPageKind(
        args.outline,
        Math.max(getTeachingPageCount(args.allOutlines), 1),
        pageOrder,
      ),
    fromPrevious:
      slideContinuity?.fromPrevious ||
      args.outline.continuity?.previousHandoff ||
      (previous ? `承接上一页「${previous.title}」。` : undefined),
    pageMove:
      slideContinuity?.pageMove ||
      args.outline.continuity?.currentJob ||
      args.outline.teachingObjective ||
      args.outline.description,
    toNext:
      slideContinuity?.toNext ||
      args.outline.continuity?.nextHandoff ||
      (next ? `交给下一页「${next.title}」。` : undefined),
    callbackToSpine:
      slideContinuity?.callbackToSpine ||
      args.lessonPlan?.courseSpine?.centralQuestion ||
      args.lessonPlan?.courseSpine?.closingCallback,
  };
}

function buildSceneActionContextSeed(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  content?: unknown;
  lessonPlan?: HtmlLessonPlanContract;
  slidePlan?: HtmlSlidePlanContract;
}): SceneActionContextSeed {
  const imageBrief = args.outline.imageNotebookBrief;
  const imageCourseSpine = args.outline.imageNotebookCourseSpine;
  return {
    courseSpine: imageCourseSpine || args.lessonPlan?.courseSpine || defaultCourseSpine(args),
    continuity: imageBrief
      ? {
          fromPrevious: imageBrief.pageMove.fromPrevious,
          pageMove: imageBrief.pageMove.currentJob,
          toNext: imageBrief.pageMove.toNext,
          callbackToSpine: imageBrief.pageMove.callbackToSpine || imageCourseSpine?.centralQuestion,
        }
      : continuityForActionContext(args),
    focusPlan: args.content
      ? buildFocusPlanFromContent(args.content)
      : imageBrief?.focusRegions.map((region) => ({
          targetId: region.id,
          label: region.label,
          role: region.role,
          order: region.order,
        })),
    narrationPolicy: buildNarrationPolicy(args.outline, args.stage),
  };
}

function formatImageSourceHints(images: SourceImageAsset[]): string {
  if (images.length === 0) return 'No source images are available for this page.';
  return images
    .slice(0, 4)
    .map((image, index) =>
      [
        `${index + 1}. id=${image.id}`,
        image.pageNumber ? `source page=${image.pageNumber}` : '',
        image.description ? `description=${compactLine(image.description, 160)}` : '',
        image.width && image.height ? `size=${image.width}x${image.height}` : '',
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join('\n');
}

function formatWorkedExampleForImagePrompt(outline: SceneOutline): string {
  const cfg = outline.workedExampleConfig;
  if (!cfg) return '';
  return [
    `Worked example role: ${cfg.role}`,
    cfg.problemStatement ? `Problem: ${compactLine(cfg.problemStatement, 360)}` : '',
    cfg.givens?.length ? `Givens: ${cfg.givens.join('; ')}` : '',
    cfg.asks?.length ? `Goal: ${cfg.asks.join('; ')}` : '',
    cfg.solutionPlan?.length ? `Solution plan: ${cfg.solutionPlan.join('; ')}` : '',
    cfg.walkthroughSteps?.length ? `Walkthrough: ${cfg.walkthroughSteps.join('; ')}` : '',
    cfg.commonPitfalls?.length ? `Pitfalls: ${cfg.commonPitfalls.join('; ')}` : '',
    cfg.finalAnswer ? `Final answer: ${cfg.finalAnswer}` : '',
    cfg.codeSnippet ? `Code snippet: ${compactLine(cfg.codeSnippet, 420)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildNotebookImagePrompt(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  assignedSourceImages: SourceImageAsset[];
}): string {
  if (args.outline.imageNotebookPromptPlan?.compiledImagePrompt) {
    return args.outline.imageNotebookPromptPlan.compiledImagePrompt;
  }
  if (args.outline.imageNotebookBrief) {
    const promptPlanLanguage =
      args.outline.language || (args.stage.language === 'en-US' ? 'en-US' : 'zh-CN');
    return buildImageNotebookPromptPlan({
      outline: args.outline,
      allOutlines: args.allOutlines,
      notebookTitle: args.stage.name,
      notebookGoal: args.stage.description,
      language: promptPlanLanguage,
      stylePrompt: args.stage.style || args.stage.description,
      styleBrief: args.stage.imageNotebookStyle,
      sourceImageHints: formatImageSourceHints(args.assignedSourceImages),
    }).compiledImagePrompt;
  }

  const { outline, allOutlines, stage } = args;
  const language = outline.language || stage.language || 'zh-CN';
  const pageIndex = Math.max(
    1,
    allOutlines.findIndex((item) => item.id === outline.id) + 1 || outline.order || 1,
  );
  const totalPages = Math.max(allOutlines.length, pageIndex);
  const surroundingTitles = allOutlines
    .slice(Math.max(0, pageIndex - 3), Math.min(allOutlines.length, pageIndex + 2))
    .map((item) => `${item.order}. ${item.title}`)
    .join('\n');
  const workedExample = formatWorkedExampleForImagePrompt(outline);
  const imageBrief = outline.imageNotebookBrief;
  const quiz = outline.quizConfig
    ? [
        `Quiz page: ${outline.quizConfig.questionCount} question(s)`,
        `Difficulty: ${outline.quizConfig.difficulty}`,
        `Question types: ${outline.quizConfig.questionTypes.join(', ')}`,
      ].join('\n')
    : '';

  return [
    'Create one polished 16:9 classroom PPT slide as a single bitmap image.',
    'The image is one live teaching moment in the notebook, not a decorative illustration and not a teacher handout.',
    'The slide must contain only student-facing board content directly in the image.',
    'Use the selected or authoritative drawing style as the primary visual direction while keeping the page readable, sparse, and projector-safe.',
    '',
    IMAGE_FIRST_NOTEBOOK_STYLE_SPEC,
    '',
    `Notebook: ${stage.name}`,
    stage.description ? `Notebook goal: ${compactLine(stage.description, 320)}` : '',
    `Page ${pageIndex} of ${totalPages}`,
    `Language for visible text: ${language}`,
    `Page title: ${outline.title}`,
    `Page purpose: ${compactLine(outline.description, 420)}`,
    outline.teachingObjective
      ? `Teaching objective: ${compactLine(outline.teachingObjective, 360)}`
      : '',
    outline.studentThinkingMove
      ? `Student thinking move: ${compactLine(outline.studentThinkingMove, 260)}`
      : '',
    'Planning-context labels above are NOT visible slide headings. Do not copy labels like Page purpose, Teaching objective, Student thinking move, Required visible content, or Student-facing live page brief onto the image.',
    imageBrief
      ? `\nStudent-facing live page brief:\n${formatImageNotebookBriefForPrompt(imageBrief)}`
      : '',
    '',
    'Required visible content:',
    ...(outline.keyPoints || []).slice(0, 5).map((point, index) => `${index + 1}. ${point}`),
    workedExample ? `\n${workedExample}` : '',
    quiz ? `\n${quiz}` : '',
    '',
    'Nearby notebook sequence:',
    surroundingTitles || outline.title,
    '',
    'Available source-image hints:',
    formatImageSourceHints(args.assignedSourceImages),
    '',
    'Design requirements:',
    '- Use a strong handwritten-style title, one live question/setup area, and one visual/diagram/problem/worked-example area. A small bottom "next thought" strip is allowed.',
    '- The board should feel like the teacher is saying "look here first, now try this next", not like a complete after-class summary sheet.',
    '- Avoid overview grids, checklist-heavy layouts, and many boxed mini-sections. Do not draw more than 3 main parent regions unless the page is explicitly a summary.',
    '- Visible headings should be student-facing: "我们已知什么？", "先判断什么？", "下一步怎么来？", "试一试".',
    '- Do not write teacher-planning labels or sentences on the slide: "让学生看到", "让学生理解", "教学目标", "本页主线", "可迁移动作", "讲解重点", "Page role", "Teacher move", "QA checklist".',
    '- This must look like a generated classroom board image, not SVG, not HTML, not a screenshot, and not a programmatic layout exported to PNG.',
    '- Text must be large, readable, and sparse enough for a projected slide; do not create paragraphs of tiny text.',
    '- Prefer board-like diagrams, arrows, tables, code traces, formulas, or worked-example structure when they fit the topic.',
    '- For math pages, show the problem, the next student decision, the main formula/derivation, and a quick check as separate hand-drawn regions.',
    '- For hook/overview pages, do not solve everything. Show a concrete question, why the old method is not enough, and the next question students should ask.',
    '- For CS pages, show the data/idea, code or trace, and result/state as separate hand-drawn regions.',
    '- Preserve mathematical notation, code identifiers, and domain vocabulary accurately.',
    '- For proof/math pages, never invent or alter formulas; copy every required formula and proof step exactly from the teacher page brief.',
    '- Do not include browser chrome, UI mockup frames, watermarks, stock-photo clutter, plain corporate cards, or placeholder text.',
    '- Do not mention that this was generated by AI.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFullPageImageSlideContent(args: {
  imageUrl: string;
  prompt: string;
  outline: SceneOutline;
  stage: Stage;
}): {
  elements: PPTElement[];
  imageNotebookPromptPlan?: SceneOutline['imageNotebookPromptPlan'];
  background: SlideBackground;
  theme: SlideTheme;
  remark: string;
} {
  const imageElementId = `full_page_bitmap_${nanoid(8)}`;
  const focusElements = generatedImageFocusElements(args.outline, args.stage);
  return {
    elements: [
      {
        id: imageElementId,
        type: 'image',
        name: 'full_page_bitmap',
        left: 0,
        top: 0,
        width: 1000,
        height: 562.5,
        rotate: 0,
        fixedRatio: false,
        src: args.imageUrl,
        imageType: 'background',
        lock: true,
      },
      ...focusElements,
    ],
    imageNotebookPromptPlan: args.outline.imageNotebookPromptPlan,
    background: { type: 'solid', color: '#0f172a', respectProfileStyle: false },
    theme: {
      backgroundColor: '#0f172a',
      themeColors: ['#0f172a', '#2563eb', '#14b8a6', '#f59e0b', '#f8fafc'],
      fontColor: '#f8fafc',
      fontName: 'Microsoft YaHei',
    },
    remark: args.prompt,
  };
}

function normalizeSceneGenerationDiagnostics(
  value: unknown,
): SceneGenerationDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const normalizedPipeline = normalizeString(value.pipeline);
  const pipeline: SceneGenerationDiagnostics['pipeline'] =
    normalizedPipeline === 'semantic' ||
    normalizedPipeline === 'legacy' ||
    normalizedPipeline === 'interactive' ||
    normalizedPipeline === 'image' ||
    normalizedPipeline === 'quiz' ||
    normalizedPipeline === 'pbl' ||
    normalizedPipeline === 'unknown'
      ? normalizedPipeline
      : undefined;
  const slideGenerationRoute =
    normalizeString(value.slideGenerationRoute) ??
    (value.slideGenerationRoute === null ? null : undefined);

  return {
    pipeline,
    slideGenerationRoute,
    failureStage: normalizeString(value.failureStage),
    failureReasons: normalizeStringArray(value.failureReasons) ?? [],
    semanticRetryCount: normalizeNumber(value.semanticRetryCount),
    layoutRetryCount: normalizeNumber(value.layoutRetryCount),
    contentFallbackUsed: normalizeBoolean(value.contentFallbackUsed),
    fallbackKind: normalizeString(value.fallbackKind),
    generatedAt: normalizeNumber(value.generatedAt),
  };
}

function buildDiagnosticsByOutlineId(args: {
  rawDiagnosticsByOutlineId: unknown;
  sharedDiagnostics?: SceneGenerationDiagnostics;
  effectiveOutlines: SceneOutline[];
}): Record<string, SceneGenerationDiagnostics> | undefined {
  const output: Record<string, SceneGenerationDiagnostics> = {};
  if (isRecord(args.rawDiagnosticsByOutlineId)) {
    for (const [outlineId, value] of Object.entries(args.rawDiagnosticsByOutlineId)) {
      const diagnostics = normalizeSceneGenerationDiagnostics(value);
      if (diagnostics) output[outlineId] = diagnostics;
    }
  }

  if (args.sharedDiagnostics) {
    for (const outline of args.effectiveOutlines) {
      output[outline.id] = output[outline.id] ?? {
        ...args.sharedDiagnostics,
        outlineId: outline.id,
        outlineTitle: outline.title,
      };
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export async function generateSceneContentBundle(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  agents: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  slideGenerationRoute?: SlideGenerationRoute | null;
  imageNotebookMaxAttempts?: number;
  getHeaders?: () => HeadersInit;
}): Promise<GeneratedSceneContentBundle> {
  const normalizedOutline = normalizeComputerScienceSceneOutline(args.outline);
  const normalizedAllOutlines = args.allOutlines.map(normalizeComputerScienceSceneOutline);
  const suggestedIds = normalizedOutline.suggestedImageIds || [];
  const filteredPdfImages =
    suggestedIds.length > 0
      ? (args.pdfImages || []).filter((image) => suggestedIds.includes(image.id))
      : undefined;
  const basePayload = {
    outline: normalizedOutline,
    allOutlines: normalizedAllOutlines,
    stageInfo: {
      name: args.stage.name,
      description: args.stage.description,
      language: args.stage.language,
      style: args.stage.style,
    },
    stageId: args.stage.id,
    agents: args.agents,
    courseContext: args.courseContext,
    slideGenerationRoute: args.slideGenerationRoute,
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: filteredPdfImages,
    imageMapping: args.imageMapping,
    preferredImageIds: suggestedIds,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  const headers = (args.getHeaders ?? (() => getApiHeaders()))();

  if (args.slideGenerationRoute === 'image-ppt') {
    const assignedSourceImages = sourceImagesFromMedia({
      pdfImages: budgetedMedia.pdfImages,
      imageMapping: budgetedMedia.imageMapping || args.imageMapping,
    });
    const baseImagePrompt = buildNotebookImagePrompt({
      outline: normalizedOutline,
      allOutlines: normalizedAllOutlines,
      stage: args.stage,
      assignedSourceImages,
    });
    const imageHeaders = buildImageGenerationHeaders(headers);
    const imagePrompt = baseImagePrompt;
    const imageResp = await backendFetch('/api/generate/image', {
      method: 'POST',
      headers: imageHeaders,
      body: JSON.stringify({
        prompt: imagePrompt,
        aspectRatio: '16:9',
        notebookContext: {
          id: args.stage.id,
          name: args.stage.name,
          courseId: args.stage.courseId,
          sceneId: normalizedOutline.id,
          sceneTitle: normalizedOutline.title,
          sceneOrder: normalizedOutline.order,
          sceneType: normalizedOutline.type,
        },
      }),
      signal: args.signal,
    });

    if (!imageResp.ok) {
      const responseLanguage: 'zh-CN' | 'en-US' =
        args.stage.language === 'en-US' ? 'en-US' : 'zh-CN';
      const fallback =
        responseLanguage === 'en-US' ? 'PPT image page generation failed' : 'PPT 图片页生成失败';
      const message = await readApiErrorMessage(imageResp, fallback);
      throw new Error(message || fallback);
    }

    const imageData = (await imageResp.json().catch(() => ({}))) as {
      success?: boolean;
      result?: ImageGenerationResult;
      error?: string;
    };
    const imageResult = imageData.result;
    const imageUrl = imageResultToUrl(imageResult);
    if (!imageData.success || !imageResult || !imageUrl) {
      throw new Error(imageData.error || 'PPT 图片页生成失败：响应里没有可展示的图片');
    }

    const effectiveOutline: SceneOutline = {
      ...normalizedOutline,
      imageNotebookBrief: normalizedOutline.imageNotebookBrief,
      type: 'slide',
    };
    const diagnostics: SceneGenerationDiagnostics = {
      pipeline: 'image',
      slideGenerationRoute: 'image-ppt',
      generatedAt: Date.now(),
    };
    const allOutlinesForActions = normalizedAllOutlines.map((outline) =>
      outline.id === effectiveOutline.id ? effectiveOutline : outline,
    );

    const imageContent = buildFullPageImageSlideContent({
      imageUrl,
      prompt: imagePrompt,
      outline: effectiveOutline,
      stage: args.stage,
    });

    return {
      contents: [imageContent],
      effectiveOutlines: [effectiveOutline],
      allOutlinesForActions,
      generationDiagnostics: diagnostics,
      contentDiagnosticsByOutlineId: {
        [effectiveOutline.id]: {
          ...diagnostics,
          outlineId: effectiveOutline.id,
          outlineTitle: effectiveOutline.title,
        },
      },
      actionContextsByOutlineId: {
        [effectiveOutline.id]: buildSceneActionContextSeed({
          outline: effectiveOutline,
          allOutlines: allOutlinesForActions,
          stage: args.stage,
          content: imageContent,
        }),
      },
    };
  }

  if (args.slideGenerationRoute === 'html-ppt' && normalizedOutline.type === 'slide') {
    const { lessonPlan, slidePlan } = buildNotebookHtmlPlan({
      outline: normalizedOutline,
      allOutlines: normalizedAllOutlines,
      stage: args.stage,
    });
    const htmlPrompt = buildHtmlSlidePromptFromPlan(slidePlan, lessonPlan, {
      heading: '--- Notebook HTML PPT slide contract ---',
      includeCoverVisualContract: true,
      routeInstruction: buildHtmlRouteInstruction(slidePlan),
    });
    const assignedSourceImages = sourceImagesFromMedia({
      pdfImages: budgetedMedia.pdfImages,
      imageMapping: budgetedMedia.imageMapping || args.imageMapping,
    });
    const htmlResp = await backendFetch('/api/generate/html-ppt-slide', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: htmlPrompt,
        lessonPlan,
        slidePlan,
        pageKind: slidePlan.pageKind,
        canvasMode: getHtmlSlideCanvasMode(slidePlan),
        canvasHeight: getHtmlSlideCanvasHeight(slidePlan),
        courseRoute: slidePlan.courseRoute,
        csRoute: slidePlan.csRoute,
        mathRoute: slidePlan.mathRoute,
        codeRoute:
          slidePlan.csRoute === 'memory-diagram'
            ? 'memory-trace'
            : slidePlan.csRoute === 'execution-trace'
              ? 'execution-trace'
              : undefined,
        densityContract: buildHtmlSlideDensityContract(slidePlan, {
          includeCoverVisualContract: true,
        }),
        assignedSourceImages,
        sourceImageMapping: budgetedMedia.imageMapping || args.imageMapping,
      }),
      signal: args.signal,
    });

    if (!htmlResp.ok) {
      const responseLanguage: 'zh-CN' | 'en-US' =
        args.stage.language === 'en-US' ? 'en-US' : 'zh-CN';
      const fallback =
        responseLanguage === 'en-US' ? 'HTML PPT slide generation failed' : 'HTML PPT 页面生成失败';
      const message = await readApiErrorMessage(htmlResp, fallback);
      throw new Error(message || fallback);
    }

    const htmlData = (await htmlResp.json().catch(() => ({}))) as {
      success?: boolean;
      html?: string;
      error?: string;
    };
    if (!htmlData.success || !htmlData.html) {
      throw new Error(htmlData.error || 'HTML PPT 页面生成失败');
    }

    const effectiveOutline: SceneOutline = {
      ...normalizedOutline,
      type: 'interactive',
      interactiveConfig: {
        conceptName: normalizedOutline.title,
        conceptOverview: normalizedOutline.description,
        designIdea: '旧版 HTML/CSS PPT 单页以内嵌 iframe 播放。',
        subject: args.stage.name,
      },
    };
    const diagnostics: SceneGenerationDiagnostics = {
      pipeline: 'interactive',
      slideGenerationRoute: 'html-ppt',
      generatedAt: Date.now(),
    };

    return {
      contents: [{ html: htmlData.html }],
      effectiveOutlines: [effectiveOutline],
      allOutlinesForActions: normalizedAllOutlines,
      generationDiagnostics: diagnostics,
      contentDiagnosticsByOutlineId: {
        [effectiveOutline.id]: {
          ...diagnostics,
          outlineId: effectiveOutline.id,
          outlineTitle: effectiveOutline.title,
        },
      },
      actionContextsByOutlineId: {
        [effectiveOutline.id]: buildSceneActionContextSeed({
          outline: effectiveOutline,
          allOutlines: normalizedAllOutlines,
          stage: args.stage,
          content: { html: htmlData.html },
          lessonPlan,
          slidePlan,
        }),
      },
    };
  }

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
    console.warn(
      '[NotebookGeneration] Scene payload still too large, retrying without vision images',
      {
        outlineId: args.outline.id,
        outlineTitle: args.outline.title,
      },
    );
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
  const contents = Array.isArray(contentData.contents)
    ? contentData.contents
    : [contentData.content];
  let effectiveOutlines = Array.isArray(contentData.effectiveOutlines)
    ? contentData.effectiveOutlines
    : [contentData.effectiveOutline || args.outline];
  const allOutlinesForActions =
    effectiveOutlines.length > 1
      ? (() => {
          const spliced = spliceGeneratedOutlines(
            normalizedAllOutlines,
            args.outline.id,
            effectiveOutlines,
          );
          effectiveOutlines = spliced.effectiveOutlines;
          return spliced.outlines;
        })()
      : normalizedAllOutlines;
  const generationDiagnostics = normalizeSceneGenerationDiagnostics(
    contentData.generationDiagnostics,
  );
  const contentDiagnosticsByOutlineId = buildDiagnosticsByOutlineId({
    rawDiagnosticsByOutlineId: contentData.generationDiagnosticsByOutlineId,
    sharedDiagnostics: generationDiagnostics,
    effectiveOutlines,
  });
  const actionContextsByOutlineId = Object.fromEntries(
    effectiveOutlines.map((outline: SceneOutline, index: number) => [
      outline.id,
      buildSceneActionContextSeed({
        outline,
        allOutlines: allOutlinesForActions,
        stage: args.stage,
        content: contents[index],
      }),
    ]),
  );

  return {
    contents,
    effectiveOutlines,
    allOutlinesForActions,
    generationDiagnostics,
    contentDiagnosticsByOutlineId,
    actionContextsByOutlineId,
  };
}

export async function generateSceneActionsFromContent(args: {
  bundle: GeneratedSceneContentBundle;
  outline: SceneOutline;
  stage: Stage;
  agents: AgentInfo[];
  previousSpeeches: string[];
  userProfile?: string;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  getHeaders?: () => HeadersInit;
}): Promise<{ scenes: Scene[]; effectiveOutlines: SceneOutline[]; previousSpeeches: string[] }> {
  const { contents, effectiveOutlines, allOutlinesForActions } = args.bundle;

  const scenes: Scene[] = [];
  let previousSpeeches = args.previousSpeeches;

  for (let pageIndex = 0; pageIndex < contents.length; pageIndex += 1) {
    const pageOutline = effectiveOutlines[pageIndex] || args.outline;
    const seededActionContext = args.bundle.actionContextsByOutlineId?.[pageOutline.id];
    const actionContext: SceneActionContextSeed = {
      ...buildSceneActionContextSeed({
        outline: pageOutline,
        allOutlines: allOutlinesForActions,
        stage: args.stage,
        content: contents[pageIndex],
      }),
      ...seededActionContext,
      focusPlan: seededActionContext?.focusPlan?.length
        ? seededActionContext.focusPlan
        : buildFocusPlanFromContent(contents[pageIndex]),
    };
    const actionsResp = await backendFetch('/api/generate/scene-actions', {
      method: 'POST',
      headers: (args.getHeaders ?? (() => getApiHeaders()))(),
      body: JSON.stringify({
        outline: pageOutline,
        allOutlines: allOutlinesForActions,
        content: contents[pageIndex],
        stageId: args.stage.id,
        notebookName: args.stage.name,
        agents: args.agents,
        previousSpeeches,
        userProfile: args.userProfile,
        courseContext: args.courseContext,
        actionContext,
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

    const scene = actionsData.scene as Scene;
    const sceneDiagnostics =
      args.bundle.contentDiagnosticsByOutlineId?.[pageOutline.id] ??
      args.bundle.generationDiagnostics;
    if (sceneDiagnostics) {
      scene.generationDiagnostics = {
        ...scene.generationDiagnostics,
        ...sceneDiagnostics,
        outlineId: pageOutline.id,
        outlineTitle: pageOutline.title,
      };
    }
    scenes.push(scene);
    previousSpeeches = Array.isArray(actionsData.previousSpeeches)
      ? actionsData.previousSpeeches
      : previousSpeeches;
  }

  return {
    scenes,
    effectiveOutlines,
    previousSpeeches,
  };
}
