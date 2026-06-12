import { backendJson } from '@/lib/utils/backend-api';

export type StudyMemoryApiTargetType = 'course' | 'notebook';
export type StudyMemoryApiScope = 'public' | 'private';
export type StudyMemoryApiStatus = 'active' | 'archived';

export type StudyMemoryApiRecord = {
  id: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: StudyMemoryApiTargetType;
  scope: StudyMemoryApiScope;
  kind: string;
  status: StudyMemoryApiStatus;
  source: string;
  title: string;
  text: string;
  reason: string | null;
  question: string | null;
  sourceReferences: unknown;
  createdAt: string;
  updatedAt: string;
};

export type StudyMemoryNotebookCounts = Record<
  string,
  { public: number; private: number; total: number }
>;

export async function listStudyMemoryRecords(args: {
  targetType: StudyMemoryApiTargetType;
  targetId: string;
}): Promise<StudyMemoryApiRecord[]> {
  const params = new URLSearchParams({
    targetType: args.targetType,
    targetId: args.targetId,
  });
  const data = await backendJson<{ memories: StudyMemoryApiRecord[] }>(
    `/api/study-memory?${params.toString()}`,
  );
  return data.memories;
}

export async function listNotebookStudyMemoryCounts(
  notebookIds: string[],
): Promise<StudyMemoryNotebookCounts> {
  const ids = Array.from(new Set(notebookIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const params = new URLSearchParams({ ids: ids.join(',') });
  const data = await backendJson<{ counts: StudyMemoryNotebookCounts }>(
    `/api/study-memory/notebook-counts?${params.toString()}`,
  );
  return data.counts;
}
