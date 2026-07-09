import type { TeachingAction, TeachingToolId } from './types';

export type ReviewTargetKind = 'concept' | 'range' | 'exam' | 'course' | 'unknown';

export type ReviewMode = 'explain' | 'practice' | 'both' | 'unknown';

export type ReviewWorkflowId =
  | 'concept_explanation_review'
  | 'concept_practice_review'
  | 'concept_mixed_review'
  | 'range_explanation_plan'
  | 'range_practice_plan'
  | 'range_mixed_plan'
  | 'review_scope_clarification'
  | 'review_mode_clarification';

export type ReviewWorkflowPause =
  | 'ask_review_scope'
  | 'ask_review_mode'
  | 'ask_schedule_window'
  | 'confirm_calendar_write';

export type MemoryExtractionKind =
  | 'student_declared_fact'
  | 'question_diagnosis'
  | 'practice_attempt_signal'
  | 'mistake_pattern'
  | 'explanation_feedback'
  | 'review_plan_preference'
  | 'source_public_memory'
  | 'problem_bank_metadata'
  | 'knowledge_cache_hit'
  | 'student_correction';

export type MemoryStorageTarget =
  | 'control_fact'
  | 'short_term'
  | 'long_term'
  | 'knowledge_base'
  | 'knowledge_cache'
  | 'practice_attempt';

export type ReviewWorkflowStep = {
  id: string;
  title: string;
  purpose: string;
  toolIds: TeachingToolId[];
  evidenceReads: string[];
  memoryExtractions: MemoryExtractionKind[];
  pausesFor?: ReviewWorkflowPause;
  clientSurface?: 'chat' | 'problem_component' | 'right_sidebar_calendar' | 'memory_preview';
};

export type ReviewWorkflowPlan = {
  workflowId: ReviewWorkflowId;
  targetKind: ReviewTargetKind;
  mode: ReviewMode;
  needsClarification: boolean;
  clarificationQuestion?: string;
  requiredEvidence: string[];
  steps: ReviewWorkflowStep[];
};

export type MemoryExtractionWorkflow = {
  kind: MemoryExtractionKind;
  trigger: string;
  storageTarget: MemoryStorageTarget;
  requiredFields: string[];
  skipWhen: string[];
  writeRule: string;
};

const REVIEW_TERMS_RE = /复习|review|巩固|准备|备考|考试|quiz|midterm|final/i;
const PRACTICE_TERMS_RE = /练题|题目|做题|刷题|quiz|practice|exercise|problem|小测|测试/i;
const EXPLAIN_TERMS_RE = /讲解|解释|讲一遍|过一遍|听课|explain|teach|walk.*through/i;
const BOTH_TERMS_RE = /都有|都要|两个都|全都|both|explain.*practice|practice.*explain/i;
const RANGE_TERMS_RE =
  /范围|章节|chapter|week|lecture|unit|module|前半|后半|全部|整门|syllabus|大纲|这周|下周|几天|计划|plan/i;
const EXAM_TERMS_RE = /考试|期中|期末|midterm|final|exam|test|ddl|deadline/i;
const COURSE_TERMS_RE = /整门|全部|全课|这门课|整个课程|full course|whole course/i;

export const MEMORY_EXTRACTION_WORKFLOWS = [
  {
    kind: 'student_declared_fact',
    trigger:
      'The learner states a current fact such as deadline, available study time, target scope, preference, or constraint.',
    storageTarget: 'control_fact',
    requiredFields: ['factKey', 'factValue', 'scope', 'evidenceText', 'confidence'],
    skipWhen: ['The statement is hypothetical, temporary, contradicted, or only social filler.'],
    writeRule:
      'Use overwriteable structured facts for exact-current values that should override fuzzy recall.',
  },
  {
    kind: 'question_diagnosis',
    trigger: 'The learner asks about a concept, code pattern, proof step, or source passage.',
    storageTarget: 'short_term',
    requiredFields: [
      'concepts',
      'masteredSignal',
      'stuckPoint',
      'probableCause',
      'nextTeachingMove',
    ],
    skipWhen: [
      'The question does not reveal a learning state or there is no teaching-relevant signal.',
    ],
    writeRule: 'Store mastery, weakness, cause, and next move rather than a transcript fragment.',
  },
  {
    kind: 'practice_attempt_signal',
    trigger: 'The learner receives, starts, submits, or completes a practice question.',
    storageTarget: 'practice_attempt',
    requiredFields: ['problemId', 'concepts', 'attemptStatus', 'scoreOrOutcome', 'diagnosis'],
    skipWhen: ['The problem was only previewed and no attempt or diagnostic signal exists.'],
    writeRule:
      'Persist the attempt as attempt data first; derive teaching memory only from the diagnosis.',
  },
  {
    kind: 'mistake_pattern',
    trigger:
      'A wrong answer, repeated partial answer, or self-reported confusion reveals an error pattern.',
    storageTarget: 'long_term',
    requiredFields: ['concepts', 'errorPattern', 'examples', 'frequency', 'nextPracticeMove'],
    skipWhen: ['The mistake is one-off and already covered by short-term working memory.'],
    writeRule:
      'Promote to long-term only after repeated evidence or a high-confidence durable misconception.',
  },
  {
    kind: 'explanation_feedback',
    trigger:
      'After an explanation, the learner says they understand, still do not understand, or asks for a different example.',
    storageTarget: 'short_term',
    requiredFields: ['concepts', 'feedback', 'updatedMastery', 'remainingGap', 'nextTeachingMove'],
    skipWhen: ['Feedback is ambiguous and would not change the next teaching action.'],
    writeRule:
      'Update the current teaching state instead of closing the turn with no learning signal.',
  },
  {
    kind: 'review_plan_preference',
    trigger:
      'The learner chooses explain, practice, both, pace, frequency, available days, or daily minutes.',
    storageTarget: 'control_fact',
    requiredFields: ['preferenceType', 'value', 'scope', 'validUntil', 'evidenceText'],
    skipWhen: ['The learner is choosing only for an already completed one-off turn.'],
    writeRule:
      'Keep plan constraints structured so future plans and calendar writes can reuse them exactly.',
  },
  {
    kind: 'source_public_memory',
    trigger: 'A creator uploads syllabus, notes, slides, templates, rubric, or answer contracts.',
    storageTarget: 'knowledge_base',
    requiredFields: ['sourceId', 'scope', 'courseRule', 'templateContract', 'retrievalText'],
    skipWhen: ['The upload is all questions or contains no reusable course operation rule.'],
    writeRule:
      'Keep full source in RAG and promote only course-local contracts that change answers.',
  },
  {
    kind: 'problem_bank_metadata',
    trigger: 'A problem is imported, generated, published, selected, or used for review.',
    storageTarget: 'practice_attempt',
    requiredFields: ['problemId', 'conceptTags', 'difficulty', 'questionType', 'diagnosticPurpose'],
    skipWhen: ['Tags are generic source names or do not help future retrieval/selection.'],
    writeRule:
      'Attach metadata to the problem bank record; do not hide problem identity inside prose memory.',
  },
  {
    kind: 'knowledge_cache_hit',
    trigger:
      'A source, template, or memory chunk is repeatedly or recently used to answer teaching turns.',
    storageTarget: 'knowledge_cache',
    requiredFields: ['sourceId', 'scope', 'hitReason', 'concepts', 'lastUsedAt'],
    skipWhen: ['The source was used once or the original evidence is not authoritative.'],
    writeRule: 'Cache retrieval priority only; keep the original source as the source of truth.',
  },
  {
    kind: 'student_correction',
    trigger:
      'The learner corrects what the system thinks about their skill, weakness, scope, or preference.',
    storageTarget: 'control_fact',
    requiredFields: ['correctedField', 'oldValue', 'newValue', 'scope', 'evidenceText'],
    skipWhen: ['The correction is sarcastic, unclear, or not tied to a learner-state claim.'],
    writeRule: 'Prefer overwrite/correction records over adding contradictory fuzzy memories.',
  },
] satisfies readonly MemoryExtractionWorkflow[];

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

export function inferReviewMode(query: string): ReviewMode {
  const text = normalizeText(query);
  if (BOTH_TERMS_RE.test(text)) return 'both';
  const asksPractice = PRACTICE_TERMS_RE.test(text);
  const asksExplain = EXPLAIN_TERMS_RE.test(text);
  if (asksPractice && asksExplain) return 'both';
  if (asksPractice) return 'practice';
  if (asksExplain) return 'explain';
  return 'unknown';
}

function hasNamedReviewTarget(query: string): boolean {
  const stripped = query
    .replace(REVIEW_TERMS_RE, ' ')
    .replace(PRACTICE_TERMS_RE, ' ')
    .replace(EXPLAIN_TERMS_RE, ' ')
    .replace(BOTH_TERMS_RE, ' ')
    .replace(/我|想|需要|帮我|请|可以|能不能|一下|一遍|这次|更想|还是|吗|吧|的|要/g, ' ')
    .replace(/[，。！？,.!?;:：；]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]{2,}/.test(stripped);
}

export function inferReviewTargetKind(query: string): ReviewTargetKind {
  const text = normalizeText(query);
  if (
    !REVIEW_TERMS_RE.test(text) &&
    !EXPLAIN_TERMS_RE.test(text) &&
    !PRACTICE_TERMS_RE.test(text)
  ) {
    return 'unknown';
  }
  if (EXAM_TERMS_RE.test(text)) return 'exam';
  if (COURSE_TERMS_RE.test(text)) return 'course';
  if (RANGE_TERMS_RE.test(text)) return 'range';
  if (!hasNamedReviewTarget(query)) return 'unknown';
  return 'concept';
}

function step(args: ReviewWorkflowStep): ReviewWorkflowStep {
  return args;
}

const ASK_SCOPE_STEP = step({
  id: 'ask_review_scope',
  title: 'Ask for review scope',
  purpose:
    'Pause because the learner asked to review but did not provide a usable concept, range, course, or exam target.',
  toolIds: ['classify_teaching_intent', 'resolve_fixed_review_workflow'],
  evidenceReads: ['conversation_state'],
  memoryExtractions: [],
  pausesFor: 'ask_review_scope',
  clientSurface: 'chat',
});

const ASK_MODE_STEP = step({
  id: 'ask_review_mode',
  title: 'Ask for review mode',
  purpose: 'Pause to ask whether the learner wants explanation, practice questions, or both.',
  toolIds: ['resolve_fixed_review_workflow'],
  evidenceReads: ['conversation_state'],
  memoryExtractions: ['review_plan_preference'],
  pausesFor: 'ask_review_mode',
  clientSurface: 'chat',
});

const COLLECT_CONCEPT_EVIDENCE_STEP = step({
  id: 'collect_concept_evidence',
  title: 'Collect concept evidence',
  purpose:
    'Read learner state, local templates, knowledge cache, and course materials before explaining or selecting questions.',
  toolIds: [
    'get_learning_state',
    'search_teaching_memory',
    'search_template_library',
    'search_course_materials',
  ],
  evidenceReads: [
    'short_term',
    'long_term',
    'control_fact',
    'template',
    'knowledge_cache',
    'course_material',
  ],
  memoryExtractions: ['knowledge_cache_hit'],
});

const COLLECT_PRACTICE_EVIDENCE_STEP = step({
  id: 'collect_practice_evidence',
  title: 'Collect practice evidence',
  purpose:
    'Read prior attempts, weak points, and problem-bank candidates before selecting questions.',
  toolIds: [
    'get_learning_state',
    'search_problem_attempts',
    'search_problem_bank',
    'search_template_library',
  ],
  evidenceReads: ['short_term', 'long_term', 'problem_attempt', 'problem_bank', 'template'],
  memoryExtractions: ['mistake_pattern', 'problem_bank_metadata'],
});

const EXPLAIN_STEP = step({
  id: 'explain_concept',
  title: 'Explain concept with local evidence',
  purpose:
    'Give a concise explanation grounded in learner memory, course material, and course templates.',
  toolIds: ['explain_concept_with_templates'],
  evidenceReads: ['memory', 'template', 'course_material', 'knowledge_cache'],
  memoryExtractions: ['question_diagnosis', 'explanation_feedback'],
  clientSurface: 'chat',
});

const SELECT_QUESTIONS_STEP = step({
  id: 'select_review_questions',
  title: 'Select review questions',
  purpose:
    'Choose a small quiz from real problem-bank items when available, or mark generated diagnostics explicitly.',
  toolIds: ['select_evidence_based_review_questions'],
  evidenceReads: ['problem_bank', 'problem_attempt', 'memory', 'template'],
  memoryExtractions: ['practice_attempt_signal', 'problem_bank_metadata'],
  clientSurface: 'problem_component',
});

const COLLECT_RANGE_EVIDENCE_STEP = step({
  id: 'collect_range_evidence',
  title: 'Collect range evidence',
  purpose:
    'Read syllabus, current date, calendar/deadlines, learner state, recent attempts, templates, and problem coverage.',
  toolIds: [
    'get_schedule_context',
    'get_learning_state',
    'search_teaching_memory',
    'search_problem_attempts',
    'search_problem_bank',
    'search_template_library',
    'search_course_materials',
  ],
  evidenceReads: [
    'syllabus',
    'current_date',
    'schedule',
    'short_term',
    'long_term',
    'problem_attempt',
    'problem_bank',
    'template',
    'course_material',
  ],
  memoryExtractions: ['knowledge_cache_hit'],
});

const BUILD_RANGE_PLAN_STEP = step({
  id: 'build_range_review_plan',
  title: 'Build range review plan',
  purpose:
    'Estimate a review window from syllabus, date, deadlines, and learner constraints; ask if the window cannot be inferred.',
  toolIds: ['select_review_targets', 'generate_evidence_based_review_plan'],
  evidenceReads: ['schedule', 'memory', 'problem_attempt', 'problem_bank', 'template'],
  memoryExtractions: ['review_plan_preference'],
  clientSurface: 'right_sidebar_calendar',
});

const PROPOSE_CALENDAR_STEP = step({
  id: 'propose_calendar_items',
  title: 'Propose calendar items',
  purpose:
    'Add the generated plan to the learning calendar only as a confirmation-required proposal.',
  toolIds: ['write_teaching_memory'],
  evidenceReads: ['review_plan', 'schedule', 'control_fact'],
  memoryExtractions: ['student_declared_fact', 'review_plan_preference'],
  pausesFor: 'confirm_calendar_write',
  clientSurface: 'right_sidebar_calendar',
});

function buildConceptWorkflow(mode: Exclude<ReviewMode, 'unknown'>): ReviewWorkflowPlan {
  const steps =
    mode === 'explain'
      ? [COLLECT_CONCEPT_EVIDENCE_STEP, EXPLAIN_STEP]
      : mode === 'practice'
        ? [COLLECT_PRACTICE_EVIDENCE_STEP, SELECT_QUESTIONS_STEP]
        : [
            COLLECT_CONCEPT_EVIDENCE_STEP,
            EXPLAIN_STEP,
            COLLECT_PRACTICE_EVIDENCE_STEP,
            SELECT_QUESTIONS_STEP,
          ];
  return {
    workflowId:
      mode === 'explain'
        ? 'concept_explanation_review'
        : mode === 'practice'
          ? 'concept_practice_review'
          : 'concept_mixed_review',
    targetKind: 'concept',
    mode,
    needsClarification: false,
    requiredEvidence: Array.from(new Set(steps.flatMap((item) => item.evidenceReads))),
    steps,
  };
}

function buildRangeWorkflow(
  targetKind: Extract<ReviewTargetKind, 'range' | 'exam' | 'course'>,
  mode: Exclude<ReviewMode, 'unknown'>,
): ReviewWorkflowPlan {
  const practiceSteps =
    mode === 'practice' || mode === 'both'
      ? [COLLECT_PRACTICE_EVIDENCE_STEP, SELECT_QUESTIONS_STEP]
      : [];
  const explanationSteps = mode === 'explain' || mode === 'both' ? [EXPLAIN_STEP] : [];
  const steps = [
    COLLECT_RANGE_EVIDENCE_STEP,
    ...explanationSteps,
    ...practiceSteps,
    BUILD_RANGE_PLAN_STEP,
    PROPOSE_CALENDAR_STEP,
  ];
  return {
    workflowId:
      mode === 'explain'
        ? 'range_explanation_plan'
        : mode === 'practice'
          ? 'range_practice_plan'
          : 'range_mixed_plan',
    targetKind,
    mode,
    needsClarification: false,
    requiredEvidence: Array.from(new Set(steps.flatMap((item) => item.evidenceReads))),
    steps,
  };
}

export function resolveFixedReviewWorkflow(args: {
  query: string;
  targetKind?: ReviewTargetKind;
  mode?: ReviewMode;
}): ReviewWorkflowPlan {
  const targetKind = args.targetKind || inferReviewTargetKind(args.query);
  const mode = args.mode || inferReviewMode(args.query);

  if (targetKind === 'unknown') {
    return {
      workflowId: 'review_scope_clarification',
      targetKind,
      mode,
      needsClarification: true,
      clarificationQuestion: '你想复习哪个知识点、章节范围，还是为某次考试复习？',
      requiredEvidence: ['conversation_state'],
      steps: [ASK_SCOPE_STEP],
    };
  }

  if (mode === 'unknown') {
    return {
      workflowId: 'review_mode_clarification',
      targetKind,
      mode,
      needsClarification: true,
      clarificationQuestion: '你这次更想听讲解、练题，还是两者都要？',
      requiredEvidence: ['conversation_state'],
      steps: [ASK_MODE_STEP],
    };
  }

  if (targetKind === 'concept') return buildConceptWorkflow(mode);
  return buildRangeWorkflow(targetKind, mode);
}

export function memoryExtractionKindsForAction(action: TeachingAction): MemoryExtractionKind[] {
  if (action === 'review_plan') return ['review_plan_preference', 'student_declared_fact'];
  if (action === 'question_selection') {
    return ['practice_attempt_signal', 'mistake_pattern', 'problem_bank_metadata'];
  }
  if (action === 'practice_generation') {
    return ['question_diagnosis', 'problem_bank_metadata', 'practice_attempt_signal'];
  }
  if (action === 'explanation') return ['question_diagnosis', 'explanation_feedback'];
  if (action === 'grading_feedback') return ['practice_attempt_signal', 'mistake_pattern'];
  if (action === 'notebook_generation') return ['source_public_memory', 'knowledge_cache_hit'];
  if (action === 'memory_write') return ['student_correction', 'student_declared_fact'];
  return [];
}

export function fixedReviewWorkflowPromptSection(): string {
  return [
    'Fixed review workflows:',
    '- If the learner explicitly asks to review a named concept, first classify the requested mode: explanation, practice, or both. If the mode is missing, ask that exact choice instead of silently choosing.',
    '- Concept explanation route: read learner memory, templates, knowledge cache, and course/RAG context; explain the concept; then extract what remains unclear and the next teaching move.',
    '- Concept practice route: read learner memory, prior wrong attempts, templates, and the problem bank; select a small bank-backed quiz; render through the practice/problem UI; then extract attempted problems and error patterns.',
    '- Concept both route: briefly explain the weakest prerequisite or misconception, then select a small quiz using the same evidence.',
    '- Range/exam/course review route: read syllabus, current date, calendar/deadlines, learner memory, recent attempts, templates, and problem coverage; infer days/frequency when possible; ask only when the window cannot be inferred.',
    '- A range review plan must be calendar-ready: include a schedule rationale, daily or session-level tasks, and a confirmation-required calendar proposal when the learner wants it added.',
    '- When evidence is missing, say which personalization evidence is missing. Do not pretend the plan or question choice came from memory, attempts, or the problem bank.',
  ].join('\n');
}

export function memoryExtractionWorkflowPromptSection(): string {
  return [
    'Fixed memory extraction workflows:',
    '- Extract student-declared facts into overwriteable control facts: deadline, available time, preferred mode, current target, and corrections.',
    '- Extract concept questions into short-term learner state: masteredSignal, stuckPoint, probableCause, and nextTeachingMove. Do not store the raw question as the main memory.',
    '- Extract practice into attempt/progress records first, then derive short-term or long-term teaching memory from wrong answers and repeated patterns.',
    '- Extract explanation feedback after the learner says they understand, still do not understand, or need another example.',
    '- Extract creator-uploaded syllabus/notes/templates into source/RAG/public course memory; skip public-memory writes when the upload is all questions.',
    '- Extract repeated retrieval hits into knowledge_cache only as retrieval priority. The original source remains authoritative.',
    '- Skip memory writes when the signal would not change a future teaching action.',
  ].join('\n');
}

export function teachingWorkflowPromptSections(): string {
  return [fixedReviewWorkflowPromptSection(), memoryExtractionWorkflowPromptSection()].join('\n\n');
}
