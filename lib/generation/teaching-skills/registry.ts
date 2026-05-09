import type { TeachingSkill } from './types';

export const TEACHING_SKILL_REGISTRY: TeachingSkill[] = [
  {
    id: 'discipline.cs',
    kind: 'discipline',
    label: { 'zh-CN': '计算机科学', 'en-US': 'Computer Science' },
    priority: 100,
    preferredSubject: 'computer_science',
    triggers: [
      /(计算机|编程|程序|代码|Python|Java|JavaScript|TypeScript|变量|循环|递归|函数|类|对象|self|OOP|面向对象|链表|二叉树|BST|树|图|DFS|BFS|栈|队列|字典|哈希|算法|数据结构|复杂度|invariant|不变式)/i,
      /(computer science|programming|program|code|python|java|javascript|typescript|variable|loop|recursion|function|class|object|self|oop|linked list|binary tree|bst|tree|graph|dfs|bfs|stack|queue|dictionary|hash|algorithm|data structure|complexity|invariant)/i,
    ],
    impliedSkillIds: ['pedagogy.example-first', 'pedagogy.problem-solving'],
    preferredTeachingRoles: [
      'concrete_hook',
      'failure_demo',
      'concept_model',
      'state_trace',
      'structure_invariant',
      'worked_example',
      'practice_check',
      'synthesis',
    ],
    forbiddenPatterns: ['本页用于', '引出', '建立本课主线', '学习者将', '[Table]', '\\texttt'],
    outlineGuidance: {
      'zh-CN': [
        '先判断页面角色，再决定讲法：hook 只建立问题感，failure_demo 让旧思路失败，concept_model 划概念边界，state_trace/structure_invariant/strategy_trace 才上状态或结构组件。',
        '不要把每一页都套成“错误 + 图 + 写代码动作”；组件只服务当前页面角色。',
        '封面后第一张正文页必须先解释具体对象/输入/任务，不要先给路线图或术语清单。',
        '第二张正文页要让旧表示或旧思路真实失败一次，再引出新概念。',
      ],
      'en-US': [
        'Choose the page role first: a hook builds the problem, a failure demo breaks an old approach, a concept model draws boundaries, and trace/invariant/strategy pages are where state or structure components belong.',
        'Do not force every page into “error + diagram + coding action”; components serve the current page role.',
        'The first teaching page after the cover must explain the concrete object/input/task before any roadmap or term list.',
        'The second teaching page should make an old representation or old approach fail visibly before introducing the new concept.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        'CS 页面不要只输出定义和 bullet；优先把状态、代码、结构或规则画出来。',
        '页面文字像老师在黑板前讲：先问“这一步读了什么、改了谁”，再给判断。',
      ],
      'en-US': [
        'Do not make CS pages definition-and-bullet only; show state, code, structure, or rules.',
        'Write like a teacher at the board: ask what this step reads and changes before giving the judgment.',
      ],
    },
  },
  {
    id: 'discipline.math',
    kind: 'discipline',
    label: { 'zh-CN': '数学', 'en-US': 'Mathematics' },
    priority: 95,
    preferredSubject: 'mathematics',
    triggers: [
      /(数学|证明|定理|函数|方程|矩阵|导数|积分|概率|统计|线性代数|微积分|数论|群|环|域|同余|极限)/i,
      /(mathematics|proof|theorem|function|equation|matrix|derivative|integral|probability|statistics|linear algebra|calculus|number theory|congruence|limit)/i,
    ],
    impliedSkillIds: ['pedagogy.example-first', 'pedagogy.problem-solving'],
    preferredTeachingRoles: [
      'concrete_hook',
      'definition_boundary',
      'worked_example',
      'comparison',
      'practice_check',
      'synthesis',
    ],
    preferredComponentKinds: ['derivation', 'proof', 'example'],
    forbiddenPatterns: ['本页用于', '学习者将', '[Formula]', '\\texttt'],
    outlineGuidance: {
      'zh-CN': [
        '先给具体表达式、条件或反例，再抽象定义。',
        '证明页先分清假设、目标和可用定理；推导页每一步说明为什么合法。',
      ],
      'en-US': [
        'Begin with a concrete expression, condition, or counterexample before abstracting.',
        'For proof pages, separate assumptions, goal, and usable theorem; every derivation step says why it is legal.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['用推导、条件表、反例或证明步骤承载数学思考，不要只写结论。'],
      'en-US': [
        'Use derivations, condition tables, counterexamples, or proof steps, not conclusion-only prose.',
      ],
    },
  },
  {
    id: 'discipline.humanities-social',
    kind: 'discipline',
    label: { 'zh-CN': '人文社科', 'en-US': 'Humanities / Social Science' },
    priority: 90,
    preferredSubject: 'humanities_social_science',
    triggers: [
      /(论文|写作|社会学|历史|文学|哲学|政治|文化|文本|证据|论点|论证|视角|理论|案例|访谈|田野|问卷|制度|阶级|性别|族群)/i,
      /(essay|writing|sociology|history|literature|philosophy|politics|culture|text|evidence|claim|argument|perspective|theory|case|interview|fieldwork|survey|institution|class|gender|ethnicity)/i,
    ],
    impliedSkillIds: ['pedagogy.example-first', 'pedagogy.problem-solving'],
    preferredTeachingRoles: [
      'concrete_hook',
      'evidence_frame',
      'comparison',
      'case_analysis',
      'practice_check',
      'synthesis',
    ],
    preferredComponentKinds: ['case', 'quote', 'table'],
    forbiddenPatterns: ['本页用于', '学习者将', '[Quote]', '\\texttt'],
    outlineGuidance: {
      'zh-CN': ['先给材料、现象或学生草稿，再给概念框架；所有观点必须绑定证据或文本细节。'],
      'en-US': [
        'Start with material, phenomenon, or a student draft; every claim must attach to evidence or textual detail.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['用观点-证据-解释、材料细读或理论视角对比承载页面。'],
      'en-US': [
        'Use claim-evidence-explanation, close reading, or lens comparison as the page structure.',
      ],
    },
  },
  {
    id: 'discipline.business-economics',
    kind: 'discipline',
    label: { 'zh-CN': '商科与经济', 'en-US': 'Business / Economics' },
    priority: 90,
    preferredSubject: 'business_economics',
    triggers: [
      /(商科|商业|经济|经济学|宏观|微观|供给|需求|均衡|弹性|边际|机会成本|通胀|失业|市场|外部性|政策|GDP|CPI|财务|管理|营销)/i,
      /(business|economics|economic|macroeconomics|microeconomics|supply|demand|equilibrium|elasticity|marginal|opportunity cost|inflation|unemployment|market|externality|policy|GDP|CPI|finance|management|marketing)/i,
    ],
    impliedSkillIds: ['pedagogy.example-first', 'pedagogy.problem-solving'],
    preferredTeachingRoles: [
      'concrete_hook',
      'case_analysis',
      'concept_model',
      'comparison',
      'worked_example',
      'synthesis',
    ],
    preferredComponentKinds: ['case', 'chart', 'table'],
    forbiddenPatterns: ['本页用于', '学习者将', '[Chart]', '\\texttt'],
    outlineGuidance: {
      'zh-CN': ['先给情境、数据或政策冲击，再抽象成变量、机制和权衡。'],
      'en-US': [
        'Start with a situation, data point, or policy shock before abstracting variables, mechanism, and trade-off.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['分清假设、变量变化、机制、证据和取舍。'],
      'en-US': ['Separate assumptions, variable movement, mechanism, evidence, and trade-off.'],
    },
  },
  {
    id: 'topic.oop.object-model',
    kind: 'topic',
    label: { 'zh-CN': 'OOP 对象模型', 'en-US': 'OOP object model' },
    priority: 88,
    triggers: [
      /(面向对象|OOP|class|__init__|self|实例属性|属性|方法|对象|类|dot lookup|点号|representation invariant|表示不变式|信息隐藏|封装)/i,
    ],
    impliedSkillIds: ['component.memory', 'pedagogy.example-first'],
    preferredTeachingRoles: [
      'concrete_hook',
      'failure_demo',
      'concept_model',
      'worked_example',
      'structure_invariant',
    ],
    preferredComponentKinds: ['memory', 'table', 'invariant'],
    forbiddenPatterns: ['CSC148 OOP prompt', '本页用于', '引出面向对象编程的动机'],
    outlineGuidance: {
      'zh-CN': [
        'OOP 不是先背 class/instance/attribute 术语；先问“我要表示什么对象、字段叫什么、哪些状态不合法、需要哪些操作”。',
        '旧表示失败页要用材料里的具体对象展示 list/dict/零散变量为什么不能保护规则。',
        '讲 `self`、点号和属性修改时必须说明当前 name 指向哪个 heap object。',
      ],
      'en-US': [
        'Do not open OOP with class/instance/attribute vocabulary. First ask what object is represented, what fields mean, which states are illegal, and what operations it needs.',
        'The old-representation failure page must use the concrete object from the source to show why list/dict/loose variables cannot protect rules.',
        'When teaching self, dot lookup, and mutation, state which heap object the current name references.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        'OOP intro 页先解释例子本身，再画对象或比较旧表示；不要一上来做术语清单。',
        '用 `memory` 或小表格区分 name、reference、object、attribute、mutation。',
      ],
      'en-US': [
        'OOP intro pages explain the example first, then show the object or compare old representations; do not start with term lists.',
        'Use memory or compact tables to distinguish name, reference, object, attribute, and mutation.',
      ],
    },
    narrationGuidance: {
      'zh-CN': [
        '朗读 `self.created_at` 为“self 的 created at 属性”，不要读成 self dot created at。',
      ],
      'en-US': [
        'Read `self.created_at` as “self dot created at” only when explicitly explaining notation; otherwise say “the created_at attribute on self”.',
      ],
    },
  },
  {
    id: 'topic.syntax.execution-trace',
    kind: 'topic',
    label: { 'zh-CN': '代码执行追踪', 'en-US': 'Code execution trace' },
    priority: 72,
    triggers: [/(loop|循环|for |while |if |return|trace|追踪|执行|line|当前行|递归|recursion)/i],
    impliedSkillIds: ['component.trace', 'pedagogy.trace-state'],
    preferredTeachingRoles: ['state_trace', 'worked_example'],
    preferredComponentKinds: ['trace', 'statetable', 'callstack'],
    outlineGuidance: {
      'zh-CN': ['代码追踪页讲当前行、读到的值、条件真假、变量变化和下一步跳转，不讲最终答案优先。'],
      'en-US': [
        'Trace pages teach current line, values read, condition result, variable changes, and next jump before final answer.',
      ],
    },
    semanticGuidance: {
      'zh-CN': [
        '优先用 `trace` / `statetable` / `callstack`，步骤文案要写“读什么、改什么、为什么走下一步”。',
      ],
      'en-US': [
        'Prefer `trace`, `statetable`, or `callstack`; each step says what is read, changed, and why the next step follows.',
      ],
    },
  },
  {
    id: 'topic.ds.structures',
    kind: 'topic',
    label: { 'zh-CN': '数据结构', 'en-US': 'Data structures' },
    priority: 70,
    triggers: [
      /(linked list|链表|tree|树|bst|stack|queue|dictionary|dict|栈|队列|字典|invariant|不变式)/i,
    ],
    impliedSkillIds: ['pedagogy.trace-state'],
    preferredTeachingRoles: ['structure_invariant', 'state_trace', 'worked_example'],
    preferredComponentKinds: [
      'linkedlist',
      'tree',
      'bst',
      'stack',
      'queue',
      'dictionary',
      'invariant',
    ],
    outlineGuidance: {
      'zh-CN': [
        '数据结构页围绕结构承诺：handle/link、parent-child/order rule、active end、key/value mutation。',
      ],
      'en-US': [
        'Data-structure pages teach the structure promise: handles/links, parent-child/order rules, active ends, and key/value mutation.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['操作页必须给操作后的完整结构快照，并检查 invariant。'],
      'en-US': [
        'Operation pages must show the full post-operation snapshot and check the invariant.',
      ],
    },
  },
  {
    id: 'topic.alg.graph-frontier',
    kind: 'topic',
    label: { 'zh-CN': '算法 frontier', 'en-US': 'Algorithm frontier' },
    priority: 68,
    triggers: [/(algorithm|算法|dfs|bfs|graph|图|frontier|visited|search|搜索|遍历)/i],
    impliedSkillIds: ['component.graph-trace', 'pedagogy.trace-state'],
    preferredTeachingRoles: ['strategy_trace', 'state_trace'],
    preferredComponentKinds: ['graph_trace', 'stack', 'queue', 'tree'],
    outlineGuidance: {
      'zh-CN': [
        '算法页讲策略状态：frontier、visited、call stack、queue/stack 如何决定下一步；不要只给最终访问顺序。',
      ],
      'en-US': [
        'Algorithm pages teach strategy state: frontier, visited, call stack, and how queue/stack chooses the next move, not only final order.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['用 `graph_trace` 或 `trace + stack/queue` 展示策略状态。'],
      'en-US': ['Use `graph_trace` or `trace + stack/queue` to show strategy state.'],
    },
  },
  {
    id: 'pedagogy.example-first',
    kind: 'pedagogy',
    label: { 'zh-CN': '例子先行', 'en-US': 'Example first' },
    priority: 62,
    triggers: [],
    outlineGuidance: {
      'zh-CN': ['每页先落到一个具体对象、输入、题目、材料或数据，再抽象概念。'],
      'en-US': [
        'Every page starts from a concrete object, input, problem, source, or data point before abstraction.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['禁止只有抽象概括；页面必须能让学生看见“现在的问题是什么”。'],
      'en-US': ['No abstract-only summary; the page must make the current problem visible.'],
    },
  },
  {
    id: 'pedagogy.trace-state',
    kind: 'pedagogy',
    label: { 'zh-CN': '状态追踪', 'en-US': 'State tracing' },
    priority: 58,
    triggers: [],
    outlineGuidance: {
      'zh-CN': ['训练顺序是：先建模状态，再追踪变化，再检查规则。'],
      'en-US': ['Teach in this order: model state, trace change, check the rule.'],
    },
    semanticGuidance: {
      'zh-CN': ['步骤文案不要复述代码；要说当前状态为什么变成下一状态。'],
      'en-US': [
        'Step copy should not repeat code; it should explain why the current state becomes the next state.',
      ],
    },
  },
  {
    id: 'pedagogy.problem-solving',
    kind: 'pedagogy',
    label: { 'zh-CN': '写前思考动作', 'en-US': 'Before-solving move' },
    priority: 56,
    triggers: [],
    outlineGuidance: {
      'zh-CN': ['每页至少留下一个“写代码前 / 解题前 / 分析前要问什么”的可迁移动作。'],
      'en-US': [
        'Each page leaves one transferable “what should I ask before writing/solving/analyzing?” move.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['结尾不要空泛总结；用一句可执行 checklist。'],
      'en-US': ['Do not end with vague summary; leave one executable checklist sentence.'],
    },
  },
  {
    id: 'component.memory',
    kind: 'component',
    label: { 'zh-CN': 'Memory 组件', 'en-US': 'Memory component' },
    priority: 45,
    triggers: [/(memory|alias|引用|heap|stack frame|self|object|对象|实例|属性|attribute)/i],
    preferredComponentKinds: ['memory'],
    outlineGuidance: {
      'zh-CN': ['涉及对象、引用、aliasing、`self` 时优先规划 memory 组件。'],
      'en-US': ['Prefer the memory component for objects, references, aliasing, and self.'],
    },
    semanticGuidance: {
      'zh-CN': ['memory 组件要同时出现 stack 名字和 heap 对象，说明谁引用谁、谁被修改。'],
      'en-US': [
        'Memory components show both stack names and heap objects, explaining references and mutations.',
      ],
    },
  },
  {
    id: 'component.trace',
    kind: 'component',
    label: { 'zh-CN': 'Trace 组件', 'en-US': 'Trace component' },
    priority: 44,
    triggers: [/(trace|追踪|执行|loop|循环|当前行|line|condition|条件)/i],
    preferredComponentKinds: ['trace', 'statetable'],
    outlineGuidance: {
      'zh-CN': ['涉及逐行执行、循环或条件判断时优先规划 trace/statetable。'],
      'en-US': ['Prefer trace/statetable for line-by-line execution, loops, and condition checks.'],
    },
    semanticGuidance: {
      'zh-CN': ['trace 步骤要显示当前行和当前状态，不强调输出。'],
      'en-US': ['Trace steps show current line and state; output is secondary.'],
    },
  },
  {
    id: 'component.graph-trace',
    kind: 'component',
    label: { 'zh-CN': 'Graph Trace 组件', 'en-US': 'Graph trace component' },
    priority: 42,
    triggers: [/(graph|图|dfs|bfs|frontier|visited)/i],
    preferredComponentKinds: ['graph_trace'],
    outlineGuidance: {
      'zh-CN': ['图搜索优先规划 graph_trace，必须出现 frontier 和 visited。'],
      'en-US': ['Graph search prefers graph_trace and must show frontier and visited.'],
    },
    semanticGuidance: {
      'zh-CN': ['每一步说清 frontier 如何更新、visited 如何避免重复。'],
      'en-US': ['Each step states how frontier updates and how visited prevents repeats.'],
    },
  },
  {
    id: 'purpose.research',
    kind: 'purpose',
    label: { 'zh-CN': '科研用途', 'en-US': 'Research purpose' },
    priority: 80,
    triggers: [/(research|科研|文献|方法论|研究问题|methodology|literature)/i],
    preferredTeachingRoles: [
      'concrete_hook',
      'definition_boundary',
      'evidence_frame',
      'case_analysis',
      'synthesis',
    ],
    outlineGuidance: {
      'zh-CN': [
        '科研模式统一组织为：研究问题 -> 概念边界 -> 文献或争议 -> 方法/证据 -> 局限 -> 下一步。',
      ],
      'en-US': [
        'Research mode follows: research question -> conceptual scope -> literature/debate -> method/evidence -> limitations -> next steps.',
      ],
    },
    semanticGuidance: {
      'zh-CN': ['科研页强调证据质量、假设、方法适配性、可替代解释与局限。'],
      'en-US': [
        'Research pages emphasize evidence quality, assumptions, method fit, alternatives, and limitations.',
      ],
    },
  },
];

export function getTeachingSkillById(id: string): TeachingSkill | undefined {
  return TEACHING_SKILL_REGISTRY.find((skill) => skill.id === id);
}
