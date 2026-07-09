import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptStatus,
} from '@/lib/problem-bank';
import type { PracticeAttemptStatus, PracticePlan } from '@/lib/learning/course-learner-state';

const PRACTICE_SESSION_KEY_PREFIX = 'syntara:practice-session:v1';
const PRACTICE_SESSION_INDEX_KEY_PREFIX = 'syntara:practice-session-index:v1';

export type PracticeSessionStatus = 'active' | 'paused' | 'completed';

export type PracticeSessionProblemStatus =
  | 'not_started'
  | 'draft'
  | 'stuck'
  | 'passed'
  | 'partial'
  | 'failed';

export type PracticeSessionProblemState = {
  problemId: string;
  status: PracticeSessionProblemStatus;
  answer?: NotebookProblemAttemptAnswer | null;
  attemptCount: number;
  latestAttemptStatus?: PracticeAttemptStatus;
  latestScore?: number | null;
  latestFeedback?: string;
  stuck: boolean;
  helpCount: number;
  aiHelpSessionId?: string;
  aiHelpRequestedAt?: number;
  updatedAt: number;
};

export type PracticeSession = {
  version: 1;
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  planId: string;
  planTitle: string;
  problemIds: string[];
  currentProblemId?: string;
  status: PracticeSessionStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  problemStates: Record<string, PracticeSessionProblemState>;
};

export type PracticeSessionSummary = {
  total: number;
  attempted: number;
  completed: number;
  correct: number;
  partial: number;
  failed: number;
  stuck: number;
  draft: number;
  currentProblemId?: string;
  actionLabel: string;
  meta: string;
};

function now() {
  return Date.now();
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function sessionKey(sessionId: string): string {
  return `${PRACTICE_SESSION_KEY_PREFIX}:${sessionId}`;
}

function sessionIndexKey(userId: string): string {
  return `${PRACTICE_SESSION_INDEX_KEY_PREFIX}:${userId || 'anonymous'}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readSessionIndex(userId: string): string[] {
  if (!storageAvailable()) return [];
  return safeJsonParse<string[]>(window.localStorage.getItem(sessionIndexKey(userId))) || [];
}

function writeSessionIndex(userId: string, ids: string[]) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(
    sessionIndexKey(userId),
    JSON.stringify(Array.from(new Set(ids)).slice(0, 120)),
  );
}

function answerHasContent(answer: NotebookProblemAttemptAnswer | null | undefined): boolean {
  if (!answer) return false;
  if (typeof answer.text === 'string' && answer.text.trim()) return true;
  if (Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0) return true;
  if (answer.blanks && Object.values(answer.blanks).some((value) => value.trim())) return true;
  if (typeof answer.code === 'string' && answer.code.trim()) return true;
  if (Array.isArray(answer.images) && answer.images.length > 0) return true;
  return false;
}

function problemStatusFromAttempt(status: PracticeAttemptStatus): PracticeSessionProblemStatus {
  if (status === 'passed') return 'passed';
  if (status === 'partial') return 'partial';
  return 'failed';
}

function normalizeAttemptStatus(status: NotebookProblemAttemptStatus): PracticeAttemptStatus {
  if (status === 'passed') return 'passed';
  if (status === 'partial') return 'partial';
  return 'failed';
}

function defaultProblemState(problemId: string, timestamp = now()): PracticeSessionProblemState {
  return {
    problemId,
    status: 'not_started',
    attemptCount: 0,
    stuck: false,
    helpCount: 0,
    updatedAt: timestamp,
  };
}

function normalizeProblemState(
  state: PracticeSessionProblemState | undefined,
  problemId: string,
  timestamp = now(),
): PracticeSessionProblemState {
  if (!state) return defaultProblemState(problemId, timestamp);
  const aiHelpSessionId =
    typeof state.aiHelpSessionId === 'string' && state.aiHelpSessionId.trim()
      ? state.aiHelpSessionId.trim()
      : undefined;
  return {
    ...defaultProblemState(problemId, timestamp),
    ...state,
    problemId,
    aiHelpSessionId,
    aiHelpRequestedAt:
      typeof state.aiHelpRequestedAt === 'number' ? state.aiHelpRequestedAt : undefined,
  };
}

function isPracticeSession(value: unknown): value is PracticeSession {
  const record = value as Partial<PracticeSession>;
  return (
    record?.version === 1 &&
    typeof record.id === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.courseId === 'string' &&
    typeof record.planId === 'string' &&
    Array.isArray(record.problemIds) &&
    typeof record.problemStates === 'object' &&
    record.problemStates !== null
  );
}

export function practiceSessionIdForPlan(planId: string): string {
  return `ps_${planId}`;
}

export function loadPracticeSession(sessionId: string): PracticeSession | null {
  if (!storageAvailable() || !sessionId) return null;
  const parsed = safeJsonParse<PracticeSession>(window.localStorage.getItem(sessionKey(sessionId)));
  return isPracticeSession(parsed) ? parsed : null;
}

export function savePracticeSession(session: PracticeSession): PracticeSession {
  const timestamp = now();
  const next: PracticeSession = {
    ...session,
    status:
      session.status === 'completed' ||
      (session.problemIds.length > 0 &&
        session.problemIds.every(
          (problemId) => session.problemStates[problemId]?.latestAttemptStatus === 'passed',
        ))
        ? 'completed'
        : session.status,
    updatedAt: timestamp,
  };
  if (next.status === 'completed' && !next.completedAt) {
    next.completedAt = timestamp;
  }
  if (storageAvailable()) {
    window.localStorage.setItem(sessionKey(next.id), JSON.stringify(next));
    writeSessionIndex(next.userId, [next.id, ...readSessionIndex(next.userId)]);
  }
  return next;
}

export function listPracticeSessions(userId: string, courseId?: string): PracticeSession[] {
  return readSessionIndex(userId)
    .map((sessionId) => loadPracticeSession(sessionId))
    .filter((session): session is PracticeSession => Boolean(session))
    .filter((session) => !courseId || session.courseId === courseId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deletePracticeSession(sessionId: string, userId?: string): void {
  if (!storageAvailable() || !sessionId) return;
  const session = loadPracticeSession(sessionId);
  window.localStorage.removeItem(sessionKey(sessionId));
  const ownerId = userId || session?.userId;
  if (ownerId) {
    writeSessionIndex(
      ownerId,
      readSessionIndex(ownerId).filter((id) => id !== sessionId),
    );
  }
}

export function ensurePracticeSession(args: {
  plan: PracticePlan;
  userId: string;
}): PracticeSession {
  const sessionId = practiceSessionIdForPlan(args.plan.id);
  const timestamp = now();
  const existing = loadPracticeSession(sessionId);
  const problemIds = Array.from(new Set(args.plan.problemIds));
  const problemStates = Object.fromEntries(
    problemIds.map((problemId) => [
      problemId,
      normalizeProblemState(existing?.problemStates[problemId], problemId, timestamp),
    ]),
  );
  const session: PracticeSession = existing
    ? {
        ...existing,
        userId: args.userId || existing.userId || 'anonymous',
        courseId: args.plan.courseId,
        courseName: args.plan.courseName,
        planId: args.plan.id,
        planTitle: args.plan.title,
        problemIds,
        currentProblemId:
          existing.currentProblemId && problemIds.includes(existing.currentProblemId)
            ? existing.currentProblemId
            : problemIds[0],
        status: existing.status === 'completed' ? 'completed' : 'active',
        problemStates,
      }
    : {
        version: 1,
        id: sessionId,
        userId: args.userId || 'anonymous',
        courseId: args.plan.courseId,
        courseName: args.plan.courseName,
        planId: args.plan.id,
        planTitle: args.plan.title,
        problemIds,
        currentProblemId: problemIds[0],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: timestamp,
        problemStates,
      };
  return savePracticeSession(session);
}

export function pausePracticeSession(sessionId: string): PracticeSession | null {
  const session = loadPracticeSession(sessionId);
  if (!session) return null;
  if (session.status === 'completed') return session;
  return savePracticeSession({ ...session, status: 'paused' });
}

export function updatePracticeSessionCurrentProblem(
  sessionId: string,
  problemId: string,
): PracticeSession | null {
  const session = loadPracticeSession(sessionId);
  if (!session || !session.problemIds.includes(problemId)) return session;
  return savePracticeSession({
    ...session,
    currentProblemId: problemId,
    status: session.status === 'completed' ? session.status : 'active',
  });
}

export function updatePracticeSessionAnswerDraft(
  sessionId: string,
  problemId: string,
  answer: NotebookProblemAttemptAnswer | null,
): PracticeSession | null {
  const session = loadPracticeSession(sessionId);
  if (!session || !session.problemIds.includes(problemId)) return session;
  const previous = normalizeProblemState(session.problemStates[problemId], problemId);
  const hasDraft = answerHasContent(answer);
  const status: PracticeSessionProblemStatus = previous.latestAttemptStatus
    ? problemStatusFromAttempt(previous.latestAttemptStatus)
    : previous.stuck
      ? 'stuck'
      : hasDraft
        ? 'draft'
        : 'not_started';
  return savePracticeSession({
    ...session,
    currentProblemId: problemId,
    status: session.status === 'completed' ? session.status : 'active',
    problemStates: {
      ...session.problemStates,
      [problemId]: {
        ...previous,
        answer: hasDraft ? answer : null,
        status,
        updatedAt: now(),
      },
    },
  });
}

export function recordPracticeSessionAttempt(args: {
  sessionId: string;
  problemId: string;
  status: NotebookProblemAttemptStatus;
  score?: number | null;
  feedback?: string;
}): PracticeSession | null {
  const session = loadPracticeSession(args.sessionId);
  if (!session || !session.problemIds.includes(args.problemId)) return session;
  const timestamp = now();
  const attemptStatus = normalizeAttemptStatus(args.status);
  const previous = normalizeProblemState(session.problemStates[args.problemId], args.problemId);
  return savePracticeSession({
    ...session,
    currentProblemId: args.problemId,
    status: 'active',
    problemStates: {
      ...session.problemStates,
      [args.problemId]: {
        ...previous,
        status: problemStatusFromAttempt(attemptStatus),
        attemptCount: previous.attemptCount + 1,
        latestAttemptStatus: attemptStatus,
        latestScore: args.score ?? null,
        latestFeedback: args.feedback,
        stuck: attemptStatus === 'passed' ? false : previous.stuck,
        updatedAt: timestamp,
      },
    },
  });
}

export function markPracticeSessionProblemStuck(args: {
  sessionId: string;
  problemId: string;
  stuck?: boolean;
}): PracticeSession | null {
  const session = loadPracticeSession(args.sessionId);
  if (!session || !session.problemIds.includes(args.problemId)) return session;
  const previous = normalizeProblemState(session.problemStates[args.problemId], args.problemId);
  const stuck = args.stuck ?? true;
  return savePracticeSession({
    ...session,
    currentProblemId: args.problemId,
    status: session.status === 'completed' ? session.status : 'active',
    problemStates: {
      ...session.problemStates,
      [args.problemId]: {
        ...previous,
        status: stuck
          ? 'stuck'
          : previous.latestAttemptStatus
            ? problemStatusFromAttempt(previous.latestAttemptStatus)
            : answerHasContent(previous.answer)
              ? 'draft'
              : 'not_started',
        stuck,
        helpCount: stuck ? previous.helpCount + 1 : previous.helpCount,
        updatedAt: now(),
      },
    },
  });
}

export function recordPracticeSessionProblemAiHelp(args: {
  sessionId: string;
  problemId: string;
  helpSessionId: string;
  timestamp?: number;
}): PracticeSession | null {
  const session = loadPracticeSession(args.sessionId);
  if (!session || !session.problemIds.includes(args.problemId)) return session;
  const helpSessionId = args.helpSessionId.trim();
  if (!helpSessionId) return session;
  const timestamp = args.timestamp ?? now();
  const previous = normalizeProblemState(session.problemStates[args.problemId], args.problemId);
  return savePracticeSession({
    ...session,
    currentProblemId: args.problemId,
    status: session.status === 'completed' ? session.status : 'active',
    problemStates: {
      ...session.problemStates,
      [args.problemId]: {
        ...previous,
        status: 'stuck',
        stuck: true,
        helpCount:
          previous.aiHelpSessionId === helpSessionId ? previous.helpCount : previous.helpCount + 1,
        aiHelpSessionId: helpSessionId,
        aiHelpRequestedAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

export function practiceSessionAnswers(
  session: PracticeSession | null | undefined,
): Record<string, NotebookProblemAttemptAnswer | null | undefined> {
  if (!session) return {};
  return Object.fromEntries(
    Object.entries(session.problemStates).map(([problemId, state]) => [problemId, state.answer]),
  );
}

export function practiceSessionSummary(session: PracticeSession): PracticeSessionSummary {
  const states = session.problemIds.map((problemId) =>
    normalizeProblemState(session.problemStates[problemId], problemId),
  );
  const total = session.problemIds.length;
  const correct = states.filter((state) => state.latestAttemptStatus === 'passed').length;
  const partial = states.filter((state) => state.latestAttemptStatus === 'partial').length;
  const failed = states.filter((state) => state.latestAttemptStatus === 'failed').length;
  const attempted = states.filter((state) => state.attemptCount > 0).length;
  const completed = correct + partial + failed;
  const stuck = states.filter((state) => state.stuck).length;
  const draft = states.filter(
    (state) => state.attemptCount === 0 && answerHasContent(state.answer),
  ).length;
  const actionLabel =
    attempted === 0 && draft === 0
      ? '开始做题'
      : completed >= total && total > 0
        ? failed > 0 || stuck > 0
          ? '复盘错题'
          : '查看结果'
        : '继续做题';
  const metaParts = [
    `已做 ${completed}/${total}`,
    correct > 0 ? `正确 ${correct}` : '',
    partial > 0 ? `半会 ${partial}` : '',
    failed > 0 ? `错题 ${failed}` : '',
    stuck > 0 ? `不会 ${stuck}` : '',
    draft > 0 ? `草稿 ${draft}` : '',
  ].filter(Boolean);

  return {
    total,
    attempted,
    completed,
    correct,
    partial,
    failed,
    stuck,
    draft,
    currentProblemId: session.currentProblemId,
    actionLabel,
    meta: metaParts.join(' · ') || `0/${total} 题`,
  };
}
