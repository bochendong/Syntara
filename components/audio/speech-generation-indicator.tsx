'use client';

import { cn } from '@/lib/utils';

export function SpeechGenerationIndicator({
  label,
  done,
  total,
  className,
}: {
  label: string;
  done: number;
  total: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex h-3 items-end gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-current/80"
            style={{
              height: `${6 + i * 2}px`,
              animation: `speech-gen-bars 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
            }}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
      <span className="tabular-nums opacity-75">
        {done}/{total}
      </span>
      <style jsx>{`
        @keyframes speech-gen-bars {
          from {
            transform: scaleY(0.55);
            opacity: 0.45;
          }
          to {
            transform: scaleY(1.15);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}
