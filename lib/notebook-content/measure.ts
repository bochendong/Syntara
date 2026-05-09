/**
 * Measurement layer.
 *
 * This module owns block height estimation, DOM-assisted measurement, and
 * pagination budget heuristics. Layout/render code should consume these values
 * instead of re-implementing geometry guesses inline.
 */
import {
  CARD_INSET_X,
  CARD_INSET_Y,
  CONTENT_BOTTOM,
  CONTENT_WIDTH,
  CJK_TEXT_REGEX,
} from './layout-constants';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { renderInlineLatexToHtml } from './inline-html';
import type { NotebookContentBlock } from './schema';

type LayoutCardsBlock = Extract<NotebookContentBlock, { type: 'layout_cards' }>;
type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;
type CodeTraceBlock = Extract<NotebookContentBlock, { type: 'code_trace' }>;
type StateTableBlock = Extract<NotebookContentBlock, { type: 'state_table' }>;
type CallStackBlock = Extract<NotebookContentBlock, { type: 'call_stack' }>;
type MemoryDiagramBlock = Extract<NotebookContentBlock, { type: 'memory_diagram' }>;
type PointerDiagramBlock = Extract<NotebookContentBlock, { type: 'pointer_diagram' }>;
type TreeDiagramBlock = Extract<NotebookContentBlock, { type: 'tree_diagram' }>;
type GraphTraceBlock = Extract<NotebookContentBlock, { type: 'graph_trace' }>;
type InvariantPanelBlock = Extract<NotebookContentBlock, { type: 'invariant_panel' }>;
type LinearStructureBlock = Extract<NotebookContentBlock, { type: 'linear_structure' }>;

export interface LayoutCardsMeasurement {
  columns: number;
  cellWidth: number;
  gapX: number;
  gapY: number;
  rowHeights: number[];
  totalHeight: number;
}

export interface MeasuredNotebookBlockHeight {
  height: number;
  densityDelta: number;
  consumesVisualCard: boolean;
  measuredWithDom: boolean;
}

export interface NotebookPageUsageEstimate {
  estimatedBottom: number;
  estimatedHeight: number;
  densityScore: number;
  visualBlockCount: number;
}

export interface NotebookMeasurementLayoutSettings {
  bodyTop: number;
}

export interface MeasuredTextBlock {
  height: number;
  measuredWithDom: boolean;
}

const DEFAULT_CARD_ACCENTS = ['#2f6bff', '#7a5af8', '#12b76a', '#475569'] as const;

export function estimateParagraphHeight(
  text: string,
  charsPerLine: number,
  lineHeightPx: number,
): number {
  const lines = Math.max(
    1,
    text
      .split('\n')
      .map((line) => Math.max(1, Math.ceil(line.length / Math.max(charsPerLine, 1))))
      .reduce((sum, value) => sum + value, 0),
  );
  return Math.max(lineHeightPx + 12, lines * lineHeightPx + 18);
}

export function estimateParagraphStackHeight(
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

export function estimateCharsPerLine(text: string, widthPx: number, fontSizePx: number): number {
  const unitWidth = CJK_TEXT_REGEX.test(text) ? fontSizePx * 0.96 : fontSizePx * 0.56;
  return Math.max(12, Math.floor(widthPx / Math.max(unitWidth, 1)));
}

export function estimateParagraphHeightForWidth(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
}): number {
  const maxChars = estimateCharsPerLine(args.text, args.widthPx, args.fontSizePx);
  return estimateParagraphHeight(args.text, maxChars, args.lineHeightPx);
}

export function estimateParagraphStackHeightForWidth(args: {
  items: string[];
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  paragraphSpacePx?: number;
}): number {
  const normalized = args.items.map((item) => item.trim()).filter(Boolean);
  const joined = normalized.join('\n');
  const charsPerLine = estimateCharsPerLine(joined, args.widthPx, args.fontSizePx);
  return estimateParagraphStackHeight(
    normalized,
    charsPerLine,
    args.lineHeightPx,
    args.paragraphSpacePx,
  );
}

export function estimateWrappedLineCount(
  text: string,
  language: 'zh-CN' | 'en-US',
  maxCharsPerLine: number,
): number {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return 0;
  const unitScale = language === 'zh-CN' ? 1 : 0.55;
  return normalized
    .split('\n')
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil((line.length * unitScale) / maxCharsPerLine)),
      0,
    );
}

let htmlMeasureHost: HTMLDivElement | null = null;

function getHtmlMeasureHost(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (htmlMeasureHost && document.body.contains(htmlMeasureHost)) return htmlMeasureHost;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.overflow = 'hidden';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  htmlMeasureHost = host;
  return host;
}

export function measureHtmlHeightIfAvailable(args: {
  html: string;
  widthPx: number;
  fontName?: string;
  lineHeight?: number;
}): number | null {
  const host = getHtmlMeasureHost();
  if (!host) return null;

  const node = document.createElement('div');
  node.style.width = `${Math.max(1, Math.ceil(args.widthPx))}px`;
  node.style.boxSizing = 'border-box';
  node.style.wordBreak = 'break-word';
  node.style.overflowWrap = 'break-word';
  node.style.whiteSpace = 'normal';
  node.style.fontFamily = args.fontName || 'Microsoft YaHei';
  node.style.lineHeight = String(args.lineHeight ?? 1.35);
  node.innerHTML = args.html;
  host.appendChild(node);
  const measured = Math.ceil(node.scrollHeight);
  host.removeChild(node);
  return Number.isFinite(measured) && measured > 0 ? measured : null;
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

export function wrapTextToLines(text: string, maxChars: number): string[] {
  const paragraphs = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const lines = paragraphs.flatMap((paragraph) => wrapLineByWidth(paragraph, maxChars));
  return lines.length > 0 ? lines : [''];
}

export function measureParagraphBlock(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  color?: string;
}): MeasuredTextBlock {
  const normalized = args.text.replace(/\r/g, '').trim();
  const maxChars = estimateCharsPerLine(normalized, args.widthPx, args.fontSizePx);
  const estimatedHeight = estimateParagraphHeight(normalized, maxChars, args.lineHeightPx);
  const paragraphLines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const paragraphHtml =
    paragraphLines.length > 0
      ? paragraphLines.map((line) => renderInlineLatexToHtml(line)).join('<br/>')
      : renderInlineLatexToHtml(normalized);
  const measuredHeight = measureHtmlHeightIfAvailable({
    html: `<p style="font-size:${args.fontSizePx}px;color:${args.color || '#334155'};line-height:${args.lineHeightPx}px;">${paragraphHtml}</p>`,
    widthPx: args.widthPx,
    lineHeight: args.lineHeightPx / Math.max(1, args.fontSizePx),
  });

  return {
    height: measuredHeight ?? estimatedHeight,
    measuredWithDom: measuredHeight !== null,
  };
}

export function measureBulletListBlock(args: {
  items: string[];
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  color?: string;
  bulletColor?: string;
  paragraphGapPx?: number;
}): MeasuredTextBlock {
  const paragraphGapPx = args.paragraphGapPx ?? 5;
  const htmlParts: string[] = [];
  let usedHeight = 18;

  for (const item of args.items) {
    const normalizedItem = item.replace(/\r/g, '').trim();
    if (!normalizedItem) continue;

    const maxChars = estimateCharsPerLine(normalizedItem, args.widthPx - 16, args.fontSizePx);
    const wrapped = wrapTextToLines(normalizedItem, maxChars);
    const gap = htmlParts.length > 0 ? paragraphGapPx : 0;
    const logicalLines = normalizedItem
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const lineHtml = logicalLines
      .map((line, index) =>
        index === 0
          ? `<span style="color:${args.bulletColor || '#475569'};font-weight:700;">•</span> ${renderInlineLatexToHtml(line)}`
          : `${'&nbsp;'.repeat(4)}${renderInlineLatexToHtml(line)}`,
      )
      .join('<br/>');
    const estimatedLineCount = Math.max(1, wrapped.length);

    htmlParts.push(
      `<p style="font-size:${args.fontSizePx}px;color:${args.color || '#334155'};line-height:${args.lineHeightPx}px;">${lineHtml}</p>`,
    );
    usedHeight += gap + estimatedLineCount * args.lineHeightPx;
  }

  const estimatedHeight = Math.max(args.lineHeightPx + 12, usedHeight);
  const measuredHeight = measureHtmlHeightIfAvailable({
    html: htmlParts.join(''),
    widthPx: args.widthPx,
    lineHeight: args.lineHeightPx / Math.max(1, args.fontSizePx),
  });

  return {
    height: measuredHeight ?? estimatedHeight,
    measuredWithDom: measuredHeight !== null,
  };
}

export function measureParagraphHeightIfAvailable(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  color: string;
}): number | null {
  const measured = measureParagraphBlock(args);
  return measured.measuredWithDom ? measured.height : null;
}

export function estimateGridHeadingHeight(args: {
  text: string;
  widthPx: number;
  fontSizePx?: number;
  lineHeightPx?: number;
}): number {
  const fontSizePx = args.fontSizePx ?? 16;
  const lineHeightPx = args.lineHeightPx ?? 22;
  if (!args.text.trim()) return 0;

  const maxChars = estimateCharsPerLine(args.text, args.widthPx, fontSizePx);
  const wrapped = wrapTextToLines(args.text, maxChars);
  return Math.max(24, wrapped.length * lineHeightPx + 8);
}

function resolveLayoutCardsVisualColumns(columns: 2 | 3 | 4): number {
  return columns === 4 ? 2 : columns;
}

export function measureLayoutCardsLayout(args: {
  items: LayoutCardsBlock['items'];
  columns: 2 | 3 | 4;
}): LayoutCardsMeasurement {
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

  const parsedColumns = Number(args.columns);
  const requestedColumns = resolveLayoutCardsVisualColumns(
    parsedColumns === 2 || parsedColumns === 3 || parsedColumns === 4 ? parsedColumns : 2,
  );
  let columns =
    args.items.length === 1 ? 1 : Math.max(1, Math.min(requestedColumns, args.items.length));
  if (args.items.length === 2 && requestedColumns >= 2) {
    columns = 2;
  }

  const gapX = 10;
  const gapY = 10;
  const cellWidth = (CONTENT_WIDTH - Math.max(0, columns - 1) * gapX) / columns;
  const rowCount = Math.ceil(args.items.length / columns);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  args.items.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const bodyHeight = measureParagraphBlock({
      text: item.text,
      widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
      fontSizePx: 14,
      lineHeightPx: 18,
    }).height;
    const titleHeight = measureParagraphBlock({
      text: item.title,
      widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
      fontSizePx: 13,
      lineHeightPx: 18,
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

export function estimateProcessFlowSummaryHeight(summary: string, widthPx: number): number {
  return (
    measureParagraphBlock({
      text: summary,
      widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
    }).height + 26
  );
}

export function estimateProcessFlowStepCardHeight(args: {
  step: ProcessFlowBlock['steps'][number];
  widthPx: number;
  orientation: ProcessFlowBlock['orientation'];
}): number {
  const titleHeight = estimateGridHeadingHeight({
    text: args.step.title,
    widthPx: args.widthPx,
  });
  const detailHeight = measureParagraphBlock({
    text: args.step.detail,
    widthPx: args.widthPx,
    fontSizePx: args.orientation === 'horizontal' ? 13 : 14,
    lineHeightPx: args.orientation === 'horizontal' ? 18 : 20,
  }).height;
  const noteHeight = args.step.note
    ? measureParagraphBlock({
        text: args.step.note,
        widthPx: args.widthPx,
        fontSizePx: 12,
        lineHeightPx: 16,
        color: '#475569',
      }).height + 6
    : 0;

  return Math.max(
    args.orientation === 'horizontal' ? 112 : 84,
    titleHeight + detailHeight + noteHeight + 28,
  );
}

export function estimateProcessFlowBlockHeight(args: {
  block: ProcessFlowBlock;
  language: 'zh-CN' | 'en-US';
}): number {
  const context = Array.isArray(args.block.context) ? args.block.context : [];
  const steps = Array.isArray(args.block.steps) ? args.block.steps : [];
  const titleHeight = args.block.title ? 34 : 0;
  const contextCards = processFlowContextToLayoutCardsBlock(context);
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
    const gapX = steps.length > 3 ? 14 : 18;
    const stepWidth =
      (CONTENT_WIDTH - Math.max(0, steps.length - 1) * gapX) / Math.max(steps.length, 1);
    const innerWidth = Math.max(104, stepWidth - CARD_INSET_X * 2);
    const stepHeight = Math.max(
      112,
      ...steps.map((step) =>
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
  const stepHeights = steps.map((step) =>
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

function estimateCodeTraceBlockHeight(block: CodeTraceBlock): number {
  const codeHeight = estimateCodeBlockHeight(block.code, 1);
  const inputs = block.inputs || [];
  const stepText = block.steps.map((step) =>
    [step.explanation, ...step.state.map((state) => `${state.name}=${state.value}`)].join(' '),
  );
  const maxStepHeight = Math.max(
    0,
    ...stepText.map((text) =>
      estimateParagraphStackHeightForWidth({
        items: [text],
        widthPx: Math.max(220, CONTENT_WIDTH * 0.38),
        fontSizePx: 13,
        lineHeightPx: 18,
        paragraphSpacePx: 6,
      }),
    ),
  );
  const inputHeight = inputs.length
    ? estimateParagraphStackHeightForWidth({
        items: [inputs.map((input) => `${input.name}=${input.value}`).join(' ')],
        widthPx: Math.max(220, CONTENT_WIDTH * 0.38),
        fontSizePx: 12,
        lineHeightPx: 16,
        paragraphSpacePx: 0,
      }) + 32
    : 0;
  const outputHeight = block.output ? estimateCodeBlockHeight(block.output, 1) + 10 : 0;
  return Math.max(codeHeight, inputHeight + maxStepHeight + outputHeight + 58) + 64;
}

function estimateStateTableBlockHeight(block: StateTableBlock): number {
  return Math.min(360, Math.max(82, (block.rows.length + 1) * 34 + 34)) + (block.caption ? 20 : 0);
}

function estimateCallStackBlockHeight(block: CallStackBlock): number {
  const framesHeight = block.frames.reduce((sum, frame) => {
    const detailLines =
      Math.ceil((frame.args.length + frame.locals.length) / 3) +
      (frame.returnValue || frame.note ? 1 : 0);
    return sum + Math.max(62, 48 + detailLines * 24);
  }, 0);
  return Math.min(420, framesHeight + Math.max(0, block.frames.length - 1) * 8 + 48);
}

function estimateMemoryDiagramBlockHeight(block: MemoryDiagramBlock): number {
  const frameRows = block.frames.reduce(
    (sum, frame) => sum + Math.max(1, frame.variables.length),
    0,
  );
  const stackRows = Math.max(1, frameRows || block.stack.length);
  const heapRows = Math.max(1, Math.ceil(block.heap.length / 2));
  const linkRows = block.links.length ? Math.ceil(block.links.length / 4) : 0;
  if (block.steps.length || block.code) {
    const codeLines = block.code ? block.code.replace(/\r\n/g, '\n').split('\n').length : 0;
    const codeHeight = block.code ? Math.min(240, 54 + codeLines * 22) : 0;
    const stepHeight = block.steps.length ? 88 : 0;
    return Math.min(
      560,
      126 + codeHeight + stepHeight + Math.max(stackRows * 34, heapRows * 86) + linkRows * 28,
    );
  }
  return Math.min(420, 74 + Math.max(stackRows * 34, heapRows * 86) + linkRows * 28);
}

function estimatePointerDiagramBlockHeight(block: PointerDiagramBlock): number {
  const steps = block.steps || [];
  const stepNodes = steps.flatMap((step) => step.nodes);
  const nodes = stepNodes.length ? stepNodes : block.nodes;
  const fieldRows = Math.max(0, ...nodes.map((node) => Math.ceil(node.fields.length / 2)));
  if (steps.length) {
    return Math.min(480, 204 + fieldRows * 26 + (block.caption ? 20 : 0));
  }
  return Math.min(360, 112 + fieldRows * 26 + (block.caption ? 20 : 0));
}

function estimateTreeDiagramBlockHeight(block: TreeDiagramBlock): number {
  const nodeChildren = (node: TreeDiagramBlock['nodes'][number]) =>
    (node.children || []).length
      ? node.children || []
      : [node.left, node.right].filter((child): child is string => Boolean(child));
  const childIds = new Set(block.nodes.flatMap(nodeChildren));
  const rootId =
    block.rootId || block.nodes.find((node) => !childIds.has(node.id))?.id || block.nodes[0]?.id;
  const nodeMap = new Map(block.nodes.map((node) => [node.id, node]));
  const visitDepth = (id: string | undefined, depth = 1, visited = new Set<string>()): number => {
    if (!id || visited.has(id)) return depth - 1;
    const node = nodeMap.get(id);
    if (!node) return depth - 1;
    const nextVisited = new Set(visited);
    nextVisited.add(id);
    const children = nodeChildren(node);
    return Math.max(depth, ...children.map((child) => visitDepth(child, depth + 1, nextVisited)));
  };
  const depth = visitDepth(rootId);
  const steps = block.steps || [];
  return Math.min(
    steps.length ? 560 : 470,
    94 +
      depth * 76 +
      (steps.length
        ? 128
        : block.kind === 'bst' && (block.target || block.decision || block.path.length)
          ? 74
          : 0) +
      (block.invariant ? 42 : 0) +
      (block.caption ? 20 : 0),
  );
}

function estimateGraphTraceBlockHeight(block: GraphTraceBlock): number {
  const steps = block.steps || [];
  const adjacencyRows = Math.ceil(block.nodes.length / 3);
  return Math.min(560, (steps.length ? 430 : 340) + adjacencyRows * 22 + (block.caption ? 20 : 0));
}

function estimateInvariantPanelBlockHeight(block: InvariantPanelBlock): number {
  const checkText = block.checks.map((check) =>
    [check.label, check.text, check.reason || ''].join(' '),
  );
  const checksHeight = estimateParagraphStackHeightForWidth({
    items: checkText,
    widthPx: Math.max(240, CONTENT_WIDTH * 0.46),
    fontSizePx: 13,
    lineHeightPx: 19,
    paragraphSpacePx: 8,
  });
  return Math.min(360, 108 + checksHeight + (block.caption ? 20 : 0));
}

function estimateLinearStructureBlockHeight(block: LinearStructureBlock): number {
  const steps = block.steps || [];
  const stepItems = steps.flatMap((step) => step.items);
  const items = stepItems.length ? stepItems : block.items;
  const itemRows = block.kind === 'stack' ? Math.max(1, items.length) : Math.ceil(items.length / 5);
  return Math.min(
    steps.length ? 520 : 390,
    128 +
      itemRows * (block.kind === 'stack' ? 46 : 58) +
      (steps.length ? 96 : 0) +
      (block.caption ? 24 : 0),
  );
}

export function assessExpandedBlockHeight(
  block: NotebookContentBlock,
  language: 'zh-CN' | 'en-US',
  visualBlockIndex: number,
): MeasuredNotebookBlockHeight {
  if (block.type === 'heading') {
    const height = block.level <= 2 ? 34 : 28;
    return {
      height: height + 10,
      densityDelta: block.level <= 2 ? 0.55 : 0.35,
      consumesVisualCard: false,
      measuredWithDom: false,
    };
  }

  if (block.type === 'paragraph') {
    const paragraph = measureParagraphBlock({
      text: block.text,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
      fontSizePx: 16,
      lineHeightPx: 22,
    });
    return {
      height: paragraph.height + CARD_INSET_Y * 2 + 10,
      densityDelta: 0.9 + Math.min(0.95, block.text.length / 850),
      consumesVisualCard: true,
      measuredWithDom: paragraph.measuredWithDom,
    };
  }

  if (block.type === 'bullet_list') {
    const bulletList = measureBulletListBlock({
      items: block.items,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
      fontSizePx: 16,
      lineHeightPx: 20,
      bulletColor: DEFAULT_CARD_ACCENTS[visualBlockIndex % DEFAULT_CARD_ACCENTS.length],
    });
    const totalChars = block.items.reduce((sum, item) => sum + item.length, 0);
    return {
      height: bulletList.height + CARD_INSET_Y * 2 + 10,
      densityDelta: 1.1 + block.items.length * 0.18 + Math.min(0.8, totalChars / 1600),
      consumesVisualCard: true,
      measuredWithDom: bulletList.measuredWithDom,
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
      measuredWithDom: false,
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
      measuredWithDom: false,
    };
  }

  if (block.type === 'code_block') {
    const lineCount = block.code.split('\n').length;
    return {
      height: estimateCodeBlockHeight(block.code, block.caption ? 1 : 0) + 12,
      densityDelta: 1.6 + Math.min(1.2, lineCount * 0.08),
      consumesVisualCard: true,
      measuredWithDom: false,
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
      measuredWithDom: false,
    };
  }

  if (block.type === 'code_trace') {
    return {
      height: estimateCodeTraceBlockHeight(block),
      densityDelta:
        2.6 +
        Math.min(1.1, block.code.split('\n').length * 0.05) +
        Math.min(1.1, block.steps.length * 0.22),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'state_table') {
    return {
      height: estimateStateTableBlockHeight(block),
      densityDelta:
        1.6 + Math.min(1.0, block.rows.length * 0.08) + Math.min(0.8, block.columns.length * 0.08),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'call_stack') {
    return {
      height: estimateCallStackBlockHeight(block),
      densityDelta: 1.9 + Math.min(1.2, block.frames.length * 0.18),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'memory_diagram') {
    return {
      height: estimateMemoryDiagramBlockHeight(block),
      densityDelta:
        2.0 +
        Math.min(0.9, block.stack.length * 0.12) +
        Math.min(0.9, block.frames.length * 0.18) +
        Math.min(0.9, block.heap.length * 0.14) +
        (block.steps.length ? 0.9 : 0),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'pointer_diagram') {
    return {
      height: estimatePointerDiagramBlockHeight(block),
      densityDelta:
        1.85 +
        Math.min(1.0, block.nodes.length * 0.12) +
        Math.min(0.75, block.pointers.length * 0.12),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'tree_diagram') {
    return {
      height: estimateTreeDiagramBlockHeight(block),
      densityDelta: 2.05 + Math.min(1.2, block.nodes.length * 0.08),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'graph_trace') {
    return {
      height: estimateGraphTraceBlockHeight(block),
      densityDelta: 2.2 + Math.min(1.4, block.nodes.length * 0.08 + block.edges.length * 0.03),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'invariant_panel') {
    return {
      height: estimateInvariantPanelBlockHeight(block),
      densityDelta: 1.8 + Math.min(1.0, block.checks.length * 0.18),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'dictionary_diagram') {
    const rowCount = Math.ceil(block.entries.length / 2);
    const textChars =
      (block.title || '').length +
      (block.operation || '').length +
      (block.result || '').length +
      (block.caption || '').length +
      block.entries.reduce(
        (sum, entry) => sum + entry.key.length + entry.value.length + (entry.note || '').length,
        0,
      );
    return {
      height: 92 + rowCount * 58 + (block.result || block.caption ? 58 : 0),
      densityDelta:
        1.85 + Math.min(1.0, block.entries.length * 0.12) + Math.min(0.8, textChars / 720),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'linear_structure') {
    return {
      height: estimateLinearStructureBlockHeight(block),
      densityDelta:
        1.8 + Math.min(1.0, block.items.length * 0.12 + (block.steps || []).length * 0.1),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'process_flow') {
    const context = Array.isArray(block.context) ? block.context : [];
    const steps = Array.isArray(block.steps) ? block.steps : [];
    const stepDetailChars = steps.reduce((sum, step) => sum + step.detail.length, 0);
    return {
      height: estimateProcessFlowBlockHeight({ block, language }),
      densityDelta:
        2.2 +
        Math.min(1.35, steps.length * 0.24) +
        Math.min(0.85, context.length * 0.2) +
        Math.min(0.95, stepDetailChars / 680),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'layout_cards') {
    const measured = measureLayoutCardsLayout({
      items: block.items,
      columns: block.columns,
    });
    const normalizedColumns = Number(block.columns);
    const textChars = block.items.reduce(
      (sum, item) => sum + item.text.length + item.title.length,
      0,
    );
    const compactPenalty = normalizedColumns === 2 && block.items.length >= 4 ? 0.75 : 0.35;
    return {
      height: measured.totalHeight + (block.title ? 34 : 0) + 12,
      densityDelta:
        1.35 +
        Math.min(0.95, block.items.length * 0.24) +
        compactPenalty +
        Math.min(0.8, textChars / 980),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'table') {
    const rowCount = block.rows.length + (block.headers?.length ? 1 : 0);
    const colCount = Math.max(
      block.headers?.length ?? 0,
      ...block.rows.map((row) => row.length),
      1,
    );
    const maxCellLength = block.rows.reduce(
      (currentMax, row) => Math.max(currentMax, ...row.map((cell) => cell.length)),
      0,
    );
    return {
      height: Math.min(220, Math.max(72, rowCount * 34 + 12)) + (block.caption ? 38 : 12),
      densityDelta: 1.7 + rowCount * 0.15 + colCount * 0.1 + Math.min(0.9, maxCellLength / 180),
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'callout') {
    const measuredTextHeight = measureParagraphHeightIfAvailable({
      text: block.text,
      widthPx: CONTENT_WIDTH - 22 - 10,
      fontSizePx: 15,
      lineHeightPx: 21,
      color: '#334155',
    });
    return {
      height:
        (measuredTextHeight ?? estimateParagraphHeight(block.text, 36, 20)) +
        (block.title ? 28 : 12) +
        12,
      densityDelta: 0.95 + Math.min(0.75, block.text.length / 900),
      consumesVisualCard: true,
      measuredWithDom: measuredTextHeight !== null,
    };
  }

  if (block.type === 'definition') {
    const measuredTextHeight = measureParagraphHeightIfAvailable({
      text: block.text,
      widthPx: CONTENT_WIDTH - 22 - 10,
      fontSizePx: 15,
      lineHeightPx: 21,
      color: '#334155',
    });
    return {
      height: (measuredTextHeight ?? estimateParagraphHeight(block.text, 36, 20)) + 40,
      densityDelta: 1.0 + Math.min(0.7, block.text.length / 1000),
      consumesVisualCard: true,
      measuredWithDom: measuredTextHeight !== null,
    };
  }

  if (block.type === 'theorem') {
    const supportLength = block.proofIdea?.length ?? 0;
    const combinedText = supportLength > 0 ? `${block.text}\n${block.proofIdea}` : block.text;
    const measuredTextHeight = measureParagraphHeightIfAvailable({
      text: combinedText,
      widthPx: CONTENT_WIDTH - 22 - 10,
      fontSizePx: 15,
      lineHeightPx: 21,
      color: '#334155',
    });
    return {
      height: (measuredTextHeight ?? estimateParagraphHeight(combinedText, 36, 20)) + 40,
      densityDelta: 1.15 + Math.min(0.85, (block.text.length + supportLength) / 1200),
      consumesVisualCard: true,
      measuredWithDom: measuredTextHeight !== null,
    };
  }

  if (block.type === 'chem_formula' || block.type === 'chem_equation') {
    return {
      height: 34 + (block.caption ? 24 : 0) + CARD_INSET_Y * 2 + 10,
      densityDelta: 1.05,
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  if (block.type === 'visual') {
    return {
      height: 220,
      densityDelta: 1.2,
      consumesVisualCard: true,
      measuredWithDom: false,
    };
  }

  return {
    height: language === 'en-US' ? 110 : 100,
    densityDelta: 1.0,
    consumesVisualCard: true,
    measuredWithDom: false,
  };
}

export function toRenderAwareBudgetHeight(args: {
  block: NotebookContentBlock;
  measuredHeight: number;
  measuredWithDom: boolean;
}): number {
  if (args.measuredWithDom) {
    return Math.max(40, Math.ceil(args.measuredHeight));
  }

  let factor = 1;
  switch (args.block.type) {
    case 'paragraph':
    case 'bullet_list':
      factor = 0.88;
      break;
    case 'callout':
    case 'definition':
    case 'theorem':
      factor = 0.9;
      break;
    case 'layout_cards':
      factor = 0.92;
      break;
    case 'process_flow':
    case 'table':
      factor = 0.94;
      break;
    default:
      factor = 1;
  }

  return Math.max(40, Math.ceil(args.measuredHeight * factor));
}

export function assessPageUsage(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  layout: NotebookMeasurementLayoutSettings;
}): NotebookPageUsageEstimate {
  let cursorTop = args.layout.bodyTop;
  let visualBlockIndex = 0;
  let densityScore = 0.5;

  for (const block of args.blocks) {
    const estimate = assessExpandedBlockHeight(block, args.language, visualBlockIndex);
    cursorTop += toRenderAwareBudgetHeight({
      block,
      measuredHeight: estimate.height,
      measuredWithDom: estimate.measuredWithDom,
    });
    densityScore += estimate.densityDelta;
    if (estimate.consumesVisualCard) {
      visualBlockIndex += 1;
    }
  }

  return {
    estimatedBottom: cursorTop,
    estimatedHeight: Math.max(0, cursorTop - args.layout.bodyTop),
    densityScore,
    visualBlockCount: visualBlockIndex,
  };
}

export function calcSparsePenalty(args: {
  blocks: NotebookContentBlock[];
  usage: NotebookPageUsageEstimate;
  baseBodyHeight: number;
}): number {
  if (args.blocks.length === 0) return 9;

  const fillRatio = args.usage.estimatedHeight / Math.max(1, args.baseBodyHeight);
  let penalty = 0;
  if (args.blocks.length === 1) penalty += 5.5;
  if (args.blocks.length === 2 && fillRatio < 0.36) penalty += 1.8;
  if (fillRatio < 0.26) penalty += 2.8;
  else if (fillRatio < 0.36) penalty += 1.4;
  else if (fillRatio < 0.48) penalty += 0.7;
  return penalty;
}

export function getBaseBodyHeight(bodyTop: number): number {
  return Math.max(1, CONTENT_BOTTOM - bodyTop);
}
