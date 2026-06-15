import { replaceCommonRawLatexText, wrapBareLatexEnvironments } from '@/lib/latex-utils';
import { containsMathSyntax, renderInlineMathAwareHtml } from '@/lib/math-engine';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeDelimiterEscapes(text: string): string {
  return text.replace(/\\\\(?=[()[\]])/g, '\\');
}

function repairSplitMathAcrossParagraphs(html: string): string {
  const normalized = normalizeDelimiterEscapes(html);
  let output = '';
  let i = 0;
  let inlineDepth = 0;
  let displayDepth = 0;

  while (i < normalized.length) {
    if (normalized.startsWith('\\[', i)) {
      displayDepth += 1;
      output += '\\[';
      i += 2;
      continue;
    }
    if (normalized.startsWith('\\]', i)) {
      displayDepth = Math.max(0, displayDepth - 1);
      output += '\\]';
      i += 2;
      continue;
    }
    if (normalized.startsWith('\\(', i)) {
      inlineDepth += 1;
      output += '\\(';
      i += 2;
      continue;
    }
    if (normalized.startsWith('\\)', i)) {
      inlineDepth = Math.max(0, inlineDepth - 1);
      output += '\\)';
      i += 2;
      continue;
    }

    if ((inlineDepth > 0 || displayDepth > 0) && normalized.startsWith('</p>', i)) {
      let j = i + 4;
      while (j < normalized.length && /\s/.test(normalized[j])) j += 1;
      if (normalized.startsWith('<p', j)) {
        const openEnd = normalized.indexOf('>', j);
        if (openEnd !== -1) {
          output += ' ';
          i = openEnd + 1;
          continue;
        }
      }
    }

    output += normalized[i];
    i += 1;
  }

  return output;
}

function isInsideLatexIgnoredElement(node: Text): boolean {
  let element = node.parentElement;
  while (element) {
    if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(element.tagName)) return true;
    element = element.parentElement;
  }
  return false;
}

/**
 * 顶栏/标题等纯文本中若含 \(...\)、\[...\]、$...$，渲染为 KaTeX HTML；否则整段转义为安全纯文本 HTML。
 */
export function renderPlainTitleWithOptionalLatex(title: string): string {
  if (!title) return '';
  const normalized = normalizePlainTitleMath(title);
  const cached = titleHtmlCache.get(normalized);
  if (cached !== undefined) return cached;

  const html = renderInlineMathAwareHtml(normalized);
  titleHtmlCache.set(normalized, html);
  if (titleHtmlCache.size > TITLE_HTML_CACHE_LIMIT) {
    const oldestKey = titleHtmlCache.keys().next().value;
    if (oldestKey !== undefined) titleHtmlCache.delete(oldestKey);
  }
  return html;
}

const TITLE_HTML_CACHE_LIMIT = 500;
const titleHtmlCache = new Map<string, string>();
const EXPLICIT_TITLE_MATH_PATTERN =
  /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[|\\begin\{[a-zA-Z*]+\}/;
const TITLE_MATH_TRIGGER_PATTERN =
  /\\[a-zA-Z]+|\^|\/|sqrt\s*\(|\b(?:sin|cos|tan|sec|ln|log|pi|prime)\b|double\s+prime|\[[^\]]*,[^\]]*\]/i;
const TITLE_MATH_WORD_PATTERN = /(^|[^\\])\b(sin|cos|tan|sec|ln|log)\b/gi;
const TITLE_PI_PATTERN = /(^|[^\\])\bpi\b/gi;

function normalizePlainTitleMath(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || EXPLICIT_TITLE_MATH_PATTERN.test(trimmed)) return title;
  if (!TITLE_MATH_TRIGGER_PATTERN.test(trimmed)) return title;

  const colonMatch = trimmed.match(/^(.{1,90}?[：:])\s*(.+)$/u);
  if (!colonMatch) return title;

  const prefix = colonMatch[1];
  const rest = colonMatch[2].trim();
  if (!TITLE_MATH_TRIGGER_PATTERN.test(rest)) return title;

  const normalizedRest = normalizeTitleMathRest(rest);
  return normalizedRest === rest ? title : `${prefix} ${normalizedRest}`;
}

function normalizeTitleMathRest(rest: string): string {
  const chineseSuffixMatch = rest.match(/^(.+?)(（[^）]*）)$/u);
  if (chineseSuffixMatch) {
    const expression = wrapTitleMathSegment(chineseSuffixMatch[1]);
    return expression === chineseSuffixMatch[1] ? rest : `${expression}${chineseSuffixMatch[2]}`;
  }

  const onIntervalMatch = rest.match(/^(.+?)\s+(on)\s+(\[[^\]]+\])$/i);
  if (onIntervalMatch) {
    const expression = wrapTitleMathSegment(onIntervalMatch[1]);
    const interval = wrapTitleMathSegment(onIntervalMatch[3]);
    return `${expression} ${onIntervalMatch[2]} ${interval}`;
  }

  const fromToMatch = rest.match(/^(.+?)\s+(from)\s+(.+?)\s+(to)\s+(.+)$/i);
  if (fromToMatch) {
    return [
      wrapTitleMathSegment(fromToMatch[1]),
      fromToMatch[2],
      wrapTitleMathSegment(fromToMatch[3]),
      fromToMatch[4],
      wrapTitleMathSegment(fromToMatch[5]),
    ].join(' ');
  }

  const chineseLimitMatch = rest.match(/^(.+?)\s+到\s+(.+)$/u);
  if (chineseLimitMatch) {
    return `${wrapTitleMathSegment(chineseLimitMatch[1])} 到 ${wrapTitleMathSegment(
      chineseLimitMatch[2],
    )}`;
  }

  return wrapTitleMathSegment(rest);
}

function wrapTitleMathSegment(segment: string): string {
  const value = segment.trim();
  if (!value || !TITLE_MATH_TRIGGER_PATTERN.test(value)) return segment;
  return `$${normalizeTitleLatexShorthand(value)}$`;
}

function normalizeTitleLatexShorthand(value: string): string {
  return value
    .replace(/\b([A-Za-z])\s+double\s+prime\s+at\s+(.+)$/i, (_match, name, input: string) => {
      return `${name}''(${normalizeTitleLatexShorthand(input)})`;
    })
    .replace(/\b([A-Za-z])\s+prime$/i, (_match, name) => `${name}'`)
    .replace(/(^|[^\\])\bsqrt\s*\(([^()]+)\)/gi, (_match, prefix: string, input: string) => {
      return `${prefix}\\sqrt{${normalizeTitleLatexShorthand(input)}}`;
    })
    .replace(TITLE_MATH_WORD_PATTERN, (_match, prefix: string, command: string) => {
      return `${prefix}\\${command.toLowerCase()}`;
    })
    .replace(TITLE_PI_PATTERN, (_match, prefix: string) => `${prefix}\\pi`)
    .replace(/\s+/g, ' ')
    .trim();
}

export function renderHtmlWithLatex(html: string): string {
  if (!html) return html;
  const wrappedHtml = wrapBareLatexEnvironments(html);
  const hasBareLatexCommand = /\\(?!text\b)[a-zA-Z]+/.test(wrappedHtml);
  if (
    (!containsMathSyntax(wrappedHtml) && !hasBareLatexCommand) ||
    typeof document === 'undefined'
  ) {
    return replaceCommonRawLatexText(wrappedHtml);
  }

  const repairedHtml = repairSplitMathAcrossParagraphs(wrappedHtml);
  const root = document.createElement('div');
  root.innerHTML = repairedHtml;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (
      node.nodeValue &&
      !isInsideLatexIgnoredElement(node) &&
      (containsMathSyntax(node.nodeValue) || /\\(?!text\b)[a-zA-Z]+/.test(node.nodeValue))
    ) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const nodeText = node.nodeValue || '';
    const rendered = renderInlineMathAwareHtml(nodeText);
    if (!rendered) continue;

    const temp = document.createElement('span');
    temp.innerHTML = rendered;

    const fragment = document.createDocumentFragment();
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
    node.replaceWith(fragment);
  }

  return root.innerHTML;
}
