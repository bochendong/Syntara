'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { GlobalNotificationOverlay } from '@/components/notifications/global-notification-overlay';

const POLL_INTERVAL_MS = 8000;

export function NotificationCenterProvider() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const clearSession = useNotificationStore((state) => state.clearSession);
  const refreshNotifications = useNotificationStore((state) => state.refreshNotifications);
  const setActiveUser = useNotificationStore((state) => state.setActiveUser);

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

  return <GlobalNotificationOverlay />;
}
