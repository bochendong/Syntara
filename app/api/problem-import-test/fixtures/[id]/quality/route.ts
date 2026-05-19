import { NextRequest, NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { withRequestContext } from '@/lib/server/request-context';
import {
  buildFixtureQuality,
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
      const result = await buildFixtureQuality({
        fixtureId: id,
        includePageImages: true,
      });
      return NextResponse.json(result);
    }

    const models = await resolveProblemImportTestModels(req);
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/quality',
        operationCode: 'problem_import_test_quality',
        chargeReason: 'PDF 导题质量测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge: shouldSkipCreditChargeForProblemImportTest(req),
      },
      () =>
        buildFixtureQuality({
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
