export const NOTIFICATION_BAR_STAGE_IDS = [
  'prism',
  'light-pillar',
  'pixel-snow',
  'solid-black',
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

export function isValidNotificationBarStageId(v: unknown): v is NotificationBarStageId {
  return typeof v === 'string' && (NOTIFICATION_BAR_STAGE_IDS as readonly string[]).includes(v);
}
