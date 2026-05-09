import type { TeachingComponentKind, TeachingRole } from './types';

type PromptLanguage = 'zh-CN' | 'en-US';

export type TeachingRoleComponentPolicy = 'avoid' | 'optional' | 'recommended' | 'required';

export interface TeachingRoleSpec {
  role: TeachingRole;
  label: Record<PromptLanguage, string>;
  intent: Record<PromptLanguage, string>;
  contentShape: Record<PromptLanguage, string>;
  componentPolicy: TeachingRoleComponentPolicy;
  compatibleComponentKinds: TeachingComponentKind[];
  fallbackComponentKinds: TeachingComponentKind[];
  avoid: Record<PromptLanguage, string[]>;
}

const ALL_COMPONENT_KINDS: TeachingComponentKind[] = [
  'trace',
  'statetable',
  'callstack',
  'memory',
  'linkedlist',
  'tree',
  'bst',
  'graph_trace',
  'stack',
  'queue',
  'dictionary',
  'invariant',
  'table',
  'derivation',
  'proof',
  'example',
  'case',
  'quote',
  'chart',
];

const ROLE_SPECS: TeachingRoleSpec[] = [
  {
    role: 'concrete_hook',
    label: { 'zh-CN': '场景入口', 'en-US': 'Hook' },
    intent: {
      'zh-CN': '让学生先知道今天在解决什么真实问题，先建立“为什么要学”的对象感。',
      'en-US': 'Make the concrete problem visible before naming the concept.',
    },
    contentShape: {
      'zh-CN': '一个具体对象/输入/材料 + 一句困惑或问题；可以用短 callout、少量卡片或小表格。',
      'en-US':
        'One concrete object/input/source plus one guiding question; use a callout, a few cards, or a small table.',
    },
    componentPolicy: 'avoid',
    compatibleComponentKinds: ['example', 'case', 'quote', 'chart', 'table'],
    fallbackComponentKinds: ['example'],
    avoid: {
      'zh-CN': [
        '不要上来给术语路线图。',
        '不要做 trace / memory 长追踪。',
        '不要写宣传语或教案动机。',
      ],
      'en-US': [
        'Do not open with a vocabulary roadmap.',
        'Do not start with a long trace or memory diagram.',
        'Do not write promo or lesson-plan prose.',
      ],
    },
  },
  {
    role: 'failure_demo',
    label: { 'zh-CN': '失败现场', 'en-US': 'Failure demo' },
    intent: {
      'zh-CN': '让旧表示、旧算法或直觉真实失败一次，再说明新概念为什么必要。',
      'en-US':
        'Make the old representation, approach, or intuition fail visibly before introducing the new idea.',
    },
    contentShape: {
      'zh-CN': '一个小反例/坏输入/错误操作 + 为什么它坏；优先用代码片段、对照表或失败卡片。',
      'en-US':
        'One counterexample, bad input, or unsafe operation plus why it breaks; prefer code snippets, a comparison table, or failure cards.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ['table', 'example', 'dictionary', 'memory', 'trace', 'case'],
    fallbackComponentKinds: ['table'],
    avoid: {
      'zh-CN': ['不要只写“list/dict 不够好”这类抽象判断。', '不要把多个失败点堆成长 bullet。'],
      'en-US': [
        'Do not merely state that the old approach is weak.',
        'Do not pile many failure modes into long bullets.',
      ],
    },
  },
  {
    role: 'concept_model',
    label: { 'zh-CN': '概念建模', 'en-US': 'Concept model' },
    intent: {
      'zh-CN': '给一个概念划边界：它解决什么麻烦，它不是旁边哪个概念。',
      'en-US': 'Draw the boundary of a concept: what problem it solves and what it is not.',
    },
    contentShape: {
      'zh-CN': '概念边界 + 一个具体例子 + 一个非例子或相邻概念对照。',
      'en-US':
        'Concept boundary plus one example and one non-example or neighboring concept contrast.',
    },
    componentPolicy: 'optional',
    compatibleComponentKinds: ['table', 'memory', 'example', 'case', 'quote'],
    fallbackComponentKinds: ['table'],
    avoid: {
      'zh-CN': ['不要一页塞太多新术语。', '不要用长段落代替边界对照。'],
      'en-US': [
        'Do not pack too many new terms into one page.',
        'Do not replace boundary contrast with long prose.',
      ],
    },
  },
  {
    role: 'definition_boundary',
    label: { 'zh-CN': '定义边界', 'en-US': 'Definition boundary' },
    intent: {
      'zh-CN': '讲清定义或规则的条件边界，以及删掉条件会发生什么。',
      'en-US':
        'Clarify the boundary conditions of a definition or rule, including what breaks if one is removed.',
    },
    contentShape: {
      'zh-CN': '条件/对象范围/目标 + 小反例或条件表。',
      'en-US': 'Conditions/object domain/goal plus a counterexample or condition table.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ['table', 'derivation', 'proof', 'example', 'invariant'],
    fallbackComponentKinds: ['table'],
    avoid: {
      'zh-CN': ['不要只抄定义。', '不要跳过条件为什么必要。'],
      'en-US': ['Do not merely restate the definition.', 'Do not skip why each condition matters.'],
    },
  },
  {
    role: 'worked_example',
    label: { 'zh-CN': '例题走读', 'en-US': 'Worked example' },
    intent: {
      'zh-CN': '带学生模仿一次解题或写代码过程，重点是下一步为什么这样做。',
      'en-US':
        'Let students imitate one solving or coding process, focusing on why the next move follows.',
    },
    contentShape: {
      'zh-CN': '题目/场景 + 逐步走读 + 一个可模仿的下一步判断。',
      'en-US':
        'Problem/situation plus step-by-step walkthrough plus one imitable next-step judgment.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ALL_COMPONENT_KINDS,
    fallbackComponentKinds: ['example'],
    avoid: {
      'zh-CN': ['不要把例题压成答案摘要。', '不要同时做多个弱例子。'],
      'en-US': [
        'Do not collapse the example into an answer summary.',
        'Do not do several weak examples at once.',
      ],
    },
  },
  {
    role: 'state_trace',
    label: { 'zh-CN': '状态追踪', 'en-US': 'State trace' },
    intent: {
      'zh-CN': '训练学生看当前状态、当前行读什么、下一状态为什么出现。',
      'en-US':
        'Train students to read current state, current line, and why the next state appears.',
    },
    contentShape: {
      'zh-CN': '代码/过程 + trace 或状态表 + 当前步骤说明。',
      'en-US': 'Code/process plus trace or state table plus current-step explanation.',
    },
    componentPolicy: 'required',
    compatibleComponentKinds: ['trace', 'statetable', 'callstack', 'memory', 'table'],
    fallbackComponentKinds: ['trace'],
    avoid: {
      'zh-CN': ['不要先给最终答案。', '不要只复述代码文本。'],
      'en-US': ['Do not lead with the final answer.', 'Do not merely paraphrase the code.'],
    },
  },
  {
    role: 'structure_invariant',
    label: { 'zh-CN': '结构与不变量', 'en-US': 'Structure invariant' },
    intent: {
      'zh-CN': '讲结构承诺，以及一次操作后规则是否仍成立。',
      'en-US': 'Teach the structure promise and whether it still holds after an operation.',
    },
    contentShape: {
      'zh-CN': '结构图/状态图 + 操作前后 + invariant 检查。',
      'en-US': 'Structure/state diagram plus before/after operation plus invariant check.',
    },
    componentPolicy: 'required',
    compatibleComponentKinds: [
      'linkedlist',
      'tree',
      'bst',
      'stack',
      'queue',
      'dictionary',
      'invariant',
      'memory',
      'table',
    ],
    fallbackComponentKinds: ['invariant'],
    avoid: {
      'zh-CN': ['不要把结构讲成普通文字列表。', '不要只说操作结果，不查规则。'],
      'en-US': [
        'Do not explain the structure as plain prose.',
        'Do not state the result without checking the rule.',
      ],
    },
  },
  {
    role: 'strategy_trace',
    label: { 'zh-CN': '策略追踪', 'en-US': 'Strategy trace' },
    intent: {
      'zh-CN': '讲算法策略状态如何决定下一步，而不是只给访问顺序。',
      'en-US': 'Show how strategy state determines the next step, not just the final order.',
    },
    contentShape: {
      'zh-CN': 'frontier/visited/call stack/queue/stack + 每步选择理由。',
      'en-US': 'Frontier/visited/call stack/queue/stack plus the reason for each choice.',
    },
    componentPolicy: 'required',
    compatibleComponentKinds: [
      'graph_trace',
      'tree',
      'trace',
      'stack',
      'queue',
      'callstack',
      'table',
    ],
    fallbackComponentKinds: ['graph_trace'],
    avoid: {
      'zh-CN': ['不要只列最终 traversal order。'],
      'en-US': ['Do not only list the final traversal order.'],
    },
  },
  {
    role: 'evidence_frame',
    label: { 'zh-CN': '证据框架', 'en-US': 'Evidence frame' },
    intent: {
      'zh-CN': '把观点绑定到材料细节、证据质量和解释链。',
      'en-US': 'Attach a claim to material details, evidence quality, and explanation.',
    },
    contentShape: {
      'zh-CN': '材料片段/数据 + 能支持什么 + 不能支持什么。',
      'en-US': 'Source excerpt/data plus what it supports and what it cannot support.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ['quote', 'case', 'table', 'chart', 'example'],
    fallbackComponentKinds: ['quote'],
    avoid: {
      'zh-CN': ['不要先上理论名再找材料。'],
      'en-US': ['Do not name the theory first and hunt for evidence later.'],
    },
  },
  {
    role: 'case_analysis',
    label: { 'zh-CN': '案例分析', 'en-US': 'Case analysis' },
    intent: {
      'zh-CN': '从一个情境里找角色、变量、限制和机制。',
      'en-US': 'Find actors, variables, constraints, and mechanism in a situation.',
    },
    contentShape: {
      'zh-CN': '案例现场 + 变量/角色拆解 + 机制或取舍。',
      'en-US': 'Case situation plus variable/actor decomposition plus mechanism or trade-off.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ['case', 'chart', 'table', 'example'],
    fallbackComponentKinds: ['case'],
    avoid: {
      'zh-CN': ['不要直接套模型名。'],
      'en-US': ['Do not apply a model name before parsing the case.'],
    },
  },
  {
    role: 'comparison',
    label: { 'zh-CN': '对比辨析', 'en-US': 'Comparison' },
    intent: {
      'zh-CN': '确定对比维度，让学生看到差异发生在哪。',
      'en-US': 'Set comparison dimensions so students see where the difference occurs.',
    },
    contentShape: {
      'zh-CN': '两到三个对象/方法 + 明确维度 + 结论边界。',
      'en-US': 'Two or three objects/methods plus explicit dimensions and conclusion boundary.',
    },
    componentPolicy: 'recommended',
    compatibleComponentKinds: ['table', 'chart', 'case', 'example'],
    fallbackComponentKinds: ['table'],
    avoid: {
      'zh-CN': ['不要没有维度地并排罗列。'],
      'en-US': ['Do not list items side-by-side without dimensions.'],
    },
  },
  {
    role: 'practice_check',
    label: { 'zh-CN': '即时练习', 'en-US': 'Practice check' },
    intent: {
      'zh-CN': '少讲一点，让学生用刚学的方法做一次判断。',
      'en-US': 'Reduce exposition and make students apply the method once.',
    },
    contentShape: {
      'zh-CN': '一个短题/判断/改错 + 明确检查点。',
      'en-US': 'One short question/judgment/debug task plus clear check point.',
    },
    componentPolicy: 'optional',
    compatibleComponentKinds: ['example', 'table', 'trace', 'memory', 'case'],
    fallbackComponentKinds: ['example'],
    avoid: {
      'zh-CN': ['不要继续讲新概念。', '不要把测验写成总结页。'],
      'en-US': ['Do not introduce a new concept.', 'Do not turn the quiz into a summary page.'],
    },
  },
  {
    role: 'synthesis',
    label: { 'zh-CN': '迁移总结', 'en-US': 'Transfer summary' },
    intent: {
      'zh-CN': '收束成下次能用的判断顺序，而不是复述术语。',
      'en-US': 'Convert the lesson into a next-time decision sequence rather than a term recap.',
    },
    contentShape: {
      'zh-CN': '检查链/迁移小题/一组判断问题。',
      'en-US': 'Checklist, transfer mini-task, or a set of judgment questions.',
    },
    componentPolicy: 'optional',
    compatibleComponentKinds: ['table', 'example', 'case'],
    fallbackComponentKinds: [],
    avoid: {
      'zh-CN': ['不要只列术语表。', '不要引入新的复杂例子。'],
      'en-US': ['Do not merely list terms.', 'Do not introduce a complex new example.'],
    },
  },
];

const ROLE_SPEC_BY_ID = new Map(ROLE_SPECS.map((spec) => [spec.role, spec]));

export function getTeachingRoleSpec(role: TeachingRole): TeachingRoleSpec {
  return ROLE_SPEC_BY_ID.get(role) || ROLE_SPEC_BY_ID.get('concept_model')!;
}

export function filterComponentKindsForRole(
  kinds: TeachingComponentKind[],
  role: TeachingRole,
): TeachingComponentKind[] {
  const spec = getTeachingRoleSpec(role);
  const compatible = new Set(spec.compatibleComponentKinds);
  return kinds.filter(
    (kind, index, allKinds) => compatible.has(kind) && allKinds.indexOf(kind) === index,
  );
}

export function pickComponentKindsForRole(args: {
  role: TeachingRole;
  inferred: TeachingComponentKind[];
  preferred: TeachingComponentKind[];
  isOpeningIntro?: boolean;
}): TeachingComponentKind[] {
  const spec = getTeachingRoleSpec(args.role);
  if (args.isOpeningIntro) return ['example'];

  const compatible = [
    ...filterComponentKindsForRole(args.inferred, args.role),
    ...filterComponentKindsForRole(args.preferred, args.role),
  ].filter((kind, index, allKinds) => allKinds.indexOf(kind) === index);

  const withFallback =
    compatible.length > 0
      ? compatible
      : spec.componentPolicy === 'required' || spec.componentPolicy === 'recommended'
        ? spec.fallbackComponentKinds
        : [];

  const maxKinds =
    spec.componentPolicy === 'required'
      ? 3
      : spec.componentPolicy === 'recommended'
        ? 2
        : spec.componentPolicy === 'optional'
          ? 1
          : 0;

  return withFallback.slice(0, maxKinds);
}

export function formatTeachingRoleSpecForPrompt(
  role: TeachingRole,
  language: PromptLanguage,
): string[] {
  const spec = getTeachingRoleSpec(role);
  const componentText =
    spec.componentPolicy === 'avoid'
      ? language === 'zh-CN'
        ? '本页通常不需要重组件；只在能帮助建立问题感时使用轻量例子/表格。'
        : 'This page usually avoids heavy components; use only a light example/table if it clarifies the problem.'
      : language === 'zh-CN'
        ? `${spec.componentPolicy}；可用组件：${spec.compatibleComponentKinds.join(', ') || '无'}`
        : `${spec.componentPolicy}; allowed components: ${spec.compatibleComponentKinds.join(', ') || 'none'}`;

  if (language === 'zh-CN') {
    return [
      `- role 任务：${spec.intent[language]}`,
      `- 合适形态：${spec.contentShape[language]}`,
      `- 组件策略：${componentText}`,
      `- 避免：${spec.avoid[language].join('；')}`,
    ];
  }
  return [
    `- Role job: ${spec.intent[language]}`,
    `- Suitable shape: ${spec.contentShape[language]}`,
    `- Component policy: ${componentText}`,
    `- Avoid: ${spec.avoid[language].join('; ')}`,
  ];
}
