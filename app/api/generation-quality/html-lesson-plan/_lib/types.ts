export type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
export type PageCountTierInput = PageCountTier | 'under-5' | 'under-10' | 'under-20' | 'over-20';
export type HtmlPageKind =
  | 'cover'
  | 'intro'
  | 'summary'
  | 'process'
  | 'table'
  | 'math'
  | 'code'
  | 'example';
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

export type SourcePageInput = {
  sourceIndex?: number;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  concreteAnchor?: string;
  suggestedPageKind?: string;
  sourceLabel?: string;
  imageIds?: string[];
};

export type SourceImageInput = {
  id?: string;
  src?: string;
  pageNumber?: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
};

export type SourcePackageInput = {
  fileName?: string;
  fileType?: string;
  subject?: string;
  sourceText?: string;
  sourcePages?: SourcePageInput[];
  sourceImages?: SourceImageInput[];
  imageMapping?: Record<string, string>;
  pageCount?: number;
  parser?: string;
  warnings?: string[];
};

export type RequestBody = {
  mode?: 'lesson' | 'notebook';
  planningStage?: 'course-spine' | 'full';
  fixtureId?: string;
  fileName?: string;
  fileType?: string;
  subject?: string;
  sourceFileCount?: number;
  title?: string;
  description?: string;
  sourceTextLength?: number;
  pageCountTier?: PageCountTierInput;
  pageBudgetTier?: PageCountTierInput;
  imageUsePolicy?: 'prefer-source-images' | 'text-first';
  sourcePages?: SourcePageInput[];
  sourcePackage?: SourcePackageInput;
  coursePlanSeed?: unknown;
  courseSpineSeed?: unknown;
};

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

export type PlanningQualityIssue = {
  code: string;
  title: string;
  severity: 'error' | 'warning';
  details: string[];
};

export type PlanningQualityReport = {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  issues: PlanningQualityIssue[];
  summary: string;
};

export type LessonSlidePlan = {
  id: string;
  order: number;
  title: string;
  pageKind: HtmlPageKind;
  canvasMode: HtmlCanvasMode;
  canvasHeight: number;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  objective: string;
  learnerQuestion: string;
  keyPoints: string[];
  sourceCoverage: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
  densityTarget: DensityLevel;
  sourceUsage: 'direct' | 'adapted' | 'new-example' | 'synthesis';
  sourceUseRationale: string;
  continuity: SlideContinuity;
  contentBudget: {
    visibleCharsMin: number;
    visibleCharsMax: number;
    mainRegions: number;
    blockCount: number;
    mustDeleteIfCrowded: string[];
  };
  htmlPrompt: string;
};

export type CoursePlan = {
  targetLearner: string;
  courseGoal: string;
  narrativeArc: string[];
  prerequisiteAssumptions: string[];
  coreQuestions: string[];
  sourceDigest: string[];
  pacingStrategy: string;
};

export type CourseSpineAct = {
  id: string;
  act: 'setup' | 'development' | 'turn' | 'synthesis';
  title: string;
  purpose: string;
  pages: number[];
  keyQuestion: string;
  visualMotif: string;
};

export type CourseSpine = {
  logline: string;
  openingHook: string;
  centralQuestion: string;
  acts: CourseSpineAct[];
  recurringExample: string;
  visualMotif: string;
  closingCallback: string;
};

export type SlideContinuity = {
  actId: string;
  rhetoricalRole: 'opening' | 'setup' | 'build' | 'turn' | 'example' | 'synthesis' | 'callback';
  fromPrevious: string;
  pageMove: string;
  toNext: string;
  callbackToSpine: string;
};

export type SlideTeachingOutline = {
  id: string;
  order: number;
  title: string;
  canvasMode?: HtmlCanvasMode;
  canvasHeight?: number;
  learnerQuestion: string;
  teachingObjective: string;
  keyPoints: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  sourceUseRationale: string;
  continuity: SlideContinuity;
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
};

export type LessonPlan = {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  coursePlan: CoursePlan;
  courseSpine: CourseSpine;
  slideOutlines: SlideTeachingOutline[];
  planningNotes: string[];
  slides: LessonSlidePlan[];
};

export const PAGE_KIND_SET = new Set<HtmlPageKind>([
  'cover',
  'intro',
  'summary',
  'process',
  'table',
  'math',
  'code',
  'example',
]);
export const DENSITY_SET = new Set<DensityLevel>(['light', 'standard', 'dense']);
export const COURSE_ROUTE_SET = new Set<HtmlCourseRoute>([
  'general',
  'math',
  'computer-science',
  'science',
  'business',
  'humanities',
  'social-science',
]);
export const CS_ROUTE_SET = new Set<HtmlCsRoute>([
  'standard',
  'execution-trace',
  'memory-diagram',
  'call-stack',
  'pointer-diagram',
  'tree-diagram',
  'graph-trace',
  'linear-structure',
  'dictionary-diagram',
  'invariant-check',
  'composite-operation',
]);
export const MATH_ROUTE_SET = new Set<HtmlMathRoute>([
  'standard',
  'definition-theorem',
  'formula-focus',
  'derivation',
  'proof',
  'worked-example',
  'concept-map',
  'comparison-table',
]);
export const SOURCE_USAGE_SET = new Set<LessonSlidePlan['sourceUsage']>([
  'direct',
  'adapted',
  'new-example',
  'synthesis',
]);
