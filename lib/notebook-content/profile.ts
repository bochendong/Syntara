import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentProfile,
} from './schema';

function looksLikeCode(text: string): boolean {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return false;

  if (/```/.test(normalized)) return true;
  if (/<\/?[a-z][^>]*>/i.test(normalized)) return true;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const signalCount = lines.slice(0, 12).reduce((count, line) => {
    return (
      count +
      (/\b(function|const|let|var|return|class|def|import|from|if|else|elif|for|while|switch|case|try|catch|interface|type|async|await|print|console\.log)\b|=>|[{};<>]=?|^\s*#include\b|^\s*SELECT\b/i.test(
        line,
      )
        ? 1
        : 0)
    );
  }, 0);

  return signalCount >= 2;
}

function looksLikeMath(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return (
    /\\(begin|end|frac|sqrt|sum|int|lim|alpha|beta|gamma|theta|pi|cdot|times|left|right|pmatrix|bmatrix|matrix|cases|infty)/.test(
      normalized,
    ) ||
    /\b(matrix|matrices|determinant|vector|eigen|gaussian|row reduction|RREF|equation|proof|theorem|integral|derivative)\b/i.test(
      normalized,
    ) ||
    /(矩阵|行变换|方程组|特征值|特征向量|高斯|消元|定理|证明|导数|积分|极限|向量)/.test(
      normalized,
    ) ||
    /\$\$|\\\[|\\\(|\^\{|\_\{|[∑∫√∞≈≠≤≥→←↦∀∃∈∉⊂⊆∪∩]/.test(normalized)
  );
}

function collectBlockText(block: NotebookContentBlock): string[] {
  switch (block.type) {
    case 'heading':
      return [block.text];
    case 'paragraph':
      return [block.text];
    case 'bullet_list':
      return block.items;
    case 'equation':
      return [block.latex];
    case 'matrix':
      return [block.label || '', block.caption || '', ...block.rows.flat()];
    case 'derivation_steps':
      return [
        block.title || '',
        ...block.steps.flatMap((step) => [step.expression, step.explanation || '']),
      ];
    case 'code_block':
      return [block.caption || '', block.code];
    case 'code_walkthrough':
      return [
        block.title || '',
        block.caption || '',
        block.code,
        ...block.steps.flatMap((step) => [step.title || '', step.focus || '', step.explanation]),
        block.output || '',
      ];
    case 'table':
      return [block.caption || '', ...(block.headers || []), ...block.rows.flat()];
    case 'callout':
      return [block.title || '', block.text];
    case 'definition':
      return [block.title || '', block.text];
    case 'theorem':
      return [block.title || '', block.text, block.proofIdea || ''];
    case 'example':
      return [
        block.title || '',
        block.problem,
        ...block.givens,
        block.goal || '',
        ...block.steps,
        block.answer || '',
        ...block.pitfalls,
      ];
    case 'process_flow':
      return [
        block.title || '',
        ...block.context.flatMap((item) => [item.label, item.text]),
        ...block.steps.flatMap((step) => [step.title, step.detail, step.note || '']),
        block.summary || '',
      ];
    case 'layout_cards':
      return [block.title || '', ...block.items.flatMap((item) => [item.title, item.text])];
    case 'chem_formula':
      return [block.caption || '', block.formula];
    case 'chem_equation':
      return [block.caption || '', block.equation];
    default:
      return [];
  }
}

export function inferNotebookContentProfileFromText(text: string): NotebookContentProfile {
  if (looksLikeCode(text)) return 'code';
  if (looksLikeMath(text)) return 'math';
  return 'general';
}

export function inferNotebookContentProfileFromBlocks(
  blocks: NotebookContentBlock[],
): NotebookContentProfile {
  if (blocks.some((block) => block.type === 'code_block' || block.type === 'code_walkthrough')) {
    return 'code';
  }

  if (
    blocks.some(
      (block) =>
        block.type === 'equation' || block.type === 'matrix' || block.type === 'derivation_steps',
    )
  ) {
    return 'math';
  }

  const merged = blocks.flatMap((block) => collectBlockText(block)).join('\n');
  return inferNotebookContentProfileFromText(merged);
}

export function resolveNotebookContentProfile(
  document: Pick<NotebookContentDocument, 'profile' | 'blocks'>,
): NotebookContentProfile {
  return document.profile || inferNotebookContentProfileFromBlocks(document.blocks);
}
