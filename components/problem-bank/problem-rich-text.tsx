'use client';

import { memo, useMemo } from 'react';
import {
  renderHtmlWithLatex,
  renderPlainTitleWithOptionalLatex,
} from '@/lib/render-html-with-latex';
import { renderMathToHtml, renderTextWithMathToHtml } from '@/lib/math-engine';
import type { NotebookProblemImageAsset, NotebookProblemPublicContent } from '@/lib/problem-bank';
import { cn } from '@/lib/utils';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function tableCellCount(row: string): number {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
}

function nextPipeRow(text: string, start: number, columnCount: number) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (text[index] !== '|') return null;

  let pipeCount = 0;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (text[cursor] === '|') pipeCount += 1;
    if (pipeCount === columnCount + 1) {
      return {
        row: text.slice(index, cursor + 1).trim(),
        end: cursor + 1,
      };
    }
  }
  return null;
}

function normalizeInlinePipeTables(text: string): string {
  let output = '';
  let cursor = 0;
  const separatorPattern = /\|(?:\s*:?-{3,}:?\s*\|){2,}/g;
  let match: RegExpExecArray | null;

  while ((match = separatorPattern.exec(text))) {
    const separatorStart = match.index;
    if (separatorStart < cursor) continue;
    const columnCount = tableCellCount(match[0]);
    const before = text.slice(cursor, separatorStart);
    const pipePositions = [...before.matchAll(/\|/g)].map((item) => item.index ?? 0);
    if (pipePositions.length < columnCount + 1) continue;

    const tableStart = cursor + pipePositions[pipePositions.length - (columnCount + 1)];
    let rowCursor = tableStart;
    const rows: string[] = [];
    for (let rowIndex = 0; rowIndex < 40; rowIndex += 1) {
      const row = nextPipeRow(text, rowCursor, columnCount);
      if (!row) break;
      rows.push(row.row);
      rowCursor = row.end;
    }

    if (rows.length < 2 || !rows.some((row) => /^-+$/.test(row.replace(/[|:\s]/g, '')))) {
      continue;
    }

    output += text.slice(cursor, tableStart).trimEnd();
    output += `${output.endsWith('\n') || output.length === 0 ? '' : '\n'}${rows.join('\n')}`;
    cursor = rowCursor;
    separatorPattern.lastIndex = rowCursor;
  }

  const tail = text.slice(cursor);
  if (output && tail.trim()) {
    output += `\n${tail.trimStart()}`;
  } else {
    output += tail;
  }
  return output;
}

function splitQuestionTextAfterInlineList(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!/^\s*[-*]\s+/.test(line)) return line;
      return line.replace(/(\.)\s+((?:If|Which|Determine|Find|Suppose|Let|For)\b.+)$/i, '$1\n\n$2');
    })
    .join('\n');
}

function normalizeInlineStructuralMarkdown(text: string): string {
  const normalizeProse = (value: string) => {
    let normalized = value;

    if (
      /\b(?:properties|conditions|axioms|assumptions|requirements)\s*:/i.test(normalized) &&
      /\([A-Z]\d+\)/.test(normalized)
    ) {
      normalized = normalized
        .replace(/\s+-\s+(?=\([A-Z]\d+\))/g, '\n')
        .replace(/(\b(?:properties|conditions|axioms|assumptions|requirements)\s*:)\s*/i, '$1\n')
        .replace(/\s*(\([A-Z]\d+\)\s+)/g, '\n- $1');
    }

    normalized = normalized.replace(
      /\s+(\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)\s*(?:(?:\(\d+\s+points?\)\s*)|(?=(?:Prove|Show|Find|Determine|Compute|Calculate|Explain|Give|Describe|Use|Let|Suppose|Define)\b)))/gi,
      '\n\n$1',
    );

    normalized = normalized.replace(/\s+(Hint\s*:)/gi, '\n\n$1');
    return normalized;
  };

  let normalized = text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((part) => (part.startsWith('$') ? part : normalizeProse(part)))
    .join('');

  if (/\|\s*:?-{3,}:?\s*\|/.test(normalized)) {
    normalized = normalizeInlinePipeTables(normalized);
  }

  if (
    /\b(?:Definitions?|included|We say|We define|defined?|conditions?|steps?)\b[^\n]*\s+-\s+/i.test(
      normalized,
    )
  ) {
    normalized = normalized.replace(/\s+-\s+(?=(?:\$\$)?(?:[A-Z0-9]|\([A-Za-z0-9]))/g, '\n- ');
    normalized = splitQuestionTextAfterInlineList(normalized);
  }

  return normalized
    .replace(/\n{3,}/g, '\n\n')
    .replace(/:\n\n-/g, ':\n-')
    .trim();
}

function inlineSimpleDisplayMath(text: string): string {
  return text.replace(/\$\$([^$\n]{1,120})\$\$/g, (match, latex: string) => {
    const trimmed = latex.trim();
    if (!trimmed || /\\begin|\\left|\\right|\n/.test(trimmed)) return match;
    return `$${trimmed}$`;
  });
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isPipeTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && trimmed.split('|').filter((cell) => cell.trim()).length >= 2;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function renderTable(lines: string[]): string {
  const rows = lines.filter((line) => !isTableSeparator(line)).map(splitTableRow);
  const [header, ...bodyRows] = rows;
  if (!header || bodyRows.length === 0) {
    return `<p>${escapeHtml(lines.join('\n')).replace(/\n/g, '<br/>')}</p>`;
  }

  const renderCells = (cells: string[], tag: 'td' | 'th') =>
    cells.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('');

  return `<div class="problem-rich-table-wrap"><table><thead><tr>${renderCells(
    header,
    'th',
  )}</tr></thead><tbody>${bodyRows
    .map((row) => `<tr>${renderCells(row, 'td')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function renderList(lines: string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const itemPattern = ordered ? /^\s*\d+[\.)]\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
  return `<${tag}>${lines
    .map((line) => {
      const item = line.match(itemPattern)?.[1] ?? line.trim();
      return `<li>${escapeHtml(item)}</li>`;
    })
    .join('')}</${tag}>`;
}

function normalizeCasesRows(body: string): string {
  return body
    .replace(/\${1,2}/g, '')
    .replace(/,\s*(\\{1,2})\s*(?=([^,&]+,\s*&))/g, (_match, _slashes, nextRow: string) => {
      const trimmedNextRow = nextRow.trim();
      const commandPrefix = /^(?:tan|sin|cos|log|ln|sqrt|frac|lim|int|sum|prod)\b/.test(
        trimmedNextRow,
      )
        ? '\\'
        : '';
      return `,\\\\\n${commandPrefix}`;
    })
    .replace(/\\{2,}\s*(?=[^,&]+,\s*&)/g, '\\\\\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeDisplayMathLatex(latex: string): string {
  if (!latex.includes('\\begin{cases}')) return latex;
  return latex.replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
    (_match, body: string) => `\\begin{cases}\n${normalizeCasesRows(body)}\n\\end{cases}`,
  );
}

function renderCasesDisplayMath(latex: string): string | null {
  const match = latex.match(/^\s*([\s\S]*?)\\begin\{cases\}([\s\S]*?)\\end\{cases\}\s*$/);
  if (!match) return null;

  const lhs = match[1].trim();
  const rows = normalizeCasesRows(match[2])
    .split(/\\\\\s*/g)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [value, condition = ''] = row.split('&');
      return {
        value: value.trim().replace(/,\s*$/, ''),
        condition: condition.trim(),
      };
    });

  if (rows.length === 0) return null;

  const lhsHtml = lhs
    ? `<span class="problem-rich-cases-lhs">${escapeHtml(`$${lhs}$`)}</span>`
    : '';

  return `<div class="problem-rich-cases">${lhsHtml}<span class="problem-rich-cases-brace">{</span><span class="problem-rich-cases-rows">${rows
    .map(
      (row) =>
        `<span class="problem-rich-cases-row"><span>${escapeHtml(
          `$${row.value}$`,
        )}</span><span>${escapeHtml(row.condition ? `$${row.condition}$` : '')}</span></span>`,
    )
    .join('')}</span></div>`;
}

function isBracketDisplayMathStart(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === String.raw`\[` || trimmed === String.raw`\\[`;
}

function isBracketDisplayMathEnd(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === String.raw`\]` || trimmed === String.raw`\\]`;
}

function stripDisplayMathDelimiters(latex: string): string {
  return latex
    .replace(/^\s*\\{1,2}\[\s*/, '')
    .replace(/\s*\\{1,2}\]\s*$/, '')
    .replace(/\${2,}/g, '')
    .trim();
}

function renderDisplayMath(lines: string[]): string {
  const latex = normalizeDisplayMathLatex(stripDisplayMathDelimiters(lines.join('\n')));
  if (!latex) return '';

  const renderedMath = renderMathToHtml(latex, { displayMode: true });
  if (renderedMath.includes('data-syntara-math')) {
    return `<div class="problem-rich-display-math">${renderedMath}</div>`;
  }

  const casesHtml = renderCasesDisplayMath(latex);
  if (casesHtml) return casesHtml;

  return `<div class="problem-rich-display-math">${escapeHtml(`$$\n${latex}\n$$`)}</div>`;
}

function textToHtml(text: string): string {
  const lines = inlineSimpleDisplayMath(normalizeInlineStructuralMarkdown(text))
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim() === '$$' || isBracketDisplayMathStart(line)) {
      const endMatcher =
        line.trim() === '$$' ? (value: string) => value.trim() === '$$' : isBracketDisplayMathEnd;
      const mathLines: string[] = [];
      index += 1;
      while (index < lines.length && !endMatcher(lines[index])) {
        mathLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && endMatcher(lines[index])) {
        index += 1;
      }
      const displayMath = renderDisplayMath(mathLines);
      if (displayMath) blocks.push(displayMath);
      continue;
    }

    if (line.includes('\\begin{cases}')) {
      const mathLines: string[] = [line];
      index += 1;
      while (index < lines.length && !lines[index].includes('\\end{cases}')) {
        mathLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        mathLines.push(lines[index]);
        index += 1;
      }
      const displayMath = renderDisplayMath(mathLines);
      if (displayMath) blocks.push(displayMath);
      continue;
    }

    if (isPipeTableRow(line) && lines[index + 1] && isTableSeparator(lines[index + 1])) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim() && isPipeTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, false));
      continue;
    }

    if (/^\s*\d+[\.)]\s+/.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*\d+[\.)]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, true));
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      lines[index].trim() !== '$$' &&
      !isBracketDisplayMathStart(lines[index]) &&
      !lines[index].includes('\\begin{cases}') &&
      !(isPipeTableRow(lines[index]) && lines[index + 1] && isTableSeparator(lines[index + 1])) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+[\.)]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${escapeHtml(paragraphLines.join('\n')).replace(/\n/g, '<br/>')}</p>`);
  }

  const html = blocks.join('');
  return renderHtmlWithLatex(html);
}

export function renderProblemRichTextHtml(content: string): string {
  return content.trim() ? textToHtml(content) : '';
}

export const ProblemRichText = memo(function ProblemRichText({
  content,
  className,
}: {
  content?: string;
  className?: string;
}) {
  const html = useMemo(
    () => (content?.trim() ? renderProblemRichTextHtml(content) : ''),
    [content],
  );
  if (!html) return null;
  return (
    <div
      className={cn(
        'prose prose-slate max-w-none text-sm leading-7 dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0 [&_.katex-display]:my-3',
        '[&_.problem-rich-display-math]:my-3 [&_.problem-rich-display-math]:overflow-x-auto',
        '[&_.problem-rich-cases]:my-3 [&_.problem-rich-cases]:flex [&_.problem-rich-cases]:items-center [&_.problem-rich-cases]:justify-center [&_.problem-rich-cases]:gap-2 [&_.problem-rich-cases]:overflow-x-auto',
        '[&_.problem-rich-cases-lhs]:whitespace-nowrap [&_.problem-rich-cases-brace]:text-5xl [&_.problem-rich-cases-brace]:font-light [&_.problem-rich-cases-brace]:leading-none',
        '[&_.problem-rich-cases-rows]:grid [&_.problem-rich-cases-rows]:gap-1 [&_.problem-rich-cases-row]:grid [&_.problem-rich-cases-row]:grid-cols-[auto_auto] [&_.problem-rich-cases-row]:gap-3 [&_.problem-rich-cases-row]:whitespace-nowrap',
        '[&_.problem-rich-table-wrap]:my-3 [&_.problem-rich-table-wrap]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-slate-900',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function problemImageAssetsFromContent(
  content?: Pick<NotebookProblemPublicContent, 'assets'> | null,
): NotebookProblemImageAsset[] {
  return (content?.assets?.images || []).filter((image) => image.src?.trim());
}

export function ProblemImageAssets({
  content,
  images,
  className,
}: {
  content?: Pick<NotebookProblemPublicContent, 'assets'> | null;
  images?: NotebookProblemImageAsset[];
  className?: string;
}) {
  const resolvedImages = images || problemImageAssetsFromContent(content);
  if (!resolvedImages.length) return null;

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {resolvedImages.map((image) => (
        <figure
          key={image.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
        >
          <div className="flex min-h-[180px] items-center justify-center bg-white p-2 dark:bg-slate-950">
            <img
              src={image.src}
              alt={image.alt || image.caption || image.id}
              width={image.width || undefined}
              height={image.height || undefined}
              loading="lazy"
              decoding="async"
              className="max-h-[420px] w-full rounded-lg object-contain"
            />
          </div>
        </figure>
      ))}
    </div>
  );
}

export const ProblemTitleText = memo(function ProblemTitleText({
  content,
  className,
  forceInlineMath = false,
}: {
  content?: string;
  className?: string;
  forceInlineMath?: boolean;
}) {
  const html = useMemo(
    () =>
      content?.trim()
        ? forceInlineMath
          ? renderTextWithMathToHtml(content, { forceInline: true, rawFallback: true }) || ''
          : renderPlainTitleWithOptionalLatex(content)
        : '',
    [content, forceInlineMath],
  );
  if (!html) return null;
  return (
    <span
      className={cn(
        'inline [&_.katex]:text-[1em] [&_.katex]:leading-none [&_.math-engine-inline]:align-baseline',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
