import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  Slide,
  TableCell,
} from '@/lib/types/slides';
import { normalizeLatexSource } from '@/lib/latex-utils';
import type {
  NotebookContentBlock,
  NotebookContentDeckStyle,
  NotebookContentDisciplineStyle,
  NotebookContentDocument,
  NotebookContentLayout,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
  NotebookContentProfile,
  NotebookContentSlot,
  NotebookContentTeachingFlow,
  NotebookContentTextTemplate,
  NotebookContentTitleTone,
  NotebookContentVisualSlot,
} from './schema';
import { isClassicLectureLayoutTemplate } from './schema';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { chemistryTextToHtml } from './chemistry';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CARD_INSET_X,
  CARD_INSET_Y,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  GRID_GAP_X,
  GRID_GAP_Y,
  GRID_MAX_AUTO_STRETCH_PER_ROW,
  GRID_MIN_CELL_HEIGHT,
  STACK_UNDERFILL_THRESHOLD,
} from './layout-constants';
import {
  estimateParagraphHeight,
  estimateParagraphHeightForWidth,
  estimateParagraphStackHeight,
  estimateParagraphStackHeightForWidth,
  estimateProcessFlowStepCardHeight,
  measureLayoutCardsLayout,
  measureParagraphBlock,
  measureParagraphHeightIfAvailable,
} from './measure';
import { resolveNotebookContentProfile } from './profile';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';
import {
  assessNotebookContentDocumentForSlideWithDeps,
  paginateNotebookContentDocumentWithDeps,
  type NotebookDocumentPaginationResult,
  type NotebookSlideContentBudgetAssessment,
} from './slide-pagination';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';
import {
  createCircleShape,
  createImageElement,
  createLatexElement,
  createLineElement,
  createRectShape,
  createShapeText,
  createTableElement,
  createTextElement,
} from './slide-element-factory';
import { expandBlocks, prepareBlocksForPagination } from './slide-pagination-blocks';
import {
  ARCHETYPE_ALLOWED_BLOCKS,
  arrangeGridBlocksByPlacement,
  getArchetypeLayoutSettings,
  resolveDocumentArchetype,
  resolveDocumentLayout,
  resolveDocumentPattern,
  resolveGridLayout,
  sortBlocksByPlacementOrder,
} from './slide-layout-resolvers';
import {
  blockToGridBody,
  blockToGridHeading,
  fitBulletListBlockToHeight,
  fitGridBodyToHeight,
  fitGridHeadingToHeight,
  fitParagraphBlockToHeight,
} from './slide-grid-copy';
import { getSlotOrder, getSlotTemplateSpec, type SlotTemplateSpec } from './slot-template-registry';
import {
  findSlideBackgroundStyleBySource,
  getSlideBackgroundThemeTokens,
  resolveSlideBackgroundThemeForSource,
  type SlideBackgroundStyleId,
  type SlideBackgroundThemeTokens,
} from '@/lib/constants/slide-backgrounds';

import {
  ACADEMY_PAPER,
  blockSummaryLines,
  buildFlowPatternBlock,
  CLASSIC_BUSINESS,
  CLASSIC_DECK_STYLES,
  ClassicDeckStylePreset,
  ContentCardTone,
  createCardGroupId,
  getProfileTokens,
  LayoutCardsBlock,
  ProcessFlowBlock,
  renderProcessFlowBlock,
  retintClassicElements,
  VisualSlotWithTitle,
} from './slide-adapter.shared';

export function flattenSlotBlocksForTemplate(
  document: NotebookContentDocument & { slots: NotebookContentSlot[] },
  spec: SlotTemplateSpec,
): NotebookContentBlock[] {
  return [...document.slots]
    .sort((a, b) => {
      const orderDelta = getSlotOrder(spec, a.slotId) - getSlotOrder(spec, b.slotId);
      if (orderDelta !== 0) return orderDelta;
      return a.priority - b.priority;
    })
    .flatMap((slot) => slot.blocks);
}

export type ClassicProtectedInlineSegment = {
  raw: string;
  visible: string;
  atomic: boolean;
};

export function splitClassicProtectedInlineSegments(text: string): ClassicProtectedInlineSegment[] {
  const segments: ClassicProtectedInlineSegment[] = [];
  const pattern = /(`[^`]*`|\$[^$\n]+\$|\\\([^]*?\\\))/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const raw = text.slice(cursor, index);
      segments.push({ raw, visible: raw, atomic: false });
    }

    const raw = match[0];
    const visible = raw.startsWith('`')
      ? raw.slice(1, -1)
      : raw.startsWith('$')
        ? raw.slice(1, -1)
        : raw.slice(2, -2);
    segments.push({ raw, visible, atomic: true });
    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    const raw = text.slice(cursor);
    segments.push({ raw, visible: raw, atomic: false });
  }

  return segments.filter((segment) => segment.raw.length > 0);
}

export function classicProtectedVisibleLength(text: string): number {
  return splitClassicProtectedInlineSegments(text).reduce(
    (sum, segment) => sum + segment.visible.length,
    0,
  );
}

export function compactClassicTextLine(line: string, maxChars: number): string {
  const normalized = line.trim();
  if (classicProtectedVisibleLength(normalized) <= maxChars) return normalized;

  const targetChars = Math.max(1, maxChars - 3);
  const segments = splitClassicProtectedInlineSegments(normalized);
  let visibleChars = 0;
  let output = '';

  for (const segment of segments) {
    if (visibleChars + segment.visible.length <= targetChars) {
      output += segment.raw;
      visibleChars += segment.visible.length;
      continue;
    }

    if (segment.atomic) {
      if (visibleChars === 0) return segment.raw;
      break;
    }

    const remainingChars = targetChars - visibleChars;
    if (remainingChars > 0) {
      output += Array.from(segment.visible).slice(0, remainingChars).join('');
    }
    break;
  }

  const backtickCount = (output.match(/`/g) || []).length;
  const balancedOutput =
    backtickCount % 2 === 0 ? output : output.slice(0, output.lastIndexOf('`'));
  return `${balancedOutput.trimEnd()}...`;
}

export function splitClassicTextLineForCard(line: string, maxChars: number): string[] {
  const normalized = line.trim();
  if (!normalized) return [];
  if (classicProtectedVisibleLength(normalized) <= maxChars) return [normalized];

  const chunks: string[] = [];
  const segments = splitClassicProtectedInlineSegments(normalized);
  let current = '';
  let visibleChars = 0;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
    visibleChars = 0;
  };

  for (const segment of segments) {
    if (segment.atomic) {
      if (visibleChars > 0 && visibleChars + segment.visible.length > maxChars) {
        pushCurrent();
      }
      current += segment.raw;
      visibleChars += segment.visible.length;
      if (visibleChars >= maxChars) pushCurrent();
      continue;
    }

    for (const char of Array.from(segment.raw)) {
      if (visibleChars > 0 && visibleChars + 1 > maxChars) {
        pushCurrent();
      }
      current += char;
      visibleChars += 1;
    }
  }

  pushCurrent();
  return chunks;
}

export function splitClassicCardBodyLines(args: {
  lines: string[];
  maxLines: number;
  maxCharsPerLine?: number;
}): string[] {
  if (!args.maxCharsPerLine) return args.lines.slice(0, args.maxLines);

  const output: string[] = [];
  for (const line of args.lines) {
    const chunks = splitClassicTextLineForCard(line, args.maxCharsPerLine);
    for (const chunk of chunks) {
      if (output.length < args.maxLines) {
        output.push(chunk);
        continue;
      }
      const lastIndex = output.length - 1;
      output[lastIndex] = compactClassicTextLine(
        `${output[lastIndex]} ${chunk}`.trim(),
        args.maxCharsPerLine,
      );
      return output;
    }
  }

  return output;
}

export function estimateClassicCardContentHeight(args: {
  block: NotebookContentBlock;
  language: 'zh-CN' | 'en-US';
  bodyFontSize: number;
  maxLines: number;
  maxCharsPerLine?: number;
}): number {
  const heading = blockToGridHeading(args.language, args.block);
  const headingLines = Math.min(2, Math.max(1, Math.ceil(heading.length / 16)));
  const bodyLines = splitClassicCardBodyLines({
    lines: blockSummaryLines(args.language, args.block),
    maxLines: args.maxLines,
    maxCharsPerLine: args.maxCharsPerLine,
  });
  const headingHeight = headingLines * 26 + 10;
  const bodyHeight = Math.max(1, bodyLines.length) * Math.round(args.bodyFontSize * 1.38);
  return Math.ceil(CARD_INSET_Y * 2 + headingHeight + bodyHeight + 12);
}

export function createBlockCard(args: {
  block: NotebookContentBlock;
  language: 'zh-CN' | 'en-US';
  left: number;
  top: number;
  width: number;
  height: number;
  tone: ContentCardTone;
  style?: ClassicDeckStylePreset;
  titleColor?: string;
  bodyFontSize?: number;
  maxLines?: number;
  maxCharsPerLine?: number;
}): PPTTextElement {
  const title = blockToGridHeading(args.language, args.block);
  const titleFit = fitGridHeadingToHeight({
    text: title,
    widthPx: Math.max(120, args.width - CARD_INSET_X * 2),
    maxHeightPx: 52,
    color: args.titleColor || args.tone.accent,
  });
  const lines = blockSummaryLines(args.language, args.block);
  const bodyFontSize = args.bodyFontSize ?? 14;
  const bodyLines = splitClassicCardBodyLines({
    lines,
    maxLines: args.maxLines ?? 6,
    maxCharsPerLine: args.maxCharsPerLine,
  });
  const bodyHtml = bodyLines
    .map((line, index) => {
      const prefix =
        lines.length > 1
          ? `<span style="color:${args.tone.accent};font-weight:700;">${index + 1}.</span> `
          : '';
      return `<p style="font-size:${bodyFontSize}px;line-height:${Math.round(bodyFontSize * 1.38)}px;color:${args.style?.bodyText || CLASSIC_BUSINESS.bodyText};">${prefix}${renderClassicInlineHtml(line)}</p>`;
    })
    .join('');

  return createTextElement({
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    html: `${titleFit.html}${bodyHtml}`,
    color: args.style?.bodyText || CLASSIC_BUSINESS.bodyText,
    fill: args.block.backgroundColor || args.tone.fill,
    outlineColor: args.block.borderColor || args.tone.border,
    shadow: {
      h: 0,
      v: 6,
      blur: 18,
      color: args.style?.shadow || CLASSIC_BUSINESS.shadow,
    },
    textType: args.style ? 'item' : 'content',
  });
}

export function renderVisualPanel(args: {
  visual: VisualSlotWithTitle | null;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  left: number;
  top: number;
  width: number;
  height: number;
  tokens: ReturnType<typeof getProfileTokens>;
}): PPTElement[] {
  const groupId = createCardGroupId('visual_slot');
  if (args.visual?.source) {
    const imageHeight = args.visual.caption ? args.height - 32 : args.height;
    const elements: PPTElement[] = [
      createImageElement({
        src: args.visual.source,
        left: args.left,
        top: args.top,
        width: args.width,
        height: imageHeight,
        groupId,
        outlineColor: CLASSIC_BUSINESS.subtleBorder,
        shadow: {
          h: 0,
          v: 6,
          blur: 18,
          color: CLASSIC_BUSINESS.shadow,
        },
      }),
    ];
    if (args.visual.caption) {
      elements.push(
        createTextElement({
          left: args.left,
          top: args.top + imageHeight + 8,
          width: args.width,
          height: 24,
          html: `<p style="font-size:12px;color:${CLASSIC_BUSINESS.mutedText};text-align:center;">${escapeHtml(args.visual.caption)}</p>`,
          color: CLASSIC_BUSINESS.mutedText,
          textType: 'footer',
        }),
      );
    }
    return elements;
  }

  return [];
}

export function createHeroBackgroundElements(args: {
  visual: VisualSlotWithTitle | null;
  fallbackFill: string;
  overlayFill: string;
  leftShadeFill?: string;
  groupId: string;
}): PPTElement[] {
  const elements: PPTElement[] = [];
  if (args.visual?.source) {
    elements.push(
      createImageElement({
        src: args.visual.source,
        left: 0,
        top: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        radius: 0,
        groupId: args.groupId,
      }),
    );
  } else {
    elements.push(
      createRectShape({
        left: 0,
        top: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        fill: args.fallbackFill,
        groupId: args.groupId,
      }),
    );
  }

  elements.push(
    createRectShape({
      left: 0,
      top: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fill: args.overlayFill,
      groupId: args.groupId,
    }),
  );

  if (args.leftShadeFill) {
    elements.push(
      createRectShape({
        left: 0,
        top: 0,
        width: CANVAS_WIDTH * 0.58,
        height: CANVAS_HEIGHT,
        fill: args.leftShadeFill,
        groupId: args.groupId,
      }),
    );
  }

  return elements;
}

export function resolveHeroBackgroundTheme(args: {
  visual: VisualSlotWithTitle | null;
  fallbackStyleId: SlideBackgroundStyleId;
}): SlideBackgroundThemeTokens {
  return (
    resolveSlideBackgroundThemeForSource(args.visual?.source) ||
    getSlideBackgroundThemeTokens(args.fallbackStyleId)
  );
}

export function heroTextLines(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  maxItems?: number;
}): string[] {
  return firstClassicLines(args.language, getClassicTextBlocks(args.blocks), args.maxItems ?? 3);
}

export function createHeroFooterText(args: {
  text: string;
  left?: number;
  align?: 'left' | 'right';
  groupId: string;
  color?: string;
}): PPTElement {
  const left = args.left ?? 46;
  const color = args.color || 'rgba(248,250,252,.68)';
  return createTextElement({
    left,
    top: CANVAS_HEIGHT - 76,
    width: args.align === 'right' ? 210 : 300,
    height: 70,
    html: `<p style="font-size:9px;line-height:12px;color:${color};font-weight:650;text-align:${args.align || 'left'};">${renderClassicInlineHtml(args.text)}</p>`,
    color,
    groupId: args.groupId,
    textType: 'footer',
  });
}

export const HERO_META_PLACEHOLDER_PATTERN =
  /^(?:current edition|edition|deep dive|opening|course intro|intro|overview|dark art|tech\s*\/\s*saas|tech saas|classic business|academic|magazine|product launch|nature documentary|当前版本|版本|深度解析|课程导入|导入|概览|技术|科技|暗色艺术)$/i;

export function isMeaningfulHeroMeta(text: string | undefined): text is string {
  const normalized = text?.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (HERO_META_PLACEHOLDER_PATTERN.test(normalized)) return false;
  return normalized.replace(/\s+/g, '').length >= 3;
}

export function isCompactHeroMeta(
  text: string | undefined,
  language: 'zh-CN' | 'en-US',
): text is string {
  if (!isMeaningfulHeroMeta(text)) return false;
  const compactLength = text.replace(/\s+/g, '').length;
  const maxLength = language === 'en-US' ? 32 : 18;
  return compactLength <= maxLength;
}

export function meaningfulHeroTextLines(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  maxItems?: number;
}): string[] {
  return heroTextLines(args).filter((line) => isMeaningfulHeroMeta(line));
}

export function meaningfulCalloutTitle(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
}): string | null {
  const title = args.blocks.find((block) => block.type === 'callout')?.title?.trim();
  if (!isMeaningfulHeroMeta(title)) return null;
  const compactLength = title.replace(/\s+/g, '').length;
  const maxLength = args.language === 'en-US' ? 18 : 8;
  return compactLength <= maxLength ? title : null;
}

export function isDarkHeroVisual(visual: VisualSlotWithTitle | null): boolean {
  if (!visual?.source) return false;
  return findSlideBackgroundStyleBySource(visual.source)?.tone === 'dark';
}

export function heroOverlayFillForVisual(args: {
  theme: SlideBackgroundThemeTokens;
  visual: VisualSlotWithTitle | null;
  template: 'image' | 'cinematic' | 'tech';
}): string {
  const isDark = isDarkHeroVisual(args.visual);
  if (args.template === 'cinematic') {
    return isDark ? args.theme.overlayFill : 'rgba(255,248,235,.18)';
  }
  if (args.template === 'tech') {
    return isDark ? args.theme.overlayFill : 'rgba(245,251,255,.12)';
  }
  return isDark ? args.theme.overlayFill : 'rgba(255,255,255,.16)';
}

export function heroLeftShadeFillForVisual(args: {
  theme: SlideBackgroundThemeTokens;
  visual: VisualSlotWithTitle | null;
  template: 'image' | 'cinematic' | 'tech';
}): string | undefined {
  if (args.template === 'tech')
    return isDarkHeroVisual(args.visual) ? args.theme.leftShadeFill : undefined;
  if (args.template === 'cinematic') return undefined;
  return args.theme.leftShadeFill;
}

export function createCornerBracketElements(args: {
  inset: number;
  length: number;
  color: string;
  width: number;
  groupId: string;
}): PPTElement[] {
  const x1 = args.inset;
  const y1 = args.inset;
  const x2 = CANVAS_WIDTH - args.inset;
  const y2 = CANVAS_HEIGHT - args.inset;
  return [
    createLineElement({
      start: [x1, y1],
      end: [x1 + args.length, y1],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x1, y1],
      end: [x1, y1 + args.length],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x2, y1],
      end: [x2 - args.length, y1],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x2, y1],
      end: [x2, y1 + args.length],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x1, y2],
      end: [x1 + args.length, y2],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x1, y2],
      end: [x1, y2 - args.length],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x2, y2],
      end: [x2 - args.length, y2],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [x2, y2],
      end: [x2, y2 - args.length],
      color: args.color,
      width: args.width,
      groupId: args.groupId,
    }),
  ];
}

export function renderClassicImageTitleOverlayTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  style: ClassicDeckStylePreset;
}): Slide {
  const lines = meaningfulHeroTextLines({
    blocks: args.blocks,
    language: args.language,
    maxItems: 3,
  });
  const subtitle =
    lines[0] ||
    (args.language === 'en-US'
      ? 'A focused opening page for the core story.'
      : '用一页先把本章的主线立起来。');
  const meta = isCompactHeroMeta(lines[1], args.language)
    ? lines[1]
    : isCompactHeroMeta(args.visual?.caption, args.language)
      ? args.visual?.caption
      : null;
  const tag = meaningfulCalloutTitle({
    blocks: args.blocks,
    language: args.language,
  });
  const backgroundTheme = resolveHeroBackgroundTheme({
    visual: args.visual,
    fallbackStyleId: 'magazine-courtyard',
  });
  const titleFontSize = args.title.replace(/\s+/g, '').length > 22 ? 36 : 43;
  const groupId = createCardGroupId('classic_image_hero');
  const elements: PPTElement[] = [
    ...createHeroBackgroundElements({
      visual: args.visual,
      fallbackFill: backgroundTheme.fallbackFill,
      overlayFill: heroOverlayFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'image',
      }),
      leftShadeFill: heroLeftShadeFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'image',
      }),
      groupId,
    }),
    createTextElement({
      left: 46,
      top: 116,
      width: 505,
      height: 132,
      html: `<p style="font-size:${titleFontSize}px;line-height:${Math.round(titleFontSize * 1.13)}px;color:${backgroundTheme.titleText};font-weight:870;">${renderClassicInlineHtml(args.title)}</p>`,
      color: backgroundTheme.titleText,
      groupId,
      textType: 'itemTitle',
    }),
    createTextElement({
      left: 48,
      top: 262,
      width: 485,
      height: 82,
      html: `<p style="font-size:17px;line-height:25px;color:${backgroundTheme.bodyText};font-weight:660;">${renderClassicInlineHtml(subtitle)}</p>`,
      color: backgroundTheme.bodyText,
      groupId,
      textType: 'content',
    }),
    createLineElement({
      start: [48, 104],
      end: [162, 104],
      color: backgroundTheme.titleText,
      width: 2,
      groupId,
    }),
    createLineElement({
      start: [48, 334],
      end: [130, 334],
      color: backgroundTheme.divider,
      width: 4,
      groupId,
    }),
  ];

  if (tag) {
    elements.push(
      createTextElement({
        left: 720,
        top: 58,
        width: 150,
        height: 44,
        html: `<p style="font-size:9px;line-height:13px;color:${backgroundTheme.badgeText};text-align:center;font-weight:820;">${renderClassicInlineHtml(tag)}</p>`,
        color: backgroundTheme.badgeText,
        fill: backgroundTheme.badgeFill,
        outlineColor: backgroundTheme.panelBorder,
        groupId,
        textType: 'notes',
      }),
    );
  }

  if (meta) {
    elements.push(createHeroFooterText({ text: meta, color: backgroundTheme.footerText, groupId }));
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

export function renderClassicCinematicTitleFrameTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  style: ClassicDeckStylePreset;
}): Slide {
  const lines = meaningfulHeroTextLines({
    blocks: args.blocks,
    language: args.language,
    maxItems: 3,
  });
  const eyebrow = isCompactHeroMeta(lines[1], args.language)
    ? lines[1]
    : isCompactHeroMeta(args.visual?.caption, args.language)
      ? args.visual?.caption
      : null;
  const subtitle =
    lines[0] ||
    (args.language === 'en-US'
      ? 'A cinematic reading of the core theme.'
      : '把画面、人物和主题放回同一条叙事线。');
  const dateLine = isCompactHeroMeta(lines[2], args.language) ? lines[2] : null;
  const titleFontSize = args.title.replace(/\s+/g, '').length > 24 ? 31 : 38;
  const backgroundTheme = resolveHeroBackgroundTheme({
    visual: args.visual,
    fallbackStyleId: 'cinematic-stage',
  });
  const groupId = createCardGroupId('classic_cinematic_hero');
  const elements: PPTElement[] = [
    ...createHeroBackgroundElements({
      visual: args.visual,
      fallbackFill: backgroundTheme.fallbackFill,
      overlayFill: heroOverlayFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'cinematic',
      }),
      leftShadeFill: heroLeftShadeFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'cinematic',
      }),
      groupId,
    }),
    ...createCornerBracketElements({
      inset: 38,
      length: 70,
      color: backgroundTheme.divider,
      width: 2,
      groupId,
    }),
    createTextElement({
      left: 130,
      top: eyebrow ? 255 : 226,
      width: 740,
      height: 86,
      html: `<p style="font-size:${titleFontSize}px;line-height:${Math.round(titleFontSize * 1.14)}px;color:${backgroundTheme.titleText};text-align:center;font-weight:850;">${renderClassicInlineHtml(args.title)}</p>`,
      color: backgroundTheme.titleText,
      groupId,
      textType: 'itemTitle',
    }),
    createTextElement({
      left: 218,
      top: eyebrow ? 350 : 326,
      width: 564,
      height: 64,
      html: `<p style="font-size:15px;line-height:22px;color:${backgroundTheme.bodyText};text-align:center;font-weight:640;">${renderClassicInlineHtml(subtitle)}</p>`,
      color: backgroundTheme.bodyText,
      groupId,
      textType: 'content',
    }),
  ];

  if (eyebrow) {
    elements.push(
      createTextElement({
        left: 210,
        top: 218,
        width: 580,
        height: 56,
        html: `<p style="font-size:14px;line-height:18px;color:${backgroundTheme.mutedText};text-align:center;font-weight:650;">${renderClassicInlineHtml(eyebrow)}</p>`,
        color: backgroundTheme.mutedText,
        groupId,
        textType: 'notes',
      }),
    );
  }

  if (dateLine) {
    elements.push(
      createTextElement({
        left: 365,
        top: 404,
        width: 270,
        height: 56,
        html: `<p style="font-size:11px;line-height:15px;color:${backgroundTheme.footerText};text-align:center;font-weight:650;">${renderClassicInlineHtml(dateLine)}</p>`,
        color: backgroundTheme.footerText,
        groupId,
        textType: 'footer',
      }),
    );
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

export function renderClassicTechHeroTitleTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  style: ClassicDeckStylePreset;
}): Slide {
  const lines = meaningfulHeroTextLines({
    blocks: args.blocks,
    language: args.language,
    maxItems: 3,
  });
  const subtitle =
    lines[0] ||
    (args.language === 'en-US'
      ? 'Complete guide to pricing, features and best value'
      : '用一页建立产品、价格和价值判断的主线');
  const edition = isCompactHeroMeta(lines[1], args.language) ? lines[1] : null;
  const footer = isCompactHeroMeta(lines[2], args.language)
    ? lines[2]
    : isCompactHeroMeta(args.visual?.caption, args.language)
      ? args.visual?.caption
      : null;
  const titleFontSize = args.title.replace(/\s+/g, '').length > 34 ? 34 : 42;
  const backgroundTheme = resolveHeroBackgroundTheme({
    visual: args.visual,
    fallbackStyleId: 'product-launch-dark',
  });
  const groupId = createCardGroupId('classic_tech_hero');
  const elements: PPTElement[] = [
    ...createHeroBackgroundElements({
      visual: args.visual,
      fallbackFill: backgroundTheme.fallbackFill,
      overlayFill: heroOverlayFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'tech',
      }),
      leftShadeFill: heroLeftShadeFillForVisual({
        theme: backgroundTheme,
        visual: args.visual,
        template: 'tech',
      }),
      groupId,
    }),
    createTextElement({
      left: 120,
      top: 218,
      width: 760,
      height: 136,
      html: `<p style="font-size:${titleFontSize}px;line-height:${Math.round(titleFontSize * 1.15)}px;color:${backgroundTheme.titleText};text-align:center;font-weight:860;">${renderClassicInlineHtml(args.title)}</p>`,
      color: backgroundTheme.titleText,
      groupId,
      textType: 'itemTitle',
    }),
    createTextElement({
      left: 235,
      top: 300,
      width: 530,
      height: 86,
      html: `<p style="font-size:14px;line-height:20px;color:${backgroundTheme.bodyText};text-align:center;font-weight:620;">${renderClassicInlineHtml(subtitle)}</p>`,
      color: backgroundTheme.bodyText,
      groupId,
      textType: 'content',
    }),
  ];

  if (edition) {
    elements.push(
      createTextElement({
        left: 420,
        top: 358,
        width: 160,
        height: 90,
        html: `<p style="font-size:10px;line-height:14px;color:${backgroundTheme.accent};text-align:center;font-weight:820;">${renderClassicInlineHtml(edition)}</p>`,
        color: backgroundTheme.accent,
        groupId,
        textType: 'notes',
      }),
      createLineElement({
        start: [426, 394],
        end: [574, 394],
        color: backgroundTheme.divider,
        width: 2,
        groupId,
      }),
    );
  }

  if (footer) {
    elements.push(
      createHeroFooterText({ text: footer, color: backgroundTheme.footerText, groupId }),
    );
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

export function findFirstBlock<T extends NotebookContentBlock['type']>(
  blocks: NotebookContentBlock[],
  type: T,
): Extract<NotebookContentBlock, { type: T }> | undefined {
  return blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: T }> => block.type === type,
  );
}

export function renderClassicInlineCodeHtml(text: string): string {
  const segments = text.split(/(`[^`]+`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
        return `<span style="display:inline-block;padding:1px 7px;border-radius:7px;background:#eef4fb;border:1px solid #d8e4f2;color:${CLASSIC_BUSINESS.titleText};font-family:Menlo, Monaco, Consolas, monospace;font-weight:760;">${escapeHtml(segment.slice(1, -1))}</span>`;
      }
      return /[$\\]/.test(segment) ? renderInlineLatexToHtml(segment) : escapeHtml(segment);
    })
    .join('');
}

export function renderClassicInlineHtml(text: string): string {
  if (text.includes('`')) return renderClassicInlineCodeHtml(text);
  return /[$\\]/.test(text) ? renderInlineLatexToHtml(text) : escapeHtml(text);
}

export function createTableCards(args: {
  block: Extract<NotebookContentBlock, { type: 'table' }>;
  left: number;
  top: number;
  width: number;
  height: number;
  tokens: ReturnType<typeof getProfileTokens>;
}): PPTElement[] {
  const rowCount = args.block.rows.length + (args.block.headers?.length ? 1 : 0);
  const colCount = Math.max(
    args.block.headers?.length || 0,
    ...args.block.rows.map((row) => row.length),
    1,
  );
  const cellGap = 4;
  const availableWidth = args.width - Math.max(0, colCount - 1) * cellGap;
  const colWeights =
    colCount === 5 ? [1.05, 0.95, 1.65, 1.05, 1.15] : Array.from({ length: colCount }, () => 1);
  const weightSum = colWeights.reduce((sum, weight) => sum + weight, 0);
  const cellWidths = colWeights.map((weight) => (availableWidth * weight) / weightSum);
  const cellLefts = cellWidths.reduce<number[]>((offsets, width, index) => {
    offsets.push(index === 0 ? 0 : offsets[index - 1] + cellWidths[index - 1] + cellGap);
    return offsets;
  }, []);
  const cellHeight = Math.min(
    58,
    Math.max(40, (args.height - Math.max(0, rowCount - 1) * cellGap) / Math.max(1, rowCount)),
  );
  const elements: PPTElement[] = [];
  const rows = args.block.headers?.length
    ? [args.block.headers, ...args.block.rows]
    : args.block.rows;
  rows
    .slice(0, Math.max(1, Math.floor(args.height / (cellHeight + cellGap))))
    .forEach((row, rowIndex) => {
      row.slice(0, colCount).forEach((cell, colIndex) => {
        const isHeader = Boolean(args.block.headers?.length && rowIndex === 0);
        elements.push(
          createTextElement({
            left: args.left + (cellLefts[colIndex] || 0),
            top: args.top + rowIndex * (cellHeight + cellGap),
            width: cellWidths[colIndex] || availableWidth / colCount,
            height: cellHeight,
            html: `<p style="font-size:${isHeader ? 10 : 9}px;line-height:${isHeader ? 13 : 11}px;color:${isHeader ? args.tokens.titleAccent : ACADEMY_PAPER.bodyText};"><strong>${isHeader ? renderClassicInlineHtml(cell) : ''}</strong>${isHeader ? '' : renderClassicInlineHtml(cell)}</p>`,
            color: isHeader ? args.tokens.titleAccent : ACADEMY_PAPER.bodyText,
            fill: isHeader ? 'rgba(244,247,255,0.78)' : ACADEMY_PAPER.cardFill,
            outlineColor: isHeader ? ACADEMY_PAPER.blueBorder : ACADEMY_PAPER.border,
            textType: 'content',
          }),
        );
      });
    });
  return elements;
}

export function createClassicLectureSlide(args: {
  elements: PPTElement[];
  tokens: ReturnType<typeof getProfileTokens>;
  style: ClassicDeckStylePreset;
}): Slide {
  const elements = retintClassicElements(args.elements, args.style);
  return {
    id: `slide_${nanoid(8)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
    theme: {
      backgroundColor: args.style.background,
      themeColors: [
        args.style.blue,
        args.style.red,
        args.style.yellow,
        args.style.green,
        args.style.titleText,
        ...args.tokens.themeColors,
      ],
      fontColor: args.style.titleText,
      fontName: 'Microsoft YaHei',
    },
    elements,
    background: {
      type: 'solid',
      color: args.style.background,
      respectProfileStyle: false,
    },
    type: 'content',
  };
}

export function createClassicTopBarElements(): PPTElement[] {
  const colors = [
    CLASSIC_BUSINESS.blue,
    CLASSIC_BUSINESS.red,
    CLASSIC_BUSINESS.yellow,
    CLASSIC_BUSINESS.green,
  ];
  const segmentWidth = CANVAS_WIDTH / colors.length;
  return colors.map((color, index) =>
    createRectShape({
      left: index * segmentWidth,
      top: 0,
      width: segmentWidth,
      height: 5,
      fill: color,
    }),
  );
}

export function createClassicSegmentedUnderline(args: { left: number; top: number }): PPTElement[] {
  const segments = [
    { width: 132, color: CLASSIC_BUSINESS.blue },
    { width: 54, color: CLASSIC_BUSINESS.red },
    { width: 54, color: CLASSIC_BUSINESS.yellow },
    { width: 104, color: CLASSIC_BUSINESS.green },
  ];
  let offset = 0;
  return segments.map((segment) => {
    const element = createRectShape({
      left: args.left + offset,
      top: args.top,
      width: segment.width,
      height: 4,
      fill: segment.color,
    });
    offset += segment.width + 6;
    return element;
  });
}

export function createClassicFooterElements(): PPTElement[] {
  const y = 540;
  const dotColors = [
    CLASSIC_BUSINESS.blue,
    CLASSIC_BUSINESS.red,
    CLASSIC_BUSINESS.yellow,
    CLASSIC_BUSINESS.green,
    CLASSIC_BUSINESS.blue,
  ];
  return [
    createLineElement({
      start: [CONTENT_LEFT, 528],
      end: [CONTENT_LEFT + CONTENT_WIDTH, 528],
      color: CLASSIC_BUSINESS.subtleBorder,
      width: 1,
    }),
    ...dotColors.map((color, index) =>
      createCircleShape({
        left: CANVAS_WIDTH / 2 - 42 + index * 21,
        top: y,
        size: 8,
        fill: color,
      }),
    ),
  ];
}

export function createClassicTitleElements(args: {
  title: string;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
  continuation?: NotebookContentDocument['continuation'];
}): { elements: PPTElement[]; bodyTop: number } {
  const normalizedTitleLength = args.title.replace(/\s+/g, '').length;
  const fontSize =
    normalizedTitleLength > 46
      ? 29
      : normalizedTitleLength > 34
        ? 32
        : normalizedTitleLength > 24
          ? 36
          : 40;
  const titleHeight = Math.max(64, Math.ceil(fontSize * 1.1 + 24));
  const titleTop = 30;
  const ruleTop = titleTop + titleHeight + 8;
  const elements: PPTElement[] = [
    ...createClassicTopBarElements(),
    createTextElement({
      left: CONTENT_LEFT,
      top: titleTop,
      width: args.continuation ? CONTENT_WIDTH - 170 : CONTENT_WIDTH,
      height: titleHeight,
      html: `<p style="font-size:${fontSize}px;line-height:${Math.round(fontSize * 1.1)}px;color:${CLASSIC_BUSINESS.titleText};font-weight:820;">${renderClassicInlineHtml(args.title)}</p>`,
      color: CLASSIC_BUSINESS.titleText,
      textType: 'header',
    }),
    ...createClassicSegmentedUnderline({ left: CONTENT_LEFT, top: ruleTop + 2 }),
    ...createClassicFooterElements(),
  ];

  if (args.continuation) {
    const chipLabel =
      args.language === 'en-US'
        ? `Part ${args.continuation.partNumber} of ${args.continuation.totalParts}`
        : `续 ${args.continuation.partNumber}/${args.continuation.totalParts}`;
    elements.push(
      createTextElement({
        left: CONTENT_LEFT + CONTENT_WIDTH - 148,
        top: titleTop + 4,
        width: 136,
        height: 40,
        html: `<p style="font-size:12px;color:${CLASSIC_BUSINESS.blue};text-align:center;font-weight:760;">${escapeHtml(chipLabel)}</p>`,
        color: CLASSIC_BUSINESS.blue,
        fill: '#f8fafc',
        outlineColor: '#dbe4f0',
        textType: 'notes',
      }),
    );
  }

  return { elements, bodyTop: ruleTop + 24 };
}

export function createClassicPanel(args: {
  title: string;
  lines: string[];
  left: number;
  top: number;
  width: number;
  height: number;
  tone: ContentCardTone;
  titleColor?: string;
  bodyFontSize?: number;
  numbered?: boolean;
  showMarkers?: boolean;
  compactTitle?: boolean;
  maxLines?: number;
  maxCharsPerLine?: number;
}): PPTElement {
  const bodyFontSize = args.bodyFontSize ?? 16;
  const bodyLineHeight = Math.round(bodyFontSize * 1.36);
  const titleFontSize = args.compactTitle ? 13 : 20;
  const titleLineHeight = args.compactTitle ? 18 : 24;
  const titleMarginBottom = args.compactTitle ? 5 : 10;
  const titleHtml = args.title
    ? `<p style="margin:0 0 ${titleMarginBottom}px 0;font-size:${titleFontSize}px;line-height:${titleLineHeight}px;color:${args.titleColor || args.tone.accent};font-weight:780;">${renderClassicInlineHtml(args.title)}</p>`
    : '';
  const titleSpace = args.title ? (args.compactTitle ? 26 : 38) : 8;
  const heightBasedLimit = Math.max(
    1,
    Math.floor((args.height - titleSpace - 18) / bodyLineHeight),
  );
  const maxLines = Math.min(args.maxLines ?? 5, heightBasedLimit);
  const rawLines = args.lines.map((line) => line.trim()).filter(Boolean);
  const lines = args.maxCharsPerLine
    ? splitClassicCardBodyLines({
        lines: rawLines,
        maxLines,
        maxCharsPerLine: args.maxCharsPerLine,
      })
    : rawLines.slice(0, maxLines);
  const bodyHtml = lines
    .map((line, index) => {
      const marker =
        args.showMarkers === false
          ? ''
          : args.numbered
            ? `<span style="color:${args.tone.accent};font-weight:800;">${index + 1}.</span> `
            : lines.length > 1
              ? `<span style="color:${args.tone.accent};font-weight:800;">•</span> `
              : '';
      return `<p style="margin:0 0 5px 0;font-size:${bodyFontSize}px;line-height:${bodyLineHeight}px;color:${CLASSIC_BUSINESS.bodyText};">${marker}${renderClassicInlineHtml(line)}</p>`;
    })
    .join('');

  return createTextElement({
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    html: `${titleHtml}${bodyHtml}`,
    color: CLASSIC_BUSINESS.bodyText,
    fill: args.tone.fill,
    outlineColor: args.tone.border,
    shadow: {
      h: 0,
      v: 6,
      blur: 18,
      color: CLASSIC_BUSINESS.shadow,
    },
    textType: 'item',
  });
}

export function getClassicTextBlocks(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return blocks.filter(
    (block) =>
      block.type !== 'heading' &&
      block.type !== 'process_flow' &&
      block.type !== 'layout_cards' &&
      block.type !== 'table' &&
      block.type !== 'visual',
  );
}

function uniqueTeachingLines(lines: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  lines
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const key = line.replace(/\s+/g, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(line);
    });
  return result.slice(0, maxItems);
}

export function firstClassicLines(
  language: 'zh-CN' | 'en-US',
  blocks: NotebookContentBlock[],
  maxItems: number,
): string[] {
  return uniqueTeachingLines(
    blocks.flatMap((block) => blockSummaryLines(language, block)),
    maxItems,
  );
}

export function createFlowArrowElements(args: {
  startX: number;
  endX: number;
  y: number;
  color: string;
  groupId: string;
}): PPTElement[] {
  const arrowStart = Math.min(args.startX, args.endX - 16);
  const arrowEnd = Math.max(args.endX, arrowStart + 16);
  return [
    createLineElement({
      start: [arrowStart, args.y],
      end: [arrowEnd, args.y],
      color: args.color,
      width: 2,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [arrowEnd - 9, args.y - 6],
      end: [arrowEnd, args.y],
      color: args.color,
      width: 2,
      groupId: args.groupId,
    }),
    createLineElement({
      start: [arrowEnd - 9, args.y + 6],
      end: [arrowEnd, args.y],
      color: args.color,
      width: 2,
      groupId: args.groupId,
    }),
  ];
}

export function looksLikeCodeOrDataLiteral(text: string): boolean {
  return (
    /`[^`]+`/.test(text) ||
    /[\[\]{}]/.test(text) ||
    /\b(?:Tweet\(\)|list|dict|userid|created_at|content|likes|date|self|__init__)\b/.test(text) ||
    /[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/.test(text)
  );
}

export function stripInlineCodeDelimiters(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1');
}

export function wrapDataLiteralForTable(text: string, firstColumn: boolean): string {
  if (!firstColumn) return text;
  if (text.length <= 48) return text;
  return text
    .replace(/,\s*(?='[^']{10,}'|"[^"]{10,}"|[A-Za-z_])/g, ',\n')
    .replace(/,\s*(?=\d{4}-\d{2}-\d{2})/g, ',\n')
    .replace(/,\s*(?=\{?'?[A-Za-z_][A-Za-z0-9_]*'?\s*:)/g, ',\n');
}

export function formatClassicTableCellText(
  text: string,
  options: { codeLike: boolean; firstColumn: boolean },
): string {
  const withoutCodeMarks = stripInlineCodeDelimiters(text).trim();
  if (!options.codeLike) return withoutCodeMarks;
  return wrapDataLiteralForTable(withoutCodeMarks, options.firstColumn);
}

export function createClassicBusinessTable(args: {
  block: Extract<NotebookContentBlock, { type: 'table' }>;
  left: number;
  top: number;
  width: number;
  height: number;
  fillHeight?: boolean;
  representationTable?: boolean;
  style?: ClassicDeckStylePreset;
}): PPTElement[] {
  const headers = args.block.headers?.length ? args.block.headers : undefined;
  const bodyRows = args.block.rows.slice(0, 5);
  const visibleRows = headers ? [headers, ...bodyRows] : bodyRows;
  if (visibleRows.length === 0) return [];

  const colCount = Math.max(...visibleRows.map((row) => row.length), 1);
  const defaultWeights = Array.from({ length: colCount }, () => 1);
  const firstColumnLooksLikeRepresentation = visibleRows
    .slice(headers ? 1 : 0)
    .some((row) => looksLikeCodeOrDataLiteral(row[0] || ''));
  const isRepresentationTable =
    args.representationTable ||
    firstColumnLooksLikeRepresentation ||
    headers?.[0]?.match(/表示|representation|object|form/i);
  const weights =
    isRepresentationTable && colCount === 3
      ? [2.05, 1.1, 1.25]
      : isRepresentationTable && colCount === 4
        ? [1.7, 1.05, 1.15, 1.15]
        : colCount === 5
          ? [0.92, 0.95, 1.48, 0.95, 1.1]
          : colCount === 4
            ? [1.05, 1.15, 1.45, 1.25]
            : defaultWeights;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const colWidths = weights.map((weight) => weight / weightSum);

  const groupId = createCardGroupId('classic_business_table');
  const elements: PPTElement[] = [];
  const style = args.style || CLASSIC_DECK_STYLES.classic_business;
  if (args.block.caption) {
    elements.push(
      createTextElement({
        left: args.left,
        top: args.top - 24,
        width: args.width,
        height: 20,
        groupId,
        html: `<p style="font-size:13px;line-height:17px;color:${style.mutedText};font-weight:620;">${renderClassicInlineHtml(args.block.caption)}</p>`,
        color: style.mutedText,
        textType: 'notes',
      }),
    );
  }

  const makeCell = (text: string, rowIndex: number, colIndex: number): TableCell => {
    const isHeader = Boolean(headers && rowIndex === 0);
    const isFirstColumn = colIndex === 0 && !isHeader;
    const codeLikeCell = !isHeader && looksLikeCodeOrDataLiteral(text);
    const cellText = formatClassicTableCellText(text, {
      codeLike: codeLikeCell,
      firstColumn: colIndex === 0,
    });
    return {
      id: `cell_${nanoid(8)}`,
      colspan: 1,
      rowspan: 1,
      text: cellText,
      style: {
        bold: isHeader || isFirstColumn,
        color: isHeader ? style.titleText : isFirstColumn ? style.blue : style.bodyText,
        backcolor: isHeader
          ? style.tableHeaderFill
          : rowIndex % 2 === 0
            ? style.tableFill
            : style.tableStripeFill,
        fontsize: isHeader
          ? '12px'
          : codeLikeCell && colIndex === 0
            ? '8px'
            : codeLikeCell
              ? '9px'
              : '11px',
        fontname: codeLikeCell ? 'Menlo, Monaco, Consolas, monospace' : 'Microsoft YaHei',
      },
    };
  };
  const data = visibleRows.map((row, rowIndex) =>
    Array.from({ length: colCount }, (_, colIndex) =>
      makeCell(row[colIndex] || '', rowIndex, colIndex),
    ),
  );
  const safeAvailableHeight = args.fillHeight
    ? Math.max(96, Math.min(args.height, CONTENT_BOTTOM - args.top - 12))
    : args.height;
  const naturalTableHeight = Math.max(
    154,
    visibleRows.length * (isRepresentationTable ? 42 : 34) + 12,
  );
  const tableHeight = args.fillHeight
    ? Math.max(118, safeAvailableHeight)
    : Math.min(safeAvailableHeight, naturalTableHeight);
  const cellMinHeight = args.fillHeight
    ? Math.max(32, Math.floor((tableHeight - 8) / visibleRows.length))
    : isRepresentationTable
      ? 38
      : 32;
  const table: PPTTableElement = {
    id: `table_${nanoid(8)}`,
    type: 'table',
    left: args.left,
    top: args.top,
    width: args.width,
    height: tableHeight,
    rotate: 0,
    groupId,
    outline: { color: style.subtleBorder, width: 1, style: 'solid' },
    data,
    theme: {
      color: style.blue,
      rowHeader: Boolean(headers),
      rowFooter: false,
      colHeader: false,
      colFooter: false,
    },
    colWidths,
    cellMinHeight,
  };
  elements.push(table);

  return elements;
}

export function renderClassicFlowStrip(args: {
  flow: ProcessFlowBlock;
  left: number;
  top: number;
  width: number;
  height: number;
  cardPalettes: readonly ContentCardTone[];
}): PPTElement[] {
  const steps = args.flow.steps.slice(0, 4);
  if (steps.length === 0) return [];
  const groupId = createCardGroupId('classic_flow');
  const gap = steps.length > 1 ? 22 : 0;
  const cardWidth = (args.width - gap * Math.max(0, steps.length - 1)) / steps.length;
  const tones: ContentCardTone[] = [
    { fill: '#dbeafe', border: '#bfdbfe', accent: CLASSIC_BUSINESS.blue },
    { fill: '#dcfce7', border: '#bbf7d0', accent: CLASSIC_BUSINESS.green },
    { fill: '#fef3c7', border: '#fde68a', accent: '#a16207' },
    { fill: '#fee2e2', border: '#fecaca', accent: CLASSIC_BUSINESS.red },
  ];
  const elements: PPTElement[] = [];

  steps.forEach((step, index) => {
    const tone = tones[index % tones.length] || args.cardPalettes[index % args.cardPalettes.length];
    const left = args.left + index * (cardWidth + gap);
    const title = compactClassicTextLine(step.title, 22);
    const detail = compactClassicTextLine(step.detail, 42);
    elements.push(
      createTextElement({
        left,
        top: args.top,
        width: cardWidth,
        height: args.height,
        groupId,
        html: `<p style="margin:0 0 4px 0;font-size:14px;line-height:17px;color:${tone.accent};font-weight:820;">${renderClassicInlineHtml(title)}</p><p style="margin:0;font-size:11px;line-height:14px;color:${CLASSIC_BUSINESS.bodyText};">${renderClassicInlineHtml(detail)}</p>`,
        color: CLASSIC_BUSINESS.bodyText,
        fill: tone.fill,
        outlineColor: tone.border,
        shadow: {
          h: 0,
          v: 5,
          blur: 14,
          color: CLASSIC_BUSINESS.shadow,
        },
        textType: 'content',
      }),
    );
    if (index < steps.length - 1) {
      elements.push(
        ...createFlowArrowElements({
          startX: left + cardWidth + 5,
          endX: left + cardWidth + gap - 6,
          y: args.top + args.height / 2,
          color: '#6b7280',
          groupId,
        }),
      );
    }
  });

  return elements;
}

export function layoutCardsToBlocks(block: LayoutCardsBlock): NotebookContentBlock[] {
  return block.items.map((item) => ({
    type: 'paragraph',
    cardTitle: item.title,
    text: item.text,
  }));
}

export function renderClassicProcessStepsTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
  style: ClassicDeckStylePreset;
}): Slide {
  const titleResult = createClassicTitleElements({
    title: args.title,
    tokens: args.tokens,
    language: args.language,
    continuation: args.document.continuation,
  });
  const flowBlocks = args.blocks.filter(
    (block): block is ProcessFlowBlock => block.type === 'process_flow',
  );
  const flow =
    flowBlocks.length > 0
      ? {
          ...flowBlocks[0],
          context: flowBlocks.flatMap((block) => block.context || []),
          steps: flowBlocks.flatMap((block) => block.steps || []),
        }
      : buildFlowPatternBlock({
          language: args.language,
          orientation: 'vertical',
          blocks: getClassicTextBlocks(args.blocks),
        });
  const rendered = renderProcessFlowBlock({
    block: {
      ...flow,
      orientation: 'horizontal',
      steps: flow.steps.slice(0, 5),
    },
    top: titleResult.bodyTop,
    language: args.language,
    titleAccent: args.style.blue,
    cardPalettes: args.cardPalettes,
  });

  return createClassicLectureSlide({
    elements: [...titleResult.elements, ...rendered.elements],
    tokens: args.tokens,
    style: args.style,
  });
}

export function compactClassicComparisonPhrase(line: string, maxChars: number): string {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (classicProtectedVisibleLength(normalized) <= maxChars) return normalized;
  if (/\$[^$]+\$|[∈∃∀⊆⊇×→←↔]|\\(?:in|subset|supset|forall|exists|to|mid)\b/.test(normalized)) {
    return normalized;
  }
  const phrases = normalized
    .split(/[。；;，,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const firstFit = phrases.find((part) => classicProtectedVisibleLength(part) <= maxChars);
  if (firstFit) return firstFit;
  return normalized;
}

export function renderClassicComparisonMatrixTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  style: ClassicDeckStylePreset;
}): Slide {
  const tableBlock = findFirstBlock(args.blocks, 'table');
  const callout = findFirstBlock(args.blocks, 'callout');
  const isMathComparison =
    args.document.profile === 'math' || args.document.disciplineStyle === 'math';
  const tableRows = tableBlock?.rows.slice(0, 3) || [];
  const optionNames = tableRows.map((row) => row[0]).filter(Boolean);
  const recommendationLines = optionNames
    .slice(0, 3)
    .map((option) => compactClassicComparisonPhrase(option, args.language === 'en-US' ? 42 : 24))
    .filter(Boolean);
  const subtitle =
    isMathComparison && args.language === 'zh-CN'
      ? '把集合语句翻译成可证明的条件'
      : isMathComparison
        ? 'Translate each set statement into a provable condition.'
        : args.language === 'en-US'
          ? 'Compare the key objects across the same criteria.'
          : '按同一组维度做对照判断';
  const ruleText = callout
    ? `${callout.title || (args.language === 'en-US' ? 'Decision rule' : '选择规则')}：${compactClassicComparisonPhrase(
        callout.text,
        args.language === 'en-US' ? 132 : 76,
      )}`
    : args.language === 'en-US'
      ? 'Reading rule: compare one criterion at a time before drawing a conclusion.'
      : '阅读规则：先逐项比较同一维度，再回到结论。';
  const mainTop = 178;
  const panelLeft = CONTENT_LEFT;
  const panelWidth = isMathComparison ? 214 : 250;
  const panelHeight = 286;
  const tableLeft = panelLeft + panelWidth + 22;
  const tableWidth = CONTENT_LEFT + CONTENT_WIDTH - tableLeft;
  const ruleTop = 480;

  const elements: PPTElement[] = [
    createRectShape({
      left: CONTENT_LEFT,
      top: 38,
      width: 42,
      height: 4,
      fill: args.style.blue,
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: 44,
      width: CONTENT_WIDTH,
      height: 74,
      html: `<p style="margin:0;font-size:24px;line-height:30px;color:${args.style.titleText};font-weight:840;">${renderClassicInlineHtml(
        compactClassicTextLine(args.title, args.language === 'en-US' ? 86 : 34),
      )}</p>`,
      color: args.style.titleText,
      textType: 'title',
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: 122,
      width: CONTENT_WIDTH,
      height: 50,
      html: `<p style="margin:0;font-size:12px;line-height:17px;color:${args.style.mutedText};font-weight:620;">${renderClassicInlineHtml(subtitle)}</p>`,
      color: args.style.mutedText,
      textType: 'subtitle',
    }),
    createRectShape({
      left: panelLeft,
      top: mainTop,
      width: panelWidth,
      height: panelHeight,
      fill: '#ffffff',
      outlineColor: args.style.subtleBorder,
      shadow: { h: 0, v: 8, blur: 18, color: args.style.shadow },
      text: createShapeText({
        html: `<p style="margin:0 0 4px 0;font-size:15px;line-height:19px;color:${args.style.titleText};font-weight:840;">${renderClassicInlineHtml(
          isMathComparison
            ? args.language === 'en-US'
              ? 'Translate first'
              : '先翻译语句'
            : args.language === 'en-US'
              ? 'Compare Rows'
              : '先看比较对象',
        )}</p><p style="margin:0;font-size:10px;line-height:14px;color:${args.style.mutedText};font-weight:560;">${renderClassicInlineHtml(
          isMathComparison
            ? args.language === 'en-US'
              ? 'Start each row from what must be proved.'
              : '每一行都从“要证什么”开始。'
            : args.language === 'en-US'
              ? 'Read each row against the same criteria.'
              : '对象、入口和用法分开看。',
        )}</p>`,
        color: args.style.titleText,
        textType: 'content',
        lineHeight: 1.18,
        paragraphSpace: 0,
        align: 'top',
      }),
    }),
    createRectShape({
      left: CONTENT_LEFT,
      top: ruleTop,
      width: CONTENT_WIDTH,
      height: 58,
      fill: args.style.titleText,
      text: createShapeText({
        html: `<p style="margin:0;font-size:12px;line-height:16px;color:#ffffff;font-weight:660;">${renderClassicInlineHtml(ruleText)}</p>`,
        color: '#ffffff',
        textType: 'notes',
        lineHeight: 1.15,
        paragraphSpace: 0,
        align: 'middle',
      }),
    }),
  ];

  const recommendationTones = [
    { fill: args.style.panelFillBlue, accent: args.style.blue },
    { fill: args.style.panelFillGreen, accent: args.style.green },
    { fill: args.style.panelFillWarm, accent: args.style.yellow },
  ];
  recommendationLines.slice(0, 3).forEach((line, index) => {
    const tone = recommendationTones[index] || recommendationTones[0];
    const top = mainTop + 72 + index * 68;
    elements.push(
      createRectShape({
        left: panelLeft + 18,
        top,
        width: panelWidth - 36,
        height: 58,
        fill: tone.fill,
        outlineColor: args.style.subtleBorder,
        text: createShapeText({
          html: `<p style="margin:0 0 0 22px;font-size:12px;line-height:16px;color:${args.style.bodyText};font-weight:760;">${renderClassicInlineHtml(
            line,
          )}</p>`,
          color: args.style.bodyText,
          textType: 'content',
          lineHeight: 1.18,
          paragraphSpace: 0,
          align: 'middle',
        }),
      }),
      createRectShape({
        left: panelLeft + 30,
        top: top + 16,
        width: 4,
        height: 26,
        fill: tone.accent,
      }),
    );
  });

  if (tableBlock) {
    const rows = [tableBlock.headers || [], ...tableBlock.rows.slice(0, 3)].filter(
      (row) => row.length > 0,
    );
    const colCount = Math.max(...rows.map((row) => row.length), 1);
    const weights =
      colCount === 5
        ? [0.88, 0.78, 0.96, 1.14, 1.46]
        : colCount === 4
          ? isMathComparison
            ? [1.06, 1.2, 1.02, 1.34]
            : [0.98, 1.05, 1.18, 1.42]
          : Array.from({ length: colCount }, () => 1);
    const totalWeight = weights.slice(0, colCount).reduce((sum, weight) => sum + weight, 0);
    const gap = 2;
    const cellWidths = weights
      .slice(0, colCount)
      .map((weight) => (tableWidth - gap * (colCount - 1)) * (weight / totalWeight));
    const tableTop = mainTop;
    const headerHeight = 52;
    const bodyRows = Math.max(1, rows.length - 1);
    const rowHeight = Math.max(
      68,
      Math.floor((panelHeight - headerHeight - gap * (rows.length - 1)) / bodyRows),
    );
    rows.forEach((row, rowIndex) => {
      let cellLeft = tableLeft;
      row.slice(0, colCount).forEach((cell, colIndex) => {
        const isHeader = rowIndex === 0 && Boolean(tableBlock.headers?.length);
        const width = cellWidths[colIndex] || cellWidths[0] || CONTENT_WIDTH;
        const height = isHeader ? headerHeight : rowHeight;
        const top =
          tableTop + (isHeader ? 0 : headerHeight + gap + (rowIndex - 1) * (rowHeight + gap));
        const fontSize = isHeader
          ? 10
          : isMathComparison && colCount >= 4
            ? 9
            : colIndex === 0
              ? 11
              : 10;
        const lineHeight = isHeader ? 14 : isMathComparison && colCount >= 4 ? 13 : 14;
        const bodyFill =
          colIndex === 0
            ? args.style.panelFillBlue
            : rowIndex % 2 === 0
              ? args.style.tableStripeFill
              : args.style.tableFill;
        const cellText = compactClassicComparisonPhrase(
          cell,
          isMathComparison && colCount >= 4
            ? isHeader || colIndex === 0
              ? args.language === 'en-US'
                ? 30
                : 20
              : colIndex === colCount - 1
                ? args.language === 'en-US'
                  ? 52
                  : 28
                : args.language === 'en-US'
                  ? 40
                  : 24
            : isHeader || colIndex === 0
              ? args.language === 'en-US'
                ? 32
                : 18
              : colIndex === colCount - 1
                ? args.language === 'en-US'
                  ? 48
                  : 28
                : args.language === 'en-US'
                  ? 34
                  : 24,
        );
        const normalizedCell = cell.toLowerCase();
        const positiveAccent =
          colIndex > 0 &&
          /(最高|最快|较低|可控|适合|清楚|best|fast|low|controlled|fit|clear)/i.test(
            normalizedCell,
          );
        const cautionAccent =
          colIndex > 0 &&
          /(不稳定|取决|前期|高|临时|需要|成本|unstable|depends|high|temporary|needs?)/i.test(
            normalizedCell,
          );
        const accentColor = positiveAccent
          ? args.style.green
          : cautionAccent
            ? args.style.yellow
            : undefined;
        elements.push(
          createRectShape({
            left: cellLeft,
            top,
            width,
            height,
            fill: isHeader ? args.style.titleText : bodyFill,
            outlineColor: args.style.subtleBorder,
            text: createShapeText({
              html: `<p style="margin:0${accentColor ? ' 0 0 8px' : ''};font-size:${fontSize}px;line-height:${lineHeight}px;color:${
                isHeader ? '#ffffff' : colIndex === 0 ? args.style.blue : args.style.bodyText
              };font-weight:${isHeader || colIndex === 0 ? 780 : 560};">${renderClassicInlineHtml(
                cellText,
              )}</p>`,
              color: isHeader ? '#ffffff' : colIndex === 0 ? args.style.blue : args.style.bodyText,
              textType: 'content',
              lineHeight: 1.22,
              paragraphSpace: 0,
              align: 'middle',
            }),
          }),
        );
        if (accentColor) {
          elements.push(
            createRectShape({
              left: cellLeft + 6,
              top: top + 14,
              width: 3,
              height: Math.max(18, height - 28),
              fill: accentColor,
            }),
          );
        }
        cellLeft += width + gap;
      });
    });
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}
