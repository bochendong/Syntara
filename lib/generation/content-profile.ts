import {
  inferNotebookContentProfileFromText,
  type NotebookContentProfile,
} from '@/lib/notebook-content';
import type { SceneArchetype, SceneOutline } from '@/lib/types/generation';

function collectOutlineSignals(outline: SceneOutline): string[] {
  const signals = [outline.title, outline.description, ...(outline.keyPoints || [])];
  const cfg = outline.workedExampleConfig;

  if (cfg) {
    signals.push(cfg.kind, cfg.role);
    if (cfg.problemStatement) signals.push(cfg.problemStatement);
    if (cfg.givens?.length) signals.push(...cfg.givens);
    if (cfg.asks?.length) signals.push(...cfg.asks);
    if (cfg.constraints?.length) signals.push(...cfg.constraints);
    if (cfg.solutionPlan?.length) signals.push(...cfg.solutionPlan);
    if (cfg.walkthroughSteps?.length) signals.push(...cfg.walkthroughSteps);
    if (cfg.commonPitfalls?.length) signals.push(...cfg.commonPitfalls);
    if (cfg.finalAnswer) signals.push(cfg.finalAnswer);
    if (cfg.codeSnippet) signals.push(cfg.codeSnippet);
  }

  return signals.filter(Boolean);
}

export function inferSceneContentProfile(outline: SceneOutline): NotebookContentProfile {
  if (outline.contentProfile) return outline.contentProfile;

  if (outline.type !== 'slide') {
    if (
      outline.type === 'quiz' &&
      outline.quizConfig?.questionTypes.some((type) => type === 'code' || type === 'code_tracing')
    ) {
      return 'code';
    }
    return 'general';
  }

  const workedExampleKind = outline.workedExampleConfig?.kind;
  if (workedExampleKind === 'code') return 'code';
  if (workedExampleKind === 'math' || workedExampleKind === 'proof') return 'math';

  return inferNotebookContentProfileFromText(collectOutlineSignals(outline).join('\n'));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferSceneArchetype(outline: SceneOutline): SceneArchetype {
  if (outline.archetype) return outline.archetype;

  const text = collectOutlineSignals(outline).join('\n');
  const lowerText = text.toLowerCase();
  const workedRole = outline.workedExampleConfig?.role;

  if (
    workedRole ||
    matchesAny(text, [
      /(例题|讲题|题目拆解|解法|走读|证明模板|trace|worked example|walkthrough|pitfall|易错点)/i,
    ])
  ) {
    return 'example';
  }

  if (
    outline.order <= 1 &&
    matchesAny(text, [/(导入|导览|概览|overview|introduction|roadmap|agenda|学习目标|课程结构)/i])
  ) {
    return 'intro';
  }

  if (
    matchesAny(text, [/(总结|小结|回顾|takeaway|summary|recap|next step|下一步|复习要点|结论)/i])
  ) {
    return 'summary';
  }

  if (
    matchesAny(text, [
      /(定义|定理|命题|引理|lemma|definition|theorem|proposition|corollary|判定准则)/i,
    ])
  ) {
    return 'definition';
  }

  if (
    matchesAny(text, [
      /(比较|联系|关系|承上启下|框架|总览|分类|对照|compare|relationship|bridge|overview|taxonomy|map)/i,
    ])
  ) {
    return 'bridge';
  }

  if (
    outline.order <= 1 &&
    matchesAny(lowerText, [/(intro|opening|welcome|course map|lesson goals)/i])
  ) {
    return 'intro';
  }

  return 'concept';
}

export function normalizeSceneOutlineContentProfile(outline: SceneOutline): SceneOutline {
  return {
    ...outline,
    contentProfile: inferSceneContentProfile(outline),
    archetype: inferSceneArchetype(outline),
  };
}

export function formatSceneArchetypeForPrompt(
  archetype: SceneArchetype,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  const zhGuidance: Record<SceneArchetype, string[]> = {
    intro: [
      '页面骨架：intro',
      '- 用于课程导入、学习目标、路线图或整体预告。',
      '- 优先使用标题 + 概览段落 / bullet_list / callout。',
      '- 不要塞复杂表格、多层分类或碎片化节点。',
    ],
    concept: [
      '页面骨架：concept',
      '- 用于概念讲解、直觉解释、性质说明。',
      '- 优先使用 paragraph、bullet_list、callout，必要时再加少量 equation。',
      '- 保持一条主解释线，不要把页面拆成很多并列小片段。',
    ],
    definition: [
      '页面骨架：definition',
      '- 用于定义、定理、命题、判定条件与证明思路。',
      '- 优先使用 definition、theorem、equation、derivation_steps、bullet_list。',
      '- 不要输出漂浮关系图或伪流程图。',
    ],
    example: [
      '页面骨架：example',
      '- 用于讲题、走读、证明步骤、代码 walkthrough。',
      '- 优先使用 example、equation、derivation_steps、code_walkthrough、callout。',
      '- 强调顺序性和连续讲解，不要平铺太多并列卡片。',
    ],
    bridge: [
      '页面骨架：bridge',
      '- 用于承上启下、关系梳理、分类、比较、框架总览。',
      '- 优先使用 table、bullet_list、callout、definition、theorem。',
      '- 禁止用很多小标签、箭头、节点去暗示关系图；要压缩成稳定结构。',
    ],
    summary: [
      '页面骨架：summary',
      '- 用于回顾、总结、收束、下一步提示。',
      '- 优先使用 bullet_list、callout、paragraph，突出 takeaways。',
      '- 不要在总结页引入大段新知识展开。',
    ],
  };

  const enGuidance: Record<SceneArchetype, string[]> = {
    intro: [
      'Slide archetype: intro',
      '- Use for openings, learning goals, roadmap, and orientation.',
      '- Prefer a title plus overview paragraph / bullet_list / callout.',
      '- Avoid dense tables, layered classifications, or fragmented nodes.',
    ],
    concept: [
      'Slide archetype: concept',
      '- Use for concept explanation, intuition, and property-focused teaching.',
      '- Prefer paragraph, bullet_list, and callout, with only light equation support if needed.',
      '- Keep one clear explanatory thread instead of many parallel fragments.',
    ],
    definition: [
      'Slide archetype: definition',
      '- Use for definitions, theorems, propositions, criteria, and proof ideas.',
      '- Prefer definition, theorem, equation, derivation_steps, and bullet_list.',
      '- Do not imply floating relationship diagrams or pseudo-flowcharts.',
    ],
    example: [
      'Slide archetype: example',
      '- Use for worked examples, walkthroughs, proof steps, and code tracing.',
      '- Prefer example, equation, derivation_steps, code_walkthrough, and callout.',
      '- Preserve order and continuity instead of spreading the content into parallel cards.',
    ],
    bridge: [
      'Slide archetype: bridge',
      '- Use for transitions, comparisons, classifications, relationships, and framework overviews.',
      '- Prefer table, bullet_list, callout, definition, and theorem.',
      '- Do not simulate a relationship graph with many small labels, nodes, or arrows; compress it into stable structures.',
    ],
    summary: [
      'Slide archetype: summary',
      '- Use for recap, takeaways, closure, and next-step prompts.',
      '- Prefer bullet_list, callout, and paragraph with strong takeaways.',
      '- Do not introduce a large amount of new explanatory content here.',
    ],
  };

  return (language === 'zh-CN' ? zhGuidance[archetype] : enGuidance[archetype]).join('\n');
}

export function formatContentProfileForPrompt(
  profile: NotebookContentProfile,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (language === 'zh-CN') {
    const detail =
      profile === 'code'
        ? [
            '内容 profile：code',
            '- 这是编程 / 算法讲解页。',
            '- 优先保留代码结构、执行顺序、变量状态变化、输入输出示例与调试思路。',
            '- 不要把代码讲解压扁成抽象 bullet；能用 code_walkthrough 就不要只给 paragraph。',
          ]
        : profile === 'math'
          ? [
              '内容 profile：math',
              '- 这是公式 / 证明 / 矩阵 / 推导类页面。',
              '- 优先保留符号结构、矩阵结构、推导链与关键中间结果。',
              '- 不要把公式或矩阵压扁成摘要句子；能用 equation / matrix / derivation_steps 就不要只给 paragraph。',
            ]
          : [
              '内容 profile：general',
              '- 这是通用概念讲解页。',
              '- 以清晰结构和可读性为主；只有在确实需要时才使用公式或代码专用块。',
            ];

    return detail.join('\n');
  }

  if (profile === 'code') {
    return [
      'Content profile: code',
      '- This slide is primarily a programming / algorithm explanation.',
      '- Preserve code structure, execution order, variable-state changes, IO examples, and debugging logic.',
      '- Prefer code_walkthrough over flattening the explanation into abstract bullets.',
    ].join('\n');
  }

  if (profile === 'math') {
    return [
      'Content profile: math',
      '- This slide is primarily formula / proof / matrix / derivation content.',
      '- Preserve symbolic structure, matrix layout, derivation flow, and key intermediate results.',
      '- Prefer equation / matrix / derivation_steps over flattening formulas into prose.',
    ].join('\n');
  }

  return [
    'Content profile: general',
    '- This slide is primarily a general concept explanation.',
    '- Optimize for clear structure and readability; only use math/code-specific blocks when truly needed.',
  ].join('\n');
}
