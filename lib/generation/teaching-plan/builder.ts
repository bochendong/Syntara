import { nanoid } from 'nanoid';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { CoursePersonalizationContext } from '../pipeline-types';
import type {
  CourseBlueprint,
  SubjectTeachingPackId,
  TeachingComponentKind,
  TeachingPagePlan,
  TeachingPlan,
} from './types';
import {
  compactTeachingText,
  getSubjectTeachingPack,
  inferComponentKindsForText,
  inferTeachingRoleForText,
} from './subject-packs';
import { pickComponentKindsForRole } from './role-specs';
import { validateTeachingPlan } from './validators';
import {
  buildCourseProfile,
  extractSourceFacts,
  selectTeachingSkills,
  subjectFromTeachingSkills,
  type SelectedTeachingSkills,
} from '../teaching-skills';

type TeachingPlanSourceMaterial = {
  pdfText?: string;
  researchContext?: string;
  courseContextText?: string;
  courseContext?: CoursePersonalizationContext;
  outlines?: SceneOutline[];
};

const LESSON_PLAN_PHRASES_ZH = [
  '引出',
  '建立本课主线',
  '本页用于',
  '进一步指出',
  '本页明确',
  '强调',
  '学习者将',
  '教学目标',
  '通过对比',
];

const LESSON_PLAN_PHRASES_EN = [
  'this page is used to',
  'learners will',
  'learning objective',
  'introduce the motivation',
  'establish the main line',
];

function classicLayoutFamilyForPlanTemplate(
  template: NonNullable<SceneOutline['layoutIntent']>['layoutTemplate'],
): NonNullable<SceneOutline['layoutIntent']>['layoutFamily'] | null {
  if (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  ) {
    return 'cover';
  }
  if (template === 'pipeline_table') return 'comparison';
  if (template === 'comparison_matrix') return 'comparison';
  if (template === 'visual_three_steps') return 'visual_split';
  if (template === 'text_image_split') return 'visual_split';
  if (template === 'two_text_image') return 'visual_split';
  if (template === 'two_by_one_summary') return 'summary';
  if (template === 'four_columns') return 'concept_cards';
  if (template === 'grid_2x2') return 'concept_cards';
  if (template === 'three_cards') return 'concept_cards';
  if (template === 'definition_board') return 'concept_cards';
  if (template === 'formula_focus') return 'formula_focus';
  if (template === 'derivation_ladder' || template === 'problem_walkthrough') return 'derivation';
  if (template === 'problem_focus') return 'problem_statement';
  return null;
}

function inferMathPlanTemplate(args: {
  text: string;
  role: TeachingPagePlan['role'];
  order: number;
}): NonNullable<SceneOutline['layoutIntent']>['layoutTemplate'] {
  const lower = args.text.toLowerCase();
  if (args.role === 'worked_example') {
    return /题目|例题|problem|exercise|show that|证明|prove|proof|推导|derive/.test(lower)
      ? 'derivation_ladder'
      : 'problem_walkthrough';
  }
  if (args.role === 'comparison') return 'comparison_matrix';
  if (args.role === 'synthesis') return 'two_by_one_summary';
  if (args.role === 'practice_check') return 'problem_focus';
  if (args.role === 'definition_boundary') {
    return /\\[a-zA-Z]+|[$∀∃∈⊆⇒⇔]|domain|codomain|range|定义域|陪域|值域|单射|满射|双射/.test(
      args.text,
    )
      ? 'formula_focus'
      : 'definition_board';
  }
  if (args.role === 'concrete_hook') return args.order <= 1 ? 'definition_board' : 'formula_focus';
  return 'definition_board';
}

function inferPlanImageHeroTemplate(
  text: string,
): NonNullable<SceneOutline['layoutIntent']>['layoutTemplate'] {
  if (
    /(cinematic|film|movie|mv|music video|trailer|dark art|gallery|stained glass|电影|影片|影像|短片|音乐视频|深度解析|镜头|画面|暗色|舞台)/i.test(
      text,
    )
  ) {
    return 'cinematic_title_frame';
  }
  if (
    /(tech|saas|ai|subscription|pricing|product launch|launch|plans?|network|platform|科技|产品发布|订阅|价格|套餐|方案|平台|人工智能|网络|发布会)/i.test(
      text,
    )
  ) {
    return 'tech_hero_title';
  }
  return 'image_title_overlay';
}

function inferClassicPlanTemplate(args: {
  text: string;
  role: TeachingPagePlan['role'];
  isOpeningIntro: boolean;
  useCodeWalkthrough: boolean;
  hasMedia: boolean;
  keyPointCount: number;
}): NonNullable<SceneOutline['layoutIntent']>['layoutTemplate'] | null {
  if (args.useCodeWalkthrough) return null;
  const text = args.text;
  if (args.isOpeningIntro && args.hasMedia) {
    return inferPlanImageHeroTemplate(text);
  }
  if (
    args.role === 'synthesis' ||
    /(conclusion|future directions?|limitations?|strengths?|contribution|takeaways?|总结|结论|未来|局限|限制|贡献|优势|收束|下一步)/i.test(
      text,
    )
  ) {
    return 'two_by_one_summary';
  }

  if (
    args.role === 'comparison' ||
    /(list\s*(?:vs|和|与|\/)\s*dict|dict\s*(?:vs|和|与|\/)\s*list|列表|字典|错误状态|非法状态|字段|表示方式|representation|invalid state|malformed|accepted error|field meaning)/i.test(
      text,
    )
  ) {
    return 'pipeline_table';
  }

  if (
    args.isOpeningIntro &&
    /(Tweet|OOP|面向对象|对象|类|实例|属性|字段|状态|规则|class|instance|attribute|object|state|rule)/i.test(
      text,
    )
  ) {
    return 'pipeline_table';
  }

  if (
    args.hasMedia &&
    /(hierarch|architecture|assembly|scaffold|diagram|three steps?|3 steps?|架构|层级|层次|组装|装配|骨架|图示|三步|三个步骤)/i.test(
      text,
    )
  ) {
    return 'visual_three_steps';
  }

  if (args.hasMedia) {
    return args.keyPointCount >= 2 ? 'two_text_image' : 'text_image_split';
  }

  if (
    args.keyPointCount === 4 &&
    /(四|4|four|quadrant|象限|分类|类别|误区|原则|检查点)/i.test(text)
  ) {
    return /2x2|象限|grid|网格/i.test(text) ? 'grid_2x2' : 'four_columns';
  }

  if (
    args.role === 'concept_model' &&
    args.keyPointCount >= 3 &&
    /(class|instance|attribute|object|state|rule|invariant|self|类|实例|属性|对象|状态|规则|不变式)/i.test(
      text,
    )
  ) {
    return 'pipeline_table';
  }

  if (
    /(pipeline|workflow|stages?|process|stepwise|流程|阶段|管线|工作流|处理链|步骤|机制路径)/i.test(
      text,
    ) &&
    (args.keyPointCount >= 4 ||
      /(table|matrix|compare|input|output|why it matters|对照表|表格|矩阵|输入|输出|为什么重要|主操作|主要操作)/i.test(
        text,
      ))
  ) {
    return 'pipeline_table';
  }

  return null;
}

function cleanStudentFacingText(text: string, language: 'zh-CN' | 'en-US'): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const phrases = language === 'zh-CN' ? LESSON_PLAN_PHRASES_ZH : LESSON_PLAN_PHRASES_EN;
  if (!phrases.some((phrase) => trimmed.toLowerCase().includes(phrase.toLowerCase()))) {
    return trimmed;
  }

  if (language === 'zh-CN') {
    return trimmed
      .replace(/本页用于/g, '我们现在要看')
      .replace(/进一步指出/g, '接着看清')
      .replace(/本页明确/g, '先分清')
      .replace(/引出/g, '先从一个具体问题看')
      .replace(/建立本课主线[:：]?/g, '接下来围绕这个问题走：')
      .replace(/强调(.+?)的重要性/g, '看清$1为什么会影响写法')
      .replace(/学习者将/g, '你现在要');
  }

  return trimmed
    .replace(/this page is used to/gi, 'we use this example to')
    .replace(/learners will/gi, 'you will')
    .replace(/learning objective/gi, 'working question')
    .replace(/introduce the motivation/gi, 'start from a concrete problem')
    .replace(/establish the main line/gi, 'follow this question');
}

function buildBlueprint(args: {
  requirements: UserRequirements;
  subject: SubjectTeachingPackId;
  selectedSkills: SelectedTeachingSkills;
}): CourseBlueprint {
  const { requirements, subject, selectedSkills } = args;
  const language = requirements.language;
  const anchors = selectedSkills.sourceFacts
    .map((fact) => fact.text)
    .filter(Boolean)
    .slice(0, 6);

  const zh = language === 'zh-CN';
  const defaults: Record<
    SubjectTeachingPackId,
    Pick<CourseBlueprint, 'coreQuestion' | 'learnerProblem' | 'throughline' | 'coreMisconceptions'>
  > = {
    computer_science: {
      coreQuestion: zh
        ? '怎样把真实问题拆成状态、操作和必须保持的规则？'
        : 'How do we turn a real problem into state, operations, and rules that must hold?',
      learnerProblem: zh
        ? '学生常常能看懂代码，却不知道写之前该先建模哪些状态。'
        : 'Students often understand code but do not know what state to model before writing.',
      throughline: zh
        ? '按页面角色推进：先认识具体对象/任务，再选择失败展示、概念边界、状态追踪或结构规则，最后收束成可迁移的判断顺序'
        : 'Progress by page role: first meet the concrete object/task, then choose failure demo, concept boundary, state trace, or structure rule, and finish with a transferable decision sequence',
      coreMisconceptions: zh
        ? ['把变量当成对象本身', '只记语法名，不追踪状态变化', '先改指针再想 invariant']
        : [
            'Treating a variable as the object itself',
            'Naming syntax without tracing state',
            'Changing pointers before checking invariants',
          ],
    },
    mathematics: {
      coreQuestion: zh
        ? '这个结论在什么条件下成立，为什么每一步推导合法？'
        : 'Under which conditions does the result hold, and why is each step valid?',
      learnerProblem: zh
        ? '学生看得懂答案，但自己写时不知道先列条件、目标和可用工具。'
        : 'Students can read solutions but do not first list conditions, goal, and tools.',
      throughline: zh
        ? '具体例子/反例 -> 条件边界 -> 推导或证明 -> 检查策略'
        : 'Concrete example/counterexample -> condition boundary -> derivation/proof -> checking strategy',
      coreMisconceptions: zh
        ? ['忽略定义条件', '跳推导步骤', '把例子当证明']
        : [
            'Ignoring definition conditions',
            'Skipping derivation steps',
            'Treating an example as proof',
          ],
    },
    humanities_social_science: {
      coreQuestion: zh
        ? '这个观点靠什么证据成立，换一个视角会看到什么？'
        : 'What evidence supports the claim, and what changes under another lens?',
      learnerProblem: zh
        ? '学生容易复述概念，却不会把概念落到材料和论证结构上。'
        : 'Students repeat concepts without attaching them to evidence and argument structure.',
      throughline: zh
        ? '材料/现象 -> 概念 -> 证据链 -> 视角比较 -> 可写答案'
        : 'Material/phenomenon -> concept -> evidence chain -> lens comparison -> answer structure',
      coreMisconceptions: zh
        ? ['观点没有证据', '只背理论名', '忽略材料细节']
        : ['Claims without evidence', 'Only naming theories', 'Missing material details'],
    },
    business_economics: {
      coreQuestion: zh
        ? '这个情境里变量怎么动，机制和取舍是什么？'
        : 'Which variables move in this situation, and what mechanism and trade-off follow?',
      learnerProblem: zh
        ? '学生会背模型名，但不会从案例中抓变量、假设和取舍。'
        : 'Students know model names but do not extract variables, assumptions, and trade-offs from cases.',
      throughline: zh
        ? '情境/数据 -> 假设 -> 变量变化 -> 机制 -> 权衡'
        : 'Situation/data -> assumptions -> variable movement -> mechanism -> trade-off',
      coreMisconceptions: zh
        ? ['忘记其他条件不变', '把相关当因果', '只看一个利益方']
        : [
            'Forgetting ceteris paribus',
            'Treating correlation as causation',
            'Seeing only one stakeholder',
          ],
    },
    general: {
      coreQuestion: zh
        ? '这个主题最小的具体例子是什么，能迁移出什么方法？'
        : 'What is the smallest concrete example, and what method transfers?',
      learnerProblem: zh
        ? '学生听懂了概念，但不知道遇到新题时第一步做什么。'
        : 'Students understand the concept but do not know the first move on a new task.',
      throughline: zh
        ? '具体例子 -> 概念边界 -> 操作步骤 -> 迁移检查'
        : 'Concrete example -> concept boundary -> steps -> transfer check',
      coreMisconceptions: zh
        ? ['概念停留在口号', '缺少可操作步骤']
        : ['Concept remains a slogan', 'Missing actionable steps'],
    },
  };

  return {
    id: `blueprint_${nanoid(8)}`,
    language,
    subject,
    courseProfile: selectedSkills.courseProfile,
    selectedSkillIds: selectedSkills.skillIds,
    skillSelectionReasons: selectedSkills.reasons.map(
      (reason) => `${reason.skillId}: ${reason.reason}`,
    ),
    sourceFacts: selectedSkills.sourceFacts,
    audience: zh ? '大学低年级学生' : 'early university students',
    sourceAnchors: anchors.length ? anchors : [requirements.requirement.slice(0, 120)],
    ...defaults[subject],
  };
}

function anchorForPage(blueprint: CourseBlueprint, pageText: string): string {
  const lower = pageText.toLowerCase();
  const matching = blueprint.sourceAnchors.find((anchor) => {
    const anchorLower = anchor.toLowerCase();
    return anchorLower
      .split(/[\s,，:：;；()（）[\]'"]+/)
      .filter((part) => part.length >= 3)
      .some((part) => lower.includes(part));
  });
  return matching || blueprint.sourceAnchors[0] || pageText.slice(0, 120);
}

function buildPageCopy(args: {
  role: TeachingPagePlan['role'];
  subject: SubjectTeachingPackId;
  language: 'zh-CN' | 'en-US';
  anchor: string;
  title: string;
}): Pick<TeachingPagePlan, 'openingMove' | 'studentThinkingMove' | 'transferRule'> {
  const { role, subject, language, anchor, title } = args;
  if (subject === 'mathematics') {
    if (language === 'zh-CN') {
      const byRole: Record<
        TeachingPagePlan['role'],
        Pick<TeachingPagePlan, 'openingMove' | 'studentThinkingMove' | 'transferRule'>
      > = {
        concrete_hook: {
          openingMove: `先从一个具体数学对象开始：${anchor}。别急着背术语，先问它要我们判断什么。`,
          studentThinkingMove: '这个表达式里对象是谁，条件是什么，目标结论是什么？',
          transferRule: '数学课开场先定位对象、条件和要判断的问题。',
        },
        failure_demo: {
          openingMove: `${anchor} 看起来像能直接用定义，但先检查：少了哪个条件会让结论失效？`,
          studentThinkingMove: '如果删掉一个条件，会出现什么反例或不合法步骤？',
          transferRule: '证明前先找条件边界；反例能说明条件为什么不能省。',
        },
        concept_model: {
          openingMove: `把 ${title} 放回 ${anchor} 里看：这个概念负责区分哪两种情况？`,
          studentThinkingMove: '这个概念给哪些对象、条件或结论划了边界？',
          transferRule: '先说概念解决的判断问题，再记定义名称。',
        },
        definition_boundary: {
          openingMove: `先把 ${anchor} 展开成定义条件，再看哪些条件必须保留。`,
          studentThinkingMove: '定义里对象范围、存在条件、唯一性或包含关系分别在哪里？',
          transferRule: '写证明前，先把定义改写成可以逐项检查的条件。',
        },
        worked_example: {
          openingMove: `现在用 ${anchor} 走一遍证明，不跳步：先写已知和目标，再说明每一步凭什么成立。`,
          studentThinkingMove: '这一行为什么成立：用了哪个已知、定义，还是前一行结果？',
          transferRule: '例题要留下“为什么能走这一步”，不是只留下答案。',
        },
        state_trace: {
          openingMove: `把 ${anchor} 当成一串推理状态，逐步记录当前已知、目标和新推出的条件。`,
          studentThinkingMove: '当前这一步新增了哪个条件，它服务于哪个目标？',
          transferRule: '长推导先追踪条件变化，再合并成结论。',
        },
        structure_invariant: {
          openingMove: `先看 ${anchor} 必须保持的数学结构或不变量，再检查操作后它是否仍成立。`,
          studentThinkingMove: '这个变换有没有保持对象范围、等价关系或包含关系？',
          transferRule: '每次变形后都要回查结构条件有没有被破坏。',
        },
        strategy_trace: {
          openingMove: `这页不先看答案，而是看 ${anchor} 的证明策略：先展开哪一个定义，再验证哪一个条件。`,
          studentThinkingMove: '当前目标最适合用定义展开、反例、双包含，还是代数化简？',
          transferRule: '先选证明策略，再写具体推导。',
        },
        evidence_frame: {
          openingMove: `先用 ${anchor} 判断哪些数学事实已经给出，哪些还需要证明。`,
          studentThinkingMove: '哪些信息是已知，哪些是要从定义推出的？',
          transferRule: '不要把待证结论当作已知条件使用。',
        },
        case_analysis: {
          openingMove: `把 ${anchor} 当作一个具体例子，先算或检验，再抽出一般判断。`,
          studentThinkingMove: '这个例子展示的是定义成立、失败，还是边界情况？',
          transferRule: '例子用于定位思路，不能直接替代一般证明。',
        },
        comparison: {
          openingMove: `把 ${anchor} 拆成同一组维度比较：对象、定义展开、要找什么、证明动作。`,
          studentThinkingMove: '我比较的是定义入口、条件方向，还是证明目标？',
          transferRule: '数学对比先定同一组维度，否则只是并排罗列。',
        },
        practice_check: {
          openingMove: '现在换一个小判断，检查能不能自己写出第一步证明动作。',
          studentThinkingMove: '离开例题后，我第一步应该展开哪个定义？',
          transferRule: '练习检查的是方法能否迁移，不只是记住结论。',
        },
        synthesis: {
          openingMove: `最后把这节课收回到 ${anchor}：留下的是一套判断和证明的顺序。`,
          studentThinkingMove: '下次遇到类似命题，我先问哪三个问题？',
          transferRule: '总结要留下可执行的证明 checklist，而不是术语表。',
        },
      };
      return byRole[role];
    }

    const byRole: Record<
      TeachingPagePlan['role'],
      Pick<TeachingPagePlan, 'openingMove' | 'studentThinkingMove' | 'transferRule'>
    > = {
      concrete_hook: {
        openingMove: `Start from one concrete mathematical object: ${anchor}. Before naming terms, ask what it asks us to decide.`,
        studentThinkingMove: 'Who are the objects, what are the conditions, and what is the goal?',
        transferRule:
          'Open a math lesson by locating objects, conditions, and the decision to make.',
      },
      failure_demo: {
        openingMove: `${anchor} may look usable, but first check which missing condition would break the conclusion.`,
        studentThinkingMove: 'What counterexample appears if one condition is removed?',
        transferRule:
          'Before proving, find the boundary conditions; counterexamples explain why they matter.',
      },
      concept_model: {
        openingMove: `Put ${title} back into ${anchor}: which two cases does this concept separate?`,
        studentThinkingMove: 'Which objects, conditions, or conclusions does this concept delimit?',
        transferRule: 'Name the mathematical decision before memorizing the definition name.',
      },
      definition_boundary: {
        openingMove: `Expand ${anchor} into definition conditions, then mark which conditions must stay.`,
        studentThinkingMove:
          'Where are the domain, existence, uniqueness, or inclusion conditions?',
        transferRule: 'Before proving, rewrite the definition as checkable conditions.',
      },
      worked_example: {
        openingMove: `Walk through ${anchor} as a proof: write givens and goal, then justify each step.`,
        studentThinkingMove:
          'Which definition, assumption, or previous result forces the next move?',
        transferRule: 'A worked example preserves why the next step is legal, not only the answer.',
      },
      state_trace: {
        openingMove: `Treat ${anchor} as reasoning state: track givens, goal, and newly derived conditions.`,
        studentThinkingMove: 'What condition was added, and which goal does it serve?',
        transferRule: 'For long derivations, trace condition changes before concluding.',
      },
      structure_invariant: {
        openingMove: `Check the mathematical structure or invariant behind ${anchor}, then test whether each operation preserves it.`,
        studentThinkingMove:
          'Did this transformation preserve the domain, equivalence, or inclusion condition?',
        transferRule: 'After every transformation, re-check the structure conditions.',
      },
      strategy_trace: {
        openingMove: `Do not start with the answer; read the proof strategy for ${anchor}: which definition opens first, and which condition is next?`,
        studentThinkingMove:
          'Should this goal use definition expansion, counterexample, double inclusion, or algebra?',
        transferRule: 'Choose the proof strategy before writing the derivation.',
      },
      evidence_frame: {
        openingMove: `Use ${anchor} to separate given mathematical facts from claims still needing proof.`,
        studentThinkingMove: 'What is known, and what must be derived from a definition?',
        transferRule: 'Do not use the target conclusion as if it were a given.',
      },
      case_analysis: {
        openingMove: `Use ${anchor} as a concrete example: compute or test first, then extract the general judgment.`,
        studentThinkingMove: 'Does this example show success, failure, or a boundary case?',
        transferRule: 'Examples locate the idea; they do not replace the general proof.',
      },
      comparison: {
        openingMove: `Compare ${anchor} using the same dimensions: object, definition expansion, target, and proof action.`,
        studentThinkingMove:
          'Am I comparing the definition entry, condition direction, or proof goal?',
        transferRule: 'A math comparison needs shared dimensions before examples.',
      },
      practice_check: {
        openingMove: 'Use a short judgment to test whether the first proof move transfers.',
        studentThinkingMove: 'Away from the example, which definition should I expand first?',
        transferRule: 'Practice checks method transfer, not conclusion memory.',
      },
      synthesis: {
        openingMove: `Return to ${anchor}: the lesson outcome is a repeatable proof order.`,
        studentThinkingMove: 'Next time, which three questions do I ask first?',
        transferRule: 'A summary should leave an executable proof checklist, not a term list.',
      },
    };
    return byRole[role];
  }

  if (language === 'zh-CN') {
    const byRole: Record<
      TeachingPagePlan['role'],
      Pick<TeachingPagePlan, 'openingMove' | 'studentThinkingMove' | 'transferRule'>
    > = {
      concrete_hook: {
        openingMove: `先别急着背概念，我们先认识今天的例子：${anchor}。先把它当成真实世界里的一个东西，再看程序要怎样稳定地表示它。`,
        studentThinkingMove: '我现在面对的是一个对象、一段过程，还是一个要保持的规则？',
        transferRule: '写之前先把对象、状态和允许的操作说清楚。',
      },
      failure_demo: {
        openingMove: `${anchor} 看起来能存下来，但我们要检查：顺序、字段名、合法状态和后续操作哪里会失控。`,
        studentThinkingMove: '这个表示法能不能阻止我写出错误状态？',
        transferRule: '能存数据不等于表示得好；还要看它能不能保护含义和规则。',
      },
      concept_model: {
        openingMove: `把 ${title} 放回 ${anchor} 这个例子里看：这个概念解决的是哪一个具体麻烦？`,
        studentThinkingMove: '这个概念让哪些东西有了名字、边界或归属？',
        transferRule: '先说清概念负责解决的问题，再记术语。',
      },
      definition_boundary: {
        openingMove: `先看 ${anchor} 满足哪些条件，再把边界抽成定义。`,
        studentThinkingMove: '定义里哪些条件不能删？删掉会出现什么反例？',
        transferRule: '写定义或证明前，先圈出条件、对象范围和目标结论。',
      },
      worked_example: {
        openingMove: `现在用 ${anchor} 走一遍，不跳步，只看每一步读了什么、改了什么、推出什么。`,
        studentThinkingMove: '下一步是由哪个条件、状态或规则逼出来的？',
        transferRule: '例题不是背答案；要把“下一步为什么这样做”留下来。',
      },
      state_trace: {
        openingMove: `我们不看最终答案，先盯住 ${anchor} 的当前状态，一步一步追踪变化。`,
        studentThinkingMove: '当前行读了哪些值？哪些变量或结构发生了变化？',
        transferRule: '遇到循环/递归/算法，先画状态，再谈结论。',
      },
      structure_invariant: {
        openingMove: `这个结构不是一堆值；${anchor} 必须一直守住自己的规则。`,
        studentThinkingMove: '操作结束后，结构承诺还成立吗？',
        transferRule: '改结构前先保存旧连接，改完立刻查 invariant。',
      },
      strategy_trace: {
        openingMove: `算法的关键不是背顺序，而是看 ${anchor} 里 frontier、visited 或 call stack 怎样决定下一步。`,
        studentThinkingMove: '谁在决定下一个被处理的对象？',
        transferRule: '先说清策略状态，再写 traversal 或 search。',
      },
      evidence_frame: {
        openingMove: `先看 ${anchor} 这条证据能支持什么，不能支持什么。`,
        studentThinkingMove: '我的观点有没有被材料中的具体细节托住？',
        transferRule: '先绑定证据，再上升到概念或理论。',
      },
      case_analysis: {
        openingMove: `把 ${anchor} 当作案例现场，先找角色、变量、限制和变化方向。`,
        studentThinkingMove: '这个案例里真正变化的量是什么，谁受影响？',
        transferRule: '案例题先拆情境，再套模型或概念。',
      },
      comparison: {
        openingMove: `我们把 ${anchor} 拆成几个维度对照，看看差异到底发生在哪。`,
        studentThinkingMove: '我比较的是结构、功能、条件，还是结果？',
        transferRule: '对比题先定维度，否则只是并排罗列。',
      },
      practice_check: {
        openingMove: `现在用一个小检查确认：离开例子后，你还能不能自己做第一步。`,
        studentThinkingMove: '如果换一个输入或材料，我第一步还会做什么？',
        transferRule: '练习不是测记忆，而是测方法能不能迁移。',
      },
      synthesis: {
        openingMove: `最后把这节课收回到 ${anchor}：我们真正学会的是一种处理问题的顺序。`,
        studentThinkingMove: '下次遇到类似问题，我先问哪三个问题？',
        transferRule: '总结要留下可执行 checklist，而不是只留下术语表。',
      },
    };
    return byRole[role];
  }

  const byRole: Record<
    TeachingPagePlan['role'],
    Pick<TeachingPagePlan, 'openingMove' | 'studentThinkingMove' | 'transferRule'>
  > = {
    concrete_hook: {
      openingMove: `Before naming the concept, first meet the example: ${anchor}. Treat it as one real thing, then ask how the program should represent it safely.`,
      studentThinkingMove: 'Am I facing an object, a process, or a rule that must stay true?',
      transferRule: 'Before writing, name the object, state, and allowed operations.',
    },
    failure_demo: {
      openingMove: `${anchor} may store the data, but now check where order, field meaning, legal states, or operations can break.`,
      studentThinkingMove: 'Can this representation stop me from creating an invalid state?',
      transferRule: 'Storing data is not enough; a representation must protect meaning and rules.',
    },
    concept_model: {
      openingMove: `Put ${title} back into ${anchor}: what concrete problem does this concept solve?`,
      studentThinkingMove: 'What does this concept give a name, boundary, or home to?',
      transferRule: 'Name the problem a concept solves before memorizing the term.',
    },
    definition_boundary: {
      openingMove: `Start from ${anchor}, then mark which conditions become the definition boundary.`,
      studentThinkingMove:
        'Which condition cannot be removed, and what counterexample appears if it is removed?',
      transferRule: 'Before proving, circle the assumptions, object domain, and goal.',
    },
    worked_example: {
      openingMove: `Walk through ${anchor} without skipping: read, change, infer.`,
      studentThinkingMove: 'Which condition, state, or rule forces the next move?',
      transferRule:
        'A worked example should preserve the reason for the next move, not just the answer.',
    },
    state_trace: {
      openingMove: `Ignore the final answer first; track the current state of ${anchor} one step at a time.`,
      studentThinkingMove: 'Which values are read on this line, and which state changes?',
      transferRule: 'For loops, recursion, and algorithms, draw state before concluding.',
    },
    structure_invariant: {
      openingMove: `${anchor} is not just values; the structure has a rule it must keep.`,
      studentThinkingMove: 'After the operation, does the structure promise still hold?',
      transferRule:
        'Before mutating a structure, save old links; after mutating, check the invariant.',
    },
    strategy_trace: {
      openingMove: `The key is not the final order; watch how ${anchor} uses frontier, visited, or call stack to choose the next step.`,
      studentThinkingMove: 'Which structure decides the next object to process?',
      transferRule: 'State the strategy state before coding traversal or search.',
    },
    evidence_frame: {
      openingMove: `Use ${anchor} to ask what the evidence can and cannot support.`,
      studentThinkingMove: 'Is my claim anchored in a concrete detail from the material?',
      transferRule: 'Attach evidence before moving up to concepts or theory.',
    },
    case_analysis: {
      openingMove: `Treat ${anchor} as the case: find actors, variables, constraints, and direction of change.`,
      studentThinkingMove: 'What actually changes here, and who is affected?',
      transferRule: 'For cases, parse the situation before applying a model.',
    },
    comparison: {
      openingMove: `Compare ${anchor} by dimensions so the difference is not just a list.`,
      studentThinkingMove: 'Am I comparing structure, function, condition, or result?',
      transferRule: 'A comparison needs dimensions before examples.',
    },
    practice_check: {
      openingMove: 'Use a short check to see whether the first move transfers to a new input.',
      studentThinkingMove: 'If the input or material changes, what is still my first move?',
      transferRule: 'Practice checks method transfer, not just memory.',
    },
    synthesis: {
      openingMove: `Return to ${anchor}: the real outcome is a repeatable problem-solving order.`,
      studentThinkingMove: 'Next time, which three questions do I ask first?',
      transferRule: 'A summary should leave an executable checklist, not only a term list.',
    },
  };
  return byRole[role];
}

export function buildTeachingPlan(
  requirements: UserRequirements,
  sourceMaterial: TeachingPlanSourceMaterial = {},
  disciplineHint?: SubjectTeachingPackId | string,
): TeachingPlan {
  const sourceText = compactTeachingText([
    requirements.requirement,
    sourceMaterial.pdfText?.slice(0, 12_000),
    sourceMaterial.researchContext?.slice(0, 4_000),
    sourceMaterial.outlines
      ?.map((outline) =>
        [outline.title, outline.description, outline.keyPoints?.join(' ')].join(' '),
      )
      .join('\n'),
  ]);
  const sourceFacts = extractSourceFacts(sourceText, requirements.language);
  const courseProfile = buildCourseProfile({
    language: requirements.language,
    requirement: requirements.requirement,
    courseContext: sourceMaterial.courseContext,
    sourceFacts,
  });
  const selectedSkills = selectTeachingSkills({
    language: requirements.language,
    requirement: requirements.requirement,
    sourceText,
    disciplineHint,
    courseProfile,
    sourceFacts,
  });
  const subject = subjectFromTeachingSkills(selectedSkills);
  const blueprint = buildBlueprint({ requirements, subject, selectedSkills });
  const pack = getSubjectTeachingPack(subject);
  const outlines = sourceMaterial.outlines || [];
  const pageCount = Math.max(outlines.length, Math.min(8, Math.max(4, pack.defaultRoles.length)));

  const pages: TeachingPagePlan[] = Array.from({ length: pageCount }, (_, index) => {
    const outline = outlines[index];
    const order = outline?.order || index + 1;
    const text = compactTeachingText([
      outline?.title,
      outline?.description,
      outline?.keyPoints?.join('\n'),
      outline?.workedExampleConfig?.problemStatement,
      outline?.workedExampleConfig?.walkthroughSteps?.join('\n'),
    ]);
    const role = outline
      ? inferTeachingRoleForText({
          text,
          order,
          subject,
          isFinal: outline.archetype === 'summary' || index === outlines.length - 1,
          isQuiz: outline.type === 'quiz',
        })
      : pack.defaultRoles[index] ||
        pack.defaultRoles[pack.defaultRoles.length - 1] ||
        'concept_model';
    const title =
      cleanStudentFacingText(outline?.title || blueprint.coreQuestion, requirements.language) ||
      blueprint.coreQuestion;
    const anchor = anchorForPage(blueprint, text || title);
    const copy = buildPageCopy({
      role,
      subject,
      language: requirements.language,
      anchor,
      title,
    });
    const inferredComponentKinds = inferComponentKindsForText(text || title, subject);
    const preferredComponentKinds = selectedSkills.skills.flatMap(
      (skill) => skill.preferredComponentKinds || [],
    );
    const isOpeningIntro =
      subject === 'computer_science' && order === 1 && role === 'concrete_hook';
    const componentKinds = pickComponentKindsForRole({
      role,
      inferred: inferredComponentKinds,
      preferred: preferredComponentKinds,
      isOpeningIntro,
    });
    const executionKinds: TeachingComponentKind[] = ['trace', 'callstack', 'graph_trace'];
    const structuredModelKinds: TeachingComponentKind[] = [
      'memory',
      'linkedlist',
      'tree',
      'bst',
      'stack',
      'queue',
      'dictionary',
      'invariant',
    ];
    const hasExecutionModel = componentKinds.some((kind) => executionKinds.includes(kind));
    const hasStructuredModel = componentKinds.some((kind) => structuredModelKinds.includes(kind));
    const looksLikeCodeExample =
      /(?:^|\n)\s*(?:def|class|for|while|if|return|self\.|[A-Za-z_][A-Za-z0-9_]*\s*=)/.test(text);
    const useCodeWalkthrough =
      subject === 'computer_science' &&
      !isOpeningIntro &&
      (role === 'state_trace' ||
        role === 'strategy_trace' ||
        hasExecutionModel ||
        (role === 'worked_example' && looksLikeCodeExample));
    const hasMedia = Boolean(
      outline?.suggestedImageIds?.length || outline?.mediaGenerations?.length,
    );
    const classicLayoutTemplate = inferClassicPlanTemplate({
      text: text || title,
      role,
      isOpeningIntro,
      useCodeWalkthrough,
      hasMedia,
      keyPointCount: outline?.keyPoints?.length || 0,
    });
    const mathLayoutTemplate =
      subject === 'mathematics'
        ? inferMathPlanTemplate({
            text: text || title,
            role,
            order,
          })
        : null;
    const effectiveClassicLayoutTemplate = mathLayoutTemplate || classicLayoutTemplate;
    const classicLayoutFamily = effectiveClassicLayoutTemplate
      ? classicLayoutFamilyForPlanTemplate(effectiveClassicLayoutTemplate)
      : null;

    return {
      id: `pageplan_${nanoid(8)}`,
      order,
      title,
      role,
      pagePatternId: `${subject}.${role}`,
      selectedSkillIds: selectedSkills.skillIds,
      skillReasons: selectedSkills.reasons.map((reason) => `${reason.skillId}: ${reason.reason}`),
      sourceFactIds: selectedSkills.sourceFacts.map((fact) => fact.id),
      concreteAnchor: anchor,
      requiredComponentKinds:
        classicLayoutFamily === 'cover' ? [] : isOpeningIntro ? ['example'] : componentKinds,
      forbiddenPatterns: pack.forbiddenPatterns,
      contentProfile: isOpeningIntro
        ? 'general'
        : useCodeWalkthrough
          ? 'code'
          : subject === 'mathematics'
            ? 'math'
            : subject === 'computer_science'
              ? 'general'
              : outline?.contentProfile,
      disciplineStyle:
        subject === 'computer_science'
          ? 'code'
          : subject === 'mathematics'
            ? 'math'
            : subject === 'humanities_social_science'
              ? 'humanities'
              : subject === 'business_economics'
                ? 'social_science'
                : undefined,
      teachingFlow:
        role === 'state_trace'
          ? 'code_walkthrough'
          : role === 'worked_example'
            ? useCodeWalkthrough
              ? 'code_walkthrough'
              : subject === 'mathematics'
                ? 'problem_walkthrough'
                : 'case_analysis'
            : role === 'definition_boundary'
              ? subject === 'mathematics'
                ? 'proof_walkthrough'
                : 'definition_to_example'
              : role === 'comparison'
                ? 'comparison_review'
                : role === 'evidence_frame'
                  ? 'argument_evidence'
                  : role === 'practice_check'
                    ? 'practice_check'
                    : 'concept_explain',
      layoutFamily:
        classicLayoutFamily ||
        (isOpeningIntro
          ? 'comparison'
          : useCodeWalkthrough
            ? 'code_walkthrough'
            : role === 'comparison'
              ? 'comparison'
              : hasStructuredModel
                ? 'concept_cards'
                : role === 'worked_example'
                  ? 'problem_solution'
                  : role === 'synthesis'
                    ? 'summary'
                    : undefined),
      layoutTemplate:
        effectiveClassicLayoutTemplate ||
        (isOpeningIntro
          ? 'pipeline_table'
          : useCodeWalkthrough
            ? 'code_split'
            : role === 'comparison'
              ? 'pipeline_table'
              : hasStructuredModel
                ? 'pipeline_table'
                : role === 'synthesis'
                  ? 'two_by_one_summary'
                  : undefined),
      ...copy,
    };
  });

  const plan: TeachingPlan = {
    id: `teaching_plan_${nanoid(8)}`,
    language: requirements.language,
    blueprint,
    pages,
  };

  const validation = validateTeachingPlan(plan);
  if (validation.issues.length === 0) return plan;

  return {
    ...plan,
    pages: plan.pages.map((page) => {
      const fallbackCopy = buildPageCopy({
        role: page.role,
        subject,
        language: requirements.language,
        anchor: page.concreteAnchor || blueprint.sourceAnchors[0] || page.title,
        title: page.title,
      });
      return {
        ...page,
        concreteAnchor: page.concreteAnchor.trim() || blueprint.sourceAnchors[0] || page.title,
        openingMove: cleanStudentFacingText(
          page.openingMove || fallbackCopy.openingMove,
          requirements.language,
        ),
        studentThinkingMove: page.studentThinkingMove.trim() || fallbackCopy.studentThinkingMove,
        transferRule: page.transferRule.trim() || fallbackCopy.transferRule,
      };
    }),
  };
}

export function buildTeachingPlanForOutlines(args: {
  requirements: UserRequirements;
  outlines: SceneOutline[];
  pdfText?: string;
  researchContext?: string;
  courseContextText?: string;
  courseContext?: CoursePersonalizationContext;
  disciplineHint?: SubjectTeachingPackId | string;
}): TeachingPlan {
  return buildTeachingPlan(
    args.requirements,
    {
      pdfText: args.pdfText,
      researchContext: args.researchContext,
      courseContextText: args.courseContextText,
      courseContext: args.courseContext,
      outlines: args.outlines,
    },
    args.disciplineHint,
  );
}
