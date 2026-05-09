import type { SceneOutline } from '@/lib/types/generation';
import type { CoursePersonalizationContext } from './pipeline-types';

type PromptLanguage = 'zh-CN' | 'en-US';

export type DisciplinePackId =
  | 'mathematics'
  | 'computer_science'
  | 'geography'
  | 'economics'
  | 'academic_writing'
  | 'sociology';

interface DisciplinePack {
  id: DisciplinePackId;
  label: Record<PromptLanguage, string>;
  detectors: RegExp[];
  outlineGuidance: Record<PromptLanguage, string[]>;
  semanticGuidance: Record<PromptLanguage, string[]>;
}

const DISCIPLINE_PACKS: DisciplinePack[] = [
  {
    id: 'mathematics',
    label: {
      'zh-CN': '数学',
      'en-US': 'Mathematics',
    },
    detectors: [
      /(数学|证明|定理|命题|引理|推论|函数|映射|定义域|陪域|值域|像|原像|单射|满射|双射|集合|方程|矩阵|导数|积分|概率|统计|线性代数|微积分|数论|群|环|域|同余|极限|∀|∃|∈|⊆|⇒|⇔)/i,
      /(mathematics|proof|prove|theorem|proposition|lemma|corollary|function|mapping|domain|codomain|range|image|preimage|injective|surjective|bijective|set|equation|matrix|derivative|integral|probability|statistics|linear algebra|calculus|number theory|congruence|limit|forall|exists)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '把数学课当作“学会写证明/解题”的训练，而不是概念卡片综述：导入具体表达式或反例 -> 拆定义条件 -> 走一遍例题/证明 -> 留下可迁移的检查动作。',
        '函数、集合、像/原像、单射/满射/双射等证明课必须显式安排课堂结构：先介绍对象和为什么要判定，再讲定义边界，再讲例题或证明链，最后给练习判断路线。',
        '证明页要把“已知/目标/可用定义/下一步动作”讲清楚；不要只把结论平铺成 2x2 卡片或空泛表格。',
        '数学 slide 的 `contentProfile` 必须是 `"math"`，`disciplineStyle` 必须是 `"math"`；定义页优先 `definition_board` / `formula_focus`，证明例题优先 `derivation_ladder` / `problem_walkthrough`，对照判定优先 `comparison_matrix`。',
      ],
      'en-US': [
        'Treat mathematics lessons as proof/problem-writing coaching, not concept-card summaries: concrete expression or counterexample -> definition conditions -> worked proof/example -> transferable checking move.',
        'For functions, sets, image/preimage, injective/surjective/bijective, explicitly plan the classroom sequence: introduce the object and reason for the test, clarify the definition boundary, walk through an example/proof, then give a practice decision route.',
        'Proof pages must separate givens, goal, usable definition/theorem, and next proof action; do not flatten results into vague 2x2 cards or empty tables.',
        'Math slides must use `contentProfile: "math"` and `disciplineStyle: "math"`; prefer `definition_board` / `formula_focus` for definitions, `derivation_ladder` / `problem_walkthrough` for proof examples, and `comparison_matrix` for definition tests.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '数学页面必须让学生看见证明动作：先写对象范围和目标，再展开定义，再说明下一步为什么合法。',
        '定义页不要只抄定义；至少包含一个具体公式/语句、条件边界和一个常见误解或反例方向。',
        '例题/证明页优先使用 `derivation`、条件表或证明路线；必须先写已知/目标，再给 3-5 个有理由的连续证明动作，不要输出空泛卡片、长讲稿或只有结论的四格。',
        '所有可见解释使用中文；公式保留 LaTeX 或数学符号，不要混入英文动词。',
      ],
      'en-US': [
        'Math pages must make the proof action visible: name the object domain and goal, expand the definition, then explain why the next move is legal.',
        'Definition pages must not merely restate the definition; include a concrete formula/statement, boundary condition, and one misconception or counterexample direction.',
        'Worked proof pages should use derivations, condition tables, or proof route blocks; state givens/goal first, then provide 3-5 reasoned proof moves instead of vague cards, long lectures, or conclusion-only grids.',
        'Visible explanation must use the scene language; keep formulas in LaTeX or mathematical symbols.',
      ],
    },
  },
  {
    id: 'computer_science',
    label: {
      'zh-CN': '计算机科学',
      'en-US': 'Computer Science',
    },
    detectors: [
      /(计算机|编程|程序|代码|Python|Java|JavaScript|TypeScript|变量|循环|递归|函数|类|对象|self|OOP|面向对象|链表|二叉树|BST|树|图|DFS|BFS|栈|队列|字典|哈希|算法|数据结构|复杂度|invariant|不变式)/i,
      /(computer science|programming|program|code|python|java|javascript|typescript|variable|loop|recursion|function|class|object|self|oop|linked list|binary tree|bst|tree|graph|dfs|bfs|stack|queue|dictionary|hash|algorithm|data structure|complexity|invariant)/i,
    ],
    outlineGuidance: {
      'zh-CN': [
        '把 CS 课当作“带学生写得出来”的训练，而不是概念综述：问题场景 -> 运行/结构模型 -> 手动 trace 一步 -> 抽出 invariant 或策略 -> 写代码前 checklist。',
        'CS 课程的封面后第一张正文页必须从一个具体对象/输入/任务切入，不要生成抽象路线图；第二张正文页必须让旧做法当场失败，例如用 list/dict/code trace 展示为什么会读错、写错或破坏规则。',
        '基础语法优先安排 `layoutFamily: "code_walkthrough"`，要求 keyPoints 明确变量状态、当前行、条件判断、循环进度。',
        'OOP 开头不要先列术语。先问“我要表示什么对象、字段叫什么、哪些状态不合法、需要哪些操作”，再引出 class；OOP 页面优先安排 memory/aliasing/self/dot lookup，要求区分 name、reference、heap object、attribute mutation。',
        '数据结构页面要围绕结构承诺：linked list 的 handle/link，tree/BST 的 parent-child/order rule，stack/queue 的 active end，dictionary 的 key/value mutation。',
        '算法页面要围绕策略状态：frontier、visited、call stack、queue/stack 如何决定下一步；不要只给最终访问顺序。',
        '每个 CS 讲解页至少包含一个“写代码前先问什么”的迁移动作，用来解决学生“看懂但写不出”的问题。',
      ],
      'en-US': [
        'Treat CS lessons as coaching students to write code, not as concept summaries: problem situation -> execution/structure model -> manually trace one step -> extract invariant or strategy -> before-coding checklist.',
        'After the title cover, the first teaching page must start from a concrete object/input/task, not an abstract roadmap; the second teaching page must make the old representation fail visibly, for example with list/dict/code trace showing how meaning, writes, or rules break.',
        'For syntax, prefer `layoutFamily: "code_walkthrough"` and make keyPoints specify variable state, current line, condition checks, and loop progress.',
        'For OOP, do not open with a term list. Start by asking what object is being represented, what its fields mean, which states are illegal, and which operations it needs; then introduce classes. Prioritize memory/aliasing/self/dot lookup pages that distinguish names, references, heap objects, and attribute mutation.',
        'For data structures, teach the structure promise: handles/links for linked lists, parent-child/order rules for trees/BSTs, active ends for stack/queue, key/value mutation for dictionaries.',
        'For algorithms, teach strategy state: frontier, visited, call stack, and how queue/stack chooses the next move. Do not only show the final visit order.',
        'Every CS teaching page should include one transferable before-coding question to address the “I understand it but cannot write it” problem.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        'CS 页面遵循“问题入口 -> 运行模型/结构模型 -> step snapshot -> 写代码前 checklist”。不要只输出定义和 bullet。',
        'CS 开场页必须把抽象词落到一个真实小对象或小输入上；如果要比较 list/dict/class，必须给出真实代码片段或 `\\table`，禁止输出 `[Table]` 这种占位文字。',
        '语法/循环/递归优先用 `trace`、`statetable`、`callstack`，每一步写清当前行、读到的值、改变的状态。',
        'OOP/aliasing 优先用 `memory`，明确 stack 名字、heap 对象、对象 id、属性写入，以及 `self` 当前指向谁。',
        '数据结构优先用 `linkedlist`、`tree`、`bst`、`stack`、`queue`、`dictionary`、`invariant`，并在 step 中给出操作后的完整快照。',
        '算法优先用 `graph_trace`、`tree`、`trace` 配合 stack/queue/call stack，明确 frontier、visited、下一步选择规则。',
        '页面文字要像老师在黑板前讲：先问“现在这一步改了谁”，再给判断；避免“本页用于”“教学目标”“学习者将”这类教案语言。',
      ],
      'en-US': [
        'CS pages should follow: problem hook -> execution/structure model -> step snapshot -> before-coding checklist. Do not output only definitions and bullets.',
        'Opening CS pages must ground abstract terms in a real small object or input. If comparing list/dict/class, include real code snippets or a `\\table`; never output placeholder text such as `[Table]`.',
        'For syntax/loops/recursion, prefer `trace`, `statetable`, and `callstack`; each step should state the current line, read value, and changed state.',
        'For OOP/aliasing, prefer `memory`; show stack names, heap objects, object ids, attribute writes, and what `self` currently references.',
        'For data structures, prefer `linkedlist`, `tree`, `bst`, `stack`, `queue`, `dictionary`, and `invariant`, with complete state snapshots after each step.',
        'For algorithms, prefer `graph_trace`, `tree`, and `trace` with stack/queue/call stack; show frontier, visited, and the rule choosing the next move.',
        'Write like a teacher at the board: ask what this step changes, then give the judgment. Avoid lesson-plan phrases such as “this page is used to” or “learners will”.',
      ],
    },
  },
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
  const hasStrongMathSignal =
    /(数学|证明|定理|命题|引理|推论|定义域|陪域|值域|像|原像|单射|满射|双射|集合|∀|∃|∈|⊆|⇒|⇔|proof|prove|theorem|proposition|lemma|domain|codomain|range|preimage|injective|surjective|bijective)/i.test(
      text,
    );
  const hasStrongCodeSignal =
    /(编程|程序|代码|Python|JavaScript|TypeScript|class|def |self|OOP|链表|二叉树|BST|DFS|BFS|栈|队列|字典|哈希|算法|数据结构|complexity|invariant|console\.log|return\b|for\s*\(|while\s*\()/i.test(
      text,
    );
  const scores = DISCIPLINE_PACKS.map((pack) => ({
    pack,
    score: pack.detectors.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0),
  }))
    .filter((item) => item.score > 0)
    .filter(
      (item) =>
        !(item.pack.id === 'computer_science' && hasStrongMathSignal && !hasStrongCodeSignal),
    )
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
