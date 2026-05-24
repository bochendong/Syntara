'use client';

import { Languages } from 'lucide-react';
import type { ProblemContentLanguage } from '@/lib/problem-bank';
import { cn } from '@/lib/utils';

export function ProblemLanguageToggle({
  value,
  locale,
  className,
  onChange,
}: {
  value: ProblemContentLanguage;
  locale: 'zh-CN' | 'en-US';
  className?: string;
  onChange: (language: ProblemContentLanguage) => void;
}) {
  const label = locale === 'zh-CN' ? '题目语言' : 'Problem language';

  return (
    <div
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-950',
        className,
      )}
      aria-label={label}
      role="group"
    >
      <Languages className="ml-1 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      {(['zh-CN', 'en-US'] as const).map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => onChange(language)}
          aria-pressed={value === language}
          className={cn(
            'h-6 min-w-10 rounded-md px-2 transition',
            value === language
              ? 'bg-sky-600 text-white shadow-sm dark:bg-sky-400 dark:text-slate-950'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
          )}
        >
          {language === 'zh-CN' ? '中文' : 'EN'}
        </button>
      ))}
    </div>
  );
}
