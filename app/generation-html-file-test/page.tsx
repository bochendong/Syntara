'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { HtmlTestProgressionPanel } from '@/components/generation/html-test-progression-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getApiHeaders } from '@/lib/create/generation-headers';
import type { SceneOutline } from '@/lib/types/generation';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:html-file-page-generation-test:v1';
const HTML_FILE_PAGE_MODEL = 'gpt-5.4';
const RESULT_RENDER_VERSION = 'html-file-page-v8';
const TEST_LIST_PAGE_SIZE = 8;

type FilePageStatusFilter = 'all' | 'pending' | 'generated' | 'error';
type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
type InferredHtmlPageKind = HtmlPageKind | 'auto';
type HtmlCodeRoute = 'execution-trace' | 'memory-trace';
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

interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx';
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
}

interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
}

interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

interface HtmlCostEstimate {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
}

interface HtmlRetryReason {
  code?: string;
  title: string;
  details?: string[];
}

interface GenerateHtmlPptResponse {
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

interface HtmlGenerationResult {
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

interface GenerationErrorResult {
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

interface SavedState {
  selectedFixtureId?: string;
  selectedPageIndexByFixture?: Record<string, number>;
  fixtureSignatures?: Record<string, string>;
  resultsByPage?: Record<string, HtmlGenerationResult>;
  errorsByPage?: Record<string, GenerationErrorResult>;
}

interface PreviewStats {
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

function getHtmlFileTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_FILE_PAGE_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function pageKey(fixtureId: string, outlineId: string): string {
  return `${fixtureId}:${outlineId}`;
}

function buildOutlineSignature(outline: SceneOutline): string {
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

function buildFixtureSignature(fixture: TestfileFixture): string {
  return [
    fixture.fileName,
    fixture.fileType,
    fixture.sourceTextLength,
    fixture.outlines.length,
    fixture.outlines.map(buildOutlineSignature).join('|'),
  ].join('::');
}

function buildFixtureSignatures(fixtures: TestfileFixture[]): Record<string, string> {
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.id, buildFixtureSignature(fixture)]),
  );
}

function staleFixtureIds(
  previous: Record<string, string>,
  next: Record<string, string>,
): Set<string> {
  return new Set(
    Object.entries(next)
      .filter(([fixtureId, signature]) => previous[fixtureId] !== signature)
      .map(([fixtureId]) => fixtureId),
  );
}

function pruneStalePageMap<T>(record: Record<string, T>, staleIds: Set<string>): Record<string, T> {
  if (staleIds.size === 0) return record;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => {
      const fixtureId = key.split(':')[0];
      return !staleIds.has(fixtureId);
    }),
  );
}

function resultMatchesOutline(
  result: HtmlGenerationResult | null,
  outline: SceneOutline | null,
): boolean {
  if (!result || !outline) return false;
  const signature = buildOutlineSignature(outline);
  if (!result.signature) return false;
  return result.signature === signature;
}

function readSavedState(): SavedState {
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

function writeSavedState(state: SavedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Generated HTML can be large; persistence failure should not block the QA surface.
  }
}

function buildErrorResult(
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

function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}

function emptyPreviewStats(): PreviewStats {
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

function analyzeHtml(html: string) {
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

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return Math.max(0, Math.round(value)).toLocaleString();
}

function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '暂无 token 用量';
  const inputTokens = toSafeInt(usage.inputTokens);
  const outputTokens = toSafeInt(usage.outputTokens);
  const totalTokens = toSafeInt(usage.totalTokens ?? inputTokens + outputTokens);
  return `${formatNumber(totalTokens)} tokens · 输入 ${formatNumber(inputTokens)} / 输出 ${formatNumber(outputTokens)}`;
}

function formatCostEstimate(cost: HtmlCostEstimate | null | undefined): string {
  if (!cost) return '暂无估算';
  const sourceLabel = cost.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
  return `${formatComputeCreditsLabel(cost.computeCredits)} · ${formatUsdLabel(cost.retailUsd)} · ${sourceLabel}`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function inferHtmlPageKind(outline: SceneOutline, pageIndex: number): InferredHtmlPageKind {
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

function inferHtmlCodeRoute(outline: SceneOutline): HtmlCodeRoute | undefined {
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

function inferHtmlCourseRoute(outline: SceneOutline): HtmlCourseRoute {
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

function outlineSearchText(outline: SceneOutline): string {
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

function inferHtmlCsRoute(outline: SceneOutline): HtmlCsRoute {
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

function inferHtmlMathRoute(outline: SceneOutline, pageKind: InferredHtmlPageKind): HtmlMathRoute {
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

function densityLevelForOutline(outline: SceneOutline): DensityLevel {
  const density = outline.layoutIntent?.density;
  if (density === 'light' || density === 'dense') return density;
  if (outline.contentProfile === 'math' || outline.layoutIntent?.layoutTemplate === 'code_split') {
    return 'dense';
  }
  return 'standard';
}

function buildDensityContract(level: DensityLevel, pageKind: InferredHtmlPageKind): string {
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

function buildSlideEditingContract(pageKind: InferredHtmlPageKind): string {
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

function pageKindLabel(kind: InferredHtmlPageKind): string {
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

function courseRoutePromptLabel(route: HtmlCourseRoute): string {
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

function csRoutePromptLabel(route: HtmlCsRoute): string {
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

function mathRoutePromptLabel(route: HtmlMathRoute): string {
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

function buildNeighborContext(fixture: TestfileFixture, pageIndex: number): string {
  const previous = fixture.outlines[pageIndex - 1];
  const next = fixture.outlines[pageIndex + 1];
  return [
    previous ? `上一页：${previous.title} — ${compact(previous.description, 120)}` : '',
    next ? `下一页：${next.title} — ${compact(next.description, 120)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHtmlPrompt({
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

function evaluatePreview(iframe: HTMLIFrameElement | null): PreviewStats {
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

function getPreviewStatus(stats: PreviewStats): 'pass' | 'fail' | 'empty' {
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

export default function GenerationHtmlFileTestPage() {
  const [fixtures, setFixtures] = useState<TestfileFixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [fixtureError, setFixtureError] = useState<GenerationErrorResult | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [selectedPageIndexByFixture, setSelectedPageIndexByFixture] = useState<
    Record<string, number>
  >({});
  const [fixtureSignatures, setFixtureSignatures] = useState<Record<string, string>>({});
  const fixtureSignaturesRef = useRef<Record<string, string>>({});
  const [resultsByPage, setResultsByPage] = useState<Record<string, HtmlGenerationResult>>({});
  const [errorsByPage, setErrorsByPage] = useState<Record<string, GenerationErrorResult>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState<FilePageStatusFilter>('all');
  const [fixtureFilter, setFixtureFilter] = useState('all');
  const [testPage, setTestPage] = useState(1);
  const [previewStats, setPreviewStats] = useState<PreviewStats>(emptyPreviewStats);
  const [previewScale, setPreviewScale] = useState(0.7);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadFixtures = useCallback(async () => {
    setIsLoadingFixtures(true);
    setFixtureError(null);
    try {
      const response = await backendFetch(
        `/api/generation-quality/testfile-fixtures?ts=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      if (!response.ok || data.success === false || !data.fixtures?.length) {
        setFixtureError(
          buildErrorResult(data, response.status, `读取 testfile 失败：HTTP ${response.status}`),
        );
        return;
      }

      const nextSignatures = buildFixtureSignatures(data.fixtures);
      const staleIds = staleFixtureIds(fixtureSignaturesRef.current, nextSignatures);
      setFixtures(data.fixtures);
      setSelectedFixtureId((previous) =>
        previous && data.fixtures?.some((fixture) => fixture.id === previous)
          ? previous
          : data.fixtures?.[0]?.id || '',
      );
      if (staleIds.size > 0) {
        setSelectedPageIndexByFixture((previous) => ({
          ...previous,
          ...Object.fromEntries(Array.from(staleIds).map((fixtureId) => [fixtureId, 0])),
        }));
        setResultsByPage((previous) => pruneStalePageMap(previous, staleIds));
        setErrorsByPage((previous) => pruneStalePageMap(previous, staleIds));
      }
      fixtureSignaturesRef.current = nextSignatures;
      setFixtureSignatures(nextSignatures);
    } catch (error) {
      setFixtureError(buildUnknownErrorResult(error));
    } finally {
      setIsLoadingFixtures(false);
    }
  }, []);

  useEffect(() => {
    const saved = readSavedState();
    setSelectedFixtureId(saved.selectedFixtureId || '');
    setSelectedPageIndexByFixture(saved.selectedPageIndexByFixture || {});
    fixtureSignaturesRef.current = saved.fixtureSignatures || {};
    setFixtureSignatures(saved.fixtureSignatures || {});
    setResultsByPage(saved.resultsByPage || {});
    setErrorsByPage(saved.errorsByPage || {});
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void loadFixtures();
    const refreshOnFocus = () => {
      void loadFixtures();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [isHydrated, loadFixtures]);

  useEffect(() => {
    if (!isHydrated) return;
    writeSavedState({
      selectedFixtureId,
      selectedPageIndexByFixture,
      fixtureSignatures,
      resultsByPage,
      errorsByPage,
    });
  }, [
    errorsByPage,
    fixtureSignatures,
    isHydrated,
    resultsByPage,
    selectedFixtureId,
    selectedPageIndexByFixture,
  ]);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedFixtureId) || fixtures[0] || null,
    [fixtures, selectedFixtureId],
  );
  const selectedPageIndex = selectedFixture
    ? Math.min(
        Math.max(selectedPageIndexByFixture[selectedFixture.id] || 0, 0),
        Math.max(0, selectedFixture.outlines.length - 1),
      )
    : 0;
  const currentOutline = selectedFixture?.outlines[selectedPageIndex] || null;
  const currentPageKey =
    selectedFixture && currentOutline ? pageKey(selectedFixture.id, currentOutline.id) : '';
  const savedCurrentResult = currentPageKey ? resultsByPage[currentPageKey] || null : null;
  const currentResult = resultMatchesOutline(savedCurrentResult, currentOutline)
    ? savedCurrentResult
    : null;
  const currentError = currentPageKey ? errorsByPage[currentPageKey] || null : null;
  const currentPageKind = currentOutline
    ? inferHtmlPageKind(currentOutline, selectedPageIndex)
    : 'auto';
  const generatedCount = selectedFixture
    ? selectedFixture.outlines.filter((outline) =>
        resultMatchesOutline(
          resultsByPage[pageKey(selectedFixture.id, outline.id)] || null,
          outline,
        ),
      ).length
    : 0;
  const totalPageCount = fixtures.reduce((sum, fixture) => sum + fixture.outlines.length, 0);
  const totalGeneratedCount = fixtures.reduce(
    (sum, fixture) =>
      sum +
      fixture.outlines.filter((outline) =>
        resultMatchesOutline(resultsByPage[pageKey(fixture.id, outline.id)] || null, outline),
      ).length,
    0,
  );
  const totalErrorCount = Object.keys(errorsByPage).length;
  const selectedFixtureListIndex = selectedFixture
    ? fixtures.findIndex((fixture) => fixture.id === selectedFixture.id)
    : -1;
  const currentGlobalIndex =
    selectedFixture && selectedFixtureListIndex >= 0
      ? fixtures
          .slice(0, selectedFixtureListIndex)
          .reduce((sum, fixture) => sum + fixture.outlines.length, 0) + selectedPageIndex
      : 0;

  const filePageListItems = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    return fixtures
      .flatMap((fixture) =>
        fixture.outlines.map((outline, pageIndex) => {
          const key = pageKey(fixture.id, outline.id);
          const result = resultMatchesOutline(resultsByPage[key] || null, outline)
            ? resultsByPage[key]
            : null;
          const error = errorsByPage[key] || null;
          const status: Exclude<FilePageStatusFilter, 'all'> = result
            ? 'generated'
            : error
              ? 'error'
              : 'pending';
          return {
            fixture,
            outline,
            pageIndex,
            key,
            result,
            error,
            status,
            sortTime: result?.createdAt || error?.createdAt || 0,
            pageKind: inferHtmlPageKind(outline, pageIndex),
          };
        }),
      )
      .filter((item) => fixtureFilter === 'all' || item.fixture.id === fixtureFilter)
      .filter((item) => testStatusFilter === 'all' || item.status === testStatusFilter)
      .filter((item) => {
        if (!query) return true;
        return [
          item.fixture.title,
          item.fixture.fileName,
          item.outline.title,
          item.outline.id,
          item.outline.layoutIntent?.layoutTemplate,
          item.outline.teachingRole,
          pageKindLabel(item.pageKind),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.sortTime !== b.sortTime) return b.sortTime - a.sortTime;
        const fixtureDelta = fixtures.indexOf(a.fixture) - fixtures.indexOf(b.fixture);
        if (fixtureDelta !== 0) return fixtureDelta;
        return a.pageIndex - b.pageIndex;
      });
  }, [errorsByPage, fixtureFilter, fixtures, resultsByPage, testSearch, testStatusFilter]);
  const testPageCount = Math.max(1, Math.ceil(filePageListItems.length / TEST_LIST_PAGE_SIZE));
  const safeTestPage = Math.min(testPage, testPageCount);
  const visibleFilePageListItems = filePageListItems.slice(
    (safeTestPage - 1) * TEST_LIST_PAGE_SIZE,
    safeTestPage * TEST_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setTestPage(1);
  }, [fixtureFilter, testSearch, testStatusFilter]);

  useEffect(() => {
    if (!currentResult) {
      setPreviewStats(emptyPreviewStats());
    }
  }, [currentResult]);

  useEffect(() => {
    if (!currentResult) return;
    const element = previewFrameRef.current;
    if (!element) return;

    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const nextScale = Math.min(rect.width / 1600, rect.height / 900);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 0.7);
    };

    updateScale();
    const animationFrame = window.requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [currentPageKey, currentResult]);

  const setSelectedPageIndex = useCallback((fixtureId: string, pageIndex: number) => {
    setSelectedPageIndexByFixture((previous) => ({
      ...previous,
      [fixtureId]: pageIndex,
    }));
  }, []);

  const generatePageAt = useCallback(
    async (fixture: TestfileFixture, pageIndex: number) => {
      const outline = fixture.outlines[pageIndex];
      if (!outline) return;
      const key = pageKey(fixture.id, outline.id);
      const pageKind = inferHtmlPageKind(outline, pageIndex);
      const courseRoute = inferHtmlCourseRoute(outline);
      const csRoute = courseRoute === 'computer-science' ? inferHtmlCsRoute(outline) : undefined;
      const mathRoute = courseRoute === 'math' ? inferHtmlMathRoute(outline, pageKind) : undefined;
      const prompt = buildHtmlPrompt({ fixture, outline, pageIndex, pageKind });
      setSelectedFixtureId(fixture.id);
      setSelectedPageIndex(fixture.id, pageIndex);
      setGeneratingKey(key);
      setErrorsByPage((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        const response = await backendFetch('/api/generate/html-ppt-slide', {
          method: 'POST',
          headers: getHtmlFileTestHeaders(),
          body: JSON.stringify({
            prompt,
            pageKind: pageKind === 'auto' ? undefined : pageKind,
            codeRoute: pageKind === 'code' ? inferHtmlCodeRoute(outline) : undefined,
            courseRoute,
            csRoute,
            mathRoute,
            densityContract: buildDensityContract(densityLevelForOutline(outline), pageKind),
          }),
        });

        const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
        if (!response.ok || data.success === false || !data.html) {
          setErrorsByPage((previous) => ({
            ...previous,
            [key]: buildErrorResult(
              data,
              response.status,
              `HTML 生成失败：HTTP ${response.status}`,
            ),
          }));
          return;
        }

        const htmlStats = analyzeHtml(data.html);
        setResultsByPage((previous) => ({
          ...previous,
          [key]: {
            html: data.html || '',
            prompt,
            outline,
            signature: buildOutlineSignature(outline),
            renderVersion: RESULT_RENDER_VERSION,
            pageKind,
            courseRoute,
            csRoute,
            mathRoute,
            rawResponse: data,
            ...htmlStats,
            createdAt: Date.now(),
          },
        }));
      } catch (error) {
        setErrorsByPage((previous) => ({
          ...previous,
          [key]: buildUnknownErrorResult(error),
        }));
      } finally {
        setGeneratingKey(null);
      }
    },
    [setSelectedPageIndex],
  );

  const handleGenerateCurrent = useCallback(() => {
    if (!selectedFixture) return;
    void generatePageAt(selectedFixture, selectedPageIndex);
  }, [generatePageAt, selectedFixture, selectedPageIndex]);

  const handleGenerateNext = useCallback(() => {
    if (!selectedFixture) return;
    const nextIndex = Math.min(selectedPageIndex + 1, selectedFixture.outlines.length - 1);
    void generatePageAt(selectedFixture, nextIndex);
  }, [generatePageAt, selectedFixture, selectedPageIndex]);

  const clearCurrent = useCallback(() => {
    if (!currentPageKey) return;
    setResultsByPage((previous) => {
      const next = { ...previous };
      delete next[currentPageKey];
      return next;
    });
    setErrorsByPage((previous) => {
      const next = { ...previous };
      delete next[currentPageKey];
      return next;
    });
  }, [currentPageKey]);

  const clearAll = useCallback(() => {
    setResultsByPage({});
    setErrorsByPage({});
  }, []);

  const previewStatus = getPreviewStatus(previewStats);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div>
          <Link
            href="/test"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <ChevronLeft className="size-4" />
            返回所有测试
          </Link>
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <FileCode2 className="size-4" />
                Testfile HTML Page Generation QA
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
                文件逐页 HTML 生成测试
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                同样读取 testfile 的三个固定样本和逐页队列，但每页直接生成一张 1600×900 HTML/CSS
                PPT；用于对比 HTML 单页链路在真实文件输入下是否稳定。
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-4 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">模型</div>
                <div className="mt-1 font-semibold text-slate-950">{HTML_FILE_PAGE_MODEL}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">文件</div>
                <div className="mt-1 font-semibold text-slate-950">{fixtures.length || 3}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">页面</div>
                <div className="mt-1 font-semibold text-slate-950">{totalPageCount || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">已生成</div>
                <div className="mt-1 font-semibold text-slate-950">
                  {totalGeneratedCount}/{totalPageCount || 0}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(fixtures.length > 0 ? fixtures : []).map((fixture) => (
              <Badge key={fixture.id} variant="outline">
                {fixture.fileName} · {fixture.outlines.length} 页
              </Badge>
            ))}
            {fixtures.length === 0 ? (
              <>
                <Badge variant="outline">oop.md</Badge>
                <Badge variant="outline">Functions PDF</Badge>
                <Badge variant="outline">Victimization PPTX</Badge>
              </>
            ) : null}
          </div>
        </header>

        <HtmlTestProgressionPanel currentStageId="html-file-page" />

        {fixtureError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" />
              读取 fixture 失败
            </div>
            <p className="mt-1">{fixtureError.message}</p>
            {fixtureError.details ? <p className="mt-1 text-xs">{fixtureError.details}</p> : null}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,3fr)_minmax(0,7fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">测试列表</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    三个 testfile 样本逐页展开；每次只生成当前页的 HTML。
                  </p>
                </div>
                <Badge variant="outline">
                  {filePageListItems.length}/{totalPageCount || 0}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  搜索
                  <Input
                    className="mt-1"
                    placeholder="标题、文件、HTML 类型..."
                    value={testSearch}
                    onChange={(event) => setTestSearch(event.target.value)}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    状态
                    <Select
                      value={testStatusFilter}
                      onValueChange={(value) => setTestStatusFilter(value as FilePageStatusFilter)}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="pending">待测</SelectItem>
                        <SelectItem value="generated">通过</SelectItem>
                        <SelectItem value="error">错误</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    源文件
                    <Select value={fixtureFilter} onValueChange={setFixtureFilter}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {fixtures.map((fixture) => (
                          <SelectItem key={fixture.id} value={fixture.id}>
                            {fixture.fileName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isLoadingFixtures}
                  onClick={() => void loadFixtures()}
                >
                  {isLoadingFixtures ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {isLoadingFixtures ? '正在解析 testfile...' : '重新读取 testfile'}
                </Button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleFilePageListItems.length > 0 ? (
                  visibleFilePageListItems.map((item) => {
                    const isSelected =
                      item.fixture.id === selectedFixture?.id &&
                      item.pageIndex === selectedPageIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setSelectedFixtureId(item.fixture.id);
                          setSelectedPageIndex(item.fixture.id, item.pageIndex);
                        }}
                        className={cn(
                          'block w-full rounded-xl border px-3 py-2 text-left transition',
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-500',
                                )}
                              >
                                {item.pageIndex + 1}
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {item.outline.title}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">
                              {item.fixture.fileName} · {pageKindLabel(item.pageKind)}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge
                              variant={
                                item.status === 'generated'
                                  ? 'default'
                                  : item.status === 'error'
                                    ? 'destructive'
                                    : 'outline'
                              }
                            >
                              {item.status === 'generated'
                                ? '通过 1/1'
                                : item.status === 'error'
                                  ? '错误 0/1'
                                  : '待测 0/1'}
                            </Badge>
                            <span className="text-[11px] text-slate-400">
                              {item.sortTime ? formatTime(item.sortTime) : '未生成'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    没有匹配的测试页。
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage <= 1}
                  onClick={() => setTestPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>
                <div className="text-center text-xs text-slate-500">
                  {safeTestPage}/{testPageCount} · {filePageListItems.length} pages
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage >= testPageCount}
                  onClick={() => setTestPage((page) => Math.min(testPageCount, page + 1))}
                >
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {currentOutline ? currentGlobalIndex + 1 : 0}/{totalPageCount || 0}
                    </Badge>
                    <Badge variant="outline">{selectedFixture?.fileName || 'testfile'}</Badge>
                    <Badge variant="outline">{pageKindLabel(currentPageKind)}</Badge>
                    <Badge
                      variant={currentResult ? 'default' : currentError ? 'destructive' : 'outline'}
                    >
                      {currentResult ? '已生成' : currentError ? '生成失败' : '未生成'}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                    {currentOutline?.title || '等待读取 testfile'}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {currentOutline?.description ||
                      '后端会读取 testfile，转成逐页队列；这里把每页改用 HTML PPT 生成链路。'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedFixture || selectedPageIndex === 0 || Boolean(generatingKey)}
                    onClick={() =>
                      selectedFixture &&
                      setSelectedPageIndex(selectedFixture.id, selectedPageIndex - 1)
                    }
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      !selectedFixture ||
                      selectedPageIndex >= selectedFixture.outlines.length - 1 ||
                      Boolean(generatingKey)
                    }
                    onClick={() =>
                      selectedFixture &&
                      setSelectedPageIndex(selectedFixture.id, selectedPageIndex + 1)
                    }
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-5">
                <div>
                  <div className="font-semibold text-slate-800">HTML 类型</div>
                  <div>{pageKindLabel(currentPageKind)}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">原始版式</div>
                  <div>{currentOutline?.layoutIntent?.layoutTemplate || '-'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">教学角色</div>
                  <div>{currentOutline?.teachingRole || '-'}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">源文件进度</div>
                  <div>
                    {generatedCount}/{selectedFixture?.outlines.length || 0}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">总进度</div>
                  <div>
                    {totalGeneratedCount}/{totalPageCount || 0}
                    {totalErrorCount ? ` · error ${totalErrorCount}` : ''}
                  </div>
                </div>
              </div>

              {currentError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" />
                    生成失败
                  </div>
                  <p className="mt-1">{currentError.message}</p>
                  {currentError.details ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs">{currentError.details}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  disabled={!selectedFixture || !currentOutline || Boolean(generatingKey)}
                  onClick={handleGenerateCurrent}
                >
                  {generatingKey === currentPageKey ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  生成当前页 HTML
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !selectedFixture ||
                    Boolean(generatingKey) ||
                    selectedPageIndex >= selectedFixture.outlines.length - 1
                  }
                  onClick={handleGenerateNext}
                >
                  {generatingKey && generatingKey !== currentPageKey ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  生成下一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!currentResult && !currentError}
                  onClick={clearCurrent}
                >
                  <Trash2 className="size-4" />
                  清当前
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    Object.keys(resultsByPage).length === 0 &&
                    Object.keys(errorsByPage).length === 0
                  }
                  onClick={clearAll}
                >
                  <Trash2 className="size-4" />
                  清全部
                </Button>
              </div>

              {currentResult ? (
                <div className="mt-4 grid gap-3 text-sm lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">模型</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentResult.rawResponse.model || '未返回'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">费用</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatCostEstimate(currentResult.rawResponse.costEstimate)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">用量</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatTokenUsage(currentResult.rawResponse.usage)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">HTML 输出</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {currentResult.elementCount} elements · {currentResult.htmlLength} chars
                    </div>
                  </div>
                  {currentResult.rawResponse.retryReasons?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-4">
                      <div className="font-semibold">自动重试原因</div>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                        {currentResult.rawResponse.retryReasons.map((reason, index) => (
                          <li key={`${reason.code || reason.title}-${index}`}>
                            {reason.title}
                            {reason.details?.length ? `：${reason.details.join(' / ')}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {currentResult.rawResponse.skippedCreditCharge ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 lg:col-span-4">
                      测试请求跳过本地积分扣费，仅展示估算费用。
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">HTML 预览</h2>
                  <p className="text-xs text-slate-500">
                    iframe 按 1600×900 渲染；生成后自动检查滚动、越界和基础 DOM 结构。
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {currentResult ? (
                    <Badge
                      variant={previewStatus === 'pass' ? 'default' : 'destructive'}
                      className="gap-1"
                    >
                      {previewStatus === 'pass' ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      {previewStatus === 'pass' ? 'QA 通过' : 'QA 待看'}
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedFixture || !currentOutline || Boolean(generatingKey)}
                    onClick={handleGenerateCurrent}
                  >
                    {generatingKey === currentPageKey ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {generatingKey === currentPageKey ? '生成中...' : '生成'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className="relative mx-auto aspect-video w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                >
                  {currentResult ? (
                    <iframe
                      key={`${currentPageKey}-${currentResult.createdAt}`}
                      ref={iframeRef}
                      title="HTML file page preview"
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      srcDoc={currentResult.html}
                      onLoad={() => setPreviewStats(evaluatePreview(iframeRef.current))}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      {generatingKey ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <Code2 className="size-8" />
                      )}
                      <div className="text-sm font-medium">
                        {generatingKey ? '正在生成 HTML...' : '生成当前页后在这里预览'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {currentResult ? (
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-6">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">预览缩放</div>
                    <div className="mt-1 font-semibold">{previewScale.toFixed(3)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">滚动尺寸</div>
                    <div className="mt-1 font-semibold">
                      {previewStats.scrollWidth || '-'} × {previewStats.scrollHeight || '-'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">越界元素</div>
                    <div className="mt-1 font-semibold">{previewStats.outOfBoundsCount}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">裁切风险</div>
                    <div className="mt-1 font-semibold">{previewStats.clippedCount}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">结构</div>
                    <div className="mt-1 font-semibold">
                      slide {previewStats.slideCount} · content{' '}
                      {previewStats.hasSlideContent ? '有' : '缺'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">内容节点</div>
                    <div className="mt-1 font-semibold">
                      {previewStats.textNodeCount} text · {previewStats.visibleCharCount} chars
                    </div>
                  </div>
                  {previewStats.outOfBoundsSamples.length ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 sm:col-span-6">
                      {previewStats.outOfBoundsSamples.join(' / ')}
                    </div>
                  ) : null}
                  {previewStats.clippedSamples.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:col-span-6">
                      {previewStats.clippedSamples.join(' / ')}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {currentOutline && selectedFixture ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="size-4 text-slate-500" />
                    <h2 className="text-sm font-semibold">发送给 HTML 生成接口的 prompt</h2>
                  </div>
                  <Textarea
                    readOnly
                    className="min-h-[280px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                    value={
                      currentResult?.prompt ||
                      buildHtmlPrompt({
                        fixture: selectedFixture,
                        outline: currentOutline,
                        pageIndex: selectedPageIndex,
                        pageKind: currentPageKind,
                      })
                    }
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <FileCode2 className="size-4 text-slate-500" />
                      <h2 className="text-sm font-semibold">生成结果 JSON</h2>
                    </div>
                    {currentResult ? (
                      <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                        {JSON.stringify(
                          {
                            pageKind: currentResult.pageKind,
                            model: currentResult.rawResponse.model,
                            usage: currentResult.rawResponse.usage,
                            costEstimate: currentResult.rawResponse.costEstimate,
                            generationAttempts: currentResult.rawResponse.generationAttempts,
                            retryReasons: currentResult.rawResponse.retryReasons,
                            skippedCreditCharge: currentResult.rawResponse.skippedCreditCharge,
                            htmlStats: {
                              htmlLength: currentResult.htmlLength,
                              textNodeCount: currentResult.textNodeCount,
                              elementCount: currentResult.elementCount,
                              mathElementCount: currentResult.mathElementCount,
                            },
                            previewStats,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                        还没有生成结果。
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h2 className="text-sm font-semibold">源片段 / concrete anchor</h2>
                    <Textarea
                      readOnly
                      className="mt-3 min-h-[420px] resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800"
                      value={
                        currentOutline.teachingPagePlan?.concreteAnchor ||
                        currentOutline.description
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
