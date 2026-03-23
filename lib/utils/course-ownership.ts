const OWNERSHIP_STORAGE_KEY = 'openmaic-course-ownership-v1';

type OwnershipMap = Record<string, string[]>;

function readOwnershipMap(): OwnershipMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OWNERSHIP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OwnershipMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeOwnershipMap(map: OwnershipMap) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(map));
}

export function markCourseOwnedByUser(userId: string, courseId: string) {
  if (!userId || !courseId) return;
  const map = readOwnershipMap();
  const owners = new Set(map[courseId] || []);
  owners.add(userId);
  map[courseId] = Array.from(owners);
  writeOwnershipMap(map);
}

/** 删除课程等场景：从当前用户的「我的课程」归属中移除 */
export function unmarkCourseOwnedByUser(userId: string, courseId: string) {
  if (!userId || !courseId) return;
  const map = readOwnershipMap();
  const owners = new Set(map[courseId] || []);
  owners.delete(userId);
  if (owners.size === 0) delete map[courseId];
  else map[courseId] = Array.from(owners);
  writeOwnershipMap(map);
}

export function getOwnedCourseIds(userId: string): string[] {
  if (!userId) return [];
  const map = readOwnershipMap();
  return Object.entries(map)
    .filter(([, owners]) => owners.includes(userId))
    .map(([courseId]) => courseId);
}

export function isCourseOwnedByUser(userId: string, courseId: string): boolean {
  if (!userId || !courseId) return false;
  const map = readOwnershipMap();
  return (map[courseId] || []).includes(userId);
}

/** 曾把「笔记本」stageId 记在 ownership 里时，迁移为所属课程 courseId */
export async function reconcileOwnedNotebookIds(userId: string): Promise<void> {
  void userId;
  // server-storage mode: ownership migration no longer depends on local stage records
}
