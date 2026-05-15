'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Layers3,
  LockKeyhole,
  Loader2,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import { getApiHeaders } from '@/lib/create/generation-headers';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import { backendFetch } from '@/lib/utils/backend-api';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

const LEGACY_STORAGE_KEY = 'syntara:problem-import-test:v1';
const TEST_RESULT_ID = 'problem-import';
const TEST_RESULT_KEY = 'state';
const MAX_STORED_RUNS = 12;
const PDF_LLM_TEST_MODEL = 'gpt-5.2';

const PROBLEM_READ_STEP_LABELS: Record<
  ProblemReadStepId,
  { order: number; title: string; artifact: string }
> = {
  'pdf-source': {
    order: 1,
    title: 'PDF Source',
    artifact: 'fixture / fileSize / pageCount',
  },
  'model-read': {
    order: 2,
    title: '模型读题',
    artifact: 'PDF vision read / sourceText scaffold / extractionMode',
  },
  'draft-schema': {
    order: 3,
    title: '题目草稿',
    artifact: 'drafts[] / schema / grading',
  },
  'render-review': {
    order: 4,
    title: '渲染复核',
    artifact: 'stem / options / LaTeX / fallback JSON',
  },
};

type ImportStage = 'idle' | 'parsing' | 'extracting' | 'saving' | 'completed';
type ExtractionMode = 'llm' | 'heuristic' | 'llm-file';
type CheckStatus = 'pass' | 'warn' | 'fail';
type ProblemReadStepState = 'locked' | 'ready' | 'running' | 'pass' | 'warn' | 'fail';
type ProblemReadStepId = 'pdf-source' | 'model-read' | 'draft-schema' | 'render-review';

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

interface PipelineCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

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

function emptySavedState(): SavedState {
  return { runs: [], selectedFixtureId: null, selectedRunId: null, selectedDraftId: null };
}

function sanitizeSavedState(value: unknown): SavedState {
  if (!isRecord(value)) return emptySavedState();
  const runs = Array.isArray(value.runs) ? (value.runs as StoredImportRun[]) : [];
  const pdfRuns = runs.filter((run) => run.extractionMode === 'llm-file');
  return {
    runs: pdfRuns.slice(0, MAX_STORED_RUNS),
    selectedFixtureId: typeof value.selectedFixtureId === 'string' ? value.selectedFixtureId : null,
    selectedRunId:
      typeof value.selectedRunId === 'string' &&
      pdfRuns.some((run) => run.id === value.selectedRunId)
        ? value.selectedRunId
        : null,
    selectedDraftId: typeof value.selectedDraftId === 'string' ? value.selectedDraftId : null,
  };
}

function summarizeSavedState(state: SavedState) {
  const drafts = state.runs.flatMap((run) => run.drafts);
  return {
    generatedCount: drafts.length,
    errorCount: validationErrorCount(drafts),
    runCount: state.runs.length,
    lastUpdatedAt:
      state.runs.length > 0 ? Math.max(...state.runs.map((run) => run.createdAt)) : null,
  };
}

function readLegacySavedState(): SavedState {
  if (typeof window === 'undefined') {
    return emptySavedState();
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return emptySavedState();
    const parsed = JSON.parse(raw);
    return sanitizeSavedState(parsed);
  } catch {
    return emptySavedState();
  }
}

async function readSavedState(): Promise<SavedState> {
  try {
    const row = await loadTestResult<SavedState>({
      testId: TEST_RESULT_ID,
      resultKey: TEST_RESULT_KEY,
    });
    if (row?.payload) return sanitizeSavedState(row.payload);
  } catch {
    // Keep the QA page usable if the database endpoint is temporarily unavailable.
  }

  const legacyState = readLegacySavedState();
  if (legacyState.runs.length === 0) return legacyState;
  try {
    await writeSavedState(legacyState);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Leave the legacy copy in place if the database write fails.
  }
  return legacyState;
}

async function writeSavedState(next: SavedState): Promise<void> {
  const state = {
    runs: next.runs.slice(0, MAX_STORED_RUNS),
    selectedFixtureId: next.selectedFixtureId,
    selectedRunId: next.selectedRunId,
    selectedDraftId: next.selectedDraftId,
  };
  await saveTestResult({
    testId: TEST_RESULT_ID,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: 'PDF 导题测试',
    summary: summarizeSavedState(state),
    payload: state,
  });
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

function makeCheck(
  id: string,
  title: string,
  passed: boolean,
  detail: string,
  warn = false,
): PipelineCheck {
  return { id, title, status: passed ? 'pass' : warn ? 'warn' : 'fail', detail };
}

function stemHasUnresolvedReference(stem: string): boolean {
  return /statements above|following (?:table|diagram|steps|definitions)|front page|above|Table\s+[IVX]+|Diagram\s+[IVX]+|如上|如下|上图|下图|见图|表\s*\d+/i.test(
    stem,
  );
}

function hasLatexLikeMath(value: string): boolean {
  return /\\\(|\\\[|\\frac|\\sum|\\int|\\lim|\\sqrt|\\begin\{|[$][^$]+[$]/.test(value);
}

function evaluatePdfSource(
  fixture: TestFixture | null,
  run: StoredImportRun | null,
): PipelineCheck[] {
  if (!fixture) {
    return [makeCheck('fixture-selected', '已选择测试 PDF', false, '还没有选择测试 PDF。')];
  }
  return [
    makeCheck(
      'fixture-exists',
      '测试文件存在',
      fixture.exists,
      fixture.exists ? `读取到 ${fixture.fileName}。` : `找不到 ${fixture.fileName}。`,
    ),
    makeCheck(
      'file-size',
      '文件大小有效',
      fixture.fileSize > 0,
      `fileSize=${formatFileSize(fixture.fileSize)}。`,
    ),
    makeCheck(
      'fixture-kind',
      '题目类型明确',
      fixture.kind === 'choice' || fixture.kind === 'long-form',
      `fixture kind=${fixtureKindLabel(fixture.kind)}。`,
    ),
    makeCheck(
      'page-count-visible',
      '页数可观测',
      typeof run?.pageCount === 'number' && run.pageCount > 0,
      run?.pageCount
        ? `最近一次读取到 ${run.pageCount} 页。`
        : '页数会在模型读 PDF 后显示；当前只完成文件级检查。',
      true,
    ),
  ];
}

function evaluateModelRead(run: StoredImportRun | null): PipelineCheck[] {
  if (!run) {
    return [makeCheck('model-read-started', '模型已读取 PDF', false, '还没有运行“读题目”。')];
  }
  return [
    makeCheck(
      'direct-pdf-read',
      '使用原始 PDF 作为主输入',
      run.extractionMode === 'llm-file',
      `当前模式：${extractionModeLabel(run.extractionMode)}。`,
    ),
    makeCheck(
      'drafts-produced',
      '抽取到题目草稿',
      run.drafts.length > 0,
      `drafts=${run.drafts.length}。`,
    ),
    makeCheck(
      'page-count',
      'PDF 页数已读取',
      typeof run.pageCount === 'number' && run.pageCount > 0,
      run.pageCount ? `pageCount=${run.pageCount}。` : '没有读取到 PDF 页数。',
    ),
    makeCheck(
      'text-scaffold',
      '文本层用于漏题检查',
      run.sourceTextLength > 0,
      run.sourceTextLength
        ? `文本层 scaffold=${run.sourceTextLength.toLocaleString()} 字符。`
        : '没有可用文本层；模型仍可直接读 PDF，但漏题检查会偏弱。',
      true,
    ),
    makeCheck(
      'model-warning',
      '没有模型降级警告',
      !run.modelWarning,
      run.modelWarning || '模型读题没有降级警告。',
      true,
    ),
    makeCheck(
      'parse-warnings',
      '解析 warning 可见',
      run.parseWarnings.length === 0,
      run.parseWarnings.length
        ? `${run.parseWarnings.length} 条 warning：${run.parseWarnings.join('；')}`
        : '没有解析 warning。',
      true,
    ),
  ];
}

function evaluateDraftSchema(run: StoredImportRun | null): PipelineCheck[] {
  if (!run) {
    return [makeCheck('drafts-present', '题目草稿存在', false, '还没有可检查的题目草稿。')];
  }
  const drafts = run.drafts;
  const validationErrors = validationErrorCount(drafts);
  const missingTitle = drafts.filter((draft) => !draft.title.trim()).length;
  const missingStem = drafts.filter((draft) => !draftStem(draft).trim()).length;
  const choiceWithoutOptions = drafts.filter(
    (draft) => draft.publicContent.type === 'choice' && draft.publicContent.options.length < 2,
  ).length;
  const choiceWithoutAnswer = drafts.filter(
    (draft) => draft.grading.type === 'choice' && draft.grading.correctOptionIds.length === 0,
  ).length;
  return [
    makeCheck('draft-count', '题目数量非空', drafts.length > 0, `当前抽取 ${drafts.length} 道题。`),
    makeCheck(
      'schema-validation',
      'schema 校验通过',
      validationErrors === 0,
      validationErrors
        ? `共有 ${validationErrors} 个 validationErrors。`
        : '所有草稿 schema 通过。',
    ),
    makeCheck(
      'titles',
      '每题有稳定标题',
      missingTitle === 0,
      missingTitle ? `${missingTitle} 道题缺少标题。` : '每道题都有标题。',
    ),
    makeCheck(
      'stems',
      '每题有独立题干',
      missingStem === 0,
      missingStem ? `${missingStem} 道题缺少题干。` : '每道题都有题干。',
    ),
    makeCheck(
      'choice-options',
      '选择题选项完整',
      choiceWithoutOptions === 0,
      choiceWithoutOptions ? `${choiceWithoutOptions} 道选择题选项不足。` : '选择题选项数量正常。',
    ),
    makeCheck(
      'choice-answers',
      '选择题答案可追踪',
      choiceWithoutAnswer === 0,
      choiceWithoutAnswer
        ? `${choiceWithoutAnswer} 道选择题没有正确选项。`
        : '选择题答案字段正常。',
      choiceWithoutAnswer > 0,
    ),
  ];
}

function evaluateRenderReview(
  run: StoredImportRun | null,
  draft: NotebookProblemImportDraft | null,
): PipelineCheck[] {
  if (!run || !draft) {
    return [makeCheck('draft-selected', '已选择一道题复核', false, '还没有选择题目草稿。')];
  }
  const stem = draftStem(draft);
  const choiceOptionCount =
    draft.publicContent.type === 'choice' ? draft.publicContent.options.length : 0;
  const serialized = JSON.stringify(draft);
  return [
    makeCheck(
      'stem-renderable',
      '题干可渲染',
      stem.trim().length >= 12,
      stem.trim().length ? `题干长度 ${stem.trim().length}。` : '题干为空。',
    ),
    makeCheck(
      'independent-stem',
      '题干上下文独立',
      !stemHasUnresolvedReference(stem),
      stemHasUnresolvedReference(stem)
        ? '题干疑似仍引用“上图/如下/statements above”等外部上下文。'
        : '题干没有明显悬空引用。',
      true,
    ),
    makeCheck(
      'choice-renderable',
      '选择题选项可渲染',
      draft.publicContent.type !== 'choice' || choiceOptionCount >= 2,
      draft.publicContent.type === 'choice'
        ? `选项数量：${choiceOptionCount}。`
        : '非选择题不需要选项渲染。',
    ),
    makeCheck(
      'grading-renderable',
      '评分信息可展示',
      Boolean(draft.grading?.type),
      `grading.type=${draft.grading?.type || 'missing'}。`,
    ),
    makeCheck(
      'latex-signal',
      '数学 LaTeX 信号可见',
      hasLatexLikeMath(serialized),
      hasLatexLikeMath(serialized)
        ? '草稿中检测到 LaTeX/math 标记。'
        : '未检测到 LaTeX/math 标记；若原 PDF 有公式，需要人工复核。',
      true,
    ),
  ];
}

function statusClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function statusIcon(status: CheckStatus) {
  if (status === 'pass') return CheckCircle2;
  if (status === 'warn') return AlertTriangle;
  return XCircle;
}

function hasBlockingFailure(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

function hasWarning(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'warn');
}

function checksToStepState(checks: PipelineCheck[]): ProblemReadStepState {
  if (hasBlockingFailure(checks)) return 'fail';
  if (hasWarning(checks)) return 'warn';
  return 'pass';
}

function stepBadgeLabel(state: ProblemReadStepState): string {
  if (state === 'locked') return '锁定';
  if (state === 'ready') return '待测';
  if (state === 'running') return '运行中';
  if (state === 'pass') return '通过';
  if (state === 'warn') return '通过，有警告';
  return '未通过';
}

function stepBadgeClassName(state: ProblemReadStepState): string {
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  if (state === 'ready') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-700';
}

function StepStatusIcon({ state }: { state: ProblemReadStepState }) {
  if (state === 'locked') return <LockKeyhole className="size-4" />;
  if (state === 'running') return <Loader2 className="size-4 animate-spin" />;
  if (state === 'pass') return <CheckCircle2 className="size-4" />;
  if (state === 'warn') return <AlertTriangle className="size-4" />;
  if (state === 'fail') return <XCircle className="size-4" />;
  return <PlayCircle className="size-4" />;
}

function GateCheckList({ checks }: { checks: PipelineCheck[] }) {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-600">Gate checks</span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 font-semibold',
            failed
              ? 'border-red-200 bg-red-50 text-red-700'
              : warned
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {failed ? `${failed} fail` : warned ? `${warned} warn` : 'pass'}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {checks.map((check) => {
          const Icon = statusIcon(check.status);
          return (
            <div
              key={check.id}
              className={cn('rounded-xl border px-3 py-2 text-sm', statusClassName(check.status))}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="size-4" />
                {check.title}
              </div>
              <p className="mt-1 text-xs leading-5 opacity-90">{check.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
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

function ProblemDraftJsonFallback({ draft }: { draft: NotebookProblemImportDraft }) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h3 className="font-semibold">这道题还没 valid，先看结构化 JSON 排查</h3>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {draft.validationErrors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">草稿 JSON</h3>
          <Badge variant="destructive">{draft.validationErrors.length} invalid</Badge>
        </div>
        <Textarea
          readOnly
          value={JSON.stringify(draft, null, 2)}
          className="mt-3 min-h-[520px] resize-y font-mono text-xs leading-5"
        />
      </section>
    </div>
  );
}

function ProblemDraftDetail({ draft }: { draft: NotebookProblemImportDraft }) {
  const content = draft.publicContent;
  if (draft.validationErrors.length > 0) {
    return <ProblemDraftJsonFallback draft={draft} />;
  }

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

      {content.type === 'fill_blank' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">填空</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {content.blanks.map((blank) => (
              <Badge key={blank.id} variant="outline" className="rounded-md">
                {blank.id}
                {blank.placeholder ? ` · ${blank.placeholder}` : ''}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">评分信息</h3>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          <GradingSummary draft={draft} />
        </div>
      </section>
    </div>
  );
}

function ProblemDraftNavigator({
  run,
  activeDraft,
  onSelectDraft,
}: {
  run: StoredImportRun;
  activeDraft: NotebookProblemImportDraft;
  onSelectDraft: (draftId: string) => void;
}) {
  const activeIndex = Math.max(
    0,
    run.drafts.findIndex((draft) => draft.draftId === activeDraft.draftId),
  );
  const previousDraft = run.drafts[activeIndex - 1] ?? null;
  const nextDraft = run.drafts[activeIndex + 1] ?? null;
  const isValid = activeDraft.validationErrors.length === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              {activeIndex + 1} / {run.drafts.length}
            </Badge>
            <Badge variant={isValid ? 'secondary' : 'destructive'} className="rounded-md">
              {isValid
                ? 'valid · 题目预览'
                : `${activeDraft.validationErrors.length} invalid · JSON`}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{activeDraft.title}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!previousDraft}
            onClick={() => previousDraft && onSelectDraft(previousDraft.draftId)}
          >
            <ChevronLeft className="size-4" />
            上一题
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!nextDraft}
            onClick={() => nextDraft && onSelectDraft(nextDraft.draftId)}
          >
            下一题
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProblemReadStepCard({
  order,
  title,
  artifact,
  description,
  state,
  actionLabel,
  onAction,
  actionDisabled,
  disabledReason,
  children,
}: {
  order: number;
  title: string;
  artifact: string;
  description: string;
  state: ProblemReadStepState;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}) {
  const locked = state === 'locked';
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm',
        locked ? 'border-slate-200 opacity-75' : 'border-slate-200',
      )}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                locked ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white',
              )}
            >
              {order}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-normal text-slate-950">{title}</h2>
              <p className="truncate text-xs font-medium text-slate-500">{artifact}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold',
                stepBadgeClassName(state),
              )}
            >
              <StepStatusIcon state={state} />
              {stepBadgeLabel(state)}
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
          {locked && disabledReason ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              {disabledReason}
            </div>
          ) : null}
        </div>

        {actionLabel && onAction ? (
          <Button
            type="button"
            variant={state === 'fail' ? 'destructive' : locked ? 'outline' : 'default'}
            disabled={locked || actionDisabled}
            onClick={onAction}
            className="w-full lg:w-auto"
          >
            {state === 'running' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            {actionLabel}
          </Button>
        ) : null}
      </div>

      {!locked && children ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </section>
  );
}

function ProblemReadSidebar({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: Array<{
    id: ProblemReadStepId;
    order: number;
    title: string;
    artifact: string;
    state: ProblemReadStepState;
    failCount: number;
    warnCount: number;
  }>;
  selectedStepId: ProblemReadStepId;
  onSelectStep: (stepId: ProblemReadStepId) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Layers3 className="size-4" />
          Problem Reading Pipeline
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          左侧选择 step，右侧只显示当前读题阶段的 gate checks 和产物。
        </p>
      </div>

      <div className="mt-2 grid gap-2">
        {steps.map((step) => {
          const selected = step.id === selectedStepId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={cn(
                'block w-full min-w-0 max-w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition',
                selected
                  ? 'border-blue-300 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="flex min-w-0 flex-1 gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {step.order}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {step.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                      {step.artifact}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'ml-auto inline-flex max-w-[92px] shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
                    stepBadgeClassName(step.state),
                  )}
                >
                  <span className="shrink-0">
                    <StepStatusIcon state={step.state} />
                  </span>
                  <span className="truncate">{stepBadgeLabel(step.state)}</span>
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">fail</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.failCount ? 'text-red-600' : 'text-slate-700',
                    )}
                  >
                    {step.failCount}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-white/70 px-2 py-1">
                  <div className="text-slate-400">warn</div>
                  <div
                    className={cn(
                      'font-semibold',
                      step.warnCount ? 'text-amber-700' : 'text-slate-700',
                    )}
                  >
                    {step.warnCount}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function PdfSourceEvidencePanel({
  fixture,
  run,
}: {
  fixture: TestFixture | null;
  run: StoredImportRun | null;
}) {
  if (!fixture) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有选择测试 PDF。
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">fixture</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-950">{fixture.title}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">fileSize</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {formatFileSize(fixture.fileSize)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">pageCount</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {run?.pageCount ?? '待读取'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">kind</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {fixtureKindLabel(fixture.kind)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
        <div className="font-semibold text-slate-950">{fixture.fileName}</div>
        <p className="mt-1">{fixture.description}</p>
        <p className="mt-2 text-xs text-slate-500">
          这个 step 只确认 PDF fixture 可读。真正的视觉读题和题干抽取在下一步执行。
        </p>
      </div>
    </div>
  );
}

function ModelReadEvidencePanel({ run }: { run: StoredImportRun | null }) {
  if (!run) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        PDF source 已准备好。点击“读题目”后，模型会直接读取原始 PDF，并把题目转成结构化草稿。
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={extractionModeBadgeVariant(run.extractionMode)}>
            {extractionModeLabel(run.extractionMode)}
          </Badge>
          <Badge variant="outline">{run.drafts.length} 道题</Badge>
          {run.pageCount ? <Badge variant="outline">{run.pageCount} 页</Badge> : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {extractionModeDescription(run.extractionMode)}
        </p>
        <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-600">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            输入：{extractionModeInputLabel(run)}
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            文本 scaffold：{run.sourceTextLength.toLocaleString()} 字符
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            生成时间：{formatTime(run.createdAt)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold text-slate-500">Warnings / usage</div>
        <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600">
          {run.modelWarning ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              {run.modelWarning}
            </div>
          ) : null}
          {run.parseWarnings.map((warning) => (
            <div
              key={warning}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
            >
              {warning}
            </div>
          ))}
          {run.usage ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              input {run.usage.inputTokens} / output {run.usage.outputTokens}
              {run.usage.estimatedCostCredits != null
                ? ` · ${run.usage.estimatedCostCredits} 算力积分`
                : ''}
            </div>
          ) : null}
          {!run.modelWarning && run.parseWarnings.length === 0 && !run.usage ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              暂无 warning 或 usage 明细。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DraftSchemaEvidencePanel({
  run,
  activeDraft,
  onSelectDraft,
}: {
  run: StoredImportRun | null;
  activeDraft: NotebookProblemImportDraft | null;
  onSelectDraft: (draftId: string) => void;
}) {
  if (!run) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        等待读题结果。
      </div>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-2">
        {run.drafts.map((draft, index) => {
          const selected = draft.draftId === activeDraft?.draftId;
          return (
            <button
              key={draft.draftId}
              type="button"
              onClick={() => onSelectDraft(draft.draftId)}
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
                  <p className="line-clamp-2 text-sm font-semibold text-slate-950">{draft.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{typeLabel(draft.type)}</Badge>
                    {draft.validationErrors.length === 0 ? (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="size-3.5" />
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive">{draft.validationErrors.length}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 space-y-3">
        {activeDraft ? (
          <>
            <ProblemDraftNavigator
              run={run}
              activeDraft={activeDraft}
              onSelectDraft={onSelectDraft}
            />
            <ProblemDraftDetail draft={activeDraft} />
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            请选择一道题。
          </div>
        )}
      </div>
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
  const [selectedStepId, setSelectedStepId] = useState<ProblemReadStepId>('pdf-source');

  useEffect(() => {
    let cancelled = false;
    void readSavedState()
      .then((saved) => {
        if (cancelled) return;
        setRuns(saved.runs);
        setSelectedFixtureId(saved.selectedFixtureId);
        setSelectedRunId(saved.selectedRunId ?? saved.runs[0]?.id ?? null);
        setSelectedDraftId(saved.selectedDraftId ?? saved.runs[0]?.drafts[0]?.draftId ?? null);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
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
    const timer = window.setTimeout(() => {
      void writeSavedState({ runs, selectedFixtureId, selectedRunId, selectedDraftId }).catch(
        () => undefined,
      );
    }, 350);
    return () => window.clearTimeout(timer);
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
  const sourceChecks = useMemo(
    () => evaluatePdfSource(activeFixture, activeRun),
    [activeFixture, activeRun],
  );
  const modelReadChecks = useMemo(() => evaluateModelRead(activeRun), [activeRun]);
  const draftSchemaChecks = useMemo(() => evaluateDraftSchema(activeRun), [activeRun]);
  const renderReviewChecks = useMemo(
    () => evaluateRenderReview(activeRun, activeDraft),
    [activeDraft, activeRun],
  );
  const sourcePassed = Boolean(activeFixture?.exists) && !hasBlockingFailure(sourceChecks);
  const modelReadStarted = Boolean(activeRun);
  const modelReadPassed = modelReadStarted && !hasBlockingFailure(modelReadChecks);
  const draftSchemaPassed = modelReadPassed && !hasBlockingFailure(draftSchemaChecks);
  const sourceStepState: ProblemReadStepState = fixturesLoading
    ? 'running'
    : sourcePassed
      ? checksToStepState(sourceChecks)
      : activeFixture
        ? 'fail'
        : 'ready';
  const modelReadStepState: ProblemReadStepState = !sourcePassed
    ? 'locked'
    : isRunning
      ? 'running'
      : modelReadStarted
        ? checksToStepState(modelReadChecks)
        : 'ready';
  const draftSchemaStepState: ProblemReadStepState = !modelReadPassed
    ? 'locked'
    : checksToStepState(draftSchemaChecks);
  const renderReviewStepState: ProblemReadStepState = !draftSchemaPassed
    ? 'locked'
    : checksToStepState(renderReviewChecks);
  const allChecks = useMemo(
    () => [
      ...sourceChecks,
      ...(modelReadStarted ? modelReadChecks : []),
      ...(modelReadPassed ? draftSchemaChecks : []),
      ...(draftSchemaPassed ? renderReviewChecks : []),
    ],
    [
      draftSchemaChecks,
      draftSchemaPassed,
      modelReadChecks,
      modelReadPassed,
      modelReadStarted,
      renderReviewChecks,
      sourceChecks,
    ],
  );
  const failCount = allChecks.filter((check) => check.status === 'fail').length;
  const warnCount = allChecks.filter((check) => check.status === 'warn').length;
  const problemReadSteps = useMemo(
    () =>
      [
        { id: 'pdf-source' as const, state: sourceStepState, checks: sourceChecks },
        {
          id: 'model-read' as const,
          state: modelReadStepState,
          checks: modelReadStarted ? modelReadChecks : [],
        },
        {
          id: 'draft-schema' as const,
          state: draftSchemaStepState,
          checks: modelReadPassed ? draftSchemaChecks : [],
        },
        {
          id: 'render-review' as const,
          state: renderReviewStepState,
          checks: draftSchemaPassed ? renderReviewChecks : [],
        },
      ].map((step) => ({
        ...step,
        ...PROBLEM_READ_STEP_LABELS[step.id],
        failCount: step.checks.filter((check) => check.status === 'fail').length,
        warnCount: step.checks.filter((check) => check.status === 'warn').length,
      })),
    [
      draftSchemaChecks,
      draftSchemaPassed,
      draftSchemaStepState,
      modelReadChecks,
      modelReadPassed,
      modelReadStarted,
      modelReadStepState,
      renderReviewChecks,
      renderReviewStepState,
      sourceChecks,
      sourceStepState,
    ],
  );

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
      setSelectedStepId('pdf-source');
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
      setSelectedStepId('model-read');
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
    setSelectedStepId('pdf-source');
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div>
          <Link
            href="/test"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <ChevronLeft className="size-4" />
            返回所有测试
          </Link>
        </div>

        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] lg:items-start">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <FileQuestion className="size-4" />
                Problem Reading Stage QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">读题目分步测试</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                专门验收真实 PDF 被模型读成结构化题目的中间产物：先确认
                fixture，再看模型读题，再检查 drafts schema，最后逐题复核渲染效果；valid
                题显示正常题目，invalid 题才显示 JSON。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">测试模型</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {PDF_LLM_TEST_MODEL}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">fail gates</div>
                <div
                  className={cn(
                    'mt-1 text-2xl font-semibold',
                    failCount ? 'text-red-600' : 'text-slate-950',
                  )}
                >
                  {failCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">warn gates</div>
                <div
                  className={cn(
                    'mt-1 text-2xl font-semibold',
                    warnCount ? 'text-amber-700' : 'text-slate-950',
                  )}
                >
                  {warnCount}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={totalDrafts > 0 ? 'secondary' : 'outline'}>
                已保存 {totalDrafts} 道题
              </Badge>
              <Badge variant={totalValidationErrors > 0 ? 'destructive' : 'outline'}>
                validation errors {totalValidationErrors}
              </Badge>
              <Badge variant={activeFixture?.exists ? 'outline' : 'destructive'}>
                {activeFixture ? activeFixture.fileName : '未选择 PDF'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fixturesLoading || isRunning}
                onClick={() => {
                  void readSavedState().then((saved) => {
                    setRuns(saved.runs);
                    setSelectedFixtureId(saved.selectedFixtureId);
                    setSelectedRunId(saved.selectedRunId ?? saved.runs[0]?.id ?? null);
                    setSelectedDraftId(
                      saved.selectedDraftId ?? saved.runs[0]?.drafts[0]?.draftId ?? null,
                    );
                  });
                }}
              >
                <RefreshCw className="size-4" />
                刷新状态
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!activeFixture?.exists || isRunning}
                onClick={handlePreviewImport}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                读题目
              </Button>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-normal text-slate-950">测试输入</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                先选择要读的真实 PDF fixture；每次运行会写入保存记录，便于对比不同读题结果。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fixturesLoading || isRunning}
              onClick={loadFixtures}
            >
              <RefreshCw className={cn('size-4', fixturesLoading && 'animate-spin')} />
              刷新 fixture
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {fixturesLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 md:col-span-2">
                <Loader2 className="size-4 animate-spin" />
                正在读取 testfile
              </div>
            ) : fixtures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2">
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
                      'min-w-0 rounded-xl border p-4 text-left transition disabled:pointer-events-none disabled:opacity-70',
                      selected
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
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

          {runs.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-700">保存记录</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRunning}
                  onClick={handleClearRuns}
                >
                  <Trash2 className="size-4" />
                  清空
                </Button>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {runs.map((run) => {
                  const isSelected = run.id === activeRun?.id;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => {
                        setSelectedFixtureId(run.fixtureId ?? null);
                        setSelectedRunId(run.id);
                        setSelectedDraftId(run.drafts[0]?.draftId ?? null);
                        setSelectedStepId('model-read');
                      }}
                      className={cn(
                        'min-w-[260px] rounded-xl border p-3 text-left transition',
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
                        </div>
                        <Badge variant={extractionModeBadgeVariant(run.extractionMode)}>
                          {extractionModeLabel(run.extractionMode)}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

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
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <ProblemReadSidebar
            steps={problemReadSteps}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />

          <div className="min-w-0">
            {selectedStepId === 'pdf-source' ? (
              <ProblemReadStepCard
                order={PROBLEM_READ_STEP_LABELS['pdf-source'].order}
                title={PROBLEM_READ_STEP_LABELS['pdf-source'].title}
                artifact={PROBLEM_READ_STEP_LABELS['pdf-source'].artifact}
                description="确认读题测试使用的 PDF fixture 存在、大小有效、题目类型明确。页数需要等模型读取后才会补齐。"
                state={sourceStepState}
              >
                <div className="grid gap-4">
                  <GateCheckList checks={sourceChecks} />
                  <PdfSourceEvidencePanel fixture={activeFixture} run={activeRun} />
                </div>
              </ProblemReadStepCard>
            ) : null}

            {selectedStepId === 'model-read' ? (
              <ProblemReadStepCard
                order={PROBLEM_READ_STEP_LABELS['model-read'].order}
                title={PROBLEM_READ_STEP_LABELS['model-read'].title}
                artifact={PROBLEM_READ_STEP_LABELS['model-read'].artifact}
                description="调用测试 API，让模型直接读取原始 PDF，并产出结构化题目草稿；文本层只作为漏题检查 scaffold。"
                state={modelReadStepState}
                actionLabel={modelReadStarted ? '重新读题目' : '读题目'}
                onAction={handlePreviewImport}
                actionDisabled={!activeFixture?.exists || isRunning}
                disabledReason="先通过 PDF Source step，确认有可读取的测试 PDF。"
              >
                <div className="grid gap-4">
                  <GateCheckList checks={modelReadChecks} />
                  <ModelReadEvidencePanel run={activeRun} />
                </div>
              </ProblemReadStepCard>
            ) : null}

            {selectedStepId === 'draft-schema' ? (
              <ProblemReadStepCard
                order={PROBLEM_READ_STEP_LABELS['draft-schema'].order}
                title={PROBLEM_READ_STEP_LABELS['draft-schema'].title}
                artifact={PROBLEM_READ_STEP_LABELS['draft-schema'].artifact}
                description="检查模型输出是否已经落到 NotebookProblemImportDraft schema：数量、标题、题干、选项和答案字段都在这里 gate。"
                state={draftSchemaStepState}
                disabledReason="需要先完成模型读题，并抽取到可检查的 drafts。"
              >
                <div className="grid gap-4">
                  <GateCheckList checks={draftSchemaChecks} />
                  <DraftSchemaEvidencePanel
                    run={activeRun}
                    activeDraft={activeDraft}
                    onSelectDraft={setSelectedDraftId}
                  />
                </div>
              </ProblemReadStepCard>
            ) : null}

            {selectedStepId === 'render-review' ? (
              <ProblemReadStepCard
                order={PROBLEM_READ_STEP_LABELS['render-review'].order}
                title={PROBLEM_READ_STEP_LABELS['render-review'].title}
                artifact={PROBLEM_READ_STEP_LABELS['render-review'].artifact}
                description="逐题复核最终测试页会展示的内容：上一题/下一题切换；valid 显示正常题目，invalid 才显示 JSON 方便排查。"
                state={renderReviewStepState}
                disabledReason="需要先通过题目草稿 schema 检查，并选中一道题。"
              >
                <div className="grid gap-4">
                  <GateCheckList checks={renderReviewChecks} />
                  {activeRun && activeDraft ? (
                    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {activeRun.fixtureTitle || activeRun.fileName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {activeRun.fileName} · {formatFileSize(activeRun.fileSize)}
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
                          </div>
                        </div>

                        {activeRun.drafts.map((draft, index) => {
                          const selected = draft.draftId === activeDraft.draftId;
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

                      <div className="min-w-0 space-y-3">
                        <ProblemDraftNavigator
                          run={activeRun}
                          activeDraft={activeDraft}
                          onSelectDraft={setSelectedDraftId}
                        />
                        <ProblemDraftDetail
                          key={`${activeRun.id}-${activeDraft.draftId}`}
                          draft={activeDraft}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      暂无可复核的题目。
                    </div>
                  )}
                </div>
              </ProblemReadStepCard>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
