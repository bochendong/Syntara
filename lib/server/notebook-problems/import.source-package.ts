import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { ZodError } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';

import {
  cleanExtractedTextArtifacts,
  detectSourcePageRole,
  ProblemSourceImage,
  ProblemSourcePackage,
  ProblemSourcePage,
  renderPdfPagePreviewWithPdftoppm,
  titleFromSourceText,
} from './import.core';

export async function buildProblemSourcePackageFromPdfFile(args: {
  pdfBuffer: Buffer;
  fileName: string;
  scaffoldText?: string;
  includePageImages?: boolean;
}): Promise<ProblemSourcePackage> {
  const warnings: string[] = [];
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(args.pdfBuffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [];
  const sourcePages: ProblemSourcePage[] = Array.from({ length: pdf.numPages }, (_, index) => {
    const pageNumber = index + 1;
    const pageText = cleanExtractedTextArtifacts(pageTexts[index] || '');
    return {
      id: `page_${pageNumber}`,
      sourceIndex: pageNumber,
      pageNumber,
      sourceLabel: `Page ${pageNumber}`,
      title: titleFromSourceText(pageText, `Page ${pageNumber}`),
      text: pageText,
      charCount: pageText.length,
      roleHint: detectSourcePageRole(pageText, pageNumber),
    };
  });

  const sourceText =
    args.scaffoldText?.trim() ||
    sourcePages
      .map((page) => [`Page ${page.pageNumber}`, page.text].join('\n').trim())
      .filter(Boolean)
      .join('\n\n');

  const sourceImages: ProblemSourceImage[] = [];
  if (args.includePageImages !== false) {
    for (const page of sourcePages.slice(0, 12)) {
      try {
        const rendered = await renderPdfPagePreviewWithPdftoppm({
          pdfBuffer: args.pdfBuffer,
          pageNumber: page.pageNumber,
          width: 760,
        });
        if (
          (rendered.width && rendered.width < 240) ||
          (rendered.height && rendered.height < 240)
        ) {
          warnings.push(`Page ${page.pageNumber} visual preview skipped because it is too small.`);
          continue;
        }
        sourceImages.push({
          id: `page_image_${page.pageNumber}`,
          pageNumber: page.pageNumber,
          src: rendered.src,
          width: rendered.width,
          height: rendered.height,
          description: `Rendered preview for page ${page.pageNumber}`,
        });
      } catch (error) {
        warnings.push(
          `Page ${page.pageNumber} visual preview failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return {
    fileName: args.fileName,
    fileType: 'pdf',
    sourceText,
    sourcePages,
    sourceImages,
    pageCount: pdf.numPages,
    parser: 'unpdf-source-package',
    warnings,
    metadata: {
      sourceTextLength: sourceText.length,
      imageCount: sourceImages.length,
      generatedAt: Date.now(),
    },
  };
}
