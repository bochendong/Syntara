'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  EMPTY_LINEAR_STEPS,
  InlineText,
  TraceStepNavigator,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CsBlockProps,
  DictionaryDiagramBlock,
  InvariantPanelBlock,
  LinearStructureBlock,
  LinearStructureItem,
  NotebookContentDocument,
} from './computer-science-blocks.shared';

export function InvariantPanelBlock({
  block,
  language,
  renderInlineMathHtml,
}: CsBlockProps<InvariantPanelBlock>) {
  const statusCopy = {
    holds: language === 'en-US' ? 'holds' : '成立',
    violated: language === 'en-US' ? 'violated' : '被破坏',
    unknown: language === 'en-US' ? 'check' : '待检查',
  } as const;

  return (
    <div className="space-y-3 rounded-lg border border-lime-200/80 bg-lime-50/35 p-4 dark:border-lime-900/60 dark:bg-lime-950/10">
      <div className="space-y-1">
        <BlockKicker>invariant</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={language === 'en-US' ? 'Invariant Check' : '不变量检查'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      <div className="rounded-lg border border-lime-200 bg-background/90 px-3 py-2 dark:border-lime-900/50">
        {block.structure ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <InlineText text={block.structure} renderInlineMathHtml={renderInlineMathHtml} />
          </p>
        ) : null}
        <p className="mt-1 text-sm font-medium leading-6 text-foreground">
          <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {block.checks.map((check, index) => (
          <div
            key={`${check.label}-${index}`}
            className={cn(
              'rounded-lg border bg-background/90 px-3 py-2',
              check.status === 'holds' && 'border-emerald-200 dark:border-emerald-900/60',
              check.status === 'violated' && 'border-rose-200 dark:border-rose-900/60',
              check.status === 'unknown' && 'border-border/70',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                <InlineText text={check.label} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                  check.status === 'holds' &&
                    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
                  check.status === 'violated' &&
                    'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-100',
                  check.status === 'unknown' && 'bg-muted text-muted-foreground',
                )}
              >
                {statusCopy[check.status]}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              <InlineText text={check.text} renderInlineMathHtml={renderInlineMathHtml} />
            </p>
            {check.reason ? (
              <p className="mt-2 rounded-md bg-muted/60 px-2 py-1 text-xs leading-5 text-muted-foreground">
                <InlineText text={check.reason} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

export function DictionaryDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
}: CsBlockProps<DictionaryDiagramBlock>) {
  const activeKey = block.lookupKey || block.entries.find((entry) => entry.active)?.key;
  const activeEntry = block.entries.find((entry) => entry.key === activeKey || entry.active);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200/80 bg-indigo-50/35 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <BlockKicker>dict</BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={language === 'en-US' ? 'Dictionary Diagram' : '字典结构'}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          {block.operation ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <InlineText text={block.operation} renderInlineMathHtml={renderInlineMathHtml} />
            </p>
          ) : null}
        </div>
        {activeKey ? (
          <div className="rounded-lg border border-indigo-200 bg-background/85 px-3 py-2 text-xs shadow-sm dark:border-indigo-900/60 dark:bg-background/70">
            <p className="font-semibold text-indigo-800 dark:text-indigo-100">
              {language === 'en-US' ? 'Lookup key' : '当前 key'}
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              <InlineText text={activeKey} renderInlineMathHtml={renderInlineMathHtml} />
            </p>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.entries.map((entry) => {
          const isActive = entry === activeEntry || entry.key === activeKey || entry.active;
          return (
            <div
              key={entry.key}
              className={cn(
                'rounded-lg border bg-background/85 px-3 py-2 shadow-sm transition-colors',
                isActive
                  ? 'border-indigo-400 bg-indigo-100/70 dark:border-indigo-600 dark:bg-indigo-950/35'
                  : entry.changed
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/25'
                    : 'border-border/70',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-md bg-slate-950 px-2 py-1 font-mono text-xs text-white">
                  <InlineText text={entry.key} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-xs text-foreground">
                  <InlineText text={entry.value} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
              </div>
              {entry.note ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  <InlineText text={entry.note} renderInlineMathHtml={renderInlineMathHtml} />
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {block.result || block.caption ? (
        <div className="grid gap-2 text-xs sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {block.result ? (
            <div className="rounded-lg border border-indigo-200 bg-background/80 px-3 py-2 dark:border-indigo-900/60">
              <p className="font-semibold text-indigo-800 dark:text-indigo-100">
                {language === 'en-US' ? 'Result' : '查找结果'}
              </p>
              <p className="mt-1 font-mono text-sm text-foreground">
                <InlineText text={block.result} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
          ) : null}
          {block.caption ? (
            <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 leading-5 text-muted-foreground">
              <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getLinearStepGroups(
  steps: readonly LinearStructureBlock['steps'][number][],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function LinearItemCard({
  item,
  isFocused,
  renderInlineMathHtml,
}: {
  item: LinearStructureItem;
  isFocused: boolean;
  renderInlineMathHtml: (text: string) => string;
}) {
  return (
    <div
      className={cn(
        'min-w-20 rounded-lg border px-3 py-2 text-center font-mono text-sm font-semibold shadow-sm transition-colors',
        isFocused || item.active
          ? 'border-sky-400 bg-sky-100 text-sky-950 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-50'
          : item.changed
            ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
            : item.muted
              ? 'border-border/50 bg-muted/30 text-muted-foreground'
              : 'border-border/70 bg-background text-foreground',
      )}
    >
      <InlineText text={item.label} renderInlineMathHtml={renderInlineMathHtml} />
      {item.note ? (
        <p className="mt-1 font-sans text-[11px] font-normal leading-4 text-muted-foreground">
          <InlineText text={item.note} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

export function LinearStructureBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<LinearStructureBlock>) {
  const isStack = block.kind === 'stack';
  const steps = block.steps ?? EMPTY_LINEAR_STEPS;
  const totalSteps = steps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? steps[safeStepIndex] : undefined;
  const items = currentStep?.items.length ? currentStep.items : block.items;
  const focus = new Set(
    currentStep?.focus.length
      ? currentStep.focus
      : items.filter((item) => item.active).map((item) => item.id),
  );
  const stepGroups = useMemo(() => getLinearStepGroups(steps, language), [steps, language]);
  const operation = currentStep?.operation || block.operation;
  const shellClass = isStack
    ? 'border-sky-200/80 bg-sky-50/35 dark:border-sky-900/60 dark:bg-sky-950/10'
    : 'border-rose-200/80 bg-rose-50/35 dark:border-rose-900/60 dark:bg-rose-950/10';
  const labelClass = isStack
    ? 'text-sky-800 dark:text-sky-100'
    : 'text-rose-800 dark:text-rose-100';
  const fallback = isStack
    ? language === 'en-US'
      ? 'Stack'
      : '栈'
    : language === 'en-US'
      ? 'Queue'
      : '队列';
  const primaryLabel = isStack
    ? language === 'en-US'
      ? 'Top'
      : '栈顶'
    : language === 'en-US'
      ? 'Front'
      : '队首';
  const secondaryLabel = isStack
    ? language === 'en-US'
      ? 'Bottom'
      : '栈底'
    : language === 'en-US'
      ? 'Back'
      : '队尾';
  const emptyLabel = isStack
    ? language === 'en-US'
      ? 'empty stack'
      : '空栈'
    : language === 'en-US'
      ? 'empty queue'
      : '空队列';

  return (
    <div className={cn('space-y-2 rounded-lg border p-2', shellClass)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 space-y-1">
          <BlockKicker>{steps.length ? `${block.kind} trace` : block.kind}</BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={fallback}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          {operation ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <InlineText text={operation} renderInlineMathHtml={renderInlineMathHtml} />
            </p>
          ) : null}
        </div>
        {steps.length ? (
          <TraceStepNavigator
            current={safeStepIndex}
            total={totalSteps}
            groups={stepGroups}
            canGoBack={safeStepIndex > 0}
            canGoForward={safeStepIndex < totalSteps - 1}
            language={language}
            compact
            onPrevious={() => setInternalStepIndex((index) => Math.max(0, index - 1))}
            onNext={() =>
              setInternalStepIndex((index) => Math.min(Math.max(totalSteps - 1, 0), index + 1))
            }
            onReset={() => setInternalStepIndex(0)}
          />
        ) : null}
        <div className="ml-auto rounded-lg border border-border/70 bg-background/80 px-2 py-1 text-xs shadow-sm">
          <p className={cn('font-semibold', labelClass)}>
            {isStack
              ? language === 'en-US'
                ? 'LIFO rule'
                : 'LIFO 规则'
              : language === 'en-US'
                ? 'FIFO rule'
                : 'FIFO 规则'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {isStack
              ? language === 'en-US'
                ? 'Push and pop use the same end.'
                : 'push 和 pop 都发生在栈顶。'
              : language === 'en-US'
                ? 'Enqueue at back, dequeue at front.'
                : 'enqueue 从队尾进入，dequeue 从队首离开。'}
          </p>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(220px,0.52fr)_minmax(0,1.48fr)]">
        <div className="rounded-lg border border-border/70 bg-background/80 p-2 text-xs leading-5">
          <p className={cn('text-[10px] font-semibold uppercase tracking-[0.1em]', labelClass)}>
            {language === 'en-US' ? 'Current step' : '当前步骤'}
          </p>
          <p className="mt-0.5 font-semibold text-foreground">
            <InlineText
              text={currentStep?.title || operation || fallback}
              renderInlineMathHtml={renderInlineMathHtml}
            />
          </p>
          {currentStep?.explanation ? (
            <p className="mt-1 text-muted-foreground">
              <InlineText
                text={currentStep.explanation}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          ) : null}
          {currentStep?.result ? (
            <p className="mt-1 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-xs text-foreground">
              {currentStep.result}
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/80 p-2.5">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          ) : isStack ? (
            <div className="mx-auto flex max-w-72 flex-col items-stretch gap-1">
              <p
                className={cn(
                  'text-center text-[11px] font-semibold uppercase tracking-[0.12em]',
                  labelClass,
                )}
              >
                {primaryLabel}
              </p>
              {[...items].reverse().map((item) => (
                <LinearItemCard
                  key={item.id}
                  item={item}
                  isFocused={focus.has(item.id)}
                  renderInlineMathHtml={renderInlineMathHtml}
                />
              ))}
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {secondaryLabel}
              </p>
            </div>
          ) : (
            <div className="flex min-w-max items-center gap-2">
              <span
                className={cn('text-[11px] font-semibold uppercase tracking-[0.12em]', labelClass)}
              >
                {primaryLabel}
              </span>
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2">
                  <LinearItemCard
                    item={item}
                    isFocused={focus.has(item.id)}
                    renderInlineMathHtml={renderInlineMathHtml}
                  />
                  {index < items.length - 1 ? (
                    <span className="text-muted-foreground">→</span>
                  ) : null}
                </div>
              ))}
              <span
                className={cn('text-[11px] font-semibold uppercase tracking-[0.12em]', labelClass)}
              >
                {secondaryLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {block.caption ? (
        <p className="text-xs leading-5 text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}
