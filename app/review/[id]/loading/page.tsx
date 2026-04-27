'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Database,
  Loader2,
  Map as MapIcon,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { StageStoreData } from '@/lib/utils/stage-storage';
import { loadStageData } from '@/lib/utils/stage-storage';
import { listNotebookProblems } from '@/lib/utils/notebook-problem-api';
import {
  commitNotebookProblemImport,
  previewNotebookProblemImport,
} from '@/lib/utils/notebook-problem-api';
import {
  deriveProblemBankLearningProfile,
  type ProblemBankLearningProfile,
  type ProblemBankReadiness,
} from '@/lib/learning/problem-bank-profile';
import type { ReviewRoute } from '@/lib/learning/review-route-types';
import { addReviewRouteHistoryItem } from '@/lib/learning/review-route-history';
import { buildStudyCompanionNotification, loadStudyMemory } from '@/lib/learning/study-memory';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  confirmComputeCreditsForGeneration,
  estimateReviewRouteComputeCredits,
} from '@/lib/utils/generation-credit-preflight';
import { cn } from '@/lib/utils';

type LoadingPhase =
  | 'boot'
  | 'reading'
  | 'assessing'
  | 'generating'
  | 'blocked'
  | 'supplementing'
  | 'error';

type SceneSummary = {
  id: string;
  title: string;
  type: string;
  order: number;
  quizQuestions: string[];
};

type AiProblemBankReadiness = ProblemBankReadiness & {
  teacherLine?: string;
};

function summarizeScenes(data: StageStoreData): SceneSummary[] {
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

function getExpectedConcepts(sceneSummary: SceneSummary[]): string[] {
  return Array.from(
    new Set(
      sceneSummary
        .map((scene) => scene.title)
        .filter((title) => title && !/^第\s*\d+\s*页$/.test(title)),
    ),
  ).slice(0, 24);
}

function getModelHeaders(): Record<string, string> {
  const modelConfig = getCurrentModelConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-model': modelConfig.modelString,
    'x-api-key': modelConfig.apiKey,
  };
  if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
  if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
  if (modelConfig.requiresApiKey) headers['x-requires-api-key'] = 'true';
  return headers;
}

function toProblemBankPayload(profile: ProblemBankLearningProfile | null) {
  if (!profile) return null;
  return {
    totalProblems: profile.totalProblems,
    attemptedProblems: profile.attemptedProblems,
    masteredConcepts: profile.masteredConcepts,
    weakConcepts: profile.weakConcepts,
    untriedConcepts: profile.untriedConcepts,
    thinConcepts: profile.thinConcepts,
    missingConcepts: profile.missingConcepts,
    wrongProblems: profile.wrongProblems.map((problem) => ({
      title: problem.title,
      tags: problem.tags,
      difficulty: problem.difficulty,
      status: problem.status,
    })),
  };
}

function phaseLabel(phase: LoadingPhase): string {
  switch (phase) {
    case 'reading':
      return '读取笔记本和题库';
    case 'assessing':
      return 'AI 正在检查题库是否够打';
    case 'generating':
      return 'AI 正在绘制复习地图';
    case 'blocked':
      return '题库需要先补一下';
    case 'supplementing':
      return 'AI 正在补全缺失题目';
    case 'error':
      return '加载遇到问题';
    default:
      return '准备进入复习副本';
  }
}

export default function ReviewLoadingPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = typeof params?.id === 'string' ? params.id : '';
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const enqueueBanner = useNotificationStore((s) => s.enqueueBanner);
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<LoadingPhase>('boot');
  const [data, setData] = useState<StageStoreData | null>(null);
  const [sceneSummary, setSceneSummary] = useState<SceneSummary[]>([]);
  const [expectedConcepts, setExpectedConcepts] = useState<string[]>([]);
  const [problemProfile, setProblemProfile] = useState<ProblemBankLearningProfile | null>(null);
  const [assessment, setAssessment] = useState<AiProblemBankReadiness | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [supplementedCount, setSupplementedCount] = useState(0);

  const currentProblemCount = assessment?.currentProblemCount ?? problemProfile?.totalProblems ?? 0;
  const missingConcepts = assessment?.missingConcepts ?? problemProfile?.missingConcepts ?? [];
  const thinConcepts = assessment?.thinConcepts ?? problemProfile?.thinConcepts ?? [];
  const reasons = assessment?.reasons ?? [];
  const weakPointCount = useMemo(() => {
    if (!data?.stage) return 0;
    return loadStudyMemory(userId, data.stage.id).weakPoints.filter(
      (item) => item.status === 'open',
    ).length;
  }, [data?.stage, userId]);
  const quizCount = useMemo(
    () => sceneSummary.reduce((sum, scene) => sum + scene.quizQuestions.length, 0),
    [sceneSummary],
  );
  const estimatedReviewCredits = useMemo(
    () =>
      estimateReviewRouteComputeCredits({
        sceneCount: sceneSummary.length,
        quizCount,
        weakPointCount,
      }),
    [quizCount, sceneSummary.length, weakPointCount],
  );

  const generateRoute = useCallback(
    async (args: {
      stageData: StageStoreData;
      scenes: SceneSummary[];
      profile: ProblemBankLearningProfile | null;
    }) => {
      setPhase('generating');
      const memory = loadStudyMemory(userId, args.stageData.stage.id);
      const routeWeakPointCount = memory.weakPoints.filter((item) => item.status === 'open').length;
      const routeQuizCount = args.scenes.reduce(
        (sum, scene) => sum + scene.quizQuestions.length,
        0,
      );
      await confirmComputeCreditsForGeneration({
        requiredCredits: estimateReviewRouteComputeCredits({
          sceneCount: args.scenes.length,
          quizCount: routeQuizCount,
          weakPointCount: routeWeakPointCount,
        }),
        actionLabel: '生成复习路线图',
      });

      const response = await backendJson<{ route: ReviewRoute }>('/api/review-route/generate', {
        method: 'POST',
        headers: getModelHeaders(),
        body: JSON.stringify({
          notebookId: args.stageData.stage.id,
          notebookName: args.stageData.stage.name,
          notebookDescription: args.stageData.stage.description,
          weakPoints: memory.weakPoints
            .filter((item) => item.status === 'open')
            .slice(0, 8)
            .map((item) => `${item.title}: ${item.reason}`),
          problemBank: toProblemBankPayload(args.profile),
          scenes: args.scenes,
        }),
      });

      const saved = addReviewRouteHistoryItem({
        userId,
        notebookId: args.stageData.stage.id,
        notebookName: args.stageData.stage.name,
        route: response.route,
        weakPointCount: memory.weakPoints.filter((item) => item.status === 'open').length,
      });
      enqueueBanner(
        buildStudyCompanionNotification({
          id: `review-route:${args.stageData.stage.id}:${Date.now()}`,
          sourceKind: 'route_unlock',
          title: '复习路线图生成好了',
          body: response.route.teacherLine,
          sourceLabel: 'AI 复习路线',
          details: [
            { key: 'notebook', label: '笔记本', value: args.stageData.stage.name },
            {
              key: 'points',
              label: '知识点',
              value: String(response.route.knowledgePoints.length),
            },
          ],
        }),
      );
      router.replace(
        `/review/${encodeURIComponent(args.stageData.stage.id)}/map?routeId=${encodeURIComponent(saved.id)}`,
      );
    },
    [enqueueBanner, router, userId],
  );

  const runReviewPreparation = useCallback(async () => {
    if (!notebookId) return;
    setPhase('reading');
    setErrorMessage('');

    const loadedStageData = await loadStageData(notebookId);
    if (!loadedStageData?.stage) throw new Error('没有找到这个笔记本');
    const stageData = loadedStageData;
    setData(stageData);

    const scenes = summarizeScenes(stageData);
    const concepts = getExpectedConcepts(scenes);
    setSceneSummary(scenes);
    setExpectedConcepts(concepts);

    const problems = await listNotebookProblems(stageData.stage.id);
    const profile = deriveProblemBankLearningProfile({
      problems,
      expectedConcepts: concepts,
    });
    setProblemProfile(profile);

    setPhase('assessing');
    const assessmentResponse = await backendJson<{ assessment: AiProblemBankReadiness }>(
      '/api/review-route/assess-problem-bank',
      {
        method: 'POST',
        headers: getModelHeaders(),
        body: JSON.stringify({
          notebookId: stageData.stage.id,
          notebookName: stageData.stage.name,
          notebookDescription: stageData.stage.description,
          problemBank: toProblemBankPayload(profile),
          scenes,
        }),
      },
    );
    setAssessment(assessmentResponse.assessment);

    if (!assessmentResponse.assessment.ready) {
      setPhase('blocked');
      return;
    }

    toast.success(assessmentResponse.assessment.teacherLine || '题库够啦，我这就帮你画复习地图。');
    await generateRoute({ stageData, scenes, profile });
  }, [generateRoute, notebookId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runReviewPreparation().catch((error) => {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : '复习准备失败');
    });
  }, [runReviewPreparation]);

  const handleAiSupplementAndGenerate = useCallback(async () => {
    if (!data?.stage || phase === 'supplementing') return;
    setPhase('supplementing');
    setErrorMessage('');
    try {
      const targetConcepts = Array.from(
        new Set([...missingConcepts, ...thinConcepts, ...expectedConcepts.slice(0, 10)]),
      )
        .filter(Boolean)
        .slice(0, 16);
      const needed = Math.max(
        6,
        (assessment?.requiredProblemCount ?? 8) - currentProblemCount,
        targetConcepts.length * 2,
      );
      const preview = await previewNotebookProblemImport({
        notebookId: data.stage.id,
        source: 'manual',
        language: 'zh-CN',
        text: [
          `请为笔记本《${data.stage.name}》自动补全复习题库，生成 ${needed} 道可直接入库的题。`,
          `必须覆盖所有缺失或偏薄专题：${targetConcepts.join('、') || data.stage.name}`,
          '每个缺失专题至少 2 道题，题型混合选择题、计算题、简答题或证明题；难度覆盖 easy、medium、hard；每道题 tags 必须写对应知识点。',
          '这些题会用于杀戮尖塔式复习地图的做题关卡，不要生成看课任务、阅读任务或视频任务。',
          data.stage.description ? `笔记本简介：${data.stage.description}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      if (preview.drafts.length === 0) {
        throw new Error('AI 没有生成可写入题库的题目');
      }
      const committed = await commitNotebookProblemImport({
        notebookId: data.stage.id,
        drafts: preview.drafts,
      });
      setSupplementedCount(preview.drafts.length);

      const problems = await listNotebookProblems(data.stage.id);
      const nextProfile = deriveProblemBankLearningProfile({
        problems: problems.length > 0 ? problems : committed,
        expectedConcepts,
      });
      setProblemProfile(nextProfile);
      toast.success(`已补充 ${preview.drafts.length} 道题，我继续帮你画地图。`);
      await generateRoute({ stageData: data, scenes: sceneSummary, profile: nextProfile });
    } catch (error) {
      setPhase('blocked');
      const message = error instanceof Error ? error.message : 'AI 补题失败';
      setErrorMessage(message);
      toast.error(message);
    }
  }, [
    assessment?.requiredProblemCount,
    currentProblemCount,
    data,
    expectedConcepts,
    generateRoute,
    missingConcepts,
    phase,
    sceneSummary,
    thinConcepts,
  ]);

  const steps = [
    { key: 'reading', label: '读取题库', icon: Database },
    { key: 'assessing', label: 'AI 体检', icon: Sparkles },
    { key: 'supplementing', label: '补全题目', icon: Wand2 },
    { key: 'generating', label: '绘制地图', icon: MapIcon },
  ] as const;

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(251,207,232,0.42),transparent_34%),radial-gradient(circle_at_80%_12%,rgba(125,211,252,0.24),transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-6 text-slate-950 dark:bg-[radial-gradient(circle_at_20%_0%,rgba(190,24,93,0.24),transparent_34%),radial-gradient(circle_at_80%_12%,rgba(14,165,233,0.18),transparent_32%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center gap-6">
        <Link
          href={`/review/${encodeURIComponent(notebookId)}`}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowLeft className="size-4" />
          返回复习首页
        </Link>

        <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/78 p-6 shadow-xl dark:border-white/10 dark:bg-white/8 md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full border border-rose-200/70 opacity-70 motion-safe:animate-pulse dark:border-rose-300/20" />
          <div className="pointer-events-none absolute -bottom-20 left-10 size-56 rounded-full border border-sky-200/70 opacity-70 motion-safe:animate-pulse dark:border-sky-300/20" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">
                <Sparkles className="size-3.5" />
                {phaseLabel(phase)}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
                正在准备复习地图
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                我会先检查题库够不够，再决定是直接生成关卡，还是先补齐缺失专题。别急，我在帮你把路铺稳一点。
              </p>
            </div>
            <div className="relative flex size-32 shrink-0 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-rose-100 dark:border-rose-400/10" />
              <div className="absolute inset-3 rounded-full border-4 border-dashed border-rose-300 motion-safe:animate-spin dark:border-rose-300/50" />
              <div className="flex size-20 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950">
                {phase === 'blocked' ? (
                  <BookOpen className="size-8" />
                ) : phase === 'error' ? (
                  <ArrowLeft className="size-8" />
                ) : (
                  <Loader2 className="size-8 animate-spin" />
                )}
              </div>
            </div>
          </div>

          <div className="relative mt-8 grid gap-3 md:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              const active = phase === step.key;
              const done =
                (step.key === 'reading' &&
                  ['assessing', 'supplementing', 'generating', 'blocked'].includes(phase)) ||
                (step.key === 'assessing' &&
                  ['supplementing', 'generating', 'blocked'].includes(phase)) ||
                (step.key === 'supplementing' && supplementedCount > 0);
              return (
                <div
                  key={step.key}
                  className={cn(
                    'rounded-2xl border p-4 shadow-sm transition-colors',
                    active
                      ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/30 dark:bg-rose-950/35 dark:text-rose-50'
                      : done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-950/25 dark:text-emerald-50'
                        : 'border-slate-200 bg-white/65 text-slate-500 dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-400',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-black">
                    {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">当前题库</p>
              <p className="mt-1 text-3xl font-black">{currentProblemCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">缺失专题</p>
              <p className="mt-1 text-3xl font-black">{missingConcepts.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">预估算力</p>
              <p className="mt-2 text-sm font-bold leading-6">约 {estimatedReviewCredits} 积分</p>
            </div>
          </div>

          {phase === 'blocked' ? (
            <div className="relative mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-50">
              <h2 className="text-lg font-black">题库数量不足，先补题再开图</h2>
              <p className="mt-2 text-sm leading-6 opacity-80">
                {assessment?.teacherLine ||
                  '这本笔记的复习地图全部靠做题推进，所以题库还差一点时，我会先拦下来。'}
              </p>
              {reasons.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm font-semibold">
                  {reasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/classroom/${encodeURIComponent(notebookId)}?view=quiz`}
                  className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-black text-amber-900 shadow-sm transition-transform hover:-translate-y-0.5 dark:border-amber-400/25 dark:bg-slate-950 dark:text-amber-100"
                >
                  去题库添加题目
                </Link>
                <button
                  type="button"
                  onClick={handleAiSupplementAndGenerate}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                >
                  <Wand2 className="size-4" />让 AI 补题并生成地图
                </button>
              </div>
              {errorMessage ? (
                <p className="mt-3 text-xs font-bold text-rose-600">{errorMessage}</p>
              ) : null}
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="relative mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-50">
              <h2 className="text-lg font-black">复习准备失败</h2>
              <p className="mt-2 text-sm leading-6 opacity-80">{errorMessage}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    startedRef.current = false;
                    void runReviewPreparation().catch((error) => {
                      setPhase('error');
                      setErrorMessage(error instanceof Error ? error.message : '复习准备失败');
                    });
                  }}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white dark:bg-white dark:text-slate-950"
                >
                  重新准备
                </button>
                <Link
                  href={`/review/${encodeURIComponent(notebookId)}`}
                  className="rounded-full border border-rose-200 bg-white/70 px-4 py-2 text-sm font-black text-rose-700 dark:border-rose-400/20 dark:bg-white/8 dark:text-rose-100"
                >
                  回复习首页
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
