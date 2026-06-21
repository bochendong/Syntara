import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CreatorDashboardClient } from '@/components/creator/creator-dashboard-client';

export default function CreatorPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60dvh] place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            加载创作者工作台…
          </div>
        </div>
      }
    >
      <CreatorDashboardClient />
    </Suspense>
  );
}
