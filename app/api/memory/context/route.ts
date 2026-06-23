import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { planMemorySearchIntent } from '@/lib/server/memory-search-intent';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { buildLayeredMemoryRecallContext } from '@/features/memory/server/layered-memory-context';

const targetTypeSchema = z.enum(['course', 'notebook']);

export async function GET(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/memory/context',
    () =>
      safeRoute(async () => {
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

        const resolvedModel = message
          ? await resolveModelFromHeaders(request, { allowOpenAIModelOverride: true })
          : null;
        const intent = resolvedModel
          ? await planMemorySearchIntent({
              query: message,
              model: resolvedModel.model,
              targetType: targetType.data,
            })
          : undefined;
        const context = await buildLayeredMemoryRecallContext({
          targetType: targetType.data,
          targetId,
          userId: auth.userId,
          question: intent?.rewrittenQuery || message,
          conversationId,
          searchIntent: intent,
        });

        return NextResponse.json({
          storage: context.storage,
          prompt: context.prompt,
          readPlan: context.readPlan,
          layers: context.layers,
          scope: context.scope,
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
          searchIntent: context.searchIntent,
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
      operationCode: 'memory_context',
      chargeReason: '聊天记忆上下文搜索',
    },
  );
}
