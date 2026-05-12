import type { NotebookContentBlock, NotebookContentDocument } from '@/lib/notebook-content';
import { isClassicLectureLayoutTemplate } from '@/lib/notebook-content';
import type {
  TeachingComponentKind,
  TeachingPagePlan,
  TeachingPlan,
  TeachingPlanValidationIssue,
} from './types';
import { getTeachingRoleSpec } from './role-specs';

const GENERIC_BAD_PATTERNS = [
  /\[Table\]|\[Chart\]|\[Formula\]/i,
  /\\texttt\{/,
  /本页用于|在学生已经|进一步指出|本页明确|学习者将|教学目标/,
  /this page is used to|learners will|learning objective/i,
];

const LEAKED_MARKUP_TEXT_PATTERNS = [
  /(^|[\s\n\r])(?:bullet|heading|callout|summary|warning|question|text|example|card|step|begin|end)\s+(?=[\u4e00-\u9fff`])/i,
  /\\(?:bullet|heading|callout|summary|warning|question|text|example|card|step|begin|end)\b/i,
];

const HARD_INVALID_PATTERNS = [
  /<\/?beginrow|\\endrows|\\endslide|\\beginrow|\\beginrows/i,
  /```/,
  /len\((?:self\.)?content\)\s*(?:=|==)\s*0`?/i,
  /\\len\s*\((?:self\.)?content\)\s*(?:=|==|\\leq|≤)\s*0/i,
];

const IMAGE_FIRST_COVER_PLACEHOLDER_PATTERNS = [
  /^main\s+cover\s+image$/i,
  /^cover\s+image$/i,
  /^main\s+image$/i,
  /\b(?:background|cover|main|hero|technology|tech|cinematic)\s+image\b/i,
  /\bimage\s+related\s+to\b/i,
  /\bvisual\s+(?:related|for)\b/i,
  /封面主视觉/,
  /封面图片/,
  /背景图/,
  /主视觉/,
  /qa\s+placeholder/i,
  /占位/,
  /learning\s+roadmap/i,
  /学习路线/,
  /路线图/,
  /^current\s+edition$/i,
  /^deep\s+dive$/i,
  /^tech\s*\/\s*saas$/i,
  /^dark\s+art$/i,
  /^opening$/i,
  /^当前版本$/,
  /^深度解析$/,
  /^stage\s*\d+/i,
  /^阶段\s*\d+/i,
];

const NON_STUDENT_FACING_STRING_KEYS = new Set([
  'id',
  'type',
  'language',
  'code',
  'source',
  'audioUrl',
  'ref',
  'from',
  'to',
  'x',
  'y',
  'tone',
  'status',
  'mode',
  'variant',
  'orientation',
]);

const TEXT_ONLY_BLOCK_TYPES = new Set<string>([
  'paragraph',
  'bullet_list',
  'callout',
  'note',
  'summary',
  'warning',
  'question',
  'definition',
  'theorem',
]);

const CS_MODEL_COMPONENTS = new Set([
  'trace',
  'statetable',
  'callstack',
  'memory',
  'linkedlist',
  'tree',
  'bst',
  'graph_trace',
  'stack',
  'queue',
  'dictionary',
  'invariant',
  'table',
]);

function collectBlockStrings(block: NotebookContentBlock): string[] {
  const values: string[] = [];
  const visit = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (NON_STUDENT_FACING_STRING_KEYS.has(key)) return;
      values.push(sanitizeString(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => visit(nestedValue, nestedKey));
    }
  };
  visit(block);
  return values;
}

function collectDocumentText(document: NotebookContentDocument): string {
  return document.blocks.flatMap(collectBlockStrings).join('\n');
}

function collectStudentFacingStrings(value: unknown, key = '', depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === 'string') {
    return NON_STUDENT_FACING_STRING_KEYS.has(key) ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStudentFacingStrings(item, key, depth + 1));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([entryKey, entry]) =>
    collectStudentFacingStrings(entry, entryKey, depth + 1),
  );
}

function stripCodeAndQuotedLiterals(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ');
}

function validateNoVisibleTruncationMarkers(document: NotebookContentDocument): string[] {
  const hasTruncatedText = collectStudentFacingStrings(document).some((text) =>
    /(?:\.{3,}|…|……)/.test(stripCodeAndQuotedLiterals(text)),
  );
  return hasTruncatedText
    ? [
        'student-facing text contains ellipsis/placeholder truncation; write a complete shorter sentence instead of using ... or …',
      ]
    : [];
}

function containsEnglishProseInChineseText(text: string): boolean {
  const prose = stripCodeAndQuotedLiterals(text);
  if (!/[\u4e00-\u9fff]/.test(prose)) return false;
  const englishWords = prose.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) || [];
  if (englishWords.length < 5) return false;
  return /\b(?:the|and|with|without|which|would|could|should|because|before|after|instance|calling|adding|remove|create|missing|well-formed|malformed)\b/i.test(
    prose,
  );
}

function hasDenseMultiActionStep(text: string): boolean {
  const normalized = stripCodeAndQuotedLiterals(text).replace(/\s+/g, ' ').trim();
  const explicitListMarkers = (normalized.match(/(?:^|\s)-\s+/g) || []).length;
  const sentenceLikeBreaks = (normalized.match(/[。.!?？；;]/g) || []).length;
  return explicitListMarkers >= 2 || normalized.length > 520 || sentenceLikeBreaks >= 5;
}

function collectInlineMathSegments(text: string): string[] {
  const segments: string[] = [];
  const regex = /\$([^$\n]{1,240})\$/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    segments.push(match[1] || '');
  }
  return segments;
}

function looksLikeCodeInsideInlineMath(segment: string): boolean {
  const trimmed = segment.trim();
  return (
    /\b[A-Za-z_][A-Za-z0-9_]*\s*:\s*(?:str|int|date|bool|float|list|dict|tuple|set|None|Tweet)\b/.test(
      trimmed,
    ) ||
    /\b(?:AttributeError|TypeError|NameError|ValueError|KeyError|IndexError)\b/.test(trimmed) ||
    /\bobject\s+has\s+no\s+attribute\b/i.test(trimmed) ||
    /\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b/.test(trimmed) ||
    /\b(?:created_at|userid|__init__|self|Tweet\(\)|tweet|dict|list)\b/.test(trimmed)
  );
}

function hasAnyTeachingModel(document: NotebookContentDocument): boolean {
  return [
    'code',
    'trace',
    'statetable',
    'callstack',
    'memory',
    'linkedlist',
    'tree',
    'bst',
    'graph_trace',
    'stack',
    'queue',
    'dictionary',
    'invariant',
    'table',
  ].some((kind) => componentPresent(document, kind));
}

function isComputerSciencePagePlan(pagePlan: TeachingPagePlan): boolean {
  return (
    pagePlan.contentProfile === 'code' ||
    pagePlan.disciplineStyle === 'code' ||
    pagePlan.requiredComponentKinds.some((kind) => CS_MODEL_COMPONENTS.has(kind)) ||
    /代码|程序|Python|self|__init__|class|OOP|面向对象|类|对象|属性|方法|list|dict|invariant|不变式/i.test(
      [pagePlan.title, pagePlan.concreteAnchor, pagePlan.openingMove].join('\n'),
    )
  );
}

function isComputerScienceDocument(document: NotebookContentDocument): boolean {
  if (document.profile === 'code' || document.disciplineStyle === 'code') return true;
  return /代码|程序|Python|self|__init__|class|OOP|面向对象|类|对象|实例|属性|方法|list|dict|Tweet|invariant|不变式/i.test(
    [document.title, collectDocumentText(document)].join('\n'),
  );
}

function isTextHeavyComputerSciencePage(document: NotebookContentDocument): boolean {
  const nonTextBlocks = document.blocks.filter((block) => !TEXT_ONLY_BLOCK_TYPES.has(block.type));
  const text = sanitizeString(collectDocumentText(document));
  const bulletItems = document.blocks.reduce((sum, block) => {
    if (block.type !== 'bullet_list') return sum;
    return sum + block.items.length;
  }, 0);
  return nonTextBlocks.length === 0 && (text.length > 520 || bulletItems >= 5);
}

function validateStudentFacingLanguage(document: NotebookContentDocument): string[] {
  if (document.language !== 'zh-CN') return [];
  const hits = document.blocks
    .flatMap((block) => collectStudentFacingStrings(block))
    .filter(containsEnglishProseInChineseText);
  if (hits.length === 0) return [];
  return [
    'Chinese page contains untranslated English explanatory prose; translate source-fact descriptions while keeping code/data literals intact',
  ];
}

function validateCodeNotWrappedAsMath(document: NotebookContentDocument): string[] {
  const badSegments = document.blocks
    .flatMap((block) => collectStudentFacingStrings(block))
    .flatMap(collectInlineMathSegments)
    .filter(looksLikeCodeInsideInlineMath);
  if (badSegments.length === 0) return [];
  return [
    'code identifiers, type annotations, or exception messages are wrapped as inline math; use backticks for code and reserve $...$ for mathematical notation',
  ];
}

function validateStepGranularity(
  document: NotebookContentDocument,
  pagePlan?: TeachingPagePlan,
): string[] {
  const reasons: string[] = [];
  for (const block of document.blocks) {
    if (block.type === 'process_flow') {
      for (const step of block.steps) {
        if (
          hasDenseMultiActionStep([step.title, step.detail, step.note].filter(Boolean).join(' '))
        ) {
          reasons.push(
            'process_flow step is carrying multiple examples/actions; split into separate steps, rows, or blocks',
          );
          break;
        }
      }
    }
    if (block.type === 'code_walkthrough') {
      for (const step of block.steps) {
        if (
          hasDenseMultiActionStep(
            [step.title, step.focus, step.explanation].filter(Boolean).join(' '),
          )
        ) {
          reasons.push(
            'code_walkthrough step is too dense; each step should explain one code/state move',
          );
          break;
        }
      }
      if (pagePlan?.role === 'concept_model' && block.steps.length > 4) {
        reasons.push(
          'concept_model page has an overlong code_walkthrough; use a compact concept boundary table or 2-4 focused steps',
        );
      }
    }
  }
  return [...new Set(reasons)];
}

function validateProgrammingStateModel(
  document: NotebookContentDocument,
  pagePlan?: TeachingPagePlan,
): string[] {
  const reasons: string[] = [];
  const blocks = document.blocks || [];
  const blockTypes = new Set(blocks.map((block) => block.type));
  const role = pagePlan?.role;
  const asksForTrace =
    role === 'state_trace' ||
    role === 'strategy_trace' ||
    pagePlan?.requiredComponentKinds?.some((kind) =>
      ['trace', 'statetable', 'callstack', 'memory', 'graph_trace'].includes(kind),
    );

  if (asksForTrace) {
    const hasStateComponent =
      blockTypes.has('code_trace') ||
      blockTypes.has('state_table') ||
      blockTypes.has('call_stack') ||
      blockTypes.has('memory_diagram') ||
      blockTypes.has('graph_trace');
    if (!hasStateComponent) {
      reasons.push(
        'state trace page requires a state component; a standalone code block is not enough',
      );
    }
  }

  for (const block of blocks) {
    if (block.type === 'code_trace' && block.steps.length < 2) {
      reasons.push('code_trace should show at least two observable execution steps');
    }
    if (block.type === 'memory_diagram') {
      const stepHeapCount = block.steps.reduce((sum, step) => sum + step.heap.length, 0);
      const stepFrameCount = block.steps.reduce(
        (sum, step) => sum + step.frames.length + step.stack.length,
        0,
      );
      const hasNames = block.frames.length + block.stack.length + stepFrameCount > 0;
      const hasHeap = block.heap.length + stepHeapCount > 0;
      const hasHeapFields =
        block.heap.some((item) => item.fields.length > 0) ||
        block.steps.some((step) => step.heap.some((item) => item.fields.length > 0));

      if (hasNames && !hasHeap) {
        reasons.push('memory_diagram with stack/name references must include heap objects');
      }
      if (
        hasHeap &&
        !hasHeapFields &&
        /object|对象|实例|attribute|属性|self|__init__/i.test(collectDocumentText(document))
      ) {
        reasons.push('OOP memory_diagram heap objects should show relevant fields/attributes');
      }
    }
  }

  return reasons;
}

function validateClassicLectureTemplate(document: NotebookContentDocument): string[] {
  const template = document.layoutTemplate;
  if (!isClassicLectureLayoutTemplate(template) && template !== 'code_split') {
    return [];
  }

  const reasons: string[] = [];
  const processFlow = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'process_flow' }> =>
      block.type === 'process_flow',
  );
  const table = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'table' }> => block.type === 'table',
  );
  const cards = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'layout_cards' }> =>
      block.type === 'layout_cards',
  );
  const derivation = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'derivation_steps' }> =>
      block.type === 'derivation_steps',
  );
  const hasVisual = Boolean(
    document.visualSlot || document.blocks.some((block) => block.type === 'visual'),
  );
  const textishBlocks = document.blocks.filter((block) =>
    ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
  );

  if (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  ) {
    if (!hasVisual) reasons.push(`template ${template} requires one visual block`);
    const nonVisualBlocks = document.blocks.filter((block) => block.type !== 'visual');
    if (nonVisualBlocks.length > 3) {
      reasons.push(
        `template ${template} should only contain short subtitle/label/meta text beside the title`,
      );
    }
    const hasHeavyStructure = document.blocks.some((block) =>
      ['table', 'process_flow', 'layout_cards', 'code_block', 'code_trace'].includes(block.type),
    );
    if (hasHeavyStructure) {
      reasons.push(
        `template ${template} is an image-first cover/section page, not a content layout`,
      );
    }
    const longText = textishBlocks.some(
      (block) => collectStudentFacingStrings(block).join('').length > 180,
    );
    if (longText) {
      reasons.push(
        `template ${template} subtitle/meta text should stay short enough for an overlay`,
      );
    }
    const leakedPlaceholderText = textishBlocks
      .flatMap((block) => collectStudentFacingStrings(block))
      .some((text) =>
        IMAGE_FIRST_COVER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text.trim())),
      );
    if (leakedPlaceholderText) {
      reasons.push(
        `template ${template} should not expose placeholder labels like cover image, roadmap, stage, or QA placeholder`,
      );
    }
  }

  if (template === 'pipeline_table') {
    if (!processFlow) reasons.push('template pipeline_table requires a process block');
    if (!table) reasons.push('template pipeline_table requires a table block');
    if (processFlow && (processFlow.steps.length < 2 || processFlow.steps.length > 4)) {
      reasons.push('template pipeline_table process should have 2-4 steps');
    }
    if (table && (table.rows.length < 3 || table.rows.length > 6)) {
      reasons.push('template pipeline_table table should have 3-6 data rows');
    }
    if (processFlow && processFlow.steps.some((step) => step.detail.length > 120)) {
      reasons.push('template pipeline_table process steps should be compact, not paragraph-sized');
    }
  }

  if (template === 'visual_three_steps') {
    if (!hasVisual)
      reasons.push('template visual_three_steps requires a visual from available media');
    const cardCount = cards?.items.length;
    const processCount = processFlow?.steps.length;
    if (cardCount !== 3 && processCount !== 3) {
      reasons.push(
        'template visual_three_steps requires exactly 3 cards or exactly 3 process steps',
      );
    }
  }

  if (template === 'two_by_one_summary') {
    const hasBottomSummary = document.blocks.some((block) =>
      ['summary', 'callout'].includes(block.type),
    );
    const panelGroupCount = textishBlocks.length + (cards && cards.items.length >= 2 ? 2 : 0);
    if (panelGroupCount < 3 || !hasBottomSummary) {
      reasons.push(
        'template two_by_one_summary requires two point groups plus one bottom summary/callout',
      );
    }
    const longBlock = textishBlocks.some(
      (block) => collectStudentFacingStrings(block).join('').length > 520,
    );
    if (longBlock) {
      reasons.push(
        'template two_by_one_summary point groups should be concise, not long paragraphs',
      );
    }
  }

  if (template === 'definition_board') {
    const hasDefinitionLike = textishBlocks.some((block) =>
      ['callout', 'definition'].includes(block.type),
    );
    if (!hasDefinitionLike) {
      reasons.push('template definition_board requires one compact definition or callout block');
    }
    if (!cards || cards.columns !== 2 || cards.items.length !== 2) {
      reasons.push('template definition_board requires exactly 2 compact cards with columns=2');
    }
    const hasWrongStructure = document.blocks.some((block) =>
      ['bullet_list', 'process_flow', 'derivation_steps', 'table'].includes(block.type),
    );
    if (hasWrongStructure) {
      reasons.push(
        'template definition_board should not use bullets, tables, process blocks, or derivation blocks',
      );
    }
    const visibleTexts = document.blocks.flatMap((block) => collectStudentFacingStrings(block));
    if (visibleTexts.some((text) => /(^|[\n\r])\s*(?:[•*-]\s+|[0-9]+[.)]\s+)/.test(text))) {
      reasons.push(
        'template definition_board should use short sentences, not visible bullet lists',
      );
    }
    const hasLongDefinition = textishBlocks.some(
      (block) => collectStudentFacingStrings(block).join('').length > 160,
    );
    if (hasLongDefinition) {
      reasons.push('template definition_board definition/callout text should stay under 160 chars');
    }
    const hasLongCard = cards?.items.some(
      (item) => collectStudentFacingStrings(item).join('').length > 100,
    );
    if (hasLongCard) {
      reasons.push('template definition_board card bodies should stay under 100 chars');
    }
  }

  if (template === 'three_cards') {
    if (!cards || cards.items.length !== 3) {
      reasons.push('template three_cards requires exactly 3 cards from a cards block');
    }
    const hasLongCard = cards?.items.some(
      (item) => collectStudentFacingStrings(item).join('').length > 220,
    );
    if (hasLongCard) {
      reasons.push('template three_cards card bodies should be compact, not paragraph-sized');
    }
  }

  if (template === 'derivation_ladder') {
    const fullText = sanitizeString(collectDocumentText(document));
    const isMathPage = document.profile === 'math' || document.disciplineStyle === 'math';
    if (!derivation) {
      reasons.push('template derivation_ladder requires a derivation_steps block');
    }
    if (derivation && (derivation.steps.length < 3 || derivation.steps.length > 5)) {
      reasons.push('template derivation_ladder requires 3-5 focused proof steps');
    }
    if (
      derivation &&
      derivation.steps.filter((step) => step.explanation?.trim()).length <
        Math.min(3, derivation.steps.length)
    ) {
      reasons.push('template derivation_ladder requires a reason/explanation on each proof step');
    }
    if (isMathPage && !/(已知|目标|要证|证明目标|Given|Goal|Prove|Show)/i.test(fullText)) {
      reasons.push('template derivation_ladder math proof page must state givens and goal');
    }
    if (
      isMathPage &&
      !/(定义|展开|改写|等价|推出|definition|expand|rewrite|equivalent|derive|∃|∀|\\exists|\\forall)/i.test(
        fullText,
      )
    ) {
      reasons.push(
        'template derivation_ladder math proof page must expand a definition and name the proof action',
      );
    }
  }

  if (template === 'text_image_split') {
    if (!hasVisual) reasons.push('template text_image_split requires a visual block');
    if (textishBlocks.length < 1 && !cards) {
      reasons.push('template text_image_split requires one compact text block beside the visual');
    }
    const longText = textishBlocks.some(
      (block) => collectStudentFacingStrings(block).join('').length > 360,
    );
    if (longText) {
      reasons.push('template text_image_split left text should be compact, not paragraph-sized');
    }
  }

  if (template === 'four_columns') {
    if (!cards || cards.columns !== 4 || cards.items.length !== 4) {
      reasons.push(
        'template four_columns requires a cards block with columns=4 and exactly 4 cards',
      );
    }
    const hasLongCard = cards?.items.some(
      (item) => collectStudentFacingStrings(item).join('').length > 160,
    );
    if (hasLongCard) {
      reasons.push('template four_columns card bodies should be very compact');
    }
  }

  if (template === 'grid_2x2') {
    if (!cards || cards.columns !== 2 || cards.items.length !== 4) {
      reasons.push('template grid_2x2 requires a cards block with columns=2 and exactly 4 cards');
    }
    const hasLongCard = cards?.items.some(
      (item) => collectStudentFacingStrings(item).join('').length > 220,
    );
    if (hasLongCard) {
      reasons.push('template grid_2x2 card bodies should stay concise');
    }
  }

  if (template === 'two_text_image') {
    if (!hasVisual) reasons.push('template two_text_image requires a visual block');
    const textGroupCount = textishBlocks.length + (cards?.items.length === 2 ? 2 : 0);
    if (textGroupCount < 2) {
      reasons.push('template two_text_image requires two compact text groups beside the visual');
    }
    const longText = textishBlocks.some(
      (block) => collectStudentFacingStrings(block).join('').length > 280,
    );
    if (longText) {
      reasons.push('template two_text_image text groups should be compact');
    }
  }

  if (template === 'code_split') {
    const hasCode =
      componentPresent(document, 'code') ||
      document.blocks.some((block) => block.type === 'code_trace');
    const hasTrace = componentPresent(document, 'trace');
    if (!hasCode || !hasTrace) {
      reasons.push('template code_split requires code plus trace/code_walkthrough state steps');
    }
  }

  return reasons;
}

function componentPresent(document: NotebookContentDocument, kind: string): boolean {
  const blockTypes = new Set(document.blocks.map((block) => block.type));
  if (kind === 'code') return blockTypes.has('code_block') || blockTypes.has('code_walkthrough');
  if (kind === 'trace') return blockTypes.has('code_trace') || blockTypes.has('code_walkthrough');
  if (kind === 'statetable') return blockTypes.has('state_table');
  if (kind === 'callstack') return blockTypes.has('call_stack');
  if (kind === 'memory') return blockTypes.has('memory_diagram');
  if (kind === 'linkedlist') return blockTypes.has('pointer_diagram');
  if (kind === 'tree' || kind === 'bst') return blockTypes.has('tree_diagram');
  if (kind === 'graph_trace') return blockTypes.has('graph_trace');
  if (kind === 'stack' || kind === 'queue') return blockTypes.has('linear_structure');
  if (kind === 'dictionary') return blockTypes.has('dictionary_diagram');
  if (kind === 'invariant') return blockTypes.has('invariant_panel');
  if (kind === 'table') return blockTypes.has('table');
  if (kind === 'derivation' || kind === 'proof') {
    return (
      blockTypes.has('derivation_steps') || blockTypes.has('theorem') || blockTypes.has('equation')
    );
  }
  if (kind === 'example' || kind === 'case' || kind === 'quote') {
    return blockTypes.has('example') || blockTypes.has('callout') || blockTypes.has('layout_cards');
  }
  if (kind === 'chart') {
    return blockTypes.has('table') || blockTypes.has('visual') || blockTypes.has('process_flow');
  }
  return true;
}

function collectPrimaryFormulaFocusText(document: NotebookContentDocument): string {
  const equation = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'equation' }> =>
      block.type === 'equation',
  );
  if (equation?.latex) return equation.latex;
  const derivation = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'derivation_steps' }> =>
      block.type === 'derivation_steps',
  );
  if (derivation) {
    return derivation.steps.map((step) => step.expression).join('\n');
  }
  const matrix = document.blocks.find(
    (block): block is Extract<NotebookContentBlock, { type: 'matrix' }> => block.type === 'matrix',
  );
  if (matrix) return matrix.rows.flat().join(' ');
  return '';
}

function formulaTextContainsStudentProse(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function validateMathFormulaFocus(
  document: NotebookContentDocument,
  pagePlan: TeachingPagePlan,
): string[] {
  const isFormulaFocus =
    document.layoutTemplate === 'formula_focus' ||
    pagePlan.layoutTemplate === 'formula_focus' ||
    document.layoutFamily === 'formula_focus' ||
    pagePlan.layoutFamily === 'formula_focus';
  const isMath =
    document.profile === 'math' ||
    document.disciplineStyle === 'math' ||
    pagePlan.contentProfile === 'math' ||
    pagePlan.disciplineStyle === 'math';
  if (!isFormulaFocus || !isMath) return [];

  const reasons: string[] = [];
  if (document.blocks.some((block) => block.type === 'bullet_list')) {
    reasons.push(
      'template formula_focus should use compact callouts or summaries, not bullet_list',
    );
  }

  const primaryFormula = collectPrimaryFormulaFocusText(document);
  if (!primaryFormula.trim()) {
    reasons.push('template formula_focus requires one equation, matrix, or derivation block');
    return reasons;
  }
  if (formulaTextContainsStudentProse(primaryFormula)) {
    reasons.push(
      'template formula_focus primary formula must be pure LaTeX; move prose such as givens, goals, or explanations into callout/summary blocks',
    );
  }

  const anchorTokens = extractMathAnchorTokens(pagePlan.concreteAnchor);
  if (anchorTokens.length === 0) return reasons;

  const normalizedPrimaryFormula = normalizeMathAnchorText(primaryFormula);
  const hits = anchorTokens.filter((token) => normalizedPrimaryFormula.includes(token));
  if (hits.length === 0) {
    reasons.push('template formula_focus main formula must include the PagePlan concrete formula');
  }
  return reasons;
}

function normalizeAnchorText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeMathAnchorText(value: string): string {
  return normalizeAnchorText(value)
    .replace(/\\left|\\right/g, '')
    .replace(/\\in\b/g, '∈')
    .replace(/\\exists\b/g, '∃')
    .replace(/\\forall\b/g, '∀')
    .replace(/\\subseteq\b/g, '⊆')
    .replace(/\\supseteq\b/g, '⊇')
    .replace(/\s+/g, '');
}

function splitConcreteAnchorCandidates(anchor: string): string[] {
  return anchor
    .split(/[\n\r；;。.!?？、]/)
    .map((part) => part.replace(/^[-*•]\s*/, '').trim())
    .filter((part) => part.length >= 4)
    .slice(0, 6);
}

function extractMathAnchorTokens(anchor: string): string[] {
  if (!/[=∈∃∀⊆⊇×→←↔{}()\\]/.test(anchor)) return [];
  const compact = normalizeMathAnchorText(anchor);
  const tokens = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = normalizeMathAnchorText(value || '');
    if (normalized.length >= 2) tokens.add(normalized);
  };

  for (const match of compact.matchAll(/[a-z]\([^)]{1,24}\)/g)) add(match[0]);
  for (const match of compact.matchAll(/[a-z]\([^)]{1,24}\)=[a-z]/g)) add(match[0]);
  for (const match of compact.matchAll(/[a-z]∈[a-z]/g)) add(match[0]);
  for (const match of compact.matchAll(/[∃∀][a-z]/g)) add(match[0]);
  for (const match of compact.matchAll(/[a-z]⊆[a-z]|[a-z]⊇[a-z]/g)) add(match[0]);

  return Array.from(tokens).slice(0, 12);
}

function extractConcreteAnchorTokens(anchor: string): string[] {
  const tokens = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = normalizeAnchorText(value || '').replace(/^['"`]+|['"`]+$/g, '');
    if (normalized.length >= 3) tokens.add(normalized);
  };

  for (const match of anchor.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    add(match[0]);
  }
  for (const match of anchor.matchAll(/`([^`]{2,120})`|'([^']{2,120})'|"([^"]{2,120})"/g)) {
    add(match[1] || match[2] || match[3]);
  }
  for (const match of anchor.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
    const value = match[0];
    if (/^(?:list|dict|str|int|date|bool|none|true|false|合法|错误)$/i.test(value)) continue;
    add(value);
  }

  return Array.from(tokens).slice(0, 16);
}

function extractNumericAnchorTokens(anchor: string): string[] {
  const tokens = new Set<string>();
  for (const match of anchor.matchAll(/(?<![A-Za-z_])\d+(?:\.\d+)?(?![A-Za-z_])/g)) {
    tokens.add(match[0]);
  }
  return Array.from(tokens).slice(0, 12);
}

function extractSymbolAnchorTokens(anchor: string): string[] {
  const tokens = new Set<string>();
  for (const match of anchor.matchAll(/[♡♢♥♦♣♠★☆✓✗]/g)) {
    tokens.add(match[0]);
  }
  return Array.from(tokens).slice(0, 8);
}

function documentMentionsConcreteAnchor(documentText: string, concreteAnchor: string): boolean {
  if (!concreteAnchor || concreteAnchor.length < 6) return true;
  const normalizedText = normalizeAnchorText(documentText);
  const normalizedAnchor = normalizeAnchorText(concreteAnchor);
  if (normalizedText.includes(normalizedAnchor.slice(0, Math.min(24, normalizedAnchor.length)))) {
    return true;
  }
  const mathAnchorTokens = extractMathAnchorTokens(concreteAnchor);
  if (mathAnchorTokens.length > 0) {
    const normalizedMathText = normalizeMathAnchorText(documentText);
    const hitCount = mathAnchorTokens.filter((token) => normalizedMathText.includes(token)).length;
    if (hitCount >= Math.min(2, mathAnchorTokens.length)) return true;
  }

  const candidates = splitConcreteAnchorCandidates(concreteAnchor);
  if (
    candidates.some((candidate) => {
      const normalized = normalizeAnchorText(candidate);
      const probe = normalized.slice(0, Math.min(24, normalized.length));
      return probe.length >= 4 && normalizedText.includes(probe);
    })
  ) {
    return true;
  }

  const anchorTokens = extractConcreteAnchorTokens(concreteAnchor);
  if (
    anchorTokens.some((token) => {
      const normalized = normalizeAnchorText(token);
      return normalized.length >= 3 && normalizedText.includes(normalized);
    })
  ) {
    return true;
  }

  const numericTokens = extractNumericAnchorTokens(concreteAnchor);
  let numericHitCount = 0;
  if (numericTokens.length >= 2) {
    const numericHits = numericTokens.filter((token) =>
      new RegExp(`(?<![0-9.])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9.])`).test(
        documentText,
      ),
    );
    numericHitCount = numericHits.length;
    if (numericHitCount >= Math.min(2, numericTokens.length)) return true;
  }

  const symbolTokens = extractSymbolAnchorTokens(concreteAnchor);
  const symbolHitCount = symbolTokens.filter((token) => documentText.includes(token)).length;
  if (
    symbolHitCount > 0 &&
    (numericTokens.length === 0 || numericHitCount > 0 || symbolHitCount >= 2)
  ) {
    return true;
  }

  if (anchorTokens.length === 0 && numericTokens.length === 0 && symbolTokens.length === 0) {
    return false;
  }
  return false;
}

export function validateTeachingPlan(teachingPlan: TeachingPlan): {
  isValid: boolean;
  issues: TeachingPlanValidationIssue[];
} {
  const issues: TeachingPlanValidationIssue[] = [];
  if (!teachingPlan.blueprint.coreQuestion.trim()) {
    issues.push({
      path: 'blueprint.coreQuestion',
      message: 'Teaching plan needs a core question.',
      severity: 'error',
    });
  }
  teachingPlan.pages.forEach((page, index) => {
    if (!page.concreteAnchor.trim()) {
      issues.push({
        path: `pages.${index}.concreteAnchor`,
        message: 'Every page needs a concrete object, example, problem, source, or data point.',
        severity: 'error',
      });
    }
    if (!page.studentThinkingMove.trim()) {
      issues.push({
        path: `pages.${index}.studentThinkingMove`,
        message: 'Every page needs a transferable student thinking move.',
        severity: 'error',
      });
    }
    if (GENERIC_BAD_PATTERNS.some((pattern) => pattern.test(page.openingMove))) {
      issues.push({
        path: `pages.${index}.openingMove`,
        message: 'Page opening still sounds like a lesson plan or contains placeholder markup.',
        severity: 'warning',
      });
    }
  });
  return { isValid: issues.every((issue) => issue.severity !== 'error'), issues };
}

export function validateSemanticAgainstPagePlan(
  document: NotebookContentDocument,
  pagePlan?: TeachingPagePlan,
): { isValid: boolean; reasons: string[] } {
  const text = sanitizeString(collectDocumentText(document));
  const reasons: string[] = [];
  for (const pattern of LEAKED_MARKUP_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(`markup command leaked into visible text: ${pattern.source}`);
    }
  }
  for (const pattern of GENERIC_BAD_PATTERNS) {
    if (pattern.test(text)) reasons.push(`generic invalid pattern leaked: ${pattern.source}`);
  }
  for (const pattern of HARD_INVALID_PATTERNS) {
    if (pattern.test(text))
      reasons.push(`hard invalid CS/markup pattern leaked: ${pattern.source}`);
  }
  reasons.push(...validateStudentFacingLanguage(document));
  reasons.push(...validateNoVisibleTruncationMarkers(document));
  reasons.push(...validateCodeNotWrappedAsMath(document));
  reasons.push(...validateStepGranularity(document, pagePlan));
  reasons.push(...validateProgrammingStateModel(document, pagePlan));
  reasons.push(...validateClassicLectureTemplate(document));

  const archetype = document.archetype || 'concept';
  const conceptLike =
    archetype === 'concept' || archetype === 'definition' || archetype === 'bridge';
  if (
    conceptLike &&
    isComputerScienceDocument(document) &&
    isTextHeavyComputerSciencePage(document)
  ) {
    reasons.push(
      'CS concept/definition page is prose-heavy; generate a table, code/state model, or compact structured component instead of paragraph + long bullets',
    );
  }

  if (!pagePlan) return { isValid: reasons.length === 0, reasons };

  for (const patternText of pagePlan.forbiddenPatterns) {
    if (!patternText) continue;
    if (text.includes(patternText)) {
      reasons.push(`forbidden pattern leaked: ${patternText}`);
    }
  }

  const isImageFirstHero =
    document.layoutTemplate === 'image_title_overlay' ||
    document.layoutTemplate === 'cinematic_title_frame' ||
    document.layoutTemplate === 'tech_hero_title';
  const hasAnchor = documentMentionsConcreteAnchor(text, pagePlan.concreteAnchor);
  if (!hasAnchor && pagePlan.role !== 'synthesis' && !isImageFirstHero) {
    reasons.push('missing concrete anchor from TeachingPagePlan');
  }

  const required = isImageFirstHero
    ? []
    : pagePlan.requiredComponentKinds.filter((kind) => kind !== 'example');
  const missingRequired = required.filter((kind) => !componentPresent(document, kind));
  if (missingRequired.length > 0) {
    reasons.push(`missing required teaching component(s): ${missingRequired.join(', ')}`);
  }
  reasons.push(...validateMathFormulaFocus(document, pagePlan));

  if (isComputerSciencePagePlan(pagePlan)) {
    const roleSpec = getTeachingRoleSpec(pagePlan.role);
    const isLightweightRole = ['concrete_hook', 'synthesis', 'practice_check'].includes(
      pagePlan.role,
    );
    if (roleSpec.componentPolicy === 'required' && !hasAnyTeachingModel(document)) {
      reasons.push(
        `${pagePlan.role} page requires a role-appropriate teaching model, not prose-only content`,
      );
    } else if (
      !isLightweightRole &&
      roleSpec.componentPolicy !== 'avoid' &&
      isTextHeavyComputerSciencePage(document)
    ) {
      reasons.push(
        `${pagePlan.role} page is too prose-heavy; use a role-appropriate compact model, table, code, or structure component`,
      );
    }
  }

  return { isValid: reasons.length === 0, reasons };
}

function sanitizeString(value: string): string {
  return value
    .replace(/\\(?:text|textbf|textit|emph|alert)\{([^{}]*)\}/g, '$1')
    .replace(/\\texttt\{([^{}]+)\}/g, '`$1`')
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
    .replace(/\[Table\]\s*/gi, '')
    .replace(/\[Chart\]\s*/gi, '')
    .replace(/\[Formula\]\s*/gi, '')
    .replace(/<\/?beginrow|\\endrows|\\endslide|\\beginrow|\\beginrows/gi, '')
    .replace(/\\len\(([^)]+)\)\\leq?\s*([0-9]+)/g, 'len($1) <= $2')
    .replace(/\blen\((self\.)?content\)\s*(?:=|==)\s*0`?/g, '0 <= len($1content) <= 280');
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
  );
}

export function normalizeSemanticDocumentForTeachingPlan(
  document: NotebookContentDocument,
): NotebookContentDocument {
  return sanitizeValue(document) as NotebookContentDocument;
}

function formatComponentKindForRepairPrompt(
  kind: TeachingComponentKind,
  language: 'zh-CN' | 'en-US',
): string {
  const zhLabels: Record<TeachingComponentKind, string> = {
    trace: '执行追踪组件',
    statetable: '状态表',
    callstack: '调用栈图',
    memory: '内存/对象图',
    linkedlist: '链表结构图',
    tree: '树结构图',
    bst: '二叉搜索树图',
    graph_trace: '图搜索追踪',
    stack: '栈结构图',
    queue: '队列结构图',
    dictionary: '字典/映射图',
    invariant: '不变式检查面板',
    table: '对照表',
    derivation: '推导步骤',
    proof: '证明结构',
    example: '具体案例或样本',
    case: '案例材料',
    quote: '引用材料',
    chart: '图表或数据视觉',
  };
  const enLabels: Record<TeachingComponentKind, string> = {
    trace: 'execution trace component',
    statetable: 'state table',
    callstack: 'call-stack diagram',
    memory: 'memory/object diagram',
    linkedlist: 'linked-list diagram',
    tree: 'tree diagram',
    bst: 'binary-search-tree diagram',
    graph_trace: 'graph traversal trace',
    stack: 'stack diagram',
    queue: 'queue diagram',
    dictionary: 'dictionary/map diagram',
    invariant: 'invariant check panel',
    table: 'comparison table',
    derivation: 'derivation steps',
    proof: 'proof structure',
    example: 'concrete case or sample',
    case: 'case material',
    quote: 'source quote',
    chart: 'chart or data visual',
  };
  return language === 'zh-CN' ? zhLabels[kind] : enLabels[kind];
}

function formatComponentKindsForRepairPrompt(
  kinds: TeachingComponentKind[],
  language: 'zh-CN' | 'en-US',
): string {
  if (kinds.length === 0) return language === 'zh-CN' ? '无特殊组件' : 'none';
  return kinds.map((kind) => formatComponentKindForRepairPrompt(kind, language)).join('；');
}

function formatValidationReasonsForRepairPrompt(
  reasons: string[],
  language: 'zh-CN' | 'en-US',
): string[] {
  return reasons.map((reason) => {
    if (/markup command leaked/i.test(reason)) {
      return language === 'zh-CN'
        ? '上版把结构命令或结构词写进了学生可见正文；卡片、步骤、表格单元格和 callout 正文只能放自然语言和反引号代码 literal。'
        : 'The previous version put structural commands or structural words inside student-visible text; card bodies, step bodies, table cells, and callout bodies may contain only natural prose and backtick code literals.';
    }
    if (/missing concrete anchor/i.test(reason)) {
      return language === 'zh-CN'
        ? '上版没有把 PagePlan 的具体入口放进学生可见内容；开头、核心卡片、表格行或图片说明里必须出现具体入口中的样本、代码、对象名或数据。'
        : 'The previous version did not use the PagePlan concrete anchor in student-visible content; the opening, core card, table row, or visual caption must include the sample, code, object name, or data from the concrete anchor.';
    }
    if (/student-facing text contains ellipsis/i.test(reason)) {
      return language === 'zh-CN'
        ? '学生可见文字出现了省略号或未写完的句子；请改成更短但完整的句子。'
        : 'Student-visible text contains ellipses or unfinished sentences; rewrite as shorter complete sentences.';
    }
    if (/code identifiers.*inline math/i.test(reason)) {
      return language === 'zh-CN'
        ? '代码标识符、类型注解或异常消息被写成数学；请用反引号代码 literal。'
        : 'Code identifiers, type annotations, or exception messages were written as math; use backtick code literals.';
    }
    return reason;
  });
}

function formatExactAnchorCopyInstruction(
  pagePlan: TeachingPagePlan,
  language: 'zh-CN' | 'en-US',
): string | null {
  const anchor = pagePlan.concreteAnchor.trim();
  if (!anchor) return null;
  const looksLikeSymbolicAnchor =
    /[{}()[\]=∈∃∀⊆⊇×→←↔♡♢♥♦♣♠★☆✓✗]|\\[A-Za-z]+/.test(anchor) ||
    extractNumericAnchorTokens(anchor).length >= 2;
  if (!looksLikeSymbolicAnchor) return null;
  return language === 'zh-CN'
    ? `- 如果具体入口是符号样本、公式或关系样本，必须把它原样放入一个学生可见的 callout、card、table cell 或 formula：${anchor}。不要改写成“某个关系/一个样本”。`
    : `- If the concrete anchor is a symbolic sample, formula, or relation sample, copy it exactly into one student-visible callout, card, table cell, or formula: ${anchor}. Do not paraphrase it as "a relation" or "an example".`;
}

export function formatSemanticValidationRepairReason(
  pagePlan: TeachingPagePlan | undefined,
  reasons: string[],
  language: 'zh-CN' | 'en-US',
): string {
  if (reasons.length === 0) return '';
  if (!pagePlan) {
    if (language === 'zh-CN') {
      const repairReasons = formatValidationReasonsForRepairPrompt(reasons, language);
      return [
        'Semantic content contract 校验失败，请重写这一页：',
        ...repairReasons.map((reason) => `- 修复原因：${reason}`),
        '- 页面内容必须直接面向学生，使用输入事实，且每个步骤只承担一个清晰教学动作。',
      ].join('\n');
    }
    const repairReasons = formatValidationReasonsForRepairPrompt(reasons, language);
    return [
      'Semantic content contract validation failed. Rewrite this page:',
      ...repairReasons.map((reason) => `- Repair reason: ${reason}`),
      '- Content must face students directly, use input facts, and give each step one clear teaching move.',
    ].join('\n');
  }
  if (language === 'zh-CN') {
    const repairReasons = formatValidationReasonsForRepairPrompt(reasons, language);
    const exactAnchorInstruction = formatExactAnchorCopyInstruction(pagePlan, language);
    return [
      'Teaching Plan 校验失败，请重写这一页：',
      `- 页面角色：${pagePlan.role}`,
      `- 具体入口必须出现：${pagePlan.concreteAnchor}`,
      ...(exactAnchorInstruction ? [exactAnchorInstruction] : []),
      `- 学生思考动作必须出现：${pagePlan.studentThinkingMove}`,
      `- 必须使用组件：${formatComponentKindsForRepairPrompt(pagePlan.requiredComponentKinds, language)}`,
      ...repairReasons.map((reason) => `- 修复原因：${reason}`),
      '- 重写时按 PagePlan 的角色组织内容：先用具体入口进入，再用学生思考动作推进；一个步骤只讲一个对象、状态或判断。',
      '- 结构命令只能作为顶层 block 或对应环境使用；卡片正文、step 正文、表格单元格或 callout 正文不要再嵌入任何结构命令。',
      '- 如果卡片里有多个点，把它们压缩成 1-2 个短句；需要列表时在卡片外使用顶层 bullet 或改用 table/process。',
    ].join('\n');
  }
  const repairReasons = formatValidationReasonsForRepairPrompt(reasons, language);
  const exactAnchorInstruction = formatExactAnchorCopyInstruction(pagePlan, language);
  return [
    'Teaching Plan validation failed. Rewrite this page:',
    `- Page role: ${pagePlan.role}`,
    `- Concrete anchor must appear: ${pagePlan.concreteAnchor}`,
    ...(exactAnchorInstruction ? [exactAnchorInstruction] : []),
    `- Student thinking move must appear: ${pagePlan.studentThinkingMove}`,
    `- Required components: ${formatComponentKindsForRepairPrompt(pagePlan.requiredComponentKinds, language)}`,
    ...repairReasons.map((reason) => `- Repair reason: ${reason}`),
    '- Rewrite around the PagePlan role: open from the concrete anchor, organize by the student thinking move, and give each step one object, state, or judgment.',
    '- Structural commands are allowed only as top-level blocks or inside their matching environments; do not nest any structural command inside card bodies, step bodies, table cells, or callout bodies.',
    '- If a card has multiple ideas, compress them into 1-2 short sentences; use top-level bullets outside the card or a table/process when a list is needed.',
  ].join('\n');
}
