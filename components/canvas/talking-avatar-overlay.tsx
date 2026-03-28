'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TalkingAvatarOverlayState {
  readonly speaking: boolean;
  readonly speechText?: string | null;
  readonly playbackRate?: number;
  readonly currentVisemeId?: number | null;
}

interface TalkingAvatarOverlayProps extends TalkingAvatarOverlayState {
  readonly className?: string;
}

const LIVE2D_CORE_SRC = '/live2d/live2dcubismcore.min.js';
const HARU_MODEL_SRC = '/live2d/Haru/Haru.model3.json';

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
 * We use the Haru sample model bundled in the AzureOpenAILive2DChatbot demo
 * and drive the mouth with our existing Azure viseme timeline.
 */
export function TalkingAvatarOverlay({
  speaking,
  speechText,
  playbackRate = 1,
  currentVisemeId,
  className,
}: TalkingAvatarOverlayProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const speechStateRef = useRef({
    speaking,
    playbackRate,
    currentVisemeId,
  });
  const instanceRef = useRef<{
    app: import('pixi.js').Application;
    model: Live2DModelInstance;
    resizeObserver: ResizeObserver | null;
    detachPoseHook: (() => void) | null;
  } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    speechStateRef.current = { speaking, playbackRate, currentVisemeId };
  }, [speaking, playbackRate, currentVisemeId]);

  useEffect(() => {
    if (status !== 'ready') return;
    const model = instanceRef.current?.model;
    if (!model) return;

    try {
      void model.motion('Idle', speaking ? 1 : 0);
    } catch {
      // Motion playback is best-effort; the live mouth driver still works without it.
    }
  }, [speaking, status]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const mount = mountRef.current;
      if (!mount) return;

      setStatus('loading');

      await ensureCubismCore();

      const PIXI = await import('pixi.js');
      window.PIXI = PIXI;

      const { Live2DModel } = (await import('pixi-live2d-display/cubism4')) as Live2DModule;

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

      const model = (await Live2DModel.from(HARU_MODEL_SRC, {
        autoFocus: false,
        autoHitTest: false,
        idleMotionGroup: 'Idle',
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
        void model.motion('Idle');
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
      if (mountRef.current) {
        mountRef.current.replaceChildren();
      }
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      title={speechText || undefined}
      className={cn('pointer-events-none absolute right-3 top-3 z-[108] w-52 sm:w-60', className)}
    >
      <div className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/55 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur-md dark:border-white/10 dark:bg-slate-950/35 dark:shadow-[0_18px_44px_rgba(0,0,0,0.4)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(236,72,153,0.15),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.14),transparent_50%),linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_72%)]" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/75 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
          <span
            className={cn(
              'size-1.5 rounded-full transition-colors',
              speaking && status === 'ready'
                ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]'
                : status === 'error'
                  ? 'bg-rose-400'
                  : 'bg-slate-300 dark:bg-slate-500',
            )}
          />
          Live2D
        </div>

        <div
          ref={mountRef}
          className={cn(
            'relative h-64 w-full overflow-hidden [mask-image:linear-gradient(180deg,black_80%,transparent_100%)] sm:h-72',
            status === 'loading' &&
              'bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.78),rgba(255,255,255,0.18)_38%,rgba(255,255,255,0)_70%)] dark:bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.1),rgba(255,255,255,0.02)_35%,rgba(255,255,255,0)_68%)]',
          )}
        />

        {status === 'error' && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-rose-200/80 bg-white/90 px-3 py-2 text-[11px] font-medium text-rose-600 dark:border-rose-400/30 dark:bg-slate-950/80 dark:text-rose-200">
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
  const scale = Math.min((width * 1.04) / baseSize.width, (height * 1.12) / baseSize.height) * 1.3;
  model.scale.set(scale);
  model.position.set(width * 0.52, -height * 0.02);
}

function attachSpeechPose(
  model: Live2DModelInstance,
  speechStateRef: React.MutableRefObject<{
    speaking: boolean;
    playbackRate: number;
    currentVisemeId?: number | null;
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

  const beforeModelUpdate = () => {
    const { speaking, playbackRate, currentVisemeId } = speechStateRef.current;
    const easedRate = Math.max(0.7, Math.min(1.8, playbackRate || 1));
    const now = performance.now();
    const phase = now / (220 / easedRate);
    const rhythmicOpen = (Math.sin(phase) + 1) / 2;
    const baseTarget = resolveMouthPose(currentVisemeId, speaking);
    const visemeBoost = currentVisemeId == null ? 0.32 : 0.14;
    const target = speaking
      ? {
          open: clamp(baseTarget.open + rhythmicOpen * visemeBoost, 0, 1),
          form: clamp(baseTarget.form + Math.sin(phase * 0.62) * 0.14, -1, 1),
        }
      : baseTarget;

    mouthState.open += (target.open - mouthState.open) * (speaking ? 0.56 : 0.16);
    mouthState.form += (target.form - mouthState.form) * (speaking ? 0.36 : 0.18);

    const lipSyncIds = internalModel.motionManager?.lipSyncIds ?? ['ParamMouthOpenY'];
    for (const id of lipSyncIds) {
      internalModel.coreModel?.addParameterValueById?.(id, mouthState.open, 1);
    }

    internalModel.coreModel?.addParameterValueById?.('ParamMouthForm', mouthState.form, 0.55);

    if (speaking) {
      internalModel.coreModel?.addParameterValueById?.('ParamAngleX', Math.sin(phase) * 7.5, 0.22);
      internalModel.coreModel?.addParameterValueById?.(
        'ParamAngleY',
        Math.cos(phase * 0.72) * 3,
        0.2,
      );
      internalModel.coreModel?.addParameterValueById?.(
        'ParamBodyAngleX',
        Math.sin(phase * 0.48) * 4.4,
        0.14,
      );
      internalModel.coreModel?.addParameterValueById?.(
        'ParamAngleZ',
        Math.sin(phase * 0.9) * 2.1,
        0.14,
      );
    }
  };

  internalModel.on('beforeModelUpdate', beforeModelUpdate);

  return () => {
    internalModel.off?.('beforeModelUpdate', beforeModelUpdate);
  };
}

function resolveMouthPose(visemeId: number | null | undefined, speaking: boolean): MouthPose {
  if (!speaking) {
    return { open: 0, form: 0 };
  }

  if (visemeId == null) {
    return { open: 0.22, form: 0.12 };
  }

  if (visemeId === 0 || visemeId === 21) {
    return { open: 0.06, form: -0.06 };
  }

  if (visemeId >= 1 && visemeId <= 7) {
    return { open: 0.24, form: 0.04 };
  }

  if (visemeId >= 8 && visemeId <= 13) {
    return { open: 0.4, form: 0.2 };
  }

  if (visemeId >= 14 && visemeId <= 17) {
    return { open: 0.58, form: -0.28 };
  }

  return { open: 0.72, form: 0.38 };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
