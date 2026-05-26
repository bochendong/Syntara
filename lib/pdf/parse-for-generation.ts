'use client';

import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { createLogger } from '@/lib/logger';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ImageMapping, PdfImage } from '@/lib/types/generation';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { loadImageMapping, storeImages } from '@/lib/utils/image-storage';
import {
  getPdfSourceFileSignature,
  pdfDataUrlByteLength,
  rawPdfExtractedImageToDataUrl,
  PDF_SELECTION_SCREENSHOT_WIDTH,
  type PdfSourceSelection,
} from '@/lib/pdf/page-selection';

const log = createLogger('PDFGenerationParse');

const SERVERLESS_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
const VISUAL_REGION_RENDER_WIDTH = 1024;
const VISUAL_REGION_CELL_SIZE = 8;
const VISUAL_REGION_DILATE_RADIUS = 2;
const VISUAL_REGION_MAX_PER_PAGE = 6;
const VISUAL_REGION_MIN_WIDTH = 90;
const VISUAL_REGION_MIN_HEIGHT = 70;
const VISUAL_REGION_MAX_TOTAL = 80;

type Language = 'zh-CN' | 'en-US';
export type PdfImageCaptureMode = 'embedded-images' | 'embedded-image-pages' | 'all-pages';

type RawPdfImageMeta = {
  id: string;
  src: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
};

type VisualRegionCandidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function buildPayloadTooLargeWarning(language: Language): string {
  return language === 'en-US'
    ? 'This PDF is larger than the current deployment platform can send to /api/parse-pdf (about 4.5 MB). Switched to in-browser parsing automatically. This fallback keeps text and will capture full-page screenshots for image-heavy pages when available.'
    : '这个 PDF 超过了当前部署平台可直接发送到 /api/parse-pdf 的大小限制（约 4.5MB），系统已自动切换为浏览器本地解析。本次会保留文本内容，并在可能时优先截取含图片页的整页截图。';
}

function buildPayloadTooLargeFailureMessage(language: Language, detail?: string): string {
  const suffix = detail?.trim() ? ` ${detail.trim()}` : '';
  return language === 'en-US'
    ? `The PDF is too large for the current deployment platform to send to /api/parse-pdf (about 4.5 MB), and the browser fallback parser also failed.${suffix}`
    : `这个 PDF 超过了当前部署平台可直接发送到 /api/parse-pdf 的大小限制（约 4.5MB），而且浏览器本地兜底解析也失败了。${suffix}`;
}

function buildTextTruncatedWarning(language: Language): string {
  return language === 'en-US'
    ? `Text was truncated to the first ${MAX_PDF_CONTENT_CHARS} characters.`
    : `正文已截断至前 ${MAX_PDF_CONTENT_CHARS} 字符`;
}

function buildImageTruncatedWarning(language: Language, kept: number, total: number): string {
  return language === 'en-US'
    ? `Image count was truncated: keeping ${kept} / ${total}.`
    : `图片数量已截断：保留 ${kept} / ${total} 张`;
}

function buildVisualRegionWarning(language: Language, count: number): string {
  return language === 'en-US'
    ? `Also detected ${count} visual region(s) from rendered PDF pages.`
    : `已额外从 PDF 页面中裁出 ${count} 个图形区域。`;
}

function buildSelectionTooLargeMessage(language: Language): string {
  return language === 'en-US'
    ? 'The pages you kept still exceed the 4.5 MB content budget. Remove some pages or switch image-heavy pages to screenshots.'
    : '你保留的页面内容仍然超过 4.5MB 上限，请继续减少页面，或把重图片页切换成整页截图。';
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isVisualInkPixel(data: Uint8ClampedArray, index: number): boolean {
  const alpha = data[index + 3];
  if (alpha < 32) return false;

  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  if (luminance > 245 && chroma < 30) return false;
  if (luminance > 226 && chroma < 18) return false;
  if (luminance > 192 && chroma < 8) return false;

  return luminance < 226 || chroma > 34;
}

function findVisualRegionCandidates(imageData: ImageData): VisualRegionCandidate[] {
  const { data, width, height } = imageData;
  const cellSize = VISUAL_REGION_CELL_SIZE;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const marked = new Uint8Array(cols * rows);
  const active = new Uint8Array(cols * rows);

  for (let y = 0; y < height; y += 2) {
    const rowOffset = y * width * 4;
    const gridY = Math.floor(y / cellSize);
    for (let x = 0; x < width; x += 2) {
      const pixelIndex = rowOffset + x * 4;
      if (!isVisualInkPixel(data, pixelIndex)) continue;
      const gridX = Math.floor(x / cellSize);
      marked[gridY * cols + gridX] = 1;
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!marked[y * cols + x]) continue;
      for (let dy = -VISUAL_REGION_DILATE_RADIUS; dy <= VISUAL_REGION_DILATE_RADIUS; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= rows) continue;
        for (let dx = -VISUAL_REGION_DILATE_RADIUS; dx <= VISUAL_REGION_DILATE_RADIUS; dx += 1) {
          const nextX = x + dx;
          if (nextX < 0 || nextX >= cols) continue;
          active[nextY * cols + nextX] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(cols * rows);
  const candidates: VisualRegionCandidate[] = [];
  const stack: number[] = [];
  const rowInkCounts = new Map<number, number>();

  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) continue;

    let minX = cols;
    let maxX = 0;
    let minY = rows;
    let maxY = 0;
    let activeCells = 0;
    let inkCells = 0;
    rowInkCounts.clear();
    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const cell = stack.pop()!;
      const x = cell % cols;
      const y = Math.floor(cell / cols);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      activeCells += 1;
      if (marked[cell]) {
        inkCells += 1;
        rowInkCounts.set(y, (rowInkCounts.get(y) || 0) + 1);
      }

      const neighbors = [cell - 1, cell + 1, cell - cols, cell + cols];
      for (const next of neighbors) {
        if (next < 0 || next >= active.length || visited[next] || !active[next]) continue;
        const nextX = next % cols;
        if ((next === cell - 1 && nextX !== x - 1) || (next === cell + 1 && nextX !== x + 1)) {
          continue;
        }
        visited[next] = 1;
        stack.push(next);
      }
    }

    const pad = cellSize * 2;
    const x = Math.max(0, minX * cellSize - pad);
    const y = Math.max(0, minY * cellSize - pad);
    const right = Math.min(width, (maxX + 1) * cellSize + pad);
    const bottom = Math.min(height, (maxY + 1) * cellSize + pad);
    const boxWidth = right - x;
    const boxHeight = bottom - y;
    const boxArea = boxWidth * boxHeight;
    const pageArea = width * height;
    const boxCols = Math.max(1, maxX - minX + 1);
    const boxRows = Math.max(1, maxY - minY + 1);
    const occupancy = inkCells / Math.max(1, boxCols * boxRows);
    const rowCoverage = rowInkCounts.size / boxRows;
    const aspectRatio = boxWidth / Math.max(1, boxHeight);

    if (boxWidth < VISUAL_REGION_MIN_WIDTH || boxHeight < VISUAL_REGION_MIN_HEIGHT) continue;
    if (boxArea < 13000 || boxArea > pageArea * 0.62) continue;
    if (inkCells < 12 || activeCells < 18) continue;
    if (occupancy < 0.025 || rowCoverage < 0.16) continue;
    if (y < height * 0.1 && boxHeight < height * 0.12) continue;
    if (y > height * 0.86) continue;
    if (aspectRatio > 9 && boxHeight < 140) continue;

    candidates.push({
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      score: boxArea * Math.min(occupancy, 0.4) * Math.min(rowCoverage, 1),
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, VISUAL_REGION_MAX_PER_PAGE)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function cropCanvasRegionToDataUrl(
  canvas: HTMLCanvasElement,
  region: VisualRegionCandidate,
): string {
  const target = document.createElement('canvas');
  target.width = Math.max(1, Math.round(region.width));
  target.height = Math.max(1, Math.round(region.height));
  const targetContext = target.getContext('2d');
  if (!targetContext) throw new Error('无法创建图形区域裁剪画布');
  targetContext.fillStyle = '#ffffff';
  targetContext.fillRect(0, 0, target.width, target.height);
  targetContext.drawImage(
    canvas,
    Math.round(region.x),
    Math.round(region.y),
    Math.round(region.width),
    Math.round(region.height),
    0,
    0,
    target.width,
    target.height,
  );
  return target.toDataURL('image/jpeg', 0.9);
}

async function extractPdfVisualRegionsInBrowser(args: {
  file: File;
  language: Language;
  signal?: AbortSignal;
  pageNumbers?: number[];
}): Promise<RawPdfImageMeta[]> {
  if (typeof window === 'undefined') return [];

  throwIfAborted(args.signal);
  const [{ getDocumentProxy }, arrayBuffer] = await Promise.all([
    import('unpdf'),
    args.file.arrayBuffer(),
  ]);
  throwIfAborted(args.signal);

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const totalPages = pdf.numPages || 0;
  const requestedPages =
    args.pageNumbers && args.pageNumbers.length > 0
      ? args.pageNumbers.filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
      : Array.from({ length: totalPages }, (_, index) => index + 1);
  const images: RawPdfImageMeta[] = [];

  for (const pageNumber of requestedPages) {
    if (images.length >= VISUAL_REGION_MAX_TOTAL) break;
    throwIfAborted(args.signal);

    try {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = VISUAL_REGION_RENDER_WIDTH / Math.max(1, baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const canvasContext = canvas.getContext('2d', { alpha: false });
      if (!canvasContext) continue;
      canvasContext.fillStyle = '#ffffff';
      canvasContext.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext, viewport }).promise;
      throwIfAborted(args.signal);

      const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
      const regions = findVisualRegionCandidates(imageData);

      regions.forEach((region, index) => {
        if (images.length >= VISUAL_REGION_MAX_TOTAL) return;
        const src = cropCanvasRegionToDataUrl(canvas, region);
        images.push({
          id: `region_p${pageNumber}_${index + 1}`,
          src,
          pageNumber,
          description:
            args.language === 'en-US'
              ? `Visual region automatically cropped from PDF page ${pageNumber}.`
              : `从 PDF 第 ${pageNumber} 页自动裁出的图形区域。`,
          width: Math.round(region.width),
          height: Math.round(region.height),
        });
      });
    } catch (error) {
      log.warn('Failed to extract visual regions from rendered PDF page', {
        fileName: args.file.name,
        pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return images;
}

async function readServerErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (data?.error?.trim()) return data.error.trim();
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}

async function parsePdfLocallyInBrowser(
  file: File,
  language: Language,
  signal?: AbortSignal,
  imageLimit: number | null = MAX_VISION_IMAGES,
  imageCaptureMode: PdfImageCaptureMode = 'embedded-images',
): Promise<ParsedPdfContent> {
  if (typeof window === 'undefined') {
    throw new Error('Browser PDF fallback is only available in the browser.');
  }

  throwIfAborted(signal);
  const [{ getDocumentProxy, extractText, extractImages, renderPageAsImage }, arrayBuffer] =
    await Promise.all([import('unpdf'), file.arrayBuffer()]);
  throwIfAborted(signal);

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  throwIfAborted(signal);

  const pdfImagesMeta: Array<{
    id: string;
    src: string;
    pageNumber: number;
    description?: string;
    width?: number;
    height?: number;
  }> = [];
  let imagePageCount = 0;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    throwIfAborted(signal);

    if (imageCaptureMode === 'embedded-images') {
      let extractedOnPage: Awaited<ReturnType<typeof extractImages>> = [];
      try {
        extractedOnPage = await extractImages(pdf, pageNumber);
      } catch (error) {
        log.warn('Failed to extract embedded PDF images during browser parsing', {
          fileName: file.name,
          pageNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (extractedOnPage.length === 0) continue;
      imagePageCount += extractedOnPage.length;

      for (const rawImage of extractedOnPage) {
        throwIfAborted(signal);
        if (imageLimit !== null && pdfImagesMeta.length >= imageLimit) continue;
        try {
          const src = rawPdfExtractedImageToDataUrl(rawImage);
          pdfImagesMeta.push({
            id: `img_${pdfImagesMeta.length + 1}`,
            src,
            pageNumber,
            description:
              language === 'en-US'
                ? `Image extracted directly from PDF page ${pageNumber}.`
                : `直接从 PDF 第 ${pageNumber} 页提取的图片。`,
            width: rawImage.width,
            height: rawImage.height,
          });
        } catch (error) {
          log.warn('Failed to convert embedded PDF image during browser parsing', {
            fileName: file.name,
            pageNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      continue;
    }

    if (imageCaptureMode === 'embedded-image-pages') {
      let extractedOnPage: Awaited<ReturnType<typeof extractImages>> = [];
      try {
        extractedOnPage = await extractImages(pdf, pageNumber);
      } catch (error) {
        log.warn('Failed to inspect PDF page for embedded images during browser fallback', {
          fileName: file.name,
          pageNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (extractedOnPage.length === 0) continue;
    }

    imagePageCount += 1;
    if (imageLimit !== null && pdfImagesMeta.length >= imageLimit) continue;

    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const aspectRatio =
        viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1.7778;
      const src = await renderPageAsImage(pdf, pageNumber, {
        toDataURL: true,
        width: PDF_SELECTION_SCREENSHOT_WIDTH,
      });
      pdfImagesMeta.push({
        id: `img_${pdfImagesMeta.length + 1}`,
        src,
        pageNumber,
        description:
          language === 'en-US'
            ? `Full-page screenshot of PDF page ${pageNumber}.`
            : `PDF 第 ${pageNumber} 页整页截图。`,
        width: PDF_SELECTION_SCREENSHOT_WIDTH,
        height: Math.round(PDF_SELECTION_SCREENSHOT_WIDTH / Math.max(aspectRatio, 0.1)),
      });
    } catch (error) {
      log.warn('Failed to capture PDF page screenshot during browser fallback', {
        fileName: file.name,
        pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    text,
    images: pdfImagesMeta.map((img) => img.src),
    metadata: {
      pageCount: totalPages,
      parser:
        pdfImagesMeta.length > 0
          ? imageCaptureMode === 'all-pages'
            ? 'browser-unpdf-all-page-screenshots'
            : 'browser-unpdf-with-page-screenshots'
          : 'browser-unpdf-text-only',
      fileName: file.name,
      fileSize: file.size,
      pdfImages: pdfImagesMeta,
      imageMapping: Object.fromEntries(pdfImagesMeta.map((img) => [img.id, img.src])),
      imagePageCount,
    },
  };
}

async function parsePdfLocallyWithSelection(
  file: File,
  selection: PdfSourceSelection,
  language: Language,
  signal?: AbortSignal,
  imageCaptureMode: PdfImageCaptureMode = 'embedded-images',
): Promise<ParsedPdfContent> {
  if (typeof window === 'undefined') {
    throw new Error('Browser PDF selection parsing is only available in the browser.');
  }

  if (selection.fileSignature !== getPdfSourceFileSignature(file)) {
    throw new Error(
      language === 'en-US'
        ? 'The selected pages no longer match the current PDF file.'
        : '当前选页结果和上传的 PDF 已不匹配，请重新选择页面。',
    );
  }

  const [{ getDocumentProxy, extractText, extractImages, renderPageAsImage }, arrayBuffer] =
    await Promise.all([import('unpdf'), file.arrayBuffer()]);
  throwIfAborted(signal);

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [];
  const keptPages = selection.pages
    .filter((page) => page.keep)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (keptPages.length === 0) {
    throw new Error(language === 'en-US' ? 'Please keep at least one page.' : '请至少保留一页。');
  }

  const pdfImagesMeta: Array<{
    id: string;
    src: string;
    pageNumber: number;
    description?: string;
    width?: number;
    height?: number;
  }> = [];
  const textChunks: string[] = [];
  let payloadBytes = 0;

  const pushAsset = (asset: {
    src: string;
    pageNumber: number;
    description?: string;
    width?: number;
    height?: number;
  }) => {
    payloadBytes += pdfDataUrlByteLength(asset.src);
    if (payloadBytes > selection.maxContentBytes) {
      throw new Error(buildSelectionTooLargeMessage(language));
    }
    pdfImagesMeta.push({
      id: `img_${pdfImagesMeta.length + 1}`,
      ...asset,
    });
  };

  for (const entry of keptPages) {
    throwIfAborted(signal);

    const pageText = (pageTexts[entry.pageNumber - 1] || '').trim();
    if (pageText) {
      textChunks.push(pageText);
      payloadBytes += utf8Bytes(pageText);
      if (payloadBytes > selection.maxContentBytes) {
        throw new Error(buildSelectionTooLargeMessage(language));
      }
    }

    if (imageCaptureMode === 'all-pages') {
      const page = await pdf.getPage(entry.pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const src = await renderPageAsImage(pdf, entry.pageNumber, {
        toDataURL: true,
        width: PDF_SELECTION_SCREENSHOT_WIDTH,
      });
      pushAsset({
        src,
        pageNumber: entry.pageNumber,
        description:
          language === 'en-US'
            ? `Full-page screenshot of PDF page ${entry.pageNumber}.`
            : `PDF 第 ${entry.pageNumber} 页整页截图。`,
        width: PDF_SELECTION_SCREENSHOT_WIDTH,
        height: Math.round(
          PDF_SELECTION_SCREENSHOT_WIDTH / Math.max(viewport.width / viewport.height, 0.1),
        ),
      });
      continue;
    }

    if (!entry.hasImages) continue;

    if (entry.imageMode === 'direct') {
      const rawImages = await extractImages(pdf, entry.pageNumber);
      const allowedKeys =
        entry.keptImageKeys === undefined
          ? new Set(rawImages.map((r) => r.key))
          : new Set(entry.keptImageKeys);
      for (const rawImage of rawImages) {
        if (!allowedKeys.has(rawImage.key)) continue;
        const src = rawPdfExtractedImageToDataUrl(rawImage);
        pushAsset({
          src,
          pageNumber: entry.pageNumber,
          description:
            language === 'en-US'
              ? `Image extracted directly from PDF page ${entry.pageNumber}.`
              : `直接从 PDF 第 ${entry.pageNumber} 页提取的图片。`,
          width: rawImage.width,
          height: rawImage.height,
        });
      }
      continue;
    }

    const page = await pdf.getPage(entry.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const src = await renderPageAsImage(pdf, entry.pageNumber, {
      toDataURL: true,
      width: PDF_SELECTION_SCREENSHOT_WIDTH,
    });
    pushAsset({
      src,
      pageNumber: entry.pageNumber,
      description:
        language === 'en-US'
          ? `Full-page screenshot of PDF page ${entry.pageNumber}, kept because this page contains visual content.`
          : `PDF 第 ${entry.pageNumber} 页整页截图，因为这一页包含视觉内容。`,
      width: PDF_SELECTION_SCREENSHOT_WIDTH,
      height: Math.round(
        PDF_SELECTION_SCREENSHOT_WIDTH / Math.max(viewport.width / viewport.height, 0.1),
      ),
    });
  }

  return {
    text: textChunks.join('\n\n'),
    images: pdfImagesMeta.map((img) => img.src),
    metadata: {
      pageCount: keptPages.length,
      parser: 'browser-unpdf-page-selection',
      fileName: file.name,
      fileSize: file.size,
      pdfImages: pdfImagesMeta,
      imageMapping: Object.fromEntries(pdfImagesMeta.map((img) => [img.id, img.src])),
      selectedPageCount: keptPages.length,
      payloadBytes,
    },
  };
}

async function requestServerPdfParse(args: {
  file: File;
  signal?: AbortSignal;
  providerId?: PDFProviderId;
  providerConfig?: { apiKey?: string; baseUrl?: string };
}): Promise<ParsedPdfContent> {
  const parseFormData = new FormData();
  parseFormData.append('pdf', args.file);
  if (args.providerId) {
    parseFormData.append('providerId', args.providerId);
  }
  if (args.providerConfig?.apiKey?.trim()) {
    parseFormData.append('apiKey', args.providerConfig.apiKey);
  }
  if (args.providerConfig?.baseUrl?.trim()) {
    parseFormData.append('baseUrl', args.providerConfig.baseUrl);
  }

  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    body: parseFormData,
    signal: args.signal,
  });

  if (!response.ok) {
    const fallbackMessage =
      response.status === 413 ? 'PDF upload payload too large.' : 'PDF 解析失败';
    const message = await readServerErrorMessage(response, fallbackMessage);
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const parseResult = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: ParsedPdfContent;
  } | null;

  if (!parseResult?.success || !parseResult.data) {
    throw new Error('PDF 解析失败');
  }

  return parseResult.data;
}

function extractRawImages(parsed: ParsedPdfContent): RawPdfImageMeta[] {
  const rawPdfImages = parsed.metadata?.pdfImages;
  return rawPdfImages
    ? rawPdfImages.map((img) => ({
        id: img.id,
        src: img.src || '',
        pageNumber: img.pageNumber || 1,
        description: img.description,
        width: img.width,
        height: img.height,
      }))
    : parsed.images.map((src, i) => ({
        id: `img_${i + 1}`,
        src,
        pageNumber: 1,
        description: undefined,
        width: undefined,
        height: undefined,
      }));
}

export async function parsePdfForGeneration(args: {
  pdfFile: File;
  signal?: AbortSignal;
  language?: Language;
  providerId?: PDFProviderId;
  providerConfig?: { apiKey?: string; baseUrl?: string };
  selection?: PdfSourceSelection;
  /** null means keep all extracted preview images; undefined keeps the generation default budget. */
  imageLimit?: number | null;
  imageCaptureMode?: PdfImageCaptureMode;
  forceBrowserParse?: boolean;
  includeVisualRegionImages?: boolean;
}): Promise<{
  pdfText: string;
  pdfImages: PdfImage[];
  imageStorageIds: string[];
  imageMapping: ImageMapping;
  truncationWarnings: string[];
}> {
  const language = args.language || 'zh-CN';
  const pdfFile = args.pdfFile;
  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    throw new Error(language === 'en-US' ? 'Invalid or empty PDF file' : 'PDF 文件无效或为空');
  }

  let parsed: ParsedPdfContent;
  const truncationWarnings: string[] = [];

  if (args.selection) {
    parsed = await parsePdfLocallyWithSelection(
      pdfFile,
      args.selection,
      language,
      args.signal,
      args.imageCaptureMode,
    );
  } else if (args.forceBrowserParse || pdfFile.size > SERVERLESS_BODY_LIMIT_BYTES) {
    log.info('Skipping /api/parse-pdf for oversized PDF; using browser fallback', {
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      forceBrowserParse: args.forceBrowserParse,
    });
    parsed = await parsePdfLocallyInBrowser(
      pdfFile,
      language,
      args.signal,
      args.imageLimit,
      args.imageCaptureMode,
    );
    if (pdfFile.size > SERVERLESS_BODY_LIMIT_BYTES) {
      truncationWarnings.push(buildPayloadTooLargeWarning(language));
    }
  } else {
    try {
      parsed = await requestServerPdfParse({
        file: pdfFile,
        signal: args.signal,
        providerId: args.providerId,
        providerConfig: args.providerConfig,
      });
    } catch (error) {
      const status =
        error instanceof Error && 'status' in error
          ? Number((error as { status?: number }).status)
          : undefined;
      if (status !== 413) {
        throw error;
      }

      try {
        log.warn('Server returned 413 for PDF parse; falling back to browser parsing', {
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
        });
        parsed = await parsePdfLocallyInBrowser(
          pdfFile,
          language,
          args.signal,
          args.imageLimit,
          args.imageCaptureMode,
        );
        truncationWarnings.push(buildPayloadTooLargeWarning(language));
      } catch (fallbackError) {
        const detail =
          fallbackError instanceof Error && fallbackError.message
            ? language === 'en-US'
              ? `Reason: ${fallbackError.message}`
              : `原因：${fallbackError.message}`
            : undefined;
        throw new Error(buildPayloadTooLargeFailureMessage(language, detail));
      }
    }
  }

  let pdfText = parsed.text || '';
  if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
    pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
    truncationWarnings.push(buildTextTruncatedWarning(language));
  }

  let images = extractRawImages(parsed);
  if (args.includeVisualRegionImages && args.imageCaptureMode !== 'all-pages') {
    const selectedPageNumbers = args.selection?.pages
      .filter((page) => page.keep)
      .map((page) => page.pageNumber);
    const visualRegions = await extractPdfVisualRegionsInBrowser({
      file: pdfFile,
      language,
      signal: args.signal,
      pageNumbers: selectedPageNumbers,
    });
    if (visualRegions.length > 0) {
      const usedIds = new Set(images.map((image) => image.id));
      const uniqueRegions = visualRegions.filter((image) => !usedIds.has(image.id));
      if (uniqueRegions.length > 0) {
        images = [...images, ...uniqueRegions];
        truncationWarnings.push(buildVisualRegionWarning(language, uniqueRegions.length));
      }
    }
  }
  const imageStorageIds = images.length > 0 ? await storeImages(images) : [];
  const pdfImages: PdfImage[] = images.map((img, i) => ({
    id: img.id,
    src: '',
    pageNumber: img.pageNumber,
    description: img.description,
    width: img.width,
    height: img.height,
    storageId: imageStorageIds[i],
  }));
  const imageMapping = imageStorageIds.length > 0 ? await loadImageMapping(imageStorageIds) : {};

  const localImagePageCount =
    typeof parsed.metadata?.imagePageCount === 'number'
      ? parsed.metadata.imagePageCount
      : undefined;
  if (localImagePageCount && localImagePageCount > images.length) {
    truncationWarnings.push(
      buildImageTruncatedWarning(language, images.length, localImagePageCount),
    );
  }

  return {
    pdfText,
    pdfImages,
    imageStorageIds,
    imageMapping,
    truncationWarnings,
  };
}
