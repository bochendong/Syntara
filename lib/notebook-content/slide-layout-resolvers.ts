import type {
  NotebookContentBlock,
  NotebookContentBlockPlacement,
  NotebookContentDocument,
  NotebookContentGridLayout,
  NotebookContentLayout,
  NotebookContentPattern,
  NotebookSlideArchetype,
} from './schema';
import { GRID_GAP_Y, GRID_MIN_CELL_HEIGHT } from './layout-constants';

export type ArchetypeLayoutSettings = {
  bodyTop: number;
  titleTop: number;
  titleHeight: number;
  titleFontSize: number;
  accentHeight: number;
};

type PlacedGridBlock = {
  block: NotebookContentBlock;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};

export const DEFAULT_ARCHETYPE: NotebookSlideArchetype = 'concept';
export const ARCHETYPE_ALLOWED_BLOCKS: Record<
  NotebookSlideArchetype,
  NotebookContentBlock['type'][]
> = {
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
    'visual',
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
    'visual',
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
    'visual',
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
    'visual',
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
    'visual',
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
    'visual',
  ],
};

export function resolveDocumentArchetype(
  document: Pick<NotebookContentDocument, 'archetype'>,
): NotebookSlideArchetype {
  return document.archetype || DEFAULT_ARCHETYPE;
}

export function resolveDocumentLayout(
  document: Pick<NotebookContentDocument, 'layout'>,
): NotebookContentLayout {
  return document.layout || { mode: 'stack' };
}

export function resolveDocumentPattern(
  document: Pick<NotebookContentDocument, 'pattern'>,
): NotebookContentPattern {
  return document.pattern || 'auto';
}

export function resolveGridLayout(
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

export function sortBlocksByPlacementOrder(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
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

export function arrangeGridBlocksByPlacement(
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

export function getArchetypeLayoutSettings(
  archetype: NotebookSlideArchetype,
): ArchetypeLayoutSettings {
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
