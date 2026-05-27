import type { SceneOutline } from '@/lib/types/generation';

export const HTML_PIPELINE_MODEL = 'gpt-5.4';
export const TEST_RESULT_ID = 'html-pipeline';
export const PIPELINE_RESULT_CONTRACT_VERSION = 'split-course-plan-v3';
export const COURSE_PLAN_REQUEST_TIMEOUT_MS = 300_000;
export const STRUCTURED_PLAN_REQUEST_TIMEOUT_MS = 300_000;
export const HTML_SLIDE_GENERATION_CONCURRENCY = 4;
export const HTML_SLIDE_REQUEST_TIMEOUT_MS = 210_000;
export const LECTURE_ACTION_REQUEST_TIMEOUT_MS = 90_000;

export type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type PipelineStepState = 'locked' | 'ready' | 'running' | 'pass' | 'warn' | 'fail';
export type PipelineStepId =
  | 'source'
  | 'course-plan'
  | 'slide-outlines'
  | 'route-contract'
  | 'html-prompts'
  | 'cover-page'
  | 'html-pages'
  | 'lecture-actions'
  | 'lecture-positioning';

export interface SourcePackagePage {
  sourceIndex: number;
  title: string;
  summary: string;
  rawText?: string;
  keyPoints: string[];
  concreteAnchor: string;
  sourceLabel: string;
  suggestedPageKind: string;
  imageIds?: string[];
}

export interface SourcePackageImage {
  id: string;
  src?: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

export interface SourcePackageImageStats {
  rawCount: number;
  keptCount: number;
  filteredSmallCount: number;
  filteredLargeCount: number;
  filteredLimitCount: number;
  dedupedCount?: number;
}

export interface SourcePackage {
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  sourceText: string;
  sourcePages: SourcePackagePage[];
  sourceImages: SourcePackageImage[];
  imageMapping?: Record<string, string>;
  imageStats?: SourcePackageImageStats;
  pageCount: number;
  parser?: string;
  warnings?: string[];
}

export interface TestfileFixture {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  fileCount?: number;
  sourceFiles?: Array<{
    id: string;
    fileName: string;
    fileType: 'md' | 'pdf' | 'pptx';
    title: string;
    sourceTextLength: number;
    pageCount: number;
  }>;
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
  sourcePackage?: SourcePackage;
}

export interface FixturesResponse {
  success?: boolean;
  error?: string;
  details?: string;
  fixtures?: TestfileFixture[];
  notebooks?: TestfileFixture[];
}

export interface CoursePlan {
  targetLearner: string;
  courseGoal: string;
  narrativeArc: string[];
  prerequisiteAssumptions: string[];
  coreQuestions: string[];
  sourceDigest: string[];
  pacingStrategy: string;
}

export interface CourseSpineAct {
  id: string;
  act: 'setup' | 'development' | 'turn' | 'synthesis';
  title: string;
  purpose: string;
  pages: number[];
  keyQuestion: string;
  visualMotif: string;
}

export interface CourseSpine {
  logline: string;
  openingHook: string;
  centralQuestion: string;
  acts: CourseSpineAct[];
  recurringExample: string;
  visualMotif: string;
  closingCallback: string;
}

export interface SlideContinuity {
  actId: string;
  rhetoricalRole: 'opening' | 'setup' | 'build' | 'turn' | 'example' | 'synthesis' | 'callback';
  fromPrevious: string;
  pageMove: string;
  toNext: string;
  callbackToSpine: string;
}

export interface SlideTeachingOutline {
  id: string;
  order: number;
  title: string;
  canvasMode?: string;
  canvasHeight?: number;
  courseRoute?: string;
  csRoute?: string;
  mathRoute?: string;
  learnerQuestion: string;
  teachingObjective: string;
  keyPoints: string[];
  sourceAnchors: string[];
  sourceImageIds: string[];
  sourceUseRationale: string;
  continuity?: SlideContinuity;
  visualPlan: string;
  mandatoryVisibleContent: string[];
  optionalContent: string[];
}

export interface LessonSlidePlan {
  id: string;
  order: number;
  title: string;
  pageKind: string;
  canvasMode?: string;
  canvasHeight?: number;
  courseRoute?: string;
  csRoute?: string;
  mathRoute?: string;
  density: string;
  objective: string;
  learnerQuestion?: string;
  sourceCoverage: string[];
  sourceAnchors?: string[];
  sourceImageIds?: string[];
  sourceUseRationale?: string;
  visualPlan?: string;
  continuity?: SlideContinuity;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
  htmlPrompt: string;
}

export interface PlanningQualityIssue {
  code: string;
  title: string;
  severity: 'error' | 'warning';
  details: string[];
}

export interface PlanningQualityReport {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  issues: PlanningQualityIssue[];
  summary: string;
}

export interface LessonPlan {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  coursePlan?: CoursePlan;
  courseSpine?: CourseSpine;
  slideOutlines?: SlideTeachingOutline[];
  planningNotes: string[];
  slides: LessonSlidePlan[];
}

export function getSinglePageTrialSlide(
  plan: LessonPlan | null | undefined,
): LessonSlidePlan | null {
  return plan?.slides?.find((slide) => slide.pageKind !== 'cover') || plan?.slides?.[0] || null;
}

export interface LessonPlanResponse {
  success?: boolean;
  plan?: LessonPlan;
  planningQuality?: PlanningQualityReport | null;
  planningRetryCount?: number;
  planningRetryReasons?: PlanningQualityIssue[];
  error?: string;
  details?: string;
}

export interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
}

export interface HtmlCostEstimate {
  baseUsd?: number | null;
  retailUsd?: number | null;
  computeCredits?: number | null;
  markupMultiplier?: number | null;
  source?: string;
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
  sourceImageUsage?: {
    assignedIds: string[];
    usedIds: string[];
    missingIds: string[];
    inventedIds: string[];
  };
  skippedCreditCharge?: boolean;
  error?: string;
  details?: string;
}

export interface PipelineCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export type HtmlCourseRoute =
  | 'general'
  | 'math'
  | 'computer-science'
  | 'science'
  | 'business'
  | 'humanities'
  | 'social-science';

export interface ExpectedCourseRoute {
  route: HtmlCourseRoute;
  label: string;
  evidence: string;
}

export interface HtmlPageResult {
  slideId: string;
  slideTitle: string;
  order: number;
  html: string;
  htmlLength: number;
  elementCount: number;
  textNodeCount: number;
  durationMs: number;
  canvasMode: string;
  canvasHeight: number;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  sourceImageUsage?: GenerateHtmlPptResponse['sourceImageUsage'];
  createdAt: number;
}

export interface HtmlPageError {
  slideId: string;
  slideTitle: string;
  order: number;
  message: string;
  details?: string;
  httpStatus?: number;
  createdAt: number;
}

export type LectureActionType = 'speech' | 'spotlight' | 'laser';
export type LectureTargetKind = 'title' | 'text' | 'code' | 'table' | 'visual' | 'block';

export interface LectureTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LectureTarget {
  id: string;
  label: string;
  selector: string;
  kind: LectureTargetKind;
  text: string;
  rect: LectureTargetRect;
  areaRatio: number;
}

export interface LectureActionPlanItem {
  id: string;
  type: LectureActionType;
  title: string;
  text?: string;
  targetId?: string;
  dimOpacity?: number;
  color?: string;
}

export interface LecturePageResult {
  slideId: string;
  slideTitle: string;
  order: number;
  pageKind: string;
  canvasWidth: number;
  canvasHeight: number;
  targets: LectureTarget[];
  actions: LectureActionPlanItem[];
  scriptText: string;
  warnings: string[];
  createdAt: number;
}

export interface SceneActionApiAction {
  id?: string;
  type?: string;
  title?: string;
  text?: string;
  elementId?: string;
  dimOpacity?: number;
  color?: string;
}

export interface SceneActionsApiResponse {
  success?: boolean;
  scene?: {
    actions?: SceneActionApiAction[];
  };
  previousSpeeches?: string[];
  fallbackUsed?: boolean;
  error?: string;
  details?: string;
}

export interface SavedPipelinePayload {
  mode: 'notebook';
  contractVersion?: string;
  fixtureId: string;
  fixtureTitle: string;
  tier: PageCountTier;
  generatedAt: number;
  checks: Record<string, PipelineCheck[]>;
  plan?: LessonPlan;
  planningQuality?: PlanningQualityReport | null;
  coverPage?: HtmlPageResult | null;
  coverPageError?: HtmlPageError | null;
  htmlPages?: Record<string, HtmlPageResult>;
  htmlPageErrors?: Record<string, HtmlPageError>;
  lectureResults?: Record<string, LecturePageResult>;
}

export const TIER_OPTIONS: Array<{ value: PageCountTier; label: string }> = [
  { value: 'under5', label: '5 页以下' },
  { value: 'under10', label: '10 页以下' },
  { value: 'under20', label: '20 页以下' },
  { value: 'over20', label: '20 页以上' },
];

export const PIPELINE_STEP_LABELS: Record<
  PipelineStepId,
  { order: number; title: string; artifact: string }
> = {
  source: {
    order: 1,
    title: 'Source Package',
    artifact: 'sourcePackage / sourcePages / sourceImages',
  },
  'course-plan': {
    order: 2,
    title: 'coursePlan',
    artifact: 'courseGoal / coreQuestions / courseSpine',
  },
  'slide-outlines': {
    order: 3,
    title: 'slideOutlines',
    artifact: 'learnerQuestion / visualPlan / continuity',
  },
  'route-contract': {
    order: 4,
    title: '课程路线',
    artifact: 'courseRoute / csRoute / mathRoute',
  },
  'html-prompts': {
    order: 5,
    title: 'slides[].htmlPrompt',
    artifact: 'pageKind / canvasMode / mandatoryVisibleContent',
  },
  'cover-page': {
    order: 6,
    title: '单页试跑',
    artifact: 'single page HTML / iframe QA / visual gate',
  },
  'html-pages': {
    order: 7,
    title: '全量 HTML 生成',
    artifact: '整本 notebook 输出回归',
  },
  'lecture-actions': {
    order: 8,
    title: '讲解稿与动作',
    artifact: 'script / speech / spotlight / laser',
  },
  'lecture-positioning': {
    order: 9,
    title: '遮罩定位',
    artifact: 'target rect / mask preview / selector',
  },
};
