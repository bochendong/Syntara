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
  deletedByUser: NotificationReadMap;
  setActiveUser: (userId: string) => void;
  clearSession: () => void;
  refreshNotifications: (options?: RefreshOptions) => Promise<void>;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (notificationId: string) => void;
  clearNotifications: () => void;
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

function canShowAsBanner(item: AppNotification): boolean {
  return item.presentation === 'banner' && item.kind !== 'credit_spent';
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
    ...args.notifications.filter(canShowAsBanner),
  ];
  const next: AppNotification[] = [];

  for (const item of queue) {
    if (!canShowAsBanner(item)) continue;
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
      deletedByUser: {},
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
            const deletedSet = buildReadSet(state.deletedByUser, targetUserId);
            const visibleNotifications = response.notifications.filter(
              (item) => !deletedSet.has(item.id),
            );
            const existingIds = new Set(
              state.activeUserId === targetUserId ? state.notifications.map((item) => item.id) : [],
            );
            const incomingBanners =
              state.hasInitializedSession && state.activeUserId === targetUserId
                ? visibleNotifications.filter(
                    (item) =>
                      canShowAsBanner(item) && !readSet.has(item.id) && !existingIds.has(item.id),
                  )
                : [];
            const nextBanners = buildNextActiveBanners({
              notifications: visibleNotifications,
              activeBanners: state.activeBanners.filter((item) => !deletedSet.has(item.id)),
              readSet,
              queuedLocalBanners: state.queuedLocalBanners.filter(
                (item) => !deletedSet.has(item.id),
              ),
              incomingBanners,
              excludeIds: state.dismissedBannerIds,
            });

            return {
              activeUserId: targetUserId,
              databaseEnabled: response.databaseEnabled,
              notifications: visibleNotifications,
              activeBanners: nextBanners,
              dismissedBannerIds: state.dismissedBannerIds,
              queuedLocalBanners: state.queuedLocalBanners.filter(
                (item) => !deletedSet.has(item.id),
              ),
              unreadCount: countUnread(visibleNotifications, readSet),
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
      deleteNotification: (notificationId) =>
        set((state) => {
          const userId = state.activeUserId.trim();
          const normalizedNotificationId = notificationId.trim();
          if (!userId || !normalizedNotificationId) return {};

          const nextNotifications = state.notifications.filter(
            (item) => item.id !== normalizedNotificationId,
          );
          const nextDeletedIds = clampReadIds([
            normalizedNotificationId,
            ...(state.deletedByUser[userId] ?? []),
          ]);
          const nextReadSet = buildReadSet(state.readByUser, userId);
          const nextDismissed = clampReadIds([
            normalizedNotificationId,
            ...state.dismissedBannerIds,
          ]);

          return {
            deletedByUser: {
              ...state.deletedByUser,
              [userId]: nextDeletedIds,
            },
            notifications: nextNotifications,
            activeBanners: buildNextActiveBanners({
              notifications: nextNotifications,
              activeBanners: state.activeBanners.filter(
                (item) => item.id !== normalizedNotificationId,
              ),
              readSet: nextReadSet,
              queuedLocalBanners: state.queuedLocalBanners.filter(
                (item) => item.id !== normalizedNotificationId,
              ),
              excludeIds: nextDismissed,
            }),
            dismissedBannerIds: nextDismissed,
            queuedLocalBanners: state.queuedLocalBanners.filter(
              (item) => item.id !== normalizedNotificationId,
            ),
            unreadCount: countUnread(nextNotifications, nextReadSet),
          };
        }),
      clearNotifications: () =>
        set((state) => {
          const userId = state.activeUserId.trim();
          if (!userId || state.notifications.length === 0) return {};

          const notificationIds = state.notifications.map((item) => item.id);
          const nextDeletedIds = clampReadIds([
            ...notificationIds,
            ...(state.deletedByUser[userId] ?? []),
          ]);
          const nextDismissed = clampReadIds([...notificationIds, ...state.dismissedBannerIds]);

          return {
            deletedByUser: {
              ...state.deletedByUser,
              [userId]: nextDeletedIds,
            },
            notifications: [],
            activeBanners: [],
            dismissedBannerIds: nextDismissed,
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
          const nextReadSet = userId
            ? new Set(nextReadIds)
            : buildReadSet(state.readByUser, userId);
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
          const deletedSet = buildReadSet(state.deletedByUser, state.activeUserId);
          if (deletedSet.has(notification.id)) return {};

          const alreadyQueued =
            state.activeBanners.some((item) => item.id === notification.id) ||
            state.queuedLocalBanners.some((item) => item.id === notification.id) ||
            state.notifications.some((item) => item.id === notification.id);
          if (alreadyQueued) return {};
          if (!canShowAsBanner(notification)) {
            return {
              notifications: [notification, ...state.notifications].slice(0, 50),
              unreadCount: state.unreadCount + 1,
            };
          }
          const nextQueued =
            state.activeBanners.length === 0
              ? state.queuedLocalBanners
              : [...state.queuedLocalBanners, notification];
          return {
            notifications: [notification, ...state.notifications].slice(0, 50),
            unreadCount: state.unreadCount + 1,
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
        deletedByUser: state.deletedByUser,
      }),
    },
  ),
);
