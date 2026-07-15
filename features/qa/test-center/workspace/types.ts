import type { StudyCoverOverlaySpec } from '@/lib/media/types';
import type { NotebookProblemGrading, NotebookProblemPublicContent } from '@/lib/problem-bank';

export type CorePlatformScenarioId =
  | 'notebook-overview-image'
  | 'notebook-summary-content'
  | 'calendar-natural-language-crud'
  | 'question-source-routing'
  | 'concept-text-explanation'
  | 'concept-ppt-explanation'
  | 'memory-review-plan';

export type CalendarTestEvent = {
  id: string;
  title: string;
  date: string;
  kind: 'assignment' | 'exam' | 'progress' | 'tutorial' | 'holiday' | 'other';
  rawText?: string | null;
};

export type QuestionTestItem = {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  question: string;
  summary?: string | null;
  sectionTitle?: string | null;
  reason: string;
  coverage?: string[];
  roleInSet?: string;
  sourceEvidence?: string;
  source?: 'local_problem_bank' | 'ai_generated';
  groundedIn?: 'notebook' | 'general_knowledge';
  publicContent?: NotebookProblemPublicContent;
  grading?: NotebookProblemGrading;
  formatValidation?: {
    valid: boolean;
    schema: 'NotebookProblemPublicContent' | 'NotebookProblemImportDraft';
    issues: string[];
  };
};

export type QuestionTestEvaluationCheck = {
  id: 'requested_count' | 'question_format' | 'source_provenance';
  label: string;
  passed: boolean;
  detail: string;
};

export type QuestionTestEvaluation = {
  passed: boolean;
  checks: QuestionTestEvaluationCheck[];
};

export type QuestionRetrievalQuery = {
  query: string;
  purpose: string;
  targetConcepts: string[];
  desiredTypes: string[];
  exclusions: string[];
};

export type QuestionRetrievalTrace = {
  plannerReasoning: string[];
  initialQueries: QuestionRetrievalQuery[];
  corpusPreparation: string;
  embeddingModel: string;
  embeddingDimensions: number;
  maxRounds: number;
  visibleProblemCount: number;
  rounds: Array<{
    round: number;
    queries: QuestionRetrievalQuery[];
    candidates: Array<{
      id: string;
      title: string;
      hybridScore: number;
      semanticScore: number;
      lexicalScore: number;
      matchedQuery: string;
      decision: 'accepted' | 'rejected' | 'unreviewed';
      decisionReason: string | null;
      failureType:
        | 'irrelevant'
        | 'duplicate'
        | 'unanswerable'
        | 'wrong_difficulty'
        | 'poor_coverage'
        | 'other'
        | null;
    }>;
    accepted: Array<{ id: string; title: string; reason: string }>;
    rejected: Array<{
      id: string;
      title: string;
      reason: string;
      failureType:
        | 'irrelevant'
        | 'duplicate'
        | 'unanswerable'
        | 'wrong_difficulty'
        | 'poor_coverage'
        | 'other';
    }>;
    invalidIds: string[];
    protocolIssues: string[];
    missingCoverage: string[];
    nextQueries: QuestionRetrievalQuery[];
    stopReason: string;
  }>;
  generation: {
    needed: number;
    generated: number;
    allowed: boolean;
    grounding: 'notebook' | 'general_knowledge';
    reasoning: string[];
  } | null;
  finalStopReason: string;
};

export type PresentationTestSlide = {
  title: string;
  eyebrow: string;
  summary: string;
  points: string[];
  callout: string;
  visualDirection: string;
  imageDataUrl?: string;
};

export type ReviewPlanTestTask = {
  title: string;
  minutes: number;
  reason: string;
  evidence: string[];
  completionSignal: string;
};

export type NotebookRouteDecision = {
  usageProfile: 'university_course' | 'research' | 'daily_use';
  confidence: number;
  reasons: string[];
  sourceSignals: string[];
  source: 'ai' | 'user_override';
};

export type NotebookNoteDesign = {
  notePurpose: string;
  inclusionRules: string[];
  omissionRules: string[];
  howToUse: string[];
};

export type CourseNotebookGuide = {
  lectureFocus: string;
  definitions: Array<{
    term: string;
    statement: string;
    notation: string;
    conditions: string[];
    sourceRef: string;
  }>;
  knowledgeMap: Array<{ from: string; relation: string; to: string }>;
  problemSolving: {
    guidingIdea: string;
    methodSelection: Array<{ when: string; idea: string; method: string; why: string }>;
    solutionFormat: Array<{ stage: string; purpose: string; writeLike: string }>;
    checks: string[];
  };
  representativeProblems: Array<{
    title: string;
    represents: string;
    trigger: string;
    solutionOutline: string[];
    sourceRef: string;
  }>;
  commonMistakes: Array<{ mistake: string; correction: string }>;
  quickLookup: Array<{ question: string; answer: string; sourceRef: string }>;
  noteDesign: NotebookNoteDesign;
};

export type ResearchNotebookGuide = {
  researchQuestion: string;
  coreClaims: Array<{ claim: string; evidence: string; boundary: string; sourceRef: string }>;
  methodPipeline: Array<{ stage: string; input: string; action: string; output: string }>;
  evidenceMap: Array<{
    experimentOrSource: string;
    metric: string;
    result: string;
    supports: string;
    boundary: string;
  }>;
  limitations: string[];
  reproducibility: Array<{
    item: string;
    detail: string;
    status: 'explicit' | 'partial' | 'missing';
  }>;
  retrievalKeywords: string[];
  quickLookup: Array<{ question: string; answer: string; sourceRef: string }>;
  noteDesign: NotebookNoteDesign;
};

export type DailyNotebookGuide = {
  essentialInformation: string[];
  actions: string[];
  timeline: string[];
  quickLookup: Array<{ question: string; answer: string; sourceRef: string }>;
  noteDesign: NotebookNoteDesign;
};

export type NotebookStudyGuide =
  | { kind: 'course'; content: CourseNotebookGuide }
  | { kind: 'research'; content: ResearchNotebookGuide }
  | { kind: 'daily'; content: DailyNotebookGuide };

export type NotebookAnswerContract = {
  shouldPersist: boolean;
  title: string;
  courseCode: string | null;
  summary: string;
  rules: Array<{
    category: string;
    rule: string;
    when: string;
    example: string;
    evidence: string;
  }>;
};

export type PlatformFlowOutput =
  | {
      kind: 'image';
      title: string;
      summary: string;
      imagePrompt: string;
      coverSpec?: StudyCoverOverlaySpec;
      imageUrl?: string;
      width?: number;
      height?: number;
      sections?: string[];
    }
  | {
      kind: 'calendar';
      events: CalendarTestEvent[];
      changeSummary: string;
      warnings?: string[];
    }
  | {
      kind: 'questions';
      topic: string;
      selectionSummary: string;
      questions: QuestionTestItem[];
      requestedCount?: number;
      sourceCase?:
        | 'empty_no_notes'
        | 'empty_with_notes'
        | 'sufficient_bank'
        | 'partial_no_notes'
        | 'partial_with_notes';
      courseCode?: 'MAT136' | 'CSC148';
      route?: 'select_only' | 'generate_only' | 'mixed';
      localBankTotal?: number;
      candidateCount?: number;
      existingCount?: number;
      generatedCount?: number;
      invalidExistingCount?: number;
      decisionTrace?: QuestionRetrievalTrace;
      evaluation?: QuestionTestEvaluation;
    }
  | {
      kind: 'text';
      title: string;
      markdown: string;
    }
  | {
      kind: 'explanation';
      explanationKind: 'concept' | 'problem';
      noteMode: 'without_notes' | 'with_extracted_notes';
      title: string;
      markdown: string;
      sourceNotebook: {
        runId: string;
        title: string;
        fileName: string | null;
        routeKind: 'course' | 'research' | 'daily';
        sectionCount: number;
        sourceType?: 'mock_extraction' | 'local_history';
      } | null;
      contextPages: Array<{
        id: string;
        title: string;
        summary: string;
        characterCount: number;
        sourceScore: number;
      }>;
    }
  | {
      kind: 'notebook';
      title: string;
      routing: NotebookRouteDecision;
      studyGuide: NotebookStudyGuide;
      sections: Array<{ key: string; title: string; summary: string; markdown: string }>;
      answerContract: NotebookAnswerContract | null;
    }
  | {
      kind: 'slides';
      title: string;
      slides: PresentationTestSlide[];
    }
  | {
      kind: 'review-plan';
      title: string;
      learnerSummary: string;
      priorities: string[];
      tasks: ReviewPlanTestTask[];
    };

export type PlatformFlowInput = {
  topic?: string;
  instruction?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  coverTitle?: string;
  coverCourseLabel?: string;
  coverUsageProfile?: 'auto' | 'university_course' | 'research' | 'daily_use';
  coverFocus?: string;
  mockPracticeHistory?: string;
  mockSchedule?: string;
  questionSourceCase?:
    | 'empty_no_notes'
    | 'empty_with_notes'
    | 'sufficient_bank'
    | 'partial_no_notes'
    | 'partial_with_notes';
  problemBankCourseCode?: 'MAT136' | 'CSC148';
  requestedQuestionCount?: number;
  partialBankSize?: number;
  mockNotebookContent?: string;
  mockQuestionHistory?: string;
  mockMemory?: string;
  currentEvents?: CalendarTestEvent[];
  explanationKind?: 'concept' | 'problem';
  explanationNoteMode?: 'without_notes' | 'with_extracted_notes';
  explanationTestId?: string;
  sourceNotebookRunId?: string;
};

export type PlatformFlowRunPayload = {
  kind: 'platform-flow-run';
  scenarioId: CorePlatformScenarioId;
  input: PlatformFlowInput;
  output: PlatformFlowOutput;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
  };
  costUsd?: number | null;
  costEstimate?: {
    retailUsd?: number | null;
    computeCredits?: number | null;
  };
  savedAt: number;
};

export function isCorePlatformScenarioId(value: string): value is CorePlatformScenarioId {
  return [
    'notebook-overview-image',
    'notebook-summary-content',
    'calendar-natural-language-crud',
    'question-source-routing',
    'concept-text-explanation',
    'concept-ppt-explanation',
    'memory-review-plan',
  ].includes(value);
}
