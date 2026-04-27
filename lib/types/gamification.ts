export type GamificationCharacterAssetType = 'LIVE2D' | 'AVATAR';
export type GamificationAvatarRarity = 'R' | 'SR' | 'SSR';
export type GamificationGachaBannerId = 'avatar' | 'live2d';

export type GamificationCharacterId =
  | 'haru'
  | 'hiyori'
  | 'mark'
  | 'mao'
  | 'rice'
  | 'avatar-r-pack'
  | 'avatar-sr-pack'
  | 'avatar-ssr-pack';

export type GamificationMissionId =
  | 'daily_sign_in'
  | 'daily_lesson'
  | 'daily_quiz'
  | 'daily_review'
  | 'daily_all_clear'
  | 'weekly_study_days'
  | 'weekly_quiz_batches';

export type GamificationClaimKind = 'daily_sign_in' | 'daily_tasks' | 'streak_bonus';

export type GamificationEventType =
  | 'lesson_milestone_completed'
  | 'quiz_completed'
  | 'review_completed';

export interface GamificationCharacterSummary {
  id: GamificationCharacterId | string;
  name: string;
  assetType: GamificationCharacterAssetType;
  unlockCostPurchaseCredits: number;
  affinityLevelRequired: number;
  isDefault: boolean;
  isUnlocked: boolean;
  isEquipped: boolean;
  affinityExp: number;
  affinityLevel: number;
  previewSrc?: string | null;
  badgeLabel?: string | null;
  accentColor?: string | null;
  description?: string | null;
  story?: string | null;
  teachingStyle?: string | null;
  bondLine?: string | null;
  personalityTags?: string[];
  collectionLabel?: string | null;
  nextUnlockHint?: string | null;
  fragmentCount?: number;
  fragmentTarget?: number;
  unlockViaGacha?: boolean;
}

export interface GamificationAvatarInventoryItem {
  id: string;
  name: string;
  url: string;
  rarity: GamificationAvatarRarity;
  owned: boolean;
  fragmentCount: number;
  fragmentTarget: number;
  directUnlock: boolean;
}

export interface GamificationAvatarInventorySummary {
  ownedIds: string[];
  items: GamificationAvatarInventoryItem[];
}

export interface GamificationCosmeticInventoryItem {
  key: string;
  kind: string;
  id: string;
  label: string;
  cost: number;
  owned: boolean;
}

export interface GamificationCosmeticInventorySummary {
  ownedKeys: string[];
  items: GamificationCosmeticInventoryItem[];
}

export interface GamificationGachaDrawReward {
  kind: 'avatar' | 'character';
  itemId: string;
  name: string;
  previewSrc: string;
  rarity?: GamificationAvatarRarity;
  fragmentGain: number;
  fragmentTotal: number;
  fragmentTarget: number;
  unlockedNow: boolean;
  duplicate: boolean;
  affinityGain: number;
}

export interface GamificationMissionSummary {
  id: GamificationMissionId;
  label: string;
  period: 'daily' | 'weekly';
  targetValue: number;
  progressValue: number;
  completed: boolean;
  claimed: boolean;
  rewardPurchaseCredits: number;
}

export interface GamificationClaimableSummary {
  dailySignIn: boolean;
  dailyTasks: boolean;
  streakBonusDays: number | null;
}

export interface GamificationNudgeSummary {
  title: string;
  body: string;
  tone: 'gentle' | 'encouraging';
}

export interface GamificationSummaryResponse {
  success: true;
  databaseEnabled: boolean;
  profile: {
    streakDays: number;
    lastStudyAt: string | null;
    todayEarnedPurchaseCredits: number;
    preferredCharacterId: string;
    equippedCharacterId: string;
    affinityExp: number;
    affinityLevel: number;
    nextAffinityLevelExp: number | null;
    todayAffinityEarned: number;
    todayAffinityCap: number;
  };
  balances: {
    purchase: number;
    cash: number;
    compute: number;
  };
  claimables: GamificationClaimableSummary;
  dailyTasks: GamificationMissionSummary[];
  weeklyTasks: GamificationMissionSummary[];
  characters: GamificationCharacterSummary[];
  avatarInventory: GamificationAvatarInventorySummary;
  cosmeticInventory: GamificationCosmeticInventorySummary;
  nudge: GamificationNudgeSummary | null;
}

export interface GamificationGachaDrawResponse {
  success: true;
  databaseEnabled: boolean;
  bannerId: GamificationGachaBannerId;
  drawCount: number;
  cost: number;
  remainingPurchaseBalance: number;
  rewards: GamificationGachaDrawReward[];
  summary: GamificationSummaryResponse;
}

export interface GamificationEventResponse {
  success: true;
  databaseEnabled: boolean;
  eventType: GamificationEventType;
  rewardedPurchaseCredits: number;
  rewardedAffinity: number;
  newPurchaseBalance: number;
  characterId: string;
  characterName: string;
  affinityLevel: number;
  accuracyBonusApplied?: boolean;
  reviewEligible?: boolean;
}
