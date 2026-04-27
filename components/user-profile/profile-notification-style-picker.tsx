'use client';

import { Check, Coins, LayoutGrid, Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NotificationBannerCard } from '@/components/notifications/notification-banner-card';
import { Button } from '@/components/ui/button';
import {
  NOTIFICATION_STYLE_PRESET_LIST,
  type NotificationCardStyleChoice,
  type NotificationStyleId,
} from '@/lib/notifications/card-theme';
import { NOTIFICATION_BAR_STAGE_OPTIONS } from '@/lib/notifications/notification-bar-stage-ids';
import type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import { cn } from '@/lib/utils';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { AppNotification } from '@/lib/notifications/types';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import {
  getProfileCosmeticItem,
  type ProfileCosmeticItem,
  notificationStageCosmeticKey,
} from '@/lib/constants/profile-cosmetics';
import { ProfileCosmeticUnlockConfirmDialog } from './profile-cosmetic-unlock-confirm-dialog';

const PREVIEW_MOCK: AppNotification = {
  id: 'profile-notification-preview',
  kind: 'credit_gain',
  title: '看课奖励到账',
  body: '节末进度已记录，随堂现金学分与明细以通知与账本为准。',
  sourceKind: 'LESSON_REWARD',
  sourceLabel: '看课奖励',
  tone: 'positive',
  presentation: 'banner',
  amountLabel: '+8 现金学分',
  delta: 8,
  balanceAfter: 1200,
  accountType: 'CASH',
  createdAt: '2026-04-26T12:34:00.000Z',
  details: [],
};

const STYLE_SWATCH_CLASS: Record<NotificationStyleId, string> = {
  green: 'bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.55)]',
  blue: 'bg-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.5)]',
  yellow: 'bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.5)]',
  purple: 'bg-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.5)]',
  pink: 'bg-fuchsia-300 shadow-[0_0_18px_rgba(232,121,249,0.5)]',
};

const STYLE_OPTIONS: {
  id: NotificationCardStyleChoice;
  label: string;
  description: string;
  swatchClass: string;
}[] = [
  {
    id: 'auto',
    label: '智能',
    description: '随通知类型变色',
    swatchClass: 'bg-[conic-gradient(from_140deg,#67e8f9,#7dd3fc,#fcd34d,#c4b5fd,#f0abfc,#67e8f9)]',
  },
  ...NOTIFICATION_STYLE_PRESET_LIST.map((preset) => ({
    ...preset,
    description: '固定主题色',
    swatchClass: STYLE_SWATCH_CLASS[preset.id],
  })),
];

const STAGE_MARK_CLASS: Record<NotificationBarStageId, string> = {
  'solid-black': 'bg-zinc-950',
  'solid-mist': 'bg-[#f3f6fb]',
  'solid-cloud': 'bg-[#def7ff]',
  'solid-blush': 'bg-[#fff0f5]',
  'solid-sage': 'bg-[#e8f8ef]',
  'solid-lilac': 'bg-[#f2edff]',
  prism: 'bg-[conic-gradient(from_90deg,#67e8f9,#a78bfa,#f0abfc,#fcd34d,#67e8f9)]',
  'light-pillar': 'bg-[linear-gradient(180deg,#f8fafc,#93c5fd,#fef3c7)]',
  'pixel-snow':
    'bg-[radial-gradient(circle,#e0f2fe_18%,transparent_22%),#f8fafc] bg-[length:8px_8px]',
  'floating-lines':
    'bg-[linear-gradient(135deg,#d8b4fe_12%,transparent_12%_38%,#67e8f9_38%_50%,transparent_50%)]',
  'light-rays': 'bg-[linear-gradient(135deg,#fde68a,#93c5fd,#c4b5fd)]',
  'soft-aurora': 'bg-[linear-gradient(135deg,#a78bfa,#67e8f9,#f0abfc)]',
  particles: 'bg-[radial-gradient(circle,#fef3c7_18%,transparent_22%),#111827] bg-[length:9px_9px]',
  'evil-eye': 'bg-[radial-gradient(circle,#22d3ee_18%,#1d4ed8_19%_32%,#020617_33%)]',
  'color-bends': 'bg-[linear-gradient(135deg,#fb7185,#facc15,#22d3ee,#a78bfa)]',
  'plasma-wave': 'bg-[linear-gradient(135deg,#ec4899,#8b5cf6,#06b6d4)]',
  threads: 'bg-[repeating-linear-gradient(135deg,#93c5fd_0_2px,transparent_2px_5px),#111827]',
  hyperspeed: 'bg-[repeating-linear-gradient(90deg,#f8fafc_0_1px,transparent_1px_8px),#020617]',
  'prismatic-burst': 'bg-[conic-gradient(from_180deg,#f0abfc,#38bdf8,#facc15,#fb7185,#f0abfc)]',
  'line-waves': 'bg-[repeating-linear-gradient(135deg,#67e8f9_0_2px,transparent_2px_7px),#0f172a]',
};

type ProfileNotificationStylePickerProps = {
  className?: string;
};

export function ProfileNotificationStylePicker({ className }: ProfileNotificationStylePickerProps) {
  const notificationBarStageId = useUserProfileStore((s) => s.notificationBarStageId);
  const setNotificationBarStageId = useUserProfileStore((s) => s.setNotificationBarStageId);
  const notificationCardStyle = useUserProfileStore((s) => s.notificationCardStyle);
  const setNotificationCardStyle = useUserProfileStore((s) => s.setNotificationCardStyle);
  const { summary, unlockCosmetic } = useGamificationSummary(true);
  const [draft, setDraft] = useState<NotificationBarStageId>(notificationBarStageId);
  const [draftStyle, setDraftStyle] = useState<NotificationCardStyleChoice>(notificationCardStyle);
  const [unlockingKey, setUnlockingKey] = useState<string | null>(null);
  const [pendingUnlock, setPendingUnlock] = useState<ProfileCosmeticItem | null>(null);

  const isOwned = (key: string) => {
    if (!summary) {
      return key === notificationStageCosmeticKey('soft-aurora');
    }
    return !summary.databaseEnabled || summary.cosmeticInventory.ownedKeys.includes(key);
  };

  const unlockCosmeticKey = async (key: string) => {
    if (!summary) {
      toast.info('正在加载解锁状态，请稍候');
      return;
    }
    const item = summary?.cosmeticInventory.items.find((entry) => entry.key === key);
    if (!item || item.owned || !summary.databaseEnabled) {
      return;
    }
    setUnlockingKey(key);
    try {
      await unlockCosmetic(key);
      toast.success(`已解锁：${item.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '解锁失败');
    } finally {
      setUnlockingKey(null);
    }
  };

  useEffect(() => {
    setDraft(notificationBarStageId);
  }, [notificationBarStageId]);

  useEffect(() => {
    setDraftStyle(notificationCardStyle);
  }, [notificationCardStyle]);

  const selectedStageKey = notificationStageCosmeticKey(draft);
  const selectedStageOwned = isOwned(selectedStageKey);
  const selectedStageProduct = getProfileCosmeticItem('notification-stage', draft);
  const lockedSelections = [
    !selectedStageOwned && selectedStageProduct ? selectedStageProduct : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const canApply =
    selectedStageOwned &&
    (draft !== notificationBarStageId || draftStyle !== notificationCardStyle);

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="grid min-w-0 items-stretch gap-5 lg:grid-cols-[minmax(400px,0.98fr)_minmax(480px,1.02fr)]">
        <section className="flex h-full flex-col rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/45">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">通知外观</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                配色免费，可直接应用；动效底图解锁后才会保存到全局通知。
              </p>
            </div>
            <span className="rounded-full bg-emerald-50/70 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
              配色免费
            </span>
          </div>

          <section className="mb-4 rounded-2xl border border-border/55 bg-background/55 p-3 shadow-inner shadow-slate-950/[0.02]">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette className="size-4 text-violet-500" strokeWidth={1.9} />
              通知配色
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {STYLE_OPTIONS.map((option) => {
                const selected = draftStyle === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraftStyle(option.id)}
                    className={cn(
                      'relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center transition-all',
                      selected
                        ? 'border-violet-300/70 bg-violet-50 text-violet-950 ring-2 ring-violet-300/70 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/30'
                        : 'border-border/70 bg-background/55 hover:border-muted-foreground/40 hover:bg-background/80',
                    )}
                    aria-pressed={selected}
                    aria-label={`选择${option.label}通知配色`}
                  >
                    <span
                      className={cn(
                        'size-7 shrink-0 rounded-full border border-white/55',
                        option.swatchClass,
                      )}
                      aria-hidden
                    />
                    <span className="block max-w-full truncate text-xs font-semibold leading-4">
                      {option.label}
                    </span>
                    {selected ? (
                      <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm dark:bg-violet-300 dark:text-violet-950">
                        <Check className="size-3.5" strokeWidth={2.2} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex flex-1 flex-col justify-center rounded-[26px] border border-border/50 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.11),transparent_46%),linear-gradient(180deg,rgba(248,250,252,0.86),rgba(241,245,249,0.72))] p-4 shadow-inner dark:bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.18),transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.58))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-muted-foreground">实时预览</span>
              <span className="text-[11px] text-muted-foreground">
                通知中心与弹出通知共用此样式
              </span>
            </div>
            <div className="flex w-full min-w-0 flex-col items-center">
              <NotificationBannerCard
                item={PREVIEW_MOCK}
                previewStageId={draft}
                previewCardStyle={draftStyle}
                disableLink
                className="w-full max-w-[520px]"
              />
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-col">
          <section className="flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/65 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="border-b border-border/55 px-4 pb-3 pt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <LayoutGrid className="size-4 text-violet-500" strokeWidth={1.9} />
                  动效底图
                </div>
                <p className="text-[11px] text-muted-foreground">
                  点击只切换左侧预览，解锁后可应用
                </p>
              </div>
            </div>
            <div className="grid w-full min-w-0 flex-1 grid-cols-2 content-start items-stretch gap-2 p-4 sm:grid-cols-3 xl:grid-cols-5">
              {NOTIFICATION_BAR_STAGE_OPTIONS.map(({ id, label }) => {
                const selected = draft === id;
                const key = notificationStageCosmeticKey(id);
                const owned = isOwned(key);
                const product = getProfileCosmeticItem('notification-stage', id);
                const current = id === notificationBarStageId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft(id)}
                    className={cn(
                      'group/stage flex min-h-[5.8rem] flex-col items-center justify-center rounded-2xl border px-2.5 py-2.5 text-center transition-all',
                      selected
                        ? 'border-violet-300/70 bg-violet-50/90 text-violet-950 ring-2 ring-violet-300/60 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/25'
                        : 'border-border/60 bg-card/55 text-foreground hover:border-muted-foreground/35 hover:bg-card/85',
                    )}
                    aria-pressed={selected}
                    aria-label={
                      owned
                        ? current
                          ? `${label}背景，当前使用`
                          : `选择${label}背景`
                        : `预览未解锁的${label}背景，解锁需要${product?.cost ?? 0}购买积分`
                    }
                  >
                    <span className="relative mb-1.5 inline-flex">
                      <span
                        className={cn(
                          'size-8 shrink-0 rounded-full border border-white/70 shadow-sm ring-1 ring-black/5 dark:border-white/20 dark:ring-white/10',
                          STAGE_MARK_CLASS[id],
                        )}
                        aria-hidden
                      />
                      {selected && owned ? (
                        <span className="absolute -right-2 -top-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-300/70 bg-white/85 text-violet-700 shadow-sm dark:border-violet-300/25 dark:bg-violet-950/70 dark:text-violet-100">
                          <Check className="size-3" strokeWidth={2.2} />
                        </span>
                      ) : current ? (
                        <span className="absolute -right-2 -top-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                          <Check className="size-3" strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </span>
                    <span className="block w-full min-w-0 truncate text-sm font-semibold leading-5">
                      {label}
                    </span>
                    <span
                      className={cn(
                        'mt-1 inline-flex h-5 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none',
                        owned
                          ? current
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                            : 'bg-muted text-muted-foreground'
                          : 'border border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100',
                      )}
                    >
                      {owned ? (
                        current ? (
                          '当前'
                        ) : (
                          '已解锁'
                        )
                      ) : (
                        <>
                          <Coins className="size-3" strokeWidth={2} />
                          {product?.cost ?? 0}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border/55 bg-muted/20 px-4 py-2.5">
              {lockedSelections.length > 0 ? (
                <div className="mb-2 rounded-xl border border-amber-200/80 bg-amber-50/75 px-3 py-1.5 text-xs leading-5 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
                  当前只是预览，未解锁不可应用：
                  {lockedSelections
                    .map((item) => `${item.label} 需 ${item.cost} 购买积分`)
                    .join('；')}
                </div>
              ) : null}
              <div className="flex w-full min-w-0 flex-wrap justify-end gap-2">
                {lockedSelections.map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={unlockingKey === item.key}
                    aria-label={`花费 ${item.cost} 购买积分解锁${item.label}`}
                    title={`花费 ${item.cost} 购买积分解锁${item.label}`}
                    onClick={() => setPendingUnlock(item)}
                  >
                    {unlockingKey === item.key ? (
                      '解锁中…'
                    ) : (
                      <>
                        解锁
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-100">
                          <Coins className="size-3" strokeWidth={2} />
                          {item.cost}
                        </span>
                      </>
                    )}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={!canApply}
                  onClick={() => {
                    if (!selectedStageOwned) {
                      toast.error('请先解锁当前动效底图再应用');
                      return;
                    }
                    setNotificationBarStageId(draft);
                    setNotificationCardStyle(draftStyle);
                  }}
                >
                  应用
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ProfileCosmeticUnlockConfirmDialog
        open={Boolean(pendingUnlock)}
        onOpenChange={(open) => {
          if (!open) setPendingUnlock(null);
        }}
        item={pendingUnlock}
        purchaseBalance={summary?.balances.purchase ?? null}
        busy={Boolean(pendingUnlock && unlockingKey === pendingUnlock.key)}
        onConfirm={async () => {
          if (!pendingUnlock) return;
          await unlockCosmeticKey(pendingUnlock.key);
        }}
      />
    </div>
  );
}
