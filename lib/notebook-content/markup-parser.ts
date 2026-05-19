export type MarkupNode =
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
      raw: string;
    }
  | {
      type: 'text';
      value: string;
    };

export type ParseResult<T> = { value: T; index: number };

export const NOTEBOOK_FRAME_ENVIRONMENTS = new Set(['slide', 'frame']);
export const VERBATIM_ENVIRONMENTS = new Set(['lstlisting', 'minted', 'verbatim', 'code']);
export const DISPLAY_MATH_ENVIRONMENTS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'displaymath',
]);
const BRACED_ENV_ARG_ATTR: Record<string, string> = {
  slide: 'title',
  frame: 'title',
  block: 'title',
  alertblock: 'title',
  exampleblock: 'title',
  definition: 'title',
  theorem: 'title',
  lemma: 'title',
  proposition: 'title',
  corollary: 'title',
  example: 'title',
  minted: 'language',
  linkedlist: 'title',
  memory: 'title',
  pointers: 'title',
  tree: 'title',
  stack: 'title',
  queue: 'title',
  bst: 'title',
  dictionary: 'title',
  invariant: 'title',
};

const COMMAND_ARG_COUNTS: Record<string, number> = {
  text: 1,
  heading: 1,
  bullet: 1,
  formula: 1,
  code: 1,
  statetable: 1,
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
  frame: 1,
  var: 0,
  object: 0,
  link: 0,
  node: 0,
  pointer: 0,
  entry: 0,
  check: 2,
  title: 1,
  subtitle: 1,
  section: 1,
  subsection: 1,
  subsubsection: 1,
  frametitle: 1,
  caption: 1,
  item: 0,
  card: 2,
  context: 2,
};

const SYNTARA_COMMAND_ESCAPE_PATTERN = new RegExp(
  String.raw`\\\\(?=(?:begin|end|${Object.keys(COMMAND_ARG_COUNTS).join('|')})\b)`,
  'g',
);

export function normalizeSyntaraCommandEscapes(source: string): string {
  return source.includes('\\\\') ? source.replace(SYNTARA_COMMAND_ESCAPE_PATTERN, '\\') : source;
}

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

export function splitTopLevel(input: string, separator = ','): string[] {
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
    value: { type: 'command', name, attrs: attrResult.value, args, raw: source.slice(index, i) },
    index: i,
  };
}

function parseEnvironment(source: string, index: number): ParseResult<MarkupNode> | null {
  if (!source.startsWith('\\begin{', index)) return null;
  const name = readBalanced(source, index + '\\begin'.length, '{', '}');
  const attrResult = readOptionalAttrs(source, name.index);
  const attrs = { ...attrResult.value };
  let bodyStart = attrResult.index;
  const bracedArgAttr = BRACED_ENV_ARG_ATTR[name.value];
  if (bracedArgAttr) {
    const argStart = skipWhitespace(source, bodyStart);
    if (source[argStart] === '{') {
      const arg = readBalanced(source, argStart, '{', '}');
      attrs[bracedArgAttr] = arg.value.trim();
      bodyStart = arg.index;
    }
  }
  const endToken = `\\end{${name.value}}`;
  if (VERBATIM_ENVIRONMENTS.has(name.value)) {
    const endIndex = source.indexOf(endToken, bodyStart);
    const raw = source.slice(bodyStart, endIndex >= 0 ? endIndex : source.length);
    return {
      value: {
        type: 'environment',
        name: name.value,
        attrs,
        children: raw.trim() ? [{ type: 'text', value: raw }] : [],
        raw,
      },
      index: endIndex >= 0 ? endIndex + endToken.length : source.length,
    };
  }

  const childrenResult = parseNodes(source, bodyStart, endToken);
  const raw = source.slice(bodyStart, childrenResult.index);
  const endIndex = source.startsWith(endToken, childrenResult.index)
    ? childrenResult.index + endToken.length
    : childrenResult.index;

  return {
    value: {
      type: 'environment',
      name: name.value,
      attrs,
      children: childrenResult.value,
      raw,
    },
    index: endIndex,
  };
}

export function parseNodes(
  source: string,
  index = 0,
  stopToken?: string,
): ParseResult<MarkupNode[]> {
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

export function firstEnvironment(
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

export function collectEnvironments(
  nodes: MarkupNode[],
  names: Set<string>,
): Extract<MarkupNode, { type: 'environment' }>[] {
  const matches: Extract<MarkupNode, { type: 'environment' }>[] = [];
  for (const node of nodes) {
    if (node.type !== 'environment') continue;
    if (names.has(node.name)) matches.push(node);
    matches.push(...collectEnvironments(node.children, names));
  }
  return matches;
}

export function firstCommand(
  nodes: MarkupNode[],
  name: string,
): Extract<MarkupNode, { type: 'command' }> | null {
  for (const node of nodes) {
    if (node.type === 'command' && node.name === name) return node;
    if (node.type === 'environment') {
      const nested = firstCommand(node.children, name);
      if (nested) return nested;
    }
  }
  return null;
}

export function plainTextFromNodes(nodes: MarkupNode[]): string {
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
