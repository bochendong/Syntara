'use client';

import dynamic from 'next/dynamic';
import { CourseWorkspaceLoadingSkeleton } from '@/components/loading/app-page-skeletons';

const CourseDetailPageClient = dynamic(() => import('./course-detail-page-client'), {
  ssr: false,
  loading: () => <CourseWorkspaceLoadingSkeleton />,
});

export function CourseDetailClientEntry() {
  return <CourseDetailPageClient />;
}
