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
  blockSummaryLines,
  CLASSIC_BUSINESS,
  ClassicDeckStylePreset,
  ContentCardTone,
  createCardGroupId,
  getClassicDeckStyle,
  getProfileTokens,
  shouldUseBlockAsDefinitionPoint,
  VisualSlotWithTitle,
} from './slide-adapter.shared';
import {
  compactClassicTextLine,
  createBlockCard,
  createClassicBusinessTable,
  createClassicLectureSlide,
  createClassicPanel,
  createClassicTitleElements,
  estimateClassicCardContentHeight,
  findFirstBlock,
  firstClassicLines,
  getClassicTextBlocks,
  layoutCardsToBlocks,
  renderClassicCinematicTitleFrameTemplate,
  renderClassicComparisonMatrixTemplate,
  renderClassicFlowStrip,
  renderClassicImageTitleOverlayTemplate,
  renderClassicInlineHtml,
  renderClassicProcessStepsTemplate,
  renderClassicTechHeroTitleTemplate,
  renderVisualPanel,
} from './slide-adapter.classic-basic';

export function renderClassicPipelineTableTemplate(args: {
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

export function renderClassicVisualThreeStepsTemplate(args: {
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

export function blockToClassicPanelData(
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

export function renderClassicTwoByOneSummaryTemplate(args: {
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

export function renderClassicThreeCardsTemplate(args: {
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

export function classicCardBlocksFromDocument(args: {
  blocks: NotebookContentBlock[];
  count: number;
}): NotebookContentBlock[] {
  const cardsBlock = findFirstBlock(args.blocks, 'layout_cards');
  if (cardsBlock) return layoutCardsToBlocks(cardsBlock).slice(0, args.count);
  return getClassicTextBlocks(args.blocks).slice(0, args.count);
}

export function renderClassicTextImageSplitTemplate(args: {
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

export function renderClassicFourColumnsTemplate(args: {
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

export function renderClassicGrid2x2Template(args: {
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

export function renderClassicTwoTextImageTemplate(args: {
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

export function isDefinitionOrTheoremBlock(
  block: NotebookContentBlock,
): block is Extract<NotebookContentBlock, { type: 'definition' | 'theorem' }> {
  return block.type === 'definition' || block.type === 'theorem';
}

export function hasDefinitionSignal(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
): boolean {
  const heading = blockToGridHeading(language, block);
  const body = blockSummaryLines(language, block).join('\n');
  const text = `${heading}\n${body}`.toLowerCase();
  if (language === 'zh-CN') {
    return /定义|函数|映射|定义域|陪域|值域|规则|边界/.test(text);
  }
  return /\b(definition|defined|function|domain|codomain|range|rule|boundary|graph)\b/.test(text);
}

export function derivationStepsToDefinitionCards(
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

export function renderClassicDefinitionBoardTemplate(args: {
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

export function renderClassicDerivationLadderTemplate(args: {
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

export function renderClassicFormulaFocusTemplate(args: {
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

export function renderClassicLectureTemplateSlide(args: {
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
