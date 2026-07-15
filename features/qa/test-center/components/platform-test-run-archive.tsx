'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Database,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSettingsStore } from '@/lib/store/settings';
import {
  createTestResultKey,
  deleteTestResult,
  listTestResults,
  saveTestResult,
  type TestResultRow,
} from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';
import { DeleteTestRunDialog } from './delete-test-run-dialog';

type RunStatus = 'completed' | 'passed' | 'failed';

type PlatformTestRunPayload = {
  kind?: string;
  scenarioId?: string;
  input?: string;
  output?: string;
  notes?: string;
  provider?: string;
  model?: string;
  costUsd?: number | null;
  savedAt?: number;
  run?: { userMessage?: string; assistantReply?: string };
  costEstimate?: { retailUsd?: number | null };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function runPayload(row: TestResultRow<PlatformTestRunPayload>): PlatformTestRunPayload {
  return isRecord(row.payload) ? (row.payload as PlatformTestRunPayload) : {};
}

function runInput(row: TestResultRow<PlatformTestRunPayload>): string {
  const payload = runPayload(row);
  return payload.input || payload.run?.userMessage || '';
}

function runOutput(row: TestResultRow<PlatformTestRunPayload>): string {
  const payload = runPayload(row);
  return payload.output || payload.run?.assistantReply || '';
}

function runModel(row: TestResultRow<PlatformTestRunPayload>): string {
  const payload = runPayload(row);
  const summaryModel = typeof row.summary?.model === 'string' ? row.summary.model : '';
  return payload.model || summaryModel || '未记录模型';
}

function runCost(row: TestResultRow<PlatformTestRunPayload>): number | null {
  const payload = runPayload(row);
  if (typeof payload.costUsd === 'number') return payload.costUsd;
  if (typeof payload.costEstimate?.retailUsd === 'number') return payload.costEstimate.retailUsd;
  return typeof row.summary?.costUsd === 'number' ? row.summary.costUsd : null;
}

function formatSavedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '失败';
  return '已完成';
}

function statusClassName(status: string): string {
  if (status === 'passed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-sky-50 text-sky-700 ring-sky-200';
}

export function PlatformTestRunArchive({
  testId,
  title,
  defaultPrompt = '',
}: {
  testId: string;
  title: string;
  defaultPrompt?: string;
}) {
  const providerId = useSettingsStore((state) => state.providerId);
  const modelId = useSettingsStore((state) => state.modelId);
  const [runs, setRuns] = useState<TestResultRow<PlatformTestRunPayload>[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [input, setInput] = useState(defaultPrompt);
  const [output, setOutput] = useState('');
  const [notes, setNotes] = useState('');
  const [costUsd, setCostUsd] = useState('');
  const [status, setStatus] = useState<RunStatus>('completed');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [pendingDeleteRun, setPendingDeleteRun] =
    useState<TestResultRow<PlatformTestRunPayload> | null>(null);
  const [message, setMessage] = useState('');

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const rows = await listTestResults<PlatformTestRunPayload>({
          testId,
          includePayload: true,
          limit: 80,
          signal,
        });
        setRuns(rows);
        setSelectedRunId((current) => current || rows[0]?.id || null);
      } catch (error) {
        if (signal?.aborted) return;
        setMessage(error instanceof Error ? error.message : '测试结果读取失败。');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [testId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRuns(controller.signal);
    return () => controller.abort();
  }, [loadRuns]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  );

  const totalCost = useMemo(() => runs.reduce((sum, run) => sum + (runCost(run) || 0), 0), [runs]);
  const saveRun = async () => {
    const normalizedInput = input.trim();
    const normalizedOutput = output.trim();
    if (!normalizedInput && !normalizedOutput) {
      setMessage('至少填写测试输入或 AI 输出。');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const savedAt = Date.now();
      const parsedCost = costUsd.trim() ? Number(costUsd) : Number.NaN;
      const normalizedCost = Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : null;
      const savedRun = await saveTestResult({
        testId,
        resultKey: createTestResultKey('run'),
        status,
        title: `${title} · ${new Date(savedAt).toLocaleString('zh-CN')}`,
        summary: {
          generatedCount: normalizedOutput ? 1 : 0,
          errorCount: status === 'failed' ? 1 : 0,
          lastUpdatedAt: savedAt,
          provider: providerId,
          model: `${providerId}:${modelId}`,
          costUsd: normalizedCost,
        },
        payload: {
          kind: 'manual-platform-test-run',
          scenarioId: testId,
          input: normalizedInput,
          output: normalizedOutput,
          notes: notes.trim(),
          provider: providerId,
          model: `${providerId}:${modelId}`,
          costUsd: normalizedCost,
          savedAt,
        } satisfies PlatformTestRunPayload,
      });
      setOutput('');
      setNotes('');
      setCostUsd('');
      await loadRuns();
      if (savedRun?.id) setSelectedRunId(savedRun.id);
      setMessage('测试结果已保存到当前浏览器本地库，刷新或退出后仍可恢复。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '测试结果保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const deleteRun = async () => {
    const run = pendingDeleteRun;
    if (!run || deletingRunId || saving) return;

    setDeletingRunId(run.id);
    setMessage('');
    try {
      await deleteTestResult({ testId: run.testId, resultKey: run.resultKey });
      const remainingRuns = runs.filter((item) => item.id !== run.id);
      setRuns(remainingRuns);
      if (selectedRunId === run.id) setSelectedRunId(remainingRuns[0]?.id || null);
      setPendingDeleteRun(null);
      setMessage('已删除这条测试历史。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '测试历史删除失败。');
    } finally {
      setDeletingRunId(null);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby={`${testId}-archive-title`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
            <Archive className="size-4" />
            昂贵结果归档
          </div>
          <h2 id={`${testId}-archive-title`} className="mt-1 text-2xl font-semibold tracking-tight">
            测试运行与历史结果
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            每次运行独立保存，不覆盖旧结果；完整输入、输出、模型和费用可再次查看。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md bg-white">
            <Database className="size-3.5" />
            浏览器本地库
          </Badge>
          <Badge variant="outline" className="rounded-md bg-white font-mono">
            {runs.length} runs
          </Badge>
          <Badge variant="outline" className="rounded-md bg-white font-mono">
            ${totalCost.toFixed(4)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base tracking-normal">
              <Sparkles className="size-4 text-violet-600" />
              保存本次 AI 测试结果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${testId}-input`}>测试输入</Label>
              <Textarea
                id={`${testId}-input`}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="min-h-24 resize-y bg-slate-50"
                placeholder="记录上传文件、自然语言指令或测试 prompt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${testId}-output`}>完整 AI 输出</Label>
              <Textarea
                id={`${testId}-output`}
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                className="min-h-52 resize-y font-mono text-xs leading-6"
                placeholder="自动执行的流程会直接归档；从其他入口运行时，也可以把完整结果粘贴到这里保存。"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[180px_180px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor={`${testId}-status`}>验收状态</Label>
                <select
                  id={`${testId}-status`}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as RunStatus)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none"
                >
                  <option value="completed">已完成，待验收</option>
                  <option value="passed">通过</option>
                  <option value="failed">失败</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${testId}-cost`}>费用（USD）</Label>
                <Input
                  id={`${testId}-cost`}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={costUsd}
                  onChange={(event) => setCostUsd(event.target.value)}
                  placeholder="0.0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${testId}-notes`}>验收备注</Label>
                <Input
                  id={`${testId}-notes`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="记录质量问题或失败原因"
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                className={cn(
                  'text-sm',
                  message.includes('失败') ? 'text-rose-600' : 'text-slate-500',
                )}
              >
                {message || `当前模型：${providerId}:${modelId}`}
              </p>
              <Button type="button" onClick={saveRun} disabled={saving} className="rounded-lg">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                保存为新运行
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base tracking-normal">历史运行</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                正在恢复测试结果…
              </div>
            ) : runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                还没有已保存的运行。
              </div>
            ) : (
              <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className={cn(
                      'flex w-full items-stretch rounded-xl border text-left transition',
                      selectedRun?.id === run.id
                        ? 'border-violet-200 bg-violet-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedRunId(run.id)}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                            statusClassName(run.status),
                          )}
                        >
                          {statusLabel(run.status)}
                        </span>
                        <ChevronRight className="size-4 text-slate-400" />
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                        {runInput(run) || run.title || run.resultKey}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" />
                          {formatSavedAt(run.updatedAt)}
                        </span>
                        <span className="font-mono">{runModel(run)}</span>
                        {runCost(run) != null ? (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Coins className="size-3" />${runCost(run)?.toFixed(4)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`删除历史运行：${(runInput(run) || run.title || '测试运行').slice(0, 60)}`}
                      title="删除历史运行"
                      onClick={() => setPendingDeleteRun(run)}
                      disabled={saving || deletingRunId === run.id}
                      className="flex w-11 shrink-0 items-center justify-center rounded-r-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingRunId === run.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRun ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base tracking-normal">已保存结果详情</CardTitle>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                {selectedRun.status === 'failed' ? (
                  <XCircle className="size-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                <span>{formatSavedAt(selectedRun.updatedAt)}</span>
                <span className="font-mono">{selectedRun.payloadBytes} bytes</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Input
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 ring-1 ring-inset ring-slate-200">
                {runInput(selectedRun) || '未记录输入'}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                AI Output
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                {runOutput(selectedRun) || '未记录输出'}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <DeleteTestRunDialog
        open={Boolean(pendingDeleteRun)}
        runLabel={
          pendingDeleteRun
            ? (
                runInput(pendingDeleteRun) ||
                pendingDeleteRun.title ||
                pendingDeleteRun.resultKey
              ).slice(0, 120)
            : '未命名运行'
        }
        deleting={Boolean(deletingRunId)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRun(null);
        }}
        onConfirm={deleteRun}
      />
    </section>
  );
}
