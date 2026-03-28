'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useAuthStore } from '@/lib/store/auth';

/** 结束 NextAuth 会话并清空本地 auth store，跳转到登录页 */
export function useAuthSignOut() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return useCallback(async () => {
    await signOut({ redirect: false });
    logout();
    router.push('/login');
  }, [logout, router]);
}
