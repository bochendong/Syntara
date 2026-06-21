'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Flame,
  HardDrive,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  SquareUserRound,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
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
import { resolveCourseBackgroundDisplayUrl } from '@/lib/constants/course-backgrounds';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { createNotebookHref } from '@/lib/constants/course-chat';
import { resolveNotebookAgentAvatarDisplayUrl } from '@/lib/constants/notebook-agent-avatars';
import { getLocalStudyMemoryUserId, loadStudyMemory } from '@/lib/learning/study-memory';
import { problemConceptTopics } from '@/lib/problem-bank/concept-tags.mjs';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import {
  listNotebookStudyMemoryCounts,
  type StudyMemoryNotebookCounts,
} from '@/lib/utils/study-memory-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { creditsFromPriceCents } from '@/lib/utils/credits';
import {
  courseContainsPurchasedNotebook,
  getCoursePublishBlockReasonFromFlags,
  getPurchasedNotebookMoveSuccessMessage,
  getPurchasedNotebookMoveWarning,
} from '@/lib/utils/course-publish';
import {
  buildCourseNotebookSignature,
  clearCourseWorkspaceCache,
  readCourseWorkspaceCache,
  writeCourseWorkspaceCache,
  type CourseWorkspaceCache,
} from '@/lib/utils/course-workspace-cache';

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

const NOTEBOOKS_PER_PAGE = 6;
const CLASSMATES_PER_PAGE = 9;

type PublishState = 'idle' | 'publishing' | 'published';
type PublishProgressStep = 'prepare' | 'load' | 'save' | 'course' | 'refresh';

type PublishProgress = {
  step: PublishProgressStep;
  message: string;
  detail?: string;
  completed: number;
  total: number;
};

const PUBLISH_PROGRESS_STEPS: Array<{ id: PublishProgressStep; label: string }> = [
  { id: 'prepare', label: '整理范围' },
  { id: 'load', label: '读取笔记本' },
  { id: 'save', label: '保存共享内容' },
  { id: 'course', label: '发布课程与题库' },
  { id: 'refresh', label: '刷新结果' },
];

function compareNotebooksByName(a: StageListItem, b: StageListItem): number {
  return (
    notebookNameCollator.compare(a.name.trim(), b.name.trim()) ||
    b.updatedAt - a.updatedAt ||
    a.id.localeCompare(b.id)
  );
}

function getPublishStepIndex(step: PublishProgressStep): number {
  return Math.max(
    0,
    PUBLISH_PROGRESS_STEPS.findIndex((item) => item.id === step),
  );
}

function getPublishProgressPercent(
  progress: PublishProgress | null,
  publishState: PublishState,
): number {
  if (publishState === 'published') return 100;
  if (!progress) return 0;
  const stepSize = 100 / PUBLISH_PROGRESS_STEPS.length;
  const currentStepRatio =
    progress.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
  return Math.min(
    98,
    Math.round(getPublishStepIndex(progress.step) * stepSize + currentStepRatio * stepSize),
  );
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([itemKey]) => itemKey !== key));
}

type LocalStudyMemoryCounts = {
  public: number;
  private: number;
  weak: number;
};

function countLocalStudyMemoryItems(notebookId: string): LocalStudyMemoryCounts {
  const profile = loadStudyMemory(getLocalStudyMemoryUserId(), notebookId);
  const activePublic = profile.publicMemories.filter((item) => item.status !== 'archived').length;
  const activePrivate = profile.privateMemories.filter((item) => item.status !== 'archived').length;
  const openWeakPoints = profile.weakPoints.filter((item) => item.status !== 'reviewed').length;
  return { public: activePublic, private: activePrivate, weak: openWeakPoints };
}

function mergeStudyMemoryCount(
  notebookId: string,
  databaseCounts: StudyMemoryNotebookCounts,
): number {
  const local = countLocalStudyMemoryItems(notebookId);
  const databaseCount = databaseCounts[notebookId]?.total ?? 0;
  if (databaseCount > 0) return databaseCount + local.private + local.weak;
  return local.public + local.private + local.weak;
}

async function buildNotebookMemoryCounts(
  notebooks: StageListItem[],
): Promise<Record<string, number>> {
  const databaseCounts: StudyMemoryNotebookCounts = await listNotebookStudyMemoryCounts(
    notebooks.map((item) => item.id),
  ).catch(() => ({}));
  return Object.fromEntries(
    notebooks.map((notebook) => [notebook.id, mergeStudyMemoryCount(notebook.id, databaseCounts)]),
  );
}

async function loadCourseWorkspaceCacheData(
  courseId: string,
  notebooks: StageListItem[],
): Promise<
  Pick<CourseWorkspaceCache, 'thumbnails' | 'memoryCounts' | 'problemCounts' | 'courseProblems'>
> {
  const [problems, nextMemoryCounts, nextThumbnails] = await Promise.all([
    listCourseProblemSummaries(courseId).catch(() => []),
    buildNotebookMemoryCounts(notebooks),
    getFirstSlideByStages(notebooks.map((notebook) => notebook.id)).catch(() => ({})),
  ]);

  return {
    thumbnails: nextThumbnails,
    memoryCounts: nextMemoryCounts,
    problemCounts: countProblemsByNotebook(problems),
    courseProblems: problems,
  };
}

function writeCourseWorkspaceDataCache(
  courseId: string,
  notebooks: StageListItem[],
  data: Pick<
    CourseWorkspaceCache,
    'thumbnails' | 'memoryCounts' | 'problemCounts' | 'courseProblems'
  >,
) {
  writeCourseWorkspaceCache({
    courseId,
    notebookSignature: buildCourseNotebookSignature(notebooks),
    notebookIds: notebooks.map((notebook) => notebook.id),
    ...data,
    savedAt: Date.now(),
  });
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

function getCourseProblemTopics(problem: CourseProblemClientSummary): string[] {
  const tags = problemConceptTopics(problem).map(normalizeCourseProblemTopic).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return ['未标注'];
}

function getCourseProblemPracticeState(
  problem: CourseProblemClientSummary,
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

function countProblemsByNotebook(problems: CourseProblemClientSummary[]): Record<string, number> {
  return problems.reduce<Record<string, number>>((acc, problem) => {
    if (problem.notebookId) {
      acc[problem.notebookId] = (acc[problem.notebookId] ?? 0) + 1;
    }
    return acc;
  }, {});
}

function getNotebookPracticeProgress(
  problems: CourseProblemClientSummary[],
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

type CourseWorkspaceTab = 'notebooks' | 'classmates' | 'materials';

type CourseClassmateProfile = {
  id: string;
  name: string;
  initials: string;
  status: string;
  topic: string;
  weeklyCompleted: number;
  accuracy: number;
  streakDays: number;
  rhythmLabel: string;
  rhythmCaption: string;
  activeBars: number[];
  avatarTone: string;
};

const classmateNamePool = [
  '陈知行',
  '林若初',
  '周见微',
  '许临川',
  '沈亦然',
  '吴知夏',
  '梁思予',
  '赵云起',
  '顾清越',
  '叶安然',
  '何以宁',
  '宋知予',
  '韩若白',
  '唐予安',
  '陆景和',
  '孟星河',
  '程见山',
  '苏以南',
  '白若宁',
];

const classmateAvatarTones = [
  'from-sky-100 via-blue-50 to-indigo-100 text-sky-700 ring-sky-100',
  'from-emerald-100 via-teal-50 to-sky-100 text-emerald-700 ring-emerald-100',
  'from-amber-100 via-orange-50 to-rose-100 text-amber-700 ring-amber-100',
  'from-cyan-100 via-sky-50 to-blue-100 text-cyan-700 ring-cyan-100',
  'from-rose-100 via-pink-50 to-orange-100 text-rose-700 ring-rose-100',
  'from-lime-100 via-emerald-50 to-teal-100 text-lime-700 ring-lime-100',
] as const;

const classmateRhythmBars = [
  [20, 28, 34, 40, 30, 24, 22, 28, 38, 44, 36, 42],
  [18, 22, 28, 32, 26, 30, 34, 42, 46, 40, 32, 24],
  [26, 34, 42, 46, 36, 28, 22, 24, 30, 36, 32, 26],
  [16, 20, 24, 30, 34, 38, 44, 48, 42, 36, 28, 22],
] as const;

function makeClassmateInitials(name: string): string {
  return name.trim().slice(-2) || '课友';
}

function buildCourseClassmateProfiles(args: {
  course: CourseRecord | null | undefined;
  notebooks: StageListItem[];
  courseProblemStats: {
    total: number;
    attempted: number;
    masteryPercent: number;
    weakTopics: Array<{ topic: string }>;
  };
  currentUserName: string;
}): CourseClassmateProfile[] {
  const topicCandidates = [
    ...args.notebooks.map((item) => item.name.trim()).filter(Boolean),
    ...args.courseProblemStats.weakTopics.map((item) => item.topic.trim()).filter(Boolean),
    args.course?.name.trim() || '',
    '积分技巧与换元法',
    '反向链式法则',
    '曲线面积与体积',
  ].filter(Boolean);
  const uniqueTopics = Array.from(new Set(topicCandidates));

  return classmateNamePool.map((name, index) => {
    const topic = uniqueTopics[index % uniqueTopics.length] || '积分技巧与换元法';
    const attemptedBase = Math.max(18, args.courseProblemStats.attempted || 24);
    const weeklyCompleted = Math.max(12, Math.round(attemptedBase * (1.35 - index * 0.08)));
    const accuracy = Math.min(
      96,
      Math.max(78, args.courseProblemStats.masteryPercent + 11 - index * 2),
    );
    const streakDays = Math.max(2, 6 - (index % 5));
    return {
      id: `classmate-${index}`,
      name: name === args.currentUserName.trim() ? `${name}（你）` : name,
      initials: makeClassmateInitials(name),
      status: index < 3 ? '同频学习中' : index < 6 ? '近期活跃' : '可一起讨论',
      topic,
      weeklyCompleted,
      accuracy,
      streakDays,
      rhythmLabel: index % 3 === 0 ? '节奏合拍' : index % 3 === 1 ? '晚间活跃' : '章节相近',
      rhythmCaption: index % 2 === 0 ? '傍晚活跃 · 适合一起讨论' : '最近同章节 · 适合向他提问',
      activeBars: [...classmateRhythmBars[index % classmateRhythmBars.length]],
      avatarTone: classmateAvatarTones[index % classmateAvatarTones.length],
    };
  });
}

function CourseClassmateCard({
  profile,
  onAdd,
  onAsk,
  onSchedule,
  onOpenSpace,
}: {
  profile: CourseClassmateProfile;
  onAdd: (profile: CourseClassmateProfile) => void;
  onAsk: (profile: CourseClassmateProfile) => void;
  onSchedule: (profile: CourseClassmateProfile) => void;
  onOpenSpace: (profile: CourseClassmateProfile) => void;
}) {
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-3xl border border-slate-200/80 bg-white/94 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_54px_rgba(37,99,235,0.12)] dark:border-white/10 dark:bg-slate-950/62 dark:hover:border-sky-400/30">
      <div className="flex min-w-0 items-start gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              'grid size-16 place-items-center rounded-full bg-gradient-to-br text-lg font-bold shadow-inner ring-6',
              profile.avatarTone,
            )}
          >
            {profile.initials}
          </div>
          <span className="absolute bottom-0.5 right-0 size-3.5 rounded-full border-[3px] border-white bg-emerald-500 dark:border-slate-950" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h3 className="min-w-0 truncate text-xl font-bold text-slate-950 dark:text-white">
                {profile.name}
              </h3>
              <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                <Users className="size-4" strokeWidth={1.9} />
                <span>{profile.status}</span>
              </div>
            </div>
            <button
              type="button"
              aria-label={`添加 ${profile.name}`}
              title="添加课友"
              onClick={() => onAdd(profile)}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/15"
            >
              <Plus className="size-4" strokeWidth={2.2} />
            </button>
          </div>
          <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/8">
              Calculus II
            </span>
            <span className="size-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/8">
              微积分进阶探索
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenSpace(profile)}
        className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/55 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:border-sky-400/20 dark:bg-sky-400/8 dark:hover:bg-sky-400/12"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">最近在学</p>
          <p
            className="mt-0.5 truncate text-base font-bold leading-snug text-slate-950 sm:text-lg dark:text-white"
            title={profile.topic}
          >
            {profile.topic}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-slate-500 dark:text-slate-400" />
      </button>

      <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        {[
          {
            icon: Target,
            label: '本周完成',
            value: `${profile.weeklyCompleted} 题`,
            tone: 'text-emerald-600 dark:text-emerald-300',
          },
          {
            icon: TrendingUp,
            label: '正确率',
            value: `${profile.accuracy}%`,
            tone: 'text-emerald-600 dark:text-emerald-300',
          },
          {
            icon: Flame,
            label: '连续学习',
            value: `${profile.streakDays} 天`,
            tone: 'text-amber-500 dark:text-amber-300',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 border-r border-slate-100 px-2.5 py-3 text-center last:border-r-0 dark:border-white/10"
          >
            <item.icon className={cn('mx-auto size-5', item.tone)} strokeWidth={2.1} />
            <p className="mt-2 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className={cn('mt-0.5 truncate text-lg font-bold', item.tone)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-950 dark:text-white">
              学习节奏匹配
            </p>
            <p className="mt-1 truncate text-sm font-medium text-slate-500 dark:text-slate-400">
              {profile.rhythmCaption}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-600 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
            {profile.rhythmLabel}
          </span>
        </div>
        <div className="mt-3 grid h-12 grid-cols-12 items-end gap-2 overflow-hidden">
          {profile.activeBars.map((height, index) => (
            <span
              key={`${profile.id}-bar-${index}`}
              className={cn(
                'w-full max-w-[10px] justify-self-center rounded-full',
                index >= 7 && index <= 10
                  ? 'bg-blue-500 dark:bg-sky-300'
                  : 'bg-blue-100 dark:bg-sky-400/18',
              )}
              style={{ height }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSchedule(profile)}
          className="col-span-2 inline-flex min-w-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          <CalendarCheck className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">可约自习</span>
        </button>
        <button
          type="button"
          onClick={() => onAsk(profile)}
          className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-sky-400/10"
        >
          <MessageCircle className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">向他提问</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenSpace(profile)}
          className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-sky-400/10"
        >
          <SquareUserRound className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">查看空间</span>
        </button>
      </div>
    </article>
  );
}

export default function CourseDetailPageClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const authHydrated = usePersistHydrated(useAuthStore);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authName = useAuthStore((s) => s.name);
  const creatorDisplay = useAuthStore(() => '你');

  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [problemCounts, setProblemCounts] = useState<Record<string, number>>({});
  const [courseProblems, setCourseProblems] = useState<CourseProblemClientSummary[]>([]);
  const [moveTargets, setMoveTargets] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<CourseWorkspaceTab>('notebooks');
  const [notebookPage, setNotebookPage] = useState(0);
  const [classmateQuery, setClassmateQuery] = useState('');
  const [classmatePage, setClassmatePage] = useState(0);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<StageListItem | null>(null);
  const [publishTarget, setPublishTarget] = useState<
    { kind: 'course' } | { kind: 'notebook'; notebook: StageListItem } | null
  >(null);
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [publishStartedAt, setPublishStartedAt] = useState<number | null>(null);
  const [publishElapsedSeconds, setPublishElapsedSeconds] = useState(0);
  const [storeVisibilityBusyId, setStoreVisibilityBusyId] = useState<string | null>(null);
  const isCourseOwner = course?.accessRole !== 'enrolled';
  const courseHasPurchasedNotebook = courseContainsPurchasedNotebook(notebooks);
  const coursePublishBlockReason = getCoursePublishBlockReasonFromFlags(
    course,
    courseHasPurchasedNotebook,
  );
  const coursePublishActionDisabled = Boolean(
    !course?.listedInCourseStore && coursePublishBlockReason,
  );
  const sortedNotebooks = useMemo(() => [...notebooks].sort(compareNotebooksByName), [notebooks]);
  const notebookPageCount = Math.max(1, Math.ceil(sortedNotebooks.length / NOTEBOOKS_PER_PAGE));
  const normalizedNotebookPage = Math.min(notebookPage, notebookPageCount - 1);
  const pagedNotebooks = useMemo(() => {
    const start = normalizedNotebookPage * NOTEBOOKS_PER_PAGE;
    return sortedNotebooks.slice(start, start + NOTEBOOKS_PER_PAGE);
  }, [normalizedNotebookPage, sortedNotebooks]);
  const notebookPageStart =
    sortedNotebooks.length > 0 ? normalizedNotebookPage * NOTEBOOKS_PER_PAGE + 1 : 0;
  const notebookPageEnd = Math.min(
    sortedNotebooks.length,
    (normalizedNotebookPage + 1) * NOTEBOOKS_PER_PAGE,
  );
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
  const classmateProfiles = useMemo(
    () =>
      buildCourseClassmateProfiles({
        course,
        notebooks: sortedNotebooks,
        courseProblemStats,
        currentUserName: authName,
      }),
    [authName, course, courseProblemStats, sortedNotebooks],
  );
  const normalizedClassmateQuery = classmateQuery.trim().toLowerCase();
  const filteredClassmateProfiles = useMemo(() => {
    if (!normalizedClassmateQuery) return classmateProfiles;
    return classmateProfiles.filter((profile) =>
      profile.name.toLowerCase().includes(normalizedClassmateQuery),
    );
  }, [classmateProfiles, normalizedClassmateQuery]);
  const classmatePageCount = Math.max(
    1,
    Math.ceil(filteredClassmateProfiles.length / CLASSMATES_PER_PAGE),
  );
  const normalizedClassmatePage = Math.min(classmatePage, classmatePageCount - 1);
  const pagedClassmateProfiles = useMemo(() => {
    const start = normalizedClassmatePage * CLASSMATES_PER_PAGE;
    return filteredClassmateProfiles.slice(start, start + CLASSMATES_PER_PAGE);
  }, [filteredClassmateProfiles, normalizedClassmatePage]);
  const classmatePageStart =
    filteredClassmateProfiles.length > 0 ? normalizedClassmatePage * CLASSMATES_PER_PAGE + 1 : 0;
  const classmatePageEnd = Math.min(
    filteredClassmateProfiles.length,
    (normalizedClassmatePage + 1) * CLASSMATES_PER_PAGE,
  );
  const publishProgressPercent = getPublishProgressPercent(publishProgress, publishState);
  const activePublishStepIndex = publishProgress ? getPublishStepIndex(publishProgress.step) : -1;

  useEffect(() => {
    if (publishState !== 'publishing' || !publishStartedAt) {
      setPublishElapsedSeconds(0);
      return;
    }

    const tick = () => {
      setPublishElapsedSeconds(Math.max(0, Math.floor((Date.now() - publishStartedAt) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [publishStartedAt, publishState]);

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
        clearCourseWorkspaceCache(id);
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
      const notebookSignature = buildCourseNotebookSignature(list);
      const cachedWorkspace = readCourseWorkspaceCache(id, notebookSignature);
      if (!alive) return;
      setNotebooks(list);
      if (cachedWorkspace) {
        setThumbnails(cachedWorkspace.thumbnails);
        setMemoryCounts(cachedWorkspace.memoryCounts);
        setProblemCounts(cachedWorkspace.problemCounts);
        setCourseProblems(cachedWorkspace.courseProblems);
      } else {
        setThumbnails({});
        setMemoryCounts({});
        setProblemCounts({});
        setCourseProblems([]);
      }
      setLoading(false);

      void Promise.all([listCourses(), loadCourseWorkspaceCacheData(id, list)]).then(
        ([allCourses, freshWorkspaceData]) => {
          writeCourseWorkspaceDataCache(id, list, freshWorkspaceData);
          if (!alive) return;
          setMoveTargets(
            allCourses
              .filter((x) => x.id !== id && x.accessRole !== 'enrolled')
              .map((x) => ({ id: x.id, name: x.name })),
          );
          setThumbnails(freshWorkspaceData.thumbnails);
          setMemoryCounts(freshWorkspaceData.memoryCounts);
          setProblemCounts(freshWorkspaceData.problemCounts);
          setCourseProblems(freshWorkspaceData.courseProblems);
        },
      );
    })();
    return () => {
      alive = false;
    };
  }, [authHydrated, id, isLoggedIn, router]);

  useEffect(() => {
    setNotebookPage(0);
  }, [id]);

  useEffect(() => {
    setNotebookPage((page) =>
      Math.min(page, Math.max(0, Math.ceil(sortedNotebooks.length / NOTEBOOKS_PER_PAGE) - 1)),
    );
  }, [sortedNotebooks.length]);

  useEffect(() => {
    setClassmatePage(0);
  }, [id, normalizedClassmateQuery]);

  useEffect(() => {
    setClassmatePage((page) =>
      Math.min(
        page,
        Math.max(0, Math.ceil(filteredClassmateProfiles.length / CLASSMATES_PER_PAGE) - 1),
      ),
    );
  }, [filteredClassmateProfiles.length]);

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

  const courseBackgroundUrl = course ? resolveCourseBackgroundDisplayUrl(course.id) : '';
  const coursePublishActionLabel = coursePublishActionDisabled
    ? course?.sourceCourseId
      ? '旧版副本不可发布'
      : '含已购笔记本不可发布'
    : storeVisibilityBusyId === 'course'
      ? '下架中…'
      : publishTarget?.kind === 'course' && publishState === 'publishing'
        ? '发布中…'
        : course?.listedInCourseStore
          ? '停止上架'
          : '发布到商城';

  const handleMoveNotebook = async (notebookId: string, targetCourseId: string) => {
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能移动笔记本');
      return;
    }
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
      const workspaceData = await loadCourseWorkspaceCacheData(id, list);
      writeCourseWorkspaceDataCache(id, list, workspaceData);
      setNotebooks(list);
      setThumbnails(workspaceData.thumbnails);
      setMemoryCounts(workspaceData.memoryCounts);
      setProblemCounts(workspaceData.problemCounts);
      setCourseProblems(workspaceData.courseProblems);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移动失败');
    }
  };

  const handleDeleteNotebook = async (notebookId: string, notebookName: string) => {
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能删除笔记本');
      return;
    }
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
      const workspaceData = await loadCourseWorkspaceCacheData(id, list);
      writeCourseWorkspaceDataCache(id, list, workspaceData);
      setNotebooks(list);
      setThumbnails(workspaceData.thumbnails);
      setMemoryCounts(workspaceData.memoryCounts);
      setProblemCounts(workspaceData.problemCounts);
      setCourseProblems(workspaceData.courseProblems);
      toast.success(`已删除「${notebookName}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleTogglePublishCourse = async () => {
    if (!course) return;
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能发布');
      return;
    }
    if (course.listedInCourseStore) {
      setStoreVisibilityBusyId('course');
      try {
        await updateCourse(course.id, {
          name: course.name,
          description: course.description ?? '',
          language: course.language,
          tags: course.tags,
          purpose: course.purpose,
          university: course.university,
          courseCode: course.courseCode,
          listedInCourseStore: false,
          coursePriceCents: course.coursePriceCents ?? 0,
        });
        const next = await getCourse(course.id);
        if (next) setCourse(next);
        const list = await listStagesByCourse(id);
        const workspaceData = await loadCourseWorkspaceCacheData(id, list);
        writeCourseWorkspaceDataCache(id, list, workspaceData);
        setNotebooks(list);
        setThumbnails(workspaceData.thumbnails);
        setMemoryCounts(workspaceData.memoryCounts);
        setProblemCounts(workspaceData.problemCounts);
        setCourseProblems(workspaceData.courseProblems);
        toast.success('已停止上架课程；已加入学生仍可继续访问');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '停止上架失败');
      } finally {
        setStoreVisibilityBusyId(null);
      }
      return;
    }
    if (!course.listedInCourseStore && coursePublishBlockReason) {
      toast.error(coursePublishBlockReason);
      return;
    }
    setPublishTarget({ kind: 'course' });
    setPublishState('idle');
    setPublishProgress(null);
    setPublishStartedAt(null);
  };

  const handleTogglePublishNotebook = async (notebook: StageListItem) => {
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能发布');
      return;
    }
    if (notebook.listedInNotebookStore) {
      setStoreVisibilityBusyId(`notebook:${notebook.id}`);
      try {
        await updateStageStoreMeta(notebook.id, {
          listedInNotebookStore: false,
          notebookPriceCents: notebook.notebookPriceCents ?? 0,
        });
        const list = await listStagesByCourse(id);
        const workspaceData = await loadCourseWorkspaceCacheData(id, list);
        writeCourseWorkspaceDataCache(id, list, workspaceData);
        setNotebooks(list);
        setThumbnails(workspaceData.thumbnails);
        setMemoryCounts(workspaceData.memoryCounts);
        setProblemCounts(workspaceData.problemCounts);
        setCourseProblems(workspaceData.courseProblems);
        toast.success(`已停止上架笔记本「${notebook.name}」`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '停止上架失败');
      } finally {
        setStoreVisibilityBusyId(null);
      }
      return;
    }
    if (notebook.sourceNotebookId) {
      toast.error('购买得到的笔记本副本不能再次发布到商城');
      return;
    }
    setPublishTarget({ kind: 'notebook', notebook });
    setPublishState('idle');
    setPublishProgress(null);
    setPublishStartedAt(null);
  };

  const handleConfirmPublish = async () => {
    if (!course || !publishTarget) return;
    if (publishState !== 'idle') return;
    if (!isCourseOwner) {
      toast.error('已加入的课程由创建者维护，不能发布');
      return;
    }
    if (publishTarget.kind === 'course' && coursePublishBlockReason) {
      toast.error(coursePublishBlockReason);
      return;
    }
    setPublishState('publishing');
    setPublishStartedAt(Date.now());
    try {
      const alreadyListed =
        publishTarget.kind === 'course'
          ? course.listedInCourseStore
          : Boolean(publishTarget.notebook.listedInNotebookStore);
      const targets = publishTarget.kind === 'course' ? notebooks : [publishTarget.notebook];
      setPublishProgress({
        step: 'prepare',
        message: '正在整理发布范围',
        detail:
          publishTarget.kind === 'course'
            ? `本次会发布 ${targets.length} 本笔记本，并同步课程题库。`
            : `本次会发布笔记本「${publishTarget.notebook.name}」。`,
        completed: 1,
        total: 1,
      });

      let loadedCount = 0;
      setPublishProgress({
        step: 'load',
        message: '正在读取笔记本内容',
        detail: `准备读取 ${targets.length} 本笔记本的页面、讲解稿和结构。`,
        completed: 0,
        total: targets.length,
      });
      const loadedStages = (
        await Promise.all(
          targets.map(async (notebook) => {
            const data = await loadStageData(notebook.id);
            loadedCount += 1;
            setPublishProgress({
              step: 'load',
              message: '正在读取笔记本内容',
              detail: `已读取 ${loadedCount}/${targets.length} 本：${notebook.name}`,
              completed: loadedCount,
              total: targets.length,
            });
            return { notebook, data };
          }),
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

      let savedCount = 0;
      setPublishProgress({
        step: 'save',
        message: '正在保存共享页面与讲解稿',
        detail: '会保存课程页面、图片、页面结构和讲解稿文本；个人语音不会写入共享内容。',
        completed: 0,
        total: loadedStages.length,
      });
      await Promise.all(
        loadedStages.map(async ({ notebook, data }) => {
          await savePublishedStageData(notebook.id, data, {
            includeSpeechAudio: false,
          });
          await updateStageStoreMeta(notebook.id, {
            listedInNotebookStore: true,
            notebookPriceCents: notebook.notebookPriceCents ?? 0,
          });
          savedCount += 1;
          setPublishProgress({
            step: 'save',
            message: '正在保存共享页面与讲解稿',
            detail: `已保存 ${savedCount}/${loadedStages.length} 本：${notebook.name}`,
            completed: savedCount,
            total: loadedStages.length,
          });
        }),
      );

      setPublishProgress({
        step: 'course',
        message: publishTarget.kind === 'course' ? '正在发布课程信息与题库' : '正在发布笔记本信息',
        detail:
          publishTarget.kind === 'course' && publishTargetProblemCount > 0
            ? `正在整理并发布 ${publishTargetProblemCount} 道题目；题量较大时这里可能需要几十秒。`
            : '正在更新商城状态和发布时间。',
        completed: 0,
        total: 1,
      });
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
      setPublishProgress({
        step: 'course',
        message: publishTarget.kind === 'course' ? '课程信息与题库已发布' : '笔记本信息已发布',
        detail: '正在刷新课程页展示的数据。',
        completed: 1,
        total: 1,
      });

      setPublishProgress({
        step: 'refresh',
        message: '正在刷新课程数据',
        detail: '读取最新课程状态、笔记本列表和题库统计。',
        completed: 0,
        total: 3,
      });
      const next = await getCourse(course.id);
      if (next) setCourse(next);
      setPublishProgress({
        step: 'refresh',
        message: '正在刷新课程数据',
        detail: '已读取最新课程状态。',
        completed: 1,
        total: 3,
      });
      const list = await listStagesByCourse(id);
      setPublishProgress({
        step: 'refresh',
        message: '正在刷新课程数据',
        detail: '已读取最新笔记本列表。',
        completed: 2,
        total: 3,
      });
      const workspaceData = await loadCourseWorkspaceCacheData(id, list);
      writeCourseWorkspaceDataCache(id, list, workspaceData);
      setNotebooks(list);
      setThumbnails(workspaceData.thumbnails);
      setMemoryCounts(workspaceData.memoryCounts);
      setProblemCounts(workspaceData.problemCounts);
      setCourseProblems(workspaceData.courseProblems);
      setPublishProgress({
        step: 'refresh',
        message: '发布完成',
        detail: '学生刷新后会看到最新共享内容。',
        completed: 3,
        total: 3,
      });
      setPublishState('published');
      toast.success(
        publishTarget.kind === 'course'
          ? alreadyListed
            ? '课程更新已发布，学生将看到最新共享内容'
            : '课程已发布，学生可按自己的音色生成语音'
          : alreadyListed
            ? `笔记本「${publishTarget.notebook.name}」更新已发布`
            : `笔记本「${publishTarget.notebook.name}」已发布，语音由每位用户自行生成`,
      );
      setPublishTarget(null);
      setPublishState('idle');
      setPublishProgress(null);
      setPublishStartedAt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
      setPublishState('idle');
      setPublishProgress(null);
      setPublishStartedAt(null);
    }
  };

  const handleNotebookEditSaved = async () => {
    const list = await listStagesByCourse(id);
    const workspaceData = await loadCourseWorkspaceCacheData(id, list);
    writeCourseWorkspaceDataCache(id, list, workspaceData);
    setNotebooks(list);
    setThumbnails(workspaceData.thumbnails);
    setMemoryCounts(workspaceData.memoryCounts);
    setProblemCounts(workspaceData.problemCounts);
    setCourseProblems(workspaceData.courseProblems);
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
            <section className="relative mb-4 h-[18.5rem] overflow-hidden rounded-[24px] border border-white/75 bg-slate-100 shadow-[0_18px_54px_rgba(15,23,42,0.11)] ring-1 ring-slate-900/[0.035] dark:border-white/10 dark:bg-slate-950 dark:shadow-[0_22px_60px_rgba(0,0,0,0.32)] sm:h-[17rem] md:mb-5 md:h-[15.5rem] lg:h-[15.75rem] xl:h-[15rem]">
              <img
                src={courseBackgroundUrl}
                alt=""
                className="absolute inset-0 size-full object-cover brightness-[1.1] saturate-[1.06]"
                aria-hidden
              />
              <div
                className="absolute inset-0 bg-[linear-gradient(110deg,rgba(15,23,42,0.2)_0%,rgba(15,23,42,0.11)_50%,rgba(15,23,42,0.04)_100%)] dark:bg-[linear-gradient(110deg,rgba(8,13,24,0.72)_0%,rgba(8,13,24,0.5)_52%,rgba(8,13,24,0.22)_100%)]"
                aria-hidden
              />
              <div
                className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/24 via-slate-950/5 to-transparent dark:from-slate-950/72 dark:via-slate-950/18"
                aria-hidden
              />
              <div className="relative z-10 flex h-full min-h-0 flex-col justify-start gap-3.5 p-4 sm:p-5 md:p-5">
                <div className="flex min-h-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                    <img
                      src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                      alt=""
                      className="size-[4.25rem] shrink-0 rounded-[22px] border border-white/80 bg-white object-cover shadow-[0_14px_34px_rgba(15,23,42,0.2)] ring-1 ring-slate-900/[0.04] dark:border-white/15 dark:bg-slate-900 md:size-16 md:rounded-[18px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-2 xl:block">
                        <h1
                          id="course-detail-title"
                          className="min-w-0 flex-1 truncate text-xl font-semibold leading-[1.12] tracking-normal text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.38)] md:text-[1.7rem] xl:max-w-[44rem]"
                        >
                          {course.name}
                        </h1>
                        {isCourseOwner ? (
                          <div
                            className="flex shrink-0 items-center gap-1 xl:hidden"
                            data-course-actions-compact
                          >
                            <Button
                              asChild
                              size="icon-sm"
                              variant="outline"
                              className="size-8 rounded-full border-white/15 bg-slate-950/22 text-white shadow-sm backdrop-blur-md hover:bg-slate-950/34 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                              title="资料库"
                            >
                              <Link
                                href={`/course/${encodeURIComponent(id)}/resources`}
                                aria-label="资料库"
                              >
                                <HardDrive className="size-4" strokeWidth={1.85} />
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              className="size-8 rounded-full border-white/15 bg-slate-950/22 text-white shadow-sm backdrop-blur-md hover:bg-slate-950/34 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                              aria-label="编辑课程"
                              title="编辑课程"
                              onClick={() => setEditCourseOpen(true)}
                            >
                              <Pencil className="size-4" strokeWidth={1.85} />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              className="size-8 rounded-full border-white/15 bg-slate-950/22 text-white shadow-sm backdrop-blur-md hover:bg-slate-950/34 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                              aria-label={coursePublishActionLabel}
                              title={coursePublishActionLabel}
                              disabled={
                                coursePublishActionDisabled || storeVisibilityBusyId === 'course'
                              }
                              onClick={() => void handleTogglePublishCourse()}
                            >
                              <Store className="size-4" strokeWidth={1.85} />
                            </Button>
                            <Button
                              asChild
                              size="icon-sm"
                              className="size-8 rounded-full bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.25)] hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                              title="新建笔记本"
                            >
                              <Link href={createNotebookHref(id)} aria-label="新建笔记本">
                                <Plus className="size-4" strokeWidth={1.9} />
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex max-h-[5.25rem] flex-wrap items-center gap-1.5 overflow-hidden text-xs text-white/90 md:mt-2.5 md:max-h-[4.75rem]">
                        <span className="rounded-full border border-white/15 bg-slate-950/20 px-2.5 py-1 shadow-sm backdrop-blur-md">
                          {course.language === 'zh-CN' ? '中文' : 'English'}
                        </span>
                        <span className="rounded-full border border-white/15 bg-slate-950/20 px-2.5 py-1 shadow-sm backdrop-blur-md">
                          {purposeLabel(course.purpose)}
                        </span>
                        {course.purpose === 'university' &&
                        (course.university || course.courseCode) ? (
                          <span className="rounded-full border border-white/15 bg-slate-950/20 px-2.5 py-1 shadow-sm backdrop-blur-md">
                            {[course.university, course.courseCode].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                        {course.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-sky-200/20 bg-sky-950/20 px-2.5 py-1 text-[11px] font-medium text-sky-50 shadow-sm backdrop-blur-md"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {isCourseOwner ? (
                    <div
                      className="hidden shrink-0 flex-wrap items-center gap-2 xl:flex xl:max-w-[28rem] xl:justify-end xl:pt-0.5"
                      data-course-actions
                    >
                      <Button
                        asChild
                        variant="outline"
                        className="h-8 min-h-0 gap-1.5 rounded-full border-white/15 bg-slate-950/20 px-3 text-xs text-white shadow-sm backdrop-blur-md hover:bg-slate-950/30 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                      >
                        <Link href={`/course/${encodeURIComponent(id)}/resources`}>
                          <HardDrive className="size-3.5" strokeWidth={1.8} />
                          资料库
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 min-h-0 rounded-full border-white/15 bg-slate-950/20 px-3 text-xs text-white shadow-sm backdrop-blur-md hover:bg-slate-950/30 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                        onClick={() => setEditCourseOpen(true)}
                      >
                        编辑课程
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 min-h-0 rounded-full border-white/15 bg-slate-950/20 px-3 text-xs leading-tight text-white shadow-sm backdrop-blur-md hover:bg-slate-950/30 dark:border-white/20 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/12"
                        disabled={coursePublishActionDisabled || storeVisibilityBusyId === 'course'}
                        onClick={() => void handleTogglePublishCourse()}
                      >
                        {coursePublishActionLabel}
                      </Button>
                      {course.listedInCourseStore ? (
                        <span className="inline-flex h-8 min-h-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-950/20 px-3 text-xs font-medium text-emerald-50 shadow-sm backdrop-blur-md dark:border-emerald-300/20 dark:bg-emerald-500/12 dark:text-emerald-100">
                          已在商城
                        </span>
                      ) : null}
                      <Button
                        asChild
                        className="h-8 min-h-0 rounded-full bg-slate-950 px-3.5 text-xs text-white shadow-[0_14px_28px_rgba(15,23,42,0.22)] hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                      >
                        <Link href={createNotebookHref(id)}>新建笔记本</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/78 px-3 py-2 text-sm text-emerald-800 shadow-sm backdrop-blur-md dark:border-emerald-300/20 dark:bg-emerald-500/12 dark:text-emerald-100 sm:flex-row sm:items-center">
                      <span>已加入课程，内容由创建者维护；你的做题记录和私有记忆会单独保存。</span>
                      <Button
                        asChild
                        variant="outline"
                        className="h-8 gap-1.5 rounded-lg border-emerald-200 bg-white/72 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-white dark:border-emerald-300/25 dark:bg-white/8 dark:text-emerald-100 dark:hover:bg-white/12"
                      >
                        <Link href={`/course/${encodeURIComponent(id)}/resources`}>
                          <HardDrive className="size-3.5" strokeWidth={1.8} />
                          资料库
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
                {course.description ? (
                  <p className="line-clamp-4 max-w-[68rem] text-[13px] leading-5 text-white/90 drop-shadow-[0_1px_2px_rgba(15,23,42,0.42)] sm:line-clamp-4 md:text-[13.5px]">
                    {course.description}
                  </p>
                ) : null}
                {isCourseOwner && courseHasPurchasedNotebook && !course.listedInCourseStore ? (
                  <p className="rounded-xl border border-amber-200/80 bg-amber-50/86 px-3 py-2 text-sm text-amber-800 shadow-sm backdrop-blur-md dark:border-amber-300/20 dark:bg-amber-500/12 dark:text-amber-100">
                    当前课程包含从商城购买的笔记本副本，因此不能发布到商城。
                  </p>
                ) : null}
              </div>
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
                    value="classmates"
                    onClick={() => setWorkspaceTab('classmates')}
                    className="h-12 flex-none gap-2 rounded-none px-0 text-base font-semibold data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600 data-[state=active]:after:opacity-100 dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-blue-300"
                  >
                    <Users className="size-4" strokeWidth={1.8} />
                    课友
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs leading-none text-blue-600 dark:bg-blue-500/10 dark:text-blue-200">
                      {classmateProfiles.length}
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
                        pagedNotebooks.map((nb, i) => (
                          <li key={nb.id} className="min-w-0">
                            <CourseGalleryCard
                              variant="notebook"
                              listIndex={normalizedNotebookPage * NOTEBOOKS_PER_PAGE + i}
                              course={nb}
                              tags={nb.tags}
                              coverAvatarUrl={resolveNotebookAgentAvatarDisplayUrl(
                                nb.id,
                                nb.avatarUrl,
                              )}
                              slide={thumbnails[nb.id]}
                              subtitle={formatDate(nb.updatedAt)}
                              creatorName={
                                isCourseOwner
                                  ? creatorDisplay
                                  : course.sourceOwnerName?.trim() || '创作者'
                              }
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
                              onEdit={isCourseOwner ? () => setEditingNotebook(nb) : undefined}
                              tertiaryActionLabel="复习"
                              onTertiaryAction={() => router.push(`/review/${nb.id}`)}
                              secondaryActionLabel={
                                !isCourseOwner || nb.sourceNotebookId
                                  ? undefined
                                  : publishTarget?.kind === 'notebook' &&
                                      publishTarget.notebook.id === nb.id &&
                                      publishState === 'publishing'
                                    ? '发布中…'
                                    : storeVisibilityBusyId === `notebook:${nb.id}`
                                      ? '下架中…'
                                      : nb.listedInNotebookStore
                                        ? '停止上架'
                                        : '发布'
                              }
                              onSecondaryAction={
                                !isCourseOwner || nb.sourceNotebookId
                                  ? undefined
                                  : () => void handleTogglePublishNotebook(nb)
                              }
                              moveToCourseTargets={isCourseOwner ? moveTargets : undefined}
                              onMoveToCourse={
                                isCourseOwner
                                  ? (targetCourseId) => handleMoveNotebook(nb.id, targetCourseId)
                                  : undefined
                              }
                              deleteDialogTitle={isCourseOwner ? '删除笔记本？' : undefined}
                              deleteDialogDescription={
                                isCourseOwner
                                  ? `将永久删除「${nb.name}」及其课件与对话记录，不可恢复。`
                                  : undefined
                              }
                              onDelete={
                                isCourseOwner
                                  ? () => handleDeleteNotebook(nb.id, nb.name)
                                  : undefined
                              }
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
                    {sortedNotebooks.length > NOTEBOOKS_PER_PAGE ? (
                      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 text-sm text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-300">
                        <p className="text-center sm:text-left">
                          {notebookPageStart}-{notebookPageEnd} / {sortedNotebooks.length} 个笔记本
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-40 dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                            disabled={normalizedNotebookPage === 0}
                            onClick={() => setNotebookPage((page) => Math.max(0, page - 1))}
                          >
                            <ChevronLeft className="size-4" strokeWidth={1.8} />
                            <span className="sr-only">上一页</span>
                          </Button>
                          <span className="min-w-16 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {normalizedNotebookPage + 1} / {notebookPageCount}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-40 dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                            disabled={normalizedNotebookPage >= notebookPageCount - 1}
                            onClick={() =>
                              setNotebookPage((page) => Math.min(notebookPageCount - 1, page + 1))
                            }
                          >
                            <ChevronRight className="size-4" strokeWidth={1.8} />
                            <span className="sr-only">下一页</span>
                          </Button>
                        </div>
                      </div>
                    ) : null}
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
                      {isCourseOwner ? (
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
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                          <BookOpen className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                          <span>共享课程</span>
                          <span className="mt-1 block text-[10px] font-normal text-slate-400">
                            内容由创建者更新
                          </span>
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="classmates" className="mt-0">
                <section
                  aria-labelledby="course-classmates-heading"
                  className="mx-auto min-w-0 max-w-[1082px]"
                >
                  <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/82 px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-white/[0.055]">
                    <div className="min-w-0">
                      <h2
                        id="course-classmates-heading"
                        className="text-lg font-semibold text-slate-950 dark:text-white"
                      >
                        同频课友
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        按最近学习章节、活跃时间和讨论状态整理，方便找到适合一起自习或提问的同学。
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-3 lg:w-[380px]">
                      <label className="relative block min-w-0">
                        <span className="sr-only">搜索课友姓名</span>
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                          strokeWidth={1.9}
                        />
                        <input
                          value={classmateQuery}
                          onChange={(event) => setClassmateQuery(event.target.value)}
                          placeholder="按名字搜索课友"
                          className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:border-sky-400/40 dark:focus:ring-sky-400/10"
                        />
                      </label>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <p className="font-bold text-slate-900 dark:text-slate-100">
                            {classmateProfiles.length}
                          </p>
                          <p className="mt-0.5 text-slate-400">课友</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <p className="font-bold text-emerald-600 dark:text-emerald-300">
                            {
                              classmateProfiles.filter((item) => item.status === '同频学习中')
                                .length
                            }
                          </p>
                          <p className="mt-0.5 text-slate-400">同频</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <p className="font-bold text-blue-600 dark:text-blue-300">
                            {
                              classmateProfiles.filter((item) => item.rhythmLabel === '节奏合拍')
                                .length
                            }
                          </p>
                          <p className="mt-0.5 text-slate-400">合拍</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {filteredClassmateProfiles.length > 0 ? (
                    <>
                      <div
                        className="grid justify-start gap-4"
                        style={{
                          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 350px))',
                        }}
                      >
                        {pagedClassmateProfiles.map((profile) => (
                          <CourseClassmateCard
                            key={profile.id}
                            profile={profile}
                            onAdd={(item) => toast.info(`已发送添加 ${item.name} 的请求`)}
                            onSchedule={(item) => toast.info(`已记录和 ${item.name} 约自习的意向`)}
                            onAsk={(item) => toast.info(`已打开向 ${item.name} 提问的入口`)}
                            onOpenSpace={(item) => toast.info(`${item.name} 的学习空间即将开放`)}
                          />
                        ))}
                      </div>
                      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-3 text-sm text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-400">
                        <span>
                          显示 {classmatePageStart}-{classmatePageEnd} /{' '}
                          {filteredClassmateProfiles.length} 位课友
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label="上一页课友"
                            disabled={normalizedClassmatePage <= 0}
                            onClick={() => setClassmatePage((page) => Math.max(0, page - 1))}
                            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-sky-200"
                          >
                            <ChevronLeft className="size-4" strokeWidth={2} />
                          </button>
                          <span className="min-w-14 text-center font-semibold text-slate-700 dark:text-slate-200">
                            {normalizedClassmatePage + 1} / {classmatePageCount}
                          </span>
                          <button
                            type="button"
                            aria-label="下一页课友"
                            disabled={normalizedClassmatePage >= classmatePageCount - 1}
                            onClick={() =>
                              setClassmatePage((page) => Math.min(classmatePageCount - 1, page + 1))
                            }
                            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-sky-200"
                          >
                            <ChevronRight className="size-4" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-5 py-10 text-center text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                      没有找到这个名字的课友
                    </div>
                  )}
                </section>
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
                  setPublishStartedAt(null);
                }
              }}
            >
              <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto rounded-2xl p-4 sm:max-h-[min(90dvh,720px)] sm:w-full sm:p-6">
                <DialogHeader>
                  <DialogTitle>
                    {publishTarget?.kind === 'course' ? '发布课程到商城' : '发布笔记本到商城'}
                  </DialogTitle>
                  <DialogDescription>
                    发布会共享课程内容、讲解稿文本与题库；语音由每位用户按自己的音色生成。
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
                      已加入学生会自动看到创建者更新后的共享内容；他们的做题记录、私有记忆和语音缓存不会被覆盖。
                    </p>
                    <p className="mt-2">
                      {publishTargetProblemCount > 0
                        ? `题库会一起发布：${publishTargetProblemCount} 道未归档题目会对已加入学生可见；不满足发布条件的编程题会保留为草稿。`
                        : '当前题库没有可发布题目。'}
                    </p>
                  </div>

                  {publishState !== 'idle' || publishProgress ? (
                    <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-sm dark:border-blue-400/20 dark:bg-blue-500/10">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950">
                          {publishState === 'publishing' ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <span className="text-sm font-semibold">✓</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {publishProgress?.message ??
                                (publishState === 'publishing' ? '正在发布' : '已发布')}
                            </p>
                            <span className="shrink-0 text-xs font-semibold text-blue-700 dark:text-blue-200">
                              {publishProgressPercent}%
                            </span>
                          </div>
                          {publishProgress?.detail ? (
                            <p className="mt-1 leading-6 text-slate-600 dark:text-slate-300">
                              {publishProgress.detail}
                            </p>
                          ) : null}
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-300"
                              style={{ width: `${publishProgressPercent}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              {publishElapsedSeconds > 0
                                ? `已用 ${publishElapsedSeconds} 秒`
                                : '刚刚开始'}
                            </span>
                            {publishProgress?.step === 'course' && publishTargetProblemCount > 0 ? (
                              <span>题库较多时这一步会久一点</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-5">
                        {PUBLISH_PROGRESS_STEPS.map((step, index) => {
                          const isCurrent = index === activePublishStepIndex;
                          const isDone =
                            publishState === 'published' ||
                            index < activePublishStepIndex ||
                            (isCurrent &&
                              publishProgress != null &&
                              publishProgress.total > 0 &&
                              publishProgress.completed >= publishProgress.total);
                          return (
                            <div
                              key={step.id}
                              className={cn(
                                'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-xs',
                                isCurrent
                                  ? 'border-blue-300 bg-white text-blue-800 shadow-sm dark:border-blue-300/40 dark:bg-white/10 dark:text-blue-100'
                                  : isDone
                                    ? 'border-emerald-200 bg-white/70 text-emerald-700 dark:border-emerald-300/20 dark:bg-white/5 dark:text-emerald-200'
                                    : 'border-slate-200 bg-white/50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                  isCurrent
                                    ? 'bg-blue-600 text-white dark:bg-blue-300 dark:text-blue-950'
                                    : isDone
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                                )}
                              >
                                {isDone ? '✓' : index + 1}
                              </span>
                              <span className="truncate">{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
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
