import type { SceneOutline } from '@/lib/types/generation';
import type { CoursePersonalizationContext } from './pipeline-types';

type PromptLanguage = 'zh-CN' | 'en-US';

export type DisciplinePackId = 'geography' | 'economics' | 'academic_writing' | 'sociology';

interface DisciplinePack {
  id: DisciplinePackId;
  label: Record<PromptLanguage, string>;
  detectors: RegExp[];
  outlineGuidance: Record<PromptLanguage, string[]>;
  semanticGuidance: Record<PromptLanguage, string[]>;
}

const DISCIPLINE_PACKS: DisciplinePack[] = [
  {
    id: 'geography',
    label: {
      'zh-CN': '地理',
      'en-US': 'Geography',
    },
    detectors: [
      /(地理|人文地理|自然地理|地图|空间|区域|尺度|分布|气候图|人口金字塔|城市化|人口迁移|产业布局|土地利用|GIS|地理信息)/i,
      /(geography|human geography|physical geography|map reading|spatial|regional comparison|geographic scale|climate graph|population pyramid|urbanization|migration pattern|land use|GIS)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '通过空间证据组织课程：地图/区域观察 -> 分布格局 -> 成因机制 -> 尺度比较 -> 迁移到新区域。',
        '人文地理、城市化、人口迁移、产业布局、土地利用、GIS、区域研究优先用 `disciplineStyle: "social_science"`；气候、地貌、水文、板块、水循环等自然系统用 `"science"`。',
        '地图阅读、区域比较、气候图、人口金字塔、土地利用适合 `comparison`、`timeline`、`visual_split`、`data_insight`、`compare_perspectives`。',
        '如果没有真实地图或图片，不要假装已有地图；改用表格、过程拆解，或在生成图片 prompt 中明确说明这是教学用示意地图/示意图。',
      ],
      'en-US': [
        'Teach through spatial evidence: map/region observation -> distribution pattern -> causal mechanism -> scale comparison -> transfer to a new region.',
        'Use `disciplineStyle: "social_science"` for human geography, urbanization, migration, land use, GIS, and regional studies; use `"science"` for physical geography such as climate, landforms, hydrology, plate tectonics, and natural systems.',
        'Use `comparison`, `timeline`, `visual_split`, `data_insight`, and `compare_perspectives` for map reading, regional comparison, climate graphs, population pyramids, and land-use patterns.',
        'If no real map or image is available, do not pretend a map exists; use a table, process, or a generated-media prompt that clearly says it is a schematic educational map/diagram.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '体现空间推理：用 `process` 表达“观察 -> 分布格局 -> 成因 -> 尺度 -> 迁移应用”。',
        '区域比较、气候图、人口金字塔、土地利用等页面优先用 `\\table` 或 `grid` 承载证据。',
        '只有 Available Images 提供真实图片 ID 时才用 `\\image`；如果没有地图图片，不要暗示页面已经渲染地图。',
      ],
      'en-US': [
        'Show spatial reasoning with a `process`: observation -> pattern -> cause -> scale -> transfer.',
        'Use `\\table` or `grid` for region comparisons, climate graphs, population pyramids, and land-use evidence.',
        'Use `\\image` only when Available Images provides a real image ID; if no map image exists, do not imply that a map is rendered.',
      ],
    },
  },
  {
    id: 'economics',
    label: {
      'zh-CN': '经济',
      'en-US': 'Economics',
    },
    detectors: [
      /(经济|经济学|宏观|微观|供给|需求|均衡|弹性|边际|机会成本|通胀|失业|货币|财政|关税|市场|外部性|福利|政策冲击|GDP|CPI)/i,
      /(economics|economic|macroeconomics|microeconomics|supply|demand|equilibrium|elasticity|marginal|opportunity cost|inflation|unemployment|tariff|externality|welfare|policy shock|GDP|CPI)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '通过“模型直觉 + 现实解释”组织课程：问题情境 -> 简化假设 -> 模型/曲线/表格 -> 预测变化 -> 福利或政策权衡。',
        '除非公式很重需要 `contentProfile: "math"`，否则优先 `disciplineStyle: "social_science"`。',
        '指标/趋势解释用 `data_insight`，政策权衡用 `comparison_matrix`，市场或政策冲击用 `case_analysis`。',
        '相关页面应说明必要假设，例如其他条件不变、激励效应、短期/长期范围。',
      ],
      'en-US': [
        'Teach through model intuition plus real-world interpretation: problem context -> simplifying assumptions -> model/curve/table -> predicted change -> welfare or policy trade-off.',
        'Prefer `disciplineStyle: "social_science"` unless the scene is formula-heavy enough to require `contentProfile: "math"`.',
        'Use `data_insight` for indicator/trend interpretation, `comparison_matrix` for policy trade-offs, and `case_analysis` for market or policy shocks.',
        'State simplifying assumptions such as ceteris paribus, incentive effects, and short-run vs long-run scope when relevant.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '分清假设、模型变化、证据和权衡。',
        '用 `\\table` 表达冲击前后、利益相关方影响或政策取舍。',
        '只有真实公式才用 `\\formula`；其他模型用简洁文字，并说明“其他条件不变”等假设。',
      ],
      'en-US': [
        'Separate assumptions, model movement, evidence, and trade-off.',
        'Use `\\table` for before/after shocks, stakeholder effects, or policy trade-offs.',
        'Use `\\formula` only for real equations; otherwise explain models in concise prose and state ceteris paribus assumptions.',
      ],
    },
  },
  {
    id: 'academic_writing',
    label: {
      'zh-CN': '论文写作',
      'en-US': 'Academic Writing',
    },
    detectors: [
      /(论文|学术写作|研究问题|选题|论点|论题|论证|证据链|文献综述|引用|改写|段落结构|主题句|反驳段|评分标准|rubric)/i,
      /(essay|academic writing|paper writing|research question|thesis statement|literature review|citation|paraphrase|topic sentence|counterargument|rubric|claim evidence)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '把课程当作写作教练，而不是知识点综述：选题收敛 -> 研究问题 -> thesis -> 证据计划 -> 段落结构 -> 修改。',
        '优先 `disciplineStyle: "humanities"`、`teachingFlow: "argument_evidence"`，模板可用 `thesis_evidence`、`argument_map`、`quote_analysis`、`compare_perspectives`。',
        '必须包含具体的弱/强示例，用于 thesis statement、topic sentence、证据嵌入、引用/改写、反驳段、rubric 评分标准。',
        '讲解型例子可用 `workedExampleConfig.kind: "case_analysis"` 或 `"general"`，并给出真实草稿摘录或代表性学生写作片段。',
      ],
      'en-US': [
        'Treat the course as writing coaching, not a topic survey: narrow a topic -> research question -> thesis -> evidence plan -> paragraph structure -> revision.',
        'Prefer `disciplineStyle: "humanities"`, `teachingFlow: "argument_evidence"`, and templates such as `thesis_evidence`, `argument_map`, `quote_analysis`, and `compare_perspectives`.',
        'Include concrete weak/strong examples for thesis statements, topic sentences, evidence integration, citation/paraphrase, counterarguments, and rubric criteria.',
        'For worked examples, use `workedExampleConfig.kind: "case_analysis"` or `"general"` with a real draft excerpt or representative student-writing snippet.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '让修改过程可见：用 `\\example` 承载草稿摘录或弱/强 thesis，用 `process` 写修改步骤。',
        '用 `\\table` 写 rubric 或弱/强对照。',
        '不要输出泛泛写作建议，必须包含可被修改的具体措辞。',
      ],
      'en-US': [
        'Make revision visible: use `\\example` for a draft excerpt or weak/strong thesis, and `process` for revision steps.',
        'Use `\\table` for rubric criteria or weak/strong comparisons.',
        'Do not present generic writing advice; include concrete wording that can be revised.',
      ],
    },
  },
  {
    id: 'sociology',
    label: {
      'zh-CN': '社会学',
      'en-US': 'Sociology',
    },
    detectors: [
      /(社会学|社会分层|社会化|制度|规范|污名|性别|阶级|种族|族群|家庭|教育不平等|田野|访谈|问卷|功能主义|冲突论|符号互动论)/i,
      /(sociology|social stratification|socialization|institution|norms|stigma|gender|class|race|ethnicity|fieldwork|interview|survey|functionalism|conflict theory|symbolic interactionism)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '通过“理论视角 + 经验材料”组织课程：社会现象 -> 核心概念 -> 理论视角 -> 案例/材料证据 -> 局限或替代解释。',
        '优先 `disciplineStyle: "social_science"`，搭配 `case_analysis`、`argument_evidence`、`comparison_review`、`data_insight`。',
        '功能主义、冲突论、符号互动论等理论比较适合 `compare_perspectives`；教育、家庭、性别、阶层、种族/族群、劳动、媒体、制度等主题适合 `case_analysis`。',
        '涉及研究方法时要体现方法意识：问卷、访谈、田野、抽样、操作化、偏差、相关与因果。',
      ],
      'en-US': [
        'Teach through theory lens plus empirical evidence: social phenomenon -> key concept -> theory perspective -> case/material evidence -> limitation or alternative explanation.',
        'Prefer `disciplineStyle: "social_science"` with `case_analysis`, `argument_evidence`, `comparison_review`, and `data_insight` flows.',
        'Use `compare_perspectives` for functionalist/conflict/symbolic interactionist or other theory comparisons, and `case_analysis` for education, family, gender, class, race/ethnicity, labor, media, and institutions.',
        'Include method awareness when relevant: survey, interview, fieldwork, sampling, operationalization, bias, correlation vs causation.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '连接“社会现象 -> 概念 -> 理论视角 -> 证据 -> 局限”。',
        '理论比较用 `\\table` 或 `grid`，案例材料用 `\\example`。',
        '方法提醒用 `\\callout`，例如抽样、偏差、操作化、相关与因果。',
      ],
      'en-US': [
        'Connect phenomenon -> concept -> theory lens -> evidence -> limitation.',
        'Use `\\table` or `grid` for theory perspectives, and `\\example` for case material.',
        'Use `\\callout` for method cautions such as sampling, bias, operationalization, or correlation vs causation.',
      ],
    },
  },
];

function compactText(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n')
    .slice(0, 24_000);
}

function courseContextToText(courseContext?: CoursePersonalizationContext): string {
  if (!courseContext) return '';
  return compactText([
    courseContext.name,
    courseContext.description,
    courseContext.tags?.join(', '),
    courseContext.purpose,
    courseContext.university,
    courseContext.courseCode,
  ]);
}

function outlineToText(outline: SceneOutline): string {
  const cfg = outline.workedExampleConfig;
  return compactText([
    outline.title,
    outline.description,
    outline.keyPoints?.join('\n'),
    outline.layoutIntent?.disciplineStyle,
    outline.layoutIntent?.teachingFlow,
    outline.layoutIntent?.layoutTemplate,
    cfg?.kind,
    cfg?.problemStatement,
    cfg?.givens?.join('\n'),
    cfg?.asks?.join('\n'),
    cfg?.solutionPlan?.join('\n'),
    cfg?.walkthroughSteps?.join('\n'),
  ]);
}

function selectDisciplinePacks(text: string, limit = 2): DisciplinePack[] {
  const scores = DISCIPLINE_PACKS.map((pack) => ({
    pack,
    score: pack.detectors.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores.slice(0, limit).map((item) => item.pack);
}

export function matchesDisciplinePackText(text: string, id: DisciplinePackId): boolean {
  const pack = DISCIPLINE_PACKS.find((item) => item.id === id);
  return Boolean(pack?.detectors.some((pattern) => pattern.test(text)));
}

function formatPackGuidance(args: {
  language: PromptLanguage;
  packs: DisciplinePack[];
  stage: 'outline' | 'semantic';
}): string {
  const { language, packs, stage } = args;
  if (packs.length === 0) return '';

  const title =
    language === 'zh-CN'
      ? `## 动态学科包\n\n已注入：${packs.map((pack) => pack.label[language]).join('、')}`
      : `## Dynamic Discipline Packs\n\nLoaded packs: ${packs.map((pack) => pack.label[language]).join(', ')}`;

  const body = packs
    .map((pack) => {
      const rules =
        stage === 'outline' ? pack.outlineGuidance[language] : pack.semanticGuidance[language];
      return [`### ${pack.label[language]}`, ...rules.map((rule) => `- ${rule}`)].join('\n');
    })
    .join('\n\n');

  return `${title}\n\n${body}`;
}

export function formatOutlineDisciplineGuidanceForPrompt(args: {
  language: PromptLanguage;
  requirement: string;
  pdfText?: string;
  researchContext?: string;
  purpose?: CoursePersonalizationContext['purpose'];
  courseContext?: CoursePersonalizationContext;
}): string {
  if (args.purpose === 'research' || args.courseContext?.purpose === 'research') return '';

  const text = compactText([
    args.requirement,
    args.pdfText?.slice(0, 8_000),
    args.researchContext?.slice(0, 4_000),
    courseContextToText(args.courseContext),
  ]);
  return formatPackGuidance({
    language: args.language,
    packs: selectDisciplinePacks(text),
    stage: 'outline',
  });
}

export function formatSemanticDisciplineGuidanceForPrompt(args: {
  language: PromptLanguage;
  outline: SceneOutline;
  courseContext?: CoursePersonalizationContext;
}): string {
  if (args.courseContext?.purpose === 'research') return '';

  const text = compactText([outlineToText(args.outline), courseContextToText(args.courseContext)]);
  return formatPackGuidance({
    language: args.language,
    packs: selectDisciplinePacks(text),
    stage: 'semantic',
  });
}
