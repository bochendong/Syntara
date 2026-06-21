import type { CourseRecord } from '@/lib/utils/database';
import type { CourseProblemClientSummary } from '@/lib/utils/notebook-problem-api';
import type { StageListItem } from '@/lib/utils/stage-storage';

const LEARNER_STATE_KEY_PREFIX = 'syntara:learner-course-state:v1';
const PRACTICE_PLAN_KEY_PREFIX = 'syntara:practice-plan:v1';
const PRACTICE_PLAN_INDEX_KEY_PREFIX = 'syntara:practice-plan-index:v1';

export type LearnerMasteryStatus = 'new' | 'learning' | 'stable' | 'weak';
export type PracticePlanMode = 'practice' | 'quiz';
export type PracticePlanStatus = 'draft' | 'active' | 'completed';
export type PracticeAttemptStatus = 'passed' | 'partial' | 'failed';

export type ConceptMastery = {
  concept: string;
  mastery: number;
  status: LearnerMasteryStatus;
  evidenceCount: number;
  lastSeenAt: number;
  lastEvidence?: string;
};

export type LearnerWeakPoint = {
  id: string;
  concept: string;
  title: string;
  evidence: string;
  source: 'chat' | 'problem' | 'manual';
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'reviewing' | 'resolved';
  createdAt: number;
  updatedAt: number;
};

export type LearnerRecentQuestion = {
  id: string;
  text: string;
  courseId: string;
  createdAt: number;
};

export type LearnerProblemAttemptSignal = {
  id: string;
  problemId: string;
  problemTitle: string;
  concepts: string[];
  status: PracticeAttemptStatus;
  score: number;
  createdAt: number;
};

export type LearnerReviewQueueItem = {
  id: string;
  concept: string;
  reason: string;
  dueAt: number;
  priority: 'low' | 'medium' | 'high';
  sourceProblemId?: string;
};

export type LearnerProgressCheckpointKind = 'not_started' | 'notebook' | 'completed_all';

export type LearnerProgressCheckpoint = {
  kind: LearnerProgressCheckpointKind;
  source: 'student';
  confirmedAt: number;
  label: string;
  notebookId?: string;
};

export type LearnerPlanningScope = LearnerProgressCheckpoint & {
  purpose: 'review_plan' | 'practice_plan';
  prompt?: string;
};

export type LearnerCourseState = {
  version: 1;
  userId: string;
  courseId: string;
  progressCheckpoint?: LearnerProgressCheckpoint;
  lastPlanningScope?: LearnerPlanningScope;
  currentUnitId?: string;
  currentNotebookId?: string;
  currentSectionLabel?: string;
  completedNotebookIds: string[];
  completedProblemIds: string[];
  activeWeakPoints: LearnerWeakPoint[];
  conceptMastery: Record<string, ConceptMastery>;
  recentQuestions: LearnerRecentQuestion[];
  recentProblemAttempts: LearnerProblemAttemptSignal[];
  reviewQueue: LearnerReviewQueueItem[];
  createdAt: number;
  updatedAt: number;
};

export type LearnerCourseSnapshot = {
  progressKnown: boolean;
  progressCheckpointKind?: LearnerProgressCheckpointKind;
  progressNotebookId?: string;
  progressLabel?: string;
  progressPercent: number;
  currentNotebook?: StageListItem;
  completedNotebookCount: number;
  totalNotebookCount: number;
  attemptedProblemCount: number;
  totalProblemCount: number;
  stableConceptCount: number;
  weakConcepts: string[];
  nextConcepts: string[];
  dueReviewCount: number;
};

export type PracticePlan = {
  version: 1;
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  mode: PracticePlanMode;
  title: string;
  targetConcepts: string[];
  problemIds: string[];
  estimatedMinutes: number;
  difficultyMix: {
    easy: number;
    medium: number;
    hard: number;
  };
  createdFrom: {
    currentNotebookId?: string;
    currentNotebookName?: string;
    weakPoints: string[];
    recentAttemptProblemIds: string[];
    prompt?: string;
  };
  status: PracticePlanStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  summary?: {
    total: number;
    passed: number;
    partial: number;
    failed: number;
    nextSuggestion: string;
  };
};

export type PracticeAttemptResult = {
  problemId: string;
  problemTitle: string;
  concepts: string[];
  status: PracticeAttemptStatus;
  score: number;
};

function now() {
  return Date.now();
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function learnerStateKey(userId: string, courseId: string): string {
  return `${LEARNER_STATE_KEY_PREFIX}:${userId || 'anonymous'}:${courseId}`;
}

function planKey(planId: string): string {
  return `${PRACTICE_PLAN_KEY_PREFIX}:${planId}`;
}

function planIndexKey(userId: string): string {
  return `${PRACTICE_PLAN_INDEX_KEY_PREFIX}:${userId || 'anonymous'}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isPracticeAttemptStatus(value: unknown): value is PracticeAttemptStatus {
  return value === 'passed' || value === 'partial' || value === 'failed';
}

function normalizeAttemptStatus(value: unknown): PracticeAttemptStatus | null {
  if (isPracticeAttemptStatus(value)) return value;
  if (value === 'error') return 'failed';
  return null;
}

function normalizeConcept(value: string | undefined | null): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeConcept(value);
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function masteryStatus(mastery: number): LearnerMasteryStatus {
  if (mastery >= 0.72) return 'stable';
  if (mastery <= 0.38) return 'weak';
  if (mastery > 0) return 'learning';
  return 'new';
}

function clampMastery(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

export function createEmptyLearnerCourseState(args: {
  userId: string;
  courseId: string;
}): LearnerCourseState {
  const timestamp = now();
  return {
    version: 1,
    userId: args.userId || 'anonymous',
    courseId: args.courseId,
    completedNotebookIds: [],
    completedProblemIds: [],
    activeWeakPoints: [],
    conceptMastery: {},
    recentQuestions: [],
    recentProblemAttempts: [],
    reviewQueue: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function loadLearnerCourseState(args: {
  userId: string;
  courseId: string;
}): LearnerCourseState {
  if (!storageAvailable()) return createEmptyLearnerCourseState(args);
  const parsed = safeJsonParse<LearnerCourseState>(
    window.localStorage.getItem(learnerStateKey(args.userId, args.courseId)),
  );
  if (!parsed || parsed.version !== 1 || parsed.courseId !== args.courseId) {
    return createEmptyLearnerCourseState(args);
  }
  return parsed;
}

export function saveLearnerCourseState(state: LearnerCourseState): LearnerCourseState {
  const next = { ...state, updatedAt: now() };
  if (storageAvailable()) {
    window.localStorage.setItem(learnerStateKey(next.userId, next.courseId), JSON.stringify(next));
  }
  return next;
}

export function isLearnerCourseState(
  value: unknown,
  courseId?: string,
): value is LearnerCourseState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LearnerCourseState>;
  return (
    record.version === 1 &&
    typeof record.userId === 'string' &&
    typeof record.courseId === 'string' &&
    (!courseId || record.courseId === courseId) &&
    Array.isArray(record.completedNotebookIds) &&
    Array.isArray(record.completedProblemIds) &&
    Array.isArray(record.activeWeakPoints) &&
    Boolean(record.conceptMastery) &&
    typeof record.conceptMastery === 'object' &&
    Array.isArray(record.recentQuestions) &&
    Array.isArray(record.recentProblemAttempts) &&
    Array.isArray(record.reviewQueue)
  );
}

export function isPracticePlan(value: unknown, planId?: string): value is PracticePlan {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PracticePlan>;
  return (
    record.version === 1 &&
    typeof record.id === 'string' &&
    (!planId || record.id === planId) &&
    typeof record.userId === 'string' &&
    typeof record.courseId === 'string' &&
    (record.mode === 'practice' || record.mode === 'quiz') &&
    Array.isArray(record.targetConcepts) &&
    Array.isArray(record.problemIds) &&
    (record.status === 'draft' || record.status === 'active' || record.status === 'completed')
  );
}

export function recordLearnerQuestion(args: {
  userId: string;
  courseId: string;
  text: string;
}): LearnerCourseState {
  const state = loadLearnerCourseState(args);
  const text = args.text.trim();
  if (!text) return state;
  return saveLearnerCourseState({
    ...state,
    recentQuestions: [
      {
        id: makeId('question'),
        text: text.slice(0, 500),
        courseId: args.courseId,
        createdAt: now(),
      },
      ...state.recentQuestions,
    ].slice(0, 24),
  });
}

export function seedLearnerCourseStateFromCourse(args: {
  userId: string;
  course: CourseRecord;
  notebooks: StageListItem[];
  problems: CourseProblemClientSummary[];
}): LearnerCourseState {
  const state = loadLearnerCourseState({ userId: args.userId, courseId: args.course.id });
  const attemptedProblems = args.problems
    .map((problem) => {
      const status = normalizeAttemptStatus(problem.latestAttempt?.status);
      if (!status) return null;
      return {
        problem,
        status,
        score:
          typeof problem.latestAttempt?.score === 'number'
            ? problem.latestAttempt.score
            : status === 'passed'
              ? 1
              : status === 'partial'
                ? 0.5
                : 0,
        createdAt: problem.latestAttempt?.createdAt ?? now(),
      };
    })
    .filter(
      (
        item,
      ): item is {
        problem: CourseProblemClientSummary;
        status: PracticeAttemptStatus;
        score: number;
        createdAt: number;
      } => Boolean(item),
    );
  const progressConfirmed = state.progressCheckpoint?.source === 'student';
  const shouldKeepCurrentNotebook =
    progressConfirmed && state.progressCheckpoint?.kind !== 'not_started';
  const currentNotebook =
    shouldKeepCurrentNotebook && state.currentNotebookId
      ? args.notebooks.find((notebook) => notebook.id === state.currentNotebookId)
      : undefined;
  const completedNotebookIds =
    progressConfirmed && state.progressCheckpoint?.kind !== 'not_started'
      ? state.completedNotebookIds
      : [];
  const conceptSeeds = uniqueStrings([
    ...args.problems.flatMap((problem) => problem.tags),
    ...args.notebooks.flatMap((notebook) => notebook.tags || []),
    ...args.course.tags,
    args.course.courseCode,
  ]);
  const conceptMastery = { ...state.conceptMastery };
  for (const concept of conceptSeeds) {
    if (conceptMastery[concept]) continue;
    conceptMastery[concept] = {
      concept,
      mastery: 0,
      status: 'new',
      evidenceCount: 0,
      lastSeenAt: state.createdAt,
    };
  }
  const completedProblemIds = Array.from(
    new Set([
      ...state.completedProblemIds,
      ...attemptedProblems
        .filter((item) => item.status === 'passed')
        .map((item) => item.problem.id),
    ]),
  );
  const existingAttemptIds = new Set(state.recentProblemAttempts.map((item) => item.problemId));
  const recentProblemAttempts: LearnerProblemAttemptSignal[] = [
    ...attemptedProblems
      .filter((item) => !existingAttemptIds.has(item.problem.id))
      .map((item) => ({
        id: makeId('attempt'),
        problemId: item.problem.id,
        problemTitle: item.problem.title,
        concepts: problemConcepts(item.problem),
        status: item.status,
        score: item.score,
        createdAt: item.createdAt,
      })),
    ...state.recentProblemAttempts,
  ].slice(0, 60);
  return saveLearnerCourseState({
    ...state,
    completedNotebookIds,
    completedProblemIds,
    recentProblemAttempts,
    currentNotebookId: shouldKeepCurrentNotebook
      ? state.currentNotebookId || currentNotebook?.id
      : undefined,
    currentUnitId: shouldKeepCurrentNotebook
      ? state.currentUnitId || currentNotebook?.id
      : undefined,
    currentSectionLabel:
      shouldKeepCurrentNotebook && currentNotebook
        ? state.currentSectionLabel || `正在学习《${currentNotebook.name}》`
        : undefined,
    conceptMastery,
  });
}

export function summarizeLearnerCourseState(args: {
  state: LearnerCourseState;
  notebooks: StageListItem[];
  problems: CourseProblemClientSummary[];
}): LearnerCourseSnapshot {
  const checkpoint = args.state.progressCheckpoint;
  const progressKnown = checkpoint?.source === 'student';
  const checkpointNotebook =
    progressKnown && checkpoint.kind === 'notebook' && checkpoint.notebookId
      ? args.notebooks.find((notebook) => notebook.id === checkpoint.notebookId)
      : undefined;
  const completedAllNotebook =
    progressKnown && checkpoint?.kind === 'completed_all'
      ? args.notebooks[args.notebooks.length - 1]
      : undefined;
  const currentNotebook = checkpointNotebook || completedAllNotebook;
  const completedNotebookCount = progressKnown
    ? checkpoint?.kind === 'completed_all'
      ? args.notebooks.length
      : checkpoint?.kind === 'notebook'
        ? args.state.completedNotebookIds.length
        : 0
    : 0;
  const totalNotebookCount = args.notebooks.length;
  const attemptedProblemIds = new Set([
    ...args.state.recentProblemAttempts.map((item) => item.problemId),
    ...args.problems
      .filter((problem) => normalizeAttemptStatus(problem.latestAttempt?.status))
      .map((problem) => problem.id),
  ]);
  const attemptedProblemCount = attemptedProblemIds.size;
  const totalProblemCount = args.problems.length;
  const conceptRows = Object.values(args.state.conceptMastery);
  const weakConcepts = uniqueStrings(
    [
      ...args.state.activeWeakPoints
        .filter((point) => point.status !== 'resolved')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((point) => point.concept),
      ...conceptRows
        .filter((row) => row.status === 'weak')
        .sort((a, b) => a.mastery - b.mastery)
        .map((row) => row.concept),
    ],
    5,
  );
  const nextConcepts = uniqueStrings(
    [
      ...(progressKnown ? currentNotebook?.tags || [] : []),
      ...(progressKnown
        ? args.problems
            .filter((problem) => problem.notebookId === currentNotebook?.id)
            .flatMap((problem) => problem.tags)
        : []),
      ...conceptRows
        .filter((row) => row.status === 'new' || row.status === 'learning')
        .sort((a, b) => a.mastery - b.mastery)
        .map((row) => row.concept),
    ],
    5,
  );
  const stableConceptCount = conceptRows.filter((row) => row.status === 'stable').length;
  const nowTs = now();
  const dueReviewCount = args.state.reviewQueue.filter((item) => item.dueAt <= nowTs).length;
  const notebookProgress = totalNotebookCount
    ? Math.round((completedNotebookCount / totalNotebookCount) * 55)
    : 0;
  const problemProgress = totalProblemCount
    ? Math.round((attemptedProblemCount / totalProblemCount) * 45)
    : 0;

  return {
    progressKnown,
    progressCheckpointKind: progressKnown ? checkpoint?.kind : undefined,
    progressNotebookId: progressKnown ? checkpoint?.notebookId : undefined,
    progressLabel: progressKnown ? checkpoint?.label : undefined,
    progressPercent: progressKnown ? Math.min(100, notebookProgress + problemProgress) : 0,
    currentNotebook,
    completedNotebookCount,
    totalNotebookCount,
    attemptedProblemCount,
    totalProblemCount,
    stableConceptCount,
    weakConcepts,
    nextConcepts,
    dueReviewCount,
  };
}

export function setLearnerProgressCheckpoint(args: {
  userId: string;
  courseId: string;
  notebooks: StageListItem[];
  kind: LearnerProgressCheckpointKind;
  notebookId?: string;
}): LearnerCourseState {
  const state = loadLearnerCourseState({ userId: args.userId, courseId: args.courseId });
  return saveLearnerCourseState(
    applyProgressCheckpointToState({
      state,
      notebooks: args.notebooks,
      kind: args.kind,
      notebookId: args.notebookId,
    }),
  );
}

export function previewLearnerProgressCheckpoint(args: {
  state: LearnerCourseState;
  notebooks: StageListItem[];
  kind: LearnerProgressCheckpointKind;
  notebookId?: string;
}): LearnerCourseState {
  return applyProgressCheckpointToState(args);
}

export function setLearnerPlanningScope(args: {
  userId: string;
  courseId: string;
  notebooks: StageListItem[];
  kind: LearnerProgressCheckpointKind;
  notebookId?: string;
  purpose: LearnerPlanningScope['purpose'];
  prompt?: string;
}): LearnerCourseState {
  const state = loadLearnerCourseState({ userId: args.userId, courseId: args.courseId });
  const scopedState = applyProgressCheckpointToState({
    state,
    notebooks: args.notebooks,
    kind: args.kind,
    notebookId: args.notebookId,
  });
  const scope = scopedState.progressCheckpoint;
  return saveLearnerCourseState({
    ...state,
    lastPlanningScope: scope
      ? {
          ...scope,
          purpose: args.purpose,
          prompt: args.prompt?.trim().slice(0, 500),
        }
      : undefined,
  });
}

function applyProgressCheckpointToState(args: {
  state: LearnerCourseState;
  notebooks: StageListItem[];
  kind: LearnerProgressCheckpointKind;
  notebookId?: string;
}): LearnerCourseState {
  const state = args.state;
  const timestamp = now();
  const courseNotebookIds = new Set(args.notebooks.map((notebook) => notebook.id));
  const notebookIndex =
    args.kind === 'notebook' && args.notebookId
      ? args.notebooks.findIndex((notebook) => notebook.id === args.notebookId)
      : -1;
  const selectedNotebook = notebookIndex >= 0 ? args.notebooks[notebookIndex] : undefined;
  const lastNotebook = args.notebooks[args.notebooks.length - 1];
  const completedNotebookIds =
    args.kind === 'completed_all'
      ? args.notebooks.map((notebook) => notebook.id)
      : selectedNotebook
        ? args.notebooks.slice(0, notebookIndex).map((notebook) => notebook.id)
        : [];
  const currentNotebook =
    args.kind === 'completed_all' ? lastNotebook : selectedNotebook ? selectedNotebook : undefined;
  const label =
    args.kind === 'completed_all'
      ? '已学完整门课'
      : selectedNotebook
        ? `正在学习《${selectedNotebook.name}》`
        : '还没开始';

  return {
    ...state,
    progressCheckpoint: {
      kind: selectedNotebook ? 'notebook' : args.kind === 'notebook' ? 'not_started' : args.kind,
      source: 'student',
      confirmedAt: timestamp,
      label,
      notebookId: selectedNotebook?.id,
    },
    currentNotebookId: currentNotebook?.id,
    currentUnitId: currentNotebook?.id,
    currentSectionLabel: label,
    completedNotebookIds: [
      ...state.completedNotebookIds.filter((id) => !courseNotebookIds.has(id)),
      ...completedNotebookIds,
    ],
  };
}

function readPlanIndex(userId: string): string[] {
  if (!storageAvailable()) return [];
  return safeJsonParse<string[]>(window.localStorage.getItem(planIndexKey(userId))) || [];
}

function writePlanIndex(userId: string, ids: string[]) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(planIndexKey(userId), JSON.stringify(Array.from(new Set(ids))));
}

export function savePracticePlan(plan: PracticePlan): PracticePlan {
  const next = { ...plan, updatedAt: now() };
  if (storageAvailable()) {
    window.localStorage.setItem(planKey(next.id), JSON.stringify(next));
    writePlanIndex(next.userId, [next.id, ...readPlanIndex(next.userId)].slice(0, 80));
  }
  return next;
}

export function deletePracticePlan(planId: string, userId: string): void {
  if (!storageAvailable() || !planId) return;
  window.localStorage.removeItem(planKey(planId));
  writePlanIndex(
    userId,
    readPlanIndex(userId).filter((id) => id !== planId),
  );
}

export function loadPracticePlan(planId: string): PracticePlan | null {
  if (!storageAvailable()) return null;
  const parsed = safeJsonParse<PracticePlan>(window.localStorage.getItem(planKey(planId)));
  return parsed?.version === 1 ? parsed : null;
}

export function listPracticePlans(userId: string, courseId?: string): PracticePlan[] {
  return readPlanIndex(userId)
    .map((id) => loadPracticePlan(id))
    .filter((plan): plan is PracticePlan => Boolean(plan))
    .filter((plan) => !courseId || plan.courseId === courseId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function problemConcepts(problem: CourseProblemClientSummary): string[] {
  return uniqueStrings(
    problem.tags.length > 0 ? problem.tags : [problem.notebookName, problem.title],
    6,
  );
}

function problemScore(args: {
  problem: CourseProblemClientSummary;
  targetConcepts: string[];
  recentProblemIds: Set<string>;
  completedProblemIds: Set<string>;
}): number {
  const concepts = problemConcepts(args.problem).map((concept) => concept.toLowerCase());
  const target = args.targetConcepts.map((concept) => concept.toLowerCase());
  let score = 0;
  for (const concept of concepts) {
    if (
      target.some((item) => item === concept || item.includes(concept) || concept.includes(item))
    ) {
      score += 8;
    }
  }
  const status = args.problem.latestAttempt?.status;
  if (status === 'failed' || status === 'partial' || status === 'error') score += 10;
  if (status === 'passed') score -= 3;
  if (args.recentProblemIds.has(args.problem.id)) score -= 5;
  if (args.completedProblemIds.has(args.problem.id)) score -= 2;
  return score;
}

export function createPracticePlan(args: {
  userId: string;
  course: CourseRecord;
  notebooks: StageListItem[];
  problems: CourseProblemClientSummary[];
  mode: PracticePlanMode;
  prompt?: string;
  targetCount?: number;
  preferredConcepts?: string[];
  preferredProblemIds?: string[];
  stateOverride?: LearnerCourseState;
}): PracticePlan | null {
  const state =
    args.stateOverride ||
    seedLearnerCourseStateFromCourse({
      userId: args.userId,
      course: args.course,
      notebooks: args.notebooks,
      problems: args.problems,
    });
  const snapshot = summarizeLearnerCourseState({
    state,
    notebooks: args.notebooks,
    problems: args.problems,
  });
  if (!snapshot.progressKnown) return null;
  const weakConcepts = uniqueStrings(
    [
      ...(args.preferredConcepts || []),
      ...snapshot.weakConcepts,
      ...snapshot.nextConcepts,
      ...args.problems.flatMap((problem) => problem.tags),
      ...args.course.tags,
    ],
    6,
  );
  const targetConcepts = weakConcepts.length > 0 ? weakConcepts : ['课程综合复习'];
  const recentProblemIds = new Set(
    state.recentProblemAttempts.slice(0, 20).map((item) => item.problemId),
  );
  const completedProblemIds = new Set(state.completedProblemIds);
  const preferredProblemIds = new Set(args.preferredProblemIds || []);
  const targetCount = args.targetCount ?? (args.mode === 'quiz' ? 10 : 8);
  const selectedProblemIds = args.problems
    .filter((problem) => problem.status !== 'archived')
    .map((problem) => ({
      problem,
      score:
        (preferredProblemIds.has(problem.id) ? 100 : 0) +
        problemScore({ problem, targetConcepts, recentProblemIds, completedProblemIds }),
    }))
    .sort((a, b) => b.score - a.score || a.problem.title.localeCompare(b.problem.title))
    .slice(0, targetCount)
    .map((item) => item.problem.id);
  const easy = Math.max(1, Math.round(targetCount * (args.mode === 'quiz' ? 0.3 : 0.38)));
  const hard = Math.max(1, Math.round(targetCount * (args.mode === 'quiz' ? 0.25 : 0.12)));
  const medium = Math.max(0, targetCount - easy - hard);
  const currentNotebook = snapshot.currentNotebook;
  const title =
    args.mode === 'quiz'
      ? `${args.course.courseCode || args.course.name} 掌握度小测`
      : `${targetConcepts.slice(0, 2).join(' + ')} 刷题计划`;

  return savePracticePlan({
    version: 1,
    id: makeId(args.mode === 'quiz' ? 'quiz' : 'practice'),
    userId: args.userId || 'anonymous',
    courseId: args.course.id,
    courseName: args.course.name,
    mode: args.mode,
    title,
    targetConcepts,
    problemIds: selectedProblemIds,
    estimatedMinutes:
      args.mode === 'quiz' ? Math.max(15, targetCount * 3) : Math.max(12, targetCount * 2),
    difficultyMix: { easy, medium, hard },
    createdFrom: {
      currentNotebookId: currentNotebook?.id,
      currentNotebookName: currentNotebook?.name,
      weakPoints: snapshot.weakConcepts,
      recentAttemptProblemIds: Array.from(recentProblemIds).slice(0, 8),
      prompt: args.prompt?.trim().slice(0, 600),
    },
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  });
}

function applyPracticeResultsToState(args: {
  state: LearnerCourseState;
  results: PracticeAttemptResult[];
  timestamp: number;
}): LearnerCourseState {
  const completedProblemIds = Array.from(
    new Set([...args.state.completedProblemIds, ...args.results.map((item) => item.problemId)]),
  );
  const resultProblemIds = new Set(args.results.map((item) => item.problemId));
  const recentProblemAttempts: LearnerProblemAttemptSignal[] = [
    ...args.results.map((item) => ({
      id: makeId('attempt'),
      problemId: item.problemId,
      problemTitle: item.problemTitle,
      concepts: uniqueStrings(item.concepts, 6),
      status: item.status,
      score: item.score,
      createdAt: args.timestamp,
    })),
    ...args.state.recentProblemAttempts.filter((item) => !resultProblemIds.has(item.problemId)),
  ].slice(0, 60);
  const conceptMastery = { ...args.state.conceptMastery };
  const activeWeakPoints = [...args.state.activeWeakPoints];
  const reviewQueue = [...args.state.reviewQueue];

  for (const result of args.results) {
    for (const concept of uniqueStrings(result.concepts, 6)) {
      const previous = conceptMastery[concept] || {
        concept,
        mastery: 0.32,
        status: 'learning' as LearnerMasteryStatus,
        evidenceCount: 0,
        lastSeenAt: args.timestamp,
      };
      const delta = result.status === 'passed' ? 0.16 : result.status === 'partial' ? 0.04 : -0.1;
      const mastery = clampMastery((previous.mastery || 0.32) + delta);
      conceptMastery[concept] = {
        ...previous,
        mastery,
        status: masteryStatus(mastery),
        evidenceCount: previous.evidenceCount + 1,
        lastSeenAt: args.timestamp,
        lastEvidence: `${result.problemTitle}：${result.status}`,
      };

      const existing = activeWeakPoints.find(
        (point) => point.concept.toLowerCase() === concept.toLowerCase(),
      );
      if (result.status === 'passed') {
        if (existing) {
          existing.evidence = `${result.problemTitle} 已掌握`;
          existing.severity = 'low';
          existing.status = 'resolved';
          existing.updatedAt = args.timestamp;
        }
        continue;
      }

      const evidence = `${result.problemTitle} 未完全掌握`;
      if (existing) {
        existing.evidence = evidence;
        existing.severity = result.status === 'failed' ? 'high' : 'medium';
        existing.status = 'open';
        existing.updatedAt = args.timestamp;
      } else {
        activeWeakPoints.unshift({
          id: makeId('weak'),
          concept,
          title: `${concept} 需要再练`,
          evidence,
          source: 'problem',
          severity: result.status === 'failed' ? 'high' : 'medium',
          status: 'open',
          createdAt: args.timestamp,
          updatedAt: args.timestamp,
        });
      }
      reviewQueue.unshift({
        id: makeId('review'),
        concept,
        reason: evidence,
        dueAt: args.timestamp + 24 * 60 * 60 * 1000,
        priority: result.status === 'failed' ? 'high' : 'medium',
        sourceProblemId: result.problemId,
      });
    }
  }

  return {
    ...args.state,
    completedProblemIds,
    recentProblemAttempts,
    activeWeakPoints: activeWeakPoints.slice(0, 30),
    conceptMastery,
    reviewQueue: reviewQueue.slice(0, 50),
  };
}

export function recordPracticeAttemptResult(args: {
  userId: string;
  courseId: string;
  result: PracticeAttemptResult;
}): LearnerCourseState {
  const state = loadLearnerCourseState({ userId: args.userId, courseId: args.courseId });
  return saveLearnerCourseState(
    applyPracticeResultsToState({
      state,
      results: [args.result],
      timestamp: now(),
    }),
  );
}

export function completePracticePlan(args: {
  userId: string;
  planId: string;
  results: PracticeAttemptResult[];
  syncResults?: boolean;
}): { plan: PracticePlan | null; state: LearnerCourseState | null } {
  const plan = loadPracticePlan(args.planId);
  if (!plan) return { plan: null, state: null };
  const state = loadLearnerCourseState({ userId: args.userId, courseId: plan.courseId });
  const timestamp = now();

  const total = args.results.length;
  const passed = args.results.filter((item) => item.status === 'passed').length;
  const partial = args.results.filter((item) => item.status === 'partial').length;
  const failed = args.results.filter((item) => item.status === 'failed').length;
  const nextSuggestion =
    failed > 0
      ? '下一轮先降低难度，只练刚才出错的概念。'
      : partial > 0
        ? '下一轮适合做少量变式题，把半会的地方压实。'
        : '这一组已经稳定，可以进入下一小节或挑战题。';
  const nextState =
    args.syncResults === false
      ? state
      : saveLearnerCourseState(
          applyPracticeResultsToState({ state, results: args.results, timestamp }),
        );
  const nextPlan = savePracticePlan({
    ...plan,
    status: 'completed',
    completedAt: timestamp,
    summary: { total, passed, partial, failed, nextSuggestion },
  });

  return { plan: nextPlan, state: nextState };
}
