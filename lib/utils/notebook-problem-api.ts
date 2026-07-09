'use client';

import { backendFetch, backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptRecord,
  NotebookProblemImportDraft,
  NotebookProblemGrading,
  NotebookProblemPublicContent,
  NotebookProblemSecretJudge,
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
  secretJudge?: NotebookProblemSecretJudge;
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

export type CourseProblemClientSummary = Pick<
  NotebookProblemClientRecord,
  | 'id'
  | 'courseId'
  | 'notebookId'
  | 'notebookName'
  | 'title'
  | 'type'
  | 'status'
  | 'tags'
  | 'difficulty'
  | 'latestAttempt'
>;

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

export async function getCourseProblem(
  courseId: string,
  problemId: string,
  options: { lean?: boolean } = {},
): Promise<NotebookProblemClientRecord> {
  const query = options.lean ? '?lean=1' : '';
  const data = await backendJson<{ problem: NotebookProblemClientRecord }>(
    `/api/courses/${encodeURIComponent(courseId)}/problems/${encodeURIComponent(problemId)}${query}`,
  );
  return data.problem;
}

export async function listCourseProblemsByIds(
  courseId: string,
  problemIds: string[],
): Promise<NotebookProblemClientRecord[]> {
  const uniqueIds = Array.from(new Set(problemIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const params = new URLSearchParams({
    ids: uniqueIds.join(','),
    lean: '1',
  });
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/problems?${params.toString()}`,
  );
  const problems = data.problems;
  return uniqueIds
    .map((problemId) => problems.find((problem) => problem.id === problemId))
    .filter((problem): problem is NotebookProblemClientRecord => Boolean(problem));
}

function dedupeProblemsById(
  problems: NotebookProblemClientRecord[],
): NotebookProblemClientRecord[] {
  const seen = new Set<string>();
  const deduped: NotebookProblemClientRecord[] = [];
  for (const problem of problems) {
    if (seen.has(problem.id)) continue;
    seen.add(problem.id);
    deduped.push(problem);
  }
  return deduped;
}

export async function listReviewNotebookProblems(args: {
  notebookId: string;
  courseId?: string | null;
}): Promise<NotebookProblemClientRecord[]> {
  const notebookProblems = listNotebookProblems(args.notebookId);
  if (!args.courseId) return notebookProblems;

  const [notebookResult, courseResult] = await Promise.allSettled([
    notebookProblems,
    listCourseProblems(args.courseId),
  ]);
  if (notebookResult.status === 'rejected' && courseResult.status === 'rejected') {
    throw notebookResult.reason;
  }
  const notebookScopedProblems = notebookResult.status === 'fulfilled' ? notebookResult.value : [];
  const courseScopedProblems =
    courseResult.status === 'fulfilled'
      ? courseResult.value.filter(
          (problem) => !problem.notebookId || problem.notebookId === args.notebookId,
        )
      : [];
  return dedupeProblemsById([...notebookScopedProblems, ...courseScopedProblems]);
}

export async function listCourseProblemSummaries(
  courseId: string,
  options?: { lean?: boolean },
): Promise<CourseProblemClientSummary[]> {
  const params = new URLSearchParams({ summary: '1' });
  if (options?.lean) params.set('lean', '1');
  const data = await backendJson<{ problems: CourseProblemClientSummary[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/problems?${params.toString()}`,
  );
  return data.problems;
}

export async function generateCourseProblemsFromContent(args: {
  courseId: string;
  topic: string;
  count?: number;
  courseName?: string;
  courseCode?: string;
  sourceSnippets?: string[];
  commit?: boolean;
}): Promise<{
  generatedCount: number;
  committed: boolean;
  drafts: NotebookProblemImportDraft[];
  problems?: NotebookProblemClientRecord[];
  generation: {
    agent: string;
    mode: string;
    topic: string;
    runId?: string;
  };
}> {
  return backendJson<{
    generatedCount: number;
    committed: boolean;
    drafts: NotebookProblemImportDraft[];
    problems?: NotebookProblemClientRecord[];
    generation: {
      agent: string;
      mode: string;
      topic: string;
      runId?: string;
    };
  }>(`/api/courses/${encodeURIComponent(args.courseId)}/problems/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: args.topic,
      count: args.count,
      courseName: args.courseName,
      courseCode: args.courseCode,
      sourceSnippets: args.sourceSnippets || [],
      commit: args.commit ?? true,
    }),
  });
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
  target?: 'code' | 'public' | 'secret';
  language?: 'zh-CN' | 'en-US';
}) {
  return backendJson<{
    attempt: NotebookProblemAttemptRecord;
    result: NotebookProblemAttemptRecord['result'];
  }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}/attempts/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: args.code, target: args.target, language: args.language }),
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
  return runQueuedAiTask(
    {
      kind: 'problem-evaluation',
      title: '题目判断正误',
      description: '正在评估你的作答并生成反馈',
    },
    ({ signal }) =>
      backendJson<{
        attempt: NotebookProblemAttemptRecord;
        result: NotebookProblemAttemptRecord['result'];
      }>(
        `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/${encodeURIComponent(args.problemId)}/attempts/submit`,
        {
          method: 'POST',
          headers: withModelHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(args),
          signal,
        },
      ),
  );
}

export async function submitCourseProblem(args: {
  courseId: string;
  problemId: string;
  text?: string;
  selectedOptionIds?: string[];
  blanks?: Record<string, string>;
  code?: string;
  images?: NotebookProblemAttemptAnswer['images'];
  language: 'zh-CN' | 'en-US';
}) {
  return runQueuedAiTask(
    {
      kind: 'problem-evaluation',
      title: '题目判断正误',
      description: '正在评估你的作答并更新学习进度',
    },
    ({ signal }) =>
      backendJson<{
        attempt: NotebookProblemAttemptRecord;
        result: NotebookProblemAttemptRecord['result'];
      }>(
        `/api/courses/${encodeURIComponent(args.courseId)}/problems/${encodeURIComponent(args.problemId)}/attempts/submit`,
        {
          method: 'POST',
          headers: withModelHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(args),
          signal,
        },
      ),
  );
}

export async function selfReportCourseProblem(args: {
  courseId: string;
  problemId: string;
  status: 'passed' | 'partial' | 'failed';
  text?: string;
  selectedOptionIds?: string[];
  blanks?: Record<string, string>;
  code?: string;
}) {
  return backendJson<{
    attempt: NotebookProblemAttemptRecord;
    result: NotebookProblemAttemptRecord['result'];
  }>(
    `/api/courses/${encodeURIComponent(args.courseId)}/problems/${encodeURIComponent(args.problemId)}/attempts/self-report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    },
  );
}
