'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { listStages, type StageListItem } from '@/lib/utils/stage-storage';
import { listCourses } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { notebookCourseContext } from '@/lib/utils/course-display';
import { cn } from '@/lib/utils';

function formatUpdated(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function AgentTeamsPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [courseRecords, setCourseRecords] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const courseById = useMemo(
    () => new Map(courseRecords.map((c) => [c.id, c] as const)),
    [courseRecords],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      const [stages, courses] = await Promise.all([listStages(), listCourses()]);
      if (!alive) return;
      setNotebooks(stages);
      setCourseRecords(courses);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.45),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.8),transparent_35%),linear-gradient(180deg,#f5f8ff_0%,#edf2f7_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.35),transparent_45%),linear-gradient(180deg,#0b0f16_0%,#111827_100%)]">
      <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 rounded-[28px] border border-white/60 bg-white/70 p-6 backdrop-blur-xl shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-black/25">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            AgentTeams
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            本地所有笔记本一览；已归入课程的将进入课程页，其余进入课堂。
          </p>
        </section>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-white/60 dark:bg-white/5"
              />
            ))}
          </div>
        ) : notebooks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
            还没有笔记本。
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-0">
            {notebooks.map((nb) => {
              const { parentCourseName, schoolLine } = notebookCourseContext(nb, courseById);
              const href =
                nb.courseId && courseById.has(nb.courseId)
                  ? `/course/${nb.courseId}`
                  : `/classroom/${nb.id}`;
              return (
                <li key={nb.id}>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-sm transition-colors',
                      'hover:border-violet-200/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:hover:border-violet-500/25 dark:hover:bg-black/30',
                    )}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                      {nb.avatarUrl ? (
                        <img src={nb.avatarUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <BookOpen className="size-5 text-slate-400" strokeWidth={1.75} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900 dark:text-white">
                        {nb.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-slate-400 dark:text-slate-500">课程</span>{' '}
                        {parentCourseName}
                        {schoolLine ? (
                          <>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-slate-400 dark:text-slate-500">学校</span>{' '}
                            {schoolLine}
                          </>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        更新 {formatUpdated(nb.updatedAt)} · {nb.sceneCount} 节
                      </p>
                    </div>
                    <ChevronRight
                      className="size-5 shrink-0 text-slate-300 dark:text-slate-600"
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
