import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import { db } from '@/lib/utils/database';

import { getEstimatedImageCostLabel } from './format';
import {
  HTML_IMAGE_SLOT_ATTR,
  IMAGE_ASSET_TOKEN,
  type HtmlImageAsset,
  type HtmlSinglePagePreset,
} from './types';

export function buildSlideIllustrationPrompt(
  preset: HtmlSinglePagePreset,
  slidePrompt: string,
): string {
  if (preset.kind === 'cover') {
    return [
      'Create one standalone inset illustration asset for a Chinese math course notebook cover.',
      'Subject: abstract structured reasoning, definitions, counterexamples, and proof paths represented as clean geometric objects and connected paths.',
      'Style: premium clean educational illustration, white and pale blue background, blue and emerald accents, calm and sophisticated.',
      'Composition: one coherent object/scene only, centered, with generous negative space; suitable for a 4:3 figure area inside a cover slide.',
      'Hard constraints: no readable text, no letters, no words, no numbers, no formulas, no labels, no watermark.',
      'Hard constraints: no presentation page, no slide, no poster, no infographic, no UI screenshot, no cards, no panels, no title area.',
      `Context only, do not render as text: ${slidePrompt.slice(0, 300)}`,
    ].join('\n');
  }

  if (preset.kind === 'intro') {
    return [
      'Create one standalone inset illustration asset.',
      'Subject: an abstract dashboard gauge with a needle, no numerals, blending into a smooth mathematical curve with a single tangent line.',
      'Meaning: motion becoming an instantaneous rate of change.',
      'Style: premium clean object illustration, subtle dimensional depth, white and pale blue background, blue and emerald accents, crisp but calm.',
      'Composition: one coherent object/scene only, centered, with generous clean negative space.',
      'Hard constraints: no readable text, no letters, no words, no numbers, no formulas, no labels, no axis labels, no watermark.',
      'Hard constraints: no presentation page, no slide, no poster, no infographic, no UI screenshot, no cards, no panels, no title area, no caption strip.',
    ].join('\n');
  }

  return [
    `Create one standalone inset educational illustration asset for this page type: ${preset.label}.`,
    'The image is not a presentation page, not a background, and not a screenshot.',
    'Style: clean premium educational illustration, white and light blue background, blue and emerald accents.',
    'Hard constraints: no readable text, no letters, no numbers, no labels, no UI screenshot, no full page layout, no title area, no captions.',
    `Concept only, do not render any text from this context: ${slidePrompt.slice(0, 300)}`,
  ].join('\n');
}

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
  const description =
    asset.providerId === 'openai-image' ? '无文字仪表盘 + 曲线 + 切线插图' : '教学主题插图素材';
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
  <circle cx="480" cy="282" r="92" fill="#edf7ff" stroke="#d7e9f7" stroke-width="3"/>
  <path d="M405 300a84 84 0 0 1 150 0" fill="none" stroke="url(#accent)" stroke-width="22" stroke-linecap="round"/>
  <path d="M480 300l72-44" stroke="#163b5a" stroke-width="10" stroke-linecap="round"/>
  <circle cx="480" cy="300" r="18" fill="#ffffff" stroke="#163b5a" stroke-width="7"/>
  <path d="M280 440c92-96 172-98 252 0s152 88 214-10" fill="none" stroke="#2f7ee6" stroke-width="10" stroke-linecap="round"/>
  <path d="M610 394l116-58" stroke="#22b88a" stroke-width="8" stroke-linecap="round"/>
  <text x="480" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#153047">${escapeXmlText(title)}</text>
  <text x="480" y="568" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#48657d">${escapeXmlText(description)}</text>
  <text x="480" y="612" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6b7f92">${escapeXmlText(estimate)}</text>
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
  preset,
  providerId,
  modelId,
  costEstimate,
  skippedCreditCharge,
}: {
  result: ImageGenerationResult;
  prompt: string;
  preset: HtmlSinglePagePreset;
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
  const storageId = `generation-html-single-page-test:${preset.id}:${Date.now()}`;
  await db.mediaFiles.put({
    id: storageId,
    stageId: 'generation-html-single-page-test',
    type: 'image',
    blob,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    prompt,
    params: JSON.stringify({
      providerId,
      modelId,
      aspectRatio: '4:3',
      source: 'html-single-page-test',
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
