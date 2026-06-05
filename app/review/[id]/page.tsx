'use client';

/* eslint-disable react-hooks/set-state-in-effect -- This page hydrates browser-only notebook, history, and problem-bank state from IndexedDB/localStorage/API calls. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  Map as MapIcon,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { loadStageData, type StageStoreData } from '@/lib/utils/stage-storage';
import { useAuthStore } from '@/lib/store/auth';
import { loadStudyMemory } from '@/features/memory';
import {
  deleteReviewRouteHistoryItem,
  deleteReviewRouteProgress,
  getReviewModeAvailability,
  listReviewRouteHistory,
  MIN_TEMPLATE_REVIEW_PROBLEMS,
  type ReviewRouteMode,
  type ReviewRouteHistoryItem,
} from '@/features/review';
import { estimateReviewRouteComputeCredits } from '@/lib/utils/generation-credit-preflight';
import {
  deriveProblemBankLearningProfile,
  type ProblemBankLearningProfile,
} from '@/features/review';
import { listReviewNotebookProblems } from '@/lib/utils/notebook-problem-api';
import { cn } from '@/lib/utils';

function summarizeScenes(data: StageStoreData) {
  return data.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((scene) => ({
      id: scene.id,
      title: scene.title || `第 ${scene.order + 1} 页`,
      type: scene.type,
      order: scene.order,
      quizQuestions:
        scene.content.type === 'quiz'
          ? scene.content.questions.map((question) => question.question).filter(Boolean)
          : [],
    }));
}

function formatHistoryTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function isUsefulReviewConcept(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (['mat136', 'mat102', '题库', 'review'].includes(lower)) return false;
  if (/^p\d+$/i.test(text)) return false;
  if (/^week\b/i.test(text)) return false;
  return /[\u4e00-\u9fff]/.test(text) || /[∫∑∞≈≤≥]/.test(text);
}

type ProblemProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

type HealthCopy = {
  label: string;
  title: string;
  body: string;
  className: string;
  icon: typeof CheckCircle2;
  iconClassName?: string;
};

type ReviewModeOption = {
  id: ReviewRouteMode;
  title: string;
  description: string;
  detail: string;
  badge: string;
  icon: typeof CheckCircle2;
};

const REVIEW_MODE_OPTIONS: ReviewModeOption[] = [
  {
    id: 'wrong',
    title: '复习错题',
    description: '只从已经做错、半对或判错的题里抽题。',
    detail: '至少 5 道错题才开放，尽量分散到不同专题。',
    badge: '本地模板',
    icon: AlertTriangle,
  },
  {
    id: 'comprehensive',
    title: '全面复习',
    description: '从题库里按专题铺开，尽量覆盖更多知识点。',
    detail: '随机抽样但后段更难，不调用 AI。',
    badge: '本地模板',
    icon: Database,
  },
  {
    id: 'ai',
    title: 'AI 选题',
    description: '让 AI 结合题库、错题和薄弱点挑本轮路线。',
    detail: '仍然套用内置模板，只把选题判断交给 AI。',
    badge: 'AI',
    icon: Sparkles,
  },
];

export default function ReviewNotebookPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = typeof params?.id === 'string' ? params.id : '';
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const [data, setData] = useState<StageStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<ReviewRouteHistoryItem[]>([]);
  const [problemProfile, setProblemProfile] = useState<ProblemBankLearningProfile | null>(null);
  const [problemProfileStatus, setProblemProfileStatus] = useState<ProblemProfileStatus>('idle');
  const [problemProfileError, setProblemProfileError] = useState('');
  const [selectedMode, setSelectedMode] = useState<ReviewRouteMode>('comprehensive');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadStageData(notebookId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : '读取笔记本失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const memory = useMemo(
    () => (data?.stage ? loadStudyMemory(userId, data.stage.id) : null),
    [data, userId],
  );
  const sceneSummary = useMemo(() => (data ? summarizeScenes(data) : []), [data]);
  const expectedConcepts = useMemo(
    () =>
      Array.from(
        new Set(
          sceneSummary
            .map((scene) => scene.title)
            .filter((title) => title && !/^第\s*\d+\s*页$/.test(title)),
        ),
      ).slice(0, 24),
    [sceneSummary],
  );
  const quizCount = useMemo(
    () => sceneSummary.reduce((sum, scene) => sum + scene.quizQuestions.length, 0),
    [sceneSummary],
  );
  const openWeakPointCount =
    memory?.weakPoints.filter((item) => item.status === 'open').length ?? 0;
  const estimatedReviewCredits = useMemo(
    () =>
      estimateReviewRouteComputeCredits({
        sceneCount: sceneSummary.length,
        quizCount,
        weakPointCount: openWeakPointCount,
      }),
    [openWeakPointCount, quizCount, sceneSummary.length],
  );
  const modeAvailabilities = useMemo(
    () =>
      Object.fromEntries(
        REVIEW_MODE_OPTIONS.map((option) => [
          option.id,
          getReviewModeAvailability({ mode: option.id, profile: problemProfile }),
        ]),
      ) as Record<ReviewRouteMode, ReturnType<typeof getReviewModeAvailability>>,
    [problemProfile],
  );
  const selectedModeAvailability = modeAvailabilities[selectedMode];

  useEffect(() => {
    if (!data?.stage) return;
    setHistory(listReviewRouteHistory(userId, data.stage.id));
  }, [data?.stage, userId]);

  useEffect(() => {
    if (!data?.stage) return;
    let cancelled = false;
    setProblemProfileStatus('loading');
    setProblemProfileError('');
    void listReviewNotebookProblems({
      notebookId: data.stage.id,
      courseId: data.stage.courseId,
    })
      .then((problems) => {
        if (cancelled) return;
        setProblemProfile(
          deriveProblemBankLearningProfile({
            problems,
            expectedConcepts,
          }),
        );
        setProblemProfileStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setProblemProfile(null);
        setProblemProfileStatus('error');
        setProblemProfileError(error instanceof Error ? error.message : '题库读取失败');
      });
    return () => {
      cancelled = true;
    };
  }, [data?.stage, expectedConcepts]);

  useEffect(() => {
    if (problemProfileStatus !== 'ready') return;
    if (selectedModeAvailability.available) return;
    if (modeAvailabilities.comprehensive.available) {
      setSelectedMode('comprehensive');
      return;
    }
    if (modeAvailabilities.ai.available) setSelectedMode('ai');
  }, [
    modeAvailabilities.ai.available,
    modeAvailabilities.comprehensive.available,
    problemProfileStatus,
    selectedModeAvailability.available,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!data?.stage || generating || problemProfileStatus !== 'ready') return;
    if (!selectedModeAvailability.available) return;
    setGenerating(true);
    router.push(
      `/review/${encodeURIComponent(data.stage.id)}/loading?mode=${encodeURIComponent(selectedMode)}`,
    );
  }, [
    data,
    generating,
    problemProfileStatus,
    router,
    selectedMode,
    selectedModeAvailability.available,
  ]);

  const handleDeleteHistoryItem = useCallback(
    (item: ReviewRouteHistoryItem) => {
      if (!data?.stage) return;
      const confirmed = window.confirm(
        `删除这次复习「${item.route.title}」吗？地图进度也会一起删除。`,
      );
      if (!confirmed) return;

      const nextHistory = deleteReviewRouteHistoryItem({
        userId,
        notebookId: data.stage.id,
        routeId: item.id,
      });
      deleteReviewRouteProgress({
        userId,
        notebookId: data.stage.id,
        routeId: item.id,
      });
      setHistory(nextHistory);
      toast.success('这次复习记录已经删除');
    },
    [data, userId],
  );

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-950 text-white">
        <Loader2 className="mr-2 size-5 animate-spin" />
        正在读取笔记本…
      </div>
    );
  }

  if (!data?.stage) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <p>没有找到这个笔记本。</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950"
        >
          返回
        </button>
      </div>
    );
  }

  const problemCountLabel =
    problemProfileStatus === 'loading'
      ? '读取中'
      : problemProfileStatus === 'error'
        ? '读取失败'
        : String(problemProfile?.totalProblems ?? 0);
  const wrongProblemCount = problemProfile?.wrongProblems.length ?? 0;
  const focusConcepts = Array.from(
    new Set([
      ...(problemProfile?.missingConcepts ?? []),
      ...(problemProfile?.thinConcepts ?? []),
      ...(problemProfile?.weakConcepts ?? []),
      ...(problemProfile?.untriedConcepts ?? []),
      ...expectedConcepts.slice(0, 3),
    ]),
  )
    .filter(isUsefulReviewConcept)
    .slice(0, 8);
  const estimatedReviewCostLabel =
    selectedMode === 'ai' ? `约 ${estimatedReviewCredits}` : '无需 AI';
  const totalProblemCount = problemProfile?.totalProblems ?? 0;
  const isProblemBankInsufficient =
    problemProfileStatus === 'ready' && totalProblemCount < MIN_TEMPLATE_REVIEW_PROBLEMS;
  const readinessReasons =
    problemProfileStatus === 'error'
      ? [problemProfileError || '题库读取失败']
      : isProblemBankInsufficient
        ? [`题库至少需要 ${MIN_TEMPLATE_REVIEW_PROBLEMS} 道题，目前只有 ${totalProblemCount} 道`]
        : selectedModeAvailability.available
          ? []
          : [selectedModeAvailability.reason];
  const isProblemBankReady = problemProfileStatus === 'ready' && selectedModeAvailability.available;
  const canStartReview =
    !generating &&
    sceneSummary.length > 0 &&
    problemProfileStatus === 'ready' &&
    selectedModeAvailability.available;
  const startButtonLabel =
    problemProfileStatus === 'loading'
      ? '读取题库中'
      : problemProfileStatus === 'error'
        ? '题库读取失败'
        : selectedModeAvailability.available
          ? selectedMode === 'wrong'
            ? '开始错题复习'
            : selectedMode === 'ai'
              ? '开始 AI 选题'
              : '开始全面复习'
          : isProblemBankInsufficient
            ? '题库不足，无法复习'
            : selectedModeAvailability.reason;
  const healthCopy: HealthCopy =
    problemProfileStatus === 'loading'
      ? {
          label: '读取中',
          title: '正在读取题库状态',
          body: '我在确认这本笔记当前能用哪些题，读完后再决定能不能直接生成地图。',
          className:
            'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100',
          icon: Loader2,
          iconClassName: 'animate-spin',
        }
      : problemProfileStatus === 'error'
        ? {
            label: '读取失败',
            title: '题库暂时没有读出来',
            body: '现在不能把它当作 0 题处理。请先确认登录状态或题库接口，再开始复习。',
            className:
              'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100',
            icon: AlertTriangle,
          }
        : isProblemBankReady
          ? {
              label: '已就绪',
              title:
                selectedMode === 'wrong'
                  ? '错题数量足够开一轮'
                  : selectedMode === 'ai'
                    ? 'AI 选题可以开始'
                    : '当前题库足够全面复习',
              body:
                selectedMode === 'ai'
                  ? 'AI 会结合题库、错题和薄弱点选题，但路线形状仍然套用内置模板。'
                  : '这轮会直接从真实题库填充内置模板，不调用 AI，也不会自动补题。',
              className:
                'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100',
              icon: CheckCircle2,
            }
          : {
              label: '不可用',
              title: isProblemBankInsufficient
                ? '题库题量还不够'
                : selectedMode === 'wrong'
                  ? '错题还不够 5 道'
                  : '题库题量还不够开图',
              body: isProblemBankInsufficient
                ? '题库不足时不会进入复习，也不会让 AI 临时补题；先去题库添加题目后再回来。'
                : selectedMode === 'wrong'
                  ? '错题复习会等到至少 5 道错题再开放，避免一轮路线太短、专题太单一。'
                  : '现在不会再自动 AI 补题；需要先去题库添加题目，或切换到可用模式。',
              className:
                'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100',
              icon: AlertTriangle,
            };
  const HealthIcon = healthCopy.icon;

  return (
    <main className="min-h-full overflow-hidden bg-[#f6f8fb] px-4 py-4 text-slate-950 dark:bg-slate-950 dark:text-white md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="grid gap-4 lg:grid-cols-[1.08fr_1fr_0.92fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/course/${data.stage.courseId || ''}`}
                onClick={(event) => {
                  if (!data.stage.courseId) {
                    event.preventDefault();
                    router.back();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
              >
                <ArrowLeft className="size-3.5" />
                返回
              </Link>
              <span className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
                <MapIcon className="size-3.5" />
                {data.stage.name}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">模式</p>
                <h2 className="mt-2 text-2xl font-black">{healthCopy.title}</h2>
              </div>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-black',
                  healthCopy.className,
                )}
              >
                <HealthIcon className={cn('size-3.5', healthCopy.iconClassName)} />
                {healthCopy.label}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {healthCopy.body}
            </p>
            {readinessReasons.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
                {readinessReasons.map((reason) => (
                  <div key={reason} className="flex gap-2">
                    <span className="mt-2 size-1.5 rounded-full bg-sky-500" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-5 space-y-2">
              {REVIEW_MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const availability = modeAvailabilities[option.id];
                const selected = selectedMode === option.id;
                const canSelect =
                  problemProfileStatus === 'ready' && availability.available && !generating;
                const active = selected && availability.available;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (canSelect) setSelectedMode(option.id);
                    }}
                    disabled={!canSelect}
                    className={cn(
                      'w-full rounded-md border p-3 text-left shadow-sm transition-colors',
                      active
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/20',
                      !canSelect &&
                        'cursor-not-allowed border-dashed opacity-65 hover:border-slate-200',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-2">
                        <Icon
                          className={cn(
                            'mt-0.5 size-4 shrink-0',
                            active ? 'text-current' : 'text-sky-600 dark:text-sky-300',
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black">{option.title}</span>
                            <span
                              className={cn(
                                'rounded-md px-1.5 py-0.5 text-[10px] font-black',
                                active
                                  ? 'bg-white/15 text-current dark:bg-slate-950/10'
                                  : option.id === 'ai'
                                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100',
                              )}
                            >
                              {option.badge}
                            </span>
                          </div>
                          <p
                            className={cn(
                              'mt-1 text-xs leading-5',
                              active
                                ? 'text-white/75 dark:text-slate-700'
                                : 'text-slate-500 dark:text-slate-400',
                            )}
                          >
                            {option.description}
                          </p>
                          <p
                            className={cn(
                              'mt-1 text-[11px] font-semibold leading-5',
                              availability.available
                                ? active
                                  ? 'text-white/75 dark:text-slate-700'
                                  : 'text-slate-400 dark:text-slate-500'
                                : active
                                  ? 'text-amber-100 dark:text-amber-700'
                                  : 'text-amber-700 dark:text-amber-200',
                            )}
                          >
                            {availability.available ? option.detail : availability.reason}
                          </p>
                        </div>
                      </div>
                      {availability.available ? (
                        <CheckCircle2
                          className={cn(
                            'mt-0.5 size-4 shrink-0',
                            active ? 'text-current' : 'text-emerald-600 dark:text-emerald-300',
                          )}
                        />
                      ) : (
                        <AlertTriangle
                          className={cn(
                            'mt-0.5 size-4 shrink-0',
                            active ? 'text-current' : 'text-amber-600 dark:text-amber-200',
                          )}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canStartReview}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-black shadow-sm transition-transform',
                  !canStartReview
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-slate-950 text-white hover:-translate-y-0.5 dark:bg-white dark:text-slate-950',
                )}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {startButtonLabel}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-white/7 dark:text-slate-300">
              <MapIcon className="size-3.5" />
              生成后会在地图页打开
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Database className="size-5 text-sky-600" />
                复习准备
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {estimatedReviewCostLabel}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {[
                ['页面', String(sceneSummary.length), BookOpen],
                ['题库题目', problemCountLabel, Database],
                ['待复习错题', String(wrongProblemCount), AlertTriangle],
                ['AI算力', estimatedReviewCostLabel, Sparkles],
              ].map(([label, value, Icon]) => (
                <div key={label as string} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-300">
                    <Icon className="size-4" />
                    {label as string}
                  </div>
                  <div className="text-lg font-black text-slate-950 dark:text-white">
                    {value as string}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">薄弱/未尝试</p>
                <p className="text-xs font-semibold text-slate-400">
                  {focusConcepts.length || 0} 个线索
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {focusConcepts.length > 0 ? (
                  focusConcepts.map((concept) => (
                    <span
                      key={concept}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/7 dark:text-slate-200"
                    >
                      {concept}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    读完题库后会显示当前最值得复习的概念。
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <Clock className="size-5 text-sky-600" />
                  历史复习
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  可以继续以前生成的路线。
                </p>
              </div>
              <span className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                {history.length} 次
              </span>
            </div>
            {history.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-400">
                暂无历史复习记录。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {history.slice(0, 4).map((item) => (
                  <div key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-400">
                          {formatHistoryTime(item.createdAt)}
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-sm font-black">{item.route.title}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {item.stats.knowledgePointCount} 知识点 · {item.stats.nodeCount} 关
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistoryItem(item)}
                        className="rounded-md border border-rose-200 bg-white p-1.5 text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-400/20 dark:bg-white/8 dark:text-rose-100"
                        aria-label="删除历史复习"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isProblemBankInsufficient || problemProfileStatus !== 'ready') return;
                        router.push(
                          `/review/${encodeURIComponent(data.stage.id)}/map?routeId=${encodeURIComponent(item.id)}`,
                        );
                      }}
                      disabled={isProblemBankInsufficient || problemProfileStatus !== 'ready'}
                      className={cn(
                        'mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-black shadow-sm transition-transform',
                        isProblemBankInsufficient || problemProfileStatus !== 'ready'
                          ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-slate-950 text-white hover:-translate-y-0.5 dark:bg-white dark:text-slate-950',
                      )}
                    >
                      <MapIcon className="size-3.5" />
                      打开地图
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm dark:border-white/10 dark:bg-white/7 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-black">生成后会在地图页打开</h2>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              初始页只保留出发前状态，真正的做题地图和关卡会进入独立页面。
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            <Sparkles className="size-3.5" />
            准备好后点击开始复习
          </div>
        </section>
      </div>
    </main>
  );
}
