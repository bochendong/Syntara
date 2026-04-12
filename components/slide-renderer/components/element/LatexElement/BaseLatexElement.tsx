'use client';

import { useRef, useState, useLayoutEffect } from 'react';
import type { PPTLatexElement } from '@/lib/types/slides';
import { ElementOutline } from '../ElementOutline';

export interface BaseLatexElementProps {
  elementInfo: PPTLatexElement;
}

/**
 * Base latex element for read-only/playback mode.
 * Renders KaTeX HTML if available, falls back to legacy SVG path.
 */
export function BaseLatexElement({ elementInfo }: BaseLatexElementProps) {
  const resolvedFill = elementInfo.fill ?? '#f8fafc';
  const resolvedOutline =
    elementInfo.outline ??
    ({
      color: '#cbd5e1',
      width: 1,
      style: 'solid',
    } as const);
  return (
    <div
      className="base-element-latex absolute"
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="rotate-wrapper w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        <div
          className="element-content subpixel-antialiased relative w-full h-full overflow-hidden"
          style={{
            backgroundColor: resolvedFill,
            color: elementInfo.color,
          }}
        >
          <ElementOutline
            width={elementInfo.width}
            height={elementInfo.height}
            outline={resolvedOutline}
          />
          {elementInfo.html ? (
            <KatexContent
              html={elementInfo.html}
              width={elementInfo.width}
              height={elementInfo.height}
              align={elementInfo.align}
            />
          ) : elementInfo.path && elementInfo.viewBox ? (
            <svg
              overflow="visible"
              width={elementInfo.width}
              height={elementInfo.height}
              stroke={elementInfo.color}
              strokeWidth={elementInfo.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transform-origin-[0_0] overflow-visible"
            >
              <g
                transform={`scale(${elementInfo.width / elementInfo.viewBox[0]}, ${
                  elementInfo.height / elementInfo.viewBox[1]
                }) translate(0,0) matrix(1,0,0,1,0,0)`}
              >
                <path d={elementInfo.path} />
              </g>
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Formula boxes are often intentionally generous for layout safety.
// Cap automatic upscaling so playback does not make equations look oversized.
const MAX_KATEX_UPSCALE = 1.15;

function KatexContent({
  html,
  width,
  height,
  align = 'center',
}: {
  html: string;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!innerRef.current) return;
    const naturalW = innerRef.current.scrollWidth;
    const naturalH = innerRef.current.scrollHeight;
    if (naturalW > 0 && naturalH > 0) {
      const fittedScale = Math.min(width / naturalW, height / naturalH);
      setScale(Math.min(MAX_KATEX_UPSCALE, fittedScale));
    }
  }, [html, width, height]);

  // Playback should present formulas like the editor preview: visually centered on the slide.
  const justify = 'center';
  const origin = 'center center';

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
      }}
    >
      <div
        ref={innerRef}
        className="[&_.katex-display]:!m-0"
        style={{
          display: 'inline-block',
          transformOrigin: origin,
          transform: `scale(${scale})`,
          whiteSpace: 'nowrap',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
