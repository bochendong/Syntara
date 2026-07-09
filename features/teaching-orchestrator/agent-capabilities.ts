import type { AgentSkillDefinition, AgentToolDefinition } from '@/features/agent/domain/types';
import { TEACHING_TOOL_CONTRACTS } from './domain/tool-contracts';
import type { TeachingToolContract } from './domain/types';

function agentToolFromTeachingContract(contract: TeachingToolContract): AgentToolDefinition {
  const sideEffects = contract.sideEffects as readonly string[];
  const isReviewPlanTool = contract.id === 'generate_evidence_based_review_plan';
  return {
    id: contract.id,
    namespace: contract.namespace,
    feature: 'teaching',
    title: contract.title,
    description: contract.description,
    status: isReviewPlanTool ? 'route-backed' : 'planned',
    inputContract:
      'Teaching orchestration request with target ids, intent, prior tool evidence, and locale.',
    outputContract:
      'Structured TeachingDecision or TeachingEvidence list with evidence ids, rationale, and evidence gaps.',
    entrypoints: [
      ...(isReviewPlanTool
        ? [{ kind: 'route' as const, method: 'POST' as const, ref: '/api/teaching/review-plan' }]
        : []),
      {
        kind: 'domain',
        ref: `@/features/teaching-orchestrator/domain/tool-contracts#${contract.id}`,
      },
    ],
    sideEffects: contract.sideEffects,
    requiresAuth: true,
    requiresDatabase:
      sideEffects.includes('database-read') || sideEffects.includes('database-write'),
  };
}

export const TEACHING_ORCHESTRATOR_AGENT_TOOLS = TEACHING_TOOL_CONTRACTS.map(
  agentToolFromTeachingContract,
) satisfies readonly AgentToolDefinition[];

export const TEACHING_ORCHESTRATOR_SKILL = {
  id: 'teaching_orchestrator',
  title: 'Teaching orchestrator',
  primaryUserFunction: 'Teaching orchestration',
  description:
    'Route OpenMAIC learning requests through tool-based teaching modes with an evidence ledger for plans, question selection, explanations, grading, and memory writes.',
  skillDocumentPath: 'features/agent/skills/teaching-orchestrator/SKILL.md',
  skillDocumentUri: 'openmaic://skills/teaching_orchestrator',
  supportingSkillDocumentIds: [],
  mcpNamespaces: [
    'openmaic.teaching',
    'openmaic.content',
    'openmaic.memory',
    'openmaic.problem_bank',
    'openmaic.review',
  ],
  toolIds: TEACHING_TOOL_CONTRACTS.map((tool) => tool.id),
  stages: [
    {
      id: 'intent',
      title: 'Classify intent',
      description:
        'Decide whether the request is answer, status, review planning, question selection, grading, explanation, generation, or ingestion.',
      toolIds: ['classify_teaching_intent', 'resolve_fixed_review_workflow'],
      required: true,
    },
    {
      id: 'evidence',
      title: 'Collect evidence',
      description:
        'Read learning state, schedule, memory, attempts, problem bank, templates, and course materials required for the selected mode.',
      toolIds: [
        'get_learning_state',
        'get_schedule_context',
        'search_teaching_memory',
        'search_problem_attempts',
        'search_problem_bank',
        'search_template_library',
        'search_course_materials',
      ],
      required: true,
    },
    {
      id: 'decision',
      title: 'Make teaching decision',
      description:
        'Generate the answer, review plan, question selection, grading feedback, or explanation with evidence-backed rationale.',
      toolIds: [
        'select_review_targets',
        'generate_evidence_based_review_plan',
        'select_evidence_based_review_questions',
        'grade_answer_with_diagnosis',
        'explain_concept_with_templates',
      ],
      required: true,
    },
    {
      id: 'memory-extraction',
      title: 'Extract teaching memory',
      description:
        'Classify and extract learner facts, question diagnoses, attempt signals, mistake patterns, source contracts, and corrections before choosing a storage layer.',
      toolIds: [
        'classify_memory_extraction_signal',
        'extract_teaching_memory_signal',
        'route_teaching_memory_write',
      ],
      required: false,
    },
    {
      id: 'writeback',
      title: 'Write teaching memory',
      description:
        'Write short-term learner state, long-term learner patterns, progress, or control facts only when supported by evidence.',
      toolIds: ['write_teaching_memory'],
      required: false,
    },
  ],
  qualityGates: [
    'Review requests use a fixed workflow: resolve scope, ask explain/practice/both if missing, collect evidence, execute the selected branch, then extract memory.',
    'Do not generate a review plan directly from the user prompt; collect schedule, learner-state, attempt, problem-bank, and template evidence first.',
    'For named concept review, do not silently choose between explanation and practice when the learner did not choose. Ask the fixed mode question.',
    'For range/exam review, infer days and frequency from syllabus, current date, deadlines, and learner constraints. Ask only when the window cannot be inferred.',
    'Every review plan must explain which schedule/deadline and which weak point or wrong attempt influenced each task. If either is missing, the answer must say so.',
    'Every review question selection must explain whether the question came from a real problem-bank item or was generated as a diagnostic fallback.',
    'Every grading result must cite the submitted attempt plus the problem/rubric/template evidence used for the score.',
    'Every concept explanation must check local template memory before falling back to generic explanation.',
    'Memory extraction is typed: facts, question diagnoses, attempts, mistake patterns, feedback, source memory, problem metadata, cache hits, and corrections must route to different storage layers.',
    'Memory writes must store mastery, weakness, cause, and next teaching move instead of raw transcript fragments.',
  ],
  outputs: [
    'TeachingDecision with evidence ledger',
    'User-facing rationale lines',
    'Evidence gaps and fallbacks',
    'Optional memory/progress writeback plan',
  ],
} satisfies AgentSkillDefinition;
