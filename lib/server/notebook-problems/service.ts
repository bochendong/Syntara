import type { Prisma } from '@/lib/server/generated-prisma';
import { prisma } from '@/lib/server/prisma';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import {
  buildLegacyProblemDraftsFromScene,
  notebookProblemDifficultySchema,
  notebookProblemGradingSchema,
  notebookProblemImportDraftSchema,
  notebookProblemPublicContentSchema,
  notebookProblemRecordSchema,
  notebookProblemStatusSchema,
  notebookProblemSummarySchema,
  notebookProblemAttemptRecordSchema,
  type NotebookProblemAttemptAnswer,
  type NotebookProblemAttemptRecord,
  type NotebookProblemAttemptResult,
  type NotebookProblemImportDraft,
  type NotebookProblemRecord,
  type NotebookProblemSummary,
  type NotebookProblemSecretJudge,
} from '@/lib/problem-bank';
import type { Scene } from '@/lib/types/stage';

const prismaDb = prisma as any;

type ProblemRow = {
  id: string;
  notebookId: string;
  title: string;
  type: string;
  status: string;
  source: string;
  order: number;
  points: number;
  tags: string[];
  difficulty: string;
  publicContentJson: unknown;
  gradingJson: unknown;
  sourceMeta: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ProblemAttemptRow = {
  id: string;
  problemId: string;
  userId: string;
  kind: string;
  status: string;
  score: number | null;
  answerJson: unknown;
  resultJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ProblemWithSecretRow = ProblemRow & {
  secret: {
    secretJudgeJson: unknown;
  } | null;
};

function mapProblemRow(
  row: ProblemRow,
  latestAttempt?: ProblemAttemptRow | null,
): NotebookProblemSummary {
  return notebookProblemSummarySchema.parse({
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    type: row.type,
    status: row.status,
    source: row.source,
    order: row.order,
    points: row.points,
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    publicContent: row.publicContentJson,
    grading: row.gradingJson,
    sourceMeta: row.sourceMeta ?? {},
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          status: latestAttempt.status,
          score: latestAttempt.score,
          createdAt: latestAttempt.createdAt.getTime(),
        }
      : null,
  });
}

function mapAttemptRow(row: ProblemAttemptRow): NotebookProblemAttemptRecord {
  return notebookProblemAttemptRecordSchema.parse({
    id: row.id,
    problemId: row.problemId,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    score: row.score,
    answer: row.answerJson,
    result: row.resultJson ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}

function mapSceneRowToScene(row: {
  id: string;
  notebookId: string;
  title: string;
  type: string;
  order: number;
  content: unknown;
  actions: unknown;
  whiteboard: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Scene {
  return {
    id: row.id,
    stageId: row.notebookId,
    title: row.title,
    type: row.type as Scene['type'],
    order: row.order,
    content: row.content as Scene['content'],
    actions: (row.actions ?? undefined) as Scene['actions'],
    whiteboards: (row.whiteboard ?? undefined) as Scene['whiteboards'],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

async function requireNotebookOwnership(userId: string, notebookId: string) {
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { id: true, name: true },
  });
  if (!notebook) {
    throw new Error('Notebook not found');
  }
  return notebook;
}

function normalizeDraftForPersistence(
  draftInput: NotebookProblemImportDraft,
  order: number,
): NotebookProblemImportDraft {
  const draft = notebookProblemImportDraftSchema.parse(draftInput);
  const isCode = draft.type === 'code';
  const hasSecretTests = (draft.secretJudge?.secretTests?.length ?? 0) > 0;
  const hasFunctionSignature =
    draft.publicContent.type === 'code'
      ? Boolean(draft.publicContent.functionSignature?.trim())
      : true;
  const hasPublicTests =
    draft.publicContent.type === 'code' ? (draft.publicContent.publicTests?.length ?? 0) > 0 : true;
  const publishRequirementsMet =
    !isCode || (hasSecretTests && hasFunctionSignature && hasPublicTests);

  return {
    ...draft,
    status:
      draft.status === 'archived' ? 'archived' : publishRequirementsMet ? draft.status : 'draft',
    publicContent:
      isCode && draft.publicContent.type === 'code'
        ? {
            ...draft.publicContent,
            secretConfigPresent: hasSecretTests,
          }
        : draft.publicContent,
    grading:
      isCode && draft.grading.type === 'code'
        ? {
            ...draft.grading,
            publishRequirementsMet,
          }
        : draft.grading,
    sourceMeta: {
      ...draft.sourceMeta,
      normalizedOrder: order,
    },
    validationErrors: [
      ...draft.validationErrors,
      ...(isCode && !hasFunctionSignature ? ['缺少 function signature'] : []),
      ...(isCode && !hasPublicTests ? ['缺少 public tests'] : []),
      ...(isCode && !hasSecretTests ? ['缺少 secret tests'] : []),
    ],
  };
}

async function createProblemFromDraftTx(args: {
  tx: Prisma.TransactionClient;
  notebookId: string;
  draft: NotebookProblemImportDraft;
  order: number;
}) {
  const normalized = normalizeDraftForPersistence(args.draft, args.order);
  const created = await (args.tx as any).notebookProblem.create({
    data: {
      notebookId: args.notebookId,
      title: normalized.title,
      type: normalized.type,
      status: normalized.status,
      source: normalized.source,
      order: args.order,
      points: normalized.points,
      tags: normalized.tags,
      difficulty: normalized.difficulty,
      publicContentJson: toPrismaJson(normalized.publicContent),
      gradingJson: toPrismaJson(normalized.grading),
      sourceMeta: toPrismaNullableJson(normalized.sourceMeta),
    },
  });

  if (normalized.secretJudge) {
    await (args.tx as any).notebookProblemSecret.create({
      data: {
        problemId: created.id,
        secretJudgeJson: toPrismaJson(normalized.secretJudge),
      },
    });
  }

  return created;
}

export async function ensureLegacyProblemsBackfilled(
  userId: string,
  notebookId: string,
): Promise<void> {
  await requireNotebookOwnership(userId, notebookId);
  const existingCount = await prismaDb.notebookProblem.count({
    where: { notebookId },
  });
  if (existingCount > 0) return;

  const quizScenes = await prismaDb.scene.findMany({
    where: { notebookId, type: 'quiz' },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  const drafts = quizScenes.flatMap((row: any) =>
    buildLegacyProblemDraftsFromScene(mapSceneRowToScene(row)),
  );
  if (drafts.length === 0) return;

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let index = 0; index < drafts.length; index += 1) {
      await createProblemFromDraftTx({
        tx,
        notebookId,
        draft: drafts[index],
        order: index,
      });
    }
  });
}

export async function listNotebookProblemsForUser(
  userId: string,
  notebookId: string,
): Promise<NotebookProblemSummary[]> {
  await ensureLegacyProblemsBackfilled(userId, notebookId);

  const problems = (await prismaDb.notebookProblem.findMany({
    where: { notebookId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as ProblemRow[];

  const attempts = (await prismaDb.notebookProblemAttempt.findMany({
    where: {
      userId,
      problemId: { in: problems.map((problem) => problem.id) },
    },
    orderBy: [{ createdAt: 'desc' }],
  })) as unknown as ProblemAttemptRow[];

  const latestByProblemId = new Map<string, ProblemAttemptRow>();
  for (const attempt of attempts) {
    if (!latestByProblemId.has(attempt.problemId)) {
      latestByProblemId.set(attempt.problemId, attempt);
    }
  }

  return problems.map((problem) =>
    mapProblemRow(problem, latestByProblemId.get(problem.id) ?? null),
  );
}

export async function getNotebookProblemForUser(
  userId: string,
  notebookId: string,
  problemId: string,
): Promise<{
  problem: NotebookProblemRecord;
  secretJudge?: NotebookProblemSecretJudge;
}> {
  await ensureLegacyProblemsBackfilled(userId, notebookId);
  const row = (await prismaDb.notebookProblem.findFirst({
    where: { id: problemId, notebookId },
    include: {
      secret: true,
    },
  })) as unknown as ProblemWithSecretRow | null;

  if (!row) {
    throw new Error('Problem not found');
  }

  return {
    problem: notebookProblemRecordSchema.parse({
      id: row.id,
      notebookId: row.notebookId,
      title: row.title,
      type: row.type,
      status: row.status,
      source: row.source,
      order: row.order,
      points: row.points,
      tags: row.tags ?? [],
      difficulty: row.difficulty,
      publicContent: row.publicContentJson,
      grading: row.gradingJson,
      sourceMeta: row.sourceMeta ?? {},
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }),
    secretJudge: row.secret?.secretJudgeJson as NotebookProblemSecretJudge | undefined,
  };
}

export async function createNotebookProblemsFromDrafts(args: {
  userId: string;
  notebookId: string;
  drafts: NotebookProblemImportDraft[];
}): Promise<NotebookProblemSummary[]> {
  await requireNotebookOwnership(args.userId, args.notebookId);
  await ensureLegacyProblemsBackfilled(args.userId, args.notebookId);

  const count = await prismaDb.notebookProblem.count({
    where: { notebookId: args.notebookId },
  });

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let index = 0; index < args.drafts.length; index += 1) {
      await createProblemFromDraftTx({
        tx,
        notebookId: args.notebookId,
        draft: args.drafts[index],
        order: count + index,
      });
    }
    await tx.notebook.update({
      where: { id: args.notebookId },
      data: { updatedAt: new Date() },
    });
  });

  return listNotebookProblemsForUser(args.userId, args.notebookId);
}

export async function updateNotebookProblem(args: {
  userId: string;
  notebookId: string;
  problemId: string;
  patch: {
    title?: string;
    status?: string;
    points?: number;
    order?: number;
    tags?: string[];
    difficulty?: string;
    publicContent?: unknown;
    grading?: unknown;
    secretJudge?: unknown | null;
  };
}): Promise<NotebookProblemRecord> {
  await requireNotebookOwnership(args.userId, args.notebookId);
  const current = await getNotebookProblemForUser(args.userId, args.notebookId, args.problemId);

  const publicContent = args.patch.publicContent
    ? notebookProblemPublicContentSchema.parse(args.patch.publicContent)
    : current.problem.publicContent;
  const grading = args.patch.grading
    ? notebookProblemGradingSchema.parse(args.patch.grading)
    : current.problem.grading;
  const status = args.patch.status
    ? notebookProblemStatusSchema.parse(args.patch.status)
    : current.problem.status;
  const difficulty = args.patch.difficulty
    ? notebookProblemDifficultySchema.parse(args.patch.difficulty)
    : current.problem.difficulty;

  const effectiveSecretJudge =
    args.patch.secretJudge === null
      ? undefined
      : args.patch.secretJudge
        ? (args.patch.secretJudge as NotebookProblemSecretJudge)
        : current.secretJudge;

  const normalizedDraft = normalizeDraftForPersistence(
    notebookProblemImportDraftSchema.parse({
      draftId: current.problem.id,
      title: args.patch.title ?? current.problem.title,
      type: current.problem.type,
      status,
      source: current.problem.source,
      points: args.patch.points ?? current.problem.points,
      tags: args.patch.tags ?? current.problem.tags,
      difficulty,
      publicContent,
      grading,
      secretJudge: effectiveSecretJudge,
      sourceMeta: current.problem.sourceMeta,
      validationErrors: [],
    }),
    args.patch.order ?? current.problem.order,
  );

  const updated = (await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await (tx as any).notebookProblem.update({
      where: { id: args.problemId },
      data: {
        title: normalizedDraft.title,
        status: normalizedDraft.status,
        order: args.patch.order ?? current.problem.order,
        points: normalizedDraft.points,
        tags: normalizedDraft.tags,
        difficulty: normalizedDraft.difficulty,
        publicContentJson: toPrismaJson(normalizedDraft.publicContent),
        gradingJson: toPrismaJson(normalizedDraft.grading),
        sourceMeta: toPrismaNullableJson(normalizedDraft.sourceMeta),
      },
    });

    if (args.patch.secretJudge === null) {
      await (tx as any).notebookProblemSecret.deleteMany({ where: { problemId: args.problemId } });
    } else if (normalizedDraft.secretJudge) {
      await (tx as any).notebookProblemSecret.upsert({
        where: { problemId: args.problemId },
        create: {
          problemId: args.problemId,
          secretJudgeJson: toPrismaJson(normalizedDraft.secretJudge),
        },
        update: {
          secretJudgeJson: toPrismaJson(normalizedDraft.secretJudge),
        },
      });
    }

    return row;
  })) as unknown as ProblemRow;

  return notebookProblemRecordSchema.parse({
    id: updated.id,
    notebookId: updated.notebookId,
    title: updated.title,
    type: updated.type,
    status: updated.status,
    source: updated.source,
    order: updated.order,
    points: updated.points,
    tags: updated.tags ?? [],
    difficulty: updated.difficulty,
    publicContent: updated.publicContentJson,
    grading: updated.gradingJson,
    sourceMeta: updated.sourceMeta ?? {},
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  });
}

export async function createNotebookProblemAttempt(args: {
  userId: string;
  problemId: string;
  kind: 'run' | 'submit' | 'answer';
  status: 'pending' | 'passed' | 'failed' | 'partial' | 'error';
  score?: number | null;
  answer: NotebookProblemAttemptAnswer;
  result?: NotebookProblemAttemptResult;
}): Promise<NotebookProblemAttemptRecord> {
  const created = (await prismaDb.notebookProblemAttempt.create({
    data: {
      userId: args.userId,
      problemId: args.problemId,
      kind: args.kind,
      status: args.status,
      score: args.score ?? null,
      answerJson: toPrismaJson(args.answer),
      resultJson: args.result ? toPrismaJson(args.result) : undefined,
    },
  })) as unknown as ProblemAttemptRow;

  return mapAttemptRow(created);
}

export async function listNotebookProblemAttempts(args: {
  userId: string;
  notebookId: string;
  problemId: string;
}): Promise<NotebookProblemAttemptRecord[]> {
  await getNotebookProblemForUser(args.userId, args.notebookId, args.problemId);
  const rows = (await prismaDb.notebookProblemAttempt.findMany({
    where: {
      userId: args.userId,
      problemId: args.problemId,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })) as unknown as ProblemAttemptRow[];
  return rows.map(mapAttemptRow);
}
