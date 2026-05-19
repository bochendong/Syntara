import { NextRequest, NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { withRequestContext } from '@/lib/server/request-context';
import {
  buildFixtureDrafts,
  resolveProblemImportTestModels,
  shouldSkipCreditChargeForProblemImportTest,
} from '@/lib/server/problem-import-test-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const { id } = await context.params;
    const useLlmDraftGeneration = req.nextUrl.searchParams.get('mode') === 'llm';
    if (!useLlmDraftGeneration) {
      const result = await buildFixtureDrafts({
        fixtureId: id,
        includePageImages: true,
      });
      return NextResponse.json(result);
    }

    const models = await resolveProblemImportTestModels(req);
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/drafts',
        operationCode: 'problem_import_test_drafts',
        chargeReason: 'PDF 导题 drafts 测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge: shouldSkipCreditChargeForProblemImportTest(req),
      },
      () =>
        buildFixtureDrafts({
          fixtureId: id,
          textModel: models.textModel,
          pdfModel: models.pdfModel,
          includePageImages: true,
          useLlmDraftGeneration,
        }),
    );
    return NextResponse.json(result);
  });
}
