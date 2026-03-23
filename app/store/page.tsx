'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  getFirstSlideByStages,
  listStages,
  moveStageToCourse,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';
import { listCourses } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { notebookCourseContext } from '@/lib/utils/course-display';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
    if (!currentCourseId) {
      router.replace('/store/courses');
      return;
    }
    void loadStoreData();
  }, [isLoggedIn, currentCourseId, router, loadStoreData]);

  /** 从其他页签/课堂返回时刷新，避免列表与本地数据库不一致 */
  useEffect(() => {
    if (!isLoggedIn || !currentCourseId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadStoreData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoggedIn, currentCourseId, loadStoreData]);

  if (!isLoggedIn) return null;

  if (!currentCourseId) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center text-sm text-muted-foreground">
        正在前往课程商城…
      </div>
    );
  }

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.05)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            笔记本商城
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            浏览你账号下全部互动笔记本。当前已选课程为下方操作目标：可将未归属或其它课程的笔记本一键加入该课程，或直接进入课堂。
          </p>
          <div
            className={cn(
              'mt-4 rounded-xl border px-3 py-2 text-sm',
              'border-violet-200/80 bg-violet-50/80 text-violet-950 dark:border-violet-500/25 dark:bg-violet-950/30 dark:text-violet-100',
            )}
          >
            当前目标课程：<span className="font-medium">{currentCourseName || currentCourseId}</span>
            <span className="text-muted-foreground">
              {' '}
              — 若笔记本尚不在该课程下，主按钮为「加入当前课程」；已在该课程下则进入课堂。
            </span>
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
              const inCurrentCourse =
                Boolean(currentCourseId) && nb.courseId === currentCourseId;
              const needsJoin = Boolean(currentCourseId) && !inCurrentCourse;
              const actionLabel = needsJoin ? '加入当前课程' : '进入笔记本';
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
                  actionLabel={actionLabel}
                  onAction={async () => {
                    if (needsJoin && currentCourseId) {
                      try {
                        await moveStageToCourse(nb.id, currentCourseId);
                        toast.success('已将该笔记本加入当前课程');
                        await loadStoreData({ silent: true });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : '操作失败');
                      }
                      return;
                    }
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
