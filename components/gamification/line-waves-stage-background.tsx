'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const LineWaves = dynamic(
  () => import('@/components/gamification/line-waves/line-waves-inner.jsx'),
  { ssr: false },
);

/** 与 react-bits 文档一致；通知条上关闭鼠标、略减线数以省 GPU。 */
const NOTIFICATION_LINE_WAVES = {
  speed: 0.3,
  innerLineCount: 28,
  outerLineCount: 32,
  warpIntensity: 1,
  rotation: -45,
  edgeFadeWidth: 0,
  colorCycleSpeed: 1,
  brightness: 0.22,
  color1: '#ffffff',
  color2: '#e0e7ff',
  color3: '#c4b5fd',
  enableMouseInteraction: false,
  mouseInfluence: 2,
} as const;

type LineWavesStageBackgroundProps = {
  className?: string;
};

/**
 * 线浪（LineWaves / ogl）。根节点不覆盖父级 `position`；`dynamic` 仅客户端起 WebGL。
 */
export function LineWavesStageBackground({ className }: LineWavesStageBackgroundProps) {
  const props = useMemo(() => NOTIFICATION_LINE_WAVES, []);
  return (
    <div className={cn('relative h-full w-full min-h-full overflow-hidden', className)}>
      <LineWaves {...props} />
    </div>
  );
}
