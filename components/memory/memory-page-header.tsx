'use client';

import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MemoryPageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backHref: string;
  backLabel: string;
  icon: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

export function MemoryPageHeader({
  title,
  subtitle,
  eyebrow = '记忆',
  backHref,
  backLabel,
  icon: Icon,
  actions,
  className,
}: MemoryPageHeaderProps) {
  return (
    <header
      className={cn(
        'rounded-[22px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_42px_rgba(15,23,42,0.075)] ring-1 ring-slate-900/[0.025] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/62',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-blue-200/80 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-300/20 dark:bg-blue-400/12 dark:text-blue-100">
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Link
                href={backHref}
                className="inline-flex min-w-0 items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <ArrowLeft className="size-3.5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{backLabel}</span>
              </Link>
              <span aria-hidden>/</span>
              <span className="truncate text-slate-800 dark:text-slate-100">{eyebrow}</span>
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 line-clamp-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
