'use client';

import { createLogger } from '@/lib/logger';

const log = createLogger('PDFPageSelection');

export const PDF_PAGE_SELECTION_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
const THUMBNAIL_WIDTH = 320;

/** 与解析上传时整页导出宽度一致，用于实际字节统计 */
export const PDF_SELECTION_SCREENSHOT_WIDTH = 1280;

const IMAGE_OP_KEYS = [
  'paintImageXObject',
  'paintInlineImageXObject',
  'paintImageXObjectRepeat',
  'paintImageMaskXObject',
  'paintImageMaskXObjectGroup',
  'paintImageMaskXObjectRepeat',
] as const;

export type PdfPageImageMode = 'direct' | 'screenshot';

export interface PdfEmbeddedImagePreview {
  key: string;
  width: number;
  height: number;
  /** PNG data URL 解码后体积（与 parse 上传一致） */
  payloadBytes: number;
}

export interface PdfPageSelectionPreview {
  pageNumber: number;
  thumbnailSrc: string;
  textPreview: string;
  hasImages: boolean;
  imageCount: number;
  textBytes: number;
  images: PdfEmbeddedImagePreview[];
  /** 算符上有贴图类绘制，但未能解出嵌入图，只能整页截图 */
  requiresScreenshotFallback: boolean;
  /** 固定宽度整页 PNG data URL 的实际字节数 */
  screenshotPayloadBytes: number;
  recommendedImageMode: PdfPageImageMode;
}

export interface PdfPageSelectionItem {
  pageNumber: number;
  keep: boolean;
  hasImages: boolean;
  imageMode: PdfPageImageMode;
  /** direct 模式下保留的嵌入图 key；截图模式忽略 */
  keptImageKeys: string[];
  estimatedBytes: number;
}

export interface PdfSourceSelection {
  type: 'pdf';
  fileSignature: string;
  maxContentBytes: number;
  pages: PdfPageSelectionItem[];
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

/** PNG data URL 解码后的近似字节数（与上传 payload 一致） */
export function pdfDataUrlByteLength(src: string): number {
  const base64 = src.split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function rawPdfExtractedImageToDataUrl(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const rgba = new Uint8ClampedArray(image.width * image.height * 4);
  if (image.channels === 4) {
    rgba.set(image.data);
  } else if (image.channels === 3) {
    for (let src = 0, dst = 0; src < image.data.length; src += 3, dst += 4) {
      rgba[dst] = image.data[src];
      rgba[dst + 1] = image.data[src + 1];
      rgba[dst + 2] = image.data[src + 2];
      rgba[dst + 3] = 255;
    }
  } else {
    for (let src = 0, dst = 0; src < image.data.length; src += 1, dst += 4) {
      const value = image.data[src];
      rgba[dst] = value;
      rgba[dst + 1] = value;
      rgba[dst + 2] = value;
      rgba[dst + 3] = 255;
    }
  }

  context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function buildTextPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '本页没有可提取的正文。';
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 119).trimEnd()}…`;
}

export function getPdfSourceFileSignature(file: File): string {
  return [file.name, file.size, file.lastModified].join(':');
}

export function computePdfPageItemBytes(
  preview: PdfPageSelectionPreview,
  item: Pick<PdfPageSelectionItem, 'hasImages' | 'imageMode' | 'keptImageKeys'>,
): number {
  let bytes = preview.textBytes;
  if (!preview.hasImages || !item.hasImages) return bytes;
  if (item.imageMode === 'screenshot') {
    return bytes + preview.screenshotPayloadBytes;
  }
  const allowed = new Set(item.keptImageKeys);
  bytes += preview.images.filter((im) => allowed.has(im.key)).reduce((s, im) => s + im.payloadBytes, 0);
  return bytes;
}

export function computePdfSourceSelectionEstimateBytes(selection: PdfSourceSelection): number {
  return selection.pages.filter((page) => page.keep).reduce((sum, page) => sum + page.estimatedBytes, 0);
}

export function buildInitialPdfSourceSelection(args: {
  fileSignature: string;
  previews: PdfPageSelectionPreview[];
  maxContentBytes?: number;
}): PdfSourceSelection {
  const maxContentBytes = args.maxContentBytes ?? PDF_PAGE_SELECTION_MAX_BYTES;
  let running = 0;

  const pages = args.previews.map((preview) => {
    let imageMode: PdfPageImageMode = preview.recommendedImageMode;
    let keptImageKeys: string[] = [];

    if (!preview.hasImages) {
      imageMode = 'direct';
      keptImageKeys = [];
    } else if (preview.requiresScreenshotFallback) {
      imageMode = 'screenshot';
      keptImageKeys = [];
    } else {
      keptImageKeys = preview.images.map((i) => i.key);
    }

    const estimatedBytes = computePdfPageItemBytes(preview, {
      hasImages: preview.hasImages,
      imageMode,
      keptImageKeys,
    });

    const keep = running + estimatedBytes <= maxContentBytes;
    if (keep) running += estimatedBytes;

    return {
      pageNumber: preview.pageNumber,
      keep,
      hasImages: preview.hasImages,
      imageMode,
      keptImageKeys,
      estimatedBytes,
    } satisfies PdfPageSelectionItem;
  });

  return {
    type: 'pdf',
    fileSignature: args.fileSignature,
    maxContentBytes,
    pages,
  };
}

async function pageHasRasterPaintOperators(
  pdf: Awaited<ReturnType<(typeof import('unpdf'))['getDocumentProxy']>>,
  pageNumber: number,
): Promise<boolean> {
  const page = await pdf.getPage(pageNumber);
  const operatorList = await page.getOperatorList();
  const { getResolvedPDFJS } = await import('unpdf');
  const { OPS } = await getResolvedPDFJS();
  const opValues = new Set<number>();
  for (const name of IMAGE_OP_KEYS) {
    const v = OPS[name as keyof typeof OPS];
    if (typeof v === 'number') opValues.add(v);
  }
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (opValues.has(operatorList.fnArray[i])) return true;
  }
  return false;
}

export async function analyzePdfForSelection(args: {
  file: File;
  signal?: AbortSignal;
  onPage?: (page: PdfPageSelectionPreview, totalPages: number) => void;
}): Promise<{
  fileSignature: string;
  pages: PdfPageSelectionPreview[];
}> {
  if (typeof window === 'undefined') {
    throw new Error('PDF page analysis is only available in the browser.');
  }

  const fileSignature = getPdfSourceFileSignature(args.file);
  const [{ getDocumentProxy, extractText, extractImages, renderPageAsImage }, arrayBuffer] =
    await Promise.all([import('unpdf'), args.file.arrayBuffer()]);
  throwIfAborted(args.signal);

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [];
  const pages: PdfPageSelectionPreview[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    throwIfAborted(args.signal);

    const pageText = pageTexts[pageNumber - 1] || '';
    let thumbnailSrc = '';
    let extractedImages: Awaited<ReturnType<typeof extractImages>> = [];
    let operatorHasRaster = false;

    try {
      thumbnailSrc = await renderPageAsImage(pdf, pageNumber, {
        toDataURL: true,
        width: THUMBNAIL_WIDTH,
      });
    } catch (error) {
      log.warn('Failed to render thumbnail for PDF page selection', {
        pageNumber,
        fileName: args.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      extractedImages = await extractImages(pdf, pageNumber);
    } catch (error) {
      log.warn('Failed to inspect images for PDF page selection', {
        pageNumber,
        fileName: args.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      operatorHasRaster = await pageHasRasterPaintOperators(pdf, pageNumber);
    } catch (error) {
      log.warn('Failed to scan operators for raster paints', {
        pageNumber,
        fileName: args.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const requiresScreenshotFallback = operatorHasRaster && extractedImages.length === 0;
    const hasImages = extractedImages.length > 0 || operatorHasRaster;
    const textBytes = new TextEncoder().encode(pageText).length;

    const images: PdfEmbeddedImagePreview[] = extractedImages.map((image) => {
      const dataUrl = rawPdfExtractedImageToDataUrl(image);
      return {
        key: image.key,
        width: image.width,
        height: image.height,
        payloadBytes: pdfDataUrlByteLength(dataUrl),
      };
    });

    let screenshotPayloadBytes = 0;
    if (hasImages) {
      try {
        const fullSrc = await renderPageAsImage(pdf, pageNumber, {
          toDataURL: true,
          width: PDF_SELECTION_SCREENSHOT_WIDTH,
        });
        screenshotPayloadBytes = pdfDataUrlByteLength(fullSrc);
      } catch (error) {
        log.warn('Failed to render full-width page for size measurement', {
          pageNumber,
          fileName: args.file.name,
          error: error instanceof Error ? error.message : String(error),
        });
        screenshotPayloadBytes = thumbnailSrc ? pdfDataUrlByteLength(thumbnailSrc) : 0;
      }
    }

    const directTotal = images.reduce((s, im) => s + im.payloadBytes, 0);
    let recommendedImageMode: PdfPageImageMode = 'direct';
    if (requiresScreenshotFallback) {
      recommendedImageMode = 'screenshot';
    } else if (images.length > 0) {
      recommendedImageMode =
        screenshotPayloadBytes > 0 && screenshotPayloadBytes < directTotal ? 'screenshot' : 'direct';
    }

    const imageCount = images.length > 0 ? images.length : requiresScreenshotFallback ? 1 : 0;

    const preview: PdfPageSelectionPreview = {
      pageNumber,
      thumbnailSrc,
      textPreview: buildTextPreview(pageText),
      hasImages,
      imageCount,
      textBytes,
      images,
      requiresScreenshotFallback,
      screenshotPayloadBytes,
      recommendedImageMode,
    };
    pages.push(preview);
    args.onPage?.(preview, totalPages);
  }

  return { fileSignature, pages };
}
