'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { CreateCourseForm } from '@/components/courses/create-course-form';
import { useAuthStore } from '@/lib/store/auth';
import { deleteCourseAndNotebooks, listCourses } from '@/lib/utils/course-storage';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { toast } from 'sonner';
import type { CourseRecord } from '@/lib/utils/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

export default function MyCoursesPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.userId);
  const [courses, setCourses] = useState<
    Array<{ course: CourseRecord; notebookCount: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseRecord | null>(null);

  const loadMyCourses = useCallback(async () => {
    if (!userId) return;
    const mine = await listCourses();
    const withCounts = await Promise.all(
      mine.map(async (course) => {
        const notebookCount = (await listStagesByCourse(course.id)).length;
        return { course, notebookCount };
      }),
    );
    setCourses(withCounts);
  }, [userId]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      await loadMyCourses();
      if (!alive) return;
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [isLoggedIn, router, loadMyCourses]);

  const openCreateDialog = () => {
    setFormKey((k) => k + 1);
    setCreateOpen(true);
  };

  const handleDeleteCourse = async (courseId: string, courseName: string) => {
    try {
      await deleteCourseAndNotebooks(courseId);
      if (useCurrentCourseStore.getState().id === courseId) {
        useCurrentCourseStore.getState().clearCurrentCourse();
      }
      await loadMyCourses();
      toast.success(`已删除「${courseName}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full bg-[radial-gradient(circle_at_20%_0%,rgba(191,219,254,0.45),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.35),transparent_45%),linear-gradient(180deg,#0a0f18_0%,#0f172a_100%)]">
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 rounded-[28px] border border-white/60 bg-white/75 p-6 backdrop-blur-xl shadow-[0_18px_46px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-black/25">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                我的课程
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                课程是容器；在课程下创建的生成内容会以「笔记本」形式展示，可随时继续学习。
              </p>
            </div>
            <Button
              type="button"
              onClick={openCreateDialog}
              className="h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-slate-900 sm:mt-0.5"
            >
              新建课程
            </Button>
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-72 animate-pulse rounded-[26px] bg-white/60 dark:bg-white/5"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-white/20 dark:bg-white/5">
            <p className="text-slate-600 dark:text-slate-200">你还没有课程。</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                onClick={openCreateDialog}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
              >
                新建课程
              </Button>
              <button
                type="button"
                onClick={() => router.push('/store')}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                去商城看看
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map(({ course, notebookCount }, i) => {
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
                  secondaryLabel="课程空间"
                  countUnit="个笔记本"
                  actionLabel="进入课程"
                  onAction={() => router.push(`/course/${course.id}`)}
                  coverAvatarUrl={course.avatarUrl}
                  onEdit={() => {
                    setEditingCourse(course);
                    setEditOpen(true);
                  }}
                  deleteDialogTitle="删除课程？"
                  deleteDialogDescription={`将永久删除课程「${course.name}」及其下全部笔记本，不可恢复。`}
                  onDelete={() => handleDeleteCourse(course.id, course.name)}
                />
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="max-h-[min(90dvh,720px)] w-full max-w-lg gap-0 overflow-y-auto p-6 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-lg font-semibold">新建课程</DialogTitle>
            <DialogDescription>
              填写课程信息；创建后可进入课程页添加笔记本。
            </DialogDescription>
          </DialogHeader>
          <CreateCourseForm
            key={formKey}
            className="mt-6"
            onSuccess={async (courseId) => {
              setCreateOpen(false);
              setLoading(true);
              await loadMyCourses();
              setLoading(false);
              router.push(`/course/${courseId}`);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingCourse(null);
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,720px)] w-full max-w-lg gap-0 overflow-y-auto p-6 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-lg font-semibold">编辑课程</DialogTitle>
            <DialogDescription>修改名称、描述、标签与用途；保存后立即生效。</DialogDescription>
          </DialogHeader>
          {editingCourse ? (
            <CreateCourseForm
              key={editingCourse.id}
              className="mt-6"
              editCourse={editingCourse}
              onSuccess={async () => {
                setEditOpen(false);
                setEditingCourse(null);
                setLoading(true);
                await loadMyCourses();
                setLoading(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
