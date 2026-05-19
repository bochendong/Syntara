import type { SceneLayoutIntent, SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics } from '@/lib/types/stage';

export const QA_STAGE_ID = 'single-page-generation-quality';

export const LAYOUT_OPTIONS = [
  {
    value: 'image_title_overlay',
    label: 'image_title_overlay',
    hint: '图片铺满 + 左侧标题遮罩，适合杂志/自然/课程导入封面。',
  },
  {
    value: 'cinematic_title_frame',
    label: 'cinematic_title_frame',
    hint: '电影感暗色图片 + 居中标题 + 角标，适合影像/文学/艺术主题。',
  },
  {
    value: 'tech_hero_title',
    label: 'tech_hero_title',
    hint: '暗色科技背景 + 居中标题，适合 SaaS/AI/产品发布封面。',
  },
  {
    value: 'pipeline_table',
    label: 'pipeline_table',
    hint: '上方流程 + 下方对照表，适合讲“从问题到结论”。',
  },
  {
    value: 'comparison_matrix',
    label: 'comparison_matrix',
    hint: '对照表/矩阵为主，适合方案、维度、优缺点或证据比较。',
  },
  {
    value: 'process_steps',
    label: 'process_steps',
    hint: '流程图/步骤图为主，适合讲路径、阶段、决策或工作流。',
  },
  {
    value: 'visual_three_steps',
    label: 'visual_three_steps',
    hint: '解释 + 图示 + 三步卡片，适合讲判断顺序。',
  },
  {
    value: 'two_by_one_summary',
    label: 'two_by_one_summary',
    hint: '上方两栏 + 底部总结，适合收束与优缺点。',
  },
  {
    value: 'three_cards',
    label: 'three_cards',
    hint: '三张并列概念卡，适合讲清 3 个并列概念或判断维度。',
  },
  {
    value: 'text_image_split',
    label: 'text_image_split',
    hint: '左侧文本 + 右侧图片，适合用一个图支撑一个核心判断。',
  },
  {
    value: 'four_columns',
    label: 'four_columns',
    hint: '四栏并列，适合 4 个阶段、类别、原则或误区。',
  },
  {
    value: 'grid_2x2',
    label: 'grid_2x2',
    hint: '2x2 网格，适合四象限、两组对比或 4 个分组概念。',
  },
  {
    value: 'two_text_image',
    label: 'two_text_image',
    hint: '左侧上下两块文本 + 右侧图片，适合“问题/规则”或“先看/再看”。',
  },
  {
    value: 'code_split',
    label: 'code_split',
    hint: '代码 + 追踪说明，适合讲 __init__、self、状态变化。',
  },
] as const;

export const DECK_STYLE_OPTIONS = [
  { value: 'classic_business', label: 'Classic Business' },
  { value: 'academic', label: 'Academic' },
  { value: 'tech_saas', label: 'Tech / SaaS' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'dark_art', label: 'Dark Art' },
  { value: 'nature_documentary', label: 'Nature Documentary' },
] as const;

export type LayoutOptionValue = (typeof LAYOUT_OPTIONS)[number]['value'];
export type DeckStyleValue = (typeof DECK_STYLE_OPTIONS)[number]['value'];
export type QualityStatus = 'pass' | 'warn' | 'fail';
export type TestListStatus = QualityStatus | 'pending' | 'error';
export type TestStatusFilter = 'all' | TestListStatus;

export const TEST_LIST_PAGE_SIZE = 8;

export interface QualityPreset {
  id: string;
  label: string;
  description: string;
  title: string;
  outlineDescription: string;
  keyPoints: string[];
  language?: 'zh-CN' | 'en-US';
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  contentProfile: NonNullable<SceneOutline['contentProfile']>;
  archetype: NonNullable<SceneOutline['archetype']>;
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
  teachingFlow: NonNullable<SceneLayoutIntent['teachingFlow']>;
  visualRole: NonNullable<SceneLayoutIntent['visualRole']>;
  overflowPolicy?: NonNullable<SceneLayoutIntent['overflowPolicy']>;
  preserveFullProblemStatement?: boolean;
  teachingRole: NonNullable<SceneOutline['teachingRole']>;
  teachingObjective: string;
  openingMove: string;
  concreteAnchor: string;
  studentThinkingMove: string;
  transferRule: string;
  requiredComponentKinds: NonNullable<SceneOutline['requiredComponentKinds']>;
  expectedAnchors: string[];
  mediaGenerations?: SceneOutline['mediaGenerations'];
  workedExampleConfig?: SceneOutline['workedExampleConfig'];
  sharedExamples?: SceneOutline['sharedExamples'];
  usesExampleIds?: SceneOutline['usesExampleIds'];
  continuity?: SceneOutline['continuity'];
}

export interface QualityCheck {
  status: QualityStatus;
  label: string;
  detail: string;
}

export interface SceneContentResponse {
  success?: boolean;
  error?: string;
  details?: string;
  content?: unknown;
  contents?: unknown[];
  effectiveOutline?: SceneOutline;
  effectiveOutlines?: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
}

export interface PromptPreviewResponse {
  success?: boolean;
  error?: string;
  details?: string;
  promptId?: string;
  slideGenerationRoute?: string;
  templateDriven?: boolean;
  effectiveOutline?: SceneOutline;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  promptVariables?: Record<string, string>;
  mediaContextText?: string;
  visionImageCount?: number;
}

export interface GenerationResult {
  scene: Scene;
  outline: SceneOutline;
  rawResponse: SceneContentResponse;
  generatedContentCount: number;
  createdAt: number;
}

export interface PromptPreviewResult {
  response: PromptPreviewResponse;
  createdAt: number;
}

export interface GenerationErrorResult {
  message: string;
  details?: string;
  diagnostics?: SceneGenerationDiagnostics;
  rawDetails?: unknown;
  httpStatus?: number;
  createdAt: number;
}

export interface PresetInputState {
  title: string;
  outlineDescription: string;
  keyPointsText: string;
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  language: 'zh-CN' | 'en-US';
  updatedAt?: number;
}

export type GenerationResultsByPreset = Partial<Record<string, GenerationResult>>;
export type PromptPreviewsByPreset = Partial<Record<string, PromptPreviewResult>>;
export type ErrorsByPreset = Partial<Record<string, GenerationErrorResult>>;
export type PresetInputsByPreset = Partial<Record<string, PresetInputState>>;

export interface GenerationQualitySavedState {
  selectedPresetId?: string;
  inputsByPreset?: PresetInputsByPreset;
  resultsByPreset?: GenerationResultsByPreset;
  errorsByPreset?: ErrorsByPreset;
  promptPreviewErrorsByPreset?: ErrorsByPreset;
}
