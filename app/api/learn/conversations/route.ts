import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { findCourseAccessRole } from '@/lib/server/repositories/course-enrollment-repository';

const LEARN_CONVERSATION_TARGET_PREFIX = 'learn:';
const MAX_SYNCED_MESSAGES = 120;

type LearnConversationRow = {
  id: string;
  title: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type LearnMessageContent = {
  text?: unknown;
  plan?: unknown;
  progressProposal?: unknown;
  pendingAction?: unknown;
  lecturePrompt?: unknown;
  lectureDeck?: unknown;
  attachments?: unknown;
};

type LearnMessageRow = {
  id: string;
  role: string;
  content: LearnMessageContent | null;
  plainText: string | null;
  meta: unknown;
  createdAt: Date | string;
};

const learnMessageSchema = z.object({
  id: z.string().trim().min(1).max(160),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(40000).default(''),
  createdAt: z.number().finite().optional(),
  plan: z.unknown().optional(),
  progressProposal: z.unknown().optional(),
  pendingAction: z.unknown().optional(),
  lecturePrompt: z.unknown().optional(),
  lectureDeck: z.unknown().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().finite().optional(),
        width: z.number().finite().optional(),
        height: z.number().finite().optional(),
      }),
    )
    .optional(),
});

const syncLearnConversationSchema = z.object({
  courseId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).max(160),
  title: z.string().trim().max(200).optional(),
  messages: z.array(learnMessageSchema).max(MAX_SYNCED_MESSAGES).default([]),
});

let ensureLearnConversationDbPromise: Promise<void> | null = null;

async function ensureLearnConversationDb(prisma: PrismaClient) {
  ensureLearnConversationDbPromise ??= (async () => {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ConversationKind" ADD VALUE IF NOT EXISTS 'course'`,
    );
  })();
  await ensureLearnConversationDbPromise;
}

function learnTargetId(sessionId: string) {
  return `${LEARN_CONVERSATION_TARGET_PREFIX}${sessionId}`;
}

function sessionIdFromTargetId(targetId: string | null): string {
  if (!targetId?.startsWith(LEARN_CONVERSATION_TARGET_PREFIX)) return 'default';
  return targetId.slice(LEARN_CONVERSATION_TARGET_PREFIX.length) || 'default';
}

function timestamp(value: Date | string): number {
  return new Date(value).getTime();
}

function makeDbId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function plainTextFromMessage(message: z.infer<typeof learnMessageSchema>) {
  const suffix = message.attachments?.length ? `\n[附件 ${message.attachments.length} 个]` : '';
  return `${message.text || ''}${suffix}`.trim();
}

function contentFromMessage(message: z.infer<typeof learnMessageSchema>) {
  return {
    type: 'learn_message',
    text: message.text,
    plan: message.plan ?? null,
    progressProposal: message.progressProposal ?? null,
    pendingAction: message.pendingAction ?? null,
    lecturePrompt: message.lecturePrompt ?? null,
    lectureDeck: message.lectureDeck ?? null,
    attachments: message.attachments ?? [],
  };
}

function messageFromRow(row: LearnMessageRow) {
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    text:
      typeof row.content?.text === 'string'
        ? row.content.text
        : typeof row.plainText === 'string'
          ? row.plainText
          : '',
    createdAt: timestamp(row.createdAt),
    plan: row.content?.plan ?? undefined,
    progressProposal: row.content?.progressProposal ?? undefined,
    pendingAction: row.content?.pendingAction ?? undefined,
    lecturePrompt: row.content?.lecturePrompt ?? undefined,
    lectureDeck: row.content?.lectureDeck ?? undefined,
    attachments: Array.isArray(row.content?.attachments) ? row.content.attachments : undefined,
  };
}

function sessionFromRow(row: LearnConversationRow) {
  const sessionId = sessionIdFromTargetId(row.targetId);
  return {
    id: sessionId,
    conversationId: row.id,
    title: row.title?.trim() || '新对话',
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

async function requireCourseAccess(prisma: PrismaClient, userId: string, courseId: string) {
  const access = await findCourseAccessRole(prisma, userId, courseId);
  if (!access) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return null;
}

async function findLearnConversation(
  prisma: PrismaClient,
  args: { userId: string; courseId: string; sessionId: string },
) {
  const rows = await prisma.$queryRawUnsafe<LearnConversationRow[]>(
    `
      SELECT "id", "title", "targetId", "meta", "createdAt", "updatedAt"
      FROM "Conversation"
      WHERE "ownerId" = $1
        AND "courseId" = $2
        AND "targetId" = $3
        AND "kind"::text = 'course'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    args.userId,
    args.courseId,
    learnTargetId(args.sessionId),
  );
  return rows[0] ?? null;
}

async function listLearnConversations(
  prisma: PrismaClient,
  args: { userId: string; courseId: string },
) {
  return prisma.$queryRawUnsafe<LearnConversationRow[]>(
    `
      SELECT "id", "title", "targetId", "meta", "createdAt", "updatedAt"
      FROM "Conversation"
      WHERE "ownerId" = $1
        AND "courseId" = $2
        AND "kind"::text = 'course'
        AND "targetId" LIKE '${LEARN_CONVERSATION_TARGET_PREFIX}%'
      ORDER BY "updatedAt" DESC
      LIMIT 24
    `,
    args.userId,
    args.courseId,
  );
}

async function upsertLearnConversation(
  prisma: PrismaClient,
  args: { userId: string; courseId: string; sessionId: string; title: string },
) {
  const existing = await findLearnConversation(prisma, args);
  const meta = {
    source: 'learn',
    sessionId: args.sessionId,
  };
  if (existing) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE "Conversation"
        SET "title" = $1,
            "meta" = CAST($2 AS JSONB),
            "updatedAt" = NOW()
        WHERE "id" = $3 AND "ownerId" = $4
      `,
      args.title,
      JSON.stringify(meta),
      existing.id,
      args.userId,
    );
    return {
      ...existing,
      title: args.title,
      meta,
      updatedAt: new Date(),
    };
  }

  const id = makeDbId('learn_conversation');
  const rows = await prisma.$queryRawUnsafe<LearnConversationRow[]>(
    `
      INSERT INTO "Conversation" (
        "id", "ownerId", "courseId", "kind", "targetId", "title", "meta", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, 'course', $4, $5, CAST($6 AS JSONB), NOW(), NOW())
      RETURNING "id", "title", "targetId", "meta", "createdAt", "updatedAt"
    `,
    id,
    args.userId,
    args.courseId,
    learnTargetId(args.sessionId),
    args.title,
    JSON.stringify(meta),
  );
  return rows[0];
}

async function replaceLearnMessages(
  prisma: PrismaClient,
  args: {
    conversationId: string;
    userId: string;
    courseId: string;
    sessionId: string;
    messages: Array<z.infer<typeof learnMessageSchema>>;
  },
) {
  const messages = args.messages.slice(-MAX_SYNCED_MESSAGES);
  const ids = messages.map((message) => message.id);
  await prisma.message.deleteMany({
    where: {
      conversationId: args.conversationId,
      ownerId: args.userId,
      ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
    },
  });

  for (const message of messages) {
    const content = contentFromMessage(message);
    const meta = {
      source: 'learn',
      courseId: args.courseId,
      sessionId: args.sessionId,
      clientCreatedAt: message.createdAt ?? null,
    };
    const plainText = plainTextFromMessage(message);
    const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
    await prisma.message.upsert({
      where: { id: message.id },
      update: {
        role: message.role,
        content: toPrismaJson(content),
        plainText,
        meta: toPrismaNullableJson(meta),
      },
      create: {
        id: message.id,
        conversationId: args.conversationId,
        ownerId: args.userId,
        role: message.role,
        content: toPrismaJson(content),
        plainText,
        meta: toPrismaNullableJson(meta),
        createdAt,
      },
    });
  }
}

async function loadMessages(prisma: PrismaClient, conversationId: string, userId: string) {
  const rows = await prisma.message.findMany({
    where: { conversationId, ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      plainText: true,
      meta: true,
      createdAt: true,
    },
  });
  return rows.map((row) =>
    messageFromRow({
      ...row,
      content: row.content as LearnMessageContent | null,
    }),
  );
}

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ storage: 'unavailable', sessions: [] });
    }

    await ensureLearnConversationDb(prisma);
    const { userId } = auth;
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim();
    const sessionId = searchParams.get('sessionId')?.trim();
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

    const accessError = await requireCourseAccess(prisma, userId, courseId);
    if (accessError) return accessError;

    if (sessionId) {
      const conversation = await findLearnConversation(prisma, { userId, courseId, sessionId });
      if (!conversation) {
        return NextResponse.json({ storage: 'database', session: null, messages: [] });
      }
      const messages = await loadMessages(prisma, conversation.id, userId);
      return NextResponse.json({
        storage: 'database',
        session: sessionFromRow(conversation),
        messages,
      });
    }

    const sessions = await listLearnConversations(prisma, { userId, courseId });
    return NextResponse.json({
      storage: 'database',
      sessions: sessions.map(sessionFromRow),
    });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ storage: 'unavailable', ok: false });
    }

    await ensureLearnConversationDb(prisma);
    const payload = syncLearnConversationSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { userId } = auth;
    const { courseId, sessionId, messages } = payload.data;
    const accessError = await requireCourseAccess(prisma, userId, courseId);
    if (accessError) return accessError;

    const title = payload.data.title?.trim() || '新对话';
    const conversation = await upsertLearnConversation(prisma, {
      userId,
      courseId,
      sessionId,
      title,
    });
    await replaceLearnMessages(prisma, {
      conversationId: conversation.id,
      userId,
      courseId,
      sessionId,
      messages,
    });

    return NextResponse.json({
      storage: 'database',
      ok: true,
      session: sessionFromRow(conversation),
    });
  });
}
