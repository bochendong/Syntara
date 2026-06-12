import type { MemoryEvidencePacket } from '@/lib/server/memory-source-evidence';
import type { MemoryRecallContext } from '@/lib/server/study-memory-context';
import type { StudyMemoryRecord } from '@/lib/server/study-memory-store';

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function factValueText(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sourceTypeLabel(type: MemoryEvidencePacket['sourceType']): string {
  if (type === 'markdown_section') return 'concept_original_from_notebook_markdown';
  if (type === 'problem') return 'problem_original_from_problem_bank';
  if (type === 'student_message') return 'learner_question_history';
  return 'learner_problem_attempt_history';
}

function evidenceOrder(kind: MemoryRecallContext['searchIntent']['kind']) {
  if (kind === 'concept') {
    return ['markdown_section', 'problem', 'student_message', 'problem_attempt'] as const;
  }
  if (
    kind === 'learner_understanding' ||
    kind === 'learning_status' ||
    kind === 'learner_questions' ||
    kind === 'weakness_review'
  ) {
    return ['student_message', 'problem_attempt', 'problem', 'markdown_section'] as const;
  }
  return ['problem', 'markdown_section', 'student_message', 'problem_attempt'] as const;
}

function orderedEvidence(context: MemoryRecallContext): MemoryEvidencePacket[] {
  const rank = new Map(
    evidenceOrder(context.searchIntent.kind).map((type, index) => [type, index]),
  );
  return [...context.sourceEvidence].sort((a, b) => {
    const rankA = rank.get(a.sourceType) ?? 99;
    const rankB = rank.get(b.sourceType) ?? 99;
    return rankA - rankB || b.score - a.score;
  });
}

function formatEvidence(packet: MemoryEvidencePacket, index: number): string {
  const metadata = packet.metadata || {};
  const notebookName =
    typeof metadata.notebookName === 'string' && metadata.notebookName.trim()
      ? metadata.notebookName.trim()
      : '';
  const order = typeof metadata.order === 'number' ? metadata.order : Number(metadata.order);
  const sourceBits = [
    sourceTypeLabel(packet.sourceType),
    notebookName ? `notebook=${notebookName}` : '',
    Number.isFinite(order) ? `unitOrder=${order}` : '',
    typeof metadata.attemptStatus === 'string' && metadata.attemptStatus
      ? `attemptStatus=${metadata.attemptStatus}`
      : '',
    typeof metadata.attemptedCount === 'number' ? `attemptedCount=${metadata.attemptedCount}` : '',
    typeof metadata.difficulty === 'string' ? `difficulty=${metadata.difficulty}` : '',
  ].filter(Boolean);
  return [
    `${index + 1}. ${packet.title}`,
    `   source: ${sourceBits.join('; ') || sourceTypeLabel(packet.sourceType)}`,
    '   originalText:',
    compact(packet.renderedText || packet.originalText, 1800)
      .split('\n')
      .map((line) => `   > ${line}`)
      .join('\n'),
  ].join('\n');
}

function formatMemory(memory: StudyMemoryRecord, index: number): string {
  const scope = memory.scope === 'private' ? 'private_learner_memory' : 'public_course_memory';
  return [
    `${index + 1}. ${memory.title}`,
    `   scope: ${scope}; kind=${memory.kind}; target=${memory.targetType}`,
    `   text: ${compact(memory.text || memory.reason || '', 700)}`,
  ].join('\n');
}

function uniqueMemories(memories: StudyMemoryRecord[]): StudyMemoryRecord[] {
  const seen = new Set<string>();
  const result: StudyMemoryRecord[] = [];
  for (const memory of memories) {
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    result.push(memory);
  }
  return result;
}

function formatLearnerAnalytics(context: MemoryRecallContext): string[] {
  const analytics = context.learnerAnalytics;
  if (!analytics) return [];
  const lines = [
    'learner_analytics:',
    `- timeScope: ${analytics.timeScope}`,
    `- since: ${analytics.since || 'all'}`,
    `- questions: ${analytics.summary.questionCount}`,
    `- attempts: ${analytics.summary.attemptCount}`,
    `- attemptedProblems: ${analytics.summary.attemptedProblemCount}`,
    `- passed: ${analytics.summary.passedCount}`,
    `- failed: ${analytics.summary.failedCount}`,
    `- partial: ${analytics.summary.partialCount}`,
    `- privateMemories: ${analytics.summary.privateMemoryCount}`,
  ];
  if (analytics.activeNotebooks.length > 0) {
    lines.push(
      'activeNotebooks:',
      ...analytics.activeNotebooks
        .slice(0, 5)
        .map((item, index) => `${index + 1}. ${item.notebookName} (${item.count} signals)`),
    );
  }
  if (analytics.messages.length > 0) {
    lines.push(
      'learnerQuestions:',
      ...analytics.messages
        .slice(0, 5)
        .map(
          (item, index) =>
            `${index + 1}. ${item.createdAt} / ${item.notebookName || 'course'}: ${compact(item.text, 360)}`,
        ),
    );
  }
  if (analytics.attempts.length > 0) {
    lines.push(
      'learnerAttempts:',
      ...analytics.attempts.slice(0, 5).map((item, index) => {
        const tags = item.tags.slice(0, 4).join(',');
        return `${index + 1}. ${item.status}${item.score == null ? '' : ` score=${item.score}`} / ${item.problemTitle}${tags ? ` / tags=${tags}` : ''}`;
      }),
    );
  }
  if (analytics.weakTags.length > 0) {
    lines.push(
      'weakTags:',
      ...analytics.weakTags.map((item, index) => `${index + 1}. ${item.tag} (${item.count})`),
    );
  }
  if (analytics.privateMemories.length > 0) {
    lines.push(
      'privateLearnerMemory:',
      ...analytics.privateMemories
        .slice(0, 4)
        .map((item, index) => `${index + 1}. ${item.title}: ${compact(item.text, 360)}`),
    );
  }
  return lines;
}

export function buildNotebookChatMemoryToolOutput(args: {
  query: string;
  context: MemoryRecallContext;
}): string {
  const { context } = args;
  if (context.storage === 'unavailable') {
    return [
      '<tool name="search_course_memory">',
      `input: ${args.query}`,
      'status: unavailable',
      'reason: database-backed memory is not available for this request',
      '</tool>',
    ].join('\n');
  }

  const intent = context.searchIntent;
  const recallScope = context.scope;
  const facts = context.staticFacts.slice(0, 10).map((fact, index) => {
    const scope = fact.scopeId ? `${fact.scopeType}:${fact.scopeId}` : fact.scopeType;
    return `${index + 1}. ${fact.namespace}.${fact.key} = ${compact(
      factValueText(fact.valueJson),
      260,
    )} (scope=${scope}; source=${fact.source})`;
  });
  const sourceEvidence = orderedEvidence(context).slice(0, 8).map(formatEvidence);
  const memories = uniqueMemories([...context.directMemories, ...context.semanticMatches])
    .slice(0, 6)
    .map(formatMemory);
  const knowledgeMatches = context.knowledgeMatches.slice(0, 6).map((match, index) => {
    const tags = match.metadata.tags.length ? `tags=${match.metadata.tags.join(',')}` : '';
    const notebook = match.metadata.notebookName ? `notebook=${match.metadata.notebookName}` : '';
    const progress =
      match.metadata.attemptedCount > 0
        ? `attempt=${match.metadata.attemptStatus || 'attempted'}`
        : 'attempt=unattempted';
    return [
      `${index + 1}. ${match.title}`,
      `   source: problem_bank; ${[notebook, tags, progress].filter(Boolean).join('; ')}`,
      `   preview: ${compact(match.text, 500)}`,
    ].join('\n');
  });

  return compact(
    [
      '<tool name="search_course_memory">',
      `input: ${args.query}`,
      'status: completed',
      '',
      'plan:',
      `- kind: ${intent.kind}`,
      `- rewrittenQuery: ${intent.rewrittenQuery}`,
      `- progressFilter: ${intent.progressFilter || 'none'}`,
      `- answerMode: ${intent.plan.answerMode}`,
      `- scopeMode: ${intent.scopeMode}`,
      `- scopeReason: ${intent.scopeReason}`,
      `- effectiveScope: ${recallScope.effectiveMode}`,
      `- expandedFromNotebookToCourse: ${recallScope.expanded ? 'yes' : 'no'}`,
      `- effectiveTarget: ${recallScope.effectiveTargetType}:${recallScope.effectiveTargetId}`,
      `- summary: ${intent.plan.summary}`,
      `- primarySources: ${intent.plan.primarySources.join(', ') || 'none'}`,
      `- secondarySources: ${intent.plan.secondarySources.join(', ') || 'none'}`,
      '',
      'tool_usage_policy:',
      '- Structured facts are exact current truth and override fuzzy memories.',
      '- Original source evidence is the preferred material for source lookup.',
      '- For concept/source questions, answer with markdown_section original text before summaries when present.',
      '- For problem questions, answer with the problem original text before metadata.',
      '- For learner-understanding/status/questions, use learner analytics plus learner question/attempt history before judging mastery.',
      '- Respect effectiveScope. If effectiveScope=notebook_local, answer about this notebook unless the user explicitly asks to widen. If expandedFromNotebookToCourse=yes, say the search was widened to the course before using cross-notebook evidence.',
      '- If evidence is weak or missing, say exactly what was checked.',
      '',
      facts.length > 0 ? 'structured_facts:' : '',
      ...facts,
      facts.length > 0 ? '' : '',
      sourceEvidence.length > 0 ? 'original_source_evidence:' : '',
      ...sourceEvidence,
      sourceEvidence.length > 0 ? '' : '',
      memories.length > 0 ? 'study_memory_evidence:' : '',
      ...memories,
      memories.length > 0 ? '' : '',
      ...formatLearnerAnalytics(context),
      context.learnerAnalytics ? '' : '',
      knowledgeMatches.length > 0 ? 'metadata_filtered_problem_matches:' : '',
      ...knowledgeMatches,
      '',
      `counts: facts=${context.staticFacts.length}; originalSources=${context.sourceEvidenceCount}; learnerAnalytics=${context.learnerAnalyticsCount}; memories=${context.directCount + context.semanticCount}; problemMatches=${context.knowledgeCount}; localEvidence=${recallScope.localEvidenceCount}; courseEvidence=${recallScope.courseEvidenceCount}; vectorUsed=${context.vectorUsed}`,
      '</tool>',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    12000,
  );
}
