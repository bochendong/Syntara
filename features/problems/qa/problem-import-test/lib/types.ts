import type { NotebookProblemImportDraft } from '@/lib/problem-bank';

export const TEST_RESULT_KEY = 'state-v3';
export const MAX_STORED_RUNS = 50;
export const PDF_LLM_TEST_MODEL = 'gpt-5.4';
export const SAVED_STATE_READ_DELAY_MS = 2_000;
export const DIRECT_PIPELINE_TIMEOUT_MS = 300_000;
export const STEP_TIMEOUT_MS: Record<StepId, number> = {
  'source-package': 60_000,
  'structure-plan': 120_000,
  'draft-generation': 180_000,
  'quality-report': 240_000,
  'render-review': 240_000,
};

export type StepId =
  | 'source-package'
  | 'structure-plan'
  | 'draft-generation'
  | 'quality-report'
  | 'render-review';
export type StepState = 'locked' | 'ready' | 'running' | 'pass' | 'warn' | 'fail';
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type FixtureKind = 'choice' | 'long-form' | 'code' | 'material';
export type FileType = 'pdf' | 'pptx' | 'md' | 'txt' | 'unknown';
export type PipelineMode = 'stepped' | 'direct-llm';

export function normalizePipelineMode(value: string | null | undefined): PipelineMode {
  return value === 'direct-llm' ? 'direct-llm' : 'stepped';
}

export function testResultIdForPipelineMode(mode: PipelineMode): string {
  return mode === 'direct-llm' ? 'problem-import-direct-llm' : 'problem-import-stepped';
}

export type TestFixture = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  kind: FixtureKind;
  fileSize: number;
  exists: boolean;
  updatedAt: number | null;
};

export type SourcePage = {
  id: string;
  sourceIndex: number;
  pageNumber: number;
  sourceLabel: string;
  title: string;
  text: string;
  charCount: number;
  roleHint: 'cover' | 'instructions' | 'problem' | 'additional_work' | 'blank' | 'unknown';
};

export type SourceImage = {
  id: string;
  pageNumber: number;
  src?: string;
  width?: number;
  height?: number;
  description?: string;
};

export type SourcePackage = {
  fileName: string;
  fileType: FileType;
  sourceText: string;
  sourcePages: SourcePage[];
  sourceImages: SourceImage[];
  pageCount: number;
  parser: string;
  warnings: string[];
  metadata: {
    sourceTextLength: number;
    imageCount: number;
    generatedAt: number;
  };
};

export type SourceAnchor = {
  pageNumber?: number;
  sourcePageId?: string;
  textQuote?: string;
  role?: string;
};

export type StructureItem = {
  index: number;
  topLevelLabel: string;
  title: string;
  problemTypeHint: string;
  pageStart?: number;
  pageEnd?: number;
  sourceAnchors: SourceAnchor[];
  subparts: Array<{ label: string; prompt: string; points?: number }>;
  contextBlocks: Array<{ kind: string; title: string; summary: string }>;
  visualRefs: string[];
  confidence: number;
};

export type StructurePlan = {
  sourceSummary: string;
  nonProblemRegions: Array<{ kind: string; pageNumbers: number[]; reason: string }>;
  sharedContexts: Array<{ id: string; title: string; pageNumbers: number[]; summary: string }>;
  topLevelProblems: StructureItem[];
  warnings: string[];
  generatedBy: 'llm' | 'heuristic';
};

export type ImportUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostCredits: number | null;
};

export type DraftResult = {
  drafts: NotebookProblemImportDraft[];
  usage: ImportUsage | null;
  warnings: string[];
};

export type QualityCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  details: string[];
  draftIndexes?: number[];
};

export type QualityReport = {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  checks: QualityCheck[];
  summary: string;
};

export type PipelineRun = {
  id: string;
  fixtureId: string;
  fixtureTitle: string;
  fixtureKind: FixtureKind;
  fileName: string;
  fileSize: number;
  createdAt: number;
  pipelineMode?: PipelineMode;
  sourcePackage?: SourcePackage;
  structurePlan?: StructurePlan;
  draftResult?: DraftResult;
  qualityReport?: QualityReport;
};

export type SavedState = {
  runs: PipelineRun[];
  selectedFixtureId: string | null;
  selectedRunId: string | null;
  selectedDraftId: string | null;
  selectedStepId: StepId;
};

export type FixturesResponse = {
  fixtures?: TestFixture[];
  error?: string;
};

export type StepResponse = {
  fixture?: {
    id: string;
    fileName: string;
    title: string;
    kind: FixtureKind;
  };
  fileSize?: number;
  sourcePackage?: SourcePackage;
  structurePlan?: StructurePlan;
  draftResult?: DraftResult;
  qualityReport?: QualityReport;
  pipelineMode?: PipelineMode;
  error?: string;
};

export const STEP_LABELS: Record<StepId, { order: number; title: string; artifact: string }> = {
  'source-package': {
    order: 1,
    title: 'Source Package',
    artifact: 'sourcePages / pageImages / parser metadata',
  },
  'structure-plan': {
    order: 2,
    title: 'Structure Plan',
    artifact: 'nonProblemRegions / topLevelProblems / anchors',
  },
  'draft-generation': {
    order: 3,
    title: 'Draft Generation',
    artifact: 'NotebookProblemImportDraft[] + structure metadata',
  },
  'quality-report': {
    order: 4,
    title: 'Quality Report',
    artifact: 'coverage / structure / independence checks',
  },
  'render-review': {
    order: 5,
    title: 'Render Review',
    artifact: 'student-facing stem / options / grading',
  },
};

export const DIRECT_LLM_STEP_IDS: StepId[] = [
  'source-package',
  'draft-generation',
  'quality-report',
  'render-review',
];

export const DIRECT_LLM_STEP_LABELS: Partial<
  Record<StepId, { order: number; title: string; artifact: string }>
> = {
  'source-package': {
    order: 1,
    title: '读取文件',
    artifact: 'PDF / 页面预览 / parser metadata',
  },
  'draft-generation': {
    order: 2,
    title: 'LLM 直读结果',
    artifact: '题目边界 + drafts + structure metadata',
  },
  'quality-report': {
    order: 3,
    title: '质量检查',
    artifact: '漏题 / 说明页 / 选项完整性',
  },
  'render-review': {
    order: 4,
    title: '题目预览',
    artifact: 'valid 正常题目 / invalid 调试信息',
  },
};

export function visibleStepIdsForMode(mode: PipelineMode): StepId[] {
  return mode === 'direct-llm' ? DIRECT_LLM_STEP_IDS : (Object.keys(STEP_LABELS) as StepId[]);
}

export function defaultStepIdForMode(mode: PipelineMode): StepId {
  return mode === 'direct-llm' ? 'draft-generation' : 'source-package';
}

export function normalizeStepIdForMode(stepId: StepId, mode: PipelineMode): StepId {
  return visibleStepIdsForMode(mode).includes(stepId) ? stepId : defaultStepIdForMode(mode);
}

export function stepLabelForMode(stepId: StepId, mode: PipelineMode) {
  return mode === 'direct-llm'
    ? DIRECT_LLM_STEP_LABELS[stepId] || STEP_LABELS[stepId]
    : STEP_LABELS[stepId];
}
