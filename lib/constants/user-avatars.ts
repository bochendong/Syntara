/**
 * 与 `public/avatars/user-avators/` 下已提交文件一致；新增图片时请同步更新本列表。
 */
export const USER_AVATAR_PUBLIC_PREFIX = '/avatars/user-avators/';

const FILENAMES = [
  'R1.avif',
  'R10.avif',
  'R11.avif',
  'R12.avif',
  'R13.avif',
  'R14.avif',
  'R15.avif',
  'R16.avif',
  'R17.avif',
  'R18.avif',
  'R19.avif',
  'R2.avif',
  'R20.avif',
  'R3.avif',
  'R4.avif',
  'R5.avif',
  'R6.avif',
  'R7.avif',
  'R8.avif',
  'R9.avif',
  'SR1.avif',
  'SR10.avif',
  'SR2.avif',
  'SR3.avif',
  'SR4.avif',
  'SR5.avif',
  'SR6.avif',
  'SR7.avif',
  'SR8.avif',
  'SR9.avif',
  'SSR1.avif',
  'SSR2.avif',
  'SSR3.avif',
  'SSR4.avif',
  'SSR5.avif',
  'collection_1.avif',
  'collection_2.avif',
] as const;

/** 设置页 / 创建页可选的预设头像（完整 public URL） */
export const USER_AVATAR_PRESET_URLS: readonly string[] = FILENAMES.map(
  (f) => `${USER_AVATAR_PUBLIC_PREFIX}${f}`,
);

/** 新用户默认头像（首项） */
export const DEFAULT_USER_PRESET_AVATAR: string =
  USER_AVATAR_PRESET_URLS[0] ?? '/avatars/user.png';
