export type Live2DPresenterModelId = 'hiyori' | 'haru' | 'mark';

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
    previewSrc: '/live2d/previews/hiyori.jpg',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
  haru: {
    id: 'haru',
    badgeLabel: 'Haru',
    modelSrc: '/live2d/Haru/Haru.model3.json',
    previewSrc: '/live2d/previews/haru.jpg',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'TapBody',
  },
  mark: {
    id: 'mark',
    badgeLabel: 'Mark',
    modelSrc: '/live2d/Mark/Mark.model3.json',
    previewSrc: '/live2d/previews/mark.jpg',
    idleMotionGroup: 'Idle',
    speakMotionGroup: 'Idle',
  },
};

export const DEFAULT_LIVE2D_PRESENTER_MODEL_ID: Live2DPresenterModelId = 'hiyori';
