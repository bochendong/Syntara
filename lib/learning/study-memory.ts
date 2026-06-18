'use client';

import type { AppNotification } from '@/lib/notifications/types';
import type { QuizQuestion } from '@/lib/types/stage';
import type { LearningRunStats } from '@/lib/learning/quiz-roguelike';
import { getDefaultNotebookPublicMemories } from '@/lib/learning/default-public-memories';

const MEMORY_PREFIX = 'synatra-study-memory-v1';
const MAX_ITEMS = 80;
const MAX_NOTEBOOK_MEMORY_TEXT = 2400;
export const STUDY_MEMORY_UPDATED_EVENT = 'synatra-study-memory-updated';
export const STUDY_MEMORY_OPEN_EVENT = 'synatra-study-memory-open';

export type StudyMemoryScope = 'public' | 'private';
export type StudyMemoryKind = 'knowledge_gap' | 'mistake' | 'preference' | 'reflection' | 'manual';
export type StudyMemoryStatus = 'active' | 'archived';

export interface NotebookMemorySourceReference {
  notebookId?: string;
  notebookName?: string;
  order: number;
  title: string;
  why?: string;
}

export interface NotebookMemoryItem {
  id: string;
  scope: StudyMemoryScope;
  kind?: StudyMemoryKind;
  status?: StudyMemoryStatus;
  source: 'chat' | 'quiz' | 'manual' | 'notebook_generation';
  stageId: string;
  title: string;
  text: string;
  reason?: string;
  question?: string;
  sourceReferences?: NotebookMemorySourceReference[];
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WeakPointMemory {
  id: string;
  sceneId: string;
  questionId: string;
  title: string;
  reason: string;
  status: 'open' | 'reviewed';
  createdAt: number;
  reviewedAt?: number;
}

export interface NotebookWorkingMemory {
  source: 'chat_turn' | 'problem_attempt' | 'manual';
  title: string;
  summary: string;
  currentTask?: string;
  stuckPoint?: string;
  masteredSignal?: string;
  nextTeachingMove?: string;
  recentAttempt?: {
    problemId: string;
    problemTitle: string;
    status: string;
    score?: number | null;
    feedback?: string;
  };
  evidence?: Array<{
    type: 'student_message' | 'assistant_reply' | 'problem_attempt';
    label: string;
    text?: string;
  }>;
  updatedAt: number;
}

type NotebookWorkingMemoryEvidence = NonNullable<NotebookWorkingMemory['evidence']>[number];

export interface StudyMemoryProfile {
  userId: string;
  stageId: string;
  quizAttempts: number;
  quizCorrect: number;
  reviewCount: number;
  lastTouchedAt: number;
  lastStuckPoint?: string;
  workingMemory?: NotebookWorkingMemory;
  weakPoints: WeakPointMemory[];
  rememberedQuestions: Array<{ id: string; text: string; createdAt: number }>;
  publicMemories: NotebookMemoryItem[];
  privateMemories: NotebookMemoryItem[];
}

export interface RecordQuizMemoryArgs {
  userId: string;
  stageId: string;
  sceneId: string;
  questions: QuizQuestion[];
  results: Array<{ questionId: string; status: 'correct' | 'incorrect'; aiComment?: string }>;
  mistakeRadar: boolean;
}

function storageKey(userId: string, stageId: string): string {
  return `${MEMORY_PREFIX}:${stageId}:${userId}`;
}

function emitStudyMemoryUpdated(stageId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STUDY_MEMORY_UPDATED_EVENT, { detail: { stageId } }));
}

function emptyProfile(userId: string, stageId: string): StudyMemoryProfile {
  return {
    userId,
    stageId,
    quizAttempts: 0,
    quizCorrect: 0,
    reviewCount: 0,
    lastTouchedAt: Date.now(),
    weakPoints: [],
    rememberedQuestions: [],
    publicMemories: [],
    privateMemories: [],
  };
}

function withDefaultPublicMemories(profile: StudyMemoryProfile): StudyMemoryProfile {
  const defaultPublicMemories = getDefaultNotebookPublicMemories(profile.stageId);
  if (defaultPublicMemories.length === 0) return profile;
  const existingFingerprints = new Set(
    profile.publicMemories.map((item) => memoryFingerprint(`${item.title}\n${item.text}`)),
  );
  const missingDefaults = defaultPublicMemories.filter(
    (item) => !existingFingerprints.has(memoryFingerprint(`${item.title}\n${item.text}`)),
  );
  if (missingDefaults.length === 0) return profile;
  return {
    ...profile,
    publicMemories: [...missingDefaults, ...profile.publicMemories].slice(0, MAX_ITEMS),
  };
}

function normalizeWorkingMemory(input: unknown): NotebookWorkingMemory | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Partial<NotebookWorkingMemory>;
  const source =
    record.source === 'chat_turn' ||
    record.source === 'problem_attempt' ||
    record.source === 'manual'
      ? record.source
      : 'manual';
  const title = normalizeMemoryText(String(record.title || ''), 120);
  const summary = normalizeMemoryText(String(record.summary || ''), 1200);
  const updatedAt = Number(record.updatedAt);
  if (!title || !summary || !Number.isFinite(updatedAt)) return undefined;
  const recentAttempt =
    record.recentAttempt &&
    typeof record.recentAttempt === 'object' &&
    typeof record.recentAttempt.problemId === 'string' &&
    typeof record.recentAttempt.problemTitle === 'string' &&
    typeof record.recentAttempt.status === 'string'
      ? {
          problemId: record.recentAttempt.problemId,
          problemTitle: normalizeMemoryText(record.recentAttempt.problemTitle, 160),
          status: record.recentAttempt.status,
          score: record.recentAttempt.score ?? null,
          feedback: record.recentAttempt.feedback
            ? normalizeMemoryText(record.recentAttempt.feedback, 600)
            : undefined,
        }
      : undefined;
  const evidence = Array.isArray(record.evidence)
    ? record.evidence
        .map((item) => {
          const typed = item as NotebookWorkingMemoryEvidence;
          const type =
            typed?.type === 'assistant_reply' ||
            typed?.type === 'problem_attempt' ||
            typed?.type === 'student_message'
              ? typed.type
              : 'student_message';
          const label = normalizeMemoryText(String(typed?.label || ''), 80);
          if (!label) return null;
          return {
            type,
            label,
            text: typed?.text ? normalizeMemoryText(typed.text, 600) : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 6)
    : undefined;

  return {
    source,
    title,
    summary,
    currentTask: record.currentTask ? normalizeMemoryText(record.currentTask, 200) : undefined,
    stuckPoint: record.stuckPoint ? normalizeMemoryText(record.stuckPoint, 300) : undefined,
    masteredSignal: record.masteredSignal
      ? normalizeMemoryText(record.masteredSignal, 300)
      : undefined,
    nextTeachingMove: record.nextTeachingMove
      ? normalizeMemoryText(record.nextTeachingMove, 300)
      : undefined,
    recentAttempt,
    evidence,
    updatedAt,
  };
}

export function loadStudyMemory(userId: string, stageId: string): StudyMemoryProfile {
  if (typeof window === 'undefined' || !userId || !stageId) {
    return withDefaultPublicMemories(emptyProfile(userId, stageId));
  }
  try {
    const raw = localStorage.getItem(storageKey(userId, stageId));
    if (!raw) return withDefaultPublicMemories(emptyProfile(userId, stageId));
    const parsed = JSON.parse(raw) as StudyMemoryProfile;
    if (!parsed || typeof parsed !== 'object') {
      return withDefaultPublicMemories(emptyProfile(userId, stageId));
    }
    return withDefaultPublicMemories({
      ...emptyProfile(userId, stageId),
      ...parsed,
      workingMemory: normalizeWorkingMemory(parsed.workingMemory),
      weakPoints: Array.isArray(parsed.weakPoints) ? parsed.weakPoints.slice(0, MAX_ITEMS) : [],
      rememberedQuestions: Array.isArray(parsed.rememberedQuestions)
        ? parsed.rememberedQuestions.slice(0, MAX_ITEMS)
        : [],
      publicMemories: Array.isArray(parsed.publicMemories)
        ? parsed.publicMemories.slice(0, MAX_ITEMS).map(normalizeNotebookMemoryItem)
        : [],
      privateMemories: Array.isArray(parsed.privateMemories)
        ? parsed.privateMemories.slice(0, MAX_ITEMS).map(normalizeNotebookMemoryItem)
        : [],
    });
  } catch {
    return withDefaultPublicMemories(emptyProfile(userId, stageId));
  }
}

export function saveStudyMemory(profile: StudyMemoryProfile): void {
  if (typeof window === 'undefined' || !profile.userId || !profile.stageId) return;
  try {
    localStorage.setItem(
      storageKey(profile.userId, profile.stageId),
      JSON.stringify({
        ...profile,
        workingMemory: profile.workingMemory,
        weakPoints: profile.weakPoints.slice(0, MAX_ITEMS),
        rememberedQuestions: profile.rememberedQuestions.slice(0, MAX_ITEMS),
        publicMemories: profile.publicMemories.slice(0, MAX_ITEMS),
        privateMemories: profile.privateMemories.slice(0, MAX_ITEMS),
      }),
    );
  } catch {
    // local-first memory should never block studying
  }
}

export function updateNotebookWorkingMemory(args: {
  userId?: string;
  stageId: string;
  memory: Omit<NotebookWorkingMemory, 'updatedAt'> & { updatedAt?: number };
}): { profile: StudyMemoryProfile; memory: NotebookWorkingMemory } {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const previous = loadStudyMemory(userId, args.stageId);
  const now = args.memory.updatedAt || Date.now();
  const memory = normalizeWorkingMemory({
    ...args.memory,
    updatedAt: now,
  });
  if (!memory) {
    return {
      profile: previous,
      memory: previous.workingMemory || {
        source: 'manual',
        title: '短期学习状态',
        summary: '暂无可写入的短期学习状态。',
        updatedAt: now,
      },
    };
  }
  const profile: StudyMemoryProfile = {
    ...previous,
    lastTouchedAt: now,
    lastStuckPoint: memory.stuckPoint || previous.lastStuckPoint,
    workingMemory: memory,
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return { profile, memory };
}

export function clearStudyMemory(stageId: string, userId = getLocalStudyMemoryUserId()): void {
  if (typeof window === 'undefined' || !userId || !stageId) return;
  try {
    localStorage.removeItem(storageKey(userId, stageId));
    emitStudyMemoryUpdated(stageId);
  } catch {
    // local-first cleanup should never block deletion
  }
}

function normalizeMemoryText(input: string, maxLength = MAX_NOTEBOOK_MEMORY_TEXT): string {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function normalizeMemoryReference(
  reference: NotebookMemorySourceReference,
): NotebookMemorySourceReference | null {
  const order = Number(reference.order);
  const title = normalizeMemoryText(String(reference.title || ''), 120);
  if (!Number.isFinite(order) || order <= 0 || !title) return null;
  return {
    notebookId: reference.notebookId ? normalizeMemoryText(reference.notebookId, 120) : undefined,
    notebookName: reference.notebookName
      ? normalizeMemoryText(reference.notebookName, 120)
      : undefined,
    order,
    title,
    why: reference.why ? normalizeMemoryText(reference.why, 180) : undefined,
  };
}

function normalizeNotebookMemoryItem(item: NotebookMemoryItem): NotebookMemoryItem {
  const kind: StudyMemoryKind =
    item.kind === 'mistake' ||
    item.kind === 'preference' ||
    item.kind === 'reflection' ||
    item.kind === 'manual' ||
    item.kind === 'knowledge_gap'
      ? item.kind
      : item.source === 'quiz'
        ? 'mistake'
        : item.source === 'manual'
          ? 'manual'
          : 'knowledge_gap';
  const status: StudyMemoryStatus = item.status === 'archived' ? 'archived' : 'active';
  const sourceReferences = Array.isArray(item.sourceReferences)
    ? item.sourceReferences
        .map((reference) => normalizeMemoryReference(reference))
        .filter((reference): reference is NotebookMemorySourceReference => Boolean(reference))
        .slice(0, item.scope === 'public' ? 12 : 6)
    : undefined;
  return {
    ...item,
    kind,
    status,
    sourceReferences,
  };
}

function memoryFingerprint(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[，。！？、,.!?;；:："'“”‘’`]/g, '')
    .trim()
    .slice(0, 180);
}

function buildMemoryId(scope: StudyMemoryScope): string {
  return `${scope}-memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getLocalStudyMemoryUserId(): string {
  if (typeof window === 'undefined') return 'user-anonymous';
  try {
    const raw = localStorage.getItem('synatra-auth');
    const parsed = raw ? (JSON.parse(raw) as { state?: { userId?: unknown } }) : null;
    const userId = typeof parsed?.state?.userId === 'string' ? parsed.state.userId.trim() : '';
    return userId || 'user-anonymous';
  } catch {
    return 'user-anonymous';
  }
}

export function recordNotebookPrivateMemory(args: {
  userId?: string;
  stageId: string;
  title: string;
  text: string;
  reason?: string;
  question?: string;
  kind?: StudyMemoryKind;
  sourceReferences?: NotebookMemorySourceReference[];
  source?: NotebookMemoryItem['source'];
}): { profile: StudyMemoryProfile; item: NotebookMemoryItem | null; created: boolean } {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const title = normalizeMemoryText(args.title, 80) || '聊天里发现的学习补充点';
  const text = normalizeMemoryText(args.text);
  const reason = args.reason ? normalizeMemoryText(args.reason, 180) : undefined;
  const question = args.question ? normalizeMemoryText(args.question, 220) : undefined;
  const previous = loadStudyMemory(userId, args.stageId);

  if (!text) {
    return { profile: previous, item: null, created: false };
  }

  const fingerprint = memoryFingerprint(`${title}\n${text}`);
  const existing = previous.privateMemories.find(
    (item) => memoryFingerprint(`${item.title}\n${item.text}`) === fingerprint,
  );
  if (existing) {
    return { profile: previous, item: existing, created: false };
  }

  const now = Date.now();
  const item: NotebookMemoryItem = {
    id: buildMemoryId('private'),
    scope: 'private',
    kind: args.kind ?? 'knowledge_gap',
    status: 'active',
    source: args.source ?? 'chat',
    stageId: args.stageId,
    title,
    text,
    reason,
    question,
    sourceReferences: (args.sourceReferences || [])
      .map((reference) => normalizeMemoryReference(reference))
      .filter((reference): reference is NotebookMemorySourceReference => Boolean(reference))
      .slice(0, 6),
    createdAt: now,
    updatedAt: now,
  };
  const profile: StudyMemoryProfile = {
    ...previous,
    lastTouchedAt: now,
    privateMemories: [item, ...previous.privateMemories].slice(0, MAX_ITEMS),
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return { profile, item, created: true };
}

export function recordNotebookPublicMemory(args: {
  userId?: string;
  stageId: string;
  title: string;
  text: string;
  reason?: string;
  kind?: StudyMemoryKind;
  sourceReferences?: NotebookMemorySourceReference[];
  source?: NotebookMemoryItem['source'];
}): { profile: StudyMemoryProfile; item: NotebookMemoryItem | null; created: boolean } {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const title = normalizeMemoryText(args.title, 100) || '涉及知识点与讲解重点';
  const text = normalizeMemoryText(args.text, 12000);
  const reason = args.reason ? normalizeMemoryText(args.reason, 180) : undefined;
  const previous = loadStudyMemory(userId, args.stageId);

  if (!text) {
    return { profile: previous, item: null, created: false };
  }

  const fingerprint = memoryFingerprint(`${title}\n${text}`);
  const existing = previous.publicMemories.find(
    (item) => memoryFingerprint(`${item.title}\n${item.text}`) === fingerprint,
  );
  if (existing) {
    return { profile: previous, item: existing, created: false };
  }

  const now = Date.now();
  const item: NotebookMemoryItem = {
    id: buildMemoryId('public'),
    scope: 'public',
    kind: args.kind ?? 'manual',
    status: 'active',
    source: args.source ?? 'manual',
    stageId: args.stageId,
    title,
    text,
    reason,
    sourceReferences: (args.sourceReferences || [])
      .map((reference) => normalizeMemoryReference(reference))
      .filter((reference): reference is NotebookMemorySourceReference => Boolean(reference))
      .slice(0, 12),
    createdAt: now,
    updatedAt: now,
  };
  const profile: StudyMemoryProfile = {
    ...previous,
    lastTouchedAt: now,
    publicMemories: [item, ...previous.publicMemories].slice(0, MAX_ITEMS),
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return { profile, item, created: true };
}

export function listNotebookPrivateMemories(args: {
  userId?: string;
  stageId: string;
  includeArchived?: boolean;
  limit?: number;
}): NotebookMemoryItem[] {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const limit = Math.max(1, Math.min(args.limit ?? MAX_ITEMS, MAX_ITEMS));
  return loadStudyMemory(userId, args.stageId)
    .privateMemories.filter((item) => args.includeArchived || item.status !== 'archived')
    .sort(
      (a, b) =>
        (b.lastUsedAt || b.updatedAt || b.createdAt) - (a.lastUsedAt || a.updatedAt || a.createdAt),
    )
    .slice(0, limit);
}

export function updateNotebookPrivateMemoryStatus(args: {
  userId?: string;
  stageId: string;
  memoryId: string;
  status: StudyMemoryStatus;
}): StudyMemoryProfile {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const previous = loadStudyMemory(userId, args.stageId);
  const now = Date.now();
  const profile: StudyMemoryProfile = {
    ...previous,
    lastTouchedAt: now,
    privateMemories: previous.privateMemories.map((item) =>
      item.id === args.memoryId ? { ...item, status: args.status, updatedAt: now } : item,
    ),
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return profile;
}

export function deleteNotebookPrivateMemory(args: {
  userId?: string;
  stageId: string;
  memoryId: string;
}): StudyMemoryProfile {
  const userId = args.userId?.trim() || getLocalStudyMemoryUserId();
  const previous = loadStudyMemory(userId, args.stageId);
  const now = Date.now();
  const profile: StudyMemoryProfile = {
    ...previous,
    lastTouchedAt: now,
    privateMemories: previous.privateMemories.filter((item) => item.id !== args.memoryId),
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return profile;
}

export function getLearningRunStats(userId: string, stageId: string): LearningRunStats {
  const profile = loadStudyMemory(userId, stageId);
  return {
    attempts: profile.quizAttempts,
    correct: profile.quizCorrect,
    reviews: profile.reviewCount,
  };
}

function inferMistakeReason(question: QuizQuestion, aiComment?: string): string {
  if (aiComment?.trim()) return aiComment.trim().slice(0, 80);
  if (
    question.type === 'single' ||
    question.type === 'multiple' ||
    question.type === 'multiple_choice'
  ) {
    return '选择题判断不稳，先复盘题干关键词和被排除选项。';
  }
  if (question.type === 'proof') return '证明链条还不够完整，需要补一遍关键条件。';
  if (question.type === 'code') return '代码题没有全部通过，建议先看失败用例。';
  return '这道题暂时没有拿稳，适合放进下一次复习。';
}

export function recordQuizMemory(args: RecordQuizMemoryArgs): {
  profile: StudyMemoryProfile;
  newWeakPoints: WeakPointMemory[];
} {
  const previous = loadStudyMemory(args.userId, args.stageId);
  const questionById = new Map(args.questions.map((question) => [question.id, question]));
  const now = Date.now();
  const newWeakPoints: WeakPointMemory[] = [];
  const existingIds = new Set(previous.weakPoints.map((item) => item.id));
  const correctCount = args.results.filter((item) => item.status === 'correct').length;

  for (const result of args.results) {
    if (result.status !== 'incorrect') continue;
    const question = questionById.get(result.questionId);
    if (!question) continue;
    const id = `${args.sceneId}:${question.id}`;
    const weakPoint: WeakPointMemory = {
      id,
      sceneId: args.sceneId,
      questionId: question.id,
      title: question.question.replace(/\s+/g, ' ').slice(0, 72),
      reason: args.mistakeRadar
        ? inferMistakeReason(question, result.aiComment)
        : '这题我先帮你记下来了，下次回来补稳。',
      status: 'open',
      createdAt: now,
    };
    if (!existingIds.has(id)) {
      newWeakPoints.push(weakPoint);
    }
  }

  const reviewedIds = new Set(
    args.results
      .filter((item) => item.status === 'correct')
      .map((item) => `${args.sceneId}:${item.questionId}`),
  );
  const weakPoints = [
    ...newWeakPoints,
    ...previous.weakPoints.map((item) =>
      reviewedIds.has(item.id) && item.status !== 'reviewed'
        ? { ...item, status: 'reviewed' as const, reviewedAt: now }
        : item,
    ),
  ].slice(0, MAX_ITEMS);

  const profile: StudyMemoryProfile = {
    ...previous,
    quizAttempts: previous.quizAttempts + args.results.length,
    quizCorrect: previous.quizCorrect + correctCount,
    reviewCount:
      previous.reviewCount +
      previous.weakPoints.filter((item) => item.status !== 'reviewed' && reviewedIds.has(item.id))
        .length,
    lastTouchedAt: now,
    lastStuckPoint: newWeakPoints[0]?.title || previous.lastStuckPoint,
    weakPoints,
  };
  saveStudyMemory(profile);
  emitStudyMemoryUpdated(args.stageId);
  return { profile, newWeakPoints };
}

export function buildStudyCompanionNotification(args: {
  id: string;
  sourceKind:
    | 'study_nudge'
    | 'mistake_review'
    | 'question_memory'
    | 'route_unlock'
    | 'notebook_ready';
  title: string;
  body: string;
  amountLabel?: string;
  sourceLabel?: string;
  details?: AppNotification['details'];
}): AppNotification {
  return {
    id: args.id,
    kind: 'study_nudge',
    title: args.title,
    body: args.body,
    tone: 'positive',
    presentation: 'banner',
    amountLabel: args.amountLabel ?? '记下啦',
    delta: 0,
    balanceAfter: 0,
    accountType: 'PURCHASE',
    sourceKind: args.sourceKind,
    sourceLabel: args.sourceLabel ?? '学习陪伴',
    createdAt: new Date().toISOString(),
    details: args.details ?? [],
    showBalance: false,
  };
}

export function buildMistakeMemoryLine(weakPoint: WeakPointMemory): string {
  const title = weakPoint.title || '这道题';
  return `刚才「${title}」这里我帮你记下来了。不是你不行，是这个小结还没贴牢，等下我会把它放进复习路线里。`;
}

export function buildReturnNudgeLine(profile: StudyMemoryProfile): string {
  const point =
    profile.lastStuckPoint || profile.weakPoints.find((item) => item.status === 'open')?.title;
  if (point) {
    return `上次「${point}」那里你停了一下，我悄悄记在小本本上啦。今天不用重刷整节课，先陪我补 3 道小题，好不好？`;
  }
  return '今天先打一小关就好，我会在旁边帮你记住哪里稳、哪里还要再揉一揉。';
}
