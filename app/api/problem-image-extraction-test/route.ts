import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { withRequestContext } from '@/lib/server/request-context';
import {
  buildProblemSourcePackageFromPdfFile,
  runDirectLlmProblemImportPipeline,
} from '@/lib/server/notebook-problems/import';
import {
  resolveProblemImportTestModels,
  shouldSkipCreditChargeForProblemImportTest,
} from '@/lib/server/problem-import-test-pipeline';
import { TESTFILE_ROOT } from '@/lib/server/project-paths';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GRAPH_TEST_FILE = 'testfile/GraphTest/2023-test2-mat133.pdf';

async function readGraphTestPdf() {
  const filePath = path.join(TESTFILE_ROOT, 'GraphTest', '2023-test2-mat133.pdf');
  const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
  return {
    buffer,
    fileSize: fileStat.size,
    fixture: {
      id: 'graph-test-mat133-2023-test2',
      fileName: path.basename(GRAPH_TEST_FILE),
      title: 'MAT133 Term Test 2 graph-heavy PDF',
      description: 'GraphTest 真实 PDF：唯一输入为 testfile/GraphTest/2023-test2-mat133.pdf。',
      kind: 'long-form' as const,
      fileType: 'pdf' as const,
      exists: true,
      fileSize: fileStat.size,
      updatedAt: fileStat.mtimeMs,
    },
  };
}

export async function POST(req: NextRequest) {
  return safeRoute(async () => {
    const generatedAt = Date.now();
    const [graphTestPdf, models] = await Promise.all([
      readGraphTestPdf(),
      resolveProblemImportTestModels(req),
    ]);

    const sourcePackage = await buildProblemSourcePackageFromPdfFile({
      pdfBuffer: graphTestPdf.buffer,
      fileName: graphTestPdf.fixture.fileName,
      includePageImages: true,
    });

    const pipeline = await withRequestContext(
      {
        route: '/api/problem-image-extraction-test',
        operationCode: 'problem_image_extraction_test_direct_llm',
        chargeReason: 'GraphTest 图像题 Direct LLM 测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge: shouldSkipCreditChargeForProblemImportTest(req),
      },
      () =>
        runDirectLlmProblemImportPipeline({
          pdfBuffer: graphTestPdf.buffer,
          fileName: graphTestPdf.fixture.fileName,
          source: 'pdf',
          language: 'zh-CN',
          model: models.pdfModel,
          sourcePackage,
          includePageImages: true,
          abortSignal: req.signal,
          timeoutMs: 260_000,
        }),
    );

    return NextResponse.json({
      generatedAt,
      fixture: graphTestPdf.fixture,
      fileSize: graphTestPdf.fileSize,
      pipelineMode: 'direct-llm',
      sourcePackage: pipeline.sourcePackage,
      structurePlan: pipeline.structurePlan,
      draftResult: pipeline.draftResult,
      drafts: pipeline.draftResult.drafts,
      qualityReport: pipeline.qualityReport,
      usage: pipeline.usage,
    });
  });
}
