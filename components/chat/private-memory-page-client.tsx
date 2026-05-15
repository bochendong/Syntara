'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, Loader2 } from 'lucide-react';
import { ChatMemoryDrawer } from '@/components/chat/chat-memory-drawer';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { loadStageData } from '@/lib/utils/stage-storage';

type MemoryStageMeta = {
  id: string;
  name: string;
  courseId?: string | null;
};

type LoadedMemoryStage = {
  notebookId: string;
  meta: MemoryStageMeta | null;
};

export function PrivateMemoryPageClient() {
  const searchParams = useSearchParams();
  const notebookId = searchParams.get('notebook');
  const storedCourseId = useCurrentCourseStore((s) => s.id);
  const [loadedStage, setLoadedStage] = useState<LoadedMemoryStage | null>(null);

  useEffect(() => {
    if (!notebookId) return;
    let alive = true;
    void loadStageData(notebookId).then((data) => {
      if (!alive) return;
      setLoadedStage({
        notebookId,
        meta: data?.stage
          ? {
              id: data.stage.id,
              name: data.stage.name,
              courseId: data.stage.courseId,
            }
          : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [notebookId]);

  const stageMeta = loadedStage?.notebookId === notebookId ? loadedStage.meta : null;
  const loadingStage = Boolean(notebookId && loadedStage?.notebookId !== notebookId);
  const courseId = stageMeta?.courseId || storedCourseId;
  const notebookName = stageMeta?.name || '当前笔记本';
  const chatHref = useMemo(
    () => (notebookId ? `/chat?notebook=${encodeURIComponent(notebookId)}` : '/chat'),
    [notebookId],
  );

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-slate-900/[0.06] bg-background/90 px-5 backdrop-blur-md dark:border-white/[0.08]">
        <div className="flex min-h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={chatHref}
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/10"
              aria-label="返回聊天"
            >
              <ArrowLeft className="size-4" strokeWidth={1.8} />
            </Link>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/16 dark:text-[#64B5FF]">
              <Brain className="size-[18px]" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">私有记忆</h1>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{notebookName}</p>
            </div>
          </div>

          {notebookId ? (
            <Link
              href={`/classroom/${encodeURIComponent(notebookId)}`}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#007AFF] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:opacity-[0.92] active:opacity-85 dark:bg-[#0A84FF]"
            >
              <BookOpen className="size-3.5" strokeWidth={1.8} />
              进入笔记本
            </Link>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {!notebookId ? (
            <div className="rounded-2xl border border-slate-900/[0.06] bg-white/70 p-6 text-sm text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.04]">
              请先选择一个笔记本，再查看它的私有记忆。
            </div>
          ) : loadingStage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在读取笔记本记忆…
            </div>
          ) : (
            <ChatMemoryDrawer
              courseId={courseId}
              notebookId={notebookId}
              notebookName={notebookName}
            />
          )}
        </div>
      </div>
    </main>
  );
}
