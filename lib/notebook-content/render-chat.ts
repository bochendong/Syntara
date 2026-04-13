import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { matrixBlockToLatex } from './block-utils';

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
      return [
        `### ${block.title || (language === 'en-US' ? 'Example' : '例题')}`,
        language === 'en-US' ? `Problem: ${block.problem}` : `题目：${block.problem}`,
        block.givens.length > 0
          ? `${language === 'en-US' ? 'Given' : '已知'}:\n${block.givens.map((item) => `- ${item}`).join('\n')}`
          : '',
        goalLine,
        `${language === 'en-US' ? 'Steps' : '步骤'}:\n${block.steps.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`,
        block.answer ? `${language === 'en-US' ? 'Answer' : '答案'}: ${block.answer}` : '',
        block.pitfalls.length > 0
          ? `${language === 'en-US' ? 'Pitfalls' : '易错点'}:\n${block.pitfalls.map((item) => `- ${item}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'process_flow':
      return [
        `### ${block.title || (language === 'en-US' ? 'Process Flow' : '流程讲解')}`,
        block.context.length > 0
          ? `${language === 'en-US' ? 'Context' : '背景'}:\n${block.context
              .map((item) => `- ${item.label}: ${item.text}`)
              .join('\n')}`
          : '',
        `${language === 'en-US' ? 'Steps' : '步骤'}:\n${block.steps
          .map((step, idx) => {
            const note = step.note
              ? language === 'en-US'
                ? `\n   Note: ${step.note}`
                : `\n   提示：${step.note}`
              : '';
            return `${idx + 1}. ${step.title}\n   ${step.detail}${note}`;
          })
          .join('\n')}`,
        block.summary
          ? `${language === 'en-US' ? 'Summary' : '收束'}: ${block.summary}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
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
