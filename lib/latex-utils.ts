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
  '\\leq': '≤',
  '\\neq': '≠',
  '\\cap': '∩',
  '\\cup': '∪',
  '\\div': '÷',
  '\\in': '∈',
  '\\setminus': '∖',
  '\\smallsetminus': '∖',
  '\\vee': '∨',
  '\\wedge': '∧',
  '\\pm': '±',
  '\\to': '→',
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
  normalized = normalized.replace(/\\text\{([^{}]*)\}/g, '$1');
  for (const replacement of RAW_LATEX_TEXT_REPLACEMENTS) {
    normalized = normalized.replace(replacement.pattern, replacement.symbol);
  }
  return normalized;
}
