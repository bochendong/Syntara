'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthMode = 'none' | 'email' | 'oauth';

interface AuthState {
  isLoggedIn: boolean;
  userId: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  /** oauth：NextAuth 会话；email：邮箱登录（不验证邮箱所有权） */
  authMode: AuthMode;
  login: (payload: { name: string; email: string }) => void;
  syncFromOAuth: (payload: {
    userId: string;
    name: string;
    email: string;
    role?: 'USER' | 'ADMIN';
  }) => void;
  logout: () => void;
}

function buildUserId(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 'user-anonymous';
  const safe = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `user-${safe || 'anonymous'}`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      userId: '',
      name: '',
      email: '',
      role: 'USER',
      authMode: 'none',
      login: ({ name, email }) =>
        set({
          isLoggedIn: true,
          userId: buildUserId(email),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: 'USER',
          authMode: 'email',
        }),
      syncFromOAuth: ({ userId, name, email, role }) =>
        set({
          isLoggedIn: true,
          userId: userId.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: role ?? 'USER',
          authMode: 'oauth',
        }),
      logout: () =>
        set({
          isLoggedIn: false,
          userId: '',
          name: '',
          email: '',
          role: 'USER',
          authMode: 'none',
        }),
    }),
    {
      name: 'synatra-auth',
      version: 1,
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Partial<AuthState>;
        const rawAuthMode =
          typeof (persisted as { authMode?: unknown } | null | undefined)?.authMode === 'string'
            ? (persisted as { authMode?: string }).authMode
            : undefined;
        const migratedAuthMode: AuthMode =
          rawAuthMode === 'oauth'
            ? 'oauth'
            : rawAuthMode === 'email' || rawAuthMode === 'local'
              ? 'email'
              : 'none';
        const normalizedAuthMode: AuthMode = p.isLoggedIn
          ? migratedAuthMode === 'none'
            ? 'email'
            : migratedAuthMode
          : 'none';
        if (fromVersion === 0) {
          return {
            isLoggedIn: p.isLoggedIn ?? false,
            userId: p.userId ?? '',
            name: p.name ?? '',
            email: p.email ?? '',
            role: p.role ?? 'USER',
            authMode: normalizedAuthMode,
          };
        }
        return {
          ...(persisted as AuthState),
          authMode: normalizedAuthMode,
        };
      },
      partialize: (s) => ({
        isLoggedIn: s.isLoggedIn,
        userId: s.userId,
        name: s.name,
        email: s.email,
        role: s.role,
        authMode: s.authMode,
      }),
    },
  ),
);
