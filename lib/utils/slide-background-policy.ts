import type { PPTElement, SlideBackground } from '@/lib/types/slides';

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function hasFullPageBitmapElement(
  elements: readonly PPTElement[] | undefined,
  viewportSize = 1000,
  viewportRatio = 0.5625,
): boolean {
  if (!elements?.length) return false;

  const canvasWidth = numberOr(viewportSize, 1000);
  const canvasHeight = canvasWidth * numberOr(viewportRatio, 0.5625);

  return elements.some((element) => {
    if (element.type !== 'image') return false;
    if (/full_page_bitmap/i.test(element.name || '')) return true;
    if (element.imageType === 'pageFigure') return true;
    if (/\/generated-notebooks\//.test(element.src || '')) return true;

    const left = numberOr(element.left, Number.POSITIVE_INFINITY);
    const top = numberOr(element.top, Number.POSITIVE_INFINITY);
    const width = numberOr(element.width, 0);
    const height = numberOr(element.height, 0);

    return (
      left <= canvasWidth * 0.03 &&
      top <= canvasHeight * 0.03 &&
      width >= canvasWidth * 0.94 &&
      height >= canvasHeight * 0.94
    );
  });
}

export function preserveSlideBackground(background: SlideBackground | undefined): SlideBackground {
  if (!background) {
    return { type: 'solid', color: '#0f172a', respectProfileStyle: false };
  }
  if (background.respectProfileStyle === false) return background;
  return { ...background, respectProfileStyle: false };
}
