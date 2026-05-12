import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';
import { notebookProblemImportDraftSchema } from '@/lib/problem-bank';
import {
  extractProblemDraftsFromPdfFile,
  extractProblemDraftsFromText,
} from '@/lib/server/notebook-problems/import';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { withRequestContext } from '@/lib/server/request-context';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TESTFILE_ROOT = path.join(process.cwd(), 'testfile');
const MAX_PDF_TEXT_CHARS = 120000;

type ImportMode = 'text' | 'pdf-llm';

const FIXTURES = {
  'final-exam-mc': {
    id: 'final-exam-mc',
    fileName: '2025_Final_Exam_MC.pdf',
    title: '选择题测试',
    kind: 'choice',
  },
  'final-exam-long': {
    id: 'final-exam-long',
    fileName: 'Final_Exam.pdf',
    title: '大题测试',
    kind: 'long-form',
  },
} as const;

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

async function parsePdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return {
    text: typeof text === 'string' ? text : '',
    pageCount: pdf.numPages,
  };
}

async function getPdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    return pdf.numPages;
  } catch {
    return null;
  }
}

async function readImportMode(req: NextRequest): Promise<ImportMode> {
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  return body.mode === 'pdf-llm' ? 'pdf-llm' : 'text';
}

function modelIdFromResolvedModelString(modelString: string): string {
  const separatorIndex = modelString.indexOf(':');
  return separatorIndex >= 0 ? modelString.slice(separatorIndex + 1) : modelString;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const importMode = await readImportMode(req);
    const { id } = await context.params;
    const fixture = FIXTURES[id as keyof typeof FIXTURES];
    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    const filePath = path.join(TESTFILE_ROOT, fixture.fileName);
    const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    const warnings: string[] = [];

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
    let pageCount: number | null = null;
    let sourceTextLength = 0;
    const result = await withRequestContext(
      {
        route: '/api/problem-import-test/fixtures/preview',
        operationCode: 'problem_import_test_fixture_preview',
        chargeReason: 'PDF 导题测试',
        serviceLabel: 'OpenAI',
        skipCreditCharge,
      },
      async () => {
        if (importMode === 'pdf-llm') {
          if (!resolvedModel?.model) {
            throw new Error(modelWarning || 'Model is unavailable; cannot run PDF LLM import.');
          }
          const parsed = await parsePdfText(buffer).catch(() => null);
          pageCount = parsed?.pageCount ?? (await getPdfPageCount(buffer));
          const scaffoldText = parsed?.text.trim().slice(0, MAX_PDF_TEXT_CHARS) ?? '';
          sourceTextLength = scaffoldText.length;
          const runtimeConfig = await getSystemLLMRuntimeConfig();
          const modelId = modelIdFromResolvedModelString(resolvedModel.modelString);
          const openai = createOpenAI({
            apiKey: resolvedModel.apiKey || runtimeConfig.apiKey,
            baseURL: runtimeConfig.baseUrl,
          });
          return extractProblemDraftsFromPdfFile({
            pdfBuffer: buffer,
            fileName: fixture.fileName,
            source: 'pdf',
            language: 'zh-CN',
            model: openai.responses(modelId) as unknown as LanguageModel,
            scaffoldText,
          });
        }

        const parsed = await parsePdfText(buffer);
        pageCount = parsed.pageCount;
        let text = parsed.text.trim();
        if (!text) {
          throw new Error('PDF 没有解析出可用于导题的文本');
        }
        if (text.length > MAX_PDF_TEXT_CHARS) {
          text = text.slice(0, MAX_PDF_TEXT_CHARS);
          warnings.push(`正文已截断至前 ${MAX_PDF_TEXT_CHARS} 字符`);
        }
        sourceTextLength = text.length;
        return extractProblemDraftsFromText({
          text,
          source: 'pdf',
          language: 'zh-CN',
          model: resolvedModel?.model,
        });
      },
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
          fixtureId: fixture.id,
          fixtureKind: fixture.kind,
          fileName: fixture.fileName,
          fileSize: fileStat.size,
          pageCount,
          sourceTextLength,
          importedAt,
          draftIndex: index,
        },
      };
    });
    const extractionMode = drafts.some((draft) => draft.sourceMeta.importMode === 'heuristic')
      ? 'heuristic'
      : importMode === 'pdf-llm'
        ? 'llm-file'
        : result.usage
          ? 'llm'
          : 'heuristic';

    return NextResponse.json({
      drafts,
      usage: result.usage,
      extractionMode,
      modelWarning,
      warnings,
      fixture,
      source: {
        fileName: fixture.fileName,
        fileSize: fileStat.size,
        pageCount,
        textLength: sourceTextLength,
      },
    });
  });
}
