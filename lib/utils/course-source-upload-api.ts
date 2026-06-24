'use client';

import { backendJson } from '@/lib/utils/backend-api';

export type CourseSourceUploadRecord = {
  sourceHash: string;
  title: string;
  kind: string;
  fileMime: string | null;
  usageProfile: string | null;
  topic: string | null;
  coverImagePath: string | null;
  coverStatus: string | null;
  allQuestionUpload: boolean | null;
  notebookIds: string[];
  sectionIds: string[];
  problemIds: string[];
  importBatchIds: string[];
  memoryIds: string[];
  templateMemoryIds: string[];
  knowledgeGraphFactIds: string[];
  ragEntryIds: string[];
  openaiFileIds: string[];
  textSections: Array<{
    id: string;
    notebookId: string;
    title: string;
    order: number;
    markdown: string;
  }>;
  createdAt: string;
  updatedAt: string;
  stats: {
    notebookCount: number;
    sectionCount: number;
    problemCount: number;
    importBatchCount: number;
    memoryCount: number;
    templateMemoryCount: number;
    knowledgeGraphFactCount: number;
    ragEntryCount: number;
    openaiFileCount: number;
  };
};

export type DeleteCourseSourceUploadResult = {
  source: CourseSourceUploadRecord;
  deleted: {
    notebooks: number;
    sections: number;
    problems: number;
    importBatches: number;
    memories: number;
    templateMemories: number;
    memoryFacts: number;
    memoryFactEvents: number;
    ragEntries: number;
    openaiFiles: number;
  };
};

export async function listCourseSourceUploads(
  courseId: string,
): Promise<CourseSourceUploadRecord[]> {
  const data = await backendJson<{ uploads: CourseSourceUploadRecord[] }>(
    `/api/courses/${encodeURIComponent(courseId)}/source-uploads`,
  );
  return data.uploads;
}

export async function deleteCourseSourceUpload(args: {
  courseId: string;
  sourceHash: string;
}): Promise<DeleteCourseSourceUploadResult> {
  const data = await backendJson<{ result: DeleteCourseSourceUploadResult }>(
    `/api/courses/${encodeURIComponent(args.courseId)}/source-uploads/${encodeURIComponent(
      args.sourceHash,
    )}`,
    {
      method: 'DELETE',
    },
  );
  return data.result;
}
