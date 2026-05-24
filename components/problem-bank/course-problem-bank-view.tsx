'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Code2,
  Ellipsis,
  FileText,
  FileUp,
  Gauge,
  Globe2,
  ImagePlus,
  Loader2,
  Minus,
  PenLine,
  Save,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  ExternalLink,
  ListChecks,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { useRouter } from 'next/navigation';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
import {
  getLocalizedProblemContent,
  getLocalizedProblemTitle,
  hasProblemTranslation,
  notebookProblemImportDraftSchema,
  type NotebookProblemPublicContent,
  type ProblemContentLanguage,
  type NotebookProblemAttemptRecord,
  type NotebookProblemAttemptStatus,
  type NotebookProblemImportDraft,
} from '@/lib/problem-bank';
import {
  commitCourseProblemImport,
  deleteCourseProblem,
  listNotebookProblemAttempts,
  listCourseProblems,
  previewCourseProblemImport,
  submitNotebookProblem,
  updateCourseProblem,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { getCourse } from '@/lib/utils/course-storage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AnswerComposer,
  AnswerComposerToolbar,
  useAnswerComposerController,
} from '@/components/problem-bank/answer-composer';
import {
  looksLikeAnswerHtml,
  sanitizeAnswerHtml,
} from '@/components/problem-bank/answer-composer.helpers';
import { ProblemDraftForm } from '@/components/problem-bank/problem-draft-form';
import { ProblemLanguageToggle } from '@/components/problem-bank/problem-language-toggle';
import {
  ProblemImageAssets,
  ProblemRichText,
  ProblemTitleText,
  renderProblemRichTextHtml,
} from '@/components/problem-bank/problem-rich-text';
import { problemDraftToPatch, problemRecordToDraft } from '@/lib/problem-bank/editor';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

function problemSolutionSections(
  problem: NotebookProblemClientRecord,
  locale: 'zh-CN' | 'en-US',
): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const publicContent = problem.publicContent;
  const grading = problem.grading as Record<string, unknown>;

  if (publicContent.type === 'choice') {
    const ids = Array.isArray(grading.correctOptionIds)
      ? grading.correctOptionIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length > 0) {
      const optionText = ids
        .map((id) => {
          const option = publicContent.options.find((item) => item.id === id);
          return option ? `${id}. ${option.label}` : id;
        })
        .join('\n');
      sections.push({
        title: locale === 'zh-CN' ? '正确答案' : 'Correct answer',
        content: optionText,
      });
    }
  }

  if (typeof grading.referenceAnswer === 'string' && grading.referenceAnswer.trim()) {
    sections.push({
      title: locale === 'zh-CN' ? '参考答案' : 'Reference answer',
      content: grading.referenceAnswer,
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
type AnswerPanelTab = 'answer' | 'preview' | 'solution';

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
  'grid grid-cols-[4rem_5.25rem_minmax(14rem,1.7fr)_7rem_6.5rem_4rem_4.75rem_4.25rem]';
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
  const tags = problem.tags.map(normalizeProblemTopic).filter(Boolean);
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
      key: 'notebook',
      label:
        locale === 'zh-CN'
          ? problem.notebookName || '未归类题目'
          : problem.notebookName || 'Unassigned',
      Icon: BookOpen,
      className:
        'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    },
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
              <div className="min-w-0">
                <span className="font-medium">{option.id}.</span>
                <ProblemRichText
                  content={option.label}
                  className="inline-block align-middle [&_p]:inline [&_.katex-display]:inline-block"
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

export function CourseProblemBankView({
  courseId,
  initialNotebookId,
  initialProblemId,
  mode = 'bank',
}: {
  courseId: string;
  initialNotebookId?: string;
  initialProblemId?: string;
  mode?: 'bank' | 'practice';
}) {
  const router = useRouter();
  const isPracticeMode = mode === 'practice';
  const { locale } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);

  const [courseName, setCourseName] = useState('');
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [problemLanguage, setProblemLanguage] = useState<ProblemContentLanguage>(
    locale === 'zh-CN' ? 'zh-CN' : 'en-US',
  );
  const [problemInfoTab, setProblemInfoTab] = useState<ProblemInfoTab>('description');
  const [answerPanelTab, setAnswerPanelTab] = useState<AnswerPanelTab>('answer');
  const [editingPreviewDraft, setEditingPreviewDraft] = useState<NotebookProblemImportDraft | null>(
    null,
  );
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveNotebookId, setMoveNotebookId] = useState<string>('__unassigned__');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [deletingProblem, setDeletingProblem] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerModes, setAnswerModes] = useState<Record<string, TextAnswerMode>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [photoAnswers, setPhotoAnswers] = useState<Record<string, PhotoAnswerDraft[]>>({});
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string[]>>({});
  const [blankAnswers, setBlankAnswers] = useState<Record<string, Record<string, string>>>({});
  const [codeAnswers, setCodeAnswers] = useState<Record<string, string>>({});
  const [answerFeedbackByProblemId, setAnswerFeedbackByProblemId] = useState<
    Record<string, InlineAnswerFeedback>
  >({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [problemPage, setProblemPage] = useState(1);
  const [practiceFilter, setPracticeFilter] = useState<PracticeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | NotebookProblemClientRecord['type']>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<
    'all' | NotebookProblemClientRecord['difficulty']
  >('all');
  const [notebookFilter, setNotebookFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | NotebookProblemClientRecord['status']>(
    'all',
  );

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'pdf' | 'web' | 'manual'>('text');
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWebQuery, setImportWebQuery] = useState('');
  const [drafts, setDrafts] = useState<NotebookProblemImportDraft[]>([]);
  const [includedDraftIds, setIncludedDraftIds] = useState<Record<string, boolean>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditorText, setDraftEditorText] = useState('');
  const [importProcessingStage, setImportProcessingStage] = useState<ImportProcessingStage>('idle');
  const [importProcessingDetail, setImportProcessingDetail] = useState('');
  const [importSummaryNote, setImportSummaryNote] = useState<string | null>(null);
  const [importEstimatedProblemCount, setImportEstimatedProblemCount] = useState(0);
  const [importProcessedProblemCount, setImportProcessedProblemCount] = useState(0);
  const [importUsage, setImportUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null>(null);
  const [importWebSearchSummary, setImportWebSearchSummary] = useState<{
    query: string;
    sourceCount: number;
    estimatedCostCredits: number;
    sources: Array<{ title: string; url: string }>;
  } | null>(null);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [previewNotebookOptions, setPreviewNotebookOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const loadAll = useCallback(async () => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [course, courseNotebooks, courseProblems] = await Promise.all([
        getCourse(courseId),
        listStagesByCourse(courseId),
        listCourseProblems(courseId),
      ]);
      setCourseName(course?.name || '');
      setNotebooks(courseNotebooks);
      setProblems(courseProblems);
      if (isPracticeMode) {
        const preferred =
          courseProblems.find((problem) => problem.id === initialProblemId)?.id ??
          courseProblems.find((problem) =>
            initialNotebookId ? problem.notebookId === initialNotebookId : true,
          )?.id ??
          courseProblems[0]?.id ??
          null;
        setSelectedProblemId(preferred);
      } else {
        setSelectedProblemId((current) =>
          current && courseProblems.some((problem) => problem.id === current) ? current : null,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load course problems');
    } finally {
      setLoading(false);
    }
  }, [courseId, initialNotebookId, initialProblemId, isPracticeMode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setProblemLanguage(locale === 'zh-CN' ? 'zh-CN' : 'en-US');
  }, [locale]);

  useEffect(() => {
    if (!isPracticeMode || problems.length === 0) return;
    const syncSelectedProblemFromUrl = () => {
      const [, courseSegment, encodedCourseId, problemBankSegment, encodedProblemId] =
        window.location.pathname.split('/');
      if (
        courseSegment !== 'course' ||
        problemBankSegment !== 'problem-bank' ||
        decodeURIComponent(encodedCourseId || '') !== courseId ||
        !encodedProblemId
      ) {
        return;
      }
      const problemId = decodeURIComponent(encodedProblemId);
      if (problems.some((problem) => problem.id === problemId)) {
        setSelectedProblemId(problemId);
      }
    };
    window.addEventListener('popstate', syncSelectedProblemFromUrl);
    return () => window.removeEventListener('popstate', syncSelectedProblemFromUrl);
  }, [courseId, isPracticeMode, problems]);

  const filteredProblems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return problems.filter((problem) => {
      if (typeFilter !== 'all' && problem.type !== typeFilter) return false;
      if (statusFilter !== 'all' && problem.status !== statusFilter) return false;
      if (practiceFilter !== 'all' && !matchesPracticeFilter(problem, practiceFilter)) {
        return false;
      }
      if (difficultyFilter !== 'all' && problem.difficulty !== difficultyFilter) return false;
      if (notebookFilter === '__unassigned__') {
        if (problem.notebookId) return false;
      } else if (notebookFilter !== 'all' && problem.notebookId !== notebookFilter) {
        return false;
      }
      if (initialNotebookId && problem.notebookId !== initialNotebookId) return false;
      if (query) {
        const problemNumber = problem.problemNumber ?? problem.order + 1;
        const zhContent = getLocalizedProblemContent(problem.publicContent, 'zh-CN');
        const haystack = [
          String(problemNumber),
          `#${problemNumber}`,
          `q${problemNumber}`,
          problem.title,
          getLocalizedProblemTitle(problem, 'zh-CN'),
          renderProblemStem(problem),
          renderProblemContentStem(zhContent),
          problem.notebookName ?? '',
          ...problem.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    difficultyFilter,
    initialNotebookId,
    notebookFilter,
    practiceFilter,
    problems,
    searchQuery,
    statusFilter,
    typeFilter,
  ]);

  useEffect(() => {
    setProblemPage(1);
  }, [
    difficultyFilter,
    initialNotebookId,
    notebookFilter,
    practiceFilter,
    searchQuery,
    statusFilter,
    typeFilter,
  ]);

  const problemPageCount = Math.max(1, Math.ceil(filteredProblems.length / PROBLEM_BANK_PAGE_SIZE));

  useEffect(() => {
    setProblemPage((current) => Math.min(Math.max(current, 1), problemPageCount));
  }, [problemPageCount]);

  const currentProblemPage = Math.min(Math.max(problemPage, 1), problemPageCount);
  const pageStartIndex = (currentProblemPage - 1) * PROBLEM_BANK_PAGE_SIZE;
  const paginatedProblems = useMemo(
    () => filteredProblems.slice(pageStartIndex, pageStartIndex + PROBLEM_BANK_PAGE_SIZE),
    [filteredProblems, pageStartIndex],
  );
  const pageEndIndex = Math.min(pageStartIndex + paginatedProblems.length, filteredProblems.length);

  const activeProblems = useMemo(
    () => problems.filter((problem) => problem.status !== 'archived'),
    [problems],
  );
  const courseHasTranslations = useMemo(
    () => problems.some((problem) => hasProblemTranslation(problem)),
    [problems],
  );

  const difficultyOptions = useMemo(
    () =>
      (['easy', 'medium', 'hard'] as NotebookProblemClientRecord['difficulty'][]).map((value) => ({
        value,
        count: activeProblems.filter((problem) => problem.difficulty === value).length,
      })),
    [activeProblems],
  );

  const bankNotebookOptions = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const problem of activeProblems) {
      const id = problem.notebookId || '__unassigned__';
      const name = problem.notebookName || (locale === 'zh-CN' ? '未归类' : 'Unassigned');
      const current = counts.get(id);
      counts.set(id, { id, name, count: (current?.count ?? 0) + 1 });
    }
    for (const notebook of notebooks) {
      if (!counts.has(notebook.id))
        counts.set(notebook.id, { id: notebook.id, name: notebook.name, count: 0 });
    }
    return Array.from(counts.values()).sort((a, b) => {
      if (a.id === '__unassigned__') return 1;
      if (b.id === '__unassigned__') return -1;
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  }, [activeProblems, locale, notebooks]);

  const practiceFilterOptions = useMemo<FilterSelectOption[]>(
    () =>
      (['all', 'review', 'wrong', 'unattempted', 'mastered'] as PracticeFilter[]).map((value) => ({
        value,
        label: practiceFilterLabel(value, locale),
      })),
    [locale],
  );

  const difficultyFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部难度' : 'All levels' },
      ...difficultyOptions.map((option) => ({
        value: option.value,
        label: difficultyLabel(option.value, locale),
        count: option.count,
      })),
    ],
    [difficultyOptions, locale],
  );

  const notebookFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部笔记本' : 'All notebooks' },
      ...bankNotebookOptions.map((option) => ({
        value: option.id,
        label: option.name,
        count: option.count,
      })),
    ],
    [bankNotebookOptions, locale],
  );

  const typeFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部题型' : 'All types' },
      { value: 'short_answer', label: typeLabel('short_answer', locale) },
      { value: 'choice', label: typeLabel('choice', locale) },
      { value: 'proof', label: typeLabel('proof', locale) },
      { value: 'calculation', label: typeLabel('calculation', locale) },
      { value: 'fill_blank', label: typeLabel('fill_blank', locale) },
      { value: 'code', label: typeLabel('code', locale) },
    ],
    [locale],
  );

  const statusFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部状态' : 'All status' },
      { value: 'draft', label: statusLabel('draft', locale) },
      { value: 'published', label: statusLabel('published', locale) },
      { value: 'archived', label: statusLabel('archived', locale) },
    ],
    [locale],
  );

  const bankStats = useMemo(() => {
    const stateCounts = activeProblems.reduce(
      (counts, problem) => {
        counts[problemPracticeState(problem)] += 1;
        return counts;
      },
      { mastered: 0, review: 0, wrong: 0, unattempted: 0 } as Record<ProblemPracticeState, number>,
    );
    const attempted = activeProblems.length - stateCounts.unattempted;
    const masteryPercent =
      activeProblems.length > 0
        ? Math.round((stateCounts.mastered / activeProblems.length) * 100)
        : 0;
    const allTopics = new Set<string>();
    const masteredTopics = new Set<string>();
    const notebookNameById = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));
    const chapterPracticeCounts = new Map<
      string,
      { topic: string; count: number; total: number; order: number }
    >(
      notebooks.map((notebook, index) => [
        notebook.id,
        { topic: notebook.name, count: 0, total: 0, order: index },
      ]),
    );
    let unassignedOrder = notebooks.length;
    for (const problem of activeProblems) {
      const state = problemPracticeState(problem);
      for (const topic of problemTopics(problem)) {
        if (topic !== '未标注') {
          allTopics.add(topic);
          if (state === 'mastered') masteredTopics.add(topic);
        }
      }

      if (state !== 'unattempted') {
        const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
        const notebookName =
          problem.notebookName ||
          (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
          (locale === 'zh-CN' ? '未归属笔记本' : 'Unassigned notebook');
        const current = chapterPracticeCounts.get(notebookKey) ?? {
          topic: notebookName,
          count: 0,
          total: 0,
          order: unassignedOrder++,
        };
        current.count += 1;
        chapterPracticeCounts.set(notebookKey, current);
      }

      const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
      const notebookName =
        problem.notebookName ||
        (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
        (locale === 'zh-CN' ? '未归属笔记本' : 'Unassigned notebook');
      const current = chapterPracticeCounts.get(notebookKey) ?? {
        topic: notebookName,
        count: 0,
        total: 0,
        order: unassignedOrder++,
      };
      current.total += 1;
      chapterPracticeCounts.set(notebookKey, current);
    }
    const coveredNotebookCount = new Set(
      activeProblems.map((problem) => problem.notebookId).filter(Boolean),
    ).size;
    const maxChapterPracticeCount = Math.max(
      1,
      ...Array.from(chapterPracticeCounts.values()).map((item) => item.count),
    );
    const leastPracticedChapters = Array.from(chapterPracticeCounts.values())
      .sort(
        (a, b) =>
          a.count - b.count ||
          b.total - a.total ||
          a.order - b.order ||
          a.topic.localeCompare(b.topic),
      )
      .slice(0, 5)
      .map((item) => ({
        topic: item.topic,
        count: item.count,
        total: item.total,
        percent: Math.min(100, Math.round((item.count / maxChapterPracticeCount) * 100)),
      }));
    return {
      total: activeProblems.length,
      attempted,
      mastered: stateCounts.mastered,
      review: stateCounts.review,
      wrong: stateCounts.wrong,
      unattempted: stateCounts.unattempted,
      masteryPercent,
      coveredNotebookCount,
      notebookCount: notebooks.length,
      masteredTopicCount: masteredTopics.size,
      topicCount: allTopics.size,
      weakTopics: leastPracticedChapters,
    };
  }, [activeProblems, locale, notebooks]);

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ||
    problems.find((problem) => problem.id === selectedProblemId) ||
    null;
  const selectedProblemContent = selectedProblem
    ? getLocalizedProblemContent(selectedProblem.publicContent, problemLanguage)
    : null;
  const selectedProblemTitle = selectedProblem
    ? getLocalizedProblemTitle(selectedProblem, problemLanguage)
    : '';
  const selectedProblemHasTranslation = hasProblemTranslation(selectedProblem);
  const selectedProblemRef = useRef<NotebookProblemClientRecord | null>(null);
  const selectedProblemNotebookId = selectedProblem?.notebookId ?? null;
  const selectedProblemLatestAttemptId = selectedProblem?.latestAttempt?.id ?? null;
  useEffect(() => {
    selectedProblemRef.current = selectedProblem;
  }, [selectedProblem]);
  const sameNotebookProblems = useMemo(() => {
    if (!selectedProblem?.notebookId) return [];
    return problems
      .filter(
        (problem) =>
          problem.status !== 'archived' && problem.notebookId === selectedProblem.notebookId,
      )
      .sort(compareProblemSequence);
  }, [problems, selectedProblem?.notebookId]);
  const nextNotebookProblem = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return null;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex >= 0 ? (sameNotebookProblems[currentIndex + 1] ?? null) : null;
  }, [sameNotebookProblems, selectedProblem]);
  const previousNotebookProblem = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return null;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex > 0 ? sameNotebookProblems[currentIndex - 1] : null;
  }, [sameNotebookProblems, selectedProblem]);
  const currentNotebookProblemPosition = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return 0;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex >= 0 ? currentIndex + 1 : 0;
  }, [sameNotebookProblems, selectedProblem]);
  const selectedProblemEditDraft = useMemo(
    () => (selectedProblem ? problemRecordToDraft(selectedProblem) : null),
    [selectedProblem],
  );
  const visibleProblemPreviewDraft = editingPreviewDraft ?? selectedProblemEditDraft;
  const selectedProblemSolutionSections = useMemo(() => {
    if (!selectedProblem || !selectedProblemContent) return [];
    return problemSolutionSections(
      { ...selectedProblem, publicContent: selectedProblemContent },
      locale,
    );
  }, [locale, selectedProblem, selectedProblemContent]);
  const selectedAnswerFeedback = selectedProblem
    ? (answerFeedbackByProblemId[selectedProblem.id] ?? null)
    : null;
  const selectedAnswerMode: TextAnswerMode = selectedProblem
    ? (answerModes[selectedProblem.id] ?? 'text')
    : 'text';
  const selectedTextAnswerValue = selectedProblem ? (textAnswers[selectedProblem.id] ?? '') : '';
  const selectedTextAnswerId = selectedProblem?.id;
  const setSelectedTextAnswer = useCallback(
    (nextValue: string) => {
      if (!selectedTextAnswerId) return;
      setTextAnswers((prev) => ({
        ...prev,
        [selectedTextAnswerId]: nextValue,
      }));
    },
    [selectedTextAnswerId],
  );
  const selectedAnswerController = useAnswerComposerController({
    value: selectedTextAnswerValue,
    onChange: setSelectedTextAnswer,
  });
  const handleProblemInfoTabChange = useCallback((tab: ProblemInfoTab) => {
    setProblemInfoTab(tab);
    if (tab === 'edit') setAnswerPanelTab('preview');
  }, []);
  const handleEditingDraftChange = useCallback((nextDraft: NotebookProblemImportDraft) => {
    setEditingPreviewDraft(nextDraft);
  }, []);
  const insertFormulaIntoAnswer = useCallback(
    (latex: string) => {
      if (!selectedProblem) return;
      if (!supportsPhotoAnswer(selectedProblem)) {
        toast.error(
          locale === 'zh-CN'
            ? '这类题没有文字作答框，暂时不能插入公式。'
            : 'This problem type does not have a text answer box yet.',
        );
        return;
      }

      setAnswerPanelTab('answer');
      if (selectedAnswerMode === 'photo') {
        setAnswerModes((prev) => ({
          ...prev,
          [selectedProblem.id]: 'text',
        }));
      }

      window.setTimeout(() => {
        selectedAnswerController.applyEdit({ kind: 'insert', text: latex });
      }, 0);
    },
    [locale, selectedAnswerController, selectedAnswerMode, selectedProblem],
  );
  useEffect(() => {
    if (!isPracticeMode || !selectedProblemId || !selectedProblemNotebookId) return;
    const problem = selectedProblemRef.current;
    if (
      !problem ||
      problem.id !== selectedProblemId ||
      problem.notebookId !== selectedProblemNotebookId
    ) {
      return;
    }

    let cancelled = false;
    void listNotebookProblemAttempts(selectedProblemNotebookId, selectedProblemId)
      .then((attempts) => {
        if (cancelled) return;
        const latestAttempt = attempts[0];
        if (!latestAttempt) return;
        const answer = latestAttempt.answer;

        setProblems((prev) =>
          prev.map((item) =>
            item.id === problem.id
              ? {
                  ...item,
                  latestAttempt: latestAttemptFromRecord(latestAttempt),
                }
              : item,
          ),
        );
        if (Array.isArray(answer.selectedOptionIds)) {
          setChoiceAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.selectedOptionIds ?? [],
          }));
        }
        if (answer.blanks) {
          setBlankAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.blanks ?? {},
          }));
        }
        if (typeof answer.code === 'string') {
          setCodeAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.code ?? '',
          }));
        }
        if (typeof answer.text === 'string') {
          setTextAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.text ?? '',
          }));
        }
        if (Array.isArray(answer.images)) {
          setPhotoAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.images ?? [],
          }));
        }
        setAnswerFeedbackByProblemId((prev) => ({
          ...prev,
          [problem.id]: feedbackFromAttempt(problem, latestAttempt, locale),
        }));
      })
      .catch((error) => {
        console.warn('Failed to restore latest problem attempt', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPracticeMode,
    locale,
    selectedProblemId,
    selectedProblemLatestAttemptId,
    selectedProblemNotebookId,
  ]);
  const navigateToPracticeProblem = useCallback(
    (problem: NotebookProblemClientRecord) => {
      if (!isPracticeMode) {
        router.push(
          `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
        );
        return;
      }
      setSelectedProblemId(problem.id);
      const nextPath = `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
    },
    [courseId, isPracticeMode, router],
  );
  const showSidebarAnswerTools = false;
  const activeBankFilterCount = [
    practiceFilter !== 'all',
    typeFilter !== 'all',
    difficultyFilter !== 'all',
    notebookFilter !== 'all',
    statusFilter !== 'all',
  ].filter(Boolean).length;

  useEffect(() => {
    if (!selectedProblemId) return;
    setAnswerModes((prev) => {
      if (prev[selectedProblemId] === 'text') return prev;
      return {
        ...prev,
        [selectedProblemId]: 'text',
      };
    });
  }, [selectedProblemId]);

  useEffect(() => {
    setMoveNotebookId(selectedProblem?.notebookId || '__unassigned__');
  }, [selectedProblem?.id, selectedProblem?.notebookId]);

  useEffect(() => {
    setProblemInfoTab('description');
    setAnswerPanelTab('answer');
  }, [selectedProblem?.id]);

  useEffect(() => {
    setEditingPreviewDraft(selectedProblemEditDraft);
  }, [selectedProblemEditDraft]);

  const notebookOptions = useMemo(
    () =>
      previewNotebookOptions.length > 0
        ? previewNotebookOptions
        : notebooks.map((notebook) => ({ id: notebook.id, name: notebook.name })),
    [notebooks, previewNotebookOptions],
  );

  const handlePreviewImport = useCallback(async () => {
    setPreviewLoading(true);
    setImportSummaryNote(null);
    setImportUsage(null);
    setImportWebSearchSummary(null);
    setImportBatchId(null);
    try {
      if (importMode === 'manual') {
        const manualDraft = createManualProblemDraft(locale, initialNotebookId ?? null);
        setPreviewNotebookOptions(
          notebooks.map((notebook) => ({ id: notebook.id, name: notebook.name })),
        );
        setImportEstimatedProblemCount(1);
        setImportProcessedProblemCount(1);
        setImportProcessingStage('preview-ready');
        setImportProcessingDetail(
          locale === 'zh-CN'
            ? '已创建 1 道手动草稿，可以直接设置章节归属并填写题目表单。'
            : 'Created 1 manual draft. You can assign a notebook and fill out the form right away.',
        );
        setDrafts([manualDraft]);
        setIncludedDraftIds({ [manualDraft.draftId]: true });
        setEditingDraftId(manualDraft.draftId);
        setDraftEditorText(JSON.stringify(manualDraft, null, 2));
        setImportSummaryNote(
          locale === 'zh-CN'
            ? '已创建 1 道手动题目草稿。手动添加不触发导题扣费，补充完成后可直接写入课程题库。'
            : 'Created 1 manual draft. Manual creation does not trigger import charges.',
        );
        return;
      }

      let text = importText.trim();
      let source: 'manual' | 'pdf' | 'web' = 'manual';
      let searchQuery = '';
      if (importMode === 'pdf') {
        if (!importFile) {
          throw new Error(locale === 'zh-CN' ? '请先选择 PDF 文件' : 'Select a PDF first');
        }
        setImportProcessingStage('parsing');
        setImportProcessingDetail(
          locale === 'zh-CN' ? '正在解析 PDF，并提取可用于导题的文本…' : 'Parsing PDF…',
        );
        const providerCfg = pdfProvidersConfig[pdfProviderId];
        const parsed = await parsePdfForGeneration({
          pdfFile: importFile,
          language: locale,
          providerId: pdfProviderId,
          providerConfig: {
            apiKey: providerCfg?.apiKey,
            baseUrl: providerCfg?.baseUrl,
          },
        });
        text = parsed.pdfText.trim();
        source = 'pdf';
        setImportEstimatedProblemCount(estimateProblemCountFromText(text));
        setImportProcessedProblemCount(0);
      } else if (importMode === 'web') {
        searchQuery = importWebQuery.trim();
        if (!searchQuery) {
          throw new Error(
            locale === 'zh-CN'
              ? '请先输入课程名或搜题关键词'
              : 'Enter a course name or search query first',
          );
        }
        source = 'web';
        setImportProcessingStage('searching');
        setImportProcessingDetail(
          locale === 'zh-CN'
            ? '正在联网搜索课程题目、往届试题和练习材料…'
            : 'Searching the web for course problems and past exams…',
        );
      }

      if (source !== 'web' && !text) {
        throw new Error(locale === 'zh-CN' ? '请先输入题目内容' : 'Enter problem text first');
      }
      if (importMode === 'text') {
        setImportEstimatedProblemCount(estimateProblemCountFromText(text));
        setImportProcessedProblemCount(0);
      }
      if (source !== 'web') {
        setImportProcessingStage('extracting');
        setImportProcessingDetail(
          locale === 'zh-CN' ? '正在从材料中拆分题目草稿…' : 'Extracting problem drafts…',
        );
      }

      const previewResult = await previewCourseProblemImport({
        courseId,
        source,
        text,
        searchQuery,
        webSearchApiKey: webSearchProvidersConfig[webSearchProviderId]?.apiKey || undefined,
        sourceFileName: importFile?.name,
        sourceFileMime: importFile?.type,
        language: locale,
      });

      setPreviewNotebookOptions(previewResult.notebooks);
      setImportUsage(previewResult.usage);
      setImportWebSearchSummary(previewResult.webSearch);
      setImportBatchId(previewResult.importBatch?.id ?? null);
      setImportProcessingStage('validating');
      setImportProcessingDetail(
        locale === 'zh-CN'
          ? '正在校验题目 schema，并给题目匹配章节…'
          : 'Validating and matching notebooks…',
      );

      setImportProcessedProblemCount(previewResult.drafts.length);
      setDrafts(previewResult.drafts);
      setIncludedDraftIds(
        Object.fromEntries(previewResult.drafts.map((draft) => [draft.draftId, true])),
      );
      if (previewResult.drafts[0]) {
        setEditingDraftId(previewResult.drafts[0].draftId);
        setDraftEditorText(JSON.stringify(previewResult.drafts[0], null, 2));
      }

      const needsFixCount = previewResult.drafts.filter(
        (draft) => draft.validationErrors.length > 0,
      ).length;
      setImportProcessingStage('preview-ready');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '草稿预览已生成，可以调整章节归属后写入课程题库。' : 'Preview ready.',
      );
      setImportSummaryNote(
        locale === 'zh-CN'
          ? `已生成 ${previewResult.drafts.length} 道题草稿，其中 ${needsFixCount} 道需要修正。`
          : `${previewResult.drafts.length} drafts generated, ${needsFixCount} need fixes.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import preview failed');
      setImportProcessingStage('idle');
      setImportProcessingDetail('');
      setImportEstimatedProblemCount(0);
      setImportProcessedProblemCount(0);
      setImportBatchId(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    courseId,
    importFile,
    importMode,
    importText,
    importWebQuery,
    initialNotebookId,
    locale,
    notebooks,
    pdfProviderId,
    pdfProvidersConfig,
    webSearchProviderId,
    webSearchProvidersConfig,
  ]);

  const handleSaveDraftEditor = useCallback(() => {
    if (!editingDraftId) return;
    try {
      const parsedJson = JSON.parse(draftEditorText) as unknown;
      const validated = notebookProblemImportDraftSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error(formatDraftValidationErrors(parsedJson).join('\n'));
      }
      setDrafts((prev) =>
        prev.map((draft) => (draft.draftId === editingDraftId ? validated.data : draft)),
      );
      toast.success(locale === 'zh-CN' ? '草稿已更新' : 'Draft updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }, [draftEditorText, editingDraftId, locale]);

  const handleSaveManualDraft = useCallback(
    (nextDraft: NotebookProblemImportDraft) => {
      setDrafts((prev) =>
        prev.map((draft) => (draft.draftId === nextDraft.draftId ? nextDraft : draft)),
      );
      setEditingDraftId(nextDraft.draftId);
      setDraftEditorText(JSON.stringify(nextDraft, null, 2));
      toast.success(locale === 'zh-CN' ? '草稿表单已保存' : 'Draft form saved');
    },
    [locale],
  );

  const handleCommitImport = useCallback(async () => {
    const selectedDrafts = drafts.filter((draft) => includedDraftIds[draft.draftId]);
    if (selectedDrafts.length === 0) {
      toast.error(locale === 'zh-CN' ? '请至少选择一条草稿' : 'Select at least one draft');
      return;
    }

    setCommitLoading(true);
    setImportProcessingStage('committing');
    setImportProcessingDetail(
      locale === 'zh-CN' ? '正在写入课程题库，并刷新列表…' : 'Committing to course problem bank…',
    );
    try {
      const nextProblems = await commitCourseProblemImport({
        courseId,
        drafts: selectedDrafts,
        importBatchId,
      });
      setProblems(nextProblems);
      setSelectedProblemId(nextProblems[0]?.id ?? null);
      setImportOpen(false);
      setImportText('');
      setImportFile(null);
      setImportWebQuery('');
      setImportBatchId(null);
      setDrafts([]);
      setImportProcessingStage('completed');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '题目已经写入课程题库。' : 'Problems imported.',
      );
      toast.success(locale === 'zh-CN' ? '题目已写入课程题库' : 'Problems imported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import commit failed');
      setImportProcessingStage('preview-ready');
    } finally {
      setCommitLoading(false);
    }
  }, [courseId, drafts, importBatchId, includedDraftIds, locale]);

  const editingDraft = drafts.find((draft) => draft.draftId === editingDraftId) || null;
  const editingDraftIsManual =
    editingDraft?.sourceMeta &&
    typeof editingDraft.sourceMeta === 'object' &&
    (editingDraft.sourceMeta as Record<string, unknown>).importMode === 'manual_create';

  const handleSaveAssignment = useCallback(async () => {
    if (!selectedProblem || savingAssignment) return;
    setSavingAssignment(true);
    try {
      const updated = await updateCourseProblem({
        courseId,
        problemId: selectedProblem.id,
        patch: {
          notebookId: moveNotebookId === '__unassigned__' ? null : moveNotebookId,
        },
      });
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? updated : problem)));
      setMoveNotebookId(updated.notebookId ?? '__unassigned__');
      setMoveDialogOpen(false);
      toast.success(locale === 'zh-CN' ? '题目归属已更新' : 'Problem assignment updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment update failed');
    } finally {
      setSavingAssignment(false);
    }
  }, [courseId, locale, moveNotebookId, savingAssignment, selectedProblem]);

  const handleAddPhotoAnswerFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!selectedProblem) return;
      const problemId = selectedProblem.id;
      const existingCount = photoAnswers[problemId]?.length ?? 0;
      const remainingSlots = MAX_PHOTO_ANSWER_FILES - existingCount;
      if (remainingSlots <= 0) {
        toast.error(
          locale === 'zh-CN'
            ? `最多只能上传 ${MAX_PHOTO_ANSWER_FILES} 张照片。`
            : `You can upload up to ${MAX_PHOTO_ANSWER_FILES} photos.`,
        );
        return;
      }

      const incoming = Array.from(files);
      const imageFiles = incoming.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        toast.error(locale === 'zh-CN' ? '请选择图片文件。' : 'Choose image files.');
        return;
      }

      const accepted = imageFiles
        .filter((file) => {
          if (file.size <= MAX_PHOTO_ANSWER_BYTES) return true;
          toast.error(
            locale === 'zh-CN'
              ? `${file.name} 超过 4 MB，已跳过。`
              : `${file.name} is larger than 4 MB and was skipped.`,
          );
          return false;
        })
        .slice(0, remainingSlots);

      if (imageFiles.length > accepted.length) {
        toast.error(
          locale === 'zh-CN'
            ? `已达到最多 ${MAX_PHOTO_ANSWER_FILES} 张照片的限制。`
            : `Only ${MAX_PHOTO_ANSWER_FILES} photos are allowed.`,
        );
      }
      if (accepted.length === 0) return;

      try {
        const nextPhotos = await Promise.all(
          accepted.map(async (file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || 'image/*',
            size: file.size,
            dataUrl: await readFileAsDataUrl(file),
          })),
        );
        setPhotoAnswers((prev) => ({
          ...prev,
          [problemId]: [...(prev[problemId] ?? []), ...nextPhotos].slice(0, MAX_PHOTO_ANSWER_FILES),
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read image');
      }
    },
    [locale, photoAnswers, selectedProblem],
  );

  const handleRemovePhotoAnswer = useCallback(
    (photoId: string) => {
      if (!selectedProblem) return;
      setPhotoAnswers((prev) => ({
        ...prev,
        [selectedProblem.id]: (prev[selectedProblem.id] ?? []).filter(
          (photo) => photo.id !== photoId,
        ),
      }));
    },
    [selectedProblem],
  );

  const handleUpdateProblem = useCallback(
    async (patch: {
      title?: string;
      status?: 'draft' | 'published' | 'archived';
      points?: number;
      tags?: string[];
      difficulty?: 'easy' | 'medium' | 'hard';
      publicContent?: unknown;
      grading?: unknown;
      secretJudge?: unknown | null;
    }) => {
      if (!selectedProblem) return;
      const updated = await updateCourseProblem({
        courseId,
        problemId: selectedProblem.id,
        patch,
      });
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? updated : problem)));
      setSelectedProblemId(updated.id);
    },
    [courseId, selectedProblem],
  );

  const handleDeleteProblem = useCallback(async () => {
    if (!selectedProblem || deletingProblem) return;
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? `确认删除题目「${selectedProblem.title}」吗？删除后不可恢复。`
        : `Delete "${selectedProblem.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingProblem(true);
    try {
      await deleteCourseProblem({
        courseId,
        problemId: selectedProblem.id,
      });
      setProblems((prev) => prev.filter((problem) => problem.id !== selectedProblem.id));
      setSelectedProblemId((current) => (current === selectedProblem.id ? null : current));
      toast.success(locale === 'zh-CN' ? '题目已删除' : 'Problem deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeletingProblem(false);
    }
  }, [courseId, deletingProblem, locale, selectedProblem]);

  const handleSubmitInlineAnswer = useCallback(async () => {
    if (!selectedProblem || submittingAnswer) return;
    if (!selectedProblem.notebookId) {
      toast.error(
        locale === 'zh-CN'
          ? '请先为这道题设置归属章节并保存，才能作答。'
          : 'Assign this problem to a notebook and save before submitting.',
      );
      return;
    }
    const photoMode = supportsPhotoAnswer(selectedProblem) && selectedAnswerMode === 'photo';
    const selectedPhotos = photoAnswers[selectedProblem.id] ?? [];
    if (photoMode && selectedPhotos.length === 0) {
      toast.error(locale === 'zh-CN' ? '请先上传照片答案。' : 'Upload a photo answer first.');
      return;
    }
    const selectedChoiceOptionIds = choiceAnswers[selectedProblem.id] ?? [];
    if (selectedProblem.type === 'choice' && selectedChoiceOptionIds.length === 0) {
      toast.error(locale === 'zh-CN' ? '请先选择一个答案。' : 'Choose an answer first.');
      return;
    }
    const immediateChoiceFeedback =
      selectedProblem.type === 'choice'
        ? buildChoiceAnswerFeedback(selectedProblem, selectedChoiceOptionIds, locale)
        : null;
    if (immediateChoiceFeedback) {
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: immediateChoiceFeedback,
      }));
    }
    setSubmittingAnswer(true);
    try {
      const payload =
        selectedProblem.type === 'choice'
          ? { selectedOptionIds: selectedChoiceOptionIds }
          : selectedProblem.type === 'fill_blank'
            ? { blanks: blankAnswers[selectedProblem.id] ?? {} }
            : selectedProblem.type === 'code'
              ? { code: codeAnswers[selectedProblem.id] ?? '' }
              : photoMode
                ? { images: selectedPhotos }
                : { text: textAnswers[selectedProblem.id] ?? '' };
      const { attempt, result } = await submitNotebookProblem({
        notebookId: selectedProblem.notebookId,
        problemId: selectedProblem.id,
        language: locale,
        ...payload,
      });
      setProblems((prev) =>
        prev.map((problem) =>
          problem.id === selectedProblem.id
            ? {
                ...problem,
                latestAttempt: latestAttemptFromRecord(attempt),
              }
            : problem,
        ),
      );
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: {
          status: attempt.status,
          score: attempt.score ?? immediateChoiceFeedback?.score ?? null,
          feedback:
            result?.feedback ||
            immediateChoiceFeedback?.feedback ||
            (locale === 'zh-CN' ? '答案已提交。' : 'Answer submitted.'),
          correctOptionIds: immediateChoiceFeedback?.correctOptionIds,
          selectedOptionIds: immediateChoiceFeedback?.selectedOptionIds,
          saving: false,
        },
      }));
      if (attempt.status === 'passed') {
        toast.success(locale === 'zh-CN' ? '回答正确' : 'Correct');
      } else if (attempt.status === 'failed') {
        toast.error(locale === 'zh-CN' ? '回答不正确' : 'Incorrect');
      } else {
        toast.success(locale === 'zh-CN' ? '已提交答案' : 'Answer submitted');
      }
    } catch (error) {
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: {
          status: 'error',
          score: null,
          feedback:
            locale === 'zh-CN'
              ? '答案没有保存成功，请再试一次。'
              : 'The answer was not saved. Please try again.',
          correctOptionIds: immediateChoiceFeedback?.correctOptionIds,
          selectedOptionIds: immediateChoiceFeedback?.selectedOptionIds,
          saving: false,
        },
      }));
      toast.error(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setSubmittingAnswer(false);
    }
  }, [
    blankAnswers,
    choiceAnswers,
    codeAnswers,
    locale,
    photoAnswers,
    selectedProblem,
    selectedAnswerMode,
    submittingAnswer,
    textAnswers,
  ]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full',
        isPracticeMode ? 'gap-2 bg-[#f5f5f5] p-2 dark:bg-slate-950' : 'gap-3 p-3',
      )}
    >
      {!isPracticeMode ? (
        <>
          <div className="order-1 flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/92 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/55">
            <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-sky-600 dark:text-sky-300">
                  {courseName || (locale === 'zh-CN' ? '课程空间' : 'Course workspace')}
                </span>

                <label className="relative ml-auto w-[320px] max-w-[40%] shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={
                      locale === 'zh-CN'
                        ? '搜索题号、题目、知识点、来源'
                        : 'Search numbers, problems, topics, sources'
                    }
                    className="h-9 pl-9"
                  />
                </label>

                <div className="flex shrink-0 items-center gap-2">
                  {courseHasTranslations ? (
                    <ProblemLanguageToggle
                      value={problemLanguage}
                      locale={locale}
                      onChange={setProblemLanguage}
                    />
                  ) : null}
                  <span className="text-xs font-medium text-slate-400">
                    {filteredProblems.length}/{problems.length}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                        {locale === 'zh-CN' ? '筛选' : 'Filters'}
                        {activeBankFilterCount > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sky-600 px-1.5 text-[11px] font-bold text-white dark:bg-sky-400 dark:text-slate-950">
                            {activeBankFilterCount}
                          </span>
                        ) : null}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={8}
                      className="w-[620px] max-w-[calc(100vw-3rem)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {locale === 'zh-CN' ? '筛选题目' : 'Filter problems'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {filteredProblems.length}/{problems.length}
                          </p>
                        </div>
                        {activeBankFilterCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPracticeFilter('all');
                              setTypeFilter('all');
                              setDifficultyFilter('all');
                              setNotebookFilter('all');
                              setStatusFilter('all');
                            }}
                            className="rounded-full px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-500/10"
                          >
                            {locale === 'zh-CN' ? '清空' : 'Clear'}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        <FilterRuleRow
                          icon={CheckSquare}
                          label={locale === 'zh-CN' ? '练习状态' : 'Status'}
                          value={practiceFilter}
                          options={practiceFilterOptions}
                          locale={locale}
                          onChange={(value) => setPracticeFilter(value as PracticeFilter)}
                          onClear={() => setPracticeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Gauge}
                          label={locale === 'zh-CN' ? '难度' : 'Difficulty'}
                          value={difficultyFilter}
                          options={difficultyFilterOptions}
                          locale={locale}
                          onChange={(value) =>
                            setDifficultyFilter(value as typeof difficultyFilter)
                          }
                          onClear={() => setDifficultyFilter('all')}
                        />
                        <FilterRuleRow
                          icon={BookOpen}
                          label={locale === 'zh-CN' ? '笔记本' : 'Notebook'}
                          value={notebookFilter}
                          options={notebookFilterOptions}
                          locale={locale}
                          onChange={setNotebookFilter}
                          onClear={() => setNotebookFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Type}
                          label={locale === 'zh-CN' ? '题型' : 'Type'}
                          value={typeFilter}
                          options={typeFilterOptions}
                          locale={locale}
                          onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                          onClear={() => setTypeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Globe2}
                          label={locale === 'zh-CN' ? '发布状态' : 'Publish state'}
                          value={statusFilter}
                          options={statusFilterOptions}
                          locale={locale}
                          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                          onClear={() => setStatusFilter('all')}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载课程题库...' : 'Loading course problem bank...'}
                </div>
              ) : filteredProblems.length === 0 ? (
                <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {locale === 'zh-CN' ? '当前筛选下没有题目。' : 'No problems match this filter.'}
                </div>
              ) : (
                <div className="min-w-[820px]">
                  <div
                    className={cn(
                      PROBLEM_BANK_LIST_GRID_CLASS,
                      'border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
                    )}
                  >
                    <span>{locale === 'zh-CN' ? '题号' : 'No.'}</span>
                    <span>{locale === 'zh-CN' ? '状态' : 'State'}</span>
                    <span>{locale === 'zh-CN' ? '题目' : 'Problem'}</span>
                    <span>{locale === 'zh-CN' ? '来源' : 'Source'}</span>
                    <span>{locale === 'zh-CN' ? '题型' : 'Type'}</span>
                    <span>{locale === 'zh-CN' ? '难度' : 'Level'}</span>
                    <span>{locale === 'zh-CN' ? '最近得分' : 'Score'}</span>
                    <span>{locale === 'zh-CN' ? '操作' : 'Action'}</span>
                  </div>
                  {paginatedProblems.map((problem) => {
                    const selected = selectedProblemId === problem.id;
                    const typeVisual = problemTypeVisual(problem.type);
                    const ProblemTypeIcon = typeVisual.Icon;
                    const localizedContent = getLocalizedProblemContent(
                      problem.publicContent,
                      problemLanguage,
                    );
                    const localizedTitle = getLocalizedProblemTitle(problem, problemLanguage);
                    return (
                      <div
                        key={problem.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          router.push(
                            `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(
                              `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                            );
                          }
                        }}
                        className={cn(
                          PROBLEM_BANK_LIST_GRID_CLASS,
                          'items-center border-b border-slate-100 px-4 py-3 text-sm transition dark:border-slate-800/80',
                          selected
                            ? 'bg-sky-50/80 dark:bg-sky-500/10'
                            : 'bg-white hover:bg-slate-50/80 dark:bg-slate-950/25 dark:hover:bg-slate-900/50',
                        )}
                      >
                        <div>
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {formatProblemNumber(problem)}
                          </span>
                        </div>
                        <div>
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                              practiceStateClassName(problem),
                            )}
                          >
                            {practiceStateLabel(problem, locale)}
                          </span>
                        </div>
                        <div className="min-w-0 pr-4">
                          <ProblemTitleText
                            content={localizedTitle}
                            className="line-clamp-1 font-semibold text-slate-950 dark:text-white"
                          />
                          <p className="mt-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                            <ProblemTitleText
                              content={renderProblemContentStem(localizedContent)}
                              className="font-normal"
                              forceInlineMath
                            />
                          </p>
                        </div>
                        <div className="min-w-0 pr-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="line-clamp-2">
                            {problem.notebookName || (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                          </span>
                        </div>
                        <div className="min-w-0 pr-2">
                          <span
                            className={cn(
                              'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                              typeVisual.className,
                            )}
                          >
                            <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{typeLabel(problem.type, locale)}</span>
                          </span>
                        </div>
                        <div title={difficultyLabel(problem.difficulty, locale)}>
                          <div className="flex items-center gap-1">
                            {difficultyDots(problem).map((active, index) => (
                              <span
                                key={index}
                                className={cn(
                                  'size-1.5 rounded-full',
                                  difficultyDotClassName(problem.difficulty, active),
                                )}
                              />
                            ))}
                          </div>
                          <div
                            className={cn(
                              'mt-0.5 text-[10px] font-semibold',
                              difficultyTextClassName(problem.difficulty),
                            )}
                          >
                            {difficultyLabel(problem.difficulty, locale)}
                          </div>
                        </div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {latestScoreLabel(problem, locale)}
                        </div>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            className={cn('h-8 px-2.5 text-xs', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(
                                `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                              );
                            }}
                          >
                            {locale === 'zh-CN' ? '练习' : 'Practice'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
                    <span>
                      {locale === 'zh-CN'
                        ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${filteredProblems.length} 道`
                        : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredProblems.length}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={currentProblemPage <= 1}
                        onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {locale === 'zh-CN' ? '上一页' : 'Prev'}
                      </Button>
                      <span className="min-w-[5rem] text-center font-medium text-slate-600 dark:text-slate-300">
                        {locale === 'zh-CN'
                          ? `${currentProblemPage} / ${problemPageCount} 页`
                          : `Page ${currentProblemPage} / ${problemPageCount}`}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={currentProblemPage >= problemPageCount}
                        onClick={() =>
                          setProblemPage((current) => Math.min(problemPageCount, current + 1))
                        }
                      >
                        {locale === 'zh-CN' ? '下一页' : 'Next'}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="order-2 hidden h-full w-[270px] shrink-0 flex-col gap-3 overflow-hidden lg:flex">
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {locale === 'zh-CN' ? '掌握概览' : 'Mastery overview'}
                </p>
                <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="grid size-[88px] shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#22c55e 0deg ${
                      (bankStats.mastered / Math.max(1, bankStats.total)) * 360
                    }deg, #f59e0b ${(bankStats.mastered / Math.max(1, bankStats.total)) * 360}deg ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg, #ef4444 ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg, #e2e8f0 ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg 360deg)`,
                  }}
                >
                  <div className="grid size-[62px] place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                    <span className="text-xl font-bold leading-none text-slate-950 dark:text-white">
                      {bankStats.masteryPercent}%
                    </span>
                    <span className="-mt-2 text-[10px] font-medium text-slate-400">
                      {locale === 'zh-CN' ? '总体掌握' : 'mastered'}
                    </span>
                  </div>
                </div>
                <dl className="min-w-0 flex-1 space-y-2 text-xs">
                  {[
                    {
                      label: locale === 'zh-CN' ? '掌握良好' : 'Mastered',
                      count: bankStats.mastered,
                      className: 'bg-emerald-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '待复习' : 'To review',
                      count: bankStats.review,
                      className: 'bg-amber-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '错题' : 'Wrong',
                      count: bankStats.wrong,
                      className: 'bg-rose-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '未练习' : 'Untried',
                      count: bankStats.unattempted,
                      className: 'bg-slate-300',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <dt className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                        <span className={cn('size-2 rounded-full', item.className)} />
                        <span className="truncate">{item.label}</span>
                      </dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800">
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.attempted}/{bankStats.total || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '已练习' : 'Practiced'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.coveredNotebookCount}/{Math.max(1, bankStats.notebookCount)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '题库覆盖' : 'Coverage'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.masteredTopicCount}/{bankStats.topicCount || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '知识点' : 'Concepts'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {locale === 'zh-CN' ? '做题最少章节 TOP5' : 'Least practiced chapters TOP5'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {locale === 'zh-CN'
                  ? '按已做题目数量升序统计'
                  : 'Sorted by attempted problem count'}
              </p>
              <div className="mt-4 space-y-3">
                {bankStats.weakTopics.length > 0 ? (
                  bankStats.weakTopics.map((item, index) => (
                    <div key={item.topic} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                          {item.topic}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                          {locale === 'zh-CN' ? `已做 ${item.count} 题` : `${item.count} done`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn('h-full rounded-full', weakTopicBarClass(index))}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                    {locale === 'zh-CN' ? '暂无章节刷题数据。' : 'No chapter practice data yet.'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setImportMode('pdf');
                  setImportOpen(true);
                }}
                className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
              >
                <FileUp className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                <span>{locale === 'zh-CN' ? '导入题目' : 'Import'}</span>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {locale === 'zh-CN' ? 'PDF / LaTeX / 文本' : 'PDF / LaTeX / text'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('web');
                  setImportOpen(true);
                }}
                className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
              >
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                <span>{locale === 'zh-CN' ? '智能生成' : 'Generate'}</span>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {locale === 'zh-CN' ? '按知识点出题' : 'By concepts'}
                </span>
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {isPracticeMode ? (
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedProblem ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载题目...' : 'Loading problem...'}
                </>
              ) : (
                <>{locale === 'zh-CN' ? '没有找到这道题。' : 'Problem not found.'}</>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex h-11 shrink-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 shadow-sm shadow-slate-950/[0.03] dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    onClick={() => router.push(`/course/${encodeURIComponent(courseId)}`)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {locale === 'zh-CN' ? '课程空间' : 'Course'}
                  </Button>
                  <span className="hidden rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex dark:bg-slate-900 dark:text-slate-400">
                    {currentNotebookProblemPosition > 0
                      ? `${currentNotebookProblemPosition}/${sameNotebookProblems.length}`
                      : locale === 'zh-CN'
                        ? '未归类'
                        : 'Unassigned'}
                  </span>
                  <h1
                    className="min-w-0 flex-1 truncate text-base font-semibold leading-none text-slate-950 dark:text-white"
                    title={selectedProblemTitle}
                  >
                    <ProblemTitleText content={selectedProblemTitle} className="truncate" />
                  </h1>
                  <span
                    className={cn(
                      'hidden shrink-0 rounded px-2 py-1 text-[11px] font-semibold md:inline-flex',
                      difficultyTextClassName(selectedProblem.difficulty),
                    )}
                  >
                    {difficultyLabel(selectedProblem.difficulty, locale)}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    disabled={!previousNotebookProblem}
                    onClick={() => {
                      if (!previousNotebookProblem) return;
                      navigateToPracticeProblem(previousNotebookProblem);
                    }}
                    title={
                      previousNotebookProblem
                        ? previousNotebookProblem.title
                        : locale === 'zh-CN'
                          ? '当前笔记本没有上一题'
                          : 'No previous problem in this notebook'
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {locale === 'zh-CN' ? '上一题' : 'Prev'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    disabled={!nextNotebookProblem}
                    onClick={() => {
                      if (!nextNotebookProblem) return;
                      navigateToPracticeProblem(nextNotebookProblem);
                    }}
                    title={
                      nextNotebookProblem
                        ? nextNotebookProblem.title
                        : locale === 'zh-CN'
                          ? '当前笔记本没有下一题'
                          : 'No next problem in this notebook'
                    }
                  >
                    {locale === 'zh-CN' ? '下一题' : 'Next'}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
                        aria-label={locale === 'zh-CN' ? '更多操作' : 'More actions'}
                      >
                        <Ellipsis className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setMoveDialogOpen(true)}>
                        <ArrowRightLeft className="h-4 w-4" />
                        {locale === 'zh-CN' ? '移动到其他笔记本' : 'Move to notebook'}
                      </DropdownMenuItem>
                      {selectedProblem.notebookId ? (
                        <DropdownMenuItem
                          onClick={() => router.push(`/classroom/${selectedProblem.notebookId}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {locale === 'zh-CN' ? '打开对应笔记本' : 'Open notebook'}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={handleDeleteProblem}
                        disabled={deletingProblem}
                      >
                        {deletingProblem ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '删除题目' : 'Delete'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex h-11 shrink-0 items-center gap-4 border-b border-slate-200 px-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('description')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'description'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '题目描述' : 'Description'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('formula')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'formula'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '公式表' : 'Formula'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('edit')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'edit'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '编辑题目' : 'Edit'}
                    </button>
                    {selectedProblemHasTranslation ? (
                      <div className="ml-auto">
                        <ProblemLanguageToggle
                          value={problemLanguage}
                          locale={locale}
                          onChange={setProblemLanguage}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-[15px] leading-8 text-slate-800 dark:text-slate-200">
                    {problemInfoTab === 'description' ? (
                      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                        <div>
                          {selectedProblemContent &&
                          renderProblemContentStem(selectedProblemContent) ? (
                            <ProblemRichText
                              content={renderProblemContentStem(selectedProblemContent)}
                            />
                          ) : (
                            <p>{locale === 'zh-CN' ? '暂无题面。' : 'No stem available.'}</p>
                          )}
                          <ProblemImageAssets
                            content={selectedProblemContent}
                            className="mt-6 sm:grid-cols-1 [&_figure]:rounded-lg [&_figure]:bg-white [&_img]:max-h-[360px]"
                          />
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                          {problemMetaChips(selectedProblem, locale).map((chip) => (
                            <ProblemMetaChip
                              key={chip.key}
                              label={chip.label}
                              Icon={chip.Icon}
                              className={chip.className}
                            />
                          ))}
                        </div>
                      </div>
                    ) : problemInfoTab === 'formula' ? (
                      <FormulaReferencePanel locale={locale} onInsert={insertFormulaIntoAnswer} />
                    ) : selectedProblemEditDraft ? (
                      <ProblemDraftForm
                        key={`${selectedProblemEditDraft.draftId}-${selectedProblem.updatedAt}`}
                        draft={selectedProblemEditDraft}
                        locale={locale}
                        saveLabel={locale === 'zh-CN' ? '保存题目' : 'Save problem'}
                        onDraftChange={handleEditingDraftChange}
                        onSave={async (nextDraft) => {
                          await handleUpdateProblem(problemDraftToPatch(nextDraft));
                          toast.success(locale === 'zh-CN' ? '题目已更新' : 'Problem updated');
                        }}
                      />
                    ) : null}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex h-11 shrink-0 items-center gap-4 border-b border-slate-200 px-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('answer')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'answer'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '作答' : 'Answer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('preview')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'preview'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {problemInfoTab === 'edit'
                        ? locale === 'zh-CN'
                          ? '预览题目'
                          : 'Problem preview'
                        : locale === 'zh-CN'
                          ? '预览'
                          : 'Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('solution')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'solution'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '题解' : 'Solution'}
                    </button>
                    {answerPanelTab === 'answer' ? (
                      <Button
                        onClick={handleSubmitInlineAnswer}
                        disabled={submittingAnswer}
                        className={cn(
                          'ml-auto h-8 rounded-md px-3 text-xs font-semibold',
                          PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
                        )}
                      >
                        {submittingAnswer ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {locale === 'zh-CN' ? '提交答案' : 'Submit'}
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                    {answerPanelTab === 'answer' ? (
                      <div className="flex min-h-full flex-col">
                        {selectedProblem.type === 'choice' &&
                        selectedProblemContent?.type === 'choice' ? (
                          <div className="space-y-2">
                            {selectedProblemContent.options.map((option) => {
                              const selected = choiceAnswers[selectedProblem.id] ?? [];
                              const multi = selectedProblemContent.selectionMode === 'multiple';
                              const correctOptionIds =
                                selectedAnswerFeedback?.correctOptionIds ?? [];
                              const hasAnswerFeedback = Boolean(selectedAnswerFeedback);
                              const isCorrectOption = correctOptionIds.includes(option.id);
                              const isWrongSelected =
                                hasAnswerFeedback &&
                                selected.includes(option.id) &&
                                !isCorrectOption;
                              return (
                                <label
                                  key={option.id}
                                  className={cn(
                                    'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-[15px] transition dark:border-slate-700',
                                    hasAnswerFeedback && isCorrectOption
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-50'
                                      : isWrongSelected
                                        ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-50'
                                        : selected.includes(option.id)
                                          ? 'border-sky-300 bg-sky-50 text-slate-950 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-white'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/70',
                                  )}
                                >
                                  <input
                                    className="mt-1 size-4 accent-sky-600"
                                    type={multi ? 'checkbox' : 'radio'}
                                    checked={selected.includes(option.id)}
                                    onChange={(event) => {
                                      setChoiceAnswers((prev) => {
                                        const current = prev[selectedProblem.id] ?? [];
                                        const next = multi
                                          ? event.target.checked
                                            ? [...current, option.id]
                                            : current.filter((item) => item !== option.id)
                                          : [option.id];
                                        return {
                                          ...prev,
                                          [selectedProblem.id]: Array.from(new Set(next)),
                                        };
                                      });
                                      setAnswerFeedbackByProblemId((prev) => {
                                        if (!prev[selectedProblem.id]) return prev;
                                        const next = { ...prev };
                                        delete next[selectedProblem.id];
                                        return next;
                                      });
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <span className="font-medium">{option.id}.</span>
                                    <ProblemRichText
                                      content={option.label}
                                      className="inline-block align-middle [&_p]:inline [&_.katex-display]:inline-block"
                                    />
                                  </div>
                                  {hasAnswerFeedback && isCorrectOption ? (
                                    <CheckCircle2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                                  ) : isWrongSelected ? (
                                    <X className="ml-auto mt-1 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                        ) : selectedProblem.type === 'fill_blank' &&
                          selectedProblemContent?.type === 'fill_blank' ? (
                          <div className="space-y-2">
                            {selectedProblemContent.blanks.map((blank) => (
                              <div key={blank.id}>
                                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {blank.id}
                                </label>
                                <Input
                                  value={blankAnswers[selectedProblem.id]?.[blank.id] ?? ''}
                                  placeholder={
                                    blank.placeholder ||
                                    (locale === 'zh-CN' ? '请输入答案' : 'Type your answer')
                                  }
                                  onChange={(event) =>
                                    setBlankAnswers((prev) => ({
                                      ...prev,
                                      [selectedProblem.id]: {
                                        ...(prev[selectedProblem.id] ?? {}),
                                        [blank.id]: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        ) : selectedProblem.type === 'code' &&
                          selectedProblemContent?.type === 'code' ? (
                          <Textarea
                            className="min-h-[220px] font-mono text-xs"
                            value={
                              codeAnswers[selectedProblem.id] ??
                              selectedProblemContent.starterCode ??
                              ''
                            }
                            onChange={(event) =>
                              setCodeAnswers((prev) => ({
                                ...prev,
                                [selectedProblem.id]: event.target.value,
                              }))
                            }
                            placeholder={
                              locale === 'zh-CN'
                                ? '在这里编写代码并提交。'
                                : 'Write code here and submit.'
                            }
                          />
                        ) : supportsPhotoAnswer(selectedProblem) &&
                          selectedAnswerMode === 'photo' ? (
                          <PhotoAnswerUploader
                            inputId={`photo-answer-${selectedProblem.id}`}
                            photos={photoAnswers[selectedProblem.id] ?? []}
                            disabled={submittingAnswer}
                            locale={locale}
                            onAddFiles={handleAddPhotoAnswerFiles}
                            onRemovePhoto={handleRemovePhotoAnswer}
                          />
                        ) : (
                          <AnswerComposer
                            value={textAnswers[selectedProblem.id] ?? ''}
                            onChange={setSelectedTextAnswer}
                            controller={selectedAnswerController}
                            showToolbar={false}
                            showToolbarPanels={!showSidebarAnswerTools}
                            locale={locale}
                            className="flex min-h-[360px] flex-1 flex-col"
                            textareaClassName="flex-1"
                            placeholder={answerComposerPlaceholder(locale)}
                          />
                        )}
                        {supportsPhotoAnswer(selectedProblem) ? (
                          <div className="mt-3 flex w-fit gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={cn(
                                'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                                selectedAnswerMode === 'text'
                                  ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                                  : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                              )}
                              onClick={() =>
                                setAnswerModes((prev) => ({
                                  ...prev,
                                  [selectedProblem.id]: 'text',
                                }))
                              }
                            >
                              <Type className="h-4 w-4" />
                              {locale === 'zh-CN' ? '文字输入' : 'Text'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={cn(
                                'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                                selectedAnswerMode === 'photo'
                                  ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                                  : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                              )}
                              onClick={() =>
                                setAnswerModes((prev) => ({
                                  ...prev,
                                  [selectedProblem.id]: 'photo',
                                }))
                              }
                            >
                              <ImagePlus className="h-4 w-4" />
                              {locale === 'zh-CN' ? '照片上传' : 'Photos'}
                            </Button>
                          </div>
                        ) : null}
                        {selectedAnswerFeedback ? (
                          <div
                            className={cn(
                              'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm leading-6',
                              answerFeedbackTone(selectedAnswerFeedback.status),
                            )}
                          >
                            {selectedAnswerFeedback.status === 'passed' ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            ) : (
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium">{selectedAnswerFeedback.feedback}</p>
                              {selectedAnswerFeedback.saving ? (
                                <p className="text-xs opacity-80">
                                  {locale === 'zh-CN' ? '正在保存作答记录…' : 'Saving attempt…'}
                                </p>
                              ) : typeof selectedAnswerFeedback.score === 'number' ? (
                                <p className="text-xs opacity-80">
                                  {locale === 'zh-CN'
                                    ? `本次得分 ${selectedAnswerFeedback.score}/${selectedProblem.points}`
                                    : `Score ${selectedAnswerFeedback.score}/${selectedProblem.points}`}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : answerPanelTab === 'preview' && problemInfoTab === 'edit' ? (
                      visibleProblemPreviewDraft ? (
                        <ProblemDraftPreviewPanel
                          draft={visibleProblemPreviewDraft}
                          locale={locale}
                        />
                      ) : (
                        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                          {locale === 'zh-CN'
                            ? '暂无可预览的题目。'
                            : 'No problem preview available.'}
                        </div>
                      )
                    ) : answerPanelTab === 'preview' ? (
                      <div className="flex min-h-full flex-col">
                        {selectedProblem.type === 'choice' &&
                        selectedProblem.publicContent.type === 'choice' ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {locale === 'zh-CN' ? '已选答案' : 'Selected answer'}
                            </p>
                            {(choiceAnswers[selectedProblem.id] ?? []).length > 0 ? (
                              <p className="text-base font-semibold text-slate-950 dark:text-white">
                                {(choiceAnswers[selectedProblem.id] ?? []).join(', ')}
                              </p>
                            ) : (
                              <p className="text-slate-500 dark:text-slate-400">
                                {locale === 'zh-CN'
                                  ? '还没有选择答案。'
                                  : 'No option selected yet.'}
                              </p>
                            )}
                          </div>
                        ) : selectedProblem.type === 'fill_blank' &&
                          selectedProblem.publicContent.type === 'fill_blank' ? (
                          <div className="space-y-2">
                            {selectedProblem.publicContent.blanks.map((blank) => (
                              <div
                                key={blank.id}
                                className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
                              >
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {blank.id}
                                </p>
                                <p className="mt-1 text-slate-800 dark:text-slate-100">
                                  {blankAnswers[selectedProblem.id]?.[blank.id]?.trim() ||
                                    (locale === 'zh-CN' ? '未填写' : 'Empty')}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : selectedProblem.type === 'code' &&
                          selectedProblem.publicContent.type === 'code' ? (
                          <pre className="min-h-[180px] overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-50 dark:border-slate-700">
                            {codeAnswers[selectedProblem.id] ??
                              selectedProblem.publicContent.starterCode ??
                              (locale === 'zh-CN' ? '还没有代码。' : 'No code yet.')}
                          </pre>
                        ) : supportsPhotoAnswer(selectedProblem) &&
                          selectedAnswerMode === 'photo' ? (
                          (photoAnswers[selectedProblem.id] ?? []).length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {(photoAnswers[selectedProblem.id] ?? []).map((photo) => (
                                <figure
                                  key={photo.id}
                                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
                                >
                                  <img
                                    src={photo.dataUrl}
                                    alt={photo.name}
                                    className="max-h-72 w-full object-contain"
                                  />
                                  <figcaption className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                    {photo.name}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          ) : (
                            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                              {locale === 'zh-CN' ? '还没有上传照片。' : 'No photos uploaded yet.'}
                            </div>
                          )
                        ) : (
                          <AnswerPreviewPanel
                            value={selectedTextAnswerValue}
                            placeholder={answerComposerPlaceholder(locale)}
                          />
                        )}
                      </div>
                    ) : selectedProblemSolutionSections.length > 0 ? (
                      <div className="space-y-4">
                        {selectedProblemSolutionSections.map((section) => (
                          <section key={section.title}>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {section.title}
                            </p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                              <ProblemRichText content={section.content} />
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                        {locale === 'zh-CN'
                          ? '这道题还没有题解。'
                          : 'No solution has been added yet.'}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {locale === 'zh-CN' ? '移动题目归属' : 'Move problem'}
                    </DialogTitle>
                    <DialogDescription>
                      {locale === 'zh-CN'
                        ? '选择要将当前题目归属到的笔记本。'
                        : 'Choose the notebook to reassign this problem.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <select
                      value={moveNotebookId}
                      onChange={(event) => setMoveNotebookId(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="__unassigned__">
                        {locale === 'zh-CN' ? '未归类题目' : 'Unassigned'}
                      </option>
                      {notebooks.map((notebook) => (
                        <option key={notebook.id} value={notebook.id}>
                          {notebook.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveAssignment}
                        disabled={savingAssignment}
                        className={PROBLEM_BANK_PRIMARY_BUTTON_CLASS}
                      >
                        {savingAssignment ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '确认移动' : 'Move'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      ) : null}

      {showSidebarAnswerTools ? (
        <div className="order-3 flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 2xl:w-[300px] dark:border-slate-800 dark:bg-slate-950/50">
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <AnswerComposerToolbar
              controller={selectedAnswerController}
              locale={locale}
              fillPanels
              showControls={false}
              className="bg-white dark:bg-slate-950/40"
            />
          </div>
        </div>
      ) : null}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === 'zh-CN' ? '导入题目到课程题库' : 'Import into course problem bank'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'zh-CN'
                ? '系统会先生成预览，再为每道题标记对应笔记本；找不到时会保留为未归类。'
                : 'We preview first, then assign each problem to a notebook when possible.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={importMode === 'text' ? 'default' : 'outline'}
              className={
                importMode === 'text'
                  ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                  : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS
              }
              onClick={() => setImportMode('text')}
            >
              {locale === 'zh-CN' ? '文本' : 'Text'}
            </Button>
            <Button
              type="button"
              variant={importMode === 'pdf' ? 'default' : 'outline'}
              className={
                importMode === 'pdf'
                  ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                  : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS
              }
              onClick={() => setImportMode('pdf')}
            >
              PDF
            </Button>
            <Button
              type="button"
              variant={importMode === 'web' ? 'default' : 'outline'}
              className={
                importMode === 'web'
                  ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                  : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS
              }
              onClick={() => setImportMode('web')}
            >
              <Globe2 className="mr-2 h-4 w-4" />
              {locale === 'zh-CN' ? '联网搜索' : 'Web search'}
            </Button>
            <Button
              type="button"
              variant={importMode === 'manual' ? 'default' : 'outline'}
              className={
                importMode === 'manual'
                  ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                  : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS
              }
              onClick={() => setImportMode('manual')}
            >
              {locale === 'zh-CN' ? '手动添加题目' : 'Manual draft'}
            </Button>
          </div>

          {importMode === 'text' ? (
            <Textarea
              className="min-h-[220px]"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={
                locale === 'zh-CN'
                  ? '粘贴混合题库内容；系统会尝试按课程内笔记本自动分配。'
                  : 'Paste a mixed problem sheet. We will try to assign each problem to a notebook.'
              }
            />
          ) : importMode === 'pdf' ? (
            <div className="space-y-3">
              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              />
              {importFile ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{importFile.name}</p>
              ) : null}
            </div>
          ) : importMode === 'web' ? (
            <div className="space-y-3">
              <Input
                value={importWebQuery}
                onChange={(event) => setImportWebQuery(event.target.value)}
                placeholder={
                  locale === 'zh-CN'
                    ? '例如：UTSC CSCC69 past exam algorithm final'
                    : 'Example: university + course code + past exam + topic keywords'
                }
              />
              {!(
                webSearchProvidersConfig[webSearchProviderId]?.apiKey ||
                webSearchProvidersConfig[webSearchProviderId]?.isServerConfigured
              ) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                  {locale === 'zh-CN'
                    ? '当前未检测到联网搜索配置。请先在设置中启用 Tavily。'
                    : 'Web search is not configured yet. Please enable Tavily first.'}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              {locale === 'zh-CN'
                ? '会先创建 1 道可编辑草稿，并打开表单编辑器。你可以直接指定所属笔记本，或者暂时留空，之后再归类到课程里的某一章节。'
                : 'We will create one editable draft and open the form editor. You can assign it to a notebook now or leave it unassigned and organize it later.'}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handlePreviewImport}
              disabled={previewLoading || commitLoading}
              className={PROBLEM_BANK_PRIMARY_BUTTON_CLASS}
            >
              {previewLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {importMode === 'manual'
                ? locale === 'zh-CN'
                  ? '创建草稿'
                  : 'Create draft'
                : locale === 'zh-CN'
                  ? '生成预览'
                  : 'Preview import'}
            </Button>
          </div>

          {importProcessingStage !== 'idle' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-start gap-3">
                {(previewLoading || commitLoading) && importProcessingStage !== 'completed' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-sky-600" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {locale === 'zh-CN' ? '导题处理中' : 'Import in progress'}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    {importProcessingDetail}
                  </p>
                  {(importEstimatedProblemCount > 0 || importProcessedProblemCount > 0) && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {locale === 'zh-CN' ? '题目进度' : 'Problem progress'}:{' '}
                      {importProcessedProblemCount} /{' '}
                      {Math.max(importProcessedProblemCount, importEstimatedProblemCount, 1)}
                    </p>
                  )}
                  {importUsage ? (
                    <p className="mt-2 text-xs text-sky-700 dark:text-sky-200">
                      {locale === 'zh-CN'
                        ? `本次导题扣费 ${importUsage.estimatedCostCredits ?? 0} 算力积分`
                        : `Import charged ${importUsage.estimatedCostCredits ?? 0} compute credits`}
                    </p>
                  ) : null}
                  {importWebSearchSummary ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {locale === 'zh-CN'
                        ? `联网搜索命中 ${importWebSearchSummary.sourceCount} 个来源，额外扣费 ${importWebSearchSummary.estimatedCostCredits} 算力积分`
                        : `Web search found ${importWebSearchSummary.sourceCount} sources and charged ${importWebSearchSummary.estimatedCostCredits} compute credits`}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {importSummaryNote ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100">
              {importSummaryNote}
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.draftId}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={includedDraftIds[draft.draftId] ?? false}
                            onChange={(event) =>
                              setIncludedDraftIds((prev) => ({
                                ...prev,
                                [draft.draftId]: event.target.checked,
                              }))
                            }
                          />
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {draft.title}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {typeLabel(draft.type, locale)} ·{' '}
                          {difficultyLabel(draft.difficulty, locale)} ·{' '}
                          {statusLabel(draft.status, locale)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS}
                        onClick={() => {
                          setEditingDraftId(draft.draftId);
                          setDraftEditorText(JSON.stringify(draft, null, 2));
                        }}
                      >
                        {draft.sourceMeta &&
                        typeof draft.sourceMeta === 'object' &&
                        (draft.sourceMeta as Record<string, unknown>).importMode === 'manual_create'
                          ? locale === 'zh-CN'
                            ? '编辑表单'
                            : 'Edit form'
                          : locale === 'zh-CN'
                            ? '编辑 JSON'
                            : 'Edit JSON'}
                      </Button>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                        {locale === 'zh-CN' ? '归属笔记本' : 'Assigned notebook'}
                      </label>
                      <select
                        value={draft.notebookId || '__unassigned__'}
                        onChange={(event) =>
                          setDrafts((prev) =>
                            prev.map((item) =>
                              item.draftId === draft.draftId
                                ? {
                                    ...item,
                                    notebookId:
                                      event.target.value === '__unassigned__'
                                        ? null
                                        : event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="__unassigned__">
                          {locale === 'zh-CN' ? '未归类题目' : 'Unassigned'}
                        </option>
                        {notebookOptions.map((notebook) => (
                          <option key={notebook.id} value={notebook.id}>
                            {notebook.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {draft.validationErrors.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <AlertCircle className="h-4 w-4" />
                          {locale === 'zh-CN' ? '待修正' : 'Needs attention'}
                        </div>
                        <div className="space-y-1 text-sm">
                          {draft.validationErrors.map((error, index) => (
                            <p key={`${draft.draftId}-error-${index}`}>{error}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {editingDraft && editingDraftIsManual ? (
                  <ProblemDraftForm
                    key={editingDraft.draftId}
                    draft={editingDraft}
                    locale={locale}
                    onSave={handleSaveManualDraft}
                  />
                ) : (
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {locale === 'zh-CN' ? '草稿 JSON 编辑器' : 'Draft JSON editor'}
                    </p>
                    <Textarea
                      className="mt-3 min-h-[520px] font-mono text-xs"
                      value={draftEditorText}
                      onChange={(event) => setDraftEditorText(event.target.value)}
                    />
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleSaveDraftEditor}
                        className={PROBLEM_BANK_PRIMARY_BUTTON_CLASS}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {locale === 'zh-CN' ? '保存草稿' : 'Save draft'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="flex justify-end">
              <Button
                onClick={handleCommitImport}
                disabled={commitLoading}
                className={PROBLEM_BANK_PRIMARY_BUTTON_CLASS}
              >
                {commitLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {locale === 'zh-CN' ? '写入课程题库' : 'Commit import'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
