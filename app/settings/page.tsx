'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SettingsDialog } from '@/components/settings';
import type { SettingsSection } from '@/lib/types/settings';

const SECTION_KEYS = new Set<string>([
  'general',
  'providers',
  'agents',
  'tts',
  'asr',
  'pdf',
  'image',
  'web-search',
]);

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const initialSection = useMemo((): SettingsSection | undefined => {
    if (sectionParam && SECTION_KEYS.has(sectionParam)) {
      return sectionParam as SettingsSection;
    }
    return undefined;
  }, [sectionParam]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-2 absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
      </div>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 py-4 md:px-8 md:py-6">
        <section className="apple-glass flex min-h-0 flex-1 w-full flex-col overflow-hidden rounded-[28px] shadow-[0_20px_60px_rgba(15,23,42,0.06)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
          <div className="flex min-h-0 flex-1 flex-col">
            <SettingsDialog
              embedded
              open
              initialSection={initialSection}
              onOpenChange={(next) => {
                if (!next) router.push('/');
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 items-center justify-center apple-mesh-bg px-4 py-12">
          <div className="apple-glass rounded-[28px] px-8 py-6 text-sm text-muted-foreground">加载设置…</div>
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
