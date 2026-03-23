import type { CourseRecord } from '@/lib/utils/database';
import type { StageListItem } from '@/lib/utils/stage-storage';

/** 大学课程用途下：学校 · 课号 */
export function schoolLineFromCourse(c: CourseRecord): string | undefined {
  if (c.purpose !== 'university') return undefined;
  const parts = [c.university?.trim(), c.courseCode?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** 商城等：笔记本所属课程名 + 学校行 */
export function notebookCourseContext(
  nb: Pick<StageListItem, 'courseId'>,
  courseById: Map<string, CourseRecord>,
): { parentCourseName: string; schoolLine?: string } {
  if (!nb.courseId) {
    return { parentCourseName: '未归档笔记本' };
  }
  const c = courseById.get(nb.courseId);
  if (!c) {
    return { parentCourseName: '未知课程' };
  }
  return {
    parentCourseName: c.name.trim() || '未命名课程',
    schoolLine: schoolLineFromCourse(c),
  };
}
