'use client';

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
import type { SlideGenerationRoute } from '@/lib/generation/slide-generation-route';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics, Stage } from '@/lib/types/stage';
import type { SourceImageAsset } from '@/features/ppt-generation/server/html-ppt-slide/types';
import { backendFetch } from '@/lib/utils/backend-api';
import { buildPayloadTooLargeMessage, readApiErrorMessage } from './api-errors';
import { getApiHeaders } from './generation-headers';
import { isCountedTeachingOutline } from './outline-preferences';

export type GeneratedSceneContentBundle = {
  contents: unknown[];
  effectiveOutlines: SceneOutline[];
  allOutlinesForActions: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
  contentDiagnosticsByOutlineId?: Record<string, SceneGenerationDiagnostics>;
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

function getTeachingPageOrder(outline: SceneOutline, allOutlines: SceneOutline[]): number | undefined {
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
    visualPlan:
      isSystemCover
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
          pages: teachingOutlines.map((outline) => getTeachingPageOrder(outline, args.allOutlines) || 0),
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

function normalizeSceneGenerationDiagnostics(
  value: unknown,
): SceneGenerationDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const normalizedPipeline = normalizeString(value.pipeline);
  const pipeline: SceneGenerationDiagnostics['pipeline'] =
    normalizedPipeline === 'semantic' ||
    normalizedPipeline === 'legacy' ||
    normalizedPipeline === 'interactive' ||
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

  return {
    contents,
    effectiveOutlines,
    allOutlinesForActions,
    generationDiagnostics,
    contentDiagnosticsByOutlineId,
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
