import type { Scene, SlideContent } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import {
  compileSyntaraMarkupToNotebookDocument,
  normalizeSyntaraMarkupLayout,
} from '@/lib/notebook-content/markup';
import { renderNotebookContentDocumentToSlide } from './slide-adapter';
import { normalizeSlideTextLayout, validateSlideTextLayout } from '@/lib/slide-text-layout';
import { normalizeMathSource } from '@/lib/math-engine';

export const SEMANTIC_SLIDE_RENDER_VERSION = 38;

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

function normalizeSemanticTextSource(text: string): string {
  return text
    .replace(/<\/?(?:begin|end)\{[^}]+\}>?/gi, '')
    .replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\')
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

function normalizeBlockTextFields(block: NotebookContentBlock): NotebookContentBlock {
  return normalizeSemanticTextFields(block) as NotebookContentBlock;
}

function normalizeFormulaLatex(text: string): string {
  return normalizeMathSource(text)
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

  const latex = normalizeFormulaLatex(repairKnownWorkedExampleExpression(block.latex, document));
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

function collectBlockText(block: NotebookContentBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return block.text;
    case 'bullet_list':
      return block.items.join('\n');
    case 'equation':
      return block.latex;
    case 'matrix':
      return block.rows.flat().join(' ');
    case 'derivation_steps':
      return [
        block.title || '',
        ...block.steps.map((step) => [step.explanation || '', step.expression].join(' ')),
      ].join('\n');
    case 'code_block':
      return [block.caption || '', block.code].join('\n');
    case 'code_walkthrough':
      return [
        block.title || '',
        block.caption || '',
        block.code,
        ...block.steps.map((step) =>
          [step.title || '', step.focus || '', step.explanation].join(' '),
        ),
        block.output || '',
      ].join('\n');
    case 'table':
      return [block.caption || '', ...(block.headers || []), ...block.rows.flat()].join('\n');
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
        ...block.givens,
        block.goal || '',
        ...block.steps,
        block.answer || '',
        ...block.pitfalls,
      ].join('\n');
    case 'process_flow':
      return [
        block.title || '',
        ...block.context.map((item) => [item.label, item.text].join(' ')),
        ...block.steps.map((step) => [step.title, step.detail, step.note || ''].join(' ')),
        block.summary || '',
      ].join('\n');
    case 'layout_cards':
      return [
        block.title || '',
        ...block.items.map((item) => [item.title, item.text].join(' ')),
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
    ...document.blocks.map(collectBlockText),
    ...(document.slots || []).flatMap((slot) => slot.blocks.map(collectBlockText)),
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
    if (block.type !== 'bullet_list') return [block];
    const items = dedupeBulletItems(block.items);
    return items.length ? [{ ...block, items }] : [];
  });
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
      const normalizedBlock = normalizeBlockTextFields(block);
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
                      repairKnownWorkedExampleExpression(step.expression, document),
                    ),
                  }
                : step,
            ),
          },
        ];
      }
      if (normalizedBlock.type === 'paragraph' && isTrivialConnectorText(normalizedBlock.text)) {
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

  return {
    ...document,
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

export function normalizeSemanticDocumentForRender(
  document: NotebookContentDocument,
): NotebookContentDocument {
  return normalizeSemanticDocumentStructure(normalizeSemanticDocumentMath(document));
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
  const layoutValidation = validateSlideTextLayout(renderedCanvas.elements);
  const normalizedCanvas = layoutValidation.isValid
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

  return {
    type: 'slide',
    canvas,
    syntaraMarkup: args.syntaraMarkup,
    semanticDocument: document,
    semanticRenderVersion: SEMANTIC_SLIDE_RENDER_VERSION,
    semanticRenderMode: args.renderMode ?? 'auto',
    webRenderMode: args.renderMode === 'manual' ? 'slide' : 'scroll',
  };
}

export function shouldAutoRefreshSemanticSlideContent(content: SlideContent): boolean {
  if (!content.semanticDocument) return false;
  if (hasMathRenderError(content)) return true;
  if (content.semanticRenderMode === 'manual') return false;
  return content.semanticRenderVersion !== SEMANTIC_SLIDE_RENDER_VERSION;
}

function hasMathRenderError(content: SlideContent): boolean {
  const elementsJson = JSON.stringify(content.canvas.elements ?? []);
  return /katex-error|KaTeX parse error|ParseError: KaTeX/.test(elementsJson);
}

export function refreshSemanticSlideScene(scene: Scene): Scene {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return scene;
  }

  const { content } = scene;
  if (!shouldAutoRefreshSemanticSlideContent(content) || !content.semanticDocument) {
    return scene;
  }
  const markupSource = content.syntaraMarkup;
  const shouldCompileFromMarkup = Boolean(markupSource && !content.semanticDocument.continuation);
  const sourceDocument = shouldCompileFromMarkup
    ? compileSyntaraMarkupToNotebookDocument(markupSource || '', {
        title: content.semanticDocument.title || scene.title,
        language: content.semanticDocument.language,
      }) || normalizeSemanticDocumentForRender(content.semanticDocument)
    : normalizeSemanticDocumentForRender(content.semanticDocument);
  const syntaraMarkup = shouldCompileFromMarkup
    ? normalizeSyntaraMarkupLayout(markupSource || '')
    : markupSource;

  return {
    ...scene,
    content: renderSemanticSlideContent({
      document: sourceDocument,
      fallbackTitle: sourceDocument.title || scene.title,
      preserveCanvasId: content.canvas.id,
      syntaraMarkup,
      renderMode: content.semanticRenderMode ?? 'auto',
    }),
  };
}
