'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Cpu, Loader2, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { backendJson } from '@/lib/utils/backend-api';
import {
  formatComputeCreditsLabel,
  formatCashCreditsLabel,
  formatPurchaseCreditsLabel,
  formatUsdLabel,
  usdFromCredits,
} from '@/lib/utils/credits';

const TRANSACTION_PAGE_SIZE = 8;

type CreditsResponse = {
  success: true;
  databaseEnabled: boolean;
  balance: number;
  balances: {
    cash: number;
    compute: number;
    purchase: number;
  };
  recentTransactions: Array<{
    id: string;
    kind: string;
    accountType: 'CASH' | 'COMPUTE' | 'PURCHASE';
    delta: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

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

function formatAccountLabel(accountType: CreditsResponse['recentTransactions'][number]['accountType']) {
  switch (accountType) {
    case 'COMPUTE':
      return '算力积分';
    case 'PURCHASE':
      return '购买积分';
    default:
      return '现金积分';
  }
}

function formatAccountValue(
  accountType: CreditsResponse['recentTransactions'][number]['accountType'],
  value: number,
) {
  switch (accountType) {
    case 'COMPUTE':
      return formatComputeCreditsLabel(value);
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(value);
    default:
      return formatCashCreditsLabel(value);
  }
}

type CreditsCardVariant = 'card' | 'tab';

function RefreshCreditsButton({
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

export function CreditsAccountPanel({ variant = 'card' }: { variant?: CreditsCardVariant }) {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(1);

  const loadCredits = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(TRANSACTION_PAGE_SIZE),
      });
      const response = await backendJson<CreditsResponse>(`/api/profile/credits?${qs.toString()}`);
      setData(response);
      setTxPage(response.pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredits(1);
  }, [loadCredits]);

  const body = (
    <div className={variant === 'card' ? 'mt-4 space-y-3' : 'space-y-3'}>
        {error ? (
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            {error}
          </div>
        ) : null}

        {!data?.databaseEnabled ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            当前环境未配置数据库，credits 余额无法持久记录，下面显示的是默认值。
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-200">
              <Wallet className="size-4" />
              现金积分
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {data?.balances.cash ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">credits</div>
            <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              {formatUsdLabel(usdFromCredits(data?.balances.cash ?? 0))}
            </div>
          </div>
          <div className="rounded-2xl border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-sky-700 dark:text-sky-200">
              <Cpu className="size-4" />
              算力积分
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {data?.balances.compute ?? 0}
            </div>
            <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              100 分 = {formatUsdLabel(1)}，约支持 200 轮赠送对话预算
            </div>
          </div>
          <div className="rounded-2xl border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
              <ShoppingBag className="size-4" />
              购买积分
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {data?.balances.purchase ?? 0}
            </div>
            <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              可用于购买课程或商城笔记本
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">最近积分流水</p>
              <p className="text-xs text-muted-foreground">
                查看扣费、收益和欢迎赠送记录
                {data?.databaseEnabled
                  ? `，共 ${data.pagination.totalCount} 条${data.pagination.totalPages > 1 ? '，使用右侧按钮翻页。' : '。'}`
                  : '。'}
              </p>
            </div>
            {data?.databaseEnabled && data.pagination.totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={loading || txPage <= 1}
                  onClick={() => void loadCredits(txPage - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[7.5rem] text-center text-[11px] text-muted-foreground tabular-nums">
                  {data.pagination.totalCount === 0
                    ? '—'
                    : `第 ${data.pagination.page} / ${data.pagination.totalPages} 页`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={loading || txPage >= data.pagination.totalPages}
                  onClick={() => void loadCredits(txPage + 1)}
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
                  <th className="px-3 py-2 font-medium">账户</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">变动</th>
                  <th className="px-3 py-2 font-medium">余额</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentTransactions ?? []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">{formatAccountLabel(row.accountType)}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{row.description || row.kind}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.kind}</div>
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-medium ${row.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {row.delta >= 0
                        ? `+${formatAccountValue(row.accountType, row.delta)}`
                        : `-${formatAccountValue(row.accountType, Math.abs(row.delta))}`}
                    </td>
                    <td className="px-3 py-2">{formatAccountValue(row.accountType, row.balanceAfter)}</td>
                  </tr>
                ))}
                {(data?.recentTransactions.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={5}>
                      暂无积分流水
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
        <div className="mb-2 flex justify-end">
          <RefreshCreditsButton loading={loading} onClick={() => void loadCredits(txPage)} />
        </div>
        {body}
      </>
    );
  }

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <h2 className="text-base font-semibold text-foreground">Credits 余额</h2>
        <RefreshCreditsButton loading={loading} onClick={() => void loadCredits(txPage)} />
      </div>
      {body}
    </Card>
  );
}

export function CreditsCard() {
  return <CreditsAccountPanel variant="card" />;
}
