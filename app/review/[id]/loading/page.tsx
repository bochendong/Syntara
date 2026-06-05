'use client';

/* eslint-disable react-hooks/set-state-in-effect -- This transitional page intentionally hydrates route-preparation state from IndexedDB/API calls before redirecting. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Database,
  Loader2,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import type { StageStoreData } from '@/lib/utils/stage-storage';
import { loadStageData } from '@/lib/utils/stage-storage';
import { listReviewNotebookProblems } from '@/lib/utils/notebook-problem-api';
import {
  addReviewRouteHistoryItem,
  buildReviewRouteCandidateProblems,
  buildTemplateReviewRoute,
  deriveProblemBankLearningProfile,
  describeReviewRouteTemplateForAi,
  getReviewModeAvailability,
  parseReviewRouteMode,
  selectReviewRouteTemplate,
  type LocalReviewRouteMode,
  type ProblemBankLearningProfile,
  type ReviewRoute,
  type ReviewRouteCandidateProblem,
  type ReviewRouteMode,
  type ReviewRouteTemplate,
} from '@/features/review';
import { buildStudyCompanionNotification, loadStudyMemory } from '@/features/memory';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import {
  confirmComputeCreditsForGeneration,
  estimateReviewRouteComputeCredits,
} from '@/lib/utils/generation-credit-preflight';
import { cn } from '@/lib/utils';

type LoadingPhase =
  | 'boot'
  | 'reading'
  | 'templating'
  | 'local_generating'
  | 'ai_generating'
  | 'saving'
  | 'error';

type SceneSummary = {
  id: string;
  title: string;
  type: string;
  order: number;
  quizQuestions: string[];
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

function modeLabel(mode: ReviewRouteMode): string {
  if (mode === 'wrong') return '复习错题';
  if (mode === 'ai') return 'AI 选题';
  return '全面复习';
}

function routeSourceLabel(mode: ReviewRouteMode): string {
  if (mode === 'wrong') return '错题复习路线';
  if (mode === 'ai') return 'AI 选题路线';
  return '全面复习路线';
}

function phaseLabel(phase: LoadingPhase): string {
  switch (phase) {
    case 'reading':
      return '读取笔记本和题库';
    case 'templating':
      return '选择路线模板';
    case 'local_generating':
      return '本地模板正在填题';
    case 'ai_generating':
      return 'AI 正在按模板选题';
    case 'saving':
      return '正在打开复习地图';
    case 'error':
      return '准备遇到问题';
    default:
      return '准备进入复习副本';
  }
}

function selectedProblemCountForMode(
  mode: ReviewRouteMode,
  profile: ProblemBankLearningProfile | null,
) {
  if (!profile) return 0;
  return mode === 'wrong' ? profile.wrongProblems.length : profile.totalProblems;
}

export default function ReviewLoadingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notebookId = typeof params?.id === 'string' ? params.id : '';
  const mode = parseReviewRouteMode(searchParams.get('mode'));
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const enqueueBanner = useNotificationStore((s) => s.enqueueBanner);
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<LoadingPhase>('boot');
  const [data, setData] = useState<StageStoreData | null>(null);
  const [sceneSummary, setSceneSummary] = useState<SceneSummary[]>([]);
  const [problemProfile, setProblemProfile] = useState<ProblemBankLearningProfile | null>(null);
  const [template, setTemplate] = useState<ReviewRouteTemplate | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const currentProblemCount = problemProfile?.totalProblems ?? 0;
  const wrongProblemCount = problemProfile?.wrongProblems.length ?? 0;
  const missingConcepts = useMemo(() => problemProfile?.missingConcepts ?? [], [problemProfile]);
  const thinConcepts = useMemo(() => problemProfile?.thinConcepts ?? [], [problemProfile]);
  const weakPointCount = useMemo(() => {
    if (!data?.stage) return 0;
    return loadStudyMemory(userId, data.stage.id).weakPoints.filter(
      (item) => item.status === 'open',
    ).length;
  }, [data, userId]);
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

  const saveRouteAndOpenMap = useCallback(
    async (args: {
      stageData: StageStoreData;
      route: ReviewRoute;
      source: ReviewRouteMode;
      teacherLine?: string;
    }) => {
      setPhase('saving');
      const memory = loadStudyMemory(userId, args.stageData.stage.id);
      const saved = addReviewRouteHistoryItem({
        userId,
        notebookId: args.stageData.stage.id,
        notebookName: args.stageData.stage.name,
        route: args.route,
        weakPointCount: memory.weakPoints.filter((item) => item.status === 'open').length,
        source: args.source,
      });
      enqueueBanner(
        buildStudyCompanionNotification({
          id: `review-route:${args.stageData.stage.id}:${Date.now()}`,
          sourceKind: 'route_unlock',
          title: '复习路线图准备好了',
          body: args.teacherLine || args.route.teacherLine,
          sourceLabel: routeSourceLabel(args.source),
          details: [
            { key: 'notebook', label: '笔记本', value: args.stageData.stage.name },
            {
              key: 'points',
              label: '知识点',
              value: String(args.route.knowledgePoints.length),
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

  const generateAiRoute = useCallback(
    async (args: {
      stageData: StageStoreData;
      scenes: SceneSummary[];
      profile: ProblemBankLearningProfile | null;
      candidateProblems: ReviewRouteCandidateProblem[];
      template: ReviewRouteTemplate;
    }) => {
      setPhase('ai_generating');
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
        actionLabel: 'AI 选题并生成复习路线图',
      });

      const response = await runQueuedAiTask(
        {
          kind: 'review-route',
          title: '复习路线生成',
          description: `正在为《${args.stageData.stage.name}》生成 AI 选题路线`,
        },
        ({ signal }) =>
          backendJson<{ route: ReviewRoute }>('/api/review-route/generate', {
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
              candidateProblems: args.candidateProblems,
              selectedProblemIds: args.candidateProblems.map((problem) => problem.id),
              routeTemplate: describeReviewRouteTemplateForAi(args.template),
            }),
            signal,
          }),
      );

      toast.success('AI 已经按模板选好题，我这就打开地图。');
      await saveRouteAndOpenMap({
        stageData: args.stageData,
        route: response.route,
        source: 'ai',
        teacherLine: response.route.teacherLine,
      });
    },
    [saveRouteAndOpenMap, userId],
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

    const problems = await listReviewNotebookProblems({
      notebookId: stageData.stage.id,
      courseId: stageData.stage.courseId,
    });
    const profile = deriveProblemBankLearningProfile({
      problems,
      expectedConcepts: concepts,
    });
    const candidateProblems = buildReviewRouteCandidateProblems({
      problems,
      profile,
      expectedConcepts: concepts,
      limit: 48,
    });
    setProblemProfile(profile);

    const availability = getReviewModeAvailability({ mode, profile });
    if (!availability.available) throw new Error(availability.reason);

    const selectedTemplate = selectReviewRouteTemplate({
      mode,
      availableProblemCount: selectedProblemCountForMode(mode, profile),
      seed: `${stageData.stage.id}:${Date.now()}`,
    });
    setTemplate(selectedTemplate);
    setPhase('templating');

    if (mode === 'ai') {
      await generateAiRoute({
        stageData,
        scenes,
        profile,
        candidateProblems,
        template: selectedTemplate,
      });
      return;
    }

    const localMode = mode as LocalReviewRouteMode;
    setPhase('local_generating');
    const route = buildTemplateReviewRoute({
      mode: localMode,
      notebookName: stageData.stage.name,
      candidateProblems,
      profile,
      expectedConcepts: concepts,
      seed: `${stageData.stage.id}:${Date.now()}`,
      template: selectedTemplate,
    });
    toast.success(`${modeLabel(localMode)}路线已经按模板准备好。`);
    await saveRouteAndOpenMap({
      stageData,
      route,
      source: localMode,
      teacherLine: route.teacherLine,
    });
  }, [generateAiRoute, mode, notebookId, saveRouteAndOpenMap]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runReviewPreparation().catch((error) => {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : '复习准备失败');
    });
  }, [runReviewPreparation]);

  const steps = [
    { key: 'reading', label: '读取题库', icon: Database },
    { key: 'templating', label: '选择模板', icon: MapIcon },
    {
      key: mode === 'ai' ? 'ai_generating' : 'local_generating',
      label: mode === 'ai' ? 'AI选题' : '本地填题',
      icon: Sparkles,
    },
    { key: 'saving', label: '打开地图', icon: BookOpen },
  ] as const;
  const phaseOrder: LoadingPhase[] = [
    'boot',
    'reading',
    'templating',
    mode === 'ai' ? 'ai_generating' : 'local_generating',
    'saving',
  ];

  return (
    <main className="flex min-h-full overflow-hidden bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-950 dark:text-white md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center gap-6">
        <Link
          href={`/review/${encodeURIComponent(notebookId)}`}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowLeft className="size-4" />
          返回复习首页
        </Link>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/7 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
                <Sparkles className="size-3.5" />
                {modeLabel(mode)} · {phaseLabel(phase)}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
                正在准备复习地图
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                我会先读取题库，再套用内置路线模板。错题复习和全面复习不会调用 AI，也不会自动补题。
              </p>
            </div>
            <div className="flex size-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-950 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-white">
              {phase === 'error' ? (
                <ArrowLeft className="size-8" />
              ) : (
                <Loader2 className="size-8 animate-spin" />
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              const active = phase === step.key;
              const done =
                phase !== 'error' &&
                phaseOrder.indexOf(phase) > phaseOrder.indexOf(step.key as LoadingPhase);
              return (
                <div
                  key={step.label}
                  className={cn(
                    'rounded-lg border p-4 shadow-sm transition-colors',
                    active
                      ? 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/35 dark:text-sky-50'
                      : done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-950/25 dark:text-emerald-50'
                        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-400',
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

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">当前模式</p>
              <p className="mt-2 text-lg font-black">{modeLabel(mode)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">题库题目</p>
              <p className="mt-1 text-3xl font-black">{currentProblemCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">错题</p>
              <p className="mt-1 text-3xl font-black">{wrongProblemCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/35">
              <p className="text-xs font-semibold text-slate-400">AI算力</p>
              <p className="mt-2 text-sm font-bold leading-6">
                {mode === 'ai' ? `约 ${estimatedReviewCredits} 积分` : '无需 AI'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/35">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400">路线模板</p>
                <h2 className="mt-1 text-lg font-black">{template?.name ?? '正在选择模板'}</h2>
              </div>
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                {missingConcepts.length} 个缺失专题 · {thinConcepts.length} 个偏薄专题
              </div>
            </div>
          </div>

          {phase === 'error' ? (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-950 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-50">
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
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white dark:bg-white dark:text-slate-950"
                >
                  重新准备
                </button>
                <Link
                  href={`/classroom/${encodeURIComponent(notebookId)}?view=quiz`}
                  className="rounded-md border border-rose-200 bg-white/70 px-4 py-2 text-sm font-black text-rose-700 dark:border-rose-400/20 dark:bg-white/8 dark:text-rose-100"
                >
                  去题库添加题目
                </Link>
                <Link
                  href={`/review/${encodeURIComponent(notebookId)}`}
                  className="rounded-md border border-slate-200 bg-white/70 px-4 py-2 text-sm font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-100"
                >
                  返回复习首页
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
