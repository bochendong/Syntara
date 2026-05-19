import { nanoid } from 'nanoid';
import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import {
  isFinalSummaryOutline,
  normalizeOutlineStructure,
} from '@/lib/generation/outline-structure';
import { isTitleCoverOutline } from '@/lib/generation/title-cover';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  OrchestratorOutlineLength,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';

export type EffectiveMediaFlags = {
  imageEnabled: boolean;
  videoEnabled: boolean;
};

export type OutlineCoverageCheck = {
  totalScenes: number;
  minSceneCount: number;
  workedExampleSequenceCount: number;
  minWorkedExampleSequenceCount: number;
  missingSceneCount: number;
  missingWorkedExampleSequences: number;
  candidateExampleTopics: string[];
};

export function isCountedTeachingOutline(outline: SceneOutline): boolean {
  return !isTitleCoverOutline(outline) && outline.type !== 'quiz';
}

export function filterOutlineMediaGenerations(
  outlines: SceneOutline[],
  flags: EffectiveMediaFlags,
): SceneOutline[] {
  return outlines.map((outline) => {
    if (!outline.mediaGenerations?.length) return outline;

    const mediaGenerations = outline.mediaGenerations.filter((media) => {
      if (media.type === 'image' && !flags.imageEnabled) return false;
      if (media.type === 'video' && !flags.videoEnabled) return false;
      return true;
    });

    if (mediaGenerations.length === outline.mediaGenerations.length) {
      return outline;
    }

    if (mediaGenerations.length === 0) {
      const nextOutline = { ...outline };
      delete nextOutline.mediaGenerations;
      return nextOutline;
    }

    return {
      ...outline,
      mediaGenerations,
    };
  });
}

export function applyOutlinePreferenceHardConstraints(
  outlines: SceneOutline[],
  args: {
    coursePurpose?: 'research' | 'university' | 'daily';
    outlinePreferences?: {
      length: OrchestratorOutlineLength;
      includeQuizScenes: boolean;
      workedExampleLevel?: OrchestratorWorkedExampleLevel;
    } | null;
  },
): SceneOutline[] {
  const prefs = args.outlinePreferences;
  const disallowInteractive = args.coursePurpose === 'research';

  if ((!prefs || prefs.includeQuizScenes) && !disallowInteractive) return outlines;

  return outlines.map((outline) => {
    if (!prefs?.includeQuizScenes && outline.type === 'quiz') {
      const nextOutline: SceneOutline = {
        ...outline,
        type: 'slide',
      };
      delete nextOutline.quizConfig;
      return nextOutline;
    }

    if (disallowInteractive && outline.type === 'interactive') {
      const nextOutline: SceneOutline = {
        ...outline,
        type: 'slide',
      };
      delete nextOutline.interactiveConfig;
      return nextOutline;
    }

    return outline;
  });
}

export function applyOutlineLanguage(
  outlines: SceneOutline[],
  language: 'zh-CN' | 'en-US',
): SceneOutline[] {
  return outlines.map((outline) =>
    normalizeSceneOutlineContentProfile({
      ...outline,
      language,
    }),
  );
}

function getMinimumSceneCount(length: OrchestratorOutlineLength): number {
  switch (length) {
    case 'minimal':
      return 4;
    case 'compact':
      return 6;
    case 'extended':
      return 21;
    case 'standard':
    default:
      return 10;
  }
}

function getBaseWorkedExampleMinimum(level: OrchestratorWorkedExampleLevel): number {
  switch (level) {
    case 'none':
      return 0;
    case 'light':
      return 1;
    case 'heavy':
      return 5;
    case 'moderate':
    default:
      return 2;
  }
}

function countWorkedExampleSequences(outlines: SceneOutline[]): number {
  const seenExampleIds = new Set<string>();
  let contiguousFallbackSequences = 0;
  let previousWasFallbackExample = false;

  for (const outline of outlines) {
    if (!isCountedTeachingOutline(outline)) continue;
    const cfg = outline.workedExampleConfig;
    if (!cfg) {
      previousWasFallbackExample = false;
      continue;
    }

    const exampleId = cfg.exampleId?.trim();
    if (exampleId) {
      seenExampleIds.add(exampleId);
      previousWasFallbackExample = false;
      continue;
    }

    if (!previousWasFallbackExample) {
      contiguousFallbackSequences += 1;
    }
    previousWasFallbackExample = true;
  }

  return seenExampleIds.size + contiguousFallbackSequences;
}

function collectWorkedExampleCandidateTopics(outlines: SceneOutline[], limit = 6): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const outline of outlines) {
    if (!isCountedTeachingOutline(outline)) continue;
    if (outline.type !== 'slide' || outline.workedExampleConfig) continue;
    const title = outline.title.trim();
    if (!title) continue;

    const signature = title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(signature)) continue;
    seen.add(signature);

    const firstKeyPoint = outline.keyPoints.find((item) => item.trim().length > 0)?.trim();
    topics.push(firstKeyPoint ? `${title} — ${firstKeyPoint}` : title);
    if (topics.length >= limit) break;
  }

  return topics;
}

export function analyzeOutlineCoverage(args: {
  outlines: SceneOutline[];
  outlinePreferences?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null;
}): OutlineCoverageCheck | null {
  const prefs = args.outlinePreferences;
  if (!prefs) return null;

  const contentOutlines = args.outlines.filter(isCountedTeachingOutline);
  const totalScenes = contentOutlines.length;
  const minSceneCount = getMinimumSceneCount(prefs.length);
  const pageBudget = Math.max(totalScenes, minSceneCount);
  const maxWorkedExamplesByBudget = Math.max(0, pageBudget - 4);
  const desiredWorkedExamples = getBaseWorkedExampleMinimum(prefs.workedExampleLevel ?? 'moderate');
  const minWorkedExampleSequenceCount = Math.min(desiredWorkedExamples, maxWorkedExamplesByBudget);
  const workedExampleSequenceCount = countWorkedExampleSequences(contentOutlines);

  return {
    totalScenes,
    minSceneCount,
    workedExampleSequenceCount,
    minWorkedExampleSequenceCount,
    missingSceneCount: Math.max(0, minSceneCount - totalScenes),
    missingWorkedExampleSequences: Math.max(
      0,
      minWorkedExampleSequenceCount - workedExampleSequenceCount,
    ),
    candidateExampleTopics: collectWorkedExampleCandidateTopics(contentOutlines),
  };
}

export function normalizeOutlineCollection(outlines: SceneOutline[]): SceneOutline[] {
  const seenIds = new Set<string>();
  const normalized = outlines.map((outline, index) => {
    let id = outline.id?.trim() || nanoid();
    if (seenIds.has(id)) id = nanoid();
    seenIds.add(id);
    return normalizeSceneOutlineContentProfile({
      ...outline,
      id,
      order: index + 1,
    });
  });
  return normalizeOutlineStructure(normalized);
}

function buildOutlineDedupSignature(outline: SceneOutline): string {
  const normalizedTitle = outline.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const cfg = outline.workedExampleConfig;
  return [outline.type, normalizedTitle, cfg?.exampleId?.trim() || '', cfg?.role || ''].join('|');
}

export function mergeSupplementalOutlines(
  currentOutlines: SceneOutline[],
  supplementalOutlines: SceneOutline[],
): SceneOutline[] {
  if (!supplementalOutlines.length) return currentOutlines;

  const seen = new Set(currentOutlines.map(buildOutlineDedupSignature));
  const uniqueSupplemental = supplementalOutlines.filter((outline) => {
    const signature = buildOutlineDedupSignature(outline);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  if (!uniqueSupplemental.length) return currentOutlines;
  return normalizeOutlineCollection([...currentOutlines, ...uniqueSupplemental]);
}

export function buildOutlineRepairRequirement(args: {
  language: 'zh-CN' | 'en-US';
  originalRequirement: string;
  currentOutlines: SceneOutline[];
  coverage: OutlineCoverageCheck;
  passNumber: number;
}): string {
  const targetAdditionalScenes = Math.max(
    args.coverage.missingSceneCount,
    args.coverage.missingWorkedExampleSequences > 0
      ? args.coverage.missingWorkedExampleSequences * 2
      : 0,
  );
  const currentSummary = args.currentOutlines
    .slice(0, 24)
    .map((outline, index) => {
      const suffix = outline.workedExampleConfig
        ? ` [example:${outline.workedExampleConfig.exampleId || outline.workedExampleConfig.role}]`
        : '';
      return `${index + 1}. [${outline.type}] ${outline.title}${suffix} — ${outline.description}`;
    })
    .join('\n');
  const hasExistingSummary = args.currentOutlines.some(isFinalSummaryOutline);

  if (args.language === 'zh-CN') {
    const topicLines =
      args.coverage.candidateExampleTopics.length > 0
        ? args.coverage.candidateExampleTopics.map((topic) => `- ${topic}`).join('\n')
        : '- 优先围绕当前 notebook 里尚未配套例题的核心知识点、方法与易错点补充';

    return [
      '你不是在重写整本 notebook，而是在补充已有 notebook 缺失的大纲页。',
      '',
      '## 原始用户需求',
      args.originalRequirement,
      '',
      '## 当前大纲缺口',
      '- 页数口径：只统计正文教学页；封面页和 quiz/测验页都不计入页数，也不能拿它们补正文页数。',
      `- 当前共有 ${args.coverage.totalScenes} 个正文教学页，需要至少 ${args.coverage.minSceneCount} 个，因此还需补充至少 ${args.coverage.missingSceneCount} 个正文教学页。`,
      `- 当前共有 ${args.coverage.workedExampleSequenceCount} 组完整例题 / 走读序列，需要至少 ${args.coverage.minWorkedExampleSequenceCount} 组，因此还需补充至少 ${args.coverage.missingWorkedExampleSequences} 组新的例题序列。`,
      `- 这是第 ${args.passNumber} 次补充，请优先补足缺口而不是重复已有页。`,
      '',
      '## 已有场景摘要（禁止重复）',
      currentSummary || '暂无',
      '',
      '## 例题优先覆盖的知识点',
      topicLines,
      '',
      '## 补充输出要求',
      `- 只输出“新增”的 scene outlines JSON 数组，不要重写整本课。目标新增约 ${Math.max(1, targetAdditionalScenes)} 个正文教学页。`,
      '- 不要复用已有标题，不要生成近似重复的页面。',
      '- 为了补页数，新增页面必须优先使用 `slide` 或必要的 `interactive`；不要用 `cover` 或 `quiz` 充当正文教学页。',
      '- 如果补充例题序列，优先使用 `slide` + `workedExampleConfig`，并让序列首张通常为 `role: "problem_statement"`。',
      '- 每个新增例题都必须有具体原题；数学/矩阵/线性系统类例题必须写出实际方程、矩阵、行变换、中间结果，不能写成“给定一个矩阵”这种空壳题。',
      hasExistingSummary
        ? '- 已有总结/回顾页时，不要再补充新的总结页；新增例题、概念或练习必须放在最终总结之前。'
        : '- 如果确实需要补充总结页，只能补 1 页，并且它必须是整本 notebook 的最后一页。',
      '- 如果补充 quiz，只能作为某个知识点后的轻量即时检查；每个 quiz 通常 1–2 题，不要生成同主题变体。',
      '- 若页数不足但例题数量已够，请优先补充承上启下的概念解释、易错点或对比页，而不是堆空标题或重复总结。',
      '- 新增内容必须与已有 notebook 连续衔接，形成“概念 -> 例题 -> 概念 -> 例题”的节奏。',
    ].join('\n');
  }

  const topicLines =
    args.coverage.candidateExampleTopics.length > 0
      ? args.coverage.candidateExampleTopics.map((topic) => `- ${topic}`).join('\n')
      : '- Prefer major concepts, methods, and pitfalls that still lack their own worked examples';

  return [
    'Do not rewrite the whole notebook. You are extending an existing notebook with missing outline pages only.',
    '',
    '## Original User Requirement',
    args.originalRequirement,
    '',
    '## Current Gaps',
    '- Page-count rule: count teaching/content pages only; cover pages and quiz scenes do not count and must not be used to satisfy the teaching-page budget.',
    `- The notebook currently has ${args.coverage.totalScenes} teaching/content pages, but it needs at least ${args.coverage.minSceneCount}, so add at least ${args.coverage.missingSceneCount} more teaching/content pages.`,
    `- It currently has ${args.coverage.workedExampleSequenceCount} worked-example sequences, but it needs at least ${args.coverage.minWorkedExampleSequenceCount}, so add at least ${args.coverage.missingWorkedExampleSequences} new worked-example sequences.`,
    `- This is repair pass ${args.passNumber}; prioritize filling the gaps instead of repeating existing pages.`,
    '',
    '## Existing Scenes Summary (do not duplicate)',
    currentSummary || 'None',
    '',
    '## Topics That Should Gain Worked Examples First',
    topicLines,
    '',
    '## Output Rules',
    `- Output only the NEW scene outlines as a JSON array. Do not regenerate the full notebook. Aim for about ${Math.max(1, targetAdditionalScenes)} additional teaching/content pages.`,
    '- Do not reuse existing titles or produce near-duplicate pages.',
    '- To fill the page gap, new pages should be `slide` or necessary `interactive` scenes; do not use `cover` or `quiz` scenes to satisfy the teaching-page count.',
    '- When adding worked-example sequences, prefer `slide` scenes with `workedExampleConfig`, and usually start each new sequence with `role: "problem_statement"`.',
    '- Every new worked example must contain a concrete original problem. For math / matrix / linear-system topics, include actual equations, matrices, row operations, and intermediate results instead of placeholder wording.',
    hasExistingSummary
      ? '- If a summary/recap page already exists, do not add another one; any new example, concept, or practice page must come before the final summary.'
      : '- If a summary page is truly needed, add at most one and make it the final notebook page.',
    '- If adding quiz scenes, use them only as lightweight checks after a knowledge point; keep each quiz to 1-2 questions and do not create same-topic variants.',
    '- If page count is short but worked-example count is already sufficient, add bridging concept slides, pitfalls, or comparisons instead of hollow filler or duplicate recap pages.',
    '- The added pages should create a clear "concept -> worked example -> concept -> worked example" rhythm with the existing notebook.',
  ].join('\n');
}
