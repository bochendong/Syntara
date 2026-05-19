import { CharacterAssetType, MissionType, type Prisma } from '@/lib/server/generated-prisma';
import type { GamificationAvatarRarity } from '@/lib/types/gamification';
import {
  DEFAULT_LIVE2D_PRESENTER_MODEL_ID,
  type Live2DPresenterModelId,
} from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_PERSONAS } from '@/lib/live2d/presenter-personas';

export const APP_TIME_ZONE = 'America/Toronto';
export const DAILY_PURCHASE_EARN_CAP = 120;
export const DAILY_AFFINITY_EARN_CAP = 20;
export const DEFAULT_CHARACTER_ID = DEFAULT_LIVE2D_PRESENTER_MODEL_ID;
export const CHARACTER_FRAGMENT_TARGET = 10;
export const CHARACTER_DUPLICATE_AFFINITY_GAIN = 6;

export const GACHA_BANNER_CONFIG = {
  avatar: {
    singleCost: 30,
    tenCost: 270,
  },
  live2d: {
    singleCost: 45,
    tenCost: 405,
  },
} as const;

export const AVATAR_RARITY_RATES: Record<GamificationAvatarRarity, number> = {
  R: 0.78,
  SR: 0.18,
  SSR: 0.04,
};

export const REWARD_RULES = {
  dailySignIn: { purchaseCredits: 5, affinity: 1 },
  lessonMilestone: { purchaseCredits: 8, affinity: 2 },
  quizCompletion: { purchaseCredits: 12, affinity: 3 },
  quizAccuracyBonus: { purchaseCredits: 6, affinity: 0 },
  reviewCompletion: { purchaseCredits: 10, affinity: 4 },
  dailyAllClear: { purchaseCredits: 20, affinity: 0 },
  streakBonus: {
    3: 15,
    7: 40,
    14: 100,
  } as Record<number, number>,
} as const;

function getLive2DPersonaMetadata(id: Live2DPresenterModelId): Prisma.InputJsonObject {
  const persona = LIVE2D_PRESENTER_PERSONAS[id];
  return {
    description: persona.description,
    worldview: persona.worldview,
    story: persona.story,
    gathering: persona.gathering,
    linkLine: persona.linkLine,
    teachingStyle: persona.teachingStyle,
    bondLine: persona.bondLine,
    personalityTags: [...persona.personalityTags],
  };
}

export const AFFINITY_LEVEL_THRESHOLDS = [0, 30, 80, 160, 300] as const;

export const DAILY_TASK_DEFINITIONS: Array<{
  id: 'daily_lesson' | 'daily_quiz' | 'daily_review';
  missionType: MissionType;
  label: string;
  targetValue: number;
  rewardPurchaseCredits: number;
}> = [
  {
    id: 'daily_lesson',
    missionType: MissionType.DAILY_LESSON,
    label: '看 1 节课',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'daily_quiz',
    missionType: MissionType.DAILY_QUIZ,
    label: '做 1 组题',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'daily_review',
    missionType: MissionType.DAILY_REVIEW,
    label: '回顾 1 组错题',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
];

export const WEEKLY_TASK_DEFINITIONS: Array<{
  id: 'weekly_study_days' | 'weekly_quiz_batches';
  missionType: MissionType;
  label: string;
  targetValue: number;
  rewardPurchaseCredits: number;
}> = [
  {
    id: 'weekly_study_days',
    missionType: MissionType.WEEKLY_STUDY_DAYS,
    label: '完成 5 次学习日',
    targetValue: 5,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'weekly_quiz_batches',
    missionType: MissionType.WEEKLY_QUIZ_BATCHES,
    label: '累计完成 8 组题',
    targetValue: 8,
    rewardPurchaseCredits: 0,
  },
];

export const DEFAULT_CATALOG: Array<{
  id: string;
  name: string;
  assetType: CharacterAssetType;
  unlockCostPurchaseCredits: number;
  affinityLevelRequired: number;
  sortOrder: number;
  isDefault: boolean;
  metadata: Prisma.InputJsonObject;
}> = [
  {
    id: 'haru',
    name: 'Haru',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 0,
    affinityLevelRequired: 1,
    sortOrder: 10,
    isDefault: false,
    metadata: {
      ...getLive2DPersonaMetadata('haru'),
      previewSrc: '/live2d/previews/haru.jpg',
      badgeLabel: 'Haru',
      accentColor: '#38bdf8',
    },
  },
  {
    id: 'hiyori',
    name: 'Hiyori',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 500,
    affinityLevelRequired: 2,
    sortOrder: 20,
    isDefault: false,
    metadata: {
      ...getLive2DPersonaMetadata('hiyori'),
      previewSrc: '/live2d/previews/hiyori.jpg',
      badgeLabel: 'Hiyori',
      accentColor: '#fb7185',
    },
  },
  {
    id: 'mark',
    name: 'Mark',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 900,
    affinityLevelRequired: 4,
    sortOrder: 30,
    isDefault: true,
    metadata: {
      ...getLive2DPersonaMetadata('mark'),
      previewSrc: '/live2d/previews/mark.jpg',
      badgeLabel: 'Mark',
      accentColor: '#f59e0b',
    },
  },
  {
    id: 'mao',
    name: 'Mao',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 260,
    affinityLevelRequired: 1,
    sortOrder: 40,
    isDefault: false,
    metadata: {
      ...getLive2DPersonaMetadata('mao'),
      previewSrc: '/live2d/previews/mao.jpg',
      badgeLabel: 'Mao',
      accentColor: '#fb7185',
    },
  },
  {
    id: 'rice',
    name: 'Rice',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 580,
    affinityLevelRequired: 1,
    sortOrder: 60,
    isDefault: false,
    metadata: {
      ...getLive2DPersonaMetadata('rice'),
      previewSrc: '/live2d/previews/rice.jpg',
      badgeLabel: 'Rice',
      accentColor: '#a78bfa',
    },
  },
  {
    id: 'avatar-r-pack',
    name: 'R Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 60,
    affinityLevelRequired: 1,
    sortOrder: 110,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/R1.avif',
      collectionLabel: 'R 收藏头像',
      accentColor: '#93c5fd',
      description: '基础头像收藏包，适合刚开始攒收藏的阶段。',
    },
  },
  {
    id: 'avatar-sr-pack',
    name: 'SR Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 180,
    affinityLevelRequired: 2,
    sortOrder: 120,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/SR1.avif',
      collectionLabel: 'SR 收藏头像',
      accentColor: '#c084fc',
      description: '更稀有的头像收藏包，给持续学习的人一些漂亮奖励。',
    },
  },
  {
    id: 'avatar-ssr-pack',
    name: 'SSR Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 420,
    affinityLevelRequired: 4,
    sortOrder: 130,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/SSR1.avif',
      collectionLabel: 'SSR 收藏头像',
      accentColor: '#f472b6',
      description: '高阶收藏头像，留给真正把学习坚持下来的你。',
    },
  },
];
