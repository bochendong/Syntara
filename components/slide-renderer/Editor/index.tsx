'use client';

import { useRef } from 'react';
import Canvas from './Canvas';
import type { StageMode } from '@/lib/types/stage';
import { ScreenCanvas } from './ScreenCanvas';

/**
 * Slide Editor - wraps Canvas with SceneProvider
 */
export function SlideEditor({ mode }: { readonly mode: StageMode }) {
  const screenContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
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
