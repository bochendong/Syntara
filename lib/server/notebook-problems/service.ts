import { Prisma } from '@/lib/server/generated-prisma';
import { normalizeProblemConceptTags } from '@/lib/problem-bank/concept-tags.mjs';
import { prisma } from '@/lib/server/prisma';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import {
  buildLegacyProblemDraftsFromScene,
  notebookProblemAttemptRecordSchema,
  notebookProblemDifficultySchema,
  notebookProblemGradingSchema,
  notebookProblemImportDraftSchema,
  notebookProblemPublicContentSchema,
  notebookProblemRecordSchema,
  notebookProblemStatusSchema,
  notebookProblemSummarySchema,
  type NotebookProblemAttemptAnswer,
  type NotebookProblemAttemptRecord,
  type NotebookProblemAttemptResult,
  type NotebookProblemImportDraft,
  type NotebookProblemRecord,
  type NotebookProblemSecretJudge,
  type NotebookProblemSummary,
} from '@/lib/problem-bank';
import type { Scene } from '@/lib/types/stage';
import {
  findCourseAccessRole,
  type CourseAccessRole,
} from '@/lib/server/repositories/course-enrollment-repository';
import { refreshCourseSummaryFields } from '@/lib/server/repositories/notebook-repository';

const prismaDb = prisma;

type OwnedNotebook = {
  id: string;
  name: string;
  courseId: string | null;
};

type OwnedCourse = {
  id: string;
  name: string;
};

type ReadableNotebook = OwnedNotebook & {
  accessRole: CourseAccessRole;
};

type ProblemRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  title: string;
  type: string;
  status: string;
  source: string;
  order: number;
  problemNumber: number | null;
  points: number;
  tags: string[];
  difficulty: string;
  publicContentJson: unknown;
  gradingJson: unknown;
  sourceMeta: unknown;
  createdAt: Date;
  updatedAt: Date;
  notebook?: {
    id: string;
    name: string;
    courseId: string | null;
  } | null;
  secret?: {
    secretJudgeJson: unknown;
  } | null;
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

type ProblemAttemptSummaryRow = {
  id: string;
  problemId: string;
  status: string;
  score: number | null;
  createdAt: Date;
};

type ProblemProgressSummaryRow = {
  problemId: string;
  status: string;
  score: number | null;
  lastAttemptAt: Date | null;
  latestAttempt: {
    id: string;
    createdAt: Date;
  } | null;
};

type ProblemWithSecretRow = ProblemRow & {
  secret: {
    secretJudgeJson: unknown;
  } | null;
};

type NotebookProblemSummaryForUser = NotebookProblemSummary & {
  secretJudge?: NotebookProblemSecretJudge;
};

type NotebookProblemRecordForOwner = NotebookProblemRecord & {
  secretJudge?: NotebookProblemSecretJudge;
};

type ProblemCourseSummaryRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  title: string;
  type: string;
  status: string;
  tags: string[];
  difficulty: string;
  notebook?: {
    id: string;
    name: string;
    courseId: string | null;
  } | null;
};

type PreparedPublishProblemWrite = {
  id: string;
  status: NotebookProblemImportDraft['status'];
  tags: string[];
  publicContentJson: ReturnType<typeof toPrismaJson>;
  gradingJson: ReturnType<typeof toPrismaJson>;
  sourceMeta: ReturnType<typeof toPrismaNullableJson>;
  secretJudgeJson?: ReturnType<typeof toPrismaJson>;
};

export type PublishProblemBankResult = {
  totalCount: number;
  publishedCount: number;
  skippedCount: number;
};

export type CourseProblemListSummary = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  notebookName?: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  difficulty: string;
  latestAttempt: {
    id: string;
    status: string;
    score: number | null;
    createdAt: number;
  } | null;
};

const PUBLISH_PROBLEM_WRITE_BATCH_SIZE = 40;

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

function mapProblemRow(
  row: ProblemRow,
  latestAttempt?: ProblemAttemptRow | null,
): NotebookProblemSummaryForUser {
  const resolvedCourseId = row.courseId ?? row.notebook?.courseId ?? null;
  const problem = notebookProblemSummarySchema.parse({
    id: row.id,
    courseId: resolvedCourseId,
    notebookId: row.notebookId,
    notebookName: row.notebook?.name ?? undefined,
    title: row.title,
    type: row.type,
    status: row.status,
    source: row.source,
    order: row.order,
    problemNumber: row.problemNumber,
    points: row.points,
    tags: normalizeProblemConceptTags({
      courseId: resolvedCourseId,
      notebookId: row.notebookId,
      notebookName: row.notebook?.name,
      title: row.title,
      type: row.type,
      tags: row.tags ?? [],
      difficulty: row.difficulty,
      publicContent: row.publicContentJson,
      sourceMeta: row.sourceMeta ?? {},
    }),
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

  return row.secret?.secretJudgeJson
    ? {
        ...problem,
        secretJudge: row.secret.secretJudgeJson as NotebookProblemSecretJudge,
      }
    : problem;
}

function buildPublishDraftFromRow(row: ProblemWithSecretRow): NotebookProblemImportDraft {
  return notebookProblemImportDraftSchema.parse({
    draftId: row.id,
    notebookId: row.notebookId,
    title: row.title,
    type: row.type,
    status: 'published',
    source: row.source,
    points: row.points,
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    publicContent: row.publicContentJson,
    grading: row.gradingJson,
    secretJudge: row.secret?.secretJudgeJson as NotebookProblemSecretJudge | undefined,
    sourceMeta: row.sourceMeta ?? {},
    validationErrors: [],
  });
}

function prepareProblemRowsForPublish(rows: ProblemWithSecretRow[]): {
  result: PublishProblemBankResult;
  writes: PreparedPublishProblemWrite[];
} {
  const result: PublishProblemBankResult = {
    totalCount: rows.length,
    publishedCount: 0,
    skippedCount: 0,
  };
  const writes: PreparedPublishProblemWrite[] = [];

  for (const row of rows) {
    const normalizedDraft = normalizeDraftForPersistence(buildPublishDraftFromRow(row), row.order);
    const conceptTags = normalizeProblemConceptTags({
      courseId: row.courseId ?? row.notebook?.courseId ?? null,
      notebookId: row.notebookId,
      notebookName: row.notebook?.name,
      title: normalizedDraft.title,
      type: normalizedDraft.type,
      tags: normalizedDraft.tags,
      difficulty: normalizedDraft.difficulty,
      publicContent: normalizedDraft.publicContent,
      sourceMeta: normalizedDraft.sourceMeta,
    });
    if (normalizedDraft.status === 'published') {
      if (row.status !== 'published') result.publishedCount += 1;
    } else {
      result.skippedCount += 1;
    }

    writes.push({
      id: row.id,
      status: normalizedDraft.status,
      tags: conceptTags,
      publicContentJson: toPrismaJson(normalizedDraft.publicContent),
      gradingJson: toPrismaJson(normalizedDraft.grading),
      sourceMeta: toPrismaNullableJson(normalizedDraft.sourceMeta),
      secretJudgeJson: normalizedDraft.secretJudge
        ? toPrismaJson(normalizedDraft.secretJudge)
        : undefined,
    });
  }

  return { result, writes };
}

async function writePreparedProblemPublishBatch(writes: PreparedPublishProblemWrite[]) {
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const write of writes) {
    operations.push(
      prismaDb.notebookProblem.update({
        where: { id: write.id },
        data: {
          status: write.status,
          tags: write.tags,
          publicContentJson: write.publicContentJson,
          gradingJson: write.gradingJson,
          sourceMeta: write.sourceMeta,
        },
      }),
    );

    if (write.secretJudgeJson) {
      operations.push(
        prismaDb.notebookProblemSecret.upsert({
          where: { problemId: write.id },
          create: {
            problemId: write.id,
            secretJudgeJson: write.secretJudgeJson,
          },
          update: {
            secretJudgeJson: write.secretJudgeJson,
          },
        }),
      );
    }
  }

  if (operations.length > 0) {
    await prismaDb.$transaction(operations);
  }
}

async function publishPreparedProblemWrites(writes: PreparedPublishProblemWrite[]) {
  for (let index = 0; index < writes.length; index += PUBLISH_PROBLEM_WRITE_BATCH_SIZE) {
    await writePreparedProblemPublishBatch(
      writes.slice(index, index + PUBLISH_PROBLEM_WRITE_BATCH_SIZE),
    );
  }
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

async function requireNotebookOwnership(
  userId: string,
  notebookId: string,
): Promise<OwnedNotebook> {
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { id: true, name: true, courseId: true },
  });
  if (!notebook) {
    throw new Error('Notebook not found');
  }
  return notebook;
}

async function requireNotebookReadAccess(
  userId: string,
  notebookId: string,
): Promise<ReadableNotebook> {
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId },
    select: { id: true, name: true, courseId: true, ownerId: true },
  });
  if (!notebook) {
    throw new Error('Notebook not found');
  }
  if (notebook.ownerId === userId) {
    return {
      id: notebook.id,
      name: notebook.name,
      courseId: notebook.courseId,
      accessRole: 'owner',
    };
  }
  if (!notebook.courseId) {
    throw new Error('Notebook not found');
  }
  const courseAccessRole = await findCourseAccessRole(prisma, userId, notebook.courseId);
  if (!courseAccessRole) {
    throw new Error('Notebook not found');
  }
  return {
    id: notebook.id,
    name: notebook.name,
    courseId: notebook.courseId,
    accessRole: courseAccessRole,
  };
}

async function requireCourseOwnership(userId: string, courseId: string): Promise<OwnedCourse> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, ownerId: userId },
    select: { id: true, name: true },
  });
  if (!course) {
    throw new Error('Course not found');
  }
  return course;
}

async function requireCourseReadAccess(
  userId: string,
  courseId: string,
): Promise<CourseAccessRole> {
  const accessRole = await findCourseAccessRole(prisma, userId, courseId);
  if (!accessRole) {
    throw new Error('Course not found');
  }
  return accessRole;
}

async function listOwnedCourseNotebooks(
  userId: string,
  courseId: string,
): Promise<OwnedNotebook[]> {
  return prisma.notebook.findMany({
    where: { ownerId: userId, courseId },
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true, name: true, courseId: true },
  });
}

async function listReadableCourseNotebooks(
  userId: string,
  courseId: string,
): Promise<OwnedNotebook[]> {
  const accessRole = await requireCourseReadAccess(userId, courseId);
  return prisma.notebook.findMany({
    where: {
      courseId,
      ...(accessRole === 'owner' ? { ownerId: userId } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true, name: true, courseId: true },
  });
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
  courseId?: string | null;
  notebookId?: string | null;
  draft: NotebookProblemImportDraft;
  order: number;
  problemNumber?: number | null;
}) {
  const normalized = normalizeDraftForPersistence(args.draft, args.order);
  const conceptTags = normalizeProblemConceptTags({
    courseId: args.courseId,
    notebookId: args.notebookId,
    title: normalized.title,
    type: normalized.type,
    tags: normalized.tags,
    difficulty: normalized.difficulty,
    publicContent: normalized.publicContent,
    sourceMeta: normalized.sourceMeta,
  });
  const created = await args.tx.notebookProblem.create({
    data: {
      title: normalized.title,
      type: normalized.type,
      status: normalized.status,
      source: normalized.source,
      order: args.order,
      problemNumber: args.problemNumber ?? null,
      points: normalized.points,
      tags: conceptTags,
      difficulty: normalized.difficulty,
      publicContentJson: toPrismaJson(normalized.publicContent),
      gradingJson: toPrismaJson(normalized.grading),
      sourceMeta: toPrismaNullableJson(normalized.sourceMeta),
      courseId: args.courseId ?? null,
      notebookId: args.notebookId ?? null,
    },
  });

  if (normalized.secretJudge) {
    await args.tx.notebookProblemSecret.create({
      data: {
        problemId: created.id,
        secretJudgeJson: toPrismaJson(normalized.secretJudge),
      },
    });
  }

  return created;
}

async function refreshNotebookProblemSummaryFieldsTx(
  tx: Prisma.TransactionClient,
  notebookIds: string[],
  now: Date,
) {
  for (const notebookId of notebookIds) {
    const [problemCount, publishedProblemCount] = await Promise.all([
      tx.notebookProblem.count({ where: { notebookId } }),
      tx.notebookProblem.count({ where: { notebookId, status: 'published' } }),
    ]);
    await tx.notebook.updateMany({
      where: { id: notebookId },
      data: {
        problemCount,
        publishedProblemCount,
        updatedAt: now,
      },
    });
  }
}

async function refreshNotebookProblemSummaryFields(notebookIds: string[], now: Date) {
  for (const notebookId of notebookIds) {
    const [problemCount, publishedProblemCount] = await Promise.all([
      prismaDb.notebookProblem.count({ where: { notebookId } }),
      prismaDb.notebookProblem.count({ where: { notebookId, status: 'published' } }),
    ]);
    await prismaDb.notebook.updateMany({
      where: { id: notebookId },
      data: {
        problemCount,
        publishedProblemCount,
        updatedAt: now,
      },
    });
  }
}

async function touchOwnersAfterProblemWriteTx(args: {
  tx: Prisma.TransactionClient;
  courseId?: string | null;
  notebookIds?: Array<string | null | undefined>;
}) {
  const now = new Date();
  const notebookIds = Array.from(
    new Set((args.notebookIds ?? []).filter((value): value is string => Boolean(value))),
  );
  if (notebookIds.length > 0) {
    await refreshNotebookProblemSummaryFieldsTx(args.tx, notebookIds, now);
  }

  if (args.courseId) {
    await refreshCourseSummaryFields(args.tx, args.courseId);
  }
}

async function touchOwnersAfterProblemWrite(args: {
  courseId?: string | null;
  notebookIds?: Array<string | null | undefined>;
}) {
  const now = new Date();
  const notebookIds = Array.from(
    new Set((args.notebookIds ?? []).filter((value): value is string => Boolean(value))),
  );
  if (notebookIds.length > 0) {
    await refreshNotebookProblemSummaryFields(notebookIds, now);
  }

  if (args.courseId) {
    await refreshCourseSummaryFields(prismaDb, args.courseId);
  }
}

function normalizeAssignedNotebookId(
  rawNotebookId: string | null | undefined,
  allowedNotebookIds: Set<string>,
): string | null {
  const notebookId = rawNotebookId?.trim();
  if (!notebookId) return null;
  return allowedNotebookIds.has(notebookId) ? notebookId : null;
}

function draftWithImportBatchId(
  draft: NotebookProblemImportDraft,
  importBatchId?: string | null,
): NotebookProblemImportDraft {
  const batchId = importBatchId?.trim();
  if (!batchId) return draft;
  return {
    ...draft,
    sourceMeta: {
      ...draft.sourceMeta,
      importBatchId: batchId,
    },
  };
}

async function listLatestAttemptsForUser(
  userId: string,
  problemIds: string[],
): Promise<Map<string, ProblemAttemptRow>> {
  if (problemIds.length === 0) return new Map<string, ProblemAttemptRow>();

  const progressRows = await prismaDb.notebookProblemProgress.findMany({
    where: {
      userId,
      problemId: { in: problemIds },
    },
    select: {
      problemId: true,
      latestAttemptId: true,
    },
  });

  const latestAttemptIds = progressRows
    .map((row) => row.latestAttemptId)
    .filter((id): id is string => Boolean(id));
  const attemptsById =
    latestAttemptIds.length > 0
      ? new Map(
          (
            (await prismaDb.notebookProblemAttempt.findMany({
              where: { id: { in: latestAttemptIds } },
            })) as unknown as ProblemAttemptRow[]
          ).map((attempt) => [attempt.id, attempt] as const),
        )
      : new Map<string, ProblemAttemptRow>();

  const latestByProblemId = new Map<string, ProblemAttemptRow>();
  for (const row of progressRows) {
    const attempt = row.latestAttemptId ? attemptsById.get(row.latestAttemptId) : null;
    if (attempt) latestByProblemId.set(row.problemId, attempt);
  }

  const missingProblemIds = problemIds.filter((problemId) => !latestByProblemId.has(problemId));
  if (missingProblemIds.length === 0) return latestByProblemId;

  const attempts = (await prismaDb.notebookProblemAttempt.findMany({
    where: {
      userId,
      problemId: { in: missingProblemIds },
    },
    orderBy: [{ createdAt: 'desc' }],
  })) as unknown as ProblemAttemptRow[];

  for (const attempt of attempts) {
    if (!latestByProblemId.has(attempt.problemId)) {
      latestByProblemId.set(attempt.problemId, attempt);
    }
  }
  return latestByProblemId;
}

async function listLatestAttemptSummariesForUser(
  userId: string,
  problemIds: string[],
  options: { includeAttemptFallback?: boolean } = {},
): Promise<Map<string, ProblemAttemptSummaryRow>> {
  if (problemIds.length === 0) return new Map<string, ProblemAttemptSummaryRow>();

  const progressRows = (await prismaDb.notebookProblemProgress.findMany({
    where: {
      userId,
      problemId: { in: problemIds },
    },
    select: {
      problemId: true,
      status: true,
      score: true,
      lastAttemptAt: true,
      latestAttempt: {
        select: {
          id: true,
          createdAt: true,
        },
      },
    },
  })) as unknown as ProblemProgressSummaryRow[];

  const latestByProblemId = new Map<string, ProblemAttemptSummaryRow>();
  for (const row of progressRows) {
    if (!row.latestAttempt) continue;
    latestByProblemId.set(row.problemId, {
      id: row.latestAttempt.id,
      problemId: row.problemId,
      status: row.status,
      score: row.score,
      createdAt: row.lastAttemptAt ?? row.latestAttempt.createdAt,
    });
  }

  const missingProblemIds = problemIds.filter((problemId) => !latestByProblemId.has(problemId));
  if (missingProblemIds.length === 0 || options.includeAttemptFallback === false) {
    return latestByProblemId;
  }

  const attempts = (await prismaDb.notebookProblemAttempt.findMany({
    where: {
      userId,
      problemId: { in: missingProblemIds },
    },
    select: {
      id: true,
      problemId: true,
      status: true,
      score: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  })) as unknown as ProblemAttemptSummaryRow[];

  for (const attempt of attempts) {
    if (!latestByProblemId.has(attempt.problemId)) {
      latestByProblemId.set(attempt.problemId, attempt);
    }
  }
  return latestByProblemId;
}

function courseProblemNumberScopeWhere(
  courseId: string,
  notebookIds: string[],
): Prisma.NotebookProblemWhereInput {
  return notebookIds.length > 0
    ? {
        OR: [{ courseId }, { notebookId: { in: notebookIds } }],
      }
    : { courseId };
}

function notebookProblemNumberScopeWhere(notebookId: string): Prisma.NotebookProblemWhereInput {
  return { notebookId };
}

async function assignMissingProblemNumbersTx(
  tx: Prisma.TransactionClient,
  where: Prisma.NotebookProblemWhereInput,
): Promise<void> {
  const rows = await tx.notebookProblem.findMany({
    where,
    select: {
      id: true,
      order: true,
      problemNumber: true,
      createdAt: true,
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  const usedNumbers = new Set<number>();
  const rowsNeedingNumber: typeof rows = [];
  for (const row of rows) {
    if (
      typeof row.problemNumber === 'number' &&
      row.problemNumber > 0 &&
      !usedNumbers.has(row.problemNumber)
    ) {
      usedNumbers.add(row.problemNumber);
      continue;
    }
    rowsNeedingNumber.push(row);
  }

  let nextNumber = 1;
  const assignments: Array<{ id: string; problemNumber: number }> = [];
  for (const row of rowsNeedingNumber) {
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    assignments.push({ id: row.id, problemNumber: nextNumber });
    usedNumbers.add(nextNumber);
  }
  if (assignments.length === 0) return;

  await tx.$executeRaw`
    UPDATE "NotebookProblem" AS p
    SET "problemNumber" = v."problemNumber"
    FROM (
      VALUES ${Prisma.join(
        assignments.map(
          (assignment) => Prisma.sql`(${assignment.id}, ${assignment.problemNumber})`,
        ),
      )}
    ) AS v("id", "problemNumber")
    WHERE p."id" = v."id"
  `;
}

async function ensureProblemNumbersBackfilled(
  where: Prisma.NotebookProblemWhereInput,
): Promise<void> {
  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    await assignMissingProblemNumbersTx(tx, where);
  });
}

async function nextProblemNumberForScopeTx(
  tx: Prisma.TransactionClient,
  where: Prisma.NotebookProblemWhereInput,
): Promise<number> {
  await assignMissingProblemNumbersTx(tx, where);
  const aggregate = await tx.notebookProblem.aggregate({
    where,
    _max: { problemNumber: true },
  });
  return (aggregate._max.problemNumber ?? 0) + 1;
}

async function loadProblemsWithNotebook(args: {
  where: Prisma.NotebookProblemWhereInput;
  includeSecret?: boolean;
}): Promise<ProblemRow[]> {
  return (await prismaDb.notebookProblem.findMany({
    where: args.where,
    include: {
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
      ...(args.includeSecret ? { secret: true } : {}),
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as ProblemRow[];
}

export async function ensureLegacyProblemsBackfilled(
  userId: string,
  notebookId: string,
): Promise<void> {
  const notebook = await requireNotebookOwnership(userId, notebookId);
  const existingCount = await prismaDb.notebookProblem.count({
    where: { notebookId },
  });
  if (existingCount > 0) return;

  const quizScenes = await prismaDb.scene.findMany({
    where: { notebookId, type: 'quiz' },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  const drafts = quizScenes.flatMap((row) =>
    buildLegacyProblemDraftsFromScene(mapSceneRowToScene(row)),
  );
  if (drafts.length === 0) return;

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let index = 0; index < drafts.length; index += 1) {
      await createProblemFromDraftTx({
        tx,
        courseId: notebook.courseId,
        notebookId,
        draft: drafts[index],
        order: index,
      });
    }
  });
}

export async function ensureLegacyProblemsBackfilledForCourse(
  userId: string,
  courseId: string,
): Promise<void> {
  await requireCourseOwnership(userId, courseId);
  const notebooks = await listOwnedCourseNotebooks(userId, courseId);
  for (const notebook of notebooks) {
    await ensureLegacyProblemsBackfilled(userId, notebook.id);
  }
}

async function ensureProblemNumbersBackfilledForNotebook(
  userId: string,
  notebookId: string,
): Promise<void> {
  const notebook = await requireNotebookOwnership(userId, notebookId);
  if (notebook.courseId) {
    const notebooks = await listOwnedCourseNotebooks(userId, notebook.courseId);
    await ensureProblemNumbersBackfilled(
      courseProblemNumberScopeWhere(
        notebook.courseId,
        notebooks.map((item) => item.id),
      ),
    );
    return;
  }

  await ensureProblemNumbersBackfilled(notebookProblemNumberScopeWhere(notebookId));
}

async function ensureProblemNumbersBackfilledForCourse(
  userId: string,
  courseId: string,
): Promise<void> {
  await requireCourseOwnership(userId, courseId);
  const notebooks = await listOwnedCourseNotebooks(userId, courseId);
  await ensureProblemNumbersBackfilled(
    courseProblemNumberScopeWhere(
      courseId,
      notebooks.map((notebook) => notebook.id),
    ),
  );
}

export async function listNotebookProblemsForUser(
  userId: string,
  notebookId: string,
): Promise<NotebookProblemSummaryForUser[]> {
  const notebook = await requireNotebookReadAccess(userId, notebookId);
  if (notebook.accessRole === 'owner') {
    await ensureLegacyProblemsBackfilled(userId, notebookId);
    await ensureProblemNumbersBackfilledForNotebook(userId, notebookId);
  }
  const problems = await loadProblemsWithNotebook({
    where: { notebookId },
    includeSecret: notebook.accessRole === 'owner',
  });
  const latestByProblemId = await listLatestAttemptsForUser(
    userId,
    problems.map((problem) => problem.id),
  );
  return problems.map((problem) =>
    mapProblemRow(problem, latestByProblemId.get(problem.id) ?? null),
  );
}

export async function listCourseProblemsForUser(
  userId: string,
  courseId: string,
): Promise<NotebookProblemSummaryForUser[]> {
  const accessRole = await requireCourseReadAccess(userId, courseId);
  if (accessRole === 'owner') {
    await ensureLegacyProblemsBackfilledForCourse(userId, courseId);
    await ensureProblemNumbersBackfilledForCourse(userId, courseId);
  }
  const notebooks = await listReadableCourseNotebooks(userId, courseId);
  const notebookIds = notebooks.map((notebook) => notebook.id);

  const problems = await loadProblemsWithNotebook({
    where:
      notebookIds.length > 0
        ? {
            OR: [{ courseId }, { notebookId: { in: notebookIds } }],
          }
        : { courseId },
    includeSecret: accessRole === 'owner',
  });

  const latestByProblemId = await listLatestAttemptsForUser(
    userId,
    problems.map((problem) => problem.id),
  );
  return problems.map((problem) =>
    mapProblemRow(problem, latestByProblemId.get(problem.id) ?? null),
  );
}

export async function listCourseProblemsByIdsForUser(
  userId: string,
  courseId: string,
  problemIds: string[],
  options: { skipMaintenance?: boolean } = {},
): Promise<NotebookProblemSummaryForUser[]> {
  const uniqueProblemIds = Array.from(new Set(problemIds.filter(Boolean)));
  if (uniqueProblemIds.length === 0) return [];

  const accessRole = await requireCourseReadAccess(userId, courseId);
  if (accessRole === 'owner' && !options.skipMaintenance) {
    await ensureLegacyProblemsBackfilledForCourse(userId, courseId);
    await ensureProblemNumbersBackfilledForCourse(userId, courseId);
  }
  const problems = await loadProblemsWithNotebook({
    where: {
      id: { in: uniqueProblemIds },
      OR: [{ courseId }, { notebook: { courseId } }],
    },
    includeSecret: accessRole === 'owner',
  });
  const latestByProblemId = await listLatestAttemptsForUser(
    userId,
    problems.map((problem) => problem.id),
  );
  const byId = new Map(
    problems.map((problem) => [
      problem.id,
      mapProblemRow(problem, latestByProblemId.get(problem.id) ?? null),
    ]),
  );
  return uniqueProblemIds
    .map((problemId) => byId.get(problemId))
    .filter((problem): problem is NotebookProblemSummaryForUser => Boolean(problem));
}

export async function listCourseProblemSummariesForUser(
  userId: string,
  courseId: string,
  options: { skipMaintenance?: boolean } = {},
): Promise<CourseProblemListSummary[]> {
  const accessRole = await requireCourseReadAccess(userId, courseId);
  if (accessRole === 'owner' && !options.skipMaintenance) {
    await ensureProblemNumbersBackfilledForCourse(userId, courseId);
  }
  const notebooks = await listReadableCourseNotebooks(userId, courseId);
  const notebookIds = notebooks.map((notebook) => notebook.id);

  const problems = (await prismaDb.notebookProblem.findMany({
    where:
      notebookIds.length > 0
        ? {
            OR: [{ courseId }, { notebookId: { in: notebookIds } }],
          }
        : { courseId },
    select: {
      id: true,
      courseId: true,
      notebookId: true,
      title: true,
      type: true,
      status: true,
      tags: true,
      difficulty: true,
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as ProblemCourseSummaryRow[];

  const latestByProblemId = await listLatestAttemptSummariesForUser(
    userId,
    problems.map((problem) => problem.id),
    { includeAttemptFallback: false },
  );
  return problems.map((problem) => {
    const latestAttempt = latestByProblemId.get(problem.id) ?? null;
    return {
      id: problem.id,
      courseId: problem.courseId ?? problem.notebook?.courseId ?? null,
      notebookId: problem.notebookId,
      notebookName: problem.notebook?.name ?? undefined,
      title: problem.title,
      type: problem.type,
      status: problem.status,
      tags: normalizeProblemConceptTags({
        courseId: problem.courseId ?? problem.notebook?.courseId ?? courseId,
        notebookId: problem.notebookId,
        notebookName: problem.notebook?.name,
        title: problem.title,
        tags: problem.tags ?? [],
      }),
      difficulty: problem.difficulty,
      latestAttempt: latestAttempt
        ? {
            id: latestAttempt.id,
            status: latestAttempt.status,
            score: latestAttempt.score,
            createdAt: latestAttempt.createdAt.getTime(),
          }
        : null,
    };
  });
}

export async function publishNotebookProblemBankForUser(args: {
  userId: string;
  notebookId: string;
}): Promise<PublishProblemBankResult> {
  const notebook = await requireNotebookOwnership(args.userId, args.notebookId);
  await ensureLegacyProblemsBackfilled(args.userId, args.notebookId);
  await ensureProblemNumbersBackfilledForNotebook(args.userId, args.notebookId);

  const rows = (await prismaDb.notebookProblem.findMany({
    where: {
      notebookId: args.notebookId,
      status: { not: 'archived' },
    },
    include: {
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
      secret: true,
    },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as ProblemWithSecretRow[];

  const prepared = prepareProblemRowsForPublish(rows);
  await publishPreparedProblemWrites(prepared.writes);
  await touchOwnersAfterProblemWrite({
    courseId: notebook.courseId,
    notebookIds: [args.notebookId],
  });
  return prepared.result;
}

export async function publishCourseProblemBankForUser(args: {
  userId: string;
  courseId: string;
}): Promise<PublishProblemBankResult> {
  await requireCourseOwnership(args.userId, args.courseId);
  await ensureLegacyProblemsBackfilledForCourse(args.userId, args.courseId);
  await ensureProblemNumbersBackfilledForCourse(args.userId, args.courseId);
  const notebooks = await listOwnedCourseNotebooks(args.userId, args.courseId);
  const notebookIds = notebooks.map((notebook) => notebook.id);

  const rows = (await prismaDb.notebookProblem.findMany({
    where: {
      status: { not: 'archived' },
      OR:
        notebookIds.length > 0
          ? [{ courseId: args.courseId }, { notebookId: { in: notebookIds } }]
          : [{ courseId: args.courseId }],
    },
    include: {
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
      secret: true,
    },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as ProblemWithSecretRow[];

  const prepared = prepareProblemRowsForPublish(rows);
  await publishPreparedProblemWrites(prepared.writes);
  await touchOwnersAfterProblemWrite({
    courseId: args.courseId,
    notebookIds,
  });
  return prepared.result;
}

export async function getNotebookProblemForUser(
  userId: string,
  notebookId: string,
  problemId: string,
): Promise<{
  problem: NotebookProblemRecord;
  secretJudge?: NotebookProblemSecretJudge;
}> {
  const notebookAccess = await requireNotebookReadAccess(userId, notebookId);
  const canReadSecretJudge = notebookAccess.accessRole === 'owner';
  if (notebookAccess.accessRole === 'owner') {
    await ensureLegacyProblemsBackfilled(userId, notebookId);
    await ensureProblemNumbersBackfilledForNotebook(userId, notebookId);
  }
  const row = (await prismaDb.notebookProblem.findFirst({
    where: { id: problemId, notebookId },
    include: {
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
      secret: true,
    },
  })) as unknown as ProblemWithSecretRow | null;

  if (!row) {
    throw new Error('Problem not found');
  }

  return {
    problem: notebookProblemRecordSchema.parse({
      id: row.id,
      courseId: row.courseId ?? row.notebook?.courseId ?? null,
      notebookId: row.notebookId,
      notebookName: row.notebook?.name ?? undefined,
      title: row.title,
      type: row.type,
      status: row.status,
      source: row.source,
      order: row.order,
      problemNumber: row.problemNumber,
      points: row.points,
      tags: normalizeProblemConceptTags({
        courseId: row.courseId ?? row.notebook?.courseId ?? notebookAccess.courseId,
        notebookId: row.notebookId,
        notebookName: row.notebook?.name,
        title: row.title,
        type: row.type,
        tags: row.tags ?? [],
        difficulty: row.difficulty,
        publicContent: row.publicContentJson,
        sourceMeta: row.sourceMeta ?? {},
      }),
      difficulty: row.difficulty,
      publicContent: row.publicContentJson,
      grading: row.gradingJson,
      sourceMeta: row.sourceMeta ?? {},
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }),
    secretJudge: canReadSecretJudge
      ? (row.secret?.secretJudgeJson as NotebookProblemSecretJudge | undefined)
      : undefined,
  };
}

export async function getCourseProblemForUser(
  userId: string,
  courseId: string,
  problemId: string,
  options: { skipMaintenance?: boolean } = {},
): Promise<{
  problem: NotebookProblemRecord;
  secretJudge?: NotebookProblemSecretJudge;
}> {
  const accessRole = await requireCourseReadAccess(userId, courseId);
  const canReadSecretJudge = accessRole === 'owner';
  if (accessRole === 'owner' && !options.skipMaintenance) {
    await ensureLegacyProblemsBackfilledForCourse(userId, courseId);
    await ensureProblemNumbersBackfilledForCourse(userId, courseId);
  }
  const row = (await prismaDb.notebookProblem.findFirst({
    where: {
      id: problemId,
      OR: [{ courseId }, { notebook: { courseId } }],
    },
    include: {
      notebook: {
        select: {
          id: true,
          name: true,
          courseId: true,
        },
      },
      secret: true,
    },
  })) as unknown as ProblemWithSecretRow | null;

  if (!row) {
    throw new Error('Problem not found');
  }

  return {
    problem: notebookProblemRecordSchema.parse({
      id: row.id,
      courseId: row.courseId ?? row.notebook?.courseId ?? courseId,
      notebookId: row.notebookId,
      notebookName: row.notebook?.name ?? undefined,
      title: row.title,
      type: row.type,
      status: row.status,
      source: row.source,
      order: row.order,
      problemNumber: row.problemNumber,
      points: row.points,
      tags: normalizeProblemConceptTags({
        courseId: row.courseId ?? row.notebook?.courseId ?? courseId,
        notebookId: row.notebookId,
        notebookName: row.notebook?.name,
        title: row.title,
        type: row.type,
        tags: row.tags ?? [],
        difficulty: row.difficulty,
        publicContent: row.publicContentJson,
        sourceMeta: row.sourceMeta ?? {},
      }),
      difficulty: row.difficulty,
      publicContent: row.publicContentJson,
      grading: row.gradingJson,
      sourceMeta: row.sourceMeta ?? {},
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }),
    secretJudge: canReadSecretJudge
      ? (row.secret?.secretJudgeJson as NotebookProblemSecretJudge | undefined)
      : undefined,
  };
}

export async function createNotebookProblemsFromDrafts(args: {
  userId: string;
  notebookId: string;
  drafts: NotebookProblemImportDraft[];
  importBatchId?: string | null;
}): Promise<NotebookProblemSummary[]> {
  const notebook = await requireNotebookOwnership(args.userId, args.notebookId);
  await ensureLegacyProblemsBackfilled(args.userId, args.notebookId);
  const problemNumberScopeWhere = notebook.courseId
    ? courseProblemNumberScopeWhere(
        notebook.courseId,
        (await listOwnedCourseNotebooks(args.userId, notebook.courseId)).map((item) => item.id),
      )
    : notebookProblemNumberScopeWhere(args.notebookId);

  const count = await prismaDb.notebookProblem.count({
    where: { notebookId: args.notebookId },
  });

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const firstProblemNumber = await nextProblemNumberForScopeTx(tx, problemNumberScopeWhere);
    for (let index = 0; index < args.drafts.length; index += 1) {
      await createProblemFromDraftTx({
        tx,
        courseId: notebook.courseId,
        notebookId: args.notebookId,
        draft: draftWithImportBatchId(args.drafts[index], args.importBatchId),
        order: count + index,
        problemNumber: firstProblemNumber + index,
      });
    }
    await touchOwnersAfterProblemWriteTx({
      tx,
      courseId: notebook.courseId,
      notebookIds: [args.notebookId],
    });
  });

  return listNotebookProblemsForUser(args.userId, args.notebookId);
}

export async function createCourseProblemsFromDrafts(args: {
  userId: string;
  courseId: string;
  drafts: NotebookProblemImportDraft[];
  importBatchId?: string | null;
}): Promise<NotebookProblemSummary[]> {
  await requireCourseOwnership(args.userId, args.courseId);
  await ensureLegacyProblemsBackfilledForCourse(args.userId, args.courseId);

  const notebooks = await listOwnedCourseNotebooks(args.userId, args.courseId);
  const allowedNotebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const allowedNotebookIdList = Array.from(allowedNotebookIds);
  const problemNumberScopeWhere = courseProblemNumberScopeWhere(
    args.courseId,
    allowedNotebookIdList,
  );
  const count = await prismaDb.notebookProblem.count({
    where: problemNumberScopeWhere,
  });

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const firstProblemNumber = await nextProblemNumberForScopeTx(tx, problemNumberScopeWhere);
    for (let index = 0; index < args.drafts.length; index += 1) {
      const draft = args.drafts[index];
      const notebookId = normalizeAssignedNotebookId(draft.notebookId, allowedNotebookIds);
      await createProblemFromDraftTx({
        tx,
        courseId: args.courseId,
        notebookId,
        draft: draftWithImportBatchId({ ...draft, notebookId }, args.importBatchId),
        order: count + index,
        problemNumber: firstProblemNumber + index,
      });
    }
  });

  await touchOwnersAfterProblemWrite({
    courseId: args.courseId,
    notebookIds: args.drafts.map((draft) =>
      normalizeAssignedNotebookId(draft.notebookId, allowedNotebookIds),
    ),
  });

  return listCourseProblemsForUser(args.userId, args.courseId);
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
}): Promise<NotebookProblemRecordForOwner> {
  const notebook = await requireNotebookOwnership(args.userId, args.notebookId);
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
      notebookId: current.problem.notebookId ?? null,
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
  const conceptTags = normalizeProblemConceptTags({
    courseId: current.problem.courseId,
    notebookId: current.problem.notebookId,
    notebookName: current.problem.notebookName,
    title: normalizedDraft.title,
    type: normalizedDraft.type,
    tags: normalizedDraft.tags,
    difficulty: normalizedDraft.difficulty,
    publicContent: normalizedDraft.publicContent,
    sourceMeta: normalizedDraft.sourceMeta,
  });

  const updated = (await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.notebookProblem.update({
      where: { id: args.problemId },
      data: {
        title: normalizedDraft.title,
        status: normalizedDraft.status,
        order: args.patch.order ?? current.problem.order,
        points: normalizedDraft.points,
        tags: conceptTags,
        difficulty: normalizedDraft.difficulty,
        publicContentJson: toPrismaJson(normalizedDraft.publicContent),
        gradingJson: toPrismaJson(normalizedDraft.grading),
        sourceMeta: toPrismaNullableJson(normalizedDraft.sourceMeta),
      },
      include: {
        notebook: {
          select: {
            id: true,
            name: true,
            courseId: true,
          },
        },
      },
    });

    if (args.patch.secretJudge === null) {
      await tx.notebookProblemSecret.deleteMany({ where: { problemId: args.problemId } });
    } else if (normalizedDraft.secretJudge) {
      await tx.notebookProblemSecret.upsert({
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

    await touchOwnersAfterProblemWriteTx({
      tx,
      courseId: notebook.courseId,
      notebookIds: [args.notebookId],
    });
    return row;
  })) as unknown as ProblemRow;

  const problem = notebookProblemRecordSchema.parse({
    id: updated.id,
    courseId: updated.courseId ?? updated.notebook?.courseId ?? notebook.courseId,
    notebookId: updated.notebookId,
    notebookName: updated.notebook?.name ?? undefined,
    title: updated.title,
    type: updated.type,
    status: updated.status,
    source: updated.source,
    order: updated.order,
    problemNumber: updated.problemNumber,
    points: updated.points,
    tags: updated.tags ?? [],
    difficulty: updated.difficulty,
    publicContent: updated.publicContentJson,
    grading: updated.gradingJson,
    sourceMeta: updated.sourceMeta ?? {},
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  });

  return normalizedDraft.secretJudge
    ? {
        ...problem,
        secretJudge: normalizedDraft.secretJudge,
      }
    : problem;
}

export async function updateCourseProblem(args: {
  userId: string;
  courseId: string;
  problemId: string;
  patch: {
    notebookId?: string | null;
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
}): Promise<NotebookProblemRecordForOwner> {
  await requireCourseOwnership(args.userId, args.courseId);
  const notebooks = await listOwnedCourseNotebooks(args.userId, args.courseId);
  const allowedNotebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const current = await getCourseProblemForUser(args.userId, args.courseId, args.problemId);

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

  const nextNotebookId =
    args.patch.notebookId !== undefined
      ? normalizeAssignedNotebookId(args.patch.notebookId, allowedNotebookIds)
      : (current.problem.notebookId ?? null);

  const normalizedDraft = normalizeDraftForPersistence(
    notebookProblemImportDraftSchema.parse({
      draftId: current.problem.id,
      notebookId: nextNotebookId,
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
  const conceptTags = normalizeProblemConceptTags({
    courseId: args.courseId,
    notebookId: nextNotebookId,
    notebookName: current.problem.notebookName,
    title: normalizedDraft.title,
    type: normalizedDraft.type,
    tags: normalizedDraft.tags,
    difficulty: normalizedDraft.difficulty,
    publicContent: normalizedDraft.publicContent,
    sourceMeta: normalizedDraft.sourceMeta,
  });

  const updated = (await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.notebookProblem.update({
      where: { id: args.problemId },
      data: {
        title: normalizedDraft.title,
        status: normalizedDraft.status,
        order: args.patch.order ?? current.problem.order,
        points: normalizedDraft.points,
        tags: conceptTags,
        difficulty: normalizedDraft.difficulty,
        publicContentJson: toPrismaJson(normalizedDraft.publicContent),
        gradingJson: toPrismaJson(normalizedDraft.grading),
        sourceMeta: toPrismaNullableJson(normalizedDraft.sourceMeta),
        courseId: args.courseId,
        notebookId: nextNotebookId,
      },
      include: {
        notebook: {
          select: {
            id: true,
            name: true,
            courseId: true,
          },
        },
      },
    });

    if (args.patch.secretJudge === null) {
      await tx.notebookProblemSecret.deleteMany({ where: { problemId: args.problemId } });
    } else if (normalizedDraft.secretJudge) {
      await tx.notebookProblemSecret.upsert({
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

    await touchOwnersAfterProblemWriteTx({
      tx,
      courseId: args.courseId,
      notebookIds: [current.problem.notebookId, nextNotebookId],
    });
    return row;
  })) as unknown as ProblemRow;

  const problem = notebookProblemRecordSchema.parse({
    id: updated.id,
    courseId: updated.courseId ?? updated.notebook?.courseId ?? args.courseId,
    notebookId: updated.notebookId,
    notebookName: updated.notebook?.name ?? undefined,
    title: updated.title,
    type: updated.type,
    status: updated.status,
    source: updated.source,
    order: updated.order,
    problemNumber: updated.problemNumber,
    points: updated.points,
    tags: updated.tags ?? [],
    difficulty: updated.difficulty,
    publicContent: updated.publicContentJson,
    grading: updated.gradingJson,
    sourceMeta: updated.sourceMeta ?? {},
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  });

  return normalizedDraft.secretJudge
    ? {
        ...problem,
        secretJudge: normalizedDraft.secretJudge,
      }
    : problem;
}

export async function deleteNotebookProblem(args: {
  userId: string;
  notebookId: string;
  problemId: string;
}): Promise<void> {
  const notebook = await requireNotebookOwnership(args.userId, args.notebookId);
  await getNotebookProblemForUser(args.userId, args.notebookId, args.problemId);

  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.notebookProblem.delete({
      where: { id: args.problemId },
    });
    await touchOwnersAfterProblemWriteTx({
      tx,
      courseId: notebook.courseId,
      notebookIds: [args.notebookId],
    });
  });
}

export async function deleteCourseProblem(args: {
  userId: string;
  courseId: string;
  problemId: string;
}): Promise<void> {
  await requireCourseOwnership(args.userId, args.courseId);
  const current = await getCourseProblemForUser(args.userId, args.courseId, args.problemId);
  await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.notebookProblem.delete({
      where: { id: args.problemId },
    });
    await touchOwnersAfterProblemWriteTx({
      tx,
      courseId: args.courseId,
      notebookIds: [current.problem.notebookId],
    });
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
  const created = (await prismaDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const attempt = await tx.notebookProblemAttempt.create({
      data: {
        userId: args.userId,
        problemId: args.problemId,
        kind: args.kind,
        status: args.status,
        score: args.score ?? null,
        answerJson: toPrismaJson(args.answer),
        resultJson: args.result ? toPrismaJson(args.result) : undefined,
      },
    });

    await tx.notebookProblemProgress.upsert({
      where: {
        problemId_userId: {
          problemId: args.problemId,
          userId: args.userId,
        },
      },
      update: {
        latestAttemptId: attempt.id,
        status: args.status,
        score: args.score ?? null,
        lastAttemptAt: attempt.createdAt,
        attemptedCount: { increment: 1 },
        ...(args.status === 'passed' ? { passedCount: { increment: 1 } } : {}),
      },
      create: {
        problemId: args.problemId,
        userId: args.userId,
        latestAttemptId: attempt.id,
        status: args.status,
        score: args.score ?? null,
        attemptedCount: 1,
        passedCount: args.status === 'passed' ? 1 : 0,
        lastAttemptAt: attempt.createdAt,
      },
    });

    return attempt;
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
