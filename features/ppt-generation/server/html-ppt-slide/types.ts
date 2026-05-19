import type {
  HtmlLessonPlanContract,
  HtmlSlidePlanContract,
} from '@/features/ppt-generation/html-slide-contracts';

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

export type RequestBody = {
  prompt?: string;
  lessonPlan?: HtmlLessonPlanContract;
  slidePlan?: HtmlSlidePlanContract;
  pageKind?: string;
  codeRoute?: HtmlCodeRoute;
  courseRoute?: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  densityContract?: string;
  qualityFeedback?: string;
  canvasMode?: 'slide' | 'tall' | 'long';
  canvasHeight?: number;
  imageAsset?: {
    src?: string;
    alt?: string;
    description?: string;
    aspectRatio?: string;
  };
  assignedSourceImages?: SourceImageAsset[];
  sourceImageMapping?: Record<string, string>;
  retryReason?: string;
};

export type SourceImageAsset = {
  id?: string;
  src?: string;
  pageNumber?: number;
  description?: string;
  width?: number;
  height?: number;
};

export type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

export type HtmlRetryReason = {
  code: string;
  title: string;
  details: string[];
};

export type SourceImageUsage = {
  assignedIds: string[];
  usedIds: string[];
  missingIds: string[];
  inventedIds: string[];
};
