import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { buildMemoryRecallContext } from '@/lib/server/study-memory-context';

const targetTypeSchema = z.enum(['course', 'notebook']);

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const url = new URL(request.url);
    const targetType = targetTypeSchema.safeParse(url.searchParams.get('targetType'));
    const targetId = url.searchParams.get('targetId')?.trim();
    const message = url.searchParams.get('message')?.trim() || '';
    const conversationId = url.searchParams.get('conversationId')?.trim() || null;

    if (!targetType.success || !targetId) {
      return NextResponse.json({ error: 'Invalid memory context target' }, { status: 400 });
    }

    const context = await buildMemoryRecallContext({
      targetType: targetType.data,
      targetId,
      userId: auth.userId,
      question: message,
      conversationId,
    });

    return NextResponse.json({
      storage: context.storage,
      prompt: context.prompt,
      staticFacts: context.staticFacts,
      directMemories: context.directMemories,
      semanticMatches: context.semanticMatches,
      knowledgeMatches: context.knowledgeMatches,
      conflicts: context.conflicts,
      filteredStaleMemoryIds: context.filteredStaleMemoryIds,
      counts: {
        direct: context.directCount,
        semantic: context.semanticCount,
        knowledge: context.knowledgeCount,
      },
      vectorUsed: context.vectorUsed,
    });
  });
}
