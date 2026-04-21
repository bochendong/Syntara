'use client';

import { backendFetch, backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type {
  NotebookProblemAttemptRecord,
  NotebookProblemImportDraft,
  NotebookProblemPublicContent,
} from '@/lib/problem-bank';

export type NotebookProblemClientRecord = {
  id: string;
  notebookId: string;
  title: string;
  type: NotebookProblemPublicContent['type'];
  status: 'draft' | 'published' | 'archived';
  source: 'chat' | 'pdf' | 'manual' | 'legacy_quiz_scene';
  order: number;
  points: number;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  publicContent: NotebookProblemPublicContent;
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
  source: 'chat' | 'pdf' | 'manual';
  text: string;
  language: 'zh-CN' | 'en-US';
}): Promise<NotebookProblemImportDraft[]> {
  const response = await backendFetch(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/import-preview`,
    {
      method: 'POST',
      headers: withModelHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        source: args.source,
        text: args.text,
        language: args.language,
      }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  const data = (await response.json()) as { drafts: NotebookProblemImportDraft[] };
  return data.drafts;
}

export async function commitNotebookProblemImport(args: {
  notebookId: string;
  drafts: NotebookProblemImportDraft[];
}): Promise<NotebookProblemClientRecord[]> {
  const data = await backendJson<{ problems: NotebookProblemClientRecord[] }>(
    `/api/notebooks/${encodeURIComponent(args.notebookId)}/problems/import-commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drafts: args.drafts }),
    },
  );
  return data.problems;
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
