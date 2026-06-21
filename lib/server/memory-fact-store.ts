import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/lib/server/generated-prisma';

export type MemoryFactScopeType = 'user' | 'course' | 'notebook' | 'conversation';
export type MemoryFactStatusValue = 'active' | 'superseded' | 'archived';
export type MemoryFactEventType = 'created' | 'confirmed' | 'superseded' | 'archived';

export type MemoryFactRecord = {
  id: string;
  ownerId: string;
  scopeType: MemoryFactScopeType;
  scopeId: string | null;
  namespace: string;
  key: string;
  valueJson: unknown;
  confidence: number;
  source: string;
  sourceRef: unknown;
  status: MemoryFactStatusValue;
  validFrom: string;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryFactEventRecord = {
  id: string;
  factId: string | null;
  ownerId: string;
  scopeType: MemoryFactScopeType;
  scopeId: string | null;
  namespace: string;
  key: string;
  eventType: MemoryFactEventType;
  oldValueJson: unknown;
  newValueJson: unknown;
  source: string;
  sourceRef: unknown;
  createdAt: string;
};

type RawMemoryFactRow = Omit<
  MemoryFactRecord,
  'validFrom' | 'supersededAt' | 'createdAt' | 'updatedAt'
> & {
  validFrom: Date | string;
  supersededAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RawMemoryFactEventRow = Omit<MemoryFactEventRecord, 'createdAt'> & {
  createdAt: Date | string;
};

export type MemoryFactScopeRef = {
  ownerId: string;
  scopeType: MemoryFactScopeType;
  scopeId: string | null;
};

export type MemoryFactConflict = {
  namespace: string;
  key: string;
  overridden: MemoryFactRecord;
  winner: MemoryFactRecord;
};

const MEMORY_FACT_COLUMNS = `
  "id", "ownerId", "scopeType", "scopeId", "namespace", "key", "valueJson",
  "confidence", "source", "sourceRef", "status", "validFrom", "supersededAt",
  "createdAt", "updatedAt"
`;

const MEMORY_FACT_EVENT_COLUMNS = `
  "id", "factId", "ownerId", "scopeType", "scopeId", "namespace", "key",
  "eventType", "oldValueJson", "newValueJson", "source", "sourceRef", "createdAt"
`;

let ensureMemoryFactTablesPromise: Promise<void> | null = null;

function memoryFactId(): string {
  return `fact_${randomUUID().replace(/-/g, '')}`;
}

function memoryFactEventId(): string {
  return `fact_event_${randomUUID().replace(/-/g, '')}`;
}

function serializeDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function serializeFact(row: RawMemoryFactRow): MemoryFactRecord {
  return {
    ...row,
    scopeType: normalizeScopeType(row.scopeType),
    status: normalizeStatus(row.status),
    confidence: Number(row.confidence) || 0,
    validFrom: serializeDate(row.validFrom) || new Date(0).toISOString(),
    supersededAt: serializeDate(row.supersededAt),
    createdAt: serializeDate(row.createdAt) || new Date(0).toISOString(),
    updatedAt: serializeDate(row.updatedAt) || new Date(0).toISOString(),
  };
}

function serializeEvent(row: RawMemoryFactEventRow): MemoryFactEventRecord {
  return {
    ...row,
    scopeType: normalizeScopeType(row.scopeType),
    eventType: normalizeEventType(row.eventType),
    createdAt: serializeDate(row.createdAt) || new Date(0).toISOString(),
  };
}

function normalizeScopeType(value: string): MemoryFactScopeType {
  if (value === 'course' || value === 'notebook' || value === 'conversation') return value;
  return 'user';
}

function normalizeStatus(value: string): MemoryFactStatusValue {
  if (value === 'superseded' || value === 'archived') return value;
  return 'active';
}

function normalizeEventType(value: string): MemoryFactEventType {
  if (value === 'confirmed' || value === 'superseded' || value === 'archived') return value;
  return 'created';
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function jsonParam(value: unknown): string {
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

function normalizeScopeId(scopeType: MemoryFactScopeType, scopeId: string | null | undefined) {
  const id = scopeId?.trim() || null;
  if (scopeType === 'user') return null;
  if (!id) throw new Error(`${scopeType} memory facts require a scopeId`);
  return id;
}

function assertFactKey(namespace: string, key: string) {
  if (!namespace.trim() || namespace.length > 80) {
    throw new Error('Memory fact namespace must be 1-80 characters');
  }
  if (!key.trim() || key.length > 120) {
    throw new Error('Memory fact key must be 1-120 characters');
  }
}

function isUniqueFactConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('23505') || message.includes('already exists');
}

function shortDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withUniqueFactRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isUniqueFactConflict(error) || attempt === 2) break;
      await shortDelay(25 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function ensureMemoryFactTables(prisma: PrismaClient): Promise<void> {
  if (!ensureMemoryFactTablesPromise) {
    ensureMemoryFactTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "MemoryFact" (
          "id" TEXT PRIMARY KEY,
          "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "scopeType" TEXT NOT NULL,
          "scopeId" TEXT,
          "namespace" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "valueJson" JSONB NOT NULL,
          "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
          "source" TEXT NOT NULL DEFAULT 'manual',
          "sourceRef" JSONB,
          "status" TEXT NOT NULL DEFAULT 'active',
          "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "supersededAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "MemoryFactEvent" (
          "id" TEXT PRIMARY KEY,
          "factId" TEXT REFERENCES "MemoryFact"("id") ON DELETE SET NULL,
          "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "scopeType" TEXT NOT NULL,
          "scopeId" TEXT,
          "namespace" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "oldValueJson" JSONB,
          "newValueJson" JSONB,
          "source" TEXT NOT NULL DEFAULT 'manual',
          "sourceRef" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "MemoryFact_active_key_idx"
        ON "MemoryFact" (
          "ownerId", "scopeType", COALESCE("scopeId", ''), "namespace", "key"
        )
        WHERE "status" = 'active'
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryFact_owner_scope_valid_idx"
        ON "MemoryFact" ("ownerId", "scopeType", "scopeId", "validFrom" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryFact_owner_status_updated_idx"
        ON "MemoryFact" ("ownerId", "status", "updatedAt" DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryFactEvent_owner_key_created_idx"
        ON "MemoryFactEvent" (
          "ownerId", "scopeType", "scopeId", "namespace", "key", "createdAt" DESC
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "MemoryFactEvent_owner_type_created_idx"
        ON "MemoryFactEvent" ("ownerId", "eventType", "createdAt" DESC)
      `);
    })().catch((error) => {
      ensureMemoryFactTablesPromise = null;
      throw error;
    });
  }
  return ensureMemoryFactTablesPromise;
}

export async function upsertMemoryFact(args: {
  prisma: PrismaClient;
  ownerId: string;
  scopeType: MemoryFactScopeType;
  scopeId?: string | null;
  namespace: string;
  key: string;
  valueJson: unknown;
  confidence?: number;
  source?: string;
  sourceRef?: unknown;
  validFrom?: Date | string;
}): Promise<{ fact: MemoryFactRecord; event: MemoryFactEventRecord }> {
  assertFactKey(args.namespace, args.key);
  if (args.valueJson === undefined) throw new Error('Memory fact valueJson is required');
  await ensureMemoryFactTables(args.prisma);

  const scopeId = normalizeScopeId(args.scopeType, args.scopeId);
  const source = args.source?.trim().slice(0, 80) || 'manual';
  const confidence = Math.max(0, Math.min(args.confidence ?? 1, 1));
  const validFrom = args.validFrom ? new Date(args.validFrom) : new Date();

  return withUniqueFactRetry(() =>
    args.prisma.$transaction(async (tx) => {
      const existingRows = await tx.$queryRawUnsafe<RawMemoryFactRow[]>(
        `
        SELECT ${MEMORY_FACT_COLUMNS}
        FROM "MemoryFact"
        WHERE "ownerId" = $1
          AND "scopeType" = $2
          AND COALESCE("scopeId", '') = COALESCE($3::text, '')
          AND "namespace" = $4
          AND "key" = $5
          AND "status" = 'active'
        ORDER BY "validFrom" DESC
        LIMIT 1
        FOR UPDATE
      `,
        args.ownerId,
        args.scopeType,
        scopeId,
        args.namespace.trim(),
        args.key.trim(),
      );

      const existing = existingRows[0] ? serializeFact(existingRows[0]) : null;
      const sameValue = existing
        ? stableJson(existing.valueJson) === stableJson(args.valueJson)
        : false;
      const factId = sameValue && existing ? existing.id : memoryFactId();
      const eventType: MemoryFactEventType = existing
        ? sameValue
          ? 'confirmed'
          : 'superseded'
        : 'created';

      let fact: MemoryFactRecord;
      if (sameValue && existing) {
        const rows = await tx.$queryRawUnsafe<RawMemoryFactRow[]>(
          `
          UPDATE "MemoryFact"
          SET
            "confidence" = $2,
            "source" = $3,
            "sourceRef" = $4::jsonb,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $1
          RETURNING ${MEMORY_FACT_COLUMNS}
        `,
          existing.id,
          confidence,
          source,
          args.sourceRef === undefined ? null : jsonParam(args.sourceRef),
        );
        fact = serializeFact(rows[0]);
      } else {
        if (existing) {
          await tx.$executeRawUnsafe(
            `
            UPDATE "MemoryFact"
            SET "status" = 'superseded',
                "supersededAt" = CURRENT_TIMESTAMP,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
          `,
            existing.id,
          );
        }
        const rows = await tx.$queryRawUnsafe<RawMemoryFactRow[]>(
          `
          INSERT INTO "MemoryFact" (
            "id", "ownerId", "scopeType", "scopeId", "namespace", "key",
            "valueJson", "confidence", "source", "sourceRef", "status",
            "validFrom", "createdAt", "updatedAt"
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7::jsonb, $8, $9, $10::jsonb, 'active',
            $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          RETURNING ${MEMORY_FACT_COLUMNS}
        `,
          factId,
          args.ownerId,
          args.scopeType,
          scopeId,
          args.namespace.trim(),
          args.key.trim(),
          jsonParam(args.valueJson),
          confidence,
          source,
          args.sourceRef === undefined ? null : jsonParam(args.sourceRef),
          validFrom,
        );
        fact = serializeFact(rows[0]);
      }

      const eventRows = await tx.$queryRawUnsafe<RawMemoryFactEventRow[]>(
        `
        INSERT INTO "MemoryFactEvent" (
          "id", "factId", "ownerId", "scopeType", "scopeId", "namespace", "key",
          "eventType", "oldValueJson", "newValueJson", "source", "sourceRef", "createdAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, CURRENT_TIMESTAMP
        )
        RETURNING ${MEMORY_FACT_EVENT_COLUMNS}
      `,
        memoryFactEventId(),
        fact.id,
        args.ownerId,
        args.scopeType,
        scopeId,
        args.namespace.trim(),
        args.key.trim(),
        eventType,
        existing ? jsonParam(existing.valueJson) : null,
        jsonParam(args.valueJson),
        source,
        args.sourceRef === undefined ? null : jsonParam(args.sourceRef),
      );

      return { fact, event: serializeEvent(eventRows[0]) };
    }),
  );
}

export async function listMemoryFacts(args: {
  prisma: PrismaClient;
  ownerId: string;
  scopeType?: MemoryFactScopeType;
  scopeId?: string | null;
  namespace?: string;
  key?: string;
  includeSuperseded?: boolean;
  limit?: number;
}): Promise<MemoryFactRecord[]> {
  await ensureMemoryFactTables(args.prisma);
  const clauses = ['"ownerId" = $1'];
  const params: unknown[] = [args.ownerId];

  if (args.scopeType) {
    params.push(args.scopeType);
    clauses.push(`"scopeType" = $${params.length}`);
  }
  if (args.scopeId !== undefined) {
    params.push(args.scopeId);
    clauses.push(`COALESCE("scopeId", '') = COALESCE($${params.length}::text, '')`);
  }
  if (args.namespace) {
    params.push(args.namespace.trim());
    clauses.push(`"namespace" = $${params.length}`);
  }
  if (args.key) {
    params.push(args.key.trim());
    clauses.push(`"key" = $${params.length}`);
  }
  if (!args.includeSuperseded) {
    clauses.push(`"status" = 'active'`);
  }

  const requestedLimit = Number.isFinite(args.limit) ? Number(args.limit) : 120;
  const limit = Math.max(1, Math.min(requestedLimit, 500));
  params.push(limit);
  const rows = await args.prisma.$queryRawUnsafe<RawMemoryFactRow[]>(
    `
      SELECT ${MEMORY_FACT_COLUMNS}
      FROM "MemoryFact"
      WHERE ${clauses.join(' AND ')}
      ORDER BY "validFrom" DESC, "updatedAt" DESC
      LIMIT $${params.length}
    `,
    ...params,
  );
  return rows.map(serializeFact);
}

export async function resolveEffectiveMemoryFacts(args: {
  prisma: PrismaClient;
  scopes: MemoryFactScopeRef[];
  namespace?: string;
  keys?: string[];
}): Promise<{ facts: MemoryFactRecord[]; conflicts: MemoryFactConflict[] }> {
  const current = new Map<string, MemoryFactRecord>();
  const conflicts: MemoryFactConflict[] = [];

  for (const scope of args.scopes) {
    const facts = await listMemoryFacts({
      prisma: args.prisma,
      ownerId: scope.ownerId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      namespace: args.namespace,
      limit: 200,
    });
    for (const fact of facts) {
      if (args.keys && !args.keys.includes(fact.key)) continue;
      const key = `${fact.namespace}:${fact.key}`;
      const previous = current.get(key);
      if (previous && stableJson(previous.valueJson) !== stableJson(fact.valueJson)) {
        conflicts.push({
          namespace: fact.namespace,
          key: fact.key,
          overridden: previous,
          winner: fact,
        });
      }
      current.set(key, fact);
    }
  }

  return {
    facts: Array.from(current.values()).sort(
      (a, b) =>
        a.namespace.localeCompare(b.namespace) ||
        a.key.localeCompare(b.key) ||
        b.validFrom.localeCompare(a.validFrom),
    ),
    conflicts,
  };
}

export async function listSupersededMemoryFactEvents(args: {
  prisma: PrismaClient;
  scopes: MemoryFactScopeRef[];
  keys: Array<{ namespace: string; key: string }>;
  limit?: number;
}): Promise<MemoryFactEventRecord[]> {
  if (args.scopes.length === 0 || args.keys.length === 0) return [];
  await ensureMemoryFactTables(args.prisma);

  const params: unknown[] = [];
  const scopeClauses = args.scopes.map((scope) => {
    params.push(scope.ownerId, scope.scopeType, scope.scopeId);
    const i = params.length;
    return `("ownerId" = $${i - 2} AND "scopeType" = $${i - 1} AND COALESCE("scopeId", '') = COALESCE($${i}::text, ''))`;
  });
  const keyClauses = args.keys.map((key) => {
    params.push(key.namespace, key.key);
    const i = params.length;
    return `("namespace" = $${i - 1} AND "key" = $${i})`;
  });
  const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
  params.push(limit);

  const rows = await args.prisma.$queryRawUnsafe<RawMemoryFactEventRow[]>(
    `
      SELECT ${MEMORY_FACT_EVENT_COLUMNS}
      FROM "MemoryFactEvent"
      WHERE "eventType" = 'superseded'
        AND (${scopeClauses.join(' OR ')})
        AND (${keyClauses.join(' OR ')})
      ORDER BY "createdAt" DESC
      LIMIT $${params.length}
    `,
    ...params,
  );
  return rows.map(serializeEvent);
}
