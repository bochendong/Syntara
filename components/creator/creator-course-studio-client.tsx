'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  Loader2,
  MessageCircle,
  ShoppingBag,
  Target,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import type { CourseRecord } from '@/lib/utils/database';
import { getCourse, updateCourse } from '@/lib/utils/course-storage';
import { getCoursePublishBlockReason } from '@/lib/utils/course-publish';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import {
  listNotebookStudyMemoryCounts,
  listStudyMemoryRecords,
  type StudyMemoryNotebookCounts,
} from '@/lib/utils/study-memory-api';
import { toast } from '@/lib/notifications/client-toast';

function AssetStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof BookOpenText;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ReadinessItem({
  label,
  detail,
  ok,
  warning,
}: {
  label: string;
  detail: string;
  ok: boolean;
  warning?: boolean;
}) {
  const Icon = ok ? CheckCircle2 : warning ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
      <Icon
        className={
          ok
            ? 'mt-0.5 size-4 shrink-0 text-emerald-600'
            : warning
              ? 'mt-0.5 size-4 shrink-0 text-amber-600'
              : 'mt-0.5 size-4 shrink-0 text-rose-600'
        }
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function NotebookRow({ notebook }: { notebook: StageListItem }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{notebook.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {notebook.sceneCount || notebook.sectionCount || 0} 页 ·{' '}
          {(notebook.tags || []).slice(0, 2).join(' · ') || '未标注'}
        </p>
      </div>
      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
        {notebook.notebookKind === 'markdown' ? 'Markdown' : 'Image'}
      </span>
    </div>
  );
}

function topConcepts(problems: CourseProblemClientSummary[], notebooks: StageListItem[]) {
  const counts = new Map<string, number>();
  for (const problem of problems) {
    for (const tag of problem.tags) {
      const key = tag.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    for (const notebook of notebooks) {
      for (const tag of notebook.tags || []) {
        const key = tag.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12);
}

function countNotebookMemories(counts: StudyMemoryNotebookCounts): number {
  return Object.values(counts).reduce((total, item) => total + (item.total || 0), 0);
}

export function CreatorCourseStudioClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const authHydrated = usePersistHydrated(useAuthStore);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const setCurrentCourse = useCurrentCourseStore((state) => state.setCurrentCourse);
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<CourseProblemClientSummary[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStudio = useCallback(async () => {
    const [nextCourse, nextNotebooks, nextProblems, courseMemories] = await Promise.all([
      getCourse(courseId),
      listStagesByCourse(courseId).catch(() => []),
      listCourseProblemSummaries(courseId).catch(() => []),
      listStudyMemoryRecords({ targetType: 'course', targetId: courseId }).catch(() => []),
    ]);
    if (!nextCourse) return null;
    const notebookMemoryCounts = await listNotebookStudyMemoryCounts(
      nextNotebooks.map((notebook) => notebook.id),
    ).catch(() => ({}));
    return {
      course: nextCourse,
      notebooks: nextNotebooks,
      problems: nextProblems,
      memoryCount: courseMemories.length + countNotebookMemories(notebookMemoryCounts),
    };
  }, [courseId]);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    let alive = true;
    setLoading(true);
    loadStudio()
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setError('课程不存在或无权访问');
          setLoading(false);
          return;
        }
        setCourse(data.course);
        setNotebooks(data.notebooks);
        setProblems(data.problems);
        setMemoryCount(data.memoryCount);
        setCurrentCourse({
          id: data.course.id,
          name: data.course.name,
          avatarUrl: data.course.avatarUrl,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '课程加载失败');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authHydrated, isLoggedIn, loadStudio, router, setCurrentCourse]);

  const concepts = useMemo(() => topConcepts(problems, notebooks), [notebooks, problems]);
  const publishedProblems = useMemo(
    () => problems.filter((problem) => problem.status === 'published'),
    [problems],
  );
  const isCourseOwner = Boolean(
    course && course.accessRole !== 'enrolled' && !course.sourceCourseId,
  );
  const publishBlockReason = course ? getCoursePublishBlockReason(course, notebooks) : null;
  const readyChecks = useMemo(() => {
    if (!course) return [];
    return [
      {
        label: '课程基本信息',
        ok: Boolean(course.name.trim() && course.description?.trim()),
        warning: true,
        detail: course.description?.trim()
          ? '名称和简介已经可供学生与商城理解课程定位。'
          : '建议补一段课程简介，学生加入前会更清楚适合谁。',
      },
      {
        label: '笔记本',
        ok: notebooks.length > 0,
        detail:
          notebooks.length > 0
            ? `已有 ${notebooks.length} 个笔记本，学生聊天可以定位到具体内容。`
            : '至少需要导入一个笔记本，课程才有可讲解的主体内容。',
      },
      {
        label: '题库',
        ok: problems.length > 0,
        warning: problems.length === 0,
        detail:
          problems.length > 0
            ? `已有 ${problems.length} 道题；上架会同步发布可用题库。`
            : '建议补充题库，否则课程只能回答问题，不能开出有效刷题计划。',
      },
      {
        label: '学习记忆',
        ok: memoryCount > 0,
        warning: true,
        detail:
          memoryCount > 0
            ? `已有 ${memoryCount} 条课程/笔记本记忆，可增强课程回答和复习建议。`
            : '可选：写入共有记忆，让课程知道常见误区、教学风格和考试重点。',
      },
      {
        label: '商城发布边界',
        ok: !publishBlockReason,
        detail: publishBlockReason || '课程没有包含不可再发布的商城副本资产。',
      },
    ];
  }, [course, memoryCount, notebooks, problems, publishBlockReason]);
  const hardPublishBlocked = Boolean(
    !isCourseOwner || (!course?.listedInCourseStore && publishBlockReason),
  );

  const handleTogglePublish = useCallback(async () => {
    if (!course || publishing) return;
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能发布');
      return;
    }
    if (!course.listedInCourseStore && publishBlockReason) {
      toast.error(publishBlockReason);
      return;
    }
    setPublishing(true);
    try {
      await updateCourse(course.id, {
        name: course.name,
        description: course.description ?? '',
        language: course.language,
        tags: course.tags,
        purpose: course.purpose,
        university: course.university,
        courseCode: course.courseCode,
        avatarUrl: course.avatarUrl,
        listedInCourseStore: !course.listedInCourseStore,
        coursePriceCents: course.coursePriceCents ?? 0,
      });
      const data = await loadStudio();
      if (data) {
        setCourse(data.course);
        setNotebooks(data.notebooks);
        setProblems(data.problems);
        setMemoryCount(data.memoryCount);
      }
      toast.success(
        course.listedInCourseStore
          ? '已停止上架课程；已加入学生仍可继续访问'
          : '已发布课程到商城，并同步发布课程题库',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布状态更新失败');
    } finally {
      setPublishing(false);
    }
  }, [course, isCourseOwner, loadStudio, publishBlockReason, publishing]);

  if (!authHydrated || loading) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载课程 Studio…
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-destructive">{error || '课程不存在'}</p>
          <Button onClick={() => router.push('/creator')} className="mt-4 gap-2">
            <ArrowLeft className="size-4" />
            创作者工作台
          </Button>
        </div>
      </div>
    );
  }

  const avatar = resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="rounded-lg border border-border bg-background p-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/creator')}
          className="-ml-2 gap-2"
        >
          <ArrowLeft className="size-4" />
          创作者工作台
        </Button>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <img
              src={avatar}
              alt=""
              className="size-16 rounded-lg object-cover ring-1 ring-black/5"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold">{course.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {[course.university, course.courseCode, course.tags?.[0]]
                  .filter(Boolean)
                  .join(' · ') || '课程 Studio'}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {course.description || '课程介绍待补充。'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span
                  className={
                    course.listedInCourseStore
                      ? 'rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200'
                      : 'rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground'
                  }
                >
                  {course.listedInCourseStore ? '商城已上架' : '未上架'}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                  {publishedProblems.length}/{problems.length} 题已发布
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                  {memoryCount} 条记忆
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/learn?courseId=${course.id}`)}
              className="gap-2"
            >
              <MessageCircle className="size-4" />
              学生视图
            </Button>
            {isCourseOwner ? (
              <Button onClick={() => router.push(`/course/${course.id}`)} className="gap-2">
                <ShoppingBag className="size-4" />
                发布管理
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssetStat label="笔记本" value={notebooks.length} icon={BookOpenText} />
        <AssetStat label="题库题目" value={problems.length} icon={Target} />
        <AssetStat label="知识点" value={concepts.length} icon={Brain} />
        <AssetStat label="学习记忆" value={memoryCount} icon={Brain} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-emerald-600" />
            <h2 className="text-base font-semibold">发布检查</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isCourseOwner
              ? '上架课程会同步课程信息、笔记本商城状态和课程题库，学生加入后直接进入新版课程聊天。'
              : '这门课程由原创建者维护，你可以查看内容状态并进入学生视图。'}
          </p>
          {isCourseOwner ? (
            <>
              <div className="mt-4 grid gap-2">
                {readyChecks.map((item) => (
                  <ReadinessItem
                    key={item.label}
                    label={item.label}
                    detail={item.detail}
                    ok={item.ok}
                    warning={item.warning}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleTogglePublish()}
                  disabled={publishing || hardPublishBlocked}
                  className="gap-2"
                >
                  {publishing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : course.listedInCourseStore ? (
                    <XCircle className="size-4" />
                  ) : (
                    <ShoppingBag className="size-4" />
                  )}
                  {course.listedInCourseStore ? '停止上架' : '发布到课程商城'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/store/courses')}
                  className="gap-2"
                >
                  <ShoppingBag className="size-4" />
                  查看商城
                </Button>
              </div>
              {publishBlockReason ? (
                <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-200">
                  {publishBlockReason}
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm leading-6 text-muted-foreground">
              创建者负责维护笔记本、题库、课程记忆和商城发布。你的做题记录、学习状态和私有记忆会保存在自己的学习空间。
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-sky-600" />
            <h2 className="text-base font-semibold">下一步动作</h2>
          </div>
          <div className="mt-4 grid gap-2">
            {isCourseOwner ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/course/${course.id}/create-notebook`)}
                  className="justify-start gap-2"
                >
                  <FilePlus2 className="size-4" />
                  导入或生成笔记本
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/course/${course.id}/problem-bank`)}
                  className="justify-start gap-2"
                >
                  <Target className="size-4" />
                  导入或整理题库
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/course/${course.id}/memory`)}
                  className="justify-start gap-2"
                >
                  <Brain className="size-4" />
                  写入课程记忆
                </Button>
              </>
            ) : null}
            <Button
              variant={isCourseOwner ? 'outline' : 'default'}
              onClick={() => router.push(`/learn?courseId=${course.id}`)}
              className="justify-start gap-2"
            >
              <MessageCircle className="size-4" />
              检查学生视图
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">课程内容地图</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                新版学生端会根据这些资产判断进度、弱点和复习范围。
              </p>
            </div>
            {isCourseOwner ? (
              <Button
                variant="outline"
                onClick={() => router.push(`/course/${course.id}/create-notebook`)}
                className="gap-2"
              >
                <FilePlus2 className="size-4" />
                导入笔记本
              </Button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-2">
            {notebooks.slice(0, 8).map((notebook) => (
              <NotebookRow key={notebook.id} notebook={notebook} />
            ))}
            {notebooks.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                还没有笔记本。
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-base font-semibold">知识点和题库</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {concepts.map(([concept, count]) => (
              <span
                key={concept}
                className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200"
              >
                {concept} · {count}
              </span>
            ))}
            {concepts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                题目标签或笔记本标签会形成课程知识点地图。
              </p>
            ) : null}
          </div>
          {isCourseOwner ? (
            <div className="mt-5 grid gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/course/${course.id}/problem-bank`)}
                className="justify-start gap-2"
              >
                <Target className="size-4" />
                管理课程题库
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/course/${course.id}/memory`)}
                className="justify-start gap-2"
              >
                <Brain className="size-4" />
                管理课程记忆
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
