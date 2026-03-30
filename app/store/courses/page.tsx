'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { useAuthStore } from '@/lib/store/auth';
import {
  cloneCourseFromStore,
  createCourse,
  listCommunityStoreCourses,
  listCourses,
} from '@/lib/utils/course-storage';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { COURSE_STORE_TEMPLATES } from '@/lib/constants/course-store-templates';
import type { CommunityCourseListItem, CourseRecord } from '@/lib/utils/database';
import { markCourseOwnedByUser } from '@/lib/utils/course-ownership';
import { toast } from 'sonner';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';

function formatDate(ts: number | string) {
  return new Date(ts).toLocaleDateString();
}

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

function courseSecondaryLabel(course: CourseRecord): string {
  const base = purposeLabel(course.purpose);
  if (course.purpose !== 'university') return base;
  const uniBits = [course.university?.trim(), course.courseCode?.trim()].filter(Boolean);
  return uniBits.length > 0 ? `${base} · ${uniBits.join(' · ')}` : base;
}

export default function CourseStorePage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.userId);
  const [mine, setMine] = useState<Array<{ course: CourseRecord; notebookCount: number }>>([]);
  const [community, setCommunity] = useState<CommunityCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const [courses, communityRows] = await Promise.all([
        listCourses(),
        listCommunityStoreCourses().catch(() => [] as CommunityCourseListItem[]),
      ]);
      const withCounts = await Promise.all(
        courses.map(async (course) => {
          const notebookCount = (await listStagesByCourse(course.id)).length;
          return { course, notebookCount };
        }),
      );
      setMine(withCounts);
      setCommunity(communityRows);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    void load();
  }, [isLoggedIn, router, load]);

  const handleAddTemplate = async (tpl: (typeof COURSE_STORE_TEMPLATES)[number]) => {
    setAddingId(`tpl:${tpl.id}`);
    try {
      const isUni = tpl.purpose === 'university';
      const course = await createCourse({
        name: tpl.name,
        description: tpl.description,
        language: tpl.language,
        tags: tpl.tags,
        purpose: tpl.purpose,
        university: isUni ? tpl.university : undefined,
        courseCode: isUni ? tpl.courseCode : undefined,
      });
      toast.success(`已添加课程「${course.name}」`);
      await load();
      router.push(`/course/${course.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAddingId(null);
    }
  };

  const handleCloneCommunityCourse = async (item: CommunityCourseListItem) => {
    setAddingId(`c:${item.id}`);
    try {
      const course = await cloneCourseFromStore(item.id);
      if (userId) markCourseOwnedByUser(userId, course.id);
      toast.success(`已复制课程「${course.name}」到我的课程`);
      await load();
      router.push(`/course/${course.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制失败');
    } finally {
      setAddingId(null);
    }
  };

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.05)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            课程商城
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            浏览推荐模板与社区课程。创作者可为课程定价并发布到商城；用户购买课程后，会把整门课程连同全部笔记本深拷贝到自己的空间。
          </p>
          <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/25 dark:text-emerald-100">
            侧栏在未选择课程时，「课程商城」即本页。选择课程后，侧栏「商城」将打开笔记本商城。
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">推荐模板</h2>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-72 animate-pulse rounded-[26px] bg-white/60 dark:bg-white/5"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {COURSE_STORE_TEMPLATES.map((tpl, i) => {
                const cardItem = {
                  id: tpl.id,
                  name: tpl.name,
                  description: tpl.description,
                  sceneCount: 0,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                return (
                  <CourseGalleryCard
                    key={tpl.id}
                    listIndex={i}
                    course={cardItem}
                    tags={tpl.tags}
                    badge="课程模板"
                    subtitle={purposeLabel(tpl.purpose)}
                    secondaryLabel="课程容器"
                    countUnit="个笔记本"
                    actionLabel={addingId === `tpl:${tpl.id}` ? '添加中…' : '添加到我的课程'}
                    onAction={() => handleAddTemplate(tpl)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">社区课程</h2>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-72 animate-pulse rounded-[26px] bg-white/60 dark:bg-white/5"
                />
              ))}
            </div>
          ) : community.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
              暂无社区课程。请其他用户在课程页「编辑课程」中开启「在课程商城展示」，或稍后再来查看。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {community.map((item, i) => {
                const cardItem = {
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  sceneCount: item.notebookCount,
                  createdAt:
                    typeof item.createdAt === 'number'
                      ? item.createdAt
                      : new Date(item.createdAt).getTime(),
                  updatedAt:
                    typeof item.updatedAt === 'number'
                      ? item.updatedAt
                      : new Date(item.updatedAt).getTime(),
                };
                return (
                  <CourseGalleryCard
                    key={item.id}
                    listIndex={i}
                    course={cardItem}
                    tags={item.tags.length > 0 ? item.tags : undefined}
                    badge="社区课程"
                    subtitle={formatDate(item.updatedAt)}
                    secondaryLabel={`创作者 · ${item.ownerName}`}
                    countUnit="个笔记本"
                    priceLabel={`¥${((item.coursePriceCents ?? 0) / 100).toFixed(2)}`}
                    ratingLabel={`★ ${(item.averageRating ?? 0).toFixed(1)} · ${item.reviewCount ?? 0} 条`}
                    actionLabel="查看详情"
                    onAction={() => router.push(`/store/courses/${item.id}`)}
                    secondaryActionLabel={
                      addingId === `c:${item.id}` ? '购买中…' : item.purchased ? '已购买' : '购买'
                    }
                    onSecondaryAction={
                      item.purchased || addingId === `c:${item.id}`
                        ? undefined
                        : () => void handleCloneCommunityCourse(item)
                    }
                    coverAvatarUrl={resolveCourseAvatarDisplayUrl(item.id, item.avatarUrl)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            我已有的课程
          </h2>
          {loading ? null : mine.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
              暂无课程。可在上方从模板添加，或前往「我的课程」新建空白课程。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {mine.map(({ course, notebookCount }, i) => {
                const cardItem = {
                  id: course.id,
                  name: course.name,
                  description: course.description,
                  sceneCount: notebookCount,
                  createdAt: course.createdAt,
                  updatedAt: course.updatedAt,
                };
                return (
                  <CourseGalleryCard
                    key={course.id}
                    listIndex={i}
                    course={cardItem}
                    tags={course.tags.length > 0 ? course.tags : undefined}
                    badge="我的课程"
                    subtitle={formatDate(course.updatedAt)}
                    secondaryLabel={courseSecondaryLabel(course)}
                    countUnit="个笔记本"
                    actionLabel="进入课程"
                    onAction={() => router.push(`/course/${course.id}`)}
                    coverAvatarUrl={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
