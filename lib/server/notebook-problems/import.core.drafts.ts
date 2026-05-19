import { randomUUID } from 'node:crypto';
import { jsonrepair } from 'jsonrepair';
import { ZodError } from 'zod';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { contextBlocksFromStem } from './import.structure-utils';
import type { ProblemSourcePackage, ProblemStructurePlan } from './import.core.types';
import { problemStructurePlanSchema } from './import.core.types';
import {
  normalizeMathMarkdown,
  normalizeWhitespace,
  stripCodeFences,
  stripTopLevelQuestionLabel,
  TOP_LEVEL_QUESTION_START_RE,
} from './import.core.text';
import {
  heuristicExtractProblemDrafts,
  inferDifficulty,
  normalizeRubricValue,
  normalizeTitle,
} from './import.core.heuristic';

export function hasMarkdownTable(text: string): boolean {
  return /(?:^|\n)\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/m.test(text);
}

export function hasStructuredContextBlock(text: string): boolean {
  return hasMarkdownTable(text) || /\n\s*(?:[-*]|\d+[\.)])\s+\S/.test(text);
}

export function selfContainmentValidationErrors(draft: NotebookProblemImportDraft): string[] {
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

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

export function equationConsistencyValidationErrors(draft: NotebookProblemImportDraft): string[] {
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

export function normalizeDraftMathFields(
  draft: NotebookProblemImportDraft,
): NotebookProblemImportDraft {
  const publicContent = { ...draft.publicContent } as NotebookProblemImportDraft['publicContent'];
  if ('stem' in publicContent && typeof publicContent.stem === 'string') {
    publicContent.stem = stripTopLevelQuestionLabel(normalizeMathMarkdown(publicContent.stem));
  }
  if ('stemTemplate' in publicContent && typeof publicContent.stemTemplate === 'string') {
    publicContent.stemTemplate = stripTopLevelQuestionLabel(
      normalizeMathMarkdown(publicContent.stemTemplate),
    );
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

export function withoutAnswerSourceMeta(
  sourceMeta: NotebookProblemImportDraft['sourceMeta'],
): NotebookProblemImportDraft['sourceMeta'] {
  const next = { ...sourceMeta } as Record<string, unknown>;
  delete next.answerSource;
  return next as NotebookProblemImportDraft['sourceMeta'];
}

export function stripGeneratedAnswersForNonChoiceDraft(
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

export function problemStemText(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

export type SubpartSection = {
  label: string;
  text: string;
};

export const STANDALONE_SUBPART_MARKER_RE = /\((i|ii|iii|iv|v|vi|vii|viii|ix|[a-h])\)\s*/gi;

export function isStandaloneSubpartMarker(text: string, markerStart: number): boolean {
  const previousNonWhitespace = text.slice(0, markerStart).match(/\S(?=\s*$)/)?.[0] || '';
  return !previousNonWhitespace || !/[A-Za-z0-9_$]/.test(previousNonWhitespace);
}

export function breakStandaloneSubpartMarkers(text: string): string {
  return text.replace(STANDALONE_SUBPART_MARKER_RE, (match, _label: string, offset: number) => {
    if (!isStandaloneSubpartMarker(text, offset)) return match;
    const prefix = text.slice(0, offset);
    if (/(^|\n\s*)$/.test(prefix)) return match;
    return `\n\n${match}`;
  });
}

export function extractSubpartSections(text: string): SubpartSection[] {
  const matches = [...text.matchAll(STANDALONE_SUBPART_MARKER_RE)].filter((match) =>
    isStandaloneSubpartMarker(text, match.index ?? 0),
  );
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

export function stemHasSubpartLabel(text: string, label: string): boolean {
  return new RegExp(`\\(${label}\\)`, 'i').test(text);
}

export function contentWords(text: string): string[] {
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

export function subpartContentAlreadyCovered(stem: string, section: string): boolean {
  const sectionWords = Array.from(new Set(contentWords(section)));
  if (sectionWords.length === 0) return false;
  const stemWordSet = new Set(contentWords(stem));
  const matched = sectionWords.filter((word) => stemWordSet.has(word)).length;
  return matched / sectionWords.length >= 0.55;
}

export function withScaffoldSubpartCoverage(args: {
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

export function isLikelyPdfInstructionDraft(draft: NotebookProblemImportDraft): boolean {
  const title = draft.title.toLowerCase();
  const stem = problemStemText(draft).toLowerCase();
  const text = `${title}\n${stem}`;
  const instructionSignals = [
    'short answer of exam instructions',
    'scantron',
    'multiple choice exam instructions',
    'exam instructions',
    'this exam contains',
    'duration -',
    'aids:',
    'student number',
    'signature:',
    'corresponding multiple choice booklet',
    'your solutions to questions',
    'write your solutions in the space provided',
    'show all of your work',
    'full points are awarded',
    'dark pencil',
    'erasable ink',
    'bubbles are completely filled',
    'academic integrity',
    'additional work',
    'will not be marked',
    'cover page',
    'page intentionally left blank',
    'intentionally left blank',
    'extra space is needed for solutions',
  ];
  const hasProblemAction = /\b(?:prove|show|find|determine|compute|define|calculate|solve)\b/i.test(
    stem,
  );
  const hasTopLevelQuestionStart = TOP_LEVEL_QUESTION_START_RE.test(problemStemText(draft).trim());
  if (
    /\binstructions?\b/i.test(text) &&
    /\b(?:write your solutions in the space provided|show all of your work|full points are awarded)\b/i.test(
      text,
    ) &&
    !hasTopLevelQuestionStart
  ) {
    return true;
  }
  if (/\bexam instructions?\b/i.test(title) && !hasTopLevelQuestionStart) return true;
  return instructionSignals.some((signal) => text.includes(signal)) && !hasProblemAction;
}

export function scaffoldIndexOf(draft: NotebookProblemImportDraft): number | null {
  const value = draft.sourceMeta.scaffoldIndex;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function difficultyRank(difficulty: NotebookProblemImportDraft['difficulty']): number {
  if (difficulty === 'hard') return 3;
  if (difficulty === 'medium') return 2;
  return 1;
}

export function hardestDifficulty(
  drafts: NotebookProblemImportDraft[],
): NotebookProblemImportDraft['difficulty'] {
  return drafts.reduce(
    (current, draft) =>
      difficultyRank(draft.difficulty) > difficultyRank(current) ? draft.difficulty : current,
    'easy' as NotebookProblemImportDraft['difficulty'],
  );
}

export function mergeableDuplicateScaffoldGroup(drafts: NotebookProblemImportDraft[]): boolean {
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

export function mergedOpenResponseType(
  drafts: NotebookProblemImportDraft[],
): 'short_answer' | 'proof' | 'calculation' {
  if (drafts.some((draft) => draft.type === 'proof')) return 'proof';
  if (drafts.some((draft) => draft.type === 'calculation')) return 'calculation';
  return 'short_answer';
}

export function openResponsePublicContent(
  type: 'short_answer' | 'proof' | 'calculation',
  stem: string,
): NotebookProblemImportDraft['publicContent'] {
  if (type === 'proof') return { type, stem };
  if (type === 'calculation') return { type, stem };
  return { type, stem };
}

export function mergeOpenResponseGrading(
  type: 'short_answer' | 'proof' | 'calculation',
): NotebookProblemImportDraft['grading'] {
  if (type === 'proof') return { type };
  if (type === 'calculation') return { type, acceptedForms: [] };
  return { type };
}

export function mergeDuplicateScaffoldGroup(
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

export function postProcessPdfFileDrafts(
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

export function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function expandChoiceOptions(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  return Object.entries(value as Record<string, unknown>).map(([id, label]) => {
    if (label && typeof label === 'object' && !Array.isArray(label)) {
      return { id, ...(label as Record<string, unknown>) };
    }
    return { id, label };
  });
}

export function looksLikeSingleProblemInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return heuristicExtractProblemDrafts(trimmed, 'manual').length === 1;
}

export function normalizeRawCandidate(
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

export function formatImportValidationIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

export function normalizeCandidateDraft(
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

export function parseProblemDraftArrayFromLLMText(text: string): unknown[] {
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

export function directProblemImportJsonPayload(text: string): string {
  const raw = stripCodeFences(text).trim();
  const objectStart = raw.indexOf('{');
  const objectEnd = raw.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return raw.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = raw.indexOf('[');
  const arrayEnd = raw.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return raw.slice(arrayStart, arrayEnd + 1);
  }

  return raw;
}

export function parseDirectProblemImportResultFromLLMText(text: string): {
  structurePlan: ProblemStructurePlan | null;
  drafts: unknown[];
} {
  const raw = directProblemImportJsonPayload(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = JSON.parse(jsonrepair(raw)) as unknown;
  }

  if (Array.isArray(parsed)) {
    return { structurePlan: null, drafts: parsed };
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Direct LLM import output is not an object');
  }

  const record = parsed as { structurePlan?: unknown; plan?: unknown; drafts?: unknown };
  const rawDrafts = Array.isArray(record.drafts) ? record.drafts : [];
  if (rawDrafts.length === 0) {
    throw new Error('Direct LLM import output has no drafts array');
  }

  let structurePlan: ProblemStructurePlan | null = null;
  const rawPlan = record.structurePlan ?? record.plan;
  if (rawPlan && typeof rawPlan === 'object') {
    try {
      structurePlan = problemStructurePlanSchema.parse({
        generatedBy: 'llm',
        ...rawPlan,
      });
    } catch {
      structurePlan = null;
    }
  }

  return { structurePlan, drafts: rawDrafts };
}

export function withPdfFileSourceMeta(
  draft: NotebookProblemImportDraft,
): NotebookProblemImportDraft {
  return {
    ...draft,
    sourceMeta: {
      ...draft.sourceMeta,
      importMode: 'llm-file',
      fileInput: true,
    },
  };
}

export function withDirectLlmSourceMeta(
  draft: NotebookProblemImportDraft,
): NotebookProblemImportDraft {
  return {
    ...draft,
    sourceMeta: {
      ...draft.sourceMeta,
      importMode: 'direct-llm',
      fileInput: true,
      pipelineStage: 'direct-llm-import',
    },
  };
}

export function directLlmStructurePlanFromDrafts(
  sourcePackage: ProblemSourcePackage,
  drafts: NotebookProblemImportDraft[],
): ProblemStructurePlan {
  const nonProblemRegions = sourcePackage.sourcePages
    .filter(
      (page) =>
        page.roleHint === 'cover' ||
        page.roleHint === 'instructions' ||
        page.roleHint === 'additional_work' ||
        page.roleHint === 'blank',
    )
    .map((page) => ({
      kind:
        page.roleHint === 'instructions'
          ? ('instructions' as const)
          : page.roleHint === 'additional_work'
            ? ('additional_work' as const)
            : page.roleHint === 'blank'
              ? ('blank' as const)
              : ('cover' as const),
      pageNumbers: [page.pageNumber],
      reason: `${page.sourceLabel} detected by direct LLM import fallback metadata.`,
    }));

  return {
    sourceSummary: `${sourcePackage.fileName}: direct LLM import generated ${drafts.length} candidate problems.`,
    nonProblemRegions,
    sharedContexts: [],
    topLevelProblems: drafts.map((draft, index) => {
      const stem = problemStemText(draft);
      const scaffoldIndex = scaffoldIndexOf(draft) ?? index + 1;
      return {
        index: scaffoldIndex,
        topLevelLabel: String(scaffoldIndex),
        title: draft.title,
        problemTypeHint: draft.type,
        sourceAnchors: [
          {
            textQuote: normalizeWhitespace(stem).slice(0, 800),
            role: 'problem',
          },
        ],
        subparts: extractSubpartSections(stem).map((section) => ({
          label: section.label,
          prompt: normalizeWhitespace(section.text).slice(0, 1000),
          points: section.text.match(/\((\d+)\s+points?\)/i)?.[1]
            ? Number(section.text.match(/\((\d+)\s+points?\)/i)?.[1])
            : undefined,
        })),
        contextBlocks: contextBlocksFromStem(stem),
        visualRefs: [
          ...stem.matchAll(/\b(?:Table|Diagram|Figure)\s+[A-Za-z0-9]+|图\s*\d+|表\s*\d+/gi),
        ].map((match) => match[0]),
        confidence: 0.72,
      };
    }),
    warnings: ['Direct LLM output did not include a valid structurePlan; synthesized from drafts.'],
    generatedBy: 'llm',
  };
}

export function withCoverageFallbackDrafts(args: {
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
