import type { Slide } from '@/lib/types/slides';
import type { CourseProblemClientSummary } from '@/lib/utils/notebook-problem-api';

const CACHE_PREFIX = 'syntara-course-workspace-cache:';

export type CourseWorkspaceCache = {
  courseId: string;
  notebookSignature: string;
  notebookIds: string[];
  thumbnails: Record<string, Slide>;
  memoryCounts: Record<string, number>;
  problemCounts: Record<string, number>;
  courseProblems: CourseProblemClientSummary[];
  savedAt: number;
};

const memoryCache = new Map<string, CourseWorkspaceCache>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function cacheKey(courseId: string): string {
  return `${CACHE_PREFIX}${courseId}`;
}

function decodePathPart(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readStoredCache(courseId: string): CourseWorkspaceCache | null {
  const cached = memoryCache.get(courseId);
  if (cached) return cached;
  if (!isBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(cacheKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CourseWorkspaceCache;
    if (parsed?.courseId !== courseId || !parsed.notebookSignature) return null;
    memoryCache.set(courseId, parsed);
    return parsed;
  } catch {
    clearCourseWorkspaceCache(courseId);
    return null;
  }
}

function listKnownCaches(): CourseWorkspaceCache[] {
  const known = new Map(memoryCache);
  if (!isBrowser()) return Array.from(known.values());

  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      const courseId = key.slice(CACHE_PREFIX.length);
      const cached = readStoredCache(courseId);
      if (cached) known.set(courseId, cached);
    }
  } catch {}

  return Array.from(known.values());
}

export function buildCourseNotebookSignature(
  notebooks: Array<{ id: string; updatedAt: number; sceneCount?: number }>,
): string {
  return notebooks
    .map((notebook) => `${notebook.id}:${notebook.updatedAt}:${notebook.sceneCount ?? 0}`)
    .sort()
    .join('|');
}

export function readCourseWorkspaceCache(
  courseId: string,
  notebookSignature: string,
): CourseWorkspaceCache | null {
  const cached = readStoredCache(courseId);
  if (!cached || cached.notebookSignature !== notebookSignature) return null;
  return cached;
}

export function writeCourseWorkspaceCache(cache: CourseWorkspaceCache): void {
  memoryCache.set(cache.courseId, cache);
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(cacheKey(cache.courseId), JSON.stringify(cache));
  } catch {
    // Keep the in-memory cache even if sessionStorage is unavailable or full.
  }
}

export function clearCourseWorkspaceCache(courseId: string): void {
  memoryCache.delete(courseId);
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(cacheKey(courseId));
  } catch {}
}

function clearAllCourseWorkspaceCachesExcept(courseIdToKeep: string | null): void {
  for (const courseId of Array.from(memoryCache.keys())) {
    if (courseId !== courseIdToKeep) memoryCache.delete(courseId);
  }
  if (!isBrowser()) return;

  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      const courseId = key.slice(CACHE_PREFIX.length);
      if (courseId !== courseIdToKeep) window.sessionStorage.removeItem(key);
    }
  } catch {}
}

function courseIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/course\/([^/]+)/);
  return decodePathPart(match?.[1]);
}

function notebookIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/(?:classroom|review)\/([^/]+)/);
  return decodePathPart(match?.[1]);
}

export function pruneCourseWorkspaceCachesForPathname(pathname: string | null): void {
  const activeCourseId = courseIdFromPathname(pathname);
  if (activeCourseId) {
    clearAllCourseWorkspaceCachesExcept(activeCourseId);
    return;
  }

  const activeNotebookId = notebookIdFromPathname(pathname);
  if (activeNotebookId) {
    const matchingCourse = listKnownCaches().find((cache) =>
      cache.notebookIds.includes(activeNotebookId),
    );
    clearAllCourseWorkspaceCachesExcept(matchingCourse?.courseId ?? null);
    return;
  }

  clearAllCourseWorkspaceCachesExcept(null);
}
