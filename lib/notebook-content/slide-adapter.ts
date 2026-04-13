import katex from 'katex';
import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTLatexElement,
  PPTLineElement,
  PPTShapeElement,
  ShapeText,
  PPTTableElement,
  PPTTextElement,
  Slide,
  TableCell,
} from '@/lib/types/slides';
import { getDirectUnicodeMathSymbol, normalizeLatexSource } from '@/lib/latex-utils';
import type {
  NotebookContentBlock,
  NotebookContentBlockPlacement,
  NotebookContentContinuation,
  NotebookContentDocument,
  NotebookContentGridLayout,
  NotebookContentLayout,
  NotebookContentPattern,
  NotebookContentProfile,
  NotebookSlideArchetype,
  NotebookContentTextTemplate,
  NotebookContentTitleTone,
} from './schema';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { chemistryTextToHtml } from './chemistry';
import { resolveNotebookContentProfile } from './profile';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const CONTENT_LEFT = 64;
const CONTENT_WIDTH = 872;
const CONTENT_BOTTOM = 522;
const CARD_INSET_X = 18;
const CARD_INSET_Y = 12;
const GRID_GAP_X = 14;
const GRID_GAP_Y = 12;
const GRID_MIN_CELL_HEIGHT = 112;
const STACK_UNDERFILL_THRESHOLD = 0.72;
const CJK_TEXT_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
type ContentCardTone = {
  fill: string;
  border: string;
  accent: string;
};
type ArchetypeLayoutSettings = {
  bodyTop: number;
  titleTop: number;
  titleHeight: number;
  titleFontSize: number;
  accentHeight: number;
};
type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;
type LayoutCardsBlock = Extract<NotebookContentBlock, { type: 'layout_cards' }>;
type PlacedGridBlock = {
  block: NotebookContentBlock;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};
const DEFAULT_ARCHETYPE: NotebookSlideArchetype = 'concept';
const ARCHETYPE_ALLOWED_BLOCKS: Record<NotebookSlideArchetype, NotebookContentBlock['type'][]> = {
  intro: [
    'heading',
    'paragraph',
    'bullet_list',
    'callout',
    'definition',
    'theorem',
    'equation',
    'table',
    'process_flow',
    'layout_cards',
  ],
  concept: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
    'matrix',
    'derivation_steps',
    'code_block',
    'code_walkthrough',
    'process_flow',
    'layout_cards',
    'table',
    'callout',
    'definition',
    'theorem',
    'chem_formula',
    'chem_equation',
  ],
  definition: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
    'matrix',
    'derivation_steps',
    'process_flow',
    'layout_cards',
    'table',
    'callout',
    'definition',
    'theorem',
    'chem_formula',
    'chem_equation',
  ],
  example: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
    'matrix',
    'derivation_steps',
    'code_block',
    'code_walkthrough',
    'table',
    'callout',
    'definition',
    'theorem',
    'example',
    'process_flow',
    'layout_cards',
    'chem_formula',
    'chem_equation',
  ],
  bridge: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
    'process_flow',
    'layout_cards',
    'table',
    'callout',
    'definition',
    'theorem',
    'chem_formula',
    'chem_equation',
  ],
  summary: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
    'process_flow',
    'layout_cards',
    'table',
    'callout',
    'definition',
    'theorem',
    'chem_formula',
    'chem_equation',
  ],
};

function resolveDocumentArchetype(
  document: Pick<NotebookContentDocument, 'archetype'>,
): NotebookSlideArchetype {
  return document.archetype || DEFAULT_ARCHETYPE;
}

function resolveDocumentLayout(
  document: Pick<NotebookContentDocument, 'layout'>,
): NotebookContentLayout {
  return document.layout || { mode: 'stack' };
}

function resolveDocumentPattern(
  document: Pick<NotebookContentDocument, 'pattern'>,
): NotebookContentPattern {
  return document.pattern || 'auto';
}

function resolveGridLayout(
  layout: NotebookContentGridLayout,
  args: { blockCount: number; bodyHeight: number },
): { columns: number; rows: number; capacity: number } {
  const columns = Math.max(1, Math.min(3, layout.columns || 2));
  const maxRowsByHeight = Math.max(
    1,
    Math.floor((args.bodyHeight + GRID_GAP_Y) / (GRID_MIN_CELL_HEIGHT + GRID_GAP_Y)),
  );
  const fallbackRows = Math.max(1, Math.min(2, maxRowsByHeight));
  const requestedRows = layout.rows || fallbackRows;
  const rows = Math.max(1, Math.min(Math.min(3, maxRowsByHeight), requestedRows));
  return {
    columns,
    rows,
    capacity: columns * rows,
  };
}

function toFlowStepLabel(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
  index: number,
): string {
  const heading = blockToGridHeading(language, block).trim();
  if (heading) return heading;
  return language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`;
}

function toFlowStepDetail(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string {
  const lines = blockToGridBody(language, block)
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 0) return lines.join('；');
  return language === 'en-US' ? 'Continue with this stage.' : '继续推进这一阶段。';
}

function buildFlowPatternBlock(args: {
  language: 'zh-CN' | 'en-US';
  orientation: 'horizontal' | 'vertical';
  blocks: NotebookContentBlock[];
}): ProcessFlowBlock {
  const selected = args.blocks.filter((block) => block.type !== 'heading').slice(0, 6);
  const steps = selected.map((block, index) => ({
    title: toFlowStepLabel(args.language, block, index),
    detail: toFlowStepDetail(args.language, block),
  }));
  if (steps.length < 2) {
    steps.push({
      title: args.language === 'en-US' ? 'Wrap up' : '收束',
      detail: args.language === 'en-US' ? 'Summarize the key takeaway.' : '总结本页关键结论。',
    });
  }
  return {
    type: 'process_flow',
    title: args.language === 'en-US' ? 'Learning Flow' : '学习流程',
    orientation: args.orientation,
    context: [],
    steps,
    summary: args.language === 'en-US' ? 'Follow this sequence in class.' : '授课时按这个顺序推进。',
  };
}

function resolveBlockTemplateTone(
  templateId: NotebookContentTextTemplate | undefined,
  fallbackTone: ContentCardTone,
): ContentCardTone {
  if (!templateId) return fallbackTone;
  switch (templateId) {
    case 'plain':
      return { fill: '#ffffff', border: '#cbd5e1', accent: fallbackTone.accent };
    case 'infoCard':
      return { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' };
    case 'successCard':
      return { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' };
    case 'warningCard':
      return { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' };
    case 'accentCard':
      return { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' };
    default:
      return fallbackTone;
  }
}

function resolveCardTitleColor(
  titleTone: NotebookContentTitleTone | undefined,
  tone: ContentCardTone,
): string {
  switch (titleTone) {
    case 'neutral':
      return '#0f172a';
    case 'inverse':
      return '#ffffff';
    case 'accent':
    default:
      return tone.accent;
  }
}

function sortBlocksByPlacementOrder(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return [...blocks].sort((a, b) => {
    const aOrder = a.placement?.order;
    const bOrder = b.placement?.order;
    if (typeof aOrder !== 'number' && typeof bOrder !== 'number') return 0;
    if (typeof aOrder !== 'number') return 1;
    if (typeof bOrder !== 'number') return -1;
    return aOrder - bOrder;
  });
}

function normalizePlacementSpan(
  placement: NotebookContentBlockPlacement | undefined,
  grid: { rows: number; columns: number },
): { rowSpan: number; colSpan: number } {
  const rowSpan = Math.max(1, Math.min(grid.rows, placement?.rowSpan ?? 1));
  const colSpan = Math.max(1, Math.min(grid.columns, placement?.colSpan ?? 1));
  return { rowSpan, colSpan };
}

function canPlaceInGrid(
  occupancy: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): boolean {
  const rowLimit = occupancy.length;
  const colLimit = occupancy[0]?.length ?? 0;
  if (row < 0 || col < 0) return false;
  if (row + rowSpan > rowLimit) return false;
  if (col + colSpan > colLimit) return false;
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      if (occupancy[r][c]) return false;
    }
  }
  return true;
}

function occupyGridArea(
  occupancy: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): void {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      occupancy[r][c] = true;
    }
  }
}

function findFirstFitInGrid(
  occupancy: boolean[][],
  rowSpan: number,
  colSpan: number,
): { row: number; col: number } | null {
  for (let row = 0; row < occupancy.length; row += 1) {
    for (let col = 0; col < (occupancy[0]?.length ?? 0); col += 1) {
      if (canPlaceInGrid(occupancy, row, col, rowSpan, colSpan)) {
        return { row, col };
      }
    }
  }
  return null;
}

function arrangeGridBlocksByPlacement(
  blocks: NotebookContentBlock[],
  grid: { rows: number; columns: number; capacity: number },
): PlacedGridBlock[] {
  const orderedBlocks = sortBlocksByPlacementOrder(blocks);
  const occupancy = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.columns }, () => false),
  );
  const placed: PlacedGridBlock[] = [];

  for (const block of orderedBlocks) {
    const normalized = normalizePlacementSpan(block.placement, grid);
    const preferredRow = block.placement?.row ? block.placement.row - 1 : -1;
    const preferredCol = block.placement?.col ? block.placement.col - 1 : -1;
    if (
      canPlaceInGrid(occupancy, preferredRow, preferredCol, normalized.rowSpan, normalized.colSpan)
    ) {
      occupyGridArea(occupancy, preferredRow, preferredCol, normalized.rowSpan, normalized.colSpan);
      placed.push({
        block,
        row: preferredRow,
        col: preferredCol,
        rowSpan: normalized.rowSpan,
        colSpan: normalized.colSpan,
      });
    }
  }

  for (const block of orderedBlocks) {
    if (placed.some((item) => item.block === block)) continue;
    const normalized = normalizePlacementSpan(block.placement, grid);
    const fallbackPosition = findFirstFitInGrid(occupancy, normalized.rowSpan, normalized.colSpan);
    if (!fallbackPosition) {
      const singleCellFallback = findFirstFitInGrid(occupancy, 1, 1);
      if (!singleCellFallback) break;
      occupyGridArea(occupancy, singleCellFallback.row, singleCellFallback.col, 1, 1);
      placed.push({
        block,
        row: singleCellFallback.row,
        col: singleCellFallback.col,
        rowSpan: 1,
        colSpan: 1,
      });
      continue;
    }
    occupyGridArea(
      occupancy,
      fallbackPosition.row,
      fallbackPosition.col,
      normalized.rowSpan,
      normalized.colSpan,
    );
    placed.push({
      block,
      row: fallbackPosition.row,
      col: fallbackPosition.col,
      rowSpan: normalized.rowSpan,
      colSpan: normalized.colSpan,
    });
    if (placed.length >= grid.capacity) break;
  }

  return placed;
}

function getArchetypeLayoutSettings(archetype: NotebookSlideArchetype): ArchetypeLayoutSettings {
  switch (archetype) {
    case 'intro':
      return {
        bodyTop: 136,
        titleTop: 44,
        titleHeight: 60,
        titleFontSize: 34,
        accentHeight: 42,
      };
    case 'summary':
      return {
        bodyTop: 130,
        titleTop: 46,
        titleHeight: 56,
        titleFontSize: 32,
        accentHeight: 40,
      };
    case 'bridge':
      return {
        bodyTop: 122,
        titleTop: 46,
        titleHeight: 56,
        titleFontSize: 31,
        accentHeight: 40,
      };
    case 'definition':
      return {
        bodyTop: 120,
        titleTop: 46,
        titleHeight: 56,
        titleFontSize: 31,
        accentHeight: 40,
      };
    case 'example':
      return {
        bodyTop: 120,
        titleTop: 46,
        titleHeight: 56,
        titleFontSize: 31,
        accentHeight: 40,
      };
    case 'concept':
    default:
      return {
        bodyTop: 116,
        titleTop: 48,
        titleHeight: 52,
        titleFontSize: 30,
        accentHeight: 38,
      };
  }
}

function getProfileTokens(profile: NotebookContentProfile) {
  if (profile === 'code') {
    return {
      titleAccent: '#0f766e',
      titleText: '#0f172a',
      themeColors: ['#0f766e', '#0f172a', '#155e75', '#334155'],
      backgroundColors: ['#f7fffd', '#f8fafc', '#ecfeff'],
      cardPalettes: [
        { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
        { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
        { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
        { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
      ] as const,
      codeSurface: {
        fill: '#0f172a',
        outline: '#134e4a',
        text: '#e2e8f0',
        caption: '#99f6e4',
      },
    };
  }

  if (profile === 'math') {
    return {
      titleAccent: '#2563eb',
      titleText: '#0f172a',
      themeColors: ['#2563eb', '#0f172a', '#1d4ed8', '#475569'],
      backgroundColors: ['#f8fbff', '#fdfdff', '#eef4ff'],
      cardPalettes: [
        { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
        { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
        { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
        { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
      ] as const,
      codeSurface: {
        fill: '#0f172a',
        outline: '#1e293b',
        text: '#e2e8f0',
        caption: '#cbd5e1',
      },
    };
  }

  return {
    titleAccent: '#4f46e5',
    titleText: '#0f172a',
    themeColors: ['#4f46e5', '#0f172a', '#334155', '#64748b'],
    backgroundColors: ['#f8fbff', '#fdfdff', '#eef4ff'],
    cardPalettes: [
      { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
      { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
      { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
      { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
    ] as const,
    codeSurface: {
      fill: '#0f172a',
      outline: '#1e293b',
      text: '#e2e8f0',
      caption: '#cbd5e1',
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInlineLatexToHtml(text: string): string {
  const pattern = /(\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$)/g;
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const start = match.index ?? 0;
    const end = start + fullMatch.length;
    const expression = normalizeLatexSource(match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');

    result += escapeHtml(text.slice(lastIndex, start));
    const directSymbol = getDirectUnicodeMathSymbol(expression);
    result +=
      directSymbol ??
      katex.renderToString(expression, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      });
    lastIndex = end;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function estimateParagraphHeight(text: string, charsPerLine: number, lineHeightPx: number): number {
  const lines = Math.max(
    1,
    text
      .split('\n')
      .map((line) => Math.max(1, Math.ceil(line.length / Math.max(charsPerLine, 1))))
      .reduce((sum, value) => sum + value, 0),
  );
  return Math.max(lineHeightPx + 12, lines * lineHeightPx + 18);
}

function estimateParagraphStackHeight(
  items: string[],
  charsPerLine: number,
  lineHeightPx: number,
  paragraphSpacePx = 5,
): number {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) return lineHeightPx + 12;

  const totalLines = normalized.reduce((sum, item) => {
    const wrappedLines = item
      .split('\n')
      .map((line) => Math.max(1, Math.ceil(line.length / Math.max(charsPerLine, 1))))
      .reduce((lineSum, value) => lineSum + value, 0);

    return sum + wrappedLines;
  }, 0);

  return Math.max(
    lineHeightPx + 12,
    totalLines * lineHeightPx + Math.max(0, normalized.length - 1) * paragraphSpacePx + 18,
  );
}

function estimateCharsPerLine(text: string, widthPx: number, fontSizePx: number): number {
  const unitWidth = CJK_TEXT_REGEX.test(text) ? fontSizePx * 0.96 : fontSizePx * 0.56;
  return Math.max(12, Math.floor(widthPx / Math.max(unitWidth, 1)));
}

function wrapLineByWidth(text: string, maxChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const hasWhitespace = /\s/.test(normalized);
  if (!hasWhitespace) {
    const chunks: string[] = [];
    let remaining = normalized;
    while (remaining.length > maxChars) {
      chunks.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  const tokens = normalized.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) lines.push(trimmed);
    current = '';
  };

  for (const token of tokens) {
    if (!token.trim()) {
      current += token;
      continue;
    }

    const candidate = current ? `${current}${token}` : token;
    if (candidate.trim().length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      pushCurrent();
    }

    if (token.length <= maxChars) {
      current = token;
      continue;
    }

    let remaining = token;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    current = remaining;
  }

  pushCurrent();
  return lines;
}

function wrapTextToLines(text: string, maxChars: number): string[] {
  const paragraphs = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const lines = paragraphs.flatMap((paragraph) => wrapLineByWidth(paragraph, maxChars));
  return lines.length > 0 ? lines : [''];
}

function ellipsizeLine(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function clampWrappedLines(lines: string[], _maxLines: number, _maxChars: number): string[] {
  // Keep full content: no truncation at generation-time.
  return lines;
}

function fitParagraphBlockToHeight(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
}): { html: string; height: number } {
  const maxChars = estimateCharsPerLine(args.text, args.widthPx, args.fontSizePx);
  const wrapped = wrapTextToLines(args.text, maxChars);
  const fittedLines = clampWrappedLines(wrapped, Number.MAX_SAFE_INTEGER, maxChars);
  const height = Math.max(args.lineHeightPx + 12, fittedLines.length * args.lineHeightPx + 18);

  return {
    html: fittedLines
      .map(
        (line) =>
          `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${renderInlineLatexToHtml(line)}</p>`,
      )
      .join(''),
    height,
  };
}

function fitBulletListBlockToHeight(args: {
  items: string[];
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
  bulletColor: string;
  paragraphGapPx?: number;
}): { html: string; height: number } {
  const paragraphGapPx = args.paragraphGapPx ?? 5;
  const htmlParts: string[] = [];
  let usedHeight = 18;

  for (const item of args.items) {
    const maxChars = estimateCharsPerLine(item, args.widthPx - 16, args.fontSizePx);
    const wrapped = wrapTextToLines(item, maxChars);
    const gap = htmlParts.length > 0 ? paragraphGapPx : 0;
    const fittedLines = clampWrappedLines(wrapped, Number.MAX_SAFE_INTEGER, maxChars);
    const lineHtml = fittedLines
      .map((line, index) =>
        index === 0
          ? `<span style="color:${args.bulletColor};font-weight:700;">•</span> ${renderInlineLatexToHtml(line)}`
          : `${'&nbsp;'.repeat(4)}${renderInlineLatexToHtml(line)}`,
      )
      .join('<br/>');

    htmlParts.push(
      `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${lineHtml}</p>`,
    );
    usedHeight += gap + fittedLines.length * args.lineHeightPx;
  }

  const height = Math.max(args.lineHeightPx + 12, usedHeight);
  return {
    html: htmlParts.join(''),
    height,
  };
}

function createTextElement(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  groupId?: string;
  fill?: string;
  outlineColor?: string;
  shadow?: PPTTextElement['shadow'];
}): PPTTextElement {
  return {
    id: `text_${nanoid(8)}`,
    type: 'text',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.html,
    defaultFontName: args.fontName || 'Microsoft YaHei',
    defaultColor: args.color || '#0f172a',
    textType: args.textType,
    lineHeight: 1.35,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
    shadow: args.shadow,
  };
}

function createShapeText(args: {
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  lineHeight?: number;
  paragraphSpace?: number;
  align?: ShapeText['align'];
}): ShapeText {
  return {
    content: args.html,
    defaultFontName: args.fontName || 'Microsoft YaHei',
    defaultColor: args.color || '#0f172a',
    align: args.align || 'top',
    lineHeight: args.lineHeight,
    paragraphSpace: args.paragraphSpace,
    type: args.textType,
  };
}

function createRectShape(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor?: string;
  shadow?: PPTShapeElement['shadow'];
  groupId?: string;
  text?: ShapeText;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fill: args.fill,
    fixedRatio: false,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
    shadow: args.shadow,
    text: args.text,
  };
}

function createCircleShape(args: {
  left: number;
  top: number;
  size: number;
  fill: string;
  groupId?: string;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.size,
    height: args.size,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M100,0 C44.8,0 0,44.8 0,100 C0,155.2 44.8,200 100,200 C155.2,200 200,155.2 200,100 C200,44.8 155.2,0 100,0 Z',
    fill: args.fill,
    fixedRatio: false,
  };
}

function createLineElement(args: {
  start: [number, number];
  end: [number, number];
  color: string;
  width?: number;
  points?: [PPTLineElement['points'][0], PPTLineElement['points'][1]];
  groupId?: string;
}): PPTLineElement {
  return {
    id: `line_${nanoid(8)}`,
    type: 'line',
    left: 0,
    top: 0,
    groupId: args.groupId,
    width: args.width ?? 2,
    start: args.start,
    end: args.end,
    style: 'solid',
    color: args.color,
    points: args.points || ['', ''],
  };
}

function createCardGroupId(prefix = 'semantic_card'): string {
  return `${prefix}_${nanoid(8)}`;
}

function createBoundContentCard(args: {
  top: number;
  height: number;
  tone: ContentCardTone;
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  lineHeight?: number;
  paragraphSpace?: number;
}): PPTTextElement {
  return createTextElement({
    left: CONTENT_LEFT,
    top: args.top,
    width: CONTENT_WIDTH,
    height: args.height,
    fill: args.tone.fill,
    outlineColor: args.tone.accent,
    shadow: {
      h: 0,
      v: 8,
      blur: 24,
      color: 'rgba(15,23,42,0.08)',
    },
    html: args.html,
    color: args.color,
    fontName: args.fontName,
    textType: args.textType,
  });
}

function createLatexElement(args: {
  latex: string;
  left: number;
  top: number;
  width: number;
  height: number;
  align?: PPTLatexElement['align'];
  groupId?: string;
  color?: string;
  fill?: string;
  outlineColor?: string;
}): PPTLatexElement {
  const latex = normalizeLatexSource(args.latex);
  const directSymbol = getDirectUnicodeMathSymbol(latex);

  return {
    id: `latex_${nanoid(8)}`,
    type: 'latex',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    latex,
    html:
      directSymbol ??
      katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      }),
    align: args.align || 'left',
    color: args.color,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
  };
}

function createTableElement(args: {
  top: number;
  headers?: string[];
  rows: string[][];
  caption?: string;
  groupId?: string;
}): PPTElement[] {
  const rowCount = args.rows.length + (args.headers?.length ? 1 : 0);
  const height = Math.min(220, Math.max(72, rowCount * 34 + 12));
  const headers = args.headers?.length ? args.headers : undefined;
  const data: TableCell[][] = [];
  if (headers) {
    data.push(
      headers.map((header) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: header,
        style: {
          bold: true,
          backcolor: '#eef2ff',
          color: '#1e1b4b',
        },
      })),
    );
  }
  for (const row of args.rows) {
    data.push(
      row.map((cell) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: cell,
      })),
    );
  }

  const table: PPTTableElement = {
    id: `table_${nanoid(8)}`,
    type: 'table',
    left: CONTENT_LEFT,
    top: args.top + (args.caption ? 26 : 0),
    groupId: args.groupId,
    width: CONTENT_WIDTH,
    height,
    rotate: 0,
    outline: { color: '#cbd5e1', width: 1, style: 'solid' },
    theme: {
      color: '#4f46e5',
      rowHeader: Boolean(headers),
      rowFooter: false,
      colHeader: false,
      colFooter: false,
    },
    colWidths: new Array(data[0]?.length || 1).fill(1 / Math.max(data[0]?.length || 1, 1)),
    cellMinHeight: 34,
    data,
  };

  const elements: PPTElement[] = [];
  if (args.caption) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: args.top,
        width: CONTENT_WIDTH,
        height: 24,
        groupId: args.groupId,
        html: `<p style="font-size:14px;color:#475569;"><strong>${escapeHtml(args.caption)}</strong></p>`,
        color: '#475569',
        textType: 'notes',
      }),
    );
  }
  elements.push(table);
  return elements;
}

function getLayoutCardsItemTone(
  tone: LayoutCardsBlock['items'][number]['tone'],
  fallbackAccent: string,
): ContentCardTone {
  switch (tone) {
    case 'info':
      return { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' };
    case 'warning':
      return { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' };
    case 'success':
      return { fill: '#ecfdf5', border: '#a7f3d0', accent: '#16a34a' };
    case 'neutral':
    default:
      return { fill: '#ffffff', border: '#cbd5e1', accent: fallbackAccent };
  }
}

function resolveLayoutCardsVisualColumns(columns: 2 | 3 | 4): number {
  return columns === 4 ? 2 : columns;
}

function measureLayoutCardsLayout(args: {
  items: LayoutCardsBlock['items'];
  columns: 2 | 3 | 4;
}): {
  columns: number;
  cellWidth: number;
  gapX: number;
  gapY: number;
  rowHeights: number[];
  totalHeight: number;
} {
  if (args.items.length === 0) {
    return {
      columns: 0,
      cellWidth: CONTENT_WIDTH,
      gapX: 10,
      gapY: 10,
      rowHeights: [],
      totalHeight: 0,
    };
  }

  const requestedColumns = resolveLayoutCardsVisualColumns(args.columns);
  const columns = args.items.length === 1 ? 1 : Math.max(1, Math.min(requestedColumns, args.items.length));
  const gapX = 10;
  const gapY = 10;
  const cellWidth = (CONTENT_WIDTH - Math.max(0, columns - 1) * gapX) / columns;
  const rowCount = Math.ceil(args.items.length / columns);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  args.items.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const bodyHeight = fitParagraphBlockToHeight({
      text: item.text,
      widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
      fontSizePx: 14,
      lineHeightPx: 18,
      maxHeightPx: 320,
      color: '#334155',
    }).height;
    const titleHeight = fitParagraphBlockToHeight({
      text: item.title,
      widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
      fontSizePx: 13,
      lineHeightPx: 18,
      maxHeightPx: 90,
      color: '#334155',
    }).height;
    rowHeights[row] = Math.max(rowHeights[row], Math.max(72, titleHeight + bodyHeight + 18));
  });

  return {
    columns,
    cellWidth,
    gapX,
    gapY,
    rowHeights,
    totalHeight:
      rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowHeights.length - 1) * gapY,
  };
}

function renderLayoutCardsBlock(args: {
  block: LayoutCardsBlock;
  top: number;
  cardPalettes: readonly ContentCardTone[];
  groupIdPrefix?: string;
}): { elements: PPTElement[]; height: number } {
  const elements: PPTElement[] = [];
  const groupId = createCardGroupId(args.groupIdPrefix || 'layout_cards');
  let cursorTop = args.top;

  if (args.block.title) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: 28,
        groupId,
        html: `<p style="font-size:18px;color:#2563eb;"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: '#2563eb',
        textType: 'itemTitle',
      }),
    );
    cursorTop += 34;
  }

  const layout = measureLayoutCardsLayout({
    items: args.block.items,
    columns: args.block.columns,
  });
  if (layout.columns === 0) {
    return { elements, height: cursorTop - args.top };
  }

  let rowCursorTop = cursorTop;
  let rowIndex = 0;
  args.block.items.forEach((item, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    if (row !== rowIndex) {
      rowCursorTop += layout.rowHeights[rowIndex] + layout.gapY;
      rowIndex = row;
    }
    const left = CONTENT_LEFT + column * (layout.cellWidth + layout.gapX);
    const rowHeight = layout.rowHeights[row];
    const fallbackAccent = args.cardPalettes[index % args.cardPalettes.length]?.accent || '#2563eb';
    const tone = getLayoutCardsItemTone(item.tone, fallbackAccent);
    const body = fitParagraphBlockToHeight({
      text: item.text,
      widthPx: Math.max(120, layout.cellWidth - CARD_INSET_X * 2),
      fontSizePx: 14,
      lineHeightPx: 18,
      maxHeightPx: rowHeight,
      color: '#334155',
    });
    elements.push(
      createRectShape({
        left,
        top: rowCursorTop,
        width: layout.cellWidth,
        height: rowHeight,
        fill: tone.fill,
        outlineColor: tone.border,
        groupId,
        text: createShapeText({
          html: [
            `<p style="font-size:13px;color:${tone.accent};"><strong>${renderInlineLatexToHtml(item.title)}</strong></p>`,
            body.html,
          ].join(''),
          color: '#334155',
          textType: 'content',
          lineHeight: 1.32,
          paragraphSpace: 4,
          align: 'top',
        }),
      }),
    );
  });

  cursorTop += layout.totalHeight;
  return {
    elements,
    height: cursorTop - args.top,
  };
}

function processFlowContextToLayoutCardsBlock(
  context: ProcessFlowBlock['context'],
): LayoutCardsBlock | null {
  if (context.length === 0) return null;
  return {
    type: 'layout_cards',
    columns: context.length === 4 ? 4 : context.length >= 3 ? 3 : 2,
    items: context.map((item) => ({
      title: item.label,
      text: item.text,
      tone: item.tone,
    })),
  };
}

function estimateProcessFlowSummaryHeight(
  summary: string,
  widthPx: number,
): number {
  const paragraph = fitParagraphBlockToHeight({
    text: summary,
    widthPx,
    fontSizePx: 14,
    lineHeightPx: 20,
    maxHeightPx: 220,
    color: '#334155',
  });
  return paragraph.height + 26;
}

function fitProcessFlowSummaryCard(args: {
  summary: string;
  language: 'zh-CN' | 'en-US';
  widthPx: number;
  maxHeightPx: number;
  accent: string;
}): { html: string; height: number } {
  const paragraph = fitParagraphBlockToHeight({
    text: args.summary,
    widthPx: args.widthPx,
    fontSizePx: 14,
    lineHeightPx: 20,
    maxHeightPx: Math.max(28, args.maxHeightPx - 28),
    color: '#334155',
  });

  return {
    html: [
      `<p style="font-size:13px;color:${args.accent};"><strong>${escapeHtml(
        args.language === 'en-US' ? 'Flow Summary' : '流程收束',
      )}</strong></p>`,
      paragraph.html,
    ].join(''),
    height: Math.max(58, paragraph.height + 26),
  };
}

function estimateProcessFlowStepCardHeight(args: {
  step: ProcessFlowBlock['steps'][number];
  widthPx: number;
  orientation: ProcessFlowBlock['orientation'];
}): number {
  const titleHeight = fitGridHeadingToHeight({
    text: args.step.title,
    widthPx: args.widthPx,
    maxHeightPx: 48,
    color: '#0f172a',
  }).height;
  const detailHeight = fitParagraphBlockToHeight({
    text: args.step.detail,
    widthPx: args.widthPx,
    fontSizePx: args.orientation === 'horizontal' ? 13 : 14,
    lineHeightPx: args.orientation === 'horizontal' ? 18 : 20,
    maxHeightPx: 260,
    color: '#334155',
  }).height;
  const noteHeight = args.step.note
    ? fitParagraphBlockToHeight({
        text: args.step.note,
        widthPx: args.widthPx,
        fontSizePx: 12,
        lineHeightPx: 16,
        maxHeightPx: 80,
        color: '#475569',
      }).height + 6
    : 0;

  return Math.max(
    args.orientation === 'horizontal' ? 112 : 84,
    titleHeight + detailHeight + noteHeight + 28,
  );
}

function fitProcessFlowStepCard(args: {
  step: ProcessFlowBlock['steps'][number];
  stepIndex: number;
  language: 'zh-CN' | 'en-US';
  widthPx: number;
  maxHeightPx: number;
  orientation: ProcessFlowBlock['orientation'];
  tone: ContentCardTone;
  showStepLabel?: boolean;
}): { html: string; height: number } {
  const titleFit = fitGridHeadingToHeight({
    text: args.step.title,
    widthPx: args.widthPx,
    maxHeightPx: 48,
    color: '#0f172a',
  });
  const showStepLabel = args.showStepLabel ?? true;
  const labelHtml = showStepLabel
    ? `<p style="font-size:12px;color:${args.tone.accent};"><strong>${escapeHtml(
        args.language === 'en-US' ? `Step ${args.stepIndex + 1}` : `步骤 ${args.stepIndex + 1}`,
      )}</strong></p>`
    : '';
  const noteReserve = args.step.note ? 28 : 0;
  const detailFit = fitParagraphBlockToHeight({
    text: args.step.detail,
    widthPx: args.widthPx,
    fontSizePx: args.orientation === 'horizontal' ? 13 : 14,
    lineHeightPx: args.orientation === 'horizontal' ? 18 : 20,
    maxHeightPx: Math.max(28, args.maxHeightPx - titleFit.height - noteReserve - 24),
    color: '#334155',
  });
  const noteHtml = args.step.note
    ? fitParagraphBlockToHeight({
        text: args.step.note,
        widthPx: args.widthPx,
        fontSizePx: 12,
        lineHeightPx: 16,
        maxHeightPx: 56,
        color: '#475569',
      }).html
    : '';

  const height = (showStepLabel ? 18 : 6) + titleFit.height + detailFit.height + (args.step.note ? 22 : 0);

  return {
    html: [labelHtml, titleFit.html, detailFit.html, noteHtml].filter(Boolean).join(''),
    height: Math.max(72, height),
  };
}

function estimateProcessFlowBlockHeight(args: {
  block: ProcessFlowBlock;
  language: 'zh-CN' | 'en-US';
}): number {
  const titleHeight = args.block.title ? 34 : 0;
  const contextCards = processFlowContextToLayoutCardsBlock(args.block.context);
  const contextHeight = contextCards
    ? measureLayoutCardsLayout({
        items: contextCards.items,
        columns: contextCards.columns,
      }).totalHeight + 14
    : 0;
  const summaryHeight = args.block.summary
    ? estimateProcessFlowSummaryHeight(args.block.summary, CONTENT_WIDTH - CARD_INSET_X * 2) + 12
    : 0;

  if (args.block.orientation === 'horizontal') {
    const gapX = args.block.steps.length > 3 ? 14 : 18;
    const stepWidth =
      (CONTENT_WIDTH - Math.max(0, args.block.steps.length - 1) * gapX) /
      Math.max(args.block.steps.length, 1);
    const innerWidth = Math.max(104, stepWidth - CARD_INSET_X * 2);
    const stepHeight = Math.max(
      112,
      ...args.block.steps.map((step) =>
        estimateProcessFlowStepCardHeight({
          step,
          widthPx: innerWidth,
          orientation: 'horizontal',
        }),
      ),
    );
    return titleHeight + contextHeight + stepHeight + summaryHeight + 12;
  }

  const stepWidth = CONTENT_WIDTH;
  const stepHeights = args.block.steps.map((step) =>
    estimateProcessFlowStepCardHeight({
      step,
      widthPx: stepWidth - CARD_INSET_X * 2,
      orientation: 'vertical',
    }),
  );

  return (
    titleHeight +
    contextHeight +
    stepHeights.reduce((sum, value) => sum + value, 0) +
    Math.max(0, stepHeights.length - 1) * 12 +
    summaryHeight +
    12
  );
}

function renderProcessFlowBlock(args: {
  block: ProcessFlowBlock;
  top: number;
  language: 'zh-CN' | 'en-US';
  titleAccent: string;
  cardPalettes: readonly ContentCardTone[];
}): { elements: PPTElement[]; height: number } {
  const elements: PPTElement[] = [];
  const groupId = createCardGroupId('process_flow');
  let cursorTop = args.top;

  if (args.block.title) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: 28,
        groupId,
        html: `<p style="font-size:18px;color:${args.titleAccent};"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: args.titleAccent,
        textType: 'itemTitle',
      }),
    );
    cursorTop += 34;
  }

  const contextCards = processFlowContextToLayoutCardsBlock(args.block.context);
  if (contextCards) {
    const renderedContext = renderLayoutCardsBlock({
      block: contextCards,
      top: cursorTop,
      cardPalettes: args.cardPalettes,
      groupIdPrefix: 'process_flow_context',
    });
    elements.push(...renderedContext.elements);
    cursorTop += renderedContext.height + 14;
  }

  if (args.block.orientation === 'horizontal') {
    const gapX = args.block.steps.length > 3 ? 14 : 18;
    const stepWidth =
      (CONTENT_WIDTH - Math.max(0, args.block.steps.length - 1) * gapX) /
      Math.max(args.block.steps.length, 1);
    const innerWidth = Math.max(104, stepWidth - CARD_INSET_X * 2);
    const stepHeight = Math.min(
      170,
      Math.max(
        112,
        ...args.block.steps.map((step) =>
          estimateProcessFlowStepCardHeight({
            step,
            widthPx: innerWidth,
            orientation: 'horizontal',
          }),
        ),
      ),
    );

    const connectorY = cursorTop + stepHeight / 2;
    args.block.steps.forEach((step, index) => {
      const left = CONTENT_LEFT + index * (stepWidth + gapX);
      const tone = args.cardPalettes[index % args.cardPalettes.length];
      const fitted = fitProcessFlowStepCard({
        step,
        stepIndex: index,
        language: args.language,
        widthPx: innerWidth,
        maxHeightPx: stepHeight - CARD_INSET_Y * 2,
        orientation: 'horizontal',
        tone,
      });

      if (index < args.block.steps.length - 1) {
        const nextLeft = CONTENT_LEFT + (index + 1) * (stepWidth + gapX);
        elements.push(
          createLineElement({
            start: [left + stepWidth, connectorY],
            end: [nextLeft - 3, connectorY],
            color: '#94a3b8',
            width: 2,
            points: ['', 'arrow'],
            groupId,
          }),
        );
      }

      elements.push(
        createRectShape({
          left,
          top: cursorTop,
          width: stepWidth,
          height: stepHeight,
          fill: tone.fill,
          outlineColor: tone.border,
          groupId,
          text: createShapeText({
            html: fitted.html,
            color: '#334155',
            textType: 'content',
            lineHeight: 1.32,
            paragraphSpace: 4,
            align: 'top',
          }),
        }),
      );
    });

    cursorTop += stepHeight + 12;
  } else {
    const timelineX = CONTENT_LEFT + 10;
    const dotSize = 6;
    const cardLeft = CONTENT_LEFT + 26;
    const cardWidth = CONTENT_WIDTH - 26;
    const stepWidth = Math.max(140, cardWidth - CARD_INSET_X * 2);
    const stepHeights = args.block.steps.map((step) =>
      Math.min(
        132,
        estimateProcessFlowStepCardHeight({
          step,
          widthPx: stepWidth,
          orientation: 'vertical',
        }),
      ),
    );
    let localTop = cursorTop;
    const markerCenters = stepHeights.map((_, index) => {
      const centerY = localTop + 14;
      localTop += stepHeights[index] + 12;
      return centerY;
    });
    localTop = cursorTop;

    if (markerCenters.length > 1) {
      elements.push(
        createLineElement({
          start: [timelineX, markerCenters[0]],
          end: [timelineX, markerCenters[markerCenters.length - 1]],
          color: '#cbd5e1',
          width: 1,
          groupId,
        }),
      );
    }

    args.block.steps.forEach((step, index) => {
      const tone = args.cardPalettes[index % args.cardPalettes.length];
      const stepHeight = stepHeights[index];
      const fitted = fitProcessFlowStepCard({
        step,
        stepIndex: index,
        language: args.language,
        widthPx: stepWidth,
        maxHeightPx: stepHeight - CARD_INSET_Y * 2,
        orientation: 'vertical',
        tone,
        showStepLabel: false,
      });
      const markerCenterY = markerCenters[index] ?? localTop + 14;

      elements.push(
        createCircleShape({
          left: timelineX - dotSize / 2,
          top: markerCenterY - dotSize / 2,
          size: dotSize,
          fill: '#94a3b8',
          groupId,
        }),
        createRectShape({
          left: cardLeft,
          top: localTop,
          width: cardWidth,
          height: stepHeight,
          fill: tone.fill,
          outlineColor: tone.border,
          shadow: {
            h: 0,
            v: 6,
            blur: 18,
            color: 'rgba(15,23,42,0.08)',
          },
          groupId,
          text: createShapeText({
            html: fitted.html,
            color: '#334155',
            textType: 'content',
            lineHeight: 1.32,
            paragraphSpace: 4,
            align: 'top',
          }),
        }),
      );

      localTop += stepHeight + 12;
    });

    cursorTop = localTop;
  }

  if (args.block.summary) {
    const fittedSummary = fitProcessFlowSummaryCard({
      summary: args.block.summary,
      language: args.language,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2,
      maxHeightPx: 120,
      accent: args.titleAccent,
    });
    elements.push(
      createRectShape({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: fittedSummary.height,
        fill: '#f8fafc',
        outlineColor: '#cbd5e1',
        groupId,
        text: createShapeText({
          html: fittedSummary.html,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.32,
          paragraphSpace: 4,
          align: 'top',
        }),
      }),
    );
    cursorTop += fittedSummary.height + 12;
  }

  return {
    elements,
    height: cursorTop - args.top,
  };
}

function expandBlocks(
  blocks: NotebookContentDocument['blocks'],
  language: 'zh-CN' | 'en-US',
): NotebookContentBlock[] {
  const expanded: NotebookContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'example') {
      expanded.push({
        type: 'heading',
        level: 2,
        text: block.title || (language === 'en-US' ? 'Worked Example' : '例题讲解'),
      });
      expanded.push({
        type: 'paragraph',
        text: `${language === 'en-US' ? 'Problem: ' : '题目：'}${block.problem}`,
      });
      if (block.givens.length > 0) {
        expanded.push({
          type: 'bullet_list',
          items: block.givens.map((item) => `${language === 'en-US' ? 'Given' : '已知'}: ${item}`),
        });
      }
      if (block.goal) {
        expanded.push({
          type: 'paragraph',
          text: `${language === 'en-US' ? 'Goal: ' : '目标：'}${block.goal}`,
        });
      }
      expanded.push({
        type: 'bullet_list',
        items: block.steps.map(
          (item, idx) => `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${item}`,
        ),
      });
      if (block.answer) {
        expanded.push({
          type: 'callout',
          tone: 'success',
          title: language === 'en-US' ? 'Answer' : '答案',
          text: block.answer,
        });
      }
      if (block.pitfalls.length > 0) {
        expanded.push({
          type: 'bullet_list',
          items: block.pitfalls.map(
            (item) => `${language === 'en-US' ? 'Pitfall' : '易错点'}：${item}`,
          ),
        });
      }
      continue;
    }

    if (block.type === 'derivation_steps') {
      if (block.title) {
        expanded.push({ type: 'heading', level: 3, text: block.title });
      }
      for (const step of block.steps) {
        if (step.format === 'latex') {
          expanded.push({ type: 'equation', latex: step.expression, display: true });
        } else if (step.format === 'chem') {
          expanded.push({ type: 'chem_equation', equation: step.expression });
        } else {
          expanded.push({ type: 'paragraph', text: step.expression });
        }
        if (step.explanation) {
          expanded.push({ type: 'paragraph', text: step.explanation });
        }
      }
      continue;
    }

    expanded.push(block);
  }
  return expanded;
}

function splitBulletListBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'bullet_list' }>,
): NotebookContentBlock[] {
  if (block.items.length <= 5) return [block];

  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const item of block.items) {
    const candidate = [...currentChunk, item];
    const candidateHeight = estimateParagraphStackHeight(candidate, 34, 20) + CARD_INSET_Y * 2;
    if (currentChunk.length > 0 && candidateHeight > 156) {
      chunks.push(currentChunk);
      currentChunk = [item];
      continue;
    }

    currentChunk = candidate;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);

  return chunks.map((items) => ({ ...block, items }));
}

function splitTableBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'table' }>,
): NotebookContentBlock[] {
  const headerRows = block.headers?.length ? 1 : 0;
  const maxRowsPerPage = headerRows > 0 ? 5 : 6;
  if (block.rows.length <= maxRowsPerPage) return [block];

  const chunks: NotebookContentBlock[] = [];
  for (let index = 0; index < block.rows.length; index += maxRowsPerPage) {
    chunks.push({
      ...block,
      rows: block.rows.slice(index, index + maxRowsPerPage),
    });
  }
  return chunks;
}

function splitCodeWalkthroughBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'code_walkthrough' }>,
): NotebookContentBlock[] {
  if (block.steps.length <= 3) return [block];

  const chunks: NotebookContentBlock[] = [];
  for (let index = 0; index < block.steps.length; index += 3) {
    const isLast = index + 3 >= block.steps.length;
    chunks.push({
      ...block,
      steps: block.steps.slice(index, index + 3),
      output: isLast ? block.output : undefined,
    });
  }
  return chunks;
}

function splitProcessFlowBlockForPagination(
  block: ProcessFlowBlock,
): NotebookContentBlock[] {
  if (block.orientation === 'horizontal') {
    const hasDenseStep = block.steps.some(
      (step) =>
        step.title.length > 28 || step.detail.length > 100 || (step.note?.length ?? 0) > 72,
    );
    const maxStepsPerPage = hasDenseStep || block.context.length >= 3 ? 3 : 4;
    if (block.steps.length <= maxStepsPerPage) return [block];

    const chunks: NotebookContentBlock[] = [];
    for (let index = 0; index < block.steps.length; index += maxStepsPerPage) {
      const isFirst = index === 0;
      const isLast = index + maxStepsPerPage >= block.steps.length;
      chunks.push({
        ...block,
        context: isFirst ? block.context : [],
        steps: block.steps.slice(index, index + maxStepsPerPage),
        summary: isLast ? block.summary : undefined,
      });
    }
    return chunks;
  }

  const maxBlockHeight = 334;
  const chunks: NotebookContentBlock[] = [];
  let currentSteps: ProcessFlowBlock['steps'] = [];

  const buildCandidate = (
    steps: ProcessFlowBlock['steps'],
    includeContext: boolean,
    includeSummary: boolean,
  ): ProcessFlowBlock => ({
    ...block,
    context: includeContext ? block.context : [],
    steps,
    summary: includeSummary ? block.summary : undefined,
  });

  for (let index = 0; index < block.steps.length; index += 1) {
    const step = block.steps[index];
    const candidateSteps = [...currentSteps, step];
    const hasMoreSteps = index < block.steps.length - 1;
    const candidateBlock = buildCandidate(
      candidateSteps,
      chunks.length === 0,
      !hasMoreSteps && Boolean(block.summary),
    );
    const candidateHeight = estimateProcessFlowBlockHeight({
      block: candidateBlock,
      language: 'zh-CN',
    });

    if (currentSteps.length > 0 && candidateHeight > maxBlockHeight) {
      chunks.push(
        buildCandidate(currentSteps, chunks.length === 0, false),
      );
      currentSteps = [step];
      continue;
    }

    currentSteps = candidateSteps;
  }

  if (currentSteps.length > 0) {
    chunks.push(
      buildCandidate(currentSteps, chunks.length === 0, Boolean(block.summary)),
    );
  }

  return chunks.length > 0 ? chunks : [block];
}

function prepareBlocksForPagination(
  blocks: NotebookContentDocument['blocks'],
  language: 'zh-CN' | 'en-US',
): NotebookContentBlock[] {
  const preSplitBlocks: NotebookContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'bullet_list') {
      preSplitBlocks.push(...splitBulletListBlockForPagination(block));
      continue;
    }

    if (block.type === 'table') {
      preSplitBlocks.push(...splitTableBlockForPagination(block));
      continue;
    }

    if (block.type === 'code_walkthrough') {
      preSplitBlocks.push(...splitCodeWalkthroughBlockForPagination(block));
      continue;
    }

    if (block.type === 'process_flow') {
      preSplitBlocks.push(...splitProcessFlowBlockForPagination(block));
      continue;
    }

    preSplitBlocks.push(block);
  }

  return expandBlocks(preSplitBlocks, language);
}

function deriveGridHeadingFromText(text: string, language: 'zh-CN' | 'en-US'): string {
  void language;
  // Keep the full heading text to avoid generation-time truncation.
  return text.replace(/\s+/g, ' ').trim();
}

function blockToGridHeading(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string {
  if (block.cardTitle?.trim()) {
    return block.cardTitle.trim();
  }
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return deriveGridHeadingFromText(block.text, language);
    case 'bullet_list':
      return deriveGridHeadingFromText(block.items[0] || '', language);
    case 'equation':
      return language === 'en-US' ? 'Formula' : '公式';
    case 'matrix':
      return block.label || (language === 'en-US' ? 'Matrix' : '矩阵');
    case 'derivation_steps':
      return block.title || (language === 'en-US' ? 'Derivation' : '推导');
    case 'code_block':
      return block.caption || (language === 'en-US' ? 'Code' : '代码');
    case 'code_walkthrough':
      return block.title || (language === 'en-US' ? 'Code Walkthrough' : '代码讲解');
    case 'table':
      return block.caption || (language === 'en-US' ? 'Table' : '表格');
    case 'callout':
      return block.title || (language === 'en-US' ? 'Callout' : '提示');
    case 'definition':
      return block.title || (language === 'en-US' ? 'Definition' : '定义');
    case 'theorem':
      return block.title || (language === 'en-US' ? 'Theorem' : '定理');
    case 'example':
      return block.title || (language === 'en-US' ? 'Example' : '例题');
    case 'process_flow':
      return block.title || (language === 'en-US' ? 'Flow' : '流程');
    case 'layout_cards':
      return block.title || (language === 'en-US' ? 'Card Layout' : '卡片布局');
    case 'chem_formula':
      return language === 'en-US' ? 'Chemical Formula' : '化学式';
    case 'chem_equation':
      return language === 'en-US' ? 'Chemical Equation' : '化学方程式';
    default:
      return language === 'en-US' ? 'Content' : '内容';
  }
}

function blockToGridBody(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string[] {
  switch (block.type) {
    case 'heading':
      return [];
    case 'paragraph':
      return [block.text];
    case 'bullet_list':
      return block.items.slice(0, 6);
    case 'equation':
      return [block.latex, ...(block.caption ? [block.caption] : [])];
    case 'matrix':
      return [
        ...block.rows.slice(0, 3).map((row) => row.join('  ')),
        ...(block.caption ? [block.caption] : []),
      ];
    case 'derivation_steps':
      return block.steps.slice(0, 4).map((step, idx) => {
        const prefix = language === 'en-US' ? `Step ${idx + 1}: ` : `步骤 ${idx + 1}：`;
        return `${prefix}${step.expression}${step.explanation ? ` — ${step.explanation}` : ''}`;
      });
    case 'code_block':
      return block.code.split('\n').slice(0, 6);
    case 'code_walkthrough':
      return block.steps.slice(0, 4).map((step, idx) => {
        const label = step.title || step.focus;
        const prefix = language === 'en-US' ? `Step ${idx + 1}: ` : `步骤 ${idx + 1}：`;
        return `${prefix}${label ? `${label} - ` : ''}${step.explanation}`;
      });
    case 'table': {
      const header = block.headers?.length ? [block.headers.join(' | ')] : [];
      const rows = block.rows.slice(0, 4).map((row) => row.join(' | '));
      return [...header, ...rows];
    }
    case 'callout':
      return [block.text];
    case 'definition':
      return [block.text];
    case 'theorem':
      return [block.text, ...(block.proofIdea ? [block.proofIdea] : [])];
    case 'example':
      return [
        block.problem,
        ...block.steps.slice(0, 3).map(
          (step, idx) => `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${step}`,
        ),
      ];
    case 'process_flow':
      return [
        ...block.context.slice(0, 3).map((item) => `${item.label}: ${item.text}`),
        ...block.steps.slice(0, 3).map(
          (step, idx) =>
            `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${step.title} - ${step.detail}`,
        ),
        ...(block.summary ? [block.summary] : []),
      ];
    case 'layout_cards':
      return block.items.map((item) => `${item.title}: ${item.text}`);
    case 'chem_formula':
      return [block.formula, ...(block.caption ? [block.caption] : [])];
    case 'chem_equation':
      return [block.equation, ...(block.caption ? [block.caption] : [])];
    default:
      return [];
  }
}

function fitGridHeadingToHeight(args: {
  text: string;
  widthPx: number;
  maxHeightPx: number;
  color: string;
}): { html: string; height: number } {
  if (!args.text.trim()) {
    return { html: '', height: 0 };
  }
  const maxChars = estimateCharsPerLine(args.text, args.widthPx, 16);
  const wrapped = wrapTextToLines(args.text, maxChars);
  const fitted = clampWrappedLines(wrapped, Number.MAX_SAFE_INTEGER, maxChars);
  return {
    html: fitted
      .map(
        (line) =>
          `<p style="font-size:16px;color:${args.color};line-height:22px;"><strong>${renderInlineLatexToHtml(line)}</strong></p>`,
      )
      .join(''),
    height: Math.max(24, fitted.length * 22 + 8),
  };
}

function fitGridBodyToHeight(args: {
  language: 'zh-CN' | 'en-US';
  block: NotebookContentBlock;
  widthPx: number;
  maxHeightPx: number;
  tone: ContentCardTone;
}): { html: string; height: number } {
  if (args.maxHeightPx <= 24) return { html: '', height: 0 };

  if (args.block.type === 'paragraph') {
    return fitParagraphBlockToHeight({
      text: args.block.text,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
      maxHeightPx: args.maxHeightPx,
      color: '#334155',
    });
  }

  if (args.block.type === 'bullet_list') {
    return fitBulletListBlockToHeight({
      items: args.block.items,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
      maxHeightPx: args.maxHeightPx,
      color: '#334155',
      bulletColor: args.tone.accent,
      paragraphGapPx: 5,
    });
  }

  const bodyLines = blockToGridBody(args.language, args.block);
  return fitBulletListBlockToHeight({
    items: bodyLines,
    widthPx: args.widthPx,
    fontSizePx: 14,
    lineHeightPx: 20,
    maxHeightPx: args.maxHeightPx,
    color: '#334155',
    bulletColor: args.tone.accent,
    paragraphGapPx: 5,
  });
}

function hasBoxGeometry(element: PPTElement): element is PPTElement & {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return (
    typeof (element as { left?: unknown }).left === 'number' &&
    typeof (element as { top?: unknown }).top === 'number' &&
    typeof (element as { width?: unknown }).width === 'number' &&
    typeof (element as { height?: unknown }).height === 'number'
  );
}

type ShapeBoxElement = PPTShapeElement & {
  left: number;
  top: number;
  width: number;
  height: number;
};

function stripShapeElements(elements: PPTElement[]): PPTElement[] {
  const converted: PPTElement[] = [];
  for (const element of elements) {
    if (element.type !== 'shape') {
      converted.push(element);
      continue;
    }

    const shapeText = element.text?.content?.trim();
    if (!shapeText) {
      continue;
    }

    converted.push({
      id: `text_${nanoid(8)}`,
      type: 'text',
      left: element.left,
      top: element.top,
      width: element.width,
      height: element.height,
      rotate: element.rotate,
      groupId: element.groupId,
      content: shapeText,
      defaultFontName: element.text?.defaultFontName || 'Microsoft YaHei',
      defaultColor: element.text?.defaultColor || '#0f172a',
      textType: element.text?.type,
      lineHeight: element.text?.lineHeight,
      paragraphSpace: element.text?.paragraphSpace,
      fill: element.fill,
      outline: element.outline,
      opacity: element.opacity,
    });
  }
  return converted;
}

function getRowVerticalOverlapRatio(
  a: { top: number; height: number },
  b: { top: number; height: number },
): number {
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  const overlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.top, b.top));
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

function expandSingleOccupancyRows(elements: PPTElement[]): PPTElement[] {
  const boxed = elements
    .map((element, index) => ({ element, index }))
    .filter(
      (
        item,
      ): item is {
        element: PPTElement & { left: number; top: number; width: number; height: number };
        index: number;
      } => hasBoxGeometry(item.element),
    )
    .sort((a, b) => a.element.top - b.element.top || a.element.left - b.element.left);

  type RowBucket = {
    minTop: number;
    maxBottom: number;
    items: Array<{
      index: number;
      element: PPTElement & { left: number; top: number; width: number; height: number };
    }>;
  };
  const rows: RowBucket[] = [];

  boxed.forEach((item) => {
    const hit = rows.find((row) => {
      const pseudoRow = { top: row.minTop, height: row.maxBottom - row.minTop };
      const overlapRatio = getRowVerticalOverlapRatio(item.element, pseudoRow);
      return overlapRatio >= 0.34;
    });
    if (!hit) {
      rows.push({
        minTop: item.element.top,
        maxBottom: item.element.top + item.element.height,
        items: [item],
      });
      return;
    }
    hit.items.push(item);
    hit.minTop = Math.min(hit.minTop, item.element.top);
    hit.maxBottom = Math.max(hit.maxBottom, item.element.top + item.element.height);
  });

  const cloned = elements.map((element) => ({ ...element })) as PPTElement[];
  rows.forEach((row) => {
    if (row.items.length !== 1) return;
    const single = row.items[0];
    const source = single.element;
    if (source.width < 180 || source.width >= CONTENT_WIDTH * 0.9) return;
    if (source.left < CONTENT_LEFT - 24 || source.left + source.width > CONTENT_LEFT + CONTENT_WIDTH + 24) {
      return;
    }
    if (source.type === 'text' && source.textType === 'notes' && source.width <= 80) return;

    const target = cloned[single.index];
    if (!target || !hasBoxGeometry(target)) return;
    target.left = CONTENT_LEFT;
    target.width = CONTENT_WIDTH;
  });

  return cloned;
}

function buildStackUnderfillExpansionRequests(args: {
  elements: PPTElement[];
  bodyTop: number;
  usedBottom: number;
}): Record<string, number> {
  const contentHeight = CONTENT_BOTTOM - args.bodyTop;
  const usedHeight = Math.max(0, args.usedBottom - args.bodyTop);
  const fillRatio = contentHeight > 0 ? usedHeight / contentHeight : 1;
  if (fillRatio >= STACK_UNDERFILL_THRESHOLD) return {};

  const extraSpace = Math.max(0, CONTENT_BOTTOM - args.usedBottom);
  if (extraSpace < 18) return {};

  const candidates = args.elements.filter((element): element is ShapeBoxElement => {
    if (element.type !== 'shape') return false;
    if (!hasBoxGeometry(element)) return false;
    if (element.top < args.bodyTop - 1) return false;
    if (element.left > CONTENT_LEFT + 4) return false;
    if (element.width < CONTENT_WIDTH * 0.75) return false;
    return Boolean(element.text?.content?.trim());
  });
  if (candidates.length === 0) return {};

  const totalWeight = candidates.reduce((sum, item) => sum + Math.max(40, item.height), 0);
  if (totalWeight <= 0) return {};

  const requestedHeights: Record<string, number> = {};
  candidates.forEach((candidate, index) => {
    const weight = Math.max(40, candidate.height);
    const rawDelta = (extraSpace * weight) / totalWeight;
    const roundedDelta = index === candidates.length - 1 ? rawDelta : Math.floor(rawDelta);
    requestedHeights[candidate.id] = Math.max(candidate.height, candidate.height + roundedDelta);
  });
  return requestedHeights;
}

function estimateGridBodyHeight(args: {
  language: 'zh-CN' | 'en-US';
  block: NotebookContentBlock;
  widthPx: number;
}): number {
  if (args.block.type === 'paragraph') {
    const charsPerLine = estimateCharsPerLine(args.block.text, args.widthPx, 14);
    return estimateParagraphHeight(args.block.text, charsPerLine, 20);
  }

  if (args.block.type === 'bullet_list') {
    const joined = args.block.items.join('\n');
    const charsPerLine = estimateCharsPerLine(joined, Math.max(120, args.widthPx - 16), 14);
    return estimateParagraphStackHeight(args.block.items, charsPerLine, 20, 5);
  }

  const bodyLines = blockToGridBody(args.language, args.block);
  const joined = bodyLines.join('\n');
  const charsPerLine = estimateCharsPerLine(joined, Math.max(120, args.widthPx - 16), 14);
  return estimateParagraphStackHeight(bodyLines, charsPerLine, 20, 5);
}

function computeAdaptiveGridRowHeights(args: {
  gridRows: number;
  gridColumns: number;
  blockCount: number;
  bodyHeight: number;
  rowDesiredHeights: number[];
}): { rowHeights: number[]; rowTops: number[] } {
  const usedRows = Math.max(1, Math.min(args.gridRows, Math.ceil(args.blockCount / args.gridColumns)));
  const gapTotal = Math.max(0, usedRows - 1) * GRID_GAP_Y;
  const availableHeight = Math.max(usedRows * 48, args.bodyHeight - gapTotal);
  const baseMinHeight = Math.max(72, Math.floor(availableHeight / usedRows) - 2);
  const minTotal = baseMinHeight * usedRows;

  const desired = Array.from({ length: usedRows }, (_, index) =>
    Math.max(baseMinHeight, args.rowDesiredHeights[index] || baseMinHeight),
  );
  const desiredTotal = desired.reduce((sum, value) => sum + value, 0);

  let rowHeights: number[];
  if (desiredTotal <= availableHeight) {
    const leftover = availableHeight - desiredTotal;
    const extraPerRow = leftover / usedRows;
    rowHeights = desired.map((value) => value + extraPerRow);
  } else {
    const desiredExtras = desired.map((value) => Math.max(0, value - baseMinHeight));
    const desiredExtraTotal = desiredExtras.reduce((sum, value) => sum + value, 0);
    const availableExtra = Math.max(0, availableHeight - minTotal);
    const scale = desiredExtraTotal > 0 ? Math.min(1, availableExtra / desiredExtraTotal) : 0;
    rowHeights = desiredExtras.map((extra) => baseMinHeight + extra * scale);
  }

  const rowTops: number[] = [];
  let cursor = 0;
  for (let i = 0; i < rowHeights.length; i += 1) {
    rowTops.push(cursor);
    cursor += rowHeights[i] + GRID_GAP_Y;
  }

  return { rowHeights, rowTops };
}

export interface NotebookDocumentArchetypeValidation {
  isValid: boolean;
  invalidBlockTypes: NotebookContentBlock['type'][];
  reasons: string[];
}

export function validateNotebookContentDocumentArchetype(
  document: NotebookContentDocument,
): NotebookDocumentArchetypeValidation {
  const archetype = resolveDocumentArchetype(document);
  const allowedTypes = new Set(ARCHETYPE_ALLOWED_BLOCKS[archetype]);
  const invalidBlockTypes = Array.from(
    new Set(
      document.blocks.filter((block) => !allowedTypes.has(block.type)).map((block) => block.type),
    ),
  );

  return {
    isValid: invalidBlockTypes.length === 0,
    invalidBlockTypes,
    reasons: invalidBlockTypes.map((type) => `archetype_block_mismatch:${archetype}:${type}`),
  };
}

export interface NotebookDocumentPaginationResult {
  pages: NotebookContentDocument[];
  wasSplit: boolean;
  reasons: string[];
  unpageableBlockTypes: NotebookContentBlock['type'][];
}

export function renderNotebookContentDocumentToSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
}): Slide {
  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const archetype = resolveDocumentArchetype(args.document);
  const archetypeLayout = getArchetypeLayoutSettings(archetype);
  const documentLayout = resolveDocumentLayout(args.document);
  const documentPattern = resolveDocumentPattern(args.document);
  const tokens = getProfileTokens(profile);
  const cardPalettes = tokens.cardPalettes;
  const orderedBlocks = sortBlocksByPlacementOrder(args.document.blocks);
  let effectiveLayout: NotebookContentLayout = documentLayout;
  let effectiveBlocks = orderedBlocks;
  if (documentLayout.mode === 'stack' && documentPattern === 'multi_column_cards') {
    effectiveLayout = { mode: 'grid', columns: 2 };
  }
  if (documentLayout.mode === 'stack' && documentPattern === 'symmetric_split') {
    effectiveLayout = { mode: 'grid', columns: 2, rows: 1 };
    effectiveBlocks = orderedBlocks.slice(0, 2);
  }
  if (
    documentLayout.mode === 'stack' &&
    (documentPattern === 'flow_horizontal' || documentPattern === 'flow_vertical')
  ) {
    const firstFlowIndex = orderedBlocks.findIndex((block) => block.type === 'process_flow');
    if (firstFlowIndex >= 0) {
      const existing = orderedBlocks[firstFlowIndex] as ProcessFlowBlock;
      const next = [...orderedBlocks];
      next[firstFlowIndex] = {
        ...existing,
        orientation: documentPattern === 'flow_horizontal' ? 'horizontal' : 'vertical',
      };
      effectiveBlocks = next;
    } else {
      effectiveBlocks = [
        buildFlowPatternBlock({
          language,
          orientation: documentPattern === 'flow_horizontal' ? 'horizontal' : 'vertical',
          blocks: orderedBlocks,
        }),
      ];
    }
  }
  const blocks =
    effectiveLayout.mode === 'grid' ? effectiveBlocks : expandBlocks(effectiveBlocks, language);
  const elements: PPTElement[] = [];

  elements.push(
    createRectShape({
      left: CONTENT_LEFT - 14,
      top: archetypeLayout.titleTop + 4,
      width: 10,
      height: archetypeLayout.accentHeight,
      fill: tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: archetypeLayout.titleTop,
      width: CONTENT_WIDTH,
      height: archetypeLayout.titleHeight,
      html: `<p style="font-size:${Math.max(28, archetypeLayout.titleFontSize)}px;letter-spacing:-0.5px;font-weight:700;"><span style="background:linear-gradient(90deg, ${tokens.titleAccent}, #7a5af8);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${renderInlineLatexToHtml(args.document.title || args.fallbackTitle)}</span></p>`,
      color: args.document.titleTextColor || tokens.titleText,
      textType: 'title',
      fill: args.document.titleBackgroundColor || '#eff6ff',
      outlineColor: args.document.titleBorderColor || '#bfdbfe',
    }),
  );

  if (args.document.continuation) {
    const chipLabel =
      language === 'en-US'
        ? `Part ${args.document.continuation.partNumber} of ${args.document.continuation.totalParts}`
        : `续 ${args.document.continuation.partNumber}/${args.document.continuation.totalParts}`;
    elements.push(
      createRectShape({
        left: CONTENT_LEFT + CONTENT_WIDTH - 178,
        top: archetypeLayout.titleTop + 6,
        width: 158,
        height: 24,
        fill: '#eef2ff',
        outlineColor: '#c7d2fe',
      }),
      createTextElement({
        left: CONTENT_LEFT + CONTENT_WIDTH - 170,
        top: archetypeLayout.titleTop + 8,
        width: 142,
        height: 20,
        html: `<p style="font-size:12px;color:#4f46e5;text-align:center;"><strong>${escapeHtml(chipLabel)}</strong></p>`,
        color: '#4f46e5',
        textType: 'notes',
      }),
    );
  }

  if (effectiveLayout.mode === 'grid') {
    const bodyTop = archetypeLayout.bodyTop;
    const bodyHeight = CONTENT_BOTTOM - bodyTop;
    const grid = resolveGridLayout(effectiveLayout, { blockCount: blocks.length, bodyHeight });
    const placedBlocks = arrangeGridBlocksByPlacement(blocks, grid);
    const cellWidth =
      (CONTENT_WIDTH - Math.max(0, grid.columns - 1) * GRID_GAP_X) / Math.max(grid.columns, 1);
    const rowDesiredHeights = Array.from({ length: grid.rows }, () => GRID_MIN_CELL_HEIGHT);
    placedBlocks.forEach((placed) => {
      const innerWidth = Math.max(
        120,
        placed.colSpan * cellWidth + Math.max(0, placed.colSpan - 1) * GRID_GAP_X - CARD_INSET_X * 2,
      );
      const block = placed.block;
      const heading = blockToGridHeading(language, block);
      const headingHeight = fitGridHeadingToHeight({
        text: heading,
        widthPx: innerWidth,
        maxHeightPx: 52,
        color: '#0f172a',
      }).height;
      const bodyHeightEstimate = estimateGridBodyHeight({
        language,
        block,
        widthPx: innerWidth,
      });
      const requiredCardHeight = Math.ceil(headingHeight + bodyHeightEstimate + 20);
      const internalGaps = Math.max(0, placed.rowSpan - 1) * GRID_GAP_Y;
      const perRowNeed = Math.max(
        GRID_MIN_CELL_HEIGHT,
        Math.ceil((requiredCardHeight - internalGaps) / Math.max(1, placed.rowSpan)),
      );
      for (let row = placed.row; row < placed.row + placed.rowSpan && row < grid.rows; row += 1) {
        rowDesiredHeights[row] = Math.max(rowDesiredHeights[row], perRowNeed);
      }
    });
    const adaptive = computeAdaptiveGridRowHeights({
      gridRows: grid.rows,
      gridColumns: grid.columns,
      blockCount: placedBlocks.length,
      bodyHeight,
      rowDesiredHeights,
    });

    placedBlocks.forEach((placed, index) => {
      const block = placed.block;
      if (placed.row >= adaptive.rowHeights.length) return;
      const left = CONTENT_LEFT + placed.col * (cellWidth + GRID_GAP_X);
      const top = bodyTop + adaptive.rowTops[placed.row];
      const cellWidthWithSpan =
        placed.colSpan * cellWidth + Math.max(0, placed.colSpan - 1) * GRID_GAP_X;
      const cellHeightWithSpan = Array.from({ length: placed.rowSpan }).reduce<number>(
        (sum, _, rowOffset) => {
          const rowIndex = placed.row + rowOffset;
          if (rowIndex >= adaptive.rowHeights.length) return sum;
          const gap = rowOffset > 0 ? GRID_GAP_Y : 0;
          return sum + gap + adaptive.rowHeights[rowIndex];
        },
        0,
      );
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[index % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const innerWidth = Math.max(120, cellWidthWithSpan - CARD_INSET_X * 2);
      const heading = blockToGridHeading(language, block);
      const headingFit = fitGridHeadingToHeight({
        text: heading,
        widthPx: innerWidth,
        maxHeightPx: 52,
        color: titleColor,
      });
      const bodyFit = fitGridBodyToHeight({
        language,
        block,
        widthPx: innerWidth,
        maxHeightPx: Math.max(24, cellHeightWithSpan - headingFit.height - 20),
        tone,
      });

      elements.push(
        createTextElement({
          left,
          top,
          width: cellWidthWithSpan,
          height: cellHeightWithSpan,
          html: `${headingFit.html}${bodyFit.html}`,
          color: '#334155',
          textType: 'content',
          fill: tone.fill,
          outlineColor: tone.accent,
          shadow: {
            h: 0,
            v: 8,
            blur: 24,
            color: 'rgba(15,23,42,0.08)',
          },
        }),
      );
    });

    return {
      id: `slide_${nanoid(8)}`,
      viewportSize: CANVAS_WIDTH,
      viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
      theme: {
        backgroundColor: tokens.backgroundColors[0],
        themeColors: tokens.themeColors,
        fontColor: tokens.titleText,
        fontName: 'Microsoft YaHei',
      },
      elements: normalizeSlideTextLayout(expandSingleOccupancyRows(stripShapeElements(elements)), {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      }),
      background: {
        type: 'gradient',
        gradient: {
          type: 'linear',
          rotate: 135,
          colors: [
            { pos: 0, color: tokens.backgroundColors[0] },
            { pos: 55, color: tokens.backgroundColors[1] },
            { pos: 100, color: tokens.backgroundColors[2] },
          ],
        },
      },
      type: 'content',
    };
  }

  let cursorTop = archetypeLayout.bodyTop;
  let visualBlockIndex = 0;
  for (const block of blocks) {
    if (cursorTop >= CONTENT_BOTTOM) break;

    if (block.type === 'heading') {
      const height = block.level <= 2 ? 34 : 28;
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          html: `<p style="font-size:${block.level <= 2 ? 22 : 18}px;color:#1e293b;"><strong>${renderInlineLatexToHtml(block.text)}</strong></p>`,
          color: '#1e293b',
          textType: 'itemTitle',
        }),
      );
      cursorTop += height + 10;
      continue;
    }

    if (block.type === 'paragraph') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const cardTitle = block.cardTitle?.trim() || '';
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxCardInnerHeight = Math.max(28, remainingHeight - CARD_INSET_Y * 2);
      const titleFit = cardTitle
        ? fitGridHeadingToHeight({
            text: cardTitle,
            widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            maxHeightPx: Math.min(56, maxCardInnerHeight),
            color: titleColor,
          })
        : { html: '', height: 0 };
      const titleGap = titleFit.height > 0 ? 6 : 0;
      const maxContentHeight = Math.max(28, maxCardInnerHeight - titleFit.height - titleGap);
      const paragraph = fitParagraphBlockToHeight({
        text: block.text,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 22,
        maxHeightPx: maxContentHeight,
        color: '#334155',
      });
      const contentHeight = titleFit.height + titleGap + paragraph.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${titleFit.html}${paragraph.html}`,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'bullet_list') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const cardTitle = block.cardTitle?.trim() || '';
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxCardInnerHeight = Math.max(40, remainingHeight - CARD_INSET_Y * 2);
      const titleFit = cardTitle
        ? fitGridHeadingToHeight({
            text: cardTitle,
            widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            maxHeightPx: Math.min(56, maxCardInnerHeight),
            color: titleColor,
          })
        : { html: '', height: 0 };
      const titleGap = titleFit.height > 0 ? 6 : 0;
      const maxContentHeight = Math.max(40, maxCardInnerHeight - titleFit.height - titleGap);
      const bulletList = fitBulletListBlockToHeight({
        items: block.items,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 20,
        maxHeightPx: maxContentHeight,
        color: '#334155',
        bulletColor: tone.accent,
      });
      const contentHeight = titleFit.height + titleGap + bulletList.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${titleFit.html}${bulletList.html}`,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'equation') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const toneFill = block.backgroundColor || tone.fill;
      const toneBorder = block.borderColor || tone.border;
      const contentHeight = estimateLatexDisplayHeight(block.latex, block.display);
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + (block.caption ? 22 : 0);
      const groupId = createCardGroupId('equation_card');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: cardHeight,
          fill: toneFill,
          outlineColor: toneBorder,
          groupId,
        }),
      );
      elements.push(
        createLatexElement({
          latex: block.latex,
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          align: block.display ? 'center' : 'left',
          groupId,
          color: block.textColor,
          fill: toneFill,
          outlineColor: toneBorder,
        }),
      );
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            groupId,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: block.noteTextColor || '#64748b',
            fill: block.noteBackgroundColor,
            outlineColor: block.noteBorderColor,
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'matrix') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const toneFill = block.backgroundColor || tone.fill;
      const toneBorder = block.borderColor || tone.border;
      const latex = matrixBlockToLatex(block);
      const contentHeight = estimateLatexDisplayHeight(latex, true);
      const labelHeight = block.label ? 24 : 0;
      const captionHeight = block.caption ? 22 : 0;
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + labelHeight + captionHeight;
      const groupId = createCardGroupId('matrix_card');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: cardHeight,
          fill: toneFill,
          outlineColor: toneBorder,
          groupId,
        }),
      );
      if (block.label) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 24,
            groupId,
            html: `<p style="font-size:15px;color:${tone.accent};"><strong>${escapeHtml(block.label)}</strong></p>`,
            color: tone.accent,
            textType: 'itemTitle',
          }),
        );
      }
      elements.push(
        createLatexElement({
          latex,
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y + labelHeight,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          align: 'center',
          groupId,
          color: block.textColor,
          fill: toneFill,
          outlineColor: toneBorder,
        }),
      );
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + labelHeight + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            groupId,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: block.noteTextColor || '#64748b',
            fill: block.noteBackgroundColor,
            outlineColor: block.noteBorderColor,
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'code_block') {
      const height = estimateCodeBlockHeight(block.code, block.caption ? 1 : 0);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: tokens.codeSurface.fill,
          outlineColor: tokens.codeSurface.outline,
          text: createShapeText({
            html: [
              block.caption
                ? `<p style="font-size:14px;color:${tokens.codeSurface.caption};"><strong>${escapeHtml(block.caption)}</strong></p>`
                : '',
              ...block.code
                .split('\n')
                .map(
                  (line) =>
                    `<p style="font-size:13px;color:${tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
                ),
            ]
              .filter(Boolean)
              .join(''),
            color: tokens.codeSurface.text,
            fontName: 'Menlo, Monaco, Consolas, monospace',
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += height + 12;
      continue;
    }

    if (block.type === 'code_walkthrough') {
      if (block.title) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT,
            top: cursorTop,
            width: CONTENT_WIDTH,
            height: 28,
            html: `<p style="font-size:18px;color:${tokens.titleAccent};"><strong>${escapeHtml(block.title)}</strong></p>`,
            color: tokens.titleAccent,
            textType: 'itemTitle',
          }),
        );
        cursorTop += 34;
      }

      const codeHeight = estimateCodeBlockHeight(block.code, block.caption ? 1 : 0);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: codeHeight,
          fill: tokens.codeSurface.fill,
          outlineColor: tokens.codeSurface.outline,
          text: createShapeText({
            html: [
              block.caption
                ? `<p style="font-size:14px;color:${tokens.codeSurface.caption};"><strong>${escapeHtml(block.caption)}</strong></p>`
                : '',
              ...block.code
                .split('\n')
                .map(
                  (line) =>
                    `<p style="font-size:13px;color:${tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
                ),
            ]
              .filter(Boolean)
              .join(''),
            color: tokens.codeSurface.text,
            fontName: 'Menlo, Monaco, Consolas, monospace',
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += codeHeight + 10;

      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const stepItems = block.steps.map((step, idx) => {
        const focus = step.title || step.focus;
        return `${idx + 1}. ${focus ? `${focus}: ` : ''}${step.explanation}`;
      });
      const stepHeight = Math.min(
        180,
        Math.max(56, estimateParagraphStackHeight(stepItems, 34, 20)),
      );
      const stepCardHeight = stepHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: stepCardHeight,
          tone,
          html: stepItems
            .map((item) => `<p style="font-size:15px;color:#334155;">${escapeHtml(item)}</p>`)
            .join(''),
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += stepCardHeight + 10;
      visualBlockIndex += 1;

      if (block.output) {
        const outputHeight = estimateCodeBlockHeight(block.output, 1);
        elements.push(
          createRectShape({
            left: CONTENT_LEFT,
            top: cursorTop,
            width: CONTENT_WIDTH,
            height: outputHeight,
            fill: '#111827',
            outlineColor: '#1f2937',
            text: createShapeText({
              html: [
                `<p style="font-size:14px;color:#cbd5e1;"><strong>${language === 'en-US' ? 'Output' : '输出'}</strong></p>`,
                ...block.output
                  .split('\n')
                  .map(
                    (line) =>
                      `<p style="font-size:13px;color:#f8fafc;font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
                  ),
              ].join(''),
              color: '#f8fafc',
              fontName: 'Menlo, Monaco, Consolas, monospace',
              textType: 'content',
              align: 'top',
            }),
          }),
        );
        cursorTop += outputHeight + 10;
      }

      continue;
    }

    if (block.type === 'process_flow') {
      const rendered = renderProcessFlowBlock({
        block,
        top: cursorTop,
        language,
        titleAccent: tokens.titleAccent,
        cardPalettes,
      });
      elements.push(...rendered.elements);
      cursorTop += rendered.height;
      visualBlockIndex += Math.max(1, block.steps.length);
      continue;
    }

    if (block.type === 'layout_cards') {
      const rendered = renderLayoutCardsBlock({
        block,
        top: cursorTop,
        cardPalettes,
      });
      elements.push(...rendered.elements);
      cursorTop += rendered.height + 12;
      visualBlockIndex += Math.max(1, block.items.length);
      continue;
    }

    if (block.type === 'table') {
      const groupId = createCardGroupId('table_block');
      const tableEls = createTableElement({
        top: cursorTop,
        headers: block.headers,
        rows: block.rows,
        caption: block.caption,
        groupId,
      });
      elements.push(...tableEls);
      cursorTop +=
        Math.min(
          220,
          Math.max(72, (block.rows.length + (block.headers?.length ? 1 : 0)) * 34 + 12),
        ) + (block.caption ? 38 : 12);
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'callout') {
      const baseTonePalette = {
        info: { fill: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
        success: { fill: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
        warning: { fill: '#fff7ed', border: '#fdba74', text: '#c2410c' },
        danger: { fill: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
        tip: { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
      }[block.tone];
      const templateTone = resolveBlockTemplateTone(block.templateId, {
        fill: baseTonePalette.fill,
        border: baseTonePalette.border,
        accent: baseTonePalette.text,
      });
      const height = estimateParagraphHeight(block.text, 36, 20) + (block.title ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: templateTone.fill,
          outlineColor: templateTone.border,
          text: createShapeText({
            html: [
              block.title
                ? `<p style="font-size:15px;color:${templateTone.accent};"><strong>${renderInlineLatexToHtml(block.title)}</strong></p>`
                : '',
              `<p style="font-size:15px;color:${templateTone.accent};">${renderInlineLatexToHtml(block.text)}</p>`,
            ]
              .filter(Boolean)
              .join(''),
            color: templateTone.accent,
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += height + 12;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'definition' || block.type === 'theorem') {
      const baseTonePalette =
        block.type === 'definition'
          ? { fill: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' }
          : { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' };
      const templateTone = resolveBlockTemplateTone(block.templateId, {
        fill: baseTonePalette.fill,
        border: baseTonePalette.border,
        accent: baseTonePalette.text,
      });
      const supportText = block.type === 'theorem' ? block.proofIdea : undefined;
      const bodyText = supportText ? `${block.text}\n${supportText}` : block.text;
      const height =
        estimateParagraphHeight(bodyText, 36, 20) +
        (block.title || block.type === 'definition' || block.type === 'theorem' ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: templateTone.fill,
          outlineColor: templateTone.border,
          text: createShapeText({
            html: [
              `<p style="font-size:15px;color:${templateTone.accent};"><strong>${renderInlineLatexToHtml(block.title || (language === 'en-US' ? (block.type === 'definition' ? 'Definition' : 'Theorem') : block.type === 'definition' ? '定义' : '定理'))}</strong></p>`,
              `<p style="font-size:15px;color:#334155;">${renderInlineLatexToHtml(block.text)}</p>`,
              supportText
                ? `<p style="font-size:14px;color:${templateTone.accent};">${renderInlineLatexToHtml(supportText)}</p>`
                : '',
            ]
              .filter(Boolean)
              .join(''),
            color: '#334155',
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += height + 12;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'chem_formula' || block.type === 'chem_equation') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const raw = block.type === 'chem_formula' ? block.formula : block.equation;
      const caption = block.caption;
      const contentHeight = 34 + (caption ? 24 : 0);
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: [
            `<p style="font-size:20px;color:#0f172a;">${chemistryTextToHtml(raw)}</p>`,
            caption ? `<p style="font-size:13px;color:#64748b;">${escapeHtml(caption)}</p>` : '',
          ]
            .filter(Boolean)
            .join(''),
          color: '#0f172a',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }
  }

  const usedBottom = elements
    .filter(hasBoxGeometry)
    .reduce((maxBottom, element) => Math.max(maxBottom, element.top + element.height), archetypeLayout.bodyTop);
  const underfillExpansion = buildStackUnderfillExpansionRequests({
    elements,
    bodyTop: archetypeLayout.bodyTop,
    usedBottom,
  });
  const reflowedElements = applyAutoHeightReflow({
    elements,
    requestedHeights: underfillExpansion,
  });
  const noShapeElements = stripShapeElements(reflowedElements);

  return {
    id: `slide_${nanoid(8)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
    theme: {
      backgroundColor: tokens.backgroundColors[0],
      themeColors: tokens.themeColors,
      fontColor: tokens.titleText,
      fontName: 'Microsoft YaHei',
    },
    elements: normalizeSlideTextLayout(expandSingleOccupancyRows(noShapeElements), {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    }),
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          { pos: 0, color: tokens.backgroundColors[0] },
          { pos: 55, color: tokens.backgroundColors[1] },
          { pos: 100, color: tokens.backgroundColors[2] },
        ],
      },
    },
    type: 'content',
  };
}

export interface NotebookSlideContentBudgetAssessment {
  fits: boolean;
  estimatedBottom: number;
  overflowPx: number;
  densityScore: number;
  maxDensityScore: number;
  expandedBlockCount: number;
  reasons: string[];
}

function getProfileDensityBudget(profile: NotebookContentProfile): number {
  switch (profile) {
    case 'math':
      return 8.8;
    case 'code':
      return 8.2;
    default:
      return 8.4;
  }
}

function getArchetypeDensityBudget(
  profile: NotebookContentProfile,
  archetype: NotebookSlideArchetype,
): number {
  const baseBudget = getProfileDensityBudget(profile);
  switch (archetype) {
    case 'intro':
      return baseBudget - 0.8;
    case 'summary':
      return baseBudget - 0.6;
    case 'bridge':
      return baseBudget - 0.35;
    case 'example':
      return baseBudget + 0.3;
    default:
      return baseBudget;
  }
}

function getArchetypeBlockBudget(archetype: NotebookSlideArchetype): number {
  switch (archetype) {
    case 'intro':
      return 5;
    case 'bridge':
      return 6;
    case 'summary':
      return 6;
    case 'definition':
      return 6;
    default:
      return 7;
  }
}

function assessExpandedBlockHeight(
  block: NotebookContentBlock,
  language: 'zh-CN' | 'en-US',
  visualBlockIndex: number,
): { height: number; densityDelta: number; consumesVisualCard: boolean } {
  if (block.type === 'heading') {
    const height = block.level <= 2 ? 34 : 28;
    return {
      height: height + 10,
      densityDelta: block.level <= 2 ? 0.55 : 0.35,
      consumesVisualCard: false,
    };
  }

  if (block.type === 'paragraph') {
    const paragraph = fitParagraphBlockToHeight({
      text: block.text,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
      fontSizePx: 16,
      lineHeightPx: 22,
      maxHeightPx: 960,
      color: '#334155',
    });
    const densityDelta = 0.9 + Math.min(0.95, block.text.length / 850);
    return {
      height: paragraph.height + CARD_INSET_Y * 2 + 10,
      densityDelta,
      consumesVisualCard: true,
    };
  }

  if (block.type === 'bullet_list') {
    const tone = getProfileTokens('general').cardPalettes[visualBlockIndex % 4];
    const bulletList = fitBulletListBlockToHeight({
      items: block.items,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
      fontSizePx: 16,
      lineHeightPx: 20,
      maxHeightPx: 960,
      color: '#334155',
      bulletColor: tone.accent,
    });
    const totalChars = block.items.reduce((sum, item) => sum + item.length, 0);
    const densityDelta = 1.1 + block.items.length * 0.18 + Math.min(0.8, totalChars / 1600);
    return {
      height: bulletList.height + CARD_INSET_Y * 2 + 10,
      densityDelta,
      consumesVisualCard: true,
    };
  }

  if (block.type === 'equation') {
    return {
      height:
        estimateLatexDisplayHeight(block.latex, block.display) +
        CARD_INSET_Y * 2 +
        (block.caption ? 22 : 0) +
        10,
      densityDelta: block.display ? 1.2 : 1.0,
      consumesVisualCard: true,
    };
  }

  if (block.type === 'matrix') {
    const rows = block.rows.length;
    const cols = Math.max(...block.rows.map((row) => row.length));
    return {
      height:
        estimateLatexDisplayHeight(matrixBlockToLatex(block), true) +
        CARD_INSET_Y * 2 +
        (block.label ? 24 : 0) +
        (block.caption ? 22 : 0) +
        10,
      densityDelta: 1.45 + rows * 0.12 + cols * 0.08,
      consumesVisualCard: true,
    };
  }

  if (block.type === 'code_block') {
    const lineCount = block.code.split('\n').length;
    return {
      height: estimateCodeBlockHeight(block.code, block.caption ? 1 : 0) + 12,
      densityDelta: 1.6 + Math.min(1.2, lineCount * 0.08),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'code_walkthrough') {
    const titleHeight = block.title ? 34 : 0;
    const codeHeight = estimateCodeBlockHeight(block.code, block.caption ? 1 : 0) + 10;
    const stepItems = block.steps.map((step, idx) => {
      const focus = step.title || step.focus;
      return `${idx + 1}. ${focus ? `${focus}: ` : ''}${step.explanation}`;
    });
    const stepHeight =
      Math.min(180, Math.max(56, estimateParagraphStackHeight(stepItems, 34, 20))) +
      CARD_INSET_Y * 2 +
      10;
    const outputHeight = block.output ? estimateCodeBlockHeight(block.output, 1) + 10 : 0;
    return {
      height: titleHeight + codeHeight + stepHeight + outputHeight,
      densityDelta:
        2.3 +
        Math.min(1.1, block.code.split('\n').length * 0.05) +
        Math.min(1.0, block.steps.length * 0.22),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'process_flow') {
    return {
      height: estimateProcessFlowBlockHeight({ block, language }),
      densityDelta:
        1.8 +
        Math.min(1.2, block.steps.length * 0.2) +
        Math.min(0.7, block.context.length * 0.16),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'layout_cards') {
    const measured = measureLayoutCardsLayout({
      items: block.items,
      columns: block.columns,
    });
    return {
      height: measured.totalHeight + (block.title ? 34 : 0) + 12,
      densityDelta: 1.1 + Math.min(0.9, block.items.length * 0.2),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'table') {
    const rowCount = block.rows.length + (block.headers?.length ? 1 : 0);
    const colCount = Math.max(
      block.headers?.length ?? 0,
      ...block.rows.map((row) => row.length),
      1,
    );
    return {
      height: Math.min(220, Math.max(72, rowCount * 34 + 12)) + (block.caption ? 38 : 12),
      densityDelta: 1.4 + rowCount * 0.12 + colCount * 0.08,
      consumesVisualCard: true,
    };
  }

  if (block.type === 'callout') {
    return {
      height: estimateParagraphHeight(block.text, 36, 20) + (block.title ? 28 : 12) + 12,
      densityDelta: 0.95 + Math.min(0.75, block.text.length / 900),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'definition') {
    return {
      height: estimateParagraphHeight(block.text, 36, 20) + 40,
      densityDelta: 1.0 + Math.min(0.7, block.text.length / 1000),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'theorem') {
    const supportLength = block.proofIdea?.length ?? 0;
    return {
      height:
        estimateParagraphHeight(
          supportLength > 0 ? `${block.text}\n${block.proofIdea}` : block.text,
          36,
          20,
        ) + 40,
      densityDelta: 1.15 + Math.min(0.85, (block.text.length + supportLength) / 1200),
      consumesVisualCard: true,
    };
  }

  if (block.type === 'chem_formula' || block.type === 'chem_equation') {
    return {
      height: 34 + (block.caption ? 24 : 0) + CARD_INSET_Y * 2 + 10,
      densityDelta: 1.05,
      consumesVisualCard: true,
    };
  }

  return {
    height: language === 'en-US' ? 110 : 100,
    densityDelta: 1.0,
    consumesVisualCard: true,
  };
}

export function assessNotebookContentDocumentForSlide(
  document: NotebookContentDocument,
): NotebookSlideContentBudgetAssessment {
  const language = document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(document);
  const archetype = resolveDocumentArchetype(document);
  const documentLayout = resolveDocumentLayout(document);
  if (documentLayout.mode === 'grid') {
    const archetypeLayout = getArchetypeLayoutSettings(archetype);
    const grid = resolveGridLayout(documentLayout, {
      blockCount: document.blocks.length,
      bodyHeight: CONTENT_BOTTOM - archetypeLayout.bodyTop,
    });
    const reasons: string[] = [];
    if (document.blocks.length > grid.capacity) {
      reasons.push(`too_many_blocks_for_grid:${document.blocks.length}/${grid.capacity}`);
    }

    return {
      fits: reasons.length === 0,
      estimatedBottom: CONTENT_BOTTOM,
      overflowPx: 0,
      densityScore: document.blocks.length,
      maxDensityScore: grid.capacity,
      expandedBlockCount: document.blocks.length,
      reasons,
    };
  }
  const layout = getArchetypeLayoutSettings(archetype);
  const blocks = prepareBlocksForPagination(document.blocks, language);
  const maxDensityScore = getArchetypeDensityBudget(profile, archetype);
  const maxBlocksPerPage = getArchetypeBlockBudget(archetype);

  let cursorTop = layout.bodyTop;
  let visualBlockIndex = 0;
  let densityScore = 0.5;

  for (const block of blocks) {
    const estimate = assessExpandedBlockHeight(block, language, visualBlockIndex);
    cursorTop += estimate.height;
    densityScore += estimate.densityDelta;
    if (estimate.consumesVisualCard) {
      visualBlockIndex += 1;
    }
  }

  const overflowPx = Math.max(0, cursorTop - CONTENT_BOTTOM);
  const reasons: string[] = [];

  if (overflowPx > 0) {
    reasons.push(`estimated_content_height_overflow:${Math.ceil(overflowPx)}`);
  }

  if (densityScore > maxDensityScore) {
    reasons.push(`density_score:${densityScore.toFixed(2)}/${maxDensityScore.toFixed(2)}`);
  }

  if (blocks.length > maxBlocksPerPage) {
    reasons.push(`too_many_blocks:${blocks.length}`);
  }

  return {
    fits: reasons.length === 0,
    estimatedBottom: cursorTop,
    overflowPx,
    densityScore,
    maxDensityScore,
    expandedBlockCount: blocks.length,
    reasons,
  };
}

export function paginateNotebookContentDocument(args: {
  document: NotebookContentDocument;
  rootOutlineId: string;
}): NotebookDocumentPaginationResult {
  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const archetype = resolveDocumentArchetype(args.document);
  const documentLayout = resolveDocumentLayout(args.document);
  if (documentLayout.mode === 'grid') {
    const archetypeLayout = getArchetypeLayoutSettings(archetype);
    const grid = resolveGridLayout(documentLayout, {
      blockCount: args.document.blocks.length,
      bodyHeight: CONTENT_BOTTOM - archetypeLayout.bodyTop,
    });
    const capacity = Math.max(1, grid.capacity);
    const pages: NotebookContentDocument[] = [];

    for (let index = 0; index < args.document.blocks.length; index += capacity) {
      const partBlocks = args.document.blocks.slice(index, index + capacity);
      if (partBlocks.length === 0) continue;
      pages.push({
        ...args.document,
        layout: documentLayout,
        blocks: partBlocks,
      });
    }

    if (pages.length === 0) {
      return {
        pages: [],
        wasSplit: false,
        reasons: ['no_renderable_blocks_after_pagination'],
        unpageableBlockTypes: [],
      };
    }

    const totalParts = pages.length;
    return {
      pages: pages.map((page, index) => ({
        ...page,
        continuation:
          totalParts > 1 && index > 0
            ? ({
                rootOutlineId: args.rootOutlineId,
                partNumber: index + 1,
                totalParts,
              } satisfies NotebookContentContinuation)
            : undefined,
      })),
      wasSplit: totalParts > 1,
      reasons: totalParts > 1 ? [`split_into_pages:${totalParts}`] : [],
      unpageableBlockTypes: [],
    };
  }
  const layout = getArchetypeLayoutSettings(archetype);
  const maxDensityScore = getArchetypeDensityBudget(profile, archetype);
  const maxBlocksPerPage = getArchetypeBlockBudget(archetype);
  const blocks = prepareBlocksForPagination(args.document.blocks, language);

  const pages: NotebookContentBlock[][] = [];
  const unpageableBlockTypes = new Set<NotebookContentBlock['type']>();
  let currentBlocks: NotebookContentBlock[] = [];
  let cursorTop = layout.bodyTop;
  let visualBlockIndex = 0;
  let densityScore = 0.5;

  const pushPage = () => {
    if (currentBlocks.length === 0) return;
    pages.push(currentBlocks);
    currentBlocks = [];
    cursorTop = layout.bodyTop;
    visualBlockIndex = 0;
    densityScore = 0.5;
  };

  for (const block of blocks) {
    const estimate = assessExpandedBlockHeight(block, language, visualBlockIndex);
    const nextBottom = cursorTop + estimate.height;
    const nextDensity = densityScore + estimate.densityDelta;
    const wouldOverflow =
      nextBottom > CONTENT_BOTTOM ||
      nextDensity > maxDensityScore ||
      currentBlocks.length + 1 > maxBlocksPerPage;

    if (currentBlocks.length > 0 && wouldOverflow) {
      pushPage();
    }

    const blockEstimateOnEmpty = assessExpandedBlockHeight(block, language, 0);
    if (layout.bodyTop + blockEstimateOnEmpty.height > CONTENT_BOTTOM) {
      unpageableBlockTypes.add(block.type);
      continue;
    }

    currentBlocks.push(block);
    cursorTop += estimate.height;
    densityScore += estimate.densityDelta;
    if (estimate.consumesVisualCard) {
      visualBlockIndex += 1;
    }
  }

  pushPage();

  if (pages.length === 0) {
    return {
      pages: [],
      wasSplit: false,
      reasons: ['no_renderable_blocks_after_pagination'],
      unpageableBlockTypes: Array.from(unpageableBlockTypes),
    };
  }

  const totalParts = pages.length;
  return {
    pages: pages.map((pageBlocks, index) => ({
      ...args.document,
      blocks: pageBlocks,
      archetype,
      continuation:
        totalParts > 1 && index > 0
          ? ({
              rootOutlineId: args.rootOutlineId,
              partNumber: index + 1,
              totalParts,
            } satisfies NotebookContentContinuation)
          : undefined,
    })),
    wasSplit: totalParts > 1,
    reasons: totalParts > 1 ? [`split_into_pages:${totalParts}`] : [],
    unpageableBlockTypes: Array.from(unpageableBlockTypes),
  };
}
