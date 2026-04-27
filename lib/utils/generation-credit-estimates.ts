import type {
  OrchestratorOutlineLength,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';

export type NotebookGenerationCreditEstimateInput = {
  generateSlides?: boolean | null;
  outlineLength?: OrchestratorOutlineLength | null;
  workedExampleLevel?: OrchestratorWorkedExampleLevel | null;
  includeQuizScenes?: boolean | null;
  webSearch?: boolean | null;
  imageGenerationEnabled?: boolean | null;
  sourceFileSize?: number | null;
};

export type ReviewRouteCreditEstimateInput = {
  sceneCount: number;
  quizCount: number;
  weakPointCount: number;
};

const NOTEBOOK_LENGTH_BASE: Record<OrchestratorOutlineLength, number> = {
  minimal: 28,
  compact: 42,
  standard: 60,
  extended: 86,
};

const WORKED_EXAMPLE_EXTRA: Record<OrchestratorWorkedExampleLevel, number> = {
  none: 0,
  light: 6,
  moderate: 12,
  heavy: 22,
};

function safeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function estimateNotebookGenerationComputeCredits(
  input: NotebookGenerationCreditEstimateInput,
): number {
  const sourceMegabytes = Math.ceil(safeInt(input.sourceFileSize) / 1_000_000);
  if (input.generateSlides === false) {
    return 8 + (input.webSearch ? 4 : 0) + Math.min(10, Math.max(0, sourceMegabytes - 1));
  }

  const outlineLength = input.outlineLength ?? 'standard';
  const workedExampleLevel = input.workedExampleLevel ?? 'moderate';
  return (
    NOTEBOOK_LENGTH_BASE[outlineLength] +
    WORKED_EXAMPLE_EXTRA[workedExampleLevel] +
    (input.includeQuizScenes === false ? 0 : 8) +
    (input.webSearch ? 4 : 0) +
    (input.imageGenerationEnabled ? 28 : 0) +
    Math.min(20, Math.max(0, sourceMegabytes - 1) * 2)
  );
}

export function estimateReviewRouteComputeCredits(input: ReviewRouteCreditEstimateInput): number {
  const sceneCost = Math.ceil(Math.max(1, input.sceneCount) / 8) * 2;
  const quizCost = Math.ceil(Math.max(0, input.quizCount) / 12);
  const weakPointCost = Math.ceil(Math.max(0, input.weakPointCount) / 4);
  return Math.max(8, Math.min(24, 7 + sceneCost + quizCost + weakPointCost));
}
