import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { PrivateMemoryPageClient } from '@/features/memory/components/private-memory-page-client';

export default function PrivateMemoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          加载笔记本记忆…
        </div>
      }
    >
      <PrivateMemoryPageClient />
    </Suspense>
  );
}
