'use client';

import { useSearchParams } from 'next/navigation';
import { NotebookMemoryPageClient } from '@/components/memory/notebook-memory-page-client';

export function PrivateMemoryPageClient() {
  const searchParams = useSearchParams();
  const notebookId = searchParams.get('notebook');

  return (
    <NotebookMemoryPageClient
      notebookId={notebookId}
      backHref={notebookId ? `/chat?notebook=${encodeURIComponent(notebookId)}` : '/chat'}
      backLabel="返回聊天"
    />
  );
}
