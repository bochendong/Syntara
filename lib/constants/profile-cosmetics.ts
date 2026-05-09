import type { NotificationCardStyleChoice } from '@/lib/notifications/card-theme';
import type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import type { SlideBackgroundStyleId } from '@/lib/constants/slide-backgrounds';
import type { LeftRailBarStageChoice } from '@/lib/store/user-profile';

export type ProfileCosmeticKind =
  | 'notification-card-style'
  | 'notification-stage'
  | 'left-rail-stage'
  | 'slide-background';

export type ProfileCosmeticItem = {
  key: string;
  kind: ProfileCosmeticKind;
  id: string;
  label: string;
  cost: number;
};

function item(
  kind: ProfileCosmeticKind,
  id: string,
  label: string,
  cost: number,
): ProfileCosmeticItem {
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    label,
    cost,
  };
}

const NOTIFICATION_CARD_STYLE_ITEMS = [
  item('notification-card-style', 'auto', '智能通知配色', 0),
  item('notification-card-style', 'green', '青绿通知配色', 20),
  item('notification-card-style', 'blue', '天蓝通知配色', 20),
  item('notification-card-style', 'yellow', '琥珀通知配色', 25),
  item('notification-card-style', 'purple', '藤紫通知配色', 35),
  item('notification-card-style', 'pink', '品红通知配色', 35),
] as const;

const NOTIFICATION_STAGE_ITEMS = [
  item('notification-stage', 'soft-aurora', '柔极光通知框', 0),
  item('notification-stage', 'solid-black', '纯黑通知框', 15),
  item('notification-stage', 'solid-mist', '淡雾灰通知框', 15),
  item('notification-stage', 'solid-cloud', '淡云青通知框', 15),
  item('notification-stage', 'solid-blush', '淡粉通知框', 15),
  item('notification-stage', 'solid-sage', '淡苔绿通知框', 15),
  item('notification-stage', 'solid-lilac', '淡紫藤通知框', 15),
  item('notification-stage', 'prism', 'Prism 通知框', 60),
  item('notification-stage', 'light-pillar', '光柱通知框', 60),
  item('notification-stage', 'pixel-snow', '像素雪通知框', 45),
  item('notification-stage', 'floating-lines', '浮线通知框', 45),
  item('notification-stage', 'light-rays', '光束通知框', 60),
  item('notification-stage', 'particles', '粒子通知框', 45),
  item('notification-stage', 'evil-eye', '邪眼通知框', 70),
  item('notification-stage', 'color-bends', '色带通知框', 55),
  item('notification-stage', 'plasma-wave', '等离子通知框', 55),
  item('notification-stage', 'threads', '线幕通知框', 55),
  item('notification-stage', 'hyperspeed', '速幕通知框', 70),
  item('notification-stage', 'prismatic-burst', '棱彩通知框', 70),
  item('notification-stage', 'line-waves', '线浪通知框', 55),
] as const;

const LEFT_RAIL_STAGE_ITEMS = [
  item('left-rail-stage', 'default', '默认侧边栏', 0),
  item('left-rail-stage', 'soft-aurora', '柔极光侧边栏', 0),
  item('left-rail-stage', 'solid-black', '纯黑侧边栏', 15),
  item('left-rail-stage', 'solid-mist', '淡雾灰侧边栏', 15),
  item('left-rail-stage', 'solid-cloud', '淡云青侧边栏', 15),
  item('left-rail-stage', 'solid-blush', '淡粉侧边栏', 15),
  item('left-rail-stage', 'solid-sage', '淡苔绿侧边栏', 15),
  item('left-rail-stage', 'solid-lilac', '淡紫藤侧边栏', 15),
  item('left-rail-stage', 'pixel-snow', '像素雪侧边栏', 45),
  item('left-rail-stage', 'floating-lines', '浮线侧边栏', 45),
  item('left-rail-stage', 'particles', '粒子侧边栏', 45),
  item('left-rail-stage', 'color-bends', '色带侧边栏', 55),
  item('left-rail-stage', 'plasma-wave', '等离子侧边栏', 55),
  item('left-rail-stage', 'threads', '线幕侧边栏', 55),
  item('left-rail-stage', 'hyperspeed', '速幕侧边栏', 70),
  item('left-rail-stage', 'prismatic-burst', '棱彩侧边栏', 70),
  item('left-rail-stage', 'line-waves', '线浪侧边栏', 55),
] as const;

const SLIDE_BACKGROUND_ITEMS = [
  item('slide-background', 'academy-watercolor', '学园水彩幻灯片背景', 0),
  item('slide-background', 'sci-fi-data-cockpit', '科幻数据舱幻灯片背景', 70),
  item('slide-background', 'deep-space-astronomy', '星际宇宙幻灯片背景', 60),
  item('slide-background', 'nature-field-notebook', '自然生态幻灯片背景', 45),
  item('slide-background', 'dark-tech-neural', '暗色神经网络幻灯片背景', 70),
  item('slide-background', 'historical-manuscript', '历史手稿幻灯片背景', 45),
  item('slide-background', 'magazine-courtyard', '庭院杂志幻灯片背景', 60),
  item('slide-background', 'cinematic-stage', '电影暗场幻灯片背景', 70),
  item('slide-background', 'product-launch-dark', '黑金发布幻灯片背景', 70),
  item('slide-background', 'academic-blueprint', '学术蓝图幻灯片背景', 45),
  item('slide-background', 'lecture-hall', '现代阶梯教室幻灯片背景', 45),
  item('slide-background', 'workspace-desk', '明亮工作台幻灯片背景', 45),
  item('slide-background', 'science-lab', '现代实验室幻灯片背景', 60),
  item('slide-background', 'city-strategy', '城市战略夜景幻灯片背景', 60),
  item('slide-background', 'forest-path', '森林路径幻灯片背景', 45),
] as const;

export const PROFILE_COSMETIC_ITEMS = [
  ...NOTIFICATION_CARD_STYLE_ITEMS,
  ...NOTIFICATION_STAGE_ITEMS,
  ...LEFT_RAIL_STAGE_ITEMS,
  ...SLIDE_BACKGROUND_ITEMS,
] as const;

export const DEFAULT_UNLOCKED_PROFILE_COSMETIC_KEYS = PROFILE_COSMETIC_ITEMS.filter(
  (entry) => entry.cost === 0,
).map((entry) => entry.key);

/**
 * 新用户默认拥有的个人外观资源：
 * - 通知配色：智能
 * - 通知框底图：柔极光
 * - 侧边栏：默认、柔极光
 * - 幻灯片背景：学园水彩
 * - 头像框：无、星紫、晴空（头像框由成长等级解锁，不再消耗购买积分）
 *
 * 头像本体默认由 `DEFAULT_UNLOCKED_USER_AVATAR_IDS` 提供 R1。
 */
export const NEW_USER_DEFAULT_PROFILE_COSMETIC_KEYS = DEFAULT_UNLOCKED_PROFILE_COSMETIC_KEYS;

export function getProfileCosmeticItem(kind: string, id: string): ProfileCosmeticItem | null {
  return PROFILE_COSMETIC_ITEMS.find((entry) => entry.kind === kind && entry.id === id) ?? null;
}

export function profileCosmeticKey(kind: ProfileCosmeticKind, id: string): string {
  return `${kind}:${id}`;
}

export function notificationCardStyleCosmeticKey(id: NotificationCardStyleChoice): string {
  return profileCosmeticKey('notification-card-style', id);
}

export function notificationStageCosmeticKey(id: NotificationBarStageId): string {
  return profileCosmeticKey('notification-stage', id);
}

export function leftRailStageCosmeticKey(id: LeftRailBarStageChoice): string {
  return profileCosmeticKey('left-rail-stage', id);
}

export function slideBackgroundCosmeticKey(id: SlideBackgroundStyleId): string {
  return profileCosmeticKey('slide-background', id);
}
