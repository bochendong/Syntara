'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppNotification, NotificationsResponse } from '@/lib/notifications/types';
import { backendJson } from '@/lib/utils/backend-api';

const MAX_TRACKED_READ_IDS = 400;
const MAX_ACTIVE_BANNERS = 1;

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
  dismissedBannerIds: string[];
  queuedLocalBanners: AppNotification[];
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
  enqueueBanner: (notification: AppNotification) => void;
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

function buildNextActiveBanners(args: {
  notifications: AppNotification[];
  activeBanners: AppNotification[];
  readSet: Set<string>;
  queuedLocalBanners?: AppNotification[];
  incomingBanners?: AppNotification[];
  excludeIds?: string[];
}): AppNotification[] {
  const seen = new Set<string>();
  const excluded = new Set(args.excludeIds ?? []);
  const queue = [
    ...args.activeBanners,
    ...(args.queuedLocalBanners ?? []),
    ...(args.incomingBanners ?? []),
    ...args.notifications.filter((item) => item.presentation === 'banner'),
  ];
  const next: AppNotification[] = [];

  for (const item of queue) {
    if (item.presentation !== 'banner') continue;
    if (args.readSet.has(item.id) || excluded.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
    if (next.length >= MAX_ACTIVE_BANNERS) break;
  }

  return next;
}

export const useNotificationStore = create<NotificationStoreState>()(
  persist(
    (set, get) => ({
      activeUserId: '',
      databaseEnabled: false,
      notifications: [],
      activeBanners: [],
      dismissedBannerIds: [],
      queuedLocalBanners: [],
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
          dismissedBannerIds: [],
          queuedLocalBanners: [],
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
          dismissedBannerIds: [],
          queuedLocalBanners: [],
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
            const nextBanners = buildNextActiveBanners({
              notifications: response.notifications,
              activeBanners: state.activeBanners,
              readSet,
              queuedLocalBanners: state.queuedLocalBanners,
              incomingBanners,
              excludeIds: state.dismissedBannerIds,
            });

            return {
              activeUserId: targetUserId,
              databaseEnabled: response.databaseEnabled,
              notifications: response.notifications,
              activeBanners: nextBanners,
              dismissedBannerIds: state.dismissedBannerIds,
              queuedLocalBanners: state.queuedLocalBanners,
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
            activeBanners: buildNextActiveBanners({
              notifications: state.notifications,
              activeBanners: state.activeBanners.filter((item) => item.id !== notificationId),
              readSet: nextReadSet,
              queuedLocalBanners: state.queuedLocalBanners.filter(
                (item) => item.id !== notificationId,
              ),
              excludeIds: [...state.dismissedBannerIds, notificationId],
            }),
            queuedLocalBanners: state.queuedLocalBanners.filter(
              (item) => item.id !== notificationId,
            ),
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
            queuedLocalBanners: [],
            unreadCount: 0,
          };
        }),
      dismissBanner: (notificationId) =>
        set((state) => {
          const userId = state.activeUserId.trim();
          const nextReadIds = userId
            ? clampReadIds([notificationId, ...(state.readByUser[userId] ?? [])])
            : [];
          const nextReadByUser = userId
            ? {
                ...state.readByUser,
                [userId]: nextReadIds,
              }
            : state.readByUser;
          const nextReadSet = userId ? new Set(nextReadIds) : buildReadSet(state.readByUser, userId);
          const nextDismissed = clampReadIds([notificationId, ...state.dismissedBannerIds]);
          return {
            readByUser: nextReadByUser,
            dismissedBannerIds: nextDismissed,
            queuedLocalBanners: state.queuedLocalBanners.filter(
              (item) => item.id !== notificationId,
            ),
            activeBanners: buildNextActiveBanners({
              notifications: state.notifications,
              activeBanners: state.activeBanners.filter((item) => item.id !== notificationId),
              readSet: nextReadSet,
              queuedLocalBanners: state.queuedLocalBanners.filter(
                (item) => item.id !== notificationId,
              ),
              excludeIds: nextDismissed,
            }),
            unreadCount: countUnread(state.notifications, nextReadSet),
          };
        }),
      enqueueBanner: (notification) =>
        set((state) => {
          const alreadyQueued =
            state.activeBanners.some((item) => item.id === notification.id) ||
            state.queuedLocalBanners.some((item) => item.id === notification.id);
          if (alreadyQueued) return {};
          const nextQueued =
            state.activeBanners.length === 0
              ? state.queuedLocalBanners
              : [...state.queuedLocalBanners, notification];
          return {
            queuedLocalBanners: nextQueued,
            activeBanners:
              state.activeBanners.length === 0
                ? [notification]
                : buildNextActiveBanners({
                    notifications: state.notifications,
                    activeBanners: state.activeBanners,
                    readSet: buildReadSet(state.readByUser, state.activeUserId),
                    queuedLocalBanners: nextQueued,
                    excludeIds: state.dismissedBannerIds,
                  }),
          };
        }),
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
