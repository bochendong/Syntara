'use client';

import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
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
import { hasFullPageBitmapElement } from '@/lib/utils/slide-background-policy';

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
  readonly showMaskDebugOverlay?: boolean;
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
  showMaskDebugOverlay = false,
  sceneSidebarLive2d,
  playPauseDisabled = false,
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
  const hasFullPageBitmapSlide = useMemo(() => {
    if (currentScene?.type !== 'slide' || currentScene.content.type !== 'slide') {
      return false;
    }

    const canvas = currentScene.content.canvas;
    return hasFullPageBitmapElement(canvas.elements, canvas.viewportSize, canvas.viewportRatio);
  }, [currentScene]);
  const showControls = mode === 'playback' && !whiteboardOpen;
  const useCompactSceneRail =
    mode === 'playback' && currentScene?.type === 'slide' && !isSemanticScrollSlide;
  const useImageFirstPlayback =
    useCompactSceneRail && hasFullPageBitmapSlide && !isSemanticScrollSlide;
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
      {/* Slide area — image-first playback keeps controls as floating chrome. */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-row items-stretch justify-start overflow-hidden transition-colors duration-500',
          useImageFirstPlayback
            ? 'gap-0 bg-white p-0 dark:bg-slate-950'
            : [
                'gap-3 p-3 md:p-4',
                'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.28),transparent_40%),linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(238,242,247,0.85)_100%)]',
                'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.22),transparent_45%),linear-gradient(180deg,rgba(11,15,22,0.92)_0%,rgba(17,24,39,0.88)_100%)]',
              ],
          currentScene?.type === 'interactive' &&
            'bg-[radial-gradient(circle_at_15%_0%,rgba(147,197,253,0.35),transparent_42%),linear-gradient(180deg,rgba(239,246,255,0.95)_0%,rgba(224,231,255,0.85)_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.2),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.95)_0%,rgba(23,37,84,0.5)_100%)]',
        )}
      >
        {useCompactSceneRail ? (
          <div className="flex w-[84px] shrink-0 justify-center border-r border-slate-900/[0.08] bg-white/86 px-3 py-6 dark:border-white/[0.08] dark:bg-[#0f1115]/86">
            <SceneSidebar
              collapsed={sidebarCollapsed ?? false}
              onCollapseChange={onSidebarCollapseChange}
              variant="rail"
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
          </div>
        ) : (
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
        )}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 items-stretch justify-center overflow-hidden',
            useImageFirstPlayback
              ? 'px-4 pb-5 pt-5'
              : hasFullPageBitmapSlide && !isSemanticScrollSlide && '-my-3 -mr-3 md:-my-4 md:-mr-4',
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden transition-all duration-700',
              hasFullPageBitmapSlide
                ? 'rounded-none bg-transparent shadow-none dark:bg-transparent dark:shadow-none'
                : 'rounded-[20px] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:bg-[#1c1c1e] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]',
              isSemanticScrollSlide
                ? 'h-full w-full max-w-[1160px]'
                : useImageFirstPlayback
                  ? 'aspect-[16/9] h-full max-h-full max-w-full'
                  : 'aspect-[16/9] h-full',
              showControls &&
                !isLiveSession &&
                currentScene?.type === 'slide' &&
                !isSemanticScrollSlide &&
                'cursor-pointer',
              !hasFullPageBitmapSlide &&
                (currentScene?.type === 'interactive'
                  ? 'ring-1 ring-blue-500/[0.12] dark:ring-blue-400/20'
                  : 'ring-1 ring-slate-900/[0.08] dark:ring-white/[0.1]'),
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
                    showMaskDebugOverlay={showMaskDebugOverlay}
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
                  className={cn(
                    'absolute inset-0 z-[105] flex flex-col items-center justify-center overflow-hidden bg-white dark:bg-slate-950',
                    'before:absolute before:inset-0 before:bg-[linear-gradient(rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.10)_1px,transparent_1px)] before:bg-[size:24px_24px] before:opacity-70',
                    'after:absolute after:inset-x-0 after:top-0 after:h-14 after:bg-[linear-gradient(90deg,rgba(56,189,248,0.10),rgba(34,197,94,0.12),rgba(56,189,248,0.10))]',
                  )}
                >
                  {isGenerationFailed ? (
                    <div className="relative z-10 flex max-w-[360px] flex-col items-center gap-3 rounded-3xl border border-red-200/70 bg-white/88 px-8 py-7 text-center shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur dark:border-red-500/20 dark:bg-slate-950/78">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 ring-8 ring-red-50/50 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-500/10">
                        <svg
                          className="h-6 w-6"
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
                      <span className="text-sm font-semibold text-red-600 dark:text-red-300">
                        {t('stage.generationFailed')}
                      </span>
                      {pendingGenerationFailureReason && (
                        <span className="text-xs leading-5 text-red-500/80 dark:text-red-200/80">
                          {pendingGenerationFailureReason}
                        </span>
                      )}
                      {onRetryGeneration && (
                        <button
                          onClick={onRetryGeneration}
                          className="mt-1 rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          {t('generation.retryScene')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative z-10 flex w-full max-w-[440px] flex-col items-center gap-5 px-8 text-center">
                      <div className="w-full space-y-4 rounded-[28px] border border-sky-100/90 bg-white/82 px-7 py-7 shadow-[0_24px_80px_rgba(14,165,233,0.12)] backdrop-blur dark:border-sky-400/15 dark:bg-slate-950/70">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-8 ring-sky-50/60 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/10">
                          {isPendingGenerationActive ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600 dark:border-sky-500/20 dark:border-t-sky-200" />
                          ) : (
                            <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="mx-auto h-3 w-36 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                            <motion.div
                              className="h-full w-16 rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-sky-300"
                              animate={{ x: [-70, 150] }}
                              transition={{
                                duration: 1.25,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              }}
                            />
                          </div>
                          <div className="mx-auto h-2 w-52 rounded-full bg-slate-100 dark:bg-white/10" />
                          <div className="mx-auto h-2 w-40 rounded-full bg-slate-100 dark:bg-white/10" />
                        </div>
                      </div>
                      {isPendingGenerationActive && (
                        <span className="rounded-full border border-sky-200/70 bg-white/86 px-3 py-1 text-[11px] font-semibold text-sky-700 shadow-sm dark:border-sky-500/25 dark:bg-slate-950/70 dark:text-sky-200">
                          第 {currentSceneIndex + 1} 页 / {scenesCount}
                        </span>
                      )}
                      <motion.span
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="max-w-[360px] text-sm font-medium leading-6 text-slate-500 dark:text-slate-300"
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
          hidePlaybackPill={mode !== 'playback'}
        />
      )}
    </div>
  );
}
