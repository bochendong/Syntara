'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  CheckSquare,
  Code2,
  FileText,
  Gauge,
  ImagePlus,
  ListChecks,
  Loader2,
  Minus,
  PenLine,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  looksLikeAnswerHtml,
  sanitizeAnswerHtml,
} from '@/components/problem-bank/answer-composer.helpers';
import {
  ProblemImageAssets,
  ProblemRichText,
  ProblemTitleText,
  renderProblemRichTextHtml,
} from '@/components/problem-bank/problem-rich-text';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemAttemptRecord,
  type NotebookProblemAttemptStatus,
  type NotebookProblemImportDraft,
  type NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import { problemConceptTopics } from '@/lib/problem-bank/concept-tags.mjs';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { cn } from '@/lib/utils';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';

type ImportProcessingStage =
  | 'idle'
  | 'parsing'
  | 'searching'
  | 'extracting'
  | 'validating'
  | 'preview-ready'
  | 'committing'
  | 'completed';

function typeLabel(type: NotebookProblemClientRecord['type'], locale: 'zh-CN' | 'en-US') {
  const zh = {
    short_answer: '简答题',
    choice: '选择题',
    proof: '证明题',
    calculation: '计算题',
    code: '代码题',
    fill_blank: '填空题',
  } as const;
  const en = {
    short_answer: 'Short answer',
    choice: 'Choice',
    proof: 'Proof',
    calculation: 'Calculation',
    code: 'Code',
    fill_blank: 'Fill blank',
  } as const;
  return locale === 'zh-CN' ? zh[type] : en[type];
}

function statusLabel(status: NotebookProblemClientRecord['status'], locale: 'zh-CN' | 'en-US') {
  const zh = { draft: '草稿', published: '已发布', archived: '已归档' } as const;
  const en = { draft: 'Draft', published: 'Published', archived: 'Archived' } as const;
  return locale === 'zh-CN' ? zh[status] : en[status];
}

function attemptStatusLabel(
  status: NotebookProblemAttemptStatus,
  locale: 'zh-CN' | 'en-US',
  kind?: NotebookProblemAttemptRecord['kind'],
) {
  if (kind === 'run') {
    const zh = {
      pending: '运行中',
      passed: '测试通过',
      failed: '测试未通过',
      partial: '部分通过',
      error: '运行失败',
    } as const;
    const en = {
      pending: 'Running',
      passed: 'Tests passed',
      failed: 'Tests failed',
      partial: 'Partial',
      error: 'Run failed',
    } as const;
    return locale === 'zh-CN' ? zh[status] : en[status];
  }

  if (kind === 'submit') {
    const zh = {
      pending: '提交中',
      passed: '提交通过',
      failed: '提交未通过',
      partial: '部分通过',
      error: '提交失败',
    } as const;
    const en = {
      pending: 'Submitting',
      passed: 'Accepted',
      failed: 'Wrong answer',
      partial: 'Partial',
      error: 'Submit failed',
    } as const;
    return locale === 'zh-CN' ? zh[status] : en[status];
  }

  const zh = {
    pending: '待评估',
    passed: '正确',
    failed: '错误',
    partial: '部分正确',
    error: '评估失败',
  } as const;
  const en = {
    pending: 'Pending',
    passed: 'Correct',
    failed: 'Incorrect',
    partial: 'Partial',
    error: 'Error',
  } as const;
  return locale === 'zh-CN' ? zh[status] : en[status];
}

function formatAttemptTime(timestamp: number, locale: 'zh-CN' | 'en-US') {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function difficultyLabel(
  difficulty: NotebookProblemClientRecord['difficulty'],
  locale: 'zh-CN' | 'en-US',
) {
  const zh = { easy: '简单', medium: '中等', hard: '困难' } as const;
  const en = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
  return locale === 'zh-CN' ? zh[difficulty] : en[difficulty];
}

function formatProblemNumber(problem: NotebookProblemClientRecord): string {
  return `#${problem.problemNumber ?? problem.order + 1}`;
}

function compareProblemSequence(
  a: NotebookProblemClientRecord,
  b: NotebookProblemClientRecord,
): number {
  const aNumber = a.problemNumber ?? Number.MAX_SAFE_INTEGER;
  const bNumber = b.problemNumber ?? Number.MAX_SAFE_INTEGER;
  if (aNumber !== bNumber) return aNumber - bNumber;
  if (a.order !== b.order) return a.order - b.order;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
}

function estimateProblemCountFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const blocks = trimmed
    .split(
      /\n(?=(?:\d+[\.\)]\s+|Q\d+[:.]|Question\s+\d+|题目\s*\d+|题\s*\d+[：:]|选择题|证明题|代码题|填空题|简答题|计算题))/,
    )
    .map((block) => block.trim())
    .filter(Boolean);
  return Math.max(1, blocks.length);
}

function formatDraftValidationErrors(input: unknown): string[] {
  const parsed = notebookProblemImportDraftSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function renderProblemStem(problem: NotebookProblemClientRecord): string {
  return renderProblemContentStem(problem.publicContent);
}

function renderProblemContentStem(content: NotebookProblemPublicContent): string {
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function renderDraftStem(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

type ProblemSolutionSection = {
  title: string;
  content: string;
  contentKind?: 'rich-text' | 'code' | 'choice-options';
  language?: string;
  options?: Array<{ id: string; label: string }>;
};

function problemSolutionSections(
  problem: NotebookProblemClientRecord,
  locale: 'zh-CN' | 'en-US',
): ProblemSolutionSection[] {
  const sections: ProblemSolutionSection[] = [];
  const publicContent = problem.publicContent;
  const grading = problem.grading as Record<string, unknown>;

  if (publicContent.type === 'choice') {
    const ids = Array.isArray(grading.correctOptionIds)
      ? grading.correctOptionIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length > 0) {
      const options = ids.map((id) => {
        const option = publicContent.options.find((item) => item.id === id);
        return { id, label: option?.label ?? id };
      });
      const optionText = options.map((option) => `${option.id}. ${option.label}`).join('\n');
      sections.push({
        title: locale === 'zh-CN' ? '正确答案' : 'Correct answer',
        content: optionText,
        contentKind: 'choice-options',
        options,
      });
    }
  }

  const referenceAnswer =
    typeof grading.referenceAnswer === 'string' && grading.referenceAnswer.trim()
      ? grading.referenceAnswer.trim()
      : publicContent.type === 'code' &&
          typeof grading.solutionCode === 'string' &&
          grading.solutionCode.trim()
        ? grading.solutionCode.trim()
        : '';
  if (referenceAnswer) {
    sections.push({
      title: locale === 'zh-CN' ? '参考答案' : 'Reference answer',
      content: referenceAnswer,
      ...(publicContent.type === 'code'
        ? {
            contentKind: 'code' as const,
            language: publicContent.language,
          }
        : {}),
    });
  }
  if (typeof grading.referenceProof === 'string' && grading.referenceProof.trim()) {
    sections.push({
      title: locale === 'zh-CN' ? '参考证明' : 'Reference proof',
      content: grading.referenceProof,
    });
  }
  if (Array.isArray(grading.acceptedForms) && grading.acceptedForms.length > 0) {
    const acceptedForms = grading.acceptedForms
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join('\n');
    if (acceptedForms) {
      sections.push({
        title: locale === 'zh-CN' ? '可接受形式' : 'Accepted forms',
        content: acceptedForms,
      });
    }
  }
  if (Array.isArray(grading.blanks) && grading.blanks.length > 0) {
    const blanks = grading.blanks
      .map((blank) => {
        if (!blank || typeof blank !== 'object') return '';
        const row = blank as { id?: unknown; acceptedAnswers?: unknown };
        const id = typeof row.id === 'string' ? row.id : '';
        const answers = Array.isArray(row.acceptedAnswers)
          ? row.acceptedAnswers.filter((answer): answer is string => typeof answer === 'string')
          : [];
        return id && answers.length ? `${id}: ${answers.join(', ')}` : '';
      })
      .filter(Boolean)
      .join('\n');
    if (blanks) {
      sections.push({
        title: locale === 'zh-CN' ? '填空答案' : 'Blank answers',
        content: blanks,
      });
    }
  }
  if (typeof grading.rubric === 'string' && grading.rubric.trim()) {
    sections.push({
      title: locale === 'zh-CN' ? '评分规则' : 'Rubric',
      content: grading.rubric,
    });
  }
  if (typeof grading.analysis === 'string' && grading.analysis.trim()) {
    sections.push({
      title: locale === 'zh-CN' ? '解析' : 'Explanation',
      content: grading.analysis,
    });
  }

  return sections;
}

type TextAnswerMode = 'text' | 'photo';
type ProblemInfoTab = 'description' | 'formula' | 'edit';
type AnswerPanelTab = 'answer' | 'preview' | 'solution' | 'history';
type ChoiceProblemContent = Extract<NotebookProblemPublicContent, { type: 'choice' }>;

type PhotoAnswerDraft = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type InlineAnswerFeedback = {
  status: NotebookProblemAttemptStatus;
  score?: number | null;
  feedback: string;
  correctOptionIds?: string[];
  selectedOptionIds?: string[];
  saving?: boolean;
};

const MAX_PHOTO_ANSWER_FILES = 4;
const MAX_PHOTO_ANSWER_BYTES = 4 * 1024 * 1024;
const PROBLEM_BANK_PRIMARY_BUTTON_CLASS =
  'bg-sky-600 text-white shadow-sm shadow-sky-100/70 hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:shadow-none dark:hover:bg-sky-400';
const PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS =
  'border-sky-200 text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-sky-500/25 dark:text-sky-200 dark:hover:border-sky-400/40 dark:hover:bg-sky-500/10 dark:hover:text-sky-100';
const PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS =
  'bg-emerald-600 text-white shadow-none hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400';
const PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS =
  'border border-emerald-200 bg-white text-emerald-700 shadow-none hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-100';
const PROBLEM_BANK_LIST_GRID_CLASS =
  'grid grid-cols-[4rem_5.25rem_minmax(14rem,1.7fr)_7rem_6.5rem_4rem_4.75rem_7.5rem]';
const PROBLEM_BANK_PAGE_SIZE = 10;

function supportsPhotoAnswer(problem: NotebookProblemClientRecord | null): boolean {
  if (!problem) return false;
  return (
    problem.type === 'short_answer' || problem.type === 'proof' || problem.type === 'calculation'
  );
}

function normalizeChoiceOptionIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).sort();
}

function getChoiceCorrectOptionIds(problem: NotebookProblemClientRecord): string[] {
  if (problem.publicContent.type !== 'choice' || problem.grading.type !== 'choice') return [];
  return problem.grading.correctOptionIds;
}

function choiceAnswersMatch(selected: string[], correct: string[]): boolean {
  const normalizedSelected = normalizeChoiceOptionIds(selected);
  const normalizedCorrect = normalizeChoiceOptionIds(correct);
  if (normalizedSelected.length !== normalizedCorrect.length) return false;
  return normalizedSelected.every((id, index) => id === normalizedCorrect[index]);
}

function buildChoiceAnswerFeedback(
  problem: NotebookProblemClientRecord,
  selectedOptionIds: string[],
  locale: 'zh-CN' | 'en-US',
): InlineAnswerFeedback | null {
  const correctOptionIds = getChoiceCorrectOptionIds(problem);
  if (correctOptionIds.length === 0) return null;
  const correct = choiceAnswersMatch(selectedOptionIds, correctOptionIds);
  return {
    status: correct ? 'passed' : 'failed',
    score: correct ? problem.points : 0,
    feedback: correct
      ? locale === 'zh-CN'
        ? '回答正确。'
        : 'Correct.'
      : locale === 'zh-CN'
        ? `回答不正确。正确选项：${correctOptionIds.join(', ')}`
        : `Incorrect. Correct answer: ${correctOptionIds.join(', ')}`,
    correctOptionIds,
    selectedOptionIds,
    saving: true,
  };
}

function answerFeedbackTone(status: NotebookProblemAttemptStatus) {
  if (status === 'passed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100';
  }
  if (status === 'failed' || status === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100';
}

function formatAnswerScore(score: number, points: number) {
  return `${Number.isInteger(score) ? score : score.toFixed(1)}/${points}`;
}

function answerFeedbackSummaryLabel(
  feedback: InlineAnswerFeedback,
  points: number,
  locale: 'zh-CN' | 'en-US',
) {
  if (feedback.saving) return locale === 'zh-CN' ? '正在提交' : 'Submitting';
  const score =
    typeof feedback.score === 'number'
      ? feedback.score
      : feedback.status === 'passed'
        ? points
        : feedback.status === 'failed' || feedback.status === 'partial'
          ? 0
          : null;
  const scoreText = typeof score === 'number' ? formatAnswerScore(score, points) : null;
  if (feedback.status === 'passed') {
    return locale === 'zh-CN'
      ? `作答正确 · 满分 ${formatAnswerScore(points, points)}`
      : `Answer correct · Full score ${formatAnswerScore(points, points)}`;
  }
  if (feedback.status === 'failed') {
    return locale === 'zh-CN'
      ? `作答失败${scoreText ? ` · 得分 ${scoreText}` : ''}`
      : `Answer failed${scoreText ? ` · Score ${scoreText}` : ''}`;
  }
  if (feedback.status === 'partial') {
    return locale === 'zh-CN'
      ? `部分正确${scoreText ? ` · 得分 ${scoreText}` : ''}`
      : `Partially correct${scoreText ? ` · Score ${scoreText}` : ''}`;
  }
  if (feedback.status === 'error') {
    const message = feedback.feedback.trim();
    return message || (locale === 'zh-CN' ? '提交失败' : 'Submit failed');
  }
  return locale === 'zh-CN' ? '等待评估' : 'Pending review';
}

function AnswerFeedbackSummaryBadge({
  feedback,
  points,
  locale,
  className,
}: {
  feedback: InlineAnswerFeedback;
  points: number;
  locale: 'zh-CN' | 'en-US';
  className?: string;
}) {
  const label = answerFeedbackSummaryLabel(feedback, points, locale);
  return (
    <div
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border px-3 text-xs font-semibold',
        answerFeedbackTone(feedback.status),
        className,
      )}
      title={label}
    >
      {feedback.saving ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : feedback.status === 'passed' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

function latestAttemptFromRecord(attempt: NotebookProblemAttemptRecord) {
  return {
    id: attempt.id,
    status: attempt.status,
    score: attempt.score ?? null,
    createdAt: attempt.createdAt,
  };
}

const COMMON_LATEX_FORMULA_GROUPS = [
  {
    title: '基础结构',
    items: [
      { label: '分数', latex: String.raw`\frac{a}{b}` },
      { label: '平方根', latex: String.raw`\sqrt{x}` },
      { label: 'n 次方根', latex: String.raw`\sqrt[n]{x}` },
      { label: '上下标', latex: String.raw`x_i^2` },
      { label: '无穷', latex: String.raw`\infty` },
      { label: 'forall 符号', latex: String.raw`\forall` },
      { label: 'exists 符号', latex: String.raw`\exists` },
      { label: '省略号 dots', latex: String.raw`\dots` },
      { label: '中线省略号', latex: String.raw`\cdots` },
      { label: '底线省略号', latex: String.raw`\ldots` },
      { label: '竖省略号', latex: String.raw`\vdots` },
      { label: '斜省略号', latex: String.raw`\ddots` },
      { label: 'ceil', latex: String.raw`\lceil x \rceil` },
      { label: 'floor', latex: String.raw`\lfloor x \rfloor` },
    ],
  },
  {
    title: '微积分',
    items: [
      { label: '极限', latex: String.raw`\lim_{x\to a} f(x)` },
      { label: '导数', latex: String.raw`\frac{d}{dx} f(x)` },
      { label: '偏导数', latex: String.raw`\frac{\partial f}{\partial x}` },
      { label: '定积分', latex: String.raw`\int_a^b f(x)\,dx` },
      { label: '求和', latex: String.raw`\sum_{i=1}^{n} a_i` },
      { label: '无上下限求和', latex: String.raw`\sum a_i` },
      { label: '多项乘积', latex: String.raw`\prod_{i=1}^{n} a_i` },
    ],
  },
  {
    title: '集合与逻辑',
    items: [
      { label: '属于', latex: String.raw`x \in A` },
      { label: '不属于', latex: String.raw`x \notin A` },
      { label: '子集', latex: String.raw`A \subseteq B` },
      { label: '并集', latex: String.raw`A \cup B` },
      { label: '交集', latex: String.raw`A \cap B` },
      { label: '补集', latex: String.raw`A^c` },
      { label: '蕴含', latex: String.raw`P \Rightarrow Q` },
      { label: '当且仅当', latex: String.raw`P \Leftrightarrow Q` },
    ],
  },
  {
    title: '常用数集与希腊字母',
    items: [
      { label: '实数', latex: String.raw`\mathbb{R}` },
      { label: '整数', latex: String.raw`\mathbb{Z}` },
      { label: '自然数', latex: String.raw`\mathbb{N}` },
      { label: '大 Delta', latex: String.raw`\Delta` },
      { label: 'alpha', latex: String.raw`\alpha` },
      { label: 'beta', latex: String.raw`\beta` },
      { label: 'gamma', latex: String.raw`\gamma` },
      { label: 'theta', latex: String.raw`\theta` },
      { label: 'lambda', latex: String.raw`\lambda` },
      { label: 'epsilon', latex: String.raw`\epsilon` },
      { label: 'delta', latex: String.raw`\delta` },
    ],
  },
] as const;

const FORMULA_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const FORMULA_ROW_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const FORMULA_SEGMENT_OPTIONS = [2, 3, 4, 5, 6] as const;
const FORMULA_ITEM_OPTIONS = [2, 3, 4, 5, 6] as const;

function inlineMathLatex(latex: string) {
  return `$${latex}$`;
}

function displayMathLatex(latex: string) {
  return `\\[\n${latex}\n\\]`;
}

function displayMathPreviewContent(latex: string) {
  return `$$\n${latex}\n$$`;
}

function generateMatrixLatex(rows: number, cols: number) {
  const body = Array.from({ length: rows }).map((_, rowIndex) => {
    const cells = Array.from({ length: cols })
      .map((__, colIndex) => `a_{${rowIndex + 1}${colIndex + 1}}`)
      .join(' & ');
    return `  ${cells}${rowIndex < rows - 1 ? String.raw` \\` : ''}`;
  });
  return [String.raw`\begin{bmatrix}`, ...body, String.raw`\end{bmatrix}`].join('\n');
}

function generateAlignedLatex(rows: number) {
  const body = Array.from(
    { length: rows },
    (_, index) =>
      `  x_{${index + 1}} &= y_{${index + 1}}${index < rows - 1 ? String.raw` \\` : ''}`,
  );
  return [String.raw`\begin{aligned}`, ...body, String.raw`\end{aligned}`].join('\n');
}

function generateCasesLatex(segments: number) {
  const body = Array.from(
    { length: segments },
    (_, index) =>
      `  expr_{${index + 1}}, & cond_{${index + 1}}${index < segments - 1 ? String.raw` \\` : ''}`,
  );
  return [String.raw`f(x)=\begin{cases}`, ...body, String.raw`\end{cases}`].join('\n');
}

function generateTableLatex(rows: number, cols: number) {
  const alignment = `|${Array.from({ length: cols }, () => 'c').join('|')}|`;
  const body = Array.from({ length: rows }).flatMap((_, rowIndex) => {
    const cells = Array.from({ length: cols })
      .map((__, colIndex) => `cell_{${rowIndex + 1}${colIndex + 1}}`)
      .join(' & ');
    return [`  ${cells} ${String.raw`\\`}`, String.raw`\hline`];
  });
  return [
    `\\begin{array}{${alignment}}`,
    String.raw`\hline`,
    ...body,
    String.raw`\end{array}`,
  ].join('\n');
}

function generateEnumerateLatex(items: number) {
  const body = Array.from({ length: items })
    .map((_, index) => String.raw`\item item ${index + 1}`)
    .join('\n');
  return `${String.raw`\begin{enumerate}`}\n${body}\n${String.raw`\end{enumerate}`}`;
}

function feedbackFromAttempt(
  problem: NotebookProblemClientRecord,
  attempt: NotebookProblemAttemptRecord,
  locale: 'zh-CN' | 'en-US',
): InlineAnswerFeedback {
  const selectedOptionIds = attempt.answer.selectedOptionIds ?? [];
  const choiceFeedback =
    problem.type === 'choice'
      ? buildChoiceAnswerFeedback(problem, selectedOptionIds, locale)
      : null;
  return {
    status: attempt.status,
    score: attempt.score ?? choiceFeedback?.score ?? null,
    feedback:
      attempt.result?.feedback ||
      choiceFeedback?.feedback ||
      (locale === 'zh-CN' ? '已提交答案。' : 'Answer submitted.'),
    correctOptionIds: choiceFeedback?.correctOptionIds,
    selectedOptionIds: choiceFeedback?.selectedOptionIds,
    saving: false,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number, locale: 'zh-CN' | 'en-US') {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(locale === 'zh-CN' ? 1 : 1)} MB`;
}

type PracticeFilter = 'all' | 'review' | 'wrong' | 'unattempted' | 'mastered';
type ProblemPracticeState = Exclude<PracticeFilter, 'all'>;

function normalizeProblemTopic(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

function problemTopics(problem: NotebookProblemClientRecord): string[] {
  const tags = problemConceptTopics(problem).map(normalizeProblemTopic).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return ['未标注'];
}

function problemPracticeState(problem: NotebookProblemClientRecord): ProblemPracticeState {
  const status = problem.latestAttempt?.status ?? null;
  if (!status) return 'unattempted';
  if (status === 'passed') return 'mastered';
  if (status === 'failed' || status === 'partial' || status === 'error') return 'wrong';
  return 'review';
}

function matchesPracticeFilter(problem: NotebookProblemClientRecord, filter: PracticeFilter) {
  if (filter === 'all') return true;
  const state = problemPracticeState(problem);
  if (filter === 'review')
    return state === 'unattempted' || state === 'wrong' || state === 'review';
  return state === filter;
}

function practiceFilterLabel(filter: PracticeFilter, locale: 'zh-CN' | 'en-US') {
  const zh = {
    all: '全部',
    review: '待复习',
    wrong: '错题',
    unattempted: '未做',
    mastered: '已掌握',
  } as const;
  const en = {
    all: 'All',
    review: 'To review',
    wrong: 'Wrong',
    unattempted: 'Untried',
    mastered: 'Mastered',
  } as const;
  return locale === 'zh-CN' ? zh[filter] : en[filter];
}

function practiceStateLabel(problem: NotebookProblemClientRecord, locale: 'zh-CN' | 'en-US') {
  const state = problemPracticeState(problem);
  if (state === 'wrong') return locale === 'zh-CN' ? '需复习' : 'Review';
  if (state === 'mastered') return locale === 'zh-CN' ? '已掌握' : 'Mastered';
  if (state === 'unattempted') return locale === 'zh-CN' ? '未做' : 'Untried';
  return locale === 'zh-CN' ? '进行中' : 'In progress';
}

function practiceStateClassName(problem: NotebookProblemClientRecord) {
  const state = problemPracticeState(problem);
  if (state === 'wrong') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
  }
  if (state === 'mastered') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (state === 'unattempted') {
    return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
}

function difficultyDots(problem: NotebookProblemClientRecord) {
  const activeCount = problem.difficulty === 'easy' ? 1 : problem.difficulty === 'medium' ? 2 : 3;
  return [0, 1, 2].map((index) => index < activeCount);
}

function difficultyDotClassName(
  difficulty: NotebookProblemClientRecord['difficulty'],
  active: boolean,
) {
  if (!active) return 'bg-slate-200 dark:bg-slate-700';
  if (difficulty === 'easy') return 'bg-emerald-500 dark:bg-emerald-300';
  if (difficulty === 'medium') return 'bg-amber-500 dark:bg-amber-300';
  return 'bg-rose-500 dark:bg-rose-300';
}

function difficultyTextClassName(difficulty: NotebookProblemClientRecord['difficulty']) {
  if (difficulty === 'easy') return 'text-emerald-700 dark:text-emerald-300';
  if (difficulty === 'medium') return 'text-amber-700 dark:text-amber-300';
  return 'text-rose-700 dark:text-rose-300';
}

function difficultyChipClassName(difficulty: NotebookProblemClientRecord['difficulty']) {
  if (difficulty === 'easy') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (difficulty === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
}

function problemTypeVisual(type: NotebookProblemClientRecord['type']): {
  Icon: LucideIcon;
  className: string;
} {
  if (type === 'choice') {
    return {
      Icon: ListChecks,
      className:
        'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200',
    };
  }
  if (type === 'calculation') {
    return {
      Icon: Calculator,
      className:
        'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    };
  }
  if (type === 'proof') {
    return {
      Icon: PenLine,
      className:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    };
  }
  if (type === 'code') {
    return {
      Icon: Code2,
      className:
        'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
    };
  }
  if (type === 'fill_blank') {
    return {
      Icon: Type,
      className:
        'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200',
    };
  }
  return {
    Icon: FileText,
    className:
      'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200',
  };
}

function problemMetaChips(
  problem: NotebookProblemClientRecord,
  locale: 'zh-CN' | 'en-US',
): Array<{ key: string; label: string; Icon: LucideIcon; className: string }> {
  const typeVisual = problemTypeVisual(problem.type);
  return [
    {
      key: 'type',
      label: typeLabel(problem.type, locale),
      Icon: typeVisual.Icon,
      className: typeVisual.className,
    },
    {
      key: 'difficulty',
      label: difficultyLabel(problem.difficulty, locale),
      Icon: Gauge,
      className: difficultyChipClassName(problem.difficulty),
    },
    {
      key: 'points',
      label: locale === 'zh-CN' ? `${problem.points} 分` : `${problem.points} pt`,
      Icon: CheckSquare,
      className:
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200',
    },
  ];
}

function ProblemMetaChip({
  label,
  Icon,
  className,
}: {
  label: string;
  Icon: LucideIcon;
  className: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function latestScoreLabel(problem: NotebookProblemClientRecord, locale: 'zh-CN' | 'en-US') {
  if (typeof problem.latestAttempt?.score === 'number') {
    return `${problem.latestAttempt.score}/${problem.points}`;
  }
  return locale === 'zh-CN' ? '未提交' : 'No score';
}

function weakTopicBarClass(index: number): string {
  const classes = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500'];
  return classes[index % classes.length];
}

type FilterSelectOption = {
  value: string;
  label: string;
  count?: number;
};

function filterOptionText(option: FilterSelectOption) {
  return typeof option.count === 'number' ? `${option.label} (${option.count})` : option.label;
}

function FormulaReferencePanel({
  locale,
  onInsert,
}: {
  locale: 'zh-CN' | 'en-US';
  onInsert: (latex: string) => void;
}) {
  const [matrixRows, setMatrixRows] = useState(2);
  const [matrixCols, setMatrixCols] = useState(2);
  const [alignedRows, setAlignedRows] = useState(2);
  const [caseSegments, setCaseSegments] = useState(2);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [enumerateItems, setEnumerateItems] = useState(3);

  const matrixLatex = generateMatrixLatex(matrixRows, matrixCols);
  const alignedLatex = generateAlignedLatex(alignedRows);
  const casesLatex = generateCasesLatex(caseSegments);
  const tableLatex = generateTableLatex(tableRows, tableCols);
  const enumerateLatex = generateEnumerateLatex(enumerateItems);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
          {locale === 'zh-CN' ? '常见 LaTeX 公式表' : 'Common LaTeX formulas'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {locale === 'zh-CN'
            ? '写答案时可以直接照着右侧写法输入。'
            : 'Use the source snippets on the right when writing an answer.'}
        </p>
      </div>

      {COMMON_LATEX_FORMULA_GROUPS.map((group) => (
        <section key={group.title} className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {group.title}
          </h3>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-sm leading-6">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                <tr>
                  <th className="w-24 px-3 py-2 text-left">
                    {locale === 'zh-CN' ? '用途' : 'Use'}
                  </th>
                  <th className="px-3 py-2 text-left">LaTeX</th>
                  <th className="w-44 px-3 py-2 text-left">
                    {locale === 'zh-CN' ? '预览' : 'Preview'}
                  </th>
                  <th className="w-20 px-3 py-2 text-right">
                    {locale === 'zh-CN' ? '操作' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr
                    key={`${group.title}-${item.label}`}
                    className="border-t border-slate-200 dark:border-slate-800"
                  >
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                      {item.label}
                    </td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-slate-100 px-1.5 py-1 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {inlineMathLatex(item.latex)}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                      <ProblemRichText
                        content={`$${item.latex}$`}
                        className="[&_p]:m-0 [&_.katex-display]:m-0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-md px-2 text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:text-sky-200 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10"
                        onClick={() => onInsert(inlineMathLatex(item.latex))}
                      >
                        {locale === 'zh-CN' ? '插入' : 'Insert'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section aria-label={locale === 'zh-CN' ? '矩阵' : 'Matrix'}>
        <FormulaBuilderCard
          title={locale === 'zh-CN' ? '矩阵' : 'Matrix'}
          latex={matrixLatex}
          insertLatex={displayMathLatex(matrixLatex)}
          locale={locale}
          onInsert={() => onInsert(displayMathLatex(matrixLatex))}
        >
          <FormulaNumberSelect
            label={locale === 'zh-CN' ? '行' : 'Rows'}
            value={matrixRows}
            options={FORMULA_SIZE_OPTIONS}
            onChange={setMatrixRows}
          />
          <FormulaNumberSelect
            label={locale === 'zh-CN' ? '列' : 'Cols'}
            value={matrixCols}
            options={FORMULA_SIZE_OPTIONS}
            onChange={setMatrixCols}
          />
        </FormulaBuilderCard>
      </section>

      <section aria-label={locale === 'zh-CN' ? '分段函数' : 'Piecewise'}>
        <FormulaBuilderCard
          title={locale === 'zh-CN' ? '分段函数' : 'Piecewise'}
          latex={casesLatex}
          insertLatex={displayMathLatex(casesLatex)}
          locale={locale}
          onInsert={() => onInsert(displayMathLatex(casesLatex))}
        >
          <FormulaNumberSelect
            label={locale === 'zh-CN' ? '段数' : 'Pieces'}
            value={caseSegments}
            options={FORMULA_SEGMENT_OPTIONS}
            onChange={setCaseSegments}
          />
        </FormulaBuilderCard>
      </section>

      <section aria-label="aligned">
        <FormulaBuilderCard
          title="aligned"
          latex={alignedLatex}
          insertLatex={displayMathLatex(alignedLatex)}
          locale={locale}
          onInsert={() => onInsert(displayMathLatex(alignedLatex))}
        >
          <FormulaNumberSelect
            label={locale === 'zh-CN' ? '行数' : 'Rows'}
            value={alignedRows}
            options={FORMULA_ROW_OPTIONS}
            onChange={setAlignedRows}
          />
        </FormulaBuilderCard>
      </section>

      <section aria-label="table">
        <TableBuilderCard
          locale={locale}
          rows={tableRows}
          cols={tableCols}
          latex={tableLatex}
          onRowsChange={setTableRows}
          onColsChange={setTableCols}
          onInsert={() => onInsert(displayMathLatex(tableLatex))}
        />
      </section>

      <section aria-label="enumerate">
        <EnumerateBuilderCard
          locale={locale}
          items={enumerateItems}
          latex={enumerateLatex}
          onItemsChange={setEnumerateItems}
          onInsert={() => onInsert(enumerateLatex)}
        />
      </section>
    </div>
  );
}

function FormulaNumberSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-500/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormulaBuilderCard({
  title,
  latex,
  insertLatex,
  locale,
  children,
  onInsert,
}: {
  title: string;
  latex: string;
  insertLatex?: string;
  locale: 'zh-CN' | 'en-US';
  children: ReactNode;
  onInsert: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <div className="mt-2 flex flex-wrap gap-2">{children}</div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-md px-2 text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:text-sky-200 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10"
          onClick={onInsert}
        >
          {locale === 'zh-CN' ? '插入' : 'Insert'}
        </Button>
      </div>
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <ProblemRichText
          content={displayMathPreviewContent(latex)}
          className="[&_p]:m-0 [&_.katex-display]:m-0"
        />
      </div>
      <code className="mt-2 block whitespace-pre-wrap break-words rounded bg-white px-2 py-1 font-mono text-[11px] leading-5 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        {insertLatex ?? latex}
      </code>
    </div>
  );
}

function TableBuilderCard({
  locale,
  rows,
  cols,
  latex,
  onRowsChange,
  onColsChange,
  onInsert,
}: {
  locale: 'zh-CN' | 'en-US';
  rows: number;
  cols: number;
  latex: string;
  onRowsChange: (value: number) => void;
  onColsChange: (value: number) => void;
  onInsert: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">table</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FormulaNumberSelect
              label={locale === 'zh-CN' ? '行' : 'Rows'}
              value={rows}
              options={FORMULA_SIZE_OPTIONS}
              onChange={onRowsChange}
            />
            <FormulaNumberSelect
              label={locale === 'zh-CN' ? '列' : 'Cols'}
              value={cols}
              options={FORMULA_SIZE_OPTIONS}
              onChange={onColsChange}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-md px-2 text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:text-sky-200 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10"
          onClick={onInsert}
        >
          {locale === 'zh-CN' ? '插入' : 'Insert'}
        </Button>
      </div>
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <ProblemRichText
          content={displayMathPreviewContent(latex)}
          className="[&_p]:m-0 [&_.katex-display]:m-0"
        />
      </div>
      <code className="mt-2 block whitespace-pre-wrap break-words rounded bg-white px-2 py-1 font-mono text-[11px] leading-5 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        {displayMathLatex(latex)}
      </code>
    </div>
  );
}

function EnumerateBuilderCard({
  locale,
  items,
  latex,
  onItemsChange,
  onInsert,
}: {
  locale: 'zh-CN' | 'en-US';
  items: number;
  latex: string;
  onItemsChange: (value: number) => void;
  onInsert: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">enumerate</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FormulaNumberSelect
              label={locale === 'zh-CN' ? '条目' : 'Items'}
              value={items}
              options={FORMULA_ITEM_OPTIONS}
              onChange={onItemsChange}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-md px-2 text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:text-sky-200 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10"
          onClick={onInsert}
        >
          {locale === 'zh-CN' ? '插入' : 'Insert'}
        </Button>
      </div>
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <ol className="m-0 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
          {Array.from({ length: items }).map((_, index) => (
            <li key={index}>item {index + 1}</li>
          ))}
        </ol>
      </div>
      <code className="mt-2 block whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-[11px] leading-5 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        {latex}
      </code>
    </div>
  );
}

function answerPreviewHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (!looksLikeAnswerHtml(trimmed)) {
    return renderProblemRichTextHtml(trimmed);
  }

  return renderHtmlWithLatex(sanitizeAnswerHtml(trimmed))
    .replace(/\scontenteditable="(?:true|false)"/g, '')
    .replace(/\sdata-answer-math-selected="[^"]*"/g, '');
}

function answerComposerPlaceholder(locale: 'zh-CN' | 'en-US'): string {
  return locale === 'zh-CN'
    ? '在这里输入你的答案。\n需要数学公式时，点击「公式表」插入 raw LaTeX，再切到「预览」查看效果。\n例：因为 $x>0$，所以 $\\exists n\\in\\mathbb{N}$ 使得 $n\\le x<n+1$。'
    : 'Type your answer here.\nFor math, open Formula Sheet to insert raw LaTeX, then use Preview to check the result.\nExample: Since $x>0$, $\\exists n\\in\\mathbb{N}$ with $n\\le x<n+1$.';
}

function AnswerPreviewPanel({ value, placeholder }: { value: string; placeholder: string }) {
  const isPlaceholderPreview = value.trim().length === 0;
  const previewValue = isPlaceholderPreview ? placeholder : value;
  const html = useMemo(() => answerPreviewHtml(previewValue), [previewValue]);

  return (
    <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-950/40">
      <div
        className={cn(
          'prose prose-slate max-w-none flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-3 text-sm leading-7 dark:prose-invert',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0 [&_.katex-display]:my-3',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1.5 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700',
          isPlaceholderPreview && 'text-slate-400 dark:text-slate-500',
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function ChoiceAnswerPreviewPanel({
  content,
  selectedOptionIds,
  feedback,
  locale,
}: {
  content: ChoiceProblemContent;
  selectedOptionIds: string[];
  feedback: InlineAnswerFeedback | null;
  locale: 'zh-CN' | 'en-US';
}) {
  const selected = new Set(selectedOptionIds);
  const correctOptionIds = feedback?.correctOptionIds ?? [];
  const hasFeedback = Boolean(feedback);

  return (
    <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {locale === 'zh-CN' ? '选项预览' : 'Choice preview'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {content.selectionMode === 'multiple'
              ? locale === 'zh-CN'
                ? '多选题'
                : 'Multiple choice'
              : locale === 'zh-CN'
                ? '单选题'
                : 'Single choice'}
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {selectedOptionIds.length > 0
            ? selectedOptionIds.join(', ')
            : locale === 'zh-CN'
              ? '未选择'
              : 'No selection'}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {content.options.map((option) => {
            const isSelected = selected.has(option.id);
            const isCorrect = correctOptionIds.includes(option.id);
            const isWrongSelected = hasFeedback && isSelected && !isCorrect;

            return (
              <div
                key={option.id}
                className={cn(
                  'flex items-start gap-3 rounded-md border px-3 py-3 text-[15px] transition dark:border-slate-700',
                  hasFeedback && isCorrect
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-50'
                    : isWrongSelected
                      ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-50'
                      : isSelected
                        ? 'border-sky-300 bg-sky-50 text-slate-950 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border text-xs font-semibold',
                    isSelected
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                  )}
                >
                  {option.id}
                </span>
                <div className="min-w-0 flex-1">
                  <ProblemRichText
                    content={option.label}
                    className="min-w-0 [&_.problem-rich-code-block]:my-0 [&_.problem-rich-code-block]:max-w-full"
                  />
                </div>
                {hasFeedback && isCorrect ? (
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : isWrongSelected ? (
                  <X className="mt-1 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttemptAnswerPreview({
  attempt,
  locale,
}: {
  attempt: NotebookProblemAttemptRecord;
  locale: 'zh-CN' | 'en-US';
}) {
  const answer = attempt.answer;
  const textHtml = useMemo(
    () => (answer.text?.trim() ? answerPreviewHtml(answer.text) : ''),
    [answer.text],
  );

  if (answer.selectedOptionIds?.length) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {answer.selectedOptionIds.map((optionId) => (
          <span
            key={`${attempt.id}-${optionId}`}
            className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20"
          >
            {optionId}
          </span>
        ))}
      </div>
    );
  }

  if (answer.blanks && Object.keys(answer.blanks).length > 0) {
    return (
      <div className="grid gap-2">
        {Object.entries(answer.blanks).map(([blankId, value]) => (
          <div
            key={`${attempt.id}-${blankId}`}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <span className="mr-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {blankId}
            </span>
            <span className="text-slate-800 dark:text-slate-100">{value || '-'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (answer.code?.trim()) {
    return (
      <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-6 text-slate-50">
        {answer.code}
      </pre>
    );
  }

  if (answer.images?.length) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {answer.images.map((image) => (
          <figure
            key={image.id}
            className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          >
            <img src={image.dataUrl} alt={image.name} className="max-h-40 w-full object-contain" />
            <figcaption className="border-t border-slate-200 px-2 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {image.name}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (textHtml) {
    return (
      <div
        className="prose prose-slate max-w-none text-sm leading-7 dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0 [&_.katex-display]:my-3"
        dangerouslySetInnerHTML={{ __html: textHtml }}
      />
    );
  }

  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      {locale === 'zh-CN' ? '本次提交没有可显示的答案。' : 'No answer content to show.'}
    </p>
  );
}

function CodeAttemptTestSummary({
  attempt,
  locale,
}: {
  attempt: NotebookProblemAttemptRecord;
  locale: 'zh-CN' | 'en-US';
}) {
  const publicSummary =
    attempt.result?.publicSummary ??
    (attempt.result?.publicCases?.length
      ? {
          total: attempt.result.publicCases.length,
          passed: attempt.result.publicCases.filter((testCase) => testCase.passed).length,
          failed: attempt.result.publicCases.filter((testCase) => !testCase.passed).length,
          failureSummary: undefined,
        }
      : null);
  const secretSummary = attempt.result?.secretSummary ?? null;
  const summaries = [
    publicSummary
      ? {
          key: 'public',
          label: locale === 'zh-CN' ? '公开测试' : 'Public tests',
          summary: publicSummary,
        }
      : null,
    secretSummary
      ? {
          key: 'secret',
          label: locale === 'zh-CN' ? '隐藏测试' : 'Secret tests',
          summary: secretSummary,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: 'public' | 'secret';
    label: string;
    summary: {
      total: number;
      passed: number;
      failed: number;
      failureSummary?: string;
    };
  }>;

  if (summaries.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {summaries.map(({ key, label, summary }) => {
        const allPassed = summary.total > 0 && summary.failed === 0;
        return (
          <div
            key={key}
            className={cn(
              'rounded-md border px-3 py-2 text-xs leading-5',
              allPassed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100',
            )}
          >
            <div className="flex items-center gap-2 font-semibold">
              {allPassed ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {label}
            </div>
            <p className="mt-1 font-medium">
              {locale === 'zh-CN'
                ? `通过 ${summary.passed}/${summary.total}，未通过 ${summary.failed} 个`
                : `${summary.passed}/${summary.total} passed, ${summary.failed} failed`}
            </p>
            {summary.failureSummary ? (
              <p className="mt-1 opacity-80">
                {locale === 'zh-CN'
                  ? summary.failureSummary
                      .replaceAll('Public tests', '公开测试')
                      .replaceAll('Secret tests', '隐藏测试')
                  : summary.failureSummary}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function shouldShowAttemptFeedback(attempt: NotebookProblemAttemptRecord): boolean {
  if (!attempt.result?.feedback) return false;
  const hasCodeTestSummary =
    (attempt.kind === 'run' || attempt.kind === 'submit') &&
    (attempt.result.publicSummary ||
      attempt.result.secretSummary ||
      (attempt.result.publicCases?.length ?? 0) > 0);
  return !hasCodeTestSummary;
}

function AttemptHistoryPanel({
  attempts,
  loading,
  points,
  locale,
}: {
  attempts: NotebookProblemAttemptRecord[];
  loading: boolean;
  points: number;
  locale: 'zh-CN' | 'en-US';
}) {
  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {locale === 'zh-CN' ? '正在加载提交历史…' : 'Loading submission history...'}
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        {locale === 'zh-CN' ? '还没有提交记录。' : 'No submissions yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attempts.map((attempt, index) => (
        <article
          key={attempt.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">
                #{attempts.length - index}
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                  answerFeedbackTone(attempt.status),
                )}
              >
                {attemptStatusLabel(attempt.status, locale, attempt.kind)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatAttemptTime(attempt.createdAt, locale)}
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {typeof attempt.score === 'number'
                ? `${attempt.score}/${points}`
                : locale === 'zh-CN'
                  ? '未评分'
                  : 'No score'}
            </span>
          </div>
          <div className="space-y-3 p-3">
            <AttemptAnswerPreview attempt={attempt} locale={locale} />
            <CodeAttemptTestSummary attempt={attempt} locale={locale} />
            {shouldShowAttemptFeedback(attempt) ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {locale === 'zh-CN' ? '反馈' : 'Feedback'}
                </p>
                <ProblemRichText content={attempt.result?.feedback ?? ''} />
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ProblemDraftPreviewPanel({
  draft,
  locale,
}: {
  draft: NotebookProblemImportDraft;
  locale: 'zh-CN' | 'en-US';
}) {
  const content = draft.publicContent;
  const stem = renderDraftStem(draft);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{typeLabel(draft.type, locale)}</Badge>
            <Badge variant="secondary">{difficultyLabel(draft.difficulty, locale)}</Badge>
            <Badge variant="secondary">
              {locale === 'zh-CN' ? `${draft.points} 分` : `${draft.points} pt`}
            </Badge>
          </div>
          <ProblemTitleText
            content={draft.title}
            className="text-base font-semibold text-slate-950 dark:text-white"
          />
        </div>

        {stem.trim() ? (
          <ProblemRichText content={stem} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN' ? '暂无题面。' : 'No stem available.'}
          </p>
        )}

        <ProblemImageAssets
          content={content}
          className="mt-5 sm:grid-cols-1 [&_figure]:rounded-lg [&_figure]:bg-white [&_img]:max-h-[320px]"
        />
      </section>

      {content.type === 'choice' ? (
        <section className="space-y-2">
          {content.options.map((option) => (
            <div
              key={option.id}
              className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <span className="mt-1 size-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />
              <div className="flex min-w-0 flex-1 items-start gap-1.5">
                <span className="mt-0.5 shrink-0 font-medium">{option.id}.</span>
                <ProblemRichText
                  content={option.label}
                  className="min-w-0 flex-1 [&_.problem-rich-code-block]:my-0 [&_.problem-rich-code-block]:max-w-full"
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {content.type === 'fill_blank' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN' ? '填空项' : 'Blanks'}
          </p>
          <div className="flex flex-wrap gap-2">
            {content.blanks.map((blank) => (
              <span
                key={blank.id}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {blank.placeholder || blank.id}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {content.type === 'code' && content.starterCode ? (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN' ? '初始代码' : 'Starter code'}
          </p>
          <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-50 dark:border-slate-700">
            {content.starterCode}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

function FilterRuleRow({
  icon: Icon,
  label,
  value,
  options,
  locale,
  onChange,
  onClear,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  options: FilterSelectOption[];
  locale: 'zh-CN' | 'en-US';
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const isActive = value !== 'all';

  return (
    <div className="grid gap-1.5 md:grid-cols-[8.25rem_5.75rem_minmax(0,1fr)_1.5rem] md:items-center">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
        <span className="truncate">{label}</span>
      </div>
      <select
        value="is"
        aria-label={`${label} ${locale === 'zh-CN' ? '关系' : 'operator'}`}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/10"
        onChange={() => undefined}
      >
        <option value="is">{locale === 'zh-CN' ? '是' : 'is'}</option>
      </select>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {filterOptionText(option)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!isActive}
        onClick={onClear}
        aria-label={locale === 'zh-CN' ? `清除${label}筛选` : `Clear ${label.toLowerCase()} filter`}
        className={cn(
          'hidden h-8 w-6 items-center justify-center rounded-md text-slate-400 transition md:inline-flex',
          isActive
            ? 'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            : 'cursor-default opacity-45',
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PhotoAnswerUploader({
  inputId,
  photos,
  disabled,
  locale,
  onAddFiles,
  onRemovePhoto,
}: {
  inputId: string;
  photos: PhotoAnswerDraft[];
  disabled?: boolean;
  locale: 'zh-CN' | 'en-US';
  onAddFiles: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          onAddFiles(event.dataTransfer.files);
        }}
        className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
          disabled
            ? 'pointer-events-none border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900/50'
            : 'border-slate-300 bg-slate-50 hover:border-sky-300 hover:bg-sky-50/70 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-sky-700 dark:hover:bg-sky-950/30'
        }`}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            if (event.currentTarget.files) onAddFiles(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
        <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm ring-1 ring-sky-100 dark:bg-slate-950 dark:text-sky-300 dark:ring-sky-500/25">
          <ImagePlus className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {locale === 'zh-CN' ? '上传照片答案' : 'Upload photo answer'}
        </span>
        <span className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {locale === 'zh-CN'
            ? `点击选择或拖入图片，最多 ${MAX_PHOTO_ANSWER_FILES} 张，每张不超过 4 MB。`
            : `Choose or drop images. Up to ${MAX_PHOTO_ANSWER_FILES} photos, 4 MB each.`}
        </span>
      </label>

      {photos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-900">
                <img
                  src={photo.dataUrl}
                  alt={photo.name}
                  className="h-full w-full object-contain"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemovePhoto(photo.id)}
                  aria-label={locale === 'zh-CN' ? '移除照片' : 'Remove photo'}
                  className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-950/90 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 px-3 py-2">
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                  {photo.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {formatFileSize(photo.size, locale)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function createManualProblemDraft(
  locale: 'zh-CN' | 'en-US',
  notebookId?: string | null,
): NotebookProblemImportDraft {
  return notebookProblemImportDraftSchema.parse({
    draftId: crypto.randomUUID(),
    notebookId: notebookId ?? null,
    title: locale === 'zh-CN' ? '未命名题目' : 'Untitled problem',
    type: 'short_answer',
    status: 'draft',
    source: 'manual',
    points: 1,
    tags: [],
    difficulty: 'medium',
    publicContent: {
      type: 'short_answer',
      stem:
        locale === 'zh-CN'
          ? '请在此输入题目内容，并按需设置所属笔记本、题型与评分规则。'
          : 'Enter the problem statement here, then assign a notebook, type, and grading rules.',
    },
    grading: {
      type: 'short_answer',
    },
    sourceMeta: {
      importMode: 'manual_create',
    },
    validationErrors: [],
  });
}

export {
  AnswerFeedbackSummaryBadge,
  AnswerPreviewPanel,
  AttemptHistoryPanel,
  ChoiceAnswerPreviewPanel,
  FilterRuleRow,
  FormulaReferencePanel,
  MAX_PHOTO_ANSWER_BYTES,
  MAX_PHOTO_ANSWER_FILES,
  PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
  PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
  PROBLEM_BANK_LIST_GRID_CLASS,
  PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
  PROBLEM_BANK_PAGE_SIZE,
  PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
  PhotoAnswerUploader,
  ProblemDraftPreviewPanel,
  ProblemMetaChip,
  answerComposerPlaceholder,
  buildChoiceAnswerFeedback,
  compareProblemSequence,
  createManualProblemDraft,
  difficultyChipClassName,
  difficultyDotClassName,
  difficultyDots,
  difficultyLabel,
  difficultyTextClassName,
  estimateProblemCountFromText,
  feedbackFromAttempt,
  formatAttemptTime,
  formatDraftValidationErrors,
  formatProblemNumber,
  latestAttemptFromRecord,
  latestScoreLabel,
  matchesPracticeFilter,
  practiceFilterLabel,
  practiceStateClassName,
  practiceStateLabel,
  problemMetaChips,
  problemPracticeState,
  problemSolutionSections,
  problemTopics,
  problemTypeVisual,
  readFileAsDataUrl,
  renderProblemContentStem,
  renderProblemStem,
  statusLabel,
  supportsPhotoAnswer,
  typeLabel,
  weakTopicBarClass,
};

export type {
  AnswerPanelTab,
  FilterSelectOption,
  ImportProcessingStage,
  InlineAnswerFeedback,
  PhotoAnswerDraft,
  PracticeFilter,
  ProblemPracticeState,
  ProblemInfoTab,
  TextAnswerMode,
};
