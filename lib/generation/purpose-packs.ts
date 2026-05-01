import type { CoursePersonalizationContext } from './pipeline-types';

type PromptLanguage = 'zh-CN' | 'en-US';
type PurposePackStage = 'outline' | 'semantic';
type PurposePackId = NonNullable<CoursePersonalizationContext['purpose']>;

interface PurposePack {
  id: PurposePackId;
  label: Record<PromptLanguage, string>;
  outlineGuidance: Record<PromptLanguage, string[]>;
  semanticGuidance: Record<PromptLanguage, string[]>;
}

const RESEARCH_PACK: PurposePack = {
  id: 'research',
  label: {
    'zh-CN': '科研',
    'en-US': 'Research',
  },
  outlineGuidance: {
    'zh-CN': [
      '科研模式对所有学科使用同一套课程组织逻辑，不按地理/经济/社会学/论文写作等学科包分叉。',
      '课程应像 seminar note / research briefing：研究问题 -> 概念边界 -> 文献或争议脉络 -> 方法/证据 -> 局限 -> 下一步。',
      '默认不要插入 quiz、正式作业题、考试题或 standalone interactive；除非用户明确要求练习、测验或交互可视化。',
      '强调证据质量、假设、变量/材料来源、方法适配性、可替代解释与研究局限。',
      '学科信息只作为术语和材料类型参考，不改变科研模式的统一结构。',
    ],
    'en-US': [
      'Research mode uses one shared course organization logic across all disciplines; do not branch into geography/economics/sociology/writing-specific teaching packs.',
      'The course should feel like a seminar note or research briefing: research question -> conceptual scope -> literature or debate map -> method/evidence -> limitations -> next steps.',
      'Do not add quizzes, formal homework/exam problems, or standalone interactives by default unless the user explicitly asks for practice, assessment, or interactive visualization.',
      'Emphasize evidence quality, assumptions, variables/material sources, method fit, alternative explanations, and research limitations.',
      'Use discipline information only as terminology and material-type context; do not let it override the unified research structure.',
    ],
  },
  semanticGuidance: {
    'zh-CN': [
      '科研页面统一组织为：研究问题/主张 -> 方法或证据 -> 解释 -> 局限/下一步。',
      '用 `\\table` 比较文献、方法、证据类型、变量、案例或解释路径。',
      '用 `\\callout` 标出假设、局限、证据质量或可替代解释。',
      '避免课堂化小测、作业题口吻和泛泛科普口吻。',
    ],
    'en-US': [
      'Research pages should share this structure: research question/claim -> method or evidence -> interpretation -> limitation/next step.',
      'Use `\\table` to compare literature, methods, evidence types, variables, cases, or explanatory paths.',
      'Use `\\callout` for assumptions, limitations, evidence quality, or alternative explanations.',
      'Avoid classroom-quiz wording, homework-problem framing, and generic popular-explanation tone.',
    ],
  },
};

function formatPurposePack(pack: PurposePack, language: PromptLanguage, stage: PurposePackStage) {
  const title =
    language === 'zh-CN'
      ? `## 用途包：${pack.label[language]}`
      : `## Purpose Pack: ${pack.label[language]}`;
  const rules =
    stage === 'outline' ? pack.outlineGuidance[language] : pack.semanticGuidance[language];
  return [title, ...rules.map((rule) => `- ${rule}`)].join('\n');
}

export function formatPurposeGuidanceForPrompt(args: {
  language: PromptLanguage;
  purpose?: CoursePersonalizationContext['purpose'];
  stage: PurposePackStage;
}): string {
  if (args.purpose !== 'research') return '';
  return formatPurposePack(RESEARCH_PACK, args.language, args.stage);
}
