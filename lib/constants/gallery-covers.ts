/**
 * 课程/笔记本卡片顶部封面用图（与头像素材无关）；按 seed 稳定映射。
 * 资源位于 `public/covers/`。
 */
export const GALLERY_COVER_PUBLIC_PREFIX = '/covers/';

const FILENAMES = [
  'cover-01.svg',
  'cover-02.svg',
  'cover-03.svg',
  'cover-04.svg',
  'cover-05.svg',
  'cover-06.svg',
  'cover-07.svg',
  'cover-08.svg',
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

/** 按 id 稳定选择一张封面图（无课件缩略图时使用） */
export function pickStableGalleryCoverUrl(seed: string): string {
  if (FILES.length === 0) return `${GALLERY_COVER_PUBLIC_PREFIX}cover-01.svg`;
  const i = hashStringToUint32(seed) % FILES.length;
  return `${GALLERY_COVER_PUBLIC_PREFIX}${FILES[i]}`;
}
