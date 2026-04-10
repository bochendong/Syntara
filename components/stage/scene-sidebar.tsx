'use client';

import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import {
  PanelLeftOpen,
  PieChart,
  Cpu,
  MousePointer2,
  BookOpen,
  Globe,
  AlertCircle,
  RefreshCw,
  Trash2,
  SendHorizonal,
  Loader2,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  TalkingAvatarOverlay,
  type TalkingAvatarOverlayState,
  type TalkingAvatarPointerInteractionState,
} from '@/components/canvas/talking-avatar-overlay';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useStageStore, useCanvasStore } from '@/lib/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneType, SlideContent } from '@/lib/types/stage';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { SceneSidebarAskBubble } from '@/lib/utils/scene-sidebar-ask-thread';
import { buildLectureNotesFromScenes } from '@/lib/utils/build-lecture-notes-from-scenes';
import { LectureNotesView } from '@/components/chat/lecture-notes-view';

interface SceneSidebarProps {
  readonly collapsed: boolean;
  readonly onCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
  readonly onAskActivate?: () => Promise<void> | void;
  readonly onAskSubmit?: (message: string) => Promise<void> | void;
  /** 开启虚拟讲师且处于播放语境时传入，用于「虚拟讲师」标签页 */
  readonly live2dPresenter?: TalkingAvatarOverlayState;
  /** 与画布工具条一致；开始播放时自动切到虚拟讲师页，从播放切到暂停/空闲时回到导航；其余时候可手动切换 */
  readonly playbackEngineState?: 'idle' | 'playing' | 'paused';
  /** 与右侧 Chat 区当前 QA/讨论线程同步，布局对齐 AI 编辑侧栏对话区 */
  readonly askThread?: SceneSidebarAskBubble[];
  readonly askLiveSpeech?: string | null;
  readonly askThinking?: boolean;
  readonly askStreaming?: boolean;
  readonly askSpeakerName?: string | null;
  readonly askSpeakerAvatar?: string | null;
  readonly askSpeakerColor?: string | null;
  readonly askPaused?: boolean;
  readonly onAskPause?: () => void;
  readonly onAskResume?: () => void;
}

type SidebarMainTab = 'nav' | 'notes' | 'ask' | 'live2d';

const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 200;
const MAX_WIDTH = 440;

export function SceneSidebar({
  collapsed,
  onCollapseChange,
  onSceneSelect,
  onRetryOutline,
  onAskActivate,
  onAskSubmit,
  live2dPresenter,
  playbackEngineState = 'idle',
  askThread = [],
  askLiveSpeech = null,
  askThinking = false,
  askStreaming = false,
  askSpeakerName = null,
  askSpeakerAvatar = null,
  askSpeakerColor = null,
  askPaused = false,
  onAskPause,
  onAskResume,
}: SceneSidebarProps) {
  const { t } = useI18n();
  const { scenes, currentSceneId, setCurrentSceneId, generatingOutlines, generationStatus } =
    useStageStore();

  const lectureNotes = useMemo(() => buildLectureNotesFromScenes(scenes), [scenes]);
  const deleteScene = useStageStore((s) => s.deleteScene);
  const failedOutlines = useStageStore.use.failedOutlines();
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const [retryingOutlineId, setRetryingOutlineId] = useState<string | null>(null);
  const [askValue, setAskValue] = useState('');
  const askTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askThreadScrollRef = useRef<HTMLDivElement | null>(null);

  const handleRetryOutline = async (outlineId: string) => {
    if (!onRetryOutline) return;
    setRetryingOutlineId(outlineId);
    try {
      await onRetryOutline(outlineId);
    } finally {
      setRetryingOutlineId(null);
    }
  };

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [sidebarTab, setSidebarTab] = useState<SidebarMainTab>('nav');
  const [live2dPointerInteraction, setLive2dPointerInteraction] =
    useState<TalkingAvatarPointerInteractionState>({
      active: false,
      normalizedX: 0,
      normalizedY: 0,
      engagementKey: 0,
    });
  const prevPlaybackEngineRef = useRef<'idle' | 'playing' | 'paused' | null>(null);
  const isDraggingRef = useRef(false);
  const live2dTriggerAtRef = useRef(0);
  const lastInteractionPointRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!live2dPresenter) {
      setSidebarTab((current) => (current === 'live2d' ? 'nav' : current));
      prevPlaybackEngineRef.current = playbackEngineState;
      return;
    }

    const prev = prevPlaybackEngineRef.current;
    const cur = playbackEngineState;

    if (prev === null) {
      setSidebarTab(cur === 'playing' ? 'live2d' : 'nav');
      prevPlaybackEngineRef.current = cur;
      return;
    }

    if (cur === 'playing' && prev !== 'playing') {
      setSidebarTab('live2d');
    } else if ((cur === 'paused' || cur === 'idle') && prev === 'playing') {
      setSidebarTab('nav');
    }

    prevPlaybackEngineRef.current = cur;
  }, [live2dPresenter, playbackEngineState]);

  const tabsValue: SidebarMainTab =
    live2dPresenter || sidebarTab !== 'live2d' ? sidebarTab : 'nav';

  useEffect(() => {
    if (!live2dPresenter || collapsed || tabsValue !== 'live2d') {
      setLive2dPointerInteraction((prev) =>
        prev.active || prev.normalizedX !== 0 || prev.normalizedY !== 0
          ? { ...prev, active: false, normalizedX: 0, normalizedY: 0 }
          : prev,
      );
    }
  }, [collapsed, live2dPresenter, tabsValue]);

  useEffect(() => {
    if (collapsed || tabsValue !== 'ask') return;
    askTextareaRef.current?.focus();
  }, [collapsed, tabsValue]);

  useEffect(() => {
    if (tabsValue !== 'ask') return;
    const el = askThreadScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [askThread, tabsValue]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [sidebarWidth],
  );

  const getSceneTypeIcon = (type: SceneType) => {
    const icons = {
      slide: BookOpen,
      quiz: PieChart,
      interactive: MousePointer2,
      pbl: Cpu,
    };
    return icons[type] || BookOpen;
  };

  /** 收起时保留一条可点击区域，避免播放模式下底部工具栏隐藏后无法再打幻灯片列表 */
  const STRIP_W = 44;
  const displayWidth = collapsed ? STRIP_W : sidebarWidth;
  const showLive2dStage = Boolean(live2dPresenter && tabsValue === 'live2d');

  const updateLive2dInteraction = useCallback(
    (target: HTMLDivElement, clientX: number, clientY: number, engage: boolean) => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const normalizedX = clampInteraction(((clientX - rect.left) / rect.width) * 2 - 1);
      const normalizedY = clampInteraction(((clientY - rect.top) / rect.height) * 2 - 1);
      const now = performance.now();
      const dx = normalizedX - lastInteractionPointRef.current.x;
      const dy = normalizedY - lastInteractionPointRef.current.y;
      const movedEnough = Math.hypot(dx, dy) > 0.6;
      const canTriggerAgain = now - live2dTriggerAtRef.current > 3600;
      const shouldEngage = engage || (movedEnough && canTriggerAgain);

      if (shouldEngage) {
        live2dTriggerAtRef.current = now;
        lastInteractionPointRef.current = { x: normalizedX, y: normalizedY };
      }

      setLive2dPointerInteraction((prev) => ({
        active: true,
        normalizedX,
        normalizedY,
        engagementKey: shouldEngage ? (prev.engagementKey ?? 0) + 1 : prev.engagementKey,
      }));
    },
    [],
  );

  const handleLive2dMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      updateLive2dInteraction(e.currentTarget, e.clientX, e.clientY, true);
    },
    [updateLive2dInteraction],
  );

  const handleLive2dMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      updateLive2dInteraction(e.currentTarget, e.clientX, e.clientY, false);
    },
    [updateLive2dInteraction],
  );

  const handleLive2dMouseLeave = useCallback(() => {
    setLive2dPointerInteraction((prev) => ({
      ...prev,
      active: false,
      normalizedX: 0,
      normalizedY: 0,
    }));
  }, []);

  const handleAskFocus = useCallback(() => {
    void onAskActivate?.();
  }, [onAskActivate]);

  const handleAskSend = useCallback(() => {
    const message = askValue.trim();
    if (!message) return;
    setAskValue('');
    void onAskSubmit?.(message);
  }, [askValue, onAskSubmit]);

  const showAskStatus = askThinking || Boolean(askLiveSpeech) || (askStreaming && askThread.length > 0);
  const isAskSpeaking = !askThinking && Boolean(askLiveSpeech?.trim());

  return (
    <div
      style={{
        width: displayWidth,
        transition: isDraggingRef.current ? 'none' : 'width 0.3s ease',
      }}
      className={cn(
        'apple-glass relative z-20 flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[20px]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.07),0_2px_8px_rgba(0,0,0,0.04)]',
        'dark:shadow-[0_10px_40px_rgba(0,0,0,0.35),0_2px_10px_rgba(0,0,0,0.2)]',
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.5)_0%,rgba(255,255,255,0.2)_46%,rgba(241,245,249,0.58)_100%)] dark:bg-[linear-gradient(180deg,rgba(16,18,24,0.96)_0%,rgba(12,14,20,0.92)_52%,rgba(10,12,18,0.98)_100%)]" />
        <div
          className={cn(
            'absolute left-1/2 top-1/2 h-[72%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-opacity duration-500',
            showLive2dStage
              ? 'bg-[radial-gradient(circle,rgba(56,189,248,0.22)_0%,rgba(250,204,21,0.12)_32%,rgba(255,255,255,0)_72%)] opacity-100 dark:bg-[radial-gradient(circle,rgba(56,189,248,0.2)_0%,rgba(250,204,21,0.12)_30%,rgba(12,14,20,0)_72%)]'
              : 'bg-[radial-gradient(circle,rgba(96,165,250,0.12)_0%,rgba(251,191,36,0.06)_34%,rgba(255,255,255,0)_74%)] opacity-80 dark:bg-[radial-gradient(circle,rgba(59,130,246,0.12)_0%,rgba(251,191,36,0.06)_34%,rgba(15,23,42,0)_74%)]',
          )}
        />
        <div className="absolute -left-8 top-10 h-28 w-28 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-400/12" />
        <div className="absolute bottom-16 right-[-18%] h-36 w-36 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-400/10" />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-300/35 to-transparent dark:via-white/10" />
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.14)_45%,rgba(255,255,255,0.34)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(99,102,241,0.04)_40%,rgba(14,17,23,0.32)_100%)]" />
        <div className="absolute inset-0 opacity-[0.12] dark:opacity-[0.08] [background-image:linear-gradient(to_right,rgba(148,163,184,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.24)_1px,transparent_1px)] [background-position:center_center] [background-size:28px_28px]" />
      </div>

      {collapsed ? (
        <div className="relative z-10 flex h-full min-h-0 w-full flex-col items-center bg-white/50 py-3 backdrop-blur-md dark:bg-[#0d0d10]/35">
          <button
            type="button"
            onClick={() => onCollapseChange(false)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[#007AFF] transition-colors hover:bg-[rgba(0,122,255,0.1)] dark:text-[#0A84FF] dark:hover:bg-[rgba(10,132,255,0.15)]"
            aria-label={t('stage.openSceneList')}
            title={t('stage.openSceneList')}
          >
            <PanelLeftOpen className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className="group absolute bottom-0 right-0 top-0 z-50 w-1.5 cursor-col-resize transition-colors hover:bg-[#007AFF]/20 active:bg-[#007AFF]/30 dark:hover:bg-[#0A84FF]/25 dark:active:bg-[#0A84FF]/35"
        >
          <div className="absolute right-0.5 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-slate-300 transition-colors group-hover:bg-[#007AFF] dark:bg-slate-600 dark:group-hover:bg-[#0A84FF]" />
        </div>
      )}

      <div
        className={cn(
          'relative z-10 flex h-full w-full min-h-0 flex-col overflow-hidden',
          collapsed && 'hidden',
        )}
      >
        <Tabs
          value={tabsValue}
          onValueChange={(v) => {
            if (v === 'nav' || v === 'notes' || v === 'ask' || v === 'live2d') setSidebarTab(v);
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
          <div className="relative mb-1 mt-3 flex min-h-10 shrink-0 items-center px-3">
            <TabsList
              variant="default"
              className={cn(
                // 覆盖 TabsList 默认 inline-flex w-fit，否则多列标签在窄侧栏里可被挤到不可见
                '!grid h-9 min-h-9 w-full min-w-0 max-w-none flex-1 gap-0 p-[3px]',
                live2dPresenter ? 'grid-cols-4' : 'grid-cols-3',
              )}
              aria-label={
                live2dPresenter
                  ? `${t('stage.sidebarTabNav')} / ${t('stage.sidebarTabNotes')} / ${t('stage.sidebarTabAsk')} / ${t('stage.sidebarTabLive2d')}`
                  : `${t('stage.sidebarTabNav')} / ${t('stage.sidebarTabNotes')} / ${t('stage.sidebarTabAsk')}`
              }
            >
              <TabsTrigger value="nav" className="px-0.5 text-[10px] leading-tight">
                {t('stage.sidebarTabNav')}
              </TabsTrigger>
              <TabsTrigger value="notes" className="px-0.5 text-[10px] leading-tight">
                {t('stage.sidebarTabNotes')}
              </TabsTrigger>
              <TabsTrigger value="ask" className="px-0.5 text-[10px] leading-tight">
                {t('stage.sidebarTabAsk')}
              </TabsTrigger>
              {live2dPresenter ? (
                <TabsTrigger value="live2d" className="px-0.5 text-[10px] leading-tight">
                  {t('stage.sidebarTabLive2d')}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>

          <TabsContent
            value="nav"
            className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
          >
            {/* Scenes List */}
            <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2 pt-1 scrollbar-hide">
              {scenes.map((scene, index) => {
                const isActive = currentSceneId === scene.id;
                const Icon = getSceneTypeIcon(scene.type);
                const isSlide = scene.type === 'slide';
                const slideContent = isSlide ? (scene.content as SlideContent) : null;
                const canDeletePage = scenes.length > 1;

                return (
                  <div
                    key={scene.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${index + 1}. ${scene.title}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      if (onSceneSelect) {
                        onSceneSelect(scene.id);
                      } else {
                        setCurrentSceneId(scene.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (onSceneSelect) onSceneSelect(scene.id);
                        else setCurrentSceneId(scene.id);
                      }
                    }}
                    className={cn(
                      'group relative flex cursor-pointer flex-col rounded-[12px] p-1 transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                      isActive
                        ? 'bg-[rgba(0,122,255,0.1)] ring-1 ring-[rgba(0,122,255,0.22)] dark:bg-[rgba(10,132,255,0.14)] dark:ring-[rgba(10,132,255,0.35)]'
                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-slate-100/90 ring-1 ring-slate-900/[0.08] dark:bg-white/[0.06] dark:ring-white/[0.1]">
                      <span
                        className={cn(
                          'pointer-events-none absolute left-1.5 top-1.5 z-[1] flex size-5 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shadow-sm',
                          isActive
                            ? 'bg-[#007AFF] text-white dark:bg-[#0A84FF]'
                            : 'bg-black/55 text-white dark:bg-black/50',
                        )}
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        title={canDeletePage ? t('stage.deletePage') : t('stage.deletePageMinOne')}
                        aria-label={t('stage.deletePage')}
                        disabled={!canDeletePage}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canDeletePage) return;
                          const msg = t('stage.deletePageConfirm').replace(
                            '{title}',
                            scene.title.trim() || `${index + 1}`,
                          );
                          if (typeof window !== 'undefined' && !window.confirm(msg)) return;
                          deleteScene(scene.id);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={cn(
                          'absolute right-1.5 top-1.5 z-[2] flex size-6 items-center justify-center rounded-md shadow-sm transition-colors',
                          'bg-white/95 text-slate-600 ring-1 ring-slate-900/[0.12] hover:bg-red-50 hover:text-red-600 hover:ring-red-200/80',
                          'dark:bg-black/55 dark:text-slate-200 dark:ring-white/[0.15] dark:hover:bg-red-950/50 dark:hover:text-red-400 dark:hover:ring-red-900/40',
                          !canDeletePage &&
                            'cursor-not-allowed opacity-40 hover:bg-white/95 hover:text-slate-600 hover:ring-slate-900/[0.12] dark:hover:bg-black/55 dark:hover:text-slate-200',
                        )}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2} />
                      </button>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isSlide && slideContent ? (
                          <ThumbnailSlide
                            slide={slideContent.canvas}
                            viewportSize={viewportSize}
                            viewportRatio={viewportRatio}
                            size={Math.max(100, sidebarWidth - 28)}
                          />
                        ) : scene.type === 'quiz' ? (
                          /* Quiz: question bar + 2x2 option grid */
                          <div className="w-full h-full bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 p-2 flex flex-col">
                            <div className="h-1.5 w-4/5 bg-orange-200/70 dark:bg-orange-700/30 rounded-full mb-1.5" />
                            <div className="flex-1 grid grid-cols-2 gap-1">
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    'rounded flex items-center gap-1 px-1',
                                    i === 1
                                      ? 'bg-orange-400/20 dark:bg-orange-500/20 border border-orange-300/50 dark:border-orange-600/30'
                                      : 'bg-white/60 dark:bg-white/5 border border-orange-100/60 dark:border-orange-800/20',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'w-1.5 h-1.5 rounded-full shrink-0',
                                      i === 1
                                        ? 'bg-orange-400 dark:bg-orange-500'
                                        : 'bg-orange-200 dark:bg-orange-700/50',
                                    )}
                                  />
                                  <div
                                    className={cn(
                                      'h-1 rounded-full flex-1',
                                      i === 1
                                        ? 'bg-orange-300/60 dark:bg-orange-600/40'
                                        : 'bg-orange-100/80 dark:bg-orange-800/30',
                                    )}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : scene.type === 'interactive' ? (
                          /* Interactive: browser window with chrome + content */
                          <div className="w-full h-full bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-1.5 flex flex-col">
                            <div className="flex items-center gap-1 mb-1 pb-1 border-b border-emerald-200/40 dark:border-emerald-700/20">
                              <div className="flex gap-0.5">
                                <div className="w-1 h-1 rounded-full bg-red-300 dark:bg-red-500/60" />
                                <div className="w-1 h-1 rounded-full bg-amber-300 dark:bg-amber-500/60" />
                                <div className="w-1 h-1 rounded-full bg-green-300 dark:bg-green-500/60" />
                              </div>
                              <div className="h-1.5 flex-1 bg-emerald-200/40 dark:bg-emerald-700/30 rounded-full ml-0.5" />
                            </div>
                            <div className="flex-1 flex gap-1">
                              <div className="w-1/4 space-y-1 pt-0.5">
                                {[1, 2, 3].map((i) => (
                                  <div
                                    key={i}
                                    className="h-0.5 w-full bg-emerald-200/60 dark:bg-emerald-700/30 rounded-full"
                                  />
                                ))}
                              </div>
                              <div className="flex-1 bg-emerald-100/40 dark:bg-emerald-800/20 rounded flex items-center justify-center border border-emerald-200/40 dark:border-emerald-700/20">
                                <Globe className="w-4 h-4 text-emerald-300/80 dark:text-emerald-600/50" />
                              </div>
                            </div>
                          </div>
                        ) : scene.type === 'pbl' ? (
                          /* PBL: kanban board with 3 columns */
                          <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 p-1.5 flex flex-col">
                            <div className="flex items-center gap-1 mb-1.5">
                              <div className="w-1.5 h-1.5 rounded bg-blue-300 dark:bg-blue-600" />
                              <div className="h-1 w-8 bg-blue-200/60 dark:bg-blue-700/30 rounded-full" />
                            </div>
                            <div className="flex-1 flex gap-1 overflow-hidden">
                              {[0, 1, 2].map((col) => (
                                <div
                                  key={col}
                                  className="flex-1 bg-white/50 dark:bg-white/5 rounded p-0.5 flex flex-col gap-0.5"
                                >
                                  <div
                                    className={cn(
                                      'h-0.5 w-3 rounded-full mb-0.5',
                                      col === 0
                                        ? 'bg-blue-300/70'
                                        : col === 1
                                          ? 'bg-amber-300/70'
                                          : 'bg-green-300/70',
                                    )}
                                  />
                                  {Array.from({
                                    length: col === 0 ? 3 : col === 1 ? 2 : 1,
                                  }).map((_, i) => (
                                    <div
                                      key={i}
                                      className="h-2 w-full bg-blue-100/60 dark:bg-blue-800/20 rounded border border-blue-200/30 dark:border-blue-700/20"
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          /* Fallback */
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100/80 text-[#86868b] dark:bg-white/[0.05] dark:text-[#a1a1a6]">
                            <Icon className="w-4 h-4" />
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                              {scene.type}
                            </span>
                          </div>
                        )}

                        {isSlide && (
                          <div
                            className={cn(
                              'absolute inset-0 transition-colors',
                              isActive
                                ? 'bg-transparent'
                                : 'group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.06]',
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Single placeholder for the next generating page (clickable) */}
              {generatingOutlines.length > 0 &&
                (() => {
                  const outline = generatingOutlines[0];
                  const isFailed = failedOutlines.some((f) => f.id === outline.id);
                  const isRetrying = retryingOutlineId === outline.id;
                  const isPaused = generationStatus === 'paused';
                  const isActive = currentSceneId === PENDING_SCENE_ID;

                  return (
                    <div
                      key={`generating-${outline.id}`}
                      role="button"
                      tabIndex={isFailed ? -1 : 0}
                      aria-label={
                        isFailed
                          ? `${t('stage.generationFailed')}: ${outline.title}`
                          : `${scenes.length + 1}. ${outline.title}`
                      }
                      aria-current={isActive && !isFailed ? 'true' : undefined}
                      onClick={() => {
                        if (isFailed) return;
                        if (onSceneSelect) {
                          onSceneSelect(PENDING_SCENE_ID);
                        } else {
                          setCurrentSceneId(PENDING_SCENE_ID);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (isFailed) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (onSceneSelect) onSceneSelect(PENDING_SCENE_ID);
                          else setCurrentSceneId(PENDING_SCENE_ID);
                        }
                      }}
                      className={cn(
                        'group relative flex flex-col rounded-[12px] p-1 transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
                        isFailed
                          ? 'cursor-default opacity-100'
                          : 'cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                        !isFailed && !isActive && 'opacity-60',
                        isActive &&
                          !isFailed &&
                          'bg-[rgba(0,122,255,0.1)] opacity-100 ring-1 ring-[rgba(0,122,255,0.22)] dark:bg-[rgba(10,132,255,0.14)] dark:ring-[rgba(10,132,255,0.35)]',
                      )}
                    >
                      {/* Skeleton Thumbnail */}
                      <div
                        className={cn(
                          'relative aspect-video w-full overflow-hidden rounded-[10px] ring-1',
                          isFailed
                            ? 'bg-red-50/40 ring-red-200/80 dark:bg-red-950/20 dark:ring-red-900/30'
                            : 'bg-slate-100/90 ring-slate-900/[0.08] dark:bg-white/[0.06] dark:ring-white/[0.1]',
                        )}
                      >
                        {!isFailed && (
                          <span
                            className={cn(
                              'pointer-events-none absolute left-1.5 top-1.5 z-[1] flex size-5 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shadow-sm',
                              isActive
                                ? 'bg-[#007AFF] text-white dark:bg-[#0A84FF]'
                                : 'bg-black/55 text-white dark:bg-black/50',
                            )}
                            aria-hidden
                          >
                            {scenes.length + 1}
                          </span>
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                          {isFailed ? (
                            <div className="flex items-center gap-1 text-xs font-medium text-red-500/90 dark:text-red-400">
                              {onRetryOutline ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetryOutline(outline.id);
                                  }}
                                  disabled={isRetrying}
                                  className="p-1 -ml-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                                  title={t('generation.retryScene')}
                                >
                                  <RefreshCw
                                    className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')}
                                  />
                                </button>
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isRetrying
                                  ? t('generation.retryingScene')
                                  : t('stage.generationFailed')}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div
                                className={cn(
                                  'h-2 w-3/5 rounded-md bg-slate-200/90 dark:bg-white/[0.12]',
                                  !isPaused && 'animate-pulse',
                                )}
                              />
                              <div
                                className={cn(
                                  'h-1.5 w-2/5 rounded-md bg-slate-200/90 dark:bg-white/[0.12]',
                                  !isPaused && 'animate-pulse',
                                )}
                              />
                              <span className="mt-0.5 text-[9px] font-medium text-[#86868b] dark:text-[#a1a1a6]">
                                {isPaused ? t('stage.paused') : t('stage.generating')}
                              </span>
                            </>
                          )}
                        </div>
                        {!isFailed && !isPaused && (
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>

            <div className="mt-auto shrink-0" />
          </TabsContent>

          <TabsContent
            value="notes"
            className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0 pt-1">
              <LectureNotesView notes={lectureNotes} currentSceneId={currentSceneId} />
            </div>
          </TabsContent>

          <TabsContent
            value="ask"
            className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0 pt-1">
              {showAskStatus ? (
                <div className="shrink-0 px-3 pb-2">
                  <div className="rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-3 py-3 shadow-sm dark:border-sky-500/20 dark:bg-gradient-to-br dark:from-sky-500/10 dark:via-slate-950/40 dark:to-cyan-500/5">
                    <div className="flex items-start gap-3">
                      <div className="relative mt-0.5 shrink-0">
                        <Avatar
                          className="h-10 w-10 border-2 shadow-[0_10px_24px_rgba(14,165,233,0.18)]"
                          style={{ borderColor: askSpeakerColor || '#38bdf8' }}
                        >
                          {askSpeakerAvatar &&
                          (askSpeakerAvatar.startsWith('http') ||
                            askSpeakerAvatar.startsWith('/') ||
                            askSpeakerAvatar.startsWith('data:')) ? (
                            <AvatarImage src={askSpeakerAvatar} alt={askSpeakerName || 'AI'} />
                          ) : null}
                          <AvatarFallback
                            style={{
                              backgroundColor: `${askSpeakerColor || '#38bdf8'}20`,
                              color: askSpeakerColor || '#0369a1',
                            }}
                          >
                            {askSpeakerAvatar || (askSpeakerName || 'AI').slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        {isAskSpeaking ? (
                          <>
                            <span className="absolute inset-0 rounded-full border border-sky-400/50 animate-ping" />
                            <span className="absolute -right-1 -top-1 flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-950" />
                          </>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                          <span>{askSpeakerName || t('chat.sidebarAskAiLabel')}</span>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] tracking-[0.08em] text-sky-700 dark:text-sky-200">
                            {askThinking ? '思考中' : askPaused ? '已暂停' : '正在回答'}
                          </span>
                        </div>
                        {isAskSpeaking ? (
                          <div className="mt-1 flex items-end gap-1.5">
                            <span className="h-2 w-1 rounded-full bg-sky-400/80 animate-[askWave_1.1s_ease-in-out_infinite]" />
                            <span className="h-3 w-1 rounded-full bg-sky-500/85 animate-[askWave_1.1s_ease-in-out_infinite_0.15s]" />
                            <span className="h-4 w-1 rounded-full bg-cyan-500/90 animate-[askWave_1.1s_ease-in-out_infinite_0.3s]" />
                            <span className="h-3 w-1 rounded-full bg-sky-500/85 animate-[askWave_1.1s_ease-in-out_infinite_0.45s]" />
                            <span className="h-2 w-1 rounded-full bg-sky-400/80 animate-[askWave_1.1s_ease-in-out_infinite_0.6s]" />
                          </div>
                        ) : null}
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-100">
                          {askLiveSpeech?.trim()
                            ? askLiveSpeech
                            : askThinking
                              ? '正在结合当前课堂内容组织回答...'
                              : '正在生成回复...'}
                        </p>
                        {!askThinking && (onAskPause || onAskResume) ? (
                          <div className="mt-2 flex items-center gap-2">
                            {askPaused ? (
                              <button
                                type="button"
                                onClick={onAskResume}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/25 dark:bg-slate-900/60 dark:text-sky-200 dark:hover:bg-slate-900"
                              >
                                <Play className="h-3.5 w-3.5" />
                                继续回答
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={onAskPause}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/25 dark:bg-slate-900/60 dark:text-sky-200 dark:hover:bg-slate-900"
                              >
                                <Pause className="h-3.5 w-3.5" />
                                暂停回答
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              <div
                ref={askThreadScrollRef}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2 pt-1 scrollbar-hide"
              >
                <div
                  className={cn(
                    'rounded-2xl border border-white/70 bg-white/75 p-3 dark:border-white/10 dark:bg-slate-950/30',
                    askThread.length > 0
                      ? 'space-y-3'
                      : 'flex min-h-[200px] flex-col items-center justify-center px-4 py-8 text-center',
                  )}
                >
                  {askThread.length === 0 ? (
                    <p className="max-w-[260px] text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {t('chat.askThreadEmpty')}
                    </p>
                  ) : (
                    askThread.map((message) => {
                      const isAssistant = message.role === 'assistant';
                      return (
                        <div
                          key={message.id}
                          className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}
                        >
                          <div
                            className={cn(
                              'max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-6 shadow-sm',
                              isAssistant
                                ? 'border border-sky-200 bg-white text-slate-700 dark:border-sky-500/20 dark:bg-slate-900/80 dark:text-slate-100'
                                : 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950',
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium opacity-70">
                              <span>
                                {isAssistant ? t('chat.sidebarAskAiLabel') : t('common.you')}
                              </span>
                              {message.pending ? (
                                <Loader2 className="size-3 shrink-0 animate-spin" />
                              ) : null}
                            </div>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-900/[0.08] bg-white/88 px-3 py-3 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0f1115]/90">
                <div className="rounded-[20px] border border-slate-900/[0.08] bg-white/88 p-2 shadow-[0_10px_28px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-black/20 dark:shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={askTextareaRef}
                      value={askValue}
                      onFocus={handleAskFocus}
                      onChange={(e) => setAskValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          (e.metaKey || e.ctrlKey) &&
                          e.key === 'Enter' &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          handleAskSend();
                          return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleAskSend();
                        }
                      }}
                      placeholder={t('chat.askPlaceholder')}
                      rows={4}
                      className="min-h-[108px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
                      style={{ fieldSizing: 'content' } as CSSProperties}
                    />
                    <button
                      type="button"
                      onClick={handleAskSend}
                      disabled={!askValue.trim()}
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all duration-200',
                        askValue.trim()
                          ? 'bg-[#007AFF] text-white shadow-[0_10px_24px_rgba(0,122,255,0.28)] hover:bg-[#0a84ff]'
                          : 'bg-slate-200/80 text-slate-400 dark:bg-white/[0.08] dark:text-white/30',
                      )}
                      aria-label={t('chat.send')}
                    >
                      <SendHorizonal className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 px-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    {t('chat.askHint')}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {live2dPresenter ? (
            <TabsContent
              value="live2d"
              className="mt-0 flex min-h-[min(40vh,320px)] min-w-0 flex-1 flex-col overflow-hidden outline-none"
              onMouseEnter={handleLive2dMouseEnter}
              onMouseMove={handleLive2dMouseMove}
              onMouseLeave={handleLive2dMouseLeave}
            >
              <TalkingAvatarOverlay
                layout="sidebar"
                pointerInteraction={live2dPointerInteraction}
                {...live2dPresenter}
              />
              <div className="mt-auto shrink-0" />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}

function clampInteraction(value: number) {
  return Math.max(-1, Math.min(1, value));
}
