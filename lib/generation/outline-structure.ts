import { nanoid } from 'nanoid';
import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import { isTitleCoverOutline } from '@/lib/generation/title-cover';
import type { SceneOutline } from '@/lib/types/generation';

const SUMMARY_PATTERN =
  /(总结|小结|回顾|收束|复盘|复习要点|结论|summary|recap|wrap[-\s]?up|takeaways?)/i;

const QUIZ_LABEL_PATTERN =
  /^(自测|小测|测验|练习|知识检查|quiz|self[-\s]?check|knowledge\s+check|quick\s+check|checkpoint)\s*(第?\s*[\d一二三四五六七八九十]+)?\s*/i;

const SUMMARY_LABEL_PATTERN =
  /^(总结|小结|回顾|收束|复盘|summary|recap|wrap[-\s]?up|takeaways?)\s*/i;

const WORKED_EXAMPLE_LABEL_PATTERN =
  /(例题|例|题目|问题|problem|example|exercise)\s*[\d一二三四五六七八九十]+/i;

const WORKED_EXAMPLE_PART_PATTERN =
  /\s*[\(（\[]\s*(?:第\s*)?(?:part\s*)?[\d一二三四五六七八九十]+\s*(?:\/\s*[\d一二三四五六七八九十]+)?\s*(?:部分|页|段|part)?\s*[\)）\]]\s*/i;

type OutlineGroup = {
  signature: string;
  outline: SceneOutline;
  outlines: SceneOutline[];
  firstIndex: number;
  itemIndex?: number;
};

function compactText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/[\s"'`“”‘’：:，,。.!！?？、;；()[\]{}<>《》【】（）\-_/|]+/g, ' ')
    .trim();
}

function compactSignature(value: string): string {
  return compactText(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function getOutlineText(outline: SceneOutline): string {
  return [outline.title, outline.description, ...(outline.keyPoints || [])]
    .filter(Boolean)
    .join('\n');
}

function limitText(value: string | undefined, maxLength: number): string | undefined {
  const text = value?.trim();
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = compactSignature(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function outlineRichnessScore(outline: SceneOutline): number {
  const worked = outline.workedExampleConfig;
  const workedText = worked
    ? [
        worked.problemStatement,
        ...(worked.givens || []),
        ...(worked.asks || []),
        ...(worked.constraints || []),
        ...(worked.solutionPlan || []),
        ...(worked.walkthroughSteps || []),
        ...(worked.commonPitfalls || []),
        worked.finalAnswer,
        worked.codeSnippet,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    outline.title.length * 2 +
    outline.description.length +
    (outline.keyPoints || []).join('\n').length +
    workedText.length +
    (outline.quizConfig?.questionCount || 0) * 30 +
    (outline.mediaGenerations?.length || 0) * 20 +
    (outline.suggestedImageIds?.length || 0) * 10
  );
}

function chooseRicherOutline(current: SceneOutline, candidate: SceneOutline): SceneOutline {
  const currentScore = outlineRichnessScore(current);
  const candidateScore = outlineRichnessScore(candidate);
  return candidateScore > currentScore + 20 ? candidate : current;
}

export function isFinalSummaryOutline(outline: SceneOutline | undefined | null): boolean {
  if (!outline || isTitleCoverOutline(outline)) return false;
  if (outline.type !== 'slide') return false;
  if (outline.workedExampleConfig) return false;
  if (outline.archetype === 'summary') return true;
  if (outline.layoutIntent?.layoutFamily === 'summary') return true;
  return SUMMARY_PATTERN.test(getOutlineText(outline));
}

export function isQuizOutline(outline: SceneOutline | undefined | null): boolean {
  return outline?.type === 'quiz';
}

function buildQuizSignature(outline: SceneOutline): string {
  const titleStem = compactText(outline.title)
    .replace(QUIZ_LABEL_PATTERN, '')
    .replace(SUMMARY_LABEL_PATTERN, '')
    .trim();
  const primary =
    titleStem || compactText([outline.description, ...(outline.keyPoints || [])].join(' '));
  const signature = compactSignature(primary);
  return signature || `quiz-${outline.id}`;
}

function buildSlideTopicSignature(outline: SceneOutline): string {
  const title = compactSignature(outline.title.replace(SUMMARY_LABEL_PATTERN, ''));
  if (title.length >= 4) return `${outline.type}:${title}`;

  const fallback = compactSignature(
    [outline.title, outline.description, ...(outline.keyPoints || []).slice(0, 2)].join(' '),
  );
  return `${outline.type}:${fallback || outline.id}`;
}

function stripWorkedExamplePartTitle(title: string): string {
  return title.replace(WORKED_EXAMPLE_PART_PATTERN, '').trim();
}

function getWorkedExampleLabel(title: string): string | null {
  const match = stripWorkedExamplePartTitle(title).match(WORKED_EXAMPLE_LABEL_PATTERN);
  return match?.[0]?.trim() || null;
}

function buildWorkedExampleSignature(outline: SceneOutline): string | null {
  const config = outline.workedExampleConfig;
  if (!config && !WORKED_EXAMPLE_LABEL_PATTERN.test(outline.title)) return null;

  const exampleId = config?.exampleId?.trim();
  if (exampleId) return `worked:${compactSignature(exampleId)}`;

  const label = getWorkedExampleLabel(outline.title);
  if (label) return `worked-title:${compactSignature(label)}`;

  const strippedTitle = stripWorkedExamplePartTitle(outline.title);
  if (config && strippedTitle !== outline.title && compactSignature(strippedTitle).length >= 4) {
    return `worked-title:${compactSignature(strippedTitle)}`;
  }

  const problem = config?.problemStatement?.trim();
  if (problem && compactSignature(problem).length >= 8) {
    return `worked-problem:${compactSignature(problem.slice(0, 160))}`;
  }

  return null;
}

function mergeWorkedExampleGroup(group: OutlineGroup): SceneOutline {
  const best = group.outlines.reduce(chooseRicherOutline, group.outline);
  const configs = group.outlines
    .map((outline) => outline.workedExampleConfig)
    .filter((config): config is NonNullable<SceneOutline['workedExampleConfig']> =>
      Boolean(config),
    );
  const firstConfig = configs[0];
  const lastConfig = configs[configs.length - 1];
  const first = group.outlines[0];
  const mergedTitle =
    stripWorkedExamplePartTitle(first.title) || stripWorkedExamplePartTitle(best.title);
  const mergedDescription = uniqueStrings(
    group.outlines.map((outline) => outline.description).filter(Boolean),
  ).join('\n');
  const keyPoints = uniqueStrings(group.outlines.flatMap((outline) => outline.keyPoints || []));
  const suggestedImageIds = uniqueStrings(
    group.outlines.flatMap((outline) => outline.suggestedImageIds || []),
  );
  const mediaGenerations = group.outlines.flatMap((outline) => outline.mediaGenerations || []);

  return normalizeSceneOutlineContentProfile({
    ...best,
    id: first.id,
    type: 'slide',
    archetype: 'example',
    title: mergedTitle,
    description: limitText(mergedDescription, 520) || best.description,
    keyPoints: keyPoints.slice(0, 6),
    suggestedImageIds: suggestedImageIds.length > 0 ? suggestedImageIds : best.suggestedImageIds,
    mediaGenerations: mediaGenerations.length > 0 ? mediaGenerations : best.mediaGenerations,
    workedExampleConfig: {
      kind: firstConfig?.kind || best.workedExampleConfig?.kind || 'general',
      role: 'walkthrough',
      exampleId:
        firstConfig?.exampleId ||
        best.workedExampleConfig?.exampleId ||
        compactSignature(mergedTitle || first.id),
      problemStatement:
        configs.find((config) => config.problemStatement?.trim())?.problemStatement ||
        best.workedExampleConfig?.problemStatement ||
        first.description,
      givens: uniqueStrings(configs.flatMap((config) => config.givens || [])),
      asks: uniqueStrings(configs.flatMap((config) => config.asks || [])),
      constraints: uniqueStrings(configs.flatMap((config) => config.constraints || [])),
      solutionPlan: uniqueStrings(configs.flatMap((config) => config.solutionPlan || [])),
      walkthroughSteps: uniqueStrings(configs.flatMap((config) => config.walkthroughSteps || [])),
      commonPitfalls: uniqueStrings(configs.flatMap((config) => config.commonPitfalls || [])),
      finalAnswer:
        [...configs].reverse().find((config) => config.finalAnswer?.trim())?.finalAnswer ||
        lastConfig?.finalAnswer,
      codeSnippet: configs.find((config) => config.codeSnippet?.trim())?.codeSnippet,
    },
    layoutIntent: {
      ...(best.layoutIntent || {}),
      layoutFamily: 'problem_solution',
      layoutTemplate: 'problem_walkthrough',
      disciplineStyle: best.layoutIntent?.disciplineStyle || 'math',
      teachingFlow: 'problem_walkthrough',
      density: 'standard',
      overflowPolicy: 'preserve_then_paginate',
      preserveFullProblemStatement: true,
    },
  });
}

function mergeWorkedExampleSequences(outlines: SceneOutline[]): SceneOutline[] {
  const merged: SceneOutline[] = [];
  let activeGroup: OutlineGroup | null = null;

  const flushActiveGroup = () => {
    if (!activeGroup) return;
    merged.push(
      activeGroup.outlines.length > 1 ? mergeWorkedExampleGroup(activeGroup) : activeGroup.outline,
    );
    activeGroup = null;
  };

  outlines.forEach((outline, index) => {
    const signature = buildWorkedExampleSignature(outline);
    if (!signature) {
      flushActiveGroup();
      merged.push(outline);
      return;
    }

    if (activeGroup?.signature === signature) {
      activeGroup.outlines.push(outline);
      activeGroup.outline = chooseRicherOutline(activeGroup.outline, outline);
      return;
    }

    flushActiveGroup();
    activeGroup = {
      signature,
      outline,
      outlines: [outline],
      firstIndex: index,
    };
  });

  flushActiveGroup();
  return merged;
}

function canDedupeSlideTopic(outline: SceneOutline): boolean {
  return (
    outline.type === 'slide' &&
    !outline.continuation &&
    !outline.workedExampleConfig &&
    !isTitleCoverOutline(outline) &&
    !isFinalSummaryOutline(outline)
  );
}

function getMaxQuizScenes(outlines: SceneOutline[]): number {
  const teachingSceneCount = outlines.filter(
    (outline) =>
      !isTitleCoverOutline(outline) && !isFinalSummaryOutline(outline) && !isQuizOutline(outline),
  ).length;
  if (teachingSceneCount <= 3) return 1;
  if (teachingSceneCount <= 7) return 3;
  if (teachingSceneCount <= 14) return 5;
  return 8;
}

function mergeQuizGroup(group: OutlineGroup): SceneOutline {
  const best = group.outlines.reduce(chooseRicherOutline, group.outline);
  const counts = group.outlines
    .map((outline) => outline.quizConfig?.questionCount || 0)
    .filter((count) => count > 0);
  const mergedQuestionCount =
    counts.length > 0
      ? Math.max(1, Math.min(2, Math.max(...counts)))
      : best.quizConfig?.questionCount || 1;
  const questionTypes = uniqueStrings(
    group.outlines.flatMap((outline) => outline.quizConfig?.questionTypes || []),
  ) as NonNullable<SceneOutline['quizConfig']>['questionTypes'];

  return {
    ...best,
    quizConfig: {
      difficulty: best.quizConfig?.difficulty || 'medium',
      questionTypes:
        questionTypes.length > 0 ? questionTypes : best.quizConfig?.questionTypes || ['single'],
      questionCount: mergedQuestionCount,
    },
  };
}

function compactSummaryOutline(outline: SceneOutline): SceneOutline {
  return {
    ...outline,
    archetype: 'summary',
    description: limitText(outline.description, 260) || outline.description,
    keyPoints: uniqueStrings(outline.keyPoints || []).slice(0, 4),
    layoutIntent: {
      ...(outline.layoutIntent || {}),
      layoutFamily: 'summary',
      layoutTemplate: 'summary_board',
      teachingFlow: 'standalone',
      density: 'light',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
  };
}

function resequenceOutlines(outlines: SceneOutline[]): SceneOutline[] {
  const seenIds = new Set<string>();
  return outlines.map((outline, index) => {
    let id = outline.id?.trim() || nanoid();
    if (seenIds.has(id)) id = nanoid();
    seenIds.add(id);

    return normalizeSceneOutlineContentProfile({
      ...outline,
      id,
      order: index + 1,
    });
  });
}

export function normalizeOutlineStructure(outlines: SceneOutline[]): SceneOutline[] {
  if (outlines.length <= 1) return resequenceOutlines(outlines);

  const normalized = outlines.map((outline, index) =>
    normalizeSceneOutlineContentProfile({
      ...outline,
      order: index + 1,
    }),
  );

  const mergedWorkedExamples = mergeWorkedExampleSequences(normalized);
  const covers: SceneOutline[] = [];
  const mainItems: SceneOutline[] = [];
  const summaries: SceneOutline[] = [];
  const quizGroups = new Map<string, OutlineGroup>();
  const topicIndex = new Map<string, number>();

  mergedWorkedExamples.forEach((outline, index) => {
    if (isTitleCoverOutline(outline)) {
      if (covers.length === 0) covers.push(outline);
      return;
    }

    if (isFinalSummaryOutline(outline)) {
      summaries.push(outline);
      return;
    }

    if (isQuizOutline(outline)) {
      const signature = buildQuizSignature(outline);
      const group = quizGroups.get(signature);
      if (group) {
        group.outlines.push(outline);
        group.outline = chooseRicherOutline(group.outline, outline);
        if (group.itemIndex !== undefined) {
          mainItems[group.itemIndex] = group.outline;
        }
      } else {
        quizGroups.set(signature, {
          signature,
          outline,
          outlines: [outline],
          firstIndex: index,
          itemIndex: mainItems.length,
        });
        mainItems.push(outline);
      }
      return;
    }

    if (canDedupeSlideTopic(outline)) {
      const signature = buildSlideTopicSignature(outline);
      const existingIndex = topicIndex.get(signature);
      if (existingIndex !== undefined) {
        mainItems[existingIndex] = chooseRicherOutline(mainItems[existingIndex], outline);
        return;
      }
      topicIndex.set(signature, mainItems.length);
    }

    mainItems.push(outline);
  });

  const maxQuizScenes = getMaxQuizScenes(mergedWorkedExamples);
  let keptQuizCount = 0;
  let previousKeptWasQuiz = false;
  let hasKeptTeachingBeforeQuiz = false;
  const distributedItems = mainItems.flatMap((outline) => {
    if (!isQuizOutline(outline)) {
      previousKeptWasQuiz = false;
      hasKeptTeachingBeforeQuiz = true;
      return [outline];
    }

    if (!hasKeptTeachingBeforeQuiz) return [];
    if (keptQuizCount >= maxQuizScenes || previousKeptWasQuiz) return [];

    const group = quizGroups.get(buildQuizSignature(outline));
    keptQuizCount += 1;
    previousKeptWasQuiz = true;
    return [group ? mergeQuizGroup(group) : outline];
  });

  const finalSummary =
    summaries.length > 0
      ? compactSummaryOutline(summaries.reduce(chooseRicherOutline, summaries[0]))
      : undefined;

  return resequenceOutlines([
    ...covers,
    ...distributedItems,
    ...(finalSummary ? [finalSummary] : []),
  ]);
}
