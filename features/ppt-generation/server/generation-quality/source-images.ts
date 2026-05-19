import { createHash } from 'node:crypto';
import type { SourcePackageImage, SourcePackageImageStats } from './testfile-fixtures-types';

const MAX_SOURCE_IMAGES_PER_FIXTURE = 18;
const MAX_SOURCE_IMAGE_DATA_URL_LENGTH = 1_200_000;
const MIN_SOURCE_IMAGE_LONG_EDGE = 180;
const MIN_SOURCE_IMAGE_AREA = 24_000;
const MIN_SOURCE_IMAGE_DATA_URL_LENGTH = 4_000;

function dataUrlByteLength(src: string): number {
  const base64 = src.match(/^data:[^;]+;base64,(.+)$/)?.[1];
  if (base64) return Math.ceil((base64.length * 3) / 4);
  return src.length;
}

export function emptySourceImageStats(rawCount = 0, keptCount = 0): SourcePackageImageStats {
  return {
    rawCount,
    keptCount,
    filteredSmallCount: 0,
    filteredLargeCount: 0,
    filteredLimitCount: 0,
    dedupedCount: 0,
  };
}

function sourceImageFingerprint(src: string): string {
  const base64 = src.match(/^data:[^;]+;base64,(.+)$/)?.[1]?.replace(/\s+/g, '');
  return createHash('sha256')
    .update(base64 || src.trim())
    .digest('hex');
}

function normalizedImageDimension(value?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function smallSourceImageReason(args: {
  width?: number;
  height?: number;
  byteLength: number;
}): string | null {
  const width = normalizedImageDimension(args.width);
  const height = normalizedImageDimension(args.height);
  if (width && height) {
    const longEdge = Math.max(width, height);
    const area = width * height;
    if (longEdge < MIN_SOURCE_IMAGE_LONG_EDGE) {
      return `最长边 ${longEdge}px 小于 ${MIN_SOURCE_IMAGE_LONG_EDGE}px`;
    }
    if (area < MIN_SOURCE_IMAGE_AREA) {
      return `面积 ${area}px 小于 ${MIN_SOURCE_IMAGE_AREA}px`;
    }
    return null;
  }

  if (!width && !height && args.byteLength < MIN_SOURCE_IMAGE_DATA_URL_LENGTH) {
    return `图片约 ${Math.max(1, Math.round(args.byteLength / 1024))} KB，低于可复用素材阈值`;
  }

  return null;
}

function imageDescriptionForSource(args: {
  id: string;
  pageNumber: number;
  fileName: string;
  description?: string;
  width?: number;
  height?: number;
}): string {
  const size = args.width && args.height ? `，尺寸 ${args.width}×${args.height}` : '';
  return (
    args.description?.trim() ||
    `原文图片 ${args.id}，来自 ${args.fileName} 第 ${args.pageNumber} 页${size}。`
  );
}

export function normalizeSourceImages(
  rawImages: Array<{
    id?: string;
    src?: string;
    pageNumber?: number;
    description?: string;
    width?: number;
    height?: number;
  }>,
  fileName: string,
): {
  sourceImages: SourcePackageImage[];
  imageMapping: Record<string, string>;
  imageStats: SourcePackageImageStats;
  warnings: string[];
} {
  const sourceImages: SourcePackageImage[] = [];
  const imageMapping: Record<string, string> = {};
  const warnings: string[] = [];
  const seenImageHashes = new Map<string, string>();
  const imageStats = emptySourceImageStats(
    rawImages.filter((image) => typeof image.src === 'string' && image.src.trim()).length,
  );

  rawImages.forEach((image, rawIndex) => {
    const src = typeof image.src === 'string' ? image.src.trim() : '';
    if (!src) return;
    const id = image.id?.trim() || `img_${rawIndex + 1}`;
    const byteLength = dataUrlByteLength(src);
    if (byteLength > MAX_SOURCE_IMAGE_DATA_URL_LENGTH) {
      imageStats.filteredLargeCount += 1;
      warnings.push(`跳过 ${id}：图片约 ${Math.round(byteLength / 1024)} KB，超过测试接口上限。`);
      return;
    }
    const smallReason = smallSourceImageReason({
      width: image.width,
      height: image.height,
      byteLength,
    });
    if (smallReason) {
      imageStats.filteredSmallCount += 1;
      return;
    }
    const imageHash = sourceImageFingerprint(src);
    const existingImageId = seenImageHashes.get(imageHash);
    if (existingImageId) {
      imageStats.dedupedCount += 1;
      return;
    }
    if (sourceImages.length >= MAX_SOURCE_IMAGES_PER_FIXTURE) {
      imageStats.filteredLimitCount += 1;
      if (!warnings.some((warning) => warning.includes('只保留前'))) {
        warnings.push(`只保留前 ${MAX_SOURCE_IMAGES_PER_FIXTURE} 张原文图片，避免请求体过大。`);
      }
      return;
    }
    const pageNumber = Math.max(1, Math.round(image.pageNumber || 1));
    const sourceImage: SourcePackageImage = {
      id,
      src,
      pageNumber,
      description: imageDescriptionForSource({
        id,
        pageNumber,
        fileName,
        description: image.description,
        width: image.width,
        height: image.height,
      }),
      width: image.width,
      height: image.height,
      byteLength,
    };
    sourceImages.push(sourceImage);
    imageMapping[id] = src;
    seenImageHashes.set(imageHash, id);
  });

  imageStats.keptCount = sourceImages.length;
  if (imageStats.filteredSmallCount > 0) {
    warnings.push(
      `已过滤 ${imageStats.filteredSmallCount} 张过小原文图片（小图标/logo/装饰图），只保留适合后续生成复用的教学素材。`,
    );
  }
  if (imageStats.dedupedCount > 0) {
    warnings.push(`已去重 ${imageStats.dedupedCount} 张重复原文图片。`);
  }

  return { sourceImages, imageMapping, imageStats, warnings };
}

export function imageIdsForSourcePage(
  sourceImages: SourcePackageImage[],
  sourceLabel: string,
  sourceIndex: number,
): string[] {
  const sourcePageNumber =
    Number(sourceLabel.match(/(?:Page|Slide)\s+(\d+)/i)?.[1]) || sourceIndex + 1;
  return sourceImages
    .filter((image) => image.pageNumber === sourcePageNumber)
    .map((image) => image.id)
    .slice(0, 4);
}
