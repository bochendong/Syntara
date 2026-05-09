'use client';

import { cn } from '@/lib/utils';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { getExampleDisplaySteps } from '@/lib/notebook-content/example-block';

type PatternLayoutViewProps = {
  document: NotebookContentDocument;
  renderInlineMathHtml: (text: string) => string;
};

function cardTitleToneClass(
  titleTone: NotebookContentDocument['blocks'][number]['titleTone'],
): string {
  switch (titleTone) {
    case 'neutral':
      return 'text-foreground';
    case 'inverse':
      return 'text-white';
    case 'accent':
    default:
      return 'text-primary';
  }
}

function blockTitle(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentDocument['blocks'][number],
): string {
  if (block.cardTitle?.trim()) {
    return block.cardTitle.trim();
  }
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'callout':
    case 'definition':
    case 'theorem':
    case 'example':
    case 'process_flow':
    case 'code_walkthrough':
    case 'derivation_steps':
      return block.title || (language === 'en-US' ? 'Section' : '分节');
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
    case 'invariant_panel':
      return block.title || (language === 'en-US' ? 'Invariant Check' : '不变量检查');
    case 'dictionary_diagram':
      return block.title || (language === 'en-US' ? 'Dictionary Diagram' : '字典结构');
    case 'linear_structure':
      return (
        block.title ||
        (block.kind === 'stack'
          ? language === 'en-US'
            ? 'Stack'
            : '栈'
          : language === 'en-US'
            ? 'Queue'
            : '队列')
      );
    case 'equation':
      return language === 'en-US' ? 'Equation' : '公式';
    case 'matrix':
      return block.label || (language === 'en-US' ? 'Matrix' : '矩阵');
    case 'bullet_list':
      return language === 'en-US' ? 'Key Points' : '要点';
    case 'table':
      return block.caption || (language === 'en-US' ? 'Table' : '表格');
    case 'chem_formula':
      return language === 'en-US' ? 'Chemical Formula' : '化学式';
    case 'chem_equation':
      return language === 'en-US' ? 'Chemical Equation' : '化学方程式';
    case 'code_block':
      return block.caption || (language === 'en-US' ? 'Code' : '代码');
    case 'paragraph':
    default:
      return language === 'en-US' ? 'Overview' : '概览';
  }
}

function blockSummary(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentDocument['blocks'][number],
): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'bullet_list':
      return block.items.join('；');
    case 'callout':
    case 'definition':
      return block.text;
    case 'theorem':
      return [block.text, block.proofIdea || ''].filter(Boolean).join('\n');
    case 'example':
      return [block.problem, ...getExampleDisplaySteps(block).slice(0, 2)].join('\n');
    case 'equation':
      return block.caption || (language === 'en-US' ? 'Formula details' : '公式说明');
    case 'matrix':
      return block.caption || (language === 'en-US' ? 'Matrix structure' : '矩阵结构');
    case 'code_block':
      return block.code.split('\n').slice(0, 3).join('\n');
    case 'code_walkthrough':
      return block.steps
        .map((step) => step.explanation)
        .slice(0, 2)
        .join('\n');
    case 'code_trace':
      return block.steps
        .slice(0, 3)
        .map((step) => step.explanation)
        .join('\n');
    case 'state_table':
      return block.rows
        .slice(0, 3)
        .map((row) => row.join(' | '))
        .join('\n');
    case 'call_stack':
      return block.frames
        .slice(0, 4)
        .map((frame) => frame.name)
        .join(' → ');
    case 'memory_diagram':
      return [
        ...block.stack.slice(0, 4).map((item) => `${item.name} → ${item.ref || item.value}`),
        ...block.heap.slice(0, 3).map((item) => `${item.id}: ${item.label}`),
      ].join('\n');
    case 'pointer_diagram':
      return block.nodes
        .slice(0, 6)
        .map((node) => node.label)
        .join(' → ');
    case 'tree_diagram':
      return [block.invariant || '', ...block.nodes.slice(0, 6).map((node) => node.label)]
        .filter(Boolean)
        .join('\n');
    case 'invariant_panel':
      return [
        block.invariant,
        ...block.checks.map((check) => `${check.label}: ${check.text}`),
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'dictionary_diagram':
      return [
        block.operation || '',
        block.lookupKey ? `key: ${block.lookupKey}` : '',
        block.result || '',
        ...block.entries.slice(0, 6).map((entry) => `${entry.key} -> ${entry.value}`),
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'linear_structure':
      return [
        block.operation || '',
        ...block.items.slice(0, 8).map((item) => item.label),
        block.caption || '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'process_flow':
      return block.steps
        .map((step) => step.title)
        .slice(0, 3)
        .join(' → ');
    case 'layout_cards':
      return block.items
        .map((item) => item.title)
        .slice(0, 4)
        .join(' / ');
    case 'table':
      return block.rows
        .slice(0, 2)
        .map((row) => row.join(' | '))
        .join('\n');
    case 'chem_formula':
      return block.formula;
    case 'chem_equation':
      return block.equation;
    case 'derivation_steps':
      return block.steps
        .slice(0, 2)
        .map((step) => step.expression)
        .join('\n');
    default:
      return language === 'en-US' ? 'Content block' : '内容块';
  }
}

export function PatternLayoutView({ document, renderInlineMathHtml }: PatternLayoutViewProps) {
  const blocks = document.blocks.slice(0, 8);
  if (document.pattern === 'multi_column_cards') {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {blocks.map((block, index) => (
          <div key={index} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                cardTitleToneClass(block.titleTone),
              )}
              dangerouslySetInnerHTML={{
                __html: renderInlineMathHtml(blockTitle(document.language, block)),
              }}
            />
            <p
              className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
              dangerouslySetInnerHTML={{
                __html: renderInlineMathHtml(blockSummary(document.language, block)),
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (document.pattern === 'flow_horizontal' || document.pattern === 'flow_vertical') {
    const isHorizontal = document.pattern === 'flow_horizontal';
    const steps = blocks.slice(0, 6);
    return (
      <div
        className={cn(
          'rounded-xl border border-border/70 bg-muted/20 px-4 py-3',
          isHorizontal ? 'space-y-3' : 'space-y-2',
        )}
      >
        {isHorizontal ? (
          <div className="grid gap-3 md:grid-cols-3">
            {steps.map((block, index) => (
              <div
                key={index}
                className="rounded-xl border border-border/70 bg-background/80 px-3 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {document.language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`}
                </p>
                <p
                  className={cn('mt-1 text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMathHtml(blockTitle(document.language, block)),
                  }}
                />
                <p
                  className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMathHtml(blockSummary(document.language, block)),
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 border-l border-border/70 pl-4">
            {steps.map((block, index) => (
              <div
                key={index}
                className="relative rounded-xl border border-border/70 bg-background/80 px-4 py-3"
              >
                <div className="absolute -left-[1.2rem] top-3 flex size-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                  {index + 1}
                </div>
                <p
                  className={cn('text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMathHtml(blockTitle(document.language, block)),
                  }}
                />
                <p
                  className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMathHtml(blockSummary(document.language, block)),
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (document.pattern === 'symmetric_split') {
    const [leftBlock, rightBlock] = [blocks[0], blocks[1]];
    if (!leftBlock || !rightBlock) return null;
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[leftBlock, rightBlock].map((block, index) => (
          <div key={index} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                cardTitleToneClass(block.titleTone),
              )}
              dangerouslySetInnerHTML={{
                __html: renderInlineMathHtml(blockTitle(document.language, block)),
              }}
            />
            <p
              className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
              dangerouslySetInnerHTML={{
                __html: renderInlineMathHtml(blockSummary(document.language, block)),
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
