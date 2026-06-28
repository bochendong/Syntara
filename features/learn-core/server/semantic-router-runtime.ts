import type { NextRequest } from 'next/server';

import type { LearnRunContext } from '../domain/types';
import { buildLearnSemanticRouterPrompt, parseLearnSemanticRouterOutput } from './semantic-router';

export function createRequestSemanticRouter(request: NextRequest) {
  return async (ctx: LearnRunContext) => {
    const [{ generateText }, { resolveModelFromHeaders }] = await Promise.all([
      import('ai'),
      import('@/lib/server/resolve-model'),
    ]);
    const { model } = await resolveModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    });
    const result = await generateText({
      model,
      temperature: 0,
      prompt: buildLearnSemanticRouterPrompt(ctx),
    });
    return parseLearnSemanticRouterOutput(result.text);
  };
}
