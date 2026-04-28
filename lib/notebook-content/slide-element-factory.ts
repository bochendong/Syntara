import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTImageElement,
  PPTLatexElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  ShapeText,
  TableCell,
} from '@/lib/types/slides';
import { normalizeMathSource, renderMathToHtml } from '@/lib/math-engine';
import { escapeHtml } from './inline-html';
import { CONTENT_LEFT, CONTENT_WIDTH } from './layout-constants';

export function createTextElement(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  groupId?: string;
  fill?: string;
  outlineColor?: string;
  shadow?: PPTTextElement['shadow'];
}): PPTTextElement {
  return {
    id: `text_${nanoid(8)}`,
    type: 'text',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.html,
    defaultFontName: args.fontName || 'Microsoft YaHei',
    defaultColor: args.color || '#0f172a',
    textType: args.textType,
    lineHeight: 1.35,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
    shadow: args.shadow,
  };
}

export function createShapeText(args: {
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  lineHeight?: number;
  paragraphSpace?: number;
  align?: ShapeText['align'];
}): ShapeText {
  return {
    content: args.html,
    defaultFontName: args.fontName || 'Microsoft YaHei',
    defaultColor: args.color || '#0f172a',
    align: args.align || 'top',
    lineHeight: args.lineHeight,
    paragraphSpace: args.paragraphSpace,
    type: args.textType,
  };
}

export function createRectShape(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor?: string;
  shadow?: PPTShapeElement['shadow'];
  groupId?: string;
  text?: ShapeText;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fill: args.fill,
    fixedRatio: false,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
    shadow: args.shadow,
    text: args.text,
  };
}

export function createCircleShape(args: {
  left: number;
  top: number;
  size: number;
  fill: string;
  groupId?: string;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.size,
    height: args.size,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M100,0 C44.8,0 0,44.8 0,100 C0,155.2 44.8,200 100,200 C155.2,200 200,155.2 200,100 C200,44.8 155.2,0 100,0 Z',
    fill: args.fill,
    fixedRatio: false,
  };
}

export function createImageElement(args: {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  groupId?: string;
  radius?: number;
  outlineColor?: string;
  shadow?: PPTImageElement['shadow'];
  imageType?: PPTImageElement['imageType'];
}): PPTImageElement {
  return {
    id: `image_${nanoid(8)}`,
    type: 'image',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    fixedRatio: false,
    src: args.src,
    radius: args.radius ?? 8,
    imageType: args.imageType || 'pageFigure',
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
    shadow: args.shadow,
  };
}

export function createLineElement(args: {
  start: [number, number];
  end: [number, number];
  color: string;
  width?: number;
  points?: [PPTLineElement['points'][0], PPTLineElement['points'][1]];
  groupId?: string;
}): PPTLineElement {
  const left = Math.min(args.start[0], args.end[0]);
  const top = Math.min(args.start[1], args.end[1]);
  const start: [number, number] = [args.start[0] - left, args.start[1] - top];
  const end: [number, number] = [args.end[0] - left, args.end[1] - top];

  return {
    id: `line_${nanoid(8)}`,
    type: 'line',
    left,
    top,
    groupId: args.groupId,
    width: args.width ?? 2,
    start,
    end,
    style: 'solid',
    color: args.color,
    points: args.points || ['', ''],
  };
}

export function createLatexElement(args: {
  latex: string;
  left: number;
  top: number;
  width: number;
  height: number;
  align?: PPTLatexElement['align'];
  groupId?: string;
  color?: string;
  fill?: string;
  outlineColor?: string;
}): PPTLatexElement {
  const latex = normalizeMathSource(args.latex);

  return {
    id: `latex_${nanoid(8)}`,
    type: 'latex',
    left: args.left,
    top: args.top,
    groupId: args.groupId,
    width: args.width,
    height: args.height,
    rotate: 0,
    latex,
    html: renderMathToHtml(latex, { displayMode: true }),
    align: args.align || 'left',
    color: args.color,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
  };
}

export function createTableElement(args: {
  top: number;
  headers?: string[];
  rows: string[][];
  caption?: string;
  groupId?: string;
}): PPTElement[] {
  const rowCount = args.rows.length + (args.headers?.length ? 1 : 0);
  const height = Math.min(220, Math.max(72, rowCount * 34 + 12));
  const headers = args.headers?.length ? args.headers : undefined;
  const data: TableCell[][] = [];
  if (headers) {
    data.push(
      headers.map((header) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: header,
        style: {
          bold: true,
          backcolor: '#eef2ff',
          color: '#1e1b4b',
        },
      })),
    );
  }
  for (const row of args.rows) {
    data.push(
      row.map((cell) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: cell,
      })),
    );
  }

  const table: PPTTableElement = {
    id: `table_${nanoid(8)}`,
    type: 'table',
    left: CONTENT_LEFT,
    top: args.top + (args.caption ? 26 : 0),
    groupId: args.groupId,
    width: CONTENT_WIDTH,
    height,
    rotate: 0,
    outline: { color: '#cbd5e1', width: 1, style: 'solid' },
    data,
    theme: {
      color: '#4f46e5',
      rowHeader: Boolean(headers),
      rowFooter: false,
      colHeader: false,
      colFooter: false,
    },
    colWidths: new Array(data[0]?.length || 1).fill(1 / Math.max(data[0]?.length || 1, 1)),
    cellMinHeight: 34,
  };

  const elements: PPTElement[] = [];
  if (args.caption) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: args.top,
        width: CONTENT_WIDTH,
        height: 24,
        groupId: args.groupId,
        html: `<p style="font-size:14px;color:#475569;"><strong>${escapeHtml(args.caption)}</strong></p>`,
        color: '#475569',
        textType: 'notes',
      }),
    );
  }
  elements.push(table);
  return elements;
}
