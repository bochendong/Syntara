/**
 * Built-in course hero backgrounds. These reuse the platform's generated visual
 * language from slide backgrounds while keeping course pages fully local.
 */
const COURSE_BACKGROUND_FILES: readonly string[] = [
  '/slide-backgrounds/academy-watercolor.png',
  '/slide-backgrounds/academic-blueprint-photo.png',
  '/slide-backgrounds/lecture-hall-photo.png',
  '/slide-backgrounds/workspace-desk-photo.png',
  '/slide-backgrounds/science-lab-photo.png',
  '/slide-backgrounds/magazine-courtyard-photo.png',
  '/slide-backgrounds/city-strategy-photo.png',
  '/slide-backgrounds/forest-path-photo.png',
] as const;

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Course ids are random, so this gives each newly created course a random-feeling
 * background while keeping the selected image stable across refreshes.
 */
export function pickStableCourseBackgroundUrl(seed: string): string {
  if (COURSE_BACKGROUND_FILES.length === 0) return '/slide-backgrounds/academy-watercolor.png';
  const i = hashStringToUint32(seed) % COURSE_BACKGROUND_FILES.length;
  return COURSE_BACKGROUND_FILES[i];
}

export function resolveCourseBackgroundDisplayUrl(courseId: string | null | undefined): string {
  const id = courseId?.trim();
  return pickStableCourseBackgroundUrl(id || '__no_course__');
}
