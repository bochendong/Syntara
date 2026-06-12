import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import {
  listMemoryFacts,
  upsertMemoryFact,
  type MemoryFactScopeType,
} from '@/lib/server/memory-fact-store';
import {
  resolveOwnedStudyMemoryTarget,
  resolveReadableStudyMemoryTarget,
} from '@/lib/server/study-memory-store';

const scopeTypeSchema = z.enum(['user', 'course', 'notebook', 'conversation']);

const createMemoryFactSchema = z.object({
  scopeType: scopeTypeSchema.default('user'),
  scopeId: z.string().trim().min(1).nullable().optional(),
  namespace: z.string().trim().min(1).max(80),
  key: z.string().trim().min(1).max(120),
  valueJson: z.unknown(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  sourceRef: z.unknown().optional(),
});

function unavailableResponse() {
  return NextResponse.json({ facts: [], storage: 'unavailable' });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function canWriteFactScope(args: {
  prisma: PrismaClient;
  userId: string;
  scopeType: MemoryFactScopeType;
  scopeId: string | null;
}): Promise<boolean> {
  if (args.scopeType === 'user') return args.scopeId == null;
  if (!args.scopeId) return false;
  if (args.scopeType === 'course' || args.scopeType === 'notebook') {
    const target = await resolveOwnedStudyMemoryTarget(
      args.prisma,
      args.userId,
      args.scopeType,
      args.scopeId,
    );
    return Boolean(target);
  }

  const rows = await args.prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT "id"
      FROM "Conversation"
      WHERE "id" = $1 AND "ownerId" = $2
      LIMIT 1
    `,
    args.scopeId,
    args.userId,
  );
  return rows.length > 0;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) return unavailableResponse();

    const url = new URL(request.url);
    const rawScopeType = url.searchParams.get('scopeType');
    const scopeType = rawScopeType ? scopeTypeSchema.safeParse(rawScopeType) : null;
    if (scopeType && !scopeType.success) return badRequest('Invalid scopeType');

    const parsedScopeType = scopeType?.success ? scopeType.data : undefined;
    const requestedScopeId = url.searchParams.has('scopeId')
      ? url.searchParams.get('scopeId')
      : undefined;
    let ownerId = auth.userId;
    let scopeId = requestedScopeId;
    if (
      (parsedScopeType === 'course' || parsedScopeType === 'notebook') &&
      requestedScopeId?.trim()
    ) {
      const target = await resolveReadableStudyMemoryTarget(
        prisma,
        auth.userId,
        parsedScopeType,
        requestedScopeId,
      );
      if (!target) {
        return NextResponse.json({ error: 'Memory fact scope not found' }, { status: 404 });
      }
      ownerId = target.targetOwnerId;
      scopeId = requestedScopeId;
    }
    if (parsedScopeType === 'user') scopeId = null;

    const facts = await listMemoryFacts({
      prisma,
      ownerId,
      scopeType: parsedScopeType,
      scopeId,
      namespace: url.searchParams.get('namespace') || undefined,
      key: url.searchParams.get('key') || undefined,
      includeSuperseded: url.searchParams.get('includeSuperseded') === 'true',
      limit: Number(url.searchParams.get('limit') || 120),
    });
    return NextResponse.json({ facts, storage: 'database' });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ error: 'Database is not configured' }, { status: 503 });
    }

    const raw = await request.json();
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Object.prototype.hasOwnProperty.call(raw, 'valueJson')
    ) {
      return badRequest('valueJson is required');
    }
    const payload = createMemoryFactSchema.safeParse(raw);
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const scopeId = payload.data.scopeType === 'user' ? null : payload.data.scopeId || null;
    const allowed = await canWriteFactScope({
      prisma,
      userId: auth.userId,
      scopeType: payload.data.scopeType,
      scopeId,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'You can only write facts for scopes you own' },
        { status: 403 },
      );
    }

    const result = await upsertMemoryFact({
      prisma,
      ownerId: auth.userId,
      scopeType: payload.data.scopeType,
      scopeId,
      namespace: payload.data.namespace,
      key: payload.data.key,
      valueJson: payload.data.valueJson,
      confidence: payload.data.confidence,
      source: payload.data.source,
      sourceRef: payload.data.sourceRef,
    });
    return NextResponse.json({ ...result, storage: 'database' }, { status: 201 });
  });
}
