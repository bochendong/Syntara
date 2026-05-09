'use client';

import { cn } from '@/lib/utils';
import styles from './prototype-vtuber-stage.module.css';

export type PrototypeVtuberMood = 'idle' | 'speaking' | 'thinking' | 'encouraging' | 'surprised';

const MOOD_LABEL: Record<PrototypeVtuberMood, string> = {
  idle: '待机',
  speaking: '讲解中',
  thinking: '思考中',
  encouraging: '鼓励',
  surprised: '惊喜',
};

export function PrototypeVtuberStage({
  className,
  mood = 'idle',
  showBadge = true,
}: {
  className?: string;
  mood?: PrototypeVtuberMood;
  showBadge?: boolean;
}) {
  const bodyMoodClass =
    mood === 'speaking' ? styles.bodySpeaking : mood === 'thinking' ? styles.bodyThinking : '';
  const headMoodClass =
    mood === 'speaking'
      ? styles.headSpeaking
      : mood === 'thinking'
        ? styles.headThinking
        : mood === 'encouraging'
          ? styles.headEncouraging
          : mood === 'surprised'
            ? styles.headSurprised
            : '';
  const mouthMoodClass =
    mood === 'speaking'
      ? styles.mouthSpeaking
      : mood === 'thinking'
        ? styles.mouthThinking
        : mood === 'encouraging'
          ? styles.mouthEncouraging
          : mood === 'surprised'
            ? styles.mouthSurprised
            : '';
  const showMouthRig = mood !== 'idle';

  return (
    <div className={cn('relative flex h-full w-full items-end justify-center', className)}>
      <div
        className={cn(
          styles.stage,
          'relative flex aspect-[1011/1556] h-full max-h-[680px] w-auto max-w-full items-end justify-center',
        )}
      >
        <div className="absolute inset-x-[8%] bottom-[4%] h-[13%] rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.28),rgba(168,85,247,0.06)_54%,transparent_72%)] blur-xl" />
        <div className="absolute inset-x-[10%] bottom-[4%] h-[8%] rounded-full border border-white/14 bg-white/10" />

        {showBadge ? (
          <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-100/35 bg-slate-950/34 px-3 py-1.5 text-xs font-medium text-cyan-50 shadow-[0_16px_42px_rgba(15,23,42,0.24)] backdrop-blur-xl">
            <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.78)]" />
            <span>Synthia</span>
            <span className="text-cyan-100/70">{MOOD_LABEL[mood]}</span>
          </div>
        ) : null}

        <div className={cn(styles.bodyLayer, bodyMoodClass, 'absolute inset-0 z-10')}>
          <img
            src="/live2d/Synthia/synthia-body-layer.png"
            alt=""
            className="absolute inset-0 size-full select-none object-contain object-bottom drop-shadow-[0_28px_36px_rgba(15,23,42,0.28)]"
            draggable={false}
          />
        </div>

        <div className={cn(styles.headGroup, headMoodClass, 'absolute inset-0 z-20')}>
          <img
            src="/live2d/Synthia/synthia-head-layer.png"
            alt="Synthia prototype Vtuber"
            className="absolute inset-0 size-full select-none object-contain object-bottom drop-shadow-[0_18px_28px_rgba(15,23,42,0.2)]"
            draggable={false}
          />

          <span
            className={cn(
              styles.hairGlint,
              'pointer-events-none absolute left-[26%] top-[12%] h-[18%] w-[44%]',
            )}
          />

          <span
            className={cn(
              styles.blink,
              'pointer-events-none absolute left-[38.9%] top-[29.1%] h-[2.2%] w-[9.5%]',
            )}
          />
          <span
            className={cn(
              styles.blink,
              styles.blinkRight,
              'pointer-events-none absolute left-[51.4%] top-[29.1%] h-[2.2%] w-[9.5%]',
            )}
          />

          {showMouthRig ? (
            <>
              <span
                className={cn(
                  styles.mouthPatch,
                  'pointer-events-none absolute left-[46.8%] top-[35%] h-[3.1%] w-[7.6%]',
                )}
              />
              <span
                className={cn(
                  styles.mouth,
                  mouthMoodClass,
                  'pointer-events-none absolute left-[48%] top-[35.65%] h-[2.2%] w-[5.4%]',
                )}
              />
            </>
          ) : null}
        </div>

        {mood === 'encouraging' || mood === 'surprised' ? (
          <>
            <span
              className={cn(
                styles.sparkle,
                'absolute right-[16%] top-[18%] z-20 size-4 rotate-45 rounded-[3px] border border-amber-100/80 bg-amber-100/50 drop-shadow-[0_0_12px_rgba(254,240,138,0.72)]',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                styles.sparkle,
                styles.sparkleLate,
                'absolute left-[19%] top-[29%] z-20 size-3 rotate-45 rounded-[2px] border border-cyan-100/80 bg-cyan-100/50 drop-shadow-[0_0_12px_rgba(165,243,252,0.72)]',
              )}
              aria-hidden="true"
            />
          </>
        ) : null}

        {mood === 'thinking' ? (
          <div
            className="absolute right-[17%] top-[20%] z-20 flex items-end gap-1.5"
            aria-hidden="true"
          >
            <span className={cn(styles.thoughtDot, 'size-2 rounded-full bg-white/80')} />
            <span
              className={cn(
                styles.thoughtDot,
                styles.thoughtDotLate,
                'size-3 rounded-full bg-cyan-100/85',
              )}
            />
            <span
              className={cn(
                styles.thoughtDot,
                'size-4 rounded-full bg-violet-100/80 [animation-delay:0.56s]',
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
