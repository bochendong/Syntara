import { normalizeMathSource, renderMathToHtml, renderTextWithMathToHtml } from '@/lib/math-engine';
import { replaceCommonRawLatexText } from '@/lib/latex-utils';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderInlineLatexToHtml(text: string): string {
  const rawLatexFragmentPattern =
    /([A-Za-z0-9()[\]{}.+\-*/=,:]*\\[a-zA-Z]+[A-Za-z0-9()[\]{}.+\-*/=,:]*)/g;

  const rendered = renderTextWithMathToHtml(text, { forceInline: true });
  if (rendered) {
    return rendered;
  }

  // Fallback: handle obvious raw latex fragments that missed delimiters,
  // e.g. "FV=100(1.01)^{12}=112.68\\approx113".
  let lastIndex = 0;
  let result = '';
  let renderedAny = false;
  for (const match of text.matchAll(rawLatexFragmentPattern)) {
    const fragment = match[0];
    const start = match.index ?? 0;
    const end = start + fragment.length;
    const expression = normalizeMathSource(fragment);

    result += escapeHtml(text.slice(lastIndex, start));
    try {
      result += renderMathToHtml(expression, { forceInline: true });
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

  return escapeHtml(replaceCommonRawLatexText(text));
}
