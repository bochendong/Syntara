import type {
  NotebookContentBlock,
  NotebookContentContinuation,
  NotebookContentDocument,
  NotebookContentGridLayout,
  NotebookContentLayout,
  NotebookContentLayoutFamily,
  NotebookContentOverflowPolicy,
  NotebookContentProfile,
  NotebookSlideArchetype,
} from './schema';
import type { PrepareBlocksForPaginationOptions } from './slide-pagination-blocks';
import { CONTENT_BOTTOM } from './layout-constants';
import {
  assessExpandedBlockHeight,
  assessPageUsage,
  calcSparsePenalty,
  estimateWrappedLineCount,
  getBaseBodyHeight,
  toRenderAwareBudgetHeight,
} from './measure';

type ArchetypeLayoutSettings = {
  bodyTop: number;
  titleTop: number;
  titleHeight: number;
  titleFontSize: number;
  accentHeight: number;
};

export interface NotebookPaginationDeps {
  resolveNotebookContentProfile: (document: NotebookContentDocument) => NotebookContentProfile;
  resolveDocumentArchetype: (
    document: Pick<NotebookContentDocument, 'archetype'>,
  ) => NotebookSlideArchetype;
  resolveDocumentLayout: (
    document: Pick<NotebookContentDocument, 'layout'>,
  ) => NotebookContentLayout;
  resolveGridLayout: (
    layout: NotebookContentGridLayout,
    args: { blockCount: number; bodyHeight: number },
  ) => { columns: number; rows: number; capacity: number };
  getArchetypeLayoutSettings: (archetype: NotebookSlideArchetype) => ArchetypeLayoutSettings;
  prepareBlocksForPagination: (
    blocks: NotebookContentDocument['blocks'],
    language: 'zh-CN' | 'en-US',
    options?: PrepareBlocksForPaginationOptions,
  ) => NotebookContentBlock[];
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

export interface NotebookDocumentPaginationResult {
  pages: NotebookContentDocument[];
  wasSplit: boolean;
  reasons: string[];
  unpageableBlockTypes: NotebookContentBlock['type'][];
}

const SOFT_PAGE_HEIGHT_RATIO = 1.5;
const PRESERVE_PAGE_HEIGHT_RATIO = 1.08;
const PAGINATION_REBALANCE_HEIGHT_RATIO = 1.6;
const PAGINATION_REBALANCE_DENSITY_RATIO = 1.18;

function getProfileDensityBudget(profile: NotebookContentProfile): number {
  switch (profile) {
    case 'math':
      return 8.2;
    case 'code':
      return 7.8;
    default:
      return 7.9;
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
      return 6;
  }
}

function getEffectiveOverflowPolicy(
  document: NotebookContentDocument,
): NotebookContentOverflowPolicy {
  if (document.overflowPolicy === 'preserve_then_paginate') return 'preserve_then_paginate';
  if (document.preserveFullProblemStatement) return 'preserve_then_paginate';
  if (
    document.layoutFamily === 'problem_statement' ||
    document.layoutFamily === 'derivation' ||
    document.layoutFamily === 'code_walkthrough'
  ) {
    return 'preserve_then_paginate';
  }
  return 'compress_first';
}

function getDocumentSoftPageHeightRatio(document: NotebookContentDocument): number {
  const policy = getEffectiveOverflowPolicy(document);
  if (policy === 'preserve_then_paginate') return PRESERVE_PAGE_HEIGHT_RATIO;
  if (document.density === 'light') return 1.28;
  if (document.density === 'dense') return SOFT_PAGE_HEIGHT_RATIO;
  return 1.42;
}

function getLayoutFamilyBlockBudget(
  family: NotebookContentLayoutFamily | undefined,
): number | null {
  switch (family) {
    case 'problem_statement':
      return 2;
    case 'formula_focus':
    case 'visual_split':
      return 4;
    case 'derivation':
    case 'code_walkthrough':
    case 'problem_solution':
    case 'comparison':
    case 'timeline':
    case 'summary':
      return 5;
    case 'cover':
    case 'section':
    case 'concept_cards':
      return 4;
    default:
      return null;
  }
}

function getDocumentDensityBudget(
  document: NotebookContentDocument,
  profile: NotebookContentProfile,
  archetype: NotebookSlideArchetype,
): number {
  let budget = getArchetypeDensityBudget(profile, archetype);
  if (document.density === 'light') budget -= 0.75;
  if (document.density === 'dense') budget += 0.45;
  if (getEffectiveOverflowPolicy(document) === 'preserve_then_paginate') budget -= 0.75;
  return Math.max(3.2, budget);
}

function getDocumentBlockBudget(
  document: NotebookContentDocument,
  archetype: NotebookSlideArchetype,
): number {
  let budget =
    getLayoutFamilyBlockBudget(document.layoutFamily) ?? getArchetypeBlockBudget(archetype);
  if (document.density === 'light') budget -= 1;
  if (document.density === 'dense' && getEffectiveOverflowPolicy(document) === 'compress_first') {
    budget += 1;
  }
  return Math.max(1, budget);
}

function getDocumentPaginationOptions(
  document: NotebookContentDocument,
): PrepareBlocksForPaginationOptions {
  return {
    layoutFamily: document.layoutFamily,
    overflowPolicy: getEffectiveOverflowPolicy(document),
    preserveFullProblemStatement:
      document.preserveFullProblemStatement || document.layoutFamily === 'problem_statement',
  };
}

function collectDenseBlockReasons(
  blocks: NotebookContentBlock[],
  language: 'zh-CN' | 'en-US',
): string[] {
  const reasons: string[] = [];
  const maxTableCellLength = language === 'zh-CN' ? 42 : 88;
  const maxProcessStepLength = language === 'zh-CN' ? 92 : 170;

  for (const block of blocks) {
    if (block.type === 'layout_cards') {
      const normalizedColumns = Number(block.columns);
      const perCardLineBudget = normalizedColumns === 2 && block.items.length >= 4 ? 4 : 5;
      const exceedsLineBudget = block.items.some((item) => {
        const lineCount =
          estimateWrappedLineCount(item.title, language, 16) +
          estimateWrappedLineCount(item.text, language, 22);
        return lineCount > perCardLineBudget;
      });
      if (exceedsLineBudget) {
        reasons.push(`layout_cards_item_lines_exceed:${perCardLineBudget}`);
      }
    }

    if (block.type === 'process_flow') {
      if (block.steps.length > 4) {
        reasons.push(`process_flow_steps_exceed:${block.steps.length}/4`);
      }
      const denseDetail = block.steps.some(
        (step) =>
          step.detail.length > maxProcessStepLength ||
          estimateWrappedLineCount(step.detail, language, 26) > 4,
      );
      if (denseDetail) {
        reasons.push(`process_flow_step_detail_too_dense:${maxProcessStepLength}`);
      }
    }

    if (block.type === 'table') {
      const rowCount = block.rows.length + (block.headers?.length ? 1 : 0);
      if (rowCount > 6) {
        reasons.push(`table_rows_exceed:${rowCount}/6`);
      }
      const hasLongCell = block.rows.some((row) =>
        row.some(
          (cell) =>
            cell.length > maxTableCellLength || estimateWrappedLineCount(cell, language, 20) > 3,
        ),
      );
      if (hasLongCell) {
        reasons.push(`table_cell_too_dense:${maxTableCellLength}`);
      }
    }
  }

  return Array.from(new Set(reasons));
}

function getSoftPageBottomLimit(layout: ArchetypeLayoutSettings, heightRatio: number): number {
  const bodyHeight = Math.max(1, CONTENT_BOTTOM - layout.bodyTop);
  return layout.bodyTop + bodyHeight * heightRatio;
}

function rebalancePaginatedPages(args: {
  pages: NotebookContentBlock[][];
  language: 'zh-CN' | 'en-US';
  layout: ArchetypeLayoutSettings;
  maxBlocksPerPage: number;
  maxDensityScore: number;
  softHeightRatio: number;
}): NotebookContentBlock[][] {
  if (args.pages.length <= 1) return args.pages;
  const pages = args.pages.map((page) => [...page]);
  const baseBodyHeight = getBaseBodyHeight(args.layout.bodyTop);
  const rebalanceBottomLimit =
    args.layout.bodyTop +
    baseBodyHeight * Math.max(SOFT_PAGE_HEIGHT_RATIO, PAGINATION_REBALANCE_HEIGHT_RATIO);
  const policyBottomLimit = args.layout.bodyTop + baseBodyHeight * args.softHeightRatio;
  const effectiveBottomLimit =
    args.softHeightRatio < SOFT_PAGE_HEIGHT_RATIO
      ? policyBottomLimit
      : Math.max(policyBottomLimit, rebalanceBottomLimit);
  const rebalanceDensityLimit = args.maxDensityScore * PAGINATION_REBALANCE_DENSITY_RATIO;

  const canAccept = (blocks: NotebookContentBlock[]) => {
    if (blocks.length === 0) return false;
    if (blocks.length > args.maxBlocksPerPage + 1) return false;
    const usage = assessPageUsage({
      blocks,
      language: args.language,
      layout: args.layout,
    });
    if (usage.estimatedBottom > effectiveBottomLimit) return false;
    if (usage.densityScore > rebalanceDensityLimit) return false;
    return true;
  };

  const pairPenalty = (left: NotebookContentBlock[], right: NotebookContentBlock[]): number => {
    const leftUsage = assessPageUsage({
      blocks: left,
      language: args.language,
      layout: args.layout,
    });
    const rightUsage = assessPageUsage({
      blocks: right,
      language: args.language,
      layout: args.layout,
    });
    return (
      calcSparsePenalty({ blocks: left, usage: leftUsage, baseBodyHeight }) +
      calcSparsePenalty({ blocks: right, usage: rightUsage, baseBodyHeight })
    );
  };

  let changed = true;
  let guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard += 1;

    for (let i = 0; i < pages.length - 1; i += 1) {
      const left = pages[i];
      const right = pages[i + 1];
      if (right.length === 0) continue;
      const beforePenalty = pairPenalty(left, right);

      // Try pulling one block from next page to reduce sparse/isolated pages globally.
      const movedFromRight = [...left, right[0]];
      const rightAfterPull = right.slice(1);
      if (rightAfterPull.length > 0 && canAccept(movedFromRight)) {
        const afterPenalty = pairPenalty(movedFromRight, rightAfterPull);
        if (afterPenalty + 0.15 < beforePenalty) {
          pages[i] = movedFromRight;
          pages[i + 1] = rightAfterPull;
          changed = true;
          continue;
        }
      }

      // Try pushing one block to next page if current page is too dense and next can absorb.
      if (left.length > 1) {
        const movedToRight = [left[left.length - 1], ...right];
        const leftAfterPush = left.slice(0, -1);
        if (canAccept(movedToRight) && leftAfterPush.length > 0) {
          const afterPenalty = pairPenalty(leftAfterPush, movedToRight);
          if (afterPenalty + 0.15 < beforePenalty) {
            pages[i] = leftAfterPush;
            pages[i + 1] = movedToRight;
            changed = true;
          }
        }
      }
    }
  }

  return pages.filter((page) => page.length > 0);
}

export function assessNotebookContentDocumentForSlideWithDeps(
  document: NotebookContentDocument,
  deps: NotebookPaginationDeps,
): NotebookSlideContentBudgetAssessment {
  const language = document.language || 'zh-CN';
  const profile = deps.resolveNotebookContentProfile(document);
  const archetype = deps.resolveDocumentArchetype(document);
  const documentLayout = deps.resolveDocumentLayout(document);
  if (documentLayout.mode === 'grid' && !document.layoutFamily) {
    const archetypeLayout = deps.getArchetypeLayoutSettings(archetype);
    const grid = deps.resolveGridLayout(documentLayout, {
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
  const layout = deps.getArchetypeLayoutSettings(archetype);
  const softHeightRatio = getDocumentSoftPageHeightRatio(document);
  const softBottomLimit = getSoftPageBottomLimit(layout, softHeightRatio);
  const blocks = deps.prepareBlocksForPagination(
    document.blocks,
    language,
    getDocumentPaginationOptions(document),
  );
  const maxDensityScore = getDocumentDensityBudget(document, profile, archetype);
  const maxBlocksPerPage = getDocumentBlockBudget(document, archetype);

  let cursorTop = layout.bodyTop;
  let visualBlockIndex = 0;
  let densityScore = 0.5;

  for (const block of blocks) {
    const estimate = assessExpandedBlockHeight(block, language, visualBlockIndex);
    const budgetHeight = toRenderAwareBudgetHeight({
      block,
      measuredHeight: estimate.height,
      measuredWithDom: estimate.measuredWithDom,
    });
    cursorTop += budgetHeight;
    densityScore += estimate.densityDelta;
    if (estimate.consumesVisualCard) {
      visualBlockIndex += 1;
    }
  }

  const overflowPx = Math.max(0, cursorTop - softBottomLimit);
  const reasons: string[] = [];

  if (overflowPx > 0) {
    reasons.push(
      `estimated_content_height_overflow_soft_${softHeightRatio.toFixed(2)}x:${Math.ceil(overflowPx)}`,
    );
  }

  if (densityScore > maxDensityScore) {
    reasons.push(`density_score:${densityScore.toFixed(2)}/${maxDensityScore.toFixed(2)}`);
  }

  if (blocks.length > maxBlocksPerPage) {
    reasons.push(`too_many_blocks:${blocks.length}`);
  }

  reasons.push(...collectDenseBlockReasons(blocks, language));

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

export function paginateNotebookContentDocumentWithDeps(
  args: {
    document: NotebookContentDocument;
    rootOutlineId: string;
  },
  deps: NotebookPaginationDeps,
): NotebookDocumentPaginationResult {
  const language = args.document.language || 'zh-CN';
  const profile = deps.resolveNotebookContentProfile(args.document);
  const archetype = deps.resolveDocumentArchetype(args.document);
  const documentLayout = deps.resolveDocumentLayout(args.document);
  if (documentLayout.mode === 'grid' && !args.document.layoutFamily) {
    const archetypeLayout = deps.getArchetypeLayoutSettings(archetype);
    const grid = deps.resolveGridLayout(documentLayout, {
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
          totalParts > 1
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
  const layout = deps.getArchetypeLayoutSettings(archetype);
  const softHeightRatio = getDocumentSoftPageHeightRatio(args.document);
  const softBottomLimit = getSoftPageBottomLimit(layout, softHeightRatio);
  const maxDensityScore = getDocumentDensityBudget(args.document, profile, archetype);
  const maxBlocksPerPage = getDocumentBlockBudget(args.document, archetype);
  const blocks = deps.prepareBlocksForPagination(
    args.document.blocks,
    language,
    getDocumentPaginationOptions(args.document),
  );

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

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const estimate = assessExpandedBlockHeight(block, language, visualBlockIndex);
    const budgetHeight = toRenderAwareBudgetHeight({
      block,
      measuredHeight: estimate.height,
      measuredWithDom: estimate.measuredWithDom,
    });
    const nextBottom = cursorTop + budgetHeight;
    const nextDensity = densityScore + estimate.densityDelta;
    const nextBlockCount = currentBlocks.length + 1;
    const wouldOverflow =
      nextBottom > softBottomLimit ||
      nextDensity > maxDensityScore ||
      nextBlockCount > maxBlocksPerPage;

    const remainingAfterCurrent = blocks.length - index - 1;
    const shouldAvoidSingletonTail =
      remainingAfterCurrent === 1 &&
      currentBlocks.length > 0 &&
      currentBlocks.length >= 2 &&
      nextBottom <= softBottomLimit &&
      nextDensity <= maxDensityScore * 1.12 &&
      nextBlockCount <= maxBlocksPerPage + 1;

    if (currentBlocks.length > 0 && wouldOverflow && !shouldAvoidSingletonTail) {
      pushPage();
    }

    const blockEstimateOnEmpty = assessExpandedBlockHeight(block, language, 0);
    const blockBudgetHeightOnEmpty = toRenderAwareBudgetHeight({
      block,
      measuredHeight: blockEstimateOnEmpty.height,
      measuredWithDom: blockEstimateOnEmpty.measuredWithDom,
    });
    if (layout.bodyTop + blockBudgetHeightOnEmpty > softBottomLimit) {
      const shouldKeepOversizedPreservedBlock =
        getEffectiveOverflowPolicy(args.document) === 'preserve_then_paginate' &&
        currentBlocks.length === 0 &&
        (block.type === 'paragraph' ||
          block.type === 'code_block' ||
          block.type === 'code_walkthrough' ||
          block.type === 'equation' ||
          block.type === 'matrix');
      if (shouldKeepOversizedPreservedBlock) {
        currentBlocks.push(block);
        pushPage();
        continue;
      }
      unpageableBlockTypes.add(block.type);
      continue;
    }

    currentBlocks.push(block);
    cursorTop += budgetHeight;
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

  const balancedPages = rebalancePaginatedPages({
    pages,
    language,
    layout,
    maxBlocksPerPage,
    maxDensityScore,
    softHeightRatio,
  });

  const totalParts = balancedPages.length;
  return {
    pages: balancedPages.map((pageBlocks, index) => ({
      ...args.document,
      blocks: pageBlocks,
      archetype,
      continuation:
        totalParts > 1
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
