import { CourseMemoryPageClient } from '@/components/memory/course-memory-page-client';

type CourseMemoryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CourseMemoryPage({ params }: CourseMemoryPageProps) {
  const { id } = await params;
  return <CourseMemoryPageClient courseId={id} />;
}
