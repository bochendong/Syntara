import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentLayoutFamily,
  NotebookContentOverflowPolicy,
} from './schema';
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
      expanded.push({
        type: 'bullet_list',
        items: block.steps.map(
          (item, idx) => `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${item}`,
        ),
      });
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

function splitProcessFlowBlockForPagination(block: ProcessFlowBlock): NotebookContentBlock[] {
  if (block.orientation === 'horizontal') {
    const hasDenseStep = block.steps.some(
      (step) => step.title.length > 28 || step.detail.length > 100 || (step.note?.length ?? 0) > 72,
    );
    const maxStepsPerPage = hasDenseStep || block.context.length >= 3 ? 3 : 4;
    if (block.steps.length <= maxStepsPerPage) return [block];

    const chunks: NotebookContentBlock[] = [];
    for (let index = 0; index < block.steps.length; index += maxStepsPerPage) {
      const isFirst = index === 0;
      const isLast = index + maxStepsPerPage >= block.steps.length;
      chunks.push({
        ...block,
        context: isFirst ? block.context : [],
        steps: block.steps.slice(index, index + maxStepsPerPage),
        summary: isLast ? block.summary : undefined,
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
    ...block,
    context: includeContext ? block.context : [],
    steps,
    summary: includeSummary ? block.summary : undefined,
  });

  for (let index = 0; index < block.steps.length; index += 1) {
    const step = block.steps[index];
    const candidateSteps = [...currentSteps, step];
    const hasMoreSteps = index < block.steps.length - 1;
    const candidateBlock = buildCandidate(
      candidateSteps,
      chunks.length === 0,
      !hasMoreSteps && Boolean(block.summary),
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
    chunks.push(buildCandidate(currentSteps, chunks.length === 0, Boolean(block.summary)));
  }

  if (chunks.length <= 1) {
    return chunks.length > 0 ? chunks : [block];
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

    if (block.type === 'process_flow') {
      preSplitBlocks.push(...splitProcessFlowBlockForPagination(block));
      continue;
    }

    preSplitBlocks.push(block);
  }

  return expandBlocks(preSplitBlocks, language);
}
