import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import { db } from '@/lib/utils/database';

import { compact, getEstimatedImageCostLabel } from './format';
import {
  HTML_IMAGE_SLOT_ATTR,
  IMAGE_ASSET_TOKEN,
  type HtmlImageAsset,
  type LessonSlidePlan,
} from './types';

export function resultToImageUrl(result: ImageGenerationResult): string {
  if (result.url) return result.url;
  if (!result.base64) return '';
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:image/png;base64,${result.base64}`;
}

export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildImagePlaceholderDataUrl(asset: HtmlImageAsset, isGenerating: boolean): string {
  const title = isGenerating ? '正在生成 AI 插图...' : '点击生成 AI 插图';
  const description = compact(asset.prompt, 42) || '本页教学插图素材';
  const estimate =
    asset.estimatedCostLabel || getEstimatedImageCostLabel(asset.providerId, asset.modelId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fcff"/>
      <stop offset="1" stop-color="#eefaf6"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2f7ee6"/>
      <stop offset="1" stop-color="#22b88a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="720" rx="44" fill="url(#bg)"/>
  <rect x="58" y="58" width="844" height="604" rx="36" fill="#ffffff" stroke="#d9e9f6" stroke-width="3"/>
  <circle cx="314" cy="278" r="78" fill="#edf7ff" stroke="#d7e9f7" stroke-width="3"/>
  <circle cx="480" cy="278" r="78" fill="#effaf5" stroke="#d6eee5" stroke-width="3"/>
  <circle cx="646" cy="278" r="78" fill="#f1f5ff" stroke="#dbe5ff" stroke-width="3"/>
  <path d="M392 278h10m156 0h10" stroke="url(#accent)" stroke-width="10" stroke-linecap="round"/>
  <path d="M282 306c70-72 130-74 190 0s114 66 160-8" fill="none" stroke="#2f7ee6" stroke-width="10" stroke-linecap="round"/>
  <path d="M560 260l92-46" stroke="#22b88a" stroke-width="8" stroke-linecap="round"/>
  <text x="480" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#153047">${escapeXmlText(title)}</text>
  <text x="480" y="558" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#48657d">${escapeXmlText(description)}</text>
  <text x="480" y="608" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6b7f92">${escapeXmlText(estimate)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function base64ImageToBlob(base64: string): Blob {
  const match = base64.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'image/png';
  const raw = match?.[2] || base64;
  const binary = window.atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function persistImageResultToAsset({
  result,
  prompt,
  slide,
  providerId,
  modelId,
  costEstimate,
  skippedCreditCharge,
}: {
  result: ImageGenerationResult;
  prompt: string;
  slide: LessonSlidePlan;
  providerId: ImageProviderId;
  modelId: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
}): Promise<HtmlImageAsset> {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  if (result.url) {
    return {
      sourceType: 'url',
      url: result.url,
      providerId,
      providerName,
      modelId,
      prompt,
      width: result.width,
      height: result.height,
      costEstimate: costEstimate ?? null,
      skippedCreditCharge,
    };
  }

  if (!result.base64) {
    throw new Error('图片生成成功，但响应里没有可持久化的 URL 或 base64 数据。');
  }

  const blob = base64ImageToBlob(result.base64);
  const storageId = `generation-html-notebook-test:${slide.id}:${Date.now()}`;
  await db.mediaFiles.put({
    id: storageId,
    stageId: 'generation-html-notebook-test',
    type: 'image',
    blob,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    prompt,
    params: JSON.stringify({
      providerId,
      modelId,
      aspectRatio: '4:3',
      slideId: slide.id,
      slideTitle: slide.title,
      source: 'html-notebook-test',
    }),
    createdAt: Date.now(),
  });

  return {
    sourceType: 'indexeddb',
    storageId,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    providerId,
    providerName,
    modelId,
    prompt,
    width: result.width,
    height: result.height,
    costEstimate: costEstimate ?? null,
    skippedCreditCharge,
  };
}

export function buildPendingImageAsset({
  providerId,
  modelId,
  prompt,
}: {
  providerId: ImageProviderId;
  modelId: string;
  prompt: string;
}): HtmlImageAsset {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  return {
    sourceType: 'pending',
    providerId,
    providerName,
    modelId,
    prompt,
    estimatedCostLabel: getEstimatedImageCostLabel(providerId, modelId),
    width: 960,
    height: 720,
    costEstimate: null,
    skippedCreditCharge: true,
  };
}

export async function resolveImageAssetUrl(
  asset: HtmlImageAsset | null | undefined,
  isGenerating: boolean,
): Promise<string> {
  if (!asset) return '';
  if (asset.sourceType === 'pending') return buildImagePlaceholderDataUrl(asset, isGenerating);
  if (asset.sourceType === 'url') return asset.url || '';
  if (!asset.storageId) return '';
  const record = await db.mediaFiles.get(asset.storageId);
  if (!record?.blob) return '';
  return URL.createObjectURL(record.blob);
}

export function markImageSlotHtml(html: string): string {
  if (!html.includes(IMAGE_ASSET_TOKEN)) return html;
  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    if (!attrs.includes(IMAGE_ASSET_TOKEN) || attrs.includes(HTML_IMAGE_SLOT_ATTR)) return match;
    return `<img ${HTML_IMAGE_SLOT_ATTR}="true" title="点击生成 AI 插图"${attrs}>`;
  });
}

export function injectImageAssetIntoHtml(html: string, imageUrl: string): string {
  if (!imageUrl) return html;
  return html.split(IMAGE_ASSET_TOKEN).join(imageUrl);
}
