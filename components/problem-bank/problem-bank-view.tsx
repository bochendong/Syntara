'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileUp,
  Filter,
  Loader2,
  Play,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import type { NotebookProblemAttemptRecord, NotebookProblemImportDraft } from '@/lib/problem-bank';
import {
  commitNotebookProblemImport,
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
    legacy_quiz_scene: '历史测验页',
  } as const;
  const en = {
    chat: 'Chat',
    pdf: 'PDF',
    manual: 'Manual',
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
      {attempt.result?.feedback ? (
        <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
          {attempt.result.feedback}
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

export function ProblemBankView({ notebookId }: { notebookId: string }) {
  const { locale } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);

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

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'pdf'>('text');
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<NotebookProblemImportDraft[]>([]);
  const [includedDraftIds, setIncludedDraftIds] = useState<Record<string, boolean>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditorText, setDraftEditorText] = useState('');

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

  const handlePreviewImport = useCallback(async () => {
    setPreviewLoading(true);
    try {
      let text = importText.trim();
      let source: 'manual' | 'pdf' = 'manual';
      if (importMode === 'pdf') {
        if (!importFile) {
          throw new Error(locale === 'zh-CN' ? '请先选择 PDF 文件' : 'Select a PDF first');
        }
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
      }
      if (!text) {
        throw new Error(locale === 'zh-CN' ? '请先输入题目内容' : 'Enter problem text first');
      }
      const nextDrafts = await previewNotebookProblemImport({
        notebookId,
        source,
        text,
        language: locale,
      });
      setDrafts(nextDrafts);
      setIncludedDraftIds(Object.fromEntries(nextDrafts.map((draft) => [draft.draftId, true])));
      if (nextDrafts[0]) {
        setEditingDraftId(nextDrafts[0].draftId);
        setDraftEditorText(JSON.stringify(nextDrafts[0], null, 2));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [importFile, importMode, importText, locale, notebookId, pdfProviderId, pdfProvidersConfig]);

  const handleSaveDraftEditor = useCallback(() => {
    if (!editingDraftId) return;
    try {
      const parsed = JSON.parse(draftEditorText) as NotebookProblemImportDraft;
      setDrafts((prev) => prev.map((draft) => (draft.draftId === editingDraftId ? parsed : draft)));
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
      toast.success(locale === 'zh-CN' ? '题目已写入题库' : 'Problems imported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import commit failed');
    } finally {
      setCommitLoading(false);
    }
  }, [drafts, includedDraftIds, locale, notebookId]);

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
                    </div>
                  </div>
                  {selectedProblem.type === 'code' ? (
                    <div className="flex gap-2">
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
                    </div>
                  ) : (
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {locale === 'zh-CN' ? '提交答案' : 'Submit answer'}
                    </Button>
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
                    <Textarea
                      value={textAnswer[selectedProblem.id] || ''}
                      onChange={(event) =>
                        setTextAnswer((prev) => ({
                          ...prev,
                          [selectedProblem.id]: event.target.value,
                        }))
                      }
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
          ) : (
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
          )}

          <div className="flex justify-end">
            <Button onClick={handlePreviewImport} disabled={previewLoading}>
              {previewLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {locale === 'zh-CN' ? '生成预览' : 'Preview import'}
            </Button>
          </div>

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
