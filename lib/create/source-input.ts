'use client';

import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
import { parsePdfForGeneration, type PdfImageCaptureMode } from '@/lib/pdf/parse-for-generation';
import type { PdfSourceSelection } from '@/lib/pdf/page-selection';
import { useSettingsStore } from '@/lib/store/settings';
import type { ImageMapping, PdfImage } from '@/lib/types/generation';
import { loadImageMapping, storeImages } from '@/lib/utils/image-storage';

export function isPdfSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return mime === 'application/pdf' || lowerName.endsWith('.pdf');
}

export function isMarkdownSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return mime === 'text/markdown' || mime === 'text/x-markdown' || lowerName.endsWith('.md');
}

export function isPptxSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lowerName = file.name.toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lowerName.endsWith('.pptx')
  );
}

export async function parseMarkdownLikeGenerationInput(args: {
  file: File;
}): Promise<{ pdfText: string; truncationWarnings: string[] }> {
  const file = args.file;
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Markdown 文件无效或为空');
  }
  const raw = (await file.text()).replace(/\u0000/g, '').trim();
  if (!raw) {
    throw new Error('Markdown 文件为空，无法用于生成');
  }
  const truncationWarnings: string[] = [];
  let pdfText = raw;
  if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
    pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
    truncationWarnings.push(`正文已截断至前 ${MAX_PDF_CONTENT_CHARS} 字符`);
  }
  return { pdfText, truncationWarnings };
}

export async function parsePdfLikeGenerationPreview(args: {
  pdfFile: File;
  signal?: AbortSignal;
  language?: 'zh-CN' | 'en-US';
  sourcePageSelection?: PdfSourceSelection;
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
  const settings = useSettingsStore.getState();
  const pdfFile = args.pdfFile;
  return parsePdfForGeneration({
    pdfFile,
    signal: args.signal,
    language: args.language || 'zh-CN',
    providerId: settings.pdfProviderId,
    providerConfig: settings.pdfProvidersConfig?.[settings.pdfProviderId]
      ? {
          apiKey: settings.pdfProvidersConfig[settings.pdfProviderId]?.apiKey,
          baseUrl: settings.pdfProvidersConfig[settings.pdfProviderId]?.baseUrl,
        }
      : undefined,
    selection: args.sourcePageSelection,
    imageLimit: args.imageLimit,
    imageCaptureMode: args.imageCaptureMode,
    forceBrowserParse: args.forceBrowserParse,
    includeVisualRegionImages: args.includeVisualRegionImages,
  });
}

export async function parsePptxLikeGenerationPreview(args: {
  pptxFile: File;
  signal?: AbortSignal;
}): Promise<{
  pdfText: string;
  pdfImages: PdfImage[];
  imageStorageIds: string[];
  imageMapping: ImageMapping;
  truncationWarnings: string[];
}> {
  const pptxFile = args.pptxFile;
  if (!(pptxFile instanceof File) || pptxFile.size === 0) {
    throw new Error('PPTX 文件无效或为空');
  }

  const parseFormData = new FormData();
  parseFormData.append('pptx', pptxFile);

  const parseResponse = await fetch('/api/parse-pptx', {
    method: 'POST',
    body: parseFormData,
    signal: args.signal,
  });

  if (!parseResponse.ok) {
    const errorData = await parseResponse.json().catch(() => ({ error: 'PPTX 解析失败' }));
    throw new Error((errorData as { error?: string }).error || 'PPTX 解析失败');
  }

  const parseResult = await parseResponse.json();
  if (!parseResult.success || !parseResult.data) {
    throw new Error('PPTX 解析失败');
  }

  let pdfText = parseResult.data.text as string;
  if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
    pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
  }

  const rawPdfImages = parseResult.data.metadata?.pdfImages || [];
  const images = rawPdfImages.map(
    (img: {
      id: string;
      src?: string;
      pageNumber?: number;
      description?: string;
      width?: number;
      height?: number;
    }) => ({
      id: img.id,
      src: img.src || '',
      pageNumber: img.pageNumber || 1,
      description: img.description,
      width: img.width,
      height: img.height,
    }),
  );

  const imageStorageIds = await storeImages(images);
  const pdfImages: PdfImage[] = images.map(
    (
      img: {
        id: string;
        src: string;
        pageNumber: number;
        description?: string;
        width?: number;
        height?: number;
      },
      i: number,
    ) => ({
      id: img.id,
      src: '',
      pageNumber: img.pageNumber,
      description: img.description,
      width: img.width,
      height: img.height,
      storageId: imageStorageIds[i],
    }),
  );
  const imageMapping = await loadImageMapping(imageStorageIds);

  const truncationWarnings: string[] = [];
  if ((parseResult.data.text as string).length > MAX_PDF_CONTENT_CHARS) {
    truncationWarnings.push(`正文已截断至前 ${MAX_PDF_CONTENT_CHARS} 字符`);
  }

  return { pdfText, pdfImages, imageStorageIds, imageMapping, truncationWarnings };
}
