/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using Tavily search.
 */

import { type NextRequest } from 'next/server';
import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { assertUserHasCredits, chargeCreditsForWebSearch } from '@/lib/server/credits';
import { getRequestContext, runWithRequestContext } from '@/lib/server/request-context';

const log = createLogger('WebSearch');

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, '/api/web-search', async () => {
    try {
      const body = await req.json();
      const { query, apiKey: clientApiKey, usageContext } = body as {
        query?: string;
        apiKey?: string;
        usageContext?: {
          notebookId?: string;
          notebookName?: string;
          courseId?: string;
          courseName?: string;
          sceneId?: string;
          sceneTitle?: string;
          sceneOrder?: number;
          sceneType?: string;
          operationCode?: string;
          chargeReason?: string;
          serviceLabel?: string;
        };
      };

      if (!query || !query.trim()) {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
      }

      const apiKey = resolveWebSearchApiKey(clientApiKey);
      if (!apiKey) {
        return apiSuccess({
          answer: '',
          sources: [],
          context: '',
          query: query.trim(),
          responseTime: 0,
          skipped: true,
          reason: 'missing_api_key',
        });
      }

      await assertUserHasCredits(getRequestContext()?.userId);

      const result = await searchWithTavily({ query: query.trim(), apiKey });
      const context = formatSearchResultsAsContext(result);

      await chargeCreditsForWebSearch({
        userId: getRequestContext()?.userId,
        route: '/api/web-search',
        query: query.trim(),
        notebookId: usageContext?.notebookId,
        notebookName: usageContext?.notebookName,
        courseId: usageContext?.courseId,
        courseName: usageContext?.courseName,
        sceneId: usageContext?.sceneId,
        sceneTitle: usageContext?.sceneTitle,
        sceneOrder: usageContext?.sceneOrder,
        sceneType: usageContext?.sceneType,
        operationCode: usageContext?.operationCode || 'web_search',
        chargeReason: usageContext?.chargeReason || '联网搜索',
        serviceLabel: usageContext?.serviceLabel || 'Tavily Web Search',
      });

      return apiSuccess({
        answer: result.answer,
        sources: result.sources,
        context,
        query: result.query,
        responseTime: result.responseTime,
      });
    } catch (err) {
      log.error('[WebSearch] Error:', err);
      const message = err instanceof Error ? err.message : 'Web search failed';
      return apiError('INTERNAL_ERROR', 500, message);
    }
  });
}
