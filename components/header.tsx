'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, Download, FileDown, Package, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useExportPPTX } from '@/lib/export/use-export-pptx';

interface HeaderProps {
  readonly currentSceneTitle: string;
  /** 播放模式下与右侧下载按钮并排（音量、倍速、翻页等） */
  readonly centerSlot?: ReactNode;
  /** 例如 PPT / 测验 / 原始数据 — 渲染在顶栏左侧（返回与标题之间） */
  readonly viewToggle?: ReactNode;
}

export function Header({ currentSceneTitle, centerSlot, viewToggle }: HeaderProps) {
  const { t } = useI18n();
  const router = useRouter();

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

  return (
    <>
      <header
        className={cn(
          'h-20 px-6 md:px-8 flex items-center z-10 gap-4 shrink-0',
          'border-b border-slate-900/[0.08] bg-white/70 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0d0d10]/55',
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 basis-0">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="shrink-0 rounded-[12px] p-2 text-[#86868b] transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-[#a1a1a6] dark:hover:bg-white/[0.06] dark:hover:text-white"
            title={backTitle}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {viewToggle ? (
            <div className="shrink-0 flex items-center">{viewToggle}</div>
          ) : null}
          <div className="flex flex-col min-w-0">
            <span className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-[#86868b] dark:text-[#a1a1a6]">
              {t('stage.currentScene')}
            </span>
            <h1
              className="truncate text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-white"
              suppressHydrationWarning
            >
              {currentSceneTitle || t('common.loading')}
            </h1>
          </div>
        </div>

        {/* 播放控制 + 导出 — 同列靠右 */}
        <div className="ml-auto flex items-center gap-3 shrink-0 min-w-0">
          {centerSlot ? (
            <div className="shrink-0 flex items-center max-w-[min(100vw-12rem,520px)] min-w-0 overflow-x-auto">
              {centerSlot}
            </div>
          ) : null}
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
