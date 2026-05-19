'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  InlineText,
  MiniCodeBlock,
  TraceCallStackFrameCard,
  TraceHeapPanel,
  TraceStepNavigator,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CsBlockProps,
  MemoryDiagramBlock,
  MemoryFrame,
  MemoryTraceStep,
  NotebookContentDocument,
  TraceCallStackFrame,
} from './computer-science-blocks.shared';

function memoryVariableBoxValue(variable: MemoryDiagramBlock['stack'][number]) {
  if (variable.ref) return variable.ref;
  return variable.value.replace(/^ref\s+/, '') || 'None';
}

function getMemoryFrames(
  frames: MemoryDiagramBlock['frames'],
  stack: MemoryDiagramBlock['stack'],
  language: NotebookContentDocument['language'],
): MemoryFrame[] {
  if (frames.length) return frames;
  if (!stack.length) return [];
  return [
    {
      name: language === 'en-US' ? '__main__' : '__main__',
      variables: stack,
      active: true,
    },
  ];
}

function getMemoryStepGroups(
  steps: readonly MemoryTraceStep[],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    if (step.line) return `line ${step.line}`;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function MemorySnapshotPanel({
  frames,
  stack,
  heap,
  language,
  renderInlineMathHtml,
  caption,
  actionText,
  actionBadge,
  compact = false,
}: {
  frames?: MemoryDiagramBlock['frames'];
  stack: MemoryDiagramBlock['stack'];
  heap: MemoryDiagramBlock['heap'];
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
  caption?: string;
  actionText?: string;
  actionBadge?: string;
  compact?: boolean;
}) {
  const effectiveFrames = getMemoryFrames(frames ?? [], stack, language);
  const heapIds = new Set(heap.map((object) => object.id));
  const traceFrames: TraceCallStackFrame[] = effectiveFrames.map((frame) => ({
    name: frame.name,
    fields: frame.variables.map((variable) => ({
      name: variable.name,
      value: memoryVariableBoxValue(variable),
    })),
    active: frame.active,
    status: frame.active ? 'running' : 'paused',
  }));

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-xl border-2 border-violet-900/80 bg-[#fffefa] shadow-sm dark:border-violet-200/70 dark:bg-slate-950',
          compact ? 'p-2' : 'p-3',
        )}
      >
        {actionText ? (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between rounded-md border border-violet-200 bg-violet-50/70 px-2 dark:border-violet-900/60 dark:bg-violet-950/20',
              compact ? 'mb-1.5 gap-1.5 py-1' : 'mb-2 gap-2 py-1.5',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100">
                {language === 'en-US' ? 'Current action' : '当前动作'}
              </p>
              <p
                className={cn(
                  'min-w-0 font-medium text-foreground',
                  compact ? 'text-xs leading-4' : 'text-sm leading-5',
                )}
              >
                <InlineText text={actionText} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
            {actionBadge ? (
              <span
                className={cn(
                  'rounded-sm border border-cyan-300 bg-cyan-50 py-0.5 font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
                  compact ? 'px-1.5 text-[10px]' : 'px-2 text-[11px]',
                )}
              >
                <InlineText text={actionBadge} renderInlineMathHtml={renderInlineMathHtml} />
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn(
            'grid',
            compact
              ? 'gap-2 lg:grid-cols-[minmax(185px,0.42fr)_minmax(0,1.58fr)]'
              : 'gap-4 lg:grid-cols-[minmax(230px,0.52fr)_minmax(0,1.48fr)]',
          )}
        >
          <div>
            <div
              className={cn(
                'flex flex-wrap items-center justify-between',
                compact ? 'mb-1 gap-1.5' : 'mb-1.5 gap-2',
              )}
            >
              <p
                className={cn(
                  'font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100',
                  compact ? 'text-[10px]' : 'text-[11px]',
                )}
              >
                {language === 'en-US' ? 'Call stack' : '调用栈'}
              </p>
              <span
                className={cn(
                  'rounded-sm border border-violet-200 bg-violet-50 py-0.5 font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100',
                  compact ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]',
                )}
              >
                {language === 'en-US' ? 'top executes first' : '栈顶先执行'}
              </span>
            </div>
            {traceFrames.length ? (
              <div className={compact ? 'space-y-1' : 'space-y-2'}>
                {traceFrames.map((frame, index) => (
                  <TraceCallStackFrameCard
                    key={`${frame.name}-${index}`}
                    frame={frame}
                    isTop={index === 0}
                    isBottom={index === traceFrames.length - 1}
                    language={language}
                    heapIds={heapIds}
                    compact={compact}
                    renderInlineMathHtml={renderInlineMathHtml}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border-2 border-dashed border-indigo-900/50 px-3 py-4 text-xs text-muted-foreground dark:border-indigo-200/40">
                {language === 'en-US' ? 'No local variables yet' : '还没有局部变量'}
              </p>
            )}
          </div>
          <div>
            <div
              className={cn(
                'flex flex-wrap items-center justify-between',
                compact ? 'mb-1 gap-1.5' : 'mb-1.5 gap-2',
              )}
            >
              <p
                className={cn(
                  'font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100',
                  compact ? 'text-[10px]' : 'text-[11px]',
                )}
              >
                heap
              </p>
              <span
                className={cn(
                  'rounded-sm border border-violet-200 bg-violet-50 py-0.5 font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100',
                  compact ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]',
                )}
              >
                {language === 'en-US' ? 'objects live here' : '对象存放在这里'}
              </span>
            </div>
            {heap.length ? (
              <TraceHeapPanel
                heap={heap}
                language={language}
                compact={compact}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            ) : (
              <p className="rounded-lg border-2 border-dashed border-indigo-900/50 px-3 py-4 text-xs text-muted-foreground dark:border-indigo-200/40">
                {language === 'en-US' ? 'No heap objects yet' : '还没有堆对象'}
              </p>
            )}
          </div>
        </div>
      </div>
      {caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

export function MemoryDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<MemoryDiagramBlock>) {
  const steps = useMemo(() => (Array.isArray(block.steps) ? block.steps : []), [block.steps]);
  const activeLines = Array.isArray(block.activeLines) ? block.activeLines : [];
  const frames = Array.isArray(block.frames) ? block.frames : [];
  const stack = Array.isArray(block.stack) ? block.stack : [];
  const heap = Array.isArray(block.heap) ? block.heap : [];
  const totalSteps = steps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps ? steps[safeStepIndex] : undefined;
  const isTrace = totalSteps > 0;
  const currentLine = currentStep?.line;
  const highlightedLines = currentLine ? [currentLine] : activeLines;
  const stepGroups = useMemo(() => getMemoryStepGroups(steps, language), [steps, language]);

  if (isTrace && currentStep) {
    const canGoBack = safeStepIndex > 0;
    const canGoForward = safeStepIndex < totalSteps - 1;

    return (
      <div className="space-y-2 rounded-lg border border-sky-200/70 bg-sky-50/35 p-2 dark:border-sky-900/50 dark:bg-sky-950/10">
        <div className="flex flex-wrap items-center gap-2">
          <BlockKicker>memory trace</BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={language === 'en-US' ? 'Memory Trace' : '内存追踪'}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceStepNavigator
            current={safeStepIndex}
            total={totalSteps}
            groups={stepGroups}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            language={language}
            compact
            onPrevious={() => setInternalStepIndex((index) => Math.max(0, index - 1))}
            onNext={() =>
              setInternalStepIndex((index) => Math.min(Math.max(totalSteps - 1, 0), index + 1))
            }
            onReset={() => setInternalStepIndex(0)}
          />
        </div>
        {block.code ? (
          <MiniCodeBlock
            code={block.code}
            activeLines={highlightedLines}
            currentLine={currentLine}
            compact
          />
        ) : null}
        <MemorySnapshotPanel
          frames={currentStep.frames}
          stack={currentStep.stack}
          heap={currentStep.heap}
          language={language}
          renderInlineMathHtml={renderInlineMathHtml}
          actionText={[currentStep.title, currentStep.explanation].filter(Boolean).join('：')}
          actionBadge={currentStep.line ? `line ${currentStep.line}` : undefined}
          caption={safeStepIndex === totalSteps - 1 ? block.caption : undefined}
          compact
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-sky-200/70 bg-sky-50/35 p-4 dark:border-sky-900/50 dark:bg-sky-950/10">
      <div className="space-y-1">
        <BlockKicker>memory</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={language === 'en-US' ? 'Memory Model' : '内存模型'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      <MemorySnapshotPanel
        frames={frames}
        stack={stack}
        heap={heap}
        language={language}
        renderInlineMathHtml={renderInlineMathHtml}
        caption={block.caption}
      />
    </div>
  );
}
