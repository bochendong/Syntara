'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileQuestion,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import { getApiHeaders } from '@/lib/create/generation-headers';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:problem-import-test:v1';
const MAX_STORED_RUNS = 12;
const PDF_LLM_TEST_MODEL = 'gpt-5.2';

type ImportStage = 'idle' | 'parsing' | 'extracting' | 'saving' | 'completed';
type ExtractionMode = 'llm' | 'heuristic' | 'llm-file';

type ImportUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostCredits: number | null;
};

type StoredImportRun = {
  id: string;
  fixtureId?: string;
  fixtureTitle?: string;
  fixtureKind?: 'choice' | 'long-form';
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  sourceTextLength: number;
  createdAt: number;
  parseWarnings: string[];
  extractionMode: ExtractionMode;
  modelWarning: string | null;
  usage: ImportUsage | null;
  drafts: NotebookProblemImportDraft[];
};

type SavedState = {
  runs: StoredImportRun[];
  selectedFixtureId: string | null;
  selectedRunId: string | null;
  selectedDraftId: string | null;
};

type TestFixture = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  kind: 'choice' | 'long-form';
  fileSize: number;
  exists: boolean;
  updatedAt: number | null;
};

type FixturesResponse = {
  fixtures?: TestFixture[];
  error?: string;
};

type PreviewResponse = {
  drafts?: NotebookProblemImportDraft[];
  usage?: ImportUsage | null;
  extractionMode?: ExtractionMode;
  modelWarning?: string | null;
  warnings?: string[];
  fixture?: {
    id: string;
    fileName: string;
    title: string;
    kind: 'choice' | 'long-form';
  };
  source?: {
    fileName?: string | null;
    fileSize?: number | null;
    textLength?: number | null;
    pageCount?: number | null;
  };
  error?: string;
};

function getProblemImportTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: PDF_LLM_TEST_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readSavedState(): SavedState {
  if (typeof window === 'undefined') {
    return { runs: [], selectedFixtureId: null, selectedRunId: null, selectedDraftId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return { runs: [], selectedFixtureId: null, selectedRunId: null, selectedDraftId: null };
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { runs: [], selectedFixtureId: null, selectedRunId: null, selectedDraftId: null };
    }
    const runs = Array.isArray(parsed.runs) ? (parsed.runs as StoredImportRun[]) : [];
    const pdfRuns = runs.filter((run) => run.extractionMode === 'llm-file');
    return {
      runs: pdfRuns.slice(0, MAX_STORED_RUNS),
      selectedFixtureId:
        typeof parsed.selectedFixtureId === 'string' ? parsed.selectedFixtureId : null,
      selectedRunId:
        typeof parsed.selectedRunId === 'string' &&
        pdfRuns.some((run) => run.id === parsed.selectedRunId)
          ? parsed.selectedRunId
          : null,
      selectedDraftId: typeof parsed.selectedDraftId === 'string' ? parsed.selectedDraftId : null,
    };
  } catch {
    return { runs: [], selectedFixtureId: null, selectedRunId: null, selectedDraftId: null };
  }
}

function writeSavedState(next: SavedState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      runs: next.runs.slice(0, MAX_STORED_RUNS),
      selectedFixtureId: next.selectedFixtureId,
      selectedRunId: next.selectedRunId,
      selectedDraftId: next.selectedDraftId,
    }),
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fixtureKindLabel(kind: TestFixture['kind'] | StoredImportRun['fixtureKind']): string {
  if (kind === 'choice') return '选择题';
  if (kind === 'long-form') return '大题';
  return 'PDF';
}

function extractionModeLabel(mode: ExtractionMode): string {
  if (mode === 'llm-file') return '模型读 PDF + LaTeX';
  if (mode === 'llm') return '先提取文本 + LLM';
  return '先提取文本';
}

function extractionModeInputLabel(run: StoredImportRun): string {
  if (run.extractionMode === 'llm-file') {
    return run.sourceTextLength > 0
      ? '输入：原始 PDF 文件 · 文本层仅用于漏题检查'
      : '输入：原始 PDF 文件';
  }
  return `输入：PDF 文本层 ${run.sourceTextLength} 字符`;
}

function extractionModeDescription(mode: ExtractionMode): string {
  if (mode === 'llm-file') {
    return '模型直接读取 PDF 文件，并要求题干、选项和评分信息中的数学直接输出 LaTeX；文本层只用于题号覆盖率校验，不作为题干内容来源。';
  }
  if (mode === 'llm') return '先抽取 PDF 文本层，再把文本交给模型整理题目。';
  return '先抽取 PDF 文本层，再用规则拆题。';
}

function extractionModeBadgeVariant(mode: ExtractionMode): 'default' | 'secondary' | 'outline' {
  if (mode === 'llm-file') return 'default';
  if (mode === 'llm') return 'secondary';
  return 'outline';
}

function typeLabel(type: NotebookProblemImportDraft['type']) {
  const labels = {
    short_answer: '简答题',
    choice: '选择题',
    proof: '证明题',
    calculation: '计算题',
    code: '代码题',
    fill_blank: '填空题',
  } as const;
  return labels[type];
}

function difficultyLabel(difficulty: NotebookProblemImportDraft['difficulty']) {
  const labels = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
  } as const;
  return labels[difficulty];
}

function draftStem(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function validationErrorCount(drafts: NotebookProblemImportDraft[]): number {
  return drafts.reduce((sum, draft) => sum + draft.validationErrors.length, 0);
}

function stagePercent(stage: ImportStage): number {
  if (stage === 'parsing') return 35;
  if (stage === 'extracting') return 72;
  if (stage === 'saving') return 92;
  if (stage === 'completed') return 100;
  return 0;
}

function stageLabel(stage: ImportStage): string {
  if (stage === 'parsing') return '解析 PDF';
  if (stage === 'extracting') return '抽取题目';
  if (stage === 'saving') return '保存结果';
  if (stage === 'completed') return '导入完成';
  return '待开始';
}

function GradingSummary({ draft }: { draft: NotebookProblemImportDraft }) {
  const grading = draft.grading;
  if (grading.type === 'choice') {
    const hasMissingAnswer = draft.validationErrors.some((error) =>
      error.includes('未识别到正确答案'),
    );
    const fallbackAnswer =
      grading.correctOptionIds.length > 0 ? grading.correctOptionIds.join(', ') : '无';
    return (
      <div className="space-y-1">
        <p>
          正确选项：
          {hasMissingAnswer
            ? `未识别（schema 占位：${fallbackAnswer}）`
            : grading.correctOptionIds.join(', ') || '待补充'}
        </p>
        {draft.sourceMeta.answerSource === 'llm-solved' ? (
          <p className="text-blue-700">答案来源：模型根据题干和选项推断</p>
        ) : null}
        {grading.analysis ? <ProblemRichText content={grading.analysis} /> : null}
      </div>
    );
  }
  if (grading.type === 'fill_blank') {
    return (
      <div className="space-y-1">
        {grading.blanks.map((blank) => (
          <p key={blank.id}>
            {blank.id}：{blank.acceptedAnswers.join(' / ') || '待补充'}
          </p>
        ))}
      </div>
    );
  }
  if (grading.type === 'calculation') {
    return <p>文字作答题：不生成参考答案</p>;
  }
  if (grading.type === 'proof') {
    return <p>文字作答题：不生成参考证明</p>;
  }
  if (grading.type === 'code') {
    return (
      <p>
        发布条件：
        {grading.publishRequirementsMet
          ? '已满足'
          : '需要补充函数签名、public tests 或 secret tests'}
      </p>
    );
  }
  return <p>文字作答题：不生成参考答案</p>;
}

function ProblemDraftDetail({ draft }: { draft: NotebookProblemImportDraft }) {
  const content = draft.publicContent;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{typeLabel(draft.type)}</Badge>
          <Badge variant="outline">{difficultyLabel(draft.difficulty)}</Badge>
          <Badge variant={draft.validationErrors.length > 0 ? 'destructive' : 'outline'}>
            {draft.validationErrors.length > 0 ? '待修正' : 'schema 通过'}
          </Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">
          {draft.title}
        </h2>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">题干</h3>
        <ProblemRichText content={draftStem(draft)} className="mt-3 text-slate-700" />
      </section>

      {content.type === 'choice' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">选项</h3>
          <div className="mt-3 grid gap-2">
            {content.options.map((option, index) => (
              <div
                key={`${draft.draftId}-${option.id}-${index}-${option.label}`}
                className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-950">{option.id}</span>
                <ProblemRichText
                  content={option.label}
                  className="min-w-0 flex-1 text-slate-700 [&_.katex-display]:my-0"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.type === 'code' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">代码配置</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>函数签名：{content.functionSignature || '待补充'}</p>
            <p>Public tests：{content.publicTests.length}</p>
            <p>Sample IO：{content.sampleIO.length}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">评分信息</h3>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          <GradingSummary draft={draft} />
        </div>
      </section>

      {draft.validationErrors.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h3 className="font-semibold">待修正项</h3>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {draft.validationErrors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">草稿 JSON</h3>
        <Textarea
          readOnly
          value={JSON.stringify(draft, null, 2)}
          className="mt-3 min-h-[260px] resize-y font-mono text-xs"
        />
      </section>
    </div>
  );
}

export default function ProblemImportTestPage() {
  const [hydrated, setHydrated] = useState(false);
  const [fixtures, setFixtures] = useState<TestFixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [runs, setRuns] = useState<StoredImportRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [stage, setStage] = useState<ImportStage>('idle');
  const [processingDetail, setProcessingDetail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = readSavedState();
    setRuns(saved.runs);
    setSelectedFixtureId(saved.selectedFixtureId);
    setSelectedRunId(saved.selectedRunId ?? saved.runs[0]?.id ?? null);
    setSelectedDraftId(saved.selectedDraftId ?? saved.runs[0]?.drafts[0]?.draftId ?? null);
    setHydrated(true);
  }, []);

  const loadFixtures = useCallback(async () => {
    setFixturesLoading(true);
    try {
      const response = await backendFetch('/api/problem-import-test/fixtures');
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const nextFixtures = Array.isArray(data.fixtures) ? data.fixtures : [];
      setFixtures(nextFixtures);
      setSelectedFixtureId(
        (current) =>
          current ??
          nextFixtures.find((fixture) => fixture.exists)?.id ??
          nextFixtures[0]?.id ??
          null,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '测试文件列表读取失败');
    } finally {
      setFixturesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFixtures();
  }, [loadFixtures]);

  useEffect(() => {
    if (!hydrated) return;
    writeSavedState({ runs, selectedFixtureId, selectedRunId, selectedDraftId });
  }, [hydrated, runs, selectedDraftId, selectedFixtureId, selectedRunId]);

  const activeFixture = useMemo(
    () =>
      fixtures.find((fixture) => fixture.id === selectedFixtureId) ??
      fixtures.find((fixture) => fixture.exists) ??
      fixtures[0] ??
      null,
    [fixtures, selectedFixtureId],
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );
  const activeDraft = useMemo(() => {
    if (!activeRun) return null;
    return (
      activeRun.drafts.find((draft) => draft.draftId === selectedDraftId) ??
      activeRun.drafts[0] ??
      null
    );
  }, [activeRun, selectedDraftId]);
  const totalDrafts = useMemo(() => runs.reduce((sum, run) => sum + run.drafts.length, 0), [runs]);
  const totalValidationErrors = useMemo(
    () => runs.reduce((sum, run) => sum + validationErrorCount(run.drafts), 0),
    [runs],
  );
  const isRunning = stage === 'parsing' || stage === 'extracting' || stage === 'saving';

  useEffect(() => {
    if (!activeRun) return;
    if (!activeDraft) {
      setSelectedDraftId(activeRun.drafts[0]?.draftId ?? null);
    }
  }, [activeDraft, activeRun]);

  useEffect(() => {
    if (!hydrated || isRunning || !selectedFixtureId) return;
    const selectedRun = runs.find((run) => run.id === selectedRunId);
    if (selectedRun?.fixtureId === selectedFixtureId) return;
    const nextRun = runs.find((run) => run.fixtureId === selectedFixtureId) ?? null;
    setSelectedRunId(nextRun?.id ?? null);
    setSelectedDraftId(nextRun?.drafts[0]?.draftId ?? null);
  }, [hydrated, isRunning, runs, selectedFixtureId, selectedRunId]);

  const handleSelectFixture = useCallback(
    (fixture: TestFixture) => {
      const matchingRun = runs.find((run) => run.fixtureId === fixture.id) ?? null;
      setSelectedFixtureId(fixture.id);
      setSelectedRunId(matchingRun?.id ?? null);
      setSelectedDraftId(matchingRun?.drafts[0]?.draftId ?? null);
      setStage('idle');
      setProcessingDetail('');
      setErrorMessage(null);
    },
    [runs],
  );

  const handlePreviewImport = useCallback(async () => {
    if (!activeFixture || isRunning) return;
    if (!activeFixture.exists) {
      setErrorMessage(`找不到测试文件：${activeFixture.fileName}`);
      return;
    }
    setErrorMessage(null);
    setStage('parsing');
    setProcessingDetail(`正在读取 ${activeFixture.fileName}`);
    try {
      setStage('extracting');
      setProcessingDetail('正在让模型直接读取 PDF 并输出 LaTeX');
      const response = await backendFetch(
        `/api/problem-import-test/fixtures/${encodeURIComponent(activeFixture.id)}/preview`,
        {
          method: 'POST',
          headers: getProblemImportTestHeaders(),
          body: JSON.stringify({ mode: 'pdf-llm', mathFormat: 'latex' }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as PreviewResponse;
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const nextDrafts = Array.isArray(data.drafts) ? data.drafts : [];
      if (nextDrafts.length === 0) {
        throw new Error('没有抽取到题目草稿');
      }

      setStage('saving');
      setProcessingDetail('正在保存导入结果');
      const nextRun: StoredImportRun = {
        id: crypto.randomUUID(),
        fixtureId: data.fixture?.id ?? activeFixture.id,
        fixtureTitle: data.fixture?.title ?? activeFixture.title,
        fixtureKind: data.fixture?.kind ?? activeFixture.kind,
        fileName: data.source?.fileName ?? activeFixture.fileName,
        fileSize: data.source?.fileSize ?? activeFixture.fileSize,
        pageCount: data.source?.pageCount ?? null,
        sourceTextLength: data.source?.textLength ?? 0,
        createdAt: Date.now(),
        parseWarnings: data.warnings ?? [],
        extractionMode: data.extractionMode ?? 'heuristic',
        modelWarning: data.modelWarning ?? null,
        usage: data.usage ?? null,
        drafts: nextDrafts,
      };
      setRuns((prev) => [nextRun, ...prev].slice(0, MAX_STORED_RUNS));
      setSelectedFixtureId(nextRun.fixtureId ?? activeFixture.id);
      setSelectedRunId(nextRun.id);
      setSelectedDraftId(nextRun.drafts[0]?.draftId ?? null);
      setStage('completed');
      setProcessingDetail(`已保存 ${nextRun.drafts.length} 道题目草稿`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入失败');
      setStage('idle');
      setProcessingDetail('');
    }
  }, [activeFixture, isRunning]);

  const handleDeleteRun = useCallback(
    (runId: string) => {
      setRuns((prev) => {
        const next = prev.filter((run) => run.id !== runId);
        if (selectedRunId === runId) {
          setSelectedRunId(next[0]?.id ?? null);
          setSelectedDraftId(next[0]?.drafts[0]?.draftId ?? null);
        }
        return next;
      });
    },
    [selectedRunId],
  );

  const handleClearRuns = useCallback(() => {
    setRuns([]);
    setSelectedRunId(null);
    setSelectedDraftId(null);
    setStage('idle');
    setProcessingDetail('');
    setErrorMessage(null);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                href="/test"
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700"
              >
                <ArrowLeft className="size-4" />
                返回测试中心
              </Link>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-700">
                <FileQuestion className="size-4" />
                Problem Import QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">PDF 导题测试</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={totalDrafts > 0 ? 'secondary' : 'outline'}>
                全部已持久化 {totalDrafts} 道题
              </Badge>
              {totalValidationErrors > 0 ? (
                <Badge variant="destructive">待修正 {totalValidationErrors}</Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const saved = readSavedState();
                  setRuns(saved.runs);
                  setSelectedFixtureId(saved.selectedFixtureId);
                  setSelectedRunId(saved.selectedRunId ?? saved.runs[0]?.id ?? null);
                  setSelectedDraftId(
                    saved.selectedDraftId ?? saved.runs[0]?.drafts[0]?.draftId ?? null,
                  );
                }}
              >
                <RefreshCw className="size-4" />
                刷新状态
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">测试列表</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fixturesLoading || isRunning}
                  onClick={loadFixtures}
                >
                  <RefreshCw className={cn('size-4', fixturesLoading && 'animate-spin')} />
                  刷新
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {fixturesLoading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" />
                    正在读取 testfile
                  </div>
                ) : fixtures.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    未找到测试 PDF
                  </div>
                ) : (
                  fixtures.map((fixture) => {
                    const selected = fixture.id === activeFixture?.id;
                    return (
                      <button
                        key={fixture.id}
                        type="button"
                        disabled={isRunning}
                        onClick={() => handleSelectFixture(fixture)}
                        className={cn(
                          'w-full rounded-xl border p-4 text-left transition disabled:pointer-events-none disabled:opacity-70',
                          selected
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl',
                              fixture.kind === 'choice'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700',
                            )}
                          >
                            <FileQuestion className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-950">
                                {fixture.title}
                              </span>
                              <Badge variant={fixture.exists ? 'secondary' : 'destructive'}>
                                {fixture.exists ? fixtureKindLabel(fixture.kind) : '缺失'}
                              </Badge>
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {fixture.fileName}
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-slate-600">
                              {fixture.description}
                            </span>
                            {fixture.exists ? (
                              <span className="mt-2 block text-xs text-slate-400">
                                {formatFileSize(fixture.fileSize)}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <Button
                type="button"
                className="mt-4 w-full bg-blue-600 text-white hover:bg-blue-700"
                disabled={!activeFixture?.exists || isRunning}
                onClick={handlePreviewImport}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                模型读 PDF 生成 LaTeX
              </Button>

              {stage !== 'idle' ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                    <span>{stageLabel(stage)}</span>
                    <span>{stagePercent(stage)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${stagePercent(stage)}%` }}
                    />
                  </div>
                  {processingDetail ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">{processingDetail}</p>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{errorMessage}</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">保存记录</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={runs.length === 0 || isRunning}
                  onClick={handleClearRuns}
                >
                  <Trash2 className="size-4" />
                  清空
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {runs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    暂无导入记录
                  </div>
                ) : (
                  runs.map((run) => {
                    const isSelected = run.id === activeRun?.id;
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => {
                          setSelectedFixtureId(run.fixtureId ?? null);
                          setSelectedRunId(run.id);
                          setSelectedDraftId(run.drafts[0]?.draftId ?? null);
                        }}
                        className={cn(
                          'w-full rounded-xl border p-3 text-left transition',
                          isSelected
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              {run.fixtureTitle || run.fileName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {fixtureKindLabel(run.fixtureKind)} · {run.drafts.length} 道 ·{' '}
                              {formatTime(run.createdAt)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-600">
                              {extractionModeInputLabel(run)}
                            </p>
                          </div>
                          <Badge variant={extractionModeBadgeVariant(run.extractionMode)}>
                            {extractionModeLabel(run.extractionMode)}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!activeRun ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                <FileText className="size-10 text-slate-300" />
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  {activeFixture ? `${activeFixture.title} 还没有导入结果` : '等待导入结果'}
                </p>
                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  {activeFixture
                    ? '点击生成题目后，题目列表、渲染预览和草稿 JSON 会显示在这里。'
                    : '先从左侧选择一个测试文件。'}
                </p>
                {activeFixture ? (
                  <Button
                    type="button"
                    className="mt-5 bg-blue-600 text-white hover:bg-blue-700"
                    disabled={!activeFixture.exists || isRunning}
                    onClick={handlePreviewImport}
                  >
                    <WandSparkles className="size-4" />
                    模型读 PDF 生成 LaTeX
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {activeRun.fixtureTitle || activeRun.fileName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {activeRun.fileName} · {formatFileSize(activeRun.fileSize)} ·{' '}
                          {extractionModeInputLabel(activeRun)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRun(activeRun.id)}
                        aria-label="删除导入记录"
                      >
                        <Trash2 className="size-4 text-slate-500" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        <Save className="size-3.5" />
                        已保存
                      </Badge>
                      <Badge variant="outline">{activeRun.drafts.length} 道题</Badge>
                      <Badge variant={extractionModeBadgeVariant(activeRun.extractionMode)}>
                        {extractionModeLabel(activeRun.extractionMode)}
                      </Badge>
                      {activeRun.usage?.estimatedCostCredits != null ? (
                        <Badge variant="outline">
                          {activeRun.usage.estimatedCostCredits} 算力积分
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                      导入方式：{extractionModeDescription(activeRun.extractionMode)}
                    </p>
                    {activeRun.modelWarning ? (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        {activeRun.modelWarning}
                      </p>
                    ) : null}
                    {activeRun.parseWarnings.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {activeRun.parseWarnings.map((warning) => (
                          <p
                            key={warning}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                          >
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    {activeRun.drafts.map((draft, index) => {
                      const selected = draft.draftId === activeDraft?.draftId;
                      return (
                        <button
                          key={draft.draftId}
                          type="button"
                          onClick={() => setSelectedDraftId(draft.draftId)}
                          className={cn(
                            'w-full rounded-xl border px-3 py-3 text-left transition',
                            selected
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-semibold text-slate-950">
                                {draft.title}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge variant="outline">{typeLabel(draft.type)}</Badge>
                                {draft.validationErrors.length === 0 ? (
                                  <Badge
                                    variant="secondary"
                                    className="bg-emerald-100 text-emerald-800"
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                    OK
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    {draft.validationErrors.length}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-0">
                  {activeDraft ? (
                    <ProblemDraftDetail
                      key={`${activeRun.id}-${activeDraft.draftId}`}
                      draft={activeDraft}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
