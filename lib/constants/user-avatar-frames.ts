/**
 * 个人中心「头像框」可选样式（纯 CSS，存 id 即可持久化）
 */
export const DEFAULT_USER_AVATAR_FRAME_ID = 'none' as const;

export type UserAvatarFrameId = (typeof USER_AVATAR_FRAME_OPTIONS)[number]['id'];

export const USER_AVATAR_FRAME_OPTIONS = [
  {
    id: 'none',
    label: '无',
    /** 包在圆头像外层的 class（含圆角与 overflow） */
    outerClassName: 'rounded-full overflow-hidden',
  },
  {
    id: 'violet',
    label: '星紫',
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-violet-400/90 ring-offset-2 ring-offset-background dark:ring-violet-500/75',
  },
  {
    id: 'amber',
    label: '暖金',
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-amber-400/90 ring-offset-2 ring-offset-background dark:ring-amber-400/70',
  },
  {
    id: 'emerald',
    label: '翠意',
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-emerald-500/85 ring-offset-2 ring-offset-background dark:ring-emerald-400/75',
  },
  {
    id: 'sky',
    label: '晴空',
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-sky-400/90 ring-offset-2 ring-offset-background dark:ring-sky-400/75',
  },
  {
    id: 'rose',
    label: '霞粉',
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-rose-400/90 ring-offset-2 ring-offset-background dark:ring-rose-400/70',
  },
] as const;

export function isValidUserAvatarFrameId(id: string): id is UserAvatarFrameId {
  return USER_AVATAR_FRAME_OPTIONS.some((o) => o.id === id);
}

export function userAvatarFrameDef(
  id: string,
): (typeof USER_AVATAR_FRAME_OPTIONS)[number] {
  return (
    USER_AVATAR_FRAME_OPTIONS.find((o) => o.id === id) ?? USER_AVATAR_FRAME_OPTIONS[0]
  );
}
