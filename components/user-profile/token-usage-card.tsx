'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/lib/store/auth';
import { backendJson } from '@/lib/utils/backend-api';
import { formatCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { TokenUsageSpendChart } from './token-usage-spend-chart';

const USAGE_RECORDS_PAGE_SIZE = 8;

type UsageRecordRow = {
  id: string;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  estimatedCostCredits: number | null;
  createdAt: string;
};

type ProfileUsageResponse = {
  success: true;
  databaseEnabled: boolean;
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    estimatedCostCredits: number;
  };
  spendChart: {
    periodLabel: string;
    startDate: string;
    endDate: string;
    dates: Array<{
      date: string;
      label: string;
    }>;
    series: Array<{
      modelString: string;
      estimatedCostUsd: number;
      estimatedCostCredits: number;
      cumulativeEstimatedCostUsd: number[];
      cumulativeEstimatedCostCredits: number[];
    }>;
    totalEstimatedCostUsd: number;
    totalEstimatedCostCredits: number;
  };
  modelBreakdown: Array<{
    modelString: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
    estimatedCostCredits: number | null;
  }>;
  usageRecords: UsageRecordRow[];
  /** 全量最新一条（与明细表当前页无关） */
  latestRecord: UsageRecordRow | null;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatDateTime(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

type TokenCardVariant = 'card' | 'tab';

function RefreshTokenButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className="h-8 gap-1.5 text-xs"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      刷新
    </Button>
  );
}

export function TokenUsageAccountPanel({ variant = 'card' }: { variant?: TokenCardVariant }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [usage, setUsage] = useState<ProfileUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);
  const modelRows = [...(usage?.modelBreakdown ?? [])].sort((a, b) => {
    const costDiff = (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0);
    if (costDiff !== 0) return costDiff;
    if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
    return b.requestCount - a.requestCount;
  });
  const totalEstimatedCostUsd = usage?.summary.estimatedCostUsd ?? 0;

  const loadUsage = useCallback(async (page: number) => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(USAGE_RECORDS_PAGE_SIZE),
      });
      const response = await backendJson<ProfileUsageResponse>(`/api/profile/llm-usage?${qs.toString()}`);
      setUsage(response);
      setRecordsPage(response.pagination.page);
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : String(error));
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage(1);
  }, [loadUsage]);

  const body = (
    <div className={variant === 'card' ? 'mt-4 space-y-3' : 'space-y-3'}>
        {!isLoggedIn ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            登录后可以查看你自己的 token 用量趋势；本地体验模式下如已填写账号，也会按当前用户 ID
            统计。
          </div>
        ) : null}

        {usageError ? (
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            {usageError}
          </div>
        ) : null}

        {usage && !usage.databaseEnabled ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            当前环境未配置数据库，LLM 用量不会持久记录，所以这里暂时没有趋势数据。
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">总调用次数</div>
            <div className="mt-1 text-lg font-semibold">{formatNumber(usage?.summary.totalCalls ?? 0)}</div>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">总 Tokens</div>
            <div className="mt-1 text-lg font-semibold">{formatNumber(usage?.summary.totalTokens ?? 0)}</div>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">输入 Tokens</div>
            <div className="mt-1 text-lg font-semibold">{formatNumber(usage?.summary.totalInputTokens ?? 0)}</div>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">输出 Tokens</div>
            <div className="mt-1 text-lg font-semibold">{formatNumber(usage?.summary.totalOutputTokens ?? 0)}</div>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">预估扣费美元</div>
            <div className="mt-1 text-lg font-semibold">
              {formatUsdLabel(usage?.summary.estimatedCostUsd ?? 0)}
            </div>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">对应积分</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCreditsLabel(usage?.summary.estimatedCostCredits ?? 0)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-background/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="size-3.5" />
            最近一次使用
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {usage?.latestRecord?.modelString || '暂无记录'}
          </p>
        </div>

        <TokenUsageSpendChart data={usage?.spendChart} />

        <Separator />

        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">按模型花费明细</p>
            <p className="text-xs text-muted-foreground">
              现在会按模型展示调用次数、token、美元和积分，方便直接看出哪种模型最花钱
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">模型</th>
                  <th className="px-3 py-2 font-medium">次数</th>
                  <th className="px-3 py-2 font-medium">输入</th>
                  <th className="px-3 py-2 font-medium">输出</th>
                  <th className="px-3 py-2 font-medium">总 Tokens</th>
                  <th className="px-3 py-2 font-medium">花费占比</th>
                  <th className="px-3 py-2 font-medium">美元</th>
                  <th className="px-3 py-2 font-medium">积分</th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map((row) => {
                  const share =
                    totalEstimatedCostUsd > 0 && row.estimatedCostUsd != null
                      ? (row.estimatedCostUsd / totalEstimatedCostUsd) * 100
                      : 0;
                  return (
                  <tr key={row.modelString} className="border-t">
                    <td className="px-3 py-2 font-mono">{row.modelString}</td>
                    <td className="px-3 py-2">{formatNumber(row.requestCount)}</td>
                    <td className="px-3 py-2">{formatNumber(row.inputTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(row.outputTokens)}</td>
                    <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex min-w-[8rem] items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${Math.max(share, share > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-[11px] text-muted-foreground">
                          {formatPercent(share)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {row.estimatedCostUsd != null ? formatUsdLabel(row.estimatedCostUsd) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.estimatedCostCredits != null
                        ? formatCreditsLabel(row.estimatedCostCredits)
                        : '—'}
                    </td>
                  </tr>
                  );
                })}
                {modelRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={8}>
                      暂无模型用量记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">每次使用记录</p>
              <p className="text-xs text-muted-foreground">
                逐条记录每次调用用了什么模型，以及对应 token 明细
                {usage?.databaseEnabled
                  ? `，共 ${usage.pagination.totalCount} 条${usage.pagination.totalPages > 1 ? '，使用右侧按钮翻页。' : '。'}`
                  : '。'}
              </p>
            </div>
            {usage?.databaseEnabled && usage.pagination.totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={usageLoading || recordsPage <= 1}
                  onClick={() => void loadUsage(recordsPage - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[7.5rem] text-center text-[11px] text-muted-foreground tabular-nums">
                  {usage.pagination.totalCount === 0
                    ? '—'
                    : `第 ${usage.pagination.page} / ${usage.pagination.totalPages} 页`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={usageLoading || recordsPage >= usage.pagination.totalPages}
                  onClick={() => void loadUsage(recordsPage + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">模型</th>
                  <th className="px-3 py-2 font-medium">来源</th>
                  <th className="px-3 py-2 font-medium">输入</th>
                  <th className="px-3 py-2 font-medium">输出</th>
                  <th className="px-3 py-2 font-medium">总 Tokens</th>
                  <th className="px-3 py-2 font-medium">美元</th>
                  <th className="px-3 py-2 font-medium">积分</th>
                </tr>
              </thead>
              <tbody>
                {(usage?.usageRecords ?? []).map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{row.modelString}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{row.source}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.route}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{formatNumber(row.inputTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(row.outputTokens)}</td>
                    <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.estimatedCostUsd != null ? formatUsdLabel(row.estimatedCostUsd) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.estimatedCostCredits != null
                        ? formatCreditsLabel(row.estimatedCostCredits)
                        : '—'}
                    </td>
                  </tr>
                ))}
                {(usage?.usageRecords?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={8}>
                      暂无使用记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
  );

  if (variant === 'tab') {
    return (
      <>
        <div className="mb-2 flex flex-col items-end gap-1 sm:flex-row sm:items-start sm:justify-between">
          <p className="w-full text-left text-xs text-muted-foreground sm:order-first sm:max-w-[28rem]">
            按当前账号统计模型调用、token 变化与实际扣费估算，已含 50% 平台加价
          </p>
          <RefreshTokenButton loading={usageLoading} onClick={() => void loadUsage(recordsPage)} />
        </div>
        {body}
      </>
    );
  }

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Token 用量</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按当前账号统计模型调用、token 变化与实际扣费估算，已含 50% 平台加价
          </p>
        </div>
        <RefreshTokenButton loading={usageLoading} onClick={() => void loadUsage(recordsPage)} />
      </div>
      {body}
    </Card>
  );
}

export function TokenUsageCard() {
  return <TokenUsageAccountPanel variant="card" />;
}
