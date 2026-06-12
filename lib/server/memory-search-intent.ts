import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';

const log = createLogger('MemorySearchIntent');

export type MemorySearchProgressFilter = 'unattempted' | 'wrong_or_partial' | 'attempted';
export type MemorySearchScopeMode = 'notebook_local' | 'course_wide' | 'auto_expand';

export type MemorySearchIntentKind =
  | 'concept'
  | 'problem'
  | 'unattempted_problem'
  | 'weakness_review'
  | 'learner_understanding'
  | 'learning_status'
  | 'learner_questions'
  | 'general';

export type MemorySearchKnowledgeType =
  | 'structured_facts'
  | 'study_memory'
  | 'problem_bank'
  | 'knowledge_sources'
  | 'learner_history';

export type MemorySearchIntent = {
  kind: MemorySearchIntentKind;
  originalQuery: string;
  rewrittenQuery: string;
  progressFilter: MemorySearchProgressFilter | null;
  scopeMode: MemorySearchScopeMode;
  scopeReason: string;
  knowledgeTypes: MemorySearchKnowledgeType[];
  matchedSignals: string[];
  notes: string[];
  source: 'ai' | 'fallback';
  plan: {
    summary: string;
    answerMode: 'explain' | 'list_results' | 'review_weakness' | 'mixed';
    primarySources: MemorySearchKnowledgeType[];
    secondarySources: MemorySearchKnowledgeType[];
    searchQueries: string[];
    filters: {
      progress: MemorySearchProgressFilter | null;
      tags: string[];
      notebookHints: string[];
      courseHints: string[];
    };
  };
};

const knowledgeTypeSchema = z.enum([
  'structured_facts',
  'study_memory',
  'problem_bank',
  'knowledge_sources',
  'learner_history',
]);

const progressFilterSchema = z.enum(['unattempted', 'wrong_or_partial', 'attempted']);
const scopeModeSchema = z.enum(['notebook_local', 'course_wide', 'auto_expand']);
const nullableProgressFilterSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'null' || normalized === 'none' || normalized === 'n/a') {
      return null;
    }
  }
  return value;
}, progressFilterSchema.nullable());

const aiIntentSchema = z.object({
  kind: z.enum([
    'concept',
    'problem',
    'unattempted_problem',
    'weakness_review',
    'learner_understanding',
    'learning_status',
    'learner_questions',
    'general',
  ]),
  rewrittenQuery: z.string().optional().nullable(),
  progressFilter: nullableProgressFilterSchema.optional(),
  scopeMode: scopeModeSchema.optional(),
  scopeReason: z.string().optional().nullable(),
  knowledgeTypes: z.array(knowledgeTypeSchema).optional(),
  matchedSignals: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  plan: z
    .object({
      summary: z.string().optional().nullable(),
      answerMode: z.enum(['explain', 'list_results', 'review_weakness', 'mixed']).optional(),
      primarySources: z.array(knowledgeTypeSchema).optional(),
      secondarySources: z.array(knowledgeTypeSchema).optional(),
      searchQueries: z.array(z.string()).optional(),
      filters: z
        .object({
          progress: nullableProgressFilterSchema.optional(),
          tags: z.array(z.string()).optional(),
          notebookHints: z.array(z.string()).optional(),
          courseHints: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

function compact(input: string | null | undefined, maxLength = 280): string {
  const text = String(input || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
}

function compactList(input: unknown, maxItems: number, maxItemLength = 120): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => compact(String(item || ''), maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text: string): unknown {
  const cleaned = stripCodeFences(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonrepair(candidate));
}

function uniqueKnowledgeTypes(types: Array<MemorySearchKnowledgeType | null | undefined>) {
  const result = new Set<MemorySearchKnowledgeType>();
  for (const type of types) {
    if (type) result.add(type);
  }
  return [...result];
}

function explicitScopeModeFromQuery(args: {
  query: string;
  targetType: 'course' | 'notebook';
}): MemorySearchScopeMode | null {
  if (args.targetType === 'course') return 'course_wide';
  const text = args.query.normalize('NFKC').toLowerCase();
  if (
    /整门课|整个课程|全课程|所有笔记本|全部笔记本|全(部)?notebook|all notebooks|whole course|entire course/u.test(
      text,
    )
  ) {
    return 'course_wide';
  }
  if (/其他笔记本|别的笔记本|其它笔记本|其他notebook|similar.*notebook|elsewhere/u.test(text)) {
    return 'auto_expand';
  }
  if (/当前笔记本|这个笔记本|本笔记本|当前notebook|this notebook/u.test(text)) {
    return 'notebook_local';
  }
  return null;
}

function normalizeIntent(input: {
  originalQuery: string;
  source: MemorySearchIntent['source'];
  targetType?: 'course' | 'notebook';
  parsed?: z.infer<typeof aiIntentSchema>;
  fallbackReason?: string;
}): MemorySearchIntent {
  const originalQuery = compact(input.originalQuery, 2000);
  const parsed = input.parsed;
  const kind: MemorySearchIntentKind = parsed?.kind || 'general';
  let progressFilter = parsed?.progressFilter ?? parsed?.plan?.filters?.progress ?? null;
  const targetType = input.targetType || 'course';
  const defaultScopeMode: MemorySearchScopeMode =
    targetType === 'course' ? 'course_wide' : 'notebook_local';
  const explicitScopeMode = explicitScopeModeFromQuery({
    query: originalQuery,
    targetType,
  });
  const scopeMode: MemorySearchScopeMode =
    explicitScopeMode ||
    (targetType === 'course' ? 'course_wide' : parsed?.scopeMode || defaultScopeMode);
  const scopeReason = explicitScopeMode
    ? `The user explicitly named the retrieval scope, so scopeMode is ${explicitScopeMode}.`
    : compact(parsed?.scopeReason, 220) ||
      (scopeMode === 'course_wide'
        ? 'The query should be answered from the whole course context.'
        : scopeMode === 'auto_expand'
          ? 'Start from the current notebook and allow expansion to course evidence when local evidence is insufficient or the user asks across notebooks.'
          : 'The query should stay grounded in the current notebook context.');

  if (kind === 'unattempted_problem' && !progressFilter) {
    progressFilter = 'unattempted';
  } else if (kind === 'weakness_review' && !progressFilter) {
    progressFilter = 'wrong_or_partial';
  }

  const planSearchQueries = compactList(parsed?.plan?.searchQueries, 4);
  const rewrittenQuery =
    compact(parsed?.rewrittenQuery, 400) || planSearchQueries[0] || compact(originalQuery, 400);

  const primarySources = uniqueKnowledgeTypes(parsed?.plan?.primarySources || []);
  const secondarySources = uniqueKnowledgeTypes(parsed?.plan?.secondarySources || []);
  const declaredSources = uniqueKnowledgeTypes([
    ...(parsed?.knowledgeTypes || []),
    ...primarySources,
    ...secondarySources,
  ]);
  const defaultSources: MemorySearchKnowledgeType[] =
    input.source === 'ai'
      ? ['structured_facts', 'study_memory', 'knowledge_sources']
      : ['structured_facts', 'study_memory', 'knowledge_sources', 'problem_bank'];
  const needsProblemBank =
    Boolean(progressFilter) ||
    kind === 'problem' ||
    kind === 'unattempted_problem' ||
    kind === 'weakness_review' ||
    kind === 'learner_understanding' ||
    kind === 'learning_status' ||
    (input.source === 'ai' && kind === 'concept');
  const needsLearnerHistory =
    kind === 'weakness_review' ||
    kind === 'learner_understanding' ||
    kind === 'learning_status' ||
    kind === 'learner_questions';
  const knowledgeTypes = uniqueKnowledgeTypes([
    'structured_facts',
    ...declaredSources,
    ...(declaredSources.length === 0 ? defaultSources : []),
    needsLearnerHistory ? 'study_memory' : null,
    needsProblemBank ? 'problem_bank' : null,
    needsLearnerHistory ? 'learner_history' : null,
  ]);

  const normalizedPrimary =
    primarySources.length > 0
      ? primarySources
      : knowledgeTypes.filter((type) => type !== 'structured_facts').slice(0, 2);
  const secondaryBase =
    secondarySources.length > 0
      ? secondarySources.filter((type) => !normalizedPrimary.includes(type))
      : knowledgeTypes.filter((type) => !normalizedPrimary.includes(type));
  const normalizedSecondary = uniqueKnowledgeTypes([
    ...secondaryBase,
    ...knowledgeTypes.filter(
      (type) => !normalizedPrimary.includes(type) && !secondaryBase.includes(type),
    ),
  ]);

  const summary =
    compact(parsed?.plan?.summary, 260) ||
    (input.source === 'ai'
      ? 'AI planned a semantic memory search.'
      : 'Planner unavailable; using broad memory discovery without intent hard rules.');

  const matchedSignals = compactList(parsed?.matchedSignals, 8);

  return {
    kind,
    originalQuery,
    rewrittenQuery,
    progressFilter,
    scopeMode,
    scopeReason,
    knowledgeTypes,
    matchedSignals:
      matchedSignals.length > 0
        ? matchedSignals
        : input.fallbackReason
          ? [`fallback:${input.fallbackReason}`]
          : [],
    notes: [
      ...compactList(parsed?.notes, 6, 180),
      input.source === 'ai'
        ? 'Intent was produced by the AI memory-search planner.'
        : `AI planner unavailable: ${input.fallbackReason || 'unknown'}.`,
      input.source === 'ai' && kind === 'concept'
        ? 'For concept searches, problem-bank matches may be used as secondary example evidence, but not as the primary answer format.'
        : '',
      'Structured facts remain exact current values and override fuzzy recall.',
    ].filter(Boolean),
    source: input.source,
    plan: {
      summary,
      answerMode: parsed?.plan?.answerMode || (kind === 'concept' ? 'explain' : 'mixed'),
      primarySources: normalizedPrimary,
      secondarySources: normalizedSecondary,
      searchQueries: uniqueStrings([rewrittenQuery, ...planSearchQueries]).slice(0, 4),
      filters: {
        progress: progressFilter,
        tags: compactList(parsed?.plan?.filters?.tags, 8, 80),
        notebookHints: compactList(parsed?.plan?.filters?.notebookHints, 5, 100),
        courseHints: compactList(parsed?.plan?.filters?.courseHints, 5, 100),
      },
    },
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => compact(value, 160)).filter(Boolean)));
}

export function inferMemorySearchIntent(
  query: string,
  targetType?: 'course' | 'notebook',
): MemorySearchIntent {
  return normalizeIntent({
    originalQuery: query,
    source: 'fallback',
    targetType,
    fallbackReason: 'no_ai_planner',
  });
}

export async function planMemorySearchIntent(args: {
  query: string;
  model: LanguageModel;
  targetType?: 'course' | 'notebook';
}): Promise<MemorySearchIntent> {
  const query = compact(args.query, 2000);
  if (!query) return inferMemorySearchIntent(query);

  const system = `You are the OpenMAIC memory-search planner.
Create a structured retrieval plan for a natural-language query.

Do NOT classify by keyword triggers. Infer the user's search goal semantically.
Return ONLY JSON. No markdown fences.

Available retrieval sources:
- structured_facts: exact current facts and preferences. Best for current truth such as course requirements, language, budget, identity, goals, and constraints.
- study_memory: public course/notebook memory plus private learner memory. Best for concepts, summaries, mistakes, learning patterns, teacher requirements, and durable course context.
- knowledge_sources: notebook/course materials, uploaded files, indexed conversations, and document-like knowledge. Best for conceptual explanations or source-grounded knowledge.
- problem_bank: problems, exercises, user answers, attempt status, tags, and difficulty. Best only when the user is asking for questions, practice, solved/unsolved/wrong attempts, examples, or exercise-like material.
- learner_history: the current learner's prior questions, answers, attempts, and progress. Best when the user asks what the student understands, has asked before, has done, got wrong, or needs to review.
- For course policy, course requirements, preferences, requirements, identity/profile, or administrative facts, prefer structured_facts + study_memory + knowledge_sources. Do not include problem_bank unless the user also asks for exercises, answers, or attempt status.
- If the query could mean either a concept source or a problem source, plan to retrieve both original source material and problem_bank evidence. Do not force a single class when the user's words are ambiguous.

Scope modes:
- notebook_local: use when Target is notebook and the user appears to ask about this notebook, current lesson, current source material, this notebook's problems, or this notebook's learner activity.
- course_wide: use when Target is course, or when a notebook-targeted user explicitly asks for the whole course, all notebooks, the whole term/course, cross-notebook progress, cross-notebook weak points, or course-level policy.
- auto_expand: use when Target is notebook and the user starts locally but may need course evidence, such as "other notebooks", "similar problems elsewhere", "if this notebook has no records", or broad comparison from a notebook chat.
- For Target=course, scopeMode must be course_wide.
- For Target=notebook, default to notebook_local unless the user's actual information need crosses notebook boundaries.

Progress filters:
- unattempted: only if the user asks for not-yet-done questions.
- wrong_or_partial: only if the user asks for wrong, failed, half-right, or weak problems.
- attempted: only if the user asks for already answered work.
- null otherwise.
- Asking to "find a problem", "give me one exercise", or "search for a question" is a normal problem search, not unattempted_problem, unless the user explicitly says not done / unattempted / 没做 / 未做 / 还没做.

Choose kind:
- concept: user wants an explanation, conceptual understanding, theorem/method relationship, source-grounded knowledge, or "what is going on here".
- problem: user wants one or more questions/exercises/problems.
- unattempted_problem: user wants not-yet-done exercises.
- weakness_review: user wants wrong/weak areas or mistake review.
- learner_understanding: user wants an assessment of what this learner knows about a concept, based on prior questions, attempts, and private learning memory.
- learning_status: user wants a learning report over a time window, such as this week, this month, the whole term, recent progress, study activity, completion, or overall learning condition.
- learner_questions: user wants to know what the learner asked before, recent questions, recurring confusions, or question history.
- general: course policy, current fact, broad memory lookup, or mixed search that does not fit above. Do not use general when the user is asking about learner activity, learner mastery, learner weak points, or learner question history.

Semantic examples:
- "这周学生的学习情况怎么样" in a notebook chat -> kind=learning_status; scopeMode=notebook_local; primarySources=["learner_history","study_memory","problem_bank"]; progressFilter=null.
- "整门课这周学生怎么样" in a notebook chat -> kind=learning_status; scopeMode=course_wide; primarySources=["learner_history","study_memory","problem_bank"]; progressFilter=null.
- "其他笔记本有没有类似题" in a notebook chat -> kind=problem; scopeMode=auto_expand; primarySources=["problem_bank","knowledge_sources"]; progressFilter=null.
- "整学期学生问过什么问题" in a course chat -> kind=learner_questions; scopeMode=course_wide; primarySources=["learner_history"]; progressFilter=null.
- "分部积分选 u 掌握得怎么样" -> kind=learner_understanding; primarySources=["learner_history","study_memory","problem_bank"]; progressFilter=null.
- "积分换元的薄弱点在哪里" -> kind=weakness_review; primarySources=["learner_history","study_memory","problem_bank"]; progressFilter="wrong_or_partial".
- "分部积分选 u 的原文在哪里" -> kind=concept; primarySources=["knowledge_sources"]; progressFilter=null.

JSON schema:
{
  "kind": "concept | problem | unattempted_problem | weakness_review | learner_understanding | learning_status | learner_questions | general",
  "rewrittenQuery": "short search query optimized for retrieval, preserving math terms",
  "progressFilter": "unattempted | wrong_or_partial | attempted | null",
  "scopeMode": "notebook_local | course_wide | auto_expand",
  "scopeReason": "one short sentence explaining why this scope is appropriate",
  "knowledgeTypes": ["structured_facts", "study_memory", "knowledge_sources", "problem_bank", "learner_history"],
  "matchedSignals": ["short semantic reasons, not regex names"],
  "notes": ["execution notes for retrievers"],
  "plan": {
    "summary": "one sentence explaining what the user is really trying to search",
    "answerMode": "explain | list_results | review_weakness | mixed",
    "primarySources": ["structured_facts", "study_memory", "knowledge_sources", "problem_bank", "learner_history"],
    "secondarySources": ["structured_facts", "study_memory", "knowledge_sources", "problem_bank", "learner_history"],
    "searchQueries": ["up to 4 alternate retrieval phrasings"],
    "filters": {
      "progress": "unattempted | wrong_or_partial | attempted | null",
      "tags": ["optional tags"],
      "notebookHints": ["optional notebook names/topics"],
      "courseHints": ["optional course names/codes/topics"]
    }
  }
}`;

  const prompt = [
    `Target: ${args.targetType || 'course'}`,
    `User query: ${query}`,
    '',
    'Plan the retrieval. Remember: if the user is asking for a concept, do not make the problem bank the primary source just because the concept also appears in exercises.',
  ].join('\n');

  try {
    const result = await callLLM(
      {
        model: args.model,
        system,
        prompt,
        maxOutputTokens: 900,
      },
      'memory-search-plan',
      {
        retries: 1,
        validate: (text) => {
          try {
            aiIntentSchema.parse(parseJsonObject(text));
            return true;
          } catch {
            return false;
          }
        },
      },
      { enabled: false },
    );
    const parsed = aiIntentSchema.parse(parseJsonObject(result.text));
    return normalizeIntent({
      originalQuery: query,
      source: 'ai',
      targetType: args.targetType,
      parsed,
    });
  } catch (error) {
    log.warn('AI memory search planner failed; falling back to broad discovery.', error);
    return normalizeIntent({
      originalQuery: query,
      source: 'fallback',
      targetType: args.targetType,
      fallbackReason: error instanceof Error ? error.message : 'planner_failed',
    });
  }
}
