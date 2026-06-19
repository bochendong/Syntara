'use client';

import { ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StorefrontItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  eyebrow?: string;
  badge?: string;
  courseCode?: string;
  artworkUrl?: string;
  metadata?: string[];
  openLabel?: string;
  onOpen?: () => void;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryActionDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionDisabled?: boolean;
}

interface StoreActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: 'blue' | 'soft';
  ariaLabel?: string;
  className?: string;
}

function StoreActionButton({
  label,
  onClick,
  disabled,
  emphasis = 'soft',
  ariaLabel,
  className,
}: StoreActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-9 min-w-0 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-semibold transition-colors',
        emphasis === 'blue'
          ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-400/12 dark:text-sky-200 dark:hover:bg-sky-400/18'
          : 'bg-slate-100 text-sky-600 hover:bg-slate-200/80 dark:bg-white/8 dark:text-sky-200 dark:hover:bg-white/12',
        disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
    >
      {label}
    </button>
  );
}

function StoreArtwork({
  item,
  size,
}: {
  item: Pick<StorefrontItem, 'title' | 'artworkUrl'>;
  size: 'feature' | 'row';
}) {
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border border-slate-200/80 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/8 dark:shadow-[0_12px_30px_rgba(0,0,0,0.2)]',
        size === 'feature'
          ? 'size-20 rounded-[22px] sm:size-28 sm:rounded-[28px] md:size-36'
          : 'size-14 rounded-[16px] sm:size-16',
      )}
    >
      {item.artworkUrl ? (
        <img src={item.artworkUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-slate-100 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300">
          <BookOpen className={size === 'feature' ? 'size-9' : 'size-6'} strokeWidth={1.8} />
        </div>
      )}
    </div>
  );
}

export function StoreFeatureCard({
  item,
  className,
}: {
  item: StorefrontItem;
  className?: string;
}) {
  const open = item.onOpen ?? item.onPrimaryAction;
  const courseCode = item.courseCode?.trim();

  return (
    <article
      className={cn(
        'min-w-0 overflow-hidden rounded-[26px] border border-slate-200/75 bg-white/74 shadow-[0_18px_54px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:shadow-[0_22px_60px_rgba(0,0,0,0.24)]',
        className,
      )}
    >
      <div className="flex min-h-0 flex-col items-start gap-5 p-4 sm:min-h-[13rem] sm:flex-row sm:items-center sm:p-6">
        <button type="button" onClick={open} className="shrink-0 sm:order-2">
          <StoreArtwork item={item} size="feature" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <button type="button" onClick={open} className="min-w-0 text-left">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-500 uppercase dark:text-slate-400">
                {item.eyebrow ?? item.badge ?? '精选'}
              </span>
              {courseCode ? (
                <span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-sky-200/85 bg-sky-50/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200">
                  {courseCode}
                </span>
              ) : null}
            </span>
            <h3 className="mt-2 line-clamp-2 text-xl font-semibold text-slate-950 sm:text-2xl dark:text-white">
              {item.title}
            </h3>
            {item.description ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {item.description}
              </p>
            ) : item.subtitle ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {item.subtitle}
              </p>
            ) : null}
          </button>

          {item.metadata && item.metadata.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.metadata.slice(0, 3).map((meta) => (
                <span key={meta} className="store-chip store-chip-soft text-[11px]">
                  {meta}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex w-full flex-col gap-2 pt-5 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
            {item.openLabel ? (
              <StoreActionButton
                label={item.openLabel}
                onClick={open}
                emphasis="blue"
                ariaLabel={`${item.openLabel}：${item.title}`}
                className="w-full min-[420px]:w-auto"
              />
            ) : null}
            <StoreActionButton
              label={item.primaryActionLabel}
              onClick={item.onPrimaryAction}
              disabled={item.primaryActionDisabled}
              ariaLabel={`${item.primaryActionLabel}：${item.title}`}
              className="w-full min-[420px]:w-auto"
            />
            {item.secondaryActionLabel && item.onSecondaryAction ? (
              <StoreActionButton
                label={item.secondaryActionLabel}
                onClick={item.onSecondaryAction}
                disabled={item.secondaryActionDisabled}
                ariaLabel={`${item.secondaryActionLabel}：${item.title}`}
                className="w-full min-[420px]:w-auto"
              />
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function StoreFeatureStrip({
  items,
  className,
}: {
  items: StorefrontItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn('grid gap-5 xl:grid-cols-2', className)}>
      {items.map((item) => (
        <StoreFeatureCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function StoreListItem({ item }: { item: StorefrontItem }) {
  const open = item.onOpen ?? item.onPrimaryAction;
  const metadata = item.metadata?.filter(Boolean).slice(0, 3).join(' · ');
  const courseCode = item.courseCode?.trim();

  return (
    <article className="flex min-h-[6.25rem] min-w-0 flex-col gap-3 border-t border-slate-200/75 py-3.5 sm:flex-row sm:items-center dark:border-white/10">
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <StoreArtwork item={item} size="row" />
        <span className="min-w-0 flex-1">
          {item.badge || courseCode ? (
            <span className="mb-0.5 flex min-w-0 items-center gap-1.5">
              {item.badge ? (
                <span className="min-w-0 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {item.badge}
                </span>
              ) : null}
              {courseCode ? (
                <span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-sky-200/85 bg-sky-50/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200">
                  {courseCode}
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="block truncate text-base font-semibold text-slate-950 dark:text-white">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-sm text-slate-500 dark:text-slate-400">
            {item.subtitle ?? item.description ?? metadata}
          </span>
          {metadata ? (
            <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">
              {metadata}
            </span>
          ) : null}
        </span>
      </button>

      <div className="flex w-full shrink-0 flex-col gap-2 min-[420px]:flex-row sm:w-auto sm:items-center">
        <StoreActionButton
          label={item.primaryActionLabel}
          onClick={item.onPrimaryAction}
          disabled={item.primaryActionDisabled}
          ariaLabel={`${item.primaryActionLabel}：${item.title}`}
          className="w-full min-[420px]:w-auto"
        />
        {item.secondaryActionLabel && item.onSecondaryAction ? (
          <StoreActionButton
            label={item.secondaryActionLabel}
            onClick={item.onSecondaryAction}
            disabled={item.secondaryActionDisabled}
            ariaLabel={`${item.secondaryActionLabel}：${item.title}`}
            className="w-full min-[420px]:w-auto"
          />
        ) : null}
      </div>
    </article>
  );
}

export function StoreListSection({
  eyebrow,
  title,
  subtitle,
  items,
  actionLabel,
  onAction,
  emptyTitle,
  emptyDescription,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items: StorefrontItem[];
  actionLabel?: string;
  onAction?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  return (
    <section className={cn('border-t border-slate-200/75 pt-6 dark:border-white/10', className)}>
      <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-sm font-semibold text-slate-500 uppercase dark:text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-600 transition-colors hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
          >
            {actionLabel}
            <ArrowRight className="size-4" />
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-slate-200/75 bg-white/70 p-8 text-center dark:border-white/10 dark:bg-white/6">
          <p className="text-base font-semibold text-slate-950 dark:text-white">
            {emptyTitle ?? '暂无内容'}
          </p>
          {emptyDescription ? (
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {emptyDescription}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <StoreListItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
