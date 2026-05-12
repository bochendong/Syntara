import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { notebookProblemImportDraftSchema } from '@/lib/problem-bank';
import { extractProblemDraftsFromText } from '@/lib/server/notebook-problems/import';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { withRequestContext } from '@/lib/server/request-context';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const previewSchema = z.object({
  text: z.string().trim().min(1).max(120000),
  source: z.enum(['pdf', 'manual', 'chat']).default('pdf'),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  fileName: z.string().trim().max(240).optional(),
  fileSize: z.number().int().min(0).optional(),
  pageCount: z.number().int().min(0).optional(),
});

function shouldSkipCreditChargeForTestRequest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;

  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

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

export async function POST(req: NextRequest) {
  return safeRoute(async () => {
    const payload = previewSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    let resolvedModel: Awaited<ReturnType<typeof resolveModelFromHeaders>> | null = null;
    let modelWarning: string | null = null;
    try {
      resolvedModel = await resolveModelFromHeaders(req, {
        allowOpenAIModelOverride: true,
      });
    } catch (error) {
      modelWarning =
        error instanceof Error
          ? error.message
          : 'Model is unavailable; heuristic extraction was used.';
    }

    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/preview',
        operationCode: 'problem_import_test_preview',
        chargeReason: 'PDF 导题测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge,
      },
      () =>
        extractProblemDraftsFromText({
          text: payload.data.text,
          source: payload.data.source,
          language: payload.data.language,
          model: resolvedModel?.model,
        }),
    );

    const importedAt = Date.now();
    const drafts = validateDrafts(result.drafts).map((draft, index) => {
      const existingImportMode =
        typeof draft.sourceMeta.importMode === 'string' ? draft.sourceMeta.importMode : null;
      return {
        ...draft,
        sourceMeta: {
          ...compactSourceMeta(draft.sourceMeta),
          importMode: existingImportMode ?? (result.usage ? 'llm' : 'heuristic'),
          testRoute: '/problem-import-test',
          fileName: payload.data.fileName,
          fileSize: payload.data.fileSize,
          pageCount: payload.data.pageCount,
          sourceTextLength: payload.data.text.length,
          importedAt,
          draftIndex: index,
        },
      };
    });
    const extractionMode = drafts.some((draft) => draft.sourceMeta.importMode === 'heuristic')
      ? 'heuristic'
      : result.usage
        ? 'llm'
        : 'heuristic';

    return NextResponse.json({
      drafts,
      usage: result.usage,
      extractionMode,
      modelWarning,
      source: {
        fileName: payload.data.fileName ?? null,
        fileSize: payload.data.fileSize ?? null,
        pageCount: payload.data.pageCount ?? null,
        textLength: payload.data.text.length,
      },
    });
  });
}
