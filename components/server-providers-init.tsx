'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * Fetches server-configured providers on mount and merges into settings store.
 * Renders nothing — purely a side-effect component.
 */
export function ServerProvidersInit() {
  const pathname = usePathname();
  const fetchServerProviders = useSettingsStore((state) => state.fetchServerProviders);
  const isLocalMemoryTest = pathname?.startsWith('/test/memory-') === true;

  useEffect(() => {
    if (isLocalMemoryTest) return;
    fetchServerProviders();
  }, [fetchServerProviders, isLocalMemoryTest]);

  return null;
}
