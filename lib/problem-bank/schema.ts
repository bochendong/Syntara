import { z } from 'zod';
import type { QuizQuestion, Scene } from '@/lib/types/stage';

export const notebookProblemTypeSchema = z.enum([
  'short_answer',
  'choice',
  'proof',
  'calculation',
  'code',
  'fill_blank',
]);
export const notebookProblemStatusSchema = z.enum(['draft', 'published', 'archived']);
export const notebookProblemSourceSchema = z.enum(['chat', 'pdf', 'manual', 'legacy_quiz_scene']);
export const notebookProblemDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const notebookProblemAttemptKindSchema = z.enum(['run', 'submit', 'answer']);
export const notebookProblemAttemptStatusSchema = z.enum([
  'pending',
  'passed',
  'failed',
  'partial',
  'error',
]);

export const notebookProblemSourceMetaSchema = z.record(z.string(), z.unknown()).default({});

const notebookProblemPublicBaseSchema = z.object({
  explanation: z.string().trim().min(1).max(8000).optional(),
});

export const notebookChoiceOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(4000),
});

export const notebookProblemPublicShortAnswerSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('short_answer'),
  stem: z.string().trim().min(1).max(12000),
});

export const notebookProblemPublicChoiceSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('choice'),
  stem: z.string().trim().min(1).max(12000),
  selectionMode: z.enum(['single', 'multiple']).default('single'),
  options: z.array(notebookChoiceOptionSchema).min(2).max(12),
});

export const notebookProblemPublicProofSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('proof'),
  stem: z.string().trim().min(1).max(12000),
});

export const notebookProblemPublicCalculationSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('calculation'),
  stem: z.string().trim().min(1).max(12000),
  unit: z.string().trim().min(1).max(120).optional(),
});

export const notebookProblemPublicFillBlankSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('fill_blank'),
  stemTemplate: z.string().trim().min(1).max(12000),
  blanks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        placeholder: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .min(1)
    .max(12),
});

export const notebookCodeTestSchema = z.object({
  id: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(500).optional(),
  expression: z.string().trim().min(1).max(4000),
  expected: z.string().trim().min(1).max(4000),
});

export const notebookCodeSampleIoSchema = z.object({
  input: z.string().trim().min(1).max(4000),
  output: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().min(1).max(2000).optional(),
});

export const notebookProblemPublicCodeSchema = notebookProblemPublicBaseSchema.extend({
  type: z.literal('code'),
  stem: z.string().trim().min(1).max(16000),
  language: z.literal('python').default('python'),
  starterCode: z.string().max(40000).optional(),
  functionSignature: z.string().trim().min(1).max(4000).optional(),
  constraints: z.array(z.string().trim().min(1).max(500)).max(16).default([]),
  publicTests: z.array(notebookCodeTestSchema).max(24).default([]),
  sampleIO: z.array(notebookCodeSampleIoSchema).max(12).default([]),
  secretConfigPresent: z.boolean().default(false),
});

export const notebookProblemPublicContentSchema = z.discriminatedUnion('type', [
  notebookProblemPublicShortAnswerSchema,
  notebookProblemPublicChoiceSchema,
  notebookProblemPublicProofSchema,
  notebookProblemPublicCalculationSchema,
  notebookProblemPublicFillBlankSchema,
  notebookProblemPublicCodeSchema,
]);

export const notebookProblemGradingShortAnswerSchema = z.object({
  type: z.literal('short_answer'),
  referenceAnswer: z.string().trim().min(1).max(12000).optional(),
  rubric: z.string().trim().min(1).max(12000).optional(),
  analysis: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemGradingChoiceSchema = z.object({
  type: z.literal('choice'),
  correctOptionIds: z.array(z.string().trim().min(1).max(64)).min(1).max(12),
  analysis: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemGradingProofSchema = z.object({
  type: z.literal('proof'),
  referenceProof: z.string().trim().min(1).max(16000).optional(),
  rubric: z.string().trim().min(1).max(12000).optional(),
  analysis: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemGradingCalculationSchema = z.object({
  type: z.literal('calculation'),
  referenceAnswer: z.string().trim().min(1).max(4000).optional(),
  acceptedForms: z.array(z.string().trim().min(1).max(1000)).max(16).default([]),
  tolerance: z.number().nonnegative().optional(),
  unit: z.string().trim().min(1).max(120).optional(),
  analysis: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemGradingFillBlankSchema = z.object({
  type: z.literal('fill_blank'),
  blanks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        acceptedAnswers: z.array(z.string().trim().min(1).max(1000)).min(1).max(16),
        caseSensitive: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(12),
  analysis: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemGradingCodeSchema = z.object({
  type: z.literal('code'),
  analysis: z.string().trim().min(1).max(12000).optional(),
  publishRequirementsMet: z.boolean().default(false),
});

export const notebookProblemGradingSchema = z.discriminatedUnion('type', [
  notebookProblemGradingShortAnswerSchema,
  notebookProblemGradingChoiceSchema,
  notebookProblemGradingProofSchema,
  notebookProblemGradingCalculationSchema,
  notebookProblemGradingFillBlankSchema,
  notebookProblemGradingCodeSchema,
]);

export const notebookProblemSecretJudgeSchema = z.object({
  language: z.literal('python').default('python'),
  secretTests: z.array(notebookCodeTestSchema).max(48).default([]),
  timeoutMs: z.number().int().positive().max(20000).default(5000),
});

export const notebookProblemRecordSchema = z.object({
  id: z.string().trim().min(1),
  notebookId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  type: notebookProblemTypeSchema,
  status: notebookProblemStatusSchema,
  source: notebookProblemSourceSchema,
  order: z.number().int().min(0),
  points: z.number().int().min(0).max(1000).default(1),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  difficulty: notebookProblemDifficultySchema.default('medium'),
  publicContent: notebookProblemPublicContentSchema,
  grading: notebookProblemGradingSchema,
  sourceMeta: notebookProblemSourceMetaSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const notebookProblemSummarySchema = notebookProblemRecordSchema.extend({
  latestAttempt: z
    .object({
      id: z.string().trim().min(1),
      status: notebookProblemAttemptStatusSchema,
      score: z.number().nullable().optional(),
      createdAt: z.number(),
    })
    .nullable()
    .optional(),
});

export const notebookProblemAttemptAnswerSchema = z.object({
  text: z.string().max(40000).optional(),
  selectedOptionIds: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  blanks: z.record(z.string(), z.string().max(4000)).optional(),
  code: z.string().max(120000).optional(),
});

export const notebookCodeCaseResultSchema = z.object({
  id: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(500).optional(),
  passed: z.boolean(),
  actual: z.string().trim().min(1).max(12000).optional(),
  error: z.string().trim().min(1).max(12000).optional(),
});

export const notebookProblemAttemptResultSchema = z.object({
  correct: z.boolean().nullable().optional(),
  feedback: z.string().trim().min(1).max(16000).optional(),
  analysis: z.string().trim().min(1).max(16000).optional(),
  earnedPoints: z.number().min(0).max(1000).optional(),
  publicCases: z.array(notebookCodeCaseResultSchema).default([]),
  secretSummary: z
    .object({
      total: z.number().int().min(0),
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      failureSummary: z.string().trim().min(1).max(16000).optional(),
    })
    .optional(),
});

export const notebookProblemAttemptRecordSchema = z.object({
  id: z.string().trim().min(1),
  problemId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  kind: notebookProblemAttemptKindSchema,
  status: notebookProblemAttemptStatusSchema,
  score: z.number().nullable().optional(),
  answer: notebookProblemAttemptAnswerSchema,
  result: notebookProblemAttemptResultSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const notebookProblemImportDraftSchema = z.object({
  draftId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  type: notebookProblemTypeSchema,
  status: notebookProblemStatusSchema.default('draft'),
  source: notebookProblemSourceSchema.default('manual'),
  points: z.number().int().min(0).max(1000).default(1),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  difficulty: notebookProblemDifficultySchema.default('medium'),
  publicContent: notebookProblemPublicContentSchema,
  grading: notebookProblemGradingSchema,
  secretJudge: notebookProblemSecretJudgeSchema.optional(),
  sourceMeta: notebookProblemSourceMetaSchema,
  validationErrors: z.array(z.string().trim().min(1).max(500)).default([]),
});

export type NotebookProblemType = z.infer<typeof notebookProblemTypeSchema>;
export type NotebookProblemStatus = z.infer<typeof notebookProblemStatusSchema>;
export type NotebookProblemSource = z.infer<typeof notebookProblemSourceSchema>;
export type NotebookProblemDifficulty = z.infer<typeof notebookProblemDifficultySchema>;
export type NotebookProblemAttemptKind = z.infer<typeof notebookProblemAttemptKindSchema>;
export type NotebookProblemAttemptStatus = z.infer<typeof notebookProblemAttemptStatusSchema>;
export type NotebookProblemPublicContent = z.infer<typeof notebookProblemPublicContentSchema>;
export type NotebookProblemGrading = z.infer<typeof notebookProblemGradingSchema>;
export type NotebookProblemSecretJudge = z.infer<typeof notebookProblemSecretJudgeSchema>;
export type NotebookProblemRecord = z.infer<typeof notebookProblemRecordSchema>;
export type NotebookProblemSummary = z.infer<typeof notebookProblemSummarySchema>;
export type NotebookProblemAttemptAnswer = z.infer<typeof notebookProblemAttemptAnswerSchema>;
export type NotebookProblemAttemptResult = z.infer<typeof notebookProblemAttemptResultSchema>;
export type NotebookProblemAttemptRecord = z.infer<typeof notebookProblemAttemptRecordSchema>;
export type NotebookProblemImportDraft = z.infer<typeof notebookProblemImportDraftSchema>;
export type NotebookProblemPublicChoice = z.infer<typeof notebookProblemPublicChoiceSchema>;
export type NotebookProblemPublicFillBlank = z.infer<typeof notebookProblemPublicFillBlankSchema>;
export type NotebookProblemPublicCalculation = z.infer<
  typeof notebookProblemPublicCalculationSchema
>;
export type NotebookProblemPublicCode = z.infer<typeof notebookProblemPublicCodeSchema>;
export type NotebookProblemGradingChoice = z.infer<typeof notebookProblemGradingChoiceSchema>;
export type NotebookProblemGradingFillBlank = z.infer<typeof notebookProblemGradingFillBlankSchema>;
export type NotebookProblemGradingCalculation = z.infer<
  typeof notebookProblemGradingCalculationSchema
>;
export type NotebookProblemGradingShortAnswer = z.infer<
  typeof notebookProblemGradingShortAnswerSchema
>;
export type NotebookProblemGradingProof = z.infer<typeof notebookProblemGradingProofSchema>;
export type NotebookProblemGradingCode = z.infer<typeof notebookProblemGradingCodeSchema>;
export type NotebookCodeProblemRecord = NotebookProblemRecord & {
  type: 'code';
  publicContent: NotebookProblemPublicCode;
  grading: NotebookProblemGradingCode;
};
export type NotebookChoiceProblemRecord = NotebookProblemRecord & {
  type: 'choice';
  publicContent: NotebookProblemPublicChoice;
  grading: NotebookProblemGradingChoice;
};
export type NotebookFillBlankProblemRecord = NotebookProblemRecord & {
  type: 'fill_blank';
  publicContent: NotebookProblemPublicFillBlank;
  grading: NotebookProblemGradingFillBlank;
};
export type NotebookCalculationProblemRecord = NotebookProblemRecord & {
  type: 'calculation';
  publicContent: NotebookProblemPublicCalculation;
  grading: NotebookProblemGradingCalculation;
};
export type NotebookShortAnswerProblemRecord = NotebookProblemRecord & {
  type: 'short_answer';
  publicContent: z.infer<typeof notebookProblemPublicShortAnswerSchema>;
  grading: NotebookProblemGradingShortAnswer;
};
export type NotebookProofProblemRecord = NotebookProblemRecord & {
  type: 'proof';
  publicContent: z.infer<typeof notebookProblemPublicProofSchema>;
  grading: NotebookProblemGradingProof;
};

export function parseNotebookProblemPublicContent(input: unknown): NotebookProblemPublicContent {
  return notebookProblemPublicContentSchema.parse(input);
}

export function parseNotebookProblemGrading(input: unknown): NotebookProblemGrading {
  return notebookProblemGradingSchema.parse(input);
}

export function parseNotebookProblemSecretJudge(
  input: unknown,
): NotebookProblemSecretJudge | undefined {
  if (!input) return undefined;
  return notebookProblemSecretJudgeSchema.parse(input);
}

export function parseNotebookProblemRecord(input: unknown): NotebookProblemRecord {
  return notebookProblemRecordSchema.parse(input);
}

export function parseNotebookProblemAttemptRecord(input: unknown): NotebookProblemAttemptRecord {
  return notebookProblemAttemptRecordSchema.parse(input);
}

export function parseNotebookProblemImportDraft(input: unknown): NotebookProblemImportDraft {
  return notebookProblemImportDraftSchema.parse(input);
}

function normalizeQuizChoiceType(question: QuizQuestion): NotebookProblemImportDraft | null {
  const optionList =
    question.options?.map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String.fromCharCode(65 + index),
          label: option,
        };
      }
      const id = option.value?.trim() || String.fromCharCode(65 + index);
      const label = option.label?.trim() || option.value?.trim() || id;
      return { id, label };
    }) ?? [];

  if (optionList.length < 2) return null;

  const answers = Array.isArray(question.answer)
    ? question.answer
    : typeof question.answer === 'string'
      ? [question.answer]
      : Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : typeof question.correctAnswer === 'string'
          ? [question.correctAnswer]
          : [];

  const correctOptionIds = answers
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match = optionList.find((option) => option.id === value || option.label === value);
      return match?.id || value;
    });

  const selectionMode = question.type === 'multiple' ? 'multiple' : 'single';
  return {
    draftId: question.id,
    title: question.question.slice(0, 80),
    type: 'choice',
    status: 'published',
    source: 'legacy_quiz_scene',
    points: question.points ?? 1,
    tags: [],
    difficulty: 'medium',
    publicContent: {
      type: 'choice',
      stem: question.question,
      selectionMode,
      options: optionList,
      explanation: question.explanation,
    },
    grading: {
      type: 'choice',
      correctOptionIds,
      analysis: question.analysis,
    },
    sourceMeta: {
      legacyQuestionType: question.type,
    },
    validationErrors: correctOptionIds.length === 0 ? ['缺少正确答案'] : [],
  };
}

export function buildLegacyProblemDraftFromQuizQuestion(
  question: QuizQuestion,
  scene: Scene,
): NotebookProblemImportDraft | null {
  if (
    question.type === 'single' ||
    question.type === 'multiple' ||
    question.type === 'multiple_choice'
  ) {
    const choice = normalizeQuizChoiceType(question);
    if (!choice) return null;
    return {
      ...choice,
      sourceMeta: {
        ...choice.sourceMeta,
        sceneId: scene.id,
        sceneTitle: scene.title,
      },
    };
  }

  if (question.type === 'short_answer') {
    return {
      draftId: question.id,
      title: question.question.slice(0, 80),
      type: 'short_answer',
      status: 'published',
      source: 'legacy_quiz_scene',
      points: question.points ?? 1,
      tags: [],
      difficulty: 'medium',
      publicContent: {
        type: 'short_answer',
        stem: question.question,
        explanation: question.explanation,
      },
      grading: {
        type: 'short_answer',
        referenceAnswer:
          typeof question.answer === 'string'
            ? question.answer
            : typeof question.correctAnswer === 'string'
              ? question.correctAnswer
              : undefined,
        rubric: question.commentPrompt,
        analysis: question.analysis,
      },
      sourceMeta: {
        sceneId: scene.id,
        sceneTitle: scene.title,
        legacyQuestionType: question.type,
      },
      validationErrors: [],
    };
  }

  if (question.type === 'proof') {
    return {
      draftId: question.id,
      title: question.question.slice(0, 80),
      type: 'proof',
      status: 'published',
      source: 'legacy_quiz_scene',
      points: question.points ?? 1,
      tags: [],
      difficulty: 'hard',
      publicContent: {
        type: 'proof',
        stem: question.question,
        explanation: question.explanation,
      },
      grading: {
        type: 'proof',
        referenceProof: question.proof,
        rubric: question.commentPrompt,
        analysis: question.analysis,
      },
      sourceMeta: {
        sceneId: scene.id,
        sceneTitle: scene.title,
        legacyQuestionType: question.type,
      },
      validationErrors: [],
    };
  }

  if (question.type === 'code') {
    const publicTests = (question.testCases ?? [])
      .filter((testCase) => !testCase.hidden)
      .map((testCase, index) => ({
        id: testCase.id || `public_${index + 1}`,
        description: testCase.description,
        expression: testCase.expression,
        expected: testCase.expected,
      }));
    const secretTests = (question.testCases ?? [])
      .filter((testCase) => testCase.hidden)
      .map((testCase, index) => ({
        id: testCase.id || `secret_${index + 1}`,
        description: testCase.description,
        expression: testCase.expression,
        expected: testCase.expected,
      }));
    const publishable =
      Boolean(question.language === 'python') && publicTests.length > 0 && secretTests.length > 0;
    return {
      draftId: question.id,
      title: question.question.slice(0, 80),
      type: 'code',
      status: publishable ? 'published' : 'draft',
      source: 'legacy_quiz_scene',
      points: question.points ?? 1,
      tags: [],
      difficulty: 'hard',
      publicContent: {
        type: 'code',
        stem: question.question,
        language: 'python',
        starterCode: question.starterCode,
        functionSignature: undefined,
        constraints: [],
        publicTests,
        sampleIO: [],
        secretConfigPresent: secretTests.length > 0,
        explanation: question.explanation,
      },
      grading: {
        type: 'code',
        analysis: question.analysis,
        publishRequirementsMet: publishable,
      },
      secretJudge:
        secretTests.length > 0
          ? {
              language: 'python',
              secretTests,
              timeoutMs: 5000,
            }
          : undefined,
      sourceMeta: {
        sceneId: scene.id,
        sceneTitle: scene.title,
        legacyQuestionType: question.type,
      },
      validationErrors: [
        ...(question.language && question.language !== 'python' ? ['仅支持 Python 代码题'] : []),
        ...(publicTests.length === 0 ? ['缺少 public tests'] : []),
        ...(secretTests.length === 0 ? ['缺少 secret tests'] : []),
      ],
    };
  }

  if (question.type === 'code_tracing') {
    if ((question.options?.length ?? 0) > 0) {
      const choice = normalizeQuizChoiceType({
        ...question,
        type: 'single',
      });
      if (!choice) return null;
      return {
        ...choice,
        sourceMeta: {
          sceneId: scene.id,
          sceneTitle: scene.title,
          legacyQuestionType: question.type,
        },
      };
    }
    return {
      draftId: question.id,
      title: question.question.slice(0, 80),
      type: 'short_answer',
      status: 'published',
      source: 'legacy_quiz_scene',
      points: question.points ?? 1,
      tags: [],
      difficulty: 'medium',
      publicContent: {
        type: 'short_answer',
        stem: question.question,
        explanation: question.explanation,
      },
      grading: {
        type: 'short_answer',
        referenceAnswer:
          typeof question.answer === 'string'
            ? question.answer
            : typeof question.correctAnswer === 'string'
              ? question.correctAnswer
              : undefined,
        rubric: question.commentPrompt,
        analysis: question.analysis,
      },
      sourceMeta: {
        sceneId: scene.id,
        sceneTitle: scene.title,
        legacyQuestionType: question.type,
        codeSnippet: question.codeSnippet || '',
      },
      validationErrors: [],
    };
  }

  return null;
}

export function buildLegacyProblemDraftsFromScene(scene: Scene): NotebookProblemImportDraft[] {
  if (scene.type !== 'quiz' || scene.content.type !== 'quiz') return [];
  return scene.content.questions
    .map((question) => buildLegacyProblemDraftFromQuizQuestion(question, scene))
    .filter(Boolean) as NotebookProblemImportDraft[];
}

export function isNotebookCodeProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookCodeProblemRecord {
  return (
    problem.type === 'code' &&
    problem.publicContent.type === 'code' &&
    problem.grading.type === 'code'
  );
}

export function isNotebookChoiceProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookChoiceProblemRecord {
  return (
    problem.type === 'choice' &&
    problem.publicContent.type === 'choice' &&
    problem.grading.type === 'choice'
  );
}

export function isNotebookFillBlankProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookFillBlankProblemRecord {
  return (
    problem.type === 'fill_blank' &&
    problem.publicContent.type === 'fill_blank' &&
    problem.grading.type === 'fill_blank'
  );
}

export function isNotebookCalculationProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookCalculationProblemRecord {
  return (
    problem.type === 'calculation' &&
    problem.publicContent.type === 'calculation' &&
    problem.grading.type === 'calculation'
  );
}

export function isNotebookShortAnswerProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookShortAnswerProblemRecord {
  return (
    problem.type === 'short_answer' &&
    problem.publicContent.type === 'short_answer' &&
    problem.grading.type === 'short_answer'
  );
}

export function isNotebookProofProblemRecord(
  problem: NotebookProblemRecord,
): problem is NotebookProofProblemRecord {
  return (
    problem.type === 'proof' &&
    problem.publicContent.type === 'proof' &&
    problem.grading.type === 'proof'
  );
}
