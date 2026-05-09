import {
  inferNotebookContentProfileFromText,
  isClassicLectureLayoutTemplate,
  type NotebookContentDisciplineStyle,
  type NotebookContentLayoutFamily,
  type NotebookContentLayoutTemplate,
  type NotebookContentProfile,
  type NotebookContentTeachingFlow,
} from '@/lib/notebook-content';
import type { SceneArchetype, SceneLayoutIntent, SceneOutline } from '@/lib/types/generation';
import { matchesDisciplinePackText } from './discipline-packs';

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

const PHYSICAL_GEOGRAPHY_PATTERNS = [
  /(自然地理|气候|地貌|水文|水循环|板块|岩石圈|海陆风|季风|洋流|土壤|climate|geomorphology|hydrology|water cycle|plate tectonics|monsoon|ocean current)/i,
];

const ARGUMENT_EVIDENCE_PATTERNS = [
  /(观点|论点|证据|论证|反驳|证据链|thesis|argument|evidence|counterargument|claim|reasoning|warrant)/i,
];

const DATA_ANALYSIS_PATTERNS = [
  /(数据|指标|图表|趋势|变量|相关|因果|样本|统计|GDP|CPI|失业率|人口金字塔|气候图|data|indicator|chart|trend|variable|correlation|causation|sample|statistics|population pyramid|climate graph)/i,
];

const GEOGRAPHY_SPATIAL_PATTERNS = [
  /(地理|地图|空间|区域|尺度|分布|迁移|城市化|土地利用|产业布局|GIS|map reading|spatial|regional comparison|geographic scale|distribution pattern|migration pattern|urbanization|land use)/i,
];

const ECONOMICS_MODEL_PATTERNS = [
  /(供给|需求|均衡|弹性|边际|机会成本|外部性|博弈|激励|曲线|政策冲击|supply|demand|equilibrium|elasticity|marginal|opportunity cost|externality|game theory|incentive|curve|policy shock)/i,
];

const CLASSIC_PIPELINE_PATTERNS = [
  /(pipeline|workflow|stages?|process|stepwise|流程|阶段|管线|工作流|处理链|步骤|机制路径)/i,
];

const CLASSIC_TABLE_PATTERNS = [
  /(table|matrix|compare|input|output|why it matters|对照表|表格|矩阵|输入|输出|为什么重要|主操作|主要操作)/i,
];

const CLASSIC_VISUAL_STEPS_PATTERNS = [
  /(hierarch|architecture|assembly|scaffold|diagram|three steps?|3 steps?|架构|层级|层次|组装|装配|骨架|图示|三步|三个步骤)/i,
];

const CLASSIC_SUMMARY_PATTERNS = [
  /(conclusion|future directions?|limitations?|strengths?|contribution|takeaways?|总结|结论|未来|局限|限制|贡献|优势|收束|下一步)/i,
];

const IMAGE_HERO_CINEMATIC_PATTERNS = [
  /(cinematic|film|movie|mv|music video|trailer|dark art|gallery|stained glass|电影|影片|影像|短片|音乐视频|深度解析|镜头|画面|暗色|舞台)/i,
];

const IMAGE_HERO_TECH_PATTERNS = [
  /(tech|saas|ai|subscription|pricing|product launch|launch|plans?|network|platform|科技|产品发布|订阅|价格|套餐|方案|平台|人工智能|网络|发布会)/i,
];

type ClassicImageHeroTemplate = Extract<
  NotebookContentLayoutTemplate,
  'image_title_overlay' | 'cinematic_title_frame' | 'tech_hero_title'
>;

function inferImageHeroTemplate(
  text: string,
  deckStyle: SceneLayoutIntent['deckStyle'] | undefined,
): ClassicImageHeroTemplate {
  if (deckStyle === 'dark_art' || matchesAny(text, IMAGE_HERO_CINEMATIC_PATTERNS)) {
    return 'cinematic_title_frame';
  }
  if (
    deckStyle === 'tech_saas' ||
    deckStyle === 'product_launch' ||
    matchesAny(text, IMAGE_HERO_TECH_PATTERNS)
  ) {
    return 'tech_hero_title';
  }
  return 'image_title_overlay';
}

function inferSceneDisciplineStyle(
  outline: SceneOutline,
  profile: NotebookContentProfile,
): NotebookContentDisciplineStyle {
  if (outline.layoutIntent?.disciplineStyle) return outline.layoutIntent.disciplineStyle;
  if (profile === 'code') return 'code';
  if (profile === 'math') return 'math';

  const text = collectOutlineSignals(outline).join('\n');
  if (
    matchesAny(text, [
      /(物理|化学|生物|实验|力学|电路|reaction|physics|chemistry|biology|experiment|lab|enzyme|molecule)/i,
      ...PHYSICAL_GEOGRAPHY_PATTERNS,
    ])
  ) {
    return 'science';
  }
  if (
    matchesAny(text, [
      /(历史|文学|诗歌|小说|文本|引文|史料|哲学|艺术|close reading|quote|literature|history|philosophy|primary source)/i,
    ]) ||
    matchesDisciplinePackText(text, 'academic_writing')
  ) {
    return 'humanities';
  }
  if (
    matchesDisciplinePackText(text, 'geography') ||
    matchesDisciplinePackText(text, 'economics') ||
    matchesDisciplinePackText(text, 'sociology')
  ) {
    return 'social_science';
  }

  return 'general';
}

function inferSceneTeachingFlow(
  outline: SceneOutline,
  profile: NotebookContentProfile,
  archetype: SceneArchetype,
  disciplineStyle: NotebookContentDisciplineStyle,
): NotebookContentTeachingFlow {
  if (outline.layoutIntent?.teachingFlow) return outline.layoutIntent.teachingFlow;

  const text = collectOutlineSignals(outline).join('\n');
  const worked = outline.workedExampleConfig;

  if (worked?.kind === 'code' || profile === 'code') return 'code_walkthrough';
  if (worked?.kind === 'proof' || matchesAny(text, [/(证明|proof|lemma|命题|定理)/i])) {
    return 'proof_walkthrough';
  }
  if (
    matchesDisciplinePackText(text, 'academic_writing') ||
    matchesAny(text, ARGUMENT_EVIDENCE_PATTERNS)
  ) {
    return 'argument_evidence';
  }
  if (matchesDisciplinePackText(text, 'economics') || matchesAny(text, ECONOMICS_MODEL_PATTERNS)) {
    return 'case_analysis';
  }
  if (worked || matchesAny(text, [/(例题|题目|求解|解法|worked example|problem|solve)/i])) {
    return 'problem_walkthrough';
  }
  if (
    matchesAny(text, [/(定义.*例|definition.*example|定理.*应用|从定义到|definition to example)/i])
  ) {
    return 'definition_to_example';
  }
  if (matchesAny(text, [/(引文|原文|文本细读|close reading|quote|passage|source)/i])) {
    return 'close_reading';
  }
  if (
    (disciplineStyle === 'humanities' || disciplineStyle === 'social_science') &&
    matchesAny(text, ARGUMENT_EVIDENCE_PATTERNS)
  ) {
    return 'argument_evidence';
  }
  if (
    matchesAny(text, [
      /(案例|个案|情境|田野|访谈材料|政策评估|case study|case analysis|fieldwork|interview material|application)/i,
    ])
  ) {
    return 'case_analysis';
  }
  if (matchesAny(text, [/(比较|对比|分类|compare|comparison|perspective|观点对照)/i])) {
    return 'comparison_review';
  }
  if (matchesAny(text, [/(时间线|历史脉络|发展|timeline|chronology|sequence|evolution)/i])) {
    return 'timeline_story';
  }
  if (matchesAny(text, [/(小测|练习|检查|quiz|practice|quick check|exit ticket)/i])) {
    return 'practice_check';
  }
  if (archetype === 'definition') return 'definition_to_example';

  return 'concept_explain';
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

function classicLayoutFamilyForTemplate(
  template: Extract<
    NotebookContentLayoutTemplate,
    | 'pipeline_table'
    | 'comparison_matrix'
    | 'visual_three_steps'
    | 'process_steps'
    | 'two_by_one_summary'
    | 'three_cards'
    | 'text_image_split'
    | 'four_columns'
    | 'grid_2x2'
    | 'two_text_image'
    | 'definition_board'
    | 'derivation_ladder'
    | 'formula_focus'
    | 'image_title_overlay'
    | 'cinematic_title_frame'
    | 'tech_hero_title'
  >,
): NotebookContentLayoutFamily {
  if (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  ) {
    return 'cover';
  }
  if (template === 'pipeline_table') return 'comparison';
  if (template === 'comparison_matrix') return 'comparison';
  if (template === 'process_steps') return 'timeline';
  if (template === 'visual_three_steps') return 'visual_split';
  if (template === 'text_image_split') return 'visual_split';
  if (template === 'two_text_image') return 'visual_split';
  if (template === 'three_cards') return 'concept_cards';
  if (template === 'four_columns') return 'concept_cards';
  if (template === 'grid_2x2') return 'concept_cards';
  if (template === 'definition_board') return 'concept_cards';
  if (template === 'derivation_ladder') return 'derivation';
  if (template === 'formula_focus') return 'formula_focus';
  return 'summary';
}

function inferClassicLectureLayoutTemplate(args: {
  outline: SceneOutline;
  profile: NotebookContentProfile;
  archetype: SceneArchetype;
}): Extract<
  NotebookContentLayoutTemplate,
  | 'pipeline_table'
  | 'visual_three_steps'
  | 'two_by_one_summary'
  | 'three_cards'
  | 'text_image_split'
  | 'four_columns'
  | 'grid_2x2'
  | 'two_text_image'
  | 'definition_board'
  | 'derivation_ladder'
  | 'formula_focus'
  | 'image_title_overlay'
  | 'cinematic_title_frame'
  | 'tech_hero_title'
> | null {
  const { outline, profile, archetype } = args;
  if (outline.type !== 'slide') return null;
  if (outline.workedExampleConfig) return null;
  if (profile === 'code') return null;

  const text = collectOutlineSignals(outline).join('\n');
  const keyPointCount = outline.keyPoints?.length || 0;
  const hasMedia = Boolean(outline.suggestedImageIds?.length || outline.mediaGenerations?.length);

  if (archetype === 'intro') {
    return inferImageHeroTemplate(text, outline.layoutIntent?.deckStyle);
  }

  if (archetype === 'summary' || matchesAny(text, CLASSIC_SUMMARY_PATTERNS)) {
    return 'two_by_one_summary';
  }

  if (matchesAny(text, CLASSIC_VISUAL_STEPS_PATTERNS) && hasMedia) {
    return 'visual_three_steps';
  }

  if (
    matchesAny(text, CLASSIC_PIPELINE_PATTERNS) &&
    (matchesAny(text, CLASSIC_TABLE_PATTERNS) || keyPointCount >= 4 || archetype === 'bridge')
  ) {
    return 'pipeline_table';
  }

  return null;
}

function inferSceneLayoutFamily(
  outline: SceneOutline,
  profile: NotebookContentProfile,
  archetype: SceneArchetype,
  disciplineStyle: NotebookContentDisciplineStyle,
  teachingFlow: NotebookContentTeachingFlow,
): NotebookContentLayoutFamily {
  if (outline.layoutIntent?.layoutFamily) return outline.layoutIntent.layoutFamily;
  if (isClassicLectureLayoutTemplate(outline.layoutIntent?.layoutTemplate)) {
    return classicLayoutFamilyForTemplate(outline.layoutIntent.layoutTemplate);
  }

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
  if (teachingFlow === 'code_walkthrough') return 'code_walkthrough';
  if (teachingFlow === 'problem_walkthrough') return 'problem_solution';
  if (teachingFlow === 'proof_walkthrough') return 'derivation';
  if (teachingFlow === 'timeline_story') return 'timeline';
  if (teachingFlow === 'comparison_review') return 'comparison';
  if (matchesAny(text, DATA_ANALYSIS_PATTERNS)) return 'comparison';
  if (matchesAny(text, GEOGRAPHY_SPATIAL_PATTERNS)) return 'comparison';
  if (teachingFlow === 'close_reading' || teachingFlow === 'argument_evidence') {
    return disciplineStyle === 'humanities' || disciplineStyle === 'social_science'
      ? 'concept_cards'
      : 'comparison';
  }
  if (teachingFlow === 'case_analysis') return 'concept_cards';
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
  const disciplineStyle = inferSceneDisciplineStyle(outline, profile);
  const teachingFlow = inferSceneTeachingFlow(outline, profile, archetype, disciplineStyle);
  const layoutFamily = inferSceneLayoutFamily(
    outline,
    profile,
    archetype,
    disciplineStyle,
    teachingFlow,
  );
  const explicitTemplate = outline.layoutIntent?.layoutTemplate;
  const classicTemplate = isClassicLectureLayoutTemplate(explicitTemplate)
    ? explicitTemplate
    : inferClassicLectureLayoutTemplate({ outline, profile, archetype });
  const effectiveLayoutFamily = classicTemplate
    ? classicLayoutFamilyForTemplate(classicTemplate)
    : layoutFamily;
  const hasSourceImage = Boolean(outline.suggestedImageIds?.length);
  const hasGeneratedImage = Boolean(
    outline.mediaGenerations?.some((media) => media.type === 'image'),
  );
  const preserveFullProblemStatement =
    outline.layoutIntent?.preserveFullProblemStatement ??
    Boolean(outline.workedExampleConfig?.role === 'problem_statement');

  return {
    layoutFamily: effectiveLayoutFamily,
    layoutTemplate:
      explicitTemplate ||
      classicTemplate ||
      inferSceneLayoutTemplate(
        outline,
        effectiveLayoutFamily,
        profile,
        archetype,
        disciplineStyle,
        teachingFlow,
      ),
    disciplineStyle,
    teachingFlow,
    density:
      outline.layoutIntent?.density ??
      (effectiveLayoutFamily === 'cover' || effectiveLayoutFamily === 'section'
        ? 'light'
        : 'standard'),
    deckStyle: outline.layoutIntent?.deckStyle,
    backgroundStyleId: outline.layoutIntent?.backgroundStyleId,
    visualRole:
      outline.layoutIntent?.visualRole ??
      (hasSourceImage ? 'source_image' : hasGeneratedImage ? 'generated_image' : 'none'),
    overflowPolicy:
      outline.layoutIntent?.overflowPolicy ??
      (preserveFullProblemStatement ? 'preserve_then_paginate' : 'compress_first'),
    preserveFullProblemStatement,
  };
}

function inferSceneLayoutTemplate(
  outline: SceneOutline,
  layoutFamily: NotebookContentLayoutFamily,
  profile: NotebookContentProfile,
  archetype: SceneArchetype,
  disciplineStyle: NotebookContentDisciplineStyle,
  teachingFlow: NotebookContentTeachingFlow,
): NotebookContentLayoutTemplate {
  const hasMedia = Boolean(outline.suggestedImageIds?.length || outline.mediaGenerations?.length);
  const keyPointCount = outline.keyPoints?.length || 0;
  const order = Number.isFinite(outline.order) ? outline.order : 1;
  const parity = order % 2;
  const text = collectOutlineSignals(outline).join('\n');

  switch (layoutFamily) {
    case 'cover':
      return inferImageHeroTemplate(text, outline.layoutIntent?.deckStyle);
    case 'section':
      return 'section_divider';
    case 'visual_split':
      return keyPointCount >= 2 ? 'two_text_image' : 'text_image_split';
    case 'comparison':
      if (matchesAny(text, DATA_ANALYSIS_PATTERNS)) return 'data_insight';
      return teachingFlow === 'comparison_review' &&
        (disciplineStyle === 'humanities' || disciplineStyle === 'social_science')
        ? 'compare_perspectives'
        : 'pipeline_table';
    case 'timeline':
      return teachingFlow === 'timeline_story' ? 'process_steps' : 'timeline_road';
    case 'problem_statement':
      return 'problem_focus';
    case 'problem_solution':
      return 'problem_walkthrough';
    case 'derivation':
      return profile === 'math' && parity === 0 ? 'derivation_ladder' : 'steps_sidebar';
    case 'code_walkthrough':
      return 'code_split';
    case 'formula_focus':
      return 'formula_focus';
    case 'summary':
      return 'two_by_one_summary';
    case 'concept_cards':
    default:
      if (hasMedia) return parity === 0 ? 'visual_left' : 'visual_right';
      if (matchesAny(text, DATA_ANALYSIS_PATTERNS)) return 'data_insight';
      if (matchesAny(text, GEOGRAPHY_SPATIAL_PATTERNS)) return 'compare_perspectives';
      if (teachingFlow === 'argument_evidence') return 'thesis_evidence';
      if (teachingFlow === 'close_reading') {
        return matchesAny(text, [/(史料|原文|来源|source|primary source|document excerpt)/i])
          ? 'source_close_reading'
          : 'quote_analysis';
      }
      if (teachingFlow === 'case_analysis') return 'case_analysis';
      if (archetype === 'definition') {
        return profile !== 'math' && keyPointCount === 3 ? 'three_cards' : 'definition_board';
      }
      if (teachingFlow === 'definition_to_example') {
        return profile !== 'math' && keyPointCount === 3 ? 'three_cards' : 'definition_board';
      }
      if (keyPointCount <= 2) return 'title_content';
      if (keyPointCount === 3) return 'three_cards';
      if (keyPointCount >= 4) return order % 2 === 0 ? 'four_columns' : 'grid_2x2';
      return 'two_column';
  }
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
            '- 不要把代码讲解压扁成抽象 bullet；能用 code_walkthrough / code_trace / state_table / call_stack / memory_diagram / pointer_diagram / tree_diagram / graph_trace / dictionary_diagram / linear_structure 就不要只给 paragraph。',
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
      '- Prefer code_walkthrough / code_trace / state_table / call_stack / memory_diagram / pointer_diagram / tree_diagram / graph_trace / dictionary_diagram / linear_structure over flattening the explanation into abstract bullets.',
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
