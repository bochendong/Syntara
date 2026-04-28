import katex from 'katex';
import {
  getDirectUnicodeMathSymbol,
  normalizeLatexSource as normalizeLegacyLatexSource,
  replaceCommonRawLatexText,
  wrapBareLatexEnvironments,
} from '@/lib/latex-utils';

export type MathFragment =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'math';
      value: string;
      displayMode: boolean;
      complex: boolean;
      delimiter: '$' | '$$' | '\\(' | '\\[' | 'bare';
    };

export interface RenderMathOptions {
  displayMode?: boolean;
  forceInline?: boolean;
}

const MATH_PATTERN =
  /\\\[((?:[\s\S]+?))\\\]|\\\(((?:[\s\S]+?))\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

const COMPLEX_ENV_PATTERN =
  /\\begin\{(?:align\*?|aligned|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}/;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeDelimiterEscapes(text: string): string {
  return text.replace(/\\\\(?=[()[\]])/g, '\\');
}

function looksLikeMathText(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[|\\begin\{[a-zA-Z*]+\}|\\left/.test(text);
}

function isComplexMath(latex: string): boolean {
  return COMPLEX_ENV_PATTERN.test(latex) || /\\left|\\right/.test(latex);
}

function shouldTreatDoubleDollarAsInline(
  source: string,
  start: number,
  end: number,
  latex: string,
) {
  if (latex.includes('\n') || isComplexMath(latex)) return false;

  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end).trimStart();
  return before.length > 0 && after.length > 0;
}

export function normalizeMathSource(text: string): string {
  return normalizeLegacyLatexSource(text)
    .replace(/\${3,}/g, '$$')
    .replace(/\\begin\{align\*\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*\}/g, '\\end{aligned}')
    .replace(/\\begin\{align\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\}/g, '\\end{aligned}');
}

export function containsMathSyntax(text: string): boolean {
  if (!text) return false;
  return looksLikeMathText(wrapBareLatexEnvironments(normalizeDelimiterEscapes(text)));
}

export function parseMathFragments(input: string): MathFragment[] {
  if (!input) return [];

  const normalized = normalizeDelimiterEscapes(wrapBareLatexEnvironments(input));
  if (!looksLikeMathText(normalized)) {
    return [{ type: 'text', value: input }];
  }

  const fragments: MathFragment[] = [];
  let lastIndex = 0;

  normalized.replace(
    MATH_PATTERN,
    (match, bracketDisplay, parenInline, dollarDisplay, dollarInline, offset) => {
      const index = typeof offset === 'number' ? offset : 0;
      if (index > lastIndex) {
        fragments.push({ type: 'text', value: normalized.slice(lastIndex, index) });
      }

      const rawMath = bracketDisplay ?? parenInline ?? dollarDisplay ?? dollarInline ?? '';
      const latex = normalizeMathSource(rawMath);
      const delimiter = bracketDisplay ? '\\[' : parenInline ? '\\(' : dollarDisplay ? '$$' : '$';
      const displayMode =
        delimiter === '$$'
          ? !shouldTreatDoubleDollarAsInline(normalized, index, index + match.length, latex)
          : delimiter === '\\[';

      fragments.push({
        type: 'math',
        value: latex,
        displayMode,
        complex: isComplexMath(latex),
        delimiter,
      });

      lastIndex = index + match.length;
      return match;
    },
  );

  if (lastIndex < normalized.length) {
    fragments.push({ type: 'text', value: normalized.slice(lastIndex) });
  }

  return fragments.length ? fragments : [{ type: 'text', value: input }];
}

export function renderMathToHtml(latexSource: string, options: RenderMathOptions = {}): string {
  const latex = normalizeMathSource(latexSource);
  if (!latex) return '';

  const displayMode = options.forceInline ? false : Boolean(options.displayMode);
  const directSymbol = getDirectUnicodeMathSymbol(latex);
  if (directSymbol) {
    return displayMode
      ? `<span class="math-engine-display" data-syntara-math="display" style="display:block;text-align:center;margin:0.2em 0;">${directSymbol}</span>`
      : `<span class="math-engine-inline" data-syntara-math="inline">${directSymbol}</span>`;
  }

  const rendered = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: 'html',
    strict: 'ignore',
  });

  if (!displayMode) {
    return `<span class="math-engine-inline" data-syntara-math="inline">${rendered}</span>`;
  }

  return `<span class="math-engine-display" data-syntara-math="display" style="display:block;text-align:center;margin:0.2em 0;">${rendered}</span>`;
}

export function renderTextWithMathToHtml(
  text: string,
  options: { forceInline?: boolean; rawFallback?: boolean } = {},
): string | null {
  const fragments = parseMathFragments(text);
  const hasMath = fragments.some((fragment) => fragment.type === 'math');
  if (!hasMath) {
    return options.rawFallback ? escapeHtml(replaceCommonRawLatexText(text)) : null;
  }

  let html = '';
  for (const fragment of fragments) {
    if (fragment.type === 'text') {
      html += escapeHtml(fragment.value);
      continue;
    }

    try {
      html += renderMathToHtml(fragment.value, {
        displayMode: fragment.displayMode || fragment.complex,
        forceInline: options.forceInline,
      });
    } catch {
      html += escapeHtml(fragment.value);
    }
  }

  return html;
}
