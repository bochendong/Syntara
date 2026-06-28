import type { LearnRunContext, LearnToolContract, LearnToolId } from '../domain/types';

export const LEARN_CORE_TOOL_CONTRACTS = [
  {
    id: 'semantic_router',
    title: 'AI semantic router',
    description:
      'Use the model to choose the next typed learning action, plan, answer handoff, or no-op from the run context.',
    readsFrom: [
      'user_message',
      'conversation_state',
      'run_context',
      'memory',
      'schedule',
      'course_materials',
      'problem_bank',
    ],
    writesTo: ['decision', 'trace'],
    sideEffects: ['llm'],
    needsApproval: 'never',
    outputEvidenceSources: ['user_message', 'conversation', 'memory', 'schedule', 'system'],
  },
  {
    id: 'resolve_reference',
    title: 'Resolve learner reference',
    description:
      'Resolve phrases like this activity, the first review, current plan, or previous weak point before routing.',
    readsFrom: ['user_message', 'conversation_state', 'recent_artifacts', 'calendar'],
    writesTo: [],
    sideEffects: ['none'],
    needsApproval: 'never',
    outputEvidenceSources: ['user_message', 'conversation', 'schedule'],
  },
  {
    id: 'classify_intent',
    title: 'Classify learn turn intent',
    description:
      'Classify the latest learner message into answer, status, planning, practice, calendar, memory, source, or generation flow.',
    readsFrom: ['user_message', 'conversation_state', 'run_context'],
    writesTo: [],
    sideEffects: ['llm'],
    needsApproval: 'never',
    outputEvidenceSources: ['user_message', 'conversation', 'system'],
  },
  {
    id: 'search_memory',
    title: 'Search layered learning memory',
    description:
      'Read learner state, control facts, course memory, warm cache, and semantic source evidence.',
    readsFrom: ['memory', 'knowledge_cache'],
    writesTo: [],
    sideEffects: ['database-read', 'local-storage'],
    needsApproval: 'never',
    outputEvidenceSources: ['memory', 'knowledge_cache', 'problem_attempt'],
  },
  {
    id: 'search_schedule',
    title: 'Search course schedule',
    description: 'Read syllabus, calendar, active activity, and deadline context.',
    readsFrom: ['calendar', 'syllabus'],
    writesTo: [],
    sideEffects: ['database-read', 'local-storage'],
    needsApproval: 'never',
    outputEvidenceSources: ['schedule'],
  },
  {
    id: 'search_course_materials',
    title: 'Search course materials',
    description: 'Retrieve uploaded sources, notebooks, source passages, and answer evidence.',
    readsFrom: ['course_materials', 'notebooks', 'sources'],
    writesTo: [],
    sideEffects: ['database-read'],
    needsApproval: 'never',
    outputEvidenceSources: ['course_material', 'notebook', 'source'],
  },
  {
    id: 'search_problem_bank',
    title: 'Search problem bank',
    description: 'Retrieve bank-backed questions and problem metadata for targeted practice.',
    readsFrom: ['problem_bank', 'problem_attempts'],
    writesTo: [],
    sideEffects: ['database-read'],
    needsApproval: 'never',
    outputEvidenceSources: ['problem_bank', 'problem_attempt'],
  },
  {
    id: 'plan_review',
    title: 'Plan review or preview activity',
    description:
      'Build a study plan from schedule, learner state, source scope, problem evidence, and constraints.',
    readsFrom: ['schedule', 'memory', 'problem_bank', 'course_materials'],
    writesTo: ['artifacts'],
    sideEffects: ['llm'],
    needsApproval: 'never',
    outputEvidenceSources: ['schedule', 'memory', 'problem_bank', 'course_material'],
  },
  {
    id: 'propose_calendar_change',
    title: 'Propose calendar change',
    description: 'Create a typed, confirmation-required calendar add, update, or delete proposal.',
    readsFrom: ['calendar', 'artifacts', 'user_message'],
    writesTo: ['calendar'],
    sideEffects: ['client-executor'],
    needsApproval: 'always',
    outputEvidenceSources: ['schedule', 'user_message'],
  },
  {
    id: 'propose_memory_write',
    title: 'Propose teaching memory write',
    description:
      'Create a typed memory write candidate for mastery, weakness, cause, correction, or next teaching move.',
    readsFrom: ['user_message', 'memory', 'problem_attempts'],
    writesTo: ['memory'],
    sideEffects: ['database-write', 'local-storage'],
    needsApproval: 'always',
    outputEvidenceSources: ['memory', 'user_message', 'problem_attempt'],
  },
  {
    id: 'propose_practice_generation',
    title: 'Propose practice generation',
    description:
      'Prepare a confirmation-required practice selection or generation request grounded in bank/memory evidence.',
    readsFrom: ['memory', 'problem_bank', 'problem_attempts'],
    writesTo: ['practice'],
    sideEffects: ['llm', 'client-executor'],
    needsApproval: 'always',
    outputEvidenceSources: ['problem_bank', 'memory', 'problem_attempt'],
  },
  {
    id: 'answer_course_question',
    title: 'Answer course question',
    description:
      'Hand off to the course answerer with evidence requirements and forbidden behaviors.',
    readsFrom: ['memory', 'course_materials', 'notebooks', 'problem_bank'],
    writesTo: [],
    sideEffects: ['llm'],
    needsApproval: 'never',
    outputEvidenceSources: ['course_material', 'notebook', 'memory', 'problem_bank'],
  },
] satisfies readonly LearnToolContract[];

export function getLearnCoreTool(id: LearnToolId): LearnToolContract | null {
  return LEARN_CORE_TOOL_CONTRACTS.find((tool) => tool.id === id) ?? null;
}

export function isLearnCoreToolEnabled(ctx: LearnRunContext, tool: LearnToolContract): boolean {
  if (tool.id === 'search_problem_bank') return ctx.input.problemBank.activeCount > 0;
  if (tool.id === 'search_course_materials') {
    return ctx.input.sourceUploads.length > 0 || ctx.input.hasSyllabus;
  }
  if (tool.id === 'search_schedule') {
    return ctx.input.calendarEvents.length > 0 || ctx.input.hasSyllabus;
  }
  return true;
}

export function listEnabledLearnCoreToolIds(ctx: LearnRunContext): LearnToolId[] {
  return LEARN_CORE_TOOL_CONTRACTS.filter((tool) => isLearnCoreToolEnabled(ctx, tool)).map(
    (tool) => tool.id,
  );
}
