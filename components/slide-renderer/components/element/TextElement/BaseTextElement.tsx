'use client';

import { useMemo } from 'react';
import type { PPTTextElement } from '@/lib/types/slides';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { useElementShadow } from '../hooks/useElementShadow';
import { ElementOutline } from '../ElementOutline';
import { TEXT_BOX_PADDING_PX } from '@/lib/slide-text-layout';
import {
  academyPaperBackground,
  academyPaperTheme,
  extractLeadingHtmlColor,
  mixHexColor,
  normalizeAccentForAcademyPaper,
} from '../academyPaperTheme';

export interface BaseTextElementProps {
  elementInfo: PPTTextElement;
  target?: string;
}

function compactHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function dedupeAdjacentDuplicateParagraphs(html: string): string {
  if (!html || typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  const children = Array.from(root.children);
  if (children.length < 2) return html;

  let previousNormalized = '';
  for (const child of children) {
    const normalized = (child.textContent || '').replace(/\s+/g, ' ').trim();
    if (
      normalized.length >= 60 &&
      previousNormalized &&
      normalized === previousNormalized &&
      child.parentElement
    ) {
      child.remove();
      continue;
    }
    previousNormalized = normalized;
  }

  return root.innerHTML;
}

/**
 * Base text element component (read-only)
 * Renders static text content with styling
 */
export function BaseTextElement({ elementInfo, target }: BaseTextElementProps) {
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
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
  const dedupedContent = useMemo(
    () => dedupeAdjacentDuplicateParagraphs(elementInfo.content || ''),
    [elementInfo.content],
  );
  const renderedContent = useMemo(() => renderHtmlWithLatex(dedupedContent), [dedupedContent]);
  const compactContent = compactHtmlText(dedupedContent || '');
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
  const useSoftOutline = elementInfo.textType === 'notes' && !isCompactNotesCaption;
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
  const isCompactSingleLineText =
    elementInfo.height <= 48 &&
    ['header', 'subtitle', 'content', 'item', 'itemTitle', 'footer'].includes(
      elementInfo.textType || 'content',
    ) &&
    !dedupedContent.includes('<br') &&
    !dedupedContent.includes('</p><p');
  const cardAccent = normalizeAccentForAcademyPaper(
    extractLeadingHtmlColor(dedupedContent) || effectiveOutline?.color || '#2f6bff',
  );
  const contentInsetLeft = isGlassCard ? TEXT_BOX_PADDING_PX + 12 : TEXT_BOX_PADDING_PX;
  const contentInsetTop =
    elementInfo.textType === 'itemTitle' || isCompactSingleLineText ? 2 : TEXT_BOX_PADDING_PX;
  const contentInsetBottom =
    elementInfo.textType === 'itemTitle' || isCompactSingleLineText
      ? 2
      : elementInfo.textType === 'content'
        ? Math.max(6, TEXT_BOX_PADDING_PX - 4)
        : TEXT_BOX_PADDING_PX;
  const compactTallCardHeight =
    isGlassCard && elementInfo.height >= 260 && compactContent.length <= 96
      ? Math.min(
          elementInfo.height,
          Math.max(132, 118 + Math.ceil(compactContent.length / 28) * 24),
        )
      : elementInfo.height;

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
            isGlassCard ? 'transition-colors duration-200' : ''
          }`}
          style={{
            width: `${elementInfo.width}px`,
            height: `${compactTallCardHeight}px`,
            background: isGlassCard ? academyPaperBackground(cardAccent) : effectiveFill,
            backdropFilter: isGlassCard ? 'blur(3px)' : undefined,
            opacity: elementInfo.opacity,
            boxShadow: isGlassCard ? academyPaperTheme.cardShadow : shadowStyle || undefined,
            borderRadius: isGlassCard ? '14px' : undefined,
            border: isGlassCard ? `1px solid ${academyPaperTheme.cardBorder}` : undefined,
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
                top: 18,
                bottom: 18,
                width: 3,
                borderRadius: 4,
                background: `linear-gradient(180deg, ${mixHexColor(cardAccent, '#ffffff', 0.12)}, ${cardAccent})`,
              }}
            />
          )}
          <ElementOutline
            width={elementInfo.width}
            height={compactTallCardHeight}
            outline={isGlassCard ? undefined : effectiveOutline}
            cornerRadius={outlineCornerRadius}
            softStroke={isGlassCard ? false : useSoftOutline}
            tone={outlineTone}
          />

          <div
            className="absolute overflow-hidden"
            style={{
              top: `${contentInsetTop}px`,
              right: `${TEXT_BOX_PADDING_PX}px`,
              bottom: `${contentInsetBottom}px`,
              left: `${contentInsetLeft}px`,
            }}
          >
            <div
              className={`text ProseMirror-static relative origin-top-left [&_ol]:my-0 [&_p]:m-0 [&_p:not(:last-child)]:mb-[var(--paragraphSpace)] [&_ul]:my-0 ${
                target === 'thumbnail' ? 'pointer-events-none' : ''
              }`}
            >
              <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
              {showTitleUnderline ? (
                <div
                  className="mt-3 h-1 w-[60px] rounded-[4px]"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(75,114,232,0.95), rgba(138,111,232,0.62), rgba(214,168,79,0.18))',
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
