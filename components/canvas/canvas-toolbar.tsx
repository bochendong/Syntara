'use client';

import { LayoutList, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanvasPlaybackPill } from '@/components/canvas/canvas-playback-pill';

export interface CanvasToolbarProps {
  readonly currentSceneIndex: number;
  readonly scenesCount: number;
  readonly engineState: 'idle' | 'playing' | 'paused';
  readonly isLiveSession?: boolean;
  readonly whiteboardOpen: boolean;
  readonly sidebarCollapsed?: boolean;
  readonly chatCollapsed?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly onToggleChat?: () => void;
  readonly onPrevSlide: () => void;
  readonly onNextSlide: () => void;
  readonly onPlayPause: () => void;
  readonly onWhiteboardClose: () => void;
  readonly showStopDiscussion?: boolean;
  readonly onStopDiscussion?: () => void;
  readonly className?: string;
  /** 为 true 时中间播放条由顶栏 Header 承载（圆桌/播放模式） */
  readonly hidePlaybackPill?: boolean;
  // 保留可选字段以兼容旧调用处；中间控件已改由 CanvasPlaybackPill + settings store 提供
  readonly ttsEnabled?: boolean;
  readonly ttsMuted?: boolean;
  readonly ttsVolume?: number;
  readonly onToggleMute?: () => void;
  readonly onVolumeChange?: (volume: number) => void;
  readonly autoPlayLecture?: boolean;
  readonly onToggleAutoPlay?: () => void;
  readonly playbackSpeed?: number;
  readonly onCycleSpeed?: () => void;
}

const ctrlBtn = cn(
  'relative w-7 h-7 rounded-md flex items-center justify-center',
  'transition-all duration-150 outline-none cursor-pointer',
  'hover:bg-gray-500/[0.08] dark:hover:bg-gray-400/[0.08] active:scale-90',
);

export function CanvasToolbar({
  currentSceneIndex,
  scenesCount,
  engineState,
  isLiveSession,
  whiteboardOpen,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  showStopDiscussion,
  onStopDiscussion,
  className,
  hidePlaybackPill,
}: CanvasToolbarProps) {
  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex items-center gap-1 shrink-0 pl-1">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={cn(
              ctrlBtn,
              'w-6 h-6',
              sidebarCollapsed
                ? 'text-gray-400 dark:text-gray-500'
                : 'text-gray-600 dark:text-gray-300',
            )}
            aria-label="Toggle sidebar"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums select-none font-medium">
          {currentSceneIndex + 1}
          <span className="opacity-35 mx-px">/</span>
          {scenesCount}
        </span>
      </div>

      {!hidePlaybackPill && (
        <div className="flex-1 flex items-center justify-center min-w-0">
          <CanvasPlaybackPill
            currentSceneIndex={currentSceneIndex}
            scenesCount={scenesCount}
            engineState={engineState}
            isLiveSession={isLiveSession}
            whiteboardOpen={whiteboardOpen}
            onPrevSlide={onPrevSlide}
            onNextSlide={onNextSlide}
            onPlayPause={onPlayPause}
            onWhiteboardClose={onWhiteboardClose}
            showStopDiscussion={showStopDiscussion}
            onStopDiscussion={onStopDiscussion}
          />
        </div>
      )}

      {hidePlaybackPill && <div className="flex-1 min-w-0" aria-hidden />}

      <div className="flex items-center justify-end gap-px shrink-0 pr-1">
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            className={cn(
              ctrlBtn,
              'w-6 h-6',
              chatCollapsed
                ? 'text-gray-400 dark:text-gray-500'
                : 'text-gray-600 dark:text-gray-300',
            )}
            aria-label="Toggle chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
