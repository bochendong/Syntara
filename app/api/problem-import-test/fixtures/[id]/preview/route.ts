import { NextRequest, NextResponse } from 'next/server';
import { notebookProblemImportDraftSchema } from '@/lib/problem-bank';
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

type ImportMode = 'text' | 'pdf-llm';

function validateDrafts(drafts: unknown[]) {
  return drafts.map((draft) => notebookProblemImportDraftSchema.parse(draft));
}

function compactSourceMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const next = { ...meta };
  if (typeof next.rawBlock === 'string' && next.rawBlock.length > 1200) {
    next.rawBlock = `${next.rawBlock.slice(0, 1200).trim()}...`;
  }
  if (typeof next.raw === 'string' && next.raw.length > 1200) {
    next.raw = `${next.raw.slice(0, 1200).trim()}...`;
  } else if (next.raw && typeof next.raw === 'object') {
    delete next.raw;
  }
  return next;
}

async function readImportMode(req: NextRequest): Promise<ImportMode> {
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  return body.mode === 'pdf-llm' ? 'pdf-llm' : 'text';
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const importMode = await readImportMode(req);
    const { id } = await context.params;
    let modelWarning: string | null = null;
    let models: Awaited<ReturnType<typeof resolveProblemImportTestModels>> | null = null;
    try {
      models = await resolveProblemImportTestModels(req);
    } catch (error) {
      modelWarning =
        error instanceof Error
          ? error.message
          : 'Model is unavailable; heuristic extraction was used.';
    }

    if (!models) {
      return NextResponse.json({ error: modelWarning || 'Model unavailable' }, { status: 500 });
    }

    const skipCreditCharge = shouldSkipCreditChargeForProblemImportTest(req);
    const pipeline = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/preview',
        operationCode: 'problem_import_test_fixture_preview',
        chargeReason: 'PDF 导题测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge,
      },
      () =>
        buildFixtureQuality({
          fixtureId: id,
          textModel: models.textModel,
          pdfModel: importMode === 'pdf-llm' ? models.pdfModel : undefined,
          includePageImages: true,
        }),
    );

    const importedAt = Date.now();
    const drafts = validateDrafts(pipeline.draftResult.drafts).map((draft, index) => {
      const existingImportMode =
        typeof draft.sourceMeta.importMode === 'string' ? draft.sourceMeta.importMode : null;
      return {
        ...draft,
        sourceMeta: {
          ...compactSourceMeta(draft.sourceMeta),
          importMode: existingImportMode ?? (pipeline.draftResult.usage ? 'llm' : 'heuristic'),
          testRoute: '/problem-import-test',
          fixtureId: pipeline.fixture.id,
          fixtureKind: pipeline.fixture.kind,
          fileName: pipeline.fixture.fileName,
          fileSize: pipeline.fileSize,
          pageCount: pipeline.sourcePackage.pageCount,
          sourceTextLength: pipeline.sourcePackage.sourceText.length,
          importedAt,
          draftIndex: index,
        },
      };
    });
    const extractionMode = drafts.some((draft) => draft.sourceMeta.importMode === 'heuristic')
      ? 'heuristic'
      : importMode === 'pdf-llm'
        ? 'llm-file'
        : pipeline.draftResult.usage
          ? 'llm'
          : 'heuristic';

    return NextResponse.json({
      drafts,
      usage: pipeline.draftResult.usage,
      extractionMode,
      modelWarning,
      warnings: [
        ...pipeline.sourcePackage.warnings,
        ...pipeline.structurePlan.warnings,
        ...pipeline.draftResult.warnings,
      ],
      fixture: pipeline.fixture,
      sourcePackage: pipeline.sourcePackage,
      structurePlan: pipeline.structurePlan,
      draftResult: { ...pipeline.draftResult, drafts },
      qualityReport: pipeline.qualityReport,
      source: {
        fileName: pipeline.fixture.fileName,
        fileSize: pipeline.fileSize,
        pageCount: pipeline.sourcePackage.pageCount,
        textLength: pipeline.sourcePackage.sourceText.length,
      },
    });
  });
}
