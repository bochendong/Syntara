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
  alignGridCellRowTop,
  alignTwoCardLayoutRows,
  blockSummaryLines,
  buildFlowPatternBlock,
  buildStackUnderfillExpansionRequests,
  computeAdaptiveGridRowHeights,
  createBoundContentCard,
  createCardGroupId,
  estimateGridBodyHeight,
  expandSingleOccupancyRows,
  getProfileTokens,
  hasBoxGeometry,
  inferLayoutFamilyFromDocument,
  isNotebookSlotLayoutError,
  isSlotOnlyDocument,
  ProcessFlowBlock,
  renderLayoutCardsBlock,
  renderProcessFlowBlock,
  resolveBlockTemplateTone,
  resolveCardTitleColor,
  resolveDocumentVisualSlot,
  splitCaptionedEquation,
  stripShapeElements,
  stripVisualBlocks,
  validateSlotTemplateDocument,
} from './slide-adapter.shared';
import { flattenSlotBlocksForTemplate } from './slide-adapter.classic-basic';
import { renderStructuredLayoutFamilySlide } from './slide-adapter.structured';

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

export function renderSlotTemplateDocumentToSlide(args: {
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

export function fallbackSlotTemplateDocument(
  document: NotebookContentDocument,
): NotebookContentDocument {
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

export const notebookPaginationDeps = {
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
