import type { SourceImageInput, SourcePageInput } from './types';

export function compactText(input: string | undefined, maxLength: number): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function estimateDataUrlBytes(src: string | undefined): number {
  if (!src) return 0;
  const base64 = src.match(/^data:[^;]+;base64,(.+)$/)?.[1];
  if (base64) return Math.ceil((base64.length * 3) / 4);
  return src.length;
}

export function compactSourcePages(sourcePages: SourcePageInput[], limit = 28): SourcePageInput[] {
  return sourcePages.slice(0, limit).map((page, index) => ({
    sourceIndex: typeof page.sourceIndex === 'number' ? page.sourceIndex : index + 1,
    sourceLabel: compactText(page.sourceLabel, 80),
    title: compactText(page.title, 120),
    summary: compactText(page.summary, 420),
    keyPoints: Array.isArray(page.keyPoints)
      ? page.keyPoints.slice(0, 5).map((point) => compactText(point, 220))
      : [],
    concreteAnchor: compactText(page.concreteAnchor, 700),
    suggestedPageKind: compactText(page.suggestedPageKind, 40),
    imageIds: Array.isArray(page.imageIds)
      ? page.imageIds.filter((id) => typeof id === 'string').slice(0, 6)
      : [],
  }));
}

export function compactSourceImages(
  sourceImages: SourceImageInput[] | undefined,
): SourceImageInput[] {
  return (sourceImages || [])
    .filter((image) => typeof image.id === 'string' && image.id.trim())
    .slice(0, 40)
    .map((image) => ({
      id: compactText(image.id, 80),
      pageNumber: typeof image.pageNumber === 'number' ? image.pageNumber : undefined,
      description: compactText(image.description, 260),
      width: typeof image.width === 'number' ? Math.round(image.width) : undefined,
      height: typeof image.height === 'number' ? Math.round(image.height) : undefined,
      byteLength:
        typeof image.byteLength === 'number'
          ? Math.round(image.byteLength)
          : estimateDataUrlBytes(image.src),
    }));
}

export function sourceImagesForVision(
  sourceImages: SourceImageInput[] | undefined,
): Array<{ id: string; src: string }> {
  const seen = new Set<string>();
  const images: Array<{ id: string; src: string }> = [];
  for (const image of sourceImages || []) {
    const id = image.id?.trim();
    const src = image.src?.trim();
    if (!id || !src || seen.has(id) || !/^[A-Za-z0-9_.:-]+$/.test(id)) continue;
    seen.add(id);
    images.push({ id, src });
    if (images.length >= 16) break;
  }
  return images;
}

export function extractJsonObject(text: string): string {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return withoutFence;
  return withoutFence.slice(start, end + 1);
}

export function toStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

export function sourcePagesForPrompt(sourcePages: SourcePageInput[], limit = 28): string {
  return compactSourcePages(sourcePages, limit)
    .map((page) =>
      [
        `源页 ${page.sourceIndex}${page.sourceLabel ? `（${page.sourceLabel}）` : ''}: ${page.title}`,
        page.summary ? `摘要：${page.summary}` : '',
        page.keyPoints?.length ? `关键点：${page.keyPoints.join('；')}` : '',
        page.concreteAnchor ? `可用素材：${page.concreteAnchor}` : '',
        page.imageIds?.length ? `本源页可用原文图片：${page.imageIds.join(', ')}` : '',
        page.suggestedPageKind ? `已有页型信号：${page.suggestedPageKind}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

export function sourceImagesForPrompt(sourceImages: SourceImageInput[]): string {
  const compactImages = compactSourceImages(sourceImages);
  if (compactImages.length === 0) return '无可用原文图片。';
  return compactImages
    .map((image) => {
      const size = image.width && image.height ? `，尺寸 ${image.width}×${image.height}` : '';
      const bytes = image.byteLength ? `，约 ${Math.round(image.byteLength / 1024)} KB` : '';
      return [
        `- ${image.id}: 第 ${image.pageNumber || '?'} 页${size}${bytes}`,
        image.description ? `  说明：${image.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}
