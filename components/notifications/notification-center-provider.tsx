'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { backendJson } from '@/lib/utils/backend-api';
import type { GamificationSummaryResponse } from '@/lib/types/gamification';
import {
  leftRailStageCosmeticKey,
  notificationStageCosmeticKey,
} from '@/lib/constants/profile-cosmetics';
import { userAvatarFrameRequiredLevel } from '@/lib/constants/user-avatar-frames';

const GlobalNotificationOverlay = dynamic(
  () =>
    import('@/components/notifications/global-notification-overlay').then(
      (mod) => mod.GlobalNotificationOverlay,
    ),
  { ssr: false },
);

function shouldSuppressNotificationCenter(pathname: string | null): boolean {
  return Boolean(
    pathname === '/' ||
      pathname === '/test' ||
      pathname?.startsWith('/test/') ||
      pathname === '/generation-tests' ||
      pathname === '/generation-quality' ||
      /^\/[^/]+-test(?:\/|$)/.test(pathname || '') ||
      pathname === '/login' ||
      pathname?.startsWith('/login/') ||
      pathname === '/register' ||
    pathname?.startsWith('/register/') ||
    pathname === '/live2d' ||
    pathname?.startsWith('/live2d/'),
  );
}

export function NotificationCenterProvider() {
  const pathname = usePathname();
  const suppressNotificationCenter = shouldSuppressNotificationCenter(pathname);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const clearSession = useNotificationStore((state) => state.clearSession);
  const refreshNotifications = useNotificationStore((state) => state.refreshNotifications);
  const setActiveUser = useNotificationStore((state) => state.setActiveUser);
  const activeBannerCount = useNotificationStore((state) => state.activeBanners.length);
  const notificationBarStageId = useUserProfileStore((state) => state.notificationBarStageId);
  const leftRailBarStageId = useUserProfileStore((state) => state.leftRailBarStageId);
  const avatarFrameId = useUserProfileStore((state) => state.avatarFrameId);
  const setNotificationBarStageId = useUserProfileStore((state) => state.setNotificationBarStageId);
  const setLeftRailBarStageId = useUserProfileStore((state) => state.setLeftRailBarStageId);
  const setAvatarFrameId = useUserProfileStore((state) => state.setAvatarFrameId);

  useEffect(() => {
    if (suppressNotificationCenter) return;
    const normalizedUserId = userId.trim();

    if (!isLoggedIn || !normalizedUserId) {
      clearSession();
      return;
    }

    setActiveUser(normalizedUserId);
    void refreshNotifications({ userId: normalizedUserId });
  }, [
    clearSession,
    isLoggedIn,
    refreshNotifications,
    setActiveUser,
    suppressNotificationCenter,
    userId,
  ]);

  useEffect(() => {
    if (suppressNotificationCenter) return;
    if (!isLoggedIn || !userId.trim()) return;

    let cancelled = false;
    void backendJson<GamificationSummaryResponse>('/api/gamification/summary')
      .then((summary) => {
        if (cancelled || !summary.databaseEnabled) return;
        const owned = new Set(summary.cosmeticInventory.ownedKeys);
        if (!owned.has(notificationStageCosmeticKey(notificationBarStageId))) {
          setNotificationBarStageId('soft-aurora');
        }
        if (!owned.has(leftRailStageCosmeticKey(leftRailBarStageId))) {
          setLeftRailBarStageId('default');
        }
        if (summary.profile.affinityLevel < userAvatarFrameRequiredLevel(avatarFrameId)) {
          setAvatarFrameId('none');
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    avatarFrameId,
    isLoggedIn,
    leftRailBarStageId,
    notificationBarStageId,
    setAvatarFrameId,
    setLeftRailBarStageId,
    setNotificationBarStageId,
    suppressNotificationCenter,
    userId,
  ]);

  if (suppressNotificationCenter || activeBannerCount === 0) return null;

  return <GlobalNotificationOverlay />;
}
