'use client';

import { backendFetch, backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptRecord,
  NotebookProblemImportDraft,
  NotebookProblemGrading,
  NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import type { ReviewProblemInsertInput } from '@/lib/problem-bank/review-problem-insert';

export type NotebookProblemClientRecord = {
  id: string;
  courseId?: string | null;
  notebookId?: string | null;
  notebookName?: string;
  title: string;
  type: NotebookProblemPublicContent['type'];
  status: 'draft' | 'published' | 'archived';
  source: 'chat' | 'pdf' | 'manual' | 'web' | 'legacy_quiz_scene';
  order: number;
  problemNumber?: number | null;
  points: number;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  publicContent: NotebookProblemPublicContent;
  grading: NotebookProblemGrading;
  sourceMeta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  latestAttempt?: {
    id: string;
    status: 'pending' | 'passed' | 'failed' | 'partial' | 'error';
    score?: number | null;
    createdAt: number;
  } | null;
};

export type ProblemImportBatchClientRecord = {
  id: string;
  status: 'previewed' | 'committed' | 'cancelled';
  source: 'chat' | 'pdf' | 'manual' | 'web' | string;
  draftCount: number;
  committedCount: number;
  sourceFileName?: string | null;
  createdAt: string;
};

function withModelHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers || {});
  const mc = getCurrentModelConfig();
  if (mc.modelString && !next.has('x-model')) next.set('x-model', mc.modelString);
  if (mc.apiKey && !next.has('x-api-key')) next.set('x-api-key', mc.apiKey);
  if (mc.baseUrl && !next.has('x-base-url')) next.set('x-base-url', mc.baseUrl);
  if (mc.providerType && !next.has('x-provider-type')) next.set('x-provider-type', mc.providerType);
  if (mc.requiresApiKey && !next.has('x-requires-api-key')) next.set('x-requires-api-key', 'true');
  return next;
}

export async function listNotebookProblems(
  notebookId: string,
): Promise<NotebookProblemClientRecord[]> {
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/problems`,
  );
  return data.problems;
}

export async function listCourseProblems(courseId: string): Promise<NotebookProblemClientRecord[]> {
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/problems`,
  );
  return data.problems;
}

export async function insertNotebookReviewProblems(args: {
  notebookId: string;
  problems: ReviewProblemInsertInput[];
}): Promise<{ insertedCount: number; problems: NotebookProblemClientRecord[] }> {
  return backendJson<{ insertedCount: number; problems: NotebookProblemClientRecord[] }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problems: args.problems }),
    },
  );
}

export async function insertNotebookReviewProblem(args: {
  notebookId: string;
  problem: ReviewProblemInsertInput;
}): Promise<{ insertedCount: number; problems: NotebookProblemClientRecord[] }> {
  return backendJson<{ insertedCount: number; problems: NotebookProblemClientRecord[] }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem: args.problem }),
    },
  );
}

export async function getNotebookProblem(
  notebookId: string,
  problemId: string,
): Promise<NotebookProblemClientRecord> {
  const data = await backendJson<{ problem: NotebookProblemClientRecord }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/problems/${encodeURIComponent(problemId)}`,
  );
  return data.problem;
}

export async function listNotebookProblemAttempts(
  notebookId: string,
  problemId: string,
): Promise<NotebookProblemAttemptRecord[]> {
  const data = await backendJson<{ attempts: NotebookProblemAttemptRecord[] }>(
    `/api/notebooks/${encodeURIComponent(notebookId)}/problems/${encodeURIComponent(problemId)}/attempts`,
  );
  return data.attempts;
}

export async function previewNotebookProblemImport(args: {
  notebookId: string;
  source: 'chat' | 'pdf' | 'manual' | 'web';
  text?: string;
  searchQuery?: string;
  webSearchApiKey?: string;
  sourceFileName?: string;
  sourceFileMime?: string;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
  notebooks?: Array<{ id: string; name: string }>;
  webSearch: {
    query: string;
    sourceCount: number;
    estimatedCostCredits: number;
    sources: Array<{ title: string; url: string }>;
  } | null;
  importBatch?: ProblemImportBatchClientRecord;
}> {
  const response = await backendFetch(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/import-preview`,
    {
      method: 'POST',
      headers: withModelHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        source: args.source,
        text: args.text || '',
        searchQuery: args.searchQuery,
        webSearchApiKey: args.webSearchApiKey,
        sourceFileName: args.sourceFileName,
        sourceFileMime: args.sourceFileMime,
        language: args.language,
      }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return (await response.json()) as {
    drafts: NotebookProblemImportDraft[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      estimatedCostCredits: number | null;
    } | null;
    notebooks?: Array<{ id: string; name: string }>;
    webSearch: {
      query: string;
      sourceCount: number;
      estimatedCostCredits: number;
      sources: Array<{ title: string; url: string }>;
    } | null;
    importBatch?: ProblemImportBatchClientRecord;
  };
}

export async function previewCourseProblemImport(args: {
  courseId: string;
  source: 'chat' | 'pdf' | 'manual' | 'web';
  text?: string;
  searchQuery?: string;
  webSearchApiKey?: string;
  sourceFileName?: string;
  sourceFileMime?: string;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
  notebooks: Array<{ id: string; name: string }>;
  webSearch: {
    query: string;
    sourceCount: number;
    estimatedCostCredits: number;
    sources: Array<{ title: string; url: string }>;
  } | null;
  importBatch?: ProblemImportBatchClientRecord;
}> {
  const response = await backendFetch(
    `/api/courses/${encodeURIComponent(args.courseId)}/problems/import-preview`,
    {
      method: 'POST',
      headers: withModelHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        source: args.source,
        text: args.text || '',
        searchQuery: args.searchQuery,
        webSearchApiKey: args.webSearchApiKey,
        sourceFileName: args.sourceFileName,
        sourceFileMime: args.sourceFileMime,
        language: args.language,
      }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return (await response.json()) as {
    drafts: NotebookProblemImportDraft[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      estimatedCostCredits: number | null;
    } | null;
    notebooks: Array<{ id: string; name: string }>;
    webSearch: {
      query: string;
      sourceCount: number;
      estimatedCostCredits: number;
      sources: Array<{ title: string; url: string }>;
    } | null;
    importBatch?: ProblemImportBatchClientRecord;
  };
}

export async function commitNotebookProblemImport(args: {
  notebookId: string;
  drafts: NotebookProblemImportDraft[];
  importBatchId?: string | null;
}): Promise<NotebookProblemClientRecord[]> {
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/import-commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drafts: args.drafts, importBatchId: args.importBatchId || undefined }),
    },
  );
  return data.problems;
}

export async function updateNotebookProblem(args: {
  notebookId: string;
  problemId: string;
  patch: {
    title?: string;
    status?: 'draft' | 'published' | 'archived';
    points?: number;
    order?: number;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    publicContent?: unknown;
    grading?: unknown;
    secretJudge?: unknown | null;
  };
}): Promise<NotebookProblemClientRecord> {
  const data = await backendJson<{ problem: NotebookProblemClientRecord }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.patch),
    },
  );
  return data.problem;
}

export async function commitCourseProblemImport(args: {
  courseId: string;
  drafts: NotebookProblemImportDraft[];
  importBatchId?: string | null;
}): Promise<NotebookProblemClientRecord[]> {
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/courses/${encodeURIComponent(args.courseId)}/problems/import-commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drafts: args.drafts, importBatchId: args.importBatchId || undefined }),
    },
  );
  return data.problems;
}

export async function updateCourseProblem(args: {
  courseId: string;
  problemId: string;
  patch: {
    notebookId?: string | null;
    title?: string;
    status?: 'draft' | 'published' | 'archived';
    points?: number;
    order?: number;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    publicContent?: unknown;
    grading?: unknown;
    secretJudge?: unknown | null;
  };
}): Promise<NotebookProblemClientRecord> {
  const data = await backendJson<{ problem: NotebookProblemClientRecord }>(
    `/api/courses/${encodeURIComponent(args.courseId)}/problems/${encodeURIComponent(args.problemId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.patch),
    },
  );
  return data.problem;
}

export async function deleteNotebookProblem(args: { notebookId: string; problemId: string }) {
  return backendJson<{ ok: true }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function deleteCourseProblem(args: { courseId: string; problemId: string }) {
  return backendJson<{ ok: true }>(
    `/api/courses/${encodeURIComponent(args.courseId)}/problems/${encodeURIComponent(args.problemId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function runNotebookCodeProblem(args: {
  notebookId: string;
  problemId: string;
  code: string;
}) {
  return backendJson<{
    attempt: NotebookProblemAttemptRecord;
    result: NotebookProblemAttemptRecord['result'];
  }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}/attempts/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: args.code }),
    },
  );
}

export async function submitNotebookProblem(args: {
  notebookId: string;
  problemId: string;
  text?: string;
  selectedOptionIds?: string[];
  blanks?: Record<string, string>;
  code?: string;
  images?: NotebookProblemAttemptAnswer['images'];
  language: 'zh-CN' | 'en-US';
}) {
  return backendJson<{
    attempt: NotebookProblemAttemptRecord;
    result: NotebookProblemAttemptRecord['result'];
  }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}/attempts/submit`,
    {
      method: 'POST',
      headers: withModelHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    },
  );
}
