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
const LATEX_ROW_BREAK_ENV_PATTERN =
  /\\begin\{(align\*?|aligned|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}[\s\S]*?\\end\{\1\}/g;
const LATEX_ROW_BREAK_SENTINEL = '__SYNTARA_LATEX_ROW_BREAK__';
const LATEX_INLINE_COMMAND_PATTERN =
  /\\(?:d?frac|neq|ne|to|rightarrow|Rightarrow|Leftrightarrow|equiv|mid|nmid|pmod|bmod|mod|dots|ldots|cdots|approx|sim|times|cdot|circ|exists|forall|in|notin|subseteq|subset|supseteq|leq|geq|mathbb|operatorname|text|sqrt|left|right|begin|end|gcd|tilde|alpha|beta|gamma|delta|lambda|mu|sigma|theta|omega|pi|sum|prod|int|lim|log|ln|sin|cos|tan)\b/;
const BARE_MATH_RUN_CHARS = String.raw`A-Za-z0-9\\{}\(\)\[\]\.,+\-−*/=,:^_<>|!'"’ \t→∘≠⇒≤≥≡∈∉⊆⊂∪∩∅∣∤ℕℤℚℝℂ`;
const BARE_MATH_PATTERNS = [
  /[ℕℤℚℝℂ](?:\s*[_^]\s*(?:\{[^}]{1,40}\}|[A-Za-z0-9]+))?/g,
  /\b(?:O|T|Theta|Omega|Θ|Ω)\s*\([^，。！？；;\n]+?\)/g,
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

type InlineTextFragment =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'code';
      value: string;
    };

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

const INLINE_CODE_CLASS =
  'rounded-md border border-slate-300/80 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const CODE_QUOTE_PATTERN = /['"`′’]/;

function normalizeInlineCodeText(text: string): string {
  return normalizeDelimiterEscapes(text)
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\textbackslash\b/g, '\\')
    .replace(/\\\\/g, '\\');
}

function renderInlineCodeHtml(text: string): string {
  return `<code class="${INLINE_CODE_CLASS}">${escapeHtml(normalizeInlineCodeText(text))}</code>`;
}

function looksLikeMathCodeLiteral(text: string): boolean {
  const normalized = normalizeDelimiterEscapes(text.trim());
  if (!normalized || normalized.includes('\n') || normalized.includes('$')) return false;
  return (
    /\\begin\{(?:[pbBvV]?matrix|array|cases|aligned)\}/.test(normalized) ||
    LATEX_INLINE_COMMAND_PATTERN.test(normalized) ||
    /[A-Za-z0-9)\]}]\s*\^\s*(?:\{[^}\n]+\}|[A-Za-z0-9+-])/.test(normalized) ||
    /(?:\([A-Za-z][A-Za-z0-9_'’]*\s*\^\s*\{?-?1\}?\)|[A-Za-z][A-Za-z0-9_'’]*)\s*['′]+\s*\([^()\n]*\)/.test(
      normalized,
    ) ||
    /\b(?:O|T|Theta|Omega|Θ|Ω)\s*\(/.test(normalized)
  );
}

function renderInlineCodeOrMathHtml(text: string): string {
  const normalized = normalizeDelimiterEscapes(text.trim());
  if (looksLikeMathCodeLiteral(normalized)) {
    try {
      const rendered = renderMathToHtml(normalized, { forceInline: true });
      if (rendered.includes('data-syntara-math')) return rendered;
    } catch {
      // Fall back to inline code when KaTeX cannot parse the content.
    }
  }

  return renderInlineCodeHtml(text);
}

function readLatexTextttCommandAt(
  source: string,
  index: number,
): { value: string; endIndex: number } | null {
  const commandMatch = source.slice(index).match(/^\\{1,2}texttt\s*\{/);
  if (!commandMatch) return null;

  const openIndex = index + commandMatch[0].lastIndexOf('{');
  const argument = readBalancedBraceContent(source, openIndex);
  if (!argument) return null;

  return argument;
}

function readBalancedDelimitedContent(
  source: string,
  openIndex: number,
  opener: string,
  closer: string,
): { value: string; endIndex: number } | null {
  if (source[openIndex] !== opener) return null;

  let depth = 1;
  let index = openIndex + 1;
  let quotedBy: '"' | "'" | '`' | null = null;
  while (index < source.length) {
    const char = source[index];
    const escaped = index > 0 && source[index - 1] === '\\';

    if (quotedBy) {
      if (!escaped && char === quotedBy) quotedBy = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quotedBy = char;
      index += 1;
      continue;
    }
    if (!escaped && char === opener) depth += 1;
    if (!escaped && char === closer) depth -= 1;
    if (depth === 0) {
      return { value: source.slice(openIndex, index + 1), endIndex: index + 1 };
    }
    index += 1;
  }

  return null;
}

function readBracketedCodeLiteralAt(
  source: string,
  index: number,
): { value: string; endIndex: number } | null {
  const delimiters: Record<string, string> = {
    '[': ']',
    '{': '}',
  };
  const closer = delimiters[source[index]];
  if (!closer) return null;

  const literal = readBalancedDelimitedContent(source, index, source[index], closer);
  if (!literal || !looksLikeCodeLiteral(literal.value)) return null;
  return literal;
}

function splitInlineCodeFragments(text: string): InlineTextFragment[] {
  if (!text) return [];

  const fragments: InlineTextFragment[] = [];
  let cursor = 0;
  let index = 0;

  const pushText = (end: number) => {
    if (end > cursor) {
      fragments.push({ type: 'text', value: text.slice(cursor, end) });
    }
  };

  while (index < text.length) {
    if (text[index] === '`') {
      const endIndex = text.indexOf('`', index + 1);
      if (endIndex > index) {
        pushText(index);
        fragments.push({ type: 'code', value: text.slice(index + 1, endIndex) });
        index = endIndex + 1;
        cursor = index;
        continue;
      }
    }

    const bracketedCode = readBracketedCodeLiteralAt(text, index);
    if (bracketedCode) {
      pushText(index);
      fragments.push({ type: 'code', value: bracketedCode.value });
      index = bracketedCode.endIndex;
      cursor = index;
      continue;
    }

    const latexTexttt = readLatexTextttCommandAt(text, index);
    if (latexTexttt) {
      pushText(index);
      fragments.push({ type: 'code', value: latexTexttt.value });
      index = latexTexttt.endIndex;
      cursor = index;
      continue;
    }

    index += 1;
  }

  pushText(text.length);
  return fragments.length ? fragments : [{ type: 'text', value: text }];
}

function hasInlineCodeFragment(text: string): boolean {
  return splitInlineCodeFragments(text).some((fragment) => fragment.type === 'code');
}

function findBareMathCandidatesOutsideInlineCode(text: string): BareMathCandidate[] {
  return splitInlineCodeFragments(text)
    .filter((fragment) => fragment.type === 'text')
    .flatMap((fragment) => findBareMathCandidates(fragment.value));
}

function renderTextFragmentWithInlineCode(text: string): string {
  return splitInlineCodeFragments(text)
    .map((fragment) =>
      fragment.type === 'code'
        ? renderInlineCodeOrMathHtml(fragment.value)
        : renderTextFragmentWithBareMath(fragment.value),
    )
    .join('');
}

function normalizeDelimiterEscapes(text: string): string {
  return text.replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\');
}

function protectLatexEnvironmentRowBreaks(text: string): string {
  if (!text.includes('\\begin{')) return text;

  return text.replace(LATEX_ROW_BREAK_ENV_PATTERN, (environment) =>
    environment.replace(/\\\\(?=\s*[^\s\\[])/g, LATEX_ROW_BREAK_SENTINEL),
  );
}

function restoreLatexEnvironmentRowBreaks(text: string): string {
  return text.replaceAll(LATEX_ROW_BREAK_SENTINEL, '\\\\');
}

function normalizeCasesEnvironmentRows(latex: string): string {
  if (!latex.includes('\\begin{cases}')) return latex;

  return latex.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_match, body: string) => {
    const rows = body
      .replace(/\${1,2}/g, '')
      .replace(/,\s*(\\{1,2})\s*(?=([^,&]+,\s*&))/g, (_rowMatch, _slashes, nextRow: string) => {
        const trimmedNextRow = nextRow.trim();
        const commandPrefix = /^\\?(?:tan|sin|cos|log|ln|sqrt|frac|lim|int|sum|prod)\b/.test(
          trimmedNextRow,
        )
          ? trimmedNextRow.startsWith('\\')
            ? ''
            : '\\'
          : '';
        return `,\\\\\n${commandPrefix}`;
      })
      .replace(/\\{2,}\s*(?=[^,&]+,\s*&)/g, '\\\\\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return `\\begin{cases}\n${rows}\n\\end{cases}`;
  });
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

function isPlainSlashWordPhrase(text: string): boolean {
  if (!text.includes('/') || text.includes('\\')) return false;
  const parts = text
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    parts.length >= 2 &&
    parts.every((part) => /^[A-Za-z][A-Za-z0-9_'’-]*$/.test(part)) &&
    parts.every((part) => part.replace(/[_'’-]/g, '').length > 1)
  );
}

function looksLikeCodeLiteral(text: string): boolean {
  const trimmed = text.trim();
  if (/^`[^`]*`$/.test(trimmed)) return true;
  if (/^[\[{(][\s\S]*[\]})]$/.test(trimmed) && CODE_QUOTE_PATTERN.test(trimmed)) {
    return true;
  }
  if (
    /^[\[{][\s\S]*[:,][\s\S]*[\]}]$/.test(trimmed) &&
    /\b(?:True|False|None|null|undefined)\b/.test(trimmed)
  ) {
    return true;
  }
  if (/(?:^|[\s,])self\.[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)) {
    return true;
  }
  if (
    /(?:^|[\s,])[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed) &&
    (CODE_QUOTE_PATTERN.test(trimmed) ||
      /[\[\]{}]/.test(trimmed) ||
      /\b(?:True|False|None|null|undefined)\b/.test(trimmed) ||
      /\b[A-Z][A-Za-z0-9_]*\s*\(/.test(trimmed))
  ) {
    return true;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*\([^)]*\)$/.test(trimmed) && CODE_QUOTE_PATTERN.test(trimmed)) {
    return true;
  }
  return false;
}

const BARE_MATH_PROSE_WORD_PATTERN =
  /\b(?:assume|because|bijective|converse|define|every|first|follow|follows|for|hence|if|immediate|injective|let|may|now|only|preimage|proof|prove|since|so|suppose|surjective|that|then|therefore|thus|we|write)\b/i;

function hasBareMathProseLeak(text: string): boolean {
  const normalized = text
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!BARE_MATH_PROSE_WORD_PATTERN.test(normalized)) return false;

  const wordCount = normalized.match(/\b[A-Za-z]{2,}\b/g)?.length || 0;
  if (wordCount < 2) return false;

  return /[=^]|→|∘|≠|⇒|≤|≥|≡|∈|∉|⊆|⊂|∪|∩|∅|∣|∤|−|\bmod\b/i.test(normalized);
}

function isBareMathCandidate(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 160) return false;
  if (/[\u3400-\u9fff]/.test(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (isPlainSlashWordPhrase(text)) return false;
  if (looksLikeCodeLiteral(text)) return false;
  if (hasBareMathProseLeak(text)) return false;
  if (!/[A-Za-z\\ℕℤℚℝℂ]/.test(text) && !/\d+\s*\^/.test(text)) return false;
  if (/^[A-Za-z\s]+$/.test(text)) return false;

  const hasMathTrigger =
    LATEX_INLINE_COMMAND_PATTERN.test(text) ||
    /[=^*/]|→|∘|≠|⇒|≤|≥|≡|∈|∉|⊆|⊂|∪|∩|∅|∣|∤|−|ℕ|ℤ|ℚ|ℝ|ℂ/.test(text) ||
    /\b(?:O|T|Theta|Omega|Θ|Ω)\s*\(/.test(text) ||
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

function isLooseMathContent(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 220) return false;
  const mathSyntaxText = text.replace(/\\text\s*\{[^{}]*\}/g, '');
  if (/[\u3400-\u9fff]/.test(mathSyntaxText)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/^[A-Za-z\s]+$/.test(mathSyntaxText)) return false;
  return (
    LATEX_INLINE_COMMAND_PATTERN.test(text) ||
    /[=^*/+\-<>]|→|∘|≠|⇒|≤|≥|≡|∈|∉|⊆|⊂|∪|∩|∅|∣|∤|−|ℕ|ℤ|ℚ|ℝ|ℂ/.test(mathSyntaxText) ||
    /\b(?:O|T|Theta|Omega|Θ|Ω)\s*\(/.test(mathSyntaxText) ||
    /^[A-Za-z][A-Za-z0-9_]*\s*\([^，。！？；;\n]{1,120}\)$/.test(mathSyntaxText)
  );
}

function copyDollarMathSpan(
  text: string,
  index: number,
): { span: string; nextIndex: number } | null {
  if (text[index] !== '$') return null;
  const delimiter = text.startsWith('$$', index) ? '$$' : '$';
  const start = index + delimiter.length;
  const end = text.indexOf(delimiter, start);
  if (end < 0) return null;
  return {
    span: text.slice(index, end + delimiter.length),
    nextIndex: end + delimiter.length,
  };
}

function wrapSquareBracketMath(text: string): string {
  let output = '';
  let index = 0;

  while (index < text.length) {
    const dollarMathSpan = copyDollarMathSpan(text, index);
    if (dollarMathSpan) {
      output += dollarMathSpan.span;
      index = dollarMathSpan.nextIndex;
      continue;
    }

    if (text[index] !== '[' || text[index - 1] === '!') {
      output += text[index];
      index += 1;
      continue;
    }

    const end = text.indexOf(']', index + 1);
    if (end < 0 || end - index > 260 || text.slice(index + 1, end).includes('\n')) {
      output += text[index];
      index += 1;
      continue;
    }

    const next = text[end + 1];
    if (next === '(' || next === '[') {
      output += text[index];
      index += 1;
      continue;
    }

    const candidate = text.slice(index + 1, end).trim();
    if (!isLooseMathContent(candidate)) {
      output += text[index];
      index += 1;
      continue;
    }

    const lineStart = text.lastIndexOf('\n', index - 1) + 1;
    const lineEndIndex = text.indexOf('\n', end + 1);
    const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
    const displayMode =
      !text.slice(lineStart, index).trim() && !text.slice(end + 1, lineEnd).trim();
    output += displayMode ? `$$\n${candidate}\n$$` : `$${candidate}$`;
    index = end + 1;
  }

  return output;
}

function wrapDoubleParenMath(text: string): string {
  let output = '';
  let index = 0;

  outer: while (index < text.length) {
    const dollarMathSpan = copyDollarMathSpan(text, index);
    if (dollarMathSpan) {
      output += dollarMathSpan.span;
      index = dollarMathSpan.nextIndex;
      continue;
    }

    if (text.startsWith('((', index)) {
      let cursor = index + 2;
      let depth = 0;
      while (cursor < text.length) {
        const ch = text[cursor];
        if (ch === '(') {
          depth += 1;
        } else if (ch === ')') {
          if (depth > 0) {
            depth -= 1;
          } else if (text[cursor + 1] === ')') {
            const candidate = text.slice(index + 2, cursor).trim();
            if (isLooseMathContent(candidate)) {
              output += `$${candidate}$`;
              index = cursor + 2;
              continue outer;
            }
            break;
          } else {
            break;
          }
        }
        cursor += 1;
      }
    }

    output += text[index];
    index += 1;
  }

  return output;
}

function wrapParenMath(text: string): string {
  let output = '';
  let index = 0;

  outer: while (index < text.length) {
    const dollarMathSpan = copyDollarMathSpan(text, index);
    if (dollarMathSpan) {
      output += dollarMathSpan.span;
      index = dollarMathSpan.nextIndex;
      continue;
    }

    if (text[index] === '(') {
      let cursor = index + 1;
      let depth = 0;
      while (cursor < text.length && cursor - index <= 260) {
        const ch = text[cursor];
        if (ch === '\n') break;
        if (ch === '(') {
          depth += 1;
        } else if (ch === ')') {
          if (depth > 0) {
            depth -= 1;
          } else {
            const candidate = text.slice(index + 1, cursor).trim();
            if (isLooseMathContent(candidate)) {
              output += `$${candidate}$`;
              index = cursor + 1;
              continue outer;
            }
            break;
          }
        }
        cursor += 1;
      }
    }

    output += text[index];
    index += 1;
  }

  return output;
}

function wrapBacktickMath(text: string): string {
  return text.replace(/`([^`\n]{2,220})`/g, (match, candidate: string) => {
    const math = candidate.trim();
    return looksLikeMathCodeLiteral(math) ? `$${math}$` : match;
  });
}

export function normalizeLooseMathDelimiters(text: string): string {
  return wrapBacktickMath(wrapParenMath(wrapDoubleParenMath(wrapSquareBracketMath(text))));
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
  const protectedSource = protectLatexEnvironmentRowBreaks(source);
  const normalized = normalizeGraphFunctionCondition(
    normalizeMathProseConnectors(
      normalizeBrokenFunctionSignature(normalizeLegacyLatexSource(protectedSource)),
    ),
  )
    .replace(/\${3,}/g, '$$')
    .replace(/\\begin\{align\*\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*\}/g, '\\end{aligned}')
    .replace(/\\begin\{align\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\}/g, '\\end{aligned}');

  return normalizeCasesEnvironmentRows(restoreLatexEnvironmentRowBreaks(normalized));
}

export function containsMathSyntax(text: string): boolean {
  if (!text) return false;
  const normalized = wrapBareLatexEnvironments(
    normalizeDelimiterEscapes(normalizeInlineDollarWhitespace(text)),
  );
  return splitInlineCodeFragments(normalized)
    .filter((fragment) => fragment.type === 'text')
    .some(
      (fragment) =>
        looksLikeMathText(fragment.value) || findBareMathCandidates(fragment.value).length > 0,
    );
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
    const hasBareMath = findBareMathCandidatesOutsideInlineCode(text).length > 0;
    const hasCode = hasInlineCodeFragment(text);
    if (!hasBareMath && !hasCode && !options.rawFallback) return null;
    return renderTextFragmentWithInlineCode(text);
  }

  let html = '';
  for (const fragment of fragments) {
    if (fragment.type === 'text') {
      html += renderTextFragmentWithInlineCode(fragment.value);
      continue;
    }

    const normalizedCodeLikeMath = replaceCommonRawLatexText(fragment.value);
    if (
      !fragment.displayMode &&
      looksLikeCodeLiteral(normalizedCodeLikeMath) &&
      !looksLikeMathCodeLiteral(fragment.value)
    ) {
      html += renderInlineCodeHtml(normalizedCodeLikeMath);
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
