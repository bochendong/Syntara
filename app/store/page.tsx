'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpenCheck, Layers3, Sparkles } from 'lucide-react';
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
import { toast } from 'sonner';
import { resolveNotebookAgentAvatarDisplayUrl } from '@/lib/constants/notebook-agent-avatars';
import {
  getPurchasedNotebookMoveSuccessMessage,
  getPurchasedNotebookMoveWarning,
} from '@/lib/utils/course-publish';

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
    () => new Map(courseRecords.map((course) => [course.id, course] as const)),
    [courseRecords],
  );

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

  useEffect(() => {
    if (!isLoggedIn || !currentCourseId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadStoreData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoggedIn, currentCourseId, loadStoreData]);

  const sortedNotebooks = useMemo(
    () => [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt),
    [notebooks],
  );
  const recommendedNotebooks = useMemo(
    () => sortedNotebooks.filter((nb) => nb.courseId !== currentCourseId).slice(0, 6),
    [currentCourseId, sortedNotebooks],
  );
  const inCourseNotebooks = useMemo(
    () => sortedNotebooks.filter((nb) => nb.courseId === currentCourseId).slice(0, 3),
    [currentCourseId, sortedNotebooks],
  );

  if (!isLoggedIn) return null;

  if (!currentCourseId) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center text-sm text-muted-foreground">
        正在前往课程商城…
      </div>
    );
  }

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-4 pb-20 pt-8 md:px-8 lg:px-10">
        <section className="store-hero-panel relative overflow-hidden rounded-[40px] px-6 py-8 md:px-10 md:py-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
                Notebook Library
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-6xl dark:text-white">
                为当前课程继续挑选合适的互动笔记本。
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg dark:text-slate-300">
                当前目标课程为
                <span className="font-semibold text-slate-900 dark:text-white">
                  {` ${currentCourseName || currentCourseId} `}
                </span>
                。这里展示你账号下全部笔记本，并把“加入课程”和“直接进入”拆成更清晰的内容商店体验。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const target = recommendedNotebooks[0] ?? sortedNotebooks[0];
                    if (!target) return;
                    router.push(`/classroom/${target.id}`);
                  }}
                  className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold"
                >
                  浏览精选笔记本
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/course/${currentCourseId}`)}
                  className="store-cta-secondary rounded-full px-5 py-3 text-sm font-semibold"
                >
                  返回当前课程
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">目标课程</p>
                <p className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                  <BookOpenCheck className="size-5" />
                  {currentCourseName || '未命名课程'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  新加入的笔记本会直接归入这门课程，用于继续组织课堂内容。
                </p>
              </div>
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">你的内容库</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  {notebooks.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  所有互动笔记本都会在这里整理成可继续复用的内容货架。
                </p>
              </div>
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">已在课程内</p>
                <p className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <Layers3 className="size-4" />
                  {inCourseNotebooks.length} 本可直接进入
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  已归属当前课程的笔记本会把主操作切换为“进入笔记本”。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Curated For This Course
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                推荐加入当前课程
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                优先展示还没有归入当前课程的笔记本，方便你快速补充教学内容。
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[30rem] animate-pulse rounded-[32px] bg-white/70 dark:bg-white/6"
                />
              ))}
            </div>
          ) : recommendedNotebooks.length === 0 ? (
            <div className="store-section-panel rounded-[32px] p-10 text-center">
              <p className="text-lg font-semibold text-slate-950 dark:text-white">
                当前内容都已经整理进这门课程了
              </p>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                你没有额外的笔记本可加入当前课程。可以返回首页继续创建新内容，或直接进入现有笔记本。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {recommendedNotebooks.map((nb) => {
                const tags = tagsForNotebook(nb, courseById);
                const { parentCourseName, schoolLine } = notebookCourseContext(nb, courseById);
                const needsJoin = nb.courseId !== currentCourseId;
                return (
                  <CourseGalleryCard
                    key={nb.id}
                    variant="notebook"
                    course={nb}
                    slide={thumbnails[nb.id]}
                    badge={needsJoin ? '可加入当前课程' : '已在当前课程'}
                    subtitle={`更新于 ${formatDate(nb.updatedAt)}`}
                    secondaryLabel={needsJoin ? '跨课程内容补充' : '当前课程内容'}
                    actionLabel={needsJoin ? '加入当前课程' : '进入笔记本'}
                    onAction={async () => {
                      if (needsJoin) {
                        if (
                          nb.sourceNotebookId &&
                          !window.confirm(getPurchasedNotebookMoveWarning(currentCourseName))
                        ) {
                          return;
                        }
                        try {
                          await moveStageToCourse(nb.id, currentCourseId);
                          toast.success(
                            nb.sourceNotebookId
                              ? getPurchasedNotebookMoveSuccessMessage(currentCourseName)
                              : '已将该笔记本加入当前课程',
                          );
                          await loadStoreData({ silent: true });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : '操作失败');
                        }
                        return;
                      }
                      router.push(`/classroom/${nb.id}`);
                    }}
                    tags={tags}
                    showNotebookCourseMeta
                    parentCourseName={parentCourseName}
                    schoolLine={schoolLine}
                    countUnit="页"
                    coverAvatarUrl={resolveNotebookAgentAvatarDisplayUrl(nb.id, nb.avatarUrl)}
                    tertiaryActionLabel={needsJoin ? undefined : '复习'}
                    onTertiaryAction={needsJoin ? undefined : () => router.push(`/review/${nb.id}`)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {inCourseNotebooks.length > 0 ? (
          <section className="mt-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                  Already In Course
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  已经在当前课程中的内容
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {inCourseNotebooks.map((nb) => {
                const tags = tagsForNotebook(nb, courseById);
                const { parentCourseName, schoolLine } = notebookCourseContext(nb, courseById);
                return (
                  <CourseGalleryCard
                    key={nb.id}
                    variant="notebook"
                    course={nb}
                    slide={thumbnails[nb.id]}
                    badge="当前课程"
                    subtitle={`更新于 ${formatDate(nb.updatedAt)}`}
                    secondaryLabel="可继续教学与编辑"
                    actionLabel="进入笔记本"
                    onAction={() => router.push(`/classroom/${nb.id}`)}
                    tags={tags}
                    showNotebookCourseMeta
                    parentCourseName={parentCourseName}
                    schoolLine={schoolLine}
                    countUnit="页"
                    coverAvatarUrl={resolveNotebookAgentAvatarDisplayUrl(nb.id, nb.avatarUrl)}
                    tertiaryActionLabel="复习"
                    onTertiaryAction={() => router.push(`/review/${nb.id}`)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-14">
          <div className="store-section-panel flex flex-col gap-6 rounded-[36px] px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                <Sparkles className="size-4" />
                需要新的课程内容来源？
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                回到课程商城，继续挑选更多可复制的整门课程。
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push('/store/courses')}
              className="store-cta-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
            >
              打开课程商城
              <ArrowRight className="size-4" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
