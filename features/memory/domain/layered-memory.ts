export type MemoryLayerId = 'short_term' | 'long_term' | 'knowledge_cache' | 'knowledge_base';

export type MemoryStorageMode = 'text_overwrite' | 'text_curated' | 'access_cache' | 'rag_index';

export type MemoryReadMode = 'static_injection' | 'dynamic_discovery';

export type MemoryReadPurpose =
  | 'answer_course_question'
  | 'explain_course_template'
  | 'learning_status'
  | 'review_plan'
  | 'weakness_diagnosis'
  | 'problem_search'
  | 'source_lookup'
  | 'general';

export type MemorySignalKind =
  | 'course_answer_contract'
  | 'notebook_teaching_constraint'
  | 'local_template'
  | 'learner_mastery'
  | 'learner_gap'
  | 'learner_error_pattern'
  | 'next_teaching_move'
  | 'knowledge_cache_hit'
  | 'source_evidence'
  | 'problem_bank_item'
  | 'generic_concept';

export type MemoryScopeKind = 'user' | 'course' | 'notebook' | 'conversation' | 'source';

export type LayeredMemoryBudget = {
  maxChars: number;
  maxItems: number;
};

export type LayeredMemoryBudgets = {
  total: LayeredMemoryBudget;
  controlFacts: LayeredMemoryBudget;
  shortTerm: LayeredMemoryBudget;
  longTermStatic: LayeredMemoryBudget;
  longTermDynamic: LayeredMemoryBudget;
  knowledgeCache: LayeredMemoryBudget;
  knowledgeBase: LayeredMemoryBudget;
  learnerEvidence: LayeredMemoryBudget;
};

export type MemoryLayerDefinition = {
  id: MemoryLayerId;
  title: string;
  storageMode: MemoryStorageMode;
  mutationPolicy:
    | 'overwrite_often'
    | 'append_then_curate'
    | 'refresh_on_access'
    | 'append_only_index';
  defaultReadModes: MemoryReadMode[];
  staticInjectionRole: string;
  dynamicDiscoveryRole: string;
  shouldStore: MemorySignalKind[];
  shouldNotStore: MemorySignalKind[];
  defaultBudget: LayeredMemoryBudget;
};

export type StaticMemoryInjectionSpec = {
  id: string;
  layer: MemoryLayerId | 'control_facts';
  title: string;
  priority: number;
  budget: LayeredMemoryBudget;
  reason: string;
};

export type DynamicMemoryDiscoverySpec = {
  id: string;
  layer: MemoryLayerId;
  title: string;
  priority: number;
  budget: LayeredMemoryBudget;
  reason: string;
};

export type LayeredMemoryReadPlan = {
  purpose: MemoryReadPurpose;
  target: {
    targetType: 'course' | 'notebook';
    targetId: string;
  };
  query: string;
  budgets: LayeredMemoryBudgets;
  staticInjection: StaticMemoryInjectionSpec[];
  dynamicDiscovery: DynamicMemoryDiscoverySpec[];
  promptDirectives: string[];
  extractionPolicy: string[];
};

export type LayeredMemoryLayerSummary = {
  layer: MemoryLayerId | 'control_facts';
  title: string;
  readModes: MemoryReadMode[];
  itemCount: number;
  maxChars: number;
  sources: string[];
  notes: string[];
};

export const DEFAULT_LAYERED_MEMORY_BUDGETS: LayeredMemoryBudgets = {
  total: { maxChars: 10000, maxItems: 48 },
  controlFacts: { maxChars: 1400, maxItems: 24 },
  shortTerm: { maxChars: 1600, maxItems: 8 },
  longTermStatic: { maxChars: 3200, maxItems: 12 },
  longTermDynamic: { maxChars: 2600, maxItems: 8 },
  knowledgeCache: { maxChars: 1800, maxItems: 8 },
  knowledgeBase: { maxChars: 3200, maxItems: 10 },
  learnerEvidence: { maxChars: 2200, maxItems: 12 },
};

export const MEMORY_LAYER_DEFINITIONS: Record<MemoryLayerId, MemoryLayerDefinition> = {
  short_term: {
    id: 'short_term',
    title: 'Short-term learner state',
    storageMode: 'text_overwrite',
    mutationPolicy: 'overwrite_often',
    defaultReadModes: ['static_injection'],
    staticInjectionRole:
      'Inject the current learner state: what they can do, where they are stuck, and the next teaching move.',
    dynamicDiscoveryRole:
      'Search only recent learner evidence when the user asks about status, weakness, or planning.',
    shouldStore: ['learner_mastery', 'learner_gap', 'learner_error_pattern', 'next_teaching_move'],
    shouldNotStore: ['generic_concept', 'source_evidence', 'problem_bank_item'],
    defaultBudget: DEFAULT_LAYERED_MEMORY_BUDGETS.shortTerm,
  },
  long_term: {
    id: 'long_term',
    title: 'Long-term text memory',
    storageMode: 'text_curated',
    mutationPolicy: 'append_then_curate',
    defaultReadModes: ['static_injection', 'dynamic_discovery'],
    staticInjectionRole:
      'Inject stable course rules, notebook templates, teacher conventions, and durable learner patterns.',
    dynamicDiscoveryRole:
      'Search older text memories when the current static context is insufficient or cross-notebook evidence is needed.',
    shouldStore: [
      'course_answer_contract',
      'notebook_teaching_constraint',
      'local_template',
      'learner_mastery',
      'learner_gap',
      'learner_error_pattern',
      'next_teaching_move',
    ],
    shouldNotStore: ['generic_concept', 'source_evidence', 'problem_bank_item'],
    defaultBudget: DEFAULT_LAYERED_MEMORY_BUDGETS.longTermStatic,
  },
  knowledge_cache: {
    id: 'knowledge_cache',
    title: 'Knowledge access cache',
    storageMode: 'access_cache',
    mutationPolicy: 'refresh_on_access',
    defaultReadModes: ['static_injection', 'dynamic_discovery'],
    staticInjectionRole:
      'Inject recently and frequently accessed knowledge-base hits before paying for a full RAG lookup.',
    dynamicDiscoveryRole:
      'Rank cached source/problem hits by query relevance, frequency, and recency.',
    shouldStore: ['knowledge_cache_hit'],
    shouldNotStore: ['generic_concept'],
    defaultBudget: DEFAULT_LAYERED_MEMORY_BUDGETS.knowledgeCache,
  },
  knowledge_base: {
    id: 'knowledge_base',
    title: 'Knowledge-base RAG',
    storageMode: 'rag_index',
    mutationPolicy: 'append_only_index',
    defaultReadModes: ['dynamic_discovery'],
    staticInjectionRole:
      'Inject only a tiny manifest or index summary; never paste the whole source by default.',
    dynamicDiscoveryRole:
      'Retrieve original source passages, problem-bank items, and examples that are too large for static memory.',
    shouldStore: ['source_evidence', 'problem_bank_item'],
    shouldNotStore: ['generic_concept'],
    defaultBudget: DEFAULT_LAYERED_MEMORY_BUDGETS.knowledgeBase,
  },
};

export const MEMORY_EXTRACTION_POLICY = [
  'Record course-specific answer contracts, teacher conventions, local templates, and constraints that change how a generic answer should be written.',
  'Do not store common textbook definitions just because they appeared in a source file; retrieve those from the source index only when needed.',
  'When a source contains both generic concepts and local rules, store the local rule in long-term memory and put the full source in the knowledge-base index.',
  'For learner memory, store mastery, weakness, error type, evidence, and next teaching move; do not store raw transcript fragments as the primary memory.',
  'For exact current values, use structured control facts so old semantic memories cannot override the current truth.',
  'When knowledge-base retrieval returns useful source or problem hits, refresh a small cache with recent and frequent items; do not promote cache entries into long-term memory by default.',
  'Prefer small reusable contracts over broad summaries: answer shape, allowed tools, forbidden moves, invariants, examples, and grading checks.',
];

export function inferMemoryReadPurpose(query: string): MemoryReadPurpose {
  const text = query.normalize('NFKC').toLowerCase();
  if (/学到哪|现在会|学习状态|progress|status|where am i/u.test(text)) return 'learning_status';
  if (/复习|计划|today|今天|review plan|study plan/u.test(text)) return 'review_plan';
  if (/薄弱|不会|弱点|错因|错误类型|diagnos|weakness|mistake/u.test(text)) {
    return 'weakness_diagnosis';
  }
  if (/题目|练习|problem|question|unattempted|没做|错题|wrong/u.test(text)) {
    return 'problem_search';
  }
  if (/原文|课件|source|pdf|讲义|文件|哪里写/u.test(text)) return 'source_lookup';
  if (/模板|recipe|docstring|invariant|ri|htdf|htdd|设计配方/u.test(text)) {
    return 'explain_course_template';
  }
  if (/怎么做|解释|答案|题解|answer|solve|explain/u.test(text)) {
    return 'answer_course_question';
  }
  return 'general';
}

export function createLayeredMemoryReadPlan(args: {
  targetType: 'course' | 'notebook';
  targetId: string;
  query: string;
  purpose?: MemoryReadPurpose;
  budgets?: Partial<LayeredMemoryBudgets>;
}): LayeredMemoryReadPlan {
  const purpose = args.purpose || inferMemoryReadPurpose(args.query);
  const budgets = {
    ...DEFAULT_LAYERED_MEMORY_BUDGETS,
    ...args.budgets,
  };

  const staticInjection: StaticMemoryInjectionSpec[] = [
    {
      id: 'control-facts',
      layer: 'control_facts',
      title: 'Structured current facts',
      priority: 100,
      budget: budgets.controlFacts,
      reason: 'Exact current facts override fuzzy or older text memories.',
    },
    {
      id: 'short-term-state',
      layer: 'short_term',
      title: 'Current learner state',
      priority: 90,
      budget: budgets.shortTerm,
      reason:
        'Answers, plans, and diagnosis need the latest mastery, stuck point, and next teaching move.',
    },
    {
      id: 'course-controller-memory',
      layer: 'long_term',
      title: 'Course controller memory',
      priority: 80,
      budget: budgets.longTermStatic,
      reason:
        'Stable course-wide contracts decide answer shape, allowed tools, and teacher-specific conventions.',
    },
    {
      id: 'notebook-specialist-memory',
      layer: 'long_term',
      title: 'Current notebook specialist memory',
      priority: 70,
      budget: budgets.longTermStatic,
      reason:
        'Notebook memory provides local examples, local templates, and unit-specific constraints.',
    },
    {
      id: 'knowledge-access-cache',
      layer: 'knowledge_cache',
      title: 'Recent and frequent knowledge hits',
      priority: 65,
      budget: budgets.knowledgeCache,
      reason:
        'A small cache preserves knowledge-base items that were recently or frequently useful.',
    },
  ];

  const dynamicDiscovery: DynamicMemoryDiscoverySpec[] = [];
  if (
    purpose === 'problem_search' ||
    purpose === 'weakness_diagnosis' ||
    purpose === 'review_plan' ||
    purpose === 'learning_status' ||
    purpose === 'source_lookup' ||
    purpose === 'answer_course_question'
  ) {
    dynamicDiscovery.push({
      id: 'knowledge-cache',
      layer: 'knowledge_cache',
      title: 'Knowledge cache lookup',
      priority: 78,
      budget: budgets.knowledgeCache,
      reason:
        'Use recent/frequent source and problem hits before expanding into the full knowledge base.',
    });
  }
  if (
    purpose === 'problem_search' ||
    purpose === 'weakness_diagnosis' ||
    purpose === 'review_plan' ||
    purpose === 'learning_status'
  ) {
    dynamicDiscovery.push({
      id: 'problem-bank-rag',
      layer: 'knowledge_base',
      title: 'Problem-bank retrieval',
      priority: 70,
      budget: budgets.knowledgeBase,
      reason:
        'Problem lists and attempts are too large for static injection; retrieve only matching problems.',
    });
  }
  if (purpose === 'source_lookup' || purpose === 'answer_course_question') {
    dynamicDiscovery.push({
      id: 'source-evidence-rag',
      layer: 'knowledge_base',
      title: 'Original source evidence',
      priority: 75,
      budget: budgets.knowledgeBase,
      reason:
        'Original file passages are retrieved when the answer needs exact source wording or examples.',
    });
  }
  dynamicDiscovery.push({
    id: 'semantic-text-memory',
    layer: 'long_term',
    title: 'Semantic long-term memory',
    priority: 60,
    budget: budgets.longTermDynamic,
    reason:
      'Older text memories are discovered by semantic search when static course/notebook memory is not enough.',
  });
  if (
    purpose === 'learning_status' ||
    purpose === 'review_plan' ||
    purpose === 'weakness_diagnosis'
  ) {
    dynamicDiscovery.push({
      id: 'learner-history',
      layer: 'short_term',
      title: 'Recent learner history',
      priority: 85,
      budget: budgets.learnerEvidence,
      reason:
        'Recent messages and attempts are needed to answer what the learner can do and what to teach next.',
    });
  }

  return {
    purpose,
    target: {
      targetType: args.targetType,
      targetId: args.targetId,
    },
    query: args.query,
    budgets,
    staticInjection,
    dynamicDiscovery,
    promptDirectives: [
      'Read in this order: control facts, short-term learner state, long-term course/notebook contracts, then dynamic RAG evidence.',
      'Use structure for exact current facts and RAG only for large or fuzzy discovery.',
      'When answering course questions, make the solution match course-local templates before giving generic explanations.',
      'When diagnosing the learner, state what they can do, what they cannot do yet, why, and the next teaching move.',
      'Use knowledge cache as a warm layer: recent/frequent source and problem hits are hints, while full knowledge-base RAG remains the authority for exact source text.',
      'If a source only teaches a generic concept, do not promote it into text memory unless it changes the local course answer contract.',
    ],
    extractionPolicy: MEMORY_EXTRACTION_POLICY,
  };
}
