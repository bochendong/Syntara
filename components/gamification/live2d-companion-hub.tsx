'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarCheck2,
  Heart,
  ImageIcon,
  Loader2,
  Lock,
  Mic2,
  Palette,
  Star,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { FloatingLinesStageBackground } from '@/components/gamification/floating-lines-stage-background';
import { LightRaysStageBackground } from '@/components/gamification/light-rays-stage-background';
import { PixelSnowStageBackground } from '@/components/gamification/pixel-snow-stage-background';
import { SoftAuroraStageBackground } from '@/components/gamification/soft-aurora-stage-background';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { LightPillarStageBackground } from '@/components/gamification/light-pillar-stage-background';
import { PrismStageBackground } from '@/components/gamification/prism-stage-background';
import { PlasmaWaveStageBackground } from '@/components/gamification/plasma-wave-stage-background';
import { ColorBendsStageBackground } from '@/components/gamification/color-bends-stage-background';
import { ParticlesStageBackground } from '@/components/gamification/particles-stage-background';
import { EvilEyeStageBackground } from '@/components/gamification/evil-eye-stage-background';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useNotificationStore } from '@/lib/store/notifications';
import { useAuthStore } from '@/lib/store/auth';
import { backendJson } from '@/lib/utils/backend-api';
import type { AppNotification } from '@/lib/notifications/types';
import { buildNotificationCompanionCopy } from '@/lib/notifications/companion-copy';
import { getNotificationCardTheme } from '@/lib/notifications/card-theme';
import { resolveNotificationCompanionModelId } from '@/lib/notifications/companion-model';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';
import {
  LIVE2D_PRESENTER_MODELS,
  type Live2DPresenterModelId,
} from '@/lib/live2d/presenter-models';

const LIVE2D_CHARACTER_TRAITS: Record<
  Live2DPresenterModelId,
  {
    notificationBonuses: Array<{ requiredLevel: number; label: string }>;
    signInBonuses: Array<{ requiredLevel: number; label: string }>;
    maxAffinityGift: string;
  }
> = {
  haru: {
    notificationBonuses: [
      { requiredLevel: 5, label: '学习提醒冷却缩短 6%' },
      { requiredLevel: 10, label: '学习提醒冷却缩短 12%' },
      { requiredLevel: 15, label: '学习提醒冷却缩短 18%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '签到亲密度 +1（首签额外）' },
      { requiredLevel: 10, label: '签到亲密度 +2（首签额外）' },
      { requiredLevel: 15, label: '签到亲密度 +3（首签额外）' },
    ],
    maxAffinityGift: 'Haru 轻快提醒主题包',
  },
  hiyori: {
    notificationBonuses: [
      { requiredLevel: 5, label: '复习提醒触发权重 +10%' },
      { requiredLevel: 10, label: '复习提醒触发权重 +18%' },
      { requiredLevel: 15, label: '复习提醒触发权重 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '夜间签到额外 +1 亲密度' },
      { requiredLevel: 10, label: '夜间签到额外 +2 亲密度' },
      { requiredLevel: 15, label: '夜间签到额外 +3 亲密度' },
    ],
    maxAffinityGift: 'Hiyori 温柔语音提示包',
  },
  mark: {
    notificationBonuses: [
      { requiredLevel: 5, label: '任务完成提醒额外 +8% 积分展示' },
      { requiredLevel: 10, label: '任务完成提醒额外 +14% 积分展示' },
      { requiredLevel: 15, label: '任务完成提醒额外 +20% 积分展示' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '连胜签到额外 +1 连胜保护点' },
      { requiredLevel: 10, label: '连胜签到额外 +2 连胜保护点' },
      { requiredLevel: 15, label: '连胜签到额外 +3 连胜保护点' },
    ],
    maxAffinityGift: 'Mark 冲刺计划模板包',
  },
  mao: {
    notificationBonuses: [
      { requiredLevel: 5, label: '学习提醒文案活跃度 +10%' },
      { requiredLevel: 10, label: '学习提醒文案活跃度 +18%' },
      { requiredLevel: 15, label: '学习提醒文案活跃度 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '签到亲密度额外 +1（早间签到）' },
      { requiredLevel: 10, label: '签到亲密度额外 +2（早间签到）' },
      { requiredLevel: 15, label: '签到亲密度额外 +3（早间签到）' },
    ],
    maxAffinityGift: 'Mao 元气课前提醒卡组',
  },
  rice: {
    notificationBonuses: [
      { requiredLevel: 5, label: '温和提醒触发权重 +10%' },
      { requiredLevel: 10, label: '温和提醒触发权重 +18%' },
      { requiredLevel: 15, label: '温和提醒触发权重 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '晚间签到额外 +1 亲密度' },
      { requiredLevel: 10, label: '晚间签到额外 +2 亲密度' },
      { requiredLevel: 15, label: '晚间签到额外 +3 亲密度' },
    ],
    maxAffinityGift: 'Rice 晚间陪学主题包',
  },
};

const COMPANION_GIFT_CLAIM_STORAGE_KEY = 'companion-gift-claim-status';
const COMPANION_STAGE_SKIN_STORAGE_KEY = 'companion-stage-skin-status';
const LIVE2D_POSTER_BY_ID: Partial<Record<Live2DPresenterModelId, string>> = {
  haru: '/liv2d_poster/haru-avator.png',
  hiyori: '/liv2d_poster/hiyori-avator.png',
  mark: '/liv2d_poster/mark-avator.png',
  mao: '/liv2d_poster/mao-avator.png',
  rice: '/liv2d_poster/rice-avator.png',
};
type NotificationActionOption = {
  id: string;
  label: string;
  description: string;
  motionGroup: 'Idle' | 'TapBody';
  motionIndex?: number;
};

type ShowcasePanelId =
  | 'mentor-info'
  | 'voice'
  | 'motion'
  | 'skin'
  | 'stage-background';

type CharacterVoicePack = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  audioSrc: string;
  motionGroup?: 'Idle' | 'TapBody';
  motionIndex?: number;
};

type CharacterMotionPack = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  motionGroup: 'Idle' | 'TapBody';
  motionIndex?: number;
};

type CharacterStageSkin = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  stageClass: string;
  glowClass: string;
};

const NOTIFICATION_ACTIONS_BY_MODEL: Record<Live2DPresenterModelId, NotificationActionOption[]> = {
  haru: [
    {
      id: 'haru-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Haru 的礼貌鞠躬动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'haru-wave',
      label: '挥手',
      description: '用于轻量问候的通知动作。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'haru-cheer',
      label: '活力提醒',
      description: '用于任务完成时更明显的提醒。',
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
  ],
  hiyori: [
    {
      id: 'hiyori-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Hiyori 的礼貌动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'hiyori-soft',
      label: '温柔点头',
      description: '用于更柔和的通知场景。',
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'hiyori-normal',
      label: '标准提醒',
      description: '默认通知动作。',
      motionGroup: 'Idle',
      motionIndex: 0,
    },
  ],
  mark: [
    {
      id: 'mark-nod',
      label: '点头',
      description: '简洁确认型通知动作。',
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'mark-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Mark 的礼貌动作。',
      motionGroup: 'Idle',
      motionIndex: 2,
    },
    {
      id: 'mark-strong',
      label: '强调提醒',
      description: '用于重要通知的动作。',
      motionGroup: 'Idle',
      motionIndex: 4,
    },
  ],
  mao: [
    {
      id: 'mao-wave',
      label: '挥手',
      description: '用于轻快欢迎的通知动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'mao-cheer',
      label: '活力提醒',
      description: '用于更有存在感的学习提醒。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'mao-idle',
      label: '标准提醒',
      description: '默认通知动作。',
      motionGroup: 'Idle',
      motionIndex: 0,
    },
  ],
  rice: [
    {
      id: 'rice-soft',
      label: '温柔点头',
      description: '用于柔和、低打扰的通知场景。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'rice-wave',
      label: '挥手',
      description: '用于轻量问候和签到提示。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'rice-cheer',
      label: '鼓励提醒',
      description: '用于任务完成后的鼓励动作。',
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
  ],
};

const CHARACTER_VOICE_PACKS: Record<Live2DPresenterModelId, CharacterVoicePack[]> = {
  haru: [
    {
      id: 'haru-normal-01',
      label: '元气问候',
      description: '来自 Haru 模型包的 haru_normal_01.wav，播放时同步触发对应动作。',
      requiredLevel: 1,
      audioSrc: '/live2d/Haru/sounds/haru_normal_01.wav',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'haru-normal-02',
      label: '轻快回应',
      description: '来自 Haru 模型包的 haru_normal_02.wav，适合签到和日常提醒。',
      requiredLevel: 4,
      audioSrc: '/live2d/Haru/sounds/haru_normal_02.wav',
      motionGroup: 'TapBody',
      motionIndex: 3,
    },
    {
      id: 'haru-normal-03',
      label: '专注鼓励',
      description: '来自 Haru 模型包的 haru_normal_03.wav，用于学习推进时的鼓励。',
      requiredLevel: 8,
      audioSrc: '/live2d/Haru/sounds/haru_normal_03.wav',
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
    {
      id: 'haru-normal-04',
      label: '特别招呼',
      description: '来自 Haru 模型包的 haru_normal_04.wav，高亲密度后可试听。',
      requiredLevel: 12,
      audioSrc: '/live2d/Haru/sounds/haru_normal_04.wav',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
  ],
  hiyori: [],
  mark: [],
  mao: [],
  rice: [],
};

const CHARACTER_MOTION_PACKS: Record<Live2DPresenterModelId, CharacterMotionPack[]> = {
  haru: [
    {
      id: 'haru-idle-0',
      label: '晴空待机',
      description: 'Haru 的默认站姿循环动作。',
      requiredLevel: 1,
      motionGroup: 'Idle',
      motionIndex: 0,
    },
    {
      id: 'haru-idle-1',
      label: '安静陪学',
      description: 'Haru 的第二套待机动作，适合低打扰展示。',
      requiredLevel: 3,
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'haru-tap-0',
      label: '特别招呼',
      description: 'Haru TapBody 动作 0，与 haru_normal_04.wav 匹配。',
      requiredLevel: 5,
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'haru-tap-1',
      label: '元气回应',
      description: 'Haru TapBody 动作 1，与 haru_normal_01.wav 匹配。',
      requiredLevel: 7,
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'haru-tap-2',
      label: '专注鼓励',
      description: 'Haru TapBody 动作 2，与 haru_normal_03.wav 匹配。',
      requiredLevel: 10,
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
    {
      id: 'haru-tap-3',
      label: '轻快提醒',
      description: 'Haru TapBody 动作 3，与 haru_normal_02.wav 匹配。',
      requiredLevel: 12,
      motionGroup: 'TapBody',
      motionIndex: 3,
    },
  ],
  hiyori: [
    {
      id: 'hiyori-idle-0',
      label: '温柔待机',
      description: 'Hiyori 的基础待机动作。',
      requiredLevel: 1,
      motionGroup: 'Idle',
      motionIndex: 0,
    },
    {
      id: 'hiyori-idle-1',
      label: '轻声确认',
      description: 'Hiyori 的第二套待机动作，适合复习场景。',
      requiredLevel: 3,
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'hiyori-idle-2',
      label: '陪学微动',
      description: 'Hiyori 的第三套待机动作。',
      requiredLevel: 5,
      motionGroup: 'Idle',
      motionIndex: 2,
    },
    {
      id: 'hiyori-idle-3',
      label: '夜读状态',
      description: 'Hiyori 的第四套待机动作。',
      requiredLevel: 7,
      motionGroup: 'Idle',
      motionIndex: 3,
    },
    {
      id: 'hiyori-idle-4',
      label: '复习提示',
      description: 'Hiyori 的第五套待机动作。',
      requiredLevel: 9,
      motionGroup: 'Idle',
      motionIndex: 4,
    },
    {
      id: 'hiyori-idle-5',
      label: '安静等待',
      description: 'Hiyori 的第六套待机动作。',
      requiredLevel: 11,
      motionGroup: 'Idle',
      motionIndex: 5,
    },
    {
      id: 'hiyori-idle-6',
      label: '柔和提醒',
      description: 'Hiyori 的第七套待机动作。',
      requiredLevel: 13,
      motionGroup: 'Idle',
      motionIndex: 6,
    },
    {
      id: 'hiyori-idle-7',
      label: '整理笔记',
      description: 'Hiyori 的第八套待机动作。',
      requiredLevel: 15,
      motionGroup: 'Idle',
      motionIndex: 7,
    },
    {
      id: 'hiyori-idle-8',
      label: '完成收束',
      description: 'Hiyori 的第九套待机动作。',
      requiredLevel: 18,
      motionGroup: 'Idle',
      motionIndex: 8,
    },
    {
      id: 'hiyori-tap-0',
      label: '轻触回应',
      description: 'Hiyori 唯一的 TapBody 专属动作。',
      requiredLevel: 8,
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
  ],
  mark: [
    {
      id: 'mark-idle-0',
      label: '任务站姿',
      description: 'Mark 的基础待机动作。',
      requiredLevel: 1,
      motionGroup: 'Idle',
      motionIndex: 0,
    },
    {
      id: 'mark-idle-1',
      label: '点头确认',
      description: 'Mark 的确认型待机动作。',
      requiredLevel: 3,
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'mark-idle-2',
      label: '简报姿态',
      description: 'Mark 的讲解前准备动作。',
      requiredLevel: 5,
      motionGroup: 'Idle',
      motionIndex: 2,
    },
    {
      id: 'mark-idle-3',
      label: '战术复盘',
      description: 'Mark 的复盘式待机动作。',
      requiredLevel: 7,
      motionGroup: 'Idle',
      motionIndex: 3,
    },
    {
      id: 'mark-idle-4',
      label: '重点强调',
      description: 'Mark 的强调型动作，适合重要知识点。',
      requiredLevel: 10,
      motionGroup: 'Idle',
      motionIndex: 4,
    },
    {
      id: 'mark-idle-5',
      label: '冲刺准备',
      description: 'Mark 的高亲密度待机动作。',
      requiredLevel: 12,
      motionGroup: 'Idle',
      motionIndex: 5,
    },
  ],
  mao: [
    {
      id: 'mao-idle-0',
      label: '元气待机',
      description: 'Mao 的基础待机动作。',
      requiredLevel: 1,
      motionGroup: 'Idle',
      motionIndex: 0,
    },
    {
      id: 'mao-idle-1',
      label: '课堂待机',
      description: 'Mao 的第二套待机动作。',
      requiredLevel: 3,
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'mao-tap-0',
      label: '挥手欢迎',
      description: 'Mao TapBody 动作 0，适合进入课堂。',
      requiredLevel: 5,
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'mao-tap-1',
      label: '连击鼓励',
      description: 'Mao TapBody 动作 1，适合连续完成任务。',
      requiredLevel: 7,
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'mao-tap-2',
      label: '活力提醒',
      description: 'Mao TapBody 动作 2，反馈更明显。',
      requiredLevel: 9,
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
    {
      id: 'mao-special-0',
      label: '特别动作一',
      description: 'Mao 的 special_01 专属动作。',
      requiredLevel: 12,
      motionGroup: 'TapBody',
      motionIndex: 3,
    },
    {
      id: 'mao-special-1',
      label: '特别动作二',
      description: 'Mao 的 special_02 专属动作。',
      requiredLevel: 15,
      motionGroup: 'TapBody',
      motionIndex: 4,
    },
    {
      id: 'mao-special-2',
      label: '特别动作三',
      description: 'Mao 的 special_03 专属动作。',
      requiredLevel: 18,
      motionGroup: 'TapBody',
      motionIndex: 5,
    },
  ],
  rice: [
    {
      id: 'rice-idle-0',
      label: '暖灯待机',
      description: 'Rice 的基础待机动作。',
      requiredLevel: 1,
      motionGroup: 'Idle',
      motionIndex: 0,
    },
    {
      id: 'rice-tap-0',
      label: '温柔点头',
      description: 'Rice TapBody 动作 0，适合低打扰提醒。',
      requiredLevel: 4,
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'rice-tap-1',
      label: '陪学回应',
      description: 'Rice TapBody 动作 1，适合签到提示。',
      requiredLevel: 8,
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'rice-tap-2',
      label: '暖心鼓励',
      description: 'Rice TapBody 动作 2，适合完成任务后的鼓励。',
      requiredLevel: 12,
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
  ],
};

const CHARACTER_STAGE_SKINS: Record<Live2DPresenterModelId, CharacterStageSkin[]> = {
  haru: [
    {
      id: 'haru-clear',
      label: '晴空讲台',
      description: 'Haru 的默认蓝色星幕。',
      requiredLevel: 1,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.22),transparent_38%),linear-gradient(180deg,rgba(14,24,56,0.92),rgba(12,22,46,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(125,211,252,0.32),transparent_68%)]',
    },
    {
      id: 'haru-sunrise',
      label: '晨光练习室',
      description: '早间学习专属舞台皮肤。',
      requiredLevel: 8,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.24),transparent_36%),linear-gradient(180deg,rgba(39,34,73,0.94),rgba(14,22,48,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(251,191,36,0.3),transparent_68%)]',
    },
  ],
  hiyori: [
    {
      id: 'hiyori-moon',
      label: '月光书房',
      description: 'Hiyori 的安静复习舞台。',
      requiredLevel: 1,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(216,180,254,0.22),transparent_38%),linear-gradient(180deg,rgba(34,24,62,0.94),rgba(12,20,44,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(216,180,254,0.3),transparent_68%)]',
    },
    {
      id: 'hiyori-sakura',
      label: '樱色夜读',
      description: '夜间陪学专属舞台皮肤。',
      requiredLevel: 8,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.22),transparent_38%),linear-gradient(180deg,rgba(49,24,55,0.94),rgba(15,23,42,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(244,114,182,0.28),transparent_68%)]',
    },
  ],
  mark: [
    {
      id: 'mark-command',
      label: '战术白板',
      description: 'Mark 的清晰任务舞台。',
      requiredLevel: 1,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.2),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(148,163,184,0.26),transparent_68%)]',
    },
    {
      id: 'mark-sprint',
      label: '冲刺控制室',
      description: '任务冲刺专属舞台皮肤。',
      requiredLevel: 8,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_38%),linear-gradient(180deg,rgba(12,31,52,0.96),rgba(2,8,23,0.98))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(56,189,248,0.26),transparent_68%)]',
    },
  ],
  mao: [
    {
      id: 'mao-pop',
      label: '元气舞台',
      description: 'Mao 的活力课堂舞台。',
      requiredLevel: 1,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(251,113,133,0.22),transparent_38%),linear-gradient(180deg,rgba(60,24,62,0.94),rgba(24,18,48,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(251,113,133,0.28),transparent_68%)]',
    },
    {
      id: 'mao-spark',
      label: '连击灯牌',
      description: '连续学习专属舞台皮肤。',
      requiredLevel: 8,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.24),transparent_36%),linear-gradient(180deg,rgba(65,31,74,0.94),rgba(16,24,48,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(250,204,21,0.28),transparent_68%)]',
    },
  ],
  rice: [
    {
      id: 'rice-warm',
      label: '暖灯自习室',
      description: 'Rice 的温柔陪学舞台。',
      requiredLevel: 1,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(253,186,116,0.22),transparent_38%),linear-gradient(180deg,rgba(55,34,48,0.94),rgba(18,22,42,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(253,186,116,0.28),transparent_68%)]',
    },
    {
      id: 'rice-dusk',
      label: '晚霞陪学',
      description: '晚间学习专属舞台皮肤。',
      requiredLevel: 8,
      stageClass:
        'bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.22),transparent_38%),linear-gradient(180deg,rgba(59,30,50,0.94),rgba(18,20,42,0.96))]',
      glowClass: 'bg-[radial-gradient(circle,rgba(251,146,60,0.28),transparent_68%)]',
    },
  ],
};

function toLive2DModelId(id: string): Live2DPresenterModelId | null {
  if (id === 'haru' || id === 'hiyori' || id === 'mark' || id === 'mao' || id === 'rice') {
    return id;
  }
  return null;
}

function resolveBonusTier(
  tiers: Array<{ requiredLevel: number; label: string }>,
  level: number,
): {
  current: { requiredLevel: number; label: string } | null;
  next: { requiredLevel: number; label: string } | null;
} {
  const sorted = [...tiers].sort((a, b) => a.requiredLevel - b.requiredLevel);
  const unlocked = sorted.filter((tier) => level >= tier.requiredLevel);
  const current = unlocked.length > 0 ? unlocked[unlocked.length - 1] : null;
  const next = sorted.find((tier) => tier.requiredLevel > level) ?? null;
  return { current, next };
}

function formatPreviewNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPreviewBalanceLabel(item: AppNotification): string {
  switch (item.accountType) {
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(item.balanceAfter);
    case 'COMPUTE':
      return formatComputeCreditsLabel(item.balanceAfter);
    default:
      return formatCashCreditsLabel(item.balanceAfter);
  }
}

type CharacterShowcaseItem = {
  id: string;
  name: string;
  isUnlocked: boolean;
  isEquipped: boolean;
  affinityLevel: number;
  affinityExp: number;
  previewSrc?: string | null;
  description?: string | null;
  nextUnlockHint?: string | null;
  modelId: Live2DPresenterModelId | null;
  posterSrc: string;
  source: 'summary' | 'local';
};

function resolveLive2DPoster(modelId: Live2DPresenterModelId, previewSrc?: string | null): string {
  return LIVE2D_POSTER_BY_ID[modelId] ?? previewSrc ?? LIVE2D_PRESENTER_MODELS[modelId].previewSrc;
}

function readStringRecordFromStorage(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStringRecordToStorage(key: string, value: Record<string, string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence errors; keep current session state.
  }
}

function buildCharacterMotionPacks(modelId: Live2DPresenterModelId): CharacterMotionPack[] {
  return CHARACTER_MOTION_PACKS[modelId];
}

function playCharacterVoicePack(
  pack: CharacterVoicePack,
  currentAudioRef: { current: HTMLAudioElement | null },
) {
  if (typeof window === 'undefined') {
    return;
  }

  currentAudioRef.current?.pause();
  const audio = new Audio(pack.audioSrc);
  currentAudioRef.current = audio;
  audio.play().catch(() => {
    toast.error('语音播放失败，请确认浏览器允许播放音频');
  });
}

export function Live2DCompanionHub() {
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const { summary, loading, equipCharacter, selectPreferredCharacter, sendEvent } =
    useGamificationSummary(true);
  const authUserId = useAuthStore((s) => s.userId);
  const activeBanners = useNotificationStore((s) => s.activeBanners);
  const notifications = useNotificationStore((s) => s.notifications);
  const activeNotificationUserId = useNotificationStore((s) => s.activeUserId);
  const refreshNotifications = useNotificationStore((s) => s.refreshNotifications);
  const live2dPresenterModelId = useSettingsStore((s) => s.live2dPresenterModelId);
  const notificationCardStyle = useUserProfileStore((s) => s.notificationCardStyle);
  const notificationCompanionId = useSettingsStore((s) => s.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((s) => s.checkInCompanionId);
  const setLive2DPresenterModelId = useSettingsStore((s) => s.setLive2DPresenterModelId);
  const setNotificationCompanionId = useSettingsStore((s) => s.setNotificationCompanionId);
  const setCheckInCompanionId = useSettingsStore((s) => s.setCheckInCompanionId);
  const [giftClaimStatus, setGiftClaimStatus] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(COMPANION_GIFT_CLAIM_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [notificationMotionTrigger, setNotificationMotionTrigger] = useState<{
    token: number;
    motionGroup: 'Idle' | 'TapBody';
    motionIndex?: number;
  } | null>(null);
  const [mockActionLoadingId, setMockActionLoadingId] = useState<string | null>(null);
  const [selectedShowcaseCharacterId, setSelectedShowcaseCharacterId] = useState<string | null>(
    null,
  );
  const [showcasePanel, setShowcasePanel] = useState<ShowcasePanelId>('mentor-info');
  const [showcaseMotionTrigger, setShowcaseMotionTrigger] = useState<{
    token: number;
    motionGroup: 'Idle' | 'TapBody';
    motionIndex?: number;
  } | null>(null);
  const [selectedStageSkinByCharacter, setSelectedStageSkinByCharacter] = useState<
    Record<string, string>
  >(() => readStringRecordFromStorage(COMPANION_STAGE_SKIN_STORAGE_KEY));

  const handleEquip = async (characterId: string) => {
    try {
      await equipCharacter(characterId);
      const modelId = toLive2DModelId(characterId);
      if (modelId) {
        setLive2DPresenterModelId(modelId);
      }
      toast.success('已切换当前课堂讲师');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换角色失败');
    }
  };

  const live2dCharacters =
    summary?.characters.filter(
      (character) => character.assetType === 'LIVE2D' && toLive2DModelId(character.id) != null,
    ) ?? [];
  const sortedLive2dCharacters = [...live2dCharacters].sort((a, b) => {
    if (a.isUnlocked === b.isUnlocked) return 0;
    return a.isUnlocked ? -1 : 1;
  });
  const unlockedLive2dCharacters = live2dCharacters.filter((character) => character.isUnlocked);
  const unlockedLive2dIds = new Set(
    live2dCharacters.filter((character) => character.isUnlocked).map((character) => character.id),
  );
  const showcaseCharacters = useMemo<CharacterShowcaseItem[]>(() => {
    if (sortedLive2dCharacters.length > 0) {
      return sortedLive2dCharacters.map((character) => {
        const modelId = toLive2DModelId(character.id);
        return {
          id: character.id,
          name: character.name,
          isUnlocked: character.isUnlocked,
          isEquipped: character.isEquipped,
          affinityLevel: character.affinityLevel,
          affinityExp: character.affinityExp,
          previewSrc: character.previewSrc,
          description: character.description,
          nextUnlockHint: character.nextUnlockHint,
          modelId,
          posterSrc: modelId
            ? resolveLive2DPoster(modelId, character.previewSrc)
            : (character.previewSrc ?? ''),
          source: 'summary',
        };
      });
    }

    return Object.values(LIVE2D_PRESENTER_MODELS).map((model) => ({
      id: model.id,
      name: model.badgeLabel,
      isUnlocked: true,
      isEquipped: live2dPresenterModelId === model.id,
      affinityLevel: model.id === checkInCompanionId ? 1 : 0,
      affinityExp: 0,
      previewSrc: model.previewSrc,
      description: '可设为课堂讲解角色；解锁数据库同步后还能承担通知与签到成长职责。',
      nextUnlockHint: null,
      modelId: model.id,
      posterSrc: resolveLive2DPoster(model.id, model.previewSrc),
      source: 'local',
    }));
  }, [checkInCompanionId, live2dPresenterModelId, sortedLive2dCharacters]);
  const unlockedShowcaseCharacters = useMemo(
    () => showcaseCharacters.filter((character) => character.isUnlocked),
    [showcaseCharacters],
  );
  const selectedNotificationCharacter =
    unlockedLive2dCharacters.find((character) => {
      const modelId = toLive2DModelId(character.id);
      return modelId != null && modelId === notificationCompanionId;
    }) ??
    unlockedLive2dCharacters[0] ??
    null;
  const selectedNotificationModelId = selectedNotificationCharacter
    ? toLive2DModelId(selectedNotificationCharacter.id)
    : null;
  const notificationActionOptions = selectedNotificationModelId
    ? NOTIFICATION_ACTIONS_BY_MODEL[selectedNotificationModelId]
    : [];
  const activeNotificationActionId = notificationActionOptions.some(
    (option) => option.id === notificationActionId,
  )
    ? notificationActionId
    : (notificationActionOptions[0]?.id ?? null);
  const selectedCheckInCharacter =
    unlockedLive2dCharacters.find((character) => {
      const modelId = toLive2DModelId(character.id);
      return modelId != null && modelId === checkInCompanionId;
    }) ??
    unlockedLive2dCharacters[0] ??
    null;
  const selectedCheckInModelId = selectedCheckInCharacter
    ? toLive2DModelId(selectedCheckInCharacter.id)
    : null;
  const selectedCheckInTrait = selectedCheckInModelId
    ? LIVE2D_CHARACTER_TRAITS[selectedCheckInModelId]
    : null;
  const selectedCheckInBonusTier = selectedCheckInTrait
    ? resolveBonusTier(
        selectedCheckInTrait.signInBonuses,
        selectedCheckInCharacter?.affinityLevel ?? 1,
      )
    : null;
  const selectedCheckInGiftClaimed = selectedCheckInModelId
    ? giftClaimStatus[selectedCheckInModelId] === true
    : false;
  const previewNotification = activeBanners[0] ?? notifications[0] ?? null;
  const hasActiveNotificationBanner = activeBanners.length > 0;
  const previewNotificationBody =
    previewNotification?.body ?? '任务完成、连胜提醒、签到提示将使用当前讲师语气。';
  const previewPrimaryDetail = previewNotification?.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );
  const previewCompanionCopy = previewNotification
    ? buildNotificationCompanionCopy(previewNotification)
    : { eyebrow: '通知预览', line: '任务完成、连胜提醒、签到提示将使用当前讲师语气。' };
  const previewCardTheme = getNotificationCardTheme(previewNotification, notificationCardStyle);
  const previewCompanionModelId = resolveNotificationCompanionModelId(
    previewNotification,
    notificationCompanionId,
    checkInCompanionId,
  );

  useEffect(() => {
    if (!summary?.databaseEnabled) return;
    const preferredId = toLive2DModelId(summary.profile.preferredCharacterId);
    if (!preferredId) return;
    if (checkInCompanionId !== preferredId) {
      setCheckInCompanionId(preferredId);
    }
  }, [summary, checkInCompanionId, setCheckInCompanionId]);

  useEffect(() => {
    if (!summary?.databaseEnabled) return;
    const equippedId = toLive2DModelId(summary.profile.equippedCharacterId);
    if (!equippedId) return;
    if (live2dPresenterModelId !== equippedId) {
      setLive2DPresenterModelId(equippedId);
    }
  }, [summary, live2dPresenterModelId, setLive2DPresenterModelId]);

  useEffect(() => {
    if (unlockedShowcaseCharacters.length === 0) {
      setSelectedShowcaseCharacterId(null);
      return;
    }

    if (
      selectedShowcaseCharacterId &&
      unlockedShowcaseCharacters.some((character) => character.id === selectedShowcaseCharacterId)
    ) {
      return;
    }

    const preferredCharacterId =
      unlockedShowcaseCharacters.find((character) => character.modelId === live2dPresenterModelId)
        ?.id ??
      unlockedShowcaseCharacters[0]?.id ??
      null;

    setSelectedShowcaseCharacterId(preferredCharacterId);
  }, [live2dPresenterModelId, selectedShowcaseCharacterId, unlockedShowcaseCharacters]);

  const handleSelectNotificationCompanion = (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (!unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为通知讲师');
      return;
    }
    setNotificationCompanionId(modelId);
    toast.success(`已设置 ${modelId} 为通知讲师`);
  };

  const handleSelectLectureCompanion = async (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;

    if (summary?.databaseEnabled) {
      if (!unlockedLive2dIds.has(characterId)) {
        toast.error('请先解锁该角色，再设为课堂讲师');
        return;
      }
      await handleEquip(characterId);
      return;
    }

    setLive2DPresenterModelId(modelId);
    toast.success(`已将 ${modelId} 设为课堂讲师`);
  };

  const handleTriggerNotificationAction = (option: NotificationActionOption) => {
    setNotificationActionId(option.id);
    setNotificationMotionTrigger((current) => ({
      token: (current?.token ?? 0) + 1,
      motionGroup: option.motionGroup,
      motionIndex: option.motionIndex,
    }));
    toast.success(`已触发动作：${option.label}`);
  };

  const handleSelectCheckInCompanion = async (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (summary?.databaseEnabled && !unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为签到培养角色');
      return;
    }
    if (!summary?.databaseEnabled) {
      setCheckInCompanionId(modelId);
      toast.success(`已在本地预览中将 ${modelId} 设为签到角色`);
      return;
    }
    try {
      await selectPreferredCharacter(characterId);
      setCheckInCompanionId(modelId);
      toast.success(`签到将优先培养 ${modelId} 的亲密度`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置签到培养角色失败');
    }
  };

  const handleClaimCompanionGift = (characterId: Live2DPresenterModelId) => {
    const next = { ...giftClaimStatus, [characterId]: true };
    setGiftClaimStatus(next);
    try {
      window.localStorage.setItem(COMPANION_GIFT_CLAIM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore persistence errors; keep current session state.
    }
    toast.success('礼物已领取');
  };

  const refreshNotificationNow = async () => {
    const userId = (activeNotificationUserId || authUserId).trim();
    if (!userId) return;
    await refreshNotifications({ userId, silent: true });
  };

  const handleMockNotificationAction = async (actionId: string) => {
    if (mockActionLoadingId) return;
    setMockActionLoadingId(actionId);
    const nonce = Date.now().toString(36);
    try {
      switch (actionId) {
        case 'mock-convert-purchase':
          await backendJson('/api/profile/credits/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 1, targetAccountType: 'PURCHASE' }),
          });
          break;
        case 'mock-convert-compute':
          await backendJson('/api/profile/credits/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 1, targetAccountType: 'COMPUTE' }),
          });
          break;
        case 'mock-lesson-reward':
          await sendEvent({
            type: 'lesson_milestone_completed',
            courseId: `mock-course-${nonce}`,
            courseName: 'Mock 课程奖励',
            progressPercent: 40,
            checkpointCount: 2,
          });
          break;
        case 'mock-quiz-reward':
          await sendEvent({
            type: 'quiz_completed',
            sceneId: `mock-scene-${nonce}`,
            sceneTitle: 'Mock 测验奖励',
            referenceKey: `mock-quiz-${nonce}`,
            questionCount: 10,
            correctCount: 8,
            accuracyPercent: 80,
          });
          break;
        case 'mock-review-reward':
          await sendEvent({
            type: 'review_completed',
            sceneId: `mock-review-scene-${nonce}`,
            sceneTitle: 'Mock 复习奖励',
            referenceKey: `mock-review-${nonce}`,
            hadPreviousIncorrect: true,
          });
          break;
        default:
          return;
      }
      await refreshNotificationNow();
      toast.success('已触发通知 mock 事件');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '触发通知 mock 失败');
    } finally {
      setMockActionLoadingId(null);
    }
  };

  const showcaseCharacter =
    unlockedShowcaseCharacters.find((character) => character.id === selectedShowcaseCharacterId) ??
    unlockedShowcaseCharacters[0] ??
    null;
  const showcaseModelId = showcaseCharacter?.modelId ?? null;
  const showcaseIsLecture = Boolean(showcaseModelId && showcaseModelId === live2dPresenterModelId);
  const showcaseIsNotification = Boolean(
    showcaseModelId && showcaseModelId === notificationCompanionId,
  );
  const showcaseIsCheckIn = Boolean(showcaseModelId && showcaseModelId === checkInCompanionId);
  const showcaseLevel = showcaseCharacter?.affinityLevel ?? 0;
  const showcaseExp = showcaseCharacter?.affinityExp ?? 0;
  const showcaseExpProgress = (() => {
    const normalized = Number.isFinite(showcaseExp) ? showcaseExp : 0;
    const currentTierExp = ((normalized % 100) + 100) % 100;
    return currentTierExp / 100;
  })();
  const showcaseVoicePacks = showcaseModelId ? CHARACTER_VOICE_PACKS[showcaseModelId] : [];
  const showcaseMotionPacks = showcaseModelId ? buildCharacterMotionPacks(showcaseModelId) : [];
  const showcaseStageSkins = showcaseModelId ? CHARACTER_STAGE_SKINS[showcaseModelId] : [];
  const showcaseUnlockTotal =
    showcaseVoicePacks.length +
    showcaseMotionPacks.length +
    showcaseStageSkins.length;
  const showcaseUnlockedCount =
    showcaseVoicePacks.filter((pack) => showcaseLevel >= pack.requiredLevel).length +
    showcaseMotionPacks.filter((pack) => showcaseLevel >= pack.requiredLevel).length +
    showcaseStageSkins.filter((skin) => showcaseLevel >= skin.requiredLevel).length;
  const showcaseTrait = showcaseModelId ? LIVE2D_CHARACTER_TRAITS[showcaseModelId] : null;
  const showcaseNotificationBonusTier = showcaseTrait
    ? resolveBonusTier(showcaseTrait.notificationBonuses, showcaseLevel)
    : null;
  const showcaseSignInBonusTier = showcaseTrait
    ? resolveBonusTier(showcaseTrait.signInBonuses, showcaseLevel)
    : null;
  const selectedStageSkin =
    showcaseStageSkins.find(
      (skin) => skin.id === selectedStageSkinByCharacter[showcaseModelId ?? ''],
    ) ??
    showcaseStageSkins[0] ??
    null;
  const handlePreviewVoicePack = (pack: CharacterVoicePack) => {
    if (showcaseLevel < pack.requiredLevel) {
      toast.info(`亲密度 Lv${pack.requiredLevel} 解锁后可试听`);
      return;
    }
    const motionGroup = pack.motionGroup;
    if (motionGroup) {
      setShowcaseMotionTrigger((current) => ({
        token: (current?.token ?? 0) + 1,
        motionGroup,
        motionIndex: pack.motionIndex,
      }));
    }
    playCharacterVoicePack(pack, voicePreviewAudioRef);
    toast.success(`正在试听：${pack.label}`);
  };

  const handlePreviewMotionPack = (pack: CharacterMotionPack) => {
    if (showcaseLevel < pack.requiredLevel) {
      toast.info(`亲密度 Lv${pack.requiredLevel} 解锁后可使用动作`);
      return;
    }
    setShowcaseMotionTrigger((current) => ({
      token: (current?.token ?? 0) + 1,
      motionGroup: pack.motionGroup,
      motionIndex: pack.motionIndex,
    }));
    toast.success(`已触发动作：${pack.label}`);
  };

  const handleSelectStageSkin = (skin: CharacterStageSkin) => {
    if (!showcaseModelId) return;
    if (showcaseLevel < skin.requiredLevel) {
      toast.info(`亲密度 Lv${skin.requiredLevel} 解锁后可使用该舞台背景`);
      return;
    }
    const next = { ...selectedStageSkinByCharacter, [showcaseModelId]: skin.id };
    setSelectedStageSkinByCharacter(next);
    writeStringRecordToStorage(COMPANION_STAGE_SKIN_STORAGE_KEY, next);
    toast.success(`已切换舞台背景：${skin.label}`);
  };

  return (
    <div className="h-full space-y-6">
      {showcaseCharacter ? (
        <Card className="h-full overflow-hidden border-white/45 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.2),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.16),transparent_30%),linear-gradient(180deg,rgba(7,12,28,0.92),rgba(12,22,46,0.94))] p-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.32)] dark:border-white/10">
          <div className="grid h-full gap-0">
            <div className="relative h-full overflow-hidden border-b border-white/10">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(196,181,253,0.28),transparent_68%)]" />
                <div className="absolute bottom-[-140px] left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.22),transparent_70%)] blur-2xl" />
                <div className="absolute inset-x-10 bottom-6 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
              </div>

              <div className="relative h-full p-0">
                <div
                  className={cn(
                    'relative h-full min-h-[660px] overflow-hidden rounded-[30px] border border-white/10 px-4 pb-8 pt-24 md:min-h-[620px] md:pb-10 md:pt-20',
                    selectedStageSkin?.stageClass ??
                      'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]',
                  )}
                >
                  {showcaseModelId === 'haru' && selectedStageSkin?.id === 'haru-clear' ? (
                    <PrismStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-70"
                      timeScale={0.5}
                      height={3.5}
                      baseWidth={5.5}
                      scale={3.6}
                      hueShift={0}
                      colorFrequency={1}
                      noise={0}
                      glow={1}
                      bloom={1}
                    />
                  ) : null}
                  {showcaseModelId === 'hiyori' && selectedStageSkin?.id === 'hiyori-moon' ? (
                    <LightPillarStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-60"
                      topColor="#7C4DFF"
                      bottomColor="#F7A8FF"
                      intensity={1}
                      rotationSpeed={0.3}
                      glowAmount={0.002}
                      pillarWidth={3}
                      pillarHeight={0.4}
                      noiseIntensity={0.5}
                      pillarRotation={25}
                      interactive={false}
                      mixBlendMode="screen"
                      quality="high"
                    />
                  ) : null}
                  {showcaseModelId === 'hiyori' && selectedStageSkin?.id === 'hiyori-sakura' ? (
                    <PixelSnowStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-65"
                      color="#ffffff"
                      flakeSize={0.01}
                      minFlakeSize={1.25}
                      pixelResolution={200}
                      speed={1.25}
                      density={0.3}
                      direction={125}
                      brightness={1}
                      depthFade={8}
                      farPlane={20}
                      gamma={0.4545}
                      variant="square"
                    />
                  ) : null}
                  {showcaseModelId === 'haru' && selectedStageSkin?.id === 'haru-sunrise' ? (
                    <FloatingLinesStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-55"
                      interactive
                      animationSpeed={1}
                      gradientStart="#e945f5"
                      gradientMid="#6f6f6f"
                      gradientEnd="#6a6a6a"
                      mixBlendMode="screen"
                    />
                  ) : null}
                  {showcaseModelId === 'mark' && selectedStageSkin?.id === 'mark-command' ? (
                    <LightRaysStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-60"
                      raysOrigin="top-center"
                      raysColor="#ffffff"
                      raysSpeed={1}
                      lightSpread={0.5}
                      rayLength={3}
                      followMouse
                      mouseInfluence={0.1}
                      noiseAmount={0}
                      distortion={0}
                      pulsating={false}
                      fadeDistance={1}
                      saturation={1}
                    />
                  ) : null}
                  {showcaseModelId === 'mark' && selectedStageSkin?.id === 'mark-sprint' ? (
                    <SoftAuroraStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-55"
                      speed={0.6}
                      scale={1.5}
                      brightness={1}
                      color1="#f7f7f7"
                      color2="#e100ff"
                      noiseFrequency={2.5}
                      noiseAmplitude={1}
                      bandHeight={0.5}
                      bandSpread={1}
                      octaveDecay={0.1}
                      layerOffset={0}
                      colorSpeed={1}
                      enableMouseInteraction
                      mouseInfluence={0.25}
                    />
                  ) : null}
                  {showcaseModelId === 'mao' && selectedStageSkin?.id === 'mao-pop' ? (
                    <ParticlesStageBackground
                      className="absolute inset-0 z-0 opacity-65"
                      particleColors={['#ffffff']}
                      particleCount={200}
                      particleSpread={10}
                      speed={0.1}
                      particleBaseSize={100}
                      moveParticlesOnHover
                      alphaParticles={false}
                      disableRotation={false}
                      pixelRatio={1}
                    />
                  ) : null}
                  {showcaseModelId === 'mao' && selectedStageSkin?.id === 'mao-spark' ? (
                    <EvilEyeStageBackground
                      className="absolute inset-0 z-0 opacity-75"
                      eyeColor="#FF6F37"
                      intensity={1.5}
                      pupilSize={0.6}
                      irisWidth={0.25}
                      glowIntensity={0.35}
                      scale={0.8}
                      noiseScale={1}
                      pupilFollow={1}
                      flameSpeed={1}
                      backgroundColor="#120F17"
                    />
                  ) : null}
                  {showcaseModelId === 'rice' && selectedStageSkin?.id === 'rice-warm' ? (
                    <ColorBendsStageBackground
                      className="absolute inset-0 z-0 opacity-70"
                      colors={['#ff5c7a', '#8a5cff', '#7dd3fc']}
                      rotation={90}
                      speed={0.2}
                      scale={1}
                      frequency={1}
                      warpStrength={1}
                      mouseInfluence={1}
                      noise={0.15}
                      parallax={0.5}
                      iterations={1}
                      intensity={1.5}
                      bandWidth={6}
                      transparent
                      autoRotate={0}
                    />
                  ) : null}
                  {showcaseModelId === 'rice' && selectedStageSkin?.id === 'rice-dusk' ? (
                    <PlasmaWaveStageBackground
                      className="pointer-events-none absolute inset-0 z-0 opacity-70"
                      colors={['#A855F7', '#38bdf8']}
                      speed1={0.05}
                      speed2={0.05}
                      focalLength={0.8}
                      bend1={1}
                      bend2={0.5}
                      dir2={1}
                      rotationDeg={0}
                    />
                  ) : null}

                  <div
                    className={cn(
                      'absolute inset-x-12 bottom-5 z-0 h-20 rounded-full blur-2xl',
                      selectedStageSkin?.glowClass ??
                        'bg-[radial-gradient(circle,rgba(191,219,254,0.3),transparent_68%)]',
                    )}
                  />
                  <div className="absolute inset-x-0 bottom-8 z-0 flex justify-center">
                    <div className="h-28 w-[78%] rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_66%)] blur-xl" />
                  </div>

                  <div className="absolute left-1/2 top-4 z-40 w-[min(calc(100%-2rem),620px)] -translate-x-1/2">
                    <div className="flex items-center justify-center gap-2 overflow-x-auto rounded-full border border-white/14 bg-slate-950/28 px-3 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
                      {unlockedShowcaseCharacters.map((character) => {
                        const selected = showcaseCharacter.id === character.id;
                        return (
                          <button
                            key={`showcase-character-stage-${character.id}`}
                            type="button"
                            onClick={() => setSelectedShowcaseCharacterId(character.id)}
                            title={character.name}
                            className={cn(
                              'relative flex size-12 shrink-0 items-center justify-center rounded-full border p-0.5 transition-all md:size-14',
                              selected
                                ? 'border-sky-200 bg-sky-300/18 shadow-[0_0_24px_rgba(125,211,252,0.48)]'
                                : 'border-white/12 bg-white/8 hover:bg-white/14',
                            )}
                          >
                            <img
                              src={character.posterSrc}
                              alt={character.name}
                              className="size-full rounded-full object-cover object-top"
                              draggable={false}
                            />
                            {selected ? (
                              <span className="absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_14px_rgba(125,211,252,0.8)]" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="absolute left-2 top-1/2 z-30 -translate-y-1/2 md:left-4">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-[0_10px_28px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors',
                          showcasePanel === 'mentor-info'
                            ? 'border-sky-200/45 bg-sky-300/18 text-sky-50'
                            : 'border-white/18 bg-slate-950/34 text-slate-100 hover:bg-slate-900/52',
                        )}
                        onClick={() => setShowcasePanel('mentor-info')}
                      >
                        <User className="size-3.5" />
                        导师信息
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-[0_10px_28px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors',
                          showcasePanel === 'voice'
                            ? 'border-sky-200/45 bg-sky-300/18 text-sky-50'
                            : 'border-white/18 bg-slate-950/34 text-slate-100 hover:bg-slate-900/52',
                        )}
                        onClick={() => setShowcasePanel('voice')}
                      >
                        <Mic2 className="size-3.5" />
                        语音包
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-[0_10px_28px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors',
                          showcasePanel === 'motion'
                            ? 'border-sky-200/45 bg-sky-300/18 text-sky-50'
                            : 'border-white/18 bg-slate-950/34 text-slate-100 hover:bg-slate-900/52',
                        )}
                        onClick={() => setShowcasePanel('motion')}
                      >
                        <Star className="size-3.5" />
                        动作
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-[0_10px_28px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors',
                          showcasePanel === 'skin'
                            ? 'border-sky-200/45 bg-sky-300/18 text-sky-50'
                            : 'border-white/18 bg-slate-950/34 text-slate-100 hover:bg-slate-900/52',
                        )}
                        onClick={() => setShowcasePanel('skin')}
                      >
                        <Palette className="size-3.5" />
                        皮肤
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-[0_10px_28px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-colors',
                          showcasePanel === 'stage-background'
                            ? 'border-sky-200/45 bg-sky-300/18 text-sky-50'
                            : 'border-white/18 bg-slate-950/34 text-slate-100 hover:bg-slate-900/52',
                        )}
                        onClick={() => setShowcasePanel('stage-background')}
                      >
                        <ImageIcon className="size-3.5" />
                        舞台背景
                      </button>
                    </div>
                  </div>

                  <div className="absolute bottom-6 left-4 z-30 md:bottom-8 md:left-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-sky-200/40 bg-sky-300/18 px-2.5 py-1 text-xs text-sky-100 transition-colors hover:bg-sky-300/28 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={!showcaseModelId}
                        onClick={() => void handleSelectLectureCompanion(showcaseCharacter.id)}
                      >
                        <Mic2 className="size-3.5" />
                        {showcaseIsLecture ? '当前讲解' : '设为讲解'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200/40 bg-emerald-300/16 px-2.5 py-1 text-xs text-emerald-100 transition-colors hover:bg-emerald-300/24 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={
                          !showcaseModelId ||
                          (!showcaseCharacter.isUnlocked && Boolean(summary?.databaseEnabled))
                        }
                        onClick={() => handleSelectNotificationCompanion(showcaseCharacter.id)}
                      >
                        <Bell className="size-3.5" />
                        {showcaseIsNotification ? '当前通知' : '设为通知'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-fuchsia-200/40 bg-fuchsia-300/16 px-2.5 py-1 text-xs text-fuchsia-100 transition-colors hover:bg-fuchsia-300/24 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={
                          !showcaseModelId ||
                          (!showcaseCharacter.isUnlocked && Boolean(summary?.databaseEnabled))
                        }
                        onClick={() => void handleSelectCheckInCompanion(showcaseCharacter.id)}
                      >
                        <CalendarCheck2 className="size-3.5" />
                        {showcaseIsCheckIn ? '当前签到' : '设为签到'}
                      </button>
                    </div>
                  </div>

                  <div className="absolute inset-0 z-10 flex items-center justify-center px-4 pb-4 pt-20">
                    {showcaseModelId ? (
                      <TalkingAvatarOverlay
                        layout="card"
                        speaking={false}
                        cadence="idle"
                        modelIdOverride={showcaseModelId}
                        manualMotionTrigger={showcaseMotionTrigger}
                        cardFraming="stage"
                        showBadge={false}
                        showStatusDot={false}
                        className="h-[500px] w-full max-w-[430px] md:h-[560px] md:max-w-[470px]"
                      />
                    ) : null}
                  </div>

                  <div className="absolute inset-x-4 bottom-4 z-30 md:bottom-6 md:left-auto md:right-5 md:top-24 md:w-[275px] lg:w-[305px]">
                    <div className="flex max-h-[520px] flex-col overflow-hidden rounded-[28px] border border-white/14 bg-slate-950/34 p-4 shadow-[0_24px_72px_rgba(15,23,42,0.32)] backdrop-blur-xl md:max-h-full md:p-5">
                      <div className="shrink-0 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-semibold tracking-tight md:text-[32px]">
                            {showcaseCharacter.name}
                          </h2>
                        </div>
                        <div className="min-w-[96px] rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-right">
                          <p className="text-sm font-semibold">
                            <span className="text-sky-100">{`Lv ${showcaseLevel}/20`}</span>
                            <span className="mx-1 text-slate-300/60">·</span>
                            <span className="text-violet-200">{`亲密度 ${showcaseExp}`}</span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 shrink-0">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-300 to-violet-300 transition-all duration-300"
                            style={{ width: `${Math.round(showcaseExpProgress * 100)}%` }}
                          />
                        </div>
                      </div>

                      <p className="mt-3 shrink-0 line-clamp-3 text-sm leading-6 text-slate-200/78">
                        {showcaseCharacter.description ||
                          '为课程配置一位可成长的课堂讲师，并决定她是否兼任通知与签到培养职责。'}
                      </p>

                      <div className="mt-4 flex min-h-0 flex-1 flex-col">
                        <div className="h-px w-full bg-white/12" />

                        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                          <div className="space-y-2">
                            {showcasePanel === 'mentor-info' ? (
                              <>
                                <div className="rounded-2xl border border-sky-200/24 bg-sky-300/10 px-3 py-2.5">
                                  <p className="text-xs text-slate-200/82">成长解锁进度</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {`已解锁 ${showcaseUnlockedCount}/${showcaseUnlockTotal}`}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200/24 bg-emerald-300/10 px-3 py-2.5">
                                  <p className="text-xs text-emerald-100/80">通知收益</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseNotificationBonusTier?.current?.label ?? '当前等级暂无额外通知加成'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-emerald-100/75">
                                    {showcaseNotificationBonusTier?.next
                                      ? `下一档 Lv${showcaseNotificationBonusTier.next.requiredLevel}：${showcaseNotificationBonusTier.next.label}`
                                      : '已达到该导师通知收益的最高档位'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-fuchsia-200/24 bg-fuchsia-300/10 px-3 py-2.5">
                                  <p className="text-xs text-fuchsia-100/80">签到收益</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseSignInBonusTier?.current?.label ?? '当前等级暂无额外签到加成'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-fuchsia-100/75">
                                    {showcaseSignInBonusTier?.next
                                      ? `下一档 Lv${showcaseSignInBonusTier.next.requiredLevel}：${showcaseSignInBonusTier.next.label}`
                                      : '已达到该导师签到收益的最高档位'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200/24 bg-amber-300/10 px-3 py-2.5">
                                  <p className="text-xs text-amber-100/80">满级礼赠</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseTrait?.maxAffinityGift ?? '该导师暂无满级礼赠配置'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-amber-100/75">
                                    达到亲密度上限后可领取专属主题奖励
                                  </p>
                                </div>
                              </>
                            ) : null}

                            {showcasePanel === 'voice' ? (
                              showcaseVoicePacks.length > 0 ? (
                                showcaseVoicePacks.map((pack) => {
                                  const unlocked = showcaseLevel >= pack.requiredLevel;
                                  return (
                                    <button
                                      key={pack.id}
                                      type="button"
                                      onClick={() => handlePreviewVoicePack(pack)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        unlocked
                                          ? 'border-sky-200/24 bg-sky-300/10 hover:bg-sky-300/16'
                                          : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {pack.label}
                                        </span>
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                                            unlocked
                                              ? 'bg-emerald-300/14 text-emerald-100'
                                              : 'bg-white/8 text-slate-300/70',
                                          )}
                                        >
                                          {!unlocked ? <Lock className="size-3" /> : null}
                                          Lv{pack.requiredLevel}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {pack.description}
                                      </p>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="rounded-2xl border border-white/10 bg-white/7 px-3 py-3 text-left">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">
                                      暂无内置语音文件
                                    </span>
                                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300/75">
                                      待接入
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-slate-300/74">
                                    当前项目资源里没有找到这个角色的 wav/mp3/ogg
                                    语音文件，所以这里不会再用浏览器 TTS 伪造语音包。
                                    后续把专属音频放进对应角色的 sounds
                                    目录后，就能按亲密度解锁试听。
                                  </p>
                                </div>
                              )
                            ) : null}

                            {showcasePanel === 'motion'
                              ? showcaseMotionPacks.map((pack) => {
                                  const unlocked = showcaseLevel >= pack.requiredLevel;
                                  return (
                                    <button
                                      key={pack.id}
                                      type="button"
                                      onClick={() => handlePreviewMotionPack(pack)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        unlocked
                                          ? 'border-violet-200/24 bg-violet-300/10 hover:bg-violet-300/16'
                                          : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {pack.label}
                                        </span>
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                                            unlocked
                                              ? 'bg-emerald-300/14 text-emerald-100'
                                              : 'bg-white/8 text-slate-300/70',
                                          )}
                                        >
                                          {!unlocked ? <Lock className="size-3" /> : null}
                                          Lv{pack.requiredLevel}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {pack.description}
                                      </p>
                                    </button>
                                  );
                                })
                              : null}

                            {showcasePanel === 'skin' ? (
                              <div className="rounded-2xl border border-white/10 bg-white/7 px-3 py-3 text-left">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-white">默认服装</span>
                                  <span className="rounded-full bg-emerald-300/14 px-2 py-0.5 text-[10px] text-emerald-100">
                                    使用中
                                  </span>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-slate-300/74">
                                  当前 Live2D 包只有一个可加载模型，暂未发现独立换装模型或
                                  costume/skin 资源。
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-300/64">
                                  Hiyori、Haru、Rice 包内存在多张
                                  texture，但这些是同一模型的贴图拆分，
                                  不是可单独切换的衣装。后续如果加入换装模型，我会在这里显示待解锁服装。
                                </p>
                              </div>
                            ) : null}

                            {showcasePanel === 'stage-background'
                              ? showcaseStageSkins.map((skin) => {
                                  const unlocked = showcaseLevel >= skin.requiredLevel;
                                  const selected = selectedStageSkin?.id === skin.id;
                                  return (
                                    <button
                                      key={skin.id}
                                      type="button"
                                      onClick={() => handleSelectStageSkin(skin)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        selected
                                          ? 'border-amber-200/42 bg-amber-300/14'
                                          : unlocked
                                            ? 'border-amber-200/24 bg-amber-300/8 hover:bg-amber-300/14'
                                            : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {skin.label}
                                        </span>
                                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300/76">
                                          {selected ? '使用中' : `Lv${skin.requiredLevel}`}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {skin.description}
                                      </p>
                                    </button>
                                  );
                                })
                              : null}
                          </div>
                        </div>
                        {!summary?.databaseEnabled ? (
                          <p className="mt-3 text-xs leading-5 text-slate-300/72">
                            本地模式下可预览角色分工；开启数据库同步后会保存通知与签到成长。
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
