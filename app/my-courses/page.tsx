'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Sparkles, Store } from 'lucide-react';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { CreateCourseForm } from '@/components/courses/create-course-form';
import { useAuthStore } from '@/lib/store/auth';
import { deleteCourseAndNotebooks, listCourses, updateCourse } from '@/lib/utils/course-storage';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { toast } from 'sonner';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
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

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

export default function MyCoursesPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.userId);
  const creatorDisplay = useAuthStore((s) => {
    const n = s.name.trim();
    if (n) return '你';
    const e = s.email.trim();
    if (e) return '你';
    return '你';
  });
  const [courses, setCourses] = useState<Array<{ course: CourseRecord; notebookCount: number }>>(
    [],
  );
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

  const handleTogglePublishCourse = async (course: CourseRecord) => {
    if (course.sourceCourseId) {
      toast.error('购买得到的课程副本不能再次发布到商城');
      return;
    }
    try {
      await updateCourse(course.id, {
        name: course.name,
        description: course.description ?? '',
        language: course.language,
        tags: course.tags,
        purpose: course.purpose,
        university: course.university,
        courseCode: course.courseCode,
        listedInCourseStore: !course.listedInCourseStore,
        coursePriceCents: course.coursePriceCents ?? 0,
      });
      await loadMyCourses();
      toast.success(course.listedInCourseStore ? '已取消发布课程' : '已发布课程到商城');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    }
  };

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="apple-wallpaper-layer-1 absolute inset-[-12%]"
          animate={{ x: [0, 36, -24, 0], y: [0, -42, 18, 0], scale: [1, 1.06, 0.98, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="apple-wallpaper-layer-2 absolute inset-[-14%]"
          animate={{ x: [0, -44, 22, 0], y: [0, 34, -20, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="apple-wallpaper-layer-3 absolute inset-[-18%]"
          animate={{ x: [0, 16, -12, 0], y: [0, -20, 10, 0], scale: [1, 1.04, 1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.1)_0%,transparent_72%)]"
          animate={{ x: [0, 22, -16, 0], y: [0, -24, 12, 0], scale: [1, 1.08, 0.94, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.09)_0%,transparent_72%)]"
          animate={{ x: [0, -26, 18, 0], y: [0, 24, -14, 0], scale: [1, 1.1, 0.92, 1] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-[8%] top-[52%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,94,136,0.11)_0%,transparent_72%)] dark:bg-[radial-gradient(circle,rgba(255,94,136,0.15)_0%,transparent_74%)]"
          animate={{ x: [0, 14, -10, 0], y: [0, 16, -12, 0], scale: [1, 1.06, 0.96, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="apple-wallpaper-noise absolute inset-0" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        {/* Hero section with glass card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-8 apple-glass rounded-[28px] p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="min-w-0"
            >
              <h1 className="text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                我的课程
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-[#86868b] dark:text-[#a1a1a6]">
                课程是容器；在课程下创建的生成内容会以「笔记本」形式展示，可随时继续学习。
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <button
                type="button"
                onClick={openCreateDialog}
                className="apple-btn apple-btn-primary flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm sm:mt-0.5"
              >
                <Plus className="size-4" strokeWidth={2} />
                新建课程
              </button>
            </motion.div>
          </div>
        </motion.section>

        {/* Course grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="h-72 rounded-[26px] bg-white/40 dark:bg-white/5 animate-pulse"
                style={{ backdropFilter: 'blur(10px)' }}
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="apple-glass rounded-[28px] p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#007AFF]/10 to-[#5856D6]/10"
            >
              <Sparkles className="size-8 text-[#007AFF]" />
            </motion.div>
            <p className="text-lg font-medium text-[#1d1d1f] dark:text-white">你还没有课程</p>
            <p className="mt-1 text-sm text-[#86868b]">创建你的第一个课程，开始 AI 互动学习之旅</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={openCreateDialog}
                className="apple-btn apple-btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
              >
                <Plus className="size-4" />
                新建课程
              </button>
              <button
                type="button"
                onClick={() => router.push('/store/courses')}
                className="apple-btn apple-btn-secondary flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
              >
                <Store className="size-4" />
                去商城看看
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
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
                  <motion.div
                    key={course.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.08,
                      duration: 0.5,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <CourseGalleryCard
                      course={cardItem}
                      tags={course.tags.length > 0 ? course.tags : undefined}
                      badge={purposeLabel(course.purpose)}
                      subtitle={formatDate(course.updatedAt)}
                      useRatingOnCover
                      creatorName={creatorDisplay}
                      courseMetaChips={{
                        school: course.university?.trim() || undefined,
                        courseCode: course.courseCode?.trim() || undefined,
                      }}
                      countUnit="个笔记本"
                      priceLabel={`¥${((course.coursePriceCents ?? 0) / 100).toFixed(2)}`}
                      actionLabel="进入课程"
                      onAction={() => router.push(`/course/${course.id}`)}
                      secondaryActionLabel={
                        course.sourceCourseId
                          ? '已购副本不可发布'
                          : course.listedInCourseStore
                            ? '取消发布'
                            : '发布'
                      }
                      secondaryActionDisabled={Boolean(course.sourceCourseId)}
                      onSecondaryAction={() => void handleTogglePublishCourse(course)}
                      coverAvatarUrl={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                      onEdit={() => {
                        setEditingCourse(course);
                        setEditOpen(true);
                      }}
                      deleteDialogTitle="删除课程？"
                      deleteDialogDescription={`将永久删除课程「${course.name}」及其下全部笔记本，不可恢复。`}
                      onDelete={() => handleDeleteCourse(course.id, course.name)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="max-h-[min(90dvh,720px)] w-full max-w-2xl gap-0 overflow-y-auto rounded-[20px] border-0 p-6 apple-glass sm:max-w-2xl"
          showCloseButton
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-lg font-semibold">新建课程</DialogTitle>
            <DialogDescription>填写课程信息；创建后可进入课程页添加笔记本。</DialogDescription>
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
          className="max-h-[min(90dvh,720px)] w-full max-w-2xl gap-0 overflow-y-auto rounded-[20px] border-0 p-6 apple-glass sm:max-w-2xl"
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
