'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/lib/store/auth';
import { backendJson } from '@/lib/utils/backend-api';

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
  };
  modelBreakdown: Array<{
    modelString: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
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

export function TokenUsageCard() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [usage, setUsage] = useState<ProfileUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);

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

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Token 用量</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">按当前账号统计模型调用与 token 变化</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadUsage(recordsPage)}
          disabled={usageLoading}
          className="h-8 gap-1.5 text-xs"
        >
          {usageLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          刷新
        </Button>
      </div>

      <div className="mt-4 space-y-3">
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

        <Separator />

        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">模型分布</p>
            <p className="text-xs text-muted-foreground">按模型汇总你所有调用的 token 和次数</p>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">模型</th>
                  <th className="px-3 py-2 font-medium">次数</th>
                  <th className="px-3 py-2 font-medium">总 Tokens</th>
                </tr>
              </thead>
              <tbody>
                {(usage?.modelBreakdown ?? []).slice(0, 8).map((row) => (
                  <tr key={row.modelString} className="border-t">
                    <td className="px-3 py-2 font-mono">{row.modelString}</td>
                    <td className="px-3 py-2">{formatNumber(row.requestCount)}</td>
                    <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                  </tr>
                ))}
                {(usage?.modelBreakdown?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={3}>
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
                  </tr>
                ))}
                {(usage?.usageRecords?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={6}>
                      暂无使用记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
