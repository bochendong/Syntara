'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { GlobalNotificationOverlay } from '@/components/notifications/global-notification-overlay';
import { backendJson } from '@/lib/utils/backend-api';
import type { GamificationSummaryResponse } from '@/lib/types/gamification';
import {
  leftRailStageCosmeticKey,
  notificationStageCosmeticKey,
} from '@/lib/constants/profile-cosmetics';
import { userAvatarFrameRequiredLevel } from '@/lib/constants/user-avatar-frames';

const POLL_INTERVAL_MS = 8000;

export function NotificationCenterProvider() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const clearSession = useNotificationStore((state) => state.clearSession);
  const refreshNotifications = useNotificationStore((state) => state.refreshNotifications);
  const setActiveUser = useNotificationStore((state) => state.setActiveUser);
  const notificationBarStageId = useUserProfileStore((state) => state.notificationBarStageId);
  const leftRailBarStageId = useUserProfileStore((state) => state.leftRailBarStageId);
  const avatarFrameId = useUserProfileStore((state) => state.avatarFrameId);
  const setNotificationBarStageId = useUserProfileStore((state) => state.setNotificationBarStageId);
  const setLeftRailBarStageId = useUserProfileStore((state) => state.setLeftRailBarStageId);
  const setAvatarFrameId = useUserProfileStore((state) => state.setAvatarFrameId);

  useEffect(() => {
    const normalizedUserId = userId.trim();

    if (!isLoggedIn || !normalizedUserId) {
      clearSession();
      return;
    }

    setActiveUser(normalizedUserId);
    void refreshNotifications({ userId: normalizedUserId });

    const refreshSilently = () => {
      void refreshNotifications({ userId: normalizedUserId, silent: true });
    };

    const intervalId = window.setInterval(refreshSilently, POLL_INTERVAL_MS);
    const handleFocus = () => refreshSilently();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearSession, isLoggedIn, refreshNotifications, setActiveUser, userId]);

  useEffect(() => {
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
    userId,
  ]);

  return <GlobalNotificationOverlay />;
}
