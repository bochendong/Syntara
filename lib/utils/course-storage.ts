import type { CommunityCourseListItem, CoursePurpose, CourseRecord } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';
import { notifyCreditsBalancesChanged } from '@/lib/utils/credits-balance-events';

/** 已切换到后端数据库；保留常量兼容旧代码引用 */
export const LEGACY_COURSE_ID = 'synatra-legacy-course';

/** IndexedDB 迁移逻辑已停用 */
export async function ensureLegacyCourseBucket(): Promise<void> {}

/** IndexedDB 迁移逻辑已停用 */
export async function pruneEmptyLegacyCourse(): Promise<void> {}

export interface CreateCourseInput {
  name: string;
  description: string;
  language: 'zh-CN' | 'en-US';
  tags: string[];
  purpose: CoursePurpose;
  university?: string;
  courseCode?: string;
  avatarUrl?: string;
  listedInCourseStore?: boolean;
  coursePriceCents?: number;
}

export async function createCourse(input: CreateCourseInput): Promise<CourseRecord> {
  const isUni = input.purpose === 'university';
  const data = await backendJson<{ course: CourseRecord }>('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.trim() || '未命名课程',
      description: input.description.trim() || undefined,
      language: input.language,
      tags: input.tags,
      purpose: input.purpose,
      university: isUni ? input.university?.trim() || undefined : undefined,
      courseCode: isUni ? input.courseCode?.trim() || undefined : undefined,
      avatarUrl: input.avatarUrl?.trim() || undefined,
      coursePriceCents: input.coursePriceCents ?? 0,
      ...(input.listedInCourseStore !== undefined
        ? { listedInCourseStore: input.listedInCourseStore }
        : {}),
    }),
  });
  return data.course;
}

export type UpdateCourseInput = CreateCourseInput;

export async function updateCourse(id: string, input: UpdateCourseInput): Promise<CourseRecord> {
  const isUni = input.purpose === 'university';
  const data = await backendJson<{ course: CourseRecord }>(
    `/api/courses/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name.trim() || '未命名课程',
        description: input.description.trim() || undefined,
        language: input.language,
        tags: input.tags,
        purpose: input.purpose,
        university: isUni ? input.university?.trim() || undefined : undefined,
        courseCode: isUni ? input.courseCode?.trim() || undefined : undefined,
        avatarUrl: input.avatarUrl?.trim() || undefined,
        coursePriceCents: input.coursePriceCents ?? 0,
        ...(input.listedInCourseStore !== undefined
          ? { listedInCourseStore: input.listedInCourseStore }
          : {}),
      }),
    },
  );
  return data.course;
}

export async function listCommunityStoreCourses(): Promise<CommunityCourseListItem[]> {
  const data = await backendJson<{ courses: CommunityCourseListItem[] }>('/api/courses/store');
  return data.courses;
}

export async function cloneCourseFromStore(sourceCourseId: string): Promise<CourseRecord> {
  const data = await backendJson<{ course: CourseRecord }>('/api/courses/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceCourseId }),
  });
  notifyCreditsBalancesChanged();
  return data.course;
}

export async function listCourses(): Promise<CourseRecord[]> {
  const data = await backendJson<{ courses: CourseRecord[] }>('/api/courses');
  return data.courses;
}

export async function getCourse(id: string): Promise<CourseRecord | undefined> {
  try {
    const data = await backendJson<{ course: CourseRecord }>(
      `/api/courses/${encodeURIComponent(id)}`,
    );
    return data.course;
  } catch {
    return undefined;
  }
}

export async function touchCourseUpdatedAt(courseId: string): Promise<void> {
  await backendJson<{ course: CourseRecord }>(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function deleteCourseAndNotebooks(courseId: string): Promise<void> {
  await backendJson<{ ok: true }>(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
  });
}
