import { z } from 'zod';

export const notebookContentLanguageSchema = z.enum(['zh-CN', 'en-US']);
export const notebookContentProfileSchema = z.enum(['general', 'math', 'code']);
export const notebookContentDisciplineStyleSchema = z.enum([
  'general',
  'math',
  'science',
  'code',
  'humanities',
  'social_science',
]);
export const notebookContentTeachingFlowSchema = z.enum([
  'standalone',
  'concept_explain',
  'definition_to_example',
  'problem_walkthrough',
  'proof_walkthrough',
  'code_walkthrough',
  'argument_evidence',
  'close_reading',
  'case_analysis',
  'comparison_review',
  'timeline_story',
  'practice_check',
]);
export const notebookContentLayoutModeSchema = z.enum(['stack', 'grid']);
export const notebookContentLayoutFamilySchema = z.enum([
  'cover',
  'section',
  'concept_cards',
  'visual_split',
  'comparison',
  'timeline',
  'problem_statement',
  'problem_solution',
  'derivation',
  'code_walkthrough',
  'formula_focus',
  'summary',
]);
export const notebookContentLayoutTemplateSchema = z.enum([
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
export const notebookContentDensitySchema = z.enum(['light', 'standard', 'dense']);
export const notebookContentVisualRoleSchema = z.enum([
  'none',
  'source_image',
  'generated_image',
  'diagram',
]);
export const notebookContentOverflowPolicySchema = z.enum([
  'compress_first',
  'preserve_then_paginate',
]);
export const notebookContentPatternSchema = z.enum([
  'auto',
  'multi_column_cards',
  'flow_horizontal',
  'flow_vertical',
  'symmetric_split',
  'cover_hero',
  'section_band',
  'visual_split',
  'timeline',
  'comparison_table',
  'problem_solution',
  'code_split',
  'formula_focus',
  'quote_takeaway',
]);
export const notebookSlideArchetypeSchema = z.enum([
  'intro',
  'concept',
  'definition',
  'example',
  'bridge',
  'summary',
]);
export const notebookContentStackLayoutSchema = z.object({
  mode: z.literal('stack'),
});
export const notebookContentGridLayoutSchema = z.object({
  mode: z.literal('grid'),
  columns: z.number().int().min(1).max(3).default(2),
  rows: z.number().int().min(1).max(3).optional(),
});
export const notebookContentLayoutSchema = z.discriminatedUnion('mode', [
  notebookContentStackLayoutSchema,
  notebookContentGridLayoutSchema,
]);
export const notebookContentTextTemplateSchema = z.enum([
  'plain',
  'infoCard',
  'successCard',
  'warningCard',
  'accentCard',
]);
export const notebookContentTitleToneSchema = z.enum(['accent', 'neutral', 'inverse']);
export const notebookContentBlockPlacementSchema = z.object({
  order: z.number().int().min(0).max(63).optional(),
  row: z.number().int().min(1).max(3).optional(),
  col: z.number().int().min(1).max(3).optional(),
  rowSpan: z.number().int().min(1).max(3).optional(),
  colSpan: z.number().int().min(1).max(3).optional(),
});
export const notebookContentBlockPresentationSchema = z.object({
  templateId: notebookContentTextTemplateSchema.optional(),
  placement: notebookContentBlockPlacementSchema.optional(),
  cardTitle: z.string().trim().max(200).optional(),
  titleTone: notebookContentTitleToneSchema.optional(),
  textColor: z.string().trim().max(40).optional(),
  backgroundColor: z.string().trim().max(40).optional(),
  borderColor: z.string().trim().max(40).optional(),
  noteTextColor: z.string().trim().max(40).optional(),
  noteBackgroundColor: z.string().trim().max(40).optional(),
  noteBorderColor: z.string().trim().max(40).optional(),
});
export const notebookContentVisualSlotSchema = z.object({
  source: z.string().trim().min(1).max(2_000_000),
  alt: z.string().trim().max(500).optional(),
  caption: z.string().trim().max(500).optional(),
  role: notebookContentVisualRoleSchema.default('diagram'),
  fit: z.enum(['contain', 'cover']).default('contain'),
  emphasis: z.enum(['primary', 'supporting']).default('supporting'),
});
export const notebookContentContinuationSchema = z.object({
  rootOutlineId: z.string().trim().min(1).max(200),
  partNumber: z.number().int().min(1).max(99),
  totalParts: z.number().int().min(2).max(99),
});

export const notebookContentHeadingBlockSchema = z.object({
  type: z.literal('heading'),
  level: z.number().int().min(1).max(4).default(2),
  text: z.string().trim().min(1).max(400),
});

export const notebookContentParagraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string().trim().min(1).max(6000),
});

export const notebookContentBulletListBlockSchema = z.object({
  type: z.literal('bullet_list'),
  items: z.array(z.string().trim().min(1).max(1000)).min(1).max(16),
});

export const notebookContentEquationBlockSchema = z.object({
  type: z.literal('equation'),
  latex: z.string().trim().min(1).max(4000),
  display: z.boolean().default(true),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentMatrixBlockSchema = z.object({
  type: z.literal('matrix'),
  rows: z
    .array(z.array(z.string().trim().min(1).max(300)).min(1).max(10))
    .min(1)
    .max(10),
  brackets: z
    .enum(['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix'])
    .default('bmatrix'),
  label: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentDerivationStepSchema = z.object({
  expression: z.string().trim().min(1).max(4000),
  format: z.enum(['latex', 'text', 'chem']).default('latex'),
  explanation: z.string().trim().max(1000).optional(),
});

export const notebookContentDerivationBlockSchema = z.object({
  type: z.literal('derivation_steps'),
  title: z.string().trim().max(300).optional(),
  steps: z.array(notebookContentDerivationStepSchema).min(1).max(16),
});

export const notebookContentCodeBlockSchema = z.object({
  type: z.literal('code_block'),
  language: z.string().trim().min(1).max(64).default('text'),
  code: z.string().min(1).max(20000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentCodeWalkthroughStepSchema = z.object({
  title: z.string().trim().max(200).optional(),
  focus: z.string().trim().max(200).optional(),
  explanation: z.string().trim().min(1).max(1200),
});

export const notebookContentCodeWalkthroughBlockSchema = z.object({
  type: z.literal('code_walkthrough'),
  title: z.string().trim().max(200).optional(),
  language: z.string().trim().min(1).max(64).default('text'),
  code: z.string().min(1).max(20000),
  caption: z.string().trim().max(300).optional(),
  steps: z.array(notebookContentCodeWalkthroughStepSchema).min(1).max(12),
  output: z.string().trim().max(4000).optional(),
});

export const notebookContentTableBlockSchema = z.object({
  type: z.literal('table'),
  caption: z.string().trim().max(300).optional(),
  headers: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
  rows: z
    .array(z.array(z.string().trim().max(2000)).min(1).max(12))
    .min(1)
    .max(24),
});

export const notebookContentCalloutBlockSchema = z.object({
  type: z.literal('callout'),
  tone: z.enum(['info', 'success', 'warning', 'danger', 'tip']).default('info'),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
});

export const notebookContentDefinitionBlockSchema = z.object({
  type: z.literal('definition'),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
});

export const notebookContentTheoremBlockSchema = z.object({
  type: z.literal('theorem'),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
  proofIdea: z.string().trim().max(1200).optional(),
});

export const notebookContentExampleBlockSchema = z.object({
  type: z.literal('example'),
  title: z.string().trim().max(200).optional(),
  problem: z.string().trim().min(1).max(6000),
  givens: z.array(z.string().trim().min(1).max(1000)).max(12).default([]),
  goal: z.string().trim().max(1000).optional(),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(16),
  answer: z.string().trim().max(2000).optional(),
  pitfalls: z.array(z.string().trim().min(1).max(1000)).max(12).default([]),
});

export const notebookContentProcessFlowContextItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(1200),
  tone: z.enum(['neutral', 'info', 'warning', 'success']).default('neutral'),
});

export const notebookContentProcessFlowStepSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(1200),
  note: z.string().trim().max(400).optional(),
});

export const notebookContentProcessFlowBlockSchema = z.object({
  type: z.literal('process_flow'),
  title: z.string().trim().max(200).optional(),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  context: z.array(notebookContentProcessFlowContextItemSchema).max(4).default([]),
  steps: z.array(notebookContentProcessFlowStepSchema).min(2).max(20),
  summary: z.string().trim().max(1000).optional(),
});

export const notebookContentLayoutCardsItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(2000),
  tone: z.enum(['neutral', 'info', 'warning', 'success']).default('neutral'),
});

export const notebookContentLayoutCardsBlockSchema = z.object({
  type: z.literal('layout_cards'),
  title: z.string().trim().max(200).optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  items: z.array(notebookContentLayoutCardsItemSchema).min(1).max(4),
});

export const notebookContentChemFormulaBlockSchema = z.object({
  type: z.literal('chem_formula'),
  formula: z.string().trim().min(1).max(2000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentChemEquationBlockSchema = z.object({
  type: z.literal('chem_equation'),
  equation: z.string().trim().min(1).max(4000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentVisualBlockSchema = notebookContentVisualSlotSchema.extend({
  type: z.literal('visual'),
  title: z.string().trim().max(200).optional(),
});

const notebookContentBlockBaseSchema = z.discriminatedUnion('type', [
  notebookContentHeadingBlockSchema,
  notebookContentParagraphBlockSchema,
  notebookContentBulletListBlockSchema,
  notebookContentEquationBlockSchema,
  notebookContentMatrixBlockSchema,
  notebookContentDerivationBlockSchema,
  notebookContentCodeBlockSchema,
  notebookContentCodeWalkthroughBlockSchema,
  notebookContentTableBlockSchema,
  notebookContentCalloutBlockSchema,
  notebookContentDefinitionBlockSchema,
  notebookContentTheoremBlockSchema,
  notebookContentExampleBlockSchema,
  notebookContentProcessFlowBlockSchema,
  notebookContentLayoutCardsBlockSchema,
  notebookContentChemFormulaBlockSchema,
  notebookContentChemEquationBlockSchema,
  notebookContentVisualBlockSchema,
]);
export const notebookContentBlockSchema = z.intersection(
  notebookContentBlockBaseSchema,
  notebookContentBlockPresentationSchema,
);

export const notebookContentSlotSchema = z.object({
  slotId: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/),
  role: z.string().trim().max(120).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  preserve: z.boolean().default(false),
  blocks: z.array(notebookContentBlockBaseSchema).min(1).max(8),
});

function materializeSlotBlocks(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;

  const record = input as Record<string, unknown>;
  const slots = Array.isArray(record.slots) ? record.slots : [];
  if (slots.length === 0) return input;

  const hasExplicitVersion = typeof record.version === 'number';
  const hasBlocks = Array.isArray(record.blocks) && record.blocks.length > 0;
  const blocks = hasBlocks
    ? record.blocks
    : slots.flatMap((slot) =>
        slot && typeof slot === 'object' && Array.isArray((slot as { blocks?: unknown }).blocks)
          ? ((slot as { blocks: unknown[] }).blocks ?? [])
          : [],
      );

  return {
    ...record,
    version: hasExplicitVersion ? record.version : 2,
    blocks,
  };
}

const notebookContentDocumentBaseSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]).default(1),
    language: notebookContentLanguageSchema.default('zh-CN'),
    profile: notebookContentProfileSchema.default('general'),
    disciplineStyle: notebookContentDisciplineStyleSchema.default('general'),
    teachingFlow: notebookContentTeachingFlowSchema.default('standalone'),
    layout: notebookContentLayoutSchema.default({ mode: 'stack' }),
    layoutFamily: notebookContentLayoutFamilySchema.optional(),
    layoutTemplate: notebookContentLayoutTemplateSchema.optional(),
    density: notebookContentDensitySchema.default('standard'),
    visualRole: notebookContentVisualRoleSchema.default('none'),
    overflowPolicy: notebookContentOverflowPolicySchema.default('compress_first'),
    preserveFullProblemStatement: z.boolean().default(false),
    visualSlot: notebookContentVisualSlotSchema.optional(),
    pattern: notebookContentPatternSchema.optional(),
    archetype: notebookSlideArchetypeSchema.default('concept'),
    continuation: notebookContentContinuationSchema.optional(),
    title: z.string().trim().max(300).optional(),
    titleTextColor: z.string().trim().max(40).optional(),
    titleBackgroundColor: z.string().trim().max(40).optional(),
    titleBorderColor: z.string().trim().max(40).optional(),
    slots: z.array(notebookContentSlotSchema).min(1).max(16).optional(),
    blocks: z.array(notebookContentBlockSchema).min(1).max(64),
  })
  .superRefine((document, ctx) => {
    if (document.version !== 2) return;

    if (!document.layoutTemplate) {
      ctx.addIssue({
        code: 'custom',
        path: ['layoutTemplate'],
        message: 'Slot-only semantic documents require layoutTemplate.',
      });
    }

    if (!document.slots || document.slots.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['slots'],
        message: 'Slot-only semantic documents require at least one slot.',
      });
    }

    document.blocks.forEach((block, index) => {
      const presentation = block as { placement?: unknown; templateId?: unknown };
      if (presentation.placement || presentation.templateId) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index],
          message:
            'Slot-only semantic blocks must not include block-level placement/template hints.',
        });
      }
    });
  });

export const notebookContentDocumentSchema = z.preprocess(
  materializeSlotBlocks,
  notebookContentDocumentBaseSchema,
);

export type NotebookContentLanguage = z.infer<typeof notebookContentLanguageSchema>;
export type NotebookContentProfile = z.infer<typeof notebookContentProfileSchema>;
export type NotebookContentDisciplineStyle = z.infer<typeof notebookContentDisciplineStyleSchema>;
export type NotebookContentTeachingFlow = z.infer<typeof notebookContentTeachingFlowSchema>;
export type NotebookContentLayoutMode = z.infer<typeof notebookContentLayoutModeSchema>;
export type NotebookContentLayoutFamily = z.infer<typeof notebookContentLayoutFamilySchema>;
export type NotebookContentLayoutTemplate = z.infer<typeof notebookContentLayoutTemplateSchema>;
export type NotebookContentDensity = z.infer<typeof notebookContentDensitySchema>;
export type NotebookContentVisualRole = z.infer<typeof notebookContentVisualRoleSchema>;
export type NotebookContentOverflowPolicy = z.infer<typeof notebookContentOverflowPolicySchema>;
export type NotebookContentPattern = z.infer<typeof notebookContentPatternSchema>;
export type NotebookContentStackLayout = z.infer<typeof notebookContentStackLayoutSchema>;
export type NotebookContentGridLayout = z.infer<typeof notebookContentGridLayoutSchema>;
export type NotebookContentLayout = z.infer<typeof notebookContentLayoutSchema>;
export type NotebookContentTextTemplate = z.infer<typeof notebookContentTextTemplateSchema>;
export type NotebookContentTitleTone = z.infer<typeof notebookContentTitleToneSchema>;
export type NotebookContentBlockPlacement = z.infer<typeof notebookContentBlockPlacementSchema>;
export type NotebookSlideArchetype = z.infer<typeof notebookSlideArchetypeSchema>;
export type NotebookContentContinuation = z.infer<typeof notebookContentContinuationSchema>;
export type NotebookContentHeadingBlock = z.infer<typeof notebookContentHeadingBlockSchema>;
export type NotebookContentParagraphBlock = z.infer<typeof notebookContentParagraphBlockSchema>;
export type NotebookContentBulletListBlock = z.infer<typeof notebookContentBulletListBlockSchema>;
export type NotebookContentEquationBlock = z.infer<typeof notebookContentEquationBlockSchema>;
export type NotebookContentMatrixBlock = z.infer<typeof notebookContentMatrixBlockSchema>;
export type NotebookContentDerivationBlock = z.infer<typeof notebookContentDerivationBlockSchema>;
export type NotebookContentCodeBlock = z.infer<typeof notebookContentCodeBlockSchema>;
export type NotebookContentCodeWalkthroughBlock = z.infer<
  typeof notebookContentCodeWalkthroughBlockSchema
>;
export type NotebookContentTableBlock = z.infer<typeof notebookContentTableBlockSchema>;
export type NotebookContentCalloutBlock = z.infer<typeof notebookContentCalloutBlockSchema>;
export type NotebookContentDefinitionBlock = z.infer<typeof notebookContentDefinitionBlockSchema>;
export type NotebookContentTheoremBlock = z.infer<typeof notebookContentTheoremBlockSchema>;
export type NotebookContentExampleBlock = z.infer<typeof notebookContentExampleBlockSchema>;
export type NotebookContentProcessFlowContextItem = z.infer<
  typeof notebookContentProcessFlowContextItemSchema
>;
export type NotebookContentProcessFlowStep = z.infer<typeof notebookContentProcessFlowStepSchema>;
export type NotebookContentProcessFlowBlock = z.infer<typeof notebookContentProcessFlowBlockSchema>;
export type NotebookContentLayoutCardsItem = z.infer<typeof notebookContentLayoutCardsItemSchema>;
export type NotebookContentLayoutCardsBlock = z.infer<typeof notebookContentLayoutCardsBlockSchema>;
export type NotebookContentChemFormulaBlock = z.infer<typeof notebookContentChemFormulaBlockSchema>;
export type NotebookContentChemEquationBlock = z.infer<
  typeof notebookContentChemEquationBlockSchema
>;
export type NotebookContentVisualSlot = z.infer<typeof notebookContentVisualSlotSchema>;
export type NotebookContentVisualBlock = z.infer<typeof notebookContentVisualBlockSchema>;
export type NotebookContentBlock = z.infer<typeof notebookContentBlockSchema>;
export type NotebookContentSlot = z.infer<typeof notebookContentSlotSchema>;
export type NotebookContentDocument = z.infer<typeof notebookContentDocumentSchema>;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeSemanticText(input: string): string {
  if (!input) return input;
  const hasLikelyHtml = /<(span|div|p|strong|em|b|i|u|ul|ol|li|br|math|mrow|mi|mo|mn)\b/i.test(
    input,
  );
  const hasKatex = /katex/i.test(input);
  if (!hasLikelyHtml && !hasKatex) return input;
  return decodeHtmlEntities(stripHtmlTags(input))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sanitizeNotebookContentValue(value: unknown): unknown {
  if (typeof value === 'string') return normalizeSemanticText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeNotebookContentValue(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, child]) => {
      // Keep source code blocks unchanged except for optional caption/title fields.
      if (key === 'code' && typeof child === 'string') {
        out[key] = child;
        return;
      }
      out[key] = sanitizeNotebookContentValue(child);
    });
    return out;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSlotOnlyDocumentInput(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return input.version === 2 || Array.isArray(input.slots);
}

const SLOT_ONLY_FORBIDDEN_KEYS = new Set([
  'left',
  'top',
  'width',
  'height',
  'html',
  'elements',
  'placement',
  'templateId',
  'layout',
  'pattern',
]);

function findForbiddenSlotOnlyKey(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenSlotOnlyKey(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const [key, child] of Object.entries(value)) {
    if (SLOT_ONLY_FORBIDDEN_KEYS.has(key)) return [...path, key].join('.');
    const found = findForbiddenSlotOnlyKey(child, [...path, key]);
    if (found) return found;
  }

  return null;
}

export function parseNotebookContentDocument(input: unknown): NotebookContentDocument | null {
  if (isSlotOnlyDocumentInput(input) && findForbiddenSlotOnlyKey(input)) {
    return null;
  }

  const parsed = notebookContentDocumentSchema.safeParse(input);
  if (!parsed.success) return null;
  const sanitized = sanitizeNotebookContentValue(parsed.data);
  const reparsed = notebookContentDocumentSchema.safeParse(sanitized);
  return reparsed.success ? reparsed.data : null;
}
