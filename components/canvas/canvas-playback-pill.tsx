'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, PencilLine, Volume1, Volume2, VolumeX, Repeat, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSettingsStore, PLAYBACK_SPEEDS } from '@/lib/store/settings';

const ctrlBtn = cn(
  'relative w-7 h-7 rounded-xl flex items-center justify-center',
  'transition-all duration-150 outline-none cursor-pointer',
  'hover:bg-sky-500/[0.12] dark:hover:bg-sky-400/[0.14] active:scale-90',
);

function CtrlDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-sky-200/75 dark:bg-sky-400/20" />;
}

function VolumeIcon({
  muted,
  volume,
  disabled,
}: {
  muted: boolean;
  volume: number;
  disabled: boolean;
}) {
  const cls = 'w-3.5 h-3.5';
  if (disabled || muted || volume === 0) return <VolumeX className={cls} />;
  if (volume < 0.5) return <Volume1 className={cls} />;
  return <Volume2 className={cls} />;
}

export interface CanvasPlaybackPillProps {
  readonly currentSceneIndex: number;
  readonly scenesCount: number;
  readonly engineState: 'idle' | 'playing' | 'paused';
  readonly isLiveSession?: boolean;
  readonly whiteboardOpen: boolean;
  readonly onPrevSlide: () => void;
  readonly onNextSlide: () => void;
  readonly onPlayPause: () => void;
  readonly onWhiteboardClose: () => void;
  readonly showStopDiscussion?: boolean;
  readonly onStopDiscussion?: () => void;
  readonly playPauseDisabled?: boolean;
  readonly playPauseBusy?: boolean;
  readonly className?: string;
}

export function CanvasPlaybackPill({
  currentSceneIndex,
  scenesCount,
  engineState,
  isLiveSession,
  whiteboardOpen,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  showStopDiscussion,
  onStopDiscussion,
  playPauseDisabled = false,
  playPauseBusy = false,
  className,
}: CanvasPlaybackPillProps) {
  const { t } = useI18n();
  const canGoPrev = currentSceneIndex > 0;
  const canGoNext = currentSceneIndex < scenesCount - 1;
  const showPlayPause = !isLiveSession;

  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const setTTSVolume = useSettingsStore((s) => s.setTTSVolume);
  const autoPlayLecture = useSettingsStore((s) => s.autoPlayLecture);
  const setAutoPlayLecture = useSettingsStore((s) => s.setAutoPlayLecture);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useSettingsStore((s) => s.setPlaybackSpeed);

  const handleCycleSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed as (typeof PLAYBACK_SPEEDS)[number]);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  }, [playbackSpeed, setPlaybackSpeed]);

  const whiteboardElementCount = useStageStore(
    (s) => s.stage?.whiteboard?.[0]?.elements?.length || 0,
  );

  const [volumeHover, setVolumeHover] = useState(false);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  const handleVolumeEnter = useCallback(() => {
    clearTimeout(volumeTimerRef.current);
    setVolumeHover(true);
  }, []);

  const handleVolumeLeave = useCallback(() => {
    volumeTimerRef.current = setTimeout(() => setVolumeHover(false), 300);
  }, []);

  useEffect(() => () => clearTimeout(volumeTimerRef.current), []);

  const effectiveVolume = ttsMuted ? 0 : ttsVolume;

  return (
    <div
      className={cn(
        'inline-flex h-14 items-center gap-2 rounded-[24px] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(255,255,255,0.92)_48%,rgba(236,253,245,0.86))] px-4 shadow-[0_14px_36px_rgba(37,99,235,0.16)] backdrop-blur-2xl backdrop-saturate-150 dark:border-sky-400/20 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(12,38,66,0.78)_55%,rgba(6,78,59,0.62))] dark:shadow-[0_16px_40px_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      <div
        ref={volumeContainerRef}
        className="relative flex items-center"
        onMouseEnter={handleVolumeEnter}
        onMouseLeave={handleVolumeLeave}
      >
        <button
          onClick={() => ttsEnabled && setTTSMuted(!ttsMuted)}
          disabled={!ttsEnabled}
          className={cn(
            ctrlBtn,
            'w-7 h-7',
            !ttsEnabled
              ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
              : ttsMuted
                ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/80 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20'
                : 'bg-sky-50/80 text-sky-700 ring-1 ring-sky-100/80 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/15',
          )}
          aria-label={ttsMuted ? 'Unmute' : 'Mute'}
        >
          <VolumeIcon muted={!!ttsMuted} volume={ttsVolume} disabled={!ttsEnabled} />
        </button>

        <div
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col items-center',
            'transition-all duration-200 ease-out pointer-events-none opacity-0',
            volumeHover && ttsEnabled && 'pointer-events-auto opacity-100',
          )}
        >
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-2 py-2.5 flex flex-col items-center gap-1.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums font-medium select-none">
              {Math.round(effectiveVolume * 100)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={effectiveVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTTSVolume(v);
                if (v > 0 && ttsMuted) setTTSMuted(false);
              }}
              className={cn(
                'appearance-none cursor-pointer',
                'h-16 w-1 rounded-full',
                'bg-gray-200 dark:bg-gray-600',
                '[writing-mode:vertical-lr] [direction:rtl]',
                '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
                '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#007AFF] [&::-webkit-slider-thumb]:dark:bg-[#0A84FF]',
                '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3',
                '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#007AFF]',
              )}
            />
          </div>
          <div className="w-2 h-2 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 rotate-45 -mt-[5px]" />
        </div>
      </div>

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCycleSpeed}
              className={cn(
                'w-8 h-5 rounded flex items-center justify-center',
                'transition-all duration-150 outline-none cursor-pointer',
                'text-[11px] font-semibold tabular-nums leading-none',
                'active:scale-90',
                playbackSpeed !== 1
                  ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-400/20 dark:text-sky-200 dark:ring-sky-400/20'
                  : 'bg-white/65 text-sky-700 hover:bg-sky-50 dark:bg-white/[0.06] dark:text-sky-300 dark:hover:bg-sky-400/10',
              )}
              aria-label="Playback speed"
            >
              {playbackSpeed === 1.5 ? '1.5x' : `${playbackSpeed}x`}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('roundtable.speed')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CtrlDivider />

      {scenesCount > 1 && (
        <button
          onClick={onPrevSlide}
          disabled={!canGoPrev}
          className={cn(
            ctrlBtn,
            'h-9 min-h-9 w-auto px-2.5 text-[11px] font-semibold whitespace-nowrap',
            'bg-white/70 text-sky-700 shadow-sm ring-1 ring-sky-100/80 hover:bg-sky-50 dark:bg-white/[0.06] dark:text-sky-200 dark:ring-sky-400/15 dark:hover:bg-sky-400/10',
            'disabled:pointer-events-none disabled:bg-transparent disabled:text-slate-300 disabled:opacity-55 disabled:shadow-none disabled:ring-transparent dark:disabled:text-slate-600',
          )}
          aria-label={t('roundtable.prevPage')}
        >
          {t('roundtable.prevPage')}
        </button>
      )}

      {showStopDiscussion && onStopDiscussion ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStopDiscussion();
          }}
          className={cn(
            'flex items-center gap-1.5 h-6 px-2.5 rounded-md',
            'bg-red-500/10 dark:bg-red-400/10 text-red-600 dark:text-red-400',
            'text-[11px] font-semibold whitespace-nowrap',
            'hover:bg-red-500/20 dark:hover:bg-red-400/20 active:scale-95 transition-all cursor-pointer',
          )}
          title={t('roundtable.stopDiscussion')}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          {t('roundtable.stopDiscussion')}
        </button>
      ) : showPlayPause ? (
        <button
          onClick={onPlayPause}
          disabled={playPauseDisabled}
          className={cn(
            ctrlBtn,
            'w-10 h-10 rounded-full',
            playPauseDisabled &&
              'cursor-not-allowed opacity-65 hover:bg-slate-100 active:scale-100 dark:hover:bg-white/[0.06]',
            playPauseBusy
              ? 'bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.34)] hover:bg-sky-500'
              : engineState === 'playing'
                ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200/80 hover:bg-amber-200/80 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-300/20'
                : 'bg-[#007AFF] text-white shadow-[0_10px_22px_rgba(0,122,255,0.32)] hover:bg-[#0A84FF]',
          )}
          aria-label={engineState === 'playing' ? 'Pause' : 'Play'}
        >
          {playPauseBusy ? (
            <Loader2 className="size-[18px] shrink-0 animate-spin" strokeWidth={2.25} />
          ) : engineState === 'playing' ? (
            <Pause className="size-[18px] shrink-0" strokeWidth={2.25} />
          ) : (
            <Play className="size-[18px] shrink-0 ml-px" strokeWidth={2.25} />
          )}
        </button>
      ) : null}

      {scenesCount > 1 && (
        <button
          onClick={onNextSlide}
          disabled={!canGoNext}
          className={cn(
            ctrlBtn,
            'h-9 min-h-9 w-auto px-2.5 text-[11px] font-semibold whitespace-nowrap',
            'bg-white/70 text-sky-700 shadow-sm ring-1 ring-sky-100/80 hover:bg-sky-50 dark:bg-white/[0.06] dark:text-sky-200 dark:ring-sky-400/15 dark:hover:bg-sky-400/10',
            'disabled:pointer-events-none disabled:bg-transparent disabled:text-slate-300 disabled:opacity-55 disabled:shadow-none disabled:ring-transparent dark:disabled:text-slate-600',
          )}
          aria-label={t('roundtable.nextPage')}
        >
          {t('roundtable.nextPage')}
        </button>
      )}

      <CtrlDivider />

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAutoPlayLecture(!autoPlayLecture)}
              className={cn(
                ctrlBtn,
                'w-8 h-7',
                autoPlayLecture
                  ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200/80 dark:bg-violet-400/15 dark:text-violet-200 dark:ring-violet-300/20'
                  : 'bg-indigo-50/75 text-indigo-600 ring-1 ring-indigo-100/80 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/15',
              )}
              aria-label="Auto-play"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {autoPlayLecture ? t('roundtable.autoPlayOff') : t('roundtable.autoPlay')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onWhiteboardClose();
        }}
        className={cn(
          ctrlBtn,
          'w-7 h-7',
          whiteboardOpen
            ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/20'
            : 'bg-teal-50/75 text-teal-700 ring-1 ring-teal-100/80 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/15',
        )}
        title={whiteboardOpen ? t('whiteboard.minimize') : t('whiteboard.open')}
      >
        <PencilLine className="w-3.5 h-3.5" />
        {!whiteboardOpen && whiteboardElementCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-violet-500 dark:bg-violet-400 rounded-full" />
        )}
      </button>
    </div>
  );
}
