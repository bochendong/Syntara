import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { toPrismaJson, toPrismaNullableJson } from '@/lib/server/prisma-json';
import { safeRoute } from '@/lib/server/json-error-response';

const createMessageSchema = z.object({
  role: z.string().trim().min(1).max(60),
  senderAgentId: z.string().trim().max(120).optional(),
  targetAgentId: z.string().trim().max(120).optional(),
  content: z.unknown(),
  plainText: z.string().trim().max(20000).optional(),
  meta: z.unknown().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id, ownerId: userId },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ messages });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = createMessageSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        ownerId: userId,
        role: payload.data.role,
        senderAgentId: payload.data.senderAgentId,
        targetAgentId: payload.data.targetAgentId,
        content: toPrismaJson(payload.data.content),
        plainText: payload.data.plainText,
        meta: toPrismaNullableJson(payload.data.meta),
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message }, { status: 201 });
  });
}
