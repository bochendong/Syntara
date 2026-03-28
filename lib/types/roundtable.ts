import { DEFAULT_USER_PRESET_AVATAR } from '@/lib/constants/user-avatars';

/** 无个人头像时的占位（与设置默认预设一致） */
export const USER_AVATAR = DEFAULT_USER_PRESET_AVATAR;

export type ParticipantRole = 'teacher' | 'student' | 'user';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  avatar: string;
  isOnline: boolean;
  isSpeaking?: boolean;
}

export interface MessageAction {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
}

export interface Message {
  id: string;
  senderId: string;
  senderRole: ParticipantRole;
  content: string;
  timestamp: number;
  actions?: MessageAction[];
}
