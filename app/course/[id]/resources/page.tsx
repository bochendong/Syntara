import { CourseResourceLibraryPageClient } from '@/components/courses/course-resource-library-page-client';

type CourseResourceLibraryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CourseResourceLibraryPage({
  params,
}: CourseResourceLibraryPageProps) {
  const { id } = await params;
  return <CourseResourceLibraryPageClient courseId={id} />;
}
