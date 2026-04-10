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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useSettingsStore } from '@/lib/store/settings';
import { getSceneSpeechTtsBanner } from '@/lib/audio/speech-audio-readiness';
import { renderPlainTitleWithOptionalLatex } from '@/lib/render-html-with-latex';
import { ensureSpeechActionsHaveAudio } from '@/lib/hooks/use-scene-generator';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import type { SpeechAction } from '@/lib/types/action';
import { SpeechGenerationIndicator } from '@/components/audio/speech-generation-indicator';

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
    active: number;
    parallelism: number;
  } | null>(null);
  const [synthPickerOpen, setSynthPickerOpen] = useState(false);
  const [selectedSynthSceneIds, setSelectedSynthSceneIds] = useState<Set<string>>(() => new Set());
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
    scenes.length > 0 && pendingOutlines.length === 0 && failedOutlines.length === 0;

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
          (action): action is SpeechAction =>
            action.type === 'speech' && Boolean(action.text?.trim()),
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
          (action): action is SpeechAction =>
            action.type === 'speech' && Boolean(action.text?.trim()),
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

  /** 含讲解语音的场景列表（用于批量合成勾选）；含幻灯片页码与其它场景类型 */
  const synthSceneRows = useMemo(() => {
    const ordered = [...scenes].sort((a, b) => a.order - b.order);
    let slideOrdinal = 0;
    const rows: Array<{
      sceneId: string;
      primaryLabel: string;
      secondaryTitle: string;
      fullyReady: boolean;
      pendingCount: number;
      isSlide: boolean;
    }> = [];
    for (const scene of ordered) {
      const speechActions =
        splitLongSpeechActions(scene.actions || [], ttsProviderId).filter(
          (action): action is SpeechAction =>
            action.type === 'speech' && Boolean(action.text?.trim()),
        ) ?? [];
      if (speechActions.length === 0) continue;
      const pendingCount = speechActions.filter((a) => !a.audioUrl).length;
      const fullyReady = pendingCount === 0;
      const isSlide = scene.type === 'slide';
      if (isSlide) slideOrdinal += 1;
      const rawTitle = scene.title?.trim() || '';
      const typeLabel = (() => {
        switch (scene.type) {
          case 'slide':
            return locale === 'zh-CN' ? `第 ${slideOrdinal} 页` : `Slide ${slideOrdinal}`;
          case 'quiz':
            return t('stage.sceneType.quiz');
          case 'interactive':
            return t('stage.sceneType.interactive');
          case 'pbl':
            return t('stage.sceneType.pbl');
          default:
            return scene.type;
        }
      })();
      const primaryLabel = isSlide ? typeLabel : rawTitle || typeLabel;
      const secondaryTitle = isSlide && rawTitle ? rawTitle : '';
      rows.push({
        sceneId: scene.id,
        primaryLabel,
        secondaryTitle,
        fullyReady,
        pendingCount,
        isSlide,
      });
    }
    return rows;
  }, [scenes, ttsProviderId, locale, t]);

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
    if (synthAllSpeechProgress != null) return null;
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
    if (synthAllSpeechProgress != null) {
      return locale === 'zh-CN'
        ? `正在并行合成语音。\n已完成 ${synthAllSpeechProgress.done}/${synthAllSpeechProgress.total} 条，当前并行 ${synthAllSpeechProgress.active}/${synthAllSpeechProgress.parallelism} 路。\n\n${baseHint}`
        : `Speech generation is running in parallel.\nCompleted ${synthAllSpeechProgress.done}/${synthAllSpeechProgress.total}, with ${synthAllSpeechProgress.active}/${synthAllSpeechProgress.parallelism} active.\n\n${baseHint}`;
    }
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
    const lines = pendingPages
      .slice(0, maxLines)
      .map((p) =>
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
  }, [
    allSpeechStats.ready,
    allSpeechStats.total,
    locale,
    speechPagesBreakdown,
    synthAllSpeechProgress,
    t,
  ]);

  const openSynthPicker = useCallback(() => {
    const next = new Set(synthSceneRows.filter((r) => r.pendingCount > 0).map((r) => r.sceneId));
    setSelectedSynthSceneIds(next);
    setSynthPickerOpen(true);
  }, [synthSceneRows]);

  const runSynthesizeSpeechForScenes = useCallback(
    async (sceneIdFilter: Set<string>) => {
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
          const splitActions = splitLongSpeechActions(scene.actions || [], settings.ttsProviderId);
          const pendingCount = splitActions.filter(
            (action): action is SpeechAction =>
              action.type === 'speech' && Boolean(action.text?.trim()) && !action.audioUrl,
          ).length;
          return { scene, pendingCount };
        })
        .filter((item) => item.pendingCount > 0 && sceneIdFilter.has(item.scene.id));

      const total = pendingScenes.reduce((sum, item) => sum + item.pendingCount, 0);
      if (total === 0) {
        toast.success(
          locale === 'zh-CN'
            ? '所选范围内没有待合成的语音。'
            : 'No pending speech in the selected scenes.',
        );
        return;
      }

      setSynthPickerOpen(false);
      setIsSynthesizingAllSpeech(true);
      setSynthAllSpeechProgress({ done: 0, total, active: 0, parallelism: 0 });
      const loadingId = toast.loading(
        <SpeechGenerationIndicator
          label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
          done={0}
          total={total}
        />,
      );

      try {
        const pendingSpeechActions: SpeechAction[] = [];
        for (const { scene } of pendingScenes) {
          const splitActions = splitLongSpeechActions(scene.actions || [], settings.ttsProviderId);
          if (splitActions !== scene.actions) {
            scene.actions = splitActions;
          }
          pendingSpeechActions.push(
            ...splitActions.filter(
              (action): action is SpeechAction =>
                action.type === 'speech' && Boolean(action.text?.trim()) && !action.audioUrl,
            ),
          );
        }

        if (pendingSpeechActions.length === 0) {
          useStageStore.getState().touchScenes();
          toast.success(
            locale === 'zh-CN'
              ? '所选范围内没有待合成的语音。'
              : 'No pending speech in the selected scenes.',
            { id: loadingId },
          );
          return;
        }

        let lastDone = -1;
        useStageStore.getState().touchScenes();

        const result = await ensureSpeechActionsHaveAudio(
          pendingSpeechActions,
          undefined,
          ({ done, total: progressTotal, active, parallelism }) => {
            setSynthAllSpeechProgress({ done, total: progressTotal, active, parallelism });
            if (done !== lastDone) {
              lastDone = done;
              useStageStore.getState().touchScenes();
            }
            toast.loading(
              <SpeechGenerationIndicator
                label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
                done={done}
                total={progressTotal}
              />,
              { id: loadingId },
            );
          },
        );

        if (!result.ok) {
          throw new Error(result.error || 'Speech generation failed');
        }

        useStageStore.getState().touchScenes();
        toast.success(
          locale === 'zh-CN'
            ? `语音已合成完成（${total}/${total}）。`
            : `Speech generation finished (${total}/${total}).`,
          { id: loadingId },
        );
      } catch (error) {
        toast.error(
          locale === 'zh-CN'
            ? `批量合成语音失败：${error instanceof Error ? error.message : '未知错误'}`
            : `Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { id: loadingId },
        );
      } finally {
        setIsSynthesizingAllSpeech(false);
        setSynthAllSpeechProgress(null);
      }
    },
    [isSynthesizingAllSpeech, locale],
  );

  const handleSynthPickerConfirm = useCallback(() => {
    if (selectedSynthSceneIds.size === 0) {
      toast.info(t('stage.ttsSynthNoSelection'));
      return;
    }
    const anyPending = synthSceneRows.some(
      (r) => selectedSynthSceneIds.has(r.sceneId) && r.pendingCount > 0,
    );
    if (!anyPending) {
      toast.info(
        locale === 'zh-CN'
          ? '所选页面语音均已就绪。'
          : 'Selected scenes already have all speech ready.',
      );
      return;
    }
    void runSynthesizeSpeechForScenes(selectedSynthSceneIds);
  }, [locale, runSynthesizeSpeechForScenes, selectedSynthSceneIds, synthSceneRows, t]);

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
                onClick={openSynthPicker}
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
                {synthAllSpeechProgress ? (
                  <SpeechGenerationIndicator
                    label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
                    done={synthAllSpeechProgress.done}
                    total={synthAllSpeechProgress.total}
                    className="min-w-0 truncate"
                  />
                ) : (
                  <span className="min-w-0 truncate">{synthAllSpeechStatusText}</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-md whitespace-pre-line text-xs leading-relaxed"
            >
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

      <Dialog open={synthPickerOpen} onOpenChange={setSynthPickerOpen}>
        <DialogContent className="max-h-[min(90dvh,640px)] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
            <DialogTitle className="text-base">{t('stage.ttsSynthSelectDialogTitle')}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t('stage.ttsSynthSelectDialogHint')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 border-b border-border/40 px-5 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setSelectedSynthSceneIds(
                  new Set(synthSceneRows.filter((r) => r.pendingCount > 0).map((r) => r.sceneId)),
                );
              }}
            >
              {t('stage.ttsSynthSelectAllPending')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedSynthSceneIds(new Set())}
            >
              {t('stage.ttsSynthClearSelection')}
            </Button>
          </div>
          <div className="max-h-[min(52vh,420px)] overflow-y-auto px-3 py-2">
            {synthSceneRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {synthSceneRows.map((row) => {
                  const selectable = row.pendingCount > 0;
                  const checked = selectedSynthSceneIds.has(row.sceneId);
                  return (
                    <li key={row.sceneId}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition-colors',
                          selectable ? 'hover:bg-muted/50' : 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!selectable}
                          onCheckedChange={(v) => {
                            setSelectedSynthSceneIds((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(row.sceneId);
                              else next.delete(row.sceneId);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                          aria-label={row.primaryLabel}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {row.primaryLabel}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 text-[11px]',
                                row.fullyReady
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-sky-700 dark:text-sky-300',
                              )}
                            >
                              {row.fullyReady
                                ? t('stage.ttsSynthRowReady')
                                : t('stage.ttsSynthRowPending').replace(
                                    '{n}',
                                    String(row.pendingCount),
                                  )}
                            </span>
                          </div>
                          {row.secondaryTitle ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.secondaryTitle}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setSynthPickerOpen(false)}>
              {t('stage.ttsSynthCancel')}
            </Button>
            <Button type="button" onClick={handleSynthPickerConfirm}>
              {t('stage.ttsSynthConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
