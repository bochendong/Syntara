'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpenText, Loader2, Plus, ShoppingBag, Sparkles, Target } from 'lucide-react';
import { CreateCourseDialog } from '@/components/courses/create-course-dialog';
import { Button } from '@/components/ui/button';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { cn } from '@/lib/utils';
import type { CourseRecord } from '@/lib/utils/database';
import { listCourses } from '@/lib/utils/course-storage';

function compactDate(value: number | string | undefined): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function isCreatorCourse(course: CourseRecord): boolean {
  return course.accessRole !== 'enrolled' && !course.sourceCourseId;
}

function CourseStudioCard({
  course,
  onOpen,
}: {
  course: CourseRecord;
  onOpen: (course: CourseRecord) => void;
}) {
  const avatar = resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl);
  const isStoreReady = Boolean(course.listedInCourseStore || course.storePublishedAt);
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-background p-4">
      <div className="flex min-w-0 items-start gap-3">
        <img src={avatar} alt="" className="size-12 rounded-lg object-cover ring-1 ring-black/5" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{course.name}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {[course.university, course.courseCode, course.tags?.[0]].filter(Boolean).join(' · ') ||
              `更新 ${compactDate(course.updatedAt)}`}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            isStoreReady
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isStoreReady ? '已上架' : '草稿'}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
        {course.description || '课程说明待补充'}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-muted px-2 py-2">
          <p className="text-base font-semibold">{course.notebookCount ?? 0}</p>
          <p className="text-muted-foreground">笔记本</p>
        </div>
        <div className="rounded-md bg-muted px-2 py-2">
          <p className="text-base font-semibold">{course.problemCount ?? 0}</p>
          <p className="text-muted-foreground">题库</p>
        </div>
        <div className="rounded-md bg-muted px-2 py-2">
          <p className="text-base font-semibold">{course.speechReadyCount ?? 0}</p>
          <p className="text-muted-foreground">语音</p>
        </div>
      </div>
      <Button onClick={() => onOpen(course)} className="mt-4 w-full">
        进入 Studio
      </Button>
    </article>
  );
}

export function CreatorDashboardClient() {
  const router = useRouter();
  const authHydrated = usePersistHydrated(useAuthStore);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const setCurrentCourse = useCurrentCourseStore((state) => state.setCurrentCourse);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createCourseOpen, setCreateCourseOpen] = useState(false);

  const loadCreatorCourses = useCallback(async () => {
    const items = await listCourses();
    setCourses(items.filter(isCreatorCourse));
  }, []);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    loadCreatorCourses()
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '课程加载失败');
        setLoading(false);
      });
  }, [authHydrated, isLoggedIn, router, loadCreatorCourses]);

  const totals = useMemo(
    () => ({
      courses: courses.length,
      notebooks: courses.reduce((total, course) => total + (course.notebookCount ?? 0), 0),
      problems: courses.reduce((total, course) => total + (course.problemCount ?? 0), 0),
      listed: courses.filter((course) => course.listedInCourseStore || course.storePublishedAt)
        .length,
    }),
    [courses],
  );

  const openStudio = (course: CourseRecord) => {
    setCurrentCourse({ id: course.id, name: course.name, avatarUrl: course.avatarUrl });
    router.push(`/creator/courses/${encodeURIComponent(course.id)}`);
  };

  if (!authHydrated || loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载创作者工作台…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">Creator Studio</p>
          <h1 className="mt-1 text-2xl font-semibold">课程创作者工作台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            课程内容地图、笔记本、题库、记忆和商城发布都从这里进入。
          </p>
        </div>
        <Button onClick={() => setCreateCourseOpen(true)} className="gap-2">
          <Plus className="size-4" />
          新建课程
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '课程', value: totals.courses, icon: BookOpenText },
          { label: '笔记本', value: totals.notebooks, icon: Sparkles },
          { label: '题库题目', value: totals.problems, icon: Target },
          { label: '已上架', value: totals.listed, icon: ShoppingBag },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-background p-4">
            <item.icon className="size-4 text-muted-foreground" />
            <p className="mt-3 text-2xl font-semibold">{item.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <CourseStudioCard key={course.id} course={course} onOpen={openStudio} />
        ))}
        {courses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
            <BookOpenText className="mx-auto size-9 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">还没有课程</h2>
            <Button onClick={() => setCreateCourseOpen(true)} className="mt-4 gap-2">
              <Plus className="size-4" />
              创建第一门课
            </Button>
          </div>
        ) : null}
      </section>
      <CreateCourseDialog
        open={createCourseOpen}
        onOpenChange={setCreateCourseOpen}
        onSuccess={async () => {
          setLoading(true);
          await loadCreatorCourses();
          setLoading(false);
        }}
      />
    </div>
  );
}
