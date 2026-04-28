'use client';

import { memo } from 'react';
import type { BundledLanguage } from 'shiki';
import { cn } from '@/lib/utils';
import { renderMathToHtml, renderTextWithMathToHtml } from '@/lib/math-engine';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { chemistryTextToHtml } from '@/lib/notebook-content';
import { matrixBlockToLatex } from '@/lib/notebook-content/block-utils';
import { PatternLayoutView } from './pattern-layout-view';

interface NotebookContentViewProps {
  document: NotebookContentDocument;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function FormulaBlock({ latex, display = true }: { latex: string; display?: boolean }) {
  const html = renderMathToHtml(latex, { displayMode: display });
  return <div className="[&_.katex-display]:my-1" dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderInlineMathHtml(text: string): string {
  return renderTextWithMathToHtml(text, { forceInline: true, rawFallback: true }) || '';
}

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

export const NotebookContentView = memo(function NotebookContentView({
  document,
  className,
}: NotebookContentViewProps) {
  const patternPreview =
    document.pattern && document.pattern !== 'auto' ? (
      <PatternLayoutView document={document} renderInlineMathHtml={renderInlineMathHtml} />
    ) : null;

  return (
    <div className={cn('space-y-3 text-sm text-foreground', className)}>
      {patternPreview}
      {document.blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <h3
                key={index}
                className={cn(
                  'font-semibold tracking-tight',
                  block.level <= 1 ? 'text-xl' : block.level === 2 ? 'text-lg' : 'text-base',
                )}
              >
                <span dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.text) }} />
              </h3>
            );
          case 'paragraph':
            return (
              <div key={index} className="space-y-1">
                {block.cardTitle ? (
                  <p
                    className={cn('text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.cardTitle) }}
                  />
                ) : null}
                <p
                  className="whitespace-pre-wrap leading-7 text-foreground"
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.text) }}
                />
              </div>
            );
          case 'bullet_list':
            return (
              <div key={index} className="space-y-1">
                {block.cardTitle ? (
                  <p
                    className={cn('text-sm font-semibold', cardTitleToneClass(block.titleTone))}
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.cardTitle) }}
                  />
                ) : null}
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  {block.items.map((item, itemIdx) => (
                    <li
                      key={itemIdx}
                      className="whitespace-pre-wrap leading-7"
                      dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item) }}
                    />
                  ))}
                </ul>
              </div>
            );
          case 'equation':
            return (
              <div key={index} className="space-y-1">
                <FormulaBlock latex={block.latex} display={block.display} />
                {block.caption ? (
                  <p
                    className="text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
              </div>
            );
          case 'matrix':
            return (
              <div
                key={index}
                className="space-y-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                {block.label ? (
                  <p
                    className="text-sm font-medium text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.label) }}
                  />
                ) : null}
                <FormulaBlock latex={matrixBlockToLatex(block)} display />
                {block.caption ? (
                  <p
                    className="text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
              </div>
            );
          case 'derivation_steps':
            return (
              <div key={index} className="space-y-2">
                {block.title ? (
                  <p
                    className="font-medium text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.title) }}
                  />
                ) : null}
                {block.steps.map((step, stepIdx) => (
                  <div
                    key={stepIdx}
                    className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {document.language === 'en-US'
                        ? `Step ${stepIdx + 1}`
                        : `步骤 ${stepIdx + 1}`}
                    </p>
                    {step.format === 'latex' ? (
                      <FormulaBlock latex={step.expression} display />
                    ) : step.format === 'chem' ? (
                      <p
                        className="text-base text-foreground"
                        dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(step.expression) }}
                      />
                    ) : (
                      <p
                        className="whitespace-pre-wrap leading-7 text-foreground"
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.expression) }}
                      />
                    )}
                    {step.explanation ? (
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.explanation) }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            );
          case 'code_block': {
            const codeLanguage = (block.language || 'text') as BundledLanguage;
            return (
              <div key={index} className="space-y-2">
                {block.caption ? (
                  <p
                    className="text-xs font-medium text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
                <CodeBlock code={block.code} language={codeLanguage}>
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            );
          }
          case 'code_walkthrough': {
            const codeLanguage = (block.language || 'text') as BundledLanguage;
            const outputLanguage = 'text' as BundledLanguage;
            return (
              <div
                key={index}
                className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
              >
                {block.title ? (
                  <p
                    className="text-sm font-semibold text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.title) }}
                  />
                ) : null}
                {block.caption ? (
                  <p
                    className="text-xs font-medium text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
                <CodeBlock code={block.code} language={codeLanguage}>
                  <CodeBlockCopyButton />
                </CodeBlock>
                <div className="space-y-2">
                  {block.steps.map((step, stepIdx) => (
                    <div
                      key={stepIdx}
                      className="rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {document.language === 'en-US'
                          ? `Step ${stepIdx + 1}`
                          : `步骤 ${stepIdx + 1}`}
                        {step.title || step.focus ? ` · ${step.title || step.focus}` : ''}
                      </p>
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground"
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.explanation) }}
                      />
                    </div>
                  ))}
                </div>
                {block.output ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {document.language === 'en-US' ? 'Output' : '输出'}
                    </p>
                    <CodeBlock code={block.output} language={outputLanguage}>
                      <CodeBlockCopyButton />
                    </CodeBlock>
                  </div>
                ) : null}
              </div>
            );
          }
          case 'table': {
            const headers =
              block.headers && block.headers.length > 0
                ? block.headers
                : block.rows[0]?.map((_, idx) =>
                    document.language === 'en-US' ? `Column ${idx + 1}` : `列 ${idx + 1}`,
                  ) || [];
            return (
              <div key={index} className="space-y-2 overflow-x-auto">
                {block.caption ? (
                  <p
                    className="text-xs font-medium text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
                <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {headers.map((header, headerIdx) => (
                        <th
                          key={headerIdx}
                          className="px-3 py-2 font-semibold text-foreground"
                          dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(header) }}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/60">
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className="px-3 py-2 align-top text-foreground"
                            dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(cell) }}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'callout': {
            const toneClass = {
              info: 'border-blue-200 bg-blue-50/70 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100',
              success:
                'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100',
              warning:
                'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100',
              danger:
                'border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100',
              tip: 'border-violet-200 bg-violet-50/80 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-100',
            }[block.tone];
            return (
              <div key={index} className={cn('rounded-xl border px-3 py-2.5', toneClass)}>
                {block.title ? (
                  <p
                    className="mb-1 text-sm font-semibold"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.title) }}
                  />
                ) : null}
                <p
                  className="whitespace-pre-wrap leading-7"
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.text) }}
                />
              </div>
            );
          }
          case 'definition':
            return (
              <div
                key={index}
                className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-slate-900"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  {block.title || (document.language === 'en-US' ? 'Definition' : '定义')}
                </p>
                <p
                  className="mt-1 whitespace-pre-wrap leading-7"
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.text) }}
                />
              </div>
            );
          case 'theorem':
            return (
              <div
                key={index}
                className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-slate-900"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  {block.title || (document.language === 'en-US' ? 'Theorem' : '定理')}
                </p>
                <p
                  className="mt-1 whitespace-pre-wrap leading-7"
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.text) }}
                />
                {block.proofIdea ? (
                  <p
                    className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950/75"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.proofIdea) }}
                  />
                ) : null}
              </div>
            );
          case 'example':
            return (
              <div key={index} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <p
                  className="text-sm font-semibold text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMathHtml(
                      block.title ||
                        (document.language === 'en-US' ? 'Worked Example' : '例题讲解'),
                    ),
                  }}
                />
                <p
                  className="mt-2 whitespace-pre-wrap leading-7 text-foreground"
                  dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.problem) }}
                />
                {block.givens.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
                    {block.givens.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item) }}
                      />
                    ))}
                  </ul>
                ) : null}
                {block.goal ? (
                  <p
                    className="mt-2 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.goal) }}
                  />
                ) : null}
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-foreground">
                  {block.steps.map((step, stepIdx) => (
                    <li
                      key={stepIdx}
                      className="whitespace-pre-wrap leading-7"
                      dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step) }}
                    />
                  ))}
                </ol>
                {block.answer ? (
                  <p
                    className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                    dangerouslySetInnerHTML={{
                      __html: `${escapeHtml(document.language === 'en-US' ? 'Answer: ' : '答案：')}${renderInlineMathHtml(block.answer)}`,
                    }}
                  />
                ) : null}
                {block.pitfalls.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {block.pitfalls.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item) }}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          case 'process_flow': {
            const contextToneClass = {
              neutral:
                'border-slate-200 bg-slate-50/80 text-slate-900 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-100',
              info: 'border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100',
              warning:
                'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100',
              success:
                'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100',
            } as const;
            const contextColumns =
              block.context.length === 4 ? 2 : Math.min(3, Math.max(1, block.context.length));

            return (
              <div
                key={index}
                className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
              >
                {block.title ? (
                  <p
                    className="text-sm font-semibold text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.title) }}
                  />
                ) : null}

                {block.context.length > 0 ? (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${contextColumns}, minmax(0, 1fr))` }}
                  >
                    {block.context.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className={cn(
                          'rounded-xl border px-3 py-2.5',
                          contextToneClass[item.tone || 'neutral'],
                        )}
                      >
                        <p
                          className="text-xs font-semibold uppercase tracking-wide"
                          dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item.label) }}
                        />
                        <p
                          className="mt-1 whitespace-pre-wrap text-sm leading-6"
                          dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item.text) }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {block.orientation === 'horizontal' ? (
                  <div className="overflow-x-auto pb-1">
                    <div
                      className="grid min-w-[720px] gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(1, block.steps.length)}, minmax(0, 1fr))`,
                      }}
                    >
                      {block.steps.map((step, stepIdx) => (
                        <div
                          key={stepIdx}
                          className="rounded-xl border border-border/70 bg-background/80 px-3 py-3"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {document.language === 'en-US'
                              ? `Step ${stepIdx + 1}`
                              : `步骤 ${stepIdx + 1}`}
                          </p>
                          <p
                            className="mt-1 text-sm font-semibold text-foreground"
                            dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.title) }}
                          />
                          <p
                            className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
                            dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.detail) }}
                          />
                          {step.note ? (
                            <p
                              className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
                              dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.note) }}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 border-l border-border/70 pl-4">
                    {block.steps.map((step, stepIdx) => (
                      <div
                        key={stepIdx}
                        className="relative rounded-xl border border-border/70 bg-background/80 px-4 py-3"
                      >
                        <div className="absolute -left-[1.2rem] top-3 flex size-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                          {stepIdx + 1}
                        </div>
                        <p
                          className="text-sm font-semibold text-foreground"
                          dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.title) }}
                        />
                        <p
                          className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
                          dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.detail) }}
                        />
                        {step.note ? (
                          <p
                            className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
                            dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(step.note) }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {block.summary ? (
                  <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {document.language === 'en-US' ? 'Summary' : '收束'}
                    </p>
                    <p
                      className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground"
                      dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.summary) }}
                    />
                  </div>
                ) : null}
              </div>
            );
          }
          case 'layout_cards': {
            const toneClass = {
              neutral:
                'border-slate-200 bg-slate-50/80 text-slate-900 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-100',
              info: 'border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100',
              warning:
                'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100',
              success:
                'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100',
            } as const;
            const parsedColumns = Number(block.columns);
            const normalizedColumns =
              Number.isFinite(parsedColumns) && parsedColumns > 0 ? parsedColumns : 2;
            const visualColumns = normalizedColumns === 4 ? 2 : normalizedColumns;
            return (
              <div
                key={index}
                className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
              >
                {block.title ? (
                  <p
                    className="text-sm font-semibold text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.title) }}
                  />
                ) : null}
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, visualColumns)}, minmax(0, 1fr))`,
                  }}
                >
                  {block.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className={cn(
                        'rounded-xl border px-3 py-2.5',
                        toneClass[item.tone || 'neutral'],
                      )}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item.title) }}
                      />
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm leading-6"
                        dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(item.text) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          case 'chem_formula':
            return (
              <div key={index} className="space-y-1">
                <p
                  className="text-base text-foreground"
                  dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(block.formula) }}
                />
                {block.caption ? (
                  <p
                    className="text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
              </div>
            );
          case 'chem_equation':
            return (
              <div key={index} className="space-y-1">
                <p
                  className="text-base text-foreground"
                  dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(block.equation) }}
                />
                {block.caption ? (
                  <p
                    className="text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: renderInlineMathHtml(block.caption) }}
                  />
                ) : null}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});
