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

function formatProgrammingEvidence(packet: MemoryEvidencePacket, index: number): string {
  return [
    `${index + 1}. ${packet.title}`,
    compact(packet.renderedText || packet.originalText, 700)
      .split('\n')
      .map((line) => `   ${line}`)
      .join('\n'),
  ].join('\n');
}

function evidenceText(packet: MemoryEvidencePacket): string {
  return [packet.title, packet.renderedText, packet.originalText].join('\n').toLowerCase();
}

function isProgrammingPrerequisiteEvidence(packet: MemoryEvidencePacket): boolean {
  if (packet.sourceType !== 'markdown_section') return false;
  const text = evidenceText(packet);
  return /索引|边界|越界|range\s*\(|len\(|length|modulo|取模|%/.test(text);
}

function programmingInputSummary(query: string): string {
  const beforeCodeOrProblem =
    query
      .split(
        /\n\s*(?:Starter|题目|Function signature|Docstring|Examples?|代码|```|#reader|def\s+\w+\s*\(|class\s+\w+)/i,
      )[0]
      ?.trim() || '';
  const firstParagraph = beforeCodeOrProblem || query.split(/\n{2,}/)[0]?.trim() || '';
  return compact(firstParagraph || 'programming question supplied in Student question', 180);
}

const EXECUTION_CONTRACT_HEADING_RE =
  /^(?:#{1,4}\s*)?(执行合约|回答合约|触发条件|适用触发|必须输出|必须包含|禁止事项|禁止|常见错误|验收清单|检查清单|Local\/HtDF 边界|Local\/HtDF boundary|Answer contract|When to apply|Required artifacts|Required output|Forbidden mistakes|Validation checklist|Common mistakes)\s*[:：]?\s*$/i;

const FALLBACK_OPERATIONAL_HEADING_RE =
  /^(?:#{1,4}\s*)?(格式规则|格式要求|检查点|关键规则|Two One-of 格式|HTDF 格式|One-of 习惯)\s*[:：]?\s*$/i;

function markdownHeadingTitle(line: string): string | null {
  const match = line.match(/^#{1,4}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || null;
}

function extractMemorySections(text: string, headingPattern: RegExp): string[] {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const sections: string[] = [];
  let current: string[] | null = null;
  let currentLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      if (current && level <= currentLevel) {
        sections.push(current.join('\n').trim());
        current = null;
        currentLevel = 0;
      }
      if (headingPattern.test(title)) {
        current = [line.trim()];
        currentLevel = level;
      }
      continue;
    }

    const plainTitle = markdownHeadingTitle(line) || line.trim();
    if (!line.startsWith('#') && headingPattern.test(plainTitle)) {
      if (current) sections.push(current.join('\n').trim());
      current = [line.trim()];
      currentLevel = 99;
      continue;
    }

    if (current) current.push(line);
  }

  if (current) sections.push(current.join('\n').trim());
  return sections.filter(Boolean);
}

function formatMemoryTextForProgramming(memory: StudyMemoryRecord): string {
  const text = memory.text || memory.reason || '';
  const contractSections = extractMemorySections(text, EXECUTION_CONTRACT_HEADING_RE);
  const fallbackSections =
    contractSections.length > 0
      ? []
      : extractMemorySections(text, FALLBACK_OPERATIONAL_HEADING_RE).slice(0, 3);
  const selected = contractSections.length > 0 ? contractSections : fallbackSections;

  if (selected.length > 0) {
    return [
      contractSections.length > 0
        ? '   operational_contract:'
        : '   operational_notes_from_legacy_memory:',
      compact(selected.join('\n\n'), contractSections.length > 0 ? 1800 : 1200)
        .split('\n')
        .map((line) => `   ${line}`)
        .join('\n'),
      contractSections.length > 0 ? `   brief_context: ${compact(text, 320)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return `   text: ${compact(text, 900)}`;
}

function formatMemory(
  memory: StudyMemoryRecord,
  index: number,
  isProgrammingHelp = false,
  layerLabel = 'study_memory',
): string {
  const scope = memory.scope === 'private' ? 'private_learner_memory' : 'public_course_memory';
  const text = isProgrammingHelp
    ? formatMemoryTextForProgramming(memory)
    : `   text: ${compact(memory.text || memory.reason || '', 700)}`;
  return [
    `${index + 1}. ${memory.title}`,
    `   layer: ${layerLabel}; scope=${scope}; kind=${memory.kind}; target=${memory.targetType}`,
    text,
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

function publicMemories(memories: StudyMemoryRecord[]): StudyMemoryRecord[] {
  return memories.filter((memory) => memory.scope === 'public');
}

function privateMemories(memories: StudyMemoryRecord[]): StudyMemoryRecord[] {
  return memories.filter((memory) => memory.scope === 'private');
}

function memorySection(args: {
  heading: string;
  memories: StudyMemoryRecord[];
  layerLabel: string;
  isProgrammingHelp: boolean;
  limit: number;
}): string[] {
  const selected = uniqueMemories(args.memories).slice(0, args.limit);
  if (selected.length === 0) return [];
  return [
    args.heading,
    ...selected.map((memory, index) =>
      formatMemory(memory, index, args.isProgrammingHelp, args.layerLabel),
    ),
    '',
  ];
}

function formatLayeredReadPlan(context: MemoryRecallContext): string[] {
  const layered = context as MemoryRecallContext & {
    readPlan?: {
      purpose?: string;
      staticInjection?: Array<{ title?: string; layer?: string }>;
      dynamicDiscovery?: Array<{ title?: string; layer?: string }>;
    };
  };
  const plan = layered.readPlan;
  if (!plan) return [];
  const staticLayers = (plan.staticInjection || [])
    .map((item) => `${item.layer || 'memory'}:${item.title || 'untitled'}`)
    .join(' -> ');
  const dynamicLayers = (plan.dynamicDiscovery || [])
    .map((item) => `${item.layer || 'memory'}:${item.title || 'untitled'}`)
    .join(' -> ');
  return [
    'layered_read_plan:',
    `- purpose: ${plan.purpose || 'general'}`,
    `- staticInjection: ${staticLayers || 'none'}`,
    `- dynamicDiscovery: ${dynamicLayers || 'none'}`,
    '- readOrder: structured facts -> short-term learner state -> course/notebook teaching control -> knowledge cache -> RAG/source evidence',
    '',
  ];
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

function formatKnowledgeCache(context: MemoryRecallContext): string[] {
  return context.knowledgeCache.slice(0, 5).map((entry, index) => {
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const notebookName =
      typeof (metadata as Record<string, unknown>).notebookName === 'string'
        ? String((metadata as Record<string, unknown>).notebookName)
        : '';
    const meta = [
      `source=${entry.sourceType}`,
      notebookName ? `notebook=${notebookName}` : '',
      `hits=${entry.hitCount}`,
      `last=${entry.lastAccessedAt.slice(0, 10)}`,
    ].filter(Boolean);
    return [
      `${index + 1}. ${entry.title}`,
      `   ${meta.join('; ')}`,
      `   preview: ${compact(entry.previewText, 500)}`,
    ].join('\n');
  });
}

export function buildNotebookChatMemoryToolOutput(args: {
  query: string;
  context: MemoryRecallContext;
  mode?: 'general' | 'programming_help';
}): string {
  const { context } = args;
  const mode = args.mode || 'general';
  const isProgrammingHelp = mode === 'programming_help';
  if (context.storage === 'unavailable') {
    return [
      '<tool name="search_course_memory">',
      isProgrammingHelp
        ? 'input: omitted; full problem statement is already present in User message'
        : `input: ${args.query}`,
      'status: unavailable',
      'reason: database-backed memory is not available for this request',
      '</tool>',
    ].join('\n');
  }

  const intent = context.searchIntent;
  const recallScope = context.scope;
  const facts = context.staticFacts.slice(0, 6).map((fact, index) => {
    const scope = fact.scopeId ? `${fact.scopeType}:${fact.scopeId}` : fact.scopeType;
    return `${index + 1}. ${fact.namespace}.${fact.key} = ${compact(
      factValueText(fact.valueJson),
      260,
    )} (scope=${scope}; source=${fact.source})`;
  });
  const orderedSourceEvidence = orderedEvidence(context);
  const sourceEvidence = (
    isProgrammingHelp
      ? orderedSourceEvidence.filter(isProgrammingPrerequisiteEvidence).slice(0, 3)
      : orderedSourceEvidence.slice(0, 4)
  ).map((packet, index) =>
    isProgrammingHelp ? formatProgrammingEvidence(packet, index) : formatEvidence(packet, index),
  );
  const semanticPublicMemories = publicMemories(context.specialistMemories);
  const platformMemories = publicMemories(
    uniqueMemories([
      ...context.platformMemories,
      ...semanticPublicMemories.filter((memory) => memory.targetType === 'platform'),
    ]),
  );
  const courseControllerMemories = publicMemories(
    uniqueMemories([
      ...context.courseControllerMemories,
      ...semanticPublicMemories.filter((memory) => memory.targetType === 'course'),
    ]),
  );
  const currentNotebookMemories = publicMemories(
    uniqueMemories([
      ...context.currentNotebookMemories,
      ...semanticPublicMemories.filter(
        (memory) =>
          memory.targetType === 'notebook' && memory.notebookId === context.scope.notebookId,
      ),
    ]),
  );
  const crossNotebookSpecialistMemories = publicMemories(context.specialistMemories).filter(
    (memory) => memory.targetType === 'notebook' && memory.notebookId !== context.scope.notebookId,
  );
  const fallbackPublicMemories = publicMemories(
    uniqueMemories([...context.directMemories, ...context.semanticMatches]),
  );
  const privateLearnerMemories = isProgrammingHelp
    ? []
    : privateMemories(uniqueMemories([...context.directMemories, ...context.semanticMatches]));
  const layeredMemoryLines = [
    ...memorySection({
      heading: 'platform_memory:',
      memories: platformMemories,
      layerLabel: 'platform',
      isProgrammingHelp,
      limit: isProgrammingHelp ? 2 : 3,
    }),
    ...memorySection({
      heading: 'course_controller_memory:',
      memories: courseControllerMemories,
      layerLabel: 'course_controller',
      isProgrammingHelp,
      limit: isProgrammingHelp ? 3 : 4,
    }),
    ...memorySection({
      heading: 'current_notebook_specialist_memory:',
      memories: currentNotebookMemories,
      layerLabel: 'current_notebook_specialist',
      isProgrammingHelp,
      limit: isProgrammingHelp ? 3 : 4,
    }),
    ...memorySection({
      heading: 'cross_notebook_specialist_memory:',
      memories: crossNotebookSpecialistMemories,
      layerLabel: 'cross_notebook_specialist',
      isProgrammingHelp,
      limit: isProgrammingHelp ? 3 : 4,
    }),
    ...memorySection({
      heading: 'private_learner_memory:',
      memories: privateLearnerMemories,
      layerLabel: 'private_learner',
      isProgrammingHelp,
      limit: 3,
    }),
  ];
  const fallbackMemoryLines =
    layeredMemoryLines.length === 0
      ? memorySection({
          heading: 'study_memory_evidence:',
          memories: fallbackPublicMemories,
          layerLabel: 'study_memory_fallback',
          isProgrammingHelp,
          limit: 4,
        })
      : [];
  const knowledgeMatches = (isProgrammingHelp ? [] : context.knowledgeMatches.slice(0, 4)).map(
    (match, index) => {
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
    },
  );
  const learnerAnalyticsLines = isProgrammingHelp ? [] : formatLearnerAnalytics(context);
  const knowledgeCacheLines = isProgrammingHelp ? [] : formatKnowledgeCache(context);
  const sourceEvidenceHeading = isProgrammingHelp
    ? 'supporting_prerequisite_evidence:'
    : 'original_source_evidence:';
  const weakProgrammingEvidence =
    isProgrammingHelp && sourceEvidence.length === 0
      ? [
          'evidence_quality: weak',
          'missing_notebook_evidence:',
          '- No notebook section directly explains this exact programming pattern.',
          '- Use the supplied problem statement as the primary source.',
        ]
      : [];
  const layeredReadPlan = formatLayeredReadPlan(context);
  if (isProgrammingHelp) {
    return compact(
      [
        '<tool name="search_course_memory">',
        'status: completed',
        'mode: programming_help',
        `input_summary: ${programmingInputSummary(args.query)}`,
        'note: full problem text is already in Student question; not repeated here.',
        'memory_orchestration:',
        '- responder: course_controller',
        '- use course_controller_memory first for course-wide rules and template selection.',
        '- use current_notebook_specialist_memory for this lesson’s local template and examples.',
        '- use cross_notebook_specialist_memory only when the problem genuinely needs another lesson.',
        '',
        ...layeredReadPlan,
        ...layeredMemoryLines,
        ...fallbackMemoryLines,
        sourceEvidence.length > 0 ? 'prerequisite_context:' : '',
        ...sourceEvidence,
        sourceEvidence.length > 0 ? '' : '',
        ...weakProgrammingEvidence,
        '</tool>',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      5600,
    );
  }
  return compact(
    [
      '<tool name="search_course_memory">',
      isProgrammingHelp
        ? 'input: omitted; full problem statement is already present in User message'
        : `input: ${args.query}`,
      isProgrammingHelp ? `input_summary: ${programmingInputSummary(args.query)}` : '',
      'status: completed',
      '',
      'context_summary:',
      `- kind: ${intent.kind}`,
      `- answerMode: ${intent.plan.answerMode}`,
      `- effectiveScope: ${recallScope.effectiveMode}`,
      '- responder: course_controller',
      `- summary: ${intent.plan.summary}`,
      '',
      'usage:',
      '- Use only relevant context; do not expose search/planning details.',
      '- Course controller memory decides course-level rules, template routing, and forbidden moves.',
      '- Notebook specialist memory supplies the local chapter template, examples, and common mistakes.',
      '- Cross-notebook specialist memory is supporting evidence, not a replacement for the current notebook.',
      '- Structured facts are exact current truth.',
      '- Prefer original source evidence when it directly answers the user.',
      '- If learner history is included, separate evidence from inference.',
      '',
      ...layeredReadPlan,
      ...weakProgrammingEvidence,
      weakProgrammingEvidence.length > 0 ? '' : '',
      facts.length > 0 ? 'structured_facts:' : '',
      ...facts,
      facts.length > 0 ? '' : '',
      sourceEvidence.length > 0 ? sourceEvidenceHeading : '',
      ...sourceEvidence,
      sourceEvidence.length > 0 ? '' : '',
      ...layeredMemoryLines,
      ...fallbackMemoryLines,
      ...learnerAnalyticsLines,
      learnerAnalyticsLines.length > 0 ? '' : '',
      knowledgeCacheLines.length > 0 ? 'cached_knowledge_hits:' : '',
      ...knowledgeCacheLines,
      knowledgeCacheLines.length > 0 ? '' : '',
      knowledgeMatches.length > 0 ? 'metadata_filtered_problem_matches:' : '',
      ...knowledgeMatches,
      '',
      '</tool>',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    12000,
  );
}
