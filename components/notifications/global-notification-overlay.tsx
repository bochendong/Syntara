'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Sparkles } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AppNotification } from '@/lib/notifications/types';
import { buildNotificationCompanionCopy } from '@/lib/notifications/companion-copy';
import { getNotificationCardTheme } from '@/lib/notifications/card-theme';
import { NotificationBarStageBackground } from '@/lib/notifications/notification-bar-stage-background';
import { resolveNotificationCompanionModelId } from '@/lib/notifications/companion-model';
import { useNotificationStore } from '@/lib/store/notifications';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';

const AUTO_DISMISS_MS = 6500;

function formatBannerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBalanceLabel(item: AppNotification): string {
  switch (item.accountType) {
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(item.balanceAfter);
    case 'COMPUTE':
      return formatComputeCreditsLabel(item.balanceAfter);
    default:
      return formatCashCreditsLabel(item.balanceAfter);
  }
}

function shouldShowCompanion(item: AppNotification): boolean {
  return item.tone === 'positive' || item.sourceKind === 'NOTEBOOK_GENERATION_GROUP';
}

function NotificationBannerCard({ item }: { item: AppNotification }) {
  const dismissBanner = useNotificationStore((state) => state.dismissBanner);
  const notificationBarStageId = useUserProfileStore((s) => s.notificationBarStageId);
  const notificationCardStyle = useUserProfileStore((s) => s.notificationCardStyle);
  const notificationCompanionId = useSettingsStore((state) => state.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((state) => state.checkInCompanionId);
  const primaryDetail = item.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );
  const companionCopy = buildNotificationCompanionCopy(item);
  const cardTheme = getNotificationCardTheme(item, notificationCardStyle);
  const resolvedCompanionModelId = resolveNotificationCompanionModelId(
    item,
    notificationCompanionId,
    checkInCompanionId,
  );
  const showCompanion = shouldShowCompanion(item);
  const [companionSpeaking, setCompanionSpeaking] = useState(showCompanion);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismissBanner(item.id);
    }, AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dismissBanner, item.id]);

  useEffect(() => {
    if (!showCompanion) return;

    const timer = window.setTimeout(
      () => {
        setCompanionSpeaking(false);
      },
      item.tone === 'positive' ? 2200 : 1600,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [item.id, item.tone, showCompanion]);

  return (
    <div className="pointer-events-auto animate-fade-up">
      <div className="relative overflow-hidden rounded-[24px] border border-white/12 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.45)] dark:border-white/10">
        <div className="absolute inset-0 z-0 bg-black" aria-hidden />
        <div className={cn('absolute inset-0 z-[1]', cardTheme.glowClass)} aria-hidden />
        <NotificationBarStageBackground id={notificationBarStageId} className="min-h-[8rem]" />
        <div
          className="absolute inset-0 z-[1] bg-gradient-to-b from-black/15 via-black/20 to-black/40"
          aria-hidden
        />
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-[2] h-px bg-gradient-to-r',
            cardTheme.topLineClass,
          )}
        />
        <div className="relative z-10 flex items-start gap-3 p-4">
          {formatBannerTime(item.createdAt) ? (
            <span
              className="pointer-events-none absolute right-4 top-4 z-20 text-xs text-slate-400/90 tabular-nums [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]"
              aria-hidden
            >
              {formatBannerTime(item.createdAt)}
            </span>
          ) : null}
          <Link
            href="/notifications"
            className={cn(
              'group/banner min-w-0 w-full flex-1',
              showCompanion ? 'pe-11 sm:pe-0' : 'pe-11',
            )}
          >
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.18em]',
                    cardTheme.eyebrowClass,
                  )}
                >
                  {companionCopy.eyebrow}
                </span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:shrink-0">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold backdrop-blur-md',
                    cardTheme.amountPrimaryClass,
                  )}
                >
                  <Sparkles className="size-3.5" strokeWidth={1.9} />
                  {item.amountLabel}
                </span>
                {item.showBalance !== false ? (
                  <span className="shrink-0 text-xs text-slate-400/90">
                    当前余额 {formatBalanceLabel(item)}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-100/95 [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
              {companionCopy.line}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
              {item.body}
            </p>
            {primaryDetail ? (
              <p className="mt-2 line-clamp-1 text-xs text-slate-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
                {primaryDetail.label}: {primaryDetail.value}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md',
                  cardTheme.amountChipClass,
                )}
              >
                {item.amountLabel}
              </span>
              <span className="text-xs text-slate-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
                {item.sourceLabel}
              </span>
              {item.tone === 'positive' ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/24 bg-amber-300/14 px-2.5 py-1 text-[11px] font-medium text-amber-100 backdrop-blur-md">
                  <Heart className="size-3" strokeWidth={1.9} />
                  已收下
                </span>
              ) : null}
              <span
                className={cn(
                  'ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition-transform group-hover/banner:translate-x-0.5',
                  cardTheme.amountPrimaryClass,
                )}
              >
                查看
                <ArrowRight className="size-3" strokeWidth={2} />
              </span>
            </div>
          </Link>

          {showCompanion ? (
            <div className="hidden shrink-0 self-center sm:flex">
              <div className="relative flex h-[172px] w-[118px] items-end overflow-hidden rounded-[22px]">
                <TalkingAvatarOverlay
                  layout="card"
                  speaking={companionSpeaking}
                  cadence={item.tone === 'positive' ? 'active' : 'pause'}
                  speechText={companionCopy.line}
                  modelIdOverride={resolvedCompanionModelId}
                  cardFraming={
                    resolvedCompanionModelId === 'haru' ||
                    resolvedCompanionModelId === 'hiyori' ||
                    resolvedCompanionModelId === 'rice'
                      ? 'half'
                      : 'default'
                  }
                  showBadge={false}
                  showStatusDot={false}
                  className="h-full min-h-[172px] w-[118px] flex-none"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GlobalNotificationOverlay() {
  const pathname = usePathname();
  const activeBanners = useNotificationStore((state) => state.activeBanners);
  const suppressOnLive2dPage = pathname === '/live2d' || pathname?.startsWith('/live2d/');

  if (activeBanners.length === 0 || suppressOnLive2dPage) return null;

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
