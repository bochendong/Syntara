import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { LearnPageClient } from '@/components/learn/learn-page-client';

export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[70dvh] place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            加载新版学习页…
          </div>
        </div>
      }
    >
      <LearnPageClient />
    </Suspense>
  );
}
