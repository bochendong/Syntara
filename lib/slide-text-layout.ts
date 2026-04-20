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
const REPAIR_GAP_PX = 12;
const DEFAULT_CONTAINER_INSET_PX = 10;
const MAX_CONTAINER_INSET_PX = 24;
const DETACHED_CONTAINER_MAX_GAP_PX = 28;
export const MIN_TEXT_LINE_HEIGHT_RATIO = 1.1;
export const MAX_TEXT_LINE_HEIGHT_RATIO = 2.2;

export interface SlideViewport {
  width: number;
  height: number;
}

export interface SlideLayoutValidationIssue {
  code:
    | 'viewport_overflow'
    | 'text_box_overflow'
    | 'shape_text_overflow'
    | 'contained_element_overflow'
    | 'detached_container_content'
    | 'invalid_text_metrics'
    | 'element_overlap';
  elementId?: string;
  shapeId?: string;
  otherElementId?: string;
  message: string;
}

export interface SlideLayoutValidationResult {
  isValid: boolean;
  issues: SlideLayoutValidationIssue[];
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

type HtmlParagraph = {
  text: string;
  fontSizePx: number;
  lineHeightPx: number;
};

type LayoutContentElement = PPTTextElement | PPTLatexElement;

type ContainedShapePair = {
  shapeIndex: number;
  insets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

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
  if (pxValue !== null) {
    return clamp(
      pxValue,
      fontSizePx * MIN_TEXT_LINE_HEIGHT_RATIO,
      fontSizePx * MAX_TEXT_LINE_HEIGHT_RATIO,
    );
  }

  const numeric = parseNumberish(value);
  if (numeric !== null) {
    return clamp(
      numeric * fontSizePx,
      fontSizePx * MIN_TEXT_LINE_HEIGHT_RATIO,
      fontSizePx * MAX_TEXT_LINE_HEIGHT_RATIO,
    );
  }

  return clamp(
    fallbackRatio * fontSizePx,
    fontSizePx * MIN_TEXT_LINE_HEIGHT_RATIO,
    fontSizePx * MAX_TEXT_LINE_HEIGHT_RATIO,
  );
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

function hasInvalidTextMetrics(element: PPTTextElement): boolean {
  if (element.lineHeight !== undefined) {
    if (
      element.lineHeight < MIN_TEXT_LINE_HEIGHT_RATIO ||
      element.lineHeight > MAX_TEXT_LINE_HEIGHT_RATIO
    ) {
      return true;
    }
  }

  if (element.paragraphSpace !== undefined && element.paragraphSpace < 0) {
    return true;
  }

  const paragraphs = extractHtmlParagraphs(element);
  return paragraphs.some(
    (paragraph) =>
      paragraph.lineHeightPx < paragraph.fontSizePx * MIN_TEXT_LINE_HEIGHT_RATIO - 0.5 ||
      paragraph.lineHeightPx > paragraph.fontSizePx * MAX_TEXT_LINE_HEIGHT_RATIO + 0.5,
  );
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

function isTextElement(element: PPTElement | undefined): element is PPTTextElement {
  return !!element && element.type === 'text';
}

function isLatexElement(element: PPTElement | undefined): element is PPTLatexElement {
  return !!element && element.type === 'latex';
}

function isLayoutContentElement(element: PPTElement | undefined): element is LayoutContentElement {
  return isTextElement(element) || isLatexElement(element);
}

function isShapeElement(element: PPTElement | undefined): element is PPTShapeElement {
  return !!element && element.type === 'shape';
}

function hasShapeTextContent(shape: PPTShapeElement): boolean {
  return !!shape.text?.content?.replace(/<[^>]+>/g, '').trim();
}

function cloneElement<T extends PPTElement>(element: T): T {
  return {
    ...element,
    ...(element.type === 'shape' && element.text ? { text: { ...element.text } } : {}),
  };
}

function translateElement(element: PPTElement, deltaY: number): PPTElement {
  if (deltaY === 0) return element;
  return {
    ...element,
    top: element.top + deltaY,
  } as PPTElement;
}

function rangesOverlap(a: [number, number], b: [number, number], tolerance = 0): boolean {
  return a[0] < b[1] - tolerance && a[1] > b[0] + tolerance;
}

function isRangeWithin(
  inner: ReturnType<typeof getElementRange>,
  outer: ReturnType<typeof getElementRange>,
  tolerance = 0,
): boolean {
  return (
    inner.minX >= outer.minX - tolerance &&
    inner.maxX <= outer.maxX + tolerance &&
    inner.minY >= outer.minY - tolerance &&
    inner.maxY <= outer.maxY + tolerance
  );
}

function createSyntheticTextElementFromShape(shape: PPTShapeElement): PPTTextElement | null {
  if (!shape.text?.content?.trim()) return null;

  return {
    id: `${shape.id}__shape_text`,
    type: 'text',
    left: shape.left,
    top: shape.top,
    width: shape.width,
    height: shape.height,
    rotate: shape.rotate,
    content: shape.text.content,
    defaultFontName: shape.text.defaultFontName,
    defaultColor: shape.text.defaultColor,
    lineHeight: shape.text.lineHeight,
    wordSpace: shape.text.wordSpace,
    paragraphSpace: shape.text.paragraphSpace,
    textType: shape.text.type,
  };
}

function getContentElementHeight(element: LayoutContentElement): number {
  return element.type === 'text' ? estimateTextElementContentHeight(element) : element.height;
}

function getHorizontalOverlapWidth(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

function getVerticalOverlapHeight(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

function isContainedByExplicitShape(
  elements: PPTElement[],
  contentIndex: number,
  shapeIndex: number,
): boolean {
  const pair = findContainingShapePair(elements, contentIndex);
  return !!pair && pair.shapeIndex === shapeIndex;
}

function isNestedShapePair(
  first: PPTElement,
  second: PPTElement,
  firstRange: ReturnType<typeof getElementRange>,
  secondRange: ReturnType<typeof getElementRange>,
): boolean {
  if (!isShapeElement(first) || !isShapeElement(second)) return false;

  return isRangeWithin(firstRange, secondRange, 1) || isRangeWithin(secondRange, firstRange, 1);
}

function shouldIgnoreOverlapPair(
  elements: PPTElement[],
  firstIndex: number,
  secondIndex: number,
  firstRange: ReturnType<typeof getElementRange>,
  secondRange: ReturnType<typeof getElementRange>,
): boolean {
  const first = elements[firstIndex];
  const second = elements[secondIndex];
  if (!first || !second) return true;

  if (first.groupId && second.groupId && first.groupId === second.groupId) {
    return true;
  }

  if (first.type === 'line' || second.type === 'line') {
    return true;
  }

  if (isNestedShapePair(first, second, firstRange, secondRange)) {
    return true;
  }

  if (isLayoutContentElement(first) && isShapeElement(second)) {
    return isContainedByExplicitShape(elements, firstIndex, secondIndex);
  }

  if (isLayoutContentElement(second) && isShapeElement(first)) {
    return isContainedByExplicitShape(elements, secondIndex, firstIndex);
  }

  return false;
}

function resolveContainerContentLeft(
  shape: PPTShapeElement,
  element: LayoutContentElement,
): number {
  const inset = DEFAULT_CONTAINER_INSET_PX;
  const minLeft = shape.left + inset;
  const maxLeft = shape.left + Math.max(inset, shape.width - inset - element.width);
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

function findContainingShapePair(
  elements: PPTElement[],
  contentIndex: number,
): ContainedShapePair | null {
  const content = elements[contentIndex];
  if (!isLayoutContentElement(content)) return null;

  const contentRange = getElementRange(content);
  let bestMatch: { score: number; pair: ContainedShapePair } | null = null;

  for (let index = 0; index < contentIndex; index += 1) {
    const candidate = elements[index];
    if (!candidate || candidate.type !== 'shape' || hasShapeTextContent(candidate)) continue;

    const shapeRange = getElementRange(candidate);
    if (!isRangeWithin(contentRange, shapeRange, 6)) continue;

    const insets = {
      left: Math.round(content.left - candidate.left),
      right: Math.round(candidate.left + candidate.width - (content.left + content.width)),
      top: Math.round(content.top - candidate.top),
      bottom: Math.round(candidate.top + candidate.height - (content.top + content.height)),
    };

    const score =
      Math.abs(insets.left - insets.right) * 0.35 +
      Math.abs(insets.top - insets.bottom) * 0.2 +
      Math.abs(candidate.width - content.width) * 0.001 +
      Math.abs(candidate.height - content.height) * 0.002 +
      (contentIndex - index) * 0.15;

    const pair: ContainedShapePair = {
      shapeIndex: index,
      insets,
    };

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { score, pair };
    }
  }

  return bestMatch?.pair ?? null;
}

function buildExplicitContainerAssignments(elements: PPTElement[]): Map<number, number[]> {
  const assignments = new Map<number, number[]>();

  for (let index = 0; index < elements.length; index += 1) {
    const pair = findContainingShapePair(elements, index);
    if (!pair) continue;

    const existing = assignments.get(pair.shapeIndex) ?? [];
    existing.push(index);
    assignments.set(pair.shapeIndex, existing);
  }

  return assignments;
}

function reflowFollowingElements(args: {
  elements: PPTElement[];
  startIndex: number;
  oldBottom: number;
  newBottom: number;
  anchorXRange: [number, number];
}): PPTElement[] {
  const delta = args.newBottom - args.oldBottom;
  if (Math.abs(delta) <= 1) return args.elements.map((element) => cloneElement(element));

  const elements = args.elements.map((element) => cloneElement(element));

  if (delta < 0) {
    for (let index = args.startIndex + 1; index < elements.length; index += 1) {
      const element = elements[index];
      const range = getElementRange(element);
      const horizontallyRelated = rangesOverlap([range.minX, range.maxX], args.anchorXRange, 10);
      const isDownstream = range.minY >= args.oldBottom - 2;
      if (!horizontallyRelated || !isDownstream) continue;
      elements[index] = translateElement(element, delta);
    }
    return elements;
  }

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

function normalizeShapeTextContainer(elements: PPTElement[], shapeIndex: number): PPTElement[] {
  const nextElements = elements.map((element) => cloneElement(element));
  const shape = nextElements[shapeIndex];
  if (!shape || shape.type !== 'shape') return nextElements;

  const syntheticText = createSyntheticTextElementFromShape(shape);
  if (!syntheticText) return nextElements;

  const requiredShapeHeight = estimateTextElementContentHeight(syntheticText, shape.width);
  if (Math.abs(requiredShapeHeight - shape.height) <= 1) return nextElements;

  const oldRange = getElementRange(shape);
  const updatedShape: PPTShapeElement = {
    ...shape,
    height: requiredShapeHeight,
  };
  nextElements[shapeIndex] = updatedShape;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: shapeIndex,
    oldBottom: oldRange.maxY,
    newBottom: updatedShape.top + updatedShape.height,
    anchorXRange: [oldRange.minX, oldRange.maxX],
  });
}

function applyExplicitContainerLayout(
  elements: PPTElement[],
  shapeIndex: number,
  contentIndexes: number[],
): PPTElement[] {
  if (contentIndexes.length === 0) return elements.map((element) => cloneElement(element));

  const nextElements = elements.map((element) => cloneElement(element));
  const shape = nextElements[shapeIndex];
  if (!shape || shape.type !== 'shape') return nextElements;

  const items = contentIndexes
    .map((index) => ({
      index,
      element: nextElements[index] as LayoutContentElement,
      range: getElementRange(nextElements[index] as LayoutContentElement),
    }))
    .sort(
      (a, b) => a.range.minY - b.range.minY || a.range.minX - b.range.minX || a.index - b.index,
    );

  const oldShapeRange = getElementRange(shape);
  const firstRange = items[0].range;
  const lastRange = items[items.length - 1].range;
  const topInset = clamp(
    Math.round(firstRange.minY - oldShapeRange.minY),
    DEFAULT_CONTAINER_INSET_PX,
    MAX_CONTAINER_INSET_PX,
  );
  const bottomInset = clamp(
    Math.round(oldShapeRange.maxY - lastRange.maxY),
    DEFAULT_CONTAINER_INSET_PX,
    MAX_CONTAINER_INSET_PX,
  );

  let cursorTop = shape.top + topInset;
  let previousOriginalBottom = firstRange.minY;
  let latestPlacedBottom = cursorTop;

  for (let offset = 0; offset < items.length; offset += 1) {
    const item = items[offset];
    const contentHeight = getContentElementHeight(item.element);

    if (offset > 0) {
      const rawGap = Math.round(item.range.minY - previousOriginalBottom);
      const gap = clamp(rawGap, DEFAULT_CONTAINER_INSET_PX, MAX_CONTAINER_INSET_PX);
      cursorTop = latestPlacedBottom + gap;
    }

    const placedElement: LayoutContentElement = {
      ...item.element,
      left: resolveContainerContentLeft(shape, item.element),
      top: Math.round(cursorTop),
      height: Math.round(contentHeight),
    };

    nextElements[item.index] = placedElement;
    latestPlacedBottom = placedElement.top + placedElement.height;
    previousOriginalBottom = item.range.maxY;
  }

  const requiredShapeHeight = Math.ceil(latestPlacedBottom - shape.top + bottomInset);
  const updatedShape: PPTShapeElement = {
    ...shape,
    height: requiredShapeHeight,
  };
  nextElements[shapeIndex] = updatedShape;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: Math.max(shapeIndex, items[items.length - 1].index),
    oldBottom: oldShapeRange.maxY,
    newBottom: updatedShape.top + updatedShape.height,
    anchorXRange: [oldShapeRange.minX, oldShapeRange.maxX],
  });
}

function normalizeExplicitContainerContent(elements: PPTElement[]): PPTElement[] {
  let normalized = elements.map((element) => cloneElement(element));
  const assignments = buildExplicitContainerAssignments(normalized);
  const shapeIndexes = Array.from(assignments.keys()).sort((a, b) => a - b);

  for (const shapeIndex of shapeIndexes) {
    const contentIndexes = (assignments.get(shapeIndex) ?? []).sort((a, b) => a - b);
    normalized = applyExplicitContainerLayout(normalized, shapeIndex, contentIndexes);
  }

  return normalized;
}

function normalizeStandaloneTextElement(elements: PPTElement[], textIndex: number): PPTElement[] {
  const nextElements = elements.map((element) => cloneElement(element));
  const text = nextElements[textIndex];
  if (!text || text.type !== 'text') return nextElements;
  if (findContainingShapePair(nextElements, textIndex)) return nextElements;
  if (
    typeof text.groupId === 'string' &&
    (text.groupId.startsWith('layout_cards_') ||
      text.groupId.startsWith('process_flow_') ||
      text.groupId.startsWith('grid_cell_'))
  ) {
    // Semantic-layout cards already have deterministic geometry from slide-adapter.
    // Do not run standalone text reflow here, or same-row cards can be pushed into
    // a staircase when one card's measured text height grows post-layout.
    return nextElements;
  }

  const requiredHeight = estimateTextElementContentHeight(text);
  if (requiredHeight <= text.height + 1) return nextElements;

  const oldRange = getElementRange(text);
  const updatedText: PPTTextElement = {
    ...text,
    height: requiredHeight,
  };
  nextElements[textIndex] = updatedText;

  return reflowFollowingElements({
    elements: nextElements,
    startIndex: textIndex,
    oldBottom: oldRange.maxY,
    newBottom: updatedText.top + updatedText.height,
    anchorXRange: [oldRange.minX, oldRange.maxX],
  });
}

function validateDetachedContainerContent(elements: PPTElement[]): SlideLayoutValidationIssue[] {
  const issues: SlideLayoutValidationIssue[] = [];

  for (let shapeIndex = 0; shapeIndex < elements.length; shapeIndex += 1) {
    const candidate = elements[shapeIndex];
    if (!candidate || candidate.type !== 'shape' || hasShapeTextContent(candidate)) continue;
    if (candidate.height < 60 || candidate.width < 120) continue;

    const shapeRange = getElementRange(candidate);

    for (let index = shapeIndex + 1; index < elements.length; index += 1) {
      const content = elements[index];
      if (!isLayoutContentElement(content)) continue;

      const contentRange = getElementRange(content);
      const overlapWidth = getHorizontalOverlapWidth(
        [shapeRange.minX, shapeRange.maxX],
        [contentRange.minX, contentRange.maxX],
      );
      const overlapRatio = overlapWidth / Math.max(1, Math.min(candidate.width, content.width));
      const verticalGap = contentRange.minY - shapeRange.maxY;

      if (contentRange.minY > shapeRange.maxY + DETACHED_CONTAINER_MAX_GAP_PX) break;
      if (overlapRatio < 0.72 || verticalGap < -4 || verticalGap > DETACHED_CONTAINER_MAX_GAP_PX) {
        continue;
      }

      const pair = findContainingShapePair(elements, index);
      if (!pair || pair.shapeIndex !== shapeIndex) {
        issues.push({
          code: 'detached_container_content',
          elementId: content.id,
          shapeId: candidate.id,
          message: `Element ${content.id} appears visually attached to shape ${candidate.id} but is not inside it.`,
        });
      }
      break;
    }
  }

  return issues;
}

function validateElementOverlaps(elements: PPTElement[]): SlideLayoutValidationIssue[] {
  const issues: SlideLayoutValidationIssue[] = [];

  for (let firstIndex = 0; firstIndex < elements.length; firstIndex += 1) {
    const first = elements[firstIndex];
    if (!first || first.type === 'line') continue;
    const firstRange = getElementRange(first);

    for (let secondIndex = firstIndex + 1; secondIndex < elements.length; secondIndex += 1) {
      const second = elements[secondIndex];
      if (!second || second.type === 'line') continue;
      const secondRange = getElementRange(second);

      if (shouldIgnoreOverlapPair(elements, firstIndex, secondIndex, firstRange, secondRange)) {
        continue;
      }

      const overlapWidth = getHorizontalOverlapWidth(
        [firstRange.minX, firstRange.maxX],
        [secondRange.minX, secondRange.maxX],
      );
      if (overlapWidth <= 6) continue;

      const overlapHeight = getVerticalOverlapHeight(
        [firstRange.minY, firstRange.maxY],
        [secondRange.minY, secondRange.maxY],
      );
      if (overlapHeight <= 6) continue;

      const overlapArea = overlapWidth * overlapHeight;
      const firstArea = Math.max(
        1,
        (firstRange.maxX - firstRange.minX) * (firstRange.maxY - firstRange.minY),
      );
      const secondArea = Math.max(
        1,
        (secondRange.maxX - secondRange.minX) * (secondRange.maxY - secondRange.minY),
      );
      const smallerArea = Math.min(firstArea, secondArea);
      const overlapRatio = overlapArea / smallerArea;

      if (overlapArea < 160 && overlapRatio < 0.04) {
        continue;
      }

      issues.push({
        code: 'element_overlap',
        elementId: first.id,
        otherElementId: second.id,
        message: `Element ${first.id} overlaps element ${second.id}.`,
      });
    }
  }

  return issues;
}

export function normalizeSlideTextLayout(
  elements: PPTElement[],
  viewport: SlideViewport = DEFAULT_VIEWPORT,
): PPTElement[] {
  if (elements.length === 0) return [];

  let normalized = elements.map((element) => cloneElement(element));

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index]?.type !== 'shape') continue;
    if (!hasShapeTextContent(normalized[index] as PPTShapeElement)) continue;
    normalized = normalizeShapeTextContainer(normalized, index);
  }

  normalized = normalizeExplicitContainerContent(normalized);

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index]?.type !== 'text') continue;
    normalized = normalizeStandaloneTextElement(normalized, index);
  }

  const range = getElementListRange(normalized);
  if (range.maxY <= viewport.height + 0.5 && range.maxX <= viewport.width + 0.5) {
    return normalized;
  }

  return normalized;
}

export function validateSlideTextLayout(
  elements: PPTElement[],
  viewport: SlideViewport = DEFAULT_VIEWPORT,
): SlideLayoutValidationResult {
  const issues: SlideLayoutValidationIssue[] = [];

  if (elements.length === 0) {
    return { isValid: true, issues };
  }

  const range = getElementListRange(elements);
  if (
    range.minX < -0.5 ||
    range.minY < -0.5 ||
    range.maxX > viewport.width + 0.5 ||
    range.maxY > viewport.height + 0.5
  ) {
    issues.push({
      code: 'viewport_overflow',
      message: `Elements exceed viewport ${viewport.width}x${viewport.height}.`,
    });
  }

  for (const element of elements) {
    if (element.type === 'shape' && hasShapeTextContent(element)) {
      const syntheticText = createSyntheticTextElementFromShape(element);
      if (!syntheticText) continue;
      if (hasInvalidTextMetrics(syntheticText)) {
        issues.push({
          code: 'invalid_text_metrics',
          shapeId: element.id,
          message: `Shape ${element.id} uses invalid text metrics such as a line-height outside the supported range.`,
        });
      }
      const requiredHeight = estimateTextElementContentHeight(syntheticText, element.width);
      if (requiredHeight > element.height + 1) {
        issues.push({
          code: 'shape_text_overflow',
          shapeId: element.id,
          message: `Shape ${element.id} text requires height ${requiredHeight}, current ${element.height}.`,
        });
      }
      continue;
    }

    if (element.type === 'text') {
      if (hasInvalidTextMetrics(element)) {
        issues.push({
          code: 'invalid_text_metrics',
          elementId: element.id,
          message: `Text ${element.id} uses invalid text metrics such as a line-height outside the supported range.`,
        });
      }
      const requiredHeight = estimateTextElementContentHeight(element);
      if (requiredHeight > element.height + 1) {
        issues.push({
          code: 'text_box_overflow',
          elementId: element.id,
          message: `Text ${element.id} requires height ${requiredHeight}, current ${element.height}.`,
        });
      }
    }
  }

  for (let index = 0; index < elements.length; index += 1) {
    if (!isLayoutContentElement(elements[index])) continue;

    const pair = findContainingShapePair(elements, index);
    if (!pair) continue;

    const shape = elements[pair.shapeIndex] as PPTShapeElement;
    const content = elements[index] as LayoutContentElement;
    const shapeRange = getElementRange(shape);
    const contentRange = getElementRange(content);

    if (!isRangeWithin(contentRange, shapeRange, 1)) {
      issues.push({
        code: 'contained_element_overflow',
        elementId: content.id,
        shapeId: shape.id,
        message: `Element ${content.id} exceeds containing shape ${shape.id}.`,
      });
    }
  }

  issues.push(...validateDetachedContainerContent(elements));
  issues.push(...validateElementOverlaps(elements));

  return {
    isValid: issues.length === 0,
    issues,
  };
}
