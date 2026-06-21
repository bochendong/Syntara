import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { PublicReplyProgressStep } from '@/lib/types/chat';
import { cn } from '@/lib/utils';

interface PublicReplyProgressProps {
  readonly statusText?: string | null;
  readonly steps?: PublicReplyProgressStep[];
  readonly compact?: boolean;
  readonly className?: string;
}

export function PublicReplyProgress({
  statusText,
  steps = [],
  compact = false,
  className,
}: PublicReplyProgressProps) {
  const visibleStatusText = statusText?.trim();
  if (!visibleStatusText && steps.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-slate-200',
        compact && 'rounded-xl px-2.5 py-2 text-[11px]',
        className,
      )}
      aria-live="polite"
    >
      {visibleStatusText ? (
        <div className="flex min-w-0 items-center gap-2 font-medium text-sky-700 dark:text-sky-100">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span className="min-w-0 truncate">{visibleStatusText}</span>
        </div>
      ) : null}
      {steps.length > 0 ? (
        <ol className={cn('mt-2 space-y-1.5', !visibleStatusText && 'mt-0')}>
          {steps.map((step) => (
            <li key={step.id} className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center">
                {step.status === 'complete' ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                ) : step.status === 'active' ? (
                  <Loader2 className="size-3.5 animate-spin text-sky-600 dark:text-sky-200" />
                ) : (
                  <Circle className="size-3 text-slate-300 dark:text-slate-500" />
                )}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 leading-5',
                  step.status === 'active'
                    ? 'font-medium text-slate-900 dark:text-slate-50'
                    : step.status === 'pending'
                      ? 'text-slate-400 dark:text-slate-500'
                      : 'text-slate-500 dark:text-slate-300',
                )}
              >
                {step.label}
                {!compact && step.description ? (
                  <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {step.description}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
