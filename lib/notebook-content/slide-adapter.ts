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

type ContentCardTone = {
  fill: string;
  border: string;
  accent: string;
};
type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;
type LayoutCardsBlock = Extract<NotebookContentBlock, { type: 'layout_cards' }>;

const ACADEMY_PAPER = {
  titleText: '#182033',
  bodyText: '#3f4b63',
  primary: '#4b72e8',
  purple: '#8a6fe8',
  green: '#27b889',
  gold: '#d6a84f',
  cardFill: 'rgba(255,253,248,0.86)',
  cardFillSoft: 'rgba(255,253,248,0.76)',
  formulaFill: 'rgba(248,251,255,0.74)',
  border: 'rgba(188,169,133,0.3)',
  blueBorder: 'rgba(119,148,191,0.34)',
  shadow: 'rgba(106,84,45,0.11)',
} as const;

const CLASSIC_BUSINESS = {
  titleText: '#1f2937',
  bodyText: '#374151',
  mutedText: '#6b7280',
  border: '#d1d5db',
  subtleBorder: '#e5e7eb',
  panelFill: '#f8fafc',
  panelFillWarm: '#fff7ed',
  panelFillGreen: '#ecfdf5',
  panelFillBlue: '#eff6ff',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#f59e0b',
  green: '#16a34a',
  teal: '#0f766e',
  shadow: 'rgba(15,23,42,0.08)',
} as const;

type ClassicDeckStylePreset = {
  id: NotebookContentDeckStyle;
  name: string;
  background: string;
  titleText: string;
  bodyText: string;
  mutedText: string;
  border: string;
  subtleBorder: string;
  panelFill: string;
  panelFillWarm: string;
  panelFillGreen: string;
  panelFillBlue: string;
  panelFillRed: string;
  borderWarm: string;
  borderGreen: string;
  borderBlue: string;
  borderRed: string;
  blue: string;
  red: string;
  yellow: string;
  green: string;
  teal: string;
  shadow: string;
  tableFill: string;
  tableStripeFill: string;
  tableHeaderFill: string;
};

const CLASSIC_DECK_STYLES = {
  classic_business: {
    id: 'classic_business',
    name: 'Classic Business',
    background: '#ffffff',
    ...CLASSIC_BUSINESS,
    panelFillRed: '#fee2e2',
    borderWarm: '#fed7aa',
    borderGreen: '#bbf7d0',
    borderBlue: '#bfdbfe',
    borderRed: '#fecaca',
    tableFill: '#ffffff',
    tableStripeFill: '#f9fafb',
    tableHeaderFill: '#e5e7eb',
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    background: '#f8fbff',
    titleText: '#0f2f63',
    bodyText: '#233454',
    mutedText: '#64748b',
    border: '#c9d8ee',
    subtleBorder: '#dbe7f6',
    panelFill: '#ffffff',
    panelFillWarm: '#fff7ed',
    panelFillGreen: '#eefbf5',
    panelFillBlue: '#eef5ff',
    panelFillRed: '#fff1f2',
    borderWarm: '#fed7aa',
    borderGreen: '#bfe9d2',
    borderBlue: '#b9cff4',
    borderRed: '#fecdd3',
    blue: '#174a8b',
    red: '#b42318',
    yellow: '#d69e2e',
    green: '#28775d',
    teal: '#0f766e',
    shadow: 'rgba(15,47,99,0.08)',
    tableFill: '#ffffff',
    tableStripeFill: '#f3f7fc',
    tableHeaderFill: '#e4edf8',
  },
  magazine: {
    id: 'magazine',
    name: 'Magazine',
    background: '#fbf4ea',
    titleText: '#2b2a24',
    bodyText: '#4a4438',
    mutedText: '#746a5b',
    border: '#e1d1bd',
    subtleBorder: '#eadfce',
    panelFill: '#fffaf2',
    panelFillWarm: '#fff2df',
    panelFillGreen: '#edf4df',
    panelFillBlue: '#eff5ef',
    panelFillRed: '#f9e7df',
    borderWarm: '#e8c59a',
    borderGreen: '#c9d9af',
    borderBlue: '#cbd8c2',
    borderRed: '#ebc3ad',
    blue: '#63795a',
    red: '#b66543',
    yellow: '#d39b42',
    green: '#7b914f',
    teal: '#607f78',
    shadow: 'rgba(86,64,38,0.12)',
    tableFill: '#fffaf2',
    tableStripeFill: '#f7ead9',
    tableHeaderFill: '#eadcc8',
  },
  dark_art: {
    id: 'dark_art',
    name: 'Dark Art',
    background: '#111224',
    titleText: '#fff6d9',
    bodyText: '#e6e0f2',
    mutedText: '#b9afcf',
    border: '#463d66',
    subtleBorder: '#342c4f',
    panelFill: '#1a1a34',
    panelFillWarm: '#282036',
    panelFillGreen: '#162d2c',
    panelFillBlue: '#181f3f',
    panelFillRed: '#2a1930',
    borderWarm: '#6c4c2c',
    borderGreen: '#2e5f58',
    borderBlue: '#3c4a85',
    borderRed: '#66334e',
    blue: '#7c8cff',
    red: '#d85b8c',
    yellow: '#f5c85f',
    green: '#49c6a7',
    teal: '#6ee7d8',
    shadow: 'rgba(0,0,0,0.34)',
    tableFill: '#17172c',
    tableStripeFill: '#20203a',
    tableHeaderFill: '#29294a',
  },
  nature_documentary: {
    id: 'nature_documentary',
    name: 'Nature Documentary',
    background: '#061f1c',
    titleText: '#f4f7ea',
    bodyText: '#dce9dc',
    mutedText: '#9fb7aa',
    border: '#215147',
    subtleBorder: '#173d37',
    panelFill: '#0b2a25',
    panelFillWarm: '#24311d',
    panelFillGreen: '#0d342e',
    panelFillBlue: '#0e3138',
    panelFillRed: '#342018',
    borderWarm: '#6d6a38',
    borderGreen: '#2d6f5d',
    borderBlue: '#32636f',
    borderRed: '#744435',
    blue: '#72d1d7',
    red: '#f9735b',
    yellow: '#d7bd63',
    green: '#6ee7b7',
    teal: '#2dd4bf',
    shadow: 'rgba(0,0,0,0.28)',
    tableFill: '#0b2a25',
    tableStripeFill: '#10342e',
    tableHeaderFill: '#173f38',
  },
  tech_saas: {
    id: 'tech_saas',
    name: 'Tech / SaaS',
    background: '#f8fafc',
    titleText: '#111827',
    bodyText: '#334155',
    mutedText: '#64748b',
    border: '#d8e2ee',
    subtleBorder: '#e2e8f0',
    panelFill: '#ffffff',
    panelFillWarm: '#fff4ed',
    panelFillGreen: '#ecfdf5',
    panelFillBlue: '#eff6ff',
    panelFillRed: '#fff1f2',
    borderWarm: '#fed7aa',
    borderGreen: '#bbf7d0',
    borderBlue: '#bfdbfe',
    borderRed: '#fecdd3',
    blue: '#2563eb',
    red: '#f97316',
    yellow: '#8b5cf6',
    green: '#10b981',
    teal: '#06b6d4',
    shadow: 'rgba(15,23,42,0.10)',
    tableFill: '#ffffff',
    tableStripeFill: '#f8fafc',
    tableHeaderFill: '#eaf1fb',
  },
  product_launch: {
    id: 'product_launch',
    name: 'Product Launch',
    background: '#060606',
    titleText: '#ffffff',
    bodyText: '#f4f4f5',
    mutedText: '#a1a1aa',
    border: '#2f2f33',
    subtleBorder: '#242428',
    panelFill: '#111113',
    panelFillWarm: '#1f1711',
    panelFillGreen: '#10231c',
    panelFillBlue: '#101827',
    panelFillRed: '#241315',
    borderWarm: '#7c3f16',
    borderGreen: '#205d48',
    borderBlue: '#29466f',
    borderRed: '#7f1d1d',
    blue: '#60a5fa',
    red: '#f97316',
    yellow: '#fbbf24',
    green: '#34d399',
    teal: '#22d3ee',
    shadow: 'rgba(0,0,0,0.42)',
    tableFill: '#111113',
    tableStripeFill: '#17171a',
    tableHeaderFill: '#232326',
  },
} satisfies Record<NotebookContentDeckStyle, ClassicDeckStylePreset>;

function getClassicDeckStyle(document: NotebookContentDocument): ClassicDeckStylePreset {
  return CLASSIC_DECK_STYLES[document.deckStyle || 'classic_business'];
}

function classicColorReplacements(
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

function replaceClassicStyleString(
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

function retintClassicValue(
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

function retintClassicElements(
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

function isSlotOnlyDocument(document: NotebookContentDocument): boolean {
  return document.version === 2 && Boolean(document.slots?.length);
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
    summary:
      args.language === 'en-US' ? 'Follow this sequence in class.' : '授课时按这个顺序推进。',
  };
}

function resolveBlockTemplateTone(
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

function getProfileTokens(profile: NotebookContentProfile) {
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
      color: ACADEMY_PAPER.shadow,
    },
    html: args.html,
    color: args.color,
    fontName: args.fontName,
    textType: args.textType,
  });
}

function splitCaptionedEquation(
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

function getLayoutCardsItemTone(
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

function renderProcessFlowBlock(args: {
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

function alignGridCellRowTop(args: {
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

function alignTwoCardLayoutRows(elements: PPTElement[]): PPTElement[] {
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

function computeAdaptiveGridRowHeights(args: {
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

type VisualSlotWithTitle = NotebookContentVisualSlot & { title?: string };

function isVisualBlock(
  block: NotebookContentBlock,
): block is Extract<NotebookContentBlock, { type: 'visual' }> {
  return block.type === 'visual';
}

function stripVisualBlocks(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return blocks.filter((block) => !isVisualBlock(block));
}

function resolveDocumentVisualSlot(document: NotebookContentDocument): VisualSlotWithTitle | null {
  if (document.visualSlot) return document.visualSlot;
  const visualBlock = document.blocks.find(isVisualBlock);
  return visualBlock || null;
}

function inferLayoutFamilyFromDocument(args: {
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

function createSlideFromFamilyElements(args: {
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

function createFamilyTitleElements(args: {
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

function blockSummaryLines(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string[] {
  if (block.type === 'paragraph') return [block.text];
  if (block.type === 'bullet_list') return block.items;
  if (block.type === 'callout') return [block.text];
  if (block.type === 'definition' || block.type === 'theorem') {
    return [block.text, ...(block.type === 'theorem' && block.proofIdea ? [block.proofIdea] : [])];
  }
  return blockToGridBody(language, block);
}

function shouldUseBlockAsDefinitionPoint(block: NotebookContentBlock): boolean {
  return !['equation', 'matrix', 'derivation_steps', 'process_flow', 'invariant_panel'].includes(
    block.type,
  );
}

function estimateSlotBlockWeight(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): number {
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

function estimateSlotWeight(language: 'zh-CN' | 'en-US', slot: NotebookContentSlot): number {
  return slot.blocks.reduce((sum, block) => sum + estimateSlotBlockWeight(language, block), 0);
}

function validateSlotTemplateDocument(args: {
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

function flattenSlotBlocksForTemplate(
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

type ClassicProtectedInlineSegment = {
  raw: string;
  visible: string;
  atomic: boolean;
};

function splitClassicProtectedInlineSegments(text: string): ClassicProtectedInlineSegment[] {
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

function classicProtectedVisibleLength(text: string): number {
  return splitClassicProtectedInlineSegments(text).reduce(
    (sum, segment) => sum + segment.visible.length,
    0,
  );
}

function compactClassicTextLine(line: string, maxChars: number): string {
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

function splitClassicTextLineForCard(line: string, maxChars: number): string[] {
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

function splitClassicCardBodyLines(args: {
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

function estimateClassicCardContentHeight(args: {
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

function createBlockCard(args: {
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

function renderVisualPanel(args: {
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

function createHeroBackgroundElements(args: {
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

function resolveHeroBackgroundTheme(args: {
  visual: VisualSlotWithTitle | null;
  fallbackStyleId: SlideBackgroundStyleId;
}): SlideBackgroundThemeTokens {
  return (
    resolveSlideBackgroundThemeForSource(args.visual?.source) ||
    getSlideBackgroundThemeTokens(args.fallbackStyleId)
  );
}

function heroTextLines(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  maxItems?: number;
}): string[] {
  return firstClassicLines(args.language, getClassicTextBlocks(args.blocks), args.maxItems ?? 3);
}

function createHeroFooterText(args: {
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

const HERO_META_PLACEHOLDER_PATTERN =
  /^(?:current edition|edition|deep dive|opening|course intro|intro|overview|dark art|tech\s*\/\s*saas|tech saas|classic business|academic|magazine|product launch|nature documentary|当前版本|版本|深度解析|课程导入|导入|概览|技术|科技|暗色艺术)$/i;

function isMeaningfulHeroMeta(text: string | undefined): text is string {
  const normalized = text?.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (HERO_META_PLACEHOLDER_PATTERN.test(normalized)) return false;
  return normalized.replace(/\s+/g, '').length >= 3;
}

function isCompactHeroMeta(text: string | undefined, language: 'zh-CN' | 'en-US'): text is string {
  if (!isMeaningfulHeroMeta(text)) return false;
  const compactLength = text.replace(/\s+/g, '').length;
  const maxLength = language === 'en-US' ? 32 : 18;
  return compactLength <= maxLength;
}

function meaningfulHeroTextLines(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  maxItems?: number;
}): string[] {
  return heroTextLines(args).filter((line) => isMeaningfulHeroMeta(line));
}

function meaningfulCalloutTitle(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
}): string | null {
  const title = args.blocks.find((block) => block.type === 'callout')?.title?.trim();
  if (!isMeaningfulHeroMeta(title)) return null;
  const compactLength = title.replace(/\s+/g, '').length;
  const maxLength = args.language === 'en-US' ? 18 : 8;
  return compactLength <= maxLength ? title : null;
}

function isDarkHeroVisual(visual: VisualSlotWithTitle | null): boolean {
  if (!visual?.source) return false;
  return findSlideBackgroundStyleBySource(visual.source)?.tone === 'dark';
}

function heroOverlayFillForVisual(args: {
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

function heroLeftShadeFillForVisual(args: {
  theme: SlideBackgroundThemeTokens;
  visual: VisualSlotWithTitle | null;
  template: 'image' | 'cinematic' | 'tech';
}): string | undefined {
  if (args.template === 'tech')
    return isDarkHeroVisual(args.visual) ? args.theme.leftShadeFill : undefined;
  if (args.template === 'cinematic') return undefined;
  return args.theme.leftShadeFill;
}

function createCornerBracketElements(args: {
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

function renderClassicImageTitleOverlayTemplate(args: {
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

function renderClassicCinematicTitleFrameTemplate(args: {
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

function renderClassicTechHeroTitleTemplate(args: {
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

function findFirstBlock<T extends NotebookContentBlock['type']>(
  blocks: NotebookContentBlock[],
  type: T,
): Extract<NotebookContentBlock, { type: T }> | undefined {
  return blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: T }> => block.type === type,
  );
}

function renderClassicInlineCodeHtml(text: string): string {
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

function renderClassicInlineHtml(text: string): string {
  if (text.includes('`')) return renderClassicInlineCodeHtml(text);
  return /[$\\]/.test(text) ? renderInlineLatexToHtml(text) : escapeHtml(text);
}

function createTableCards(args: {
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

function createClassicLectureSlide(args: {
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

function createClassicTopBarElements(): PPTElement[] {
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

function createClassicSegmentedUnderline(args: { left: number; top: number }): PPTElement[] {
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

function createClassicFooterElements(): PPTElement[] {
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

function createClassicTitleElements(args: {
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

function createClassicPanel(args: {
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

function getClassicTextBlocks(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return blocks.filter(
    (block) =>
      block.type !== 'heading' &&
      block.type !== 'process_flow' &&
      block.type !== 'layout_cards' &&
      block.type !== 'table' &&
      block.type !== 'visual',
  );
}

function firstClassicLines(
  language: 'zh-CN' | 'en-US',
  blocks: NotebookContentBlock[],
  maxItems: number,
): string[] {
  return uniqueTeachingLines(
    blocks.flatMap((block) => blockSummaryLines(language, block)),
    maxItems,
  );
}

function createFlowArrowElements(args: {
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

function looksLikeCodeOrDataLiteral(text: string): boolean {
  return (
    /`[^`]+`/.test(text) ||
    /[\[\]{}]/.test(text) ||
    /\b(?:Tweet\(\)|list|dict|userid|created_at|content|likes|date|self|__init__)\b/.test(text) ||
    /[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/.test(text)
  );
}

function stripInlineCodeDelimiters(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1');
}

function wrapDataLiteralForTable(text: string, firstColumn: boolean): string {
  if (!firstColumn) return text;
  if (text.length <= 48) return text;
  return text
    .replace(/,\s*(?='[^']{10,}'|"[^"]{10,}"|[A-Za-z_])/g, ',\n')
    .replace(/,\s*(?=\d{4}-\d{2}-\d{2})/g, ',\n')
    .replace(/,\s*(?=\{?'?[A-Za-z_][A-Za-z0-9_]*'?\s*:)/g, ',\n');
}

function formatClassicTableCellText(
  text: string,
  options: { codeLike: boolean; firstColumn: boolean },
): string {
  const withoutCodeMarks = stripInlineCodeDelimiters(text).trim();
  if (!options.codeLike) return withoutCodeMarks;
  return wrapDataLiteralForTable(withoutCodeMarks, options.firstColumn);
}

function createClassicBusinessTable(args: {
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

function renderClassicFlowStrip(args: {
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

function layoutCardsToBlocks(block: LayoutCardsBlock): NotebookContentBlock[] {
  return block.items.map((item) => ({
    type: 'paragraph',
    cardTitle: item.title,
    text: item.text,
  }));
}

function renderClassicProcessStepsTemplate(args: {
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

function compactClassicComparisonPhrase(line: string, maxChars: number): string {
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

function renderClassicComparisonMatrixTemplate(args: {
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

function renderClassicPipelineTableTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const flow = findFirstBlock(args.blocks, 'process_flow');
  const tableBlock = findFirstBlock(args.blocks, 'table');
  const leadLines = [
    ...firstClassicLines(args.language, getClassicTextBlocks(args.blocks), 2),
    ...(flow?.context || []).map((item) => item.text),
  ].slice(0, 2);
  const leadHeight = leadLines.length > 0 ? 42 : 0;
  if (leadLines.length > 0) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: titleResult.bodyTop,
        width: CONTENT_WIDTH,
        height: leadHeight,
        html: leadLines
          .map(
            (line) =>
              `<p style="font-size:14px;line-height:17px;color:${CLASSIC_BUSINESS.mutedText};">${renderClassicInlineHtml(line)}</p>`,
          )
          .join(''),
        color: CLASSIC_BUSINESS.mutedText,
        textType: 'content',
      }),
    );
  }

  const flowTop = titleResult.bodyTop + leadHeight + (leadHeight ? 6 : 0);
  const flowHeight = 88;
  if (flow) {
    elements.push(
      ...renderClassicFlowStrip({
        flow: { ...flow, steps: flow.steps.slice(0, 4), orientation: 'horizontal' },
        left: CONTENT_LEFT,
        top: flowTop,
        width: CONTENT_WIDTH,
        height: flowHeight,
        cardPalettes: args.cardPalettes,
      }),
    );
  }

  const tableTop = flow ? flowTop + flowHeight + 12 : flowTop;
  const tableHeight = Math.max(118, CONTENT_BOTTOM - tableTop - 12);
  if (tableBlock) {
    elements.push(
      ...createClassicBusinessTable({
        block: tableBlock,
        left: CONTENT_LEFT,
        top: tableTop,
        width: CONTENT_WIDTH,
        height: tableHeight,
        fillHeight: true,
        representationTable: true,
        style: args.style,
      }),
    );
  } else if (flow?.summary) {
    elements.push(
      createClassicPanel({
        title: args.language === 'en-US' ? 'Why It Matters' : '为什么重要',
        lines: [flow.summary],
        left: CONTENT_LEFT,
        top: tableTop,
        width: CONTENT_WIDTH,
        height: tableHeight,
        tone: {
          fill: CLASSIC_BUSINESS.panelFillBlue,
          border: '#bfdbfe',
          accent: CLASSIC_BUSINESS.blue,
        },
        bodyFontSize: 16,
      }),
    );
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicVisualThreeStepsTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
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
  const elements: PPTElement[] = [...titleResult.elements];
  const textBlocks = getClassicTextBlocks(args.blocks);
  const leadLines = firstClassicLines(args.language, textBlocks, 3);
  const topHeight = 126;
  const leftWidth = 420;
  const rightLeft = CONTENT_LEFT + leftWidth + 34;
  const rightWidth = CONTENT_WIDTH - leftWidth - 34;
  elements.push(
    createTextElement({
      left: CONTENT_LEFT,
      top: titleResult.bodyTop + 6,
      width: leftWidth,
      height: topHeight,
      html: leadLines
        .slice(0, 1)
        .map((line) => compactClassicTextLine(line, args.language === 'en-US' ? 92 : 56))
        .map((line, index) => {
          const fontSize = 18;
          const weight = 740;
          return `<p style="font-size:${fontSize}px;line-height:${Math.round(fontSize * 1.38)}px;color:${index === 0 ? CLASSIC_BUSINESS.titleText : CLASSIC_BUSINESS.mutedText};font-weight:${weight};">${renderClassicInlineHtml(line)}</p>`;
        })
        .join(''),
      color: CLASSIC_BUSINESS.titleText,
      textType: 'subtitle',
    }),
  );
  elements.push(
    ...renderVisualPanel({
      visual: args.visual,
      blocks: args.blocks,
      language: args.language,
      left: rightLeft,
      top: titleResult.bodyTop,
      width: rightWidth,
      height: topHeight,
      tokens: args.tokens,
    }),
  );

  const cardsBlock = findFirstBlock(args.blocks, 'layout_cards');
  const flowBlock = findFirstBlock(args.blocks, 'process_flow');
  const cardBlocks: NotebookContentBlock[] = cardsBlock
    ? layoutCardsToBlocks(cardsBlock)
    : flowBlock
      ? flowBlock.steps.slice(0, 3).map((step) => ({
          type: 'paragraph',
          cardTitle: step.title,
          text: step.detail,
        }))
      : textBlocks.slice(0, 3);
  const cardTop = titleResult.bodyTop + topHeight + 18;
  const cardGap = 26;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  const maxCardHeight = CONTENT_BOTTOM - cardTop - 10;
  const bodyFontSize = 11;
  const maxLines = 8;
  const maxCharsPerLine = args.language === 'en-US' ? 48 : 21;
  const estimatedCardHeight = Math.max(
    142,
    ...cardBlocks.slice(0, 3).map((block) =>
      estimateClassicCardContentHeight({
        block,
        language: args.language,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    ),
  );
  const cardHeight = Math.min(maxCardHeight, Math.min(212, estimatedCardHeight + 16));
  const cardTopAdjusted = cardTop + Math.max(0, (maxCardHeight - cardHeight) * 0.28);
  const cardTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.red },
  ];
  cardBlocks.slice(0, 3).forEach((block, index) => {
    const tone = cardTones[index % cardTones.length];
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: CONTENT_LEFT + index * (cardWidth + cardGap),
        top: cardTopAdjusted,
        width: cardWidth,
        height: cardHeight,
        tone,
        style: args.style,
        titleColor: tone.accent,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    );
  });

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function blockToClassicPanelData(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock | undefined,
  fallbackTitle: string,
): { title: string; lines: string[] } {
  if (!block) return { title: fallbackTitle, lines: [] };
  return {
    title: blockToGridHeading(language, block).trim() || fallbackTitle,
    lines: blockSummaryLines(language, block).slice(0, 5),
  };
}

function renderClassicTwoByOneSummaryTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const textBlocks = getClassicTextBlocks(args.blocks);
  const callouts = args.blocks.filter(
    (block): block is Extract<NotebookContentBlock, { type: 'callout' }> =>
      block.type === 'callout',
  );
  const panelBlocks =
    textBlocks.length >= 3
      ? textBlocks.slice(0, 3)
      : [
          ...textBlocks,
          ...callouts.filter((block) => !textBlocks.includes(block)),
          ...args.blocks.filter((block) => !textBlocks.includes(block) && block.type !== 'visual'),
        ].slice(0, 3);
  const left = blockToClassicPanelData(
    args.language,
    panelBlocks[0],
    args.language === 'en-US' ? 'Main Contribution' : '主要贡献',
  );
  const right = blockToClassicPanelData(
    args.language,
    panelBlocks[1],
    args.language === 'en-US' ? 'Key Strength' : '关键优势',
  );
  const bottom = blockToClassicPanelData(
    args.language,
    panelBlocks[2],
    args.language === 'en-US' ? 'Limitations / Next Steps' : '限制与下一步',
  );
  const top = titleResult.bodyTop;
  const topHeight = 214;
  const columnGap = 16;
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
  const bottomTop = top + topHeight + 14;
  const bottomHeight = 514 - bottomTop;
  elements.push(
    createClassicPanel({
      title: left.title,
      lines: left.lines,
      left: CONTENT_LEFT,
      top,
      width: columnWidth,
      height: topHeight,
      tone: {
        fill: CLASSIC_BUSINESS.panelFillBlue,
        border: '#bfdbfe',
        accent: CLASSIC_BUSINESS.blue,
      },
      titleColor: CLASSIC_BUSINESS.blue,
      bodyFontSize: 16,
      maxLines: 4,
    }),
    createClassicPanel({
      title: right.title,
      lines: right.lines,
      left: CONTENT_LEFT + columnWidth + columnGap,
      top,
      width: columnWidth,
      height: topHeight,
      tone: {
        fill: CLASSIC_BUSINESS.panelFillWarm,
        border: '#fed7aa',
        accent: '#c2410c',
      },
      titleColor: '#c2410c',
      bodyFontSize: 16,
      maxLines: 4,
    }),
    createClassicPanel({
      title: bottom.title,
      lines:
        bottom.lines.length > 0 ? bottom.lines : firstClassicLines(args.language, args.blocks, 4),
      left: CONTENT_LEFT,
      top: bottomTop,
      width: CONTENT_WIDTH,
      height: bottomHeight,
      tone: {
        fill: CLASSIC_BUSINESS.panelFillGreen,
        border: '#bbf7d0',
        accent: CLASSIC_BUSINESS.green,
      },
      titleColor: CLASSIC_BUSINESS.green,
      bodyFontSize: 15,
      maxLines: 3,
    }),
  );

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicThreeCardsTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const cardsBlock = findFirstBlock(args.blocks, 'layout_cards');
  const textBlocks = getClassicTextBlocks(args.blocks);
  const cardBlocks = cardsBlock
    ? layoutCardsToBlocks(cardsBlock).slice(0, 3)
    : textBlocks.slice(0, 3);
  const leadLines = cardsBlock
    ? firstClassicLines(
        args.language,
        textBlocks.filter((block) => block !== cardsBlock),
        1,
      )
    : [];

  const leadTop = titleResult.bodyTop;
  const leadHeight = leadLines.length > 0 ? 34 : 0;
  if (leadLines.length > 0) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: leadTop,
        width: CONTENT_WIDTH,
        height: leadHeight,
        html: leadLines
          .map(
            (line) =>
              `<p style="font-size:15px;line-height:20px;color:${args.style.mutedText};">${renderClassicInlineHtml(compactClassicTextLine(line, args.language === 'en-US' ? 112 : 58))}</p>`,
          )
          .join(''),
        color: args.style.mutedText,
        textType: 'content',
      }),
    );
  }

  const cardGap = 26;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  const bodyFontSize = 15;
  const maxLines = 4;
  const maxCharsPerLine = args.language === 'en-US' ? 56 : 27;
  const estimatedCardHeight = Math.max(
    178,
    ...cardBlocks.map((block) =>
      estimateClassicCardContentHeight({
        block,
        language: args.language,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    ),
  );
  const cardHeight = Math.min(230, estimatedCardHeight + 16);
  const availableTop = titleResult.bodyTop + leadHeight + (leadHeight ? 10 : 0);
  const availableHeight = CONTENT_BOTTOM - availableTop - 22;
  const cardTop = availableTop + Math.max(0, (availableHeight - cardHeight) * 0.4);
  const cardTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.red },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
  ];

  cardBlocks.slice(0, 3).forEach((block, index) => {
    const tone = cardTones[index % cardTones.length];
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: CONTENT_LEFT + index * (cardWidth + cardGap),
        top: cardTop,
        width: cardWidth,
        height: cardHeight,
        tone,
        style: args.style,
        titleColor: tone.accent,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    );
  });

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function classicCardBlocksFromDocument(args: {
  blocks: NotebookContentBlock[];
  count: number;
}): NotebookContentBlock[] {
  const cardsBlock = findFirstBlock(args.blocks, 'layout_cards');
  if (cardsBlock) return layoutCardsToBlocks(cardsBlock).slice(0, args.count);
  return getClassicTextBlocks(args.blocks).slice(0, args.count);
}

function renderClassicTextImageSplitTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
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
  const elements: PPTElement[] = [...titleResult.elements];
  const textBlocks = getClassicTextBlocks(args.blocks);
  const main = blockToClassicPanelData(
    args.language,
    textBlocks[0],
    args.language === 'en-US' ? 'Core Idea' : '核心说明',
  );
  const supportingLines = firstClassicLines(args.language, textBlocks.slice(1), 3);
  const contentTop = titleResult.bodyTop + 6;
  const contentHeight = CONTENT_BOTTOM - contentTop - 18;
  const gap = 34;
  const textWidth = 410;
  const visualLeft = CONTENT_LEFT + textWidth + gap;
  const visualWidth = CONTENT_WIDTH - textWidth - gap;
  const panelLines = [...main.lines, ...supportingLines].slice(0, 6);

  elements.push(
    createClassicPanel({
      title: main.title,
      lines: panelLines,
      left: CONTENT_LEFT,
      top: contentTop + 14,
      width: textWidth,
      height: Math.min(300, contentHeight - 28),
      tone: {
        fill: args.style.panelFillBlue,
        border: args.style.borderBlue,
        accent: args.style.blue,
      },
      titleColor: args.style.blue,
      bodyFontSize: 16,
      maxLines: 6,
    }),
    ...renderVisualPanel({
      visual: args.visual,
      blocks: args.blocks,
      language: args.language,
      left: visualLeft,
      top: contentTop + 14,
      width: visualWidth,
      height: Math.min(300, contentHeight - 28),
      tokens: args.tokens,
    }),
  );

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicFourColumnsTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const cardBlocks = classicCardBlocksFromDocument({ blocks: args.blocks, count: 4 });
  const cardGap = 18;
  const cardWidth = (CONTENT_WIDTH - cardGap * 3) / 4;
  const bodyFontSize = 10.5;
  const maxLines = 8;
  const maxCharsPerLine = args.language === 'en-US' ? 34 : 13;
  const contentTop = titleResult.bodyTop + 28;
  const maxCardHeight = CONTENT_BOTTOM - contentTop - 28;
  const estimatedCardHeight = Math.max(
    210,
    ...cardBlocks.map((block) =>
      estimateClassicCardContentHeight({
        block,
        language: args.language,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    ),
  );
  const cardHeight = Math.min(maxCardHeight, Math.min(250, estimatedCardHeight + 12));
  const cardTop = contentTop + Math.max(0, (maxCardHeight - cardHeight) * 0.35);
  const cardTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.red },
    { fill: '#fff7dc', border: '#f8df98', accent: '#b7791f' },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
  ];

  cardBlocks.slice(0, 4).forEach((block, index) => {
    const tone = cardTones[index % cardTones.length];
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: CONTENT_LEFT + index * (cardWidth + cardGap),
        top: cardTop,
        width: cardWidth,
        height: cardHeight,
        tone,
        style: args.style,
        titleColor: tone.accent,
        bodyFontSize,
        maxLines,
        maxCharsPerLine,
      }),
    );
  });

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicGrid2x2Template(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const cardBlocks = classicCardBlocksFromDocument({ blocks: args.blocks, count: 4 });
  const gapX = 24;
  const gapY = 18;
  const contentTop = titleResult.bodyTop + 10;
  const availableHeight = CONTENT_BOTTOM - contentTop - 22;
  const cardWidth = (CONTENT_WIDTH - gapX) / 2;
  const cardHeight = Math.min(174, (availableHeight - gapY) / 2);
  const topOffset = Math.max(0, (availableHeight - (cardHeight * 2 + gapY)) * 0.3);
  const cardTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.red },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
    { fill: '#fff7dc', border: '#f8df98', accent: '#b7791f' },
  ];

  cardBlocks.slice(0, 4).forEach((block, index) => {
    const tone = cardTones[index % cardTones.length];
    const col = index % 2;
    const row = Math.floor(index / 2);
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: CONTENT_LEFT + col * (cardWidth + gapX),
        top: contentTop + topOffset + row * (cardHeight + gapY),
        width: cardWidth,
        height: cardHeight,
        tone,
        style: args.style,
        titleColor: tone.accent,
        bodyFontSize: 13,
        maxLines: 5,
        maxCharsPerLine: args.language === 'en-US' ? 58 : 28,
      }),
    );
  });

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicTwoTextImageTemplate(args: {
  title: string;
  document: NotebookContentDocument;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
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
  const elements: PPTElement[] = [...titleResult.elements];
  const textBlocks = classicCardBlocksFromDocument({ blocks: args.blocks, count: 2 });
  const first = blockToClassicPanelData(
    args.language,
    textBlocks[0],
    args.language === 'en-US' ? 'First Point' : '第一块',
  );
  const second = blockToClassicPanelData(
    args.language,
    textBlocks[1],
    args.language === 'en-US' ? 'Second Point' : '第二块',
  );
  const contentTop = titleResult.bodyTop + 6;
  const contentHeight = CONTENT_BOTTOM - contentTop - 18;
  const gap = 34;
  const textWidth = 392;
  const panelGap = 18;
  const panelHeight = (contentHeight - panelGap) / 2;
  const visualLeft = CONTENT_LEFT + textWidth + gap;
  const visualWidth = CONTENT_WIDTH - textWidth - gap;

  elements.push(
    createClassicPanel({
      title: first.title,
      lines: first.lines,
      left: CONTENT_LEFT,
      top: contentTop,
      width: textWidth,
      height: panelHeight,
      tone: {
        fill: args.style.panelFillBlue,
        border: args.style.borderBlue,
        accent: args.style.blue,
      },
      titleColor: args.style.blue,
      bodyFontSize: 15,
      maxLines: 4,
    }),
    createClassicPanel({
      title: second.title,
      lines: second.lines,
      left: CONTENT_LEFT,
      top: contentTop + panelHeight + panelGap,
      width: textWidth,
      height: panelHeight,
      tone: {
        fill: args.style.panelFillGreen,
        border: args.style.borderGreen,
        accent: args.style.green,
      },
      titleColor: args.style.green,
      bodyFontSize: 15,
      maxLines: 4,
    }),
    ...renderVisualPanel({
      visual: args.visual,
      blocks: args.blocks,
      language: args.language,
      left: visualLeft,
      top: contentTop,
      width: visualWidth,
      height: contentHeight,
      tokens: args.tokens,
    }),
  );

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function isDefinitionOrTheoremBlock(
  block: NotebookContentBlock,
): block is Extract<NotebookContentBlock, { type: 'definition' | 'theorem' }> {
  return block.type === 'definition' || block.type === 'theorem';
}

function hasDefinitionSignal(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): boolean {
  const heading = blockToGridHeading(language, block);
  const body = blockSummaryLines(language, block).join('\n');
  const text = `${heading}\n${body}`.toLowerCase();
  if (language === 'zh-CN') {
    return /定义|函数|映射|定义域|陪域|值域|规则|边界/.test(text);
  }
  return /\b(definition|defined|function|domain|codomain|range|rule|boundary|graph)\b/.test(text);
}

function derivationStepsToDefinitionCards(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock | undefined,
): NotebookContentBlock[] {
  if (!block || block.type !== 'derivation_steps') return [];
  return block.steps.slice(0, 2).map((step, index) => ({
    type: 'paragraph' as const,
    cardTitle:
      step.explanation || (language === 'en-US' ? `Check ${index + 1}` : `判断 ${index + 1}`),
    text: step.expression,
  }));
}

function renderClassicDefinitionBoardTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const cardsBlock = findFirstBlock(args.blocks, 'layout_cards');
  const textBlocks = getClassicTextBlocks(args.blocks);
  const derivationBlock = findFirstBlock(args.blocks, 'derivation_steps');
  const definitionBlock =
    args.blocks.find(isDefinitionOrTheoremBlock) ||
    textBlocks.find((block) => hasDefinitionSignal(args.language, block)) ||
    textBlocks.find(shouldUseBlockAsDefinitionPoint);
  const definitionData = blockToClassicPanelData(
    args.language,
    definitionBlock,
    args.language === 'en-US' ? 'Formal Definition' : '正式定义',
  );
  const derivationCardBlocks = derivationStepsToDefinitionCards(args.language, derivationBlock);
  const supportingBlocks = textBlocks.filter(
    (block) =>
      block !== definitionBlock &&
      shouldUseBlockAsDefinitionPoint(block) &&
      !hasDefinitionSignal(args.language, block),
  );
  const generatedCardBlocks =
    derivationCardBlocks.length > 0 ? derivationCardBlocks : supportingBlocks;
  const cardBlocks = (cardsBlock ? layoutCardsToBlocks(cardsBlock) : generatedCardBlocks).slice(
    0,
    derivationCardBlocks.length > 0 ? 2 : 3,
  );
  const contentTop = titleResult.bodyTop + 8;
  const contentHeight = CONTENT_BOTTOM - contentTop - 20;
  const leftWidth = 520;
  const gap = 26;
  const rightLeft = CONTENT_LEFT + leftWidth + gap;
  const rightWidth = CONTENT_WIDTH - leftWidth - gap;
  const bottomHeight = cardBlocks.length >= 3 ? 0 : 112;
  const upperHeight = contentHeight - bottomHeight - (bottomHeight ? 16 : 0);
  const rightGap = 14;
  const rightCardHeight = Math.max(
    72,
    (upperHeight - rightGap * Math.max(0, Math.min(3, cardBlocks.length || 3) - 1)) /
      Math.max(1, Math.min(3, cardBlocks.length || 3)),
  );

  elements.push(
    createClassicPanel({
      title: definitionData.title,
      lines: definitionData.lines,
      left: CONTENT_LEFT,
      top: contentTop + 10,
      width: leftWidth,
      height: upperHeight - 6,
      tone: {
        fill: args.style.panelFill,
        border: args.style.border,
        accent: args.style.blue,
      },
      titleColor: args.style.blue,
      bodyFontSize: args.language === 'en-US' ? 13 : 15,
      showMarkers: false,
      maxLines: 6,
      maxCharsPerLine: args.language === 'en-US' ? 44 : 22,
    }),
  );

  const fallbackCardBlocks =
    cardBlocks.length > 0
      ? cardBlocks
      : definitionData.lines.slice(1, 4).map(
          (line, index): NotebookContentBlock => ({
            type: 'paragraph',
            cardTitle: args.language === 'en-US' ? `Point ${index + 1}` : `要点 ${index + 1}`,
            text: line,
          }),
        );
  const cardTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.red },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
  ];

  fallbackCardBlocks.slice(0, 3).forEach((block, index) => {
    const tone = cardTones[index % cardTones.length];
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: rightLeft,
        top: contentTop + 10 + index * (rightCardHeight + rightGap),
        width: rightWidth,
        height: rightCardHeight,
        tone,
        style: args.style,
        titleColor: tone.accent,
        bodyFontSize: args.language === 'en-US' ? 10.5 : 12,
        maxLines: 5,
        maxCharsPerLine: args.language === 'en-US' ? 34 : 20,
      }),
    );
  });

  const callout = args.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'callout' }> =>
      block.type === 'callout' && block !== definitionBlock,
  );
  const bottomLines =
    callout?.text || supportingBlocks[0]
      ? [callout?.text || blockSummaryLines(args.language, supportingBlocks[0])[0] || '']
      : [];
  if (bottomHeight && bottomLines.length > 0) {
    elements.push(
      createClassicPanel({
        title: callout?.title || (args.language === 'en-US' ? 'Takeaway' : '关键结论'),
        lines: bottomLines,
        left: CONTENT_LEFT,
        top: contentTop + upperHeight + 16,
        width: CONTENT_WIDTH,
        height: bottomHeight,
        tone: {
          fill: args.style.panelFillBlue,
          border: args.style.borderBlue,
          accent: args.style.blue,
        },
        titleColor: args.style.blue,
        bodyFontSize: args.language === 'en-US' ? 11.5 : 12,
        showMarkers: false,
        compactTitle: true,
        maxLines: 3,
        maxCharsPerLine: args.language === 'en-US' ? 96 : 46,
      }),
    );
  }

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicDerivationLadderTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const derivation = findFirstBlock(args.blocks, 'derivation_steps');
  const example = findFirstBlock(args.blocks, 'example');
  const steps = derivation
    ? derivation.steps.map((step) =>
        [step.expression, step.explanation].filter(Boolean).join(' — '),
      )
    : example?.steps?.length
      ? example.steps
      : args.blocks.flatMap((block) => blockSummaryLines(args.language, block));
  const visibleSteps = steps.slice(0, 4);
  const contentTop = titleResult.bodyTop + 6;
  const contentHeight = CONTENT_BOTTOM - contentTop - 20;
  const leftWidth = 560;
  const gap = 28;
  const rightLeft = CONTENT_LEFT + leftWidth + gap;
  const rightWidth = CONTENT_WIDTH - leftWidth - gap;
  const stepGap = 12;
  const stepHeight = Math.max(
    72,
    (contentHeight - stepGap * Math.max(0, visibleSteps.length - 1)) /
      Math.max(1, visibleSteps.length || 1),
  );
  const stepTones: ContentCardTone[] = [
    { fill: args.style.panelFillBlue, border: args.style.borderBlue, accent: args.style.blue },
    { fill: args.style.panelFillGreen, border: args.style.borderGreen, accent: args.style.green },
    { fill: args.style.panelFillWarm, border: args.style.borderWarm, accent: args.style.yellow },
    { fill: args.style.panelFillRed, border: args.style.borderRed, accent: args.style.red },
  ];

  visibleSteps.forEach((step, index) => {
    const tone = stepTones[index % stepTones.length];
    elements.push(
      createClassicPanel({
        title: args.language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`,
        lines: [step],
        left: CONTENT_LEFT,
        top: contentTop + index * (stepHeight + stepGap),
        width: leftWidth,
        height: stepHeight,
        tone,
        titleColor: tone.accent,
        bodyFontSize: 13,
        compactTitle: true,
        maxLines: 3,
      }),
    );
  });

  const takeawayBlock =
    findFirstBlock(args.blocks, 'callout') ||
    args.blocks.find((block) => block.type === 'theorem') ||
    args.blocks.find((block) => block.type === 'definition');
  const takeaway = blockToClassicPanelData(
    args.language,
    takeawayBlock,
    args.language === 'en-US' ? 'Key Move' : '关键动作',
  );
  elements.push(
    createClassicPanel({
      title: takeaway.title,
      lines: takeaway.lines.length > 0 ? takeaway.lines : visibleSteps.slice(-1),
      left: rightLeft,
      top: contentTop,
      width: rightWidth,
      height: Math.min(220, contentHeight),
      tone: {
        fill: args.style.panelFill,
        border: args.style.border,
        accent: args.style.blue,
      },
      titleColor: args.style.blue,
      bodyFontSize: 15,
      maxLines: 5,
    }),
  );

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicFormulaFocusTemplate(args: {
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
  const elements: PPTElement[] = [...titleResult.elements];
  const equation = findFirstBlock(args.blocks, 'equation');
  const definition = findFirstBlock(args.blocks, 'definition');
  const bulletList = findFirstBlock(args.blocks, 'bullet_list');
  const zh = args.language === 'zh-CN';
  const contentTop = titleResult.bodyTop + 4;
  const formulaTop = contentTop;
  const formulaHeight = 138;
  const formulaGroupId = createCardGroupId('classic_formula_focus');
  const formulaLabel = zh ? '核心公式' : 'Core Formula';
  const fallbackFormulaCaption = zh
    ? '把函数看作一种关系时的图像'
    : 'Graph of a function as a relation';
  const rawFormulaCaption = equation?.caption?.trim();
  const formulaCaption =
    rawFormulaCaption &&
    !/[$\\]/.test(rawFormulaCaption) &&
    rawFormulaCaption.length <= (zh ? 34 : 64)
      ? rawFormulaCaption
      : fallbackFormulaCaption;
  const formulaLatex =
    equation?.latex ||
    (zh
      ? '\\Gamma(f)=\\{(a,f(a)) : a\\in A\\}\\subseteq A\\times B'
      : '\\Gamma(f)=\\{(a,f(a)) : a\\in A\\}\\subseteq A\\times B');

  elements.push(
    createRectShape({
      left: CONTENT_LEFT,
      top: formulaTop,
      width: CONTENT_WIDTH,
      height: formulaHeight,
      fill: args.style.panelFill,
      outlineColor: args.style.borderWarm,
      shadow: {
        h: 0,
        v: 8,
        blur: 22,
        color: args.style.shadow,
      },
      groupId: formulaGroupId,
    }),
    createRectShape({
      left: CONTENT_LEFT,
      top: formulaTop + 18,
      width: 4,
      height: formulaHeight - 36,
      fill: args.style.blue,
    }),
    createTextElement({
      left: CONTENT_LEFT + 24,
      top: formulaTop + 18,
      width: 160,
      height: 46,
      html: `<p style="margin:0;font-size:15px;line-height:20px;color:${args.style.blue};font-weight:820;">${escapeHtml(formulaLabel)}</p>`,
      color: args.style.blue,
      groupId: formulaGroupId,
      textType: 'item',
    }),
    createTextElement({
      left: CONTENT_LEFT + CONTENT_WIDTH - 330,
      top: formulaTop + 18,
      width: 306,
      height: 44,
      html: `<p style="margin:0;font-size:11px;line-height:16px;color:${args.style.mutedText};text-align:right;">${renderClassicInlineHtml(formulaCaption)}</p>`,
      color: args.style.mutedText,
      groupId: formulaGroupId,
      textType: 'notes',
    }),
    createLatexElement({
      latex: formulaLatex,
      left: CONTENT_LEFT + 46,
      top: formulaTop + 54,
      width: CONTENT_WIDTH - 92,
      height: 72,
      align: 'center',
      color: args.style.titleText,
      groupId: formulaGroupId,
    }),
  );

  const readingLines = zh
    ? [
        '$\\Gamma(f)$：把函数写成所有输入输出配对的集合。',
        '$(a,f(a))$：每个输入和自己的输出配成一对。',
        '$\\subseteq A\\times B$：所有配对都落在定义域与陪域的笛卡尔积中。',
      ]
    : [
        '$\\Gamma(f)$ records the graph as all input-output pairs.',
        '$(a,f(a))$ pairs each input with its own output.',
        '$\\subseteq A\\times B$ keeps every pair inside domain times codomain.',
      ];
  const ruleLines =
    bulletList?.items.length && bulletList.items.length > 0
      ? bulletList.items
      : zh
        ? [
            '存在性：每个 $a\\in A$ 都必须有输出。',
            '唯一性：同一个输入不能配到两个不同输出。',
            '陪域是允许输出的空间，值域是实际出现的输出。',
          ]
        : [
            'Left-total: every $a\\in A$ has an output.',
            'Functional: no input is paired with two outputs.',
            'Codomain is allowed output space; range is actual outputs.',
          ];
  const rawDefinitionLine = definition?.text?.trim();
  const definitionLine =
    rawDefinitionLine &&
    rawDefinitionLine.length <= (zh ? 56 : 86) &&
    !/\\Gamma|\\subseteq|A\\times B/.test(rawDefinitionLine)
      ? rawDefinitionLine
      : zh
        ? '先把函数当作“定义域、陪域、唯一输出规则”的数据结构来读。'
        : 'Read a function as data: domain, codomain, and one-output rule.';
  const cardTop = formulaTop + formulaHeight + 34;
  const cardGap = 24;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
  const cardHeight = CONTENT_BOTTOM - cardTop - 12;

  elements.push(
    createClassicPanel({
      title: zh ? '公式读法' : 'How to Read It',
      lines: [definitionLine, ...readingLines],
      left: CONTENT_LEFT,
      top: cardTop,
      width: cardWidth,
      height: cardHeight,
      tone: {
        fill: args.style.panelFillBlue,
        border: args.style.borderBlue,
        accent: args.style.blue,
      },
      titleColor: args.style.blue,
      bodyFontSize: zh ? 12 : 13,
      showMarkers: false,
      maxLines: zh ? 6 : 5,
      maxCharsPerLine: zh ? 31 : 42,
    }),
    createClassicPanel({
      title: bulletList?.cardTitle || (zh ? '函数判定' : 'Function Test'),
      lines: ruleLines,
      left: CONTENT_LEFT + cardWidth + cardGap,
      top: cardTop,
      width: cardWidth,
      height: cardHeight,
      tone: {
        fill: args.style.panelFill,
        border: args.style.borderWarm,
        accent: args.style.yellow,
      },
      titleColor: args.style.yellow,
      bodyFontSize: zh ? 13 : 13,
      numbered: true,
      maxLines: 5,
      maxCharsPerLine: zh ? 30 : 42,
    }),
  );

  return createClassicLectureSlide({ elements, tokens: args.tokens, style: args.style });
}

function renderClassicLectureTemplateSlide(args: {
  title: string;
  document: NotebookContentDocument;
  template: NotebookContentLayoutTemplate;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
}): Slide {
  const style = getClassicDeckStyle(args.document);
  if (args.template === 'image_title_overlay') {
    return renderClassicImageTitleOverlayTemplate({ ...args, style });
  }
  if (args.template === 'cinematic_title_frame') {
    return renderClassicCinematicTitleFrameTemplate({ ...args, style });
  }
  if (args.template === 'tech_hero_title') {
    return renderClassicTechHeroTitleTemplate({ ...args, style });
  }
  if (args.template === 'pipeline_table') {
    return renderClassicPipelineTableTemplate({ ...args, style });
  }
  if (args.template === 'comparison_matrix') {
    return renderClassicComparisonMatrixTemplate({ ...args, style });
  }
  if (args.template === 'visual_three_steps') {
    return renderClassicVisualThreeStepsTemplate({ ...args, style });
  }
  if (args.template === 'process_steps') {
    return renderClassicProcessStepsTemplate({ ...args, style });
  }
  if (args.template === 'three_cards') {
    return renderClassicThreeCardsTemplate({ ...args, style });
  }
  if (args.template === 'text_image_split') {
    return renderClassicTextImageSplitTemplate({ ...args, style });
  }
  if (args.template === 'four_columns') {
    return renderClassicFourColumnsTemplate({ ...args, style });
  }
  if (args.template === 'grid_2x2') {
    return renderClassicGrid2x2Template({ ...args, style });
  }
  if (args.template === 'two_text_image') {
    return renderClassicTwoTextImageTemplate({ ...args, style });
  }
  if (args.template === 'definition_board') {
    return renderClassicDefinitionBoardTemplate({ ...args, style });
  }
  if (args.template === 'derivation_ladder') {
    return renderClassicDerivationLadderTemplate({ ...args, style });
  }
  if (args.template === 'formula_focus') {
    return renderClassicFormulaFocusTemplate({ ...args, style });
  }
  return renderClassicTwoByOneSummaryTemplate({ ...args, style });
}

function inferLayoutTemplateFromDocument(args: {
  document: NotebookContentDocument;
  family: NotebookContentLayoutFamily;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
}): NotebookContentLayoutTemplate {
  if (args.document.layoutTemplate) return args.document.layoutTemplate;

  switch (args.family) {
    case 'cover':
      return 'cover_hero';
    case 'section':
      return 'section_divider';
    case 'visual_split':
      return args.document.continuation?.partNumber &&
        args.document.continuation.partNumber % 2 === 0
        ? 'visual_left'
        : 'visual_right';
    case 'comparison':
      return 'pipeline_table';
    case 'timeline':
      return 'timeline_road';
    case 'problem_statement':
      return 'problem_focus';
    case 'problem_solution':
    case 'derivation':
      return 'steps_sidebar';
    case 'code_walkthrough':
      return 'code_split';
    case 'formula_focus':
      return 'formula_focus';
    case 'summary':
      return 'two_by_one_summary';
    case 'concept_cards':
    default:
      if (args.visual) return 'visual_right';
      if (args.blocks.length <= 1) return 'title_content';
      if (args.blocks.length === 2) return 'two_column';
      if (args.blocks.length === 3) return 'three_cards';
      return 'four_grid';
  }
}

function isHumanitiesDiscipline(style?: NotebookContentDisciplineStyle): boolean {
  return style === 'humanities' || style === 'social_science';
}

function isHumanitiesTeachingFlow(flow?: NotebookContentTeachingFlow): boolean {
  return (
    flow === 'argument_evidence' ||
    flow === 'close_reading' ||
    flow === 'case_analysis' ||
    flow === 'comparison_review'
  );
}

function isHumanitiesAnalysisTemplate(template: NotebookContentLayoutTemplate): boolean {
  return (
    template === 'thesis_evidence' ||
    template === 'quote_analysis' ||
    template === 'source_close_reading' ||
    template === 'case_analysis' ||
    template === 'argument_map' ||
    template === 'compare_perspectives'
  );
}

function isDefinitionBoardTemplate(template: NotebookContentLayoutTemplate): boolean {
  return template === 'definition_board' || template === 'concept_map';
}

function renderBlockCardGrid(args: {
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  left: number;
  top: number;
  width: number;
  height: number;
  columns: number;
  maxItems: number;
  cardPalettes: readonly ContentCardTone[];
  bodyFontSize?: number;
}): PPTElement[] {
  const items = args.blocks.slice(0, args.maxItems);
  if (items.length === 0) return [];
  const columns = Math.max(1, Math.min(args.columns, items.length));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const cardWidth = (args.width - Math.max(0, columns - 1) * GRID_GAP_X) / columns;
  const cardHeight = (args.height - Math.max(0, rows - 1) * GRID_GAP_Y) / rows;

  return items.map((block, index) =>
    createBlockCard({
      block,
      language: args.language,
      left: args.left + (index % columns) * (cardWidth + GRID_GAP_X),
      top: args.top + Math.floor(index / columns) * (cardHeight + GRID_GAP_Y),
      width: cardWidth,
      height: cardHeight,
      tone: args.cardPalettes[index % args.cardPalettes.length],
      bodyFontSize: args.bodyFontSize,
    }),
  );
}

function renderTitleContentTemplate(args: {
  title: string;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
  bodyTop: number;
  bodyHeight: number;
}): PPTElement[] {
  const primary = args.blocks[0];
  const lines = primary ? blockSummaryLines(args.language, primary) : [args.title];
  const lead = lines[0] || args.title;
  const support = [
    ...lines.slice(1),
    ...args.blocks.slice(1).flatMap((block) => blockSummaryLines(args.language, block)),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  const elements: PPTElement[] = [
    createTextElement({
      left: CONTENT_LEFT,
      top: args.bodyTop,
      width: CONTENT_WIDTH,
      height: support.length > 0 ? 192 : args.bodyHeight,
      html: `<p style="font-size:25px;line-height:35px;color:${ACADEMY_PAPER.titleText};font-weight:760;">${renderInlineLatexToHtml(lead)}</p>${
        support.length > 0
          ? support
              .slice(0, 2)
              .map(
                (line) =>
                  `<p style="font-size:15px;line-height:23px;color:#475569;">${renderInlineLatexToHtml(line)}</p>`,
              )
              .join('')
          : ''
      }`,
      color: ACADEMY_PAPER.titleText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      textType: 'content',
    }),
  ];

  if (support.length > 2 || args.blocks.length > 1) {
    const cardBlocks = args.blocks.length > 1 ? args.blocks.slice(1) : [];
    const syntheticBlocks: NotebookContentBlock[] =
      cardBlocks.length > 0
        ? cardBlocks
        : support.slice(2).map((text) => ({ type: 'paragraph', text }));
    elements.push(
      ...renderBlockCardGrid({
        blocks: syntheticBlocks,
        language: args.language,
        left: CONTENT_LEFT,
        top: args.bodyTop + 214,
        width: CONTENT_WIDTH,
        height: args.bodyHeight - 214,
        columns: Math.min(3, Math.max(1, syntheticBlocks.length)),
        maxItems: 3,
        cardPalettes: args.cardPalettes,
        bodyFontSize: 13,
      }),
    );
  }

  return elements;
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

function renderHumanitiesAnalysisTemplate(args: {
  title: string;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  template: NotebookContentLayoutTemplate;
  teachingFlow?: NotebookContentTeachingFlow;
  cardPalettes: readonly ContentCardTone[];
  bodyTop: number;
  bodyHeight: number;
}): PPTElement[] {
  const allLines = uniqueTeachingLines(
    args.blocks.flatMap((block) => blockSummaryLines(args.language, block)),
    8,
  );
  const callout = findFirstBlock(args.blocks, 'callout');
  const primary =
    callout?.text ||
    allLines[0] ||
    (args.language === 'en-US'
      ? 'State the central idea, then support it with evidence.'
      : '先提出中心观点，再用证据支撑。');
  const evidence = uniqueTeachingLines(
    allLines.filter((line) => line !== primary),
    5,
  );
  const isCloseReading =
    args.template === 'quote_analysis' ||
    args.template === 'source_close_reading' ||
    args.teachingFlow === 'close_reading';
  const isCase = args.template === 'case_analysis' || args.teachingFlow === 'case_analysis';
  const isCompare =
    args.template === 'compare_perspectives' || args.teachingFlow === 'comparison_review';
  const leftWidth = isCloseReading ? 430 : 388;
  const rightLeft = CONTENT_LEFT + leftWidth + 28;
  const rightWidth = CONTENT_WIDTH - leftWidth - 28;
  const groupId = createCardGroupId('humanities_analysis');
  const label =
    args.language === 'en-US'
      ? isCloseReading
        ? 'Source / Quote'
        : isCase
          ? 'Case'
          : isCompare
            ? 'Perspective'
            : 'Thesis'
      : isCloseReading
        ? '原文 / 引文'
        : isCase
          ? '案例'
          : isCompare
            ? '观点'
            : '核心论点';
  const rightLabel =
    args.language === 'en-US'
      ? isCloseReading
        ? 'Reading Moves'
        : isCase
          ? 'Analysis Lens'
          : isCompare
            ? 'Compare'
            : 'Evidence Chain'
      : isCloseReading
        ? '细读动作'
        : isCase
          ? '分析维度'
          : isCompare
            ? '对照角度'
            : '证据链';
  const primaryFontSize = primary.length > 180 ? 16 : primary.length > 110 ? 18 : 21;
  const rowCount = Math.max(2, Math.min(4, evidence.length || 3));
  const rowHeight = Math.min(78, Math.max(58, (args.bodyHeight - 42) / rowCount - 8));
  const defaultEvidence =
    args.language === 'en-US'
      ? ['Identify the claim.', 'Locate supporting evidence.', 'Explain why the evidence matters.']
      : ['明确主张。', '定位证据。', '解释证据为何有效。'];
  const evidenceLines = evidence.length > 0 ? evidence : defaultEvidence;

  const elements: PPTElement[] = [
    createRectShape({
      left: CONTENT_LEFT,
      top: args.bodyTop,
      width: leftWidth,
      height: args.bodyHeight,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      groupId,
      shadow: {
        h: 0,
        v: 8,
        blur: 22,
        color: ACADEMY_PAPER.shadow,
      },
    }),
    createTextElement({
      left: CONTENT_LEFT + 24,
      top: args.bodyTop + 22,
      width: leftWidth - 48,
      height: 34,
      groupId,
      html: `<p style="font-size:14px;color:${args.tokens.titleAccent};font-weight:780;">${escapeHtml(label)}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
    createTextElement({
      left: CONTENT_LEFT + 28,
      top: args.bodyTop + 70,
      width: leftWidth - 56,
      height: args.bodyHeight - 104,
      groupId,
      html: `<p style="font-size:${primaryFontSize}px;line-height:${Math.round(primaryFontSize * 1.45)}px;color:${ACADEMY_PAPER.titleText};font-weight:720;">${renderInlineLatexToHtml(primary)}</p>`,
      color: ACADEMY_PAPER.titleText,
      textType: 'content',
    }),
    createTextElement({
      left: rightLeft,
      top: args.bodyTop,
      width: rightWidth,
      height: 34,
      html: `<p style="font-size:15px;color:${args.tokens.titleText};font-weight:780;">${escapeHtml(rightLabel)}</p>`,
      color: args.tokens.titleText,
      textType: 'content',
    }),
  ];

  evidenceLines.slice(0, rowCount).forEach((line, index) => {
    const tone = args.cardPalettes[index % args.cardPalettes.length];
    const rowTop = args.bodyTop + 42 + index * (rowHeight + 10);
    elements.push(
      createRectShape({
        left: rightLeft,
        top: rowTop + 5,
        width: 5,
        height: rowHeight - 10,
        fill: tone.accent,
      }),
      createTextElement({
        left: rightLeft + 18,
        top: rowTop,
        width: rightWidth - 18,
        height: rowHeight,
        html: `<p style="font-size:13px;line-height:19px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${tone.accent};font-weight:800;">${index + 1}</span> ${renderInlineLatexToHtml(line)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: tone.border,
        textType: 'content',
      }),
    );
  });

  return elements;
}

function shouldUseDefinitionFocusTemplate(args: {
  document: NotebookContentDocument;
  family: NotebookContentLayoutFamily;
  blocks: NotebookContentBlock[];
}): boolean {
  if (args.document.archetype === 'definition') return true;
  if (args.family === 'formula_focus') return true;
  if (
    args.blocks.some((block) =>
      ['definition', 'theorem', 'equation', 'matrix', 'derivation_steps'].includes(block.type),
    )
  ) {
    return true;
  }

  const text = [
    args.document.title || '',
    ...args.blocks.flatMap((block) => blockSummaryLines('zh-CN', block)),
  ]
    .join('\n')
    .toLowerCase();
  return /(定义|函数|定理|公式|映射|domain|codomain|definition|function|theorem|formula|mapping)/i.test(
    text,
  );
}

function renderDefinitionFocusTemplate(args: {
  title: string;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
  bodyTop: number;
  bodyHeight: number;
}): PPTElement[] {
  const definition = args.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'definition' | 'theorem' }> =>
      block.type === 'definition' || block.type === 'theorem',
  );
  const equation = findFirstBlock(args.blocks, 'equation');
  const matrix = findFirstBlock(args.blocks, 'matrix');
  const firstParagraph = findFirstBlock(args.blocks, 'paragraph');
  const firstBulletList = findFirstBlock(args.blocks, 'bullet_list');
  const callout = findFirstBlock(args.blocks, 'callout');
  const latex = equation?.latex || (matrix ? matrixBlockToLatex(matrix) : undefined);
  const leadText =
    definition?.text ||
    firstParagraph?.text ||
    args.blocks.flatMap((block) => blockSummaryLines(args.language, block))[0] ||
    args.title;
  const conditionLines = [
    ...(firstBulletList?.items || []),
    ...args.blocks
      .filter(
        (block) =>
          shouldUseBlockAsDefinitionPoint(block) &&
          block !== definition &&
          block !== firstParagraph &&
          block !== firstBulletList &&
          block !== callout &&
          block !== equation &&
          block !== matrix,
      )
      .flatMap((block) => blockSummaryLines(args.language, block)),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== leadText)
    .slice(0, 3);
  const noteText =
    callout?.text || (definition?.type === 'theorem' ? definition.proofIdea : undefined) || '';
  const leftWidth = 520;
  const rightLeft = CONTENT_LEFT + leftWidth + 28;
  const rightWidth = CONTENT_WIDTH - leftWidth - 28;
  const top = args.bodyTop;
  const compactNoteText = noteText
    .split(/[。.!?！？]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(args.language === 'en-US' ? '. ' : '。');
  const hasNote = Boolean(compactNoteText);
  const mainHeight = hasNote ? args.bodyHeight - 110 : args.bodyHeight;
  const groupId = createCardGroupId('definition_focus');
  const elements: PPTElement[] = [
    createRectShape({
      left: CONTENT_LEFT,
      top,
      width: leftWidth,
      height: mainHeight,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.border,
      groupId,
      shadow: {
        h: 0,
        v: 14,
        blur: 34,
        color: ACADEMY_PAPER.shadow,
      },
    }),
    createTextElement({
      left: CONTENT_LEFT + 24,
      top: top + 22,
      width: leftWidth - 48,
      height: 52,
      groupId,
      html: `<p style="margin:0;font-size:15px;line-height:20px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
        args.language === 'en-US' ? 'Formal Definition' : '正式定义',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
  ];

  if (latex) {
    elements.push(
      createLatexElement({
        latex,
        left: CONTENT_LEFT + 34,
        top: top + 82,
        width: leftWidth - 68,
        height: 126,
        align: 'center',
        color: args.tokens.titleText,
        fill: ACADEMY_PAPER.formulaFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        groupId,
      }),
      createTextElement({
        left: CONTENT_LEFT + 30,
        top: top + 222,
        width: leftWidth - 60,
        height: mainHeight - 246,
        groupId,
        html: `<p style="margin:0;font-size:16px;line-height:24px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(leadText)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        textType: 'content',
      }),
    );
  } else {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT + 30,
        top: top + 76,
        width: leftWidth - 60,
        height: mainHeight - 100,
        groupId,
        html: `<p style="margin:0;font-size:21px;line-height:31px;color:${ACADEMY_PAPER.titleText};font-weight:720;">${renderInlineLatexToHtml(leadText)}</p>`,
        color: ACADEMY_PAPER.titleText,
        textType: 'content',
      }),
    );
  }

  const conditionAreaHeight = mainHeight;
  const normalizedConditions =
    conditionLines.length > 0
      ? conditionLines
      : args.blocks.flatMap((block) => blockSummaryLines(args.language, block)).slice(1, 4);
  const visibleConditions = normalizedConditions.slice(0, 3);
  const conditionGap = visibleConditions.length >= 3 ? 10 : 12;
  const rowHeight = Math.max(
    92,
    Math.floor(
      (conditionAreaHeight - conditionGap * Math.max(0, visibleConditions.length - 1)) /
        Math.max(1, visibleConditions.length),
    ),
  );
  const conditionBodyFontSize = visibleConditions.some((line) => line.length > 42) ? 14 : 15;
  const conditionBodyLineHeight = conditionBodyFontSize === 14 ? 20 : 22;
  visibleConditions.forEach((line, index) => {
    const rowTop = top + index * (rowHeight + conditionGap);
    const tone = args.cardPalettes[index % args.cardPalettes.length];
    elements.push(
      createTextElement({
        left: rightLeft,
        top: rowTop,
        width: rightWidth,
        height: rowHeight,
        html: `<p style="margin:0 0 5px 0;font-size:13px;line-height:17px;color:${tone.accent};font-weight:760;">${escapeHtml(
          args.language === 'en-US' ? `Point ${index + 1}` : `要点 ${index + 1}`,
        )}</p><p style="margin:0;font-size:${conditionBodyFontSize}px;line-height:${conditionBodyLineHeight}px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(line)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: tone.fill,
        outlineColor: tone.border,
        textType: 'content',
      }),
    );
  });

  if (hasNote) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: CONTENT_BOTTOM - 78,
        width: CONTENT_WIDTH,
        height: 78,
        html: `<p style="margin:0 0 5px 0;font-size:14px;line-height:18px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
          args.language === 'en-US' ? 'Common Confusion' : '容易混淆',
        )}</p><p style="margin:0;font-size:15px;line-height:22px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(compactNoteText)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        textType: 'content',
      }),
    );
  }

  return elements;
}

type ProblemStatementParts = {
  problem: string;
  hasExplicitProblem: boolean;
  givens: string[];
  goals: string[];
  supportLines: string[];
};

function stripProblemLabel(text: string): string {
  return text.replace(/^(题目|Problem)\s*[：:]\s*/i, '').trim();
}

function stripProblemContextLabel(text: string): string {
  return text
    .replace(/^[•\-\s]+/, '')
    .replace(/^(已知|Given|Known|条件|Condition)\s*[：:]\s*/i, '')
    .replace(/^(目标|Goal|求解目标|证明目标|要求)\s*[：:]\s*/i, '')
    .trim();
}

function isProblemGoalLine(line: string): boolean {
  return /^(目标|Goal|求|证明|要证明|结论|Conclusion|Show|Prove)\b|目标|要求|求出|求得|要证明|不能只写答案|结论|得到/i.test(
    line,
  );
}

function uniqueProblemLines(lines: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  lines
    .map((line) => stripProblemContextLabel(line))
    .filter(Boolean)
    .forEach((line) => {
      const key = line.replace(/\s+/g, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(line);
    });
  return normalized.slice(0, maxItems);
}

function selectProblemStrategyLines(parts: ProblemStatementParts): string[] {
  const stepLines = uniqueProblemLines(
    parts.supportLines.filter((line) =>
      /^(?:\d+\.\s*)?(?:步骤|Step)\s*\d*|^(?:先|再|因此|所以|任取|Then|Thus|Therefore)\b/i.test(
        stripProblemContextLabel(line),
      ),
    ),
    3,
  );
  if (stepLines.length > 0) return stepLines;
  return uniqueProblemLines([...parts.goals, ...parts.givens, ...parts.supportLines], 3);
}

function collectProblemStatementParts(args: {
  title: string;
  language: 'zh-CN' | 'en-US';
  blocks: NotebookContentBlock[];
}): ProblemStatementParts {
  const example = findFirstBlock(args.blocks, 'example');
  const paragraphs = args.blocks.filter(
    (block): block is Extract<NotebookContentBlock, { type: 'paragraph' }> =>
      block.type === 'paragraph',
  );
  const problemParagraph = paragraphs.find((block) =>
    /^(题目|Problem)\s*[：:]/i.test(block.text.trim()),
  );
  const bulletItems = args.blocks
    .filter(
      (block): block is Extract<NotebookContentBlock, { type: 'bullet_list' }> =>
        block.type === 'bullet_list',
    )
    .flatMap((block) => block.items);
  const summaryLines = args.blocks.flatMap((block) => blockSummaryLines(args.language, block));
  const problem = stripProblemLabel(example?.problem || problemParagraph?.text || '');
  const hasExplicitProblem = Boolean(example?.problem || problemParagraph);
  const rawContext = [
    ...(example?.givens || []),
    ...(example?.goal ? [example.goal] : []),
    ...bulletItems,
    ...paragraphs
      .filter((block) => block !== problemParagraph)
      .map((block) => block.text)
      .filter((line) => stripProblemLabel(line) !== problem),
  ];
  const givens: string[] = [];
  const goals: string[] = [];

  rawContext.forEach((line) => {
    const cleanLine = stripProblemContextLabel(line);
    if (!cleanLine || cleanLine === problem) return;
    if (isProblemGoalLine(line)) {
      goals.push(cleanLine);
    } else {
      givens.push(cleanLine);
    }
  });

  if (!hasExplicitProblem && givens.length === 0 && goals.length === 0) {
    summaryLines
      .filter((line) => line.trim() && line.trim() !== args.title)
      .forEach((line) => {
        if (isProblemGoalLine(line)) {
          goals.push(stripProblemContextLabel(line));
        } else {
          givens.push(stripProblemContextLabel(line));
        }
      });
  }

  return {
    problem,
    hasExplicitProblem,
    givens: uniqueProblemLines(givens, 5),
    goals: uniqueProblemLines(goals, 3),
    supportLines: uniqueProblemLines([...givens, ...goals], 6),
  };
}

function normalizeIntervalSnippet(value: string | undefined): string | undefined {
  return value?.replace(/[［]/g, '[').replace(/[］]/g, ']').trim();
}

function normalizeProblemFormulaSnippet(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .trim();
  return normalized || undefined;
}

function extractProblemVisualFacts(text: string): {
  inputSet?: string;
  outputSet?: string;
  expression?: string;
} {
  const inputSet = normalizeIntervalSnippet(
    text.match(/f\s*\(\s*([［\[][^\]］]+[］\]])\s*\)/i)?.[1] ||
      text.match(/输入集合\s*[：:]\s*[（(]?\s*([［\[][^\]］]+[］\]])/i)?.[1],
  );
  const outputSet = normalizeIntervalSnippet(
    text.match(/f\s*\(\s*[［\[][^\]］]+[］\]]\s*\)\s*=\s*([［\[][^\]］]+[］\]])/i)?.[1] ||
      text.match(/像集\s*(?:为|是|=|等于|:|：)\s*([［\[][^\]］]+[］\]])/i)?.[1],
  );
  const expression = normalizeProblemFormulaSnippet(
    text.match(/f\s*\(\s*x\s*\)\s*=\s*([^\s，。,；;）)]+)/i)?.[1],
  );
  return { inputSet, outputSet, expression };
}

function shouldUseProblemMappingVisual(text: string): boolean {
  const facts = extractProblemVisualFacts(text);
  const hasMappingFact = Boolean(facts.inputSet || facts.outputSet || facts.expression);
  const mentionsFunctionMapping =
    /(函数|映射|像集|原像|定义域|陪域|值域|function|mapping|image|preimage|domain|codomain|range)/i.test(
      text,
    );
  const isNumberTheoryProblem =
    /(丢番图|整除|质数|素数|最大公因数|公因数|裴蜀|gcd|diophantine|divisib|prime|bezout)/i.test(
      text,
    );
  const isProofOrWorkedExample =
    /(证明|任取|包含|步骤|求解|推导|先判断|双包含|subseteq|prove|show|step|derive|compute)/i.test(
      text,
    ) || /⊆|⊇/.test(text);

  return (
    hasMappingFact && mentionsFunctionMapping && !isNumberTheoryProblem && !isProofOrWorkedExample
  );
}

function renderProblemInfoRows(args: {
  title: string;
  items: string[];
  left: number;
  top: number;
  width: number;
  height: number;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
  tone: ContentCardTone;
  maxItems?: number;
}): PPTElement[] {
  const rowGap = 8;
  const availableHeight = Math.max(44, args.height - 42);
  const maxRowsByHeight = Math.max(1, Math.floor((availableHeight + rowGap) / (44 + rowGap)));
  const items = uniqueProblemLines(args.items, Math.min(args.maxItems || 4, maxRowsByHeight));
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top + 5,
      width: 5,
      height: Math.min(args.height - 10, 64),
      fill: args.tone.accent,
    }),
    createTextElement({
      left: args.left + 18,
      top: args.top,
      width: args.width - 18,
      height: 34,
      html: `<p style="font-size:16px;color:${args.tokens.titleText};font-weight:780;">${escapeHtml(args.title)}</p>`,
      color: args.tokens.titleText,
      textType: 'content',
    }),
  ];

  if (items.length === 0) {
    elements.push(
      createTextElement({
        left: args.left + 18,
        top: args.top + 42,
        width: args.width - 18,
        height: 54,
        html: `<p style="font-size:14px;line-height:21px;color:#64748b;">${escapeHtml(
          args.language === 'en-US'
            ? 'Extract the usable facts from the prompt.'
            : '从题干中提取可用信息。',
        )}</p>`,
        color: '#6f6471',
        fill: ACADEMY_PAPER.cardFillSoft,
        outlineColor: ACADEMY_PAPER.border,
        textType: 'content',
      }),
    );
    return elements;
  }

  const rowHeight = Math.min(
    62,
    Math.max(44, (availableHeight - rowGap * Math.max(0, items.length - 1)) / items.length),
  );
  items.forEach((item, index) => {
    elements.push(
      createTextElement({
        left: args.left + 18,
        top: args.top + 42 + index * (rowHeight + rowGap),
        width: args.width - 18,
        height: rowHeight,
        html: `<p style="font-size:13px;line-height:19px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${args.tone.accent};font-weight:800;">${index + 1}.</span> ${renderInlineLatexToHtml(item)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: args.tone.border,
        textType: 'content',
      }),
    );
  });

  return elements;
}

function renderProblemMappingVisual(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
}): PPTElement[] {
  const facts = extractProblemVisualFacts(args.text);
  const groupId = createCardGroupId('problem_mapping');
  const compact = args.height < 180;
  const boxWidth = Math.min(118, Math.max(92, (args.width - 86) / 2));
  const boxHeight = compact ? 54 : 76;
  const boxTop = args.top + (compact ? 52 : Math.max(62, Math.min(84, args.height * 0.34)));
  const inputLeft = args.left + 22;
  const outputLeft = args.left + args.width - boxWidth - 22;
  const lineY = boxTop + boxHeight / 2;
  const lineStart = inputLeft + boxWidth + 12;
  const lineEnd = outputLeft - 12;
  const expression = facts.expression ? `f(x)=${facts.expression}` : 'f';
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top,
      width: args.width,
      height: args.height,
      fill: ACADEMY_PAPER.cardFillSoft,
      outlineColor: ACADEMY_PAPER.blueBorder,
      groupId,
    }),
    createTextElement({
      left: args.left + 20,
      top: args.top + 18,
      width: args.width - 40,
      height: 32,
      groupId,
      html: `<p style="font-size:14px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
        args.language === 'en-US' ? 'Reasoning Map' : '求解路径',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
    createTextElement({
      left: inputLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
      groupId,
      html: `<p style="font-size:12px;color:#64748b;text-align:center;">${escapeHtml(
        args.language === 'en-US' ? 'Input' : '输入',
      )}</p><p style="font-size:${compact ? 15 : 18}px;line-height:${compact ? 20 : 24}px;color:${ACADEMY_PAPER.titleText};text-align:center;font-weight:760;">${renderInlineLatexToHtml(facts.inputSet || 'A')}</p>`,
      color: ACADEMY_PAPER.titleText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      textType: 'content',
    }),
    createTextElement({
      left: outputLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
      groupId,
      html: `<p style="font-size:12px;color:#64748b;text-align:center;">${escapeHtml(
        args.language === 'en-US' ? 'Image' : '像集',
      )}</p><p style="font-size:${compact ? 15 : 18}px;line-height:${compact ? 20 : 24}px;color:${ACADEMY_PAPER.titleText};text-align:center;font-weight:760;">${renderInlineLatexToHtml(facts.outputSet || '?')}</p>`,
      color: ACADEMY_PAPER.titleText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: 'rgba(79,174,132,0.26)',
      textType: 'content',
    }),
    createLineElement({
      start: [lineStart, lineY],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLineElement({
      start: [lineEnd - 9, lineY - 6],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLineElement({
      start: [lineEnd - 9, lineY + 6],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLatexElement({
      latex: expression,
      left: lineStart,
      top: lineY - (compact ? 34 : 42),
      width: Math.max(52, lineEnd - lineStart),
      height: compact ? 24 : 30,
      align: 'center',
      color: args.tokens.titleText,
      groupId,
    }),
  ];

  if (!compact) {
    elements.push(
      createTextElement({
        left: args.left + 20,
        top: args.top + args.height - 52,
        width: args.width - 40,
        height: 34,
        groupId,
        html: `<p style="font-size:12px;line-height:17px;color:#475569;text-align:center;">${escapeHtml(
          args.language === 'en-US'
            ? 'Track how the input set becomes the image set.'
            : '先看输入范围，再追踪输出范围。',
        )}</p>`,
        color: '#475569',
        textType: 'notes',
      }),
    );
  }

  return elements;
}

function renderProblemStrategyVisual(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  lines: string[];
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
}): PPTElement[] {
  const groupId = createCardGroupId('problem_strategy');
  const items =
    args.lines.length > 0
      ? uniqueProblemLines(args.lines, 3)
      : args.language === 'en-US'
        ? [
            'Identify the target condition.',
            'Select the theorem or criterion.',
            'Compute cleanly and close the result.',
          ]
        : ['识别目标条件。', '选择对应判据或定理。', '完成计算并收束结论。'];
  const cardGap = 10;
  const headerHeight = 48;
  const cardHeight = Math.max(
    44,
    Math.floor(
      (args.height - headerHeight - cardGap * Math.max(0, items.length - 1) - 18) /
        Math.max(1, items.length),
    ),
  );
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top,
      width: args.width,
      height: args.height,
      fill: ACADEMY_PAPER.cardFillSoft,
      outlineColor: ACADEMY_PAPER.blueBorder,
      groupId,
    }),
    createTextElement({
      left: args.left + 20,
      top: args.top + 18,
      width: args.width - 40,
      height: 30,
      groupId,
      html: `<p style="font-size:14px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
        args.language === 'en-US' ? 'Solution Route' : '解题路线',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
  ];

  items.forEach((item, index) => {
    const tone = args.tokens.cardPalettes[index % args.tokens.cardPalettes.length];
    elements.push(
      createTextElement({
        left: args.left + 20,
        top: args.top + headerHeight + index * (cardHeight + cardGap),
        width: args.width - 40,
        height: cardHeight,
        groupId,
        html: `<p style="margin:0;font-size:13px;line-height:18px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${tone.accent};font-weight:800;">${index + 1}.</span> ${renderInlineLatexToHtml(item)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: tone.border,
        textType: 'content',
      }),
    );
  });

  return elements;
}

function renderProblemReasoningRail(args: {
  top: number;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
  activeIndex: number;
}): PPTElement[] {
  const steps =
    args.language === 'en-US' ? ['Read', 'Translate', 'Conclude'] : ['读题', '转化', '结论'];
  const left = CONTENT_LEFT + 42;
  const width = CONTENT_WIDTH - 84;
  const y = args.top + 23;
  const segment = width / Math.max(1, steps.length - 1);
  const elements: PPTElement[] = [
    createLineElement({
      start: [left, y],
      end: [left + width, y],
      color: '#dbeafe',
      width: 2,
    }),
  ];

  steps.forEach((step, index) => {
    const x = left + index * segment;
    const active = index <= args.activeIndex;
    elements.push(
      createCircleShape({
        left: x - 10,
        top: y - 10,
        size: 20,
        fill: active ? args.tokens.titleAccent : '#dbeafe',
      }),
      createTextElement({
        left: x - 58,
        top: y + 14,
        width: 116,
        height: 28,
        html: `<p style="font-size:12px;color:${active ? args.tokens.titleAccent : '#64748b'};text-align:center;font-weight:720;">${escapeHtml(step)}</p>`,
        color: active ? args.tokens.titleAccent : '#64748b',
        textType: 'notes',
      }),
    );
  });

  return elements;
}

function renderProblemStatementTemplate(args: {
  title: string;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
  bodyTop: number;
  bodyHeight: number;
  continuation?: NotebookContentDocument['continuation'];
}): PPTElement[] {
  const parts = collectProblemStatementParts({
    title: args.title,
    language: args.language,
    blocks: args.blocks,
  });
  const allText = [
    args.title,
    parts.problem,
    ...parts.givens,
    ...parts.goals,
    ...parts.supportLines,
  ].join('\n');
  const elements: PPTElement[] = [];
  const activeIndex = args.continuation
    ? Math.min(2, Math.max(0, args.continuation.partNumber - 1))
    : 0;
  const railHeight = parts.hasExplicitProblem ? 58 : 0;
  const railTop = args.bodyTop + args.bodyHeight - railHeight;

  if (parts.hasExplicitProblem) {
    const problemFontSize =
      parts.problem.length > 980
        ? 14
        : parts.problem.length > 700
          ? 15
          : parts.problem.length > 460
            ? 16
            : 18;
    const problemHeight = parts.problem.length > 760 ? 192 : parts.problem.length > 420 ? 166 : 142;
    const lowerTop = args.bodyTop + problemHeight + 18;
    const lowerHeight = Math.max(132, railTop - lowerTop - 14);
    const infoWidth = 510;
    const visualLeft = CONTENT_LEFT + infoWidth + 24;
    const infoItems = uniqueProblemLines([...parts.givens, ...parts.goals], 5);

    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: args.bodyTop,
        width: CONTENT_WIDTH,
        height: problemHeight,
        html: `<p style="font-size:15px;line-height:22px;color:${args.tokens.titleAccent};font-weight:780;">${escapeHtml(
          args.language === 'en-US' ? 'Problem' : '题目',
        )}</p><p style="font-size:${problemFontSize}px;line-height:${Math.round(problemFontSize * 1.5)}px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(parts.problem)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        textType: 'content',
      }),
      ...renderProblemInfoRows({
        title: args.language === 'en-US' ? 'Known / Goal' : '已知与目标',
        items: infoItems,
        left: CONTENT_LEFT,
        top: lowerTop,
        width: infoWidth,
        height: lowerHeight,
        tokens: args.tokens,
        language: args.language,
        tone: args.cardPalettes[0],
        maxItems: 4,
      }),
      ...(shouldUseProblemMappingVisual(allText)
        ? renderProblemMappingVisual({
            left: visualLeft,
            top: lowerTop,
            width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
            height: lowerHeight,
            text: allText,
            tokens: args.tokens,
            language: args.language,
          })
        : renderProblemStrategyVisual({
            left: visualLeft,
            top: lowerTop,
            width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
            height: lowerHeight,
            lines: selectProblemStrategyLines(parts),
            tokens: args.tokens,
            language: args.language,
          })),
      ...renderProblemReasoningRail({
        top: railTop,
        tokens: args.tokens,
        language: args.language,
        activeIndex,
      }),
    );
    return elements;
  }

  const continuationLines = uniqueProblemLines(
    [...parts.goals, ...parts.givens, ...parts.supportLines],
    5,
  );
  const roleText = continuationLines.join('\n');
  const isConclusion = /结论|Conclusion|得到|therefore/i.test(roleText);
  const hasGoal = parts.goals.length > 0 || /目标|Goal|证明|Prove/i.test(roleText);
  const hasStepLikeLine =
    /步骤|Step|判定|检查|回代|放大|计算|代入|推导|求解|整除|gcd|derive|compute|check/i.test(
      roleText,
    );
  const headerTitle =
    args.language === 'en-US'
      ? isConclusion
        ? 'Conclusion'
        : hasGoal
          ? 'Proof Target'
          : hasStepLikeLine
            ? 'Solution Step'
            : 'Known Conditions'
      : isConclusion
        ? '结论收束'
        : hasGoal
          ? '证明目标'
          : hasStepLikeLine
            ? '解题步骤'
            : '已知条件';
  const headerSubtitle =
    continuationLines[0] ||
    (args.language === 'en-US' ? 'Continue the worked-example reasoning.' : '继续推进例题讲解。');
  const panelTop = args.bodyTop + 92;
  const panelHeight = Math.max(162, railTop - panelTop - 16);
  const infoWidth = 532;
  const visualLeft = CONTENT_LEFT + infoWidth + 24;

  elements.push(
    createTextElement({
      left: CONTENT_LEFT,
      top: args.bodyTop,
      width: CONTENT_WIDTH,
      height: 72,
      html: `<p style="font-size:17px;line-height:24px;color:${args.tokens.titleText};font-weight:780;">${escapeHtml(headerTitle)}</p><p style="font-size:15px;line-height:22px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(headerSubtitle)}</p>`,
      color: ACADEMY_PAPER.bodyText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      textType: 'content',
    }),
    ...renderProblemInfoRows({
      title: args.language === 'en-US' ? 'Use These Facts' : '本页要用的信息',
      items: continuationLines,
      left: CONTENT_LEFT,
      top: panelTop,
      width: infoWidth,
      height: panelHeight,
      tokens: args.tokens,
      language: args.language,
      tone: isConclusion ? args.cardPalettes[2] : args.cardPalettes[0],
      maxItems: 4,
    }),
    ...(shouldUseProblemMappingVisual(allText)
      ? renderProblemMappingVisual({
          left: visualLeft,
          top: panelTop,
          width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
          height: panelHeight,
          text: allText,
          tokens: args.tokens,
          language: args.language,
        })
      : renderProblemStrategyVisual({
          left: visualLeft,
          top: panelTop,
          width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
          height: panelHeight,
          lines: selectProblemStrategyLines(parts),
          tokens: args.tokens,
          language: args.language,
        })),
  );

  return elements;
}

function getCoverTitleSize(title: string): number {
  const normalizedLength = title.replace(/\s+/g, '').length;
  if (normalizedLength > 34) return 34;
  if (normalizedLength > 24) return 38;
  if (normalizedLength > 16) return 42;
  return 48;
}

function collectCoverLines(language: 'zh-CN' | 'en-US', blocks: NotebookContentBlock[]): string[] {
  return blocks
    .flatMap((block) => blockSummaryLines(language, block))
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripCoverRoutePrefix(item: string): string {
  return item
    .replace(/^(步骤|阶段)\s*\d+\s*[：:]\s*/i, '')
    .replace(/^step\s*\d+\s*[:：]\s*/i, '')
    .replace(/^(核心要点|学习路线|课堂推进顺序|Learning Roadmap|Roadmap)\s*[：:]\s*/i, '')
    .trim();
}

function inferSupplementalCoverRouteItem(args: {
  language: 'zh-CN' | 'en-US';
  title: string;
  lead: string;
  existingItems: string[];
}): string {
  const haystack = [args.title, args.lead, ...args.existingItems].join('\n');
  if (args.language === 'en-US') {
    if (/prime|factorization|unique decomposition/i.test(haystack)) {
      return 'Structure wrap-up - connect divisibility criteria with primes, factorization, and proof strategy.';
    }
    if (/proof|derive|criterion|theorem/i.test(haystack)) {
      return 'Proof habits - state the criterion, choose the right direction, and test edge cases.';
    }
    return 'Synthesis - close the loop by turning the main ideas into usable problem-solving moves.';
  }

  if (/唯一分解|素数无穷|质数|素数/.test(haystack)) {
    return '结构收束 - 把整除判据、质数性质与唯一分解串成可证明的知识框架。';
  }
  if (/证明|判据|定理|推导/.test(haystack)) {
    return '证明习惯 - 先写判据，再选证明方向，最后用反例或边界条件检验。';
  }
  return '综合迁移 - 把本页主线转化成后续例题和证明中可复用的操作。';
}

function completeCoverRouteItems(args: {
  language: 'zh-CN' | 'en-US';
  title: string;
  lead: string;
  items: string[];
}): string[] {
  const normalized = args.items.map(stripCoverRoutePrefix).filter(Boolean);
  const deduped = normalized.filter(
    (item, index) => normalized.findIndex((candidate) => candidate === item) === index,
  );
  const next = [...deduped];
  while (next.length < 3) {
    const supplement = inferSupplementalCoverRouteItem({
      language: args.language,
      title: args.title,
      lead: args.lead,
      existingItems: next,
    });
    if (next.some((item) => item === supplement)) break;
    next.push(supplement);
  }
  return next.slice(0, 3);
}

function splitCoverRouteItem(args: { item: string; index: number; language: 'zh-CN' | 'en-US' }): {
  title: string;
  detail: string;
} {
  const cleaned = stripCoverRoutePrefix(args.item);
  const dashMatch = cleaned.match(/^(.{2,28}?)[\s]*[-—–][\s]*(.+)$/);
  const colonMatch = cleaned.match(/^(.{2,16}?)[：:]\s*(.+)$/);
  const match = dashMatch || colonMatch;
  if (match?.[1] && match?.[2]) {
    return {
      title: match[1].trim(),
      detail: match[2].trim(),
    };
  }
  return {
    title: args.language === 'en-US' ? `Stage ${args.index + 1}` : `阶段 ${args.index + 1}`,
    detail: cleaned,
  };
}

function renderCoverRouteStrip(args: {
  title: string;
  lead: string;
  items: string[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
}): PPTElement[] {
  const normalizedItems = completeCoverRouteItems({
    language: args.language,
    title: args.title,
    lead: args.lead,
    items:
      args.items.length > 0
        ? args.items
        : args.language === 'en-US'
          ? ['Define precisely', 'Work examples', 'Synthesize the proof habit']
          : ['明确核心定义', '进入例题推导', '收束证明方法'],
  });
  const labelTop = 354;
  const top = 384;
  const left = CONTENT_LEFT + 6;
  const width = CONTENT_WIDTH - 12;
  const gap = 18;
  const segmentWidth = (width - gap * (normalizedItems.length - 1)) / normalizedItems.length;
  const cardHeight = 120;

  const elements: PPTElement[] = [
    createTextElement({
      left,
      top: labelTop,
      width: 220,
      height: 24,
      html: `<p style="font-size:15px;line-height:20px;color:${args.tokens.titleAccent};font-weight:800;">${escapeHtml(
        args.language === 'en-US' ? 'Learning Roadmap' : '学习路线',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'notes',
    }),
  ];

  normalizedItems.forEach((item, index) => {
    const x = left + index * (segmentWidth + gap);
    const accent = args.tokens.cardPalettes[index % args.tokens.cardPalettes.length].accent;
    const parsed = splitCoverRouteItem({ item, index, language: args.language });
    elements.push(
      createRectShape({
        left: x,
        top,
        width: segmentWidth,
        height: cardHeight,
        fill: 'rgba(255,253,248,0.82)',
        outlineColor: 'rgba(119,148,191,0.28)',
      }),
      createCircleShape({
        left: x + 18,
        top: top + 18,
        size: 28,
        fill: accent,
      }),
      createTextElement({
        left: x + 26,
        top: top + 23,
        width: 12,
        height: 18,
        html: `<p style="font-size:12px;line-height:16px;color:#ffffff;text-align:center;font-weight:820;">${index + 1}</p>`,
        color: '#ffffff',
        textType: 'notes',
      }),
      createTextElement({
        left: x + 58,
        top: top + 18,
        width: segmentWidth - 76,
        height: 24,
        html: `<p style="font-size:14px;line-height:19px;color:${accent};font-weight:820;">${renderInlineLatexToHtml(
          parsed.title,
        )}</p>`,
        color: accent,
        textType: 'content',
      }),
      createTextElement({
        left: x + 18,
        top: top + 54,
        width: segmentWidth - 36,
        height: 54,
        html: `<p style="font-size:12px;line-height:17px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(
          parsed.detail,
        )}</p>`,
        color: ACADEMY_PAPER.bodyText,
        textType: 'content',
      }),
    );
  });

  return elements;
}

function renderCoverHeroSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  blocks: NotebookContentBlock[];
  visual?: VisualSlotWithTitle | null;
}): Slide {
  const title = args.document.title || args.fallbackTitle;
  const titleSize = getCoverTitleSize(title);
  const lines = collectCoverLines(args.language, args.blocks);
  const lead = lines[0] || args.document.title || args.fallbackTitle;
  const routeItems = lines
    .slice(1)
    .map((line) =>
      line.replace(
        /^(明确课程主题|学习主线|强调证明意识|主题范围|核心要点|课堂推进顺序)[：:]\s*/,
        '',
      ),
    )
    .filter(Boolean);
  const hasVisual = Boolean(args.visual?.source);
  const elements: PPTElement[] = [
    createTextElement({
      left: CONTENT_LEFT,
      top: 72,
      width: CONTENT_WIDTH,
      height: 118,
      html: `<p style="font-size:${titleSize}px;line-height:${Math.round(titleSize * 1.12)}px;color:${args.tokens.titleText};font-weight:840;">${renderInlineLatexToHtml(title)}</p>`,
      color: args.tokens.titleText,
      textType: 'title',
    }),
    createRectShape({
      left: CONTENT_LEFT,
      top: 198,
      width: 120,
      height: 5,
      fill: args.tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: 232,
      width: hasVisual ? 510 : 720,
      height: 112,
      html: `<p style="font-size:17px;line-height:26px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(lead)}</p>`,
      color: ACADEMY_PAPER.bodyText,
      textType: 'subtitle',
    }),
    ...renderCoverRouteStrip({
      title,
      lead,
      items: routeItems,
      language: args.language,
      tokens: args.tokens,
    }),
  ];

  if (hasVisual) {
    elements.push(
      ...renderVisualPanel({
        visual: args.visual || null,
        blocks: args.blocks,
        language: args.language,
        left: 626,
        top: 218,
        width: 288,
        height: 212,
        tokens: args.tokens,
      }),
    );
  }

  return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
}

function renderStructuredLayoutFamilySlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  family: NotebookContentLayoutFamily;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  blocks: NotebookContentBlock[];
  visual: VisualSlotWithTitle | null;
}): Slide {
  const title = args.document.title || args.fallbackTitle;
  const template = inferLayoutTemplateFromDocument({
    document: args.document,
    family: args.family,
    blocks: args.blocks,
    visual: args.visual,
  });
  const contentBlocks = args.blocks.length > 0 ? args.blocks : [];
  const cardPalettes = args.tokens.cardPalettes;
  if (isClassicLectureLayoutTemplate(template)) {
    return renderClassicLectureTemplateSlide({
      title,
      document: args.document,
      template,
      blocks: contentBlocks,
      visual: args.visual,
      language: args.language,
      tokens: args.tokens,
      cardPalettes,
    });
  }

  if (args.family === 'cover') {
    return renderCoverHeroSlide({
      document: args.document,
      fallbackTitle: args.fallbackTitle,
      language: args.language,
      tokens: args.tokens,
      blocks: contentBlocks,
      visual: args.visual,
    });
  }

  const elements: PPTElement[] = [];
  const titleElements = createFamilyTitleElements({
    title,
    language: args.language,
    family: args.family,
    tokens: args.tokens,
    continuation: args.document.continuation,
  });
  elements.push(...titleElements);

  if (args.family === 'section') {
    const bodyText = contentBlocks
      .flatMap((block) => blockSummaryLines(args.language, block))
      .slice(0, 4);
    const top = 230;
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top,
        width: 720,
        height: 118,
        html: bodyText
          .map(
            (line) =>
              `<p style="font-size:18px;line-height:26px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(line)}</p>`,
          )
          .join(''),
        color: ACADEMY_PAPER.bodyText,
        textType: 'subtitle',
      }),
    );
    if (contentBlocks.length > 1) {
      elements.push(
        ...contentBlocks.slice(0, 3).map((block, index) =>
          createBlockCard({
            block,
            language: args.language,
            left: CONTENT_LEFT + index * 286,
            top: 410,
            width: 270,
            height: 82,
            tone: cardPalettes[index % cardPalettes.length],
            bodyFontSize: 12,
          }),
        ),
      );
    }
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  const bodyTop = 112;
  const bodyHeight = CONTENT_BOTTOM - bodyTop;
  const shouldUseDefinitionFocus = shouldUseDefinitionFocusTemplate({
    document: args.document,
    family: args.family,
    blocks: contentBlocks,
  });

  if (args.family === 'concept_cards') {
    if (template === 'four_grid') {
      elements.push(
        ...renderBlockCardGrid({
          blocks: contentBlocks,
          language: args.language,
          left: CONTENT_LEFT,
          top: bodyTop,
          width: CONTENT_WIDTH,
          height: bodyHeight,
          columns: 2,
          maxItems: 4,
          cardPalettes,
        }),
      );
    } else if (shouldUseDefinitionFocus || isDefinitionBoardTemplate(template)) {
      elements.push(
        ...renderDefinitionFocusTemplate({
          title,
          blocks: contentBlocks,
          language: args.language,
          tokens: args.tokens,
          cardPalettes,
          bodyTop,
          bodyHeight,
        }),
      );
    } else if (
      isHumanitiesAnalysisTemplate(template) ||
      (isHumanitiesDiscipline(args.document.disciplineStyle) &&
        isHumanitiesTeachingFlow(args.document.teachingFlow))
    ) {
      elements.push(
        ...renderHumanitiesAnalysisTemplate({
          title,
          blocks: contentBlocks,
          language: args.language,
          tokens: args.tokens,
          template,
          teachingFlow: args.document.teachingFlow,
          cardPalettes,
          bodyTop,
          bodyHeight,
        }),
      );
    } else if (template === 'title_content' || template === 'two_column_explain') {
      elements.push(
        ...renderTitleContentTemplate({
          title,
          blocks: contentBlocks,
          language: args.language,
          tokens: args.tokens,
          cardPalettes,
          bodyTop,
          bodyHeight,
        }),
      );
    } else {
      const columns = 2;
      const maxItems = 2;
      elements.push(
        ...renderBlockCardGrid({
          blocks: contentBlocks,
          language: args.language,
          left: CONTENT_LEFT,
          top: bodyTop,
          width: CONTENT_WIDTH,
          height: bodyHeight,
          columns,
          maxItems,
          cardPalettes,
        }),
      );
    }
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'visual_split') {
    if (!args.visual?.source) {
      elements.push(
        ...(isHumanitiesAnalysisTemplate(template)
          ? renderHumanitiesAnalysisTemplate({
              title,
              blocks: contentBlocks,
              language: args.language,
              tokens: args.tokens,
              template,
              teachingFlow: args.document.teachingFlow,
              cardPalettes,
              bodyTop,
              bodyHeight,
            })
          : shouldUseDefinitionFocus || isDefinitionBoardTemplate(template)
            ? renderDefinitionFocusTemplate({
                title,
                blocks: contentBlocks,
                language: args.language,
                tokens: args.tokens,
                cardPalettes,
                bodyTop,
                bodyHeight,
              })
            : renderTitleContentTemplate({
                title,
                blocks: contentBlocks,
                language: args.language,
                tokens: args.tokens,
                cardPalettes,
                bodyTop,
                bodyHeight,
              })),
      );
      return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
    }

    const visualWidth = 360;
    const textWidth = CONTENT_WIDTH - visualWidth - 26;
    const visualOnLeft = template === 'visual_left';
    const visualLeft = visualOnLeft ? CONTENT_LEFT : CONTENT_LEFT + textWidth + 26;
    const textLeft = visualOnLeft ? CONTENT_LEFT + visualWidth + 26 : CONTENT_LEFT;
    const cardHeight = Math.max(
      82,
      Math.floor((bodyHeight - 24) / Math.max(1, Math.min(3, contentBlocks.length))),
    );
    elements.push(
      ...renderVisualPanel({
        visual: args.visual,
        blocks: contentBlocks,
        language: args.language,
        left: visualLeft,
        top: bodyTop,
        width: visualWidth,
        height: bodyHeight,
        tokens: args.tokens,
      }),
    );
    contentBlocks.slice(0, 4).forEach((block, index) => {
      elements.push(
        createBlockCard({
          block,
          language: args.language,
          left: textLeft,
          top: bodyTop + index * (cardHeight + 10),
          width: textWidth,
          height: cardHeight,
          tone: cardPalettes[index % cardPalettes.length],
        }),
      );
    });
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'comparison') {
    const tableBlock = findFirstBlock(contentBlocks, 'table');
    if (
      !tableBlock &&
      (isHumanitiesAnalysisTemplate(template) ||
        (isHumanitiesDiscipline(args.document.disciplineStyle) &&
          isHumanitiesTeachingFlow(args.document.teachingFlow)))
    ) {
      elements.push(
        ...renderHumanitiesAnalysisTemplate({
          title,
          blocks: contentBlocks,
          language: args.language,
          tokens: args.tokens,
          template,
          teachingFlow: args.document.teachingFlow,
          cardPalettes,
          bodyTop,
          bodyHeight,
        }),
      );
    } else if (tableBlock) {
      elements.push(
        ...createTableCards({
          block: tableBlock,
          left: CONTENT_LEFT,
          top: bodyTop,
          width: CONTENT_WIDTH,
          height: bodyHeight,
          tokens: args.tokens,
        }),
      );
    } else {
      const columns = 2;
      const rows = Math.max(1, Math.ceil(Math.min(4, contentBlocks.length) / columns));
      const cardWidth = (CONTENT_WIDTH - GRID_GAP_X) / 2;
      const cardHeight = (bodyHeight - Math.max(0, rows - 1) * GRID_GAP_Y) / rows;
      contentBlocks.slice(0, 4).forEach((block, index) => {
        elements.push(
          createBlockCard({
            block,
            language: args.language,
            left: CONTENT_LEFT + (index % columns) * (cardWidth + GRID_GAP_X),
            top: bodyTop + Math.floor(index / columns) * (cardHeight + GRID_GAP_Y),
            width: cardWidth,
            height: cardHeight,
            tone: cardPalettes[index % cardPalettes.length],
          }),
        );
      });
    }
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'timeline') {
    const flow =
      findFirstBlock(contentBlocks, 'process_flow') ||
      buildFlowPatternBlock({
        language: args.language,
        orientation: 'vertical',
        blocks: contentBlocks,
      });
    const rendered = renderProcessFlowBlock({
      block: { ...flow, orientation: flow.steps.length <= 4 ? flow.orientation : 'vertical' },
      top: bodyTop,
      language: args.language,
      titleAccent: args.tokens.titleAccent,
      cardPalettes,
    });
    elements.push(...rendered.elements);
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'code_walkthrough') {
    const walkthrough = findFirstBlock(contentBlocks, 'code_walkthrough');
    const traceBlock = findFirstBlock(contentBlocks, 'code_trace');
    const codeBlock = traceBlock || walkthrough || findFirstBlock(contentBlocks, 'code_block');
    const codeText =
      codeBlock?.type === 'code_walkthrough' || codeBlock?.type === 'code_trace'
        ? codeBlock.code
        : codeBlock?.code || '';
    const codeLeft = CONTENT_LEFT;
    const codeWidth = 500;
    const stepsLeft = codeLeft + codeWidth + 24;
    elements.push(
      createTextElement({
        left: codeLeft,
        top: bodyTop,
        width: codeWidth,
        height: bodyHeight,
        html: codeText
          .split('\n')
          .slice(0, 18)
          .map(
            (line, index) =>
              `<p style="font-size:12px;line-height:17px;color:${args.tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;"><span style="color:${args.tokens.codeSurface.caption};">${String(index + 1).padStart(2, '0')}</span> ${escapeHtml(line)}</p>`,
          )
          .join(''),
        color: args.tokens.codeSurface.text,
        fill: args.tokens.codeSurface.fill,
        outlineColor: args.tokens.codeSurface.outline,
        textType: 'content',
      }),
    );
    const stepItems =
      traceBlock?.steps.map((step) => {
        const state = step.state.length
          ? ` (${step.state.map((item) => `${item.name}=${item.value}`).join(', ')})`
          : '';
        return `${step.line ? `L${step.line}: ` : ''}${step.explanation}${state}`;
      }) ||
      walkthrough?.steps.map(
        (step) =>
          `${step.title || step.focus || ''}${step.explanation ? `: ${step.explanation}` : ''}`,
      ) ||
      contentBlocks.flatMap((block) => blockSummaryLines(args.language, block)).slice(0, 5);
    const stepHeight = Math.max(
      70,
      Math.floor((bodyHeight - 30) / Math.max(1, Math.min(5, stepItems.length))),
    );
    stepItems.slice(0, 5).forEach((item, index) => {
      elements.push(
        createTextElement({
          left: stepsLeft,
          top: bodyTop + index * (stepHeight + 8),
          width: CONTENT_LEFT + CONTENT_WIDTH - stepsLeft,
          height: stepHeight,
          html: `<p style="font-size:13px;color:${args.tokens.titleAccent};"><strong>${args.language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`}</strong></p><p style="font-size:14px;line-height:20px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(item)}</p>`,
          color: ACADEMY_PAPER.bodyText,
          fill: cardPalettes[index % cardPalettes.length].fill,
          outlineColor: cardPalettes[index % cardPalettes.length].border,
          textType: 'content',
        }),
      );
    });
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'problem_statement') {
    elements.push(
      ...renderProblemStatementTemplate({
        title,
        blocks: contentBlocks,
        language: args.language,
        tokens: args.tokens,
        cardPalettes,
        bodyTop,
        bodyHeight,
        continuation: args.document.continuation,
      }),
    );
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'problem_solution' || args.family === 'derivation') {
    const derivation = findFirstBlock(contentBlocks, 'derivation_steps');
    const example = findFirstBlock(contentBlocks, 'example');
    const steps = derivation
      ? derivation.steps.map(
          (step) => `${step.expression}${step.explanation ? ` — ${step.explanation}` : ''}`,
        )
      : example?.steps || contentBlocks.flatMap((block) => blockSummaryLines(args.language, block));

    const leftWidth = args.family === 'derivation' ? 520 : 420;
    const rightWidth = CONTENT_WIDTH - leftWidth - 24;
    const visibleSteps = steps.slice(0, 5);
    const stepGap = 10;
    const naturalStepHeights = visibleSteps.map((step) =>
      Math.min(138, Math.max(82, estimateParagraphHeight(step, 34, 21) + 38)),
    );
    const availableStepHeight = Math.max(
      70,
      bodyHeight - stepGap * Math.max(0, visibleSteps.length - 1),
    );
    const naturalStepTotal = naturalStepHeights.reduce((sum, value) => sum + value, 0);
    const stepScale =
      naturalStepTotal > availableStepHeight ? availableStepHeight / naturalStepTotal : 1;
    const stepHeights = naturalStepHeights.map((height) =>
      Math.max(70, Math.floor(height * stepScale)),
    );
    let stepCursorTop = bodyTop;

    visibleSteps.forEach((step, index) => {
      const stepHeight = stepHeights[index] ?? 88;
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: stepCursorTop,
          width: leftWidth,
          height: stepHeight,
          html: `<p style="font-size:13px;color:${args.tokens.titleAccent};"><strong>${args.language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`}</strong></p><p style="font-size:15px;line-height:21px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(step)}</p>`,
          color: ACADEMY_PAPER.bodyText,
          fill: ACADEMY_PAPER.cardFill,
          outlineColor: ACADEMY_PAPER.border,
          textType: 'content',
        }),
      );
      stepCursorTop += stepHeight + stepGap;
    });
    const answer = example?.answer || contentBlocks.find((block) => block.type === 'callout');
    const answerText =
      typeof answer === 'object' && 'text' in answer
        ? answer.text
        : example?.answer || steps[steps.length - 1] || '';
    const answerFit = fitParagraphBlockToHeight({
      text: answerText,
      widthPx: Math.max(120, rightWidth - CARD_INSET_X * 2),
      fontSizePx: 18,
      lineHeightPx: 27,
      maxHeightPx: Math.min(170, bodyHeight - 54),
      color: ACADEMY_PAPER.titleText,
    });
    const answerCardHeight = Math.min(bodyHeight, Math.max(128, answerFit.height + 54));
    elements.push(
      createTextElement({
        left: CONTENT_LEFT + leftWidth + 24,
        top: bodyTop,
        width: rightWidth,
        height: answerCardHeight,
        html: `<p style="font-size:15px;color:${args.tokens.titleAccent};"><strong>${escapeHtml(
          args.language === 'en-US' ? 'Key Takeaway' : '关键结论',
        )}</strong></p>${answerFit.html}`,
        color: ACADEMY_PAPER.titleText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.border,
        textType: 'content',
      }),
    );
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'formula_focus') {
    const equation = findFirstBlock(contentBlocks, 'equation');
    const matrix = findFirstBlock(contentBlocks, 'matrix');
    const latex = equation?.latex || (matrix ? matrixBlockToLatex(matrix) : '');
    if (latex) {
      const groupId = createCardGroupId('formula_focus');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: bodyTop,
          width: CONTENT_WIDTH,
          height: 240,
          fill: ACADEMY_PAPER.cardFill,
          outlineColor: ACADEMY_PAPER.blueBorder,
          groupId,
        }),
        createLatexElement({
          latex,
          left: CONTENT_LEFT + 30,
          top: bodyTop + 50,
          width: CONTENT_WIDTH - 60,
          height: 130,
          align: 'center',
          color: args.tokens.titleText,
          groupId,
        }),
      );
    }
    contentBlocks
      .filter((block) => block !== equation && block !== matrix)
      .slice(0, 3)
      .forEach((block, index) => {
        const cardWidth = (CONTENT_WIDTH - 2 * GRID_GAP_X) / 3;
        elements.push(
          createBlockCard({
            block,
            language: args.language,
            left: CONTENT_LEFT + index * (cardWidth + GRID_GAP_X),
            top: bodyTop + 266,
            width: cardWidth,
            height: bodyHeight - 266,
            tone: cardPalettes[index % cardPalettes.length],
            bodyFontSize: 12,
          }),
        );
      });
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  if (args.family === 'summary') {
    const lines = contentBlocks
      .flatMap((block) => blockSummaryLines(args.language, block))
      .slice(0, 6);
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: bodyTop,
        width: 430,
        height: bodyHeight,
        html: `<p style="font-size:18px;color:${args.tokens.titleAccent};"><strong>${escapeHtml(
          args.language === 'en-US' ? 'Takeaways' : '核心回收',
        )}</strong></p>${lines
          .slice(0, 4)
          .map(
            (line) =>
              `<p style="font-size:18px;line-height:27px;color:${ACADEMY_PAPER.titleText};">${renderInlineLatexToHtml(line)}</p>`,
          )
          .join('')}`,
        color: ACADEMY_PAPER.titleText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        textType: 'content',
      }),
      createTextElement({
        left: CONTENT_LEFT + 456,
        top: bodyTop,
        width: CONTENT_WIDTH - 456,
        height: bodyHeight,
        html: lines
          .slice(2, 6)
          .map(
            (line, index) =>
              `<p style="font-size:16px;line-height:25px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${args.tokens.titleAccent};font-weight:700;">${index + 1}</span> ${renderInlineLatexToHtml(line)}</p>`,
          )
          .join(''),
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFillSoft,
        outlineColor: ACADEMY_PAPER.border,
        textType: 'content',
      }),
    );
    return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
  }

  const columns = contentBlocks.length <= 2 ? contentBlocks.length || 1 : 2;
  const rows = Math.max(1, Math.ceil(Math.min(4, contentBlocks.length) / columns));
  const cardWidth = (CONTENT_WIDTH - Math.max(0, columns - 1) * GRID_GAP_X) / columns;
  const cardHeight = (bodyHeight - Math.max(0, rows - 1) * GRID_GAP_Y) / rows;
  contentBlocks.slice(0, 4).forEach((block, index) => {
    elements.push(
      createBlockCard({
        block,
        language: args.language,
        left: CONTENT_LEFT + (index % columns) * (cardWidth + GRID_GAP_X),
        top: bodyTop + Math.floor(index / columns) * (cardHeight + GRID_GAP_Y),
        width: cardWidth,
        height: cardHeight,
        tone: cardPalettes[index % cardPalettes.length],
      }),
    );
  });
  return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
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

function renderSlotTemplateDocumentToSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
}): Slide {
  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const tokens = getProfileTokens(profile);
  const template = args.document.layoutTemplate;
  const spec = template ? getSlotTemplateSpec(template) : undefined;

  const checkedSpec = validateSlotTemplateDocument({
    document: args.document,
    language,
    spec,
  });

  const slotDocument = args.document as NotebookContentDocument & {
    layoutTemplate: NotebookContentLayoutTemplate;
    slots: NotebookContentSlot[];
  };
  const blocks = flattenSlotBlocksForTemplate(slotDocument, checkedSpec);
  const documentForRender: NotebookContentDocument = {
    ...slotDocument,
    layoutFamily: slotDocument.layoutFamily || checkedSpec.family,
    blocks,
  };

  return renderStructuredLayoutFamilySlide({
    document: documentForRender,
    fallbackTitle: args.fallbackTitle,
    family: documentForRender.layoutFamily || checkedSpec.family,
    language,
    tokens,
    blocks: stripVisualBlocks(blocks),
    visual: resolveDocumentVisualSlot(documentForRender),
  });
}

function fallbackSlotTemplateDocument(document: NotebookContentDocument): NotebookContentDocument {
  const template = document.layoutTemplate;
  const spec = template ? getSlotTemplateSpec(template) : undefined;
  const slotDocument = document as NotebookContentDocument & {
    layoutTemplate: NotebookContentLayoutTemplate;
    slots: NotebookContentSlot[];
  };
  const blocks =
    spec && document.slots?.length
      ? flattenSlotBlocksForTemplate(slotDocument, spec)
      : (document.slots || []).flatMap((slot) => slot.blocks);
  const { slots: _slots, layoutTemplate: _layoutTemplate, ...rest } = document;

  return {
    ...rest,
    version: 1,
    blocks: blocks.length ? blocks : document.blocks,
    layoutFamily: document.layoutFamily || spec?.family,
    layout: document.layout || { mode: 'stack' },
  };
}

export function renderNotebookContentDocumentToSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
}): Slide {
  if (isSlotOnlyDocument(args.document)) {
    try {
      return renderSlotTemplateDocumentToSlide(args);
    } catch (error) {
      if (!isNotebookSlotLayoutError(error)) throw error;
      return renderNotebookContentDocumentToSlide({
        document: fallbackSlotTemplateDocument(args.document),
        fallbackTitle: args.fallbackTitle,
      });
    }
  }

  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const archetype = resolveDocumentArchetype(args.document);
  const archetypeLayout = getArchetypeLayoutSettings(archetype);
  const documentLayout = resolveDocumentLayout(args.document);
  const documentPattern = resolveDocumentPattern(args.document);
  const tokens = getProfileTokens(profile);
  const cardPalettes = tokens.cardPalettes;
  const orderedBlocks = sortBlocksByPlacementOrder(args.document.blocks);
  const layoutFamily = inferLayoutFamilyFromDocument({
    document: args.document,
    archetype,
    blocks: orderedBlocks,
  });
  const structuredBlocks = stripVisualBlocks(orderedBlocks);
  if (layoutFamily) {
    return renderStructuredLayoutFamilySlide({
      document: args.document,
      fallbackTitle: args.fallbackTitle,
      family: layoutFamily,
      language,
      tokens,
      blocks: structuredBlocks,
      visual: resolveDocumentVisualSlot(args.document),
    });
  }

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
        fill: 'rgba(244,247,255,0.78)',
        outlineColor: ACADEMY_PAPER.blueBorder,
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
        placed.colSpan * cellWidth +
          Math.max(0, placed.colSpan - 1) * GRID_GAP_X -
          CARD_INSET_X * 2,
      );
      const block = placed.block;
      const heading = blockToGridHeading(language, block);
      const headingHeight = fitGridHeadingToHeight({
        text: heading,
        widthPx: innerWidth,
        maxHeightPx: 52,
        color: ACADEMY_PAPER.titleText,
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
          groupId: `grid_cell_${placed.row}_${placed.col}`,
          width: cellWidthWithSpan,
          height: cellHeightWithSpan,
          html: `${headingFit.html}${bodyFit.html}`,
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          fill: tone.fill,
          outlineColor: tone.accent,
          shadow: {
            h: 0,
            v: 8,
            blur: 24,
            color: ACADEMY_PAPER.shadow,
          },
        }),
      );
    });

    const gridElements = alignGridCellRowTop({
      elements: stripShapeElements(elements),
      bodyTop,
      rowTops: adaptive.rowTops,
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
      // Grid cards already have explicit row/column sizing. Keep a deterministic
      // row-top invariant here so same-row cards never drift into a staircase.
      elements: gridElements,
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
        color: ACADEMY_PAPER.bodyText,
      });
      const contentHeight = titleFit.height + titleGap + paragraph.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${titleFit.html}${paragraph.html}`,
          color: ACADEMY_PAPER.bodyText,
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
        color: ACADEMY_PAPER.bodyText,
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
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'equation') {
      const sanitizedEquation = splitCaptionedEquation(block.latex, block.caption);
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const toneFill = block.backgroundColor || tone.fill;
      const toneBorder = block.borderColor || tone.border;
      const contentHeight = estimateLatexDisplayHeight(sanitizedEquation.latex, block.display);
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + (sanitizedEquation.caption ? 22 : 0);
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
          latex: sanitizedEquation.latex,
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
      if (sanitizedEquation.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            groupId,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(sanitizedEquation.caption)}</p>`,
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
            .map(
              (item) =>
                `<p style="font-size:15px;color:${ACADEMY_PAPER.bodyText};">${escapeHtml(item)}</p>`,
            )
            .join(''),
          color: ACADEMY_PAPER.bodyText,
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

    if (block.type === 'code_trace') {
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

      const codeHeight = estimateCodeBlockHeight(block.code, 1);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: codeHeight,
          fill: tokens.codeSurface.fill,
          outlineColor: tokens.codeSurface.outline,
          text: createShapeText({
            html: block.code
              .split('\n')
              .map((line, index) => {
                const lineNumber = index + 1;
                const activeLine = block.activeLines.includes(lineNumber);
                return `<p style="font-size:13px;color:${activeLine ? '#67e8f9' : tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;"><span style="color:${tokens.codeSurface.caption};">${String(lineNumber).padStart(2, '0')}</span> ${escapeHtml(line)}</p>`;
              })
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
        const state = step.state.length
          ? ` (${step.state.map((item) => `${item.name}=${item.value}`).join(', ')})`
          : '';
        return `${idx + 1}. ${step.line ? `L${step.line}: ` : ''}${step.explanation}${state}`;
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
            .map(
              (item) =>
                `<p style="font-size:15px;color:${ACADEMY_PAPER.bodyText};">${escapeHtml(item)}</p>`,
            )
            .join(''),
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += stepCardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'state_table') {
      const groupId = createCardGroupId('state_table');
      if (block.title) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT,
            top: cursorTop,
            width: CONTENT_WIDTH,
            height: 26,
            html: `<p style="font-size:17px;color:${tokens.titleAccent};"><strong>${renderInlineLatexToHtml(block.title)}</strong></p>`,
            color: tokens.titleAccent,
            textType: 'itemTitle',
          }),
        );
        cursorTop += 32;
      }
      const tableEls = createTableElement({
        top: cursorTop,
        headers: block.columns,
        rows: block.rows,
        caption: block.caption,
        groupId,
      });
      elements.push(...tableEls);
      cursorTop +=
        Math.min(220, Math.max(72, (block.rows.length + 1) * 34 + 12)) + (block.caption ? 38 : 12);
      visualBlockIndex += 1;
      continue;
    }

    if (
      block.type === 'call_stack' ||
      block.type === 'memory_diagram' ||
      block.type === 'pointer_diagram' ||
      block.type === 'tree_diagram' ||
      block.type === 'graph_trace' ||
      block.type === 'invariant_panel'
    ) {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const lines = blockSummaryLines(language, block);
      const heading = blockToGridHeading(language, block);
      const headingFit = fitGridHeadingToHeight({
        text: heading,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        maxHeightPx: 52,
        color: resolveCardTitleColor(block.titleTone, tone),
      });
      const body = fitGridBodyToHeight({
        language,
        block,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        maxHeightPx: Math.max(80, CONTENT_BOTTOM - cursorTop - headingFit.height - 24),
        tone,
      });
      const fallbackHeight = Math.max(92, estimateParagraphStackHeight(lines, 42, 20) + 46);
      const cardHeight = Math.min(
        Math.max(fallbackHeight, headingFit.height + body.height + CARD_INSET_Y * 2),
        Math.max(96, CONTENT_BOTTOM - cursorTop),
      );
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${headingFit.html}${body.html}`,
          color: ACADEMY_PAPER.bodyText,
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'process_flow') {
      const steps = Array.isArray(block.steps) ? block.steps : [];
      const rendered = renderProcessFlowBlock({
        block,
        top: cursorTop,
        language,
        titleAccent: tokens.titleAccent,
        cardPalettes,
      });
      elements.push(...rendered.elements);
      cursorTop += rendered.height;
      visualBlockIndex += Math.max(1, steps.length);
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
      const measuredBodyHeight = measureParagraphHeightIfAvailable({
        text: block.text,
        widthPx: CONTENT_WIDTH - 22 - 10,
        fontSizePx: 15,
        lineHeightPx: 21,
        color: templateTone.accent,
      });
      const height =
        (measuredBodyHeight ?? estimateParagraphHeight(block.text, 36, 20)) +
        (block.title ? 28 : 12);
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
      const measuredBodyHeight = measureParagraphHeightIfAvailable({
        text: bodyText,
        widthPx: CONTENT_WIDTH - 22 - 10,
        fontSizePx: 15,
        lineHeightPx: 21,
        color: ACADEMY_PAPER.bodyText,
      });
      const height =
        (measuredBodyHeight ?? estimateParagraphHeight(bodyText, 36, 20)) +
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
              `<p style="font-size:15px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(block.text)}</p>`,
              supportText
                ? `<p style="font-size:14px;color:${templateTone.accent};">${renderInlineLatexToHtml(supportText)}</p>`
                : '',
            ]
              .filter(Boolean)
              .join(''),
            color: ACADEMY_PAPER.bodyText,
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
            `<p style="font-size:20px;color:${ACADEMY_PAPER.titleText};">${chemistryTextToHtml(raw)}</p>`,
            caption ? `<p style="font-size:13px;color:#64748b;">${escapeHtml(caption)}</p>` : '',
          ]
            .filter(Boolean)
            .join(''),
          color: ACADEMY_PAPER.titleText,
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
    .reduce(
      (maxBottom, element) => Math.max(maxBottom, element.top + element.height),
      archetypeLayout.bodyTop,
    );
  const hasProcessFlowBlock = effectiveBlocks.some((block) => block.type === 'process_flow');
  const underfillExpansion = hasProcessFlowBlock
    ? {}
    : buildStackUnderfillExpansionRequests({
        elements,
        bodyTop: archetypeLayout.bodyTop,
        usedBottom,
      });
  const reflowedElements = applyAutoHeightReflow({
    elements,
    requestedHeights: underfillExpansion,
  });
  const noShapeElements = stripShapeElements(reflowedElements);
  const alignedLayoutCards = alignTwoCardLayoutRows(noShapeElements);

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
    elements: normalizeSlideTextLayout(expandSingleOccupancyRows(alignedLayoutCards), {
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

export type {
  NotebookDocumentPaginationResult,
  NotebookSlideContentBudgetAssessment,
} from './slide-pagination';

const notebookPaginationDeps = {
  resolveNotebookContentProfile,
  resolveDocumentArchetype,
  resolveDocumentLayout,
  resolveGridLayout,
  getArchetypeLayoutSettings,
  prepareBlocksForPagination,
};

export function assessNotebookContentDocumentForSlide(
  document: NotebookContentDocument,
): NotebookSlideContentBudgetAssessment {
  return assessNotebookContentDocumentForSlideWithDeps(document, notebookPaginationDeps);
}

export function paginateNotebookContentDocument(args: {
  document: NotebookContentDocument;
  rootOutlineId: string;
}): NotebookDocumentPaginationResult {
  return paginateNotebookContentDocumentWithDeps(args, notebookPaginationDeps);
}
