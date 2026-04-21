import { NextRequest } from 'next/server';
import { parseNotebookContentDocument, type NotebookContentDocument } from '@/lib/notebook-content';
import {
  normalizeLatexSource,
  replaceCommonRawLatexText,
  wrapBareLatexEnvironments,
} from '@/lib/latex-utils';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import type { SlideContent } from '@/lib/types/stage';
import type { SlideRepairConversationTurn } from '@/lib/types/slide-repair';
import {
  buildRenderedRepairContent,
  countSuspiciousPlaceholderBlocks,
  computeSegmentReuseRatio,
  estimateDocumentSignal,
  getDocumentComparableSegments,
  repairOutputHasUnexpectedCjk,
  normalizeCompactText,
  normalizeRepairConversation,
  runSlideRepairAttempt,
  splitMeaningfulLines,
  summarizeElements,
  type RepairRequestBody,
  type SlideRepairLanguage,
} from '../repair-slide-shared';

const log = createLogger('Classroom Repair Slide Math API');

export const maxDuration = 180;

type RepairIntent = {
  hasInstructions: boolean;
  wantsExpansion: boolean;
  wantsStructureChange: boolean;
  wantsMinimalMathOnly: boolean;
  wantsTargetedFormulaFix: boolean;
  wantsPreserveSolution: boolean;
  hintsNeedAnotherPage: boolean;
  wantsExplicitDerivation: boolean;
};

const SOLUTION_SIGNAL_REGEX =
  /题解|解答|证明|证明过程|推导|步骤|思路|答案|结论|分析|因此|所以|可得|得出|solution|proof|derivation|derive|steps?|answer|conclusion|analysis|therefore|thus|hence/i;

const MINIMAL_MATH_ONLY_KEYWORDS = [
  '只修公式',
  '只修数学',
  '只修 latex',
  '只修latex',
  '只修符号',
  '不要改文案',
  '保留原文',
  '轻微修改',
  '小修',
  'math only',
  'notation only',
  'latex only',
  'symbol only',
  'do not rewrite',
  'keep wording',
];

const TARGETED_FORMULA_FIX_KEYWORDS = [
  '改公式',
  '改一下公式',
  '公式改一下',
  '修公式',
  '修下公式',
  '修一下公式',
  '修正公式',
  '公式不对',
  '公式有问题',
  'latex 不对',
  'latex不对',
  '改 latex',
  '改latex',
  '改一下 latex',
  '改一下latex',
  '改符号',
  '改一下符号',
  '修符号',
  '修一下符号',
  'fix formula',
  'fix the formula',
  'fix formulas',
  'fix notation',
  'correct the formula',
  'correct the equation',
  'change the formula',
  'update the formula',
  'update the notation',
];

const PRESERVE_SOLUTION_KEYWORDS = [
  '别改题解',
  '不要改题解',
  '不要删题解',
  '保留题解',
  '别删题解',
  '不要动题解',
  '保留步骤',
  '不要删步骤',
  '不要动步骤',
  '保留答案',
  '不要删答案',
  '保留证明',
  '不要删证明',
  'keep solution',
  'keep the solution',
  'do not touch solution',
  'dont touch solution',
  'keep steps',
  'keep the steps',
  'do not remove steps',
  'keep answer',
  'keep the answer',
  'keep proof',
  'keep the proof',
];

function buildFallbackDocumentFromSlideContent(args: {
  sceneTitle: string;
  language: SlideRepairLanguage;
  content: SlideContent;
}): NotebookContentDocument {
  const blocks: NotebookContentDocument['blocks'] = [];
  const items = summarizeElements(args.content.canvas.elements);

  for (const item of items) {
    if (item.type === 'latex') {
      blocks.push({ type: 'equation', latex: item.latex, display: true });
      continue;
    }

    if (item.type === 'table') {
      blocks.push({
        type: 'table',
        caption: item.name || undefined,
        rows: item.rows,
      });
      continue;
    }

    const lines = splitMeaningfulLines(item.text);
    if (lines.length === 0) continue;

    const bulletItems = lines
      .filter((line) => /^[-•·▪◦]/.test(line))
      .map((line) => line.replace(/^[-•·▪◦]\s*/, '').trim())
      .filter(Boolean);

    if (item.type === 'text' && (item.textType === 'title' || item.textType === 'subtitle')) {
      blocks.push({
        type: 'heading',
        level: item.textType === 'title' ? 1 : 2,
        text: lines.join(' '),
      });
      continue;
    }

    if (
      item.type === 'text' &&
      (item.textType === 'itemTitle' || item.textType === 'header') &&
      lines.length <= 2
    ) {
      blocks.push({
        type: 'heading',
        level: 3,
        text: lines.join(' '),
      });
      continue;
    }

    if (bulletItems.length >= Math.max(2, lines.length - 1)) {
      blocks.push({ type: 'bullet_list', items: bulletItems });
      continue;
    }

    blocks.push({ type: 'paragraph', text: lines.join('\n') });
  }

  return {
    version: 1,
    language: args.language,
    profile: 'math',
    layout: { mode: 'stack' },
    archetype: 'definition',
    title: args.sceneTitle,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type: 'paragraph',
              text:
                args.language === 'zh-CN'
                  ? '请保留当前页内容，仅修复数学符号。'
                  : 'Keep the current page content and only repair mathematical notation.',
            },
          ],
  };
}

function countReasoningBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    if (block.type === 'derivation_steps' || block.type === 'example') return true;
    if (block.type === 'equation') return true;
    if (block.type === 'matrix') return true;
    if (block.type === 'bullet_list') return block.items.length >= 2;
    if (block.type === 'paragraph') return normalizeCompactText(block.text).length >= 30;
    return false;
  }).length;
}

function getBlockTextFragments(block: NotebookContentDocument['blocks'][number]): string[] {
  switch (block.type) {
    case 'heading':
      return [block.text];
    case 'paragraph':
      return [block.text];
    case 'bullet_list':
      return block.items;
    case 'equation':
      return [block.caption || '', block.latex];
    case 'matrix':
      return [block.label || '', block.caption || '', ...block.rows.flat()];
    case 'derivation_steps':
      return [
        block.title || '',
        ...block.steps.flatMap((step) => [step.expression, step.explanation || '']),
      ];
    case 'code_block':
      return [block.caption || '', block.code];
    case 'code_walkthrough':
      return [
        block.title || '',
        block.caption || '',
        block.code,
        ...block.steps.flatMap((step) => [step.title || '', step.focus || '', step.explanation]),
        block.output || '',
      ];
    case 'table':
      return [block.caption || '', ...(block.headers || []), ...block.rows.flat()];
    case 'callout':
      return [block.title || '', block.text];
    case 'example':
      return [
        block.title || '',
        block.problem,
        ...block.givens,
        block.goal || '',
        ...block.steps,
        block.answer || '',
        ...block.pitfalls,
      ];
    case 'layout_cards':
      return [block.title || '', ...block.items.flatMap((item) => [item.title, item.text])];
    case 'chem_formula':
      return [block.caption || '', block.formula];
    case 'chem_equation':
      return [block.caption || '', block.equation];
    default:
      return [];
  }
}

function blockHasSolutionSignal(block: NotebookContentDocument['blocks'][number]): boolean {
  if (block.type === 'example' || block.type === 'derivation_steps') return true;
  return getBlockTextFragments(block).some((text) => SOLUTION_SIGNAL_REGEX.test(text));
}

function countSolutionSignalBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter(blockHasSolutionSignal).length;
}

function summarizeProtectedBlocks(
  doc: NotebookContentDocument,
  language: SlideRepairLanguage,
): string[] {
  return doc.blocks
    .flatMap((block, index) => {
      if (block.type === 'example') {
        return [
          language === 'en-US'
            ? `block ${index + 1}: worked example with ${block.steps.length} steps${block.answer ? ' and an answer' : ''}`
            : `第 ${index + 1} 块：例题块，含 ${block.steps.length} 个步骤${block.answer ? '，并保留答案' : ''}`,
        ];
      }

      if (block.type === 'derivation_steps') {
        return [
          language === 'en-US'
            ? `block ${index + 1}: derivation block with ${block.steps.length} steps`
            : `第 ${index + 1} 块：推导块，含 ${block.steps.length} 个步骤`,
        ];
      }

      if (!blockHasSolutionSignal(block)) return [];
      return [
        language === 'en-US'
          ? `block ${index + 1}: ${block.type} block containing solution / proof content`
          : `第 ${index + 1} 块：${block.type}，包含题解 / 证明类内容`,
      ];
    })
    .slice(0, 10);
}

function normalizeInlineMathDelimiters(text: string): string {
  const wrapDisplayMath = (expression: string) => {
    let normalized = expression.trim();
    let previous = '';

    while (normalized !== previous) {
      previous = normalized;
      const wrappedMatch =
        normalized.match(/^\$\$([\s\S]+?)\$\$$/) ||
        normalized.match(/^\$([\s\S]+?)\$$/) ||
        normalized.match(/^\\\[([\s\S]+?)\\\]$/) ||
        normalized.match(/^\\\(([\s\S]+?)\\\)$/);
      if (!wrappedMatch?.[1]) break;
      normalized = wrappedMatch[1].trim();
    }

    return `$$${normalizeLatexSource(normalized)}$$`;
  };

  const normalized = wrapBareLatexEnvironments(text)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, expression: string) => {
      return wrapDisplayMath(expression);
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, expression: string) => {
      return wrapDisplayMath(expression);
    })
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression: string) => {
      return wrapDisplayMath(expression);
    })
    .replace(/\$([^\n$]+?)\$/g, (_match, expression: string) => {
      return wrapDisplayMath(expression);
    });

  return replaceCommonRawLatexText(
    normalized
      .replace(
        /\(\s*([^()]{1,18}?)\s+notin\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ∉ ${right.trim()})`,
      )
      .replace(
        /\(\s*([^()]{1,18}?)\s+in\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ∈ ${right.trim()})`,
      )
      .replace(
        /\(\s*([^()]{1,24}?)\s+subseteq\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ⊆ ${right.trim()})`,
      )
      .replace(
        /\(\s*([^()]{1,24}?)\s+supseteq\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ⊇ ${right.trim()})`,
      )
      .replace(
        /\(\s*([^()]{1,24}?)\s+subset\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ⊂ ${right.trim()})`,
      )
      .replace(
        /\(\s*([^()]{1,24}?)\s+supset\s+([^()]{1,24}?)\s*\)/gi,
        (_match, left: string, right: string) => `(${left.trim()} ⊃ ${right.trim()})`,
      )
      .replace(/\${3,}/g, '$$'),
  ).replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_match, expression: string) => {
    return wrapDisplayMath(expression);
  });
}

function looksLikeBareStandaloneFormula(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (/[。！？!?]/.test(trimmed)) return false;

  const compact = trimmed.replace(/\s+/g, '');
  const hasMathSignal = /\\[A-Za-z]+|[_^=<>+\-*/]|[∈∀∃⊂⊆⊃⊇→⇒≈≅≡≤≥]/.test(compact);
  if (!hasMathSignal) return false;

  const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinWords = trimmed.split(/\s+/).filter(Boolean).length;
  return !(cjkCount > 10 && latinWords > 6);
}

function extractStandaloneFormulaLatex(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const wrappedPatterns = [
    /^\$\$([\s\S]+?)\$\$$/,
    /^\\\[([\s\S]+?)\\\]$/,
    /^\\\(([\s\S]+?)\\\)$/,
    /^\$([^\n$]+?)\$$/,
  ];
  for (const pattern of wrappedPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return normalizeLatexSource(match[1]);
  }

  return looksLikeBareStandaloneFormula(trimmed) ? normalizeLatexSource(trimmed) : null;
}

function sanitizeEquationBlock(block: Extract<NotebookContentDocument['blocks'][number], { type: 'equation' }>) {
  const raw = block.latex.trim().replace(/\${3,}/g, '$$');
  const extractCaptionedMath = (
    pattern: RegExp,
  ): { latex: string; caption?: string } | null => {
    const match = raw.match(pattern);
    if (!match?.[2]) return null;

    const prefix = match[1]?.trim() || '';
    const suffix = match[3]?.trim() || '';
    const caption = [block.caption?.trim(), prefix, suffix].filter(Boolean).join(' ');
    return {
      latex: normalizeLatexSource(match[2]),
      caption: caption || undefined,
    };
  };

  const envMatch = raw.match(/^(.*?)(\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\3\})(.*)$/);
  if (envMatch?.[2]) {
    const prefix = envMatch[1]?.trim() || '';
    const suffix = envMatch[4]?.trim() || '';
    const caption = [block.caption?.trim(), prefix, suffix].filter(Boolean).join(' ');
    return {
      ...block,
      latex: normalizeLatexSource(envMatch[2]),
      caption: caption || undefined,
    };
  }

  const extractedFromDouble = extractCaptionedMath(/^(.*?)\$\$([\s\S]+?)\$\$(.*)$/);
  if (extractedFromDouble) {
    return { ...block, ...extractedFromDouble };
  }

  const extractedFromSingle = extractCaptionedMath(/^(.*?)(?<!\$)\$([\s\S]+?)\$(?!\$)(.*)$/);
  if (extractedFromSingle) {
    return { ...block, ...extractedFromSingle };
  }

  const wrappedMatch =
    raw.match(/^(.*?)\\\[([\s\S]+?)\\\](.*)$/) ||
    raw.match(/^(.*?)\\\(([\s\S]+?)\\\)(.*)$/);

  if (wrappedMatch?.[2]) {
    const prefix = wrappedMatch[1]?.trim() || '';
    const suffix = wrappedMatch[3]?.trim() || '';
    const caption = [block.caption?.trim(), prefix, suffix].filter(Boolean).join(' ');
    return {
      ...block,
      latex: normalizeLatexSource(wrappedMatch[2]),
      caption: caption || undefined,
    };
  }

  return {
    ...block,
    latex: normalizeLatexSource(raw),
    caption: block.caption?.trim() || undefined,
  };
}

function postProcessMathRepairDocument(document: NotebookContentDocument): NotebookContentDocument {
  const blocks = document.blocks.flatMap<NotebookContentDocument['blocks'][number]>((block) => {
    switch (block.type) {
      case 'heading':
        return [{ ...block, text: normalizeInlineMathDelimiters(block.text) }];
      case 'paragraph': {
        const text = normalizeInlineMathDelimiters(block.text);
        const standaloneLatex = extractStandaloneFormulaLatex(text);
        if (standaloneLatex) {
          return [{ type: 'equation', latex: standaloneLatex, display: true }];
        }
        return [{ ...block, text }];
      }
      case 'bullet_list':
        return [{ ...block, items: block.items.map(normalizeInlineMathDelimiters) }];
      case 'equation':
        return [sanitizeEquationBlock(block)];
      case 'derivation_steps':
        return [
          {
            ...block,
            title: block.title ? normalizeInlineMathDelimiters(block.title) : undefined,
            steps: block.steps.map((step) => ({
              ...step,
              expression:
                step.format === 'latex'
                  ? normalizeLatexSource(step.expression)
                  : normalizeInlineMathDelimiters(step.expression),
              explanation: step.explanation
                ? normalizeInlineMathDelimiters(step.explanation)
                : undefined,
            })),
          },
        ];
      case 'table':
        return [
          {
            ...block,
            caption: block.caption ? normalizeInlineMathDelimiters(block.caption) : undefined,
            headers: block.headers?.map(normalizeInlineMathDelimiters),
            rows: block.rows.map((row) => row.map(normalizeInlineMathDelimiters)),
          },
        ];
      case 'callout':
        return [
          {
            ...block,
            title: block.title ? normalizeInlineMathDelimiters(block.title) : undefined,
            text: normalizeInlineMathDelimiters(block.text),
          },
        ];
      case 'example':
        return [
          {
            ...block,
            title: block.title ? normalizeInlineMathDelimiters(block.title) : undefined,
            problem: normalizeInlineMathDelimiters(block.problem),
            givens: block.givens.map(normalizeInlineMathDelimiters),
            goal: block.goal ? normalizeInlineMathDelimiters(block.goal) : undefined,
            steps: block.steps.map(normalizeInlineMathDelimiters),
            answer: block.answer ? normalizeInlineMathDelimiters(block.answer) : undefined,
            pitfalls: block.pitfalls.map(normalizeInlineMathDelimiters),
          },
        ];
      case 'layout_cards':
        return [
          {
            ...block,
            title: block.title ? normalizeInlineMathDelimiters(block.title) : undefined,
            items: block.items.map((item) => ({
              ...item,
              title: normalizeInlineMathDelimiters(item.title),
              text: normalizeInlineMathDelimiters(item.text),
            })),
          },
        ];
      case 'chem_formula':
      case 'chem_equation':
      case 'matrix':
      case 'code_block':
      case 'code_walkthrough':
      default:
        return [block];
    }
  });

  return {
    ...document,
    blocks,
  };
}

function shouldKeepSourceBlock(
  sourceBlock: NotebookContentDocument['blocks'][number],
  repairedBlock: NotebookContentDocument['blocks'][number],
): boolean {
  if (sourceBlock.type !== repairedBlock.type) return true;

  switch (sourceBlock.type) {
    case 'heading': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        normalizeCompactText(matchedBlock.text).length <
        Math.max(4, Math.floor(normalizeCompactText(sourceBlock.text).length * 0.5))
      );
    }
    case 'paragraph': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        normalizeCompactText(sourceBlock.text).length >= 30 &&
        normalizeCompactText(matchedBlock.text).length <
          Math.max(12, Math.floor(normalizeCompactText(sourceBlock.text).length * 0.6))
      );
    }
    case 'bullet_list': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        matchedBlock.items.length < Math.max(1, Math.floor(sourceBlock.items.length * 0.6)) ||
        matchedBlock.items.join('').trim().length <
          Math.max(12, Math.floor(sourceBlock.items.join('').trim().length * 0.55))
      );
    }
    case 'table': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        matchedBlock.rows.length < Math.max(1, Math.floor(sourceBlock.rows.length * 0.6)) ||
        Boolean(sourceBlock.headers?.length) !== Boolean(matchedBlock.headers?.length)
      );
    }
    case 'callout': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        normalizeCompactText(sourceBlock.text).length >= 20 &&
        normalizeCompactText(matchedBlock.text).length <
          Math.max(10, Math.floor(normalizeCompactText(sourceBlock.text).length * 0.6))
      );
    }
    case 'example': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return (
        matchedBlock.steps.length < Math.max(1, Math.floor(sourceBlock.steps.length * 0.8)) ||
        (sourceBlock.givens.length > 0 && matchedBlock.givens.length === 0) ||
        Boolean(sourceBlock.answer?.trim()) !== Boolean(matchedBlock.answer?.trim())
      );
    }
    case 'derivation_steps': {
      const matchedBlock = repairedBlock as typeof sourceBlock;
      return matchedBlock.steps.length < Math.max(1, Math.floor(sourceBlock.steps.length * 0.8));
    }
    default:
      return false;
  }
}

function reconcileConservativeMathRepair(args: {
  sourceDocument: NotebookContentDocument;
  repairedDocument: NotebookContentDocument;
  intent: RepairIntent;
}): NotebookContentDocument {
  if (
    !args.intent.wantsMinimalMathOnly &&
    !args.intent.wantsTargetedFormulaFix &&
    !args.intent.wantsPreserveSolution
  ) {
    return args.repairedDocument;
  }

  const usedIndices = new Set<number>();
  const reconciledBlocks = args.sourceDocument.blocks.map((sourceBlock, sourceIndex) => {
    let candidateIndex = -1;
    if (
      sourceIndex < args.repairedDocument.blocks.length &&
      args.repairedDocument.blocks[sourceIndex]?.type === sourceBlock.type
    ) {
      candidateIndex = sourceIndex;
    } else {
      candidateIndex = args.repairedDocument.blocks.findIndex(
        (block, index) => !usedIndices.has(index) && block.type === sourceBlock.type,
      );
    }

    if (candidateIndex < 0) return sourceBlock;
    usedIndices.add(candidateIndex);

    const candidate = args.repairedDocument.blocks[candidateIndex];
    return shouldKeepSourceBlock(sourceBlock, candidate) ? sourceBlock : candidate;
  });

  return {
    ...args.repairedDocument,
    title: args.repairedDocument.title || args.sourceDocument.title,
    blocks: reconciledBlocks,
  };
}

function inferRepairIntent(repairInstructions?: string): RepairIntent {
  const raw = repairInstructions?.trim() || '';
  const normalized = raw.toLowerCase();

  const includesAny = (keywords: string[]) =>
    keywords.some((keyword) => raw.includes(keyword) || normalized.includes(keyword));

  const wantsTargetedFormulaFix = includesAny(TARGETED_FORMULA_FIX_KEYWORDS);
  const wantsPreserveSolution = includesAny(PRESERVE_SOLUTION_KEYWORDS);

  return {
    hasInstructions: raw.length > 0,
    wantsExpansion: includesAny([
      '补充',
      '补全',
      '展开',
      '详细',
      '讲清楚',
      '讲明白',
      '更完整',
      '完整一点',
      '扩写',
      'step by step',
      'step-by-step',
      'expand',
      'more detail',
      'detailed',
      'clarify',
      'explain',
      'complete',
      'fill in',
    ]),
    wantsStructureChange: includesAny([
      '结构',
      '层次',
      '重组',
      '重新组织',
      '整理',
      '分点',
      '拆开',
      '思路',
      '推导',
      '证明过程',
      '步骤',
      'structure',
      'organize',
      'restructure',
      'flow',
      'proof',
      'derivation',
      'steps',
    ]),
    wantsMinimalMathOnly:
      includesAny(MINIMAL_MATH_ONLY_KEYWORDS) || wantsTargetedFormulaFix || wantsPreserveSolution,
    wantsTargetedFormulaFix,
    wantsPreserveSolution,
    hintsNeedAnotherPage: includesAny([
      '加新的页',
      '加一页',
      '补一页',
      '新的一页',
      '拆成两页',
      '拆成 2 页',
      '拆成2页',
      'another page',
      'new page',
      'add a page',
      'split into two pages',
      'split into 2 pages',
      'multi-page',
    ]),
    wantsExplicitDerivation: includesAny([
      '推导',
      '证明',
      '证明过程',
      '关键步骤',
      '步骤',
      'derive',
      'derivation',
      'proof',
      'reasoning',
      'step by step',
      'step-by-step',
      'steps',
    ]),
  };
}

function countMathStructureBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter(
    (block) =>
      block.type === 'equation' || block.type === 'matrix' || block.type === 'derivation_steps',
  ).length;
}

function looksLikeInstructionWasIgnored(args: {
  sourceDocument: NotebookContentDocument;
  repairedDocument: NotebookContentDocument;
  intent: RepairIntent;
}): boolean {
  if (!args.intent.hasInstructions) return false;

  const sourceSegments = getDocumentComparableSegments(args.sourceDocument);
  const repairedSegments = getDocumentComparableSegments(args.repairedDocument);
  const sourceText = sourceSegments.join('\n');
  const repairedText = repairedSegments.join('\n');
  if (sourceText === repairedText) return true;

  const reuseRatio = computeSegmentReuseRatio(sourceSegments, repairedSegments);

  const sourceSignal = estimateDocumentSignal(args.sourceDocument);
  const repairedSignal = estimateDocumentSignal(args.repairedDocument);
  const sourceReasoningBlocks = countReasoningBlocks(args.sourceDocument);
  const repairedReasoningBlocks = countReasoningBlocks(args.repairedDocument);
  const sourceMathStructureBlocks = countMathStructureBlocks(args.sourceDocument);
  const repairedMathStructureBlocks = countMathStructureBlocks(args.repairedDocument);
  const blockDelta = Math.abs(
    args.repairedDocument.blocks.length - args.sourceDocument.blocks.length,
  );

  if (args.intent.wantsMinimalMathOnly) {
    return repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.72));
  }

  if (
    args.intent.wantsExpansion &&
    repairedSignal < Math.max(sourceSignal + 24, Math.floor(sourceSignal * 1.12)) &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  if (
    args.intent.wantsExplicitDerivation &&
    repairedMathStructureBlocks <= sourceMathStructureBlocks &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  if (
    args.intent.wantsStructureChange &&
    reuseRatio > 0.9 &&
    repairedReasoningBlocks <= sourceReasoningBlocks &&
    blockDelta <= 1
  ) {
    return true;
  }

  if (
    args.intent.hintsNeedAnotherPage &&
    repairedSignal < Math.max(sourceSignal + 30, Math.floor(sourceSignal * 1.15)) &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  return (
    reuseRatio > 0.94 &&
    repairedSignal <= Math.max(sourceSignal + 12, Math.floor(sourceSignal * 1.03))
  );
}

function buildFallbackAssistantReply(args: {
  language: SlideRepairLanguage;
  intent: RepairIntent;
  repairInstructions?: string;
  document: NotebookContentDocument;
}): string {
  const mathStructureBlocks = countMathStructureBlocks(args.document);
  if (args.language === 'zh-CN') {
    if (args.intent.wantsMinimalMathOnly) {
      return '我已经按你的要求优先修了公式、符号和上下标，正文尽量保持不变。';
    }
    if (
      (args.intent.wantsExpansion || args.intent.wantsStructureChange) &&
      mathStructureBlocks > 0
    ) {
      return '我把这一页里关键的数学表达尽量拆成了更清楚的公式或推导块，你可以继续告诉我哪一步还要再展开。';
    }
    if (args.intent.wantsExpansion || args.intent.wantsStructureChange) {
      return '我已经先把这一页的层次整理得更清楚了，但如果你想补完整证明，下一步更适合继续追着某一步展开。';
    }
    if (args.repairInstructions?.trim()) {
      return '我已经按你刚才的要求修了这一页。你可以继续补充更细的修改意见。';
    }
    return '我已经先按默认规则修了这一页的数学表达和讲解结构。你可以继续告诉我要保留或补强哪一部分。';
  }

  if (args.intent.wantsMinimalMathOnly) {
    return 'I focused on formulas, notation, and subscripts while keeping the wording as intact as possible.';
  }
  if ((args.intent.wantsExpansion || args.intent.wantsStructureChange) && mathStructureBlocks > 0) {
    return 'I split more of the key math into clearer equation or derivation blocks. You can ask me to expand any specific step next.';
  }
  if (args.intent.wantsExpansion || args.intent.wantsStructureChange) {
    return 'I clarified the slide structure first. If you want a fuller proof, tell me which step to expand next.';
  }
  if (args.repairInstructions?.trim()) {
    return 'I repaired this slide based on your instruction. You can keep refining it with follow-up requests.';
  }
  return 'I repaired the math notation and teaching structure of this slide with the default repair rules.';
}

function buildSystemPrompt(language: SlideRepairLanguage, intent: RepairIntent) {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页数学内容与排版修复器”。

你的任务是修复一页课堂幻灯片里的数学记号、公式表达，以及讲解结构，让它适合被结构化渲染并且真正便于学生理解。

要求：
- 教师在侧边栏输入的修复要求具有最高优先级，必须被明确响应，不能忽略。
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、结论、层次和大致信息量，不要引入新的知识点。
- 不要删掉题解、步骤、结论、已知条件、易错点、答案或推导过程；如果拿不准，保留原内容。
- 优先在原有内容上做最小修改，而不是重写整页。
- 尽量保持原有 block 顺序与数量；除非某一块明显应该拆成“说明 + 公式”，否则不要合并或删减。
- 如果教师只是让你“改公式 / 改符号 / 修 latex”，这就是一次保守修订任务：除非原文确实错误，否则题目、题解、步骤、答案、证明说明都必须原样保留，只修改公式本身和紧邻公式的必要措辞。
- 如果原页是“例题 / 证明 / 推导”页，必须把关键推导链明确写出来，不能只保留题目、标题和空占位。
- 不要输出空标题、空小节或占位块，例如“已知：”“证明：”“思路：”后面没有实质内容的结构。
- 如果原页里有两个结论，优先按“结论 1 -> 推导 -> 结论 2 -> 推导”或“已知 -> 推导 -> 结论”的方式整理清楚。
- 如果教师要求“补充说明 / 展开推导 / 讲清楚”，结果必须体现出可见的内容级改进，而不是只换个说法。
- 如果教师暗示“这一页其实需要补页或拆页”，你仍然要先把当前页中最缺的推导或解释补出来，不能装作没看到这个要求。
- 重点修复数学对象、映射、集合、等式、核、像、同余类、下标、上标等表达。
- 把真正的数学表达放进结构化公式块：
  - 单个或独立公式用 {"type":"equation","latex":"...","display":true}
  - 独立矩阵优先用 {"type":"matrix","rows":[...],"brackets":"bmatrix",...}
  - 连续推导用 {"type":"derivation_steps", ...}
- 解释性语句、标题、小结保留为 heading / paragraph / bullet_list。
- 如果原文里只是把数学表达硬塞在句子里，请拆成“说明文字 + 公式块”，不要继续把复杂公式塞进 paragraph。
- paragraph / bullet_list / callout / example / layout_cards 里的数学表达，如果没有拆成 equation block，就必须用 $$...$$ 包起来；不要把裸 LaTeX 直接塞进普通文本里。
- 严禁输出裸 LaTeX 源码片段，例如 \\begin{aligned}、\\text{...}、\\frac、\\subseteq 直接出现在普通文本里；这些内容要么放进 equation block，要么放进 $$...$$。
- 如果一整行基本就是公式，优先直接改成 equation block；如果暂时保留在文本中，也必须完整包在 $$...$$ 里。
- 不要输出 markdown，不要输出解释，不要输出代码块，只输出 JSON。

数学修复示例：
- Z12 -> \\mathbb{Z}_{12}
- Z6 -> \\mathbb{Z}_{6}
- ker(φ) -> \\ker(\\varphi)
- im(φ) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}
- φ([x]12)=[2x]6 -> \\varphi([x]_{12}) = [2x]_{6}

输出 schema：
{
  "sceneTitle": "修复后的页标题",
  "assistantReply": "给教师的简短回复，1 到 2 句话，说明你这次具体怎么改了这一页",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "profile": "math",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "equation", "latex": "...", "display": true },
      { "type": "matrix", "rows": [["a", "b"], ["c", "d"]], "brackets": "bmatrix", "label": "可选", "caption": "可选" },
      {
        "type": "derivation_steps",
        "title": "可选",
        "steps": [{ "expression": "...", "format": "latex", "explanation": "可选" }]
      },
      {
        "type": "callout",
        "tone": "info" | "success" | "warning" | "danger" | "tip",
        "title": "可选",
        "text": "..."
      }
    ]
  }
}

当前教师意图：
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalMathOnly: ${intent.wantsMinimalMathOnly ? 'yes' : 'no'}
- wantsTargetedFormulaFix: ${intent.wantsTargetedFormulaFix ? 'yes' : 'no'}
- wantsPreserveSolution: ${intent.wantsPreserveSolution ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}
- wantsExplicitDerivation: ${intent.wantsExplicitDerivation ? 'yes' : 'no'}`;
  }

  return `You repair the mathematical notation, content structure, and teaching clarity of a single classroom slide.

Requirements:
- The teacher's sidebar instruction has the highest priority and must be visibly addressed.
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, meaning, and rough information density.
- Do not remove solution steps, givens, conclusions, or answer content. If unsure, keep it.
- Prefer minimal edits to the existing blocks instead of rewriting the page.
- Keep the original block order and roughly the same number of blocks whenever possible.
- If the teacher only asked to fix a formula / symbol / LaTeX notation, treat this as a conservative edit: keep the problem statement, solution, proof text, steps, and answer unless they are directly wrong.
- All visible teaching text in sceneTitle, assistantReply, and document blocks must be in English.
- If the source document is in Chinese or mixed-language, preserve the math meaning but rewrite the final visible teaching content into English.
- Do not leave Chinese text in headings, bullets, callouts, captions, derivation explanations, or summaries unless it is an unavoidable proper noun from the source material.
- If this is a proof / derivation / worked-example slide, keep the reasoning explicit. Do not collapse it into headings plus placeholders.
- Do not output empty section headers or placeholder blocks such as "Given:", "Proof:", or "Idea:" without substantive content after them.
- If the teacher asks for more explanation or clearer derivation, make a visible content-level improvement rather than superficial rewording.
- If the teacher hints that this slide really needs another page, still strengthen the current page instead of ignoring the request.
- Convert malformed mathematical notation into structured math blocks.
- Use equation blocks for standalone math, matrix blocks for standalone matrices, and derivation_steps for multi-line reasoning.
- Keep prose as heading / paragraph / bullet_list.
- If a sentence contains a heavy formula, split it into prose plus a formula block.
- Any math that remains inside paragraph / bullet_list / callout / example / layout_cards text must be wrapped in $$...$$. Do not leave bare LaTeX inside ordinary prose.
- Never emit raw LaTeX commands such as \\begin{aligned}, \\text{...}, \\frac, or \\subseteq directly in prose. Either move them into an equation block or wrap the full math expression in $$...$$.
- If a line is basically just a formula, prefer an equation block. If it temporarily stays in text, it still must be wrapped in $$...$$.
- Output JSON only. No markdown. No commentary. No code fences.

Examples:
- Z12 -> \\mathbb{Z}_{12}
- ker(phi) -> \\ker(\\varphi)
- im(phi) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}

Output schema:
{
  "sceneTitle": "repaired page title",
  "assistantReply": "a short reply to the teacher in 1-2 sentences describing what you changed",
  "document": {
    "version": 1,
    "language": "en-US",
    "profile": "math",
    "title": "optional",
    "blocks": []
  }
}

Current teacher intent:
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalMathOnly: ${intent.wantsMinimalMathOnly ? 'yes' : 'no'}
- wantsTargetedFormulaFix: ${intent.wantsTargetedFormulaFix ? 'yes' : 'no'}
- wantsPreserveSolution: ${intent.wantsPreserveSolution ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}
- wantsExplicitDerivation: ${intent.wantsExplicitDerivation ? 'yes' : 'no'}`;
}

function buildUserPrompt(args: {
  sceneTitle: string;
  language: SlideRepairLanguage;
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
  repairInstructions?: string;
  repairConversation?: SlideRepairConversationTurn[];
  retryReason?: string;
  intent: RepairIntent;
}): string {
  const elementsSummary = summarizeElements(args.content.canvas.elements);
  const sourceDocument =
    args.semanticDocument ||
    buildFallbackDocumentFromSlideContent({
      sceneTitle: args.sceneTitle,
      language: args.language,
      content: args.content,
    });
  const repairConversation = normalizeRepairConversation(args.repairConversation);
  const protectedBlocks = summarizeProtectedBlocks(sourceDocument, args.language);

  return [
    `Language: ${args.language}`,
    `Current page title: ${args.sceneTitle}`,
    args.language === 'en-US'
      ? 'Important: the source document may currently be in Chinese. Preserve the math content, but rewrite all final visible teaching text into English.'
      : '重要：如果原页里夹杂其他语言，最终输出仍必须统一为中文。',
    args.repairInstructions?.trim()
      ? `Teacher instruction (highest priority): ${args.repairInstructions.trim()}`
      : 'Teacher instruction (highest priority): none',
    args.retryReason ? `Previous attempt was rejected because: ${args.retryReason}` : null,
    '',
    args.intent.wantsMinimalMathOnly
      ? args.language === 'en-US'
        ? 'This is a conservative math-fix task. Keep the same teaching content and only touch formulas, notation, or adjacent wording that must change.'
        : '这次是保守修订任务。请保留原有教学内容，只修改公式、符号或必须跟着一起改的紧邻措辞。'
      : null,
    args.intent.wantsPreserveSolution
      ? args.language === 'en-US'
        ? 'Do not delete or compress the worked solution, proof text, answer, or reasoning steps.'
        : '不要删改或压缩题解、证明说明、答案和推导步骤。'
      : null,
    protectedBlocks.length > 0
      ? args.language === 'en-US'
        ? 'Protected source content that must survive the repair:'
        : '以下原始内容必须在修复后保留下来：'
      : null,
    protectedBlocks.length > 0 ? protectedBlocks.join('\n') : null,
    '',
    repairConversation.length > 0 ? 'Recent repair conversation:' : null,
    repairConversation.length > 0 ? JSON.stringify(repairConversation, null, 2) : null,
    repairConversation.length > 0 ? '' : null,
    'Current page source document (edit this conservatively and preserve content):',
    JSON.stringify(sourceDocument, null, 2),
    '',
    'Current slide element summary (ordered top-to-bottom, for reference only):',
    JSON.stringify(elementsSummary, null, 2),
    '',
    'Return a repaired NotebookContentDocument for this same page.',
    'Keep the page focused. Do not add unrelated examples or sections.',
    'Do not shorten the worked solution. Preserve all meaningful steps and conclusions.',
    'If the teacher gave a repair instruction, the final result must visibly satisfy it.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function runRepairAttempt(args: {
  req: NextRequest;
  sceneTitle: string;
  language: SlideRepairLanguage;
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
  repairInstructions?: string;
  repairConversation?: SlideRepairConversationTurn[];
  retryReason?: string;
  intent: RepairIntent;
}) {
  const system = buildSystemPrompt(args.language, args.intent);
  const prompt = buildUserPrompt({
    sceneTitle: args.sceneTitle,
    language: args.language,
    semanticDocument: args.semanticDocument,
    content: args.content,
    repairInstructions: args.repairInstructions,
    repairConversation: args.repairConversation,
    retryReason: args.retryReason,
    intent: args.intent,
  });

  log.info(`Repairing slide math formatting${args.retryReason ? ' retry=1' : ''}`);

  return runSlideRepairAttempt({
    req: args.req,
    system,
    prompt,
    usageTag: 'classroom-repair-slide-math',
  });
}

export async function POST(req: NextRequest) {
  let body: RepairRequestBody;
  try {
    body = (await req.json()) as RepairRequestBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid request body');
  }

  const sceneTitle = body.sceneTitle?.trim() || 'Slide';

  return runWithRequestContext(
    req,
    '/api/classroom/repair-slide-math',
    async () => {
      try {
        const content = body.content;
        if (!content || content.type !== 'slide') {
          return apiError('MISSING_REQUIRED_FIELD', 400, 'slide content is required');
        }

        const language = body.language === 'en-US' ? 'en-US' : 'zh-CN';
        const semanticDocument = parseNotebookContentDocument(content.semanticDocument);
        const sourceDocument =
          semanticDocument ||
          buildFallbackDocumentFromSlideContent({
            sceneTitle,
            language,
            content,
          });
        const repairIntent = inferRepairIntent(body.repairInstructions);

        let attempt = await runRepairAttempt({
          req,
          sceneTitle,
          language,
          semanticDocument,
          content,
          repairInstructions: body.repairInstructions,
          repairConversation: body.repairConversation,
          intent: repairIntent,
        });

        let parsed = attempt.parsed;
        let document = postProcessMathRepairDocument(
          reconcileConservativeMathRepair({
            sourceDocument,
            repairedDocument: attempt.document,
            intent: repairIntent,
          }),
        );
        let instructionIgnored = looksLikeInstructionWasIgnored({
          sourceDocument,
          repairedDocument: document,
          intent: repairIntent,
        });
        let languageMismatch = repairOutputHasUnexpectedCjk(
          {
            sceneTitle: parsed.sceneTitle,
            assistantReply: parsed.assistantReply,
            document,
          },
          language,
        );

        if (instructionIgnored || languageMismatch) {
          attempt = await runRepairAttempt({
            req,
            sceneTitle,
            language,
            semanticDocument,
            content,
            repairInstructions: body.repairInstructions,
            repairConversation: body.repairConversation,
            retryReason:
              language === 'en-US' && languageMismatch
                ? 'The previous attempt still contained Chinese text. Rewrite every visible title, heading, bullet, derivation explanation, callout, caption, and summary into English while preserving the mathematical meaning.'
                : language === 'zh-CN'
                  ? '上一版几乎没有体现教师输入的修复要求，请显式按要求补足内容或结构变化'
                  : 'The previous attempt did not visibly follow the teacher instruction. Make the requested content or structure change explicit.',
            intent: repairIntent,
          });
          parsed = attempt.parsed;
          document = postProcessMathRepairDocument(
            reconcileConservativeMathRepair({
              sourceDocument,
              repairedDocument: attempt.document,
              intent: repairIntent,
            }),
          );
          instructionIgnored = looksLikeInstructionWasIgnored({
            sourceDocument,
            repairedDocument: document,
            intent: repairIntent,
          });
          languageMismatch = repairOutputHasUnexpectedCjk(
            {
              sceneTitle: parsed.sceneTitle,
              assistantReply: parsed.assistantReply,
              document,
            },
            language,
          );
        }

        const sourceBlockCount = sourceDocument.blocks.length;
        const repairedBlockCount = document.blocks.length;
        const sourceSignal = estimateDocumentSignal(sourceDocument);
        const repairedSignal = estimateDocumentSignal(document);
        const placeholderCount = countSuspiciousPlaceholderBlocks(document, [
          '已知',
          '证明',
          '思路',
          '题目',
          '解',
          '解答',
          '结论',
          '目标',
          '分析',
          '证明过程',
        ]);
        const sourceReasoningBlocks = countReasoningBlocks(sourceDocument);
        const repairedReasoningBlocks = countReasoningBlocks(document);
        const sourceSolutionBlocks = countSolutionSignalBlocks(sourceDocument);
        const repairedSolutionBlocks = countSolutionSignalBlocks(document);

        if (
          repairedBlockCount < Math.max(2, Math.ceil(sourceBlockCount * 0.6)) ||
          repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.55)) ||
          placeholderCount > 0 ||
          (sourceSolutionBlocks >= 1 &&
            repairedSolutionBlocks < Math.max(1, sourceSolutionBlocks - 1)) ||
          (sourceReasoningBlocks >= 2 &&
            repairedReasoningBlocks < Math.max(2, sourceReasoningBlocks - 1)) ||
          instructionIgnored ||
          languageMismatch
        ) {
          return apiError(
            'GENERATION_FAILED',
            409,
            language === 'zh-CN'
              ? instructionIgnored
                ? repairIntent.hintsNeedAnotherPage
                  ? 'AI 本轮没有真正按你的要求补足内容；这类请求更像需要补页，已保留原页不做修改'
                  : 'AI 本轮没有真正按你的要求把这一页修到位，已保留原页不做修改'
                : languageMismatch
                  ? 'AI 本轮输出仍混入了英文课堂不该出现的中文，已保留原页不做修改'
                  : '修复结果疑似删掉了题解内容，已保留原页不做修改'
              : languageMismatch
                ? 'The repaired slide still contained Chinese text, so the original slide was kept'
                : instructionIgnored
                  ? repairIntent.hintsNeedAnotherPage
                    ? 'The request looked more like an add-a-page task, so the original slide was kept'
                    : 'The AI did not visibly follow your repair instruction, so the original slide was kept'
                  : 'Repair result looked destructive, so the original slide was kept',
          );
        }

        const repairedSceneTitle =
          parsed.sceneTitle?.trim() || document.title?.trim() || sceneTitle;
        const assistantReply =
          parsed.assistantReply?.trim() ||
          buildFallbackAssistantReply({
            language,
            intent: repairIntent,
            repairInstructions: body.repairInstructions,
            document,
          });
        const repairedContent = buildRenderedRepairContent({
          content,
          document,
          profile: 'math',
          sceneTitle: repairedSceneTitle,
        });

        return apiSuccess({
          sceneTitle: repairedSceneTitle,
          assistantReply,
          content: repairedContent,
        });
      } catch (error) {
        log.error('repair-slide-math route error:', error);
        return apiError(
          'INTERNAL_ERROR',
          500,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    {
      notebookId: body.notebookId?.trim() || undefined,
      notebookName: body.notebookName?.trim() || undefined,
      sceneId: body.sceneId?.trim() || undefined,
      sceneTitle,
      sceneOrder:
        typeof body.sceneOrder === 'number' && Number.isFinite(body.sceneOrder)
          ? Math.max(1, Math.round(body.sceneOrder))
          : undefined,
      sceneType: 'slide',
      operationCode: 'slide_repair_math',
      chargeReason: '修复当前数学页面',
    },
  );
}
