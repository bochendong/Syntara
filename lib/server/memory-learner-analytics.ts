import type { PrismaClient } from '@/lib/server/generated-prisma';
import type { MemorySearchIntent } from '@/lib/server/memory-search-intent';

export type LearnerAnalyticsTimeScope = 'week' | 'month' | 'term' | 'all';

export type LearnerAnalyticsMessage = {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  conversationKind: string;
  notebookId: string | null;
  notebookName: string | null;
  text: string;
  createdAt: string;
};

export type LearnerAnalyticsAttempt = {
  id: string;
  problemId: string;
  problemTitle: string;
  notebookId: string | null;
  notebookName: string | null;
  status: string;
  score: number | null;
  tags: string[];
  difficulty: string;
  createdAt: string;
};

export type LearnerAnalyticsPrivateMemory = {
  id: string;
  title: string;
  text: string;
  kind: string;
  source: string;
  notebookId: string | null;
  notebookName: string | null;
  updatedAt: string;
};

export type LearnerAnalytics = {
  targetType: 'course' | 'notebook';
  targetId: string;
  timeScope: LearnerAnalyticsTimeScope;
  since: string | null;
  until: string;
  summary: {
    questionCount: number;
    attemptCount: number;
    attemptedProblemCount: number;
    passedCount: number;
    failedCount: number;
    partialCount: number;
    privateMemoryCount: number;
    activeNotebookCount: number;
  };
  messages: LearnerAnalyticsMessage[];
  attempts: LearnerAnalyticsAttempt[];
  privateMemories: LearnerAnalyticsPrivateMemory[];
  weakTags: Array<{ tag: string; count: number }>;
  activeNotebooks: Array<{ notebookId: string; notebookName: string; count: number }>;
};

type AnalyticsTarget = {
  targetType: 'course' | 'notebook';
  targetId: string;
  courseId: string | null;
  notebookId: string | null;
};

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

export function inferLearnerAnalyticsTimeScope(query: string): LearnerAnalyticsTimeScope {
  const text = query.normalize('NFKC').toLowerCase();
  if (/这周|本周|一周|week/u.test(text)) return 'week';
  if (/这个月|本月|近一个月|month/u.test(text)) return 'month';
  if (/整学期|本学期|这个学期|学期|semester|term/u.test(text)) return 'term';
  return 'all';
}

async function startDateForScope(args: {
  prisma: PrismaClient;
  courseId?: string | null;
  timeScope: LearnerAnalyticsTimeScope;
}): Promise<Date | null> {
  const now = new Date();
  if (args.timeScope === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (args.timeScope === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (args.timeScope === 'term') {
    if (args.courseId) {
      const course = await args.prisma.course.findUnique({
        where: { id: args.courseId },
        select: { createdAt: true },
      });
      if (course?.createdAt) return course.createdAt;
    }
    return new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  }
  return null;
}

function courseScopeId(target: AnalyticsTarget): string {
  return target.courseId || (target.targetType === 'course' ? target.targetId : '');
}

function conversationScopeWhere(target: AnalyticsTarget) {
  if (target.targetType === 'notebook') {
    return { notebookId: target.notebookId || target.targetId };
  }
  const courseId = courseScopeId(target);
  return { OR: [{ courseId }, { notebook: { courseId } }] };
}

function problemScopeWhere(target: AnalyticsTarget) {
  if (target.targetType === 'notebook') {
    return { notebookId: target.notebookId || target.targetId };
  }
  const courseId = courseScopeId(target);
  return { OR: [{ courseId }, { notebook: { courseId } }] };
}

function memoryScopeWhere(target: AnalyticsTarget) {
  if (target.targetType === 'notebook') {
    return { notebookId: target.notebookId || target.targetId };
  }
  const courseId = courseScopeId(target);
  return { OR: [{ courseId }, { notebook: { courseId } }] };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function topCounts(values: string[], limit: number): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const tag = compact(raw, 80);
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

function activeNotebookCounts(
  items: Array<{ notebookId: string | null; notebookName: string | null }>,
) {
  const counts = new Map<string, { notebookId: string; notebookName: string; count: number }>();
  for (const item of items) {
    if (!item.notebookId) continue;
    const current = counts.get(item.notebookId) || {
      notebookId: item.notebookId,
      notebookName: item.notebookName || '未命名笔记本',
      count: 0,
    };
    current.count += 1;
    counts.set(item.notebookId, current);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.notebookName.localeCompare(b.notebookName))
    .slice(0, 8);
}

export async function buildLearnerAnalytics(args: {
  prisma: PrismaClient;
  userId: string;
  target: AnalyticsTarget;
  query: string;
  searchIntent: MemorySearchIntent;
}): Promise<LearnerAnalytics | null> {
  const shouldCollect =
    args.searchIntent.knowledgeTypes.includes('learner_history') ||
    args.searchIntent.kind === 'learner_understanding' ||
    args.searchIntent.kind === 'learning_status' ||
    args.searchIntent.kind === 'learner_questions' ||
    args.searchIntent.kind === 'weakness_review';
  if (!shouldCollect) return null;

  const timeScope = inferLearnerAnalyticsTimeScope(args.query || args.searchIntent.originalQuery);
  const since = await startDateForScope({
    prisma: args.prisma,
    courseId: args.target.courseId,
    timeScope,
  });
  const [messageRows, attemptRows, memoryRows] = await Promise.all([
    args.prisma.message.findMany({
      where: {
        ownerId: args.userId,
        role: 'user',
        plainText: { not: null },
        ...(since ? { createdAt: { gte: since } } : {}),
        conversation: conversationScopeWhere(args.target),
      },
      select: {
        id: true,
        conversationId: true,
        plainText: true,
        createdAt: true,
        conversation: {
          select: {
            title: true,
            kind: true,
            notebookId: true,
            notebook: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    args.prisma.notebookProblemAttempt.findMany({
      where: {
        userId: args.userId,
        ...(since ? { createdAt: { gte: since } } : {}),
        problem: {
          status: { not: 'archived' },
          ...problemScopeWhere(args.target),
        },
      },
      select: {
        id: true,
        problemId: true,
        status: true,
        score: true,
        createdAt: true,
        problem: {
          select: {
            title: true,
            notebookId: true,
            tags: true,
            difficulty: true,
            notebook: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    args.prisma.studyMemory.findMany({
      where: {
        ownerId: args.userId,
        scope: 'private',
        status: 'active',
        ...(since ? { updatedAt: { gte: since } } : {}),
        ...memoryScopeWhere(args.target),
      },
      select: {
        id: true,
        title: true,
        text: true,
        kind: true,
        source: true,
        notebookId: true,
        updatedAt: true,
        notebook: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  const messages = messageRows
    .map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      conversationTitle: row.conversation.title,
      conversationKind: String(row.conversation.kind),
      notebookId: row.conversation.notebookId,
      notebookName: row.conversation.notebook?.name || null,
      text: compact(row.plainText, 900),
      createdAt: iso(row.createdAt),
    }))
    .filter((row) => row.text.length > 0)
    .slice(0, 40);
  const attempts = attemptRows.map((row) => ({
    id: row.id,
    problemId: row.problemId,
    problemTitle: row.problem.title,
    notebookId: row.problem.notebookId,
    notebookName: row.problem.notebook?.name || null,
    status: String(row.status),
    score: row.score,
    tags: row.problem.tags || [],
    difficulty: String(row.problem.difficulty),
    createdAt: iso(row.createdAt),
  }));
  const privateMemories = memoryRows.map((row) => ({
    id: row.id,
    title: row.title,
    text: compact(row.text, 900),
    kind: row.kind,
    source: row.source,
    notebookId: row.notebookId,
    notebookName: row.notebook?.name || null,
    updatedAt: iso(row.updatedAt),
  }));

  const weakAttempts = attempts.filter(
    (attempt) => attempt.status === 'failed' || attempt.status === 'partial',
  );
  const activeNotebooks = activeNotebookCounts([...messages, ...attempts, ...privateMemories]);

  return {
    targetType: args.target.targetType,
    targetId: args.target.targetId,
    timeScope,
    since: since ? since.toISOString() : null,
    until: new Date().toISOString(),
    summary: {
      questionCount: messages.length,
      attemptCount: attempts.length,
      attemptedProblemCount: new Set(attempts.map((attempt) => attempt.problemId)).size,
      passedCount: attempts.filter((attempt) => attempt.status === 'passed').length,
      failedCount: attempts.filter((attempt) => attempt.status === 'failed').length,
      partialCount: attempts.filter((attempt) => attempt.status === 'partial').length,
      privateMemoryCount: privateMemories.length,
      activeNotebookCount: activeNotebooks.length,
    },
    messages,
    attempts,
    privateMemories,
    weakTags: topCounts(
      weakAttempts.flatMap((attempt) => attempt.tags),
      8,
    ),
    activeNotebooks,
  };
}
