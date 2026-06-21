#!/usr/bin/env node

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { loadMaintenanceEnvFiles } from './teaching-control-update-safety.mjs';

const EMBEDDING_MODEL =
  process.env.STUDY_MEMORY_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 180;

function normalizeText(input) {
  return String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stableJson(value) {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function contentHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function chunkHash(memory, chunkText, chunkIndex) {
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

function splitMemoryText(memory) {
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

  const chunks = [];
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

function vectorLiteral(values) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

async function ensureVectorIndex(prisma) {
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
}

function createEmbeddingClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to reindex StudyMemoryChunk embeddings.');
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  });
}

async function createEmbedding(client, input) {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding?.length || 0}`,
    );
  }
  return embedding;
}

async function indexMemory(prisma, client, memory) {
  const chunks = splitMemoryText(memory);
  if (chunks.length === 0) return { memoryId: memory.id, indexed: false, chunks: 0 };

  const embeddings = [];
  for (const chunk of chunks) {
    embeddings.push(await createEmbedding(client, chunk.text));
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
      chunkHash(memory, chunk.text, chunk.chunkIndex),
      EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS,
      vectorLiteral(embeddings[chunk.chunkIndex] || []),
    );
  }

  return { memoryId: memory.id, indexed: true, chunks: chunks.length };
}

async function main() {
  loadMaintenanceEnvFiles(process.cwd(), ['.env', '.env.local']);
  const prisma = new PrismaClient();
  const client = createEmbeddingClient();
  const limit = Math.max(
    1,
    Math.min(
      Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1]) || 200,
      500,
    ),
  );

  try {
    await ensureVectorIndex(prisma);
    const memories = await prisma.studyMemory.findMany({
      where: {
        status: 'active',
        kind: { in: ['course_teaching_control', 'notebook_teaching_control'] },
      },
      orderBy: [{ courseId: 'asc' }, { targetType: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    const results = [];
    for (const memory of memories) {
      results.push(await indexMemory(prisma, client, memory));
    }

    console.log(
      JSON.stringify(
        {
          embeddingModel: EMBEDDING_MODEL,
          embeddingDimensions: EMBEDDING_DIMENSIONS,
          memories: memories.length,
          indexed: results.filter((result) => result.indexed).length,
          chunks: results.reduce((sum, result) => sum + result.chunks, 0),
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
