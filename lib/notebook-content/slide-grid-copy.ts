import type { NotebookContentBlock } from './schema';
import { renderInlineLatexToHtml } from './inline-html';
import {
  estimateCharsPerLine,
  estimateGridHeadingHeight,
  measureBulletListBlock,
  measureParagraphBlock,
  wrapTextToLines,
} from './measure';

export function fitParagraphBlockToHeight(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
}): { html: string; height: number } {
  const normalized = args.text.replace(/\r/g, '').trim();
  const paragraphLines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const paragraphHtml =
    paragraphLines.length > 0
      ? paragraphLines.map((line) => renderInlineLatexToHtml(line)).join('<br/>')
      : renderInlineLatexToHtml(normalized);
  const paragraphNodeHtml = `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${paragraphHtml}</p>`;
  const measurement = measureParagraphBlock({
    text: normalized,
    widthPx: args.widthPx,
    fontSizePx: args.fontSizePx,
    lineHeightPx: args.lineHeightPx,
    color: args.color,
  });

  return {
    html: paragraphNodeHtml,
    height: measurement.height,
  };
}

export function fitBulletListBlockToHeight(args: {
  items: string[];
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
  bulletColor: string;
  paragraphGapPx?: number;
}): { html: string; height: number } {
  const paragraphGapPx = args.paragraphGapPx ?? 5;
  const htmlParts: string[] = [];

  for (const item of args.items) {
    const normalizedItem = item.replace(/\r/g, '').trim();
    if (!normalizedItem) continue;
    const logicalLines = normalizedItem
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const lineHtml = logicalLines
      .map((line, index) =>
        index === 0
          ? `<span style="color:${args.bulletColor};font-weight:700;">•</span> ${renderInlineLatexToHtml(line)}`
          : `${'&nbsp;'.repeat(4)}${renderInlineLatexToHtml(line)}`,
      )
      .join('<br/>');

    htmlParts.push(
      `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${lineHtml}</p>`,
    );
  }

  const measurement = measureBulletListBlock({
    items: args.items,
    widthPx: args.widthPx,
    fontSizePx: args.fontSizePx,
    lineHeightPx: args.lineHeightPx,
    color: args.color,
    bulletColor: args.bulletColor,
    paragraphGapPx,
  });
  return {
    html: htmlParts.join(''),
    height: measurement.height,
  };
}

export function clampWrappedLines(lines: string[], _maxLines: number, _maxChars: number): string[] {
  // Keep full content: no truncation at generation-time.
  return lines;
}

export function deriveGridHeadingFromText(text: string, language: 'zh-CN' | 'en-US'): string {
  void language;
  // Keep the full heading text to avoid generation-time truncation.
  return text.replace(/\s+/g, ' ').trim();
}

export function blockToGridHeading(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
): string {
  if (block.cardTitle?.trim()) {
    return block.cardTitle.trim();
  }
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return deriveGridHeadingFromText(block.text, language);
    case 'bullet_list':
      return deriveGridHeadingFromText(block.items[0] || '', language);
    case 'equation':
      return language === 'en-US' ? 'Formula' : '公式';
    case 'matrix':
      return block.label || (language === 'en-US' ? 'Matrix' : '矩阵');
    case 'derivation_steps':
      return block.title || (language === 'en-US' ? 'Derivation' : '推导');
    case 'code_block':
      return block.caption || (language === 'en-US' ? 'Code' : '代码');
    case 'code_walkthrough':
      return block.title || (language === 'en-US' ? 'Code Walkthrough' : '代码讲解');
    case 'code_trace':
      return block.title || (language === 'en-US' ? 'Code Trace' : '代码追踪');
    case 'state_table':
      return block.title || (language === 'en-US' ? 'State Table' : '状态表');
    case 'call_stack':
      return block.title || (language === 'en-US' ? 'Call Stack' : '调用栈');
    case 'memory_diagram':
      return block.title || (language === 'en-US' ? 'Memory Model' : '内存模型');
    case 'pointer_diagram':
      return (
        block.title ||
        (block.kind === 'linked_list'
          ? language === 'en-US'
            ? 'Linked List'
            : '链表结构'
          : language === 'en-US'
            ? 'Pointer Diagram'
            : '指针图')
      );
    case 'tree_diagram':
      return (
        block.title ||
        (block.kind === 'bst'
          ? language === 'en-US'
            ? 'Binary Search Tree'
            : '二叉搜索树'
          : language === 'en-US'
            ? 'Tree Diagram'
            : '树结构图')
      );
    case 'graph_trace':
      return block.title || (language === 'en-US' ? 'Graph Trace' : '图遍历追踪');
    case 'invariant_panel':
      return block.title || (language === 'en-US' ? 'Invariant Check' : '不变量检查');
    case 'table':
      return block.caption || (language === 'en-US' ? 'Table' : '表格');
    case 'callout':
      return block.title || (language === 'en-US' ? 'Callout' : '提示');
    case 'definition':
      return block.title || (language === 'en-US' ? 'Definition' : '定义');
    case 'theorem':
      return block.title || (language === 'en-US' ? 'Theorem' : '定理');
    case 'example':
      return block.title || (language === 'en-US' ? 'Example' : '例题');
    case 'process_flow':
      return block.title || (language === 'en-US' ? 'Flow' : '流程');
    case 'layout_cards':
      return block.title || (language === 'en-US' ? 'Card Layout' : '卡片布局');
    case 'chem_formula':
      return language === 'en-US' ? 'Chemical Formula' : '化学式';
    case 'chem_equation':
      return language === 'en-US' ? 'Chemical Equation' : '化学方程式';
    case 'visual':
      return block.title || block.caption || (language === 'en-US' ? 'Visual' : '图示');
    default:
      return language === 'en-US' ? 'Content' : '内容';
  }
}

export function blockToGridBody(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
): string[] {
  switch (block.type) {
    case 'heading':
      return [];
    case 'paragraph':
      return [block.text];
    case 'bullet_list':
      return block.items.slice(0, 6);
    case 'equation':
      return [block.latex, ...(block.caption ? [block.caption] : [])];
    case 'matrix':
      return [
        ...block.rows.slice(0, 3).map((row) => row.join('  ')),
        ...(block.caption ? [block.caption] : []),
      ];
    case 'derivation_steps':
      return block.steps.slice(0, 4).map((step, idx) => {
        const prefix = language === 'en-US' ? `Step ${idx + 1}: ` : `步骤 ${idx + 1}：`;
        return `${prefix}${step.expression}${step.explanation ? ` — ${step.explanation}` : ''}`;
      });
    case 'code_block':
      return block.code.split('\n').slice(0, 6);
    case 'code_walkthrough':
      return block.steps.slice(0, 4).map((step, idx) => {
        const label = step.title || step.focus;
        const prefix = language === 'en-US' ? `Step ${idx + 1}: ` : `步骤 ${idx + 1}：`;
        return `${prefix}${label ? `${label} - ` : ''}${step.explanation}`;
      });
    case 'code_trace':
      return [
        ...block.steps.slice(0, 4).map((step, idx) => {
          const prefix = language === 'en-US' ? `Step ${idx + 1}: ` : `步骤 ${idx + 1}：`;
          const line = step.line ? `L${step.line} - ` : '';
          const state = step.state.length
            ? ` (${step.state.map((item) => `${item.name}=${item.value}`).join(', ')})`
            : '';
          return `${prefix}${line}${step.explanation}${state}`;
        }),
        ...(block.output ? [block.output] : []),
      ];
    case 'state_table': {
      const header = block.columns.join(' | ');
      const rows = block.rows.slice(0, 5).map((row) => row.join(' | '));
      return [header, ...rows, ...(block.caption ? [block.caption] : [])];
    }
    case 'call_stack':
      return block.frames.slice(0, 6).map((frame, idx) => {
        const args = frame.args.map((item) => `${item.name}=${item.value}`).join(', ');
        const locals = frame.locals.map((item) => `${item.name}=${item.value}`).join(', ');
        const label = language === 'en-US' ? `Frame ${idx + 1}` : `栈帧 ${idx + 1}`;
        return `${label}: ${frame.name}${args ? `(${args})` : ''}${locals ? ` | ${locals}` : ''}`;
      });
    case 'memory_diagram':
      return [
        ...block.stack.slice(0, 5).map((item) => `${item.name} → ${item.ref || item.value}`),
        ...block.heap
          .slice(0, 4)
          .map(
            (item) =>
              `${item.id}: ${item.label}${item.fields.length ? ` (${item.fields.map((field) => `${field.name}=${field.value}`).join(', ')})` : ''}`,
          ),
      ];
    case 'pointer_diagram':
      return [
        ...(block.operation ? [block.operation] : []),
        block.nodes
          .slice(0, 8)
          .map((node) => node.label)
          .join(' → '),
        ...block.pointers.map((pointer) => `${pointer.name} → ${pointer.to || 'None'}`),
      ];
    case 'tree_diagram':
      return [
        ...(block.target ? [`${language === 'en-US' ? 'Target' : '目标'}: ${block.target}`] : []),
        ...(block.decision ? [block.decision] : []),
        ...(block.invariant ? [block.invariant] : []),
        ...block.nodes
          .slice(0, 8)
          .map((node) =>
            (node.children || []).length
              ? `${node.label}: children=${(node.children || []).join(', ')}`
              : `${node.label}: L=${node.left || 'None'}, R=${node.right || 'None'}`,
          ),
      ];
    case 'graph_trace':
      return [
        `${block.algorithm}: ${block.nodes.map((node) => node.label).join(', ')}`,
        ...block.edges
          .slice(0, 8)
          .map((edge) => `${edge.from} ${edge.directed || block.directed ? '→' : '-'} ${edge.to}`),
        ...(block.steps || [])
          .slice(0, 4)
          .map((step) => [step.title, step.explanation].filter(Boolean).join(': ')),
        ...(block.caption ? [block.caption] : []),
      ].filter(Boolean);
    case 'linear_structure':
      return [
        block.operation || '',
        `${block.kind}: ${block.items.map((item) => item.label).join(' → ')}`,
        ...(block.steps || []).slice(0, 4).map((step) => step.title || step.operation || ''),
        ...(block.caption ? [block.caption] : []),
      ].filter(Boolean);
    case 'invariant_panel':
      return [
        block.invariant,
        ...block.checks.map((check) => `${check.label}: ${check.text}`),
        ...(block.caption ? [block.caption] : []),
      ];
    case 'table': {
      const header = block.headers?.length ? [block.headers.join(' | ')] : [];
      const rows = block.rows.slice(0, 4).map((row) => row.join(' | '));
      return [...header, ...rows];
    }
    case 'callout':
      return [block.text];
    case 'definition':
      return [block.text];
    case 'theorem':
      return [block.text, ...(block.proofIdea ? [block.proofIdea] : [])];
    case 'example':
      return [
        block.problem,
        ...block.steps
          .slice(0, 3)
          .map(
            (step, idx) =>
              `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${step}`,
          ),
      ];
    case 'process_flow': {
      const context = Array.isArray(block.context) ? block.context : [];
      const steps = Array.isArray(block.steps) ? block.steps : [];
      return [
        ...context.slice(0, 3).map((item) => `${item.label}: ${item.text}`),
        ...steps
          .slice(0, 3)
          .map(
            (step, idx) =>
              `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${step.title} - ${step.detail}`,
          ),
        ...(block.summary ? [block.summary] : []),
      ];
    }
    case 'layout_cards':
      return block.items.map((item) => `${item.title}: ${item.text}`);
    case 'chem_formula':
      return [block.formula, ...(block.caption ? [block.caption] : [])];
    case 'chem_equation':
      return [block.equation, ...(block.caption ? [block.caption] : [])];
    case 'visual':
      return [block.alt || '', ...(block.caption ? [block.caption] : [])].filter(Boolean);
    default:
      return [];
  }
}

export function fitGridHeadingToHeight(args: {
  text: string;
  widthPx: number;
  maxHeightPx: number;
  color: string;
}): { html: string; height: number } {
  if (!args.text.trim()) {
    return { html: '', height: 0 };
  }
  const maxChars = estimateCharsPerLine(args.text, args.widthPx, 16);
  const wrapped = wrapTextToLines(args.text, maxChars);
  const fitted = clampWrappedLines(wrapped, Number.MAX_SAFE_INTEGER, maxChars);
  return {
    html: fitted
      .map(
        (line) =>
          `<p style="font-size:16px;color:${args.color};line-height:22px;"><strong>${renderInlineLatexToHtml(line)}</strong></p>`,
      )
      .join(''),
    height: estimateGridHeadingHeight({
      text: args.text,
      widthPx: args.widthPx,
      fontSizePx: 16,
      lineHeightPx: 22,
    }),
  };
}

export function fitGridBodyToHeight(args: {
  language: 'zh-CN' | 'en-US';
  block: NotebookContentBlock;
  widthPx: number;
  maxHeightPx: number;
  tone: { accent: string };
}): { html: string; height: number } {
  if (args.maxHeightPx <= 24) return { html: '', height: 0 };

  if (args.block.type === 'paragraph') {
    return fitParagraphBlockToHeight({
      text: args.block.text,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
      maxHeightPx: args.maxHeightPx,
      color: '#334155',
    });
  }

  if (args.block.type === 'bullet_list') {
    return fitBulletListBlockToHeight({
      items: args.block.items,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
      maxHeightPx: args.maxHeightPx,
      color: '#334155',
      bulletColor: args.tone.accent,
      paragraphGapPx: 5,
    });
  }

  const bodyLines = blockToGridBody(args.language, args.block);
  return fitBulletListBlockToHeight({
    items: bodyLines,
    widthPx: args.widthPx,
    fontSizePx: 14,
    lineHeightPx: 20,
    maxHeightPx: args.maxHeightPx,
    color: '#334155',
    bulletColor: args.tone.accent,
    paragraphGapPx: 5,
  });
}
