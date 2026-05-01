import { redirect } from 'next/navigation';
import { createNotebookHref } from '@/lib/constants/course-chat';

type CreatePageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: CreatePageSearchParams }) {
  const params = await searchParams;
  const rawCourseId = params.courseId;
  const courseId = Array.isArray(rawCourseId) ? rawCourseId[0] : rawCourseId;
  redirect(createNotebookHref(courseId));
}
