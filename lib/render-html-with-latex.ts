import { replaceCommonRawLatexText, wrapBareLatexEnvironments } from '@/lib/latex-utils';
import { containsMathSyntax, renderTextWithMathToHtml } from '@/lib/math-engine';

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

/**
 * 顶栏/标题等纯文本中若含 \(...\)、\[...\]、$...$，渲染为 KaTeX HTML；否则整段转义为安全纯文本 HTML。
 */
export function renderPlainTitleWithOptionalLatex(title: string): string {
  if (!title) return '';
  const html = renderTextWithMathToHtml(title);
  if (html !== null) return html;
  return escapeHtml(replaceCommonRawLatexText(title));
}

export function renderHtmlWithLatex(html: string): string {
  if (!html) return html;
  const wrappedHtml = wrapBareLatexEnvironments(html);
  if (!containsMathSyntax(wrappedHtml) || typeof document === 'undefined') {
    return replaceCommonRawLatexText(wrappedHtml);
  }

  const repairedHtml = repairSplitMathAcrossParagraphs(wrappedHtml);
  const root = document.createElement('div');
  root.innerHTML = repairedHtml;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue && containsMathSyntax(node.nodeValue)) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const rendered = renderTextWithMathToHtml(node.nodeValue || '');
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
