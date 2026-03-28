'use client';

import { useState, useRef, useCallback } from 'react';
import {
  PanelLeftOpen,
  PieChart,
  Cpu,
  MousePointer2,
  BookOpen,
  Globe,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useStageStore, useCanvasStore } from '@/lib/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneType, SlideContent } from '@/lib/types/stage';
import { PENDING_SCENE_ID } from '@/lib/store/stage';

interface SceneSidebarProps {
  readonly collapsed: boolean;
  readonly onCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
}

const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 170;
const MAX_WIDTH = 400;

export function SceneSidebar({
  collapsed,
  onCollapseChange,
  onSceneSelect,
  onRetryOutline,
}: SceneSidebarProps) {
  const { t } = useI18n();
  const { scenes, currentSceneId, setCurrentSceneId, generatingOutlines, generationStatus } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const [retryingOutlineId, setRetryingOutlineId] = useState<string | null>(null);

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
  const isDraggingRef = useRef(false);

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

  return (
    <div
      style={{
        width: displayWidth,
        transition: isDraggingRef.current ? 'none' : 'width 0.3s ease',
      }}
      className={cn(
        'apple-glass relative z-20 flex shrink-0 flex-col overflow-hidden rounded-[20px]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.07),0_2px_8px_rgba(0,0,0,0.04)]',
        'dark:shadow-[0_10px_40px_rgba(0,0,0,0.35),0_2px_10px_rgba(0,0,0,0.2)]',
      )}
    >
      {collapsed ? (
        <div className="flex h-full min-h-0 w-full flex-col items-center bg-white/50 py-3 backdrop-blur-md dark:bg-[#0d0d10]/35">
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

      <div className={cn('flex h-full w-full min-h-0 flex-col overflow-hidden', collapsed && 'hidden')}>
        <div className="relative mb-1 mt-3 flex min-h-10 shrink-0 items-center px-3">
          <Tabs defaultValue="nav" className="min-w-0 w-full gap-0">
            <TabsList
              variant="default"
              className="grid h-9 min-h-9 min-w-0 flex-1 grid-cols-2 gap-0 p-[3px]"
              aria-label={`${t('stage.sidebarTabNav')} / ${t('stage.sidebarTabAsk')}`}
            >
              <TabsTrigger value="nav" className="text-xs">
                {t('stage.sidebarTabNav')}
              </TabsTrigger>
              <TabsTrigger
                value="ask"
                disabled
                className="text-xs"
                title={t('stage.sidebarTabAskDisabledHint')}
                aria-label={`${t('stage.sidebarTabAsk')} — ${t('stage.sidebarTabAskDisabledHint')}`}
              >
                {t('stage.sidebarTabAsk')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Scenes List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2 scrollbar-hide pt-1">
          {scenes.map((scene, index) => {
            const isActive = currentSceneId === scene.id;
            const Icon = getSceneTypeIcon(scene.type);
            const isSlide = scene.type === 'slide';
            const slideContent = isSlide ? (scene.content as SlideContent) : null;

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
                          isActive ? 'bg-transparent' : 'group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.06]',
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

        {/* Spacer to push toggle button area */}
        <div className="mt-auto" />
      </div>
    </div>
  );
}
