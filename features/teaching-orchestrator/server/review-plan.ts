import { randomUUID } from 'node:crypto';

import type { Prisma } from '@/lib/server/generated-prisma';
import { prisma } from '@/lib/server/prisma';
import type { NotebookProblemSummary } from '@/lib/problem-bank';
import {
  listCourseProblemsForUser,
  listNotebookProblemsForUser,
} from '@/features/problems/server/service';
import { buildLayeredMemoryRecallContext } from '@/features/memory/server/layered-memory-context';
import { createTeachingDecision } from '@/features/teaching-orchestrator/domain/evidence-ledger';
import {
  resolveFixedReviewWorkflow,
  type ReviewWorkflowId,
  type ReviewMode,
  type ReviewTargetKind,
} from '@/features/teaching-orchestrator/domain/fixed-workflows';
import type {
  TeachingDecision,
  TeachingEvidence,
  TeachingToolCallRecord,
} from '@/features/teaching-orchestrator/domain/types';

export type ReviewPlanScheduleEvent = {
  id: string;
  title: string;
  date: string;
  kind?: 'assignment' | 'exam' | 'progress' | 'tutorial' | 'holiday' | 'other';
  sourceName?: string;
  notes?: string;
};

export type ReviewPlanConstraints = {
  totalMinutes?: number;
  questionCount?: number;
  maxTasks?: number;
  today?: string;
};

export type ReviewPlanTask = {
  id: string;
  title: string;
  activity: 'review' | 'template_drill' | 'practice' | 'diagnostic';
  concepts: string[];
  minutes: number;
  reason: string;
  evidenceIds: string[];
  problemIds: string[];
};

export type ReviewQuestionCandidate = {
  problemId: string;
  title: string;
  type: string;
  difficulty: string;
  tags: string[];
  latestAttempt: NotebookProblemSummary['latestAttempt'];
  reason: string;
  evidenceIds: string[];
};

export type EvidenceBasedReviewPlanOutput = {
  targetType: 'course' | 'notebook';
  targetId: string;
  query: string;
  workflow: {
    workflowId: ReviewWorkflowId;
    targetKind: ReviewTargetKind;
    mode: ReviewMode;
    needsClarification: boolean;
    clarificationQuestion?: string;
    requiredEvidence: string[];
  };
  summary: string;
  scheduleSummary: string | null;
  estimatedMinutes: number;
  tasks: ReviewPlanTask[];
  questionCandidates: ReviewQuestionCandidate[];
  rationale: string[];
  evidenceGaps: string[];
};

type ConceptScore = {
  concept: string;
  score: number;
  evidenceIds: Set<string>;
  problemIds: Set<string>;
};

type RecentAttemptRow = {
  id: string;
  problemId: string;
  status: string;
  score: number | null;
  createdAt: Date;
  resultJson: Prisma.JsonValue | null;
  problem: {
    title: string;
    tags: string[];
    difficulty: string;
    notebookId: string | null;
    notebook: { name: string } | null;
  };
};

const TEMPLATE_RE = /模板|模版|recipe|contract|invariant|ri|htdf|htdd|docstring|rubric|检查清单/i;

function compact(input: unknown, maxChars: number): string {
  const text = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDay}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function evidenceId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function normalizedScheduleQuery(query: string): string {
  return query.toLowerCase();
}

function isProgressLikeScheduleEvent(event: ReviewPlanScheduleEvent): boolean {
  return event.kind === 'progress' || event.kind === 'tutorial';
}

function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDayKey(date);
}

function isNearbyDeadlineEvent(
  event: ReviewPlanScheduleEvent,
  startDate: string,
  endDate: string,
): boolean {
  if (event.kind !== 'assignment' && event.kind !== 'exam') return false;
  return event.date >= shiftDayKey(startDate, -2) && event.date <= shiftDayKey(endDate, 7);
}

function eventsForProgressWindow(
  events: ReviewPlanScheduleEvent[],
  startDate: string,
  endDate: string,
): ReviewPlanScheduleEvent[] {
  return events.filter(
    (event) =>
      (event.date >= startDate && event.date <= endDate) ||
      isNearbyDeadlineEvent(event, startDate, endDate),
  );
}

function selectScheduleEventsForQuery(args: {
  scheduleEvents: ReviewPlanScheduleEvent[];
  today: string;
  query: string;
}): ReviewPlanScheduleEvent[] {
  const events = args.scheduleEvents
    .filter((event) => event.title.trim() && event.date.trim() && event.kind !== 'holiday')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  if (!events.length) return [];

  const query = normalizedScheduleQuery(args.query);
  const progressEvents = events.filter(isProgressLikeScheduleEvent);

  if (/前半|上半|first\s+half|first-half/.test(query) && progressEvents.length > 1) {
    const selectedProgress = progressEvents.slice(0, Math.ceil(progressEvents.length / 2));
    const startDate = selectedProgress[0].date;
    const endDate = selectedProgress[selectedProgress.length - 1].date;
    return eventsForProgressWindow(events, startDate, endDate);
  }

  if (/后半|下半|second\s+half|last\s+half/.test(query) && progressEvents.length > 1) {
    const selectedProgress = progressEvents.slice(Math.floor(progressEvents.length / 2));
    const startDate = selectedProgress[0].date;
    const endDate = selectedProgress[selectedProgress.length - 1].date;
    return eventsForProgressWindow(events, startDate, endDate);
  }

  if (/两周|2\s*周|14\s*天|two\s+weeks/.test(query)) {
    const end = new Date(`${args.today}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 14);
    const endDay = toDayKey(end);
    return events.filter((event) => event.date >= args.today && event.date <= endDay);
  }

  const upcoming = events.filter((event) => daysBetween(args.today, event.date) >= -2);
  return upcoming.length ? upcoming : events;
}

function scheduleConceptTags(event: ReviewPlanScheduleEvent): string[] {
  if (!isProgressLikeScheduleEvent(event)) return [];
  const raw = [event.title, event.notes].filter(Boolean).join('\n');
  const cleaned = raw
    .replace(/\bcontinued\b/gi, ' ')
    .replace(/\b(reading|lecture|class|topic|section|week)\b/gi, ' ')
    .replace(/^\s*(?:week\s*)?\d+(?:\.\d+)*\s*[-–—:]?\s*/gim, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const candidates = cleaned
    .split(/[;；,，、/]|(?:\s+-\s+)/)
    .map((part) =>
      compact(
        part
          .replace(/^\s*\d+(?:\.\d+)*\s*[-–—:]?\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim(),
        80,
      ),
    )
    .filter((part) => part.length >= 3 && !/^(continued|reading|lecture|class)$/i.test(part));
  return Array.from(new Set(candidates)).slice(0, 4);
}

function shouldKeepPastScheduleEventsForQuery(query: string): boolean {
  return /前半|上半|后半|下半|first\s+half|first-half|second\s+half|last\s+half|复习|review/.test(
    normalizedScheduleQuery(query),
  );
}

function problemContentExcerpt(problem: NotebookProblemSummary): string {
  const publicContent = problem.publicContent as Record<string, unknown>;
  const grading = problem.grading as Record<string, unknown>;
  return compact(
    [
      typeof publicContent.stem === 'string' ? publicContent.stem : '',
      typeof publicContent.prompt === 'string' ? publicContent.prompt : '',
      typeof publicContent.stemTemplate === 'string' ? publicContent.stemTemplate : '',
      typeof publicContent.functionSignature === 'string' ? publicContent.functionSignature : '',
      typeof grading.rubric === 'string' ? grading.rubric : '',
      typeof grading.analysis === 'string' ? grading.analysis : '',
    ]
      .filter(Boolean)
      .join('\n\n') || JSON.stringify(problem.publicContent),
    700,
  );
}

function problemAttemptStatusLabel(status: string): string {
  if (status === 'passed') return '做对';
  if (status === 'partial') return '部分正确';
  if (status === 'failed') return '做错';
  if (status === 'pending') return '待批改';
  return status;
}

function addConceptScore(
  scores: Map<string, ConceptScore>,
  concept: string,
  score: number,
  evidenceIds: string[],
  problemIds: string[] = [],
) {
  const normalized = compact(concept, 60);
  if (!normalized) return;
  const current =
    scores.get(normalized) ||
    ({
      concept: normalized,
      score: 0,
      evidenceIds: new Set<string>(),
      problemIds: new Set<string>(),
    } satisfies ConceptScore);
  current.score += score;
  for (const id of evidenceIds) current.evidenceIds.add(id);
  for (const id of problemIds) current.problemIds.add(id);
  scores.set(normalized, current);
}

function conceptScoresToList(scores: Map<string, ConceptScore>, limit: number): ConceptScore[] {
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.concept.localeCompare(b.concept))
    .slice(0, limit);
}

function scheduleEvidence(args: {
  scheduleEvents: ReviewPlanScheduleEvent[];
  today: string;
  query: string;
}): TeachingEvidence[] {
  const keepPastEvents = shouldKeepPastScheduleEventsForQuery(args.query);
  return selectScheduleEventsForQuery({
    scheduleEvents: args.scheduleEvents,
    today: args.today,
    query: args.query,
  })
    .filter((event) => event.title.trim() && event.date.trim())
    .map((event) => ({
      event,
      daysUntil: daysBetween(args.today, event.date),
    }))
    .filter(({ daysUntil }) => keepPastEvents || daysUntil >= -2)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 8)
    .map(({ event, daysUntil }) => ({
      id: evidenceId('schedule', event.id),
      sourceType: 'schedule',
      sourceId: event.id,
      title: event.title,
      excerpt: compact(
        `${event.date}${event.kind ? ` · ${event.kind}` : ''}${event.sourceName ? ` · ${event.sourceName}` : ''}${event.notes ? `\n${event.notes}` : ''}`,
        500,
      ),
      reason:
        daysUntil <= 0
          ? `这个日程已经到期或正在发生，会提高相关复习优先级。`
          : `这个日程还有 ${daysUntil} 天，会影响复习节奏和优先级。`,
      confidence: 0.95,
      occurredAt: event.date,
      conceptTags: scheduleConceptTags(event),
      metadata: {
        kind: event.kind || 'other',
        daysUntil,
        sourceName: event.sourceName,
      },
    }));
}

function memoryEvidenceFromContext(
  context: Awaited<ReturnType<typeof buildLayeredMemoryRecallContext>>,
): TeachingEvidence[] {
  const facts: TeachingEvidence[] = context.staticFacts.slice(0, 8).map((fact) => ({
    id: evidenceId('fact', fact.id),
    sourceType: 'control_fact',
    sourceId: fact.id,
    title: `${fact.namespace}.${fact.key}`,
    excerpt: compact(JSON.stringify(fact.valueJson), 700),
    reason: '这是结构化当前事实，应优先于模糊记忆用于复习约束。',
    confidence: fact.confidence ?? undefined,
    target: { type: fact.scopeType, id: fact.scopeId || fact.ownerId },
  }));

  const memories = [
    ...context.directMemories,
    ...context.semanticMatches,
    ...(context.learnerAnalytics?.privateMemories || []),
  ].slice(0, 14);

  const memoryItems: TeachingEvidence[] = memories.map((memory) => {
    const title = memory.title || '学习记忆';
    const text = 'text' in memory ? memory.text : '';
    const sourceType = TEMPLATE_RE.test(`${title}\n${text}`) ? 'template' : 'memory';
    return {
      id: evidenceId(sourceType, memory.id),
      sourceType,
      sourceId: memory.id,
      title,
      excerpt: compact(text, 900),
      reason:
        sourceType === 'template'
          ? '这条记忆像课程模板/答题合约，会约束复习题型和讲解方式。'
          : '这条记忆提供了学习状态、薄弱点或课程约束。',
      confidence: 0.78,
      conceptTags: [],
    };
  });

  const sourceItems: TeachingEvidence[] = context.sourceEvidence.slice(0, 5).map((source) => ({
    id: evidenceId('source', source.id),
    sourceType: source.sourceType === 'problem' ? 'problem_bank' : 'course_material',
    sourceId: source.id,
    title: source.title,
    excerpt: compact(source.renderedText || source.originalText, 900),
    reason: '这是检索到的原始课程/题库证据，可用于解释复习目标。',
    confidence: source.score,
    conceptTags: [],
    metadata: source.metadata,
  }));

  return [...facts, ...memoryItems, ...sourceItems];
}

function problemBankEvidence(problems: NotebookProblemSummary[]): TeachingEvidence[] {
  return problems
    .filter((problem) => problem.status !== 'archived')
    .slice(0, 18)
    .map((problem) => ({
      id: evidenceId('problem', problem.id),
      sourceType: 'problem_bank',
      sourceId: problem.id,
      title: problem.title,
      excerpt: problemContentExcerpt(problem),
      reason: problem.latestAttempt
        ? `题库题目，最近一次状态是「${problemAttemptStatusLabel(problem.latestAttempt.status)}」。`
        : '题库题目，尚未看到最近作答记录，可作为诊断或练习候选。',
      confidence: problem.status === 'published' ? 0.9 : 0.65,
      target: { type: 'problem', id: problem.id },
      conceptTags: problem.tags,
      metadata: {
        difficulty: problem.difficulty,
        type: problem.type,
        status: problem.status,
        latestAttempt: problem.latestAttempt,
      },
    }));
}

async function recentAttemptEvidence(args: {
  userId: string;
  targetType: 'course' | 'notebook';
  targetId: string;
  courseId?: string | null;
}): Promise<TeachingEvidence[]> {
  const problemWhere =
    args.targetType === 'notebook'
      ? { notebookId: args.targetId }
      : {
          OR: [{ courseId: args.targetId }, { notebook: { courseId: args.targetId } }],
        };
  const rows = (await prisma.notebookProblemAttempt.findMany({
    where: {
      userId: args.userId,
      problem: {
        status: { not: 'archived' },
        ...problemWhere,
      },
    },
    select: {
      id: true,
      problemId: true,
      status: true,
      score: true,
      resultJson: true,
      createdAt: true,
      problem: {
        select: {
          title: true,
          tags: true,
          difficulty: true,
          notebookId: true,
          notebook: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 20,
  })) as RecentAttemptRow[];

  return rows.map((row) => {
    const feedback =
      row.resultJson && typeof row.resultJson === 'object' && 'feedback' in row.resultJson
        ? String(row.resultJson.feedback || '')
        : '';
    return {
      id: evidenceId('attempt', row.id),
      sourceType: 'problem_attempt',
      sourceId: row.id,
      title: row.problem.title,
      excerpt: compact(
        [
          `状态：${problemAttemptStatusLabel(row.status)}`,
          row.score == null ? '' : `得分：${row.score}`,
          feedback,
        ]
          .filter(Boolean)
          .join('\n'),
        700,
      ),
      reason:
        row.status === 'passed'
          ? '这是最近做对的题，可用于确认已掌握内容。'
          : '这是最近错题或部分正确题，应提高相关知识点复习优先级。',
      confidence: row.status === 'passed' ? 0.72 : 0.95,
      target: { type: 'problem', id: row.problemId },
      occurredAt: row.createdAt.toISOString(),
      conceptTags: row.problem.tags,
      metadata: {
        status: row.status,
        score: row.score,
        difficulty: row.problem.difficulty,
        notebookId: row.problem.notebookId,
        notebookName: row.problem.notebook?.name,
      },
    } satisfies TeachingEvidence;
  });
}

function scoreConcepts(args: {
  evidence: TeachingEvidence[];
  problems: NotebookProblemSummary[];
  query: string;
}): ConceptScore[] {
  const scores = new Map<string, ConceptScore>();
  const queryText = args.query.toLowerCase();

  for (const item of args.evidence) {
    const base =
      item.sourceType === 'problem_attempt'
        ? item.metadata?.status === 'passed'
          ? 1
          : 6
        : item.sourceType === 'schedule'
          ? 3
          : item.sourceType === 'template'
            ? 4
            : item.sourceType === 'memory' || item.sourceType === 'control_fact'
              ? 4
              : 2;
    for (const tag of item.conceptTags || []) {
      addConceptScore(
        scores,
        tag,
        base,
        [item.id],
        item.target?.type === 'problem' ? [item.target.id] : [],
      );
    }
  }

  for (const problem of args.problems) {
    const attempt = problem.latestAttempt;
    const base = !attempt ? 1.5 : attempt.status === 'passed' ? 0.5 : 4.5;
    for (const tag of problem.tags) {
      const queryBoost = queryText.includes(tag.toLowerCase()) ? 2 : 0;
      addConceptScore(
        scores,
        tag,
        base + queryBoost,
        [evidenceId('problem', problem.id)],
        [problem.id],
      );
    }
  }

  if (scores.size === 0) {
    addConceptScore(scores, '诊断复习', 1, [], []);
  }

  return conceptScoresToList(scores, 6);
}

function selectQuestions(args: {
  concepts: ConceptScore[];
  problems: NotebookProblemSummary[];
  questionCount: number;
}): ReviewQuestionCandidate[] {
  const selected = new Map<string, ReviewQuestionCandidate>();
  const conceptSet = new Set(args.concepts.map((item) => item.concept));
  const ranked = [...args.problems]
    .filter((problem) => problem.status !== 'archived')
    .map((problem) => {
      const overlap = problem.tags.filter((tag) => conceptSet.has(tag));
      const attempt = problem.latestAttempt;
      const attemptScore = !attempt ? 2 : attempt.status === 'passed' ? 0 : 5;
      return {
        problem,
        overlap,
        rank:
          overlap.length * 8 +
          attemptScore +
          (problem.status === 'published' ? 2 : 0) +
          (problem.difficulty === 'medium' ? 1 : 0),
      };
    })
    .sort((a, b) => b.rank - a.rank || a.problem.title.localeCompare(b.problem.title));

  for (const item of ranked) {
    if (selected.size >= args.questionCount) break;
    if (item.rank <= 0 && selected.size > 0) continue;
    const evidenceIds = [
      evidenceId('problem', item.problem.id),
      ...args.concepts
        .filter((concept) => item.problem.tags.includes(concept.concept))
        .flatMap((concept) => [...concept.evidenceIds]),
    ];
    selected.set(item.problem.id, {
      problemId: item.problem.id,
      title: item.problem.title,
      type: item.problem.type,
      difficulty: item.problem.difficulty,
      tags: item.problem.tags,
      latestAttempt: item.problem.latestAttempt ?? null,
      reason: item.problem.latestAttempt
        ? `覆盖 ${item.overlap.join('、') || '当前目标'}，最近一次${problemAttemptStatusLabel(
            item.problem.latestAttempt.status,
          )}，适合作为复习校准。`
        : `覆盖 ${item.overlap.join('、') || '当前目标'}，尚未作答，适合作为诊断题。`,
      evidenceIds: Array.from(new Set(evidenceIds)),
    });
  }

  return [...selected.values()];
}

function buildTasks(args: {
  concepts: ConceptScore[];
  questions: ReviewQuestionCandidate[];
  totalMinutes: number;
  maxTasks: number;
  hasTemplateEvidence: boolean;
}): ReviewPlanTask[] {
  const taskCount = Math.max(1, Math.min(args.maxTasks, Math.max(2, args.concepts.length)));
  const baseMinutes = Math.max(8, Math.floor(args.totalMinutes / taskCount));
  const tasks: ReviewPlanTask[] = [];
  for (const concept of args.concepts.slice(0, taskCount)) {
    const relatedQuestions = args.questions
      .filter((question) => question.tags.includes(concept.concept))
      .slice(0, 3);
    const activity: ReviewPlanTask['activity'] = relatedQuestions.some(
      (question) => question.latestAttempt?.status !== 'passed',
    )
      ? 'practice'
      : args.hasTemplateEvidence
        ? 'template_drill'
        : 'review';
    tasks.push({
      id: `task-${tasks.length + 1}`,
      title:
        activity === 'practice'
          ? `重做并讲清楚：${concept.concept}`
          : activity === 'template_drill'
            ? `按课程模板复盘：${concept.concept}`
            : `复习核心概念：${concept.concept}`,
      activity,
      concepts: [concept.concept],
      minutes: baseMinutes,
      reason:
        activity === 'practice'
          ? '这个目标同时被错题/题库证据命中，优先用题目校准。'
          : activity === 'template_drill'
            ? '这个目标有模板证据，先按课程要求复盘答题形状。'
            : '这个目标来自学习状态或题库标签，适合先补概念。',
      evidenceIds: [...concept.evidenceIds],
      problemIds: relatedQuestions.map((question) => question.problemId),
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      id: 'task-1',
      title: '先做一次诊断复习',
      activity: 'diagnostic',
      concepts: ['诊断复习'],
      minutes: args.totalMinutes,
      reason: '缺少可排序的知识点证据，先用诊断题建立学习状态。',
      evidenceIds: [],
      problemIds: args.questions.slice(0, 3).map((question) => question.problemId),
    });
  }

  return tasks;
}

function scheduleSummary(evidence: TeachingEvidence[]): string | null {
  const first = evidence.find((item) => item.sourceType === 'schedule');
  if (!first) return null;
  const daysUntil = Number(first.metadata?.daysUntil);
  if (Number.isFinite(daysUntil)) {
    return daysUntil <= 0
      ? `优先考虑「${first.title}」，它已经到期或正在发生。`
      : `优先考虑「${first.title}」，距离现在约 ${daysUntil} 天。`;
  }
  return `优先考虑「${first.title}」。`;
}

function rationaleLines(args: {
  schedule: string | null;
  concepts: ConceptScore[];
  questions: ReviewQuestionCandidate[];
  evidence: TeachingEvidence[];
}): string[] {
  const lines: string[] = [];
  if (args.schedule) lines.push(args.schedule);
  const attemptCount = args.evidence.filter((item) => item.sourceType === 'problem_attempt').length;
  const memoryCount = args.evidence.filter(
    (item) => item.sourceType === 'memory' || item.sourceType === 'control_fact',
  ).length;
  const templateCount = args.evidence.filter((item) => item.sourceType === 'template').length;
  const topConcepts = args.concepts.slice(0, 3).map((item) => item.concept);
  if (topConcepts.length) {
    lines.push(
      `复习目标优先放在 ${topConcepts.join('、')}，因为这些标签被 syllabus、记忆、错题或题库命中。`,
    );
  }
  if (attemptCount > 0) lines.push(`我参考了 ${attemptCount} 条最近作答/错题证据来排序薄弱点。`);
  if (memoryCount > 0) lines.push(`我参考了 ${memoryCount} 条学习记忆或结构化事实来判断当前状态。`);
  if (templateCount > 0)
    lines.push(`我参考了 ${templateCount} 条模板/答题合约，避免复习计划偏离课程要求。`);
  if (args.questions.length > 0) {
    lines.push(`题目候选来自真实题库，共选择 ${args.questions.length} 道作为复习入口。`);
  }
  return lines;
}

export async function generateEvidenceBasedReviewPlan(args: {
  userId: string;
  targetType: 'course' | 'notebook';
  targetId: string;
  query: string;
  conversationId?: string | null;
  scheduleEvents?: ReviewPlanScheduleEvent[];
  constraints?: ReviewPlanConstraints;
}): Promise<TeachingDecision<EvidenceBasedReviewPlanOutput>> {
  const today = args.constraints?.today || toDayKey(new Date());
  const totalMinutes = Math.max(15, Math.min(args.constraints?.totalMinutes || 45, 240));
  const questionCount = Math.max(1, Math.min(args.constraints?.questionCount || 5, 20));
  const maxTasks = Math.max(1, Math.min(args.constraints?.maxTasks || 4, 8));
  const query = args.query.trim() || '帮我制定今天的复习计划';
  const workflow = resolveFixedReviewWorkflow({ query });

  const [memoryContext, problems, attemptEvidenceItems] = await Promise.all([
    buildLayeredMemoryRecallContext({
      targetType: args.targetType,
      targetId: args.targetId,
      userId: args.userId,
      question: query,
      conversationId: args.conversationId,
    }),
    args.targetType === 'course'
      ? listCourseProblemsForUser(args.userId, args.targetId)
      : listNotebookProblemsForUser(args.userId, args.targetId),
    recentAttemptEvidence({
      userId: args.userId,
      targetType: args.targetType,
      targetId: args.targetId,
    }),
  ]);

  const scheduleItems = scheduleEvidence({
    scheduleEvents: args.scheduleEvents || [],
    today,
    query,
  });
  const memoryItems = memoryEvidenceFromContext(memoryContext);
  const problemItems = problemBankEvidence(problems);
  const evidence = [...scheduleItems, ...attemptEvidenceItems, ...memoryItems, ...problemItems];

  const concepts = scoreConcepts({ evidence, problems, query });
  const questions = selectQuestions({ concepts, problems, questionCount });
  const hasTemplateEvidence = evidence.some((item) => item.sourceType === 'template');
  const tasks = buildTasks({
    concepts,
    questions,
    totalMinutes,
    maxTasks,
    hasTemplateEvidence,
  });
  const scheduleLine = scheduleSummary(scheduleItems);
  const rationale = rationaleLines({
    schedule: scheduleLine,
    concepts,
    questions,
    evidence,
  });

  const output: EvidenceBasedReviewPlanOutput = {
    targetType: args.targetType,
    targetId: args.targetId,
    query,
    workflow: {
      workflowId: workflow.workflowId,
      targetKind: workflow.targetKind,
      mode: workflow.mode,
      needsClarification: workflow.needsClarification,
      clarificationQuestion: workflow.clarificationQuestion,
      requiredEvidence: workflow.requiredEvidence,
    },
    summary:
      tasks.length > 0
        ? `建议用 ${totalMinutes} 分钟完成 ${tasks.length} 个复习环节，并从 ${questions.length} 道题开始校准。`
        : '证据不足，建议先做诊断复习。',
    scheduleSummary: scheduleLine,
    estimatedMinutes: totalMinutes,
    tasks,
    questionCandidates: questions,
    rationale,
    evidenceGaps: [],
  };

  const toolCalls: TeachingToolCallRecord[] = [
    {
      toolId: 'resolve_fixed_review_workflow',
      purpose: '套用固定复习状态机，确认范围、模式和必须读取的证据',
      inputSummary: `${workflow.targetKind}/${workflow.mode}/${workflow.workflowId}`,
      outputEvidenceIds: [],
    },
    {
      toolId: 'get_schedule_context',
      purpose: '读取前端传入或记忆里的日程约束',
      inputSummary: `${args.scheduleEvents?.length || 0} schedule events`,
      outputEvidenceIds: scheduleItems.map((item) => item.id),
    },
    {
      toolId: 'search_teaching_memory',
      purpose: '读取分层记忆、模板、cache 和课程材料证据',
      inputSummary: `${args.targetType}:${args.targetId}`,
      outputEvidenceIds: memoryItems.map((item) => item.id),
    },
    {
      toolId: 'search_problem_attempts',
      purpose: '读取最近作答和错题证据',
      inputSummary: `${args.targetType}:${args.targetId}`,
      outputEvidenceIds: attemptEvidenceItems.map((item) => item.id),
    },
    {
      toolId: 'search_problem_bank',
      purpose: '读取可用于复习的题库候选',
      inputSummary: `${problems.length} problems`,
      outputEvidenceIds: problemItems.map((item) => item.id),
    },
    {
      toolId: 'generate_evidence_based_review_plan',
      purpose: '基于证据账本生成复习计划',
      inputSummary: `${concepts.length} target concepts, ${questions.length} candidate questions`,
      outputEvidenceIds: tasks.flatMap((task) => task.evidenceIds),
    },
  ];

  const decision = createTeachingDecision({
    id: randomUUID(),
    intent: 'review_plan',
    action: 'review_plan',
    targetConcepts: concepts.map((concept) => concept.concept),
    output,
    evidence,
    userFacingRationale: rationale,
    toolCalls,
  });

  decision.output.evidenceGaps = decision.evidence.gaps.map(
    (gap) => `${gap.reason} ${gap.fallback}`,
  );
  return decision;
}
