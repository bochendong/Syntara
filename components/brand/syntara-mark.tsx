'use client';

import { cn } from '@/lib/utils';

/** Inline Syntara mark for nav / headers (matches app/icon.svg). */
export function SyntaraMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-[0_8px_24px_rgba(15,35,72,0.12)] ring-1 ring-[#d8e6f6] dark:bg-[#071b3d] dark:ring-white/10',
        className,
      )}
      aria-hidden
    >
      <img
        src="/brand/syntara-mark.png"
        alt=""
        className="size-[86%] object-contain"
        draggable={false}
      />
    </span>
  );
}
