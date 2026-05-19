import { getApiHeaders } from '@/lib/create/generation-headers';
import type { SceneOutline } from '@/lib/types/generation';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';

export const STORAGE_KEY = 'syntara:html-file-page-generation-test:v1';
export const HTML_FILE_PAGE_MODEL = 'gpt-5.4';
export const RESULT_RENDER_VERSION = 'html-file-page-v8';
export const TEST_LIST_PAGE_SIZE = 8;

export type FilePageStatusFilter = 'all' | 'pending' | 'generated' | 'error';
export type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
export type InferredHtmlPageKind = HtmlPageKind | 'auto';
export type HtmlCodeRoute = 'execution-trace' | 'memory-trace';
export type HtmlCsRoute =
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
export type HtmlMathRoute =
  | 'standard'
  | 'definition-theorem'
  | 'formula-focus'
  | 'derivation'
  | 'proof'
  | 'worked-example'
  | 'concept-map'
  | 'comparison-table';
export type HtmlCourseRoute =
  | 'general'
  | 'math'
  | 'computer-science'
  | 'science'
  | 'business'
  | 'humanities'
  | 'social-science';
export type DensityLevel = 'light' | 'standard' | 'dense';

export interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx';
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
}

export interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
}

export interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

export interface HtmlCostEstimate {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
}

export interface HtmlRetryReason {
  code?: string;
  title: string;
  details?: string[];
}

export interface GenerateHtmlPptResponse {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

export interface HtmlGenerationResult {
  html: string;
  prompt: string;
  outline: SceneOutline;
  signature?: string;
  renderVersion?: string;
  pageKind: InferredHtmlPageKind;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  rawResponse: GenerateHtmlPptResponse;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
  createdAt: number;
}

export interface GenerationErrorResult {
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

export interface SavedState {
  selectedFixtureId?: string;
  selectedPageIndexByFixture?: Record<string, number>;
  fixtureSignatures?: Record<string, string>;
  resultsByPage?: Record<string, HtmlGenerationResult>;
  errorsByPage?: Record<string, GenerationErrorResult>;
}

export interface PreviewStats {
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
  clippedCount: number;
  clippedSamples: string[];
  textNodeCount: number;
  visibleCharCount: number;
  mathCount: number;
  tableCount: number;
  preCount: number;
  codeCount: number;
  imageCount: number;
}

export function getHtmlFileTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_FILE_PAGE_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function pageKey(fixtureId: string, outlineId: string): string {
  return `${fixtureId}:${outlineId}`;
}

export function buildOutlineSignature(outline: SceneOutline): string {
  return [
    RESULT_RENDER_VERSION,
    HTML_FILE_PAGE_MODEL,
    outline.id,
    outline.title,
    outline.description,
    outline.archetype,
    outline.contentProfile,
    outline.layoutIntent?.layoutTemplate,
    outline.layoutIntent?.layoutFamily,
    outline.layoutIntent?.disciplineStyle,
    outline.layoutIntent?.density,
    outline.teachingRole,
    outline.teachingPagePlan?.concreteAnchor,
    ...(outline.keyPoints || []),
  ].join('/');
}

export function buildFixtureSignature(fixture: TestfileFixture): string {
  return [
    fixture.fileName,
    fixture.fileType,
    fixture.sourceTextLength,
    fixture.outlines.length,
    fixture.outlines.map(buildOutlineSignature).join('|'),
  ].join('::');
}

export function buildFixtureSignatures(fixtures: TestfileFixture[]): Record<string, string> {
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.id, buildFixtureSignature(fixture)]),
  );
}

export function staleFixtureIds(
  previous: Record<string, string>,
  next: Record<string, string>,
): Set<string> {
  return new Set(
    Object.entries(next)
      .filter(([fixtureId, signature]) => previous[fixtureId] !== signature)
      .map(([fixtureId]) => fixtureId),
  );
}

export function pruneStalePageMap<T>(
  record: Record<string, T>,
  staleIds: Set<string>,
): Record<string, T> {
  if (staleIds.size === 0) return record;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => {
      const fixtureId = key.split(':')[0];
      return !staleIds.has(fixtureId);
    }),
  );
}

export function resultMatchesOutline(
  result: HtmlGenerationResult | null,
  outline: SceneOutline | null,
): boolean {
  if (!result || !outline) return false;
  const signature = buildOutlineSignature(outline);
  if (!result.signature) return false;
  return result.signature === signature;
}

export function readSavedState(): SavedState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedState;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSavedState(state: SavedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Generated HTML can be large; persistence failure should not block the QA surface.
  }
}

export function buildErrorResult(
  data: GenerateHtmlPptResponse | FixturesResponse,
  status: number,
  fallback: string,
): GenerationErrorResult {
  return {
    message: data.error || fallback,
    details: data.details,
    httpStatus: status,
    createdAt: Date.now(),
  };
}

export function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}

export function emptyPreviewStats(): PreviewStats {
  return {
    scrollWidth: 0,
    scrollHeight: 0,
    slideCount: 0,
    hasSlideContent: false,
    outOfBoundsCount: 0,
    outOfBoundsSamples: [],
    clippedCount: 0,
    clippedSamples: [],
    textNodeCount: 0,
    visibleCharCount: 0,
    mathCount: 0,
    tableCount: 0,
    preCount: 0,
    codeCount: 0,
    imageCount: 0,
  };
}

export function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}

export function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return Math.max(0, Math.round(value)).toLocaleString();
}

export function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '暂无 token 用量';
  const inputTokens = toSafeInt(usage.inputTokens);
  const outputTokens = toSafeInt(usage.outputTokens);
  const totalTokens = toSafeInt(usage.totalTokens ?? inputTokens + outputTokens);
  return `${formatNumber(totalTokens)} tokens · 输入 ${formatNumber(inputTokens)} / 输出 ${formatNumber(outputTokens)}`;
}

export function formatCostEstimate(cost: HtmlCostEstimate | null | undefined): string {
  if (!cost) return '暂无估算';
  const sourceLabel = cost.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
  return `${formatComputeCreditsLabel(cost.computeCredits)} · ${formatUsdLabel(cost.retailUsd)} · ${sourceLabel}`;
}

export function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function inferHtmlPageKind(outline: SceneOutline, pageIndex: number): InferredHtmlPageKind {
  const template = outline.layoutIntent?.layoutTemplate || '';
  const role = outline.teachingRole || '';
  const discipline = outline.layoutIntent?.disciplineStyle || '';
  const profile = outline.contentProfile || '';
  const anchor = outline.teachingPagePlan?.concreteAnchor || '';
  const hasConcreteCode =
    /```|<pre|<code/i.test(anchor) ||
    /^\s*(class|def|import|from|for|while|if|elif|else|return)\b/m.test(anchor) ||
    /^\s*[A-Za-z_]\w*\s*=\s*.+$/m.test(anchor);
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    template,
    role,
    discipline,
    profile,
    anchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();

  if (pageIndex === 0 || /cover|title|封面/.test(text)) {
    return 'cover';
  }
  if (outline.archetype === 'intro' || /hero|divider|导入|介绍/.test(text)) {
    return 'intro';
  }
  if (/pipeline_table|comparison_matrix|table|matrix|compare|comparison|表格|对比/.test(text)) {
    return 'table';
  }
  if (
    outline.workedExampleConfig?.kind === 'code' ||
    (/code|trace|代码|追踪/.test(text) && hasConcreteCode) ||
    hasConcreteCode
  ) {
    return 'code';
  }
  if (
    discipline === 'math' ||
    profile === 'math' ||
    /formula|derivation|proof|math|equation|函数|公式|证明|推导|定理|导数|矩阵/.test(text)
  ) {
    return 'math';
  }
  if (/process|timeline|steps|pipeline|flow|road|流程|步骤|路径/.test(text)) {
    return 'process';
  }
  if (outline.archetype === 'example' || outline.workedExampleConfig) {
    return 'example';
  }
  if (outline.archetype === 'summary' || /summary|recap|takeaway|总结|回顾/.test(text)) {
    return 'summary';
  }
  return 'auto';
}

export function inferHtmlCodeRoute(outline: SceneOutline): HtmlCodeRoute | undefined {
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    outline.teachingRole,
    outline.contentProfile,
    outline.layoutIntent?.layoutTemplate,
    outline.teachingPagePlan?.concreteAnchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();

  if (
    /memory|heap|stack|alias|reference|object|self|attribute|class|node|linked list|内存|堆|栈|调用栈|引用|指向|对象|属性|字段|链表|节点|指针/.test(
      text,
    )
  ) {
    return 'memory-trace';
  }
  if (/trace|state|loop|line|execute|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return undefined;
}

export function inferHtmlCourseRoute(outline: SceneOutline): HtmlCourseRoute {
  const discipline = outline.layoutIntent?.disciplineStyle || '';
  const profile = outline.contentProfile || '';
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    outline.teachingRole,
    profile,
    discipline,
    outline.layoutIntent?.layoutTemplate,
    outline.teachingPagePlan?.concreteAnchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();

  if (
    discipline === 'math' ||
    profile === 'math' ||
    /math|formula|derivation|proof|equation|calculus|matrix|probability|函数|公式|证明|推导|定理|导数|积分|矩阵|概率/.test(
      text,
    )
  ) {
    return 'math';
  }
  if (
    discipline === 'code' ||
    profile === 'code' ||
    /code|program|python|javascript|typescript|java|class|object|oop|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|代码|编程|程序|算法|调用栈|内存|堆|栈|对象|属性|字段|链表|指针/.test(
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
  if (
    /history|literature|philosophy|source|argument|text|历史|文学|哲学|文本|史料|论证|修辞/.test(
      text,
    )
  ) {
    return 'humanities';
  }
  if (
    /policy|society|sociology|psychology|geography|case study|政策|社会|心理|地理|案例/.test(text)
  ) {
    return 'social-science';
  }
  return 'general';
}

export function outlineSearchText(outline: SceneOutline): string {
  return [
    outline.title,
    outline.description,
    outline.archetype,
    outline.teachingRole,
    outline.contentProfile,
    outline.layoutIntent?.disciplineStyle,
    outline.layoutIntent?.layoutTemplate,
    outline.teachingPagePlan?.concreteAnchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();
}

export function inferHtmlCsRoute(outline: SceneOutline): HtmlCsRoute {
  const text = outlineSearchText(outline);
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
  if (
    /dictionary|dict|hash|key|value|lookup|mutation|counts|字典|哈希|键|值|映射|查找/.test(text)
  ) {
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
    /memory|heap|alias|reference|object|self|attribute|class|field|内存|堆|引用|指向|对象|属性|字段/.test(
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

export function inferHtmlMathRoute(
  outline: SceneOutline,
  pageKind: InferredHtmlPageKind,
): HtmlMathRoute {
  const text = outlineSearchText(outline);
  if (/proof|prove|证明|证毕|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|推导|化简|求导过程|递推|等价变形/.test(text)) return 'derivation';
  if (
    pageKind === 'example' ||
    /worked example|example|solve|problem|例题|求解|计算|答案/.test(text)
  ) {
    return 'worked-example';
  }
  if (/definition|theorem|lemma|proposition|corollary|定义|定理|引理|命题|推论/.test(text)) {
    return 'definition-theorem';
  }
  if (/formula|equation|identity|公式|方程|恒等式|核心公式/.test(text)) return 'formula-focus';
  if (/concept map|relationship|关系|图谱|概念图|包含关系|映射关系/.test(text))
    return 'concept-map';
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) return 'comparison-table';
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

export function densityLevelForOutline(outline: SceneOutline): DensityLevel {
  const density = outline.layoutIntent?.density;
  if (density === 'light' || density === 'dense') return density;
  if (outline.contentProfile === 'math' || outline.layoutIntent?.layoutTemplate === 'code_split') {
    return 'dense';
  }
  return 'standard';
}

export function buildDensityContract(level: DensityLevel, pageKind: InferredHtmlPageKind): string {
  const effectiveLevel =
    pageKind === 'math' || pageKind === 'code' || pageKind === 'table' ? 'dense' : level;
  if (effectiveLevel === 'light') {
    return [
      '密度档：轻量文件页',
      '可见文字/等价字符：70-190',
      '可见文本块：5-14',
      '主要内容覆盖画布面积：28%-68%',
      '正文可读字号：低于 24px 的文字占比不超过 12%',
      '如果源页信息少，做成封面/轻量导入：标题、一句定位、最多 3 个短入口块；不要额外生成大型右侧解释面板。',
      '入口块必须是紧凑块或横向短卡，高度 120-190px；如果每块只有一两句话，不要拉成长空白卡片。',
      '轻量页最多 4 个内容容器，每个容器必须能完整显示文字，不能依赖 overflow:hidden 裁切。',
      '整体视觉尺度要像 16:9 PPT，不像网页大组件：H1 约 56-68px，模块标题 26-32px，正文 24-28px，卡片 padding 24-34px。',
      '如果排版仍然偏满，可以在 .slide-content 内使用 .fit-layer { width:calc(100% / .92); height:calc(100% / .92); transform:scale(.92); transform-origin:top left; }，让内部先获得更大布局空间再缩回可视区域；不要缩放外层 .slide。',
    ].join('\n');
  }
  if (effectiveLevel === 'dense') {
    return [
      '密度档：信息密集文件页',
      '可见文字/等价字符：150-360',
      '可见文本块：10-28',
      '主要内容覆盖画布面积：42%-78%',
      '正文可读字号：低于 20px 的文字占比不超过 25%',
      '可以使用紧凑表格、代码块、公式区或步骤区承载信息，但仍然最多 3 个主要内容区；不能靠缩小字号硬塞。',
    ].join('\n');
  }
  return [
    '密度档：标准文件页',
    '可见文字/等价字符：110-280',
    '可见文本块：8-22',
    '主要内容覆盖画布面积：36%-74%',
    '正文可读字号：低于 22px 的文字占比不超过 22%',
    '页面不能太空，也不能像讲义长文；用标题、1-2 个主结构区、可选结论/检查点组成一页。',
  ].join('\n');
}

export function buildSlideEditingContract(pageKind: InferredHtmlPageKind): string {
  const base = [
    '单页编辑规则：',
    '- 先决定这一页唯一的主教学动作：概念解释 / 对比判断 / 代码观察 / 反例展示 / 流程步骤 / 公式推导；只能选一个。',
    '- 一页最多 3 个主要内容区；标题区不算，底部一句检查/结论算 1 个内容区。',
    '- 禁止把“代码块 + trace + 表格 + 例题答案 + 前后页衔接”同时塞进一页。',
    '- 如果信息放不下，按顺序删除：前后页衔接、装饰标签、次要解释、trace 细节、额外结论；不要通过裁切、滚动或继续缩小字号解决。',
    '- 大块内容必须短：每个卡片只放一个功能；如果一个卡片需要滚动或高度超过 260px，就先删文案或拆成更少内容。',
    '- 不要把源页改写成完整讲义；只做这一页最值得讲的一个点。',
  ];

  if (pageKind === 'cover') {
    return [
      ...base,
      '封面页预算：',
      '- 只允许：大标题、副标题/一句定位、2-3 个短标签或来源信息、一个轻量主视觉。',
      '- 不要展开正文教学、完整目录、代码、证明、题目答案或长流程。',
      '- 总可见文字建议 60-160 个中文/等价字符；封面要像 notebook 第一页，不是普通介绍页。',
    ].join('\n');
  }

  if (pageKind === 'code') {
    return [
      ...base,
      '代码页预算：',
      '- 只允许 1 个代码块，最多 12 行；代码块之外只允许 1 个解释/状态区。',
      '- trace 最多 3 步，每步一行状态；如果代码本身已经很长，就不要再生成 trace 区。',
      '- 不要补写完整 class、完整运行结果或完整教程；只保留源页里最关键的代码观察点。',
    ].join('\n');
  }

  if (pageKind === 'example') {
    return [
      ...base,
      '例子/反例页预算：',
      '- 如果源页没有明确提出一道题，不要生成“题目区 / 已知条件 / 求解步骤 / 最终答案”结构。',
      '- 普通例子页应呈现为：一个具体例子 + 2-3 个观察点 + 一句结论/风险；不要把它改造成练习题。',
      '- 如果确实是题目，最多 3 个求解步骤，每步一句话；答案区必须短。',
    ].join('\n');
  }

  if (pageKind === 'table') {
    return [
      ...base,
      '对比/表格页预算：',
      '- 只做一个对比关系；表格最多 4 列、4 行正文。',
      '- 不要在表格旁再放代码块、trace、步骤表或长解释面板。',
    ].join('\n');
  }

  return base.join('\n');
}

export function pageKindLabel(kind: InferredHtmlPageKind): string {
  const labels: Record<InferredHtmlPageKind, string> = {
    cover: '封面页',
    intro: '介绍页',
    summary: '总结页',
    process: '流程页',
    table: '表格页',
    math: '数学页',
    code: '代码页',
    example: '例题页',
    auto: '自动',
  };
  return labels[kind];
}

export function courseRoutePromptLabel(route: HtmlCourseRoute): string {
  const labels: Record<HtmlCourseRoute, string> = {
    general: '通用',
    math: '数学',
    'computer-science': '计算机科学',
    science: '自然科学',
    business: '商科经济',
    humanities: '人文',
    'social-science': '社科',
  };
  return labels[route];
}

export function csRoutePromptLabel(route: HtmlCsRoute): string {
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
  return labels[route];
}

export function mathRoutePromptLabel(route: HtmlMathRoute): string {
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
  return labels[route];
}

export function buildNeighborContext(fixture: TestfileFixture, pageIndex: number): string {
  const previous = fixture.outlines[pageIndex - 1];
  const next = fixture.outlines[pageIndex + 1];
  return [
    previous ? `上一页：${previous.title} — ${compact(previous.description, 120)}` : '',
    next ? `下一页：${next.title} — ${compact(next.description, 120)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildHtmlPrompt({
  fixture,
  outline,
  pageIndex,
  pageKind,
}: {
  fixture: TestfileFixture;
  outline: SceneOutline;
  pageIndex: number;
  pageKind: InferredHtmlPageKind;
}): string {
  const language =
    '可见内容必须使用简体中文；如果源文件是英文，请翻译并改写成中文课件表达。代码、API 名、变量名、类名、文件名等专业标识可以保留英文。';
  const keyPoints = outline.keyPoints?.length
    ? outline.keyPoints.map((point) => `- ${point}`).join('\n')
    : '- 保留这一页最重要的教学信息。';
  const concreteAnchor = outline.teachingPagePlan?.concreteAnchor || outline.description;
  const workedExample = outline.workedExampleConfig
    ? JSON.stringify(outline.workedExampleConfig, null, 2).slice(0, 1800)
    : '';
  const pageKindInstruction =
    pageKind === 'auto'
      ? '页面类型由源页内容决定，但必须是一张完整 16:9 HTML PPT 页面。'
      : `页面类型建议：${pageKindLabel(pageKind)}。`;
  const courseRoute = inferHtmlCourseRoute(outline);
  const csRoute = courseRoute === 'computer-science' ? inferHtmlCsRoute(outline) : undefined;
  const mathRoute = courseRoute === 'math' ? inferHtmlMathRoute(outline, pageKind) : undefined;
  const routeInstruction = [
    `课程路线：${courseRoutePromptLabel(courseRoute)}`,
    csRoute ? `CS 版式：${csRoutePromptLabel(csRoute)}` : '',
    mathRoute ? `数学版式：${mathRoutePromptLabel(mathRoute)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const slideEditingContract = buildSlideEditingContract(pageKind);
  const firstPageInstruction =
    pageIndex === 0
      ? [
          '第一页特殊要求：',
          '- 这是文件第一页/封面页，页面类型按封面处理：优先忠实保留源页标题和一句定位，不要展开成完整讲义。',
          '- 如果只有标题和短说明，最多做：标题区 + 3 个短入口块 + 1 条短引导问题；不要同时生成大型右侧说明卡和底部三卡。',
          '- 封面页不要提前生成正文教学、目录、代码、证明、题目答案或流程步骤。',
          '- 入口块必须紧凑，优先做横向短卡/短条/小标签组，高度 120-190px；不要生成 3 个占满下半屏的大空白卡片。',
          '- 第一页整体视觉尺度可以略缩小：标题不要超过 68px，入口块不要超过 3 个，避免 40px 以上正文和 40px 以上卡片内边距。',
          '- 不要为了填满画布编造新的公式、复杂图解、长说明或第二层子卡片。',
        ].join('\n')
      : '';

  return [
    `把 testfile 中的一个源文件页面改写成一张 16:9 HTML/CSS PPT 页面。`,
    language,
    '',
    '重要约束：',
    '- 这是逐页 HTML 生成测试，不走 SceneOutline/layout template 的渲染器。',
    '- 只输出这一页，不要输出多页、目录、讲稿、Markdown 或解释。',
    '- 忠实保留源页的教学核心；不要编造无关公式、题目、代码、案例或第二个主题。',
    '- 如果源页包含表格/对比关系，使用真实 HTML <table>；如果包含代码，使用 <pre><code>；如果包含核心数学公式，使用真实 MathML。',
    '- 如果源页信息很少，要做成一张轻量但可讲的课件页；不要用大空卡片假装有内容。',
    '- 所有内容必须完整落在 1600×900 内，不允许滚动或 DOM 元素越界。',
    '- 整体视觉尺度按 PPT 控制，不按网页 UI 控制；如果元素整体偏大，优先减少字号、卡片 padding、gap，必要时在 .slide-content 内加 .fit-layer：width/height 用 calc(100% / scale)，再 transform:scale(.90-.94) 缩回可视区域。',
    '- 生成前先做内容取舍；宁可删掉一个区块，也不要把区块挤到画布外。',
    '',
    routeInstruction,
    '',
    slideEditingContract,
    '',
    `源文件：${fixture.fileName}（${fixture.fileType.toUpperCase()}）`,
    `文件主题：${fixture.title}`,
    `文件说明：${fixture.description}`,
    `当前页：${pageIndex + 1}/${fixture.outlines.length}`,
    `当前页标题：${outline.title}`,
    `当前页描述：${outline.description}`,
    firstPageInstruction,
    `教学目标：${outline.teachingObjective || '让学生理解这一页的核心概念，并能和前后页衔接。'}`,
    `教学角色：${outline.teachingRole || '-'}`,
    `原始版式提示：${outline.layoutIntent?.layoutTemplate || '-'} / ${outline.layoutIntent?.layoutFamily || '-'}`,
    pageKindInstruction,
    '',
    '关键点：',
    keyPoints,
    '',
    '源页 concrete anchor / 必须保留的具体内容：',
    concreteAnchor.slice(0, 2600),
    workedExample ? ['', '例题/代码/证明配置：', workedExample].join('\n') : '',
    buildNeighborContext(fixture, pageIndex)
      ? [
          '',
          '相邻页上下文（只用于衔接，不要复制成额外内容区）：',
          buildNeighborContext(fixture, pageIndex),
        ].join('\n')
      : '',
    '',
    '风格：干净的教育课件 / 课程讲解页；真实 DOM 文本，可编辑 HTML/CSS，白底或浅色底，克制使用蓝绿强调。',
  ]
    .filter(Boolean)
    .join('\n');
}

export function evaluatePreview(iframe: HTMLIFrameElement | null): PreviewStats {
  const doc = iframe?.contentDocument;
  if (!doc) return emptyPreviewStats();
  const body = doc.body;
  const slide = doc.querySelector('.slide');
  const slideContent = doc.querySelector('.slide-content');
  const outOfBoundsSamples: string[] = [];
  const clippedSamples: string[] = [];
  let outOfBoundsCount = 0;
  let clippedCount = 0;

  const elementLabel = (element: HTMLElement) => {
    const className = typeof element.className === 'string' ? `.${element.className}` : '';
    return `${element.tagName.toLowerCase()}${className.split(/\s+/).slice(0, 2).join('.')}`;
  };

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const overflow =
      rect.left < -0.5 || rect.top < -0.5 || rect.right > 1600.5 || rect.bottom > 900.5;
    if (!overflow) return;
    outOfBoundsCount += 1;
    if (outOfBoundsSamples.length < 5) {
      outOfBoundsSamples.push(
        `${elementLabel(element)} ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(rect.right)},${Math.round(rect.bottom)}`,
      );
    }
  });

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    if (element.matches('style,script,br')) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const hasText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
    const hasVisualChild = Boolean(element.querySelector('img,svg,math,table,pre,code'));
    if (!hasText && !hasVisualChild) return;

    const clipsContent =
      ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) ||
      ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) ||
      style.textOverflow === 'ellipsis';
    const layoutOverflow =
      element.matches('pre,code,table') &&
      (element.scrollWidth > element.clientWidth + 2 ||
        element.scrollHeight > element.clientHeight + 2);
    if (!clipsContent && !layoutOverflow) return;

    let isClipped = layoutOverflow;
    if (!isClipped) {
      const textWalker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode = textWalker.nextNode();
      while (textNode && !isClipped) {
        const text = textNode.textContent?.replace(/\s+/g, '').trim() || '';
        if (text) {
          const range = doc.createRange();
          range.selectNodeContents(textNode);
          Array.from(range.getClientRects()).forEach((textRect) => {
            if (
              textRect.width > 0 &&
              textRect.height > 0 &&
              (textRect.left < rect.left - 2 ||
                textRect.top < rect.top - 2 ||
                textRect.right > rect.right + 2 ||
                textRect.bottom > rect.bottom + 2)
            ) {
              isClipped = true;
            }
          });
          range.detach();
        }
        textNode = textWalker.nextNode();
      }
    }

    if (!isClipped) {
      isClipped = Array.from(element.children).some((child) => {
        const childElement = child as HTMLElement;
        const childStyle = doc.defaultView?.getComputedStyle(childElement);
        if (!childStyle || childStyle.display === 'none' || childStyle.visibility === 'hidden') {
          return false;
        }
        const childRect = childElement.getBoundingClientRect();
        if (childRect.width <= 0 || childRect.height <= 0) return false;
        return (
          childRect.left < rect.left - 2 ||
          childRect.top < rect.top - 2 ||
          childRect.right > rect.right + 2 ||
          childRect.bottom > rect.bottom + 2
        );
      });
    }

    if (!isClipped) return;

    clippedCount += 1;
    if (clippedSamples.length < 5) {
      clippedSamples.push(
        `${elementLabel(element)} ${element.scrollWidth}×${element.scrollHeight} > ${element.clientWidth}×${element.clientHeight}`,
      );
    }
  });

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let textNodeCount = 0;
  let visibleCharCount = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!text) continue;
    textNodeCount += 1;
    visibleCharCount += text.length;
  }

  return {
    scrollWidth: Math.max(body.scrollWidth, doc.documentElement.scrollWidth),
    scrollHeight: Math.max(body.scrollHeight, doc.documentElement.scrollHeight),
    slideCount: doc.querySelectorAll('.slide').length,
    hasSlideContent: Boolean(slide && slideContent),
    outOfBoundsCount,
    outOfBoundsSamples,
    clippedCount,
    clippedSamples,
    textNodeCount,
    visibleCharCount,
    mathCount: doc.querySelectorAll('math').length,
    tableCount: doc.querySelectorAll('table').length,
    preCount: doc.querySelectorAll('pre').length,
    codeCount: doc.querySelectorAll('code').length,
    imageCount: doc.querySelectorAll('img').length,
  };
}

export function getPreviewStatus(stats: PreviewStats): 'pass' | 'fail' | 'empty' {
  if (stats.scrollWidth <= 0 || stats.scrollHeight <= 0) return 'empty';
  if (
    stats.slideCount === 1 &&
    stats.hasSlideContent &&
    stats.scrollWidth <= 1601 &&
    stats.scrollHeight <= 901 &&
    stats.outOfBoundsCount === 0 &&
    stats.clippedCount === 0
  ) {
    return 'pass';
  }
  return 'fail';
}
