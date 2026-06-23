import type { PrismaClient } from '@/lib/server/generated-prisma';
import { createLogger } from '@/lib/logger';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  listSupersededMemoryFactEvents,
  resolveEffectiveMemoryFacts,
  type MemoryFactConflict,
  type MemoryFactRecord,
  type MemoryFactScopeRef,
} from '@/lib/server/memory-fact-store';
import {
  searchProblemBankKnowledge,
  type MemoryKnowledgeMatch,
} from '@/lib/server/memory-knowledge-search';
import {
  buildLearnerAnalytics,
  type LearnerAnalytics,
} from '@/lib/server/memory-learner-analytics';
import {
  mergeEvidencePackets,
  searchMarkdownSourceEvidence,
  searchProblemAttemptEvidence,
  searchProblemSourceEvidence,
  searchStudentMessageEvidence,
  type MemoryEvidencePacket,
} from '@/lib/server/memory-source-evidence';
import {
  inferMemorySearchIntent,
  type MemorySearchIntent,
  type MemorySearchScopeMode,
} from '@/lib/server/memory-search-intent';
import {
  indexStudyMemoryRecords,
  semanticSearchStudyMemoryChunks,
  type StudyMemorySemanticMatch,
} from '@/lib/server/study-memory-vector-store';
import {
  knowledgeCacheWritesFromResults,
  listKnowledgeCache,
  refreshKnowledgeCache,
  uniqueKnowledgeCacheEntries,
  type KnowledgeCacheEntry,
} from '@/features/memory/server/knowledge-cache';
import {
  PLATFORM_STUDY_MEMORY_TARGET_ID,
  listStudyMemoriesForViewer,
  resolveReadableStudyMemoryTarget,
  type ReadableStudyMemoryTarget,
  type StudyMemoryRecord,
  type StudyMemoryTargetType,
} from '@/lib/server/study-memory-store';

const log = createLogger('StudyMemoryContext');

type MemorySection = {
  title: string;
  memories: StudyMemoryRecord[];
};

export type MemoryContextTargetType = Extract<StudyMemoryTargetType, 'course' | 'notebook'>;

export type MemoryRecallScope = {
  requestedMode: MemorySearchScopeMode;
  effectiveMode: Exclude<MemorySearchScopeMode, 'auto_expand'>;
  expanded: boolean;
  reason: string;
  originalTargetType: MemoryContextTargetType;
  originalTargetId: string;
  effectiveTargetType: MemoryContextTargetType;
  effectiveTargetId: string;
  courseId: string | null;
  notebookId: string | null;
  localEvidenceCount: number;
  courseEvidenceCount: number;
};

export type MemoryRecallContext = {
  prompt: string;
  scope: MemoryRecallScope;
  staticFacts: MemoryFactRecord[];
  courseControllerMemories: StudyMemoryRecord[];
  currentNotebookMemories: StudyMemoryRecord[];
  specialistMemories: StudyMemoryRecord[];
  directMemories: StudyMemoryRecord[];
  semanticMatches: StudyMemoryRecord[];
  knowledgeCache: KnowledgeCacheEntry[];
  knowledgeMatches: MemoryKnowledgeMatch[];
  sourceEvidence: MemoryEvidencePacket[];
  learnerAnalytics: LearnerAnalytics | null;
  conflicts: MemoryFactConflict[];
  filteredStaleMemoryIds: string[];
  searchIntent: MemorySearchIntent;
  platformMemories: StudyMemoryRecord[];
  directCount: number;
  semanticCount: number;
  knowledgeCacheCount: number;
  knowledgeCount: number;
  sourceEvidenceCount: number;
  learnerAnalyticsCount: number;
  vectorUsed: boolean;
  storage: 'database' | 'unavailable';
};

export type NotebookStudyMemoryPromptContext = MemoryRecallContext;

type MemoryRecallPass = {
  recallTarget: ReadableStudyMemoryTarget;
  directPlatform: StudyMemoryRecord[];
  directCourse: StudyMemoryRecord[];
  directTarget: StudyMemoryRecord[];
  directMemories: StudyMemoryRecord[];
  semanticMemories: StudyMemoryRecord[];
  knowledgeCache: KnowledgeCacheEntry[];
  knowledgeMatches: MemoryKnowledgeMatch[];
  sourceEvidence: MemoryEvidencePacket[];
  learnerAnalytics: LearnerAnalytics | null;
  filteredStaleMemoryIds: string[];
  vectorUsed: boolean;
  evidenceCount: number;
};

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function sourceReferencesText(sourceReferences: unknown): string {
  if (!Array.isArray(sourceReferences)) return '';
  return sourceReferences
    .slice(0, 4)
    .map((source) => {
      if (!source || typeof source !== 'object') return '';
      const raw = source as Record<string, unknown>;
      const order = typeof raw.order === 'number' ? raw.order : Number(raw.order);
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const why = typeof raw.why === 'string' ? raw.why.trim() : '';
      if (!Number.isFinite(order) || !title) return '';
      return `unit ${order}: ${title}${why ? ` (${why})` : ''}`;
    })
    .filter(Boolean)
    .join('; ');
}

function formatMemory(memory: StudyMemoryRecord, index: number): string {
  const scopeLabel = memory.scope === 'private' ? 'private learner memory' : 'public shared memory';
  const targetLabel =
    memory.targetType === 'platform'
      ? 'platform'
      : memory.targetType === 'course'
        ? 'course'
        : 'notebook';
  const references = sourceReferencesText(memory.sourceReferences);
  return [
    `${index + 1}. ${memory.title}`,
    `   - scope: ${scopeLabel}`,
    `   - target: ${targetLabel}`,
    `   - kind/source: ${memory.kind} / ${memory.source}`,
    memory.reason ? `   - reason: ${compact(memory.reason, 180)}` : '',
    references ? `   - sources: ${compact(references, 280)}` : '',
    `   - text: ${compact(memory.text, 900)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatSection(section: MemorySection): string {
  if (section.memories.length === 0) return '';
  return [`## ${section.title}`, ...section.memories.map(formatMemory)].join('\n');
}

function semanticMatchToMemory(match: StudyMemorySemanticMatch): StudyMemoryRecord {
  const targetType: StudyMemoryTargetType =
    match.targetType === 'platform'
      ? 'platform'
      : match.targetType === 'course'
        ? 'course'
        : 'notebook';
  return {
    id: match.memoryId,
    ownerId: match.ownerId,
    courseId: match.courseId,
    notebookId: match.notebookId,
    targetType,
    scope: match.scope === 'private' ? 'private' : 'public',
    kind: 'semantic_recall',
    status: 'active',
    source: `vector:${match.similarity.toFixed(3)}`,
    title: match.title,
    text: match.text || match.chunkText,
    reason: match.reason,
    question: match.question,
    sourceReferences: match.sourceReferences,
    createdAt: match.updatedAt,
    updatedAt: match.updatedAt,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const text = item?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

async function getCourseTarget(
  prisma: PrismaClient,
  userId: string | null | undefined,
  notebookTarget: ReadableStudyMemoryTarget,
): Promise<ReadableStudyMemoryTarget | null> {
  if (!notebookTarget.courseId) return null;
  return resolveReadableStudyMemoryTarget(prisma, userId, 'course', notebookTarget.courseId);
}

function platformTargetForOwner(args: {
  ownerId: string;
  viewerUserId?: string | null;
}): ReadableStudyMemoryTarget {
  return {
    targetType: 'platform',
    targetId: PLATFORM_STUDY_MEMORY_TARGET_ID,
    courseId: null,
    notebookId: null,
    targetOwnerId: args.ownerId,
    accessRole: args.viewerUserId === args.ownerId ? 'owner' : 'enrolled',
  };
}

function memoryContextTargetType(target: ReadableStudyMemoryTarget): MemoryContextTargetType {
  return target.targetType === 'notebook' ? 'notebook' : 'course';
}

function resolveRecallScope(args: {
  target: ReadableStudyMemoryTarget;
  courseTarget: ReadableStudyMemoryTarget | null;
  searchIntent: MemorySearchIntent;
}): {
  factTarget: ReadableStudyMemoryTarget;
  recallTarget: ReadableStudyMemoryTarget;
  scope: MemoryRecallScope;
} {
  const requestedMode: MemorySearchScopeMode =
    args.target.targetType === 'course' ? 'course_wide' : args.searchIntent.scopeMode;
  const canUseCourse = Boolean(args.courseTarget);
  const shouldUseCourse =
    args.target.targetType === 'course' ||
    (canUseCourse && (requestedMode === 'course_wide' || requestedMode === 'auto_expand'));
  const recallTarget = shouldUseCourse && args.courseTarget ? args.courseTarget : args.target;
  const effectiveMode: Exclude<MemorySearchScopeMode, 'auto_expand'> =
    recallTarget.targetType === 'course' ? 'course_wide' : 'notebook_local';
  const expanded =
    args.target.targetType === 'notebook' &&
    recallTarget.targetType === 'course' &&
    args.target.targetId !== recallTarget.targetId;
  const originalTargetType = memoryContextTargetType(args.target);
  const effectiveTargetType = memoryContextTargetType(recallTarget);

  return {
    factTarget: recallTarget,
    recallTarget,
    scope: {
      requestedMode,
      effectiveMode,
      expanded,
      reason: args.searchIntent.scopeReason,
      originalTargetType,
      originalTargetId: args.target.targetId,
      effectiveTargetType,
      effectiveTargetId: recallTarget.targetId,
      courseId: recallTarget.courseId,
      notebookId: recallTarget.notebookId,
      localEvidenceCount: 0,
      courseEvidenceCount: 0,
    },
  };
}

function evidenceCount(args: {
  directMemories: StudyMemoryRecord[];
  semanticMemories: StudyMemoryRecord[];
  knowledgeCache: KnowledgeCacheEntry[];
  knowledgeMatches: MemoryKnowledgeMatch[];
  sourceEvidence: MemoryEvidencePacket[];
  learnerAnalytics: LearnerAnalytics | null;
}): number {
  return (
    args.directMemories.length +
    args.semanticMemories.length +
    args.knowledgeCache.length +
    args.knowledgeMatches.length +
    args.sourceEvidence.length +
    learnerAnalyticsEvidenceCount(args.learnerAnalytics)
  );
}

function learnerAnalyticsEvidenceCount(analytics: LearnerAnalytics | null): number {
  if (!analytics) return 0;
  return (
    analytics.summary.questionCount +
    analytics.summary.attemptCount +
    analytics.summary.privateMemoryCount
  );
}

function formatRecallScope(scope: MemoryRecallScope): string {
  const range =
    scope.effectiveMode === 'course_wide'
      ? `course:${scope.courseId || scope.effectiveTargetId}`
      : `notebook:${scope.notebookId || scope.effectiveTargetId}`;
  return [
    '## Memory recall scope',
    `requestedMode: ${scope.requestedMode}`,
    `effectiveMode: ${scope.effectiveMode}`,
    `expandedFromNotebookToCourse: ${scope.expanded ? 'yes' : 'no'}`,
    `effectiveTarget: ${range}`,
    `localEvidenceCount: ${scope.localEvidenceCount}`,
    `courseEvidenceCount: ${scope.courseEvidenceCount}`,
    `reason: ${scope.reason}`,
    'Use local notebook evidence as the classroom floor. If expandedFromNotebookToCourse=yes, say that the search was widened to the course when the answer depends on cross-notebook evidence.',
  ].join('\n');
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

function formatFacts(facts: MemoryFactRecord[]): string {
  if (facts.length === 0) return '';
  const lines = [
    '## Structured memory facts (exact current values)',
    'These facts are precise and updateable. They override semantically recalled text when values conflict.',
  ];
  for (const fact of facts.slice(0, 24)) {
    const scope = fact.scopeId ? `${fact.scopeType}:${fact.scopeId}` : fact.scopeType;
    lines.push(
      `- ${fact.namespace}.${fact.key} = ${compact(factValueText(fact.valueJson), 360)} (scope: ${scope}; source: ${fact.source}; validFrom: ${fact.validFrom})`,
    );
  }
  return lines.join('\n');
}

function formatConflicts(conflicts: MemoryFactConflict[]): string {
  if (conflicts.length === 0) return '';
  return [
    '## Structured memory overrides',
    ...conflicts.slice(0, 12).map((conflict, index) => {
      const fromScope = conflict.overridden.scopeId
        ? `${conflict.overridden.scopeType}:${conflict.overridden.scopeId}`
        : conflict.overridden.scopeType;
      const toScope = conflict.winner.scopeId
        ? `${conflict.winner.scopeType}:${conflict.winner.scopeId}`
        : conflict.winner.scopeType;
      return `${index + 1}. ${conflict.namespace}.${conflict.key}: ${compact(
        factValueText(conflict.overridden.valueJson),
        160,
      )} (${fromScope}) -> ${compact(factValueText(conflict.winner.valueJson), 160)} (${toScope})`;
    }),
  ].join('\n');
}

function formatKnowledgeMatches(matches: MemoryKnowledgeMatch[]): string {
  if (matches.length === 0) return '';
  return [
    '## Metadata-first knowledge matches',
    'These are discovered from course/notebook knowledge sources after target filtering.',
    ...matches.slice(0, 8).map((match, index) => {
      const tags = match.metadata.tags.length ? ` tags=${match.metadata.tags.join(', ')}` : '';
      const progress =
        match.metadata.attemptedCount > 0
          ? ` progress=${match.metadata.attemptStatus || 'attempted'}`
          : ' progress=unattempted';
      return `${index + 1}. [${match.sourceType}] ${match.title} (score=${match.score.toFixed(
        1,
      )}; ${match.metadata.problemType}/${match.metadata.difficulty}${tags}${progress})\n   - ${compact(
        match.text,
        520,
      )}`;
    }),
  ].join('\n');
}

function formatKnowledgeCache(entries: KnowledgeCacheEntry[]): string {
  if (entries.length === 0) return '';
  return [
    '## Knowledge access cache',
    'These are source/problem items that were recently or frequently useful in knowledge-base searches. Treat them as warm hints, then verify with original source evidence when exact wording matters.',
    ...entries.slice(0, 8).map((entry, index) => {
      const notebookName =
        entry.metadata &&
        typeof entry.metadata === 'object' &&
        typeof (entry.metadata as Record<string, unknown>).notebookName === 'string'
          ? String((entry.metadata as Record<string, unknown>).notebookName)
          : '';
      const meta = [
        entry.sourceType,
        notebookName,
        `hits=${entry.hitCount}`,
        `last=${entry.lastAccessedAt.slice(0, 10)}`,
      ].filter(Boolean);
      return `${index + 1}. ${entry.title} (${meta.join('; ')})\n   - ${compact(
        entry.previewText,
        620,
      )}`;
    }),
  ].join('\n');
}

function sourceEvidenceLabel(sourceType: MemoryEvidencePacket['sourceType']): string {
  if (sourceType === 'markdown_section') return 'notebook markdown original';
  if (sourceType === 'problem') return 'problem original';
  if (sourceType === 'student_message') return 'learner question history';
  return 'learner problem attempt';
}

function formatSourceEvidence(matches: MemoryEvidencePacket[]): string {
  if (matches.length === 0) return '';
  return [
    '## Original source evidence',
    'These packets contain original text expanded from the indexed source. Prefer this over summaries when answering source lookup questions.',
    ...matches.slice(0, 10).map((match, index) => {
      const notebookName =
        typeof match.metadata.notebookName === 'string' ? match.metadata.notebookName : '';
      const meta = [
        sourceEvidenceLabel(match.sourceType),
        notebookName,
        `score=${match.score.toFixed(1)}`,
      ].filter(Boolean);
      return `${index + 1}. ${match.title} (${meta.join('; ')})\n   - ${compact(
        match.renderedText || match.originalText,
        900,
      )}`;
    }),
  ].join('\n');
}

function timeScopeLabel(scope: LearnerAnalytics['timeScope']): string {
  if (scope === 'week') return '最近 7 天';
  if (scope === 'month') return '最近 30 天';
  if (scope === 'term') return '本课程周期';
  return '全部记录';
}

function formatLearnerAnalytics(analytics: LearnerAnalytics | null): string {
  if (!analytics) return '';
  const lines = [
    '## Learner analytics evidence',
    `Time window: ${timeScopeLabel(analytics.timeScope)}${
      analytics.since ? ` (${analytics.since} to ${analytics.until})` : ''
    }`,
    `Summary: questions=${analytics.summary.questionCount}; attempts=${analytics.summary.attemptCount}; attemptedProblems=${analytics.summary.attemptedProblemCount}; passed=${analytics.summary.passedCount}; failed=${analytics.summary.failedCount}; partial=${analytics.summary.partialCount}; privateMemories=${analytics.summary.privateMemoryCount}; activeNotebooks=${analytics.summary.activeNotebookCount}`,
  ];

  if (analytics.activeNotebooks.length > 0) {
    lines.push(
      'Active notebooks:',
      ...analytics.activeNotebooks
        .slice(0, 6)
        .map((item) => `- ${item.notebookName} (${item.count} signals)`),
    );
  }
  if (analytics.messages.length > 0) {
    lines.push(
      'Recent learner questions:',
      ...analytics.messages
        .slice(0, 6)
        .map(
          (item) =>
            `- ${item.createdAt} / ${item.notebookName || 'course'}: ${compact(item.text, 240)}`,
        ),
    );
  }
  if (analytics.attempts.length > 0) {
    lines.push(
      'Recent problem attempts:',
      ...analytics.attempts.slice(0, 6).map((item) => {
        const tags = item.tags.slice(0, 4).join(', ');
        return `- ${item.createdAt} / ${item.status}${
          item.score == null ? '' : ` / score=${item.score}`
        }: ${item.problemTitle}${tags ? ` (${tags})` : ''}`;
      }),
    );
  }
  if (analytics.weakTags.length > 0) {
    lines.push(
      'Weak tags from wrong/partial attempts:',
      ...analytics.weakTags.map((item) => `- ${item.tag}: ${item.count}`),
    );
  }
  if (analytics.privateMemories.length > 0) {
    lines.push(
      'Private learner memories:',
      ...analytics.privateMemories
        .slice(0, 5)
        .map((item) => `- ${item.title}: ${compact(item.text, 240)}`),
    );
  }

  return lines.join('\n');
}

function staleNeedlesFromValue(value: unknown): string[] {
  const needles = new Set<string>();
  const visit = (item: unknown) => {
    if (item == null) return;
    if (typeof item === 'string') {
      const text = item.trim();
      if (text.length >= 2) needles.add(text);
      return;
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      needles.add(String(item));
      if (Math.abs(item) >= 10000 && item % 10000 === 0) {
        needles.add(`${item / 10000}万`);
        needles.add(`${item / 10000} 万`);
      }
      return;
    }
    if (typeof item === 'boolean') {
      needles.add(String(item));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return Array.from(needles).filter((needle) => needle.length >= 2);
}

function memoryContainsNeedle(memory: StudyMemoryRecord, needle: string): boolean {
  const haystack = `${memory.title}\n${memory.text}\n${memory.reason || ''}\n${memory.question || ''}`;
  return haystack.includes(needle);
}

function filterStaleMemories(args: {
  memories: StudyMemoryRecord[];
  staleNeedles: string[];
  currentNeedles: string[];
}): { memories: StudyMemoryRecord[]; filteredIds: string[] } {
  if (args.staleNeedles.length === 0) return { memories: args.memories, filteredIds: [] };
  const filteredIds: string[] = [];
  const memories = args.memories.filter((memory) => {
    const hasStale = args.staleNeedles.some((needle) => memoryContainsNeedle(memory, needle));
    if (!hasStale) return true;
    const hasCurrent = args.currentNeedles.some((needle) => memoryContainsNeedle(memory, needle));
    if (hasCurrent) return true;
    filteredIds.push(memory.id);
    return false;
  });
  return { memories, filteredIds };
}

async function buildFactScopes(args: {
  userId?: string | null;
  target: ReadableStudyMemoryTarget;
  courseTarget: ReadableStudyMemoryTarget | null;
  conversationId?: string | null;
}): Promise<MemoryFactScopeRef[]> {
  const scopes: MemoryFactScopeRef[] = args.userId
    ? [{ ownerId: args.userId, scopeType: 'user', scopeId: null }]
    : [];
  const courseId = args.courseTarget?.courseId || args.target.courseId;
  const courseOwnerId = args.courseTarget?.targetOwnerId || args.target.targetOwnerId;
  if (courseId) {
    scopes.push({ ownerId: courseOwnerId, scopeType: 'course', scopeId: courseId });
  }
  if (args.target.targetType === 'notebook' && args.target.notebookId) {
    scopes.push({
      ownerId: args.target.targetOwnerId,
      scopeType: 'notebook',
      scopeId: args.target.notebookId,
    });
  }
  if (args.userId && args.conversationId?.trim()) {
    scopes.push({
      ownerId: args.userId,
      scopeType: 'conversation',
      scopeId: args.conversationId.trim(),
    });
  }
  return scopes;
}

async function buildRecallPass(args: {
  prisma: PrismaClient;
  userId?: string | null;
  recallTarget: ReadableStudyMemoryTarget;
  courseTarget: ReadableStudyMemoryTarget | null;
  searchIntent: MemorySearchIntent;
  recallQuery: string;
  sourceEvidenceQuery: string;
  staleNeedles: string[];
  currentNeedles: string[];
}): Promise<MemoryRecallPass> {
  const [targetMemories, courseMemories, platformMemories] = await Promise.all([
    listStudyMemoriesForViewer(args.prisma, args.userId, args.recallTarget),
    args.recallTarget.targetType === 'notebook' && args.courseTarget
      ? listStudyMemoriesForViewer(args.prisma, args.userId, args.courseTarget)
      : [],
    listStudyMemoriesForViewer(
      args.prisma,
      args.userId,
      platformTargetForOwner({
        ownerId: args.recallTarget.targetOwnerId,
        viewerUserId: args.userId,
      }),
    ),
  ]);

  const directCourse =
    args.recallTarget.targetType === 'course'
      ? targetMemories.slice(0, 8)
      : courseMemories.slice(0, 4);
  const directTarget = args.recallTarget.targetType === 'course' ? [] : targetMemories.slice(0, 8);
  const directPlatform = platformMemories.slice(0, 4);
  const directFilter = filterStaleMemories({
    memories: uniqueById([...directPlatform, ...directCourse, ...directTarget]),
    staleNeedles: args.staleNeedles,
    currentNeedles: args.currentNeedles,
  });
  const directMemories = directFilter.memories;

  try {
    await indexStudyMemoryRecords(args.prisma, directMemories);
  } catch (error) {
    log.warn('Lazy study memory indexing failed:', error);
  }

  let semanticMemories: StudyMemoryRecord[] = [];
  let vectorUsed = false;
  let semanticFilteredIds: string[] = [];
  const shouldSearchSemanticMemory = args.searchIntent.knowledgeTypes.some(
    (type) => type === 'study_memory' || type === 'knowledge_sources',
  );
  if (shouldSearchSemanticMemory && args.recallQuery) {
    try {
      const matches = await semanticSearchStudyMemoryChunks({
        prisma: args.prisma,
        query: args.recallQuery,
        viewerUserId: args.userId || '',
        publicOwnerId: args.recallTarget.targetOwnerId,
        notebookId: args.recallTarget.notebookId,
        courseId: args.recallTarget.courseId,
        limit: 8,
      });
      vectorUsed = matches.length > 0;
      const rawSemantic = uniqueById(matches.map(semanticMatchToMemory));
      const semanticFilter = filterStaleMemories({
        memories: rawSemantic,
        staleNeedles: args.staleNeedles,
        currentNeedles: args.currentNeedles,
      });
      semanticMemories = semanticFilter.memories;
      semanticFilteredIds = semanticFilter.filteredIds;
    } catch (error) {
      log.warn('Semantic study memory recall failed:', error);
    }
  }

  let knowledgeMatches: MemoryKnowledgeMatch[] = [];
  const shouldSearchProblemBank =
    Boolean(args.searchIntent.progressFilter) ||
    args.searchIntent.knowledgeTypes.includes('problem_bank');
  if (shouldSearchProblemBank && args.recallQuery) {
    try {
      knowledgeMatches = await searchProblemBankKnowledge({
        prisma: args.prisma,
        query: args.recallQuery,
        notebookId: args.recallTarget.notebookId,
        courseId: args.recallTarget.courseId,
        viewerUserId: args.userId || '',
        progressFilter: args.searchIntent.progressFilter,
        limit: 6,
      });
    } catch (error) {
      log.warn('Problem-bank knowledge recall failed:', error);
    }
  }

  let sourceEvidence: MemoryEvidencePacket[] = [];
  if (args.sourceEvidenceQuery) {
    const shouldSearchMarkdownEvidence =
      args.searchIntent.knowledgeTypes.includes('knowledge_sources') ||
      args.searchIntent.plan.primarySources.includes('knowledge_sources') ||
      args.searchIntent.plan.secondarySources.includes('knowledge_sources');
    const shouldSearchProblemEvidence =
      shouldSearchProblemBank ||
      args.searchIntent.plan.primarySources.includes('problem_bank') ||
      args.searchIntent.plan.secondarySources.includes('problem_bank');
    const shouldSearchLearnerHistory =
      Boolean(args.userId) &&
      (args.searchIntent.knowledgeTypes.includes('learner_history') ||
        args.searchIntent.plan.primarySources.includes('learner_history') ||
        args.searchIntent.plan.secondarySources.includes('learner_history') ||
        args.searchIntent.kind === 'learner_understanding' ||
        args.searchIntent.kind === 'learning_status' ||
        args.searchIntent.kind === 'learner_questions');

    try {
      const [markdownEvidence, problemEvidence, studentMessages, attemptEvidence] =
        await Promise.all([
          shouldSearchMarkdownEvidence
            ? searchMarkdownSourceEvidence({
                prisma: args.prisma,
                query: args.sourceEvidenceQuery,
                notebookId: args.recallTarget.notebookId,
                courseId: args.recallTarget.courseId,
                limit: 5,
              })
            : [],
          shouldSearchProblemEvidence
            ? searchProblemSourceEvidence({
                prisma: args.prisma,
                query: args.sourceEvidenceQuery,
                notebookId: args.recallTarget.notebookId,
                courseId: args.recallTarget.courseId,
                viewerUserId: args.userId || '',
                progressFilter: args.searchIntent.progressFilter,
                limit: 5,
              })
            : [],
          shouldSearchLearnerHistory
            ? searchStudentMessageEvidence({
                prisma: args.prisma,
                query: args.sourceEvidenceQuery,
                userId: args.userId || '',
                notebookId: args.recallTarget.notebookId,
                courseId: args.recallTarget.courseId,
                limit: 5,
              })
            : [],
          shouldSearchLearnerHistory
            ? searchProblemAttemptEvidence({
                prisma: args.prisma,
                query: args.sourceEvidenceQuery,
                userId: args.userId || '',
                notebookId: args.recallTarget.notebookId,
                courseId: args.recallTarget.courseId,
                progressFilter: args.searchIntent.progressFilter,
                limit: 5,
              })
            : [],
        ]);
      sourceEvidence = mergeEvidencePackets(
        markdownEvidence,
        problemEvidence,
        studentMessages,
        attemptEvidence,
      ).slice(0, 12);
    } catch (error) {
      log.warn('Original source evidence recall failed:', error);
    }
  }

  let knowledgeCache: KnowledgeCacheEntry[] = [];
  if (args.userId) {
    try {
      const cacheQuery =
        args.recallQuery || args.sourceEvidenceQuery || args.searchIntent.originalQuery;
      await refreshKnowledgeCache({
        prisma: args.prisma,
        ownerId: args.userId,
        target: args.recallTarget,
        query: cacheQuery,
        entries: knowledgeCacheWritesFromResults({
          knowledgeMatches,
          sourceEvidence,
          limit: 10,
        }),
      });
      knowledgeCache = await listKnowledgeCache({
        prisma: args.prisma,
        ownerId: args.userId,
        target: args.recallTarget,
        query: cacheQuery,
        limit: 8,
      });
    } catch (error) {
      log.warn('Knowledge cache refresh failed:', error);
    }
  }

  let learnerAnalytics: LearnerAnalytics | null = null;
  if (args.userId) {
    try {
      learnerAnalytics = await buildLearnerAnalytics({
        prisma: args.prisma,
        userId: args.userId,
        target: {
          targetType: memoryContextTargetType(args.recallTarget),
          targetId: args.recallTarget.targetId,
          courseId: args.recallTarget.courseId,
          notebookId: args.recallTarget.notebookId,
        },
        query: args.searchIntent.originalQuery,
        searchIntent: args.searchIntent,
      });
    } catch (error) {
      log.warn('Learner analytics recall failed:', error);
    }
  }

  return {
    recallTarget: args.recallTarget,
    directPlatform,
    directCourse,
    directTarget,
    directMemories,
    semanticMemories,
    knowledgeCache,
    knowledgeMatches,
    sourceEvidence,
    learnerAnalytics,
    filteredStaleMemoryIds: [...directFilter.filteredIds, ...semanticFilteredIds],
    vectorUsed,
    evidenceCount: evidenceCount({
      directMemories,
      semanticMemories,
      knowledgeCache,
      knowledgeMatches,
      sourceEvidence,
      learnerAnalytics,
    }),
  };
}

function mergeRecallPasses(
  localPass: MemoryRecallPass,
  coursePass: MemoryRecallPass,
): MemoryRecallPass {
  const directPlatform = uniqueById([
    ...coursePass.directPlatform,
    ...localPass.directPlatform,
  ]).slice(0, 4);
  const directCourse = uniqueById([...coursePass.directCourse, ...localPass.directCourse]);
  const directTarget = localPass.directTarget;
  const directMemories = uniqueById([...directPlatform, ...directCourse, ...directTarget]);
  const semanticMemories = uniqueById([
    ...localPass.semanticMemories,
    ...coursePass.semanticMemories,
  ]).slice(0, 8);
  const knowledgeCache = uniqueKnowledgeCacheEntries([
    ...localPass.knowledgeCache,
    ...coursePass.knowledgeCache,
  ]).slice(0, 8);
  const knowledgeMatches = uniqueById([
    ...localPass.knowledgeMatches,
    ...coursePass.knowledgeMatches,
  ]).slice(0, 8);
  const sourceEvidence = mergeEvidencePackets(
    localPass.sourceEvidence,
    coursePass.sourceEvidence,
  ).slice(0, 12);
  const learnerAnalytics = coursePass.learnerAnalytics || localPass.learnerAnalytics;

  return {
    recallTarget: coursePass.recallTarget,
    directPlatform,
    directCourse,
    directTarget,
    directMemories,
    semanticMemories,
    knowledgeCache,
    knowledgeMatches,
    sourceEvidence,
    learnerAnalytics,
    filteredStaleMemoryIds: [
      ...new Set([...localPass.filteredStaleMemoryIds, ...coursePass.filteredStaleMemoryIds]),
    ],
    vectorUsed: localPass.vectorUsed || coursePass.vectorUsed,
    evidenceCount: evidenceCount({
      directMemories,
      semanticMemories,
      knowledgeCache,
      knowledgeMatches,
      sourceEvidence,
      learnerAnalytics,
    }),
  };
}

function emptyContext(storage: 'database' | 'unavailable'): MemoryRecallContext {
  return {
    prompt: 'N/A',
    scope: {
      requestedMode: 'course_wide',
      effectiveMode: 'course_wide',
      expanded: false,
      reason: 'No memory target was available.',
      originalTargetType: 'course',
      originalTargetId: '',
      effectiveTargetType: 'course',
      effectiveTargetId: '',
      courseId: null,
      notebookId: null,
      localEvidenceCount: 0,
      courseEvidenceCount: 0,
    },
    staticFacts: [],
    courseControllerMemories: [],
    currentNotebookMemories: [],
    specialistMemories: [],
    directMemories: [],
    semanticMatches: [],
    knowledgeCache: [],
    knowledgeMatches: [],
    sourceEvidence: [],
    learnerAnalytics: null,
    conflicts: [],
    filteredStaleMemoryIds: [],
    searchIntent: inferMemorySearchIntent(''),
    platformMemories: [],
    directCount: 0,
    semanticCount: 0,
    knowledgeCacheCount: 0,
    knowledgeCount: 0,
    sourceEvidenceCount: 0,
    learnerAnalyticsCount: 0,
    vectorUsed: false,
    storage,
  };
}

export async function buildMemoryRecallContext(args: {
  targetType: MemoryContextTargetType;
  targetId: string;
  userId?: string;
  question: string;
  conversationId?: string | null;
  searchIntent?: MemorySearchIntent;
}): Promise<MemoryRecallContext> {
  const prisma = getOptionalPrisma();
  if (!prisma) return emptyContext('unavailable');

  try {
    const searchIntent =
      args.searchIntent ?? inferMemorySearchIntent(args.question, args.targetType);
    const recallQuery =
      searchIntent.rewrittenQuery || (searchIntent.progressFilter ? '' : args.question);
    const sourceEvidenceQuery = uniqueStrings([
      searchIntent.originalQuery,
      args.question,
      searchIntent.rewrittenQuery,
      ...searchIntent.plan.searchQueries,
    ]).join('\n');
    const target = await resolveReadableStudyMemoryTarget(
      prisma,
      args.userId,
      args.targetType,
      args.targetId,
    );
    if (!target) return emptyContext('database');

    const courseTarget =
      target.targetType === 'notebook' ? await getCourseTarget(prisma, args.userId, target) : null;
    const scopeResolution = resolveRecallScope({
      target,
      courseTarget,
      searchIntent,
    });
    const recallTarget = scopeResolution.recallTarget;
    const factTarget = scopeResolution.factTarget;

    const factScopes = await buildFactScopes({
      userId: args.userId,
      target: factTarget,
      courseTarget: factTarget.targetType === 'notebook' ? courseTarget : null,
      conversationId: args.conversationId,
    });
    const factResolution = await resolveEffectiveMemoryFacts({
      prisma,
      scopes: factScopes,
    });
    const factKeys = factResolution.facts.map((fact) => ({
      namespace: fact.namespace,
      key: fact.key,
    }));
    const supersededEvents = await listSupersededMemoryFactEvents({
      prisma,
      scopes: factScopes,
      keys: factKeys,
      limit: 120,
    });
    const staleNeedles = supersededEvents.flatMap((event) =>
      staleNeedlesFromValue(event.oldValueJson),
    );
    const currentNeedles = factResolution.facts.flatMap((fact) =>
      staleNeedlesFromValue(fact.valueJson),
    );

    const shouldRunLocalExpansionPass =
      searchIntent.scopeMode === 'auto_expand' &&
      target.targetType === 'notebook' &&
      recallTarget.targetType === 'course';
    const [localPass, recallPass] = await Promise.all([
      shouldRunLocalExpansionPass
        ? buildRecallPass({
            prisma,
            userId: args.userId,
            recallTarget: target,
            courseTarget,
            searchIntent,
            recallQuery,
            sourceEvidenceQuery,
            staleNeedles,
            currentNeedles,
          })
        : Promise.resolve<MemoryRecallPass | null>(null),
      buildRecallPass({
        prisma,
        userId: args.userId,
        recallTarget,
        courseTarget,
        searchIntent,
        recallQuery,
        sourceEvidenceQuery,
        staleNeedles,
        currentNeedles,
      }),
    ]);
    const finalPass = localPass ? mergeRecallPasses(localPass, recallPass) : recallPass;
    const directPlatform = finalPass.directPlatform;
    const directCourse = finalPass.directCourse;
    const directTarget = finalPass.directTarget;
    const directMemories = finalPass.directMemories;
    const semanticMemories = finalPass.semanticMemories;
    const knowledgeCache = finalPass.knowledgeCache;
    const knowledgeMatches = finalPass.knowledgeMatches;
    const sourceEvidence = finalPass.sourceEvidence;
    const learnerAnalytics = finalPass.learnerAnalytics;
    const vectorUsed = finalPass.vectorUsed;
    const directMemoryIds = new Set(directMemories.map((memory) => memory.id));
    const platformMemories = directPlatform.filter((memory) => directMemoryIds.has(memory.id));
    const courseControllerMemories = directCourse.filter((memory) =>
      directMemoryIds.has(memory.id),
    );
    const currentNotebookMemories = directTarget.filter((memory) => directMemoryIds.has(memory.id));
    const directLayerIds = new Set([
      ...platformMemories.map((memory) => memory.id),
      ...courseControllerMemories.map((memory) => memory.id),
      ...currentNotebookMemories.map((memory) => memory.id),
    ]);
    const specialistMemories = semanticMemories.filter((memory) => !directLayerIds.has(memory.id));

    const scope = {
      ...scopeResolution.scope,
      localEvidenceCount: localPass
        ? localPass.evidenceCount
        : recallTarget.targetType === 'notebook'
          ? recallPass.evidenceCount
          : 0,
      courseEvidenceCount: recallTarget.targetType === 'course' ? recallPass.evidenceCount : 0,
    };

    const sections = [
      formatRecallScope(scope),
      formatFacts(factResolution.facts),
      formatConflicts(factResolution.conflicts),
      formatSection({
        title: 'Platform memory injected directly',
        memories: platformMemories,
      }),
      formatSection({
        title: 'Course controller memory injected directly',
        memories: courseControllerMemories,
      }),
      formatSection({
        title: 'Current notebook specialist memory injected directly',
        memories: currentNotebookMemories,
      }),
      formatSection({
        title: 'Semantically recalled specialist memory from course notebooks',
        memories: specialistMemories.slice(0, 6),
      }),
      formatKnowledgeCache(knowledgeCache),
      formatSourceEvidence(sourceEvidence),
      formatLearnerAnalytics(learnerAnalytics),
      formatKnowledgeMatches(knowledgeMatches),
    ].filter(Boolean);

    const prompt =
      sections.length > 0
        ? [
            'Use this layered memory context as durable context for the answer.',
            'Answer as the course controller: decide the task type, choose the applicable course template/rule, then use notebook memories as specialist evidence.',
            'Platform memory is global user/platform context and applies before course-local and notebook-local memory when relevant.',
            'Course controller memory has the highest priority for course-wide rules, allowed tools, forbidden moves, and template-routing policy.',
            'Current notebook specialist memory explains the local lesson template, examples, and chapter-specific constraints.',
            'Semantically recalled specialist memory can supply cross-notebook details, but only when it is relevant to the user question.',
            'Memory recall scope tells whether this answer is grounded in the current notebook or the whole course.',
            'Structured memory facts are exact current values and override any fuzzy or semantic memory.',
            'Public study memory describes course/notebook facts, teacher requirements, and reusable teaching constraints.',
            'Private study memory describes only this learner; use it for personalization or weak points, not as public course fact.',
            'Semantic memory and knowledge matches are discovery aids; do not treat them as current truth if structured facts disagree.',
            'If memory conflicts with the current notebook page excerpts, prefer the current notebook and mention uncertainty.',
            '',
            ...sections,
          ].join('\n')
        : 'N/A';

    return {
      prompt: compact(prompt, 10000),
      scope,
      staticFacts: factResolution.facts,
      platformMemories,
      courseControllerMemories,
      currentNotebookMemories,
      specialistMemories,
      directMemories,
      semanticMatches: semanticMemories,
      knowledgeCache,
      knowledgeMatches,
      sourceEvidence,
      learnerAnalytics,
      conflicts: factResolution.conflicts,
      filteredStaleMemoryIds: finalPass.filteredStaleMemoryIds,
      searchIntent,
      directCount: directMemories.length,
      semanticCount: semanticMemories.length,
      knowledgeCacheCount: knowledgeCache.length,
      knowledgeCount: knowledgeMatches.length,
      sourceEvidenceCount: sourceEvidence.length,
      learnerAnalyticsCount: learnerAnalytics
        ? learnerAnalytics.summary.questionCount +
          learnerAnalytics.summary.attemptCount +
          learnerAnalytics.summary.privateMemoryCount
        : 0,
      vectorUsed,
      storage: 'database',
    };
  } catch (error) {
    log.warn('Failed to build layered memory context:', error);
    return emptyContext('database');
  }
}

export async function buildNotebookStudyMemoryPromptContext(args: {
  notebookId: string;
  courseId?: string | null;
  userId?: string;
  question: string;
  conversationId?: string | null;
  searchIntent?: MemorySearchIntent;
}): Promise<NotebookStudyMemoryPromptContext> {
  const notebookContext = await buildMemoryRecallContext({
    targetType: 'notebook',
    targetId: args.notebookId,
    userId: args.userId,
    question: args.question,
    conversationId: args.conversationId,
    searchIntent: args.searchIntent,
  });
  const hasNotebookEvidence =
    notebookContext.directCount > 0 ||
    notebookContext.semanticCount > 0 ||
    notebookContext.knowledgeCount > 0 ||
    notebookContext.sourceEvidenceCount > 0 ||
    notebookContext.staticFacts.length > 0;
  if (hasNotebookEvidence || !args.courseId) return notebookContext;

  const courseContext = await buildMemoryRecallContext({
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
      reason: `${courseContext.scope.reason} Fallback to course-level memory because the notebook target had no readable memory evidence.`,
    },
  };
}
