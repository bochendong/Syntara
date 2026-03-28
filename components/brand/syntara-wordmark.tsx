'use client';

import { cn } from '@/lib/utils';
import { SyntaraMark } from '@/components/brand/syntara-mark';

export function SyntaraWordmark({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <SyntaraMark className={cn('size-11 md:size-14 rounded-2xl shadow-lg md:rounded-[14px]', markClassName)} />
      <span
        className={cn(
          'text-xl font-bold tracking-[-0.04em] text-slate-900 md:text-2xl dark:text-slate-50',
          textClassName,
        )}
      >
        Syntara
      </span>
    </div>
  );
}
