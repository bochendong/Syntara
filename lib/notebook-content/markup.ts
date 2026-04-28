import {
  type NotebookContentBlock,
  type NotebookContentDensity,
  type NotebookContentDocument,
  type NotebookContentLanguage,
  type NotebookContentLayoutTemplate,
  type NotebookContentProfile,
  type NotebookContentSlot,
  parseNotebookContentDocument,
} from './schema';
import { getSlotTemplateSpec } from './slot-template-registry';
import { normalizeMathSource } from '@/lib/math-engine';

type MarkupNode =
  | {
      type: 'environment';
      name: string;
      attrs: Record<string, string>;
      children: MarkupNode[];
      raw: string;
    }
  | {
      type: 'command';
      name: string;
      attrs: Record<string, string>;
      args: string[];
    }
  | {
      type: 'text';
      value: string;
    };

type ParseResult<T> = { value: T; index: number };

const TEMPLATE_VALUES = new Set<NotebookContentLayoutTemplate>([
  'cover_hero',
  'section_divider',
  'title_content',
  'two_column',
  'three_cards',
  'four_grid',
  'visual_left',
  'visual_right',
  'comparison_matrix',
  'timeline_road',
  'problem_focus',
  'steps_sidebar',
  'code_split',
  'formula_focus',
  'summary_board',
  'definition_board',
  'concept_map',
  'two_column_explain',
  'process_steps',
  'problem_walkthrough',
  'derivation_ladder',
  'graph_explain',
  'data_insight',
  'thesis_evidence',
  'quote_analysis',
  'source_close_reading',
  'case_analysis',
  'argument_map',
  'compare_perspectives',
]);

const DENSITY_VALUES = new Set<NotebookContentDensity>(['light', 'standard', 'dense']);
const PROFILE_VALUES = new Set<NotebookContentProfile>(['general', 'math', 'code']);
const LANGUAGE_VALUES = new Set<NotebookContentLanguage>(['zh-CN', 'en-US']);

const COMMAND_ARG_COUNTS: Record<string, number> = {
  text: 1,
  heading: 1,
  bullet: 1,
  formula: 1,
  code: 1,
  table: 1,
  image: 0,
  visual: 0,
  definition: 2,
  theorem: 2,
  callout: 2,
  note: 2,
  summary: 2,
  question: 2,
  warning: 2,
  example: 2,
  step: 2,
};

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i;
}

function readName(source: string, index: number): ParseResult<string> | null {
  const match = source.slice(index).match(/^[a-zA-Z][a-zA-Z0-9_*:-]*/);
  if (!match) return null;
  return { value: match[0], index: index + match[0].length };
}

function readBalanced(
  source: string,
  index: number,
  open: string,
  close: string,
): ParseResult<string> {
  if (source[index] !== open) {
    throw new Error(`Expected ${open} at ${index}`);
  }

  let depth = 1;
  let i = index + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return { value: source.slice(index + 1, i), index: i + 1 };
    i += 1;
  }

  throw new Error(`Unclosed ${open}`);
}

function splitTopLevel(input: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const part of splitTopLevel(raw)) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      attrs[part.trim()] = 'true';
      continue;
    }
    const key = part.slice(0, eqIndex).trim();
    let value = part.slice(eqIndex + 1).trim();
    if (value.startsWith('{') && value.endsWith('}')) value = value.slice(1, -1);
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key) attrs[key] = value.trim();
  }
  return attrs;
}

function readOptionalAttrs(source: string, index: number): ParseResult<Record<string, string>> {
  const i = skipWhitespace(source, index);
  if (source[i] !== '[') return { value: {}, index };
  const balanced = readBalanced(source, i, '[', ']');
  return { value: parseAttrs(balanced.value), index: balanced.index };
}

function parseCommand(source: string, index: number): ParseResult<MarkupNode> | null {
  if (source[index] !== '\\') return null;
  const nameResult = readName(source, index + 1);
  if (!nameResult) return null;
  const name = nameResult.value;
  if (name === 'begin' || name === 'end') return null;

  const attrResult = readOptionalAttrs(source, nameResult.index);
  let i = skipWhitespace(source, attrResult.index);
  const argCount = COMMAND_ARG_COUNTS[name] ?? 0;
  const args: string[] = [];

  for (let argIndex = 0; argIndex < argCount; argIndex += 1) {
    i = skipWhitespace(source, i);
    if (source[i] !== '{') break;
    const arg = readBalanced(source, i, '{', '}');
    args.push(arg.value.trim());
    i = arg.index;
  }

  if (argCount > 0 && args.length === 0) return null;
  return {
    value: { type: 'command', name, attrs: attrResult.value, args },
    index: i,
  };
}

function parseEnvironment(source: string, index: number): ParseResult<MarkupNode> | null {
  if (!source.startsWith('\\begin{', index)) return null;
  const name = readBalanced(source, index + '\\begin'.length, '{', '}');
  const attrResult = readOptionalAttrs(source, name.index);
  const bodyStart = attrResult.index;
  const endToken = `\\end{${name.value}}`;
  const childrenResult = parseNodes(source, bodyStart, endToken);
  const raw = source.slice(bodyStart, childrenResult.index);
  const endIndex = source.startsWith(endToken, childrenResult.index)
    ? childrenResult.index + endToken.length
    : childrenResult.index;

  return {
    value: {
      type: 'environment',
      name: name.value,
      attrs: attrResult.value,
      children: childrenResult.value,
      raw,
    },
    index: endIndex,
  };
}

function parseNodes(source: string, index = 0, stopToken?: string): ParseResult<MarkupNode[]> {
  const nodes: MarkupNode[] = [];
  let i = index;
  let textStart = i;

  const flushText = (end: number) => {
    const value = source.slice(textStart, end);
    if (value.trim()) nodes.push({ type: 'text', value });
  };

  while (i < source.length) {
    if (stopToken && source.startsWith(stopToken, i)) break;

    if (source[i] === '\\') {
      const env = parseEnvironment(source, i);
      const command = env ? null : parseCommand(source, i);
      const parsed = env ?? command;
      if (parsed) {
        flushText(i);
        nodes.push(parsed.value);
        i = parsed.index;
        textStart = i;
        continue;
      }
    }
    i += 1;
  }

  flushText(i);
  return { value: nodes, index: i };
}

function firstEnvironment(
  nodes: MarkupNode[],
  name: string,
): Extract<MarkupNode, { type: 'environment' }> | null {
  return (
    nodes.find(
      (node): node is Extract<MarkupNode, { type: 'environment' }> =>
        node.type === 'environment' && node.name === name,
    ) ?? null
  );
}

function plainTextFromNodes(nodes: MarkupNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'command') return node.args.join('\n');
      return plainTextFromNodes(node.children);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function blockKindToTone(kind: string): Extract<NotebookContentBlock, { type: 'callout' }>['tone'] {
  if (kind === 'warning' || kind === 'mistake') return 'warning';
  if (kind === 'summary') return 'success';
  if (kind === 'question') return 'tip';
  if (kind === 'danger') return 'danger';
  return 'info';
}

function splitTableCells(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseTableBlock(node: Extract<MarkupNode, { type: 'command' }>): NotebookContentBlock[] {
  const rows = node.args[0]
    .split(/\\\\|\n/)
    .map(splitTableCells)
    .filter((row) => row.length > 0);
  if (!rows.length) return [];

  const headers = node.attrs.headers ? splitTableCells(node.attrs.headers) : undefined;
  return [
    {
      type: 'table',
      caption: node.attrs.caption,
      headers,
      rows,
    },
  ];
}

function commandToBlock(node: Extract<MarkupNode, { type: 'command' }>): NotebookContentBlock[] {
  const [first = '', second = ''] = node.args;
  switch (node.name) {
    case 'text':
      return first ? [{ type: 'paragraph', text: first }] : [];
    case 'heading':
      return first ? [{ type: 'heading', level: Number(node.attrs.level) || 2, text: first }] : [];
    case 'bullet':
      return first ? [{ type: 'bullet_list', items: [first] }] : [];
    case 'formula':
      return first ? [{ type: 'equation', latex: normalizeMathSource(first), display: true }] : [];
    case 'code':
      return first
        ? [
            {
              type: 'code_block',
              language: node.attrs.lang || node.attrs.language || 'text',
              code: first,
            },
          ]
        : [];
    case 'table':
      return parseTableBlock(node);
    case 'image':
    case 'visual':
      return node.attrs.source
        ? [
            {
              type: 'visual',
              source: node.attrs.source,
              title: node.attrs.title,
              alt: node.attrs.alt,
              caption: node.attrs.caption,
              role:
                node.attrs.role === 'source_image' || node.attrs.role === 'generated_image'
                  ? node.attrs.role
                  : 'diagram',
              fit: node.attrs.fit === 'cover' ? 'cover' : 'contain',
              emphasis: node.attrs.emphasis === 'primary' ? 'primary' : 'supporting',
            },
          ]
        : [];
    case 'definition':
      return second ? [{ type: 'definition', title: first, text: second }] : [];
    case 'theorem':
      return second ? [{ type: 'theorem', title: first, text: second }] : [];
    case 'callout':
    case 'note':
    case 'summary':
    case 'question':
    case 'warning':
      return second
        ? [{ type: 'callout', tone: blockKindToTone(node.name), title: first, text: second }]
        : [];
    case 'example':
      return second
        ? [
            {
              type: 'example',
              title: first,
              problem: second,
              givens: [],
              steps: [second],
              pitfalls: [],
            },
          ]
        : [];
    default:
      return [];
  }
}

function mergeBulletBlocks(blocks: NotebookContentBlock[]): NotebookContentBlock[] {
  const merged: NotebookContentBlock[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === 'bullet_list' && previous?.type === 'bullet_list') {
      previous.items.push(...block.items);
      continue;
    }
    merged.push(block);
  }
  return merged;
}

function nodesToBlocks(nodes: MarkupNode[]): NotebookContentBlock[] {
  const blocks: NotebookContentBlock[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.value.trim();
      if (text) blocks.push({ type: 'paragraph', text });
      continue;
    }

    if (node.type === 'command') {
      blocks.push(...commandToBlock(node));
      continue;
    }

    if (node.name === 'block') {
      blocks.push(...blockEnvironmentToBlocks(node));
    } else if (node.name === 'derivation') {
      blocks.push(derivationEnvironmentToBlock(node));
    } else if (node.name === 'process') {
      blocks.push(processEnvironmentToBlock(node));
    } else if (['row', 'column', 'cell', 'rows', 'columns', 'grid'].includes(node.name)) {
      blocks.push(...nodesToBlocks(node.children));
    } else {
      blocks.push(...nodesToBlocks(node.children));
    }
  }

  return mergeBulletBlocks(blocks);
}

function blockEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const kind = node.attrs.type || node.attrs.kind || 'plain';
  const title = node.attrs.title;
  const childBlocks = nodesToBlocks(node.children);
  const text = plainTextFromNodes(node.children);

  if (kind === 'definition' && text) return [{ type: 'definition', title, text }];
  if (kind === 'theorem' && text) return [{ type: 'theorem', title, text }];
  if (['callout', 'note', 'summary', 'question', 'warning', 'mistake'].includes(kind) && text) {
    return [{ type: 'callout', tone: blockKindToTone(kind), title, text }];
  }

  return title ? [{ type: 'heading', level: 2, text: title }, ...childBlocks] : childBlocks;
}

function processEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const steps = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'step',
    )
    .map((step, index) => ({
      title: step.args[0] || `Step ${index + 1}`,
      detail: step.args[1] || step.args[0] || '',
    }))
    .filter((step) => step.detail);

  return {
    type: 'process_flow',
    title: node.attrs.title,
    orientation: node.attrs.orientation === 'vertical' ? 'vertical' : 'horizontal',
    context: [],
    steps: steps.length
      ? steps
      : [
          {
            title: node.attrs.title || 'Process',
            detail: plainTextFromNodes(node.children),
          },
        ],
  };
}

function derivationEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const steps = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'step',
    )
    .map((step) => ({
      explanation: step.args[0] || undefined,
      expression: normalizeMathSource(step.args[1] || step.args[0] || ''),
      format: 'latex' as const,
    }))
    .filter((step) => step.expression);

  return {
    type: 'derivation_steps',
    title: node.attrs.title,
    steps: steps.length
      ? steps
      : [{ expression: plainTextFromNodes(node.children), format: 'text' }],
  };
}

function envChildren(
  node: MarkupNode,
  name: string,
): Extract<MarkupNode, { type: 'environment' }>[] {
  if (node.type !== 'environment') return [];
  return node.children.filter(
    (child): child is Extract<MarkupNode, { type: 'environment' }> =>
      child.type === 'environment' && child.name === name,
  );
}

function validTemplate(value: string | undefined): NotebookContentLayoutTemplate | undefined {
  return value && TEMPLATE_VALUES.has(value as NotebookContentLayoutTemplate)
    ? (value as NotebookContentLayoutTemplate)
    : undefined;
}

function validDensity(value: string | undefined): NotebookContentDensity {
  return value && DENSITY_VALUES.has(value as NotebookContentDensity)
    ? (value as NotebookContentDensity)
    : 'standard';
}

function validProfile(
  value: string | undefined,
  blocks: NotebookContentBlock[],
): NotebookContentProfile {
  if (value && PROFILE_VALUES.has(value as NotebookContentProfile))
    return value as NotebookContentProfile;
  return blocks.some((block) => ['equation', 'matrix', 'derivation_steps'].includes(block.type))
    ? 'math'
    : 'general';
}

function validLanguage(value: string | undefined): NotebookContentLanguage {
  return value && LANGUAGE_VALUES.has(value as NotebookContentLanguage)
    ? (value as NotebookContentLanguage)
    : 'zh-CN';
}

function makeSlot(
  slotId: string,
  blocks: NotebookContentBlock[],
  priority: number,
): NotebookContentSlot | null {
  if (!blocks.length) return null;
  return { slotId, blocks, priority, preserve: false };
}

function slotsFromColumns(
  columns: Extract<MarkupNode, { type: 'environment' }>[],
): NotebookContentSlot[] {
  const ids = columns.length >= 3 ? ['card_1', 'card_2', 'card_3', 'card_4'] : ['left', 'right'];
  return columns
    .map((column, index) =>
      makeSlot(
        column.attrs.name || ids[index] || `card_${index + 1}`,
        nodesToBlocks(column.children),
        index,
      ),
    )
    .filter((slot): slot is NotebookContentSlot => Boolean(slot));
}

function inferDocumentLayout(
  slide: Extract<MarkupNode, { type: 'environment' }>,
  blocks: NotebookContentBlock[],
): {
  layoutTemplate?: NotebookContentLayoutTemplate;
  slots?: NotebookContentSlot[];
} {
  const explicitTemplate = validTemplate(slide.attrs.template);
  const rows = firstEnvironment(slide.children, 'rows');
  const columns = firstEnvironment(slide.children, 'columns');
  const grid = firstEnvironment(slide.children, 'grid');

  if (columns) {
    const columnNodes = envChildren(columns, 'column');
    const slots = slotsFromColumns(columnNodes);
    if (slots.length >= 2) {
      const template = explicitTemplate || (slots.length >= 3 ? 'three_cards' : 'two_column');
      return { layoutTemplate: template, slots };
    }
  }

  if (grid) {
    const cells = envChildren(grid, 'cell');
    const slots = cells
      .slice(0, 4)
      .map((cell, index) =>
        makeSlot(cell.attrs.name || `card_${index + 1}`, nodesToBlocks(cell.children), index),
      )
      .filter((slot): slot is NotebookContentSlot => Boolean(slot));
    if (slots.length >= 3) {
      return {
        layoutTemplate: explicitTemplate || (slots.length >= 4 ? 'four_grid' : 'three_cards'),
        slots,
      };
    }
  }

  if (rows) {
    const rowNodes = envChildren(rows, 'row');
    const first = rowNodes[0];
    const middle = rowNodes.length >= 3 ? rowNodes[1] : null;
    const last = rowNodes.length >= 3 ? rowNodes[rowNodes.length - 1] : rowNodes[1];
    const middleColumns = middle ? firstEnvironment(middle.children, 'columns') : null;
    if (first && middleColumns && last) {
      const middleBlocks = envChildren(middleColumns, 'column').flatMap((column) =>
        nodesToBlocks(column.children),
      );
      const slots = [
        makeSlot('main', nodesToBlocks(first.children), 0),
        makeSlot('support', middleBlocks, 1),
        makeSlot('takeaway', nodesToBlocks(last.children), 2),
      ].filter((slot): slot is NotebookContentSlot => Boolean(slot));
      return { layoutTemplate: explicitTemplate || 'title_content', slots };
    }

    if (rowNodes.length >= 3) {
      const slots = [
        makeSlot('context', nodesToBlocks(rowNodes[0].children), 0),
        makeSlot('steps', nodesToBlocks(rowNodes[1].children), 1),
        makeSlot('summary', nodesToBlocks(rowNodes[2].children), 2),
      ].filter((slot): slot is NotebookContentSlot => Boolean(slot));
      return { layoutTemplate: explicitTemplate || 'process_steps', slots };
    }
  }

  if (blocks.some((block) => block.type === 'derivation_steps')) {
    const slots = [
      makeSlot('setup', blocks.filter((block) => block.type !== 'derivation_steps').slice(0, 1), 0),
      makeSlot(
        'derivation',
        blocks.filter((block) => block.type === 'derivation_steps'),
        1,
      ),
      makeSlot(
        'conclusion',
        blocks.filter((block) => block.type !== 'derivation_steps').slice(1, 2),
        2,
      ),
    ].filter((slot): slot is NotebookContentSlot => Boolean(slot));
    return { layoutTemplate: explicitTemplate || 'derivation_ladder', slots };
  }

  return { layoutTemplate: explicitTemplate };
}

export function parseSyntaraMarkup(markup: string): MarkupNode | null {
  try {
    const nodes = parseNodes(markup).value;
    return (
      firstEnvironment(nodes, 'slide') ?? {
        type: 'environment',
        name: 'slide',
        attrs: {},
        children: nodes,
        raw: markup,
      }
    );
  } catch {
    return null;
  }
}

export function compileSyntaraMarkupToNotebookDocument(
  markup: string,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument | null {
  const slide = parseSyntaraMarkup(markup);
  if (!slide || slide.type !== 'environment') return null;

  const blocks = nodesToBlocks(slide.children);
  if (!blocks.length) return null;

  const layout = inferDocumentLayout(slide, blocks);
  const template = layout.layoutTemplate;
  const spec = template ? getSlotTemplateSpec(template) : undefined;
  const slots = spec
    ? layout.slots?.filter((slot) => spec.slots.some((slotSpec) => slotSpec.slotId === slot.slotId))
    : undefined;

  const candidate = {
    version: slots?.length ? 2 : 1,
    language: validLanguage(slide.attrs.language || defaults.language),
    title: slide.attrs.title || defaults.title,
    profile: validProfile(slide.attrs.profile, blocks),
    disciplineStyle:
      slide.attrs.discipline === 'math' || slide.attrs.style === 'math' ? 'math' : 'general',
    teachingFlow: blocks.some((block) => block.type === 'derivation_steps')
      ? 'proof_walkthrough'
      : 'standalone',
    density: validDensity(slide.attrs.density),
    visualRole: 'none',
    overflowPolicy: 'compress_first',
    preserveFullProblemStatement: false,
    archetype: blocks.some((block) => block.type === 'definition') ? 'definition' : 'concept',
    ...(slots?.length ? {} : { layout: { mode: 'stack' } }),
    ...(template ? { layoutTemplate: template } : {}),
    ...(slots?.length ? { slots } : {}),
    blocks,
  };

  return parseNotebookContentDocument(candidate);
}

export function extractSyntaraMarkup(input: string): string | null {
  const fenced = input.match(/```(?:syntara|syntara-markup|tex|latex)\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.includes('\\begin{slide}')) return fenced[1].trim();
  if (input.includes('\\begin{slide}')) return input.trim();
  return null;
}
