import { randomUUID } from 'node:crypto';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import {
  cleanExtractedTextArtifacts,
  detectTextLocale,
  MATH_SYMBOL_PATTERN,
  normalizeMathMarkdown,
  normalizeWhitespace,
  sanitizeChoiceOptionLabel,
  TOP_LEVEL_QUESTION_START_PATTERN,
  TOP_LEVEL_QUESTION_START_RE,
} from './import.core.text';

export function stripMathForTitle(text: string): string {
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

export function inferTopicLabel(text: string, locale: 'zh-CN' | 'en-US'): string {
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

export function inferTaskLabel(
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

export function deriveProblemTitle(text: string, type: NotebookProblemImportDraft['type']): string {
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

export function isWeakProblemTitle(
  title: string,
  type: NotebookProblemImportDraft['type'],
): boolean {
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

export function normalizeTitle(
  text: string,
  type: NotebookProblemImportDraft['type'] = 'short_answer',
): string {
  const singleLine = normalizeWhitespace(text);
  if (isWeakProblemTitle(singleLine, type)) {
    return deriveProblemTitle(text, type).slice(0, 80) || 'Untitled problem';
  }
  return singleLine.slice(0, 80) || 'Untitled problem';
}

export function inferDifficulty(text: string): 'easy' | 'medium' | 'hard' {
  if (/证明|prove|严格|递归|复杂度|hard|困难/i.test(text)) return 'hard';
  if (/计算|derive|multiple|fill in|填空|code|python/i.test(text)) return 'medium';
  return 'easy';
}

export function inferType(block: string): NotebookProblemImportDraft['type'] {
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

export function parseChoiceOptions(block: string) {
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

export function stripChoiceOptions(block: string): string {
  const cleaned = cleanExtractedTextArtifacts(block);
  const firstOption = cleaned.match(/(?:^|\s)A[\.\):：]\s+/);
  if (!firstOption || typeof firstOption.index !== 'number') {
    return cleaned.replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, '').trim();
  }
  return cleaned.slice(0, firstOption.index).trim();
}

export function extractChoiceAnswer(block: string): string[] {
  const explicit = block.match(/(?:答案|Answer)\s*[:：]\s*([A-H](?:\s*[,，/]\s*[A-H])*)/i);
  if (!explicit) return [];
  return explicit[1]
    .split(/[,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractCodeSignature(block: string): string | undefined {
  const match = block.match(/def\s+\w+\s*\([^\)]*\)/);
  return match?.[0]?.trim();
}

export function extractPublicTests(block: string) {
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

export function extractSecretTests(block: string) {
  const tests = [...block.matchAll(/(?:secret test|隐藏测试)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi)];
  return tests.map((match, index) => ({
    id: `secret_${index + 1}`,
    description: `Secret test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

export function extractPointTotal(text: string): number {
  const pointValues = [...text.matchAll(/\((\d+)\s+points?\)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (pointValues.length === 0) return 1;
  return pointValues.reduce((sum, value) => sum + value, 0);
}

export function buildHeuristicDraft(
  block: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft | null {
  const cleaned = cleanExtractedTextArtifacts(block);
  if (!cleaned) return null;

  const type = inferType(cleaned);
  const stemText = normalizeMathMarkdown(cleaned).slice(0, 12000);
  const validationWarnings = cleaned.length > 12000 ? ['题干过长，已截断用于测试预览'] : [];
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
      rawBlock: cleaned.slice(0, 20000),
    },
    validationErrors: validationWarnings,
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
        stem: normalizeMathMarkdown(stripChoiceOptions(cleaned)).slice(0, 12000),
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
        ...validationWarnings,
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
        stem: stemText,
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
        stem: stemText,
      },
      grading: {
        type,
        acceptedForms: [],
      },
      validationErrors: [...validationWarnings, '需补充 accepted answer 或 tolerance'],
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
        stemTemplate: stemText,
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
      validationErrors: [...validationWarnings, '需补充每个空的 accepted answers'],
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
        stem: stemText,
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
        ...validationWarnings,
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
      stem: stemText,
    },
    grading: {
      type: 'short_answer',
    },
  });
}

export function heuristicExtractProblemDrafts(
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

export function firstQuestionStartIndex(text: string): number {
  const cleanedText = cleanExtractedTextArtifacts(text);
  const firstQuestionPatterns = [
    /(?:^|\s)MC\s*1[\.\)]?\s+/i,
    /(?:^|\s)(?:Q1[:.]|Question\s+1\s*[:.])/i,
    /(?:^|\s)1[\.)]\s+(?:(?:\(\d+\s+points\)\s+)?(?:The\s+following|Recall|For\s+a|For\s+an|Let\s+|Suppose\s+|Define\s+|Determine\s+|Find\s+|Compute\s+|Show\s+|Prove\s+)|\(\d+\s+points\)\s+)/i,
    /(?:^|\s)(?:题目\s*1|题\s*1[：:])/i,
  ];
  const starts = firstQuestionPatterns
    .map((pattern) => {
      const match = cleanedText.match(pattern);
      if (typeof match?.index !== 'number') return -1;
      const firstNonWhitespace = match[0].search(/\S/);
      return match.index + Math.max(0, firstNonWhitespace);
    })
    .filter((index) => index >= 0);
  return starts.length > 0 ? Math.min(...starts) : 0;
}

export function firstTopLevelProblemStartIndex(text: string): number {
  const cleanedText = cleanExtractedTextArtifacts(text);
  const pattern = new RegExp(`(?:^|\\s)${TOP_LEVEL_QUESTION_START_PATTERN}`, 'i');
  const match = cleanedText.match(pattern);
  if (typeof match?.index !== 'number') return 0;
  const firstNonWhitespace = match[0].search(/\S/);
  return match.index + Math.max(0, firstNonWhitespace);
}

export function trimTextToProblemStart(text: string, mode: 'first' | 'any' = 'first'): string {
  const cleanedText = cleanExtractedTextArtifacts(text);
  const start =
    mode === 'any'
      ? firstTopLevelProblemStartIndex(cleanedText)
      : firstQuestionStartIndex(cleanedText);
  return cleanedText
    .slice(start)
    .replace(/\s*This page is for additional work[\s\S]*$/i, '')
    .replace(/\s*End of Exam Questions\.?[\s\S]*$/i, '')
    .trim();
}

export function trimPdfScaffoldTextToProblemRegion(text: string): string {
  return trimTextToProblemStart(text);
}

export function normalizeRubricValue(value: unknown): unknown {
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
