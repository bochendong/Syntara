import type { ReactNode } from 'react';
import { renderMathToHtml } from '@/lib/math-engine';

export const MATH_SYMBOL_GROUPS = [
  {
    zh: '集合与数系',
    en: 'Sets & number systems',
    symbols: [
      'ℕ',
      'ℤ',
      'ℚ',
      'ℝ',
      'ℂ',
      '∅',
      '∈',
      '∉',
      '∋',
      '∌',
      '⊂',
      '⊃',
      '⊆',
      '⊇',
      '⊊',
      '⊋',
      '⊄',
      '∪',
      '∩',
      '∖',
      '×',
    ],
  },
  {
    zh: '逻辑与证明',
    en: 'Logic & proof',
    symbols: ['∀', '∃', '∄', '∴', '∵', '¬', '∧', '∨', '⊕', '⊢', '⊨', '⇒', '⇐', '⇔', '↯'],
  },
  {
    zh: '关系',
    en: 'Relations',
    symbols: ['=', '≠', '<', '>', '≤', '≥', '≡', '≢', '≈', '≅', '∼', '≃', '≜', '∝', '∣', '∤'],
  },
  {
    zh: '运算',
    en: 'Operations',
    symbols: [
      '+',
      '−',
      '±',
      '∓',
      '×',
      '÷',
      '⋅',
      '∘',
      '⋆',
      '∗',
      '⊗',
      '⊙',
      '⊕',
      '∑',
      '∏',
      '√',
      '∞',
      '∂',
      '∇',
      '∫',
      '∮',
    ],
  },
  {
    zh: '箭头',
    en: 'Arrows',
    symbols: ['→', '←', '↔', '↦', '↩', '↪', '↗', '↘', '↙', '↖', '↑', '↓', '↕', '⟶', '⟵', '⟷'],
  },
  {
    zh: '希腊字母',
    en: 'Greek',
    symbols: [
      'α',
      'β',
      'γ',
      'δ',
      'ε',
      'ζ',
      'η',
      'θ',
      'ι',
      'κ',
      'λ',
      'μ',
      'ν',
      'ξ',
      'π',
      'ρ',
      'σ',
      'τ',
      'φ',
      'χ',
      'ψ',
      'ω',
      'Γ',
      'Δ',
      'Θ',
      'Λ',
      'Ξ',
      'Π',
      'Σ',
      'Φ',
      'Ψ',
      'Ω',
    ],
  },
  {
    zh: '几何',
    en: 'Geometry',
    symbols: ['∠', '∡', '⊥', '∥', '△', '□', '○', '⌒', '°', '′', '″'],
  },
] as const;

export const TABLE_PICKER_ROWS = 6;
export const TABLE_PICKER_COLS = 6;
export const FORMAT_CARET_TEXT = '\u200b';

export type MathTemplateKind = 'integral' | 'summation' | 'product' | 'custom';
export type MathSlotRole = 'upper' | 'lower' | 'body' | 'variable';
export type AnswerToolPanel = 'table' | 'formula' | 'symbols';
export type TextFormatKind = 'bold' | 'italic' | 'underline';
export const MATH_SLOT_ORDER: MathSlotRole[] = ['upper', 'lower', 'body', 'variable'];
export const TEXT_FORMAT_COMMANDS: Record<TextFormatKind, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
};
export const TEXT_FORMAT_TAGS: Record<TextFormatKind, keyof HTMLElementTagNameMap> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
};

export interface ActiveTextFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface SelectedMathContext {
  id: string;
  template: MathTemplateKind;
  activeSlot: MathSlotRole | null;
  slots: MathSlotRole[];
  values: MathSlotValues;
  latex: string;
}

export type MathSlotValues = Record<MathSlotRole, string>;

export const FORMULA_TEMPLATES: Array<{
  kind: MathTemplateKind;
  zh: string;
  en: string;
}> = [
  { kind: 'integral', zh: '定积分', en: 'Integral' },
  { kind: 'summation', zh: '求和', en: 'Summation' },
  { kind: 'product', zh: '求乘积', en: 'Product' },
];

export const FORMULA_EXAMPLES = [
  { zh: '分数', en: 'Fraction', latex: '\\frac{a+b}{c}' },
  { zh: '平方', en: 'Square', latex: 'x^2 + y^2 = z^2' },
  { zh: '定积分', en: 'Integral', latex: '\\int_{0}^{1} f(x)\\,dx' },
  { zh: '求和', en: 'Summation', latex: '\\sum_{i=1}^{n} a_i' },
  { zh: '极限', en: 'Limit', latex: '\\lim_{x\\to 0} \\frac{\\sin x}{x}=1' },
] as const;

export const FORMULA_SCRIPT_SNIPPETS = [
  'x_{1}',
  'x_{2}',
  'x_{k}',
  'x_{n}',
  'x^{2}',
  'x^{i}',
  'x^{k}',
  'x^{n}',
] as const;

export const DEFAULT_FORMULA_LATEX = '\\int_{0}^{1} f(x)\\,dx';

export type InsertRequest =
  | { kind: 'insert'; text: string; placement?: 'cursor' | 'block'; mode?: 'text' | 'html' }
  | {
      kind: 'wrap';
      before: string;
      after: string;
      placeholder: string;
      placement?: 'cursor' | 'block';
      mode?: 'text' | 'html';
      autoExit?: 'script';
    }
  | {
      kind: 'table';
      rows: number;
      cols: number;
    }
  | {
      kind: 'mathTemplate';
      template: MathTemplateKind;
    }
  | {
      kind: 'mathLatex';
      latex: string;
    }
  | {
      kind: 'format';
      format: TextFormatKind;
    };

export interface AnswerComposerController {
  editorId: string;
  selectedMath: SelectedMathContext | null;
  activeToolPanel: AnswerToolPanel | null;
  activeTextFormats: ActiveTextFormats;
  applyEdit: (request: InsertRequest) => void;
  captureSelection: () => void;
  focusMathSlot: (slot: MathSlotRole) => void;
  selectMathElement: (element: HTMLElement, activeSlot?: MathSlotRole | null) => void;
  updateMathSlot: (slot: MathSlotRole, value: string) => void;
  beginMathPanelInteraction: () => void;
  shouldSkipEditorBlur: () => boolean;
  toggleToolPanel: (panel: AnswerToolPanel) => void;
  closeToolPanel: () => void;
}

export interface AnswerComposerProps {
  value: string;
  onChange: (value: string) => void;
  locale: 'zh-CN' | 'en-US';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  showToolbar?: boolean;
  showToolbarPanels?: boolean;
  controller?: AnswerComposerController;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
}

export function label(locale: 'zh-CN' | 'en-US', zh: string, en: string) {
  return locale === 'zh-CN' ? zh : en;
}

export function mathTemplateLabel(kind: MathTemplateKind, locale: 'zh-CN' | 'en-US') {
  if (kind === 'custom') return label(locale, '公式', 'Formula');
  const template = FORMULA_TEMPLATES.find((item) => item.kind === kind);
  if (!template) return kind;
  return locale === 'zh-CN' ? template.zh : template.en;
}

export function mathSlotLabel(role: MathSlotRole, locale: 'zh-CN' | 'en-US') {
  const labels: Record<MathSlotRole, { zh: string; en: string }> = {
    upper: { zh: '上标', en: 'Upper' },
    lower: { zh: '下标', en: 'Lower' },
    body: { zh: '内容', en: 'Body' },
    variable: { zh: '变量', en: 'Variable' },
  };
  return locale === 'zh-CN' ? labels[role].zh : labels[role].en;
}

export function defaultMathSlotValues(kind: MathTemplateKind, selectedText = ''): MathSlotValues {
  return {
    upper: kind === 'integral' ? '1' : 'n',
    lower: kind === 'integral' ? '0' : 'i=1',
    body: selectedText || (kind === 'custom' ? '' : kind === 'integral' ? 'f(x)' : 'a_i'),
    variable: 'x',
  };
}

export function mathSlotsForTemplate(kind: MathTemplateKind): MathSlotRole[] {
  if (kind === 'custom') return [];
  return kind === 'integral' ? MATH_SLOT_ORDER : ['upper', 'lower', 'body'];
}

export function defaultActiveMathSlot(kind: MathTemplateKind): MathSlotRole {
  return mathSlotsForTemplate(kind).includes('body') ? 'body' : mathSlotsForTemplate(kind)[0];
}

export function latexFromTemplate(kind: MathTemplateKind, values: MathSlotValues): string {
  if (kind === 'custom') return values.body.trim();

  const upper = values.upper.trim() || ' ';
  const lower = values.lower.trim() || ' ';
  const body = values.body.trim() || ' ';

  if (kind === 'integral') {
    const variable = values.variable.trim() || 'x';
    return `\\int_{${lower}}^{${upper}} ${body}\\,d${variable}`;
  }

  const operator = kind === 'summation' ? '\\sum' : '\\prod';
  return `${operator}_{${lower}}^{${upper}} ${body}`;
}

export function nestedLatexForTemplate(kind: MathTemplateKind, inheritedBody = ''): string {
  return latexFromTemplate(kind, defaultMathSlotValues(kind, inheritedBody));
}

export function renderEditableMathHtml(latex: string): string {
  return renderMathToHtml(latex, { forceInline: true });
}

export function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && source[cursor] === '\\') {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

export function isSingleDollarDelimiter(source: string, index: number): boolean {
  return (
    source[index] === '$' &&
    source[index - 1] !== '$' &&
    source[index + 1] !== '$' &&
    !isEscaped(source, index)
  );
}

export function findInlineMathExit(source: string, index: number): number | null {
  let openIndex: number | null = null;

  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (!isSingleDollarDelimiter(source, cursor)) continue;

    if (openIndex === null) {
      openIndex = cursor;
      continue;
    }

    if (index > openIndex && index <= cursor) {
      return cursor + 1;
    }

    openIndex = null;
  }

  return null;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function looksLikeAnswerHtml(value: string): boolean {
  return /<\/?(?:table|tbody|thead|tr|td|th|span|strong|b|em|i|u|sup|sub|ul|ol|li|br|div|p)\b/i.test(
    value,
  );
}

export function valueToEditorHtml(value: string): string {
  if (!value) return '';
  if (looksLikeAnswerHtml(value)) return sanitizeAnswerHtml(value);
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function editorTextValue(editor: HTMLElement): string {
  return (editor.innerText || '')
    .replaceAll(FORMAT_CARET_TEXT, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function editorHasRichContent(editor: HTMLElement): boolean {
  return Boolean(
    editor.querySelector(
      'table, [data-answer-math-template], span[style], strong, b, em, i, u, sup, sub, ul, ol, li, h1, h2, h3, h4, h5, h6',
    ),
  );
}

export function editorToValue(editor: HTMLElement): string {
  const visibleText = (editor.textContent ?? '').replaceAll(FORMAT_CARET_TEXT, '');
  if (!visibleText.trim() && !editor.querySelector('table, [data-answer-math-template]')) return '';
  if (!editorHasRichContent(editor)) return editorTextValue(editor);
  return sanitizeAnswerHtml(editor.innerHTML);
}

export function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^(font-family|font-size)\s*:/i.test(part))
    .join('; ');
}

export function sanitizeAnswerHtml(html: string): string {
  if (typeof document === 'undefined') return escapeHtml(html);

  const allowedTags = new Set([
    'BR',
    'B',
    'DIV',
    'P',
    'SPAN',
    'STRONG',
    'EM',
    'I',
    'U',
    'SUP',
    'SUB',
    'UL',
    'OL',
    'LI',
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'TH',
    'TD',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ]);
  const template = document.createElement('template');
  template.innerHTML = html;

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode((node.textContent ?? '').replaceAll(FORMAT_CARET_TEXT, ''));
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as HTMLElement;
    const tag = element.tagName;
    const normalizedTag = tag === 'B' ? 'STRONG' : tag === 'I' ? 'EM' : tag;

    if (element.hasAttribute('data-answer-math-template')) {
      const template = element.getAttribute('data-answer-math-template') as MathTemplateKind | null;
      if (!template || !['integral', 'summation', 'product', 'custom'].includes(template)) {
        return null;
      }

      const id =
        element.getAttribute('data-answer-math-id') ||
        `math-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (template === 'custom') {
        const latex = element.getAttribute('data-answer-math-latex') || element.textContent || '';
        return createMathLatexElement(latex, id);
      }
      return createMathTemplateElement(template, '', {
        id,
        values: mathSlotValuesFromElement(element, template),
      }).element;
    }

    if (!allowedTags.has(normalizedTag)) {
      const fragment = document.createDocumentFragment();
      element.childNodes.forEach((child) => {
        const cleanChild = cleanNode(child);
        if (cleanChild) fragment.appendChild(cleanChild);
      });
      return fragment;
    }

    const clone = document.createElement(normalizedTag.toLowerCase());
    if (tag === 'SPAN' && element.getAttribute('style')) {
      const safeStyle = sanitizeStyle(element.getAttribute('style') ?? '');
      if (safeStyle) clone.setAttribute('style', safeStyle);
    }
    if (tag === 'SPAN' && element.getAttribute('data-answer-selection')) {
      clone.setAttribute(
        'data-answer-selection',
        element.getAttribute('data-answer-selection') ?? '',
      );
    }
    [
      'data-answer-math-template',
      'data-answer-math-id',
      'data-answer-math-latex',
      'data-answer-math-upper',
      'data-answer-math-lower',
      'data-answer-math-body',
      'data-answer-math-variable',
      'data-answer-math-selected',
      'data-answer-math-role',
      'data-answer-math-slot',
    ].forEach((attribute) => {
      if (element.getAttribute(attribute)) {
        clone.setAttribute(attribute, element.getAttribute(attribute) ?? '');
      }
    });
    if (tag === 'TABLE') {
      clone.setAttribute('data-answer-table', 'true');
      clone.setAttribute('contenteditable', 'false');
    }
    if (tag === 'DIV' && element.getAttribute('data-answer-cell')) {
      clone.setAttribute('data-answer-cell', 'true');
      clone.setAttribute('contenteditable', 'true');
      clone.setAttribute('role', 'textbox');
      clone.setAttribute('aria-label', element.getAttribute('aria-label') ?? '');
    }

    element.childNodes.forEach((child) => {
      const cleanChild = cleanNode(child);
      if (cleanChild) clone.appendChild(cleanChild);
    });

    return clone;
  };

  const cleanFragment = document.createDocumentFragment();
  template.content.childNodes.forEach((child) => {
    const cleanChild = cleanNode(child);
    if (cleanChild) cleanFragment.appendChild(cleanChild);
  });

  const output = document.createElement('div');
  output.appendChild(cleanFragment);
  return output.innerHTML;
}

export function rangeBelongsToEditor(range: Range, editor: HTMLElement): boolean {
  const container = range.commonAncestorContainer;
  return editor === container || editor.contains(container);
}

export function getTextOffset(editor: HTMLElement, range: Range): number {
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

export function findTextPosition(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.nodeValue?.length ?? 0;
    if (remaining <= length) {
      return { node, offset: remaining };
    }
    remaining -= length;
  }

  return null;
}

export function moveRangeOutOfInlineMath(editor: HTMLElement, range: Range): Range {
  const textOffset = getTextOffset(editor, range);
  const plainText = editor.textContent ?? '';
  const exit = findInlineMathExit(plainText, textOffset);
  if (exit === null) return range;

  const position = findTextPosition(editor, exit);
  if (!position) return range;

  const nextRange = document.createRange();
  nextRange.setStart(position.node, position.offset);
  nextRange.collapse(true);
  return nextRange;
}

export function closestElementWithAttribute(
  node: Node | null,
  editor: HTMLElement,
  attribute: string,
): HTMLElement | null {
  let element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : ((node as ChildNode | null)?.parentElement ?? null);

  while (element && element !== editor) {
    if (element.hasAttribute(attribute)) return element;
    element = element.parentElement;
  }

  return null;
}

export function mathSlotValuesFromElement(
  mathElement: HTMLElement,
  template: MathTemplateKind,
): MathSlotValues {
  const defaults = defaultMathSlotValues(template);
  const readSlot = (slot: MathSlotRole) =>
    mathElement.getAttribute(`data-answer-math-${slot}`) ||
    mathElement.querySelector(`[data-answer-math-slot="${slot}"]`)?.textContent ||
    defaults[slot];

  return {
    upper: readSlot('upper'),
    lower: readSlot('lower'),
    body: readSlot('body'),
    variable: readSlot('variable'),
  };
}

export function mathContextFromElement(
  mathElement: HTMLElement,
  activeSlot: MathSlotRole | null = null,
): SelectedMathContext | null {
  const template = mathElement.getAttribute('data-answer-math-template') as MathTemplateKind | null;
  const id = mathElement.getAttribute('data-answer-math-id');
  if (!template || !id) return null;

  const values = mathSlotValuesFromElement(mathElement, template);
  const latex =
    mathElement.getAttribute('data-answer-math-latex') || latexFromTemplate(template, values);

  return {
    id,
    template,
    activeSlot,
    slots: mathSlotsForTemplate(template),
    values,
    latex,
  };
}

export function mathContextFromRange(
  range: Range,
  editor: HTMLElement,
): SelectedMathContext | null {
  const mathElement =
    closestElementWithAttribute(
      range.commonAncestorContainer,
      editor,
      'data-answer-math-template',
    ) ||
    closestElementWithAttribute(range.startContainer, editor, 'data-answer-math-template') ||
    closestElementWithAttribute(range.endContainer, editor, 'data-answer-math-template');

  return mathElement ? mathContextFromElement(mathElement) : null;
}

export function sameMathContext(
  first: SelectedMathContext | null,
  second: SelectedMathContext | null,
): boolean {
  if (!first || !second) return first === second;
  return (
    first.id === second.id &&
    first.template === second.template &&
    first.activeSlot === second.activeSlot &&
    first.slots.join('|') === second.slots.join('|') &&
    first.latex === second.latex
  );
}

export function preserveActiveMathSlot(
  next: SelectedMathContext | null,
  current: SelectedMathContext | null,
): SelectedMathContext | null {
  if (!next || !current || next.id !== current.id || next.activeSlot) return next;
  return { ...next, activeSlot: current.activeSlot };
}

export function commandState(command: string): boolean {
  try {
    return Boolean(document.queryCommandState(command));
  } catch {
    return false;
  }
}

export function textFormatsFromRange(range: Range, editor: HTMLElement): ActiveTextFormats {
  const formats: ActiveTextFormats = { bold: false, italic: false, underline: false };

  const visitAncestors = (node: Node | null) => {
    let element =
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : ((node as ChildNode | null)?.parentElement ?? null);

    while (element && element !== editor) {
      const tagName = element.tagName;
      if (tagName === 'STRONG' || tagName === 'B') formats.bold = true;
      if (tagName === 'EM' || tagName === 'I') formats.italic = true;
      if (tagName === 'U') formats.underline = true;
      element = element.parentElement;
    }
  };

  visitAncestors(range.commonAncestorContainer);
  visitAncestors(range.startContainer);
  visitAncestors(range.endContainer);

  formats.bold = formats.bold || commandState('bold');
  formats.italic = formats.italic || commandState('italic');
  formats.underline = formats.underline || commandState('underline');

  return formats;
}

export function sameTextFormats(first: ActiveTextFormats, second: ActiveTextFormats): boolean {
  return (
    first.bold === second.bold &&
    first.italic === second.italic &&
    first.underline === second.underline
  );
}

export function rangeAtEditorEnd(editor: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

export function closestScriptElement(node: Node | null, editor: HTMLElement): HTMLElement | null {
  let element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : ((node as ChildNode | null)?.parentElement ?? null);

  while (element && element !== editor) {
    if (element.tagName === 'SUP' || element.tagName === 'SUB') return element;
    element = element.parentElement;
  }

  return null;
}

export function closestTextFormatElement(
  node: Node | null,
  editor: HTMLElement,
  format: TextFormatKind,
): HTMLElement | null {
  const tagName = TEXT_FORMAT_TAGS[format].toUpperCase();
  let element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : ((node as ChildNode | null)?.parentElement ?? null);

  while (element && element !== editor) {
    if (element.tagName === tagName) return element;
    element = element.parentElement;
  }

  return null;
}

export function createTextFormatCaretElement(format: TextFormatKind): {
  element: HTMLElement;
  textNode: Text;
} {
  const element = document.createElement(TEXT_FORMAT_TAGS[format]);
  const textNode = document.createTextNode(FORMAT_CARET_TEXT);
  element.appendChild(textNode);
  return { element, textNode };
}

export function countFormatCaretText(text: string): number {
  return Array.from(text).filter((character) => character === FORMAT_CARET_TEXT).length;
}

export function cleanupFormatCaretText(editor: HTMLElement): Range | null {
  const selection = window.getSelection();
  const currentRange =
    selection?.rangeCount && rangeBelongsToEditor(selection.getRangeAt(0), editor)
      ? selection.getRangeAt(0).cloneRange()
      : null;

  const adjustedRange = currentRange?.cloneRange() ?? null;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue ?? '';
    if (!value.includes(FORMAT_CARET_TEXT)) continue;

    const cleanValue = value.replaceAll(FORMAT_CARET_TEXT, '');
    if (!cleanValue) {
      const parentVisibleText = (node.parentElement?.textContent ?? '').replaceAll(
        FORMAT_CARET_TEXT,
        '',
      );
      if (parentVisibleText) node.remove();
      continue;
    }

    const adjustOffset = (offset: number) =>
      Math.max(0, offset - countFormatCaretText(value.slice(0, offset)));

    if (adjustedRange && currentRange?.startContainer === node) {
      adjustedRange.setStart(node, adjustOffset(currentRange.startOffset));
    }
    if (adjustedRange && currentRange?.endContainer === node) {
      adjustedRange.setEnd(node, adjustOffset(currentRange.endOffset));
    }

    node.nodeValue = cleanValue;
  }

  if (!adjustedRange) return currentRange;
  selection?.removeAllRanges();
  selection?.addRange(adjustedRange);
  return adjustedRange;
}

export function rangeIsAtEndOfElement(range: Range, element: HTMLElement): boolean {
  if (!element.contains(range.endContainer)) return false;

  const tail = document.createRange();
  tail.selectNodeContents(element);
  tail.setStart(range.endContainer, range.endOffset);
  return tail.toString().length === 0;
}

export function moveCaretAfterNodeWithText(node: Node, text: string): Range | null {
  const parent = node.parentNode;
  if (!parent) return null;

  const textNode = document.createTextNode(text);
  parent.insertBefore(textNode, node.nextSibling);

  const range = document.createRange();
  range.setStart(textNode, text.length);
  range.collapse(true);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  return range;
}

export function exitScriptPlaceholderAfterInput(editor: HTMLElement): boolean {
  const marker = editor.querySelector(
    '[data-answer-script-placeholder="true"]',
  ) as HTMLElement | null;
  const selection = window.getSelection();
  if (!marker || !selection?.rangeCount) return false;

  const range = selection.getRangeAt(0);
  if (!rangeBelongsToEditor(range, editor) || !marker.contains(range.endContainer)) return false;

  const scriptElement = closestScriptElement(marker, editor);
  const markerText = marker.textContent ?? '';
  if (!scriptElement || markerText.length === 0) return false;

  marker.replaceWith(document.createTextNode(markerText));

  const nextRange = document.createRange();
  nextRange.setStartAfter(scriptElement);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);

  return true;
}

export function createTableElement(rows: number, cols: number): HTMLTableElement {
  const table = document.createElement('table');
  table.setAttribute('data-answer-table', 'true');
  table.setAttribute('contenteditable', 'false');
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  Array.from({ length: rows }).forEach((_, rowIndex) => {
    const tr = document.createElement('tr');
    tbody.appendChild(tr);
    Array.from({ length: cols }).forEach((__, colIndex) => {
      const td = document.createElement('td');
      const cellEditor = document.createElement('div');
      cellEditor.setAttribute('data-answer-cell', 'true');
      cellEditor.setAttribute('contenteditable', 'true');
      cellEditor.setAttribute('role', 'textbox');
      cellEditor.setAttribute('aria-label', `R${rowIndex + 1}C${colIndex + 1}`);
      cellEditor.appendChild(document.createElement('br'));
      td.appendChild(cellEditor);
      tr.appendChild(td);
    });
  });

  return table;
}

export function createMathLatexElement(latex: string, id?: string): HTMLSpanElement {
  const root = document.createElement('span');
  const normalizedLatex = latex.trim();

  root.setAttribute('data-answer-math-template', 'custom');
  root.setAttribute(
    'data-answer-math-id',
    id ?? `math-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  root.setAttribute('data-answer-math-latex', normalizedLatex);
  root.setAttribute('contenteditable', 'false');
  root.setAttribute('tabindex', '0');
  root.setAttribute('role', 'button');
  root.setAttribute('aria-label', normalizedLatex);
  root.innerHTML = renderEditableMathHtml(normalizedLatex);

  return root;
}

export function createMathTemplateElement(
  template: MathTemplateKind,
  selectedText: string,
  options: { id?: string; values?: MathSlotValues } = {},
): { element: HTMLSpanElement; focusSlot: HTMLElement | null } {
  const root = document.createElement('span');
  const values = options.values ?? defaultMathSlotValues(template, selectedText);
  const latex = latexFromTemplate(template, values);

  root.setAttribute('data-answer-math-template', template);
  root.setAttribute(
    'data-answer-math-id',
    options.id ?? `math-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  root.setAttribute('data-answer-math-latex', latex);
  root.setAttribute('data-answer-math-upper', values.upper);
  root.setAttribute('data-answer-math-lower', values.lower);
  root.setAttribute('data-answer-math-body', values.body);
  root.setAttribute('data-answer-math-variable', values.variable);
  root.setAttribute('contenteditable', 'false');
  root.setAttribute('tabindex', '0');
  root.setAttribute('role', 'button');
  root.setAttribute('aria-label', latex);
  root.innerHTML = renderEditableMathHtml(latex);

  return {
    element: root,
    focusSlot: null,
  };
}

export function updateMathElement(
  element: HTMLElement,
  template: MathTemplateKind,
  values: MathSlotValues,
) {
  const latex = latexFromTemplate(template, values);
  element.setAttribute('data-answer-math-latex', latex);
  element.setAttribute('data-answer-math-upper', values.upper);
  element.setAttribute('data-answer-math-lower', values.lower);
  element.setAttribute('data-answer-math-body', values.body);
  element.setAttribute('data-answer-math-variable', values.variable);
  element.setAttribute('aria-label', latex);
  element.innerHTML = renderEditableMathHtml(latex);
}

export function markSelectedMath(editor: HTMLElement, selectedId: string | null) {
  editor.querySelectorAll('[data-answer-math-selected]').forEach((element) => {
    element.removeAttribute('data-answer-math-selected');
  });
  if (!selectedId) return;

  const selected = editor.querySelector(`[data-answer-math-id="${selectedId}"]`);
  selected?.setAttribute('data-answer-math-selected', 'true');
}

export function fragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = sanitizeAnswerHtml(html);
  return template.content;
}
