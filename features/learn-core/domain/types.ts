export type LearnRole = 'user' | 'assistant';

export type LearnActionKind =
  | 'calendar.search'
  | 'calendar.propose_add'
  | 'calendar.propose_update'
  | 'calendar.propose_delete'
  | 'calendar.start_recent'
  | 'memory.search'
  | 'memory.propose_write'
  | 'web.search'
  | 'review_mode.request_choice'
  | 'learner_progress.request_confirmation'
  | 'practice.propose_generation'
  | 'classroom.propose_temporary_explanation'
  | 'image.propose_generation';

export type LearnActionConfirmation = 'none' | 'required';

export type LearnAction = {
  kind: LearnActionKind;
  label: string;
  summary?: string;
  payload?: Record<string, unknown>;
  confirmation?: LearnActionConfirmation;
};

export type LearnArtifactKind =
  | 'activity_plan'
  | 'review_plan'
  | 'calendar_draft'
  | 'active_activity'
  | 'answer_evidence'
  | 'web_search_result'
  | 'image_prompt_draft'
  | 'memory_candidate';

export type LearnArtifact = {
  kind: LearnArtifactKind;
  [key: string]: unknown;
};

export type LearnTurnAnswerMode =
  | 'course_answer'
  | 'action_only'
  | 'client_activity_plan'
  | 'client_practice_plan'
  | 'none';

export type LearnPlanningIntent = 'none' | 'review_plan' | 'preview_plan' | 'practice_plan';

export type LearnPlanningScopeHint =
  | 'first_half'
  | 'second_half'
  | 'next_two_weeks'
  | 'upcoming'
  | 'full_course'
  | 'explicit_topic';

export type LearnScopeResolution = {
  contentScope?: {
    label?: string;
    kind?: LearnPlanningScopeHint | null;
    basis?: 'user_explicit' | 'calendar_semantic' | 'memory' | 'artifact' | 'model_inference';
    eventIds?: string[];
    startDate?: string;
    endDate?: string;
    rationale?: string;
    confidence?: number;
  } | null;
  executionWindow?: {
    startDate?: string;
    days?: number;
    minutesPerDay?: number;
    rationale?: string;
  } | null;
  needsClarification?: boolean;
  clarificationQuestion?: string;
} | null;

export type LearnProblemBankMatch = {
  problemId: string;
  title: string;
  score: number;
  reason: string;
  excerpt?: string;
  notebookName?: string | null;
  tags?: string[];
  difficulty?: string;
  problemType?: string;
  attemptStatus?: string | null;
  metadata?: Record<string, unknown>;
};

export type LearnProblemBankExcludedCandidate = {
  problemId?: string;
  title: string;
  reason: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
};

export type LearnProblemBankSearchResult = {
  query: string;
  requestedCount: number;
  source: 'problem_bank_full_text' | 'problem_bank_summary' | 'none';
  strictTopic?: string | null;
  matches: LearnProblemBankMatch[];
  excluded: LearnProblemBankExcludedCandidate[];
  rationale: string[];
  gaps: string[];
  searchedAt?: string;
};

export type LearnPlanningDecision = {
  intent: LearnPlanningIntent;
  practiceMode?: 'practice' | 'quiz' | null;
  scopeHint?: LearnPlanningScopeHint | null;
  scopeResolution?: LearnScopeResolution;
  isFollowUpToPlan?: boolean;
  shouldAskProgressFirst?: boolean;
  useSyllabusAsDefaultScope?: boolean;
  resolvedPrompt?: string;
  focusTopics?: string[];
  constraintsSummary?: string;
  reason?: string;
  confidence?: number;
  problemBankSearch?: LearnProblemBankSearchResult | null;
};

export type LearnTurnMessage = {
  role: LearnRole;
  text: string;
};

export type LearnProblemBankSnapshot = {
  available: boolean;
  activeCount: number;
  samples: Array<Record<string, unknown>>;
};

export type LearnTurnInput = {
  question: string;
  recentMessages: LearnTurnMessage[];
  courseId?: string;
  courseName?: string;
  courseCode?: string;
  hasSyllabus: boolean;
  progressKnown: boolean;
  learnerSnapshot?: unknown;
  calendarEvents: Array<Record<string, unknown>>;
  recentPlans: Array<Record<string, unknown>>;
  recentArtifacts: Array<Record<string, unknown>>;
  recentActions: Array<Record<string, unknown>>;
  recentActivities: Array<Record<string, unknown>>;
  problemBank: LearnProblemBankSnapshot;
  sourceUploads: Array<Record<string, unknown>>;
  layeredMemorySummary?: string;
};

export type LearnEvidenceSourceType =
  | 'user_message'
  | 'conversation'
  | 'memory'
  | 'schedule'
  | 'problem_attempt'
  | 'problem_bank'
  | 'template'
  | 'notebook'
  | 'course_material'
  | 'knowledge_cache'
  | 'source'
  | 'web'
  | 'system';

export type LearnEvidenceLink = {
  id: string;
  sourceType: LearnEvidenceSourceType;
  sourceId?: string;
  title?: string;
  quoteOrSummary: string;
  supports: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type LearnDecisionChainStepKind =
  | 'observe_input'
  | 'observe_executor_result'
  | 'resolve_reference'
  | 'classify_intent'
  | 'select_evidence_plan'
  | 'call_tool'
  | 'handoff'
  | 'validate_decision'
  | 'compose_answer'
  | 'propose_writeback'
  | 'model_routing';

export type LearnDecisionChainStep = {
  id: string;
  kind: LearnDecisionChainStepKind;
  label: string;
  reasonSummary: string;
  evidence?: LearnEvidenceLink[];
  inputSummary?: string;
  outputSummary?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type LearnToolSideEffect =
  | 'none'
  | 'llm'
  | 'database-read'
  | 'database-write'
  | 'local-storage'
  | 'client-executor'
  | 'long-running-job';

export type LearnToolId =
  | 'semantic_router'
  | 'resolve_reference'
  | 'classify_intent'
  | 'search_memory'
  | 'search_schedule'
  | 'search_course_materials'
  | 'search_problem_bank'
  | 'resolve_fixed_review_workflow'
  | 'plan_review'
  | 'propose_calendar_change'
  | 'propose_memory_write'
  | 'propose_practice_generation'
  | 'answer_course_question';

export type LearnToolContract = {
  id: LearnToolId;
  title: string;
  description: string;
  readsFrom: string[];
  writesTo: string[];
  sideEffects: LearnToolSideEffect[];
  needsApproval: 'never' | 'always' | 'dynamic';
  outputEvidenceSources: LearnEvidenceSourceType[];
};

export type LearnToolCallTrace = {
  id: string;
  toolId: LearnToolId;
  purpose: string;
  inputSummary: string;
  outputSummary?: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  evidenceIds: string[];
  startedAt: string;
  endedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type LearnHandoffPacket = {
  id: string;
  from: string;
  to: string;
  intent:
    | LearnPlanningIntent
    | 'course_answer'
    | 'learning_status'
    | 'calendar_action'
    | 'memory_write';
  reasonSummary: string;
  evidence: LearnEvidenceLink[];
  requiredBehavior: string[];
  forbiddenBehavior: string[];
  missingEvidence: string[];
  createdAt: string;
};

export type LearnTrace = {
  runId: string;
  startedAt: string;
  endedAt?: string;
  steps: LearnDecisionChainStep[];
  toolCalls: LearnToolCallTrace[];
  handoffs: LearnHandoffPacket[];
};

export type LearnHookEvent =
  | { type: 'turn_start'; context: LearnRunContextSnapshot }
  | { type: 'turn_end'; decision: LearnTurnDecision }
  | { type: 'step'; step: LearnDecisionChainStep }
  | { type: 'tool_start'; toolCall: LearnToolCallTrace }
  | { type: 'tool_end'; toolCall: LearnToolCallTrace }
  | { type: 'handoff'; handoff: LearnHandoffPacket }
  | { type: 'validation_error'; message: string; metadata?: Record<string, unknown> };

export type LearnHooks = {
  emit?: (event: LearnHookEvent) => void | Promise<void>;
};

export type LearnRunContextSnapshot = {
  runId: string;
  courseId?: string;
  courseName?: string;
  courseCode?: string;
  currentDate: string;
  enabledToolIds: LearnToolId[];
};

export type LearnRunContext = {
  runId: string;
  input: LearnTurnInput;
  currentDate: string;
  hooks?: LearnHooks;
};

export type LearnTurnDecision = {
  answerMode: LearnTurnAnswerMode;
  replyText: string;
  planningDecision?: LearnPlanningDecision | null;
  directCalls: LearnAction[];
  proposals: LearnAction[];
  artifacts: LearnArtifact[];
  reason: string;
  confidence: number;
  trace: LearnTrace;
};
