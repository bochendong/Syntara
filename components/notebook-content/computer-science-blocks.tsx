'use client';

import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { cn } from '@/lib/utils';

type NotebookBlock = NotebookContentDocument['blocks'][number];
type CodeTraceBlock = Extract<NotebookBlock, { type: 'code_trace' }>;
type StateTableBlock = Extract<NotebookBlock, { type: 'state_table' }>;
type CallStackBlock = Extract<NotebookBlock, { type: 'call_stack' }>;
type MemoryDiagramBlock = Extract<NotebookBlock, { type: 'memory_diagram' }>;
type PointerDiagramBlock = Extract<NotebookBlock, { type: 'pointer_diagram' }>;
type TreeDiagramBlock = Extract<NotebookBlock, { type: 'tree_diagram' }>;
type GraphTraceBlock = Extract<NotebookBlock, { type: 'graph_trace' }>;
type InvariantPanelBlock = Extract<NotebookBlock, { type: 'invariant_panel' }>;
type DictionaryDiagramBlock = Extract<NotebookBlock, { type: 'dictionary_diagram' }>;
type LinearStructureBlock = Extract<NotebookBlock, { type: 'linear_structure' }>;
type KeyValue = { name: string; value: string };
type CodeTraceStep = CodeTraceBlock['steps'][number];
type MemoryFrame = MemoryDiagramBlock['frames'][number];
type MemoryTraceStep = MemoryDiagramBlock['steps'][number];
type PointerDiagramNode = PointerDiagramBlock['nodes'][number];
type PointerDiagramPointer = PointerDiagramBlock['pointers'][number];
type PointerDiagramLink = PointerDiagramBlock['links'][number];
type TreeDiagramNode = TreeDiagramBlock['nodes'][number];
type GraphTraceNode = GraphTraceBlock['nodes'][number];
type GraphTraceEdge = GraphTraceBlock['edges'][number];
type GraphTraceStep = GraphTraceBlock['steps'][number];
type LinearStructureItem = LinearStructureBlock['items'][number];
type TraceStateMap = Record<string, string>;
type TraceGrid = {
  name: string;
  rows: string[][];
};
type TraceHeapObject = MemoryDiagramBlock['heap'][number];
type TraceCallStackFrame = {
  name: string;
  fields: KeyValue[];
  active: boolean;
  status: 'running' | 'paused' | 'returning' | 'complete';
};
type TreeLayoutNode = {
  id: string;
  node: TreeDiagramNode;
  x: number;
  y: number;
  width: number;
};
type TreeLayoutEdge = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
  active: boolean;
};
type GraphLayoutNode = GraphTraceNode & {
  x: number;
  y: number;
};

const EMPTY_POINTER_STEPS: PointerDiagramBlock['steps'] = [];
const EMPTY_TREE_STEPS: TreeDiagramBlock['steps'] = [];
const EMPTY_GRAPH_STEPS: GraphTraceBlock['steps'] = [];
const EMPTY_LINEAR_STEPS: LinearStructureBlock['steps'] = [];
const TREE_NODE_HEIGHT = 40;
const TREE_LEVEL_GAP = 82;
const TREE_SIBLING_GAP = 46;
const TREE_CANVAS_PADDING_X = 36;
const TREE_CANVAS_PADDING_Y = 26;
const PYTHON_KEYWORDS = new Set([
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
const PYTHON_CONSTANTS = new Set(['False', 'None', 'True']);
const PYTHON_BUILTINS = new Set([
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

type CsBlockProps<TBlock extends NotebookBlock> = {
  block: TBlock;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
  activeStepIndex?: number;
};

function clampStepIndex(index: number, totalSteps: number) {
  return Math.max(0, Math.min(Math.max(totalSteps - 1, 0), Math.floor(index)));
}

function usePlayableStepIndex(activeStepIndex: number | undefined, totalSteps: number) {
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  return {
    safeStepIndex:
      typeof activeStepIndex === 'number'
        ? clampStepIndex(activeStepIndex, totalSteps)
        : clampStepIndex(internalStepIndex, totalSteps),
    setInternalStepIndex,
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInlineMathAndCodeHtml(text: string, renderInlineMathHtml: (text: string) => string) {
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

function InlineText({
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

function tokenClass(token: string) {
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

function renderCodeTokens(line: string) {
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

function BlockTitle({
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

function KeyValueChips({
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

function BlockKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
      {children}
    </span>
  );
}

function MiniCodeBlock({
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

function TraceStepNavigator({
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

function parseTraceNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTraceStateMap(steps: CodeTraceStep[], endIndex: number): TraceStateMap {
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

function parseTraceGridInput(inputs: KeyValue[]): TraceGrid | null {
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

function stripTraceLiteralQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function traceValuesEqual(left: string | undefined, right: string | undefined) {
  if (left === undefined || right === undefined) return false;
  return stripTraceLiteralQuotes(left) === stripTraceLiteralQuotes(right);
}

function getTraceInputValue(inputs: KeyValue[], name: string) {
  return inputs.find((input) => input.name === name)?.value;
}

function getTraceTargetValue(inputs: KeyValue[], state: TraceStateMap) {
  return state.target ?? getTraceInputValue(inputs, 'target');
}

function getTraceStateItems(state: TraceStateMap): KeyValue[] {
  return Object.entries(state).map(([name, value]) => ({ name, value }));
}

function getTraceStepGroups(steps: CodeTraceStep[], language: NotebookContentDocument['language']) {
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

function splitTraceFields(raw: string): KeyValue[] {
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

function parseTraceStackFrame(raw: string, index: number, total: number): TraceCallStackFrame {
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

function parseTraceCallStackState(state: TraceStateMap): TraceCallStackFrame[] {
  const rawStack = state.call_stack ?? state.stack;
  if (!rawStack) return [];
  const frames = rawStack
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  return frames.map((frame, index) => parseTraceStackFrame(frame, index, frames.length));
}

function parseTraceHeapFields(raw: string): KeyValue[] {
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

function parseTraceHeapObject(raw: string): TraceHeapObject | null {
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

function parseTraceHeapState(
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

function getGenericTraceStateItems(state: TraceStateMap): KeyValue[] {
  const hidden = new Set(['call_stack', 'stack', 'heap', 'event', 'phase', 'return_value']);
  return Object.entries(state)
    .filter(([name]) => !hidden.has(name))
    .map(([name, value]) => ({ name, value }));
}

function TraceGridPanel({
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

function TraceValueTile({
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

function TraceExecutionPanel({
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

function TraceWorksheetField({
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

function TraceWorksheetSection({
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

function TraceLoopWorksheetPanel({
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

function TraceSnapshotPanel({
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

function TraceGenericSnapshotPanel({
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

function TraceIdBox({
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

function TraceCallStackFrameCard({
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

function TraceHeapObjectCard({
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

function TraceHeapPanel({
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

function TraceCallStackSnapshotPanel({
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

function TraceCurrentStepPanel({
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
  const steps = Array.isArray(block.steps) ? block.steps : [];
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
  const stepGroups = useMemo(
    () => getMemoryStepGroups(steps, language),
    [steps, language],
  );

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

function buildPointerLinks(
  nodes: readonly PointerDiagramNode[],
  links: readonly PointerDiagramLink[],
  isDoublyLinkedList = false,
  nullLabel = 'None',
): PointerDiagramLink[] {
  if (links.length) return [...links];
  if (isDoublyLinkedList) {
    return nodes.flatMap((node) => {
      const generatedLinks: PointerDiagramLink[] = [];
      const nextValue = node.fields.find((field) => field.name === 'next')?.value;
      const prevValue = node.fields.find((field) => field.name === 'prev')?.value;
      if (nextValue && nextValue !== nullLabel) {
        generatedLinks.push({ from: node.id, to: nextValue, label: 'next', active: false });
      }
      if (prevValue && prevValue !== nullLabel) {
        generatedLinks.push({ from: node.id, to: prevValue, label: 'prev', active: false });
      }
      return generatedLinks;
    });
  }

  return nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id,
    label: undefined,
    active: false,
  }));
}

function normalizedPointerLinkLabel(link: PointerDiagramLink) {
  return (link.label || 'next').toLowerCase();
}

function getPointerLink(
  links: readonly PointerDiagramLink[],
  from: string,
  label: 'next' | 'prev',
) {
  return links.find((link) => link.from === from && normalizedPointerLinkLabel(link) === label);
}

function hasDoublyLinkedListShape(
  nodes: readonly PointerDiagramNode[],
  links: readonly PointerDiagramLink[],
) {
  return (
    nodes.some((node) => node.fields.some((field) => field.name === 'prev')) ||
    links.some((link) => normalizedPointerLinkLabel(link) === 'prev')
  );
}

function chunkPointerRows(nodes: readonly PointerDiagramNode[], rowSize: number) {
  if (rowSize <= 0) return [nodes];
  const rows: PointerDiagramNode[][] = [];
  for (let index = 0; index < nodes.length; index += rowSize) {
    rows.push([...nodes.slice(index, index + rowSize)]);
  }
  return rows;
}

function getPointerStepGroups(
  steps: readonly PointerDiagramBlock['steps'][number][],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function PointerConnector({
  node,
  nextNode,
  outgoing,
  backLink,
  isLinkedList,
  isDoublyLinkedList,
  nullLabel,
}: {
  node: PointerDiagramNode;
  nextNode?: PointerDiagramNode;
  outgoing?: PointerDiagramLink;
  backLink?: PointerDiagramLink;
  isLinkedList: boolean;
  isDoublyLinkedList: boolean;
  nullLabel: string;
}) {
  if (!isLinkedList) {
    if (!nextNode) return null;
    return (
      <span
        className={cn(
          'font-mono text-xl text-muted-foreground',
          outgoing?.active && 'text-cyan-500',
        )}
        aria-label={outgoing?.label || 'next'}
      >
        →
      </span>
    );
  }

  if (isDoublyLinkedList) {
    if (!nextNode && !outgoing && !backLink) return null;
    const activeNext = outgoing?.active;
    const activePrev = backLink?.active;

    return (
      <div className="flex w-10 shrink-0 items-center justify-center" aria-label="next and prev">
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-full border font-mono text-lg font-semibold',
            activeNext && activePrev
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.14)] dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
              : activeNext
                ? 'border-cyan-400 bg-cyan-50 text-cyan-800 shadow-[0_0_0_3px_rgba(34,211,238,0.14)] dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-100'
                : activePrev
                  ? 'border-violet-400 bg-violet-50 text-violet-800 shadow-[0_0_0_3px_rgba(139,92,246,0.14)] dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100'
                  : 'border-emerald-200 bg-background/80 text-emerald-800 dark:border-emerald-900/70 dark:bg-background/50 dark:text-emerald-100',
          )}
        >
          ⇄
        </span>
      </div>
    );
  }

  if (!outgoing) {
    const hasNonNullNextField = node.fields.some(
      (field) => field.name === 'next' && field.value !== nullLabel,
    );
    return (
      <span className="rounded-md border border-dashed border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {hasNonNullNextField ? '未连接' : nullLabel}
      </span>
    );
  }

  if (nextNode && outgoing.to === nextNode.id) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 font-mono text-xl text-muted-foreground',
          outgoing.active && 'text-cyan-500',
        )}
        aria-label={outgoing.label || 'next'}
      >
        <span className="text-[10px] uppercase tracking-[0.12em]">next</span>→
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-28 flex-col rounded-md border px-2 py-1 font-mono text-[11px] leading-tight',
        outgoing.active
          ? 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100'
          : 'border-border/70 bg-background/80 text-muted-foreground',
      )}
    >
      <span>next</span>
      <span>→ {outgoing.to}</span>
    </span>
  );
}

function PointerDiagramCanvas({
  nodes,
  pointers,
  links,
  isLinkedList,
  isDoublyLinkedList,
  nullLabel,
  renderInlineMathHtml,
}: {
  nodes: readonly PointerDiagramNode[];
  pointers: readonly PointerDiagramPointer[];
  links: readonly PointerDiagramLink[];
  isLinkedList: boolean;
  isDoublyLinkedList: boolean;
  nullLabel: string;
  renderInlineMathHtml: (text: string) => string;
}) {
  const effectiveLinks = buildPointerLinks(nodes, links, isDoublyLinkedList, nullLabel);
  const nullPointers = pointers.filter((pointer) => !pointer.to);
  const pointerRows = isDoublyLinkedList && nodes.length > 3 ? chunkPointerRows(nodes, 2) : [nodes];

  if (isDoublyLinkedList) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const getNodeField = (node: PointerDiagramNode, name: 'prev' | 'next') =>
      node.fields.find((field) => field.name === name)?.value;
    const getNodeTarget = (node: PointerDiagramNode, name: 'prev' | 'next') =>
      getNodeField(node, name) || getPointerLink(effectiveLinks, node.id, name)?.to || nullLabel;
    const startPointer = pointers.find((pointer) =>
      ['head', 'front', 'first'].includes(pointer.name.toLowerCase()),
    );
    const startNode = (startPointer?.to && nodesById.get(startPointer.to)) || nodes[0];
    const chainNodes: PointerDiagramNode[] = [];
    const visitedNodeIds = new Set<string>();
    let cursor: PointerDiagramNode | undefined = startNode;

    while (cursor && !visitedNodeIds.has(cursor.id)) {
      chainNodes.push(cursor);
      visitedNodeIds.add(cursor.id);
      const nextTarget = getNodeTarget(cursor, 'next');
      if (!nextTarget || nextTarget === nullLabel || visitedNodeIds.has(nextTarget)) break;
      cursor = nodesById.get(nextTarget);
    }

    const chainNodeIds = new Set(chainNodes.map((node) => node.id));
    const detachedNodes = nodes.filter((node) => !chainNodeIds.has(node.id));
    const chainRows = chainNodes.length > 4 ? chunkPointerRows(chainNodes, 4) : [chainNodes];
    const formatPointerName = (name: string) => {
      if (name === 'head') return 'front';
      if (name === 'curr') return 'cur';
      if (name === 'tail') return 'end';
      return name;
    };
    const renderPointerChips = (node: PointerDiagramNode) => {
      const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
      if (!incomingPointers.length) return <div className="min-h-6" />;
      return (
        <div className="flex min-h-6 flex-wrap justify-center gap-1 pt-1">
          {incomingPointers.map((pointer) => (
            <span
              key={pointer.name}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none shadow-sm',
                pointer.name === 'new'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
                  : pointer.name === 'curr'
                    ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100',
              )}
            >
              {formatPointerName(pointer.name)}
            </span>
          ))}
        </div>
      );
    };

    const renderDoublyNode = (node: PointerDiagramNode) => {
      const itemField = node.label;
      const prevLabel = getNodeTarget(node, 'prev');
      const nextLabel = getNodeTarget(node, 'next');
      const prevOutgoing = getPointerLink(effectiveLinks, node.id, 'prev');
      const nextOutgoing = getPointerLink(effectiveLinks, node.id, 'next');
      const prevIsNull = prevLabel === nullLabel;
      const nextIsNull = nextLabel === nullLabel;

      return (
        <div key={node.id} className="space-y-0.5 text-center">
          <div
            className={cn(
              'flex h-11 w-[6.75rem] overflow-hidden rounded-sm border-2 bg-background font-mono shadow-sm',
              node.active && 'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
              node.muted &&
                'border-dashed border-amber-300 bg-amber-50/40 opacity-90 dark:border-amber-900/70 dark:bg-amber-950/20',
              !node.active && !node.muted && 'border-slate-500/80 dark:border-slate-400/70',
            )}
          >
            <div
              className={cn(
                'flex w-5 shrink-0 flex-col items-center justify-center border-r-2 border-inherit',
                prevOutgoing?.active && 'bg-violet-100/80 dark:bg-violet-950/40',
              )}
              aria-label={`prev -> ${prevLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  prevIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-violet-500',
                  prevOutgoing?.active && 'h-2.5 w-2.5 bg-violet-700 ring-4 ring-violet-200',
                )}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1.5">
              <p className="text-lg font-semibold leading-none text-foreground">
                <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
            <div
              className={cn(
                'flex w-5 shrink-0 flex-col items-center justify-center border-l-2 border-inherit',
                nextOutgoing?.active && 'bg-cyan-100/80 dark:bg-cyan-950/40',
              )}
              aria-label={`next -> ${nextLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  nextIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-amber-500',
                  nextOutgoing?.active && 'h-2.5 w-2.5 bg-amber-600 ring-4 ring-amber-200',
                )}
              />
            </div>
          </div>
          {renderPointerChips(node)}
        </div>
      );
    };

    const renderDoublyConnector = (fromNode: PointerDiagramNode, toNode?: PointerDiagramNode) => {
      if (!toNode) return null;
      const nextLink = getPointerLink(effectiveLinks, fromNode.id, 'next');
      const prevLink = getPointerLink(effectiveLinks, toNode.id, 'prev');
      const hasNext = nextLink?.to === toNode.id;
      const hasPrev = prevLink?.to === fromNode.id;
      if (!hasNext && !hasPrev) return <div className="w-5 shrink-0" />;

      return (
        <div
          className="flex h-11 w-12 shrink-0 flex-col justify-center gap-1.5 px-0.5 font-mono text-[10px] font-semibold"
          aria-label="next and prev"
        >
          <span
            className={cn(
              'flex items-center gap-1',
              hasNext ? 'text-amber-600 dark:text-amber-200' : 'text-muted-foreground/50',
              nextLink?.active && 'text-amber-700 dark:text-amber-100',
            )}
          >
            <span className="h-0.5 flex-1 rounded-full bg-current" />
            <span className="text-sm leading-none">→</span>
          </span>
          <span
            className={cn(
              'flex items-center gap-1',
              hasPrev ? 'text-violet-700 dark:text-violet-200' : 'text-muted-foreground/50',
              prevLink?.active && 'text-violet-900 dark:text-violet-100',
            )}
          >
            <span className="text-sm leading-none">←</span>
            <span className="h-0.5 flex-1 rounded-full bg-current" />
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="space-y-2 pb-1">
          <div className="space-y-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/20 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/10">
            {chainRows.map((row, rowIndex) => (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-start gap-0">
                  {row.map((node, localIndex) => (
                    <Fragment key={node.id}>
                      {renderDoublyNode(node)}
                      {renderDoublyConnector(node, row[localIndex + 1])}
                    </Fragment>
                  ))}
                </div>
                {rowIndex < chainRows.length - 1 ? (
                  <p className="px-1 text-center font-mono text-[10px] text-muted-foreground">
                    下一行继续到 {chainRows[rowIndex + 1]?.[0]?.label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {detachedNodes.length > 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/25 p-2 dark:border-amber-900/60 dark:bg-amber-950/10">
              <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
                尚未接入 head 的 next 主链
              </p>
              <div className="flex flex-wrap items-start gap-2">
                {detachedNodes.map((node) => renderDoublyNode(node))}
              </div>
            </div>
          ) : null}
        </div>
        {nullPointers.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {nullPointers.map((pointer) => (
              <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
                {pointer.name} → {nullLabel}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  if (isLinkedList) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const getNodeTarget = (node: PointerDiagramNode) =>
      node.fields.find((field) => field.name === 'next')?.value ||
      getPointerLink(effectiveLinks, node.id, 'next')?.to ||
      nullLabel;
    const startPointer = pointers.find((pointer) =>
      ['front', 'head', 'first'].includes(pointer.name.toLowerCase()),
    );
    const startNode = (startPointer?.to && nodesById.get(startPointer.to)) || nodes[0];
    const chainNodes: PointerDiagramNode[] = [];
    const visitedNodeIds = new Set<string>();
    let cursor: PointerDiagramNode | undefined = startNode;

    while (cursor && !visitedNodeIds.has(cursor.id)) {
      chainNodes.push(cursor);
      visitedNodeIds.add(cursor.id);
      const nextTarget = getNodeTarget(cursor);
      if (!nextTarget || nextTarget === nullLabel || visitedNodeIds.has(nextTarget)) break;
      cursor = nodesById.get(nextTarget);
    }

    const chainNodeIds = new Set(chainNodes.map((node) => node.id));
    const detachedNodes = nodes.filter((node) => !chainNodeIds.has(node.id));
    const chainRows = chainNodes.length > 5 ? chunkPointerRows(chainNodes, 5) : [chainNodes];
    const formatPointerName = (name: string) => {
      if (name === 'curr') return 'cur';
      if (name === 'tail') return 'end';
      return name;
    };

    const renderPointerChips = (node: PointerDiagramNode) => {
      const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
      if (!incomingPointers.length) return <div className="min-h-6" />;
      return (
        <div className="flex min-h-6 flex-wrap justify-center gap-1 pt-1">
          {incomingPointers.map((pointer) => (
            <span
              key={pointer.name}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none shadow-sm',
                pointer.name === 'new'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
                  : pointer.name === 'curr'
                    ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100',
              )}
            >
              {formatPointerName(pointer.name)}
            </span>
          ))}
        </div>
      );
    };

    const renderSinglyNode = (node: PointerDiagramNode) => {
      const itemField = node.label;
      const nextLabel = getNodeTarget(node);
      const nextOutgoing = getPointerLink(effectiveLinks, node.id, 'next');
      const nextIsNull = nextLabel === nullLabel;

      return (
        <div key={node.id} className="space-y-0.5 text-center">
          <div
            className={cn(
              'flex h-11 w-[5.75rem] overflow-hidden rounded-sm border-2 bg-background font-mono shadow-sm',
              node.active && 'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
              node.muted &&
                'border-dashed border-amber-300 bg-amber-50/40 opacity-90 dark:border-amber-900/70 dark:bg-amber-950/20',
              !node.active && !node.muted && 'border-slate-500/80 dark:border-slate-400/70',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2">
              <p className="text-lg font-semibold leading-none text-foreground">
                <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
            <div
              className={cn(
                'flex w-6 shrink-0 items-center justify-center border-l-2 border-inherit',
                nextOutgoing?.active && 'bg-amber-100/80 dark:bg-amber-950/40',
              )}
              aria-label={`next -> ${nextLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  nextIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-amber-500',
                  nextOutgoing?.active && 'h-2.5 w-2.5 bg-amber-600 ring-4 ring-amber-200',
                )}
              />
            </div>
          </div>
          {renderPointerChips(node)}
        </div>
      );
    };

    const renderSinglyConnector = (fromNode: PointerDiagramNode, toNode?: PointerDiagramNode) => {
      if (!toNode) return null;
      const nextTarget = getNodeTarget(fromNode);
      const nextLink = getPointerLink(effectiveLinks, fromNode.id, 'next');
      if (nextTarget !== toNode.id) return <div className="w-5 shrink-0" />;

      return (
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center gap-1 text-amber-600 dark:text-amber-200',
            nextLink?.active && 'text-amber-700 dark:text-amber-100',
          )}
          aria-label={`next -> ${toNode.id}`}
        >
          <span className="h-0.5 flex-1 rounded-full bg-current" />
          <span className="font-mono text-base leading-none">→</span>
        </div>
      );
    };

    const renderDetachedTarget = (node: PointerDiagramNode) => {
      const nextTarget = getNodeTarget(node);
      const targetNode = nextTarget !== nullLabel ? nodesById.get(nextTarget) : undefined;
      if (!targetNode) return null;
      return (
        <div className="flex h-11 items-center gap-1 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-100">
          <span className="h-0.5 w-7 rounded-full bg-current" />
          <span className="text-base leading-none">→</span>
          <span className="rounded-sm border border-amber-300 bg-background px-2 py-1">
            {targetNode.label}
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="space-y-2 pb-1">
          <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50/20 p-2 dark:border-amber-900/50 dark:bg-amber-950/10">
            {chainRows.map((row, rowIndex) => (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-start gap-0">
                  {row.map((node, localIndex) => (
                    <Fragment key={node.id}>
                      {renderSinglyNode(node)}
                      {renderSinglyConnector(node, row[localIndex + 1])}
                    </Fragment>
                  ))}
                </div>
                {rowIndex < chainRows.length - 1 ? (
                  <p className="px-1 text-center font-mono text-[10px] text-muted-foreground">
                    下一行继续到 {chainRows[rowIndex + 1]?.[0]?.label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {detachedNodes.length > 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/25 p-2 dark:border-amber-900/60 dark:bg-amber-950/10">
              <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
                尚未接入 front 的 next 主链
              </p>
              <div className="flex flex-wrap items-start gap-1.5">
                {detachedNodes.map((node) => (
                  <Fragment key={node.id}>
                    {renderSinglyNode(node)}
                    {renderDetachedTarget(node)}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {nullPointers.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {nullPointers.map((pointer) => (
              <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
                {pointer.name} → {nullLabel}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  const renderNodeSegment = (node: PointerDiagramNode, connectorNextNode?: PointerDiagramNode) => {
    const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
    const outgoing = getPointerLink(effectiveLinks, node.id, 'next');
    const prevOutgoing = getPointerLink(effectiveLinks, node.id, 'prev');
    const itemField =
      node.fields.find((field) => ['item', 'value', 'data'].includes(field.name))?.value ||
      node.label;
    const fieldNext = node.fields.find((field) => field.name === 'next')?.value;
    const fieldPrev = node.fields.find((field) => field.name === 'prev')?.value;
    const nextLabel = fieldNext || outgoing?.to || nullLabel;
    const prevLabel = fieldPrev || prevOutgoing?.to || nullLabel;
    const nextNode = connectorNextNode;
    const backLink = nextNode ? getPointerLink(effectiveLinks, nextNode.id, 'prev') : undefined;
    const shouldRenderConnector = isDoublyLinkedList
      ? Boolean(nextNode)
      : Boolean(nextNode || outgoing);

    return (
      <div
        key={node.id}
        className={cn('flex items-center', isDoublyLinkedList ? 'gap-2' : 'gap-3')}
      >
        <div className="space-y-1 text-center">
          <div className="min-h-6">
            {incomingPointers.map((pointer) => (
              <span
                key={pointer.name}
                className={cn(
                  'mr-1 rounded-md px-2 py-0.5 font-mono text-xs',
                  pointer.name === 'new'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100'
                    : pointer.name === 'curr'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-100'
                      : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-100',
                )}
              >
                {pointer.name}
              </span>
            ))}
          </div>
          <div
            className={cn(
              'overflow-hidden rounded-lg border text-left',
              isDoublyLinkedList ? 'w-36' : 'min-w-28',
              node.active
                ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30'
                : node.muted
                  ? 'border-dashed border-border/60 bg-muted/20 opacity-75'
                  : 'border-border/70 bg-background',
            )}
          >
            {isLinkedList ? (
              <div className="font-mono text-xs">
                {isDoublyLinkedList ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-2 py-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {node.id}
                      </span>
                      <span className="rounded-md bg-background px-2 py-0.5 text-center text-sm font-semibold text-foreground">
                        <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                    <div className="grid grid-cols-2 bg-background text-[11px]">
                      <span
                        className={cn(
                          'min-w-0 border-r border-border/70 px-2 py-1.5',
                          prevLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          prevOutgoing?.active &&
                            'bg-violet-50 font-semibold text-violet-800 dark:bg-violet-950/30 dark:text-violet-100',
                        )}
                      >
                        <span className="mr-1 text-[10px] uppercase text-muted-foreground">
                          prev
                        </span>
                        <InlineText text={prevLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                      <span
                        className={cn(
                          'min-w-0 px-2 py-1.5',
                          nextLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          outgoing?.active &&
                            'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
                        )}
                      >
                        <span className="mr-1 text-[10px] uppercase text-muted-foreground">
                          next
                        </span>
                        <InlineText text={nextLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[minmax(5rem,1fr)_4.25rem] border-b border-border/70 bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                      <span className="border-r border-border/70 px-2 py-1">item</span>
                      <span className="px-2 py-1 text-center">next</span>
                    </div>
                    <div className="grid grid-cols-[minmax(5rem,1fr)_4.25rem] bg-background">
                      <span className="border-r border-border/70 px-2 py-2 text-foreground">
                        <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                      <span
                        className={cn(
                          'px-2 py-2 text-center',
                          nextLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          outgoing?.active &&
                            'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
                        )}
                      >
                        <InlineText text={nextLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                    <p className="border-t border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                      #{node.id}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-3">
                <p className="font-mono text-sm font-semibold text-foreground">
                  <InlineText text={node.label} renderInlineMathHtml={renderInlineMathHtml} />
                </p>
                <div className="mt-2">
                  <KeyValueChips items={node.fields} renderInlineMathHtml={renderInlineMathHtml} />
                </div>
              </div>
            )}
          </div>
        </div>
        {shouldRenderConnector ? (
          <PointerConnector
            node={node}
            nextNode={nextNode}
            outgoing={outgoing}
            backLink={backLink}
            isLinkedList={isLinkedList}
            isDoublyLinkedList={isDoublyLinkedList}
            nullLabel={nullLabel}
          />
        ) : null}
      </div>
    );
  };

  const renderRowBridge = (fromNode: PointerDiagramNode, toNode: PointerDiagramNode) => {
    const outgoing = getPointerLink(effectiveLinks, fromNode.id, 'next');
    const backLink = getPointerLink(effectiveLinks, toNode.id, 'prev');
    const active = outgoing?.active || backLink?.active;
    return (
      <div className="flex justify-center py-0.5">
        <span
          className={cn(
            'rounded-full border px-3 py-1 font-mono text-[11px] font-semibold',
            active
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
              : 'border-emerald-200 bg-background/80 text-emerald-800 dark:border-emerald-900/70 dark:bg-background/50 dark:text-emerald-100',
          )}
        >
          {fromNode.label} ⇄ {toNode.label}
        </span>
      </div>
    );
  };

  return (
    <>
      {isDoublyLinkedList ? (
        <div className="space-y-2 pb-1">
          {pointerRows.map((row, rowIndex) => {
            const nextRow = pointerRows[rowIndex + 1];
            const lastNode = row[row.length - 1];
            const nextRowFirstNode = nextRow?.[0];

            return (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {row.map((node, localIndex) => renderNodeSegment(node, row[localIndex + 1]))}
                </div>
                {lastNode && nextRowFirstNode ? renderRowBridge(lastNode, nextRowFirstNode) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-center gap-3">
            {nodes.map((node, index) => renderNodeSegment(node, nodes[index + 1]))}
          </div>
        </div>
      )}
      {nullPointers.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {nullPointers.map((pointer) => (
            <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
              {pointer.name} → {nullLabel}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function PointerDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<PointerDiagramBlock>) {
  const isLinkedList = block.kind === 'linked_list';
  const blockIsDoublyLinkedList =
    isLinkedList &&
    (block.variant === 'doubly' || hasDoublyLinkedListShape(block.nodes, block.links));
  const nullLabel = block.nullLabel || 'None';
  const pointerSteps = block.steps ?? EMPTY_POINTER_STEPS;
  const totalSteps = pointerSteps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? pointerSteps[safeStepIndex] : undefined;
  const stepGroups = useMemo(
    () => getPointerStepGroups(pointerSteps, language),
    [pointerSteps, language],
  );

  if (isLinkedList && currentStep) {
    const stepNodes = currentStep.nodes.length ? currentStep.nodes : block.nodes;
    const stepPointers = currentStep.pointers.length ? currentStep.pointers : block.pointers;
    const stepLinks = currentStep.links.length ? currentStep.links : block.links;
    const stepIsDoublyLinkedList =
      blockIsDoublyLinkedList || hasDoublyLinkedListShape(stepNodes, stepLinks);
    const canGoBack = safeStepIndex > 0;
    const canGoForward = safeStepIndex < totalSteps - 1;

    return (
      <div className="space-y-2 rounded-lg border border-emerald-200/70 bg-emerald-50/35 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/10">
        <div className="flex flex-wrap items-center gap-2">
          <BlockKicker>
            {stepIsDoublyLinkedList ? 'doubly linked list trace' : 'linked list trace'}
          </BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={
              stepIsDoublyLinkedList
                ? language === 'en-US'
                  ? 'Doubly Linked List Trace'
                  : '双向链表逐步追踪'
                : language === 'en-US'
                  ? 'Linked List Trace'
                  : '链表逐步追踪'
            }
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
        {block.operation ? (
          <p className="rounded-lg border border-emerald-200 bg-background/80 px-2 py-1 text-xs leading-5 text-muted-foreground dark:border-emerald-900/60 dark:bg-background/60">
            <InlineText text={block.operation} renderInlineMathHtml={renderInlineMathHtml} />
          </p>
        ) : null}
        <div className="grid gap-1.5 lg:grid-cols-[minmax(0,0.82fr)_minmax(260px,1.18fr)]">
          <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 dark:border-emerald-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-200">
              {language === 'en-US' ? 'Current Step' : '当前步骤'}
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-foreground">
              <InlineText
                text={currentStep.title || (language === 'en-US' ? 'Pointer update' : '指针更新')}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
            {currentStep.operation ? (
              <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs leading-5 text-slate-100">
                {currentStep.operation}
              </pre>
            ) : null}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 text-xs leading-5 text-foreground dark:border-emerald-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-200">
              {language === 'en-US' ? 'Why it matters' : '为什么这一步重要'}
            </p>
            <p className="mt-0.5">
              <InlineText
                text={currentStep.explanation || block.caption || ''}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 dark:border-emerald-900/60 dark:bg-background/60">
          <PointerDiagramCanvas
            nodes={stepNodes}
            pointers={stepPointers}
            links={stepLinks}
            isLinkedList={isLinkedList}
            isDoublyLinkedList={stepIsDoublyLinkedList}
            nullLabel={nullLabel}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4',
        isLinkedList
          ? 'border-emerald-200/70 bg-emerald-50/35 dark:border-emerald-900/50 dark:bg-emerald-950/10'
          : 'border-border/70 bg-muted/20',
      )}
    >
      <div className="space-y-1">
        <BlockKicker>{isLinkedList ? 'linked list' : 'pointers'}</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={
            isLinkedList
              ? language === 'en-US'
                ? 'Linked List'
                : '链表结构'
              : language === 'en-US'
                ? 'Pointer Diagram'
                : '指针图'
          }
          renderInlineMathHtml={renderInlineMathHtml}
        />
        {block.operation ? (
          <p className="text-xs text-muted-foreground">
            <InlineText text={block.operation} renderInlineMathHtml={renderInlineMathHtml} />
          </p>
        ) : null}
      </div>
      <PointerDiagramCanvas
        nodes={block.nodes}
        pointers={block.pointers}
        links={block.links}
        isLinkedList={isLinkedList}
        isDoublyLinkedList={blockIsDoublyLinkedList}
        nullLabel={nullLabel}
        renderInlineMathHtml={renderInlineMathHtml}
      />
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

function getTreeStepGroups(
  steps: readonly TreeDiagramBlock['steps'][number][],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function getDirectionLabel(
  direction: TreeDiagramBlock['steps'][number]['direction'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (direction === 'left') return 'go left';
    if (direction === 'right') return 'go right';
    if (direction === 'visit') return 'visit';
    if (direction === 'backtrack') return 'backtrack';
    if (direction === 'aggregate') return 'aggregate';
    if (direction === 'found') return 'found';
    if (direction === 'missing') return 'missing';
    if (direction === 'done') return 'done';
    return 'step';
  }
  if (direction === 'left') return '去左子树';
  if (direction === 'right') return '去右子树';
  if (direction === 'visit') return '访问节点';
  if (direction === 'backtrack') return '回到父节点';
  if (direction === 'aggregate') return '汇总结果';
  if (direction === 'found') return '命中';
  if (direction === 'missing') return '未找到';
  if (direction === 'done') return '完成';
  return '步骤';
}

function getTreeNodeChildren(node: TreeDiagramNode): string[] {
  const children = node.children || [];
  if (children.length) return children;
  return [node.left, node.right].filter((child): child is string => Boolean(child));
}

function getTreeNodeChildSlots(
  node: TreeDiagramNode,
  isBst: boolean,
  language: NotebookContentDocument['language'],
): Array<{ id: string; label: string }> {
  const children = node.children || [];
  if (children.length) {
    return children.map((id, index) => ({
      id,
      label: children.length === 1 ? (language === 'en-US' ? 'child' : '子') : `#${index + 1}`,
    }));
  }
  return [
    node.left
      ? { id: node.left, label: isBst ? 'L' : language === 'en-US' ? 'child 1' : '子节点 1' }
      : null,
    node.right
      ? { id: node.right, label: isBst ? 'R' : language === 'en-US' ? 'child 2' : '子节点 2' }
      : null,
  ].filter((child): child is { id: string; label: string } => Boolean(child));
}

function getTreeNodeWidth(label: string) {
  return Math.max(72, Math.min(128, label.length * 9 + 34));
}

function treeNodeToneClass({
  isBst,
  isCurrent,
  isPath,
  isActive,
  muted,
}: {
  isBst: boolean;
  isCurrent: boolean;
  isPath: boolean;
  isActive: boolean;
  muted?: boolean;
}) {
  if (isCurrent) {
    return 'border-amber-500 bg-amber-100 text-amber-950 shadow-[0_0_0_4px_rgba(245,158,11,0.16)] dark:bg-amber-950/40 dark:text-amber-50';
  }
  if (isPath || isActive) {
    return isBst
      ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-[0_0_0_3px_rgba(245,158,11,0.10)] dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-50'
      : 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[0_0_0_3px_rgba(6,182,212,0.10)] dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-50';
  }
  if (muted) return 'border-border/50 bg-muted/30 text-muted-foreground';
  return 'border-slate-300 bg-white text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50';
}

function treeEdgeColor(active: boolean, isBst: boolean) {
  if (active) return isBst ? '#d97706' : '#0891b2';
  return '#94a3b8';
}

function treeLabelToneClass(active: boolean, isBst: boolean) {
  if (active) {
    return isBst
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'
      : 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-100';
  }
  return 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
}

function buildTreeLayout({
  nodes,
  rootId,
  path,
  isBst,
  language,
}: {
  nodes: readonly TreeDiagramNode[];
  rootId: string | undefined;
  path: Set<string>;
  isBst: boolean;
  language: NotebookContentDocument['language'];
}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const layoutNode = (
    nodeId: string | undefined,
    depth: number,
    visited = new Set<string>(),
  ): {
    width: number;
    rootX: number;
    nodes: TreeLayoutNode[];
    edges: TreeLayoutEdge[];
  } => {
    const node = nodeId ? nodeMap.get(nodeId) : undefined;
    if (!node || !nodeId || visited.has(nodeId)) {
      return { width: 80, rootX: 40, nodes: [], edges: [] };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const nodeWidth = getTreeNodeWidth(node.label);
    const childSlots = getTreeNodeChildSlots(node, isBst, language);
    const childLayouts = childSlots.map((child) => ({
      slot: child,
      layout: layoutNode(child.id, depth + 1, nextVisited),
    }));
    const childGap = childSlots.length > 2 ? TREE_SIBLING_GAP - 8 : TREE_SIBLING_GAP + 10;
    const childrenWidth = childLayouts.length
      ? childLayouts.reduce((sum, child) => sum + child.layout.width, 0) +
        childGap * Math.max(0, childLayouts.length - 1)
      : 0;
    const width = Math.max(nodeWidth, childrenWidth);
    const rootX = width / 2;
    const y = depth * (TREE_NODE_HEIGHT + TREE_LEVEL_GAP) + TREE_NODE_HEIGHT / 2;
    const positionedNodes: TreeLayoutNode[] = [
      { id: node.id, node, x: rootX, y, width: nodeWidth },
    ];
    const edges: TreeLayoutEdge[] = [];

    let childOffset = (width - childrenWidth) / 2;
    for (const child of childLayouts) {
      const childRootX = childOffset + child.layout.rootX;
      const childRootY = (depth + 1) * (TREE_NODE_HEIGHT + TREE_LEVEL_GAP) + TREE_NODE_HEIGHT / 2;
      const active = path.has(node.id) && path.has(child.slot.id);
      edges.push({
        id: `${node.id}-${child.slot.id}`,
        fromX: rootX,
        fromY: y + TREE_NODE_HEIGHT / 2,
        toX: childRootX,
        toY: childRootY - TREE_NODE_HEIGHT / 2,
        label: child.slot.label,
        active,
      });
      positionedNodes.push(
        ...child.layout.nodes.map((childNode) => ({
          ...childNode,
          x: childNode.x + childOffset,
        })),
      );
      edges.push(
        ...child.layout.edges.map((edge) => ({
          ...edge,
          fromX: edge.fromX + childOffset,
          toX: edge.toX + childOffset,
        })),
      );
      childOffset += child.layout.width + childGap;
    }

    return { width, rootX, nodes: positionedNodes, edges };
  };

  const layout = layoutNode(rootId, 0);
  const positionedNodes = layout.nodes.map((node) => ({
    ...node,
    x: node.x + TREE_CANVAS_PADDING_X,
    y: node.y + TREE_CANVAS_PADDING_Y,
  }));
  const edges = layout.edges.map((edge) => ({
    ...edge,
    fromX: edge.fromX + TREE_CANVAS_PADDING_X,
    toX: edge.toX + TREE_CANVAS_PADDING_X,
    fromY: edge.fromY + TREE_CANVAS_PADDING_Y,
    toY: edge.toY + TREE_CANVAS_PADDING_Y,
  }));
  const maxY = positionedNodes.reduce((max, node) => Math.max(max, node.y), 0);

  return {
    nodes: positionedNodes,
    edges,
    width: Math.max(320, layout.width + TREE_CANVAS_PADDING_X * 2),
    height: Math.max(190, maxY + TREE_NODE_HEIGHT / 2 + TREE_CANVAS_PADDING_Y),
  };
}

function TreeCanvas({
  nodes,
  rootId,
  path,
  currentId,
  isBst,
  honorNodeActive = true,
  language,
  renderInlineMathHtml,
}: {
  nodes: readonly TreeDiagramNode[];
  rootId: string | undefined;
  path: Set<string>;
  currentId?: string;
  isBst: boolean;
  honorNodeActive?: boolean;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const layout = useMemo(
    () => buildTreeLayout({ nodes, rootId, path, isBst, language }),
    [isBst, language, nodes, path, rootId],
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateWidth = () => {
      setViewportWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const availableWidth = Math.max(0, viewportWidth - 4);
  const scale = availableWidth > 0 ? Math.min(1, availableWidth / layout.width) : 1;
  const scaledWidth = layout.width * scale;
  const scaledHeight = layout.height * scale;

  return (
    <div ref={viewportRef} className="w-full overflow-hidden">
      <div
        className="relative mx-auto"
        style={{ width: scaledWidth || layout.width, height: scaledHeight || layout.height }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg
            className="absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.edges.map((edge) => {
              const midY = (edge.fromY + edge.toY) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`}
                  fill="none"
                  stroke={treeEdgeColor(edge.active, isBst)}
                  strokeLinecap="round"
                  strokeWidth={edge.active ? 4 : 2.5}
                  opacity={edge.active ? 1 : 0.88}
                />
              );
            })}
          </svg>
          {layout.edges.map((edge) => {
            const labelX = (edge.fromX + edge.toX) / 2;
            const labelY = (edge.fromY + edge.toY) / 2;
            return (
              <span
                key={`${edge.id}-label`}
                className={cn(
                  'absolute z-10 flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-1.5 font-mono text-[10px] font-semibold shadow-sm',
                  treeLabelToneClass(edge.active, isBst),
                )}
                style={{ left: labelX, top: labelY }}
              >
                {edge.label}
              </span>
            );
          })}
          {layout.nodes.map((layoutNode) => {
            const isCurrent = currentId === layoutNode.id;
            const isPath = path.has(layoutNode.id);
            return (
              <div
                key={layoutNode.id}
                className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: layoutNode.x, top: layoutNode.y, width: layoutNode.width }}
              >
                <div
                  className={cn(
                    'flex h-10 w-full items-center justify-center rounded-lg border-2 px-3 text-center font-mono text-sm font-semibold transition-colors',
                    treeNodeToneClass({
                      isBst,
                      isCurrent,
                      isPath,
                      isActive: honorNodeActive && Boolean(layoutNode.node.active),
                      muted: layoutNode.node.muted,
                    }),
                  )}
                >
                  <InlineText
                    text={layoutNode.node.label}
                    renderInlineMathHtml={renderInlineMathHtml}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TreeDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<TreeDiagramBlock>) {
  const isBst = block.kind === 'bst';
  const childIds = new Set(block.nodes.flatMap(getTreeNodeChildren));
  const rootId =
    block.rootId || block.nodes.find((node) => !childIds.has(node.id))?.id || block.nodes[0]?.id;
  const treeSteps = block.steps ?? EMPTY_TREE_STEPS;
  const totalSteps = treeSteps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? treeSteps[safeStepIndex] : undefined;
  const activePath = new Set(currentStep?.path.length ? currentStep.path : block.path);
  const currentId = currentStep?.current || (totalSteps ? undefined : undefined);
  const stepGroups = useMemo(() => getTreeStepGroups(treeSteps, language), [treeSteps, language]);
  const nodeLabelById = useMemo(
    () => new Map(block.nodes.map((node) => [node.id, node.label])),
    [block.nodes],
  );
  const formatTreePath = (path: readonly string[]) =>
    path.map((nodeId) => nodeLabelById.get(nodeId) || nodeId).join(' → ');

  if (currentStep) {
    const canGoBack = safeStepIndex > 0;
    const canGoForward = safeStepIndex < totalSteps - 1;
    const accentClasses = isBst
      ? {
          shell: 'border-amber-200/80 bg-amber-50/35 dark:border-amber-900/60 dark:bg-amber-950/10',
          panel: 'border-amber-200 bg-background/85 dark:border-amber-900/60 dark:bg-background/60',
          label: 'text-amber-700 dark:text-amber-200',
        }
      : {
          shell: 'border-cyan-200/80 bg-cyan-50/35 dark:border-cyan-900/60 dark:bg-cyan-950/10',
          panel: 'border-cyan-200 bg-background/85 dark:border-cyan-900/60 dark:bg-background/60',
          label: 'text-cyan-700 dark:text-cyan-200',
        };

    return (
      <div className={cn('space-y-2 rounded-lg border p-2', accentClasses.shell)}>
        <div className="flex flex-wrap items-center gap-2">
          <BlockKicker>{isBst ? 'bst trace' : 'tree trace'}</BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={
              isBst
                ? language === 'en-US'
                  ? 'BST Search Trace'
                  : 'BST 搜索追踪'
                : language === 'en-US'
                  ? 'Tree Traversal Trace'
                  : '树遍历追踪'
            }
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
        <div className="grid gap-1.5 lg:grid-cols-[minmax(0,0.75fr)_minmax(260px,1.25fr)]">
          <div className={cn('rounded-lg border p-2', accentClasses.panel)}>
            <p
              className={cn(
                'text-[10px] font-semibold uppercase tracking-[0.1em]',
                accentClasses.label,
              )}
            >
              {isBst
                ? language === 'en-US'
                  ? 'Current comparison'
                  : '当前比较'
                : language === 'en-US'
                  ? 'Current action'
                  : '当前动作'}
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-foreground">
              <InlineText
                text={currentStep.title || getDirectionLabel(currentStep.direction, language)}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
            {currentStep.comparison ? (
              <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs leading-5 text-slate-100">
                {currentStep.comparison}
              </pre>
            ) : null}
          </div>
          <div
            className={cn(
              'rounded-lg border p-2 text-xs leading-5 text-foreground',
              accentClasses.panel,
            )}
          >
            <div className="grid gap-1.5 sm:grid-cols-3">
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {isBst
                    ? language === 'en-US'
                      ? 'Target'
                      : '目标'
                    : language === 'en-US'
                      ? 'Current'
                      : '当前节点'}
                </p>
                <p className="mt-0.5 font-mono font-semibold">
                  {isBst
                    ? block.target || '—'
                    : nodeLabelById.get(currentStep.current || '') || '—'}
                </p>
              </div>
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {language === 'en-US' ? 'Path' : '路径'}
                </p>
                <p className="mt-0.5 font-mono font-semibold">
                  {formatTreePath(currentStep.path.length ? currentStep.path : block.path) || '—'}
                </p>
              </div>
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {isBst
                    ? language === 'en-US'
                      ? 'Next'
                      : '下一步'
                    : language === 'en-US'
                      ? 'State'
                      : '状态'}
                </p>
                <p className="mt-0.5 font-semibold">
                  {getDirectionLabel(currentStep.direction, language)}
                </p>
              </div>
            </div>
            {currentStep.result ? (
              <p className="mt-1">
                <InlineText text={currentStep.result} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background/80 p-2.5">
          <TreeCanvas
            nodes={block.nodes}
            rootId={rootId}
            path={activePath}
            currentId={currentId}
            isBst={isBst}
            honorNodeActive={false}
            language={language}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
        {block.invariant ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs leading-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
            <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4',
        isBst
          ? 'border-amber-200/80 bg-amber-50/35 dark:border-amber-900/60 dark:bg-amber-950/10'
          : 'border-border/70 bg-muted/20',
      )}
    >
      <div className="space-y-1">
        <BlockKicker>{isBst ? 'bst' : 'tree'}</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={
            isBst
              ? language === 'en-US'
                ? 'Binary Search Tree'
                : '二叉搜索树'
              : language === 'en-US'
                ? 'Tree Diagram'
                : '树结构图'
          }
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      {isBst && (block.target || block.decision || block.path.length > 0) ? (
        <div className="grid gap-2 rounded-lg border border-amber-200/70 bg-background/80 p-3 text-xs text-muted-foreground md:grid-cols-3 dark:border-amber-900/50">
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Target' : '目标'}
            </span>
            <p className="mt-1 font-mono">
              <InlineText
                text={block.target || (language === 'en-US' ? 'not set' : '未设置')}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Search path' : '搜索路径'}
            </span>
            <p className="mt-1 font-mono">{block.path.length ? formatTreePath(block.path) : '—'}</p>
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Decision' : '下一步判断'}
            </span>
            <p className="mt-1">
              <InlineText
                text={
                  block.decision ||
                  (language === 'en-US'
                    ? 'Compare then choose left/right.'
                    : '比较后选择左/右子树。')
                }
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border/60 bg-background/80 p-4">
        <TreeCanvas
          nodes={block.nodes}
          rootId={rootId}
          path={activePath}
          isBst={isBst}
          honorNodeActive
          language={language}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      {block.invariant ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
          <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
      ) : null}
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

const GRAPH_CANVAS_WIDTH = 760;
const GRAPH_CANVAS_HEIGHT = 330;
const GRAPH_NODE_RADIUS = 24;
const GRAPH_CANVAS_PADDING = 54;

function graphEdgeKey(edge: GraphTraceEdge, index: number) {
  return edge.id || `${edge.from}->${edge.to}#${index}`;
}

function graphPairKey(from: string, to: string) {
  return `${from}->${to}`;
}

function graphPairKeyLoose(from: string, to: string) {
  return `${from}-${to}`;
}

function buildGraphLayout(nodes: readonly GraphTraceNode[]): GraphLayoutNode[] {
  const allExplicit = nodes.every(
    (node) => typeof node.x === 'number' && typeof node.y === 'number',
  );

  if (allExplicit) {
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    return nodes.map((node) => ({
      ...node,
      x:
        GRAPH_CANVAS_PADDING +
        (((node.x ?? 0) - minX) / spanX) * (GRAPH_CANVAS_WIDTH - GRAPH_CANVAS_PADDING * 2),
      y:
        GRAPH_CANVAS_PADDING +
        (((node.y ?? 0) - minY) / spanY) * (GRAPH_CANVAS_HEIGHT - GRAPH_CANVAS_PADDING * 2),
    }));
  }

  const centerX = GRAPH_CANVAS_WIDTH / 2;
  const centerY = GRAPH_CANVAS_HEIGHT / 2;
  const radiusX = GRAPH_CANVAS_WIDTH / 2 - GRAPH_CANVAS_PADDING;
  const radiusY = GRAPH_CANVAS_HEIGHT / 2 - GRAPH_CANVAS_PADDING;
  return nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    return {
      ...node,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function edgeTouchesCurrentEdge(
  edge: GraphTraceEdge,
  currentEdge: readonly [string, string] | undefined,
  directed: boolean,
) {
  if (!currentEdge) return false;
  const [from, to] = currentEdge;
  if (edge.from === from && edge.to === to) return true;
  return !directed && edge.from === to && edge.to === from;
}

function graphStepGroups(
  steps: readonly GraphTraceStep[],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function graphAlgorithmLabel(
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (algorithm === 'dfs_stack') return 'DFS with stack';
    if (algorithm === 'dfs_recursive') return 'Recursive DFS';
    return 'BFS';
  }
  if (algorithm === 'dfs_stack') return 'DFS：stack';
  if (algorithm === 'dfs_recursive') return '递归 DFS';
  return 'BFS：queue';
}

function graphFrontierKind(
  algorithm: GraphTraceBlock['algorithm'],
): 'queue' | 'stack' | 'call_stack' {
  if (algorithm === 'dfs_recursive') return 'call_stack';
  if (algorithm === 'dfs_stack') return 'stack';
  return 'queue';
}

function graphFrontierLabel(
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  const kind = graphFrontierKind(algorithm);
  if (language === 'en-US') {
    if (kind === 'queue') return 'Queue';
    if (kind === 'call_stack') return 'Call stack';
    return 'Stack';
  }
  if (kind === 'queue') return 'Queue 队列';
  if (kind === 'call_stack') return 'Call Stack 调用栈';
  return 'Stack 栈';
}

function graphActionLabel(
  action: GraphTraceStep['action'],
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (action === 'enqueue') return 'enqueue';
    if (action === 'dequeue') return 'dequeue';
    if (action === 'push') return 'push';
    if (action === 'pop') return 'pop';
    if (action === 'visit') return 'visit';
    if (action === 'check_edge') return 'check edge';
    if (action === 'skip') return 'skip';
    if (action === 'done') return 'done';
    return graphAlgorithmLabel(algorithm, language);
  }
  if (action === 'enqueue') return '入队';
  if (action === 'dequeue') return '出队';
  if (action === 'push') return '压栈';
  if (action === 'pop') return '弹栈';
  if (action === 'visit') return '访问';
  if (action === 'check_edge') return '检查边';
  if (action === 'skip') return '跳过';
  if (action === 'done') return '完成';
  return graphAlgorithmLabel(algorithm, language);
}

function buildAdjacencyRows(block: GraphTraceBlock) {
  const rows = new Map(block.nodes.map((node) => [node.id, [] as string[]]));
  block.edges.forEach((edge) => {
    rows.get(edge.from)?.push(edge.to);
    if (!(edge.directed ?? block.directed)) {
      rows.get(edge.to)?.push(edge.from);
    }
  });
  return block.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    neighbors: rows.get(node.id) || [],
  }));
}

function GraphCanvas({ block, step }: { block: GraphTraceBlock; step?: GraphTraceStep }) {
  const layoutNodes = useMemo(() => buildGraphLayout(block.nodes), [block.nodes]);
  const nodeMap = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes]);
  const frontier = new Set(step?.frontier || []);
  const visited = new Set(step?.visited || []);
  const activeEdges = new Set(step?.activeEdges || []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/30">
      <svg
        className="h-[285px] w-full overflow-visible"
        viewBox={`0 0 ${GRAPH_CANVAS_WIDTH} ${GRAPH_CANVAS_HEIGHT}`}
        role="img"
        aria-label={block.title || graphAlgorithmLabel(block.algorithm, 'zh-CN')}
      >
        <defs>
          <marker
            id="graph-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
          </marker>
          <marker
            id="graph-arrow-active"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#0891b2" />
          </marker>
        </defs>
        {block.edges.map((edge, index) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const directed = edge.directed ?? block.directed;
          const edgeId = graphEdgeKey(edge, index);
          const isCurrent = edgeTouchesCurrentEdge(edge, step?.currentEdge, directed);
          const isActive =
            edge.active ||
            isCurrent ||
            activeEdges.has(edgeId) ||
            activeEdges.has(graphPairKey(edge.from, edge.to)) ||
            activeEdges.has(graphPairKeyLoose(edge.from, edge.to));
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const startX = from.x + (dx / length) * (GRAPH_NODE_RADIUS + 2);
          const startY = from.y + (dy / length) * (GRAPH_NODE_RADIUS + 2);
          const endX = to.x - (dx / length) * (GRAPH_NODE_RADIUS + 7);
          const endY = to.y - (dy / length) * (GRAPH_NODE_RADIUS + 7);
          const labelX = (startX + endX) / 2;
          const labelY = (startY + endY) / 2;

          return (
            <g key={edgeId}>
              <line
                x1={startX}
                x2={endX}
                y1={startY}
                y2={endY}
                stroke={isActive ? '#0891b2' : '#94a3b8'}
                strokeLinecap="round"
                strokeWidth={isActive ? 5 : 3}
                opacity={edge.muted ? 0.35 : 0.9}
                markerEnd={
                  directed ? `url(#${isActive ? 'graph-arrow-active' : 'graph-arrow'})` : undefined
                }
              />
              {edge.label ? (
                <g transform={`translate(${labelX} ${labelY})`}>
                  <rect
                    x="-16"
                    y="-11"
                    width="32"
                    height="22"
                    rx="11"
                    fill={isActive ? '#ecfeff' : '#f8fafc'}
                    stroke={isActive ? '#22d3ee' : '#cbd5e1'}
                  />
                  <text
                    dominantBaseline="middle"
                    fill={isActive ? '#0e7490' : '#64748b'}
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
        {layoutNodes.map((node) => {
          const isCurrent = step?.current === node.id;
          const isFrontier = frontier.has(node.id);
          const isVisited = visited.has(node.id);
          const fill = isCurrent
            ? '#fef3c7'
            : isFrontier
              ? '#cffafe'
              : isVisited
                ? '#dcfce7'
                : '#ffffff';
          const stroke = isCurrent
            ? '#f59e0b'
            : isFrontier
              ? '#06b6d4'
              : isVisited
                ? '#22c55e'
                : '#94a3b8';

          return (
            <g key={node.id} opacity={node.muted ? 0.42 : 1}>
              <circle
                cx={node.x}
                cy={node.y}
                fill={fill}
                r={GRAPH_NODE_RADIUS}
                stroke={stroke}
                strokeWidth={isCurrent ? 4 : isFrontier || isVisited ? 3 : 2.5}
              />
              <text
                dominantBaseline="middle"
                fill="#0f172a"
                fontSize="18"
                fontWeight="800"
                textAnchor="middle"
                x={node.x}
                y={node.y}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
          current
        </span>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-cyan-800">
          frontier
        </span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800">
          visited
        </span>
      </div>
    </div>
  );
}

function GraphChipRow({
  title,
  values,
  nodeLabels,
  emptyLabel,
  accent = 'slate',
}: {
  title: string;
  values: readonly string[];
  nodeLabels: Map<string, string>;
  emptyLabel: string;
  accent?: 'slate' | 'cyan' | 'emerald' | 'amber' | 'violet';
}) {
  const accentClasses = {
    slate:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100',
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
    amber:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
    violet:
      'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100',
  } as const;

  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-1.5 flex min-h-8 flex-wrap items-center gap-1.5">
        {values.length ? (
          values.map((value, index) => (
            <span
              key={`${title}-${value}-${index}`}
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs font-semibold',
                accentClasses[accent],
              )}
            >
              {nodeLabels.get(value) || value}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function GraphTraceBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<GraphTraceBlock>) {
  const steps = block.steps ?? EMPTY_GRAPH_STEPS;
  const totalSteps = steps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? steps[safeStepIndex] : undefined;
  const canGoBack = safeStepIndex > 0;
  const canGoForward = safeStepIndex < totalSteps - 1;
  const groups = useMemo(() => graphStepGroups(steps, language), [language, steps]);
  const nodeLabels = useMemo(
    () => new Map(block.nodes.map((node) => [node.id, node.label])),
    [block.nodes],
  );
  const adjacencyRows = useMemo(() => buildAdjacencyRows(block), [block]);
  const frontierKind = graphFrontierKind(block.algorithm);
  const currentLabel = currentStep?.current
    ? nodeLabels.get(currentStep.current) || currentStep.current
    : block.startId
      ? nodeLabels.get(block.startId) || block.startId
      : '—';

  return (
    <div className="space-y-2 rounded-lg border border-sky-200/80 bg-sky-50/35 p-2 dark:border-sky-900/60 dark:bg-sky-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <BlockKicker>graph trace</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={graphAlgorithmLabel(block.algorithm, language)}
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceStepNavigator
          current={safeStepIndex}
          total={totalSteps}
          groups={groups}
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
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <GraphCanvas block={block} step={currentStep} />
        <div className="grid gap-2">
          <div className="rounded-lg border border-sky-200 bg-background/85 p-2 dark:border-sky-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-200">
              {language === 'en-US' ? 'Current action' : '当前动作'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                {graphActionLabel(currentStep?.action, block.algorithm, language)}
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {currentLabel}
              </span>
            </div>
            {currentStep?.explanation ? (
              <p className="mt-2 text-xs leading-5 text-foreground">
                <InlineText
                  text={currentStep.explanation}
                  renderInlineMathHtml={renderInlineMathHtml}
                />
              </p>
            ) : null}
            {currentStep?.result ? (
              <p className="mt-1 rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs leading-5 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                <InlineText text={currentStep.result} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            ) : null}
          </div>
          <GraphChipRow
            title={graphFrontierLabel(block.algorithm, language)}
            values={currentStep?.frontier || []}
            nodeLabels={nodeLabels}
            emptyLabel={frontierKind === 'queue' ? 'empty queue' : 'empty stack'}
            accent={frontierKind === 'queue' ? 'cyan' : 'violet'}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <GraphChipRow
              title={language === 'en-US' ? 'Visited' : 'Visited 已见过'}
              values={currentStep?.visited || []}
              nodeLabels={nodeLabels}
              emptyLabel="{}"
              accent="emerald"
            />
            <GraphChipRow
              title={language === 'en-US' ? 'Order' : '访问顺序'}
              values={currentStep?.order || []}
              nodeLabels={nodeLabels}
              emptyLabel="—"
              accent="amber"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
        <div className="rounded-lg border border-border/70 bg-background/80 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            adjacency list
          </p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {adjacencyRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs"
              >
                <span className="font-mono font-semibold text-foreground">{row.label}</span>
                <span className="text-muted-foreground">:</span>
                <span className="font-mono text-muted-foreground">
                  {row.neighbors.map((id) => nodeLabels.get(id) || id).join(', ') || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 p-2 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-foreground">{language === 'en-US' ? 'Rule' : '规则'}</p>
          <p className="mt-1">
            {frontierKind === 'queue'
              ? language === 'en-US'
                ? 'BFS dequeues from the front, then enqueues unseen neighbors.'
                : 'BFS 从队首取出节点，再把未访问邻居加入队尾。'
              : language === 'en-US'
                ? 'DFS follows the newest pending node first.'
                : 'DFS 优先处理最新加入的待访问节点。'}
          </p>
        </div>
      </div>
      {block.invariant ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs leading-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
          <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
      ) : null}
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}

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
