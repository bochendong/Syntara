'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Lock, MessageCircle, Settings, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LEFT_RAIL_BAR_STAGE_OPTIONS } from '@/lib/notifications/notification-bar-stage-ids';
import { NotificationBarStageBackground } from '@/lib/notifications/notification-bar-stage-background';
import { useUserProfileStore, type LeftRailBarStageChoice } from '@/lib/store/user-profile';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import {
  getProfileCosmeticItem,
  leftRailStageCosmeticKey,
  type ProfileCosmeticItem,
} from '@/lib/constants/profile-cosmetics';
import { cn } from '@/lib/utils';
import { ProfileCosmeticUnlockConfirmDialog } from './profile-cosmetic-unlock-confirm-dialog';

/** 个人中心：侧栏动效选择区与快捷入口 */
const LEFT_RAIL_STAGE_CHOICES: { id: LeftRailBarStageChoice; label: string }[] = [
  { id: 'default', label: '默认' },
  ...LEFT_RAIL_BAR_STAGE_OPTIONS,
];

export function ProfileSidebarPanel() {
  const router = useRouter();
  const leftRailBarStageId = useUserProfileStore((s) => s.leftRailBarStageId);
  const setLeftRailBarStageId = useUserProfileStore((s) => s.setLeftRailBarStageId);
  const { summary, unlockCosmetic } = useGamificationSummary(true);
  const [draft, setDraft] = useState<LeftRailBarStageChoice>(leftRailBarStageId);
  const [unlockingKey, setUnlockingKey] = useState<string | null>(null);
  const [pendingUnlock, setPendingUnlock] = useState<ProfileCosmeticItem | null>(null);

  const isOwned = (key: string) => {
    if (!summary) {
      return (
        key === leftRailStageCosmeticKey('default') ||
        key === leftRailStageCosmeticKey('soft-aurora')
      );
    }
    return !summary.databaseEnabled || summary.cosmeticInventory.ownedKeys.includes(key);
  };

  const unlockSelected = async () => {
    if (!summary) {
      toast.info('正在加载解锁状态，请稍候');
      return;
    }
    const key = leftRailStageCosmeticKey(draft);
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
    setDraft(leftRailBarStageId);
  }, [leftRailBarStageId]);

  const selectedKey = leftRailStageCosmeticKey(draft);
  const selectedOwned = isOwned(selectedKey);
  const selectedProduct = getProfileCosmeticItem('left-rail-stage', draft);
  const canApply = selectedOwned && draft !== leftRailBarStageId;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <LayoutGrid className="size-4 text-violet-500" strokeWidth={1.9} />
              侧栏动效底图
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              选择后左侧主导航会立即出现预览。默认版式保持轻量，其余皮肤需要购买积分解锁。
            </p>
            <div className="grid w-full min-w-0 grid-cols-2 content-start items-stretch gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {LEFT_RAIL_STAGE_CHOICES.map(({ id, label }) => {
                const selected = draft === id;
                const key = leftRailStageCosmeticKey(id);
                const owned = isOwned(key);
                const product = getProfileCosmeticItem('left-rail-stage', id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft(id)}
                    className={cn(
                      'flex min-h-[3rem] items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-xs font-semibold leading-tight transition-all',
                      selected
                        ? 'border-violet-300/70 bg-violet-50 text-violet-950 ring-2 ring-violet-300/70 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/30'
                        : 'border-border/70 bg-background/55 text-foreground hover:border-muted-foreground/40 hover:bg-background/80',
                    )}
                    aria-pressed={selected}
                    aria-label={
                      owned
                        ? id === 'default'
                          ? '侧栏使用系统默认白底/深底'
                          : `侧栏使用${label}动效`
                        : `预览未解锁的${label}侧栏，解锁需要${product?.cost ?? 0}购买积分`
                    }
                  >
                    {label}
                    {!owned ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                        <Lock className="size-3" strokeWidth={2} />
                        未解锁 · {product?.cost ?? 0}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/70 bg-muted/25 p-3 md:border-l md:border-t-0">
            <div className="relative mx-auto h-72 w-full max-w-56 overflow-hidden rounded-[20px] border border-white/15 bg-black shadow-[0_22px_55px_rgba(15,23,42,0.22)]">
              {draft === 'default' ? (
                <div
                  className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(99,102,241,0.3),rgba(6,182,212,0.12)_42%,transparent_70%),#050505]"
                  aria-hidden
                />
              ) : (
                <NotificationBarStageBackground id={draft} className="!min-h-full opacity-70" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/15 to-black/45" />
              <div className="relative z-10 flex h-full flex-col p-3 text-white">
                <div className="flex items-center gap-2">
                  <div className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/12">
                    <UserRound className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Syntara</p>
                    <p className="text-[11px] text-white/65">购买积分解锁外观</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {[
                    { icon: MessageCircle, label: '聊天' },
                    { icon: Sparkles, label: '成长' },
                    { icon: Settings, label: '设置' },
                  ].map(({ icon: Icon, label }, index) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
                        index === 0
                          ? 'border-white/25 bg-white/18 text-white'
                          : 'border-white/10 bg-white/8 text-white/72',
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.8} />
                      {label}
                    </div>
                  ))}
                </div>
                <div className="mt-auto rounded-xl border border-white/12 bg-white/10 p-3">
                  <p className="text-[11px] font-medium text-white/90">
                    {selectedOwned ? '可应用' : '未解锁，仅预览'}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-white/60">
                    {selectedOwned
                      ? '头像、余额和导航保持更清爽的层级。'
                      : `${selectedProduct?.label ?? '当前侧栏'} 需要 ${
                          selectedProduct?.cost ?? 0
                        } 购买积分解锁。`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedProduct && !selectedOwned ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
          当前只是预览，未解锁不可应用：{selectedProduct.label} 需 {selectedProduct.cost} 购买积分。
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {selectedProduct && !selectedOwned ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unlockingKey === selectedProduct.key}
            onClick={() => setPendingUnlock(selectedProduct)}
          >
            {unlockingKey === selectedProduct.key ? '解锁中…' : `解锁 ${selectedProduct.label}`}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!canApply}
          onClick={() => {
            if (!selectedOwned) {
              toast.error('请先解锁当前侧边栏样式再应用');
              return;
            }
            setLeftRailBarStageId(draft);
          }}
        >
          应用
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => router.push('/chat')}>
          打开聊天页试试右侧栏
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/my-courses')}>
          返回我的课程
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
    </div>
  );
}
