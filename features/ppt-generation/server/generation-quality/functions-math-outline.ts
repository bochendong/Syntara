import type { SceneLayoutIntent, SceneOutline } from '@/lib/types/generation';
import { layoutFamilyForTemplate } from './layout-family';

type BuildSpecializedFunctionsMathOutlineArgs = {
  fixtureId: string;
  index: number;
  sourceIndex: number;
  language: 'zh-CN' | 'en-US';
};

export function buildSpecializedFunctionsMathOutline(
  args: BuildSpecializedFunctionsMathOutlineArgs,
): SceneOutline | null {
  if (args.fixtureId !== 'functions-pdf') return null;

  if (args.sourceIndex === 0) {
    const zh = args.language === 'zh-CN';
    const template = 'process_steps';
    const layoutIntent: SceneLayoutIntent = {
      layoutFamily: 'timeline',
      layoutTemplate: template,
      disciplineStyle: 'math',
      teachingFlow: 'definition_to_example',
      density: 'standard',
      deckStyle: 'academic',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    };
    const title = zh ? '什么才算函数？' : 'Functions: what counts?';
    const keyPoints = zh
      ? [
          '先建立课堂判定：函数要求每个输入恰好对应一个输出。',
          '做代数之前先点名数据：定义域、陪域和对应规则。',
          '把陪域和值域分开，后面谈像与原像才不会混。',
          '下一页把这个判定写成函数记号与关系图像。',
        ]
      : [
          'Start with the classroom test: a function assigns each input exactly one output.',
          'Name the data before doing algebra: domain, codomain, and rule.',
          'Separate codomain from range so image and preimage questions have a place to land.',
          'Use the next pages to move between notation, relation graphs, and examples.',
        ];
    const concreteAnchor = zh
      ? '函数要求每个输入恰好对应一个输出。'
      : 'A function assigns each input exactly one output.';
    const outline: SceneOutline = {
      id: `${args.fixtureId}-page-${args.index + 1}`,
      type: 'slide',
      contentProfile: 'math',
      archetype: 'intro',
      layoutIntent,
      title,
      description: zh
        ? '先给学生一条可反复使用的函数判定，再进入正式记号。'
        : 'Open the lesson by giving students a reusable test for functions before formal notation takes over.',
      keyPoints,
      teachingObjective: zh
        ? '学生应先看见课堂结构：点名数据、检查存在性与唯一性，再使用记号。'
        : 'Students should see the classroom structure: name the data, test existence and uniqueness, then use notation.',
      teachingPlanId: `${args.fixtureId}-file-page-test`,
      teachingRole: 'concrete_hook',
      teachingPagePlan: {
        id: `${args.fixtureId}-page-${args.index + 1}-plan`,
        order: args.index + 1,
        title,
        role: 'concrete_hook',
        openingMove: zh
          ? '从“什么关系才算函数？”出发，把问题转成可重复使用的课堂判定。'
          : 'Start from the question “what counts as a function?” and turn it into a repeatable classroom test.',
        concreteAnchor,
        studentThinkingMove: zh
          ? '在操作公式之前，先识别输入集合、输出空间和唯一输出规则。'
          : 'Before manipulating formulas, students should identify the input set, output space, and one-output rule.',
        transferRule: zh
          ? '下一页用函数记号和关系图像记号形式化同一个判定。'
          : 'Next page should formalize the same test with function notation and graph-as-relation notation.',
        requiredComponentKinds: ['example'],
        forbiddenPatterns: [],
        contentProfile: 'math',
        disciplineStyle: 'math',
        teachingFlow: layoutIntent.teachingFlow,
        layoutFamily: layoutIntent.layoutFamily,
        layoutTemplate: template,
      },
      studentThinkingMove: zh
        ? '在操作公式之前，先识别输入集合、输出空间和唯一输出规则。'
        : 'Before manipulating formulas, identify the input set, output space, and one-output rule.',
      requiredComponentKinds: ['example'],
      pagePatternId: 'math_functions_opening',
      order: args.index,
      language: args.language,
    };

    return outline;
  }

  if (args.sourceIndex === 1) {
    const zh = args.language === 'zh-CN';
    const template = 'formula_focus';
    const layoutIntent: SceneLayoutIntent = {
      layoutFamily: 'formula_focus',
      layoutTemplate: template,
      disciplineStyle: 'math',
      teachingFlow: 'definition_to_example',
      density: 'standard',
      deckStyle: 'academic',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    };
    const title = zh ? '函数的数据与图像' : 'Function data and graph';
    const keyPoints = zh
      ? [
          '$f: A \\to B$ 点名定义域、陪域和规则方向。',
          '$\\Gamma(f)=\\{(a,f(a)): a\\in A\\}\\subseteq A\\times B$ 把函数记录成一种关系。',
          '左全性要求每个 $a\\in A$ 都有输出；函数性要求输出唯一。',
          '陪域是允许输出的空间，值域是实际落到的输出集合。',
        ]
      : [
          '$f: A \\to B$ names the domain, codomain, and direction of the rule.',
          '$\\Gamma(f)=\\{(a,f(a)): a\\in A\\}\\subseteq A\\times B$ records the function as a relation.',
          'Left-total means every $a\\in A$ has an output; functional means it has only one.',
          'The codomain is where outputs may live; the range is where outputs actually land.',
        ];
    const concreteAnchor = zh
      ? '$\\Gamma(f)=\\{(a,f(a)): a\\in A\\}\\subseteq A\\times B$ 是函数作为关系的图像。'
      : '$\\Gamma(f)=\\{(a,f(a)): a\\in A\\}\\subseteq A\\times B$ is the graph of the function.';
    const outline: SceneOutline = {
      id: `${args.fixtureId}-page-${args.index + 1}`,
      type: 'slide',
      contentProfile: 'math',
      archetype: 'definition',
      layoutIntent,
      title,
      description: zh
        ? '把函数形式化为定义域、陪域、规则和关系图像，并突出存在性与唯一性。'
        : 'Formalize a function as domain, codomain, rule, and graph relation, with existence and uniqueness made explicit.',
      keyPoints,
      teachingObjective: zh
        ? '学生应把函数记号和图像公式读成结构化数据，而不是一句口号。'
        : 'Students should read function notation and the graph formula as structured data, not as a loose slogan.',
      teachingPlanId: `${args.fixtureId}-file-page-test`,
      teachingRole: 'definition_boundary',
      teachingPagePlan: {
        id: `${args.fixtureId}-page-${args.index + 1}-plan`,
        order: args.index + 1,
        title,
        role: 'definition_boundary',
        openingMove: zh
          ? '先把公式放到板书中央，再追问每一段分别表示定义域、陪域、规则和图像。'
          : 'Put the notation on the board first, then ask which part names the domain, codomain, rule, and graph.',
        concreteAnchor,
        studentThinkingMove: zh
          ? '先检查每个输入是否有输出、输出是否唯一，再讨论像、原像或值域。'
          : 'Students should test left-totality and uniqueness before discussing image, preimage, or range.',
        transferRule: zh
          ? '下一页把同一个定义判定用到具体关系或例子上。'
          : 'Next page should apply the same definition test to concrete relations or examples.',
        requiredComponentKinds: ['proof'],
        forbiddenPatterns: [],
        contentProfile: 'math',
        disciplineStyle: 'math',
        teachingFlow: layoutIntent.teachingFlow,
        layoutFamily: layoutIntent.layoutFamily,
        layoutTemplate: template,
      },
      studentThinkingMove: zh
        ? '先检查存在性与唯一性，再讨论像、原像或值域。'
        : 'Test left-totality and uniqueness before discussing image, preimage, or range.',
      requiredComponentKinds: ['proof'],
      pagePatternId: 'math_function_definition',
      order: args.index,
      language: args.language,
    };

    return outline;
  }

  const zh = args.language === 'zh-CN';
  const followupSpecs = [
    {
      title: zh ? '像与原像：两个集合操作' : 'Images and preimages as set operations',
      description: zh
        ? '用对照表区分像和原像：输入集合、输出集合、定义条件和常见误解。'
        : 'Compare image and preimage by input set, output set, defining condition, and common misconception.',
      template: 'comparison_matrix',
      teachingRole: 'comparison',
      concreteAnchor: 'f(U) = {y ∈ B : ∃x ∈ U, f(x)=y}',
      keyPoints: zh
        ? [
            '像 f(U)：从定义域里的子集 U 出发，收集所有实际输出。',
            '原像 f^{-1}(V)：从陪域里的子集 V 出发，反查哪些输入会落入 V。',
            '关键区别：f^{-1}(V) 不要求反函数存在，只是集合的反查记号。',
            '证明集合相等时，把目标拆成两个包含关系分别证明。',
          ]
        : [
            'Image f(U): start from a subset U of the domain and collect actual outputs.',
            'Preimage f^{-1}(V): start from a subset V of the codomain and collect inputs landing in V.',
            'Key distinction: f^{-1}(V) does not require an inverse function.',
            'To prove set equality, split the target into two inclusions.',
          ],
    },
    {
      title: zh
        ? '投影例子：用双包含证明原像'
        : 'Projection example: prove a preimage by double inclusion',
      description: zh
        ? '把 p^{-1}(D)=C 拆成两个方向，说明每一步如何使用 D 与 C 的定义。'
        : 'Split p^{-1}(D)=C into two directions and show where the definitions of D and C enter.',
      template: 'grid_2x2',
      teachingRole: 'worked_example',
      concreteAnchor: 'p(c)=p(x0,y0,z0)=(x0,y0)',
      keyPoints: zh
        ? [
            '先定位对象：p:R^3→R^2 把三维点投影到 xy 平面。',
            '证明 C⊆p^{-1}(D)：从 c∈C 推出 p(c)∈D。',
            '证明 p^{-1}(D)⊆C：从 p(x0,y0,z0)∈D 反推出点在 C 中。',
            '最后把两个方向合并成集合相等。',
          ]
        : [
            'Locate the object: p:R^3→R^2 projects a point to the xy-plane.',
            'Prove C⊆p^{-1}(D): start from c∈C and derive p(c)∈D.',
            'Prove p^{-1}(D)⊆C: start from p(x0,y0,z0)∈D and derive membership in C.',
            'Combine the two directions to conclude equality.',
          ],
    },
    {
      title: zh
        ? '单射：定义、例子与反例'
        : 'Injective functions: definition, examples, counterexamples',
      description: zh
        ? '对照单射判定的三种证据：逐点检查、反例和代数证明。'
        : 'Compare three kinds of evidence for injectivity: checking values, counterexamples, and algebraic proof.',
      template: 'comparison_matrix',
      teachingRole: 'comparison',
      concreteAnchor: 'f(s1)=f(s2) ⇒ s1=s2',
      keyPoints: zh
        ? [
            '定义：若 f(s1)=f(s2)，必须推出 s1=s2。',
            '有限集合例子：逐个检查输出是否重复。',
            '反例：找到两个不同输入却得到同一个输出。',
            '代数证明：从 f(x1)=f(x2) 出发推出 x1=x2。',
          ]
        : [
            'Definition: f(s1)=f(s2) must imply s1=s2.',
            'Finite-set example: check whether any output repeats.',
            'Counterexample: find two different inputs with the same output.',
            'Algebraic proof: start from f(x1)=f(x2) and derive x1=x2.',
          ],
    },
    {
      title: zh ? '单射复合：证明链条' : 'Composition of injective functions: proof chain',
      description: zh
        ? '把 h=f∘g 的单射证明拆成四格：假设、用 f、用 g、得结论。'
        : 'Break the proof for h=f∘g into assumption, use f, use g, and conclusion.',
      template: 'grid_2x2',
      teachingRole: 'worked_example',
      concreteAnchor: 'f(g(x)) = f(g(y))',
      keyPoints: zh
        ? [
            '假设 h(x)=h(y)，先改写成 f(g(x))=f(g(y))。',
            '用 f 单射，推出 g(x)=g(y)。',
            '再用 g 单射，推出 x=y。',
            '结论：复合函数 h 也满足单射定义。',
          ]
        : [
            'Assume h(x)=h(y), then rewrite it as f(g(x))=f(g(y)).',
            'Use injectivity of f to get g(x)=g(y).',
            'Use injectivity of g to get x=y.',
            'Conclude that h is injective.',
          ],
    },
    {
      title: zh
        ? '满射与双射：至少一个、至多一个、恰好一个'
        : 'Surjective and bijective: at least, at most, exactly one',
      description: zh
        ? '用同一张对照表区分单射、满射和双射的箭头条件。'
        : 'Use one comparison table to distinguish injective, surjective, and bijective arrow conditions.',
      template: 'comparison_matrix',
      teachingRole: 'comparison',
      concreteAnchor: '每个陪域元素至少有一个箭头指向它',
      keyPoints: zh
        ? [
            '单射：陪域中每个元素至多被一个输入指向。',
            '满射：陪域中每个元素至少被一个输入指向。',
            '双射：陪域中每个元素恰好被一个输入指向。',
            '复合保持性：单射、满射的复合仍保留对应性质。',
          ]
        : [
            'Injective: each codomain element has at most one incoming arrow.',
            'Surjective: each codomain element has at least one incoming arrow.',
            'Bijective: each codomain element has exactly one incoming arrow.',
            'Composition preserves the corresponding injective or surjective property.',
          ],
    },
    {
      title: zh ? '练习页：判断与证明路线' : 'Exercise page: decision and proof route',
      description: zh
        ? '把最后的练习组织成四类任务：求像、求原像、判定单满双射、证明一般命题。'
        : 'Organize the final exercises into image, preimage, classification, and proof tasks.',
      template: 'grid_2x2',
      teachingRole: 'synthesis',
      concreteAnchor: '判断函数是单射、满射、双射或都不是',
      keyPoints: zh
        ? [
            '求像：从输入集合出发，计算实际输出集合。',
            '求原像：从目标集合反查满足条件的输入。',
            '判定性质：分别检查单射、满射，再合并成双射。',
            '证明命题：先写定义，再按定义拆出要证明的条件。',
          ]
        : [
            'Find an image: start from an input set and compute actual outputs.',
            'Find a preimage: reverse the target condition to inputs.',
            'Classify properties: test injective and surjective separately.',
            'Prove a claim: write the definition and expose the required condition.',
          ],
    },
  ] as const;

  const spec = followupSpecs[args.sourceIndex - 2];
  if (spec) {
    const template = spec.template;
    const layoutIntent: SceneLayoutIntent = {
      layoutFamily: layoutFamilyForTemplate(template),
      layoutTemplate: template,
      disciplineStyle: 'math',
      teachingFlow:
        spec.teachingRole === 'comparison'
          ? 'comparison_review'
          : spec.teachingRole === 'worked_example'
            ? 'proof_walkthrough'
            : 'definition_to_example',
      density: 'standard',
      deckStyle: 'academic',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    };
    const outline: SceneOutline = {
      id: `${args.fixtureId}-page-${args.index + 1}`,
      type: 'slide',
      contentProfile: 'math',
      archetype: spec.teachingRole === 'worked_example' ? 'example' : 'concept',
      layoutIntent,
      title: spec.title,
      description: spec.description,
      keyPoints: [...spec.keyPoints],
      teachingObjective: zh
        ? '学生应把本页内容转成可复用的定义判定或证明动作。'
        : 'Students should turn this page into a reusable definition test or proof move.',
      teachingPlanId: `${args.fixtureId}-file-page-test`,
      teachingRole: spec.teachingRole,
      teachingPagePlan: {
        id: `${args.fixtureId}-page-${args.index + 1}-plan`,
        order: args.index + 1,
        title: spec.title,
        role: spec.teachingRole,
        openingMove: zh
          ? '先定位本页的具体公式、定义或例子，再抽出判断步骤。'
          : 'Start from the concrete formula, definition, or example, then extract the decision steps.',
        concreteAnchor: spec.concreteAnchor,
        studentThinkingMove: zh
          ? '让学生说清楚本页用了哪个定义，以及下一步要验证什么条件。'
          : 'Ask students to name the definition used and the condition to verify next.',
        transferRule: zh
          ? '下一页继续沿用“定义入口 → 条件检查 → 结论”的路线。'
          : 'Carry forward the route: definition entry → condition check → conclusion.',
        requiredComponentKinds: template === 'comparison_matrix' ? ['table'] : [],
        forbiddenPatterns: [],
        contentProfile: 'math',
        disciplineStyle: 'math',
        teachingFlow: layoutIntent.teachingFlow,
        layoutFamily: layoutIntent.layoutFamily,
        layoutTemplate: template,
      },
      studentThinkingMove: zh
        ? '说清楚本页用了哪个定义，以及下一步要验证什么条件。'
        : 'Name the definition used and the condition to verify next.',
      requiredComponentKinds: template === 'comparison_matrix' ? ['table'] : [],
      pagePatternId: `math_functions_${template}_${args.sourceIndex}`,
      order: args.index,
      language: args.language,
    };

    return outline;
  }

  return null;
}
