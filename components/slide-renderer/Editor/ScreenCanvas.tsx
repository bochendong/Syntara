'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { getElementListRange, getElementRange } from '@/lib/utils/element';
import { stripLegacyVerticalFlowMarkers } from '@/lib/utils/legacy-flow-markers';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';
import { FlowTimelineOverlay } from '../components/FlowTimelineOverlay';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from './Canvas/hooks/useViewportSize';
import { useCallback, useMemo, useState, type RefObject } from 'react';
import { AnimatePresence } from 'motion/react';

export interface ScreenCanvasProps {
  /** Fills the slide stage; used for viewport measurement and clipping (no extra wrapper inside). */
  readonly containerRef: RefObject<HTMLDivElement | null>;
}

const CONTENT_BOTTOM_PADDING = 24;
const TEXT_SHAPE_BIND_PADDING = 4;
const TITLE_BASELINE_LEFT = 64;
const FULL_ROW_BASELINE_WIDTH = 872;
const FULL_ROW_SNAP_MIN_WIDTH = 800;
const LEGACY_FULL_ROW_MIN_LEFT = 80;
const LEGACY_FULL_ROW_MAX_LEFT = 100;

type BoxGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function hasBoxGeometry(element: PPTElement): element is PPTElement & BoxGeometry {
  return (
    typeof (element as { left?: unknown }).left === 'number' &&
    typeof (element as { top?: unknown }).top === 'number' &&
    typeof (element as { width?: unknown }).width === 'number' &&
    typeof (element as { height?: unknown }).height === 'number'
  );
}

function getBindingShapeForText(
  textElement: PPTElement & BoxGeometry,
  shapeElements: Array<PPTElement & BoxGeometry>,
): (PPTElement & BoxGeometry) | null {
  const textRight = textElement.left + textElement.width;
  const textBottom = textElement.top + textElement.height;
  let chosen: (PPTElement & BoxGeometry) | null = null;
  let chosenArea = Number.POSITIVE_INFINITY;

  for (const shape of shapeElements) {
    const shapeRight = shape.left + shape.width;
    const shapeBottom = shape.top + shape.height;
    const contains =
      textElement.left >= shape.left + TEXT_SHAPE_BIND_PADDING &&
      textElement.top >= shape.top + TEXT_SHAPE_BIND_PADDING &&
      textRight <= shapeRight - TEXT_SHAPE_BIND_PADDING &&
      textBottom <= shapeBottom - TEXT_SHAPE_BIND_PADDING;
    if (!contains) continue;

    const area = shape.width * shape.height;
    if (area < chosenArea) {
      chosen = shape;
      chosenArea = area;
    }
  }

  if (chosen) return chosen;

  // Fallback: geometric nearest candidate when strict containment fails.
  let nearest: (PPTElement & BoxGeometry) | null = null;
  let nearestScore = Number.POSITIVE_INFINITY;
  for (const shape of shapeElements) {
    const shapeRight = shape.left + shape.width;
    const shapeBottom = shape.top + shape.height;
    const overlapWidth = Math.max(
      0,
      Math.min(textRight, shapeRight) - Math.max(textElement.left, shape.left),
    );
    const overlapRatio = overlapWidth / Math.max(1, Math.min(textElement.width, shape.width));
    if (overlapRatio < 0.6) continue;

    const verticalGap =
      textElement.top >= shapeBottom
        ? textElement.top - shapeBottom
        : textBottom <= shape.top
          ? shape.top - textBottom
          : 0;
    if (verticalGap > 320) continue;

    const widthPenalty = Math.abs(shape.width - textElement.width) / Math.max(shape.width, 1);
    const score = verticalGap + widthPenalty * 80;
    if (score < nearestScore) {
      nearest = shape;
      nearestScore = score;
    }
  }
  return nearest;
}

function deriveShapeGeometryFromBoundTexts(args: {
  elements: PPTElement[];
  textToShapeBinding: Map<string, string>;
}): PPTElement[] {
  if (args.textToShapeBinding.size === 0) return args.elements.map((element) => ({ ...element }));
  const cloned = args.elements.map((element) => ({ ...element })) as PPTElement[];
  const elementsById = new Map(cloned.map((element) => [element.id, element] as const));
  const shapeToTexts = new Map<string, Array<PPTElement & BoxGeometry>>();

  cloned.forEach((element) => {
    if (element.type !== 'text' || !hasBoxGeometry(element)) return;
    const shapeId = args.textToShapeBinding.get(element.id);
    if (!shapeId) return;
    const list = shapeToTexts.get(shapeId) || [];
    list.push(element);
    shapeToTexts.set(shapeId, list);
  });

  for (const [shapeId, texts] of shapeToTexts.entries()) {
    const shape = elementsById.get(shapeId);
    if (!shape || shape.type !== 'shape' || !hasBoxGeometry(shape)) continue;
    // Keep explicit shape.text-driven cards unchanged.
    if (shape.text?.content?.trim()) continue;
    if (texts.length === 0) continue;

    const minTop = Math.min(...texts.map((text) => text.top));
    const maxBottom = Math.max(...texts.map((text) => text.top + text.height));
    const newTop = Math.max(0, Math.floor(minTop - 12));
    const newBottom = Math.ceil(maxBottom + 12);
    const nextHeight = Math.max(40, newBottom - newTop);
    shape.top = newTop;
    shape.height = nextHeight;
  }

  return cloned;
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

export function ScreenCanvas({ containerRef }: ScreenCanvasProps) {
  const canvasScale = useCanvasStore.use.canvasScale();
  const rawElements = useSceneSelector<SlideContent, PPTElement[]>((content) =>
    content.canvas.elements.filter((element) => element.type !== 'shape'),
  );
  const elements = useMemo(() => stripLegacyVerticalFlowMarkers(rawElements), [rawElements]);
  const [autoHeights, setAutoHeights] = useState<Record<string, number>>({});

  const handleElementAutoHeightChange = useCallback((elementId: string, nextHeight: number) => {
    setAutoHeights((prev) => {
      const current = prev[elementId];
      const normalized = Math.ceil(nextHeight);
      if (!Number.isFinite(normalized) || normalized <= 0) return prev;
      if (current !== undefined && Math.abs(current - normalized) <= 1) return prev;
      return {
        ...prev,
        [elementId]: normalized,
      };
    });
  }, []);

  const activeAutoHeights = useMemo(() => {
    if (Object.keys(autoHeights).length === 0) return autoHeights;
    const validIds = new Set(elements.map((element) => element.id));
    return Object.fromEntries(
      Object.entries(autoHeights).filter(([elementId]) => validIds.has(elementId)),
    );
  }, [autoHeights, elements]);

  const adjustedElements = useMemo(() => {
    if (!elements.length) return elements;
    const shapeElements = elements.filter(
      (element): element is PPTElement & BoxGeometry =>
        element.type === 'shape' && hasBoxGeometry(element),
    );
    const textToShapeBinding = new Map<string, string>();

    elements.forEach((element) => {
      if (element.type !== 'text' || !hasBoxGeometry(element)) return;
      const shape = getBindingShapeForText(element, shapeElements);
      if (!shape) return;
      textToShapeBinding.set(element.id, shape.id);
    });

    const baseElements = deriveShapeGeometryFromBoundTexts({
      elements,
      textToShapeBinding,
    });
    const alignedElements = baseElements.map((element) => {
      if (!hasBoxGeometry(element)) return element;
      const isTextFullRow =
        element.type === 'text' &&
        (element.textType === 'title' || element.textType === 'notes');
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
    const anchorRequests: Record<string, number> = {};
    const textMirrorRequests: Record<string, number> = {};
    const elementById = new Map(alignedElements.map((element) => [element.id, element] as const));

    Object.entries(activeAutoHeights).forEach(([elementId, requestedHeight]) => {
      const sourceElement = elementById.get(elementId);
      if (!sourceElement || !hasBoxGeometry(sourceElement)) return;
      const normalizedHeight = Math.ceil(requestedHeight);
      if (!Number.isFinite(normalizedHeight) || normalizedHeight <= sourceElement.height + 1) return;

      if (sourceElement.type === 'text') {
        textMirrorRequests[elementId] = normalizedHeight;
        const bindingShapeId = textToShapeBinding.get(elementId);
        if (bindingShapeId) {
          const parentShape = elementById.get(bindingShapeId);
          if (parentShape && parentShape.type === 'shape' && hasBoxGeometry(parentShape)) {
            const textOffsetTop = Math.max(0, sourceElement.top - parentShape.top);
            const textBottomPadding = Math.max(
              0,
              parentShape.height - (sourceElement.top - parentShape.top + sourceElement.height),
            );
            const requiredShapeHeight = Math.ceil(
              textOffsetTop + normalizedHeight + textBottomPadding,
            );
            const prev = anchorRequests[bindingShapeId] || parentShape.height;
            anchorRequests[bindingShapeId] = Math.max(prev, requiredShapeHeight);
            return;
          }
        }
      }

      const prev = anchorRequests[elementId] || sourceElement.height;
      anchorRequests[elementId] = Math.max(prev, normalizedHeight);
    });

    const reflowed = applyAutoHeightReflow({
      elements: alignedElements,
      requestedHeights: anchorRequests,
    });
    if (Object.keys(textMirrorRequests).length === 0) return reflowed;

    return reflowed.map((element) => {
      const requested = textMirrorRequests[element.id];
      if (!requested) return element;
      if (element.type !== 'text') return element;
      if (!hasBoxGeometry(element)) return element;
      return {
        ...element,
        height: Math.max(element.height, requested),
      };
    });
  }, [activeAutoHeights, elements]);
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
        elementTopDelta = Math.abs((target as { top: number }).top - (source as { top: number }).top);
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
  const { backgroundStyle } = useSlideBackgroundStyle(background);

  const contentHeight = useMemo(() => {
    if (!adjustedElements.length) return viewportStyles.height;
    const { maxY } = getElementListRange(adjustedElements);
    return Math.max(viewportStyles.height, maxY + CONTENT_BOTTOM_PADDING);
  }, [adjustedElements, viewportStyles.height]);
  const fitScale = useMemo(
    () => Math.min(1, viewportStyles.height / contentHeight),
    [contentHeight, viewportStyles.height],
  );
  const fittedCanvasScale = canvasScale * fitScale;
  const fittedCanvasWidth = viewportStyles.width * fittedCanvasScale;
  const fittedCanvasHeight = contentHeight * fittedCanvasScale;
  const fittedCanvasLeft =
    viewportStyles.left + (viewportStyles.width * canvasScale - fittedCanvasWidth) / 2;

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
      {/* Background layer — chrome (shadow / 20px radius) lives on canvas-area parent */}
      <div className="h-full w-full bg-position-center" style={{ ...backgroundStyle }} />

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
          <ScreenElement
            key={element.id}
            elementInfo={element}
            elementIndex={index + 1}
            onElementAutoHeightChange={handleElementAutoHeightChange}
          />
        ))}

        <FlowTimelineOverlay
          elements={adjustedElements}
          viewportWidth={viewportStyles.width}
          contentHeight={contentHeight}
        />

        <HighlightOverlay />
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
