import { useMemo } from 'react';
import { resolveEffectiveSlideBackground } from '@/lib/constants/slide-backgrounds';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { SlideBackground } from '@/lib/types/slides';

function cssUrl(src: string): string {
  return `url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

/**
 * Convert slide background data to CSS styles
 */
export function useSlideBackgroundStyle(background: SlideBackground | undefined) {
  const slideBackgroundStyleId = useUserProfileStore((s) => s.slideBackgroundStyleId);

  const backgroundStyle = useMemo<React.CSSProperties>(() => {
    const effectiveBackground = resolveEffectiveSlideBackground(background, slideBackgroundStyleId);
    if (!effectiveBackground) return { backgroundColor: '#fff' };

    const { type, color, image, gradient } = effectiveBackground;

    // Solid color background
    if (type === 'solid') return { backgroundColor: color };

    // Image background mode
    // Includes: background image, background size, whether to repeat
    if (type === 'image' && image) {
      const { src, size } = image;
      if (!src) return { backgroundColor: '#fff' };
      if (size === 'repeat') {
        return {
          backgroundImage: cssUrl(src),
          backgroundRepeat: 'repeat',
          backgroundPosition: 'center',
          backgroundSize: 'contain',
        };
      }
      return {
        backgroundImage: cssUrl(src),
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: size || 'cover',
      };
    }

    // Gradient background
    if (type === 'gradient' && gradient) {
      const { type, colors, rotate } = gradient;
      const list = colors.map((item) => `${item.color} ${item.pos}%`);

      if (type === 'radial') {
        return { backgroundImage: `radial-gradient(${list.join(',')})` };
      }
      return {
        backgroundImage: `linear-gradient(${rotate}deg, ${list.join(',')})`,
      };
    }

    return { backgroundColor: '#fff' };
  }, [background, slideBackgroundStyleId]);

  return {
    backgroundStyle,
  };
}
