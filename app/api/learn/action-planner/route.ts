import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { decideTeachingTurn } from '@/features/learn-core';
import {
  compatActionPlannerInputToLearnTurnInput,
  compatActionPlannerRequestSchema,
} from '@/features/learn-core/server/compat-action-planner';
import { createRequestSemanticRouter } from '@/features/learn-core/server/semantic-router-runtime';

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/learn/action-planner',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = compatActionPlannerRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid action planner request', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const decision = await decideTeachingTurn(
          compatActionPlannerInputToLearnTurnInput(payload.data),
          {
            semanticRouter: createRequestSemanticRouter(request),
          },
        );

        return NextResponse.json({
          replyText: decision.replyText,
          directCalls: decision.directCalls,
          proposals: decision.proposals,
          artifacts: decision.artifacts,
          reason: decision.reason,
          confidence: decision.confidence,
          trace: decision.trace,
        });
      }),
    {
      operationCode: 'learn_action_planner',
      chargeReason: '学习工具动作规划',
    },
  );
}
