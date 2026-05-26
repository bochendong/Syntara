'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Coins, Wallet } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { backendJson } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';
import { formatCashCreditsLabel, formatPurchaseCreditsLabel } from '@/lib/utils/credits';

interface PurchaseConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemTypeLabel: '课程' | '笔记本';
  itemName: string;
  creditsCost: number;
  accountType?: 'PURCHASE' | 'CASH';
  countSummary?: string;
  note?: string;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
}

type CreditsBalanceResponse = {
  success: true;
  balance: number;
  balances: {
    cash: number;
    purchase: number;
  };
};

function formatBalanceLabel(value: number, accountType: 'PURCHASE' | 'CASH') {
  return accountType === 'PURCHASE'
    ? formatPurchaseCreditsLabel(value)
    : formatCashCreditsLabel(value);
}

export function PurchaseConfirmDialog({
  open,
  onOpenChange,
  itemTypeLabel,
  itemName,
  creditsCost,
  accountType = 'PURCHASE',
  countSummary,
  note,
  busy = false,
  confirmLabel,
  onConfirm,
}: PurchaseConfirmDialogProps) {
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void backendJson<CreditsBalanceResponse>('/api/profile/credits?pageSize=1')
      .then((response) => {
        if (cancelled) return;
        setCreditsBalance(
          accountType === 'PURCHASE' ? response.balances.purchase : response.balance,
        );
        setBalanceError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setCreditsBalance(null);
        setBalanceError(error instanceof Error ? error.message : '读取余额失败');
      });

    return () => {
      cancelled = true;
    };
  }, [accountType, open]);

  const loadingBalance = open && creditsBalance == null && balanceError == null;
  const nextBalance = useMemo(() => {
    if (creditsBalance == null) return null;
    return creditsBalance - creditsCost;
  }, [creditsBalance, creditsCost]);

  const insufficient = nextBalance != null && nextBalance < 0;
  const effectiveConfirmLabel =
    confirmLabel || (creditsCost > 0 ? `确认购买${itemTypeLabel}` : `确认领取${itemTypeLabel}`);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[32rem] overflow-y-auto rounded-[24px] border-white/60 bg-[rgba(255,255,255,0.92)] p-0 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-[rgba(18,22,31,0.94)]">
        <div className="p-5 sm:p-6 md:p-7">
          <AlertDialogHeader className="items-start text-left">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-sky-300/50 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/12 dark:text-sky-200">
              <Coins className="size-5" strokeWidth={1.8} />
            </div>
            <AlertDialogTitle className="text-[1.35rem] font-semibold text-slate-950 dark:text-white">
              购买确认
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
              你即将购买{itemTypeLabel}
              <span className="font-semibold text-slate-950 dark:text-white">「{itemName}」</span>。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-6 rounded-[24px] border border-white/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Wallet className="size-4" />
                当前余额
              </span>
              <span className="font-semibold text-slate-950 dark:text-white">
                {loadingBalance
                  ? '读取中…'
                  : creditsBalance != null
                    ? formatBalanceLabel(creditsBalance, accountType)
                    : '暂时无法读取'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 py-2 text-sm dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">本次扣除</span>
              <span
                className={cn(
                  'font-semibold',
                  creditsCost > 0
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-emerald-600 dark:text-emerald-300',
                )}
              >
                {creditsCost > 0 ? `-${formatBalanceLabel(creditsCost, accountType)}` : '0'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 py-2 text-sm dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">购买后余额</span>
              <span
                className={cn(
                  'font-semibold',
                  insufficient
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-slate-950 dark:text-white',
                )}
              >
                {loadingBalance
                  ? '计算中…'
                  : nextBalance != null
                    ? formatBalanceLabel(Math.max(0, nextBalance), accountType)
                    : '购买后更新'}
              </span>
            </div>
          </div>

          {countSummary ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{countSummary}</p>
          ) : null}
          {note ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{note}</p> : null}

          {balanceError ? (
            <div className="mt-4 rounded-[20px] border border-amber-300/70 bg-amber-50/90 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              {balanceError}。你仍然可以继续购买，实际扣费结果以后端校验为准。
            </div>
          ) : null}

          {insufficient ? (
            <div className="mt-4 rounded-[22px] border border-rose-300/70 bg-rose-50/90 p-4 dark:border-rose-400/20 dark:bg-rose-400/10">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-300" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                    当前{accountType === 'PURCHASE' ? '购买积分' : '余额'}不足
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rose-700/90 dark:text-rose-100/90">
                    请先充值后再购买，避免提交后被后端拒绝。
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3 rounded-full">
                    <Link href="/top-up">前往充值</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <AlertDialogFooter className="border-t border-slate-200/70 px-6 py-4 dark:border-white/10 md:px-7">
          <AlertDialogCancel type="button" className="w-full rounded-full sm:w-auto">
            取消
          </AlertDialogCancel>
          <Button
            type="button"
            className="w-full rounded-full sm:w-auto"
            disabled={busy || loadingBalance || insufficient}
            onClick={async () => {
              const result = await onConfirm();
              if (result !== false) {
                onOpenChange(false);
              }
            }}
          >
            {busy ? '处理中…' : effectiveConfirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
