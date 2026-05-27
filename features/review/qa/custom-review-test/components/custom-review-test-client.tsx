'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  FileJson,
  Loader2,
  Map as MapIcon,
  Play,
  RefreshCw,
  Route,
  Sparkles,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import type { ReviewRoute } from '@/lib/learning/review-route-types';
import { backendJson } from '@/lib/utils/backend-api';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

import {
  AiProblemBankReadiness,
  buildProblemBank,
  buildScenes,
  CandidateProblemPayload,
  candidateProblemsForScenario,
  candidateReason,
  checksToStepState,
  compactJson,
  evaluateAssessment,
  evaluateProblemBank,
  evaluateProfile,
  evaluateReviewPlan,
  formatSavedAt,
  GateCheckList,
  GeneratePayload,
  getModelHeaders,
  hasBlockingFailure,
  MIN_REVIEW_PROBLEM_COUNT,
  nodeKindClassName,
  nodeKindLabel,
  PipelineCheck,
  PipelineStepState,
  PRESETS,
  privateMemoryForScenario,
  ProfileLearningDigest,
  RESULT_KEY,
  REVIEW_SCENARIOS,
  ReviewContextStory,
  ReviewFormState,
  reviewHistoryForScenario,
  ReviewMode,
  ReviewScenarioId,
  ReviewStepId,
  routeMetrics,
  RunPhase,
  SavedCustomReviewPayload,
  ScenarioCoverageBar,
  selectCandidateProblems,
  splitLines,
  StepButton,
  StepShell,
  TEST_ID,
  uniqueItems,
} from '../lib/page-core';

export default function CustomReviewTestPage() {
  const [scenarioId, setScenarioId] = useState<ReviewScenarioId>('known-memory');
  const [mode, setMode] = useState<ReviewMode>('exam-sprint');
  const [notebookName, setNotebookName] = useState('定制化复习测试 Notebook');
  const [goal, setGoal] = useState(PRESETS['exam-sprint'].goal);
  const [weakPoints, setWeakPoints] = useState(PRESETS['exam-sprint'].weakPoints);
  const [masteredConcepts, setMasteredConcepts] = useState(PRESETS['exam-sprint'].masteredConcepts);
  const [weakConcepts, setWeakConcepts] = useState(PRESETS['exam-sprint'].weakConcepts);
  const [untriedConcepts, setUntriedConcepts] = useState(PRESETS['exam-sprint'].untriedConcepts);
  const [thinConcepts, setThinConcepts] = useState(PRESETS['exam-sprint'].thinConcepts);
  const [missingConcepts, setMissingConcepts] = useState(PRESETS['exam-sprint'].missingConcepts);
  const [customRules, setCustomRules] = useState(PRESETS['exam-sprint'].customRules);
  const [intensity, setIntensity] = useState(PRESETS['exam-sprint'].intensity);
  const [includeSupportNodes, setIncludeSupportNodes] = useState(
    PRESETS['exam-sprint'].includeSupportNodes,
  );
  const [forceBossMix, setForceBossMix] = useState(PRESETS['exam-sprint'].forceBossMix);
  const [selectedStepId, setSelectedStepId] = useState<ReviewStepId>('profile');
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [isLoadingSavedResult, setIsLoadingSavedResult] = useState(true);
  const [assessment, setAssessment] = useState<AiProblemBankReadiness | null>(null);
  const [route, setRoute] = useState<ReviewRoute | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [supplementProblems, setSupplementProblems] = useState<CandidateProblemPayload[]>([]);

  const activeScenario = REVIEW_SCENARIOS[scenarioId];
  const activePreset = PRESETS[mode];
  const baseCandidateProblemPool = useMemo(
    () => candidateProblemsForScenario(mode, activeScenario),
    [activeScenario, mode],
  );
  const candidateProblemPool = useMemo(
    () => [...baseCandidateProblemPool, ...supplementProblems],
    [baseCandidateProblemPool, supplementProblems],
  );
  const privateMemory = useMemo(
    () => privateMemoryForScenario(mode, activeScenario),
    [activeScenario, mode],
  );
  const reviewHistory = useMemo(
    () => reviewHistoryForScenario(mode, activeScenario),
    [activeScenario, mode],
  );
  const selectedCandidateLimit =
    activeScenario.bankMode === 'full'
      ? 18
      : Math.min(18, Math.max(6, candidateProblemPool.length));
  const masteredConceptList = useMemo(() => splitLines(masteredConcepts), [masteredConcepts]);
  const weakConceptList = useMemo(() => splitLines(weakConcepts), [weakConcepts]);
  const untriedConceptList = useMemo(() => splitLines(untriedConcepts), [untriedConcepts]);
  const thinConceptList = useMemo(() => splitLines(thinConcepts), [thinConcepts]);
  const missingConceptList = useMemo(() => splitLines(missingConcepts), [missingConcepts]);
  const candidateConceptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const problem of candidateProblemPool) {
      for (const concept of problem.concepts) {
        counts.set(concept, (counts.get(concept) || 0) + 1);
      }
    }
    return counts;
  }, [candidateProblemPool]);
  const effectiveThinConceptList = useMemo(
    () =>
      activeScenario.bankMode === 'full'
        ? []
        : thinConceptList.filter((concept) => (candidateConceptCounts.get(concept) || 0) < 2),
    [activeScenario.bankMode, candidateConceptCounts, thinConceptList],
  );
  const effectiveMissingConceptList = useMemo(
    () =>
      activeScenario.bankMode === 'full'
        ? []
        : missingConceptList.filter((concept) => !candidateConceptCounts.has(concept)),
    [activeScenario.bankMode, candidateConceptCounts, missingConceptList],
  );
  const selectedCandidateProblems = useMemo(
    () =>
      selectCandidateProblems({
        candidates: candidateProblemPool,
        weakConcepts: weakConceptList,
        untriedConcepts: untriedConceptList,
        thinConcepts: effectiveThinConceptList,
        masteredConcepts: masteredConceptList,
        privateMemory,
        reviewHistory,
        limit: selectedCandidateLimit,
      }),
    [
      candidateProblemPool,
      effectiveThinConceptList,
      masteredConceptList,
      privateMemory,
      reviewHistory,
      selectedCandidateLimit,
      untriedConceptList,
      weakConceptList,
    ],
  );
  const problemBank = useMemo(
    () =>
      buildProblemBank({
        masteredConcepts: masteredConceptList,
        weakConcepts: weakConceptList,
        untriedConcepts: untriedConceptList,
        thinConcepts: effectiveThinConceptList,
        missingConcepts: effectiveMissingConceptList,
        candidateProblems: candidateProblemPool,
      }),
    [
      candidateProblemPool,
      effectiveMissingConceptList,
      effectiveThinConceptList,
      masteredConceptList,
      untriedConceptList,
      weakConceptList,
    ],
  );
  const allConcepts = useMemo(() => {
    const selectedConcepts = uniqueItems(
      selectedCandidateProblems.flatMap((problem) => problem.concepts),
    );
    return uniqueItems([
      ...problemBank.weakConcepts.filter((concept) => selectedConcepts.includes(concept)),
      ...problemBank.untriedConcepts.filter((concept) => selectedConcepts.includes(concept)),
      ...problemBank.thinConcepts.filter((concept) => selectedConcepts.includes(concept)),
      ...selectedConcepts,
      ...problemBank.missingConcepts,
    ]).slice(0, 24);
  }, [problemBank, selectedCandidateProblems]);
  const scenes = useMemo(
    () => buildScenes(allConcepts, problemBank, selectedCandidateProblems),
    [allConcepts, problemBank, selectedCandidateProblems],
  );
  const payload = useMemo<GeneratePayload>(
    () => ({
      notebookId: `custom-review-test-${mode}-${scenarioId}`,
      notebookName,
      notebookDescription: [
        `定制化复习目标：${goal}`,
        `复习模式：${activePreset.title}`,
        `测试场景：${activeScenario.title}。${activeScenario.expectedSignal}`,
        `强度：${intensity}/5`,
        includeSupportNodes
          ? '需要营火、宝箱、事件或商店节点调节节奏。'
          : '尽量减少非做题节点，把路线压缩成纯检测链路。',
        forceBossMix ? '最终 Boss 必须是多知识点综合题。' : '最终 Boss 可以偏基础综合。',
        customRules ? `额外规则：${customRules}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      weakPoints: splitLines(weakPoints),
      problemBank,
      scenes,
      privateMemory,
      candidateProblems: selectedCandidateProblems,
      reviewHistory,
      selectedProblemIds: selectedCandidateProblems.map((problem) => problem.id),
    }),
    [
      activePreset.title,
      activeScenario.expectedSignal,
      activeScenario.title,
      customRules,
      forceBossMix,
      goal,
      includeSupportNodes,
      intensity,
      mode,
      notebookName,
      scenarioId,
      problemBank,
      privateMemory,
      reviewHistory,
      scenes,
      selectedCandidateProblems,
      weakPoints,
    ],
  );
  const metrics = useMemo(() => routeMetrics(route), [route]);
  const formState = useMemo<ReviewFormState>(
    () => ({
      scenarioId,
      mode,
      notebookName,
      goal,
      weakPoints,
      masteredConcepts,
      weakConcepts,
      untriedConcepts,
      thinConcepts,
      missingConcepts,
      customRules,
      intensity,
      includeSupportNodes,
      forceBossMix,
    }),
    [
      customRules,
      forceBossMix,
      goal,
      includeSupportNodes,
      intensity,
      masteredConcepts,
      missingConcepts,
      mode,
      notebookName,
      scenarioId,
      thinConcepts,
      untriedConcepts,
      weakConcepts,
      weakPoints,
    ],
  );
  const profileChecks = useMemo(
    () => evaluateProfile(formState, privateMemory, reviewHistory),
    [formState, privateMemory, reviewHistory],
  );
  const problemBankChecks = useMemo(() => evaluateProblemBank(payload), [payload]);
  const assessmentChecks = useMemo(
    () => evaluateAssessment(assessment, payload),
    [assessment, payload],
  );
  const routeChecks = useMemo(
    () => evaluateReviewPlan(route, payload, formState),
    [formState, payload, route],
  );
  const profilePassed = !hasBlockingFailure(profileChecks);
  const problemBankPassed = profilePassed && !hasBlockingFailure(problemBankChecks);
  const assessmentStarted = Boolean(assessment) || phase === 'assessing';
  const routeStarted = Boolean(route) || phase === 'generating';
  const stepStates: Record<ReviewStepId, PipelineStepState> = {
    profile: checksToStepState(profileChecks),
    'problem-bank':
      phase === 'supplementing'
        ? 'running'
        : !profilePassed
          ? 'locked'
          : checksToStepState(problemBankChecks),
    readiness:
      phase === 'assessing'
        ? 'running'
        : !problemBankPassed
          ? 'locked'
          : assessmentStarted
            ? checksToStepState(assessmentChecks)
            : 'ready',
    'review-plan':
      phase === 'generating'
        ? 'running'
        : !problemBankPassed
          ? 'locked'
          : routeStarted
            ? checksToStepState(routeChecks)
            : 'ready',
  };
  const readinessPercent = useMemo(() => {
    if (!assessment) return 0;
    if (assessment.requiredProblemCount <= 0) return 100;
    return Math.min(
      100,
      Math.round((assessment.currentProblemCount / assessment.requiredProblemCount) * 100),
    );
  }, [assessment]);
  const supplementTargetProblemCount = Math.max(
    MIN_REVIEW_PROBLEM_COUNT,
    assessment?.requiredProblemCount ?? MIN_REVIEW_PROBLEM_COUNT,
  );
  const supplementDeficit = Math.max(0, supplementTargetProblemCount - problemBank.totalProblems);

  const applyFormState = useCallback((form: ReviewFormState) => {
    setScenarioId(form.scenarioId || 'known-memory');
    setMode(form.mode);
    setNotebookName(form.notebookName);
    setGoal(form.goal);
    setWeakPoints(form.weakPoints);
    setMasteredConcepts(form.masteredConcepts);
    setWeakConcepts(form.weakConcepts);
    setUntriedConcepts(form.untriedConcepts);
    setThinConcepts(form.thinConcepts);
    setMissingConcepts(form.missingConcepts);
    setCustomRules(form.customRules);
    setIntensity(form.intensity);
    setIncludeSupportNodes(form.includeSupportNodes);
    setForceBossMix(form.forceBossMix);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTestResult<SavedCustomReviewPayload>({
      testId: TEST_ID,
      resultKey: RESULT_KEY,
    })
      .then((row) => {
        if (cancelled) return;
        const saved = row?.payload;
        if (saved?.mode === 'custom-review-pipeline' && saved.form) {
          applyFormState(saved.form);
          setSupplementProblems(saved.supplementProblems || []);
          setAssessment(saved.assessment || null);
          setRoute(saved.route || null);
          setPhase(saved.route ? 'success' : 'idle');
          setSelectedStepId(
            saved.route ? 'review-plan' : saved.assessment ? 'readiness' : 'profile',
          );
          setSaveMessage(
            `已恢复 ${formatSavedAt(row?.updatedAt || Date.now())} 保存的复习计划测试结果。`,
          );
          return;
        }
        setSaveMessage('');
      })
      .catch(() => {
        if (!cancelled) setSaveMessage('');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSavedResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFormState]);

  const persistPipelineResult = useCallback(
    async (args: {
      status: 'generated' | 'failed' | 'assessed';
      title: string;
      nextAssessment: AiProblemBankReadiness | null;
      nextRoute: ReviewRoute | null;
      error?: string;
    }) => {
      const checks: Record<ReviewStepId, PipelineCheck[]> = {
        profile: evaluateProfile(formState, privateMemory, reviewHistory),
        'problem-bank': evaluateProblemBank(payload),
        readiness: evaluateAssessment(args.nextAssessment, payload),
        'review-plan': evaluateReviewPlan(args.nextRoute, payload, formState),
      };
      const visibleChecks = [
        ...checks.profile,
        ...checks['problem-bank'],
        ...(args.nextAssessment ? checks.readiness : []),
        ...(args.nextRoute || args.error ? checks['review-plan'] : []),
      ];
      const nextMetrics = routeMetrics(args.nextRoute);
      const errorCount =
        visibleChecks.filter((check) => check.status === 'fail').length + (args.error ? 1 : 0);
      const payloadToSave: SavedCustomReviewPayload = {
        mode: 'custom-review-pipeline',
        form: formState,
        request: payload,
        supplementProblems,
        assessment: args.nextAssessment,
        route: args.nextRoute,
        checks,
        generatedAt: Date.now(),
      };
      try {
        await saveTestResult({
          testId: TEST_ID,
          resultKey: RESULT_KEY,
          status: args.status,
          title: args.title,
          summary: {
            generatedCount: nextMetrics.nodeCount,
            errorCount,
            layerCount: nextMetrics.layerCount,
            questionNodeCount: nextMetrics.questionNodeCount,
            supportNodeCount: nextMetrics.supportNodeCount,
            readiness: args.nextAssessment?.ready ?? null,
            currentProblemCount:
              args.nextAssessment?.currentProblemCount ?? payload.problemBank.totalProblems,
            lastUpdatedAt: Date.now(),
          },
          payload: payloadToSave,
        });
      } catch {
        // DATABASE_URL is optional in local-first mode, so saving QA state is best-effort.
      }
    },
    [formState, payload, privateMemory, reviewHistory, supplementProblems],
  );

  const applyPreset = useCallback((presetId: ReviewMode) => {
    const preset = PRESETS[presetId];
    setMode(presetId);
    setGoal(preset.goal);
    setWeakPoints(preset.weakPoints);
    setMasteredConcepts(preset.masteredConcepts);
    setWeakConcepts(preset.weakConcepts);
    setUntriedConcepts(preset.untriedConcepts);
    setThinConcepts(preset.thinConcepts);
    setMissingConcepts(preset.missingConcepts);
    setCustomRules(preset.customRules);
    setIntensity(preset.intensity);
    setIncludeSupportNodes(preset.includeSupportNodes);
    setForceBossMix(preset.forceBossMix);
    setAssessment(null);
    setRoute(null);
    setSupplementProblems([]);
    setErrorMessage('');
    setSaveMessage('');
    setSelectedStepId('profile');
    setPhase('idle');
  }, []);

  const applyScenario = useCallback((nextScenarioId: ReviewScenarioId) => {
    setScenarioId(nextScenarioId);
    setAssessment(null);
    setRoute(null);
    setSupplementProblems([]);
    setErrorMessage('');
    setSaveMessage('');
    setSelectedStepId('profile');
    setPhase('idle');
  }, []);

  const handleSupplementProblems = useCallback(async () => {
    if (!profilePassed) {
      setSelectedStepId('profile');
      return;
    }
    if (supplementDeficit <= 0) {
      setSelectedStepId('problem-bank');
      setSaveMessage('当前题库题量已经达到测试最低要求，不需要 AI 补题。');
      return;
    }

    setPhase('supplementing');
    setSelectedStepId('problem-bank');
    setErrorMessage('');
    setSaveMessage('');
    setRoute(null);
    try {
      const response = await backendJson<{
        problems: CandidateProblemPayload[];
        requiredProblemCount: number;
        currentProblemCount: number;
        deficit: number;
        teacherLine?: string;
      }>('/api/review-route/supplement-problems', {
        method: 'POST',
        headers: getModelHeaders(),
        body: JSON.stringify({
          notebookId: payload.notebookId,
          notebookName: payload.notebookName,
          notebookDescription: payload.notebookDescription,
          problemBank: payload.problemBank,
          scenes: payload.scenes,
          privateMemory: payload.privateMemory,
          candidateProblems: candidateProblemPool,
          reviewHistory: payload.reviewHistory,
          selectedProblemIds: payload.selectedProblemIds,
          assessment,
          requiredProblemCount: supplementTargetProblemCount,
          targetCount: supplementDeficit,
        }),
      });
      setSupplementProblems((current) => [...current, ...response.problems]);
      setAssessment(null);
      setPhase('idle');
      setSaveMessage(
        response.teacherLine ||
          `AI 已补 ${response.problems.length} 道题：${response.currentProblemCount} → ${response.requiredProblemCount}。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 补题失败';
      setErrorMessage(message);
      setPhase('error');
    }
  }, [
    assessment,
    candidateProblemPool,
    payload,
    profilePassed,
    supplementDeficit,
    supplementTargetProblemCount,
  ]);

  const handleAssess = useCallback(async () => {
    if (!problemBankPassed) {
      setSelectedStepId(!profilePassed ? 'profile' : 'problem-bank');
      return;
    }
    setPhase('assessing');
    setSelectedStepId('readiness');
    setErrorMessage('');
    setAssessment(null);
    setRoute(null);
    setSaveMessage('');
    try {
      const response = await backendJson<{ assessment: AiProblemBankReadiness }>(
        '/api/review-route/assess-problem-bank',
        {
          method: 'POST',
          headers: getModelHeaders(),
          body: JSON.stringify({
            notebookId: payload.notebookId,
            notebookName: payload.notebookName,
            notebookDescription: payload.notebookDescription,
            problemBank: payload.problemBank,
            scenes: payload.scenes,
            privateMemory: payload.privateMemory,
            candidateProblems: payload.candidateProblems,
            reviewHistory: payload.reviewHistory,
            selectedProblemIds: payload.selectedProblemIds,
          }),
        },
      );
      setAssessment(response.assessment);
      setPhase('idle');
      await persistPipelineResult({
        status: 'assessed',
        title: `${payload.notebookName} · 题库体检`,
        nextAssessment: response.assessment,
        nextRoute: null,
      });
      setSaveMessage(
        `题库体检已保存：${response.assessment.ready ? '可开图' : '需要补题/偏薄说明已返回'}。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '题库体检失败';
      setErrorMessage(message);
      setPhase('error');
      await persistPipelineResult({
        status: 'failed',
        title: `${payload.notebookName} · 题库体检失败`,
        nextAssessment: null,
        nextRoute: null,
        error: message,
      });
    }
  }, [payload, persistPipelineResult, problemBankPassed, profilePassed]);

  const handleGenerate = useCallback(async () => {
    if (!problemBankPassed) {
      setSelectedStepId(!profilePassed ? 'profile' : 'problem-bank');
      return;
    }
    setPhase('generating');
    setSelectedStepId('review-plan');
    setErrorMessage('');
    setRoute(null);
    setSaveMessage('');
    try {
      const response = await backendJson<{ route: ReviewRoute }>('/api/review-route/generate', {
        method: 'POST',
        headers: getModelHeaders(),
        body: JSON.stringify(payload),
      });
      const nextRoute = response.route;
      setRoute(nextRoute);
      setPhase('success');
      const nextMetrics = routeMetrics(nextRoute);
      await persistPipelineResult({
        status: 'generated',
        title: nextRoute.title,
        nextAssessment: assessment,
        nextRoute,
      });
      setSaveMessage(
        `复习计划已保存：${nextMetrics.layerCount} 层，${nextMetrics.nodeCount} 个节点。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '复习路线生成失败';
      setErrorMessage(message);
      setPhase('error');
      await persistPipelineResult({
        status: 'failed',
        title: `${payload.notebookName} · 路线生成失败`,
        nextAssessment: assessment,
        nextRoute: null,
        error: message,
      });
    }
  }, [assessment, payload, persistPipelineResult, problemBankPassed, profilePassed]);

  const isRunning = phase === 'supplementing' || phase === 'assessing' || phase === 'generating';
  const checksByStep: Record<ReviewStepId, PipelineCheck[]> = {
    profile: profileChecks,
    'problem-bank': problemBankChecks,
    readiness: assessmentStarted ? assessmentChecks : [],
    'review-plan': routeStarted ? routeChecks : [],
  };

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="grid gap-5 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <Link
              href="/test"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft className="size-4" />
              返回测试中心
            </Link>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
              <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-400 text-[11px] font-semibold text-white shadow-sm">
                R
              </span>
              Custom Review QA
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">定制化复习测试</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              模拟一本 notebook 的私人记忆、候选题库和历史复习记录，复用正式复习路线
              API，检查个性化输入和选题结果是否能影响关卡、题量、奖励和 Boss 结构。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge variant="outline" className="rounded-md">
              {activeScenario.title}
            </Badge>
            <Badge variant="secondary" className="rounded-md">
              {activePreset.title}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              题库 {candidateProblemPool.length} 题
            </Badge>
            <Badge variant={assessment?.ready ? 'secondary' : 'outline'} className="rounded-md">
              {assessment ? (assessment.ready ? '题库可开图' : '题库需补题') : '未体检'}
            </Badge>
            <Badge variant={route ? 'secondary' : 'outline'} className="rounded-md">
              {route ? `${metrics.nodeCount} 节点` : '未生成'}
            </Badge>
          </div>
        </header>

        <ScenarioCoverageBar activeScenarioId={scenarioId} onSelect={applyScenario} />

        <ReviewContextStory
          privateMemory={privateMemory}
          selectedCandidateProblems={selectedCandidateProblems}
          reviewHistory={reviewHistory}
          route={route}
        />

        <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="grid h-fit gap-3">
            {(['profile', 'problem-bank', 'readiness', 'review-plan'] as ReviewStepId[]).map(
              (stepId) => {
                const checks = checksByStep[stepId];
                return (
                  <StepButton
                    key={stepId}
                    id={stepId}
                    active={selectedStepId === stepId}
                    state={stepStates[stepId]}
                    failCount={checks.filter((check) => check.status === 'fail').length}
                    warnCount={checks.filter((check) => check.status === 'warn').length}
                    onClick={() => setSelectedStepId(stepId)}
                  />
                );
              },
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
              {isLoadingSavedResult ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  正在恢复保存结果
                </div>
              ) : saveMessage ? (
                <div className="text-emerald-700">{saveMessage}</div>
              ) : (
                <div>运行题库体检或生成复习计划后，结果会保存到测试结果表，刷新还能继续看。</div>
              )}
            </div>
          </aside>

          <div className="grid gap-4">
            {errorMessage ? (
              <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {selectedStepId === 'profile' ? (
              <StepShell id="profile" state={stepStates.profile}>
                <div className="grid gap-5">
                  <ProfileLearningDigest
                    form={formState}
                    privateMemory={privateMemory}
                    reviewHistory={reviewHistory}
                    checks={profileChecks}
                  />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-review-scenario">测试场景</Label>
                      <Select
                        value={scenarioId}
                        onValueChange={(value) => applyScenario(value as ReviewScenarioId)}
                      >
                        <SelectTrigger id="pipeline-review-scenario" className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(REVIEW_SCENARIOS).map((scenario) => (
                            <SelectItem key={scenario.id} value={scenario.id}>
                              {scenario.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-slate-500">
                        {activeScenario.description} {activeScenario.expectedSignal}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pipeline-review-mode">预设模式</Label>
                      <Select
                        value={mode}
                        onValueChange={(value) => applyPreset(value as ReviewMode)}
                      >
                        <SelectTrigger id="pipeline-review-mode" className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PRESETS).map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-slate-500">{activePreset.description}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pipeline-notebook-name">Notebook 名称</Label>
                      <Input
                        id="pipeline-notebook-name"
                        value={notebookName}
                        onChange={(event) => setNotebookName(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-review-goal">学生目标</Label>
                      <Textarea
                        id="pipeline-review-goal"
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="pipeline-review-intensity">复习强度</Label>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {intensity}/5
                        </span>
                      </div>
                      <Slider
                        id="pipeline-review-intensity"
                        value={[intensity]}
                        min={1}
                        max={5}
                        step={1}
                        onValueChange={(value) => setIntensity(value[0] ?? 3)}
                      />
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                        <Checkbox
                          checked={includeSupportNodes}
                          onCheckedChange={(value) => setIncludeSupportNodes(value === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-semibold text-slate-900">保留补给节点</span>
                          <span className="block text-xs text-slate-500">
                            要求营火、宝箱、事件或商店参与节奏测试。
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                        <Checkbox
                          checked={forceBossMix}
                          onCheckedChange={(value) => setForceBossMix(value === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-semibold text-slate-900">强制综合 Boss</span>
                          <span className="block text-xs text-slate-500">
                            在描述中声明最终 Boss 必须混合多个知识点。
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-weak-points">学生已记录薄弱点</Label>
                      <Textarea
                        id="pipeline-weak-points"
                        value={weakPoints}
                        onChange={(event) => setWeakPoints(event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-custom-rules">额外测试规则</Label>
                      <Textarea
                        id="pipeline-custom-rules"
                        value={customRules}
                        onChange={(event) => setCustomRules(event.target.value)}
                        className="min-h-20"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">Notebook 私人记忆</h3>
                      <div className="mt-3 grid gap-2">
                        {privateMemory.map((item) => (
                          <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={item.status === 'open' ? 'default' : 'outline'}
                                className="rounded-md"
                              >
                                {item.status}
                              </Badge>
                              <span className="font-semibold text-slate-900">{item.concept}</span>
                              <span className="text-xs text-slate-500">{item.severity}</span>
                            </div>
                            <p className="mt-2 leading-6 text-slate-600">{item.note}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              关联题：{item.relatedProblemIds.join('、') || '暂无'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">历史复习记录</h3>
                      <div className="mt-3 grid gap-2">
                        {reviewHistory.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">{item.title}</span>
                              <Badge variant="outline" className="rounded-md">
                                {item.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              covered: {item.coveredConcepts.join('、') || '暂无'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-rose-600">
                              failed: {item.failedConcepts.join('、') || '暂无'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'problem-bank' ? (
              <StepShell id="problem-bank" state={stepStates['problem-bank']}>
                <div className="grid gap-5">
                  <GateCheckList checks={problemBankChecks} />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {[
                      ['题库题量', problemBank.totalProblems],
                      ['候选题池', candidateProblemPool.length],
                      ['已选候选题', selectedCandidateProblems.length],
                      ['画像知识点', allConcepts.length],
                      ['scenes', scenes.length],
                      ['错题信号', problemBank.wrongProblems.length],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="text-xs font-medium text-slate-500">{label}</div>
                        <div className="mt-1 text-2xl font-semibold tracking-normal">{value}</div>
                      </div>
                    ))}
                  </div>

                  {supplementDeficit > 0 || supplementProblems.length > 0 ? (
                    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-5 text-indigo-600" />
                            <h3 className="text-sm font-semibold text-indigo-950">AI 补题缺口</h3>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-indigo-900">
                            当前 {problemBank.totalProblems} 题，目标至少{' '}
                            {supplementTargetProblemCount} 题，缺口 {supplementDeficit} 题。
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={handleSupplementProblems}
                          disabled={isRunning || !profilePassed || supplementDeficit <= 0}
                        >
                          {phase === 'supplementing' ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Sparkles className="size-4" />
                          )}
                          {supplementDeficit > 0 ? `AI 补 ${supplementDeficit} 道题` : '补题已足够'}
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-white/80 p-3">
                          <div className="text-xs font-medium text-indigo-500">原始题库</div>
                          <div className="mt-1 text-xl font-semibold tracking-normal text-indigo-950">
                            {baseCandidateProblemPool.length}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/80 p-3">
                          <div className="text-xs font-medium text-indigo-500">AI 已补</div>
                          <div className="mt-1 text-xl font-semibold tracking-normal text-indigo-950">
                            {supplementProblems.length}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/80 p-3">
                          <div className="text-xs font-medium text-indigo-500">合计</div>
                          <div className="mt-1 text-xl font-semibold tracking-normal text-indigo-950">
                            {candidateProblemPool.length}/{supplementTargetProblemCount}
                          </div>
                        </div>
                      </div>
                      {supplementProblems.length > 0 ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {supplementProblems.map((problem) => (
                            <div key={problem.id} className="rounded-lg bg-white/80 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-indigo-950">
                                    {problem.title}
                                  </div>
                                  <div className="mt-1 text-xs text-indigo-500">
                                    {problem.id} · {problem.type} · {problem.difficulty}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="rounded-md">
                                  AI补题
                                </Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-indigo-800">
                                {problem.preview}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {problem.concepts.map((concept) => (
                                  <Badge
                                    key={concept}
                                    variant="outline"
                                    className="rounded-md bg-white"
                                  >
                                    {concept}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">知识点画像</h3>
                      <div className="mt-3 grid gap-2 text-sm leading-6">
                        {[
                          ['已掌握', problemBank.masteredConcepts],
                          ['薄弱', problemBank.weakConcepts],
                          ['未尝试', problemBank.untriedConcepts],
                          ['题量偏薄', problemBank.thinConcepts],
                          ['缺题', problemBank.missingConcepts],
                        ].map(([label, items]) => (
                          <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                            <div className="text-xs font-semibold text-slate-500">
                              {label as string}
                            </div>
                            <div className="mt-1 text-slate-700">
                              {(items as string[]).join('、') || '暂无'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">场景切片</h3>
                      <div className="mt-3 grid gap-2">
                        {scenes.slice(0, 8).map((scene) => (
                          <div
                            key={scene.id}
                            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {scene.order}. {scene.title}
                              </span>
                              <Badge variant="outline" className="rounded-md">
                                {scene.quizQuestions.length} 题
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {scene.quizQuestions[0] || '缺题专题：正式生成时需要标注先补题。'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-950">
                        已选候选题（结构化题目 fixture + AI 补题）
                      </h3>
                      <Badge variant="outline" className="rounded-md">
                        {selectedCandidateProblems.length}/{candidateProblemPool.length}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {selectedCandidateProblems.map((problem) => (
                        <div
                          key={problem.id}
                          className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {problem.title}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {problem.id} · {problem.type} · {problem.difficulty}
                              </div>
                            </div>
                            <Badge
                              variant={
                                problem.status === 'failed' || problem.status === 'partial'
                                  ? 'destructive'
                                  : 'outline'
                              }
                              className="rounded-md"
                            >
                              {problem.status}
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                            {problem.preview}
                          </p>
                          <p className="mt-2 text-xs font-medium leading-5 text-indigo-700">
                            {candidateReason(problem, privateMemory, reviewHistory)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {problem.concepts.map((concept) => (
                              <Badge
                                key={concept}
                                variant="outline"
                                className="rounded-md bg-white"
                              >
                                {concept}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      查看正式 API Payload
                    </summary>
                    <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {compactJson(payload)}
                    </pre>
                  </details>
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'readiness' ? (
              <StepShell
                id="readiness"
                state={stepStates.readiness}
                actionLabel={assessment ? '重新体检题库' : '体检题库'}
                actionDisabled={isRunning || !problemBankPassed}
                onAction={() => void handleAssess()}
              >
                <div className="grid gap-5">
                  {assessmentStarted ? (
                    <GateCheckList checks={assessmentChecks} />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      先确认 Step 2
                      通过，然后点击“体检题库”。这一步只判断题库是否够开图，不直接生成复习路线。
                    </div>
                  )}

                  {assessment ? (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {assessment.ready ? (
                              <CheckCircle2 className="size-5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="size-5 text-amber-600" />
                            )}
                            <h3 className="text-base font-semibold tracking-normal">
                              题库体检结果
                            </h3>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {assessment.teacherLine || 'AI 已返回题库体检结果。'}
                          </p>
                        </div>
                        <Badge
                          variant={assessment.ready ? 'secondary' : 'outline'}
                          className="rounded-md"
                        >
                          {assessment.currentProblemCount}/{assessment.requiredProblemCount} 题
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <Progress value={readinessPercent} />
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">缺题专题</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.missingConcepts.join('、') || '暂无'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">偏薄专题</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.thinConcepts.join('、') || '暂无'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">原因</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.reasons.join('；') || '可以进入路线生成'}
                          </p>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'review-plan' ? (
              <StepShell
                id="review-plan"
                state={stepStates['review-plan']}
                actionLabel={route ? '重新生成复习计划' : '生成复习计划'}
                actionDisabled={isRunning || !problemBankPassed}
                onAction={() => void handleGenerate()}
              >
                <div className="grid gap-5">
                  {routeStarted ? (
                    <GateCheckList checks={routeChecks} />
                  ) : (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
                      Step 1 和 Step 2 通过后，可以直接生成复习计划；Step 3
                      的题库体检会作为旁路证据保留。
                    </div>
                  )}

                  {route ? (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-normal">{route.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {route.teacherLine}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            {route.coverageContract}
                          </p>
                        </div>
                        <Badge variant="secondary" className="rounded-md">
                          {metrics.layerCount} 层 · {metrics.questionNodeCount} 做题关 · +
                          {metrics.rewardPoints}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {route.layers.map((layer, layerIndex) => (
                          <div key={layer.id} className="grid gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-md">
                                第 {layerIndex + 1} 层
                              </Badge>
                              <h4 className="text-sm font-semibold tracking-normal">
                                {layer.title}
                              </h4>
                              <span className="text-xs text-slate-500">{layer.summary}</span>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {layer.nodes.map((node) => (
                                <div
                                  key={node.id}
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <h5 className="min-w-0 text-sm font-semibold tracking-normal text-slate-950">
                                      {node.title}
                                    </h5>
                                    <span
                                      className={cn(
                                        'rounded-md border px-2 py-0.5 text-xs font-semibold',
                                        nodeKindClassName(node.kind),
                                      )}
                                    >
                                      {nodeKindLabel(node.kind)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-slate-600">
                                    {node.personalReason || node.checkGoal}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {node.knowledgePoints.slice(0, 4).map((point) => (
                                      <Badge
                                        key={point}
                                        variant="outline"
                                        className="rounded-md bg-white"
                                      >
                                        {point}
                                      </Badge>
                                    ))}
                                  </div>
                                  {(node.problemIds || []).length ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {(node.problemIds || []).slice(0, 4).map((problemId) => (
                                        <Badge
                                          key={problemId}
                                          variant="secondary"
                                          className="rounded-md"
                                        >
                                          {problemId}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                      <div className="text-slate-400">题量</div>
                                      <div className="font-semibold text-slate-900">
                                        {node.questionCount}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400">难度</div>
                                      <div className="font-semibold text-slate-900">
                                        {node.difficulty}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400">奖励</div>
                                      <div className="font-semibold text-slate-900">
                                        +{node.rewardPoints}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      查看 route JSON
                    </summary>
                    <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {compactJson(route || { waiting: '点击生成复习计划后显示 ReviewRoute。' })}
                    </pre>
                  </details>
                </div>
              </StepShell>
            ) : null}
          </div>
        </section>

        <section className="hidden">
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">测试画像</h2>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="review-mode">预设模式</Label>
                  <Select value={mode} onValueChange={(value) => applyPreset(value as ReviewMode)}>
                    <SelectTrigger id="review-mode" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PRESETS).map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-500">{activePreset.description}</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notebook-name">Notebook 名称</Label>
                  <Input
                    id="notebook-name"
                    value={notebookName}
                    onChange={(event) => setNotebookName(event.target.value)}
                    placeholder="输入测试 notebook 名称"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="review-goal">学生目标</Label>
                  <Textarea
                    id="review-goal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="min-h-24"
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="review-intensity">复习强度</Label>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {intensity}/5
                    </span>
                  </div>
                  <Slider
                    id="review-intensity"
                    value={[intensity]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={(value) => setIntensity(value[0] ?? 3)}
                  />
                </div>

                <div className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
                  <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                    <Checkbox
                      checked={includeSupportNodes}
                      onCheckedChange={(value) => setIncludeSupportNodes(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">保留补给节点</span>
                      <span className="block text-xs text-slate-500">
                        在 prompt 中要求营火、宝箱、事件或商店参与节奏测试。
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                    <Checkbox
                      checked={forceBossMix}
                      onCheckedChange={(value) => setForceBossMix(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">强制综合 Boss</span>
                      <span className="block text-xs text-slate-500">
                        在描述中声明最终 Boss 必须混合多个知识点。
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">知识点画像</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                每行一个知识点。测试页会据此合成 problemBank 和 scenes payload。
              </p>

              <div className="mt-4 grid gap-3">
                {[
                  ['已掌握', masteredConcepts, setMasteredConcepts],
                  ['薄弱', weakConcepts, setWeakConcepts],
                  ['未尝试', untriedConcepts, setUntriedConcepts],
                  ['题量偏薄', thinConcepts, setThinConcepts],
                  ['缺题', missingConcepts, setMissingConcepts],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className="grid gap-1.5">
                    <Label>{label as string}</Label>
                    <Textarea
                      value={value as string}
                      onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                      className="min-h-20"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">个性化约束</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="weak-points">学生已记录薄弱点</Label>
                  <Textarea
                    id="weak-points"
                    value={weakPoints}
                    onChange={(event) => setWeakPoints(event.target.value)}
                    className="min-h-24"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="custom-rules">额外测试规则</Label>
                  <Textarea
                    id="custom-rules"
                    value={customRules}
                    onChange={(event) => setCustomRules(event.target.value)}
                    className="min-h-20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Route className="size-5 text-slate-500" />
                    <h2 className="text-base font-semibold tracking-normal">运行控制</h2>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    先体检题库可以单独检查 readiness；直接生成会绕过体检，适合观察路线 prompt
                    对定制输入的响应。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSupplementProblems}
                    disabled={isRunning || !profilePassed || supplementDeficit <= 0}
                  >
                    {phase === 'supplementing' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {supplementDeficit > 0 ? `AI 补 ${supplementDeficit} 题` : '无需补题'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAssess}
                    disabled={isRunning}
                  >
                    {phase === 'assessing' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    体检题库
                  </Button>
                  <Button type="button" onClick={handleGenerate} disabled={isRunning}>
                    {phase === 'generating' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    生成路线
                  </Button>
                </div>
              </div>

              {errorMessage ? (
                <div className="mt-4 flex gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">题库题量</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {problemBank.totalProblems}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">知识点</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {allConcepts.length}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">路线节点</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {metrics.nodeCount}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">奖励积分</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {metrics.rewardPoints}
                  </div>
                </div>
              </div>
            </div>

            {assessment ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {assessment.ready ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="size-5 text-amber-600" />
                      )}
                      <h2 className="text-base font-semibold tracking-normal">题库体检结果</h2>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {assessment.teacherLine || 'AI 已返回题库体检结果。'}
                    </p>
                  </div>
                  <Badge
                    variant={assessment.ready ? 'secondary' : 'outline'}
                    className="rounded-md"
                  >
                    {assessment.currentProblemCount}/{assessment.requiredProblemCount} 题
                  </Badge>
                </div>

                <div className="mt-4">
                  <Progress value={readinessPercent} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">缺题专题</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.missingConcepts.join('、') || '暂无'}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">偏薄专题</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.thinConcepts.join('、') || '暂无'}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">原因</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.reasons.join('；') || '可以进入路线生成'}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MapIcon className="size-5 text-slate-500" />
                  <h2 className="text-base font-semibold tracking-normal">路线预览</h2>
                </div>
                {route ? (
                  <Badge variant="secondary" className="rounded-md">
                    {metrics.layerCount} 层 · {metrics.questionNodeCount} 做题关
                  </Badge>
                ) : null}
              </div>

              {route ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <h3 className="text-lg font-semibold tracking-normal">{route.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{route.teacherLine}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {route.coverageContract}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {route.layers.map((layer, layerIndex) => (
                      <div key={layer.id} className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-md">
                            第 {layerIndex + 1} 层
                          </Badge>
                          <h3 className="text-sm font-semibold tracking-normal">{layer.title}</h3>
                          <span className="text-xs text-slate-500">{layer.summary}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {layer.nodes.map((node) => (
                            <div
                              key={node.id}
                              className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h4 className="min-w-0 text-sm font-semibold tracking-normal text-slate-950">
                                  {node.title}
                                </h4>
                                <span
                                  className={cn(
                                    'rounded-md border px-2 py-0.5 text-xs font-semibold',
                                    nodeKindClassName(node.kind),
                                  )}
                                >
                                  {nodeKindLabel(node.kind)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                {node.personalReason || node.checkGoal}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {node.knowledgePoints.slice(0, 4).map((point) => (
                                  <Badge key={point} variant="outline" className="rounded-md">
                                    {point}
                                  </Badge>
                                ))}
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <div className="text-slate-400">题量</div>
                                  <div className="font-semibold text-slate-900">
                                    {node.questionCount}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400">难度</div>
                                  <div className="font-semibold text-slate-900">
                                    {node.difficulty}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400">奖励</div>
                                  <div className="font-semibold text-slate-900">
                                    +{node.rewardPoints}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm leading-6 text-slate-500">
                  点击“生成路线”后，这里会展示 AI 返回的复习地图结构。
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <FileJson className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">请求 Payload</h2>
              </div>
              <pre className="mt-4 max-h-[420px] overflow-auto rounded-md border border-slate-100 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                {compactJson(payload)}
              </pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
