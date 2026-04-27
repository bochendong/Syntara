'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  CourseGalleryCard,
  courseGalleryListGridClassName,
} from '@/components/course-gallery-card';
import { CreateCourseForm } from '@/components/courses/create-course-form';
import { EditNotebookForm } from '@/components/courses/edit-notebook-form';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useSettingsStore } from '@/lib/store/settings';
import { getCourse, touchCourseUpdatedAt, updateCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import {
  deleteStageData,
  getFirstSlideByStages,
  listStagesByCourse,
  loadStageData,
  moveStageToCourse,
  savePublishedStageData,
  updateStageStoreMeta,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';
import { cn } from '@/lib/utils';
import { listCourses } from '@/lib/utils/course-storage';
import { toast } from 'sonner';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { courseOrchestratorChatHref } from '@/lib/constants/course-chat';
import { resolveNotebookAgentAvatarDisplayUrl } from '@/lib/constants/notebook-agent-avatars';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ensureSpeechActionsHaveAudio } from '@/lib/hooks/use-scene-generator';
import type { SpeechAction } from '@/lib/types/action';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import { creditsFromPriceCents, formatPurchaseCreditsLabel } from '@/lib/utils/credits';
import {
  courseContainsPurchasedNotebook,
  getCoursePublishBlockReasonFromFlags,
  getPurchasedNotebookMoveSuccessMessage,
  getPurchasedNotebookMoveWarning,
} from '@/lib/utils/course-publish';

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
  const creatorDisplay = useAuthStore(() => '你');

  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [moveTargets, setMoveTargets] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<StageListItem | null>(null);
  const [publishTarget, setPublishTarget] = useState<
    { kind: 'course' } | { kind: 'notebook'; notebook: StageListItem } | null
  >(null);
  const [publishWithAudio, setPublishWithAudio] = useState(true);
  const [publishState, setPublishState] = useState<
    'idle' | 'preparing_audio' | 'publishing' | 'published'
  >('idle');
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const courseHasPurchasedNotebook = courseContainsPurchasedNotebook(notebooks);
  const coursePublishBlockReason = getCoursePublishBlockReasonFromFlags(
    course,
    courseHasPurchasedNotebook,
  );
  const coursePublishActionDisabled = Boolean(
    !course?.listedInCourseStore && coursePublishBlockReason,
  );

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
    const notebook = notebooks.find((item) => item.id === notebookId);
    const targetCourseName = moveTargets.find((item) => item.id === targetCourseId)?.name;
    if (
      notebook?.sourceNotebookId &&
      !window.confirm(getPurchasedNotebookMoveWarning(targetCourseName))
    ) {
      return;
    }
    try {
      await moveStageToCourse(notebookId, targetCourseId);
      toast.success(
        notebook?.sourceNotebookId
          ? getPurchasedNotebookMoveSuccessMessage(targetCourseName)
          : '已移动到其他课程',
      );
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

  const handleTogglePublishCourse = async () => {
    if (!course) return;
    if (!course.listedInCourseStore && coursePublishBlockReason) {
      toast.error(coursePublishBlockReason);
      return;
    }
    setPublishWithAudio(true);
    setPublishTarget({ kind: 'course' });
    setPublishState('idle');
    setPublishProgress(null);
  };

  const handleTogglePublishNotebook = async (notebook: StageListItem) => {
    if (notebook.sourceNotebookId) {
      toast.error('购买得到的笔记本副本不能再次发布到商城');
      return;
    }
    setPublishWithAudio(true);
    setPublishTarget({ kind: 'notebook', notebook });
    setPublishState('idle');
    setPublishProgress(null);
  };

  const handleConfirmPublish = async () => {
    if (!course || !publishTarget) return;
    if (publishTarget.kind === 'course' && coursePublishBlockReason) {
      toast.error(coursePublishBlockReason);
      return;
    }
    setPublishState(publishWithAudio ? 'preparing_audio' : 'publishing');
    setPublishProgress(null);
    try {
      const alreadyListed =
        publishTarget.kind === 'course'
          ? course.listedInCourseStore
          : Boolean(publishTarget.notebook.listedInNotebookStore);
      const targets = publishTarget.kind === 'course' ? notebooks : [publishTarget.notebook];

      const loadedStages = (
        await Promise.all(
          targets.map(async (notebook) => ({ notebook, data: await loadStageData(notebook.id) })),
        )
      ).filter(
        (
          entry,
        ): entry is {
          notebook: StageListItem;
          data: NonNullable<Awaited<ReturnType<typeof loadStageData>>>;
        } => Boolean(entry.data),
      );

      if (loadedStages.length === 0) {
        throw new Error('未能读取待发布的笔记本内容');
      }

      const allSpeechActions: SpeechAction[] = [];
      for (const { data } of loadedStages) {
        for (const scene of data.scenes) {
          const splitActions = splitLongSpeechActions(scene.actions || [], ttsProviderId);
          scene.actions = splitActions;
          allSpeechActions.push(
            ...splitActions.filter(
              (action): action is SpeechAction =>
                action.type === 'speech' && Boolean(action.text?.trim()) && !action.audioUrl,
            ),
          );
        }
      }

      if (publishWithAudio && allSpeechActions.length > 0) {
        const result = await ensureSpeechActionsHaveAudio(
          allSpeechActions,
          undefined,
          ({ done, total }) => {
            setPublishState('preparing_audio');
            setPublishProgress({ done, total });
          },
        );
        if (!result.ok) {
          throw new Error(result.error || '语音生成失败');
        }
      }

      setPublishState('publishing');
      setPublishProgress(null);

      await Promise.all(
        loadedStages.map(async ({ notebook, data }) => {
          await savePublishedStageData(notebook.id, data, {
            includeSpeechAudio: publishWithAudio,
          });
          await updateStageStoreMeta(notebook.id, {
            listedInNotebookStore: true,
            notebookPriceCents: notebook.notebookPriceCents ?? 0,
          });
        }),
      );

      await updateCourse(course.id, {
        name: course.name,
        description: course.description ?? '',
        language: course.language,
        tags: course.tags,
        purpose: course.purpose,
        university: course.university,
        courseCode: course.courseCode,
        listedInCourseStore: publishTarget.kind === 'course' ? true : course.listedInCourseStore,
        coursePriceCents: course.coursePriceCents ?? 0,
      });

      const next = await getCourse(course.id);
      if (next) setCourse(next);
      const list = await listStagesByCourse(id);
      setNotebooks(list);
      setPublishState('published');
      toast.success(
        publishTarget.kind === 'course'
          ? alreadyListed
            ? publishWithAudio
              ? '课程更新已发布（附带语音）'
              : '课程更新已发布（不附带语音）'
            : publishWithAudio
              ? '课程已附带语音发布'
              : '课程已发布，商城将提示用户自行生成语音'
          : publishWithAudio
            ? alreadyListed
              ? `笔记本「${publishTarget.notebook.name}」更新已发布（附带语音）`
              : `笔记本「${publishTarget.notebook.name}」已附带语音发布`
            : alreadyListed
              ? `笔记本「${publishTarget.notebook.name}」更新已发布（不附带语音）`
              : `笔记本「${publishTarget.notebook.name}」已发布，商城将提示用户自行生成语音`,
      );
      setPublishTarget(null);
      setPublishProgress(null);
      setPublishState('idle');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
      setPublishState('idle');
    }
  };

  const handleNotebookEditSaved = async () => {
    const list = await listStagesByCourse(id);
    setNotebooks(list);
    setThumbnails(await getFirstSlideByStages(list.map((n) => n.id)));
    toast.success('已更新笔记本信息');
    setEditingNotebook(null);
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
            <div
              className="h-40 animate-pulse rounded-[28px] bg-white/40 dark:bg-white/5"
              style={{ backdropFilter: 'blur(10px)' }}
            />
            <div className={courseGalleryListGridClassName}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-72 min-w-0 animate-pulse rounded-[26px] bg-white/40 dark:bg-white/5"
                  style={{ backdropFilter: 'blur(10px)' }}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className="mb-6 apple-glass rounded-[28px] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <img
                    src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                    alt=""
                    className="size-16 shrink-0 rounded-2xl border border-slate-200/80 bg-white object-cover shadow-sm dark:border-white/15 dark:bg-slate-900 md:size-20"
                  />
                  <div className="min-w-0 flex-1">
                    <h1
                      id="course-detail-title"
                      className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white"
                    >
                      {course.name}
                    </h1>
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
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-slate-200 bg-white/80 dark:border-white/20 dark:bg-white/5"
                    disabled={coursePublishActionDisabled}
                    onClick={() => void handleTogglePublishCourse()}
                  >
                    {coursePublishActionDisabled
                      ? course?.sourceCourseId
                        ? '已购副本不可发布'
                        : '含已购笔记本不可发布'
                      : publishTarget?.kind === 'course' &&
                          (publishState === 'preparing_audio' || publishState === 'publishing')
                        ? '发布中…'
                        : course.listedInCourseStore
                          ? '发布更新'
                          : '发布课程'}
                  </Button>
                  <Button
                    asChild
                    className="h-11 rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
                  >
                    <Link href={courseOrchestratorChatHref('generate-notebook')}>新建笔记本</Link>
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
              {course.description ? (
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  {course.description}
                </p>
              ) : null}
              {courseHasPurchasedNotebook && !course.listedInCourseStore ? (
                <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
                  当前课程包含从商城购买的笔记本副本，因此不能发布到商城。
                </p>
              ) : null}
            </section>

            {notebooks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-white/20 dark:bg-white/5">
                <p className="text-slate-600 dark:text-slate-200">这门课下还没有笔记本。</p>
                <Button asChild className="mt-4 rounded-xl">
                  <Link href={courseOrchestratorChatHref('generate-notebook')}>
                    创建第一个笔记本
                  </Link>
                </Button>
              </div>
            ) : (
              <section aria-labelledby="course-notebooks-heading">
                <h2 id="course-notebooks-heading" className="sr-only">
                  笔记本列表
                </h2>
                <ul className={courseGalleryListGridClassName}>
                  {notebooks.map((nb, i) => (
                    <li key={nb.id} className="min-w-0">
                      <CourseGalleryCard
                        variant="notebook"
                        listIndex={i}
                        course={nb}
                        tags={nb.tags}
                        coverAvatarUrl={resolveNotebookAgentAvatarDisplayUrl(nb.id, nb.avatarUrl)}
                        slide={thumbnails[nb.id]}
                        subtitle={formatDate(nb.updatedAt)}
                        creatorName={creatorDisplay}
                        secondaryLabel=""
                        courseMetaChips={{
                          school: course.university?.trim() || undefined,
                          purposeType: purposeLabel(course.purpose),
                          courseCode: course.courseCode?.trim() || undefined,
                        }}
                        priceLabel={formatPurchaseCreditsLabel(
                          creditsFromPriceCents(nb.notebookPriceCents),
                        )}
                        actionLabel="打开笔记本"
                        onAction={() => router.push(`/classroom/${nb.id}`)}
                        onEdit={() => setEditingNotebook(nb)}
                        tertiaryActionLabel="复习"
                        onTertiaryAction={() => router.push(`/review/${nb.id}`)}
                        secondaryActionLabel={
                          nb.sourceNotebookId
                            ? undefined
                            : publishTarget?.kind === 'notebook' &&
                                publishTarget.notebook.id === nb.id &&
                                (publishState === 'preparing_audio' ||
                                  publishState === 'publishing')
                              ? '发布中…'
                              : nb.listedInNotebookStore
                                ? '发布更新'
                                : '发布'
                        }
                        onSecondaryAction={
                          nb.sourceNotebookId
                            ? undefined
                            : () => void handleTogglePublishNotebook(nb)
                        }
                        moveToCourseTargets={moveTargets}
                        onMoveToCourse={(targetCourseId) =>
                          handleMoveNotebook(nb.id, targetCourseId)
                        }
                        deleteDialogTitle="删除笔记本？"
                        deleteDialogDescription={`将永久删除「${nb.name}」及其课件与对话记录，不可恢复。`}
                        onDelete={() => handleDeleteNotebook(nb.id, nb.name)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Dialog open={editCourseOpen} onOpenChange={setEditCourseOpen}>
              <DialogContent
                className="max-h-[min(90dvh,720px)] w-full max-w-2xl gap-0 overflow-y-auto p-6 sm:max-w-2xl"
                showCloseButton
              >
                <DialogHeader className="pr-8 text-left">
                  <DialogTitle className="text-lg font-semibold">编辑课程</DialogTitle>
                  <DialogDescription>
                    修改名称、描述、标签与用途；保存后立即生效。
                  </DialogDescription>
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
            <Dialog
              open={Boolean(editingNotebook)}
              onOpenChange={(open) => {
                if (!open) setEditingNotebook(null);
              }}
            >
              <DialogContent
                className="max-h-[min(90dvh,720px)] w-full max-w-2xl gap-0 overflow-y-auto p-6 sm:max-w-2xl"
                showCloseButton
              >
                <DialogHeader className="pr-8 text-left">
                  <DialogTitle className="text-lg font-semibold">编辑笔记本</DialogTitle>
                  <DialogDescription>
                    修改名称、描述、头像与价格；保存后立即生效。
                  </DialogDescription>
                </DialogHeader>
                {editingNotebook ? (
                  <EditNotebookForm
                    key={editingNotebook.id}
                    className="mt-6"
                    notebook={editingNotebook}
                    onSuccess={() => void handleNotebookEditSaved()}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
            <Dialog
              open={Boolean(publishTarget)}
              onOpenChange={(open) => {
                if (!open) {
                  setPublishTarget(null);
                  setPublishState('idle');
                  setPublishProgress(null);
                }
              }}
            >
              <DialogContent className="w-full max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    {publishTarget?.kind === 'course'
                      ? course.listedInCourseStore
                        ? '发布课程更新'
                        : '发布课程到商城'
                      : publishTarget?.notebook.listedInNotebookStore
                        ? '发布笔记本更新'
                        : '发布笔记本到商城'}
                  </DialogTitle>
                  <DialogDescription>
                    发布时可以选择先生成全部语音。附带原始语音发布后，购买用户会直接拿到可播放语音；
                    不附带语音发布时，商城会明确提示该内容仍需用户自行生成语音。
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm leading-7 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {publishTarget?.kind === 'course'
                        ? `将发布当前课程及其下 ${notebooks.length} 本笔记本。`
                        : `将发布笔记本「${publishTarget?.kind === 'notebook' ? publishTarget.notebook.name : ''}」。`}
                    </p>
                    <p className="mt-2">
                      {publishWithAudio
                        ? '推荐：先补齐语音再发布，买家复制后可以直接使用原始语音。'
                        : '不附带语音也可以立即发布，但商城会提醒用户部分语音仍需自行生成。'}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <button
                      type="button"
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left transition-colors',
                        publishWithAudio
                          ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100'
                          : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/5',
                      )}
                      onClick={() => setPublishWithAudio(true)}
                      disabled={publishState !== 'idle'}
                    >
                      <p className="text-sm font-medium">附带原始语音发布</p>
                      <p className="mt-1 text-xs opacity-80">
                        发布前自动补齐缺失语音，买家拿到即可播放。
                      </p>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left transition-colors',
                        !publishWithAudio
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'
                          : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/5',
                      )}
                      onClick={() => setPublishWithAudio(false)}
                      disabled={publishState !== 'idle'}
                    >
                      <p className="text-sm font-medium">不附带语音发布</p>
                      <p className="mt-1 text-xs opacity-80">
                        更快发布，但商城会提示用户需要自行生成语音。
                      </p>
                    </button>
                  </div>

                  {publishState !== 'idle' ? (
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-white">
                        <Loader2 className="size-4 animate-spin" />
                        {publishState === 'preparing_audio'
                          ? '正在准备语音'
                          : publishState === 'publishing'
                            ? '正在发布'
                            : '已发布'}
                      </div>
                      {publishProgress ? (
                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all"
                              style={{
                                width: `${publishProgress.total > 0 ? (publishProgress.done / publishProgress.total) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {publishProgress.done}/{publishProgress.total}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPublishTarget(null)}
                      disabled={publishState !== 'idle'}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleConfirmPublish()}
                      disabled={publishState !== 'idle'}
                    >
                      {publishState === 'idle' ? '开始发布' : '发布中…'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
    </div>
  );
}
