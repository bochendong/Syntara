import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

const SHARED_TEST_ID = 'question-source-routing';
const MAX_RESULTS = 200;

const saveSchema = z.object({
  testId: z.literal(SHARED_TEST_ID),
  resultKey: z.string().trim().min(1).max(240),
  status: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().max(240).optional(),
  summary: z.unknown().optional(),
  payload: z.unknown(),
});

const deleteSchema = z.object({
  testId: z.literal(SHARED_TEST_ID),
  resultKey: z.string().trim().min(1).max(240),
});

type RawTestResultRow = {
  id: string;
  ownerId: string;
  testId: string;
  resultKey: string;
  status: string;
  title: string | null;
  summary: unknown;
  payload: unknown;
  payloadBytes: number;
  createdAt: Date;
  updatedAt: Date;
};

let ensureTablePromise: Promise<void> | null = null;

function jsonParam(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(jsonParam(value)).length;
}

function toSharedRow(row: RawTestResultRow, currentUserId: string | null) {
  return {
    id: row.id,
    testId: row.testId,
    resultKey: row.resultKey,
    status: row.status,
    title: row.title,
    summary: row.summary,
    payload: row.payload,
    payloadBytes: row.payloadBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    storage: 'shared' as const,
    canDelete: Boolean(currentUserId && row.ownerId === currentUserId),
  };
}

async function ensureTestResultTable(
  prisma: NonNullable<ReturnType<typeof getOptionalPrisma>>,
): Promise<void> {
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "TestResult" (
        "id" TEXT PRIMARY KEY,
        "ownerId" TEXT NOT NULL,
        "testId" TEXT NOT NULL,
        "resultKey" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'saved',
        "title" TEXT,
        "summary" JSONB,
        "payload" JSONB,
        "payloadBytes" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "TestResult_ownerId_testId_resultKey_key"
      ON "TestResult" ("ownerId", "testId", "resultKey")
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "TestResult_testId_updatedAt_idx"
      ON "TestResult" ("testId", "updatedAt" DESC)
    `;
  })().catch((error) => {
    ensureTablePromise = null;
    throw error;
  });
  return ensureTablePromise;
}

export async function GET() {
  return safeRoute(async () => {
    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL 未配置，无法读取共享测试结果。' },
        { status: 503 },
      );
    }
    const rows = await prisma.$queryRawUnsafe<RawTestResultRow[]>(
      `
        SELECT
          "id", "ownerId", "testId", "resultKey", "status", "title",
          "summary", "payload", "payloadBytes", "createdAt", "updatedAt"
        FROM "TestResult"
        WHERE "testId" = $1
        ORDER BY "updatedAt" DESC
        LIMIT $2
      `,
      SHARED_TEST_ID,
      MAX_RESULTS,
    );

    return NextResponse.json({
      success: true,
      results: rows.map((row) => toSharedRow(row, null)),
    });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid shared test result', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL 未配置，无法保存共享测试结果。' },
        { status: 503 },
      );
    }
    await ensureTestResultTable(prisma);

    const input = parsed.data;
    const rows = await prisma.$queryRawUnsafe<RawTestResultRow[]>(
      `
        INSERT INTO "TestResult" (
          "id", "ownerId", "testId", "resultKey", "status", "title",
          "summary", "payload", "payloadBytes", "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          CAST($7 AS jsonb), CAST($8 AS jsonb), $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("ownerId", "testId", "resultKey")
        DO UPDATE SET
          "status" = EXCLUDED."status",
          "title" = EXCLUDED."title",
          "summary" = EXCLUDED."summary",
          "payload" = EXCLUDED."payload",
          "payloadBytes" = EXCLUDED."payloadBytes",
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING
          "id", "ownerId", "testId", "resultKey", "status", "title",
          "summary", "payload", "payloadBytes", "createdAt", "updatedAt"
      `,
      randomUUID(),
      auth.userId,
      SHARED_TEST_ID,
      input.resultKey,
      input.status || 'saved',
      input.title || null,
      jsonParam(input.summary),
      jsonParam(input.payload),
      jsonByteLength(input.payload),
    );

    return NextResponse.json(
      {
        success: true,
        result: rows[0] ? toSharedRow(rows[0], auth.userId) : null,
      },
      { status: 201 },
    );
  });
}

export async function DELETE(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid shared test result deletion', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL 未配置，无法删除共享测试结果。' },
        { status: 503 },
      );
    }
    await ensureTestResultTable(prisma);

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; ownerId: string }>>(
      `
        SELECT "id", "ownerId"
        FROM "TestResult"
        WHERE "testId" = $1 AND "resultKey" = $2
        ORDER BY "updatedAt" DESC
        LIMIT 1
      `,
      SHARED_TEST_ID,
      parsed.data.resultKey,
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Shared test result not found.' }, { status: 404 });
    if (row.ownerId !== auth.userId) {
      return NextResponse.json({ error: '只能删除自己创建的共享测试结果。' }, { status: 403 });
    }

    await prisma.$executeRawUnsafe(`DELETE FROM "TestResult" WHERE "id" = $1`, row.id);
    return NextResponse.json({ success: true });
  });
}
