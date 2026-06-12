import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { backfillStudyMemoryVectorIndex } from '@/lib/server/study-memory-vector-store';

type VectorIndexStatsRow = {
  memoryCount: number;
  chunkCount: number;
  indexedMemoryCount: number;
};

type VectorIndexAvailabilityRow = {
  vectorAvailable: boolean;
  vectorInstalled: boolean;
  chunkTableExists: boolean;
};

function parseLimit(request: Request): number {
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get('limit') || 500);
  return Number.isFinite(raw) ? Math.max(1, Math.min(Math.floor(raw), 2000)) : 500;
}

export async function GET() {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, '数据库不可用，无法读取记忆索引状态');
  }

  const availabilityRows = await prisma.$queryRawUnsafe<VectorIndexAvailabilityRow[]>(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
      ) AS "vectorAvailable",
      EXISTS (
        SELECT 1 FROM pg_available_extensions
        WHERE name = 'vector' AND installed_version IS NOT NULL
      ) AS "vectorInstalled",
      to_regclass('public."StudyMemoryChunk"') IS NOT NULL AS "chunkTableExists"
  `);
  const availability = availabilityRows[0] || {
    vectorAvailable: false,
    vectorInstalled: false,
    chunkTableExists: false,
  };

  if (!availability.chunkTableExists) {
    const memoryRows = await prisma.$queryRawUnsafe<Array<{ memoryCount: number }>>(`
      SELECT COUNT(*)::int AS "memoryCount" FROM "StudyMemory" WHERE "status" = 'active'
    `);
    return apiSuccess({
      available: availability.vectorAvailable,
      vectorInstalled: availability.vectorInstalled,
      chunkTableExists: false,
      memoryCount: memoryRows[0]?.memoryCount || 0,
      chunkCount: 0,
      indexedMemoryCount: 0,
    });
  }

  const rows = await prisma.$queryRawUnsafe<VectorIndexStatsRow[]>(`
    SELECT
      (SELECT COUNT(*)::int FROM "StudyMemory" WHERE "status" = 'active') AS "memoryCount",
      (SELECT COUNT(*)::int FROM "StudyMemoryChunk") AS "chunkCount",
      (SELECT COUNT(DISTINCT "memoryId")::int FROM "StudyMemoryChunk") AS "indexedMemoryCount"
  `);
  const stats = rows[0] || { memoryCount: 0, chunkCount: 0, indexedMemoryCount: 0 };

  return apiSuccess({
    available: availability.vectorAvailable,
    vectorInstalled: availability.vectorInstalled,
    chunkTableExists: true,
    memoryCount: stats.memoryCount,
    chunkCount: stats.chunkCount,
    indexedMemoryCount: stats.indexedMemoryCount,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, '数据库不可用，无法重建记忆索引');
  }

  const result = await backfillStudyMemoryVectorIndex(prisma, { limit: parseLimit(request) });
  return apiSuccess({
    available: true,
    ...result,
  });
}
