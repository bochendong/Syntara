'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import type { TalkingAvatarOverlayState } from '@/components/canvas/talking-avatar-overlay';
import type { CanvasToolbarProps } from '@/components/canvas/canvas-toolbar';
import type { Scene, StageMode } from '@/lib/types/stage';
import type { SceneSidebarAskBubble } from '@/lib/utils/scene-sidebar-ask-thread';
import { useI18n } from '@/lib/hooks/use-i18n';

const Whiteboard = dynamic(() => import('@/components/whiteboard').then((mod) => mod.Whiteboard), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-purple-200/60 bg-white/95 text-xs font-semibold text-purple-600 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.25)] backdrop-blur-2xl dark:border-purple-700/60 dark:bg-gray-800/95 dark:text-purple-300">
      正在打开白板…
    </div>
  ),
});

interface CanvasAreaProps extends CanvasToolbarProps {
  readonly currentScene: Scene | null;
  readonly mode: StageMode;
  readonly hideToolbar?: boolean;
  readonly isPendingScene?: boolean;
  readonly isPendingGenerationActive?: boolean;
  readonly isGenerationFailed?: boolean;
  readonly pendingGenerationFailureReason?: string;
  readonly onRetryGeneration?: () => void;
  readonly showMarkerDebugOverlay?: boolean;
  readonly onSidebarCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
  readonly onSidebarAskActivate?: () => Promise<void> | void;
  readonly onSidebarAskSubmit?: (
    message: string,
    options?: { inputMode?: 'text' | 'voice' },
  ) => Promise<void> | void;
  readonly sceneSidebarAskThread?: SceneSidebarAskBubble[];
  readonly sceneSidebarAskLiveSpeech?: string | null;
  readonly sceneSidebarAskThinking?: boolean;
  readonly sceneSidebarAskStreaming?: boolean;
  readonly sceneSidebarAskSpeakerName?: string | null;
  readonly sceneSidebarAskSpeakerAvatar?: string | null;
  readonly sceneSidebarAskSpeakerColor?: string | null;
  readonly sceneSidebarAskPaused?: boolean;
  readonly onSidebarAskPause?: () => void;
  readonly onSidebarAskResume?: () => void;
  /** 播放模式下在左侧栏显示「虚拟讲师」标签与形象时传入 */
  readonly sceneSidebarLive2d?: TalkingAvatarOverlayState;
  readonly playPauseDisabled?: boolean;
  readonly playPauseBusy?: boolean;
}

export function CanvasArea({
  currentScene,
  currentSceneIndex,
  scenesCount,
  mode,
  engineState,
  isLiveSession,
  whiteboardOpen,
  sidebarCollapsed,
  onSidebarCollapseChange,
  onSceneSelect,
  onRetryOutline,
  onSidebarAskActivate,
  onSidebarAskSubmit,
  sceneSidebarAskThread = [],
  sceneSidebarAskLiveSpeech = null,
  sceneSidebarAskThinking = false,
  sceneSidebarAskStreaming = false,
  sceneSidebarAskSpeakerName = null,
  sceneSidebarAskSpeakerAvatar = null,
  sceneSidebarAskSpeakerColor = null,
  sceneSidebarAskPaused = false,
  onSidebarAskPause,
  onSidebarAskResume,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  showStopDiscussion,
  onStopDiscussion,
  hideToolbar,
  isPendingScene,
  isPendingGenerationActive = false,
  isGenerationFailed,
  pendingGenerationFailureReason,
  onRetryGeneration,
  showMarkerDebugOverlay = false,
  sceneSidebarLive2d,
  playPauseDisabled = false,
  playPauseBusy = false,
}: CanvasAreaProps) {
  const { t, locale } = useI18n();
  const pendingIdleMessage =
    locale === 'zh-CN'
      ? '这一页还没有生成。点击上方的“继续生成页面”继续。'
      : 'This page has not been generated yet. Use “Continue generating slides” above.';
  const isSemanticScrollSlide =
    currentScene?.type === 'slide' &&
    currentScene.content.type === 'slide' &&
    Boolean(currentScene.content.semanticDocument) &&
    currentScene.content.semanticRenderMode !== 'manual' &&
    currentScene.content.webRenderMode !== 'slide';
  const showControls = mode === 'playback' && !whiteboardOpen;
  const showPlayHint =
    showControls &&
    engineState !== 'playing' &&
    currentScene?.type === 'slide' &&
    !isSemanticScrollSlide &&
    !isLiveSession &&
    !isPendingScene;

  const handleSlideClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        !showControls ||
        isLiveSession ||
        currentScene?.type !== 'slide' ||
        isSemanticScrollSlide ||
        playPauseDisabled
      ) {
        return;
      }
      // Don't trigger page play/pause when clicking inside a video element's visual area.
      // Video elements may be visually covered by other slide elements (e.g. text),
      // so we check click coordinates against all video element bounding rects.
      const container = e.currentTarget as HTMLElement;
      const videoEls = container.querySelectorAll('[data-video-element]');
      for (const el of videoEls) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          return;
        }
      }
      onPlayPause();
    },
    [
      showControls,
      isLiveSession,
      onPlayPause,
      currentScene?.type,
      isSemanticScrollSlide,
      playPauseDisabled,
    ],
  );

  return (
    <div className="group/canvas flex h-full w-full min-h-0 flex-col bg-transparent">
      {/* Slide area — takes remaining space（与聊天区一致的轻渐变 + 毛玻璃语境） */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-row items-stretch justify-start gap-3 overflow-hidden p-3 transition-colors duration-500 md:p-4',
          'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.28),transparent_40%),linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(238,242,247,0.85)_100%)]',
          'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.22),transparent_45%),linear-gradient(180deg,rgba(11,15,22,0.92)_0%,rgba(17,24,39,0.88)_100%)]',
          currentScene?.type === 'interactive' &&
            'bg-[radial-gradient(circle_at_15%_0%,rgba(147,197,253,0.35),transparent_42%),linear-gradient(180deg,rgba(239,246,255,0.95)_0%,rgba(224,231,255,0.85)_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.2),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.95)_0%,rgba(23,37,84,0.5)_100%)]',
        )}
      >
        <SceneSidebar
          collapsed={sidebarCollapsed ?? false}
          onCollapseChange={onSidebarCollapseChange}
          onSceneSelect={onSceneSelect}
          onRetryOutline={onRetryOutline}
          onAskActivate={onSidebarAskActivate}
          onAskSubmit={onSidebarAskSubmit}
          askThread={sceneSidebarAskThread}
          askLiveSpeech={sceneSidebarAskLiveSpeech}
          askThinking={sceneSidebarAskThinking}
          askStreaming={sceneSidebarAskStreaming}
          askSpeakerName={sceneSidebarAskSpeakerName}
          askSpeakerAvatar={sceneSidebarAskSpeakerAvatar}
          askSpeakerColor={sceneSidebarAskSpeakerColor}
          askPaused={sceneSidebarAskPaused}
          onAskPause={onSidebarAskPause}
          onAskResume={onSidebarAskResume}
          live2dPresenter={sceneSidebarLive2d}
          playbackEngineState={engineState}
        />
        <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-center overflow-hidden">
          <div
            className={cn(
              'relative overflow-hidden rounded-[20px] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-700 dark:bg-[#1c1c1e] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]',
              isSemanticScrollSlide ? 'h-full w-full max-w-[1160px]' : 'aspect-[16/9] h-full',
              showControls &&
                !isLiveSession &&
                currentScene?.type === 'slide' &&
                !isSemanticScrollSlide &&
                'cursor-pointer',
              currentScene?.type === 'interactive'
                ? 'ring-1 ring-blue-500/[0.12] dark:ring-blue-400/20'
                : 'ring-1 ring-slate-900/[0.08] dark:ring-white/[0.1]',
            )}
            onClick={handleSlideClick}
          >
            {/* Whiteboard Layer */}
            <div className="absolute inset-0 z-[110] pointer-events-none">
              <SceneProvider>
                {whiteboardOpen ? (
                  <Whiteboard isOpen={whiteboardOpen} onClose={onWhiteboardClose} />
                ) : null}
              </SceneProvider>
            </div>

            {/* Scene Content */}
            {currentScene && !whiteboardOpen && (
              <div className="absolute inset-0">
                <SceneProvider>
                  <SceneRenderer
                    scene={currentScene}
                    mode={mode}
                    showMarkerDebugOverlay={showMarkerDebugOverlay}
                  />
                </SceneProvider>
              </div>
            )}

            {/* Pending Scene Loading Overlay */}
            <AnimatePresence>
              {isPendingScene && !currentScene && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="absolute inset-0 z-[105] flex flex-col items-center justify-center bg-white dark:bg-gray-800"
                >
                  {isGenerationFailed ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-red-400 dark:text-red-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                          />
                        </svg>
                      </div>
                      <span className="text-sm text-red-500 dark:text-red-400 font-medium">
                        {t('stage.generationFailed')}
                      </span>
                      {pendingGenerationFailureReason && (
                        <span className="max-w-[360px] text-center text-xs leading-5 text-red-400 dark:text-red-300">
                          {pendingGenerationFailureReason}
                        </span>
                      )}
                      {onRetryGeneration && (
                        <button
                          onClick={onRetryGeneration}
                          className="mt-1 px-4 py-1.5 text-xs font-medium rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors active:scale-95"
                        >
                          {t('generation.retryScene')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      {isPendingGenerationActive && (
                        <div className="relative w-12 h-12">
                          <div className="absolute inset-0 rounded-full border-2 border-gray-100 dark:border-gray-700" />
                          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#007AFF] dark:border-t-[#0A84FF]" />
                        </div>
                      )}
                      {/* Text */}
                      <motion.span
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="text-sm text-gray-400 dark:text-gray-500 font-medium"
                      >
                        {isPendingGenerationActive
                          ? t('stage.generatingNextPage')
                          : pendingIdleMessage}
                      </motion.span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Play hint — breathing button when idle or paused (slides only) */}
            <AnimatePresence>
              {showPlayHint && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 z-[102] pointer-events-none"
                >
                  <motion.div
                    className={cn(
                      'absolute bottom-5 right-5 opacity-0 group-hover/canvas:opacity-90 transition-opacity duration-300 pointer-events-auto',
                      playPauseDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                    )}
                    exit={{ pointerEvents: 'none' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (playPauseDisabled) return;
                      onPlayPause();
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0.85 }}
                      animate={{ scale: [1, 1.06] }}
                      exit={{ scale: 1.15, opacity: 0 }}
                      transition={{
                        default: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        scale: {
                          repeat: Infinity,
                          repeatType: 'mirror',
                          duration: 1,
                          ease: 'easeInOut',
                        },
                      }}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 shadow-[0_6px_24px_rgba(15,23,42,0.16),inset_0_0_0_1px_rgba(255,255,255,0.8)] backdrop-blur dark:bg-[#2c2c2e]/92 dark:shadow-[0_6px_28px_rgba(10,132,255,0.22),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                      style={{ willChange: 'transform' }}
                    >
                      {playPauseBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5 fill-[#007AFF]/90 text-[#007AFF] dark:fill-[#0A84FF]/90 dark:text-[#0A84FF]" />
                      )}
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Canvas Toolbar — in document flow, only when not merged into roundtable ── */}
      {!hideToolbar && (
        <CanvasToolbar
          className={cn(
            'h-10 min-h-10 shrink-0 border-t border-slate-900/[0.08] bg-white/65 px-2 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0d0d10]/5',
          )}
          currentSceneIndex={currentSceneIndex}
          scenesCount={scenesCount}
          engineState={engineState}
          isLiveSession={isLiveSession}
          whiteboardOpen={whiteboardOpen}
          sidebarCollapsed={sidebarCollapsed}
          chatCollapsed={chatCollapsed}
          onToggleSidebar={onToggleSidebar}
          onToggleChat={onToggleChat}
          onPrevSlide={onPrevSlide}
          onNextSlide={onNextSlide}
          onPlayPause={onPlayPause}
          onWhiteboardClose={onWhiteboardClose}
          showStopDiscussion={showStopDiscussion}
          onStopDiscussion={onStopDiscussion}
        />
      )}
    </div>
  );
}
