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
  const rawLatexFragmentPattern =
    /([A-Za-z0-9()[\]{}.+\-*/=,:]*\\[a-zA-Z]+[A-Za-z0-9()[\]{}.+\-*/=,:]*)/g;
  let result = '';
  let lastIndex = 0;
  let renderedAny = false;

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
    renderedAny = true;
  }

  if (renderedAny) {
    result += escapeHtml(text.slice(lastIndex));
    return result;
  }

  // Fallback: handle obvious raw latex fragments that missed delimiters,
  // e.g. "FV=100(1.01)^{12}=112.68\\approx113".
  lastIndex = 0;
  result = '';
  for (const match of text.matchAll(rawLatexFragmentPattern)) {
    const fragment = match[0];
    const start = match.index ?? 0;
    const end = start + fragment.length;
    const expression = normalizeLatexSource(fragment);

    result += escapeHtml(text.slice(lastIndex, start));
    try {
      const directSymbol = getDirectUnicodeMathSymbol(expression);
      result +=
        directSymbol ??
        katex.renderToString(expression, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
          strict: 'ignore',
        });
    } catch {
      result += escapeHtml(fragment);
    }
    lastIndex = end;
    renderedAny = true;
  }

  if (renderedAny) {
    result += escapeHtml(text.slice(lastIndex));
    return result;
  }

  return escapeHtml(text);
}
