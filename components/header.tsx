'use client';

import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Loader2,
  Download,
  FileDown,
  Package,
  AlertCircle,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useSettingsStore } from '@/lib/store/settings';
import { getSceneSpeechTtsBanner } from '@/lib/audio/speech-audio-readiness';
import { renderPlainTitleWithOptionalLatex } from '@/lib/render-html-with-latex';
import { ensureMissingSpeechAudioForScene } from '@/lib/hooks/use-scene-generator';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import type { SpeechAction } from '@/lib/types/action';

interface HeaderProps {
  readonly currentSceneTitle: string;
  /** 标题行右侧附加操作，例如编辑当前页 */
  readonly titleActions?: ReactNode;
}

export function Header({ currentSceneTitle, titleActions }: HeaderProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);

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
  const [isSynthesizingAllSpeech, setIsSynthesizingAllSpeech] = useState(false);
  const [synthAllSpeechProgress, setSynthAllSpeechProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const outlines = useStageStore((s) => s.outlines);
  const failedOutlines = useStageStore((s) => s.failedOutlines);

  /** 与 use-scene-generator 一致：按 order 对比大纲与已生成页，避免 generatingOutlines 残留导致顶栏误判 */
  const completedOrders = useMemo(() => new Set(scenes.map((s) => s.order)), [scenes]);
  const pendingOutlines = useMemo(
    () => outlines.filter((o) => !completedOrders.has(o.order)),
    [outlines, completedOrders],
  );

  // Export intentionally depends on slide/media readiness only.
  // Speech synthesis is manual/on-demand and must never block downloads.
  const canExport =
    scenes.length > 0 &&
    pendingOutlines.length === 0 &&
    failedOutlines.length === 0;

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

  const allSpeechStats = useMemo(() => {
    let total = 0;
    let ready = 0;

    for (const scene of scenes) {
      const speechActions =
        splitLongSpeechActions(scene.actions || [], ttsProviderId).filter(
          (action): action is SpeechAction => action.type === 'speech' && Boolean(action.text?.trim()),
        ) ?? [];
      total += speechActions.length;
      ready += speechActions.filter((action) => Boolean(action.audioUrl)).length;
    }

    return {
      total,
      ready,
      missing: Math.max(0, total - ready),
    };
  }, [scenes, ttsProviderId]);

  /** 仅统计「幻灯片」中含讲解语音的页：用于「几页已就绪 / 哪几页未就绪」 */
  const speechPagesBreakdown = useMemo(() => {
    const ordered = [...scenes].sort((a, b) => a.order - b.order);
    const pages: Array<{
      displayIndex: number;
      title: string;
      fullyReady: boolean;
    }> = [];
    let slideOrdinal = 0;
    for (const scene of ordered) {
      if (scene.type !== 'slide') continue;
      const speechActions =
        splitLongSpeechActions(scene.actions || [], ttsProviderId).filter(
          (action): action is SpeechAction => action.type === 'speech' && Boolean(action.text?.trim()),
        ) ?? [];
      if (speechActions.length === 0) continue;
      slideOrdinal += 1;
      const readyLines = speechActions.filter((a) => Boolean(a.audioUrl)).length;
      const rawTitle = scene.title?.trim() || '';
      pages.push({
        displayIndex: slideOrdinal,
        title: rawTitle || (locale === 'zh-CN' ? `第 ${slideOrdinal} 页` : `Slide ${slideOrdinal}`),
        fullyReady: readyLines === speechActions.length,
      });
    }
    const totalPagesWithSpeech = pages.length;
    const readyPages = pages.filter((p) => p.fullyReady).length;
    const pendingPages = pages.filter((p) => !p.fullyReady);
    return { totalPagesWithSpeech, readyPages, pendingPages, pages };
  }, [scenes, ttsProviderId, locale]);

  const showSynthesizeAllSpeechButton =
    ttsEnabled &&
    ttsProviderId !== 'browser-native-tts' &&
    (allSpeechStats.missing > 0 || isSynthesizingAllSpeech);

  const exportWaitMessage = (() => {
    if (failedOutlines.length > 0) return t('export.waitSceneGenerationFailed');
    if (pendingOutlines.length > 0) return t('export.waitGeneratingFollowUp');
    if (scenes.length === 0) return t('export.waitNoScenes');
    return t('share.notReady');
  })();

  const exportWaitShowSpinner = pendingOutlines.length > 0;

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

  const speechPendingText =
    speechTtsBanner.variant === 'pending' ? t('stage.ttsSpeechPendingBanner') : '';

  const speechPendingTooltipText =
    speechTtsBanner.variant === 'pending'
      ? locale === 'zh-CN'
        ? `${t('stage.ttsSpeechPendingBannerTooltip')}（${speechTtsBanner.ready}/${speechTtsBanner.total}）`
        : `${t('stage.ttsSpeechPendingBannerTooltip')} (${speechTtsBanner.ready}/${speechTtsBanner.total})`
      : '';

  const headerTitleHtml = useMemo(
    () => renderPlainTitleWithOptionalLatex(currentSceneTitle || t('common.loading')),
    [currentSceneTitle, t],
  );

  const synthAllSpeechStatusText = (() => {
    if (synthAllSpeechProgress != null) {
      return locale === 'zh-CN'
        ? `合成中 ${synthAllSpeechProgress.done}/${synthAllSpeechProgress.total} 条`
        : `Generating ${synthAllSpeechProgress.done}/${synthAllSpeechProgress.total}`;
    }
    if (speechPagesBreakdown.totalPagesWithSpeech > 0) {
      const { readyPages, totalPagesWithSpeech } = speechPagesBreakdown;
      return locale === 'zh-CN'
        ? `合成全部语音（${readyPages}/${totalPagesWithSpeech} 页已就绪）`
        : `Synth all speech (${readyPages}/${totalPagesWithSpeech} slides ready)`;
    }
    return locale === 'zh-CN'
      ? `合成全部语音（${allSpeechStats.ready}/${allSpeechStats.total} 条已就绪）`
      : `Synth all speech (${allSpeechStats.ready}/${allSpeechStats.total} lines ready)`;
  })();

  const synthAllSpeechTooltipBody = useMemo(() => {
    const baseHint = t('stage.ttsSynthesizeAllButtonTooltip');
    if (speechPagesBreakdown.totalPagesWithSpeech === 0) {
      if (allSpeechStats.total === 0) return baseHint;
      return locale === 'zh-CN'
        ? `共 ${allSpeechStats.total} 条讲解语音，${allSpeechStats.ready} 条已合成。\n${baseHint}`
        : `${allSpeechStats.total} narration line(s); ${allSpeechStats.ready} ready.\n${baseHint}`;
    }
    const { readyPages, totalPagesWithSpeech, pendingPages } = speechPagesBreakdown;
    const head =
      locale === 'zh-CN'
        ? `共 ${totalPagesWithSpeech} 页幻灯片含讲解语音，${readyPages} 页已全部合成。`
        : `${totalPagesWithSpeech} slide(s) include narration; ${readyPages} fully synthesized.`;
    if (pendingPages.length === 0) {
      return `${head}\n${baseHint}`;
    }
    const maxLines = 14;
    const trunc = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`);
    const lines = pendingPages.slice(0, maxLines).map((p) =>
      locale === 'zh-CN'
        ? `· 第 ${p.displayIndex} 页：${trunc(p.title, 36)}`
        : `· Slide ${p.displayIndex}: ${trunc(p.title, 40)}`,
    );
    const more =
      pendingPages.length > maxLines
        ? locale === 'zh-CN'
          ? `\n…还有 ${pendingPages.length - maxLines} 页未列全`
          : `\n…+${pendingPages.length - maxLines} more`
        : '';
    const pendingHead = locale === 'zh-CN' ? '未就绪页面：' : 'Not ready:';
    return `${head}\n${pendingHead}\n${lines.join('\n')}${more}\n\n${baseHint}`;
  }, [allSpeechStats.ready, allSpeechStats.total, locale, speechPagesBreakdown, t]);

  const handleSynthesizeAllSpeech = useCallback(async () => {
    if (isSynthesizingAllSpeech) return;

    const settings = useSettingsStore.getState();
    if (!settings.ttsEnabled) {
      toast.info(
        locale === 'zh-CN'
          ? 'TTS 目前已关闭，开启后才能批量合成语音。'
          : 'TTS is currently disabled. Enable it before batch-generating speech.',
      );
      return;
    }
    if (settings.ttsProviderId === 'browser-native-tts') {
      toast.info(
        locale === 'zh-CN'
          ? '当前使用浏览器实时朗读，不需要批量预生成语音。'
          : 'Browser-native speech does not need batch pre-generation.',
      );
      return;
    }

    const orderedScenes = [...useStageStore.getState().scenes].sort((a, b) => a.order - b.order);
    const pendingScenes = orderedScenes
      .map((scene) => {
        const pendingCount = splitLongSpeechActions(scene.actions || [], settings.ttsProviderId).filter(
          (action): action is SpeechAction =>
            action.type === 'speech' && Boolean(action.text?.trim()) && !action.audioUrl,
        ).length;
        return { scene, pendingCount };
      })
      .filter((item) => item.pendingCount > 0);

    const total = pendingScenes.reduce((sum, item) => sum + item.pendingCount, 0);
    if (total === 0) {
      toast.success(
        locale === 'zh-CN'
          ? '当前所有已生成页面的语音都已就绪。'
          : 'Speech is already ready for all generated slides.',
      );
      return;
    }

    setIsSynthesizingAllSpeech(true);
    setSynthAllSpeechProgress({ done: 0, total });
    const loadingId = toast.loading(
      locale === 'zh-CN' ? `正在合成全部语音（0/${total}）…` : `Generating all speech (0/${total})…`,
    );

    let completed = 0;
    try {
      for (const { scene, pendingCount } of pendingScenes) {
        const result = await ensureMissingSpeechAudioForScene(scene, undefined, (done) => {
          const nextDone = completed + done;
          setSynthAllSpeechProgress({ done: nextDone, total });
          toast.loading(
            locale === 'zh-CN'
              ? `正在合成全部语音（${nextDone}/${total}）…`
              : `Generating all speech (${nextDone}/${total})…`,
            { id: loadingId },
          );
        });

        if (!result.ok) {
          throw new Error(result.error || 'Speech generation failed');
        }

        completed += pendingCount;
        setSynthAllSpeechProgress({ done: completed, total });
      }

      toast.success(
        locale === 'zh-CN'
          ? `全部语音已合成完成（${total}/${total}）。`
          : `All speech has been generated (${total}/${total}).`,
        { id: loadingId },
      );
    } catch (error) {
      toast.error(
        locale === 'zh-CN'
          ? `批量合成语音失败：${error instanceof Error ? error.message : '未知错误'}`
          : `Failed to generate all speech: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id: loadingId },
      );
    } finally {
      setIsSynthesizingAllSpeech(false);
      setSynthAllSpeechProgress(null);
    }
  }, [isSynthesizingAllSpeech, locale]);

  const metaChipsRow = (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
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
              {t('stage.ttsSpeechReadyBannerTooltip')}
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
              {speechPendingTooltipText}
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

        {showSynthesizeAllSpeechButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSynthesizeAllSpeech}
                disabled={isSynthesizingAllSpeech}
                className={cn(
                  'inline-flex max-w-[min(100%,420px)] items-center gap-1.5 rounded-lg px-2 py-1',
                  'border border-sky-200/80 bg-sky-50/90 text-[11px] font-medium leading-tight',
                  'text-sky-900 transition-colors hover:bg-sky-100/90',
                  'disabled:cursor-wait disabled:opacity-80',
                  'dark:border-sky-500/30 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:bg-sky-950/55',
                )}
              >
                {isSynthesizingAllSpeech ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : (
                  <Volume2 className="size-3 shrink-0" />
                )}
                <span className="min-w-0 truncate">{synthAllSpeechStatusText}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md whitespace-pre-line text-xs leading-relaxed">
              {synthAllSpeechTooltipBody}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );

  return (
    <>
      <header
        className={cn(
          'z-10 shrink-0 flex min-h-[4.5rem] items-center px-6 md:px-8',
          'border-b border-slate-900/[0.08] bg-white/70 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0d0d10]/55',
        )}
      >
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
              className={cn(
                'truncate text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-white',
                '[&_.katex]:text-[inherit] [&_.katex]:font-bold',
              )}
              suppressHydrationWarning
              dangerouslySetInnerHTML={{ __html: headerTitleHtml }}
            />
            <div className="min-w-0">{metaChipsRow}</div>
          </div>
          {titleActions ? <div className="shrink-0">{titleActions}</div> : null}
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
      </header>
    </>
  );
}
