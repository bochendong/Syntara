import type {
  PPTElement,
  PPTLatexElement,
  PPTShapeElement,
  PPTTextElement,
  TextType,
} from '@/lib/types/slides';
import { getElementListRange, getElementRange } from '@/lib/utils/element';

export const TEXT_BOX_PADDING_PX = 10;
const DEFAULT_PARAGRAPH_SPACE_PX = 5;
const MIN_PARAGRAPH_SPACE_PX = 2;
const MIN_LINE_HEIGHT = 1.25;
const REPAIR_GAP_PX = 12;
const DEFAULT_CONTAINER_INSET_PX = 10;
const MAX_CONTAINER_INSET_PX = 24;
const MIN_CONTAINER_STACK_GAP_PX = 6;
const MAX_CONTAINER_STACK_GAP_PX = 18;
const CONTAINER_ATTACH_GAP_PX = 20;
const MAX_CONTAINER_CONTENT_COUNT = 3;
const MAX_CONTAINER_MIGRATION_EXTRA_HEIGHT_PX = 96;

export interface SlideViewport {
  width: number;
  height: number;
}

export interface OverflowFitMetrics {
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  isOverflowing: boolean;
}

const DEFAULT_VIEWPORT: SlideViewport = {
  width: 1000,
  height: 562.5,
};

const DEFAULT_FONT_SIZE_BY_TEXT_TYPE: Record<TextType | 'default', number> = {
  title: 32,
  subtitle: 24,
  content: 16,
  item: 16,
  itemTitle: 18,
  notes: 14,
  header: 16,
  footer: 14,
  partNumber: 28,
  itemNumber: 20,
  default: 16,
};

const MIN_FONT_SIZE_BY_TEXT_TYPE: Record<TextType | 'default', number> = {
  title: 28,
  subtitle: 20,
  content: 14,
  item: 14,
  itemTitle: 16,
  notes: 12,
  header: 14,
  footer: 12,
  partNumber: 18,
  itemNumber: 16,
  default: 14,
};

type HtmlParagraph = {
  text: string;
  fontSizePx: number;
  lineHeightPx: number;
};

type ShapeTextPair = {
  readonly shapeIndex: number;
  readonly insets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

type LayoutContentElement = PPTTextElement | PPTLatexElement;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseInlineStyles(styleText?: string): Record<string, string> {
  if (!styleText) return {};

  return styleText
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const colonIndex = item.indexOf(':');
      if (colonIndex === -1) return acc;

      const key = item.slice(0, colonIndex).trim().toLowerCase();
      const value = item.slice(colonIndex + 1).trim();
      if (key && value) acc[key] = value;
      return acc;
    }, {});
}

function parseStyleAttribute(attrs: string): Record<string, string> {
  const match = attrs.match(/\sstyle\s*=\s*(['"])([\s\S]*?)\1/i);
  return parseInlineStyles(match?.[2]);
}

function parsePxValue(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)px/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberish(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLineHeightPx(
  value: string | undefined,
  fontSizePx: number,
  fallbackRatio: number,
): number {
  const pxValue = parsePxValue(value);
  if (pxValue !== null) return pxValue;

  const numeric = parseNumberish(value);
  if (numeric !== null) return numeric * fontSizePx;

  return fallbackRatio * fontSizePx;
}

function normalizePlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' '),
  );
}

function resolveDefaultFontSize(textType?: TextType): number {
  if (!textType) return DEFAULT_FONT_SIZE_BY_TEXT_TYPE.default;
  return DEFAULT_FONT_SIZE_BY_TEXT_TYPE[textType] ?? DEFAULT_FONT_SIZE_BY_TEXT_TYPE.default;
}

function resolveMinFontSize(textType?: TextType): number {
  if (!textType) return MIN_FONT_SIZE_BY_TEXT_TYPE.default;
  return MIN_FONT_SIZE_BY_TEXT_TYPE[textType] ?? MIN_FONT_SIZE_BY_TEXT_TYPE.default;
}

function resolveParagraphSpacePx(element: Pick<PPTTextElement, 'paragraphSpace'>): number {
  return element.paragraphSpace ?? DEFAULT_PARAGRAPH_SPACE_PX;
}

function extractHtmlParagraphs(element: PPTTextElement): HtmlParagraph[] {
  const defaultFontSizePx = resolveDefaultFontSize(element.textType);
  const defaultLineHeight = element.lineHeight ?? 1.5;
  const blockRegex = /<(p|li|h1|h2|h3|h4|h5|h6|blockquote|pre)([^>]*)>([\s\S]*?)<\/\1>/gi;

  const paragraphs: HtmlParagraph[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(element.content)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrs = match[2] || '';
    const innerHtml = match[3] || '';
    const styles = parseStyleAttribute(attrs);

    const inlineFontSizes = Array.from(
      innerHtml.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi),
      (entry) => Number.parseFloat(entry[1]),
    ).filter((value) => Number.isFinite(value));
    const fontSizePx = Math.max(
      parsePxValue(styles['font-size']) ?? defaultFontSizePx,
      inlineFontSizes.length > 0 ? Math.max(...inlineFontSizes) : defaultFontSizePx,
    );

    const inlineLineHeights = Array.from(
      innerHtml.matchAll(/line-height\s*:\s*(\d+(?:\.\d+)?)(px)?/gi),
      (entry) => {
        const numeric = Number.parseFloat(entry[1]);
        if (!Number.isFinite(numeric)) return null;
        return entry[2] ? numeric : numeric * fontSizePx;
      },
    ).filter((value): value is number => value !== null);

    const lineHeightPx = Math.max(
      parseLineHeightPx(styles['line-height'], fontSizePx, defaultLineHeight),
      inlineLineHeights.length > 0 ? Math.max(...inlineLineHeights) : 0,
    );

    const normalizedText = normalizePlainText(innerHtml).trim();
    const text = tagName === 'li' ? `• ${normalizedText}` : normalizedText;

    paragraphs.push({
      text: text || ' ',
      fontSizePx,
      lineHeightPx,
    });
  }

  if (paragraphs.length > 0) return paragraphs;

  const fallbackText = normalizePlainText(element.content).trim();
  return [
    {
      text: fallbackText || ' ',
      fontSizePx: defaultFontSizePx,
      lineHeightPx: (element.lineHeight ?? 1.5) * defaultFontSizePx,
    },
  ];
}

function isCjkCharacter(char: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char);
}

function getCharacterWidthPx(char: string, fontSizePx: number): number {
  if (char === '\n') return 0;
  if (/\s/.test(char)) return fontSizePx * 0.35;
  if (isCjkCharacter(char)) return fontSizePx * 0.96;
  if (/[mwMW@#%&]/.test(char)) return fontSizePx * 0.8;
  if (/[ilI\.,;:'"`!]/.test(char)) return fontSizePx * 0.3;
  if (/[A-Z0-9]/.test(char)) return fontSizePx * 0.62;
  return fontSizePx * 0.56;
}

function measureWordWidthPx(word: string, fontSizePx: number): number {
  return Array.from(word).reduce((sum, char) => sum + getCharacterWidthPx(char, fontSizePx), 0);
}

function wrapTextLineCount(text: string, widthPx: number, fontSizePx: number): number {
  const safeWidthPx = Math.max(8, widthPx);
  const paragraphs = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = paragraphs.length > 0 ? paragraphs : [' '];

  let lineCount = 0;
  for (const line of lines) {
    if (!/\s/.test(line) || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(line)) {
      let currentWidth = 0;
      let currentLineCount = 1;
      for (const char of Array.from(line)) {
        const charWidth = getCharacterWidthPx(char, fontSizePx);
        if (currentWidth > 0 && currentWidth + charWidth > safeWidthPx) {
          currentLineCount += 1;
          currentWidth = 0;
        }
        currentWidth += charWidth;
      }
      lineCount += currentLineCount;
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    let currentWidth = 0;
    let currentLineCount = 1;
    for (const word of words) {
      const wordWidth = measureWordWidthPx(word, fontSizePx);
      const spacerWidth = currentWidth > 0 ? getCharacterWidthPx(' ', fontSizePx) : 0;

      if (currentWidth > 0 && currentWidth + spacerWidth + wordWidth <= safeWidthPx) {
        currentWidth += spacerWidth + wordWidth;
        continue;
      }

      if (currentWidth > 0) {
        currentLineCount += 1;
        currentWidth = 0;
      }

      if (wordWidth <= safeWidthPx) {
        currentWidth = wordWidth;
        continue;
      }

      let chunkWidth = 0;
      for (const char of Array.from(word)) {
        const charWidth = getCharacterWidthPx(char, fontSizePx);
        if (chunkWidth > 0 && chunkWidth + charWidth > safeWidthPx) {
          currentLineCount += 1;
          chunkWidth = 0;
        }
        chunkWidth += charWidth;
      }
      currentWidth = chunkWidth;
    }
    lineCount += currentLineCount;
  }

  return Math.max(1, lineCount);
}

export function estimateTextElementContentHeight(
  element: PPTTextElement,
  widthPx = element.width,
): number {
  const contentWidth = Math.max(12, widthPx - TEXT_BOX_PADDING_PX * 2);
  const paragraphSpacePx = resolveParagraphSpacePx(element);
  const paragraphs = extractHtmlParagraphs(element);

  const textHeight = paragraphs.reduce((sum, paragraph) => {
    const lineCount = wrapTextLineCount(paragraph.text, contentWidth, paragraph.fontSizePx);
    return sum + Math.max(paragraph.lineHeightPx, lineCount * paragraph.lineHeightPx);
  }, 0);

  const paragraphGaps = Math.max(0, paragraphs.length - 1) * paragraphSpacePx;
  return Math.max(40, Math.ceil(textHeight + paragraphGaps + TEXT_BOX_PADDING_PX * 2 + 2));
}

export function getMaxFontSizeForTextElement(element: PPTTextElement): number {
  const paragraphSizes = extractHtmlParagraphs(element).map((paragraph) => paragraph.fontSizePx);
  const fallback = resolveDefaultFontSize(element.textType);
  return paragraphSizes.length > 0 ? Math.max(...paragraphSizes, fallback) : fallback;
}

function isTextElement(element: PPTElement | undefined): element is PPTTextElement {
  return !!element && element.type === 'text';
}

function isLatexElement(element: PPTElement | undefined): element is PPTLatexElement {
  return !!element && element.type === 'latex';
}

function isLayoutContentElement(element: PPTElement | undefined): element is LayoutContentElement {
  return isTextElement(element) || isLatexElement(element);
}

function hasShapeTextContent(shape: PPTShapeElement): boolean {
  return !!shape.text?.content?.replace(/<[^>]+>/g, '').trim();
}

function getHorizontalOverlapWidth(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

function getHorizontalOverlapRatio(
  shape: Pick<PPTShapeElement, 'left' | 'width'>,
  element: Pick<LayoutContentElement, 'left' | 'width'>,
): number {
  const overlapWidth = getHorizontalOverlapWidth(
    [shape.left, shape.left + shape.width],
    [element.left, element.left + element.width],
  );
  return overlapWidth / Math.max(1, Math.min(shape.width, element.width));
}

function overlapsShapeLane(
  shapeRange: ReturnType<typeof getElementRange>,
  candidateRange: ReturnType<typeof getElementRange>,
): boolean {
  return (
    getHorizontalOverlapWidth(
      [shapeRange.minX, shapeRange.maxX],
      [candidateRange.minX, candidateRange.maxX],
    ) > 24 &&
    rangesOverlap(
      [shapeRange.minY - 12, shapeRange.maxY + 48],
      [candidateRange.minY, candidateRange.maxY],
    )
  );
}

function updateStyleBlock(
  source: string,
  property: string,
  updater: (value: number, unit?: string) => number | null,
): string {
  const pattern = new RegExp(`(${property}\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)(px)?`, 'gi');
  return source.replace(pattern, (_match, prefix: string, rawValue: string, unit?: string) => {
    const numeric = Number.parseFloat(rawValue);
    if (!Number.isFinite(numeric)) return _match;
    const next = updater(numeric, unit);
    if (next === null) return _match;
    const normalized = Number.isFinite(next) ? Number(next.toFixed(2)) : numeric;
    return `${prefix}${normalized}${unit || ''}`;
  });
}

function scaleTypographyHtml(
  content: string,
  args: {
    fontScale?: number;
    lineHeightScale?: number;
    scaleUnitlessLineHeight?: boolean;
  },
): string {
  let next = content;
  if (args.fontScale && args.fontScale !== 1) {
    next = updateStyleBlock(next, 'font-size', (value) => Math.max(1, value * args.fontScale!));
  }
  if (args.lineHeightScale && args.lineHeightScale !== 1) {
    next = updateStyleBlock(next, 'line-height', (value, unit) => {
      if (!unit && !args.scaleUnitlessLineHeight) return null;
      return value * args.lineHeightScale!;
    });
  }
  return next;
}

function tightenTextElement(element: PPTTextElement, minFontSizePx: number): PPTTextElement {
  const currentMaxFontSize = getMaxFontSizeForTextElement(element);
  const paragraphSpace = resolveParagraphSpacePx(element);
  const nextParagraphSpace = Math.max(MIN_PARAGRAPH_SPACE_PX, paragraphSpace - 1);
  const nextLineHeight = Math.max(MIN_LINE_HEIGHT, (element.lineHeight ?? 1.5) - 0.06);

  let nextContent = element.content;
  let changed = false;

  if (currentMaxFontSize > minFontSizePx) {
    const nextMaxFontSize = Math.max(
      minFontSizePx,
      currentMaxFontSize - (currentMaxFontSize - minFontSizePx >= 2 ? 2 : 1),
    );
    const fontScale = nextMaxFontSize / currentMaxFontSize;
    nextContent = scaleTypographyHtml(nextContent, {
      fontScale,
      lineHeightScale: fontScale,
      scaleUnitlessLineHeight: false,
    });
    changed = true;
  } else if (paragraphSpace > MIN_PARAGRAPH_SPACE_PX) {
    changed = true;
  } else if ((element.lineHeight ?? 1.5) > MIN_LINE_HEIGHT) {
    nextContent = scaleTypographyHtml(nextContent, {
      lineHeightScale: nextLineHeight / Math.max(element.lineHeight ?? 1.5, MIN_LINE_HEIGHT),
      scaleUnitlessLineHeight: true,
    });
    changed = true;
  }

  if (!changed) return element;

  return {
    ...element,
    content: nextContent,
    paragraphSpace: nextParagraphSpace,
    lineHeight: nextLineHeight,
  };
}

function resolveContainerContentLeft(
  shape: PPTShapeElement,
  element: LayoutContentElement,
  inset = DEFAULT_CONTAINER_INSET_PX,
): number {
  const maxLeft = shape.left + Math.max(inset, shape.width - inset - element.width);
  const minLeft = shape.left + inset;
  const shapeCenter = shape.left + shape.width / 2;
  const elementCenter = element.left + element.width / 2;
  const isCentered = Math.abs(shapeCenter - elementCenter) <= 14;

  if (isCentered && element.width <= shape.width - inset * 2) {
    return Math.round(shape.left + (shape.width - element.width) / 2);
  }

  if (maxLeft < minLeft) {
    return Math.round(shape.left + Math.max(0, (shape.width - element.width) / 2));
  }

  return Math.round(clamp(element.left, minLeft, maxLeft));
}

function cloneElement<T extends PPTElement>(element: T): T {
  return {
    ...element,
    ...(element.type === 'shape' && element.text ? { text: { ...element.text } } : {}),
  };
}

function collectContainerContentIndexes(elements: PPTElement[], shapeIndex: number): number[] {
  const shape = elements[shapeIndex];
  if (!shape || shape.type !== 'shape') return [];
  if (hasShapeTextContent(shape) || shape.pattern || shape.special) return [];

  const shapeRange = getElementRange(shape);
  const indexes: number[] = [];
  let laneBottom = shapeRange.maxY;
  let sawBarrier = false;

  for (let index = shapeIndex + 1; index < elements.length; index += 1) {
    const candidate = elements[index];
    if (!isLayoutContentElement(candidate)) {
      if (indexes.length > 0 && candidate) {
        const candidateRange = getElementRange(candidate);
        if (overlapsShapeLane(shapeRange, candidateRange)) {
          sawBarrier = true;
          break;
        }
      }
      if (
        candidate?.type === 'shape' &&
        getElementRange(candidate).minY > laneBottom + CONTAINER_ATTACH_GAP_PX
      ) {
        break;
      }
      continue;
    }

    const candidateRange = getElementRange(candidate);
    const overlapRatio = getHorizontalOverlapRatio(shape, candidate);
    const fitsWidth = candidate.width <= shape.width + 16;
    const leftSlack = candidate.left - shape.left;
    const rightSlack = shape.left + shape.width - (candidate.left + candidate.width);
    const horizontallyAligned =
      fitsWidth && (overlapRatio >= 0.72 || (leftSlack >= -16 && rightSlack >= -16));

    if (!horizontallyAligned) {
      if (indexes.length > 0 && candidateRange.minY > laneBottom + CONTAINER_ATTACH_GAP_PX) {
        break;
      }
      continue;
    }

    const attachCeiling =
      indexes.length === 0
        ? shapeRange.maxY + CONTAINER_ATTACH_GAP_PX
        : laneBottom + MAX_CONTAINER_STACK_GAP_PX;
    const attachFloor = shapeRange.minY - 12;

    if (candidateRange.minY < attachFloor) continue;
    if (candidateRange.minY > attachCeiling) {
      if (indexes.length > 0) break;
      continue;
    }

    indexes.push(index);
    if (indexes.length > MAX_CONTAINER_CONTENT_COUNT) return [];
    laneBottom = Math.max(laneBottom, candidateRange.maxY);
  }

  if (indexes.length === 0 || sawBarrier) return [];

  const firstRange = getElementRange(elements[indexes[0]] as LayoutContentElement);
  const lastRange = getElementRange(elements[indexes[indexes.length - 1]] as LayoutContentElement);
  const startsInside = firstRange.minY <= shapeRange.maxY - 4;
  const startsJustBelow = firstRange.minY <= shapeRange.maxY + CONTAINER_ATTACH_GAP_PX;
  const spanHeight = lastRange.maxY - firstRange.minY;
  const projectedHeight =
    Math.max(shape.height, DEFAULT_CONTAINER_INSET_PX * 2 + spanHeight) - shape.height;

  if (!startsInside && !startsJustBelow) return [];
  if (projectedHeight > MAX_CONTAINER_MIGRATION_EXTRA_HEIGHT_PX) return [];

  return indexes;
}

function rangesOverlap(a: [number, number], b: [number, number], tolerance = 0): boolean {
  return a[0] < b[1] - tolerance && a[1] > b[0] + tolerance;
}

function findTextShapePair(elements: PPTElement[], textIndex: number): ShapeTextPair | null {
  const text = elements[textIndex];
  if (!text || text.type !== 'text') return null;

  const textRange = getElementRange(text);
  let bestMatch: { score: number; shapeIndex: number; pair: ShapeTextPair } | null = null;

  for (let index = 0; index < textIndex; index += 1) {
    const candidate = elements[index];
    if (!candidate || candidate.type !== 'shape') continue;

    const shape = candidate as PPTShapeElement;
    const shapeRange = getElementRange(shape);
    const containsText =
      textRange.minX >= shapeRange.minX - 6 &&
      textRange.maxX <= shapeRange.maxX + 6 &&
      textRange.minY >= shapeRange.minY - 6 &&
      textRange.maxY <= shapeRange.maxY + 6;
    if (!containsText) continue;

    const widthSlack = shape.width - text.width;
    const heightSlack = shape.height - text.height;
    if (widthSlack < 16 || heightSlack < 12) continue;
    if (shape.height < text.height * 0.8 || shape.width < text.width * 0.9) continue;

    const insets = {
      left: Math.round(text.left - shape.left),
      right: Math.round(shape.left + shape.width - (text.left + text.width)),
      top: Math.round(text.top - shape.top),
      bottom: Math.round(shape.top + shape.height - (text.top + text.height)),
    };

    const score =
      Math.abs(insets.left - insets.right) * 0.35 +
      Math.abs(insets.top - insets.bottom) * 0.2 +
      shape.width * 0.001 +
      shape.height * 0.002 +
      (textIndex - index) * 0.15;

    const pair: ShapeTextPair = {
      shapeIndex: index,
      insets,
    };
    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { score, shapeIndex: index, pair };
    }
  }

  return bestMatch?.pair ?? null;
}

function translateElement(element: PPTElement, deltaY: number): PPTElement {
  if (deltaY === 0) return element;
  return {
    ...element,
    top: element.top + deltaY,
  } as PPTElement;
}

function reflowFollowingElements(args: {
  elements: PPTElement[];
  startIndex: number;
  oldBottom: number;
  newBottom: number;
  anchorXRange: [number, number];
}): PPTElement[] {
  const elements = args.elements.map((element) => cloneElement(element));
  let laneBottom = args.newBottom;

  for (let index = args.startIndex + 1; index < elements.length; index += 1) {
    const element = elements[index];
    const range = getElementRange(element);
    const horizontallyRelated = rangesOverlap([range.minX, range.maxX], args.anchorXRange, 10);
    const verticallyBlocked =
      range.minY < laneBottom + REPAIR_GAP_PX && range.maxY > args.oldBottom - 2;
    const isDownstream = range.minY >= args.oldBottom - 2;

    if (!horizontallyRelated || !verticallyBlocked || !isDownstream) continue;

    const deltaY = laneBottom + REPAIR_GAP_PX - range.minY;
    elements[index] = translateElement(element, deltaY);

    const movedRange = getElementRange(elements[index]);
    laneBottom = Math.max(laneBottom, movedRange.maxY);
  }

  return elements;
}

function applyTextHeight(text: PPTTextElement, allowTightHeight: boolean): PPTTextElement {
  const estimatedHeight = estimateTextElementContentHeight(text);
  if (allowTightHeight) {
    return {
      ...text,
      height: estimatedHeight,
    };
  }

  if (estimatedHeight <= text.height + 2) return text;
  return {
    ...text,
    height: estimatedHeight,
  };
}

function applyContentHeight(
  element: LayoutContentElement,
  allowTightHeight: boolean,
): LayoutContentElement {
  if (element.type === 'text') {
    return applyTextHeight(element, allowTightHeight);
  }

  return element;
}

function applyContainerContentLayout(
  elements: PPTElement[],
  shapeIndex: number,
  contentIndexes: number[],
): PPTElement[] {
  if (contentIndexes.length === 0) return elements;

  const nextElements = elements.map((element) => cloneElement(element));
  const shape = nextElements[shapeIndex] as PPTShapeElement;
  const oldShapeRange = getElementRange(shape);
  const originalContents = contentIndexes.map(
    (index) => nextElements[index] as LayoutContentElement,
  );
  const firstOriginalRange = getElementRange(originalContents[0]);
  const lastOriginalRange = getElementRange(originalContents[originalContents.length - 1]);
  const firstStartsInside = firstOriginalRange.minY < oldShapeRange.maxY - 4;

  const topInset = firstStartsInside
    ? clamp(
        Math.round(firstOriginalRange.minY - oldShapeRange.minY),
        DEFAULT_CONTAINER_INSET_PX,
        MAX_CONTAINER_INSET_PX,
      )
    : DEFAULT_CONTAINER_INSET_PX;
  const bottomInset = firstStartsInside
    ? clamp(
        Math.round(oldShapeRange.maxY - lastOriginalRange.maxY),
        DEFAULT_CONTAINER_INSET_PX,
        MAX_CONTAINER_INSET_PX,
      )
    : DEFAULT_CONTAINER_INSET_PX;

  let cursorTop = shape.top + topInset;
  let previousOriginalBottom = firstOriginalRange.minY;
  let latestPlacedBottom = cursorTop;

  for (let offset = 0; offset < contentIndexes.length; offset += 1) {
    const index = contentIndexes[offset];
    const original = originalContents[offset];
    const sized = applyContentHeight(original, false);
    const currentRange = getElementRange(original);

    if (offset > 0) {
      const rawGap = Math.round(currentRange.minY - previousOriginalBottom);
      const gap = clamp(rawGap, MIN_CONTAINER_STACK_GAP_PX, MAX_CONTAINER_STACK_GAP_PX);
      cursorTop = latestPlacedBottom + gap;
    }

    const placedElement: LayoutContentElement = {
      ...sized,
      left: resolveContainerContentLeft(shape, sized),
      top: Math.round(cursorTop),
      height: Math.round(sized.height),
    };

    nextElements[index] = placedElement;
    latestPlacedBottom = placedElement.top + placedElement.height;
    previousOriginalBottom = currentRange.maxY;
  }

  const requiredShapeHeight = Math.ceil(latestPlacedBottom - shape.top + bottomInset);
  if (requiredShapeHeight > shape.height + MAX_CONTAINER_MIGRATION_EXTRA_HEIGHT_PX) {
    return elements;
  }
  const updatedShape: PPTShapeElement = {
    ...shape,
    height: Math.max(shape.height, requiredShapeHeight),
  };

  nextElements[shapeIndex] = updatedShape;

  const newShapeRange = getElementRange(updatedShape);
  const oldBottom = Math.max(oldShapeRange.maxY, lastOriginalRange.maxY);
  const newBottom = Math.max(newShapeRange.maxY, latestPlacedBottom);

  if (newBottom <= oldBottom + 1) return nextElements;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: Math.max(shapeIndex, contentIndexes[contentIndexes.length - 1]),
    oldBottom,
    newBottom,
    anchorXRange: [oldShapeRange.minX, oldShapeRange.maxX],
  });
}

function normalizeContainerBoundContent(elements: PPTElement[]): PPTElement[] {
  let normalized = elements.map((element) => cloneElement(element));

  for (let index = 0; index < normalized.length; index += 1) {
    const candidate = normalized[index];
    if (!candidate || candidate.type !== 'shape') continue;

    const contentIndexes = collectContainerContentIndexes(normalized, index);
    if (contentIndexes.length === 0) continue;
    normalized = applyContainerContentLayout(normalized, index, contentIndexes);
  }

  return normalized;
}

function applyShapePairLayout(
  elements: PPTElement[],
  textIndex: number,
  pair: ShapeTextPair,
  allowTightHeight: boolean,
): PPTElement[] {
  const nextElements = elements.map((element) => cloneElement(element));
  const text = nextElements[textIndex] as PPTTextElement;
  const shape = nextElements[pair.shapeIndex] as PPTShapeElement;
  const oldShapeRange = getElementRange(shape);
  const oldTextRange = getElementRange(text);

  const updatedText = applyTextHeight(text, allowTightHeight);
  const requiredShapeHeight = Math.ceil(pair.insets.top + updatedText.height + pair.insets.bottom);

  const updatedShape: PPTShapeElement = {
    ...shape,
    height: Math.max(shape.height, requiredShapeHeight),
  };

  const positionedText: PPTTextElement = {
    ...updatedText,
    left: updatedShape.left + pair.insets.left,
    top: updatedShape.top + pair.insets.top,
  };

  nextElements[pair.shapeIndex] = updatedShape;
  nextElements[textIndex] = positionedText;

  const newShapeRange = getElementRange(updatedShape);
  const oldBottom = Math.max(oldShapeRange.maxY, oldTextRange.maxY);
  const newBottom = Math.max(newShapeRange.maxY, positionedText.top + positionedText.height);
  if (newBottom <= oldBottom + 1) return nextElements;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: Math.max(textIndex, pair.shapeIndex),
    oldBottom,
    newBottom,
    anchorXRange: [
      Math.min(oldShapeRange.minX, oldTextRange.minX),
      Math.max(oldShapeRange.maxX, oldTextRange.maxX),
    ],
  });
}

function applyStandaloneTextLayout(
  elements: PPTElement[],
  textIndex: number,
  allowTightHeight: boolean,
): PPTElement[] {
  const nextElements = elements.map((element) => cloneElement(element));
  const text = nextElements[textIndex] as PPTTextElement;
  const oldRange = getElementRange(text);
  const updatedText = applyTextHeight(text, allowTightHeight);
  nextElements[textIndex] = updatedText;

  const newBottom = updatedText.top + updatedText.height;
  if (newBottom <= oldRange.maxY + 1) return nextElements;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: textIndex,
    oldBottom: oldRange.maxY,
    newBottom,
    anchorXRange: [oldRange.minX, oldRange.maxX],
  });
}

function fitsViewport(elements: PPTElement[], viewport: SlideViewport): boolean {
  const range = getElementListRange(elements);
  return range.maxY <= viewport.height + 0.5 && range.maxX <= viewport.width + 0.5;
}

function normalizeSingleTextLayout(
  elements: PPTElement[],
  textIndex: number,
  viewport: SlideViewport,
): PPTElement[] {
  const baseElements = elements.map((element) => cloneElement(element));
  const baseText = baseElements[textIndex];
  if (!baseText || baseText.type !== 'text') return baseElements;

  let pair = findTextShapePair(baseElements, textIndex);
  let bestElements = baseElements;
  let bestOverflow = Number.POSITIVE_INFINITY;
  let workingText = baseText;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const attemptElements = pair
      ? applyShapePairLayout(
          baseElements.map((element, index) =>
            index === textIndex ? workingText : cloneElement(element),
          ),
          textIndex,
          pair,
          attempt > 0,
        )
      : applyStandaloneTextLayout(
          baseElements.map((element, index) =>
            index === textIndex ? workingText : cloneElement(element),
          ),
          textIndex,
          attempt > 0,
        );

    const overflow = Math.max(0, getElementListRange(attemptElements).maxY - viewport.height);
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      bestElements = attemptElements;
    }
    if (overflow <= 0 && fitsViewport(attemptElements, viewport)) {
      return attemptElements;
    }

    const minFontSizePx = resolveMinFontSize(workingText.textType);
    const tightened = tightenTextElement(workingText, minFontSizePx);
    const unchanged =
      tightened.content === workingText.content &&
      tightened.paragraphSpace === workingText.paragraphSpace &&
      tightened.lineHeight === workingText.lineHeight;
    if (unchanged) break;
    workingText = tightened;
    pair = findTextShapePair(
      baseElements.map((element, index) => (index === textIndex ? workingText : element)),
      textIndex,
    );
  }

  return bestElements;
}

export function normalizeSlideTextLayout(
  elements: PPTElement[],
  viewport: SlideViewport = DEFAULT_VIEWPORT,
): PPTElement[] {
  let normalized = normalizeContainerBoundContent(elements);

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index]?.type !== 'text') continue;
    normalized = normalizeSingleTextLayout(normalized, index, viewport);
  }

  return normalized;
}

export function computeOverflowFitMetrics(args: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}): OverflowFitMetrics {
  const viewportWidth = Math.max(0, args.viewportWidth);
  const viewportHeight = Math.max(0, args.viewportHeight);
  const contentWidth = Math.max(0, args.contentWidth);
  const contentHeight = Math.max(0, args.contentHeight);

  if (viewportWidth === 0 || viewportHeight === 0 || contentWidth === 0 || contentHeight === 0) {
    return {
      scale: 1,
      viewportWidth,
      viewportHeight,
      contentWidth,
      contentHeight,
      isOverflowing: false,
    };
  }

  const widthScale = viewportWidth / contentWidth;
  const heightScale = viewportHeight / contentHeight;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    scale,
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
    isOverflowing: scale < 0.999,
  };
}
