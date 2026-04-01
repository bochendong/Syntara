'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileImage, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  analyzePdfForSelection,
  buildInitialPdfSourceSelection,
  computePdfPageItemBytes,
  computePdfSourceSelectionEstimateBytes,
  getPdfSourceFileSignature,
  PDF_PAGE_SELECTION_MAX_BYTES,
  type PdfPageSelectionPreview,
  type PdfSourceSelection,
  type PdfPageImageMode,
} from '@/lib/pdf/page-selection';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

type CachedAnalysis = {
  previews: PdfPageSelectionPreview[];
  fileSignature: string;
};

export interface PdfPageSelectionDialogProps {
  open: boolean;
  file: File | null;
  language: 'zh-CN' | 'en-US';
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: PdfSourceSelection) => void;
}

export function PdfPageSelectionDialog({
  open,
  file,
  language,
  onOpenChange,
  onConfirm,
}: PdfPageSelectionDialogProps) {
  const cacheRef = useRef<Map<string, CachedAnalysis>>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pages, setPages] = useState<PdfPageSelectionPreview[]>([]);
  const [selection, setSelection] = useState<PdfSourceSelection | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open || !file) return;
    const fileSignature = getPdfSourceFileSignature(file);
    const cached = cacheRef.current.get(fileSignature);
    if (cached) {
      setPages(cached.previews);
      setSelection(
        buildInitialPdfSourceSelection({
          fileSignature,
          previews: cached.previews,
          maxContentBytes: PDF_PAGE_SELECTION_MAX_BYTES,
        }),
      );
      setAnalyzing(false);
      setAnalysisError(null);
      setAnalysisProgress(null);
      return;
    }

    const abortController = new AbortController();
    setAnalyzing(true);
    setAnalysisError(null);
    setPages([]);
    setSelection(null);
    setAnalysisProgress(null);

    void analyzePdfForSelection({
      file,
      signal: abortController.signal,
      onPage: (page, total) => {
        setPages((prev) => [...prev, page]);
        setAnalysisProgress({ current: page.pageNumber, total });
      },
    })
      .then((result) => {
        cacheRef.current.set(result.fileSignature, {
          previews: result.pages,
          fileSignature: result.fileSignature,
        });
        setPages(result.pages);
        setSelection(
          buildInitialPdfSourceSelection({
            fileSignature: result.fileSignature,
            previews: result.pages,
            maxContentBytes: PDF_PAGE_SELECTION_MAX_BYTES,
          }),
        );
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        setAnalysisError(
          error instanceof Error
            ? error.message
            : language === 'en-US'
              ? 'Failed to analyze PDF pages.'
              : '分析 PDF 页面失败。',
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setAnalyzing(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [file, language, open]);

  const selectedBytes = useMemo(
    () => (selection ? computePdfSourceSelectionEstimateBytes(selection) : 0),
    [selection],
  );
  const selectedCount = useMemo(
    () => selection?.pages.filter((page) => page.keep).length ?? 0,
    [selection],
  );
  const overLimit = selectedBytes > PDF_PAGE_SELECTION_MAX_BYTES;

  const updateSelection = (
    pageNumber: number,
    patch: Partial<{ keep: boolean; imageMode: PdfPageImageMode; keptImageKeys: string[] }>,
  ) => {
    setSelection((current) => {
      if (!current) return current;
      return {
        ...current,
        pages: current.pages.map((page) => {
          if (page.pageNumber !== pageNumber) return page;
          const preview = pages.find((item) => item.pageNumber === pageNumber);
          if (!preview) return { ...page, ...patch };

          const merged = { ...page, ...patch };
          let nextMode = merged.imageMode;
          let nextKeys = [...merged.keptImageKeys];

          if (preview.requiresScreenshotFallback) {
            nextMode = 'screenshot';
            nextKeys = [];
          } else if (patch.imageMode === 'direct' && patch.keptImageKeys === undefined) {
            if (page.imageMode === 'screenshot' || page.keptImageKeys.length === 0) {
              nextKeys = preview.images.map((im) => im.key);
            }
          }

          const estimatedBytes = computePdfPageItemBytes(preview, {
            hasImages: preview.hasImages,
            imageMode: nextMode,
            keptImageKeys: nextKeys,
          });

          return {
            ...page,
            ...patch,
            imageMode: nextMode,
            keptImageKeys: nextKeys,
            estimatedBytes,
          };
        }),
      };
    });
  };

  const togglePageImageKey = (pageNumber: number, imageKey: string, checked: boolean) => {
    setSelection((current) => {
      if (!current) return current;
      return {
        ...current,
        pages: current.pages.map((page) => {
          if (page.pageNumber !== pageNumber) return page;
          const preview = pages.find((item) => item.pageNumber === pageNumber);
          if (!preview) return page;
          const nextKeys = checked
            ? Array.from(new Set([...page.keptImageKeys, imageKey]))
            : page.keptImageKeys.filter((k) => k !== imageKey);
          const estimatedBytes = computePdfPageItemBytes(preview, {
            hasImages: preview.hasImages,
            imageMode: page.imageMode,
            keptImageKeys: nextKeys,
          });
          return { ...page, keptImageKeys: nextKeys, estimatedBytes };
        }),
      };
    });
  };

  const handleConfirm = () => {
    if (!selection || selectedCount === 0 || overLimit) return;
    onConfirm(selection);
  };

  const progressValue = Math.min(100, (selectedBytes / PDF_PAGE_SELECTION_MAX_BYTES) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] min-h-0 max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle className="text-lg">
            {language === 'en-US' ? 'Keep Only the Pages You Need' : '先挑出你真正想保留的页面'}
          </DialogTitle>
          <DialogDescription>
            {language === 'en-US'
              ? 'For large PDFs, choose which pages to keep before generation. Embedded images can be picked individually; otherwise use a full-page screenshot. Sizes shown match the actual upload payload.'
              : '大 PDF 在进入生成流程前，先挑出要保留的页面。可逐张勾选嵌入图，或改用整页截图；所示体积为实际上传数据大小，非估算。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-gutter:stable]">
          <div className="mb-4 rounded-2xl border bg-slate-50/70 p-4 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={overLimit ? 'destructive' : 'secondary'}>
                {language === 'en-US'
                  ? `${selectedCount} page(s) selected`
                  : `已选 ${selectedCount} 页`}
              </Badge>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {formatBytes(selectedBytes)} / {formatBytes(PDF_PAGE_SELECTION_MAX_BYTES)}
              </span>
              {overLimit ? (
                <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-300">
                  <AlertTriangle className="size-3.5" />
                  {language === 'en-US'
                    ? 'Too much content selected. Remove some pages or switch image-heavy pages to screenshots.'
                    : '当前保留内容超过上限，请取消一些页面，或把图片页改成整页截图。'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5" />
                  {language === 'en-US'
                    ? 'Within the recommended 4.5 MB content budget.'
                    : '当前保留内容在推荐的 4.5MB 范围内。'}
                </span>
              )}
            </div>
            <Progress className="mt-3 h-2" value={progressValue} />
          </div>

          {analyzing ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed">
              <Loader2 className="size-8 animate-spin text-slate-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {language === 'en-US' ? 'Analyzing PDF pages…' : '正在分析 PDF 页面…'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {analysisProgress
                    ? language === 'en-US'
                      ? `Page ${analysisProgress.current} / ${analysisProgress.total}`
                      : `第 ${analysisProgress.current} / ${analysisProgress.total} 页`
                    : language === 'en-US'
                      ? 'Generating thumbnails and measuring actual payload sizes.'
                      : '正在生成缩略图并测量各页实际上传体积。'}
                </p>
              </div>
            </div>
          ) : analysisError ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/70 px-6 text-center dark:border-rose-500/20 dark:bg-rose-950/20">
              <AlertTriangle className="size-8 text-rose-600 dark:text-rose-300" />
              <p className="mt-3 text-sm font-medium text-rose-900 dark:text-rose-100">
                {language === 'en-US' ? 'PDF page analysis failed.' : 'PDF 页面分析失败。'}
              </p>
              <p className="mt-1 text-xs leading-6 text-rose-700 dark:text-rose-200">{analysisError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 pr-1 sm:grid-cols-2 lg:grid-cols-4">
              {pages.map((preview) => {
                const selected = selection?.pages.find((page) => page.pageNumber === preview.pageNumber);
                const currentMode = selected?.imageMode || preview.recommendedImageMode;
                const currentBytes = selected
                  ? computePdfPageItemBytes(preview, {
                      hasImages: preview.hasImages,
                      imageMode: currentMode,
                      keptImageKeys: selected.keptImageKeys,
                    })
                  : computePdfPageItemBytes(preview, {
                      hasImages: preview.hasImages,
                      imageMode: preview.recommendedImageMode,
                      keptImageKeys:
                        preview.recommendedImageMode === 'screenshot'
                          ? []
                          : preview.images.map((im) => im.key),
                    });

                return (
                  <div
                    key={preview.pageNumber}
                    className={cn(
                      'rounded-2xl border p-3 transition-colors',
                      selected?.keep
                        ? 'border-violet-300 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-950/20'
                        : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]',
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <label className="flex min-w-0 flex-1 items-start gap-2">
                        <Checkbox
                          checked={selected?.keep === true}
                          onCheckedChange={(checked) =>
                            updateSelection(preview.pageNumber, { keep: checked === true })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {language === 'en-US' ? `Page ${preview.pageNumber}` : `第 ${preview.pageNumber} 页`}
                            </p>
                            {preview.hasImages ? (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                <FileImage className="size-3" />
                                {preview.requiresScreenshotFallback
                                  ? language === 'en-US'
                                    ? 'Screenshot page'
                                    : '整页截图'
                                  : language === 'en-US'
                                    ? `${preview.imageCount} image${preview.imageCount > 1 ? 's' : ''}`
                                    : `${preview.imageCount} 张嵌入图`}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {language === 'en-US' ? 'Text page' : '文字页'}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {language === 'en-US' ? 'Retained payload size' : '保留体积（实测）'}:{' '}
                            {formatBytes(currentBytes)}
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* ISO A4 竖版 210×297mm，与常见 PDF 页面宽高比一致 */}
                    <div className="relative w-full overflow-hidden rounded-xl border bg-slate-100 aspect-[210/297] dark:bg-slate-900/60">
                      {preview.thumbnailSrc ? (
                        <img
                          src={preview.thumbnailSrc}
                          alt={language === 'en-US' ? `Preview of page ${preview.pageNumber}` : `第 ${preview.pageNumber} 页预览`}
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-slate-500">
                          {language === 'en-US' ? 'Thumbnail unavailable' : '暂时无法生成缩略图'}
                        </div>
                      )}
                    </div>

                    <p className="mt-3 line-clamp-3 text-xs leading-6 text-slate-600 dark:text-slate-300">
                      {preview.textPreview}
                    </p>

                    {preview.hasImages && preview.requiresScreenshotFallback ? (
                      <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/25 dark:text-amber-100">
                        {language === 'en-US'
                          ? 'This page uses inline or masked images. Only a full-page screenshot can be sent (size shown above).'
                          : '本页为内联图或遮罩贴图等，无法单独抽出文件，将只发送整页截图（体积见上）。'}
                      </div>
                    ) : null}

                    {preview.hasImages && !preview.requiresScreenshotFallback ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {language === 'en-US' ? 'Image handling for this page' : '这一页的图片处理方式'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSelection(preview.pageNumber, { imageMode: 'direct' })
                            }
                            className={cn(
                              'rounded-xl border px-3 py-2 text-left text-[11px] transition-colors',
                              currentMode === 'direct'
                                ? 'border-violet-300 bg-violet-100/80 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-100'
                                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-transparent',
                            )}
                          >
                            <div className="font-medium">
                              {language === 'en-US' ? 'Embedded images' : '嵌入图（可逐张勾选）'}
                            </div>
                            <div className="mt-1 text-[10px] opacity-70">
                              {formatBytes(
                                preview.textBytes +
                                  preview.images.reduce((s, im) => s + im.payloadBytes, 0),
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelection(preview.pageNumber, { imageMode: 'screenshot' })
                            }
                            className={cn(
                              'rounded-xl border px-3 py-2 text-left text-[11px] transition-colors',
                              currentMode === 'screenshot'
                                ? 'border-violet-300 bg-violet-100/80 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-100'
                                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-transparent',
                            )}
                          >
                            <div className="font-medium">
                              {language === 'en-US' ? 'Page screenshot' : '整页截图'}
                            </div>
                            <div className="mt-1 text-[10px] opacity-70">
                              {formatBytes(preview.textBytes + preview.screenshotPayloadBytes)}
                            </div>
                          </button>
                        </div>

                        {preview.images.length > 0 && currentMode === 'direct' && selected ? (
                          <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="px-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              {language === 'en-US' ? 'Keep which images' : '保留哪些图'}
                            </p>
                            {preview.images.map((im, idx) => {
                              const checked = selected.keptImageKeys.includes(im.key);
                              return (
                                <label
                                  key={im.key}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/80 dark:hover:bg-white/[0.06]"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      togglePageImageKey(preview.pageNumber, im.key, v === true)
                                    }
                                  />
                                  <span className="min-w-0 flex-1 text-[10px] text-slate-700 dark:text-slate-200">
                                    #{idx + 1} · {im.width}×{im.height}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-500">
                                    {formatBytes(im.payloadBytes)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {language === 'en-US' ? 'Cancel' : '取消'}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={analyzing || !!analysisError || !selection || selectedCount === 0 || overLimit}
          >
            {language === 'en-US' ? 'Use Selected Pages' : '按这些页面继续'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
