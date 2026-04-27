'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  Castle,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Loader2,
  Lock,
  Map as MapIcon,
  Play,
  Sparkles,
  Swords,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { loadStageData, type StageStoreData } from '@/lib/utils/stage-storage';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { buildStudyCompanionNotification, loadStudyMemory } from '@/lib/learning/study-memory';
import type { ReviewRoute, ReviewRouteNode } from '@/lib/learning/review-route-types';
import {
  addReviewRouteHistoryItem,
  deleteReviewRouteHistoryItem,
  listReviewRouteHistory,
  type ReviewRouteHistoryItem,
} from '@/lib/learning/review-route-history';
import {
  deleteReviewRouteProgress,
  loadReviewRouteProgress,
  markReviewRouteNodeCompleted,
} from '@/lib/learning/review-route-progress';
import {
  confirmComputeCreditsForGeneration,
  estimateReviewRouteComputeCredits,
} from '@/lib/utils/generation-credit-preflight';
import { listNotebookProblems } from '@/lib/utils/notebook-problem-api';
import {
  assessProblemBankReadiness,
  deriveProblemBankLearningProfile,
  type ProblemBankReadiness,
  type ProblemBankLearningProfile,
} from '@/lib/learning/problem-bank-profile';
import {
  commitNotebookProblemImport,
  previewNotebookProblemImport,
} from '@/lib/utils/notebook-problem-api';
import { cn } from '@/lib/utils';

function nodeTheme(kind: ReviewRouteNode['kind']) {
  switch (kind) {
    case 'boss':
      return {
        icon: Castle,
        label: 'Boss',
        className:
          'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/25 dark:bg-rose-950/35 dark:text-rose-100',
      };
    case 'elite':
      return {
        icon: Swords,
        label: '精英',
        className:
          'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-400/25 dark:bg-fuchsia-950/35 dark:text-fuchsia-100',
      };
    case 'camp':
      return {
        icon: Flame,
        label: '营火题',
        className:
          'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-950/35 dark:text-amber-100',
      };
    case 'treasure':
      return {
        icon: Gift,
        label: '宝箱题',
        className:
          'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-950/35 dark:text-emerald-100',
      };
    case 'event':
      return {
        icon: Sparkles,
        label: '事件题',
        className:
          'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-400/25 dark:bg-sky-950/35 dark:text-sky-100',
      };
    default:
      return {
        icon: Brain,
        label: '普通题',
        className:
          'border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100',
      };
  }
}

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

const MAP_WIDTH = 1040;
const MAP_NODE_WIDTH = 184;
const MAP_NODE_HEIGHT = 116;
const MAP_TOP_PADDING = 96;
const MAP_BOTTOM_PADDING = 104;
const MAP_LAYER_GAP = 158;

type MapNodePosition = {
  layerIndex: number;
  nodeIndex: number;
  node: ReviewRouteNode;
  x: number;
  y: number;
};

type ReviewChallenge = {
  node: ReviewRouteNode;
  layerTitle: string;
  layerIndex: number;
};

type RouteNodeStatus = 'completed' | 'available' | 'locked';

type ChallengeResult = {
  ok: boolean;
  title: string;
  feedback: string;
};

type AiProblemBankReadiness = ProblemBankReadiness & {
  teacherLine?: string;
};

function distributeNodeX(count: number, index: number): number {
  if (count <= 1) return MAP_WIDTH / 2;
  const left = 210;
  const right = MAP_WIDTH - 210;
  return left + ((right - left) * index) / (count - 1);
}

function buildMapNodePositions(route: ReviewRoute): {
  height: number;
  positions: MapNodePosition[];
} {
  const height =
    MAP_TOP_PADDING +
    MAP_BOTTOM_PADDING +
    MAP_NODE_HEIGHT +
    (route.layers.length - 1) * MAP_LAYER_GAP;
  const positions = route.layers.flatMap((layer, layerIndex) =>
    layer.nodes.map((node, nodeIndex) => ({
      layerIndex,
      nodeIndex,
      node,
      x: distributeNodeX(layer.nodes.length, nodeIndex),
      y: height - MAP_BOTTOM_PADDING - MAP_NODE_HEIGHT / 2 - layerIndex * MAP_LAYER_GAP,
    })),
  );
  return { height, positions };
}

function getConnectorTargetIndexes(
  currentIndex: number,
  currentCount: number,
  nextCount: number,
): number[] {
  if (nextCount <= 0) return [];
  if (currentCount <= 1) {
    return nextCount <= 3
      ? Array.from({ length: nextCount }, (_, index) => index)
      : [1, 2].filter((index) => index < nextCount);
  }
  const center = (currentIndex * (nextCount - 1)) / Math.max(1, currentCount - 1);
  const candidates = [Math.floor(center), Math.ceil(center)];
  if (nextCount > currentCount)
    candidates.push(currentIndex % 2 === 0 ? Math.ceil(center) + 1 : Math.floor(center) - 1);
  if (nextCount < currentCount) candidates.push(Math.round(center));
  return Array.from(new Set(candidates))
    .filter((index) => index >= 0 && index < nextCount)
    .slice(0, 2);
}

function getRouteId(activeHistoryId: string | null, notebookId: string): string {
  return activeHistoryId || `${notebookId}:draft-route`;
}

function getNodeStatus(args: {
  route: ReviewRoute;
  position: MapNodePosition;
  completedNodeIds: Set<string>;
}): RouteNodeStatus {
  if (args.completedNodeIds.has(args.position.node.id)) return 'completed';
  if (args.position.layerIndex === 0) return 'available';

  const previousLayer = args.route.layers[args.position.layerIndex - 1];
  const previousNodes = previousLayer?.nodes ?? [];
  for (let previousIndex = 0; previousIndex < previousNodes.length; previousIndex += 1) {
    const previous = previousNodes[previousIndex];
    if (!args.completedNodeIds.has(previous.id)) continue;
    const targets = getConnectorTargetIndexes(
      previousIndex,
      previousNodes.length,
      args.route.layers[args.position.layerIndex]?.nodes.length ?? 0,
    );
    if (targets.includes(args.position.nodeIndex)) return 'available';
  }
  return 'locked';
}

function buildChallengeQuestion(node: ReviewRouteNode): string {
  const points = node.knowledgePoints.join('、');
  return `围绕「${points}」完成一题：${node.questionStyle}。请写出你的答案和关键理由，重点证明你已经达成这个检测目标：${node.checkGoal}`;
}

export default function ReviewNotebookPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = typeof params?.id === 'string' ? params.id : '';
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const enqueueBanner = useNotificationStore((s) => s.enqueueBanner);
  const [data, setData] = useState<StageStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [route, setRoute] = useState<ReviewRoute | null>(null);
  const [routeMapVisible, setRouteMapVisible] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewRouteHistoryItem[]>([]);
  const [problemProfile, setProblemProfile] = useState<ProblemBankLearningProfile | null>(null);
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<ReviewChallenge | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [showProblemBankGate, setShowProblemBankGate] = useState(false);
  const [aiProblemBankReadiness, setAiProblemBankReadiness] =
    useState<AiProblemBankReadiness | null>(null);
  const [generatingProblems, setGeneratingProblems] = useState(false);

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
    [data?.stage, userId],
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
  const problemBankReadiness = useMemo(
    () =>
      assessProblemBankReadiness({
        profile: problemProfile,
        expectedConcepts,
      }),
    [expectedConcepts, problemProfile],
  );
  const displayedProblemBankReadiness = aiProblemBankReadiness ?? problemBankReadiness;

  useEffect(() => {
    if (!data?.stage) return;
    const nextHistory = listReviewRouteHistory(userId, data.stage.id);
    setHistory(nextHistory);
    if (!route && nextHistory[0]) {
      setRoute(nextHistory[0].route);
      setActiveHistoryId(nextHistory[0].id);
    }
  }, [data?.stage, route, userId]);

  useEffect(() => {
    if (!data?.stage || !route) {
      setCompletedNodeIds([]);
      setActiveChallenge(null);
      setChallengeResult(null);
      return;
    }
    const progress = loadReviewRouteProgress({
      userId,
      notebookId: data.stage.id,
      routeId: getRouteId(activeHistoryId, data.stage.id),
    });
    setCompletedNodeIds(progress.completedNodeIds);
    setActiveChallenge(null);
    setChallengeAnswer('');
    setChallengeResult(null);
  }, [activeHistoryId, data?.stage, route, userId]);

  useEffect(() => {
    if (!data?.stage) return;
    let cancelled = false;
    void listNotebookProblems(data.stage.id)
      .then((problems) => {
        if (cancelled) return;
        setProblemProfile(
          deriveProblemBankLearningProfile({
            problems,
            expectedConcepts,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setProblemProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.stage, expectedConcepts]);

  const handleGenerate = useCallback(async () => {
    if (!data?.stage || generating) return;
    setGenerating(true);
    router.push(`/review/${encodeURIComponent(data.stage.id)}/loading`);
  }, [data?.stage, generating, router]);

  const refreshProblemProfile = useCallback(async () => {
    if (!data?.stage) return null;
    const problems = await listNotebookProblems(data.stage.id);
    const nextProfile = deriveProblemBankLearningProfile({
      problems,
      expectedConcepts,
    });
    setProblemProfile(nextProfile);
    return nextProfile;
  }, [data?.stage, expectedConcepts]);

  const handleGenerateMissingProblems = useCallback(async () => {
    if (!data?.stage || generatingProblems) return;
    setGeneratingProblems(true);
    try {
      const targetConcepts = Array.from(
        new Set([
          ...displayedProblemBankReadiness.missingConcepts,
          ...displayedProblemBankReadiness.thinConcepts,
          ...expectedConcepts.slice(0, 8),
        ]),
      ).slice(0, 10);
      const needed = Math.max(
        6,
        displayedProblemBankReadiness.requiredProblemCount -
          displayedProblemBankReadiness.currentProblemCount,
      );
      const preview = await previewNotebookProblemImport({
        notebookId: data.stage.id,
        source: 'manual',
        language: 'zh-CN',
        text: [
          `请为笔记本《${data.stage.name}》补充 ${needed} 道复习题，并让它们可以直接进入题库。`,
          `需要覆盖的专题：${targetConcepts.join('、') || data.stage.name}`,
          '要求：题型混合选择题、计算题、简答题或证明题；难度覆盖 easy、medium、hard；每道题 tags 必须写对应知识点；题目用于复习路线图做题关卡，不要生成看课任务。',
          data.stage.description ? `笔记本简介：${data.stage.description}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      if (preview.drafts.length === 0) {
        throw new Error('AI 没有生成可写入题库的题目');
      }
      await commitNotebookProblemImport({
        notebookId: data.stage.id,
        drafts: preview.drafts,
      });
      await refreshProblemProfile();
      setShowProblemBankGate(false);
      toast.success(`已生成 ${preview.drafts.length} 道题并写入题库，现在可以开始复习了。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 补题失败');
    } finally {
      setGeneratingProblems(false);
    }
  }, [
    data?.stage,
    expectedConcepts,
    generatingProblems,
    displayedProblemBankReadiness.currentProblemCount,
    displayedProblemBankReadiness.missingConcepts,
    displayedProblemBankReadiness.requiredProblemCount,
    displayedProblemBankReadiness.thinConcepts,
    refreshProblemProfile,
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
      if (activeHistoryId === item.id) {
        const nextActive = nextHistory[0] ?? null;
        setActiveHistoryId(nextActive?.id ?? null);
        setRoute(nextActive?.route ?? null);
        setCompletedNodeIds([]);
        setActiveChallenge(null);
        setChallengeAnswer('');
        setChallengeResult(null);
        setRouteMapVisible(false);
      }
      toast.success('这次复习记录已经删除');
    },
    [activeHistoryId, data?.stage, userId],
  );

  const completedNodeSet = useMemo(() => new Set(completedNodeIds), [completedNodeIds]);
  const totalRouteNodeCount = useMemo(
    () => route?.layers.reduce((sum, layer) => sum + layer.nodes.length, 0) ?? 0,
    [route],
  );
  const completedRouteNodeCount = route
    ? route.layers.reduce(
        (sum, layer) => sum + layer.nodes.filter((node) => completedNodeSet.has(node.id)).length,
        0,
      )
    : 0;

  const handleCompleteChallenge = useCallback(() => {
    if (!data?.stage || !route || !activeChallenge || !challengeResult?.ok) return;
    const progress = markReviewRouteNodeCompleted({
      userId,
      notebookId: data.stage.id,
      routeId: getRouteId(activeHistoryId, data.stage.id),
      nodeId: activeChallenge.node.id,
    });
    setCompletedNodeIds(progress.completedNodeIds);
    setActiveChallenge(null);
    setChallengeAnswer('');
    setChallengeResult(null);
    toast.success('本关完成，地图已更新');
  }, [activeChallenge, activeHistoryId, challengeResult?.ok, data?.stage, route, userId]);

  const handleSubmitChallenge = useCallback(() => {
    if (!activeChallenge) return;
    const answer = challengeAnswer.trim();
    const ok = answer.length >= 12;
    setChallengeResult({
      ok,
      title: ok ? '结果 OK' : '还没过关',
      feedback: ok
        ? '这次回答有足够的解题痕迹，可以判定本关通过。回到地图后，我会帮你解锁下一段路线。'
        : '这次答案太短啦，还看不出你的解题过程。补上关键步骤、理由或计算，再提交一次。',
    });
  }, [activeChallenge, challengeAnswer]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <Loader2 className="mr-2 size-5 animate-spin" />
        正在读取笔记本…
      </div>
    );
  }

  if (!data?.stage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <p>没有找到这个笔记本。</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
        >
          返回
        </button>
      </div>
    );
  }

  if (route && activeChallenge) {
    const theme = nodeTheme(activeChallenge.node.kind);
    const Icon = theme.icon;
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(251,207,232,0.36),transparent_34%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-6 text-slate-950 dark:bg-[radial-gradient(circle_at_18%_0%,rgba(190,24,93,0.22),transparent_34%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <button
            type="button"
            onClick={() => {
              setActiveChallenge(null);
              setChallengeAnswer('');
              setChallengeResult(null);
            }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="size-4" />
            回到地图
          </button>

          <section className={cn('rounded-[2rem] border p-6 shadow-xl md:p-8', theme.className)}>
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-inner dark:bg-black/20">
                  <Icon className="size-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-black dark:bg-white/10">
                      第 {activeChallenge.layerIndex + 1} 层 · {theme.label}
                    </span>
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold dark:bg-white/10">
                      {activeChallenge.node.difficulty}
                    </span>
                  </div>
                  <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
                    {activeChallenge.node.title}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 opacity-75">
                    {activeChallenge.layerTitle}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white/60 px-4 py-3 text-sm font-bold shadow-sm dark:bg-black/15">
                {completedRouteNodeCount}/{totalRouteNodeCount} 已完成
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white/60 p-4 dark:bg-black/15">
                <p className="text-xs font-black opacity-55">检测目标</p>
                <p className="mt-2 text-sm leading-6">{activeChallenge.node.checkGoal}</p>
              </div>
              <div className="rounded-2xl bg-white/60 p-4 dark:bg-black/15">
                <p className="text-xs font-black opacity-55">题型</p>
                <p className="mt-2 text-sm leading-6">{activeChallenge.node.questionStyle}</p>
              </div>
              <div className="rounded-2xl bg-white/60 p-4 dark:bg-black/15">
                <p className="text-xs font-black opacity-55">知识点</p>
                <p className="mt-2 text-sm leading-6">
                  {activeChallenge.node.knowledgePoints.join('、')}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-white/70 p-5 shadow-sm dark:bg-slate-950/45">
              <p className="text-sm font-black">本关题目</p>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-800 dark:border-white/10 dark:bg-slate-950/65 dark:text-slate-100">
                {buildChallengeQuestion(activeChallenge.node)}
              </div>
              <textarea
                value={challengeAnswer}
                onChange={(event) => {
                  setChallengeAnswer(event.target.value);
                  setChallengeResult(null);
                }}
                placeholder="把你的解题过程、选择理由或最终答案写在这里。"
                className="mt-4 min-h-40 w-full resize-y rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm outline-none transition-colors focus:border-rose-300 dark:border-white/10 dark:bg-slate-950/80"
              />
              {challengeResult ? (
                <div
                  className={cn(
                    'mt-4 rounded-2xl border p-4 text-sm leading-6',
                    challengeResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-100'
                      : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-100',
                  )}
                >
                  <div className="flex items-center gap-2 font-black">
                    {challengeResult.ok ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {challengeResult.title}
                  </div>
                  <p className="mt-1">{challengeResult.feedback}</p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveChallenge(null);
                    setChallengeAnswer('');
                    setChallengeResult(null);
                  }}
                  className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
                >
                  稍后再做
                </button>
                {challengeResult?.ok ? (
                  <button
                    type="button"
                    onClick={handleCompleteChallenge}
                    className="rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                  >
                    结果 OK，回到地图
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitChallenge}
                    className="rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                  >
                    提交查看结果
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(251,207,232,0.38),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(125,211,252,0.28),transparent_34%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-6 text-slate-950 dark:bg-[radial-gradient(circle_at_12%_0%,rgba(190,24,93,0.22),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href={`/course/${data.stage.courseId || ''}`}
              onClick={(event) => {
                if (!data.stage.courseId) {
                  event.preventDefault();
                  router.back();
                }
              }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="size-4" />
              返回笔记本列表
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-400/20 dark:bg-white/8 dark:text-rose-100">
              <MapIcon className="size-3.5" />
              AI 复习副本
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              {`${data.stage.name} · 复习`}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              点开始复习后，我会根据这本笔记的题库、错题和掌握状态生成复习地图。地图会在单独页面打开。
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || sceneSummary.length === 0}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-lg transition-transform',
              generating || sceneSummary.length === 0
                ? 'cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                : 'bg-slate-950 text-white hover:-translate-y-0.5 dark:bg-white dark:text-slate-950',
            )}
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            开始复习
          </button>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/8">
            <p className="text-xs font-semibold text-slate-400">页面</p>
            <p className="mt-1 text-3xl font-black">{sceneSummary.length}</p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/8">
            <p className="text-xs font-semibold text-slate-400">题库题目</p>
            <p className="mt-1 text-3xl font-black">{problemProfile?.totalProblems ?? quizCount}</p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/8">
            <p className="text-xs font-semibold text-slate-400">待复习错题</p>
            <p className="mt-1 text-3xl font-black">{openWeakPointCount}</p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-white/8">
            <p className="text-xs font-semibold text-slate-400">预估算力</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              约 {estimatedReviewCredits} 算力积分，不足时会先提醒你确认。
            </p>
          </div>
        </section>

        {showProblemBankGate && (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-5 shadow-sm dark:border-amber-400/20 dark:bg-amber-950/25">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-black text-amber-800 dark:bg-black/15 dark:text-amber-100">
                  <Lock className="size-3.5" />
                  题库不足，暂不生成路线
                </div>
                <h2 className="mt-3 text-xl font-black">先把题库补厚一点，再开始复习地图</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
                  复习路线全部都是做题关卡。如果题库题量不够，或者某个专题缺题，地图会看起来很漂亮但实际没法打。
                </p>
                <ul className="mt-3 space-y-1 text-sm font-semibold text-amber-950 dark:text-amber-50">
                  {displayedProblemBankReadiness.reasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                <Link
                  href={`/classroom/${data.stage.id}?view=quiz`}
                  className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-black text-amber-900 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-amber-400/25 dark:bg-slate-950 dark:text-amber-100"
                >
                  去题库添加题目
                </Link>
                <button
                  type="button"
                  onClick={handleGenerateMissingProblems}
                  disabled={generatingProblems}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-black shadow-sm transition-transform',
                    generatingProblems
                      ? 'cursor-wait bg-amber-200 text-amber-700 dark:bg-amber-900/50 dark:text-amber-100'
                      : 'bg-slate-950 text-white hover:-translate-y-0.5 dark:bg-white dark:text-slate-950',
                  )}
                >
                  {generatingProblems ? <Loader2 className="size-4 animate-spin" /> : null}让 AI
                  生成题目
                </button>
              </div>
            </div>
          </section>
        )}

        {problemProfile ? (
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/70 bg-white/65 p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
              <p className="text-xs font-semibold text-slate-400">已掌握概念</p>
              <p className="mt-1 text-3xl font-black">{problemProfile.masteredConcepts.length}</p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {problemProfile.masteredConcepts.slice(0, 3).join('、') || '还需要再做几题确认'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/65 p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
              <p className="text-xs font-semibold text-slate-400">错题概念</p>
              <p className="mt-1 text-3xl font-black">{problemProfile.weakConcepts.length}</p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {problemProfile.weakConcepts.slice(0, 3).join('、') || '最近没有明显卡点'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/65 p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
              <p className="text-xs font-semibold text-slate-400">未尝试概念</p>
              <p className="mt-1 text-3xl font-black">{problemProfile.untriedConcepts.length}</p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {problemProfile.untriedConcepts.slice(0, 3).join('、') || '都至少碰过一次啦'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/65 p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
              <p className="text-xs font-semibold text-slate-400">覆盖线索</p>
              <p className="mt-1 text-3xl font-black">
                {problemProfile.thinConcepts.length + problemProfile.missingConcepts.length}
              </p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {[...problemProfile.missingConcepts, ...problemProfile.thinConcepts]
                  .slice(0, 3)
                  .join('、') || '点击开始后由 AI 体检确认'}
              </p>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-white/70 bg-white/65 p-5 shadow-sm dark:border-white/10 dark:bg-white/7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Clock className="size-5 text-rose-500" />
                历史复习
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                每次 AI 生成的复习路线都会保存在这里，可以随时打开之前的版本。
              </p>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
              {history.length} 次
            </span>
          </div>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/45 px-4 py-6 text-sm text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-400">
              还没有历史复习记录。点击“开始复习”生成第一张路线图后，我会帮你存下来。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {history.map((item) => (
                <article
                  key={item.id}
                  className={cn(
                    'rounded-2xl border p-4 text-left shadow-sm transition-all',
                    activeHistoryId === item.id
                      ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/30 dark:bg-rose-950/30 dark:text-rose-100'
                      : 'border-slate-200 bg-white/75 text-slate-800 dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-100',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold dark:bg-white/10">
                      {formatHistoryTime(item.createdAt)}
                    </span>
                    <span className="text-[11px] font-semibold opacity-60">AI</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-sm font-black">{item.route.title}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-70">
                    {item.route.teacherLine}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-white/65 px-2 py-1 dark:bg-black/15">
                      {item.stats.knowledgePointCount} 知识点
                    </span>
                    <span className="rounded-full bg-white/65 px-2 py-1 dark:bg-black/15">
                      {item.stats.nodeCount} 关
                    </span>
                    <span className="rounded-full bg-white/65 px-2 py-1 dark:bg-black/15">
                      {item.stats.weakPointCount} 错题线索
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRoute(item.route);
                        setActiveHistoryId(item.id);
                        setShowProblemBankGate(false);
                        router.push(
                          `/review/${encodeURIComponent(data.stage.id)}/map?routeId=${encodeURIComponent(item.id)}`,
                        );
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white shadow-sm transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                    >
                      <MapIcon className="size-3.5" />
                      打开地图
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryItem(item)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-black text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-400/20 dark:bg-white/8 dark:text-rose-100 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="size-3.5" />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {!routeMapVisible || !route ? (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white/60 p-10 text-center shadow-sm dark:border-white/15 dark:bg-white/6">
            <Sparkles className="mx-auto mb-4 size-10 text-rose-500" />
            <h2 className="text-xl font-bold">{route ? '复习路线已准备好' : '还没有生成复习图'}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              地图不会直接摊在复习首页。点击“开始复习”进入地图，或者从历史复习里打开某一次路线。
            </p>
          </section>
        ) : (
          <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,241,242,0.54)),radial-gradient(circle_at_50%_12%,rgba(251,113,133,0.18),transparent_28%)] p-5 shadow-sm dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(76,5,25,0.22)),radial-gradient(circle_at_50%_12%,rgba(251,113,133,0.16),transparent_28%)]">
            <div className="mb-5 flex flex-wrap gap-2">
              {route.knowledgePoints.map((point) => (
                <span
                  key={point}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100"
                >
                  {point}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto rounded-[1.5rem] border border-rose-100/80 bg-white/50 p-4 dark:border-white/10 dark:bg-black/10">
              {(() => {
                const { height, positions } = buildMapNodePositions(route);
                const byLayer = new Map<number, MapNodePosition[]>();
                for (const position of positions) {
                  const list = byLayer.get(position.layerIndex) ?? [];
                  list.push(position);
                  byLayer.set(position.layerIndex, list);
                }
                const startY = height - 38;
                const crownY = 42;
                return (
                  <div
                    className="relative min-w-[1040px]"
                    style={{ width: MAP_WIDTH, height }}
                    aria-label="复习路线图"
                  >
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${MAP_WIDTH} ${height}`}
                      role="presentation"
                    >
                      <defs>
                        <linearGradient id="review-path-gradient" x1="0" x2="0" y1="1" y2="0">
                          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.18" />
                          <stop offset="55%" stopColor="#f472b6" stopOpacity="0.48" />
                          <stop offset="100%" stopColor="#facc15" stopOpacity="0.66" />
                        </linearGradient>
                      </defs>
                      {(byLayer.get(0) ?? []).map((target) => {
                        const startX = MAP_WIDTH / 2;
                        const endY = target.y + MAP_NODE_HEIGHT / 2;
                        const midY = (startY + endY) / 2;
                        return (
                          <path
                            key={`start-${target.node.id}`}
                            d={`M ${startX} ${startY} C ${startX} ${midY}, ${target.x} ${midY}, ${target.x} ${endY}`}
                            fill="none"
                            stroke="url(#review-path-gradient)"
                            strokeDasharray="8 10"
                            strokeLinecap="round"
                            strokeWidth="4"
                          />
                        );
                      })}
                      {route.layers.slice(0, -1).flatMap((_layer, layerIndex) => {
                        const currentPositions = byLayer.get(layerIndex) ?? [];
                        const nextPositions = byLayer.get(layerIndex + 1) ?? [];
                        return currentPositions.flatMap((from) =>
                          getConnectorTargetIndexes(
                            from.nodeIndex,
                            currentPositions.length,
                            nextPositions.length,
                          ).map((targetIndex) => {
                            const to = nextPositions[targetIndex];
                            const startPathY = from.y - MAP_NODE_HEIGHT / 2;
                            const endPathY = to.y + MAP_NODE_HEIGHT / 2;
                            const midY = (startPathY + endPathY) / 2;
                            return (
                              <path
                                key={`${from.node.id}-${to.node.id}`}
                                d={`M ${from.x} ${startPathY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${endPathY}`}
                                fill="none"
                                stroke="url(#review-path-gradient)"
                                strokeLinecap="round"
                                strokeWidth="4"
                              />
                            );
                          }),
                        );
                      })}
                      {(byLayer.get(route.layers.length - 1) ?? []).map((from) => {
                        const startPathY = from.y - MAP_NODE_HEIGHT / 2;
                        const midY = (startPathY + crownY) / 2;
                        return (
                          <path
                            key={`crown-${from.node.id}`}
                            d={`M ${from.x} ${startPathY} C ${from.x} ${midY}, ${MAP_WIDTH / 2} ${midY}, ${MAP_WIDTH / 2} ${crownY}`}
                            fill="none"
                            stroke="url(#review-path-gradient)"
                            strokeLinecap="round"
                            strokeWidth="4"
                          />
                        );
                      })}
                    </svg>
                    <div
                      className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-900 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                      style={{ top: crownY - 18 }}
                    >
                      <Castle className="size-4" />
                      最终 Boss
                    </div>
                    <div
                      className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
                      style={{ top: startY - 18 }}
                    >
                      <Play className="size-4" />
                      起点
                    </div>
                    {route.layers.map((layer, layerIndex) => (
                      <div
                        key={`label-${layer.id}`}
                        className="absolute left-4 max-w-[170px] rounded-2xl border border-white/70 bg-white/70 p-3 text-xs shadow-sm dark:border-white/10 dark:bg-slate-950/60"
                        style={{
                          top:
                            height -
                            MAP_BOTTOM_PADDING -
                            MAP_NODE_HEIGHT / 2 -
                            layerIndex * MAP_LAYER_GAP -
                            36,
                        }}
                      >
                        <p className="font-black text-slate-900 dark:text-white">
                          第 {layerIndex + 1} 层 · {layer.title}
                        </p>
                        <p className="mt-1 line-clamp-2 leading-5 text-slate-500 dark:text-slate-400">
                          {layer.summary}
                        </p>
                      </div>
                    ))}
                    {positions.map((position) => {
                      const theme = nodeTheme(position.node.kind);
                      const Icon = theme.icon;
                      const status = getNodeStatus({
                        route,
                        position,
                        completedNodeIds: completedNodeSet,
                      });
                      const locked = status === 'locked';
                      return (
                        <button
                          key={position.node.id}
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            if (locked) return;
                            setActiveChallenge({
                              node: position.node,
                              layerTitle: route.layers[position.layerIndex]?.title ?? '复习关卡',
                              layerIndex: position.layerIndex,
                            });
                            setChallengeAnswer('');
                          }}
                          className={cn(
                            'absolute rounded-2xl border p-3 text-left shadow-lg ring-4 ring-white/45 transition-transform dark:ring-slate-950/45',
                            theme.className,
                            status === 'available' && 'hover:z-20 hover:-translate-y-1',
                            status === 'completed' &&
                              'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-50',
                            locked &&
                              'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70 grayscale dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-500',
                          )}
                          style={{
                            width: MAP_NODE_WIDTH,
                            minHeight: MAP_NODE_HEIGHT,
                            left: position.x - MAP_NODE_WIDTH / 2,
                            top: position.y - MAP_NODE_HEIGHT / 2,
                          }}
                        >
                          <div className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-white/80 bg-white text-slate-700 shadow-sm dark:border-slate-950/60 dark:bg-slate-950 dark:text-slate-200">
                            {status === 'completed' ? (
                              <CheckCircle2 className="size-4 text-emerald-500" />
                            ) : locked ? (
                              <Lock className="size-4" />
                            ) : (
                              <Play className="size-4 text-rose-500" />
                            )}
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/75 shadow-inner dark:bg-black/20">
                              <Icon className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-black dark:bg-white/10">
                                  {status === 'completed'
                                    ? '已完成'
                                    : locked
                                      ? '待解锁'
                                      : theme.label}
                                </span>
                                <span className="text-[10px] font-bold opacity-60">
                                  {position.node.difficulty}
                                </span>
                              </div>
                              <h4 className="mt-2 line-clamp-2 text-sm font-black leading-5">
                                {position.node.title}
                              </h4>
                              <p className="mt-2 line-clamp-2 text-[11px] leading-4 opacity-75">
                                {position.node.questionStyle}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {route.layers.slice(-3).map((layer) => (
                <div
                  key={`detail-${layer.id}`}
                  className="rounded-2xl border border-white/70 bg-white/65 p-4 text-sm shadow-sm dark:border-white/10 dark:bg-white/7"
                >
                  <h3 className="font-black">{layer.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {layer.summary}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
