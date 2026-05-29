'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  FileQuestion,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { backendFetch } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';
import {
  fixtureKindLabel,
  formatFileSize,
  formatTime,
  mergeRun,
  MetricCard,
  pipelineModeLabel,
  QualityChecks,
  RenderReviewPanel,
  SourcePackagePanel,
  StepShell,
  StepSidebar,
  stepStateForMode,
  DirectLlmResultPanel,
} from './problem-import-test-panels';

import { getProblemImportTestHeaders } from '../lib/api';
import { readSavedState, writeSavedState } from '../lib/storage';
import {
  DIRECT_PIPELINE_TIMEOUT_MS,
  MAX_STORED_RUNS,
  PDF_LLM_TEST_MODEL,
  SAVED_STATE_READ_DELAY_MS,
  defaultStepIdForMode,
  normalizePipelineMode,
  normalizeStepIdForMode,
  testResultIdForPipelineMode,
  visibleStepIdsForMode,
  type FixturesResponse,
  type PipelineRun,
  type StepId,
  type StepResponse,
  type TestFixture,
} from '../lib/types';

export default function ProblemImportTestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 text-slate-950">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              正在加载导题测试...
            </div>
          </div>
        </main>
      }
    >
      <ProblemImportTestPageContent />
    </Suspense>
  );
}

function ProblemImportTestPageContent() {
  const searchParams = useSearchParams();
  const pipelineMode = normalizePipelineMode(
    searchParams.get('mode') || searchParams.get('pipeline'),
  );
  const testResultId = testResultIdForPipelineMode(pipelineMode);
  const [hydrated, setHydrated] = useState(false);
  const [fixtures, setFixtures] = useState<TestFixture[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<StepId>('draft-generation');
  const [runningStep, setRunningStep] = useState<StepId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stepAbortRef = useRef<AbortController | null>(null);
  const savedStateAbortRef = useRef<AbortController | null>(null);
  const selectedFixtureIdRef = useRef<string | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const selectedDraftIdRef = useRef<string | null>(null);
  const selectedStepIdRef = useRef<StepId>('draft-generation');
  const skippedInitialPersistRef = useRef(false);

  useEffect(() => {
    selectedDraftIdRef.current = selectedDraftId;
  }, [selectedDraftId]);

  useEffect(() => {
    selectedFixtureIdRef.current = selectedFixtureId;
  }, [selectedFixtureId]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

  useEffect(() => {
    selectedStepIdRef.current = selectedStepId;
  }, [selectedStepId]);

  useEffect(() => {
    setSelectedStepId((current) => normalizeStepIdForMode(current, pipelineMode));
  }, [pipelineMode]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: number | null = null;
    savedStateAbortRef.current?.abort();
    savedStateAbortRef.current = controller;
    setHydrated(false);
    skippedInitialPersistRef.current = false;
    timer = window.setTimeout(() => {
      void readSavedState(testResultId, pipelineMode, controller.signal)
        .then((saved) => {
          if (cancelled) return;
          setRuns(saved.runs);
          setSelectedFixtureId(saved.selectedFixtureId);
          setSelectedRunId(saved.selectedRunId ?? saved.runs[0]?.id ?? null);
          setSelectedDraftId(
            saved.selectedDraftId ?? saved.runs[0]?.draftResult?.drafts[0]?.draftId ?? null,
          );
          setSelectedStepId(normalizeStepIdForMode(saved.selectedStepId, pipelineMode));
        })
        .finally(() => {
          if (savedStateAbortRef.current === controller) {
            savedStateAbortRef.current = null;
          }
          if (!cancelled) setHydrated(true);
        });
    }, SAVED_STATE_READ_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      controller.abort();
      if (savedStateAbortRef.current === controller) {
        savedStateAbortRef.current = null;
      }
    };
  }, [pipelineMode, testResultId]);

  const loadFixtures = useCallback(async () => {
    setFixturesLoading(true);
    try {
      const response = await backendFetch('/api/problem-import-test/fixtures');
      const data = (await response.json().catch(() => ({}))) as FixturesResponse;
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const nextFixtures = Array.isArray(data.fixtures) ? data.fixtures : [];
      setFixtures(nextFixtures);
      setSelectedFixtureId(
        (current) =>
          current ||
          nextFixtures.find((fixture) => fixture.id === 'final-exam-long')?.id ||
          nextFixtures.find((fixture) => fixture.exists)?.id ||
          nextFixtures[0]?.id ||
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
    if (!skippedInitialPersistRef.current) {
      skippedInitialPersistRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void writeSavedState(testResultId, pipelineMode, {
        runs,
        selectedFixtureId: selectedFixtureIdRef.current,
        selectedRunId: selectedRunIdRef.current,
        selectedDraftId: selectedDraftIdRef.current,
        selectedStepId: selectedStepIdRef.current,
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, pipelineMode, runs, testResultId]);

  const activeFixture = useMemo(
    () =>
      fixtures.find((fixture) => fixture.id === selectedFixtureId) ||
      fixtures.find((fixture) => fixture.exists) ||
      fixtures[0] ||
      null,
    [fixtures, selectedFixtureId],
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || null,
    [runs, selectedRunId],
  );

  const stepStates = useMemo(
    () =>
      visibleStepIdsForMode(pipelineMode).map((stepId) => {
        const state = stepStateForMode(stepId, activeRun, runningStep, pipelineMode);
        const checks = stepId === 'quality-report' ? activeRun?.qualityReport?.checks || [] : [];
        return {
          id: stepId,
          state,
          failCount: checks.filter((check) => check.status === 'fail').length,
          warnCount: checks.filter((check) => check.status === 'warn').length,
        };
      }),
    [activeRun, pipelineMode, runningStep],
  );

  const totalDrafts = runs.reduce((sum, run) => sum + (run.draftResult?.drafts.length || 0), 0);
  const failCount = activeRun?.qualityReport?.blockingIssueCount || 0;
  const warnCount = activeRun?.qualityReport?.warningIssueCount || 0;
  const isRunning = Boolean(runningStep);

  const applyStepResponse = useCallback(
    (data: StepResponse, patchStep: StepId) => {
      if (!activeFixture && !data.fixture) return;
      const fixtureLike = data.fixture || activeFixture!;
      const fileSize = data.fileSize ?? activeFixture?.fileSize ?? activeRun?.fileSize ?? 0;
      const nextRun = mergeRun(activeRun, fixtureLike, fileSize, {
        sourcePackage: data.sourcePackage ?? activeRun?.sourcePackage,
        structurePlan: data.structurePlan ?? activeRun?.structurePlan,
        draftResult: data.draftResult ?? activeRun?.draftResult,
        qualityReport: data.qualityReport ?? activeRun?.qualityReport,
        pipelineMode: data.pipelineMode ?? activeRun?.pipelineMode ?? pipelineMode,
        createdAt: Date.now(),
      });
      setRuns((prev) =>
        [nextRun, ...prev.filter((run) => run.fixtureId !== nextRun.fixtureId)].slice(
          0,
          MAX_STORED_RUNS,
        ),
      );
      setSelectedFixtureId(nextRun.fixtureId);
      setSelectedRunId(nextRun.id);
      setSelectedDraftId(
        data.draftResult?.drafts[0]?.draftId ||
          nextRun.draftResult?.drafts[0]?.draftId ||
          selectedDraftId,
      );
      setSelectedStepId(normalizeStepIdForMode(patchStep, pipelineMode));
    },
    [activeFixture, activeRun, pipelineMode, selectedDraftId],
  );

  const handleCancelRunningStep = useCallback(() => {
    if (!runningStep) return;
    stepAbortRef.current?.abort();
    setErrorMessage('LLM 直读管线已停止，可以重新运行。');
    setRunningStep(null);
  }, [runningStep]);

  useEffect(() => {
    return () => {
      stepAbortRef.current?.abort();
    };
  }, []);

  const runDirectLlmPipeline = useCallback(async () => {
    if (!activeFixture?.exists || isRunning) return;
    stepAbortRef.current?.abort();
    const controller = new AbortController();
    stepAbortRef.current = controller;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, DIRECT_PIPELINE_TIMEOUT_MS);
    setRunningStep('draft-generation');
    setSelectedStepId('draft-generation');
    setErrorMessage(null);
    try {
      const response = await backendFetch(
        `/api/problem-import-test/fixtures/${encodeURIComponent(activeFixture.id)}/direct-llm`,
        {
          method: 'POST',
          headers: getProblemImportTestHeaders(),
          signal: controller.signal,
        },
      );
      const data = (await response.json().catch(() => ({}))) as StepResponse;
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      applyStepResponse({ ...data, pipelineMode: 'direct-llm' }, 'render-review');
    } catch (error) {
      if (controller.signal.aborted) {
        const seconds = Math.round(DIRECT_PIPELINE_TIMEOUT_MS / 1000);
        setErrorMessage(
          didTimeout
            ? `LLM 直读管线超过 ${seconds} 秒没有返回，已自动停止。可以重试，或换一个较小的 source fixture。`
            : 'LLM 直读管线已停止，可以重新运行。',
        );
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Direct LLM pipeline failed');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (stepAbortRef.current === controller) {
        stepAbortRef.current = null;
      }
      setRunningStep(null);
    }
  }, [activeFixture, applyStepResponse, isRunning]);

  const handleSelectFixture = useCallback(
    (fixture: TestFixture) => {
      const matchingRun = runs.find((run) => run.fixtureId === fixture.id) || null;
      setSelectedFixtureId(fixture.id);
      setSelectedRunId(matchingRun?.id || null);
      setSelectedDraftId(matchingRun?.draftResult?.drafts[0]?.draftId || null);
      setSelectedStepId(defaultStepIdForMode(pipelineMode));
      setErrorMessage(null);
    },
    [pipelineMode, runs],
  );

  const handleClearRuns = useCallback(() => {
    setRuns([]);
    setSelectedRunId(null);
    setSelectedDraftId(null);
    setSelectedStepId(defaultStepIdForMode(pipelineMode));
  }, [pipelineMode]);

  const handleLeaveTestPage = useCallback(() => {
    savedStateAbortRef.current?.abort();
    stepAbortRef.current?.abort();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div>
          <Link
            href="/test?surface=problems"
            prefetch
            onPointerDown={handleLeaveTestPage}
            onClick={handleLeaveTestPage}
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
                Problem Import Pipeline v2
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">导题 LLM 直读测试</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                让模型直接读取 PDF、判断题目边界并输出 drafts，再进入 QA
                和渲染复核；这条链路不依赖本地预切题。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="测试模型" value={PDF_LLM_TEST_MODEL} />
              <MetricCard
                label="fail gates"
                value={<span className={failCount ? 'text-red-600' : ''}>{failCount}</span>}
              />
              <MetricCard
                label="warn gates"
                value={<span className={warnCount ? 'text-amber-700' : ''}>{warnCount}</span>}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={totalDrafts > 0 ? 'secondary' : 'outline'}>
                已保存 {totalDrafts} 道题
              </Badge>
              <Badge variant={activeFixture?.exists ? 'outline' : 'destructive'}>
                {activeFixture ? activeFixture.fileName : '未选择 source'}
              </Badge>
              {activeRun?.qualityReport ? (
                <Badge variant={activeRun.qualityReport.passed ? 'secondary' : 'destructive'}>
                  QA {activeRun.qualityReport.passed ? 'pass' : 'fail'}
                </Badge>
              ) : null}
              {activeRun ? (
                <Badge variant={activeRun.pipelineMode === 'direct-llm' ? 'secondary' : 'outline'}>
                  {pipelineModeLabel(activeRun.pipelineMode)}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={fixturesLoading || isRunning}
                onClick={loadFixtures}
              >
                <RefreshCw className={cn('size-4', fixturesLoading && 'animate-spin')} />
                刷新 fixture
              </Button>
              <Button
                size="sm"
                disabled={!activeFixture?.exists || isRunning}
                onClick={runDirectLlmPipeline}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                跑 LLM 直读管线
              </Button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-normal text-slate-950">测试输入</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                自动扫描 testfile/questionBank；新增或删除题库文件后点刷新即可同步。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={isRunning}
              onClick={handleClearRuns}
            >
              <Trash2 className="size-3.5" />
              清空保存记录
            </Button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {fixturesLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 sm:col-span-2">
                <Loader2 className="size-4 animate-spin" />
                正在读取 questionBank
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
                      'min-h-[68px] min-w-0 rounded-lg border px-3 py-2 text-left transition disabled:pointer-events-none disabled:opacity-70',
                      selected
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <FileQuestion className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-950">
                            {fixture.title}
                          </span>
                          <Badge
                            variant={fixture.exists ? 'secondary' : 'destructive'}
                            className="shrink-0 px-1.5 py-0 text-[10px]"
                          >
                            {fixture.exists ? fixtureKindLabel(fixture.kind) : '缺失'}
                          </Badge>
                        </span>
                        <span className="mt-1 flex min-w-0 items-center gap-2 text-[11px] leading-4 text-slate-500">
                          <span className="truncate">{fixture.fileName}</span>
                          {fixture.exists ? (
                            <span className="shrink-0 text-slate-400">
                              {formatFileSize(fixture.fileSize)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {runs.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">
                最新测试记录（每个文件只保留一条）
              </h3>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setSelectedFixtureId(run.fixtureId);
                      setSelectedRunId(run.id);
                      setSelectedDraftId(run.draftResult?.drafts[0]?.draftId || null);
                      setSelectedStepId(run.draftResult ? 'render-review' : 'draft-generation');
                    }}
                    className={cn(
                      'min-w-[220px] rounded-lg border px-2.5 py-2 text-left transition',
                      run.id === activeRun?.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-950">
                          {run.fixtureTitle}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {fixtureKindLabel(run.fixtureKind)} ·{' '}
                          {pipelineModeLabel(run.pipelineMode)} ·{' '}
                          {run.draftResult?.drafts.length || 0} drafts · {formatTime(run.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={run.qualityReport?.passed ? 'secondary' : 'outline'}
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        <Save className="size-3" />
                        saved
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
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
          <StepSidebar
            steps={stepStates}
            selectedStepId={selectedStepId}
            mode={pipelineMode}
            onSelectStep={setSelectedStepId}
          />
          <div className="min-w-0">
            {selectedStepId === 'source-package' ? (
              <StepShell
                stepId="source-package"
                mode={pipelineMode}
                state={stepStateForMode('source-package', activeRun, runningStep, pipelineMode)}
                actionLabel={activeRun?.sourcePackage ? '重新跑 LLM 直读' : '跑 LLM 直读'}
                actionDisabled={!activeFixture?.exists || isRunning}
                onAction={() => void runDirectLlmPipeline()}
              >
                <SourcePackagePanel sourcePackage={activeRun?.sourcePackage} />
              </StepShell>
            ) : null}

            {selectedStepId === 'draft-generation' ? (
              <StepShell
                stepId="draft-generation"
                mode={pipelineMode}
                state={stepStateForMode('draft-generation', activeRun, runningStep, pipelineMode)}
                actionLabel={activeRun?.draftResult ? '重新跑 LLM 直读' : '跑 LLM 直读'}
                actionDisabled={!activeFixture?.exists || isRunning}
                onAction={() => void runDirectLlmPipeline()}
                onCancel={runningStep === 'draft-generation' ? handleCancelRunningStep : undefined}
              >
                <DirectLlmResultPanel
                  sourcePackage={activeRun?.sourcePackage}
                  structurePlan={activeRun?.structurePlan}
                  draftResult={activeRun?.draftResult}
                  activeDraftId={selectedDraftId}
                  onSelectDraft={setSelectedDraftId}
                />
              </StepShell>
            ) : null}

            {selectedStepId === 'quality-report' ? (
              <StepShell
                stepId="quality-report"
                mode={pipelineMode}
                state={stepStateForMode('quality-report', activeRun, runningStep, pipelineMode)}
                actionLabel="重新跑 LLM 直读"
                actionDisabled={!activeFixture?.exists || isRunning}
                onAction={() => void runDirectLlmPipeline()}
              >
                <QualityChecks report={activeRun?.qualityReport} />
              </StepShell>
            ) : null}

            {selectedStepId === 'render-review' ? (
              <StepShell
                stepId="render-review"
                mode={pipelineMode}
                state={stepStateForMode('render-review', activeRun, runningStep, pipelineMode)}
                actionLabel="重新跑 LLM 直读"
                actionDisabled={!activeFixture?.exists || isRunning}
                onAction={() => void runDirectLlmPipeline()}
              >
                <RenderReviewPanel
                  draftResult={activeRun?.draftResult}
                  activeDraftId={selectedDraftId}
                  onSelectDraft={setSelectedDraftId}
                />
              </StepShell>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
