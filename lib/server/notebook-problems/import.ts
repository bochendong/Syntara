import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { ZodError } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

const MATH_SYMBOL_PATTERN = /[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔]/;
const CONTROL_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u000crac/g, '\\frac'],
  [/\u0008/g, '{'],
  [/\u0012/g, '('],
  [/\u0013/g, ')'],
  [/\u001a/g, '{'],
  [/\u001b/g, '}'],
];
const TOP_LEVEL_QUESTION_START_PATTERN =
  '(?:MC\\s*\\d+[\\.\\)]?\\s+|Q\\d+[:.]\\s+|Question\\s+\\d+\\s*[:.]\\s+|[1-9]\\d?[\\.]\\s+(?:(?:\\(\\d+\\s+points\\)\\s+)?(?:The\\s+following|Recall|For\\s+a|For\\s+an|Let\\s+|Suppose\\s+|Define\\s+|Determine\\s+|Find\\s+|Compute\\s+)|\\(\\d+\\s+points\\)\\s+)|题目\\s*\\d+|题\\s*\\d+[：:])';
const TOP_LEVEL_QUESTION_START_RE = new RegExp(`^${TOP_LEVEL_QUESTION_START_PATTERN}`, 'i');

type ImportUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostCredits: number | null;
};

function detectTextLocale(text: string): 'zh-CN' | 'en-US' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
}

function cleanExtractedTextArtifacts(text: string): string {
  let cleaned = text;
  for (const [pattern, replacement] of CONTROL_TEXT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned
    .replace(/[\u0000-\u0007\u0009-\u000a\u000b-\u0011\u0014-\u0019\u001c-\u001f\u007f]/g, ' ')
    .replace(/\bPage\s+\d+\b/gi, ' ')
    .replace(/\bQuestion\s+(\d+)\.\s*\(([ivx]+)\)\s+Continued\.\s*/gi, '')
    .replace(/\bMore space for Q\d+\([^)]+\)\s+located on the next page\.?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function repairSetBuilderGlyphs(text: string): string {
  return text.replace(/\bn\s+([^.!?]*?(?:∈|:)[^.!?]*?)\s+o\b/g, '{ $1 }');
}

function tableCellCount(row: string): number {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
}

function nextPipeRow(text: string, start: number, columnCount: number) {
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

function normalizeInlinePipeTables(text: string): string {
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

function splitQuestionTextAfterInlineList(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!/^\s*[-*]\s+/.test(line)) return line;
      return line.replace(/(\.)\s+((?:If|Which|Determine|Find|Suppose|Let|For)\b.+)$/i, '$1\n\n$2');
    })
    .join('\n');
}

function normalizeInlineStructuralMarkdown(text: string): string {
  let normalized = text;

  if (/\|\s*:?-{3,}:?\s*\|/.test(normalized)) {
    normalized = normalizeInlinePipeTables(normalized);
    normalized = normalized.replace(/(:)\n(\|)/g, '$1\n$2');
  }

  if (
    /\b(?:Definitions?|included|We say|We define|defined?|conditions?|steps?)\b[^\n]*\s+-\s+/i.test(
      normalized,
    )
  ) {
    normalized = normalized.replace(/\s+-\s+(?=(?:\$\$)?[A-Z0-9])/g, '\n- ');
    normalized = splitQuestionTextAfterInlineList(normalized);
  }

  return normalized.replace(/\n{3,}/g, '\n\n').trim();
}

function repairCommonPdfMathText(text: string): string {
  return text
    .replace(/\b1\s*\/∈\s*E\b/g, '1 \\\\notin E')
    .replace(/\bt\s*̸\s*=\s*1\b/g, 't \\\\neq 1')
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

function repairPlainMathExpression(expression: string): string {
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

function isPlainMathLikeExpression(expression: string): boolean {
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

function repairParenthesizedPlainMath(text: string): string {
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

function repairParenthesizedPlainMathOutsideDelimitedMath(text: string): string {
  return text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((part) => (part.startsWith('$') ? part : repairParenthesizedPlainMath(part)))
    .join('');
}

function sanitizeChoiceOptionLabel(label: string): string {
  let cleaned = repairSetBuilderGlyphs(cleanExtractedTextArtifacts(label))
    .replace(/(?<=\.)\s+\d+$/u, '')
    .trim();
  if (cleaned.startsWith('{') && !cleaned.includes('}') && /(?:∈|:)/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\.$/, '').trim();
    cleaned = `${cleaned} }`;
  }
  return cleaned;
}

function hasBalancedMathDelimiters(text: string): boolean {
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

function normalizeWhitespace(text: string): string {
  return cleanExtractedTextArtifacts(text).replace(/\s+/g, ' ').trim();
}

function replaceLatexDelimiters(text: string): string {
  return text
    .replace(/\\\[((?:[\s\S]+?))\\\]/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/\\\(((?:[\s\S]+?))\\\)/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, expr: string) => `$$${expr.trim()}$$`);
}

function repairMalformedMathDollarRuns(text: string): string {
  return text
    .replace(/(^|[^$])\$([^$\n]+?)\$\$(?!\$)/g, (_, prefix: string, expr: string) => {
      return `${prefix}$$${expr.trim()}$$`;
    })
    .replace(/(^|[^$])\$\$([^$\n]+?)\$(?!\$)/g, (_, prefix: string, expr: string) => {
      return `${prefix}$$${expr.trim()}$$`;
    });
}

function normalizeInlineDollarMath(text: string): string {
  return text.replace(/\${1,2}([^$\n]{1,220})\${1,2}/g, (_, expr: string) => {
    return `$${expr.trim()}$`;
  });
}

function spaceMathMarkdownBoundaries(text: string): string {
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

function spaceInlineMathMarkdownBoundaries(text: string): string {
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

function isLikelyStandaloneMathLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('$$') || trimmed.includes('```')) return false;
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

function isLikelyMathOnlyFragment(fragment: string): boolean {
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

function normalizeMathMarkdown(text: string): string {
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
  return spaceInlineMathMarkdownBoundaries(
    spaceMathMarkdownBoundaries(normalizeInlineDollarMath(repaired)),
  );
}

function stripMathForTitle(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\\\[((?:[\s\S]+?))\\\]/g, ' ')
      .replace(/\\\(((?:[\s\S]+?))\\\)/g, ' ')
      .replace(/\$\$[\s\S]+?\$\$/g, ' ')
      .replace(/\$[^$\n]+?\$/g, ' ')
      .replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, ' ')
      .replace(/\s+[A-H][\.\):：]\s+[\s\S]*$/g, ' ')
      .replace(/(?:^|\n)\s*(?:答案|Answer)\s*[:：].+/gi, ' ')
      .replace(/[_*`#>-]+/g, ' '),
  );
}

function inferTopicLabel(text: string, locale: 'zh-CN' | 'en-US'): string {
  if (/(集合|set|subset|superset|⊆|⊂|∈|∩|∪)/i.test(text)) {
    if (/(线性组合|linear combination|整数|integer|x,y∈|n∈)/i.test(text)) {
      return locale === 'zh-CN' ? '线性组合集合' : 'Linear Combination Sets';
    }
    if (/(相等|相同|equal|equality)/i.test(text)) {
      return locale === 'zh-CN' ? '集合相等' : 'Set Equality';
    }
    if (/(交|并|差|intersection|union|difference)/i.test(text)) {
      return locale === 'zh-CN' ? '集合运算' : 'Set Operations';
    }
    return locale === 'zh-CN' ? '集合问题' : 'Set Theory';
  }
  if (/(递归|recursion)/i.test(text)) return locale === 'zh-CN' ? '递归' : 'Recursion';
  if (/(矩阵|matrix)/i.test(text)) return locale === 'zh-CN' ? '矩阵' : 'Matrices';
  if (/(导数|derivative|integral|积分)/i.test(text))
    return locale === 'zh-CN' ? '微积分' : 'Calculus';
  if (/(概率|probability|随机)/i.test(text)) return locale === 'zh-CN' ? '概率' : 'Probability';
  if (/(图|graph|tree|binary tree)/i.test(text))
    return locale === 'zh-CN' ? '图与树' : 'Graphs and Trees';
  if (/(字符串|string|array|数组|链表|linked list)/i.test(text))
    return locale === 'zh-CN' ? '数据结构' : 'Data Structures';
  return locale === 'zh-CN' ? '课程题目' : 'Course Problem';
}

function inferTaskLabel(
  text: string,
  type: NotebookProblemImportDraft['type'],
  locale: 'zh-CN' | 'en-US',
): string {
  if (/(⊆|⊂|包含|subset|superset|contain)/i.test(text)) {
    return locale === 'zh-CN' ? '包含关系' : 'Inclusion';
  }
  if (/(相等|相同|equal|equality)/i.test(text)) {
    return locale === 'zh-CN' ? '相等判断' : 'Equality';
  }
  if (type === 'proof') return locale === 'zh-CN' ? '证明' : 'Proof';
  if (type === 'calculation') return locale === 'zh-CN' ? '计算' : 'Calculation';
  if (type === 'choice') return locale === 'zh-CN' ? '选择题' : 'Multiple Choice';
  if (type === 'fill_blank') return locale === 'zh-CN' ? '填空' : 'Fill Blank';
  if (type === 'code') return locale === 'zh-CN' ? 'Python 编程' : 'Python Coding';
  return locale === 'zh-CN' ? '简答' : 'Short Answer';
}

function deriveProblemTitle(text: string, type: NotebookProblemImportDraft['type']): string {
  const locale = detectTextLocale(text);
  const plain = stripMathForTitle(text);
  const clauses = plain
    .split(/[\n。！？!?;；]/)
    .map((part) =>
      normalizeWhitespace(
        part
          .replace(/^(?:\d+[\.\)]\s*)+/, '')
          .replace(/^(?:MC|Q|Question)\s*\d+[\.\)]?\s*/i, '')
          .replace(/^(?:设|已知|对于|给定|考虑|请|试|证明|计算|求|写出|判断|说明)\s*/i, '')
          .replace(
            /^(?:consider|given|let|show that|prove that|determine whether|find|compute|calculate|write)\s+/i,
            '',
          ),
      ),
    )
    .filter(Boolean);

  for (const clause of clauses) {
    if (clause.length >= 4 && clause.length <= 36 && !/^[A-Z](?:\s+[A-Z])+$/.test(clause)) {
      return clause.slice(0, 36);
    }
  }

  const topic = inferTopicLabel(text, locale);
  const task = inferTaskLabel(text, type, locale);
  if (locale === 'zh-CN') {
    return task === '选择题' || task === '填空' ? `${topic}${task}` : `${topic}的${task}`;
  }
  return task === 'Multiple Choice' || task === 'Fill Blank'
    ? `${topic} ${task}`
    : `${task} of ${topic}`;
}

function isWeakProblemTitle(title: string, type: NotebookProblemImportDraft['type']): boolean {
  const singleLine = normalizeWhitespace(title);
  if (!singleLine) return true;
  if (singleLine.length > 48) return true;
  if (/^(untitled problem|imported problem|未命名题目|题目)$/i.test(singleLine)) return true;
  if (MATH_SYMBOL_PATTERN.test(singleLine)) return true;
  if (
    /^(证明|计算|求|判断|说明|show that|prove that|find|compute|calculate|determine)\b/i.test(
      singleLine,
    )
  ) {
    return true;
  }
  if (type === 'choice' && /^(选项|choice|multiple choice)$/i.test(singleLine)) return true;
  return false;
}

function normalizeTitle(
  text: string,
  type: NotebookProblemImportDraft['type'] = 'short_answer',
): string {
  const singleLine = normalizeWhitespace(text);
  if (isWeakProblemTitle(singleLine, type)) {
    return deriveProblemTitle(text, type).slice(0, 80) || 'Untitled problem';
  }
  return singleLine.slice(0, 80) || 'Untitled problem';
}

function inferDifficulty(text: string): 'easy' | 'medium' | 'hard' {
  if (/证明|prove|严格|递归|复杂度|hard|困难/i.test(text)) return 'hard';
  if (/计算|derive|multiple|fill in|填空|code|python/i.test(text)) return 'medium';
  return 'easy';
}

function inferType(block: string): NotebookProblemImportDraft['type'] {
  if (/^MC\s*\d+[\.\)]?\s+/i.test(block)) return 'choice';
  if (/```|python|def\s+\w+\s*\(|class\s+\w+\s*\(|public test|secret test|leetcode/i.test(block)) {
    return 'code';
  }
  if (/____|填空|blank/i.test(block)) return 'fill_blank';
  if (/证明|prove|show that/i.test(block)) return 'proof';
  if (/计算|calculate|求值|求解|evaluate/i.test(block)) return 'calculation';
  if (/(?:^|\n)\s*[A-D][\.\):：]/m.test(block)) return 'choice';
  return 'short_answer';
}

function parseChoiceOptions(block: string) {
  const cleaned = cleanExtractedTextArtifacts(block);
  const markers = [...cleaned.matchAll(/(^|\s)([A-H])[\.\):：]/g)].map((match) => {
    const leading = match[1] ?? '';
    const index = (match.index ?? 0) + leading.length;
    let end = (match.index ?? 0) + match[0].length;
    while (end < cleaned.length && /\s/.test(cleaned[end])) end += 1;
    return {
      id: match[2],
      index,
      end,
    };
  });
  const sequentialMarkers: typeof markers = [];
  let expectedCode = 'A'.charCodeAt(0);
  let searchAfter = -1;
  while (expectedCode <= 'H'.charCodeAt(0)) {
    const expectedId = String.fromCharCode(expectedCode);
    const marker = markers.find((item) => item.id === expectedId && item.index > searchAfter);
    if (!marker) break;
    sequentialMarkers.push(marker);
    searchAfter = marker.end;
    expectedCode += 1;
  }

  if (sequentialMarkers.length >= 2) {
    return sequentialMarkers
      .map((marker, index) => {
        const nextMarker = sequentialMarkers[index + 1];
        const label = cleaned.slice(marker.end, nextMarker?.index ?? cleaned.length).trim();
        return {
          id: marker.id,
          label: sanitizeChoiceOptionLabel(label),
        };
      })
      .filter((option) => option.label.length > 0);
  }

  const lineMatches = [...cleaned.matchAll(/(?:^|\n)\s*([A-H])[\.\):：]\s*(.+)/g)];
  return lineMatches
    .map((match) => ({
      id: match[1],
      label: sanitizeChoiceOptionLabel(match[2]),
    }))
    .filter((option) => option.label.length > 0);
}

function stripChoiceOptions(block: string): string {
  const cleaned = cleanExtractedTextArtifacts(block);
  const firstOption = cleaned.match(/(?:^|\s)A[\.\):：]\s+/);
  if (!firstOption || typeof firstOption.index !== 'number') {
    return cleaned.replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, '').trim();
  }
  return cleaned.slice(0, firstOption.index).trim();
}

function extractChoiceAnswer(block: string): string[] {
  const explicit = block.match(/(?:答案|Answer)\s*[:：]\s*([A-H](?:\s*[,，/]\s*[A-H])*)/i);
  if (!explicit) return [];
  return explicit[1]
    .split(/[,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCodeSignature(block: string): string | undefined {
  const match = block.match(/def\s+\w+\s*\([^\)]*\)/);
  return match?.[0]?.trim();
}

function extractPublicTests(block: string) {
  const tests = [
    ...block.matchAll(/(?:public test|测试用例|sample)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi),
  ];
  return tests.map((match, index) => ({
    id: `public_${index + 1}`,
    description: `Public test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function extractSecretTests(block: string) {
  const tests = [...block.matchAll(/(?:secret test|隐藏测试)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi)];
  return tests.map((match, index) => ({
    id: `secret_${index + 1}`,
    description: `Secret test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function extractPointTotal(text: string): number {
  const pointValues = [...text.matchAll(/\((\d+)\s+points?\)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (pointValues.length === 0) return 1;
  return pointValues.reduce((sum, value) => sum + value, 0);
}

function buildHeuristicDraft(
  block: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft | null {
  const cleaned = cleanExtractedTextArtifacts(block);
  if (!cleaned) return null;

  const type = inferType(cleaned);
  const mcNumber = cleaned.match(/^MC\s*(\d+)/i)?.[1];
  const title = mcNumber
    ? `${detectTextLocale(cleaned) === 'zh-CN' ? '选择题' : 'Multiple Choice'} ${mcNumber}`
    : normalizeTitle(cleaned, type);
  const common = {
    draftId: randomUUID(),
    title,
    status: 'draft' as const,
    source,
    points: extractPointTotal(cleaned),
    tags: [],
    difficulty: inferDifficulty(cleaned),
    sourceMeta: {
      importMode: 'heuristic',
      rawBlock: cleaned,
    },
    validationErrors: [] as string[],
  };

  if (type === 'choice') {
    const options = parseChoiceOptions(cleaned);
    const correctOptionIds = extractChoiceAnswer(cleaned);
    const fallbackCorrectOptionIds =
      correctOptionIds.length > 0 ? correctOptionIds : options[0]?.id ? [options[0].id] : ['A'];
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(stripChoiceOptions(cleaned)),
        selectionMode: correctOptionIds.length > 1 ? 'multiple' : 'single',
        options: options.map((option) => ({
          ...option,
          label: normalizeMathMarkdown(option.label),
        })),
      },
      grading: {
        type,
        correctOptionIds: fallbackCorrectOptionIds,
      },
      validationErrors: [
        ...(options.length < 2 ? ['未识别到足够的选项'] : []),
        ...(correctOptionIds.length === 0 ? ['未识别到正确答案'] : []),
      ],
    });
  }

  if (type === 'proof') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
      },
      grading: {
        type,
      },
    });
  }

  if (type === 'calculation') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
      },
      grading: {
        type,
        acceptedForms: [],
      },
      validationErrors: ['需补充 accepted answer 或 tolerance'],
    });
  }

  if (type === 'fill_blank') {
    const blanks = [...cleaned.matchAll(/_{3,}/g)].map((_, index) => ({
      id: `blank_${index + 1}`,
      placeholder: `Blank ${index + 1}`,
    }));
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stemTemplate: normalizeMathMarkdown(cleaned),
        blanks,
      },
      grading: {
        type,
        blanks: blanks.map((blank) => ({
          id: blank.id,
          acceptedAnswers: [],
          caseSensitive: false,
        })),
      },
      validationErrors: ['需补充每个空的 accepted answers'],
    });
  }

  if (type === 'code') {
    const publicTests = extractPublicTests(cleaned);
    const secretTests = extractSecretTests(cleaned);
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
        language: 'python',
        starterCode: undefined,
        functionSignature: extractCodeSignature(cleaned),
        constraints: [],
        publicTests,
        sampleIO: [],
        secretConfigPresent: secretTests.length > 0,
      },
      grading: {
        type,
        publishRequirementsMet:
          Boolean(extractCodeSignature(cleaned)) &&
          publicTests.length > 0 &&
          secretTests.length > 0,
      },
      secretJudge:
        secretTests.length > 0
          ? {
              language: 'python',
              secretTests,
              timeoutMs: 5000,
            }
          : undefined,
      validationErrors: [
        ...(extractCodeSignature(cleaned) ? [] : ['缺少 function signature']),
        ...(publicTests.length > 0 ? [] : ['缺少 public tests']),
        ...(secretTests.length > 0 ? [] : ['缺少 secret tests']),
      ],
    });
  }

  return notebookProblemImportDraftSchema.parse({
    ...common,
    type: 'short_answer',
    publicContent: {
      type: 'short_answer',
      stem: normalizeMathMarkdown(cleaned),
    },
    grading: {
      type: 'short_answer',
    },
  });
}

function heuristicExtractProblemDrafts(
  text: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  const cleanedText = cleanExtractedTextArtifacts(text);
  const mcBlocks = cleanedText.match(/\bMC\s*\d+[\.\)]?\s+[\s\S]*?(?=\bMC\s*\d+[\.\)]?\s+|$)/gi);
  if (mcBlocks && mcBlocks.length >= 2) {
    return mcBlocks
      .map((block) => buildHeuristicDraft(block, source))
      .filter(Boolean) as NotebookProblemImportDraft[];
  }

  const splittableText = cleanedText.replace(
    new RegExp(`\\s+(?=${TOP_LEVEL_QUESTION_START_PATTERN})`, 'gi'),
    '\n',
  );
  const blocks = splittableText
    .split(new RegExp(`\\n(?=${TOP_LEVEL_QUESTION_START_PATTERN})`, 'i'))
    .map((block) => block.trim())
    .filter(Boolean);
  const hasMcBlocks = /\bMC\s*\d+[\.\)]?\s+/i.test(splittableText);
  const topLevelBlocks = blocks.filter((block) => TOP_LEVEL_QUESTION_START_RE.test(block));
  const candidates =
    hasMcBlocks && blocks.some((block) => /^MC\s*\d+[\.\)]?\s+/i.test(block))
      ? blocks.filter((block) => /^MC\s*\d+[\.\)]?\s+/i.test(block))
      : topLevelBlocks.length > 0
        ? topLevelBlocks
        : blocks.length > 0
          ? blocks
          : [cleanedText.trim()];
  return candidates
    .map((block) => buildHeuristicDraft(block, source))
    .filter(Boolean) as NotebookProblemImportDraft[];
}

function trimPdfScaffoldTextToProblemRegion(text: string): string {
  const cleanedText = cleanExtractedTextArtifacts(text);
  const firstQuestionPatterns = [
    /(?:^|\n)\s*MC\s*1[\.\)]?\s+/i,
    /(?:^|\n)\s*(?:Q1[:.]|Question\s+1\s*[:.]|1[\.)]\s+(?:(?:\(\d+\s+points\)\s+)?(?:The\s+following|Recall|For\s+a|For\s+an|Let\s+|Suppose\s+|Define\s+|Determine\s+|Find\s+|Compute\s+)|\(\d+\s+points\)\s+))/i,
    /(?:^|\n)\s*(?:题目\s*1|题\s*1[：:])/i,
  ];
  const starts = firstQuestionPatterns
    .map((pattern) => {
      const match = cleanedText.match(pattern);
      return typeof match?.index === 'number' ? match.index : -1;
    })
    .filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : 0;
  return cleanedText
    .slice(start)
    .replace(/\s*This page is for additional work[\s\S]*$/i, '')
    .replace(/\s*End of Exam Questions\.?[\s\S]*$/i, '')
    .trim();
}

function normalizeRubricValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const criterion =
          'criterion' in item && typeof item.criterion === 'string' ? item.criterion.trim() : '';
        const points =
          'points' in item && typeof item.points === 'number' && Number.isFinite(item.points)
            ? item.points
            : null;
        if (criterion && points != null) return `${criterion}（${points} 分）`;
        if (criterion) return criterion;
      }
      return String(item ?? '').trim();
    })
    .filter(Boolean)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
}

function hasMarkdownTable(text: string): boolean {
  return /(?:^|\n)\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/m.test(text);
}

function hasStructuredContextBlock(text: string): boolean {
  return hasMarkdownTable(text) || /\n\s*(?:[-*]|\d+[\.)])\s+\S/.test(text);
}

function selfContainmentValidationErrors(draft: NotebookProblemImportDraft): string[] {
  const content = draft.publicContent;
  const stem =
    'stem' in content ? content.stem : 'stemTemplate' in content ? content.stemTemplate : '';
  const errors: string[] = [];

  if (/\bTable\s+[IVX]+\b|\btruth table\b/i.test(stem) && !hasMarkdownTable(stem)) {
    errors.push('缺少被引用的表格上下文');
  }
  if (
    /\bDiagram\s+[IVX]+\b|\bdiagram\b/i.test(stem) &&
    !/(?:\n\s*(?:[-*]|\d+[\.)])\s+|->|→|↦|\barrow\b|\bedge\b|\bloop\b|\bself-loop\b|\badjacency\b|\b关系对\b|\b箭头\b)/i.test(
      stem,
    )
  ) {
    errors.push('缺少图表上下文');
  }
  if (
    /\b(?:front page|statements above|above statements|definitions above|following steps)\b/i.test(
      stem,
    ) &&
    !hasStructuredContextBlock(stem)
  ) {
    errors.push('题干仍引用外部上下文');
  }

  return errors;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function equationConsistencyValidationErrors(draft: NotebookProblemImportDraft): string[] {
  if (draft.type !== 'choice' || draft.publicContent.type !== 'choice') return [];
  const stem = draft.publicContent.stem;
  const optionText = draft.publicContent.options.map((option) => option.label).join('\n');
  const errors: string[] = [];

  if (
    /\bsolution to\b/i.test(stem) &&
    /\bx\s*=/.test(optionText) &&
    /\by\s*=/.test(optionText) &&
    !/\b\d+\s*x\b|\bx\s*\+|\bx\s*-|\b\d+\s*y\b|\by\s*\+|\by\s*-/i.test(stem)
  ) {
    errors.push('题干方程疑似缺少变量 x/y');
  }

  const numbersMatch = stem.match(/\bnumbers\s+(\d+)\s+and\s+(\d+)\b/i);
  const equationMatch = stem.match(/solution\s+to\s+\$\$(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)\$\$/i);
  if (numbersMatch && equationMatch) {
    const first = Number(numbersMatch[1]);
    const second = Number(numbersMatch[2]);
    const rhs = Number(equationMatch[3]);
    const divisor = gcd(first, second);
    if (divisor > 0 && rhs % divisor !== 0) {
      errors.push(`题干方程右端 ${rhs} 不能被 gcd(${first}, ${second})=${divisor} 整除`);
    }
  }

  return errors;
}

function normalizeDraftMathFields(draft: NotebookProblemImportDraft): NotebookProblemImportDraft {
  const publicContent = { ...draft.publicContent } as NotebookProblemImportDraft['publicContent'];
  if ('stem' in publicContent && typeof publicContent.stem === 'string') {
    publicContent.stem = normalizeMathMarkdown(publicContent.stem);
  }
  if ('stemTemplate' in publicContent && typeof publicContent.stemTemplate === 'string') {
    publicContent.stemTemplate = normalizeMathMarkdown(publicContent.stemTemplate);
  }
  if (typeof publicContent.explanation === 'string') {
    publicContent.explanation = normalizeMathMarkdown(publicContent.explanation);
  }
  if (publicContent.type === 'choice') {
    publicContent.options = publicContent.options.map((option) => ({
      ...option,
      label: normalizeMathMarkdown(option.label),
    }));
  }

  const grading = { ...draft.grading } as NotebookProblemImportDraft['grading'];
  if ('referenceAnswer' in grading && typeof grading.referenceAnswer === 'string') {
    grading.referenceAnswer = normalizeMathMarkdown(grading.referenceAnswer);
  }
  if ('referenceProof' in grading && typeof grading.referenceProof === 'string') {
    grading.referenceProof = normalizeMathMarkdown(grading.referenceProof);
  }
  if ('rubric' in grading && typeof grading.rubric === 'string') {
    grading.rubric = normalizeMathMarkdown(grading.rubric);
  }
  if ('analysis' in grading && typeof grading.analysis === 'string') {
    grading.analysis = normalizeMathMarkdown(grading.analysis);
  }
  if ('acceptedForms' in grading && Array.isArray(grading.acceptedForms)) {
    grading.acceptedForms = grading.acceptedForms.map((item) =>
      typeof item === 'string' ? normalizeMathMarkdown(item) : item,
    );
  }

  return {
    ...draft,
    publicContent,
    grading,
    validationErrors: Array.from(
      new Set([
        ...draft.validationErrors,
        ...selfContainmentValidationErrors({
          ...draft,
          publicContent,
          grading,
        }),
        ...equationConsistencyValidationErrors({
          ...draft,
          publicContent,
          grading,
        }),
      ]),
    ),
  };
}

function withoutAnswerSourceMeta(
  sourceMeta: NotebookProblemImportDraft['sourceMeta'],
): NotebookProblemImportDraft['sourceMeta'] {
  const next = { ...sourceMeta } as Record<string, unknown>;
  delete next.answerSource;
  return next as NotebookProblemImportDraft['sourceMeta'];
}

function stripGeneratedAnswersForNonChoiceDraft(
  draft: NotebookProblemImportDraft,
): NotebookProblemImportDraft {
  if (draft.type === 'choice') return draft;

  const sourceMeta = withoutAnswerSourceMeta(draft.sourceMeta);
  const publicContent = { ...draft.publicContent } as NotebookProblemImportDraft['publicContent'];
  delete (publicContent as Record<string, unknown>).explanation;
  if (draft.grading.type === 'proof') {
    return {
      ...draft,
      publicContent,
      sourceMeta,
      grading: { type: 'proof' },
    };
  }
  if (draft.grading.type === 'short_answer') {
    return {
      ...draft,
      publicContent,
      sourceMeta,
      grading: { type: 'short_answer' },
    };
  }
  if (draft.grading.type === 'calculation') {
    return {
      ...draft,
      publicContent,
      sourceMeta,
      grading: { type: 'calculation', acceptedForms: [] },
    };
  }

  return {
    ...draft,
    publicContent,
    sourceMeta,
  };
}

function problemStemText(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

type SubpartSection = {
  label: string;
  text: string;
};

function extractSubpartSections(text: string): SubpartSection[] {
  const matches = [...text.matchAll(/\(([ivx]+|[a-h])\)\s*/gi)];
  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? text.length;
      return {
        label: String(match[1] ?? '').toLowerCase(),
        text: text.slice(start, end).trim(),
      };
    })
    .filter((section) => section.label && section.text.length > 0);
}

function stemHasSubpartLabel(text: string, label: string): boolean {
  return new RegExp(`\\(${label}\\)`, 'i').test(text);
}

function contentWords(text: string): string[] {
  const ignored = new Set([
    'the',
    'and',
    'that',
    'with',
    'for',
    'all',
    'points',
    'point',
    'prove',
    'show',
    'find',
    'determine',
    'let',
    'such',
    'when',
    'then',
  ]);
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length > 2 && !ignored.has(word),
  );
}

function subpartContentAlreadyCovered(stem: string, section: string): boolean {
  const sectionWords = Array.from(new Set(contentWords(section)));
  if (sectionWords.length === 0) return false;
  const stemWordSet = new Set(contentWords(stem));
  const matched = sectionWords.filter((word) => stemWordSet.has(word)).length;
  return matched / sectionWords.length >= 0.55;
}

function withScaffoldSubpartCoverage(args: {
  scaffoldDrafts: NotebookProblemImportDraft[];
  llmDrafts: NotebookProblemImportDraft[];
}): NotebookProblemImportDraft[] {
  if (args.scaffoldDrafts.length === 0 || args.llmDrafts.length === 0) return args.llmDrafts;
  const scaffoldByIndex = new Map<number, NotebookProblemImportDraft>();
  args.scaffoldDrafts.forEach((draft, index) => {
    scaffoldByIndex.set(scaffoldIndexOf(draft) ?? index + 1, draft);
  });

  return args.llmDrafts.map((draft) => {
    if (
      draft.publicContent.type !== 'short_answer' &&
      draft.publicContent.type !== 'proof' &&
      draft.publicContent.type !== 'calculation'
    ) {
      return draft;
    }

    const index = scaffoldIndexOf(draft);
    const scaffold = index == null ? null : scaffoldByIndex.get(index);
    if (!scaffold) return draft;

    const stem = problemStemText(draft);
    const missingSections = extractSubpartSections(problemStemText(scaffold))
      .filter(
        (section) =>
          !stemHasSubpartLabel(stem, section.label) &&
          !subpartContentAlreadyCovered(stem, section.text),
      )
      .map((section) => section.text);
    if (missingSections.length === 0) {
      return draft.points >= scaffold.points
        ? draft
        : {
            ...draft,
            points: scaffold.points,
          };
    }

    return normalizeDraftMathFields(
      notebookProblemImportDraftSchema.parse({
        ...draft,
        points: Math.max(draft.points, scaffold.points),
        publicContent: {
          ...draft.publicContent,
          stem: `${stem}\n\n${missingSections.join('\n\n')}`,
        },
        sourceMeta: {
          ...draft.sourceMeta,
          subpartCoverageFallback: 'text-layer-scaffold',
          subpartCoverageLabels: missingSections.map((section) =>
            section.match(/^\(([ivx]+|[a-h])\)/i)?.[1]?.toLowerCase(),
          ),
        },
        validationErrors: [
          ...draft.validationErrors,
          '部分小问来自文本层骨架补齐，需人工核对 PDF 视觉内容',
        ],
      }),
    );
  });
}

function isLikelyPdfInstructionDraft(draft: NotebookProblemImportDraft): boolean {
  const title = draft.title.toLowerCase();
  const stem = problemStemText(draft).toLowerCase();
  const text = `${title}\n${stem}`;
  const instructionSignals = [
    'scantron',
    'multiple choice exam instructions',
    'exam instructions',
    'dark pencil',
    'erasable ink',
    'bubbles are completely filled',
    'academic integrity',
    'additional work',
    'will not be marked',
    'cover page',
  ];
  const hasProblemAction = /\b(?:prove|show|find|determine|compute|define|calculate|solve)\b/i.test(
    stem,
  );
  return instructionSignals.some((signal) => text.includes(signal)) && !hasProblemAction;
}

function scaffoldIndexOf(draft: NotebookProblemImportDraft): number | null {
  const value = draft.sourceMeta.scaffoldIndex;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function difficultyRank(difficulty: NotebookProblemImportDraft['difficulty']): number {
  if (difficulty === 'hard') return 3;
  if (difficulty === 'medium') return 2;
  return 1;
}

function hardestDifficulty(
  drafts: NotebookProblemImportDraft[],
): NotebookProblemImportDraft['difficulty'] {
  return drafts.reduce(
    (current, draft) =>
      difficultyRank(draft.difficulty) > difficultyRank(current) ? draft.difficulty : current,
    'easy' as NotebookProblemImportDraft['difficulty'],
  );
}

function mergeableDuplicateScaffoldGroup(drafts: NotebookProblemImportDraft[]): boolean {
  return (
    drafts.length > 1 &&
    drafts.every(
      (draft) =>
        draft.publicContent.type === 'short_answer' ||
        draft.publicContent.type === 'proof' ||
        draft.publicContent.type === 'calculation',
    )
  );
}

function mergedOpenResponseType(
  drafts: NotebookProblemImportDraft[],
): 'short_answer' | 'proof' | 'calculation' {
  if (drafts.some((draft) => draft.type === 'proof')) return 'proof';
  if (drafts.some((draft) => draft.type === 'calculation')) return 'calculation';
  return 'short_answer';
}

function openResponsePublicContent(
  type: 'short_answer' | 'proof' | 'calculation',
  stem: string,
): NotebookProblemImportDraft['publicContent'] {
  if (type === 'proof') return { type, stem };
  if (type === 'calculation') return { type, stem };
  return { type, stem };
}

function mergeOpenResponseGrading(
  type: 'short_answer' | 'proof' | 'calculation',
): NotebookProblemImportDraft['grading'] {
  if (type === 'proof') return { type };
  if (type === 'calculation') return { type, acceptedForms: [] };
  return { type };
}

function mergeDuplicateScaffoldGroup(
  drafts: NotebookProblemImportDraft[],
): NotebookProblemImportDraft {
  const first = drafts[0]!;
  const type = mergedOpenResponseType(drafts);
  const subpartLabels = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
  const stem = drafts
    .map((draft, index) => {
      const label = subpartLabels[index] ?? String(index + 1);
      const stem = problemStemText(draft).trim();
      return stemHasSubpartLabel(stem, label) ? stem : `(${label}) ${stem}`;
    })
    .join('\n\n');
  const scaffoldIndex = scaffoldIndexOf(first);
  return normalizeDraftMathFields(
    notebookProblemImportDraftSchema.parse({
      ...first,
      title: scaffoldIndex ? `Question ${scaffoldIndex}` : first.title,
      type,
      points: drafts.reduce((sum, draft) => sum + draft.points, 0),
      tags: Array.from(new Set(drafts.flatMap((draft) => draft.tags))).slice(0, 16),
      difficulty: hardestDifficulty(drafts),
      publicContent: openResponsePublicContent(type, stem),
      grading: mergeOpenResponseGrading(type),
      sourceMeta: {
        ...first.sourceMeta,
        mergedDuplicateScaffoldIndex: scaffoldIndex,
        mergedDraftIds: drafts.map((draft) => draft.draftId),
        mergedTitles: drafts.map((draft) => draft.title),
      },
      validationErrors: Array.from(new Set(drafts.flatMap((draft) => draft.validationErrors))),
    }),
  );
}

function postProcessPdfFileDrafts(
  drafts: NotebookProblemImportDraft[],
): NotebookProblemImportDraft[] {
  const filtered = drafts.filter((draft) => !isLikelyPdfInstructionDraft(draft));
  const merged: NotebookProblemImportDraft[] = [];
  for (let index = 0; index < filtered.length; index += 1) {
    const draft = filtered[index];
    const scaffoldIndex = scaffoldIndexOf(draft);
    if (scaffoldIndex == null) {
      merged.push(draft);
      continue;
    }

    const group = [draft];
    let cursor = index + 1;
    while (cursor < filtered.length && scaffoldIndexOf(filtered[cursor]) === scaffoldIndex) {
      group.push(filtered[cursor]);
      cursor += 1;
    }

    if (mergeableDuplicateScaffoldGroup(group)) {
      merged.push(mergeDuplicateScaffoldGroup(group));
      index = cursor - 1;
    } else {
      merged.push(...group);
      index = cursor - 1;
    }
  }

  return merged.map((draft, index) => ({
    ...draft,
    sourceMeta: {
      ...draft.sourceMeta,
      draftIndex: index,
    },
  }));
}

function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function expandChoiceOptions(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  return Object.entries(value as Record<string, unknown>).map(([id, label]) => {
    if (label && typeof label === 'object' && !Array.isArray(label)) {
      return { id, ...(label as Record<string, unknown>) };
    }
    return { id, label };
  });
}

function looksLikeSingleProblemInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return heuristicExtractProblemDrafts(trimmed, 'manual').length === 1;
}

function normalizeRawCandidate(
  raw: unknown,
  source: NotebookProblemSource,
): Record<string, unknown> {
  const base =
    typeof raw === 'object' && raw
      ? ({ ...raw } as Record<string, unknown>)
      : ({ title: String(raw ?? '') } as Record<string, unknown>);
  const type = typeof base.type === 'string' ? base.type : 'short_answer';

  const publicContent =
    typeof base.publicContent === 'object' && base.publicContent
      ? ({ ...(base.publicContent as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  publicContent.type = type;

  const grading =
    typeof base.grading === 'object' && base.grading
      ? ({ ...(base.grading as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  grading.type = type;
  const validationErrors = Array.isArray(base.validationErrors)
    ? base.validationErrors.map((error) => String(error ?? '').trim()).filter(Boolean)
    : [];
  const expandedPublicOptions = expandChoiceOptions(publicContent.options);
  if (expandedPublicOptions) {
    publicContent.options = expandedPublicOptions;
  }

  if (
    publicContent.stem == null &&
    pickFirstString(
      publicContent.stem,
      publicContent.statement,
      publicContent.question,
      publicContent.prompt,
      publicContent.description,
      base.stem,
      base.statement,
      base.question,
      base.prompt,
      base.description,
    ) &&
    (type === 'short_answer' ||
      type === 'choice' ||
      type === 'proof' ||
      type === 'calculation' ||
      type === 'code')
  ) {
    publicContent.stem = pickFirstString(
      publicContent.stem,
      publicContent.statement,
      publicContent.question,
      publicContent.prompt,
      publicContent.description,
      base.stem,
      base.statement,
      base.question,
      base.prompt,
      base.description,
    );
  }

  if (typeof publicContent.stem === 'string') {
    publicContent.stem = normalizeMathMarkdown(publicContent.stem);
  }

  if (
    publicContent.stemTemplate == null &&
    pickFirstString(
      publicContent.stemTemplate,
      publicContent.statement,
      publicContent.question,
      base.stemTemplate,
      base.statement,
      base.question,
    ) &&
    type === 'fill_blank'
  ) {
    publicContent.stemTemplate = pickFirstString(
      publicContent.stemTemplate,
      publicContent.statement,
      publicContent.question,
      base.stemTemplate,
      base.statement,
      base.question,
    );
  }

  if (typeof publicContent.stemTemplate === 'string') {
    publicContent.stemTemplate = normalizeMathMarkdown(publicContent.stemTemplate);
  }

  if (
    type === 'choice' &&
    (!Array.isArray(publicContent.options) || publicContent.options.length === 0) &&
    expandChoiceOptions(base.options)
  ) {
    publicContent.options = expandChoiceOptions(base.options)?.map((option, index) => {
      if (typeof option === 'string') {
        return { id: String.fromCharCode(65 + index), label: option.trim() };
      }
      if (option && typeof option === 'object') {
        const row = option as Record<string, unknown>;
        const singleEntry =
          !pickFirstString(row.id, row.value, row.key, row.label, row.text) &&
          Object.keys(row).length === 1
            ? Object.entries(row)[0]
            : null;
        const id =
          pickFirstString(row.id, row.value, row.key, singleEntry?.[0]) ||
          String.fromCharCode(65 + index);
        const label = pickFirstString(row.label, row.text, singleEntry?.[1], row.value) || id;
        return { id, label };
      }
      return { id: String.fromCharCode(65 + index), label: String(option ?? '').trim() };
    });
  }

  if (Array.isArray(publicContent.options)) {
    publicContent.options = publicContent.options.map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String.fromCharCode(65 + index),
          label: normalizeMathMarkdown(option),
        };
      }
      if (!option || typeof option !== 'object') return option;
      const row = option as Record<string, unknown>;
      const singleEntry =
        !pickFirstString(row.id, row.value, row.key, row.label, row.text) &&
        Object.keys(row).length === 1
          ? Object.entries(row)[0]
          : null;
      return {
        id:
          pickFirstString(row.id, row.value, row.key, singleEntry?.[0]) ||
          String.fromCharCode(65 + index),
        label: normalizeMathMarkdown(
          pickFirstString(row.label, row.text, singleEntry?.[1], row.value) ||
            String.fromCharCode(65 + index),
        ),
      };
    });
  }

  if (Array.isArray(grading.rubric)) {
    grading.rubric = normalizeRubricValue(grading.rubric);
  }

  if (typeof publicContent.explanation === 'string') {
    publicContent.explanation = normalizeMathMarkdown(publicContent.explanation);
  }
  if (typeof grading.referenceAnswer === 'string') {
    grading.referenceAnswer = normalizeMathMarkdown(grading.referenceAnswer);
  }
  if (typeof grading.referenceProof === 'string') {
    grading.referenceProof = normalizeMathMarkdown(grading.referenceProof);
  }
  if (typeof grading.rubric === 'string') {
    grading.rubric = normalizeMathMarkdown(grading.rubric);
  }
  if (typeof grading.analysis === 'string') {
    grading.analysis = normalizeMathMarkdown(grading.analysis);
  }
  if (Array.isArray(grading.acceptedForms)) {
    grading.acceptedForms = grading.acceptedForms.map((item) =>
      typeof item === 'string' ? normalizeMathMarkdown(item) : item,
    );
  }

  if (type === 'short_answer' || type === 'calculation') {
    if (
      grading.referenceAnswer == null &&
      pickFirstString(
        grading.referenceAnswer,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { answer?: unknown }).answer,
        (base as { referenceAnswer?: unknown }).referenceAnswer,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      )
    ) {
      grading.referenceAnswer = pickFirstString(
        grading.referenceAnswer,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { answer?: unknown }).answer,
        (base as { referenceAnswer?: unknown }).referenceAnswer,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      );
    }
  }

  if (type === 'proof') {
    if (
      grading.referenceProof == null &&
      pickFirstString(
        grading.referenceProof,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { proof?: unknown }).proof,
        (base as { referenceProof?: unknown }).referenceProof,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      )
    ) {
      grading.referenceProof = pickFirstString(
        grading.referenceProof,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { proof?: unknown }).proof,
        (base as { referenceProof?: unknown }).referenceProof,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      );
    }
  }

  if (
    type === 'choice' &&
    (!Array.isArray(grading.correctOptionIds) || grading.correctOptionIds.length === 0)
  ) {
    const baseAnswers = Array.isArray((grading as { answer?: unknown[] }).answer)
      ? (grading as { answer: unknown[] }).answer
      : Array.isArray((base as { answer?: unknown[] }).answer)
        ? (base as { answer: unknown[] }).answer
        : [];
    const correctOptionIds = baseAnswers.map((value) => String(value ?? '').trim()).filter(Boolean);
    grading.correctOptionIds = correctOptionIds;
    if (
      correctOptionIds.length === 0 &&
      Array.isArray(publicContent.options) &&
      publicContent.options.length > 0
    ) {
      const firstOption = publicContent.options[0];
      if (firstOption && typeof firstOption === 'object') {
        const fallbackId =
          pickFirstString((firstOption as { id?: unknown }).id) || String(publicContent.options[0]);
        grading.correctOptionIds = [fallbackId];
        if (!validationErrors.some((error) => error.includes('未识别到正确答案'))) {
          validationErrors.push('未识别到正确答案');
        }
      }
    }
  }

  if (type === 'short_answer' || type === 'proof') {
    if (
      publicContent.explanation == null &&
      typeof grading.analysis === 'string' &&
      grading.analysis.trim()
    ) {
      publicContent.explanation = grading.analysis;
    }
  }

  return {
    source,
    draftId: randomUUID(),
    status: 'draft',
    points: 1,
    tags: [],
    difficulty: 'medium',
    sourceMeta: {},
    ...base,
    validationErrors,
    title: normalizeTitle(
      typeof base.title === 'string'
        ? base.title
        : pickFirstString(
            publicContent.stem,
            publicContent.stemTemplate,
            String(base.title ?? ''),
          ) || 'Untitled problem',
      type as NotebookProblemImportDraft['type'],
    ),
    publicContent,
    grading,
  };
}

function formatImportValidationIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function normalizeCandidateDraft(
  raw: unknown,
  source: NotebookProblemSource,
): NotebookProblemImportDraft {
  const parsed = notebookProblemImportDraftSchema.safeParse(normalizeRawCandidate(raw, source));
  if (parsed.success) {
    return stripGeneratedAnswersForNonChoiceDraft(normalizeDraftMathFields(parsed.data));
  }

  const fallbackText =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw && 'title' in raw
        ? String((raw as { title?: unknown }).title || '')
        : JSON.stringify(raw);

  return stripGeneratedAnswersForNonChoiceDraft(
    normalizeDraftMathFields(
      notebookProblemImportDraftSchema.parse({
        draftId: randomUUID(),
        title: normalizeTitle(fallbackText || 'Imported problem', 'short_answer'),
        type: 'short_answer',
        status: 'draft',
        source,
        points: 1,
        tags: [],
        difficulty: inferDifficulty(fallbackText),
        publicContent: {
          type: 'short_answer',
          stem: normalizeMathMarkdown(fallbackText || 'Imported problem'),
        },
        grading: {
          type: 'short_answer',
        },
        sourceMeta: {
          importMode: 'fallback',
          raw,
        },
        validationErrors: formatImportValidationIssues(parsed.error),
      }),
    ),
  );
}

function parseProblemDraftArrayFromLLMText(text: string): unknown[] {
  const raw = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = JSON.parse(jsonrepair(raw)) as unknown;
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { drafts?: unknown }).drafts)
  ) {
    return (parsed as { drafts: unknown[] }).drafts;
  }
  throw new Error('LLM import output is not an array');
}

function summarizeDraftForScaffold(draft: NotebookProblemImportDraft, index: number) {
  return {
    index: index + 1,
    title: draft.title,
    type: draft.type,
    rawText:
      typeof draft.sourceMeta.rawBlock === 'string'
        ? draft.sourceMeta.rawBlock
        : draft.publicContent.type === 'choice'
          ? `${draft.publicContent.stem}\n${draft.publicContent.options
              .map((option) => `${option.id}. ${option.label}`)
              .join('\n')}`
          : 'stem' in draft.publicContent
            ? draft.publicContent.stem
            : 'stemTemplate' in draft.publicContent
              ? draft.publicContent.stemTemplate
              : draft.title,
  };
}

function buildCoverageScaffoldText(drafts: NotebookProblemImportDraft[]): string {
  if (drafts.length === 0) return '';
  return JSON.stringify(drafts.map(summarizeDraftForScaffold)).slice(0, 18000);
}

function withPdfFileSourceMeta(draft: NotebookProblemImportDraft): NotebookProblemImportDraft {
  return {
    ...draft,
    sourceMeta: {
      ...draft.sourceMeta,
      importMode: 'llm-file',
      fileInput: true,
    },
  };
}

function withCoverageFallbackDrafts(args: {
  scaffoldDrafts: NotebookProblemImportDraft[];
  llmDrafts: NotebookProblemImportDraft[];
}): NotebookProblemImportDraft[] {
  if (args.scaffoldDrafts.length === 0) return args.llmDrafts;
  if (args.llmDrafts.length >= args.scaffoldDrafts.length) return args.llmDrafts;

  const existingScaffoldIndexes = new Set(
    args.llmDrafts
      .map(scaffoldIndexOf)
      .filter((index): index is number => typeof index === 'number'),
  );
  const fallbackSourceDrafts =
    existingScaffoldIndexes.size > 0
      ? args.scaffoldDrafts.filter(
          (draft, index) => !existingScaffoldIndexes.has(scaffoldIndexOf(draft) ?? index + 1),
        )
      : args.scaffoldDrafts.slice(args.llmDrafts.length);
  const neededCount = args.scaffoldDrafts.length - args.llmDrafts.length;
  const fallbackDrafts = fallbackSourceDrafts.slice(0, neededCount).map((draft) =>
    normalizeDraftMathFields({
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        importMode: 'llm-file',
        fileInput: true,
        coverageFallback: 'text-layer-scaffold',
        coverageFallbackReason: `PDF 模型只返回 ${args.llmDrafts.length}/${args.scaffoldDrafts.length} 道题，仅用文本层题块骨架补齐缺失题。`,
      },
      validationErrors: [
        ...draft.validationErrors,
        '模型未直接生成此题，已用文本层骨架补齐，需人工核对 PDF 视觉内容',
      ],
    }),
  );

  return [...args.llmDrafts, ...fallbackDrafts].sort((left, right) => {
    const leftIndex = scaffoldIndexOf(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = scaffoldIndexOf(right) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

function mergeImportUsage(
  current: ImportUsageSummary | null,
  next: ImportUsageSummary | null,
): ImportUsageSummary | null {
  if (!current) return next;
  if (!next) return current;
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    estimatedCostCredits:
      current.estimatedCostCredits == null || next.estimatedCostCredits == null
        ? null
        : current.estimatedCostCredits + next.estimatedCostCredits,
  };
}

function llmUsageFromResult(args: {
  model: LanguageModel;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}): ImportUsageSummary | null {
  if (args.inputTokens <= 0 && args.outputTokens <= 0) return null;
  return {
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cachedInputTokens: args.cachedInputTokens,
    estimatedCostCredits: estimateOpenAITextUsageRetailCostCredits({
      modelString:
        typeof args.model === 'object' && 'modelId' in args.model
          ? String((args.model as { modelId?: unknown }).modelId ?? '')
          : undefined,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cachedInputTokens: args.cachedInputTokens,
    }),
  };
}

function isMissingChoiceAnswerDraft(draft: NotebookProblemImportDraft): boolean {
  return (
    draft.type === 'choice' &&
    draft.publicContent.type === 'choice' &&
    draft.grading.type === 'choice' &&
    (draft.validationErrors.some((error) => error.includes('未识别到正确答案')) ||
      draft.grading.correctOptionIds.length === 0)
  );
}

function removeMissingAnswerValidationErrors(errors: string[]): string[] {
  return errors.filter((error) => !error.includes('未识别到正确答案'));
}

function parseChoiceAnswerResults(text: string): Array<{
  draftId: string;
  correctOptionIds: string[];
  analysis?: string;
  confidence?: number;
}> {
  const raw = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = JSON.parse(jsonrepair(raw)) as unknown;
  }
  const rows =
    Array.isArray(parsed) ||
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { answers?: unknown }).answers)
      ? parsed
      : (parsed as { answers: unknown[] }).answers;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const draftId = typeof record.draftId === 'string' ? record.draftId.trim() : '';
      const rawAnswers = Array.isArray(record.correctOptionIds)
        ? record.correctOptionIds
        : typeof record.correctOptionId === 'string'
          ? [record.correctOptionId]
          : typeof record.answer === 'string'
            ? [record.answer]
            : Array.isArray(record.answers)
              ? record.answers
              : [];
      const correctOptionIds = rawAnswers
        .map((answer) => String(answer ?? '').trim())
        .filter(Boolean);
      const analysis = typeof record.analysis === 'string' ? record.analysis.trim() : undefined;
      const confidence = typeof record.confidence === 'number' ? record.confidence : undefined;
      if (!draftId || correctOptionIds.length === 0) return null;
      return { draftId, correctOptionIds, analysis, confidence };
    })
    .filter(Boolean) as Array<{
    draftId: string;
    correctOptionIds: string[];
    analysis?: string;
    confidence?: number;
  }>;
}

async function solveMissingChoiceAnswersWithLLM(args: {
  drafts: NotebookProblemImportDraft[];
  model?: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{ drafts: NotebookProblemImportDraft[]; usage: ImportUsageSummary | null }> {
  if (!args.model) return { drafts: args.drafts, usage: null };
  const candidates = args.drafts.filter(isMissingChoiceAnswerDraft);
  if (candidates.length === 0) return { drafts: args.drafts, usage: null };

  const prompt =
    args.language === 'zh-CN'
      ? `请解答下面这些选择题，并返回严格 JSON，不要 markdown。
返回格式：
[
  {
    "draftId": "原 draftId",
    "correctOptionIds": ["A"],
    "analysis": "简短说明为什么选择这些选项",
    "confidence": 0.0 到 1.0
  }
]
要求：
- 必须只使用题干和选项中已有的信息作答。
- 如果是多选题，可以返回多个选项 id。
- 如果缺少图、表、front page、Diagram、Table 等关键上下文，无法可靠解答，则不要返回该题的答案。
- 不要为了满足格式而猜测。

题目：
${JSON.stringify(
  candidates.map((draft) => ({
    draftId: draft.draftId,
    title: draft.title,
    stem: draft.publicContent.type === 'choice' ? draft.publicContent.stem : '',
    selectionMode:
      draft.publicContent.type === 'choice' ? draft.publicContent.selectionMode : 'single',
    options:
      draft.publicContent.type === 'choice'
        ? draft.publicContent.options.map((option) => ({
            id: option.id,
            label: option.label,
          }))
        : [],
  })),
)}`.slice(0, 24000)
      : `Solve the following multiple-choice questions and return strict JSON only.
Return shape:
[
  {
    "draftId": "original draftId",
    "correctOptionIds": ["A"],
    "analysis": "brief reason for the selected option ids",
    "confidence": 0.0 to 1.0
  }
]
Rules:
- Use only the information already present in the stem and options.
- Return multiple option ids for multiple-select questions when appropriate.
- If critical context is missing, such as a table, diagram, front page, or referenced visual, do not return an answer for that question.
- Do not guess just to satisfy the schema.

Questions:
${JSON.stringify(
  candidates.map((draft) => ({
    draftId: draft.draftId,
    title: draft.title,
    stem: draft.publicContent.type === 'choice' ? draft.publicContent.stem : '',
    selectionMode:
      draft.publicContent.type === 'choice' ? draft.publicContent.selectionMode : 'single',
    options:
      draft.publicContent.type === 'choice'
        ? draft.publicContent.options.map((option) => ({
            id: option.id,
            label: option.label,
          }))
        : [],
  })),
)}`.slice(0, 24000);

  let result: Awaited<ReturnType<typeof callLLM>>;
  try {
    result = await callLLM(
      {
        model: args.model,
        system:
          args.language === 'zh-CN'
            ? '你是严谨的大学数学/计算机课程助教。你的任务是解选择题并返回机器可解析 JSON。'
            : 'You are a rigorous university math/computer-science teaching assistant. Solve multiple-choice questions and return machine-readable JSON.',
        prompt,
      },
      'problem-bank-import-answer-solve',
    );
  } catch {
    return { drafts: args.drafts, usage: null };
  }

  let answers: ReturnType<typeof parseChoiceAnswerResults>;
  try {
    answers = parseChoiceAnswerResults(result.text);
  } catch {
    answers = [];
  }
  if (answers.length === 0) {
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
    return {
      drafts: args.drafts,
      usage: llmUsageFromResult({
        model: args.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
      }),
    };
  }

  const answerByDraftId = new Map(answers.map((answer) => [answer.draftId, answer]));
  const solvedDrafts = args.drafts.map((draft) => {
    if (
      draft.type !== 'choice' ||
      draft.publicContent.type !== 'choice' ||
      draft.grading.type !== 'choice'
    ) {
      return draft;
    }
    const answer = answerByDraftId.get(draft.draftId);
    if (!answer) return draft;
    const validOptionIds = new Set(draft.publicContent.options.map((option) => option.id));
    const correctOptionIds = answer.correctOptionIds.filter((optionId) =>
      validOptionIds.has(optionId),
    );
    if (correctOptionIds.length === 0) return draft;
    return normalizeDraftMathFields({
      ...draft,
      publicContent: {
        ...draft.publicContent,
        selectionMode: correctOptionIds.length > 1 ? 'multiple' : draft.publicContent.selectionMode,
      },
      grading: {
        ...draft.grading,
        correctOptionIds,
        analysis: answer.analysis ? normalizeMathMarkdown(answer.analysis) : draft.grading.analysis,
      },
      sourceMeta: {
        ...draft.sourceMeta,
        answerSource: 'llm-solved',
        answerConfidence: answer.confidence ?? null,
      },
      validationErrors: removeMissingAnswerValidationErrors(draft.validationErrors),
    });
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  return {
    drafts: solvedDrafts,
    usage: llmUsageFromResult({
      model: args.model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
    }),
  };
}

function buildProblemImportSystemPrompt(language: 'zh-CN' | 'en-US'): string {
  return language === 'zh-CN'
    ? `你是大学课程题库抽取助手。请把输入材料拆成一组题目草稿，并返回严格 JSON 数组，不要返回 markdown。
每个数组元素都必须尽量贴近以下结构：
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "sourceMeta": {...optional...},
  "validationErrors": string[]
}
要求：
- 尽量把题目拆细，一题一个对象
- 不要把同一道证明题 / 同一道复合题硬拆成多条草稿，除非原文明确编号成独立小题，或这些小题本身就是彼此独立可作答的问题
- title 必须是简洁、稳定、概念导向的题目名，优先概括知识点与任务，不要直接复制整句题面，不要把公式原样塞进 title
- 每道题的 publicContent 必须能独立作答；不要只写“见上表 / 见图 / front page / Table I / Diagram II”
- 如果题目依赖表格、真值表、步骤表或定义表，必须把表格用 markdown 表格写入 stem
- 如果题目依赖一组定义、步骤或条件，必须用 markdown 列表写入 stem；不要写成 “Definitions included are: - ... - ...” 这种单段文本
- 如果题目依赖关系图，优先把图转写成边/箭头/邻接关系列表或表格，写入 stem
- choice 题必须拆出 publicContent.options 与 grading.correctOptionIds
- publicContent.options 必须是数组，形如 [{"id":"A","label":"完整选项文本"}, ...]；label 必须是完整可作答的选项内容，绝不能只写 "A" / "B" / "C" 这样的字母
- 只有 choice 题需要生成答案：如果来源没有答案表，请你根据题干和选项自行解题，把推断出的正确答案写入 correctOptionIds，并在 sourceMeta.answerSource 写 "llm-solved"
- 非 choice 题不要生成答案：proof / short_answer / calculation / code 等文字作答题不要输出 referenceProof、referenceAnswer、analysis、非空 acceptedForms 或模型自写解答
- 非 choice 题的 grading 保持最小结构；proof/short_answer 用 {"type": "..."}，calculation 用 {"type":"calculation","acceptedForms":[]}，code 只保留必要的测试/发布字段
- 只有在题干缺少图表/前文等关键上下文、无法可靠解答时，才使用第一个选项 id 作为 schema 占位，并在 validationErrors 加入“未识别到正确答案”
- code 题默认 language=python
- 如果 code 题缺少 function signature / public tests / secret tests，也要保留，但写入 validationErrors
- 直接输出 LaTeX 数学源码：行内数学使用 $...$，较长或独立公式使用 $$...$$
- publicContent / grading / choice option label 里的所有数学都必须包在 LaTeX delimiter 中
- 不要输出裸数学、Unicode 数学符号或纯文本数学命令；例如不要写 "A ⊆ X"、"leq"、"subseteq"、"f: X → Y"，要写 "$A \\subseteq X$"、"$\\leq$"、"$\\subseteq$"、"$f: X \\to Y$"
- 不要把已经是 LaTeX 的数学再额外用普通括号包起来
- 不要为非 choice 题臆造答案；只有选择题在题干和选项足以解题时才给出模型推断答案`
    : `You are a university problem-bank extraction assistant. Convert the source material into an array of problem drafts and return strict JSON only.
Each item should follow this shape as closely as possible:
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "sourceMeta": {...optional...},
  "validationErrors": string[]
}
Requirements:
- split into one object per problem when possible
- do not split one proof / one compound problem into multiple drafts unless the source explicitly numbers them as separate questions or they can be solved independently
- title must be concise, concept-focused, and stable; summarize the topic/task instead of copying the whole stem, and avoid dumping raw formulas into the title
- every publicContent item must be independently answerable; do not leave references like "see above", "front page", "Table I", or "Diagram II" without the referenced content
- if a problem depends on a table, truth table, step table, or definition table, include that table in stem as a markdown table
- if a problem depends on definitions, steps, or conditions, include them in stem as a markdown list; never write one flat paragraph like "Definitions included are: - ... - ..."
- if a problem depends on a diagram, rewrite it as an edge/arrow/adjacency list or table inside stem when possible
- choice problems must include publicContent.options and grading.correctOptionIds
- publicContent.options must be an array like [{"id":"A","label":"full option text"}, ...]; label must be the complete answer choice text and must never be only "A" / "B" / "C" / the option id
- only choice problems need generated answers: if the source has no answer key, solve the problem from the stem/options, write the inferred answer to correctOptionIds, and set sourceMeta.answerSource to "llm-solved"
- do not generate answers for non-choice problems: proof / short_answer / calculation / code and other written-response problems must not include referenceProof, referenceAnswer, analysis, non-empty acceptedForms, or model-written solutions
- keep non-choice grading minimal; use {"type":"proof"} / {"type":"short_answer"} for proof and short answer, {"type":"calculation","acceptedForms":[]} for calculation, and only necessary test/publish fields for code
- only if critical context is missing and the answer cannot be solved reliably, use the first option id as a schema placeholder and add "未识别到正确答案" to validationErrors
- code problems default to python
- if code problems miss function signature / public tests / secret tests, keep them as drafts and add validationErrors
- Output LaTeX math source directly: use $...$ for inline math and $$...$$ for long or standalone formulas
- every mathematical expression in publicContent / grading text / choice option labels must be wrapped in LaTeX delimiters
- do not emit bare math, Unicode math symbols, or plain-text math commands; for example, never write "A ⊆ X", "leq", "subseteq", or "f: X → Y"; write "$A \\subseteq X$", "$\\leq$", "$\\subseteq$", and "$f: X \\to Y$"
- do not wrap LaTeX math in additional ordinary prose parentheses
- do not invent answers for non-choice problems; only provide model-inferred answers for choice questions when the stem/options are sufficient`;
}

async function llmExtractProblemDrafts(args: {
  text: string;
  source: NotebookProblemSource;
  model: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const system = buildProblemImportSystemPrompt(args.language);

  const prompt = `${args.language === 'zh-CN' ? '来源类型' : 'Source'}: ${args.source}

${args.language === 'zh-CN' ? '原始材料' : 'Raw material'}:
${args.text}`.slice(0, 24000);

  const result = await callLLM(
    {
      model: args.model,
      system,
      prompt,
      maxOutputTokens: 16000,
    },
    'problem-bank-import-preview',
  );
  const parsed = parseProblemDraftArrayFromLLMText(result.text);
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  const drafts = parsed.map((item) => normalizeCandidateDraft(item, args.source));
  const answerResult = await solveMissingChoiceAnswersWithLLM({
    drafts,
    model: args.model,
    language: args.language,
  });
  return {
    drafts: answerResult.drafts,
    usage: mergeImportUsage(
      llmUsageFromResult({
        model: args.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
      }),
      answerResult.usage,
    ),
  };
}

export async function extractProblemDraftsFromPdfFile(args: {
  pdfBuffer: Buffer;
  fileName: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model: LanguageModel;
  scaffoldText?: string;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  if (args.pdfBuffer.length === 0) return { drafts: [], usage: null };

  const scaffoldSourceText = args.scaffoldText?.trim()
    ? trimPdfScaffoldTextToProblemRegion(args.scaffoldText)
    : '';
  const scaffoldDrafts = scaffoldSourceText
    ? heuristicExtractProblemDrafts(scaffoldSourceText, args.source)
        .filter((draft) => !isLikelyPdfInstructionDraft(draft))
        .map((draft, index) => ({
          ...draft,
          sourceMeta: {
            ...draft.sourceMeta,
            scaffoldIndex: index + 1,
          },
        }))
    : [];
  const coverageScaffold = buildCoverageScaffoldText(scaffoldDrafts);
  const system = buildProblemImportSystemPrompt(args.language);
  const instruction =
    args.language === 'zh-CN'
      ? `请直接阅读附加的 PDF 文件并抽取题目草稿。
特别注意：
- 不要只依赖 PDF 的隐藏文本层；请按页面视觉排版理解题目、表格、图和数学公式。
- 尽量忠实转写每道题的完整题干和选项，不要摘要化、不要省略定义、步骤、表格或图的信息。
- 生成后的每道题必须能独立作答；如果没有被引用的上下文，就不算合格题目。
- 忽略封面、考试说明、academic integrity、scantron/答题卡说明、空白页和 additional work 页面；这些不是题目。
- 顶层编号题目才是一道题。不要把 (i)/(ii)/(a)/(b) 子问拆成多道题；子问必须保留在同一道 publicContent.stem 里。
- 如果题目出现 “statements above”, “following steps”, “Table I”, “Diagram II”, “front page”, “above” 等引用，请把被引用的定义、步骤、表格或图关系重写进同一道题的 publicContent.stem，保证题目导入后可以独立作答。
- 表格/真值表/步骤表必须用 markdown 表格写入 stem；定义、步骤、条件必须用 markdown 列表写入 stem。
- 不要输出 “Definitions included are: - ... - ...” 这种单段文本；要换行成列表或表格。
- 如果无法可靠重写图表上下文，请在 validationErrors 加入“缺少图表上下文”。
- 对选择题，必须保留 A/B/C/D/E 等选项 id，不要合并选项。
- 选项必须写成 publicContent.options 数组；每个 label 必须是完整选项文本，不能只填 A/B/C/D/E。
- 只有选择题需要答案字段。对选择题，如果 PDF 没有答案表，请根据题干和选项自行解题，把推断出的正确答案写入 grading.correctOptionIds，并在 sourceMeta.answerSource 写 "llm-solved"。
- 非选择题不要生成答案。proof / short_answer / calculation / code 等文字作答题不要输出 referenceProof、referenceAnswer、analysis、非空 acceptedForms 或模型自写解答。
- 非选择题的 grading 保持最小结构；proof/short_answer 用 {"type":"..."}，calculation 用 {"type":"calculation","acceptedForms":[]}，code 只保留必要的测试/发布字段。
- 这次测试重点是“模型直接生成 LaTeX”：题干、选项、评分解析中的所有数学表达式都必须直接输出 LaTeX 源码，并用 $...$ 或 $$...$$ 包起来。
- 不要输出 Unicode 数学符号或纯文本数学命令；例如不要写 "⊆"、"→"、"≤"、"leq"、"subseteq"，要写 "\\subseteq"、"\\to"、"\\leq"。
- 对分式、根号、集合、函数、逻辑符号等数学内容，尽量输出可渲染的 LaTeX/markdown 数学；分式请优先使用 \\frac{...}{...}，上标请用 ^{...}。
- 不要用普通括号包数学表达式，例如不要输出 "( f: X o Y )"、"( A subseteq X )"、"( |B| leq |C| )"；必须输出 "$f: X \\to Y$"、"$A \\subseteq X$"、"$|B| \\leq |C|$"。
- 不要为非选择题臆造答案或参考解。
- 只有在缺少图表/前文等关键上下文、无法可靠解答时，才使用第一个选项作为 schema 占位，并写 validationErrors: ["未识别到正确答案"]。
${
  coverageScaffold
    ? `
覆盖率骨架（来自 PDF 文本层，只用于保证不漏题；最终题干仍以 PDF 视觉内容为准）：
- 你必须输出正好 ${scaffoldDrafts.length} 道题。
- 输出顺序必须与骨架一致。
- 每道题 sourceMeta.scaffoldIndex 必须等于骨架 index。
- 如果你无法从视觉 PDF 补全某题，也必须保留该题，并在 validationErrors 写明缺失上下文。
${coverageScaffold}`
    : ''
}`
      : `Read the attached PDF file directly and extract problem drafts.
Pay special attention:
- Do not rely only on the hidden PDF text layer; use the visible page layout for problems, tables, diagrams, and mathematical notation.
- Transcribe each problem stem and option faithfully. Do not summarize, shorten, or omit definitions, steps, tables, diagrams, or referenced context.
- Every generated problem must be independently answerable; without referenced context, it is not a valid imported problem.
- Ignore cover pages, exam instructions, academic integrity text, scantron/answer-sheet instructions, blank pages, and additional-work pages; they are not problems.
- A top-level numbered question is one problem. Do not split subparts such as (i)/(ii)/(a)/(b) into separate drafts; keep all subparts inside the same publicContent.stem.
- If a problem says "statements above", "following steps", "Table I", "Diagram II", "front page", "above", or similar, rewrite the referenced definitions, steps, table, or diagram relationships into that same publicContent.stem so the imported problem is self-contained.
- Tables, truth tables, and step tables must be written in stem as markdown tables. Definitions, steps, and conditions must be written as markdown lists.
- Never output a flat paragraph like "Definitions included are: - ... - ..."; use a real markdown list or table with line breaks.
- If you cannot reliably rewrite referenced visual context, add "缺少图表上下文" to validationErrors.
- For choice questions, preserve option ids such as A/B/C/D/E and do not merge options.
- Options must be publicContent.options arrays; each label must be the complete option text, not just A/B/C/D/E.
- Only choice questions need answer fields. For choice questions, if the PDF has no answer key, solve from the stem/options, write the inferred answer to grading.correctOptionIds, and set sourceMeta.answerSource to "llm-solved".
- Do not generate answers for non-choice problems. Proof / short-answer / calculation / code and other written-response problems must not include referenceProof, referenceAnswer, analysis, non-empty acceptedForms, or model-written solutions.
- Keep non-choice grading minimal; use {"type":"proof"} / {"type":"short_answer"} for proof and short answer, {"type":"calculation","acceptedForms":[]} for calculation, and only necessary test/publish fields for code.
- This test is LaTeX-first: all mathematical expressions in stems, options, grading text, and analyses must be emitted directly as LaTeX source wrapped in $...$ or $$...$$.
- Do not emit Unicode math symbols or plain-text math commands; for example, do not write "⊆", "→", "≤", "leq", or "subseteq"; write "\\subseteq", "\\to", and "\\leq".
- For fractions, radicals, sets, functions, logic symbols, and other math, output renderable LaTeX/markdown math whenever possible; prefer \\frac{...}{...} for fractions and ^{...} for exponents.
- Do not wrap math in ordinary prose parentheses. Never output "( f: X o Y )", "( A subseteq X )", or "( |B| leq |C| )"; output "$f: X \\to Y$", "$A \\subseteq X$", and "$|B| \\leq |C|$" instead.
- Do not invent answers or reference solutions for non-choice problems.
- Only if critical context is missing and the answer cannot be solved reliably, use the first option as the schema placeholder and set validationErrors: ["未识别到正确答案"].
${
  coverageScaffold
    ? `
Coverage scaffold from the PDF text layer. Use it only to guarantee no problem is omitted; final stems should still be based on the visible PDF:
- You must output exactly ${scaffoldDrafts.length} problems.
- Output order must match the scaffold order.
- Each item must set sourceMeta.scaffoldIndex to the scaffold index.
- If you cannot visually recover a problem, keep that problem and record the missing context in validationErrors.
${coverageScaffold}`
    : ''
}`;

  const result = await callLLM(
    {
      model: args.model,
      system,
      maxOutputTokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: instruction,
            },
            {
              type: 'file',
              data: args.pdfBuffer,
              mediaType: 'application/pdf',
              filename: args.fileName,
            },
          ],
        },
      ],
    },
    'problem-bank-import-preview',
  );

  const parsed = parseProblemDraftArrayFromLLMText(result.text);
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  const llmDrafts = postProcessPdfFileDrafts(
    parsed.map((item) => withPdfFileSourceMeta(normalizeCandidateDraft(item, args.source))),
  );
  const drafts = withCoverageFallbackDrafts({
    scaffoldDrafts,
    llmDrafts: withScaffoldSubpartCoverage({ scaffoldDrafts, llmDrafts }),
  });
  const answerResult = await solveMissingChoiceAnswersWithLLM({
    drafts,
    model: args.model,
    language: args.language,
  });
  return {
    drafts: answerResult.drafts,
    usage: mergeImportUsage(
      llmUsageFromResult({
        model: args.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
      }),
      answerResult.usage,
    ),
  };
}

export async function extractProblemDraftsFromText(args: {
  text: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model?: LanguageModel;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const trimmed = args.text.trim();
  if (!trimmed) return { drafts: [], usage: null };
  const heuristicDrafts = heuristicExtractProblemDrafts(trimmed, args.source);
  const hasStructuredChoiceBlocks =
    /\bMC\s*\d+[\.\)]?\s+/i.test(trimmed) && heuristicDrafts.length >= 2;
  const hasCompleteHeuristicChoiceDrafts =
    hasStructuredChoiceBlocks &&
    heuristicDrafts.every(
      (draft) =>
        draft.type === 'choice' &&
        draft.publicContent.type === 'choice' &&
        draft.publicContent.options.length >= 2,
    );
  const withSolvedChoiceAnswers = async (
    drafts: NotebookProblemImportDraft[],
    usage: ImportUsageSummary | null,
  ) => {
    const answerResult = await solveMissingChoiceAnswersWithLLM({
      drafts,
      model: args.model,
      language: args.language,
    });
    return {
      drafts: answerResult.drafts,
      usage: mergeImportUsage(usage, answerResult.usage),
    };
  };

  if (hasCompleteHeuristicChoiceDrafts) {
    return withSolvedChoiceAnswers(heuristicDrafts, null);
  }

  if (args.model) {
    try {
      const llmInput =
        heuristicDrafts.length > 1
          ? heuristicDrafts
              .map((draft) =>
                typeof draft.sourceMeta.rawBlock === 'string' ? draft.sourceMeta.rawBlock : '',
              )
              .filter(Boolean)
              .join('\n\n')
          : trimmed;
      const llmResult = await llmExtractProblemDrafts({
        text: llmInput,
        source: args.source,
        model: args.model,
        language: args.language,
      });
      if (llmResult.drafts.length > 0) {
        if (hasStructuredChoiceBlocks && heuristicDrafts.length >= llmResult.drafts.length) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        if (
          hasStructuredChoiceBlocks &&
          llmResult.drafts.length < Math.max(2, Math.floor(heuristicDrafts.length * 0.7))
        ) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        if (
          heuristicDrafts.length === 1 &&
          llmResult.drafts.length > 1 &&
          llmResult.drafts.some((draft) => draft.validationErrors.length > 0) &&
          looksLikeSingleProblemInput(trimmed)
        ) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        return llmResult;
      }
    } catch {
      // fall back to heuristic extraction below
    }
  }

  return {
    ...(await withSolvedChoiceAnswers(heuristicDrafts, null)),
  };
}
