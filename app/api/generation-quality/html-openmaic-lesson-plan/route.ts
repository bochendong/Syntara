import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  combineTokenUsage,
  estimateGenerationCost,
  shouldSkipCreditChargeForTestRequest,
  toSafeInt,
} from '../html-lesson-plan/_lib/cost';
import { parsePlan } from '../html-lesson-plan/_lib/normalization';
import {
  inferCsRouteFromText,
  inferCourseRouteFromText,
  normalizeTier,
  tierBounds,
} from '../html-lesson-plan/_lib/routes';
import {
  compactText,
  extractJsonObject,
  sourcePagesForPrompt,
} from '../html-lesson-plan/_lib/source-utils';
import type {
  DensityLevel,
  HtmlCanvasMode,
  HtmlCsRoute,
  HtmlCostEstimate,
  HtmlCourseRoute,
  HtmlMathRoute,
  HtmlPageKind,
  LessonPlan,
  LessonSlidePlan,
  RequestBody,
  SlideContinuity,
  SourcePageInput,
  TokenUsage,
} from '../html-lesson-plan/_lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OpenMaicSceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

type OpenMaicContentBudget = Partial<LessonSlidePlan['contentBudget']>;

type OpenMaicHtmlOutline = {
  id?: string;
  order?: number;
  title?: string;
  type?: OpenMaicSceneType;
  description?: string;
  learnerQuestion?: string;
  teachingObjective?: string;
  keyPoints?: string[];
  sourceCoverage?: string[];
  sourceAnchors?: string[];
  visualPlan?: string;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
  widgetType?: string;
  widgetOutline?: unknown;
  quizConfig?: unknown;
  pageKind?: HtmlPageKind;
  density?: DensityLevel;
  canvasMode?: HtmlCanvasMode;
  mathRoute?: HtmlMathRoute;
  contentBudget?: OpenMaicContentBudget;
  capacityPlan?: OpenMaicContentBudget & {
    capacityRationale?: string;
    layoutBlocks?: string[];
  };
};

type OpenMaicPlanJson = {
  languageDirective?: string;
  lessonTitle?: string;
  targetLearner?: string;
  courseGoal?: string;
  centralQuestion?: string;
  recurringExample?: string;
  visualMotif?: string;
  coreQuestions?: string[];
  outlines?: OpenMaicHtmlOutline[];
  planningNotes?: string[];
};

function toStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === 'string'
      ? Number.parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : undefined;
  const safe = toSafeInt(parsed);
  if (!safe) return fallback;
  return Math.min(max, Math.max(min, safe));
}

function parseOpenMaicPlan(text: string): OpenMaicPlanJson | null {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as unknown;
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const outlines = Array.isArray(record.outlines)
      ? (record.outlines as OpenMaicHtmlOutline[])
      : Array.isArray(parsed)
        ? (parsed as OpenMaicHtmlOutline[])
        : [];
    const validOutlines = outlines.filter((outline) => outline && typeof outline === 'object');
    if (!validOutlines.length) return null;
    return {
      languageDirective:
        typeof record.languageDirective === 'string' ? record.languageDirective : '',
      lessonTitle: typeof record.lessonTitle === 'string' ? record.lessonTitle : '',
      targetLearner: typeof record.targetLearner === 'string' ? record.targetLearner : '',
      courseGoal: typeof record.courseGoal === 'string' ? record.courseGoal : '',
      centralQuestion: typeof record.centralQuestion === 'string' ? record.centralQuestion : '',
      recurringExample: typeof record.recurringExample === 'string' ? record.recurringExample : '',
      visualMotif: typeof record.visualMotif === 'string' ? record.visualMotif : '',
      coreQuestions: toStringArray(record.coreQuestions, 4),
      outlines: validOutlines,
      planningNotes: toStringArray(record.planningNotes, 8),
    };
  } catch {
    return null;
  }
}

function lessonTitleFromInput(body: RequestBody, fileName: string) {
  return compactText(body.title || body.sourcePackage?.subject || body.subject || fileName, 120);
}

function pageKindForOutline(
  outline: OpenMaicHtmlOutline,
  index: number,
  total: number,
): HtmlPageKind {
  if (index === 0) return 'cover';
  if (index === 1) return 'intro';
  if (index === total - 1) return 'summary';
  if (outline.pageKind) return outline.pageKind;
  if (outline.type === 'quiz') return 'example';
  if (outline.type === 'interactive') return 'process';
  const text = [outline.title, outline.description, ...(outline.keyPoints || [])]
    .join('\n')
    .toLowerCase();
  if (
    outline.widgetType === 'code' ||
    /```|<pre|<code|\bclass\s+[a-z_]\w*|\bdef\s+[a-z_]\w*|__init__|self\.|\breturn\b|heap|stack|memory|trace|object field|代码|执行|追踪|内存|堆|栈|对象|属性|字段|方法/.test(
      text,
    )
  ) {
    return 'code';
  }
  if (/证明|prove|proof|推导|derive|derivation|公式|定理|定义|积分|riemann|黎曼|函数/.test(text)) {
    return 'math';
  }
  if (/表格|对比|compare|comparison|case/.test(text)) return 'table';
  if (/例题|example|worked|练习|quiz|测验|checkpoint/.test(text)) return 'example';
  return 'process';
}

function mathRouteForOutline(outline: OpenMaicHtmlOutline, pageKind: HtmlPageKind): HtmlMathRoute {
  if (outline.mathRoute) return outline.mathRoute;
  const text = [outline.title, outline.description, ...(outline.keyPoints || [])]
    .join('\n')
    .toLowerCase();
  if (/证明|proof|prove/.test(text)) return 'proof';
  if (/推导|derivation|derive|极限|limit/.test(text)) return 'derivation';
  if (/例题|example|worked|计算|求/.test(text)) return 'worked-example';
  if (/定义|定理|definition|theorem/.test(text)) return 'definition-theorem';
  if (/对比|判断|比较|left|right|左|右|over|under/.test(text)) return 'comparison-table';
  if (/公式|formula|性质|property|基本定理|ftc/.test(text)) return 'formula-focus';
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

function csRouteForOutline(outline: OpenMaicHtmlOutline, pageKind: HtmlPageKind): HtmlCsRoute {
  const text = [
    outline.title,
    outline.description,
    outline.visualPlan,
    outline.widgetType,
    ...(outline.keyPoints || []),
    ...(outline.mandatoryVisibleContent || []),
    ...(outline.sourceAnchors || []),
  ]
    .filter(Boolean)
    .join('\n');
  if (
    pageKind === 'code' &&
    !/memory|heap|stack|self|object|attribute|field|内存|堆|栈|对象|属性|字段/.test(
      text.toLowerCase(),
    )
  ) {
    return 'execution-trace';
  }
  return inferCsRouteFromText(text);
}

function densityForOutline(outline: OpenMaicHtmlOutline, pageKind: HtmlPageKind): DensityLevel {
  if (pageKind === 'cover' || pageKind === 'intro' || pageKind === 'summary') return 'light';
  if (outline.density && outline.density !== 'dense') return outline.density;
  if (outline.type === 'quiz' || outline.type === 'interactive') return 'standard';
  return (outline.keyPoints?.length || 0) >= 5 ? 'standard' : 'light';
}

function canvasModeForOutline(
  outline: OpenMaicHtmlOutline,
  pageKind: HtmlPageKind,
  mathRoute?: HtmlMathRoute,
): HtmlCanvasMode {
  void outline;
  void pageKind;
  void mathRoute;
  return 'slide';
}

function contentBudgetForOutline(args: {
  outline: OpenMaicHtmlOutline;
  pageKind: HtmlPageKind;
  canvasMode: HtmlCanvasMode;
  density: DensityLevel;
}): LessonSlidePlan['contentBudget'] {
  const { outline, pageKind, canvasMode, density } = args;
  const rawBudget = {
    ...readRecord(outline.contentBudget),
    ...readRecord(outline.capacityPlan),
  };
  const isCover = pageKind === 'cover';
  const isQuiz = outline.type === 'quiz';
  const isInteractive = outline.type === 'interactive';
  const isSlideCanvas = canvasMode === 'slide';
  const isTallCanvas = canvasMode === 'tall';

  const defaultMin = isCover ? 16 : isTallCanvas ? 110 : 48;
  const defaultMax = isCover
    ? 64
    : canvasMode === 'long'
      ? density === 'dense'
        ? 760
        : 620
      : isTallCanvas
        ? density === 'dense'
          ? 420
          : 340
        : density === 'dense'
          ? 200
          : isQuiz || isInteractive
            ? 170
            : pageKind === 'intro' || pageKind === 'summary'
              ? 140
              : 160;
  const maxAllowedChars = isCover ? 80 : canvasMode === 'long' ? 850 : isTallCanvas ? 480 : 220;
  const defaultRegions = isCover ? 1 : isSlideCanvas ? 2 : isTallCanvas ? 3 : 5;
  const defaultBlocks = isCover ? 2 : isSlideCanvas ? (isQuiz ? 3 : 3) : isTallCanvas ? 5 : 8;
  const maxRegions = isCover ? 1 : isSlideCanvas ? 2 : isTallCanvas ? 3 : 5;
  const maxBlocks = isCover ? 2 : isSlideCanvas ? 3 : isTallCanvas ? 5 : 8;
  const visibleCharsMax = boundedInt(
    rawBudget.visibleCharsMax,
    defaultMax,
    Math.max(defaultMin, 40),
    maxAllowedChars,
  );

  const rawDeletePriority = toStringArray(rawBudget.mustDeleteIfCrowded, 6);
  const optionalDeletePriority = toStringArray(outline.optionalContent, 6);
  const mustDeleteIfCrowded = [...rawDeletePriority, ...optionalDeletePriority]
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .slice(0, 6);

  return {
    visibleCharsMin: Math.min(
      visibleCharsMax,
      boundedInt(rawBudget.visibleCharsMin, defaultMin, 20, visibleCharsMax),
    ),
    visibleCharsMax,
    mainRegions: boundedInt(rawBudget.mainRegions, defaultRegions, 1, maxRegions),
    blockCount: boundedInt(rawBudget.blockCount, defaultBlocks, 1, maxBlocks),
    mustDeleteIfCrowded: mustDeleteIfCrowded.length
      ? mustDeleteIfCrowded
      : ['次要说明', '装饰标签', '重复定义', '额外例子'],
  };
}

function maxVisibleItemCount(args: {
  pageKind: HtmlPageKind;
  canvasMode: HtmlCanvasMode;
  contentBudget: LessonSlidePlan['contentBudget'];
}) {
  const { pageKind, canvasMode, contentBudget } = args;
  if (pageKind === 'cover') return 1;
  const byCanvas = canvasMode === 'long' ? 5 : canvasMode === 'tall' ? 4 : 3;
  return Math.max(1, Math.min(byCanvas, contentBudget.blockCount));
}

function compactVisibleItems(
  values: string[],
  maxItems: number,
  maxCharsPerItem: number,
): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => compactText(value, maxCharsPerItem))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, maxItems);
}

function compactSourceAnchors(
  values: string[],
  canvasMode: HtmlCanvasMode,
  contentBudget: LessonSlidePlan['contentBudget'],
): string[] {
  const maxItems = canvasMode === 'slide' ? 1 : Math.min(2, contentBudget.blockCount);
  return compactVisibleItems(values, maxItems, canvasMode === 'slide' ? 90 : 130);
}

function standardCodeBlockRules(args: {
  pageKind: HtmlPageKind;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
}) {
  if (args.courseRoute !== 'computer-science' && args.pageKind !== 'code') return '';
  const required = args.pageKind === 'code' || args.csRoute === 'memory-diagram';
  return [
    required ? '本页必须使用统一代码块组件。' : '如果页面出现代码，必须使用统一代码块组件。',
    '统一代码块组件：左侧白卡标题“关键代码”，内部深色圆角代码面板；必须有独立行号 gutter（1,2,3...）和等宽 code line rows。',
    '代码容量：16:9 单页最多 6-8 行；每行最多约 42 个半角字符；长参数/长字符串必须改成更短的课堂例子或拆到下一页。',
    '代码字号建议 24-30px，line-height 1.35-1.5；禁止超大字体、横向滚动、overflow:hidden 裁切、负 margin、代码跑出面板。',
    '推荐版式：左侧代码面板占 40-48% 宽，右侧放 stack/heap/trace/解释；底部只允许一条短结论条，不能覆盖主内容。',
  ].join('\n');
}

function buildCompactHtmlPrompt(args: {
  lessonTitle: string;
  order: number;
  total: number;
  title: string;
  pageKind: HtmlPageKind;
  canvasMode: HtmlCanvasMode;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  objective: string;
  learnerQuestion: string;
  keyPoints: string[];
  sourceAnchors: string[];
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
  contentBudget: LessonSlidePlan['contentBudget'];
}) {
  const visibleItems = compactVisibleItems(
    args.mandatoryVisibleContent.length ? args.mandatoryVisibleContent : args.keyPoints,
    maxVisibleItemCount({
      pageKind: args.pageKind,
      canvasMode: args.canvasMode,
      contentBudget: args.contentBudget,
    }),
    args.canvasMode === 'slide' ? 48 : 76,
  );
  const visibleLine = visibleItems.length
    ? visibleItems.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : `1. ${compactText(args.objective, 48)}`;
  const deletable = compactVisibleItems(
    [...args.optionalContent, ...args.contentBudget.mustDeleteIfCrowded],
    4,
    32,
  );
  return [
    '生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面；不要做长页面、滚动页或讲义页。',
    `页面标题必须逐字显示：${args.title}`,
    `第 ${args.order} 页 / 共 ${args.total} 页。`,
    `Notebook/课程：${args.lessonTitle}（仅作为上下文，不要作为大段可见文字）。`,
    `课程路线：${args.courseRoute}${args.csRoute ? `；CS 版式：${args.csRoute}` : ''}${args.mathRoute ? `；数学版式：${args.mathRoute}` : ''}。`,
    `本页唯一教学动作：${compactText(args.objective, 82)}`,
    `学生问题：${compactText(args.learnerQuestion, 60)}（可作为极短副标题，也可不显示）。`,
    '优先围绕下面这些知识点/短块组织页面；可以为了讲明白换成更清楚的极短例子，不要硬搬 source 标签或第二主题：',
    visibleLine,
    args.sourceAnchors.length
      ? `知识参考锚点（只作范围/术语参考，不必照搬原例子，也不要显示“源材料锚点”字样）：${args.sourceAnchors.join('；')}`
      : '',
    `视觉方式：${compactText(args.visualPlan, 92)}`,
    standardCodeBlockRules(args),
    `容量硬限制：最多 ${args.contentBudget.mainRegions} 个主内容区、${args.contentBudget.blockCount} 个内容块、${args.contentBudget.visibleCharsMax} 个中文/等价字符。`,
    deletable.length ? `拥挤时先删：${deletable.join('、')}。` : '',
    '画面禁止出现这些元信息文字：Notebook、课程路线、页面类型、density、sourceAnchors、continuity、capacityPlan、contentBudget、sourceUseRationale、prompt。',
    '如果内容仍然放不下，删掉最弱短块或把文字改成短标签；不要缩到不可读，不要重叠，不要裁切，不要内部滚动。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildOpenMaicPromptContract(slide: LessonSlidePlan, compactPrompt: string): string {
  const pageRole =
    slide.pageKind === 'cover'
      ? '封面页只保留主标题、极短副标题和 full-bleed 本地背景/主视觉。'
      : slide.pageKind === 'intro'
        ? '导入页只给学习入口和路线，不展开完整定义或例题。'
        : slide.pageKind === 'summary'
          ? '总结页只收束已讲内容，不新增新知识点。'
          : '正文页只完成一个教学动作。';
  return [
    compactPrompt,
    '',
    '新版 OpenMAIC/HTML 容量契约：',
    `- ${pageRole}`,
    `- 可见文字总量必须控制在 ${slide.contentBudget.visibleCharsMax} 个中文/等价字符以内。`,
    `- 最多 ${slide.contentBudget.mainRegions} 个主内容区、${slide.contentBudget.blockCount} 个内容块；内容块宁可少，不要为了填满而增加解释。`,
    '- 围绕短块讲清知识点；可以把源文件里的例子改写成更清楚的极短课堂例子，但不要渲染 Notebook、课程路线、sourceAnchors、continuity、capacity、sourceUseRationale、prompt 这些规划元信息。',
    '- 不要新增完整讲稿、QA 面板或第二主题；如果换例子，只换成本页知识点的最小例子。',
    standardCodeBlockRules({
      pageKind: slide.pageKind,
      courseRoute: slide.courseRoute,
      csRoute: slide.csRoute,
    }),
    '- 如果拥挤，删除可删内容或缩成短标签；不要重叠、裁切、内部滚动、负坐标或 footer 覆盖。',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 3600);
}

function replaceWithCompactPrompts(plan: LessonPlan, record: ReturnType<typeof buildLessonRecord>) {
  const promptById = new Map(record.slides.map((slide) => [slide.id, slide.htmlPrompt]));
  return {
    ...plan,
    slides: plan.slides.map((slide) => {
      const compactPrompt = promptById.get(slide.id) || slide.htmlPrompt;
      return {
        ...slide,
        htmlPrompt: buildOpenMaicPromptContract(slide, compactPrompt),
      };
    }),
  };
}

function continuityForOutline(args: {
  outline: OpenMaicHtmlOutline;
  index: number;
  total: number;
  centralQuestion: string;
  previousTitle: string;
  nextTitle: string;
}): SlideContinuity {
  const { outline, index, total, centralQuestion, previousTitle, nextTitle } = args;
  const order = index + 1;
  const role: SlideContinuity['rhetoricalRole'] =
    index === 0
      ? 'opening'
      : index === 1
        ? 'setup'
        : index === total - 1
          ? 'callback'
          : outline.type === 'quiz'
            ? 'turn'
            : /例|example|worked|练习/.test(outline.title || '')
              ? 'example'
              : order >= Math.ceil(total * 0.72)
                ? 'synthesis'
                : 'build';
  const actId =
    index <= 1
      ? 'act-setup'
      : index === total - 1
        ? 'act-synthesis'
        : outline.type === 'quiz'
          ? 'act-checkpoint'
          : 'act-development';
  return {
    actId,
    rhetoricalRole: role,
    fromPrevious:
      index === 0 ? '建立课程主题识别。' : `承接「${compactText(previousTitle, 42)}」。`,
    pageMove: compactText(
      outline.teachingObjective ||
        outline.description ||
        `推进「${outline.title || `第 ${order} 页`}」这一教学动作。`,
      120,
    ),
    toNext: index === total - 1 ? '收束整节课。' : `引出「${compactText(nextTitle, 42)}」。`,
    callbackToSpine: centralQuestion
      ? `回应中心问题：${compactText(centralQuestion, 72)}`
      : '回扣整课主线。',
  };
}

function sourceAnchorsForOutline(outline: OpenMaicHtmlOutline, sourcePages: SourcePageInput[]) {
  const explicit = toStringArray(outline.sourceAnchors, 4);
  if (explicit.length) return explicit;
  const coverage = toStringArray(outline.sourceCoverage, 3);
  if (coverage.length) return coverage;
  const order = typeof outline.order === 'number' ? outline.order : undefined;
  const sourcePage = order ? sourcePages[Math.max(0, order - 1)] : undefined;
  return [
    sourcePage?.concreteAnchor,
    sourcePage?.summary,
    outline.description,
    ...(outline.keyPoints || []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => compactText(value, 220))
    .slice(0, 3);
}

function normalizeOutlineCount(
  rawOutlines: OpenMaicHtmlOutline[],
  bounds: ReturnType<typeof tierBounds>,
  lessonTitle: string,
): OpenMaicHtmlOutline[] {
  const sanitized = rawOutlines
    .map((outline, index) => ({
      ...outline,
      id: outline.id || `slide-${index + 1}`,
      order: index + 1,
      title: compactText(outline.title || `第 ${index + 1} 页`, 120),
      keyPoints: toStringArray(outline.keyPoints, 6),
    }))
    .filter((outline) => outline.title);
  const targetCount = Math.min(bounds.max, Math.max(bounds.min, sanitized.length));
  const selected = sanitized.slice(0, targetCount);
  while (selected.length < targetCount) {
    const nextOrder = selected.length + 1;
    selected.push({
      id: `slide-${nextOrder}`,
      order: nextOrder,
      title: nextOrder === targetCount ? '课程总结与下一步练习' : `补充练习 ${nextOrder}`,
      type: nextOrder === targetCount ? 'slide' : 'quiz',
      description:
        nextOrder === targetCount
          ? `回收「${lessonTitle}」的核心判断并给出复习方向。`
          : '用一个短练习检查前面概念是否真正能迁移。',
      keyPoints:
        nextOrder === targetCount
          ? ['核心定义', '判断规则', '典型计算路径']
          : ['判断条件', '应用步骤', '错误排查'],
    });
  }
  if (selected.length > 0) {
    selected[0] = {
      ...selected[0],
      title: selected[0].title || lessonTitle,
      type: 'slide',
      pageKind: 'cover',
    };
  }
  if (selected.length > 1) {
    selected[1] = {
      ...selected[1],
      type: 'slide',
      pageKind: 'intro',
    };
  }
  if (selected.length > 2) {
    selected[selected.length - 1] = {
      ...selected[selected.length - 1],
      type: 'slide',
      pageKind: 'summary',
    };
  }
  return selected.map((outline, index) => ({
    ...outline,
    id: `slide-${index + 1}`,
    order: index + 1,
  }));
}

function buildActs(total: number) {
  const setupPages = [1, 2].filter((page) => page <= total);
  const checkpointPages = Array.from({ length: total }, (_, index) => index + 1).filter(
    (page) => page > 2 && page < total && page % 4 === 1,
  );
  const developmentPages = Array.from({ length: total }, (_, index) => index + 1).filter(
    (page) => page > 2 && page < total && !checkpointPages.includes(page),
  );
  return [
    {
      id: 'act-setup',
      act: 'setup',
      title: '总：建立问题',
      purpose: '用课程总问题和直觉入口建立学习目标。',
      pages: setupPages,
      keyQuestion: '这节课要解决什么核心问题？',
      visualMotif: '问题入口与学习路径',
    },
    {
      id: 'act-development',
      act: 'development',
      title: '分：展开概念与例子',
      purpose: '把核心概念拆成可观察、可计算、可判断的步骤。',
      pages: developmentPages,
      keyQuestion: '每个定义或公式到底服务哪个判断？',
      visualMotif: '概念结构、公式、例题与对比',
    },
    {
      id: 'act-checkpoint',
      act: 'turn',
      title: '转：阶段检查',
      purpose: '用短测或练习检查学生是否能迁移刚学的判断。',
      pages: checkpointPages,
      keyQuestion: '我能不能自己判断下一题该怎么做？',
      visualMotif: 'checkpoint 与错误排查',
    },
    {
      id: 'act-synthesis',
      act: 'synthesis',
      title: '总：回收主线',
      purpose: '把整节课回收到少数可复习的判断和行动步骤。',
      pages: [total],
      keyQuestion: '学完之后下一次看到同类题该先想什么？',
      visualMotif: 'takeaway 与复习路线',
    },
  ];
}

function buildLessonRecord(args: {
  body: RequestBody;
  effectiveFileName: string;
  effectiveFileType: string;
  routeHint: HtmlCourseRoute;
  sourcePages: SourcePageInput[];
  tier: ReturnType<typeof normalizeTier>;
  openMaicPlan: OpenMaicPlanJson;
}) {
  const { body, effectiveFileName, effectiveFileType, routeHint, sourcePages, tier, openMaicPlan } =
    args;
  const bounds = tierBounds(tier);
  const lessonTitle = compactText(
    openMaicPlan.lessonTitle || lessonTitleFromInput(body, effectiveFileName),
    120,
  );
  const outlines = normalizeOutlineCount(openMaicPlan.outlines || [], bounds, lessonTitle);
  const total = outlines.length;
  const centralQuestion = compactText(
    openMaicPlan.centralQuestion ||
      openMaicPlan.coreQuestions?.[0] ||
      `如何掌握「${lessonTitle}」的核心判断？`,
    220,
  );
  const coreQuestions = openMaicPlan.coreQuestions || [];

  const slides = outlines.map((outline, index) => {
    const pageKind = pageKindForOutline(outline, index, total);
    const density = densityForOutline(outline, pageKind);
    const courseRoute = routeHint;
    const csRoute =
      courseRoute === 'computer-science' ? csRouteForOutline(outline, pageKind) : undefined;
    const mathRoute = courseRoute === 'math' ? mathRouteForOutline(outline, pageKind) : undefined;
    const canvasMode = canvasModeForOutline(outline, pageKind, mathRoute);
    const contentBudget = contentBudgetForOutline({ outline, pageKind, canvasMode, density });
    const itemLimit = maxVisibleItemCount({ pageKind, canvasMode, contentBudget });
    const rawSourceAnchors = sourceAnchorsForOutline(outline, sourcePages);
    const sourceAnchors = compactSourceAnchors(rawSourceAnchors, canvasMode, contentBudget);
    const keyPoints = compactVisibleItems(
      outline.keyPoints?.length
        ? outline.keyPoints
        : [outline.description || outline.title || lessonTitle].filter(Boolean),
      itemLimit,
      canvasMode === 'slide' ? 46 : 72,
    );
    const previousTitle = outlines[index - 1]?.title || lessonTitle;
    const nextTitle = outlines[index + 1]?.title || '课程总结';
    const continuity = continuityForOutline({
      outline,
      index,
      total,
      centralQuestion,
      previousTitle,
      nextTitle,
    });
    const isQuiz = outline.type === 'quiz';
    const isInteractive = outline.type === 'interactive';
    const mandatoryVisibleContent = compactVisibleItems(
      toStringArray(outline.mandatoryVisibleContent, 8),
      itemLimit,
      canvasMode === 'slide' ? 48 : 76,
    );
    const optionalContent = compactVisibleItems(toStringArray(outline.optionalContent, 6), 4, 36);
    const objective = compactText(
      outline.teachingObjective || outline.description || `理解 ${outline.title}`,
      canvasMode === 'slide' ? 120 : 180,
    );
    const learnerQuestion = compactText(
      outline.learnerQuestion ||
        (isQuiz
          ? '我能独立完成这个阶段判断吗？'
          : isInteractive
            ? '拖动/比较后，哪个规律会变得更明显？'
            : `为什么要学习「${outline.title}」？`),
      canvasMode === 'slide' ? 90 : 140,
    );
    const visualPlan = compactText(
      outline.visualPlan ||
        (isInteractive
          ? `把 ${outline.widgetType || 'simulation'} 交互思想转成静态 HTML 教学板：左侧参数/状态，右侧观察结论。`
          : isQuiz
            ? '用题目卡、判断选项和错误排查区做阶段检查。'
            : '用可编辑 DOM 结构呈现本页关键判断。'),
      canvasMode === 'slide' ? 120 : 180,
    );
    const visibleContent = mandatoryVisibleContent.length
      ? mandatoryVisibleContent
      : keyPoints.slice(0, itemLimit);
    const optionalForSlide = optionalContent.length
      ? optionalContent
      : ['邻近上下文', '装饰标签', '额外解释'];
    return {
      id: `slide-${index + 1}`,
      order: index + 1,
      title: outline.title || `第 ${index + 1} 页`,
      pageKind,
      canvasMode,
      courseRoute,
      csRoute,
      mathRoute,
      density,
      objective,
      learnerQuestion,
      keyPoints,
      sourceCoverage: toStringArray(outline.sourceCoverage, 5).length
        ? compactVisibleItems(toStringArray(outline.sourceCoverage, 5), 2, 70)
        : sourceAnchors.slice(0, 2),
      sourceAnchors,
      sourceImageIds: [],
      sourceUseRationale: compactText(
        `第 ${index + 1} 页以讲清知识点为主；源材料只限定范围和术语，可改写或替换成更清楚的极短例子。源文件类型：${effectiveFileType}。`,
        120,
      ),
      continuity,
      visualPlan,
      mandatoryVisibleContent: visibleContent,
      optionalContent: optionalForSlide,
      sourceUsage: isQuiz || isInteractive ? 'new-example' : 'synthesis',
      contentBudget: {
        ...contentBudget,
      },
      htmlPrompt: buildCompactHtmlPrompt({
        lessonTitle,
        order: index + 1,
        total,
        title: outline.title || `第 ${index + 1} 页`,
        pageKind,
        canvasMode,
        courseRoute,
        csRoute,
        mathRoute,
        density,
        objective,
        learnerQuestion,
        keyPoints,
        sourceAnchors,
        visualPlan,
        mandatoryVisibleContent: visibleContent,
        optionalContent: optionalForSlide,
        contentBudget,
      }),
    };
  });

  return {
    lessonTitle,
    pageCountTier: tier,
    pageCount: slides.length,
    coursePlan: {
      targetLearner:
        openMaicPlan.targetLearner ||
        (body.subject ? `正在学习 ${body.subject} 的学生` : '正在复习该文件的学习者'),
      courseGoal:
        openMaicPlan.courseGoal || `围绕「${lessonTitle}」建立可迁移的概念判断和例题步骤。`,
      prerequisiteAssumptions: ['已读过或准备配合阅读源材料', '需要把讲义内容转成可复习的判断路径'],
      coreQuestions:
        coreQuestions.length >= 2
          ? coreQuestions
          : [centralQuestion, '哪些概念需要通过例子和检查点来确认？'],
      sourceDigest: [
        `源文件：${effectiveFileName}`,
        openMaicPlan.languageDirective
          ? `语言策略：${compactText(openMaicPlan.languageDirective, 160)}`
          : '',
      ].filter(Boolean),
      pacingStrategy: '先用 OpenMAIC 式整课大纲确定教学顺序，再逐页交给旧 HTML 链路渲染。',
    },
    courseSpine: {
      logline:
        openMaicPlan.courseGoal || `把「${lessonTitle}」从源材料转成一条问题驱动的可复习学习路径。`,
      openingHook: centralQuestion,
      centralQuestion,
      acts: buildActs(slides.length),
      recurringExample:
        openMaicPlan.recurringExample ||
        outlines.find((outline) => outline.type === 'interactive')?.title ||
        lessonTitle,
      visualMotif: openMaicPlan.visualMotif || '问题入口、对比观察、阶段检查、总结回扣',
      closingCallback: `回到开场问题：${centralQuestion}`,
    },
    slideOutlines: slides.map((slide) => ({
      id: slide.id,
      order: slide.order,
      title: slide.title,
      canvasMode: slide.canvasMode,
      learnerQuestion: slide.learnerQuestion,
      teachingObjective: slide.objective,
      keyPoints: slide.keyPoints,
      sourceAnchors: slide.sourceAnchors,
      sourceImageIds: [],
      sourceUseRationale: slide.sourceUseRationale,
      continuity: slide.continuity,
      visualPlan: slide.visualPlan,
      mandatoryVisibleContent: slide.mandatoryVisibleContent,
      optionalContent: slide.optionalContent,
    })),
    planningNotes: [
      'Planner: OpenMAIC-style whole-lesson outline first, strict per-page capacity contract second, old HTML slide renderer third.',
      ...(openMaicPlan.planningNotes || []),
    ].slice(0, 8),
    slides,
  };
}

function buildOpenMaicPlanningPrompt(args: {
  body: RequestBody;
  effectiveFileName: string;
  effectiveFileType: string;
  routeHint: HtmlCourseRoute;
  bounds: ReturnType<typeof tierBounds>;
  sourcePages: SourcePageInput[];
  sourceText: string;
}) {
  const { body, effectiveFileName, effectiveFileType, routeHint, bounds, sourcePages, sourceText } =
    args;
  const title = lessonTitleFromInput(body, effectiveFileName);
  const system = [
    'You are an OpenMAIC-style course architect and HTML deck planner.',
    'Use the OpenMAIC whole-lesson idea: first decide the teaching spine, then scene order, then scene type. Do not write HTML and do not write narration.',
    'Your output will be adapted into the existing static HTML slide generator, so every scene must be a focused visual teaching move.',
    'The uploaded file defines the knowledge scope and terminology, not a script that must be copied. Prefer teaching clarity over source fidelity.',
    'Plan page capacity as seriously as pedagogy. This integration target is 16:9 HTML slides: short labels, concise formulas, compact bullets, and visible structure only.',
    'Never plan a page that would require overlapping cards, footer overlays, clipping, hidden overflow, negative coordinates, or scrolling inside a 16:9 slide.',
    'If one teaching move cannot fit, split it into another scene or reduce optional content. Prefer more pages over dense pages.',
    'Infer the teaching language from the user/source context. For Chinese requirements, teach in Simplified Chinese; keep unavoidable academic terms in English when useful.',
    'Use scene types slide, interactive, and quiz. Use interactive only when visualization or parameter exploration would make the concept clearer; describe the interaction idea in widgetType/widgetOutline but remember it will become a static HTML storyboard later.',
    'Place short quiz/checkpoint scenes every 3-5 teaching scenes when the lesson is long enough.',
    'Make scenes form a natural learning progression. Avoid independent mini-lessons.',
    'Return JSON only. No markdown fences.',
  ].join('\n');

  const prompt = [
    '为下面源文件规划一个“OpenMAIC 思路 + HTML 输出”的整课大纲。',
    '',
    `文件：${effectiveFileName}（${effectiveFileType}）`,
    `主题：${title}`,
    `说明：${body.description || '-'}`,
    `课程路线初判：${routeHint}`,
    `页数档位：${bounds.label}；outlines.length 必须在 ${bounds.min}-${bounds.max} 之间。`,
    '',
    '规划原则：',
    '- 第 1 页作为 cover；第 2 页作为 intro；最后 1 页作为 summary。',
    '- 中间页要像 OpenMAIC 课堂：概念直觉、关键定义、对比判断、interactive 思维、阶段 quiz、典型例题、总结回扣。',
    '- 上传材料只限定知识范围、术语和难度，不要求机械照搬原例子；如果原例子不够清楚，可以换成更短、更典型、更适合课堂解释的例子。',
    '- sourceCoverage/sourceAnchors 是规划参考，不是渲染时必须逐字显示的内容；真正重要的是学生是否理解了知识点。',
    '- 数学内容要保留标准对象、符号、公式、判断规则和小例题；不要写成泛泛课程介绍。',
    '- 计算机/代码内容要保留代码对象、执行状态、变量/引用关系和输入输出；不要套用数学证明模板。',
    '- 代码页必须先规划标准代码块容量：最多 6-8 行、每行约 42 个半角字符；如果代码更长，换成等价短例子、只取关键行或拆页。',
    '- 讲 OOP/内存/执行追踪时优先规划“左侧关键代码 + 右侧 stack/heap/trace + 底部一句答案”的版式；不要把完整 class 和所有解释塞进一页。',
    '- 每页只推进一个教学动作，keyPoints 2-3 条优先，最多 4 条；mandatoryVisibleContent 只写真正必须可见的短标签/短公式/短结论。',
    '- 每页必须先做容量规划，再写内容清单。16:9 slide 默认最多 2 个主内容区、3 个内容块、约 90-160 个中文/等价字符；信息较密也不能超过约 200 字。',
    '- 如果需要定义 + 完整例题 + 结论，不能塞进同一张 16:9；拆页，或者只保留本页最关键的 2-3 个短块。',
    '- 这个测试入口优先验证旧 HTML 的 16:9 链路：canvasMode 尽量用 slide；不要用 tall/long 来逃避拆页。',
    '- OpenMAIC 容量原则：宁愿多一页、少一点字，也不要 overlap、裁切、fixed-height 卡片、底部结论条覆盖主内容。',
    '- optionalContent 和 contentBudget.mustDeleteIfCrowded 必须列出拥挤时先删除什么；不能删除核心公式、题干、判断规则、步骤结论。',
    '- interactive 场景必须包含 widgetType 和 widgetOutline；quiz 场景必须包含 quizConfig。',
    '- 不要写 htmlPrompt；不要写 CSS；不要写讲稿。',
    '',
    'JSON schema：',
    JSON.stringify(
      {
        languageDirective: '2-5 句，说明授课语言和术语处理',
        lessonTitle: title,
        targetLearner: '目标学习者',
        courseGoal: '整课学习结果',
        centralQuestion: '整节课反复回答的中心问题',
        recurringExample: '贯穿中间页的例子或视觉母题',
        visualMotif: '贯穿整课的视觉组织方式',
        coreQuestions: ['2-4 个学生视角问题'],
        planningNotes: ['关键取舍'],
        outlines: [
          {
            id: 'scene-1',
            order: 1,
            title: '页面标题',
            type: 'slide | interactive | quiz',
            pageKind: 'cover | intro | summary | process | table | math | code | example',
            description: '这一页的教学作用',
            learnerQuestion: '学生视角问题',
            teachingObjective: '这一页让学生学会什么',
            keyPoints: ['2-5 个短点'],
            sourceCoverage: ['覆盖哪些源页/主题'],
            sourceAnchors: ['具体定义、公式、例子、表格或段落锚点'],
            visualPlan: '静态 HTML 页应该如何呈现',
            mandatoryVisibleContent: ['必须出现的标题/公式/判断/步骤/结论'],
            optionalContent: ['拥挤时可删的内容'],
            density: 'light | standard | dense',
            canvasMode: 'slide（本测试入口默认只验 16:9）',
            mathRoute:
              'standard | definition-theorem | formula-focus | derivation | proof | worked-example | concept-map | comparison-table',
            contentBudget: {
              visibleCharsMin: 60,
              visibleCharsMax: 160,
              mainRegions: 2,
              blockCount: 3,
              mustDeleteIfCrowded: ['次要说明', '装饰标签', '额外上下文'],
            },
            capacityPlan: {
              capacityRationale:
                '为什么这些内容能在选定 canvas 内无重叠放下；如果放不下，说明已如何拆页或删减',
              layoutBlocks: ['标题区', '主概念区', '例子/判断区', '结论/检查点区'],
            },
            widgetType: 'simulation | diagram | code | game | visualization3d，仅 interactive 需要',
            widgetOutline: { concept: 'interactive 要探索的概念', keyVariables: ['变量'] },
            quizConfig: { questionCount: 2, difficulty: 'easy | medium | hard' },
          },
        ],
      },
      null,
      2,
    ),
    '',
    '源文本摘录：',
    sourceText || '无额外源文本摘录。',
    '',
    '源页材料：',
    sourcePagesForPrompt(sourcePages, Math.min(28, bounds.max + 10)),
  ].join('\n');

  return { system, prompt };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const tier = normalizeTier(body.pageBudgetTier || body.pageCountTier);
    const bounds = tierBounds(tier);
    const sourcePackage = body.sourcePackage;
    const sourcePages = Array.isArray(sourcePackage?.sourcePages)
      ? sourcePackage.sourcePages
      : Array.isArray(body.sourcePages)
        ? body.sourcePages
        : [];
    const effectiveFileName = sourcePackage?.fileName || body.fileName;
    const effectiveFileType = sourcePackage?.fileType || body.fileType || 'unknown';
    if (!effectiveFileName || sourcePages.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing fileName or sourcePages');
    }

    const sourceText = compactText(sourcePackage?.sourceText, 12000);
    const planningContextText = [
      sourcePackage?.subject,
      body.subject,
      body.title,
      effectiveFileName,
      sourcePages
        .slice(0, 12)
        .map((page) => [page.title, page.summary, page.concreteAnchor].filter(Boolean).join('\n'))
        .join('\n\n'),
      sourceText.slice(0, 3000),
    ]
      .filter(Boolean)
      .join('\n');
    const routeHint = inferCourseRouteFromText(planningContextText);
    const parseContext = { routeHint, contextText: planningContextText };
    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
    const prompts = buildOpenMaicPlanningPrompt({
      body,
      effectiveFileName,
      effectiveFileType,
      routeHint,
      bounds,
      sourcePages,
      sourceText,
    });

    const planningRun = await runWithRequestContext(
      req,
      '/api/generation-quality/html-openmaic-lesson-plan',
      async () => {
        const result = await callLLM(
          {
            model,
            system: prompts.system,
            prompt: prompts.prompt,
            maxOutputTokens: Math.min(modelInfo?.outputWindow || 16000, 16000),
          },
          'html-openmaic-lesson-plan-test',
          {
            retries: 1,
            validate: (text) => Boolean(parseOpenMaicPlan(text)),
          },
        );
        const openMaicPlan = parseOpenMaicPlan(result.text);
        const record = openMaicPlan
          ? buildLessonRecord({
              body,
              effectiveFileName,
              effectiveFileType,
              routeHint,
              sourcePages,
              tier,
              openMaicPlan,
            })
          : null;
        const parsedPlan = record ? parsePlan(JSON.stringify(record), tier, parseContext) : null;
        const plan = parsedPlan && record ? replaceWithCompactPrompts(parsedPlan, record) : null;
        return {
          result,
          openMaicPlan,
          plan,
          usage: combineTokenUsage([result.usage as TokenUsage | undefined]),
        };
      },
      {
        operationCode: 'html_openmaic_lesson_plan_test',
        chargeReason: 'OpenMAIC 思路 HTML 整课规划测试',
        serviceLabel: 'OpenMAIC-style HTML lesson plan generation',
        skipCreditCharge,
      },
    );

    if (!planningRun.openMaicPlan) {
      return apiError(
        'PARSE_FAILED',
        502,
        'Failed to parse OpenMAIC-style outline JSON',
        planningRun.result.text.slice(0, 2000),
      );
    }
    if (!planningRun.plan) {
      return apiError(
        'PARSE_FAILED',
        502,
        'Failed to adapt OpenMAIC-style outline into HTML lesson plan',
        JSON.stringify(planningRun.openMaicPlan).slice(0, 2000),
      );
    }

    const usage = planningRun.usage;
    return apiSuccess({
      plan: planningRun.plan,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(
        modelString,
        usage ?? undefined,
      ) as HtmlCostEstimate | null,
      skippedCreditCharge: skipCreditCharge,
      planningQuality: null,
      planningRetryCount: 0,
      planningRetryReasons: [],
      openMaicLanguageDirective: planningRun.openMaicPlan.languageDirective || '',
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to generate OpenMAIC-style HTML lesson plan',
      error instanceof Error ? error.message : String(error),
    );
  }
}
