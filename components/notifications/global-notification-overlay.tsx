'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Bell, Coins, X } from 'lucide-react';
import type { AppNotification } from '@/lib/notifications/types';
import { useNotificationStore } from '@/lib/store/notifications';
import { cn } from '@/lib/utils';

const AUTO_DISMISS_MS = 6500;

function formatBannerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function NotificationBannerCard({ item }: { item: AppNotification }) {
  const dismissBanner = useNotificationStore((state) => state.dismissBanner);
  const primaryDetail = item.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismissBanner(item.id);
    }, AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dismissBanner, item.id]);

  return (
    <div className="pointer-events-auto animate-fade-up">
      <div className="apple-glass-heavy relative overflow-hidden rounded-[24px] border border-white/50 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-white/8 dark:shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-px',
            item.tone === 'positive'
              ? 'bg-gradient-to-r from-emerald-400/0 via-emerald-400/90 to-sky-400/0'
              : 'bg-gradient-to-r from-rose-400/0 via-rose-400/85 to-orange-400/0',
          )}
        />
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border',
              item.tone === 'positive'
                ? 'border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-200'
                : 'border-rose-300/70 bg-rose-500/12 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/12 dark:text-rose-200',
            )}
          >
            {item.sourceKind === 'TOKEN_USAGE' ? (
              <Bell className="size-5" strokeWidth={1.8} />
            ) : (
              <Coins className="size-5" strokeWidth={1.8} />
            )}
          </div>

          <Link href="/notifications" className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                通知
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {formatBannerTime(item.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {item.title}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
              {item.body}
            </p>
            {primaryDetail ? (
              <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {primaryDetail.label}: {primaryDetail.value}
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                  item.tone === 'positive'
                    ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200'
                    : 'bg-rose-500/12 text-rose-700 dark:bg-rose-400/12 dark:text-rose-200',
                )}
              >
                {item.amountLabel}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{item.sourceLabel}</span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => dismissBanner(item.id)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/8 dark:hover:text-white"
            aria-label="关闭通知"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function GlobalNotificationOverlay() {
  const activeBanners = useNotificationStore((state) => state.activeBanners);

  if (activeBanners.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[1600] flex justify-center px-4 sm:justify-end sm:px-6">
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        {activeBanners.map((item) => (
          <NotificationBannerCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
