/**
 * 与 `public/avatars/course-avators/` 下已提交文件一致；新增图片时请同步更新本列表。
 * （目录名保持仓库内现有拼写 course-avators。）
 */
export const COURSE_AVATAR_PUBLIC_PREFIX = '/avatars/course-avators/';

const FILENAMES = [
  '018e2d0f14d19506cf9ac099d4d38fa3.avif',
  '0ee8e0d4d6813c5302b4aee6e32e2953.avif',
  '2ef3d75cce2cd4291cf66cbea7e6373d.avif',
  '470cd1d163affc68b28d9799dcf370bf.avif',
  '5309f37253f61a420213c3a6e6f51859.avif',
  '6c3e6052e24261d73ee768fc0f16addb.avif',
  '767dee2c02f7954b500a9ec416d38e5b.avif',
  '7fcca1743513f7b64b5e1059fc343264.avif',
  '8cb73eee25b85f3d0e5a816c26e808b0.avif',
  '987600e3e51c1eff9829f67ae166aa85.avif',
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
  'e9f7231c571c065a0e656fe847731c2c.avif',
  'fcd722322e6c65c9dac7717a25aaa1c2.avif',
  'ff9e77e2a4a6d290d15d2a50449226cf.avif',
] as const;

const FILES: readonly string[] = FILENAMES;

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 新建课程时随机一张「课程主管」头像 */
export function pickRandomCourseAvatarUrl(): string {
  if (FILES.length === 0) return '/avatars/assist-2.png';
  const i = Math.floor(Math.random() * FILES.length);
  return `${COURSE_AVATAR_PUBLIC_PREFIX}${FILES[i]}`;
}

/**
 * 按课程 id 稳定映射；用于缺省补全与无 DB 字段时的展示（与写入 DB 后一致）。
 */
export function pickStableCourseAvatarUrl(seed: string): string {
  if (FILES.length === 0) return '/avatars/assist-2.png';
  const i = hashStringToUint32(seed) % FILES.length;
  return `${COURSE_AVATAR_PUBLIC_PREFIX}${FILES[i]}`;
}

/**
 * 优先使用已持久化的 `avatarUrl`；为空时用 `courseId` 稳定映射；再无 courseId 时用 seed 回退。
 */
export function resolveCourseAvatarDisplayUrl(
  courseId: string | null | undefined,
  storedAvatarUrl: string | null | undefined,
): string {
  const u = storedAvatarUrl?.trim();
  if (u) return u;
  const id = courseId?.trim();
  if (id) return pickStableCourseAvatarUrl(id);
  return pickStableCourseAvatarUrl('__no_course__');
}
