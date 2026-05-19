import type { RequestBody, SourceImageAsset, SourceImageUsage } from './types';

export function normalizeImageAsset(body: RequestBody['imageAsset']) {
  const src = body?.src?.trim();
  if (!src) return null;
  return {
    src: src.slice(0, 1000),
    alt: body?.alt?.trim().slice(0, 240) || 'AI 生成的教学插图',
    description: body?.description?.trim().slice(0, 1200) || '',
    aspectRatio: body?.aspectRatio?.trim().slice(0, 40) || '4:3',
  };
}

export function normalizeSourceImages(
  assignedSourceImages: RequestBody['assignedSourceImages'],
  sourceImageMapping: RequestBody['sourceImageMapping'],
): Array<SourceImageAsset & { id: string; src: string }> {
  const seen = new Set<string>();
  const normalized: Array<SourceImageAsset & { id: string; src: string }> = [];
  for (const image of assignedSourceImages || []) {
    const id = image.id?.trim();
    if (!id || seen.has(id) || !/^[A-Za-z0-9_.:-]+$/.test(id)) continue;
    const src = image.src?.trim() || sourceImageMapping?.[id]?.trim() || '';
    if (!src) continue;
    seen.add(id);
    normalized.push({
      id,
      src,
      pageNumber: image.pageNumber,
      description: image.description?.trim().slice(0, 600),
      width: image.width,
      height: image.height,
    });
    if (normalized.length >= 4) break;
  }
  return normalized;
}

export function sourceImagesPromptBlock(
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): string {
  if (sourceImages.length === 0) return '';
  return [
    '',
    '可用原文图片素材：',
    ...sourceImages.map((image) => {
      const size =
        image.width && image.height
          ? `，原始尺寸 ${Math.round(image.width)}×${Math.round(image.height)}`
          : '';
      const page = image.pageNumber ? `第 ${image.pageNumber} 页` : '原文页';
      return `- ${image.id}: ${page}${size}${image.description ? `。说明：${image.description}` : ''}`;
    }),
    '使用要求：',
    '- 这些图片来自用户上传的原文件/论文/课件，优先作为证据、图表或原文截图使用，不是 AI 插图。',
    '- 使用前必须观察图片真实内容：标题、caption 和解释只能描述图片实际呈现的东西，不能按你期待的图种来命名。',
    '- 如果图片是照片、视频样例帧或普通截图，就称为“视觉样例/原文截图/示例图”；不要误称为架构图、流程图、表格、结果图或 pipeline。',
    '- 如果使用图片，HTML 中必须先写图片 ID 占位，例如 <img src="img_1" alt="原文图表：..." />；服务端会把该 ID 替换为真实图片。',
    '- 只能使用上面列出的图片 ID，不要虚构 img_99、source-image、外链 URL、base64、SVG 或 canvas。',
    '- 同一张原文图片默认只渲染一次；如果页面需要比较两个概念，用 DOM 文本、表格或卡片比较，不要复制同一张图两次。',
    '- 保持图片比例：figure/img 容器必须有稳定宽高，img 使用 object-fit: contain，不要拉伸、裁切或铺满整页。',
    '- 图片旁边必须有可编辑 DOM 文本标题/页码/短说明；图片本身不要承担所有文字信息。',
  ].join('\n');
}

function collectUsedImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]?.trim();
    if (value && /^[A-Za-z0-9_.:-]+$/.test(value)) ids.add(value);
  }
  for (const match of html.matchAll(/\bdata-source-image-id\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]?.trim();
    if (value && /^[A-Za-z0-9_.:-]+$/.test(value)) ids.add(value);
  }
  for (const match of html.matchAll(/url\(\s*["']?([A-Za-z0-9_.:-]+)["']?\s*\)/gi)) {
    const value = match[1]?.trim();
    if (value) ids.add(value);
  }
  return Array.from(ids);
}

export function analyzeSourceImageUsage(
  html: string,
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): SourceImageUsage {
  const assignedIds = sourceImages.map((image) => image.id);
  if (assignedIds.length === 0) {
    const inventedIds = collectUsedImageIds(html).filter((id) => /^img_\d+$/i.test(id));
    return { assignedIds, usedIds: [], missingIds: [], inventedIds };
  }
  const assignedSet = new Set(assignedIds);
  const usedIds = collectUsedImageIds(html).filter((id) => assignedSet.has(id));
  const usedSet = new Set(usedIds);
  const missingIds = assignedIds.filter((id) => !usedSet.has(id));
  const inventedIds = collectUsedImageIds(html).filter(
    (id) => /^img_\d+$/i.test(id) && !assignedSet.has(id),
  );
  return {
    assignedIds,
    usedIds: Array.from(usedSet),
    missingIds,
    inventedIds: Array.from(new Set(inventedIds)),
  };
}

export function resolveSourceImagePlaceholders(
  html: string,
  sourceImages: Array<SourceImageAsset & { id: string; src: string }>,
): string {
  if (sourceImages.length === 0) return html;
  let resolved = html;
  for (const image of sourceImages) {
    const escapedId = image.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const src = image.src.replace(/"/g, '&quot;');
    resolved = resolved
      .replace(new RegExp(`(\\bsrc\\s*=\\s*["'])${escapedId}(["'])`, 'g'), `$1${src}$2`)
      .replace(new RegExp(`(url\\(\\s*["']?)${escapedId}(["']?\\s*\\))`, 'g'), `$1${src}$2`);
  }
  return resolved;
}
