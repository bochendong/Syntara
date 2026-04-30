const DIRECT_UNICODE_MATH_SYMBOLS: Record<string, string> = {
  '\\approx': '≈',
  '\\cap': '∩',
  '\\cdot': '·',
  '\\cup': '∪',
  '\\div': '÷',
  '\\emptyset': '∅',
  '\\exists': '∃',
  '\\forall': '∀',
  '\\geq': '≥',
  '\\iff': '⇔',
  '\\in': '∈',
  '\\infty': '∞',
  '\\leq': '≤',
  '\\Leftrightarrow': '⇔',
  '\\Longleftrightarrow': '⇔',
  '\\neq': '≠',
  '\\notin': '∉',
  '\\nexists': '∄',
  '\\pm': '±',
  '\\Rightarrow': '⇒',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\supset': '⊃',
  '\\supseteq': '⊇',
  '\\times': '×',
  '\\to': '→',
  '\\varnothing': '∅',
};

const SINGLE_LETTER_ARGUMENT_COMMANDS =
  /\\(mathbb|mathcal|mathfrak|mathscr|mathbf|mathrm|mathit|mathsf|mathtt)\s+([A-Za-z])/g;
const BARE_OPERATOR_COMMANDS =
  /(?<!\\)\b(gcd|lcm|ker|dim|rank|sin|cos|tan|log|ln|max|min)\s*(?=[({])/g;

/**
 * Normalize model-escaped LaTeX while preserving matrix / array row separators.
 *
 * We only collapse doubled backslashes when they are clearly introducing a command
 * like \\frac or \\begin. Deliberate line breaks such as "\\\\ " or "\\\\[2pt]"
 * stay untouched.
 */
export function normalizeLatexSource(text: string): string {
  let normalized = text.trim();
  let previous = '';

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/\\\\(?=[^\s\\[])/g, '\\');
  }

  normalized = normalized.replace(SINGLE_LETTER_ARGUMENT_COMMANDS, '\\$1{$2}');
  normalized = normalized
    .replace(BARE_OPERATOR_COMMANDS, '\\$1')
    .replace(/(?<!\\)\bmid\b/g, '\\mid');

  return normalized;
}

export function getDirectUnicodeMathSymbol(text: string): string | null {
  const normalized = normalizeLatexSource(text);
  return DIRECT_UNICODE_MATH_SYMBOLS[normalized] ?? null;
}

const BARE_LATEX_ENV_PATTERN = /(?<!\$)(\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\2\})(?!\$)/g;

export function wrapBareLatexEnvironments(text: string): string {
  if (!text.includes('\\begin{')) return text;

  return text.replace(BARE_LATEX_ENV_PATTERN, (_match, env: string) => {
    const normalized = normalizeLatexSource(env);
    return `$$${normalized}$$`;
  });
}

const RAW_LATEX_TEXT_REPLACEMENTS = Object.entries({
  '\\mathbb{A}': '𝔸',
  '\\mathbb{B}': '𝔹',
  '\\mathbb{C}': 'ℂ',
  '\\mathbb{D}': '𝔻',
  '\\mathbb{E}': '𝔼',
  '\\mathbb{F}': '𝔽',
  '\\mathbb{G}': '𝔾',
  '\\mathbb{H}': 'ℍ',
  '\\mathbb{I}': '𝕀',
  '\\mathbb{J}': '𝕁',
  '\\mathbb{K}': '𝕂',
  '\\mathbb{L}': '𝕃',
  '\\mathbb{M}': '𝕄',
  '\\mathbb{N}': 'ℕ',
  '\\mathbb{O}': '𝕆',
  '\\mathbb{P}': 'ℙ',
  '\\mathbb{Q}': 'ℚ',
  '\\mathbb{R}': 'ℝ',
  '\\mathbb{S}': '𝕊',
  '\\mathbb{T}': '𝕋',
  '\\mathbb{U}': '𝕌',
  '\\mathbb{V}': '𝕍',
  '\\mathbb{W}': '𝕎',
  '\\mathbb{X}': '𝕏',
  '\\mathbb{Y}': '𝕐',
  '\\mathbb{Z}': 'ℤ',
  '\\Leftrightarrow': '⇔',
  '\\Longleftrightarrow': '⇔',
  '\\Rightarrow': '⇒',
  '\\iff': '⇔',
  '\\subseteq': '⊆',
  '\\supseteq': '⊇',
  '\\subset': '⊂',
  '\\supset': '⊃',
  '\\approx': '≈',
  '\\varnothing': '∅',
  '\\emptyset': '∅',
  '\\notin': '∉',
  '\\nexists': '∄',
  '\\exists': '∃',
  '\\forall': '∀',
  '\\times': '×',
  '\\cdot': '·',
  '\\infty': '∞',
  '\\geq': '≥',
  '\\gcd': 'gcd',
  '\\leq': '≤',
  '\\neq': '≠',
  '\\cap': '∩',
  '\\cup': '∪',
  '\\div': '÷',
  '\\in': '∈',
  '\\mid': '∣',
  '\\setminus': '∖',
  '\\smallsetminus': '∖',
  '\\vee': '∨',
  '\\wedge': '∧',
  '\\pm': '±',
  '\\to': '→',
  '\\,': ' ',
  '\\{': '{',
  '\\}': '}',
})
  .sort(([left], [right]) => right.length - left.length)
  .map(([latex, symbol]) => ({
    latex,
    pattern: new RegExp(latex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    symbol,
  }));

export function replaceCommonRawLatexText(text: string): string {
  if (!text.includes('\\')) return text;

  let normalized = normalizeLatexSource(text);
  normalized = normalized.replace(/\\not\s*\\equiv/g, '≢');
  normalized = normalized.replace(/\\not\s*\\mid/g, '∤');
  normalized = normalized.replace(/\\nmid/g, '∤');
  normalized = normalized.replace(/\\equiv/g, '≡');
  normalized = normalized.replace(/\\pmod\s*\{([^{}]+)\}/g, '(mod $1)');
  normalized = normalized.replace(/\\pmod\s+([A-Za-z0-9_+\-*/^()]+)/g, '(mod $1)');
  normalized = normalized.replace(/\\mod\s*\{([^{}]+)\}/g, 'mod $1');
  normalized = normalized.replace(/\\mod\s+([A-Za-z0-9_+\-*/^()]+)/g, 'mod $1');
  normalized = normalized.replace(/\\bmod\b/g, 'mod');
  normalized = normalized.replace(/\\(?:dots|ldots)/g, '…');
  normalized = normalized.replace(/\\cdots/g, '⋯');
  normalized = normalized.replace(/\\text\{([^{}]*)\}/g, '$1');
  normalized = normalized.replace(/\\text\{([^{}]*)$/g, '$1');
  normalized = normalized.replace(/\{([^{}]*[\u3400-\u9fff][^{}]*)\}/g, '$1');
  normalized = normalized.replace(/\s+([^\\{}\s][^\\{}]*?)\}/g, ' $1');
  normalized = normalized.replace(/\\\s+/g, ' ');
  normalized = normalized.replace(/\\qquad|\\quad/g, ' ');
  for (const replacement of RAW_LATEX_TEXT_REPLACEMENTS) {
    normalized = normalized.replace(replacement.pattern, replacement.symbol);
  }
  return normalized;
}
