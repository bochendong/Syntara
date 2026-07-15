import { NextRequest, NextResponse } from 'next/server';
import { publicApiRequestId, publicApiSuccess, requirePublicApi } from '@/lib/server/public-api';

export async function GET(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  return publicApiSuccess(requestId, {
    object: 'api_capability_list',
    version: 'v1',
    documentation: 'repository:docs/api/phase-1-public-api.md',
    openapi: '/openapi-v1.yaml',
    capabilities: [
      { id: 'cheat_sheet', method: 'POST', path: '/api/v1/cheat-sheets' },
      { id: 'structured_note', method: 'POST', path: '/api/v1/structured-notes' },
      { id: 'calendar_import', method: 'POST', path: '/api/v1/calendars/import' },
      { id: 'calendar_command', method: 'POST', path: '/api/v1/calendars/commands' },
      { id: 'question_set', method: 'POST', path: '/api/v1/question-sets' },
      { id: 'text_explanation', method: 'POST', path: '/api/v1/explanations/text' },
      { id: 'slide_explanation', method: 'POST', path: '/api/v1/explanations/slides' },
      { id: 'review_plan', method: 'POST', path: '/api/v1/review-plans' },
    ],
  });
}
