export type TeachingIntent =
  | 'answer_question'
  | 'grade_answer'
  | 'explain_concept'
  | 'learning_status'
  | 'review_plan'
  | 'review_question_selection'
  | 'practice_generation'
  | 'notebook_generation'
  | 'source_ingestion';

export type TeachingAction =
  | 'workflow_routing'
  | 'answer'
  | 'learning_status'
  | 'review_plan'
  | 'question_selection'
  | 'practice_generation'
  | 'explanation'
  | 'grading_feedback'
  | 'memory_extraction'
  | 'memory_write'
  | 'notebook_generation';

export type TeachingEvidenceSourceType =
  | 'control_fact'
  | 'memory'
  | 'conversation'
  | 'schedule'
  | 'problem_attempt'
  | 'problem_bank'
  | 'template'
  | 'notebook'
  | 'course_material'
  | 'knowledge_cache'
  | 'web';

export type TeachingEvidenceTarget = {
  type: 'user' | 'course' | 'notebook' | 'conversation' | 'problem' | 'source';
  id: string;
};

export type TeachingEvidence = {
  id: string;
  sourceType: TeachingEvidenceSourceType;
  sourceId: string;
  title: string;
  excerpt: string;
  reason: string;
  confidence?: number;
  target?: TeachingEvidenceTarget;
  occurredAt?: string;
  conceptTags?: string[];
  metadata?: Record<string, unknown>;
};

export type TeachingEvidenceGap = {
  sourceType: TeachingEvidenceSourceType;
  requiredFor: TeachingAction;
  reason: string;
  fallback: string;
};

export type TeachingEvidenceLedger = {
  items: TeachingEvidence[];
  gaps: TeachingEvidenceGap[];
};

export type TeachingToolCallRecord = {
  toolId: TeachingToolId;
  purpose: string;
  inputSummary: string;
  outputEvidenceIds: string[];
};

export type TeachingMemoryWrite = {
  scope: 'private' | 'public';
  layer: 'short_term' | 'long_term' | 'control_fact';
  title: string;
  text: string;
  reason: string;
  evidenceIds: string[];
};

export type TeachingDecision<TOutput = unknown> = {
  id: string;
  intent: TeachingIntent;
  action: TeachingAction;
  targetConcepts: string[];
  output: TOutput;
  evidence: TeachingEvidenceLedger;
  userFacingRationale: string[];
  toolCalls: TeachingToolCallRecord[];
  writeBack?: TeachingMemoryWrite[];
  createdAt: string;
};

export type TeachingToolSideEffect =
  | 'none'
  | 'llm'
  | 'database-read'
  | 'database-write'
  | 'local-storage'
  | 'long-running-job';

export type TeachingToolContract = {
  id: TeachingToolId;
  namespace: 'openmaic.teaching';
  title: string;
  description: string;
  readsFrom: string[];
  writesTo: string[];
  sideEffects: TeachingToolSideEffect[];
  requiredEvidenceSources: TeachingEvidenceSourceType[];
  outputEvidenceSources: TeachingEvidenceSourceType[];
};

export type TeachingToolId =
  | 'classify_teaching_intent'
  | 'resolve_fixed_review_workflow'
  | 'get_learning_state'
  | 'get_schedule_context'
  | 'search_teaching_memory'
  | 'search_problem_attempts'
  | 'search_problem_bank'
  | 'search_template_library'
  | 'search_course_materials'
  | 'select_review_targets'
  | 'generate_evidence_based_review_plan'
  | 'select_evidence_based_review_questions'
  | 'grade_answer_with_diagnosis'
  | 'explain_concept_with_templates'
  | 'classify_memory_extraction_signal'
  | 'extract_teaching_memory_signal'
  | 'route_teaching_memory_write'
  | 'write_teaching_memory';
