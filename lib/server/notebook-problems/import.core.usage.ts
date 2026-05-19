import type { LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';
import type { ImportUsageSummary } from './import.core.types';
import { stripCodeFences } from './import.core.text';

export function mergeImportUsage(
  current: ImportUsageSummary | null,
  next: ImportUsageSummary | null,
): ImportUsageSummary | null {
  if (!current) return next;
  if (!next) return current;
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    estimatedCostCredits:
      current.estimatedCostCredits == null || next.estimatedCostCredits == null
        ? null
        : current.estimatedCostCredits + next.estimatedCostCredits,
  };
}

export function llmUsageFromResult(args: {
  model: LanguageModel;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}): ImportUsageSummary | null {
  if (args.inputTokens <= 0 && args.outputTokens <= 0) return null;
  return {
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cachedInputTokens: args.cachedInputTokens,
    estimatedCostCredits: estimateOpenAITextUsageRetailCostCredits({
      modelString:
        typeof args.model === 'object' && 'modelId' in args.model
          ? String((args.model as { modelId?: unknown }).modelId ?? '')
          : undefined,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cachedInputTokens: args.cachedInputTokens,
    }),
  };
}

export function isMissingChoiceAnswerDraft(draft: NotebookProblemImportDraft): boolean {
  return (
    draft.type === 'choice' &&
    draft.publicContent.type === 'choice' &&
    draft.grading.type === 'choice' &&
    (draft.validationErrors.some((error) => error.includes('未识别到正确答案')) ||
      draft.grading.correctOptionIds.length === 0)
  );
}

export function removeMissingAnswerValidationErrors(errors: string[]): string[] {
  return errors.filter((error) => !error.includes('未识别到正确答案'));
}

export function parseChoiceAnswerResults(text: string): Array<{
  draftId: string;
  correctOptionIds: string[];
  analysis?: string;
  confidence?: number;
}> {
  const raw = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = JSON.parse(jsonrepair(raw)) as unknown;
  }
  const rows =
    Array.isArray(parsed) ||
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { answers?: unknown }).answers)
      ? parsed
      : (parsed as { answers: unknown[] }).answers;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const draftId = typeof record.draftId === 'string' ? record.draftId.trim() : '';
      const rawAnswers = Array.isArray(record.correctOptionIds)
        ? record.correctOptionIds
        : typeof record.correctOptionId === 'string'
          ? [record.correctOptionId]
          : typeof record.answer === 'string'
            ? [record.answer]
            : Array.isArray(record.answers)
              ? record.answers
              : [];
      const correctOptionIds = rawAnswers
        .map((answer) => String(answer ?? '').trim())
        .filter(Boolean);
      const analysis = typeof record.analysis === 'string' ? record.analysis.trim() : undefined;
      const confidence = typeof record.confidence === 'number' ? record.confidence : undefined;
      if (!draftId || correctOptionIds.length === 0) return null;
      return { draftId, correctOptionIds, analysis, confidence };
    })
    .filter(Boolean) as Array<{
    draftId: string;
    correctOptionIds: string[];
    analysis?: string;
    confidence?: number;
  }>;
}
