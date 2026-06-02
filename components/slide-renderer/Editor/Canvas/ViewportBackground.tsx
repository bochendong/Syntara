'use client';

import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import { hasFullPageBitmapElement } from '@/lib/utils/slide-background-policy';

/**
 * Viewport background component using Scene Context
 * Renders the slide background from current scene data
 */
export function ViewportBackground() {
  // Subscribe only to background for performance
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );
  const viewportSize = useSceneSelector<SlideContent, number>(
    (content) => content.canvas.viewportSize ?? 1000,
  );
  const viewportRatio = useSceneSelector<SlideContent, number>(
    (content) => content.canvas.viewportRatio ?? 0.5625,
  );
  const hasFullPageBitmap = hasFullPageBitmapElement(elements, viewportSize, viewportRatio);

  const { backgroundStyle: bgStyle } = useSlideBackgroundStyle(background, {
    applyProfileStyle: true,
  });
  if (hasFullPageBitmap) return null;

  const backgroundStyle: React.CSSProperties = {
    ...bgStyle,
    width: '100%',
    height: '100%',
    backgroundPosition: 'center',
    position: 'absolute',
    pointerEvents: 'none', // Don't block mouse events
  };

  return <div className="viewport-background" style={backgroundStyle} />;
}
