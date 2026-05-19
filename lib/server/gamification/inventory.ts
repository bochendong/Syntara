import type { Prisma } from '@/lib/server/generated-prisma';
import type { GamificationAvatarInventorySummary } from '@/lib/types/gamification';
import {
  DEFAULT_UNLOCKED_USER_AVATAR_IDS,
  USER_AVATAR_GACHA_CATALOG,
  type UserAvatarCatalogItem,
} from '@/lib/constants/user-avatars';
import {
  DEFAULT_UNLOCKED_PROFILE_COSMETIC_KEYS,
  PROFILE_COSMETIC_ITEMS,
} from '@/lib/constants/profile-cosmetics';
import { AFFINITY_LEVEL_THRESHOLDS } from '@/lib/server/gamification/config';
import { isJsonObject } from '@/lib/server/gamification/metadata';

export type AvatarInventoryState = {
  ownedIds: string[];
  fragmentCounts: Record<string, number>;
  cosmeticUnlocks: string[];
};

export function computeAffinityLevel(exp: number): number {
  let level = 1;
  for (let index = 0; index < AFFINITY_LEVEL_THRESHOLDS.length; index += 1) {
    if (exp >= AFFINITY_LEVEL_THRESHOLDS[index]) {
      level = index + 1;
    }
  }
  return level;
}

export function nextLevelExp(level: number): number | null {
  return AFFINITY_LEVEL_THRESHOLDS[level] ?? null;
}

export function avatarDisplayName(item: UserAvatarCatalogItem): string {
  if (item.rarity === 'R') return `R 收藏头像 ${item.id.replace('R', '#')}`;
  if (item.rarity === 'SR') return `SR 收藏头像 ${item.id.replace('SR', '#')}`;
  return `SSR 收藏头像 ${item.id.replace('SSR', '#')}`;
}

export function normalizeAvatarInventoryState(
  value: Prisma.JsonValue | null | undefined,
): AvatarInventoryState {
  const baseOwned = new Set(DEFAULT_UNLOCKED_USER_AVATAR_IDS);
  const baseCosmeticUnlocks = new Set(DEFAULT_UNLOCKED_PROFILE_COSMETIC_KEYS);
  const baseFragments: Record<string, number> = {};
  if (!isJsonObject(value)) {
    return {
      ownedIds: [...baseOwned],
      fragmentCounts: baseFragments,
      cosmeticUnlocks: [...baseCosmeticUnlocks],
    };
  }

  const ownedRaw = Array.isArray(value.ownedIds) ? value.ownedIds : [];
  for (const id of ownedRaw) {
    if (typeof id === 'string' && id.trim()) baseOwned.add(id.trim());
  }

  const fragmentRaw = isJsonObject(value.fragmentCounts) ? value.fragmentCounts : null;
  if (fragmentRaw) {
    Object.entries(fragmentRaw).forEach(([key, fragmentValue]) => {
      if (typeof fragmentValue !== 'number' || !Number.isFinite(fragmentValue)) return;
      baseFragments[key] = Math.max(0, Math.floor(fragmentValue));
    });
  }

  const cosmeticRaw = Array.isArray(value.cosmeticUnlocks) ? value.cosmeticUnlocks : [];
  for (const key of cosmeticRaw) {
    if (typeof key === 'string' && key.trim()) baseCosmeticUnlocks.add(key.trim());
  }

  return {
    ownedIds: [...baseOwned],
    fragmentCounts: baseFragments,
    cosmeticUnlocks: [...baseCosmeticUnlocks],
  };
}

export function toAvatarInventoryJson(state: AvatarInventoryState): Prisma.InputJsonObject {
  return {
    version: 1,
    ownedIds: [...new Set(state.ownedIds)].sort(),
    fragmentCounts: state.fragmentCounts,
    cosmeticUnlocks: [...new Set(state.cosmeticUnlocks)].sort(),
  };
}

export function buildAvatarInventorySummary(
  inventory: AvatarInventoryState,
): GamificationAvatarInventorySummary {
  const owned = new Set(inventory.ownedIds);
  return {
    ownedIds: [...owned],
    items: USER_AVATAR_GACHA_CATALOG.map((item) => ({
      id: item.id,
      name: avatarDisplayName(item),
      url: item.url,
      rarity: item.rarity,
      owned: owned.has(item.id),
      fragmentCount: Math.max(0, inventory.fragmentCounts[item.id] ?? 0),
      fragmentTarget: item.fragmentTarget,
      directUnlock: item.directUnlock,
    })),
  };
}

export function buildCosmeticInventorySummary(inventory: AvatarInventoryState) {
  const owned = new Set([...DEFAULT_UNLOCKED_PROFILE_COSMETIC_KEYS, ...inventory.cosmeticUnlocks]);
  return {
    ownedKeys: [...owned],
    items: PROFILE_COSMETIC_ITEMS.map((item) => ({
      ...item,
      owned: owned.has(item.key),
    })),
  };
}

export function getRemainingAvatarDraws(inventory: AvatarInventoryState): number {
  const owned = new Set(inventory.ownedIds);
  return USER_AVATAR_GACHA_CATALOG.reduce((sum, item) => {
    if (owned.has(item.id)) return sum;
    if (item.directUnlock) return sum + 1;
    return sum + Math.max(0, item.fragmentTarget - (inventory.fragmentCounts[item.id] ?? 0));
  }, 0);
}

export function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function weightedPick<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return items[0]!.item;
  let cursor = Math.random() * total;
  for (const entry of items) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.item;
  }
  return items[items.length - 1]!.item;
}
