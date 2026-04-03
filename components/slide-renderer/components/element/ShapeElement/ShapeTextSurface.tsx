'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ShapeTextVerticalAlign = 'top' | 'middle' | 'bottom';

function alignToJustify(align: ShapeTextVerticalAlign) {
  if (align === 'top') return 'justify-start';
  if (align === 'bottom') return 'justify-end';
  return 'justify-center';
}

function ShapeTextSurfaceDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 select-none" aria-hidden>
      <div
        className={cn(
          'absolute inset-0 opacity-[0.55] motion-reduce:opacity-40',
          'bg-[linear-gradient(145deg,rgba(255,255,255,0.22)_0%,transparent_42%,rgba(0,0,0,0.04)_100%)]',
          'dark:bg-[linear-gradient(145deg,rgba(255,255,255,0.12)_0%,transparent_48%,rgba(0,0,0,0.18)_100%)]',
          'motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out',
          'motion-reduce:transition-none',
          'group-hover/shape-text:opacity-[0.82] motion-reduce:group-hover/shape-text:opacity-40',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[min(40%,5rem)] opacity-50',
          'bg-gradient-to-b from-white/25 to-transparent dark:from-white/12',
          'motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out',
          'motion-reduce:transition-none',
          'group-hover/shape-text:translate-y-px group-hover/shape-text:opacity-[0.72]',
          'motion-reduce:group-hover/shape-text:translate-y-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-[6%] top-[10%] h-px opacity-30',
          'bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/35',
          'motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out',
          'motion-reduce:transition-none',
          'group-hover/shape-text:opacity-55',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-[10%] bottom-[10%] h-[2px] opacity-[0.08] blur-[1px]',
          'bg-gradient-to-r from-transparent via-black to-transparent dark:via-white',
          'motion-safe:transition-[opacity,filter] motion-safe:duration-300 motion-safe:ease-out',
          'motion-reduce:transition-none',
          'group-hover/shape-text:opacity-[0.14] group-hover/shape-text:blur-[0.5px]',
        )}
      />
    </div>
  );
}

export interface ShapeTextSurfaceProps {
  readonly align: ShapeTextVerticalAlign;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Shared “glass / keynote” treatment for shape text (playback + editor).
 */
export function ShapeTextSurface({ align, style, className, children }: ShapeTextSurfaceProps) {
  return (
    <div
      className={cn(
        'shape-text group/shape-text subpixel-antialiased flex flex-col absolute inset-0',
        'px-3 py-3 sm:px-3.5 sm:py-3.5 leading-relaxed break-words',
        'isolate overflow-hidden text-pretty',
        'motion-safe:transition-[box-shadow] motion-safe:duration-300 motion-safe:ease-out',
        'motion-reduce:transition-none',
        'hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),inset_0_0_24px_-8px_rgba(255,255,255,0.12)]',
        'dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),inset_0_0_28px_-10px_rgba(96,165,250,0.08)]',
        alignToJustify(align),
        className,
      )}
      style={style}
    >
      <ShapeTextSurfaceDecor />
      <div
        className={cn(
          'relative z-[1] min-h-0 min-w-0 w-full max-w-full',
          'motion-safe:transition-[transform,filter] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
          'motion-reduce:transition-none',
          'group-hover/shape-text:-translate-y-px motion-reduce:group-hover/shape-text:translate-y-0',
          'group-hover/shape-text:[filter:drop-shadow(0_2px_6px_rgba(0,0,0,0.06))]',
          'dark:group-hover/shape-text:[filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.35))]',
          'motion-reduce:group-hover/shape-text:filter-none',
          '[&_a]:text-inherit [&_a]:underline [&_a]:decoration-current/45 [&_a]:underline-offset-[0.18em]',
          '[&_a]:transition-[text-decoration-color,opacity] [&_a]:duration-200',
          'hover:[&_a]:decoration-current/80',
          '[&_strong]:font-semibold [&_em]:italic',
          '[&_code]:rounded-[0.2em] [&_code]:bg-black/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.92em] dark:[&_code]:bg-white/[0.1]',
          'motion-safe:[&_code]:transition-[background-color,box-shadow] motion-safe:[&_code]:duration-200',
          'group-hover/shape-text:[&_code]:bg-black/[0.1] dark:group-hover/shape-text:[&_code]:bg-white/[0.14]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
