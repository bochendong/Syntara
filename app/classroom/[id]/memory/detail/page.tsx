import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { NotebookMemoryDetailPageClient } from '@/features/memory/components/notebook-memory-detail-page-client';

type NotebookMemoryDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ memoryId?: string | string[] }>;
};

export default async function NotebookMemoryDetailPage({
  params,
  searchParams,
}: NotebookMemoryDetailPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const rawMemoryId = resolvedSearchParams.memoryId;
  const memoryId = Array.isArray(rawMemoryId) ? rawMemoryId[0] : rawMemoryId;

  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          加载记忆详情…
        </div>
      }
    >
      <NotebookMemoryDetailPageClient notebookId={resolvedParams.id} memoryId={memoryId} />
    </Suspense>
  );
}
