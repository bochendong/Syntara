'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { useAuthStore } from '@/lib/store/auth';

function AuthSessionSync() {
  const { data: session, status } = useSession();
  const syncFromOAuth = useAuthStore((s) => s.syncFromOAuth);
  const logout = useAuthStore((s) => s.logout);
  const authMode = useAuthStore((s) => s.authMode);

  useEffect(() => {
    if (status === 'loading') return;
    if (session?.user?.id) {
      syncFromOAuth({
        userId: session.user.id,
        name: session.user.name?.trim() ?? '',
        email: session.user.email?.trim().toLowerCase() ?? '',
      });
    } else if (status === 'unauthenticated' && authMode === 'oauth') {
      logout();
    }
  }, [session, status, syncFromOAuth, logout, authMode]);

  return null;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthSessionSync />
      {children}
    </SessionProvider>
  );
}
