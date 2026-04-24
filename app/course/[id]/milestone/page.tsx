'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { GamificationSummaryCard } from '@/components/gamification/gamification-summary-card';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import type { CourseRecord } from '@/lib/utils/database';

export default function CourseMilestonePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebookCount, setNotebookCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const c = await getCourse(id);
      if (!alive) return;
      if (!c) {
        setCourse(null);
        setNotebookCount(0);
        setLoading(false);
        return;
      }
      const stages = await listStagesByCourse(id);
      if (!alive) return;
      setCourse(c);
      setNotebookCount(stages.length);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id, isLoggedIn, router]);

  useEffect(() => {
    if (loading || !id) return;
    if (!course) {
      useCurrentCourseStore.getState().clearCurrentCourse();
      return;
    }
    if (course.id !== id) return;
    useCurrentCourseStore.getState().setCurrentCourse({
      id: course.id,
      name: course.name,
      avatarUrl: course.avatarUrl,
    });
  }, [course, id, loading]);

  if (!isLoggedIn) return null;

  if (!loading && course === null) {
    return (
      <div className="min-h-full w-full apple-mesh-bg">
        <main className="mx-auto max-w-6xl px-4 py-12 md:px-8">
          <p className="text-center text-slate-600 dark:text-slate-300">未找到该课程。</p>
          <div className="mt-6 flex justify-center">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/my-courses">返回我的课程</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full apple-mesh-bg">
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        {loading || !course ? (
          <div
            className="h-[22rem] animate-pulse rounded-[28px] bg-white/40 dark:bg-white/5"
            style={{ backdropFilter: 'blur(10px)' }}
          />
        ) : (
          <>
            <GamificationSummaryCard
              title="这门课的学习激励"
              courseMilestone={{
                courseId: course.id,
                courseName: course.name,
                enabled: notebookCount > 0,
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
