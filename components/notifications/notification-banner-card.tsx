'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Sparkles, X } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AppNotification } from '@/lib/notifications/types';
import { buildNotificationCompanionCopy } from '@/lib/notifications/companion-copy';
import { getNotificationCardTheme } from '@/lib/notifications/card-theme';
import { NotificationBarStageBackground } from '@/components/notifications/notification-bar-stage-background';
import {
  isSolidColorBarStageId,
  type NotificationBarStageId,
} from '@/lib/notifications/notification-bar-stage-ids';
import { resolveNotificationCompanionModelId } from '@/lib/notifications/companion-model';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useSettingsStore } from '@/lib/store/settings';
import type { NotificationCardStyleChoice } from '@/lib/notifications/card-theme';
import { cn } from '@/lib/utils';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';

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

type NotificationBannerCardProps = {
  item: AppNotification;
  className?: string;
  onDismiss?: (id: string) => void;
  autoDismissMs?: number;
  previewStageId?: NotificationBarStageId;
  previewCardStyle?: NotificationCardStyleChoice;
  disableLink?: boolean;
  hideViewAction?: boolean;
};

export function NotificationBannerCard({
  item,
  className,
  onDismiss,
  autoDismissMs,
  previewStageId,
  previewCardStyle,
  disableLink = false,
  hideViewAction = false,
}: NotificationBannerCardProps) {
  const notificationBarStageId = useUserProfileStore((s) => s.notificationBarStageId);
  const notificationCardStyle = useUserProfileStore((s) => s.notificationCardStyle);
  const notificationCompanionId = useSettingsStore((state) => state.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((state) => state.checkInCompanionId);
  const primaryDetail = item.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );
  const companionCopy = buildNotificationCompanionCopy(item);
  const cardTheme = getNotificationCardTheme(item, previewCardStyle ?? notificationCardStyle);
  const resolvedCompanionModelId = resolveNotificationCompanionModelId(
    item,
    notificationCompanionId,
    checkInCompanionId,
  );
  const showCompanion = shouldShowCompanion(item);
  const [companionSpeakingState, setCompanionSpeakingState] = useState(() => ({
    itemId: item.id,
    speaking: showCompanion,
  }));
  const companionSpeaking =
    showCompanion &&
    (companionSpeakingState.itemId === item.id ? companionSpeakingState.speaking : true);
  const stageId = previewStageId ?? notificationBarStageId;
  const usesSolidBackground = isSolidColorBarStageId(stageId);
  const usesLightSolidBackground = usesSolidBackground && stageId !== 'solid-black';
  const amountPrimaryClass = usesLightSolidBackground
    ? 'border border-white/75 bg-white/70 text-slate-800 shadow-[0_10px_28px_rgba(15,23,42,0.12)]'
    : cardTheme.amountPrimaryClass;
  const receivedChipClass = usesLightSolidBackground
    ? 'border border-amber-300/60 bg-amber-100/75 text-amber-800 shadow-[0_8px_20px_rgba(180,83,9,0.1)]'
    : 'border border-amber-200/24 bg-amber-300/14 text-amber-100';
  const showCloseButton = Boolean(onDismiss) || disableLink;

  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return;
    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, autoDismissMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoDismissMs, item.id, onDismiss]);

  useEffect(() => {
    if (!showCompanion) return;
    const timer = window.setTimeout(
      () => {
        setCompanionSpeakingState({ itemId: item.id, speaking: false });
      },
      item.tone === 'positive' ? 2200 : 1600,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [item.id, item.tone, showCompanion, stageId, previewCardStyle]);

  const content = (
    <div className={cn('group/banner min-w-0 w-full flex-1', showCompanion && 'sm:pe-0')}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 pe-14">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold backdrop-blur-md',
            amountPrimaryClass,
          )}
        >
          <Sparkles className="size-3.5" strokeWidth={1.9} />
          {item.amountLabel}
        </span>
        {item.showBalance !== false ? (
          <span
            className={cn(
              'shrink-0 text-xs',
              usesLightSolidBackground ? 'text-slate-700' : 'text-slate-400/90',
            )}
          >
            当前余额 {formatBalanceLabel(item)}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-3 text-sm',
          usesLightSolidBackground
            ? 'text-slate-950'
            : 'text-slate-100/95 [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]',
        )}
      >
        {companionCopy.line}
      </p>
      {primaryDetail ? (
        <p
          className={cn(
            'mt-2 line-clamp-1 text-xs',
            usesLightSolidBackground
              ? 'text-slate-600'
              : 'text-slate-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]',
          )}
        >
          {primaryDetail.label}: {primaryDetail.value}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'text-xs font-medium',
            usesLightSolidBackground
              ? 'text-slate-600'
              : 'text-slate-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]',
          )}
        >
          {item.sourceLabel || companionCopy.eyebrow}
        </span>
        {item.tone === 'positive' ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md',
              receivedChipClass,
            )}
          >
            <Heart className="size-3" strokeWidth={1.9} />
            已收下
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {!hideViewAction ? (
            disableLink ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md',
                  amountPrimaryClass,
                )}
              >
                查看
                <ArrowRight className="size-3" strokeWidth={2} />
              </span>
            ) : (
              <Link
                href="/notifications"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition-transform hover:translate-x-0.5',
                  amountPrimaryClass,
                )}
              >
                查看
                <ArrowRight className="size-3" strokeWidth={2} />
              </Link>
            )
          ) : null}
          {showCloseButton ? (
            <button
              type="button"
              aria-label={onDismiss ? '关闭通知' : '关闭通知预览'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDismiss?.(item.id);
              }}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2',
                usesLightSolidBackground
                  ? 'border-slate-900/10 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950 focus-visible:ring-slate-900/25'
                  : 'border-white/12 bg-black/35 text-slate-200 hover:bg-white/12 hover:text-white focus-visible:ring-white/60',
              )}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('pointer-events-auto animate-fade-up', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-[24px] border shadow-[0_24px_70px_rgba(0,0,0,0.45)]',
          usesLightSolidBackground
            ? 'border-slate-900/10 bg-transparent'
            : 'border-white/12 bg-black dark:border-white/10',
        )}
      >
        {!usesLightSolidBackground ? (
          <div className="absolute inset-0 z-0 bg-black" aria-hidden />
        ) : null}
        {!usesSolidBackground ? (
          <div className={cn('absolute inset-0 z-[1]', cardTheme.glowClass)} aria-hidden />
        ) : null}
        <NotificationBarStageBackground id={stageId} className="min-h-[8rem]" />
        <div
          className={cn(
            'absolute inset-0 z-[1]',
            usesLightSolidBackground
              ? 'bg-gradient-to-b from-white/18 via-transparent to-white/8'
              : 'bg-gradient-to-b from-black/15 via-black/20 to-black/40',
          )}
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
              className={cn(
                'pointer-events-none absolute right-4 top-4 z-20 text-xs tabular-nums',
                usesLightSolidBackground
                  ? 'text-slate-600'
                  : 'text-slate-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]',
              )}
              aria-hidden
            >
              {formatBannerTime(item.createdAt)}
            </span>
          ) : null}
          {disableLink ? content : content}

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
