import katex from 'katex';
import { getDirectUnicodeMathSymbol, normalizeLatexSource } from '@/lib/latex-utils';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderInlineLatexToHtml(text: string): string {
  const pattern = /(\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$)/g;
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const start = match.index ?? 0;
    const end = start + fullMatch.length;
    const expression = normalizeLatexSource(match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');

    result += escapeHtml(text.slice(lastIndex, start));
    const directSymbol = getDirectUnicodeMathSymbol(expression);
    result +=
      directSymbol ??
      katex.renderToString(expression, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      });
    lastIndex = end;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}
