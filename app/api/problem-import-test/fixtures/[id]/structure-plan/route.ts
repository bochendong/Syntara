import { NextRequest, NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { withRequestContext } from '@/lib/server/request-context';
import {
  buildFixtureStructurePlan,
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
    const useLlmStructurePlan = req.nextUrl.searchParams.get('mode') === 'llm';
    if (!useLlmStructurePlan) {
      const result = await buildFixtureStructurePlan({
        fixtureId: id,
        includePageImages: true,
        abortSignal: req.signal,
      });
      return NextResponse.json(result);
    }

    const models = await resolveProblemImportTestModels(req);
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/structure-plan',
        operationCode: 'problem_import_test_structure_plan',
        chargeReason: 'PDF 导题结构计划测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge: shouldSkipCreditChargeForProblemImportTest(req),
      },
      () =>
        buildFixtureStructurePlan({
          fixtureId: id,
          model: models.textModel,
          includePageImages: true,
          abortSignal: req.signal,
          useLlmStructurePlan,
        }),
    );
    return NextResponse.json(result);
  });
}
