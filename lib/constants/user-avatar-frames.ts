/**
 * 个人中心「头像框」可选样式（纯 CSS，存 id 即可持久化）
 */
export const DEFAULT_USER_AVATAR_FRAME_ID = 'none' as const;

export type UserAvatarFrameId = (typeof USER_AVATAR_FRAME_OPTIONS)[number]['id'];

export const USER_AVATAR_FRAME_OPTIONS = [
  {
    id: 'none',
    label: '无',
    requiredLevel: 1,
    /** 包在圆头像外层的 class（含圆角与 overflow） */
    outerClassName: 'rounded-full overflow-hidden',
  },
  {
    id: 'violet',
    label: '星紫',
    requiredLevel: 1,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-violet-400/90 ring-offset-2 ring-offset-background dark:ring-violet-500/75',
  },
  {
    id: 'amber',
    label: '暖金',
    requiredLevel: 2,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-amber-400/90 ring-offset-2 ring-offset-background dark:ring-amber-400/70',
  },
  {
    id: 'emerald',
    label: '翠意',
    requiredLevel: 2,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-emerald-500/85 ring-offset-2 ring-offset-background dark:ring-emerald-400/75',
  },
  {
    id: 'sky',
    label: '晴空',
    requiredLevel: 1,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-sky-400/90 ring-offset-2 ring-offset-background dark:ring-sky-400/75',
  },
  {
    id: 'rose',
    label: '霞粉',
    requiredLevel: 2,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-rose-400/90 ring-offset-2 ring-offset-background dark:ring-rose-400/70',
  },
  {
    id: 'moonlit',
    label: '月辉',
    requiredLevel: 3,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-slate-300/95 ring-offset-2 ring-offset-background shadow-[0_0_18px_rgba(148,163,184,0.42)] dark:ring-slate-100/80',
  },
  {
    id: 'aurora',
    label: '极光',
    requiredLevel: 3,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(45,212,191,0.42)] dark:ring-cyan-200/80',
  },
  {
    id: 'ruby',
    label: '红玉',
    requiredLevel: 3,
    outerClassName:
      'rounded-full overflow-hidden ring-2 ring-red-400/90 ring-offset-2 ring-offset-background shadow-[0_0_18px_rgba(248,113,113,0.36)] dark:ring-red-300/80',
  },
  {
    id: 'royal',
    label: '王冠',
    requiredLevel: 4,
    outerClassName:
      'relative isolate rounded-full p-[3px] bg-[conic-gradient(from_210deg,#0B0B0D,#D6A84F,#8A5A2B,#C93A2E,#0B0B0D)] shadow-[0_0_24px_rgba(214,168,79,0.42),0_0_0_5px_rgba(138,90,43,0.16)]',
    haloClassName:
      'absolute -inset-1 rounded-full bg-[conic-gradient(from_210deg,rgba(11,11,13,0.45),rgba(214,168,79,0.34),rgba(201,58,46,0.18),rgba(11,11,13,0.45))] blur-md',
    overlayClassName:
      'absolute inset-[3px] z-20 rounded-full ring-1 ring-[#F2C76B]/70 shadow-[inset_0_1px_0_rgba(242,199,107,0.48)]',
  },
  {
    id: 'sunfire',
    label: '日冕',
    requiredLevel: 4,
    outerClassName:
      'relative isolate rounded-full p-[3px] bg-[conic-gradient(from_45deg,#15110E,#F2C76B,#E06A24,#8F1D1D,#15110E)] shadow-[0_0_28px_rgba(224,106,36,0.5),0_0_0_5px_rgba(242,199,107,0.14)]',
    haloClassName:
      'absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgba(242,199,107,0.38),rgba(224,106,36,0.2)_48%,rgba(143,29,29,0.12)_68%,transparent_76%)] blur-md',
    overlayClassName:
      'absolute inset-[3px] z-20 rounded-full ring-1 ring-[#F2C76B]/75 shadow-[inset_0_1px_0_rgba(242,199,107,0.42)]',
  },
  {
    id: 'nebula',
    label: '星云',
    requiredLevel: 4,
    outerClassName:
      'relative isolate rounded-full p-[3px] bg-[conic-gradient(from_160deg,#0B0B0D,#1E6F78,#35B7A6,#D6A84F,#0B0B0D)] shadow-[0_0_28px_rgba(53,183,166,0.38),0_0_0_5px_rgba(30,111,120,0.16)]',
    haloClassName:
      'absolute -inset-1.5 rounded-full bg-[conic-gradient(from_160deg,rgba(11,11,13,0.45),rgba(30,111,120,0.28),rgba(53,183,166,0.26),rgba(214,168,79,0.18),rgba(11,11,13,0.45))] blur-md',
    overlayClassName:
      'absolute inset-[3px] z-20 rounded-full ring-1 ring-[#35B7A6]/65 shadow-[inset_0_1px_0_rgba(214,168,79,0.34)]',
  },
  {
    id: 'diamond',
    label: '钻辉',
    requiredLevel: 5,
    outerClassName:
      'relative isolate rounded-full p-[4px] bg-[conic-gradient(from_0deg,#F8E7B0,#D6A84F,#B27A37,#35B7A6,#F8E7B0)] shadow-[0_0_34px_rgba(214,168,79,0.56),0_0_0_6px_rgba(242,199,107,0.2),0_18px_40px_rgba(15,23,42,0.18)]',
    haloClassName:
      'absolute -inset-2 rounded-full bg-[radial-gradient(circle,rgba(248,231,176,0.54),rgba(214,168,79,0.28)_45%,rgba(53,183,166,0.12)_68%,transparent_76%)] blur-lg',
    overlayClassName:
      'absolute inset-[4px] z-20 rounded-full ring-2 ring-[#F2C76B]/85 shadow-[inset_0_1px_0_rgba(248,231,176,0.72),0_0_16px_rgba(214,168,79,0.34)]',
    sparkleClassName:
      'absolute -right-0.5 top-1 z-30 size-2 rounded-full bg-[#F8E7B0] shadow-[0_0_10px_rgba(242,199,107,0.95)]',
  },
  {
    id: 'legend',
    label: '传说',
    requiredLevel: 5,
    outerClassName:
      'relative isolate rounded-full p-[4px] bg-[conic-gradient(from_40deg,#0B0B0D,#F2C76B,#C93A2E,#8A5A2B,#35B7A6,#0B0B0D)] shadow-[0_0_38px_rgba(242,199,107,0.58),0_0_0_6px_rgba(201,58,46,0.18),0_0_0_10px_rgba(53,183,166,0.1),0_18px_44px_rgba(15,23,42,0.2)]',
    haloClassName:
      'absolute -inset-2 rounded-full bg-[conic-gradient(from_40deg,rgba(11,11,13,0.5),rgba(242,199,107,0.42),rgba(201,58,46,0.24),rgba(53,183,166,0.18),rgba(11,11,13,0.5))] blur-lg',
    overlayClassName:
      'absolute inset-[4px] z-20 rounded-full ring-2 ring-[#F2C76B]/85 shadow-[inset_0_1px_0_rgba(248,231,176,0.68),0_0_18px_rgba(242,199,107,0.36)]',
    sparkleClassName:
      'absolute -right-1 top-0 z-30 size-2.5 rounded-full bg-[#F2C76B] shadow-[0_0_12px_rgba(242,199,107,0.95)]',
  },
] as const;

export function userAvatarFrameRequiredLevel(id: string): number {
  return userAvatarFrameDef(id).requiredLevel;
}

export function isValidUserAvatarFrameId(id: string): id is UserAvatarFrameId {
  return USER_AVATAR_FRAME_OPTIONS.some((o) => o.id === id);
}

export function userAvatarFrameDef(id: string): (typeof USER_AVATAR_FRAME_OPTIONS)[number] {
  return USER_AVATAR_FRAME_OPTIONS.find((o) => o.id === id) ?? USER_AVATAR_FRAME_OPTIONS[0];
}
