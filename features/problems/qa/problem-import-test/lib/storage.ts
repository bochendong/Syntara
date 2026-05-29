import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';

import {
  MAX_STORED_RUNS,
  STEP_LABELS,
  TEST_RESULT_KEY,
  normalizeStepIdForMode,
  type PipelineMode,
  type PipelineRun,
  type SavedState,
  type StepId,
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function emptySavedState(): SavedState {
  return {
    runs: [],
    selectedFixtureId: null,
    selectedRunId: null,
    selectedDraftId: null,
    selectedStepId: 'draft-generation',
  };
}

export function latestRunsByFixture(runs: PipelineRun[]): PipelineRun[] {
  const byFixture = new Map<string, PipelineRun>();
  for (const run of [...runs].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!run.fixtureId || byFixture.has(run.fixtureId)) continue;
    byFixture.set(run.fixtureId, run);
  }
  return Array.from(byFixture.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function sanitizeSavedState(value: unknown): SavedState {
  if (!isRecord(value)) return emptySavedState();
  const runs = latestRunsByFixture(Array.isArray(value.runs) ? (value.runs as PipelineRun[]) : []);
  const selectedStepId =
    typeof value.selectedStepId === 'string' && value.selectedStepId in STEP_LABELS
      ? (value.selectedStepId as StepId)
      : 'draft-generation';
  return {
    runs: runs.slice(0, MAX_STORED_RUNS),
    selectedFixtureId: typeof value.selectedFixtureId === 'string' ? value.selectedFixtureId : null,
    selectedRunId:
      typeof value.selectedRunId === 'string' && runs.some((run) => run.id === value.selectedRunId)
        ? value.selectedRunId
        : null,
    selectedDraftId: typeof value.selectedDraftId === 'string' ? value.selectedDraftId : null,
    selectedStepId,
  };
}

export function savedStateForPipelineMode(state: SavedState, mode: PipelineMode): SavedState {
  const runs = latestRunsByFixture(
    state.runs.filter((run) => (run.pipelineMode || 'direct-llm') === mode),
  );
  const selectedRunId =
    state.selectedRunId && runs.some((run) => run.id === state.selectedRunId)
      ? state.selectedRunId
      : (runs[0]?.id ?? null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  return {
    ...state,
    runs,
    selectedRunId,
    selectedStepId: normalizeStepIdForMode(state.selectedStepId, mode),
    selectedDraftId: selectedRun?.draftResult?.drafts.some(
      (draft) => draft.draftId === state.selectedDraftId,
    )
      ? state.selectedDraftId
      : (selectedRun?.draftResult?.drafts[0]?.draftId ?? null),
  };
}

export function summarizeSavedState(state: SavedState) {
  const draftCount = state.runs.reduce(
    (sum, run) => sum + (run.draftResult?.drafts.length || 0),
    0,
  );
  const failCount = state.runs.reduce(
    (sum, run) => sum + (run.qualityReport?.blockingIssueCount || 0),
    0,
  );
  return {
    runCount: state.runs.length,
    generatedCount: draftCount,
    errorCount: failCount,
    lastUpdatedAt:
      state.runs.length > 0 ? Math.max(...state.runs.map((run) => run.createdAt)) : null,
  };
}

export async function readSavedState(
  testResultId: string,
  mode: PipelineMode,
  signal?: AbortSignal,
): Promise<SavedState> {
  try {
    const row = await loadTestResult<SavedState>({
      testId: testResultId,
      resultKey: TEST_RESULT_KEY,
      signal,
    });
    if (row?.payload) return savedStateForPipelineMode(sanitizeSavedState(row.payload), mode);
  } catch {
    // Keep the QA page usable if test result persistence is unavailable.
  }
  return emptySavedState();
}

export async function writeSavedState(
  testResultId: string,
  mode: PipelineMode,
  next: SavedState,
): Promise<void> {
  const state = {
    ...next,
    runs: latestRunsByFixture(
      next.runs.filter((run) => (run.pipelineMode || 'direct-llm') === mode),
    ).slice(0, MAX_STORED_RUNS),
  };
  await saveTestResult({
    testId: testResultId,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: 'Problem Import Pipeline v2 · LLM 直读',
    summary: { ...summarizeSavedState(state), pipelineMode: mode },
    payload: state,
  });
}
