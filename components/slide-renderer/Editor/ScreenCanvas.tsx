'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useSceneData } from '@/lib/contexts/scene-context';
import { getElementListRange, getElementRange } from '@/lib/utils/element';
import { stripLegacyVerticalFlowMarkers } from '@/lib/utils/legacy-flow-markers';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';
import { FlowTimelineOverlay } from '../components/FlowTimelineOverlay';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from './Canvas/hooks/useViewportSize';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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

function isAutoHeightEligibleElement(element: PPTElement): boolean {
  if (element.type !== 'text') return true;
  const groupId = element.groupId || '';
  if (groupId.startsWith('grid_cell_') || groupId.startsWith('layout_cards_')) {
    return false;
  }
  return true;
}

function stabilizeLayoutCardsRows(elements: PPTElement[]): PPTElement[] {
  const grouped = new Map<string, Array<PPTElement & BoxGeometry>>();
  elements.forEach((element) => {
    if (element.type !== 'text' || !hasBoxGeometry(element)) return;
    const groupId = element.groupId || '';
    if (!groupId.startsWith('layout_cards_')) return;
    const list = grouped.get(groupId) || [];
    list.push(element);
    grouped.set(groupId, list);
  });

  if (grouped.size === 0) return elements;
  const cloned = elements.map((element) => ({ ...element })) as PPTElement[];
  const byId = new Map(cloned.map((element) => [element.id, element] as const));

  grouped.forEach((cards) => {
    if (cards.length !== 2) return;
    const [leftCard, rightCard] = cards.sort((a, b) => a.left - b.left);
    const widthRatio = Math.min(leftCard.width, rightCard.width) / Math.max(leftCard.width, rightCard.width);
    if (widthRatio < 0.85) return;
    const horizontalGap = Math.abs(rightCard.left - leftCard.left);
    const minTwoColumnGap = Math.max(80, Math.min(leftCard.width, rightCard.width) * 0.45);
    // Only enforce row alignment for clearly two-column cards.
    if (horizontalGap < minTwoColumnGap) return;
    const topDelta = Math.abs(leftCard.top - rightCard.top);
    if (topDelta <= 12) return;

    const targetTop = Math.min(leftCard.top, rightCard.top);
    const targetHeight = Math.max(leftCard.height, rightCard.height);
    const leftTarget = byId.get(leftCard.id);
    const rightTarget = byId.get(rightCard.id);
    if (!leftTarget || !rightTarget) return;
    if (!hasBoxGeometry(leftTarget) || !hasBoxGeometry(rightTarget)) return;

    leftTarget.top = targetTop;
    rightTarget.top = targetTop;
    leftTarget.height = targetHeight;
    rightTarget.height = targetHeight;
  });

  return cloned;
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
  const { updateSceneData } = useSceneData<SlideContent>();
  const canvasScale = useCanvasStore.use.canvasScale();
  const semanticLayoutMode = useSceneSelector<SlideContent, 'stack' | 'grid' | null>((content) =>
    content.semanticDocument?.layout?.mode === 'grid' ? 'grid' : content.semanticDocument?.layout?.mode || null,
  );
  const rawElements = useSceneSelector<SlideContent, PPTElement[]>((content) =>
    content.canvas.elements.filter((element) => element.type !== 'shape'),
  );
  const elements = useMemo(() => stripLegacyVerticalFlowMarkers(rawElements), [rawElements]);
  const [autoHeights, setAutoHeights] = useState<Record<string, number>>({});
  const isAutoHeightEligible = useCallback(
    (element: PPTElement) => {
      if (semanticLayoutMode === 'grid' && element.type === 'text') {
        return false;
      }
      return isAutoHeightEligibleElement(element);
    },
    [semanticLayoutMode],
  );

  const handleElementAutoHeightChange = useCallback((elementId: string, nextHeight: number) => {
    setAutoHeights((prev) => {
      const source = elements.find((element) => element.id === elementId);
      if (!source || !isAutoHeightEligible(source)) {
        if (prev[elementId] === undefined) return prev;
        const next = { ...prev };
        delete next[elementId];
        return next;
      }
      const current = prev[elementId];
      const normalized = Math.ceil(nextHeight);
      if (!Number.isFinite(normalized) || normalized <= 0) return prev;
      if (current !== undefined && Math.abs(current - normalized) <= 1) return prev;
      return {
        ...prev,
        [elementId]: normalized,
      };
    });
  }, [elements, isAutoHeightEligible]);

  const activeAutoHeights = useMemo(() => {
    if (Object.keys(autoHeights).length === 0) return autoHeights;
    const validIds = new Set(
      elements.filter((element) => isAutoHeightEligible(element)).map((element) => element.id),
    );
    return Object.fromEntries(
      Object.entries(autoHeights).filter(([elementId]) => validIds.has(elementId)),
    );
  }, [autoHeights, elements, isAutoHeightEligible]);

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
      if (!Number.isFinite(normalizedHeight) || normalizedHeight <= 0) return;
      const heightDelta = normalizedHeight - sourceElement.height;
      if (Math.abs(heightDelta) <= 1) return;

      if (sourceElement.type === 'text') {
        // Keep text boxes close to measured content, including shrink-back.
        textMirrorRequests[elementId] = normalizedHeight;
        const bindingShapeId = textToShapeBinding.get(elementId);
        if (bindingShapeId && heightDelta > 1) {
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

      if (heightDelta <= 1) return;
      const prev = anchorRequests[elementId] || sourceElement.height;
      anchorRequests[elementId] = Math.max(prev, normalizedHeight);
    });

    const reflowed = applyAutoHeightReflow({
      elements: alignedElements,
      requestedHeights: anchorRequests,
    });
    if (Object.keys(textMirrorRequests).length === 0) return stabilizeLayoutCardsRows(reflowed);

    return stabilizeLayoutCardsRows(
      reflowed.map((element) => {
        const requested = textMirrorRequests[element.id];
        if (!requested) return element;
        if (element.type !== 'text') return element;
        if (!hasBoxGeometry(element)) return element;
        return {
          ...element,
          height: Math.max(24, requested),
        };
      }),
    );
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
  const persistReflowRafRef = useRef<number | null>(null);
  const lastPersistSignatureRef = useRef('');

  useEffect(() => {
    const changedGeometry = adjustedElements
      .map((target, index) => {
        const source = elements[index];
        if (!source) return null;
        if (!hasBoxGeometry(source) || !hasBoxGeometry(target)) return null;
        if (source.id !== target.id) return null;
        if (Math.abs(source.top - target.top) <= 1 && Math.abs(source.height - target.height) <= 1) {
          return null;
        }
        return {
          id: target.id,
          top: target.top,
          height: target.height,
        };
      })
      .filter(Boolean) as Array<{ id: string; top: number; height: number }>;

    if (changedGeometry.length === 0) return;
    const signature = changedGeometry
      .map((item) => `${item.id}:${Math.round(item.top)}:${Math.round(item.height)}`)
      .join('|');
    if (signature === lastPersistSignatureRef.current) return;

    if (persistReflowRafRef.current) cancelAnimationFrame(persistReflowRafRef.current);
    persistReflowRafRef.current = requestAnimationFrame(() => {
      const geometryById = new Map(changedGeometry.map((item) => [item.id, item] as const));
      updateSceneData((draft) => {
        if (!draft || (draft as SlideContent).type !== 'slide') return;
        const slideDraft = draft as SlideContent;
        slideDraft.canvas.elements = slideDraft.canvas.elements.map((element) => {
          const next = geometryById.get(element.id);
          if (!next) return element;
          if (!hasBoxGeometry(element)) return element;
          return {
            ...element,
            top: next.top,
            height: next.height,
          };
        });
      });
      lastPersistSignatureRef.current = signature;
    });

    return () => {
      if (persistReflowRafRef.current) {
        cancelAnimationFrame(persistReflowRafRef.current);
        persistReflowRafRef.current = null;
      }
    };
  }, [adjustedElements, elements, updateSceneData]);

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
