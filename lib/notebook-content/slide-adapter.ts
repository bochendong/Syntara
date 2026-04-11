import katex from 'katex';
import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTLatexElement,
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
  NotebookContentContinuation,
  NotebookContentDocument,
  NotebookContentProfile,
  NotebookSlideArchetype,
} from './schema';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { chemistryTextToHtml } from './chemistry';
import { resolveNotebookContentProfile } from './profile';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const CONTENT_LEFT = 64;
const CONTENT_WIDTH = 872;
const CONTENT_BOTTOM = 522;
const CARD_INSET_X = 18;
const CARD_INSET_Y = 12;
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
const DEFAULT_ARCHETYPE: NotebookSlideArchetype = 'concept';
const ARCHETYPE_ALLOWED_BLOCKS: Record<NotebookSlideArchetype, NotebookContentBlock['type'][]> = {
  intro: ['heading', 'paragraph', 'bullet_list', 'callout', 'definition', 'theorem', 'equation'],
  concept: [
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
    'chem_formula',
    'chem_equation',
  ],
  bridge: [
    'heading',
    'paragraph',
    'bullet_list',
    'equation',
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
        { fill: '#ecfeff', border: '#99f6e4', accent: '#0f766e' },
        { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' },
        { fill: '#f8fafc', border: '#cbd5e1', accent: '#334155' },
        { fill: '#f0fdf4', border: '#bbf7d0', accent: '#16a34a' },
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
        { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' },
        { fill: '#eef2ff', border: '#c7d2fe', accent: '#4f46e5' },
        { fill: '#f8fafc', border: '#cbd5e1', accent: '#475569' },
        { fill: '#effcf6', border: '#bbf7d0', accent: '#16a34a' },
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
      { fill: '#eef4ff', border: '#c7d7fe', accent: '#4f46e5' },
      { fill: '#ecfeff', border: '#bae6fd', accent: '#0891b2' },
      { fill: '#f8f5ff', border: '#d8b4fe', accent: '#7c3aed' },
      { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' },
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

function clampWrappedLines(lines: string[], maxLines: number, maxChars: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const tail = [kept[maxLines - 1], ...lines.slice(maxLines)].join(' ');
  kept[maxLines - 1] = ellipsizeLine(tail, maxChars);
  return kept;
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
  const maxLines = Math.max(1, Math.floor((args.maxHeightPx - 18) / args.lineHeightPx));
  const fittedLines = clampWrappedLines(wrapped, maxLines, maxChars);
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
    const remainingHeight = args.maxHeightPx - usedHeight - gap;
    const maxLines = Math.floor(remainingHeight / args.lineHeightPx);
    if (maxLines <= 0) break;

    const fittedLines = clampWrappedLines(wrapped, maxLines, maxChars);
    const truncated = fittedLines.length < wrapped.length;
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

    if (truncated) break;
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
    text: args.text,
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
}): PPTShapeElement {
  return createRectShape({
    left: CONTENT_LEFT,
    top: args.top,
    width: CONTENT_WIDTH,
    height: args.height,
    fill: args.tone.fill,
    outlineColor: args.tone.border,
    text: createShapeText({
      html: args.html,
      color: args.color,
      fontName: args.fontName,
      textType: args.textType,
      lineHeight: args.lineHeight,
      paragraphSpace: args.paragraphSpace,
      align: 'top',
    }),
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

    preSplitBlocks.push(block);
  }

  return expandBlocks(preSplitBlocks, language);
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
  const layout = getArchetypeLayoutSettings(archetype);
  const tokens = getProfileTokens(profile);
  const cardPalettes = tokens.cardPalettes;
  const blocks = expandBlocks(args.document.blocks, language);
  const elements: PPTElement[] = [];

  elements.push(
    createRectShape({
      left: CONTENT_LEFT,
      top: layout.titleTop + 4,
      width: 10,
      height: layout.accentHeight,
      fill: tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT + 22,
      top: layout.titleTop,
      width: CONTENT_WIDTH - 22,
      height: layout.titleHeight,
      html: `<p style="font-size:${layout.titleFontSize}px;"><strong>${renderInlineLatexToHtml(args.document.title || args.fallbackTitle)}</strong></p>`,
      color: tokens.titleText,
      textType: 'title',
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
        top: layout.titleTop + 6,
        width: 158,
        height: 24,
        fill: '#eef2ff',
        outlineColor: '#c7d2fe',
      }),
      createTextElement({
        left: CONTENT_LEFT + CONTENT_WIDTH - 170,
        top: layout.titleTop + 8,
        width: 142,
        height: 20,
        html: `<p style="font-size:12px;color:#4f46e5;text-align:center;"><strong>${escapeHtml(chipLabel)}</strong></p>`,
        color: '#4f46e5',
        textType: 'notes',
      }),
    );
  }

  let cursorTop = layout.bodyTop;
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
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxContentHeight = Math.max(28, remainingHeight - CARD_INSET_Y * 2);
      const paragraph = fitParagraphBlockToHeight({
        text: block.text,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 22,
        maxHeightPx: maxContentHeight,
        color: '#334155',
      });
      const contentHeight = paragraph.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: paragraph.html,
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
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxContentHeight = Math.max(40, remainingHeight - CARD_INSET_Y * 2);
      const bulletList = fitBulletListBlockToHeight({
        items: block.items,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 20,
        maxHeightPx: maxContentHeight,
        color: '#334155',
        bulletColor: tone.accent,
      });
      const contentHeight = bulletList.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: bulletList.html,
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
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const contentHeight = estimateLatexDisplayHeight(block.latex, block.display);
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + (block.caption ? 22 : 0);
      const groupId = createCardGroupId('equation_card');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: cardHeight,
          fill: tone.fill,
          outlineColor: tone.border,
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
            color: '#64748b',
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'matrix') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
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
          fill: tone.fill,
          outlineColor: tone.border,
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
            color: '#64748b',
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

      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
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
      const tonePalette = {
        info: { fill: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
        success: { fill: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
        warning: { fill: '#fff7ed', border: '#fdba74', text: '#c2410c' },
        danger: { fill: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
        tip: { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
      }[block.tone];
      const height = estimateParagraphHeight(block.text, 36, 20) + (block.title ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: tonePalette.fill,
          outlineColor: tonePalette.border,
          text: createShapeText({
            html: [
              block.title
                ? `<p style="font-size:15px;color:${tonePalette.text};"><strong>${renderInlineLatexToHtml(block.title)}</strong></p>`
                : '',
              `<p style="font-size:15px;color:${tonePalette.text};">${renderInlineLatexToHtml(block.text)}</p>`,
            ]
              .filter(Boolean)
              .join(''),
            color: tonePalette.text,
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
      const tonePalette =
        block.type === 'definition'
          ? { fill: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' }
          : { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' };
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
          fill: tonePalette.fill,
          outlineColor: tonePalette.border,
          text: createShapeText({
            html: [
              `<p style="font-size:15px;color:${tonePalette.text};"><strong>${renderInlineLatexToHtml(block.title || (language === 'en-US' ? (block.type === 'definition' ? 'Definition' : 'Theorem') : block.type === 'definition' ? '定义' : '定理'))}</strong></p>`,
              `<p style="font-size:15px;color:#334155;">${renderInlineLatexToHtml(block.text)}</p>`,
              supportText
                ? `<p style="font-size:14px;color:${tonePalette.text};">${renderInlineLatexToHtml(supportText)}</p>`
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
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
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
    elements: normalizeSlideTextLayout(elements, {
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
