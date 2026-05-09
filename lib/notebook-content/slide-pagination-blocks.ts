import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentLayoutFamily,
  NotebookContentOverflowPolicy,
} from './schema';
import { getExampleDisplaySteps } from './example-block';
import { CARD_INSET_Y } from './layout-constants';
import { estimateParagraphStackHeight, estimateProcessFlowBlockHeight } from './measure';

type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;

export interface PrepareBlocksForPaginationOptions {
  layoutFamily?: NotebookContentLayoutFamily;
  overflowPolicy?: NotebookContentOverflowPolicy;
  preserveFullProblemStatement?: boolean;
}

export function expandBlocks(
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
      const displaySteps = getExampleDisplaySteps(block);
      if (displaySteps.length > 0) {
        expanded.push({
          type: 'bullet_list',
          items: displaySteps.map(
            (item, idx) =>
              `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${item}`,
          ),
        });
      }
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

function splitCodeTraceBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'code_trace' }>,
): NotebookContentBlock[] {
  if (block.steps.length <= 3) return [block];

  const chunks: NotebookContentBlock[] = [];
  for (let index = 0; index < block.steps.length; index += 3) {
    const isLast = index + 3 >= block.steps.length;
    const steps = block.steps.slice(index, index + 3);
    const activeLines = Array.from(
      new Set(steps.flatMap((step) => (step.line ? [step.line] : []))),
    );
    chunks.push({
      ...block,
      activeLines: activeLines.length ? activeLines : block.activeLines,
      steps,
      output: isLast ? block.output : undefined,
    });
  }
  return chunks;
}

function splitCodeBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'code_block' }>,
): NotebookContentBlock[] {
  const maxLinesPerPage = 18;
  const lines = block.code.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= maxLinesPerPage) return [block];

  const chunks: NotebookContentBlock[] = [];
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    chunks.push({
      ...block,
      code: lines.slice(index, index + maxLinesPerPage).join('\n'),
      caption: index === 0 ? block.caption : undefined,
    });
  }
  return chunks;
}

function splitStateTableBlockForPagination(
  block: Extract<NotebookContentBlock, { type: 'state_table' }>,
): NotebookContentBlock[] {
  const maxRowsPerPage = 8;
  if (block.rows.length <= maxRowsPerPage) return [block];

  const chunks: NotebookContentBlock[] = [];
  for (let index = 0; index < block.rows.length; index += maxRowsPerPage) {
    const rows = block.rows.slice(index, index + maxRowsPerPage);
    const activeRow =
      typeof block.activeRow === 'number' &&
      block.activeRow >= index &&
      block.activeRow < index + rows.length
        ? block.activeRow - index
        : undefined;
    chunks.push({
      ...block,
      rows,
      activeRow,
      caption: index + maxRowsPerPage >= block.rows.length ? block.caption : undefined,
    });
  }
  return chunks;
}

function splitProcessFlowBlockForPagination(block: ProcessFlowBlock): NotebookContentBlock[] {
  const context = Array.isArray(block.context) ? block.context : [];
  const steps = Array.isArray(block.steps) ? block.steps : [];
  const normalizedBlock: ProcessFlowBlock = { ...block, context, steps };

  if (normalizedBlock.orientation === 'horizontal') {
    const hasDenseStep = steps.some(
      (step) => step.title.length > 28 || step.detail.length > 100 || (step.note?.length ?? 0) > 72,
    );
    const maxStepsPerPage = hasDenseStep || context.length >= 3 ? 3 : 4;
    if (steps.length <= maxStepsPerPage) return [normalizedBlock];

    const chunks: NotebookContentBlock[] = [];
    for (let index = 0; index < steps.length; index += maxStepsPerPage) {
      const isFirst = index === 0;
      const isLast = index + maxStepsPerPage >= steps.length;
      chunks.push({
        ...normalizedBlock,
        context: isFirst ? context : [],
        steps: steps.slice(index, index + maxStepsPerPage),
        summary: isLast ? normalizedBlock.summary : undefined,
      });
    }
    return chunks;
  }

  const maxBlockHeight = 334;
  const chunks: ProcessFlowBlock[] = [];
  let currentSteps: ProcessFlowBlock['steps'] = [];

  const buildCandidate = (
    steps: ProcessFlowBlock['steps'],
    includeContext: boolean,
    includeSummary: boolean,
  ): ProcessFlowBlock => ({
    ...normalizedBlock,
    context: includeContext ? context : [],
    steps,
    summary: includeSummary ? normalizedBlock.summary : undefined,
  });

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const candidateSteps = [...currentSteps, step];
    const hasMoreSteps = index < steps.length - 1;
    const candidateBlock = buildCandidate(
      candidateSteps,
      chunks.length === 0,
      !hasMoreSteps && Boolean(normalizedBlock.summary),
    );
    const candidateHeight = estimateProcessFlowBlockHeight({
      block: candidateBlock,
      language: 'zh-CN',
    });

    if (currentSteps.length > 0 && candidateHeight > maxBlockHeight) {
      chunks.push(buildCandidate(currentSteps, chunks.length === 0, false));
      currentSteps = [step];
      continue;
    }

    currentSteps = candidateSteps;
  }

  if (currentSteps.length > 0) {
    chunks.push(
      buildCandidate(currentSteps, chunks.length === 0, Boolean(normalizedBlock.summary)),
    );
  }

  if (chunks.length <= 1) {
    return chunks.length > 0 ? chunks : [normalizedBlock];
  }

  const balancedChunks: ProcessFlowBlock[] = chunks.map((chunk) => ({
    ...chunk,
    context: [...chunk.context],
    steps: [...chunk.steps],
  }));

  for (let index = 0; index < balancedChunks.length - 1; index += 1) {
    const current = balancedChunks[index];
    const next = balancedChunks[index + 1];
    if (next.steps.length > 1 || current.steps.length < 3) continue;

    const movedStep = current.steps[current.steps.length - 1];
    balancedChunks[index] = {
      ...current,
      steps: current.steps.slice(0, -1),
    };
    balancedChunks[index + 1] = {
      ...next,
      steps: [movedStep, ...next.steps],
    };
  }

  return balancedChunks;
}

function shouldPreserveProblemStatement(
  options: PrepareBlocksForPaginationOptions | undefined,
): boolean {
  return Boolean(
    options?.preserveFullProblemStatement || options?.layoutFamily === 'problem_statement',
  );
}

function buildProblemStatementBlocks(
  block: Extract<NotebookContentBlock, { type: 'example' }>,
  language: 'zh-CN' | 'en-US',
): NotebookContentBlock[] {
  const blocks: NotebookContentBlock[] = [
    {
      type: 'paragraph',
      text: `${language === 'en-US' ? 'Problem: ' : '题目：'}${block.problem}`,
    },
  ];
  const givens = [...block.givens, ...(block.goal ? [block.goal] : [])];
  if (givens.length > 0) {
    blocks.push({
      type: 'bullet_list',
      items: givens.map((item) => `${language === 'en-US' ? 'Given' : '已知'}: ${item}`),
    });
  }
  return blocks;
}

export function prepareBlocksForPagination(
  blocks: NotebookContentDocument['blocks'],
  language: 'zh-CN' | 'en-US',
  options?: PrepareBlocksForPaginationOptions,
): NotebookContentBlock[] {
  const preSplitBlocks: NotebookContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'example' && shouldPreserveProblemStatement(options)) {
      preSplitBlocks.push(...buildProblemStatementBlocks(block, language));
      continue;
    }

    if (block.type === 'bullet_list') {
      preSplitBlocks.push(...splitBulletListBlockForPagination(block));
      continue;
    }

    if (block.type === 'table') {
      preSplitBlocks.push(...splitTableBlockForPagination(block));
      continue;
    }

    if (block.type === 'code_block') {
      preSplitBlocks.push(...splitCodeBlockForPagination(block));
      continue;
    }

    if (block.type === 'code_walkthrough') {
      preSplitBlocks.push(...splitCodeWalkthroughBlockForPagination(block));
      continue;
    }

    if (block.type === 'code_trace') {
      preSplitBlocks.push(...splitCodeTraceBlockForPagination(block));
      continue;
    }

    if (block.type === 'state_table') {
      preSplitBlocks.push(...splitStateTableBlockForPagination(block));
      continue;
    }

    if (block.type === 'process_flow') {
      preSplitBlocks.push(...splitProcessFlowBlockForPagination(block));
      continue;
    }

    preSplitBlocks.push(block);
  }

  return expandBlocks(preSplitBlocks, language);
}
