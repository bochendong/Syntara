'use client';

import { backendJson } from '@/lib/utils/backend-api';

export interface TestResultSummary {
  generatedCount?: number;
  errorCount?: number;
  lastUpdatedAt?: number | string | null;
  [key: string]: unknown;
}

export interface TestResultRow<TPayload = unknown> {
  id: string;
  testId: string;
  resultKey: string;
  status: string;
  title: string | null;
  summary: TestResultSummary | null;
  payload?: TPayload;
  payloadBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface TestResultsResponse<TPayload = unknown> {
  success?: boolean;
  databaseEnabled?: boolean;
  results?: TestResultRow<TPayload>[];
}

interface SaveTestResultResponse {
  success?: boolean;
  databaseEnabled?: boolean;
  result?: TestResultRow | null;
}

export async function listTestResults<TPayload = unknown>(args: {
  testIds?: string[];
  testId?: string;
  resultKey?: string;
  includePayload?: boolean;
  limit?: number;
  signal?: AbortSignal;
}): Promise<TestResultRow<TPayload>[]> {
  const params = new URLSearchParams();
  if (args.testIds?.length) params.set('testIds', args.testIds.join(','));
  if (args.testId) params.set('testId', args.testId);
  if (args.resultKey) params.set('resultKey', args.resultKey);
  if (args.includePayload) params.set('includePayload', '1');
  if (args.limit) params.set('limit', String(args.limit));

  const data = await backendJson<TestResultsResponse<TPayload>>(
    `/api/test-results?${params.toString()}`,
    { cache: 'no-store', signal: args.signal },
  );
  return data.results || [];
}

export async function loadTestResult<TPayload = unknown>(args: {
  testId: string;
  resultKey: string;
  signal?: AbortSignal;
}): Promise<TestResultRow<TPayload> | null> {
  const rows = await listTestResults<TPayload>({
    testId: args.testId,
    resultKey: args.resultKey,
    includePayload: true,
    limit: 1,
    signal: args.signal,
  });
  return rows[0] || null;
}

export async function saveTestResult<TPayload = unknown>(args: {
  testId: string;
  resultKey: string;
  status?: string;
  title?: string;
  summary?: TestResultSummary;
  payload: TPayload;
}): Promise<TestResultRow | null> {
  const data = await backendJson<SaveTestResultResponse>('/api/test-results', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      testId: args.testId,
      resultKey: args.resultKey,
      status: args.status || 'saved',
      title: args.title,
      summary: args.summary,
      payload: args.payload,
    }),
  });
  return data.result || null;
}
