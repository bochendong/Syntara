'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, Download, FileDown, Package, AlertCircle, Volume2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useSettingsStore } from '@/lib/store/settings';
import { getActiveVoiceDisplay } from '@/lib/audio/voice-display';
import { getSceneSpeechTtsBanner } from '@/lib/audio/speech-audio-readiness';

interface HeaderProps {
  readonly currentSceneTitle: string;
  /** 播放模式下与右侧下载按钮并排（音量、倍速、翻页等） */
  readonly centerSlot?: ReactNode;
  /** 例如 PPT / 测验 / 原始数据 — 渲染在顶栏正中 */
  readonly viewToggle?: ReactNode;
}

export function Header({ currentSceneTitle, centerSlot, viewToggle }: HeaderProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const voiceDisplay = useMemo(
    () => getActiveVoiceDisplay(ttsProviderId, ttsVoice, t, locale),
    [ttsProviderId, ttsVoice, t, locale],
  );

  const stageCourseId = useStageStore((s) => s.stage?.courseId?.trim());
  const contextCourseId = useCurrentCourseStore((s) => s.id);
  const resolvedCourseId = stageCourseId || contextCourseId;
  const backHref = resolvedCourseId
    ? `/course/${encodeURIComponent(resolvedCourseId)}`
    : '/my-courses';
  const backTitle = resolvedCourseId
    ? t('generation.backToCourseHome')
    : t('generation.backToMyCourses');

  // Export
  const { exporting: isExporting, exportPPTX, exportResourcePack } = useExportPPTX();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const outlines = useStageStore((s) => s.outlines);
  const failedOutlines = useStageStore((s) => s.failedOutlines);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);

  /** 与 use-scene-generator 一致：按 order 对比大纲与已生成页，避免 generatingOutlines 残留导致顶栏误判 */
  const completedOrders = useMemo(() => new Set(scenes.map((s) => s.order)), [scenes]);
  const pendingOutlines = useMemo(
    () => outlines.filter((o) => !completedOrders.has(o.order)),
    [outlines, completedOrders],
  );

  const canExport =
    scenes.length > 0 &&
    pendingOutlines.length === 0 &&
    failedOutlines.length === 0 &&
    Object.values(mediaTasks).every((task) => task.status === 'done' || task.status === 'failed');

  const mediaBusy = Object.values(mediaTasks).some(
    (task) => task.status === 'pending' || task.status === 'generating',
  );

  const headerCurrentScene = useMemo(
    () => (currentSceneId ? scenes.find((s) => s.id === currentSceneId) : undefined),
    [scenes, currentSceneId],
  );

  const speechTtsBanner = useMemo(
    () =>
      getSceneSpeechTtsBanner(headerCurrentScene, {
        ttsEnabled,
        ttsProviderId,
      }),
    [headerCurrentScene, ttsEnabled, ttsProviderId],
  );

  const exportWaitMessage = (() => {
    if (failedOutlines.length > 0) return t('export.waitSceneGenerationFailed');
    if (pendingOutlines.length > 0) return t('export.waitGeneratingFollowUp');
    if (mediaBusy) return t('export.waitMedia');
    if (scenes.length === 0) return t('export.waitNoScenes');
    return t('share.notReady');
  })();

  const exportWaitShowSpinner = pendingOutlines.length > 0 || mediaBusy;

  // Close dropdown when clicking outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (exportMenuOpen && exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    },
    [exportMenuOpen],
  );

  useEffect(() => {
    if (exportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [exportMenuOpen, handleClickOutside]);

  const voiceTitle =
    voiceDisplay.blurb != null && voiceDisplay.blurb !== ''
      ? `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name} — ${voiceDisplay.blurb}`
      : `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name}`;

  const speechPendingText =
    speechTtsBanner.variant === 'pending'
      ? locale === 'zh-CN'
        ? `${t('stage.ttsSpeechPendingBanner')}（${speechTtsBanner.ready}/${speechTtsBanner.total}）`
        : `${t('stage.ttsSpeechPendingBanner')} (${speechTtsBanner.ready}/${speechTtsBanner.total})`
      : '';

  const stackedToolbar = Boolean(viewToggle || centerSlot);

  const metaChipsRow = (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex max-w-full cursor-default items-center gap-1.5 rounded-lg border px-2 py-1',
                'border-slate-200/70 bg-slate-50/90 text-[11px] leading-tight',
                'dark:border-white/[0.1] dark:bg-white/[0.05]',
              )}
            >
              <Volume2 className="size-3 shrink-0 text-slate-500 opacity-80 dark:text-slate-400" aria-hidden />
              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">{t('stage.ttsVoiceLabel')}</span>
                <span className="mx-1 text-slate-400 dark:text-slate-500">·</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{voiceDisplay.name}</span>
                {voiceDisplay.blurb ? (
                  <span className="text-slate-500 dark:text-slate-400"> · {voiceDisplay.blurb}</span>
                ) : null}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {voiceTitle}
          </TooltipContent>
        </Tooltip>

        {speechTtsBanner.variant === 'ready' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex max-w-[min(100%,320px)] cursor-default items-center gap-1.5 rounded-lg px-2 py-1',
                  'border border-emerald-200/70 bg-emerald-50/90 text-[11px] font-medium leading-tight',
                  'text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-950/40 dark:text-emerald-200',
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span className="min-w-0 truncate">{t('stage.ttsSpeechReadyBanner')}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-xs">
              {t('stage.ttsSpeechReadyBanner')}
            </TooltipContent>
          </Tooltip>
        ) : speechTtsBanner.variant === 'pending' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex max-w-[min(100%,280px)] cursor-default items-center gap-1.5 rounded-lg px-2 py-1',
                  'border border-amber-200/80 bg-amber-50/90 text-[11px] font-medium leading-tight',
                  'text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100',
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                <span className="min-w-0 truncate">{speechPendingText}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-xs">
              {speechPendingText}
            </TooltipContent>
          </Tooltip>
        ) : speechTtsBanner.variant === 'browser' ? (
          <span
            className="inline-flex max-w-[min(100%,260px)] items-center truncate rounded-lg border border-slate-200/60 bg-slate-50/60 px-2 py-1 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400"
            title={t('stage.ttsSpeechBrowserBanner')}
          >
            {t('stage.ttsSpeechBrowserBanner')}
          </span>
        ) : speechTtsBanner.variant === 'tts_disabled' ? (
          <span
            className="inline-flex max-w-[min(100%,260px)] items-center truncate rounded-lg border border-slate-200/60 bg-slate-50/60 px-2 py-1 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400"
            title={t('stage.ttsSpeechOffBanner')}
          >
            {t('stage.ttsSpeechOffBanner')}
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );

  return (
    <>
      <header
        className={cn(
          'z-10 shrink-0',
          'border-b border-slate-900/[0.08] bg-white/70 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0d0d10]/55',
          stackedToolbar ? 'flex flex-col' : 'flex min-h-[4.5rem] items-center px-6 md:px-8',
        )}
      >
        {stackedToolbar ? (
          <>
            {/* 第一行：返回 + 标题 + 导出 */}
            <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5 md:px-6 md:py-3">
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="shrink-0 rounded-[12px] p-2 text-[#86868b] transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-[#a1a1a6] dark:hover:bg-white/[0.06] dark:hover:text-white"
                title={backTitle}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1
                className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-[#1d1d1f] md:text-xl dark:text-white"
                suppressHydrationWarning
              >
                {currentSceneTitle || t('common.loading')}
              </h1>
              <div className="relative shrink-0 min-w-0" ref={exportRef}>
                {!canExport && !isExporting ? (
                  <div
                    className="apple-glass flex max-w-[min(100vw-10rem,280px)] items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[#1d1d1f]/75 dark:text-white/75"
                    role="status"
                    title={exportWaitMessage}
                  >
                    {exportWaitShowSpinner ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
                    ) : failedOutlines.length > 0 ? (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                    ) : null}
                    <span className="min-w-0 truncate font-medium">{exportWaitMessage}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (canExport && !isExporting) setExportMenuOpen(!exportMenuOpen);
                    }}
                    disabled={!canExport || isExporting}
                    title={
                      canExport
                        ? isExporting
                          ? t('export.exporting')
                          : t('export.pptx')
                        : t('share.notReady')
                    }
                    className={cn(
                      'shrink-0 rounded-full p-2 transition-all',
                      canExport && !isExporting
                        ? 'text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f] hover:shadow-sm dark:text-[#a1a1a6] dark:hover:bg-white/[0.08] dark:hover:text-white'
                        : 'cursor-not-allowed text-[#86868b]/40 opacity-50 dark:text-[#a1a1a6]/40',
                    )}
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                )}
                {exportMenuOpen && canExport && !isExporting && (
                  <div className="apple-glass absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-[14px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportPPTX();
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <FileDown className="h-4 w-4 shrink-0 text-gray-400" />
                      <span>{t('export.pptx')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportResourcePack();
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Package className="h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <div>{t('export.resourcePack')}</div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">
                          {t('export.resourcePackDesc')}
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 第二行：元信息（音色 / 语音状态）+ 视图切换 + 播放条 */}
            <div className="flex flex-col gap-2 border-t border-slate-900/[0.06] px-4 py-2 dark:border-white/[0.06] md:flex-row md:items-center md:gap-3 md:px-6 md:py-2.5">
              {metaChipsRow}
              <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-start gap-2 md:ml-auto md:justify-end">
                {viewToggle ? <div className="shrink-0">{viewToggle}</div> : null}
                {centerSlot ? (
                  <div className="flex min-w-0 max-w-full items-center overflow-x-auto md:max-w-[min(100vw-14rem,560px)]">
                    {centerSlot}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="flex w-full min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="shrink-0 rounded-[12px] p-2 text-[#86868b] transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-[#a1a1a6] dark:hover:bg-white/[0.06] dark:hover:text-white"
              title={backTitle}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1
                className="truncate text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-white"
                suppressHydrationWarning
              >
                {currentSceneTitle || t('common.loading')}
              </h1>
              <div className="min-w-0">{metaChipsRow}</div>
            </div>
            <div className="relative shrink-0 min-w-0" ref={exportRef}>
            {!canExport && !isExporting ? (
              <div
                className="apple-glass flex max-w-[min(100vw-10rem,320px)] items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[#1d1d1f]/75 dark:text-white/75"
                role="status"
                title={exportWaitMessage}
              >
                {exportWaitShowSpinner ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#007AFF] dark:text-[#0A84FF]" />
                ) : failedOutlines.length > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                ) : null}
                <span className="min-w-0 truncate font-medium">{exportWaitMessage}</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (canExport && !isExporting) setExportMenuOpen(!exportMenuOpen);
                }}
                disabled={!canExport || isExporting}
                title={
                  canExport
                    ? isExporting
                      ? t('export.exporting')
                      : t('export.pptx')
                    : t('share.notReady')
                }
                className={cn(
                  'shrink-0 rounded-full p-2 transition-all',
                  canExport && !isExporting
                    ? 'text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f] hover:shadow-sm dark:text-[#a1a1a6] dark:hover:bg-white/[0.08] dark:hover:text-white'
                    : 'cursor-not-allowed text-[#86868b]/40 opacity-50 dark:text-[#a1a1a6]/40',
                )}
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            )}
            {exportMenuOpen && canExport && !isExporting && (
              <div className="apple-glass absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-[14px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    exportPPTX();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
                >
                  <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{t('export.pptx')}</span>
                </button>
                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    exportResourcePack();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
                >
                  <Package className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <div>{t('export.resourcePack')}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      {t('export.resourcePackDesc')}
                    </div>
                  </div>
                </button>
              </div>
            )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
