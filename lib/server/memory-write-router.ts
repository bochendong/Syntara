import type { PrismaClient } from '@/lib/server/generated-prisma';
import {
  upsertMemoryFact,
  type MemoryFactEventRecord,
  type MemoryFactRecord,
  type MemoryFactScopeType,
} from '@/lib/server/memory-fact-store';
import {
  createStudyMemory,
  resolveOwnedStudyMemoryTarget,
  resolveReadableStudyMemoryTarget,
  type StudyMemoryRecord,
  type StudyMemoryScopeValue,
  type StudyMemoryTarget,
  type StudyMemoryTargetType,
} from '@/lib/server/study-memory-store';

export type MemoryWriteTrigger =
  | 'explicit_user'
  | 'fact_correction'
  | 'chat_turn_end'
  | 'problem_attempt'
  | 'source_import'
  | 'periodic_summary'
  | 'manual'
  | 'agent_tool';

export type MemoryWriteContentType =
  | 'current_fact'
  | 'preference'
  | 'profile'
  | 'course_requirement'
  | 'notebook_requirement'
  | 'learning_pattern'
  | 'weakness'
  | 'conversation_summary'
  | 'source_original'
  | 'problem_original'
  | 'problem_attempt'
  | 'other';

export type MemoryWriteAction =
  | 'write_fact'
  | 'write_study_memory'
  | 'index_knowledge_source'
  | 'write_business_record'
  | 'ignore'
  | 'needs_confirmation';

export type MemoryWriteCandidate = {
  id?: string | null;
  trigger: MemoryWriteTrigger;
  contentType: MemoryWriteContentType;
  targetType?: StudyMemoryTargetType | null;
  targetId?: string | null;
  conversationId?: string | null;
  title?: string | null;
  text?: string | null;
  privacy?: StudyMemoryScopeValue | null;
  scopeType?: MemoryFactScopeType | null;
  scopeId?: string | null;
  source?: string | null;
  sourceRef?: unknown;
  fact?: {
    namespace?: string | null;
    key?: string | null;
    valueJson?: unknown;
    confidence?: number | null;
  } | null;
  studyMemory?: {
    targetType?: StudyMemoryTargetType | null;
    targetId?: string | null;
    scope?: StudyMemoryScopeValue | null;
    kind?: string | null;
    title?: string | null;
    text?: string | null;
    reason?: string | null;
    question?: string | null;
    sourceReferences?: unknown;
  } | null;
};

export type MemoryWriteDecision = {
  candidateId: string | null;
  action: MemoryWriteAction;
  layer: 'structured_fact' | 'study_memory' | 'knowledge_index' | 'business_record' | 'none';
  reason: string;
  scope: {
    scopeType?: MemoryFactScopeType;
    scopeId?: string | null;
    targetType?: StudyMemoryTargetType;
    targetId?: string | null;
    privacy?: StudyMemoryScopeValue;
  };
};

export type MemoryWriteResult = MemoryWriteDecision & {
  executed: boolean;
  fact?: MemoryFactRecord;
  factEvent?: MemoryFactEventRecord;
  memory?: StudyMemoryRecord;
  error?: string;
};

function trimOrNull(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function sourceName(candidate: MemoryWriteCandidate): string {
  return trimOrNull(candidate.source)?.slice(0, 80) || 'memory-write-router';
}

function contentTitle(candidate: MemoryWriteCandidate): string {
  return (
    trimOrNull(candidate.studyMemory?.title) ||
    trimOrNull(candidate.title) ||
    defaultTitle(candidate.contentType)
  );
}

function contentText(candidate: MemoryWriteCandidate): string | null {
  return trimOrNull(candidate.studyMemory?.text) || trimOrNull(candidate.text);
}

function defaultTitle(contentType: MemoryWriteContentType): string {
  if (contentType === 'weakness') return '学习薄弱点';
  if (contentType === 'learning_pattern') return '学习模式';
  if (contentType === 'conversation_summary') return '对话摘要';
  if (contentType === 'course_requirement') return '课程记忆';
  if (contentType === 'notebook_requirement') return '笔记本记忆';
  return '记忆';
}

function studyMemoryKind(contentType: MemoryWriteContentType, explicit?: string | null): string {
  const provided = trimOrNull(explicit);
  if (provided) return provided.slice(0, 40);
  if (contentType === 'weakness') return 'knowledge_gap';
  if (contentType === 'learning_pattern') return 'reflection';
  if (contentType === 'conversation_summary') return 'conversation_summary';
  if (contentType === 'course_requirement' || contentType === 'notebook_requirement') {
    return 'public_memory';
  }
  return 'manual';
}

function factScope(candidate: MemoryWriteCandidate): {
  scopeType: MemoryFactScopeType;
  scopeId: string | null;
} {
  if (candidate.scopeType) {
    return {
      scopeType: candidate.scopeType,
      scopeId: candidate.scopeType === 'user' ? null : trimOrNull(candidate.scopeId),
    };
  }
  if (candidate.contentType === 'preference' || candidate.contentType === 'profile') {
    return { scopeType: 'user', scopeId: null };
  }
  if (candidate.contentType === 'course_requirement' && candidate.targetType === 'course') {
    return { scopeType: 'course', scopeId: trimOrNull(candidate.targetId) };
  }
  if (candidate.contentType === 'notebook_requirement' && candidate.targetType === 'notebook') {
    return { scopeType: 'notebook', scopeId: trimOrNull(candidate.targetId) };
  }
  if (candidate.conversationId && candidate.trigger === 'chat_turn_end') {
    return { scopeType: 'conversation', scopeId: trimOrNull(candidate.conversationId) };
  }
  if (candidate.targetType === 'course') {
    return { scopeType: 'course', scopeId: trimOrNull(candidate.targetId) };
  }
  if (candidate.targetType === 'notebook') {
    return { scopeType: 'notebook', scopeId: trimOrNull(candidate.targetId) };
  }
  return { scopeType: 'user', scopeId: null };
}

function studyMemoryTarget(candidate: MemoryWriteCandidate): {
  targetType: StudyMemoryTargetType | null;
  targetId: string | null;
} {
  const explicitTargetType = candidate.studyMemory?.targetType || candidate.targetType || null;
  const explicitTargetId =
    trimOrNull(candidate.studyMemory?.targetId) || trimOrNull(candidate.targetId);
  if (explicitTargetType && explicitTargetId) {
    return { targetType: explicitTargetType, targetId: explicitTargetId };
  }
  return { targetType: null, targetId: null };
}

function defaultStudyMemoryPrivacy(candidate: MemoryWriteCandidate): StudyMemoryScopeValue {
  if (candidate.studyMemory?.scope) return candidate.studyMemory.scope;
  if (candidate.privacy) return candidate.privacy;
  if (
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  ) {
    return 'public';
  }
  return 'private';
}

function hasCompleteFact(candidate: MemoryWriteCandidate): boolean {
  return Boolean(
    trimOrNull(candidate.fact?.namespace) &&
    trimOrNull(candidate.fact?.key) &&
    candidate.fact &&
    Object.prototype.hasOwnProperty.call(candidate.fact, 'valueJson') &&
    candidate.fact.valueJson !== undefined,
  );
}

function isFactLike(candidate: MemoryWriteCandidate): boolean {
  return (
    candidate.contentType === 'current_fact' ||
    candidate.contentType === 'preference' ||
    candidate.contentType === 'profile' ||
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  );
}

function isStudyMemoryLike(candidate: MemoryWriteCandidate): boolean {
  return (
    candidate.contentType === 'learning_pattern' ||
    candidate.contentType === 'weakness' ||
    candidate.contentType === 'conversation_summary' ||
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  );
}

export function planMemoryWrite(candidate: MemoryWriteCandidate): MemoryWriteDecision {
  const candidateId = trimOrNull(candidate.id);

  if (candidate.contentType === 'source_original' || candidate.contentType === 'problem_original') {
    return {
      candidateId,
      action: 'index_knowledge_source',
      layer: 'knowledge_index',
      reason:
        'Original source/problem text should be indexed as retrievable knowledge, not summarized as memory.',
      scope: {
        targetType: candidate.targetType || undefined,
        targetId: trimOrNull(candidate.targetId),
      },
    };
  }

  if (candidate.contentType === 'problem_attempt') {
    return {
      candidateId,
      action: 'write_business_record',
      layer: 'business_record',
      reason:
        'Problem attempts belong in the problem progress/attempt tables; derived patterns can become private study memory later.',
      scope: {
        targetType: candidate.targetType || undefined,
        targetId: trimOrNull(candidate.targetId),
      },
    };
  }

  if (hasCompleteFact(candidate)) {
    const scope = factScope(candidate);
    return {
      candidateId,
      action: 'write_fact',
      layer: 'structured_fact',
      reason:
        'The candidate contains a complete exact fact, so it should be upserted as current structured truth.',
      scope,
    };
  }

  if (isFactLike(candidate) && !contentText(candidate)) {
    const scope = factScope(candidate);
    return {
      candidateId,
      action: 'needs_confirmation',
      layer: 'none',
      reason:
        'This looks like an exact fact, but it does not include a structured namespace/key/value or usable text.',
      scope,
    };
  }

  if (isStudyMemoryLike(candidate) && contentText(candidate)) {
    const target = studyMemoryTarget(candidate);
    if (!target.targetType || !target.targetId) {
      return {
        candidateId,
        action: 'needs_confirmation',
        layer: 'none',
        reason: 'Study memory needs a platform, course, or notebook target.',
        scope: {},
      };
    }
    return {
      candidateId,
      action: 'write_study_memory',
      layer: 'study_memory',
      reason:
        'The candidate is a reusable pattern, summary, or teaching constraint rather than a single current value.',
      scope: {
        targetType: target.targetType,
        targetId: target.targetId,
        privacy: defaultStudyMemoryPrivacy(candidate),
      },
    };
  }

  return {
    candidateId,
    action: 'ignore',
    layer: 'none',
    reason:
      'The candidate is not reusable enough for memory, or it lacks the structure needed for a safe write.',
    scope: {},
  };
}

async function assertFactScopeWritable(args: {
  prisma: PrismaClient;
  userId: string;
  scopeType: MemoryFactScopeType;
  scopeId: string | null | undefined;
}): Promise<void> {
  if (args.scopeType === 'user') return;
  if (!args.scopeId) throw new Error(`${args.scopeType} facts require scopeId`);
  if (args.scopeType === 'course' || args.scopeType === 'notebook') {
    const target = await resolveOwnedStudyMemoryTarget(
      args.prisma,
      args.userId,
      args.scopeType,
      args.scopeId,
    );
    if (!target) throw new Error('Only the owner can write course/notebook structured facts');
    return;
  }

  const rows = await args.prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT "id"
      FROM "Conversation"
      WHERE "id" = $1 AND "ownerId" = $2
      LIMIT 1
    `,
    args.scopeId,
    args.userId,
  );
  if (rows.length === 0) throw new Error('Conversation fact scope is not writable');
}

function compactSourceRef(candidate: MemoryWriteCandidate, decision: MemoryWriteDecision): unknown {
  return (
    candidate.sourceRef ?? {
      candidateId: decision.candidateId,
      trigger: candidate.trigger,
      contentType: candidate.contentType,
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      conversationId: candidate.conversationId,
    }
  );
}

async function executeFactWrite(args: {
  prisma: PrismaClient;
  userId: string;
  candidate: MemoryWriteCandidate;
  decision: MemoryWriteDecision;
}): Promise<MemoryWriteResult> {
  if (!hasCompleteFact(args.candidate)) {
    throw new Error('Structured fact writes require namespace, key, and valueJson');
  }
  const scope = factScope(args.candidate);
  await assertFactScopeWritable({
    prisma: args.prisma,
    userId: args.userId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
  });
  const result = await upsertMemoryFact({
    prisma: args.prisma,
    ownerId: args.userId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    namespace: trimOrNull(args.candidate.fact?.namespace) || 'general',
    key: trimOrNull(args.candidate.fact?.key) || 'value',
    valueJson: args.candidate.fact?.valueJson,
    confidence: args.candidate.fact?.confidence ?? undefined,
    source: sourceName(args.candidate),
    sourceRef: compactSourceRef(args.candidate, args.decision),
  });
  return {
    ...args.decision,
    executed: true,
    fact: result.fact,
    factEvent: result.event,
  };
}

async function executeStudyMemoryWrite(args: {
  prisma: PrismaClient;
  userId: string;
  candidate: MemoryWriteCandidate;
  decision: MemoryWriteDecision;
}): Promise<MemoryWriteResult> {
  const target = studyMemoryTarget(args.candidate);
  if (!target.targetType || !target.targetId) throw new Error('Study memory target is required');
  const readableTarget = await resolveReadableStudyMemoryTarget(
    args.prisma,
    args.userId,
    target.targetType,
    target.targetId,
  );
  if (!readableTarget) throw new Error('Memory target not found');

  const scope = defaultStudyMemoryPrivacy(args.candidate);
  if (scope === 'public' && readableTarget.accessRole !== 'owner') {
    throw new Error('Only the owner can write public platform/course/notebook study memory');
  }

  const writeTarget: StudyMemoryTarget = {
    targetType: readableTarget.targetType,
    targetId: readableTarget.targetId,
    courseId: readableTarget.courseId,
    notebookId: readableTarget.notebookId,
  };
  const memory = await createStudyMemory({
    prisma: args.prisma,
    userId: args.userId,
    target: writeTarget,
    scope,
    kind: studyMemoryKind(args.candidate.contentType, args.candidate.studyMemory?.kind),
    source: sourceName(args.candidate),
    title: contentTitle(args.candidate).slice(0, 120),
    text: contentText(args.candidate) || contentTitle(args.candidate),
    reason: trimOrNull(args.candidate.studyMemory?.reason) || args.decision.reason,
    question: trimOrNull(args.candidate.studyMemory?.question),
    sourceReferences:
      args.candidate.studyMemory?.sourceReferences ??
      compactSourceRef(args.candidate, args.decision),
  });

  return {
    ...args.decision,
    executed: true,
    memory,
  };
}

export async function routeMemoryWriteCandidate(args: {
  prisma: PrismaClient;
  userId: string;
  candidate: MemoryWriteCandidate;
  dryRun?: boolean;
}): Promise<MemoryWriteResult> {
  const decision = planMemoryWrite(args.candidate);
  if (args.dryRun || decision.action === 'ignore' || decision.action === 'needs_confirmation') {
    return { ...decision, executed: false };
  }

  if (decision.action === 'index_knowledge_source' || decision.action === 'write_business_record') {
    return { ...decision, executed: false };
  }

  try {
    if (decision.action === 'write_fact') {
      return await executeFactWrite({
        prisma: args.prisma,
        userId: args.userId,
        candidate: args.candidate,
        decision,
      });
    }
    if (decision.action === 'write_study_memory') {
      return await executeStudyMemoryWrite({
        prisma: args.prisma,
        userId: args.userId,
        candidate: args.candidate,
        decision,
      });
    }
    return { ...decision, executed: false };
  } catch (error) {
    return {
      ...decision,
      action: 'needs_confirmation',
      layer: 'none',
      executed: false,
      error: error instanceof Error ? error.message : 'Memory write failed',
    };
  }
}

export async function routeMemoryWriteCandidates(args: {
  prisma: PrismaClient;
  userId: string;
  candidates: MemoryWriteCandidate[];
  dryRun?: boolean;
}): Promise<MemoryWriteResult[]> {
  const results: MemoryWriteResult[] = [];
  for (const candidate of args.candidates) {
    results.push(
      await routeMemoryWriteCandidate({
        prisma: args.prisma,
        userId: args.userId,
        candidate,
        dryRun: args.dryRun,
      }),
    );
  }
  return results;
}
