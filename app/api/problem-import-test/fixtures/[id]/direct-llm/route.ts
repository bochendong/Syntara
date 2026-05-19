import { NextRequest, NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { withRequestContext } from '@/lib/server/request-context';
import {
  buildFixtureDirectLlmPipeline,
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
    const models = await resolveProblemImportTestModels(req);
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/direct-llm',
        operationCode: 'problem_import_test_direct_llm',
        chargeReason: 'PDF 导题 Direct LLM 测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge: shouldSkipCreditChargeForProblemImportTest(req),
      },
      () =>
        buildFixtureDirectLlmPipeline({
          fixtureId: id,
          pdfModel: models.pdfModel,
          includePageImages: true,
          abortSignal: req.signal,
        }),
    );
    return NextResponse.json({ ...result, pipelineMode: 'direct-llm' });
  });
}
