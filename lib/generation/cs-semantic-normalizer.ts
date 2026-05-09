import {
  parseNotebookContentDocument,
  type NotebookContentBlock,
  type NotebookContentDocument,
  type NotebookContentLayoutFamily,
  type NotebookContentLayoutTemplate,
  type NotebookContentSlot,
  type NotebookContentVisualRole,
} from '@/lib/notebook-content';
import type { SceneOutline } from '@/lib/types/generation';

type JsonRecord = Record<string, unknown>;

const CODE_BLOCK_KEYS = new Set(['code', 'latex', 'expression', 'formula', 'equation', 'source']);
const METADATA_KEYS = new Set([
  'id',
  'type',
  'kind',
  'language',
  'profile',
  'disciplineStyle',
  'teachingFlow',
  'layoutFamily',
  'layoutTemplate',
  'visualRole',
  'tone',
  'status',
  'mode',
  'variant',
  'algorithm',
  'from',
  'to',
  'rootId',
  'startId',
]);

const CS_SIGNAL_TERMS = [
  'oop',
  'python',
  'class ',
  'class:',
  'constructor',
  'initializer',
  'encapsulation',
  'public',
  'private',
  'representation',
  'type annotation',
  'dot lookup',
  'self',
  '__init__',
  'method',
  'attribute',
  'instance',
  'object',
  'aliasing',
  'heap',
  'stack',
  'queue',
  'dictionary',
  'dict',
  'linked list',
  'linkedlist',
  'doubly',
  'bst',
  'binary search tree',
  'tree',
  'graph',
  'bfs',
  'dfs',
  'frontier',
  'visited',
  'recursion',
  'recursive',
  'loop',
  'invariant',
  'tweet',
  'course',
  'userid',
  'created_at',
  'likes',
  '类',
  '类型',
  '自定义类',
  '自定义类型',
  '函数',
  '方法',
  '点号',
  '调用',
  '初始化',
  '初始化器',
  '构造',
  '构造器',
  '类型注解',
  '类型标注',
  '公开',
  '公共接口',
  '私有',
  '私有实现',
  '封装',
  '信息隐藏',
  '表示',
  '表示不变式',
  '合法',
  '不合法',
  '客户端',
  '类文档',
  '文档字符串',
  '指针',
  '链表',
  '二叉',
  '搜索树',
  '递归',
  '循环',
  '队列',
  '栈',
  '字典',
  '对象',
  '实例',
  '属性',
  '不变式',
];

const CS_STRONG_PATTERNS = [
  /(^|[^a-z])oop([^a-z]|$)/i,
  /面向对象|自定义类|自定义类型|类设计|类文档|文档字符串|类型标注|类型注解/i,
  /类[、，\s]*(实例|对象|属性|方法)|实例[、，\s]*(属性|方法)|对象[、，\s]*(属性|方法)/i,
  /__init__|self\b|self\.|dot lookup|点号|初始化器|构造器/i,
  /表示不变式|rep invariant|信息隐藏|封装|公共接口|私有实现|客户端.*属性/i,
  /Tweet|Course|userid|created_at|likes|点赞|作者|日期/i,
  /linked\s*list|binary\s*search\s*tree|call\s*stack|memory\s*trace|graph\s*trace/i,
  /breadth[-\s]*first|depth[-\s]*first|frontier|visited/i,
  /链表|二叉搜索树|调用栈|内存图|内存追踪|广度优先|深度优先|栈顶|队首|队尾/i,
];

const DEDUPABLE_BLOCK_TYPES = new Set<NotebookContentBlock['type']>([
  'paragraph',
  'bullet_list',
  'callout',
  'definition',
  'theorem',
  'layout_cards',
  'process_flow',
]);

type CodeTraceBlock = Extract<NotebookContentBlock, { type: 'code_trace' }>;
type CodeTraceKeyValue = CodeTraceBlock['inputs'][number];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectText(value: unknown, parentKey = ''): string {
  if (typeof value === 'string') {
    if (CODE_BLOCK_KEYS.has(parentKey)) return '';
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => collectText(item, parentKey)).join('\n');
  if (!isRecord(value)) return '';

  return Object.entries(value)
    .map(([key, nested]) => collectText(nested, key))
    .filter(Boolean)
    .join('\n');
}

function hasStrongComputerScienceSignal(searchable: string): boolean {
  return CS_STRONG_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function isComputerScienceSemanticDocument(
  document: NotebookContentDocument,
  outline?: SceneOutline,
): boolean {
  if (document.profile === 'code' || document.disciplineStyle === 'code') return true;
  if (outline?.contentProfile === 'code' || outline?.workedExampleConfig?.kind === 'code')
    return true;
  if (outline?.layoutIntent?.layoutFamily === 'code_walkthrough') return true;
  if (
    document.profile === 'math' ||
    document.disciplineStyle === 'math' ||
    outline?.contentProfile === 'math' ||
    outline?.layoutIntent?.disciplineStyle === 'math' ||
    outline?.workedExampleConfig?.kind === 'math' ||
    outline?.workedExampleConfig?.kind === 'proof'
  ) {
    return false;
  }

  const searchable = [
    outline?.title,
    outline?.description,
    outline?.teachingObjective,
    ...(outline?.keyPoints ?? []),
    document.title,
    collectText(document.blocks),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (hasStrongComputerScienceSignal(searchable)) return true;

  let score = 0;
  for (const term of CS_SIGNAL_TERMS) {
    if (searchable.includes(term)) score += 1;
    if (score >= 2) return true;
  }
  return false;
}

function collectOutlineText(outline: SceneOutline): string {
  return [
    outline.title,
    outline.description,
    outline.teachingObjective,
    ...(outline.keyPoints ?? []),
    outline.contentProfile,
    outline.layoutIntent?.disciplineStyle,
    outline.layoutIntent?.layoutFamily,
    outline.workedExampleConfig?.kind,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function isComputerScienceOutline(outline: SceneOutline): boolean {
  if (outline.contentProfile === 'code') return true;
  if (outline.workedExampleConfig?.kind === 'code') return true;
  if (outline.layoutIntent?.disciplineStyle === 'code') return true;
  if (outline.layoutIntent?.layoutFamily === 'code_walkthrough') return true;
  if (
    outline.contentProfile === 'math' ||
    outline.layoutIntent?.disciplineStyle === 'math' ||
    outline.workedExampleConfig?.kind === 'math' ||
    outline.workedExampleConfig?.kind === 'proof'
  ) {
    return false;
  }

  const searchable = collectOutlineText(outline);
  if (hasStrongComputerScienceSignal(searchable)) return true;

  let score = 0;
  for (const term of CS_SIGNAL_TERMS) {
    if (searchable.includes(term)) score += 1;
    if (score >= 2) return true;
  }
  return false;
}

function normalizeSignature(input: string): string {
  return input
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, '')
    .replace(/[\s，。；：、,.!?！？:;()[\]{}<>《》\-—_=+*/\\]+/g, '')
    .slice(0, 240);
}

function normalizeCodeTraceSignature(block: CodeTraceBlock): string {
  return block.code.toLowerCase().replace(/#.*$/gm, '').replace(/\s+/g, '').slice(0, 500);
}

function dedupeCodeTraceKeyValues(
  items: CodeTraceKeyValue[],
  maxItems: number,
): CodeTraceKeyValue[] {
  const seen = new Set<string>();
  const result: CodeTraceKeyValue[] = [];
  for (const item of items) {
    const signature = normalizeSignature(`${item.name}:${item.value}`);
    if (signature && seen.has(signature)) continue;
    if (signature) seen.add(signature);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function codeTraceStepSignature(step: CodeTraceBlock['steps'][number]): string {
  return normalizeSignature(
    [
      step.line ? `line ${step.line}` : '',
      step.explanation,
      ...step.state.map((item) => `${item.name}:${item.value}`),
    ].join('\n'),
  );
}

function mergeCodeTraceBlocks(primary: CodeTraceBlock, duplicate: CodeTraceBlock): CodeTraceBlock {
  const stepSignatures = new Set(primary.steps.map(codeTraceStepSignature));
  const mergedSteps = [...primary.steps];

  for (const step of duplicate.steps) {
    const signature = codeTraceStepSignature(step);
    if (signature && stepSignatures.has(signature)) continue;
    if (signature) stepSignatures.add(signature);
    mergedSteps.push(step);
    if (mergedSteps.length >= 12) break;
  }

  return {
    ...primary,
    title: primary.title || duplicate.title,
    language: primary.language || duplicate.language,
    inputs: dedupeCodeTraceKeyValues([...primary.inputs, ...duplicate.inputs], 8),
    activeLines: Array.from(new Set([...primary.activeLines, ...duplicate.activeLines])).slice(
      0,
      12,
    ),
    steps: mergedSteps,
    output: primary.output || duplicate.output,
  };
}

function stripMetaTeachingVoice(input: string): string {
  return input
    .replace(/在学生已经理解[^，。；;]*后，?\s*进一步指出[:：]?/g, '')
    .replace(/在学生已经理解[^，。；;]*后，?/g, '')
    .replace(/最后一页回收本节所有主线，帮助学生/g, '最后把本节主线合起来，')
    .replace(/本页用于连接([^。；;]+)的必要性/g, '现在把$1连起来看')
    .replace(/本页用于/g, '这里先看')
    .replace(/本页明确/g, '这里要看清')
    .replace(/进一步指出[:：]?/g, '接着看：')
    .replace(/学习者将/g, '我们要')
    .replace(/教学目标[:：]?/g, '目标：')
    .replace(/课程设计说明[:：]?/g, '')
    .replace(/页面目标[:：]?/g, '目标：');
}

function normalizeCodeLikeMath(input: string): string {
  return input.replace(/\$([^$\n]{1,120})\$/g, (match, inner: string) => {
    const unescaped = inner.replace(/\\_/g, '_').replace(/\\\{/g, '{').replace(/\\}/g, '}').trim();
    const codeLike =
      /__|self|\.|=|->|\[[^\]]*]|[A-Za-z_][A-Za-z0-9_]*\s*\(|^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(
        unescaped,
      ) && !/[\\^]/.test(unescaped);
    return codeLike ? `\`${unescaped}\`` : match;
  });
}

function cleanInlineMarkup(input: string): string {
  let text = normalizeCodeLikeMath(input);

  for (let pass = 0; pass < 3; pass += 1) {
    text = text
      .replace(/\\code(?:\[[^\]]*])?\{([^{}]*)\}/g, '`$1`')
      .replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
      .replace(/\\(?:text|textbf|textit|emph|alert)\{([^{}]*)\}/g, '$1');
  }

  text = text
    .replace(/\\code(?:\[[^\]]*])?\{/g, '`')
    .replace(/\\texttt\{/g, '`')
    .replace(/\\\s*texttt\{/g, '`')
    .replace(/\\+text(?=$|[\s\u3400-\u9fff\u3000-\u303f\uff00-\uffef"'“”‘’「」『』（(【\[])/g, '')
    .replace(
      /\\+(?:bullet|heading|callout|summary|warning|question|text|example|card|step)\b\s*/gi,
      '',
    )
    .replace(
      /(^|[\s\n\r])(?:bullet|heading|callout|summary|warning|question|text|example|card|step|begin|end)\s+(?=[\u4e00-\u9fff`])/gi,
      '$1',
    )
    .replace(/\\+(?:begin|end)\{[^{}]*\}/gi, '')
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\}/g, '}')
    .replace(/`([^`\n{}]{1,140)}/g, '`$1`')
    .replace(/\\([A-Za-z]+)\{/g, '$1 ')
    .replace(/\s+}/g, '')
    .replace(/(?<!\{)}/g, '');

  const backtickCount = (text.match(/`/g) ?? []).length;
  if (backtickCount % 2 === 1) {
    text = text.replace(/`/g, '');
  }

  return text;
}

function normalizeStudentFacingText(input: string): string {
  return stripMetaTeachingVoice(cleanInlineMarkup(input))
    .replace(/面向对象程序设计\s*转\s*PPT/gi, '面向对象程序设计')
    .replace(/\s*转\s*PPT\b/gi, '')
    .replace(/\[Table\]\s*/gi, '')
    .replace(/\\len\s*\(\s*([^)]+?)\s*\)/g, 'len($1)')
    .replace(/\blen\(([^)]+?)\)\s*(?:≤|\\leq|<=)\s*(\d+)/g, '`len($1) <= $2`')
    .replace(/\blen\((self\.)?content\)\s*=\s*0`?/g, '`0 <= len($1content) <= 280`')
    .replace(/\blen\((self\.)?content\)\s*==\s*0`?/g, '`0 <= len($1content) <= 280`')
    .replace(/<\/?beginrow|\\endrows|\\endslide/gi, '')
    .replace(/\bself\s+dot\s+([A-Za-z_][A-Za-z0-9_]*)/gi, 'self.$1')
    .replace(/\bcreated\s+a\s*t\b/gi, 'created_at')
    .replace(/\brow 下标 index\b/gi, 'row index')
    .replace(/\bcol 下标 index\b/gi, 'col index')
    .replace(/\s+([，。；：,.!?！？;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isGenericTeachingPlaceholder(input: string): boolean {
  const normalized = normalizeSignature(input);
  return [
    '先理解这一页的核心概念与结论',
    '讲解时可根据上下文继续补充细节与例子',
    '根据上下文继续补充细节与例子',
    '回收本节所有概念形成从建模到写类的统一checklist为后续封装信息隐藏与数据结构课程做过渡',
    '回收本节所有概念形成从建模到写类的统一checklist为后续封装信息隐藏与数据结构课程做过渡',
  ].includes(normalized);
}

function sanitizeValue(value: unknown, parentKey = ''): unknown {
  if (typeof value === 'string') {
    if (CODE_BLOCK_KEYS.has(parentKey)) return value;
    if (METADATA_KEYS.has(parentKey) && parentKey !== 'label' && parentKey !== 'title')
      return value;
    return normalizeStudentFacingText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, parentKey));
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested, key)]),
  );
}

function shouldPreserveOutlineVisual(outline?: SceneOutline): boolean {
  if (!outline) return false;
  const visualRole = outline.layoutIntent?.visualRole;
  return Boolean(
    outline.layoutIntent?.layoutTemplate === 'visual_three_steps' ||
    visualRole === 'source_image' ||
    visualRole === 'generated_image' ||
    visualRole === 'diagram' ||
    outline.suggestedImageIds?.length ||
    outline.mediaGenerations?.some((media) => media.type === 'image'),
  );
}

function shouldPreserveDocumentVisual(
  document: NotebookContentDocument,
  outline?: SceneOutline,
): boolean {
  return Boolean(
    shouldPreserveOutlineVisual(outline) ||
    document.visualSlot ||
    document.blocks.some((block) => block.type === 'visual'),
  );
}

function shouldKeepVisualBlock(block: NotebookContentBlock, preserveVisual = false): boolean {
  if (block.type !== 'visual') return true;
  if (preserveVisual) return true;
  if (block.role !== 'source_image') return false;
  return !String(block.source).startsWith('gen_');
}

function dedupeStringList(items: string[], seen: Set<string>): string[] {
  const result: string[] = [];
  for (const item of items) {
    if (isGenericTeachingPlaceholder(item)) continue;
    const signature = normalizeSignature(item);
    if (signature.length >= 24 && seen.has(signature)) continue;
    if (signature.length >= 24) seen.add(signature);
    result.push(item);
  }
  return result;
}

function dedupeBlock(block: NotebookContentBlock, seen: Set<string>): NotebookContentBlock | null {
  const mutable = block as NotebookContentBlock & { items?: unknown };

  if (block.type === 'bullet_list' && Array.isArray(mutable.items)) {
    const items = dedupeStringList(
      mutable.items.filter((item): item is string => typeof item === 'string'),
      seen,
    );
    if (items.length === 0) return null;
    return { ...block, items };
  }

  const text = collectText(block);
  if (isGenericTeachingPlaceholder(text)) return null;
  const signature = normalizeSignature(text);
  if (DEDUPABLE_BLOCK_TYPES.has(block.type) && signature.length >= 36 && seen.has(signature)) {
    return null;
  }
  if (signature.length >= 36) seen.add(signature);
  return block;
}

function normalizeBlocks(
  blocks: NotebookContentBlock[],
  options?: { preserveVisual?: boolean },
): NotebookContentBlock[] {
  const seen = new Set<string>();
  const codeTraceIndexBySignature = new Map<string, number>();
  const normalized: NotebookContentBlock[] = [];

  for (const block of blocks) {
    const sanitized = sanitizeValue(block) as NotebookContentBlock;
    if (!shouldKeepVisualBlock(sanitized, options?.preserveVisual)) continue;

    const deduped = dedupeBlock(sanitized, seen);
    if (!deduped) continue;

    if (deduped.type === 'code_trace') {
      const signature = normalizeCodeTraceSignature(deduped);
      const existingIndex = codeTraceIndexBySignature.get(signature);
      if (signature.length >= 12 && existingIndex !== undefined) {
        const existing = normalized[existingIndex];
        if (existing?.type === 'code_trace') {
          normalized[existingIndex] = mergeCodeTraceBlocks(existing, deduped);
          continue;
        }
      }
      if (signature.length >= 12) {
        codeTraceIndexBySignature.set(signature, normalized.length);
      }
    }

    normalized.push(deduped);
  }

  return normalized;
}

function normalizeSlots(
  slots: NotebookContentSlot[] | undefined,
  options?: { preserveVisual?: boolean },
): NotebookContentSlot[] | undefined {
  if (!slots) return undefined;

  const result: NotebookContentSlot[] = [];
  for (const slot of slots) {
    const blocks = normalizeBlocks(slot.blocks, options);
    if (blocks.length === 0) continue;
    result.push({
      ...slot,
      role: slot.role ? normalizeStudentFacingText(slot.role) : slot.role,
      blocks,
    });
  }

  return result.length > 0 ? result : undefined;
}

function hasSourceVisual(document: NotebookContentDocument): boolean {
  return (
    document.visualRole === 'source_image' ||
    Boolean(document.visualSlot && document.visualSlot.role === 'source_image') ||
    document.blocks.some((block) => block.type === 'visual' && block.role === 'source_image')
  );
}

function chooseLayoutFamily(document: NotebookContentDocument): NotebookContentLayoutFamily {
  if (document.archetype === 'summary') return 'summary';
  if (document.layoutFamily === 'problem_statement' || document.layoutFamily === 'derivation') {
    return document.layoutFamily;
  }
  return 'code_walkthrough';
}

function chooseLayoutTemplate(document: NotebookContentDocument): NotebookContentLayoutTemplate {
  if (document.archetype === 'summary') return 'two_by_one_summary';
  if (document.layoutFamily === 'problem_statement') return 'problem_focus';
  if (document.layoutFamily === 'derivation') return 'derivation_ladder';
  return 'code_split';
}

function chooseVisualRole(
  document: NotebookContentDocument,
  outline?: SceneOutline,
): NotebookContentVisualRole {
  if (shouldPreserveOutlineVisual(outline)) {
    return outline?.layoutIntent?.visualRole || document.visualSlot?.role || document.visualRole;
  }
  return hasSourceVisual(document) ? 'source_image' : 'none';
}

function shouldPreserveNonCodeComputerScienceLayout(outline?: SceneOutline): boolean {
  if (!outline) return false;
  if (outline.contentProfile === 'code') return false;
  if (outline.layoutIntent?.layoutFamily === 'code_walkthrough') return false;
  return true;
}

export function normalizeComputerScienceSemanticDocument(
  document: NotebookContentDocument,
  outline?: SceneOutline,
): NotebookContentDocument {
  if (!isComputerScienceSemanticDocument(document, outline)) return document;

  const preserveVisual = shouldPreserveDocumentVisual(document, outline);
  const visualRole = chooseVisualRole(document, outline);
  const blocks = normalizeBlocks(document.blocks, { preserveVisual });
  const slots = normalizeSlots(document.slots, { preserveVisual });
  const fallbackBlocks: NotebookContentBlock[] = [
    {
      type: 'callout',
      tone: 'tip',
      title: document.language === 'en-US' ? 'Before coding' : '写代码前',
      text:
        document.language === 'en-US'
          ? 'Name the state, the operation, and the rule that must still hold after the operation.'
          : '先说清楚状态是什么、这一步改谁、操作结束后哪个规则必须仍然成立。',
    },
  ];
  const safeBlocks = blocks.length > 0 ? blocks : fallbackBlocks;
  const safeSlots =
    slots ??
    (document.slots?.length
      ? [
          {
            ...document.slots[0],
            role: document.slots[0].role
              ? normalizeStudentFacingText(document.slots[0].role)
              : document.slots[0].role,
            blocks: safeBlocks,
          },
        ]
      : undefined);
  if (shouldPreserveNonCodeComputerScienceLayout(outline)) {
    const candidate: NotebookContentDocument = {
      ...document,
      title: document.title ? normalizeStudentFacingText(document.title) : document.title,
      profile: outline?.contentProfile || document.profile || 'general',
      disciplineStyle: outline?.layoutIntent?.disciplineStyle || document.disciplineStyle || 'code',
      teachingFlow:
        outline?.layoutIntent?.teachingFlow || document.teachingFlow || 'concept_explain',
      layoutFamily: outline?.layoutIntent?.layoutFamily || document.layoutFamily || 'concept_cards',
      layoutTemplate: outline?.layoutIntent?.layoutTemplate || document.layoutTemplate,
      density: outline?.layoutIntent?.density || document.density || 'standard',
      visualRole,
      visualSlot: preserveVisual ? document.visualSlot : undefined,
      overflowPolicy:
        outline?.layoutIntent?.overflowPolicy || document.overflowPolicy || 'compress_first',
      blocks: safeBlocks,
      slots: safeSlots,
    };
    return parseNotebookContentDocument(candidate) ?? candidate;
  }
  const candidate: NotebookContentDocument = {
    ...document,
    title: document.title ? normalizeStudentFacingText(document.title) : document.title,
    profile: 'code',
    disciplineStyle: 'code',
    teachingFlow:
      document.teachingFlow === 'standalone' || document.teachingFlow === 'concept_explain'
        ? 'code_walkthrough'
        : document.teachingFlow,
    layoutFamily: chooseLayoutFamily(document),
    layoutTemplate: chooseLayoutTemplate(document),
    density: document.density === 'light' ? 'standard' : document.density,
    visualRole,
    visualSlot: preserveVisual ? document.visualSlot : undefined,
    overflowPolicy: 'preserve_then_paginate',
    blocks: safeBlocks,
    slots: safeSlots,
  };

  return parseNotebookContentDocument(candidate) ?? candidate;
}

export function normalizeComputerScienceSceneOutline(outline: SceneOutline): SceneOutline {
  if (!isComputerScienceOutline(outline)) return outline;

  const isSummary = outline.archetype === 'summary';
  const isOpeningIntro =
    outline.archetype === 'intro' &&
    outline.order === 1 &&
    outline.teachingRole === 'concrete_hook';
  if (isOpeningIntro) {
    return {
      ...outline,
      title: normalizeStudentFacingText(outline.title),
      description: outline.description
        ? normalizeStudentFacingText(outline.description)
        : outline.description,
      teachingObjective: outline.teachingObjective
        ? normalizeStudentFacingText(outline.teachingObjective)
        : outline.teachingObjective,
      keyPoints: (outline.keyPoints ?? [])
        .map(normalizeStudentFacingText)
        .filter((item) => item && !isGenericTeachingPlaceholder(item)),
      contentProfile: 'general',
      suggestedImageIds: undefined,
      mediaGenerations: undefined,
      requiredComponentKinds: ['example'],
      layoutIntent: {
        ...outline.layoutIntent,
        layoutFamily: 'concept_cards',
        layoutTemplate: 'process_steps',
        disciplineStyle: 'code',
        teachingFlow: 'concept_explain',
        density: 'light',
        visualRole: 'none',
        overflowPolicy: 'compress_first',
        preserveFullProblemStatement: false,
      },
    };
  }

  if (shouldPreserveNonCodeComputerScienceLayout(outline)) {
    const preserveVisual = shouldPreserveOutlineVisual(outline);
    return {
      ...outline,
      title: normalizeStudentFacingText(outline.title),
      description: outline.description
        ? normalizeStudentFacingText(outline.description)
        : outline.description,
      teachingObjective: outline.teachingObjective
        ? normalizeStudentFacingText(outline.teachingObjective)
        : outline.teachingObjective,
      keyPoints: (outline.keyPoints ?? [])
        .map(normalizeStudentFacingText)
        .filter((item) => item && !isGenericTeachingPlaceholder(item)),
      contentProfile: outline.contentProfile || 'general',
      suggestedImageIds: preserveVisual ? outline.suggestedImageIds : undefined,
      mediaGenerations: preserveVisual ? outline.mediaGenerations : undefined,
      layoutIntent: {
        ...outline.layoutIntent,
        layoutFamily: outline.layoutIntent?.layoutFamily || 'concept_cards',
        disciplineStyle: outline.layoutIntent?.disciplineStyle || 'code',
        teachingFlow: outline.layoutIntent?.teachingFlow || 'concept_explain',
        visualRole: preserveVisual ? outline.layoutIntent?.visualRole || 'diagram' : 'none',
        overflowPolicy: outline.layoutIntent?.overflowPolicy || 'compress_first',
      },
    };
  }

  return {
    ...outline,
    title: normalizeStudentFacingText(outline.title),
    description: outline.description
      ? normalizeStudentFacingText(outline.description)
      : outline.description,
    teachingObjective: outline.teachingObjective
      ? normalizeStudentFacingText(outline.teachingObjective)
      : outline.teachingObjective,
    keyPoints: (outline.keyPoints ?? [])
      .map(normalizeStudentFacingText)
      .filter((item) => item && !isGenericTeachingPlaceholder(item)),
    contentProfile: 'code',
    suggestedImageIds: undefined,
    mediaGenerations: undefined,
    layoutIntent: {
      ...outline.layoutIntent,
      layoutFamily: isSummary ? 'summary' : 'code_walkthrough',
      layoutTemplate: isSummary ? 'two_by_one_summary' : 'code_split',
      disciplineStyle: 'code',
      teachingFlow: isSummary ? 'concept_explain' : 'code_walkthrough',
      visualRole: 'none',
      overflowPolicy: 'preserve_then_paginate',
    },
  };
}
