export const NOTIFICATION_BAR_STAGE_IDS = [
  'solid-black',
  'solid-mist',
  'solid-cloud',
  'solid-blush',
  'solid-sage',
  'solid-lilac',
  'prism',
  'light-pillar',
  'pixel-snow',
  'floating-lines',
  'light-rays',
  'soft-aurora',
  'particles',
  'evil-eye',
  'color-bends',
  'plasma-wave',
  'threads',
  'hyperspeed',
  'prismatic-burst',
  'line-waves',
] as const;

export type NotificationBarStageId = (typeof NOTIFICATION_BAR_STAGE_IDS)[number];

/** 与 `NOTIFICATION_BAR_STAGE_IDS` 一一对应；少键 / 多键时 TS 会报错，避免动效有 id 但设置页不显示。 */
const NOTIFICATION_BAR_STAGE_LABELS: Record<NotificationBarStageId, string> = {
  prism: 'Prism',
  'light-pillar': '光柱',
  'pixel-snow': '像素雪',
  'solid-black': '纯黑',
  'solid-mist': '淡雾灰',
  'solid-cloud': '淡云青',
  'solid-blush': '淡粉',
  'solid-sage': '淡苔绿',
  'solid-lilac': '淡紫藤',
  'floating-lines': '浮线',
  'light-rays': '光束',
  'soft-aurora': '柔极光',
  particles: '粒子',
  'evil-eye': '邪眼',
  'color-bends': '色带',
  'plasma-wave': '等离子',
  threads: '线幕',
  hyperspeed: '速幕',
  'prismatic-burst': '棱彩',
  'line-waves': '线浪',
};

export const NOTIFICATION_BAR_STAGE_OPTIONS: { id: NotificationBarStageId; label: string }[] =
  NOTIFICATION_BAR_STAGE_IDS.map((id) => ({ id, label: NOTIFICATION_BAR_STAGE_LABELS[id] }));

const SOLID_COLOR_BAR_STAGE_IDS = [
  'solid-black',
  'solid-mist',
  'solid-cloud',
  'solid-blush',
  'solid-sage',
  'solid-lilac',
] as const satisfies ReadonlyArray<NotificationBarStageId>;

/** 无 WebGL 的平铺底色（与动效/蒙版等区分） */
export function isSolidColorBarStageId(
  id: NotificationBarStageId,
): id is (typeof SOLID_COLOR_BAR_STAGE_IDS)[number] {
  return (SOLID_COLOR_BAR_STAGE_IDS as readonly NotificationBarStageId[]).includes(id);
}

/** 主导航侧栏设置中不展示、不可选的动效（与通知动效库仍共用同一套 id 实现） */
export const LEFT_RAIL_EXCLUDED_BAR_STAGE_IDS = [
  'prism',
  'light-pillar',
  'light-rays',
  'evil-eye',
] as const satisfies ReadonlyArray<NotificationBarStageId>;

export function isLeftRailAllowedBarStageId(
  id: NotificationBarStageId,
): id is Exclude<
  NotificationBarStageId,
  (typeof LEFT_RAIL_EXCLUDED_BAR_STAGE_IDS)[number]
> {
  return !(
    LEFT_RAIL_EXCLUDED_BAR_STAGE_IDS as readonly NotificationBarStageId[]
  ).includes(id);
}

/** 个人中心侧栏 Tab 的动效选项（已排除上列） */
export const LEFT_RAIL_BAR_STAGE_OPTIONS: { id: NotificationBarStageId; label: string }[] =
  NOTIFICATION_BAR_STAGE_OPTIONS.filter((o) => isLeftRailAllowedBarStageId(o.id));

export function isValidNotificationBarStageId(v: unknown): v is NotificationBarStageId {
  return typeof v === 'string' && (NOTIFICATION_BAR_STAGE_IDS as readonly string[]).includes(v);
}
