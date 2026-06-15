'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const INDENT = '    ';
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);
const PYTHON_BUILTINS = new Set([
  'bool',
  'dict',
  'enumerate',
  'float',
  'int',
  'len',
  'list',
  'max',
  'min',
  'print',
  'range',
  'set',
  'str',
  'sum',
  'tuple',
]);
const TOKEN_CLASS = {
  builtin: 'text-sky-700',
  comment: 'text-slate-500 italic',
  decorator: 'text-cyan-700',
  function: 'text-amber-700',
  keyword: 'text-fuchsia-700',
  number: 'text-orange-700',
  operator: 'text-slate-600',
  string: 'text-emerald-700',
} as const;

function lineNumbersFor(value: string) {
  return Array.from({ length: Math.max(1, value.split('\n').length) }, (_, index) => index + 1);
}

function getLineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextLineBreak = value.indexOf('\n', end);
  return {
    lineStart,
    lineEnd: nextLineBreak === -1 ? value.length : nextLineBreak,
  };
}

function unindentLine(line: string) {
  if (line.startsWith('\t')) return line.slice(1);
  const leadingSpaces = line.match(/^ {1,4}/)?.[0].length ?? 0;
  return leadingSpaces > 0 ? line.slice(leadingSpaces) : line;
}

function tokenSpan(className: string, text: string, key: string) {
  return (
    <span key={key} className={className}>
      {text}
    </span>
  );
}

function readSingleLineString(line: string, start: number) {
  const quote = line[start];
  let end = start + 1;
  while (end < line.length) {
    if (line[end] === '\\') {
      end += 2;
      continue;
    }
    if (line[end] === quote) {
      end += 1;
      break;
    }
    end += 1;
  }
  return end;
}

function readTripleString(line: string, start: number, marker: string) {
  const end = line.indexOf(marker, start + marker.length);
  return end === -1
    ? { end: line.length, closed: false }
    : { end: end + marker.length, closed: true };
}

function highlightPythonLine(line: string, lineIndex: number, tripleStringMarker: string | null) {
  const nodes = [];
  let index = 0;
  let marker = tripleStringMarker;

  while (index < line.length) {
    const key = `${lineIndex}-${index}`;
    const rest = line.slice(index);

    if (marker) {
      const { end, closed } = readTripleString(line, index, marker);
      nodes.push(tokenSpan(TOKEN_CLASS.string, line.slice(index, end), key));
      if (closed) marker = null;
      index = end;
      continue;
    }

    if (rest.startsWith('#')) {
      nodes.push(tokenSpan(TOKEN_CLASS.comment, rest, key));
      break;
    }

    const tripleMarker = rest.startsWith('"""') || rest.startsWith("'''") ? rest.slice(0, 3) : null;
    if (tripleMarker) {
      const { end, closed } = readTripleString(line, index, tripleMarker);
      nodes.push(tokenSpan(TOKEN_CLASS.string, line.slice(index, end), key));
      if (!closed) marker = tripleMarker;
      index = end;
      continue;
    }

    if (line[index] === '"' || line[index] === "'") {
      const end = readSingleLineString(line, index);
      nodes.push(tokenSpan(TOKEN_CLASS.string, line.slice(index, end), key));
      index = end;
      continue;
    }

    const decorator = rest.match(/^@[A-Za-z_][A-Za-z0-9_.]*/)?.[0];
    if (decorator) {
      nodes.push(tokenSpan(TOKEN_CLASS.decorator, decorator, key));
      index += decorator.length;
      continue;
    }

    const number = rest.match(/^\b\d+(?:\.\d+)?\b/)?.[0];
    if (number) {
      nodes.push(tokenSpan(TOKEN_CLASS.number, number, key));
      index += number.length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      const nextChar = line.slice(index + identifier.length).trimStart()[0];
      const className = PYTHON_KEYWORDS.has(identifier)
        ? TOKEN_CLASS.keyword
        : PYTHON_BUILTINS.has(identifier)
          ? TOKEN_CLASS.builtin
          : nextChar === '('
            ? TOKEN_CLASS.function
            : '';
      nodes.push(
        className ? tokenSpan(className, identifier, key) : <span key={key}>{identifier}</span>,
      );
      index += identifier.length;
      continue;
    }

    const operator = rest.match(
      /^(?:->|==|!=|<=|>=|\+=|-=|\*=|\/=|\/\/|[-+*/%=<>:.,()[\]{}])/,
    )?.[0];
    if (operator) {
      nodes.push(tokenSpan(TOKEN_CLASS.operator, operator, key));
      index += operator.length;
      continue;
    }

    nodes.push(<span key={key}>{line[index]}</span>);
    index += 1;
  }

  return { nodes, tripleStringMarker: marker };
}

export function highlightPython(value: string) {
  const lines = value.split('\n');
  let tripleStringMarker: string | null = null;

  return lines.map((line, lineIndex) => {
    const result = highlightPythonLine(line, lineIndex, tripleStringMarker);
    tripleStringMarker = result.tripleStringMarker;
    return (
      <span key={lineIndex}>
        {result.nodes}
        {lineIndex < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
}

export function CodeAnswerEditor({
  value,
  onChange,
  disabled,
  placeholder,
  locale,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  locale: 'zh-CN' | 'en-US';
  className?: string;
}) {
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const codeLayerRef = useRef<HTMLPreElement>(null);
  const lineNumbers = lineNumbersFor(value);

  const updateSelection = (target: HTMLTextAreaElement, start: number, end = start) => {
    requestAnimationFrame(() => {
      target.selectionStart = start;
      target.selectionEnd = end;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab' || disabled) return;
    event.preventDefault();

    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    if (start === end && !event.shiftKey) {
      onChange(`${value.slice(0, start)}${INDENT}${value.slice(end)}`);
      updateSelection(target, start + INDENT.length);
      return;
    }

    const { lineStart, lineEnd } = getLineBounds(value, start, end);
    const selectedBlock = value.slice(lineStart, lineEnd);
    const lines = selectedBlock.split('\n');
    const nextLines = event.shiftKey ? lines.map(unindentLine) : lines.map((line) => INDENT + line);
    const nextBlock = nextLines.join('\n');
    const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    const selectionDelta = nextBlock.length - selectedBlock.length;

    onChange(nextValue);
    updateSelection(
      target,
      Math.max(lineStart, start + (event.shiftKey ? Math.min(0, selectionDelta) : INDENT.length)),
      Math.max(lineStart, end + selectionDelta),
    );
  };

  return (
    <div
      className={cn(
        'group flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-white dark:focus-within:border-sky-500 dark:focus-within:ring-sky-200/70',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 dark:border-slate-200 dark:bg-slate-50 dark:text-slate-600">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <Code2 className="h-3.5 w-3.5 text-sky-600" />
          <span>Python</span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">
          {lineNumbers.length} {locale === 'zh-CN' ? '行' : 'lines'}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[3rem_minmax(0,1fr)]">
        <div className="min-h-0 overflow-hidden border-r border-slate-200 bg-slate-50 text-right dark:border-slate-200 dark:bg-slate-50">
          <div
            ref={lineGutterRef}
            className="px-2 py-3 font-mono text-[11px] leading-6 text-slate-400"
          >
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber}>{lineNumber}</div>
            ))}
          </div>
        </div>
        <div className="relative h-full min-h-0 overflow-hidden bg-white dark:bg-white">
          <pre
            ref={codeLayerRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 min-w-max whitespace-pre px-4 py-3 font-mono text-[13px] leading-6 text-slate-900"
            style={{ tabSize: 4 }}
          >
            <code>{highlightPython(value)}</code>
          </pre>
          <textarea
            aria-label={locale === 'zh-CN' ? '代码编辑器' : 'Code editor'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={(event) => {
              if (lineGutterRef.current) {
                lineGutterRef.current.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`;
              }
              if (codeLayerRef.current) {
                codeLayerRef.current.style.transform = `translate(${-event.currentTarget.scrollLeft}px, ${-event.currentTarget.scrollTop}px)`;
              }
            }}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            className="relative z-10 h-full min-h-0 w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-transparent caret-sky-600 outline-none selection:bg-sky-200/80 placeholder:text-slate-400 disabled:cursor-not-allowed"
            style={{ tabSize: 4 }}
          />
        </div>
      </div>
    </div>
  );
}
