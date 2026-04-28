import { nanoid } from 'nanoid';
import type { SceneOutline, GeneratedSlideContent } from '@/lib/types/generation';
import type {
  PPTElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTextElement,
} from '@/lib/types/slides';

export function buildFallbackSlideContentFromOutline(outline: SceneOutline): GeneratedSlideContent {
  const lang = outline.language || 'zh-CN';
  const contentProfile = outline.contentProfile || 'general';
  const summary = normalizeText(
    outline.description || outline.keyPoints.join(' ') || outline.title,
    360,
  );
  const keyPoints = normalizeList(
    outline.keyPoints,
    summary
      ? [summary]
      : [
          lang === 'zh-CN'
            ? '根据当前大纲整理这一页的核心信息'
            : 'Summarize the main idea from the current outline',
        ],
    6,
    110,
  );
  const takeaway = normalizeList(
    [],
    lang === 'zh-CN'
      ? ['先理解这一页的核心概念与结论', '讲解时可根据上下文继续补充细节与例子']
      : [
          'Focus on the main concept and conclusion first',
          'Add examples and detail during narration if needed',
        ],
    3,
    96,
  );

  const accent =
    contentProfile === 'code' ? '#0f766e' : contentProfile === 'math' ? '#2563eb' : '#4f46e5';
  const accentSoft =
    contentProfile === 'code' ? '#ccfbf1' : contentProfile === 'math' ? '#dbeafe' : '#e0e7ff';
  const panel =
    contentProfile === 'code' ? '#ecfeff' : contentProfile === 'math' ? '#eff6ff' : '#eef2ff';
  const panelAlt =
    contentProfile === 'code' ? '#f8fafc' : contentProfile === 'math' ? '#f8fbff' : '#f8fafc';

  const elements: PPTElement[] = [
    createRectElement({
      name: 'top_accent',
      left: 0,
      top: 0,
      width: 1000,
      height: 8,
      fill: accent,
    }),
    createRectElement({
      name: 'title_marker',
      left: 44,
      top: 34,
      width: 10,
      height: 46,
      fill: accent,
    }),
    (() => {
      const titlePanel = createRectElement({
        name: 'slide_title_panel',
        left: 72,
        top: 28,
        width: 860,
        height: 56,
        fill: '#fcfcfd',
      });
      titlePanel.text = {
        content: toTextHtml(
          splitIntoLines(
            outline.title || (lang === 'zh-CN' ? '未命名页面' : 'Untitled Slide'),
            30,
            2,
          ),
          {
            fontSize: 30,
            color: '#0f172a',
            bold: true,
          },
        ),
        defaultFontName: DEFAULT_FONT,
        defaultColor: '#0f172a',
        align: 'top',
        lineHeight: 1.34,
        paragraphSpace: 6,
        type: 'title',
      };
      return titlePanel;
    })(),
    (() => {
      const summaryPanel = createRectElement({
        name: 'summary_panel',
        left: 44,
        top: 106,
        width: 912,
        height: 118,
        fill: panel,
        outlineColor: accentSoft,
      });
      summaryPanel.text = {
        content: toTextHtml(splitIntoLines(summary, 78, 2), {
          fontSize: 17,
          color: '#334155',
          lineHeight: 1.42,
        }),
        defaultFontName: DEFAULT_FONT,
        defaultColor: '#334155',
        align: 'top',
        lineHeight: 1.4,
        paragraphSpace: 6,
        type: 'content',
      };
      return summaryPanel;
    })(),
    ...buildInfoCard(
      undefined,
      keyPoints,
      { left: 44, top: 252, width: 566, height: 258 },
      {
        accent,
        accentSoft,
        panel,
        panelAlt,
        codeBg: '#172554',
      },
      'fallback_keypoints',
    ),
    ...buildInfoCard(
      undefined,
      takeaway,
      { left: 636, top: 252, width: 320, height: 258 },
      {
        accent: '#0891b2',
        accentSoft: '#bae6fd',
        panel: '#ecfeff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      },
      'fallback_takeaway',
    ),
  ];

  return {
    elements,
    background: { type: 'solid', color: '#fcfcfd' },
    remark: outline.description,
  };
}

const RECT_PATH = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';
const CIRCLE_PATH = 'M 1 0.5 A 0.5 0.5 0 1 1 0 0.5 A 0.5 0.5 0 1 1 1 0.5 Z';
const DEFAULT_FONT = 'Microsoft YaHei';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function normalizeText(input?: string, maxLen = 240): string {
  const raw = (input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1).trimEnd()}…`;
}

function containsLatexLikeMath(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[/.test(text);
}

function estimateVisualTextLength(text: string): number {
  return text
    .replace(/\\\\(?=[()[\]])/g, '\\')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

export function estimateWrappedLineCount(
  text: string,
  approxCharsPerLine: number,
  maxLines: number,
): number {
  const source = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const pieces = source.length > 0 ? source : [text.trim()];

  let lineCount = 0;
  for (const piece of pieces) {
    const normalized = piece.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const visualLength = Math.max(1, estimateVisualTextLength(normalized));
    lineCount += Math.max(1, Math.ceil(visualLength / Math.max(approxCharsPerLine, 1)));
    if (lineCount >= maxLines) return maxLines;
  }

  return Math.max(1, lineCount);
}

export function normalizeList(
  items: string[] | undefined,
  fallback: string[] = [],
  maxItems = 4,
  maxLen = 120,
): string[] {
  const base = (items || []).map((item) => normalizeText(item, maxLen)).filter(Boolean);
  const resolved = base.length > 0 ? base : fallback;
  return resolved.slice(0, maxItems);
}

export function splitIntoLines(text: string, maxChars = 90, maxLines = 6): string[] {
  const normalized = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const source = normalized.length > 0 ? normalized : [text.trim()];
  const lines: string[] = [];

  for (const piece of source) {
    let remaining = piece.replace(/\s+/g, ' ').trim();
    if (containsLatexLikeMath(remaining)) {
      lines.push(remaining);
      if (lines.length >= maxLines) break;
      continue;
    }
    while (remaining && lines.length < maxLines) {
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        remaining = '';
        break;
      }
      let splitAt = remaining.lastIndexOf(' ', maxChars);
      if (splitAt < Math.floor(maxChars * 0.55)) splitAt = maxChars;
      lines.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (!/[.。！？!?…]$/.test(last)) lines[maxLines - 1] = `${last}…`;
  }

  return lines;
}

export function toTextHtml(
  lines: string[],
  opts?: {
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    fontFamily?: string;
    lineHeight?: number;
  },
): string {
  const fontSize = opts?.fontSize ?? 16;
  const color = opts?.color ?? '#111827';
  const align = opts?.align ?? 'left';
  const fontWeight = opts?.bold ? '700' : '400';
  const fontFamily = opts?.fontFamily ?? DEFAULT_FONT;
  const lineHeight = opts?.lineHeight ?? 1.38;
  return lines
    .map(
      (line) =>
        `<p style="font-size:${fontSize}px;color:${color};text-align:${align};font-weight:${fontWeight};font-family:${fontFamily};line-height:${lineHeight};">${escapeHtml(line)}</p>`,
    )
    .join('');
}

export function toBulletHtml(
  items: string[],
  opts?: {
    fontSize?: number;
    color?: string;
    bulletColor?: string;
    fontFamily?: string;
    lineHeight?: number;
  },
): string {
  const fontSize = opts?.fontSize ?? 16;
  const color = opts?.color ?? '#111827';
  const bulletColor = opts?.bulletColor ?? color;
  const fontFamily = opts?.fontFamily ?? DEFAULT_FONT;
  const lineHeight = opts?.lineHeight ?? 1.42;
  return items
    .map(
      (item) =>
        `<p style="font-size:${fontSize}px;color:${color};font-family:${fontFamily};line-height:${lineHeight};"><span style="color:${bulletColor};font-weight:700;">•</span> ${escapeHtml(item)}</p>`,
    )
    .join('');
}

export function toCodeHtml(lines: string[]): string {
  const safeLines = lines.length > 0 ? lines : ['# code excerpt'];
  return safeLines
    .map((line) => {
      const escaped = escapeHtml(line).replace(/ /g, '&nbsp;');
      return `<p style="font-size:14px;color:#e2e8f0;font-family:Menlo, Monaco, Consolas, monospace;line-height:1.42;">${escaped || '&nbsp;'}</p>`;
    })
    .join('');
}

export function createTextElement(args: {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  content: string;
  defaultColor?: string;
  defaultFontName?: string;
  textType?: PPTTextElement['textType'];
  fill?: string;
}): PPTTextElement {
  return {
    id: `text_${nanoid(8)}`,
    type: 'text',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.content,
    defaultFontName: args.defaultFontName ?? DEFAULT_FONT,
    defaultColor: args.defaultColor ?? '#111827',
    textType: args.textType,
    fill: args.fill,
  };
}

export function createRectElement(args: {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor?: string;
  outlineWidth?: number;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [1, 1],
    path: RECT_PATH,
    fixedRatio: false,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: args.outlineWidth ?? 1,
          style: 'solid',
        }
      : undefined,
  };
}

export function createCircleElement(args: {
  name: string;
  left: number;
  top: number;
  size: number;
  fill: string;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.size,
    height: args.size,
    rotate: 0,
    viewBox: [1, 1],
    path: CIRCLE_PATH,
    fixedRatio: false,
    fill: args.fill,
  };
}

export function createLineElement(args: {
  name: string;
  start: [number, number];
  end: [number, number];
  color: string;
  width?: number;
}): PPTLineElement {
  const left = Math.min(args.start[0], args.end[0]);
  const top = Math.min(args.start[1], args.end[1]);
  const start: [number, number] = [args.start[0] - left, args.start[1] - top];
  const end: [number, number] = [args.end[0] - left, args.end[1] - top];

  return {
    id: `line_${nanoid(8)}`,
    type: 'line',
    name: args.name,
    left,
    top,
    width: args.width ?? 2,
    start,
    end,
    style: 'solid',
    color: args.color,
    points: ['', ''],
  };
}

export function getRolePalette(role: NonNullable<SceneOutline['workedExampleConfig']>['role']): {
  accent: string;
  accentSoft: string;
  panel: string;
  panelAlt: string;
  codeBg: string;
} {
  switch (role) {
    case 'problem_statement':
      return {
        accent: '#2563eb',
        accentSoft: '#dbeafe',
        panel: '#eff6ff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      };
    case 'givens_and_goal':
    case 'constraints':
      return {
        accent: '#0891b2',
        accentSoft: '#cffafe',
        panel: '#ecfeff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      };
    case 'solution_plan':
      return {
        accent: '#7c3aed',
        accentSoft: '#ede9fe',
        panel: '#f5f3ff',
        panelAlt: '#faf5ff',
        codeBg: '#1f1335',
      };
    case 'pitfalls':
      return {
        accent: '#ea580c',
        accentSoft: '#ffedd5',
        panel: '#fff7ed',
        panelAlt: '#fffbeb',
        codeBg: '#431407',
      };
    case 'summary':
      return {
        accent: '#059669',
        accentSoft: '#d1fae5',
        panel: '#ecfdf5',
        panelAlt: '#f0fdf4',
        codeBg: '#052e16',
      };
    case 'walkthrough':
    default:
      return {
        accent: '#4f46e5',
        accentSoft: '#e0e7ff',
        panel: '#eef2ff',
        panelAlt: '#f8fafc',
        codeBg: '#172554',
      };
  }
}

export function buildInfoCard(
  label: string | undefined,
  items: string[],
  layout: { left: number; top: number; width: number; height: number },
  palette: ReturnType<typeof getRolePalette>,
  name: string,
): PPTElement[] {
  const card = createRectElement({
    name: `${name}_card`,
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    fill: palette.panelAlt,
    outlineColor: palette.accentSoft,
  });

  // Keep fallback card copy inside the shape text layer, so it remains anchored to the card.
  const labelText = (label || '').trim();
  const headingHtml = labelText
    ? toTextHtml([labelText], {
        fontSize: 16,
        color: palette.accent,
        bold: true,
        lineHeight: 1.34,
      })
    : '';
  card.text = {
    content: [
      headingHtml,
      toBulletHtml(items, {
        fontSize: 15,
        color: '#0f172a',
        bulletColor: palette.accent,
      }),
    ]
      .filter(Boolean)
      .join(''),
    defaultFontName: DEFAULT_FONT,
    defaultColor: '#0f172a',
    align: 'top',
    lineHeight: 1.4,
    paragraphSpace: 6,
    type: 'content',
  };

  return [card];
}

function alignNamedShapeRow(elements: PPTElement[], shapeNames: string[]): PPTElement[] {
  const indices = elements
    .map((element, index) => ({ element, index }))
    .filter(
      (item): item is { element: PPTShapeElement; index: number } =>
        item.element.type === 'shape' && shapeNames.includes(item.element.name || ''),
    );
  if (indices.length < 2) return elements;

  const top = Math.min(...indices.map((item) => item.element.top));
  const height = Math.max(...indices.map((item) => item.element.height));

  return elements.map((element) => {
    if (element.type !== 'shape') return element;
    if (!shapeNames.includes(element.name || '')) return element;
    return {
      ...element,
      top,
      height,
    };
  });
}

export function alignFallbackCardRows(elements: PPTElement[]): PPTElement[] {
  const rows: string[][] = [
    ['fallback_keypoints_card', 'fallback_takeaway_card'],
    ['summary_takeaways_card', 'summary_pitfalls_card'],
  ];

  return rows.reduce((acc, rowNames) => alignNamedShapeRow(acc, rowNames), elements);
}
