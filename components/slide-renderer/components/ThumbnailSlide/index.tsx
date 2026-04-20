import { useMemo } from 'react';
import type { PPTElement, Slide } from '@/lib/types/slides';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { stripLegacyVerticalFlowMarkers } from '@/lib/utils/legacy-flow-markers';
import { ThumbnailElement } from './ThumbnailElement';

interface ThumbnailSlideProps {
  /** Slide data */
  readonly slide: Slide;
  /** Thumbnail width */
  readonly size: number;
  /** Viewport width base (default 1000px) */
  readonly viewportSize: number;
  /** Viewport aspect ratio (default 0.5625 i.e. 16:9) */
  readonly viewportRatio: number;
  /** Whether visible (for lazy loading optimization) */
  readonly visible?: boolean;
}

function hasBoxGeometry(element: PPTElement): element is PPTElement & { top: number; left: number; width: number; height: number } {
  return (
    typeof (element as { top?: unknown }).top === 'number' &&
    typeof (element as { left?: unknown }).left === 'number' &&
    typeof (element as { width?: unknown }).width === 'number' &&
    typeof (element as { height?: unknown }).height === 'number'
  );
}

function alignTwoCardLayoutRows(elements: PPTElement[]): PPTElement[] {
  const groups = new Map<string, Array<{ id: string; left: number; top: number; width: number; height: number }>>();
  elements.forEach((element) => {
    if (!hasBoxGeometry(element)) return;
    if (!element.groupId?.startsWith('layout_cards_')) return;
    const list = groups.get(element.groupId) || [];
    list.push({
      id: element.id,
      left: element.left,
      top: element.top,
      width: element.width,
      height: element.height,
    });
    groups.set(element.groupId, list);
  });
  if (groups.size === 0) return elements;

  const next = elements.map((element) => ({ ...element })) as PPTElement[];
  const byId = new Map(next.map((element) => [element.id, element] as const));

  for (const cards of groups.values()) {
    if (cards.length !== 2) continue;
    const [a, b] = cards;
    const horizontalSplit = Math.abs(a.left - b.left) > Math.min(a.width, b.width) * 0.45;
    if (!horizontalSplit) continue;
    const oldBottom = Math.max(a.top + a.height, b.top + b.height);
    const alignedTop = Math.min(a.top, b.top);
    const ae = byId.get(a.id);
    const be = byId.get(b.id);
    if (ae && hasBoxGeometry(ae)) ae.top = alignedTop;
    if (be && hasBoxGeometry(be)) be.top = alignedTop;
    const newBottom = Math.max(
      ae && hasBoxGeometry(ae) ? ae.top + ae.height : oldBottom,
      be && hasBoxGeometry(be) ? be.top + be.height : oldBottom,
    );
    const collapseDelta = Math.max(0, Math.round(oldBottom - newBottom));
    if (collapseDelta <= 0) continue;
    next.forEach((element) => {
      if (element.groupId === (ae?.groupId || be?.groupId)) return;
      if (element.type === 'line') {
        const minY = Math.min(element.start[1], element.end[1]);
        if (minY >= oldBottom - 1) {
          element.start = [element.start[0], element.start[1] - collapseDelta];
          element.end = [element.end[0], element.end[1] - collapseDelta];
        }
        return;
      }
      if (!hasBoxGeometry(element)) return;
      if (element.top >= oldBottom - 1) {
        element.top -= collapseDelta;
      }
    });
  }
  return next;
}

/**
 * Thumbnail slide component
 *
 * Renders a thumbnail preview of a single slide
 * Uses CSS transform scale to resize the entire view for better performance
 */
export function ThumbnailSlide({
  slide,
  size,
  viewportSize,
  viewportRatio,
  visible = true,
}: ThumbnailSlideProps) {
  // Calculate scale ratio
  const scale = useMemo(() => size / viewportSize, [size, viewportSize]);
  const elements = useMemo(
    () =>
      alignTwoCardLayoutRows(
        stripLegacyVerticalFlowMarkers(slide.elements.filter((element) => element.type !== 'shape')),
      ),
    [slide.elements],
  );

  // Get background style
  const { backgroundStyle } = useSlideBackgroundStyle(slide.background);

  if (!visible) {
    return (
      <div
        className="thumbnail-slide bg-white overflow-hidden select-none"
        style={{
          width: `${size}px`,
          height: `${size * viewportRatio}px`,
        }}
      >
        <div className="placeholder w-full h-full flex justify-center items-center text-gray-400 text-sm">
          加载中 ...
        </div>
      </div>
    );
  }

  return (
    <div
      className="thumbnail-slide bg-white overflow-hidden select-none"
      style={{
        width: `${size}px`,
        height: `${size * viewportRatio}px`,
      }}
    >
      <div
        className="elements origin-top-left"
        style={{
          width: `${viewportSize}px`,
          height: `${viewportSize * viewportRatio}px`,
          transform: `scale(${scale})`,
        }}
      >
        {/* Background */}
        <div className="background w-full h-full bg-center absolute" style={backgroundStyle} />

        {/* Render all elements */}
        {elements.map((element, index) => (
          <ThumbnailElement key={element.id} elementInfo={element} elementIndex={index + 1} />
        ))}
      </div>
    </div>
  );
}
