'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const PrismaticBurst = dynamic(
  () => import('@/components/gamification/prismatic-burst/prismatic-burst-inner.jsx'),
  { ssr: false },
);

/** 与 react-bits 文档示例一致；`color0/1/2` 无对应 API，用 `colors` 三色渐变。 */
const NOTIFICATION_BAR_PRISMATIC = {
  animationType: 'rotate3d' as const,
  intensity: 2,
  speed: 0.5,
  distort: 0,
  paused: false,
  offset: { x: 0, y: 0 },
  hoverDampness: 0.25,
  rayCount: 0,
  mixBlendMode: 'lighten' as const,
  colors: ['#ff007a', '#4d3dff', '#ffffff'],
};

type PrismaticBurstStageBackgroundProps = {
  className?: string;
};

/**
 * 棱彩爆发动效（PrismaticBurst / ogl，WebGL2 着色器）。仅客户端渲染。
 * 内层为 `position: relative` 的占满容器，与通知条 `absolute/inset-0` 层配合。
 */
export function PrismaticBurstStageBackground({ className }: PrismaticBurstStageBackgroundProps) {
  const props = useMemo(() => NOTIFICATION_BAR_PRISMATIC, []);
  return (
    <div className={cn('relative h-full w-full min-h-full overflow-hidden', className)}>
      <PrismaticBurst {...props} />
    </div>
  );
}
