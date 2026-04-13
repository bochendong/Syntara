import { z } from 'zod';

export const notebookContentLanguageSchema = z.enum(['zh-CN', 'en-US']);
export const notebookContentProfileSchema = z.enum(['general', 'math', 'code']);
export const notebookContentLayoutModeSchema = z.enum(['stack', 'grid']);
export const notebookContentPatternSchema = z.enum([
  'auto',
  'multi_column_cards',
  'flow_horizontal',
  'flow_vertical',
  'symmetric_split',
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
export const notebookContentContinuationSchema = z.object({
  rootOutlineId: z.string().trim().min(1).max(200),
  partNumber: z.number().int().min(2).max(99),
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
  columns: z.enum([z.literal(2), z.literal(3), z.literal(4)]).default(3),
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
]);
export const notebookContentBlockSchema = z.intersection(
  notebookContentBlockBaseSchema,
  notebookContentBlockPresentationSchema,
);

export const notebookContentDocumentSchema = z.object({
  version: z.literal(1).default(1),
  language: notebookContentLanguageSchema.default('zh-CN'),
  profile: notebookContentProfileSchema.default('general'),
  layout: notebookContentLayoutSchema.default({ mode: 'stack' }),
  pattern: notebookContentPatternSchema.optional(),
  archetype: notebookSlideArchetypeSchema.default('concept'),
  continuation: notebookContentContinuationSchema.optional(),
  title: z.string().trim().max(300).optional(),
  titleTextColor: z.string().trim().max(40).optional(),
  titleBackgroundColor: z.string().trim().max(40).optional(),
  titleBorderColor: z.string().trim().max(40).optional(),
  blocks: z.array(notebookContentBlockSchema).min(1).max(64),
});

export type NotebookContentLanguage = z.infer<typeof notebookContentLanguageSchema>;
export type NotebookContentProfile = z.infer<typeof notebookContentProfileSchema>;
export type NotebookContentLayoutMode = z.infer<typeof notebookContentLayoutModeSchema>;
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
export type NotebookContentBlock = z.infer<typeof notebookContentBlockSchema>;
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

export function parseNotebookContentDocument(input: unknown): NotebookContentDocument | null {
  const parsed = notebookContentDocumentSchema.safeParse(input);
  if (!parsed.success) return null;
  const sanitized = sanitizeNotebookContentValue(parsed.data);
  const reparsed = notebookContentDocumentSchema.safeParse(sanitized);
  return reparsed.success ? reparsed.data : null;
}
