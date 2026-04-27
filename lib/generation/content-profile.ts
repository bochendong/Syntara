import {
  inferNotebookContentProfileFromText,
  type NotebookContentLayoutFamily,
  type NotebookContentProfile,
} from '@/lib/notebook-content';
import type { SceneArchetype, SceneLayoutIntent, SceneOutline } from '@/lib/types/generation';

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

function inferSceneLayoutFamily(
  outline: SceneOutline,
  profile: NotebookContentProfile,
  archetype: SceneArchetype,
): NotebookContentLayoutFamily {
  if (outline.layoutIntent?.layoutFamily) return outline.layoutIntent.layoutFamily;

  const text = collectOutlineSignals(outline).join('\n');
  const worked = outline.workedExampleConfig;
  const hasMedia = Boolean(outline.suggestedImageIds?.length || outline.mediaGenerations?.length);

  if (archetype === 'intro') return outline.order <= 1 ? 'cover' : 'section';
  if (archetype === 'summary') return 'summary';

  if (worked?.role === 'problem_statement') return 'problem_statement';
  if (worked?.kind === 'code' || profile === 'code') return 'code_walkthrough';
  if (worked?.kind === 'proof' || worked?.kind === 'math') {
    return worked.role === 'walkthrough' ? 'derivation' : 'problem_solution';
  }
  if (worked) return worked.role === 'summary' ? 'summary' : 'problem_solution';

  if (hasMedia) return 'visual_split';
  if (matchesAny(text, [/(推导|证明|derive|derivation|proof|row operation|行变换)/i])) {
    return 'derivation';
  }
  if (profile === 'math' && matchesAny(text, [/(公式|方程|矩阵|matrix|equation|formula)/i])) {
    return 'formula_focus';
  }
  if (matchesAny(text, [/(比较|对比|分类|矩阵|表格|compare|comparison|taxonomy|table)/i])) {
    return 'comparison';
  }
  if (matchesAny(text, [/(流程|步骤|机制|路径|timeline|process|flow|sequence|pipeline)/i])) {
    return 'timeline';
  }
  if (archetype === 'bridge') return 'comparison';
  if (archetype === 'definition' && profile === 'math') return 'formula_focus';

  return 'concept_cards';
}

function inferSceneLayoutIntent(
  outline: SceneOutline,
  profile: NotebookContentProfile,
  archetype: SceneArchetype,
): SceneLayoutIntent {
  const layoutFamily = inferSceneLayoutFamily(outline, profile, archetype);
  const hasSourceImage = Boolean(outline.suggestedImageIds?.length);
  const hasGeneratedImage = Boolean(
    outline.mediaGenerations?.some((media) => media.type === 'image'),
  );
  const preserveFullProblemStatement =
    outline.layoutIntent?.preserveFullProblemStatement ??
    Boolean(outline.workedExampleConfig?.role === 'problem_statement');

  return {
    layoutFamily,
    density:
      outline.layoutIntent?.density ??
      (layoutFamily === 'cover' || layoutFamily === 'section' ? 'light' : 'standard'),
    visualRole:
      outline.layoutIntent?.visualRole ??
      (hasSourceImage ? 'source_image' : hasGeneratedImage ? 'generated_image' : 'none'),
    overflowPolicy:
      outline.layoutIntent?.overflowPolicy ??
      (preserveFullProblemStatement ? 'preserve_then_paginate' : 'compress_first'),
    preserveFullProblemStatement,
  };
}

export function normalizeSceneOutlineContentProfile(outline: SceneOutline): SceneOutline {
  const contentProfile = inferSceneContentProfile(outline);
  const archetype = inferSceneArchetype(outline);
  return {
    ...outline,
    contentProfile,
    archetype,
    layoutIntent: inferSceneLayoutIntent(outline, contentProfile, archetype),
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
      '- 如果核心是顺序性的机制、方法或操作流程，可改用 process_flow。',
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
      '- 优先使用 example、process_flow、equation、derivation_steps、code_walkthrough、callout。',
      '- 短流程可用 horizontal process_flow，长流程或易续页流程优先 vertical process_flow。',
      '- 强调顺序性和连续讲解，不要平铺太多并列卡片。',
    ],
    bridge: [
      '页面骨架：bridge',
      '- 用于承上启下、关系梳理、分类、比较、框架总览。',
      '- 优先使用 table、bullet_list、callout、definition、theorem，必要时可用 process_flow 做阶段关系。',
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
      '- If the core teaching job is a sequence or mechanism, a process_flow is also acceptable.',
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
      '- Prefer example, process_flow, equation, derivation_steps, code_walkthrough, and callout.',
      '- Use horizontal process_flow for short sequences and vertical process_flow for longer or continuation-prone flows.',
      '- Preserve order and continuity instead of spreading the content into parallel cards.',
    ],
    bridge: [
      'Slide archetype: bridge',
      '- Use for transitions, comparisons, classifications, relationships, and framework overviews.',
      '- Prefer table, bullet_list, callout, definition, and theorem; process_flow is acceptable for staged relationships.',
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
