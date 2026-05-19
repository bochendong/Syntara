import type { PPTElement, Slide } from '@/lib/types/slides';
import type {
  NotebookContentBlock,
  NotebookContentDisciplineStyle,
  NotebookContentDocument,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
  NotebookContentTeachingFlow,
} from './schema';
import { isClassicLectureLayoutTemplate } from './schema';
import { matrixBlockToLatex } from './block-utils';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import {
  CARD_INSET_X,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  GRID_GAP_X,
  GRID_GAP_Y,
} from './layout-constants';
import { estimateParagraphHeight } from './measure';
import { createLatexElement, createRectShape, createTextElement } from './slide-element-factory';
import { fitParagraphBlockToHeight } from './slide-grid-copy';

import {
  ACADEMY_PAPER,
  blockSummaryLines,
  buildFlowPatternBlock,
  ContentCardTone,
  createCardGroupId,
  createFamilyTitleElements,
  createSlideFromFamilyElements,
  getProfileTokens,
  renderProcessFlowBlock,
  shouldUseBlockAsDefinitionPoint,
  VisualSlotWithTitle,
} from './slide-adapter.shared';
import {
  createBlockCard,
  createTableCards,
  findFirstBlock,
  renderVisualPanel,
} from './slide-adapter.classic-basic';
import { renderClassicLectureTemplateSlide } from './slide-adapter.classic-advanced';
import { renderCoverHeroSlide } from './slide-adapter.structured-cover';
import { renderProblemStatementTemplate } from './slide-adapter.structured-problem';

export {
  renderCoverHeroSlide,
  getCoverTitleSize,
  collectCoverLines,
  stripCoverRoutePrefix,
  inferSupplementalCoverRouteItem,
  completeCoverRouteItems,
  splitCoverRouteItem,
  renderCoverRouteStrip,
} from './slide-adapter.structured-cover';
export {
  renderProblemStatementTemplate,
  stripProblemLabel,
  stripProblemContextLabel,
  isProblemGoalLine,
  uniqueProblemLines,
  selectProblemStrategyLines,
  collectProblemStatementParts,
  normalizeIntervalSnippet,
  normalizeProblemFormulaSnippet,
  extractProblemVisualFacts,
  shouldUseProblemMappingVisual,
  renderProblemInfoRows,
  renderProblemMappingVisual,
  renderProblemStrategyVisual,
  renderProblemReasoningRail,
  type ProblemStatementParts,
} from './slide-adapter.structured-problem';

export function inferLayoutTemplateFromDocument(args: {
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

export function isHumanitiesDiscipline(style?: NotebookContentDisciplineStyle): boolean {
  return style === 'humanities' || style === 'social_science';
}

export function isHumanitiesTeachingFlow(flow?: NotebookContentTeachingFlow): boolean {
  return (
    flow === 'argument_evidence' ||
    flow === 'close_reading' ||
    flow === 'case_analysis' ||
    flow === 'comparison_review'
  );
}

export function isHumanitiesAnalysisTemplate(template: NotebookContentLayoutTemplate): boolean {
  return (
    template === 'thesis_evidence' ||
    template === 'quote_analysis' ||
    template === 'source_close_reading' ||
    template === 'case_analysis' ||
    template === 'argument_map' ||
    template === 'compare_perspectives'
  );
}

export function isDefinitionBoardTemplate(template: NotebookContentLayoutTemplate): boolean {
  return template === 'definition_board' || template === 'concept_map';
}

export function renderBlockCardGrid(args: {
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

export function renderTitleContentTemplate(args: {
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

export function uniqueTeachingLines(lines: string[], maxItems: number): string[] {
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

export function renderHumanitiesAnalysisTemplate(args: {
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

export function shouldUseDefinitionFocusTemplate(args: {
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

export function renderDefinitionFocusTemplate(args: {
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

export function renderStructuredLayoutFamilySlide(args: {
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
