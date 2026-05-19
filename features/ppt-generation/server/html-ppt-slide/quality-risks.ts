import type { HtmlMathRoute } from './types';
import { countMathBlocks, getStyleText, getVisibleText } from './html-document';

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

export function getLikelyViewportOverflowRisks(html: string): string[] {
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

export function getLikelyCanvasOverflowRisks(html: string, canvasHeight: number): string[] {
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

export function getMathRouteStructureRisks(html: string, mathRoute: HtmlMathRoute): string[] {
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
