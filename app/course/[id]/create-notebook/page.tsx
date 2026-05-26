'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateNotebookWorkspace } from '@/components/create/create-notebook-workspace';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { cn } from '@/lib/utils';

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

  return (
    <div
      className={cn(
        'box-border flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f8fafc] dark:bg-slate-950',
        'px-3 py-3 md:px-5 md:py-4',
      )}
      style={{
        backgroundImage:
          'radial-gradient(circle at 20% 10%, rgba(59, 130, 246, 0.03), transparent 30%), linear-gradient(rgba(15, 23, 42, 0.008) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.007) 1px, transparent 1px)',
        backgroundSize: 'auto, 36px 36px, 36px 36px',
      }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1520px] flex-1 flex-col">
        <main className="flex h-full min-h-0 flex-1 flex-col">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1460px] flex-1 flex-col">
            <CreateNotebookWorkspace courseId={course.id} />
          </div>
        </main>
      </div>
    </div>
  );
}
