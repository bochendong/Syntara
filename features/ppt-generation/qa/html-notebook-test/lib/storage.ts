import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';

import {
  LEGACY_STORAGE_KEY,
  TEST_RESULT_ID,
  TEST_RESULT_KEY,
  type HtmlSlideGenerationJob,
  type SavedState,
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function sanitizePersistedJobs(
  jobs: SavedState['jobsBySlide'],
): Record<string, HtmlSlideGenerationJob> {
  if (!jobs || !isRecord(jobs)) return {};
  return Object.fromEntries(
    Object.entries(jobs).filter(([, job]) => {
      if (!isRecord(job)) return false;
      return job.status !== 'queued' && job.status !== 'running';
    }),
  ) as Record<string, HtmlSlideGenerationJob>;
}

export function getCreatedAt(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const createdAt = value.createdAt;
  return typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : null;
}

export function summarizeSavedState(state: SavedState) {
  const plansByKey = isRecord(state.plansByKey) ? state.plansByKey : {};
  const htmlBySlide = isRecord(state.htmlBySlide) ? state.htmlBySlide : {};
  const errorsBySlide = isRecord(state.errorsBySlide) ? state.errorsBySlide : {};
  const planErrorsByKey = isRecord(state.planErrorsByKey) ? state.planErrorsByKey : {};
  const timestamps = [
    ...Object.values(plansByKey),
    ...Object.values(htmlBySlide),
    ...Object.values(errorsBySlide),
    ...Object.values(planErrorsByKey),
  ]
    .map(getCreatedAt)
    .filter((value): value is number => value !== null);

  return {
    generatedCount: Object.keys(htmlBySlide).length,
    errorCount: Object.keys(errorsBySlide).length + Object.keys(planErrorsByKey).length,
    planCount: Object.keys(plansByKey).length,
    lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

export function readLegacySavedState(): SavedState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedState;
    if (!isRecord(parsed)) return {};
    const state = parsed as SavedState;
    return {
      ...state,
      jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
    };
  } catch {
    return {};
  }
}

export async function readSavedState(): Promise<SavedState> {
  try {
    const row = await loadTestResult<SavedState>({
      testId: TEST_RESULT_ID,
      resultKey: TEST_RESULT_KEY,
    });
    if (row?.payload && isRecord(row.payload)) {
      const state = row.payload as SavedState;
      return {
        ...state,
        jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
      };
    }
  } catch {
    // Keep the QA page usable even if the test-result database endpoint is temporarily unavailable.
  }

  const legacyState = readLegacySavedState();
  if (Object.keys(legacyState).length === 0) return {};
  try {
    await writeSavedState(legacyState);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Leave the legacy copy in place if the database write fails.
  }
  return legacyState;
}

export async function writeSavedState(state: SavedState): Promise<void> {
  const sanitizedState = {
    ...state,
    jobsBySlide: sanitizePersistedJobs(state.jobsBySlide),
  };
  await saveTestResult({
    testId: TEST_RESULT_ID,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: 'HTML 整本笔记本生成测试',
    summary: summarizeSavedState(sanitizedState),
    payload: sanitizedState,
  });
}
