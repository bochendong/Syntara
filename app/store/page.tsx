'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  getFirstSlideByStages,
  listStages,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';
import { listCourses } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { notebookCourseContext } from '@/lib/utils/course-display';
import { cn } from '@/lib/utils';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

function tagsForNotebook(nb: StageListItem, courseById: Map<string, CourseRecord>): string[] {
  if (nb.courseId) {
    const c = courseById.get(nb.courseId);
    if (c) {
      const fromTags = [...new Set(c.tags.map((t) => t.trim()).filter(Boolean))];
      if (fromTags.length > 0) return fromTags;
      return [purposeLabel(c.purpose)];
    }
    return ['课程已删除'];
  }
  return ['未分课程'];
}

export default function StorePage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const currentCourseId = useCurrentCourseStore((s) => s.id);
  const currentCourseName = useCurrentCourseStore((s) => s.name);

  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [courseRecords, setCourseRecords] = useState<CourseRecord[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [loading, setLoading] = useState(true);

  const courseById = useMemo(
    () => new Map(courseRecords.map((c) => [c.id, c] as const)),
    [courseRecords],
  );

  /** 与 `listStages()` 一致：IndexedDB `stages` 表中的全部笔记本（按更新时间倒序） */
  const loadStoreData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isLoggedIn) return;
      if (!opts?.silent) setLoading(true);
      try {
        const [allNotebooks, courses] = await Promise.all([listStages(), listCourses()]);
        setNotebooks(allNotebooks);
        setCourseRecords(courses);
        const slides = await getFirstSlideByStages(allNotebooks.map((n) => n.id));
        setThumbnails(slides);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [isLoggedIn],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    void loadStoreData();
  }, [isLoggedIn, router, loadStoreData]);

  /** 从其他页签/课堂返回时刷新，避免列表与本地数据库不一致 */
  useEffect(() => {
    if (!isLoggedIn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadStoreData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoggedIn, loadStoreData]);

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.45),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.8),transparent_35%),linear-gradient(180deg,#f5f8ff_0%,#edf2f7_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.35),transparent_45%),linear-gradient(180deg,#0b0f16_0%,#111827_100%)]">
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 rounded-[28px] border border-white/60 bg-white/70 p-6 backdrop-blur-xl shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-black/25">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            笔记本商城
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            本页列出后端数据库中保存的全部互动笔记本（与课堂、我的课程使用同一数据）。卡片标签来自所属课程设置。将笔记本移入课程时，会归入你当前选中的课程（请先从「我的课程」进入一门课，或从课堂返回后保留侧栏课程上下文）。
          </p>
          <div
            className={cn(
              'mt-4 rounded-xl border px-3 py-2 text-sm',
              currentCourseId
                ? 'border-violet-200/80 bg-violet-50/80 text-violet-950 dark:border-violet-500/25 dark:bg-violet-950/30 dark:text-violet-100'
                : 'border-amber-200/80 bg-amber-50/70 text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/25 dark:text-amber-100',
            )}
          >
            {currentCourseId ? (
              <>
                当前目标课程：<span className="font-medium">{currentCourseName || currentCourseId}</span>
                <span className="text-muted-foreground"> — 点击「加入我的课程」将把笔记本移入该课程。</span>
              </>
            ) : (
              <>
                未选择课程：请打开「我的课程」并进入一门课程，或打开该课程下的任意笔记本，再回商城操作。
              </>
            )}
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-72 animate-pulse rounded-[26px] bg-white/60 dark:bg-white/5"
              />
            ))}
          </div>
        ) : notebooks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
            后端数据库中还没有笔记本记录。先在首页或课堂里创建并保存内容，保存后会出现在此列表。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((nb, i) => {
              const tags = tagsForNotebook(nb, courseById);
              const { parentCourseName, schoolLine } = notebookCourseContext(nb, courseById);
              return (
                <CourseGalleryCard
                  key={nb.id}
                  listIndex={i}
                  course={nb}
                  coverAvatarUrl={nb.avatarUrl}
                  slide={thumbnails[nb.id]}
                  tags={tags}
                  showNotebookCourseMeta
                  parentCourseName={parentCourseName}
                  schoolLine={schoolLine}
                  badge="我的笔记本"
                  subtitle={formatDate(nb.updatedAt)}
                  secondaryLabel="互动课件"
                  actionLabel="进入笔记本"
                  onAction={async () => {
                    router.push(`/classroom/${nb.id}`);
                  }}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
