import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { PracticePlanPageClient } from '@/components/learn/practice-plan-page-client';

export default async function PracticePlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;

  return (
    <Suspense
      fallback={
        <div className="grid min-h-[70dvh] place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            加载练习…
          </div>
        </div>
      }
    >
      <PracticePlanPageClient planId={planId} />
    </Suspense>
  );
}
