import type { HtmlCanvasMode, HtmlMathRoute, HtmlSlideResult, PreviewStats } from './types';

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
    overlapCount: 0,
    overlapSamples: [],
    mathRouteIssueCount: 0,
    mathRouteIssueSamples: [],
    textNodeCount: 0,
    visibleCharCount: 0,
    mathCount: 0,
    tableCount: 0,
    preCount: 0,
  };
}

export function normalizePreviewStats(
  stats: Partial<PreviewStats> | null | undefined,
): PreviewStats {
  const base = emptyPreviewStats();
  return {
    ...base,
    ...(stats || {}),
    outOfBoundsSamples: stats?.outOfBoundsSamples || [],
    clippedSamples: stats?.clippedSamples || [],
    overlapSamples: stats?.overlapSamples || [],
    mathRouteIssueSamples: stats?.mathRouteIssueSamples || [],
    mathRouteIssueCount: stats?.mathRouteIssueCount || 0,
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

export function isTransparentColor(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
}

export function hasPaintedBox(style: CSSStyleDeclaration, element: HTMLElement): boolean {
  const borderWidth =
    Number.parseFloat(style.borderTopWidth || '0') +
    Number.parseFloat(style.borderRightWidth || '0') +
    Number.parseFloat(style.borderBottomWidth || '0') +
    Number.parseFloat(style.borderLeftWidth || '0');
  return (
    !isTransparentColor(style.backgroundColor) ||
    style.backgroundImage !== 'none' ||
    style.boxShadow !== 'none' ||
    borderWidth > 0 ||
    ['ARTICLE', 'SECTION', 'FIGURE', 'TABLE', 'PRE', 'FOOTER', 'HEADER', 'MAIN'].includes(
      element.tagName,
    )
  );
}

export function evaluateMathRouteStructure(doc: Document, mathRoute?: HtmlMathRoute): string[] {
  if (!mathRoute || mathRoute === 'standard') return [];
  const text = doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  const mathCount = doc.querySelectorAll('math').length;
  const tableCount = doc.querySelectorAll('table').length;
  const stepSignals = (text.match(/(?:步骤|第\s*\d+\s*步|\b[1-5][.、]|①|②|③|④|⑤)/g) || []).length;
  const issues: string[] = [];
  const requireText = (pattern: RegExp, message: string) => {
    if (!pattern.test(text)) issues.push(message);
  };
  const requireMath = (min: number, message: string) => {
    if (mathCount < min) issues.push(message);
  };

  switch (mathRoute) {
    case 'definition-theorem':
      requireText(/定义|定理|命题|判定|对象|符号/, '定义/定理页缺少数学入口。');
      requireText(/条件|假设|当且仅当|满足/, '定义/定理页缺少条件或假设。');
      requireText(/结论|读法|因此|所以|例|检查/, '定义/定理页缺少结论、例子或检查点。');
      requireMath(1, '定义/定理页缺少 MathML 公式/符号块。');
      break;
    case 'formula-focus':
      requireMath(1, '公式页缺少主 MathML 公式。');
      requireText(/符号|含义|条件|使用|代入|解释/, '公式页缺少符号解释或使用条件。');
      break;
    case 'derivation':
      requireMath(3, '推导页 MathML 推导行不足 3 个。');
      if (stepSignals < 2) issues.push('推导页缺少分步结构。');
      requireText(/因为|由|代入|得到|所以|化简|归一化|两边/, '推导页缺少每步理由。');
      break;
    case 'proof':
      requireMath(2, '证明页 MathML 公式/符号判断不足。');
      requireText(/证明目标|要证|假设|条件|构造|结论|证毕/, '证明页缺少目标、假设、构造或结论。');
      break;
    case 'worked-example':
      requireMath(2, '例题页 MathML 公式/符号块不足。');
      requireText(/题干|问题|求|已知|给定|输入/, '例题页缺少题干或已知条件。');
      if (stepSignals < 2) issues.push('例题页缺少 2 个以上求解步骤。');
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
      if (tableCount < 1) issues.push('对比页没有使用真实 HTML table。');
      requireText(
        /条件|适用|场景|结论|反例|比较|对比|情况/,
        '对比表缺少条件、适用场景或结论维度。',
      );
      break;
    default:
      break;
  }

  return Array.from(new Set(issues)).slice(0, 5);
}

export function evaluatePreview(
  iframe: HTMLIFrameElement | null,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
  mathRoute?: HtmlMathRoute,
): PreviewStats {
  const doc = iframe?.contentDocument;
  if (!doc) return emptyPreviewStats();
  const body = doc.body;
  const slide = doc.querySelector('.slide');
  const slideContent = doc.querySelector('.slide-content');
  const outOfBoundsSamples: string[] = [];
  const clippedSamples: string[] = [];
  const overlapSamples: string[] = [];
  let outOfBoundsCount = 0;
  let clippedCount = 0;
  let overlapCount = 0;

  const elementLabel = (element: HTMLElement) => {
    const className = typeof element.className === 'string' ? `.${element.className}` : '';
    return `${element.tagName.toLowerCase()}${className.split(/\s+/).slice(0, 2).join('.')}`;
  };

  Array.from(doc.body.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const maxBottom = canvasMode === 'slide' ? 900.5 : canvasHeight + 80;
    const overflow =
      rect.left < -0.5 || rect.top < -0.5 || rect.right > 1600.5 || rect.bottom > maxBottom;
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
    const hasText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
    const hasVisualChild = Boolean(element.querySelector('img,svg,math,table,pre,code'));
    if (!hasText && !hasVisualChild) return;
    const clipped =
      element.scrollWidth > element.clientWidth + 2 ||
      element.scrollHeight > element.clientHeight + 2;
    if (!clipped) return;
    clippedCount += 1;
    if (clippedSamples.length < 5) {
      clippedSamples.push(
        `${elementLabel(element)} ${element.scrollWidth}×${element.scrollHeight} > ${element.clientWidth}×${element.clientHeight}`,
      );
    }
  });

  const layoutRoot = (slideContent as HTMLElement | null) || body;
  const candidates = Array.from(
    layoutRoot.querySelectorAll<HTMLElement>(
      'section, article, div, figure, table, pre, header, main, footer, aside',
    ),
  )
    .filter((element) => {
      if (element === slide || element === slideContent) return false;
      const style = doc.defaultView?.getComputedStyle(element);
      if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
      if (!hasPaintedBox(style, element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 60 || rect.height < 36 || rect.width * rect.height < 8000) return false;
      const hasText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
      const hasVisualChild = Boolean(element.querySelector('img,math,table,pre,code'));
      return hasText || hasVisualChild;
    })
    .map((element) => ({
      element,
      label: elementLabel(element),
      rect: element.getBoundingClientRect(),
    }));

  for (let index = 0; index < candidates.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex += 1) {
      const first = candidates[index];
      const second = candidates[otherIndex];
      if (!first || !second) continue;
      if (first.element.contains(second.element) || second.element.contains(first.element)) {
        continue;
      }
      const left = Math.max(first.rect.left, second.rect.left);
      const top = Math.max(first.rect.top, second.rect.top);
      const right = Math.min(first.rect.right, second.rect.right);
      const bottom = Math.min(first.rect.bottom, second.rect.bottom);
      const width = right - left;
      const height = bottom - top;
      if (width <= 12 || height <= 12) continue;
      const overlapArea = width * height;
      const firstArea = first.rect.width * first.rect.height;
      const secondArea = second.rect.width * second.rect.height;
      if (overlapArea < 1200 || overlapArea < Math.min(firstArea, secondArea) * 0.04) continue;
      overlapCount += 1;
      if (overlapSamples.length < 5) {
        overlapSamples.push(
          `${first.label} ↔ ${second.label} overlap ${Math.round(left)},${Math.round(top)}-${Math.round(right)},${Math.round(bottom)}`,
        );
      }
    }
  }

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let textNodeCount = 0;
  let visibleCharCount = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!text) continue;
    textNodeCount += 1;
    visibleCharCount += text.length;
  }
  const mathRouteIssueSamples = evaluateMathRouteStructure(doc, mathRoute);

  return {
    scrollWidth: Math.max(body.scrollWidth, doc.documentElement.scrollWidth),
    scrollHeight: Math.max(body.scrollHeight, doc.documentElement.scrollHeight),
    slideCount: doc.querySelectorAll('.slide').length,
    hasSlideContent: Boolean(slide && slideContent),
    outOfBoundsCount,
    outOfBoundsSamples,
    clippedCount,
    clippedSamples,
    overlapCount,
    overlapSamples,
    mathRouteIssueCount: mathRouteIssueSamples.length,
    mathRouteIssueSamples,
    textNodeCount,
    visibleCharCount,
    mathCount: doc.querySelectorAll('math').length,
    tableCount: doc.querySelectorAll('table').length,
    preCount: doc.querySelectorAll('pre').length,
  };
}

export function getPreviewStatus(
  stats: PreviewStats,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
): 'pass' | 'fail' | 'empty' {
  if (stats.scrollWidth <= 0 || stats.scrollHeight <= 0) return 'empty';
  const scrollHeightOk =
    canvasMode === 'slide' ? stats.scrollHeight <= 901 : stats.scrollHeight <= canvasHeight + 120;
  if (
    stats.slideCount === 1 &&
    stats.hasSlideContent &&
    stats.scrollWidth <= 1601 &&
    scrollHeightOk &&
    stats.outOfBoundsCount === 0 &&
    stats.clippedCount === 0 &&
    stats.overlapCount === 0 &&
    stats.mathRouteIssueCount === 0
  ) {
    return 'pass';
  }
  return 'fail';
}

export function buildPreviewQualityFeedback(
  stats: PreviewStats,
  htmlResult?: HtmlSlideResult | null,
  canvasMode: HtmlCanvasMode = 'slide',
  canvasHeight = 900,
): string {
  const lines: string[] = [];
  if (
    stats.scrollWidth > 1601 ||
    (canvasMode === 'slide' ? stats.scrollHeight > 901 : stats.scrollHeight > canvasHeight + 120)
  ) {
    lines.push(
      canvasMode === 'slide'
        ? `滚动尺寸异常：${stats.scrollWidth}×${stats.scrollHeight}，目标是 1600×900。`
        : `滚动尺寸异常：${stats.scrollWidth}×${stats.scrollHeight}，目标是宽 1600、高约 ${canvasHeight} 的${canvasMode === 'tall' ? '中高课件页' : '长页面'}。`,
    );
  }
  if (stats.outOfBoundsCount > 0) {
    lines.push(`越界元素 ${stats.outOfBoundsCount} 个：${stats.outOfBoundsSamples.join(' / ')}`);
  }
  if (stats.clippedCount > 0) {
    lines.push(`裁切风险 ${stats.clippedCount} 个：${stats.clippedSamples.join(' / ')}`);
  }
  if (stats.overlapCount > 0) {
    lines.push(`内容块重叠 ${stats.overlapCount} 组：${stats.overlapSamples.join(' / ')}`);
  }
  if (stats.mathRouteIssueCount > 0) {
    lines.push(`数学版式结构不足：${stats.mathRouteIssueSamples.join(' / ')}`);
  }
  const sourceUsage = htmlResult?.sourceImageUsage;
  if (sourceUsage?.missingIds.length) {
    lines.push(`缺少分配的原文图片：${sourceUsage.missingIds.join(', ')}`);
  }
  if (sourceUsage?.inventedIds.length) {
    lines.push(`引用了未分配图片 ID：${sourceUsage.inventedIds.join(', ')}`);
  }
  if (!lines.length) return '';
  return [
    '本地 iframe QA 失败，必须重写布局：',
    ...lines.map((line) => `- ${line}`),
    '- 禁止用 absolute/fixed/sticky/z-index 把底部卡片、例子卡、插图卡或结论条叠到主内容上。',
    canvasMode === 'slide'
      ? '- 必须改成正常 flex/grid flow：header / main / footer 三段或两行 grid；每个内容区都占用自己的行列。'
      : '- 本页已经允许更高画布，必须改成纵向 section 正常文档流；不要再把结果、检查点或底部条覆盖到中间内容上。',
    stats.mathRouteIssueCount > 0
      ? '- 如果本页是数学专属版式，必须补齐该版式可验出的数学结构：定义/条件/结论、推导阶梯、例题步骤、证明目标或对比表。'
      : '',
  ].join('\n');
}
