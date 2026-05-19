import { resolveBuiltInHeroBackgroundSource } from '@/lib/constants/slide-backgrounds';
import type { SceneOutline } from '@/lib/types/generation';
import type { PPTElement, PPTImageElement } from '@/lib/types/slides';

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isGeneratedImagePlaceholder(src: string | undefined): boolean {
  return Boolean(src && /^gen_img_[\w-]+$/i.test(src));
}

export function buildQaDiagramDataUri(args: {
  outline: SceneOutline;
  elementId: string;
  width: number;
  height: number;
}): string {
  const template = args.outline.layoutIntent?.layoutTemplate;
  if (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  ) {
    return resolveBuiltInHeroBackgroundSource({
      layoutTemplate: template,
      deckStyle: args.outline.layoutIntent?.deckStyle,
      disciplineStyle: args.outline.layoutIntent?.disciplineStyle,
      title: args.outline.title,
      description: args.outline.description,
    });
  }
  const title = escapeSvgText(args.outline.title || 'Tweet object');
  const fields = ['userid', 'created_at', 'content', 'likes'];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="${Math.max(1, Math.round(args.width))}" height="${Math.max(1, Math.round(args.height))}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef6ff"/>
      <stop offset="1" stop-color="#fff7ed"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#bg)"/>
  <text x="42" y="54" fill="#0f172a" font-family="Arial, sans-serif" font-size="24" font-weight="800">${title}</text>
  <rect x="52" y="92" width="210" height="146" rx="18" fill="#ffffff" stroke="#bfdbfe" filter="url(#shadow)"/>
  <text x="157" y="132" text-anchor="middle" fill="#1d4ed8" font-family="Menlo, monospace" font-size="28" font-weight="800">Tweet()</text>
  <text x="157" y="166" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="16">one object entrance</text>
  <path d="M278 165 C330 165 324 165 376 165" stroke="#64748b" stroke-width="5" fill="none" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#64748b"/>
    </marker>
  </defs>
  ${fields
    .map((field, index) => {
      const y = 86 + index * 56;
      const color = ['#2563eb', '#10b981', '#f97316', '#8b5cf6'][index];
      return `<rect x="388" y="${y}" width="200" height="38" rx="12" fill="#ffffff" stroke="${color}" stroke-opacity="0.38"/><circle cx="414" cy="${y + 19}" r="6" fill="${color}"/><text x="434" y="${y + 25}" fill="#0f172a" font-family="Menlo, monospace" font-size="17" font-weight="700">${field}</text>`;
    })
    .join('')}
  <text x="52" y="304" fill="#475569" font-family="Arial, sans-serif" font-size="16">QA visual preview for ${escapeSvgText(args.elementId)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function materializeQaMediaPlaceholders(
  elements: PPTElement[],
  outline: SceneOutline,
): PPTElement[] {
  return elements.map((element) => {
    if (element.type !== 'image' || !isGeneratedImagePlaceholder(element.src)) return element;
    const imageElement = element as PPTImageElement;
    return {
      ...imageElement,
      src: buildQaDiagramDataUri({
        outline,
        elementId: imageElement.src,
        width: imageElement.width,
        height: imageElement.height,
      }),
    };
  });
}
