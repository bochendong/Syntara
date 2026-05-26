import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { NotebookMemoryPageClient } from '@/features/memory/components/notebook-memory-page-client';

type NotebookMemoryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NotebookMemoryPage({ params }: NotebookMemoryPageProps) {
  const resolvedParams = await params;
  const notebookId = resolvedParams.id;

  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          加载笔记本记忆…
        </div>
      }
    >
      <NotebookMemoryPageClient notebookId={notebookId} backLabel="返回课程" />
    </Suspense>
  );
}
