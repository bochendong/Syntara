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

type Language = 'zh-CN' | 'en-US';

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

function buildImageTruncatedWarning(language: Language, total: number): string {
  return language === 'en-US'
    ? `Image count was truncated: keeping ${MAX_VISION_IMAGES} / ${total}.`
    : `图片数量已截断：保留 ${MAX_VISION_IMAGES} / ${total} 张`;
}

function buildSelectionTooLargeMessage(language: Language): string {
  return language === 'en-US'
    ? 'The pages you kept still exceed the 4.5 MB content budget. Remove some pages or switch image-heavy pages to screenshots.'
    : '你保留的页面内容仍然超过 4.5MB 上限，请继续减少页面，或把重图片页切换成整页截图。';
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
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
): Promise<ParsedPdfContent> {
  if (typeof window === 'undefined') {
    throw new Error('Browser PDF fallback is only available in the browser.');
  }

  throwIfAborted(signal);
  const [{ getDocumentProxy, extractText, extractImages, renderPageAsImage }, arrayBuffer] = await Promise.all([
    import('unpdf'),
    file.arrayBuffer(),
  ]);
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
    imagePageCount += 1;
    if (pdfImagesMeta.length >= MAX_VISION_IMAGES) continue;

    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const aspectRatio = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1.7778;
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
            ? `Full-page screenshot of PDF page ${pageNumber}, captured because this page contains embedded images.`
            : `PDF 第 ${pageNumber} 页整页截图，因为这一页包含嵌入图片。`,
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
      parser: pdfImagesMeta.length > 0 ? 'browser-unpdf-with-page-screenshots' : 'browser-unpdf-text-only',
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
  const keptPages = selection.pages.filter((page) => page.keep).sort((a, b) => a.pageNumber - b.pageNumber);
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

  const parseResult = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        data?: ParsedPdfContent;
      }
    | null;

  if (!parseResult?.success || !parseResult.data) {
    throw new Error('PDF 解析失败');
  }

  return parseResult.data;
}

function extractRawImages(parsed: ParsedPdfContent) {
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
    parsed = await parsePdfLocallyWithSelection(pdfFile, args.selection, language, args.signal);
  } else if (pdfFile.size > SERVERLESS_BODY_LIMIT_BYTES) {
    log.info('Skipping /api/parse-pdf for oversized PDF; using browser fallback', {
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
    });
    parsed = await parsePdfLocallyInBrowser(pdfFile, language, args.signal);
    truncationWarnings.push(buildPayloadTooLargeWarning(language));
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
        parsed = await parsePdfLocallyInBrowser(pdfFile, language, args.signal);
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

  const images = extractRawImages(parsed);
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
    typeof parsed.metadata?.imagePageCount === 'number' ? parsed.metadata.imagePageCount : undefined;
  if ((localImagePageCount && localImagePageCount > images.length) || images.length > MAX_VISION_IMAGES) {
    truncationWarnings.push(
      buildImageTruncatedWarning(language, localImagePageCount || images.length),
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
