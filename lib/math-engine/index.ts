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
const LATEX_INLINE_COMMAND_PATTERN =
  /\\(?:d?frac|neq|ne|to|rightarrow|Rightarrow|Leftrightarrow|equiv|mid|nmid|pmod|bmod|mod|dots|ldots|cdots|approx|sim|times|cdot|circ|exists|forall|in|notin|subseteq|subset|supseteq|leq|geq|mathbb|operatorname|text|sqrt|left|right|begin|end|gcd|tilde|alpha|beta|gamma|delta|lambda|mu|sigma|theta|omega|pi|sum|prod|int|lim|log|ln|sin|cos|tan)\b/;
const BARE_MATH_RUN_CHARS = String.raw`A-Za-z0-9\\{}\(\)\[\]\.,+\-−*/=,:^_<>|!'"’ \t→∘≠⇒≤≥≡∈∉⊆⊂∪∩∅∣∤ℕℤℚℝℂ`;
const BARE_MATH_PATTERNS = [
  /[ℕℤℚℝℂ](?:\s*[_^]\s*(?:\{[^}]{1,40}\}|[A-Za-z0-9]+))?/g,
  /(?:\b|(?<![A-Za-z]))[A-Za-z0-9()[\]{}!^_+\-−*/.\\\s]{1,90}?\s*(?:≡|\\equiv)\s*[A-Za-z0-9()[\]{}!^_+\-−*/.\\\s]{1,90}?\s*(?:\\pmod\s*\{?[^{}\s，。！？；;]+}?|\(\s*(?:mod|\\pmod)\s*[^)]+?\s*\))/g,
  /\b(?:\d+|[A-Za-z])\s*\^\s*(?:\{[^}]{1,40}\}|[A-Za-z0-9]+)\s*(?:\\(?:pmod|bmod)\s*\{?[^{}\s，。！？；;]+}?|\(\s*mod\s+[^)]+?\s*\)|mod\s+[^，。！？；;\s]+)/g,
  /\b(?:\d+|[A-Za-z])\s*\^\s*(?:\{[^}]{1,40}\}|[A-Za-z0-9]+)(?=$|[\s，。！？；;,])/g,
  /\b[A-Za-z0-9][A-Za-z0-9_'’]*\s*(?:∣|∤|\\mid|\\nmid)\s*\([^，。！？；;\n]+?\)/g,
  /\b(?:gcd|\\gcd)\s*\([^，。！？；;\n]+?\)/g,
  /\b[a-z][A-Za-z0-9_'’]*\s*:\s*(?:\\mathbb\{[A-Z]\}|[A-Z])\s*(?:→|->|\\to)\s*(?:\\mathbb\{[A-Z]\}|[A-Z])\b/g,
  /\b[a-z][A-Za-z0-9_'’]*(?:\s*(?:∘|\\circ)\s*[a-z][A-Za-z0-9_'’]*)+(?:\([^，。！？；;\n]*?\))?(?:\s*(?:=|≠|\\neq|\\ne|<|>|≤|≥)\s*[a-z][A-Za-z0-9_'’]*(?:\s*(?:∘|\\circ)\s*[a-z][A-Za-z0-9_'’]*)+(?:\([^，。！？；;\n]*?\))?)?/g,
  /\b[a-z][A-Za-z0-9_'’]*(?:\s*(?:∘|\\circ)\s*[a-z][A-Za-z0-9_'’]*)+\s*\([^，。！？；;\n]*?\)\s*=\s*[A-Za-z0-9\\{}()[\].+\-*/^_ ∘→≠≤≥]+/g,
  /\b[a-z][A-Za-z0-9_'’]*\s*\([^，。！？；;\n()]{0,30}\)\s*=\s*[A-Za-z0-9\\{}()[\].+\-*/^_ ∘→≠≤≥]+/g,
  /\b[A-Z][A-Za-z0-9_]*\s*=\s*\{[A-Za-z0-9\s,().+\-*/^_]{1,120}\}/g,
  /\b[A-Za-z][A-Za-z0-9_'’]*\s*(?:∈|∉|⊆|⊂|\\in|\\notin|\\subseteq|\\subset)\s*[A-Za-z][A-Za-z0-9_'’]*\b/g,
  /\b[A-Za-z][A-Za-z0-9_'’]*(?:\s*(?:\/|=|≠|\\neq|\\ne|≤|≥|<|>)\s*[A-Za-z0-9][A-Za-z0-9_'’]*)+\b/g,
  new RegExp(
    String.raw`(?:[A-Za-z][A-Za-z0-9_'’]*(?:\s*(?:∘|\\circ)\s*[A-Za-z][A-Za-z0-9_'’]*)?(?:\([^，。！？；;\n]*?\))?\s*)?[${BARE_MATH_RUN_CHARS}]{0,60}\\(?:d?frac|neq|ne|to|rightarrow|Rightarrow|Leftrightarrow|equiv|mid|nmid|pmod|bmod|mod|dots|ldots|cdots|approx|sim|times|cdot|circ|exists|forall|in|notin|subseteq|subset|supseteq|leq|geq|mathbb|operatorname|sqrt|left|right|begin|end|gcd|tilde|alpha|beta|gamma|delta|lambda|mu|sigma|theta|omega|pi|sum|prod|int|lim|log|ln|sin|cos|tan)\b[${BARE_MATH_RUN_CHARS}]{0,80}`,
    'g',
  ),
];

interface BareMathCandidate {
  start: number;
  end: number;
  value: string;
}

function isUnescapedSingleDollar(text: string, index: number): boolean {
  return (
    text[index] === '$' &&
    text[index - 1] !== '\\' &&
    text[index - 1] !== '$' &&
    text[index + 1] !== '$'
  );
}

function normalizeInlineDollarWhitespace(text: string): string {
  if (!text.includes('$') || !text.includes('\n')) return text;

  let result = '';
  let i = 0;
  while (i < text.length) {
    if (!isUnescapedSingleDollar(text, i)) {
      result += text[i];
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < text.length && !isUnescapedSingleDollar(text, end)) {
      end += 1;
    }

    if (end >= text.length) {
      result += text.slice(i);
      break;
    }

    const content = text.slice(i + 1, end);
    result += `$${content.includes('\n') ? content.replace(/\s+/g, ' ').trim() : content}$`;
    i = end + 1;
  }

  return result;
}

function normalizeBrokenFunctionSignature(latex: string): string {
  return latex.replace(
    /([A-Za-z][A-Za-z0-9_'’]*)\s*:\s*(?:\\\{([A-Z])\\\}|\{([A-Z])\}|([A-Z]))\s*(?:\\to|→)?\s*(?:\\\{([A-Z])\\\}|\{([A-Z])\}|([A-Z]))/g,
    (
      _match,
      name: string,
      escapedDomain: string,
      plainDomain: string,
      bareDomain: string,
      escapedCodomain: string,
      plainCodomain: string,
      bareCodomain: string,
    ) => {
      const domain = escapedDomain || plainDomain || bareDomain;
      const codomain = escapedCodomain || plainCodomain || bareCodomain;
      return `${name}: \\mathbb{${domain}} \\to \\mathbb{${codomain}}`;
    },
  );
}

function normalizeMathProseConnectors(latex: string): string {
  const source = COMPLEX_ENV_PATTERN.test(latex) ? latex : latex.replace(/\\\\\s+/g, '\\ ');
  return source
    .replace(/\s*\\text\{\s*(?:使|使得|such\s+that|where)\s*\}\s*/gi, ': ')
    .replace(/\s*\\text\{\s*(?:且|and)\s*\}\s*/gi, ', ')
    .replace(/\s*\\(?:qquad|quad)\s*,\s*\\(?:qquad|quad)\s*/g, ',\\ ')
    .replace(/\\exists\s*!\s*(?:\\,)?\s*/g, '\\exists!\\,');
}

function normalizeGraphFunctionCondition(latex: string): string {
  const compact = latex
    .replace(/\s+/g, ' ')
    .replace(/\\,\s*/g, '')
    .replace(/\\\s+/g, ' ')
    .trim();

  if (/^\\forall x,\s*\\exists!y:\s*y\s*=\s*f\s*\(\s*x\s*\)$/.test(compact)) {
    return '\\forall x\\in X,\\ \\exists!\\,y\\in Y:\\ (x,y)\\in G';
  }

  return latex;
}

function readBalancedBraceContent(
  source: string,
  openIndex: number,
): { value: string; endIndex: number } | null {
  if (source[openIndex] !== '{') return null;

  let depth = 1;
  let index = openIndex + 1;
  while (index < source.length) {
    const char = source[index];
    const escaped = index > 0 && source[index - 1] === '\\';
    if (!escaped && char === '{') depth += 1;
    if (!escaped && char === '}') depth -= 1;
    if (depth === 0) {
      return { value: source.slice(openIndex + 1, index), endIndex: index + 1 };
    }
    index += 1;
  }

  return null;
}

function stripSyntaraFormulaCommand(latex: string): string {
  const normalized = latex.trim().replace(/^\\\\(?=formula\b)/, '\\');
  const commandMatch = normalized.match(/^\\formula\s*\{/);
  if (commandMatch) {
    const openIndex = commandMatch[0].length - 1;
    const argument = readBalancedBraceContent(normalized, openIndex);
    if (argument && normalized.slice(argument.endIndex).trim() === '') {
      return argument.value.trim();
    }
  }

  return normalized.replace(/^\\formula\s*/, '');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeDelimiterEscapes(text: string): string {
  return text.replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\');
}

function looksLikeMathText(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[|\\begin\{[a-zA-Z*]+\}|\\left/.test(text);
}

function trimBareMathCandidate(text: string, start: number, end: number): BareMathCandidate | null {
  let candidateStart = start;
  let candidateEnd = end;

  while (candidateStart < candidateEnd && /[\s,;:，。]/.test(text[candidateStart])) {
    candidateStart += 1;
  }
  while (candidateEnd > candidateStart && /[\s,;:，。]/.test(text[candidateEnd - 1])) {
    candidateEnd -= 1;
  }

  if (candidateEnd <= candidateStart) return null;
  return {
    start: candidateStart,
    end: candidateEnd,
    value: text.slice(candidateStart, candidateEnd),
  };
}

function isBareMathCandidate(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 160) return false;
  if (/[\u3400-\u9fff]/.test(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (!/[A-Za-z\\ℕℤℚℝℂ]/.test(text) && !/\d+\s*\^/.test(text)) return false;
  if (/^[A-Za-z\s]+$/.test(text)) return false;

  const hasMathTrigger =
    LATEX_INLINE_COMMAND_PATTERN.test(text) ||
    /[=^*/]|→|∘|≠|⇒|≤|≥|≡|∈|∉|⊆|⊂|∪|∩|∅|∣|∤|−|ℕ|ℤ|ℚ|ℝ|ℂ/.test(text) ||
    /\b[a-z][A-Za-z0-9_'’]*\s*:\s*(?:\\mathbb\{[A-Z]\}|[A-Z])\s*(?:\\to|→|->)\s*(?:\\mathbb\{[A-Z]\}|[A-Z])\b/.test(
      text,
    );
  if (!hasMathTrigger) return false;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10 && !LATEX_INLINE_COMMAND_PATTERN.test(text)) return false;

  return true;
}

function replaceUnicodeBlackboardLetters(latex: string): string {
  return latex.replace(/[ℕℤℚℝℂ]/g, (symbol) => {
    const letter = {
      ℕ: 'N',
      ℤ: 'Z',
      ℚ: 'Q',
      ℝ: 'R',
      ℂ: 'C',
    }[symbol];
    return letter ? `\\mathbb{${letter}}` : symbol;
  });
}

function findBareMathCandidates(text: string): BareMathCandidate[] {
  const normalizedText = normalizeDelimiterEscapes(text);
  const candidates: BareMathCandidate[] = [];

  for (const pattern of BARE_MATH_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalizedText.matchAll(pattern)) {
      const matchStart = match.index ?? 0;
      const trimmed = trimBareMathCandidate(
        normalizedText,
        matchStart,
        matchStart + match[0].length,
      );
      if (!trimmed || !isBareMathCandidate(trimmed.value)) continue;
      candidates.push(trimmed);
    }
  }

  return candidates
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .reduce<BareMathCandidate[]>((merged, candidate) => {
      const last = merged.at(-1);
      if (!last || candidate.start >= last.end) {
        merged.push(candidate);
        return merged;
      }
      if (candidate.end > last.end && candidate.end - candidate.start > last.end - last.start) {
        merged[merged.length - 1] = candidate;
      }
      return merged;
    }, []);
}

function normalizeBareMathCandidate(value: string): string {
  let latex = replaceUnicodeBlackboardLetters(normalizeDelimiterEscapes(value.trim()))
    .replace(/\s*−\s*/g, ' - ')
    .replace(/\s*->\s*/g, ' \\to ')
    .replace(/\s*→\s*/g, ' \\to ')
    .replace(/\s*⇒\s*/g, ' \\Rightarrow ')
    .replace(/\s*∘\s*/g, ' \\circ ')
    .replace(/\s*(?:≠|\\neq)\s*/g, ' \\ne ')
    .replace(/\s*(?:≡|\\equiv)\s*/g, ' \\equiv ')
    .replace(/\s*≤\s*/g, ' \\leq ')
    .replace(/\s*≥\s*/g, ' \\geq ')
    .replace(/\s*∈\s*/g, ' \\in ')
    .replace(/\s*∉\s*/g, ' \\notin ')
    .replace(/\s*⊆\s*/g, ' \\subseteq ')
    .replace(/\s*⊂\s*/g, ' \\subset ')
    .replace(/\s*∣\s*/g, ' \\mid ')
    .replace(/\s*∤\s*/g, ' \\nmid ')
    .replace(/\(\s*mod\s+([^)]+?)\s*\)/gi, (_match, modulus: string) => {
      return `\\pmod{${modulus.trim()}}`;
    })
    .replace(/\(\s*\\pmod\s*\{?([^)}]+)\}?\s*\)/g, (_match, modulus: string) => {
      return `\\pmod{${modulus.trim()}}`;
    })
    .replace(/\\pmod\s+([A-Za-z0-9_+\-*/^()]+)/g, (_match, modulus: string) => {
      return `\\pmod{${modulus.trim()}}`;
    })
    .replace(/\\bmod\s+([A-Za-z0-9_+\-*/^()]+)/g, (_match, modulus: string) => {
      return `\\pmod{${modulus.trim()}}`;
    })
    .replace(/\bmod\s+([A-Za-z0-9_+\-*/^()]+)/g, (_match, modulus: string) => {
      return `\\pmod{${modulus.trim()}}`;
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (/^[A-Z][A-Za-z0-9_]*\s*=/.test(latex) && !/\\[a-zA-Z]+\s*\{/.test(latex)) {
    latex = latex.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }

  return normalizeMathSource(latex);
}

function renderTextFragmentWithBareMath(text: string): string {
  const normalizedText = normalizeDelimiterEscapes(text);
  const candidates = findBareMathCandidates(normalizedText);
  if (candidates.length === 0) {
    return escapeHtml(replaceCommonRawLatexText(normalizedText));
  }

  let html = '';
  let lastIndex = 0;
  for (const candidate of candidates) {
    html += escapeHtml(replaceCommonRawLatexText(normalizedText.slice(lastIndex, candidate.start)));
    try {
      const rendered = renderMathToHtml(normalizeBareMathCandidate(candidate.value), {
        forceInline: true,
      });
      html += rendered.includes('data-syntara-math')
        ? rendered
        : escapeHtml(replaceCommonRawLatexText(candidate.value));
    } catch {
      html += escapeHtml(replaceCommonRawLatexText(candidate.value));
    }
    lastIndex = candidate.end;
  }

  html += escapeHtml(replaceCommonRawLatexText(normalizedText.slice(lastIndex)));
  return html;
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
  const source = stripSyntaraFormulaCommand(normalizeDelimiterEscapes(text));
  return normalizeGraphFunctionCondition(
    normalizeMathProseConnectors(
      normalizeBrokenFunctionSignature(normalizeLegacyLatexSource(source)),
    ),
  )
    .replace(/\${3,}/g, '$$')
    .replace(/\\begin\{align\*\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*\}/g, '\\end{aligned}')
    .replace(/\\begin\{align\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\}/g, '\\end{aligned}');
}

export function containsMathSyntax(text: string): boolean {
  if (!text) return false;
  const normalized = wrapBareLatexEnvironments(
    normalizeDelimiterEscapes(normalizeInlineDollarWhitespace(text)),
  );
  return looksLikeMathText(normalized) || findBareMathCandidates(normalized).length > 0;
}

export function parseMathFragments(input: string): MathFragment[] {
  if (!input) return [];

  const normalized = normalizeDelimiterEscapes(
    wrapBareLatexEnvironments(normalizeInlineDollarWhitespace(input)),
  );
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
  if (rendered.includes('katex-error')) {
    return escapeHtml(replaceCommonRawLatexText(latex));
  }

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
    const hasBareMath = findBareMathCandidates(text).length > 0;
    if (!hasBareMath && !options.rawFallback) return null;
    return renderTextFragmentWithBareMath(text);
  }

  let html = '';
  for (const fragment of fragments) {
    if (fragment.type === 'text') {
      html += renderTextFragmentWithBareMath(fragment.value);
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

export function renderInlineMathAwareHtml(text: string): string {
  return renderTextWithMathToHtml(text, { rawFallback: true }) || '';
}
