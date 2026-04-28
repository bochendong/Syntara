import { createLogger } from '@/lib/logger';
import { normalizeMathSource, renderMathToHtml } from '@/lib/math-engine';
import { MAX_TEXT_LINE_HEIGHT_RATIO, MIN_TEXT_LINE_HEIGHT_RATIO } from '@/lib/slide-text-layout';
import type { ImageMapping, PdfImage } from '@/lib/types/generation';
import type { GeneratedSlideData } from './pipeline-types';

const log = createLogger('Generation');

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLineHeightStyleValue(rawValue: string, fontSizePx: number | null): string {
  const trimmed = rawValue.trim();
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) {
    const px = Number.parseFloat(pxMatch[1]);
    if (!Number.isFinite(px)) return rawValue;
    const safeFontSize = fontSizePx ?? 16;
    const clampedPx = clampNumber(
      px,
      safeFontSize * MIN_TEXT_LINE_HEIGHT_RATIO,
      safeFontSize * MAX_TEXT_LINE_HEIGHT_RATIO,
    );
    return `${Number(clampedPx.toFixed(2))}px`;
  }

  const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (numericMatch) {
    const ratio = Number.parseFloat(numericMatch[0]);
    if (!Number.isFinite(ratio)) return rawValue;
    return String(
      Number(clampNumber(ratio, MIN_TEXT_LINE_HEIGHT_RATIO, MAX_TEXT_LINE_HEIGHT_RATIO).toFixed(3)),
    );
  }

  return rawValue;
}

function sanitizeTextHtmlMetrics(html: string): string {
  if (!html) return html;

  return html.replace(/style=(['"])([\s\S]*?)\1/gi, (full, quote: string, styleText: string) => {
    const declarations = styleText
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);

    let fontSizePx: number | null = null;
    for (const declaration of declarations) {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) continue;
      const key = declaration.slice(0, colonIndex).trim().toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();
      if (key !== 'font-size') continue;
      const match = value.match(/^(-?\d+(?:\.\d+)?)px$/i);
      if (!match) continue;
      const parsed = Number.parseFloat(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        fontSizePx = parsed;
      }
    }

    const normalized = declarations.map((declaration) => {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) return declaration;
      const key = declaration.slice(0, colonIndex).trim();
      const lowerKey = key.toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();

      if (lowerKey === 'line-height') {
        return `${key}:${sanitizeLineHeightStyleValue(value, fontSizePx)}`;
      }

      return `${key}:${value}`;
    });

    return `style=${quote}${normalized.join(';')}${quote}`;
  });
}

function sanitizeTextMetrics<T extends { lineHeight?: number; paragraphSpace?: number }>(
  textLike: T,
): T {
  const next = { ...textLike };

  if (next.lineHeight !== undefined) {
    next.lineHeight = clampNumber(
      next.lineHeight,
      MIN_TEXT_LINE_HEIGHT_RATIO,
      MAX_TEXT_LINE_HEIGHT_RATIO,
    );
  }

  if (next.paragraphSpace !== undefined) {
    next.paragraphSpace = Math.max(0, next.paragraphSpace);
  }

  return next;
}

function isImageIdReference(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false;
  return /^img_\d+$/i.test(value);
}

function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

export function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null;
        }
        const src = el.src as string;

        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null;
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        if (!('src' in el)) {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

export function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string];
      }

      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      if (typeof textEl.content === 'string') {
        textEl.content = sanitizeTextHtmlMetrics(textEl.content);
      }
      if (typeof textEl.lineHeight === 'number') {
        textEl.lineHeight = clampNumber(
          textEl.lineHeight,
          MIN_TEXT_LINE_HEIGHT_RATIO,
          MAX_TEXT_LINE_HEIGHT_RATIO,
        );
      }
      if (typeof textEl.paragraphSpace === 'number') {
        textEl.paragraphSpace = Math.max(0, textEl.paragraphSpace);
      }

      return textEl as typeof el;
    }

    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }
      if (shapeEl.text && typeof shapeEl.text === 'object') {
        const nextText = sanitizeTextMetrics(shapeEl.text as Record<string, unknown>);
        if (typeof nextText.content === 'string') {
          nextText.content = sanitizeTextHtmlMetrics(nextText.content);
        }
        shapeEl.text = nextText;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

export function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const latex = normalizeMathSource(latexStr);
        const html = renderMathToHtml(latex, { displayMode: true });

        return {
          ...el,
          latex,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}
