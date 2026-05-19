import {
  type NotebookContentBlock,
  type NotebookContentDeckStyle,
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
import {
  DISPLAY_MATH_ENVIRONMENTS,
  NOTEBOOK_FRAME_ENVIRONMENTS,
  VERBATIM_ENVIRONMENTS,
  collectEnvironments,
  firstCommand,
  firstEnvironment,
  normalizeSyntaraCommandEscapes,
  parseNodes,
  plainTextFromNodes,
  splitTopLevel,
  type MarkupNode,
} from './markup-parser';

function hasInlineMathDelimiter(text: string): boolean {
  return /(?<!\\)\$[^$\n]+(?<!\\)\$|\\\(|\\\[/.test(text);
}

function shouldTreatDerivationExpressionAsText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (hasInlineMathDelimiter(value) && /[\u3400-\u9fff]|[，。！？；]/.test(value)) return true;
  return (
    /[\u3400-\u9fff]/.test(value) && !/^\\(?:begin|left|frac|dfrac|sqrt|sum|int)\b/.test(value)
  );
}

const TEMPLATE_VALUES = new Set<NotebookContentLayoutTemplate>([
  'cover_hero',
  'image_title_overlay',
  'cinematic_title_frame',
  'tech_hero_title',
  'section_divider',
  'title_content',
  'two_column',
  'three_cards',
  'four_grid',
  'visual_left',
  'visual_right',
  'pipeline_table',
  'visual_three_steps',
  'two_by_one_summary',
  'text_image_split',
  'four_columns',
  'grid_2x2',
  'two_text_image',
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
const DECK_STYLE_VALUES = new Set<NotebookContentDeckStyle>([
  'classic_business',
  'academic',
  'magazine',
  'dark_art',
  'nature_documentary',
  'tech_saas',
  'product_launch',
]);
const PROFILE_VALUES = new Set<NotebookContentProfile>(['general', 'math', 'code']);
const LANGUAGE_VALUES = new Set<NotebookContentLanguage>(['zh-CN', 'en-US']);
function blockKindToTone(kind: string): Extract<NotebookContentBlock, { type: 'callout' }>['tone'] {
  if (kind === 'warning' || kind === 'mistake') return 'warning';
  if (kind === 'summary') return 'success';
  if (kind === 'question') return 'tip';
  if (kind === 'danger') return 'danger';
  return 'info';
}

function parseContentTone(value: string | undefined): 'neutral' | 'info' | 'warning' | 'success' {
  return value === 'info' || value === 'warning' || value === 'success' ? value : 'neutral';
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

function stripLatexComments(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*/, '$1').trimEnd())
    .join('\n');
}

function stripLatexTextCommands(text: string): string {
  return text
    .replace(/\\(?:text|textbf|textit|emph|texttt|alert)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:url|href)\{([^{}]*)\}(?:\{([^{}]*)\})?/g, '$2$1')
    .replace(/\\LaTeX\b/g, 'LaTeX')
    .replace(/\\TeX\b/g, 'TeX')
    .replace(/\\par\b/g, '\n\n')
    .replace(/\\+text(?=$|[\s\u3400-\u9fff\u3000-\u303f\uff00-\uffef"'“”‘’「」『』（(【\[])/g, '')
    .replace(
      /\\+(?:bullet|heading|callout|summary|warning|question|text|example|card|step)\b\s*/gi,
      '',
    )
    .replace(/\\+(?:begin|end)\{[^{}]*\}/gi, '')
    .replace(/~+/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/\\#/g, '#')
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .replace(/\\textbackslash\b/g, '\\')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitDisplayMathSegments(text: string): Array<{ type: 'text' | 'math'; value: string }> {
  const segments: Array<{ type: 'text' | 'math'; value: string }> = [];
  const pattern = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    segments.push({ type: 'math', value: match[1] ?? match[2] ?? '' });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) });
  return segments;
}

function textToBlocks(rawText: string): NotebookContentBlock[] {
  const text = stripLatexComments(rawText);
  const blocks: NotebookContentBlock[] = [];

  for (const segment of splitDisplayMathSegments(text)) {
    if (segment.type === 'math') {
      const latex = normalizeFormulaLatex(segment.value);
      if (latex) blocks.push({ type: 'equation', latex, display: true });
      continue;
    }

    const paragraphs = segment.value
      .split(/\n\s*\n/)
      .map(stripLatexTextCommands)
      .filter(Boolean);
    blocks.push(
      ...paragraphs.map(
        (paragraph): NotebookContentBlock => ({ type: 'paragraph', text: paragraph }),
      ),
    );
  }

  return blocks;
}

function splitLatexItems(raw: string): string[] {
  const matches = Array.from(raw.matchAll(/\\item(?:\s*\[[^\]]*\])?/g));
  if (!matches.length) return [];
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end =
        index + 1 < matches.length ? (matches[index + 1].index ?? raw.length) : raw.length;
      return stripLatexTextCommands(raw.slice(start, end));
    })
    .filter(Boolean);
}

function itemListEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const items = splitLatexItems(node.raw);
  if (!items.length) {
    const fallbackItems = node.children
      .map((child) => (child.type === 'text' ? stripLatexTextCommands(child.value) : ''))
      .filter(Boolean);
    return fallbackItems.length ? [{ type: 'bullet_list', items: fallbackItems }] : [];
  }
  return [{ type: 'bullet_list', items }];
}

function tabularEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const rows = node.raw
    .replace(/\\hline/g, '')
    .split(/\\\\/)
    .map((row) => row.split('&').map(stripLatexTextCommands).filter(Boolean))
    .filter((row) => row.length > 0);
  if (!rows.length) return [];
  return [
    {
      type: 'table',
      caption: node.attrs.caption,
      headers: node.attrs.headers ? splitTableCells(node.attrs.headers) : undefined,
      rows,
    },
  ];
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanAttr(value: string | undefined): boolean {
  return value === 'true' || value === '';
}

function parseKeyValues(raw: string | undefined): Array<{ name: string; value: string }> {
  if (!raw) return [];
  return splitTopLevel(raw, '|')
    .map((part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex < 0) return null;
      const name = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      return name ? { name, value } : null;
    })
    .filter((item): item is { name: string; value: string } => Boolean(item));
}

function parseStateTableBlock(
  node: Extract<MarkupNode, { type: 'command' }>,
): NotebookContentBlock[] {
  const columns = node.attrs.headers ? splitTableCells(node.attrs.headers) : [];
  if (!columns.length) return [];
  const rows = node.args[0]
    .split(/\\\\|\n/)
    .map(splitTableCells)
    .filter((row) => row.length > 0);
  if (!rows.length) return [];

  const activeRow = parseNumber(node.attrs.activeRow);
  return [
    {
      type: 'state_table',
      title: node.attrs.title,
      columns,
      rows,
      activeRow,
      caption: node.attrs.caption,
    },
  ];
}

function splitDetachedMathLines(text: string): { text: string; equations: string[] } {
  const proseLines: string[] = [];
  const equations: string[] = [];

  for (const line of text.split(/\n+/)) {
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

  return {
    text: proseLines.join('\n'),
    equations,
  };
}

function stripEmptyDisplayMath(text: string): string {
  return text
    .replace(/^\s*\\{1,2}\[\s*\\{1,2}\]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeFormulaLatex(text: string): string {
  return normalizeMathSource(text)
    .replace(/(?:\\{2,}|\s*\\)\s*$/g, '')
    .replace(/\s+$/g, '')
    .trim();
}

function formulaCommandToBlocks(text: string): NotebookContentBlock[] {
  const normalizedDelimiters = text.replace(/\\\\(?=[()[\]])/g, '\\').trim();
  const containsProse = /[\u3400-\u9fff]|[。！？；：]/.test(normalizedDelimiters);
  const containsInlineDelimiter = /\\\(|\\\[|\$\$?/.test(normalizedDelimiters);
  const textOnly = normalizedDelimiters.match(/^\\qquad\\text\{([^{}]+)\}\\qquad$/);

  if (textOnly?.[1]) {
    return [{ type: 'paragraph', text: textOnly[1].trim() }];
  }

  if (containsProse && containsInlineDelimiter) {
    return [{ type: 'paragraph', text: normalizedDelimiters }];
  }

  const latex = normalizeFormulaLatex(text);
  return latex ? [{ type: 'equation', latex, display: true }] : [];
}

function textBlockWithDetachedEquations(
  block: Extract<NotebookContentBlock, { type: 'definition' | 'theorem' }>,
  text: string,
): NotebookContentBlock[] {
  const split = splitDetachedMathLines(stripEmptyDisplayMath(text));
  const result: NotebookContentBlock[] = split.text ? [{ ...block, text: split.text }] : [];
  result.push(
    ...split.equations.map(
      (latex): NotebookContentBlock => ({
        type: 'equation',
        latex,
        display: true,
      }),
    ),
  );
  return result;
}

function commandToBlock(node: Extract<MarkupNode, { type: 'command' }>): NotebookContentBlock[] {
  const [first = '', second = ''] = node.args;
  switch (node.name) {
    case 'text':
      return first ? [{ type: 'paragraph', text: first }] : [];
    case 'section':
      return first ? [{ type: 'heading', level: 1, text: stripLatexTextCommands(first) }] : [];
    case 'subsection':
      return first ? [{ type: 'heading', level: 2, text: stripLatexTextCommands(first) }] : [];
    case 'subsubsection':
      return first ? [{ type: 'heading', level: 3, text: stripLatexTextCommands(first) }] : [];
    case 'title':
    case 'subtitle':
    case 'frametitle':
    case 'caption':
    case 'item':
      return [];
    case 'heading':
      return first ? [{ type: 'heading', level: Number(node.attrs.level) || 2, text: first }] : [];
    case 'bullet':
      return first ? [{ type: 'bullet_list', items: [first] }] : [];
    case 'formula':
      return first ? formulaCommandToBlocks(first) : [];
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
    case 'statetable':
      return parseStateTableBlock(node);
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
      return second
        ? textBlockWithDetachedEquations({ type: 'definition', title: first, text: second }, second)
        : [];
    case 'theorem':
      return second
        ? textBlockWithDetachedEquations({ type: 'theorem', title: first, text: second }, second)
        : [];
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
              steps: [],
              pitfalls: [],
            },
          ]
        : [];
    case 'card':
      return second
        ? [
            {
              type: 'layout_cards',
              columns: 2,
              items: [{ title: first, text: second, tone: parseContentTone(node.attrs.tone) }],
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
      blocks.push(...textToBlocks(node.value));
      continue;
    }

    if (node.type === 'command') {
      blocks.push(...commandToBlock(node));
      continue;
    }

    if (VERBATIM_ENVIRONMENTS.has(node.name)) {
      blocks.push(codeEnvironmentToBlock(node));
    } else if (DISPLAY_MATH_ENVIRONMENTS.has(node.name)) {
      const latex = normalizeFormulaLatex(node.raw);
      if (latex)
        blocks.push({ type: 'equation', latex, display: true, caption: node.attrs.caption });
    } else if (node.name === 'itemize' || node.name === 'enumerate') {
      blocks.push(...itemListEnvironmentToBlocks(node));
    } else if (node.name === 'tabular' || node.name === 'array') {
      blocks.push(...tabularEnvironmentToBlocks(node));
    } else if (node.name === 'block') {
      blocks.push(...blockEnvironmentToBlocks(node));
    } else if (node.name === 'alertblock') {
      const text = plainTextFromNodes(node.children);
      if (text) blocks.push({ type: 'callout', tone: 'warning', title: node.attrs.title, text });
    } else if (node.name === 'exampleblock') {
      const text = plainTextFromNodes(node.children);
      if (text) blocks.push({ type: 'callout', tone: 'tip', title: node.attrs.title, text });
    } else if (['definition', 'theorem', 'lemma', 'proposition', 'corollary'].includes(node.name)) {
      blocks.push(...namedTheoremEnvironmentToBlocks(node));
    } else if (node.name === 'example') {
      blocks.push(...exampleEnvironmentToBlocks(node));
    } else if (node.name === 'cards' || node.name === 'concepts') {
      blocks.push(...cardsEnvironmentToBlocks(node));
    } else if (node.name === 'walkthrough' || node.name === 'codewalkthrough') {
      blocks.push(codeWalkthroughEnvironmentToBlock(node));
    } else if (node.name === 'trace') {
      blocks.push(traceEnvironmentToBlock(node));
    } else if (node.name === 'callstack') {
      blocks.push(callStackEnvironmentToBlock(node));
    } else if (node.name === 'memory') {
      blocks.push(memoryEnvironmentToBlock(node));
    } else if (node.name === 'linkedlist') {
      blocks.push(linkedListEnvironmentToBlock(node));
    } else if (node.name === 'stack') {
      blocks.push(linearStructureEnvironmentToBlock(node, 'stack'));
    } else if (node.name === 'queue') {
      blocks.push(linearStructureEnvironmentToBlock(node, 'queue'));
    } else if (node.name === 'dictionary') {
      blocks.push(dictionaryEnvironmentToBlock(node));
    } else if (node.name === 'pointers') {
      blocks.push(pointerEnvironmentToBlock(node));
    } else if (node.name === 'bst') {
      blocks.push(bstEnvironmentToBlock(node));
    } else if (node.name === 'tree') {
      blocks.push(treeEnvironmentToBlock(node));
    } else if (node.name === 'invariant') {
      blocks.push(invariantEnvironmentToBlock(node));
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

function codeEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const language =
    node.attrs.lang ||
    node.attrs.language ||
    (node.name === 'minted' ? node.attrs.title : undefined) ||
    'text';
  return {
    type: 'code_block',
    language: language.toLowerCase(),
    code: node.raw.replace(/^\n+|\n+$/g, ''),
    caption: node.attrs.caption || node.attrs.title,
  };
}

function namedTheoremEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const text = plainTextFromNodes(node.children);
  if (!text) return [];
  const title =
    node.attrs.title ||
    (node.name === 'definition'
      ? 'Definition'
      : node.name === 'lemma'
        ? 'Lemma'
        : node.name === 'proposition'
          ? 'Proposition'
          : node.name === 'corollary'
            ? 'Corollary'
            : 'Theorem');
  if (node.name === 'definition') {
    return textBlockWithDetachedEquations({ type: 'definition', title, text }, text);
  }
  return textBlockWithDetachedEquations({ type: 'theorem', title, text }, text);
}

function exampleEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const blocks = nodesToBlocks(node.children);
  const text = plainTextFromNodes(node.children);
  if (!text) return blocks;
  const normalizedProblem = text.replace(/\s+/g, ' ').trim();
  const steps = blocks
    .flatMap((block) => {
      if (block.type === 'bullet_list') return block.items;
      if (block.type === 'paragraph') return [block.text];
      return [];
    })
    .filter((item) => item && item.replace(/\s+/g, ' ').trim() !== normalizedProblem);
  return [
    {
      type: 'example',
      title: node.attrs.title,
      problem: text,
      givens: [],
      goal: node.attrs.goal,
      steps,
      answer: node.attrs.answer,
      pitfalls: [],
    },
  ];
}

function cardsEnvironmentToBlocks(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock[] {
  const items = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'card',
    )
    .map((card) => ({
      title: stripLatexTextCommands(card.args[0] || ''),
      text: stripLatexTextCommands(card.args[1] || ''),
      tone: parseContentTone(card.attrs.tone),
    }))
    .filter((item) => item.title && item.text);
  if (!items.length) return [];
  const columns = Number(node.attrs.columns);
  return [
    {
      type: 'layout_cards',
      title: node.attrs.title,
      columns: columns === 2 || columns === 3 || columns === 4 ? columns : 3,
      items: items.slice(0, 4),
    },
  ];
}

function getCodeSourceFromEnvironment(node: Extract<MarkupNode, { type: 'environment' }>): {
  language: string;
  code: string;
  caption?: string;
} {
  const codeNode = node.children.find(
    (child): child is Extract<MarkupNode, { type: 'command' }> =>
      child.type === 'command' && child.name === 'code',
  );
  const codeEnvironment = node.children.find(
    (child): child is Extract<MarkupNode, { type: 'environment' }> =>
      child.type === 'environment' && VERBATIM_ENVIRONMENTS.has(child.name),
  );
  const language =
    node.attrs.lang ||
    node.attrs.language ||
    codeNode?.attrs.lang ||
    codeNode?.attrs.language ||
    codeEnvironment?.attrs.language ||
    codeEnvironment?.attrs.lang ||
    'text';
  const code =
    codeNode?.args[0] ||
    codeEnvironment?.raw.replace(/^\n+|\n+$/g, '') ||
    plainTextFromNodes(node.children);
  return { language, code, caption: codeNode?.attrs.caption || codeEnvironment?.attrs.caption };
}

function codeWalkthroughEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const codeSource = getCodeSourceFromEnvironment(node);
  const steps = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'step',
    )
    .map((step) => ({
      title: step.args[0] || step.attrs.title,
      focus: step.attrs.focus,
      explanation: step.args[1] || step.args[0] || '',
    }))
    .filter((step) => step.explanation);

  return {
    type: 'code_walkthrough',
    title: node.attrs.title,
    language: codeSource.language.toLowerCase(),
    code: codeSource.code,
    caption: node.attrs.caption || codeSource.caption,
    steps: steps.length
      ? steps
      : [
          {
            explanation: node.attrs.title || 'Walk through the code.',
          },
        ],
    output: node.attrs.output,
  };
}

function traceEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const codeSource = getCodeSourceFromEnvironment(node);
  const steps = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'step',
    )
    .map((step) => ({
      line: parseNumber(step.attrs.line),
      state: parseKeyValues(step.attrs.state),
      explanation: step.args[1] || step.args[0] || '',
    }))
    .filter((step) => step.explanation);
  const activeLines = Array.from(
    new Set([
      ...splitTableCells(node.attrs.activeLines || '').flatMap((line) => {
        const parsed = parseNumber(line);
        return parsed ? [parsed] : [];
      }),
      ...steps.flatMap((step) => (step.line ? [step.line] : [])),
    ]),
  );

  return {
    type: 'code_trace',
    title: node.attrs.title,
    language: codeSource.language.toLowerCase(),
    code: codeSource.code,
    inputs: parseKeyValues(node.attrs.inputs),
    activeLines,
    steps: steps.length
      ? steps
      : [
          {
            state: [],
            explanation: node.attrs.title || 'Trace the execution state.',
          },
        ],
    output: node.attrs.output,
  };
}

function callStackEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const frames = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'frame',
    )
    .map((frame, index) => ({
      name: frame.attrs.name || `frame_${index + 1}`,
      args: parseKeyValues(frame.attrs.args),
      locals: parseKeyValues(frame.attrs.locals),
      returnValue: frame.attrs.return || frame.attrs.returnValue,
      note: frame.args[0],
      active: parseBooleanAttr(frame.attrs.active),
    }));

  return {
    type: 'call_stack',
    title: node.attrs.title,
    frames: frames.length
      ? frames
      : [
          {
            name: node.attrs.title || 'frame',
            args: [],
            locals: [],
            note: plainTextFromNodes(node.children),
            active: true,
          },
        ],
    heap: [],
    caption: node.attrs.caption,
  };
}

function childCommands(
  node: Extract<MarkupNode, { type: 'environment' }>,
  name?: string,
): Extract<MarkupNode, { type: 'command' }>[] {
  return node.children.filter(
    (child): child is Extract<MarkupNode, { type: 'command' }> =>
      child.type === 'command' && (!name || child.name === name),
  );
}

function childStepEnvironments(
  node: Extract<MarkupNode, { type: 'environment' }>,
): Extract<MarkupNode, { type: 'environment' }>[] {
  return node.children.filter(
    (child): child is Extract<MarkupNode, { type: 'environment' }> =>
      child.type === 'environment' && child.name === 'step',
  );
}

function stepExplanation(step: Extract<MarkupNode, { type: 'environment' }>): string | undefined {
  return (
    step.attrs.explanation ||
    step.attrs.detail ||
    step.attrs.note ||
    plainTextFromNodes(step.children.filter((child) => child.type === 'text')) ||
    undefined
  );
}

function memoryVariablesFromVarCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'memory_diagram' }>['stack'] {
  return commands
    .filter((child) => child.name === 'var')
    .map((child) => ({
      name: child.attrs.name || child.attrs.id || 'var',
      value: child.attrs.value || '',
      ref: child.attrs.ref,
    }));
}

function memoryObjectsFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'memory_diagram' }>['heap'] {
  return commands
    .filter((child) => child.name === 'object')
    .map((child, index) => ({
      id: child.attrs.id || `obj_${index + 1}`,
      label: child.attrs.label || child.attrs.type || `object_${index + 1}`,
      fields: parseKeyValues(child.attrs.fields),
      active: parseBooleanAttr(child.attrs.active),
    }));
}

function linksFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'memory_diagram' }>['links'] {
  return commands
    .filter((child) => child.name === 'link')
    .map((child) => ({
      from: child.attrs.from || '',
      to: child.attrs.to || '',
      label: child.attrs.label,
      active: parseBooleanAttr(child.attrs.active),
    }))
    .filter((link) => link.from && link.to);
}

function memoryFramesFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'memory_diagram' }>['frames'] {
  return commands
    .filter((child) => child.name === 'frame')
    .map((frame, index) => {
      const values = parseKeyValues(frame.attrs.locals || frame.attrs.vars);
      const refs = parseKeyValues(frame.attrs.refs);
      const refMap = new Map(refs.map((item) => [item.name, item.value]));
      const variables = [
        ...values.map((item) => ({
          name: item.name,
          value: item.value,
          ref: refMap.get(item.name),
        })),
        ...refs
          .filter((item) => !values.some((value) => value.name === item.name))
          .map((item) => ({
            name: item.name,
            value: '',
            ref: item.value,
          })),
      ];
      return {
        name: frame.attrs.name || `frame_${index + 1}`,
        variables,
        active: parseBooleanAttr(frame.attrs.active),
      };
    });
}

function pointerNodesFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'pointer_diagram' }>['nodes'] {
  return commands
    .filter((child) => child.name === 'node')
    .map((child, index) => ({
      id: child.attrs.id || `node_${index + 1}`,
      label: child.attrs.label || child.attrs.value || `node_${index + 1}`,
      fields: parseKeyValues(child.attrs.fields),
      active: parseBooleanAttr(child.attrs.active),
      muted: parseBooleanAttr(child.attrs.muted),
    }));
}

function pointersFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'pointer_diagram' }>['pointers'] {
  return commands
    .filter((child) => child.name === 'pointer')
    .map((child, index) => ({
      name: child.attrs.name || `ptr_${index + 1}`,
      to: child.attrs.to,
    }));
}

function treeNodesFromCommands(
  commands: Extract<MarkupNode, { type: 'command' }>[],
): Extract<NotebookContentBlock, { type: 'tree_diagram' }>['nodes'] {
  return commands
    .filter((child) => child.name === 'node')
    .map((child, index) => ({
      id: child.attrs.id || `node_${index + 1}`,
      label: child.attrs.label || child.attrs.value || `node_${index + 1}`,
      children: splitTableCells(child.attrs.children || child.attrs.child || ''),
      left: child.attrs.left,
      right: child.attrs.right,
      active: parseBooleanAttr(child.attrs.active),
      muted: parseBooleanAttr(child.attrs.muted),
    }));
}

function parseTreeDirection(
  value: string | undefined,
): Extract<NotebookContentBlock, { type: 'tree_diagram' }>['steps'][number]['direction'] {
  if (
    value === 'left' ||
    value === 'right' ||
    value === 'visit' ||
    value === 'backtrack' ||
    value === 'aggregate' ||
    value === 'found' ||
    value === 'missing' ||
    value === 'done'
  ) {
    return value;
  }
  return undefined;
}

function memoryEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const commands = childCommands(node);
  const codeSource = getCodeSourceFromEnvironment(node);
  const steps = childStepEnvironments(node).map((step) => {
    const stepCommands = childCommands(step);
    return {
      title: step.attrs.title,
      line: parseNumber(step.attrs.line),
      frames: memoryFramesFromCommands(stepCommands),
      stack: memoryVariablesFromVarCommands(stepCommands),
      heap: memoryObjectsFromCommands(stepCommands),
      links: linksFromCommands(stepCommands),
      explanation: stepExplanation(step),
    };
  });

  return {
    type: 'memory_diagram',
    title: node.attrs.title,
    language: codeSource.language.toLowerCase(),
    code: node.children.some(
      (child) =>
        (child.type === 'command' && child.name === 'code') ||
        (child.type === 'environment' && VERBATIM_ENVIRONMENTS.has(child.name)),
    )
      ? codeSource.code
      : undefined,
    activeLines: splitTableCells(node.attrs.activeLines || '').flatMap((line) => {
      const parsed = parseNumber(line);
      return parsed ? [parsed] : [];
    }),
    frames: memoryFramesFromCommands(commands),
    stack: memoryVariablesFromVarCommands(commands),
    heap: memoryObjectsFromCommands(commands),
    links: linksFromCommands(commands),
    steps,
    caption: node.attrs.caption,
  };
}

function pointerEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const commands = childCommands(node);
  const steps = childStepEnvironments(node).map((step) => {
    const stepCommands = childCommands(step);
    return {
      title: step.attrs.title,
      operation: step.attrs.operation,
      nodes: pointerNodesFromCommands(stepCommands),
      pointers: pointersFromCommands(stepCommands),
      links: linksFromCommands(stepCommands),
      explanation: stepExplanation(step),
    };
  });

  return {
    type: 'pointer_diagram',
    kind: node.attrs.kind === 'linked_list' ? 'linked_list' : undefined,
    variant:
      node.attrs.variant === 'doubly' || node.attrs.variant === 'singly'
        ? node.attrs.variant
        : undefined,
    title: node.attrs.title,
    operation: node.attrs.operation,
    headLabel: node.attrs.headLabel || node.attrs.head,
    tailLabel: node.attrs.tailLabel || node.attrs.tail,
    nullLabel: node.attrs.nullLabel || node.attrs.null,
    nodes: pointerNodesFromCommands(commands),
    pointers: pointersFromCommands(commands),
    links: linksFromCommands(commands),
    steps,
    caption: node.attrs.caption,
  };
}

function linkedListEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const block = pointerEnvironmentToBlock(node);
  if (block.type !== 'pointer_diagram') return block;
  return {
    ...block,
    kind: 'linked_list',
    title: block.title || node.attrs.title,
    operation: block.operation || node.attrs.operation,
    headLabel: block.headLabel || node.attrs.head || node.attrs.front || 'front',
    tailLabel: block.tailLabel || node.attrs.tail,
    nullLabel: block.nullLabel || node.attrs.null || 'None',
  };
}

function linearStructureEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
  kind: 'stack' | 'queue',
): NotebookContentBlock {
  const commands = childCommands(node);
  const itemsFromCommands = (source: Extract<MarkupNode, { type: 'command' }>[]) =>
    source
      .filter((child) => child.name === 'node' || child.name === 'item')
      .map((child, index) => ({
        id: child.attrs.id || `item_${index + 1}`,
        label: child.attrs.label || child.attrs.value || child.attrs.name || `item_${index + 1}`,
        active: parseBooleanAttr(child.attrs.active),
        changed: parseBooleanAttr(child.attrs.changed),
        muted: parseBooleanAttr(child.attrs.muted),
        note: child.attrs.note,
      }));
  const steps = childStepEnvironments(node).map((step) => {
    const stepCommands = childCommands(step);
    return {
      title: step.attrs.title,
      operation: step.attrs.operation,
      items: itemsFromCommands(stepCommands),
      focus: splitTableCells(step.attrs.focus || ''),
      explanation: stepExplanation(step),
      result: step.attrs.result,
    };
  });

  return {
    type: 'linear_structure',
    kind,
    title: node.attrs.title,
    operation: node.attrs.operation,
    items: itemsFromCommands(commands),
    steps,
    caption: node.attrs.caption,
  };
}

function treeEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const commands = childCommands(node);
  return {
    type: 'tree_diagram',
    kind: node.attrs.kind === 'bst' ? 'bst' : undefined,
    title: node.attrs.title,
    nodes: treeNodesFromCommands(commands),
    rootId: node.attrs.root,
    path: splitTableCells(node.attrs.path || ''),
    target: node.attrs.target,
    decision: node.attrs.decision,
    invariant: node.attrs.invariant,
    steps: childStepEnvironments(node).map((step) => ({
      title: step.attrs.title,
      current: step.attrs.current,
      path: splitTableCells(step.attrs.path || ''),
      comparison: step.attrs.comparison,
      direction: parseTreeDirection(step.attrs.direction),
      result: step.attrs.result || stepExplanation(step),
    })),
    caption: node.attrs.caption,
  };
}

function bstEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const block = treeEnvironmentToBlock(node);
  if (block.type !== 'tree_diagram') return block;
  return {
    ...block,
    kind: 'bst',
    title: block.title || node.attrs.title,
    invariant:
      block.invariant ||
      node.attrs.invariant ||
      'BST invariant: every value in the left subtree is smaller; every value in the right subtree is larger.',
    target: block.target || node.attrs.target,
    decision: block.decision || node.attrs.decision,
  };
}

function parseInvariantStatus(status: string | undefined): 'holds' | 'violated' | 'unknown' {
  const normalized = (status || '').trim().toLowerCase();
  if (['hold', 'holds', 'ok', 'pass', 'true', 'valid', 'yes'].includes(normalized)) return 'holds';
  if (['violate', 'violated', 'fail', 'false', 'invalid', 'no', 'broken'].includes(normalized)) {
    return 'violated';
  }
  return 'unknown';
}

function invariantEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const checks = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'check',
    )
    .map((check, index) => ({
      label: stripLatexTextCommands(check.args[0] || check.attrs.label || `Check ${index + 1}`),
      text: stripLatexTextCommands(check.args[1] || check.attrs.text || check.args[0] || ''),
      status: parseInvariantStatus(check.attrs.status),
      reason: stripLatexTextCommands(check.attrs.reason || ''),
    }))
    .filter((check) => check.label && check.text);
  const invariantText =
    node.attrs.text ||
    node.attrs.invariant ||
    plainTextFromNodes(node.children.filter((child) => child.type !== 'command')) ||
    node.attrs.title ||
    'Invariant';

  return {
    type: 'invariant_panel',
    title: node.attrs.title,
    invariant: stripLatexTextCommands(invariantText),
    structure: node.attrs.structure,
    checks: checks.length
      ? checks
      : [
          {
            label: node.attrs.structure || 'Invariant',
            text: stripLatexTextCommands(invariantText),
            status: parseInvariantStatus(node.attrs.status),
            reason: node.attrs.reason,
          },
        ],
    caption: node.attrs.caption,
  };
}

function dictionaryEnvironmentToBlock(
  node: Extract<MarkupNode, { type: 'environment' }>,
): NotebookContentBlock {
  const entries = childCommands(node, 'entry')
    .map((entry) => ({
      key: entry.attrs.key || entry.attrs.name || '',
      value: entry.attrs.value || '',
      active: parseBooleanAttr(entry.attrs.active),
      changed: parseBooleanAttr(entry.attrs.changed),
      note: entry.attrs.note,
    }))
    .filter((entry) => entry.key);

  return {
    type: 'dictionary_diagram',
    title: node.attrs.title,
    operation: node.attrs.operation,
    lookupKey: node.attrs.key || node.attrs.lookupKey,
    result: node.attrs.result,
    entries: entries.length
      ? entries
      : [
          {
            key: node.attrs.key || 'key',
            value: node.attrs.result || '',
            active: true,
            changed: false,
          },
        ],
    caption: node.attrs.caption,
  };
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
  const context = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'context',
    )
    .map((item) => ({
      label: stripLatexTextCommands(item.args[0] || ''),
      text: stripLatexTextCommands(item.args[1] || ''),
      tone: parseContentTone(item.attrs.tone),
    }))
    .filter((item) => item.label && item.text);
  const steps = node.children
    .filter(
      (child): child is Extract<MarkupNode, { type: 'command' }> =>
        child.type === 'command' && child.name === 'step',
    )
    .map((step, index) => ({
      title: stripLatexTextCommands(step.args[0] || `Step ${index + 1}`),
      detail: stripLatexTextCommands(step.args[1] || step.args[0] || ''),
      note: step.attrs.note ? stripLatexTextCommands(step.attrs.note) : undefined,
    }))
    .filter((step) => step.detail);

  return {
    type: 'process_flow',
    title: node.attrs.title,
    orientation: node.attrs.orientation === 'vertical' ? 'vertical' : 'horizontal',
    context,
    steps: steps.length
      ? steps
      : [
          {
            title: node.attrs.title || 'Process',
            detail: plainTextFromNodes(node.children),
          },
        ],
    summary: node.attrs.summary,
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
    .map((step) => {
      const expression = step.args[1] || step.args[0] || '';
      const isTextExpression = shouldTreatDerivationExpressionAsText(expression);
      return {
        explanation: step.args[0] || undefined,
        expression: isTextExpression ? expression : normalizeMathSource(expression),
        format: isTextExpression ? ('text' as const) : ('latex' as const),
      };
    })
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

function validDeckStyle(value: string | undefined): NotebookContentDeckStyle {
  return value && DECK_STYLE_VALUES.has(value as NotebookContentDeckStyle)
    ? (value as NotebookContentDeckStyle)
    : 'classic_business';
}

function validProfile(
  value: string | undefined,
  blocks: NotebookContentBlock[],
): NotebookContentProfile {
  if (value && PROFILE_VALUES.has(value as NotebookContentProfile))
    return value as NotebookContentProfile;
  if (
    blocks.some((block) =>
      [
        'code_block',
        'code_walkthrough',
        'code_trace',
        'state_table',
        'call_stack',
        'memory_diagram',
        'pointer_diagram',
        'tree_diagram',
        'dictionary_diagram',
        'invariant_panel',
        'linear_structure',
      ].includes(block.type),
    )
  ) {
    return 'code';
  }
  return blocks.some((block) => ['equation', 'matrix', 'derivation_steps'].includes(block.type))
    ? 'math'
    : 'general';
}

function validLanguage(value: string | undefined): NotebookContentLanguage {
  return value && LANGUAGE_VALUES.has(value as NotebookContentLanguage)
    ? (value as NotebookContentLanguage)
    : 'zh-CN';
}

function escapeMarkupAttr(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}');
}

function stringifyAttrs(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs).filter(([, value]) => value !== undefined);
  if (!entries.length) return '';
  return `[${entries
    .map(([key, value]) => {
      if (value === 'true') return key;
      const needsBraces = /[\s,{}[\]\\]/.test(value);
      return `${key}=${needsBraces ? `{${escapeMarkupAttr(value)}}` : value}`;
    })
    .join(',')}]`;
}

function stringifyMarkupNodes(nodes: MarkupNode[], indent = ''): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value.trim();
      if (node.type === 'command') return node.raw;
      return stringifyEnvironment(node, indent);
    })
    .filter((value) => value.trim())
    .join('\n');
}

function stringifyEnvironment(
  node: Extract<MarkupNode, { type: 'environment' }>,
  indent = '',
): string {
  const body = stringifyMarkupNodes(node.children, `${indent}  `);
  return [
    `${indent}\\begin{${node.name}}${stringifyAttrs(node.attrs)}`,
    body
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `${indent}  ${line.trim()}`)
      .join('\n'),
    `${indent}\\end{${node.name}}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function getLayoutSlotBlock(
  nodes: MarkupNode[],
  slotId: string,
): Extract<MarkupNode, { type: 'environment' }> | null {
  return (
    nodes.find(
      (node): node is Extract<MarkupNode, { type: 'environment' }> =>
        node.type === 'environment' &&
        node.name === 'block' &&
        (node.attrs.slot || node.attrs.name || node.attrs.title) === slotId,
    ) ?? null
  );
}

function nodeIsLayoutSlotBlock(node: MarkupNode, slotIds: Set<string>): boolean {
  if (node.type !== 'environment' || node.name !== 'block') return false;
  const slotId = node.attrs.slot || node.attrs.name || node.attrs.title;
  return Boolean(slotId && slotIds.has(slotId));
}

function canonicalizeLegacySlotBlocks(
  slide: Extract<MarkupNode, { type: 'environment' }>,
): Extract<MarkupNode, { type: 'environment' }> | null {
  const template = validTemplate(slide.attrs.template);
  if (!template) return null;
  if (firstEnvironment(slide.children, 'columns') || firstEnvironment(slide.children, 'grid')) {
    return null;
  }

  if (template === 'two_column') {
    const left = getLayoutSlotBlock(slide.children, 'left');
    const right = getLayoutSlotBlock(slide.children, 'right');
    if (!left || !right) return null;
    const slotIds = new Set(['left', 'right']);
    const layoutNode: MarkupNode = {
      type: 'environment',
      name: 'columns',
      attrs: {},
      raw: '',
      children: [
        {
          type: 'environment',
          name: 'column',
          attrs: { name: 'left' },
          children: left.children,
          raw: '',
        },
        {
          type: 'environment',
          name: 'column',
          attrs: { name: 'right' },
          children: right.children,
          raw: '',
        },
      ],
    };
    return {
      ...slide,
      children: [
        ...slide.children.filter((node) => !nodeIsLayoutSlotBlock(node, slotIds)),
        layoutNode,
      ],
    };
  }

  if (template === 'three_cards' || template === 'four_grid') {
    const ids =
      template === 'four_grid'
        ? ['card_1', 'card_2', 'card_3', 'card_4']
        : ['card_1', 'card_2', 'card_3'];
    const slotBlocks = ids.map((id) => getLayoutSlotBlock(slide.children, id));
    if (slotBlocks.some((block) => !block)) return null;
    const slotIds = new Set(ids);
    const layoutNode: MarkupNode = {
      type: 'environment',
      name: 'grid',
      attrs: {},
      raw: '',
      children: ids.map((id, index) => ({
        type: 'environment',
        name: 'cell',
        attrs: { name: id },
        children: slotBlocks[index]?.children || [],
        raw: '',
      })),
    };
    return {
      ...slide,
      children: [
        ...slide.children.filter((node) => !nodeIsLayoutSlotBlock(node, slotIds)),
        layoutNode,
      ],
    };
  }

  return null;
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

function slotsFromNamedBlocks(
  nodes: MarkupNode[],
  template: NotebookContentLayoutTemplate | undefined,
): NotebookContentSlot[] {
  if (!template) return [];
  const spec = getSlotTemplateSpec(template);
  if (!spec) return [];
  const allowedSlotIds = new Set(spec.slots.map((slot) => slot.slotId));
  const blockNodes = nodes.filter(
    (node): node is Extract<MarkupNode, { type: 'environment' }> =>
      node.type === 'environment' && node.name === 'block',
  );

  return blockNodes
    .map((block, index) => {
      const slotId = block.attrs.slot || block.attrs.name || block.attrs.title;
      if (!slotId || !allowedSlotIds.has(slotId)) return null;
      return makeSlot(slotId, nodesToBlocks(block.children), index);
    })
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

  const namedBlockSlots = slotsFromNamedBlocks(slide.children, explicitTemplate);
  if (namedBlockSlots.length >= 2) {
    return { layoutTemplate: explicitTemplate, slots: namedBlockSlots };
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
    const normalizedMarkup = normalizeSyntaraCommandEscapes(markup);
    const nodes = parseNodes(normalizedMarkup).value;
    const directFrame =
      nodes.find(
        (node): node is Extract<MarkupNode, { type: 'environment' }> =>
          node.type === 'environment' && NOTEBOOK_FRAME_ENVIRONMENTS.has(node.name),
      ) ?? null;
    if (directFrame) return directFrame;
    const nestedFrame = collectEnvironments(nodes, NOTEBOOK_FRAME_ENVIRONMENTS)[0];
    if (nestedFrame) return nestedFrame;
    const document = firstEnvironment(nodes, 'document');
    if (document) {
      return {
        type: 'environment',
        name: 'slide',
        attrs: {},
        children: document.children,
        raw: document.raw,
      };
    }
    return (
      firstEnvironment(nodes, 'slide') ?? {
        type: 'environment',
        name: 'slide',
        attrs: {},
        children: nodes,
        raw: normalizedMarkup,
      }
    );
  } catch {
    return null;
  }
}

function parseNotebookMarkupNodes(markup: string): MarkupNode[] {
  return parseNodes(normalizeSyntaraCommandEscapes(markup)).value;
}

export function normalizeSyntaraMarkupLayout(markup: string): string {
  const normalizedMarkup = normalizeSyntaraCommandEscapes(markup);
  const slide = parseSyntaraMarkup(normalizedMarkup);
  if (!slide || slide.type !== 'environment') return markup;
  const canonicalSlide = canonicalizeLegacySlotBlocks(slide);
  return canonicalSlide ? stringifyEnvironment(canonicalSlide) : normalizedMarkup.trim();
}

export function compileSyntaraMarkupToNotebookDocument(
  markup: string,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument | null {
  const slide = parseSyntaraMarkup(normalizeSyntaraMarkupLayout(markup));
  if (!slide || slide.type !== 'environment') return null;
  return compileSlideNodeToNotebookDocument(slide, defaults);
}

function compileSlideNodeToNotebookDocument(
  slide: Extract<MarkupNode, { type: 'environment' }>,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument | null {
  const blocks = nodesToBlocks(slide.children);
  if (!blocks.length) return null;

  const layout = inferDocumentLayout(slide, blocks);
  const hasDefinition = blocks.some(
    (block) => block.type === 'definition' || block.type === 'theorem',
  );
  const hasFormula = blocks.some((block) => block.type === 'equation' || block.type === 'matrix');
  const template =
    layout.layoutTemplate === 'title_content' && hasDefinition && hasFormula
      ? 'definition_board'
      : layout.layoutTemplate;
  const spec = template ? getSlotTemplateSpec(template) : undefined;
  const slots = spec
    ? layout.slots?.filter((slot) => spec.slots.some((slotSpec) => slotSpec.slotId === slot.slotId))
    : undefined;

  const candidate = {
    version: slots?.length ? 2 : 1,
    language: validLanguage(slide.attrs.language || defaults.language),
    title:
      slide.attrs.title || firstCommand(slide.children, 'frametitle')?.args[0] || defaults.title,
    profile: validProfile(slide.attrs.profile, blocks),
    disciplineStyle:
      slide.attrs.discipline === 'code' ||
      slide.attrs.style === 'code' ||
      validProfile(slide.attrs.profile, blocks) === 'code'
        ? 'code'
        : slide.attrs.discipline === 'math' || slide.attrs.style === 'math'
          ? 'math'
          : 'general',
    teachingFlow: blocks.some((block) => block.type === 'derivation_steps')
      ? 'proof_walkthrough'
      : blocks.some((block) =>
            [
              'code_block',
              'code_walkthrough',
              'code_trace',
              'state_table',
              'call_stack',
              'memory_diagram',
              'pointer_diagram',
              'tree_diagram',
              'dictionary_diagram',
              'invariant_panel',
              'linear_structure',
            ].includes(block.type),
          )
        ? 'code_walkthrough'
        : 'standalone',
    density: validDensity(slide.attrs.density),
    deckStyle: validDeckStyle(slide.attrs.deckStyle || slide.attrs.stylePreset),
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

export function normalizeNotebookLatexSource(markup: string): string {
  const trimmed = markup.trim();
  if (!trimmed) return '';
  if (trimmed.includes('\\begin{slide}')) return normalizeSyntaraMarkupLayout(trimmed);
  return trimmed;
}

export function compileNotebookLatexToNotebookDocument(
  markup: string,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument | null {
  return compileSyntaraMarkupToNotebookDocument(normalizeNotebookLatexSource(markup), defaults);
}

export function compileNotebookLatexToNotebookDocuments(
  markup: string,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument[] {
  const normalized = normalizeNotebookLatexSource(markup);
  try {
    const nodes = parseNotebookMarkupNodes(normalized);
    const frames = collectEnvironments(nodes, NOTEBOOK_FRAME_ENVIRONMENTS);
    if (!frames.length) {
      const single = compileNotebookLatexToNotebookDocument(normalized, defaults);
      return single ? [single] : [];
    }
    return frames
      .map((frame) => compileSlideNodeToNotebookDocument(frame, defaults))
      .filter((document): document is NotebookContentDocument => Boolean(document));
  } catch {
    const single = compileNotebookLatexToNotebookDocument(normalized, defaults);
    return single ? [single] : [];
  }
}

export function extractSyntaraMarkup(input: string): string | null {
  const fenced = input.match(/```(?:syntara|syntara-markup|tex|latex)\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.includes('\\begin{slide}')) return fenced[1].trim();
  if (input.includes('\\begin{slide}')) return input.trim();
  return null;
}

export function extractNotebookLatexSource(input: string): string | null {
  const fenced = input.match(/```(?:syntara|syntara-markup|tex|latex)\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || input).trim();
  if (
    /\\begin\{(?:document|slide|frame)\}|\\(?:section|subsection|frametitle|title)\{|\\begin\{(?:lstlisting|minted|verbatim|trace|walkthrough|callstack|memory|linkedlist|stack|queue|pointers|tree|bst|invariant|process)\}/.test(
      candidate,
    )
  ) {
    return candidate;
  }
  return null;
}
