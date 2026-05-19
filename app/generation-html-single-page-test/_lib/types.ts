import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';

export const STORAGE_KEY = 'syntara:generation-quality-html:v3';
export const HTML_SINGLE_PAGE_MODEL = 'gpt-5.4';
export const IMAGE_ASSET_TOKEN = '__SYNTARA_GENERATED_SLIDE_IMAGE_ASSET__';
export const HTML_IMAGE_SLOT_ATTR = 'data-syntara-ai-image-slot';
export const DEFAULT_SLIDE_HEIGHT = 900;
export const DEFAULT_LONG_PAGE_HEIGHT = 2200;

export type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
export type HtmlCanvasMode = 'slide' | 'long';
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
export type DensityLevel = 'light' | 'medium' | 'dense' | 'long';
export type QualityStatus = 'pass' | 'warn' | 'fail';

export type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

export type HtmlCostEstimate = {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
};

export type HtmlRetryReason = {
  code?: string;
  title: string;
  details?: string[];
};

export type GenerateHtmlPptResponse = {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  error?: string;
};

export type GenerateSlideImageResponse = {
  success?: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
};

export type HtmlImageAsset = {
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
};

export type HtmlSinglePagePreset = {
  id: string;
  kind: HtmlPageKind;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  codeRoute?: HtmlCodeRoute;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  label: string;
  version: number;
  description: string;
  prompt: string;
  requiredSignal: string;
  densityProfile: DensityProfile;
  requiredAnchors: string[];
  forbiddenAnchors?: string[];
};

export type DensityProfile = {
  level: DensityLevel;
  label: string;
  textChars: { min: number; max: number };
  textBlocks: { min: number; max: number };
  contentCoverage: { min: number; max: number };
  smallTextThresholdPx: 20 | 22 | 24;
  maxSmallTextRatio: number;
  guidance: string;
};

export type StoredRun = {
  id: string;
  presetId: string;
  pageKind: HtmlPageKind;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  codeRoute?: HtmlCodeRoute;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  label: string;
  createdAt: number;
  presetSignature?: string;
  prompt: string;
  model?: string;
  html: string;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  imageAsset?: HtmlImageAsset | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  quality?: StoredQuality;
};

export type StoredError = {
  presetId: string;
  pageKind: HtmlPageKind;
  label: string;
  createdAt: number;
  prompt: string;
  message: string;
};

export type StoredState = {
  selectedPresetId?: string;
  promptByPreset?: Record<string, string>;
  runsByPreset?: Record<string, StoredRun>;
  errorsByPreset?: Record<string, StoredError>;
  history?: StoredRun[];
  errors?: StoredError[];
};

export type PreviewStats = {
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
  headingCount: number;
  tableCount: number;
  tableRowCount: number;
  mathCount: number;
  mspaceCount: number;
  preCount: number;
  codeCount: number;
  listItemCount: number;
  cardishCount: number;
  stepishCount: number;
  textNodeCount: number;
  visibleCharCount: number;
  maxTextLength: number;
  imageCount: number;
  largeImageCount: number;
  contentCoverageRatio: number;
  sparseLargeContainerCount: number;
  sparseLargeContainerSamples: string[];
  smallTextRatioUnder20: number;
  smallTextRatioUnder22: number;
  smallTextRatioUnder24: number;
  visibleText: string;
  scriptLikeCount: number;
  preOverflowCount: number;
};

export type QualityCheck = {
  status: QualityStatus;
  label: string;
  detail: string;
};

export type StoredQuality = {
  failed: number;
  warned: number;
  passed: number;
  total: number;
  outOfBoundsCount: number;
  mathCount: number;
  scrollWidth: number;
  scrollHeight: number;
  checkedAt: number;
};
