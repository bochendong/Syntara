'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import { CreateNotebookComposer } from '@/components/create/create-notebook-composer';
import { SyntaraWordmark } from '@/components/brand/syntara-wordmark';

function CreateNotebookPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const storeCourseId = useCurrentCourseStore((s) => s.id);
  const storeCourseName = useCurrentCourseStore((s) => s.name);

  useEffect(() => {
    const cid = courseId?.trim();
    if (!cid) {
      useCurrentCourseStore.getState().clearCurrentCourse();
      return;
    }
    let alive = true;
    (async () => {
      const c = await getCourse(cid);
      if (!alive) return;
      if (c) {
        useCurrentCourseStore.getState().setCurrentCourse({
          id: c.id,
          name: c.name,
          avatarUrl: c.avatarUrl,
        });
      } else {
        useCurrentCourseStore.getState().clearCurrentCourse();
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  if (!courseId?.trim()) {
    return (
      <div
        className={cn(
          'relative box-border flex min-h-full w-full flex-col items-center justify-center',
          'bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900',
          'px-4 pb-4 pt-8 md:px-8 md:pt-10',
        )}
      >
        <div className="max-w-md rounded-2xl border border-border/60 bg-white/80 p-8 text-center shadow-lg backdrop-blur-xl dark:bg-slate-900/80">
          <p className="text-sm leading-relaxed text-muted-foreground">
            笔记本需要创建在某一门课程下。请先在「我的课程」中打开课程，再点击「新建笔记本」；或先
            <Link href="/courses/new" className="mx-1 font-medium text-primary underline-offset-4 hover:underline">
              创建课程
            </Link>
            。
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild variant="default" className="rounded-xl">
              <Link href="/my-courses">我的课程</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/courses/new">新建课程</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cid = courseId.trim();

  return (
    <div
      className={cn(
        'relative box-border flex min-h-full w-full flex-col items-center',
        'bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900',
        'px-4 pb-4 pt-8 md:px-8 md:pt-10',
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-blue-500/10 blur-3xl"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-purple-500/10 blur-3xl"
          style={{ animationDuration: '6s' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-20 flex min-h-0 w-full max-w-[800px] flex-1 flex-col items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="-ml-2 mb-2 md:-ml-3"
        >
          <SyntaraWordmark />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mb-8 text-sm text-muted-foreground/60"
        >
          {t('home.slogan')}
        </motion.p>

        {storeCourseId === cid && storeCourseName.trim().length > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="-mt-6 mb-6 max-w-lg text-center text-xs leading-relaxed text-muted-foreground"
          >
            笔记本将自动归入课程「{storeCourseName}」。生成并保存后，会出现在该课程的笔记本列表中。
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <CreateNotebookComposer courseId={cid} />
        </motion.div>
      </motion.div>

      <div className="shrink-0 pb-1 pt-8 text-center text-xs text-muted-foreground/40 md:pt-10">
        Syntara · open source
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full w-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
          <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      }
    >
      <CreateNotebookPageInner />
    </Suspense>
  );
}
