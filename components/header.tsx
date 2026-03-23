'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, Download, FileDown, Package, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  const generatingOutlines = useStageStore((s) => s.generatingOutlines);
  const failedOutlines = useStageStore((s) => s.failedOutlines);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);

  const canExport =
    scenes.length > 0 &&
    generatingOutlines.length === 0 &&
    failedOutlines.length === 0 &&
    Object.values(mediaTasks).every((task) => task.status === 'done' || task.status === 'failed');

  const mediaBusy = Object.values(mediaTasks).some(
    (task) => task.status === 'pending' || task.status === 'generating',
  );

  const exportWaitMessage = (() => {
    if (generatingOutlines.length > 0) return t('export.waitGeneratingFollowUp');
    if (failedOutlines.length > 0) return t('export.waitSceneGenerationFailed');
    if (mediaBusy) return t('export.waitMedia');
    if (scenes.length === 0) return t('export.waitNoScenes');
    return t('share.notReady');
  })();

  const exportWaitShowSpinner = generatingOutlines.length > 0 || mediaBusy;

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
      <header className="h-20 px-8 flex items-center z-10 bg-transparent gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1 basis-0">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="shrink-0 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title={backTitle}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {viewToggle ? (
            <div className="shrink-0 flex items-center">{viewToggle}</div>
          ) : null}
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500 mb-0.5">
              {t('stage.currentScene')}
            </span>
            <h1
              className="text-xl font-bold text-gray-800 dark:text-gray-200 tracking-tight truncate"
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
                className="flex max-w-[min(100vw-10rem,320px)] items-center gap-2 rounded-full border border-gray-200/90 bg-gray-50/90 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300"
                role="status"
                title={exportWaitMessage}
              >
                {exportWaitShowSpinner ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500 dark:text-violet-400" />
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
                  'shrink-0 p-2 rounded-full transition-all',
                  canExport && !isExporting
                    ? 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50',
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
              <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[200px]">
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
