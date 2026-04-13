'use client';

import { cn } from '@/lib/utils';
import type { NotebookContentDocument } from '@/lib/notebook-content';

type PatternLayoutViewProps = {
  document: NotebookContentDocument;
  renderInlineMathHtml: (text: string) => string;
};

function cardTitleToneClass(titleTone: NotebookContentDocument['blocks'][number]['titleTone']): string {
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

function blockTitle(language: 'zh-CN' | 'en-US', block: NotebookContentDocument['blocks'][number]): string {
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

function blockSummary(language: 'zh-CN' | 'en-US', block: NotebookContentDocument['blocks'][number]): string {
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
      return [block.problem, ...block.steps.slice(0, 2)].join('\n');
    case 'equation':
      return block.caption || (language === 'en-US' ? 'Formula details' : '公式说明');
    case 'matrix':
      return block.caption || (language === 'en-US' ? 'Matrix structure' : '矩阵结构');
    case 'code_block':
      return block.code.split('\n').slice(0, 3).join('\n');
    case 'code_walkthrough':
      return block.steps.map((step) => step.explanation).slice(0, 2).join('\n');
    case 'process_flow':
      return block.steps.map((step) => step.title).slice(0, 3).join(' → ');
    case 'layout_cards':
      return block.items.map((item) => item.title).slice(0, 4).join(' / ');
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
              dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(blockTitle(document.language, block)) }}
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
      <div className={cn('rounded-xl border border-border/70 bg-muted/20 px-4 py-3', isHorizontal ? 'space-y-3' : 'space-y-2')}>
        {isHorizontal ? (
          <div className="grid gap-3 md:grid-cols-3">
            {steps.map((block, index) => (
              <div key={index} className="rounded-xl border border-border/70 bg-background/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {document.language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`}
                </p>
                <p
                  className={cn('mt-1 text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(blockTitle(document.language, block)) }}
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
              <div key={index} className="relative rounded-xl border border-border/70 bg-background/80 px-4 py-3">
                <div className="absolute -left-[1.2rem] top-3 flex size-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                  {index + 1}
                </div>
                <p
                  className={cn('text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(blockTitle(document.language, block)) }}
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
              dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(blockTitle(document.language, block)) }}
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
