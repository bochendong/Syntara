import { markSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import type {
  GeneratedSlideContent,
  SceneLayoutIntent,
  SceneOutline,
} from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics, SlideContent, Stage } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';

import { CODE_SPLIT_SNIPPET, TWEET_SHARED_EXAMPLE } from './page-presets';
import { getQualityPreset } from './page-preset-groups';
import { materializeQaMediaPlaceholders } from './page-media';
import { DEFAULT_THEME } from './page-state';
import { QA_STAGE_ID, type DeckStyleValue, type LayoutOptionValue } from './page-types';

export function layoutFamilyForTemplate(
  template: LayoutOptionValue,
): SceneLayoutIntent['layoutFamily'] {
  switch (template) {
    case 'image_title_overlay':
    case 'cinematic_title_frame':
    case 'tech_hero_title':
      return 'cover';
    case 'pipeline_table':
    case 'comparison_matrix':
      return 'comparison';
    case 'process_steps':
      return 'timeline';
    case 'visual_three_steps':
      return 'visual_split';
    case 'text_image_split':
      return 'visual_split';
    case 'two_text_image':
      return 'visual_split';
    case 'two_by_one_summary':
      return 'summary';
    case 'three_cards':
      return 'concept_cards';
    case 'four_columns':
      return 'concept_cards';
    case 'grid_2x2':
      return 'concept_cards';
    case 'code_split':
      return 'code_walkthrough';
  }
}

export function buildOutline(args: {
  presetId: string;
  title: string;
  description: string;
  keyPoints: string[];
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  language: 'zh-CN' | 'en-US';
  id?: string;
}): SceneOutline {
  const preset = getQualityPreset(args.presetId);
  const outlineText = [args.title, args.description, ...args.keyPoints, preset.concreteAnchor]
    .join('\n')
    .trim();
  const usesTweetMemory = /\bTweet\b|Tweet\(\)|\buserid\b|\bcreated_at\b/.test(outlineText);
  const layoutIntent: SceneLayoutIntent = {
    layoutFamily: layoutFamilyForTemplate(args.layoutTemplate),
    layoutTemplate: args.layoutTemplate,
    disciplineStyle: preset.disciplineStyle,
    teachingFlow: preset.teachingFlow,
    density: 'standard',
    deckStyle: args.deckStyle,
    visualRole: preset.visualRole,
    overflowPolicy: preset.overflowPolicy || 'compress_first',
    preserveFullProblemStatement: preset.preserveFullProblemStatement || false,
  };

  return {
    id: args.id || 'qa-outline-preview',
    type: 'slide',
    contentProfile: preset.contentProfile,
    archetype: preset.archetype,
    layoutIntent,
    title: args.title.trim() || preset.title,
    description: args.description.trim(),
    keyPoints: args.keyPoints.length > 0 ? args.keyPoints : preset.keyPoints,
    teachingObjective: preset.teachingObjective,
    teachingPlanId: 'qa-teaching-plan',
    teachingRole: preset.teachingRole,
    teachingPagePlan: {
      id: `${args.id || 'qa-outline-preview'}-page-plan`,
      order: 1,
      title: args.title.trim() || preset.title,
      role: preset.teachingRole,
      openingMove: preset.openingMove,
      concreteAnchor: preset.concreteAnchor,
      studentThinkingMove: preset.studentThinkingMove,
      transferRule: preset.transferRule,
      requiredComponentKinds: [...preset.requiredComponentKinds],
      forbiddenPatterns: [],
      contentProfile: preset.contentProfile,
      disciplineStyle: preset.disciplineStyle,
      teachingFlow: preset.teachingFlow,
      layoutFamily: layoutIntent.layoutFamily,
      layoutTemplate: args.layoutTemplate,
    },
    studentThinkingMove: preset.studentThinkingMove,
    requiredComponentKinds: [...preset.requiredComponentKinds],
    sharedExamples:
      preset.sharedExamples || usesTweetMemory
        ? preset.sharedExamples || [TWEET_SHARED_EXAMPLE]
        : undefined,
    usesExampleIds:
      preset.usesExampleIds || usesTweetMemory
        ? preset.usesExampleIds || [TWEET_SHARED_EXAMPLE.id]
        : undefined,
    continuity:
      preset.continuity || usesTweetMemory
        ? preset.continuity || {
            usesExampleIds: [TWEET_SHARED_EXAMPLE.id],
            previousHandoff: '前面已经用 list/dict 的错误状态说明旧表示守不住 Tweet 的对象规则。',
            currentJob: preset.studentThinkingMove,
            nextHandoff: preset.transferRule,
          }
        : undefined,
    mediaGenerations: preset.mediaGenerations ? [...preset.mediaGenerations] : undefined,
    workedExampleConfig: preset.workedExampleConfig,
    order: 0,
    language: args.language,
  };
}

export function buildStage(
  language: 'zh-CN' | 'en-US',
  deckStyle: DeckStyleValue,
  now = 0,
  overrides?: { id?: string; name?: string; description?: string },
): Stage {
  return {
    id: overrides?.id || QA_STAGE_ID,
    name:
      overrides?.name || (language === 'zh-CN' ? '单页生成质量测试' : 'Single Page Generation QA'),
    description:
      overrides?.description ||
      (language === 'zh-CN'
        ? '只调用一次 scene-content 的单页生成质检页面'
        : 'One scene-content call for focused slide generation QA'),
    language,
    style: `single-page-quality-test; deckStyle=${deckStyle}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildQualityAllOutlines(current: SceneOutline): SceneOutline[] {
  const usesTweetMemory = current.usesExampleIds?.includes(TWEET_SHARED_EXAMPLE.id);
  if (!usesTweetMemory) return [current];

  const sharedFields = {
    type: 'slide' as const,
    contentProfile: current.contentProfile,
    layoutIntent: current.layoutIntent,
    teachingPlanId: current.teachingPlanId,
    teachingRole: current.teachingRole,
    requiredComponentKinds: current.requiredComponentKinds,
    sharedExamples: current.sharedExamples,
    usesExampleIds: [TWEET_SHARED_EXAMPLE.id],
    language: current.language,
  };

  const previous: SceneOutline = {
    ...sharedFields,
    id: `${current.id}-memory-prev`,
    archetype: 'concept',
    title: '旧表示为什么失败',
    description:
      '前一页比较 list 和 dict 表示 Tweet 时，已经暴露了位置顺序、字段缺失和操作边界的问题。',
    keyPoints: [
      "list 示例 ['David', '2017-09-19', 'Hello, I am so cool', 0] 只能靠位置猜语义。",
      "错误 list [55, 'Diane', 'Older and even cooler', '2017-09-19'] 仍可能被客户端接收。",
      '缺少日期的 dict 说明字段名还不等于完整初始化边界。',
    ],
    teachingObjective: '让学生看到旧表示守不住 Tweet 的对象规则。',
    teachingPagePlan: {
      id: `${current.id}-memory-prev-plan`,
      order: 0,
      title: '旧表示为什么失败',
      role: 'failure_demo',
      openingMove: '先看 list/dict 会接受哪些 Tweet 错误状态。',
      concreteAnchor:
        TWEET_SHARED_EXAMPLE.malformedData?.join('\n') || TWEET_SHARED_EXAMPLE.description,
      studentThinkingMove: '找出旧表示仍然允许的结构错误和规则错误。',
      transferRule: '旧表示的问题会推动我们把字段和操作边界集中到 Tweet 类。',
      requiredComponentKinds: ['table'],
      forbiddenPatterns: [],
      contentProfile: current.contentProfile,
      disciplineStyle: current.layoutIntent?.disciplineStyle,
      teachingFlow: current.layoutIntent?.teachingFlow,
      layoutFamily: current.layoutIntent?.layoutFamily,
      layoutTemplate: current.layoutIntent?.layoutTemplate,
    },
    order: current.order - 1,
  };

  const next: SceneOutline = {
    ...sharedFields,
    id: `${current.id}-memory-next`,
    archetype: 'example',
    title: '__init__、self 和点号访问',
    description:
      '下一页会把 Tweet 的对象边界落到代码上：用 __init__ 写入字段，用 self 保存状态，再用点号访问属性。',
    keyPoints: [
      'Tweet(...) 创建一个具体实例。',
      'self.userid、self.created_at、self.content、self.likes 写入同一个对象。',
      '点号访问依赖对象已经拥有对应属性。',
    ],
    teachingObjective: '把 Tweet 的设计边界迁移到 __init__ 和 self 的执行模型。',
    teachingPagePlan: {
      id: `${current.id}-memory-next-plan`,
      order: 2,
      title: '__init__、self 和点号访问',
      role: 'state_trace',
      openingMove: '把 Tweet 设计放进 __init__ 的执行过程里看。',
      concreteAnchor: CODE_SPLIT_SNIPPET,
      studentThinkingMove: '追踪每一行如何把值写进同一个 Tweet 实例。',
      transferRule: '属性访问成功的前提是对象已经在初始化中拥有对应字段。',
      requiredComponentKinds: ['trace'],
      forbiddenPatterns: [],
      contentProfile: current.contentProfile,
      disciplineStyle: current.layoutIntent?.disciplineStyle,
      teachingFlow: current.layoutIntent?.teachingFlow,
      layoutFamily: current.layoutIntent?.layoutFamily,
      layoutTemplate: 'code_split',
    },
    order: current.order + 1,
  };

  return [previous, current, next];
}

export function buildSceneFromGeneratedContent(args: {
  content: GeneratedSlideContent;
  outline: SceneOutline;
  diagnostics?: SceneGenerationDiagnostics;
}): Scene {
  const slide: Slide = {
    id: `qa-slide-${Date.now()}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: args.content.theme || DEFAULT_THEME,
    elements: materializeQaMediaPlaceholders(args.content.elements, args.outline),
    background: args.content.background,
  };

  const renderedContent = markSemanticSlideContent({
    type: 'slide',
    canvas: slide,
    syntaraMarkup: args.content.syntaraMarkup,
    semanticDocument: args.content.contentDocument,
  });
  const slideContent: SlideContent =
    renderedContent.type === 'slide'
      ? {
          ...renderedContent,
          canvas: {
            ...renderedContent.canvas,
            elements: materializeQaMediaPlaceholders(renderedContent.canvas.elements, args.outline),
          },
        }
      : renderedContent;

  const now = Date.now();
  return {
    id: `qa-scene-${now}`,
    stageId: QA_STAGE_ID,
    type: 'slide',
    title: args.outline.title,
    order: args.outline.order,
    content: slideContent,
    actions: [],
    generationDiagnostics: args.diagnostics,
    createdAt: now,
    updatedAt: now,
  };
}
