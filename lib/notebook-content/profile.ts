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
    case 'code_trace':
      return [
        block.title || '',
        block.code,
        ...block.steps.flatMap((step) => [
          step.explanation,
          ...step.state.flatMap((item) => [item.name, item.value]),
        ]),
        block.output || '',
      ];
    case 'state_table':
      return [block.title || '', ...block.columns, ...block.rows.flat(), block.caption || ''];
    case 'call_stack':
      return [
        block.title || '',
        ...block.frames.flatMap((frame) => [
          frame.name,
          ...frame.args.flatMap((item) => [item.name, item.value]),
          ...frame.locals.flatMap((item) => [item.name, item.value]),
          frame.returnValue || '',
          frame.note || '',
        ]),
        block.caption || '',
      ];
    case 'memory_diagram':
      return [
        block.title || '',
        ...block.stack.flatMap((item) => [item.name, item.value, item.ref || '']),
        ...block.heap.flatMap((item) => [
          item.id,
          item.label,
          ...item.fields.flatMap((field) => [field.name, field.value]),
        ]),
        ...block.links.flatMap((link) => [link.from, link.to, link.label || '']),
        block.caption || '',
      ];
    case 'pointer_diagram':
      return [
        block.title || '',
        block.operation || '',
        block.kind || '',
        ...block.nodes.flatMap((node) => [
          node.id,
          node.label,
          ...node.fields.flatMap((field) => [field.name, field.value]),
        ]),
        ...block.pointers.flatMap((pointer) => [pointer.name, pointer.to || 'None']),
        ...block.links.flatMap((link) => [link.from, link.to, link.label || '']),
        block.caption || '',
      ];
    case 'tree_diagram':
      return [
        block.title || '',
        block.kind || '',
        block.target || '',
        block.decision || '',
        ...block.nodes.flatMap((node) => [
          node.id,
          node.label,
          ...(node.children || []),
          node.left || '',
          node.right || '',
        ]),
        block.invariant || '',
        block.caption || '',
      ];
    case 'graph_trace':
      return [
        block.title || '',
        block.algorithm,
        block.startId || '',
        ...block.nodes.flatMap((node) => [node.id, node.label]),
        ...block.edges.flatMap((edge) => [edge.from, edge.to, edge.label || '']),
        ...block.steps.flatMap((step) => [
          step.title || '',
          step.action || '',
          step.current || '',
          ...step.frontier,
          ...step.visited,
          ...step.order,
          step.explanation || '',
          step.result || '',
        ]),
        block.invariant || '',
        block.caption || '',
      ];
    case 'linear_structure':
      return [
        block.title || '',
        block.kind,
        block.operation || '',
        ...block.items.flatMap((item) => [item.id, item.label, item.note || '']),
        ...block.steps.flatMap((step) => [
          step.title || '',
          step.operation || '',
          ...step.items.flatMap((item) => [item.id, item.label, item.note || '']),
          ...step.focus,
          step.explanation || '',
          step.result || '',
        ]),
        block.caption || '',
      ];
    case 'invariant_panel':
      return [
        block.title || '',
        block.structure || '',
        block.invariant,
        ...block.checks.flatMap((check) => [
          check.label,
          check.text,
          check.status,
          check.reason || '',
        ]),
        block.caption || '',
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
      const processContext = Array.isArray(block.context) ? block.context : [];
      const processSteps = Array.isArray(block.steps) ? block.steps : [];
      return [
        block.title || '',
        ...processContext.flatMap((item) => [item.label, item.text]),
        ...processSteps.flatMap((step) => [step.title, step.detail, step.note || '']),
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
  if (
    blocks.some((block) =>
      [
        'code_block',
        'code_walkthrough',
        'code_trace',
        'state_table',
        'call_stack',
        'memory_diagram',
        'pointer_diagram',
        'tree_diagram',
        'graph_trace',
        'invariant_panel',
        'linear_structure',
      ].includes(block.type),
    )
  ) {
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
