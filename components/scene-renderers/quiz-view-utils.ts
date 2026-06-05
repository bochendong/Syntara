import { createLogger } from '@/lib/logger';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import type { QuizCodeReport, QuizQuestion } from '@/lib/types/stage';

const log = createLogger('QuizView');

export type AnswerValue = string | string[];

export interface QuestionResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
  codeReport?: QuizCodeReport;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function toArray(v: AnswerValue | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function isObjectiveQuestion(q: QuizQuestion): boolean {
  return (
    q.type === 'single' ||
    q.type === 'multiple' ||
    q.type === 'multiple_choice' ||
    (q.type === 'code_tracing' && (q.options?.length ?? 0) > 0)
  );
}

export function isTextQuestion(q: QuizQuestion): boolean {
  return q.type === 'short_answer' || q.type === 'proof' || q.type === 'code_tracing';
}

export function isCodeQuestion(q: QuizQuestion): boolean {
  return q.type === 'code';
}

export function getEffectiveAnswer(
  q: QuizQuestion,
  answer: AnswerValue | undefined,
): AnswerValue | undefined {
  if (answer != null) return answer;
  if (isCodeQuestion(q) && q.starterCode) return q.starterCode;
  return answer;
}

export function getEffectiveTextAnswer(q: QuizQuestion, answer: AnswerValue | undefined): string {
  const effective = getEffectiveAnswer(q, answer);
  if (Array.isArray(effective)) return effective.join(', ');
  return effective ?? '';
}

export function getLanguageDisplayName(language?: string): string {
  const normalized = (language ?? 'python').trim().toLowerCase();
  switch (normalized) {
    case 'c++':
    case 'cpp':
    case 'cc':
      return 'C++';
    case 'c':
      return 'C';
    case 'c#':
    case 'csharp':
      return 'C#';
    case 'javascript':
    case 'js':
      return 'JavaScript';
    case 'typescript':
    case 'ts':
      return 'TypeScript';
    case 'python':
    case 'py':
      return 'Python';
    case 'java':
      return 'Java';
    case 'racket':
      return 'Racket';
    case 'go':
      return 'Go';
    case 'rust':
      return 'Rust';
    default:
      return language?.trim() || 'Code';
  }
}

function buildTextRubric(question: QuizQuestion): string | undefined {
  const parts = [
    question.commentPrompt,
    typeof question.answer === 'string' ? `参考答案：${question.answer}` : undefined,
    question.proof ? `参考证明：${question.proof}` : undefined,
    question.analysis ? `解析：${question.analysis}` : undefined,
    question.explanation ? `补充说明：${question.explanation}` : undefined,
    question.codeSnippet ? `相关代码：\n${question.codeSnippet}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export function gradeObjectiveQuestions(
  questions: QuizQuestion[],
  answers: Record<string, AnswerValue>,
): QuestionResult[] {
  return questions.filter(isObjectiveQuestion).map((q) => {
    const pts = q.points ?? 1;
    const userAnswer = toArray(answers[q.id]);
    const correctAnswer = toArray(q.answer);
    const correct = arraysEqual(userAnswer, correctAnswer);
    return {
      questionId: q.id,
      correct,
      status: correct ? 'correct' : 'incorrect',
      earned: correct ? pts : 0,
    };
  });
}

export async function gradeTextQuestion(
  question: QuizQuestion,
  userAnswer: string,
  language: string,
): Promise<QuestionResult> {
  const pts = question.points ?? 1;
  try {
    const modelConfig = getCurrentModelConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
    };
    if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
    if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
    if (modelConfig.requiresApiKey) headers['x-requires-api-key'] = 'true';

    const res = await runQueuedAiTask(
      {
        kind: 'quiz-grading',
        title: '题目判断正误',
        description: question.question || '正在批改文字题',
      },
      ({ signal }) =>
        fetch('/api/quiz-grade', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            question: question.question,
            userAnswer,
            points: pts,
            commentPrompt: buildTextRubric(question),
            language,
            questionType: question.type,
            referenceAnswer: typeof question.answer === 'string' ? question.answer : undefined,
            proof: question.proof,
            analysis: question.analysis,
          }),
          signal,
        }),
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { score: number; comment: string };
    const earned = Math.max(0, Math.min(pts, data.score));
    return {
      questionId: question.id,
      correct: earned >= pts * 0.8,
      status: earned >= pts * 0.8 ? 'correct' : 'incorrect',
      earned,
      aiComment: data.comment,
    };
  } catch (error) {
    log.error('[quiz-view] AI grading failed', question.id, error);
    return {
      questionId: question.id,
      correct: null,
      status: 'incorrect',
      earned: Math.round(pts * 0.5),
      aiComment:
        language === 'zh-CN'
          ? '评分服务暂时不可用，已给予基础分。'
          : 'Grading service unavailable. Base score given.',
    };
  }
}

export async function gradeCodeQuestion(
  question: QuizQuestion,
  userCode: string,
  language: string,
): Promise<QuestionResult> {
  const pts = question.points ?? 1;
  try {
    const res = await fetch('/api/quiz-code-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: question.id,
        userCode,
        starterCode: question.starterCode,
        language: question.language || 'python',
        testCases: question.testCases ?? [],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { report: QuizCodeReport };
    const report = data.report;
    const passed = report.totalCount > 0 && report.passedCount === report.totalCount;
    return {
      questionId: question.id,
      correct: passed,
      status: passed ? 'correct' : 'incorrect',
      earned: passed ? pts : 0,
      aiComment:
        language === 'zh-CN'
          ? `通过 ${report.passedCount}/${report.totalCount} 个测试用例。`
          : `Passed ${report.passedCount}/${report.totalCount} test cases.`,
      codeReport: report,
    };
  } catch (error) {
    log.error('[quiz-view] Code grading failed', question.id, error);
    return {
      questionId: question.id,
      correct: false,
      status: 'incorrect',
      earned: 0,
      aiComment:
        language === 'zh-CN'
          ? '代码运行服务暂时不可用，请稍后重试。'
          : 'Code runner unavailable. Please try again later.',
      codeReport: {
        passedCount: 0,
        totalCount: question.testCases?.length ?? 0,
        cases: [],
      },
    };
  }
}
