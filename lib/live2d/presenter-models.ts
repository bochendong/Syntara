export type Live2DPresenterModelId = 'hiyori' | 'haru' | 'mark' | 'mao' | 'rice';

export type Live2DPresenterModelConfig = {
  readonly id: Live2DPresenterModelId;
  readonly badgeLabel: string;
  readonly modelSrc: string;
  readonly previewSrc: string;
  readonly idleMotionGroup: string;
  readonly speakMotionGroup: string;
};

export const LIVE2D_PRESENTER_MODELS: Record<Live2DPresenterModelId, Live2DPresenterModelConfig> = {
  hiyori: {
    id: 'hiyori',
    badgeLabel: 'Hiyori',
    modelSrc: '/live2d/Hiyori/Hiyori.model3.json',
    previewSrc: '/liv2d_poster/hiyori-full.png',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
  haru: {
    id: 'haru',
    badgeLabel: 'Haru',
    modelSrc: '/live2d/Haru/Haru.model3.json',
    previewSrc: '/liv2d_poster/haru-full.png',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
  mark: {
    id: 'mark',
    badgeLabel: 'Mark',
    modelSrc: '/live2d/Mark/Mark.model3.json',
    previewSrc: '/liv2d_poster/mark-full.png',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'Idle',
  },
  mao: {
    id: 'mao',
    badgeLabel: 'Mao',
    modelSrc: '/live2d/Mao/Mao.model3.json',
    previewSrc: '/liv2d_poster/mao-full.png',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
  rice: {
    id: 'rice',
    badgeLabel: 'Rice',
    modelSrc: '/live2d/Rice/Rice.model3.json',
    previewSrc: '/liv2d_poster/rice-full.png',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
};

export const DEFAULT_LIVE2D_PRESENTER_MODEL_ID: Live2DPresenterModelId = 'mark';
