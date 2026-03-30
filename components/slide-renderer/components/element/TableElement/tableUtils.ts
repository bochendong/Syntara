import type { CSSProperties } from 'react';
import type { TableCell, TableCellStyle } from '@/lib/types/slides';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';

/**
 * Convert TableCellStyle to CSS properties
 */
export function getTextStyle(style?: TableCellStyle): CSSProperties {
  if (!style) return {};

  const css: CSSProperties = {};

  if (style.bold) css.fontWeight = 'bold';
  if (style.em) css.fontStyle = 'italic';
  if (style.underline) css.textDecoration = 'underline';
  if (style.strikethrough) {
    css.textDecoration = css.textDecoration ? `${css.textDecoration} line-through` : 'line-through';
  }
  if (style.color) css.color = style.color;
  if (style.backcolor) css.backgroundColor = style.backcolor;
  if (style.fontsize) css.fontSize = style.fontsize;
  if (style.fontname) css.fontFamily = style.fontname;
  if (style.align) css.textAlign = style.align;

  return css;
}

/**
 * Format text: convert \n to <br/> and spaces to &nbsp;
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function hasExplicitMathDelimiters(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$/.test(text);
}

function hasUndelimitedLatex(text: string): boolean {
  return /\\[a-zA-Z]+|[_^][{(]?[A-Za-z0-9+\-*/=<>]+[})]?/.test(text);
}

function shouldWrapMathFragment(fragment: string): boolean {
  const value = fragment.trim();
  if (!value) return false;
  if (/^[A-Za-z]+$/.test(value)) return false;
  return /\\[a-zA-Z]+|[_^]|[=<>]|[\[\]{}()]/.test(value);
}

function wrapUndelimitedLatex(text: string): string {
  if (!text || hasExplicitMathDelimiters(text) || !hasUndelimitedLatex(text)) {
    return text;
  }

  return text
    .split('\n')
    .map((line) => {
      if (!hasUndelimitedLatex(line) || hasExplicitMathDelimiters(line)) return line;

      // Entire line is basically math: wrap it as one expression.
      if (!/[\u4e00-\u9fff]/.test(line) && /\\[a-zA-Z]+|[_^]|[=<>]|[\[\]{}()]/.test(line)) {
        return `\\(${line.trim()}\\)`;
      }

      return line.replace(/((?:\\[a-zA-Z]+|[A-Za-z0-9]+|[\[\]{}()_^=+\-*/<>|,:.;])+)/g, (match) =>
        shouldWrapMathFragment(match) ? `\\(${match}\\)` : match,
      );
    })
    .join('\n');
}

export function formatPlainText(text: string): string {
  const normalized = wrapUndelimitedLatex(text);
  return escapeHtml(normalized).replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');
}

export function formatText(text: string): string {
  return renderHtmlWithLatex(formatPlainText(text));
}

/**
 * Compute hidden cell positions based on colspan/rowspan merges.
 * Returns a Set of "row_col" keys for cells that should be hidden.
 */
export function getHiddenCells(data: TableCell[][]): Set<string> {
  const hidden = new Set<string>();

  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    let realColIdx = 0;
    for (let colIdx = 0; colIdx < data[rowIdx].length; colIdx++) {
      // Skip positions already occupied by a previous merge
      while (hidden.has(`${rowIdx}_${realColIdx}`)) {
        realColIdx++;
      }

      const cell = data[rowIdx][colIdx];
      const colspan = cell.colspan ?? 1;
      const rowspan = cell.rowspan ?? 1;

      if (colspan > 1 || rowspan > 1) {
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (r === 0 && c === 0) continue;
            hidden.add(`${rowIdx + r}_${realColIdx + c}`);
          }
        }
      }

      realColIdx += colspan;
    }
  }

  return hidden;
}
