import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CreatorCourseStudioClient } from '@/components/creator/creator-course-studio-client';

export default async function CreatorCourseStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60dvh] place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            加载课程 Studio…
          </div>
        </div>
      }
    >
      <CreatorCourseStudioClient courseId={id} />
    </Suspense>
  );
}
