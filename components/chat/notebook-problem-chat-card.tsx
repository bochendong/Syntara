'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpenCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotebookProblemChatCard } from './chat-page-types';

export function notebookProblemAskConversationText(card: NotebookProblemChatCard): string {
  const pieces = [
    `题目：${card.title}`,
    card.problemNumber ? `题号：${card.problemNumber}` : null,
    card.notebookName ? `章节：${card.notebookName}` : null,
    `入口：${card.href}`,
  ].filter(Boolean);
  return `\n\n【题目卡片】${pieces.join('；')}`;
}

export function NotebookProblemChatCardView({
  card,
  className,
}: {
  card: NotebookProblemChatCard;
  className?: string;
}) {
  const problemLabel = card.problemNumber ? `题目 ${card.problemNumber}` : '题目';
  return (
    <Link
      href={card.href}
      className={cn(
        'group block w-full max-w-[min(78vw,460px)] rounded-lg border border-sky-200 bg-sky-50/95 px-3 py-2.5 text-left shadow-sm transition',
        'hover:border-sky-300 hover:bg-sky-100/80 dark:border-sky-500/20 dark:bg-sky-500/10 dark:hover:border-sky-400/40 dark:hover:bg-sky-500/15',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-sky-700 shadow-sm dark:bg-sky-400/15 dark:text-sky-100">
          <BookOpenCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-semibold text-sky-700 dark:text-sky-200">
            <span>{problemLabel}</span>
            {card.notebookName ? (
              <span className="min-w-0 truncate font-medium text-sky-600/80 dark:text-sky-100/70">
                {card.notebookName}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block line-clamp-2 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-50">
            {card.title}
          </span>
        </span>
        <ArrowUpRight className="mt-1 size-4 shrink-0 text-sky-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-sky-200" />
      </div>
    </Link>
  );
}
