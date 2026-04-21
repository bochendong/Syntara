import type { LanguageModel } from 'ai';
import { callLLM } from '@/lib/ai/llm';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptResult,
  NotebookProblemRecord,
} from '@/lib/problem-bank';
import {
  isNotebookCalculationProblemRecord,
  isNotebookChoiceProblemRecord,
  isNotebookFillBlankProblemRecord,
  isNotebookProofProblemRecord,
  isNotebookShortAnswerProblemRecord,
} from '@/lib/problem-bank';

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function extractNumericValue(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, '');
  if (!cleaned) return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreToStatus(score: number, totalPoints: number) {
  if (score <= 0) return 'failed' as const;
  if (score >= totalPoints) return 'passed' as const;
  return 'partial' as const;
}

export async function gradeNotebookTextProblem(args: {
  problem: NotebookProblemRecord;
  answer: NotebookProblemAttemptAnswer;
  model: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  status: 'passed' | 'failed' | 'partial' | 'error';
  score: number;
  result: NotebookProblemAttemptResult;
}> {
  const userAnswer = args.answer.text?.trim() || '';
  if (!userAnswer) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback: args.language === 'zh-CN' ? '请先填写答案。' : 'Please enter an answer.',
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }

  const grading = args.problem.grading;
  const questionTypeLabel =
    args.problem.type === 'proof'
      ? args.language === 'zh-CN'
        ? '证明题'
        : 'proof question'
      : args.language === 'zh-CN'
        ? '简答题'
        : 'short-answer question';
  const systemPrompt =
    args.language === 'zh-CN'
      ? `你是一位专业的教育评估专家。你正在评分一道${questionTypeLabel}。请根据题目、参考信息和学生答案进行评分并给出简短评语。
必须以如下 JSON 格式回复（不要包含其他内容）：
{"score": <0到${args.problem.points}的整数>, "comment": "<一两句评语>"}`
      : `You are a professional educational assessor. You are grading a ${questionTypeLabel}. Grade the student's answer using the problem and reference material, then provide brief feedback.
You must reply in the following JSON format only:
{"score": <integer from 0 to ${args.problem.points}>, "comment": "<one or two sentences of feedback>"}`;

  const rubricBits = [
    grading.type === 'short_answer' ? grading.rubric : undefined,
    grading.type === 'proof' ? grading.rubric : undefined,
    grading.type === 'short_answer' ? grading.referenceAnswer : undefined,
    grading.type === 'proof' ? grading.referenceProof : undefined,
    grading.analysis,
  ].filter(Boolean);

  const prompt = `${args.language === 'zh-CN' ? '题目' : 'Problem'}: ${
    isNotebookShortAnswerProblemRecord(args.problem) || isNotebookProofProblemRecord(args.problem)
      ? args.problem.publicContent.stem
      : ''
  }
${args.language === 'zh-CN' ? '满分' : 'Full marks'}: ${args.problem.points}
${rubricBits.length > 0 ? `${args.language === 'zh-CN' ? '评分参考' : 'Reference'}:\n${rubricBits.join('\n\n')}\n` : ''}${
    args.language === 'zh-CN' ? '学生答案' : 'Student answer'
  }: ${userAnswer}`;

  try {
    const llm = await callLLM(
      {
        model: args.model,
        system: systemPrompt,
        prompt,
      },
      'notebook-problem-text-grade',
    );
    const match = llm.text.trim().match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { score?: unknown; comment?: unknown }) : {};
    const score = Math.max(0, Math.min(args.problem.points, Math.round(Number(parsed.score) || 0)));
    return {
      status: scoreToStatus(score, args.problem.points),
      score,
      result: {
        correct: score >= Math.max(1, Math.round(args.problem.points * 0.8)),
        feedback: String(parsed.comment || ''),
        analysis: grading.analysis,
        earnedPoints: score,
        publicCases: [],
      },
    };
  } catch (error) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback:
          error instanceof Error
            ? error.message
            : args.language === 'zh-CN'
              ? '评分服务暂时不可用。'
              : 'Grading is temporarily unavailable.',
        analysis: grading.analysis,
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }
}

export async function evaluateNotebookNonCodeProblem(args: {
  problem: NotebookProblemRecord;
  answer: NotebookProblemAttemptAnswer;
  model?: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  status: 'passed' | 'failed' | 'partial' | 'error';
  score: number;
  result: NotebookProblemAttemptResult;
}> {
  const { problem, answer } = args;

  if (isNotebookChoiceProblemRecord(problem)) {
    const selected = (answer.selectedOptionIds ?? []).map((item) => item.trim()).filter(Boolean);
    const correct = arraysEqual(selected, problem.grading.correctOptionIds);
    const score = correct ? problem.points : 0;
    return {
      status: correct ? 'passed' : 'failed',
      score,
      result: {
        correct,
        feedback: correct
          ? args.language === 'zh-CN'
            ? '回答正确。'
            : 'Correct.'
          : args.language === 'zh-CN'
            ? '回答不正确。'
            : 'Incorrect.',
        analysis: problem.grading.analysis,
        earnedPoints: score,
        publicCases: [],
      },
    };
  }

  if (isNotebookFillBlankProblemRecord(problem)) {
    const filled = answer.blanks ?? {};
    const correctBlanks = problem.grading.blanks.filter((blank) => {
      const userValue = filled[blank.id] || '';
      return blank.acceptedAnswers.some((candidate) =>
        blank.caseSensitive
          ? userValue.trim() === candidate
          : normalizeText(userValue) === normalizeText(candidate),
      );
    }).length;
    const total = problem.grading.blanks.length;
    const score = total > 0 ? (problem.points * correctBlanks) / total : 0;
    return {
      status: scoreToStatus(score, problem.points),
      score,
      result: {
        correct: correctBlanks === total,
        feedback:
          args.language === 'zh-CN'
            ? `答对 ${correctBlanks}/${total} 个空。`
            : `Filled ${correctBlanks}/${total} blanks correctly.`,
        analysis: problem.grading.analysis,
        earnedPoints: score,
        publicCases: [],
      },
    };
  }

  if (isNotebookCalculationProblemRecord(problem)) {
    const submitted = answer.text?.trim() || '';
    const accepted = [
      ...(problem.grading.referenceAnswer ? [problem.grading.referenceAnswer] : []),
      ...problem.grading.acceptedForms,
    ];
    const directMatch = accepted.some(
      (candidate) => normalizeText(candidate) === normalizeText(submitted),
    );
    let numericMatch = false;
    if (!directMatch && typeof problem.grading.tolerance === 'number') {
      const userNumeric = extractNumericValue(submitted);
      numericMatch = accepted.some((candidate) => {
        const expectedNumeric = extractNumericValue(candidate);
        if (userNumeric == null || expectedNumeric == null) return false;
        return Math.abs(userNumeric - expectedNumeric) <= problem.grading.tolerance!;
      });
    }
    const correct = directMatch || numericMatch;
    const score = correct ? problem.points : 0;
    return {
      status: correct ? 'passed' : 'failed',
      score,
      result: {
        correct,
        feedback: correct
          ? args.language === 'zh-CN'
            ? '计算结果正确。'
            : 'Correct.'
          : args.language === 'zh-CN'
            ? '计算结果不正确。'
            : 'Incorrect.',
        analysis: problem.grading.analysis,
        earnedPoints: score,
        publicCases: [],
      },
    };
  }

  if (isNotebookShortAnswerProblemRecord(problem) || isNotebookProofProblemRecord(problem)) {
    if (!args.model) {
      return {
        status: 'error',
        score: 0,
        result: {
          correct: false,
          feedback:
            args.language === 'zh-CN'
              ? '当前没有可用模型，无法批改文本题。'
              : 'No model is available to grade this text response.',
          earnedPoints: 0,
          publicCases: [],
        },
      };
    }
    return gradeNotebookTextProblem({
      problem,
      answer,
      model: args.model,
      language: args.language,
    });
  }

  return {
    status: 'error',
    score: 0,
    result: {
      correct: false,
      feedback:
        args.language === 'zh-CN'
          ? '该题型需要专用评测流程。'
          : 'This problem type requires a dedicated evaluation flow.',
      earnedPoints: 0,
      publicCases: [],
    },
  };
}
