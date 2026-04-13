'use client';

import { useId, useMemo } from 'react';
import type { PPTElementOutline } from '@/lib/types/slides';
import { useElementOutline } from './hooks/useElementOutline';

type OutlineTone = 'default' | 'primary' | 'neutral';

export interface ElementOutlineProps {
  width: number;
  height: number;
  outline?: PPTElementOutline;
  cornerRadius?: number;
  softStroke?: boolean;
  tone?: OutlineTone;
}

function mixHexColor(base: string, target: string, weight: number): string {
  const normalizedWeight = Math.max(0, Math.min(1, weight));
  const hexToRgb = (value: string): [number, number, number] | null => {
    const hex = value.replace('#', '').trim();
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    return null;
  };
  const rgbToHex = (r: number, g: number, b: number): string => {
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return `#${[clamp(r), clamp(g), clamp(b)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')}`;
  };

  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) return base;

  return rgbToHex(
    baseRgb[0] * (1 - normalizedWeight) + targetRgb[0] * normalizedWeight,
    baseRgb[1] * (1 - normalizedWeight) + targetRgb[1] * normalizedWeight,
    baseRgb[2] * (1 - normalizedWeight) + targetRgb[2] * normalizedWeight,
  );
}

/**
 * Element outline (border) component
 * Renders an SVG outline around an element based on outline configuration
 */
export function ElementOutline({
  width,
  height,
  outline,
  cornerRadius = 0,
  softStroke = false,
  tone = 'default',
}: ElementOutlineProps) {
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline);
  const outlineId = useId();
  const gradientStart = useMemo(() => {
    if (tone === 'primary') return mixHexColor(outlineColor, '#ffffff', 0.56);
    if (tone === 'neutral') return mixHexColor(outlineColor, '#ffffff', 0.42);
    return mixHexColor(outlineColor, '#ffffff', 0.3);
  }, [outlineColor, tone]);
  const gradientEnd = useMemo(() => {
    if (tone === 'primary') return mixHexColor(outlineColor, '#1e293b', 0.22);
    if (tone === 'neutral') return mixHexColor(outlineColor, '#334155', 0.16);
    return mixHexColor(outlineColor, '#0f172a', 0.1);
  }, [outlineColor, tone]);
  const glowColor = useMemo(() => {
    if (tone === 'primary') return mixHexColor(outlineColor, '#93c5fd', 0.34);
    if (tone === 'neutral') return mixHexColor(outlineColor, '#cbd5e1', 0.24);
    return outlineColor;
  }, [outlineColor, tone]);
  const outerOpacity = tone === 'primary' ? 0.32 : tone === 'neutral' ? 0.22 : 0.18;
  const glowWidthBoost = tone === 'primary' ? 1.8 : 1.3;
  const inset = outlineWidth / 2;
  const innerWidth = Math.max(0, width - outlineWidth);
  const innerHeight = Math.max(0, height - outlineWidth);
  const maxRadius = Math.max(0, Math.min(innerWidth, innerHeight) / 2);
  const radius = Math.min(Math.max(cornerRadius, 0), maxRadius);
  const hasInnerHighlight = innerWidth > 2 && innerHeight > 2 && outlineWidth >= 1;

  if (!outline) return null;

  return (
    <svg
      className="element-outline absolute top-0 left-0 overflow-visible"
      width={width}
      height={height}
    >
      {softStroke && (
        <defs>
          <linearGradient id={`${outlineId}-gradient`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={gradientStart} />
            <stop offset="48%" stopColor={outlineColor} />
            <stop offset="100%" stopColor={gradientEnd} />
          </linearGradient>
        </defs>
      )}
      {softStroke && (
        <rect
          x={inset}
          y={inset}
          width={innerWidth}
          height={innerHeight}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={glowColor}
          strokeWidth={outlineWidth + glowWidthBoost}
          strokeOpacity={outerOpacity}
          strokeDasharray={strokeDashArray}
        />
      )}
      <rect
        x={inset}
        y={inset}
        width={innerWidth}
        height={innerHeight}
        rx={radius}
        ry={radius}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeLinejoin="round"
        strokeMiterlimit="8"
        fill="transparent"
        stroke={softStroke ? `url(#${outlineId}-gradient)` : outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
      {softStroke && hasInnerHighlight && (
        <rect
          x={inset + 0.8}
          y={inset + 0.8}
          width={Math.max(0, innerWidth - 1.6)}
          height={Math.max(0, innerHeight - 1.6)}
          rx={Math.max(0, radius - 0.8)}
          ry={Math.max(0, radius - 0.8)}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={tone === 'primary' ? 0.32 : 0.2}
          strokeWidth={0.9}
        />
      )}
    </svg>
  );
}
