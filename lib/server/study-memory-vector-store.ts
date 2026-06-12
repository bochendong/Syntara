import crypto from 'node:crypto';
import OpenAI from 'openai';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import { createLogger } from '@/lib/logger';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';

const log = createLogger('StudyMemoryVectorStore');

const EMBEDDING_MODEL =
  process.env.STUDY_MEMORY_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 180;

type IndexableStudyMemoryRecord = {
  id: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: string;
  scope: string;
  status: string;
  source: string;
  title: string;
  text: string;
  reason: string | null;
  question: string | null;
  sourceReferences: unknown;
};

type ExistingChunkRow = {
  chunkIndex: number;
  contentHash: string;
  embeddingModel: string;
  embeddingDimensions: number;
};

type RawSearchRow = {
  id: string;
  memoryId: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: string;
  scope: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number | string;
  title: string;
  text: string;
  reason: string | null;
  question: string | null;
  sourceReferences: unknown;
  updatedAt: Date | string;
};

export type StudyMemorySemanticMatch = {
  chunkId: string;
  memoryId: string;
  ownerId: string;
  courseId: string | null;
  notebookId: string | null;
  targetType: string;
  scope: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number;
  title: string;
  text: string;
  reason: string | null;
  question: string | null;
  sourceReferences: unknown;
  updatedAt: string;
};

let ensureVectorIndexPromise: Promise<boolean> | null = null;
let openaiClientPromise: Promise<OpenAI | null> | null = null;

function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stableJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function contentHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function chunkHash(
  memory: IndexableStudyMemoryRecord,
  chunkText: string,
  chunkIndex: number,
): string {
  return contentHash(
    [
      memory.id,
      memory.title,
      memory.reason || '',
      memory.question || '',
      stableJson(memory.sourceReferences),
      chunkIndex,
      chunkText,
    ].join('\n'),
  );
}

function splitMemoryText(
  memory: IndexableStudyMemoryRecord,
): Array<{ chunkIndex: number; text: string }> {
  const sourceReferences = stableJson(memory.sourceReferences);
  const fullText = normalizeText(
    [
      `Title: ${memory.title}`,
      memory.reason ? `Reason: ${memory.reason}` : '',
      memory.question ? `Question: ${memory.question}` : '',
      memory.text,
      sourceReferences ? `Source references: ${sourceReferences}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  );

  if (!fullText) return [];
  if (fullText.length <= MAX_CHUNK_CHARS) return [{ chunkIndex: 0, text: fullText }];

  const chunks: Array<{ chunkIndex: number; text: string }> = [];
  let start = 0;
  while (start < fullText.length) {
    const hardEnd = Math.min(fullText.length, start + MAX_CHUNK_CHARS);
    const slice = fullText.slice(start, hardEnd);
    const softBreak = Math.max(
      slice.lastIndexOf('\n\n'),
      slice.lastIndexOf('。'),
      slice.lastIndexOf('. '),
    );
    const end = softBreak > MAX_CHUNK_CHARS * 0.55 ? start + softBreak + 1 : hardEnd;
    const text = fullText.slice(start, end).trim();
    if (text) chunks.push({ chunkIndex: chunks.length, text });
    if (end >= fullText.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

async function getOpenAIClient(): Promise<OpenAI | null> {
  if (!openaiClientPromise) {
    openaiClientPromise = (async () => {
      const config = await getSystemLLMRuntimeConfig();
      if (!config.apiKey) return null;
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined,
      });
    })().catch((error) => {
      openaiClientPromise = null;
      log.warn('Failed to initialize OpenAI embedding client:', error);
      return null;
    });
  }
  return openaiClientPromise;
}

async function createEmbedding(input: string): Promise<number[] | null> {
  const client = await getOpenAIClient();
  if (!client) return null;
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0]?.embedding || null;
}

export async function ensureStudyMemoryVectorIndex(prisma: PrismaClient): Promise<boolean> {
  if (!ensureVectorIndexPromise) {
    ensureVectorIndexPromise = (async () => {
      try {
        await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "StudyMemoryChunk" (
            "id" TEXT PRIMARY KEY,
            "memoryId" TEXT NOT NULL REFERENCES "StudyMemory"("id") ON DELETE CASCADE,
            "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "courseId" TEXT REFERENCES "Course"("id") ON DELETE CASCADE,
            "notebookId" TEXT REFERENCES "Notebook"("id") ON DELETE CASCADE,
            "targetType" TEXT NOT NULL,
            "scope" TEXT NOT NULL,
            "chunkIndex" INTEGER NOT NULL,
            "chunkText" TEXT NOT NULL,
            "contentHash" TEXT NOT NULL,
            "embeddingModel" TEXT NOT NULL,
            "embeddingDimensions" INTEGER NOT NULL,
            "embedding" vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "StudyMemoryChunk_memory_chunk_model_idx"
          ON "StudyMemoryChunk" ("memoryId", "chunkIndex", "embeddingModel", "embeddingDimensions")
        `);
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "StudyMemoryChunk_owner_scope_target_idx"
          ON "StudyMemoryChunk" ("ownerId", "scope", "targetType", "courseId", "notebookId")
        `);
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "StudyMemoryChunk_embedding_hnsw_idx"
          ON "StudyMemoryChunk" USING hnsw ("embedding" vector_cosine_ops)
        `);
        return true;
      } catch (error) {
        ensureVectorIndexPromise = null;
        log.warn('Study memory vector index is unavailable:', error);
        return false;
      }
    })();
  }
  return ensureVectorIndexPromise;
}

export async function indexStudyMemoryRecord(
  prisma: PrismaClient,
  memory: IndexableStudyMemoryRecord,
): Promise<{ indexed: boolean; chunks: number; reason?: string }> {
  if (memory.status === 'archived') {
    const available = await ensureStudyMemoryVectorIndex(prisma);
    if (available) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1',
        memory.id,
      );
    }
    return { indexed: false, chunks: 0, reason: 'archived' };
  }

  const available = await ensureStudyMemoryVectorIndex(prisma);
  if (!available) return { indexed: false, chunks: 0, reason: 'vector_unavailable' };

  const chunks = splitMemoryText(memory);
  if (chunks.length === 0) return { indexed: false, chunks: 0, reason: 'empty' };

  const chunkHashes = chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    contentHash: chunkHash(memory, chunk.text, chunk.chunkIndex),
  }));
  const existing = await prisma.$queryRawUnsafe<ExistingChunkRow[]>(
    `
      SELECT "chunkIndex", "contentHash", "embeddingModel", "embeddingDimensions"
      FROM "StudyMemoryChunk"
      WHERE "memoryId" = $1 AND "embeddingModel" = $2 AND "embeddingDimensions" = $3
      ORDER BY "chunkIndex" ASC
    `,
    memory.id,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
  );
  const alreadyIndexed =
    existing.length === chunkHashes.length &&
    chunkHashes.every((chunk, index) => existing[index]?.contentHash === chunk.contentHash);
  if (alreadyIndexed) return { indexed: false, chunks: chunks.length, reason: 'unchanged' };

  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const embedding = await createEmbedding(chunk.text);
    if (!embedding) return { indexed: false, chunks: 0, reason: 'embedding_unavailable' };
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      return { indexed: false, chunks: 0, reason: 'embedding_dimension_mismatch' };
    }
    embeddings.push(embedding);
  }

  await prisma.$executeRawUnsafe(
    `
      DELETE FROM "StudyMemoryChunk"
      WHERE "memoryId" = $1 AND "embeddingModel" = $2 AND "embeddingDimensions" = $3
    `,
    memory.id,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
  );

  for (const chunk of chunks) {
    const hash = chunkHashes[chunk.chunkIndex]?.contentHash || contentHash(chunk.text);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "StudyMemoryChunk" (
          "id", "memoryId", "ownerId", "courseId", "notebookId",
          "targetType", "scope", "chunkIndex", "chunkText", "contentHash",
          "embeddingModel", "embeddingDimensions", "embedding", "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
      `memory_chunk_${crypto.randomUUID().replace(/-/g, '')}`,
      memory.id,
      memory.ownerId,
      memory.courseId,
      memory.notebookId,
      memory.targetType,
      memory.scope,
      chunk.chunkIndex,
      chunk.text,
      hash,
      EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS,
      vectorLiteral(embeddings[chunk.chunkIndex] || []),
    );
  }

  return { indexed: true, chunks: chunks.length };
}

export async function indexStudyMemoryRecords(
  prisma: PrismaClient,
  memories: IndexableStudyMemoryRecord[],
): Promise<{ indexed: number; skipped: number; chunks: number }> {
  let indexed = 0;
  let skipped = 0;
  let chunks = 0;
  for (const memory of memories) {
    try {
      const result = await indexStudyMemoryRecord(prisma, memory);
      if (result.indexed) indexed += 1;
      else skipped += 1;
      chunks += result.chunks;
    } catch (error) {
      skipped += 1;
      log.warn('Failed to index study memory:', { memoryId: memory.id, error });
    }
  }
  return { indexed, skipped, chunks };
}

export async function backfillStudyMemoryVectorIndex(
  prisma: PrismaClient,
  options: { limit?: number } = {},
): Promise<{ scanned: number; indexed: number; skipped: number; chunks: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 500, 2000));
  const rows = await prisma.$queryRawUnsafe<IndexableStudyMemoryRecord[]>(
    `
      SELECT *
      FROM "StudyMemory"
      WHERE "status" = 'active'
      ORDER BY "updatedAt" DESC
      LIMIT $1
    `,
    limit,
  );
  const result = await indexStudyMemoryRecords(prisma, rows);
  return { scanned: rows.length, ...result };
}

export async function semanticSearchStudyMemoryChunks(args: {
  prisma: PrismaClient;
  query: string;
  viewerUserId: string;
  publicOwnerId: string;
  notebookId?: string | null;
  courseId?: string | null;
  limit?: number;
}): Promise<StudyMemorySemanticMatch[]> {
  const query = normalizeText(args.query).slice(0, 1600);
  if (!query) return [];
  const available = await ensureStudyMemoryVectorIndex(args.prisma);
  if (!available) return [];

  const embedding = await createEmbedding(query);
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return [];

  const limit = Math.max(1, Math.min(args.limit ?? 8, 20));
  const rows = await args.prisma.$queryRawUnsafe<RawSearchRow[]>(
    `
      SELECT
        c."id",
        c."memoryId",
        c."ownerId",
        c."courseId",
        c."notebookId",
        c."targetType",
        c."scope",
        c."chunkIndex",
        c."chunkText",
        1 - (c."embedding" <=> $1::vector) AS "similarity",
        m."title",
        m."text",
        m."reason",
        m."question",
        m."sourceReferences",
        m."updatedAt"
      FROM "StudyMemoryChunk" c
      JOIN "StudyMemory" m ON m."id" = c."memoryId"
      WHERE
        m."status" = 'active'
        AND c."embeddingModel" = $2
        AND c."embeddingDimensions" = $3
        AND (
          (m."scope" = 'public' AND m."ownerId" = $4)
          OR (m."scope" = 'private' AND m."ownerId" = $5)
        )
        AND (
          ($6::text IS NOT NULL AND m."notebookId" = $6)
          OR ($7::text IS NOT NULL AND m."courseId" = $7)
        )
      ORDER BY c."embedding" <=> $1::vector
      LIMIT $8
    `,
    vectorLiteral(embedding),
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    args.publicOwnerId,
    args.viewerUserId,
    args.notebookId || null,
    args.courseId || null,
    limit,
  );

  return rows.map((row) => ({
    chunkId: row.id,
    memoryId: row.memoryId,
    ownerId: row.ownerId,
    courseId: row.courseId,
    notebookId: row.notebookId,
    targetType: row.targetType,
    scope: row.scope,
    chunkIndex: row.chunkIndex,
    chunkText: row.chunkText,
    similarity: Number(row.similarity) || 0,
    title: row.title,
    text: row.text,
    reason: row.reason,
    question: row.question,
    sourceReferences: row.sourceReferences,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}
