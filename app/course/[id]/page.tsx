'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, BookOpen, Brain, HardDrive, Loader2, Plus } from 'lucide-react';
import {
  CourseGalleryCard,
  notebookAssetListGridClassName,
} from '@/components/course-gallery-card';
import { CreateCourseForm } from '@/components/courses/create-course-form';
import { CourseMaterialsPanel } from '@/components/courses/course-materials-panel';
import { EditNotebookForm } from '@/components/courses/edit-notebook-form';
import { CourseWorkspaceLoadingContent } from '@/components/loading/app-page-skeletons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
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
import { toast } from '@/lib/notifications/client-toast';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { createNotebookHref } from '@/lib/constants/course-chat';
import { resolveNotebookAgentAvatarDisplayUrl } from '@/lib/constants/notebook-agent-avatars';
import { getLocalStudyMemoryUserId, loadStudyMemory } from '@/lib/learning/study-memory';
import {
  listCourseProblems,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
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
import { creditsFromPriceCents } from '@/lib/utils/credits';
import {
  courseContainsPurchasedNotebook,
  getCoursePublishBlockReasonFromFlags,
  getPurchasedNotebookMoveSuccessMessage,
  getPurchasedNotebookMoveWarning,
} from '@/lib/utils/course-publish';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function compactPurchaseCreditsLabel(priceCents: number | null | undefined): string {
  const credits = creditsFromPriceCents(priceCents);
  return credits > 0 ? `${credits} 积分` : '免费';
}

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

const notebookNameCollator = new Intl.Collator(['zh-CN', 'en-US'], {
  numeric: true,
  sensitivity: 'base',
});

function compareNotebooksByName(a: StageListItem, b: StageListItem): number {
  return (
    notebookNameCollator.compare(a.name.trim(), b.name.trim()) ||
    b.updatedAt - a.updatedAt ||
    a.id.localeCompare(b.id)
  );
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([itemKey]) => itemKey !== key));
}

function countStudyMemoryItems(notebookId: string): number {
  const profile = loadStudyMemory(getLocalStudyMemoryUserId(), notebookId);
  const activePublic = profile.publicMemories.filter((item) => item.status !== 'archived').length;
  const activePrivate = profile.privateMemories.filter((item) => item.status !== 'archived').length;
  const openWeakPoints = profile.weakPoints.filter((item) => item.status !== 'reviewed').length;
  return activePublic + activePrivate + openWeakPoints;
}

type CourseProblemPracticeState = 'mastered' | 'review' | 'wrong' | 'unattempted';

type NotebookPracticeProgress = {
  total: number;
  attempted: number;
  mastered: number;
};

function normalizeCourseProblemTopic(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

function getCourseProblemTopics(problem: NotebookProblemClientRecord): string[] {
  const tags = problem.tags.map(normalizeCourseProblemTopic).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return ['未标注'];
}

function getCourseProblemPracticeState(
  problem: NotebookProblemClientRecord,
): CourseProblemPracticeState {
  const status = problem.latestAttempt?.status ?? null;
  if (!status) return 'unattempted';
  if (status === 'passed') return 'mastered';
  if (status === 'failed' || status === 'partial' || status === 'error') return 'wrong';
  return 'review';
}

function weakTopicBarClass(index: number): string {
  const classes = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500'];
  return classes[index % classes.length];
}

function countProblemsByNotebook(problems: NotebookProblemClientRecord[]): Record<string, number> {
  return problems.reduce<Record<string, number>>((acc, problem) => {
    if (problem.notebookId) {
      acc[problem.notebookId] = (acc[problem.notebookId] ?? 0) + 1;
    }
    return acc;
  }, {});
}

function getNotebookPracticeProgress(
  problems: NotebookProblemClientRecord[],
): Record<string, NotebookPracticeProgress> {
  return problems.reduce<Record<string, NotebookPracticeProgress>>((acc, problem) => {
    if (!problem.notebookId) return acc;

    const current = acc[problem.notebookId] ?? {
      total: 0,
      attempted: 0,
      mastered: 0,
    };
    const state = getCourseProblemPracticeState(problem);
    current.total += 1;
    if (state !== 'unattempted') current.attempted += 1;
    if (state === 'mastered') current.mastered += 1;
    acc[problem.notebookId] = current;
    return acc;
  }, {});
}

type CourseWorkspaceTab = 'notebooks' | 'materials';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const authHydrated = usePersistHydrated(useAuthStore);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const creatorDisplay = useAuthStore(() => '你');

  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [problemCounts, setProblemCounts] = useState<Record<string, number>>({});
  const [courseProblems, setCourseProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [moveTargets, setMoveTargets] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<CourseWorkspaceTab>('notebooks');
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
  const sortedNotebooks = useMemo(() => [...notebooks].sort(compareNotebooksByName), [notebooks]);
  const activeCourseProblems = useMemo(
    () => courseProblems.filter((problem) => problem.status !== 'archived'),
    [courseProblems],
  );
  const courseProblemStats = useMemo(() => {
    const stateCounts = activeCourseProblems.reduce(
      (counts, problem) => {
        counts[getCourseProblemPracticeState(problem)] += 1;
        return counts;
      },
      {
        mastered: 0,
        review: 0,
        wrong: 0,
        unattempted: 0,
      } as Record<CourseProblemPracticeState, number>,
    );
    const attempted = activeCourseProblems.length - stateCounts.unattempted;
    const masteryPercent =
      activeCourseProblems.length > 0
        ? Math.round((stateCounts.mastered / activeCourseProblems.length) * 100)
        : 0;
    const allTopics = new Set<string>();
    const masteredTopics = new Set<string>();
    const notebookNameById = new Map(
      sortedNotebooks.map((notebook) => [notebook.id, notebook.name]),
    );
    const chapterPracticeCounts = new Map<
      string,
      { topic: string; count: number; total: number; order: number }
    >(
      sortedNotebooks.map((notebook, index) => [
        notebook.id,
        { topic: notebook.name, count: 0, total: 0, order: index },
      ]),
    );
    let unassignedOrder = sortedNotebooks.length;

    for (const problem of activeCourseProblems) {
      const state = getCourseProblemPracticeState(problem);
      for (const topic of getCourseProblemTopics(problem)) {
        if (topic !== '未标注') {
          allTopics.add(topic);
          if (state === 'mastered') masteredTopics.add(topic);
        }
      }

      if (state !== 'unattempted') {
        const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
        const notebookName =
          problem.notebookName ||
          (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
          '未归属笔记本';
        const current = chapterPracticeCounts.get(notebookKey) ?? {
          topic: notebookName,
          count: 0,
          total: 0,
          order: unassignedOrder++,
        };
        current.count += 1;
        chapterPracticeCounts.set(notebookKey, current);
      }

      const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
      const notebookName =
        problem.notebookName ||
        (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
        '未归属笔记本';
      const current = chapterPracticeCounts.get(notebookKey) ?? {
        topic: notebookName,
        count: 0,
        total: 0,
        order: unassignedOrder++,
      };
      current.total += 1;
      chapterPracticeCounts.set(notebookKey, current);
    }

    const maxChapterPracticeCount = Math.max(
      1,
      ...Array.from(chapterPracticeCounts.values()).map((item) => item.count),
    );

    const leastPracticedChapters = Array.from(chapterPracticeCounts.values())
      .sort(
        (a, b) =>
          a.count - b.count ||
          b.total - a.total ||
          a.order - b.order ||
          a.topic.localeCompare(b.topic),
      )
      .slice(0, 5)
      .map((item) => ({
        topic: item.topic,
        count: item.count,
        total: item.total,
        percent: Math.min(100, Math.round((item.count / maxChapterPracticeCount) * 100)),
      }));

    return {
      total: activeCourseProblems.length,
      attempted,
      mastered: stateCounts.mastered,
      review: stateCounts.review,
      wrong: stateCounts.wrong,
      unattempted: stateCounts.unattempted,
      masteryPercent,
      coveredNotebookCount: new Set(
        activeCourseProblems.map((problem) => problem.notebookId).filter(Boolean),
      ).size,
      notebookCount: sortedNotebooks.length,
      masteredTopicCount: masteredTopics.size,
      topicCount: allTopics.size,
      weakTopics: leastPracticedChapters,
    };
  }, [activeCourseProblems, sortedNotebooks]);
  const notebookPracticeProgress = useMemo(
    () => getNotebookPracticeProgress(activeCourseProblems),
    [activeCourseProblems],
  );
  const publishTargetProblemCount = useMemo(() => {
    if (!publishTarget) return 0;
    if (publishTarget.kind === 'course') return activeCourseProblems.length;
    return activeCourseProblems.filter(
      (problem) => problem.notebookId === publishTarget.notebook.id,
    ).length;
  }, [activeCourseProblems, publishTarget]);

  useEffect(() => {
    if (!authHydrated) return;
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
        setMemoryCounts({});
        setProblemCounts({});
        setCourseProblems([]);
        setLoading(false);
        return;
      }
      setCourse(c);
      const list = await listStagesByCourse(id);
      const [slides, allCourses, problems] = await Promise.all([
        getFirstSlideByStages(list.map((n) => n.id)),
        listCourses(),
        listCourseProblems(id).catch(() => []),
      ]);
      const targets: Array<{ id: string; name: string }> = allCourses
        .filter((x) => x.id !== id)
        .map((x) => ({ id: x.id, name: x.name }));
      const nextMemoryCounts = Object.fromEntries(
        list.map((notebook) => [notebook.id, countStudyMemoryItems(notebook.id)]),
      );
      const nextProblemCounts = countProblemsByNotebook(problems);
      if (!alive) return;
      setNotebooks(list);
      setThumbnails(slides);
      setMemoryCounts(nextMemoryCounts);
      setProblemCounts(nextProblemCounts);
      setCourseProblems(problems);
      setMoveTargets(targets);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authHydrated, id, isLoggedIn, router]);

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

  if (!authHydrated || !isLoggedIn) return null;

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
      const [slides, problems] = await Promise.all([
        getFirstSlideByStages(list.map((n) => n.id)),
        listCourseProblems(id).catch(() => []),
      ]);
      setNotebooks(list);
      setThumbnails(slides);
      setMemoryCounts(
        Object.fromEntries(list.map((item) => [item.id, countStudyMemoryItems(item.id)])),
      );
      setProblemCounts(countProblemsByNotebook(problems));
      setCourseProblems(problems);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移动失败');
    }
  };

  const handleDeleteNotebook = async (notebookId: string, notebookName: string) => {
    try {
      await deleteStageData(notebookId);
      setNotebooks((current) => current.filter((item) => item.id !== notebookId));
      setThumbnails((current) => omitRecordKey(current, notebookId));
      setMemoryCounts((current) => omitRecordKey(current, notebookId));
      setProblemCounts((current) => omitRecordKey(current, notebookId));

      void touchCourseUpdatedAt(id).catch((error) => {
        console.warn('[course-page] Failed to touch course after notebook delete:', error);
      });

      const list = await listStagesByCourse(id);
      const [slides, problems] = await Promise.all([
        getFirstSlideByStages(list.map((n) => n.id)),
        listCourseProblems(id).catch(() => []),
      ]);
      const nextProblemCounts = countProblemsByNotebook(problems);
      setNotebooks(list);
      setThumbnails(slides);
      setMemoryCounts(
        Object.fromEntries(list.map((item) => [item.id, countStudyMemoryItems(item.id)])),
      );
      setProblemCounts(nextProblemCounts);
      setCourseProblems(problems);
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
      setMemoryCounts(
        Object.fromEntries(list.map((item) => [item.id, countStudyMemoryItems(item.id)])),
      );
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
    setMemoryCounts(
      Object.fromEntries(list.map((item) => [item.id, countStudyMemoryItems(item.id)])),
    );
    toast.success('已更新笔记本信息');
    setEditingNotebook(null);
  };

  if (!loading && course === null) {
    return (
      <div className="min-h-full w-full bg-[#f3f6fb] dark:bg-[#0e1117]">
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
    <div className="min-h-full w-full bg-[#f3f6fb] dark:bg-[#0e1117]">
      <main className="mx-auto w-full max-w-[80rem] px-2 pb-8 pt-3 sm:px-3 sm:pb-10 sm:pt-4 md:px-4 lg:px-5 xl:px-6">
        {loading || !course ? (
          <CourseWorkspaceLoadingContent />
        ) : (
          <>
            <section className="mb-4 rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-4 md:mb-5 md:rounded-[24px] md:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                  <img
                    src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                    alt=""
                    className="size-14 shrink-0 rounded-2xl border border-slate-200/80 bg-white object-cover shadow-[0_12px_28px_rgba(15,23,42,0.12)] dark:border-white/15 dark:bg-slate-900 sm:size-16 md:size-[4.25rem]"
                  />
                  <div className="min-w-0 flex-1">
                    <h1
                      id="course-detail-title"
                      className="max-w-[44rem] text-xl font-semibold leading-[1.15] tracking-normal text-slate-950 sm:text-2xl dark:text-white md:text-[1.8rem] xl:text-[1.9rem]"
                    >
                      {course.name}
                    </h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="rounded-lg border border-slate-200/85 bg-slate-50/80 px-2.5 py-1 dark:border-white/15 dark:bg-white/5">
                        {course.language === 'zh-CN' ? '中文' : 'English'}
                      </span>
                      <span className="rounded-lg border border-slate-200/85 bg-slate-50/80 px-2.5 py-1 dark:border-white/15 dark:bg-white/5">
                        {purposeLabel(course.purpose)}
                      </span>
                      {course.purpose === 'university' &&
                      (course.university || course.courseCode) ? (
                        <span className="rounded-lg border border-slate-200/85 bg-slate-50/80 px-2.5 py-1 dark:border-white/15 dark:bg-white/5">
                          {[course.university, course.courseCode].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                      {course.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-blue-200/70 bg-blue-50/80 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:items-center xl:pt-2"
                  data-course-actions
                >
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-h-9 rounded-xl border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 shadow-sm hover:bg-slate-50 sm:px-3 sm:text-sm dark:border-white/20 dark:bg-white/5 dark:text-slate-100"
                  >
                    <Link href={`/course/${encodeURIComponent(course.id)}/memory`}>
                      <Brain className="mr-1.5 size-4" strokeWidth={1.8} />
                      课程记忆
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-9 rounded-xl border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 shadow-sm hover:bg-slate-50 sm:px-3 sm:text-sm dark:border-white/20 dark:bg-white/5 dark:text-slate-100"
                    onClick={() => setEditCourseOpen(true)}
                  >
                    编辑课程
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-9 rounded-xl border-slate-200 bg-white px-2.5 py-2 text-xs leading-tight text-slate-800 shadow-sm hover:bg-slate-50 sm:px-3 sm:text-sm dark:border-white/20 dark:bg-white/5 dark:text-slate-100"
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
                    className="h-auto min-h-9 rounded-xl bg-slate-950 px-2.5 py-2 text-xs text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] hover:bg-slate-800 sm:px-4 sm:text-sm dark:bg-white dark:text-slate-900"
                  >
                    <Link href={createNotebookHref(id)}>新建笔记本</Link>
                  </Button>
                </div>
              </div>
              {course.description ? (
                <p className="mt-3 line-clamp-5 max-w-[78rem] text-[13px] leading-6 text-slate-600 sm:mt-4 sm:line-clamp-4 md:line-clamp-none md:text-[13.5px] dark:text-slate-300">
                  {course.description}
                </p>
              ) : null}
              {courseHasPurchasedNotebook && !course.listedInCourseStore ? (
                <p className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                  当前课程包含从商城购买的笔记本副本，因此不能发布到商城。
                </p>
              ) : null}
            </section>

            <Tabs
              value={workspaceTab}
              onValueChange={(value) => setWorkspaceTab(value as CourseWorkspaceTab)}
              className="gap-5"
            >
              <div className="mb-4 border-b border-slate-200/80 dark:border-white/10">
                <TabsList
                  variant="line"
                  aria-label="课程内容切换"
                  className="h-12 w-full justify-start gap-6 rounded-none bg-transparent p-0 text-slate-500"
                >
                  <TabsTrigger
                    value="notebooks"
                    onClick={() => setWorkspaceTab('notebooks')}
                    className="h-12 flex-none gap-2 rounded-none px-0 text-base font-semibold data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600 data-[state=active]:after:opacity-100 dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-blue-300"
                  >
                    <BookOpen className="size-4" strokeWidth={1.8} />
                    笔记本
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs leading-none text-blue-600 dark:bg-blue-500/10 dark:text-blue-200">
                      {notebooks.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="materials"
                    onClick={() => setWorkspaceTab('materials')}
                    className="h-12 flex-none gap-2 rounded-none px-0 text-base font-semibold data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600 data-[state=active]:after:opacity-100 dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-blue-300"
                  >
                    <HardDrive className="size-4" strokeWidth={1.8} />
                    课程资料
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="notebooks" className="mt-0">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
                  <section aria-labelledby="course-notebooks-heading" className="min-w-0">
                    <h2 id="course-notebooks-heading" className="sr-only">
                      笔记本列表
                    </h2>
                    <ul className={notebookAssetListGridClassName}>
                      {sortedNotebooks.length > 0 ? (
                        sortedNotebooks.map((nb, i) => (
                          <li key={nb.id} className="min-w-0">
                            <CourseGalleryCard
                              variant="notebook"
                              listIndex={i}
                              course={nb}
                              tags={nb.tags}
                              coverAvatarUrl={resolveNotebookAgentAvatarDisplayUrl(
                                nb.id,
                                nb.avatarUrl,
                              )}
                              slide={thumbnails[nb.id]}
                              subtitle={formatDate(nb.updatedAt)}
                              creatorName={creatorDisplay}
                              secondaryLabel=""
                              courseMetaChips={{
                                school: course.university?.trim() || undefined,
                                purposeType: purposeLabel(course.purpose),
                                courseCode: course.courseCode?.trim() || undefined,
                              }}
                              priceLabel={compactPurchaseCreditsLabel(nb.notebookPriceCents)}
                              memoryCount={memoryCounts[nb.id] ?? 0}
                              onMemoryAction={() => router.push(`/classroom/${nb.id}/memory`)}
                              problemCount={problemCounts[nb.id] ?? 0}
                              practiceProgress={notebookPracticeProgress[nb.id]}
                              onProblemAction={() =>
                                router.push(
                                  `/course/${encodeURIComponent(id)}/problem-bank?notebookId=${encodeURIComponent(nb.id)}`,
                                )
                              }
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
                        ))
                      ) : (
                        <li className="min-w-0 2xl:col-span-2">
                          <div className="flex min-h-[10.75rem] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/72 px-6 text-center text-sm font-medium text-slate-500 shadow-[0_14px_34px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-300">
                            没有匹配的笔记本
                          </div>
                        </li>
                      )}
                    </ul>
                  </section>

                  <aside
                    aria-label="课程学习概览"
                    className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:sticky lg:top-4 lg:block lg:h-fit lg:space-y-3"
                  >
                    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          掌握概览
                        </p>
                        <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <div
                          className="grid size-[88px] shrink-0 place-items-center rounded-full"
                          style={{
                            background: `conic-gradient(#22c55e 0deg ${
                              (courseProblemStats.mastered /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg, #f59e0b ${
                              (courseProblemStats.mastered /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg ${
                              ((courseProblemStats.mastered + courseProblemStats.review) /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg, #ef4444 ${
                              ((courseProblemStats.mastered + courseProblemStats.review) /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg ${
                              ((courseProblemStats.mastered +
                                courseProblemStats.review +
                                courseProblemStats.wrong) /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg, #e2e8f0 ${
                              ((courseProblemStats.mastered +
                                courseProblemStats.review +
                                courseProblemStats.wrong) /
                                Math.max(1, courseProblemStats.total)) *
                              360
                            }deg 360deg)`,
                          }}
                        >
                          <div className="grid size-[62px] place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                            <span className="text-xl font-bold leading-none text-slate-950 dark:text-white">
                              {courseProblemStats.masteryPercent}%
                            </span>
                            <span className="-mt-2 text-[10px] font-medium text-slate-400">
                              总体掌握
                            </span>
                          </div>
                        </div>
                        <dl className="min-w-0 flex-1 space-y-2 text-xs">
                          {[
                            {
                              label: '掌握良好',
                              count: courseProblemStats.mastered,
                              className: 'bg-emerald-500',
                            },
                            {
                              label: '待复习',
                              count: courseProblemStats.review,
                              className: 'bg-amber-500',
                            },
                            {
                              label: '错题',
                              count: courseProblemStats.wrong,
                              className: 'bg-rose-500',
                            },
                            {
                              label: '未练习',
                              count: courseProblemStats.unattempted,
                              className: 'bg-slate-300',
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="flex items-center justify-between gap-2"
                            >
                              <dt className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                                <span className={cn('size-2 rounded-full', item.className)} />
                                <span className="truncate">{item.label}</span>
                              </dt>
                              <dd className="font-semibold text-slate-800 dark:text-slate-100">
                                {item.count}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800">
                        <div>
                          <div className="font-semibold text-sky-600 dark:text-sky-300">
                            {courseProblemStats.attempted}/{courseProblemStats.total || 0}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">已练习</div>
                        </div>
                        <div>
                          <div className="font-semibold text-sky-600 dark:text-sky-300">
                            {courseProblemStats.coveredNotebookCount}/
                            {Math.max(1, courseProblemStats.notebookCount)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">题库覆盖</div>
                        </div>
                        <div>
                          <div className="font-semibold text-sky-600 dark:text-sky-300">
                            {courseProblemStats.masteredTopicCount}/
                            {courseProblemStats.topicCount || 0}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">知识点</div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        做题最少章节 TOP5
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">按已做题目数量升序统计</p>
                      <div className="mt-4 space-y-3">
                        {courseProblemStats.weakTopics.length > 0 ? (
                          courseProblemStats.weakTopics.map((item, index) => (
                            <div key={item.topic} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                                  {item.topic}
                                </span>
                                <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                                  已做 {item.count} 题
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className={cn('h-full rounded-full', weakTopicBarClass(index))}
                                  style={{ width: `${item.percent}%` }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                            暂无章节刷题数据。
                          </p>
                        )}
                      </div>
                    </section>

                    <div className="grid grid-cols-2 gap-2 md:col-span-2 lg:col-span-1">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/course/${encodeURIComponent(id)}/problem-bank`)
                        }
                        className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                      >
                        <BookOpen className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                        <span>进入题库</span>
                        <span className="mt-1 block text-[10px] font-normal text-slate-400">
                          练习 / 导题
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(createNotebookHref(id))}
                        className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                      >
                        <Plus className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                        <span>新建笔记本</span>
                        <span className="mt-1 block text-[10px] font-normal text-slate-400">
                          生成内容
                        </span>
                      </button>
                    </div>
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="materials" className="mt-0">
                <CourseMaterialsPanel courseId={id} />
              </TabsContent>
            </Tabs>
            <Dialog open={editCourseOpen} onOpenChange={setEditCourseOpen}>
              <DialogContent
                className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-4 sm:max-h-[min(90dvh,720px)] sm:w-full sm:p-6 sm:max-w-2xl"
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
                className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-4 sm:max-h-[min(90dvh,720px)] sm:w-full sm:p-6 sm:max-w-2xl"
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
              <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto rounded-2xl p-4 sm:max-h-[min(90dvh,720px)] sm:w-full sm:p-6">
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
                    <p className="mt-2">
                      {publishTargetProblemCount > 0
                        ? `题库会一起发布：${publishTargetProblemCount} 道未归档题目将随课程或笔记本复制给买家；不满足发布条件的编程题会保留为草稿。`
                        : '当前题库没有可发布题目。'}
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

                  <div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:justify-end min-[420px]:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full min-[420px]:w-auto"
                      onClick={() => setPublishTarget(null)}
                      disabled={publishState !== 'idle'}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      className="w-full min-[420px]:w-auto"
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
