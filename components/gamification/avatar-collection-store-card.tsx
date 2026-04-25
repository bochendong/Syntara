'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Gem, Shield, Sparkles, Star, Ticket, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import type {
  GamificationAvatarInventoryItem,
  GamificationCharacterSummary,
  GamificationAvatarRarity,
  GamificationGachaBannerId,
  GamificationGachaDrawResponse,
  GamificationGachaDrawReward,
} from '@/lib/types/gamification';
import { cn } from '@/lib/utils';

function isSupportedLive2DCharacterId(id: string): boolean {
  return id === 'haru' || id === 'hiyori' || id === 'mark' || id === 'mao' || id === 'rice';
}

function resolveLive2DAvatar(characterId: string): string {
  return `/liv2d_poster/${characterId.toLowerCase()}-avator.png`;
}

type BannerTone = {
  shellClassName: string;
  badgeClassName: string;
  accentClassName: string;
  burstClassName: string;
};

const BANNER_META: Record<
  GamificationGachaBannerId,
  {
    title: string;
    subtitle: string;
    singleCost: number;
    tenCost: number;
    chip: string;
    icon: typeof Sparkles;
    tone: BannerTone;
  }
> = {
  avatar: {
    title: '星辉头像补给',
    subtitle: 'R 头像直接入库，SR / SSR 以碎片累积合成，不会抽到已经拥有的头像。',
    singleCost: 30,
    tenCost: 270,
    chip: '头像卡池',
    icon: Sparkles,
    tone: {
      shellClassName:
        'border-fuchsia-200/80 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.28),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.92),rgba(252,231,243,0.82),rgba(244,114,182,0.18))] dark:border-fuchsia-400/20 dark:bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.35),transparent_45%),linear-gradient(145deg,rgba(72,18,52,0.88),rgba(32,14,28,0.92))]',
      badgeClassName:
        'bg-fuchsia-500/12 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-200',
      accentClassName: 'from-fuchsia-500 via-rose-400 to-amber-300',
      burstClassName: 'from-fuchsia-500/30 via-rose-400/20 to-transparent',
    },
  },
  live2d: {
    title: '讲师星愿补给',
    subtitle: '讲师角色通过碎片解锁，集齐 10 片即可入驻课堂；重复则转化为亲密度加成。',
    singleCost: 45,
    tenCost: 405,
    chip: '讲师卡池',
    icon: Shield,
    tone: {
      shellClassName:
        'border-sky-200/80 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.26),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.92),rgba(239,246,255,0.84),rgba(59,130,246,0.16))] dark:border-sky-400/20 dark:bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.35),transparent_45%),linear-gradient(145deg,rgba(15,33,61,0.9),rgba(8,19,37,0.94))]',
      badgeClassName: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200',
      accentClassName: 'from-sky-400 via-cyan-300 to-indigo-300',
      burstClassName: 'from-sky-500/30 via-cyan-400/20 to-transparent',
    },
  },
};

const REVEAL_PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  id: `particle-${index}`,
  left: 8 + ((index * 29) % 84),
  top: 6 + ((index * 17) % 86),
  size: 4 + (index % 5) * 2,
  delay: (index % 6) * 0.07,
  duration: 1.4 + (index % 5) * 0.18,
  dx: (index % 2 === 0 ? 1 : -1) * (18 + (index % 4) * 9),
  dy: -28 - (index % 6) * 14,
}));

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function GachaPoolTabSwitch({
  activePool,
  onChange,
}: {
  activePool: GamificationGachaBannerId;
  onChange: (pool: GamificationGachaBannerId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="补给类型"
      className="w-fit max-w-[min(100%,15rem)] rounded-xl border border-white/20 bg-white/10 p-0.5 shadow-sm backdrop-blur-sm"
    >
      <div className="grid h-7 w-full min-w-0 grid-cols-2 gap-px">
        <button
          type="button"
          role="tab"
          aria-selected={activePool === 'live2d'}
          onClick={() => onChange('live2d')}
          className={cn(
            'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition',
            activePool === 'live2d'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-white/80 hover:text-white',
          )}
        >
          <Shield className="size-2.5 shrink-0 opacity-80" />
          <span className="truncate">{BANNER_META.live2d.chip}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePool === 'avatar'}
          onClick={() => onChange('avatar')}
          className={cn(
            'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition',
            activePool === 'avatar'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-white/80 hover:text-white',
          )}
        >
          <Sparkles className="size-2.5 shrink-0 opacity-80" />
          <span className="truncate">{BANNER_META.avatar.chip}</span>
        </button>
      </div>
    </div>
  );
}

function rarityAccent(rarity?: GamificationAvatarRarity) {
  if (rarity === 'SSR') return 'from-amber-300 via-fuchsia-400 to-rose-500';
  if (rarity === 'SR') return 'from-violet-300 via-fuchsia-400 to-sky-400';
  return 'from-sky-300 via-emerald-300 to-lime-300';
}

function gachaAvatarHighlightRingClass(rarity: GamificationAvatarRarity) {
  if (rarity === 'SSR') {
    return 'border-amber-200/60 bg-amber-200/10 shadow-[0_0_20px_rgba(251,191,36,0.28)]';
  }
  if (rarity === 'SR') {
    return 'border-fuchsia-200/50 bg-fuchsia-400/10 shadow-[0_0_16px_rgba(232,121,222,0.2)]';
  }
  return 'border-white/25 bg-white/8';
}

function rewardSortValue(reward: GamificationGachaDrawReward) {
  if (reward.kind === 'character') return reward.unlockedNow ? 100 : reward.duplicate ? 70 : 80;
  if (reward.rarity === 'SSR') return reward.unlockedNow ? 98 : 88;
  if (reward.rarity === 'SR') return reward.unlockedNow ? 90 : 78;
  return reward.unlockedNow ? 72 : 60;
}

function rewardCaption(reward: GamificationGachaDrawReward) {
  if (reward.kind === 'character') {
    return reward.duplicate
      ? `已拥有，转化为 +${reward.affinityGain} 亲密度`
      : reward.unlockedNow
        ? '碎片集满，角色已正式入驻'
        : `讲师碎片 +${reward.fragmentGain} · ${reward.fragmentTotal}/${reward.fragmentTarget}`;
  }

  if (reward.rarity === 'R') return 'R 头像直出，已加入你的头像库存';
  if (reward.unlockedNow) return `${reward.rarity} 碎片集满，头像已合成`;
  return `${reward.rarity} 碎片 +${reward.fragmentGain} · ${reward.fragmentTotal}/${reward.fragmentTarget}`;
}

function rewardBadgeLabel(reward: GamificationGachaDrawReward) {
  if (reward.kind === 'character') return reward.duplicate ? '重复奖励' : '讲师碎片';
  return reward.rarity ?? '头像';
}

function GachaRevealDialog({
  open,
  phase,
  result,
  onClose,
}: {
  open: boolean;
  phase: 'charging' | 'impact' | 'reveal';
  result: GamificationGachaDrawResponse | null;
  onClose: () => void;
}) {
  const bannerId = result?.bannerId ?? 'avatar';
  const bannerMeta = BANNER_META[bannerId];
  const featuredReward = useMemo(() => {
    if (!result) return null;
    return [...result.rewards].sort((a, b) => rewardSortValue(b) - rewardSortValue(a))[0] ?? null;
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent
        className="w-[min(100vw-1.5rem,72rem)] overflow-hidden border-white/45 bg-[rgba(8,12,24,0.82)] p-0 text-white shadow-[0_40px_160px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-white/10"
        showOverlay
        showCloseButton={phase === 'reveal'}
      >
        <div className="relative min-h-[42rem] overflow-hidden">
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-br opacity-90',
              bannerMeta.tone.burstClassName,
            )}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),transparent_38%),radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_26%)]" />

          <AnimatePresence>
            {phase !== 'reveal' ? (
              <motion.div
                key={phase}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                {REVEAL_PARTICLES.map((particle) => (
                  <motion.div
                    key={particle.id}
                    className="absolute rounded-full bg-white/85 shadow-[0_0_16px_rgba(255,255,255,0.75)]"
                    style={{
                      width: particle.size,
                      height: particle.size,
                      left: `${particle.left}%`,
                      top: `${particle.top}%`,
                    }}
                    initial={{ opacity: 0, scale: 0.25, x: 0, y: 0 }}
                    animate={{
                      opacity: phase === 'impact' ? [0, 1, 0] : [0.1, 0.7, 0.1],
                      scale: phase === 'impact' ? [0.4, 1.35, 0.2] : [0.35, 1, 0.45],
                      x: phase === 'impact' ? [0, particle.dx] : [0, particle.dx * 0.35, 0],
                      y: phase === 'impact' ? [0, particle.dy] : [0, particle.dy * 0.4, 0],
                    }}
                    transition={{
                      duration: particle.duration,
                      delay: particle.delay,
                      repeat: phase === 'impact' ? 0 : Number.POSITIVE_INFINITY,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="relative z-10 flex min-h-[42rem] flex-col items-center justify-center px-6 py-8">
            <DialogHeader className="items-center text-center">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
                  bannerMeta.tone.badgeClassName,
                )}
              >
                <WandSparkles className="size-3.5" />
                {bannerMeta.title}
              </span>
              <DialogTitle className="text-[2rem] font-semibold tracking-[-0.04em] text-white">
                {phase === 'charging'
                  ? '正在连接星轨补给站'
                  : phase === 'impact'
                    ? '流光命中，正在拆封奖励'
                    : '补给结果已确认'}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm text-white/70">
                {phase === 'reveal'
                  ? '新的奖励已经写入库存与角色进度。'
                  : '粒子风暴正在重组本次补给结果，请稍等片刻。'}
              </DialogDescription>
            </DialogHeader>

            {phase !== 'reveal' ? (
              <div className="relative mt-10 flex flex-1 items-center justify-center">
                <motion.div
                  className={cn(
                    'absolute size-[20rem] rounded-full bg-gradient-to-r blur-3xl',
                    bannerMeta.tone.accentClassName,
                  )}
                  animate={{
                    scale: phase === 'impact' ? [0.85, 1.25, 1.05] : [0.85, 1.05, 0.9],
                    opacity: phase === 'impact' ? [0.4, 0.92, 0.5] : [0.28, 0.58, 0.32],
                    rotate: [0, 180, 360],
                  }}
                  transition={{
                    duration: phase === 'impact' ? 1.4 : 3.4,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'linear',
                  }}
                />
                <motion.div
                  className="relative flex aspect-square w-[18rem] items-center justify-center rounded-[3rem] border border-white/25 bg-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                  animate={{
                    rotate: phase === 'impact' ? [0, -8, 10, 0] : [0, 5, -5, 0],
                    scale: phase === 'impact' ? [1, 1.06, 0.96, 1] : [0.96, 1.04, 0.98],
                  }}
                  transition={{
                    duration: phase === 'impact' ? 0.85 : 2.2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                  }}
                >
                  <motion.div
                    className={cn(
                      'absolute inset-4 rounded-[2.4rem] bg-gradient-to-br opacity-95',
                      bannerMeta.tone.accentClassName,
                    )}
                    animate={{
                      filter:
                        phase === 'impact'
                          ? ['brightness(1)', 'brightness(1.4)', 'brightness(1.05)']
                          : ['brightness(0.92)', 'brightness(1.14)', 'brightness(0.95)'],
                    }}
                    transition={{ duration: 1.25, repeat: Number.POSITIVE_INFINITY }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-[3rem] border border-white/25"
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 5.4, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  />
                  <bannerMeta.icon className="relative z-10 size-14 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.65)]" />
                </motion.div>
              </div>
            ) : (
              <div className="mt-10 flex w-full flex-1 flex-col gap-6">
                {featuredReward ? (
                  <motion.div
                    initial={{ opacity: 0, y: 36, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    className="mx-auto w-full max-w-xl"
                  >
                    <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/8 p-5 shadow-[0_24px_80px_rgba(8,15,40,0.35)]">
                      <div
                        className={cn(
                          'absolute inset-0 bg-gradient-to-br opacity-70',
                          rarityAccent(featuredReward.rarity),
                        )}
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.4),transparent_35%)]" />
                      <div className="relative flex items-center gap-5">
                        <div className="relative size-28 shrink-0 overflow-hidden rounded-[1.6rem] border border-white/30 bg-black/20">
                          <img
                            src={featuredReward.previewSrc}
                            alt={featuredReward.name}
                            className="size-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2 pt-6 text-[11px] font-medium text-white/90">
                            {rewardBadgeLabel(featuredReward)}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                            Featured Reward
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                            {featuredReward.name}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/80">
                            {rewardCaption(featuredReward)}
                          </p>
                          {featuredReward.fragmentTarget > 1 ? (
                            <div className="mt-3">
                              <Progress
                                value={Math.round(
                                  (featuredReward.fragmentTotal / featuredReward.fragmentTarget) *
                                    100,
                                )}
                                className="bg-white/15"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}

                <div
                  className={cn(
                    'grid gap-3',
                    result?.drawCount === 10 ? 'md:grid-cols-5' : 'mx-auto max-w-sm',
                  )}
                >
                  {(result?.rewards ?? []).map((reward, index) => (
                    <motion.div
                      key={`${reward.kind}-${reward.itemId}-${index}`}
                      initial={{ opacity: 0, y: 28, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.1 + index * 0.05, duration: 0.35 }}
                      className="overflow-hidden rounded-[1.5rem] border border-white/16 bg-white/8 p-3 shadow-[0_18px_50px_rgba(8,15,40,0.25)]"
                    >
                      <div className="relative overflow-hidden rounded-[1.2rem] bg-black/20">
                        <div
                          className={cn(
                            'absolute inset-0 bg-gradient-to-br opacity-75',
                            rarityAccent(reward.rarity),
                          )}
                        />
                        <img
                          src={reward.previewSrc}
                          alt={reward.name}
                          className="relative aspect-square w-full object-cover"
                        />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">{reward.name}</p>
                      <p className="mt-1 text-xs leading-5 text-white/70">
                        {rewardCaption(reward)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvatarWishBanner({
  ownedCount,
  totalCount,
  highlights,
  allInventoryItems,
  disabled,
  onDraw,
  onOpenDropRules,
  activePool,
  onActivePoolChange,
}: {
  ownedCount: number;
  totalCount: number;
  highlights: Array<{
    id: string;
    name: string;
    url: string;
    rarity: GamificationAvatarRarity;
  }>;
  allInventoryItems: GamificationAvatarInventoryItem[];
  disabled: boolean;
  onDraw: (bannerId: GamificationGachaBannerId, drawCount: 1 | 10) => void;
  onOpenDropRules: () => void;
  activePool: GamificationGachaBannerId;
  onActivePoolChange: (pool: GamificationGachaBannerId) => void;
}) {
  const [avatarCatalogOpen, setAvatarCatalogOpen] = useState(false);
  const meta = BANNER_META.avatar;
  const progress = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;
  const showMoreInPool = totalCount > 5;

  const catalogItems = useMemo(() => {
    const order = { SSR: 3, SR: 2, R: 1 } as const;
    return [...allInventoryItems].sort(
      (a, b) =>
        order[b.rarity] - order[a.rarity] || a.name.localeCompare(b.name, 'zh-Hans-CN'),
    );
  }, [allInventoryItems]);

  return (
    <>
    <div className="relative flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-[2.25rem] border border-fuchsia-200/70 bg-slate-950 text-white shadow-[0_30px_110px_rgba(15,23,42,0.4)] dark:border-fuchsia-300/15">
      <img
        src="/pool_poster/avator.jpeg"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_82%_10%,rgba(56,189,248,0.1),transparent_24%),radial-gradient(circle_at_78%_80%,rgba(192,38,211,0.14),transparent_36%),linear-gradient(128deg,rgba(15,23,42,0.55)_0%,rgba(30,27,75,0.5)_40%,rgba(55,20,80,0.38)_70%,rgba(15,23,42,0.6)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,rgba(196,181,253,0.07),transparent_22%),radial-gradient(circle_at_22%_78%,rgba(45,212,191,0.06),transparent_20%)]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-indigo-200/6 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950/65 via-slate-950/38 to-transparent" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-8 p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xl">
            <GachaPoolTabSwitch activePool={activePool} onChange={onActivePoolChange} />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.32em] text-fuchsia-200/85">
              Avatar Starlight Supply
            </p>
            <h3 className="mt-2 text-4xl font-semibold tracking-[-0.055em] text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.35)] md:text-6xl">
              {meta.title}
            </h3>
            <p className="mt-4 max-w-md text-sm leading-6 text-fuchsia-50/80 md:text-base">
              {meta.subtitle}
            </p>
          </div>

          <div className="w-full rounded-[1.65rem] border border-white/15 bg-black/25 p-4 shadow-[0_20px_80px_rgba(36,8,44,0.32)] backdrop-blur-md md:w-72">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-fuchsia-200">
                  头像收集
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {ownedCount}
                  <span className="ml-1 text-base font-medium text-white/50">/ {totalCount}</span>
                </p>
              </div>
              <Gem className="size-8 text-fuchsia-200 drop-shadow-[0_0_18px_rgba(244,114,182,0.72)]" />
            </div>
            <Progress value={progress} className="mt-4 bg-white/15" />
            <p className="mt-3 text-xs leading-5 text-white/60">
              R 头像直接加入库存；SR / SSR 会以碎片推进，凑满后自动合成，不会重复掉落完整头像。
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div className="flex flex-wrap content-start items-end justify-start gap-x-3 gap-y-2.5">
            {highlights.slice(0, 5).map((item) => (
              <div key={item.id} className="group shrink-0">
                <div
                  className={cn(
                    'relative size-12 overflow-hidden rounded-full border p-0.5 transition duration-200 group-hover:scale-105 md:size-14',
                    gachaAvatarHighlightRingClass(item.rarity),
                  )}
                >
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br opacity-35',
                      rarityAccent(item.rarity),
                    )}
                  />
                  <img
                    src={item.url}
                    alt=""
                    className="relative size-full rounded-full object-cover"
                  />
                </div>
              </div>
            ))}
            {showMoreInPool ? (
              <button
                type="button"
                onClick={() => setAvatarCatalogOpen(true)}
                className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-white/30 bg-white/5 text-[0.7rem] font-bold leading-none tracking-tight text-white/55 transition hover:border-white/45 hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50 md:size-14 md:text-xs"
                title="查看全部头像"
                aria-label="打开图鉴，查看全部头像"
              >
                <span aria-hidden className="pb-0.5">
                  ...
                </span>
              </button>
            ) : null}
          </div>

          <div className="rounded-[1.75rem] border border-white/16 bg-white/10 p-4 shadow-[0_22px_80px_rgba(36,8,44,0.32)] backdrop-blur-xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-fuchsia-100/72">
              星辉补给
            </p>
            <div className="mt-4 grid gap-3">
              <Button
                type="button"
                size="lg"
                className="h-[3.25rem] justify-between rounded-2xl bg-white px-5 text-slate-950 shadow-[0_18px_50px_rgba(255,255,255,0.18)] hover:bg-fuchsia-50"
                disabled={disabled}
                onClick={() => onDraw('avatar', 1)}
              >
                <span>单抽</span>
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="size-4" />
                  {meta.singleCost}
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-[3.25rem] justify-between rounded-2xl border-white/30 bg-white/10 px-5 text-white backdrop-blur-sm hover:bg-white/[0.18] hover:text-white"
                disabled={disabled}
                onClick={() => onDraw('avatar', 10)}
              >
                <span>十连</span>
                <span className="inline-flex items-center gap-1.5">
                  <Gem className="size-4" />
                  {meta.tenCost}
                </span>
              </Button>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[11px] leading-5 text-white/55">
                十连享受 9 抽价格，结果会直接写回头像库存、碎片进度和余额。
              </p>
              <button
                type="button"
                onClick={onOpenDropRules}
                aria-label="掉落规则"
                title="掉落规则"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/85 shadow-sm backdrop-blur-sm transition hover:bg-white/16"
              >
                <Star className="size-2.5 opacity-90" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={avatarCatalogOpen} onOpenChange={setAvatarCatalogOpen}>
      <DialogContent className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-0 overflow-hidden border-slate-200/80 p-0 sm:max-w-lg dark:border-white/10">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200/70 px-6 py-4 text-left dark:border-white/10">
          <DialogTitle className="text-base">星辉头像图鉴</DialogTitle>
          <DialogDescription className="text-left text-xs text-slate-600 dark:text-slate-400">
            共 {totalCount} 款；已拥有 {ownedCount} 款
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {catalogItems.length === 0 ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">暂无图鉴数据</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
              {catalogItems.map((item) => (
                <div key={item.id} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="relative size-16 shrink-0 sm:size-[4.5rem]">
                    <div
                      className={cn(
                        'relative size-full overflow-hidden rounded-full border p-0.5',
                        gachaAvatarHighlightRingClass(item.rarity),
                        !item.owned && 'opacity-50 grayscale-[0.35]',
                      )}
                    >
                      <div
                        className={cn(
                          'pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br opacity-30',
                          rarityAccent(item.rarity),
                        )}
                      />
                      <img
                        src={item.url}
                        alt=""
                        className="relative size-full rounded-full object-cover"
                      />
                    </div>
                    {item.owned ? (
                      <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500 text-white shadow-sm dark:border-fuchsia-400/20">
                        <Check className="size-3" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                  <p className="w-full max-w-full truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.rarity}</p>
                  {!item.owned && item.fragmentTarget > 0 ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      碎片 {item.fragmentCount}/{item.fragmentTarget}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function InstructorWishBanner({
  characters,
  unlockedCount,
  disabled,
  onDraw,
  onOpenDropRules,
  activePool,
  onActivePoolChange,
}: {
  characters: GamificationCharacterSummary[];
  unlockedCount: number;
  disabled: boolean;
  onDraw: (bannerId: GamificationGachaBannerId, drawCount: 1 | 10) => void;
  onOpenDropRules: () => void;
  activePool: GamificationGachaBannerId;
  onActivePoolChange: (pool: GamificationGachaBannerId) => void;
}) {
  const meta = BANNER_META.live2d;
  const totalCount = characters.length;
  const progress = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <div className="relative flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-[2.25rem] border border-sky-200/70 bg-slate-950 text-white shadow-[0_30px_110px_rgba(14,30,64,0.28)] dark:border-sky-300/15">
      <img
        src="/pool_poster/live2d.png"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,11,28,0.92)_0%,rgba(4,11,28,0.68)_34%,rgba(4,11,28,0.16)_63%,rgba(4,11,28,0.62)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(125,211,252,0.25),transparent_30%),radial-gradient(circle_at_18%_88%,rgba(59,130,246,0.24),transparent_34%)]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/14 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 via-slate-950/72 to-transparent" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-8 p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xl">
            <GachaPoolTabSwitch activePool={activePool} onChange={onActivePoolChange} />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.32em] text-sky-200/85">
              Character Event Warp
            </p>
            <h3 className="mt-2 text-4xl font-semibold tracking-[-0.055em] text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.35)] md:text-6xl">
              {meta.title}
            </h3>
            <p className="mt-4 max-w-md text-sm leading-6 text-sky-50/75 md:text-base">
              {meta.subtitle}
            </p>
          </div>

          <div className="w-full rounded-[1.65rem] border border-white/15 bg-black/25 p-4 shadow-[0_20px_80px_rgba(8,15,40,0.28)] backdrop-blur-md md:w-72">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-sky-200">
                  讲师收集
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {unlockedCount}
                  <span className="ml-1 text-base font-medium text-white/50">/ {totalCount}</span>
                </p>
              </div>
              <Sparkles className="size-8 text-sky-200 drop-shadow-[0_0_18px_rgba(125,211,252,0.75)]" />
            </div>
            <Progress value={progress} className="mt-4 bg-white/15" />
            <p className="mt-3 text-xs leading-5 text-white/60">
              未拥有讲师掉落碎片，满 10 片自动解锁；重复讲师转化为亲密度。
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div className="flex flex-wrap content-start items-end justify-start gap-x-3 gap-y-2.5">
            {characters.map((character) => (
              <div key={character.id} className="group shrink-0">
                <div
                  className={cn(
                    'relative size-12 overflow-hidden rounded-full border p-0.5 transition duration-200 group-hover:scale-105 md:size-14',
                    character.isUnlocked
                      ? 'border-amber-200/60 bg-amber-200/10 shadow-[0_0_24px_rgba(251,191,36,0.35)]'
                      : 'border-sky-200/40 bg-sky-300/10',
                  )}
                >
                  {character.previewSrc ? (
                    <img
                      src={resolveLive2DAvatar(character.id)}
                      alt={character.name ?? character.id}
                      className="size-full rounded-full object-cover object-top transition duration-300 group-hover:scale-105"
                      onError={(event) => {
                        event.currentTarget.src = character.previewSrc ?? '';
                      }}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-white/50">
                      No Avatar
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[1.75rem] border border-white/16 bg-white/10 p-4 shadow-[0_22px_80px_rgba(8,15,40,0.28)] backdrop-blur-xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-sky-100/72">
              星愿补给
            </p>
            <div className="mt-4 grid gap-3">
              <Button
                type="button"
                size="lg"
                className="h-[3.25rem] justify-between rounded-2xl bg-white px-5 text-slate-950 shadow-[0_18px_50px_rgba(255,255,255,0.18)] hover:bg-sky-50"
                disabled={disabled}
                onClick={() => onDraw('live2d', 1)}
              >
                <span>单抽</span>
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="size-4" />
                  {meta.singleCost}
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-[3.25rem] justify-between rounded-2xl border-white/30 bg-white/10 px-5 text-white backdrop-blur-sm hover:bg-white/[0.18] hover:text-white"
                disabled={disabled}
                onClick={() => onDraw('live2d', 10)}
              >
                <span>十连</span>
                <span className="inline-flex items-center gap-1.5">
                  <Gem className="size-4" />
                  {meta.tenCost}
                </span>
              </Button>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[11px] leading-5 text-white/55">
                十连享受 9 抽价格，结果会直接写回讲师碎片、亲密度和余额。
              </p>
              <button
                type="button"
                onClick={onOpenDropRules}
                aria-label="掉落规则"
                title="掉落规则"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/85 shadow-sm backdrop-blur-sm transition hover:bg-white/16"
              >
                <Star className="size-2.5 opacity-90" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AvatarCollectionStoreCard() {
  const { summary, drawGacha } = useGamificationSummary(true);
  const [drawOpen, setDrawOpen] = useState(false);
  const [drawPhase, setDrawPhase] = useState<'charging' | 'impact' | 'reveal'>('charging');
  const [drawResult, setDrawResult] = useState<GamificationGachaDrawResponse | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [dropRulesOpen, setDropRulesOpen] = useState(false);
  const [gachaPoolTab, setGachaPoolTab] = useState<GamificationGachaBannerId>('live2d');

  const ownedAvatarCount = summary?.avatarInventory.items.filter((item) => item.owned).length ?? 0;
  const totalAvatarCount = summary?.avatarInventory.items.length ?? 0;
  const live2dCharacters =
    summary?.characters.filter(
      (character) => character.assetType === 'LIVE2D' && isSupportedLive2DCharacterId(character.id),
    ) ?? [];
  const unlockedLive2dCount = live2dCharacters.filter((character) => character.isUnlocked).length;

  const handleDraw = async (bannerId: GamificationGachaBannerId, drawCount: 1 | 10) => {
    if (drawing) return;
    setDrawing(true);
    setDrawOpen(true);
    setDrawResult(null);
    setDrawPhase('charging');

    try {
      const request = drawGacha(bannerId, drawCount);
      await sleep(650);
      setDrawPhase('impact');
      const result = await request;
      await sleep(550);
      setDrawResult(result);
      setDrawPhase('reveal');
    } catch (err) {
      setDrawOpen(false);
      toast.error(err instanceof Error ? err.message : '抽卡失败');
    } finally {
      setDrawing(false);
    }
  };

  const avatarHighlights = useMemo(() => {
    const items = summary?.avatarInventory.items ?? [];
    const byRarity = (a: (typeof items)[0], b: (typeof items)[0]) => {
      const order = { SSR: 3, SR: 2, R: 1 } as const;
      return order[b.rarity] - order[a.rarity];
    };
    const unowned = items.filter((item) => !item.owned).sort(byRarity);
    if (unowned.length > 0) return unowned.slice(0, 6);
    // 全部已拥有时仍展示高稀有度代表，避免「星辉头像补给」下面预览行空白
    return [...items].sort(byRarity).slice(0, 6);
  }, [summary?.avatarInventory.items]);

  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-muted/40 bg-white/85 p-0 backdrop-blur-xl dark:bg-slate-900/80">
        {!summary ? null : !summary.databaseEnabled ? (
          <div className="px-5 py-6 text-sm text-muted-foreground md:px-6">
            当前环境还没有数据库同步，补给站暂时不可用。
          </div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col px-5 py-5 md:px-6">
            {gachaPoolTab === 'avatar' ? (
              <AvatarWishBanner
                ownedCount={ownedAvatarCount}
                totalCount={totalAvatarCount}
                highlights={avatarHighlights}
                allInventoryItems={summary.avatarInventory.items}
                disabled={drawing}
                onDraw={handleDraw}
                onOpenDropRules={() => setDropRulesOpen(true)}
                activePool={gachaPoolTab}
                onActivePoolChange={setGachaPoolTab}
              />
            ) : (
              <InstructorWishBanner
                characters={live2dCharacters}
                unlockedCount={unlockedLive2dCount}
                disabled={drawing}
                onDraw={handleDraw}
                onOpenDropRules={() => setDropRulesOpen(true)}
                activePool={gachaPoolTab}
                onActivePoolChange={setGachaPoolTab}
              />
            )}
          </div>
        )}
        </Card>
      </div>

      <Dialog open={dropRulesOpen} onOpenChange={setDropRulesOpen}>
        <DialogContent className="max-w-md border-slate-200/80 sm:max-w-md dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2 text-base">
              <Star className="size-4 text-amber-500" />
              掉落规则
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <p>头像补给：R 卡直接获得；SR / SSR 通过碎片合成，已拥有头像不会再次掉落。</p>
                <p>讲师补给：未拥有讲师掉落碎片，满 10 片自动解锁；重复讲师会转化为亲密度。</p>
                <p>十连享受 9 抽价格，结果会直接写回头像库存、讲师碎片和余额。</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <GachaRevealDialog
        open={drawOpen}
        phase={drawPhase}
        result={drawResult}
        onClose={() => {
          if (drawing) return;
          setDrawOpen(false);
          setDrawResult(null);
          setDrawPhase('charging');
        }}
      />
    </>
  );
}
