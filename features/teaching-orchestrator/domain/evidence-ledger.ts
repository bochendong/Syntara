import type {
  TeachingAction,
  TeachingDecision,
  TeachingEvidence,
  TeachingEvidenceGap,
  TeachingEvidenceLedger,
  TeachingEvidenceSourceType,
  TeachingIntent,
  TeachingMemoryWrite,
  TeachingToolCallRecord,
} from './types';

type EvidenceRequirement = {
  anyOf: TeachingEvidenceSourceType[];
  reason: string;
  fallback: string;
};

const ACTION_EVIDENCE_REQUIREMENTS: Partial<Record<TeachingAction, EvidenceRequirement[]>> = {
  workflow_routing: [
    {
      anyOf: ['control_fact', 'memory', 'schedule', 'problem_bank'],
      reason:
        'Workflow routing should know whether the learner has a target, preferred review mode, schedule window, or practice source.',
      fallback: 'Ask for the missing scope or mode instead of silently choosing a review branch.',
    },
  ],
  learning_status: [
    {
      anyOf: ['control_fact', 'memory', 'problem_attempt'],
      reason: 'Learning status must come from current learner state, memory, or recent attempts.',
      fallback: 'Say that no reliable learner-state evidence was found before summarizing.',
    },
  ],
  review_plan: [
    {
      anyOf: ['schedule'],
      reason:
        'A review plan should explain which deadline, class session, or calendar window shaped it.',
      fallback: 'State that no schedule evidence was found and plan from learner state only.',
    },
    {
      anyOf: ['memory', 'conversation', 'control_fact', 'problem_attempt'],
      reason:
        'A review plan needs learner-state evidence, such as mastered concepts, weak points, or wrong attempts.',
      fallback:
        'State that learner-state evidence is missing and ask for practice or diagnostic input.',
    },
    {
      anyOf: ['problem_attempt', 'problem_bank', 'template'],
      reason:
        'A review plan should connect tasks to previous mistakes, candidate practice, or local course templates.',
      fallback:
        'State that no attempt/problem/template evidence was found and avoid claiming personalization.',
    },
  ],
  question_selection: [
    {
      anyOf: ['problem_bank'],
      reason:
        'Review questions must be selected from available problem-bank records or generated as new items.',
      fallback: 'State that the problem bank is thin and mark questions as generated diagnostics.',
    },
    {
      anyOf: ['problem_attempt', 'memory', 'conversation', 'control_fact'],
      reason:
        'Question selection must explain which weak point, wrong attempt, or learner-state signal triggered it.',
      fallback: 'State that no prior attempt evidence was found and use a diagnostic ordering.',
    },
  ],
  practice_generation: [
    {
      anyOf: ['memory', 'problem_attempt', 'template'],
      reason: 'Generated practice should target a known weakness or course template contract.',
      fallback:
        'State that generated practice is exploratory because no learner/template evidence was found.',
    },
  ],
  explanation: [
    {
      anyOf: ['template', 'course_material', 'notebook', 'memory', 'knowledge_cache'],
      reason:
        'Concept explanations should reuse local templates or source context before generic prose.',
      fallback:
        'State that no local template/source evidence was found before giving a generic explanation.',
    },
  ],
  grading_feedback: [
    {
      anyOf: ['problem_bank', 'template', 'course_material'],
      reason:
        'Grading feedback should cite the problem, rubric, answer contract, or source material.',
      fallback:
        'State that no rubric/template evidence was found and grade with a conservative generic rubric.',
    },
    {
      anyOf: ['problem_attempt'],
      reason: 'Grading feedback should point at the submitted attempt that caused the diagnosis.',
      fallback:
        'State that no persisted attempt evidence was found and only use the submitted answer.',
    },
  ],
  memory_extraction: [
    {
      anyOf: ['memory', 'control_fact', 'problem_attempt', 'course_material', 'problem_bank'],
      reason:
        'Memory extraction must be grounded in a learner signal, submitted attempt, source document, or problem-bank event.',
      fallback: 'Skip the memory write when the signal would not change a future teaching action.',
    },
  ],
  memory_write: [
    {
      anyOf: ['memory', 'control_fact', 'problem_attempt', 'course_material', 'problem_bank'],
      reason:
        'Teaching memory writes must cite the learner signal, attempt, course source, or problem metadata that supports the write.',
      fallback: 'Do not write memory from unsupported transcript text.',
    },
  ],
  notebook_generation: [
    {
      anyOf: ['course_material', 'template', 'memory'],
      reason:
        'Notebook generation should be grounded in source material and reusable course memory.',
      fallback:
        'State that generation is based only on the prompt because no course source was found.',
    },
  ],
};

function uniqueEvidenceKey(evidence: TeachingEvidence): string {
  return `${evidence.sourceType}:${evidence.sourceId}:${evidence.id}`;
}

function hasAnySource(
  evidence: TeachingEvidence[],
  sourceTypes: readonly TeachingEvidenceSourceType[],
): boolean {
  return evidence.some((item) => sourceTypes.includes(item.sourceType));
}

export function dedupeTeachingEvidence(evidence: readonly TeachingEvidence[]): TeachingEvidence[] {
  const seen = new Set<string>();
  const result: TeachingEvidence[] = [];
  for (const item of evidence) {
    const key = uniqueEvidenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function findEvidenceGaps(
  action: TeachingAction,
  evidence: readonly TeachingEvidence[],
): TeachingEvidenceGap[] {
  const items = dedupeTeachingEvidence(evidence);
  return (ACTION_EVIDENCE_REQUIREMENTS[action] || [])
    .filter((requirement) => !hasAnySource(items, requirement.anyOf))
    .map((requirement) => ({
      sourceType: requirement.anyOf[0],
      requiredFor: action,
      reason: requirement.reason,
      fallback: requirement.fallback,
    }));
}

export function buildTeachingEvidenceLedger(args: {
  action: TeachingAction;
  evidence: readonly TeachingEvidence[];
}): TeachingEvidenceLedger {
  const items = dedupeTeachingEvidence(args.evidence);
  return {
    items,
    gaps: findEvidenceGaps(args.action, items),
  };
}

export function evidenceRationaleLines(ledger: TeachingEvidenceLedger): string[] {
  const evidenceLines = ledger.items.map((item) => {
    const tags = item.conceptTags?.length ? ` [${item.conceptTags.join(', ')}]` : '';
    return `Based on ${item.sourceType} "${item.title}"${tags}: ${item.reason}`;
  });
  const gapLines = ledger.gaps.map((gap) => `Missing ${gap.sourceType}: ${gap.fallback}`);
  return [...evidenceLines, ...gapLines];
}

export function createTeachingDecision<TOutput>(args: {
  id: string;
  intent: TeachingIntent;
  action: TeachingAction;
  targetConcepts?: string[];
  output: TOutput;
  evidence: readonly TeachingEvidence[];
  userFacingRationale?: readonly string[];
  toolCalls?: readonly TeachingToolCallRecord[];
  writeBack?: readonly TeachingMemoryWrite[];
  createdAt?: string;
}): TeachingDecision<TOutput> {
  const ledger = buildTeachingEvidenceLedger({
    action: args.action,
    evidence: args.evidence,
  });
  return {
    id: args.id,
    intent: args.intent,
    action: args.action,
    targetConcepts: args.targetConcepts || [],
    output: args.output,
    evidence: ledger,
    userFacingRationale: args.userFacingRationale
      ? [...args.userFacingRationale]
      : evidenceRationaleLines(ledger),
    toolCalls: [...(args.toolCalls || [])],
    writeBack: args.writeBack ? [...args.writeBack] : undefined,
    createdAt: args.createdAt || new Date().toISOString(),
  };
}
