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
  'video',
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
    <div className="flex min-h-full w-full flex-col bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-6 dark:from-slate-950 dark:to-slate-900 md:px-8">
      <SettingsDialog
        embedded
        open
        initialSection={initialSection}
        onOpenChange={(next) => {
          if (!next) router.push('/');
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-muted-foreground">
          加载设置…
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
