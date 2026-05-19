'use client';

import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { cn } from '@/lib/utils';
export type { NotebookContentDocument };

export type NotebookBlock = NotebookContentDocument['blocks'][number];
export type CodeTraceBlock = Extract<NotebookBlock, { type: 'code_trace' }>;
export type StateTableBlock = Extract<NotebookBlock, { type: 'state_table' }>;
export type CallStackBlock = Extract<NotebookBlock, { type: 'call_stack' }>;
export type MemoryDiagramBlock = Extract<NotebookBlock, { type: 'memory_diagram' }>;
export type PointerDiagramBlock = Extract<NotebookBlock, { type: 'pointer_diagram' }>;
export type TreeDiagramBlock = Extract<NotebookBlock, { type: 'tree_diagram' }>;
export type GraphTraceBlock = Extract<NotebookBlock, { type: 'graph_trace' }>;
export type InvariantPanelBlock = Extract<NotebookBlock, { type: 'invariant_panel' }>;
export type DictionaryDiagramBlock = Extract<NotebookBlock, { type: 'dictionary_diagram' }>;
export type LinearStructureBlock = Extract<NotebookBlock, { type: 'linear_structure' }>;
export type KeyValue = { name: string; value: string };
export type CodeTraceStep = CodeTraceBlock['steps'][number];
export type MemoryFrame = MemoryDiagramBlock['frames'][number];
export type MemoryTraceStep = MemoryDiagramBlock['steps'][number];
export type PointerDiagramNode = PointerDiagramBlock['nodes'][number];
export type PointerDiagramPointer = PointerDiagramBlock['pointers'][number];
export type PointerDiagramLink = PointerDiagramBlock['links'][number];
export type TreeDiagramNode = TreeDiagramBlock['nodes'][number];
export type GraphTraceNode = GraphTraceBlock['nodes'][number];
export type GraphTraceEdge = GraphTraceBlock['edges'][number];
export type GraphTraceStep = GraphTraceBlock['steps'][number];
export type LinearStructureItem = LinearStructureBlock['items'][number];
export type TraceStateMap = Record<string, string>;
export type TraceGrid = {
  name: string;
  rows: string[][];
};
export type TraceHeapObject = MemoryDiagramBlock['heap'][number];
export type TraceCallStackFrame = {
  name: string;
  fields: KeyValue[];
  active: boolean;
  status: 'running' | 'paused' | 'returning' | 'complete';
};
export type TreeLayoutNode = {
  id: string;
  node: TreeDiagramNode;
  x: number;
  y: number;
  width: number;
};
export type TreeLayoutEdge = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
  active: boolean;
};
export type GraphLayoutNode = GraphTraceNode & {
  x: number;
  y: number;
};

export const EMPTY_POINTER_STEPS: PointerDiagramBlock['steps'] = [];
export const EMPTY_TREE_STEPS: TreeDiagramBlock['steps'] = [];
export const EMPTY_GRAPH_STEPS: GraphTraceBlock['steps'] = [];
export const EMPTY_LINEAR_STEPS: LinearStructureBlock['steps'] = [];
export const TREE_NODE_HEIGHT = 40;
export const TREE_LEVEL_GAP = 82;
export const TREE_SIBLING_GAP = 46;
export const TREE_CANVAS_PADDING_X = 36;
export const TREE_CANVAS_PADDING_Y = 26;
export const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'break',
  'class',
  'continue',
  'def',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
]);
export const PYTHON_CONSTANTS = new Set(['False', 'None', 'True']);
export const PYTHON_BUILTINS = new Set([
  'Any',
  'bool',
  'dict',
  'enumerate',
  'float',
  'int',
  'len',
  'list',
  'range',
  'set',
  'str',
  'tuple',
]);

export type CsBlockProps<TBlock extends NotebookBlock> = {
  block: TBlock;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
  activeStepIndex?: number;
};

export function clampStepIndex(index: number, totalSteps: number) {
  return Math.max(0, Math.min(Math.max(totalSteps - 1, 0), Math.floor(index)));
}

export function usePlayableStepIndex(activeStepIndex: number | undefined, totalSteps: number) {
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  return {
    safeStepIndex:
      typeof activeStepIndex === 'number'
        ? clampStepIndex(activeStepIndex, totalSteps)
        : clampStepIndex(internalStepIndex, totalSteps),
    setInternalStepIndex,
  };
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderInlineMathAndCodeHtml(
  text: string,
  renderInlineMathHtml: (text: string) => string,
) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
        return `<code class="rounded-md border border-slate-300/80 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return renderInlineMathHtml(part);
    })
    .join('');
}

export function InlineText({
  text,
  renderInlineMathHtml,
  className,
}: {
  text: string;
  renderInlineMathHtml: (text: string) => string;
  className?: string;
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInlineMathAndCodeHtml(text, renderInlineMathHtml) }}
    />
  );
}

export function tokenClass(token: string) {
  if (token.startsWith('#')) return 'text-slate-500 italic';
  if (token.startsWith("'") || token.startsWith('"')) return 'text-emerald-300';
  if (/^\d/.test(token)) return 'text-amber-300';
  if (PYTHON_KEYWORDS.has(token)) return 'text-fuchsia-300 font-semibold';
  if (PYTHON_CONSTANTS.has(token)) return 'text-violet-300 font-semibold';
  if (PYTHON_BUILTINS.has(token)) return 'text-cyan-300';
  if (/^(->|==|!=|<=|>=|\+=|-=|=|\+|-|\*|\/|<|>)$/.test(token)) return 'text-rose-300';
  if (/^[()[\]{}.,:;]$/.test(token)) return 'text-slate-400';
  return 'text-slate-100';
}

export function renderCodeTokens(line: string) {
  const tokens = line.match(
    /#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|->|==|!=|<=|>=|\+=|-=|[()[\]{}.,:;=+\-*/<>]|\s+|./g,
  );

  return (tokens || [line]).map((token, index) =>
    /^\s+$/.test(token) ? (
      token
    ) : (
      <span key={`${token}-${index}`} className={tokenClass(token)}>
        {token}
      </span>
    ),
  );
}

export function BlockTitle({
  title,
  fallback,
  renderInlineMathHtml,
}: {
  title?: string;
  fallback: string;
  renderInlineMathHtml: (text: string) => string;
}) {
  return (
    <p className="text-sm font-semibold text-foreground">
      <InlineText text={title || fallback} renderInlineMathHtml={renderInlineMathHtml} />
    </p>
  );
}

export function KeyValueChips({
  items,
  renderInlineMathHtml,
  previousValues,
  showChanges = false,
}: {
  items: KeyValue[];
  renderInlineMathHtml: (text: string) => string;
  previousValues?: TraceStateMap;
  showChanges?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => {
        const previous = previousValues?.[item.name];
        const changed = showChanges && previous !== undefined && previous !== item.value;
        return (
          <span
            key={`${item.name}-${index}`}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs text-foreground',
              changed
                ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-border/70 bg-background/80',
            )}
          >
            <span
              className={cn(
                'text-muted-foreground',
                changed && 'text-amber-700 dark:text-amber-200',
              )}
            >
              {item.name}
            </span>
            <span>=</span>
            {changed ? (
              <>
                <span className="text-muted-foreground line-through">
                  <InlineText text={previous} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
                <span className="text-amber-700 dark:text-amber-200">→</span>
              </>
            ) : null}
            <InlineText text={item.value} renderInlineMathHtml={renderInlineMathHtml} />
          </span>
        );
      })}
    </div>
  );
}

export function BlockKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
      {children}
    </span>
  );
}

export function MiniCodeBlock({
  code,
  activeLines,
  currentLine,
  compact = false,
}: {
  code: string;
  activeLines: readonly number[];
  currentLine?: number;
  compact?: boolean;
}) {
  const active = new Set(activeLines);
  return (
    <pre
      className={cn(
        'h-fit overflow-x-hidden overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 text-slate-100',
        compact
          ? 'max-h-[190px] py-1.5 text-[10px] leading-[13px]'
          : 'max-h-[440px] py-3 text-xs leading-5',
      )}
    >
      {code
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line, index) => {
          const lineNumber = index + 1;
          const isActive = active.has(lineNumber);
          const isCurrent = currentLine === lineNumber;
          return (
            <div
              key={lineNumber}
              className={cn(
                'grid min-w-0 items-start transition-colors',
                compact
                  ? 'grid-cols-[1.75rem_minmax(0,1fr)] gap-1 px-2'
                  : 'grid-cols-[1.25rem_2.5rem_minmax(0,1fr)] gap-2 px-3',
                isActive && 'bg-cyan-400/10 text-white',
                isCurrent &&
                  'bg-cyan-500/40 text-white shadow-[inset_5px_0_0_rgba(34,211,238,1),inset_0_0_0_1px_rgba(125,211,252,0.28)]',
              )}
            >
              <span className={cn('select-none text-center text-cyan-200', compact && 'hidden')}>
                {isCurrent ? '▶' : ' '}
              </span>
              <span
                className={cn(
                  'select-none text-right text-slate-500',
                  isActive && 'text-cyan-200',
                  isCurrent &&
                    'rounded-sm bg-cyan-200 px-1 font-bold text-slate-950 shadow-sm dark:bg-cyan-300',
                )}
              >
                {lineNumber}
              </span>
              <code className="min-w-0 whitespace-pre-wrap break-words font-mono [overflow-wrap:anywhere]">
                {line ? renderCodeTokens(line) : ' '}
              </code>
            </div>
          );
        })}
    </pre>
  );
}

export function TraceStepNavigator({
  current,
  total,
  groups = [],
  canGoBack,
  canGoForward,
  language,
  compact = false,
  onPrevious,
  onNext,
  onReset,
}: {
  current: number;
  total: number;
  groups?: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  language: NotebookContentDocument['language'];
  compact?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const stepLabel =
    language === 'en-US' ? `Step ${current + 1} / ${total}` : `步骤 ${current + 1} / ${total}`;
  const currentGroup = groups[current] || '';

  if (compact) {
    return (
      <div className="ml-auto flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-cyan-200/70 bg-background/85 px-2 py-1 shadow-sm dark:border-cyan-900/50 dark:bg-background/60 sm:max-w-[560px]">
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="leading-none">
            <p className="text-[11px] font-semibold text-cyan-800 dark:text-cyan-100">
              {stepLabel}
            </p>
            {currentGroup ? (
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{currentGroup}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onReset}
            disabled={!canGoBack}
            aria-label={language === 'en-US' ? 'Reset trace' : '重置追踪'}
            title={language === 'en-US' ? 'Reset trace' : '重置追踪'}
          >
            <RotateCcw className="size-3" />
          </Button>
        </div>
        <div className="hidden min-w-0 flex-1 items-center gap-1 sm:flex">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              title={groups[index] || undefined}
              className={cn(
                'h-1.5 min-w-2 flex-1 rounded-full transition-all',
                index === current
                  ? 'bg-cyan-500'
                  : index < current
                    ? 'bg-cyan-300'
                    : 'bg-slate-200 dark:bg-slate-800',
              )}
            />
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={onPrevious}
            disabled={!canGoBack}
            aria-label={language === 'en-US' ? 'Previous step' : '上一步'}
            title={language === 'en-US' ? 'Previous step' : '上一步'}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon-xs"
            onClick={onNext}
            disabled={!canGoForward}
            aria-label={language === 'en-US' ? 'Next step' : '下一步'}
            title={language === 'en-US' ? 'Next step' : '下一步'}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cyan-200/70 bg-background/85 px-3 py-2.5 shadow-sm dark:border-cyan-900/50 dark:bg-background/60 sm:flex-row sm:items-center">
      <div className="flex items-center justify-between gap-2 sm:min-w-[7.5rem]">
        <div>
          <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-100">{stepLabel}</p>
          {currentGroup ? (
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{currentGroup}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onReset}
          disabled={!canGoBack}
          aria-label={language === 'en-US' ? 'Reset trace' : '重置追踪'}
          title={language === 'en-US' ? 'Reset trace' : '重置追踪'}
        >
          <RotateCcw className="size-3" />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            title={groups[index] || undefined}
            className={cn(
              'h-2 min-w-5 flex-1 rounded-full transition-all',
              index === current
                ? 'bg-cyan-500'
                : index < current
                  ? 'bg-cyan-300'
                  : 'bg-slate-200 dark:bg-slate-800',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!canGoBack}
          aria-label={language === 'en-US' ? 'Previous step' : '上一步'}
          title={language === 'en-US' ? 'Previous step' : '上一步'}
        >
          <ChevronLeft className="size-4" />
          <span>{language === 'en-US' ? 'Previous' : '上一步'}</span>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onNext}
          disabled={!canGoForward}
          aria-label={language === 'en-US' ? 'Next step' : '下一步'}
          title={language === 'en-US' ? 'Next step' : '下一步'}
        >
          <span>{language === 'en-US' ? 'Next' : '下一步'}</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function parseTraceNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildTraceStateMap(steps: CodeTraceStep[], endIndex: number): TraceStateMap {
  const state: TraceStateMap = {};
  for (let index = 0; index <= endIndex; index += 1) {
    const stepState = steps[index]?.state ?? [];
    const names = new Set(stepState.map((item) => item.name));
    if (names.has('return')) {
      delete state.row_index;
      delete state.col_index;
      delete state.value;
      delete state.row;
    } else if (names.has('row_index') && !names.has('col_index')) {
      delete state.col_index;
      delete state.value;
    }
    for (const item of stepState) {
      state[item.name] = item.value;
    }
  }
  return state;
}

export function parseTraceGridInput(inputs: KeyValue[]): TraceGrid | null {
  const candidate = inputs.find((input) => input.value.trim().startsWith('[['));
  if (!candidate) return null;
  const normalized = candidate.value.trim().replace(/'/g, '"');
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((row) => Array.isArray(row))) return null;
    const rows = parsed.map((row) => (row as unknown[]).map((cell) => String(cell)));
    return rows.length ? { name: candidate.name, rows } : null;
  } catch {
    return null;
  }
}

export function stripTraceLiteralQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function traceValuesEqual(left: string | undefined, right: string | undefined) {
  if (left === undefined || right === undefined) return false;
  return stripTraceLiteralQuotes(left) === stripTraceLiteralQuotes(right);
}

export function getTraceInputValue(inputs: KeyValue[], name: string) {
  return inputs.find((input) => input.name === name)?.value;
}

export function getTraceTargetValue(inputs: KeyValue[], state: TraceStateMap) {
  return state.target ?? getTraceInputValue(inputs, 'target');
}

export function getTraceStateItems(state: TraceStateMap): KeyValue[] {
  return Object.entries(state).map(([name, value]) => ({ name, value }));
}

export function getTraceStepGroups(
  steps: CodeTraceStep[],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    const state = buildTraceStateMap(steps, index);
    if (state.call_stack || state.stack) {
      return (
        state.phase ||
        state.event ||
        (state.return_value !== undefined
          ? language === 'en-US'
            ? 'return'
            : '返回'
          : language === 'en-US'
            ? 'call'
            : '调用')
      );
    }
    const row = state.row_index;
    if (step.state.some((item) => item.name === 'return')) {
      return language === 'en-US' ? 'return' : '返回';
    }
    if (row !== undefined) {
      return language === 'en-US' ? `row ${row}` : `第 ${row} 行`;
    }
    return language === 'en-US' ? 'setup' : '初始化';
  });
}

export function splitTraceFields(raw: string): KeyValue[] {
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return { name: part, value: '' };
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    });
}

export function parseTraceStackFrame(
  raw: string,
  index: number,
  total: number,
): TraceCallStackFrame {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([^()]+)(?:\((.*)\))?$/);
  const name = (match?.[1] || trimmed).trim();
  const fields = splitTraceFields(match?.[2] || '');
  const lowerFields = fields.map((field) => `${field.name} ${field.value}`.toLowerCase()).join(' ');
  const hasReturn = /\breturn(?:s|ed|ing)?\b/.test(lowerFields);
  const hasResolvedResult = fields.some(
    (field) =>
      /^(result|answer)$/i.test(field.name) &&
      field.value.trim() !== '?' &&
      !field.value.toLowerCase().includes('waiting'),
  );
  const hasPause = /\b(wait|waiting|pending|suspend|rest)\b/.test(lowerFields);
  const active = index === total - 1 && !(name === '__main__' && total > 1);
  const status: TraceCallStackFrame['status'] = hasReturn
    ? 'returning'
    : hasResolvedResult
      ? 'complete'
      : active
        ? 'running'
        : hasPause
          ? 'paused'
          : index === 0
            ? 'paused'
            : 'paused';

  return { name, fields, active, status };
}

export function parseTraceCallStackState(state: TraceStateMap): TraceCallStackFrame[] {
  const rawStack = state.call_stack ?? state.stack;
  if (!rawStack) return [];
  const frames = rawStack
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  return frames.map((frame, index) => parseTraceStackFrame(frame, index, frames.length));
}

export function parseTraceHeapFields(raw: string): KeyValue[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const separator = part.includes('=') ? part.indexOf('=') : part.indexOf(':');
      if (separator < 0) return { name: String(index), value: part };
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    });
}

export function parseTraceHeapObject(raw: string): TraceHeapObject | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^([^:\s]+)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[(.*)\]|=\s*(.*))?$/,
  );
  if (!match) return null;
  const [, id, label, listFields, primitiveValue] = match;

  return {
    id,
    label,
    fields:
      listFields !== undefined
        ? parseTraceHeapFields(listFields)
        : primitiveValue !== undefined
          ? [{ name: 'value', value: primitiveValue.trim() }]
          : [],
    active: false,
  };
}

export function parseTraceHeapState(
  state: TraceStateMap,
  frames: TraceCallStackFrame[],
): TraceHeapObject[] {
  const rawHeap = state.heap;
  if (!rawHeap) return [];
  const topFrame = frames[frames.length - 1];
  const activeRefs = new Set(
    topFrame?.fields
      .map((field) => field.value.trim())
      .filter((value) => /^id[A-Za-z0-9_:-]+$/.test(value)) ?? [],
  );

  return rawHeap
    .split('|')
    .map(parseTraceHeapObject)
    .filter((object): object is TraceHeapObject => Boolean(object))
    .map((object) => ({ ...object, active: activeRefs.has(object.id) }));
}

export function getGenericTraceStateItems(state: TraceStateMap): KeyValue[] {
  const hidden = new Set(['call_stack', 'stack', 'heap', 'event', 'phase', 'return_value']);
  return Object.entries(state)
    .filter(([name]) => !hidden.has(name))
    .map(([name, value]) => ({ name, value }));
}

export function TraceGridPanel({
  grid,
  state,
  language,
  targetValue,
}: {
  grid: TraceGrid | null;
  state: TraceStateMap;
  language: NotebookContentDocument['language'];
  targetValue?: string;
}) {
  if (!grid) return null;
  const activeRow = parseTraceNumber(state.row_index);
  const activeCol = parseTraceNumber(state.col_index);
  const maxColumnCount = Math.max(...grid.rows.map((row) => row.length), 1);

  return (
    <div className="rounded-lg border-2 border-indigo-950/80 bg-white/90 p-3 dark:border-indigo-200/70 dark:bg-slate-950/85">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-950 dark:text-indigo-100">
          {language === 'en-US' ? 'Grid' : '二维输入'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm border border-indigo-950/40 bg-[#fffefa] px-2 py-0.5 font-mono text-[11px] text-indigo-950 dark:border-indigo-200/40 dark:bg-slate-900 dark:text-indigo-100">
            {grid.name}
          </span>
          {targetValue !== undefined ? (
            <span className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              target = {targetValue}
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[2.5rem_1fr] items-end gap-2">
          <span />
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${maxColumnCount}, minmax(2.5rem, 1fr))` }}
          >
            {Array.from({ length: maxColumnCount }, (_, colIndex) => (
              <span
                key={colIndex}
                className={cn(
                  'text-center font-mono text-[11px] font-semibold text-muted-foreground',
                  activeCol === colIndex && 'text-cyan-700 dark:text-cyan-200',
                )}
              >
                c{colIndex}
              </span>
            ))}
          </div>
        </div>
        {grid.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
            <span
              className={cn(
                'rounded-sm border border-transparent px-1.5 py-1 text-center font-mono text-xs text-muted-foreground',
                activeRow === rowIndex &&
                  'border-cyan-300 bg-cyan-50 font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
              )}
            >
              r{rowIndex}
            </span>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${maxColumnCount}, minmax(2.5rem, 1fr))` }}
            >
              {Array.from({ length: maxColumnCount }, (_, colIndex) => {
                const cell = row[colIndex];
                if (cell === undefined) {
                  return (
                    <span
                      key={`${rowIndex}-${colIndex}-empty`}
                      className="min-h-10 rounded-sm border border-dashed border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/30"
                    />
                  );
                }
                const active = activeRow === rowIndex && activeCol === colIndex;
                const rowActive = activeRow === rowIndex;
                const matchesTarget = traceValuesEqual(cell, targetValue);
                return (
                  <span
                    key={`${rowIndex}-${colIndex}`}
                    className={cn(
                      'flex min-h-10 items-center justify-center rounded-sm border-2 px-2 py-1 text-center font-mono text-sm font-semibold transition-colors',
                      active
                        ? matchesTarget
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.16)]'
                          : 'border-cyan-500 bg-cyan-500 text-white shadow-[0_0_0_3px_rgba(34,211,238,0.16)]'
                        : matchesTarget
                          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-100'
                          : rowActive
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100'
                            : 'border-indigo-950/45 bg-white text-indigo-950 dark:border-indigo-200/45 dark:bg-slate-950 dark:text-indigo-100',
                    )}
                  >
                    {cell}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TraceValueTile({
  label,
  value,
  changed = false,
  previous,
  tone = 'default',
  renderInlineMathHtml,
}: {
  label: string;
  value: string | undefined;
  changed?: boolean;
  previous?: string;
  tone?: 'default' | 'active' | 'success' | 'warning';
  renderInlineMathHtml: (text: string) => string;
}) {
  return (
    <div
      className={cn(
        'rounded-sm border-2 bg-white/90 px-2.5 py-2 dark:bg-slate-950/80',
        tone === 'active'
          ? 'border-cyan-400'
          : tone === 'success'
            ? 'border-emerald-400'
            : tone === 'warning'
              ? 'border-amber-300'
              : 'border-indigo-950/45 dark:border-indigo-200/45',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 min-h-6 break-words font-mono text-lg font-semibold leading-6 text-indigo-950 dark:text-indigo-100',
          tone === 'active' && 'text-cyan-700 dark:text-cyan-200',
          tone === 'success' && 'text-emerald-700 dark:text-emerald-200',
          tone === 'warning' && 'text-amber-700 dark:text-amber-100',
        )}
      >
        {changed && previous !== undefined ? (
          <>
            <span className="text-muted-foreground line-through">
              <InlineText text={previous} renderInlineMathHtml={renderInlineMathHtml} />
            </span>
            <span className="mx-1 text-xs text-muted-foreground">→</span>
          </>
        ) : null}
        <InlineText text={value ?? '—'} renderInlineMathHtml={renderInlineMathHtml} />
      </p>
    </div>
  );
}

export function TraceExecutionPanel({
  state,
  previousState,
  inputs,
  grid,
  language,
  renderInlineMathHtml,
}: {
  state: TraceStateMap;
  previousState: TraceStateMap;
  inputs: KeyValue[];
  grid: TraceGrid | null;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const rowIndex = parseTraceNumber(state.row_index);
  const colIndex = parseTraceNumber(state.col_index);
  const targetValue = getTraceTargetValue(inputs, state);
  const valueMatchesTarget =
    state.value !== undefined && targetValue !== undefined
      ? traceValuesEqual(state.value, targetValue)
      : null;
  const countChanged =
    previousState.count !== undefined &&
    state.count !== undefined &&
    previousState.count !== state.count;
  const activeRow = rowIndex !== null && grid?.rows[rowIndex] ? grid.rows[rowIndex] : null;
  const activeCell =
    activeRow && colIndex !== null && activeRow[colIndex] !== undefined
      ? activeRow[colIndex]
      : undefined;

  const phase =
    state.return !== undefined
      ? language === 'en-US'
        ? 'Return'
        : '返回'
      : rowIndex === null
        ? language === 'en-US'
          ? 'Setup'
          : '初始化'
        : colIndex === null
          ? language === 'en-US'
            ? 'Outer loop'
            : '外层循环'
          : language === 'en-US'
            ? 'Inner loop'
            : '内层循环';

  return (
    <div className="rounded-lg border-2 border-indigo-950/80 bg-[#fffefa] p-3 dark:border-indigo-200/70 dark:bg-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-950 dark:text-indigo-100">
          {language === 'en-US' ? 'Execution' : '执行现场'}
        </p>
        <span className="rounded-sm border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100">
          {phase}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <TraceValueTile
          label="row_index"
          value={state.row_index}
          tone={rowIndex !== null ? 'active' : 'default'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceValueTile
          label="col_index"
          value={state.col_index}
          tone={colIndex !== null ? 'active' : 'default'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceValueTile
          label="value"
          value={state.value ?? activeCell}
          tone={
            valueMatchesTarget === true
              ? 'success'
              : state.value !== undefined
                ? 'active'
                : 'default'
          }
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceValueTile
          label="target"
          value={targetValue}
          tone="warning"
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>

      <div
        className={cn(
          'mt-2 rounded-sm border-2 px-3 py-2',
          valueMatchesTarget === true
            ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
            : valueMatchesTarget === false
              ? 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200'
              : 'border-dashed border-slate-300 bg-white/80 text-muted-foreground dark:border-slate-700 dark:bg-slate-900/40',
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">
          {language === 'en-US' ? 'Condition' : '条件判断'}
        </p>
        <p className="mt-1 font-mono text-sm font-semibold">
          {state.value !== undefined && targetValue !== undefined ? (
            <>
              value == target{' '}
              <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-xs">
                {valueMatchesTarget ? 'True' : 'False'}
              </span>
            </>
          ) : language === 'en-US' ? (
            'waiting for value'
          ) : (
            '等待 value'
          )}
        </p>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <TraceValueTile
          label="count"
          value={state.count}
          changed={countChanged}
          previous={previousState.count}
          tone={countChanged ? 'success' : 'default'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceValueTile
          label="return"
          value={state.return}
          tone={state.return !== undefined ? 'success' : 'default'}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
    </div>
  );
}

export function TraceWorksheetField({
  label,
  value,
  previous,
  tone = 'default',
  renderInlineMathHtml,
}: {
  label: string;
  value: string | undefined;
  previous?: string;
  tone?: 'default' | 'active' | 'success' | 'warning';
  renderInlineMathHtml: (text: string) => string;
}) {
  const changed = previous !== undefined && value !== undefined && previous !== value;
  const valueChipClassName = cn(
    'inline-flex max-w-full items-center rounded-md border px-1.5 py-0 font-mono text-xs font-semibold leading-4 shadow-sm',
    tone === 'active'
      ? 'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100'
      : tone === 'success'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100'
        : tone === 'warning'
          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
          : 'border-transparent bg-transparent px-0 shadow-none text-slate-950 dark:text-slate-100',
  );

  return (
    <div className="flex min-w-0 items-center justify-between gap-1 rounded-md bg-white/45 px-1 py-0.5 dark:bg-slate-900/35">
      <p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="flex min-h-4 min-w-0 flex-wrap items-center justify-end gap-1 break-words text-right font-mono text-xs font-semibold leading-4 text-slate-950 dark:text-slate-100">
        {changed ? (
          <>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0 text-muted-foreground line-through dark:border-slate-800 dark:bg-slate-900">
              <InlineText text={previous} renderInlineMathHtml={renderInlineMathHtml} />
            </span>
            <span className="text-xs text-muted-foreground">→</span>
          </>
        ) : null}
        <span className={valueChipClassName}>
          <InlineText text={value ?? '—'} renderInlineMathHtml={renderInlineMathHtml} />
        </span>
      </p>
    </div>
  );
}

export function TraceWorksheetSection({
  title,
  helper,
  tone = 'default',
  children,
}: {
  title: string;
  helper: string;
  tone?: 'default' | 'active' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white/85 p-1 shadow-sm transition-colors dark:bg-slate-950/70',
        tone === 'active'
          ? 'border-cyan-500 bg-cyan-50 shadow-[0_0_0_2px_rgba(6,182,212,0.16)] dark:border-cyan-600 dark:bg-cyan-950/35'
          : tone === 'success'
            ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_0_2px_rgba(16,185,129,0.15)] dark:border-emerald-700 dark:bg-emerald-950/35'
            : tone === 'warning'
              ? 'border-amber-500 bg-amber-50 shadow-[0_0_0_2px_rgba(245,158,11,0.15)] dark:border-amber-700 dark:bg-amber-950/35'
              : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <div className="mb-0.5 flex items-center justify-between gap-1.5">
        <p className="text-[11px] font-semibold text-slate-950 dark:text-slate-100">{title}</p>
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[9px] font-semibold',
            tone === 'active'
              ? 'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950'
              : tone === 'success'
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                : tone === 'warning'
                  ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300',
          )}
        >
          {helper}
        </span>
      </div>
      <div className="grid gap-0.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function TraceLoopWorksheetPanel({
  step,
  grid,
  state,
  previousState,
  inputs,
  language,
  renderInlineMathHtml,
}: {
  step: CodeTraceStep | undefined;
  grid: TraceGrid;
  state: TraceStateMap;
  previousState: TraceStateMap;
  inputs: KeyValue[];
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const rowIndex = parseTraceNumber(state.row_index);
  const colIndex = parseTraceNumber(state.col_index);
  const activeRow = rowIndex !== null ? grid.rows[rowIndex] : null;
  const activeCell =
    activeRow && colIndex !== null && activeRow[colIndex] !== undefined
      ? activeRow[colIndex]
      : undefined;
  const targetValue = getTraceTargetValue(inputs, state);
  const currentValue = state.value ?? activeCell;
  const valueMatchesTarget =
    currentValue !== undefined && targetValue !== undefined
      ? traceValuesEqual(currentValue, targetValue)
      : null;
  const phase =
    state.return !== undefined
      ? language === 'en-US'
        ? 'return'
        : '返回'
      : rowIndex === null
        ? language === 'en-US'
          ? 'setup'
          : '初始化'
        : colIndex === null
          ? language === 'en-US'
            ? 'outer loop'
            : '外层固定'
          : language === 'en-US'
            ? 'inner loop'
            : '内层移动';

  return (
    <div className="space-y-1 rounded-xl border-2 border-slate-900/80 bg-[#fffefa] p-1.5 shadow-sm dark:border-slate-200/70 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {language === 'en-US' ? 'Trace worksheet' : 'Trace worksheet'}
          </p>
          <p className="text-[13px] font-semibold text-slate-950 dark:text-slate-100">
            {step?.line
              ? language === 'en-US'
                ? `Line ${step.line}: what changed?`
                : `第 ${step.line} 行：这一行改变了什么？`
              : language === 'en-US'
                ? 'What changed?'
                : '这一刻改变了什么？'}
          </p>
        </div>
        <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100">
          {phase}
        </span>
      </div>

      {step?.explanation ? (
        <p className="rounded-lg border border-slate-200 bg-white/80 px-2 py-0.5 text-xs leading-4 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
          <InlineText text={step.explanation} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}

      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        <TraceWorksheetSection
          title={language === 'en-US' ? 'Outer loop' : 'Outer loop'}
          helper={language === 'en-US' ? 'row fixed' : 'row 固定'}
          tone={rowIndex !== null ? 'active' : 'default'}
        >
          <TraceWorksheetField
            label="row index"
            value={state.row_index}
            previous={previousState.row_index}
            tone={rowIndex !== null ? 'active' : 'default'}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceWorksheetField
            label="row"
            value={state.row}
            previous={previousState.row}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </TraceWorksheetSection>

        <TraceWorksheetSection
          title={language === 'en-US' ? 'Inner loop' : 'Inner loop'}
          helper={language === 'en-US' ? 'col moves' : 'col 移动'}
          tone={colIndex !== null ? 'active' : 'default'}
        >
          <TraceWorksheetField
            label="col index"
            value={state.col_index}
            previous={previousState.col_index}
            tone={colIndex !== null ? 'active' : 'default'}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceWorksheetField
            label="value"
            value={currentValue}
            previous={previousState.value}
            tone={
              valueMatchesTarget === true
                ? 'success'
                : currentValue !== undefined
                  ? 'active'
                  : 'default'
            }
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </TraceWorksheetSection>

        <TraceWorksheetSection
          title={language === 'en-US' ? 'Gate' : 'Gate'}
          helper={
            valueMatchesTarget === null
              ? language === 'en-US'
                ? 'waiting'
                : '等待 value'
              : valueMatchesTarget
                ? 'True'
                : 'False'
          }
          tone={
            valueMatchesTarget === true
              ? 'success'
              : valueMatchesTarget === false
                ? 'default'
                : 'warning'
          }
        >
          <TraceWorksheetField
            label="value"
            value={currentValue}
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceWorksheetField
            label="target"
            value={targetValue}
            tone="warning"
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </TraceWorksheetSection>

        <TraceWorksheetSection
          title={language === 'en-US' ? 'Count' : 'Count'}
          helper={
            previousState.count === undefined && state.count !== undefined
              ? 'init'
              : previousState.count !== state.count
                ? '+1'
                : 'hold'
          }
          tone={
            previousState.count !== undefined && previousState.count !== state.count
              ? 'success'
              : 'default'
          }
        >
          <TraceWorksheetField
            label="count"
            value={state.count}
            previous={previousState.count}
            tone={
              previousState.count !== undefined && previousState.count !== state.count
                ? 'success'
                : 'default'
            }
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceWorksheetField
            label="return"
            value={state.return}
            tone={state.return !== undefined ? 'success' : 'default'}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </TraceWorksheetSection>
      </div>
    </div>
  );
}

export function TraceSnapshotPanel({
  grid,
  state,
  previousState,
  inputs,
  language,
  renderInlineMathHtml,
  compact = false,
}: {
  grid: TraceGrid | null;
  state: TraceStateMap;
  previousState: TraceStateMap;
  inputs: KeyValue[];
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
  compact?: boolean;
}) {
  const targetValue = getTraceTargetValue(inputs, state);

  return (
    <div className="rounded-xl border-2 border-indigo-950/80 bg-[#fffefa] p-2 shadow-sm dark:border-indigo-200/70 dark:bg-slate-950">
      <div
        className={cn(
          'grid gap-2',
          !compact && 'xl:grid-cols-[minmax(0,1.18fr)_minmax(280px,0.82fr)]',
        )}
      >
        <TraceGridPanel grid={grid} state={state} language={language} targetValue={targetValue} />
        <TraceExecutionPanel
          state={state}
          previousState={previousState}
          inputs={inputs}
          grid={grid}
          language={language}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      {!grid ? (
        <div className="mt-2 rounded-lg border border-cyan-200/80 bg-cyan-50/60 px-2 py-1.5 dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-800 dark:text-cyan-100">
            {language === 'en-US' ? 'State' : '状态'}
          </p>
          <KeyValueChips
            items={getTraceStateItems(state)}
            renderInlineMathHtml={renderInlineMathHtml}
            previousValues={previousState}
            showChanges
          />
        </div>
      ) : null}
    </div>
  );
}

export function TraceGenericSnapshotPanel({
  state,
  previousState,
  language,
  renderInlineMathHtml,
}: {
  state: TraceStateMap;
  previousState: TraceStateMap;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const items = getGenericTraceStateItems(state);

  return (
    <div className="rounded-xl border-2 border-indigo-950/80 bg-[#fffefa] p-2 shadow-sm dark:border-indigo-200/70 dark:bg-slate-950">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-indigo-950 dark:text-indigo-100">
          {language === 'en-US' ? 'State snapshot' : '状态快照'}
        </p>
        {state.phase || state.event ? (
          <span className="rounded-sm border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100">
            {state.phase || state.event}
          </span>
        ) : null}
      </div>
      {items.length ? (
        <KeyValueChips
          items={items}
          renderInlineMathHtml={renderInlineMathHtml}
          previousValues={previousState}
          showChanges
        />
      ) : (
        <p className="rounded-lg border-2 border-dashed border-indigo-900/40 px-2 py-3 text-xs text-muted-foreground dark:border-indigo-200/40">
          {language === 'en-US' ? 'No tracked variables yet.' : '还没有需要追踪的变量。'}
        </p>
      )}
    </div>
  );
}

export function TraceIdBox({
  value,
  active = false,
  compact = false,
  renderInlineMathHtml,
}: {
  value: string;
  active?: boolean;
  compact?: boolean;
  renderInlineMathHtml: (text: string) => string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center justify-center rounded-sm bg-white font-mono font-semibold shadow-[1px_1px_0_rgba(49,46,129,0.1)] dark:bg-slate-950',
        compact ? 'border px-1 py-0 text-[10px] leading-4' : 'border-2 px-1.5 py-0.5 text-xs',
        active
          ? 'border-cyan-500 text-cyan-700 dark:border-cyan-300 dark:text-cyan-100'
          : /^id[A-Za-z0-9_:-]+$/.test(value)
            ? 'border-indigo-950/80 text-amber-600 dark:border-indigo-200/75 dark:text-amber-300'
            : 'border-slate-300 text-indigo-950 dark:border-slate-700 dark:text-indigo-100',
      )}
    >
      <InlineText text={value} renderInlineMathHtml={renderInlineMathHtml} />
    </span>
  );
}

export function TraceCallStackFrameCard({
  frame,
  isTop,
  isBottom,
  language,
  heapIds,
  compact = false,
  renderInlineMathHtml,
}: {
  frame: TraceCallStackFrame;
  isTop: boolean;
  isBottom: boolean;
  language: NotebookContentDocument['language'];
  heapIds?: Set<string>;
  compact?: boolean;
  renderInlineMathHtml: (text: string) => string;
}) {
  const statusLabel =
    frame.status === 'running'
      ? language === 'en-US'
        ? 'running'
        : '正在执行'
      : frame.status === 'returning'
        ? language === 'en-US'
          ? 'returning'
          : '正在返回'
        : frame.status === 'complete'
          ? language === 'en-US'
            ? 'complete'
            : '已完成'
          : language === 'en-US'
            ? 'paused'
            : '暂停等待';

  return (
    <div
      className={cn(
        'relative rounded-sm bg-white/95 dark:bg-slate-950/90',
        compact
          ? 'border p-1.5 shadow-[1px_1px_0_rgba(49,46,129,0.08)]'
          : 'border-2 p-2 shadow-[2px_2px_0_rgba(49,46,129,0.08)]',
        frame.active || frame.status === 'returning'
          ? compact
            ? 'border-cyan-500 shadow-[0_0_0_2px_rgba(34,211,238,0.14)]'
            : 'border-cyan-500 shadow-[0_0_0_3px_rgba(34,211,238,0.14)]'
          : 'border-indigo-950/70 dark:border-indigo-200/60',
      )}
    >
      <div className={cn('flex items-start justify-between gap-1.5', compact ? 'mb-1' : 'mb-1.5')}>
        <div
          className={cn(
            'min-w-0 truncate rounded-sm border-indigo-950/80 bg-white font-mono font-semibold text-indigo-950 dark:border-indigo-200/75 dark:bg-slate-950 dark:text-indigo-100',
            compact
              ? 'max-w-[54%] border px-1 py-0 text-[10px] leading-4'
              : 'max-w-[58%] border-2 px-1.5 py-0.5 text-xs leading-none',
          )}
        >
          <InlineText text={frame.name} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
        <div
          className={cn(
            'flex shrink-0 flex-wrap items-center justify-end',
            compact ? 'gap-0.5' : 'gap-1',
          )}
        >
          {isTop || isBottom ? (
            <span
              className={cn(
                'inline-flex items-center rounded-sm border border-indigo-950/30 bg-indigo-50 font-semibold leading-none text-indigo-800 dark:border-indigo-200/40 dark:bg-indigo-950/30 dark:text-indigo-100',
                compact ? 'h-4 px-1 text-[8px]' : 'h-5 px-1.5 text-[9px]',
              )}
            >
              {isTop
                ? language === 'en-US'
                  ? 'top'
                  : '栈顶'
                : language === 'en-US'
                  ? 'bottom'
                  : '栈底'}
            </span>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center whitespace-nowrap rounded-sm border font-semibold leading-none',
              compact ? 'h-4 px-1 text-[8px]' : 'h-5 px-1.5 text-[9px]',
              frame.status === 'running'
                ? 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100'
                : frame.status === 'returning'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      {frame.fields.length ? (
        <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
          {frame.fields.map((field) => {
            const valueIsHeapRef = heapIds?.has(field.value.trim()) ?? false;
            return (
              <div
                key={`${field.name}-${field.value}`}
                className={cn(
                  'grid grid-cols-[max-content_minmax(0,1fr)] items-center',
                  compact ? 'gap-1' : 'gap-1.5',
                )}
              >
                <span
                  className={cn(
                    'whitespace-nowrap font-mono font-semibold text-indigo-950 dark:text-indigo-100',
                    compact ? 'text-[11px] leading-4' : 'text-xs',
                  )}
                >
                  <InlineText text={field.name} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
                <TraceIdBox
                  value={field.value}
                  active={valueIsHeapRef && (frame.active || frame.status === 'returning')}
                  compact={compact}
                  renderInlineMathHtml={renderInlineMathHtml}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className={cn('text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          {language === 'en-US' ? 'No local values shown.' : '此帧暂不显示局部值。'}
        </p>
      )}
    </div>
  );
}

export function TraceHeapObjectCard({
  object,
  compact = false,
  className,
  renderInlineMathHtml,
}: {
  object: TraceHeapObject;
  compact?: boolean;
  className?: string;
  renderInlineMathHtml: (text: string) => string;
}) {
  const isList = object.label.toLowerCase() === 'list';
  const isPrimitive = ['int', 'str', 'float', 'bool', 'date'].includes(object.label.toLowerCase());
  const listColumnCount = Math.max(object.fields.length, 1);
  const listCellMin = compact ? '2.05rem' : '2.4rem';

  return (
    <div
      className={cn(
        'relative rounded-sm',
        object.active ? 'bg-cyan-50/95 dark:bg-cyan-950/35' : 'bg-white/95 dark:bg-slate-950/90',
        compact
          ? 'border shadow-[1px_1px_0_rgba(49,46,129,0.08)]'
          : 'border-2 shadow-[2px_2px_0_rgba(49,46,129,0.08)]',
        object.active
          ? compact
            ? 'border-cyan-500 ring-2 ring-cyan-400/80 ring-offset-1 ring-offset-[#fffefa] shadow-[0_0_0_1px_rgba(14,116,144,0.2),0_6px_14px_rgba(8,145,178,0.16)] dark:ring-cyan-300/60 dark:ring-offset-slate-950'
            : 'border-cyan-500 ring-2 ring-cyan-400/80 ring-offset-1 ring-offset-[#fffefa] shadow-[0_0_0_1px_rgba(14,116,144,0.2),0_8px_18px_rgba(8,145,178,0.16)] dark:ring-cyan-300/60 dark:ring-offset-slate-950'
          : 'border-indigo-950/70 dark:border-indigo-200/60',
        compact
          ? isPrimitive
            ? 'min-h-[46px] p-1'
            : 'min-h-[72px] p-1.5'
          : isPrimitive
            ? 'min-h-[62px] p-1.5'
            : 'min-h-[98px] p-2',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-1.5',
          compact ? 'mb-0.5' : isPrimitive ? 'mb-1' : 'mb-1.5',
        )}
      >
        <div
          className={cn(
            'min-w-0 truncate rounded-sm font-mono font-semibold',
            compact
              ? 'max-w-[55%] border px-1 py-0 text-[10px] leading-4'
              : isPrimitive
                ? 'max-w-none shrink-0 border-2 px-1 py-0.5 text-[10px] leading-none'
                : 'max-w-[52%] border-2 px-1.5 py-0.5 text-xs leading-none',
            object.active
              ? 'border-cyan-700 bg-white text-cyan-800 shadow-sm dark:border-cyan-200 dark:bg-cyan-950 dark:text-cyan-100'
              : 'border-indigo-950/80 bg-white text-amber-600 dark:border-indigo-200/75 dark:bg-slate-950 dark:text-amber-300',
          )}
        >
          <InlineText text={object.id} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
        <div
          className={cn(
            'min-w-0 truncate rounded-sm font-mono font-semibold',
            compact
              ? 'max-w-[40%] border px-1 py-0 text-[10px] leading-4'
              : isPrimitive
                ? 'max-w-none shrink-0 border-2 px-1 py-0.5 text-[10px] leading-none'
                : 'max-w-[42%] border-2 px-1.5 py-0.5 text-xs leading-none',
            object.active
              ? 'border-cyan-700 bg-white text-cyan-950 shadow-sm dark:border-cyan-200 dark:bg-cyan-950 dark:text-cyan-100'
              : 'border-indigo-950/80 bg-white text-indigo-950 dark:border-indigo-200/75 dark:bg-slate-950 dark:text-indigo-100',
          )}
        >
          <InlineText text={object.label} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
      </div>
      {isList ? (
        object.fields.length ? (
          <div className="mx-auto max-w-full">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${listColumnCount}, minmax(${listCellMin}, 1fr))`,
              }}
            >
              {object.fields.map((field) => (
                <span
                  key={`${field.name}-index`}
                  className={cn(
                    'text-center font-mono font-semibold text-indigo-950 dark:text-indigo-100',
                    compact ? 'text-[10px] leading-4' : 'text-xs',
                  )}
                >
                  <InlineText text={field.name} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
              ))}
            </div>
            <div
              className={cn(
                'grid overflow-hidden rounded-sm border-indigo-950/80 dark:border-indigo-200/75',
                compact ? 'border' : 'border-2',
              )}
              style={{
                gridTemplateColumns: `repeat(${listColumnCount}, minmax(${listCellMin}, 1fr))`,
              }}
            >
              {object.fields.map((field) => (
                <span
                  key={`${field.name}-${field.value}`}
                  className={cn(
                    'flex items-center justify-center border-r font-mono font-semibold last:border-r-0',
                    compact ? 'min-h-6 px-0.5 text-[11px]' : 'min-h-8 px-1 text-xs',
                    object.active
                      ? 'border-cyan-700 bg-cyan-100/90 text-cyan-950 dark:border-cyan-200/70 dark:bg-cyan-900/60 dark:text-cyan-50'
                      : 'border-indigo-950/80 bg-white text-amber-600 dark:border-indigo-200/75 dark:bg-slate-950 dark:text-amber-300',
                  )}
                >
                  <InlineText text={field.value} renderInlineMathHtml={renderInlineMathHtml} />
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p
            className={cn(
              'pt-0.5 text-center font-mono font-semibold italic text-indigo-950 dark:text-indigo-100',
              compact ? 'text-xs' : 'text-base',
            )}
          >
            empty
          </p>
        )
      ) : (
        <p
          className={cn(
            'text-center font-mono font-semibold leading-tight',
            compact
              ? 'whitespace-nowrap text-[12px]'
              : isPrimitive
                ? 'whitespace-nowrap text-sm'
                : 'text-xl',
            object.active
              ? 'text-cyan-950 dark:text-cyan-50'
              : 'text-indigo-950 dark:text-indigo-100',
          )}
        >
          <InlineText
            text={object.fields[0]?.value || object.label}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </p>
      )}
    </div>
  );
}

export function TraceHeapPanel({
  heap,
  language,
  compact = false,
  renderInlineMathHtml,
}: {
  heap: TraceHeapObject[];
  language: NotebookContentDocument['language'];
  compact?: boolean;
  renderInlineMathHtml: (text: string) => string;
}) {
  if (!heap.length) {
    return (
      <div
        className={cn(
          'rounded-lg border-2 border-dashed border-indigo-900/40 text-muted-foreground dark:border-indigo-200/40',
          compact ? 'px-2 py-2 text-xs' : 'px-3 py-4 text-sm',
        )}
      >
        {language === 'en-US' ? 'No heap objects in this step.' : '这一步还没有显示 heap object。'}
      </div>
    );
  }

  const listObjects = heap.filter((object) => object.label.toLowerCase() === 'list');
  const otherObjects = heap.filter((object) => object.label.toLowerCase() !== 'list');

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {listObjects.length ? (
        <div className={cn('grid md:grid-cols-2', compact ? 'gap-1.5' : 'gap-2')}>
          {listObjects.map((object) => (
            <TraceHeapObjectCard
              key={object.id}
              object={object}
              compact={compact}
              renderInlineMathHtml={renderInlineMathHtml}
            />
          ))}
        </div>
      ) : null}
      {otherObjects.length ? (
        <div
          className={cn(
            'grid',
            compact
              ? 'grid-cols-[repeat(auto-fit,minmax(5.2rem,7.25rem))] gap-1.5'
              : 'grid-cols-[repeat(auto-fit,minmax(5.25rem,1fr))] gap-2',
          )}
        >
          {otherObjects.map((object) => (
            <TraceHeapObjectCard
              key={object.id}
              object={object}
              compact={compact}
              renderInlineMathHtml={renderInlineMathHtml}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TraceCallStackSnapshotPanel({
  state,
  previousState,
  language,
  renderInlineMathHtml,
}: {
  state: TraceStateMap;
  previousState: TraceStateMap;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const frames = parseTraceCallStackState(state);
  const previousFrames = parseTraceCallStackState(previousState);
  const heap = parseTraceHeapState(state, frames);
  const heapIds = new Set(heap.map((object) => object.id));
  const displayedFrames = [...frames].reverse();
  const visibleStateItems = getGenericTraceStateItems(state);
  const compact = true;
  const stackChange =
    previousFrames.length === 0 || previousFrames.length === frames.length
      ? ''
      : frames.length > previousFrames.length
        ? language === 'en-US'
          ? 'push frame'
          : '压入新栈帧'
        : language === 'en-US'
          ? 'pop frame'
          : '弹出栈帧';

  return (
    <div className="rounded-xl border-2 border-violet-900/80 bg-[#fffefa] p-2 shadow-sm dark:border-violet-200/70 dark:bg-slate-950">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-violet-200 bg-violet-50/70 px-2 py-1 dark:border-violet-900/60 dark:bg-violet-950/20">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100">
            {language === 'en-US' ? 'Current action' : '当前动作'}
          </p>
          <p className="min-w-0 text-xs font-medium leading-4 text-foreground">
            <InlineText
              text={
                state.event ||
                state.phase ||
                (language === 'en-US' ? 'Trace call stack.' : '观察调用栈变化。')
              }
              renderInlineMathHtml={renderInlineMathHtml}
            />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {stackChange ? (
            <span className="rounded-sm border border-cyan-300 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100">
              {stackChange}
            </span>
          ) : null}
          {state.return_value !== undefined ? (
            <span className="rounded-sm border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              {language === 'en-US' ? 'return' : '返回'} = {state.return_value}
            </span>
          ) : null}
          {visibleStateItems.length ? (
            <KeyValueChips
              items={visibleStateItems}
              renderInlineMathHtml={renderInlineMathHtml}
              previousValues={previousState}
              showChanges
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(185px,0.42fr)_minmax(0,1.58fr)]">
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100">
              {language === 'en-US' ? 'Call stack' : '调用栈'}
            </p>
            <span className="rounded-sm border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
              {language === 'en-US' ? 'top executes first' : '栈顶先执行'}
            </span>
          </div>
          <div className="space-y-1">
            {displayedFrames.map((frame, displayIndex) => (
              <TraceCallStackFrameCard
                key={`${frame.name}-${displayIndex}-${displayedFrames.length}`}
                frame={frame}
                isTop={displayIndex === 0}
                isBottom={displayIndex === displayedFrames.length - 1}
                language={language}
                heapIds={heapIds}
                compact={compact}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-900 dark:text-violet-100">
              heap
            </p>
            <span className="rounded-sm border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
              {language === 'en-US' ? 'parameters point here' : '参数引用到这里'}
            </span>
          </div>
          <TraceHeapPanel
            heap={heap}
            language={language}
            compact={compact}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
      </div>
    </div>
  );
}

export function TraceCurrentStepPanel({
  step,
  language,
  renderInlineMathHtml,
}: {
  step: CodeTraceStep | undefined;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  if (!step) return null;

  return (
    <div className="rounded-lg border border-cyan-200 bg-background/90 px-2 py-1.5 shadow-sm dark:border-cyan-900/60 dark:bg-background/70">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-800 dark:text-cyan-100">
        {language === 'en-US' ? `Current step` : `当前步骤`}
        {step.line ? ` · line ${step.line}` : ''}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-foreground">
        <InlineText text={step.explanation} renderInlineMathHtml={renderInlineMathHtml} />
      </p>
    </div>
  );
}
