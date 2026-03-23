'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth';
import { CreateCourseForm } from '@/components/courses/create-course-form';

export default function NewCoursePage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full bg-[radial-gradient(circle_at_20%_0%,rgba(191,219,254,0.45),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.35),transparent_45%),linear-gradient(180deg,#0a0f18_0%,#0f172a_100%)]">
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 md:px-8 md:pt-10">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-lg" asChild>
            <Link href="/my-courses">返回</Link>
          </Button>
        </div>

        <section className="rounded-[24px] border border-white/60 bg-white/80 p-6 shadow-[0_18px_46px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            新建课程
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            先创建课程，再在该课程下生成笔记本。
          </p>

          <CreateCourseForm
            className="mt-8"
            onSuccess={(courseId) => router.push(`/course/${courseId}`)}
          />
        </section>
      </main>
    </div>
  );
}
