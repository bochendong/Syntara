import {
  buildMemoryRecallContext,
  type MemoryContextTargetType,
  type MemoryRecallContext,
} from '@/lib/server/study-memory-context';
import type { MemorySearchIntent } from '@/lib/server/memory-search-intent';
import {
  createLayeredMemoryReadPlan,
  DEFAULT_LAYERED_MEMORY_BUDGETS,
  type LayeredMemoryLayerSummary,
  type LayeredMemoryReadPlan,
} from '@/features/memory/domain/layered-memory';

export type LayeredMemoryRecallContext = MemoryRecallContext & {
  readPlan: LayeredMemoryReadPlan;
  layers: LayeredMemoryLayerSummary[];
};

function compact(input: string, maxChars: number): string {
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function formatReadPlan(plan: LayeredMemoryReadPlan): string {
  const staticItems = plan.staticInjection
    .map(
      (item) =>
        `- ${item.title}: ${item.reason} (budget ${item.budget.maxItems} items / ${item.budget.maxChars} chars)`,
    )
    .join('\n');
  const dynamicItems = plan.dynamicDiscovery
    .map(
      (item) =>
        `- ${item.title}: ${item.reason} (budget ${item.budget.maxItems} items / ${item.budget.maxChars} chars)`,
    )
    .join('\n');

  return [
    '## Memory operating plan',
    `purpose: ${plan.purpose}`,
    `target: ${plan.target.targetType}:${plan.target.targetId}`,
    '',
    'Static injection:',
    staticItems || '- none',
    '',
    'Dynamic discovery:',
    dynamicItems || '- none',
    '',
    'Rules:',
    ...plan.promptDirectives.map((directive) => `- ${directive}`),
  ].join('\n');
}

function summarizeMemoryLayers(
  context: MemoryRecallContext,
  plan: LayeredMemoryReadPlan,
): LayeredMemoryLayerSummary[] {
  return [
    {
      layer: 'control_facts',
      title: 'Structured control facts',
      readModes: ['static_injection'],
      itemCount: context.staticFacts.length,
      maxChars: plan.budgets.controlFacts.maxChars,
      sources: ['MemoryFact'],
      notes: [
        'Exact current values are injected before text memory.',
        context.conflicts.length
          ? `${context.conflicts.length} superseded/conflicting values were resolved.`
          : 'No fact conflict was detected.',
      ],
    },
    {
      layer: 'short_term',
      title: 'Short-term learner state',
      readModes: context.learnerAnalyticsCount > 0 ? ['static_injection', 'dynamic_discovery'] : [],
      itemCount: context.learnerAnalyticsCount > 0 ? 1 : 0,
      maxChars: plan.budgets.shortTerm.maxChars + plan.budgets.learnerEvidence.maxChars,
      sources: ['NotebookWorkingMemory', 'learner analytics', 'recent messages', 'recent attempts'],
      notes: [
        'Client local-first working memory should be merged here when available.',
        'Server learner analytics fills the same role for database-backed conversations.',
      ],
    },
    {
      layer: 'long_term',
      title: 'Long-term text memory',
      readModes: ['static_injection', 'dynamic_discovery'],
      itemCount:
        context.platformMemories.length +
        context.courseControllerMemories.length +
        context.currentNotebookMemories.length +
        context.specialistMemories.length,
      maxChars: plan.budgets.longTermStatic.maxChars + plan.budgets.longTermDynamic.maxChars,
      sources: ['StudyMemory', 'StudyMemoryChunk'],
      notes: [
        'Platform memories capture user/platform-wide context that can apply across courses.',
        'Course controller memories decide course-wide templates and constraints.',
        'Notebook specialist memories explain local examples and unit-specific answer shape.',
      ],
    },
    {
      layer: 'knowledge_cache',
      title: 'Knowledge access cache',
      readModes: context.knowledgeCacheCount > 0 ? ['static_injection', 'dynamic_discovery'] : [],
      itemCount: context.knowledgeCacheCount,
      maxChars: plan.budgets.knowledgeCache.maxChars,
      sources: ['MemoryKnowledgeCache'],
      notes: [
        'Recent/frequent source and problem hits are read before full knowledge-base expansion.',
        'Cache entries are hints; original source evidence remains authoritative for exact wording.',
      ],
    },
    {
      layer: 'knowledge_base',
      title: 'Knowledge-base RAG',
      readModes: ['dynamic_discovery'],
      itemCount: context.knowledgeMatches.length + context.sourceEvidence.length,
      maxChars: plan.budgets.knowledgeBase.maxChars,
      sources: ['source evidence', 'problem bank'],
      notes: [
        'Full sources and large problem sets stay searchable instead of being statically pasted.',
        'Use retrieved passages as evidence, not as current learner state.',
      ],
    },
  ];
}

function buildLayeredPrompt(context: MemoryRecallContext, plan: LayeredMemoryReadPlan): string {
  if (context.prompt === 'N/A') return context.prompt;
  return compact(
    [
      'Use the OpenMAIC layered memory system below.',
      'The goal is not to remember everything; it is to inject the small state that changes the answer and retrieve large evidence only when needed.',
      '',
      formatReadPlan(plan),
      '',
      context.prompt,
    ].join('\n'),
    plan.budgets.total.maxChars || DEFAULT_LAYERED_MEMORY_BUDGETS.total.maxChars,
  );
}

export async function buildLayeredMemoryRecallContext(args: {
  targetType: MemoryContextTargetType;
  targetId: string;
  userId?: string;
  question: string;
  conversationId?: string | null;
  searchIntent?: MemorySearchIntent;
}): Promise<LayeredMemoryRecallContext> {
  const context = await buildMemoryRecallContext(args);
  const readPlan = createLayeredMemoryReadPlan({
    targetType: args.targetType,
    targetId: args.targetId,
    query: context.searchIntent.rewrittenQuery || args.question,
  });
  const layers = summarizeMemoryLayers(context, readPlan);
  return {
    ...context,
    prompt: buildLayeredPrompt(context, readPlan),
    readPlan,
    layers,
  };
}

function hasLayeredMemoryEvidence(context: LayeredMemoryRecallContext): boolean {
  return (
    context.directCount > 0 ||
    context.semanticCount > 0 ||
    context.knowledgeCacheCount > 0 ||
    context.knowledgeCount > 0 ||
    context.sourceEvidenceCount > 0 ||
    context.staticFacts.length > 0
  );
}

export async function buildLayeredNotebookStudyMemoryPromptContext(args: {
  notebookId: string;
  courseId?: string | null;
  userId?: string;
  question: string;
  conversationId?: string | null;
  searchIntent?: MemorySearchIntent;
}): Promise<LayeredMemoryRecallContext> {
  const notebookContext = await buildLayeredMemoryRecallContext({
    targetType: 'notebook',
    targetId: args.notebookId,
    userId: args.userId,
    question: args.question,
    conversationId: args.conversationId,
    searchIntent: args.searchIntent,
  });
  if (hasLayeredMemoryEvidence(notebookContext) || !args.courseId) {
    return notebookContext;
  }

  const courseContext = await buildLayeredMemoryRecallContext({
    targetType: 'course',
    targetId: args.courseId,
    userId: args.userId,
    question: args.question,
    conversationId: args.conversationId,
    searchIntent: args.searchIntent,
  });
  return {
    ...courseContext,
    scope: {
      ...courseContext.scope,
      expanded: true,
      originalTargetType: 'notebook',
      originalTargetId: args.notebookId,
      reason: `${courseContext.scope.reason} Fallback to course-level layered memory because the notebook target had no readable memory evidence.`,
    },
  };
}
