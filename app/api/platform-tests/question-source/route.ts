import { NextRequest, NextResponse } from 'next/server';
import { Output } from 'ai';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  LOCAL_QUESTION_EMBEDDING_DIMENSIONS,
  LOCAL_QUESTION_EMBEDDING_MODEL,
  hybridRetrieve,
  loadLocalProblemBank,
  type LocalProblem,
  type RagCandidate,
  type RagQuery,
} from '@/features/qa/test-center/server/local-question-rag';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveOpenAIResponsesModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  notebookProblemGradingSchema,
  notebookProblemImportDraftSchema,
  notebookProblemPublicContentSchema,
  type NotebookProblemGrading,
  type NotebookProblemPublicContent,
} from '@/lib/problem-bank';

export const runtime = 'nodejs';

const MAX_RETRIEVAL_ROUNDS = 3;

const sourceCaseSchema = z.enum([
  'empty_no_notes',
  'empty_with_notes',
  'sufficient_bank',
  'partial_no_notes',
  'partial_with_notes',
]);

const requestSchema = z.object({
  courseCode: z.enum(['MAT136', 'CSC148']),
  sourceCase: sourceCaseSchema,
  topic: z.string().trim().min(1).max(500),
  requestedCount: z.number().int().min(1).max(12),
  partialBankSize: z.number().int().min(0).max(11).optional(),
  notebookContent: z.string().trim().max(30_000).optional().default(''),
});

const ragQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  purpose: z.string().trim().min(1).max(500),
  targetConcepts: z.array(z.string().trim().min(1)).min(1).max(12),
  desiredTypes: z.array(z.string().trim().min(1)).max(8),
  exclusions: z.array(z.string().trim().min(1)).max(8),
});

const retrievalPlanSchema = z.object({
  reasoning: z.array(z.string().trim().min(1)).min(1).max(12),
  queries: z.array(ragQuerySchema).min(1).max(6),
});

const acceptedCandidateSchema = z.object({
  id: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  coverage: z.array(z.string().trim().min(1)).min(1).max(8),
  roleInSet: z.string().trim().min(1),
  sourceEvidence: z.string().trim().min(1),
});

const rejectedCandidateSchema = z.object({
  id: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  failureType: z.enum([
    'irrelevant',
    'duplicate',
    'unanswerable',
    'wrong_difficulty',
    'poor_coverage',
    'other',
  ]),
});

const validationSchema = z.object({
  accepted: z.array(acceptedCandidateSchema).max(24),
  rejected: z.array(rejectedCandidateSchema).max(48),
  missingCoverage: z.array(z.string().trim().min(1)).max(12),
  nextQueries: z.array(ragQuerySchema).max(6),
  stop: z.boolean(),
  stopReason: z.string().trim().min(1),
});

const generatedChoiceOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(4000),
});

const generatedCodeTestSchema = z.object({
  id: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).nullable(),
  expression: z.string().trim().min(1).max(4000),
  expected: z.string().trim().min(1).max(4000),
});

const generatedCodeSampleSchema = z.object({
  input: z.string().trim().min(1).max(4000),
  output: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().max(2000).nullable(),
});

const generatedCodeSectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  kind: z.enum([
    'overview',
    'requirements',
    'interface',
    'invariants',
    'examples',
    'constraints',
    'notes',
  ]),
  body: z.string().trim().max(8000).nullable(),
  items: z.array(z.string().trim().min(1).max(1000)).max(20),
  code: z.string().max(24_000).nullable(),
  codeLanguage: z.string().trim().max(40).nullable(),
});

const generatedBlankSchema = z.object({
  id: z.string().trim().min(1).max(64),
  placeholder: z.string().trim().max(120).nullable(),
});

const generatedGradingBlankSchema = z.object({
  id: z.string().trim().min(1).max(64),
  acceptedAnswers: z.array(z.string().trim().min(1).max(1000)).min(1).max(16),
  caseSensitive: z.boolean(),
});

const generatedQuestionOutputSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^generated-\d+$/),
    title: z.string().trim().min(1),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    publicContent: z.object({
      type: z.enum(['short_answer', 'choice', 'proof', 'calculation', 'code', 'fill_blank']),
      stem: z.string().max(16_000),
      stemTemplate: z.string().max(12_000).nullable(),
      selectionMode: z.enum(['single', 'multiple']).nullable(),
      options: z.array(generatedChoiceOptionSchema).max(12),
      unit: z.string().trim().max(120).nullable(),
      explanation: z.string().trim().max(8000).nullable(),
      language: z.literal('python').nullable(),
      starterCode: z.string().max(40_000).nullable(),
      functionSignature: z.string().trim().max(4000).nullable(),
      constraints: z.array(z.string().trim().min(1).max(500)).max(16),
      publicTests: z.array(generatedCodeTestSchema).max(24),
      sampleIO: z.array(generatedCodeSampleSchema).max(12),
      statementSections: z.array(generatedCodeSectionSchema).max(10),
      starterCodeDescription: z.string().trim().max(1000).nullable(),
      blanks: z.array(generatedBlankSchema).max(12),
    }),
    grading: z.object({
      type: z.enum(['short_answer', 'choice', 'proof', 'calculation', 'code', 'fill_blank']),
      referenceAnswer: z.string().trim().max(40_000).nullable(),
      rubric: z.string().trim().max(12_000).nullable(),
      analysis: z.string().trim().max(12_000).nullable(),
      correctOptionIds: z.array(z.string().trim().min(1).max(64)).max(12),
      referenceProof: z.string().trim().max(16_000).nullable(),
      acceptedForms: z.array(z.string().trim().min(1).max(1000)).max(16),
      tolerance: z.number().nonnegative().nullable(),
      unit: z.string().trim().max(120).nullable(),
      blanks: z.array(generatedGradingBlankSchema).max(12),
      solutionCode: z.string().trim().max(40_000).nullable(),
      publishRequirementsMet: z.boolean(),
    }),
    tags: z.array(z.string().trim().min(1)).max(12),
    reason: z.string().trim().min(1),
    coverage: z.array(z.string().trim().min(1)).min(1).max(8),
    roleInSet: z.string().trim().min(1),
    sourceEvidence: z.string().trim().min(1),
    groundedIn: z.enum(['notebook', 'general_knowledge']),
  })
  .superRefine((question, context) => {
    if (question.publicContent.type !== question.grading.type) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grading', 'type'],
        message: 'grading.type must match publicContent.type',
      });
    }
    if (question.publicContent.type !== 'fill_blank' && !question.publicContent.stem.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicContent', 'stem'],
        message: 'stem is required for this problem type',
      });
    }
    if (
      question.publicContent.type === 'fill_blank' &&
      !question.publicContent.stemTemplate?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicContent', 'stemTemplate'],
        message: 'stemTemplate is required for fill_blank',
      });
    }
    if (question.publicContent.type === 'choice' && question.publicContent.options.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicContent', 'options'],
        message: 'choice questions require at least two options',
      });
    }
    if (question.grading.type === 'choice' && !question.grading.correctOptionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grading', 'correctOptionIds'],
        message: 'choice grading requires correctOptionIds',
      });
    }
    if (question.publicContent.type === 'fill_blank' && !question.publicContent.blanks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicContent', 'blanks'],
        message: 'fill_blank requires blanks',
      });
    }
    if (question.grading.type === 'fill_blank' && !question.grading.blanks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grading', 'blanks'],
        message: 'fill_blank grading requires accepted answers',
      });
    }
  });

function generationSchema(expectedCount: number) {
  return z
    .object({
      reasoning: z.array(z.string().trim().min(1)).min(1).max(12),
      generated: z.array(generatedQuestionOutputSchema).length(expectedCount),
    })
    .superRefine((result, context) => {
      const ids = result.generated.map((question) => question.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['generated'],
          message: 'generated question IDs must be unique',
        });
      }
    });
}

type SourceCase = z.infer<typeof sourceCaseSchema>;
type RetrievalPlan = z.infer<typeof retrievalPlanSchema>;
type AcceptedCandidate = z.infer<typeof acceptedCandidateSchema>;
type GeneratedQuestionOutput = z.infer<typeof generatedQuestionOutputSchema>;
type GeneratedQuestion = Omit<GeneratedQuestionOutput, 'publicContent' | 'grading'> & {
  publicContent: NotebookProblemPublicContent;
  grading: NotebookProblemGrading;
};

type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
};

type RetrievalRoundTrace = {
  round: number;
  queries: RagQuery[];
  candidates: Array<{
    id: string;
    title: string;
    hybridScore: number;
    semanticScore: number;
    lexicalScore: number;
    matchedQuery: string;
    decision: 'accepted' | 'rejected' | 'unreviewed';
    decisionReason: string | null;
    failureType: z.infer<typeof rejectedCandidateSchema>['failureType'] | null;
  }>;
  accepted: Array<{ id: string; title: string; reason: string }>;
  rejected: Array<{
    id: string;
    title: string;
    reason: string;
    failureType: z.infer<typeof rejectedCandidateSchema>['failureType'];
  }>;
  invalidIds: string[];
  protocolIssues: string[];
  missingCoverage: string[];
  nextQueries: RagQuery[];
  stopReason: string;
};

const CASE_LABELS: Record<SourceCase, string> = {
  empty_no_notes: '题库为空，笔记为空',
  empty_with_notes: '题库为空，有笔记内容',
  sufficient_bank: '题库题量充足',
  partial_no_notes: '题库不全，笔记为空',
  partial_with_notes: '题库不全，有笔记内容',
};

function usageSummary(
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
  } | null,
): UsageSummary {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
  };
}

function addUsage(total: UsageSummary, next: UsageSummary): UsageSummary {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cachedInputTokens: total.cachedInputTokens + next.cachedInputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

function problemPrompt(problem: LocalProblem): string {
  return [
    `ID: ${problem.id}`,
    `标题: ${problem.title}`,
    `Notebook: ${problem.notebookTitle || '未知'}`,
    `类型/难度: ${problem.type}/${problem.difficulty}`,
    `标签: ${problem.tags.join('、') || '无'}`,
    `题面: ${problem.question.slice(0, 1_800)}`,
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedChoiceOptions(value: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((option, index) => {
      if (typeof option === 'string' && option.trim()) {
        return { id: String.fromCharCode(65 + index), label: option.trim() };
      }
      const record = asRecord(option);
      const label = String(record.label ?? record.text ?? '').trim();
      if (!label) return null;
      return {
        id: String(record.id ?? String.fromCharCode(65 + index)).trim(),
        label,
      };
    })
    .filter((option): option is { id: string; label: string } => Boolean(option));
}

function normalizeLocalPublicContent(problem: LocalProblem): NotebookProblemPublicContent {
  const raw = asRecord(problem.publicContent);
  const stem = String(raw.stem ?? problem.question ?? problem.title).trim();
  const type = String(raw.type ?? problem.type);
  const common = {
    ...(typeof raw.explanation === 'string' ? { explanation: raw.explanation } : {}),
    ...(raw.assets ? { assets: raw.assets } : {}),
    ...(raw.translations ? { translations: raw.translations } : {}),
  };
  let candidate: unknown;

  if (type === 'choice') {
    const options = normalizedChoiceOptions(raw.options);
    candidate =
      options.length >= 2
        ? {
            ...common,
            type: 'choice',
            stem,
            selectionMode: raw.selectionMode === 'multiple' ? 'multiple' : 'single',
            options,
          }
        : { ...common, type: 'short_answer', stem };
  } else if (type === 'code') {
    candidate = {
      ...common,
      type: 'code',
      stem,
      language: 'python',
      ...(typeof raw.starterCode === 'string' ? { starterCode: raw.starterCode } : {}),
      ...(typeof raw.functionSignature === 'string'
        ? { functionSignature: raw.functionSignature }
        : {}),
      constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
      publicTests: Array.isArray(raw.publicTests) ? raw.publicTests : [],
      sampleIO: Array.isArray(raw.sampleIO) ? raw.sampleIO : [],
      ...(Array.isArray(raw.statementSections) ? { statementSections: raw.statementSections } : {}),
      ...(typeof raw.starterCodeDescription === 'string'
        ? { starterCodeDescription: raw.starterCodeDescription }
        : {}),
      secretConfigPresent: false,
    };
  } else if (type === 'fill_blank') {
    candidate = {
      ...common,
      type: 'fill_blank',
      stemTemplate: String(raw.stemTemplate ?? stem),
      blanks: Array.isArray(raw.blanks) ? raw.blanks : [],
    };
  } else if (type === 'proof' || type === 'calculation' || type === 'short_answer') {
    candidate = {
      ...common,
      type,
      stem,
      ...(type === 'calculation' && typeof raw.unit === 'string' ? { unit: raw.unit } : {}),
    };
  } else {
    candidate = { ...common, type: 'short_answer', stem };
  }

  const parsed = notebookProblemPublicContentSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return { type: 'short_answer', stem };
}

function publicQuestionText(content: NotebookProblemPublicContent): string {
  if (content.type === 'fill_blank') return content.stemTemplate;
  return content.stem;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}

function validateLocalQuestionFormat(content: NotebookProblemPublicContent) {
  const result = notebookProblemPublicContentSchema.safeParse(content);
  return {
    valid: result.success,
    schema: 'NotebookProblemPublicContent' as const,
    issues: result.success ? [] : formatIssues(result.error),
  };
}

function generatedDraft(question: GeneratedQuestion) {
  return {
    draftId: question.id,
    title: question.title,
    type: question.publicContent.type,
    status: 'draft' as const,
    source: 'chat' as const,
    points: 1,
    tags: question.tags,
    difficulty: question.difficulty,
    publicContent: question.publicContent,
    grading: question.grading,
    sourceMeta: {
      generatedBy: 'question-source-routing-test',
      groundedIn: question.groundedIn,
    },
    validationErrors: [],
  };
}

function validateGeneratedQuestionFormat(question: GeneratedQuestion) {
  const result = notebookProblemImportDraftSchema.safeParse(generatedDraft(question));
  return {
    valid: result.success,
    schema: 'NotebookProblemImportDraft' as const,
    issues: result.success ? [] : formatIssues(result.error),
  };
}

function materializeGeneratedQuestion(question: GeneratedQuestionOutput): GeneratedQuestion {
  const content = question.publicContent;
  const common = {
    ...(content.explanation ? { explanation: content.explanation } : {}),
  };
  let publicContentInput: unknown;

  if (content.type === 'choice') {
    publicContentInput = {
      ...common,
      type: 'choice',
      stem: content.stem,
      selectionMode: content.selectionMode ?? 'single',
      options: content.options,
    };
  } else if (content.type === 'code') {
    publicContentInput = {
      ...common,
      type: 'code',
      stem: content.stem,
      language: 'python',
      ...(content.starterCode ? { starterCode: content.starterCode } : {}),
      ...(content.functionSignature ? { functionSignature: content.functionSignature } : {}),
      constraints: content.constraints,
      publicTests: content.publicTests.map((test) => ({
        id: test.id,
        ...(test.description ? { description: test.description } : {}),
        expression: test.expression,
        expected: test.expected,
      })),
      sampleIO: content.sampleIO.map((sample) => ({
        input: sample.input,
        output: sample.output,
        ...(sample.explanation ? { explanation: sample.explanation } : {}),
      })),
      ...(content.statementSections.length
        ? {
            statementSections: content.statementSections.map((section) => ({
              id: section.id,
              title: section.title,
              kind: section.kind,
              ...(section.body ? { body: section.body } : {}),
              items: section.items,
              ...(section.code ? { code: section.code } : {}),
              ...(section.codeLanguage ? { codeLanguage: section.codeLanguage } : {}),
            })),
          }
        : {}),
      ...(content.starterCodeDescription
        ? { starterCodeDescription: content.starterCodeDescription }
        : {}),
      secretConfigPresent: false,
    };
  } else if (content.type === 'fill_blank') {
    publicContentInput = {
      ...common,
      type: 'fill_blank',
      stemTemplate: content.stemTemplate,
      blanks: content.blanks.map((blank) => ({
        id: blank.id,
        ...(blank.placeholder ? { placeholder: blank.placeholder } : {}),
      })),
    };
  } else {
    publicContentInput = {
      ...common,
      type: content.type,
      stem: content.stem,
      ...(content.type === 'calculation' && content.unit ? { unit: content.unit } : {}),
    };
  }

  const publicContent = notebookProblemPublicContentSchema.parse(publicContentInput);
  const grading = question.grading;
  let gradingInput: unknown;
  if (grading.type === 'choice') {
    gradingInput = {
      type: 'choice',
      correctOptionIds: grading.correctOptionIds,
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
    };
  } else if (grading.type === 'proof') {
    gradingInput = {
      type: 'proof',
      ...(grading.referenceProof ? { referenceProof: grading.referenceProof } : {}),
      ...(grading.rubric ? { rubric: grading.rubric } : {}),
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
    };
  } else if (grading.type === 'calculation') {
    gradingInput = {
      type: 'calculation',
      ...(grading.referenceAnswer ? { referenceAnswer: grading.referenceAnswer } : {}),
      acceptedForms: grading.acceptedForms,
      ...(grading.tolerance !== null ? { tolerance: grading.tolerance } : {}),
      ...(grading.unit ? { unit: grading.unit } : {}),
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
    };
  } else if (grading.type === 'fill_blank') {
    gradingInput = {
      type: 'fill_blank',
      blanks: grading.blanks,
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
    };
  } else if (grading.type === 'code') {
    gradingInput = {
      type: 'code',
      ...(grading.referenceAnswer ? { referenceAnswer: grading.referenceAnswer } : {}),
      ...(grading.solutionCode ? { solutionCode: grading.solutionCode } : {}),
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
      publishRequirementsMet: grading.publishRequirementsMet,
    };
  } else {
    gradingInput = {
      type: 'short_answer',
      ...(grading.referenceAnswer ? { referenceAnswer: grading.referenceAnswer } : {}),
      ...(grading.rubric ? { rubric: grading.rubric } : {}),
      ...(grading.analysis ? { analysis: grading.analysis } : {}),
    };
  }

  return {
    ...question,
    publicContent,
    grading: notebookProblemGradingSchema.parse(gradingInput),
  };
}

function retrievalPlanPrompt(args: {
  sourceCase: SourceCase;
  courseCode: string;
  topic: string;
  requestedCount: number;
  notebookContent: string;
}): string {
  return `你是学习 Agent 的题库检索规划器。你的任务不是直接选题，而是先制定可执行的检索计划，供下一阶段在本地题库中做向量与关键词混合检索。

测试状态：${CASE_LABELS[args.sourceCase]}
课程：${args.courseCode}
用户主题：${args.topic}
目标题量：${args.requestedCount}
是否有可用于补题的笔记：${args.notebookContent.trim() ? '有' : '无'}

要求：
1. 先解释你把用户主题拆成了哪些知识点、题型与难度层次。
2. 给出 3-6 条互补的检索语句。检索语句可以包含中英文术语、同义词、典型题型或技能动作，但不能编造题库 ID。
3. 每条 query 都要说明 purpose、目标概念、偏好的题型和需要排除的内容。
4. 检索计划应通用于不同课程；不要假设某个固定题库一定含有某道题。
5. 即使题库为空，也必须生成计划；后续会明确记录“无可检索语料”，而不是跳过你的判断。
6. 只返回结构化结果，不输出 Markdown。`;
}

function validationPrompt(args: {
  courseCode: string;
  topic: string;
  requestedCount: number;
  accepted: Array<{ selection: AcceptedCandidate; problem: LocalProblem }>;
  candidates: RagCandidate[];
  round: number;
}): string {
  const acceptedText = args.accepted.length
    ? args.accepted
        .map(({ selection, problem }) => `${problem.id} · ${problem.title}：${selection.reason}`)
        .join('\n')
    : '尚未接受任何题目。';
  const candidateText = args.candidates
    .map(
      (candidate, index) => `候选 ${index + 1}
混合分=${candidate.hybridScore.toFixed(4)}；语义分=${candidate.semanticScore.toFixed(4)}；关键词分=${candidate.lexicalScore.toFixed(4)}
命中的检索语句：${candidate.matchedQuery}
${problemPrompt(candidate.problem)}`,
    )
    .join('\n\n');

  return `你是学习 Agent 的题库候选验证器。这是第 ${args.round} 轮。你必须逐题检查 RAG 返回结果，而不是相信排序分数。

课程：${args.courseCode}
用户主题：${args.topic}
目标题量：${args.requestedCount}

已接受题目：
${acceptedText}

本轮候选：
${candidateText || '本轮没有候选。'}

验证规则：
1. 每个候选 ID 必须且只能出现在 accepted 或 rejected 中一次；不能返回未提供的 ID。
2. 接受题目时，要同时考虑主题相关性、可作答性、重复度、难度梯度与整套题的覆盖结构。
3. 不能只因为标题相似就接受；要检查题面、标签与 notebook 证据。
4. 每道接受题必须解释总体理由、覆盖内容、在整套题中的作用，以及具体题源证据。
5. 拒绝题必须给出 failureType 与可检查的具体原因。
6. 如果尚未达到目标题量，nextQueries 必须针对 missingCoverage 或本轮失败原因重新改写检索词；不能原样重复无效 query。
7. 只有当题量和覆盖都已足够，或确定继续检索没有意义时，stop 才能为 true，并在 stopReason 中明确原因。
8. 这一步不能生成新题，只能验证本轮真实候选。
9. 只返回结构化结果，不输出 Markdown。`;
}

function generationPrompt(args: {
  sourceCase: SourceCase;
  courseCode: string;
  topic: string;
  requestedCount: number;
  missingCount: number;
  accepted: Array<{ selection: AcceptedCandidate; problem: LocalProblem }>;
  notebookContent: string;
  missingCoverage: string[];
}): string {
  const grounding = args.notebookContent.trim() ? 'notebook' : 'general_knowledge';
  const acceptedText = args.accepted.length
    ? args.accepted.map(({ problem }) => `${problem.id} · ${problem.title}`).join('\n')
    : '没有题库题被接受。';
  return `你是学习 Agent 的缺口补题生成器。RAG 与候选验证已经结束，现在只补足缺少的题目。

测试状态：${CASE_LABELS[args.sourceCase]}
课程：${args.courseCode}
用户主题：${args.topic}
目标总题量：${args.requestedCount}
需要补题：${args.missingCount}
已接受题库题：
${acceptedText}
验证阶段指出的覆盖缺口：${args.missingCoverage.join('、') || '没有额外说明'}

依据边界：
${args.notebookContent.trim() ? args.notebookContent.slice(0, 20_000) : '没有 Mock 笔记。只能依据该课程主题的一般知识生成，不得声称来自题库或笔记。'}

要求：
1. 必须生成恰好 ${args.missingCount} 道完整、可独立作答且互不重复的题。
2. groundedIn 必须是 ${grounding}。
3. 有笔记时，sourceEvidence 要引用笔记里的具体概念、方法或例子；没有笔记时，要明确说明一般知识边界。
4. 避开已经接受的题目，并优先填补 missingCoverage；题型与难度要形成合理组合。
5. generated ID 使用 generated-1、generated-2 等，不得冒充题库 ID。
6. 每道题都要给出选择理由、覆盖点、组合价值和题源证据。
7. 每道题必须使用正式 NotebookProblem 格式：difficulty 只能是 easy / medium / hard；publicContent.type 与 grading.type 必须一致。
8. publicContent 按题型完整填写：choice 必须提供 selectionMode 和 2-12 个 {id,label} 选项；code 必须提供 Python stem，并在需要时提供 starterCode、constraints、publicTests 或 sampleIO；fill_blank 必须提供 stemTemplate 和 blanks；其余题型必须提供 stem。
9. grading 必须能让该题实际判分：choice 给 correctOptionIds；fill_blank 给每空 acceptedAnswers；code 给 referenceAnswer 或 solutionCode；short_answer / proof / calculation 给参考答案、证明或分析中的至少一项。
10. 不得把选项、起始代码、约束、样例输入输出塞进一个简化 question 字符串来冒充结构化题目。
11. 输出契约为了兼容模型接口是扁平结构：当前题型不用的字段也必须返回，字符串用 null、数组用 []；服务端会按 type 还原后再次用正式联合类型校验。
12. 只返回结构化结果，不输出 Markdown。`;
}

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/platform-tests/question-source',
    () =>
      safeRoute(async () => {
        const parsed = requestSchema.safeParse(await request.json());
        if (!parsed.success) {
          return NextResponse.json(
            {
              error: 'Invalid local question-source test request',
              details: parsed.error.flatten(),
            },
            { status: 400 },
          );
        }

        const input = parsed.data;
        const bank = await loadLocalProblemBank(input.courseCode);
        const { model, modelString } = await resolveOpenAIResponsesModelFromHeaders(request, {
          allowOpenAIModelOverride: true,
        });
        let aggregateUsage: UsageSummary = {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          totalTokens: 0,
        };

        const plannerResult = await callLLM(
          {
            model,
            system:
              'You plan diverse, evidence-aware retrieval queries for a learning-agent problem bank. Do not select or invent questions in this stage.',
            prompt: retrievalPlanPrompt(input),
            output: Output.object({ schema: retrievalPlanSchema }),
            maxOutputTokens: 5_000,
            maxRetries: 0,
          },
          'platform-test-question-retrieval-plan',
        );
        aggregateUsage = addUsage(aggregateUsage, usageSummary(plannerResult.usage));
        const plan = plannerResult.output as RetrievalPlan;

        const isEmpty = input.sourceCase.startsWith('empty_');
        const isPartial = input.sourceCase.startsWith('partial_');
        let visibleProblemIds: Set<string>;
        let corpusPreparation: string;

        if (isEmpty) {
          visibleProblemIds = new Set();
          corpusPreparation =
            '该测试状态把可见题库设为空；检索计划仍被保留，但没有语料可执行 RAG。';
        } else if (isPartial) {
          const partialSize = Math.min(
            bank.problemCount,
            input.partialBankSize ?? Math.max(1, input.requestedCount - 2),
          );
          const prepared = await hybridRetrieve({
            bank,
            queries: plan.queries,
            limit: partialSize,
          });
          visibleProblemIds = new Set(prepared.map((candidate) => candidate.problem.id));
          corpusPreparation = `先按 AI 检索计划从本地快照中构造 ${visibleProblemIds.size} 道题的“不完整题库”，随后所有正式检索只在这部分可见语料中进行。`;
        } else {
          visibleProblemIds = new Set(bank.problems.map((problem) => problem.id));
          corpusPreparation = `本轮允许检索本地快照中的全部 ${visibleProblemIds.size} 道题。`;
        }

        const acceptedById = new Map<
          string,
          { selection: AcceptedCandidate; problem: LocalProblem }
        >();
        const reviewedIds = new Set<string>();
        const traces: RetrievalRoundTrace[] = [];
        let roundQueries: RagQuery[] = plan.queries;
        let finalStopReason = isEmpty ? '题库为空，无法执行 RAG；进入缺口补题阶段。' : '';
        let latestMissingCoverage: string[] = [];

        for (
          let round = 1;
          round <= MAX_RETRIEVAL_ROUNDS && visibleProblemIds.size > 0;
          round += 1
        ) {
          const candidates = await hybridRetrieve({
            bank,
            availableProblemIds: visibleProblemIds,
            queries: roundQueries,
            excludeProblemIds: reviewedIds,
            limit: Math.min(30, Math.max(12, input.requestedCount * 4)),
          });

          if (!candidates.length) {
            finalStopReason = `第 ${round} 轮没有新的候选题，停止检索。`;
            traces.push({
              round,
              queries: roundQueries,
              candidates: [],
              accepted: [],
              rejected: [],
              invalidIds: [],
              protocolIssues: [],
              missingCoverage: latestMissingCoverage,
              nextQueries: [],
              stopReason: finalStopReason,
            });
            break;
          }

          const validationResult = await callLLM(
            {
              model,
              system:
                'You validate every RAG candidate for relevance, answerability, diversity, and set-level coverage. Never generate questions or invent candidate IDs.',
              prompt: validationPrompt({
                courseCode: input.courseCode,
                topic: input.topic,
                requestedCount: input.requestedCount,
                accepted: [...acceptedById.values()],
                candidates,
                round,
              }),
              output: Output.object({ schema: validationSchema }),
              maxOutputTokens: 9_000,
              maxRetries: 0,
            },
            `platform-test-question-candidate-validation-round-${round}`,
          );
          aggregateUsage = addUsage(aggregateUsage, usageSummary(validationResult.usage));
          const validation = validationResult.output as z.infer<typeof validationSchema>;
          const candidateById = new Map(
            candidates.map((candidate) => [candidate.problem.id, candidate]),
          );
          const acceptedThisRound: RetrievalRoundTrace['accepted'] = [];
          const rejectedThisRound: RetrievalRoundTrace['rejected'] = [];
          const invalidIds: string[] = [];
          const protocolIssues: string[] = [];
          const decisionById = new Map<
            string,
            {
              decision: 'accepted' | 'rejected';
              reason: string;
              failureType: z.infer<typeof rejectedCandidateSchema>['failureType'] | null;
            }
          >();

          for (const selection of validation.accepted) {
            const candidate = candidateById.get(selection.id);
            if (!candidate) {
              invalidIds.push(selection.id);
              continue;
            }
            if (decisionById.has(selection.id)) {
              protocolIssues.push(`候选 ${selection.id} 被 AI 重复分类。`);
              continue;
            }
            if (acceptedById.size >= input.requestedCount) {
              protocolIssues.push(
                `AI 接受了超出目标题量的候选 ${selection.id}；该题未进入最终结果。`,
              );
              decisionById.set(selection.id, {
                decision: 'rejected',
                reason: '超出目标题量，协议层未纳入最终结果。',
                failureType: 'other',
              });
              continue;
            }
            acceptedById.set(selection.id, { selection, problem: candidate.problem });
            acceptedThisRound.push({
              id: selection.id,
              title: candidate.problem.title,
              reason: selection.reason,
            });
            decisionById.set(selection.id, {
              decision: 'accepted',
              reason: selection.reason,
              failureType: null,
            });
          }

          for (const rejection of validation.rejected) {
            const candidate = candidateById.get(rejection.id);
            if (!candidate) {
              invalidIds.push(rejection.id);
              continue;
            }
            if (decisionById.has(rejection.id)) {
              protocolIssues.push(`候选 ${rejection.id} 同时出现在 accepted 与 rejected。`);
              continue;
            }
            rejectedThisRound.push({
              id: rejection.id,
              title: candidate.problem.title,
              reason: rejection.reason,
              failureType: rejection.failureType,
            });
            decisionById.set(rejection.id, {
              decision: 'rejected',
              reason: rejection.reason,
              failureType: rejection.failureType,
            });
          }

          for (const candidate of candidates) reviewedIds.add(candidate.problem.id);
          latestMissingCoverage = validation.missingCoverage;
          const reachedTarget = acceptedById.size >= input.requestedCount;
          const stopReason = reachedTarget
            ? `已接受 ${acceptedById.size} 道题，达到目标题量。`
            : validation.stopReason;

          traces.push({
            round,
            queries: roundQueries,
            candidates: candidates.map((candidate) => {
              const decision = decisionById.get(candidate.problem.id);
              return {
                id: candidate.problem.id,
                title: candidate.problem.title,
                hybridScore: candidate.hybridScore,
                semanticScore: candidate.semanticScore,
                lexicalScore: candidate.lexicalScore,
                matchedQuery: candidate.matchedQuery,
                decision: decision?.decision ?? 'unreviewed',
                decisionReason: decision?.reason ?? null,
                failureType: decision?.failureType ?? null,
              };
            }),
            accepted: acceptedThisRound,
            rejected: rejectedThisRound,
            invalidIds: Array.from(new Set(invalidIds)),
            protocolIssues,
            missingCoverage: validation.missingCoverage,
            nextQueries: validation.nextQueries,
            stopReason,
          });

          if (reachedTarget) {
            finalStopReason = stopReason;
            break;
          }
          if (validation.stop) {
            finalStopReason = validation.stopReason;
            break;
          }
          if (!validation.nextQueries.length) {
            finalStopReason = `第 ${round} 轮未达到目标，但 AI 没有给出新的检索词，停止检索。`;
            break;
          }
          if (round === MAX_RETRIEVAL_ROUNDS) {
            finalStopReason = `达到最多 ${MAX_RETRIEVAL_ROUNDS} 轮检索，仍有题量或覆盖缺口。`;
            break;
          }
          roundQueries = validation.nextQueries;
        }

        if (!finalStopReason) {
          finalStopReason = `检索结束，共接受 ${acceptedById.size} 道题。`;
        }

        const missingCount = Math.max(0, input.requestedCount - acceptedById.size);
        const generationAllowed = input.sourceCase !== 'sufficient_bank';
        let generated: GeneratedQuestion[] = [];
        let generationReasoning: string[] = [];

        if (missingCount > 0 && generationAllowed) {
          const generationResult = await callLLM(
            {
              model,
              system:
                'You generate only the missing questions after retrieval has finished. Preserve provenance and never impersonate local problem-bank questions.',
              prompt: generationPrompt({
                ...input,
                missingCount,
                accepted: [...acceptedById.values()],
                missingCoverage: latestMissingCoverage,
              }),
              output: Output.object({ schema: generationSchema(missingCount) }),
              maxOutputTokens: 12_000,
              maxRetries: 0,
            },
            'platform-test-question-gap-generation',
          );
          aggregateUsage = addUsage(aggregateUsage, usageSummary(generationResult.usage));
          const generation = generationResult.output as z.infer<
            ReturnType<typeof generationSchema>
          >;
          generated = generation.generated.map(materializeGeneratedQuestion);
          generationReasoning = generation.reasoning;
        }

        const accepted = [...acceptedById.values()];
        const route =
          input.sourceCase === 'sufficient_bank'
            ? 'select_only'
            : accepted.length && generated.length
              ? 'mixed'
              : accepted.length
                ? 'select_only'
                : 'generate_only';
        const invalidSelectedExisting = traces.reduce(
          (total, trace) => total + trace.invalidIds.length,
          0,
        );
        const questions = [
          ...accepted.map(({ problem, selection }) => {
            const publicContent = normalizeLocalPublicContent(problem);
            return {
              id: problem.id,
              title: problem.title,
              type: publicContent.type,
              difficulty: problem.difficulty,
              question: publicQuestionText(publicContent),
              publicContent,
              summary: problem.tags.join('、'),
              sectionTitle: problem.notebookTitle,
              reason: selection.reason,
              coverage: selection.coverage,
              roleInSet: selection.roleInSet,
              sourceEvidence: selection.sourceEvidence,
              source: 'local_problem_bank' as const,
              formatValidation: validateLocalQuestionFormat(publicContent),
            };
          }),
          ...generated.map((problem) => ({
            id: problem.id,
            title: problem.title,
            type: problem.publicContent.type,
            difficulty: problem.difficulty,
            question: publicQuestionText(problem.publicContent),
            publicContent: problem.publicContent,
            grading: problem.grading,
            summary: problem.tags.join('、'),
            sectionTitle: null,
            reason: problem.reason,
            coverage: problem.coverage,
            roleInSet: problem.roleInSet,
            sourceEvidence: problem.sourceEvidence,
            source: 'ai_generated' as const,
            groundedIn: problem.groundedIn,
            formatValidation: validateGeneratedQuestionFormat(problem),
          })),
        ];
        const returnedCount = questions.length;
        const invalidFormatQuestions = questions.filter(
          (question) => !question.formatValidation.valid,
        );
        const expectedGrounding = input.notebookContent.trim()
          ? ('notebook' as const)
          : ('general_knowledge' as const);
        const provenancePassed = generated.every(
          (question) =>
            question.id.startsWith('generated-') && question.groundedIn === expectedGrounding,
        );
        const evaluationChecks = [
          {
            id: 'requested_count' as const,
            label: '返回题量符合请求',
            passed: returnedCount === input.requestedCount,
            detail: `请求 ${input.requestedCount} 题，实际返回 ${returnedCount} 题。`,
          },
          {
            id: 'question_format' as const,
            label: '题目符合正式数据格式',
            passed: invalidFormatQuestions.length === 0,
            detail: invalidFormatQuestions.length
              ? `${invalidFormatQuestions.length} 道题未通过 NotebookProblem 结构校验。`
              : `${returnedCount} 道题均通过对应的 NotebookProblem 结构校验。`,
          },
          {
            id: 'source_provenance' as const,
            label: '题源与补题依据可追溯',
            passed: provenancePassed,
            detail: generated.length
              ? `${generated.length} 道 AI 补题均使用 generated-* ID，并声明依据为${expectedGrounding === 'notebook' ? '当前 Mock 笔记' : '一般课程知识'}。`
              : '本次没有 AI 补题；返回项全部来自本地题库。',
          },
        ];

        return NextResponse.json({
          sourceCase: input.sourceCase,
          courseCode: input.courseCode,
          courseName: bank.courseName,
          topic: input.topic,
          requestedCount: input.requestedCount,
          localBank: {
            totalCount: bank.problemCount,
            candidateCount: visibleProblemIds.size,
            source: bank.source,
            sourceExportedAt: bank.sourceExportedAt,
          },
          notebookProvided: Boolean(input.notebookContent.trim()),
          decision: {
            route,
            reasoning: [...plan.reasoning, finalStopReason, ...generationReasoning],
            trace: {
              plannerReasoning: plan.reasoning,
              initialQueries: plan.queries,
              corpusPreparation,
              embeddingModel: LOCAL_QUESTION_EMBEDDING_MODEL,
              embeddingDimensions: LOCAL_QUESTION_EMBEDDING_DIMENSIONS,
              maxRounds: MAX_RETRIEVAL_ROUNDS,
              visibleProblemCount: visibleProblemIds.size,
              rounds: traces,
              generation:
                missingCount > 0
                  ? {
                      needed: missingCount,
                      generated: generated.length,
                      allowed: generationAllowed,
                      grounding: input.notebookContent.trim()
                        ? ('notebook' as const)
                        : ('general_knowledge' as const),
                      reasoning: generationReasoning,
                    }
                  : null,
              finalStopReason,
            },
          },
          questions,
          counts: {
            rawSelectedExisting: accepted.length + invalidSelectedExisting,
            validSelectedExisting: accepted.length,
            invalidSelectedExisting,
            generated: generated.length,
            returned: returnedCount,
          },
          evaluation: {
            passed: evaluationChecks.every((check) => check.passed),
            checks: evaluationChecks,
          },
          model: modelString,
          usage: aggregateUsage,
        });
      }),
    {
      operationCode: 'platform_test_question_source_routing',
      chargeReason: '本地题库与 Mock 笔记的 AI 检索、RAG 验证与补题测试',
    },
  );
}
