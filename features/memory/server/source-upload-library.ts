import { Prisma, type PrismaClient } from '@/lib/server/generated-prisma';
import { refreshCourseSummaryFields } from '@/lib/server/repositories/notebook-repository';
import { ensureKnowledgeCacheTable } from '@/features/memory/server/knowledge-cache';
import { resolveApiKey } from '@/lib/server/provider-config';

export type CourseSourceUploadRecord = {
  sourceHash: string;
  title: string;
  kind: string;
  fileMime: string | null;
  usageProfile: string | null;
  topic: string | null;
  coverImagePath: string | null;
  coverStatus: string | null;
  allQuestionUpload: boolean | null;
  notebookIds: string[];
  sectionIds: string[];
  problemIds: string[];
  importBatchIds: string[];
  memoryIds: string[];
  templateMemoryIds: string[];
  knowledgeGraphFactIds: string[];
  ragEntryIds: string[];
  openaiFileIds: string[];
  textSections: Array<{
    id: string;
    notebookId: string;
    title: string;
    order: number;
    markdown: string;
  }>;
  createdAt: string;
  updatedAt: string;
  stats: {
    notebookCount: number;
    sectionCount: number;
    problemCount: number;
    importBatchCount: number;
    memoryCount: number;
    templateMemoryCount: number;
    knowledgeGraphFactCount: number;
    ragEntryCount: number;
    openaiFileCount: number;
  };
};

export type DeleteCourseSourceUploadResult = {
  source: CourseSourceUploadRecord;
  deleted: {
    notebooks: number;
    sections: number;
    problems: number;
    importBatches: number;
    memories: number;
    templateMemories: number;
    memoryFacts: number;
    memoryFactEvents: number;
    ragEntries: number;
    openaiFiles: number;
  };
};

type SourceUploadAccumulator = {
  sourceHash: string;
  title: string | null;
  kind: string | null;
  fileMime: string | null;
  usageProfile: string | null;
  topic: string | null;
  coverImagePath: string | null;
  coverStatus: string | null;
  allQuestionUpload: boolean | null;
  notebookIds: Set<string>;
  sectionIds: Set<string>;
  problemIds: Set<string>;
  importBatchIds: Set<string>;
  memoryIds: Set<string>;
  templateMemoryIds: Set<string>;
  knowledgeGraphFactIds: Set<string>;
  ragEntryIds: Set<string>;
  openaiFileIds: Set<string>;
  textSections: Array<{
    id: string;
    notebookId: string;
    title: string;
    order: number;
    markdown: string;
  }>;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

type SourceUploadCollection = {
  records: CourseSourceUploadRecord[];
  byHash: Map<string, CourseSourceUploadRecord>;
};

type RawMemoryKnowledgeCacheRow = {
  id: string;
  sourceId: string;
  sourceType: string;
  title: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const SOURCE_KEY_PREFIX = 'source:';
const SOURCE_MEMORY_SOURCES = ['source-upload-ingestion', 'source-ingestion-plan'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function dateMs(value: Date | string | number | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isoFromMs(value: number | null): string {
  return new Date(value ?? Date.now()).toISOString();
}

function addDate(acc: SourceUploadAccumulator, createdAt: Date, updatedAt: Date) {
  const created = dateMs(createdAt);
  const updated = dateMs(updatedAt);
  if (created !== null) acc.createdAtMs = Math.min(acc.createdAtMs ?? created, created);
  if (updated !== null) acc.updatedAtMs = Math.max(acc.updatedAtMs ?? updated, updated);
}

function addIfPresent(target: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed) target.add(trimmed);
}

function readSourceHashFromKey(key: string | null | undefined): string | null {
  const value = key?.trim() || '';
  return value.startsWith(SOURCE_KEY_PREFIX) ? value.slice(SOURCE_KEY_PREFIX.length) || null : null;
}

function readJsonString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return stringValue(current);
}

function readJsonBoolean(value: unknown, path: string[]): boolean | null {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return booleanValue(current);
}

function findSourceHash(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSourceHash(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const direct = stringValue(value.sourceHash) || stringValue(value.uploadSourceHash);
  if (direct) return direct;
  for (const nested of Object.values(value)) {
    const found = findSourceHash(nested);
    if (found) return found;
  }
  return null;
}

function findSourceTitle(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSourceTitle(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const title =
    stringValue(value.sourceTitle) ||
    stringValue(value.uploadSourceTitle) ||
    stringValue(value.title);
  if (title) return title;
  for (const nested of Object.values(value)) {
    const found = findSourceTitle(nested);
    if (found) return found;
  }
  return null;
}

function normalizeTitle(input: string | null): string {
  return (input || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function finalizeRecord(acc: SourceUploadAccumulator): CourseSourceUploadRecord {
  const notebookIds = Array.from(acc.notebookIds);
  const sectionIds = Array.from(acc.sectionIds);
  const problemIds = Array.from(acc.problemIds);
  const importBatchIds = Array.from(acc.importBatchIds);
  const memoryIds = Array.from(acc.memoryIds);
  const templateMemoryIds = Array.from(acc.templateMemoryIds);
  const knowledgeGraphFactIds = Array.from(acc.knowledgeGraphFactIds);
  const ragEntryIds = Array.from(acc.ragEntryIds);
  const openaiFileIds = Array.from(acc.openaiFileIds);
  const textSections = acc.textSections
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
  const createdAt = isoFromMs(acc.createdAtMs ?? acc.updatedAtMs);
  const updatedAt = isoFromMs(acc.updatedAtMs ?? acc.createdAtMs);

  return {
    sourceHash: acc.sourceHash,
    title: acc.title || `上传文件 ${acc.sourceHash.slice(0, 8)}`,
    kind: acc.kind || 'other',
    fileMime: acc.fileMime,
    usageProfile: acc.usageProfile,
    topic: acc.topic,
    coverImagePath: acc.coverImagePath,
    coverStatus: acc.coverStatus,
    allQuestionUpload: acc.allQuestionUpload,
    notebookIds,
    sectionIds,
    problemIds,
    importBatchIds,
    memoryIds,
    templateMemoryIds,
    knowledgeGraphFactIds,
    ragEntryIds,
    openaiFileIds,
    textSections,
    createdAt,
    updatedAt,
    stats: {
      notebookCount: notebookIds.length,
      sectionCount: sectionIds.length,
      problemCount: problemIds.length,
      importBatchCount: importBatchIds.length,
      memoryCount: memoryIds.length,
      templateMemoryCount: templateMemoryIds.length,
      knowledgeGraphFactCount: knowledgeGraphFactIds.length,
      ragEntryCount: ragEntryIds.length,
      openaiFileCount: openaiFileIds.length,
    },
  };
}

async function requireOwnedCourse(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
}) {
  const course = await args.prisma.course.findFirst({
    where: { id: args.courseId, ownerId: args.userId },
    select: { id: true },
  });
  if (!course) throw new Error('Course not found');
  return course;
}

function ensureSourceUpload(
  uploads: Map<string, SourceUploadAccumulator>,
  sourceHash: string,
): SourceUploadAccumulator {
  const existing = uploads.get(sourceHash);
  if (existing) return existing;
  const created: SourceUploadAccumulator = {
    sourceHash,
    title: null,
    kind: null,
    fileMime: null,
    usageProfile: null,
    topic: null,
    coverImagePath: null,
    coverStatus: null,
    allQuestionUpload: null,
    notebookIds: new Set(),
    sectionIds: new Set(),
    problemIds: new Set(),
    importBatchIds: new Set(),
    memoryIds: new Set(),
    templateMemoryIds: new Set(),
    knowledgeGraphFactIds: new Set(),
    ragEntryIds: new Set(),
    openaiFileIds: new Set(),
    textSections: [],
    createdAtMs: null,
    updatedAtMs: null,
  };
  uploads.set(sourceHash, created);
  return created;
}

async function collectCourseSourceUploads(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  includeTextSections?: boolean;
}): Promise<SourceUploadCollection> {
  await requireOwnedCourse(args);
  await ensureKnowledgeCacheTable(args.prisma);

  const uploads = new Map<string, SourceUploadAccumulator>();
  const includeTextSections = args.includeTextSections !== false;

  const sections = await args.prisma.markdownNotebookSection.findMany({
    where: {
      courseId: args.courseId,
      notebook: { ownerId: args.userId },
    },
    select: {
      id: true,
      notebookId: true,
      title: true,
      order: true,
      ...(includeTextSections ? { markdown: true } : {}),
      sourceMeta: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  for (const section of sections) {
    const meta = section.sourceMeta;
    const sourceHash = readJsonString(meta, ['sourceHash']);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.sectionIds.add(section.id);
    acc.notebookIds.add(section.notebookId);
    if (includeTextSections) {
      acc.textSections.push({
        id: section.id,
        notebookId: section.notebookId,
        title: section.title,
        order: section.order,
        markdown:
          typeof (section as { markdown?: unknown }).markdown === 'string'
            ? (section as { markdown: string }).markdown
            : '',
      });
    }
    acc.title ||= readJsonString(meta, ['sourceTitle']) || section.title;
    acc.kind ||= readJsonString(meta, ['sourceKind']);
    acc.fileMime ||= readJsonString(meta, ['sourceFileMime']);
    acc.usageProfile ||= readJsonString(meta, ['usageProfile']);
    addIfPresent(acc.openaiFileIds, readJsonString(meta, ['openaiFileId']));
    addDate(acc, section.createdAt, section.updatedAt);
  }

  const problems = await args.prisma.notebookProblem.findMany({
    where: {
      OR: [{ courseId: args.courseId }, { notebook: { courseId: args.courseId } }],
    },
    select: {
      id: true,
      notebookId: true,
      title: true,
      sourceMeta: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const importBatchIds = new Set<string>();
  for (const problem of problems) {
    const meta = problem.sourceMeta;
    const sourceHash = readJsonString(meta, ['uploadSourceHash']);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.problemIds.add(problem.id);
    addIfPresent(acc.notebookIds, problem.notebookId);
    const importBatchId = readJsonString(meta, ['importBatchId']);
    addIfPresent(acc.importBatchIds, importBatchId);
    addIfPresent(importBatchIds, importBatchId);
    acc.title ||= readJsonString(meta, ['sourceTitle']);
    addDate(acc, problem.createdAt, problem.updatedAt);
  }

  const importBatches = await args.prisma.problemImportBatch.findMany({
    where: {
      ownerId: args.userId,
      courseId: args.courseId,
    },
    select: {
      id: true,
      source: true,
      sourceFileName: true,
      sourceFileMime: true,
      draftSnapshotJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const batchById = new Map(importBatches.map((batch) => [batch.id, batch] as const));
  for (const acc of uploads.values()) {
    for (const batchId of acc.importBatchIds) {
      const batch = batchById.get(batchId);
      if (!batch) continue;
      acc.title = batch.sourceFileName || acc.title;
      acc.kind = batch.source || acc.kind;
      acc.fileMime = batch.sourceFileMime || acc.fileMime;
      addDate(acc, batch.createdAt, batch.updatedAt);
    }
  }
  for (const batch of importBatches) {
    const sourceHash = findSourceHash(batch.draftSnapshotJson);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.importBatchIds.add(batch.id);
    acc.title = batch.sourceFileName || acc.title;
    acc.kind = batch.source || acc.kind;
    acc.fileMime = batch.sourceFileMime || acc.fileMime;
    addDate(acc, batch.createdAt, batch.updatedAt);
  }

  const facts = await args.prisma.memoryFact.findMany({
    where: {
      ownerId: args.userId,
      scopeType: 'course',
      scopeId: args.courseId,
      namespace: 'knowledge_graph',
      key: { startsWith: SOURCE_KEY_PREFIX },
    },
    select: {
      id: true,
      key: true,
      valueJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  for (const fact of facts) {
    const sourceHash =
      readSourceHashFromKey(fact.key) || readJsonString(fact.valueJson, ['source', 'hash']);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.knowledgeGraphFactIds.add(fact.id);
    acc.title = readJsonString(fact.valueJson, ['source', 'title']) || acc.title;
    acc.kind = readJsonString(fact.valueJson, ['source', 'kind']) || acc.kind;
    acc.usageProfile = readJsonString(fact.valueJson, ['usageProfile']) || acc.usageProfile;
    acc.topic = readJsonString(fact.valueJson, ['topic']) || acc.topic;
    acc.coverImagePath =
      readJsonString(fact.valueJson, ['cover', 'imagePath']) || acc.coverImagePath;
    acc.coverStatus = readJsonString(fact.valueJson, ['cover', 'status']) || acc.coverStatus;
    acc.allQuestionUpload = readJsonBoolean(fact.valueJson, ['allQuestionUpload']);
    addIfPresent(acc.openaiFileIds, readJsonString(fact.valueJson, ['source', 'openaiFileId']));
    addIfPresent(acc.notebookIds, readJsonString(fact.valueJson, ['notebookId']));
    addIfPresent(acc.sectionIds, readJsonString(fact.valueJson, ['sectionId']));
    addDate(acc, fact.createdAt, fact.updatedAt);
  }

  const cacheEntries = await args.prisma.$queryRaw<RawMemoryKnowledgeCacheRow[]>(Prisma.sql`
    SELECT "id", "sourceId", "sourceType", "title", "metadata", "createdAt", "updatedAt"
    FROM "MemoryKnowledgeCache"
    WHERE "ownerId" = ${args.userId}
      AND "courseId" = ${args.courseId}
  `);
  for (const cacheEntry of cacheEntries) {
    const sourceHash =
      readJsonString(cacheEntry.metadata, ['sourceHash']) ||
      readSourceHashFromKey(cacheEntry.sourceId);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.ragEntryIds.add(cacheEntry.id);
    acc.title ||= cacheEntry.title;
    acc.kind =
      readJsonString(cacheEntry.metadata, ['sourceKind']) || acc.kind || cacheEntry.sourceType;
    acc.usageProfile = readJsonString(cacheEntry.metadata, ['usageProfile']) || acc.usageProfile;
    acc.topic = readJsonString(cacheEntry.metadata, ['topic']) || acc.topic;
    acc.coverImagePath =
      readJsonString(cacheEntry.metadata, ['coverImagePath']) || acc.coverImagePath;
    acc.coverStatus = readJsonString(cacheEntry.metadata, ['coverStatus']) || acc.coverStatus;
    addIfPresent(acc.openaiFileIds, readJsonString(cacheEntry.metadata, ['openaiFileId']));
    addIfPresent(acc.notebookIds, readJsonString(cacheEntry.metadata, ['notebookId']));
    addIfPresent(acc.sectionIds, readJsonString(cacheEntry.metadata, ['sectionId']));
    addDate(acc, cacheEntry.createdAt, cacheEntry.updatedAt);
  }

  const memories = await args.prisma.studyMemory.findMany({
    where: {
      ownerId: args.userId,
      source: { in: SOURCE_MEMORY_SOURCES },
      OR: [{ courseId: args.courseId }, { notebook: { courseId: args.courseId } }],
    },
    select: {
      id: true,
      source: true,
      kind: true,
      title: true,
      notebookId: true,
      sourceReferences: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  for (const memory of memories) {
    const sourceHash = findSourceHash(memory.sourceReferences);
    if (!sourceHash) continue;
    const acc = ensureSourceUpload(uploads, sourceHash);
    acc.memoryIds.add(memory.id);
    if (memory.kind === 'course_template') acc.templateMemoryIds.add(memory.id);
    addIfPresent(acc.notebookIds, memory.notebookId);
    acc.title ||= findSourceTitle(memory.sourceReferences) || memory.title;
    addDate(acc, memory.createdAt, memory.updatedAt);
  }

  // Backfill old source-ingestion-plan template memories that predate sourceHash tagging.
  const titleToAcc = new Map<string, SourceUploadAccumulator>();
  for (const acc of uploads.values()) {
    const key = normalizeTitle(acc.title);
    if (key) titleToAcc.set(key, acc);
  }
  for (const memory of memories) {
    if (memoryIdsContainAny(uploads, memory.id)) continue;
    if (memory.source !== 'source-ingestion-plan') continue;
    const sourceTitle = findSourceTitle(memory.sourceReferences);
    const acc = titleToAcc.get(normalizeTitle(sourceTitle));
    if (!acc) continue;
    acc.memoryIds.add(memory.id);
    if (memory.kind === 'course_template') acc.templateMemoryIds.add(memory.id);
    addIfPresent(acc.notebookIds, memory.notebookId);
    addDate(acc, memory.createdAt, memory.updatedAt);
  }

  const records = Array.from(uploads.values())
    .map(finalizeRecord)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
        a.title.localeCompare(b.title, 'zh-CN'),
    );
  return {
    records,
    byHash: new Map(records.map((record) => [record.sourceHash, record] as const)),
  };
}

function memoryIdsContainAny(uploads: Map<string, SourceUploadAccumulator>, memoryId: string) {
  for (const acc of uploads.values()) {
    if (acc.memoryIds.has(memoryId)) return true;
  }
  return false;
}

async function refreshNotebookSummariesAfterSourceDelete(args: {
  tx: Prisma.TransactionClient;
  ownerId: string;
  courseId: string;
  sourceHash: string;
  notebookIds: string[];
}) {
  const notebookIds = Array.from(new Set(args.notebookIds.filter(Boolean)));
  if (notebookIds.length === 0) return 0;

  let deletedNotebookCount = 0;
  for (const notebookId of notebookIds) {
    const notebook = await args.tx.notebook.findFirst({
      where: { id: notebookId, ownerId: args.ownerId, courseId: args.courseId },
      select: { id: true, notebookKind: true, coverSlideJson: true },
    });
    if (!notebook) continue;

    const [sectionCount, pageCount, sceneCount, problemCount, publishedProblemCount] =
      await Promise.all([
        args.tx.markdownNotebookSection.count({ where: { notebookId } }),
        args.tx.notebookPage.count({ where: { notebookId } }),
        args.tx.scene.count({ where: { notebookId } }),
        args.tx.notebookProblem.count({ where: { notebookId } }),
        args.tx.notebookProblem.count({ where: { notebookId, status: 'published' } }),
      ]);

    if (
      notebook.notebookKind === 'markdown' &&
      sectionCount === 0 &&
      pageCount === 0 &&
      sceneCount === 0 &&
      problemCount === 0
    ) {
      await args.tx.notebook.delete({ where: { id: notebookId } });
      deletedNotebookCount += 1;
      continue;
    }

    const coverSourceHash = readJsonString(notebook.coverSlideJson, ['sourceCover', 'sourceHash']);
    const shouldClearSourceCover = coverSourceHash === args.sourceHash;

    await args.tx.notebook.update({
      where: { id: notebookId },
      data: {
        sectionCount,
        problemCount,
        publishedProblemCount,
        ...(shouldClearSourceCover
          ? {
              coverSlideJson: Prisma.DbNull,
              coverImagePath: null,
            }
          : {}),
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  return deletedNotebookCount;
}

async function deleteOpenAIUserFiles(fileIds: string[]): Promise<number> {
  const uniqueFileIds = Array.from(new Set(fileIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueFileIds.length === 0) return 0;
  const apiKey = resolveApiKey('openai');
  if (!apiKey) return 0;

  let deleted = 0;
  for (const fileId of uniqueFileIds) {
    try {
      const response = await fetch(
        `https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (response.ok) deleted += 1;
    } catch {
      /* Best-effort cleanup; local source deletion should still succeed. */
    }
  }
  return deleted;
}

export async function listCourseSourceUploads(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  includeTextSections?: boolean;
}): Promise<CourseSourceUploadRecord[]> {
  const collection = await collectCourseSourceUploads(args);
  return collection.records;
}

export async function deleteCourseSourceUpload(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  sourceHash: string;
}): Promise<DeleteCourseSourceUploadResult> {
  const sourceHash = args.sourceHash.trim();
  if (!sourceHash) throw new Error('Source upload not found');

  const collection = await collectCourseSourceUploads(args);
  const source = collection.byHash.get(sourceHash);
  if (!source) throw new Error('Source upload not found');

  const notebookIds = Array.from(new Set(source.notebookIds.filter(Boolean)));
  let deletedNotebookCount = 0;
  let deletedFactEventCount = 0;
  let deletedOpenAIFileCount = 0;

  await args.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const memoryFactEvents = await tx.memoryFactEvent.deleteMany({
      where: {
        ownerId: args.userId,
        scopeType: 'course',
        scopeId: args.courseId,
        namespace: 'knowledge_graph',
        key: `${SOURCE_KEY_PREFIX}${sourceHash}`,
      },
    });
    deletedFactEventCount = memoryFactEvents.count;

    if (source.memoryIds.length > 0) {
      await tx.studyMemory.deleteMany({
        where: {
          id: { in: source.memoryIds },
          ownerId: args.userId,
        },
      });
    }

    if (source.ragEntryIds.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "MemoryKnowledgeCache"
        WHERE "ownerId" = ${args.userId}
          AND "id" IN (${Prisma.join(source.ragEntryIds)})
      `);
    }

    if (source.knowledgeGraphFactIds.length > 0) {
      await tx.memoryFact.deleteMany({
        where: {
          id: { in: source.knowledgeGraphFactIds },
          ownerId: args.userId,
        },
      });
    } else {
      await tx.memoryFact.deleteMany({
        where: {
          ownerId: args.userId,
          scopeType: 'course',
          scopeId: args.courseId,
          namespace: 'knowledge_graph',
          key: `${SOURCE_KEY_PREFIX}${sourceHash}`,
        },
      });
    }

    if (source.problemIds.length > 0) {
      await tx.notebookProblem.deleteMany({
        where: {
          id: { in: source.problemIds },
          OR: [{ courseId: args.courseId }, { notebook: { courseId: args.courseId } }],
        },
      });
    }

    if (source.importBatchIds.length > 0) {
      await tx.problemImportBatch.deleteMany({
        where: {
          id: { in: source.importBatchIds },
          ownerId: args.userId,
          courseId: args.courseId,
        },
      });
    }

    if (source.sectionIds.length > 0) {
      await tx.markdownNotebookSection.deleteMany({
        where: {
          id: { in: source.sectionIds },
          notebook: { ownerId: args.userId },
          courseId: args.courseId,
        },
      });
    }

    deletedNotebookCount = await refreshNotebookSummariesAfterSourceDelete({
      tx,
      ownerId: args.userId,
      courseId: args.courseId,
      sourceHash,
      notebookIds,
    });
    await refreshCourseSummaryFields(tx, args.courseId);
  });
  deletedOpenAIFileCount = await deleteOpenAIUserFiles(source.openaiFileIds);

  return {
    source,
    deleted: {
      notebooks: deletedNotebookCount,
      sections: source.sectionIds.length,
      problems: source.problemIds.length,
      importBatches: source.importBatchIds.length,
      memories: source.memoryIds.length,
      templateMemories: source.templateMemoryIds.length,
      memoryFacts: source.knowledgeGraphFactIds.length,
      memoryFactEvents: deletedFactEventCount,
      ragEntries: source.ragEntryIds.length,
      openaiFiles: deletedOpenAIFileCount,
    },
  };
}
