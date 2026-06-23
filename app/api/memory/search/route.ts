import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { generateMemorySearchAnswer } from '@/lib/server/memory-search-answer';
import { planMemorySearchIntent } from '@/lib/server/memory-search-intent';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { buildLayeredMemoryRecallContext } from '@/features/memory/server/layered-memory-context';

const searchBodySchema = z.object({
  targetType: z.enum(['course', 'notebook']),
  targetId: z.string().min(1),
  query: z.string().min(1).max(2000),
  conversationId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/memory/search',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = searchBodySchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid memory search request', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const { model } = await resolveModelFromHeaders(request, {
          allowOpenAIModelOverride: true,
        });
        const intent = await planMemorySearchIntent({
          query: payload.data.query,
          model,
          targetType: payload.data.targetType,
        });
        const context = await buildLayeredMemoryRecallContext({
          targetType: payload.data.targetType,
          targetId: payload.data.targetId,
          userId: auth.userId,
          question: intent.rewrittenQuery || payload.data.query,
          conversationId: payload.data.conversationId ?? null,
          searchIntent: intent,
        });
        const answer = await generateMemorySearchAnswer({
          query: payload.data.query,
          context,
          model,
        });

        return NextResponse.json({
          storage: context.storage,
          answer,
          scope: context.scope,
          intent: context.searchIntent,
          prompt: context.prompt,
          readPlan: context.readPlan,
          layers: context.layers,
          staticFacts: context.staticFacts,
          platformMemories: context.platformMemories,
          directMemories: context.directMemories,
          semanticMatches: context.semanticMatches,
          knowledgeCache: context.knowledgeCache,
          knowledgeMatches: context.knowledgeMatches,
          sourceEvidence: context.sourceEvidence,
          learnerAnalytics: context.learnerAnalytics,
          conflicts: context.conflicts,
          filteredStaleMemoryIds: context.filteredStaleMemoryIds,
          counts: {
            direct: context.directCount,
            semantic: context.semanticCount,
            knowledgeCache: context.knowledgeCacheCount,
            knowledge: context.knowledgeCount,
            sourceEvidence: context.sourceEvidenceCount,
            learnerAnalytics: context.learnerAnalyticsCount,
          },
          vectorUsed: context.vectorUsed,
        });
      }),
    {
      operationCode: 'memory_search',
      chargeReason: '课程记忆 AI 搜索',
    },
  );
}
