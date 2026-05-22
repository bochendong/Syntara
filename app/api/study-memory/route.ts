import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDefaultCoursePublicMemories } from '@/lib/learning/default-public-memories';
import { requireUserId } from '@/lib/server/api-auth';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  createStudyMemory,
  listStudyMemories,
  resolveOwnedStudyMemoryTarget,
  type StudyMemoryRecord,
  type StudyMemoryScopeValue,
  type StudyMemoryTarget,
  type StudyMemoryTargetType,
} from '@/lib/server/study-memory-store';

const targetTypeSchema = z.enum(['course', 'notebook']);

const createStudyMemorySchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().trim().min(1),
  scope: z.enum(['public', 'private']).default('private'),
  kind: z.string().trim().min(1).max(40).default('manual'),
  source: z.string().trim().min(1).max(40).default('manual'),
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(12000),
  reason: z.string().trim().max(1000).optional(),
  question: z.string().trim().max(1000).optional(),
  sourceReferences: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

function unavailableResponse() {
  return NextResponse.json({ memories: [], storage: 'unavailable' });
}

async function seedDefaultCoursePublicMemories(args: {
  prisma: PrismaClient;
  userId: string;
  target: StudyMemoryTarget;
  memories: StudyMemoryRecord[];
}): Promise<StudyMemoryRecord[]> {
  if (args.target.targetType !== 'course' || !args.target.courseId) return args.memories;

  const course = await args.prisma.course.findFirst({
    where: { id: args.target.courseId, ownerId: args.userId },
    select: { id: true, name: true, courseCode: true, tags: true },
  });
  if (!course) return args.memories;

  const defaults = getDefaultCoursePublicMemories(course);
  if (defaults.length === 0) return args.memories;

  const existingPublicTitles = new Set(
    args.memories
      .filter((memory) => memory.scope === 'public')
      .map((memory) => memory.title.trim().toLowerCase()),
  );
  const created: StudyMemoryRecord[] = [];

  for (const memory of defaults) {
    const titleKey = memory.title.trim().toLowerCase();
    if (existingPublicTitles.has(titleKey)) continue;
    const record = await createStudyMemory({
      prisma: args.prisma,
      userId: args.userId,
      target: args.target,
      scope: memory.scope,
      kind: memory.kind,
      source: 'default-seed',
      title: memory.title,
      text: memory.text,
      sourceReferences: memory.sourceReferences,
      confidence: memory.confidence,
    });
    existingPublicTitles.add(titleKey);
    created.push(record);
  }

  return created.length > 0 ? [...created, ...args.memories] : args.memories;
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) return unavailableResponse();

    const url = new URL(request.url);
    const targetType = targetTypeSchema.safeParse(url.searchParams.get('targetType'));
    const targetId = url.searchParams.get('targetId')?.trim();
    if (!targetType.success || !targetId) {
      return NextResponse.json({ error: 'Invalid memory target' }, { status: 400 });
    }

    const target = await resolveOwnedStudyMemoryTarget(
      prisma,
      auth.userId,
      targetType.data as StudyMemoryTargetType,
      targetId,
    );
    if (!target) {
      return NextResponse.json({ error: 'Memory target not found' }, { status: 404 });
    }

    const memories = await seedDefaultCoursePublicMemories({
      prisma,
      userId: auth.userId,
      target,
      memories: await listStudyMemories(prisma, auth.userId, target),
    });
    return NextResponse.json({ memories, storage: 'database' });
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

    const payload = createStudyMemorySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const target = await resolveOwnedStudyMemoryTarget(
      prisma,
      auth.userId,
      payload.data.targetType,
      payload.data.targetId,
    );
    if (!target) {
      return NextResponse.json({ error: 'Memory target not found' }, { status: 404 });
    }

    const memory = await createStudyMemory({
      prisma,
      userId: auth.userId,
      target,
      scope: payload.data.scope as StudyMemoryScopeValue,
      kind: payload.data.kind,
      source: payload.data.source,
      title: payload.data.title,
      text: payload.data.text,
      reason: payload.data.reason,
      question: payload.data.question,
      sourceReferences: payload.data.sourceReferences,
      confidence: payload.data.confidence,
    });
    return NextResponse.json({ memory, storage: 'database' }, { status: 201 });
  });
}
