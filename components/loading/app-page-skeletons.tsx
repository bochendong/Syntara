import type { ReactNode } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const courseGridClassName =
  'm-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,_18rem),1fr))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,_20rem),1fr))] lg:gap-5';

const notebookGridClassName = 'm-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2 2xl:gap-4';

function LoadingBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-full bg-slate-200/80 dark:bg-white/10', className)}
    />
  );
}

function LoadingPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[24px] border border-white/80 bg-white/[0.82] shadow-[0_20px_60px_rgba(15,23,42,0.07)] ring-1 ring-slate-900/[0.025] dark:border-white/10 dark:bg-white/[0.06]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function LoadingStatus({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs font-medium text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200',
        className,
      )}
    >
      <Loader2 className="size-3.5 animate-spin" />
      {children}
    </div>
  );
}

function CourseCardLoading() {
  return (
    <LoadingPanel className="flex min-h-[18rem] flex-col overflow-hidden rounded-[22px] p-0 sm:min-h-[20rem] sm:rounded-[26px]">
      <div className="h-24 bg-gradient-to-br from-blue-50 via-white to-violet-50 sm:h-28 dark:from-blue-500/10 dark:via-white/[0.035] dark:to-violet-500/10" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <LoadingBlock className="h-4 w-24" />
            <LoadingBlock className="h-6 w-4/5 rounded-lg" />
            <LoadingBlock className="h-3 w-36" />
          </div>
          <LoadingBlock className="size-9 shrink-0 rounded-xl" />
        </div>
        <div className="space-y-2">
          <LoadingBlock className="h-3 w-full" />
          <LoadingBlock className="h-3 w-11/12" />
          <LoadingBlock className="h-3 w-2/3" />
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <LoadingBlock className="h-6 w-16" />
          <LoadingBlock className="h-6 w-20" />
          <LoadingBlock className="h-6 w-14" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <LoadingBlock className="h-10 rounded-xl" />
          <LoadingBlock className="h-10 rounded-xl" />
        </div>
      </div>
    </LoadingPanel>
  );
}

export function MyCoursesCourseGridLoading() {
  return (
    <section aria-busy="true" aria-label="正在加载课程列表">
      <LoadingStatus>正在加载课程…</LoadingStatus>
      <ul className={courseGridClassName}>
        {Array.from({ length: 3 }).map((_, idx) => (
          <li key={idx} className="min-w-0" aria-hidden="true">
            <CourseCardLoading />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyCoursesLoadingSkeleton() {
  return (
    <div className="relative min-h-full w-full overflow-hidden apple-mesh-bg">
      <main className="relative z-10 mx-auto w-full max-w-6xl px-3 pb-8 pt-4 sm:px-4 sm:pb-10 sm:pt-6 md:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <LoadingPanel className="mb-5 rounded-2xl p-5 sm:mb-6 sm:rounded-[24px] sm:p-6 lg:mb-8 lg:rounded-[28px] lg:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <LoadingBlock className="h-10 w-44 rounded-xl" />
              <div className="space-y-2">
                <LoadingBlock className="h-3.5 w-full max-w-2xl" />
                <LoadingBlock className="h-3.5 w-4/5 max-w-xl" />
              </div>
            </div>
            <LoadingBlock className="h-11 w-28 shrink-0 rounded-xl" />
          </div>
        </LoadingPanel>
        <MyCoursesCourseGridLoading />
      </main>
    </div>
  );
}

function NotebookCardLoading({ tone = 'blue' }: { tone?: 'blue' | 'green' | 'violet' | 'amber' }) {
  const stripeClassName = {
    blue: 'bg-blue-100 dark:bg-blue-500/15',
    green: 'bg-emerald-100 dark:bg-emerald-500/15',
    violet: 'bg-violet-100 dark:bg-violet-500/15',
    amber: 'bg-amber-100 dark:bg-amber-500/15',
  }[tone];

  return (
    <LoadingPanel className="grid min-h-[10.75rem] grid-cols-[2rem_minmax(0,0.46fr)_minmax(0,0.74fr)] overflow-hidden rounded-2xl p-0">
      <div className={cn('relative h-full', stripeClassName)}>
        <div className="absolute left-1/2 top-5 size-2 -translate-x-1/2 rounded-full bg-white shadow-sm" />
        <div className="absolute left-1/2 top-14 size-2 -translate-x-1/2 rounded-full bg-white shadow-sm" />
        <div className="absolute bottom-8 left-1/2 size-2 -translate-x-1/2 rounded-full bg-white shadow-sm" />
      </div>
      <div className="flex items-center p-4 pr-2">
        <div className="aspect-[16/10] w-full animate-pulse rounded-xl border border-slate-200/80 bg-slate-100/80 shadow-sm dark:border-white/10 dark:bg-white/10" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4 pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <LoadingBlock className="h-4 w-4/5 rounded-md" />
            <LoadingBlock className="h-3 w-36" />
          </div>
          <div className="flex gap-2">
            <LoadingBlock className="size-8 rounded-xl" />
            <LoadingBlock className="size-8 rounded-xl" />
          </div>
        </div>
        <LoadingBlock className="h-3 w-full" />
        <LoadingBlock className="h-3 w-3/4" />
        <div className="mt-auto rounded-xl border border-slate-200/75 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid grid-cols-3 gap-2">
            <LoadingBlock className="h-4 rounded-md" />
            <LoadingBlock className="h-4 rounded-md" />
            <LoadingBlock className="h-4 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LoadingBlock className="h-9 rounded-xl" />
          <LoadingBlock className="h-9 rounded-xl" />
        </div>
      </div>
    </LoadingPanel>
  );
}

export function CourseWorkspaceLoadingContent() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="正在加载课程工作区">
      <LoadingPanel className="rounded-2xl p-3.5 sm:p-4 md:rounded-[24px] md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
            <LoadingBlock className="size-14 shrink-0 rounded-2xl sm:size-16 md:size-[4.25rem]" />
            <div className="min-w-0 flex-1 space-y-4">
              <LoadingBlock className="h-7 w-full max-w-[28rem] rounded-xl sm:h-9" />
              <div className="flex flex-wrap gap-2">
                <LoadingBlock className="h-7 w-14 rounded-lg" />
                <LoadingBlock className="h-7 w-20 rounded-lg" />
                <LoadingBlock className="h-7 w-36 rounded-lg" />
                <LoadingBlock className="h-7 w-14 rounded-full" />
                <LoadingBlock className="h-7 w-16 rounded-full" />
              </div>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <LoadingBlock className="h-9 rounded-xl" />
            <LoadingBlock className="h-9 rounded-xl" />
            <LoadingBlock className="h-9 rounded-xl" />
            <LoadingBlock className="h-9 rounded-xl" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <LoadingBlock className="h-3.5 w-full rounded-md" />
          <LoadingBlock className="h-3.5 w-11/12 rounded-md" />
          <LoadingBlock className="h-3.5 w-3/4 rounded-md" />
        </div>
      </LoadingPanel>

      <div>
        <LoadingStatus>正在加载笔记本…</LoadingStatus>
        <div className="mb-4 flex gap-8 border-b border-slate-200/80 dark:border-white/10">
          <div className="flex h-12 items-center gap-2 border-b-2 border-blue-500 text-sm font-semibold text-blue-600">
            <BookOpen className="size-4" />
            笔记本
          </div>
          <LoadingBlock className="mt-3 h-5 w-24 rounded-md" />
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13.5rem] xl:grid-cols-[minmax(0,1fr)_15.5rem] 2xl:grid-cols-[minmax(0,1fr)_16.5rem]">
          <section className="min-w-0">
            <ul className={notebookGridClassName}>
              <li className="min-w-0">
                <NotebookCardLoading tone="blue" />
              </li>
              <li className="min-w-0">
                <NotebookCardLoading tone="green" />
              </li>
              <li className="min-w-0">
                <NotebookCardLoading tone="violet" />
              </li>
              <li className="min-w-0">
                <NotebookCardLoading tone="amber" />
              </li>
            </ul>
          </section>
          <aside className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:block lg:space-y-3">
            <LoadingPanel className="rounded-2xl p-3">
              <LoadingBlock className="h-4 w-20 rounded-md" />
              <div className="mt-4 grid place-items-center">
                <div className="grid size-16 animate-pulse place-items-center rounded-full bg-blue-100 dark:bg-blue-500/15">
                  <div className="size-12 rounded-full bg-white dark:bg-slate-950" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <LoadingBlock className="h-8 rounded-md" />
                <LoadingBlock className="h-8 rounded-md" />
                <LoadingBlock className="h-8 rounded-md" />
              </div>
            </LoadingPanel>
            <LoadingPanel className="rounded-2xl p-3">
              <LoadingBlock className="h-4 w-20 rounded-md" />
              <LoadingBlock className="mt-4 h-4 w-full rounded-md" />
              <LoadingBlock className="mt-2 h-3 w-2/3 rounded-md" />
              <LoadingBlock className="mt-4 h-9 w-24 rounded-xl" />
            </LoadingPanel>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function CourseWorkspaceLoadingSkeleton() {
  return (
    <div className="min-h-full w-full bg-[#f3f6fb] dark:bg-[#0e1117]">
      <main className="mx-auto w-full max-w-[80rem] px-3 pb-10 pt-4 md:px-4 lg:px-5 xl:px-6">
        <CourseWorkspaceLoadingContent />
      </main>
    </div>
  );
}

export function ClassroomLoadingSkeleton({ subtitle = '正在加载笔记本…' }: { subtitle?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden apple-mesh-bg">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/[0.72] px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
          <div className="min-w-0 flex-1 space-y-2">
            <LoadingBlock className="h-4 w-56 rounded-md" />
            <LoadingBlock className="h-2.5 w-36 rounded-md" />
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <LoadingBlock className="h-8 w-20 rounded-xl" />
            <LoadingBlock className="h-8 w-24 rounded-xl" />
            <LoadingBlock className="size-8 rounded-xl" />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <aside className="hidden w-48 shrink-0 rounded-2xl border border-white/80 bg-white/[0.72] p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.055] lg:block">
            <LoadingBlock className="h-4 w-24 rounded-md" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <LoadingBlock className="h-10 w-14 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <LoadingBlock className="h-3 w-full rounded-md" />
                    <LoadingBlock className="h-2.5 w-2/3 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col rounded-[24px] border border-white/80 bg-white/[0.74] p-4 shadow-[0_22px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.055]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <LoadingStatus className="mb-0">{subtitle}</LoadingStatus>
              <div className="hidden gap-2 sm:flex">
                <LoadingBlock className="h-8 w-20 rounded-xl" />
                <LoadingBlock className="h-8 w-20 rounded-xl" />
              </div>
            </div>
            <div className="grid min-h-0 flex-1 place-items-center rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-6 dark:border-white/10 dark:bg-slate-950/50">
              <div className="w-full max-w-4xl">
                <div className="aspect-[16/9] w-full animate-pulse rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]" />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <LoadingBlock className="h-3 rounded-md" />
                  <LoadingBlock className="h-3 rounded-md" />
                  <LoadingBlock className="h-3 rounded-md" />
                </div>
              </div>
            </div>
          </main>

          <aside className="hidden w-72 shrink-0 rounded-2xl border border-white/80 bg-white/[0.72] p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055] xl:block">
            <LoadingBlock className="h-4 w-28 rounded-md" />
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-white/10">
                <LoadingBlock className="h-3 w-28 rounded-md" />
                <LoadingBlock className="mt-3 h-3 w-full rounded-md" />
                <LoadingBlock className="mt-2 h-3 w-4/5 rounded-md" />
              </div>
              <div className="rounded-2xl bg-blue-50/90 p-3 dark:bg-blue-500/10">
                <LoadingBlock className="h-3 w-24 rounded-md" />
                <LoadingBlock className="mt-3 h-3 w-full rounded-md" />
                <LoadingBlock className="mt-2 h-3 w-2/3 rounded-md" />
              </div>
            </div>
          </aside>
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-slate-200/70 bg-white/[0.74] px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
          <div className="flex gap-2">
            <LoadingBlock className="h-8 w-20 rounded-xl" />
            <LoadingBlock className="h-8 w-20 rounded-xl" />
          </div>
          <LoadingBlock className="h-9 w-44 rounded-full" />
          <LoadingBlock className="h-8 w-24 rounded-xl" />
        </footer>
      </div>
    </div>
  );
}
