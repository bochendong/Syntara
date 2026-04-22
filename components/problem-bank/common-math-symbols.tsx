'use client';

const COMMON_MATH_SYMBOLS = [
  '∈',
  '∉',
  '⊂',
  '⊆',
  '⊄',
  '∪',
  '∩',
  '∅',
  '∀',
  '∃',
  '⇒',
  '⇔',
  '≠',
  '≤',
  '≥',
  '≈',
  '∞',
  '∑',
  '√',
  'π',
] as const;

export function CommonMathSymbols({
  onInsert,
}: {
  locale: 'zh-CN' | 'en-US';
  onInsert: (symbol: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex flex-wrap gap-2">
        {COMMON_MATH_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => onInsert(symbol)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:text-sky-200"
          >
            {symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

