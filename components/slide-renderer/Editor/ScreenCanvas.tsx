'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { getElementRange } from '@/lib/utils/element';
import { stripLegacyVerticalFlowMarkers } from '@/lib/utils/legacy-flow-markers';
import { FlowTimelineOverlay } from '../components/FlowTimelineOverlay';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from './Canvas/hooks/useViewportSize';
import { useMemo, type RefObject } from 'react';
import { AnimatePresence } from 'motion/react';
import { hasFullPageBitmapElement } from '@/lib/utils/slide-background-policy';
import { isImageNotebookFocusElement } from '@/lib/utils/image-notebook-focus-elements';

export interface ScreenCanvasProps {
  /** Fills the slide stage; used for viewport measurement and clipping (no extra wrapper inside). */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** Debug-only overlay that shows every image-notebook mask region. */
  readonly showMaskDebugOverlay?: boolean;
}

const TITLE_BASELINE_LEFT = 64;
const FULL_ROW_BASELINE_WIDTH = 872;
const FULL_ROW_SNAP_MIN_WIDTH = 800;
const LEGACY_FULL_ROW_MIN_LEFT = 80;
const LEGACY_FULL_ROW_MAX_LEFT = 100;
const LEGACY_COVER_REFLOW_TOP = 340;
const LEGACY_COVER_REFLOW_DELTA = 260;

type BoxGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const MASK_REGION_COLORS = [
  { border: 'rgba(37, 99, 235, 0.92)', bg: 'rgba(59, 130, 246, 0.16)', dot: '#0b73f6' },
  { border: 'rgba(22, 163, 74, 0.88)', bg: 'rgba(34, 197, 94, 0.14)', dot: '#16a34a' },
  { border: 'rgba(217, 119, 6, 0.9)', bg: 'rgba(245, 158, 11, 0.16)', dot: '#d89a14' },
  { border: 'rgba(124, 58, 237, 0.88)', bg: 'rgba(139, 92, 246, 0.14)', dot: '#7c3aed' },
  { border: 'rgba(14, 165, 233, 0.88)', bg: 'rgba(14, 165, 233, 0.14)', dot: '#0284c7' },
] as const;

function hasBoxGeometry(element: PPTElement): element is PPTElement & BoxGeometry {
  return (
    typeof (element as { left?: unknown }).left === 'number' &&
    typeof (element as { top?: unknown }).top === 'number' &&
    typeof (element as { width?: unknown }).width === 'number' &&
    typeof (element as { height?: unknown }).height === 'number'
  );
}

function MaskDebugOverlay({
  elements,
  zIndex,
}: {
  readonly elements: PPTElement[];
  readonly zIndex: number;
}) {
  const maskElements = elements.filter(
    (element) => isImageNotebookFocusElement(element) && hasBoxGeometry(element),
  );

  if (maskElements.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-mask-debug-overlay="true"
      style={{ zIndex }}
    >
      {maskElements.map((element, index) => {
        const { minX, maxX, minY, maxY } = getElementRange(element);
        const color = MASK_REGION_COLORS[index % MASK_REGION_COLORS.length];
        return (
          <div
            key={element.id}
            className="absolute rounded-[10px]"
            style={{
              left: minX,
              top: minY,
              width: Math.max(1, maxX - minX),
              height: Math.max(1, maxY - minY),
              border: `2.5px dashed ${color.border}`,
              background: color.bg,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.85), 0 10px 28px rgba(15,23,42,0.10)`,
            }}
          >
            <div
              className="absolute -left-2.5 -top-2.5 flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-white"
              style={{ backgroundColor: color.dot }}
            >
              {index + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isTitleCoverVersionMarker(element: PPTElement): boolean {
  return element.type === 'text' && /syntara-cover-v\d+/i.test(element.content || '');
}

function isLegacyCoverMarker(element: PPTElement): boolean {
  return element.type === 'text' && /syntara-cover-v[2-8]/i.test(element.content || '');
}

function splitLegacyCoverTitle(content: string): string {
  if (/<br\s*\/?>/i.test(content)) return content;
  return content.replace(/(：|:)/, '$1<br/>');
}

function reflowLegacyCoverElements(elements: PPTElement[]): PPTElement[] {
  const legacyCoverElements = elements.filter((element) => !isTitleCoverVersionMarker(element));
  if (!elements.some(isLegacyCoverMarker)) {
    return legacyCoverElements.length === elements.length ? elements : legacyCoverElements;
  }

  return legacyCoverElements.map((element) => {
    if (!hasBoxGeometry(element)) return element;
    if (element.type === 'text' && element.textType === 'title') {
      return {
        ...element,
        content: splitLegacyCoverTitle(element.content),
        width: Math.max(element.width, 700),
        height: Math.max(element.height, 150),
        top: Math.max(0, element.top - LEGACY_COVER_REFLOW_DELTA),
      };
    }
    if (element.top < LEGACY_COVER_REFLOW_TOP) return element;
    return {
      ...element,
      top: Math.max(0, element.top - LEGACY_COVER_REFLOW_DELTA),
    };
  });
}

function alignTwoCardLayoutRows(elements: PPTElement[]): PPTElement[] {
  const groups = new Map<string, Array<{ id: string; left: number; top: number; width: number }>>();
  elements.forEach((element) => {
    if (!hasBoxGeometry(element)) return;
    if (!element.groupId?.startsWith('layout_cards_')) return;
    const list = groups.get(element.groupId) || [];
    list.push({ id: element.id, left: element.left, top: element.top, width: element.width });
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
    const oldBottom =
      Math.max(a.top, b.top) +
      Math.max(
        byId.get(a.id) && hasBoxGeometry(byId.get(a.id) as PPTElement)
          ? (byId.get(a.id) as PPTElement & BoxGeometry).height
          : 0,
        byId.get(b.id) && hasBoxGeometry(byId.get(b.id) as PPTElement)
          ? (byId.get(b.id) as PPTElement & BoxGeometry).height
          : 0,
      );
    const top = Math.min(a.top, b.top);
    const ae = byId.get(a.id);
    const be = byId.get(b.id);
    if (ae && hasBoxGeometry(ae)) ae.top = top;
    if (be && hasBoxGeometry(be)) be.top = top;
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

function getPercentageGeometryForElement(
  element: PPTElement,
  viewportWidth: number,
  contentHeight: number,
): PercentageGeometry {
  const { minX, maxX, minY, maxY } = getElementRange(element);
  const width = maxX - minX;
  const height = maxY - minY;
  const x = (minX / viewportWidth) * 100;
  const y = (minY / contentHeight) * 100;
  const w = (width / viewportWidth) * 100;
  const h = (height / contentHeight) * 100;

  return {
    x,
    y,
    w,
    h,
    centerX: x + w / 2,
    centerY: y + h / 2,
  };
}

export function ScreenCanvas({ containerRef, showMaskDebugOverlay = false }: ScreenCanvasProps) {
  const canvasScale = useCanvasStore.use.canvasScale();
  const rawElements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );
  const elements = useMemo(() => stripLegacyVerticalFlowMarkers(rawElements), [rawElements]);
  const adjustedElements = useMemo(() => {
    if (!elements.length) return elements;
    // Screen playback is now a pure projection of stored geometry.
    // We keep deterministic baseline snapping here, but do not measure DOM and
    // do not mutate height/top after mount.
    const legacyCoverAdjusted = reflowLegacyCoverElements(elements);
    const baselineAdjusted = legacyCoverAdjusted.map((element) => {
      if (!hasBoxGeometry(element)) return element;
      const isTextFullRow =
        element.type === 'text' && (element.textType === 'title' || element.textType === 'notes');
      const isLatexFullRow = element.type === 'latex';
      if (!isTextFullRow && !isLatexFullRow) return element;
      if (element.width < FULL_ROW_SNAP_MIN_WIDTH) return element;
      if (element.left < LEGACY_FULL_ROW_MIN_LEFT || element.left > LEGACY_FULL_ROW_MAX_LEFT) {
        return element;
      }
      return {
        ...element,
        left: TITLE_BASELINE_LEFT,
        width: FULL_ROW_BASELINE_WIDTH,
      };
    });
    return alignTwoCardLayoutRows(baselineAdjusted);
  }, [elements]);
  const reflowStats = useMemo(() => {
    if (!elements.length || elements.length !== adjustedElements.length) {
      return { adjustedCount: 0, maxHeightDelta: 0, maxTopDelta: 0 };
    }
    let adjustedCount = 0;
    let maxHeightDelta = 0;
    let maxTopDelta = 0;
    for (let i = 0; i < elements.length; i += 1) {
      const source = elements[i];
      const target = adjustedElements[i];
      let elementTopDelta = 0;
      let elementHeightDelta = 0;
      if (
        typeof (source as { top?: unknown }).top === 'number' &&
        typeof (target as { top?: unknown }).top === 'number'
      ) {
        elementTopDelta = Math.abs(
          (target as { top: number }).top - (source as { top: number }).top,
        );
        maxTopDelta = Math.max(maxTopDelta, elementTopDelta);
      }
      if (
        typeof (source as { height?: unknown }).height === 'number' &&
        typeof (target as { height?: unknown }).height === 'number'
      ) {
        elementHeightDelta = Math.abs(
          (target as { height: number }).height - (source as { height: number }).height,
        );
        maxHeightDelta = Math.max(maxHeightDelta, elementHeightDelta);
      }
      if (elementTopDelta > 0 || elementHeightDelta > 0) {
        adjustedCount += 1;
      }
    }
    return { adjustedCount, maxHeightDelta, maxTopDelta };
  }, [adjustedElements, elements]);

  // Viewport size and positioning
  const { viewportStyles } = useViewportSize(containerRef);

  // Get background style
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );
  const viewportSize = useSceneSelector<SlideContent, number>(
    (content) => content.canvas.viewportSize ?? 1000,
  );
  const viewportRatio = useSceneSelector<SlideContent, number>(
    (content) => content.canvas.viewportRatio ?? 0.5625,
  );
  const hasFullPageBitmap = useMemo(
    () => hasFullPageBitmapElement(elements, viewportSize, viewportRatio),
    [elements, viewportRatio, viewportSize],
  );
  const { backgroundStyle } = useSlideBackgroundStyle(background, {
    applyProfileStyle: !hasFullPageBitmap,
  });
  const canvasBackgroundStyle = hasFullPageBitmap
    ? { backgroundColor: 'transparent' }
    : backgroundStyle;

  const contentHeight = viewportStyles.height;
  const fittedCanvasScale = canvasScale;
  const fittedCanvasWidth = viewportStyles.width * fittedCanvasScale;
  const fittedCanvasHeight = viewportStyles.height * fittedCanvasScale;
  const fittedCanvasLeft = viewportStyles.left;

  // Get visual effect state
  const laserElementId = useCanvasStore.use.laserElementId();
  const laserOptions = useCanvasStore.use.laserOptions();
  const zoomTarget = useCanvasStore.use.zoomTarget();

  // Compute laser pointer geometry
  const laserGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!laserElementId) return null;
    const element = adjustedElements.find((el) => el.id === laserElementId);
    if (!element) return null;
    return getPercentageGeometryForElement(element, viewportStyles.width, contentHeight);
  }, [adjustedElements, contentHeight, laserElementId, viewportStyles.width]);

  // Compute zoom target geometry
  const zoomGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!zoomTarget) return null;
    const element = adjustedElements.find((el) => el.id === zoomTarget.elementId);
    if (!element) return null;
    return getPercentageGeometryForElement(element, viewportStyles.width, contentHeight);
  }, [adjustedElements, contentHeight, viewportStyles.width, zoomTarget]);

  return (
    <div
      className="absolute overflow-hidden transition-transform duration-700"
      style={{
        width: `${fittedCanvasWidth}px`,
        height: `${fittedCanvasHeight}px`,
        left: `${fittedCanvasLeft}px`,
        top: `${viewportStyles.top}px`,
        ...(zoomTarget && zoomGeometry
          ? {
              transform: `scale(${zoomTarget.scale})`,
              transformOrigin: `${zoomGeometry.centerX}% ${zoomGeometry.centerY}%`,
            }
          : {}),
      }}
    >
      {!hasFullPageBitmap ? (
        <div className="h-full w-full bg-position-center" style={canvasBackgroundStyle} />
      ) : null}

      {/* Content layer - logical slide size, scaled to viewport */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        data-reflow-adjusted-count={reflowStats.adjustedCount}
        data-reflow-max-height-delta={reflowStats.maxHeightDelta}
        data-reflow-max-top-delta={reflowStats.maxTopDelta}
        style={{
          width: `${viewportStyles.width}px`,
          height: `${contentHeight}px`,
          transform: `scale(${fittedCanvasScale})`,
        }}
      >
        {adjustedElements.map((element, index) => (
          <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} />
        ))}

        <FlowTimelineOverlay
          elements={adjustedElements}
          viewportWidth={viewportStyles.width}
          contentHeight={contentHeight}
        />

        <HighlightOverlay />

        {showMaskDebugOverlay ? (
          <MaskDebugOverlay elements={adjustedElements} zIndex={adjustedElements.length + 20} />
        ) : null}
      </div>

      <SpotlightOverlay />

      <div className="pointer-events-none absolute inset-0" style={{ padding: '5%' }}>
        <div className="relative h-full w-full">
          <AnimatePresence>
            {laserElementId && laserGeometry && (
              <LaserOverlay
                key={`laser-${laserElementId}`}
                geometry={laserGeometry}
                color={laserOptions?.color}
                duration={laserOptions?.duration}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
