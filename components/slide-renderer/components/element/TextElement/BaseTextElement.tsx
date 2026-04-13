'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { PPTTextElement } from '@/lib/types/slides';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { useElementShadow } from '../hooks/useElementShadow';
import { ElementOutline } from '../ElementOutline';
import { TEXT_BOX_PADDING_PX } from '@/lib/slide-text-layout';

export interface BaseTextElementProps {
  elementInfo: PPTTextElement;
  target?: string;
  onAutoHeightChange?: (nextHeight: number) => void;
}

function compactHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
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
 * Base text element component (read-only)
 * Renders static text content with styling
 */
export function BaseTextElement({ elementInfo, target, onAutoHeightChange }: BaseTextElementProps) {
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const proseRef = useRef<HTMLDivElement>(null);
  const titleCardFallbackFill = elementInfo.textType === 'title' ? '#eff6ff' : undefined;
  const notesCardFallbackFill = elementInfo.textType === 'notes' ? '#f8fafc' : undefined;
  const resolvedFill = elementInfo.fill ?? titleCardFallbackFill ?? notesCardFallbackFill;
  const effectiveFill = elementInfo.textType === 'title' ? 'transparent' : resolvedFill;
  const resolvedOutline =
    elementInfo.outline ??
    (elementInfo.textType === 'title'
      ? {
          color: '#bfdbfe',
          width: 1,
          style: 'solid' as const,
        }
      : elementInfo.textType === 'notes'
        ? {
            color: '#cbd5e1',
            width: 1,
            style: 'solid' as const,
          }
      : undefined);
  const effectiveOutline = elementInfo.textType === 'title' ? undefined : resolvedOutline;
  const renderedContent = useMemo(
    () => renderHtmlWithLatex(elementInfo.content),
    [elementInfo.content],
  );
  const compactContent = compactHtmlText(elementInfo.content || '');
  const shouldHideLegacyStepBadge =
    elementInfo.width <= 30 &&
    elementInfo.height <= 50 &&
    (resolvedOutline?.color || '').trim().toLowerCase() === '#cbd5e1' &&
    /^\d{1,2}$/.test(compactContent);
  const isCompactNotesCaption = elementInfo.textType === 'notes' && elementInfo.height <= 48;
  const outlineCornerRadius =
    elementInfo.textType === 'title'
      ? 16
      : elementInfo.textType === 'notes'
        ? isCompactNotesCaption
          ? 0
          : 14
        : 8;
  const useSoftOutline =
    elementInfo.textType === 'notes' && !isCompactNotesCaption;
  const showTitleUnderline = elementInfo.textType === 'title' && !elementInfo.vertical;
  const outlineTone =
    elementInfo.textType === 'title'
      ? 'primary'
      : elementInfo.textType === 'notes'
        ? 'neutral'
        : 'default';
  const isGlassCard =
    elementInfo.textType === 'content' &&
    Boolean(resolvedFill) &&
    Boolean(effectiveOutline) &&
    elementInfo.width >= 220 &&
    elementInfo.height >= 72;
  const glassBase = resolvedFill || '#f8fafc';
  const glassGradientStart = mixHexColor(glassBase, '#ffffff', 0.62);
  const glassGradientEnd = mixHexColor(glassBase, '#edf2f7', 0.34);
  const cardAccent = effectiveOutline?.color || '#2f6bff';
  const contentInsetLeft = isGlassCard ? TEXT_BOX_PADDING_PX + 12 : TEXT_BOX_PADDING_PX;

  useEffect(() => {
    if (!onAutoHeightChange) return;
    const prose = proseRef.current;
    if (!prose) return;

    let rafId = 0;
    const measure = () => {
      const requiredInnerHeight = Math.ceil(prose.scrollHeight);
      if (requiredInnerHeight <= 0) return;
      const requiredHeight = requiredInnerHeight + TEXT_BOX_PADDING_PX * 2;
      if (requiredHeight > elementInfo.height + 1) {
        onAutoHeightChange(requiredHeight);
      }
    };
    const queueMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    queueMeasure();
    const resizeObserver = new ResizeObserver(queueMeasure);
    resizeObserver.observe(prose);
    const mutationObserver = new MutationObserver(queueMeasure);
    mutationObserver.observe(prose, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [elementInfo.content, elementInfo.height, onAutoHeightChange]);

  if (shouldHideLegacyStepBadge) {
    return null;
  }

  return (
    <div
      className="base-element-text absolute"
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
          className={`element-content subpixel-antialiased relative leading-[1.5] break-words overflow-hidden ${
            isGlassCard
              ? 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)]'
              : ''
          }`}
          style={{
            width: `${elementInfo.width}px`,
            height: `${elementInfo.height}px`,
            background: isGlassCard
              ? `linear-gradient(145deg, ${glassGradientStart}, ${glassGradientEnd})`
              : effectiveFill,
            opacity: elementInfo.opacity,
            boxShadow: isGlassCard
              ? '0 8px 24px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.76)'
              : shadowStyle || undefined,
            borderRadius: isGlassCard ? '20px' : undefined,
            lineHeight: elementInfo.lineHeight,
            letterSpacing: `${elementInfo.wordSpace || 0}px`,
            color: elementInfo.defaultColor,
            fontFamily: elementInfo.defaultFontName,
            writingMode: elementInfo.vertical ? 'vertical-rl' : 'horizontal-tb',
            // @ts-expect-error - CSS custom property
            '--paragraphSpace': `${elementInfo.paragraphSpace === undefined ? 5 : elementInfo.paragraphSpace}px`,
          }}
        >
          {isGlassCard && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 14,
                bottom: 14,
                width: 4,
                borderRadius: 4,
                background: `linear-gradient(180deg, ${mixHexColor(cardAccent, '#ffffff', 0.08)}, ${mixHexColor(cardAccent, '#0f172a', 0.14)})`,
              }}
            />
          )}
          <ElementOutline
            width={elementInfo.width}
            height={elementInfo.height}
            outline={isGlassCard ? undefined : effectiveOutline}
            cornerRadius={outlineCornerRadius}
            softStroke={isGlassCard ? false : useSoftOutline}
            tone={outlineTone}
          />

          <div
            className="absolute overflow-hidden"
            style={{
              top: `${TEXT_BOX_PADDING_PX}px`,
              right: `${TEXT_BOX_PADDING_PX}px`,
              bottom: `${TEXT_BOX_PADDING_PX}px`,
              left: `${contentInsetLeft}px`,
            }}
          >
            <div
              ref={proseRef}
              className={`text ProseMirror-static relative origin-top-left [&_ol]:my-0 [&_p]:m-0 [&_p:not(:last-child)]:mb-[var(--paragraphSpace)] [&_ul]:my-0 ${
                target === 'thumbnail' ? 'pointer-events-none' : ''
              }`}
            >
              <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
              {showTitleUnderline ? (
                <div
                  className="mt-3 h-1 w-[60px] rounded-[4px]"
                  style={{
                    background: 'linear-gradient(90deg, #2F6BFF, #7A5AF8)',
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
