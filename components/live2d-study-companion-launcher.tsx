'use client';

import dynamic from 'next/dynamic';
import { useSettingsStore } from '@/lib/store/settings';

const Live2DStudyCompanion = dynamic(
  () => import('@/components/live2d-study-companion').then((mod) => mod.Live2DStudyCompanion),
  { ssr: false, loading: () => null },
);

export function Live2DStudyCompanionLauncher() {
  const visible = useSettingsStore((state) => state.live2dPresenterVisible);

  if (!visible) {
    return null;
  }

  return <Live2DStudyCompanion />;
}
