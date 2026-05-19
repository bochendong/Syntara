import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { ZodError } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemImageAsset,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';

import {
  buildProblemImportSystemPrompt,
  directLlmProblemImportPrompt,
  directLlmStructurePlanFromDrafts,
  heuristicExtractProblemDrafts,
  ImportUsageSummary,
  isLikelyPdfInstructionDraft,
  isStandaloneSubpartMarker,
  llmExtractProblemDrafts,
  llmUsageFromResult,
  looksLikeSingleProblemInput,
  mergeImportUsage,
  normalizeCandidateDraft,
  parseDirectProblemImportResultFromLLMText,
  parseProblemDraftArrayFromLLMText,
  postProcessPdfFileDrafts,
  ProblemDraftGenerationResult,
  ProblemImportPipelineResult,
  ProblemImportQualityCheck,
  ProblemImportQualityReport,
  ProblemSourceImage,
  ProblemSourcePackage,
  problemStemFormattingContract,
  problemStemText,
  ProblemStructurePlan,
  solveMissingChoiceAnswersWithLLM,
  STANDALONE_SUBPART_MARKER_RE,
  trimPdfScaffoldTextToProblemRegion,
  withCoverageFallbackDrafts,
  withDirectLlmSourceMeta,
  withPdfFileSourceMeta,
  withScaffoldSubpartCoverage,
} from './import.core';
import { buildProblemSourcePackageFromPdfFile } from './import.source-package';
import {
  buildCoverageScaffoldFromStructurePlan,
  buildProblemStructurePlan,
  enrichDraftsWithStructurePlan,
} from './import.structure-plan';

export function sourceMetaRecord(draft: NotebookProblemImportDraft): Record<string, unknown> {
  return draft.sourceMeta && typeof draft.sourceMeta === 'object'
    ? (draft.sourceMeta as Record<string, unknown>)
    : {};
}

export function structureRecordFromDraft(
  draft: NotebookProblemImportDraft,
): Record<string, unknown> {
  const structure = sourceMetaRecord(draft).structure;
  return structure && typeof structure === 'object' && !Array.isArray(structure)
    ? (structure as Record<string, unknown>)
    : {};
}

export function pageNumbersForDraft(draft: NotebookProblemImportDraft): number[] {
  const pages = new Set<number>();
  const meta = sourceMetaRecord(draft);
  const structure = structureRecordFromDraft(draft);
  const anchors = [
    ...(Array.isArray(meta.anchors) ? meta.anchors : []),
    ...(Array.isArray(structure.sourceAnchors) ? structure.sourceAnchors : []),
  ];
  for (const anchor of anchors) {
    if (!anchor || typeof anchor !== 'object') continue;
    const pageNumber = (anchor as { pageNumber?: unknown }).pageNumber;
    if (typeof pageNumber === 'number' && Number.isFinite(pageNumber) && pageNumber > 0) {
      pages.add(Math.trunc(pageNumber));
    }
  }
  for (const key of ['pageStart', 'pageEnd'] as const) {
    const value = structure[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      pages.add(Math.trunc(value));
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function draftMentionsVisualContent(draft: NotebookProblemImportDraft): boolean {
  const structure = structureRecordFromDraft(draft);
  const visualRefs = Array.isArray(structure.visualRefs) ? structure.visualRefs : [];
  if (visualRefs.some((ref) => typeof ref === 'string' && ref.trim())) return true;
  const contextBlocks = Array.isArray(structure.contextBlocks) ? structure.contextBlocks : [];
  if (
    contextBlocks.some((block) => {
      if (!block || typeof block !== 'object') return false;
      const kind = String((block as { kind?: unknown }).kind || '');
      return /diagram|figure|graph|image|chart|table|图|表/.test(kind);
    })
  ) {
    return true;
  }
  return /(?:figure|fig\.|diagram|graph|chart|image|plot|curve|table|图|表|函数图像|曲线)/i.test(
    problemStemText(draft),
  );
}

export function imageAssetFromSourceImage(
  image: ProblemSourceImage,
): NotebookProblemImageAsset | null {
  if (!image.src?.trim()) return null;
  return {
    id: `asset_${image.id}`,
    src: image.src,
    alt: image.description || `Source image from page ${image.pageNumber}`,
    caption: image.description || `Source page ${image.pageNumber} visual`,
    sourceImageId: image.id,
    pageNumber: image.pageNumber,
    width: image.width,
    height: image.height,
    role: 'question',
  };
}

export function attachSourceImagesToDrafts(
  drafts: NotebookProblemImportDraft[],
  sourcePackage: ProblemSourcePackage,
): NotebookProblemImportDraft[] {
  if (!sourcePackage.sourceImages.length) return drafts;
  return drafts.map((draft) => {
    const existingImages = draft.publicContent.assets?.images || [];
    if (existingImages.length > 0 || !draftMentionsVisualContent(draft)) return draft;
    const pageNumbers = pageNumbersForDraft(draft);
    const candidateImages = sourcePackage.sourceImages.filter((image) =>
      pageNumbers.length ? pageNumbers.includes(image.pageNumber) : true,
    );
    const images = candidateImages
      .map(imageAssetFromSourceImage)
      .filter((image): image is NotebookProblemImageAsset => Boolean(image))
      .slice(0, 3);
    if (!images.length) return draft;
    return notebookProblemImportDraftSchema.parse({
      ...draft,
      publicContent: {
        ...draft.publicContent,
        assets: {
          ...(draft.publicContent.assets || {}),
          images,
        },
      },
      sourceMeta: {
        ...draft.sourceMeta,
        attachedSourceImageIds: images.map((image) => image.sourceImageId),
      },
    });
  });
}

export async function generateProblemDraftsFromPdfWithStructurePlan(args: {
  pdfBuffer: Buffer;
  fileName: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model: LanguageModel;
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
}): Promise<ProblemDraftGenerationResult> {
  const scaffoldDrafts = buildCoverageScaffoldFromStructurePlan(args.structurePlan, args.source);
  const coverageScaffold = JSON.stringify(
    args.structurePlan.topLevelProblems.map((problem) => ({
      index: problem.index,
      topLevelLabel: problem.topLevelLabel,
      title: problem.title,
      problemTypeHint: problem.problemTypeHint,
      subparts: problem.subparts,
      contextBlocks: problem.contextBlocks,
      sourceAnchors: problem.sourceAnchors,
    })),
  ).slice(0, 18000);
  const system = buildProblemImportSystemPrompt(args.language);
  const structureContract = problemStemFormattingContract(args.language);
  const instruction =
    args.language === 'zh-CN'
      ? `请基于“结构计划”和附加 PDF 生成 NotebookProblemImportDraft JSON 数组。

这一步只负责把每个顶层题目重写成题库题面，不要重新决定题目数量。

硬性要求：
- 必须输出正好 ${args.structurePlan.topLevelProblems.length} 道题，顺序和结构计划一致。
- 每道题 sourceMeta.scaffoldIndex 必须等于结构计划 index。
- 每道题 sourceMeta.structure 必须简短保留对应结构计划条目，sourceMeta.anchors 保留 sourceAnchors。
- 图像题必须保留 structure.visualRefs 和页码锚点；不要伪造图片 URL，系统会把对应 sourceImages 挂到 publicContent.assets.images。
- publicContent.stem 必须是学生可见题面，不是 OCR dump；必须可独立作答。
- 使用结构计划的 contextBlocks/subparts/sourceAnchors，但最终题干仍以 PDF 视觉内容为准。
- 不要输出封面、考试说明、答题卡说明、additional work。
- 非选择题不要生成参考答案；选择题如果没有答案表，可以根据题干和选项推断答案并标记 sourceMeta.answerSource。

${structureContract}

结构计划：
${coverageScaffold}`
      : `Generate a NotebookProblemImportDraft JSON array from the structure plan and attached PDF.

This stage rewrites each top-level problem into a problem-bank stem. Do not decide a new problem count.

Hard requirements:
- Return exactly ${args.structurePlan.topLevelProblems.length} problems in the same order as the structure plan.
- Each item sourceMeta.scaffoldIndex must equal the structure plan index.
- Each item sourceMeta.structure must briefly keep the matching structure item, and sourceMeta.anchors must keep sourceAnchors.
- Image/graph/diagram problems must preserve structure.visualRefs and page anchors. Do not invent image URLs; the system will attach matching sourceImages to publicContent.assets.images.
- publicContent.stem must be a student-facing statement, not an OCR dump, and must be independently answerable.
- Use contextBlocks/subparts/sourceAnchors from the plan, but the final stem should still follow the visible PDF.
- Ignore covers, exam instructions, answer-sheet directions, and additional-work pages.
- Do not generate reference answers for non-choice problems; for choice problems without an answer key, solve from stem/options and mark sourceMeta.answerSource when inferred.

${structureContract}

Structure plan:
${coverageScaffold}`;

  const result = await callLLM(
    {
      model: args.model,
      system,
      maxOutputTokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            {
              type: 'file',
              data: args.pdfBuffer,
              mediaType: 'application/pdf',
              filename: args.fileName,
            },
          ],
        },
      ],
    },
    'problem-bank-import-draft-generation',
  );

  const parsed = parseProblemDraftArrayFromLLMText(result.text);
  const llmDrafts = postProcessPdfFileDrafts(
    parsed.map((item) => withPdfFileSourceMeta(normalizeCandidateDraft(item, args.source))),
  );
  const drafts = attachSourceImagesToDrafts(
    enrichDraftsWithStructurePlan(
      withCoverageFallbackDrafts({
        scaffoldDrafts,
        llmDrafts: withScaffoldSubpartCoverage({ scaffoldDrafts, llmDrafts }),
      }),
      args.structurePlan,
    ),
    args.sourcePackage,
  );
  const answerResult = await solveMissingChoiceAnswersWithLLM({
    drafts,
    model: args.model,
    language: args.language,
  });
  const usage = mergeImportUsage(
    llmUsageFromResult({
      model: args.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cachedInputTokens: result.usage.cachedInputTokens ?? 0,
    }),
    answerResult.usage,
  );
  return {
    drafts: answerResult.drafts,
    usage,
    warnings: [],
  };
}

export async function runDirectLlmProblemImportPipeline(args: {
  pdfBuffer: Buffer;
  fileName: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model: LanguageModel;
  sourcePackage?: ProblemSourcePackage;
  scaffoldText?: string;
  includePageImages?: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ProblemImportPipelineResult> {
  const sourcePackage =
    args.sourcePackage ||
    (await buildProblemSourcePackageFromPdfFile({
      pdfBuffer: args.pdfBuffer,
      fileName: args.fileName,
      scaffoldText: args.scaffoldText,
      includePageImages: args.includePageImages,
    }));

  const result = await callLLM(
    {
      model: args.model,
      system:
        args.language === 'zh-CN'
          ? '你是大学课程题库导入专家。你直接阅读 PDF 视觉内容，识别题目边界并输出严格 JSON。'
          : 'You are an expert university problem-bank importer. Read the PDF visually, identify problem boundaries, and return strict JSON.',
      maxOutputTokens: 24000,
      timeout: args.timeoutMs,
      abortSignal: args.abortSignal,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: directLlmProblemImportPrompt({
                sourcePackage,
                language: args.language,
              }),
            },
            {
              type: 'file',
              data: args.pdfBuffer,
              mediaType: 'application/pdf',
              filename: args.fileName,
            },
          ],
        },
      ],
    },
    'problem-bank-import-direct-llm',
  );

  const parsed = parseDirectProblemImportResultFromLLMText(result.text);
  const llmDrafts = postProcessPdfFileDrafts(
    parsed.drafts.map((item) =>
      withDirectLlmSourceMeta(withPdfFileSourceMeta(normalizeCandidateDraft(item, args.source))),
    ),
  );
  const structurePlan =
    parsed.structurePlan && parsed.structurePlan.topLevelProblems.length > 0
      ? {
          ...parsed.structurePlan,
          generatedBy: 'llm' as const,
        }
      : directLlmStructurePlanFromDrafts(sourcePackage, llmDrafts);
  const enrichedDrafts = attachSourceImagesToDrafts(
    enrichDraftsWithStructurePlan(llmDrafts, structurePlan).map((draft) => ({
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        importMode: 'direct-llm',
        fileInput: true,
        pipelineStage: 'direct-llm-import',
      },
    })),
    sourcePackage,
  );
  const answerResult = await solveMissingChoiceAnswersWithLLM({
    drafts: enrichedDrafts,
    model: args.model,
    language: args.language,
  });
  const usage = mergeImportUsage(
    llmUsageFromResult({
      model: args.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cachedInputTokens: result.usage.cachedInputTokens ?? 0,
    }),
    answerResult.usage,
  );
  const draftResult: ProblemDraftGenerationResult = {
    drafts: answerResult.drafts,
    usage,
    warnings: [
      'Direct LLM pipeline used: model decided boundaries and generated drafts in one call.',
    ],
  };
  const qualityReport = buildProblemImportQualityReport({
    sourcePackage,
    structurePlan,
    drafts: draftResult.drafts,
  });
  return {
    sourcePackage,
    structurePlan,
    draftResult,
    qualityReport,
    usage,
  };
}

export function qualityCheck(
  id: string,
  title: string,
  status: ProblemImportQualityCheck['status'],
  details: string[],
  draftIndexes?: number[],
): ProblemImportQualityCheck {
  return { id, title, status, details, draftIndexes };
}

export function stemHasFlattenedStructure(stem: string): boolean {
  const subpartMarkerCount = [...stem.matchAll(STANDALONE_SUBPART_MARKER_RE)].filter((match) =>
    isStandaloneSubpartMarker(stem, match.index ?? 0),
  ).length;
  const namedMarkerCount = (stem.match(/\b(?:Hint|Note|Given|Define|Assume|Step)\s*:/g) || [])
    .length;
  const markerCount = subpartMarkerCount + namedMarkerCount;
  if (markerCount < 2) return false;
  const lineCount = stem.split('\n').filter((line) => line.trim()).length;
  return lineCount <= 2;
}

export function buildProblemImportQualityReport(args: {
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
  drafts: NotebookProblemImportDraft[];
}): ProblemImportQualityReport {
  const checks: ProblemImportQualityCheck[] = [];
  const expectedCount = args.structurePlan.topLevelProblems.length;
  const instructionDraftIndexes = args.drafts
    .map((draft, index) => (isLikelyPdfInstructionDraft(draft) ? index + 1 : null))
    .filter((index): index is number => typeof index === 'number');
  const flattenedDraftIndexes = args.drafts
    .map((draft, index) => (stemHasFlattenedStructure(problemStemText(draft)) ? index + 1 : null))
    .filter((index): index is number => typeof index === 'number');
  const unresolvedRefIndexes = args.drafts
    .map((draft, index) => {
      const hasAttachedImages = (draft.publicContent.assets?.images || []).some((image) =>
        image.src?.trim(),
      );
      const hasUnresolvedReference =
        /\b(?:see above|above|front page|Table\s+[IVX]+|Diagram\s+[IVX]+|如上)\b/i.test(
          problemStemText(draft),
        ) || /(?:见图|上图|下图)/.test(problemStemText(draft));
      return hasUnresolvedReference && !hasAttachedImages ? index + 1 : null;
    })
    .filter((index): index is number => typeof index === 'number');
  const badChoiceIndexes = args.drafts
    .map((draft, index) => {
      if (draft.publicContent.type !== 'choice') return null;
      const labelsAreLetters = draft.publicContent.options.some((option) =>
        /^[A-H]$/i.test(option.label.trim()),
      );
      return draft.publicContent.options.length < 2 || labelsAreLetters ? index + 1 : null;
    })
    .filter((index): index is number => typeof index === 'number');
  const missingStructureIndexes = args.drafts
    .map((draft, index) => (draft.sourceMeta.structure ? null : index + 1))
    .filter((index): index is number => typeof index === 'number');
  const visualDraftIndexes = args.drafts
    .map((draft, index) => (draftMentionsVisualContent(draft) ? index + 1 : null))
    .filter((index): index is number => typeof index === 'number');
  const missingVisualAssetIndexes = args.drafts
    .map((draft, index) => {
      if (!draftMentionsVisualContent(draft)) return null;
      return (draft.publicContent.assets?.images || []).some((image) => image.src?.trim())
        ? null
        : index + 1;
    })
    .filter((index): index is number => typeof index === 'number');
  const sourceHasImages = args.sourcePackage.sourceImages.some((image) => image.src?.trim());

  checks.push(
    qualityCheck(
      'source-package',
      'Source package 可用',
      args.sourcePackage.sourcePages.length > 0 ? 'pass' : 'fail',
      [`pages=${args.sourcePackage.sourcePages.length}`, `parser=${args.sourcePackage.parser}`],
    ),
  );
  checks.push(
    qualityCheck(
      'structure-plan-count',
      'Structure plan 有顶层题',
      expectedCount > 0 ? 'pass' : 'fail',
      [`topLevelProblems=${expectedCount}`],
    ),
  );
  checks.push(
    qualityCheck(
      'draft-coverage',
      'Draft 数量覆盖 structure plan',
      expectedCount > 0 && args.drafts.length === expectedCount
        ? 'pass'
        : args.drafts.length > 0
          ? 'warn'
          : 'fail',
      [`drafts=${args.drafts.length}`, `expected=${expectedCount}`],
    ),
  );
  checks.push(
    qualityCheck(
      'no-instruction-drafts',
      '没有把说明页当题',
      instructionDraftIndexes.length === 0 ? 'pass' : 'fail',
      instructionDraftIndexes.length
        ? [`疑似说明页题号：${instructionDraftIndexes.join(', ')}`]
        : ['No instruction drafts detected.'],
      instructionDraftIndexes,
    ),
  );
  checks.push(
    qualityCheck(
      'structure-visible',
      '题内结构没有压成一段',
      flattenedDraftIndexes.length === 0 ? 'pass' : 'fail',
      flattenedDraftIndexes.length
        ? [`疑似压扁题号：${flattenedDraftIndexes.join(', ')}`]
        : ['Subparts/context blocks appear sectioned.'],
      flattenedDraftIndexes,
    ),
  );
  checks.push(
    qualityCheck(
      'independent-stems',
      '题干可脱离原文件作答',
      unresolvedRefIndexes.length === 0 ? 'pass' : 'warn',
      unresolvedRefIndexes.length
        ? [`仍有悬空引用题号：${unresolvedRefIndexes.join(', ')}`]
        : ['No obvious unresolved visual/source references.'],
      unresolvedRefIndexes,
    ),
  );
  checks.push(
    qualityCheck(
      'choice-options',
      '选择题选项完整',
      badChoiceIndexes.length === 0 ? 'pass' : 'fail',
      badChoiceIndexes.length
        ? [`选项缺失或 label 只有字母的题号：${badChoiceIndexes.join(', ')}`]
        : ['Choice options are populated.'],
      badChoiceIndexes,
    ),
  );
  checks.push(
    qualityCheck(
      'source-meta-structure',
      'Draft 绑定 structure metadata',
      missingStructureIndexes.length === 0 ? 'pass' : 'warn',
      missingStructureIndexes.length
        ? [`缺少 sourceMeta.structure 的题号：${missingStructureIndexes.join(', ')}`]
        : ['Every draft has structure metadata.'],
      missingStructureIndexes,
    ),
  );
  checks.push(
    qualityCheck(
      'visual-assets-bound',
      '图像题绑定附图',
      visualDraftIndexes.length === 0 || missingVisualAssetIndexes.length === 0
        ? 'pass'
        : sourceHasImages
          ? 'fail'
          : 'warn',
      visualDraftIndexes.length === 0
        ? ['No visual-dependent drafts detected.']
        : missingVisualAssetIndexes.length === 0
          ? [`图像题已绑定附图：${visualDraftIndexes.join(', ')}`]
          : [
              `缺少题目附图的题号：${missingVisualAssetIndexes.join(', ')}`,
              `sourceImages=${args.sourcePackage.sourceImages.length}`,
            ],
      missingVisualAssetIndexes,
    ),
  );

  const blockingIssueCount = checks.filter((check) => check.status === 'fail').length;
  const warningIssueCount = checks.filter((check) => check.status === 'warn').length;
  return {
    passed: blockingIssueCount === 0,
    blockingIssueCount,
    warningIssueCount,
    checks,
    summary:
      blockingIssueCount === 0
        ? `Problem import passed with ${warningIssueCount} warnings.`
        : `Problem import has ${blockingIssueCount} blocking issues and ${warningIssueCount} warnings.`,
  };
}

export async function runProblemImportPipelineV2(args: {
  pdfBuffer: Buffer;
  fileName: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model: LanguageModel;
  scaffoldText?: string;
  includePageImages?: boolean;
  skipStructurePlanLlm?: boolean;
}): Promise<ProblemImportPipelineResult> {
  const sourcePackage = await buildProblemSourcePackageFromPdfFile({
    pdfBuffer: args.pdfBuffer,
    fileName: args.fileName,
    scaffoldText: args.scaffoldText,
    includePageImages: args.includePageImages,
  });
  const planResult = await buildProblemStructurePlan({
    sourcePackage,
    source: args.source,
    language: args.language,
    model: args.skipStructurePlanLlm ? undefined : args.model,
  });
  const draftResult = await generateProblemDraftsFromPdfWithStructurePlan({
    pdfBuffer: args.pdfBuffer,
    fileName: args.fileName,
    source: args.source,
    language: args.language,
    model: args.model,
    sourcePackage,
    structurePlan: planResult.structurePlan,
  });
  const qualityReport = buildProblemImportQualityReport({
    sourcePackage,
    structurePlan: planResult.structurePlan,
    drafts: draftResult.drafts,
  });
  return {
    sourcePackage,
    structurePlan: planResult.structurePlan,
    draftResult,
    qualityReport,
    usage: mergeImportUsage(planResult.usage, draftResult.usage),
  };
}

export async function extractProblemDraftsFromPdfFile(args: {
  pdfBuffer: Buffer;
  fileName: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model: LanguageModel;
  scaffoldText?: string;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  if (args.pdfBuffer.length === 0) return { drafts: [], usage: null };
  const pipeline = await runProblemImportPipelineV2({
    pdfBuffer: args.pdfBuffer,
    fileName: args.fileName,
    source: args.source,
    language: args.language,
    model: args.model,
    scaffoldText: args.scaffoldText,
    includePageImages: false,
  });
  return {
    drafts: pipeline.draftResult.drafts,
    usage: pipeline.usage,
  };
}

export async function extractProblemDraftsFromText(args: {
  text: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model?: LanguageModel;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const trimmed =
    args.source === 'pdf' ? trimPdfScaffoldTextToProblemRegion(args.text) : args.text.trim();
  if (!trimmed) return { drafts: [], usage: null };
  const heuristicDrafts =
    args.source === 'pdf'
      ? postProcessPdfFileDrafts(heuristicExtractProblemDrafts(trimmed, args.source))
      : heuristicExtractProblemDrafts(trimmed, args.source);
  const hasStructuredChoiceBlocks =
    /\bMC\s*\d+[\.\)]?\s+/i.test(trimmed) && heuristicDrafts.length >= 2;
  const hasCompleteHeuristicChoiceDrafts =
    hasStructuredChoiceBlocks &&
    heuristicDrafts.every(
      (draft) =>
        draft.type === 'choice' &&
        draft.publicContent.type === 'choice' &&
        draft.publicContent.options.length >= 2,
    );
  const withSolvedChoiceAnswers = async (
    drafts: NotebookProblemImportDraft[],
    usage: ImportUsageSummary | null,
  ) => {
    const answerResult = await solveMissingChoiceAnswersWithLLM({
      drafts,
      model: args.model,
      language: args.language,
    });
    return {
      drafts: answerResult.drafts,
      usage: mergeImportUsage(usage, answerResult.usage),
    };
  };

  if (hasCompleteHeuristicChoiceDrafts) {
    return withSolvedChoiceAnswers(heuristicDrafts, null);
  }

  if (args.model) {
    try {
      const llmInput =
        heuristicDrafts.length > 1
          ? heuristicDrafts
              .map((draft) =>
                typeof draft.sourceMeta.rawBlock === 'string' ? draft.sourceMeta.rawBlock : '',
              )
              .filter(Boolean)
              .join('\n\n')
          : trimmed;
      const llmResult = await llmExtractProblemDrafts({
        text: llmInput,
        source: args.source,
        model: args.model,
        language: args.language,
      });
      if (llmResult.drafts.length > 0) {
        if (hasStructuredChoiceBlocks && heuristicDrafts.length >= llmResult.drafts.length) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        if (
          hasStructuredChoiceBlocks &&
          llmResult.drafts.length < Math.max(2, Math.floor(heuristicDrafts.length * 0.7))
        ) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        if (
          heuristicDrafts.length === 1 &&
          llmResult.drafts.length > 1 &&
          llmResult.drafts.some((draft) => draft.validationErrors.length > 0) &&
          looksLikeSingleProblemInput(trimmed)
        ) {
          return withSolvedChoiceAnswers(heuristicDrafts, llmResult.usage);
        }
        return llmResult;
      }
    } catch {
      // fall back to heuristic extraction below
    }
  }

  return {
    ...(await withSolvedChoiceAnswers(heuristicDrafts, null)),
  };
}
