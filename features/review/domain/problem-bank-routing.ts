import type { QuizQuestion } from '@/lib/types/stage';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import type { ProblemBankLearningProfile } from '@/lib/learning/problem-bank-profile';

export type ReviewRouteCandidateProblem = {
  id: string;
  title: string;
  type: string;
  concepts: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'unattempted' | 'passed' | 'failed' | 'partial' | 'error';
  score: number | null;
  tags: string[];
  preview?: string;
};

const UTILITY_TAGS = new Set(['ai_supplement', 'wrong_problem', 'thin_bank', 'untried', 'review']);

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeConcept(value: string): string {
  return normalizeText(value).slice(0, 40);
}

function getPublicStem(problem: NotebookProblemClientRecord): string {
  const content = problem.publicContent;
  if ('stem' in content) return normalizeText(content.stem);
  if ('stemTemplate' in content) return normalizeText(content.stemTemplate);
  return normalizeText(problem.title);
}

export function getNotebookProblemConcepts(problem: NotebookProblemClientRecord): string[] {
  const tags = problem.tags
    .map(normalizeConcept)
    .filter(Boolean)
    .filter((tag) => !UTILITY_TAGS.has(tag));
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return [normalizeConcept(problem.title)].filter(Boolean);
}

function getCandidateStatus(
  problem: NotebookProblemClientRecord,
): ReviewRouteCandidateProblem['status'] {
  const status = problem.latestAttempt?.status;
  if (status === 'passed' || status === 'failed' || status === 'partial' || status === 'error') {
    return status;
  }
  return 'unattempted';
}

function candidateProblemFromNotebookProblem(
  problem: NotebookProblemClientRecord,
): ReviewRouteCandidateProblem | null {
  if (problem.status === 'archived') return null;
  return {
    id: problem.id,
    title: problem.title,
    type: problem.type,
    concepts: getNotebookProblemConcepts(problem),
    difficulty: problem.difficulty,
    status: getCandidateStatus(problem),
    score: problem.latestAttempt?.score ?? null,
    tags: problem.tags,
    preview: getPublicStem(problem).slice(0, 260) || problem.title,
  };
}

function scoreCandidateProblem(args: {
  problem: ReviewRouteCandidateProblem;
  profile: ProblemBankLearningProfile | null;
  expectedConcepts: string[];
}): number {
  const concepts = new Set(args.problem.concepts);
  const expected = new Set(args.expectedConcepts.map(normalizeConcept).filter(Boolean));
  const weak = new Set(args.profile?.weakConcepts ?? []);
  const untried = new Set(args.profile?.untriedConcepts ?? []);
  const thin = new Set(args.profile?.thinConcepts ?? []);
  const missing = new Set(args.profile?.missingConcepts ?? []);
  const mastered = new Set(args.profile?.masteredConcepts ?? []);
  let score = 0;

  concepts.forEach((concept) => {
    if (expected.has(concept)) score += 3;
    if (weak.has(concept)) score += 8;
    if (untried.has(concept)) score += 7;
    if (thin.has(concept)) score += 6;
    if (missing.has(concept)) score += 6;
    if (mastered.has(concept)) score += 1;
  });

  if (args.problem.status === 'failed') score += 8;
  if (args.problem.status === 'partial' || args.problem.status === 'error') score += 5;
  if (args.problem.status === 'unattempted') score += 3;
  if (args.problem.difficulty === 'hard') score += 2;
  if (args.problem.type === 'proof' || args.problem.type === 'code') score += 1;
  return score;
}

export function buildReviewRouteCandidateProblems(args: {
  problems: NotebookProblemClientRecord[];
  profile: ProblemBankLearningProfile | null;
  expectedConcepts: string[];
  limit?: number;
}): ReviewRouteCandidateProblem[] {
  const limit = args.limit ?? 36;
  return args.problems
    .map(candidateProblemFromNotebookProblem)
    .filter((problem): problem is ReviewRouteCandidateProblem => Boolean(problem))
    .map((problem, index) => ({
      problem,
      index,
      rank: scoreCandidateProblem({
        problem,
        profile: args.profile,
        expectedConcepts: args.expectedConcepts,
      }),
    }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((item) => item.problem)
    .slice(0, limit);
}

function analysisForProblem(problem: NotebookProblemClientRecord): string | undefined {
  if ('analysis' in problem.grading && problem.grading.analysis) return problem.grading.analysis;
  return problem.publicContent.explanation;
}

function answerForOpenProblem(problem: NotebookProblemClientRecord): string | undefined {
  const grading = problem.grading;
  if (grading.type === 'short_answer') return grading.referenceAnswer;
  if (grading.type === 'proof') return grading.referenceProof;
  if (grading.type === 'calculation') return grading.referenceAnswer ?? grading.acceptedForms[0];
  if (grading.type === 'fill_blank') {
    return grading.blanks
      .map((blank) => `${blank.id}: ${blank.acceptedAnswers.join(' / ')}`)
      .join('\n');
  }
  return undefined;
}

function commentPromptForProblem(problem: NotebookProblemClientRecord): string | undefined {
  const grading = problem.grading;
  if (grading.type === 'short_answer') return grading.rubric;
  if (grading.type === 'proof') return grading.rubric;
  if (grading.type === 'calculation') {
    return [
      grading.acceptedForms.length ? `可接受形式：${grading.acceptedForms.join('；')}` : '',
      typeof grading.tolerance === 'number' ? `容差：${grading.tolerance}` : '',
      grading.unit ? `单位：${grading.unit}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (grading.type === 'fill_blank') {
    return grading.blanks
      .map((blank) => `${blank.id} 可接受答案：${blank.acceptedAnswers.join(' / ')}`)
      .join('\n');
  }
  return undefined;
}

export function notebookProblemToQuizQuestion(
  problem: NotebookProblemClientRecord,
): QuizQuestion | null {
  if (problem.status === 'archived') return null;

  const content = problem.publicContent;
  const analysis = analysisForProblem(problem);
  const base = {
    id: `problem-${problem.id}`,
    question: getPublicStem(problem),
    analysis,
    explanation: content.explanation,
    points: Math.max(1, problem.points || 1),
  } satisfies Partial<QuizQuestion>;

  if (content.type === 'choice' && problem.grading.type === 'choice') {
    return {
      ...base,
      type: content.selectionMode === 'multiple' ? 'multiple' : 'single',
      options: content.options.map((option) => ({ label: option.label, value: option.id })),
      answer: problem.grading.correctOptionIds,
    } as QuizQuestion;
  }

  if (content.type === 'code') {
    return {
      ...base,
      type: 'code',
      question: [
        content.stem,
        content.functionSignature ? `函数签名：${content.functionSignature}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      starterCode: content.starterCode,
      language: content.language,
      testCases: content.publicTests.map((testCase, index) => ({
        id: testCase.id || `case-${index + 1}`,
        description: testCase.description,
        expression: testCase.expression,
        expected: testCase.expected,
      })),
    } as QuizQuestion;
  }

  if (content.type === 'proof') {
    return {
      ...base,
      type: 'proof',
      answer: answerForOpenProblem(problem),
      proof: problem.grading.type === 'proof' ? problem.grading.referenceProof : undefined,
      commentPrompt: commentPromptForProblem(problem),
    } as QuizQuestion;
  }

  return {
    ...base,
    type: 'short_answer',
    question:
      content.type === 'fill_blank'
        ? `${content.stemTemplate}\n\n请按空格顺序写出答案，并保留必要步骤。`
        : getPublicStem(problem),
    answer: answerForOpenProblem(problem),
    commentPrompt: commentPromptForProblem(problem),
  } as QuizQuestion;
}
