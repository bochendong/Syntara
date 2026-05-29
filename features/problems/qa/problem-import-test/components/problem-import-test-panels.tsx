'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Layers3,
  Loader2,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProblemImageAssets, ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import { cn } from '@/lib/utils';
import {
  stepLabelForMode,
  type CheckStatus,
  type DraftResult,
  type FixtureKind,
  type PipelineMode,
  type PipelineRun,
  type QualityReport,
  type SourcePackage,
  type StepId,
  type StepResponse,
  type StepState,
  type StructureItem,
  type StructurePlan,
  type TestFixture,
} from '../lib/types';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fixtureKindLabel(kind?: FixtureKind): string {
  if (kind === 'choice') return '选择题';
  if (kind === 'long-form') return '大题';
  if (kind === 'code') return 'CS / 代码';
  if (kind === 'material') return '材料抽题';
  return 'fixture';
}

export function pipelineModeLabel(_mode?: PipelineMode): string {
  return 'LLM 直读';
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

function draftStem(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function stateLabel(state: StepState): string {
  if (state === 'locked') return '锁定';
  if (state === 'ready') return '待测';
  if (state === 'running') return '运行中';
  if (state === 'pass') return '通过';
  if (state === 'warn') return '有警告';
  return '未通过';
}

function stateClassName(state: StepState): string {
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  if (state === 'ready') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-700';
}

function checkClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'running') return <Loader2 className="size-4 animate-spin" />;
  if (state === 'pass') return <CheckCircle2 className="size-4" />;
  if (state === 'warn') return <AlertTriangle className="size-4" />;
  if (state === 'fail') return <XCircle className="size-4" />;
  return <PlayCircle className="size-4" />;
}

function checkIcon(status: CheckStatus) {
  if (status === 'pass') return CheckCircle2;
  if (status === 'warn') return AlertTriangle;
  return XCircle;
}

export function stepStateForMode(
  stepId: StepId,
  run: PipelineRun | null,
  runningStep: StepId | null,
  _mode: PipelineMode,
): StepState {
  if (runningStep === stepId) return 'running';
  if (stepId === 'source-package') return run?.sourcePackage ? 'pass' : 'ready';
  if (stepId === 'draft-generation') {
    if (!run?.draftResult) return 'ready';
    return run.draftResult.drafts.length > 0 ? 'pass' : 'fail';
  }
  if (stepId === 'quality-report') {
    if (!run?.draftResult) return 'locked';
    if (!run.qualityReport) return 'ready';
    if (run.qualityReport.blockingIssueCount > 0) return 'fail';
    return run.qualityReport.warningIssueCount > 0 ? 'warn' : 'pass';
  }
  if (!run?.draftResult) return 'locked';
  if (run.draftResult.drafts.length === 0) return 'ready';
  const hasRenderBlocker = run.draftResult.drafts.some((draft) => {
    const stem = draftStem(draft).trim();
    if (!stem) return true;
    return draft.publicContent.type === 'choice' && draft.publicContent.options.length < 2;
  });
  if (hasRenderBlocker) return 'fail';
  return run.draftResult.drafts.some((draft) => draft.validationErrors.length > 0)
    ? 'warn'
    : 'pass';
}

export function mergeRun(
  existing: PipelineRun | null,
  fixture: TestFixture | StepResponse['fixture'],
  fileSize: number,
  patch: Partial<PipelineRun>,
): PipelineRun {
  const fixtureId = fixture?.id || existing?.fixtureId || 'unknown';
  return {
    id: existing?.id || crypto.randomUUID(),
    fixtureId,
    fixtureTitle: fixture?.title || existing?.fixtureTitle || fixtureId,
    fixtureKind: fixture?.kind || existing?.fixtureKind || 'material',
    fileName: fixture?.fileName || existing?.fileName || 'unknown',
    fileSize: fileSize || existing?.fileSize || 0,
    pipelineMode: existing?.pipelineMode || 'direct-llm',
    createdAt: existing?.createdAt || Date.now(),
    ...existing,
    ...patch,
  };
}

export function StepSidebar({
  steps,
  selectedStepId,
  mode,
  onSelectStep,
}: {
  steps: Array<{ id: StepId; state: StepState; failCount: number; warnCount: number }>;
  selectedStepId: StepId;
  mode: PipelineMode;
  onSelectStep: (stepId: StepId) => void;
}) {
  return (
    <aside className="min-w-0 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Layers3 className="size-4 shrink-0" />
          Problem Import · LLM 直读
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          直读模式只看输入、一次 LLM 结果、QA 和题目预览；Structure Plan 是结果的一部分。
        </p>
      </div>
      <div className="grid gap-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-10rem)]">
        {steps.map((step) => {
          const label = stepLabelForMode(step.id, mode);
          const selected = selectedStepId === step.id;
          return (
            <button
              key={step.id}
              type="button"
              aria-current={selected ? 'step' : undefined}
              onClick={() => onSelectStep(step.id)}
              className={cn(
                'group block w-full min-w-0 max-w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition',
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
                    {label.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {label.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                      {label.artifact}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'ml-auto inline-flex max-w-[92px] shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
                    stateClassName(step.state),
                  )}
                >
                  <span className="shrink-0">
                    <StepIcon state={step.state} />
                  </span>
                  <span className="truncate">{stateLabel(step.state)}</span>
                </span>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-white/80 px-2 py-1 font-medium text-slate-500">
                  fail
                  <span
                    className={cn(
                      'font-semibold',
                      step.failCount ? 'text-red-600' : 'text-slate-700',
                    )}
                  >
                    {step.failCount}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-white/80 px-2 py-1 font-medium text-slate-500">
                  warn
                  <span
                    className={cn(
                      'font-semibold',
                      step.warnCount ? 'text-amber-700' : 'text-slate-700',
                    )}
                  >
                    {step.warnCount}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function StepShell({
  stepId,
  state,
  mode = 'direct-llm',
  actionLabel,
  actionDisabled,
  onAction,
  onCancel,
  children,
}: {
  stepId: StepId;
  state: StepState;
  mode?: PipelineMode;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  onCancel?: () => void;
  children: ReactNode;
}) {
  const label = stepLabelForMode(stepId, mode);
  const locked = state === 'locked';
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm',
        locked && 'opacity-75',
      )}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {label.order}
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-normal text-slate-950">
                {label.title}
              </h2>
              <p className="text-xs font-medium text-slate-500">{label.artifact}</p>
            </div>
            <Badge variant="outline" className={cn('rounded-md border', stateClassName(state))}>
              <StepIcon state={state} />
              {stateLabel(state)}
            </Badge>
          </div>
        </div>
        {actionLabel && onAction ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
            <Button
              type="button"
              disabled={locked || actionDisabled}
              onClick={onAction}
              className="w-full sm:w-auto"
            >
              {state === 'running' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlayCircle className="size-4" />
              )}
              {actionLabel}
            </Button>
            {state === 'running' && onCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="w-full sm:w-auto"
              >
                <XCircle className="size-4" />
                停止
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!locked ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
      {locked ? (
        <div className="border-t border-slate-100 p-4 text-sm text-slate-500">
          需要先跑出 LLM 直读结果。
        </div>
      ) : null}
    </section>
  );
}

export function QualityChecks({ report }: { report?: QualityReport }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 QA report。
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={report.passed ? 'secondary' : 'destructive'}>
            {report.passed ? 'passed' : 'blocking issues'}
          </Badge>
          <Badge variant="outline">{report.blockingIssueCount} fail</Badge>
          <Badge variant="outline">{report.warningIssueCount} warn</Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{report.summary}</p>
      </div>
      {report.checks.map((check) => {
        const Icon = checkIcon(check.status);
        return (
          <div
            key={check.id}
            className={cn('rounded-xl border p-3 text-sm', checkClassName(check.status))}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Icon className="size-4" />
              {check.title}
            </div>
            <div className="mt-2 grid gap-1 text-xs leading-5 opacity-90">
              {check.details.map((detail, index) => (
                <div key={`${check.id}-${index}`}>{detail}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SourcePackagePanel({ sourcePackage }: { sourcePackage?: SourcePackage }) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = sourcePackage?.sourcePages[pageIndex] || sourcePackage?.sourcePages[0] || null;
  const pageImage = page
    ? sourcePackage?.sourceImages.find((image) => image.pageNumber === page.pageNumber)
    : null;

  if (!sourcePackage) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        点击“跑 LLM 直读”，会同时读取源文件、保留页面预览和 parser metadata。
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="parser" value={sourcePackage.parser} />
        <MetricCard label="pages / sections" value={sourcePackage.pageCount} />
        <MetricCard label="text" value={sourcePackage.sourceText.length.toLocaleString()} />
        <MetricCard label="images" value={sourcePackage.sourceImages.length} />
      </div>

      {sourcePackage.warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {sourcePackage.warnings.join('；')}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {sourcePackage.sourcePages.map((sourcePage, index) => (
            <button
              key={sourcePage.id}
              type="button"
              onClick={() => setPageIndex(index)}
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-left text-sm transition',
                page?.id === sourcePage.id
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-950">{sourcePage.sourceLabel}</span>
                <Badge variant="outline">{sourcePage.roleHint}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{sourcePage.title}</p>
            </button>
          ))}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">{page?.sourceLabel}</div>
              <div className="text-xs text-slate-500">{page?.charCount.toLocaleString()} chars</div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft className="size-4" />
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex >= sourcePackage.sourcePages.length - 1}
                onClick={() =>
                  setPageIndex((value) => Math.min(sourcePackage.sourcePages.length - 1, value + 1))
                }
              >
                下一页
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {pageImage?.src ? (
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
              <img
                src={pageImage.src}
                alt={pageImage.description || `Page ${pageImage.pageNumber}`}
                className="max-h-[520px] w-full rounded-lg object-contain"
              />
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              <ImageIcon className="mr-2 size-4" />
              这个页面没有可用视觉预览。
            </div>
          )}

          <Textarea
            readOnly
            value={page?.text || ''}
            className="min-h-[260px] resize-y font-mono text-xs leading-5"
          />
        </div>
      </div>
    </div>
  );
}

export function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function DirectLlmResultPanel({
  sourcePackage,
  structurePlan,
  draftResult,
  activeDraftId,
  onSelectDraft,
}: {
  sourcePackage?: SourcePackage;
  structurePlan?: StructurePlan;
  draftResult?: DraftResult;
  activeDraftId: string | null;
  onSelectDraft: (draftId: string) => void;
}) {
  if (!draftResult) {
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
          点击“跑 LLM 直读”，模型会在一次调用里读取 PDF、判断题目边界并输出 drafts。这里不会再把
          Structure Plan 单独做成一个 step。
        </div>
        {sourcePackage ? (
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="parser" value={sourcePackage.parser} />
            <MetricCard label="pages" value={sourcePackage.pageCount} />
            <MetricCard label="text" value={sourcePackage.sourceText.length.toLocaleString()} />
            <MetricCard label="images" value={sourcePackage.sourceImages.length} />
          </div>
        ) : null}
      </div>
    );
  }

  const activeDraft =
    draftResult.drafts.find((draft) => draft.draftId === activeDraftId) || draftResult.drafts[0];
  const activeIndex = activeDraft
    ? Math.max(
        0,
        draftResult.drafts.findIndex((draft) => draft.draftId === activeDraft.draftId),
      )
    : 0;
  const planItem = structurePlan?.topLevelProblems[activeIndex] || null;

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <DraftList
        drafts={draftResult.drafts}
        activeDraftId={activeDraft?.draftId}
        onSelectDraft={onSelectDraft}
      />
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="drafts" value={draftResult.drafts.length} />
          <MetricCard label="planned" value={structurePlan?.topLevelProblems.length || '-'} />
          <MetricCard label="ignored" value={structurePlan?.nonProblemRegions.length || 0} />
          <MetricCard label="mode" value="direct-llm" />
        </div>

        {draftResult.warnings.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {draftResult.warnings.join('；')}
          </div>
        ) : null}

        {activeDraft ? (
          <>
            <DraftNavigator
              drafts={draftResult.drafts}
              activeDraft={activeDraft}
              onSelectDraft={onSelectDraft}
            />
            <DraftBoundarySummary planItem={planItem} draft={activeDraft} />
            <ProblemDraftDetail draft={activeDraft} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DraftBoundarySummary({
  planItem,
  draft,
}: {
  planItem: StructureItem | null;
  draft: NotebookProblemImportDraft;
}) {
  const sourceMeta = draft.sourceMeta as Record<string, unknown>;
  const anchors = planItem?.sourceAnchors || [];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{planItem?.topLevelLabel || `draft ${draft.draftId}`}</Badge>
        <Badge variant="outline">{planItem?.problemTypeHint || typeLabel(draft.type)}</Badge>
        <Badge variant="outline">
          pages {planItem?.pageStart || '-'}-{planItem?.pageEnd || '-'}
        </Badge>
        {typeof sourceMeta.importMode === 'string' ? (
          <Badge variant="secondary">{sourceMeta.importMode}</Badge>
        ) : null}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-950">题目边界</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {planItem
          ? planItem.title
          : '这个 draft 没有单独的结构计划条目，先按最终题目内容和 QA 检查判断。'}
      </p>
      {planItem?.subparts.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {planItem.subparts.slice(0, 4).map((subpart) => (
            <div
              key={`${planItem.index}-${subpart.label}`}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600"
            >
              <span className="font-semibold text-slate-900">({subpart.label})</span>{' '}
              {subpart.prompt}
            </div>
          ))}
        </div>
      ) : null}
      {anchors.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {anchors.slice(0, 4).map((anchor, index) => (
            <span
              key={`${draft.draftId}-anchor-${index}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
            >
              page {anchor.pageNumber || '-'}
              {anchor.textQuote ? ` · ${anchor.textQuote.slice(0, 56)}` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DraftList({
  drafts,
  activeDraftId,
  onSelectDraft,
}: {
  drafts: NotebookProblemImportDraft[];
  activeDraftId?: string;
  onSelectDraft: (draftId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {drafts.map((draft, index) => (
        <button
          key={draft.draftId}
          type="button"
          onClick={() => onSelectDraft(draft.draftId)}
          className={cn(
            'w-full rounded-xl border px-3 py-3 text-left transition',
            activeDraftId === draft.draftId
              ? 'border-blue-300 bg-blue-50'
              : 'border-slate-200 bg-white hover:bg-slate-50',
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
      ))}
    </div>
  );
}

function DraftNavigator({
  drafts,
  activeDraft,
  onSelectDraft,
}: {
  drafts: NotebookProblemImportDraft[];
  activeDraft: NotebookProblemImportDraft;
  onSelectDraft: (draftId: string) => void;
}) {
  const activeIndex = Math.max(
    0,
    drafts.findIndex((draft) => draft.draftId === activeDraft.draftId),
  );
  const previousDraft = drafts[activeIndex - 1] || null;
  const nextDraft = drafts[activeIndex + 1] || null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div>
        <Badge variant="outline">
          {activeIndex + 1} / {drafts.length}
        </Badge>
        <p className="mt-1 text-sm font-semibold text-slate-950">{activeDraft.title}</p>
      </div>
      <div className="flex gap-2">
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
  );
}

export function RenderReviewPanel({
  draftResult,
  activeDraftId,
  onSelectDraft,
}: {
  draftResult?: DraftResult;
  activeDraftId: string | null;
  onSelectDraft: (draftId: string) => void;
}) {
  if (!draftResult) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        暂无可渲染 drafts。
      </div>
    );
  }
  const activeDraft =
    draftResult.drafts.find((draft) => draft.draftId === activeDraftId) || draftResult.drafts[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <DraftList
        drafts={draftResult.drafts}
        activeDraftId={activeDraft?.draftId}
        onSelectDraft={onSelectDraft}
      />
      <div className="min-w-0 space-y-4">
        {activeDraft ? (
          <>
            <DraftNavigator
              drafts={draftResult.drafts}
              activeDraft={activeDraft}
              onSelectDraft={onSelectDraft}
            />
            <ProblemDraftDetail draft={activeDraft} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProblemDraftDetail({ draft }: { draft: NotebookProblemImportDraft }) {
  const content = draft.publicContent;
  return (
    <div className="space-y-4">
      {draft.validationErrors.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h3 className="font-semibold">Validation errors</h3>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {draft.validationErrors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{typeLabel(draft.type)}</Badge>
          <Badge variant={draft.validationErrors.length ? 'destructive' : 'outline'}>
            {draft.validationErrors.length ? '待修正' : 'schema 通过'}
          </Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">
          {draft.title}
        </h2>
        <h3 className="mt-5 text-sm font-semibold text-slate-900">题干</h3>
        <ProblemRichText content={draftStem(draft)} className="mt-3 text-slate-700" />
        <ProblemImageAssets content={content} className="mt-4" />
      </section>
      {content.type === 'choice' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">选项</h3>
          <div className="mt-3 grid gap-2">
            {content.options.map((option, index) => (
              <div
                key={`${draft.draftId}-${option.id}-${index}`}
                className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-950">{option.id}</span>
                <ProblemRichText content={option.label} className="min-w-0 flex-1 text-slate-700" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">评分信息</h3>
        <GradingPreview grading={draft.grading} />
      </section>
      {draft.validationErrors.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">原始 draft JSON</h3>
          <Textarea
            readOnly
            value={JSON.stringify(draft, null, 2)}
            className="mt-3 min-h-[260px] resize-y font-mono text-xs leading-5"
          />
        </section>
      ) : null}
    </div>
  );
}

function GradingPreview({ grading }: { grading: NotebookProblemImportDraft['grading'] }) {
  const blocks: Array<{ label: string; value: ReactNode }> = [];
  if (grading.type === 'choice') {
    blocks.push({ label: '正确选项', value: grading.correctOptionIds.join(', ') });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }
  if (grading.type === 'fill_blank') {
    blocks.push({
      label: '填空答案',
      value: grading.blanks
        .map((blank) => `${blank.id}: ${blank.acceptedAnswers.join(' / ')}`)
        .join('\n'),
    });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }
  if (grading.type === 'calculation') {
    if (grading.referenceAnswer) blocks.push({ label: '参考答案', value: grading.referenceAnswer });
    if (grading.acceptedForms.length) {
      blocks.push({ label: '可接受形式', value: grading.acceptedForms.join(' / ') });
    }
    if (typeof grading.tolerance === 'number')
      blocks.push({ label: '容差', value: grading.tolerance });
    if (grading.unit) blocks.push({ label: '单位', value: grading.unit });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }
  if (grading.type === 'short_answer') {
    if (grading.referenceAnswer) blocks.push({ label: '参考答案', value: grading.referenceAnswer });
    if (grading.rubric) blocks.push({ label: '评分要点', value: grading.rubric });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }
  if (grading.type === 'proof') {
    if (grading.referenceProof) blocks.push({ label: '参考证明', value: grading.referenceProof });
    if (grading.rubric) blocks.push({ label: '评分要点', value: grading.rubric });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }
  if (grading.type === 'code') {
    blocks.push({
      label: '发布条件',
      value: grading.publishRequirementsMet ? '已满足' : '未满足',
    });
    if (grading.analysis) blocks.push({ label: '解析', value: grading.analysis });
  }

  return (
    <div className="mt-3 grid gap-2">
      <Badge variant="outline" className="w-fit">
        {grading.type}
      </Badge>
      {blocks.length ? (
        blocks.map((block) => (
          <div
            key={block.label}
            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
          >
            <div className="text-xs font-semibold text-slate-500">{block.label}</div>
            <div className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">
              {typeof block.value === 'string' ? (
                <ProblemRichText content={block.value} className="text-slate-700" />
              ) : (
                block.value
              )}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm leading-6 text-slate-500">
          这个题型当前只需要最小评分结构，schema 通过即可。
        </p>
      )}
    </div>
  );
}
