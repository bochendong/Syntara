import type { ReviewRoute } from '@/lib/learning/review-route-types';

export type ReviewMode = 'exam-sprint' | 'mistake-repair' | 'gentle-foundation';
export type ReviewScenarioId =
  | 'known-memory'
  | 'cold-start'
  | 'bank-rich'
  | 'bank-empty'
  | 'bank-thin';
export type ReviewMemoryMode = 'full' | 'none';
export type ReviewBankMode = 'full' | 'empty' | 'thin';
export type RunPhase = 'idle' | 'supplementing' | 'assessing' | 'generating' | 'success' | 'error';
export type ReviewStepId = 'profile' | 'problem-bank' | 'readiness' | 'review-plan';
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type PipelineStepState = 'ready' | 'running' | 'pass' | 'warn' | 'fail' | 'locked';

export type AiProblemBankReadiness = {
  ready: boolean;
  requiredProblemCount: number;
  currentProblemCount: number;
  missingConcepts: string[];
  thinConcepts: string[];
  reasons: string[];
  teacherLine?: string;
};

export type ProblemBankPayload = {
  totalProblems: number;
  attemptedProblems: number;
  masteredConcepts: string[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  missingConcepts: string[];
  wrongProblems: Array<{
    title: string;
    tags: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    status: 'failed' | 'partial' | 'error';
  }>;
};

export type PrivateMemoryPayload = {
  id: string;
  concept: string;
  note: string;
  status: 'open' | 'reviewed';
  severity: 'low' | 'medium' | 'high';
  source: string;
  relatedProblemIds: string[];
};

export type CandidateProblemPayload = {
  id: string;
  title: string;
  type: 'choice' | 'short_answer' | 'proof' | 'calculation' | 'code' | 'fill_blank';
  concepts: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'unattempted' | 'passed' | 'failed' | 'partial' | 'error';
  score?: number | null;
  tags: string[];
  preview: string;
  stem?: string;
  answer?: string;
  options?: Array<{ id: string; label: string }>;
  testCases?: Array<{
    input: string;
    expectedOutput: string;
    hidden?: boolean;
  }>;
};

export type ReviewHistoryPayload = {
  id: string;
  title: string;
  status: 'completed' | 'failed' | 'partial' | 'skipped';
  coveredConcepts: string[];
  failedConcepts: string[];
  problemIds: string[];
};

export type ScenePayload = {
  id: string;
  title: string;
  type: string;
  order: number;
  quizQuestions: string[];
};

export type GeneratePayload = {
  notebookId: string;
  notebookName: string;
  notebookDescription: string;
  weakPoints: string[];
  problemBank: ProblemBankPayload;
  scenes: ScenePayload[];
  privateMemory: PrivateMemoryPayload[];
  candidateProblems: CandidateProblemPayload[];
  reviewHistory: ReviewHistoryPayload[];
  selectedProblemIds: string[];
};

export type Preset = {
  id: ReviewMode;
  title: string;
  description: string;
  goal: string;
  weakPoints: string;
  masteredConcepts: string;
  weakConcepts: string;
  untriedConcepts: string;
  thinConcepts: string;
  missingConcepts: string;
  customRules: string;
  intensity: number;
  includeSupportNodes: boolean;
  forceBossMix: boolean;
};

export type ReviewScenario = {
  id: ReviewScenarioId;
  title: string;
  description: string;
  memoryMode: ReviewMemoryMode;
  bankMode: ReviewBankMode;
  expectedSignal: string;
};

export type PipelineCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type ReviewFormState = {
  scenarioId: ReviewScenarioId;
  mode: ReviewMode;
  notebookName: string;
  goal: string;
  weakPoints: string;
  masteredConcepts: string;
  weakConcepts: string;
  untriedConcepts: string;
  thinConcepts: string;
  missingConcepts: string;
  customRules: string;
  intensity: number;
  includeSupportNodes: boolean;
  forceBossMix: boolean;
};

export type SavedCustomReviewPayload = {
  mode: 'custom-review-pipeline';
  form: ReviewFormState;
  request: GeneratePayload;
  supplementProblems?: CandidateProblemPayload[];
  assessment: AiProblemBankReadiness | null;
  route: ReviewRoute | null;
  checks: Record<ReviewStepId, PipelineCheck[]>;
  generatedAt: number;
};

export const TEST_ID = 'custom-review';
export const RESULT_KEY = 'state';
export const MIN_REVIEW_PROBLEM_COUNT = 12;
