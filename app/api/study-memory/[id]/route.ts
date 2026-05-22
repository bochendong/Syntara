import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  deleteStudyMemory,
  updateStudyMemoryStatus,
  type StudyMemoryStatusValue,
} from '@/lib/server/study-memory-store';

const updateStudyMemorySchema = z.object({
  status: z.enum(['active', 'archived']),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ error: 'Database is not configured' }, { status: 503 });
    }

    const payload = updateStudyMemorySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const memory = await updateStudyMemoryStatus({
      prisma,
      userId: auth.userId,
      memoryId: id,
      status: payload.data.status as StudyMemoryStatusValue,
    });
    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }
    return NextResponse.json({ memory, storage: 'database' });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ error: 'Database is not configured' }, { status: 503 });
    }

    const { id } = await context.params;
    const deleted = await deleteStudyMemory({ prisma, userId: auth.userId, memoryId: id });
    if (!deleted) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, storage: 'database' });
  });
}
