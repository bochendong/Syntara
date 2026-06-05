'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Live2DStudyCompanion = dynamic(
  () => import('@/components/live2d-study-companion').then((mod) => mod.Live2DStudyCompanion),
  { ssr: false, loading: () => null },
);

export function Live2DStudyCompanionLauncher({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);

  if (open) {
    return (
      <>
        <Live2DStudyCompanion />
        <button
          type="button"
          aria-label="关闭伴学角色"
          title="关闭伴学角色"
          className={cn(
            'fixed bottom-4 right-4 z-[1460] inline-flex size-10 items-center justify-center rounded-full border border-white/70 bg-slate-950/72 text-white shadow-[0_14px_34px_rgba(15,23,42,0.26)] backdrop-blur-xl transition hover:bg-slate-950/86 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            className,
          )}
          onClick={() => setOpen(false)}
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      aria-label="打开伴学角色"
      title="伴学角色"
      className={cn(
        'fixed bottom-4 right-4 z-[1460] inline-flex size-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/15 dark:bg-slate-950/78 dark:text-slate-100 dark:hover:bg-slate-900',
        className,
      )}
      onClick={() => setOpen(true)}
    >
      <MessageCircle className="size-5" strokeWidth={2.1} />
    </button>
  );
}
