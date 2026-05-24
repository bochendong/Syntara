import type { NotebookProblemPublicContent } from './schema';

export type ProblemContentLanguage = 'zh-CN' | 'en-US';

export type LocalizableProblemRecord = {
  title: string;
  publicContent: NotebookProblemPublicContent;
  sourceMeta?: Record<string, unknown> | null;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTitleTranslation(
  sourceMeta: Record<string, unknown> | null | undefined,
  language: ProblemContentLanguage,
): string | null {
  if (language === 'en-US') return null;
  const meta = readRecord(sourceMeta);
  const translations = readRecord(meta?.translations);
  const languageTranslations = readRecord(translations?.[language]);
  const title = languageTranslations?.title;
  return typeof title === 'string' && title.trim() ? title : null;
}

export function getLocalizedProblemTitle(
  problem: LocalizableProblemRecord,
  language: ProblemContentLanguage,
): string {
  return readTitleTranslation(problem.sourceMeta, language) ?? problem.title;
}

export function getLocalizedProblemContent<T extends NotebookProblemPublicContent>(
  content: T,
  language: ProblemContentLanguage,
): T {
  if (language === 'en-US') return content;
  const translation = content.translations?.[language];
  if (!translation) return content;

  const next = { ...content };
  if ('stem' in next && translation.stem) {
    next.stem = translation.stem;
  }
  if ('stemTemplate' in next && translation.stemTemplate) {
    next.stemTemplate = translation.stemTemplate;
  }
  if (translation.explanation) {
    next.explanation = translation.explanation;
  }
  if (next.type === 'choice' && translation.options?.length) {
    const labelsById = new Map(translation.options.map((option) => [option.id, option.label]));
    next.options = next.options.map((option) => ({
      ...option,
      label: labelsById.get(option.id) ?? option.label,
    }));
  }

  return next as T;
}

export function hasProblemTranslation(
  problem: LocalizableProblemRecord | null | undefined,
  language: ProblemContentLanguage = 'zh-CN',
): boolean {
  if (!problem || language === 'en-US') return false;
  const translation = problem.publicContent.translations?.[language];
  return Boolean(
    readTitleTranslation(problem.sourceMeta, language) ||
      translation?.stem ||
      translation?.stemTemplate ||
      translation?.explanation ||
      translation?.options?.length,
  );
}
