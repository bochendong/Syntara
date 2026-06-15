import { createHash, randomUUID } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import { getPrismaOrNull } from '@/lib/server/prisma-safe';

const log = createLogger('LLMPromptLog');

let ensurePromptLogTablePromise: Promise<void> | null = null;

function createPromptLogId(): string {
  return `prompt_${randomUUID().replace(/-/g, '')}`;
}

function promptHash(systemPrompt: string, userPrompt: string): string {
  return createHash('sha256')
    .update(systemPrompt)
    .update('\n---USER---\n')
    .update(userPrompt)
    .digest('hex');
}

export async function ensureLLMPromptLogTable(prisma: PrismaClient): Promise<void> {
  if (!ensurePromptLogTablePromise) {
    ensurePromptLogTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "LLMPromptLog" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
          "userEmail" TEXT,
          "userName" TEXT,
          "route" TEXT NOT NULL,
          "source" TEXT NOT NULL,
          "providerId" TEXT NOT NULL,
          "modelId" TEXT NOT NULL,
          "modelString" TEXT NOT NULL,
          "notebookId" TEXT,
          "notebookName" TEXT,
          "courseId" TEXT,
          "courseName" TEXT,
          "promptHash" TEXT NOT NULL,
          "systemPrompt" TEXT NOT NULL,
          "userPrompt" TEXT NOT NULL,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LLMPromptLog_user_created_idx"
        ON "LLMPromptLog" ("userId", "createdAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LLMPromptLog_route_source_created_idx"
        ON "LLMPromptLog" ("route", "source", "createdAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LLMPromptLog_notebook_created_idx"
        ON "LLMPromptLog" ("notebookId", "createdAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "LLMPromptLog_prompt_hash_idx"
        ON "LLMPromptLog" ("promptHash")
      `);
    })().catch((error) => {
      ensurePromptLogTablePromise = null;
      throw error;
    });
  }
  return ensurePromptLogTablePromise;
}

export type RecordLLMPromptSnapshotArgs = {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  notebookId?: string | null;
  notebookName?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  systemPrompt: string;
  userPrompt: string;
  metadata?: Record<string, unknown> | null;
};

export async function recordLLMPromptSnapshot(
  args: RecordLLMPromptSnapshotArgs,
): Promise<{ id: string; promptHash: string } | null> {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const id = createPromptLogId();
  const hash = promptHash(args.systemPrompt, args.userPrompt);

  try {
    await ensureLLMPromptLogTable(prisma);
    await prisma.$executeRaw`
      INSERT INTO "LLMPromptLog" (
        "id", "userId", "userEmail", "userName", "route", "source",
        "providerId", "modelId", "modelString", "notebookId", "notebookName",
        "courseId", "courseName", "promptHash", "systemPrompt", "userPrompt", "metadata"
      )
      VALUES (
        ${id}, ${args.userId || null}, ${args.userEmail || null}, ${args.userName || null},
        ${args.route}, ${args.source}, ${args.providerId}, ${args.modelId}, ${args.modelString},
        ${args.notebookId || null}, ${args.notebookName || null},
        ${args.courseId || null}, ${args.courseName || null},
        ${hash}, ${args.systemPrompt}, ${args.userPrompt},
        ${JSON.stringify(args.metadata ?? {})}::jsonb
      )
    `;
    return { id, promptHash: hash };
  } catch (error) {
    log.warn('Failed to record LLM prompt snapshot:', error);
    return null;
  }
}
