import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import type { SceneOutline } from '@/lib/types/generation';

export const LEGACY_STORAGE_KEY = 'syntara:html-openmaic-lesson-generation-test:v5';
export const TEST_RESULT_ID = 'html-openmaic-lesson-v5';
export const TEST_RESULT_KEY = 'state';
export const HTML_LESSON_MODEL = 'gpt-5.4';
export const RESULT_RENDER_VERSION = 'html-openmaic-lesson-v5';
export const IMAGE_ASSET_TOKEN = '__SYNTARA_GENERATED_SLIDE_IMAGE_ASSET__';
export const HTML_IMAGE_SLOT_ATTR = 'data-syntara-ai-image-slot';
export const HTML_SLIDE_GENERATION_CONCURRENCY = 3;

export type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
export type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
export type InferredHtmlPageKind = HtmlPageKind | 'auto';
export type HtmlCodeRoute = 'execution-trace' | 'memory-trace';
export type HtmlCsRoute =
  | 'standard'
  | 'execution-trace'
  | 'memory-diagram'
  | 'call-stack'
  | 'pointer-diagram'
  | 'tree-diagram'
  | 'graph-trace'
  | 'linear-structure'
  | 'dictionary-diagram'
  | 'invariant-check'
  | 'composite-operation';
export type HtmlMathRoute =
  | 'standard'
  | 'definition-theorem'
  | 'formula-focus'
  | 'derivation'
  | 'proof'
  | 'worked-example'
  | 'concept-map'
  | 'comparison-table';
export type HtmlCourseRoute =
  | 'general'
  | 'math'
  | 'computer-science'
  | 'science'
  | 'business'
  | 'humanities'
  | 'social-science';
export type DensityLevel = 'light' | 'standard' | 'dense';
export type HtmlCanvasMode = 'slide' | 'tall' | 'long';

export interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx';
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
}

export interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
}

export interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

export interface HtmlCostEstimate {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
}

export interface LessonSlidePlan {
  id: string;
  order: number;
  title: string;
  pageKind: HtmlPageKind;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  objective: string;
  sourceCoverage: string[];
  sourceUsage: 'direct' | 'adapted' | 'new-example' | 'synthesis';
  contentBudget: {
    visibleCharsMin: number;
    visibleCharsMax: number;
    mainRegions: number;
    blockCount: number;
    mustDeleteIfCrowded: string[];
  };
  htmlPrompt: string;
}

export interface LessonPlan {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  planningNotes: string[];
  slides: LessonSlidePlan[];
}

export interface LessonPlanResponse {
  success?: boolean;
  plan?: LessonPlan;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

export interface HtmlRetryReason {
  code?: string;
  title: string;
  details?: string[];
}

export interface GenerateHtmlPptResponse {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

export interface GenerateSlideImageResponse {
  success?: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
}

export interface HtmlImageAsset {
  sourceType: 'pending' | 'url' | 'indexeddb';
  url?: string;
  storageId?: string;
  mimeType?: string;
  size?: number;
  providerId: ImageProviderId;
  providerName: string;
  modelId: string;
  prompt: string;
  width?: number;
  height?: number;
  estimatedCostLabel?: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
}

export interface LessonRunTiming {
  mode: 'whole-lesson' | 'missing-slides';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  planningDurationMs?: number;
  slideDurationMs: number;
  generatedSlideCount: number;
  failedSlideCount: number;
  totalSlideCount: number;
  concurrency?: number;
}

export interface LessonPlanResult {
  plan: LessonPlan;
  fixtureId: string;
  pageCountTier: PageCountTier;
  signature: string;
  rawResponse: LessonPlanResponse;
  planningDurationMs?: number;
  lastRun?: LessonRunTiming;
  createdAt: number;
}

export interface HtmlSlideResult {
  html: string;
  slide: LessonSlidePlan;
  prompt: string;
  planSignature: string;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  rawResponse: GenerateHtmlPptResponse;
  imageAsset?: HtmlImageAsset | null;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
  durationMs?: number;
  createdAt: number;
}

export interface GenerationErrorResult {
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

export interface SavedState {
  selectedFixtureId?: string;
  selectedTier?: PageCountTier;
  selectedSlideIdByPlan?: Record<string, string>;
  plansByKey?: Record<string, LessonPlanResult>;
  htmlBySlide?: Record<string, HtmlSlideResult>;
  errorsBySlide?: Record<string, GenerationErrorResult>;
  planErrorsByKey?: Record<string, GenerationErrorResult>;
}

export interface PreviewStats {
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
  clippedCount: number;
  clippedSamples: string[];
  textNodeCount: number;
  visibleCharCount: number;
  mathCount: number;
  tableCount: number;
  preCount: number;
}

export const TIER_OPTIONS: Array<{
  value: PageCountTier;
  label: string;
  detail: string;
}> = [
  { value: 'under5', label: '5 页以下', detail: '4-5 页，极简导入/概览' },
  { value: 'under10', label: '10 页以下', detail: '7-10 页，标准微课' },
  { value: 'under20', label: '20 页以下', detail: '14-20 页，完整小节' },
  { value: 'over20', label: '20 页以上', detail: '21-24 页，测试上限 24' },
];
