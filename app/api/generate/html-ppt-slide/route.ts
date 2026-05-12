import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
} from '@/lib/utils/openai-pricing';
import { creditsFromTokenUsage, usdFromCredits } from '@/lib/utils/credits';

export const runtime = 'nodejs';
export const maxDuration = 180;

type RequestBody = {
  prompt?: string;
  pageKind?: string;
  densityContract?: string;
  qualityFeedback?: string;
  imageAsset?: {
    src?: string;
    alt?: string;
    description?: string;
    aspectRatio?: string;
  };
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

function getStyleText(html: string): string {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join('\n');
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

  return Array.from(new Set(risks)).slice(0, 5);
}

function promptNeedsMath(prompt: string): boolean {
  return /mathml|math notation|equation|formula|derivation|calculus|matrix|probability|bayes|latex|公式|数学|方程|推导|矩阵|概率|微积分|线性代数/i.test(
    prompt,
  );
}

function pageKindContract(pageKind: string | undefined): string {
  switch (pageKind) {
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
        '- 生成克制的总结板，只允许这些区域：标题区、一个紧凑核心指标、3 条 takeaway、一个收束判断条。',
        '- takeaway 必须是 3 条，除非用户明确要求更多；每条只能包含短标题和一句短解释。',
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
      return [
        '- 页面类型：数学页。',
        '- 页面只能包含：标题区、核心公式区、紧凑推导区、一个例题/提醒区。',
        '- 核心公式必须使用真实原生 MathML，总共 3-7 个 <math> 块。',
        '- 主要公式不能用纯文本、TeX 字符串、图片、SVG 或 canvas 代替。',
        '- 文字说明放在公式块外；可以用公式卡、紧凑推导或紧凑表格，但不能溢出。',
        '- 公式卡片最多 3 个；推导行最多 4 行；长公式必须拆成短行，不能横向撑破。',
        '- 不要使用 <mspace>，不要用大空白撑版。',
      ].join('\n');
    case 'code':
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
        '- 不要额外添加第二道题、背景故事、营销说明、多个公式区、长步骤表或无关图表。',
        '- 只生成 prompt 指定的例子/题目，不要额外添加无关公式、证明或第二个教学主题。',
      ].join('\n');
    default:
      return '';
  }
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
    const densityContract = body.densityContract?.trim().slice(0, 2000);
    const imageAsset = normalizeImageAsset(body.imageAsset);
    const requiresMath = pageKind === 'math' || (!pageKind && promptNeedsMath(prompt));

    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    const system = [
      'You are an expert presentation designer and front-end engineer.',
      'Generate one self-contained HTML document that renders exactly one 16:9 presentation slide.',
      'Unless the user explicitly asks for another language, all visible slide content must be written in Simplified Chinese.',
      'If source labels or code keywords are in English, keep only those necessary terms; surrounding explanation, headings, table headers, and callouts should be Simplified Chinese.',
      'The slide must feel like an editable PowerPoint page built from semantic HTML/CSS, not a poster image.',
      'Use plain HTML and CSS only. Do not use JavaScript, external fonts, canvas, or SVG screenshots. Do not use external assets except the single provided image asset when one is supplied.',
      'Use real DOM text for all labels. Use div/section/table/list elements and CSS shapes for cards, charts, icons, diagrams, and callouts. If an image asset is supplied, use it as a content illustration instead of drawing a complex CSS illustration.',
      'When an image asset is supplied, use exactly one <img> element with src set exactly to the provided src value. Do not invent, rewrite, fetch, or add any other image URL.',
      'A supplied image asset is an illustration inside the slide, not a full-slide 16:9 background and not a screenshot of the finished slide.',
      'Use only the user-provided topic and content. Do not invent unrelated equations, formulas, example problems, proof snippets, source notation, QA panels, or "impossible question" text.',
      'Before designing, choose exactly one primary teaching action for the slide: concept explanation, comparison, code observation, counterexample, process, formula derivation, or worked problem. Do not combine multiple slide genres.',
      'Use at most three main content regions per slide, not counting the title area. A bottom conclusion/check strip counts as one region.',
      'If content feels too dense, delete lower-priority material instead of shrinking, clipping, scrolling, or adding another panel. Deletion priority: neighbor context, decorative labels, secondary explanation, extra trace steps, extra conclusion/callout.',
      'Do not transform ordinary examples into full exercise pages unless the user/source explicitly asks a question to solve. Do not add "known conditions", "solution steps", or "final answer" just to fill space.',
      'Only use MathML on math-heavy slides or when the user explicitly requests formulas/equations. For intro, summary, process, table, code, and ordinary worked-example pages, avoid <math> unless the prompt specifically asks for mathematical notation.',
      'For math-heavy slides, use native MathML elements such as <math>, <mfrac>, <msup>, <msub>, <msqrt>, <mo>, <mi>, <mn>, and <mtable> for important equations when possible. Use simple HTML <sup>/<sub> only for lightweight inline notation.',
      'If the user asks for equations, derivations, matrices, probability formulas, or math notation, the slide must contain real <math> blocks for the main formulas rather than plain text approximations.',
      'Do not use TeX delimiters as the visible formula renderer unless explicitly showing source notation. Do not use MathJax, KaTeX, scripts, external CSS, images, SVG, or canvas for formulas.',
      'Place equations inside bounded .formula, .math-card, or .equation-row containers with max-width, overflow:hidden, readable font sizes, and enough line height. If the math is dense, summarize steps instead of overflowing.',
      'For math-heavy slides, use max 7 <math> blocks, max 3 formula cards, max 4 derivation/table rows, and MathML font sizes between 20px and 26px. Prefer one-line equations. Never hide extra equations by clipping them.',
      'Do not use <mspace> to force large formula gaps. Break long formulas into two short stacked rows instead of one wide equation. Each <math> block must fit its card without horizontal clipping.',
      'The renderer iframe viewport is exactly 1600px by 900px. Create one fixed 1600px by 900px slide stage that fills that viewport.',
      'Set html and body to width: 1600px, height: 900px, margin: 0, overflow: hidden. The visible slide must not be taller, wider, scrollable, or portrait.',
      'Follow the frontend-slides viewport contract: exactly one <section class="slide"> containing one <div class="slide-content">. The .slide must be width:1600px; height:900px; overflow:hidden; position:relative; box-sizing:border-box.',
      'The .slide-content must live fully inside the slide, use a safe margin/padding of 56-72px, and must also use overflow:hidden; box-sizing:border-box.',
      'Use presentation-scale typography and spacing, not oversized web-app component sizing. As a default, h1 should be about 52-72px, section/card titles 26-36px, body text 22-30px, and card padding 22-36px.',
      'If the composition feels visually too large or crowded, add an inner .fit-layer inside .slide-content with width/height set to calc(100% / scale), e.g. width:calc(100% / .92); height:calc(100% / .92); transform:scale(.92); transform-origin:top left. This gives the layout more internal space before scaling it back into the viewport. Do not transform .slide or rely on clipping.',
      'Hard viewport rule: every visible DOM element will be checked with getBoundingClientRect(). Every rect must satisfy left>=0, top>=0, right<=1600, and bottom<=900. This includes decorative accents, backgrounds, cards, grids, tables, and all child elements.',
      'Do not create off-canvas decorative blobs/circles, negative-position accents, oversized background divs, or elements that are clipped by overflow:hidden. These still fail because their DOM bounding boxes are outside the viewport.',
      'Do not use negative top/left/right/bottom/inset, negative margin, or negative translate values for alignment. Center arrows, labels, and decoration with flex/grid/absolute bounds that stay fully inside the slide.',
      'For decorative color, prefer CSS background gradients on .slide/.slide-content. If you create decorative DOM elements, keep them fully inside 0..1600 x 0..900 with non-negative top/left and bounded width/height.',
      'No content may extend beyond x=0..1600 or y=0..900. Do not rely on scroll or clipping. If content is dense, reduce density, simplify copy, tighten the table, or split into fewer regions within this single slide.',
      'Do not set large min-height values on the main content area. Avoid height:100vh and min-height:100vh. With 56-72px slide padding and a header, the body grid/content area should be at most 640px tall, and its bottom edge must stay at y<=884.',
      'Recommended layout: .slide-content { position:absolute; inset:64px; display:grid; grid-template-rows:auto minmax(0,1fr); gap:24px; } and the main content region must use min-height:0; overflow:hidden.',
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
      pageKindContract(pageKind),
      '',
      '质量要求：',
      '- 输出必须是一张精致的商务/教育 PPT 页面。',
      '- 可见文字默认使用简体中文。',
      '- 包含清晰标题、结构化内容区域、视觉层级；如果适合题材，可以包含图表、表格或流程图。',
      '- 只使用 prompt 给出的主题和内容，不要自行加入无关公式、题目、证明、代码、QA 面板或第二个主题区。',
      '- 先选一个主结构，再删减内容；一页最多 3 个主要内容区。',
      '- 如果放不下，删掉次要区块，不要裁切、滚动、压缩成长讲义。',
      '- 没有明确题目的源页，不要改写成“题目/已知/求解步骤/最终答案”。',
      '- 保持投影片尺度下可读。',
      '- 避免泛化营销 hero 布局；这是一张课件/汇报 slide，不是 landing page。',
      '- HTML 应该容易通过修改文字和 CSS 数值继续编辑。',
      densityContract
        ? ['', '页面密度契约：', densityContract, '- 必须同时避免太空和太挤。'].join('\n')
        : '',
      qualityFeedback
        ? [
            '',
            '上一次本地质检失败，必须针对以下问题修复：',
            qualityFeedback,
            '- 尤其注意：不要使用负坐标、负 margin、超大装饰 div、出界背景块，所有 DOM 元素边界都必须完全在 1600×900 内。',
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
            '- 插图区应该是页面的一部分，宽高稳定，建议占画布 20%-34% 面积；图片用 object-fit: cover 或 contain，不能溢出容器。',
            '- 插图区不能铺满整个 1600×900 画布，也不能让文字浮在图片上导致不可编辑或不可读。',
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
            {
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

    const overflowRisks = getLikelyViewportOverflowRisks(html);
    if (overflowRisks.length > 0) {
      retryReasons.push({
        code: 'viewport-overflow-risk',
        title: 'CSS 存在明显 16:9 越界风险',
        details: overflowRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 初稿 CSS 存在明显 viewport 越界风险，不能返回。',
        ...overflowRisks.map((risk) => `- ${risk}`),
        '- 重写布局：所有 DOM 元素 getBoundingClientRect() 必须完全位于 0..1600 x 0..900 内。',
        '- 装饰效果改用 .slide 的 background/radial-gradient，或使用完全在画布内部的小元素。',
        '- 主内容区底部必须小于等于 884px；减少卡片高度、缩短文案或减少行数，而不是裁切。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const imageTagCount = (html.match(/<img\b/gi) || []).length;
    if (imageAsset && (imageTagCount !== 1 || !html.includes(imageAsset.src))) {
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
        '- 页面必须足够紧凑，所有公式块都要在 1600x900 内可见。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

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
