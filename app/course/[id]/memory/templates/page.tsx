import { CourseMemoryPageClient } from '@/components/memory/course-memory-page-client';

type CourseTemplateLibraryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CourseTemplateLibraryPage({
  params,
}: CourseTemplateLibraryPageProps) {
  const { id } = await params;
  return (
    <CourseMemoryPageClient
      courseId={id}
      initialTab="templates"
      pageTitle="模版库"
      pageEyebrow="课程记忆"
    />
  );
}
