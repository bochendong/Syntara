import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  decideTeachingTurn,
  learnTurnDecisionToResponse,
  learnTurnRequestSchema,
} from '@/features/learn-core';
import { createRequestSemanticRouter } from '@/features/learn-core/server/semantic-router-runtime';
import { prisma } from '@/lib/server/prisma';
import { searchLearnProblemBankForPractice } from '@/lib/server/problem-bank-practice-search';

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/learn/turn',
    () =>
      safeRoute(async () => {
        const auth = await requireUserId();
        if ('response' in auth) return auth.response;

        const payload = learnTurnRequestSchema.safeParse(await request.json());
        if (!payload.success) {
          return NextResponse.json(
            { error: 'Invalid learn turn request', details: payload.error.flatten() },
            { status: 400 },
          );
        }

        const parsed = await decideTeachingTurn(payload.data, {
          semanticRouter: createRequestSemanticRouter(request),
          searchProblemBank: ({ courseId, query, requestedCount }) =>
            searchLearnProblemBankForPractice({
              prisma,
              userId: auth.userId,
              courseId,
              query,
              requestedCount,
            }),
        });

        return NextResponse.json(learnTurnDecisionToResponse(parsed));
      }),
    {
      operationCode: 'learn_turn_runtime',
      chargeReason: '学习页回合规划',
    },
  );
}
