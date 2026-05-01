'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Braces,
  Italic,
  List,
  ListOrdered,
  SquareFunction,
  Table2,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { renderMathToHtml } from '@/lib/math-engine';

const MATH_SYMBOL_GROUPS = [
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

const TABLE_PICKER_ROWS = 6;
const TABLE_PICKER_COLS = 6;
const FORMAT_CARET_TEXT = '\u200b';

type MathTemplateKind = 'integral' | 'summation' | 'product' | 'custom';
type MathSlotRole = 'upper' | 'lower' | 'body' | 'variable';
type AnswerToolPanel = 'table' | 'formula' | 'symbols';
type TextFormatKind = 'bold' | 'italic' | 'underline';
const MATH_SLOT_ORDER: MathSlotRole[] = ['upper', 'lower', 'body', 'variable'];
const TEXT_FORMAT_COMMANDS: Record<TextFormatKind, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
};
const TEXT_FORMAT_TAGS: Record<TextFormatKind, keyof HTMLElementTagNameMap> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
};

interface ActiveTextFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface SelectedMathContext {
  id: string;
  template: MathTemplateKind;
  activeSlot: MathSlotRole | null;
  slots: MathSlotRole[];
  values: MathSlotValues;
  latex: string;
}

type MathSlotValues = Record<MathSlotRole, string>;

const FORMULA_TEMPLATES: Array<{
  kind: MathTemplateKind;
  zh: string;
  en: string;
}> = [
  { kind: 'integral', zh: '定积分', en: 'Integral' },
  { kind: 'summation', zh: '求和', en: 'Summation' },
  { kind: 'product', zh: '求乘积', en: 'Product' },
];

const FORMULA_EXAMPLES = [
  { zh: '分数', en: 'Fraction', latex: '\\frac{a+b}{c}' },
  { zh: '平方', en: 'Square', latex: 'x^2 + y^2 = z^2' },
  { zh: '定积分', en: 'Integral', latex: '\\int_{0}^{1} f(x)\\,dx' },
  { zh: '求和', en: 'Summation', latex: '\\sum_{i=1}^{n} a_i' },
  { zh: '极限', en: 'Limit', latex: '\\lim_{x\\to 0} \\frac{\\sin x}{x}=1' },
] as const;

const FORMULA_SCRIPT_SNIPPETS = [
  'x_{1}',
  'x_{2}',
  'x_{k}',
  'x_{n}',
  'x^{2}',
  'x^{i}',
  'x^{k}',
  'x^{n}',
] as const;

const DEFAULT_FORMULA_LATEX = '\\int_{0}^{1} f(x)\\,dx';

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

interface AnswerComposerProps {
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

function label(locale: 'zh-CN' | 'en-US', zh: string, en: string) {
  return locale === 'zh-CN' ? zh : en;
}

function mathTemplateLabel(kind: MathTemplateKind, locale: 'zh-CN' | 'en-US') {
  if (kind === 'custom') return label(locale, '公式', 'Formula');
  const template = FORMULA_TEMPLATES.find((item) => item.kind === kind);
  if (!template) return kind;
  return locale === 'zh-CN' ? template.zh : template.en;
}

function mathSlotLabel(role: MathSlotRole, locale: 'zh-CN' | 'en-US') {
  const labels: Record<MathSlotRole, { zh: string; en: string }> = {
    upper: { zh: '上标', en: 'Upper' },
    lower: { zh: '下标', en: 'Lower' },
    body: { zh: '内容', en: 'Body' },
    variable: { zh: '变量', en: 'Variable' },
  };
  return locale === 'zh-CN' ? labels[role].zh : labels[role].en;
}

function defaultMathSlotValues(kind: MathTemplateKind, selectedText = ''): MathSlotValues {
  return {
    upper: kind === 'integral' ? '1' : 'n',
    lower: kind === 'integral' ? '0' : 'i=1',
    body: selectedText || (kind === 'custom' ? '' : kind === 'integral' ? 'f(x)' : 'a_i'),
    variable: 'x',
  };
}

function mathSlotsForTemplate(kind: MathTemplateKind): MathSlotRole[] {
  if (kind === 'custom') return [];
  return kind === 'integral' ? MATH_SLOT_ORDER : ['upper', 'lower', 'body'];
}

function defaultActiveMathSlot(kind: MathTemplateKind): MathSlotRole {
  return mathSlotsForTemplate(kind).includes('body') ? 'body' : mathSlotsForTemplate(kind)[0];
}

function latexFromTemplate(kind: MathTemplateKind, values: MathSlotValues): string {
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

function nestedLatexForTemplate(kind: MathTemplateKind, inheritedBody = ''): string {
  return latexFromTemplate(kind, defaultMathSlotValues(kind, inheritedBody));
}

function renderEditableMathHtml(latex: string): string {
  return renderMathToHtml(latex, { forceInline: true });
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && source[cursor] === '\\') {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

function isSingleDollarDelimiter(source: string, index: number): boolean {
  return (
    source[index] === '$' &&
    source[index - 1] !== '$' &&
    source[index + 1] !== '$' &&
    !isEscaped(source, index)
  );
}

function findInlineMathExit(source: string, index: number): number | null {
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

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function looksLikeAnswerHtml(value: string): boolean {
  return /<\/?(?:table|tbody|thead|tr|td|th|span|strong|b|em|i|u|sup|sub|ul|ol|li|br|div|p)\b/i.test(
    value,
  );
}

function valueToEditorHtml(value: string): string {
  if (!value) return '';
  if (looksLikeAnswerHtml(value)) return sanitizeAnswerHtml(value);
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function editorTextValue(editor: HTMLElement): string {
  return (editor.innerText || '')
    .replaceAll(FORMAT_CARET_TEXT, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function editorHasRichContent(editor: HTMLElement): boolean {
  return Boolean(
    editor.querySelector(
      'table, [data-answer-math-template], span[style], strong, b, em, i, u, sup, sub, ul, ol, li, h1, h2, h3, h4, h5, h6',
    ),
  );
}

function editorToValue(editor: HTMLElement): string {
  const visibleText = (editor.textContent ?? '').replaceAll(FORMAT_CARET_TEXT, '');
  if (!visibleText.trim() && !editor.querySelector('table, [data-answer-math-template]')) return '';
  if (!editorHasRichContent(editor)) return editorTextValue(editor);
  return sanitizeAnswerHtml(editor.innerHTML);
}

function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^(font-family|font-size)\s*:/i.test(part))
    .join('; ');
}

function sanitizeAnswerHtml(html: string): string {
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

function rangeBelongsToEditor(range: Range, editor: HTMLElement): boolean {
  const container = range.commonAncestorContainer;
  return editor === container || editor.contains(container);
}

function getTextOffset(editor: HTMLElement, range: Range): number {
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

function findTextPosition(
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

function moveRangeOutOfInlineMath(editor: HTMLElement, range: Range): Range {
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

function closestElementWithAttribute(
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

function mathSlotValuesFromElement(
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

function mathContextFromElement(
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

function mathContextFromRange(range: Range, editor: HTMLElement): SelectedMathContext | null {
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

function sameMathContext(
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

function preserveActiveMathSlot(
  next: SelectedMathContext | null,
  current: SelectedMathContext | null,
): SelectedMathContext | null {
  if (!next || !current || next.id !== current.id || next.activeSlot) return next;
  return { ...next, activeSlot: current.activeSlot };
}

function commandState(command: string): boolean {
  try {
    return Boolean(document.queryCommandState(command));
  } catch {
    return false;
  }
}

function textFormatsFromRange(range: Range, editor: HTMLElement): ActiveTextFormats {
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

function sameTextFormats(first: ActiveTextFormats, second: ActiveTextFormats): boolean {
  return (
    first.bold === second.bold &&
    first.italic === second.italic &&
    first.underline === second.underline
  );
}

function rangeAtEditorEnd(editor: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

function closestScriptElement(node: Node | null, editor: HTMLElement): HTMLElement | null {
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

function closestTextFormatElement(
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

function createTextFormatCaretElement(format: TextFormatKind): {
  element: HTMLElement;
  textNode: Text;
} {
  const element = document.createElement(TEXT_FORMAT_TAGS[format]);
  const textNode = document.createTextNode(FORMAT_CARET_TEXT);
  element.appendChild(textNode);
  return { element, textNode };
}

function countFormatCaretText(text: string): number {
  return Array.from(text).filter((character) => character === FORMAT_CARET_TEXT).length;
}

function cleanupFormatCaretText(editor: HTMLElement): Range | null {
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

function rangeIsAtEndOfElement(range: Range, element: HTMLElement): boolean {
  if (!element.contains(range.endContainer)) return false;

  const tail = document.createRange();
  tail.selectNodeContents(element);
  tail.setStart(range.endContainer, range.endOffset);
  return tail.toString().length === 0;
}

function moveCaretAfterNodeWithText(node: Node, text: string): Range | null {
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

function exitScriptPlaceholderAfterInput(editor: HTMLElement): boolean {
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

function createTableElement(rows: number, cols: number): HTMLTableElement {
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

function createMathLatexElement(latex: string, id?: string): HTMLSpanElement {
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

function createMathTemplateElement(
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

function updateMathElement(
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

function markSelectedMath(editor: HTMLElement, selectedId: string | null) {
  editor.querySelectorAll('[data-answer-math-selected]').forEach((element) => {
    element.removeAttribute('data-answer-math-selected');
  });
  if (!selectedId) return;

  const selected = editor.querySelector(`[data-answer-math-id="${selectedId}"]`);
  selected?.setAttribute('data-answer-math-selected', 'true');
}

function fragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = sanitizeAnswerHtml(html);
  return template.content;
}

function ToolButton({
  title,
  disabled,
  active = false,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={title}
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white',
            active &&
              'bg-slate-200 text-slate-950 shadow-inner hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-800',
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function AnswerComposer({
  value,
  onChange,
  locale,
  disabled,
  placeholder,
  className,
  textareaClassName,
  showToolbar = true,
  showToolbarPanels = true,
  controller,
  footerStart,
  footerEnd,
}: AnswerComposerProps) {
  const internalController = useAnswerComposerController({ value, onChange, disabled });
  const activeController = controller ?? internalController;
  const editorRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editorToValue(editor) === value) return;

    editor.innerHTML = valueToEditorHtml(value);
  }, [value]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    exitScriptPlaceholderAfterInput(editor);
    cleanupFormatCaretText(editor);
    activeController.captureSelection();
    onChange(editorToValue(editor));
  }, [activeController, onChange]);

  const moveOutOfScriptWithSpace = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !rangeBelongsToEditor(range, editor)) return false;

    const scriptElement = closestScriptElement(range.endContainer, editor);
    if (!scriptElement || !rangeIsAtEndOfElement(range, scriptElement)) return false;

    const nextRange = moveCaretAfterNodeWithText(scriptElement, ' ');
    if (!nextRange) return false;

    activeController.captureSelection();
    onChange(editorToValue(editor));
    return true;
  }, [activeController, onChange]);

  const handleBeforeInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType !== 'insertText' || nativeEvent.data !== ' ') return;
      if (!moveOutOfScriptWithSpace()) return;

      event.preventDefault();
    },
    [moveOutOfScriptWithSpace],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space') return;
      if (!moveOutOfScriptWithSpace()) return;

      event.preventDefault();
    },
    [moveOutOfScriptWithSpace],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) return;

      const mathElement = closestElementWithAttribute(
        event.target as Node,
        editor,
        'data-answer-math-template',
      );
      if (!mathElement) return;

      event.preventDefault();
      activeController.selectMathElement(mathElement);
    },
    [activeController],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as HTMLElement | null;
      if (
        activeController.shouldSkipEditorBlur() ||
        nextTarget?.closest('[data-answer-math-panel="true"]')
      ) {
        return;
      }

      activeController.captureSelection();
    },
    [activeController],
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-colors focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/40 dark:focus-within:border-sky-700 dark:focus-within:ring-sky-950/60',
        className,
      )}
    >
      {showToolbar ? (
        <AnswerComposerToolbar
          controller={activeController}
          locale={locale}
          disabled={disabled}
          className="rounded-none border-0"
          showPanels={showToolbarPanels}
        />
      ) : null}

      <div
        ref={editorRef}
        id={activeController.editorId}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyUp={activeController.captureSelection}
        onMouseUp={activeController.captureSelection}
        className={cn(
          'min-h-[160px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-3 text-sm leading-7 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_em]:italic [&_strong]:font-semibold [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:min-w-20 [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:outline-none [&_th]:min-w-20 [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1.5 [&_[data-answer-cell]]:min-h-6 [&_[data-answer-cell]]:outline-none [&_[data-answer-cell]:focus]:bg-sky-50 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700 dark:[&_[data-answer-cell]:focus]:bg-sky-950/40',
          '[&_[data-answer-math-template]]:mx-1 [&_[data-answer-math-template]]:inline-flex [&_[data-answer-math-template]]:cursor-pointer [&_[data-answer-math-template]]:items-center [&_[data-answer-math-template]]:align-middle [&_[data-answer-math-template]]:rounded-md [&_[data-answer-math-template]]:border [&_[data-answer-math-template]]:border-transparent [&_[data-answer-math-template]]:px-1 [&_[data-answer-math-template]]:py-0.5 [&_[data-answer-math-template]]:outline-none [&_[data-answer-math-template]_.katex]:text-[1.08em] [&_[data-answer-math-selected=true]]:border-sky-300 [&_[data-answer-math-selected=true]]:bg-sky-50 dark:[&_[data-answer-math-selected=true]]:border-sky-700 dark:[&_[data-answer-math-selected=true]]:bg-sky-950/50',
          textareaClassName,
        )}
      />

      {(footerStart || footerEnd) && (
        <div className="flex min-h-10 items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <div className="min-w-0">{footerStart}</div>
          <div className="ml-auto shrink-0">{footerEnd}</div>
        </div>
      )}
    </div>
  );
}

export function useAnswerComposerController({
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): AnswerComposerController {
  const editorId = useId();
  const lastRangeRef = useRef<Range | null>(null);
  const selectedMathRef = useRef<SelectedMathContext | null>(null);
  const skipEditorBlurRef = useRef(false);
  const [selectedMath, setSelectedMath] = useState<SelectedMathContext | null>(null);
  const [activeToolPanel, setActiveToolPanel] = useState<AnswerToolPanel | null>(null);
  const [activeTextFormats, setActiveTextFormats] = useState<ActiveTextFormats>({
    bold: false,
    italic: false,
    underline: false,
  });

  const commitSelectedMath = useCallback((nextSelectedMath: SelectedMathContext | null) => {
    selectedMathRef.current = nextSelectedMath;
    setSelectedMath((current) =>
      sameMathContext(current, nextSelectedMath) ? current : nextSelectedMath,
    );
  }, []);

  const captureSelection = useCallback(() => {
    if (typeof document === 'undefined') return;

    const editor = document.getElementById(editorId) as HTMLElement | null;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!rangeBelongsToEditor(range, editor)) return;
    lastRangeRef.current = range.cloneRange();
    const nextSelectedMath = preserveActiveMathSlot(
      mathContextFromRange(range, editor),
      selectedMathRef.current,
    );
    markSelectedMath(editor, nextSelectedMath?.id ?? null);
    commitSelectedMath(nextSelectedMath);
    const nextTextFormats = textFormatsFromRange(range, editor);
    setActiveTextFormats((current) =>
      sameTextFormats(current, nextTextFormats) ? current : nextTextFormats,
    );
  }, [commitSelectedMath, editorId]);

  const selectMathElement = useCallback(
    (element: HTMLElement, activeSlot: MathSlotRole | null = null) => {
      if (typeof document === 'undefined' || disabled) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor || !editor.contains(element)) return;

      const range = document.createRange();
      range.selectNode(element);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const nextRange = document.createRange();
      nextRange.setStartAfter(element);
      nextRange.collapse(true);
      lastRangeRef.current = nextRange.cloneRange();

      const template = element.getAttribute('data-answer-math-template') as MathTemplateKind | null;
      const nextSelectedMath = mathContextFromElement(
        element,
        activeSlot ?? (template ? defaultActiveMathSlot(template) : null),
      );
      markSelectedMath(editor, nextSelectedMath?.id ?? null);
      editor.focus();
      commitSelectedMath(nextSelectedMath);
      setActiveTextFormats(textFormatsFromRange(range, editor));
    },
    [commitSelectedMath, disabled, editorId],
  );

  const focusMathSlot = useCallback(
    (slot: MathSlotRole) => {
      const currentSelectedMath = selectedMathRef.current ?? selectedMath;
      if (typeof document === 'undefined' || disabled || !currentSelectedMath) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor) return;

      const mathElement = editor.querySelector(
        `[data-answer-math-id="${currentSelectedMath.id}"]`,
      ) as HTMLElement | null;
      if (!mathElement) return;

      markSelectedMath(editor, currentSelectedMath.id);
      const nextSelectedMath = mathContextFromElement(mathElement, slot);
      commitSelectedMath(nextSelectedMath);
    },
    [commitSelectedMath, disabled, editorId, selectedMath],
  );

  const updateMathSlot = useCallback(
    (slot: MathSlotRole, value: string) => {
      const currentSelectedMath = selectedMathRef.current ?? selectedMath;
      if (typeof document === 'undefined' || disabled || !currentSelectedMath) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor) return;

      const mathElement = editor.querySelector(
        `[data-answer-math-id="${currentSelectedMath.id}"]`,
      ) as HTMLElement | null;
      if (!mathElement) return;

      const values = {
        ...mathSlotValuesFromElement(mathElement, currentSelectedMath.template),
        [slot]: value,
      };

      updateMathElement(mathElement, currentSelectedMath.template, values);
      markSelectedMath(editor, currentSelectedMath.id);

      const nextSelectedMath = mathContextFromElement(mathElement, slot);
      commitSelectedMath(nextSelectedMath);
      onChange(editorToValue(editor));
    },
    [commitSelectedMath, disabled, editorId, onChange, selectedMath],
  );

  const beginMathPanelInteraction = useCallback(() => {
    skipEditorBlurRef.current = true;
    window.setTimeout(() => {
      skipEditorBlurRef.current = false;
    }, 200);
  }, []);

  const shouldSkipEditorBlur = useCallback(() => skipEditorBlurRef.current, []);

  const applyEdit = useCallback(
    (request: InsertRequest) => {
      if (disabled) return;

      const editor =
        typeof document === 'undefined'
          ? null
          : (document.getElementById(editorId) as HTMLElement | null);
      if (!editor) return;

      editor.focus();
      const selection = window.getSelection();
      const activeSelectedMath = selectedMathRef.current ?? selectedMath;

      if (
        request.kind === 'mathTemplate' &&
        activeSelectedMath?.activeSlot &&
        activeSelectedMath.activeSlot !== 'variable'
      ) {
        const mathElement = editor.querySelector(
          `[data-answer-math-id="${activeSelectedMath.id}"]`,
        ) as HTMLElement | null;
        if (mathElement) {
          const values = mathSlotValuesFromElement(mathElement, activeSelectedMath.template);
          const inheritedBody = activeSelectedMath.activeSlot === 'body' ? values.body : '';
          const nextValues = {
            ...values,
            [activeSelectedMath.activeSlot]: nestedLatexForTemplate(
              request.template,
              inheritedBody,
            ),
          };

          updateMathElement(mathElement, activeSelectedMath.template, nextValues);
          markSelectedMath(editor, activeSelectedMath.id);

          const nextSelectedMath = mathContextFromElement(
            mathElement,
            activeSelectedMath.activeSlot,
          );
          commitSelectedMath(nextSelectedMath);
          onChange(editorToValue(editor));
          return;
        }
      }

      const currentRange =
        selection?.rangeCount && rangeBelongsToEditor(selection.getRangeAt(0), editor)
          ? selection.getRangeAt(0).cloneRange()
          : lastRangeRef.current && rangeBelongsToEditor(lastRangeRef.current, editor)
            ? lastRangeRef.current.cloneRange()
            : rangeAtEditorEnd(editor);
      const shouldMoveRangeOut =
        request.kind === 'table' ||
        request.kind === 'mathTemplate' ||
        request.kind === 'mathLatex' ||
        (request.kind !== 'format' && request.placement === 'block');
      const range = shouldMoveRangeOut
        ? moveRangeOutOfInlineMath(editor, currentRange)
        : currentRange;
      const selectedText = range.toString();

      if (request.kind === 'mathLatex' && !request.latex.trim()) return;

      if (request.kind === 'format') {
        if (range.collapsed) {
          const activeFormatElement = closestTextFormatElement(
            range.endContainer,
            editor,
            request.format,
          );
          const nextRange = document.createRange();

          if (activeFormatElement) {
            nextRange.setStartAfter(activeFormatElement);
            nextRange.collapse(true);
          } else {
            const { element, textNode } = createTextFormatCaretElement(request.format);
            range.insertNode(element);
            nextRange.setStart(textNode, textNode.length);
            nextRange.collapse(true);
          }

          selection?.removeAllRanges();
          selection?.addRange(nextRange);
          lastRangeRef.current = nextRange.cloneRange();
          commitSelectedMath(mathContextFromRange(nextRange, editor));
          setActiveTextFormats(textFormatsFromRange(nextRange, editor));
          onChange(editorToValue(editor));
          requestAnimationFrame(() => {
            editor.focus();
          });
          return;
        }

        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('styleWithCSS', false, 'false');
        document.execCommand(TEXT_FORMAT_COMMANDS[request.format]);

        const nextRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : range;
        lastRangeRef.current = nextRange.cloneRange();
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
        onChange(editorToValue(editor));
        requestAnimationFrame(() => {
          editor.focus();
        });
        return;
      }

      range.deleteContents();

      const setCollapsedRangeAfter = (node: Node) => {
        const nextRange = document.createRange();
        nextRange.setStartAfter(node);
        nextRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(nextRange);
        lastRangeRef.current = nextRange.cloneRange();
        markSelectedMath(editor, null);
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      };

      if (request.kind === 'table') {
        const before = document.createElement('br');
        const table = createTableElement(request.rows, request.cols);
        const after = document.createElement('br');
        const fragment = document.createDocumentFragment();
        fragment.append(before, table, after);
        range.insertNode(fragment);

        const firstCell = table.querySelector('[data-answer-cell]');
        if (firstCell) {
          const cellRange = document.createRange();
          cellRange.selectNodeContents(firstCell);
          cellRange.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(cellRange);
          lastRangeRef.current = cellRange.cloneRange();
          commitSelectedMath(mathContextFromRange(cellRange, editor));
          setActiveTextFormats(textFormatsFromRange(cellRange, editor));
        } else {
          setCollapsedRangeAfter(after);
        }
      } else if (request.kind === 'mathTemplate') {
        const { element } = createMathTemplateElement(request.template, selectedText);
        const spacer = document.createTextNode(' ');
        const fragment = document.createDocumentFragment();
        fragment.append(element, spacer);
        range.insertNode(fragment);

        const nextRange = document.createRange();
        nextRange.setStartAfter(element);
        nextRange.collapse(true);
        const selectedRange = document.createRange();
        selectedRange.selectNode(element);
        selection?.removeAllRanges();
        selection?.addRange(selectedRange);
        lastRangeRef.current = nextRange.cloneRange();
        markSelectedMath(editor, element.getAttribute('data-answer-math-id'));
        commitSelectedMath(
          mathContextFromElement(element, defaultActiveMathSlot(request.template)),
        );
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      } else if (request.kind === 'mathLatex') {
        const element = createMathLatexElement(request.latex);
        const spacer = document.createTextNode(' ');
        const fragment = document.createDocumentFragment();
        fragment.append(element, spacer);
        range.insertNode(fragment);
        setCollapsedRangeAfter(spacer);
      } else if (request.kind === 'insert') {
        const inserted =
          request.mode === 'html'
            ? fragmentFromHtml(request.text)
            : document.createTextNode(request.text);
        const lastNode = inserted instanceof DocumentFragment ? inserted.lastChild : inserted;
        range.insertNode(inserted);
        if (lastNode) setCollapsedRangeAfter(lastNode);
      } else if (request.mode === 'html') {
        const marker = `answer-selection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const fragment = fragmentFromHtml(
          `${request.before}<span data-answer-selection="${marker}">${escapeHtml(
            selectedText || request.placeholder,
          )}</span>${request.after}`,
        );
        range.insertNode(fragment);
        const markerNode = editor.querySelector(`[data-answer-selection="${marker}"]`);
        if (markerNode) {
          markerNode.removeAttribute('data-answer-selection');
          if (request.autoExit === 'script' && !selectedText) {
            markerNode.setAttribute('data-answer-script-placeholder', 'true');
          }
          const nextRange = document.createRange();
          if (selectedText) {
            nextRange.setStartAfter(markerNode);
            nextRange.collapse(true);
          } else {
            nextRange.selectNodeContents(markerNode);
          }
          selection?.removeAllRanges();
          selection?.addRange(nextRange);
          lastRangeRef.current = nextRange.cloneRange();
          commitSelectedMath(mathContextFromRange(nextRange, editor));
          setActiveTextFormats(textFormatsFromRange(nextRange, editor));
        }
      } else {
        const insertedText = `${request.before}${selectedText || request.placeholder}${request.after}`;
        const textNode = document.createTextNode(insertedText);
        range.insertNode(textNode);
        const nextRange = document.createRange();
        if (selectedText) {
          nextRange.setStartAfter(textNode);
        } else {
          const selectionStart = request.before.length;
          const selectionEnd = selectionStart + request.placeholder.length;
          nextRange.setStart(textNode, selectionStart);
          nextRange.setEnd(textNode, selectionEnd);
        }
        selection?.removeAllRanges();
        selection?.addRange(nextRange);
        lastRangeRef.current = nextRange.cloneRange();
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      }

      onChange(editorToValue(editor));
      requestAnimationFrame(() => {
        editor.focus();
      });
    },
    [commitSelectedMath, disabled, editorId, onChange, selectedMath],
  );

  const toggleToolPanel = useCallback((panel: AnswerToolPanel) => {
    setActiveToolPanel((current) => (current === panel ? null : panel));
  }, []);

  const closeToolPanel = useCallback(() => {
    setActiveToolPanel(null);
  }, []);

  return {
    editorId,
    selectedMath,
    activeToolPanel,
    activeTextFormats,
    applyEdit,
    captureSelection,
    focusMathSlot,
    selectMathElement,
    updateMathSlot,
    beginMathPanelInteraction,
    shouldSkipEditorBlur,
    toggleToolPanel,
    closeToolPanel,
  };
}

export function AnswerComposerToolbar({
  controller,
  locale,
  disabled,
  className,
  fillPanels = false,
  showControls = true,
  showPanels = true,
}: {
  controller: AnswerComposerController;
  locale: 'zh-CN' | 'en-US';
  disabled?: boolean;
  className?: string;
  fillPanels?: boolean;
  showControls?: boolean;
  showPanels?: boolean;
}) {
  const [hoveredTableSize, setHoveredTableSize] = useState({ rows: 3, cols: 3 });
  const [formulaLatex, setFormulaLatex] = useState(DEFAULT_FORMULA_LATEX);
  const formulaInputRef = useRef<HTMLTextAreaElement | null>(null);
  const formulaInputId = `${controller.editorId}-formula-latex-input`;
  const tablePickerOpen = showPanels && controller.activeToolPanel === 'table';
  const formulaPickerOpen =
    showPanels &&
    (controller.activeToolPanel === 'formula' ||
      (!showControls && controller.activeToolPanel === null));
  const symbolPickerOpen = showPanels && controller.activeToolPanel === 'symbols';
  const activeMathSlotLabel = controller.selectedMath?.activeSlot
    ? mathSlotLabel(controller.selectedMath.activeSlot, locale)
    : label(locale, '未选择槽位', 'No slot selected');

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      controller.applyEdit({ kind: 'table', rows, cols });
      controller.closeToolPanel();
    },
    [controller],
  );

  const insertFormulaLatex = useCallback(() => {
    const latex = formulaLatex.trim();
    if (!latex) return;

    controller.applyEdit({ kind: 'mathLatex', latex });
    if (showControls) {
      controller.closeToolPanel();
    }
  }, [controller, formulaLatex, showControls]);

  const insertFormulaSnippet = useCallback(
    (snippet: string) => {
      const input = formulaInputRef.current;
      const start = input?.selectionStart ?? formulaLatex.length;
      const end = input?.selectionEnd ?? formulaLatex.length;
      const nextLatex = `${formulaLatex.slice(0, start)}${snippet}${formulaLatex.slice(end)}`;
      const nextCaret = start + snippet.length;

      setFormulaLatex(nextLatex);
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [formulaLatex],
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700',
        fillPanels && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      {showControls ? (
        <div className="flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <ToolButton
            title={label(locale, '加粗', 'Bold')}
            disabled={disabled}
            active={controller.activeTextFormats.bold}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'bold' })}
          >
            <Bold className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '斜体', 'Italic')}
            disabled={disabled}
            active={controller.activeTextFormats.italic}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'italic' })}
          >
            <Italic className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '下划线', 'Underline')}
            disabled={disabled}
            active={controller.activeTextFormats.underline}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'underline' })}
          >
            <Underline className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '无序列表', 'Bullet list')}
            disabled={disabled}
            onClick={() =>
              controller.applyEdit({ kind: 'insert', text: '\n- ', placement: 'block' })
            }
          >
            <List className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '有序列表', 'Numbered list')}
            disabled={disabled}
            onClick={() =>
              controller.applyEdit({ kind: 'insert', text: '\n1. ', placement: 'block' })
            }
          >
            <ListOrdered className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '插入表格', 'Insert table')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('table')}
          >
            <Table2 className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '公式输入', 'Formula input')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('formula')}
          >
            <SquareFunction className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '符号表', 'Symbol palette')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('symbols')}
          >
            <Braces className="size-4" />
          </ToolButton>
        </div>
      ) : null}

      {showPanels && showControls && controller.selectedMath ? (
        <div
          data-answer-math-panel="true"
          onMouseDownCapture={controller.beginMathPanelInteraction}
          className="shrink-0 border-b border-slate-100 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '已选公式', 'Selected formula')}
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
              {mathTemplateLabel(controller.selectedMath.template, locale)}
            </span>
          </div>
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            <span className="text-amber-700 dark:text-amber-300">
              {label(locale, '当前正在编辑：', 'Editing: ')}
            </span>
            <span className="font-semibold">{activeMathSlotLabel}</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {MATH_SLOT_ORDER.filter((slot) => controller.selectedMath?.slots.includes(slot)).map(
              (slot) => {
                const slotInputId = `${controller.editorId}-${slot}-math-slot`;

                return (
                  <label
                    key={slot}
                    htmlFor={slotInputId}
                    onClick={(event) => {
                      event.stopPropagation();
                      controller.focusMathSlot(slot);
                      requestAnimationFrame(() => {
                        document.getElementById(slotInputId)?.focus();
                      });
                    }}
                    className={cn(
                      'cursor-text rounded-lg border px-2.5 py-2 transition-colors',
                      controller.selectedMath?.activeSlot === slot
                        ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
                    )}
                  >
                    <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <span>{mathSlotLabel(slot, locale)}</span>
                      {controller.selectedMath?.activeSlot === slot ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                          {label(locale, '当前', 'Active')}
                        </span>
                      ) : null}
                    </span>
                    <textarea
                      id={slotInputId}
                      aria-label={mathSlotLabel(slot, locale)}
                      disabled={disabled}
                      value={controller.selectedMath?.values[slot] ?? ''}
                      onFocus={() => controller.focusMathSlot(slot)}
                      onChange={(event) => controller.updateMathSlot(slot, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      rows={slot === 'body' ? 2 : 1}
                      className="min-h-10 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-sm leading-5 text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-600 dark:focus:ring-amber-950/60"
                    />
                  </label>
                );
              },
            )}
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
            <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              LaTeX
            </div>
            <code className="block break-all font-mono text-[11px] leading-5 text-slate-700 dark:text-slate-200">
              {controller.selectedMath.latex}
            </code>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN'
              ? '直接改槽位文字；要嵌套公式，先点目标槽位，再点上方“公式输入”。'
              : 'Edit a slot directly. To nest a formula, choose a target slot, then open Formula input.'}
          </p>
        </div>
      ) : null}

      {tablePickerOpen ? (
        <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{label(locale, '选择表格大小', 'Choose table size')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {hoveredTableSize.rows} × {hoveredTableSize.cols}
            </span>
          </div>
          <div className="grid w-max grid-cols-6 gap-1">
            {Array.from({ length: TABLE_PICKER_ROWS }).flatMap((_, rowIndex) =>
              Array.from({ length: TABLE_PICKER_COLS }).map((__, colIndex) => {
                const rows = rowIndex + 1;
                const cols = colIndex + 1;
                const selected = rows <= hoveredTableSize.rows && cols <= hoveredTableSize.cols;
                return (
                  <button
                    key={`${rows}-${cols}`}
                    type="button"
                    disabled={disabled}
                    aria-label={`${rows} × ${cols}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHoveredTableSize({ rows, cols })}
                    onFocus={() => setHoveredTableSize({ rows, cols })}
                    onClick={() => insertTable(rows, cols)}
                    className={cn(
                      'size-5 rounded-[3px] border transition-colors disabled:pointer-events-none disabled:opacity-50',
                      selected
                        ? 'border-sky-400 bg-sky-100 dark:border-sky-500 dark:bg-sky-950/70'
                        : 'border-slate-200 bg-slate-50 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900',
                    )}
                  />
                );
              }),
            )}
          </div>
        </div>
      ) : null}

      {formulaPickerOpen ? (
        <div
          data-answer-math-panel="true"
          onMouseDownCapture={controller.beginMathPanelInteraction}
          className={cn(
            'space-y-3 border-b border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40',
            fillPanels && 'min-h-0 flex-1 overflow-y-auto',
          )}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {label(locale, '公式输入', 'Formula input')}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {locale === 'zh-CN'
                ? '直接输入 LaTeX，不需要写前后的 $。点“插入公式”后会插入到答案当前光标位置。'
                : 'Type LaTeX without surrounding $. Insert places it at the current answer cursor.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={formulaInputId}
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              LaTeX
            </label>
            <textarea
              id={formulaInputId}
              ref={formulaInputRef}
              aria-label="LaTeX"
              value={formulaLatex}
              disabled={disabled}
              onChange={(event) => setFormulaLatex(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs leading-5 text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/60"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '预览', 'Preview')}
            </div>
            <div
              className="min-h-10 break-words text-sm text-slate-900 dark:text-slate-100 [&_.katex]:text-[1.08em]"
              dangerouslySetInnerHTML={{
                __html: formulaLatex.trim()
                  ? renderEditableMathHtml(formulaLatex)
                  : `<span class="text-slate-400">${label(locale, '输入公式后显示预览', 'Preview appears as you type')}</span>`,
              }}
            />
          </div>

          <Button
            type="button"
            disabled={disabled || !formulaLatex.trim()}
            onClick={insertFormulaLatex}
            className="w-full"
          >
            {label(locale, '插入公式', 'Insert formula')}
          </Button>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '上下标', 'Superscript & subscript')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FORMULA_SCRIPT_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertFormulaSnippet(snippet)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60"
                >
                  {snippet}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '常用写法', 'Common examples')}
            </div>
            <div className="grid gap-1.5">
              {FORMULA_EXAMPLES.map((example) => (
                <button
                  key={example.latex}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFormulaLatex(example.latex)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/60"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {locale === 'zh-CN' ? example.zh : example.en}
                    </span>
                    <span
                      className="min-w-0 flex-1 text-right text-sm text-slate-900 dark:text-slate-100 [&_.katex]:text-[1.05em]"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{
                        __html: renderEditableMathHtml(example.latex),
                      }}
                    />
                  </span>
                  <code className="mt-1.5 block whitespace-normal break-all rounded-md bg-white px-2 py-1 font-mono text-[11px] leading-4 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    {example.latex}
                  </code>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {symbolPickerOpen ? (
        <div
          className={cn(
            'space-y-3 overflow-y-auto border-b border-slate-100 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950/30',
            fillPanels ? 'min-h-0 flex-1' : 'max-h-[360px]',
          )}
        >
          {MATH_SYMBOL_GROUPS.map((group) => (
            <div key={group.zh} className="space-y-1">
              <p className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {locale === 'zh-CN' ? group.zh : group.en}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.symbols.map((symbol) => (
                  <button
                    key={`${group.zh}-${symbol}`}
                    type="button"
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => controller.applyEdit({ kind: 'insert', text: symbol })}
                    className="h-7 min-w-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:hover:text-sky-200"
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showPanels &&
      !showControls &&
      !controller.selectedMath &&
      !tablePickerOpen &&
      !formulaPickerOpen &&
      !symbolPickerOpen ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
          {locale === 'zh-CN'
            ? '从输入栏上方选择符号表、公式输入或表格。'
            : 'Choose symbols, formula input, or tables from the toolbar above the answer box.'}
        </div>
      ) : null}
    </div>
  );
}
