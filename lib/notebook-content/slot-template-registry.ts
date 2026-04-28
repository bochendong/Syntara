import type {
  NotebookContentBlock,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
} from './schema';

export type SlotTemplateSlotSpec = {
  slotId: string;
  maxBlocks: number;
  maxWeight: number;
  allowedBlockTypes?: readonly NotebookContentBlock['type'][];
  preserve?: boolean;
};

export type SlotTemplateSpec = {
  template: NotebookContentLayoutTemplate;
  family: NotebookContentLayoutFamily;
  slots: readonly SlotTemplateSlotSpec[];
  maxBlocks: number;
  maxTotalWeight: number;
  minFontSize: number;
  canPaginate: boolean;
};

const TEXT_BLOCKS = [
  'heading',
  'paragraph',
  'bullet_list',
  'definition',
  'theorem',
  'callout',
] as const;
const MATH_BLOCKS = ['equation', 'matrix', 'derivation_steps', 'example', ...TEXT_BLOCKS] as const;
const FLOW_BLOCKS = ['process_flow', 'example', 'bullet_list', 'callout', ...TEXT_BLOCKS] as const;
const VISUAL_BLOCKS = ['visual'] as const;
const CODE_BLOCKS = [
  'code_block',
  'code_walkthrough',
  'callout',
  'bullet_list',
  'paragraph',
] as const;
const TABLE_BLOCKS = ['table', 'bullet_list', 'callout', 'paragraph'] as const;

function slot(
  slotId: string,
  maxBlocks: number,
  maxWeight: number,
  allowedBlockTypes?: readonly NotebookContentBlock['type'][],
  preserve = false,
): SlotTemplateSlotSpec {
  return { slotId, maxBlocks, maxWeight, allowedBlockTypes, preserve };
}

export const SLOT_TEMPLATE_REGISTRY: Record<NotebookContentLayoutTemplate, SlotTemplateSpec> = {
  cover_hero: {
    template: 'cover_hero',
    family: 'cover',
    slots: [
      slot('subtitle', 1, 260, TEXT_BLOCKS),
      slot('roadmap', 1, 360, FLOW_BLOCKS),
      slot('visual', 1, 1, VISUAL_BLOCKS),
    ],
    maxBlocks: 3,
    maxTotalWeight: 620,
    minFontSize: 15,
    canPaginate: false,
  },
  section_divider: {
    template: 'section_divider',
    family: 'section',
    slots: [slot('summary', 2, 360, TEXT_BLOCKS), slot('agenda', 1, 420, FLOW_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 620,
    minFontSize: 15,
    canPaginate: false,
  },
  title_content: {
    template: 'title_content',
    family: 'concept_cards',
    slots: [slot('main', 1, 420), slot('support', 3, 520), slot('takeaway', 1, 220, TEXT_BLOCKS)],
    maxBlocks: 5,
    maxTotalWeight: 980,
    minFontSize: 14,
    canPaginate: true,
  },
  two_column: {
    template: 'two_column',
    family: 'concept_cards',
    slots: [slot('left', 2, 460), slot('right', 2, 460)],
    maxBlocks: 4,
    maxTotalWeight: 900,
    minFontSize: 14,
    canPaginate: true,
  },
  three_cards: {
    template: 'three_cards',
    family: 'concept_cards',
    slots: [slot('card_1', 1, 280), slot('card_2', 1, 280), slot('card_3', 1, 280)],
    maxBlocks: 3,
    maxTotalWeight: 780,
    minFontSize: 13,
    canPaginate: true,
  },
  four_grid: {
    template: 'four_grid',
    family: 'concept_cards',
    slots: [
      slot('card_1', 1, 220),
      slot('card_2', 1, 220),
      slot('card_3', 1, 220),
      slot('card_4', 1, 220),
    ],
    maxBlocks: 4,
    maxTotalWeight: 820,
    minFontSize: 13,
    canPaginate: true,
  },
  visual_left: {
    template: 'visual_left',
    family: 'visual_split',
    slots: [slot('visual', 1, 1, VISUAL_BLOCKS), slot('main', 2, 460), slot('support', 2, 360)],
    maxBlocks: 5,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: true,
  },
  visual_right: {
    template: 'visual_right',
    family: 'visual_split',
    slots: [slot('main', 2, 460), slot('support', 2, 360), slot('visual', 1, 1, VISUAL_BLOCKS)],
    maxBlocks: 5,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: true,
  },
  comparison_matrix: {
    template: 'comparison_matrix',
    family: 'comparison',
    slots: [
      slot('matrix', 1, 760, TABLE_BLOCKS),
      slot('left', 1, 280),
      slot('right', 1, 280),
      slot('takeaway', 1, 220, TEXT_BLOCKS),
    ],
    maxBlocks: 4,
    maxTotalWeight: 940,
    minFontSize: 13,
    canPaginate: true,
  },
  timeline_road: {
    template: 'timeline_road',
    family: 'timeline',
    slots: [slot('context', 1, 260, TEXT_BLOCKS), slot('steps', 1, 720, FLOW_BLOCKS, true)],
    maxBlocks: 2,
    maxTotalWeight: 840,
    minFontSize: 13,
    canPaginate: true,
  },
  problem_focus: {
    template: 'problem_focus',
    family: 'problem_statement',
    slots: [
      slot('problem', 1, 760, ['paragraph', 'example'], true),
      slot('givens', 1, 360, ['bullet_list', 'paragraph']),
      slot('goal', 1, 260, TEXT_BLOCKS),
      slot('visual', 1, 1, VISUAL_BLOCKS),
    ],
    maxBlocks: 4,
    maxTotalWeight: 960,
    minFontSize: 15,
    canPaginate: true,
  },
  steps_sidebar: {
    template: 'steps_sidebar',
    family: 'timeline',
    slots: [slot('main', 1, 420), slot('steps', 1, 680, FLOW_BLOCKS, true)],
    maxBlocks: 2,
    maxTotalWeight: 820,
    minFontSize: 13,
    canPaginate: true,
  },
  code_split: {
    template: 'code_split',
    family: 'code_walkthrough',
    slots: [slot('code', 1, 780, CODE_BLOCKS, true), slot('walkthrough', 1, 620, CODE_BLOCKS)],
    maxBlocks: 2,
    maxTotalWeight: 980,
    minFontSize: 12,
    canPaginate: true,
  },
  formula_focus: {
    template: 'formula_focus',
    family: 'formula_focus',
    slots: [slot('formula', 1, 520, MATH_BLOCKS, true), slot('explanation', 3, 520, TEXT_BLOCKS)],
    maxBlocks: 4,
    maxTotalWeight: 860,
    minFontSize: 14,
    canPaginate: true,
  },
  summary_board: {
    template: 'summary_board',
    family: 'summary',
    slots: [slot('takeaways', 1, 520, TEXT_BLOCKS), slot('checklist', 1, 520, TEXT_BLOCKS)],
    maxBlocks: 2,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: false,
  },
  definition_board: {
    template: 'definition_board',
    family: 'concept_cards',
    slots: [
      slot('definition', 1, 520, MATH_BLOCKS, true),
      slot('conditions', 1, 460, TEXT_BLOCKS),
      slot('confusion', 1, 260, TEXT_BLOCKS),
    ],
    maxBlocks: 3,
    maxTotalWeight: 860,
    minFontSize: 14,
    canPaginate: true,
  },
  concept_map: {
    template: 'concept_map',
    family: 'concept_cards',
    slots: [slot('core', 1, 380), slot('relations', 1, 520, FLOW_BLOCKS), slot('examples', 1, 360)],
    maxBlocks: 3,
    maxTotalWeight: 820,
    minFontSize: 13,
    canPaginate: true,
  },
  two_column_explain: {
    template: 'two_column_explain',
    family: 'concept_cards',
    slots: [slot('explain', 2, 500), slot('example', 2, 500)],
    maxBlocks: 4,
    maxTotalWeight: 900,
    minFontSize: 14,
    canPaginate: true,
  },
  process_steps: {
    template: 'process_steps',
    family: 'timeline',
    slots: [
      slot('context', 1, 260),
      slot('steps', 1, 720, FLOW_BLOCKS, true),
      slot('summary', 1, 220),
    ],
    maxBlocks: 3,
    maxTotalWeight: 900,
    minFontSize: 13,
    canPaginate: true,
  },
  problem_walkthrough: {
    template: 'problem_walkthrough',
    family: 'problem_statement',
    slots: [
      slot('problem', 1, 760, ['paragraph', 'example'], true),
      slot('givens', 1, 340, ['bullet_list', 'paragraph']),
      slot('plan', 1, 420, FLOW_BLOCKS),
      slot('conclusion', 1, 260, TEXT_BLOCKS),
    ],
    maxBlocks: 4,
    maxTotalWeight: 980,
    minFontSize: 15,
    canPaginate: true,
  },
  derivation_ladder: {
    template: 'derivation_ladder',
    family: 'derivation',
    slots: [
      slot('setup', 1, 280, TEXT_BLOCKS),
      slot('derivation', 1, 840, MATH_BLOCKS, true),
      slot('conclusion', 1, 280, TEXT_BLOCKS),
    ],
    maxBlocks: 3,
    maxTotalWeight: 980,
    minFontSize: 14,
    canPaginate: true,
  },
  graph_explain: {
    template: 'graph_explain',
    family: 'visual_split',
    slots: [
      slot('graph', 1, 1, VISUAL_BLOCKS),
      slot('explanation', 2, 520),
      slot('takeaway', 1, 240),
    ],
    maxBlocks: 4,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: true,
  },
  data_insight: {
    template: 'data_insight',
    family: 'comparison',
    slots: [slot('data', 1, 740, TABLE_BLOCKS), slot('insight', 1, 360), slot('evidence', 1, 360)],
    maxBlocks: 3,
    maxTotalWeight: 920,
    minFontSize: 13,
    canPaginate: true,
  },
  thesis_evidence: {
    template: 'thesis_evidence',
    family: 'visual_split',
    slots: [slot('thesis', 1, 420, TEXT_BLOCKS, true), slot('evidence', 2, 620, TEXT_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: true,
  },
  quote_analysis: {
    template: 'quote_analysis',
    family: 'visual_split',
    slots: [slot('quote', 1, 520, TEXT_BLOCKS, true), slot('analysis', 2, 620, TEXT_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 860,
    minFontSize: 14,
    canPaginate: true,
  },
  source_close_reading: {
    template: 'source_close_reading',
    family: 'visual_split',
    slots: [slot('source', 1, 560, TEXT_BLOCKS, true), slot('observations', 2, 620, TEXT_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 880,
    minFontSize: 14,
    canPaginate: true,
  },
  case_analysis: {
    template: 'case_analysis',
    family: 'visual_split',
    slots: [slot('case', 1, 520, TEXT_BLOCKS, true), slot('lens', 2, 620, TEXT_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 860,
    minFontSize: 14,
    canPaginate: true,
  },
  argument_map: {
    template: 'argument_map',
    family: 'comparison',
    slots: [slot('claim', 1, 380, TEXT_BLOCKS, true), slot('reasons', 2, 620, TEXT_BLOCKS)],
    maxBlocks: 3,
    maxTotalWeight: 820,
    minFontSize: 14,
    canPaginate: true,
  },
  compare_perspectives: {
    template: 'compare_perspectives',
    family: 'comparison',
    slots: [
      slot('perspective_a', 1, 360, TEXT_BLOCKS, true),
      slot('perspective_b', 1, 360, TEXT_BLOCKS, true),
      slot('comparison', 1, 420, TABLE_BLOCKS),
    ],
    maxBlocks: 3,
    maxTotalWeight: 880,
    minFontSize: 14,
    canPaginate: true,
  },
};

export function getSlotTemplateSpec(
  template: NotebookContentLayoutTemplate,
): SlotTemplateSpec | undefined {
  return SLOT_TEMPLATE_REGISTRY[template];
}

export function getSlotOrder(spec: SlotTemplateSpec, slotId: string): number {
  const index = spec.slots.findIndex((slot) => slot.slotId === slotId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}
