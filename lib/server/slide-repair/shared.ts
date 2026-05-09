import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  compileSyntaraMarkupToNotebookDocument,
  extractSyntaraMarkup,
  parseNotebookContentDocument,
  type NotebookContentDocument,
  type NotebookContentProfile,
} from '@/lib/notebook-content';
import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type { SlideContent } from '@/lib/types/stage';
import type { SlideRepairConversationTurn } from '@/lib/types/slide-repair';
import type {
  PPTElement,
  PPTLatexElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
} from '@/lib/types/slides';

export type SlideRepairLanguage = 'zh-CN' | 'en-US';

export type RepairRequestBody = {
  notebookId?: string;
  notebookName?: string;
  sceneId?: string;
  sceneOrder?: number;
  sceneTitle?: string;
  language?: SlideRepairLanguage;
  content?: SlideContent;
  repairInstructions?: string;
  repairConversation?: SlideRepairConversationTurn[];
};

export type RepairResponsePayload = {
  sceneTitle?: string;
  document?: unknown;
  assistantReply?: string;
};

export type SlideRepairTextSummaryItem = {
  id: string;
  type: 'text';
  name: string;
  text: string;
  textType?: string;
};

export type SlideRepairShapeTextSummaryItem = {
  id: string;
  type: 'shape_text';
  name: string;
  text: string;
};

export type SlideRepairLatexSummaryItem = {
  id: string;
  type: 'latex';
  name: string;
  latex: string;
};

export type SlideRepairTableSummaryItem = {
  id: string;
  type: 'table';
  name: string;
  rows: string[][];
};

export type SlideRepairSummaryItem =
  | SlideRepairTextSummaryItem
  | SlideRepairShapeTextSummaryItem
  | SlideRepairLatexSummaryItem
  | SlideRepairTableSummaryItem;

export function splitMeaningfulLines(text: string, mode: 'trim' | 'trimEnd' = 'trim'): string[] {
  return text
    .split('\n')
    .map((line) => (mode === 'trimEnd' ? line.trimEnd() : line.trim()))
    .filter((line) => line.trim().length > 0);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim();
}

function summarizeTextElement(element: PPTTextElement): SlideRepairTextSummaryItem {
  return {
    id: element.id,
    type: 'text',
    name: element.name || '',
    textType: element.textType || '',
    text: htmlToPlainText(element.content).slice(0, 3000),
  };
}

function summarizeShapeText(element: PPTShapeElement): SlideRepairShapeTextSummaryItem {
  const text = element.text?.content ? htmlToPlainText(element.text.content) : '';
  return {
    id: element.id,
    type: 'shape_text',
    name: element.name || '',
    text: text.slice(0, 3000),
  };
}

function summarizeLatexElement(element: PPTLatexElement): SlideRepairLatexSummaryItem {
  return {
    id: element.id,
    type: 'latex',
    name: element.name || '',
    latex: element.latex,
  };
}

function summarizeTableElement(element: PPTTableElement): SlideRepairTableSummaryItem {
  return {
    id: element.id,
    type: 'table',
    name: element.name || '',
    rows: element.data
      .slice(0, 16)
      .map((row) => row.slice(0, 12).map((cell) => cell.text.trim().slice(0, 500))),
  };
}

export function summarizeElements(elements: PPTElement[]): SlideRepairSummaryItem[] {
  return elements
    .slice()
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .flatMap<SlideRepairSummaryItem>((element) => {
      if (element.type === 'text') return [summarizeTextElement(element)];
      if (element.type === 'latex') return [summarizeLatexElement(element)];
      if (element.type === 'table') return [summarizeTableElement(element)];
      if (element.type === 'shape' && element.text?.content?.trim()) {
        return [summarizeShapeText(element)];
      }
      return [];
    })
    .filter((item) => {
      if (item.type === 'latex') return Boolean(item.latex.trim());
      if (item.type === 'table') return item.rows.some((row) => row.some((cell) => cell.trim()));
      return Boolean(item.text.trim());
    });
}

export function looksLikeCodeSnippet(text: string): boolean {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return false;
  if (/```/.test(normalized)) return true;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;

  let signalCount = 0;
  for (const line of lines.slice(0, 12)) {
    if (
      /\b(function|const|let|var|return|def|class|public|private|if|else|elif|for|while|switch|case|try|catch|import|from|print|console\.log|async|await)\b|=>|[{};]|^\s*#include\b|^\s*SELECT\b/i.test(
        line,
      )
    ) {
      signalCount += 1;
    }
  }

  return signalCount >= 2;
}

export function estimateDocumentSignal(doc: NotebookContentDocument): number {
  return doc.blocks.reduce((sum, block) => {
    switch (block.type) {
      case 'heading':
        return sum + block.text.length;
      case 'paragraph':
        return sum + block.text.length;
      case 'bullet_list':
        return sum + block.items.join('').length;
      case 'equation':
        return sum + block.latex.length + (block.caption?.length || 0);
      case 'matrix':
        return (
          sum +
          (block.label?.length || 0) +
          (block.caption?.length || 0) +
          block.rows.flat().join('').length
        );
      case 'derivation_steps':
        return (
          sum +
          (block.title?.length || 0) +
          block.steps.reduce(
            (inner, step) => inner + step.expression.length + (step.explanation?.length || 0),
            0,
          )
        );
      case 'code_block':
        return sum + block.code.length + (block.caption?.length || 0);
      case 'code_walkthrough':
        return (
          sum +
          block.code.length +
          (block.title?.length || 0) +
          (block.caption?.length || 0) +
          (block.output?.length || 0) +
          block.steps.reduce(
            (inner, step) =>
              inner +
              (step.title?.length || 0) +
              (step.focus?.length || 0) +
              step.explanation.length,
            0,
          )
        );
      case 'code_trace':
        return (
          sum +
          block.code.length +
          (block.title?.length || 0) +
          (block.output?.length || 0) +
          block.steps.reduce(
            (inner, step) =>
              inner +
              step.explanation.length +
              step.state.reduce(
                (stateSum, state) => stateSum + state.name.length + state.value.length,
                0,
              ),
            0,
          )
        );
      case 'state_table':
        return (
          sum +
          (block.title?.length || 0) +
          block.columns.join('').length +
          block.rows.flat().join('').length +
          (block.caption?.length || 0)
        );
      case 'call_stack':
        return (
          sum +
          (block.title?.length || 0) +
          block.frames.reduce(
            (inner, frame) =>
              inner +
              frame.name.length +
              frame.args.reduce(
                (argSum, item) => argSum + item.name.length + item.value.length,
                0,
              ) +
              frame.locals.reduce(
                (localSum, item) => localSum + item.name.length + item.value.length,
                0,
              ) +
              (frame.returnValue?.length || 0) +
              (frame.note?.length || 0),
            0,
          )
        );
      case 'memory_diagram':
        return (
          sum +
          (block.title?.length || 0) +
          block.stack.reduce(
            (inner, item) => inner + item.name.length + item.value.length + (item.ref?.length || 0),
            0,
          ) +
          block.heap.reduce(
            (inner, item) =>
              inner +
              item.id.length +
              item.label.length +
              item.fields.reduce(
                (fieldSum, field) => fieldSum + field.name.length + field.value.length,
                0,
              ),
            0,
          )
        );
      case 'pointer_diagram':
        return (
          sum +
          (block.title?.length || 0) +
          (block.operation?.length || 0) +
          block.nodes.reduce((inner, node) => inner + node.id.length + node.label.length, 0) +
          block.pointers.reduce(
            (inner, pointer) => inner + pointer.name.length + (pointer.to?.length || 0),
            0,
          )
        );
      case 'tree_diagram':
        return (
          sum +
          (block.title?.length || 0) +
          (block.target?.length || 0) +
          (block.decision?.length || 0) +
          block.nodes.reduce(
            (inner, node) =>
              inner +
              node.id.length +
              node.label.length +
              (node.left?.length || 0) +
              (node.right?.length || 0),
            0,
          ) +
          (block.invariant?.length || 0)
        );
      case 'graph_trace':
        return (
          sum +
          (block.title?.length || 0) +
          block.algorithm.length +
          block.nodes.reduce((inner, node) => inner + node.id.length + node.label.length, 0) +
          block.edges.reduce(
            (inner, edge) => inner + edge.from.length + edge.to.length + (edge.label?.length || 0),
            0,
          ) +
          block.steps.reduce(
            (inner, step) =>
              inner +
              (step.title?.length || 0) +
              (step.explanation?.length || 0) +
              step.frontier.join('').length +
              step.visited.join('').length,
            0,
          )
        );
      case 'invariant_panel':
        return (
          sum +
          (block.title?.length || 0) +
          (block.structure?.length || 0) +
          block.invariant.length +
          block.checks.reduce(
            (inner, check) =>
              inner +
              check.label.length +
              check.text.length +
              check.status.length +
              (check.reason?.length || 0),
            0,
          ) +
          (block.caption?.length || 0)
        );
      case 'table':
        return (
          sum +
          (block.caption?.length || 0) +
          (block.headers?.join('').length || 0) +
          block.rows.flat().join('').length
        );
      case 'callout':
        return sum + (block.title?.length || 0) + block.text.length;
      case 'example':
        return (
          sum +
          (block.title?.length || 0) +
          block.problem.length +
          block.givens.join('').length +
          (block.goal?.length || 0) +
          block.steps.join('').length +
          (block.answer?.length || 0) +
          block.pitfalls.join('').length
        );
      case 'chem_formula':
        return sum + block.formula.length + (block.caption?.length || 0);
      case 'chem_equation':
        return sum + block.equation.length + (block.caption?.length || 0);
      default:
        return sum;
    }
  }, 0);
}

export function normalizeCompactText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

export function countSuspiciousPlaceholderBlocks(
  doc: NotebookContentDocument,
  placeholderKeywords: string[],
): number {
  const normalizedKeywords = new Set(
    placeholderKeywords.map((keyword) =>
      normalizeCompactText(keyword)
        .replace(/[：:]+$/g, '')
        .toLowerCase(),
    ),
  );

  let suspicious = 0;
  for (let i = 0; i < doc.blocks.length; i += 1) {
    const block = doc.blocks[i];
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'callout') {
      continue;
    }

    const text =
      block.type === 'heading' ? block.text : block.type === 'paragraph' ? block.text : block.text;
    const normalized = normalizeCompactText(text)
      .replace(/[：:]+$/g, '')
      .toLowerCase();
    if (!normalizedKeywords.has(normalized)) continue;

    const next = doc.blocks[i + 1];
    const nextLooksSubstantive = Boolean(
      next &&
      ((next.type === 'paragraph' && normalizeCompactText(next.text).length >= 12) ||
        (next.type === 'bullet_list' && next.items.join('').trim().length >= 12) ||
        next.type === 'equation' ||
        next.type === 'matrix' ||
        next.type === 'derivation_steps' ||
        next.type === 'example' ||
        next.type === 'table' ||
        next.type === 'code_block' ||
        next.type === 'code_walkthrough' ||
        next.type === 'code_trace' ||
        next.type === 'state_table' ||
        next.type === 'call_stack' ||
        next.type === 'memory_diagram' ||
        next.type === 'pointer_diagram' ||
        next.type === 'tree_diagram' ||
        next.type === 'graph_trace' ||
        next.type === 'chem_formula' ||
        next.type === 'chem_equation' ||
        next.type === 'callout'),
    );

    if (!nextLooksSubstantive) suspicious += 1;
  }

  return suspicious;
}

function summarizeBlockForComparison(block: NotebookContentDocument['blocks'][number]): string[] {
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
    case 'code_trace':
      return [
        block.title || '',
        block.code,
        ...block.steps.flatMap((step) => [
          step.explanation,
          ...step.state.flatMap((item) => [item.name, item.value]),
        ]),
        block.output || '',
      ];
    case 'state_table':
      return [block.title || '', ...block.columns, ...block.rows.flat(), block.caption || ''];
    case 'call_stack':
      return [
        block.title || '',
        ...block.frames.flatMap((frame) => [
          frame.name,
          ...frame.args.flatMap((item) => [item.name, item.value]),
          ...frame.locals.flatMap((item) => [item.name, item.value]),
          frame.returnValue || '',
          frame.note || '',
        ]),
      ];
    case 'memory_diagram':
      return [
        block.title || '',
        ...block.stack.flatMap((item) => [item.name, item.value, item.ref || '']),
        ...block.heap.flatMap((item) => [
          item.id,
          item.label,
          ...item.fields.flatMap((field) => [field.name, field.value]),
        ]),
        ...block.links.flatMap((link) => [link.from, link.to, link.label || '']),
      ];
    case 'pointer_diagram':
      return [
        block.title || '',
        block.operation || '',
        block.kind || '',
        ...block.nodes.flatMap((node) => [
          node.id,
          node.label,
          ...node.fields.flatMap((field) => [field.name, field.value]),
        ]),
        ...block.pointers.flatMap((pointer) => [pointer.name, pointer.to || 'None']),
        ...block.links.flatMap((link) => [link.from, link.to, link.label || '']),
      ];
    case 'tree_diagram':
      return [
        block.title || '',
        block.kind || '',
        block.target || '',
        block.decision || '',
        ...block.nodes.flatMap((node) => [node.id, node.label, node.left || '', node.right || '']),
        block.invariant || '',
        block.caption || '',
      ];
    case 'graph_trace':
      return [
        block.title || '',
        block.algorithm,
        block.startId || '',
        ...block.nodes.flatMap((node) => [node.id, node.label]),
        ...block.edges.flatMap((edge) => [edge.from, edge.to, edge.label || '']),
        ...block.steps.flatMap((step) => [
          step.title || '',
          step.action || '',
          step.current || '',
          ...step.frontier,
          ...step.visited,
          ...step.order,
          step.explanation || '',
          step.result || '',
        ]),
        block.invariant || '',
        block.caption || '',
      ];
    case 'invariant_panel':
      return [
        block.title || '',
        block.structure || '',
        block.invariant,
        ...block.checks.flatMap((check) => [
          check.label,
          check.text,
          check.status,
          check.reason || '',
        ]),
        block.caption || '',
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

export function getDocumentComparableSegments(doc: NotebookContentDocument): string[] {
  return doc.blocks
    .flatMap((block) => summarizeBlockForComparison(block))
    .map((text) => normalizeCompactText(text))
    .filter((text) => text.length > 0);
}

export function computeSegmentReuseRatio(source: string[], repaired: string[]): number {
  if (source.length === 0 && repaired.length === 0) return 1;
  if (source.length === 0 || repaired.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const segment of source) {
    counts.set(segment, (counts.get(segment) || 0) + 1);
  }

  let shared = 0;
  for (const segment of repaired) {
    const current = counts.get(segment) || 0;
    if (current <= 0) continue;
    shared += 1;
    counts.set(segment, current - 1);
  }

  return shared / Math.max(source.length, repaired.length);
}

export function normalizeRepairConversation(
  conversation: SlideRepairConversationTurn[] | undefined,
): SlideRepairConversationTurn[] {
  if (!Array.isArray(conversation)) return [];
  return conversation
    .map((turn) => ({
      role: (turn?.role === 'assistant'
        ? 'assistant'
        : 'user') as SlideRepairConversationTurn['role'],
      content: typeof turn?.content === 'string' ? turn.content.trim() : '',
    }))
    .filter((turn) => turn.content.length > 0)
    .slice(-8);
}

const CJK_TEXT_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function repairOutputHasUnexpectedCjk(
  value: unknown,
  language: SlideRepairLanguage,
): boolean {
  if (language !== 'en-US') return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return CJK_TEXT_REGEX.test(text);
}

function collectSyntaraTextCandidates(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const directKeys = ['syntaraMarkup', 'markup', 'source', 'content', 'text'];
  const direct = directKeys.flatMap((key) => collectSyntaraTextCandidates(record[key], depth + 1));
  const nested = ['document', 'scene', 'slide'].flatMap((key) =>
    collectSyntaraTextCandidates(record[key], depth + 1),
  );
  return [...direct, ...nested];
}

function extractRepairSyntaraMarkup(value: unknown): string | null {
  const candidates = collectSyntaraTextCandidates(value);
  for (const candidate of candidates) {
    const variants = [
      candidate,
      candidate.replace(/\\n/g, '\n'),
      candidate.replace(/\\\\/g, '\\').replace(/\\n/g, '\n'),
    ];
    for (const variant of variants) {
      const markup = extractSyntaraMarkup(variant);
      if (markup) return markup;
    }
  }
  return null;
}

export async function runSlideRepairAttempt(args: {
  req: NextRequest;
  system: string;
  prompt: string;
  usageTag: string;
  fallbackTitle?: string;
  fallbackLanguage?: SlideRepairLanguage;
}) {
  const { model, modelInfo, modelString } = await resolveModelFromHeaders(args.req);

  const result = await callLLM(
    {
      model,
      system: args.system,
      prompt: args.prompt,
      maxOutputTokens: modelInfo?.outputWindow,
    },
    args.usageTag,
  );

  const parsed = parseJsonResponse<RepairResponsePayload>(result.text);
  if (!parsed) {
    const syntaraMarkup = extractRepairSyntaraMarkup(result.text);
    const syntaraDocument = syntaraMarkup
      ? compileSyntaraMarkupToNotebookDocument(syntaraMarkup, {
          title: args.fallbackTitle,
          language: args.fallbackLanguage,
        })
      : null;
    if (syntaraDocument) {
      return {
        modelString,
        parsed: {
          sceneTitle: syntaraDocument.title || args.fallbackTitle,
          assistantReply: '',
          document: syntaraDocument,
        } satisfies RepairResponsePayload,
        document: syntaraDocument,
      };
    }

    throw new Error('Failed to parse repaired slide response');
  }

  const document = parseNotebookContentDocument(parsed.document);
  if (!document) {
    const syntaraMarkup =
      extractRepairSyntaraMarkup(parsed.document) ||
      extractRepairSyntaraMarkup(parsed) ||
      extractRepairSyntaraMarkup(result.text);
    const syntaraDocument = syntaraMarkup
      ? compileSyntaraMarkupToNotebookDocument(syntaraMarkup, {
          title: parsed.sceneTitle || args.fallbackTitle,
          language: args.fallbackLanguage,
        })
      : null;
    if (syntaraDocument) {
      return {
        modelString,
        parsed: {
          ...parsed,
          sceneTitle: parsed.sceneTitle || syntaraDocument.title || args.fallbackTitle,
          document: syntaraDocument,
        },
        document: syntaraDocument,
      };
    }
    throw new Error('Model did not return a valid notebook content document');
  }

  return {
    modelString,
    parsed,
    document,
  };
}

export function buildRenderedRepairContent(args: {
  content: SlideContent;
  document: NotebookContentDocument;
  profile: NotebookContentProfile;
  sceneTitle: string;
}): SlideContent {
  const normalizedDocument: NotebookContentDocument = {
    ...args.document,
    profile: args.profile,
    title: args.document.title || args.sceneTitle,
  };
  const renderedContent = renderSemanticSlideContent({
    document: normalizedDocument,
    fallbackTitle: args.sceneTitle,
    preserveCanvasId: args.content.canvas.id,
  });

  return renderedContent;
}
