import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { matrixBlockToLatex } from './block-utils';
import { getExampleDisplaySteps } from './example-block';

function renderBlock(block: NotebookContentBlock, language: 'zh-CN' | 'en-US'): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(Math.max(1, Math.min(block.level + 1, 4)))} ${block.text}`;
    case 'paragraph':
      return block.text;
    case 'bullet_list':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'equation':
      return block.display ? `$$\n${block.latex}\n$$` : `$${block.latex}$`;
    case 'matrix':
      return [block.label || '', `$$\n${matrixBlockToLatex(block)}\n$$`, block.caption || '']
        .filter(Boolean)
        .join('\n');
    case 'derivation_steps':
      return [
        block.title ? `### ${block.title}` : '',
        ...block.steps.map((step, idx) => {
          const prefix = language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`;
          const expr = step.format === 'text' ? step.expression : `$$\n${step.expression}\n$$`;
          return `${prefix}\n${expr}${step.explanation ? `\n${step.explanation}` : ''}`;
        }),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'code_block':
      return `${block.caption ? `${block.caption}\n` : ''}\`\`\`${block.language}\n${block.code}\n\`\`\``;
    case 'code_walkthrough':
      return [
        `### ${block.title || (language === 'en-US' ? 'Code Walkthrough' : '代码讲解')}`,
        block.caption || '',
        `\`\`\`${block.language}\n${block.code}\n\`\`\``,
        `${language === 'en-US' ? 'Key Steps' : '关键步骤'}:\n${block.steps
          .map((step, idx) => {
            const prefix = `${idx + 1}.`;
            const title = step.title || step.focus;
            return `${prefix} ${title ? `${title} - ` : ''}${step.explanation}`;
          })
          .join('\n')}`,
        block.output
          ? `${language === 'en-US' ? 'Output' : '输出'}:\n\`\`\`\n${block.output}\n\`\`\``
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'code_trace':
      return [
        `### ${block.title || (language === 'en-US' ? 'Code Trace' : '代码追踪')}`,
        `\`\`\`${block.language}\n${block.code}\n\`\`\``,
        (block.inputs || []).length
          ? `${language === 'en-US' ? 'Inputs' : '输入'}: ${(block.inputs || [])
              .map((item) => `${item.name}=${item.value}`)
              .join(', ')}`
          : '',
        `${language === 'en-US' ? 'Trace' : '追踪'}:\n${block.steps
          .map((step, idx) => {
            const state = step.state.length
              ? ` (${step.state.map((item) => `${item.name}=${item.value}`).join(', ')})`
              : '';
            const line = step.line ? `L${step.line}: ` : '';
            return `${idx + 1}. ${line}${step.explanation}${state}`;
          })
          .join('\n')}`,
        block.output
          ? `${language === 'en-US' ? 'Output' : '输出'}:\n\`\`\`\n${block.output}\n\`\`\``
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'state_table': {
      const headerRow = `| ${block.columns.join(' | ')} |`;
      const divider = `| ${block.columns.map(() => '---').join(' | ')} |`;
      const rows = block.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
      return [
        block.title ? `### ${block.title}` : '',
        headerRow,
        divider,
        rows,
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'call_stack':
      return [
        `### ${block.title || (language === 'en-US' ? 'Call Stack' : '调用栈')}`,
        block.frames
          .map((frame, idx) => {
            const args = frame.args.map((item) => `${item.name}=${item.value}`).join(', ');
            const locals = frame.locals.map((item) => `${item.name}=${item.value}`).join(', ');
            return `${idx + 1}. ${frame.name}${args ? `(${args})` : ''}${locals ? ` | ${locals}` : ''}${frame.returnValue ? ` -> ${frame.returnValue}` : ''}`;
          })
          .join('\n'),
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'memory_diagram':
      return [
        `### ${block.title || (language === 'en-US' ? 'Memory Model' : '内存模型')}`,
        block.code ? `\`\`\`${block.language || 'text'}\n${block.code}\n\`\`\`` : '',
        block.steps.length
          ? `${language === 'en-US' ? 'Memory trace' : '内存追踪'}:\n${block.steps
              .map((step, index) => {
                const label =
                  step.title ||
                  (step.line
                    ? `line ${step.line}`
                    : language === 'en-US'
                      ? `Step ${index + 1}`
                      : `第 ${index + 1} 步`);
                return `- ${label}: ${step.explanation || ''}`;
              })
              .join('\n')}`
          : '',
        block.frames.length
          ? `${language === 'en-US' ? 'Frames' : '栈帧'}:\n${block.frames
              .map(
                (frame) =>
                  `- ${frame.name}: ${frame.variables
                    .map((item) => `${item.name}=${item.ref ? `-> ${item.ref}` : item.value}`)
                    .join(', ')}`,
              )
              .join('\n')}`
          : '',
        block.stack.length
          ? `${language === 'en-US' ? 'Stack' : '栈'}:\n${block.stack
              .map((item) => `- ${item.name}: ${item.ref ? `-> ${item.ref}` : item.value}`)
              .join('\n')}`
          : '',
        block.heap.length
          ? `${language === 'en-US' ? 'Heap' : '堆'}:\n${block.heap
              .map(
                (item) =>
                  `- ${item.id} ${item.label}: ${item.fields
                    .map((field) => `${field.name}=${field.value}`)
                    .join(', ')}`,
              )
              .join('\n')}`
          : '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'pointer_diagram':
      return [
        `### ${
          block.title ||
          (block.kind === 'linked_list'
            ? language === 'en-US'
              ? 'Linked List'
              : '链表结构'
            : language === 'en-US'
              ? 'Pointer Diagram'
              : '指针图')
        }`,
        block.operation || '',
        block.nodes.map((node) => `- ${node.id}: ${node.label}`).join('\n'),
        block.pointers.length
          ? block.pointers
              .map((pointer) => `- ${pointer.name} -> ${pointer.to || 'None'}`)
              .join('\n')
          : '',
        (block.steps || []).length
          ? (block.steps || [])
              .map((step, index) =>
                [
                  `${index + 1}. ${step.title || (language === 'en-US' ? 'Step' : '步骤')}`,
                  step.operation || '',
                  step.explanation || '',
                ]
                  .filter(Boolean)
                  .join(' - '),
              )
              .join('\n')
          : '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'tree_diagram':
      return [
        `### ${
          block.title ||
          (block.kind === 'bst'
            ? language === 'en-US'
              ? 'Binary Search Tree'
              : '二叉搜索树'
            : language === 'en-US'
              ? 'Tree Diagram'
              : '树结构图')
        }`,
        block.target ? `${language === 'en-US' ? 'Target' : '目标'}: ${block.target}` : '',
        block.path.length
          ? `${language === 'en-US' ? 'Path' : '路径'}: ${block.path.join(' -> ')}`
          : '',
        block.decision || '',
        block.nodes
          .map((node) =>
            (node.children || []).length
              ? `- ${node.id}: ${node.label}; children=${(node.children || []).join(', ')}`
              : `- ${node.id}: ${node.label}; left=${node.left || 'None'}; right=${node.right || 'None'}`,
          )
          .join('\n'),
        (block.steps || []).length
          ? (block.steps || [])
              .map((step, index) =>
                [
                  `${index + 1}. ${step.title || (language === 'en-US' ? 'Step' : '步骤')}`,
                  step.comparison || '',
                  step.direction || '',
                  step.result || '',
                ]
                  .filter(Boolean)
                  .join(' - '),
              )
              .join('\n')
          : '',
        block.invariant || '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'graph_trace':
      return [
        `### ${block.title || (language === 'en-US' ? 'Graph Trace' : '图遍历追踪')}`,
        `${language === 'en-US' ? 'Algorithm' : '算法'}: ${block.algorithm}`,
        block.startId ? `${language === 'en-US' ? 'Start' : '起点'}: ${block.startId}` : '',
        block.nodes.map((node) => `- ${node.id}: ${node.label}`).join('\n'),
        block.edges
          .map((edge) => `- ${edge.from} ${edge.directed || block.directed ? '->' : '--'} ${edge.to}`)
          .join('\n'),
        (block.steps || []).length
          ? (block.steps || [])
              .map((step, index) =>
                [
                  `${index + 1}. ${step.title || (language === 'en-US' ? 'Step' : '步骤')}`,
                  step.action || '',
                  step.current || '',
                  step.explanation || '',
                ]
                  .filter(Boolean)
                  .join(' - '),
              )
              .join('\n')
          : '',
        block.invariant || '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'invariant_panel':
      return [
        `### ${block.title || (language === 'en-US' ? 'Invariant Check' : '不变量检查')}`,
        block.structure || '',
        block.invariant,
        ...block.checks.map(
          (check) =>
            `- [${check.status}] ${check.label}: ${check.text}${check.reason ? ` (${check.reason})` : ''}`,
        ),
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'dictionary_diagram':
      return [
        `### ${block.title || (language === 'en-US' ? 'Dictionary Diagram' : '字典结构')}`,
        block.operation || '',
        block.lookupKey
          ? `${language === 'en-US' ? 'Lookup key' : '当前 key'}: ${block.lookupKey}`
          : '',
        block.entries
          .map(
            (entry) =>
              `- ${entry.key} -> ${entry.value}${entry.active ? ' [active]' : ''}${entry.changed ? ' [changed]' : ''}${entry.note ? ` (${entry.note})` : ''}`,
          )
          .join('\n'),
        block.result ? `${language === 'en-US' ? 'Result' : '查找结果'}: ${block.result}` : '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'linear_structure': {
      const title =
        block.title ||
        (block.kind === 'stack'
          ? language === 'en-US'
            ? 'Stack'
            : '栈'
          : language === 'en-US'
            ? 'Queue'
            : '队列');
      return [
        `### ${title}`,
        block.operation || '',
        `${language === 'en-US' ? 'Kind' : '类型'}: ${block.kind}`,
        block.items
          .map(
            (item) =>
              `- ${item.id}: ${item.label}${item.active ? ' [active]' : ''}${item.changed ? ' [changed]' : ''}${item.note ? ` (${item.note})` : ''}`,
          )
          .join('\n'),
        (block.steps || []).length
          ? (block.steps || [])
              .map(
                (step, index) =>
                  `${index + 1}. ${step.title || step.operation || ''}${step.explanation ? ` - ${step.explanation}` : ''}${step.result ? ` (${step.result})` : ''}`,
              )
              .join('\n')
          : '',
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'table': {
      const headers = block.headers && block.headers.length > 0 ? block.headers : undefined;
      if (!headers) {
        const rows = block.rows.map((row) => `- ${row.join(' | ')}`).join('\n');
        return [block.caption, rows].filter(Boolean).join('\n');
      }
      const headerRow = `| ${headers.join(' | ')} |`;
      const divider = `| ${headers.map(() => '---').join(' | ')} |`;
      const rows = block.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
      return [block.caption, headerRow, divider, rows].filter(Boolean).join('\n');
    }
    case 'callout':
      return `> ${block.title ? `${block.title}: ` : ''}${block.text}`;
    case 'definition':
      return `> ${block.title || (language === 'en-US' ? 'Definition' : '定义')}: ${block.text}`;
    case 'theorem':
      return [
        `> ${block.title || (language === 'en-US' ? 'Theorem' : '定理')}: ${block.text}`,
        block.proofIdea
          ? `> ${language === 'en-US' ? 'Proof idea' : '证明思路'}: ${block.proofIdea}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'example': {
      const goalLine = block.goal
        ? language === 'en-US'
          ? `Goal: ${block.goal}`
          : `目标：${block.goal}`
        : '';
      const displaySteps = getExampleDisplaySteps(block);
      return [
        `### ${block.title || (language === 'en-US' ? 'Example' : '例题')}`,
        language === 'en-US' ? `Problem: ${block.problem}` : `题目：${block.problem}`,
        block.givens.length > 0
          ? `${language === 'en-US' ? 'Given' : '已知'}:\n${block.givens.map((item) => `- ${item}`).join('\n')}`
          : '',
        goalLine,
        displaySteps.length
          ? `${language === 'en-US' ? 'Steps' : '步骤'}:\n${displaySteps.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`
          : '',
        block.answer ? `${language === 'en-US' ? 'Answer' : '答案'}: ${block.answer}` : '',
        block.pitfalls.length > 0
          ? `${language === 'en-US' ? 'Pitfalls' : '易错点'}:\n${block.pitfalls.map((item) => `- ${item}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'process_flow': {
      const context = Array.isArray(block.context) ? block.context : [];
      const steps = Array.isArray(block.steps) ? block.steps : [];
      return [
        `### ${block.title || (language === 'en-US' ? 'Process Flow' : '流程讲解')}`,
        context.length > 0
          ? `${language === 'en-US' ? 'Context' : '背景'}:\n${context
              .map((item) => `- ${item.label}: ${item.text}`)
              .join('\n')}`
          : '',
        `${language === 'en-US' ? 'Steps' : '步骤'}:\n${steps
          .map((step, idx) => {
            const note = step.note
              ? language === 'en-US'
                ? `\n   Note: ${step.note}`
                : `\n   提示：${step.note}`
              : '';
            return `${idx + 1}. ${step.title}\n   ${step.detail}${note}`;
          })
          .join('\n')}`,
        block.summary ? `${language === 'en-US' ? 'Summary' : '收束'}: ${block.summary}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'layout_cards':
      return [
        block.title
          ? `### ${block.title}`
          : language === 'en-US'
            ? '### Card Layout'
            : '### 卡片布局',
        block.items.map((item) => `- ${item.title}: ${item.text}`).join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'chem_formula':
      return block.caption ? `${block.caption}\n${block.formula}` : block.formula;
    case 'chem_equation':
      return block.caption ? `${block.caption}\n${block.equation}` : block.equation;
    default:
      return '';
  }
}

export function renderNotebookContentToMarkdown(document: NotebookContentDocument): string {
  return document.blocks
    .map((block) => renderBlock(block, document.language))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
