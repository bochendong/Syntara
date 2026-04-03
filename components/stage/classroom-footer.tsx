'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ClassroomFooterProps {
  readonly leadingSlot?: ReactNode;
  /** 底栏正中（如播放控制条）；与左右两栏用三列网格对齐 */
  readonly centerSlot?: ReactNode;
  readonly trailingSlot?: ReactNode;
  readonly className?: string;
}

export function ClassroomFooter({
  leadingSlot,
  centerSlot,
  trailingSlot,
  className,
}: ClassroomFooterProps) {
  if (!leadingSlot && !centerSlot && !trailingSlot) return null;

  return (
    <footer
      className={cn(
        'z-10 shrink-0 border-t border-slate-900/[0.06] bg-white/72 backdrop-blur-xl',
        'dark:border-white/[0.08] dark:bg-[#0d0d10]/62',
        className,
      )}
    >
      <div className="flex flex-col items-stretch gap-2 px-3 py-2 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-3 md:px-4">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 md:justify-self-start">
          {leadingSlot}
        </div>
        <div className="flex min-w-0 justify-center overflow-x-auto md:justify-self-center">
          {centerSlot}
        </div>
        <div className="flex min-w-0 shrink-0 items-center justify-end justify-self-end overflow-x-auto">
          {trailingSlot}
        </div>
      </div>
    </footer>
  );
}
