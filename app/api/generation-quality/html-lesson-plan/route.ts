import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import {
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
} from '@/lib/utils/openai-pricing';
import { creditsFromTokenUsage, usdFromCredits } from '@/lib/utils/credits';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
type PageCountTierInput = PageCountTier | 'under-5' | 'under-10' | 'under-20' | 'over-20';
type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
type HtmlCsRoute =
  | 'standard'
  | 'execution-trace'
  | 'memory-diagram'
  | 'call-stack'
  | 'pointer-diagram'
  | 'tree-diagram'
  | 'graph-trace'
  | 'linear-structure'
  | 'dictionary-diagram'
  | 'invariant-check'
  | 'composite-operation';
type HtmlMathRoute =
  | 'standard'
  | 'definition-theorem'
  | 'formula-focus'
  | 'derivation'
  | 'proof'
  | 'worked-example'
  | 'concept-map'
  | 'comparison-table';
type HtmlCourseRoute =
  | 'general'
  | 'math'
  | 'computer-science'
  | 'science'
  | 'business'
  | 'humanities'
  | 'social-science';
type DensityLevel = 'light' | 'standard' | 'dense';
type HtmlCanvasMode = 'slide' | 'tall' | 'long';

type SourcePageInput = {
  sourceIndex?: number;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  concreteAnchor?: string;
  suggestedPageKind?: string;
  sourceLabel?: string;
  imageIds?: string[];
};

type SourceImageInput = {
  id?: string;
  src?: string;
  pageNumber?: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
};

type SourcePackageInput = {
  fileName?: string;
  fileType?: string;
  subject?: string;
  sourceText?: string;
  sourcePages?: SourcePageInput[];
  sourceImages?: SourceImageInput[];
  imageMapping?: Record<string, string>;
  pageCount?: number;
  parser?: string;
  warnings?: string[];
};

type RequestBody = {
  mode?: 'lesson' | 'notebook';
  fixtureId?: string;
  fileName?: string;
  fileType?: string;
  subject?: string;
  sourceFileCount?: number;
  title?: string;
  description?: string;
  sourceTextLength?: number;
  pageCountTier?: PageCountTierInput;
  pageBudgetTier?: PageCountTierInput;
  imageUsePolicy?: 'prefer-source-images' | 'text-first';
  sourcePages?: SourcePageInput[];
  sourcePackage?: SourcePackageInput;
};

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlCostEstimate = {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
};

type PlanningQualityIssue = {
  code: string;
  title: string;
  severity: 'error' | 'warning';
  details: string[];
};

type PlanningQualityReport = {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  issues: PlanningQualityIssue[];
  summary: string;
};

type LessonSlidePlan = {
  id: string;
  order: number;
  title: string;
  pageKind: HtmlPageKind;
  canvasMode: HtmlCanvasMode;
  canvasHeight: number;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  objective: string;
  learnerQuestion: string;
  keyPoints: string[];
  sourceCoverage: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
  densityTarget: DensityLevel;
  sourceUsage: 'direct' | 'adapted' | 'new-example' | 'synthesis';
  sourceUseRationale: string;
  contentBudget: {
    visibleCharsMin: number;
    visibleCharsMax: number;
    mainRegions: number;
    blockCount: number;
    mustDeleteIfCrowded: string[];
  };
  htmlPrompt: string;
};

type CoursePlan = {
  targetLearner: string;
  courseGoal: string;
  narrativeArc: string[];
  prerequisiteAssumptions: string[];
  coreQuestions: string[];
  sourceDigest: string[];
  pacingStrategy: string;
};

type SlideTeachingOutline = {
  id: string;
  order: number;
  title: string;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  learnerQuestion: string;
  teachingObjective: string;
  keyPoints: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  sourceUseRationale: string;
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
};

type LessonPlan = {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  coursePlan: CoursePlan;
  slideOutlines: SlideTeachingOutline[];
  planningNotes: string[];
  slides: LessonSlidePlan[];
};

const PAGE_KIND_SET = new Set<HtmlPageKind>([
  'cover',
  'intro',
  'summary',
  'process',
  'table',
  'math',
  'code',
  'example',
]);
const DENSITY_SET = new Set<DensityLevel>(['light', 'standard', 'dense']);
const COURSE_ROUTE_SET = new Set<HtmlCourseRoute>([
  'general',
  'math',
  'computer-science',
  'science',
  'business',
  'humanities',
  'social-science',
]);
const CS_ROUTE_SET = new Set<HtmlCsRoute>([
  'standard',
  'execution-trace',
  'memory-diagram',
  'call-stack',
  'pointer-diagram',
  'tree-diagram',
  'graph-trace',
  'linear-structure',
  'dictionary-diagram',
  'invariant-check',
  'composite-operation',
]);
const MATH_ROUTE_SET = new Set<HtmlMathRoute>([
  'standard',
  'definition-theorem',
  'formula-focus',
  'derivation',
  'proof',
  'worked-example',
  'concept-map',
  'comparison-table',
]);
const SOURCE_USAGE_SET = new Set<LessonSlidePlan['sourceUsage']>([
  'direct',
  'adapted',
  'new-example',
  'synthesis',
]);

function shouldSkipCreditChargeForTestRequest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function estimateGenerationCost(modelString: string, usage: TokenUsage | undefined) {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const cachedInputTokens = toSafeInt(usage?.cachedInputTokens);
  const totalTokens = toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return null;

  const providerId = modelString.includes(':') ? modelString.split(':')[0] : undefined;
  const pricingArgs = {
    providerId,
    modelString,
    inputTokens,
    outputTokens,
    cachedInputTokens,
  };
  const baseUsd = estimateOpenAITextUsageBaseCostUsd(pricingArgs);
  const retailUsd = estimateOpenAITextUsageRetailCostUsd(pricingArgs);
  const computeCredits = estimateOpenAITextUsageRetailCostCredits(pricingArgs);
  if (baseUsd != null && retailUsd != null && computeCredits != null) {
    return {
      baseUsd,
      retailUsd,
      computeCredits,
      markupMultiplier: OPENAI_RETAIL_MARKUP_MULTIPLIER,
      source: 'openai_pricing' as const,
    };
  }

  const fallbackCredits = creditsFromTokenUsage(totalTokens);
  return {
    baseUsd: null,
    retailUsd: usdFromCredits(fallbackCredits),
    computeCredits: fallbackCredits,
    markupMultiplier: null,
    source: 'token_fallback' as const,
  };
}

function tierBounds(tier: PageCountTier): { min: number; max: number; label: string } {
  switch (tier) {
    case 'under5':
      return { min: 4, max: 5, label: '5 页以下' };
    case 'under10':
      return { min: 7, max: 10, label: '10 页以下' };
    case 'under20':
      return { min: 14, max: 20, label: '20 页以下' };
    case 'over20':
      return { min: 21, max: 24, label: '20 页以上（测试上限 24 页）' };
    default:
      return { min: 4, max: 5, label: '5 页以下' };
  }
}

function normalizeTier(value: PageCountTierInput | undefined): PageCountTier {
  if (value === 'under-5') return 'under5';
  if (value === 'under-10') return 'under10';
  if (value === 'under-20') return 'under20';
  if (value === 'over-20') return 'over20';
  if (value === 'under5' || value === 'under10' || value === 'under20' || value === 'over20') {
    return value;
  }
  return 'under5';
}

function compactText(input: string | undefined, maxLength: number): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function estimateDataUrlBytes(src: string | undefined): number {
  if (!src) return 0;
  const base64 = src.match(/^data:[^;]+;base64,(.+)$/)?.[1];
  if (base64) return Math.ceil((base64.length * 3) / 4);
  return src.length;
}

function compactSourcePages(sourcePages: SourcePageInput[]): SourcePageInput[] {
  return sourcePages.slice(0, 28).map((page, index) => ({
    sourceIndex: typeof page.sourceIndex === 'number' ? page.sourceIndex : index + 1,
    sourceLabel: compactText(page.sourceLabel, 80),
    title: compactText(page.title, 120),
    summary: compactText(page.summary, 420),
    keyPoints: Array.isArray(page.keyPoints)
      ? page.keyPoints.slice(0, 5).map((point) => compactText(point, 220))
      : [],
    concreteAnchor: compactText(page.concreteAnchor, 700),
    suggestedPageKind: compactText(page.suggestedPageKind, 40),
    imageIds: Array.isArray(page.imageIds)
      ? page.imageIds.filter((id) => typeof id === 'string').slice(0, 6)
      : [],
  }));
}

function compactSourceImages(sourceImages: SourceImageInput[] | undefined): SourceImageInput[] {
  return (sourceImages || [])
    .filter((image) => typeof image.id === 'string' && image.id.trim())
    .slice(0, 40)
    .map((image) => ({
      id: compactText(image.id, 80),
      pageNumber: typeof image.pageNumber === 'number' ? image.pageNumber : undefined,
      description: compactText(image.description, 260),
      width: typeof image.width === 'number' ? Math.round(image.width) : undefined,
      height: typeof image.height === 'number' ? Math.round(image.height) : undefined,
      byteLength:
        typeof image.byteLength === 'number'
          ? Math.round(image.byteLength)
          : estimateDataUrlBytes(image.src),
    }));
}

function sourceImagesForVision(
  sourceImages: SourceImageInput[] | undefined,
): Array<{ id: string; src: string }> {
  const seen = new Set<string>();
  const images: Array<{ id: string; src: string }> = [];
  for (const image of sourceImages || []) {
    const id = image.id?.trim();
    const src = image.src?.trim();
    if (!id || !src || seen.has(id) || !/^[A-Za-z0-9_.:-]+$/.test(id)) continue;
    seen.add(id);
    images.push({ id, src });
    if (images.length >= 16) break;
  }
  return images;
}

function extractJsonObject(text: string): string {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return withoutFence;
  return withoutFence.slice(start, end + 1);
}

function toStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function normalizePageKind(value: unknown, fallback: HtmlPageKind): HtmlPageKind {
  if (typeof value === 'string' && PAGE_KIND_SET.has(value as HtmlPageKind)) {
    return value as HtmlPageKind;
  }
  return fallback;
}

function structuralPageKind(index: number, total: number, proposed: HtmlPageKind): HtmlPageKind {
  if (index === 0) return 'cover';
  if (total >= 4 && index === 1) return 'intro';
  if (total >= 4 && index === total - 1) return 'summary';
  return proposed;
}

function coverVisualStyleForRoute(route: HtmlCourseRoute | undefined): string {
  if (route === 'computer-science') {
    return [
      '内置封面视觉语言：tech_hero_title。',
      '优先使用本地内置封面背景 /slide-backgrounds/dark-tech-neural.png 或 /slide-backgrounds/product-launch-dark-photo.png；也可以用 CSS 数据网络、细线连接、数据波纹/网格光点、蓝橙或蓝绿高光；标题叠在背景上。',
      '这是封面背景/主视觉，不是正文卡片，也不要用空白白底封面。',
    ].join(' ');
  }
  if (route === 'humanities' || route === 'social-science') {
    return [
      '内置封面视觉语言：cinematic_title_frame。',
      '优先使用本地内置封面背景 /slide-backgrounds/cinematic-stage-photo.png；也可以用电影感/纪录片感光影框景、低饱和质感或抽象场景；标题要有海报级视觉权重。',
      '这是封面背景/主视觉，不是正文卡片，也不要用空白白底封面。',
    ].join(' ');
  }
  if (route === 'math' || route === 'science') {
    return [
      '内置封面视觉语言：academic_hero_cover。',
      '优先使用本地内置封面背景 /slide-backgrounds/academic-blueprint-photo.png；也可以用学术科技几何路径、坐标/结构线、抽象对象关系或柔和渐变；标题叠加在主视觉上。',
      '这是封面背景/主视觉，不是正文卡片，也不要用空白白底封面。',
    ].join(' ');
  }
  return [
    '内置封面视觉语言：image_title_overlay。',
    '优先使用本地内置封面背景 /slide-backgrounds/lecture-hall-photo.png；也可以用大面积封面背景/主视觉、抽象主题图形、渐变层次或光影纹理；标题叠在背景上。',
    '这是封面背景/主视觉，不是正文卡片，也不要用空白白底封面。',
  ].join(' ');
}

function structuralPromptGuidance(args: {
  pageKind: HtmlPageKind;
  courseRoute?: HtmlCourseRoute;
  order: number;
  pageCount: number;
}): string[] {
  if (args.pageKind === 'cover') {
    return [
      '结构角色：封面页。只建立 notebook/课程主题识别，不展开正文讲解。',
      coverVisualStyleForRoute(args.courseRoute),
      '可见内容：主标题是唯一必须文字；副标题/来源/1-2 个短标签都是可选。不要放目录、入口问题、定义、代码、公式推导、例题答案或总结列表。',
    ];
  }
  if (args.pageKind === 'intro') {
    return [
      '结构角色：介绍/导入页。作为封面后的第 2 页，回答“为什么要学、这节课怎么进入、先看哪几个入口”。',
      '可见内容应包含：一句学习定位、3-4 个入口块/问题、极短路线图；不要提前讲完整定义、完整例题、代码 trace 或证明过程。',
    ];
  }
  if (args.pageKind === 'summary') {
    return [
      `结构角色：总结页。作为第 ${args.pageCount} 页收束整本 notebook，不引入新主题。`,
      '可见内容应包含：3-5 条 takeaway、一个回看路线/检查清单、一个下一步问题；不要生成新的例题、长证明或新代码讲解。',
    ];
  }
  return [];
}

function inferCourseRouteFromText(value: string, pageKind?: HtmlPageKind): HtmlCourseRoute {
  const text = value.toLowerCase();
  if (
    pageKind === 'math' ||
    /math|formula|derivation|proof|equation|calculus|matrix|probability|函数|公式|证明|推导|定理|导数|积分|矩阵|概率|群论|马尔可夫/.test(
      text,
    )
  ) {
    return 'math';
  }
  if (
    pageKind === 'code' ||
    /computer|cs|code|program|python|javascript|typescript|java|class|object|oop|inheritance|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|linked\s*list|计算机|代码|编程|程序|算法|继承|调用栈|内存|堆|栈|对象|属性|字段|链表|指针|字典|哈希/.test(
      text,
    )
  ) {
    return 'computer-science';
  }
  if (
    /science|physics|chemistry|biology|experiment|lab|物理|化学|生物|实验|科学|细胞|力学|电路/.test(
      text,
    )
  ) {
    return 'science';
  }
  if (
    /business|finance|economics|market|revenue|cost|profit|pricing|商业|财务|经济|市场|营收|成本|利润|盈亏|定价/.test(
      text,
    )
  ) {
    return 'business';
  }
  if (/history|literature|philosophy|历史|文学|哲学|文本|史料|论证|修辞/.test(text)) {
    return 'humanities';
  }
  if (/policy|society|sociology|psychology|geography|政策|社会|心理|地理|案例/.test(text)) {
    return 'social-science';
  }
  return 'general';
}

function normalizeCourseRoute(value: unknown, fallback: HtmlCourseRoute): HtmlCourseRoute {
  if (typeof value === 'string' && COURSE_ROUTE_SET.has(value as HtmlCourseRoute)) {
    return value as HtmlCourseRoute;
  }
  return fallback;
}

function inferCsRouteFromText(value: string): HtmlCsRoute {
  const text = value.toLowerCase();
  const hasPointer =
    /linked\s*list|doubly|pointer|node|prev|next|front|链表|节点|指针|前驱|后继/.test(text);
  const hasInvariant = /invariant|合法|不变量|结构承诺|size|ordering|connectivity/.test(text);
  if (hasPointer && hasInvariant) return 'composite-operation';
  if (/graph|bfs|dfs|frontier|visited|neighbor|图搜索|广度|深度|邻居/.test(text)) {
    return 'graph-trace';
  }
  if (
    /bst|binary search tree|tree|root|parent|child|subtree|树|二叉搜索树|父节点|子节点/.test(text)
  ) {
    return 'tree-diagram';
  }
  if (hasPointer) return 'pointer-diagram';
  if (/dictionary|dict|hash|key|value|lookup|mutation|字典|哈希|键|值|映射|查找/.test(text)) {
    return 'dictionary-diagram';
  }
  if (/stack|queue|push|pop|enqueue|dequeue|lifo|fifo|栈|队列/.test(text)) {
    return 'linear-structure';
  }
  if (hasInvariant) return 'invariant-check';
  if (/recursion|recursive|call stack|frame|base case|递归|调用栈|栈帧|返回值/.test(text)) {
    return 'call-stack';
  }
  if (
    /memory|heap|alias|reference|object|self|attribute|class|field|inheritance|内存|堆|引用|指向|对象|属性|字段|继承/.test(
      text,
    )
  ) {
    return 'memory-diagram';
  }
  if (/trace|state|loop|line|execute|variable|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return 'standard';
}

function normalizeCsRoute(value: unknown, fallbackText: string): HtmlCsRoute {
  if (typeof value === 'string' && CS_ROUTE_SET.has(value as HtmlCsRoute)) {
    return value as HtmlCsRoute;
  }
  return inferCsRouteFromText(fallbackText);
}

function inferMathRouteFromText(value: string, pageKind?: HtmlPageKind): HtmlMathRoute {
  const text = value.toLowerCase();
  if (/proof|prove|证明|证毕|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|推导|化简|求导过程|递推|等价变形/.test(text)) return 'derivation';
  if (
    pageKind === 'example' ||
    /worked example|example|solve|problem|例题|求解|计算|答案/.test(text)
  ) {
    return 'worked-example';
  }
  if (/definition|theorem|lemma|proposition|定义|定理|引理|命题/.test(text)) {
    return 'definition-theorem';
  }
  if (/formula|equation|identity|公式|方程|恒等式|核心公式/.test(text)) return 'formula-focus';
  if (/concept map|relationship|关系|图谱|概念图/.test(text)) return 'concept-map';
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) {
    return 'comparison-table';
  }
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

function normalizeMathRoute(
  value: unknown,
  fallbackText: string,
  pageKind?: HtmlPageKind,
): HtmlMathRoute {
  if (typeof value === 'string' && MATH_ROUTE_SET.has(value as HtmlMathRoute)) {
    return value as HtmlMathRoute;
  }
  return inferMathRouteFromText(fallbackText, pageKind);
}

function normalizeDensity(value: unknown): DensityLevel {
  if (typeof value === 'string' && DENSITY_SET.has(value as DensityLevel)) {
    return value as DensityLevel;
  }
  return 'standard';
}

function normalizeCanvasHeight(
  value: unknown,
  canvasMode: HtmlCanvasMode,
  density: DensityLevel,
): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0;
  if (canvasMode === 'slide') return 900;
  if (canvasMode === 'tall') {
    const fallback = density === 'dense' ? 1400 : 1200;
    const height = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const fallback = density === 'dense' ? 2400 : density === 'standard' ? 2200 : 1800;
  const height = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

function inferCanvasModeFromSlide(args: {
  value: unknown;
  pageKind: HtmlPageKind;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  text: string;
}): HtmlCanvasMode {
  if (args.value === 'long') return 'long';
  if (args.value === 'tall') return 'tall';
  if (args.value === 'slide') return 'slide';
  if (args.pageKind === 'cover' || args.pageKind === 'intro') {
    return 'slide';
  }
  const text = args.text.toLowerCase();
  const hasLongSignal =
    /长页|长页面|完整证明|长证明|完整推导|长推导|逐步推导|多步推导|完整代码|代码题|逐行追踪|memory trace|execution trace|call stack|heap|stack|pointer|recursion|proof walkthrough|derivation ladder/i.test(
      args.text,
    );
  if (
    args.courseRoute === 'math' &&
    (args.mathRoute === 'proof' || args.mathRoute === 'derivation') &&
    (args.density === 'dense' || hasLongSignal)
  ) {
    return 'long';
  }
  if (
    args.courseRoute === 'math' &&
    (args.mathRoute === 'proof' ||
      args.mathRoute === 'derivation' ||
      args.mathRoute === 'worked-example' ||
      args.mathRoute === 'formula-focus' ||
      args.mathRoute === 'comparison-table')
  ) {
    return 'tall';
  }
  if (
    args.courseRoute === 'computer-science' &&
    args.csRoute &&
    args.csRoute !== 'standard' &&
    (args.density === 'dense' || hasLongSignal || /trace|diagram|stack|heap/.test(text))
  ) {
    return 'long';
  }
  if (args.courseRoute === 'computer-science' && args.csRoute && args.csRoute !== 'standard') {
    return 'tall';
  }
  if (
    args.density === 'dense' ||
    ((args.pageKind === 'process' || args.pageKind === 'table' || args.pageKind === 'example') &&
      /步骤|例题|拆解|推导|读图|图表|矩阵|代码|过程|对比|检查/.test(args.text))
  ) {
    return 'tall';
  }
  return 'slide';
}

function normalizeSourceUsage(value: unknown): LessonSlidePlan['sourceUsage'] {
  if (typeof value === 'string' && SOURCE_USAGE_SET.has(value as LessonSlidePlan['sourceUsage'])) {
    return value as LessonSlidePlan['sourceUsage'];
  }
  return 'synthesis';
}

function normalizeCoursePlan(value: unknown, fallbackTitle: string): CoursePlan {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    targetLearner: compactText(String(record.targetLearner || '面向当前 notebook 的学习者'), 180),
    courseGoal: compactText(String(record.courseGoal || `理解 ${fallbackTitle} 的核心主线`), 220),
    narrativeArc: toStringArray(record.narrativeArc, 8),
    prerequisiteAssumptions: toStringArray(record.prerequisiteAssumptions, 6),
    coreQuestions: toStringArray(record.coreQuestions, 8),
    sourceDigest: toStringArray(record.sourceDigest, 10),
    pacingStrategy: compactText(
      String(record.pacingStrategy || '先建立问题，再讲核心概念，最后用证据/例子收束。'),
      260,
    ),
  };
}

function combineTokenUsage(usages: Array<TokenUsage | null | undefined>): TokenUsage | null {
  const validUsages = usages.filter(Boolean) as TokenUsage[];
  if (validUsages.length === 0) return null;
  return validUsages.reduce<TokenUsage>(
    (sum, usage) => ({
      inputTokens: (sum.inputTokens || 0) + (usage.inputTokens || 0),
      outputTokens: (sum.outputTokens || 0) + (usage.outputTokens || 0),
      cachedInputTokens: (sum.cachedInputTokens || 0) + (usage.cachedInputTokens || 0),
      totalTokens:
        (sum.totalTokens || 0) +
        (usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0)),
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    },
  );
}

function isGenericPlanningText(value: string | null | undefined): boolean {
  const text = compactText(value || '', 220).toLowerCase();
  if (!text) return true;
  if (text.length < 10) return true;
  return (
    /源材料|核心主线|当前 notebook|当前课程|本节课|相关内容|主要内容|知识点|学习者|教学目标/.test(
      text,
    ) &&
    !/[a-z_]{3,}|\d|[∈⊆×≤≥→↔=]|函数|关系|矩阵|马尔可夫|class|object|tweet|stack|heap|figure|算法|证明|推导|定理|定义|属性|状态|概率/.test(
      text,
    )
  );
}

function isSpecificSourceAnchor(anchor: string): boolean {
  const text = compactText(anchor, 180);
  if (!text || text.length < 8) return false;
  if (/^(源页|第\s*\d+\s*页|page\s*\d+|source\s*\d+)[:：\s-]*$/i.test(text)) return false;
  if (/^(源材料|源文本|课程主线|notebook\s*source)$/i.test(text)) return false;
  return /[:：；,，。()\[\]{}]|[∈⊆×≤≥→↔=]|[A-Za-z_]{3,}|\d|定义|公式|例|图|表|代码|片段|命题|证明|推导|矩阵|关系|属性|状态|Figure/i.test(
    text,
  );
}

function hasLongCanvasSignal(slide: LessonSlidePlan): boolean {
  const text = [
    slide.title,
    slide.objective,
    slide.learnerQuestion,
    slide.visualPlan,
    slide.htmlPrompt,
    ...slide.keyPoints,
    ...slide.mandatoryVisibleContent,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return (
    slide.density === 'dense' ||
    (slide.courseRoute === 'math' &&
      (slide.mathRoute === 'proof' ||
        slide.mathRoute === 'derivation' ||
        slide.mathRoute === 'worked-example')) ||
    (slide.courseRoute === 'computer-science' &&
      slide.csRoute !== undefined &&
      slide.csRoute !== 'standard') ||
    /长页面|长页|完整例题|证明|推导|逐步|walkthrough|trace|memory|stack|heap|call stack|代码讲解|递归|状态追踪/.test(
      text,
    )
  );
}

function planningIssue(
  code: string,
  title: string,
  severity: PlanningQualityIssue['severity'],
  details: string[],
): PlanningQualityIssue | null {
  const compactDetails = details.map((detail) => compactText(detail, 220)).filter(Boolean);
  if (compactDetails.length === 0) return null;
  return {
    code,
    title,
    severity,
    details: compactDetails.slice(0, 8),
  };
}

function evaluatePlanningQuality(args: {
  plan: LessonPlan;
  bounds: ReturnType<typeof tierBounds>;
  routeHint: HtmlCourseRoute;
  sourceImages: SourceImageInput[];
  imageUsePolicy: RequestBody['imageUsePolicy'];
}): PlanningQualityReport {
  const { plan, bounds, routeHint, sourceImages } = args;
  const issues: PlanningQualityIssue[] = [];
  const sourceImageIds = new Set(
    sourceImages.map((image) => image.id).filter((id): id is string => Boolean(id)),
  );
  const nonCoverSlides = plan.slides.filter((slide) => slide.pageKind !== 'cover');

  const coursePlan = plan.coursePlan;
  const genericCourseDetails: string[] = [];
  if (!coursePlan || isGenericPlanningText(coursePlan.courseGoal)) {
    genericCourseDetails.push('coursePlan.courseGoal 太泛，不能看出这本 notebook 的具体知识主线。');
  }
  if (!coursePlan?.narrativeArc?.length || coursePlan.narrativeArc.length < 3) {
    genericCourseDetails.push('coursePlan.narrativeArc 少于 3 段，课程推进顺序不清楚。');
  }
  if (!coursePlan?.coreQuestions?.length || coursePlan.coreQuestions.length < 2) {
    genericCourseDetails.push('coursePlan.coreQuestions 少于 2 个，缺少学生视角问题。');
  }
  if (!coursePlan?.sourceDigest?.length || coursePlan.sourceDigest.length < 2) {
    genericCourseDetails.push('coursePlan.sourceDigest 少于 2 条，源材料取舍不明确。');
  }
  const courseIssue = planningIssue(
    'generic-course-plan',
    '课程规划层过泛',
    'error',
    genericCourseDetails,
  );
  if (courseIssue) issues.push(courseIssue);

  const anchorDetails = nonCoverSlides
    .filter((slide) => !slide.sourceAnchors.some(isSpecificSourceAnchor))
    .slice(0, 6)
    .map((slide) => `第 ${slide.order} 页「${slide.title}」缺少具体 source anchor。`);
  const anchorIssue = planningIssue(
    'weak-source-anchors',
    '页面缺少具体源材料锚点',
    'error',
    anchorDetails,
  );
  if (anchorIssue) issues.push(anchorIssue);

  const inventedImageDetails = plan.slides
    .flatMap((slide) =>
      slide.sourceImageIds
        .filter((id) => !sourceImageIds.has(id))
        .map((id) => `第 ${slide.order} 页「${slide.title}」引用不存在的原文图片 ${id}。`),
    )
    .slice(0, 8);
  const imageIssue = planningIssue(
    'invalid-source-images',
    '规划引用了不存在的原文图片',
    'error',
    inventedImageDetails,
  );
  if (imageIssue) issues.push(imageIssue);

  const routeMismatchDetails: string[] = [];
  if (routeHint !== 'general' && nonCoverSlides.length) {
    const mismatched = nonCoverSlides.filter((slide) => slide.courseRoute !== routeHint);
    if (mismatched.length > Math.max(1, Math.floor(nonCoverSlides.length * 0.35))) {
      routeMismatchDetails.push(
        `初步识别课程路线为 ${routeHint}，但 ${mismatched.length}/${nonCoverSlides.length} 个正文页不是这个路线。`,
      );
    }
  }
  if (routeHint === 'math') {
    const weakMathSlides = nonCoverSlides.filter(
      (slide) =>
        slide.courseRoute === 'math' &&
        (slide.pageKind === 'math' || slide.pageKind === 'example') &&
        (!slide.mathRoute || slide.mathRoute === 'standard') &&
        /证明|推导|公式|例题|定义|定理|矩阵|关系|概率|向量/.test(
          [slide.title, slide.objective, slide.htmlPrompt].join('\n'),
        ),
    );
    if (weakMathSlides.length) {
      routeMismatchDetails.push(
        ...weakMathSlides
          .slice(0, 4)
          .map(
            (slide) =>
              `第 ${slide.order} 页「${slide.title}」像数学页，但 mathRoute 仍是 standard。`,
          ),
      );
    }
  }
  if (routeHint === 'computer-science') {
    const hasSpecialCs = nonCoverSlides.some(
      (slide) => slide.courseRoute === 'computer-science' && slide.csRoute !== 'standard',
    );
    const hasCsSignal =
      /class|object|stack|heap|trace|pointer|tree|graph|递归|引用|属性|对象|内存|执行|代码|变量/i.test(
        nonCoverSlides
          .map((slide) => [slide.title, slide.objective, slide.htmlPrompt].join('\n'))
          .join('\n'),
      );
    if (hasCsSignal && !hasSpecialCs) {
      routeMismatchDetails.push('CS 源材料有代码/对象/状态信号，但没有任何 CS 专属语义页。');
    }
  }
  const routeIssue = planningIssue(
    'route-mismatch',
    '课程路线或专属版式不匹配',
    'error',
    routeMismatchDetails,
  );
  if (routeIssue) issues.push(routeIssue);

  const canvasDetails: string[] = [];
  for (const slide of nonCoverSlides) {
    if (slide.canvasMode === 'slide') {
      const tooDenseForSlide =
        slide.contentBudget.mainRegions > 3 ||
        slide.contentBudget.blockCount > 8 ||
        slide.contentBudget.visibleCharsMax > 420 ||
        (slide.density === 'dense' && hasLongCanvasSignal(slide));
      if (tooDenseForSlide) {
        canvasDetails.push(
          `第 ${slide.order} 页「${slide.title}」按 16:9 规划但容量偏高，应拆页、降密度或设为 tall/long。`,
        );
      }
    }
    if (slide.canvasMode === 'tall') {
      const tooDenseForTall =
        slide.contentBudget.mainRegions > 5 ||
        slide.contentBudget.blockCount > 12 ||
        slide.contentBudget.visibleCharsMax > 900 ||
        (slide.density === 'dense' && hasLongCanvasSignal(slide));
      if (tooDenseForTall) {
        canvasDetails.push(
          `第 ${slide.order} 页「${slide.title}」按 tall 规划但仍然偏重，应拆页或设为 long。`,
        );
      }
    }
    if (slide.canvasMode === 'long' && !hasLongCanvasSignal(slide)) {
      canvasDetails.push(
        `第 ${slide.order} 页「${slide.title}」被设为 long，但看不出证明/推导/trace/代码 walkthrough 等长页理由；可能更适合 tall。`,
      );
    }
  }
  const canvasIssue = planningIssue(
    'canvas-density-mismatch',
    '画布模式与内容密度不匹配',
    'error',
    canvasDetails.slice(0, 6),
  );
  if (canvasIssue) issues.push(canvasIssue);

  const countDetails: string[] = [];
  if (plan.pageCount < bounds.min || plan.pageCount > bounds.max) {
    countDetails.push(`规划页数 ${plan.pageCount} 不在当前档位 ${bounds.min}-${bounds.max} 内。`);
  }
  if (plan.slides[0]?.pageKind !== 'cover') {
    countDetails.push('第 1 页不是 cover。');
  }
  if (plan.pageCount >= 4 && plan.slides[1]?.pageKind !== 'intro') {
    countDetails.push('第 2 页不是 intro；整本 notebook 需要封面后的介绍/导入页。');
  }
  if (plan.pageCount >= 4 && plan.slides[plan.slides.length - 1]?.pageKind !== 'summary') {
    countDetails.push('最后 1 页不是 summary；整本 notebook 需要总结/回收页。');
  }
  if (plan.slideOutlines.length !== plan.slides.length) {
    countDetails.push(
      `slideOutlines 数量 ${plan.slideOutlines.length} 与 slides 数量 ${plan.slides.length} 不一致。`,
    );
  }
  const countIssue = planningIssue('shape-mismatch', '规划结构不完整', 'error', countDetails);
  if (countIssue) issues.push(countIssue);

  const cover = plan.slides[0];
  const coverDetails: string[] = [];
  if (
    cover &&
    !/tech_hero_title|cinematic_title_frame|academic_hero_cover|image_title_overlay|\/slide-backgrounds\/|封面背景|主视觉/i.test(
      cover.htmlPrompt,
    )
  ) {
    coverDetails.push('封面 htmlPrompt 没有明确内置封面背景/主视觉语言。');
  }
  if (cover && !/主标题|大标题|唯一必须|只保留|只包含|文字克制|不展开正文/.test(cover.htmlPrompt)) {
    coverDetails.push('封面 htmlPrompt 没有明确“主标题为唯一必须文字 / 少文字 / 不展开正文”。');
  }
  if (cover?.sourceImageIds.length) {
    coverDetails.push('封面不应该占用 sourceImageIds；封面背景应使用内置背景或 CSS 主视觉。');
  }
  const coverIssue = planningIssue(
    'cover-visual-contract',
    '封面视觉契约不完整',
    'error',
    coverDetails,
  );
  if (coverIssue) issues.push(coverIssue);

  const imageUseDetails: string[] = [];
  if (args.imageUsePolicy === 'prefer-source-images' && sourceImageIds.size > 0) {
    const usedImageCount = new Set(plan.slides.flatMap((slide) => slide.sourceImageIds)).size;
    const hasImageFriendlyPage = plan.slides.some((slide) =>
      /图|figure|表|chart|结果|架构|流程|对比|读图|截图|论文/i.test(
        [slide.title, slide.objective, slide.visualPlan, slide.htmlPrompt].join('\n'),
      ),
    );
    if (usedImageCount === 0 && hasImageFriendlyPage) {
      imageUseDetails.push(
        '有原文图片且页面目标包含读图/图表信号，但规划完全没有分配 sourceImageIds。',
      );
    }
  }
  const imageUseIssue = planningIssue(
    'source-image-underuse',
    '原文图片使用不足',
    'warning',
    imageUseDetails,
  );
  if (imageUseIssue) issues.push(imageUseIssue);

  const blockingIssueCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningIssueCount = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    passed: blockingIssueCount === 0,
    blockingIssueCount,
    warningIssueCount,
    issues,
    summary:
      blockingIssueCount === 0
        ? warningIssueCount
          ? `规划可用，但有 ${warningIssueCount} 个质量提醒。`
          : '规划通过质量检查。'
        : `规划未通过：${blockingIssueCount} 个阻塞问题，${warningIssueCount} 个提醒。`,
  };
}

function planningQualityScore(report: PlanningQualityReport): number {
  return report.blockingIssueCount * 10 + report.warningIssueCount;
}

function buildPlanningQualityRetryPrompt(args: {
  originalPrompt: string;
  previousPlan: LessonPlan;
  quality: PlanningQualityReport;
  bounds: ReturnType<typeof tierBounds>;
}): string {
  const issueLines = args.quality.issues.flatMap((issue) => [
    `- [${issue.severity}] ${issue.title} (${issue.code})`,
    ...issue.details.map((detail) => `  - ${detail}`),
  ]);
  return [
    args.originalPrompt,
    '',
    '=== 规划 QA 重试任务 ===',
    '你上一次返回的 JSON 已经能解析，但没有通过整本 notebook 规划质量检查。',
    '这次不要只换标题或美化措辞，必须修复下面的具体问题，然后重新返回完整 JSON。',
    `页数仍必须在 ${args.bounds.min}-${args.bounds.max} 页之间。`,
    '',
    '失败项：',
    issueLines.join('\n'),
    '',
    '修复要求：',
    '- coursePlan 必须具体到本文件的知识对象、符号/代码/图表、学习顺序和源材料取舍。',
    '- slideOutlines 必须和 slides 一一对应，每页都有 learnerQuestion、teachingObjective、具体 sourceAnchors、sourceUseRationale、visualPlan、mandatoryVisibleContent。',
    '- sourceAnchors 不能只写“第几页/源材料/主线”，必须写具体定义、公式、图、表、代码片段、例子或原文判断。',
    '- 结构必须固定为：第 1 页 cover，第 2 页 intro，最后 1 页 summary；中间页面才承载正文教学序列。',
    '- cover 的 htmlPrompt 必须要求内置封面背景/主视觉语言，例如 tech_hero_title / cinematic_title_frame / academic_hero_cover / image_title_overlay；主标题是唯一必须文字，副标题/来源/短标签都可选，不能做空白白底封面。',
    '- intro 必须说明为什么学、学习路径和入口问题；summary 必须收束 takeaway、回看路径和下一步问题。',
    '- courseRoute / csRoute / mathRoute 必须和源材料匹配；数学页用数学结构，CS 页用合适的标准页或专属语义页。',
    '- canvasMode 必须由内容密度决定：普通页保持 slide；略微放不下但仍是单个教学动作的页设为 tall；完整证明、长推导、完整例题、代码 trace、memory/call stack 等纵向过程页才设为 long。',
    '- 如果引用 sourceImageIds，只能引用原文图片清单中真实存在的 ID。',
    '- htmlPrompt 必须只是 slideOutline 的渲染翻译，不能新增第二主题。',
    '',
    '上一版规划 JSON（用于定位问题，不要照抄错误）：',
    JSON.stringify(args.previousPlan, null, 2).slice(0, 18000),
    '',
    '现在返回修复后的完整 JSON。只返回 JSON，不要 markdown。',
  ].join('\n');
}

function normalizeSlideTeachingOutline(
  value: unknown,
  index: number,
  fallbackTitle: string,
): SlideTeachingOutline {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const title = compactText(String(record.title || fallbackTitle || `第 ${index + 1} 页`), 120);
  return {
    id: compactText(String(record.id || `slide-${index + 1}`), 80) || `slide-${index + 1}`,
    order: index + 1,
    title,
    canvasMode:
      record.canvasMode === 'long' || record.canvasMode === 'tall' || record.canvasMode === 'slide'
        ? (record.canvasMode as HtmlCanvasMode)
        : undefined,
    canvasHeight:
      typeof record.canvasHeight === 'number'
        ? record.canvasHeight
        : typeof record.canvasHeight === 'string'
          ? Number.parseInt(record.canvasHeight, 10)
          : undefined,
    learnerQuestion: compactText(String(record.learnerQuestion || `这一页要解决：${title}`), 220),
    teachingObjective: compactText(
      String(record.teachingObjective || record.objective || title),
      260,
    ),
    keyPoints: toStringArray(record.keyPoints, 6),
    sourceAnchors: toStringArray(record.sourceAnchors, 8),
    sourceImageIds: toStringArray(record.sourceImageIds, 4).filter((id) =>
      /^[A-Za-z0-9_.:-]+$/.test(id),
    ),
    sourceUseRationale: compactText(
      String(
        record.sourceUseRationale ||
          '保留源材料的核心学习目标，并按页面容量决定直接使用、改写或换例。',
      ),
      260,
    ),
    visualPlan: compactText(
      String(record.visualPlan || '用可编辑 DOM 结构呈现本页关键判断。'),
      260,
    ),
    mandatoryVisibleContent: toStringArray(record.mandatoryVisibleContent, 10),
    optionalContent: toStringArray(record.optionalContent, 8),
  };
}

function synthesizeHtmlPromptFromStructuredSlide(args: {
  lessonTitle: string;
  pageCount: number;
  slide: Partial<LessonSlidePlan> & {
    title?: string;
    pageKind?: HtmlPageKind;
    objective?: string;
    learnerQuestion?: string;
    keyPoints?: string[];
    sourceAnchors?: string[];
    sourceImageIds?: string[];
    sourceUseRationale?: string;
    visualPlan?: string;
    mandatoryVisibleContent?: string[];
    optionalContent?: string[];
    density?: DensityLevel;
    courseRoute?: HtmlCourseRoute;
    csRoute?: HtmlCsRoute;
    mathRoute?: HtmlMathRoute;
    canvasMode?: HtmlCanvasMode;
    canvasHeight?: number;
    contentBudget?: LessonSlidePlan['contentBudget'];
  };
  order: number;
}): string {
  const slide = args.slide;
  const title = compactText(String(slide.title || `第 ${args.order} 页`), 120);
  const pageKind = slide.pageKind || (args.order === 1 ? 'cover' : 'summary');
  const isCover = pageKind === 'cover';
  const canvasMode =
    slide.canvasMode === 'long' || slide.canvasMode === 'tall' ? slide.canvasMode : 'slide';
  const canvasHeight = normalizeCanvasHeight(
    slide.canvasHeight,
    canvasMode,
    slide.density || 'standard',
  );
  const keyPoints = isCover ? title : slide.keyPoints?.length ? slide.keyPoints.join('；') : title;
  const mandatory = isCover
    ? `主标题「${title}」；内置封面背景/主视觉`
    : slide.mandatoryVisibleContent?.length
      ? slide.mandatoryVisibleContent.join('；')
      : keyPoints;
  const optional = isCover
    ? '一句短副标题、来源信息、1-2 个短标签'
    : slide.optionalContent?.length
      ? slide.optionalContent.join('；')
      : '邻近上下文、装饰标签、额外解释';
  const sourceAnchors = isCover
    ? `整本 notebook 主题：${title}`
    : slide.sourceAnchors?.length
      ? slide.sourceAnchors.join('；')
      : '源材料主线';
  const sourceImages = isCover
    ? '无，封面使用内置背景'
    : slide.sourceImageIds?.length
      ? slide.sourceImageIds.join(', ')
      : '无';
  const sourceUseRationale = isCover
    ? '封面只使用整本 notebook 标题和课程主题，不展开具体 source page。'
    : slide.sourceUseRationale || '保留源材料核心目标，并按页面容量做取舍。';
  const budget = slide.contentBudget;
  const structuralGuidance = structuralPromptGuidance({
    pageKind,
    courseRoute: slide.courseRoute,
    order: args.order,
    pageCount: args.pageCount,
  });
  const canvasLead =
    canvasMode === 'long'
      ? `生成一张宽 1600px、目标高度约 ${canvasHeight}px 的自包含 HTML/CSS 长页面教学版式，不是 16:9 单屏 PPT。`
      : canvasMode === 'tall'
        ? `生成一张宽 1600px、高约 ${canvasHeight}px 的自包含 HTML/CSS 中高课件页，比 16:9 更高但不是网页文章。`
        : `生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面。`;
  const canvasLabel =
    canvasMode === 'long'
      ? `长页面，canvasHeight=${canvasHeight}`
      : canvasMode === 'tall'
        ? `中高页面，canvasHeight=${canvasHeight}`
        : '标准 16:9，canvasHeight=900';
  return [
    canvasLead,
    `Notebook：${args.lessonTitle}`,
    `第 ${args.order} 页 / 共 ${args.pageCount} 页。`,
    `页面标题：${title}`,
    `页面类型：${pageKind}`,
    ...structuralGuidance,
    `画布模式：${canvasLabel}`,
    slide.courseRoute ? `课程路线：${slide.courseRoute}` : '',
    slide.csRoute ? `CS 版式：${slide.csRoute}` : '',
    slide.mathRoute ? `数学版式：${slide.mathRoute}` : '',
    isCover
      ? '封面目标：让学生一眼识别 notebook 主题；不要开始讲正文。'
      : `本页唯一学习问题：${slide.learnerQuestion || `为什么要理解「${title}」？`}`,
    `教学目标：${slide.objective || title}`,
    `关键点：${keyPoints}`,
    `视觉计划：${slide.visualPlan || '用可编辑 DOM 结构呈现，不做长讲义。'}`,
    `必需保留清单：${mandatory}`,
    `可删内容清单：${optional}`,
    `源材料锚点：${sourceAnchors}`,
    `sourceImageIds：${sourceImages}`,
    `源材料取舍理由：${sourceUseRationale}`,
    budget
      ? `容量预算：可见中文/等价字符 ${budget.visibleCharsMin}-${budget.visibleCharsMax}，最多 ${budget.mainRegions} 个主要内容区，最多 ${budget.blockCount} 个内容块。`
      : '',
    canvasMode !== 'slide'
      ? '布局要求：用纵向 section 自然展开；不要把底部条、例子卡或结论卡叠在前面内容上；允许纵向阅读但禁止横向滚动。'
      : '布局要求：主内容必须用正常 flex/grid flow；不要让底部条、例子卡或结论卡覆盖上方内容。',
    canvasMode !== 'slide'
      ? '明确禁止：横向滚动、内容重叠、裁切、DOM 横向越界、负坐标、网页文章化、无关公式、无关例题、用 fixed height 裁掉正文。'
      : '明确禁止：滚动、裁切、DOM 越界、负坐标、长讲义、无关公式、无关例题、用 fixed height 裁掉正文。',
  ]
    .filter(Boolean)
    .join('\n');
}

function csRouteLabel(route: HtmlCsRoute | undefined): string {
  const labels: Record<HtmlCsRoute, string> = {
    standard: 'standard（标准 CS 课程页）',
    'execution-trace': 'Execution Trace / 代码执行追踪',
    'memory-diagram': 'Memory Diagram / Stack + Heap + References',
    'call-stack': 'Call Stack / 递归调用栈',
    'pointer-diagram': 'Pointer Diagram / 链表指针图',
    'tree-diagram': 'Tree / BST Diagram',
    'graph-trace': 'Graph Trace / frontier + visited',
    'linear-structure': 'Linear Structure / Stack or Queue',
    'dictionary-diagram': 'Dictionary Diagram / key-value 映射',
    'invariant-check': 'Invariant Check / 结构合法性检查',
    'composite-operation': 'Composite Operation / 综合操作页',
  };
  return labels[route || 'standard'];
}

function mathRouteLabel(route: HtmlMathRoute | undefined): string {
  const labels: Record<HtmlMathRoute, string> = {
    standard: 'standard（标准数学课程页）',
    'definition-theorem': 'Definition / Theorem Board',
    'formula-focus': 'Formula Focus / 核心公式页',
    derivation: 'Derivation Ladder / 推导阶梯',
    proof: 'Proof Walkthrough / 证明讲解',
    'worked-example': 'Worked Example / 例题拆解',
    'concept-map': 'Concept Map / 概念关系图',
    'comparison-table': 'Comparison / Case Table',
  };
  return labels[route || 'standard'];
}

function enforceHtmlPromptContract(slide: LessonSlidePlan, pageCount: number): LessonSlidePlan {
  const deletePriority = slide.contentBudget.mustDeleteIfCrowded.length
    ? slide.contentBudget.mustDeleteIfCrowded.join('；')
    : '邻近上下文、装饰标签、次级解释、额外例子';
  const isCover = slide.pageKind === 'cover';
  const isLongCanvas = slide.canvasMode === 'long';
  const isExpandedCanvas = slide.canvasMode !== 'slide';
  const structuralGuidance = structuralPromptGuidance({
    pageKind: slide.pageKind,
    courseRoute: slide.courseRoute,
    order: slide.order,
    pageCount,
  });
  const guardrail = [
    '',
    '硬性生成契约（必须逐条遵守）：',
    isLongCanvas
      ? `- 本页已规划为长页面：宽 1600px，目标高度约 ${slide.canvasHeight}px；不要把它压回 16:9，也不要用覆盖/叠放假装放下内容。`
      : slide.canvasMode === 'tall'
        ? `- 本页已规划为中高课件页：宽 1600px，高约 ${slide.canvasHeight}px；不要压回 16:9，也不要继续塞成网页文章。`
        : '- 本页已规划为标准 16:9 页面：1600×900；不要自行改成长页面或纵向滚动页。',
    `- 页面 H1/主标题必须逐字显示为「${slide.title}」；如果上文另有标题或同义标题，以本条为准。`,
    isCover
      ? `- 封面页可以不显示页码；如果显示，必须对应第 ${slide.order} 页 / 共 ${pageCount} 页。`
      : `- 页码必须对应第 ${slide.order} 页 / 共 ${pageCount} 页。`,
    isCover
      ? '- 封面页只强制主标题和封面背景/主视觉；副标题、来源和短标签都可选，拥挤时优先删除。'
      : '- 必须完整呈现本 prompt 明确列出的每个块、编号条目、公式、步骤、短理由、结论和检查点；不能为了版式省略必需内容。',
    !isCover && slide.learnerQuestion ? `- 本页必须回答的学习问题：${slide.learnerQuestion}` : '',
    !isCover && slide.keyPoints.length ? `- 本页关键点只能围绕：${slide.keyPoints.join('；')}` : '',
    slide.visualPlan ? `- 本页视觉计划：${slide.visualPlan}` : '',
    ...structuralGuidance.map((line) => `- ${line}`),
    !isCover && slide.mandatoryVisibleContent.length
      ? `- 必需保留清单：${slide.mandatoryVisibleContent.join('；')}`
      : '',
    !isCover && slide.optionalContent.length
      ? `- 可删/可弱化内容：${slide.optionalContent.join('；')}`
      : '',
    isCover
      ? '- 封面可见文字建议不超过 160 个中文/等价字符；主标题要最大，其他文字小而少。'
      : '- 如果标题或内容要求出现确定数量（例如 5 个问题、4 步流程、3 条 takeaway、两句理由），实际可见内容数量必须完全一致。',
    isCover
      ? `- 如果拥挤，只能优先删这些次要内容：${deletePriority}；不能删主标题，也不能退化成白底空页。`
      : `- 如果拥挤，只能优先删这些次要内容：${deletePriority}；不能删标题、核心公式、步骤、理由、结论或检查点。`,
    isExpandedCanvas
      ? '- 主内容区必须用纵向 section + 正常 flex/grid 文档流展开；结论、检查点、例题结果必须是后续 section，不能浮在中间内容上。'
      : '- 主内容区必须用正常 flex/grid 文档流排版；不要让底部条、例子卡、结论卡覆盖上方卡片。',
    '- 承载正文、公式、表格或步骤的卡片不能用过小 fixed height/max-height 加 overflow:hidden 裁掉内容；必须让内部文字完整可见。',
    '- 数学符号必须精确：复合函数用 ∘，笛卡尔积用 ×，逆像用 f^{-1} 或等价 MathML；不要把 ∘ 写成 ·，不要把 × 写成 x。',
    `- 本页课程路线必须按「${slide.courseRoute}」处理，不要改成普通通用总结页。`,
    slide.courseRoute === 'computer-science'
      ? `- 本页 CS 版式必须按「${csRouteLabel(slide.csRoute)}」处理；如果不是 standard，页面必须出现对应的语义结构，而不是普通 bullet/cards。`
      : '',
    slide.courseRoute === 'math'
      ? `- 本页数学版式必须按「${mathRouteLabel(slide.mathRoute)}」处理；如果不是 standard，页面必须出现对应的数学结构，而不是泛泛定义页。`
      : '',
    !isCover && slide.sourceAnchors.length
      ? `- 本页源材料锚点必须可见地转化为页面内容：${slide.sourceAnchors.join('；')}`
      : isCover
        ? '- 封面可以只使用整本 notebook 标题/课程主题作为来源，不需要展示具体 source anchor。'
        : '- 本页必须至少有一个清晰的源材料锚点，不要生成脱离源文件的泛泛总结。',
    !isCover && slide.sourceUseRationale
      ? `- 本页源材料取舍理由必须被遵守：${slide.sourceUseRationale}`
      : isCover
        ? ''
        : '- 本页必须说明为什么直接使用、改写、换例或综合源材料。',
    slide.sourceImageIds.length
      ? [
          `- 本页必须使用这些原文图片 ID：${slide.sourceImageIds.join(', ')}；HTML 中先写 <img src="${slide.sourceImageIds[0]}"> 这样的图片 ID 占位，不要改写为外链或虚构 ID。`,
          '- 原文图片标题/说明必须描述图片真实内容和教学作用；不要把视觉样例、照片或截图误称为架构图、表格、流程图或结果图。',
          '- 同一页不要重复渲染同一个 source image；如果需要对比多个概念，使用 DOM 文本、表格或卡片完成对比。',
        ].join('\n')
      : '- 如果没有分配原文图片，不要虚构 img_1/source image，也不要假装看到了原文图表。',
    isExpandedCanvas
      ? `- 所有 DOM 元素都必须在宽 1600px、目标高约 ${slide.canvasHeight}px 的页面画布内；允许纵向阅读，但禁止横向滚动、覆盖、裁切、负坐标或超大容器。`
      : '- 所有 DOM 元素都必须在 1600×900 内；不要靠滚动、裁切、负坐标或超大容器解决容量问题。',
    slide.pageKind === 'cover'
      ? '- 封面必须有封面级背景/主视觉；优先使用 /slide-backgrounds/ 下的本地内置背景，或使用 CSS gradient、可编辑 DOM 装饰、数据网络/电影感框景/学术几何路径等内置封面视觉语言；不要调用外部图片 URL。'
      : '',
    slide.pageKind === 'intro'
      ? '- 这是介绍/导入页：必须帮助学生理解学习入口和路径，不要替代第一张正文讲解页。'
      : '',
    slide.pageKind === 'summary'
      ? '- 这是总结页：必须收束已经讲过的内容，不要新增未讲过的新知识点。'
      : '',
  ].join('\n');
  const htmlPrompt = `${slide.htmlPrompt}\n${guardrail}`.slice(0, 7600);
  return { ...slide, htmlPrompt };
}

function forceComputerScienceRouteMix(
  slides: LessonSlidePlan[],
  contextText: string,
): LessonSlidePlan[] {
  if (slides.length <= 1) return slides;
  if (slides.some((slide) => slide.csRoute && slide.csRoute !== 'standard')) return slides;

  const forcedRoute = inferCsRouteFromText(contextText);
  const route = forcedRoute === 'standard' ? 'memory-diagram' : forcedRoute;
  const targetIndex = slides.findIndex(
    (slide, index) => index > 0 && !['cover', 'intro', 'summary'].includes(slide.pageKind),
  );
  if (targetIndex < 0) return slides;

  return slides.map((slide, index) => {
    if (index !== targetIndex) return slide;
    const forcedPrompt = [
      slide.htmlPrompt,
      '',
      'CS 专属版式要求（来自规划一致性检查，必须遵守）：',
      `- 本页必须使用 CS 版式：${csRouteLabel(route)}。`,
      '- 不能做普通 bullet 总结页；必须出现该版式对应的可编辑 DOM 结构。',
      route === 'memory-diagram'
        ? '- 至少展示 stack/name 区、heap/object 区、reference/attribute 关系区。'
        : '',
      route === 'pointer-diagram'
        ? '- 至少展示节点卡片、next/prev 指针字段、操作前后的关键指向。'
        : '',
      route === 'execution-trace' ? '- 至少展示关键代码、当前行、变量状态、下一步判断。' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      ...slide,
      pageKind: slide.pageKind === 'summary' ? 'code' : slide.pageKind,
      courseRoute: 'computer-science',
      csRoute: route,
      htmlPrompt: forcedPrompt,
    };
  });
}

function normalizePlan(
  raw: unknown,
  tier: PageCountTier,
  context?: { routeHint?: HtmlCourseRoute; contextText?: string },
): LessonPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const rawSlides = Array.isArray(record.slides) ? record.slides : [];
  const rawSlideOutlines = Array.isArray(record.slideOutlines) ? record.slideOutlines : [];
  const bounds = tierBounds(tier);
  const contextRoute = context?.routeHint || 'general';
  const contextText = context?.contextText || '';
  const coursePlan = normalizeCoursePlan(
    record.coursePlan,
    String(record.lessonTitle || 'HTML 课程'),
  );
  const slideOutlines = rawSlideOutlines
    .slice(0, bounds.max)
    .map((outline, index) => normalizeSlideTeachingOutline(outline, index, `第 ${index + 1} 页`));
  const boundedRawSlides = rawSlides.slice(0, bounds.max);
  const slides = boundedRawSlides
    .map((slide, index): LessonSlidePlan | null => {
      if (!slide || typeof slide !== 'object') return null;
      const item = slide as Record<string, unknown>;
      const outline = normalizeSlideTeachingOutline(
        rawSlideOutlines[index],
        index,
        String(item.title || `第 ${index + 1} 页`),
      );
      const rawBudget =
        item.contentBudget && typeof item.contentBudget === 'object'
          ? (item.contentBudget as Record<string, unknown>)
          : {};
      const title = compactText(String(item.title || `第 ${index + 1} 页`), 120);
      const pageKind = normalizePageKind(item.pageKind, index === 0 ? 'cover' : 'summary');
      const normalizedPageKind = structuralPageKind(index, boundedRawSlides.length, pageKind);
      const routeText = [
        title,
        item.objective,
        item.htmlPrompt,
        item.learnerQuestion,
        item.keyPoints,
        item.sourceCoverage,
        item.sourceAnchors,
        item.sourceUseRationale,
        item.mandatoryVisibleContent,
        outline.learnerQuestion,
        outline.keyPoints,
        outline.sourceUseRationale,
        contextText,
      ]
        .flat()
        .filter(Boolean)
        .join('\n');
      const inferredRoute = inferCourseRouteFromText(routeText, normalizedPageKind);
      const courseRoute = normalizeCourseRoute(
        item.courseRoute,
        inferredRoute === 'general' ? contextRoute : inferredRoute,
      );
      const csRoute =
        courseRoute === 'computer-science'
          ? normalizedPageKind === 'cover'
            ? 'standard'
            : normalizeCsRoute(item.csRoute, routeText)
          : undefined;
      const mathRoute =
        courseRoute === 'math'
          ? normalizedPageKind === 'cover'
            ? 'standard'
            : normalizeMathRoute(item.mathRoute, routeText, normalizedPageKind)
          : undefined;
      const density = normalizeDensity(item.density);
      const canvasMode = inferCanvasModeFromSlide({
        value: item.canvasMode || outline.canvasMode,
        pageKind: normalizedPageKind,
        courseRoute,
        csRoute,
        mathRoute,
        density,
        text: routeText,
      });
      const canvasHeight = normalizeCanvasHeight(
        item.canvasHeight || outline.canvasHeight,
        canvasMode,
        density,
      );
      const isCoverPage = normalizedPageKind === 'cover';
      const minChars = toSafeInt(rawBudget.visibleCharsMin as number | undefined);
      const maxChars = toSafeInt(rawBudget.visibleCharsMax as number | undefined);
      const defaultMinChars = isCoverPage
        ? 20
        : canvasMode === 'long'
          ? density === 'light'
            ? 360
            : 480
          : canvasMode === 'tall'
            ? density === 'light'
              ? 180
              : 260
            : density === 'light'
              ? 70
              : 110;
      const defaultMaxChars = isCoverPage
        ? 160
        : canvasMode === 'long'
          ? density === 'dense'
            ? 1300
            : 1000
          : canvasMode === 'tall'
            ? density === 'dense'
              ? 760
              : 620
            : density === 'dense'
              ? 360
              : 280;
      const contentBudget = {
        visibleCharsMin: minChars > 0 ? minChars : defaultMinChars,
        visibleCharsMax: maxChars > 0 ? maxChars : defaultMaxChars,
        mainRegions: isCoverPage
          ? 1
          : canvasMode === 'long'
            ? Math.min(7, Math.max(3, toSafeInt(rawBudget.mainRegions as number) || 5))
            : canvasMode === 'tall'
              ? Math.min(5, Math.max(2, toSafeInt(rawBudget.mainRegions as number) || 3))
              : Math.min(3, Math.max(1, toSafeInt(rawBudget.mainRegions as number) || 2)),
        blockCount: isCoverPage
          ? 2
          : canvasMode === 'long'
            ? Math.min(16, Math.max(6, toSafeInt(rawBudget.blockCount as number) || 10))
            : canvasMode === 'tall'
              ? Math.min(12, Math.max(4, toSafeInt(rawBudget.blockCount as number) || 7))
              : Math.min(8, Math.max(2, toSafeInt(rawBudget.blockCount as number) || 4)),
        mustDeleteIfCrowded: isCoverPage
          ? ['副标题', '来源信息', '短标签']
          : toStringArray(rawBudget.mustDeleteIfCrowded, 6),
      };
      const learnerQuestion = compactText(
        String(
          item.learnerQuestion ||
            outline.learnerQuestion ||
            (isCoverPage ? `这本 notebook 的主题是什么？` : `这一页要解决：${title}`),
        ),
        220,
      );
      const keyPoints = toStringArray(item.keyPoints, 6);
      const mergedKeyPoints = isCoverPage
        ? [title]
        : keyPoints.length
          ? keyPoints
          : outline.keyPoints;
      const sourceAnchors = toStringArray(item.sourceAnchors, 8);
      const mergedSourceAnchors = isCoverPage
        ? [`整本 notebook 主题：${title}`]
        : sourceAnchors.length
          ? sourceAnchors
          : outline.sourceAnchors;
      const sourceImageIds = isCoverPage
        ? []
        : toStringArray(item.sourceImageIds, 4)
            .concat(outline.sourceImageIds)
            .filter(
              (id, idIndex, all) => /^[A-Za-z0-9_.:-]+$/.test(id) && all.indexOf(id) === idIndex,
            )
            .slice(0, 4);
      const sourceUseRationale = compactText(
        String(
          item.sourceUseRationale ||
            outline.sourceUseRationale ||
            (isCoverPage
              ? '封面只使用整本 notebook 标题和课程主题，不展开具体 source page。'
              : '保留源材料的核心学习目标，并按页面容量决定直接使用、改写或换例。'),
        ),
        260,
      );
      const visualPlan = compactText(
        String(
          item.visualPlan ||
            outline.visualPlan ||
            (isCoverPage
              ? '全幅内置封面背景 + 大标题叠加。'
              : '用可编辑 DOM 结构呈现本页关键判断。'),
        ),
        260,
      );
      const mandatoryVisibleContent = toStringArray(item.mandatoryVisibleContent, 10);
      const mergedMandatoryVisibleContent = isCoverPage
        ? [`主标题「${title}」`, '内置封面背景/主视觉']
        : mandatoryVisibleContent.length
          ? mandatoryVisibleContent
          : outline.mandatoryVisibleContent.length
            ? outline.mandatoryVisibleContent
            : mergedKeyPoints;
      const optionalContent = toStringArray(item.optionalContent, 8);
      const mergedOptionalContent = isCoverPage
        ? ['一句短副标题', '来源信息', '1-2 个短标签']
        : optionalContent.length
          ? optionalContent
          : outline.optionalContent;
      let htmlPrompt = typeof item.htmlPrompt === 'string' ? item.htmlPrompt.trim() : '';
      if (!htmlPrompt || htmlPrompt.length < 120) {
        htmlPrompt = synthesizeHtmlPromptFromStructuredSlide({
          lessonTitle: compactText(String(record.lessonTitle || 'HTML 整节课测试'), 120),
          pageCount: bounds.max,
          order: index + 1,
          slide: {
            title,
            pageKind: normalizedPageKind,
            objective: compactText(
              String(item.objective || outline.teachingObjective || title),
              260,
            ),
            learnerQuestion,
            keyPoints: mergedKeyPoints,
            sourceAnchors: mergedSourceAnchors,
            sourceImageIds,
            sourceUseRationale,
            visualPlan,
            mandatoryVisibleContent: mergedMandatoryVisibleContent,
            optionalContent: mergedOptionalContent,
            density,
            courseRoute,
            csRoute,
            mathRoute,
            canvasMode,
            canvasHeight,
            contentBudget,
          },
        });
      }
      if (!htmlPrompt || htmlPrompt.length < 120) return null;
      return {
        id: compactText(String(item.id || `slide-${index + 1}`), 80) || `slide-${index + 1}`,
        order: index + 1,
        title,
        pageKind: normalizedPageKind,
        canvasMode,
        canvasHeight,
        courseRoute,
        csRoute,
        mathRoute,
        density,
        densityTarget: density,
        objective: compactText(String(item.objective || title), 260),
        learnerQuestion,
        keyPoints: mergedKeyPoints,
        sourceCoverage: toStringArray(item.sourceCoverage, 6),
        sourceAnchors: mergedSourceAnchors,
        sourceImageIds,
        sourceUseRationale,
        visualPlan,
        mandatoryVisibleContent: mergedMandatoryVisibleContent,
        optionalContent: mergedOptionalContent,
        sourceUsage: normalizeSourceUsage(item.sourceUsage),
        contentBudget,
        htmlPrompt: htmlPrompt.slice(0, 5000),
      };
    })
    .filter((slide): slide is LessonSlidePlan => Boolean(slide));

  if (slides.length < bounds.min || slides.length > bounds.max) return null;
  const routedSlides =
    contextRoute === 'computer-science'
      ? forceComputerScienceRouteMix(
          slides.map((slide) => ({
            ...slide,
            courseRoute: slide.courseRoute === 'general' ? 'computer-science' : slide.courseRoute,
            csRoute:
              slide.courseRoute === 'computer-science' || slide.courseRoute === 'general'
                ? slide.csRoute ||
                  normalizeCsRoute(undefined, [slide.htmlPrompt, contextText].join('\n'))
                : slide.csRoute,
          })),
          contextText,
        )
      : slides;
  const slidesWithPromptContract = routedSlides.map((slide) =>
    enforceHtmlPromptContract(slide, slides.length),
  );

  return {
    lessonTitle: compactText(String(record.lessonTitle || 'HTML 整节课测试'), 120),
    pageCountTier: tier,
    pageCount: slidesWithPromptContract.length,
    coursePlan: {
      ...coursePlan,
      narrativeArc: coursePlan.narrativeArc.length
        ? coursePlan.narrativeArc
        : slidesWithPromptContract.map((slide) => slide.title).slice(0, 8),
      coreQuestions: coursePlan.coreQuestions.length
        ? coursePlan.coreQuestions
        : slidesWithPromptContract.map((slide) => slide.learnerQuestion).slice(0, 8),
    },
    slideOutlines: slidesWithPromptContract.map((slide, index) => {
      const outline = slideOutlines[index];
      return {
        id: slide.id,
        order: slide.order,
        title: slide.title,
        canvasMode: slide.canvasMode,
        canvasHeight: slide.canvasHeight,
        learnerQuestion: slide.learnerQuestion || outline?.learnerQuestion || '',
        teachingObjective: slide.objective || outline?.teachingObjective || '',
        keyPoints: slide.keyPoints?.length ? slide.keyPoints : outline?.keyPoints || [],
        sourceAnchors: slide.sourceAnchors?.length
          ? slide.sourceAnchors
          : outline?.sourceAnchors || [],
        sourceImageIds: slide.sourceImageIds?.length
          ? slide.sourceImageIds
          : outline?.sourceImageIds || [],
        sourceUseRationale: slide.sourceUseRationale || outline?.sourceUseRationale || '',
        visualPlan: slide.visualPlan || outline?.visualPlan || '',
        mandatoryVisibleContent: slide.mandatoryVisibleContent?.length
          ? slide.mandatoryVisibleContent
          : outline?.mandatoryVisibleContent || [],
        optionalContent: slide.optionalContent?.length
          ? slide.optionalContent
          : outline?.optionalContent || [],
      };
    }),
    planningNotes: toStringArray(record.planningNotes, 8),
    slides: slidesWithPromptContract,
  };
}

function parsePlan(
  text: string,
  tier: PageCountTier,
  context?: { routeHint?: HtmlCourseRoute; contextText?: string },
): LessonPlan | null {
  try {
    return normalizePlan(JSON.parse(extractJsonObject(text)), tier, context);
  } catch {
    return null;
  }
}

function describePlanParseFailure(text: string, tier: PageCountTier): string {
  const bounds = tierBounds(tier);
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
    if (!slides.length) {
      return `规划输出没有 slides 数组；当前档位要求 ${bounds.min}-${bounds.max} 页。`;
    }
    if (slides.length < bounds.min) {
      return `规划页数不足：当前档位要求 ${bounds.min}-${bounds.max} 页，但模型只返回 ${slides.length} 页。`;
    }
    if (slides.length > bounds.max) {
      return `规划页数过多：当前档位要求 ${bounds.min}-${bounds.max} 页，但模型返回 ${slides.length} 页。`;
    }
    return `规划 JSON 结构不完整或页面字段不合格；当前档位要求 ${bounds.min}-${bounds.max} 页，每页必须包含 title/pageKind/canvasMode/canvasHeight/sourceAnchors/sourceUseRationale/htmlPrompt 等字段。`;
  } catch (error) {
    return `规划输出不是可解析 JSON：${error instanceof Error ? error.message : String(error)}`;
  }
}

function sourcePagesForPrompt(sourcePages: SourcePageInput[]): string {
  return compactSourcePages(sourcePages)
    .map((page) =>
      [
        `源页 ${page.sourceIndex}${page.sourceLabel ? `（${page.sourceLabel}）` : ''}: ${page.title}`,
        page.summary ? `摘要：${page.summary}` : '',
        page.keyPoints?.length ? `关键点：${page.keyPoints.join('；')}` : '',
        page.concreteAnchor ? `可用素材：${page.concreteAnchor}` : '',
        page.imageIds?.length ? `本源页可用原文图片：${page.imageIds.join(', ')}` : '',
        page.suggestedPageKind ? `已有页型信号：${page.suggestedPageKind}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

function sourceImagesForPrompt(sourceImages: SourceImageInput[]): string {
  const compactImages = compactSourceImages(sourceImages);
  if (compactImages.length === 0) return '无可用原文图片。';
  return compactImages
    .map((image) => {
      const size = image.width && image.height ? `，尺寸 ${image.width}×${image.height}` : '';
      const bytes = image.byteLength ? `，约 ${Math.round(image.byteLength / 1024)} KB` : '';
      return [
        `- ${image.id}: 第 ${image.pageNumber || '?'} 页${size}${bytes}`,
        image.description ? `  说明：${image.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
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
    const sourceImages = compactSourceImages(sourcePackage?.sourceImages);
    const sourceText = compactText(sourcePackage?.sourceText, 12000);
    const effectiveFileName = sourcePackage?.fileName || body.fileName;
    const effectiveFileType = sourcePackage?.fileType || body.fileType || 'unknown';
    const imageUsePolicy = body.imageUsePolicy || 'prefer-source-images';
    if (!effectiveFileName || sourcePages.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing fileName or sourcePages');
    }
    const isNotebookMode = body.mode === 'notebook';
    const planningContextText = [
      sourcePackage?.subject,
      body.subject,
      body.title,
      effectiveFileName,
      sourcePackage?.fileName,
      sourcePages
        .slice(0, 10)
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
    const planningVisionImages = modelInfo?.capabilities?.vision
      ? sourceImagesForVision(sourcePackage?.sourceImages)
      : [];
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);

    const system = [
      'You are a senior curriculum planner and presentation prompt engineer.',
      isNotebookMode
        ? 'Your job is to plan an entire subject notebook deck from one uploaded notebook source file, then write the exact prompt for each slide that will be sent to a separate HTML/CSS slide generator.'
        : 'Your job is to plan an entire lesson deck from uploaded-file source material, then write the exact prompt for each slide that will be sent to a separate HTML/CSS slide generator.',
      'All visible slide content must be Simplified Chinese, except code identifiers, API names, variables, filenames, and unavoidable source terms.',
      'You must control slide capacity upstream. Do not ask a later HTML generator to fit too much content into one page.',
      'A slide prompt should describe one focused teaching move, a small amount of content, and an explicit content budget.',
      'You must decide the canvas upstream. Use canvasMode "slide" for concise 1600×900 pages, "tall" for ordinary teaching pages that need 1200-1400px height, and "long" only for real vertical walkthroughs such as math proofs/long derivations and CS trace/memory/code walkthroughs.',
      'Tall/long pages are deliberate formats, not layout escapes. Use "tall" when a 16:9 slide would force footer overlap but the page is still one compact teaching move; use "long" only when the teaching action genuinely needs a vertical sequence.',
      'For mathematics source files, first identify the canonical mathematical object, notation, representation, and verification move from the source. The visual plan must use editable mathematical structures such as definition boards, symbolic notation, tables, diagrams, derivation ladders, proof blocks, or worked examples. Do not ask for decorative/AI illustrations as the main teaching visual.',
      'When adapting examples, choose small examples that preserve the source concept and can be checked on the slide. Do not introduce whimsical symbols, decorative sets, or new notation unless the source uses them.',
      'When source figures are attached as vision input, inspect the actual images before assigning any sourceImageIds.',
      'Do not assign sourceImageIds by page number, filename, or source proximity alone. An image can support a slide only when its actual visual content matches the slide objective.',
      'Never call a photo, sample frame, or visual example an architecture diagram, table, chart, pipeline, or flowchart unless it visibly is one.',
      'Do not repeat the same source image across multiple slides unless the plan intentionally performs close reading of the same figure from different angles, and explain that reason in planningNotes and htmlPrompt.',
      'If no source image visually supports a slide, leave sourceImageIds empty. Do not force images for decoration.',
      'The first slide must be a cover slide with pageKind "cover"; it is not an intro lesson slide, the title is the only mandatory visible text, and it must not contain the first teaching explanation.',
      'The second slide must be an intro slide with pageKind "intro"; it should orient the learner before the first content explanation.',
      'The final slide must be a summary slide with pageKind "summary"; it should consolidate the notebook and must not introduce a new topic.',
      'A slide prompt must also name the subject route when it is clear: math, computer-science, science, business, humanities, or social-science. The downstream HTML generator will use that route as a hard teaching-grammar constraint.',
      'The slide title and the title requested inside htmlPrompt must be identical. Do not use one title for planning and another title for rendering.',
      'Every htmlPrompt must separate mandatory content from optional/deletable content. Mandatory content includes title, stated counts, core formulas, reasons, conclusions, and checkpoints.',
      'If a slide title or prompt says a number of items, the prompt must list exactly that many visible items and forbid changing the count.',
      'The deck structure must be: slide 1 cover, slide 2 intro, final slide summary. Only slides between intro and summary may carry the main source teaching sequence.',
      'When a slide contains definitions plus example/checkpoint content, the prompt must tell the HTML generator to use non-overlapping flex/grid flow and to reduce optional copy instead of clipping cards.',
      'You may adapt or replace a source example with a shorter equivalent example when that better fits the slide, but keep the same learning objective, mark sourceUsage as adapted or new-example, and explain the reason in sourceUseRationale.',
      'Do not plan lecture notes, narration, animation, or teacher actions. Only plan static editable HTML PPT slides.',
      'Return JSON only. No markdown fences, no explanation.',
    ].join('\n');

    const prompt = [
      isNotebookMode
        ? '为下面这个 testfile 科目目录里的单个文件规划一本完整 notebook 的 HTML PPT slides。'
        : '为下面这个 testfile 源文件规划一整节课的 HTML PPT slides。',
      '',
      isNotebookMode
        ? `科目：${sourcePackage?.subject || body.subject || body.title || effectiveFileName}`
        : `文件：${effectiveFileName}（${effectiveFileType}）`,
      isNotebookMode ? `来源文件数：${body.sourceFileCount || '-'}` : '',
      isNotebookMode
        ? `Notebook 标题：${body.title || effectiveFileName}`
        : `文件主题：${body.title || effectiveFileName}`,
      isNotebookMode
        ? `Notebook 说明：${body.description || '-'}`
        : `文件说明：${body.description || '-'}`,
      `源材料长度：${sourcePackage?.sourceText?.length || body.sourceTextLength || 0}`,
      `源材料解析器：${sourcePackage?.parser || '-'}`,
      `原文图片数量：${sourceImages.length}`,
      planningVisionImages.length
        ? `原文图片视觉输入：已随本次请求附带 ${planningVisionImages.length} 张可看原图；必须先看图再决定 sourceImageIds。`
        : '原文图片视觉输入：无可看原图或当前模型未启用 vision；只能依赖图片说明，不确定时不要分配图片。',
      `原文图片策略：${imageUsePolicy === 'prefer-source-images' ? '优先复用原文图片' : '文本优先，图片只在必要时使用'}`,
      sourcePackage?.warnings?.length ? `解析警告：${sourcePackage.warnings.join('；')}` : '',
      `用户选择页数档位：${bounds.label}`,
      `你需要自己决定精确页数，但 slides.length 必须在 ${bounds.min}-${bounds.max} 之间。`,
      '',
      '核心目标：',
      '- 先做两遍源材料分析，再写 slides：第一遍提取知识主线/教学顺序；第二遍盘点每张原文图实际是什么、能不能支持某一页。',
      '- 输出时必须先形成 coursePlan，再形成 slideOutlines，最后才写 slides[].htmlPrompt。不要一上来就写页面布局。',
      '- coursePlan 负责回答“这本 notebook 应该怎样被教”：目标学习者、课程目标、叙事弧线、核心问题、源材料取舍、节奏策略。',
      '- slideOutlines 负责回答“每页教学上解决什么问题”：learnerQuestion、teachingObjective、keyPoints、sourceAnchors、sourceUseRationale、visualPlan、必需可见内容和可删内容。',
      '- slides[].htmlPrompt 只能是对 slideOutline 的渲染翻译；不能在 htmlPrompt 里新增第二个主题、额外例题、额外图或新的教学目标。',
      sourceImages.length
        ? '- planningNotes 必须包含 2-5 条图像盘点/取舍记录，例如“img_2 实际是视觉样例，不适合作架构图；只用于能力示例页”。'
        : '',
      isNotebookMode
        ? '- 先做整本 notebook 的内容分配：跨文件合并、删繁就简、分章节组织，再给每一页写可直接发送给 HTML 生成接口的 prompt。'
        : '- 先做整节课内容分配，再给每一页写可直接发送给 HTML 生成接口的 prompt。',
      '- 第 1 页必须是封面页，pageKind 必须是 cover；封面只建立 notebook/课程主题识别，不展开正文；主标题是唯一必须文字，副标题/来源/短标签都可选。',
      '- 第 2 页必须是介绍/导入页，pageKind 必须是 intro；它负责说明为什么学、学习路径和 3-4 个入口问题，不讲完整正文。',
      '- 最后 1 页必须是总结页，pageKind 必须是 summary；它负责 3-5 条 takeaway、回看路径和下一步问题，不新增新知识。',
      isNotebookMode
        ? '- 不需要机械覆盖每个源页；可以合并相邻页、跳过重复页、用更短的新例子替代源文件冗长例子，但必须保留这本 notebook 的知识主线。'
        : '- 不要机械照搬源页；可以合并相邻页、跳过重复页、用更短的新例子替代源文件冗长例子，但必须保留这节课的知识主线。',
      isNotebookMode
        ? '- 每一页都要说明它来自哪个文件/主题，sourceCoverage 里优先写“文件名 + 源页/主题”。'
        : '- 每一页都要说明它覆盖哪个源页/主题。',
      '- 标准 16:9 页最多 3 个主要内容区；标题区不算，底部一句结论/检查点算 1 个内容区。tall 中高页面可以有 3-5 个内容区；long 长页面可以有 4-7 个纵向 section。',
      '- 不要把一整页源文件塞进一页 PPT；如果密度过高，拆到下一页或删掉次要内容。',
      '- 每页必须选择 canvasMode：默认是 slide（1600×900）；如果只是普通教学页略微放不下，使用 tall（1600×1200 或 1600×1400）；只有数学证明/长推导/完整例题拆解、CS execution trace / memory diagram / call stack / 代码题讲解等需要纵向过程时，才使用 long。',
      '- 如果使用 canvasMode=tall，canvasHeight 只能选 1200 或 1400 附近；tall 仍然是课件页，不是网页文章。',
      '- 如果使用 canvasMode=long，canvasHeight 只能选 1800、2200、2400、2800 或 3200 附近；long 仍然是 1600px 同宽课件板，不是网页文章。',
      '- 如果一页在 16:9 中需要用底部结论条覆盖主内容才能放下，说明这页应该拆页、压缩内容，或规划为 tall/long；绝对不能规划成会 overlap 的 16:9。',
      '- 每页必须绑定 sourceAnchors：从原文段落、定义、公式、表格、图片、代码片段或例子中选 1-3 个锚点；不要只写“来源：第几页”。',
      '- sourceCoverage 说明覆盖范围，sourceAnchors 说明具体证据/素材。两者都要填写。',
      '- 每页必须填写 sourceUseRationale：说明为什么直接使用原材料、为什么改写、为什么换成更短例子，或为什么不使用原图。不要写空泛理由。',
      sourceImages.length
        ? '- 有原文图片时，优先用 sourceImageIds 分配给真正需要看图/读表/读论文图示的页面；不要把所有图片都塞到封面或介绍页。'
        : '- 如果没有原文图片，sourceImageIds 必须为空数组，不要虚构 img_1。',
      sourceImages.length
        ? '- sourceImageIds 只能分配给视觉语义匹配的页面：图表页用图表，架构页用真实架构/流程图，视觉样例页用样例图。不要把普通照片或示例画面包装成架构图。'
        : '',
      sourceImages.length
        ? '- 默认每张原文图最多分配给 1 页；如果同一张图需要跨页复用，必须在 planningNotes 和相关 htmlPrompt 中说明“同图二次精读”的不同教学角度。'
        : '',
      sourceImages.length
        ? '- 当一页分配 sourceImageIds 后，htmlPrompt 必须明确要求 HTML 生成器使用这些图片 ID 占位，例如 <img src="img_1">，并保留图片页码/说明。'
        : '',
      '- 对论文/阅读材料优先规划：问题背景、核心图表阅读、方法/证据拆解、结果解释、局限与启发；不要写成空泛课程概览。',
      '- 页面类型要服务教学节奏：cover / intro / summary / process / table / math / code / example。',
      `- 本文件初步识别课程路线为：${routeHint}；除非源材料强烈反证，否则所有页面的 courseRoute 都要沿用这个路线。`,
      '- 先判断课程路线：数学 / 计算机科学 / 自然科学 / 商科经济 / 人文 / 社科 / 通用；每页 htmlPrompt 都要写清楚“课程路线：xxx”。',
      '- 每页 JSON 必须输出结构化字段 courseRoute；CS 页还必须输出 csRoute，数学页还必须输出 mathRoute。',
      '- 课程路线会影响页面结构：数学走定义/命题/推导/证明/例题，CS 走标准页或专属语义组件，商科走数字/决策/案例/矩阵。',
      '- CS/OOP 内容尤其要克制：除非必须，不要生成长代码页；用短例子、对比、状态观察代替完整教程。',
      '- CS 标准页仍然存在：intro / concept / summary / process / table / example 不要强行做 trace；但整本 CS notebook 至少要包含一个真正的 CS 专属语义页，除非源材料完全没有代码、对象、数据结构或状态变化。',
      '- CS 专属版式只在强信号时使用，并在 htmlPrompt 写清楚“CS 版式：xxx”：Execution Trace、Memory Diagram、Call Stack、Pointer Diagram、Tree Diagram、Graph Trace、Linear Structure、Dictionary Diagram、Invariant Check、Composite Operation。',
      '- CS/OOP/引用/属性用 Memory Diagram；递归用 Call Stack；linked list 用 Pointer Diagram；tree/BST 用 Tree Diagram；BFS/DFS 用 Graph Trace；stack/queue 用 Linear Structure；dictionary 用 Dictionary Diagram；结构合法性用 Invariant Check。',
      '- 数学内容可以用外部更短例子替换源文件长例子，但不能改变要讲的定义、判定或证明动作。',
      '- 数学也有标准页：intro / summary / process / table 不需要强行公式化。',
      '- 数学专属版式只在需要时使用，并在 htmlPrompt 写清楚“数学版式：xxx”：Definition/Theorem Board、Formula Focus、Derivation Ladder、Proof Walkthrough、Worked Example、Concept Map、Comparison Table。',
      '- 数学页必须先识别源材料里的标准数学对象、符号、表示法和验证动作，再决定 visualPlan；不要把数学内容规划成 AI 插图、抽象波纹图、装饰图或图片占位。',
      '- 数学 visualPlan 应该是可编辑数学结构：定义板、符号表、集合/对象表、公式聚焦、条件对比、图/关系结构、推导阶梯、证明框架或例题拆解。具体结构由源材料主题决定，不要写死某一种模板。',
      '- 如果为了容量替换例子，必须保持同一个数学概念，并选择小而可检查的例子；不要引入源材料没有的随意符号、装饰性集合或新记号。',
      '- 数学证明或长推导如果 16:9 单页放不下，应分配到多页或把该页规划为 canvasMode=tall/long；普通 16:9 页只保留一个证明动作。',
      '- 计划必须让每页视觉上可做：不要出现一页同时要代码、表格、trace、完整例题答案、前后文总结。',
      '- 每页 title 字段必须和 htmlPrompt 里要求显示的标题逐字一致。',
      '- 如果页标题里有“5 个/4 步/3 条”等数量，htmlPrompt 里的可见条目数量必须匹配，不能让后续生成器自行减少。',
      '- 如果某页需要公式、步骤、理由、检查点，必须在 htmlPrompt 里标成“必需保留”，不能放进可删内容。',
      '- 页面拥挤时，优先删邻近上下文/装饰标签/次级解释；不能删核心题干、公式、步骤、理由、答案或总结判断。',
      '- 每页必须有 learnerQuestion：用一句学生视角的问题驱动这一页，不要只写“介绍/总结”。',
      '- 每页 keyPoints 只放 2-5 个短点，必须是真正要显示/支撑的知识结构，不要写讲稿段落。',
      '- 每页 mandatoryVisibleContent 明确列出页面必须展示的文本/公式/代码/图题/结论；optionalContent 明确列出可以被压缩或删除的材料。',
      '- sourceUseRationale 要进入 htmlPrompt，帮助 HTML 生成器知道哪些内容必须来自源材料，哪些可以为了容量被改写。',
      '',
      '每个 htmlPrompt 必须包含：',
      '- 明确说明画布：如果 canvasMode=slide，写“生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面”；如果 canvasMode=tall，写“生成一张宽 1600px、高约 Npx 的 HTML/CSS 中高课件页”；如果 canvasMode=long，写“生成一张宽 1600px、目标高度约 Npx 的 HTML/CSS 长页面教学版式”。',
      '- 第几页/总页数、页面类型、密度档、这一页唯一主教学动作。',
      '- 如果是第 1 页：页面类型必须写“封面页”，主标题是唯一必须文字；副标题/来源/1-2 个短标签都可选，不能放入口问题、目录或正文讲解。',
      '- 如果是第 1 页：htmlPrompt 必须要求使用内置封面背景/主视觉语言，例如科技封面 tech_hero_title、电影感 cinematic_title_frame、学术几何 academic_hero_cover 或 image_title_overlay；优先使用 /slide-backgrounds/ 下的本地内置背景，不能生成白底空封面。',
      '- 如果是第 2 页：页面类型必须写“介绍页/导入页”，包含本 notebook 为什么重要、先看哪几个入口、如何进入正文。',
      '- 如果是最后 1 页：页面类型必须写“总结页”，包含 3-5 条 takeaway、回看路线/检查清单、下一步问题。',
      '- 课程路线：数学 / 计算机科学 / 自然科学 / 商科经济 / 人文 / 社科 / 通用。',
      '- 如果课程路线是计算机科学，写明 CS 版式：standard 或具体专属版式。',
      '- 如果课程路线是数学，写明数学版式：standard 或具体专属版式。',
      '- 可见内容必须简体中文；可以保留必要英文代码标识。',
      '- 精确列出本页要出现的标题、卡片/表格/公式/代码/结论内容。',
      '- 必需保留清单：逐条列出不能省略的内容，尤其是数量型清单、理由、结论、检查点。',
      '- 可删内容清单：如果拥挤只能删哪些次级内容。',
      '- 源材料锚点：列出本页来自哪段原文/哪个公式/哪个例子/哪张图；如果使用原文图，列出 sourceImageIds。',
      '- 源材料取舍理由：说明本页为何直接使用/改写/换例/不用图。',
      '- 如果使用原文图：写清图片真实角色（架构图/流程图/结果表/视觉样例/论文截图/对比图/代码截图等）、真实图题/页码和该图支持的教学判断。',
      '- 如果没有合适原文图：明确写“本页不使用原文图，不要虚构图片”。',
      '- 同一页不要重复渲染同一个 source image；如果需要对比两个概念，用 DOM 文本/表格/卡片对比。',
      '- 给出容量预算：可见中文/等价字符范围、最多几个内容区、最多几个块。',
      '- 给出画布预算：canvasMode 和 canvasHeight；长页必须说明允许纵向自然展开但禁止横向滚动。',
      '- 布局要求：主内容必须用正常 flex/grid flow，不要让底部条、大卡片、例题结果或检查点覆盖上方内容。',
      '- 明确禁止：内容重叠、裁切、DOM 越界、负坐标、无关公式、无关例题、用 fixed height 裁掉正文；标准 16:9 页禁止滚动，长页禁止横向滚动和网页文章化。',
      '',
      'JSON schema：',
      JSON.stringify(
        {
          lessonTitle: 'string',
          pageCountTier: tier,
          pageCount: 'number',
          coursePlan: {
            targetLearner: 'string',
            courseGoal: 'string',
            narrativeArc: ['string'],
            prerequisiteAssumptions: ['string'],
            coreQuestions: ['string'],
            sourceDigest: ['string'],
            pacingStrategy: 'string',
          },
          slideOutlines: [
            {
              id: 'slide-1',
              order: 1,
              title: 'string',
              canvasMode: 'slide | tall | long',
              canvasHeight: 900,
              learnerQuestion: 'string',
              teachingObjective: 'string',
              keyPoints: ['string'],
              sourceAnchors: ['具体原文锚点、公式、表格、图片、代码或例子'],
              sourceImageIds: ['img_1'],
              sourceUseRationale: '为什么直接使用/改写/换例/不用图',
              visualPlan: 'string',
              mandatoryVisibleContent: ['string'],
              optionalContent: ['string'],
            },
          ],
          planningNotes: ['string'],
          slides: [
            {
              id: 'slide-1',
              order: 1,
              title: 'string',
              pageKind: 'cover | intro | summary | process | table | math | code | example',
              canvasMode: 'slide | tall | long',
              canvasHeight: 900,
              courseRoute:
                'general | math | computer-science | science | business | humanities | social-science',
              csRoute:
                'standard | execution-trace | memory-diagram | call-stack | pointer-diagram | tree-diagram | graph-trace | linear-structure | dictionary-diagram | invariant-check | composite-operation',
              mathRoute:
                'standard | definition-theorem | formula-focus | derivation | proof | worked-example | concept-map | comparison-table',
              density: 'light | standard | dense',
              objective: 'string',
              learnerQuestion: 'string',
              keyPoints: ['string'],
              sourceCoverage: ['源页编号或主题'],
              sourceAnchors: ['具体原文锚点、公式、表格、图片、代码或例子'],
              sourceImageIds: ['img_1'],
              sourceUseRationale: '为什么直接使用/改写/换例/不用图',
              visualPlan: 'string',
              mandatoryVisibleContent: ['string'],
              optionalContent: ['string'],
              densityTarget: 'light | standard | dense',
              sourceUsage: 'direct | adapted | new-example | synthesis',
              contentBudget: {
                visibleCharsMin: 80,
                visibleCharsMax: 260,
                mainRegions: 2,
                blockCount: 4,
                mustDeleteIfCrowded: ['string'],
              },
              htmlPrompt: '完整、可直接发送给 HTML 生成接口的中文 prompt',
            },
          ],
        },
        null,
        2,
      ),
      '',
      '原文图片清单：',
      sourceImagesForPrompt(sourceImages),
      '',
      '源文本摘录（用于避免泛泛总结；不要整段塞进页面）：',
      sourceText || '无额外源文本摘录。',
      '',
      '源页材料：',
      sourcePagesForPrompt(sourcePages),
    ].join('\n');

    const buildPlanningParams = (nextPrompt: string) =>
      planningVisionImages.length
        ? {
            model,
            system,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(nextPrompt, planningVisionImages, 'zh-CN'),
              },
            ],
            maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
          }
        : {
            model,
            system,
            prompt: nextPrompt,
            maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
          };

    const planningRun = await runWithRequestContext(
      req,
      '/api/generation-quality/html-lesson-plan',
      async () => {
        const initialResult = await callLLM(buildPlanningParams(prompt), 'html-lesson-plan-test', {
          retries: 1,
          validate: (text) => Boolean(parsePlan(text, tier, parseContext)),
        });
        const initialPlan = parsePlan(initialResult.text, tier, parseContext);
        if (!initialPlan) {
          return {
            result: initialResult,
            plan: null,
            quality: null,
            retryCount: 0,
            retryReasons: [] as PlanningQualityIssue[],
            usage: combineTokenUsage([initialResult.usage as TokenUsage | undefined]),
          };
        }

        const initialQuality = evaluatePlanningQuality({
          plan: initialPlan,
          bounds,
          routeHint,
          sourceImages,
          imageUsePolicy,
        });

        if (initialQuality.blockingIssueCount === 0) {
          return {
            result: initialResult,
            plan: initialPlan,
            quality: initialQuality,
            retryCount: 0,
            retryReasons: [] as PlanningQualityIssue[],
            usage: combineTokenUsage([initialResult.usage as TokenUsage | undefined]),
          };
        }

        const retryPrompt = buildPlanningQualityRetryPrompt({
          originalPrompt: prompt,
          previousPlan: initialPlan,
          quality: initialQuality,
          bounds,
        });
        const retryResult = await callLLM(
          buildPlanningParams(retryPrompt),
          'html-lesson-plan-test-quality-retry',
          {
            retries: 0,
            validate: (text) => Boolean(parsePlan(text, tier, parseContext)),
          },
        );
        const retryPlan = parsePlan(retryResult.text, tier, parseContext);
        const retryQuality = retryPlan
          ? evaluatePlanningQuality({
              plan: retryPlan,
              bounds,
              routeHint,
              sourceImages,
              imageUsePolicy,
            })
          : null;
        const useRetry =
          retryPlan &&
          retryQuality &&
          planningQualityScore(retryQuality) <= planningQualityScore(initialQuality);

        return {
          result: useRetry ? retryResult : initialResult,
          plan: useRetry ? retryPlan : initialPlan,
          quality: useRetry ? retryQuality : initialQuality,
          retryCount: 1,
          retryReasons: initialQuality.issues,
          usage: combineTokenUsage([
            initialResult.usage as TokenUsage | undefined,
            retryResult.usage as TokenUsage | undefined,
          ]),
        };
      },
      {
        operationCode: 'html_lesson_plan_test',
        chargeReason: isNotebookMode ? 'HTML 整本笔记本规划测试' : 'HTML 整节课规划测试',
        serviceLabel: isNotebookMode
          ? 'HTML notebook plan generation'
          : 'HTML lesson plan generation',
        skipCreditCharge,
      },
    );

    const plan = planningRun.plan;
    if (!plan) {
      const parseFailure = describePlanParseFailure(planningRun.result.text, tier);
      return apiError(
        'PARSE_FAILED',
        502,
        'Failed to parse lesson plan JSON',
        `${parseFailure}\n\n${planningRun.result.text.slice(0, 2000)}`,
      );
    }

    const usage = planningRun.usage;
    return apiSuccess({
      plan,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(
        modelString,
        usage ?? undefined,
      ) as HtmlCostEstimate | null,
      skippedCreditCharge: skipCreditCharge,
      planningQuality: planningRun.quality,
      planningRetryCount: planningRun.retryCount,
      planningRetryReasons: planningRun.retryReasons,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to generate HTML lesson plan',
      error instanceof Error ? error.message : String(error),
    );
  }
}
