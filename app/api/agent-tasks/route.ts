import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';

const createTaskSchema = z.object({
  courseId: z.string().trim().min(1).optional(),
  notebookId: z.string().trim().min(1).optional(),
  sourceAgentId: z.string().trim().max(120).optional(),
  targetAgentId: z.string().trim().max(120).optional(),
  taskType: z.string().trim().min(1).max(120),
  status: z.enum(['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled']).optional(),
  request: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.string().trim().max(4000).optional(),
});

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim();
    const notebookId = searchParams.get('notebookId')?.trim();

    const tasks = await prisma.agentTask.findMany({
      where: {
        ownerId: userId,
        ...(courseId ? { courseId } : {}),
        ...(notebookId ? { notebookId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ tasks });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const payload = createTaskSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const task = await prisma.agentTask.create({
      data: {
        ownerId: userId,
        courseId: payload.data.courseId,
        notebookId: payload.data.notebookId,
        sourceAgentId: payload.data.sourceAgentId,
        targetAgentId: payload.data.targetAgentId,
        taskType: payload.data.taskType,
        status: payload.data.status,
        request: toPrismaNullableJson(payload.data.request),
        result: toPrismaNullableJson(payload.data.result),
        error: payload.data.error,
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  });
}
