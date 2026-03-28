'use client';

import { cn } from '@/lib/utils';

/** Inline Syntara mark for nav / headers (matches app/icon.svg). */
export function SyntaraMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6366f1_0%,#9333ea_100%)] text-white shadow-[0_8px_24px_rgba(99,102,241,0.35)]',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="size-[62%] max-h-[28px] max-w-[28px]" fill="none" aria-hidden>
        <path
          d="M7 10.5c2.5-2 6.5-2 9 0s6.5 2 9 0 6.5-2 9 0M7 21.5c2.5 2 6.5 2 9 0s6.5-2 9 0 6.5 2 9 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="10.5" r="1.75" fill="currentColor" />
        <circle cx="16" cy="16" r="1.75" fill="currentColor" />
        <circle cx="9" cy="21.5" r="1.75" fill="currentColor" />
      </svg>
    </span>
  );
}
