import type { ReviewRoute, ReviewRouteNode } from '@/lib/learning/review-route-types';

import {
  CANDIDATE_PROBLEM_FIXTURES,
  PRIVATE_MEMORY_FIXTURES,
  REVIEW_HISTORY_FIXTURES,
} from './fixtures';
import type {
  CandidateProblemPayload,
  PipelineStepState,
  PrivateMemoryPayload,
  ProblemBankPayload,
  ReviewHistoryPayload,
  ReviewMode,
  ReviewScenario,
  ScenePayload,
  CheckStatus,
} from './types';

export function splitLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,|，|;/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function candidateProblemsForScenario(
  mode: ReviewMode,
  scenario: ReviewScenario,
): CandidateProblemPayload[] {
  const pool = CANDIDATE_PROBLEM_FIXTURES[mode];
  if (scenario.bankMode === 'empty') return [];
  if (scenario.bankMode === 'thin') return pool.slice(0, Math.min(4, pool.length));
  return pool;
}

export function privateMemoryForScenario(
  mode: ReviewMode,
  scenario: ReviewScenario,
): PrivateMemoryPayload[] {
  if (scenario.memoryMode === 'none') return [];
  return PRIVATE_MEMORY_FIXTURES[mode];
}

export function reviewHistoryForScenario(
  mode: ReviewMode,
  scenario: ReviewScenario,
): ReviewHistoryPayload[] {
  if (scenario.memoryMode === 'none') return [];
  return REVIEW_HISTORY_FIXTURES[mode];
}

export function buildProblemBank(args: {
  masteredConcepts: string[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  missingConcepts: string[];
  candidateProblems: CandidateProblemPayload[];
}): ProblemBankPayload {
  const attemptedProblems = args.candidateProblems.filter(
    (problem) => problem.status !== 'unattempted',
  ).length;
  const wrongProblems: ProblemBankPayload['wrongProblems'] = args.candidateProblems
    .filter((problem) => ['failed', 'partial', 'error'].includes(problem.status))
    .slice(0, 8)
    .map((problem) => ({
      title: problem.title,
      tags: problem.concepts.length ? problem.concepts : problem.tags,
      difficulty: problem.difficulty,
      status:
        problem.status === 'error' ? 'error' : problem.status === 'partial' ? 'partial' : 'failed',
    }));

  return {
    totalProblems: args.candidateProblems.length,
    attemptedProblems,
    masteredConcepts: args.masteredConcepts,
    weakConcepts: args.weakConcepts,
    untriedConcepts: args.untriedConcepts,
    thinConcepts: args.thinConcepts,
    missingConcepts: args.missingConcepts,
    wrongProblems,
  };
}

export function problemsForConcept(
  concept: string,
  candidateProblems: CandidateProblemPayload[],
): CandidateProblemPayload[] {
  return candidateProblems.filter((problem) => problem.concepts.includes(concept));
}

export function selectCandidateProblems(args: {
  candidates: CandidateProblemPayload[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  masteredConcepts: string[];
  privateMemory: PrivateMemoryPayload[];
  reviewHistory: ReviewHistoryPayload[];
  limit: number;
}): CandidateProblemPayload[] {
  const openMemoryConcepts = new Set(
    args.privateMemory.filter((item) => item.status === 'open').map((item) => item.concept),
  );
  const failedHistoryConcepts = new Set(args.reviewHistory.flatMap((item) => item.failedConcepts));
  const unresolvedHistoryProblemIds = new Set(
    args.reviewHistory
      .filter((item) => item.status !== 'completed')
      .flatMap((item) => item.problemIds),
  );
  const weak = new Set(args.weakConcepts);
  const untried = new Set(args.untriedConcepts);
  const thin = new Set(args.thinConcepts);
  const mastered = new Set(args.masteredConcepts);

  return [...args.candidates]
    .map((problem) => {
      let score = 0;
      for (const concept of problem.concepts) {
        if (openMemoryConcepts.has(concept)) score += 8;
        if (failedHistoryConcepts.has(concept)) score += 6;
        if (weak.has(concept)) score += 5;
        if (untried.has(concept)) score += 4;
        if (thin.has(concept)) score += 3;
        if (mastered.has(concept)) score += 1;
      }
      if (unresolvedHistoryProblemIds.has(problem.id)) score += 4;
      if (problem.status === 'failed') score += 5;
      if (problem.status === 'partial' || problem.status === 'error') score += 3;
      if (problem.status === 'unattempted') score += 2;
      if (problem.type === 'code' || problem.type === 'proof') score += 1;
      return { problem, score };
    })
    .sort(
      (left, right) => right.score - left.score || left.problem.id.localeCompare(right.problem.id),
    )
    .map((item) => item.problem)
    .slice(0, args.limit);
}

export function buildScenes(
  concepts: string[],
  problemBank: ProblemBankPayload,
  candidateProblems: CandidateProblemPayload[],
): ScenePayload[] {
  const allConcepts = concepts.length > 0 ? concepts : ['综合复习'];
  return allConcepts.slice(0, 12).map((concept, index) => {
    const isMissing = problemBank.missingConcepts.includes(concept);
    const isThin = problemBank.thinConcepts.includes(concept);
    const isWeak = problemBank.weakConcepts.includes(concept);
    const conceptProblems = problemsForConcept(concept, candidateProblems);
    return {
      id: `custom-review-scene-${index + 1}`,
      title: concept,
      type: isWeak ? 'quiz' : 'lesson',
      order: index + 1,
      quizQuestions:
        isMissing || conceptProblems.length === 0
          ? []
          : conceptProblems.slice(0, isThin ? 2 : 3).map((problem) => problem.title),
    };
  });
}

export function routeMetrics(route: ReviewRoute | null) {
  if (!route) {
    return {
      layerCount: 0,
      nodeCount: 0,
      questionNodeCount: 0,
      supportNodeCount: 0,
      rewardPoints: 0,
    };
  }
  const nodes = route.layers.flatMap((layer) => layer.nodes);
  return {
    layerCount: route.layers.length,
    nodeCount: nodes.length,
    questionNodeCount: nodes.filter((node) => node.requiresQuestion).length,
    supportNodeCount: nodes.filter((node) => !node.requiresQuestion).length,
    rewardPoints: nodes.reduce((sum, node) => sum + (node.rewardPoints || 0), 0),
  };
}

export function formatSavedAt(value: string | number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function uniqueItems(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function statusToneClassName(status: string): string {
  if (status === 'open' || status === 'failed' || status === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (status === 'partial' || status === 'unattempted') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (status === 'reviewed' || status === 'passed' || status === 'completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function isAiSupplementProblem(problem: CandidateProblemPayload): boolean {
  return problem.tags.includes('ai_supplement') || problem.id.startsWith('ai-supplement-');
}

export function candidateReason(
  problem: CandidateProblemPayload,
  privateMemory: PrivateMemoryPayload[],
  reviewHistory: ReviewHistoryPayload[],
): string {
  if (isAiSupplementProblem(problem)) {
    return `AI 补题：填补 ${problem.concepts.join('、') || '当前题库'} 的复习缺口`;
  }
  const openMemory = privateMemory.find(
    (item) => item.status === 'open' && problem.concepts.includes(item.concept),
  );
  if (openMemory) return `命中 open memory：${openMemory.concept}`;
  const failedHistory = reviewHistory.find((item) =>
    item.failedConcepts.some((concept) => problem.concepts.includes(concept)),
  );
  if (failedHistory) return `修复上一轮失败点：${failedHistory.failedConcepts.join('、')}`;
  if (problem.status === 'failed' || problem.status === 'partial') return '最近作答不稳，优先返修';
  if (problem.status === 'unattempted') return '未尝试专题，适合进入新路线';
  return '作为基础巩固或 Boss 混合材料';
}

export function statusClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

export function stateBadgeClassName(state: PipelineStepState): string {
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (state === 'fail') return 'border-red-200 bg-red-50 text-red-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-slate-200 bg-white text-slate-600';
}

export function stateLabel(state: PipelineStepState): string {
  if (state === 'pass') return 'pass';
  if (state === 'warn') return 'warn';
  if (state === 'fail') return 'fail';
  if (state === 'running') return 'running';
  if (state === 'locked') return 'locked';
  return 'ready';
}

export function nodeKindLabel(kind: ReviewRouteNode['kind']): string {
  const labels: Record<ReviewRouteNode['kind'], string> = {
    normal: '普通关',
    elite: '精英关',
    boss: 'Boss',
    camp: '营火',
    treasure: '宝箱',
    event: '事件',
    shop: '商店',
  };
  return labels[kind];
}

export function nodeKindClassName(kind: ReviewRouteNode['kind']): string {
  if (kind === 'boss') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (kind === 'elite') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700';
  if (kind === 'camp') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (kind === 'treasure') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (kind === 'event') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (kind === 'shop') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
