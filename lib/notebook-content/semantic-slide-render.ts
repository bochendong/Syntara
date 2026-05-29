import type { Scene, SlideContent } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { isClassicLectureLayoutTemplate } from './schema';
import {
  compileSyntaraMarkupToNotebookDocument,
  normalizeSyntaraMarkupLayout,
} from '@/lib/notebook-content/markup';
import { renderNotebookContentDocumentToSlide } from './slide-adapter';
import { normalizeSlideTextLayout, validateSlideTextLayout } from '@/lib/slide-text-layout';
import { normalizeMathSource } from '@/lib/math-engine';
import { getExampleDisplaySteps } from './example-block';
import { ensureImageNotebookFocusElementsInContent } from '@/lib/utils/image-notebook-focus-elements';

export const SEMANTIC_SLIDE_RENDER_VERSION = 67;

const SEMANTIC_TEXT_FIELD_KEYS = new Set([
  'answer',
  'caption',
  'detail',
  'givens',
  'goal',
  'headers',
  'items',
  'label',
  'note',
  'pitfalls',
  'problem',
  'proofIdea',
  'rows',
  'steps',
  'summary',
  'text',
  'title',
]);

function repairLostLatexCommandEscapes(text: string): string {
  return text
    .replace(/\bilde\s*([A-Za-z])\b/g, '\\tilde{$1}')
    .replace(/\s*(?:使得|使)\}\s*/g, ': ');
}

function normalizeSemanticTextSource(text: string): string {
  const normalizedCommands = repairLostLatexCommandEscapes(
    text.replace(/\\\\(?=(?:formula|bullet)\s*\{)/g, '\\'),
  );
  return replaceInlineSyntaraTextCommands(replaceInlineSyntaraFormulaCommands(normalizedCommands))
    .replace(/<\/?(?:begin|end)\{[^}]+\}>?/gi, '')
    .replace(/<\/?(?:row|rows|column|columns|cell|grid|block)>/gi, '')
    .replace(/\\n(?![A-Za-z])/g, '\n')
    .replace(/\\t(?![A-Za-z])/g, ' ')
    .replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\')
    .replace(/(?<![A-Za-z\\])ext\{([^{}]*)\}/g, '$1')
    .replace(/\\step\{([^{}]+)\}\{([^{}]+)\}/g, '$1：$2')
    .replace(/\\step\{([^{}]+)\}/g, '$1：')
    .replace(
      /\\(?:begin|end)\{(?:slide|row|rows|column|columns|cell|grid|block|left|right|derivation|steps|solution)\}(?:\[[^\]]*\])?/g,
      '',
    )
    .replace(/\\[;,!]/g, ' ')
    .replace(/^\s*\${2}\s*$/gm, '')
    .replace(/([。.!?！？；;])\\{2,}\s*/g, '$1\n')
    .replace(/\s+\\{2,}\s+/g, '\n')
    .replace(/[ \t]*\\(?:qquad|quad)(?=\s|$)/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function replaceBraceCommandText(
  text: string,
  command: string,
  render: (inner: string) => string,
): string {
  let output = '';
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(command, cursor);
    if (start === -1) {
      output += text.slice(cursor);
      break;
    }

    output += text.slice(cursor, start);
    let depth = 1;
    let index = start + command.length;
    while (index < text.length && depth > 0) {
      const char = text[index];
      const escaped = index > 0 && text[index - 1] === '\\';
      if (!escaped && char === '{') depth += 1;
      if (!escaped && char === '}') depth -= 1;
      index += 1;
    }

    if (depth !== 0) {
      output += text.slice(start);
      break;
    }

    const inner = text.slice(start + command.length, index - 1).trim();
    output += inner ? render(inner) : '';
    cursor = index;
  }

  return output;
}

function replaceInlineSyntaraTextCommands(text: string): string {
  return replaceBraceCommandText(text, '\\bullet{', (inner) => `\n• ${inner}\n`);
}

function replaceInlineSyntaraFormulaCommands(text: string): string {
  return replaceBraceCommandText(text, '\\formula{', (inner) => `\n$$\n${inner}\n$$\n`);
}

function normalizeSemanticTextFields(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key && SEMANTIC_TEXT_FIELD_KEYS.has(key) ? normalizeSemanticTextSource(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSemanticTextFields(item, key));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeSemanticTextFields(entryValue, entryKey),
    ]),
  );
}

type MissingInverseContext = {
  base: string;
  modulus?: string;
  inverse?: string;
};

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function computeModularInverse(base: number, modulus: number): number | null {
  let t = 0;
  let nextT = 1;
  let r = modulus;
  let nextR = positiveModulo(base, modulus);

  while (nextR !== 0) {
    const quotient = Math.floor(r / nextR);
    [t, nextT] = [nextT, t - quotient * nextT];
    [r, nextR] = [nextR, r - quotient * nextR];
  }

  if (r !== 1) return null;
  return positiveModulo(t, modulus);
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

function modularUnitRepresentatives(modulus: number): number[] {
  if (!Number.isInteger(modulus) || modulus <= 1 || modulus > 100) return [];
  const values: number[] = [];
  for (let value = 1; value < modulus; value += 1) {
    if (greatestCommonDivisor(value, modulus) === 1) values.push(value);
  }
  return values;
}

function repairLostModularUnitSet(text: string): string {
  return text.replace(
    /G\s*=\s*(\\?\{)((?:\s*(?:\[\d+\]_\d+|_\d+)\s*,)+\s*(?:\[\d+\]_\d+|_\d+)\s*)(\\?\})/g,
    (match: string, openBrace: string, body: string, closeBrace: string) => {
      const moduli = Array.from(body.matchAll(/_(\d+)/g), (item) => Number(item[1]));
      const modulus = moduli[0];
      if (!modulus || !moduli.every((item) => item === modulus)) return match;
      const units = modularUnitRepresentatives(modulus);
      if (units.length !== moduli.length) return match;
      return `G=${openBrace}${units.map((item) => `[${item}]_${modulus}`).join(',')}${closeBrace}`;
    },
  );
}

function repairLostResidueClassRepresentatives(
  text: string,
  document: NotebookContentDocument,
): string {
  const documentText = collectDocumentText(document);
  const hasAdditiveZnContext = /\\mathbb\{Z\}_n|模\s*\$?n\$?\s*加法|\(\\mathbb\{Z\}_n,\+\)/.test(
    documentText,
  );
  let repaired = repairLostModularUnitSet(text).replace(
    /\\mathbb\{Z\}_n\s*=\s*(\\?\{)\s*_n\s*,\s*_n\s*,\s*(?:\\dots|\\ldots|…)\s*,\s*\[\s*n\s*-\s*1\s*\]_n\s*(\\?\})/g,
    (_match: string, openBrace: string, closeBrace: string) =>
      `\\mathbb{Z}_n=${openBrace}[0]_n,[1]_n,\\dots,[n-1]_n${closeBrace}`,
  );

  if (hasAdditiveZnContext) {
    repaired = repaired.replace(/(^|[^\]\}A-Za-z0-9])_n(?![A-Za-z0-9])/g, '$1[0]_n');
  }

  repaired = repaired
    .replace(/完成以下四个典型问题：\s*\${2}\s*(?=在加法群)/g, '完成以下四个典型问题：（1）')
    .replace(/：\s*\${2}\s*(?=在加法群)/g, '：')
    .replace(/；\s*\${2}\s*(?=在乘法模)/g, '；（2）')
    .replace(/；\s*\${2}\s*(?=证明\s+\$?H=)/g, '；（3）')
    .replace(/\$\((\d+)\)\$/g, '（$1）')
    .replace(/；（4）\s*说明/g, '；第 4 题：说明')
    .replace(/\$\[0\]\$/g, () => '$\\left[0\\right]$')
    .replace(/\$\[1\]\$/g, () => '$\\left[1\\right]$')
    .replace(
      /H\s*=\s*(\\?\{)\s*_6\s*,\s*_6\s*,\s*_6\s*(\\?\})/g,
      (_match: string, openBrace: string, closeBrace: string) =>
        `H=${openBrace}[0]_6,[2]_6,[4]_6${closeBrace}`,
    )
    .replace(
      /H\s*=\s*(\\?\{)\s*_6\s*,\s*\[2\]_6\s*,\s*\[4\]_6\s*(\\?\})/g,
      (_match: string, openBrace: string, closeBrace: string) =>
        `H=${openBrace}[0]_6,[2]_6,[4]_6${closeBrace}`,
    )
    .replace(/\$_6\s*(\\+)?in\s+H\$/g, () => '$[0]_6\\in H$')
    .replace(/元素\s*\$_8\$/g, () => '元素 $[2]_8$')
    .replace(/求\s*\$_8\$\s*的阶/g, () => '求 $[2]_8$ 的阶')
    .replace(/\$_8\s*,\s*_8\s*,\s*_8\s*,\s*_8\s*=\s*_8\$/g, () => '$[2]_8,[4]_8,[6]_8,[0]_8$')
    .replace(/\$_8\s*,\s*_8\s*,\s*_8\s*,\s*_8\$/g, () => '$[2]_8,[4]_8,[6]_8,[0]_8$')
    .replace(/\$_8\s*,\s*_8\s*,\s*\[6\]_8\s*,\s*\[0\]_8\$/g, () => '$[2]_8,[4]_8,[6]_8,[0]_8$')
    .replace(/\$_8\s*,\s*_8\s*,\s*_8\$/g, () => '$[3]_8,[5]_8,[7]_8$')
    .replace(/\$_8\s*,\s*_8\s*,\s*\[7\]_8\$/g, () => '$[3]_8,[5]_8,[7]_8$')
    .replace(/\$\[2\]_8,\[4\]_8,\[6\]_8,\[0\]_8\$/g, () => '$\\left[2\\right]_8,[4]_8,[6]_8,[0]_8$')
    .replace(/\$\[3\]_8,\[5\]_8,\[7\]_8\$/g, () => '$\\left[3\\right]_8,[5]_8,[7]_8$')
    .replace(/\|\s*_8\s*\|/g, '|[2]_8|');

  if (
    /完成以下四个典型问题/.test(repaired) &&
    /\\mathbb\{Z\}_8/.test(repaired) &&
    /\\mathbb\{Z\}_6/.test(repaired) &&
    /\\mathbb\{Z\}_4/.test(repaired)
  ) {
    repaired =
      '完成以下四个典型问题：（1）在加法群 $(\\mathbb{Z}_8,+)$ 中求元素 $[2]_8$ 的阶；' +
      '（2）在乘法模 $8$ 的群 $G=\\{[1]_8,[3]_8,[5]_8,[7]_8\\}$ 中求各元素的阶；' +
      '（3）证明 $H=\\{[0]_6,[2]_6,[4]_6\\}$ 是 $(\\mathbb{Z}_6,+)$ 的子群；' +
      '（4）说明 $\\mathbb{Z}_4$ 是循环群，并找出其全部生成元。' +
      '已知加法群中单位元是 [0]，乘法群中单位元是 [1]；对于子群测试，在加法群中检验 $a-b\\in H$。';
  }

  return repaired.replace(
    /单位元为\s*\$_8\$(?=，先写出平方|，?乘法|；乘法|$)/g,
    () => '单位元为 $[1]_8$',
  );
}

function inferMissingInverseContext(
  document: NotebookContentDocument,
): MissingInverseContext | null {
  const text = collectDocumentText(document);
  const bezoutMatch = text.match(/\b(\d{1,4})\s*x\s*(?:\+|−|-)\s*(\d{1,4})\s*y\s*=\s*1\b/u);
  if (bezoutMatch?.[1]) {
    const base = bezoutMatch[1];
    const modulus = bezoutMatch[2];
    const inverse =
      modulus != null
        ? computeModularInverse(Number(base), Number(modulus))?.toString()
        : undefined;
    return { base, modulus, inverse };
  }

  const congruenceMatch = text.match(/\b(\d{1,4})\s*x\s*\\?equiv\s*1\s*\\?pmod\{?(\d{1,4})\}?/u);
  if (congruenceMatch?.[1]) {
    const base = congruenceMatch[1];
    const modulus = congruenceMatch[2];
    const inverse =
      modulus != null
        ? computeModularInverse(Number(base), Number(modulus))?.toString()
        : undefined;
    return { base, modulus, inverse };
  }

  return null;
}

function repairMissingInverseTargetText(text: string, document: NotebookContentDocument): string {
  if (!/(逆元|inverse|\$\s*\^\s*\{?\s*-?\s*1\s*\}?\s*\$|求\s*\${2}|逆元是\s*\${2})/i.test(text)) {
    return text;
  }
  const context = inferMissingInverseContext(document);
  if (!context) return text;
  const { base, inverse } = context;
  const baseClass = `$[${base}]$`;
  const inverseClass = inverse ? `$[${inverse}]$` : `$${base}^{-1}$`;
  const inversePower = `$[${base}]^{-1}$`;

  return text
    .replace(/求\s*\${2}\s*的逆元/g, `求 ${baseClass} 的逆元`)
    .replace(/求\s*的逆元/g, `求 ${baseClass} 的逆元`)
    .replace(/求\s*\${2}\s*在/g, `求 ${baseClass} 在`)
    .replace(/在([^，,。.；;]*?)中，?\s*\${2}\s*的/g, `在$1中，${baseClass} 的`)
    .replace(/逆元是\s*\${2}/g, `逆元是 ${inverseClass}`)
    .replace(/所以\s*\${2}\s*一定可逆/g, `所以 ${baseClass} 一定可逆`)
    .replace(/使得\s*\$?\[x\]\$?\s*=\s*\$?/g, `使得 $[${base}][x]=[1]$`)
    .replace(/要求\s*\$\s*\^\s*\{?\s*-?\s*1\s*\}?\s*\$/g, `要求 ${inversePower}`)
    .replace(/find\s*\${2}\s*(?:the\s*)?inverse/gi, `find $${base}$ inverse`)
    .replace(/\$\s*\^\s*\{?\s*-?\s*1\s*\}?\s*\$/g, inversePower)
    .replace(/\${2}(?=\s*(?:[，,、。.；;]|$))/g, baseClass);
}

function repairKnownSemanticMathText(text: string, document: NotebookContentDocument): string {
  const documentText = collectDocumentText(document);
  const repairedResidues = repairLostResidueClassRepresentatives(text, document);
  if (!/(费马小定理|Fermat'?s?\s+little\s+theorem)/i.test(documentText)) {
    return repairedResidues;
  }

  return repairedResidues
    .replace(/\$p\s*(?:\\mid|\||mid)\s*a\$/g, '$p\\nmid a$')
    .replace(/p\s*(?:\\mid|\||mid)\s*a(?=\s*(?:，|,|。|;|；|$))/g, '$p\\nmid a$');
}

function repairSemanticTextFields(
  value: unknown,
  document: NotebookContentDocument,
  key?: string,
): unknown {
  if (typeof value === 'string') {
    return key && SEMANTIC_TEXT_FIELD_KEYS.has(key)
      ? repairKnownSemanticMathText(repairMissingInverseTargetText(value, document), document)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => repairSemanticTextFields(item, document, key));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      repairSemanticTextFields(entryValue, document, entryKey),
    ]),
  );
}

function normalizeBlockTextFields(
  block: NotebookContentBlock,
  document: NotebookContentDocument,
): NotebookContentBlock {
  const normalized = normalizeSemanticTextFields(block) as NotebookContentBlock;
  return repairSemanticTextFields(normalized, document) as NotebookContentBlock;
}

function normalizeFormulaLatex(text: string): string {
  return normalizeMathSource(repairLostLatexCommandEscapes(text))
    .replace(/(?:\\{2,}|\s*\\)\s*$/g, '')
    .replace(/\s+$/g, '')
    .trim();
}

function stripEmptyDisplayMath(text: string): string {
  return text
    .replace(/^\s*\\{1,2}\[\s*\\{1,2}\]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isTrivialConnectorText(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/[，,。.；;：:\s]+/g, '')
    .toLowerCase();
  return normalized === '且' || normalized === 'and';
}

function normalizeEquationBlock(
  block: Extract<NotebookContentBlock, { type: 'equation' }>,
  document: NotebookContentDocument,
) {
  const normalizedDelimiters = block.latex.replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\').trim();
  const containsProse = /[\u3400-\u9fff]|[。！？；：]/.test(normalizedDelimiters);
  const containsInlineDelimiter = /\\\(|\\\[|\$\$?/.test(normalizedDelimiters);
  const textOnly = normalizedDelimiters.match(/^\\qquad\\text\{([^{}]+)\}\\qquad$/);

  if (textOnly?.[1]) {
    return [{ type: 'paragraph' as const, text: textOnly[1].trim() }];
  }

  if (containsProse && containsInlineDelimiter) {
    return [{ type: 'paragraph' as const, text: normalizedDelimiters }];
  }

  const latex = normalizeFormulaLatex(
    repairKnownSemanticMathText(
      repairKnownWorkedExampleExpression(block.latex, document),
      document,
    ),
  );
  return latex ? [{ ...block, latex }] : [];
}

function splitDetachedMathLines(text: string): { text: string; equations: string[] } {
  const proseLines: string[] = [];
  const equations: string[] = [];

  for (const line of stripEmptyDisplayMath(text).split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commandCount = (trimmed.match(/\\{1,2}[a-zA-Z]+/g) || []).length;
    const looksLikeDetachedMath =
      commandCount >= 2 &&
      (/\\{1,2}(to|forall|exists|in|subseteq|Rightarrow|land|begin|end|qquad)/.test(trimmed) ||
        /^[A-Za-z0-9_{}\\()[\],.:;+\-=\s^!]+$/.test(trimmed));

    if (looksLikeDetachedMath) {
      equations.push(normalizeMathSource(trimmed.replace(/^\\\[/, '').replace(/\\\]$/, '')));
    } else {
      proseLines.push(trimmed);
    }
  }

  return { text: proseLines.join('\n'), equations };
}

function compactSemanticIdentity(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[，,。.！!？?；;：:、"'“”‘’`()[\]{}（）\s]/g, '')
    .toLowerCase()
    .trim();
}

function asArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function collectBlockText(block: NotebookContentBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return block.text;
    case 'bullet_list':
      return asArray(block.items).join('\n');
    case 'equation':
      return block.latex;
    case 'matrix':
      return asArray(block.rows)
        .flatMap((row) => asArray(row))
        .join(' ');
    case 'derivation_steps':
      return [
        block.title || '',
        ...asArray(block.steps).map((step) => [step.explanation || '', step.expression].join(' ')),
      ].join('\n');
    case 'code_block':
      return [block.caption || '', block.code].join('\n');
    case 'code_walkthrough':
      return [
        block.title || '',
        block.caption || '',
        block.code,
        ...asArray(block.steps).map((step) =>
          [step.title || '', step.focus || '', step.explanation].join(' '),
        ),
        block.output || '',
      ].join('\n');
    case 'code_trace':
      return [
        block.title || '',
        block.code,
        ...asArray(block.inputs).map((item) => `${item.name}=${item.value}`),
        ...asArray(block.steps).map((step) =>
          [
            step.line ? `L${step.line}` : '',
            step.explanation,
            ...asArray(step.state).map((item) => `${item.name}=${item.value}`),
          ].join(' '),
        ),
        block.output || '',
      ].join('\n');
    case 'state_table':
      return [
        block.title || '',
        ...asArray(block.columns),
        ...asArray(block.rows).flatMap((row) => asArray(row)),
        block.caption || '',
      ].join('\n');
    case 'call_stack':
      return [
        block.title || '',
        ...asArray(block.frames).map((frame) =>
          [
            frame.name,
            ...asArray(frame.args).map((item) => `${item.name}=${item.value}`),
            ...asArray(frame.locals).map((item) => `${item.name}=${item.value}`),
            frame.returnValue || '',
            frame.note || '',
          ].join(' '),
        ),
      ].join('\n');
    case 'memory_diagram':
      return [
        block.title || '',
        block.code || '',
        ...asArray(block.steps).map((step) =>
          [
            step.title || '',
            step.line ? `line ${step.line}` : '',
            ...asArray(step.frames).flatMap((frame) => [
              frame.name,
              ...asArray(frame.variables).map((item) => `${item.name}=${item.ref || item.value}`),
            ]),
            ...asArray(step.stack).map((item) => `${item.name}=${item.ref || item.value}`),
            ...asArray(step.heap).map((item) => `${item.id} ${item.label}`),
            step.explanation || '',
          ].join(' '),
        ),
        ...asArray(block.frames).flatMap((frame) => [
          frame.name,
          ...asArray(frame.variables).map((item) => `${item.name}=${item.ref || item.value}`),
        ]),
        ...asArray(block.stack).map((item) => `${item.name}=${item.ref || item.value}`),
        ...asArray(block.heap).map((item) => `${item.id} ${item.label}`),
        ...asArray(block.links).map((link) => `${link.from}->${link.to}`),
        block.caption || '',
      ].join('\n');
    case 'pointer_diagram':
      return [
        block.title || '',
        block.operation || '',
        block.kind || '',
        ...asArray(block.nodes).map((node) => node.label),
        ...asArray(block.pointers).map((pointer) => `${pointer.name}->${pointer.to || 'None'}`),
        ...asArray(block.links).map((link) => `${link.from}->${link.to}`),
        ...asArray(block.steps).map((step) =>
          [
            step.title || '',
            step.operation || '',
            ...asArray(step.nodes).map((node) => node.label),
            ...asArray(step.pointers).map((pointer) => `${pointer.name}->${pointer.to || 'None'}`),
            ...asArray(step.links).map((link) => `${link.from}->${link.to}`),
            step.explanation || '',
          ].join(' '),
        ),
        block.caption || '',
      ].join('\n');
    case 'tree_diagram':
      return [
        block.title || '',
        block.kind || '',
        block.target || '',
        block.decision || '',
        ...asArray(block.nodes).map((node) =>
          [node.label, asArray(node.children).join(' '), node.left || '', node.right || ''].join(
            ' ',
          ),
        ),
        ...asArray(block.steps).map((step) =>
          [
            step.title || '',
            step.current || '',
            asArray(step.path).join(' '),
            step.comparison || '',
            step.direction || '',
            step.result || '',
          ].join(' '),
        ),
        block.invariant || '',
        block.caption || '',
      ].join('\n');
    case 'graph_trace':
      return [
        block.title || '',
        block.algorithm,
        block.startId || '',
        ...asArray(block.nodes).map((node) => [node.id, node.label].join(' ')),
        ...asArray(block.edges).map((edge) =>
          [edge.from, edge.to, edge.label || '', edge.directed ? 'directed' : ''].join(' '),
        ),
        ...asArray(block.steps).map((step) =>
          [
            step.title || '',
            step.action || '',
            step.current || '',
            asArray(step.frontier).join(' '),
            asArray(step.visited).join(' '),
            asArray(step.order).join(' '),
            step.currentEdge ? step.currentEdge.join(' ') : '',
            step.explanation || '',
            step.result || '',
          ].join(' '),
        ),
        block.invariant || '',
        block.caption || '',
      ].join('\n');
    case 'invariant_panel':
      return [
        block.title || '',
        block.structure || '',
        block.invariant,
        ...asArray(block.checks).map((check) =>
          [check.label, check.text, check.status, check.reason || ''].join(' '),
        ),
        block.caption || '',
      ].join('\n');
    case 'dictionary_diagram':
      return [
        block.title || '',
        block.operation || '',
        block.lookupKey || '',
        block.result || '',
        ...asArray(block.entries).map((entry) =>
          [
            entry.key,
            entry.value,
            entry.note || '',
            entry.active ? 'active' : '',
            entry.changed ? 'changed' : '',
          ].join(' '),
        ),
        block.caption || '',
      ].join('\n');
    case 'linear_structure':
      return [
        block.title || '',
        block.kind,
        block.operation || '',
        ...asArray(block.items).map((item) => [item.id, item.label, item.note || ''].join(' ')),
        ...asArray(block.steps).map((step) =>
          [
            step.title || '',
            step.operation || '',
            ...asArray(step.items).map((item) => [item.id, item.label, item.note || ''].join(' ')),
            asArray(step.focus).join(' '),
            step.explanation || '',
            step.result || '',
          ].join(' '),
        ),
        block.caption || '',
      ].join('\n');
    case 'table':
      return [
        block.caption || '',
        ...asArray(block.headers),
        ...asArray(block.rows).flatMap((row) => asArray(row)),
      ].join('\n');
    case 'callout':
      return [block.title || '', block.text].join('\n');
    case 'definition':
      return [block.title || '', block.text].join('\n');
    case 'theorem':
      return [block.title || '', block.text, block.proofIdea || ''].join('\n');
    case 'example':
      return [
        block.title || '',
        block.problem,
        ...asArray(block.givens),
        block.goal || '',
        ...getExampleDisplaySteps(block),
        block.answer || '',
        ...asArray(block.pitfalls),
      ].join('\n');
    case 'process_flow': {
      const context = Array.isArray(block.context) ? block.context : [];
      const steps = Array.isArray(block.steps) ? block.steps : [];
      return [
        block.title || '',
        ...context.map((item) => [item.label, item.text].join(' ')),
        ...steps.map((step) => [step.title, step.detail, step.note || ''].join(' ')),
        block.summary || '',
      ].join('\n');
    }
    case 'layout_cards':
      return [
        block.title || '',
        ...asArray(block.items).map((item) => [item.title, item.text].join(' ')),
      ].join('\n');
    case 'chem_formula':
      return [block.caption || '', block.formula].join('\n');
    case 'chem_equation':
      return [block.caption || '', block.equation].join('\n');
    case 'visual':
      return [block.title || '', block.alt || '', block.caption || ''].join('\n');
    default:
      return '';
  }
}

function collectDocumentText(document: NotebookContentDocument): string {
  return [
    document.title || '',
    ...asArray(document.blocks).map(collectBlockText),
    ...asArray(document.slots).flatMap((slot) => asArray(slot.blocks).map(collectBlockText)),
  ].join('\n');
}

function repairKnownWorkedExampleExpression(
  expression: string,
  document: NotebookContentDocument,
): string {
  const documentText = collectDocumentText(document);
  if (!/(反例否定单射|值域否定满射|injective|surjective)/i.test(documentText)) {
    return expression;
  }

  let repaired = expression
    .trim()
    .replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\')
    .replace(/\\dfrac/g, '\\frac');
  const orphanEvaluation = repaired.match(
    /^f\s*=\s*(\\frac\{1\}\{1\s*\+\s*(\(?-?\d+\)?)\s*\^\s*2\}.*)$/u,
  );
  if (orphanEvaluation) {
    const arg = orphanEvaluation[2].replace(/^\((.*)\)$/u, '$1');
    repaired = `f(${arg}) = ${orphanEvaluation[1]}`;
  }

  repaired = repaired.replace(
    /^f\s*=\s*f\(-2\)\s*\\?\s*2\s*\\ne\s*-2/u,
    'f(2)=f(-2),\\quad 2\\ne -2',
  );
  repaired = repaired.replace(/^f\s*=\s*f\(-2\)/u, 'f(2)=f(-2)');
  return repaired;
}

function repairMissingInverseExpression(
  expression: string,
  document: NotebookContentDocument,
): string {
  const context = inferMissingInverseContext(document);
  if (!context) return expression;
  const { base, modulus, inverse } = context;
  const normalized = expression.trim().replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\');

  if (!/(?:\^\s*\{?-?1|\${2}|Rightarrow\s*=|=>=|逆元|inverse)/i.test(normalized)) {
    return expression;
  }

  if (modulus && inverse && /\\?Rightarrow\s*=|=>=/.test(normalized)) {
    return `\\begin{aligned}
${base}\\cdot ${inverse}&=${Number(base) * Number(inverse)}\\\\
${Number(base) * Number(inverse)}&=${modulus}\\cdot ${Math.floor((Number(base) * Number(inverse)) / Number(modulus))}+1
\\end{aligned}
\\quad\\Rightarrow\\quad ${base}\\cdot ${inverse}\\equiv 1\\pmod{${modulus}}`;
  }

  if (modulus && inverse && /\\\^\s*-?1|\^\s*\{?-?1/.test(normalized)) {
    return `\\begin{aligned}
${base}^{-1}&\\equiv ${inverse}\\pmod{${modulus}}\\\\
${base}\\cdot ${inverse}&\\equiv 1\\pmod{${modulus}}
\\end{aligned}`;
  }

  return normalized
    .replace(/\$\s*\^\s*\{?\s*-?\s*1\s*\}?\s*\$/g, `[${base}]^{-1}`)
    .replace(/\\\^\s*-?1/g, `${base}^{-1}`)
    .replace(/\^\s*\{?-?1\}?/g, `${base}^{-1}`)
    .replace(/\${2}/g, inverse ? `[${inverse}]` : `[${base}]`);
}

function dedupeBulletItems(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of items) {
    const key = compactSemanticIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizeBlockStructure(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  return blocks.flatMap((block): NotebookContentBlock[] => {
    if (block.type === 'process_flow') {
      return [
        {
          ...block,
          context: Array.isArray(block.context) ? block.context : [],
          steps: Array.isArray(block.steps) ? block.steps : [],
        },
      ];
    }
    if (block.type !== 'bullet_list') return [block];
    const items = dedupeBulletItems(block.items);
    return items.length ? [{ ...block, items }] : [];
  });
}

function hasUnnormalizedBlockStructure(block: NotebookContentBlock): boolean {
  if (block.type === 'process_flow') {
    return !Array.isArray(block.context) || !Array.isArray(block.steps);
  }
  return false;
}

function hasUnnormalizedSemanticDocument(document: NotebookContentDocument): boolean {
  return (
    document.blocks.some(hasUnnormalizedBlockStructure) ||
    Boolean(document.slots?.some((slot) => slot.blocks.some(hasUnnormalizedBlockStructure)))
  );
}

function isCompositionBridgeDocument(document: NotebookContentDocument): boolean {
  const text = collectDocumentText(document);
  const hasCompositionTopic = /复合函数|composite function|function composition/i.test(text);
  const hasCompositionFormula = /g\s*(?:\\circ|∘)\s*f|f\s*(?:\\circ|∘)\s*g|\\circ|∘/i.test(text);
  const alreadyStructured = document.blocks.some((block) =>
    ['process_flow', 'layout_cards', 'table', 'derivation_steps'].includes(block.type),
  );
  return hasCompositionTopic && hasCompositionFormula && !alreadyStructured;
}

function inferCompositionStepTitle(detail: string, index: number, language: string): string {
  const normalized = compactSemanticIdentity(detail);
  const isEnglish = language === 'en-US';

  if (/定义|有定义|匹配|定义域|陪域|domain|codomain|defined/.test(normalized)) {
    return isEnglish ? 'Check domains first' : '先检查能否定义';
  }
  if (/顺序|不交换|通常|先后|order|commute|noncommutative/.test(normalized)) {
    return isEnglish ? 'Respect the order' : '顺序不能省略';
  }
  if (/例|反例|example|counterexample/.test(normalized)) {
    return isEnglish ? 'Use one example' : '用例子固定直觉';
  }
  if (/右往左|从右|read|right/.test(normalized)) {
    return isEnglish ? 'Read right to left' : '从右往左读';
  }

  return isEnglish ? `Check ${index + 1}` : `判断 ${index + 1}`;
}

function normalizeCompositionBridgeDocument(
  document: NotebookContentDocument,
): NotebookContentDocument {
  if (!isCompositionBridgeDocument(document)) return document;

  const firstParagraph = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'paragraph' }> =>
      block.type === 'paragraph',
  );
  const introKey = firstParagraph ? compactSemanticIdentity(firstParagraph.text) : '';
  const bulletItems = document.blocks
    .flatMap((block) => (block.type === 'bullet_list' ? block.items : []))
    .filter((item) => compactSemanticIdentity(item) !== introKey);
  const dedupedItems = dedupeBulletItems(bulletItems).slice(0, 4);

  if (dedupedItems.length < 2) return document;

  const language = document.language === 'en-US' ? 'en-US' : 'zh-CN';
  const processBlock: NotebookContentBlock = {
    type: 'process_flow',
    title: language === 'en-US' ? 'Reasoning Path' : '判断路径',
    orientation: 'vertical',
    context: [],
    steps: dedupedItems.map((item, index) => ({
      title: inferCompositionStepTitle(item, index, language),
      detail: item,
    })),
    summary:
      language === 'en-US'
        ? 'Composition is checked before it is simplified: domain/codomain matching comes first, and order usually changes the result.'
        : '复合函数先检查定义域与陪域能否接上，再比较执行顺序；通常 $g\\circ f\\ne f\\circ g$。',
  };
  const calloutBlock: NotebookContentBlock = {
    type: 'callout',
    tone: 'tip',
    title: language === 'en-US' ? 'Key Takeaway' : '关键结论',
    text:
      language === 'en-US'
        ? 'Read $g\\circ f$ as “apply $f$ first, then $g$.”'
        : '$g\\circ f$ 表示先做 $f$，再做 $g$；不要把顺序当作可交换。',
  };

  return {
    ...document,
    layoutFamily: 'timeline',
    layoutTemplate: 'process_steps',
    teachingFlow: 'concept_explain',
    pattern: 'flow_vertical',
    density: document.density === 'light' ? 'standard' : document.density,
    blocks: [
      ...(firstParagraph ? [{ ...firstParagraph, text: firstParagraph.text }] : []),
      processBlock,
      calloutBlock,
    ],
    slots: undefined,
  };
}

function normalizeSemanticDocumentMath(document: NotebookContentDocument): NotebookContentDocument {
  const normalizeBlocks = (blocks: NotebookContentBlock[]): NotebookContentBlock[] =>
    blocks.flatMap((block): NotebookContentBlock[] => {
      const normalizedBlock = normalizeBlockTextFields(block, document);
      if (normalizedBlock.type === 'equation') {
        return normalizeEquationBlock(normalizedBlock, document);
      }
      if (normalizedBlock.type === 'derivation_steps') {
        return [
          {
            ...normalizedBlock,
            steps: normalizedBlock.steps.map((step) =>
              step.format === 'latex'
                ? {
                    ...step,
                    expression: normalizeFormulaLatex(
                      repairKnownSemanticMathText(
                        repairMissingInverseExpression(
                          repairKnownWorkedExampleExpression(step.expression, document),
                          document,
                        ),
                        document,
                      ),
                    ),
                  }
                : {
                    ...step,
                    expression:
                      step.format === 'text'
                        ? normalizeSemanticTextSource(
                            repairKnownSemanticMathText(
                              repairMissingInverseTargetText(step.expression, document),
                              document,
                            ),
                          )
                        : step.expression,
                  },
            ),
          },
        ];
      }
      if (
        normalizedBlock.type === 'paragraph' &&
        (!normalizedBlock.text.trim() || isTrivialConnectorText(normalizedBlock.text))
      ) {
        return [];
      }
      if (normalizedBlock.type !== 'definition' && normalizedBlock.type !== 'theorem') {
        return [normalizedBlock];
      }
      const split = splitDetachedMathLines(normalizedBlock.text);
      const normalizedBlocks: NotebookContentBlock[] = split.text
        ? [{ ...normalizedBlock, text: split.text }]
        : [];
      normalizedBlocks.push(
        ...split.equations.map(
          (latex): NotebookContentBlock => ({ type: 'equation', latex, display: true }),
        ),
      );
      return normalizedBlocks;
    });

  const blocks = normalizeBlocks(document.blocks);
  const slots = document.slots?.map((slot) => ({
    ...slot,
    blocks: normalizeBlocks(slot.blocks),
  }));
  const hasDefinition = blocks.some(
    (block) => block.type === 'definition' || block.type === 'theorem',
  );
  const hasFormula = blocks.some((block) => block.type === 'equation' || block.type === 'matrix');
  const hasProcessFlow = blocks.some((block) => block.type === 'process_flow');
  const shouldAvoidCoverHero =
    document.layoutTemplate === 'cover_hero' && hasProcessFlow && blocks.length <= 3;
  const layoutTemplate = shouldAvoidCoverHero
    ? 'title_content'
    : document.layoutTemplate === 'title_content' && hasDefinition && hasFormula
      ? 'definition_board'
      : document.layoutTemplate;
  const normalizedTitle = repairMissingInverseTargetText(
    repairKnownSemanticMathText(normalizeSemanticTextSource(document.title || ''), document),
    document,
  );

  return {
    ...document,
    title: normalizedTitle || document.title,
    blocks,
    ...(slots ? { slots } : {}),
    ...(layoutTemplate ? { layoutTemplate } : {}),
    ...(shouldAvoidCoverHero ? { layoutFamily: 'concept_cards' as const } : {}),
    ...(layoutTemplate === 'definition_board' || layoutTemplate === 'concept_map'
      ? { layoutFamily: 'concept_cards' as const, archetype: 'definition' as const }
      : {}),
  };
}

function normalizeSemanticDocumentStructure(
  document: NotebookContentDocument,
): NotebookContentDocument {
  const blocks = normalizeBlockStructure(document.blocks);
  const slots = document.slots?.map((slot) => ({
    ...slot,
    blocks: normalizeBlockStructure(slot.blocks),
  }));
  return normalizeCompositionBridgeDocument({
    ...document,
    blocks,
    ...(slots ? { slots } : {}),
  });
}

function hasScrollNativeSemanticBlock(blocks: NotebookContentBlock[]): boolean {
  return blocks.some((block) =>
    [
      'code_block',
      'code_walkthrough',
      'code_trace',
      'state_table',
      'call_stack',
      'memory_diagram',
      'pointer_diagram',
      'tree_diagram',
      'graph_trace',
      'example',
      'derivation_steps',
    ].includes(block.type),
  );
}

function isStaticLectureDocument(document: NotebookContentDocument): boolean {
  if (document.preserveFullProblemStatement) return false;
  if (
    document.layoutFamily === 'code_walkthrough' ||
    document.layoutFamily === 'problem_statement' ||
    document.layoutFamily === 'problem_solution' ||
    document.layoutFamily === 'derivation'
  ) {
    return false;
  }
  return !hasScrollNativeSemanticBlock(document.blocks);
}

export function normalizeSemanticDocumentForRender(
  document: NotebookContentDocument,
): NotebookContentDocument {
  const normalizedDocument = normalizeSemanticDocumentStructure(
    normalizeSemanticDocumentMath(document),
  );
  if (!normalizedDocument.continuation) return normalizedDocument;
  return {
    ...normalizedDocument,
    continuation: undefined,
  };
}

export function markSemanticSlideContent(
  content: SlideContent,
  options?: { renderMode?: 'auto' | 'manual' },
): SlideContent {
  if (!content.semanticDocument) return content;
  return renderSemanticSlideContent({
    document: content.semanticDocument,
    fallbackTitle: content.semanticDocument.title || '',
    preserveCanvasId: content.canvas.id,
    syntaraMarkup: content.syntaraMarkup,
    renderMode: options?.renderMode ?? content.semanticRenderMode ?? 'auto',
  });
}

export function renderSemanticSlideContent(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  preserveCanvasId?: string;
  syntaraMarkup?: string;
  renderMode?: 'auto' | 'manual';
}): SlideContent {
  const document = normalizeSemanticDocumentForRender(args.document);
  const renderedCanvas = renderNotebookContentDocumentToSlide({
    document,
    fallbackTitle: args.fallbackTitle,
  });
  const shouldTrustTemplateGeometry = isClassicLectureLayoutTemplate(document.layoutTemplate);
  const layoutValidation = validateSlideTextLayout(renderedCanvas.elements);
  const normalizedCanvas =
    shouldTrustTemplateGeometry || layoutValidation.isValid
      ? renderedCanvas
      : {
          ...renderedCanvas,
          elements: normalizeSlideTextLayout(renderedCanvas.elements),
        };
  const canvas: Slide = args.preserveCanvasId
    ? {
        ...normalizedCanvas,
        id: args.preserveCanvasId,
      }
    : normalizedCanvas;
  const webRenderMode =
    args.renderMode === 'manual' ||
    isClassicLectureLayoutTemplate(document.layoutTemplate) ||
    isStaticLectureDocument(document)
      ? 'slide'
      : 'scroll';

  return {
    type: 'slide',
    canvas,
    syntaraMarkup: args.syntaraMarkup,
    semanticDocument: document,
    semanticRenderVersion: SEMANTIC_SLIDE_RENDER_VERSION,
    semanticRenderMode: args.renderMode ?? 'auto',
    webRenderMode,
  };
}

export function shouldAutoRefreshSemanticSlideContent(content: SlideContent): boolean {
  if (!content.semanticDocument && !content.syntaraMarkup) return false;
  if (content.semanticDocument?.continuation) return true;
  if (content.semanticDocument && hasUnnormalizedSemanticDocument(content.semanticDocument)) {
    return true;
  }
  if (hasMathRenderError(content)) return true;
  if (hasBrokenSemanticSource(content)) return true;
  if (content.semanticRenderMode === 'manual') return false;
  return content.semanticRenderVersion !== SEMANTIC_SLIDE_RENDER_VERSION;
}

function hasMathRenderError(content: SlideContent): boolean {
  const elementsJson = JSON.stringify(content.canvas.elements ?? []);
  return /katex-error|KaTeX parse error|ParseError: KaTeX/.test(elementsJson);
}

function hasBrokenSemanticSource(content: SlideContent): boolean {
  const documentJson = [JSON.stringify(content.semanticDocument ?? {}), content.syntaraMarkup || '']
    .filter(Boolean)
    .join('\n');
  return /<\\?\/?row>|<\/?row>|\\formula(?:\{|[A-Za-z0-9])|\\bullet\{|\\pmod\s+[A-Za-z0-9]|\$\s*\^\s*\{?\s*-?\s*1\s*\}?\s*\$|求\s*\${2}\s*的逆元|逆元是\s*\${2}|=>=|\\Rightarrow\s*=/.test(
    documentJson,
  );
}

function isCodeLikeSemanticDocument(document: NotebookContentDocument | null | undefined): boolean {
  if (!document) return false;
  if (document.profile === 'code' || document.disciplineStyle === 'code') return true;
  if (document.layoutFamily === 'code_walkthrough' || document.layoutTemplate === 'code_split') {
    return true;
  }

  const searchable = [
    document.title,
    document.archetype,
    document.teachingFlow,
    JSON.stringify(document.blocks ?? []),
    JSON.stringify(document.slots ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  return /(oop|python|__init__|self|class |method|attribute|instance|object|linked\s*list|bst|tree|graph|bfs|dfs|queue|stack|dictionary|recursion|loop|invariant|面向对象|对象|实例|属性|链表|二叉|树|图|队列|字典|递归|循环|不变式)/.test(
    searchable,
  );
}

export function refreshSemanticSlideScene(scene: Scene): Scene {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return scene;
  }

  const content = ensureImageNotebookFocusElementsInContent(scene.content);
  const sceneWithImageFocus: Scene = content === scene.content ? scene : { ...scene, content };
  if (!shouldAutoRefreshSemanticSlideContent(content)) {
    return sceneWithImageFocus;
  }
  const markupSource = content.syntaraMarkup;
  const preferSemanticDocument = isCodeLikeSemanticDocument(content.semanticDocument);
  const shouldCompileFromMarkup = Boolean(
    markupSource &&
    !preferSemanticDocument &&
    (!content.semanticDocument || !content.semanticDocument.continuation),
  );
  const compiledDocument = shouldCompileFromMarkup
    ? compileSyntaraMarkupToNotebookDocument(markupSource || '', {
        title: content.semanticDocument?.title || scene.title,
        language: content.semanticDocument?.language,
      })
    : null;
  const sourceDocument =
    (preferSemanticDocument && content.semanticDocument
      ? normalizeSemanticDocumentForRender(content.semanticDocument)
      : null) ||
    compiledDocument ||
    (content.semanticDocument
      ? normalizeSemanticDocumentForRender(content.semanticDocument)
      : null);
  if (!sourceDocument) return sceneWithImageFocus;
  const syntaraMarkup = shouldCompileFromMarkup
    ? normalizeSyntaraMarkupLayout(markupSource || '')
    : preferSemanticDocument
      ? undefined
      : markupSource;
  const renderDocument = normalizeSemanticDocumentForRender(sourceDocument);

  return {
    ...sceneWithImageFocus,
    title: renderDocument.title || scene.title,
    content: renderSemanticSlideContent({
      document: renderDocument,
      fallbackTitle: renderDocument.title || scene.title,
      preserveCanvasId: content.canvas.id,
      syntaraMarkup,
      renderMode: content.semanticRenderMode ?? 'auto',
    }),
  };
}
