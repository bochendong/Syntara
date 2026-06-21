'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircleQuestion, SendHorizonal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SceneSidebarAskBubble } from '@/lib/utils/scene-sidebar-ask-thread';
import { PublicReplyProgress } from '@/components/chat/public-reply-progress';

interface ClassroomAskButtonProps {
  readonly open: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

export function ClassroomAskButton({ open, disabled, onToggle }: ClassroomAskButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={open}
      aria-label={open ? '关闭提问' : '打开提问'}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all duration-200 ease-out',
        'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        open
          ? 'border-sky-300 bg-sky-100 text-sky-900 shadow-sm dark:border-sky-400/35 dark:bg-sky-950/55 dark:text-sky-100'
          : 'border-slate-200 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:bg-sky-50 hover:text-sky-700 hover:shadow-sm dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-sky-950/35 dark:hover:text-sky-100',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      title={open ? '关闭提问' : '打开提问'}
    >
      <MessageCircleQuestion className="size-4" />
      <span>提问</span>
    </button>
  );
}

interface ClassroomAskSidebarProps {
  readonly open: boolean;
  readonly thread: SceneSidebarAskBubble[];
  readonly thinking?: boolean;
  readonly streaming?: boolean;
  readonly paused?: boolean;
  readonly onActivate?: () => Promise<void> | void;
  readonly onSubmit: (message: string) => void;
  readonly onClose: () => void;
}

export function ClassroomAskSidebar({
  open,
  thread,
  thinking = false,
  streaming = false,
  paused = false,
  onActivate,
  onSubmit,
  onClose,
}: ClassroomAskSidebarProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, thread]);

  if (!open) return null;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSubmit(text);
  };

  const statusText = thinking ? '思考中' : paused ? '已暂停' : streaming ? '回答中' : '待提问';

  return (
    <aside
      aria-label="提问侧栏"
      className={cn(
        'flex h-full min-h-0 w-[19rem] shrink-0 flex-col border-l border-slate-900/[0.08] bg-white/88 backdrop-blur-xl',
        'dark:border-white/[0.08] dark:bg-[#0f1115]/88',
      )}
    >
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.06]">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">提问</h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{statusText}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[10px] p-1.5 text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
          aria-label="关闭提问"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
        {thread.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col justify-center rounded-2xl border border-dashed border-sky-200/80 bg-sky-50/50 px-4 text-center text-sm leading-6 text-slate-500 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-slate-300">
            听不清、没跟上，或者想追问这一页，都可以直接问。
          </div>
        ) : (
          <div className="space-y-3">
            {thread.map((message) => {
              const isAssistant = message.role === 'assistant';
              const hasContent = message.content.trim().length > 0;
              const showProgress =
                isAssistant &&
                (Boolean(message.statusText) || Boolean(message.progressSteps?.length));
              return (
                <div
                  key={message.id}
                  className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl px-3 py-2.5 text-sm leading-6 shadow-sm',
                      isAssistant
                        ? 'border border-sky-200/70 bg-white text-slate-700 dark:border-sky-500/20 dark:bg-slate-900/80 dark:text-slate-100'
                        : 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950',
                    )}
                  >
                    {hasContent ? (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    ) : message.pending && !showProgress ? (
                      <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-300">
                        <Loader2 className="size-3.5 animate-spin" />
                        正在组织回答
                      </span>
                    ) : null}
                    {showProgress ? (
                      <PublicReplyProgress
                        statusText={
                          message.statusText || (!hasContent ? '正在组织回答' : undefined)
                        }
                        steps={message.progressSteps}
                        compact
                        className={hasContent ? undefined : 'mt-0'}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-900/[0.06] p-3 dark:border-white/[0.06]">
        <div className="rounded-2xl border border-slate-900/[0.08] bg-white/90 p-2 shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-black/20">
          <textarea
            ref={inputRef}
            value={draft}
            onFocus={() => void onActivate?.()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="问一下这页..."
            className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-full transition-all',
                draft.trim()
                  ? 'bg-[#007AFF] text-white shadow-[0_10px_24px_rgba(0,122,255,0.28)] hover:bg-[#0a84ff]'
                  : 'cursor-not-allowed bg-slate-200/80 text-slate-400 dark:bg-white/[0.08] dark:text-white/30',
              )}
              aria-label="发送提问"
            >
              <SendHorizonal className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
