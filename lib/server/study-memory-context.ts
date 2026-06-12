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
  indexStudyMemoryRecords,
  semanticSearchStudyMemoryChunks,
  type StudyMemorySemanticMatch,
} from '@/lib/server/study-memory-vector-store';
import {
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

export type MemoryRecallContext = {
  prompt: string;
  staticFacts: MemoryFactRecord[];
  directMemories: StudyMemoryRecord[];
  semanticMatches: StudyMemoryRecord[];
  knowledgeMatches: MemoryKnowledgeMatch[];
  conflicts: MemoryFactConflict[];
  filteredStaleMemoryIds: string[];
  directCount: number;
  semanticCount: number;
  knowledgeCount: number;
  vectorUsed: boolean;
  storage: 'database' | 'unavailable';
};

export type NotebookStudyMemoryPromptContext = MemoryRecallContext;

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
  const targetLabel = memory.targetType === 'course' ? 'course' : 'notebook';
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
  return {
    id: match.memoryId,
    ownerId: match.ownerId,
    courseId: match.courseId,
    notebookId: match.notebookId,
    targetType: match.targetType === 'course' ? 'course' : 'notebook',
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

async function getCourseTarget(
  prisma: PrismaClient,
  userId: string,
  notebookTarget: ReadableStudyMemoryTarget,
): Promise<ReadableStudyMemoryTarget | null> {
  if (!notebookTarget.courseId) return null;
  return resolveReadableStudyMemoryTarget(prisma, userId, 'course', notebookTarget.courseId);
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
      return `${index + 1}. [${match.sourceType}] ${match.title} (score=${match.score.toFixed(
        1,
      )}; ${match.metadata.problemType}/${match.metadata.difficulty}${tags})\n   - ${compact(
        match.text,
        520,
      )}`;
    }),
  ].join('\n');
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
  userId: string;
  target: ReadableStudyMemoryTarget;
  courseTarget: ReadableStudyMemoryTarget | null;
  conversationId?: string | null;
}): Promise<MemoryFactScopeRef[]> {
  const scopes: MemoryFactScopeRef[] = [{ ownerId: args.userId, scopeType: 'user', scopeId: null }];
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
  if (args.conversationId?.trim()) {
    scopes.push({
      ownerId: args.userId,
      scopeType: 'conversation',
      scopeId: args.conversationId.trim(),
    });
  }
  return scopes;
}

function emptyContext(storage: 'database' | 'unavailable'): MemoryRecallContext {
  return {
    prompt: 'N/A',
    staticFacts: [],
    directMemories: [],
    semanticMatches: [],
    knowledgeMatches: [],
    conflicts: [],
    filteredStaleMemoryIds: [],
    directCount: 0,
    semanticCount: 0,
    knowledgeCount: 0,
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
}): Promise<MemoryRecallContext> {
  const prisma = getOptionalPrisma();
  if (!prisma || !args.userId) return emptyContext('unavailable');

  try {
    const target = await resolveReadableStudyMemoryTarget(
      prisma,
      args.userId,
      args.targetType,
      args.targetId,
    );
    if (!target) return emptyContext('database');

    const courseTarget =
      target.targetType === 'notebook' ? await getCourseTarget(prisma, args.userId, target) : null;
    const [targetMemories, courseMemories] = await Promise.all([
      listStudyMemoriesForViewer(prisma, args.userId, target),
      courseTarget ? listStudyMemoriesForViewer(prisma, args.userId, courseTarget) : [],
    ]);

    const factScopes = await buildFactScopes({
      userId: args.userId,
      target,
      courseTarget,
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

    const directCourse =
      target.targetType === 'course' ? targetMemories.slice(0, 8) : courseMemories.slice(0, 4);
    const directTarget = target.targetType === 'course' ? [] : targetMemories.slice(0, 8);
    const directFilter = filterStaleMemories({
      memories: uniqueById([...directCourse, ...directTarget]),
      staleNeedles,
      currentNeedles,
    });
    const directMemories = directFilter.memories;

    try {
      await indexStudyMemoryRecords(prisma, directMemories);
    } catch (error) {
      log.warn('Lazy study memory indexing failed:', error);
    }

    let semanticMemories: StudyMemoryRecord[] = [];
    let vectorUsed = false;
    let semanticFilteredIds: string[] = [];
    try {
      const matches = await semanticSearchStudyMemoryChunks({
        prisma,
        query: args.question,
        viewerUserId: args.userId,
        publicOwnerId: target.targetOwnerId,
        notebookId: target.notebookId,
        courseId: target.courseId,
        limit: 8,
      });
      vectorUsed = matches.length > 0;
      const directIds = new Set(directMemories.map((memory) => memory.id));
      const rawSemantic = uniqueById(matches.map(semanticMatchToMemory)).filter(
        (memory) => !directIds.has(memory.id),
      );
      const semanticFilter = filterStaleMemories({
        memories: rawSemantic,
        staleNeedles,
        currentNeedles,
      });
      semanticMemories = semanticFilter.memories;
      semanticFilteredIds = semanticFilter.filteredIds;
    } catch (error) {
      log.warn('Semantic study memory recall failed:', error);
    }

    let knowledgeMatches: MemoryKnowledgeMatch[] = [];
    try {
      knowledgeMatches = await searchProblemBankKnowledge({
        prisma,
        query: args.question,
        notebookId: target.notebookId,
        courseId: target.courseId,
        limit: 6,
      });
    } catch (error) {
      log.warn('Problem-bank knowledge recall failed:', error);
    }

    const sections = [
      formatFacts(factResolution.facts),
      formatConflicts(factResolution.conflicts),
      formatSection({
        title: 'Course public/private memory injected directly',
        memories: directCourse.filter((memory) =>
          directMemories.some((item) => item.id === memory.id),
        ),
      }),
      formatSection({
        title: 'Current notebook public/private memory injected directly',
        memories: directTarget.filter((memory) =>
          directMemories.some((item) => item.id === memory.id),
        ),
      }),
      formatSection({
        title: 'Semantically recalled study memory from the same course/notebook',
        memories: semanticMemories.slice(0, 6),
      }),
      formatKnowledgeMatches(knowledgeMatches),
    ].filter(Boolean);

    const prompt =
      sections.length > 0
        ? [
            'Use this layered memory context as durable context for the answer.',
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
      staticFacts: factResolution.facts,
      directMemories,
      semanticMatches: semanticMemories,
      knowledgeMatches,
      conflicts: factResolution.conflicts,
      filteredStaleMemoryIds: [...directFilter.filteredIds, ...semanticFilteredIds],
      directCount: directMemories.length,
      semanticCount: semanticMemories.length,
      knowledgeCount: knowledgeMatches.length,
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
  userId?: string;
  question: string;
  conversationId?: string | null;
}): Promise<NotebookStudyMemoryPromptContext> {
  return buildMemoryRecallContext({
    targetType: 'notebook',
    targetId: args.notebookId,
    userId: args.userId,
    question: args.question,
    conversationId: args.conversationId,
  });
}
