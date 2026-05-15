import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

const MAX_LIMIT = 200;

const testResultSchema = z.object({
  testId: z.string().trim().min(1).max(120),
  resultKey: z.string().trim().min(1).max(240),
  status: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().max(240).optional(),
  summary: z.unknown().optional(),
  payload: z.unknown().optional(),
});

type RawTestResultRow = {
  id: string;
  ownerId: string;
  testId: string;
  resultKey: string;
  status: string;
  title: string | null;
  summary: unknown;
  payload?: unknown;
  payloadBytes: number;
  createdAt: Date;
  updatedAt: Date;
};

let ensureTablePromise: Promise<void> | null = null;

function jsonByteLength(value: unknown): number {
  if (value === undefined) return 0;
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function jsonParam(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function toApiRow(row: RawTestResultRow, includePayload: boolean) {
  return {
    id: row.id,
    testId: row.testId,
    resultKey: row.resultKey,
    status: row.status,
    title: row.title,
    summary: row.summary,
    ...(includePayload ? { payload: row.payload } : {}),
    payloadBytes: row.payloadBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureTestResultTable(prisma: NonNullable<ReturnType<typeof getOptionalPrisma>>) {
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = ensureTestResultTableOnce(prisma).catch((error) => {
    ensureTablePromise = null;
    throw error;
  });
  return ensureTablePromise;
}

async function ensureTestResultTableOnce(
  prisma: NonNullable<ReturnType<typeof getOptionalPrisma>>,
) {
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
    CREATE INDEX IF NOT EXISTS "TestResult_ownerId_testId_updatedAt_idx"
    ON "TestResult" ("ownerId", "testId", "updatedAt" DESC)
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "TestResult_ownerId_updatedAt_idx"
    ON "TestResult" ("ownerId", "updatedAt" DESC)
  `;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        503,
        'DATABASE_URL 未配置，无法读取测试结果。',
      );
    }

    await ensureTestResultTable(prisma);

    const { searchParams } = new URL(request.url);
    const includePayload = searchParams.get('includePayload') === '1';
    const testId = searchParams.get('testId')?.trim();
    const resultKey = searchParams.get('resultKey')?.trim();
    const testIds = searchParams
      .get('testIds')
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 80);
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit') || '80') || 80, 1),
      MAX_LIMIT,
    );

    const whereParts = ['"ownerId" = $1'];
    const values: unknown[] = [userId];

    if (testId) {
      values.push(testId);
      whereParts.push(`"testId" = $${values.length}`);
    } else if (testIds?.length) {
      values.push(testIds);
      whereParts.push(`"testId" = ANY($${values.length})`);
    }

    if (resultKey) {
      values.push(resultKey);
      whereParts.push(`"resultKey" = $${values.length}`);
    }

    values.push(limit);
    const limitPlaceholder = `$${values.length}`;
    const selectPayload = includePayload ? ', "payload"' : '';
    const rows = await prisma.$queryRawUnsafe<RawTestResultRow[]>(
      `
        SELECT
          "id",
          "ownerId",
          "testId",
          "resultKey",
          "status",
          "title",
          "summary",
          "payloadBytes",
          "createdAt",
          "updatedAt"
          ${selectPayload}
        FROM "TestResult"
        WHERE ${whereParts.join(' AND ')}
        ORDER BY "updatedAt" DESC
        LIMIT ${limitPlaceholder}
      `,
      ...values,
    );

    return NextResponse.json({
      success: true,
      databaseEnabled: true,
      results: rows.map((row) => toApiRow(row, includePayload)),
    });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        503,
        'DATABASE_URL 未配置，无法保存测试结果。',
      );
    }

    const parsed = testResultSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await ensureTestResultTable(prisma);

    const payloadBytes = jsonByteLength(parsed.data.payload);
    const rows = await prisma.$queryRawUnsafe<RawTestResultRow[]>(
      `
        INSERT INTO "TestResult" (
          "id",
          "ownerId",
          "testId",
          "resultKey",
          "status",
          "title",
          "summary",
          "payload",
          "payloadBytes",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          CAST($7 AS jsonb),
          CAST($8 AS jsonb),
          $9,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
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
          "id",
          "ownerId",
          "testId",
          "resultKey",
          "status",
          "title",
          "summary",
          "payloadBytes",
          "createdAt",
          "updatedAt"
      `,
      randomUUID(),
      userId,
      parsed.data.testId,
      parsed.data.resultKey,
      parsed.data.status || 'saved',
      parsed.data.title || null,
      jsonParam(parsed.data.summary),
      jsonParam(parsed.data.payload),
      payloadBytes,
    );

    return NextResponse.json(
      {
        success: true,
        databaseEnabled: true,
        result: rows[0] ? toApiRow(rows[0], false) : null,
      },
      { status: 201 },
    );
  });
}
