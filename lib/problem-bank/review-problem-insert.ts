import { z } from 'zod';
import {
  notebookChoiceOptionSchema,
  notebookCodeSampleIoSchema,
  notebookProblemDifficultySchema,
  notebookProblemGradingSchema,
  notebookProblemImportDraftSchema,
  notebookProblemPublicContentSchema,
  notebookProblemSecretJudgeSchema,
  notebookProblemSourceMetaSchema,
  notebookProblemSourceSchema,
  notebookProblemStatusSchema,
  notebookProblemTypeSchema,
  type NotebookProblemGrading,
  type NotebookProblemImportDraft,
  type NotebookProblemPublicContent,
  type NotebookProblemSecretJudge,
} from './schema';
import { normalizeProblemConceptTags } from './concept-tags.mjs';

const optionalTextSchema = z.string().trim().min(1).optional();
const answerSchema = z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]);

const flexibleCodeTestSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  expression: z.string().trim().min(1).max(4000).optional(),
  input: z.string().trim().min(1).max(4000).optional(),
  expected: z.string().trim().min(1).max(4000).optional(),
  expectedOutput: z.string().trim().min(1).max(4000).optional(),
  output: z.string().trim().min(1).max(4000).optional(),
  hidden: z.boolean().default(false),
});

const insertBlankSchema = z.object({
  id: z.string().trim().min(1).max(64),
  placeholder: z.string().trim().min(1).max(120).optional(),
  acceptedAnswers: z.array(z.string().trim().min(1).max(1000)).min(1).max(16).optional(),
  caseSensitive: z.boolean().default(false),
});
type InsertBlank = z.infer<typeof insertBlankSchema>;

export const reviewProblemInsertSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  draftId: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  type: notebookProblemTypeSchema.optional(),
  status: notebookProblemStatusSchema.default('published'),
  source: notebookProblemSourceSchema.default('manual'),
  points: z.number().int().min(0).max(1000).default(1),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  concepts: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
  difficulty: notebookProblemDifficultySchema.default('medium'),
  preview: optionalTextSchema,
  stem: optionalTextSchema,
  stemTemplate: optionalTextSchema,
  prompt: optionalTextSchema,
  answer: answerSchema.optional(),
  correctAnswer: answerSchema.optional(),
  referenceAnswer: optionalTextSchema,
  explanation: z.string().trim().min(1).max(8000).optional(),
  rubric: z.string().trim().min(1).max(12000).optional(),
  analysis: z.string().trim().min(1).max(12000).optional(),
  options: z.array(notebookChoiceOptionSchema).min(2).max(12).optional(),
  correctOptionIds: z.array(z.string().trim().min(1).max(64)).min(1).max(12).optional(),
  selectionMode: z.enum(['single', 'multiple']).optional(),
  blanks: z.array(insertBlankSchema).max(12).optional(),
  acceptedAnswers: z
    .record(z.string(), z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]))
    .optional(),
  acceptedForms: z.array(z.string().trim().min(1).max(1000)).max(16).default([]),
  unit: z.string().trim().min(1).max(120).optional(),
  starterCode: z.string().max(40000).optional(),
  functionSignature: z.string().trim().min(1).max(4000).optional(),
  constraints: z.array(z.string().trim().min(1).max(500)).max(16).default([]),
  publicTests: z.array(flexibleCodeTestSchema).max(24).optional(),
  secretTests: z.array(flexibleCodeTestSchema).max(48).optional(),
  testCases: z.array(flexibleCodeTestSchema).max(72).optional(),
  sampleIO: z.array(notebookCodeSampleIoSchema).max(12).default([]),
  timeoutMs: z.number().int().positive().max(20000).default(5000),
  publicContent: notebookProblemPublicContentSchema.optional(),
  grading: notebookProblemGradingSchema.optional(),
  secretJudge: notebookProblemSecretJudgeSchema.optional(),
  sourceMeta: notebookProblemSourceMetaSchema,
});

export const reviewProblemInsertRequestSchema = z
  .object({
    draft: notebookProblemImportDraftSchema.optional(),
    drafts: z.array(notebookProblemImportDraftSchema).max(200).optional(),
    problem: reviewProblemInsertSchema.optional(),
    problems: z.array(reviewProblemInsertSchema).max(200).optional(),
    question: reviewProblemInsertSchema.optional(),
    questions: z.array(reviewProblemInsertSchema).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const count =
      (value.draft ? 1 : 0) +
      (value.drafts?.length ?? 0) +
      (value.problem ? 1 : 0) +
      (value.problems?.length ?? 0) +
      (value.question ? 1 : 0) +
      (value.questions?.length ?? 0);
    if (count === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide draft, drafts, problem, problems, question, or questions.',
      });
    }
    if (count > 200) {
      ctx.addIssue({
        code: 'custom',
        message: 'At most 200 problems can be inserted in one request.',
      });
    }
  });

export type ReviewProblemInsertInput = z.infer<typeof reviewProblemInsertSchema>;
export type ReviewProblemInsertRequest = z.infer<typeof reviewProblemInsertRequestSchema>;

export class ReviewProblemInsertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewProblemInsertError';
  }
}

function fail(message: string): never {
  throw new ReviewProblemInsertError(message);
}

function firstText(...values: Array<string | undefined | null>): string | undefined {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

function compactText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function uniqueTexts(values: string[], maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = compactText(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function answerValues(value: ReviewProblemInsertInput['answer']): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.map((item) => item.trim()) : [value.trim()];
}

function problemStem(problem: ReviewProblemInsertInput): string {
  return (
    firstText(problem.stem, problem.prompt, problem.preview, problem.stemTemplate, problem.title) ??
    '未命名复习题'
  );
}

function problemTitle(problem: ReviewProblemInsertInput): string {
  return compactText(
    firstText(problem.title, problem.preview, problem.stem, problem.prompt, problem.stemTemplate) ??
      '未命名复习题',
    200,
  );
}

function resolveProblemType(problem: ReviewProblemInsertInput): NotebookProblemImportDraft['type'] {
  if (problem.publicContent?.type) return problem.publicContent.type;
  if (problem.type) return problem.type;
  if ((problem.options?.length ?? 0) > 0) return 'choice';
  if ((problem.blanks?.length ?? 0) > 0 || problem.stemTemplate) return 'fill_blank';
  if (problem.functionSignature || problem.starterCode || (problem.testCases?.length ?? 0) > 0) {
    return 'code';
  }
  return 'short_answer';
}

function mapCodeTests(
  tests: z.infer<typeof flexibleCodeTestSchema>[] | undefined,
  idPrefix: string,
): Array<{ id: string; description?: string; expression: string; expected: string }> {
  return (tests ?? []).map((test, index) => {
    const expression = firstText(test.expression, test.input);
    const expected = firstText(test.expected, test.expectedOutput, test.output);
    if (!expression || !expected) {
      fail(`Code test ${index + 1} must include expression/input and expected/output.`);
    }
    return {
      id: test.id ?? `${idPrefix}-${index + 1}`,
      description: test.description,
      expression,
      expected,
    };
  });
}

function codeTestsForVisibility(
  tests: z.infer<typeof flexibleCodeTestSchema>[] | undefined,
  hidden: boolean,
): z.infer<typeof flexibleCodeTestSchema>[] {
  return (tests ?? []).filter((test) => test.hidden === hidden);
}

function problemBlanks(problem: ReviewProblemInsertInput): InsertBlank[] {
  return problem.blanks && problem.blanks.length > 0
    ? problem.blanks
    : [{ id: 'blank_1', caseSensitive: false }];
}

function buildSecretJudge(
  problem: ReviewProblemInsertInput,
): NotebookProblemSecretJudge | undefined {
  if (problem.secretJudge) return notebookProblemSecretJudgeSchema.parse(problem.secretJudge);
  const secretTests = [
    ...mapCodeTests(problem.secretTests, 'secret'),
    ...mapCodeTests(codeTestsForVisibility(problem.testCases, true), 'hidden'),
  ];
  if (secretTests.length === 0) return undefined;
  return notebookProblemSecretJudgeSchema.parse({
    language: 'python',
    secretTests,
    timeoutMs: problem.timeoutMs,
  });
}

function buildPublicContent(
  problem: ReviewProblemInsertInput,
  type: NotebookProblemImportDraft['type'],
  secretJudge: NotebookProblemSecretJudge | undefined,
): NotebookProblemPublicContent {
  if (problem.publicContent) {
    if (problem.publicContent.type !== type) {
      fail(
        `publicContent.type (${problem.publicContent.type}) does not match problem type (${type}).`,
      );
    }
    return notebookProblemPublicContentSchema.parse(problem.publicContent);
  }

  const explanation = problem.explanation;
  switch (type) {
    case 'choice': {
      const options = problem.options ?? fail('Choice problems must include at least two options.');
      const correctCount = resolveCorrectOptionIds(problem, options).length;
      return notebookProblemPublicContentSchema.parse({
        type,
        stem: problemStem(problem),
        selectionMode: problem.selectionMode ?? (correctCount > 1 ? 'multiple' : 'single'),
        options,
        explanation,
      });
    }
    case 'fill_blank': {
      const blanks = problemBlanks(problem);
      return notebookProblemPublicContentSchema.parse({
        type,
        stemTemplate:
          firstText(problem.stemTemplate, problem.stem, problem.prompt) ?? problemTitle(problem),
        blanks: blanks.map((blank) => ({
          id: blank.id,
          placeholder: blank.placeholder,
        })),
        explanation,
      });
    }
    case 'calculation':
      return notebookProblemPublicContentSchema.parse({
        type,
        stem: problemStem(problem),
        unit: problem.unit,
        explanation,
      });
    case 'code': {
      const publicTests = [
        ...mapCodeTests(problem.publicTests, 'public'),
        ...mapCodeTests(codeTestsForVisibility(problem.testCases, false), 'case'),
      ];
      return notebookProblemPublicContentSchema.parse({
        type,
        stem: problemStem(problem),
        language: 'python',
        starterCode: problem.starterCode,
        functionSignature: problem.functionSignature,
        constraints: problem.constraints,
        publicTests,
        sampleIO: problem.sampleIO,
        secretConfigPresent: Boolean(secretJudge),
        explanation,
      });
    }
    case 'proof':
      return notebookProblemPublicContentSchema.parse({
        type,
        stem: problemStem(problem),
        explanation,
      });
    case 'short_answer':
      return notebookProblemPublicContentSchema.parse({
        type,
        stem: problemStem(problem),
        explanation,
      });
  }
}

function resolveCorrectOptionIds(
  problem: ReviewProblemInsertInput,
  options: Array<z.infer<typeof notebookChoiceOptionSchema>>,
): string[] {
  if (problem.correctOptionIds?.length) return uniqueTexts(problem.correctOptionIds, 12, 64);

  const optionIds = new Set(options.map((option) => option.id));
  const values = [...answerValues(problem.answer), ...answerValues(problem.correctAnswer)];
  return uniqueTexts(
    values
      .map((value) => {
        const match = options.find((option) => option.id === value || option.label === value);
        return match?.id ?? value;
      })
      .filter((value) => optionIds.has(value)),
    12,
    64,
  );
}

function acceptedAnswersForBlank(
  problem: ReviewProblemInsertInput,
  blank: InsertBlank,
  blankCount: number,
): string[] {
  if (blank.acceptedAnswers?.length) return uniqueTexts(blank.acceptedAnswers, 16, 1000);
  const raw = problem.acceptedAnswers?.[blank.id];
  if (Array.isArray(raw)) return uniqueTexts(raw, 16, 1000);
  if (typeof raw === 'string') return uniqueTexts([raw], 16, 1000);
  if (blankCount === 1) {
    return uniqueTexts(
      [...answerValues(problem.answer), ...answerValues(problem.correctAnswer)],
      16,
      1000,
    );
  }
  return [];
}

function buildGrading(
  problem: ReviewProblemInsertInput,
  type: NotebookProblemImportDraft['type'],
  publicContent: NotebookProblemPublicContent,
  secretJudge: NotebookProblemSecretJudge | undefined,
): NotebookProblemGrading {
  if (problem.grading) {
    if (problem.grading.type !== type) {
      fail(`grading.type (${problem.grading.type}) does not match problem type (${type}).`);
    }
    return notebookProblemGradingSchema.parse(problem.grading);
  }

  const answer = firstText(problem.referenceAnswer, ...answerValues(problem.answer));
  const analysis = firstText(problem.analysis, problem.explanation);
  switch (type) {
    case 'choice':
      if (publicContent.type !== 'choice') fail('Choice grading requires choice publicContent.');
      return notebookProblemGradingSchema.parse({
        type,
        correctOptionIds: resolveCorrectOptionIds(problem, publicContent.options),
        analysis,
      });
    case 'fill_blank': {
      const blanks = problemBlanks(problem);
      return notebookProblemGradingSchema.parse({
        type,
        blanks: blanks.map((blank) => ({
          id: blank.id,
          acceptedAnswers: acceptedAnswersForBlank(problem, blank, blanks.length),
          caseSensitive: blank.caseSensitive,
        })),
        analysis,
      });
    }
    case 'calculation':
      return notebookProblemGradingSchema.parse({
        type,
        referenceAnswer: answer,
        acceptedForms: problem.acceptedForms,
        unit: problem.unit,
        analysis,
      });
    case 'code':
      return notebookProblemGradingSchema.parse({
        type,
        analysis,
        publishRequirementsMet:
          Boolean(secretJudge) &&
          publicContent.type === 'code' &&
          Boolean(publicContent.functionSignature) &&
          publicContent.publicTests.length > 0,
      });
    case 'proof':
      return notebookProblemGradingSchema.parse({
        type,
        referenceProof: answer,
        rubric: problem.rubric,
        analysis,
      });
    case 'short_answer':
      return notebookProblemGradingSchema.parse({
        type,
        referenceAnswer: answer,
        rubric: problem.rubric,
        analysis,
      });
  }
}

export function buildNotebookProblemDraftFromReviewProblem(
  problem: ReviewProblemInsertInput,
): NotebookProblemImportDraft {
  const type = resolveProblemType(problem);
  const secretJudge = type === 'code' ? buildSecretJudge(problem) : undefined;
  const publicContent = buildPublicContent(problem, type, secretJudge);
  const grading = buildGrading(problem, type, publicContent, secretJudge);
  const concepts = uniqueTexts(problem.concepts, 16, 80);
  const title = problemTitle(problem);
  const tags = uniqueTexts(
    normalizeProblemConceptTags({
      title,
      type,
      tags: [...problem.tags, ...concepts],
      difficulty: problem.difficulty,
      publicContent,
      sourceMeta: {
        ...problem.sourceMeta,
        ...(concepts.length > 0 ? { concepts } : {}),
      },
    }),
    16,
    30,
  );

  return notebookProblemImportDraftSchema.parse({
    draftId: problem.draftId ?? problem.id ?? crypto.randomUUID(),
    notebookId: null,
    title,
    type,
    status: problem.status,
    source: problem.source,
    points: problem.points,
    tags,
    difficulty: problem.difficulty,
    publicContent,
    grading,
    secretJudge,
    sourceMeta: {
      ...problem.sourceMeta,
      insertMode: 'direct_review_problem',
      ...(problem.id ? { externalProblemId: problem.id } : {}),
      ...(concepts.length > 0 ? { concepts } : {}),
    },
    validationErrors: [],
  });
}

export function buildNotebookProblemDraftsFromReviewInsertRequest(
  request: ReviewProblemInsertRequest,
): NotebookProblemImportDraft[] {
  return [
    ...(request.drafts ?? []),
    ...(request.draft ? [request.draft] : []),
    ...(request.problems ?? []).map(buildNotebookProblemDraftFromReviewProblem),
    ...(request.problem ? [buildNotebookProblemDraftFromReviewProblem(request.problem)] : []),
    ...(request.questions ?? []).map(buildNotebookProblemDraftFromReviewProblem),
    ...(request.question ? [buildNotebookProblemDraftFromReviewProblem(request.question)] : []),
  ];
}
