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
    case 'process_flow':
      return [
        ...block.context.slice(0, 3).map((item) => `${item.label}: ${item.text}`),
        ...block.steps
          .slice(0, 3)
          .map(
            (step, idx) =>
              `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${step.title} - ${step.detail}`,
          ),
        ...(block.summary ? [block.summary] : []),
      ];
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
