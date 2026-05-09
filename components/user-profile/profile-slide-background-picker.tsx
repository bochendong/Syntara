'use client';

import { Check, Coins, Image as ImageIcon, Lock, MonitorPlay } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/client-toast';
import { Button } from '@/components/ui/button';
import {
  SLIDE_BACKGROUND_STYLE_OPTIONS,
  type SlideBackgroundStyleId,
} from '@/lib/constants/slide-backgrounds';
import {
  getProfileCosmeticItem,
  slideBackgroundCosmeticKey,
  type ProfileCosmeticItem,
} from '@/lib/constants/profile-cosmetics';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { cn } from '@/lib/utils';
import { ProfileCosmeticUnlockConfirmDialog } from './profile-cosmetic-unlock-confirm-dialog';

export function ProfileSlideBackgroundPicker() {
  const slideBackgroundStyleId = useUserProfileStore((s) => s.slideBackgroundStyleId);
  const setSlideBackgroundStyleId = useUserProfileStore((s) => s.setSlideBackgroundStyleId);
  const { summary, unlockCosmetic } = useGamificationSummary(true);
  const [draft, setDraft] = useState<SlideBackgroundStyleId>(slideBackgroundStyleId);
  const [unlockingKey, setUnlockingKey] = useState<string | null>(null);
  const [pendingUnlock, setPendingUnlock] = useState<ProfileCosmeticItem | null>(null);

  useEffect(() => {
    setDraft(slideBackgroundStyleId);
  }, [slideBackgroundStyleId]);

  const isOwned = (key: string) => {
    if (!summary) {
      return key === slideBackgroundCosmeticKey('academy-watercolor');
    }
    return !summary.databaseEnabled || summary.cosmeticInventory.ownedKeys.includes(key);
  };

  const unlockSelected = async () => {
    if (!summary) {
      toast.info('正在加载解锁状态，请稍候');
      return;
    }
    const key = slideBackgroundCosmeticKey(draft);
    const item = summary.cosmeticInventory.items.find((entry) => entry.key === key);
    if (!item || item.owned || !summary.databaseEnabled) return;

    setUnlockingKey(key);
    try {
      await unlockCosmetic(key);
      setSlideBackgroundStyleId(draft);
      toast.success(`已解锁：${item.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '解锁失败');
    } finally {
      setUnlockingKey(null);
    }
  };

  const selectedOption =
    SLIDE_BACKGROUND_STYLE_OPTIONS.find((option) => option.id === draft) ??
    SLIDE_BACKGROUND_STYLE_OPTIONS[0];
  const selectedKey = slideBackgroundCosmeticKey(draft);
  const selectedOwned = isOwned(selectedKey);
  const selectedProduct = getProfileCosmeticItem('slide-background', draft);
  const canApply = selectedOwned && draft !== slideBackgroundStyleId;

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.62fr)]">
      <section className="min-w-0 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/45">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">幻灯片背景</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              当前款式会应用到未设置专属图片或渐变的默认纯色幻灯片。
            </p>
          </div>
          <span className="rounded-full bg-emerald-50/70 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
            默认赠送 1 款
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SLIDE_BACKGROUND_STYLE_OPTIONS.map((option) => {
            const selected = draft === option.id;
            const key = slideBackgroundCosmeticKey(option.id);
            const owned = isOwned(key);
            const product = getProfileCosmeticItem('slide-background', option.id);
            const current = option.id === slideBackgroundStyleId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setDraft(option.id);
                  if (owned) {
                    setSlideBackgroundStyleId(option.id);
                  }
                }}
                className={cn(
                  'group/background min-w-0 rounded-2xl border p-2 text-left transition-all',
                  selected
                    ? 'border-violet-300/70 bg-violet-50/90 ring-2 ring-violet-300/60 dark:border-violet-300/35 dark:bg-violet-400/12 dark:ring-violet-400/25'
                    : 'border-border/60 bg-background/55 hover:border-muted-foreground/35 hover:bg-background/80',
                )}
                aria-pressed={selected}
                aria-label={
                  owned
                    ? current
                      ? `${option.label}幻灯片背景，当前使用`
                      : `选择${option.label}幻灯片背景`
                    : `预览未解锁的${option.label}幻灯片背景，解锁需要${product?.cost ?? 0}购买积分`
                }
              >
                <span className="relative block aspect-video overflow-hidden rounded-xl border border-black/5 bg-muted dark:border-white/10">
                  <img
                    src={option.src}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover/background:scale-[1.025]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
                  {selected || current ? (
                    <span
                      className={cn(
                        'absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full border shadow-sm',
                        selected && owned
                          ? 'border-violet-200 bg-violet-600 text-white'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={2.2} />
                    </span>
                  ) : null}
                  {!owned ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm dark:border-amber-300/20 dark:bg-amber-400/15 dark:text-amber-100">
                      <Lock className="size-3" strokeWidth={2} />
                      {product?.cost ?? 0}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      current
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                        : owned
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100',
                    )}
                  >
                    {current ? '当前' : owned ? '已解锁' : '未解锁'}
                  </span>
                </span>
                <span className="mt-1 block min-h-10 text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-3 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-slate-950/45">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MonitorPlay className="size-4 text-violet-500" strokeWidth={1.9} />
          实时预览
        </div>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-black shadow-[0_22px_55px_rgba(15,23,42,0.18)]">
          <div
            className="relative aspect-video bg-cover bg-center"
            style={{ backgroundImage: `url("${selectedOption.src}")` }}
          >
            <div className="absolute left-[11%] top-[18%] w-[46%]">
              <div
                className={cn(
                  'h-3 w-40 max-w-full rounded-full',
                  selectedOption.tone === 'dark' ? 'bg-white/80' : 'bg-slate-950/70',
                )}
              />
              <div className="mt-4 grid gap-2">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className={cn(
                      'h-2 rounded-full',
                      selectedOption.tone === 'dark' ? 'bg-white/45' : 'bg-slate-950/35',
                      index === 2 ? 'w-2/3' : 'w-full',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="absolute bottom-[16%] right-[12%] grid size-16 place-items-center rounded-2xl border border-white/35 bg-white/30 shadow-sm backdrop-blur-sm">
              <ImageIcon
                className={cn(
                  'size-7',
                  selectedOption.tone === 'dark' ? 'text-white' : 'text-slate-700',
                )}
                strokeWidth={1.8}
              />
            </div>
          </div>
        </div>

        {selectedProduct && !selectedOwned ? (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
            当前只是预览，未解锁不可应用：{selectedProduct.label} 需 {selectedProduct.cost}{' '}
            购买积分。
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap justify-end gap-2">
          {selectedProduct && !selectedOwned ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unlockingKey === selectedProduct.key}
              onClick={() => setPendingUnlock(selectedProduct)}
            >
              {unlockingKey === selectedProduct.key ? (
                '解锁中…'
              ) : (
                <>
                  解锁
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-100">
                    <Coins className="size-3" strokeWidth={2} />
                    {selectedProduct.cost}
                  </span>
                </>
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!canApply}
            onClick={() => {
              if (!selectedOwned) {
                toast.error('请先解锁当前幻灯片背景再应用');
                return;
              }
              setSlideBackgroundStyleId(draft);
            }}
          >
            应用
          </Button>
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
            await unlockSelected();
          }}
        />
      </aside>
    </div>
  );
}
