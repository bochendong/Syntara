'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MemoryListDetailLayoutItem = {
  id: string;
  title: string;
};

type MemoryListDetailLayoutProps<TItem extends MemoryListDetailLayoutItem> = {
  detailClassName?: string;
  countLabel?: string;
  emptyMessage: ReactNode;
  eyebrow?: string;
  items: TItem[];
  layoutClassName?: string;
  listClassName?: string;
  maxItems?: number;
  onSelectItem: (itemId: string) => void;
  renderDetail: (item: TItem | null) => ReactNode;
  renderItemMeta?: (item: TItem) => ReactNode;
  selectedItemId?: string | null;
  title: string;
};

export function MemoryListDetailLayout<TItem extends MemoryListDetailLayoutItem>({
  countLabel,
  detailClassName,
  emptyMessage,
  eyebrow = '列表记忆',
  items,
  layoutClassName,
  listClassName,
  maxItems,
  onSelectItem,
  renderDetail,
  renderItemMeta,
  selectedItemId,
  title,
}: MemoryListDetailLayoutProps<TItem>) {
  const visibleItems = typeof maxItems === 'number' ? items.slice(0, maxItems) : items;
  const selectedItem =
    visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0] || null;

  return (
    <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
      <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-normal text-blue-700 dark:text-blue-200">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          {countLabel || `${items.length} 条`}
        </span>
      </div>

      {items.length > 0 ? (
        <div
          className={cn(
            'grid min-h-0 gap-3 p-3 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]',
            layoutClassName,
          )}
        >
          <div
            className={cn(
              'max-h-[68dvh] min-w-0 overflow-y-auto rounded-2xl border border-slate-200/75 bg-slate-50/55 p-2 dark:border-white/10 dark:bg-black/15',
              listClassName,
            )}
          >
            <div className="grid gap-2">
              {visibleItems.map((item) => {
                const active = item.id === selectedItem?.id;

                return (
                  <article
                    key={item.id}
                    className={cn(
                      'rounded-2xl border bg-white/82 p-3 shadow-sm transition-colors dark:bg-white/[0.045]',
                      active
                        ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200/80 dark:border-blue-300/30 dark:bg-blue-500/12 dark:ring-blue-300/15'
                        : 'border-slate-200/85 hover:border-blue-200 hover:bg-blue-50/35 dark:border-white/10 dark:hover:border-blue-300/20 dark:hover:bg-blue-500/10',
                    )}
                  >
                    <button
                      type="button"
                      className="block w-full min-w-0 text-left"
                      aria-pressed={active}
                      onClick={() => onSelectItem(item.id)}
                    >
                      <span className="line-clamp-2 block text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                        {item.title}
                      </span>
                      {renderItemMeta ? (
                        <span className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                          {renderItemMeta(item)}
                        </span>
                      ) : null}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <div className={cn('min-w-0', detailClassName)}>{renderDetail(selectedItem)}</div>
        </div>
      ) : (
        <div className="p-3">
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
            {emptyMessage}
          </div>
        </div>
      )}
    </section>
  );
}
