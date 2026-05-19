import type { SceneLayoutIntent } from '@/lib/types/generation';

export function layoutFamilyForTemplate(
  template: NonNullable<SceneLayoutIntent['layoutTemplate']>,
): NonNullable<SceneLayoutIntent['layoutFamily']> {
  switch (template) {
    case 'cover_hero':
    case 'image_title_overlay':
    case 'cinematic_title_frame':
    case 'tech_hero_title':
      return 'cover';
    case 'pipeline_table':
    case 'comparison_matrix':
      return 'comparison';
    case 'process_steps':
      return 'timeline';
    case 'visual_three_steps':
    case 'text_image_split':
    case 'two_text_image':
      return 'visual_split';
    case 'two_by_one_summary':
      return 'summary';
    case 'code_split':
      return 'code_walkthrough';
    case 'derivation_ladder':
    case 'steps_sidebar':
    case 'problem_walkthrough':
      return 'derivation';
    case 'formula_focus':
      return 'formula_focus';
    case 'definition_board':
    case 'concept_map':
    case 'two_column_explain':
      return 'concept_cards';
    case 'three_cards':
    case 'four_columns':
    case 'grid_2x2':
      return 'concept_cards';
    default:
      return 'concept_cards';
  }
}
