import type { AppNotification } from '@/lib/notifications/types';

export type NotificationCardThemePalette = {
  topLineClass: string;
  glowClass: string;
  eyebrowClass: string;
  amountPrimaryClass: string;
  amountChipClass: string;
};

/** 暗色底上偏亮的青蓝系，避免纯绿在 #000 附近发闷、发灰。 */
const GREEN_THEME: NotificationCardThemePalette = {
  topLineClass: 'from-cyan-200/0 via-cyan-300/95 to-sky-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.3),transparent_48%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.26),transparent_44%)]',
  eyebrowClass: 'text-cyan-100',
  amountPrimaryClass:
    'border border-cyan-200/30 bg-cyan-300/18 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.24)]',
  amountChipClass: 'border border-cyan-200/20 bg-cyan-300/12 text-cyan-100',
};

const BLUE_THEME: NotificationCardThemePalette = {
  topLineClass: 'from-sky-400/0 via-sky-400/90 to-cyan-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_44%)]',
  eyebrowClass: 'text-sky-100',
  amountPrimaryClass:
    'border border-sky-200/30 bg-sky-300/18 text-sky-50 shadow-[0_0_22px_rgba(56,189,248,0.22)]',
  amountChipClass: 'border border-sky-200/20 bg-sky-300/12 text-sky-100',
};

const YELLOW_THEME: NotificationCardThemePalette = {
  topLineClass: 'from-amber-400/0 via-amber-400/90 to-yellow-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.2),transparent_44%)]',
  eyebrowClass: 'text-amber-100',
  amountPrimaryClass:
    'border border-amber-200/35 bg-amber-300/18 text-amber-50 shadow-[0_0_22px_rgba(251,191,36,0.2)]',
  amountChipClass: 'border border-amber-200/25 bg-amber-300/12 text-amber-100',
};

const PURPLE_THEME: NotificationCardThemePalette = {
  topLineClass: 'from-violet-400/0 via-violet-400/90 to-indigo-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(129,140,248,0.2),transparent_44%)]',
  eyebrowClass: 'text-violet-100',
  amountPrimaryClass:
    'border border-violet-200/30 bg-violet-300/18 text-violet-50 shadow-[0_0_22px_rgba(167,139,250,0.22)]',
  amountChipClass: 'border border-violet-200/22 bg-violet-300/12 text-violet-100',
};

const PINK_THEME: NotificationCardThemePalette = {
  topLineClass: 'from-fuchsia-400/0 via-fuchsia-400/90 to-pink-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(232,121,249,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.2),transparent_44%)]',
  eyebrowClass: 'text-fuchsia-100',
  amountPrimaryClass:
    'border border-fuchsia-200/30 bg-fuchsia-300/18 text-fuchsia-50 shadow-[0_0_22px_rgba(232,121,249,0.22)]',
  amountChipClass: 'border border-fuchsia-200/22 bg-fuchsia-300/12 text-fuchsia-100',
};

export const NOTIFICATION_STYLE_IDS = ['green', 'blue', 'yellow', 'purple', 'pink'] as const;
export type NotificationStyleId = (typeof NOTIFICATION_STYLE_IDS)[number];

export type NotificationCardStyleChoice = 'auto' | NotificationStyleId;

const PALETTE_BY_ID: Record<NotificationStyleId, NotificationCardThemePalette> = {
  green: GREEN_THEME,
  blue: BLUE_THEME,
  yellow: YELLOW_THEME,
  purple: PURPLE_THEME,
  pink: PINK_THEME,
};

export const NOTIFICATION_STYLE_PRESET_LIST: { id: NotificationStyleId; label: string }[] = [
  { id: 'green', label: '青绿' },
  { id: 'blue', label: '天蓝' },
  { id: 'yellow', label: '琥珀' },
  { id: 'purple', label: '藤紫' },
  { id: 'pink', label: '品红' },
];

export function getNotificationStylePaletteById(
  id: NotificationStyleId,
): NotificationCardThemePalette {
  return PALETTE_BY_ID[id];
}

function resolveCardThemeFromItem(
  item: Pick<AppNotification, 'sourceKind' | 'tone'> | null | undefined,
): NotificationCardThemePalette {
  if (!item) return GREEN_THEME;

  switch (item.sourceKind) {
    case 'study_nudge':
    case 'question_memory':
    case 'mistake_review':
    case 'route_unlock':
      return PINK_THEME;
    case 'LESSON_REWARD':
    case 'STREAK_BONUS':
      return GREEN_THEME;
    case 'QUIZ_COMPLETION_REWARD':
    case 'QUIZ_REWARD_GROUP':
    case 'TOKEN_USAGE_GROUP':
    case 'NOTEBOOK_GENERATION_GROUP':
      return BLUE_THEME;
    case 'DAILY_TASK_REWARD':
    case 'WELCOME_BONUS':
    case 'CASH_TO_COMPUTE_TRANSFER':
    case 'CASH_TO_PURCHASE_TRANSFER':
      return YELLOW_THEME;
    case 'REVIEW_REWARD':
      return PURPLE_THEME;
    case 'QUIZ_ACCURACY_BONUS':
    case 'PRACTICE_SUBMISSION':
      return PINK_THEME;
    default:
      return item.tone === 'negative' ? BLUE_THEME : GREEN_THEME;
  }
}

/**
 * 全局通知条配色。`styleChoice` 为 `auto` 时随通知 `sourceKind` 变化；否则整卡统一为所选主色。
 */
export function getNotificationCardTheme(
  item: Pick<AppNotification, 'sourceKind' | 'tone'> | null | undefined,
  styleChoice: NotificationCardStyleChoice = 'auto',
): NotificationCardThemePalette {
  if (styleChoice !== 'auto') {
    return PALETTE_BY_ID[styleChoice];
  }
  return resolveCardThemeFromItem(item);
}
