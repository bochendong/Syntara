'use client';

import { useEffect, useRef } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import Canvas from './Canvas';
import type { StageMode } from '@/lib/types/stage';
import { ScreenCanvas } from './ScreenCanvas';

/**
 * Slide Editor - wraps Canvas with SceneProvider
 */
export function SlideEditor({ mode }: { readonly mode: StageMode }) {
  const screenContainerRef = useRef<HTMLDivElement>(null);
  const setCanvasPercentage = useCanvasStore.use.setCanvasPercentage();
  const setCanvasDragged = useCanvasStore.use.setCanvasDragged();

  useEffect(() => {
    setCanvasPercentage(100);
    setCanvasDragged(false);

    return () => {
      setCanvasPercentage(100);
      setCanvasDragged(false);
    };
  }, [mode, setCanvasPercentage, setCanvasDragged]);

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
          <ScreenCanvas containerRef={screenContainerRef} />
        </div>
      )}
    </div>
  );
}
