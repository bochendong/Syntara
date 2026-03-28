'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';

export interface TalkingAvatarOverlayState {
  readonly speaking: boolean;
  readonly speechText?: string | null;
  readonly playbackRate?: number;
  readonly currentVisemeId?: number | null;
  readonly cadence?: TalkingAvatarSpeechCadence;
}

interface TalkingAvatarOverlayProps extends TalkingAvatarOverlayState {
  readonly className?: string;
}

const LIVE2D_CORE_SRC = '/live2d/live2dcubismcore.min.js';
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
    __openmaicLive2DCorePromise?: Promise<void>;
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
  currentVisemeId,
  cadence = speaking ? 'fallback' : 'idle',
  className,
}: TalkingAvatarOverlayProps) {
  const live2dPresenterModelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const modelConfig = LIVE2D_PRESENTER_MODELS[live2dPresenterModelId];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const speechStateRef = useRef({
    speaking,
    playbackRate,
    currentVisemeId,
    cadence,
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
    speechStateRef.current = { speaking, playbackRate, currentVisemeId, cadence };
  }, [cadence, speaking, playbackRate, currentVisemeId]);

  useEffect(() => {
    wasSpeakingRef.current = false;
  }, [live2dPresenterModelId]);

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

    const setup = async () => {
      const mount = mountRef.current;
      if (!mount) return;

      setStatus('loading');

      await ensureCubismCore();

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

      if (cancelled || !mountRef.current) return;

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

      const model = (await Live2DModel.from(modelConfig.modelSrc, {
        autoFocus: false,
        autoHitTest: false,
        idleMotionGroup: modelConfig.idleMotionGroup,
      })) as Live2DModelInstance;

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

      fitModelToFrame(model, mount, baseSize);

      const detachPoseHook = attachSpeechPose(model, speechStateRef);
      const resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => fitModelToFrame(model, mount, baseSize))
          : null;

      resizeObserver?.observe(mount);

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
      console.error('Failed to initialize Live2D presenter', error);
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
      void import('pixi-live2d-display/cubism4')
        .then((live2dModule) => {
          (live2dModule as { SoundManager?: { destroy?: () => void } }).SoundManager?.destroy?.();
        })
        .catch(() => {
          // Ignore cleanup failures for optional motion audio.
        });
      if (mountRef.current) {
        mountRef.current.replaceChildren();
      }
    };
  }, [modelConfig.idleMotionGroup, modelConfig.modelSrc]);

  return (
    <div
      aria-hidden="true"
      title={speechText || undefined}
      className={cn('pointer-events-none absolute right-3 top-3 z-[108] w-40 sm:w-48', className)}
    >
      <div className="relative overflow-hidden rounded-[20px] bg-transparent shadow-none">
        <div className="absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_1px_6px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
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
          {modelConfig.badgeLabel}
        </div>

        <div
          ref={mountRef}
          className="relative h-52 w-full overflow-hidden bg-transparent [mask-image:linear-gradient(180deg,black_80%,transparent_100%)] sm:h-60"
        />

        {status === 'error' && (
          <div className="absolute inset-x-2 bottom-2 rounded-xl border border-rose-400/50 bg-black/55 px-2 py-1.5 text-[10px] font-medium text-rose-200 backdrop-blur-sm">
            Live2D load failed
          </div>
        )}
      </div>
    </div>
  );
}

function fitModelToFrame(
  model: Live2DModelInstance,
  mount: HTMLDivElement,
  baseSize: ModelBaseSize,
) {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;

  model.anchor.set(0.5, 0);
  const scale = Math.min((width * 1.04) / baseSize.width, (height * 1.12) / baseSize.height) * 1.02;
  model.scale.set(scale);
  model.position.set(width * 0.52, -height * 0.02);
}

function attachSpeechPose(
  model: Live2DModelInstance,
  speechStateRef: React.MutableRefObject<{
    speaking: boolean;
    playbackRate: number;
    currentVisemeId?: number | null;
    cadence: TalkingAvatarSpeechCadence;
  }>,
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
    const { speaking, playbackRate, currentVisemeId, cadence } = speechStateRef.current;
    const easedRate = Math.max(0.7, Math.min(1.8, playbackRate || 1));
    const now = performance.now();
    const dt = clamp((now - lastTickAt) / 16.7, 0.6, 2.2);
    lastTickAt = now;

    const mouthPhase = now / (210 / easedRate);
    const gesturePhase = now / (620 / easedRate);
    const breathPhase = now / 1100;
    const baseTarget = resolveMouthPose(currentVisemeId, cadence);
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

    const activeMotionWeight =
      cadence === 'active' ? poseState.talkEnergy : poseState.talkEnergy * 0.35;
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
  visemeId: number | null | undefined,
  cadence: TalkingAvatarSpeechCadence,
): MouthPose {
  if (cadence === 'idle' || cadence === 'pause') {
    return { open: 0, form: 0 };
  }

  if (visemeId == null) {
    return cadence === 'fallback' ? { open: 0.12, form: 0.08 } : { open: 0.08, form: 0.04 };
  }

  if (visemeId === 0 || visemeId === 21) {
    return { open: 0.02, form: -0.04 };
  }

  if (visemeId >= 1 && visemeId <= 7) {
    return { open: 0.18, form: 0.04 };
  }

  if (visemeId >= 8 && visemeId <= 13) {
    return { open: 0.34, form: 0.16 };
  }

  if (visemeId >= 14 && visemeId <= 17) {
    return { open: 0.48, form: -0.24 };
  }

  return { open: 0.64, form: 0.3 };
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

async function playPresenterMotion(model: Live2DModelInstance, motionGroup: string, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  try {
    await model.motion(motionGroup);
  } catch {
    // Motion playback is best-effort; our parameter animation still runs.
  }
}

async function ensureCubismCore() {
  if (typeof window === 'undefined') return;
  if (window.Live2DCubismCore) return;

  if (!window.__openmaicLive2DCorePromise) {
    window.__openmaicLive2DCorePromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-openmaic-live2d]');

      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Cubism core failed to load')), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.dataset.openmaicLive2d = 'true';
      script.src = LIVE2D_CORE_SRC;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Cubism core failed to load'));
      document.head.appendChild(script);
    }).catch((error) => {
      window.__openmaicLive2DCorePromise = undefined;
      throw error;
    });
  }

  await window.__openmaicLive2DCorePromise;
}
