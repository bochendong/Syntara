import type { TTSProviderId } from '@/lib/audio/types';

export const CLASSROOM_LIVE2D_PRESENTER_ENABLED = false;

export const LIVE2D_PRESENTER_AVATAR_BY_ID = {
  haru: '/liv2d_poster/haru-avator.png',
  hiyori: '/liv2d_poster/hiyori-avator.png',
  mark: '/liv2d_poster/mark-avator.png',
  mao: '/liv2d_poster/mao-avator.png',
  rice: '/liv2d_poster/rice-avator.png',
} as const;

export const SIDEBAR_VOICE_REPLY_PROVIDER_ORDER = [
  'qwen-tts',
  'azure-tts',
  'glm-tts',
  'openai-tts',
  'elevenlabs-tts',
] as const satisfies readonly TTSProviderId[];

export const SIDEBAR_VOICE_REPLY_PREFERRED_VOICE: Partial<Record<TTSProviderId, string>> = {
  'qwen-tts': 'Stella',
  'azure-tts': 'zh-CN-XiaoyiNeural',
  'glm-tts': 'tongtong',
  'openai-tts': 'nova',
  'elevenlabs-tts': 'EXAVITQu4vr4xnSDxMaL',
};
