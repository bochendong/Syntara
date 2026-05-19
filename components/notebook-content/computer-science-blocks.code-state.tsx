'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  InlineText,
  MiniCodeBlock,
  TraceCallStackSnapshotPanel,
  TraceCallStackFrameCard,
  TraceCurrentStepPanel,
  TraceGenericSnapshotPanel,
  TraceHeapPanel,
  TraceLoopWorksheetPanel,
  TraceSnapshotPanel,
  TraceStepNavigator,
  buildTraceStateMap,
  getTraceStepGroups,
  parseTraceCallStackState,
  parseTraceGridInput,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CallStackBlock,
  CodeTraceBlock,
  CsBlockProps,
  StateTableBlock,
  TraceCallStackFrame,
} from './computer-science-blocks.shared';

export function CodeTraceBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<CodeTraceBlock>) {
  const totalSteps = block.steps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = block.steps[safeStepIndex];
  const currentLine = currentStep?.line;
  const inputs = useMemo(() => block.inputs ?? [], [block.inputs]);
  const traceGrid = useMemo(() => parseTraceGridInput(inputs), [inputs]);
  const currentState = useMemo(
    () => buildTraceStateMap(block.steps, safeStepIndex),
    [block.steps, safeStepIndex],
  );
  const previousState = useMemo(
    () => (safeStepIndex > 0 ? buildTraceStateMap(block.steps, safeStepIndex - 1) : {}),
    [block.steps, safeStepIndex],
  );
  const callStackFrames = useMemo(() => parseTraceCallStackState(currentState), [currentState]);
  const stepGroups = useMemo(
    () => getTraceStepGroups(block.steps, language),
    [block.steps, language],
  );
  const highlightedLines = useMemo(
    () => (currentLine ? [currentLine] : block.activeLines),
    [block.activeLines, currentLine],
  );
  const canGoBack = safeStepIndex > 0;
  const canGoForward = safeStepIndex < totalSteps - 1;
  const snapshotPanel = callStackFrames.length ? (
    <TraceCallStackSnapshotPanel
      state={currentState}
      previousState={previousState}
      language={language}
      renderInlineMathHtml={renderInlineMathHtml}
    />
  ) : traceGrid ? (
    <TraceSnapshotPanel
      grid={traceGrid}
      state={currentState}
      previousState={previousState}
      inputs={inputs}
      language={language}
      renderInlineMathHtml={renderInlineMathHtml}
      compact
    />
  ) : (
    <TraceGenericSnapshotPanel
      state={currentState}
      previousState={previousState}
      language={language}
      renderInlineMathHtml={renderInlineMathHtml}
    />
  );

  return (
    <div className="space-y-1.5 rounded-lg border border-cyan-200/70 bg-cyan-50/35 p-2 dark:border-cyan-900/50 dark:bg-cyan-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <BlockKicker>trace</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={language === 'en-US' ? 'Code Trace' : '代码追踪'}
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
      {traceGrid && !callStackFrames.length ? (
        <div className="grid gap-2">
          <div>
            <MiniCodeBlock
              code={block.code}
              activeLines={highlightedLines}
              currentLine={currentLine}
              compact
            />
          </div>
          <TraceLoopWorksheetPanel
            step={currentStep}
            grid={traceGrid}
            state={currentState}
            previousState={previousState}
            inputs={inputs}
            language={language}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          <div>
            <MiniCodeBlock
              code={block.code}
              activeLines={highlightedLines}
              currentLine={currentLine}
              compact
            />
          </div>
          <TraceCurrentStepPanel
            step={currentStep}
            language={language}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          {snapshotPanel}
        </div>
      )}
    </div>
  );
}

export function StateTableBlock({
  block,
  language,
  renderInlineMathHtml,
}: CsBlockProps<StateTableBlock>) {
  return (
    <div className="space-y-2 overflow-x-auto">
      <BlockTitle
        title={block.title}
        fallback={language === 'en-US' ? 'State Table' : '状态表'}
        renderInlineMathHtml={renderInlineMathHtml}
      />
      <table className="w-full min-w-[360px] border-collapse overflow-hidden rounded-lg text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-900 text-white">
            {block.columns.map((column, index) => (
              <th key={`${column}-${index}`} className="px-3 py-2 font-semibold">
                <InlineText text={column} renderInlineMathHtml={renderInlineMathHtml} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => {
            const isActive = block.activeRow === rowIndex;
            return (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-border/60 bg-background',
                  isActive && 'bg-cyan-50 text-cyan-950 dark:bg-cyan-950/30 dark:text-cyan-50',
                )}
              >
                {block.columns.map((_, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top font-mono">
                    <InlineText
                      text={row[cellIndex] || ''}
                      renderInlineMathHtml={renderInlineMathHtml}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

export function CallStackBlock({
  block,
  language,
  renderInlineMathHtml,
}: CsBlockProps<CallStackBlock>) {
  const heap = block.heap ?? [];
  const heapIds = new Set(heap.map((object) => object.id));
  const frames: TraceCallStackFrame[] = block.frames.map((frame) => ({
    name: frame.name,
    fields: [
      ...frame.args,
      ...frame.locals,
      ...(frame.returnValue ? [{ name: 'return', value: frame.returnValue }] : []),
    ],
    active: frame.active,
    status: frame.returnValue ? 'returning' : frame.active ? 'running' : 'paused',
  }));

  return (
    <div className="space-y-3 rounded-lg border border-violet-200/70 bg-violet-50/35 p-4 dark:border-violet-900/50 dark:bg-violet-950/10">
      <div className="space-y-1">
        <BlockKicker>call stack</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={language === 'en-US' ? 'Call Stack' : '调用栈'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      <div className="rounded-xl border-2 border-violet-900/70 bg-[#fffefa] p-3 dark:border-violet-200/70 dark:bg-slate-950">
        <div
          className={cn(
            'grid gap-4',
            heap.length && 'lg:grid-cols-[minmax(230px,0.52fr)_minmax(0,1.48fr)]',
          )}
        >
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-900 dark:text-violet-100">
                {language === 'en-US' ? 'top to bottom' : '从栈顶到栈底'}
              </p>
              <span className="rounded-sm border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
                {language === 'en-US' ? 'paused callers stay below' : '调用者在下方暂停'}
              </span>
            </div>
            <div className="space-y-2">
              {frames.map((frame, index) => (
                <TraceCallStackFrameCard
                  key={`${frame.name}-${index}`}
                  frame={frame}
                  isTop={index === 0}
                  isBottom={index === frames.length - 1}
                  language={language}
                  heapIds={heapIds}
                  renderInlineMathHtml={renderInlineMathHtml}
                />
              ))}
            </div>
          </div>
          {heap.length ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-900 dark:text-violet-100">
                  heap
                </p>
                <span className="rounded-sm border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
                  {language === 'en-US' ? 'list objects and int objects' : 'list 对象和 int 对象'}
                </span>
              </div>
              <TraceHeapPanel
                heap={heap}
                language={language}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </div>
          ) : null}
        </div>
      </div>
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}
