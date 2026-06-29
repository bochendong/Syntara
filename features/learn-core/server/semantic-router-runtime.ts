import type { NextRequest } from 'next/server';

import type { LearnRunContext } from '../domain/types';
import {
  buildLearnSemanticRouterPrompt,
  learnSemanticRouterOutputSchema,
  learnSemanticRouterStructuredOutputSchema,
} from './semantic-router';

export function createRequestSemanticRouter(request: NextRequest) {
  return async (ctx: LearnRunContext) => {
    const [{ generateObject }, { resolveModelFromHeaders }] = await Promise.all([
      import('ai'),
      import('@/lib/server/resolve-model'),
    ]);
    const { model } = await resolveModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    });
    const result = await generateObject({
      model,
      temperature: 0,
      prompt: buildLearnSemanticRouterPrompt(ctx),
      schema: learnSemanticRouterStructuredOutputSchema,
      schemaName: 'LearnSemanticRouterOutput',
      schemaDescription:
        'Typed routing decision for a learning chat turn. Choose actions/artifacts; do not answer course content directly unless the schema asks for a transition reply.',
    });
    return learnSemanticRouterOutputSchema.parse(result.object);
  };
}
