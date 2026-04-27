'use client';

import type { AppNotification } from '@/lib/notifications/types';
import type { QuizQuestion } from '@/lib/types/stage';
import type { LearningRunStats } from '@/lib/learning/quiz-roguelike';

const MEMORY_PREFIX = 'synatra-study-memory-v1';
const MAX_ITEMS = 80;

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

export interface StudyMemoryProfile {
  userId: string;
  stageId: string;
  quizAttempts: number;
  quizCorrect: number;
  reviewCount: number;
  lastTouchedAt: number;
  lastStuckPoint?: string;
  weakPoints: WeakPointMemory[];
  rememberedQuestions: Array<{ id: string; text: string; createdAt: number }>;
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
  };
}

export function loadStudyMemory(userId: string, stageId: string): StudyMemoryProfile {
  if (typeof window === 'undefined' || !userId || !stageId) return emptyProfile(userId, stageId);
  try {
    const raw = localStorage.getItem(storageKey(userId, stageId));
    if (!raw) return emptyProfile(userId, stageId);
    const parsed = JSON.parse(raw) as StudyMemoryProfile;
    if (!parsed || typeof parsed !== 'object') return emptyProfile(userId, stageId);
    return {
      ...emptyProfile(userId, stageId),
      ...parsed,
      weakPoints: Array.isArray(parsed.weakPoints) ? parsed.weakPoints.slice(0, MAX_ITEMS) : [],
      rememberedQuestions: Array.isArray(parsed.rememberedQuestions)
        ? parsed.rememberedQuestions.slice(0, MAX_ITEMS)
        : [],
    };
  } catch {
    return emptyProfile(userId, stageId);
  }
}

export function saveStudyMemory(profile: StudyMemoryProfile): void {
  if (typeof window === 'undefined' || !profile.userId || !profile.stageId) return;
  try {
    localStorage.setItem(
      storageKey(profile.userId, profile.stageId),
      JSON.stringify({
        ...profile,
        weakPoints: profile.weakPoints.slice(0, MAX_ITEMS),
        rememberedQuestions: profile.rememberedQuestions.slice(0, MAX_ITEMS),
      }),
    );
  } catch {
    // local-first memory should never block studying
  }
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
  return { profile, newWeakPoints };
}

export function buildStudyCompanionNotification(args: {
  id: string;
  sourceKind: 'study_nudge' | 'mistake_review' | 'question_memory' | 'route_unlock';
  title: string;
  body: string;
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
    amountLabel: '记下啦',
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
