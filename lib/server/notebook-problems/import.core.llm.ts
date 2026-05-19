import type { LanguageModel } from 'ai';
import { callLLM } from '@/lib/ai/llm';
import type { NotebookProblemImportDraft, NotebookProblemSource } from '@/lib/problem-bank';
import type { ImportUsageSummary } from './import.core.types';
import { normalizeMathMarkdown } from './import.core.text';
import {
  normalizeCandidateDraft,
  normalizeDraftMathFields,
  parseProblemDraftArrayFromLLMText,
} from './import.core.drafts';
import { buildProblemImportSystemPrompt } from './import.core.prompts';
import {
  isMissingChoiceAnswerDraft,
  llmUsageFromResult,
  mergeImportUsage,
  parseChoiceAnswerResults,
  removeMissingAnswerValidationErrors,
} from './import.core.usage';

export async function solveMissingChoiceAnswersWithLLM(args: {
  drafts: NotebookProblemImportDraft[];
  model?: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{ drafts: NotebookProblemImportDraft[]; usage: ImportUsageSummary | null }> {
  if (!args.model) return { drafts: args.drafts, usage: null };
  const candidates = args.drafts.filter(isMissingChoiceAnswerDraft);
  if (candidates.length === 0) return { drafts: args.drafts, usage: null };

  const prompt =
    args.language === 'zh-CN'
      ? `请解答下面这些选择题，并返回严格 JSON，不要 markdown。
返回格式：
[
  {
    "draftId": "原 draftId",
    "correctOptionIds": ["A"],
    "analysis": "简短说明为什么选择这些选项",
    "confidence": 0.0 到 1.0
  }
]
要求：
- 必须只使用题干和选项中已有的信息作答。
- 如果是多选题，可以返回多个选项 id。
- 如果缺少图、表、front page、Diagram、Table 等关键上下文，无法可靠解答，则不要返回该题的答案。
- 不要为了满足格式而猜测。

题目：
${JSON.stringify(
  candidates.map((draft) => ({
    draftId: draft.draftId,
    title: draft.title,
    stem: draft.publicContent.type === 'choice' ? draft.publicContent.stem : '',
    selectionMode:
      draft.publicContent.type === 'choice' ? draft.publicContent.selectionMode : 'single',
    options:
      draft.publicContent.type === 'choice'
        ? draft.publicContent.options.map((option) => ({
            id: option.id,
            label: option.label,
          }))
        : [],
  })),
)}`.slice(0, 24000)
      : `Solve the following multiple-choice questions and return strict JSON only.
Return shape:
[
  {
    "draftId": "original draftId",
    "correctOptionIds": ["A"],
    "analysis": "brief reason for the selected option ids",
    "confidence": 0.0 to 1.0
  }
]
Rules:
- Use only the information already present in the stem and options.
- Return multiple option ids for multiple-select questions when appropriate.
- If critical context is missing, such as a table, diagram, front page, or referenced visual, do not return an answer for that question.
- Do not guess just to satisfy the schema.

Questions:
${JSON.stringify(
  candidates.map((draft) => ({
    draftId: draft.draftId,
    title: draft.title,
    stem: draft.publicContent.type === 'choice' ? draft.publicContent.stem : '',
    selectionMode:
      draft.publicContent.type === 'choice' ? draft.publicContent.selectionMode : 'single',
    options:
      draft.publicContent.type === 'choice'
        ? draft.publicContent.options.map((option) => ({
            id: option.id,
            label: option.label,
          }))
        : [],
  })),
)}`.slice(0, 24000);

  let result: Awaited<ReturnType<typeof callLLM>>;
  try {
    result = await callLLM(
      {
        model: args.model,
        system:
          args.language === 'zh-CN'
            ? '你是严谨的大学数学/计算机课程助教。你的任务是解选择题并返回机器可解析 JSON。'
            : 'You are a rigorous university math/computer-science teaching assistant. Solve multiple-choice questions and return machine-readable JSON.',
        prompt,
      },
      'problem-bank-import-answer-solve',
    );
  } catch {
    return { drafts: args.drafts, usage: null };
  }

  let answers: ReturnType<typeof parseChoiceAnswerResults>;
  try {
    answers = parseChoiceAnswerResults(result.text);
  } catch {
    answers = [];
  }
  if (answers.length === 0) {
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
    return {
      drafts: args.drafts,
      usage: llmUsageFromResult({
        model: args.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
      }),
    };
  }

  const answerByDraftId = new Map(answers.map((answer) => [answer.draftId, answer]));
  const solvedDrafts = args.drafts.map((draft) => {
    if (
      draft.type !== 'choice' ||
      draft.publicContent.type !== 'choice' ||
      draft.grading.type !== 'choice'
    ) {
      return draft;
    }
    const answer = answerByDraftId.get(draft.draftId);
    if (!answer) return draft;
    const validOptionIds = new Set(draft.publicContent.options.map((option) => option.id));
    const correctOptionIds = answer.correctOptionIds.filter((optionId) =>
      validOptionIds.has(optionId),
    );
    if (correctOptionIds.length === 0) return draft;
    return normalizeDraftMathFields({
      ...draft,
      publicContent: {
        ...draft.publicContent,
        selectionMode: correctOptionIds.length > 1 ? 'multiple' : draft.publicContent.selectionMode,
      },
      grading: {
        ...draft.grading,
        correctOptionIds,
        analysis: answer.analysis ? normalizeMathMarkdown(answer.analysis) : draft.grading.analysis,
      },
      sourceMeta: {
        ...draft.sourceMeta,
        answerSource: 'llm-solved',
        answerConfidence: answer.confidence ?? null,
      },
      validationErrors: removeMissingAnswerValidationErrors(draft.validationErrors),
    });
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  return {
    drafts: solvedDrafts,
    usage: llmUsageFromResult({
      model: args.model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
    }),
  };
}

export async function llmExtractProblemDrafts(args: {
  text: string;
  source: NotebookProblemSource;
  model: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const system = buildProblemImportSystemPrompt(args.language);

  const prompt = `${args.language === 'zh-CN' ? '来源类型' : 'Source'}: ${args.source}

${args.language === 'zh-CN' ? '原始材料' : 'Raw material'}:
${args.text}`.slice(0, 24000);

  const result = await callLLM(
    {
      model: args.model,
      system,
      prompt,
      maxOutputTokens: 16000,
    },
    'problem-bank-import-preview',
  );
  const parsed = parseProblemDraftArrayFromLLMText(result.text);
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  const drafts = parsed.map((item) => normalizeCandidateDraft(item, args.source));
  const answerResult = await solveMissingChoiceAnswersWithLLM({
    drafts,
    model: args.model,
    language: args.language,
  });
  return {
    drafts: answerResult.drafts,
    usage: mergeImportUsage(
      llmUsageFromResult({
        model: args.model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
      }),
      answerResult.usage,
    ),
  };
}
