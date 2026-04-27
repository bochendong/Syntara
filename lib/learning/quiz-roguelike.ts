'use client';

import type { QuizQuestion } from '@/lib/types/stage';
import type { Live2DPresenterModelId } from '@/lib/live2d/presenter-models';

export type LearningCardRarity = 'basic' | 'advanced' | 'rare';

export type LearningCardId =
  | 'cute_hint'
  | 'second_chance'
  | 'teacher_note'
  | 'steady_touch'
  | 'head_pat'
  | 'dont_fall_behind'
  | 'heartbeat_combo'
  | 'mistake_radar'
  | 'peek_rubric'
  | 'promise_reward';

export type LearningCardEffect =
  | 'hint'
  | 'mistakeShield'
  | 'eliminateOption'
  | 'nextCorrectBonus'
  | 'preserveMultiplier'
  | 'comboDouble'
  | 'mistakeRadar'
  | 'rubricPeek'
  | 'bossBonus';

export interface LearningCardDefinition {
  id: LearningCardId;
  name: string;
  rarity: LearningCardRarity;
  effect: LearningCardEffect;
  unlockAtAttempts: number;
  description: string;
  teacherLine: string;
}

export interface LearningRunStats {
  attempts: number;
  correct: number;
  reviews: number;
}

export interface LearningRunState {
  runId: string;
  hand: LearningCardId[];
  usedCards: LearningCardId[];
  mistakeShield: number;
  preserveMultiplier: boolean;
  nextCorrectBonus: number;
  comboDoubleQuestions: number;
  mistakeRadar: boolean;
  bossBonus: boolean;
  eliminatedOptions: Record<string, string[]>;
  hints: Record<string, string>;
  rubricPeeks: Record<string, string>;
  milestoneDraws: number[];
  createdAt: number;
}

export interface LearningRunSummary {
  correctCount: number;
  incorrectCount: number;
  forgivenMistakes: number;
  longestStreak: number;
  finalMultiplier: number;
  rewardPreview: number;
  unlockedCards: LearningCardDefinition[];
}

export const LEARNING_CARD_DEFINITIONS: Record<LearningCardId, LearningCardDefinition> = {
  cute_hint: {
    id: 'cute_hint',
    name: '撒娇一下',
    rarity: 'basic',
    effect: 'hint',
    unlockAtAttempts: 0,
    description: '当前题获得一个轻提示，不直接给答案。',
    teacherLine: '只给你偷偷看一点点哦，剩下的我们一起想。',
  },
  second_chance: {
    id: 'second_chance',
    name: '再想想嘛',
    rarity: 'basic',
    effect: 'mistakeShield',
    unlockAtAttempts: 0,
    description: '本局增加 1 次答错不打断奖励倍率的机会。',
    teacherLine: '这次我先帮你护住手感，别慌，继续往前。',
  },
  teacher_note: {
    id: 'teacher_note',
    name: '老师的小纸条',
    rarity: 'basic',
    effect: 'eliminateOption',
    unlockAtAttempts: 0,
    description: '选择题隐藏 1 个明显错误选项。',
    teacherLine: '这一个选项我先替你划掉啦，眼睛看这里。',
  },
  steady_touch: {
    id: 'steady_touch',
    name: '稳住手感',
    rarity: 'basic',
    effect: 'nextCorrectBonus',
    unlockAtAttempts: 0,
    description: '下一道答对时，倍率额外 +0.1。',
    teacherLine: '你现在的节奏很好，下一题答对我给你多记一点。',
  },
  head_pat: {
    id: 'head_pat',
    name: '摸摸头',
    rarity: 'basic',
    effect: 'preserveMultiplier',
    unlockAtAttempts: 0,
    description: '下一次答错时，保留当前倍率的 50%。',
    teacherLine: '答错也不是掉下去，我会把你接住一点点。',
  },
  dont_fall_behind: {
    id: 'dont_fall_behind',
    name: '不许掉队',
    rarity: 'advanced',
    effect: 'mistakeShield',
    unlockAtAttempts: 20,
    description: '获得 1 次更稳定的答错倍率豁免。',
    teacherLine: '你已经练了不少题啦，这次不许掉队，我陪着。',
  },
  heartbeat_combo: {
    id: 'heartbeat_combo',
    name: '心跳连击',
    rarity: 'advanced',
    effect: 'comboDouble',
    unlockAtAttempts: 35,
    description: '接下来 3 题全对时，倍率成长翻倍。',
    teacherLine: '三题小连击，答漂亮一点给我看，好不好？',
  },
  mistake_radar: {
    id: 'mistake_radar',
    name: '错因雷达',
    rarity: 'advanced',
    effect: 'mistakeRadar',
    unlockAtAttempts: 50,
    description: '本局结算时标记错因，并写入复习记忆。',
    teacherLine: '错在哪里我会帮你圈出来，不会让它偷偷溜走。',
  },
  peek_rubric: {
    id: 'peek_rubric',
    name: '偷看一眼',
    rarity: 'advanced',
    effect: 'rubricPeek',
    unlockAtAttempts: 75,
    description: '短答/证明题显示一个评分关键点。',
    teacherLine: '只偷看一眼评分点，剩下的答案还是你来写。',
  },
  promise_reward: {
    id: 'promise_reward',
    name: '约定好了哦',
    rarity: 'rare',
    effect: 'bossBonus',
    unlockAtAttempts: 120,
    description: 'Boss 局答对率达标时，结算奖励预览额外提升。',
    teacherLine: '这局认真打完，奖励我会帮你多争取一点。',
  },
};

const BASIC_HAND: LearningCardId[] = [
  'cute_hint',
  'second_chance',
  'teacher_note',
  'steady_touch',
  'head_pat',
];

export const MENTOR_LEARNING_CARD_PRIORITY: Record<Live2DPresenterModelId, LearningCardId[]> = {
  haru: [
    'cute_hint',
    'steady_touch',
    'second_chance',
    'teacher_note',
    'heartbeat_combo',
    'promise_reward',
    'head_pat',
    'mistake_radar',
    'peek_rubric',
    'dont_fall_behind',
  ],
  hiyori: [
    'head_pat',
    'second_chance',
    'cute_hint',
    'mistake_radar',
    'teacher_note',
    'dont_fall_behind',
    'peek_rubric',
    'steady_touch',
    'heartbeat_combo',
    'promise_reward',
  ],
  mark: [
    'teacher_note',
    'steady_touch',
    'peek_rubric',
    'cute_hint',
    'mistake_radar',
    'head_pat',
    'second_chance',
    'heartbeat_combo',
    'promise_reward',
    'dont_fall_behind',
  ],
  mao: [
    'steady_touch',
    'heartbeat_combo',
    'cute_hint',
    'teacher_note',
    'promise_reward',
    'second_chance',
    'head_pat',
    'mistake_radar',
    'peek_rubric',
    'dont_fall_behind',
  ],
  rice: [
    'second_chance',
    'head_pat',
    'cute_hint',
    'dont_fall_behind',
    'steady_touch',
    'mistake_radar',
    'teacher_note',
    'peek_rubric',
    'heartbeat_combo',
    'promise_reward',
  ],
};

function orderCardsForMentor(
  cardIds: LearningCardId[],
  mentorId: Live2DPresenterModelId = 'mark',
): LearningCardId[] {
  const priority = MENTOR_LEARNING_CARD_PRIORITY[mentorId] ?? MENTOR_LEARNING_CARD_PRIORITY.mark;
  return cardIds.slice().sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    return (
      (aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER) -
      (bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER)
    );
  });
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickBySeed<T>(values: readonly T[], seed: string): T {
  return values[hashString(seed) % values.length] ?? values[0];
}

export function getUnlockedLearningCards(stats: LearningRunStats): LearningCardDefinition[] {
  return Object.values(LEARNING_CARD_DEFINITIONS).filter(
    (card) => stats.attempts >= card.unlockAtAttempts,
  );
}

export function getNewlyUnlockedLearningCards(
  previous: LearningRunStats,
  next: LearningRunStats,
): LearningCardDefinition[] {
  return Object.values(LEARNING_CARD_DEFINITIONS).filter(
    (card) => previous.attempts < card.unlockAtAttempts && next.attempts >= card.unlockAtAttempts,
  );
}

export function createLearningRunState(args: {
  sceneId: string;
  userId: string;
  stats: LearningRunStats;
  mentorId?: Live2DPresenterModelId;
}): LearningRunState {
  const unlocked = getUnlockedLearningCards(args.stats).map((card) => card.id);
  const orderedUnlocked = orderCardsForMentor(unlocked, args.mentorId);
  const starterCards = orderedUnlocked.slice(0, Math.max(5, Math.min(6, orderedUnlocked.length)));
  const advanced = orderedUnlocked.filter((id) => !BASIC_HAND.includes(id));
  const bonusCard =
    advanced.length > 0 ? pickBySeed(advanced, `${args.sceneId}:${args.userId}`) : null;
  const hand = Array.from(new Set(bonusCard ? [...starterCards, bonusCard] : starterCards)).slice(
    0,
    6,
  );

  return {
    runId: `${args.sceneId}:${Date.now()}`,
    hand,
    usedCards: [],
    mistakeShield: 0,
    preserveMultiplier: false,
    nextCorrectBonus: 0,
    comboDoubleQuestions: 0,
    mistakeRadar: false,
    bossBonus: false,
    eliminatedOptions: {},
    hints: {},
    rubricPeeks: {},
    milestoneDraws: [],
    createdAt: Date.now(),
  };
}

export function buildQuestionHint(question: QuizQuestion): string {
  const source =
    question.analysis ||
    question.explanation ||
    question.commentPrompt ||
    (typeof question.answer === 'string' ? question.answer : '');
  const first = source
    .replace(/\s+/g, ' ')
    .split(/[。.!?？]/)
    .map((item) => item.trim())
    .find(Boolean);
  if (first) return `先抓住这个方向：${first.slice(0, 48)}。`;
  if (
    question.type === 'single' ||
    question.type === 'multiple' ||
    question.type === 'multiple_choice'
  ) {
    return '先排除和题干关键词冲突的选项，再看剩下的差别。';
  }
  if (question.type === 'proof') return '先写出要证明的目标，再补中间连接条件。';
  if (question.type === 'code') return '先用一个最小输入在心里跑一遍，再改代码。';
  return '先把题干里的已知条件和要求分别圈出来。';
}

export function buildRubricPeek(question: QuizQuestion): string {
  const source =
    question.commentPrompt ||
    question.analysis ||
    question.explanation ||
    question.proof ||
    (typeof question.answer === 'string' ? question.answer : '');
  const first = source
    .replace(/\s+/g, ' ')
    .split(/[。.!?？；;]/)
    .map((item) => item.trim())
    .find(Boolean);
  return first ? `评分点：${first.slice(0, 56)}。` : '评分点：先把关键概念、推理步骤和结论写完整。';
}

export function pickWrongOptionToHide(question: QuizQuestion, seed: string): string | null {
  const answerSet = new Set(
    Array.isArray(question.answer) ? question.answer : [question.answer].filter(Boolean),
  );
  const candidates = (question.options ?? [])
    .map((option) => option.value)
    .filter((value) => !answerSet.has(value));
  if (candidates.length === 0) return null;
  return pickBySeed(candidates, seed);
}

export function drawLearningCard(args: {
  sceneId: string;
  userId: string;
  stats: LearningRunStats;
  drawIndex: number;
  excludeIds?: LearningCardId[];
  mentorId?: Live2DPresenterModelId;
}): LearningCardId {
  const unlocked = orderCardsForMentor(
    getUnlockedLearningCards(args.stats).map((card) => card.id),
    args.mentorId,
  );
  const pool = unlocked.filter((id) => !(args.excludeIds ?? []).includes(id));
  return pickBySeed(
    pool.length > 0 ? pool : BASIC_HAND,
    `${args.sceneId}:${args.userId}:${args.drawIndex}`,
  );
}

export function summarizeLearningRun(args: {
  results: Array<{ status: 'correct' | 'incorrect' }>;
  previousStats: LearningRunStats;
  run: LearningRunState;
}): LearningRunSummary {
  let multiplier = 1;
  let streak = 0;
  let longestStreak = 0;
  let shields = args.run.mistakeShield;
  let preserve = args.run.preserveMultiplier;
  let nextCorrectBonus = args.run.nextCorrectBonus;
  let comboDoubleQuestions = args.run.comboDoubleQuestions;
  let forgivenMistakes = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  for (const result of args.results) {
    if (result.status === 'correct') {
      correctCount += 1;
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
      const comboBonus = comboDoubleQuestions > 0 ? 2 : 1;
      multiplier += (0.15 + nextCorrectBonus) * comboBonus;
      nextCorrectBonus = 0;
      comboDoubleQuestions = Math.max(0, comboDoubleQuestions - 1);
      continue;
    }

    incorrectCount += 1;
    if (shields > 0) {
      shields -= 1;
      forgivenMistakes += 1;
      continue;
    }
    if (preserve) {
      multiplier = Math.max(1, multiplier * 0.5);
      preserve = false;
    } else {
      multiplier = 1;
    }
    streak = 0;
    comboDoubleQuestions = 0;
  }

  const bossBonus =
    args.run.bossBonus && correctCount >= Math.ceil(args.results.length * 0.8) ? 1.25 : 1;
  const finalMultiplier = Math.round(multiplier * bossBonus * 100) / 100;
  const rewardPreview = Math.max(0, Math.round(correctCount * finalMultiplier * 8));
  const nextStats = {
    ...args.previousStats,
    attempts: args.previousStats.attempts + args.results.length,
    correct: args.previousStats.correct + correctCount,
  };

  return {
    correctCount,
    incorrectCount,
    forgivenMistakes,
    longestStreak,
    finalMultiplier,
    rewardPreview,
    unlockedCards: getNewlyUnlockedLearningCards(args.previousStats, nextStats),
  };
}
