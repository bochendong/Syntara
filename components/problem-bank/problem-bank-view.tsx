'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileUp,
  Filter,
  Globe2,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { AppNotification } from '@/lib/notifications/types';
import { useSettingsStore } from '@/lib/store/settings';
import { useNotificationStore } from '@/lib/store/notifications';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemAttemptRecord,
  type NotebookProblemImportDraft,
} from '@/lib/problem-bank';
import {
  commitNotebookProblemImport,
  deleteNotebookProblem,
  listNotebookProblemAttempts,
  listNotebookProblems,
  previewNotebookProblemImport,
  runNotebookCodeProblem,
  submitNotebookProblem,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CommonMathSymbols } from '@/components/problem-bank/common-math-symbols';

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

function sourceLabel(source: NotebookProblemClientRecord['source'], locale: 'zh-CN' | 'en-US') {
  const zh = {
    chat: '聊天导入',
    pdf: 'PDF 导入',
    manual: '手动录入',
    web: '联网导入',
    legacy_quiz_scene: '历史测验页',
  } as const;
  const en = {
    chat: 'Chat',
    pdf: 'PDF',
    manual: 'Manual',
    web: 'Web',
    legacy_quiz_scene: 'Legacy quiz',
  } as const;
  return locale === 'zh-CN' ? zh[source] : en[source];
}

function statusLabel(
  status: NotebookProblemClientRecord['status'] | NotebookProblemAttemptRecord['status'],
  locale: 'zh-CN' | 'en-US',
) {
  const zh: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
    archived: '已归档',
    pending: '进行中',
    passed: '通过',
    failed: '失败',
    partial: '部分通过',
    error: '错误',
  };
  const en: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    archived: 'Archived',
    pending: 'Pending',
    passed: 'Passed',
    failed: 'Failed',
    partial: 'Partial',
    error: 'Error',
  };
  return locale === 'zh-CN' ? zh[status] || status : en[status] || status;
}

function difficultyLabel(
  difficulty: NotebookProblemClientRecord['difficulty'],
  locale: 'zh-CN' | 'en-US',
) {
  const zh = { easy: '简单', medium: '中等', hard: '困难' } as const;
  const en = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
  return locale === 'zh-CN' ? zh[difficulty] : en[difficulty];
}

function latestAttemptTone(status?: string | null) {
  if (status === 'passed')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (status === 'partial')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  if (status === 'failed' || status === 'error')
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function AttemptSummary({
  attempt,
  locale,
}: {
  attempt: NotebookProblemAttemptRecord;
  locale: 'zh-CN' | 'en-US';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {attempt.kind === 'run'
            ? locale === 'zh-CN'
              ? 'Public Run'
              : 'Public run'
            : locale === 'zh-CN'
              ? '提交'
              : 'Submit'}
        </span>
        <Badge className={cn('border-0', latestAttemptTone(attempt.status))}>
          {statusLabel(attempt.status, locale)}
        </Badge>
      </div>
      {typeof attempt.score === 'number' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            {locale === 'zh-CN' ? `得分 ${attempt.score}` : `Score ${attempt.score}`}
          </span>
          {attempt.kind === 'answer' ? (
            <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
              {locale === 'zh-CN' ? 'AI / 自动评分已完成' : 'AI / auto grading completed'}
            </span>
          ) : null}
        </div>
      ) : null}
      {attempt.result?.feedback ? (
        <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
          {attempt.result.feedback}
        </p>
      ) : null}
      {typeof attempt.result?.earnedPoints === 'number' ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {locale === 'zh-CN'
            ? `本次作答得分：${attempt.result.earnedPoints}`
            : `Earned points: ${attempt.result.earnedPoints}`}
        </p>
      ) : null}
      {attempt.result?.publicCases?.length ? (
        <div className="mt-3 space-y-2">
          {attempt.result.publicCases.map((testCase) => (
            <div
              key={testCase.id}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{testCase.description || testCase.id}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-medium',
                    testCase.passed
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
                  )}
                >
                  {testCase.passed
                    ? locale === 'zh-CN'
                      ? '通过'
                      : 'Passed'
                    : locale === 'zh-CN'
                      ? '失败'
                      : 'Failed'}
                </span>
              </div>
              {testCase.error ? (
                <p className="mt-1 text-rose-600 dark:text-rose-300">{testCase.error}</p>
              ) : null}
              {testCase.actual ? (
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {locale === 'zh-CN' ? '实际输出' : 'Actual'}: {testCase.actual}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {attempt.result?.secretSummary ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/40">
          <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            {locale === 'zh-CN' ? 'Secret tests' : 'Secret tests'}
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {attempt.result.secretSummary.passed}/{attempt.result.secretSummary.total}{' '}
            {locale === 'zh-CN' ? '通过' : 'passed'}
          </p>
          {attempt.result.secretSummary.failureSummary ? (
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {attempt.result.secretSummary.failureSummary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ImportProcessingStage =
  | 'idle'
  | 'parsing'
  | 'searching'
  | 'extracting'
  | 'validating'
  | 'preview-ready'
  | 'committing'
  | 'completed';

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

function buildPracticeNotification(args: {
  locale: 'zh-CN' | 'en-US';
  problem: NotebookProblemClientRecord;
  attempt: NotebookProblemAttemptRecord;
}): AppNotification {
  const earnedPoints = args.attempt.result?.earnedPoints ?? args.attempt.score ?? 0;
  const totalPoints = Math.max(1, args.problem.points);
  const ratio = earnedPoints / totalPoints;
  const tier = ratio >= 0.999 ? 'perfect' : ratio >= 0.6 ? 'good' : 'retry';
  const bodyOptionsZh =
    tier === 'perfect'
      ? [
          `这道题你拿到了 ${earnedPoints}/${totalPoints} 分，AI 也很认可你的答案表达。`,
          `这题已经做得很完整了，当前得分 ${earnedPoints}/${totalPoints}。`,
          `漂亮，这道题几乎没有短板，当前得分 ${earnedPoints}/${totalPoints}。`,
        ]
      : tier === 'good'
        ? [
            `这道题当前得分 ${earnedPoints}/${totalPoints}，已经抓到主要思路了。`,
            `AI 评分显示你已经答到关键点，当前得分 ${earnedPoints}/${totalPoints}。`,
            `这题推进得不错，当前得分 ${earnedPoints}/${totalPoints}，再补一补会更稳。`,
          ]
        : [
            `这道题当前得分 ${earnedPoints}/${totalPoints}，先收下反馈，我们下一轮继续。`,
            `AI 已经给出评分和建议了，这题先记作 ${earnedPoints}/${totalPoints} 分。`,
            `这题还有提升空间，当前得分 ${earnedPoints}/${totalPoints}，继续做就会更顺。`,
          ];
  const bodyOptionsEn =
    tier === 'perfect'
      ? [
          `You earned ${earnedPoints}/${totalPoints} on this problem. The AI grader liked your response.`,
          `That answer was strong. Current score: ${earnedPoints}/${totalPoints}.`,
          `Nicely done. This one came in at ${earnedPoints}/${totalPoints}.`,
        ]
      : tier === 'good'
        ? [
            `You earned ${earnedPoints}/${totalPoints} here. The main idea is already in place.`,
            `AI grading says you're on the right track. Current score: ${earnedPoints}/${totalPoints}.`,
            `Solid progress on this one. Current score: ${earnedPoints}/${totalPoints}.`,
          ]
        : [
            `You got ${earnedPoints}/${totalPoints} here. Keep the feedback and try the next one.`,
            `AI grading is back. Current score: ${earnedPoints}/${totalPoints}.`,
            `There is room to improve, and that's okay. Current score: ${earnedPoints}/${totalPoints}.`,
          ];
  const options = args.locale === 'zh-CN' ? bodyOptionsZh : bodyOptionsEn;
  const body = options[Math.floor(Math.random() * options.length)] ?? options[0] ?? '';

  return {
    id: `practice-${args.problem.id}-${args.attempt.id}`,
    kind: 'credit_gain',
    title: args.locale === 'zh-CN' ? '已收到本题反馈' : 'Practice feedback is ready',
    body,
    tone: 'positive',
    presentation: 'banner',
    amountLabel:
      args.locale === 'zh-CN'
        ? `${earnedPoints}/${totalPoints} 分`
        : `${earnedPoints}/${totalPoints} pts`,
    delta: 0,
    balanceAfter: 0,
    accountType: 'PURCHASE',
    sourceKind: 'PRACTICE_SUBMISSION',
    sourceLabel: args.locale === 'zh-CN' ? '做题鼓励' : 'Practice encouragement',
    createdAt: new Date().toISOString(),
    showBalance: false,
    details: [
      {
        key: 'problem',
        label: args.locale === 'zh-CN' ? '题目' : 'Problem',
        value: args.problem.title,
      },
      {
        key: 'resultTier',
        label: args.locale === 'zh-CN' ? '反馈层级' : 'Tier',
        value: tier,
      },
      {
        key: 'grading',
        label: args.locale === 'zh-CN' ? '评分方式' : 'Grading',
        value:
          args.problem.type === 'short_answer' || args.problem.type === 'proof'
            ? args.locale === 'zh-CN'
              ? 'AI 评分'
              : 'AI graded'
            : args.locale === 'zh-CN'
              ? '自动评分'
              : 'Auto graded',
      },
    ],
  };
}

export function ProblemBankView({ notebookId }: { notebookId: string }) {
  const { locale } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);
  const enqueueBanner = useNotificationStore((state) => state.enqueueBanner);
  const textAnswerInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const [problems, setProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<NotebookProblemAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | NotebookProblemClientRecord['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | NotebookProblemClientRecord['status']>(
    'all',
  );
  const [textAnswer, setTextAnswer] = useState<Record<string, string>>({});
  const [choiceAnswer, setChoiceAnswer] = useState<Record<string, string[]>>({});
  const [blankAnswer, setBlankAnswer] = useState<Record<string, Record<string, string>>>({});
  const [codeAnswer, setCodeAnswer] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [runningCode, setRunningCode] = useState(false);
  const [deletingProblem, setDeletingProblem] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'pdf' | 'web'>('text');
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

  const loadProblems = useCallback(async () => {
    if (!notebookId) {
      setProblems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextProblems = await listNotebookProblems(notebookId);
      setProblems(nextProblems);
      setSelectedProblemId((current) => current ?? nextProblems[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    void loadProblems();
  }, [loadProblems]);

  const filteredProblems = useMemo(
    () =>
      problems.filter((problem) => {
        if (typeFilter !== 'all' && problem.type !== typeFilter) return false;
        if (statusFilter !== 'all' && problem.status !== statusFilter) return false;
        return true;
      }),
    [problems, statusFilter, typeFilter],
  );

  const selectedProblem = useMemo(
    () =>
      filteredProblems.find((problem) => problem.id === selectedProblemId) ||
      problems.find((problem) => problem.id === selectedProblemId) ||
      null,
    [filteredProblems, problems, selectedProblemId],
  );
  const choiceContent =
    selectedProblem?.publicContent.type === 'choice' ? selectedProblem.publicContent : null;
  const fillBlankContent =
    selectedProblem?.publicContent.type === 'fill_blank' ? selectedProblem.publicContent : null;
  const codeContent =
    selectedProblem?.publicContent.type === 'code' ? selectedProblem.publicContent : null;
  const textLikeContent =
    selectedProblem && !choiceContent && !fillBlankContent && !codeContent
      ? selectedProblem.publicContent
      : null;
  const latestDetailedAttempt = attempts[0] ?? null;
  const latestAttempt = latestDetailedAttempt ?? selectedProblem?.latestAttempt ?? null;

  useEffect(() => {
    if (!selectedProblem?.id) {
      setAttempts([]);
      return;
    }
    setDetailLoading(true);
    void listNotebookProblemAttempts(notebookId, selectedProblem.id)
      .then((rows) => setAttempts(rows))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load attempts');
      })
      .finally(() => setDetailLoading(false));
  }, [notebookId, selectedProblem?.id]);

  useEffect(() => {
    if (selectedProblem?.type === 'code' && !codeAnswer[selectedProblem.id]) {
      setCodeAnswer((prev) => ({
        ...prev,
        [selectedProblem.id]:
          selectedProblem.publicContent.type === 'code'
            ? selectedProblem.publicContent.starterCode || ''
            : '',
      }));
    }
  }, [codeAnswer, selectedProblem]);

  const refreshAfterAttempt = useCallback(
    async (newAttempt?: NotebookProblemAttemptRecord) => {
      if (newAttempt) {
        setAttempts((prev) => [newAttempt, ...prev]);
      }
      const refreshed = await listNotebookProblems(notebookId);
      setProblems(refreshed);
    },
    [notebookId],
  );

  const insertSymbolIntoTextAnswer = useCallback(
    (problemId: string, symbol: string) => {
      const textarea = textAnswerInputRefs.current[problemId];
      if (!textarea) {
        setTextAnswer((prev) => ({
          ...prev,
          [problemId]: `${prev[problemId] || ''}${symbol}`,
        }));
        return;
      }

      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const currentValue = textAnswer[problemId] || '';
      const nextValue = `${currentValue.slice(0, start)}${symbol}${currentValue.slice(end)}`;
      setTextAnswer((prev) => ({
        ...prev,
        [problemId]: nextValue,
      }));
      requestAnimationFrame(() => {
        textarea.focus();
        const nextCursor = start + symbol.length;
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [textAnswer],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedProblem || submitting) return;
    setSubmitting(true);
    try {
      const payload =
        selectedProblem.type === 'choice'
          ? {
              selectedOptionIds: choiceAnswer[selectedProblem.id] ?? [],
            }
          : selectedProblem.type === 'fill_blank'
            ? {
                blanks: blankAnswer[selectedProblem.id] ?? {},
              }
            : selectedProblem.type === 'code'
              ? {
                  code: codeAnswer[selectedProblem.id] || '',
                }
              : {
                  text: textAnswer[selectedProblem.id] || '',
                };
      const { attempt } = await submitNotebookProblem({
        notebookId,
        problemId: selectedProblem.id,
        language: locale,
        ...payload,
      });
      await refreshAfterAttempt(attempt);
      enqueueBanner(
        buildPracticeNotification({
          locale,
          problem: selectedProblem,
          attempt,
        }),
      );
      toast.success(locale === 'zh-CN' ? '已提交答案' : 'Answer submitted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [
    blankAnswer,
    choiceAnswer,
    codeAnswer,
    enqueueBanner,
    locale,
    notebookId,
    refreshAfterAttempt,
    selectedProblem,
    submitting,
    textAnswer,
  ]);

  const handleRunCode = useCallback(async () => {
    if (!selectedProblem || selectedProblem.type !== 'code' || runningCode) return;
    setRunningCode(true);
    try {
      const { attempt } = await runNotebookCodeProblem({
        notebookId,
        problemId: selectedProblem.id,
        code: codeAnswer[selectedProblem.id] || '',
      });
      await refreshAfterAttempt(attempt);
      toast.success(locale === 'zh-CN' ? 'Public tests 已运行' : 'Public tests finished');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Run failed');
    } finally {
      setRunningCode(false);
    }
  }, [codeAnswer, locale, notebookId, refreshAfterAttempt, runningCode, selectedProblem]);

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
      await deleteNotebookProblem({
        notebookId,
        problemId: selectedProblem.id,
      });
      const nextProblems = problems.filter((problem) => problem.id !== selectedProblem.id);
      setProblems(nextProblems);
      setSelectedProblemId((current) => {
        if (current !== selectedProblem.id) return current;
        return nextProblems[0]?.id ?? null;
      });
      setAttempts((prev) => prev.filter((attempt) => attempt.problemId !== selectedProblem.id));
      toast.success(locale === 'zh-CN' ? '题目已删除' : 'Problem deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeletingProblem(false);
    }
  }, [deletingProblem, locale, notebookId, problems, selectedProblem]);

  const handlePreviewImport = useCallback(async () => {
    setPreviewLoading(true);
    setImportSummaryNote(null);
    setImportUsage(null);
    setImportWebSearchSummary(null);
    try {
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
        if (parsed.truncationWarnings.length > 0) {
          setImportSummaryNote(
            `${locale === 'zh-CN' ? '解析提示' : 'Parse notes'}：${parsed.truncationWarnings.join('；')}`,
          );
        }
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
        setImportEstimatedProblemCount(0);
        setImportProcessedProblemCount(0);
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
      } else {
        setImportProcessingDetail(
          locale === 'zh-CN'
            ? '正在联网搜索课程题目，并整理成可导入的题目草稿…'
            : 'Searching the web and turning results into importable problem drafts…',
        );
      }
      const previewResult = await previewNotebookProblemImport({
        notebookId,
        source,
        text,
        searchQuery,
        webSearchApiKey: webSearchProvidersConfig[webSearchProviderId]?.apiKey || undefined,
        language: locale,
      });
      const nextDrafts = previewResult.drafts;
      setImportUsage(previewResult.usage);
      setImportWebSearchSummary(previewResult.webSearch);
      setImportProcessingStage('validating');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '正在校验题目 schema，并整理待修正项…' : 'Validating drafts…',
      );
      setImportProcessedProblemCount(nextDrafts.length);
      setDrafts(nextDrafts);
      setIncludedDraftIds(Object.fromEntries(nextDrafts.map((draft) => [draft.draftId, true])));
      if (nextDrafts[0]) {
        setEditingDraftId(nextDrafts[0].draftId);
        setDraftEditorText(JSON.stringify(nextDrafts[0], null, 2));
      }
      const needsFixCount = nextDrafts.filter((draft) => draft.validationErrors.length > 0).length;
      setImportProcessingStage('preview-ready');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '草稿预览已生成，可以继续修正后写入题库。' : 'Preview ready.',
      );
      setImportSummaryNote(
        locale === 'zh-CN'
          ? `已生成 ${nextDrafts.length} 道题草稿，其中 ${needsFixCount} 道需要修正。${
              previewResult.webSearch
                ? ` 本次联网检索命中 ${previewResult.webSearch.sourceCount} 个网页来源，并额外扣费 ${previewResult.webSearch.estimatedCostCredits} 算力积分。`
                : ''
            }${
              previewResult.usage?.estimatedCostCredits != null
                ? `本次导题精确扣费 ${previewResult.usage.estimatedCostCredits} 算力积分。`
                : '本次导题扣费会稍后汇总到通知中心。'
            }`
          : `${nextDrafts.length} drafts generated, ${needsFixCount} need fixes.${
              previewResult.webSearch
                ? ` Web search found ${previewResult.webSearch.sourceCount} sources and charged ${previewResult.webSearch.estimatedCostCredits} compute credits.`
                : ''
            }${
              previewResult.usage?.estimatedCostCredits != null
                ? ` Charged ${previewResult.usage.estimatedCostCredits} compute credits.`
                : ' Compute credits will sync to notifications shortly.'
            }`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import preview failed');
      setImportProcessingStage('idle');
      setImportProcessingDetail('');
      setImportEstimatedProblemCount(0);
      setImportProcessedProblemCount(0);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    importFile,
    importMode,
    importText,
    importWebQuery,
    locale,
    notebookId,
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

  const handleCommitImport = useCallback(async () => {
    const selectedDrafts = drafts.filter((draft) => includedDraftIds[draft.draftId]);
    if (selectedDrafts.length === 0) {
      toast.error(locale === 'zh-CN' ? '请至少选择一条草稿' : 'Select at least one draft');
      return;
    }
    setCommitLoading(true);
    setImportProcessingStage('committing');
    setImportProcessingDetail(
      locale === 'zh-CN' ? '正在写入题库，并刷新题目列表…' : 'Committing to problem bank…',
    );
    try {
      const nextProblems = await commitNotebookProblemImport({
        notebookId,
        drafts: selectedDrafts,
      });
      setProblems(nextProblems);
      setSelectedProblemId(nextProblems[0]?.id ?? null);
      setImportOpen(false);
      setDrafts([]);
      setImportText('');
      setImportFile(null);
      setImportWebQuery('');
      setImportProcessedProblemCount(selectedDrafts.length);
      setImportProcessingStage('completed');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '题目已经写入题库，可以开始练习。' : 'Problems imported.',
      );
      setImportSummaryNote(
        locale === 'zh-CN'
          ? `已写入 ${selectedDrafts.length} 道题。${
              importUsage?.estimatedCostCredits != null
                ? `本次 preview 导题共扣费 ${importUsage.estimatedCostCredits} 算力积分。`
                : '若本次导题触发了模型或 PDF 解析扣费，通知中心会稍后汇总显示。'
            }`
          : `${selectedDrafts.length} problems imported.${
              importUsage?.estimatedCostCredits != null
                ? ` Preview import charged ${importUsage.estimatedCostCredits} compute credits.`
                : ' Any compute charges will appear in notifications shortly.'
            }`,
      );
      toast.success(locale === 'zh-CN' ? '题目已写入题库' : 'Problems imported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import commit failed');
      setImportProcessingStage('preview-ready');
    } finally {
      setCommitLoading(false);
    }
  }, [drafts, importUsage, includedDraftIds, locale, notebookId]);

  return (
    <div className="flex h-full min-h-0 bg-gray-50 dark:bg-gray-900">
      <div className="flex w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {locale === 'zh-CN' ? '题库' : 'Problem bank'}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {locale === 'zh-CN'
                  ? '独立于课堂页的练习题入口。'
                  : 'A notebook-level practice problem collection.'}
              </p>
            </div>
            <Button size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
              {locale === 'zh-CN' ? '导入题目' : 'Import'}
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Filter className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">{locale === 'zh-CN' ? '全部题型' : 'All types'}</option>
                <option value="short_answer">{typeLabel('short_answer', locale)}</option>
                <option value="choice">{typeLabel('choice', locale)}</option>
                <option value="proof">{typeLabel('proof', locale)}</option>
                <option value="calculation">{typeLabel('calculation', locale)}</option>
                <option value="fill_blank">{typeLabel('fill_blank', locale)}</option>
                <option value="code">{typeLabel('code', locale)}</option>
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">{locale === 'zh-CN' ? '全部状态' : 'All status'}</option>
              <option value="draft">{statusLabel('draft', locale)}</option>
              <option value="published">{statusLabel('published', locale)}</option>
              <option value="archived">{statusLabel('archived', locale)}</option>
            </select>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {locale === 'zh-CN' ? '正在加载题库...' : 'Loading problems...'}
            </div>
          ) : filteredProblems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              {locale === 'zh-CN'
                ? '当前没有符合筛选条件的题目。'
                : 'No problems match the current filters.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProblems.map((problem) => (
                <button
                  key={problem.id}
                  type="button"
                  onClick={() => setSelectedProblemId(problem.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-colors',
                    selectedProblemId === problem.id
                      ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {problem.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {typeLabel(problem.type, locale)} ·{' '}
                        {difficultyLabel(problem.difficulty, locale)} ·{' '}
                        {sourceLabel(problem.source, locale)}
                      </p>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="border-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {statusLabel(problem.status, locale)}
                    </Badge>
                    <Badge className="border-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {problem.points} {locale === 'zh-CN' ? '分' : 'pts'}
                    </Badge>
                    {problem.latestAttempt ? (
                      <Badge
                        className={cn('border-0', latestAttemptTone(problem.latestAttempt.status))}
                      >
                        {statusLabel(problem.latestAttempt.status, locale)}
                      </Badge>
                    ) : null}
                    {typeof problem.latestAttempt?.score === 'number' ? (
                      <Badge className="border-0 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                        {locale === 'zh-CN'
                          ? `最近 ${problem.latestAttempt.score}/${problem.points} 分`
                          : `Latest ${problem.latestAttempt.score}/${problem.points}`}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {!selectedProblem ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN' ? '请选择一道题开始作答。' : 'Select a problem to begin.'}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{selectedProblem.title}</CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">{typeLabel(selectedProblem.type, locale)}</Badge>
                      <Badge variant="secondary">
                        {difficultyLabel(selectedProblem.difficulty, locale)}
                      </Badge>
                      <Badge variant="secondary">
                        {selectedProblem.points} {locale === 'zh-CN' ? '分' : 'pts'}
                      </Badge>
                      <Badge variant="secondary">
                        {statusLabel(selectedProblem.status, locale)}
                      </Badge>
                      {selectedProblem.latestAttempt?.status ? (
                        <Badge
                          className={cn(
                            'border-0',
                            latestAttemptTone(selectedProblem.latestAttempt.status),
                          )}
                        >
                          {locale === 'zh-CN' ? '最近结果' : 'Latest'} ·{' '}
                          {statusLabel(selectedProblem.latestAttempt.status, locale)}
                        </Badge>
                      ) : null}
                      {typeof selectedProblem.latestAttempt?.score === 'number' ? (
                        <Badge className="border-0 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                          {locale === 'zh-CN'
                            ? `最近得分 ${selectedProblem.latestAttempt.score}/${selectedProblem.points}`
                            : `Latest score ${selectedProblem.latestAttempt.score}/${selectedProblem.points}`}
                        </Badge>
                      ) : null}
                      {selectedProblem.type === 'short_answer' ||
                      selectedProblem.type === 'proof' ? (
                        <Badge className="border-0 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                          {locale === 'zh-CN' ? '提交后 AI 评分' : 'AI graded on submit'}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {selectedProblem.type === 'code' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleRunCode} disabled={runningCode}>
                        {runningCode ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '运行 Public Tests' : 'Run public tests'}
                      </Button>
                      <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '提交' : 'Submit'}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteProblem}
                        disabled={deletingProblem}
                      >
                        {deletingProblem ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '删除题目' : 'Delete'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '提交答案' : 'Submit answer'}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteProblem}
                        disabled={deletingProblem}
                      >
                        {deletingProblem ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '删除题目' : 'Delete'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {choiceContent ? (
                  <div className="space-y-3">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
                      {choiceContent.stem}
                    </p>
                    {choiceContent.options.map((option) => {
                      const selected = choiceAnswer[selectedProblem.id] ?? [];
                      const multi = choiceContent.selectionMode === 'multiple';
                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-slate-700"
                        >
                          <input
                            type={multi ? 'checkbox' : 'radio'}
                            checked={selected.includes(option.id)}
                            onChange={(event) => {
                              setChoiceAnswer((prev) => {
                                const current = prev[selectedProblem.id] ?? [];
                                const next = multi
                                  ? event.target.checked
                                    ? [...current, option.id]
                                    : current.filter((item) => item !== option.id)
                                  : [option.id];
                                return { ...prev, [selectedProblem.id]: Array.from(new Set(next)) };
                              });
                            }}
                          />
                          <span>
                            <span className="font-medium">{option.id}.</span> {option.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : fillBlankContent ? (
                  <div className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
                      {fillBlankContent.stemTemplate}
                    </p>
                    {fillBlankContent.blanks.map((blank) => (
                      <div key={blank.id} className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {blank.placeholder || blank.id}
                        </label>
                        <Input
                          value={blankAnswer[selectedProblem.id]?.[blank.id] || ''}
                          onChange={(event) =>
                            setBlankAnswer((prev) => ({
                              ...prev,
                              [selectedProblem.id]: {
                                ...(prev[selectedProblem.id] || {}),
                                [blank.id]: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : codeContent ? (
                  <div className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
                      {codeContent.stem}
                    </p>
                    {codeContent.functionSignature ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40">
                        <div className="mb-2 flex items-center gap-2 font-medium">
                          <Code2 className="h-4 w-4" />
                          {locale === 'zh-CN' ? '函数签名' : 'Function signature'}
                        </div>
                        <code>{codeContent.functionSignature}</code>
                      </div>
                    ) : null}
                    {codeContent.publicTests.length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40">
                        <div className="mb-2 font-medium">
                          {locale === 'zh-CN' ? 'Public tests' : 'Public tests'}
                        </div>
                        <div className="space-y-2">
                          {codeContent.publicTests.map((testCase) => (
                            <div
                              key={testCase.id}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                            >
                              <p className="font-medium">{testCase.description || testCase.id}</p>
                              <p className="mt-1 text-slate-500 dark:text-slate-400">
                                {testCase.expression} =&gt; {testCase.expected}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Textarea
                      value={codeAnswer[selectedProblem.id] || ''}
                      onChange={(event) =>
                        setCodeAnswer((prev) => ({
                          ...prev,
                          [selectedProblem.id]: event.target.value,
                        }))
                      }
                      className="min-h-[320px] font-mono text-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
                      {textLikeContent && 'stem' in textLikeContent ? textLikeContent.stem : ''}
                    </p>
                    {latestAttempt && typeof latestAttempt.score === 'number' ? (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm dark:border-sky-900/40 dark:bg-sky-950/20">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                            {locale === 'zh-CN'
                              ? `当前显示最近一次得分：${latestAttempt.score}/${selectedProblem.points}`
                              : `Latest score shown: ${latestAttempt.score}/${selectedProblem.points}`}
                          </span>
                          {(selectedProblem.type === 'short_answer' ||
                            selectedProblem.type === 'proof') && (
                            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                              {locale === 'zh-CN' ? '由 AI 评分' : 'AI graded'}
                            </span>
                          )}
                        </div>
                        {latestDetailedAttempt?.result?.feedback ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">
                            {latestDetailedAttempt.result.feedback}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedProblem.type === 'short_answer' ||
                    selectedProblem.type === 'proof' ||
                    selectedProblem.type === 'calculation' ? (
                      <CommonMathSymbols
                        locale={locale}
                        onInsert={(symbol) => insertSymbolIntoTextAnswer(selectedProblem.id, symbol)}
                      />
                    ) : null}
                    <Textarea
                      value={textAnswer[selectedProblem.id] || ''}
                      onChange={(event) =>
                        setTextAnswer((prev) => ({
                          ...prev,
                          [selectedProblem.id]: event.target.value,
                        }))
                      }
                      ref={(node) => {
                        textAnswerInputRefs.current[selectedProblem.id] = node;
                      }}
                      className="min-h-[220px]"
                      placeholder={
                        locale === 'zh-CN' ? '在这里输入你的答案…' : 'Write your answer here...'
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {locale === 'zh-CN' ? '作答记录' : 'Attempts'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detailLoading ? (
                  <div className="flex items-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {locale === 'zh-CN' ? '正在加载记录...' : 'Loading attempts...'}
                  </div>
                ) : attempts.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {locale === 'zh-CN' ? '还没有作答记录。' : 'No attempts yet.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attempts.map((attempt) => (
                      <AttemptSummary key={attempt.id} attempt={attempt} locale={locale} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{locale === 'zh-CN' ? '导入题目到题库' : 'Import problems'}</DialogTitle>
            <DialogDescription>
              {locale === 'zh-CN'
                ? '支持粘贴文本或上传 PDF；系统会先生成 preview，再写入题库。'
                : 'Paste text or upload a PDF. We will preview drafts before committing them.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={importMode === 'text' ? 'default' : 'outline'}
              onClick={() => setImportMode('text')}
            >
              {locale === 'zh-CN' ? '文本' : 'Text'}
            </Button>
            <Button
              type="button"
              variant={importMode === 'pdf' ? 'default' : 'outline'}
              onClick={() => setImportMode('pdf')}
            >
              PDF
            </Button>
            <Button
              type="button"
              variant={importMode === 'web' ? 'default' : 'outline'}
              onClick={() => setImportMode('web')}
            >
              <Globe2 className="mr-2 h-4 w-4" />
              {locale === 'zh-CN' ? '联网搜索' : 'Web search'}
            </Button>
          </div>

          {importMode === 'text' ? (
            <Textarea
              className="min-h-[220px]"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={
                locale === 'zh-CN'
                  ? '粘贴题目文本，例如选择题、证明题、代码题等。'
                  : 'Paste problem text here.'
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
          ) : (
            <div className="space-y-3">
              <Input
                value={importWebQuery}
                onChange={(event) => setImportWebQuery(event.target.value)}
                placeholder={
                  locale === 'zh-CN'
                    ? '例如：多伦多大学 CSC148 past exam recursion linked list'
                    : 'Example: university + course code + past exam + topic keywords'
                }
              />
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                {locale === 'zh-CN'
                  ? '可以什么都不上传，直接搜索课程名、课程代码、学校名，再加 past exam、midterm、final、homework、往届题等关键词。系统会先联网搜题，再生成导入预览。'
                  : 'You can skip uploads and search by university, course name, course code, plus keywords like past exam, midterm, final, or homework. We will search first, then build the import preview.'}
              </div>
              {!(
                webSearchProvidersConfig[webSearchProviderId]?.apiKey ||
                webSearchProvidersConfig[webSearchProviderId]?.isServerConfigured
              ) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                  {locale === 'zh-CN'
                    ? '当前未检测到联网搜索配置。请先在设置中启用 Tavily，才能使用联网搜题导入。'
                    : 'Web search is not configured yet. Please enable Tavily in settings before using web import.'}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handlePreviewImport} disabled={previewLoading || commitLoading}>
              {previewLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {locale === 'zh-CN' ? '生成预览' : 'Preview import'}
            </Button>
          </div>

          {importProcessingStage !== 'idle' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-start gap-3">
                {(previewLoading || commitLoading) && importProcessingStage !== 'completed' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-violet-600" />
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
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{locale === 'zh-CN' ? '题目进度' : 'Problem progress'}</span>
                        <span>
                          {Math.max(importProcessedProblemCount, 0)} /{' '}
                          {Math.max(importProcessedProblemCount, importEstimatedProblemCount, 1)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{
                            width: `${Math.max(
                              8,
                              Math.min(
                                100,
                                (Math.max(importProcessedProblemCount, 0) /
                                  Math.max(
                                    importProcessedProblemCount,
                                    importEstimatedProblemCount,
                                    1,
                                  )) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {importUsage ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {locale === 'zh-CN' ? '本次导题精确计费' : 'Precise import charge'}
                      </div>
                      <div className="mt-1">
                        {locale === 'zh-CN' ? '输入' : 'Input'} {importUsage.inputTokens} tokens ·{' '}
                        {locale === 'zh-CN' ? '输出' : 'Output'} {importUsage.outputTokens} tokens
                        {importUsage.cachedInputTokens > 0
                          ? ` · ${locale === 'zh-CN' ? '缓存输入' : 'Cached'} ${importUsage.cachedInputTokens}`
                          : ''}
                      </div>
                      <div className="mt-1 font-medium text-violet-700 dark:text-violet-200">
                        {importUsage.estimatedCostCredits != null
                          ? locale === 'zh-CN'
                            ? `${importUsage.estimatedCostCredits} 算力积分`
                            : `${importUsage.estimatedCostCredits} compute credits`
                          : locale === 'zh-CN'
                            ? '当前模型未返回可估算价格'
                            : 'Pricing unavailable for current model'}
                      </div>
                    </div>
                  ) : null}
                  {importWebSearchSummary ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {locale === 'zh-CN' ? '联网搜题结果' : 'Web search results'}
                      </div>
                      <div className="mt-1">
                        {locale === 'zh-CN' ? '检索词' : 'Query'}: {importWebSearchSummary.query}
                      </div>
                      <div className="mt-1">
                        {locale === 'zh-CN' ? '命中来源' : 'Sources'}:{' '}
                        {importWebSearchSummary.sourceCount}
                        {' · '}
                        {locale === 'zh-CN'
                          ? `扣费 ${importWebSearchSummary.estimatedCostCredits} 算力积分`
                          : `Charge ${importWebSearchSummary.estimatedCostCredits} compute credits`}
                      </div>
                      {importWebSearchSummary.sources.slice(0, 3).map((source) => (
                        <div key={source.url} className="mt-1 truncate">
                          {source.title}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {[
                      ['parsing', locale === 'zh-CN' ? '解析材料' : 'Parse'],
                      ['searching', locale === 'zh-CN' ? '联网搜题' : 'Search'],
                      ['extracting', locale === 'zh-CN' ? '拆分题目' : 'Extract'],
                      ['validating', locale === 'zh-CN' ? '校验 schema' : 'Validate'],
                      ['committing', locale === 'zh-CN' ? '写入题库' : 'Commit'],
                    ].map(([stage, label]) => {
                      const isActive = importProcessingStage === stage;
                      const isDone =
                        ['preview-ready', 'completed'].includes(importProcessingStage) ||
                        (importProcessingStage === 'committing' && stage !== 'committing') ||
                        (importProcessingStage === 'validating' &&
                          ['parsing', 'searching', 'extracting'].includes(stage)) ||
                        (importProcessingStage === 'extracting' &&
                          ['parsing', 'searching'].includes(stage)) ||
                        (importProcessingStage === 'searching' && stage === 'parsing');
                      return (
                        <span
                          key={stage}
                          className={cn(
                            'rounded-full px-2.5 py-1',
                            isActive
                              ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                              : isDone
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {importSummaryNote ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-100">
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
                      <div>
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
                          <p className="font-medium text-slate-900 dark:text-slate-100">
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
                        onClick={() => {
                          setEditingDraftId(draft.draftId);
                          setDraftEditorText(JSON.stringify(draft, null, 2));
                        }}
                      >
                        {locale === 'zh-CN' ? '编辑 JSON' : 'Edit JSON'}
                      </Button>
                    </div>
                    {draft.validationErrors.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                        <div className="mb-1 flex items-center gap-1 font-medium">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? '待修正' : 'Needs attention'}
                        </div>
                        <ul className="space-y-1">
                          {draft.validationErrors.map((error, index) => (
                            <li key={`${draft.draftId}-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                        <div className="flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? 'Schema 校验通过' : 'Schema validated'}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {locale === 'zh-CN' ? '草稿 JSON 编辑器' : 'Draft JSON editor'}
                </p>
                <Textarea
                  className="min-h-[420px] font-mono text-xs"
                  value={draftEditorText}
                  onChange={(event) => setDraftEditorText(event.target.value)}
                />
                <div className="flex justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {locale === 'zh-CN'
                      ? '可以直接修正类型、标题、publicContent、grading、secretJudge。'
                      : 'You can directly edit title, publicContent, grading, and secretJudge.'}
                  </p>
                  <Button type="button" variant="outline" onClick={handleSaveDraftEditor}>
                    {locale === 'zh-CN' ? '保存草稿修改' : 'Save draft changes'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="flex justify-end">
              <Button onClick={handleCommitImport} disabled={commitLoading}>
                {commitLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {locale === 'zh-CN' ? '写入题库' : 'Commit import'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
