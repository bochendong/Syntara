'use client';

import { useSyncExternalStore } from 'react';

type PersistHydrationApi = {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
};

export function usePersistHydrated(store: PersistHydrationApi) {
  return useSyncExternalStore(
    (listener) => store.persist?.onFinishHydration(listener) ?? (() => {}),
    () => store.persist?.hasHydrated() ?? true,
    () => false,
  );
}
