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
export const maxDuration = 180;

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

type RequestBody = {
  prompt?: string;
  pageKind?: string;
  codeRoute?: HtmlCodeRoute;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  densityContract?: string;
  qualityFeedback?: string;
  canvasMode?: 'slide' | 'tall' | 'long';
  canvasHeight?: number;
  imageAsset?: {
    src?: string;
    alt?: string;
    description?: string;
    aspectRatio?: string;
  };
  assignedSourceImages?: SourceImageAsset[];
  sourceImageMapping?: Record<string, string>;
  retryReason?: string;
};

type SourceImageAsset = {
  id?: string;
  src?: string;
  pageNumber?: number;
  description?: string;
  width?: number;
  height?: number;
};

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlRetryReason = {
  code: string;
  title: string;
  details: string[];
};

type SourceImageUsage = {
  assignedIds: string[];
  usedIds: string[];
  missingIds: string[];
  inventedIds: string[];
};

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

function combineTokenUsage(usages: Array<TokenUsage | undefined>): TokenUsage | undefined {
  const combined = usages.reduce<TokenUsage>(
    (acc, usage) => ({
      inputTokens: toSafeInt(acc.inputTokens) + toSafeInt(usage?.inputTokens),
      outputTokens: toSafeInt(acc.outputTokens) + toSafeInt(usage?.outputTokens),
      cachedInputTokens: toSafeInt(acc.cachedInputTokens) + toSafeInt(usage?.cachedInputTokens),
      totalTokens: toSafeInt(acc.totalTokens) + toSafeInt(usage?.totalTokens),
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 },
  );
  const inferredTotal = toSafeInt(combined.inputTokens) + toSafeInt(combined.outputTokens);
  const totalTokens = toSafeInt(combined.totalTokens || inferredTotal);
  if (totalTokens <= 0) return undefined;
  return { ...combined, totalTokens };
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

function extractHtml(text: string): string {
  const withoutFence = text
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const match = withoutFence.match(/(?:<!doctype html>\s*)?<html\b[\s\S]*<\/html>/i);
  return (match?.[0] || withoutFence).trim();
}

function sanitizeHtml(html: string): string {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?\/?>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<base\b[\s\S]*?\/?>/gi, '')
    .replace(/<link\b[\s\S]*?\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*'javascript:[^']*'/gi, '')
    .trim();

  if (/<html\b/i.test(cleaned) && /<\/html>$/i.test(cleaned)) {
    return cleaned;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生成的 HTML PPT 页面</title>
</head>
<body>${cleaned}</body>
</html>`;
}

function countMathBlocks(html: string): number {
  return html.match(/<math(?:\s|>)/gi)?.length || 0;
}

function getVisibleText(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStyleText(html: string): string {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join('\n');
}

function getAbsoluteContentLayoutRisks(styleText: string): string[] {
  const risks: string[] = [];
  const decorativeSelectorPattern =
    /(?:decor|accent|bg|background|shape|dot|line|arrow|connector|glow|halo|noise|watermark)/i;
  const contentSelectorPattern =
    /(?:card|panel|section|block|example|result|answer|bottom|footer|summary|conclusion|check|main|body|content|visual|figure|slot|strip|bar|grid|row|column|formula|math|table)/i;

  for (const match of styleText.matchAll(
    /([^{}]+)\{([^{}]*position\s*:\s*(absolute|fixed|sticky)[^{}]*)\}/gi,
  )) {
    const selector = (match[1] || '').trim();
    const body = match[2] || '';
    const position = (match[3] || '').toLowerCase();
    if (!selector || selector === '.slide-content') continue;
    if (decorativeSelectorPattern.test(selector) && !contentSelectorPattern.test(selector)) {
      continue;
    }
    if (position === 'fixed' || position === 'sticky') {
      risks.push(`CSS 选择器 ${selector} 使用 position:${position}，容易脱离课件文档流`);
      continue;
    }
    if (
      contentSelectorPattern.test(selector) ||
      /(?:bottom|top|left|right|inset)\s*:/i.test(body) ||
      /z-index\s*:\s*[1-9]/i.test(body)
    ) {
      risks.push(`CSS 选择器 ${selector} 使用 position:absolute 布置主要内容，容易造成卡片覆盖`);
    }
  }

  for (const match of styleText.matchAll(
    /([^{}]+)\{([^{}]*(?:z-index\s*:|margin(?:-[\w-]+)?\s*:\s*-|translate(?:3d|x|y)?\([^;{}]*-)[^{}]*)\}/gi,
  )) {
    const selector = (match[1] || '').trim();
    const body = match[2] || '';
    if (!selector || selector === '.slide-content') continue;
    if (!contentSelectorPattern.test(selector)) continue;
    if (
      decorativeSelectorPattern.test(selector) &&
      !/(?:text|title|card|panel|footer|result|conclusion|check|content)/i.test(selector)
    ) {
      continue;
    }
    if (/z-index\s*:\s*[1-9]/i.test(body)) {
      risks.push(`CSS 选择器 ${selector} 使用 z-index 叠放主要内容，可能造成内容覆盖`);
    } else if (/margin(?:-[\w-]+)?\s*:\s*-\d/i.test(body)) {
      risks.push(`CSS 选择器 ${selector} 使用负 margin 布置主要内容，可能造成内容覆盖`);
    } else if (/translate(?:3d|x|y)?\([^;{}]*-\d/i.test(body)) {
      risks.push(`CSS 选择器 ${selector} 使用负向 translate 布置主要内容，可能造成内容覆盖`);
    }
  }

  return Array.from(new Set(risks)).slice(0, 5);
}

function getInlineContentLayoutRisks(html: string): string[] {
  const risks: string[] = [];
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b[^>]*\sstyle=(["'])(.*?)\2/gi)) {
    const tag = (match[1] || '').toLowerCase();
    const style = match[3] || '';
    if (!/(?:section|article|div|figure|table|pre|main|footer|aside|header)/i.test(tag)) {
      continue;
    }
    if (/position\s*:\s*(absolute|fixed|sticky)/i.test(style)) {
      risks.push(`内联样式 <${tag}> 使用 position 脱离文档流，可能造成内容覆盖`);
    } else if (/z-index\s*:\s*[1-9]/i.test(style)) {
      risks.push(`内联样式 <${tag}> 使用 z-index 叠放，可能造成内容覆盖`);
    } else if (/margin(?:-[\w-]+)?\s*:\s*-\d/i.test(style)) {
      risks.push(`内联样式 <${tag}> 使用负 margin，可能造成内容覆盖`);
    } else if (/translate(?:3d|x|y)?\([^;{}]*-\d/i.test(style)) {
      risks.push(`内联样式 <${tag}> 使用负向 translate，可能造成内容覆盖`);
    }
  }
  return Array.from(new Set(risks)).slice(0, 5);
}

function getLikelyViewportOverflowRisks(html: string): string[] {
  const styleText = getStyleText(html);
  if (!styleText) return [];

  const risks: string[] = [];
  if (/(?:top|left|right|bottom|inset)\s*:\s*-\d/i.test(styleText)) {
    risks.push('CSS 使用了负数 top/left/right/bottom/inset，常导致装饰元素出界');
  }
  if (/margin(?:-[\w-]+)?\s*:\s*-\d/i.test(styleText)) {
    risks.push('CSS 使用了负 margin，常导致内容或装饰元素越界');
  }
  if (/translate(?:3d|x|y)?\([^;{}]*-\d/i.test(styleText)) {
    risks.push('CSS transform translate 包含负向位移，可能把元素推到画布外');
  }
  if (
    /(?:width|min-width)\s*:\s*(?:calc\([^)]*100%\s*\+|1[7-9]\d{2}px|[2-9]\d{3}px)/i.test(styleText)
  ) {
    risks.push('CSS 宽度疑似超过 1600px 或超过父容器');
  }
  if (
    /(?:height|min-height)\s*:\s*(?:calc\([^)]*100%\s*\+|9[1-9]\dpx|[1-9]\d{3}px|100vh)/i.test(
      styleText,
    )
  ) {
    risks.push('CSS 高度疑似超过 900px 或使用 100vh/min-height 导致内容区溢出');
  }
  for (const match of styleText.matchAll(/grid-template-columns\s*:\s*([^;{}]+)/gi)) {
    const template = match[1] || '';
    const fixedPixelValues = Array.from(template.matchAll(/(\d+(?:\.\d+)?)px/gi)).map((item) =>
      Number.parseFloat(item[1] || '0'),
    );
    const fixedPixelSum = fixedPixelValues.reduce((sum, value) => sum + value, 0);
    if (fixedPixelValues.length >= 5 && fixedPixelSum > 1472) {
      risks.push(
        `CSS grid-template-columns 固定列宽总和约 ${Math.round(fixedPixelSum)}px，超过 .slide-content 常用内宽 1472px`,
      );
    }
  }
  risks.push(...getAbsoluteContentLayoutRisks(styleText));
  risks.push(...getInlineContentLayoutRisks(html));

  return Array.from(new Set(risks)).slice(0, 5);
}

function getLikelyCanvasOverflowRisks(html: string, canvasHeight: number): string[] {
  const styleText = getStyleText(html);
  if (!styleText) return [];

  const risks: string[] = [];
  if (/(?:left|right|inset-inline(?:-start|-end)?)\s*:\s*-\d/i.test(styleText)) {
    risks.push('CSS 使用了负数 left/right/inset-inline，常导致长页面横向出界');
  }
  if (/margin(?:-left|-right)?\s*:\s*-\d/i.test(styleText)) {
    risks.push('CSS 使用了负横向 margin，常导致内容或装饰元素横向越界');
  }
  if (/translate(?:3d|x)?\([^;{}]*-\d/i.test(styleText)) {
    risks.push('CSS transform translateX/translate3d 包含负向位移，可能把元素推到画布外');
  }
  if (
    /(?:width|min-width)\s*:\s*(?:calc\([^)]*100%\s*\+|1[7-9]\d{2}px|[2-9]\d{3}px)/i.test(styleText)
  ) {
    risks.push('CSS 宽度疑似超过 1600px 或超过父容器');
  }
  if (
    new RegExp(
      `(?:height|min-height)\\s*:\\s*(?:${Math.floor(canvasHeight * 1.08)}px|[3-9]\\d{3}px)`,
      'i',
    ).test(styleText)
  ) {
    risks.push(`CSS 高度疑似明显超过目标长页面高度 ${canvasHeight}px`);
  }
  risks.push(...getAbsoluteContentLayoutRisks(styleText));
  risks.push(...getInlineContentLayoutRisks(html));

  return Array.from(new Set(risks)).slice(0, 5);
}

function getMathRouteStructureRisks(html: string, mathRoute: HtmlMathRoute): string[] {
  if (mathRoute === 'standard') return [];

  const text = getVisibleText(html);
  const mathCount = countMathBlocks(html);
  const tableCount = html.match(/<table\b/gi)?.length || 0;
  const numberedStepSignals = (text.match(/(?:步骤|第\s*\d+\s*步|\b[1-5][.、]|①|②|③|④|⑤)/g) || [])
    .length;
  const risks: string[] = [];

  const requireText = (pattern: RegExp, message: string) => {
    if (!pattern.test(text)) risks.push(message);
  };
  const requireMath = (min: number, message: string) => {
    if (mathCount < min) risks.push(message);
  };

  switch (mathRoute) {
    case 'definition-theorem':
      requireText(/定义|定理|命题|判定|对象|符号/, '缺少“定义/定理/对象/符号”等数学入口。');
      requireText(/条件|假设|当且仅当|满足/, '缺少条件或假设区。');
      requireText(/结论|读法|因此|所以|例|检查/, '缺少结论、读法、例子或检查点。');
      requireMath(1, '定义/定理页至少需要 1 个真实 MathML 公式或符号块。');
      break;
    case 'formula-focus':
      requireMath(1, '公式聚焦页必须有一个主 MathML 公式。');
      requireText(/符号|含义|条件|使用|代入|解释/, '公式页缺少符号解释或使用条件。');
      break;
    case 'derivation':
      requireMath(3, '推导页至少需要 3 行 MathML 推导。');
      if (numberedStepSignals < 2) risks.push('推导页缺少清楚的分步结构。');
      requireText(/因为|由|代入|得到|所以|化简|归一化|两边/, '推导页缺少每步理由。');
      break;
    case 'proof':
      requireMath(2, '证明页至少需要 2 个 MathML 公式/符号判断。');
      requireText(/证明目标|要证|假设|条件|构造|结论|证毕/, '证明页缺少目标、假设、构造或结论。');
      break;
    case 'worked-example':
      requireMath(2, '例题页至少需要 2 个 MathML 公式/符号块。');
      requireText(/题干|问题|求|已知|给定|输入/, '例题页缺少题干或已知条件。');
      if (numberedStepSignals < 2) risks.push('例题页缺少 2 个以上求解步骤。');
      requireText(/答案|结果|结论|检查|验证/, '例题页缺少答案/结果/检查。');
      break;
    case 'concept-map':
      requireText(
        /定义|条件|结论|例子|关系|推出|属于|等价|偏序|映射/,
        '概念图缺少数学节点或关系词。',
      );
      requireText(/→|->|到|推出|对应|包含|分成|连接|关系/, '概念图缺少关系边或连接说明。');
      break;
    case 'comparison-table':
      if (tableCount < 1) risks.push('对比页必须使用真实 HTML table。');
      requireText(
        /条件|适用|场景|结论|反例|比较|对比|情况/,
        '对比表缺少条件、适用场景或结论维度。',
      );
      break;
    default:
      break;
  }

  return Array.from(new Set(risks)).slice(0, 5);
}

function promptNeedsMath(prompt: string): boolean {
  return /mathml|math notation|equation|formula|derivation|calculus|matrix|probability|bayes|latex|公式|数学|方程|推导|矩阵|概率|微积分|线性代数/i.test(
    prompt,
  );
}

function inferCourseRouteFromPrompt(prompt: string): HtmlCourseRoute {
  if (
    promptNeedsMath(prompt) ||
    /证明|定理|命题|导数|积分|极限|函数|几何|代数|统计|概率/i.test(prompt)
  ) {
    return 'math';
  }
  if (
    /code|python|javascript|typescript|java|class|object|oop|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|代码|编程|程序|算法|函数调用|调用栈|内存|堆|栈|对象|属性|字段|链表|指针/i.test(
      prompt,
    )
  ) {
    return 'computer-science';
  }
  if (/physics|chemistry|biology|实验|物理|化学|生物|细胞|力学|电路|生态|科学/i.test(prompt)) {
    return 'science';
  }
  if (
    /business|finance|economics|market|revenue|cost|profit|roi|商业|财务|经济|市场|营收|成本|利润|盈亏|定价/i.test(
      prompt,
    )
  ) {
    return 'business';
  }
  if (
    /history|literature|philosophy|textual|source|argument|历史|文学|哲学|文本|史料|论证|修辞/i.test(
      prompt,
    )
  ) {
    return 'humanities';
  }
  if (
    /policy|society|sociology|psychology|geography|case study|政策|社会|心理|地理|案例/i.test(
      prompt,
    )
  ) {
    return 'social-science';
  }
  return 'general';
}

function normalizeCourseRoute(value: unknown, prompt: string): HtmlCourseRoute {
  if (value === 'math') return 'math';
  if (value === 'computer-science' || value === 'computer_science' || value === 'cs') {
    return 'computer-science';
  }
  if (value === 'science') return 'science';
  if (value === 'business') return 'business';
  if (value === 'humanities') return 'humanities';
  if (value === 'social-science' || value === 'social_science') return 'social-science';
  if (value === 'general') return 'general';
  return inferCourseRouteFromPrompt(prompt);
}

function normalizeCsRoute(
  value: unknown,
  codeRoute: HtmlCodeRoute | undefined,
  prompt: string,
): HtmlCsRoute {
  const allowed = new Set<HtmlCsRoute>([
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
  if (typeof value === 'string' && allowed.has(value as HtmlCsRoute)) {
    return value as HtmlCsRoute;
  }
  if (codeRoute === 'memory-trace') return 'memory-diagram';
  if (codeRoute === 'execution-trace') return 'execution-trace';

  const text = prompt.toLowerCase();
  const hasPointer =
    /linked\s*list|doubly|pointer|node|prev|next|front|链表|节点|指针|前驱|后继/.test(text);
  const hasInvariant = /invariant|合法|不变量|结构承诺|size|ordering|connectivity/.test(text);
  if (hasPointer && hasInvariant) return 'composite-operation';
  if (/graph|bfs|dfs|frontier|visited|neighbor|queue.*visited|图搜索|广度|深度|邻居/.test(text)) {
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

function normalizeMathRoute(
  value: unknown,
  prompt: string,
  pageKind: string | undefined,
): HtmlMathRoute {
  const allowed = new Set<HtmlMathRoute>([
    'standard',
    'definition-theorem',
    'formula-focus',
    'derivation',
    'proof',
    'worked-example',
    'concept-map',
    'comparison-table',
  ]);
  if (typeof value === 'string' && allowed.has(value as HtmlMathRoute)) {
    return value as HtmlMathRoute;
  }

  const text = prompt.toLowerCase();
  if (/proof|prove|证明|证毕|命题.*证明|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|step|推导|化简|求导过程|递推|等价变形/.test(text)) {
    return 'derivation';
  }
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
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) {
    return 'comparison-table';
  }
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

function pageKindContract(
  pageKind: string | undefined,
  canvasMode: 'slide' | 'tall' | 'long' = 'slide',
): string {
  const isLongCanvas = canvasMode === 'long';
  switch (pageKind) {
    case 'cover':
      return [
        '- 页面类型：封面页。',
        '- 封面页是整节课 / 整本 notebook 的第一页，只负责建立主题识别，不展开正文教学。',
        '- 主标题是唯一必须文字；副标题/定位、来源、短标签都是可选内容，拥挤时全部删掉。',
        '- 封面页的重点是选对背景/主视觉：可以使用 CSS 渐变/数据网络/电影感光影/学术几何，也可以使用本地内置背景图片。',
        '- 如果 prompt 包含 tech_hero_title，优先使用 /slide-backgrounds/dark-tech-neural.png 或 /slide-backgrounds/product-launch-dark-photo.png。',
        '- 如果 prompt 包含 cinematic_title_frame，优先使用 /slide-backgrounds/cinematic-stage-photo.png。',
        '- 如果 prompt 包含 academic_hero_cover，优先使用 /slide-backgrounds/academic-blueprint-photo.png。',
        '- 如果 prompt 包含 image_title_overlay，优先使用 /slide-backgrounds/lecture-hall-photo.png。',
        '- 封面页可以有更强视觉重心，但仍然必须是可编辑 HTML/CSS PPT，不是网页 landing page，也不是整页不可编辑海报截图。',
        '- 不要加入推导、证明、代码、题目答案、流程步骤、完整目录、长段落或大表格。',
        '- 如果提供了 AI 插图素材，封面主视觉应只使用该插图；文字仍然必须是可编辑 DOM 文本。',
        '- 封面页文字应克制：标题大，其他字很少；总可见文字建议 20-160 个中文/等价字符。',
        '- 封面应在第一屏完整可见，并隐约暗示下一页会进入的课程主题；不要只剩空背景和一个小标题。',
      ].join('\n');
    case 'intro':
      return [
        '- 页面类型：介绍页。',
        '- 生成简洁开场页：清晰标题、一句短定位、3-4 个具体入口/价值模块。',
        '- 介绍页只负责引发兴趣和建立入口，不要提前展开完整讲解。',
        '- 每个入口模块最多保留标题和一个极短解释句；不要添加模块底部说明、项目符号、第二层小标题或逐卡 CSS 插图。',
        '- 如果入口模块文字很短，必须使用紧凑横向短卡、短条或标签组；不要生成 200px 以上高度的大空白卡片来填版面。',
        '- 整体视觉尺度要像 PPT 封面/导入页，不像网页 hero：H1 建议 56-72px，模块标题 26-32px，正文 24-28px，卡片 padding 24-36px。',
        '- 如果版式整体偏满，可以在 .slide-content 内包一层 .fit-layer，用 width/height:calc(100% / .92) 配合 transform:scale(.92); transform-origin:top left，让内部先获得更大布局空间再缩回可视区域；不要缩放 .slide，也不要用超大容器再裁切。',
        '- 如果提供了 AI 插图素材，主视觉必须只使用该插图；入口模块不要再手绘小图、速度表、曲线或复杂图标。',
        '- 底部引导问题应是单条横向问题条，不能挤压或覆盖入口模块。',
        '- 不要做成营销落地页或巨大 hero，必须像可直接放进课程/产品介绍的 PPT 页面。',
        '- 不要添加公式、证明、代码、题目解答或与导入主题无关的 QA 面板。',
      ].join('\n');
    case 'summary':
      return [
        '- 页面类型：总结页。',
        '- 生成克制的总结板，只允许这些区域：标题区、一个可选紧凑核心指标、清单/takeaway、一个收束判断条。',
        '- 如果 prompt 或标题指定了明确数量，例如“5 个问题”“4 条结论”，必须逐字满足该数量；没有明确数量时默认 3 条 takeaway。',
        '- 每条 takeaway/问题只能包含短标题和一句短解释，保证可读和完整显示。',
        '- 不要添加“含义/影响/建议/下一步/三角度分析/运营解读”等额外面板，也不要把受众转写成额外内容区。',
        '- 不要嵌套多层卡片、图标列表或右侧 dashboard；总结页应该像复盘结论页，不是仪表盘。',
        '- 避免长段落，总可见文字应明显少于 dense 页面，优先删掉解释性副文本。',
        '- takeaway 卡片必须是短卡片或紧凑横条，高度建议 120-170px；不要生成 200px 以上的大空卡。',
        '- 如果每条 takeaway 只有两行文字，就把卡片高度压缩，不要拉伸填满整页。',
        '- 不要靠小字号制造精致感；除极少数装饰标签外，所有可读文字应不低于 22px，takeaway 正文建议 24px 以上。',
        '- 除非用户明确要求数学总结，否则不要使用 MathML、公式卡或题目解答。',
      ].join('\n');
    case 'process':
      return [
        '- 页面类型：流程页。',
        '- 页面只能包含：标题区、4-5 个流程步骤、一个可选风险/检查提示条。',
        '- 展示 4-5 步流程：方向明确，步骤标签短，每步有一个输出或检查点。',
        '- 主流程区必须紧跟标题区，不能在标题和流程之间留大片空白。',
        '- 每步只允许短标题 + 动作短句 + 一个输出/检查点短句；不要把步骤扩写成段落说明。',
        '- 步骤标题字号不低于 30px，步骤正文不低于 24px；只有编号、eyebrow 和状态标签可以更小。',
        '- 流程轨道必须占据页面中部主要视觉区域，不能只是几张小卡片漂在空白背景上。',
        '- 如果横向排列 5 个步骤，.slide-content 内宽约 1472px，5 张卡片 + 4 个连接器总宽必须小于等于 1440px。',
        '- 横向流程建议每张步骤卡 220-235px、连接器 28-40px；不要写 260px 70px 260px 这种总宽超过内宽的固定列。',
        '- 流程关系要一眼可见，不要只用表格作为唯一结构。',
        '- 流程步骤卡片或节点必须高度紧凑，不要生成大空卡；如果只有两行文字就压缩高度。',
        '- 不要使用负 margin、负 top/left/right/bottom 或 transform translate 来居中箭头/装饰。',
        '- 严禁加入 prompt 没要求的公式、MathML、例题、证明、代码、不可做题目或额外 QA 面板。',
        '- 页面只能围绕这一个流程展开：步骤、输入/输出、检查点、风险提示。不要生成第二个主题区。',
      ].join('\n');
    case 'table':
      return [
        '- 页面类型：表格页。',
        '- 页面只能包含：标题区、一个真实 HTML <table>、一句短阅读规则或结论。',
        '- 必须包含一个紧凑、可编辑的 HTML <table>，3-5 列，3-6 行正文。',
        '- 不要用 div/card/grid 伪造表格；必须使用 table、thead、tbody、tr、th、td。',
        '- 只允许一张表，不要额外添加指标卡、图例、流程卡、第二张表或右侧解释面板。',
        '- 每个单元格都要短，数字对齐清楚，并加一句简洁阅读规则或结论。',
        '- 表格必须完整落在 1600×900 内；如果内容多，缩短单元格文字，而不是缩小到难读字号。',
        '- 除非用户明确要求公式表，否则不要使用 MathML 或另起公式/证明区域。',
      ].join('\n');
    case 'math':
      if (isLongCanvas) {
        return [
          '- 页面类型：长数学证明 / 长推导页。',
          '- 页面应使用 4-7 个纵向 section 展开：命题/定义、证明目标、关键定理、符号判断、结论、检查点。',
          '- 核心公式必须使用真实原生 MathML，通常 5-10 个 <math> 块；不要用纯文本、TeX 字符串、图片、SVG 或 canvas 代替。',
          '- 每个公式卡要有短标题和一句解释，公式字号建议 22-26px；长公式拆成两行短公式，不要横向撑破。',
          '- 证明步骤必须按逻辑顺序自然展开，不能放进内部滚动框，也不能用裁切隐藏底部内容。',
          '- 不要使用 <mspace>，不要用大空白撑版。',
        ].join('\n');
      }
      return [
        '- 页面类型：数学页。',
        '- 页面只能包含：标题区、核心公式/定义区、紧凑推导或对比区、一个例题/提醒区。',
        '- 核心公式必须使用真实原生 MathML，总共 3-7 个 <math> 块。',
        '- 主要公式不能用纯文本、TeX 字符串、图片、SVG 或 canvas 代替。',
        '- 文字说明放在公式块外；可以用公式卡、紧凑推导或紧凑表格，但不能溢出。',
        '- 公式卡片最多 3 个；推导行最多 4 行；长公式必须拆成短行，不能横向撑破。',
        '- 如果 prompt 要求“定义卡/术语卡/小例子/结论”等多个块，必须全部可见；使用紧凑 2×2 grid 或上下两行 flow，不要让底部例子覆盖上方定义卡。',
        '- MathML 符号必须精确：复合函数用 <mo>∘</mo> 或可见字符 ∘，笛卡尔积用 <mo>×</mo> 或可见字符 ×，逆像用 <msup> 或清晰的 f^{-1}。',
        '- 每个公式容器必须给足 line-height 和 padding；不要让 <math> 或其子元素被自己的卡片高度裁掉。',
        '- 不要使用 <mspace>，不要用大空白撑版。',
      ].join('\n');
    case 'code':
      if (isLongCanvas) {
        return [
          '- 页面类型：长代码题 / 长代码讲解页。',
          '- 页面应使用 5-7 个纵向 section 展开：题目、函数目标、关键代码、状态追踪、常见错误、最终答案/检查。',
          '- 必须包含一个可编辑的 <pre><code> 关键代码块，长页最多 24 行；代码必须完整可读，不能横向溢出。',
          '- 状态追踪应使用真实 HTML table 或清晰步骤卡，保留关键变量变化；不要把 trace 塞进内部滚动框。',
          '- 长代码页可以比单屏代码页更完整，但仍要分段讲解；不要生成博客长文、完整教程或第二个教学主题。',
          '- 不要加入无关数学公式、MathML、无关例题或源页没有的复杂 class。',
        ].join('\n');
      }
      return [
        '- 页面类型：代码 / 代码追踪页。',
        '- 页面只能包含：标题区、一个关键代码块、一个解释/trace/state 区；最多再加一句短结论。',
        '- 必须包含一个可编辑的 <pre><code> 关键代码块，代码最多 12 行，且只展示源页最关键片段。',
        '- trace/state 区是可选的；如果使用，最多 3 步，每步一行状态，不要生成长步骤列表。',
        '- 代码必须可读且不能造成页面横向溢出；删掉无关行，不要靠无限缩小字号解决。',
        '- 如果代码块超过 12 行，优先省略非关键行并用一行注释说明，不要让 pre 变成超高容器。',
        '- 代码和 trace 必须对应同一个输入；不要补写源页没有的完整 class、完整运行结果或完整教程。',
        '- 不要加入数学公式、MathML、无关例题或第二个教学主题。',
      ].join('\n');
    case 'example':
      return [
        '- 页面类型：例子 / 反例 / 例题页。',
        '- 先判断源页是不是明确的题目：只有源页真的要求求解/证明/计算时，才使用“题目-已知-步骤-答案”结构。',
        '- 如果源页只是一个例子或反例，页面只能包含：一个具体例子、2-3 个观察点、一句结论/风险；不要改造成练习题。',
        '- 如果确实是题目，最多 3 个求解步骤；已知条件、步骤、答案必须互相对应，关键数字必须完整可见。',
        '- 如果 prompt 要求给出“短理由”“检查点”“结论”，这些内容必须在对应卡片里完整显示；不要只放结果而留下大空卡。',
        '- 结果卡如果内容很少，应压缩高度或加入 prompt 指定的理由/观察点；不要生成占半页的大空白卡。',
        '- 不要额外添加第二道题、背景故事、营销说明、多个公式区、长步骤表或无关图表。',
        '- 只生成 prompt 指定的例子/题目，不要额外添加无关公式、证明或第二个教学主题。',
      ].join('\n');
    default:
      return '';
  }
}

function codeRouteContract(
  codeRoute: RequestBody['codeRoute'],
  canvasMode: 'slide' | 'tall' | 'long',
): string {
  if (codeRoute === 'memory-trace') {
    return [
      '- 代码线路：Memory Trace / 内存追踪。',
      '- 这类页面不要只生成普通代码块或普通 trace 表；必须复用“代码 + 当前动作 + 调用栈 + 堆对象 + 引用关系”的视觉语法。',
      '- 必须有一个清晰的 memory trace 区：左侧/上方显示当前执行代码或关键代码片段，右侧/下方显示 stack/call stack 与 heap。',
      '- 调用栈区域必须展示变量名和值/引用，例如 a -> list#1、self -> obj#1；堆区域必须展示对象卡片和字段/元素。',
      '- 如果主题是 OOP，heap object 必须展示属性/字段；如果主题是 list/dict/aliasing，heap object 必须展示元素或键值。',
      '- 用 CSS/DOM 画引用关系即可：可用箭头符号、连接线、ref pill、色块高亮；不要使用 SVG/canvas，不要用图片截图。',
      '- 页面应有 3-4 个 step tab 或 current action 标签；如果不是长页，只展开当前关键步骤，不要把全部步骤纵向摊开。',
      canvasMode === 'long'
        ? '- 长页可以纵向展开 4-6 个 memory snapshot section，但每个 snapshot 都必须包含 stack 与 heap，不要退化成段落解释。'
        : canvasMode === 'tall'
          ? '- 中高页可以纵向展开 2-3 个 memory snapshot section，但每个 snapshot 都必须包含 stack 与 heap，不要退化成段落解释。'
          : '- 16:9 页面推荐布局：标题区 + compact code strip + memory snapshot 主区 + 一句检查结论。',
      '- 可见文字必须是简体中文；保留必要的变量名、类名、方法名和 Python 关键字。',
    ].join('\n');
  }

  if (codeRoute === 'execution-trace') {
    return [
      '- 代码线路：Execution Trace / 执行状态追踪。',
      '- 页面必须同时有关键代码和状态变化，不要只生成孤立代码块。',
      '- trace 区优先使用真实 HTML table 或 3-5 个状态行，列出当前行、读取的值、变量变化、下一步决定。',
      '- 代码和 trace 必须对应同一个输入；不要补写无关完整教程。',
    ].join('\n');
  }

  return '';
}

function csRouteContract(csRoute: HtmlCsRoute, canvasMode: 'slide' | 'tall' | 'long'): string {
  const longPageNote =
    canvasMode === 'long'
      ? '- 长页可以纵向展示多个状态快照，但每个 section 都必须是同一种 CS 语义，不要混成讲义长文。'
      : canvasMode === 'tall'
        ? '- 中高页可以展示 2-4 个关键状态或结构块，但仍要保持同一种 CS 语义和正常文档流。'
        : '- 16:9 页面只展开一个关键状态或 3-5 个短步骤；不要把完整教程塞进一页。';

  switch (csRoute) {
    case 'execution-trace':
      return [
        '- CS 版式：Execution Trace / 代码执行追踪。',
        '- 必须同时出现关键代码和状态变化；状态区要列当前行、读到的值、变量变化、下一步决定。',
        '- 适合循环、条件分支、算法执行；不要画 heap/object 关系来分散注意力。',
        longPageNote,
      ].join('\n');
    case 'memory-diagram':
      return [
        '- CS 版式：Memory Diagram / Stack + Heap + References。',
        '- 必须区分 stack/call stack 里的名字和 heap 里的对象；对象要有 id，例如 list#1、obj#1。',
        '- OOP 页面要显示 self 当前引用、属性字段和写入后的字段值；aliasing 页面要显示多个名字指向同一个对象。',
        '- 用 DOM 卡片、ref pill、箭头符号或连接线表达引用；不要退化成普通 bullet 或纯表格。',
        longPageNote,
      ].join('\n');
    case 'call-stack':
      return [
        '- CS 版式：Call Stack / 递归调用栈。',
        '- 必须展示多个 frame，标出当前运行 frame、等待中的 frame、参数、局部变量和返回值流向。',
        '- 适合递归、函数调用、base case；不要只写“函数调用自己”的概念总结。',
        longPageNote,
      ].join('\n');
    case 'pointer-diagram':
      return [
        '- CS 版式：Pointer Diagram / 链表指针图。',
        '- 必须展示节点卡片和指针字段，例如 item、next、prev；显示 front/curr/prev/new_node 等名字指向哪里。',
        '- 如果是链表操作，必须展示改指针前后的关键关系；不要只用代码块或列表总结。',
        longPageNote,
      ].join('\n');
    case 'tree-diagram':
      return [
        '- CS 版式：Tree / BST Diagram。',
        '- 必须展示树节点、父子关系、当前节点和选择路径；BST 要显式标出左小右大或搜索方向判断。',
        '- 普通树和 BST 不能混讲：普通树强调 traversal rule，BST 强调 order invariant。',
        longPageNote,
      ].join('\n');
    case 'graph-trace':
      return [
        '- CS 版式：Graph Trace / frontier + visited。',
        '- 必须展示 graph 节点/边、frontier、visited、当前处理节点和下一步选择规则。',
        '- BFS 用 queue 语义，DFS 用 stack/call stack 语义；不要只给最终访问顺序。',
        longPageNote,
      ].join('\n');
    case 'linear-structure':
      return [
        '- CS 版式：Linear Structure / Stack or Queue。',
        '- 必须展示 active end：stack 的 top，queue 的 front/back。',
        '- 操作必须对应 push/pop 或 enqueue/dequeue，并展示操作后的结构快照。',
        longPageNote,
      ].join('\n');
    case 'dictionary-diagram':
      return [
        '- CS 版式：Dictionary Diagram / key-value 映射。',
        '- 必须展示 key 到 value 的映射、lookup/update/insert 动作和变化后的 entry。',
        '- 如果有代码，代码只保留触发 mutation 的关键行；核心视觉是映射变化，不是普通 trace 表。',
        longPageNote,
      ].join('\n');
    case 'invariant-check':
      return [
        '- CS 版式：Invariant Check / 结构合法性检查。',
        '- 必须列出结构承诺、当前操作后状态、逐条检查结果和最终是否合法。',
        '- 适合 size、ordering、connectivity、front/back、parent-child 等规则；不要只写泛泛“注意事项”。',
        longPageNote,
      ].join('\n');
    case 'composite-operation':
      return [
        '- CS 版式：Composite Operation / 综合操作页。',
        '- 只允许组合最多三块：关键代码、结构快照、invariant 检查。',
        '- 适合链表删除/插入、树旋转、dictionary 统计等操作；每块必须对应同一个操作瞬间。',
        '- 如果内容太多，优先删解释文字，保留代码行、结构状态和检查结果。',
        longPageNote,
      ].join('\n');
    case 'standard':
    default:
      return [
        '- CS 版式：Standard / 标准课程页。',
        '- 使用标准 intro/concept/summary/process/table/example 页面结构；不要强行生成 trace 或 diagram。',
        '- 即使是标准页，也要从具体输入、对象、错误场景或写代码前问题切入，避免纯术语堆叠。',
      ].join('\n');
  }
}

function mathRouteContract(
  mathRoute: HtmlMathRoute,
  canvasMode: 'slide' | 'tall' | 'long',
): string {
  const longPageNote =
    canvasMode === 'long'
      ? '- 长页可以纵向展开完整证明/推导，但要分成清楚 section，不要变成普通网页文章。'
      : canvasMode === 'tall'
        ? '- 中高页可以展开一个稍长的定义/推导/例题动作，但要保留课件块状结构和正常文档流。'
        : '- 16:9 页面只保留一个数学动作；公式、条件和结论都必须在一屏内完整可见。';

  switch (mathRoute) {
    case 'definition-theorem':
      return [
        '- 数学版式：Definition / Theorem Board。',
        '- QA 必须能识别：页面可见文字里要出现“定义/定理/对象/符号”“条件/假设”“结论/读法/例子/检查”这些结构信号。',
        '- 必须区分定义/定理文本、条件、结论、一个短例子或检查问题。',
        '- 至少包含 1 个真实 MathML 公式或符号块；不要只用普通文字伪装数学。',
        '- 适合引入新对象、新判定、新命题；不要把它做成泛泛卡片列表。',
        '- 定义页必须保留源材料的标准对象和符号：对象是什么、条件是什么、结论/读法是什么、如何用一个小例子检查。',
        '- 不要自行改名核心符号，也不要引入源材料没有的新记号来显得更数学。',
        longPageNote,
      ].join('\n');
    case 'formula-focus':
      return [
        '- 数学版式：Formula Focus / 核心公式页。',
        '- QA 必须能识别：页面有一个主 MathML 公式，并有“符号/含义/条件/使用”解释区。',
        '- 必须突出一个主公式，配 2-3 个符号解释和一个使用条件；主公式必须使用 MathML。',
        '- 不要堆很多同级公式；如果公式多，选最核心的一条，其余做短注释。',
        longPageNote,
      ].join('\n');
    case 'derivation':
      return [
        '- 数学版式：Derivation Ladder / 推导阶梯。',
        '- QA 必须能识别：至少 3 行 MathML 推导、2 个以上步骤信号，以及“因为/由/代入/得到/所以/化简”等每步理由。',
        '- 必须用 3-5 行推导展示从起点到结论的变形；每行只做一个数学动作。',
        '- 每一步要有短理由，例如“代入定义”“两边同除”“使用链式法则”。',
        longPageNote,
      ].join('\n');
    case 'proof':
      return [
        '- 数学版式：Proof Walkthrough / 证明讲解。',
        '- QA 必须能识别：页面有“证明目标/要证”“假设/条件”“构造/关键判断”“结论/证毕”等结构信号。',
        '- 必须展示证明目标、假设/条件、关键定理或构造、符号判断、结论。',
        '- 不要把证明压成一句结论；也不要把所有细节塞成小字长文。',
        longPageNote,
      ].join('\n');
    case 'worked-example':
      return [
        '- 数学版式：Worked Example / 例题拆解。',
        '- QA 必须能识别：页面有“题干/问题/已知”、至少 2 个求解步骤，以及“答案/结果/检查”。',
        '- 必须包含题干、已知条件、最多 3-4 个求解步骤、答案/检查。',
        '- 至少包含 2 个真实 MathML 公式或符号块；数字、条件、步骤和答案必须互相对应。',
        '- 数字、条件、公式和最终答案必须互相对应；不能只给方法总结。',
        '- 例题必须可逐项检查：给出输入对象、适用规则、关键判断、最终结论和一个短检查。',
        '- 如果为了容量替换源例子，必须选小而等价的例子，并明确保留同一个数学概念和验证动作。',
        longPageNote,
      ].join('\n');
    case 'concept-map':
      return [
        '- 数学版式：Concept Map / 概念关系图。',
        '- QA 必须能识别：页面有数学概念节点和关系边，例如“定义/条件/结论/例子”与“推出/对应/包含/关系”。',
        '- 必须展示概念节点和关系边，例如定义 -> 条件 -> 结论 -> 例子。',
        '- 使用 DOM 卡片/连线/箭头即可；不要用 SVG/canvas，也不要让关系图越界。',
        longPageNote,
      ].join('\n');
    case 'comparison-table':
      return [
        '- 数学版式：Comparison / Case Table。',
        '- QA 必须能识别：必须使用真实 HTML table，并出现“条件/适用/场景/结论/反例/比较”等对比维度。',
        '- 必须使用真实 HTML table 或紧凑对比矩阵，比较条件、适用场景、结论。',
        '- 适合判别法、分情况、定义对比；不要额外加入大公式区挤压表格。',
        longPageNote,
      ].join('\n');
    case 'standard':
    default:
      return [
        '- 数学版式：Standard / 标准数学课程页。',
        '- 使用标准介绍、总结、流程、表格或例题结构；只有需要公式/证明/推导时才启用专属数学版式。',
      ].join('\n');
  }
}

function courseRouteContract(
  courseRoute: HtmlCourseRoute,
  {
    pageKind,
    codeRoute,
    csRoute,
    mathRoute,
    canvasMode,
  }: {
    pageKind?: string;
    codeRoute?: HtmlCodeRoute;
    csRoute: HtmlCsRoute;
    mathRoute: HtmlMathRoute;
    canvasMode: 'slide' | 'tall' | 'long';
  },
): string {
  const canvasNote =
    canvasMode === 'long'
      ? '- 这是长页面：可以纵向展开完整过程，但每个 section 仍要像课件板块，不要变成网页文章。'
      : canvasMode === 'tall'
        ? '- 这是中高课件页：可以比 16:9 多放 1-2 个正常文档流内容区，但仍要像课件板块，不要变成网页文章。'
        : '- 这是 16:9 单页：必须只选一个教学动作，删掉旁枝，不要把完整讲义压进一页。';

  if (courseRoute === 'math') {
    return [
      '- 课程路线：数学 / 定量推导。',
      '- 页面应像数学课堂课件：定义、命题、符号、推导、例题、检查点要按逻辑组织。',
      mathRoute === 'standard'
        ? '- 当前是数学标准页：可以使用介绍、总结、流程、表格或概念页结构，不要强行塞公式。'
        : `- 当前启用数学专属版式：${mathRoute}。必须按该数学动作组织页面。`,
      '- 不要把数学内容做成通用 dashboard、营销 hero 或只有卡片标签的概览页。',
      '- 核心公式、证明目标、关键等式必须明确可见；重要公式优先使用 MathML。',
      '- 先从 prompt/source anchors 中识别本页的标准数学对象、符号、表示法和验证动作，再选择结构；不要把数学内容做成抽象 AI 插图、装饰波纹图或图片占位。',
      '- 数学记号必须跟随 prompt/source anchors。不要自行发明新符号、改名核心对象，或把一个对象误写成另一个带下标/上标的对象。',
      '- 示例必须数学上可验证：给出输入对象、适用规则、候选项/步骤、以及为什么成立或不成立。不要用随意图标、空泛标签或只给答案。',
      '- 可以为了容量换成更短的等价例子，但不能改变概念、条件、结论或证明动作。',
      pageKind === 'example' ? '- 数学例题必须可做：题干、已知、步骤、答案/检查要互相对应。' : '',
      canvasNote,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (courseRoute === 'computer-science') {
    return [
      '- 课程路线：计算机科学 / 编程。',
      '- 页面应围绕代码对象、执行状态、数据结构、内存关系或输入输出，而不是通用概念卡片。',
      '- 保留必要英文代码标识：变量名、类名、函数名、关键字、文件名不要翻译；周围解释必须是简体中文。',
      csRoute === 'standard'
        ? '- 当前是 CS 标准页：可以使用介绍、概念、总结、表格、流程或例题结构，不要强行生成 trace/diagram。'
        : `- 当前启用 CS 专属版式：${csRoute}。必须按该语义组织页面。`,
      '- 如果是代码页，优先使用“代码 + 状态/内存/对象关系”的结构；不要生成纯文字总结或泛泛流程图。',
      codeRoute === 'memory-trace'
        ? '- 本页是 memory trace：必须展示 stack/heap/reference/object field 这些可编辑 DOM 结构。'
        : '',
      codeRoute === 'execution-trace'
        ? '- 本页是 execution trace：必须展示关键代码与变量状态变化，状态行不能和代码脱节。'
        : '',
      '- OOP/属性/引用适合 memory-diagram；linked list 适合 pointer-diagram；tree/BST 适合 tree-diagram；BFS/DFS 适合 graph-trace；stack/queue 适合 linear-structure；dictionary 适合 dictionary-diagram。',
      '- 不要补写无关完整程序、完整教程或源页没有的大段代码。',
      canvasNote,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (courseRoute === 'science') {
    return [
      '- 课程路线：自然科学。',
      '- 页面应围绕现象、变量、机制、实验/证据、结论检查来组织。',
      '- 适合使用可编辑 DOM 图示、变量表、实验条件表或因果链；不要做成商业指标页。',
      '- 如果有公式或单位，必须完整显示条件、单位和结论，不要只放漂亮标签。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'business') {
    return [
      '- 课程路线：商业 / 经济 / 管理。',
      '- 页面应围绕决策背景、关键数字、计算关系、对比矩阵或行动判断组织。',
      '- 数字、单位、前提和结论必须可见；不要伪造数学证明或代码 trace。',
      '- 例题可以使用更短的等价案例，但成本、收入、利润、阈值等关键量必须对应。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'humanities') {
    return [
      '- 课程路线：人文 / 文本分析。',
      '- 页面应围绕文本片段、语境、主张、证据、解释和反思问题组织。',
      '- 引文要短，不能让一页变成长文章；不要套用 dashboard 或指标卡语言。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'social-science') {
    return [
      '- 课程路线：社会科学。',
      '- 页面应围绕案例、主体、因素、证据、趋势或政策取舍组织。',
      '- 可以用对比表、因果图、案例卡，但必须保留变量/证据/结论关系。',
      '- 不要把社会科学内容做成泛泛鸡汤总结或纯商业 dashboard。',
      canvasNote,
    ].join('\n');
  }

  return [
    '- 课程路线：通用课程。',
    '- 根据内容选择最自然的教学结构；不要默认生成通用卡片堆叠。',
    canvasNote,
  ].join('\n');
}

function normalizeImageAsset(body: RequestBody['imageAsset']) {
  const src = body?.src?.trim();
  if (!src) return null;
  return {
    src: src.slice(0, 1000),
    alt: body?.alt?.trim().slice(0, 240) || 'AI 生成的教学插图',
    description: body?.description?.trim().slice(0, 1200) || '',
    aspectRatio: body?.aspectRatio?.trim().slice(0, 40) || '4:3',
  };
}

function normalizeSourceImages(
  assignedSourceImages: RequestBody['assignedSourceImages'],
  sourceImageMapping: RequestBody['sourceImageMapping'],
): Array<SourceImageAsset & { id: string; src: string }> {
  const seen = new Set<string>();
  const normalized: Array<SourceImageAsset & { id: string; src: string }> = [];
  for (const image of assignedSourceImages || []) {
    const id = image.id?.trim();
    if (!id || seen.has(id) || !/^[A-Za-z0-9_.:-]+$/.test(id)) continue;
    const src = image.src?.trim() || sourceImageMapping?.[id]?.trim() || '';
    if (!src) continue;
    seen.add(id);
    normalized.push({
      id,
      src,
      pageNumber: image.pageNumber,
      description: image.description?.trim().slice(0, 600),
      width: image.width,
      height: image.height,
    });
    if (normalized.length >= 4) break;
  }
  return normalized;
}

function sourceImagesPromptBlock(
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): string {
  if (sourceImages.length === 0) return '';
  return [
    '',
    '可用原文图片素材：',
    ...sourceImages.map((image) => {
      const size =
        image.width && image.height
          ? `，原始尺寸 ${Math.round(image.width)}×${Math.round(image.height)}`
          : '';
      const page = image.pageNumber ? `第 ${image.pageNumber} 页` : '原文页';
      return `- ${image.id}: ${page}${size}${image.description ? `。说明：${image.description}` : ''}`;
    }),
    '使用要求：',
    '- 这些图片来自用户上传的原文件/论文/课件，优先作为证据、图表或原文截图使用，不是 AI 插图。',
    '- 使用前必须观察图片真实内容：标题、caption 和解释只能描述图片实际呈现的东西，不能按你期待的图种来命名。',
    '- 如果图片是照片、视频样例帧或普通截图，就称为“视觉样例/原文截图/示例图”；不要误称为架构图、流程图、表格、结果图或 pipeline。',
    '- 如果使用图片，HTML 中必须先写图片 ID 占位，例如 <img src="img_1" alt="原文图表：..." />；服务端会把该 ID 替换为真实图片。',
    '- 只能使用上面列出的图片 ID，不要虚构 img_99、source-image、外链 URL、base64、SVG 或 canvas。',
    '- 同一张原文图片默认只渲染一次；如果页面需要比较两个概念，用 DOM 文本、表格或卡片比较，不要复制同一张图两次。',
    '- 保持图片比例：figure/img 容器必须有稳定宽高，img 使用 object-fit: contain，不要拉伸、裁切或铺满整页。',
    '- 图片旁边必须有可编辑 DOM 文本标题/页码/短说明；图片本身不要承担所有文字信息。',
  ].join('\n');
}

function collectUsedImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]?.trim();
    if (value && /^[A-Za-z0-9_.:-]+$/.test(value)) ids.add(value);
  }
  for (const match of html.matchAll(/\bdata-source-image-id\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]?.trim();
    if (value && /^[A-Za-z0-9_.:-]+$/.test(value)) ids.add(value);
  }
  for (const match of html.matchAll(/url\(\s*["']?([A-Za-z0-9_.:-]+)["']?\s*\)/gi)) {
    const value = match[1]?.trim();
    if (value) ids.add(value);
  }
  return Array.from(ids);
}

function analyzeSourceImageUsage(
  html: string,
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): SourceImageUsage {
  const assignedIds = sourceImages.map((image) => image.id);
  if (assignedIds.length === 0) {
    const inventedIds = collectUsedImageIds(html).filter((id) => /^img_\d+$/i.test(id));
    return { assignedIds, usedIds: [], missingIds: [], inventedIds };
  }
  const assignedSet = new Set(assignedIds);
  const usedIds = collectUsedImageIds(html).filter((id) => assignedSet.has(id));
  const usedSet = new Set(usedIds);
  const missingIds = assignedIds.filter((id) => !usedSet.has(id));
  const inventedIds = collectUsedImageIds(html).filter(
    (id) => /^img_\d+$/i.test(id) && !assignedSet.has(id),
  );
  return {
    assignedIds,
    usedIds: Array.from(usedSet),
    missingIds,
    inventedIds: Array.from(new Set(inventedIds)),
  };
}

function resolveSourceImagePlaceholders(
  html: string,
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): string {
  if (sourceImages.length === 0) return html;
  let resolved = html;
  for (const image of sourceImages) {
    const escapedId = image.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const src = image.src.replace(/"/g, '&quot;');
    resolved = resolved
      .replace(new RegExp(`(\\bsrc\\s*=\\s*["'])${escapedId}(["'])`, 'g'), `$1${src}$2`)
      .replace(new RegExp(`(url\\(\\s*["']?)${escapedId}(["']?\\s*\\))`, 'g'), `$1${src}$2`);
  }
  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    const qualityFeedback = body.qualityFeedback?.trim().slice(0, 2000);
    if (!prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }
    if (prompt.length > 8000) {
      return apiError('INVALID_REQUEST', 413, 'Prompt is too long for HTML PPT generation');
    }
    const pageKind = body.pageKind?.trim();
    const codeRoute = body.codeRoute;
    const courseRoute = normalizeCourseRoute(body.courseRoute, prompt);
    const csRoute = normalizeCsRoute(body.csRoute, codeRoute, prompt);
    const mathRoute = normalizeMathRoute(body.mathRoute, prompt, pageKind);
    const densityContract = body.densityContract?.trim().slice(0, 2000);
    const canvasMode =
      body.canvasMode === 'long' || body.canvasMode === 'tall' ? body.canvasMode : 'slide';
    const canvasHeight =
      canvasMode === 'long'
        ? Math.min(3200, Math.max(1600, Math.round(body.canvasHeight || 2200)))
        : canvasMode === 'tall'
          ? Math.min(1600, Math.max(1050, Math.round(body.canvasHeight || 1200)))
          : 900;
    const isLongCanvas = canvasMode === 'long';
    const isTallCanvas = canvasMode === 'tall';
    const isExpandedCanvas = canvasMode !== 'slide';
    const imageAsset = normalizeImageAsset(body.imageAsset);
    const sourceImages = normalizeSourceImages(body.assignedSourceImages, body.sourceImageMapping);
    const retryReason = body.retryReason?.trim().slice(0, 1400);
    const requiresMath =
      pageKind === 'math' || courseRoute === 'math' || (!pageKind && promptNeedsMath(prompt));

    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    const system = [
      'You are an expert presentation designer and front-end engineer.',
      isLongCanvas
        ? `Generate one self-contained HTML document that renders exactly one long-form teaching page with width 1600px and target height ${canvasHeight}px.`
        : canvasMode === 'tall'
          ? `Generate one self-contained HTML document that renders exactly one taller teaching slide with width 1600px and target height ${canvasHeight}px.`
          : 'Generate one self-contained HTML document that renders exactly one 16:9 presentation slide.',
      'Unless the user explicitly asks for another language, all visible slide content must be written in Simplified Chinese.',
      'If source labels or code keywords are in English, keep only those necessary terms; surrounding explanation, headings, table headers, and callouts should be Simplified Chinese.',
      isLongCanvas
        ? 'The page must feel like an editable long PowerPoint handout/teaching board built from semantic HTML/CSS, not a web article or poster image.'
        : canvasMode === 'tall'
          ? 'The page must feel like an editable taller PowerPoint teaching slide, not a web article, poster, or long handout.'
          : 'The slide must feel like an editable PowerPoint page built from semantic HTML/CSS, not a poster image.',
      pageKind === 'cover'
        ? 'Use plain HTML and CSS only. Do not use JavaScript, external fonts, canvas, or SVG screenshots. For cover backgrounds only, you may use one local /slide-backgrounds/ image path or pure CSS gradients/shapes; never use external http(s) assets.'
        : 'Use plain HTML and CSS only. Do not use JavaScript, external fonts, canvas, or SVG screenshots. Do not use external assets except explicitly supplied source images and the single provided AI image asset when one is supplied.',
      'Use real DOM text for all labels. Use div/section/table/list elements and CSS shapes for cards, charts, icons, diagrams, and callouts. If source images are supplied, use them as original evidence/figures/tables. If an AI image asset is supplied, use it as a content illustration instead of drawing a complex CSS illustration.',
      'When an image asset is supplied, use exactly one <img> element with src set exactly to the provided src value. Do not invent, rewrite, fetch, or add any other image URL.',
      'When source images are supplied, use <img> elements with src set exactly to the source image IDs from the prompt, such as img_1. The server will resolve those IDs to the real uploaded-file images after generation.',
      'When source images are supplied as vision input, inspect the actual image content before deciding the figure title, caption, and surrounding explanation.',
      'Do not call a photograph, sample frame, or ordinary screenshot an architecture diagram, table, chart, pipeline, or flowchart unless it visibly is one.',
      'Do not duplicate the same source image within one slide. If a slide has two concepts but one source image, show the image once and compare the concepts with editable DOM text/cards.',
      'A supplied image asset is an illustration inside the slide, not a full-slide 16:9 background and not a screenshot of the finished slide.',
      'Use only the user-provided topic and content. Do not invent unrelated equations, formulas, example problems, proof snippets, source notation, QA panels, or "impossible question" text.',
      'Before designing, choose exactly one primary teaching action for the slide: concept explanation, comparison, code observation, counterexample, process, formula derivation, or worked problem. Do not combine multiple slide genres.',
      'Respect the course route contract in the user prompt. Subject-specific pages must use the right teaching grammar instead of falling back to generic card grids.',
      isLongCanvas
        ? 'Use a vertical teaching-page structure with 4-7 ordered sections. Each section should be compact, titled, and directly tied to the explanation.'
        : canvasMode === 'tall'
          ? 'Use a taller teaching-slide structure with 3-5 ordered sections. Each section should be compact and directly tied to one teaching move.'
          : 'Use at most three main content regions per slide, not counting the title area. A bottom conclusion/check strip counts as one region.',
      'The prompt is the content contract. If it specifies an exact title, exact item count, exact formulas, exact steps, short reasons, conclusion, or checkpoint, those items are mandatory and must remain visible.',
      'Never reduce a requested count to match a page-kind default. For example, if the prompt asks for 5 questions, render 5 questions even if a summary page usually uses 3 takeaways.',
      'The visible H1/title must match the prompt title exactly when one is provided. Do not rewrite it into a nicer or shorter synonym.',
      'Main content panels must not overlap. Use normal grid/flex document flow for title, main regions, and bottom strips. Do not place a bottom/example/conclusion panel over an upper card to save space.',
      'For 16:9 slides, bottom strips, summary bars, checkpoints, and conclusion panels must occupy a reserved normal-flow grid or flex row. Never position them absolute/fixed/sticky over the main content.',
      'If a bottom strip is requested, use a structure like grid-template-rows:auto minmax(0,1fr) auto or a flex column; the main content region above it must reserve enough height and must not extend underneath.',
      'Only the outer .slide-content wrapper may be positioned with inset. Inside it, all semantic content regions, cards, figures, example panels, visual slots, formula blocks, and bottom strips must remain normal-flow grid/flex children.',
      'Do not use position:absolute, position:fixed, position:sticky, z-index stacking, or negative transforms to place semantic content panels. Use those only for tiny decorative marks that do not contain text or images.',
      'If an illustration or source image is supplied, put its <figure> in a real grid/flex cell with aspect-ratio and max-height. It must not float above or under text cards.',
      'Do a bounding-box check before output: no covered content, no footer overlay, no card hidden behind another card, and no semantic content outside the slide.',
      'If content feels too dense, delete lower-priority material instead of shrinking, clipping, scrolling, or adding another panel. Deletion priority: neighbor context, decorative labels, secondary explanation, extra trace steps, extra conclusion/callout.',
      'Do not delete mandatory material. If mandatory content is too dense, compact its wording and simplify the layout while preserving all requested items.',
      'Do not transform ordinary examples into full exercise pages unless the user/source explicitly asks a question to solve. Do not add "known conditions", "solution steps", or "final answer" just to fill space.',
      'Only use MathML on math-heavy slides or when the user explicitly requests formulas/equations. For intro, summary, process, table, code, and ordinary worked-example pages, avoid <math> unless the prompt specifically asks for mathematical notation.',
      'For math-heavy slides, use native MathML elements such as <math>, <mfrac>, <msup>, <msub>, <msqrt>, <mo>, <mi>, <mn>, and <mtable> for important equations when possible. Use simple HTML <sup>/<sub> only for lightweight inline notation.',
      'If the user asks for equations, derivations, matrices, probability formulas, or math notation, the slide must contain real <math> blocks for the main formulas rather than plain text approximations.',
      'Do not use TeX delimiters as the visible formula renderer unless explicitly showing source notation. Do not use MathJax, KaTeX, scripts, external CSS, images, SVG, or canvas for formulas.',
      'Place equations inside bounded .formula, .math-card, or .equation-row containers with max-width, overflow:hidden, readable font sizes, and enough line height. If the math is dense, summarize steps instead of overflowing.',
      'For math-heavy slides, use max 7 <math> blocks, max 3 formula cards, max 4 derivation/table rows, and MathML font sizes between 20px and 26px. Prefer one-line equations. Never hide extra equations by clipping them.',
      'Do not use <mspace> to force large formula gaps. Break long formulas into two short stacked rows instead of one wide equation. Each <math> block must fit its card without horizontal clipping.',
      isExpandedCanvas
        ? `The renderer iframe width is exactly 1600px. Create one fixed-width ${isTallCanvas ? 'taller teaching slide' : 'long page'} stage: width 1600px, min-height ${canvasHeight}px, target total height close to ${canvasHeight}px.`
        : 'The renderer iframe viewport is exactly 1600px by 900px. Create one fixed 1600px by 900px slide stage that fills that viewport.',
      isExpandedCanvas
        ? `Set html and body to width: 1600px; min-height: ${canvasHeight}px; margin: 0; overflow-x: hidden; overflow-y: auto. The page may be vertically long but must not be horizontally scrollable.`
        : 'Set html and body to width: 1600px, height: 900px, margin: 0, overflow: hidden. The visible slide must not be taller, wider, scrollable, or portrait.',
      isExpandedCanvas
        ? `Follow the same semantic wrapper contract: exactly one <section class="slide"> containing one <div class="slide-content">. The .slide must be width:1600px; min-height:${canvasHeight}px; overflow:visible; position:relative; box-sizing:border-box.`
        : 'Follow the frontend-slides viewport contract: exactly one <section class="slide"> containing one <div class="slide-content">. The .slide must be width:1600px; height:900px; overflow:hidden; position:relative; box-sizing:border-box.',
      isExpandedCanvas
        ? 'The .slide-content must use the same width and safe side padding as normal slides, but may flow vertically. Use padding 64-80px and display:flex/grid with normal document flow; avoid absolute positioning for main sections.'
        : 'The .slide-content must live fully inside the slide, use a safe margin/padding of 56-72px, and must also use overflow:hidden; box-sizing:border-box.',
      'Use presentation-scale typography and spacing, not oversized web-app component sizing. As a default, h1 should be about 52-72px, section/card titles 26-36px, body text 22-30px, and card padding 22-36px.',
      isExpandedCanvas
        ? 'Do not use fit-layer scaling for expanded-height pages. They solve density by vertical flow and sectioning, not by shrinking the whole layout.'
        : 'If the composition feels visually too large or crowded, add an inner .fit-layer inside .slide-content with width/height set to calc(100% / scale), e.g. width:calc(100% / .92); height:calc(100% / .92); transform:scale(.92); transform-origin:top left. This gives the layout more internal space before scaling it back into the viewport. Do not transform .slide or rely on clipping.',
      isExpandedCanvas
        ? `Hard canvas rule: every visible DOM element will be checked with getBoundingClientRect(). Every rect must satisfy left>=0, top>=0, right<=1600, and bottom<=${canvasHeight + 80}. This includes decorative accents, backgrounds, cards, grids, tables, code blocks, formulas, and all child elements.`
        : 'Hard viewport rule: every visible DOM element will be checked with getBoundingClientRect(). Every rect must satisfy left>=0, top>=0, right<=1600, and bottom<=900. This includes decorative accents, backgrounds, cards, grids, tables, and all child elements.',
      'Do not create off-canvas decorative blobs/circles, negative-position accents, oversized background divs, or elements that are clipped by overflow:hidden. These still fail because their DOM bounding boxes are outside the viewport.',
      'Do not use negative top/left/right/bottom/inset, negative margin, or negative translate values for alignment. Center arrows, labels, and decoration with flex/grid/absolute bounds that stay fully inside the slide.',
      isExpandedCanvas
        ? `For decorative color, prefer CSS background gradients on .slide/.slide-content. If you create decorative DOM elements, keep them fully inside x=0..1600 and y=0..${canvasHeight + 80} with non-negative top/left and bounded width/height.`
        : 'For decorative color, prefer CSS background gradients on .slide/.slide-content. If you create decorative DOM elements, keep them fully inside 0..1600 x 0..900 with non-negative top/left and bounded width/height.',
      isExpandedCanvas
        ? `No content may extend beyond x=0..1600. Vertically, content should end near y=${canvasHeight} and must not exceed y=${canvasHeight + 80}. Do not clip text/code/math; use long-page vertical sections.`
        : 'No content may extend beyond x=0..1600 or y=0..900. Do not rely on scroll or clipping. If content is dense, reduce density, simplify copy, tighten the table, or split into fewer regions within this single slide.',
      isExpandedCanvas
        ? `Expanded page height is intentional. Do not use 100vh. Use min-height:${canvasHeight}px on .slide, and let .slide-content flow vertically with section gaps of 24-36px.`
        : 'Do not set large min-height values on the main content area. Avoid height:100vh and min-height:100vh. With 56-72px slide padding and a header, the body grid/content area should be at most 640px tall, and its bottom edge must stay at y<=884.',
      'Text/content cards may use overflow:hidden only for purely decorative overflow. Cards that contain requested text, formulas, tables, or steps must not clip their own content.',
      isExpandedCanvas
        ? '.slide-content should be a normal-flow vertical stack: max-width inside the 1600px page, gap:28px, and overflow:visible. Use sticky/fixed nothing. Use section cards, code/proof blocks, checkpoints, and summary strips.'
        : 'Recommended layout: .slide-content { position:absolute; inset:64px; display:grid; grid-template-rows:auto minmax(0,1fr); gap:24px; } and the main content region must use min-height:0; overflow:hidden.',
      'Use the density contract from the user prompt as a hard design constraint. Control density by editing copy length, number of blocks, table rows, formula count, and layout coverage; do not solve density by shrinking text until it becomes hard to read.',
      'The slide should be an edited teaching page, not a compressed transcript. Keep the strongest one idea and cut the rest.',
      'Large cards and panels are not allowed to be mostly empty. If a card/panel occupies more than about 8% of the slide, it must contain enough real structure to visually fill it, such as a short list, mini diagram, timeline, table rows, trace states, or compact examples. Otherwise reduce its height.',
      'Default density guardrail when no stricter contract is provided: max 1 title, max 4 metric cards, max 1 chart, max 1 compact table with 4 rows, max 6 short bullets/callouts total.',
      'All long text must wrap inside bounded containers. Avoid single-line labels wider than their container. Use min-width:0 on grid/flex children and overflow-wrap:break-word for text blocks.',
      'Include all styles in a single <style> tag.',
      'Use CSS classes with meaningful names, restrained visual hierarchy, and stable layout dimensions.',
      'Output only the complete HTML document. No Markdown fences and no explanation.',
    ].join('\n');

    const userPrompt = [
      prompt,
      courseRouteContract(courseRoute, { pageKind, codeRoute, csRoute, mathRoute, canvasMode }),
      courseRoute === 'computer-science' ? csRouteContract(csRoute, canvasMode) : '',
      courseRoute === 'math' ? mathRouteContract(mathRoute, canvasMode) : '',
      pageKindContract(pageKind, canvasMode),
      pageKind === 'code' ? codeRouteContract(codeRoute, canvasMode) : '',
      '',
      '质量要求：',
      isExpandedCanvas
        ? `- 输出必须是一张精致的${isTallCanvas ? '中高课件页' : '长页面教学版式'}，宽 1600px，目标高度约 ${canvasHeight}px，可纵向阅读。`
        : '- 输出必须是一张精致的商务/教育 PPT 页面。',
      '- 可见文字默认使用简体中文。',
      '- 包含清晰标题、结构化内容区域、视觉层级；如果适合题材，可以包含图表、表格或流程图。',
      '- 只使用 prompt 给出的主题和内容，不要自行加入无关公式、题目、证明、代码、QA 面板或第二个主题区。',
      '- 必须保留 prompt 中明确要求的标题、数量、公式、步骤、短理由、结论和检查点。',
      '- 如果 prompt 标出“必需保留清单”，清单里的内容必须逐项出现在可见页面里。',
      isLongCanvas
        ? '- 先选一个纵向主结构，分成 4-7 个清晰 section；长页面允许更多内容，但不能变成普通网页长文。'
        : isTallCanvas
          ? '- 先选一个中高课件结构，分成 3-5 个清晰内容区；比 16:9 更高，但仍是一页课件，不是网页长文。'
          : '- 先选一个主结构，再删减内容；一页最多 3 个主要内容区。',
      isExpandedCanvas
        ? '- 如果放不下，压缩次要解释或减少分支；不要横向溢出、裁切、覆盖，也不要把代码/公式放进内部滚动框。'
        : '- 如果放不下，删掉次要区块，不要裁切、滚动、覆盖、压缩成长讲义。',
      '- 没有明确题目的源页，不要改写成“题目/已知/求解步骤/最终答案”。',
      '- 保持投影片尺度下可读。',
      '- 避免泛化营销 hero 布局；这是一张课件/汇报 slide，不是 landing page。',
      '- HTML 应该容易通过修改文字和 CSS 数值继续编辑。',
      densityContract
        ? ['', '页面密度契约：', densityContract, '- 必须同时避免太空和太挤。'].join('\n')
        : '',
      sourceImagesPromptBlock(sourceImages),
      retryReason
        ? ['', '上游重试原因：', retryReason, '- 本次必须针对这个原因修复，不要只泛泛重写。'].join(
            '\n',
          )
        : '',
      qualityFeedback
        ? [
            '',
            '上一次本地质检失败，必须针对以下问题修复：',
            qualityFeedback,
            isExpandedCanvas
              ? `- 尤其注意：不要使用负横向坐标、负 margin、超宽装饰 div、出界背景块，所有 DOM 元素必须在宽 1600px、高约 ${canvasHeight}px 的增高画布内。`
              : '- 尤其注意：不要使用负坐标、负 margin、超大装饰 div、出界背景块，所有 DOM 元素边界都必须完全在 1600×900 内。',
            '- 如果失败原因提到 overlap/重叠/覆盖，必须改为正常 grid/flex 文档流：header、main、footer 各占自己的行，图片和底部卡片不能 absolute 叠在主内容上。',
          ].join('\n')
        : '',
      imageAsset
        ? [
            '',
            '可用 AI 插图素材：',
            `- src：${imageAsset.src}`,
            `- alt：${imageAsset.alt}`,
            `- 素材比例：${imageAsset.aspectRatio}`,
            imageAsset.description ? `- 素材内容：${imageAsset.description}` : '',
            '使用要求：',
            '- 这张图是插图素材，不是整页背景图，也不是 16:9 成品 slide。',
            '- 必须使用 exactly one <img>，src 必须逐字等于上面的 src。',
            '- 先在版式中预留一个明确的插图区，例如 <figure class="visual-slot">，再把这张图片作为该区域内的唯一 <img> 插进去。',
            isExpandedCanvas
              ? '- 插图区应该是增高画布中的一个 section 局部素材，宽高稳定；图片用 object-fit: cover 或 contain，不能溢出容器。'
              : '- 插图区应该是页面的一部分，宽高稳定，建议占画布 20%-34% 面积；图片用 object-fit: cover 或 contain，不能溢出容器。',
            isExpandedCanvas
              ? '- 插图区不能铺满整个增高画布，也不能让文字浮在图片上导致不可编辑或不可读。'
              : '- 插图区不能铺满整个 1600×900 画布，也不能让文字浮在图片上导致不可编辑或不可读。',
            '- 图片以外的标题、标签、模块、问题条都必须是可编辑 DOM 文本。',
            '- 不要再用 CSS 手绘复杂主图，也不要给每个模块手绘小图标；只保留必要的小色块、边框和排版。',
            '- 除了极少数装饰标签外，可读中文文字字号应尽量 >= 24px。',
          ]
            .filter(Boolean)
            .join('\n')
        : '',
    ].join('\n');

    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);

    const generateHtml = (nextPrompt: string) =>
      runWithRequestContext(
        req,
        '/api/generate/html-ppt-slide',
        () =>
          callLLM(
            sourceImages.length
              ? {
                  model,
                  system,
                  messages: [
                    {
                      role: 'user' as const,
                      content: buildVisionUserContent(nextPrompt, sourceImages, 'zh-CN'),
                    },
                  ],
                  maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
                }
              : {
                  model,
                  system,
                  prompt: nextPrompt,
                  maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
                },
            'html-ppt-slide-test',
            {
              retries: 1,
              validate: (text) => /<html\b[\s\S]*<\/html>/i.test(text),
            },
          ),
        {
          operationCode: 'html_ppt_slide_test',
          chargeReason: 'HTML PPT 页面测试',
          serviceLabel: 'HTML PPT generation',
          skipCreditCharge,
        },
      );

    const result = await generateHtml(userPrompt);
    let html = sanitizeHtml(extractHtml(result.text));
    const usages = [result.usage];
    const retryReasons: HtmlRetryReason[] = [];

    const overflowRisks = isExpandedCanvas
      ? getLikelyCanvasOverflowRisks(html, canvasHeight)
      : getLikelyViewportOverflowRisks(html);
    if (overflowRisks.length > 0) {
      retryReasons.push({
        code: isExpandedCanvas ? 'canvas-overflow-risk' : 'viewport-overflow-risk',
        title: isExpandedCanvas ? 'CSS 存在明显增高画布越界风险' : 'CSS 存在明显 16:9 越界风险',
        details: overflowRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        isExpandedCanvas
          ? '- 初稿 CSS 存在明显增高画布越界风险，不能返回。'
          : '- 初稿 CSS 存在明显 viewport 越界风险，不能返回。',
        ...overflowRisks.map((risk) => `- ${risk}`),
        isExpandedCanvas
          ? `- 重写布局：所有 DOM 元素 getBoundingClientRect() 必须位于 x=0..1600，y=0..${canvasHeight + 80} 内。`
          : '- 重写布局：所有 DOM 元素 getBoundingClientRect() 必须完全位于 0..1600 x 0..900 内。',
        '- 重写布局时，所有正文卡片、例子卡、图片 figure、结论条和底部 strip 必须使用正常 grid/flex 文档流，禁止 absolute/fixed/sticky/z-index 叠放。',
        '- 装饰效果改用 .slide 的 background/radial-gradient，或使用完全在画布内部的小元素。',
        isExpandedCanvas
          ? '- 主内容必须纵向自然流动；减少横向列数，缩短文字，避免超宽代码/表格，而不是裁切。'
          : '- 主内容区底部必须小于等于 884px；减少卡片高度、缩短文案或减少行数，而不是裁切。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const mathRouteRisks =
      courseRoute === 'math' ? getMathRouteStructureRisks(html, mathRoute) : [];
    if (mathRouteRisks.length > 0) {
      retryReasons.push({
        code: 'math-route-contract',
        title: '数学专属版式结构不足',
        details: mathRouteRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '数学结构强制修正：',
        `- 本页 courseRoute=math，mathRoute=${mathRoute}，初稿没有通过数学结构 QA，不能返回。`,
        ...mathRouteRisks.map((risk) => `- ${risk}`),
        '- 必须按当前数学版式重写页面，而不是通用卡片页加少量公式。',
        '- 必须保留 prompt/source anchors 中的数学对象、符号、条件、步骤和结论；不要发明随意图标或抽象插图。',
        mathRouteContract(mathRoute, canvasMode),
        isLongCanvas
          ? '- 长页已经允许纵向展开，请用 section 自然排列完整数学结构，禁止覆盖和裁切。'
          : '- 如果 16:9 放不下，删掉可删内容，保留数学结构；禁止覆盖和裁切。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const imageTagCount = (html.match(/<img\b/gi) || []).length;
    const aiImageTokenCount = imageAsset ? html.split(imageAsset.src).length - 1 : 0;
    if (
      imageAsset &&
      (aiImageTokenCount !== 1 ||
        !html.includes(imageAsset.src) ||
        (sourceImages.length === 0 && imageTagCount !== 1))
    ) {
      const details = [
        `检测到 <img> 数量：${imageTagCount}，目标是 exactly one。`,
        html.includes(imageAsset.src)
          ? '图片 token 已出现，但图片数量不符合要求。'
          : '没有逐字使用提供的图片 token，插图无法被后续占位图/真实图片替换。',
      ];
      retryReasons.push({
        code: 'image-asset-contract',
        title: '没有正确使用提供的 AI 插图素材',
        details,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 前一次生成没有正确使用提供的 AI 插图素材。',
        `- 最终 HTML 必须包含 exactly one <img>，并且 src 必须逐字等于：${imageAsset.src}`,
        '- 这张图是页面内插图，不是整页背景；不要再用 CSS 手绘复杂主图替代它。',
        '- 除了这张提供的插图，不要添加任何其他图片、外链素材、SVG 或 canvas。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    let sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    if (
      sourceImages.length > 0 &&
      (sourceImageUsage.missingIds.length > 0 || sourceImageUsage.inventedIds.length > 0)
    ) {
      const details = [
        sourceImageUsage.missingIds.length
          ? `缺少原文图片 ID：${sourceImageUsage.missingIds.join(', ')}`
          : '',
        sourceImageUsage.inventedIds.length
          ? `引用了未分配图片 ID：${sourceImageUsage.inventedIds.join(', ')}`
          : '',
      ].filter(Boolean);
      retryReasons.push({
        code: 'source-image-contract',
        title: '没有正确使用分配的原文图片',
        details,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 前一次生成没有正确使用原文图片素材，不能返回。',
        ...details.map((detail) => `- ${detail}`),
        `- 最终 HTML 必须使用这些原文图片 ID：${sourceImages.map((image) => image.id).join(', ')}`,
        '- 图片 src 必须逐字等于这些 ID，例如 <img src="img_1" alt="原文图片：第 2 页图表" />。',
        '- 不要发明其他 img_N，不要把图片 ID 改写为外链、base64、SVG、canvas 或 CSS 背景。',
        '- 图片必须作为源材料证据/图表使用，并配一个可编辑 DOM 短说明。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
      sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    }

    if (requiresMath && countMathBlocks(html) === 0) {
      retryReasons.push({
        code: 'missing-mathml',
        title: '数学页缺少真实 MathML',
        details: ['检测到 <math> 数量为 0，但本页需要用真实 MathML 承载核心公式。'],
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 这是数学页，前一次生成失败是因为没有包含真实 MathML。',
        '- 最终 HTML 必须为核心公式包含至少 3 个真实 <math> 块。',
        '- 不要只用纯文本、Unicode 符号、<span>、<sup> 或 <sub> 表示主要公式。',
        isExpandedCanvas
          ? `- 页面必须足够清晰，所有公式块都要在 1600px 宽、约 ${canvasHeight}px 高的增高画布中自然可见。`
          : '- 页面必须足够紧凑，所有公式块都要在 1600x900 内可见。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    html = resolveSourceImagePlaceholders(html, sourceImages);

    if (!/<html\b/i.test(html) || !/<\/html>$/i.test(html)) {
      return apiError('GENERATION_FAILED', 500, 'Model did not return a valid HTML document');
    }

    const usage = combineTokenUsage(usages);
    return apiSuccess({
      html,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(modelString, usage),
      generationAttempts: usages.length,
      retryReasons,
      sourceImageUsage,
      skippedCreditCharge: skipCreditCharge,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to generate HTML PPT slide',
    );
  }
}
