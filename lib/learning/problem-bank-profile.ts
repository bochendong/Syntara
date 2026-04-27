import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';

export type ProblemBankConceptStatus = 'mastered' | 'weak' | 'untried' | 'thin';

export type ProblemBankConceptProfile = {
  concept: string;
  total: number;
  attempted: number;
  passed: number;
  failed: number;
  partial: number;
  unattempted: number;
  easy: number;
  medium: number;
  hard: number;
  status: ProblemBankConceptStatus;
};

export type ProblemBankLearningProfile = {
  totalProblems: number;
  attemptedProblems: number;
  wrongProblems: Array<{
    id: string;
    title: string;
    tags: string[];
    difficulty: NotebookProblemClientRecord['difficulty'];
    status: NonNullable<NotebookProblemClientRecord['latestAttempt']>['status'];
  }>;
  masteredConcepts: string[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  missingConcepts: string[];
  concepts: ProblemBankConceptProfile[];
};

export type ProblemBankReadiness = {
  ready: boolean;
  requiredProblemCount: number;
  currentProblemCount: number;
  missingConcepts: string[];
  thinConcepts: string[];
  reasons: string[];
};

function normalizeConcept(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function getProblemConcepts(problem: NotebookProblemClientRecord): string[] {
  const tags = problem.tags.map(normalizeConcept).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return [normalizeConcept(problem.title)];
}

function emptyConcept(concept: string): ProblemBankConceptProfile {
  return {
    concept,
    total: 0,
    attempted: 0,
    passed: 0,
    failed: 0,
    partial: 0,
    unattempted: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    status: 'thin',
  };
}

function finalizeConcept(profile: ProblemBankConceptProfile): ProblemBankConceptProfile {
  const weakCount = profile.failed + profile.partial;
  let status: ProblemBankConceptStatus = 'thin';
  if (profile.total < 2 || profile.hard === 0) {
    status = 'thin';
  }
  if (profile.attempted === 0) {
    status = 'untried';
  }
  if (weakCount > 0) {
    status = 'weak';
  }
  if (profile.total >= 2 && profile.attempted > 0 && weakCount === 0 && profile.passed >= 2) {
    status = 'mastered';
  }
  return { ...profile, status };
}

export function deriveProblemBankLearningProfile(args: {
  problems: NotebookProblemClientRecord[];
  expectedConcepts?: string[];
}): ProblemBankLearningProfile {
  const conceptMap = new Map<string, ProblemBankConceptProfile>();
  const wrongProblems: ProblemBankLearningProfile['wrongProblems'] = [];

  for (const problem of args.problems.filter((item) => item.status !== 'archived')) {
    const concepts = getProblemConcepts(problem);
    const latestStatus = problem.latestAttempt?.status ?? null;
    if (latestStatus === 'failed' || latestStatus === 'partial' || latestStatus === 'error') {
      wrongProblems.push({
        id: problem.id,
        title: problem.title,
        tags: concepts,
        difficulty: problem.difficulty,
        status: latestStatus,
      });
    }

    for (const concept of concepts) {
      const current = conceptMap.get(concept) ?? emptyConcept(concept);
      current.total += 1;
      current[problem.difficulty] += 1;
      if (!latestStatus) {
        current.unattempted += 1;
      } else {
        current.attempted += 1;
        if (latestStatus === 'passed') current.passed += 1;
        if (latestStatus === 'failed' || latestStatus === 'error') current.failed += 1;
        if (latestStatus === 'partial') current.partial += 1;
      }
      conceptMap.set(concept, current);
    }
  }

  const concepts = Array.from(conceptMap.values())
    .map(finalizeConcept)
    .sort((a, b) => b.total - a.total || a.concept.localeCompare(b.concept));
  const conceptNames = new Set(concepts.map((item) => item.concept));
  const missingConcepts = Array.from(new Set((args.expectedConcepts ?? []).map(normalizeConcept)))
    .filter(Boolean)
    .filter((concept) => !conceptNames.has(concept))
    .slice(0, 12);

  return {
    totalProblems: args.problems.length,
    attemptedProblems: args.problems.filter((problem) => Boolean(problem.latestAttempt)).length,
    wrongProblems: wrongProblems.slice(0, 12),
    masteredConcepts: concepts
      .filter((item) => item.status === 'mastered')
      .map((item) => item.concept)
      .slice(0, 12),
    weakConcepts: concepts
      .filter((item) => item.status === 'weak')
      .map((item) => item.concept)
      .slice(0, 12),
    untriedConcepts: concepts
      .filter((item) => item.status === 'untried')
      .map((item) => item.concept)
      .slice(0, 12),
    thinConcepts: concepts
      .filter((item) => item.status === 'thin')
      .map((item) => item.concept)
      .slice(0, 12),
    missingConcepts,
    concepts: concepts.slice(0, 24),
  };
}

export function assessProblemBankReadiness(args: {
  profile: ProblemBankLearningProfile | null;
  expectedConcepts: string[];
}): ProblemBankReadiness {
  const expectedConceptCount = Math.max(1, args.expectedConcepts.length);
  const requiredProblemCount = Math.max(8, Math.min(36, expectedConceptCount * 2));
  if (!args.profile) {
    return {
      ready: false,
      requiredProblemCount,
      currentProblemCount: 0,
      missingConcepts: args.expectedConcepts.slice(0, 8),
      thinConcepts: [],
      reasons: ['题库状态还没有读取完成'],
    };
  }

  const missingConcepts = args.profile.missingConcepts.slice(0, 8);
  const thinConcepts = args.profile.thinConcepts.slice(0, 8);
  const reasons: string[] = [];
  if (args.profile.totalProblems < requiredProblemCount) {
    reasons.push(
      `题库至少需要 ${requiredProblemCount} 道题，目前只有 ${args.profile.totalProblems} 道`,
    );
  }
  if (missingConcepts.length > 0) {
    reasons.push(`这些专题还没有题：${missingConcepts.join('、')}`);
  }
  if (thinConcepts.length > 0) {
    reasons.push(`这些专题题量偏薄：${thinConcepts.join('、')}`);
  }

  return {
    ready: reasons.length === 0,
    requiredProblemCount,
    currentProblemCount: args.profile.totalProblems,
    missingConcepts,
    thinConcepts,
    reasons,
  };
}
