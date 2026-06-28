import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { decideTeachingTurn } from '@/features/learn-core';
import {
  compatPlanningIntentInputToLearnTurnInput,
  compatPlanningIntentRequestSchema,
  planningDecisionToPlanningIntentResponse,
} from '@/features/learn-core/server/compat-planning-intent';
import { createRequestSemanticRouter } from '@/features/learn-core/server/semantic-router-runtime';

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/learn/planning-intent',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = compatPlanningIntentRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid planning intent request', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const decision = await decideTeachingTurn(
          compatPlanningIntentInputToLearnTurnInput(payload.data),
          {
            semanticRouter: createRequestSemanticRouter(request),
          },
        );
        const parsed = planningDecisionToPlanningIntentResponse(decision);

        return NextResponse.json({
          ...parsed,
          trace: decision.trace,
        });
      }),
    {
      operationCode: 'learn_planning_intent',
      chargeReason: '学习计划意图判断',
    },
  );
}
