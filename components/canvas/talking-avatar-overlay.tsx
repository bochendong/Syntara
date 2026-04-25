'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import type { Live2DPresenterModelId } from '@/lib/live2d/presenter-models';
import type { MouthShape } from '@/lib/types/action';
import { mapAzureVisemeToLegacyMouthShape } from '@/lib/audio/mouth-cues';

export interface TalkingAvatarOverlayState {
  readonly speaking: boolean;
  readonly speechText?: string | null;
  readonly playbackRate?: number;
  readonly currentMouthShape?: MouthShape | null;
  readonly currentVisemeId?: number | null;
  readonly cadence?: TalkingAvatarSpeechCadence;
}

type MotionPriority = Parameters<Live2DModelInstance['motion']>[2];

export interface TalkingAvatarPointerInteractionState {
  readonly active: boolean;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly engagementKey?: number;
}

interface TalkingAvatarOverlayProps extends TalkingAvatarOverlayState {
  readonly className?: string;
  /** `overlay` = 幻灯片角标；`sidebar` = 左侧栏全高面板；`card` = 设置面板卡片预览 */
  readonly layout?: 'overlay' | 'sidebar' | 'card';
  /** 仅在 `layout=card` 下生效，用于卡片预览取景（default=卡片全身，half=半身，stage=舞台全身居中） */
  readonly cardFraming?: 'default' | 'half' | 'stage';
  readonly pointerInteraction?: TalkingAvatarPointerInteractionState | null;
  readonly modelIdOverride?: Live2DPresenterModelId;
  readonly manualMotionTrigger?: {
    token: number;
    motionGroup: string;
    motionIndex?: number;
  } | null;
  readonly showBadge?: boolean;
  readonly showStatusDot?: boolean;
}

const LIVE2D_CORE_SRC = '/live2d/live2dcubismcore.min.js';
const LIVE2D_CORE_CDN_FALLBACK_SRC =
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';

/** Rice 模型在画布中 bounding box 偏小，统一略放大以与其它角色观感一致。 */
const RICE_MODEL_DISPLAY_SCALE = 1.28;
export type TalkingAvatarSpeechCadence = 'idle' | 'active' | 'pause' | 'fallback';

type MouthPose = {
  open: number;
  form: number;
};

type ModelBaseSize = {
  width: number;
  height: number;
};

type PixiModule = typeof import('pixi.js');
type Live2DModule = typeof import('pixi-live2d-display/cubism4');
type Live2DModelInstance = InstanceType<Live2DModule['Live2DModel']>;

declare global {
  interface Window {
    PIXI?: PixiModule;
    Live2DCubismCore?: unknown;
    __synatraLive2DCorePromise?: Promise<void>;
  }
}

/**
 * Replaces the static portrait experiment with a real Live2D presenter.
 * We use an official Live2D sample model and drive the mouth with our
 * existing Azure viseme timeline.
 */
export function TalkingAvatarOverlay({
  speaking,
  speechText,
  playbackRate = 1,
  currentMouthShape,
  currentVisemeId,
  cadence = speaking ? 'fallback' : 'idle',
  className,
  layout = 'overlay',
  cardFraming = 'default',
  pointerInteraction,
  modelIdOverride,
  manualMotionTrigger,
  showBadge = true,
  showStatusDot = true,
}: TalkingAvatarOverlayProps) {
  const { locale } = useI18n();
  const live2dPresenterModelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const resolvedModelId = modelIdOverride ?? live2dPresenterModelId;
  const modelConfig = LIVE2D_PRESENTER_MODELS[resolvedModelId];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const speechStateRef = useRef({
    speaking,
    playbackRate,
    currentMouthShape,
    currentVisemeId,
    cadence,
  });
  const interactionStateRef = useRef<TalkingAvatarPointerInteractionState>({
    active: false,
    normalizedX: 0,
    normalizedY: 0,
  });
  const instanceRef = useRef<{
    app: import('pixi.js').Application;
    model: Live2DModelInstance;
    resizeObserver: ResizeObserver | null;
    detachPoseHook: (() => void) | null;
  } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const wasSpeakingRef = useRef(false);

  useEffect(() => {
    speechStateRef.current = {
      speaking,
      playbackRate,
      currentMouthShape,
      currentVisemeId,
      cadence,
    };
  }, [cadence, speaking, playbackRate, currentMouthShape, currentVisemeId]);

  useEffect(() => {
    interactionStateRef.current = pointerInteraction ?? {
      active: false,
      normalizedX: 0,
      normalizedY: 0,
    };
  }, [pointerInteraction]);

  useEffect(() => {
    wasSpeakingRef.current = false;
  }, [resolvedModelId]);

  useEffect(() => {
    if (status !== 'ready') return;
    const model = instanceRef.current?.model;
    if (!model) return;

    if (speaking && !wasSpeakingRef.current) {
      void playPresenterMotion(model, modelConfig.speakMotionGroup, 140);
    }

    wasSpeakingRef.current = speaking;
  }, [modelConfig.speakMotionGroup, speaking, status]);

  useEffect(() => {
    if (status !== 'ready' || !manualMotionTrigger) return;
    const model = instanceRef.current?.model;
    if (!model) return;
    void playPresenterMotion(model, manualMotionTrigger.motionGroup, {
      index: manualMotionTrigger.motionIndex,
      priority: 3,
    });
  }, [manualMotionTrigger, status]);

  useEffect(() => {
    if (
      status !== 'ready' ||
      speaking ||
      !pointerInteraction?.active ||
      !pointerInteraction.engagementKey ||
      modelConfig.speakMotionGroup === modelConfig.idleMotionGroup
    ) {
      return;
    }

    const model = instanceRef.current?.model;
    if (!model) return;

    void playPresenterMotion(model, modelConfig.speakMotionGroup, {
      priority: 2,
    });
  }, [
    modelConfig.idleMotionGroup,
    modelConfig.speakMotionGroup,
    speaking,
    pointerInteraction?.active,
    pointerInteraction?.engagementKey,
    status,
  ]);

  useEffect(() => {
    if (
      status !== 'ready' ||
      !speaking ||
      modelConfig.speakMotionGroup === modelConfig.idleMotionGroup
    ) {
      return;
    }

    const model = instanceRef.current?.model;
    if (!model) return;

    let cancelled = false;
    let timer = 0;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (cancelled || !speechStateRef.current.speaking) return;
        void playPresenterMotion(model, modelConfig.speakMotionGroup);
        schedule(randomRange(3600, 6200) / Math.max(0.8, playbackRate || 1));
      }, delayMs);
    };

    schedule(randomRange(2600, 4200) / Math.max(0.8, playbackRate || 1));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [modelConfig.idleMotionGroup, modelConfig.speakMotionGroup, playbackRate, speaking, status]);

  useEffect(() => {
    let cancelled = false;
    const mountElement = mountRef.current;

    const setup = async () => {
      const mount = mountElement;
      if (!mount) return;

      const resolvedCoreSrc = resolveLive2dAssetUrl(LIVE2D_CORE_SRC);
      const resolvedModelSrc = resolveLive2dAssetUrl(modelConfig.modelSrc);

      setStatus('loading');

      await ensureCubismCoreRuntimeWithFallback(
        resolvedCoreSrc,
        LIVE2D_CORE_CDN_FALLBACK_SRC,
        modelConfig.id,
      );

      const PIXI = await import('pixi.js');
      window.PIXI = PIXI;

      const live2dModule = (await import('pixi-live2d-display/cubism4')) as Live2DModule & {
        config?: { sound?: boolean };
        SoundManager?: { destroy?: () => void };
      };
      const { Live2DModel } = live2dModule;
      if (live2dModule.config) {
        live2dModule.config.sound = false;
      }
      live2dModule.SoundManager?.destroy?.();

      if (cancelled || !mountElement) return;

      const app = new PIXI.Application({
        antialias: true,
        autoDensity: true,
        autoStart: true,
        backgroundAlpha: 0,
        powerPreference: 'high-performance',
        resizeTo: mount,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });

      mount.replaceChildren(app.view as HTMLCanvasElement);

      let model: Live2DModelInstance;
      try {
        model = await loadPresenterModel(Live2DModel, modelConfig, resolvedModelSrc);
      } catch (initialLoadError) {
        const normalizedInitialError = normalizeUnknownError(initialLoadError);
        if (!/CubismMoc\.create\(\)/.test(normalizedInitialError.message)) {
          throw initialLoadError;
        }

        console.warn('Live2D model load failed at CubismMoc.create(), reloading Cubism Core', {
          modelId: modelConfig.id,
          modelSrc: modelConfig.modelSrc,
          resolvedModelSrc,
          coreSrc: resolvedCoreSrc,
          error: normalizedInitialError,
        });

        try {
          await forceReloadCubismCore(resolvedCoreSrc);
          model = await loadPresenterModel(Live2DModel, modelConfig, resolvedModelSrc);
        } catch (reloadError) {
          const normalizedReloadError = normalizeUnknownError(reloadError);
          const fallbackCoreSrc = LIVE2D_CORE_CDN_FALLBACK_SRC;
          console.warn('Local Cubism Core retry failed, trying CDN fallback core', {
            modelId: modelConfig.id,
            modelSrc: modelConfig.modelSrc,
            resolvedModelSrc,
            coreSrc: resolvedCoreSrc,
            fallbackCoreSrc,
            error: normalizedReloadError,
          });

          await forceReloadCubismCore(fallbackCoreSrc);
          model = await loadPresenterModel(Live2DModel, modelConfig, resolvedModelSrc);
        }
      }

      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      mount.replaceChildren(app.view as HTMLCanvasElement);

      app.stage.addChild(model);
      model.eventMode = 'none';

      const baseSize: ModelBaseSize = {
        width: Math.max(model.width, 1),
        height: Math.max(model.height, 1),
      };

      const syncCanvasToMount = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (w > 0 && h > 0) {
          app.renderer.resize(w, h);
          fitModelToFrame(model, mount, baseSize, layout, cardFraming, resolvedModelId);
        }
      };

      syncCanvasToMount();

      const detachPoseHook = attachSpeechPose(model, speechStateRef, interactionStateRef);
      const resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => syncCanvasToMount())
          : null;

      resizeObserver?.observe(mount);
      requestAnimationFrame(() => syncCanvasToMount());

      try {
        void model.motion(modelConfig.idleMotionGroup);
      } catch {
        // If the sample idle motion fails, the model still renders and blinks.
      }

      instanceRef.current = {
        app,
        model,
        resizeObserver,
        detachPoseHook,
      };
      setStatus('ready');
    };

    setup().catch((error) => {
      const normalizedError = normalizeUnknownError(error);
      console.error('Failed to initialize Live2D presenter', {
        modelId: modelConfig.id,
        modelSrc: modelConfig.modelSrc,
        resolvedModelSrc: resolveLive2dAssetUrl(modelConfig.modelSrc),
        coreSrc: resolveLive2dAssetUrl(LIVE2D_CORE_SRC),
        error: normalizedError,
      });
      setStatus('error');
    });

    return () => {
      cancelled = true;
      const instance = instanceRef.current;
      instanceRef.current = null;
      instance?.resizeObserver?.disconnect();
      instance?.detachPoseHook?.();
      if (instance?.app) {
        instance.app.destroy(true, { children: true });
      }
      if (syncCubismCoreRuntime()) {
        void import('pixi-live2d-display/cubism4')
          .then((live2dModule) => {
            (live2dModule as { SoundManager?: { destroy?: () => void } }).SoundManager?.destroy?.();
          })
          .catch(() => {
            // Ignore cleanup failures for optional motion audio.
          });
      }
      if (mountElement) {
        mountElement.replaceChildren();
      }
    };
  }, [cardFraming, layout, modelConfig]);

  return (
    <div
      aria-hidden="true"
      title={speechText || undefined}
      className={cn(
        'pointer-events-none bg-transparent',
        layout === 'overlay'
          ? 'absolute right-3 top-3 z-[108] w-40 sm:w-48'
          : 'relative z-0 flex h-full min-h-0 w-full flex-1 flex-col',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-[20px] bg-transparent shadow-none',
          layout === 'sidebar' && 'flex min-h-0 flex-1 flex-col',
          layout === 'card' && 'h-full',
        )}
      >
        {showBadge && (
          <div className="absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_1px_6px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
            {showStatusDot && (
              <span
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  speaking && status === 'ready'
                    ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]'
                    : status === 'error'
                      ? 'bg-rose-400'
                      : 'bg-white/50',
                )}
              />
            )}
            {modelConfig.badgeLabel}
          </div>
        )}

        <div
          ref={mountRef}
          className={cn(
            'relative z-[1] w-full overflow-hidden bg-transparent',
            layout === 'overlay'
              ? 'h-52 [mask-image:linear-gradient(180deg,black_80%,transparent_100%)] sm:h-60'
              : layout === 'sidebar'
                ? 'min-h-[200px] flex-1 [mask-image:linear-gradient(180deg,black_85%,transparent_100%)]'
                : 'h-full min-h-[180px] [mask-image:linear-gradient(180deg,black_90%,transparent_100%)]',
          )}
        />

        {status === 'error' && (
          <div className="absolute inset-x-2 bottom-2 rounded-xl border border-rose-400/50 bg-black/55 px-2 py-1.5 text-[10px] font-medium text-rose-200 backdrop-blur-sm">
            {locale === 'zh-CN' ? '讲师形象加载失败' : 'Unable to load presenter'}
          </div>
        )}
      </div>
    </div>
  );
}

async function loadPresenterModel(
  Live2DModel: Live2DModule['Live2DModel'],
  modelConfig: {
    id: string;
    modelSrc: string;
    idleMotionGroup: string;
  },
  resolvedModelSrc: string,
): Promise<Live2DModelInstance> {
  const baseOptions = {
    autoFocus: false,
    autoHitTest: false,
  } as const;

  try {
    return (await Live2DModel.from(resolvedModelSrc, {
      ...baseOptions,
      idleMotionGroup: modelConfig.idleMotionGroup,
    })) as Live2DModelInstance;
  } catch (primaryError) {
    const normalizedPrimaryError = normalizeUnknownError(primaryError);
    console.warn('Primary Live2D load failed, retrying without idle motion preload', {
      modelId: modelConfig.id,
      modelSrc: modelConfig.modelSrc,
      resolvedModelSrc,
      idleMotionGroup: modelConfig.idleMotionGroup,
      error: normalizedPrimaryError,
    });

    try {
      return (await Live2DModel.from(resolvedModelSrc, baseOptions)) as Live2DModelInstance;
    } catch (secondaryError) {
      const normalizedSecondaryError = normalizeUnknownError(secondaryError);
      console.warn('Secondary Live2D load failed, retrying without motion preload', {
        modelId: modelConfig.id,
        modelSrc: modelConfig.modelSrc,
        resolvedModelSrc,
        error: normalizedSecondaryError,
      });

      // Some Live2D assets fail during motion preload (especially older packs).
      // We disable preload as a last resort so the model can still render.
      return (await Live2DModel.from(resolvedModelSrc, {
        ...baseOptions,
        motionPreload: 0,
      } as unknown as Parameters<typeof Live2DModel.from>[1])) as Live2DModelInstance;
    }
  }
}

function fitModelToFrame(
  model: Live2DModelInstance,
  mount: HTMLDivElement,
  baseSize: ModelBaseSize,
  layout: 'overlay' | 'sidebar' | 'card',
  cardFraming: 'default' | 'half' | 'stage' = 'default',
  modelId: Live2DPresenterModelId = 'mark',
) {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;
  const riceBoost = modelId === 'rice' ? RICE_MODEL_DISPLAY_SCALE : 1;

  if (layout === 'card') {
    if (cardFraming === 'stage') {
      model.anchor.set(0.5, 0.5);
      const scale =
        Math.min((width * 0.9) / baseSize.width, (height * 0.9) / baseSize.height) * riceBoost;
      model.scale.set(scale);
      model.position.set(width * 0.5, height * 0.5);
      return;
    }

    const isHalf = cardFraming === 'half';
    model.anchor.set(0.5, isHalf ? 0.08 : 0.04);
    const scale =
      Math.min(
        (width * (isHalf ? 1.2 : 0.96)) / baseSize.width,
        (height * (isHalf ? 1.48 : 1.18)) / baseSize.height,
      ) *
      (isHalf ? 1.26 : 1.04) *
      riceBoost;
    model.scale.set(scale);
    model.position.set(width * 0.5, height * (isHalf ? 0.15 : 0.04));
    return;
  }

  if (layout === 'sidebar') {
    model.anchor.set(0.5, 0.5);
    const scale =
      Math.min((width * 1.02) / baseSize.width, (height * 0.84) / baseSize.height) * 0.98 * riceBoost;
    model.scale.set(scale);
    model.position.set(width * 0.5, height * 0.5);
    return;
  }

  model.anchor.set(0.5, 0);
  const scale =
    Math.min((width * 1.04) / baseSize.width, (height * 1.12) / baseSize.height) * 1.02 * riceBoost;
  model.scale.set(scale);
  model.position.set(width * 0.52, -height * 0.02);
}

function attachSpeechPose(
  model: Live2DModelInstance,
  speechStateRef: React.MutableRefObject<{
    speaking: boolean;
    playbackRate: number;
    currentMouthShape?: MouthShape | null;
    currentVisemeId?: number | null;
    cadence: TalkingAvatarSpeechCadence;
  }>,
  interactionStateRef: React.MutableRefObject<TalkingAvatarPointerInteractionState>,
) {
  const internalModel = (
    model as Live2DModelInstance & {
      internalModel?: {
        on?: (event: string, cb: () => void) => void;
        off?: (event: string, cb: () => void) => void;
        coreModel?: {
          addParameterValueById?: (id: string, value: number, weight?: number) => void;
        };
        motionManager?: {
          lipSyncIds?: string[];
        };
      };
    }
  ).internalModel;

  if (!internalModel?.coreModel?.addParameterValueById || !internalModel?.on) {
    return null;
  }

  const mouthState = { open: 0, form: 0 };
  const poseState = {
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    bodyAngleX: 0,
    eyeX: 0,
    eyeY: 0,
    talkEnergy: 0,
    interactionEnergy: 0,
    targetAngleX: 0,
    targetAngleY: 0,
    targetAngleZ: 0,
    targetBodyAngleX: 0,
    targetEyeX: 0,
    targetEyeY: 0,
    nextShiftAt: 0,
  };
  let lastTickAt = performance.now();

  const beforeModelUpdate = () => {
    const { speaking, playbackRate, currentMouthShape, currentVisemeId, cadence } =
      speechStateRef.current;
    const interaction = interactionStateRef.current;
    const easedRate = Math.max(0.7, Math.min(1.8, playbackRate || 1));
    const now = performance.now();
    const dt = clamp((now - lastTickAt) / 16.7, 0.6, 2.2);
    lastTickAt = now;

    const mouthPhase = now / (210 / easedRate);
    const gesturePhase = now / (620 / easedRate);
    const breathPhase = now / 1100;
    const baseTarget = resolveMouthPose(
      currentMouthShape ?? mapAzureVisemeToLegacyMouthShape(currentVisemeId),
      cadence,
    );
    const rhythmicOpen =
      cadence === 'fallback'
        ? ((Math.sin(mouthPhase) + 1) / 2) * 0.34
        : cadence === 'active'
          ? ((Math.sin(mouthPhase) + 1) / 2) * 0.08
          : 0;
    const target = speaking
      ? {
          open: clamp(baseTarget.open + rhythmicOpen, 0, 1),
          form: clamp(
            baseTarget.form +
              (cadence === 'pause'
                ? 0
                : Math.sin(mouthPhase * 0.58) * (cadence === 'fallback' ? 0.1 : 0.04)),
            -1,
            1,
          ),
        }
      : baseTarget;

    const mouthEase = cadence === 'pause' || cadence === 'idle' ? 0.28 : 0.5;
    mouthState.open = lerp(mouthState.open, target.open, 1 - Math.pow(1 - mouthEase, dt));
    mouthState.form = lerp(mouthState.form, target.form, 1 - Math.pow(1 - 0.28, dt));

    const talkEnergyTarget =
      cadence === 'active' ? 1 : cadence === 'fallback' ? 0.76 : cadence === 'pause' ? 0.14 : 0;
    poseState.talkEnergy = lerp(
      poseState.talkEnergy,
      talkEnergyTarget,
      1 - Math.pow(1 - (cadence === 'active' ? 0.14 : 0.22), dt),
    );
    poseState.interactionEnergy = lerp(
      poseState.interactionEnergy,
      interaction.active ? 1 : 0,
      1 - Math.pow(1 - 0.1, dt),
    );

    if (cadence === 'active' && now >= poseState.nextShiftAt) {
      poseState.targetAngleX = randomRange(-4.2, 4.6);
      poseState.targetAngleY = randomRange(-1.8, 2.4);
      poseState.targetAngleZ = randomRange(-1.4, 1.5);
      poseState.targetBodyAngleX = randomRange(-2.6, 2.8);
      poseState.targetEyeX = randomRange(-0.28, 0.28);
      poseState.targetEyeY = randomRange(-0.12, 0.18);
      poseState.nextShiftAt = now + randomRange(900, 1650) / easedRate;
    } else if (cadence === 'pause' || cadence === 'idle') {
      poseState.targetAngleX = 0;
      poseState.targetAngleY = 0;
      poseState.targetAngleZ = 0;
      poseState.targetBodyAngleX = 0;
      poseState.targetEyeX = 0;
      poseState.targetEyeY = 0;
    }

    if (interaction.active) {
      const pointerInfluence = speaking ? 0.38 : 1;
      const pointerAngleX = clamp(interaction.normalizedX * 5.2 * pointerInfluence, -5.2, 5.2);
      const pointerAngleY = clamp(interaction.normalizedY * 3.4 * pointerInfluence, -3.4, 3.4);
      const pointerAngleZ = clamp(interaction.normalizedX * -0.7 * pointerInfluence, -0.7, 0.7);
      const pointerBodyAngleX = clamp(interaction.normalizedX * 1.6 * pointerInfluence, -1.6, 1.6);
      const pointerEyeX = clamp(interaction.normalizedX * 0.24, -0.24, 0.24);
      const pointerEyeY = clamp(interaction.normalizedY * 0.14, -0.14, 0.14);
      const pointerBlend = 0.2 + poseState.interactionEnergy * 0.18;

      poseState.targetAngleX = lerp(poseState.targetAngleX, pointerAngleX, pointerBlend);
      poseState.targetAngleY = lerp(poseState.targetAngleY, pointerAngleY, pointerBlend);
      poseState.targetAngleZ = lerp(poseState.targetAngleZ, pointerAngleZ, 0.16);
      poseState.targetBodyAngleX = lerp(
        poseState.targetBodyAngleX,
        pointerBodyAngleX,
        0.1 + poseState.interactionEnergy * 0.1,
      );
      poseState.targetEyeX = lerp(poseState.targetEyeX, pointerEyeX, 0.32);
      poseState.targetEyeY = lerp(poseState.targetEyeY, pointerEyeY, 0.28);
    }

    const activeMotionWeight =
      cadence === 'active'
        ? Math.max(poseState.talkEnergy, poseState.interactionEnergy * 0.18)
        : poseState.talkEnergy * 0.22 + poseState.interactionEnergy * 0.28;
    const idleBreath = Math.sin(breathPhase) * 0.5;
    const nodX = Math.sin(gesturePhase) * 2.5 * activeMotionWeight;
    const nodY = Math.cos(gesturePhase * 0.72) * 1.2 * activeMotionWeight;
    const tiltZ = Math.sin(gesturePhase * 0.88) * 0.95 * activeMotionWeight;
    const bodyShift = Math.sin(gesturePhase * 0.44) * 1.8 * activeMotionWeight;

    poseState.angleX = lerp(
      poseState.angleX,
      poseState.targetAngleX * poseState.talkEnergy + nodX + idleBreath * 0.9,
      1 - Math.pow(1 - 0.15, dt),
    );
    poseState.angleY = lerp(
      poseState.angleY,
      poseState.targetAngleY * poseState.talkEnergy + nodY,
      1 - Math.pow(1 - 0.14, dt),
    );
    poseState.angleZ = lerp(
      poseState.angleZ,
      poseState.targetAngleZ * poseState.talkEnergy + tiltZ,
      1 - Math.pow(1 - 0.12, dt),
    );
    poseState.bodyAngleX = lerp(
      poseState.bodyAngleX,
      poseState.targetBodyAngleX * poseState.talkEnergy + bodyShift + idleBreath * 0.5,
      1 - Math.pow(1 - 0.1, dt),
    );
    poseState.eyeX = lerp(
      poseState.eyeX,
      poseState.targetEyeX * (0.28 + poseState.talkEnergy * 0.72),
      1 - Math.pow(1 - 0.16, dt),
    );
    poseState.eyeY = lerp(
      poseState.eyeY,
      poseState.targetEyeY * (0.18 + poseState.talkEnergy * 0.5),
      1 - Math.pow(1 - 0.16, dt),
    );

    const lipSyncIds = internalModel.motionManager?.lipSyncIds?.length
      ? internalModel.motionManager.lipSyncIds
      : ['ParamMouthOpenY'];
    for (const id of lipSyncIds) {
      internalModel.coreModel?.addParameterValueById?.(id, mouthState.open, 1);
    }

    internalModel.coreModel?.addParameterValueById?.('ParamMouthForm', mouthState.form, 0.58);
    internalModel.coreModel?.addParameterValueById?.('ParamAngleX', poseState.angleX, 0.24);
    internalModel.coreModel?.addParameterValueById?.('ParamAngleY', poseState.angleY, 0.22);
    internalModel.coreModel?.addParameterValueById?.('ParamAngleZ', poseState.angleZ, 0.18);
    internalModel.coreModel?.addParameterValueById?.('ParamBodyAngleX', poseState.bodyAngleX, 0.16);
    internalModel.coreModel?.addParameterValueById?.('ParamEyeBallX', poseState.eyeX, 0.12);
    internalModel.coreModel?.addParameterValueById?.('ParamEyeBallY', poseState.eyeY, 0.12);
  };

  internalModel.on('beforeModelUpdate', beforeModelUpdate);

  return () => {
    internalModel.off?.('beforeModelUpdate', beforeModelUpdate);
  };
}

function resolveMouthPose(
  mouthShape: MouthShape | null | undefined,
  cadence: TalkingAvatarSpeechCadence,
): MouthPose {
  if (cadence === 'idle' || cadence === 'pause') {
    return { open: 0, form: 0 };
  }

  if (mouthShape == null) {
    return cadence === 'fallback' ? { open: 0.12, form: 0.08 } : { open: 0.08, form: 0.04 };
  }

  switch (mouthShape) {
    case 'closed':
      return { open: 0.02, form: 0 };
    case 'A':
      return { open: 0.82, form: 0.08 };
    case 'I':
      return { open: 0.34, form: 0.62 };
    case 'U':
      return { open: 0.28, form: -0.58 };
    case 'E':
      return { open: 0.44, form: 0.34 };
    case 'O':
      return { open: 0.56, form: -0.36 };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, factor: number) {
  return from + (to - from) * factor;
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function playPresenterMotion(
  model: Live2DModelInstance,
  motionGroup: string,
  options:
    | number
    | {
        delayMs?: number;
        index?: number;
        priority?: MotionPriority;
      } = 0,
) {
  const resolvedOptions = typeof options === 'number' ? { delayMs: options } : options;

  if ((resolvedOptions.delayMs ?? 0) > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, resolvedOptions.delayMs));
  }

  try {
    await model.motion(motionGroup, resolvedOptions.index, resolvedOptions.priority);
  } catch {
    // Motion playback is best-effort; our parameter animation still runs.
  }
}

async function ensureCubismCore(coreSrc: string) {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow) return;
  if (syncCubismCoreRuntime()) return;

  if (!browserWindow.__synatraLive2DCorePromise) {
    browserWindow.__synatraLive2DCorePromise = new Promise<void>((resolve, reject) => {
      const resolveWhenRuntimeIsReady = () => {
        void waitForCubismCoreRuntime(coreSrc).then(resolve, reject);
      };
      const existing = document.querySelector<HTMLScriptElement>('script[data-synatra-live2d]');

      if (existing) {
        if (syncCubismCoreRuntime()) {
          resolve();
          return;
        }

        if (isScriptMarkedLoaded(existing)) {
          resolveWhenRuntimeIsReady();
          return;
        }

        existing.addEventListener('load', resolveWhenRuntimeIsReady, { once: true });
        existing.addEventListener('error', () => reject(new Error('Cubism core failed to load')), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.async = false;
      script.type = 'text/javascript';
      script.dataset.synatraLive2d = 'true';
      script.src = coreSrc;
      script.onload = () => {
        script.dataset.synatraLive2dLoaded = 'true';
        resolveWhenRuntimeIsReady();
      };
      script.onerror = () => reject(new Error(`Cubism core failed to load: ${coreSrc}`));
      document.head.appendChild(script);
    }).catch((error) => {
      browserWindow.__synatraLive2DCorePromise = undefined;
      throw error;
    });
  }

  await browserWindow.__synatraLive2DCorePromise;
  if (!syncCubismCoreRuntime()) {
    throw new Error(`Cubism core loaded but runtime global is missing: ${coreSrc}`);
  }
}

async function forceReloadCubismCore(coreSrc: string) {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow) return;
  browserWindow.__synatraLive2DCorePromise = undefined;
  clearCubismCoreRuntime();

  const existingScripts = document.querySelectorAll<HTMLScriptElement>(
    'script[data-synatra-live2d]',
  );
  existingScripts.forEach((script) => script.remove());

  const cacheBustedSrc = `${coreSrc}${coreSrc.includes('?') ? '&' : '?'}reload=${Date.now()}`;
  await ensureCubismCore(cacheBustedSrc);
}

function getLive2dBrowserWindow() {
  if (typeof window === 'undefined') return null;
  return window;
}

function getCubismCoreRuntime() {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow) return undefined;

  return (
    browserWindow.Live2DCubismCore ??
    (globalThis as typeof globalThis & { Live2DCubismCore?: unknown }).Live2DCubismCore
  );
}

function syncCubismCoreRuntime(runtime = getCubismCoreRuntime()) {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow || !runtime) return false;

  browserWindow.Live2DCubismCore = runtime;
  (globalThis as typeof globalThis & { Live2DCubismCore?: unknown }).Live2DCubismCore = runtime;
  return true;
}

function clearCubismCoreRuntime() {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow) return;

  try {
    delete browserWindow.Live2DCubismCore;
  } catch {
    browserWindow.Live2DCubismCore = undefined;
  }

  try {
    delete (globalThis as typeof globalThis & { Live2DCubismCore?: unknown }).Live2DCubismCore;
  } catch {
    (globalThis as typeof globalThis & { Live2DCubismCore?: unknown }).Live2DCubismCore = undefined;
  }
}

function waitForCubismCoreRuntime(coreSrc: string, timeoutMs = 3000) {
  const browserWindow = getLive2dBrowserWindow();
  if (!browserWindow) return Promise.resolve();

  const startedAt = performance.now();
  return new Promise<void>((resolve, reject) => {
    const checkRuntime = () => {
      if (syncCubismCoreRuntime()) {
        resolve();
        return;
      }

      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error(`Cubism core loaded but runtime global is missing: ${coreSrc}`));
        return;
      }

      browserWindow.setTimeout(checkRuntime, 25);
    };

    checkRuntime();
  });
}

function isScriptMarkedLoaded(script: HTMLScriptElement) {
  return (
    script.dataset.synatraLive2dLoaded === 'true' ||
    (script as HTMLScriptElement & { readyState?: string }).readyState === 'complete'
  );
}

async function ensureCubismCoreRuntimeWithFallback(
  primaryCoreSrc: string,
  fallbackCoreSrc: string,
  modelId: string,
) {
  try {
    await ensureCubismCore(primaryCoreSrc);
    return;
  } catch (primaryError) {
    console.warn('Primary Cubism core load failed, forcing local reload', {
      modelId,
      coreSrc: primaryCoreSrc,
      error: normalizeUnknownError(primaryError),
    });
  }

  try {
    await forceReloadCubismCore(primaryCoreSrc);
    return;
  } catch (reloadError) {
    console.warn('Local Cubism core reload failed, trying CDN fallback', {
      modelId,
      coreSrc: primaryCoreSrc,
      fallbackCoreSrc,
      error: normalizeUnknownError(reloadError),
    });
  }

  await forceReloadCubismCore(fallbackCoreSrc);
}

function resolveLive2dAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (!path.startsWith('/')) return path;

  const nextData = (
    window as Window & { __NEXT_DATA__?: { assetPrefix?: string; basePath?: string } }
  ).__NEXT_DATA__;
  const assetPrefix = nextData?.assetPrefix?.trim() ?? '';
  const basePath = nextData?.basePath?.trim() ?? '';

  const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
  const normalizePathPrefix = (value: string) => {
    if (!value) return '';
    const prefixed = value.startsWith('/') ? value : `/${value}`;
    return trimTrailingSlash(prefixed);
  };

  const normalizedAssetPrefix = trimTrailingSlash(assetPrefix);
  const normalizedBasePath = normalizePathPrefix(basePath);

  // Next.js deployments may enable both assetPrefix and basePath.
  // Live2D assets are under /public, so we need to preserve basePath
  // even when an assetPrefix (especially absolute CDN URL) is set.
  const needsBasePath =
    normalizedBasePath &&
    (!normalizedAssetPrefix || !normalizedAssetPrefix.endsWith(normalizedBasePath));
  const pathWithBasePath = `${needsBasePath ? normalizedBasePath : ''}${path}`;

  if (!normalizedAssetPrefix) {
    return pathWithBasePath;
  }
  if (/^https?:\/\//i.test(normalizedAssetPrefix)) {
    return `${normalizedAssetPrefix}${pathWithBasePath}`;
  }

  const relativePrefix = normalizePathPrefix(normalizedAssetPrefix);
  return `${relativePrefix}${pathWithBasePath}`;
}

function normalizeUnknownError(error: unknown): {
  message: string;
  stack?: string;
  raw?: unknown;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return {
    message: 'Unknown error',
    raw: error,
  };
}
