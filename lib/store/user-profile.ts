/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_USER_PRESET_AVATAR, USER_AVATAR_PRESET_URLS } from '@/lib/constants/user-avatars';

/** 设置里可选的预设头像（`public/avatars/user-avators/`） */
export const AVATAR_OPTIONS = USER_AVATAR_PRESET_URLS;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: DEFAULT_USER_PRESET_AVATAR,
      nickname: '',
      bio: '',
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'user-profile-storage',
    },
  ),
);
