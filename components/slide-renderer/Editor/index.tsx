'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import Canvas from './Canvas';
import type { SlideContent, StageMode } from '@/lib/types/stage';
import type { PPTElement } from '@/lib/types/slides';
import { hasFullPageBitmapElement } from '@/lib/utils/slide-background-policy';
import { ScreenCanvas } from './ScreenCanvas';

const DEFAULT_EDITOR_CANVAS_PERCENTAGE = 92;

/**
 * Slide Editor - wraps Canvas with SceneProvider
 */
export function SlideEditor({
  mode,
  showMaskDebugOverlay = false,
}: {
  readonly mode: StageMode;
  readonly showMaskDebugOverlay?: boolean;
}) {
  const screenContainerRef = useRef<HTMLDivElement>(null);
  const setCanvasPercentage = useCanvasStore.use.setCanvasPercentage();
  const setCanvasDragged = useCanvasStore.use.setCanvasDragged();
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
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
  const canvasPercentage =
    mode === 'playback' && hasFullPageBitmap ? 100 : DEFAULT_EDITOR_CANVAS_PERCENTAGE;

  useLayoutEffect(() => {
    setCanvasPercentage(canvasPercentage);
    setCanvasDragged(false);

    return () => {
      setCanvasPercentage(DEFAULT_EDITOR_CANVAS_PERCENTAGE);
      setCanvasDragged(false);
    };
  }, [canvasPercentage, setCanvasPercentage, setCanvasDragged]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(203,213,225,0.9),transparent_36%),linear-gradient(180deg,#eef3f8_0%,#e2e8f0_100%)] transition-colors duration-300 dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.3),transparent_40%),linear-gradient(180deg,#141821_0%,#0d1118_100%)]">
      {mode === 'autonomous' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Canvas />
        </div>
      ) : (
        <div
          ref={screenContainerRef}
          className="relative h-full min-h-0 w-full flex-1 overflow-hidden select-none"
        >
          <ScreenCanvas
            containerRef={screenContainerRef}
            showMaskDebugOverlay={showMaskDebugOverlay}
          />
        </div>
      )}
    </div>
  );
}
