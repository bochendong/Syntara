'use client';

import { Coins, Wallet } from 'lucide-react';
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
import type { ProfileCosmeticItem } from '@/lib/constants/profile-cosmetics';
import { formatPurchaseCreditsLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

type ProfileCosmeticUnlockConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ProfileCosmeticItem | null;
  purchaseBalance?: number | null;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
};

export function ProfileCosmeticUnlockConfirmDialog({
  open,
  onOpenChange,
  item,
  purchaseBalance = null,
  busy = false,
  onConfirm,
}: ProfileCosmeticUnlockConfirmDialogProps) {
  const nextBalance = item && purchaseBalance != null ? purchaseBalance - item.cost : null;
  const insufficient = nextBalance != null && nextBalance < 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[min(100vw-2rem,30rem)] rounded-[24px] border-white/60 bg-[rgba(255,255,255,0.94)] p-0 shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-[rgba(18,22,31,0.95)]">
        <div className="p-6">
          <AlertDialogHeader className="items-start text-left">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-violet-300/50 bg-violet-500/10 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/12 dark:text-violet-200">
              <Coins className="size-5" strokeWidth={1.8} />
            </div>
            <AlertDialogTitle className="text-lg font-semibold text-slate-950 dark:text-white">
              确认解锁外观
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              你即将解锁
              <span className="font-semibold text-slate-950 dark:text-white">
                「{item?.label ?? '外观资源'}」
              </span>
              。确认后会立即扣除购买积分。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Wallet className="size-4" />
                当前购买积分
              </span>
              <span className="font-semibold text-slate-950 dark:text-white">
                {purchaseBalance == null ? '读取中…' : formatPurchaseCreditsLabel(purchaseBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 py-2 text-sm dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">本次扣除</span>
              <span className="font-semibold text-rose-600 dark:text-rose-300">
                -{formatPurchaseCreditsLabel(item?.cost ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 py-2 text-sm dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">解锁后余额</span>
              <span
                className={cn(
                  'font-semibold',
                  insufficient
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-slate-950 dark:text-white',
                )}
              >
                {nextBalance == null
                  ? '解锁后更新'
                  : formatPurchaseCreditsLabel(Math.max(0, nextBalance))}
              </span>
            </div>
          </div>

          {insufficient ? (
            <div className="mt-4 rounded-2xl border border-rose-300/70 bg-rose-50/90 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">
              当前购买积分不足，无法解锁此资源。
            </div>
          ) : null}
        </div>

        <AlertDialogFooter className="border-t border-slate-200/70 px-6 py-4 dark:border-white/10">
          <AlertDialogCancel type="button" className="rounded-full" disabled={busy}>
            取消
          </AlertDialogCancel>
          <Button
            type="button"
            className="rounded-full"
            disabled={busy || !item || insufficient}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {busy ? '解锁中…' : '确认解锁'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
