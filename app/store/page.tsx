'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpenCheck, Layers3, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  StoreFeatureStrip,
  StoreListSection,
  type StorefrontItem,
} from '@/components/store/storefront-sections';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { listStages, moveStageToCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listCourses } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { notebookCourseContext } from '@/lib/utils/course-display';
import { toast } from '@/lib/notifications/client-toast';
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

function useStoreContextHydrated() {
  const authHydrated = usePersistHydrated(useAuthStore);
  const courseHydrated = usePersistHydrated(useCurrentCourseStore);

  return authHydrated && courseHydrated;
}

export default function StorePage() {
  const router = useRouter();
  const storeContextHydrated = useStoreContextHydrated();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const currentCourseId = useCurrentCourseStore((s) => s.id);
  const currentCourseName = useCurrentCourseStore((s) => s.name);

  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [courseRecords, setCourseRecords] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const courseById = useMemo(
    () => new Map(courseRecords.map((course) => [course.id, course] as const)),
    [courseRecords],
  );

  const loadStoreData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!storeContextHydrated || !isLoggedIn) return;
      if (!opts?.silent) setLoading(true);
      try {
        const [allNotebooks, courses] = await Promise.all([listStages(), listCourses()]);
        setNotebooks(allNotebooks);
        setCourseRecords(courses);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [storeContextHydrated, isLoggedIn],
  );

  useEffect(() => {
    if (!storeContextHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!currentCourseId) {
      router.replace('/store/courses');
      return;
    }
    void loadStoreData();
  }, [storeContextHydrated, isLoggedIn, currentCourseId, router, loadStoreData]);

  useEffect(() => {
    if (!storeContextHydrated || !isLoggedIn || !currentCourseId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadStoreData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [storeContextHydrated, isLoggedIn, currentCourseId, loadStoreData]);

  const sortedNotebooks = useMemo(
    () => [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt),
    [notebooks],
  );
  const recommendedNotebooks = useMemo(
    () => sortedNotebooks.filter((nb) => nb.courseId !== currentCourseId).slice(0, 9),
    [currentCourseId, sortedNotebooks],
  );
  const inCourseNotebooks = useMemo(
    () => sortedNotebooks.filter((nb) => nb.courseId === currentCourseId).slice(0, 9),
    [currentCourseId, sortedNotebooks],
  );

  const handleNotebookAction = useCallback(
    async (nb: StageListItem) => {
      if (!currentCourseId) return;
      const needsJoin = nb.courseId !== currentCourseId;

      if (!needsJoin) {
        router.push(`/classroom/${nb.id}`);
        return;
      }

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
    },
    [currentCourseId, currentCourseName, loadStoreData, router],
  );

  const toNotebookStorefrontItem = useCallback(
    (nb: StageListItem): StorefrontItem => {
      const tags = tagsForNotebook(nb, courseById);
      const { parentCourseName, schoolLine } = notebookCourseContext(nb, courseById);
      const needsJoin = nb.courseId !== currentCourseId;

      return {
        id: nb.id,
        title: nb.name,
        subtitle: needsJoin
          ? parentCourseName
            ? `来自 · ${parentCourseName}`
            : '跨课程内容补充'
          : '当前课程内容',
        description:
          nb.description || `${nb.sceneCount} 页互动内容，更新于 ${formatDate(nb.updatedAt)}。`,
        eyebrow: needsJoin ? 'Curated For This Course' : 'Already In Course',
        badge: needsJoin ? '可加入当前课程' : '当前课程',
        artworkUrl: resolveNotebookAgentAvatarDisplayUrl(nb.id, nb.avatarUrl),
        metadata: [
          tags[0],
          `${nb.sceneCount} 页`,
          schoolLine || parentCourseName || `更新于 ${formatDate(nb.updatedAt)}`,
        ].filter(Boolean) as string[],
        openLabel: needsJoin ? undefined : '进入笔记本',
        onOpen: () => void handleNotebookAction(nb),
        primaryActionLabel: needsJoin ? '加入' : '打开',
        onPrimaryAction: () => void handleNotebookAction(nb),
        secondaryActionLabel: needsJoin ? undefined : '复习',
        onSecondaryAction: needsJoin ? undefined : () => router.push(`/review/${nb.id}`),
      };
    },
    [courseById, currentCourseId, handleNotebookAction, router],
  );

  const featuredNotebookItems = useMemo(
    () => recommendedNotebooks.slice(0, 2).map(toNotebookStorefrontItem),
    [recommendedNotebooks, toNotebookStorefrontItem],
  );

  const recommendedNotebookItems = useMemo(
    () => recommendedNotebooks.map(toNotebookStorefrontItem),
    [recommendedNotebooks, toNotebookStorefrontItem],
  );

  const inCourseNotebookItems = useMemo(
    () => inCourseNotebooks.map(toNotebookStorefrontItem),
    [inCourseNotebooks, toNotebookStorefrontItem],
  );

  if (!storeContextHydrated || !isLoggedIn) return null;

  if (!currentCourseId) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center text-sm text-muted-foreground">
        正在前往课程商城…
      </div>
    );
  }

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-3 pb-16 pt-4 sm:px-4 sm:pt-6 md:px-8 md:pb-20 lg:px-10 lg:pt-8">
        <section className="store-hero-panel relative overflow-hidden px-4 py-6 sm:rounded-[40px] sm:px-6 sm:py-8 md:px-10 md:py-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
                Notebook Library
              </p>
              <h1 className="mt-4 text-3xl font-semibold text-slate-950 sm:text-4xl md:text-6xl dark:text-white">
                为当前课程继续挑选合适的互动笔记本。
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg dark:text-slate-300">
                当前目标课程为
                <span className="font-semibold text-slate-900 dark:text-white">
                  {` ${currentCourseName || currentCourseId} `}
                </span>
                。这里展示你账号下全部笔记本，并把“加入课程”和“直接进入”拆成更清晰的内容商店体验。
              </p>
              <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const target = recommendedNotebooks[0] ?? sortedNotebooks[0];
                    if (!target) return;
                    router.push(`/classroom/${target.id}`);
                  }}
                  className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold min-[420px]:w-auto"
                >
                  浏览精选笔记本
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/learn?courseId=${encodeURIComponent(currentCourseId)}`)
                  }
                  className="store-cta-secondary rounded-full px-5 py-3 text-sm font-semibold min-[420px]:w-auto"
                >
                  返回课程学习
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 xl:gap-4">
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">目标课程</p>
                <p className="mt-2 flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-white">
                  <BookOpenCheck className="size-5" />
                  {currentCourseName || '未命名课程'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  新加入的笔记本会直接归入这门课程，用于继续组织课堂内容。
                </p>
              </div>
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">你的内容库</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
                  {notebooks.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  所有互动笔记本都会在这里整理成可继续复用的内容货架。
                </p>
              </div>
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
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

        <section className="mt-10">
          {loading ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="h-52 animate-pulse rounded-[26px] bg-white/70 dark:bg-white/6" />
              <div className="h-52 animate-pulse rounded-[26px] bg-white/70 dark:bg-white/6" />
            </div>
          ) : featuredNotebookItems.length > 0 ? (
            <StoreFeatureStrip items={featuredNotebookItems} />
          ) : null}
        </section>

        {loading ? (
          <section className="mt-12 border-t border-slate-200/75 pt-6 dark:border-white/10">
            <div className="mb-5 h-9 w-56 animate-pulse rounded-full bg-white/70 dark:bg-white/6" />
            <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[6.25rem] animate-pulse border-t border-slate-200/75 py-3.5 dark:border-white/10"
                >
                  <div className="h-full rounded-2xl bg-white/70 dark:bg-white/6" />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <StoreListSection
            className="mt-12"
            eyebrow="Curated For This Course"
            title="推荐加入当前课程"
            subtitle="优先展示还没有归入当前课程的笔记本，使用和课程商城一致的紧凑榜单浏览。"
            items={recommendedNotebookItems}
            emptyTitle="当前内容都已经整理进这门课程了"
            emptyDescription="你没有额外的笔记本可加入当前课程。可以返回首页继续创建新内容，或直接进入现有笔记本。"
          />
        )}

        {!loading && inCourseNotebookItems.length > 0 ? (
          <StoreListSection
            className="mt-12"
            eyebrow="Already In Course"
            title="已经在当前课程中的内容"
            subtitle="已归属当前课程的笔记本会把主操作切换为打开，并保留复习入口。"
            items={inCourseNotebookItems}
          />
        ) : null}

        <section className="mt-14">
          <div className="store-section-panel flex flex-col gap-6 px-5 py-6 sm:rounded-[36px] md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                <Sparkles className="size-4" />
                需要新的课程内容来源？
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                回到课程商城，继续挑选更多可复制的整门课程。
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push('/store/courses')}
              className="store-cta-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold md:w-auto"
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
