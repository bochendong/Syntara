'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { hyperspeedPresets } from '@/components/gamification/hyperspeed/hyper-speed-presets.js';

const Hyperspeed = dynamic(
  () => import('@/components/gamification/hyperspeed/hyperspeed-inner.jsx'),
  { ssr: false },
);

/** 通知条/窄条：略减车灯与路侧灯以降负载 */
const NOTIFICATION_BAR_HYPERSPEED = {
  ...hyperspeedPresets.one,
  lightPairsPerRoadWay: 22,
  totalSideLightSticks: 12,
} as const;

type HyperspeedStageBackgroundProps = {
  className?: string;
};

/**
 * 公路穿梭（Hyperspeed / react-bits）全屏底图。根节点不设置 `position`，由父级 `absolute/inset-0` 控制布局。
 * WebGL 仅客户端创建（dynamic ssr: false）。
 */
export function HyperspeedStageBackground({ className }: HyperspeedStageBackgroundProps) {
  const effectOptions = useMemo(() => NOTIFICATION_BAR_HYPERSPEED, []);
  return (
    <div className={cn('relative h-full w-full min-h-full overflow-hidden', className)}>
      <Hyperspeed effectOptions={effectOptions} />
    </div>
  );
}
