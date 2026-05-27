import { nanoid } from 'nanoid';
import type { PPTElement, PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';
import { normalizeLatexSource } from '@/lib/latex-utils';
import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
  NotebookContentProfile,
  NotebookContentSlot,
  NotebookContentTextTemplate,
  NotebookContentTitleTone,
  NotebookContentVisualSlot,
} from './schema';
import { matrixBlockToLatex } from './block-utils';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CARD_INSET_X,
  CARD_INSET_Y,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  GRID_GAP_Y,
  GRID_MAX_AUTO_STRETCH_PER_ROW,
  STACK_UNDERFILL_THRESHOLD,
} from './layout-constants';
import {
  estimateParagraphHeightForWidth,
  estimateParagraphStackHeightForWidth,
  estimateProcessFlowStepCardHeight,
  measureLayoutCardsLayout,
  measureParagraphBlock,
} from './measure';
import {
  createCircleShape,
  createLineElement,
  createRectShape,
  createShapeText,
  createTextElement,
} from './slide-element-factory';
import { resolveDocumentArchetype } from './slide-layout-resolvers';
import {
  blockToGridBody,
  blockToGridHeading,
  fitGridHeadingToHeight,
  fitParagraphBlockToHeight,
} from './slide-grid-copy';
import type { SlotTemplateSpec } from './slot-template-registry';

import {
  ACADEMY_PAPER,
  CLASSIC_BUSINESS,
  CLASSIC_DECK_STYLES,
  type ClassicDeckStylePreset,
  type ContentCardTone,
  type LayoutCardsBlock,
  type ProcessFlowBlock,
} from './slide-adapter-theme';
export { ACADEMY_PAPER, CLASSIC_BUSINESS, CLASSIC_DECK_STYLES } from './slide-adapter-theme';
export type {
  ClassicDeckStylePreset,
  ContentCardTone,
  LayoutCardsBlock,
  ProcessFlowBlock,
} from './slide-adapter-theme';

export function getClassicDeckStyle(document: NotebookContentDocument): ClassicDeckStylePreset {
  return CLASSIC_DECK_STYLES[document.deckStyle || 'classic_business'];
}

export function classicColorReplacements(
  style: ClassicDeckStylePreset,
): readonly (readonly [string, string])[] {
  return [
    [CLASSIC_BUSINESS.titleText, style.titleText],
    [CLASSIC_BUSINESS.bodyText, style.bodyText],
    [CLASSIC_BUSINESS.mutedText, style.mutedText],
    [CLASSIC_BUSINESS.border, style.border],
    [CLASSIC_BUSINESS.subtleBorder, style.subtleBorder],
    [CLASSIC_BUSINESS.panelFill, style.panelFill],
    [CLASSIC_BUSINESS.panelFillWarm, style.panelFillWarm],
    [CLASSIC_BUSINESS.panelFillGreen, style.panelFillGreen],
    [CLASSIC_BUSINESS.panelFillBlue, style.panelFillBlue],
    [CLASSIC_BUSINESS.blue, style.blue],
    [CLASSIC_BUSINESS.red, style.red],
    [CLASSIC_BUSINESS.yellow, style.yellow],
    [CLASSIC_BUSINESS.green, style.green],
    [CLASSIC_BUSINESS.teal, style.teal],
    [CLASSIC_BUSINESS.shadow, style.shadow],
    ['#dbeafe', style.panelFillBlue],
    ['#bfdbfe', style.borderBlue],
    ['#dcfce7', style.panelFillGreen],
    ['#bbf7d0', style.borderGreen],
    ['#fef3c7', style.panelFillWarm],
    ['#fde68a', style.borderWarm],
    ['#fee2e2', style.panelFillRed],
    ['#fecaca', style.borderRed],
    ['#fff7ed', style.panelFillWarm],
    ['#fed7aa', style.borderWarm],
    ['#eff6ff', style.panelFillBlue],
    ['#ecfdf5', style.panelFillGreen],
    ['#e5e7eb', style.tableHeaderFill],
    ['#f9fafb', style.tableStripeFill],
    ['#ffffff', style.tableFill],
    ['#f8fafc', style.panelFill],
    ['#dbe4f0', style.border],
    ['#6b7280', style.mutedText],
    ['#a16207', style.yellow],
    ['#c2410c', style.red],
  ] as const;
}

export function replaceClassicStyleString(
  value: string,
  replacements: readonly (readonly [string, string])[],
): string {
  const activeReplacements = replacements.filter(([from, to]) => from !== to);
  let current = value;
  activeReplacements.forEach(([from], index) => {
    current = current.split(from).join(`__classic_color_${index}__`);
  });
  activeReplacements.forEach(([, to], index) => {
    current = current.split(`__classic_color_${index}__`).join(to);
  });
  return current;
}

export function retintClassicValue(
  value: unknown,
  replacements: readonly (readonly [string, string])[],
  key?: string,
): unknown {
  if (typeof value === 'string') {
    return key === 'src' ? value : replaceClassicStyleString(value, replacements);
  }
  if (Array.isArray(value)) {
    return value.map((item) => retintClassicValue(item, replacements));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      retintClassicValue(entryValue, replacements, entryKey),
    ]),
  );
}

export function retintClassicElements(
  elements: PPTElement[],
  style: ClassicDeckStylePreset,
): PPTElement[] {
  if (style.id === 'classic_business') return elements;
  const replacements = classicColorReplacements(style);
  return elements.map((element) => retintClassicValue(element, replacements) as PPTElement);
}

export type NotebookSlotLayoutIssue = {
  code:
    | 'unknown_template'
    | 'unknown_slot'
    | 'slot_block_type'
    | 'slot_block_count'
    | 'slot_weight'
    | 'template_block_count'
    | 'template_weight';
  slotId?: string;
  message: string;
};

export class NotebookSlotLayoutError extends Error {
  readonly code = 'LAYOUT_COMPILE_FAILED';
  readonly issues: NotebookSlotLayoutIssue[];

  constructor(message: string, issues: NotebookSlotLayoutIssue[]) {
    super(message);
    this.name = 'NotebookSlotLayoutError';
    this.issues = issues;
  }
}

export function isNotebookSlotLayoutError(error: unknown): error is NotebookSlotLayoutError {
  return error instanceof NotebookSlotLayoutError;
}

export function isSlotOnlyDocument(document: NotebookContentDocument): boolean {
  return document.version === 2 && Boolean(document.slots?.length);
}

export function toFlowStepLabel(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
  index: number,
): string {
  const heading = blockToGridHeading(language, block).trim();
  if (heading) return heading;
  return language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`;
}

export function toFlowStepDetail(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string {
  const lines = blockToGridBody(language, block)
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 0) return lines.join('；');
  return language === 'en-US' ? 'Continue with this stage.' : '继续推进这一阶段。';
}

export function buildFlowPatternBlock(args: {
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
    summary:
      args.language === 'en-US' ? 'Follow this sequence in class.' : '授课时按这个顺序推进。',
  };
}

export function resolveBlockTemplateTone(
  templateId: NotebookContentTextTemplate | undefined,
  fallbackTone: ContentCardTone,
): ContentCardTone {
  if (!templateId) return fallbackTone;
  switch (templateId) {
    case 'plain':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: ACADEMY_PAPER.border,
        accent: fallbackTone.accent,
      };
    case 'infoCard':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: ACADEMY_PAPER.blueBorder,
        accent: ACADEMY_PAPER.primary,
      };
    case 'successCard':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: 'rgba(79,174,132,0.26)',
        accent: ACADEMY_PAPER.green,
      };
    case 'warningCard':
      return {
        fill: ACADEMY_PAPER.cardFillSoft,
        border: 'rgba(214,168,79,0.34)',
        accent: '#d69a45',
      };
    case 'accentCard':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: 'rgba(150,126,210,0.28)',
        accent: ACADEMY_PAPER.purple,
      };
    default:
      return fallbackTone;
  }
}

export function resolveCardTitleColor(
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

export function getProfileTokens(profile: NotebookContentProfile) {
  if (profile === 'code') {
    return {
      titleAccent: '#0f766e',
      titleText: '#0f172a',
      themeColors: ['#0f766e', '#0f172a', '#155e75', '#334155'],
      backgroundColors: ['#f7fffd', '#f8fafc', '#ecfeff'],
      cardPalettes: [
        {
          fill: ACADEMY_PAPER.cardFill,
          border: ACADEMY_PAPER.blueBorder,
          accent: ACADEMY_PAPER.primary,
        },
        {
          fill: ACADEMY_PAPER.cardFill,
          border: 'rgba(150,126,210,0.28)',
          accent: ACADEMY_PAPER.purple,
        },
        {
          fill: ACADEMY_PAPER.cardFill,
          border: 'rgba(79,174,132,0.26)',
          accent: ACADEMY_PAPER.green,
        },
        {
          fill: ACADEMY_PAPER.cardFillSoft,
          border: ACADEMY_PAPER.border,
          accent: ACADEMY_PAPER.bodyText,
        },
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
      titleAccent: ACADEMY_PAPER.primary,
      titleText: ACADEMY_PAPER.titleText,
      themeColors: [
        ACADEMY_PAPER.primary,
        ACADEMY_PAPER.titleText,
        ACADEMY_PAPER.purple,
        ACADEMY_PAPER.bodyText,
      ],
      backgroundColors: ['#fffdf8', '#fdf9f1', '#f4f7ff'],
      cardPalettes: [
        {
          fill: ACADEMY_PAPER.cardFill,
          border: ACADEMY_PAPER.blueBorder,
          accent: ACADEMY_PAPER.primary,
        },
        {
          fill: ACADEMY_PAPER.cardFill,
          border: 'rgba(150,126,210,0.28)',
          accent: ACADEMY_PAPER.purple,
        },
        {
          fill: ACADEMY_PAPER.cardFill,
          border: 'rgba(79,174,132,0.26)',
          accent: ACADEMY_PAPER.green,
        },
        {
          fill: ACADEMY_PAPER.cardFillSoft,
          border: ACADEMY_PAPER.border,
          accent: ACADEMY_PAPER.bodyText,
        },
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
    titleAccent: ACADEMY_PAPER.primary,
    titleText: ACADEMY_PAPER.titleText,
    themeColors: [
      ACADEMY_PAPER.primary,
      ACADEMY_PAPER.titleText,
      ACADEMY_PAPER.purple,
      ACADEMY_PAPER.bodyText,
    ],
    backgroundColors: ['#fffdf8', '#fdf9f1', '#f4f7ff'],
    cardPalettes: [
      {
        fill: ACADEMY_PAPER.cardFill,
        border: ACADEMY_PAPER.blueBorder,
        accent: ACADEMY_PAPER.primary,
      },
      {
        fill: ACADEMY_PAPER.cardFill,
        border: 'rgba(150,126,210,0.28)',
        accent: ACADEMY_PAPER.purple,
      },
      {
        fill: ACADEMY_PAPER.cardFill,
        border: 'rgba(79,174,132,0.26)',
        accent: ACADEMY_PAPER.green,
      },
      {
        fill: ACADEMY_PAPER.cardFillSoft,
        border: ACADEMY_PAPER.border,
        accent: ACADEMY_PAPER.bodyText,
      },
    ] as const,
    codeSurface: {
      fill: '#0f172a',
      outline: '#1e293b',
      text: '#e2e8f0',
      caption: '#cbd5e1',
    },
  };
}

export function createCardGroupId(prefix = 'semantic_card'): string {
  return `${prefix}_${nanoid(8)}`;
}

export function createBoundContentCard(args: {
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
      color: ACADEMY_PAPER.shadow,
    },
    html: args.html,
    color: args.color,
    fontName: args.fontName,
    textType: args.textType,
  });
}

export function splitCaptionedEquation(
  rawLatex: string,
  caption?: string,
): { latex: string; caption?: string } {
  const raw = normalizeLatexSource(rawLatex.trim()).replace(/\${3,}/g, '$$');
  const envMatch = raw.match(/^(.*?)(\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\3\})(.*)$/);
  if (envMatch?.[2]) {
    const mergedCaption = [caption?.trim(), envMatch[1]?.trim(), envMatch[4]?.trim()]
      .filter(Boolean)
      .join(' ');
    return {
      latex: normalizeLatexSource(envMatch[2]),
      caption: mergedCaption || undefined,
    };
  }

  const wrappedMatch =
    raw.match(/^(.*?)\$\$([\s\S]+?)\$\$(.*)$/) ||
    raw.match(/^(.*?)(?<!\$)\$([\s\S]+?)\$(?!\$)(.*)$/) ||
    raw.match(/^(.*?)\\\[([\s\S]+?)\\\](.*)$/) ||
    raw.match(/^(.*?)\\\(([\s\S]+?)\\\)(.*)$/);

  if (wrappedMatch?.[2]) {
    const mergedCaption = [caption?.trim(), wrappedMatch[1]?.trim(), wrappedMatch[3]?.trim()]
      .filter(Boolean)
      .join(' ');
    return {
      latex: normalizeLatexSource(wrappedMatch[2]),
      caption: mergedCaption || undefined,
    };
  }

  return {
    latex: raw,
    caption: caption?.trim() || undefined,
  };
}

export function getLayoutCardsItemTone(
  tone: LayoutCardsBlock['items'][number]['tone'],
  fallbackAccent: string,
): ContentCardTone {
  switch (tone) {
    case 'info':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: ACADEMY_PAPER.blueBorder,
        accent: ACADEMY_PAPER.primary,
      };
    case 'warning':
      return {
        fill: ACADEMY_PAPER.cardFillSoft,
        border: 'rgba(214,168,79,0.34)',
        accent: '#d69a45',
      };
    case 'success':
      return {
        fill: ACADEMY_PAPER.cardFill,
        border: 'rgba(79,174,132,0.26)',
        accent: ACADEMY_PAPER.green,
      };
    case 'neutral':
    default:
      return { fill: ACADEMY_PAPER.cardFill, border: ACADEMY_PAPER.border, accent: fallbackAccent };
  }
}

export function renderLayoutCardsBlock(args: {
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
        html: `<p style="font-size:18px;color:${ACADEMY_PAPER.primary};"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: ACADEMY_PAPER.primary,
        textType: 'itemTitle',
      }),
    );
    cursorTop += 34;
  }

  const layout = measureLayoutCardsLayout({
    items: args.block.items,
    columns: args.block.columns,
  });
  const requestedColumns = args.block.columns === 4 ? 2 : args.block.columns;
  const normalizedColumns =
    args.block.items.length === 1
      ? 1
      : args.block.items.length === 2 && requestedColumns >= 2
        ? 2
        : Math.max(1, Math.min(requestedColumns, args.block.items.length));
  const effectiveLayout =
    layout.columns === normalizedColumns
      ? layout
      : (() => {
          const gapX = 10;
          const gapY = 10;
          const cellWidth =
            (CONTENT_WIDTH - Math.max(0, normalizedColumns - 1) * gapX) /
            Math.max(1, normalizedColumns);
          const rowCount = Math.ceil(args.block.items.length / Math.max(1, normalizedColumns));
          const rowHeights = Array.from({ length: rowCount }, () => 0);
          args.block.items.forEach((item, index) => {
            const row = Math.floor(index / Math.max(1, normalizedColumns));
            const body = measureParagraphBlock({
              text: item.text,
              widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
              fontSizePx: 14,
              lineHeightPx: 18,
            });
            const title = measureParagraphBlock({
              text: item.title,
              widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
              fontSizePx: 13,
              lineHeightPx: 18,
            });
            rowHeights[row] = Math.max(
              rowHeights[row],
              Math.max(72, title.height + body.height + 18),
            );
          });
          return {
            columns: normalizedColumns,
            cellWidth,
            gapX,
            gapY,
            rowHeights,
            totalHeight:
              rowHeights.reduce((sum, value) => sum + value, 0) +
              Math.max(0, rowHeights.length - 1) * gapY,
          };
        })();
  if (effectiveLayout.columns === 0) {
    return { elements, height: cursorTop - args.top };
  }

  let rowCursorTop = cursorTop;
  let rowIndex = 0;
  args.block.items.forEach((item, index) => {
    const column = index % effectiveLayout.columns;
    const row = Math.floor(index / effectiveLayout.columns);
    if (row !== rowIndex) {
      rowCursorTop += effectiveLayout.rowHeights[rowIndex] + effectiveLayout.gapY;
      rowIndex = row;
    }
    const left = CONTENT_LEFT + column * (effectiveLayout.cellWidth + effectiveLayout.gapX);
    const rowHeight = effectiveLayout.rowHeights[row];
    const fallbackAccent = args.cardPalettes[index % args.cardPalettes.length]?.accent || '#2563eb';
    const tone = getLayoutCardsItemTone(item.tone, fallbackAccent);
    const body = fitParagraphBlockToHeight({
      text: item.text,
      widthPx: Math.max(120, effectiveLayout.cellWidth - CARD_INSET_X * 2),
      fontSizePx: 14,
      lineHeightPx: 18,
      maxHeightPx: rowHeight,
      color: ACADEMY_PAPER.bodyText,
    });
    elements.push(
      createRectShape({
        left,
        top: rowCursorTop,
        width: effectiveLayout.cellWidth,
        height: rowHeight,
        fill: tone.fill,
        outlineColor: tone.border,
        groupId,
        text: createShapeText({
          html: [
            `<p style="font-size:13px;color:${tone.accent};"><strong>${renderInlineLatexToHtml(item.title)}</strong></p>`,
            body.html,
          ].join(''),
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          lineHeight: 1.32,
          paragraphSpace: 4,
          align: 'top',
        }),
      }),
    );
  });

  cursorTop += effectiveLayout.totalHeight;
  return {
    elements,
    height: cursorTop - args.top,
  };
}

export function processFlowContextToLayoutCardsBlock(
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

export function fitProcessFlowSummaryCard(args: {
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
    color: ACADEMY_PAPER.bodyText,
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

export function fitProcessFlowStepCard(args: {
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
    color: ACADEMY_PAPER.titleText,
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
    color: ACADEMY_PAPER.bodyText,
  });
  const noteHtml = args.step.note
    ? fitParagraphBlockToHeight({
        text: args.step.note,
        widthPx: args.widthPx,
        fontSizePx: 12,
        lineHeightPx: 16,
        maxHeightPx: 56,
        color: ACADEMY_PAPER.bodyText,
      }).html
    : '';

  const height =
    (showStepLabel ? 18 : 6) + titleFit.height + detailFit.height + (args.step.note ? 22 : 0);

  return {
    html: [labelHtml, titleFit.html, detailFit.html, noteHtml].filter(Boolean).join(''),
    height: Math.max(72, height),
  };
}

export function renderProcessFlowBlock(args: {
  block: ProcessFlowBlock;
  top: number;
  language: 'zh-CN' | 'en-US';
  titleAccent: string;
  cardPalettes: readonly ContentCardTone[];
}): { elements: PPTElement[]; height: number } {
  const context = Array.isArray(args.block.context) ? args.block.context : [];
  const steps = Array.isArray(args.block.steps) ? args.block.steps : [];
  const elements: PPTElement[] = [];
  const groupId = createCardGroupId('process_flow');
  let cursorTop = args.top;

  if (args.block.title) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: 52,
        groupId,
        html: `<p style="font-size:16px;line-height:22px;color:${args.titleAccent};"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: args.titleAccent,
        textType: 'itemTitle',
      }),
    );
    cursorTop += 58;
  }

  const contextCards = processFlowContextToLayoutCardsBlock(context);
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
    const gapX = steps.length > 3 ? 14 : 18;
    const stepWidth =
      (CONTENT_WIDTH - Math.max(0, steps.length - 1) * gapX) / Math.max(steps.length, 1);
    const innerWidth = Math.max(104, stepWidth - CARD_INSET_X * 2);
    const stepHeight = Math.min(
      182,
      Math.max(
        120,
        ...steps.map(
          (step) =>
            estimateProcessFlowStepCardHeight({
              step,
              widthPx: innerWidth,
              orientation: 'horizontal',
            }) + 8,
        ),
      ),
    );

    const connectorY = cursorTop + stepHeight / 2;
    steps.forEach((step, index) => {
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

      if (index < steps.length - 1) {
        const nextLeft = CONTENT_LEFT + (index + 1) * (stepWidth + gapX);
        elements.push(
          createLineElement({
            start: [left + stepWidth, connectorY],
            end: [nextLeft - 3, connectorY],
            color: ACADEMY_PAPER.primary,
            width: 2,
            points: ['', 'arrow'],
            groupId,
          }),
        );
      }

      elements.push(
        createTextElement({
          left,
          top: cursorTop,
          width: stepWidth,
          height: stepHeight,
          groupId,
          html: fitted.html,
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          fill: tone.fill,
          outlineColor: tone.border,
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
    const stepHeights = steps.map((step) =>
      Math.min(
        144,
        Math.max(
          96,
          estimateProcessFlowStepCardHeight({
            step,
            widthPx: stepWidth,
            orientation: 'vertical',
          }) + 8,
        ),
      ),
    );
    let localTop = cursorTop;
    const markerCenters = stepHeights.map((_, index) => {
      const centerY = localTop + 14;
      localTop += stepHeights[index] + 12;
      return centerY;
    });
    localTop = cursorTop;

    steps.forEach((step, index) => {
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
          fill: tone.accent,
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
            color: ACADEMY_PAPER.shadow,
          },
          groupId,
          text: createShapeText({
            html: fitted.html,
            color: ACADEMY_PAPER.bodyText,
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
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.border,
        groupId,
        text: createShapeText({
          html: fittedSummary.html,
          color: ACADEMY_PAPER.bodyText,
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

export function hasBoxGeometry(element: PPTElement): element is PPTElement & {
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

export type ShapeBoxElement = PPTShapeElement & {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function stripShapeElements(elements: PPTElement[]): PPTElement[] {
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

export function getRowVerticalOverlapRatio(
  a: { top: number; height: number },
  b: { top: number; height: number },
): number {
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  const overlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.top, b.top));
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

export function expandSingleOccupancyRows(elements: PPTElement[]): PPTElement[] {
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
    if (
      source.left < CONTENT_LEFT - 24 ||
      source.left + source.width > CONTENT_LEFT + CONTENT_WIDTH + 24
    ) {
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

export function alignGridCellRowTop(args: {
  elements: PPTElement[];
  bodyTop: number;
  rowTops: number[];
}): PPTElement[] {
  return args.elements.map((element) => {
    if (!hasBoxGeometry(element)) return element;
    if (!element.groupId?.startsWith('grid_cell_')) return element;
    const match = element.groupId.match(/^grid_cell_(\d+)_(\d+)$/);
    if (!match) return element;
    const row = Number.parseInt(match[1], 10);
    if (!Number.isFinite(row) || row < 0 || row >= args.rowTops.length) return element;
    const expectedTop = args.bodyTop + args.rowTops[row];
    if (Math.abs(element.top - expectedTop) <= 0.5) return element;
    return {
      ...element,
      top: expectedTop,
    };
  });
}

export function alignTwoCardLayoutRows(elements: PPTElement[]): PPTElement[] {
  const groups = new Map<string, Array<{ id: string; top: number; left: number; width: number }>>();
  elements.forEach((element) => {
    if (!hasBoxGeometry(element)) return;
    if (!element.groupId?.startsWith('layout_cards_')) return;
    const list = groups.get(element.groupId) || [];
    list.push({ id: element.id, top: element.top, left: element.left, width: element.width });
    groups.set(element.groupId, list);
  });

  if (groups.size === 0) return elements;
  const next = elements.map((element) => ({ ...element })) as PPTElement[];
  const byId = new Map(next.map((element) => [element.id, element] as const));

  for (const cards of groups.values()) {
    if (cards.length !== 2) continue;
    const [a, b] = cards;
    const horizontallySeparated = Math.abs(a.left - b.left) > Math.min(a.width, b.width) * 0.45;
    if (!horizontallySeparated) continue;
    const targetTop = Math.min(a.top, b.top);
    const first = byId.get(a.id);
    const second = byId.get(b.id);
    if (first && hasBoxGeometry(first)) first.top = targetTop;
    if (second && hasBoxGeometry(second)) second.top = targetTop;
  }

  return next;
}

export function buildStackUnderfillExpansionRequests(args: {
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

export function estimateGridBodyHeight(args: {
  language: 'zh-CN' | 'en-US';
  block: NotebookContentBlock;
  widthPx: number;
}): number {
  if (args.block.type === 'paragraph') {
    return estimateParagraphHeightForWidth({
      text: args.block.text,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
    });
  }

  if (args.block.type === 'bullet_list') {
    return estimateParagraphStackHeightForWidth({
      items: args.block.items,
      widthPx: Math.max(120, args.widthPx - 16),
      fontSizePx: 14,
      lineHeightPx: 20,
      paragraphSpacePx: 5,
    });
  }

  const bodyLines = blockToGridBody(args.language, args.block);
  return estimateParagraphStackHeightForWidth({
    items: bodyLines,
    widthPx: Math.max(120, args.widthPx - 16),
    fontSizePx: 14,
    lineHeightPx: 20,
    paragraphSpacePx: 5,
  });
}

export function computeAdaptiveGridRowHeights(args: {
  gridRows: number;
  gridColumns: number;
  blockCount: number;
  bodyHeight: number;
  rowDesiredHeights: number[];
}): { rowHeights: number[]; rowTops: number[] } {
  const usedRows = Math.max(
    1,
    Math.min(args.gridRows, Math.ceil(args.blockCount / args.gridColumns)),
  );
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
    // Keep grid cards close to their content-driven height. Stretching rows to
    // fill the whole body makes sparse pages look unfinished and introduces
    // oversized cards with large internal whitespace.
    const extraPerRow = Math.min(leftover / usedRows, GRID_MAX_AUTO_STRETCH_PER_ROW);
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

export type VisualSlotWithTitle = NotebookContentVisualSlot & { title?: string };

export function isVisualBlock(
  block: NotebookContentBlock,
): block is Extract<NotebookContentBlock, { type: 'visual' }> {
  return block.type === 'visual';
}

export function stripVisualBlocks(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return blocks.filter((block) => !isVisualBlock(block));
}

export function resolveDocumentVisualSlot(
  document: NotebookContentDocument,
): VisualSlotWithTitle | null {
  if (document.visualSlot) return document.visualSlot;
  const visualBlock = document.blocks.find(isVisualBlock);
  return visualBlock || null;
}

export function inferLayoutFamilyFromDocument(args: {
  document: NotebookContentDocument;
  archetype: ReturnType<typeof resolveDocumentArchetype>;
  blocks: NotebookContentBlock[];
}): NotebookContentLayoutFamily {
  if (args.document.layoutTemplate && isDefinitionBoardTemplate(args.document.layoutTemplate)) {
    return 'concept_cards';
  }
  if (args.document.layoutFamily) return args.document.layoutFamily;
  if (args.archetype === 'intro') return 'cover';
  if (args.archetype === 'summary') return 'summary';
  if (args.document.visualSlot || args.blocks.some(isVisualBlock)) return 'visual_split';
  if (
    args.blocks.some(
      (block) =>
        block.type === 'code_walkthrough' ||
        block.type === 'code_block' ||
        block.type === 'code_trace',
    )
  ) {
    return 'code_walkthrough';
  }
  if (args.blocks.some((block) => block.type === 'derivation_steps')) return 'derivation';
  if (args.blocks.some((block) => block.type === 'equation' || block.type === 'matrix')) {
    return 'formula_focus';
  }
  if (args.blocks.some((block) => block.type === 'table')) return 'comparison';
  if (args.blocks.some((block) => block.type === 'process_flow')) return 'timeline';
  if (args.archetype === 'bridge') return 'comparison';
  if (args.archetype === 'example') return 'problem_solution';
  return 'concept_cards';
}

function isDefinitionBoardTemplate(template: NotebookContentLayoutTemplate): boolean {
  return template === 'definition_board' || template === 'concept_map';
}

export function createSlideFromFamilyElements(args: {
  elements: PPTElement[];
  tokens: ReturnType<typeof getProfileTokens>;
  backgroundIndex?: number;
}): Slide {
  const backgroundIndex = args.backgroundIndex ?? 0;
  return {
    id: `slide_${nanoid(8)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
    theme: {
      backgroundColor:
        args.tokens.backgroundColors[backgroundIndex] || args.tokens.backgroundColors[0],
      themeColors: args.tokens.themeColors,
      fontColor: args.tokens.titleText,
      fontName: 'Microsoft YaHei',
    },
    elements: args.elements,
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          {
            pos: 0,
            color: args.tokens.backgroundColors[backgroundIndex] || args.tokens.backgroundColors[0],
          },
          { pos: 58, color: args.tokens.backgroundColors[1] },
          { pos: 100, color: args.tokens.backgroundColors[2] },
        ],
      },
    },
    type: 'content',
  };
}

export function createFamilyTitleElements(args: {
  title: string;
  language: 'zh-CN' | 'en-US';
  family: NotebookContentLayoutFamily;
  tokens: ReturnType<typeof getProfileTokens>;
  continuation?: NotebookContentDocument['continuation'];
}): PPTElement[] {
  const titleTop = args.family === 'cover' ? 126 : args.family === 'section' ? 116 : 38;
  const normalizedTitleLength = args.title.replace(/\s+/g, '').length;
  const titleSize =
    args.family === 'cover'
      ? 46
      : args.family === 'section'
        ? 38
        : normalizedTitleLength > 46
          ? 24
          : normalizedTitleLength > 34
            ? 26
            : normalizedTitleLength > 26
              ? 28
              : 30;
  const titleHeight =
    args.family === 'cover'
      ? 110
      : args.family === 'section'
        ? 88
        : titleSize <= 24
          ? 58
          : titleSize <= 26
            ? 56
            : 52;
  const width =
    args.family === 'cover' || args.family === 'section'
      ? 760
      : args.continuation
        ? CONTENT_WIDTH - 188
        : CONTENT_WIDTH;
  const elements: PPTElement[] = [
    createTextElement({
      left: CONTENT_LEFT,
      top: titleTop,
      width,
      height: titleHeight,
      html: `<p style="font-size:${titleSize}px;line-height:${Math.round(titleSize * 1.16)}px;color:${args.tokens.titleText};font-weight:800;">${renderInlineLatexToHtml(args.title)}</p>`,
      color: args.tokens.titleText,
      textType: 'title',
    }),
  ];

  if (args.family !== 'cover' && args.family !== 'section') {
    elements.push(
      createRectShape({
        left: CONTENT_LEFT,
        top: titleTop + titleHeight + 8,
        width: 150,
        height: 5,
        fill: args.tokens.titleAccent,
      }),
    );
  }

  if (args.continuation) {
    const chipLabel =
      args.language === 'en-US'
        ? `Part ${args.continuation.partNumber} of ${args.continuation.totalParts}`
        : `续 ${args.continuation.partNumber}/${args.continuation.totalParts}`;
    elements.push(
      createTextElement({
        left: CONTENT_LEFT + CONTENT_WIDTH - 170,
        top: 42,
        width: 150,
        height: 26,
        html: `<p style="font-size:12px;color:${args.tokens.titleAccent};text-align:center;"><strong>${escapeHtml(chipLabel)}</strong></p>`,
        color: args.tokens.titleAccent,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        textType: 'notes',
      }),
    );
  }

  return elements;
}

export function blockSummaryLines(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
): string[] {
  if (block.type === 'paragraph') return [block.text];
  if (block.type === 'bullet_list') return block.items;
  if (block.type === 'callout') return [block.text];
  if (block.type === 'definition' || block.type === 'theorem') {
    return [block.text, ...(block.type === 'theorem' && block.proofIdea ? [block.proofIdea] : [])];
  }
  return blockToGridBody(language, block);
}

export function shouldUseBlockAsDefinitionPoint(block: NotebookContentBlock): boolean {
  return !['equation', 'matrix', 'derivation_steps', 'process_flow', 'invariant_panel'].includes(
    block.type,
  );
}

export function estimateSlotBlockWeight(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
): number {
  if (block.type === 'code_block') {
    return block.code.split('\n').length * 34 + block.code.length * 0.35;
  }
  if (block.type === 'code_walkthrough') {
    return (
      block.code.split('\n').length * 26 +
      block.steps.reduce((sum, step) => sum + step.explanation.length, 0) * 0.9
    );
  }
  if (block.type === 'code_trace') {
    return (
      block.code.split('\n').length * 26 +
      block.steps.reduce(
        (sum, step) =>
          sum +
          step.explanation.length * 0.9 +
          step.state.reduce(
            (stateSum, state) => stateSum + state.name.length + state.value.length,
            0,
          ),
        0,
      )
    );
  }
  if (block.type === 'state_table') {
    return (
      block.columns.join('').length +
      block.rows.flat().join('').length +
      (block.caption?.length || 0)
    );
  }
  if (block.type === 'call_stack') {
    return block.frames.reduce(
      (sum, frame) =>
        sum +
        frame.name.length +
        frame.args.reduce((argSum, item) => argSum + item.name.length + item.value.length, 0) +
        frame.locals.reduce(
          (localSum, item) => localSum + item.name.length + item.value.length,
          0,
        ) +
        (frame.returnValue?.length || 0) +
        (frame.note?.length || 0),
      0,
    );
  }
  if (block.type === 'memory_diagram') {
    return (
      block.stack.reduce(
        (sum, item) => sum + item.name.length + item.value.length + (item.ref?.length || 0),
        0,
      ) +
      block.heap.reduce(
        (sum, item) =>
          sum +
          item.id.length +
          item.label.length +
          item.fields.reduce(
            (fieldSum, field) => fieldSum + field.name.length + field.value.length,
            0,
          ),
        0,
      )
    );
  }
  if (block.type === 'pointer_diagram') {
    return (
      (block.operation?.length || 0) +
      block.nodes.reduce(
        (sum, node) =>
          sum +
          node.id.length +
          node.label.length +
          node.fields.reduce(
            (fieldSum, field) => fieldSum + field.name.length + field.value.length,
            0,
          ),
        0,
      ) +
      block.pointers.reduce(
        (sum, pointer) => sum + pointer.name.length + (pointer.to?.length || 0),
        0,
      )
    );
  }
  if (block.type === 'tree_diagram') {
    return (
      block.nodes.reduce(
        (sum, node) =>
          sum +
          node.id.length +
          node.label.length +
          (node.children || []).reduce((childSum, child) => childSum + child.length, 0) +
          (node.left?.length || 0) +
          (node.right?.length || 0),
        0,
      ) +
      (block.target?.length || 0) +
      (block.decision?.length || 0) +
      (block.invariant?.length || 0)
    );
  }
  if (block.type === 'graph_trace') {
    return (
      block.algorithm.length +
      (block.title?.length || 0) +
      block.nodes.reduce((sum, node) => sum + node.id.length + node.label.length, 0) +
      block.edges.reduce(
        (sum, edge) => sum + edge.from.length + edge.to.length + (edge.label?.length || 0),
        0,
      ) +
      block.steps.reduce(
        (sum, step) =>
          sum +
          (step.title?.length || 0) +
          (step.explanation?.length || 0) +
          step.frontier.join('').length +
          step.visited.join('').length +
          step.order.join('').length,
        0,
      ) +
      (block.invariant?.length || 0)
    );
  }
  if (block.type === 'linear_structure') {
    return (
      block.kind.length +
      (block.title?.length || 0) +
      (block.operation?.length || 0) +
      block.items.reduce(
        (sum, item) => sum + item.id.length + item.label.length + (item.note?.length || 0),
        0,
      ) +
      block.steps.reduce(
        (sum, step) =>
          sum +
          (step.title?.length || 0) +
          (step.operation?.length || 0) +
          step.items.reduce(
            (itemSum, item) =>
              itemSum + item.id.length + item.label.length + (item.note?.length || 0),
            0,
          ) +
          step.focus.reduce((focusSum, id) => focusSum + id.length, 0) +
          (step.explanation?.length || 0) +
          (step.result?.length || 0),
        0,
      ) +
      (block.caption?.length || 0)
    );
  }
  if (block.type === 'invariant_panel') {
    return (
      block.invariant.length +
      (block.structure?.length || 0) +
      block.checks.reduce(
        (sum, check) => sum + check.label.length + check.text.length + (check.reason?.length || 0),
        0,
      ) +
      (block.caption?.length || 0)
    );
  }
  if (block.type === 'derivation_steps') {
    return block.steps.reduce(
      (sum, step) => sum + step.expression.length * 1.15 + (step.explanation?.length || 0) * 0.8,
      0,
    );
  }
  if (block.type === 'equation') return block.latex.length * 1.35;
  if (block.type === 'matrix') return matrixBlockToLatex(block).length * 1.2;
  if (block.type === 'table') {
    return [
      ...(block.headers || []),
      ...block.rows.flatMap((row) => row),
      block.caption || '',
    ].join('').length;
  }
  if (block.type === 'process_flow') {
    const context = Array.isArray(block.context) ? block.context : [];
    const steps = Array.isArray(block.steps) ? block.steps : [];
    return (
      context.reduce((sum, item) => sum + item.label.length + item.text.length, 0) +
      steps.reduce((sum, step) => sum + step.title.length + step.detail.length, 0) +
      (block.summary?.length || 0)
    );
  }
  if (block.type === 'example') {
    return (
      block.problem.length +
      block.givens.join('').length +
      (block.goal?.length || 0) +
      block.steps.join('').length +
      (block.answer?.length || 0)
    );
  }

  return blockSummaryLines(language, block).join('').length;
}

export function estimateSlotWeight(language: 'zh-CN' | 'en-US', slot: NotebookContentSlot): number {
  return slot.blocks.reduce((sum, block) => sum + estimateSlotBlockWeight(language, block), 0);
}

export function validateSlotTemplateDocument(args: {
  document: NotebookContentDocument;
  language: 'zh-CN' | 'en-US';
  spec: SlotTemplateSpec | undefined;
}): SlotTemplateSpec {
  const issues: NotebookSlotLayoutIssue[] = [];
  const template = args.document.layoutTemplate;

  if (!template || !args.spec) {
    issues.push({
      code: 'unknown_template',
      message: `Unknown slot template: ${template || 'missing'}.`,
    });
  }

  const slots = args.document.slots || [];
  const slotSpecs = new Map(args.spec?.slots.map((slot) => [slot.slotId, slot]) || []);
  const totalBlocks = slots.reduce((sum, slot) => sum + slot.blocks.length, 0);
  const totalWeight = slots.reduce((sum, slot) => sum + estimateSlotWeight(args.language, slot), 0);

  if (args.spec && totalBlocks > args.spec.maxBlocks) {
    issues.push({
      code: 'template_block_count',
      message: `Template ${args.spec.template} accepts ${args.spec.maxBlocks} blocks; received ${totalBlocks}.`,
    });
  }

  if (args.spec && totalWeight > args.spec.maxTotalWeight) {
    issues.push({
      code: 'template_weight',
      message: `Template ${args.spec.template} capacity ${args.spec.maxTotalWeight}; estimated content weight ${Math.round(
        totalWeight,
      )}.`,
    });
  }

  slots.forEach((slot) => {
    const slotSpec = slotSpecs.get(slot.slotId);
    const slotWeight = estimateSlotWeight(args.language, slot);
    if (!slotSpec) {
      issues.push({
        code: 'unknown_slot',
        slotId: slot.slotId,
        message: `Slot ${slot.slotId} is not allowed in template ${template}.`,
      });
      return;
    }

    if (slot.blocks.length > slotSpec.maxBlocks) {
      issues.push({
        code: 'slot_block_count',
        slotId: slot.slotId,
        message: `Slot ${slot.slotId} accepts ${slotSpec.maxBlocks} blocks; received ${slot.blocks.length}.`,
      });
    }

    if (slotWeight > slotSpec.maxWeight) {
      issues.push({
        code: 'slot_weight',
        slotId: slot.slotId,
        message: `Slot ${slot.slotId} capacity ${slotSpec.maxWeight}; estimated content weight ${Math.round(
          slotWeight,
        )}.`,
      });
    }

    if (slotSpec.allowedBlockTypes) {
      const invalid = slot.blocks.find(
        (block) => !slotSpec.allowedBlockTypes?.includes(block.type),
      );
      if (invalid) {
        issues.push({
          code: 'slot_block_type',
          slotId: slot.slotId,
          message: `Slot ${slot.slotId} does not allow block type ${invalid.type}.`,
        });
      }
    }
  });

  if (issues.length > 0) {
    throw new NotebookSlotLayoutError('Slot template compile failed.', issues);
  }

  return args.spec as SlotTemplateSpec;
}
