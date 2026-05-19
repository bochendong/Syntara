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
  breakStandaloneSubpartMarkers,
  extractChoiceAnswer,
  extractPointTotal,
  extractSubpartSections,
  heuristicExtractProblemDrafts,
  ImportUsageSummary,
  isLikelyPdfInstructionDraft,
  llmUsageFromResult,
  mergeOpenResponseGrading,
  normalizeDraftMathFields,
  normalizeMathMarkdown,
  normalizeTitle,
  normalizeWhitespace,
  openResponsePublicContent,
  parseChoiceOptions,
  ProblemSourceAnchor,
  ProblemSourcePackage,
  problemStemText,
  ProblemStructureItem,
  ProblemStructurePlan,
  problemStructurePlanSchema,
  scaffoldIndexOf,
  stripChoiceOptions,
  stripCodeFences,
  trimPdfScaffoldTextToProblemRegion,
  trimTextToProblemStart,
} from './import.core';

export function compactSourcePackageForPrompt(sourcePackage: ProblemSourcePackage): string {
  return JSON.stringify({
    fileName: sourcePackage.fileName,
    fileType: sourcePackage.fileType,
    pageCount: sourcePackage.pageCount,
    pages: sourcePackage.sourcePages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      title: page.title,
      roleHint: page.roleHint,
      text: page.text.slice(0, 5000),
    })),
    warnings: sourcePackage.warnings,
  }).slice(0, 42000);
}

export function parseProblemStructurePlanFromLLMText(text: string): ProblemStructurePlan | null {
  const stripped = stripCodeFences(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(jsonrepair(stripped.slice(start, end + 1)));
    const plan = problemStructurePlanSchema.parse(parsed);
    return { ...plan, generatedBy: 'llm' };
  } catch {
    return null;
  }
}

export function sourceAnchorForText(
  sourcePackage: ProblemSourcePackage,
  text: string,
): ProblemSourceAnchor[] {
  const quote = normalizeWhitespace(text).slice(0, 240);
  const lowerQuote = quote.slice(0, 80).toLowerCase();
  const page = sourcePackage.sourcePages.find((sourcePage) =>
    normalizeWhitespace(sourcePage.text).toLowerCase().includes(lowerQuote),
  );
  if (!page) return quote ? [{ textQuote: quote }] : [];
  return [
    {
      pageNumber: page.pageNumber,
      sourcePageId: page.id,
      textQuote: quote,
      role: page.roleHint,
    },
  ];
}

export function problemLabelFromRawBlock(rawBlock: string, index: number): string {
  const trimmed = rawBlock.trim();
  return (
    trimmed.match(/^MC\s*(\d+)/i)?.[1] ||
    trimmed.match(/^Question\s+(\d+)/i)?.[1] ||
    trimmed.match(/^Q(\d+)/i)?.[1] ||
    trimmed.match(/^(\d+)[\.)]/)?.[1] ||
    String(index + 1)
  );
}

export function contextBlocksFromStem(stem: string): ProblemStructureItem['contextBlocks'] {
  const blocks: ProblemStructureItem['contextBlocks'] = [];
  if (
    /\b(?:properties|conditions|assumptions|requirements|definitions?)\b|(?:^|\n)\s*[-*]\s+\([A-Z]\d+\)/i.test(
      stem,
    )
  ) {
    blocks.push({
      kind: /definitions?/i.test(stem) ? 'definition' : 'conditions',
      title: /definitions?/i.test(stem) ? 'Definitions' : 'Conditions / requirements',
      summary: normalizeWhitespace(stem).slice(0, 600),
    });
  }
  if (/\bHint\s*:/i.test(stem)) {
    blocks.push({
      kind: 'hint',
      title: 'Hint',
      summary: normalizeWhitespace(stem.match(/\bHint\s*:[\s\S]*$/i)?.[0] || 'Hint present.'),
    });
  }
  if (/\|.+\||\btable\b|表\s*\d+/i.test(stem)) {
    blocks.push({
      kind: 'table',
      title: 'Table / data',
      summary: 'The problem references tabular data.',
    });
  }
  if (/\bdiagram\b|\bfigure\b|图\s*\d+|->|→|↦/i.test(stem)) {
    blocks.push({
      kind: 'diagram',
      title: 'Diagram / relationship',
      summary: 'The problem references a visual or relationship graph.',
    });
  }
  if (/```|\bdef\s+\w+\s*\(|\bclass\s+\w+\s*\(/i.test(stem)) {
    blocks.push({ kind: 'code', title: 'Code', summary: 'The problem includes code context.' });
  }
  return blocks;
}

export function buildHeuristicProblemStructurePlan(
  sourcePackage: ProblemSourcePackage,
  source: NotebookProblemSource,
): ProblemStructurePlan {
  const problemRegion = trimPdfScaffoldTextToProblemRegion(sourcePackage.sourceText);
  const warnings: string[] = [];
  let scaffoldDrafts: NotebookProblemImportDraft[] = [];
  try {
    scaffoldDrafts = heuristicExtractProblemDrafts(problemRegion, source).filter(
      (draft) => !isLikelyPdfInstructionDraft(draft),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(
      `Heuristic draft scaffold failed while building structure plan: ${
        message.includes('"publicContent"') && message.includes('"grading"')
          ? 'draft schema validation failed'
          : message.length > 260
            ? `${message.slice(0, 260).trim()}...`
            : message
      }`,
    );
  }
  const nonProblemRegions = sourcePackage.sourcePages
    .filter(
      (page) =>
        page.roleHint === 'cover' ||
        page.roleHint === 'instructions' ||
        page.roleHint === 'additional_work' ||
        page.roleHint === 'blank',
    )
    .map((page) => ({
      kind:
        page.roleHint === 'instructions'
          ? ('instructions' as const)
          : page.roleHint === 'additional_work'
            ? ('additional_work' as const)
            : page.roleHint === 'blank'
              ? ('blank' as const)
              : ('cover' as const),
      pageNumbers: [page.pageNumber],
      reason: `${page.sourceLabel} detected as ${page.roleHint}.`,
    }));
  const fallbackPages = sourcePackage.sourcePages.filter(
    (page) =>
      page.text.trim().length > 0 &&
      page.roleHint !== 'cover' &&
      page.roleHint !== 'instructions' &&
      page.roleHint !== 'additional_work' &&
      page.roleHint !== 'blank',
  );
  const fallbackProblemPages = fallbackPages.length ? fallbackPages : sourcePackage.sourcePages;

  const topLevelProblems =
    scaffoldDrafts.length > 0
      ? scaffoldDrafts.map((draft, index) => {
          const rawBlock =
            typeof draft.sourceMeta.rawBlock === 'string'
              ? draft.sourceMeta.rawBlock
              : problemStemText(draft);
          const stem = problemStemText(draft);
          const anchors = sourceAnchorForText(sourcePackage, rawBlock);
          const pageNumbers = anchors
            .map((anchor) => anchor.pageNumber)
            .filter((page): page is number => typeof page === 'number');
          return {
            index: index + 1,
            topLevelLabel: problemLabelFromRawBlock(rawBlock, index),
            title: draft.title || normalizeTitle(stem, draft.type),
            problemTypeHint: draft.type,
            pageStart: pageNumbers[0],
            pageEnd: pageNumbers[pageNumbers.length - 1],
            sourceAnchors: anchors,
            subparts: extractSubpartSections(stem).map((section) => ({
              label: section.label,
              prompt: normalizeWhitespace(section.text).slice(0, 1000),
              points: section.text.match(/\((\d+)\s+points?\)/i)?.[1]
                ? Number(section.text.match(/\((\d+)\s+points?\)/i)?.[1])
                : undefined,
            })),
            contextBlocks: contextBlocksFromStem(stem),
            visualRefs: [
              ...stem.matchAll(/\b(?:Table|Diagram|Figure)\s+[A-Za-z0-9]+|图\s*\d+|表\s*\d+/gi),
            ].map((match) => match[0]),
            confidence: 0.58,
          };
        })
      : fallbackProblemPages.map((page, index) => {
          const text = trimTextToProblemStart(page.text, 'any');
          return {
            index: index + 1,
            topLevelLabel: String(index + 1),
            title: normalizeTitle(page.title || text, 'short_answer'),
            problemTypeHint: 'short_answer' as const,
            pageStart: page.pageNumber,
            pageEnd: page.pageNumber,
            sourceAnchors: [
              {
                pageNumber: page.pageNumber,
                sourcePageId: page.id,
                textQuote: text.slice(0, 800),
                role: 'problem',
              },
            ],
            subparts: extractSubpartSections(text).map((section) => ({
              label: section.label,
              prompt: normalizeWhitespace(section.text).slice(0, 1000),
              points: section.text.match(/\((\d+)\s+points?\)/i)?.[1]
                ? Number(section.text.match(/\((\d+)\s+points?\)/i)?.[1])
                : undefined,
            })),
            contextBlocks: contextBlocksFromStem(text),
            visualRefs: [
              ...text.matchAll(/\b(?:Table|Diagram|Figure)\s+[A-Za-z0-9]+|图\s*\d+|表\s*\d+/gi),
            ].map((match) => match[0]),
            confidence: 0.35,
          };
        });

  return {
    sourceSummary: `${sourcePackage.fileName}: ${sourcePackage.pageCount} pages, ${topLevelProblems.length} candidate top-level problems.`,
    nonProblemRegions,
    sharedContexts: [],
    topLevelProblems,
    warnings:
      scaffoldDrafts.length === 0
        ? [...warnings, 'No top-level problems detected heuristically; page scaffold used.']
        : warnings,
    generatedBy: 'heuristic',
  };
}

export function buildStructurePlanPrompt(
  sourcePackage: ProblemSourcePackage,
  language: 'zh-CN' | 'en-US',
) {
  const compactSource = compactSourcePackageForPrompt(sourcePackage);
  return language === 'zh-CN'
    ? `请把下面的源材料包分析成“题目结构计划”，只返回严格 JSON 对象，不要 markdown。

你的任务：识别哪些内容不是题目，哪些是顶层题目，每道题包含哪些子问、共享上下文、表格/图/代码/数据引用。不要生成题目答案，不要生成最终 drafts。

返回形状：
{
  "sourceSummary": "简短说明源材料是什么",
  "nonProblemRegions": [{"kind":"cover|instructions|additional_work|blank|header_footer|other","pageNumbers":[1],"reason":"为什么不是题目"}],
  "sharedContexts": [{"id":"ctx_1","title":"...","pageNumbers":[2],"summary":"会被多题引用的材料"}],
  "topLevelProblems": [
    {
      "index": 1,
      "topLevelLabel": "1",
      "title": "概念导向标题",
      "problemTypeHint": "choice|proof|calculation|short_answer|code|fill_blank|unknown",
      "pageStart": 2,
      "pageEnd": 3,
      "sourceAnchors": [{"pageNumber":2,"sourcePageId":"page_2","textQuote":"题目开头短引文","role":"problem"}],
      "subparts": [{"label":"i","prompt":"子问原意","points":3}],
      "contextBlocks": [{"kind":"definition|conditions|table|diagram|code|data|hint|other","title":"...","summary":"..."}],
      "visualRefs": ["Figure 1"],
      "confidence": 0.0 到 1.0
    }
  ],
  "warnings": []
}

要求：
- 顶层题号是一道题；(i)/(ii)/(a)/(b) 是 subparts。
- 考试说明、答题卡说明、封面、空白页、additional work 不进入 topLevelProblems。
- 换科目也一样：代码、实验数据、案例材料、图表都要进入对应题目的 contextBlocks。

源材料包：
${compactSource}`
    : `Analyze this source package into a problem structure plan. Return strict JSON only.

Task: identify non-problem material, top-level problems, subparts, shared context, and table/diagram/code/data references. Do not generate answers or final drafts.

Return shape:
{
  "sourceSummary": "short source summary",
  "nonProblemRegions": [{"kind":"cover|instructions|additional_work|blank|header_footer|other","pageNumbers":[1],"reason":"why it is not a problem"}],
  "sharedContexts": [{"id":"ctx_1","title":"...","pageNumbers":[2],"summary":"material referenced by multiple problems"}],
  "topLevelProblems": [
    {
      "index": 1,
      "topLevelLabel": "1",
      "title": "concept-focused title",
      "problemTypeHint": "choice|proof|calculation|short_answer|code|fill_blank|unknown",
      "pageStart": 2,
      "pageEnd": 3,
      "sourceAnchors": [{"pageNumber":2,"sourcePageId":"page_2","textQuote":"short opening quote","role":"problem"}],
      "subparts": [{"label":"i","prompt":"subpart intent","points":3}],
      "contextBlocks": [{"kind":"definition|conditions|table|diagram|code|data|hint|other","title":"...","summary":"..."}],
      "visualRefs": ["Figure 1"],
      "confidence": 0.0 to 1.0
    }
  ],
  "warnings": []
}

Rules:
- A top-level question number is one problem; (i)/(ii)/(a)/(b) are subparts.
- Exam instructions, answer-sheet directions, covers, blanks, and additional-work pages are non-problem regions.
- This must work across subjects: code, experimental data, case material, diagrams, and tables should become contextBlocks for the owning problem.

Source package:
${compactSource}`;
}

export async function buildProblemStructurePlan(args: {
  sourcePackage: ProblemSourcePackage;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model?: LanguageModel;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ structurePlan: ProblemStructurePlan; usage: ImportUsageSummary | null }> {
  const fallback = buildHeuristicProblemStructurePlan(args.sourcePackage, args.source);
  if (!args.model) return { structurePlan: fallback, usage: null };

  try {
    const result = await callLLM(
      {
        model: args.model,
        system:
          args.language === 'zh-CN'
            ? '你是跨科目题库导入架构师。你只做源材料层级理解，返回严格 JSON。'
            : 'You are a cross-subject problem-bank import architect. Analyze source hierarchy and return strict JSON only.',
        prompt: buildStructurePlanPrompt(args.sourcePackage, args.language),
        maxOutputTokens: 12000,
        timeout: args.timeoutMs,
        abortSignal: args.abortSignal,
      },
      'problem-bank-import-structure-plan',
    );
    const parsed = parseProblemStructurePlanFromLLMText(result.text);
    if (!parsed || parsed.topLevelProblems.length === 0) {
      return {
        structurePlan: {
          ...fallback,
          warnings: [
            ...fallback.warnings,
            'LLM structure plan was empty or invalid; heuristic fallback used.',
          ],
        },
        usage: llmUsageFromResult({
          model: args.model,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          cachedInputTokens: result.usage.cachedInputTokens ?? 0,
        }),
      };
    }
    const heuristicCount = fallback.topLevelProblems.length;
    const warnings =
      heuristicCount > 0 && parsed.topLevelProblems.length !== heuristicCount
        ? [
            ...parsed.warnings,
            `LLM structure count ${parsed.topLevelProblems.length} differs from text scaffold count ${heuristicCount}.`,
          ]
        : parsed.warnings;
    return {
      structurePlan: { ...parsed, warnings },
      usage: llmUsageFromResult({
        model: args.model,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        cachedInputTokens: result.usage.cachedInputTokens ?? 0,
      }),
    };
  } catch (error) {
    return {
      structurePlan: {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          `Structure plan LLM failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      },
      usage: null,
    };
  }
}

export function buildCoverageScaffoldFromStructurePlan(
  structurePlan: ProblemStructurePlan,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return structurePlan.topLevelProblems.map((problem) => {
    const draftType =
      problem.problemTypeHint === 'choice'
        ? 'choice'
        : problem.problemTypeHint === 'proof'
          ? 'proof'
          : problem.problemTypeHint === 'calculation'
            ? 'calculation'
            : 'short_answer';
    const anchorStem = problem.sourceAnchors
      .map((anchor) => anchor.textQuote)
      .filter(Boolean)
      .join('\n');
    const normalizedAnchorStem = normalizeWhitespace(anchorStem).toLowerCase();
    const anchorAlreadyIncludesSubparts =
      problem.subparts.length > 0 &&
      problem.subparts.every((subpart) => {
        const prompt = normalizeWhitespace(subpart.prompt)
          .replace(new RegExp(`^\\(?${subpart.label}\\)?\\s*`, 'i'), '')
          .toLowerCase();
        const sample = prompt.slice(0, 72);
        return sample.length < 12 || normalizedAnchorStem.includes(sample);
      });
    const scaffoldStem = [
      breakStandaloneSubpartMarkers(anchorStem),
      ...(anchorAlreadyIncludesSubparts
        ? []
        : problem.subparts.map((subpart) =>
            breakStandaloneSubpartMarkers(`(${subpart.label}) ${subpart.prompt}`),
          )),
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 12000);
    const choiceOptions = draftType === 'choice' ? parseChoiceOptions(scaffoldStem) : [];
    const choiceAnswerIds = draftType === 'choice' ? extractChoiceAnswer(scaffoldStem) : [];
    const publicContent =
      draftType === 'choice' && choiceOptions.length >= 2
        ? {
            type: 'choice' as const,
            stem: normalizeMathMarkdown(stripChoiceOptions(scaffoldStem)).slice(0, 12000),
            selectionMode: choiceAnswerIds.length > 1 ? ('multiple' as const) : ('single' as const),
            options: choiceOptions.map((option) => ({
              ...option,
              label: normalizeMathMarkdown(option.label),
            })),
          }
        : openResponsePublicContent(
            draftType === 'choice' ? 'short_answer' : draftType,
            scaffoldStem || problem.title,
          );
    const grading =
      draftType === 'choice' && choiceOptions.length >= 2
        ? {
            type: 'choice' as const,
            correctOptionIds:
              choiceAnswerIds.length > 0
                ? choiceAnswerIds
                : choiceOptions[0]?.id
                  ? [choiceOptions[0].id]
                  : ['A'],
          }
        : mergeOpenResponseGrading(draftType === 'choice' ? 'short_answer' : draftType);
    const normalized = normalizeDraftMathFields(
      notebookProblemImportDraftSchema.parse({
        draftId: randomUUID(),
        title: problem.title || `Question ${problem.topLevelLabel}`,
        type: publicContent.type,
        status: 'draft',
        source,
        points:
          problem.subparts.reduce((sum, subpart) => sum + (subpart.points || 0), 0) ||
          extractPointTotal(
            problem.sourceAnchors.map((anchor) => anchor.textQuote || '').join('\n'),
          ),
        tags: [],
        difficulty: problem.problemTypeHint === 'proof' ? 'hard' : 'medium',
        publicContent,
        grading,
        sourceMeta: {
          scaffoldIndex: problem.index,
          structure: problem,
          anchors: problem.sourceAnchors,
          pipelineStage: 'structure-plan',
          ...(draftType === 'choice' && choiceOptions.length >= 2 && choiceAnswerIds.length === 0
            ? { answerSource: 'fixture-placeholder' }
            : {}),
        },
        validationErrors: [],
      }),
    );
    return { ...normalized, validationErrors: [] };
  });
}

export function enrichDraftsWithStructurePlan(
  drafts: NotebookProblemImportDraft[],
  structurePlan: ProblemStructurePlan,
): NotebookProblemImportDraft[] {
  return drafts.map((draft, index) => {
    const planItem =
      structurePlan.topLevelProblems.find((item) => item.index === scaffoldIndexOf(draft)) ||
      structurePlan.topLevelProblems[index] ||
      null;
    return {
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        scaffoldIndex: scaffoldIndexOf(draft) ?? planItem?.index ?? index + 1,
        structure: planItem,
        anchors: planItem?.sourceAnchors ?? [],
        pipelineStage: 'draft-generation',
      },
    };
  });
}
