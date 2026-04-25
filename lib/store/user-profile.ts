/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_USER_PRESET_AVATAR, USER_AVATAR_PRESET_URLS } from '@/lib/constants/user-avatars';
import {
  DEFAULT_USER_AVATAR_FRAME_ID,
  isValidUserAvatarFrameId,
} from '@/lib/constants/user-avatar-frames';
import type { UserAvatarFrameId } from '@/lib/constants/user-avatar-frames';
import type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import { isValidNotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import type { NotificationCardStyleChoice } from '@/lib/notifications/card-theme';

function isValidNotificationStyleChoice(v: unknown): v is NotificationCardStyleChoice {
  return (
    v === 'auto' || v === 'green' || v === 'blue' || v === 'yellow' || v === 'purple' || v === 'pink'
  );
}

/** 设置里可选的预设头像（`public/avatars/user-avators/`） */
export const AVATAR_OPTIONS = USER_AVATAR_PRESET_URLS;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  /** 通知横幅配色：`auto` 为按通知类型，否则为固定主色 */
  notificationCardStyle: NotificationCardStyleChoice;
  /** 通知弹层/预览使用的舞台动效（与 `NOTIFICATION_BAR_STAGE_OPTIONS` 一致） */
  notificationBarStageId: NotificationBarStageId;
  /** 个人中心圆头像外框（见 `USER_AVATAR_FRAME_OPTIONS`） */
  avatarFrameId: UserAvatarFrameId;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
  setNotificationCardStyle: (choice: NotificationCardStyleChoice) => void;
  setNotificationBarStageId: (id: NotificationBarStageId) => void;
  setAvatarFrameId: (id: UserAvatarFrameId) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: DEFAULT_USER_PRESET_AVATAR,
      nickname: '',
      bio: '',
      notificationCardStyle: 'auto',
      notificationBarStageId: 'soft-aurora',
      avatarFrameId: DEFAULT_USER_AVATAR_FRAME_ID,
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
      setNotificationCardStyle: (choice) =>
        set(
          isValidNotificationStyleChoice(choice)
            ? { notificationCardStyle: choice }
            : { notificationCardStyle: 'auto' },
        ),
      setNotificationBarStageId: (id) =>
        set(
          isValidNotificationBarStageId(id)
            ? { notificationBarStageId: id }
            : { notificationBarStageId: 'soft-aurora' },
        ),
      setAvatarFrameId: (id) =>
        set(
          isValidUserAvatarFrameId(id)
            ? { avatarFrameId: id }
            : { avatarFrameId: DEFAULT_USER_AVATAR_FRAME_ID },
        ),
    }),
    {
      name: 'user-profile-storage',
      merge: (persistedState, currentState) => {
        const next = { ...currentState, ...(persistedState as Partial<UserProfileState>) };
        if ((next.notificationBarStageId as string) === 'pixel-blast') {
          next.notificationBarStageId = 'solid-black';
        }
        if (!isValidNotificationBarStageId(next.notificationBarStageId)) {
          next.notificationBarStageId = 'soft-aurora';
        }
        if (!isValidUserAvatarFrameId((next as UserProfileState).avatarFrameId)) {
          (next as UserProfileState).avatarFrameId = DEFAULT_USER_AVATAR_FRAME_ID;
        }
        return next;
      },
    },
  ),
);
