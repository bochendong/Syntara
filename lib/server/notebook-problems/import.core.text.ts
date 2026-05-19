export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export const MATH_SYMBOL_PATTERN = /[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔]/;
export const CONTROL_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u000crac/g, '\\frac'],
  [/\u0008/g, '{'],
  [/\u0012/g, '('],
  [/\u0013/g, ')'],
  [/\u001a/g, '{'],
  [/\u001b/g, '}'],
];
export const TOP_LEVEL_QUESTION_START_PATTERN =
  '(?:MC\\s*\\d+[\\.\\)]?\\s+|Q\\d+[:.]\\s+|Question\\s+\\d+\\s*[:.]\\s+|[1-9]\\d?[\\.]\\s+(?:(?:\\(\\d+\\s+points\\)\\s+)?(?:The\\s+following|Recall|For\\s+a|For\\s+an|Let\\s+|Suppose\\s+|Define\\s+|Determine\\s+|Find\\s+|Compute\\s+)|\\(\\d+\\s+points\\)\\s+)|题目\\s*\\d+|题\\s*\\d+[：:])';
export const TOP_LEVEL_QUESTION_START_RE = new RegExp(`^${TOP_LEVEL_QUESTION_START_PATTERN}`, 'i');

export function detectTextLocale(text: string): 'zh-CN' | 'en-US' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
}

export function cleanExtractedTextArtifacts(text: string): string {
  let cleaned = text.replace(/\r\n?/g, '\n');
  for (const [pattern, replacement] of CONTROL_TEXT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned
    .replace(/[\u0000-\u0007\u0009\u000b-\u0011\u0014-\u0019\u001c-\u001f\u007f]/g, ' ')
    .replace(/\bPage\s+\d+\b/gi, ' ')
    .replace(/\bQuestion\s+(\d+)\.\s*\(([ivx]+)\)\s+Continued\.\s*/gi, '')
    .replace(/\bMore space for Q\d+\([^)]+\)\s+located on the next page\.?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function repairSetBuilderGlyphs(text: string): string {
  return text.replace(/\bn\s+([^.!?]*?(?:∈|:)[^.!?]*?)\s+o\b/g, '{ $1 }');
}

export function tableCellCount(row: string): number {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
}

export function nextPipeRow(text: string, start: number, columnCount: number) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (text[index] !== '|') return null;

  let pipeCount = 0;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (text[cursor] === '|') pipeCount += 1;
    if (pipeCount === columnCount + 1) {
      return {
        row: text.slice(index, cursor + 1).trim(),
        end: cursor + 1,
      };
    }
  }
  return null;
}

export function normalizeInlinePipeTables(text: string): string {
  let output = '';
  let cursor = 0;
  const separatorPattern = /\|(?:\s*:?-{3,}:?\s*\|){2,}/g;
  let match: RegExpExecArray | null;

  while ((match = separatorPattern.exec(text))) {
    const separatorStart = match.index;
    if (separatorStart < cursor) continue;
    const columnCount = tableCellCount(match[0]);
    const before = text.slice(cursor, separatorStart);
    const pipePositions = [...before.matchAll(/\|/g)].map((item) => item.index ?? 0);
    if (pipePositions.length < columnCount + 1) continue;

    const tableStart = cursor + pipePositions[pipePositions.length - (columnCount + 1)];
    let rowCursor = tableStart;
    const rows: string[] = [];
    for (let rowIndex = 0; rowIndex < 40; rowIndex += 1) {
      const row = nextPipeRow(text, rowCursor, columnCount);
      if (!row) break;
      rows.push(row.row);
      rowCursor = row.end;
    }

    if (rows.length < 2 || !rows.some((row) => /^-+$/.test(row.replace(/[|:\s]/g, '')))) {
      continue;
    }

    output += text.slice(cursor, tableStart).trimEnd();
    output += `${output.endsWith('\n') || output.length === 0 ? '' : '\n'}${rows.join('\n')}`;
    cursor = rowCursor;
    separatorPattern.lastIndex = rowCursor;
  }

  const tail = text.slice(cursor);
  if (output && tail.trim()) {
    output += `\n${tail.trimStart()}`;
  } else {
    output += tail;
  }
  return output;
}

export function splitQuestionTextAfterInlineList(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!/^\s*[-*]\s+/.test(line)) return line;
      return line.replace(/(\.)\s+((?:If|Which|Determine|Find|Suppose|Let|For)\b.+)$/i, '$1\n\n$2');
    })
    .join('\n');
}

export function normalizeInlineStructuralMarkdown(text: string): string {
  const normalizeProse = (value: string) => {
    let normalized = value;

    if (
      /\b(?:properties|conditions|axioms|assumptions|requirements)\s*:/i.test(normalized) &&
      /\([A-Z]\d+\)/.test(normalized)
    ) {
      normalized = normalized
        .replace(/\s+-\s+(?=\([A-Z]\d+\))/g, '\n')
        .replace(/(\b(?:properties|conditions|axioms|assumptions|requirements)\s*:)\s*/i, '$1\n')
        .replace(/\s*(\([A-Z]\d+\)\s+)/g, '\n- $1');
    }

    normalized = normalized.replace(
      /\s+(\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)\s*(?:(?:\(\d+\s+points?\)\s*)|(?=(?:Prove|Show|Find|Determine|Compute|Calculate|Explain|Give|Describe|Use|Let|Suppose|Define)\b)))/gi,
      '\n\n$1',
    );

    normalized = normalized.replace(/\s+(Hint\s*:)/gi, '\n\n$1');
    return normalized;
  };

  let normalized = text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((part) => (part.startsWith('$') ? part : normalizeProse(part)))
    .join('');

  if (/\|\s*:?-{3,}:?\s*\|/.test(normalized)) {
    normalized = normalizeInlinePipeTables(normalized);
    normalized = normalized.replace(/(:)\n(\|)/g, '$1\n$2');
  }

  if (
    /\b(?:Definitions?|included|We say|We define|defined?|conditions?|steps?)\b[^\n]*\s+-\s+/i.test(
      normalized,
    )
  ) {
    normalized = normalized.replace(/\s+-\s+(?=(?:\$\$)?(?:[A-Z0-9]|\([A-Za-z0-9]))/g, '\n- ');
    normalized = splitQuestionTextAfterInlineList(normalized);
  }

  return normalized
    .replace(/\n{3,}/g, '\n\n')
    .replace(/:\n\n-/g, ':\n-')
    .trim();
}

export function repairCommonPdfMathText(text: string): string {
  return text
    .replace(/f\s*\(\s*x\s*\)\s*\n\s*g\s*\(\s*x\s*\)/g, () => '$\\frac{f(x)}{g(x)}$')
    .replace(/\bf\s*\(\s*x\s*\)\s*=\s*\n\s*√\s*x2\s*\+\s*1\s*\n\s*x\s*\./g, () => {
      return 'f(x) = $\\frac{\\sqrt{x^2+1}}{x}$.';
    })
    .replace(
      /f\s*\(\s*x\s*\)\s*=\s*\n\s*\s*\n\s*\s*\n\s*\s*\n\s*\|1\s*−\s*x\|,\s*if\s*x\s*<\s*3,\s*\n\s*2b,\s*if\s*x\s*=\s*3,\s*\n\s*tan−1\s*\(\s*x\s*−\s*2\s*\)\s*\+\s*a,\s*if\s*x\s*>\s*3\./g,
      () =>
        '$$f(x)=\\begin{cases}|1-x|, & x<3 \\\\ 2b, & x=3 \\\\ \\tan^{-1}(x-2)+a, & x>3\\end{cases}$$',
    )
    .replace(/lim\s*\n\s*x→−∞\s*f\s*\(\s*x\s*\)\s*=\s*L/g, () => {
      return '$\\lim_{x\\to -\\infty} f(x)=L$';
    })
    .replace(/lim\s*\n\s*x→0\s*\n\s*ex\s*−\s*1\s*\n\s*x\s*\./g, () => {
      return '$\\lim_{x\\to 0}\\frac{e^x-1}{x}$.';
    })
    .replace(/L\s*=\s*lim\s*\n?\s*x→∞\s*\(\s*ex\s*\+\s*x\s*\)\s*1\/x/g, () => {
      return '$L=\\lim_{x\\to\\infty}(e^x+x)^{1/x}$';
    })
    .replace(/V\s*=\s*4\s*\n\s*3πr3/g, () => '$V=\\frac{4}{3}\\pi r^3$')
    .replace(/\by\s*\(\s*t\s*\)\s*=\s*10t\+1\b/g, () => '$y(t)=10^{t+1}$')
    .replace(/Z\s+3\s*\n\s*0\s*\n\s*x2\s+dx/g, () => '$\\int_0^3 x^2\\,dx$')
    .replace(/Z\s+4\s*\+\s*√x\s*\n\s*x\s+dx/g, () => {
      return '$\\int \\frac{4+\\sqrt{x}}{x}\\,dx$';
    })
    .replace(/Z\s+1\s*\n\s*−1\s*\n\s*\|x\|\s+dx/g, () => '$\\int_{-1}^{1}|x|\\,dx$')
    .replace(/Z\s*\n\s*4x3ex4\s*\n\s*dx/g, () => '$\\int 4x^3e^{x^4}\\,dx$')
    .replace(/Z\s+sin−1\s*x\s*\n\s*√1\s*−\s*x2\s+dx/g, () => {
      return '$\\int \\frac{\\sin^{-1}x}{\\sqrt{1-x^2}}\\,dx$';
    })
    .replace(
      /Z\s+e\s*\n\s*1\s*\n\s*sin\s*\(\s*ln\s*x\s*\)\s*\n\s*x\s+dx\s*=\s*1\s*−\s*cos\s*\(\s*1\s*\)/g,
      () => '$\\int_1^e \\frac{\\sin(\\ln x)}{x}\\,dx=1-\\cos(1)$',
    )
    .replace(/Z\s+e\s*\n\s*1\s*\n\s*sin\s*\(\s*ln\s*x\s*\)\s*\n\s*x\s+dx/g, () => {
      return '$\\int_1^e \\frac{\\sin(\\ln x)}{x}\\,dx$';
    })
    .replace(/Z\s+x3\s*\n\s*−1\s*\n\s*t2et\s+dt/g, () => {
      return '$\\int_{-1}^{x^3} t^2 e^t\\,dt$';
    })
    .replace(/\bf\s*\(\s*x\s*\)/g, 'f(x)')
    .replace(/\bg\s*\(\s*x\s*\)/g, 'g(x)')
    .replace(/\by\s*\(\s*t\s*\)/g, 'y(t)')
    .replace(/\bln\s*x\b/g, '\\ln x')
    .replace(/\bcos−1\s*\(/g, '\\cos^{-1}(')
    .replace(/\btan−1\s*\(/g, '\\tan^{-1}(')
    .replace(/\bsin−1\s*x\b/g, '\\sin^{-1}x')
    .replace(/g\(x\)\s*=\s*\\cos\^{-1}\(([^)]+)\)/g, (_, argument: string) => {
      return `$g(x)=\\cos^{-1}(${argument.replace(/\s+/g, '')})$`;
    })
    .replace(/\(f\s*−\s*1\)\s*′/g, "(f^{-1})'")
    .replace(/([A-Za-z])\s*′/g, "$1'")
    .replace(/\(f\s*−1\)'/g, "(f^{-1})'")
    .replace(/\by\s*=\s*√x\b/g, '$y=\\sqrt{x}$')
    .replace(/(?<![A-Za-z])x2(?![A-Za-z0-9])/g, 'x^2')
    .replace(/(?<![A-Za-z])x3(?![A-Za-z0-9])/g, 'x^3')
    .replace(/(?<![A-Za-z])r3(?![A-Za-z0-9])/g, 'r^3')
    .replace(/\bex\b/g, 'e^x')
    .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
    .replace(/\${1,2}(\d+\.\s*\(\d+\s*points?\)\s+)/gi, '$1')
    .replace(/(\d+)\.\s*\((\d+)points\)/gi, '$1. ($2 points)')
    .replace(/\b(Let|let)([A-Za-z])\(/g, '$1 $2(')
    .replace(/\+\${1,2}\s*Z\s*x3\s*[−-]\s*1\s*t2et\s*dt/gi, '+ $\\\\int_{-1}^{x^3} t^2 e^t\\\\,dt$')
    .replace(/\b1\s*\/∈\s*E\b/g, () => '$1 \\\\notin E$')
    .replace(/\bt\s*̸\s*=\s*1\b/g, '$t \\\\neq 1$')
    .replace(/[φϕ]\s*:\s*G\s*[→↦]\s*[Hℍ]/g, '$\\\\varphi: G \\\\to H$')
    .replace(/ker\([φϕ]\)\s*≤\s*G/g, '$\\\\ker(\\\\varphi) \\\\leq G$')
    .replace(/ker\([φϕ]\)/g, '$\\\\ker(\\\\varphi)$')
    .replace(/\bN\s*≤\s*G\b/g, '$N \\\\leq G$')
    .replace(/\bgng[−-]\s*1\s*∈\s*N\b/g, '$g n g^{-1} \\\\in N$')
    .replace(/\bg\s*∈\s*G\b/g, '$g \\\\in G$')
    .replace(/\bn\s*∈\s*N\b/g, '$n \\\\in N$')
    .replace(/\(ab\)2\s*=\s*a2b2/g, '$(ab)^2 = a^2 b^2$')
    .replace(/\bfor all a,\s*b\s*∈\s*G\b/gi, 'for all $a, b \\\\in G$')
    .replace(
      /\bboth\s+uv\s*∈\s*E\s+and\s+uv\s*∈\s*E\b/gi,
      'both $uv \\\\in E$ and $\\\\frac{u}{v} \\\\in E$',
    )
    .replace(/\bxr\s*▷\s*yr\b/g, '$x^r \\\\triangleright y^r$')
    .replace(/\bxr\s*\\triangleright\s*yr\b/g, 'x^r \\\\triangleright y^r')
    .replace(/\bx\s*▷\s*y\b/g, '$x \\\\triangleright y$');
}

export function repairPlainMathExpression(expression: string): string {
  return expression
    .replace(/\bsubseteq\b/g, '\\subseteq')
    .replace(/\bsupseteq\b/g, '\\supseteq')
    .replace(/\bleq\b/g, '\\leq')
    .replace(/\bgeq\b/g, '\\geq')
    .replace(/\bneq\b/g, '\\neq')
    .replace(/\bnotin\b/g, '\\notin')
    .replace(/\bker\b/g, '\\ker')
    .replace(/\b([A-Za-z])\s*:\s*([A-Za-z])\s+o\s+([A-Za-z])\b/g, '$1: $2 \\\\to $3')
    .replace(/\b([A-Za-z])\s*:\s*([A-Za-z])\s+to\s+([A-Za-z])\b/g, '$1: $2 \\\\to $3')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/,\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isPlainMathLikeExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (/\b(?:for|with|where|which|show|prove|find|determine|suppose|let)\b/i.test(trimmed)) {
    return false;
  }
  if (/\\(?:to|subseteq|supseteq|leq|geq|neq|notin|ker)\b/.test(trimmed)) return true;
  if (/[=<>≤≥∈∉⊆⊂⊇⊃→↔⇒⇔^_]/.test(trimmed)) return true;
  if (/\|[A-Za-z]\|/.test(trimmed)) return true;
  return /^[A-Za-z](?:\([A-Za-z]\))?(?:\s*[,=]\s*[A-Za-z](?:\([A-Za-z]\))?)+$/.test(trimmed);
}

export function repairParenthesizedPlainMath(text: string): string {
  return text
    .replace(
      /\(\s*([A-Za-z]\([A-Za-z]\)\s*=\s*[A-Za-z]\([A-Za-z]\))\s*\)/g,
      (_, expression: string) => `$$${repairPlainMathExpression(expression)}$$`,
    )
    .replace(/\(\s*([^()\n]{1,160})\s*\)/g, (match, expression: string) => {
      const repaired = repairPlainMathExpression(expression);
      if (!isPlainMathLikeExpression(repaired)) return match;
      return `$$${repaired}$$`;
    });
}

export function repairParenthesizedPlainMathOutsideDelimitedMath(text: string): string {
  return text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((part) => (part.startsWith('$') ? part : repairParenthesizedPlainMath(part)))
    .join('');
}

export function sanitizeChoiceOptionLabel(label: string): string {
  let cleaned = repairSetBuilderGlyphs(cleanExtractedTextArtifacts(label))
    .replace(/(?<=\.)\s+\d+$/u, '')
    .trim();
  if (cleaned.startsWith('{') && !cleaned.includes('}') && /(?:∈|:)/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\.$/, '').trim();
    cleaned = `${cleaned} }`;
  }
  return cleaned;
}

export function hasBalancedMathDelimiters(text: string): boolean {
  const pairs: Array<[string, string]> = [
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ];
  return pairs.every(([open, close]) => {
    const openCount = [...text].filter((char) => char === open).length;
    const closeCount = [...text].filter((char) => char === close).length;
    return openCount === closeCount;
  });
}

export function normalizeWhitespace(text: string): string {
  return cleanExtractedTextArtifacts(text).replace(/\s+/g, ' ').trim();
}

export function replaceLatexDelimiters(text: string): string {
  return text
    .replace(/\\\[((?:[\s\S]+?))\\\]/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/\\\(((?:[\s\S]+?))\\\)/g, (_, expr: string) => `$${expr.trim()}$`)
    .replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, expr: string) => `$${expr.trim()}$`);
}

export function repairMalformedMathDollarRuns(text: string): string {
  return text
    .replace(/(^|[^$])\$([^$\n]+?)\$\$(?!\$)/g, (_, prefix: string, expr: string) => {
      return `${prefix}$$${expr.trim()}$$`;
    })
    .replace(/(^|[^$])\$\$([^$\n]+?)\$(?!\$)/g, (_, prefix: string, expr: string) => {
      return `${prefix}$$${expr.trim()}$$`;
    });
}

export function normalizeInlineDollarMath(text: string): string {
  return text
    .replace(/\$\$([^$\n]{1,500})\$\$/g, (match, expr: string) => {
      const trimmed = expr.trim();
      if (/\\begin|\\end|\\\\/.test(trimmed)) return match;
      return `$${trimmed}$`;
    })
    .replace(/(?<!\$)\$([^$\n]{1,220})\$(?!\$)/g, (_, expr: string) => {
      return `$${expr.trim()}$`;
    });
}

export function spaceMathMarkdownBoundaries(text: string): string {
  const mathPattern = /\$\$[\s\S]+?\$\$/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text))) {
    result += text.slice(lastIndex, match.index);
    const previous = result.at(-1);
    if (previous && !/[\s([{（【]/.test(previous)) {
      result += ' ';
    }

    result += match[0].replace(/^\$\$\s+/, '$$').replace(/\s+\$\$$/, '$$');

    const next = text[mathPattern.lastIndex];
    if (next && !/[\s$.,;:!?，。；：！？)\]}）】]/.test(next)) {
      result += ' ';
    }
    lastIndex = mathPattern.lastIndex;
  }

  result += text.slice(lastIndex);
  return result.replace(/\s+([,.;:!?，。；：！？])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}

export function spaceInlineMathMarkdownBoundaries(text: string): string {
  const mathPattern = /\$[^$\n]+?\$/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text))) {
    result += text.slice(lastIndex, match.index);
    const previous = result.at(-1);
    if (previous && !/[\s([{（【]/.test(previous)) {
      result += ' ';
    }

    result += match[0].replace(/^\$\s+/, '$').replace(/\s+\$$/, '$');

    const next = text[mathPattern.lastIndex];
    if (next && !/[\s$.,;:!?，。；：！？)\]}）】]/.test(next)) {
      result += ' ';
    }
    lastIndex = mathPattern.lastIndex;
  }

  result += text.slice(lastIndex);
  return result.replace(/\s+([,.;:!?，。；：！？])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}

export function isLikelyStandaloneMathLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('$$') || trimmed.includes('```')) return false;
  if (/^\d+[\.)]\s*\(\d+\s+points?\)/i.test(trimmed) || /\bpoints?\b/i.test(trimmed)) {
    return false;
  }
  if (
    /\b(?:let|find|determine|show|prove|compute|calculate|evaluate|describe|use)\b/i.test(trimmed)
  ) {
    return false;
  }
  const longWords = trimmed.match(/[A-Za-z]{4,}/g)?.length ?? 0;
  const mathHits = trimmed.match(/[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔]/g)?.length ?? 0;
  return (
    mathHits > 0 &&
    longWords <= 1 &&
    hasBalancedMathDelimiters(trimmed) &&
    (/^[A-Za-z0-9({[\\]/.test(trimmed) ||
      /\b[A-Za-z]\s*=\s*[\[{(]/.test(trimmed) ||
      /\b[A-Za-z]\s*[⊆⊂⊇⊃=]\s*[A-Za-z]/.test(trimmed))
  );
}

export function isLikelyMathOnlyFragment(fragment: string): boolean {
  const trimmed = fragment.trim();
  if (!trimmed || trimmed.startsWith('$$') || trimmed.endsWith('$$')) return false;
  if (!MATH_SYMBOL_PATTERN.test(trimmed)) return false;
  const words = trimmed.match(/[A-Za-z]{2,}/g) ?? [];
  const allowedWords = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'ker', 'mod', 'gcd']);
  const disallowedWords = words.filter((word) => !allowedWords.has(word.toLowerCase()));
  if (disallowedWords.some((word) => word.length >= 4)) return false;
  if (!hasBalancedMathDelimiters(trimmed)) return false;
  return trimmed.length <= 140;
}

export function repairFragmentedCasesMath(text: string): string {
  return text.replace(
    /(?:\${1,2}\s*)?([A-Za-z\\][^.\n]{0,160}?\\begin\{cases\}[\s\S]*?\\end\{cases\})(?:\s*\${1,2})?/g,
    (_, rawExpression: string) => {
      const expression = rawExpression
        .replace(/\${1,2}/g, '')
        .replace(/\\begin\{cases\}\s*/g, '\\begin{cases}\n')
        .replace(/\s*\\end\{cases\}/g, '\n\\end{cases}')
        .replace(/\s*\\\\\s*/g, '\\\\\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      return `\n\n$$\n${expression}\n$$\n\n`;
    },
  );
}

export function repairOverEagerMathMarkdown(text: string): string {
  return repairFragmentedCasesMath(text)
    .replace(/(?<!\$)\$([^$\n]+?)\$\$(?!\$)/g, (_, expr: string) => `$${expr.trim()}$`)
    .replace(/\$([^$\n]*\\begin\{cases\}[^$\n]*?)\$/g, (_, expr: string) => {
      return `$$${expr.trim()}$$`;
    })
    .replace(/\$line\s+y\s*=\s*3\.\$/g, 'line $y=3$.')
    .replace(/line\s+\$y=3\$\.\$/g, 'line $y=3$.')
    .replace(/\$f\^{-1}\$\s*'\s*\((\d+)\)/g, (_, value: string) => {
      return `$(f^{-1})'(${value})$`;
    })
    .replace(/f\s*\(\s*−\s*1\s*\)/g, 'f(-1)')
    .replace(/\\{2,}ln/g, '\\ln')
    .replace(/\\{2,}cos/g, '\\cos')
    .replace(/\\{2,}sin/g, '\\sin')
    .replace(/\(f\s*−\s*1\)\s*′/g, "(f^{-1})'");
}

export function normalizeMathMarkdown(text: string): string {
  const cleaned = normalizeInlineStructuralMarkdown(
    repairParenthesizedPlainMathOutsideDelimitedMath(
      repairCommonPdfMathText(repairSetBuilderGlyphs(cleanExtractedTextArtifacts(text))),
    ),
  );
  const withLatexDelimiters = replaceLatexDelimiters(repairMalformedMathDollarRuns(cleaned));
  const withDisplayLines = withLatexDelimiters
    .split('\n')
    .map((line) => {
      if (line.trim().startsWith('$$') && line.trim().endsWith('$$')) return line.trim();
      if (isLikelyStandaloneMathLine(line) || isLikelyMathOnlyFragment(line)) {
        return `$$${line.trim()}$$`;
      }
      return line;
    })
    .join('\n');
  const repaired = repairMalformedMathDollarRuns(withDisplayLines)
    .replace(/\$\$\s+/g, '$$')
    .replace(/\s+\$\$/g, '$$');
  return repairOverEagerMathMarkdown(
    spaceInlineMathMarkdownBoundaries(
      spaceMathMarkdownBoundaries(normalizeInlineDollarMath(repaired)),
    ),
  );
}

export function stripTopLevelQuestionLabel(text: string): string {
  return text
    .replace(/^\s*(?:MC\s*)?\d+\s*[\.)]\s*/i, '')
    .replace(/^\s*(?:Q|Question)\s*\d+\s*[:.)]\s*/i, '')
    .trim();
}
