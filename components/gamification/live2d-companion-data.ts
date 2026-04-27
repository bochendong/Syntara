'use client';

import { toast } from 'sonner';
import type { AppNotification } from '@/lib/notifications/types';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';
import {
  LIVE2D_PRESENTER_MODELS,
  type Live2DPresenterModelId,
} from '@/lib/live2d/presenter-models';

export const LIVE2D_CHARACTER_TRAITS: Record<
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

export const COMPANION_GIFT_CLAIM_STORAGE_KEY = 'companion-gift-claim-status';
export const COMPANION_STAGE_SKIN_STORAGE_KEY = 'companion-stage-skin-status';
const LIVE2D_POSTER_BY_ID: Partial<Record<Live2DPresenterModelId, string>> = {
  haru: '/liv2d_poster/haru-avator.png',
  hiyori: '/liv2d_poster/hiyori-avator.png',
  mark: '/liv2d_poster/mark-avator.png',
  mao: '/liv2d_poster/mao-avator.png',
  rice: '/liv2d_poster/rice-avator.png',
};
export type NotificationActionOption = {
  id: string;
  label: string;
  description: string;
  motionGroup: 'Idle' | 'TapBody';
  motionIndex?: number;
};

export type ShowcasePanelId =
  | 'mentor-info'
  | 'benefit'
  | 'voice'
  | 'motion'
  | 'skin'
  | 'stage-background';

export type CharacterVoicePack = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  audioSrc: string;
  motionGroup?: 'Idle' | 'TapBody';
  motionIndex?: number;
};

export type CharacterMotionPack = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  motionGroup: 'Idle' | 'TapBody';
  motionIndex?: number;
};

export type CharacterStageSkin = {
  id: string;
  label: string;
  description: string;
  requiredLevel: number;
  stageClass: string;
  glowClass: string;
};

export const NOTIFICATION_ACTIONS_BY_MODEL: Record<
  Live2DPresenterModelId,
  NotificationActionOption[]
> = {
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

export const CHARACTER_VOICE_PACKS: Record<Live2DPresenterModelId, CharacterVoicePack[]> = {
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

export const CHARACTER_STAGE_SKINS: Record<Live2DPresenterModelId, CharacterStageSkin[]> = {
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

export function toLive2DModelId(id: string): Live2DPresenterModelId | null {
  if (id === 'haru' || id === 'hiyori' || id === 'mark' || id === 'mao' || id === 'rice') {
    return id;
  }
  return null;
}

export function resolveBonusTier(
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

export function formatPreviewNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPreviewBalanceLabel(item: AppNotification): string {
  switch (item.accountType) {
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(item.balanceAfter);
    case 'COMPUTE':
      return formatComputeCreditsLabel(item.balanceAfter);
    default:
      return formatCashCreditsLabel(item.balanceAfter);
  }
}

export type CharacterShowcaseItem = {
  id: string;
  name: string;
  isUnlocked: boolean;
  isEquipped: boolean;
  affinityLevel: number;
  affinityExp: number;
  previewSrc?: string | null;
  description?: string | null;
  worldview?: string | null;
  story?: string | null;
  gathering?: string | null;
  linkLine?: string | null;
  teachingStyle?: string | null;
  bondLine?: string | null;
  personalityTags?: string[];
  nextUnlockHint?: string | null;
  modelId: Live2DPresenterModelId | null;
  posterSrc: string;
  source: 'summary' | 'local';
};

export function resolveLive2DPoster(
  modelId: Live2DPresenterModelId,
  previewSrc?: string | null,
): string {
  return LIVE2D_POSTER_BY_ID[modelId] ?? previewSrc ?? LIVE2D_PRESENTER_MODELS[modelId].previewSrc;
}

export function readStringRecordFromStorage(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeStringRecordToStorage(key: string, value: Record<string, string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence errors; keep current session state.
  }
}

export function buildCharacterMotionPacks(modelId: Live2DPresenterModelId): CharacterMotionPack[] {
  return CHARACTER_MOTION_PACKS[modelId];
}

export function playCharacterVoicePack(
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
