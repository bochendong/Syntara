import type { NotebookContentBlock } from './schema';

export type NotebookContentExampleBlock = Extract<NotebookContentBlock, { type: 'example' }>;

function normalizeComparableExampleText(value: string | undefined): string {
  return (value || '')
    .replace(/^\s*(?:\d+[.、)]\s*)+/, '')
    .replace(/^\s*(?:题目|problem)\s*[:：]\s*/i, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getExampleDisplaySteps(block: NotebookContentExampleBlock): string[] {
  const alreadyShown = new Set(
    [block.problem, ...block.givens, block.goal || '']
      .map(normalizeComparableExampleText)
      .filter(Boolean),
  );

  const displaySteps: string[] = [];
  for (const step of block.steps || []) {
    const normalized = normalizeComparableExampleText(step);
    if (!normalized || alreadyShown.has(normalized)) continue;
    alreadyShown.add(normalized);
    displaySteps.push(step);
  }
  return displaySteps;
}
