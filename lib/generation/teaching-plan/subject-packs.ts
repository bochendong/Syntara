import type { SubjectTeachingPackId, TeachingComponentKind, TeachingRole } from './types';

type PromptLanguage = 'zh-CN' | 'en-US';

export interface SubjectTeachingPack {
  id: SubjectTeachingPackId;
  label: Record<PromptLanguage, string>;
  detectors: RegExp[];
  defaultRoles: TeachingRole[];
  forbiddenPatterns: string[];
  guidance: Record<PromptLanguage, string[]>;
}

export const SUBJECT_TEACHING_PACKS: SubjectTeachingPack[] = [
  {
    id: 'computer_science',
    label: { 'zh-CN': '计算机科学', 'en-US': 'Computer Science' },
    detectors: [
      /(计算机|编程|程序|代码|Python|Java|JavaScript|TypeScript|变量|循环|递归|函数|类|对象|self|OOP|面向对象|链表|二叉树|BST|树|图|DFS|BFS|栈|队列|字典|哈希|算法|数据结构|复杂度|invariant|不变式)/i,
      /(computer science|programming|program|code|python|java|javascript|typescript|variable|loop|recursion|function|class|object|self|oop|linked list|binary tree|bst|tree|graph|dfs|bfs|stack|queue|dictionary|hash|algorithm|data structure|complexity|invariant)/i,
    ],
    defaultRoles: [
      'concrete_hook',
      'failure_demo',
      'concept_model',
      'state_trace',
      'structure_invariant',
      'worked_example',
      'practice_check',
      'synthesis',
    ],
    forbiddenPatterns: [
      '本页用于',
      '引出',
      '建立本课主线',
      '强调',
      '学习者将',
      '[Table]',
      '\\texttt',
      '\\len',
      '\\endrows',
      '\\endslide',
      '<beginrow',
    ],
    guidance: {
      'zh-CN': [
        '第一页可以是上下文 intro，但必须先解释素材里的具体例子是什么，再讨论如何表示。',
        '每页先看 TeachingPlan role：hook 轻，failure_demo 要有失败现场，concept_model 做边界，trace/structure/strategy 页才进入状态或结构细节。',
        'trace、operation、algorithm 页的讲解顺序是：先看当前状态，再问这一步读什么、改什么、为什么下一步这样走。',
        'OOP 必须区分 name、reference、heap object、self、attribute mutation。',
        '数据结构必须讲结构承诺和操作后 invariant 是否仍成立。',
      ],
      'en-US': [
        'The first page may be a context intro, but it must explain the concrete example from the source before asking how to represent it.',
        'Check the TeachingPlan role first: hooks stay light, failure demos need a visible failure, concept models draw boundaries, and trace/structure/strategy pages carry state or structure detail.',
        'For trace, operation, and algorithm pages, explain in this order: current state, what is read, what changes, and why the next move follows.',
        'For OOP, distinguish name, reference, heap object, self, and attribute mutation.',
        'For data structures, teach the structure promise and whether the invariant still holds after the operation.',
      ],
    },
  },
  {
    id: 'mathematics',
    label: { 'zh-CN': '数学', 'en-US': 'Mathematics' },
    detectors: [
      /(数学|证明|定理|函数|方程|矩阵|导数|积分|概率|统计|线性代数|微积分|数论|群|环|域|同余|极限)/i,
      /(mathematics|proof|theorem|function|equation|matrix|derivative|integral|probability|statistics|linear algebra|calculus|number theory|congruence|limit)/i,
    ],
    defaultRoles: [
      'concrete_hook',
      'definition_boundary',
      'worked_example',
      'comparison',
      'practice_check',
      'synthesis',
    ],
    forbiddenPatterns: ['本页用于', '学习者将', '[Formula]', '[Table]', '\\texttt'],
    guidance: {
      'zh-CN': [
        '先给一个具体表达式、条件或反例，再抽象定义。',
        '每一步推导都要说明允许这样做的条件。',
        '证明页必须先分清假设、目标和可用定理。',
      ],
      'en-US': [
        'Begin with a concrete expression, condition, or counterexample before abstracting.',
        'Each derivation step must state why the move is allowed.',
        'Proof pages must separate assumptions, goal, and usable theorem.',
      ],
    },
  },
  {
    id: 'humanities_social_science',
    label: { 'zh-CN': '人文与社会科学', 'en-US': 'Humanities and Social Science' },
    detectors: [
      /(论文|写作|社会学|历史|文学|哲学|政治|文化|文本|证据|论点|论证|视角|理论|案例|访谈|田野|问卷|制度|阶级|性别|族群)/i,
      /(essay|writing|sociology|history|literature|philosophy|politics|culture|text|evidence|claim|argument|perspective|theory|case|interview|fieldwork|survey|institution|class|gender|ethnicity)/i,
    ],
    defaultRoles: [
      'concrete_hook',
      'evidence_frame',
      'comparison',
      'case_analysis',
      'practice_check',
      'synthesis',
    ],
    forbiddenPatterns: ['本页用于', '学习者将', '[Table]', '[Quote]', '\\texttt'],
    guidance: {
      'zh-CN': [
        '先给材料、现象或学生草稿，再给概念框架。',
        '所有观点必须绑定证据、文本细节或案例观察。',
        '对比理论时要讲它们会看见什么、忽略什么。',
      ],
      'en-US': [
        'Start with material, phenomenon, or a student draft before naming the frame.',
        'Every claim must attach to evidence, textual detail, or case observation.',
        'When comparing lenses, say what each lens notices and what it misses.',
      ],
    },
  },
  {
    id: 'business_economics',
    label: { 'zh-CN': '商科与经济', 'en-US': 'Business and Economics' },
    detectors: [
      /(商科|商业|经济|经济学|宏观|微观|供给|需求|均衡|弹性|边际|机会成本|通胀|失业|市场|外部性|政策|GDP|CPI|财务|管理|营销)/i,
      /(business|economics|economic|macroeconomics|microeconomics|supply|demand|equilibrium|elasticity|marginal|opportunity cost|inflation|unemployment|market|externality|policy|GDP|CPI|finance|management|marketing)/i,
    ],
    defaultRoles: [
      'concrete_hook',
      'case_analysis',
      'concept_model',
      'comparison',
      'worked_example',
      'synthesis',
    ],
    forbiddenPatterns: ['本页用于', '学习者将', '[Chart]', '[Table]', '\\texttt'],
    guidance: {
      'zh-CN': [
        '先给商业情境、数据或政策冲击，再抽象成变量和机制。',
        '每页分清假设、变量变化、证据和取舍。',
        '解释模型时必须说明“其他条件不变”或短期/长期范围。',
      ],
      'en-US': [
        'Start with a business situation, data point, or policy shock before abstracting variables and mechanisms.',
        'Separate assumptions, variable movement, evidence, and trade-off on each page.',
        'When explaining a model, state ceteris paribus or short-run/long-run scope.',
      ],
    },
  },
  {
    id: 'general',
    label: { 'zh-CN': '通用课程', 'en-US': 'General' },
    detectors: [],
    defaultRoles: [
      'concrete_hook',
      'concept_model',
      'worked_example',
      'practice_check',
      'synthesis',
    ],
    forbiddenPatterns: ['本页用于', '学习者将', '[Table]', '\\texttt'],
    guidance: {
      'zh-CN': [
        '先给具体例子，再抽象概念。',
        '每页只承担一个清晰教学任务。',
        '结尾给一个可迁移的思考动作。',
      ],
      'en-US': [
        'Start with a concrete example before abstracting.',
        'Each page should do one clear teaching job.',
        'End with one transferable thinking move.',
      ],
    },
  },
];

export function compactTeachingText(
  parts: Array<string | undefined | null>,
  limit = 24_000,
): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function detectSubjectTeachingPackId(
  text: string,
  hint?: SubjectTeachingPackId | string,
): SubjectTeachingPackId {
  if (hint && SUBJECT_TEACHING_PACKS.some((pack) => pack.id === hint)) {
    return hint as SubjectTeachingPackId;
  }
  let best: { id: SubjectTeachingPackId; score: number } = { id: 'general', score: 0 };
  for (const pack of SUBJECT_TEACHING_PACKS) {
    const score = pack.detectors.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    if (score > best.score) best = { id: pack.id, score };
  }
  return best.id;
}

export function getSubjectTeachingPack(id: SubjectTeachingPackId): SubjectTeachingPack {
  return (
    SUBJECT_TEACHING_PACKS.find((pack) => pack.id === id) ||
    SUBJECT_TEACHING_PACKS[SUBJECT_TEACHING_PACKS.length - 1]
  );
}

export function inferComponentKindsForText(
  text: string,
  subject: SubjectTeachingPackId,
): TeachingComponentKind[] {
  const lower = text.toLowerCase();
  const kinds: TeachingComponentKind[] = [];
  const add = (kind: TeachingComponentKind) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };

  if (/trace|追踪|循环|loop|执行|line|行/.test(lower)) add('trace');
  if (/递归|recursion|call stack|调用栈/.test(lower)) add('callstack');
  if (
    /memory|alias|引用|self|object|对象|heap|stack frame|属性|attribute|instance|实例|class|类|__init__|method|方法/.test(
      lower,
    )
  )
    add('memory');
  if (/doubly|linked list|链表|prev|next|pointer|指针/.test(lower)) add('linkedlist');
  if (/bst|binary search tree|二叉搜索树/.test(lower)) add('bst');
  else if (/tree|树|traversal|遍历/.test(lower)) add('tree');
  if (/graph|dfs|bfs|frontier|visited|图/.test(lower)) add('graph_trace');
  if (/stack|push|pop|栈/.test(lower)) add('stack');
  if (/queue|enqueue|dequeue|队列/.test(lower)) add('queue');
  if (/dict|dictionary|map|hash|字典|哈希/.test(lower)) add('dictionary');
  if (/invariant|不变式|合法|representation|rep invariant|规则|rule/.test(lower)) add('invariant');
  if (
    /table|compare|对比|比较|列表|字典/.test(lower) ||
    (subject === 'computer_science' &&
      /\b(list|dict|dictionary|class)\b|旧表示|失败|坏|risk|failure/.test(lower))
  ) {
    add('table');
  }
  if (/derive|derivation|推导|方程|矩阵|公式/.test(lower)) add('derivation');
  if (/proof|prove|证明|定理/.test(lower)) add('proof');
  if (/quote|文本|原文|引用/.test(lower)) add('quote');
  if (/case|案例|情境|政策|市场/.test(lower)) add('case');
  if (/chart|data|数据|指标|趋势/.test(lower)) add('chart');

  if (kinds.length === 0) {
    if (subject === 'computer_science') add('example');
    else if (subject === 'mathematics') add('derivation');
    else if (subject === 'humanities_social_science') add('case');
    else if (subject === 'business_economics') add('case');
    else add('example');
  }

  return kinds.slice(0, 4);
}

export function inferTeachingRoleForText(args: {
  text: string;
  order: number;
  subject: SubjectTeachingPackId;
  isFinal?: boolean;
  isQuiz?: boolean;
}): TeachingRole {
  if (args.isQuiz) return 'practice_check';
  if (args.isFinal && args.order > 1) return 'synthesis';

  const lower = args.text.toLowerCase();
  if (args.subject === 'computer_science') {
    if (args.order === 1) return 'concrete_hook';
    if (args.order === 2 || /list|dict|failure|问题|风险|错|break|坏/.test(lower)) {
      return 'failure_demo';
    }
    if (/trace|loop|循环|执行|递归|call stack/.test(lower)) return 'state_trace';
    if (/linked|bst|tree|stack|queue|dictionary|invariant|链表|树|队列|字典|不变式/.test(lower)) {
      return 'structure_invariant';
    }
    if (/algorithm|dfs|bfs|frontier|visited|算法/.test(lower)) return 'strategy_trace';
    if (/example|例题|实现|__init__|method|方法/.test(lower)) return 'worked_example';
    return 'concept_model';
  }

  if (args.subject === 'mathematics') {
    if (/proof|证明|定理/.test(lower)) return 'definition_boundary';
    if (/example|例题|求|解|compute|calculate/.test(lower)) return 'worked_example';
    if (/compare|对比|反例|边界/.test(lower)) return 'comparison';
    return args.order === 1 ? 'concrete_hook' : 'definition_boundary';
  }

  if (args.subject === 'business_economics') {
    if (/data|chart|指标|趋势|政策|market|case|案例/.test(lower)) return 'case_analysis';
    if (/compare|trade.?off|权衡|对比/.test(lower)) return 'comparison';
    return args.order === 1 ? 'concrete_hook' : 'concept_model';
  }

  if (args.subject === 'humanities_social_science') {
    if (/quote|文本|原文|证据/.test(lower)) return 'evidence_frame';
    if (/case|案例|现象/.test(lower)) return 'case_analysis';
    if (/compare|视角|理论|对比/.test(lower)) return 'comparison';
    return args.order === 1 ? 'concrete_hook' : 'evidence_frame';
  }

  return args.order === 1 ? 'concrete_hook' : 'concept_model';
}
