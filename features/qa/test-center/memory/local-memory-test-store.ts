'use client';

import {
  clearStudyMemory,
  loadStudyMemory,
  recordNotebookPrivateMemory,
  recordNotebookPublicMemory,
  saveStudyMemory,
  updateNotebookWorkingMemory,
  type NotebookMemoryItem,
  type NotebookWorkingMemory,
  type StudyMemoryProfile,
} from '@/lib/learning/study-memory';
import {
  addCourseMaterials,
  deleteCourseMaterial,
  listCourseMaterials,
  type CourseMaterialListItem,
} from '@/lib/utils/course-material-storage';
import { clearQuestionProgress, setQuestionProgress } from '@/lib/utils/quiz-question-progress';
import {
  gradeObjectiveQuestions,
  gradeTextQuestion,
  isObjectiveQuestion,
  type AnswerValue,
} from '@/components/scene-renderers/quiz-view-utils';
import type { QuizQuestion } from '@/lib/types/stage';

const STORAGE_PREFIX = 'syntara:memory-phase2-local:v1';
const DEFAULT_USER_NAME = '第二阶段本地记忆模拟用户';
const TEST_SCENE_ID = 'memory-local-recursion-scene';
const COHORT_SEED_VERSION = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LocalMemoryLearnerProfile = {
  levelId: 'novice' | 'foundation' | 'intermediate' | 'advanced';
  levelLabel: string;
  masteryPercent: number;
  summary: string;
  mastered: string[];
  weaknesses: string[];
  nextTeachingMove: string;
};

export type LocalMemoryTestUserFixture = {
  userId: string;
  name: string;
  learnerProfile: LocalMemoryLearnerProfile;
  explanationPreference: {
    language: string;
    order: string[];
    avoid: string[];
  };
  studyHabit: {
    preferredMinutes: number;
    preferredTime: string;
    questionCount: number;
  };
  usageProfile: {
    usageTier: 'new' | 'light' | 'active' | 'heavy';
    usageLabel: string;
    accountAgeDays: number;
    activeDays: number;
    studySessions: number;
    problemCount: number;
    attemptCount: number;
    conversationCount: number;
    materialCount: number;
    calendarEventCount: number;
    reviewCount: number;
    durablePrivateMemoryCount: number;
  };
};

export type LocalProblemWritebackCase = {
  id: string;
  fixtureUserId: string;
  title: string;
  description: string;
  relationLabel: string;
  chapter: string;
  problemTitle: string;
  questionPrompt: string;
  questionType: 'single' | 'multiple' | 'short_answer' | 'proof' | 'code_tracing';
  points: number;
  options?: Array<{ id: string; text: string }>;
  referenceAnswer: string | string[];
  rubric: string;
  analysis: string;
  concept: string;
  difficulty: 'intro' | 'core' | 'advanced';
  sourceMode: 'existing_problem' | 'new_problem';
  writeMode:
    | 'create_long_term'
    | 'revise_long_term'
    | 'strengthen_long_term'
    | 'working_only'
    | 'no_memory';
  memoryKind?: 'mistake' | 'knowledge_gap' | 'reflection';
  expectedMemoryChange: string;
  attempts: Array<{
    answer: string;
    selectedOptionIds?: string[];
    submissionContext?: string;
  }>;
  masteredSignal: string;
  stuckPoint?: string;
  cause?: string;
  nextTeachingMove: string;
};

export const LOCAL_PROBLEM_WRITEBACK_CASES: LocalProblemWritebackCase[] = [
  {
    id: 'zhou-retry-known-problem',
    fixtureUserId: 'memory-test-novice-001',
    title: '周小满重做做过的错题',
    description: '继续作答已有的“递归问题规模缩小”题目，再次出现相同错误模式。',
    relationLabel: '旧题 · 重复错误',
    chapter: '树递归',
    problemTitle: '递归问题规模缩小 · 练习 2',
    questionPrompt:
      '给定一棵通用树（每个节点可有任意多个子树），学生写出 `size(tree) = 1 + size(tree)`。请给出完整的 Python 实现，要求处理空树、遍历全部直接子树，并用“规模函数”说明递归为什么必然终止；只写 base case 不得满分。',
    questionType: 'code_tracing',
    points: 6,
    referenceAnswer:
      'def size(tree):\n    if tree.is_empty():\n        return 0\n    return 1 + sum(size(subtree) for subtree in tree.subtrees)\n取规模函数 m(tree)=节点数。每个 subtree 的节点数都严格小于当前非空树，有限次调用后到达空树，因此终止。',
    rubric:
      '空树 base case 1 分；遍历全部直接子树 2 分；递归参数确为 subtree 1 分；结果组合正确 1 分；用严格递减且有下界的规模函数论证终止 1 分。把原 tree 再次传入递归不得超过 2 分。',
    analysis: '关键证据不是代码里出现 return，而是每条递归边都把有限规模严格缩小。',
    concept: '递归问题规模缩小',
    difficulty: 'intro',
    sourceMode: 'existing_problem',
    writeMode: 'create_long_term',
    expectedMemoryChange: '覆盖当前短期状态，并新增“递归规模没有缩小”的稳定错误记忆。',
    attempts: [
      {
        answer:
          'def size(tree):\n    if tree.is_empty():\n        return 0\n    return 1 + size(tree)\n\n会终止，因为空树时会 return 0，而且 Python 的递归深度有上限。',
      },
      {
        answer:
          'def size(tree):\n    if tree.is_empty():\n        return 0\n    total = 1\n    for subtree in tree.subtrees:\n        total += size(tree)\n    return total\n\n每次循环都会处理一个 subtree，所以总会结束。',
      },
    ],
    masteredSignal: '能够写出空树 base case。',
    stuckPoint: '多次重做仍没有让 recursive call 接收更小的 subtree。',
    cause: '没有把“问题规模严格缩小”当作每次递归调用都要维持的不变量。',
    nextTeachingMove: '暂停继续刷题，先用三节点树画出每次调用的参数变化。',
  },
  {
    id: 'zhou-first-new-chapter',
    fixtureUserId: 'memory-test-novice-001',
    title: '周小满首次做新章节题',
    description: '第一次进入 Representation Invariants，观察新知识点暴露时如何写入记忆。',
    relationLabel: '新章节 · 首次作答',
    chapter: 'Representation Invariants',
    problemTitle: 'BankAccount mutation 后是否仍满足 RI',
    questionPrompt:
      'BankAccount 的 Representation Invariants 为 `balance >= 0` 且 `0 <= overdraft_limit <= 500`。方法 `withdraw(amount)` 只执行 `self.balance -= amount`。判断它是否对所有满足 precondition `amount > 0` 的调用都保持 RI；给出最小反例，并提出不会在异常路径留下非法对象状态的修复方案。',
    questionType: 'short_answer',
    points: 6,
    referenceAnswer:
      '不能保持。初始 balance=10、overdraft_limit=0、amount=11 满足 precondition，但执行后 balance=-1，破坏 RI。应先验证 amount <= balance（或按契约把 RI 改成 balance >= -overdraft_limit 并验证额度），验证失败先抛异常且不修改对象；验证通过后再 mutation。',
    rubric:
      '结论 1 分；给出满足前置条件且执行后违反 RI 的具体反例 2 分；区分 precondition 与 RI 1 分；先验证后修改或等价的异常安全修复 2 分。',
    analysis: 'RI 必须在每个 public method 正常返回后成立，也不能让失败路径遗留部分修改。',
    concept: 'Representation Invariants',
    difficulty: 'core',
    sourceMode: 'new_problem',
    writeMode: 'create_long_term',
    expectedMemoryChange: '覆盖当前短期状态，并新增 RI 与 mutation 的新知识缺口。',
    attempts: [
      {
        answer:
          '会保持。amount > 0，所以每次只是在合法余额上减去一个正数；withdraw 返回新余额，只要方法正常返回，对象就是合法的。overdraft_limit 没有被修改，所以不影响 RI。',
      },
    ],
    masteredSignal: '能读懂 constructor 与 method 的基本执行顺序。',
    stuckPoint: '不知道 mutation 前后都需要维护 Representation Invariants。',
    cause: '此前没有接触过对象合法状态必须持续成立的课程契约。',
    nextTeachingMove: '先用一个会破坏余额约束的反例解释 RI，再回到代码定位检查点。',
  },
  {
    id: 'lin-review-closes-gap',
    fixtureUserId: 'memory-test-foundation-001',
    title: '林澈复习旧题后掌握',
    description: '重做已有树遍历题并通过，把原来的薄弱记忆修正为复习进展。',
    relationLabel: '旧题 · 修正既有记忆',
    chapter: '树递归',
    problemTitle: '树遍历与返回值组合 · 练习 3',
    questionPrompt:
      '实现通用树的 `count_leaves(tree)`，其中空树叶子数为 0，只有根且没有子树的非空树叶子数为 1。除完整代码外，请追踪 `Tree(1, [Tree(2), Tree(3, [Tree(4)])])` 的各层返回值，并说明为什么不能用 `len(tree.subtrees)` 代替递归求和。',
    questionType: 'code_tracing',
    points: 7,
    referenceAnswer:
      'def count_leaves(tree):\n    if tree.is_empty(): return 0\n    if not tree.subtrees: return 1\n    return sum(count_leaves(s) for s in tree.subtrees)\n节点2返回1，节点4返回1，节点3返回1，根节点返回2。len(subtrees)只数直接孩子，无法发现更深层叶子。',
    rubric:
      '空树 1 分；叶节点 1 分；递归所有子树并求和 2 分；样例追踪四个关键返回值 2 分；解释直接孩子数与深层叶子的区别 1 分。',
    analysis: '叶子计数是子问题返回值之和，不是当前节点分支数。',
    concept: '树遍历与返回值组合',
    difficulty: 'core',
    sourceMode: 'existing_problem',
    writeMode: 'revise_long_term',
    expectedMemoryChange:
      '覆盖当前短期状态，并原地修正对应的长期薄弱记忆，而不是再新增一条重复记忆。',
    attempts: [
      {
        answer:
          'def count_leaves(tree):\n    if tree.is_empty():\n        return 0\n    if not tree.subtrees:\n        return 1\n    return sum(count_leaves(subtree) for subtree in tree.subtrees)\n\n追踪：节点2没有子树返回1；节点4返回1；节点3收到子树4的结果并返回1；根节点把2和3的结果相加得到2。`len(tree.subtrees)` 只得到根的直接孩子数，链状树会错误地把内部节点当作叶子。',
      },
    ],
    masteredSignal: '现在能稳定组合左右子树返回值并覆盖空分支。',
    nextTeachingMove: '把该薄弱点转入已复习状态，下一步进入不平衡树的复杂度分析。',
  },
  {
    id: 'chen-new-complexity-chapter',
    fixtureUserId: 'memory-test-intermediate-001',
    title: '陈知遥做新章节综合题',
    description: '第一次做摊还复杂度综合题，代码主体正确但证明依据不足。',
    relationLabel: '新章节 · 部分正确',
    chapter: 'Amortized Analysis',
    problemTitle: '动态数组扩容的摊还复杂度证明',
    questionPrompt:
      '动态数组初始容量为 1，满载时把容量翻倍；普通 append 成本记为 1，扩容时复制已有元素的每次复制也记为 1。请用 aggregate method 对任意 n 给出总成本的显式上界，再推出单次 append 的摊还成本；仅写几何级数为 O(n) 不得满分。',
    questionType: 'proof',
    points: 8,
    referenceAnswer:
      'n 次写入本身成本为 n。发生扩容时复制的元素数是 1,2,4,...,2^k，其中 2^k < n <= 2^(k+1)，复制总成本 1+...+2^k = 2^(k+1)-1 < 2n。故总成本 T(n)<3n，平均每次 T(n)/n<3，所以摊还成本为 O(1)。',
    rubric:
      '分离 n 次写入成本 1 分；列出正确复制序列 1 分；对任意 n 选取 k 并给出几何和 2 分；证明复制成本小于 2n 1 分；得到总成本小于 3n 1 分；除以 n 得常数摊还界 1 分；说明不是每次实际都 O(1) 1 分。',
    analysis: 'Aggregate method 必须从一串操作总成本的线性上界推到平均每次的常数上界。',
    concept: '摊还复杂度分析',
    difficulty: 'advanced',
    sourceMode: 'new_problem',
    writeMode: 'create_long_term',
    expectedMemoryChange: '覆盖当前短期状态，并新增“会算总成本但不会形式化摊还证明”的知识缺口。',
    attempts: [
      {
        answer:
          '扩容复制成本是 1 + 2 + 4 + ... + n，这是一个几何级数，所以复制总成本是 O(n)。因此 append 是 O(1)。即使某一次扩容要复制 n 个元素，前面的操作比较便宜，可以把这次成本分给它们。',
      },
    ],
    masteredSignal: '能正确写出扩容序列的总成本求和。',
    stuckPoint: '不会把总成本界限转化为单次操作的摊还界限。',
    cause: '只掌握了 Big-O 计算，还没有建立 aggregate method 的证明结构。',
    nextTeachingMove: '用 1、2、4、8 的扩容序列完成一次 aggregate method 证明。',
  },
  {
    id: 'gu-known-basic-confirmation',
    fixtureUserId: 'memory-test-advanced-001',
    title: '顾言川完成熟悉的高阶多选题',
    description: '高阶用户正确完成已有的摊还分析多选题，验证不会制造重复长期记忆。',
    relationLabel: '旧题 · 无新长期信号',
    chapter: 'Amortized Analysis',
    problemTitle: '递归复杂度 · 练习 6',
    questionPrompt:
      '一个动态数组满载时按因子 α 扩容。以下哪些陈述足以支持“连续 n 次 append 的摊还成本为 O(1)”？可多选。',
    questionType: 'multiple',
    points: 6,
    options: [
      { id: 'A', text: '只要单次 append 的最好情况是 O(1)，摊还成本就一定是 O(1)' },
      { id: 'B', text: '若 α>1 为固定常数，历次复制规模构成几何级数，总复制量为 O(n)' },
      { id: 'C', text: '最坏的一次扩容是 O(n)，所以摊还成本也是 O(n)' },
      { id: 'D', text: '需要把普通写入的 n 次成本与扩容复制成本一起计入总成本' },
      { id: 'E', text: '若每次只把容量增加 1，仍可由同一几何级数证明摊还 O(1)' },
      { id: 'F', text: '由总成本 T(n)=O(n) 才能推出平均每次 T(n)/n=O(1)' },
    ],
    referenceAnswer: ['B', 'D', 'F'],
    rubric: '必须且只能选择 B、D、F；多选题不接受部分匹配。',
    analysis: '固定比例扩容产生几何级数；加一扩容会产生 1+2+...+n 的二次成本。',
    concept: '摊还复杂度分析',
    difficulty: 'advanced',
    sourceMode: 'existing_problem',
    writeMode: 'working_only',
    expectedMemoryChange: '只更新最近作答与当前短期状态；不新增或改写长期记忆。',
    attempts: [
      {
        answer: '选择 B、D、F。',
        selectedOptionIds: ['B', 'D', 'F'],
      },
    ],
    masteredSignal: '再次确认能区分单次最坏成本、总成本与摊还成本。',
    nextTeachingMove: '不重复讲解摊还分析定义，继续 potential method 与扩容策略比较。',
  },
  {
    id: 'gu-proof-boundary-new-gap',
    fixtureUserId: 'memory-test-advanced-001',
    title: '顾言川暴露高阶证明盲点',
    description: '高阶用户在新的正确性证明题里遗漏极端边界，验证仍会形成新薄弱记忆。',
    relationLabel: '新题 · 高阶新盲点',
    chapter: 'Correctness Proofs',
    problemTitle: '证明树旋转保持 Representation Invariants',
    questionPrompt:
      '设 BST 节点 x 的左孩子为 y，y 的右子树为 β。证明对 x 做一次合法右旋后仍保持 BST 顺序不变量，并讨论 y 不存在、β 为空、x 为整棵树根三种边界。请明确写出旋转前后的键值区间关系，不能只说“中序遍历不变”。',
    questionType: 'proof',
    points: 9,
    referenceAnswer:
      '合法右旋要求 y 存在。旋转前有 keys(y.left)<y.key<keys(β)<x.key<keys(x.right)。旋转后 y 为局部根，y.left 不变，x 成为 y.right，β 成为 x.left；因此 y 左侧仍小于 y，y 右侧的 β、x 及 x.right 都大于 y，且 x.left=β 的键小于 x、x.right 大于 x，故局部 RI 保持。若 β 为空，不等式中该集合为空，仍成立；若 x 为整树根，更新 root 指针为 y；若 y 不存在，右旋前置条件不满足，应拒绝操作而非声称保持。',
    rubric:
      '合法前置条件 1 分；旋转前完整区间关系 2 分；指针变化 2 分；旋转后逐节点验证 RI 2 分；β 为空 1 分；x 为根与 y 不存在两个边界合计 1 分。仅说中序不变最多 3 分。',
    analysis: '证明要把结构变换、键值区间和操作前置条件连接起来。',
    concept: '正确性证明与边界',
    difficulty: 'advanced',
    sourceMode: 'new_problem',
    writeMode: 'create_long_term',
    expectedMemoryChange: '覆盖当前短期状态，并新增“证明遗漏空子树边界”的高阶错误记忆。',
    attempts: [
      {
        answer:
          '旋转前 y 在 x 左边，所以 y.key < x.key；右旋后 y 成为父节点，x 成为它的右孩子，仍有 y.key < x.key。β 原来在 y 的右边，旋转后放到 x 的左边，中序遍历顺序没有变化，因此 BST RI 保持。x 如果是根，只要把根改成 y 即可。',
      },
    ],
    masteredSignal: '能建立树旋转保持 RI 的主体归纳链。',
    stuckPoint: '正确性证明仍会遗漏空子树与退化树边界。',
    cause: '证明从一般结构开始，没有先列出极端边界集合。',
    nextTeachingMove: '先要求列出最小反例与退化结构，再补完整证明。',
  },
  {
    id: 'lin-correct-choice-wrong-reason',
    fixtureUserId: 'memory-test-foundation-001',
    title: '林澈选对答案但理由错误',
    description: '最终选项正确，但解释暴露错误心智模型，验证不能只看 correct 状态。',
    relationLabel: '答案正确 · 推理错误',
    chapter: '递归终止性',
    problemTitle: '递归终止的真正原因',
    questionPrompt:
      '某同学声称 `height(tree)` 一定终止。请在 A“解释器递归深度上限”、B“每条递归路径上的有限规模严格递减并到达 base case”、C“函数体含 return”中选择真正的数学保证，并用一个无限递归反例说明其余说法为什么不充分。答案必须同时包含选项和推理。',
    questionType: 'short_answer',
    points: 6,
    referenceAnswer:
      '选择 B。可取 f(x): return f(x)，它的函数体可以含不可达的 return，运行时最终可能抛 RecursionError，但这不是算法正常终止。只有自然数值的规模在每次递归中严格减小且有 base case，才能排除无限下降并保证到达终止分支。',
    rubric:
      '选 B 1 分；说明严格递减 1 分；说明规模有下界并连接到 base case 1 分；反驳递归上限 1 分；反驳仅出现 return 1 分；给出有效反例 1 分。选项正确但把 RecursionError 当终止保证不得超过 2 分。',
    analysis: '必须区分程序被运行时异常中断与算法按定义终止。',
    concept: '递归终止性',
    difficulty: 'core',
    sourceMode: 'new_problem',
    writeMode: 'create_long_term',
    memoryKind: 'mistake',
    expectedMemoryChange: '虽然选项正确，仍应根据错误解释更新短期状态并写入“依赖调用上限”的误解。',
    attempts: [
      {
        answer:
          '选 B。原因是 Python 默认最多递归大约一千层，超过以后会抛出 RecursionError 并停止，所以不可能真正无限执行。C 不够，因为 return 可能在很后面，但最终也会被递归上限截断。',
      },
    ],
    masteredSignal: '能选出“问题规模缩小”这一正确条件。',
    stuckPoint: '仍误以为 Python 调用深度上限能保证算法正确终止。',
    cause: '把运行时异常终止与递归算法到达 base case 混为一谈。',
    nextTeachingMove: '对比正常到达 base case 与触发 RecursionError 的两条调用轨迹。',
  },
  {
    id: 'zhou-timeout-no-answer',
    fixtureUserId: 'memory-test-novice-001',
    title: '周小满超时且没有提交答案',
    description: '只有超时业务记录，没有可解释的作答内容，验证系统不猜测掌握或薄弱点。',
    relationLabel: '空答案 · 不写学习记忆',
    chapter: '树递归',
    problemTitle: '判断递归调用是否缩小问题规模',
    questionPrompt:
      '阅读二叉树代码 `return 1 + size(tree.left) + size(tree.right)`。请分别定义当前调用与两个子调用的规模，证明两个参数都严格更小，并说明共享子树或环会怎样影响该证明。',
    questionType: 'short_answer',
    points: 6,
    referenceAnswer:
      '以可达节点数为规模。对有限无环树，任一非空真子树的节点数都小于整棵树，因此左右调用严格变小并最终到空树。若结构有共享，可能重复计算但仍可终止；若存在环，参数未必沿可达结构严格缩小，需要 visited 或拒绝非树输入。',
    rubric: '左右子调用规模各 1 分；严格递减与下界 2 分；共享结构 1 分；环结构 1 分。',
    analysis: '终止证明依赖输入确实是有限无环树这一结构前提。',
    concept: '递归问题规模缩小',
    difficulty: 'intro',
    sourceMode: 'new_problem',
    writeMode: 'no_memory',
    expectedMemoryChange: '保留题目与超时 attempt，但没有答案证据，因此不更新任何学习记忆。',
    attempts: [
      {
        answer: '',
        submissionContext: '90 秒倒计时结束，用户没有提交任何答案。',
      },
    ],
    masteredSignal: '证据不足，不能产生掌握判断。',
    nextTeachingMove: '下次重新呈现题目，不把超时等同于不会。',
  },
  {
    id: 'chen-isolated-careless-error',
    fixtureUserId: 'memory-test-intermediate-001',
    title: '陈知遥出现一次孤立粗心错误',
    description: '已稳定掌握的知识点偶发漏写 return，验证不会立刻把长期掌握降级。',
    relationLabel: '单次失误 · 只更新短期',
    chapter: '树递归',
    problemTitle: '树遍历与返回值组合 · 练习 3',
    questionPrompt:
      '实现 `count_leaves(tree)` 并解释返回值契约。要求空树为 0、叶节点为 1、内部节点汇总所有子树；然后指出你的代码在一棵“根节点有两个叶子孩子”的树上每一层应返回什么。',
    questionType: 'code_tracing',
    points: 6,
    referenceAnswer:
      'def count_leaves(tree):\n    if tree.is_empty(): return 0\n    if not tree.subtrees: return 1\n    return sum(count_leaves(s) for s in tree.subtrees)\n两个叶子各返回1，根返回2。契约是返回以当前 tree 为根的整棵子树中的叶节点数量。',
    rubric:
      '两个 base case 2 分；递归求和表达式 2 分；样例追踪 1 分；返回值契约 1 分。最后漏写 return 是会改变语义的错误。',
    analysis: '表达式正确但未返回时，Python 实际返回 None，不能视为正确实现。',
    concept: '树遍历与返回值组合',
    difficulty: 'core',
    sourceMode: 'existing_problem',
    writeMode: 'working_only',
    expectedMemoryChange: '记录最近一次粗心失误，但单次证据不足以新增或降级长期记忆。',
    attempts: [
      {
        answer:
          'def count_leaves(tree):\n    if tree.is_empty():\n        return 0\n    if not tree.subtrees:\n        return 1\n    sum(count_leaves(subtree) for subtree in tree.subtrees)\n\n契约：计算当前树下面的叶子数。两个叶子各返回1，所以根节点把它们相加得到2。',
      },
    ],
    masteredSignal: '递归分解和子树返回值组合仍然正确。',
    stuckPoint: '本次实现漏写 return，属于孤立的执行细节错误。',
    nextTeachingMove: '提示运行一个最小用例自检，不调整长期学习路线。',
  },
  {
    id: 'lin-cross-problem-repeated-gap',
    fixtureUserId: 'memory-test-foundation-001',
    title: '林澈在另一道题重复相同错误',
    description: '不同题目再次暴露“递归规模没有缩小”，验证强化原记忆而不是新增重复条目。',
    relationLabel: '跨题重复 · 强化既有记忆',
    chapter: '链表递归',
    problemTitle: '递归计算链表长度',
    questionPrompt:
      '实现无环单链表的 `linked_list_length(node)`，并用长度为 3 的链表追踪每次调用参数与返回值。最后给出一个良基规模函数，说明为什么递归调用满足严格递减。',
    questionType: 'code_tracing',
    points: 7,
    referenceAnswer:
      'def linked_list_length(node):\n    if node is None: return 0\n    return 1 + linked_list_length(node.next)\n调用参数依次为 n1,n2,n3,None；返回值依次从底部为0,1,2,3。规模取从当前节点可达的剩余节点数，每次 node.next 使其减1。',
    rubric:
      'None base case 1 分；递归参数 node.next 2 分；加一组合 1 分；完整调用与返回追踪 2 分；严格递减规模函数 1 分。把原 node 传回不得超过 2 分。',
    analysis: '树与链表题共享同一个递归不变量：递归参数必须代表真子问题。',
    concept: '递归问题规模缩小',
    difficulty: 'core',
    sourceMode: 'new_problem',
    writeMode: 'strengthen_long_term',
    expectedMemoryChange: '更新短期状态，并把新 problemId/attemptIds 合并进已有递归规模薄弱记忆。',
    attempts: [
      {
        answer:
          'def linked_list_length(node):\n    if node is None:\n        return 0\n    return 1 + linked_list_length(node)\n\n长度为3时会调用三次，每次加1，所以返回3。规模就是目前已经数过的节点数。',
      },
      {
        answer:
          'def linked_list_length(node):\n    return 1 + linked_list_length(node)\n\n只要链表有限，Python 会在链表结尾自动停止递归；返回时结果逐层加1。',
      },
    ],
    masteredSignal: '知道链表递归需要空节点 base case。',
    stuckPoint: '跨树和链表两类题都没有稳定缩小 recursive subproblem。',
    cause: '错误模式已经跨题型重复，说明不是单题粗心，而是概念模型不稳。',
    nextTeachingMove: '并排比较 tree.subtrees 与 node.next，建立统一的“更小输入”判断规则。',
  },
  {
    id: 'zhou-passes-after-hint',
    fixtureUserId: 'memory-test-novice-001',
    title: '周小满在提示后答对',
    description: '第一次失败，获得明确提示后通过，验证不会把“有支架完成”误写成独立掌握。',
    relationLabel: '提示后通过 · 记录依赖支架',
    chapter: '树递归',
    problemTitle: '计算树中正数节点的数量',
    questionPrompt:
      '实现通用树的 `count_positive(tree)`：空树返回 0，根值大于 0 时贡献 1，并汇总所有子树。请同时追踪 `Tree(-1,[Tree(2),Tree(3,[Tree(-4),Tree(5)])])` 的返回值，说明当前节点贡献与递归子结果为何必须相加。',
    questionType: 'code_tracing',
    points: 7,
    referenceAnswer:
      'def count_positive(tree):\n    if tree.is_empty(): return 0\n    current = 1 if tree.root > 0 else 0\n    return current + sum(count_positive(s) for s in tree.subtrees)\n节点2返回1，-4返回0，5返回1，节点3返回2，根-1返回3。',
    rubric:
      '空树 1 分；当前节点贡献 1 分；遍历全部子树 2 分；正确相加 1 分；完整追踪 2 分。只处理根节点不得超过 2 分。',
    analysis: '本题区分局部贡献与递归聚合，提示后的正确答案不等于独立掌握。',
    concept: '树遍历与返回值组合',
    difficulty: 'intro',
    sourceMode: 'new_problem',
    writeMode: 'create_long_term',
    memoryKind: 'knowledge_gap',
    expectedMemoryChange: '更新短期状态，并记录“在明确提示后能完成、尚未证明独立掌握”的学习模式。',
    attempts: [
      {
        answer:
          'def count_positive(tree):\n    if tree.is_empty(): return 0\n    return 1 if tree.root > 0 else 0\n\n根是 -1，所以这个例子返回0。',
      },
      {
        answer:
          'def count_positive(tree):\n    if tree.is_empty():\n        return 0\n    current = 1 if tree.root > 0 else 0\n    return current + sum(count_positive(subtree) for subtree in tree.subtrees)\n\n追踪：2→1，-4→0，5→1，3→1+0+1=2，-1→0+1+2=3。当前节点只覆盖一个值，其他正数来自互不重叠的子树，所以要相加。',
        submissionContext:
          '平台在第一次提交后给出提示：不要只统计根节点，请汇总每个 subtree 的递归结果。',
      },
    ],
    masteredSignal: '在提示后能正确组合当前节点与所有子树的返回值。',
    stuckPoint: '尚未证明在没有提示时能主动想到递归所有子树。',
    cause: '第一次答案只处理当前节点，需要外部提示才补上递归结构。',
    nextTeachingMove: '下一次用同构但不同语境的题目进行无提示迁移测试。',
  },
  {
    id: 'gu-new-chapter-single-success',
    fixtureUserId: 'memory-test-advanced-001',
    title: '顾言川新章节首次作答正确',
    description: '第一次接触图 DFS 就答对，验证单次正确只进入短期状态，不立即固化为长期掌握。',
    relationLabel: '新章节答对 · 证据仍不足',
    chapter: 'Graph Traversal',
    problemTitle: 'DFS 为什么必须维护 visited 集合',
    questionPrompt:
      '在可能含环且可能不连通的无向图上实现 DFS forest。解释 visited 应在何时更新；证明若在递归返回后才标记，三角形环会怎样执行；最后说明外层循环为什么仍然必要。',
    questionType: 'short_answer',
    points: 8,
    referenceAnswer:
      '每个顶点一进入 DFS（或入栈）就立刻加入 visited，再递归尚未访问的邻居。若返回后才标记，在三角形 A-B-C-A 中 A 调 B、B 调 C、C 又把尚未标记的 A 调入，形成无限递归。外层遍历所有顶点，对未访问顶点启动 DFS，才能覆盖不连通分量，形成 DFS forest。',
    rubric:
      '正确标记时机 2 分；三角形逐步调用链 2 分；解释为什么产生重复/无限递归 1 分；外层循环 1 分；不连通分量与 DFS forest 2 分。',
    analysis: 'visited 既保证含环图上的终止，也配合外层循环保证全图覆盖。',
    concept: '图遍历与环检测',
    difficulty: 'advanced',
    sourceMode: 'new_problem',
    writeMode: 'working_only',
    expectedMemoryChange: '记录这次正确作答到短期状态；仅一次新章节证据，不创建长期掌握记忆。',
    attempts: [
      {
        answer:
          '顶点进入 dfs(v) 的第一步就执行 visited.add(v)，然后只递归尚未访问的邻居。若返回后再标记，A 调 B、B 调 C 时三者都还未标记，C 会沿边再次调用 A，之后重复 A-B-C，无法到达返回点。主程序还要遍历图中所有顶点：若某顶点不在已有分量中且未访问，就以它为根再启动一次 DFS，这样每个连通分量对应 forest 中的一棵树。',
      },
    ],
    masteredSignal: '首次作答能正确解释 DFS visited 的标记时机与环风险。',
    nextTeachingMove: '再用有向图和 disconnected graph 验证能否稳定迁移后，才考虑写入长期掌握。',
  },
];

export const LOCAL_MEMORY_TEST_USER_FIXTURES: LocalMemoryTestUserFixture[] = [
  {
    userId: 'memory-test-novice-001',
    name: '周小满',
    learnerProfile: {
      levelId: 'novice',
      levelLabel: '初学者',
      masteryPercent: 12,
      summary: '刚进入 CSC148，能阅读简单函数，但还没有形成树递归模型。',
      mastered: ['理解普通函数调用', '能辨认空树与叶节点'],
      weaknesses: ['不能独立写出 base case', '不理解递归调用为什么必须缩小问题规模'],
      nextTeachingMove: '先用三节点树和调用箭头建立递归的视觉模型。',
    },
    explanationPreference: {
      language: 'zh-CN',
      order: ['visual_intuition', 'worked_example', 'code'],
      avoid: ['formal_proof_first'],
    },
    studyHabit: { preferredMinutes: 20, preferredTime: '19:30', questionCount: 2 },
    usageProfile: {
      usageTier: 'new',
      usageLabel: '刚注册的新用户',
      accountAgeDays: 3,
      activeDays: 2,
      studySessions: 2,
      problemCount: 2,
      attemptCount: 3,
      conversationCount: 1,
      materialCount: 0,
      calendarEventCount: 0,
      reviewCount: 0,
      durablePrivateMemoryCount: 1,
    },
  },
  {
    userId: 'memory-test-foundation-001',
    name: '林澈',
    learnerProfile: {
      levelId: 'foundation',
      levelLabel: '基础水平',
      masteryPercent: 38,
      summary: '能写出常见 base case，但递归调用仍容易传入原对象。',
      mastered: ['能写空树 base case', '知道递归函数需要终止条件'],
      weaknesses: ['recursive subproblem 缩小不稳定', '无法手工追踪多层调用'],
      nextTeachingMove: '用三节点树逐层标出每次调用收到的 subtree。',
    },
    explanationPreference: {
      language: 'zh-CN',
      order: ['small_example', 'visual_trace', 'code'],
      avoid: ['long_abstract_preamble'],
    },
    studyHabit: { preferredMinutes: 30, preferredTime: '20:00', questionCount: 3 },
    usageProfile: {
      usageTier: 'light',
      usageLabel: '轻度使用者',
      accountAgeDays: 21,
      activeDays: 9,
      studySessions: 11,
      problemCount: 9,
      attemptCount: 15,
      conversationCount: 4,
      materialCount: 1,
      calendarEventCount: 2,
      reviewCount: 3,
      durablePrivateMemoryCount: 6,
    },
  },
  {
    userId: 'memory-test-intermediate-001',
    name: '陈知遥',
    learnerProfile: {
      levelId: 'intermediate',
      levelLabel: '中等水平',
      masteryPercent: 67,
      summary: '能够完成树递归题，正在学习 Representation Invariants 与可变对象设计。',
      mastered: ['能正确缩小递归问题', '能完成常见树遍历', '能解释递归终止性'],
      weaknesses: ['修改对象时容易破坏 Representation Invariants', '边界情况覆盖不完整'],
      nextTeachingMove: '用反例检查 mutation 前后 RI 是否一直成立。',
    },
    explanationPreference: {
      language: 'zh-CN',
      order: ['counterexample', 'code_trace', 'formal_definition'],
      avoid: ['repeat_basic_syntax'],
    },
    studyHabit: { preferredMinutes: 40, preferredTime: '20:30', questionCount: 4 },
    usageProfile: {
      usageTier: 'active',
      usageLabel: '持续活跃用户',
      accountAgeDays: 94,
      activeDays: 43,
      studySessions: 58,
      problemCount: 28,
      attemptCount: 54,
      conversationCount: 14,
      materialCount: 3,
      calendarEventCount: 6,
      reviewCount: 18,
      durablePrivateMemoryCount: 18,
    },
  },
  {
    userId: 'memory-test-advanced-001',
    name: '顾言川',
    learnerProfile: {
      levelId: 'advanced',
      levelLabel: '高阶水平',
      masteryPercent: 89,
      summary: '能综合递归、RI 与复杂度进行设计，需要更高强度的证明和优化任务。',
      mastered: [
        '熟练完成树递归与复杂度分析',
        '能维护 Representation Invariants',
        '能比较多种实现',
      ],
      weaknesses: ['形式化证明仍会省略极端边界', '优化方案缺少可验证的取舍说明'],
      nextTeachingMove: '要求给出正确性证明、反例集合和复杂度取舍。',
    },
    explanationPreference: {
      language: 'en-US',
      order: ['formal_claim', 'counterexample', 'complexity_tradeoff'],
      avoid: ['introductory_analogy', 'step_by_step_syntax'],
    },
    studyHabit: { preferredMinutes: 50, preferredTime: '21:00', questionCount: 5 },
    usageProfile: {
      usageTier: 'heavy',
      usageLabel: '长期重度使用者',
      accountAgeDays: 286,
      activeDays: 147,
      studySessions: 231,
      problemCount: 72,
      attemptCount: 168,
      conversationCount: 38,
      materialCount: 8,
      calendarEventCount: 14,
      reviewCount: 67,
      durablePrivateMemoryCount: 42,
    },
  },
];

export type LocalMemoryTestFact = {
  id: string;
  namespace: string;
  key: string;
  valueJson: unknown;
  source: string;
  sourceRef: unknown;
  validFrom: number;
  updatedAt: number;
};

export type LocalMemoryFactEvent = {
  id: string;
  factId: string | null;
  namespace: string;
  key: string;
  eventType: 'created' | 'superseded' | 'deleted';
  oldValueJson: unknown;
  newValueJson: unknown;
  createdAt: number;
};

type LocalProblem = {
  id: string;
  title: string;
  prompt: string;
  questionType: QuizQuestion['type'];
  sceneId: string;
  concept: string;
  difficulty: 'intro' | 'core' | 'advanced';
  createdAt: number;
};

type LocalAttempt = {
  id: string;
  problemId: string;
  status: 'ungraded' | 'failed' | 'partial' | 'passed';
  score: number;
  maxScore?: number;
  feedback: string;
  answerPreview?: string;
  selectedOptionIds?: string[];
  submissionContext?: string;
  gradingSource?: 'platform_objective' | 'platform_ai' | 'not_graded';
  gradingReliable?: boolean;
  createdAt: number;
};

type LocalConversation = {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: number;
  }>;
  createdAt: number;
};

type LocalMemoryTestFile = {
  version: 1;
  user: { id: string; name: string; email: string };
  course: { id: string; name: string; courseCode: string };
  notebook: { id: string; name: string };
  facts: LocalMemoryTestFact[];
  factEvents: LocalMemoryFactEvent[];
  problems: LocalProblem[];
  attempts: LocalAttempt[];
  conversations: LocalConversation[];
  materialIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type LocalMemoryTestSnapshot = {
  storage: 'browser-local';
  storageDetails: {
    studyMemory: 'localStorage';
    factsAndSources: 'localStorage';
    uploadedMaterials: 'IndexedDB';
  };
  user: LocalMemoryTestFile['user'];
  course: LocalMemoryTestFile['course'];
  notebook: LocalMemoryTestFile['notebook'];
  counts: {
    studyMemories: number;
    activeFacts: number;
    factEvents: number;
    materials: number;
    problems: number;
    attempts: number;
    conversations: number;
    calendarEvents: number;
  };
  studyMemories: Array<{
    id: string;
    title: string;
    text: string;
    kind: string;
    source: string;
    scope: string;
    status: string;
    sourceReferences: unknown;
    updatedAt: number;
  }>;
  workingMemory: NotebookWorkingMemory | null;
  facts: LocalMemoryTestFact[];
  factEvents: LocalMemoryFactEvent[];
  sources: {
    problems: Array<{
      id: string;
      title: string;
      prompt: string;
      questionType: LocalProblem['questionType'];
      concept: string;
      difficulty: LocalProblem['difficulty'];
      attemptCount: number;
      latestStatus: LocalAttempt['status'] | null;
      latestScore: number | null;
      createdAt: number;
    }>;
    attempts: Array<{
      id: string;
      problemId: string;
      problemTitle: string;
      status: LocalAttempt['status'];
      score: number;
      maxScore: number | null;
      answerPreview: string | null;
      selectedOptionIds: string[];
      submissionContext: string | null;
      gradingSource: LocalAttempt['gradingSource'];
      gradingReliable: boolean;
      feedback: string;
      createdAt: number;
    }>;
    conversations: Array<{
      id: string;
      title: string;
      messageCount: number;
      lastUserMessage: string | null;
      createdAt: number;
    }>;
    materials: CourseMaterialListItem[];
  };
};

export type LocalMemoryMutationResponse = {
  action: string;
  result?: unknown;
  delta: Record<keyof LocalMemoryTestSnapshot['counts'], number>;
  before: LocalMemoryTestSnapshot;
  after: LocalMemoryTestSnapshot;
  snapshot: LocalMemoryTestSnapshot;
};

export type LocalMemoryEvidence = {
  id: string;
  layer: 'profile' | 'exact_fact' | 'working_memory' | 'public_memory' | 'private_memory';
  title: string;
  content: string;
};

function storageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function assertTestUserId(value: string) {
  const userId = value.trim();
  if (!/^memory-test-[a-z0-9_-]{1,80}$/i.test(userId)) {
    throw new Error('模拟用户 ID 必须以 memory-test- 开头，并且只能包含字母、数字、_ 或 -。');
  }
  return userId;
}

function stableSuffix(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${assertTestUserId(userId)}`;
}

function createId(prefix: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replaceAll('-', '').slice(0, 18)
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${suffix}`;
}

function emptyFile(userId: string, name = DEFAULT_USER_NAME): LocalMemoryTestFile {
  const suffix = stableSuffix(userId);
  const now = Date.now();
  return {
    version: 1,
    user: {
      id: userId,
      name,
      email: `${userId}@local.test`,
    },
    course: {
      id: `memory-local-course-${suffix}`,
      name: '第二阶段本地记忆测试 · CSC148',
      courseCode: 'CSC148',
    },
    notebook: {
      id: `memory-local-notebook-${suffix}`,
      name: '递归、树与表示不变量',
    },
    facts: [],
    factEvents: [],
    problems: [],
    attempts: [],
    conversations: [],
    materialIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function readFile(userId: string): LocalMemoryTestFile | null {
  if (!storageAvailable()) return null;
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalMemoryTestFile;
    return parsed?.version === 1 && parsed.user?.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

function writeFile(file: LocalMemoryTestFile) {
  if (!storageAvailable()) throw new Error('当前浏览器不支持 localStorage。');
  const next = { ...file, updatedAt: Date.now() };
  localStorage.setItem(storageKey(file.user.id), JSON.stringify(next));
  return next;
}

function requireFile(userId: string) {
  const normalized = assertTestUserId(userId);
  const file = readFile(normalized);
  if (!file) throw new Error('请先创建这个本地模拟用户。');
  return file;
}

function memoryReferenceContains(item: NotebookMemoryItem, sourceId: string) {
  return JSON.stringify(item.sourceReferences || []).includes(sourceId);
}

function profileMemoryItems(profile: StudyMemoryProfile): LocalMemoryTestSnapshot['studyMemories'] {
  const items: LocalMemoryTestSnapshot['studyMemories'] = [
    ...profile.publicMemories,
    ...profile.privateMemories,
  ].map((item) => ({
    id: item.id,
    title: item.title,
    text: item.text,
    kind: item.kind || 'knowledge_gap',
    source: item.source,
    scope: item.scope,
    status: item.status || 'active',
    sourceReferences: item.sourceReferences || [],
    updatedAt: item.updatedAt,
  }));
  if (profile.workingMemory) {
    const working = profile.workingMemory;
    items.unshift({
      id: `working-memory:${profile.stageId}`,
      title: working.title,
      text: [
        working.summary,
        working.masteredSignal ? `掌握：${working.masteredSignal}` : '',
        working.stuckPoint ? `薄弱：${working.stuckPoint}` : '',
        working.nextTeachingMove ? `下一步：${working.nextTeachingMove}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      kind: 'working_state',
      source: working.source,
      scope: 'private',
      status: 'active',
      sourceReferences: {
        recentAttempt: working.recentAttempt,
        evidence: working.evidence,
      },
      updatedAt: working.updatedAt,
    });
  }
  return items;
}

export async function ensureLocalMemoryTestSandbox(args: {
  userId: string;
  name?: string;
}): Promise<LocalMemoryTestSnapshot> {
  const userId = assertTestUserId(args.userId);
  const existing = readFile(userId);
  if (!existing) writeFile(emptyFile(userId, args.name?.trim() || DEFAULT_USER_NAME));
  return getLocalMemoryTestSnapshot(userId);
}

export async function getLocalMemoryTestSnapshot(userId: string): Promise<LocalMemoryTestSnapshot> {
  const file = requireFile(userId);
  const profile = loadStudyMemory(file.user.id, file.notebook.id);
  const materials = (await listCourseMaterials(file.course.id)).filter((material) =>
    file.materialIds.includes(material.id),
  );
  const studyMemories = profileMemoryItems(profile);
  const calendarEvents = file.facts.filter((fact) => fact.namespace === 'calendar').length;
  return {
    storage: 'browser-local',
    storageDetails: {
      studyMemory: 'localStorage',
      factsAndSources: 'localStorage',
      uploadedMaterials: 'IndexedDB',
    },
    user: file.user,
    course: file.course,
    notebook: file.notebook,
    counts: {
      studyMemories: studyMemories.length,
      activeFacts: file.facts.length,
      factEvents: file.factEvents.length,
      materials: materials.length,
      problems: file.problems.length,
      attempts: file.attempts.length,
      conversations: file.conversations.length,
      calendarEvents,
    },
    studyMemories,
    workingMemory: profile.workingMemory || null,
    facts: [...file.facts].sort((a, b) => b.updatedAt - a.updatedAt),
    factEvents: [...file.factEvents].sort((a, b) => b.createdAt - a.createdAt),
    sources: {
      problems: file.problems.map((problem) => {
        const attempts = file.attempts
          .filter((attempt) => attempt.problemId === problem.id)
          .sort((a, b) => b.createdAt - a.createdAt);
        return {
          id: problem.id,
          title: problem.title,
          prompt: problem.prompt,
          questionType: problem.questionType,
          concept: problem.concept,
          difficulty: problem.difficulty,
          attemptCount: attempts.length,
          latestStatus: attempts[0]?.status || null,
          latestScore: attempts[0]?.score ?? null,
          createdAt: problem.createdAt,
        };
      }),
      attempts: file.attempts.map((attempt) => ({
        id: attempt.id,
        problemId: attempt.problemId,
        problemTitle:
          file.problems.find((problem) => problem.id === attempt.problemId)?.title || '已删除题目',
        status: attempt.status,
        score: attempt.score,
        maxScore: attempt.maxScore ?? null,
        answerPreview: attempt.answerPreview || null,
        selectedOptionIds: attempt.selectedOptionIds || [],
        submissionContext: attempt.submissionContext || null,
        gradingSource: attempt.gradingSource,
        gradingReliable: attempt.gradingReliable ?? true,
        feedback: attempt.feedback,
        createdAt: attempt.createdAt,
      })),
      conversations: file.conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        messageCount: conversation.messages.length,
        lastUserMessage:
          [...conversation.messages].reverse().find((message) => message.role === 'user')
            ?.content || null,
        createdAt: conversation.createdAt,
      })),
      materials,
    },
  };
}

export async function resetLocalMemoryTestSandbox(userId: string) {
  const file = requireFile(userId);
  const materials = await listCourseMaterials(file.course.id);
  await Promise.all(materials.map((material) => deleteCourseMaterial(material.id)));
  for (const problem of file.problems) {
    clearQuestionProgress(file.notebook.id, file.user.id, problem.sceneId, problem.id);
  }
  clearStudyMemory(file.notebook.id, file.user.id);
  localStorage.removeItem(storageKey(file.user.id));
}

function upsertFactInFile(args: {
  file: LocalMemoryTestFile;
  namespace: string;
  key: string;
  valueJson: unknown;
  source: string;
  sourceRef?: unknown;
}) {
  const now = Date.now();
  const existing = args.file.facts.find(
    (fact) => fact.namespace === args.namespace && fact.key === args.key,
  );
  const fact: LocalMemoryTestFact = existing
    ? {
        ...existing,
        valueJson: args.valueJson,
        source: args.source,
        sourceRef: args.sourceRef || existing.sourceRef,
        updatedAt: now,
      }
    : {
        id: createId('local_fact'),
        namespace: args.namespace,
        key: args.key,
        valueJson: args.valueJson,
        source: args.source,
        sourceRef: args.sourceRef || null,
        validFrom: now,
        updatedAt: now,
      };
  const event: LocalMemoryFactEvent = {
    id: createId('local_fact_event'),
    factId: fact.id,
    namespace: args.namespace,
    key: args.key,
    eventType: existing ? 'superseded' : 'created',
    oldValueJson: existing?.valueJson ?? null,
    newValueJson: args.valueJson,
    createdAt: now,
  };
  return writeFile({
    ...args.file,
    facts: [fact, ...args.file.facts.filter((item) => item.id !== fact.id)],
    factEvents: [event, ...args.file.factEvents].slice(0, 200),
  });
}

const HISTORY_CONCEPTS = [
  {
    id: 'base_case',
    label: '递归 base case',
    mastered: '能识别空树与叶节点的终止条件',
    gap: '在多分支递归中偶尔漏掉空子树',
    next: '用空树、单节点和三节点树做边界回放',
  },
  {
    id: 'recursive_subproblem',
    label: '递归问题规模缩小',
    mastered: '能让 recursive call 接收严格更小的 subtree',
    gap: '仍会把原树传回递归调用，导致问题规模不变',
    next: '逐层标出每次调用收到的 subtree',
  },
  {
    id: 'tree_traversal',
    label: '树遍历与返回值组合',
    mastered: '能组合左右子树的递归返回值',
    gap: '多分支返回值合并时容易遗漏一支',
    next: '先写出左右分支表格，再组合返回值',
  },
  {
    id: 'representation_invariant',
    label: 'Representation Invariants',
    mastered: '能说明 RI 对合法对象状态的约束',
    gap: 'mutation 之后不总会重新检查 RI',
    next: '用破坏性反例检查每个 mutation 边界',
  },
  {
    id: 'mutation',
    label: '可变对象与 aliasing',
    mastered: '能识别共享引用造成的连带修改',
    gap: '浅拷贝与深拷贝的影响判断不稳定',
    next: '画对象图并标注每个变量实际指向的对象',
  },
  {
    id: 'complexity',
    label: '递归复杂度',
    mastered: '能根据访问节点数分析常见树递归复杂度',
    gap: '对不平衡树的最坏情况界限说明不完整',
    next: '分别写出平衡树与链状树的递推关系',
  },
  {
    id: 'proof_boundary',
    label: '正确性证明与边界',
    mastered: '能提出归纳假设并连接到递归实现',
    gap: '形式化证明容易省略空结构和极端输入',
    next: '先列边界反例集合，再补完整证明链',
  },
  {
    id: 'testing',
    label: '测试设计',
    mastered: '能从实现分支反推测试样例',
    gap: '测试集覆盖正常路径多，破坏性反例不足',
    next: '为每个分支增加一个最小失败用例',
  },
  {
    id: 'abstraction',
    label: '抽象与接口契约',
    mastered: '能区分接口承诺与内部表示',
    gap: '设计说明中偶尔泄露不必要的实现细节',
    next: '先写客户端可观察行为，再决定内部结构',
  },
  {
    id: 'optimization',
    label: '优化取舍',
    mastered: '能比较多种实现的时间和空间代价',
    gap: '优化结论有时缺少可测量证据',
    next: '用复杂度、基准输入和内存代价三项说明取舍',
  },
] as const;

function spreadHistoricalTime(now: number, ageDays: number, index: number, count: number) {
  if (count <= 1) return now - Math.min(ageDays, 1) * DAY_MS;
  const fraction = (count - index) / count;
  return now - Math.max(1, Math.round(ageDays * fraction)) * DAY_MS;
}

function buildFixtureHistory(args: {
  fixture: LocalMemoryTestUserFixture;
  file: LocalMemoryTestFile;
  now: number;
}) {
  const { fixture, now } = args;
  const usage = fixture.usageProfile;
  const targetPassed = Math.round(
    (usage.attemptCount * fixture.learnerProfile.masteryPercent) / 100,
  );
  const remaining = usage.attemptCount - targetPassed;
  const targetPartial = Math.round(remaining * 0.55);
  const problems: LocalProblem[] = [];
  const attempts: LocalAttempt[] = [];
  let globalAttemptIndex = 0;

  for (let problemIndex = 0; problemIndex < usage.problemCount; problemIndex += 1) {
    const concept = HISTORY_CONCEPTS[problemIndex % HISTORY_CONCEPTS.length];
    const title = `${concept.label} · 练习 ${problemIndex + 1}`;
    const matchingWritebackCase = LOCAL_PROBLEM_WRITEBACK_CASES.find(
      (testCase) =>
        testCase.fixtureUserId === fixture.userId &&
        testCase.sourceMode === 'existing_problem' &&
        testCase.problemTitle === title,
    );
    const createdAt = spreadHistoricalTime(
      now,
      usage.accountAgeDays,
      problemIndex,
      usage.problemCount,
    );
    const problem: LocalProblem = {
      id: `fixture_problem_${stableSuffix(args.file.user.id)}_${problemIndex + 1}`,
      title,
      prompt:
        matchingWritebackCase?.questionPrompt ||
        `请完成「${concept.label}」练习 ${problemIndex + 1}，写出答案并说明关键边界。`,
      questionType: matchingWritebackCase?.questionType || 'short_answer',
      sceneId: `${TEST_SCENE_ID}-${concept.id}`,
      concept: concept.label,
      difficulty:
        problemIndex / Math.max(usage.problemCount, 1) > 0.72
          ? 'advanced'
          : problemIndex / Math.max(usage.problemCount, 1) > 0.3
            ? 'core'
            : 'intro',
      createdAt,
    };
    problems.push(problem);

    const baseAttemptCount = Math.floor(usage.attemptCount / usage.problemCount);
    const attemptsForProblem =
      baseAttemptCount + (problemIndex < usage.attemptCount % usage.problemCount ? 1 : 0);
    for (let attemptIndex = 0; attemptIndex < attemptsForProblem; attemptIndex += 1) {
      const poolIndex = (globalAttemptIndex * 37) % usage.attemptCount;
      const status: LocalAttempt['status'] =
        poolIndex < targetPassed
          ? 'passed'
          : poolIndex < targetPassed + targetPartial
            ? 'partial'
            : 'failed';
      const feedback =
        status === 'passed'
          ? `${concept.mastered}；本次作答证据通过。`
          : status === 'partial'
            ? `${concept.gap}；已经完成主要步骤，但边界仍需补全。`
            : `${concept.gap}；下一次建议：${concept.next}。`;
      attempts.push({
        id: `fixture_attempt_${stableSuffix(args.file.user.id)}_${globalAttemptIndex + 1}`,
        problemId: problem.id,
        status,
        score: status === 'passed' ? 2 : status === 'partial' ? 1 : 0,
        feedback,
        answerPreview:
          status === 'passed'
            ? `已给出 ${concept.label} 的完整推理和边界检查。`
            : `尝试了 ${concept.label}，但仍有步骤需要修正。`,
        createdAt: createdAt + (attemptIndex + 1) * 45 * 60 * 1000,
      });
      globalAttemptIndex += 1;
    }
  }

  const conversations: LocalConversation[] = Array.from(
    { length: usage.conversationCount },
    (_, conversationIndex) => {
      const concept = HISTORY_CONCEPTS[conversationIndex % HISTORY_CONCEPTS.length];
      const createdAt = spreadHistoricalTime(
        now,
        usage.accountAgeDays,
        conversationIndex,
        usage.conversationCount,
      );
      const id = `fixture_chat_${stableSuffix(args.file.user.id)}_${conversationIndex + 1}`;
      return {
        id,
        title: `${concept.label}答疑 ${conversationIndex + 1}`,
        createdAt,
        messages: [
          {
            id: `${id}_message_1`,
            role: 'user' as const,
            content: `我在${concept.label}这里为什么总是出错？请结合我刚才的作答解释。`,
            createdAt,
          },
          {
            id: `${id}_message_2`,
            role: 'assistant' as const,
            content: `从近期证据看，当前主要问题是：${concept.gap}。`,
            createdAt: createdAt + 60_000,
          },
          {
            id: `${id}_message_3`,
            role: 'user' as const,
            content: `我理解的是“${concept.mastered}”，还缺哪一步？`,
            createdAt: createdAt + 120_000,
          },
          {
            id: `${id}_message_4`,
            role: 'assistant' as const,
            content: `下一步先做这个动作：${concept.next}。`,
            createdAt: createdAt + 180_000,
          },
        ],
      };
    },
  );

  return { problems, attempts, conversations };
}

async function seedLocalMemoryTestUserFixture(
  fixture: LocalMemoryTestUserFixture,
  targetUserId = fixture.userId,
) {
  let file = readFile(targetUserId);
  if (!file) {
    file = writeFile(emptyFile(targetUserId, fixture.name));
  }

  const seededVersion = file.facts.find(
    (fact) => fact.namespace === 'test_fixture' && fact.key === 'cohort_seed_version',
  )?.valueJson;
  if (seededVersion === COHORT_SEED_VERSION) return;

  const now = Date.now();
  const history = buildFixtureHistory({ fixture, file, now });

  file = writeFile({
    ...file,
    user: { ...file.user, name: fixture.name },
    problems: history.problems,
    attempts: history.attempts,
    conversations: history.conversations,
  });
  file = upsertFactInFile({
    file,
    namespace: 'profile',
    key: 'learner_level',
    valueJson: fixture.learnerProfile,
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
  file = upsertFactInFile({
    file,
    namespace: 'preference',
    key: 'explanation_style',
    valueJson: fixture.explanationPreference,
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
  file = upsertFactInFile({
    file,
    namespace: 'habit',
    key: 'study_session',
    valueJson: fixture.studyHabit,
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
  file = upsertFactInFile({
    file,
    namespace: 'profile',
    key: 'student_context',
    valueJson: {
      program: 'University of Toronto Computer Science',
      currentCourse: 'CSC148',
      timezone: 'Asia/Shanghai',
      preferredLanguage: fixture.explanationPreference.language,
    },
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
  file = upsertFactInFile({
    file,
    namespace: 'usage',
    key: 'activity_summary',
    valueJson: {
      ...fixture.usageProfile,
      messageCount: history.conversations.reduce(
        (sum, conversation) => sum + conversation.messages.length,
        0,
      ),
      passedAttempts: history.attempts.filter((attempt) => attempt.status === 'passed').length,
      lastActiveAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
  file = upsertFactInFile({
    file,
    namespace: 'goal',
    key: 'current_learning_goal',
    valueJson: {
      course: 'CSC148',
      target: fixture.learnerProfile.nextTeachingMove,
      weeklyMinutes: fixture.studyHabit.preferredMinutes * 4,
    },
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });

  for (
    let calendarIndex = 0;
    calendarIndex < fixture.usageProfile.calendarEventCount;
    calendarIndex += 1
  ) {
    const startAt = now + (calendarIndex + 1) * DAY_MS;
    file = upsertFactInFile({
      file,
      namespace: 'calendar',
      key: `event:fixture-${calendarIndex + 1}`,
      valueJson: {
        id: `fixture-calendar-${calendarIndex + 1}`,
        title:
          calendarIndex % 3 === 0
            ? '错题复习'
            : calendarIndex % 3 === 1
              ? 'CSC148 小测准备'
              : '递归专项练习',
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(startAt + fixture.studyHabit.preferredMinutes * 60_000).toISOString(),
        status: calendarIndex % 5 === 4 ? 'completed' : 'planned',
      },
      source: 'local_test_fixture',
      sourceRef: { fixtureUserId: fixture.userId, targetUserId },
    });
  }

  for (const problem of history.problems) {
    const latestAttempt = history.attempts
      .filter((attempt) => attempt.problemId === problem.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latestAttempt) continue;
    setQuestionProgress(file.notebook.id, file.user.id, problem.sceneId, problem.id, {
      status: latestAttempt.status === 'passed' ? 'correct' : 'incorrect',
      updatedAt: latestAttempt.createdAt,
      userAnswer: latestAttempt.answerPreview || '',
      result: {
        questionId: problem.id,
        correct: latestAttempt.status === 'passed',
        status: latestAttempt.status === 'passed' ? 'correct' : 'incorrect',
        earned: latestAttempt.score,
        aiComment: latestAttempt.feedback,
      },
    });
  }

  const materialFiles = Array.from(
    { length: fixture.usageProfile.materialCount },
    (_, materialIndex) => {
      const concept = HISTORY_CONCEPTS[materialIndex % HISTORY_CONCEPTS.length];
      return new File(
        [
          [
            `# CSC148 ${concept.label} 学习资料 ${materialIndex + 1}`,
            '',
            `课程要求：${concept.mastered}。`,
            `常见失败：${concept.gap}。`,
            `建议检查：${concept.next}。`,
          ].join('\n'),
        ],
        `CSC148-${concept.id}-${materialIndex + 1}.md`,
        { type: 'text/markdown' },
      );
    },
  );
  const materials = materialFiles.length
    ? await addCourseMaterials(file.course.id, materialFiles)
    : [];
  file = writeFile({
    ...file,
    materialIds: materials.map((material) => material.id),
  });
  const notebookId = file.notebook.id;

  const privateMemories: NotebookMemoryItem[] = Array.from(
    { length: fixture.usageProfile.durablePrivateMemoryCount },
    (_, memoryIndex) => {
      const concept = HISTORY_CONCEPTS[memoryIndex % HISTORY_CONCEPTS.length];
      const problem = history.problems[memoryIndex % history.problems.length];
      const conversation =
        history.conversations[memoryIndex % Math.max(history.conversations.length, 1)];
      const fromChat = memoryIndex % 3 === 0 && Boolean(conversation);
      const phase = Math.floor(memoryIndex / HISTORY_CONCEPTS.length) + 1;
      const isMastery = (memoryIndex * 23) % 100 < fixture.learnerProfile.masteryPercent;
      const createdAt = spreadHistoricalTime(
        now,
        fixture.usageProfile.accountAgeDays,
        memoryIndex,
        fixture.usageProfile.durablePrivateMemoryCount,
      );
      return {
        id: `private_fixture_${stableSuffix(targetUserId)}_${memoryIndex + 1}`,
        scope: 'private' as const,
        kind: isMastery
          ? ('reflection' as const)
          : memoryIndex % 2
            ? ('mistake' as const)
            : ('knowledge_gap' as const),
        status:
          memoryIndex < Math.floor(fixture.usageProfile.durablePrivateMemoryCount * 0.12)
            ? ('archived' as const)
            : ('active' as const),
        source: fromChat ? ('chat' as const) : ('quiz' as const),
        stageId: notebookId,
        title: `${isMastery ? '掌握证据' : '稳定薄弱点'}：${concept.label} · 阶段 ${phase}`,
        text: isMastery
          ? `综合近期题目与对话，${concept.mastered}。这不是单次作答转存，而是跨多次证据形成的稳定结论。`
          : `多次作答与追问共同显示：${concept.gap}。下一教学动作：${concept.next}。`,
        reason: `由该用户的第 ${memoryIndex + 1} 组本地题目、作答或对话证据提炼。`,
        sourceReferences: [
          {
            notebookId,
            order: memoryIndex + 1,
            title: fromChat
              ? `对话：${conversation?.title || '学习答疑'} (${conversation?.id || 'unknown'})`
              : `题目：${problem?.title || '练习记录'} (${problem?.id || 'unknown'})`,
            why: isMastery ? concept.mastered : concept.gap,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      };
    },
  );

  const publicMemories: NotebookMemoryItem[] = materials.slice(0, 3).map((material, index) => {
    const concept = HISTORY_CONCEPTS[index % HISTORY_CONCEPTS.length];
    return {
      id: `public_fixture_${stableSuffix(targetUserId)}_${index + 1}`,
      scope: 'public' as const,
      kind: 'manual' as const,
      status: 'active' as const,
      source: 'notebook_generation' as const,
      stageId: notebookId,
      title: `课程资料规则：${concept.label}`,
      text: `来自上传资料的课程本地要求：${concept.mastered}；作答时需检查“${concept.next}”。原始全文保留在资料库，不复制进记忆。`,
      reason: '只提升会改变后续回答方式的课程约束，原资料仍是权威来源。',
      sourceReferences: [
        {
          notebookId,
          order: index + 1,
          title: `资料：${material.name} (${material.id})`,
          why: '该段是课程本地作答约束。',
        },
      ],
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    };
  });

  const recentAttempt = [...history.attempts].sort((a, b) => b.createdAt - a.createdAt)[0];
  const recentProblem = recentAttempt
    ? history.problems.find((problem) => problem.id === recentAttempt.problemId)
    : null;
  const nonPassingProblems = history.problems.filter((problem) => {
    const latest = history.attempts
      .filter((attempt) => attempt.problemId === problem.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest && latest.status !== 'passed';
  });

  saveStudyMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    quizAttempts: history.attempts.length,
    quizCorrect: history.attempts.filter((attempt) => attempt.status === 'passed').length,
    reviewCount: fixture.usageProfile.reviewCount,
    lastTouchedAt: now,
    lastStuckPoint: fixture.learnerProfile.weaknesses[0],
    workingMemory: {
      source: recentAttempt ? 'problem_attempt' : 'manual',
      title: `${fixture.learnerProfile.levelLabel}当前学习状态`,
      summary: fixture.learnerProfile.summary,
      currentTask: recentProblem?.title || 'CSC148 树递归与 Representation Invariants',
      masteredSignal: fixture.learnerProfile.mastered.join('；'),
      stuckPoint: fixture.learnerProfile.weaknesses.join('；'),
      nextTeachingMove: fixture.learnerProfile.nextTeachingMove,
      recentAttempt:
        recentAttempt && recentProblem
          ? {
              problemId: recentProblem.id,
              problemTitle: recentProblem.title,
              status: recentAttempt.status,
              score: recentAttempt.score,
              feedback: recentAttempt.feedback,
            }
          : undefined,
      evidence: recentAttempt
        ? [
            {
              type: 'problem_attempt',
              label: `最近作答 ${recentAttempt.id}`,
              text: recentAttempt.feedback,
            },
          ]
        : [],
      updatedAt: now,
    },
    weakPoints: nonPassingProblems.slice(0, 10).map((problem, index) => ({
      id: `${problem.sceneId}:${problem.id}`,
      sceneId: problem.sceneId,
      questionId: problem.id,
      title: problem.title,
      reason:
        HISTORY_CONCEPTS.find((concept) => concept.label === problem.concept)?.gap ||
        '需要继续复习。',
      status: index < Math.min(fixture.usageProfile.reviewCount, 3) ? 'reviewed' : 'open',
      createdAt: problem.createdAt,
      reviewedAt:
        index < Math.min(fixture.usageProfile.reviewCount, 3)
          ? problem.createdAt + DAY_MS
          : undefined,
    })),
    rememberedQuestions: history.conversations.slice(0, 12).map((conversation) => ({
      id: `remembered_${conversation.id}`,
      text:
        conversation.messages.find((message) => message.role === 'user')?.content ||
        conversation.title,
      createdAt: conversation.createdAt,
    })),
    publicMemories,
    privateMemories,
  });

  file = upsertFactInFile({
    file,
    namespace: 'test_fixture',
    key: 'cohort_seed_version',
    valueJson: COHORT_SEED_VERSION,
    source: 'local_test_fixture',
    sourceRef: { fixtureUserId: fixture.userId, targetUserId },
  });
}

export async function ensureLocalMemoryTestUserCohort(): Promise<LocalMemoryTestSnapshot[]> {
  for (const fixture of LOCAL_MEMORY_TEST_USER_FIXTURES) {
    const existing = readFile(fixture.userId);
    const existingVersion = existing?.facts.find(
      (fact) => fact.namespace === 'test_fixture' && fact.key === 'cohort_seed_version',
    )?.valueJson;
    if (existing && existingVersion !== COHORT_SEED_VERSION) {
      await resetLocalMemoryTestSandbox(fixture.userId);
    }
    await seedLocalMemoryTestUserFixture(fixture);
  }
  return Promise.all(
    LOCAL_MEMORY_TEST_USER_FIXTURES.map((fixture) => getLocalMemoryTestSnapshot(fixture.userId)),
  );
}

async function recordProblemAttempts(userId: string) {
  let file = requireFile(userId);
  const now = Date.now();
  const problem: LocalProblem = {
    id: createId('local_problem'),
    title: '递归树遍历：为什么必须正确缩小问题规模',
    prompt: '修复递归树遍历函数，使每个 recursive call 都接收严格更小的 subtree，并说明终止条件。',
    questionType: 'code',
    sceneId: TEST_SCENE_ID,
    concept: '递归问题规模缩小',
    difficulty: 'core',
    createdAt: now,
  };
  const attempts: LocalAttempt[] = [
    {
      id: createId('local_attempt'),
      problemId: problem.id,
      status: 'failed',
      score: 0,
      feedback: '递归调用仍然传入原树，问题规模没有缩小。',
      createdAt: now + 1,
    },
    {
      id: createId('local_attempt'),
      problemId: problem.id,
      status: 'partial',
      score: 1,
      feedback: 'base case 正确，但递归参数仍未移动到子树。',
      createdAt: now + 2,
    },
  ];
  file = writeFile({
    ...file,
    problems: [problem, ...file.problems],
    attempts: [...attempts, ...file.attempts],
  });
  const latest = attempts[1];
  setQuestionProgress(file.notebook.id, file.user.id, problem.sceneId, problem.id, {
    status: 'incorrect',
    updatedAt: latest.createdAt,
    userAnswer: 'if tree is empty: return 0; return 1 + size(tree)',
    result: {
      questionId: problem.id,
      correct: false,
      status: 'incorrect',
      earned: latest.score,
      aiComment: latest.feedback,
    },
  });
  updateNotebookWorkingMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    memory: {
      source: 'problem_attempt',
      title: '短期学习状态',
      summary: '学生知道递归需要 base case，但连续两次没有在递归调用中缩小树的问题规模。',
      currentTask: problem.title,
      masteredSignal: '能够识别并写出空树的 base case。',
      stuckPoint: '递归调用仍传入原树，不理解 recursive subproblem 必须严格缩小。',
      nextTeachingMove: '先用三节点树逐步标出每次调用收到的子树，再写递归参数。',
      recentAttempt: {
        problemId: problem.id,
        problemTitle: problem.title,
        status: latest.status,
        score: latest.score,
        feedback: latest.feedback,
      },
      evidence: [
        {
          type: 'problem_attempt',
          label: '两次本地作答',
          text: attempts.map((attempt) => `${attempt.status}: ${attempt.feedback}`).join('\n'),
        },
      ],
    },
  });
  const memory = recordNotebookPrivateMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    title: `做题记录观察：${problem.title}`,
    text: [
      '掌握：能够识别空树 base case。',
      '薄弱：递归调用没有缩小到子树。',
      '原因：尚未建立 recursive subproblem 必须严格缩小的不变量。',
      '下一步：用三节点树逐步追踪递归参数。',
      `来源题目：${problem.id}`,
    ].join('\n'),
    reason: '连续两次未通过的本地作答形成稳定学习信号。',
    kind: 'mistake',
    source: 'quiz',
    sourceReferences: [
      {
        notebookId: file.notebook.id,
        order: 1,
        title: `problem:${problem.id}`,
        why: `attempts:${attempts.map((attempt) => attempt.id).join(',')}`,
      },
    ],
  });
  return { problem, attempts, memory: memory.item };
}

async function recordProblemWritebackCase(userId: string, testCaseId: string) {
  const testCase = LOCAL_PROBLEM_WRITEBACK_CASES.find((item) => item.id === testCaseId);
  if (!testCase) throw new Error('未知的做题记忆写回测试。');

  let file = requireFile(userId);
  const now = Date.now();
  let problem =
    testCase.sourceMode === 'existing_problem'
      ? file.problems.find((item) => item.title === testCase.problemTitle) ||
        file.problems.find((item) => item.concept === testCase.concept)
      : undefined;
  const reusedProblem = Boolean(problem);

  if (!problem) {
    problem = {
      id: createId('local_problem'),
      title: testCase.problemTitle,
      prompt: testCase.questionPrompt,
      questionType: testCase.questionType,
      sceneId: `${TEST_SCENE_ID}-${testCase.id}`,
      concept: testCase.concept,
      difficulty: testCase.difficulty,
      createdAt: now,
    };
    file = writeFile({
      ...file,
      problems: [problem, ...file.problems],
    });
  }

  const quizQuestion: QuizQuestion = {
    id: problem.id,
    type: testCase.questionType,
    question: testCase.questionPrompt,
    options: testCase.options?.map((option) => ({ label: option.text, value: option.id })),
    answer: testCase.referenceAnswer,
    proof:
      testCase.questionType === 'proof' && typeof testCase.referenceAnswer === 'string'
        ? testCase.referenceAnswer
        : undefined,
    commentPrompt: testCase.rubric,
    analysis: testCase.analysis,
    points: testCase.points,
  };
  const attempts: LocalAttempt[] = [];
  for (const [index, submission] of testCase.attempts.entries()) {
    const selectedOptionIds = submission.selectedOptionIds || [];
    const hasSubmittedAnswer = isObjectiveQuestion(quizQuestion)
      ? selectedOptionIds.length > 0
      : submission.answer.trim().length > 0;

    if (!hasSubmittedAnswer) {
      attempts.push({
        id: createId('local_attempt'),
        problemId: problem.id,
        status: 'ungraded',
        score: 0,
        maxScore: testCase.points,
        feedback: '没有收到可判定的答案，平台未执行正误判断。',
        answerPreview: submission.answer,
        selectedOptionIds,
        submissionContext: submission.submissionContext,
        gradingSource: 'not_graded',
        gradingReliable: false,
        createdAt: now + index + 1,
      });
      continue;
    }

    const gradingResult = isObjectiveQuestion(quizQuestion)
      ? gradeObjectiveQuestions([quizQuestion], {
          [quizQuestion.id]: selectedOptionIds as AnswerValue,
        })[0]
      : await gradeTextQuestion(quizQuestion, submission.answer, 'zh-CN');
    const gradingReliable = Boolean(gradingResult && gradingResult.correct !== null);
    const score = gradingReliable && gradingResult ? gradingResult.earned : 0;
    const scoreRatio = score / testCase.points;
    const status: LocalAttempt['status'] = !gradingReliable
      ? 'ungraded'
      : scoreRatio >= 0.8
        ? 'passed'
        : score > 0
          ? 'partial'
          : 'failed';
    const feedback = gradingReliable
      ? gradingResult.aiComment ||
        (gradingResult.correct
          ? '平台按题目保存的正确选项判定：回答正确。'
          : '平台按题目保存的正确选项判定：回答不正确。')
      : gradingResult?.aiComment || '评分服务没有返回可信结果，本次不生成学习记忆。';

    attempts.push({
      id: createId('local_attempt'),
      problemId: problem.id,
      status,
      score,
      maxScore: testCase.points,
      feedback,
      answerPreview: submission.answer,
      selectedOptionIds,
      submissionContext: submission.submissionContext,
      gradingSource: isObjectiveQuestion(quizQuestion) ? 'platform_objective' : 'platform_ai',
      gradingReliable,
      createdAt: now + index + 1,
    });
  }
  file = writeFile({
    ...file,
    attempts: [...attempts, ...file.attempts],
  });

  const latestAttempt = attempts[attempts.length - 1];
  const gradingReliable = attempts.every((attempt) => attempt.gradingReliable === true);
  const canWriteLearningMemory = gradingReliable && testCase.writeMode !== 'no_memory';
  if (gradingReliable) {
    setQuestionProgress(file.notebook.id, file.user.id, problem.sceneId, problem.id, {
      status: latestAttempt.status === 'passed' ? 'correct' : 'incorrect',
      updatedAt: latestAttempt.createdAt,
      userAnswer: latestAttempt.answerPreview || latestAttempt.selectedOptionIds?.join(', ') || '',
      result: {
        questionId: problem.id,
        correct: latestAttempt.status === 'passed',
        status: latestAttempt.status === 'passed' ? 'correct' : 'incorrect',
        earned: latestAttempt.score,
        aiComment: latestAttempt.feedback,
      },
    });
  }

  const workingResult = !canWriteLearningMemory
    ? null
    : updateNotebookWorkingMemory({
        userId: file.user.id,
        stageId: file.notebook.id,
        memory: {
          source: 'problem_attempt',
          title: `短期学习状态：${testCase.concept}`,
          summary: [
            `${testCase.title}。`,
            `平台最新判题：${latestAttempt.status}，${latestAttempt.score}/${testCase.points} 分。`,
            `判题反馈：${latestAttempt.feedback}`,
          ].join('\n'),
          currentTask: problem.title,
          masteredSignal: testCase.masteredSignal,
          stuckPoint: testCase.stuckPoint,
          nextTeachingMove: testCase.nextTeachingMove,
          recentAttempt: {
            problemId: problem.id,
            problemTitle: problem.title,
            status: latestAttempt.status,
            score: latestAttempt.score,
            feedback: latestAttempt.feedback,
          },
          evidence: attempts.map((attempt) => ({
            type: 'problem_attempt' as const,
            label: attempt.id,
            text: [
              `${attempt.status} · ${attempt.score}/${testCase.points}: ${attempt.feedback}`,
              attempt.answerPreview ? `提交答案：${attempt.answerPreview}` : '',
              attempt.selectedOptionIds?.length
                ? `提交选项：${attempt.selectedOptionIds.join('、')}`
                : '',
              attempt.submissionContext ? `提交上下文：${attempt.submissionContext}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          })),
        },
      });

  let longTermMemory: NotebookMemoryItem | null = null;
  let longTermChange: 'created' | 'revised' | 'skipped' = 'skipped';
  const hasGapSignal = attempts.some(
    (attempt) => attempt.status === 'failed' || attempt.status === 'partial',
  );
  if (canWriteLearningMemory && testCase.writeMode === 'create_long_term' && hasGapSignal) {
    const memoryResult = recordNotebookPrivateMemory({
      userId: file.user.id,
      stageId: file.notebook.id,
      title: `做题写回：${testCase.concept}`,
      text: [
        `掌握：${testCase.masteredSignal}`,
        testCase.stuckPoint ? `薄弱：${testCase.stuckPoint}` : '',
        testCase.cause ? `原因：${testCase.cause}` : '',
        `平台判题：${attempts
          .map(
            (attempt, index) =>
              `第 ${index + 1} 次 ${attempt.score}/${testCase.points} 分，${attempt.feedback}`,
          )
          .join('；')}`,
        `下一步：${testCase.nextTeachingMove}`,
      ]
        .filter(Boolean)
        .join('\n'),
      reason: testCase.expectedMemoryChange,
      kind:
        testCase.memoryKind || (latestAttempt.status === 'failed' ? 'mistake' : 'knowledge_gap'),
      source: 'quiz',
      sourceReferences: [
        {
          notebookId: file.notebook.id,
          order: 1,
          title: `problem:${problem.id}`,
          why: `attempts:${attempts.map((attempt) => attempt.id).join(',')}`,
        },
      ],
    });
    longTermMemory = memoryResult.item;
    longTermChange = memoryResult.created ? 'created' : 'skipped';
  } else if (
    canWriteLearningMemory &&
    ((testCase.writeMode === 'revise_long_term' && latestAttempt.status === 'passed') ||
      (testCase.writeMode === 'strengthen_long_term' && hasGapSignal))
  ) {
    const profile = loadStudyMemory(file.user.id, file.notebook.id);
    const existing = profile.privateMemories.find(
      (memory) =>
        memoryReferenceContains(memory, problem.id) || memory.title.includes(testCase.concept),
    );
    if (existing) {
      const closesGap = testCase.writeMode === 'revise_long_term';
      longTermMemory = {
        ...existing,
        kind: closesGap ? 'reflection' : 'knowledge_gap',
        status: 'active',
        source: 'quiz',
        title: closesGap
          ? `复习进展：${testCase.concept}已掌握`
          : `稳定薄弱点：${testCase.concept}跨题重复`,
        text: closesGap
          ? [
              `新证据：${testCase.masteredSignal}`,
              `本次结果：${latestAttempt.feedback}`,
              `下一步：${testCase.nextTeachingMove}`,
            ].join('\n')
          : [
              `新增证据：${testCase.stuckPoint || latestAttempt.feedback}`,
              testCase.cause ? `原因：${testCase.cause}` : '',
              `下一步：${testCase.nextTeachingMove}`,
              '处理策略：合并到既有薄弱记忆，不新增重复条目。',
            ]
              .filter(Boolean)
              .join('\n'),
        reason: testCase.expectedMemoryChange,
        sourceReferences: [
          ...(existing.sourceReferences || []),
          {
            notebookId: file.notebook.id,
            order: (existing.sourceReferences?.length || 0) + 1,
            title: `problem:${problem.id}`,
            why: `${closesGap ? 'review' : 'repeated_gap'}_attempts:${attempts
              .map((attempt) => attempt.id)
              .join(',')}`,
          },
        ].slice(-6),
        updatedAt: now,
      };
      saveStudyMemory({
        ...profile,
        privateMemories: profile.privateMemories.map((memory) =>
          memory.id === existing.id ? longTermMemory! : memory,
        ),
        lastTouchedAt: now,
      });
      longTermChange = 'revised';
    }
  }

  const latestProfile = loadStudyMemory(file.user.id, file.notebook.id);
  const weakPointId = `${problem.sceneId}:${problem.id}`;
  const weakPoints = !canWriteLearningMemory
    ? latestProfile.weakPoints
    : latestAttempt.status === 'passed'
      ? latestProfile.weakPoints.map((item) =>
          item.questionId === problem.id
            ? { ...item, status: 'reviewed' as const, reviewedAt: now }
            : item,
        )
      : latestProfile.weakPoints.some((item) => item.questionId === problem.id)
        ? latestProfile.weakPoints
        : [
            {
              id: weakPointId,
              sceneId: problem.sceneId,
              questionId: problem.id,
              title: problem.title,
              reason: testCase.stuckPoint || latestAttempt.feedback,
              status: 'open' as const,
              createdAt: now,
            },
            ...latestProfile.weakPoints,
          ];
  if (canWriteLearningMemory) {
    saveStudyMemory({
      ...latestProfile,
      quizAttempts: latestProfile.quizAttempts + attempts.length,
      quizCorrect:
        latestProfile.quizCorrect +
        attempts.filter((attempt) => attempt.status === 'passed').length,
      reviewCount: latestProfile.reviewCount + (testCase.writeMode === 'revise_long_term' ? 1 : 0),
      lastTouchedAt: now,
      weakPoints: weakPoints.slice(0, 80),
    });
  }

  return {
    testCaseId: testCase.id,
    fixtureUserId: testCase.fixtureUserId,
    reusedProblem,
    problem,
    attempts,
    workingMemory: workingResult?.memory || null,
    longTermMemory,
    longTermChange,
    gradingReliable,
  };
}

async function recordSourceUpload(userId: string, sourceTitle?: string, sourceText?: string) {
  let file = requireFile(userId);
  const title = sourceTitle?.trim() || 'CSC148 表示不变量与递归设计资料.md';
  const text =
    sourceText?.trim() ||
    [
      '# CSC148 class contract',
      'A class docstring states the data type, public attributes, and Representation Invariants.',
      'Attribute annotations document expected types; the constructor establishes valid initial state.',
      'For recursive tree methods, every recursive call receives a strictly smaller subtree.',
    ].join('\n\n');
  const [material] = await addCourseMaterials(file.course.id, [
    new File([text], title, { type: 'text/markdown' }),
  ]);
  file = writeFile({
    ...file,
    materialIds: [material.id, ...file.materialIds],
  });
  const memory = recordNotebookPublicMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    title: 'CSC148 class contract：课程本地约束',
    text: [
      '讲解或批改 class 时，先检查 class docstring、public attributes 与 Representation Invariants。',
      '递归树方法的 recursive call 必须接收严格更小的 subtree。',
      '不要只给通用 OOP 定义，要先遵循这份 CSC148 课程资料中的回答契约。',
      `来源资料：${material.id}`,
    ].join('\n'),
    reason: '只把会改变未来回答形状的课程本地契约提升为公共记忆。',
    kind: 'manual',
    source: 'notebook_generation',
    sourceReferences: [
      {
        notebookId: file.notebook.id,
        order: 1,
        title: `uploaded_material:${material.id}`,
        why: title,
      },
    ],
  });
  return { material, memory: memory.item };
}

async function recordQuestion(userId: string, customQuestion?: string) {
  let file = requireFile(userId);
  const now = Date.now();
  const conversationId = createId('local_conversation');
  const question =
    customQuestion?.trim() || '树递归里我知道要写 base case，但为什么每次递归都必须缩小问题规模？';
  const conversation: LocalConversation = {
    id: conversationId,
    title: '树递归的规模缩小',
    createdAt: now,
    messages: [
      { id: createId('local_message'), role: 'user', content: question, createdAt: now },
      {
        id: createId('local_message'),
        role: 'assistant',
        content: '先用三节点树观察每次调用收到的 subtree，再把这个变化写成终止性不变量。',
        createdAt: now + 1,
      },
    ],
  };
  file = writeFile({
    ...file,
    conversations: [conversation, ...file.conversations],
  });
  updateNotebookWorkingMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    memory: {
      source: 'chat_turn',
      title: '短期学习状态',
      summary: '学生掌握 base case 的用途，但尚未把规模严格缩小与递归终止联系起来。',
      currentTask: '理解树递归的终止性与 recursive subproblem',
      masteredSignal: '知道递归函数需要 base case。',
      stuckPoint: '不理解 recursive call 为什么必须处理严格更小的 subtree。',
      nextTeachingMove: '先画三节点树的调用序列，再让学生指出每一步规模如何减少。',
      evidence: [
        {
          type: 'student_message',
          label: `conversation:${conversation.id}`,
          text: question,
        },
        {
          type: 'assistant_reply',
          label: '本轮本地回复',
          text: conversation.messages[1].content,
        },
      ],
    },
  });
  const memory = recordNotebookPrivateMemory({
    userId: file.user.id,
    stageId: file.notebook.id,
    title: '提问诊断：树递归为什么必须缩小规模',
    text: [
      '掌握：知道 base case 的作用。',
      '薄弱：没有把严格更小的 recursive subproblem 与终止性联系起来。',
      '原因：当前只记住语法结构，尚未追踪调用序列。',
      '下一步：用三节点树逐步画出 subtree 的变化。',
      `来源会话：${conversation.id}`,
    ].join('\n'),
    reason: '保存教学诊断，而不是复制学生问题。',
    question,
    kind: 'knowledge_gap',
    source: 'chat',
    sourceReferences: [
      {
        notebookId: file.notebook.id,
        order: 1,
        title: `conversation:${conversation.id}`,
        why: `message:${conversation.messages[0].id}`,
      },
    ],
  });
  return { conversation, memory: memory.item };
}

function seedPreferences(userId: string) {
  let file = requireFile(userId);
  const facts = [
    ['profile', 'display_name', file.user.name],
    [
      'profile',
      'program',
      { school: 'University of Toronto', program: 'Computer Science', year: 2 },
    ],
    ['preference', 'language', 'zh-CN'],
    [
      'preference',
      'explanation_style',
      {
        order: ['visual_intuition', 'small_example', 'formal_definition', 'code'],
        avoid: ['long_abstract_preamble'],
      },
    ],
    ['habit', 'study_session', { preferredMinutes: 35, preferredTime: '20:00', questionCount: 3 }],
  ] as const;
  for (const [namespace, key, valueJson] of facts) {
    file = upsertFactInFile({
      file,
      namespace,
      key,
      valueJson,
      source: 'memory-phase2-local-explicit',
      sourceRef: { trigger: 'explicit_user' },
    });
  }
  return { facts: file.facts };
}

function upsertFact(args: { userId: string; namespace: string; key: string; valueJson: unknown }) {
  const file = upsertFactInFile({
    file: requireFile(args.userId),
    namespace: args.namespace.trim(),
    key: args.key.trim(),
    valueJson: args.valueJson,
    source: 'memory-phase2-local-manual',
    sourceRef: { trigger: 'manual_test' },
  });
  return {
    fact: file.facts.find((fact) => fact.namespace === args.namespace && fact.key === args.key),
  };
}

function upsertCalendar(args: {
  userId: string;
  eventId?: string;
  title?: string;
  startsAt?: string;
  durationMinutes?: number;
}) {
  const eventId = args.eventId?.trim() || 'recursion-review';
  const file = upsertFactInFile({
    file: requireFile(args.userId),
    namespace: 'calendar',
    key: `event:${eventId}`,
    valueJson: {
      id: eventId,
      title: args.title?.trim() || '复习树递归与 Representation Invariants',
      startsAt: args.startsAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: args.durationMinutes || 35,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      status: 'confirmed',
    },
    source: 'calendar-memory-local',
    sourceRef: { sourceType: 'calendar', sourceId: eventId },
  });
  return {
    fact: file.facts.find(
      (fact) => fact.namespace === 'calendar' && fact.key === `event:${eventId}`,
    ),
  };
}

function deleteMemory(userId: string, layer: string, memoryId: string) {
  let file = requireFile(userId);
  if (layer === 'structured_fact') {
    const fact = file.facts.find((item) => item.id === memoryId);
    if (!fact) return { deleted: false };
    const now = Date.now();
    file = writeFile({
      ...file,
      facts: file.facts.filter((item) => item.id !== memoryId),
      factEvents: [
        {
          id: createId('local_fact_event'),
          factId: fact.id,
          namespace: fact.namespace,
          key: fact.key,
          eventType: 'deleted' as const,
          oldValueJson: fact.valueJson,
          newValueJson: null,
          createdAt: now,
        },
        ...file.factEvents,
      ].slice(0, 200),
    });
    return { deleted: true, fact };
  }
  const profile = loadStudyMemory(file.user.id, file.notebook.id);
  if (memoryId === `working-memory:${file.notebook.id}`) {
    saveStudyMemory({ ...profile, workingMemory: undefined, lastTouchedAt: Date.now() });
    return { deleted: true, memoryId };
  }
  const beforeCount = profile.publicMemories.length + profile.privateMemories.length;
  const publicMemories = profile.publicMemories.filter((item) => item.id !== memoryId);
  const privateMemories = profile.privateMemories.filter((item) => item.id !== memoryId);
  saveStudyMemory({
    ...profile,
    lastTouchedAt: Date.now(),
    publicMemories,
    privateMemories,
  });
  return {
    deleted: publicMemories.length + privateMemories.length < beforeCount,
    memoryId,
  };
}

async function deleteSource(userId: string, sourceType: string, sourceId: string) {
  let file = requireFile(userId);
  if (sourceType === 'problem') {
    const problem = file.problems.find((item) => item.id === sourceId);
    if (problem) {
      clearQuestionProgress(file.notebook.id, file.user.id, problem.sceneId, problem.id);
    }
    file = writeFile({
      ...file,
      problems: file.problems.filter((item) => item.id !== sourceId),
      attempts: file.attempts.filter((item) => item.problemId !== sourceId),
    });
  } else if (sourceType === 'conversation') {
    file = writeFile({
      ...file,
      conversations: file.conversations.filter((item) => item.id !== sourceId),
    });
  } else if (sourceType === 'uploaded_material') {
    await deleteCourseMaterial(sourceId);
    file = writeFile({
      ...file,
      materialIds: file.materialIds.filter((item) => item !== sourceId),
    });
  }

  const profile = loadStudyMemory(file.user.id, file.notebook.id);
  const workingMatches =
    profile.workingMemory?.recentAttempt?.problemId === sourceId ||
    JSON.stringify(profile.workingMemory?.evidence || []).includes(sourceId);
  const publicMemories = profile.publicMemories.filter(
    (item) => !memoryReferenceContains(item, sourceId),
  );
  const privateMemories = profile.privateMemories.filter(
    (item) => !memoryReferenceContains(item, sourceId),
  );
  const deletedMemories =
    profile.publicMemories.length +
    profile.privateMemories.length -
    publicMemories.length -
    privateMemories.length +
    (workingMatches ? 1 : 0);
  saveStudyMemory({
    ...profile,
    workingMemory: workingMatches ? undefined : profile.workingMemory,
    publicMemories,
    privateMemories,
    lastTouchedAt: Date.now(),
  });
  return { sourceType, sourceId, deletedMemories };
}

function scenarioRunUserId(scenarioId: string, fixture: LocalMemoryTestUserFixture) {
  return `memory-test-run-${fixture.learnerProfile.levelId}-${stableSuffix(scenarioId)}`;
}

export async function disposeLocalMemoryTestScenarioRun(userId: string) {
  if (!readFile(userId)) return;
  await resetLocalMemoryTestSandbox(userId);
}

export async function prepareLocalMemoryTestScenarioRun(args: {
  scenarioId: string;
  fixtureUserId: string;
}): Promise<LocalMemoryTestSnapshot> {
  const fixture = LOCAL_MEMORY_TEST_USER_FIXTURES.find(
    (item) => item.userId === args.fixtureUserId,
  );
  if (!fixture) throw new Error('未知的四水平模拟用户。');

  const runUserId = scenarioRunUserId(args.scenarioId, fixture);
  await disposeLocalMemoryTestScenarioRun(runUserId);
  await seedLocalMemoryTestUserFixture(fixture, runUserId);

  if (args.scenarioId === 'memory-layered-query') {
    await recordProblemAttempts(runUserId);
    upsertCalendar({ userId: runUserId });
  } else if (args.scenarioId === 'memory-source-cascade-delete') {
    await recordProblemAttempts(runUserId);
    await recordQuestion(runUserId);
    await recordSourceUpload(runUserId);
  } else if (args.scenarioId === 'memory-ai-question-generation') {
    await recordProblemAttempts(runUserId);
  } else if (args.scenarioId === 'memory-ai-explanation') {
    await recordQuestion(runUserId);
  } else if (
    args.scenarioId === 'memory-ai-review-plan' ||
    args.scenarioId === 'memory-ai-next-action'
  ) {
    await recordProblemAttempts(runUserId);
    upsertCalendar({ userId: runUserId });
  }

  return getLocalMemoryTestSnapshot(runUserId);
}

function countDelta(
  before: LocalMemoryTestSnapshot['counts'],
  after: LocalMemoryTestSnapshot['counts'],
) {
  return Object.fromEntries(
    (Object.keys(before) as Array<keyof typeof before>).map((key) => [
      key,
      after[key] - before[key],
    ]),
  ) as LocalMemoryMutationResponse['delta'];
}

export async function runLocalMemoryTestAction(input: {
  action: string;
  userId: string;
  [key: string]: unknown;
}): Promise<LocalMemoryMutationResponse> {
  const userId = assertTestUserId(input.userId);
  const before = await getLocalMemoryTestSnapshot(userId);
  let result: unknown;
  if (input.action === 'record_problem_attempts') {
    result =
      typeof input.testCaseId === 'string'
        ? await recordProblemWritebackCase(userId, input.testCaseId)
        : await recordProblemAttempts(userId);
  } else if (input.action === 'record_source_upload') {
    result = await recordSourceUpload(
      userId,
      typeof input.sourceTitle === 'string' ? input.sourceTitle : undefined,
      typeof input.text === 'string' ? input.text : undefined,
    );
  } else if (input.action === 'record_question') {
    result = await recordQuestion(
      userId,
      typeof input.question === 'string' ? input.question : undefined,
    );
  } else if (input.action === 'seed_preferences') {
    result = seedPreferences(userId);
  } else if (input.action === 'upsert_fact') {
    result = upsertFact({
      userId,
      namespace: String(input.namespace || ''),
      key: String(input.key || ''),
      valueJson: input.valueJson,
    });
  } else if (input.action === 'upsert_calendar') {
    result = upsertCalendar({
      userId,
      eventId: typeof input.eventId === 'string' ? input.eventId : undefined,
      title: typeof input.title === 'string' ? input.title : undefined,
      startsAt: typeof input.startsAt === 'string' ? input.startsAt : undefined,
      durationMinutes:
        typeof input.durationMinutes === 'number' ? input.durationMinutes : undefined,
    });
  } else if (input.action === 'upsert_calendar_roundtrip') {
    const eventId = typeof input.eventId === 'string' ? input.eventId : 'recursion-review';
    const created = upsertCalendar({
      userId,
      eventId,
      title: '第一次安排：树递归复习',
      startsAt: '2026-07-15T12:00:00.000Z',
      durationMinutes: 20,
    });
    const updated = upsertCalendar({
      userId,
      eventId,
      title: typeof input.title === 'string' ? input.title : undefined,
      startsAt: typeof input.startsAt === 'string' ? input.startsAt : undefined,
      durationMinutes:
        typeof input.durationMinutes === 'number' ? input.durationMinutes : undefined,
    });
    result = { created, updated };
  } else if (input.action === 'delete_memory') {
    result = deleteMemory(userId, String(input.layer || ''), String(input.memoryId || ''));
  } else if (input.action === 'delete_source') {
    result = await deleteSource(
      userId,
      String(input.sourceType || ''),
      String(input.sourceId || ''),
    );
  } else {
    throw new Error(`未知本地测试操作：${input.action}`);
  }
  const after = await getLocalMemoryTestSnapshot(userId);
  return {
    action: input.action,
    result,
    delta: countDelta(before.counts, after.counts),
    before,
    after,
    snapshot: after,
  };
}

function queryTokens(query: string) {
  const lower = query.toLowerCase();
  const latin = lower.match(/[a-z0-9_:-]{2,}/g) || [];
  const cjkRuns = lower.match(/[\u3400-\u9fff]{2,}/g) || [];
  const cjkBigrams = cjkRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) => run.slice(index, index + 2)),
  );
  return Array.from(new Set([...latin, ...cjkBigrams])).slice(0, 40);
}

function matchScore(value: unknown, tokens: string[]) {
  const text = JSON.stringify(value).toLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

export async function queryLocalMemoryTest(userId: string, query: string) {
  const snapshot = await getLocalMemoryTestSnapshot(userId);
  const tokens = queryTokens(query);
  const facts = snapshot.facts
    .map((fact) => ({ fact, score: matchScore(fact, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const memories = snapshot.studyMemories
    .map((memory) => ({ memory, score: matchScore(memory, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    storage: snapshot.storage,
    query,
    tokens,
    readPlan: [
      '1. 精确当前值：本地 facts（资料、偏好、习惯、日历）',
      '2. 当前学习状态：NotebookWorkingMemory',
      '3. 本地公共/私有 StudyMemory',
      '4. 本地关键词召回；此测试不访问服务端向量库或数据库',
    ],
    counts: {
      exactFacts: facts.length,
      workingMemory: snapshot.workingMemory ? 1 : 0,
      matchedMemories: memories.length,
    },
    facts,
    workingMemory: snapshot.workingMemory,
    memories,
  };
}

export async function buildLocalMemoryEvidence(userId: string): Promise<{
  instruction: string;
  evidence: LocalMemoryEvidence[];
  snapshot: LocalMemoryTestSnapshot;
}> {
  const snapshot = await getLocalMemoryTestSnapshot(userId);
  const evidence: LocalMemoryEvidence[] = [
    {
      id: `local-user:${snapshot.user.id}`,
      layer: 'profile',
      title: '本地模拟用户',
      content: JSON.stringify({
        user: snapshot.user,
        course: snapshot.course,
        notebook: snapshot.notebook,
      }),
    },
    ...snapshot.facts.map((fact) => ({
      id: fact.id,
      layer: 'exact_fact' as const,
      title: `${fact.namespace}:${fact.key}`,
      content: JSON.stringify(fact.valueJson),
    })),
    ...snapshot.studyMemories.map((memory) => ({
      id: memory.id,
      layer:
        memory.kind === 'working_state'
          ? ('working_memory' as const)
          : memory.scope === 'public'
            ? ('public_memory' as const)
            : ('private_memory' as const),
      title: memory.title,
      content: memory.text,
    })),
  ];
  return {
    instruction: [
      '以下证据全部来自浏览器本地模拟用户。',
      '精确事实优先于文本记忆；当前工作记忆优先于较旧的公共/私有记忆。',
      '只能引用下列真实 evidence id，不得编造。',
    ].join('\n'),
    evidence,
    snapshot,
  };
}
