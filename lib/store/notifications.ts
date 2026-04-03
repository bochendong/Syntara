'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppNotification, NotificationsResponse } from '@/lib/notifications/types';
import { backendJson } from '@/lib/utils/backend-api';

const MAX_TRACKED_READ_IDS = 400;
const MAX_ACTIVE_BANNERS = 2;

type NotificationReadMap = Record<string, string[]>;

interface RefreshOptions {
  userId?: string;
  silent?: boolean;
}

interface NotificationStoreState {
  activeUserId: string;
  databaseEnabled: boolean;
  notifications: AppNotification[];
  activeBanners: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  hasInitializedSession: boolean;
  readByUser: NotificationReadMap;
  setActiveUser: (userId: string) => void;
  clearSession: () => void;
  refreshNotifications: (options?: RefreshOptions) => Promise<void>;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  dismissBanner: (notificationId: string) => void;
}

function clampReadIds(ids: string[]): string[] {
  const unique = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
  return unique.slice(0, MAX_TRACKED_READ_IDS);
}

function buildReadSet(readByUser: NotificationReadMap, userId: string): Set<string> {
  return new Set(readByUser[userId] ?? []);
}

function countUnread(notifications: AppNotification[], readSet: Set<string>): number {
  return notifications.reduce((count, item) => count + (readSet.has(item.id) ? 0 : 1), 0);
}

export const useNotificationStore = create<NotificationStoreState>()(
  persist(
    (set, get) => ({
      activeUserId: '',
      databaseEnabled: false,
      notifications: [],
      activeBanners: [],
      unreadCount: 0,
      isLoading: false,
      hasInitializedSession: false,
      readByUser: {},
      setActiveUser: (userId) => {
        const normalizedUserId = userId.trim();
        if (normalizedUserId === get().activeUserId) return;

        set({
          activeUserId: normalizedUserId,
          databaseEnabled: false,
          notifications: [],
          activeBanners: [],
          unreadCount: 0,
          isLoading: false,
          hasInitializedSession: false,
        });
      },
      clearSession: () =>
        set({
          activeUserId: '',
          databaseEnabled: false,
          notifications: [],
          activeBanners: [],
          unreadCount: 0,
          isLoading: false,
          hasInitializedSession: false,
        }),
      refreshNotifications: async (options) => {
        const targetUserId = options?.userId?.trim() || get().activeUserId.trim();
        if (!targetUserId) {
          get().clearSession();
          return;
        }

        if (targetUserId !== get().activeUserId) {
          get().setActiveUser(targetUserId);
        }

        if (!options?.silent) {
          set({ isLoading: true });
        }

        try {
          const response = await backendJson<NotificationsResponse>('/api/notifications?limit=50');

          set((state) => {
            const readSet = buildReadSet(state.readByUser, targetUserId);
            const existingIds = new Set(
              state.activeUserId === targetUserId ? state.notifications.map((item) => item.id) : [],
            );
            const incomingBanners =
              state.hasInitializedSession && state.activeUserId === targetUserId
                ? response.notifications.filter(
                    (item) =>
                      item.presentation === 'banner' &&
                      !readSet.has(item.id) &&
                      !existingIds.has(item.id),
                  )
                : [];
            const seenBannerIds = new Set<string>();
            const nextBanners: AppNotification[] = [];

            for (const item of [...incomingBanners, ...state.activeBanners]) {
              if (readSet.has(item.id) || seenBannerIds.has(item.id)) continue;
              seenBannerIds.add(item.id);
              nextBanners.push(item);
              if (nextBanners.length >= MAX_ACTIVE_BANNERS) break;
            }

            return {
              activeUserId: targetUserId,
              databaseEnabled: response.databaseEnabled,
              notifications: response.notifications,
              activeBanners: nextBanners,
              unreadCount: countUnread(response.notifications, readSet),
              isLoading: false,
              hasInitializedSession: true,
            };
          });
        } catch {
          set({ isLoading: false });
        }
      },
      markAsRead: (notificationId) =>
        set((state) => {
          const userId = state.activeUserId.trim();
          if (!userId || !notificationId.trim()) return {};

          const nextIds = clampReadIds([notificationId, ...(state.readByUser[userId] ?? [])]);
          const nextReadByUser = {
            ...state.readByUser,
            [userId]: nextIds,
          };
          const nextReadSet = new Set(nextIds);

          return {
            readByUser: nextReadByUser,
            activeBanners: state.activeBanners.filter((item) => item.id !== notificationId),
            unreadCount: countUnread(state.notifications, nextReadSet),
          };
        }),
      markAllAsRead: () =>
        set((state) => {
          const userId = state.activeUserId.trim();
          if (!userId || state.notifications.length === 0) return {};

          const nextIds = clampReadIds([
            ...state.notifications.map((item) => item.id),
            ...(state.readByUser[userId] ?? []),
          ]);

          return {
            readByUser: {
              ...state.readByUser,
              [userId]: nextIds,
            },
            activeBanners: [],
            unreadCount: 0,
          };
        }),
      dismissBanner: (notificationId) =>
        set((state) => ({
          activeBanners: state.activeBanners.filter((item) => item.id !== notificationId),
        })),
    }),
    {
      name: 'synatra-notifications',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        readByUser: state.readByUser,
      }),
    },
  ),
);
