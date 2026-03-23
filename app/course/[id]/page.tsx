'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { CreateCourseForm } from '@/components/courses/create-course-form';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse, touchCourseUpdatedAt } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import {
  deleteStageData,
  getFirstSlideByStages,
  listStagesByCourse,
  moveStageToCourse,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';
import { cn } from '@/lib/utils';
import { listCourses } from '@/lib/utils/course-storage';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [moveTargets, setMoveTargets] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editCourseOpen, setEditCourseOpen] = useState(false);

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
        setNotebooks([]);
        setThumbnails({});
        setLoading(false);
        return;
      }
      setCourse(c);
      const list = await listStagesByCourse(id);
      const slides = await getFirstSlideByStages(list.map((n) => n.id));
      const targets: Array<{ id: string; name: string }> = (await listCourses())
        .filter((x) => x.id !== id)
        .map((x) => ({ id: x.id, name: x.name }));
      if (!alive) return;
      setNotebooks(list);
      setThumbnails(slides);
      setMoveTargets(targets);
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
  }, [id, loading, course]);

  if (!isLoggedIn) return null;

  const handleMoveNotebook = async (notebookId: string, targetCourseId: string) => {
    try {
      await moveStageToCourse(notebookId, targetCourseId);
      toast.success('已移动到其他课程');
      const list = await listStagesByCourse(id);
      setNotebooks(list);
      setThumbnails(await getFirstSlideByStages(list.map((n) => n.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移动失败');
    }
  };

  const handleDeleteNotebook = async (notebookId: string, notebookName: string) => {
    try {
      await deleteStageData(notebookId);
      await touchCourseUpdatedAt(id);
      const list = await listStagesByCourse(id);
      setNotebooks(list);
      setThumbnails(await getFirstSlideByStages(list.map((n) => n.id)));
      toast.success(`已删除「${notebookName}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

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
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-[28px] bg-white/40 dark:bg-white/5" style={{ backdropFilter: 'blur(10px)' }} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-[26px] bg-white/40 dark:bg-white/5" style={{ backdropFilter: 'blur(10px)' }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className="mb-6 apple-glass rounded-[28px] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  {course.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public 静态资源
                    <img
                      src={course.avatarUrl}
                      alt=""
                      className="size-16 shrink-0 rounded-2xl border border-slate-200/80 bg-white object-cover shadow-sm dark:border-white/15 dark:bg-slate-900 md:size-20"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                  <Button variant="ghost" size="sm" className="-ml-2 mb-2 rounded-lg" asChild>
                    <Link href="/my-courses">← 我的课程</Link>
                  </Button>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {course.name}
                  </h1>
                  {course.description ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{course.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className={cn(
                        'rounded-md border border-slate-200/80 bg-white/60 px-2 py-0.5 dark:border-white/15 dark:bg-white/5',
                      )}
                    >
                      {course.language === 'zh-CN' ? '中文' : 'English'}
                    </span>
                    <span className="rounded-md border border-slate-200/80 bg-white/60 px-2 py-0.5 dark:border-white/15 dark:bg-white/5">
                      {purposeLabel(course.purpose)}
                    </span>
                    {course.purpose === 'university' && (course.university || course.courseCode) ? (
                      <span className="rounded-md border border-slate-200/80 bg-white/60 px-2 py-0.5 dark:border-white/15 dark:bg-white/5">
                        {[course.university, course.courseCode].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                    {course.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-violet-200/60 bg-violet-50/80 px-2.5 py-0.5 text-[11px] text-violet-900 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-slate-200 bg-white/80 dark:border-white/20 dark:bg-white/5"
                    onClick={() => setEditCourseOpen(true)}
                  >
                    编辑课程
                  </Button>
                  <Button
                    asChild
                    className="h-11 rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
                  >
                    <Link href={`/create?courseId=${encodeURIComponent(course.id)}`}>新建笔记本</Link>
                  </Button>
                </div>
              </div>
            </section>

            {notebooks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-white/20 dark:bg-white/5">
                <p className="text-slate-600 dark:text-slate-200">这门课下还没有笔记本。</p>
                <Button asChild className="mt-4 rounded-xl">
                  <Link href={`/create?courseId=${encodeURIComponent(course.id)}`}>创建第一个笔记本</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {notebooks.map((nb, i) => (
                  <CourseGalleryCard
                    key={nb.id}
                    listIndex={i}
                    course={nb}
                    tags={nb.tags}
                    coverAvatarUrl={nb.avatarUrl}
                    slide={thumbnails[nb.id]}
                    subtitle={formatDate(nb.updatedAt)}
                    secondaryLabel="互动课件"
                    actionLabel="打开笔记本"
                    onAction={() => router.push(`/classroom/${nb.id}`)}
                    moveToCourseTargets={moveTargets}
                    onMoveToCourse={(targetCourseId) => handleMoveNotebook(nb.id, targetCourseId)}
                    deleteDialogTitle="删除笔记本？"
                    deleteDialogDescription={`将永久删除「${nb.name}」及其课件与对话记录，不可恢复。`}
                    onDelete={() => handleDeleteNotebook(nb.id, nb.name)}
                  />
                ))}
              </div>
            )}
            <Dialog open={editCourseOpen} onOpenChange={setEditCourseOpen}>
              <DialogContent
                className="max-h-[min(90dvh,720px)] w-full max-w-lg gap-0 overflow-y-auto p-6 sm:max-w-lg"
                showCloseButton
              >
                <DialogHeader className="pr-8 text-left">
                  <DialogTitle className="text-lg font-semibold">编辑课程</DialogTitle>
                  <DialogDescription>修改名称、描述、标签与用途；保存后立即生效。</DialogDescription>
                </DialogHeader>
                <CreateCourseForm
                  key={course.id}
                  className="mt-6"
                  editCourse={course}
                  onSuccess={async (courseId) => {
                    setEditCourseOpen(false);
                    const next = await getCourse(courseId);
                    if (next) setCourse(next);
                  }}
                />
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
    </div>
  );
}
