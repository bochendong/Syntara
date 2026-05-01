'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateNotebookComposer } from '@/components/create/create-notebook-composer';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { cn } from '@/lib/utils';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';

export default function CourseCreateNotebookPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = typeof params.id === 'string' ? params.id : '';
  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);

  useEffect(() => {
    if (!courseId) {
      router.replace('/my-courses');
      return;
    }
    let alive = true;
    (async () => {
      const record = await getCourse(courseId);
      if (!alive) return;
      setCourse(record ?? null);
      if (record) {
        useCurrentCourseStore.getState().setCurrentCourse({
          id: record.id,
          name: record.name,
          avatarUrl: record.avatarUrl,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId, router]);

  if (course === undefined) {
    return (
      <div className="apple-mesh-bg flex min-h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="apple-mesh-bg flex min-h-full items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-white/80 p-7 text-center shadow-lg backdrop-blur-xl dark:bg-slate-900/80">
          <NotebookPen className="mx-auto mb-4 size-9 text-muted-foreground" strokeWidth={1.7} />
          <h1 className="text-lg font-semibold">未找到课程</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            请回到课程列表重新选择一门课程后再创建笔记本。
          </p>
          <Button asChild className="mt-5 rounded-xl">
            <Link href="/my-courses">回到我的课程</Link>
          </Button>
        </div>
      </div>
    );
  }

  const courseAvatarUrl = resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl);

  return (
    <div
      className={cn(
        'apple-mesh-bg box-border flex min-h-full w-full flex-col overflow-hidden',
        'px-4 py-4 md:px-7 md:py-6',
      )}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <Button asChild variant="ghost" className="h-9 rounded-xl px-3 text-muted-foreground">
            <Link href={`/course/${encodeURIComponent(course.id)}`}>
              <ArrowLeft className="mr-1.5 size-4" strokeWidth={1.8} />
              课程主页
            </Link>
          </Button>
          <div className="truncate text-right text-xs text-muted-foreground">{course.name}</div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col justify-center py-6 md:py-8">
          <div className="mx-auto w-full max-w-[820px]">
            <div className="mb-6 flex items-center gap-4">
              {courseAvatarUrl ? (
                <img
                  src={courseAvatarUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-muted-foreground shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                  <NotebookPen className="size-7" strokeWidth={1.7} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  创建笔记本
                </p>
                <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {course.name}
                </h1>
              </div>
            </div>

            <CreateNotebookComposer courseId={course.id} />
          </div>
        </main>
      </div>
    </div>
  );
}
