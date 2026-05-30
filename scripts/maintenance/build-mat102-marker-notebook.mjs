import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-sets-propositions-v1');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');
const CANDIDATES_PATH = path.join(OUT_DIR, 'generated-candidates.json');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-sets-propositions-v1';
const NOTEBOOK_NAME = '集合与命题：证明语言的入口';

const SELECTED_CANDIDATE_INDICES = [1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20];
const PAGE_SOURCE_OVERRIDES = {
  14: '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a4f650fe48195b8ecad8d6fead550.png',
};

const COLORS = [
  { name: 'red', hex: '#ff0000', zh: '红色' },
  { name: 'lime', hex: '#00ff00', zh: '绿色' },
  { name: 'blue', hex: '#0048ff', zh: '蓝色' },
  { name: 'cyan', hex: '#00ffff', zh: '青色' },
  { name: 'magenta', hex: '#ff00ff', zh: '品红色' },
  { name: 'yellow', hex: '#ffff00', zh: '黄色' },
];

const MARKER_TESTS = {
  red: (p) => p.r > 190 && p.g < 120 && p.b < 120,
  lime: (p) => p.g > 190 && p.r < 120 && p.b < 120,
  blue: (p) => p.b > 175 && p.r < 120 && p.g < 150,
  cyan: (p) => p.g > 175 && p.b > 175 && p.r < 135,
  magenta: (p) => p.r > 175 && p.b > 175 && p.g < 135,
  yellow: (p) => p.r > 185 && p.g > 185 && p.b < 145,
};

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));

const pages = [
  {
    title: '这节课要学什么',
    promptSummary: '介绍页：证明课的第一套语言，对象、条件、判断。',
    components: [
      {
        id: 'p01-header',
        label: '本节入口',
        role: 'opening',
        color: 'red',
        visibleText: ['这节课要学什么', '学习证明的第一套语言'],
        script:
          '这一页先给整节课定方向。我们不是为了背一串集合符号，而是要学证明课的第一套语言：怎样说清对象，怎样描述条件，怎样判断一句话成立。',
      },
      {
        id: 'p01-keywords',
        label: '三个关键词',
        role: 'setup',
        color: 'lime',
        visibleText: ['对象', '条件', '判断'],
        script:
          '这三个词会贯穿整节课。对象回答我们在讨论谁，条件回答哪些对象被选中，判断回答一句数学话到底是真还是假。',
      },
      {
        id: 'p01-route',
        label: '课堂路线',
        role: 'setup',
        color: 'blue',
        visibleText: ['集合', '集合运算', '子集证明', '命题逻辑'],
        script:
          '这条路线从集合开始，接着把集合运算翻译成元素条件，再进入子集证明，最后把这些语言接到命题逻辑上。',
      },
      {
        id: 'p01-symbols',
        label: '符号不是装饰',
        role: 'takeaway',
        color: 'cyan',
        visibleText: ['每个符号都是一句压缩的话', 'x ∈ A'],
        script:
          '看到符号时，不要只把它当成记号。比如 x 属于 A，其实是一句可以判断的数学句子，只是被压缩成了符号。',
      },
      {
        id: 'p01-proof-habit',
        label: '证明课习惯',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['每一步都问：定义是什么？', '从定义出发'],
        script:
          '证明课最重要的习惯是回到定义。卡住时先不要猜技巧，而是问这句话的定义是什么，这个符号到底展开成什么条件。',
      },
      {
        id: 'p01-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['看到 A ⊆ B，证明的第一句话应该怎么写？'],
        script:
          '最后留一个问题：如果要证明 A 包含于 B，第一句话通常不是举例，而是任取一个属于 A 的元素。',
      },
    ],
  },
  {
    title: '集合：从对象到判断',
    promptSummary: '集合定义、属于关系、常用数集和子集证明语言。',
    components: [
      {
        id: 'p02-header',
        label: '本页主线',
        role: 'opening',
        color: 'red',
        visibleText: ['集合：从对象到判断', '先把对象说清楚'],
        script:
          '这一页把集合和判断接起来。先把对象范围说清楚，后面我们才能判断某个对象是否属于集合，也才能开始证明。',
      },
      {
        id: 'p02-definition',
        label: '集合要先定义清楚',
        role: 'definition',
        color: 'lime',
        visibleText: ['集合是一批确定的对象', '对象叫元素', '不能靠感觉决定属于谁'],
        script:
          '集合的重点是确定性。给定一个对象，我们应该能判断它在不在集合里，而不是靠直觉或心情决定。',
      },
      {
        id: 'p02-membership',
        label: '属于与不属于',
        role: 'formula',
        color: 'blue',
        visibleText: ['A={1,2,3,4}', '2 ∈ A', '5 ∉ A'],
        script:
          '属于和不属于是最基本的判断。二属于 A 是一句真话，五不属于 A 也是一句真话，因为集合 A 已经写清楚了。',
      },
      {
        id: 'p02-number-sets',
        label: '常用数集',
        role: 'definition',
        color: 'cyan',
        visibleText: ['Z 整数', 'Q 有理数', 'R 实数', 'Z+ 正整数', 'Z ⊂ Q ⊂ R'],
        script:
          '这些常用数集不是符号表，而是在告诉我们对象的类型。以后证明时，整数、有理数、实数的范围差别会直接影响结论。',
      },
      {
        id: 'p02-proof-language',
        label: '证明语言',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['要证 A ⊆ B', '任取 x ∈ A', '推出 x ∈ B'],
        script:
          '子集证明的语言已经出现了：要证明 A 包含于 B，就任取一个 A 里的元素，然后推出它也在 B 里。',
      },
      {
        id: 'p02-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['如果一个集合没有定义清楚，后面的证明会在哪里出问题？'],
        script:
          '如果集合没定义清楚，证明的第一步就会出问题。因为你甚至不知道任取的这个元素是否真的属于集合。',
      },
    ],
  },
  {
    title: '什么叫定义清楚',
    promptSummary: '集合确定性、含糊反例和明确条件。',
    components: [
      {
        id: 'p03-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['什么叫定义清楚', '可判断的对象范围'],
        script:
          '这一页专门解释什么叫定义清楚。严格证明不是从感觉开始，而是从可以判断的对象范围开始。',
      },
      {
        id: 'p03-determinacy',
        label: '确定性',
        role: 'definition',
        color: 'lime',
        visibleText: ['给定一个对象 x', 'x ∈ A 或 x ∉ A'],
        script:
          '确定性的意思是，给定一个对象 x，我们应该能得到明确结果：它属于 A，或者它不属于 A。',
      },
      {
        id: 'p03-counterexample',
        label: '反例',
        role: 'pitfall',
        color: 'blue',
        visibleText: ['大的数的集合？', '多大才算大？', '不清楚'],
        script:
          '比如大的数的集合就是一个坏例子。多大才算大没有说清楚，不同人会给出不同答案，所以它不适合直接用于严格证明。',
      },
      {
        id: 'p03-good-example',
        label: '正例',
        role: 'example',
        color: 'cyan',
        visibleText: ['{x ∈ Z | x > 0}', '整数', '大于 0'],
        script:
          '这个正例就清楚得多：对象先限制在整数里，再要求大于零。两个条件都能检查。',
      },
      {
        id: 'p03-table',
        label: '判断小表',
        role: 'example',
        color: 'magenta',
        visibleText: ['x=3：属于', 'x=-2：不属于', 'x=1/2：不属于'],
        script:
          '看这个判断表。三属于，因为它是大于零的整数；负二不属于；二分之一也不属于，因为它不是整数。',
      },
      {
        id: 'p03-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['如果条件含糊，证明中的任取 x 还能成立吗？'],
        script:
          '如果条件含糊，任取 x 这句话就没有稳定含义。证明需要每个对象都能被同一套规则判断。',
      },
    ],
  },
  {
    title: '列举法与集合构造式',
    promptSummary: '从列举元素到用条件筛选元素。',
    components: [
      {
        id: 'p04-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['列举法与集合构造式', '不同语言描述同一个集合'],
        script:
          '这一页讲两种写集合的方法。列举法直接写出元素，构造式则用条件描述哪些对象会被选中。',
      },
      {
        id: 'p04-roster',
        label: '列举法',
        role: 'definition',
        color: 'lime',
        visibleText: ['A={1,2,3,4}', '元素少时直接写'],
        script:
          '列举法适合元素数量少、能直接写完的集合。比如 A 等于一二三四，所有元素都摆在眼前。',
      },
      {
        id: 'p04-builder',
        label: '构造式',
        role: 'definition',
        color: 'blue',
        visibleText: ['B={x | x 是偶数}', '竖线读作：满足'],
        script:
          '构造式的竖线可以读成满足。它的意思是，所有满足后面条件的 x 被收进这个集合。',
      },
      {
        id: 'p04-rule',
        label: '条件是规则',
        role: 'strategy',
        color: 'cyan',
        visibleText: ['给一个对象 x', '检查条件', '决定是否属于'],
        script:
          '构造式其实给了一个判断规则。拿来一个对象，检查它是否满足条件，就能判断它是否属于集合。',
      },
      {
        id: 'p04-translation',
        label: '翻译例子',
        role: 'example',
        color: 'magenta',
        visibleText: ['{2,4,6,8}', '{x ∈ Z | x 是正偶数且 x≤8}'],
        script:
          '这里展示同一个集合的两种表达。列举法写出二四六八，构造式则说明它们是小于等于八的正偶数。',
      },
      {
        id: 'p04-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['用构造式写集合时，最容易漏掉哪个范围条件？'],
        script:
          '写构造式时最容易漏掉对象范围，比如忘记写 x 属于整数。范围没写，集合就可能变成另一个东西。',
      },
    ],
  },
  {
    title: '属于关系就是最小命题',
    promptSummary: '把 x 属于 A 看成可判断的数学句子。',
    components: [
      {
        id: 'p05-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['属于关系就是最小命题', '符号变成有真假的话'],
        script:
          '这一页把集合语言接到命题语言。属于关系不是孤立符号，它已经是一句可以判断真假的数学话。',
      },
      {
        id: 'p05-set-a',
        label: '集合 A',
        role: 'setup',
        color: 'lime',
        visibleText: ['A={1,2,3,4}', '对象范围已经给定'],
        script:
          '先固定集合 A。因为 A 的元素已经写清楚，后面每一句属于或不属于都可以被判断。',
      },
      {
        id: 'p05-true',
        label: '真判断',
        role: 'example',
        color: 'blue',
        visibleText: ['2 ∈ A', '这句话为真'],
        script:
          '二属于 A 是真命题，因为二确实出现在 A 的元素列表里。',
      },
      {
        id: 'p05-false',
        label: '假判断',
        role: 'example',
        color: 'cyan',
        visibleText: ['5 ∉ A', '5 ∈ A 为假'],
        script:
          '五不属于 A 也可以判断为真；相反，五属于 A 这句话就是假。重点是它们都有真假。',
      },
      {
        id: 'p05-variable',
        label: '含变量时',
        role: 'pitfall',
        color: 'magenta',
        visibleText: ['x ∈ A', '还要知道 x 是谁'],
        script:
          '如果只写 x 属于 A，还不知道 x 是谁，所以真假没有固定。给 x 一个具体值之后，判断才完成。',
      },
      {
        id: 'p05-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么 x ∈ A 比单独的 x 更像一句数学句子？'],
        script:
          '单独的 x 只是对象符号；x 属于 A 则在说这个对象和集合之间的关系，所以它更像一句数学句子。',
      },
    ],
  },
  {
    title: '常用数集不是符号表',
    promptSummary: '整数、正整数、有理数、实数和包含关系。',
    components: [
      {
        id: 'p06-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['常用数集不是符号表', '知道对象是什么'],
        script:
          '这一页整理常用数集。目的不是背符号，而是知道每个符号里装的是哪类对象。',
      },
      {
        id: 'p06-integers',
        label: '整数',
        role: 'definition',
        color: 'lime',
        visibleText: ['Z：整数', '可以为负，也可以为零'],
        script:
          '整数集合包含负整数、零和正整数。以后看到 x 属于整数，就知道 x 不能是二分之一这类数。',
      },
      {
        id: 'p06-positive',
        label: '正整数',
        role: 'definition',
        color: 'blue',
        visibleText: ['Z+：正整数', '不含 0'],
        script:
          '正整数从一开始，不包含零。这个小差别在证明和反例里经常很关键。',
      },
      {
        id: 'p06-rationals',
        label: '有理数',
        role: 'definition',
        color: 'cyan',
        visibleText: ['Q：有理数', 'p/q', 'q ≠ 0'],
        script:
          '有理数的核心特征是能写成两个整数的商，并且分母不能为零。证明一个数有理，常常就是把它写成这种形式。',
      },
      {
        id: 'p06-inclusions',
        label: '包含关系',
        role: 'formula',
        color: 'magenta',
        visibleText: ['Z ⊂ Q ⊂ R', '整数也是有理数'],
        script:
          '整数都是有理数，有理数都是实数。包含关系告诉我们，如果一个数是整数，我们立刻也知道它是有理数。',
      },
      {
        id: 'p06-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['证明 x ∈ Q 时，为什么常常要写成分数形式？'],
        script:
          '因为有理数的定义就是能写成整数比。证明属于 Q，就要回到这个定义。',
      },
    ],
  },
  {
    title: '集合运算的元素语言',
    promptSummary: '并交差全部翻译成元素条件。',
    components: [
      {
        id: 'p07-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['集合运算的元素语言', '先翻译 x 属于谁'],
        script:
          '从这里开始，集合运算不再只是图形，而是证明语言。看到集合式，先问 x 属于这个集合是什么意思。',
      },
      {
        id: 'p07-union',
        label: '并集',
        role: 'formula',
        color: 'lime',
        visibleText: ['x ∈ A ∪ B', 'x ∈ A 或 x ∈ B'],
        script:
          '并集的元素语言是或。x 属于 A 并 B，意思是 x 在 A 里，或者 x 在 B 里，至少满足一个。',
      },
      {
        id: 'p07-intersection',
        label: '交集',
        role: 'formula',
        color: 'blue',
        visibleText: ['x ∈ A ∩ B', 'x ∈ A 且 x ∈ B'],
        script:
          '交集的元素语言是且。x 要同时属于 A 和 B，才属于 A 交 B。',
      },
      {
        id: 'p07-difference',
        label: '差集',
        role: 'formula',
        color: 'cyan',
        visibleText: ['x ∈ A \\ B', 'x ∈ A 且 x ∉ B'],
        script:
          '差集也要翻译成两个条件：x 在 A 里，并且 x 不在 B 里。',
      },
      {
        id: 'p07-template',
        label: '证明翻译模板',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['遇到集合式', '改写成元素条件', '再用逻辑推出'],
        script:
          '证明时可以按这个模板走：先把集合式改写成元素条件，再用逻辑关系推出目标条件。',
      },
      {
        id: 'p07-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么证明集合等式时，第一步常常写任取 x？'],
        script:
          '因为集合等式最终要比较所有元素。任取 x 可以把集合问题变成关于一个任意元素的条件推理。',
      },
    ],
  },
  {
    title: '补集必须先有论域',
    promptSummary: '补集相对于论域，换论域会换答案。',
    components: [
      {
        id: 'p08-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['补集必须先有论域', '在哪个世界里讨论'],
        script:
          '补集这件事必须先问论域。所谓不在 A 里，是在当前讨论的整体范围里不在 A 里。',
      },
      {
        id: 'p08-universe',
        label: '论域',
        role: 'definition',
        color: 'lime',
        visibleText: ['U：所有正在讨论的对象', '补集相对于 U'],
        script:
          '论域 U 表示我们正在讨论的所有对象。补集永远是相对于这个 U 来说的。',
      },
      {
        id: 'p08-definition',
        label: '定义',
        role: 'formula',
        color: 'blue',
        visibleText: ['A^c = {x ∈ U | x ∉ A}', '两个条件都要写'],
        script:
          '补集的定义里有两个条件：x 必须先属于 U，同时 x 不属于 A。漏掉 U，定义就不完整。',
      },
      {
        id: 'p08-same-a',
        label: '同一个 A',
        role: 'example',
        color: 'cyan',
        visibleText: ['A={1,2}', 'U={1,2,3,4}', 'A^c={3,4}'],
        script:
          '在这个论域里，A 的补集只有三和四，因为 U 里除了一二以外只剩三四。',
      },
      {
        id: 'p08-change-u',
        label: '换论域',
        role: 'pitfall',
        color: 'magenta',
        visibleText: ['U={1,2,3,4,5,6}', 'A^c={3,4,5,6}', '补集变了'],
        script:
          '如果把论域换大，同一个 A 的补集也会变大。这说明补集不能脱离论域单独谈。',
      },
      {
        id: 'p08-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['不写 U，为什么补集的答案可能不唯一？'],
        script:
          '不写 U，就不知道除了 A 以外还允许哪些对象，所以补集可能有不同答案。',
      },
    ],
  },
  {
    title: '笛卡尔积：顺序开始重要',
    promptSummary: '有序对和笛卡尔积的定义。',
    components: [
      {
        id: 'p09-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['笛卡尔积：顺序开始重要', '有序对不是普通集合'],
        script:
          '笛卡尔积让顺序变得重要。有序对的第一位和第二位有角色，不能随便交换。',
      },
      {
        id: 'p09-ordered-pair',
        label: '有序对',
        role: 'definition',
        color: 'lime',
        visibleText: ['(a,b)', '通常 (a,b) ≠ (b,a)'],
        script:
          '有序对写成 a 逗号 b，第一位和第二位的位置有意义。通常交换以后就不是同一个对象。',
      },
      {
        id: 'p09-definition',
        label: '定义',
        role: 'formula',
        color: 'blue',
        visibleText: ['A × B = {(a,b) | a ∈ A 且 b ∈ B}'],
        script:
          'A 乘 B 的元素都是有序对。第一位来自 A，第二位来自 B，这两个条件同时成立。',
      },
      {
        id: 'p09-example',
        label: '小例子',
        role: 'example',
        color: 'cyan',
        visibleText: ['A={1,2}', 'B={红,蓝}', '(1,红)', '(2,蓝)'],
        script:
          '这个例子把每个 A 中元素和每个 B 中元素配对。每个结果都是一个有序对。',
      },
      {
        id: 'p09-pitfall',
        label: '常见误区',
        role: 'pitfall',
        color: 'magenta',
        visibleText: ['A × B 通常不等于 B × A', '顺序属于定义的一部分'],
        script:
          '常见错误是把 A 乘 B 和 B 乘 A 当成一样。除非有特殊情况，否则第一位和第二位换了，集合就变了。',
      },
      {
        id: 'p09-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么坐标点 (2,3) 和 (3,2) 表示不同位置？'],
        script:
          '坐标点正好体现有序对。横坐标和纵坐标的顺序不同，位置也不同。',
      },
    ],
  },
  {
    title: '子集证明：任取元素法',
    promptSummary: '证明 A 包含于 B 的标准写法。',
    components: [
      {
        id: 'p10-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['子集证明：任取元素法', '每个 A 的元素也在 B'],
        script:
          '这一页是本节课的证明核心。证明 A 包含于 B，就是证明每一个 A 的元素也属于 B。',
      },
      {
        id: 'p10-goal',
        label: '目标',
        role: 'formula',
        color: 'lime',
        visibleText: ['要证 A ⊆ B', '若 x ∈ A，则 x ∈ B'],
        script:
          '先把目标翻译出来。A 包含于 B 等价于：如果 x 属于 A，那么 x 也属于 B。',
      },
      {
        id: 'p10-first-line',
        label: '第一句',
        role: 'strategy',
        color: 'blue',
        visibleText: ['任取 x ∈ A', '不要先假设 x ∈ B'],
        script:
          '标准开头是任取 x 属于 A。注意不能一开始就假设 x 属于 B，因为那正是我们要证明的目标。',
      },
      {
        id: 'p10-expand',
        label: '展开定义',
        role: 'proof',
        color: 'cyan',
        visibleText: ['把 x ∈ A 改写成 A 的条件', '来自定义'],
        script:
          '接下来展开 A 的定义。x 属于 A 到底意味着哪些条件？这一步是证明能够推进的来源。',
      },
      {
        id: 'p10-conclude',
        label: '推到目标',
        role: 'proof',
        color: 'magenta',
        visibleText: ['推出 x ∈ B', '于是 A ⊆ B'],
        script:
          '最后把这些条件整理成 x 属于 B。因为 x 是任取的，所以这说明所有 A 的元素都在 B 里。',
      },
      {
        id: 'p10-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么任取比找一个例子更适合证明包含关系？'],
        script:
          '找一个例子只能说明有一个元素表现正确；任取元素才说明所有元素都被同一套推理覆盖。',
      },
    ],
  },
  {
    title: '集合相等：双向包含法',
    promptSummary: '证明集合相等需要两个方向。',
    components: [
      {
        id: 'p11-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['集合相等：双向包含法', '两边都包含'],
        script:
          '集合相等不是看起来一样，而是元素完全一样。证明时通常分成两个包含关系。',
      },
      {
        id: 'p11-equivalence',
        label: '定义翻译',
        role: 'formula',
        color: 'lime',
        visibleText: ['A = B', 'A ⊆ B 且 B ⊆ A'],
        script:
          'A 等于 B 可以翻译成两个条件：A 包含于 B，并且 B 包含于 A。',
      },
      {
        id: 'p11-line-one',
        label: '第一条证明线',
        role: 'proof',
        color: 'blue',
        visibleText: ['证明 A ⊆ B', '任取 x ∈ A', '推出 x ∈ B'],
        script:
          '第一条线证明 A 包含于 B。任取 A 中元素，最后要推出它也属于 B。',
      },
      {
        id: 'p11-line-two',
        label: '第二条证明线',
        role: 'proof',
        color: 'cyan',
        visibleText: ['证明 B ⊆ A', '任取 x ∈ B', '推出 x ∈ A'],
        script:
          '第二条线反过来证明 B 包含于 A。任取 B 中元素，最后推出它也属于 A。',
      },
      {
        id: 'p11-writing',
        label: '写作提醒',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['两条线分开写', '不要只说显然相等', '回到定义'],
        script:
          '写作时把两条证明线分开，不要把方向混在一起，也不要只写显然相等。证明要让读者看到每一步依据。',
      },
      {
        id: 'p11-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['如果只证明 A ⊆ B，为什么还不能得到 A = B？'],
        script:
          '只证明 A 包含于 B，可能 B 里还有额外元素。要排除这种可能，必须再证明 B 包含于 A。',
      },
    ],
  },
  {
    title: '完整例题：用定义证明集合相等',
    promptSummary: '分配律集合等式的元素证明。',
    components: [
      {
        id: 'p12-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['完整例题', '用定义证明集合相等'],
        script:
          '这一页把前面的语言连成一份证明。我们不用只看图，而是把集合等式一步步翻译成元素条件。',
      },
      {
        id: 'p12-claim',
        label: '要证明',
        role: 'formula',
        color: 'lime',
        visibleText: ['A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)'],
        script:
          '目标是证明这个分配律形式的集合等式。按照双向包含法，我们要处理左右两个方向。',
      },
      {
        id: 'p12-left-to-right',
        label: '左到右',
        role: 'proof',
        color: 'blue',
        visibleText: ['任取 x ∈ A ∩ (B ∪ C)', 'x ∈ A，且 x ∈ B 或 x ∈ C'],
        script:
          '先任取 x 属于左边。展开交集，得到 x 属于 A，并且 x 属于 B 并 C。',
      },
      {
        id: 'p12-distribute',
        label: '分配逻辑',
        role: 'proof',
        color: 'cyan',
        visibleText: ['x ∈ A∩B 或 x ∈ A∩C', '所以 x 属于右边'],
        script:
          '因为 x 属于 A，同时又在 B 或 C 中，所以它要么在 A 交 B 中，要么在 A 交 C 中，因此属于右边。',
      },
      {
        id: 'p12-right-to-left',
        label: '右到左',
        role: 'proof',
        color: 'magenta',
        visibleText: ['反向同理', '从右边推回左边'],
        script:
          '反向也按同样方式展开。若 x 属于右边，就在 A 交 B 或 A 交 C 中，于是能推出 x 属于 A 且属于 B 并 C。',
      },
      {
        id: 'p12-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['这道题真正用到的是集合图，还是元素条件？'],
        script:
          '集合图可以帮助直觉，但严格证明真正依靠的是元素条件的翻译和逻辑推理。',
      },
    ],
  },
  {
    title: '命题与谓词：什么时候有真假',
    promptSummary: '区分命题、谓词和表达式。',
    components: [
      {
        id: 'p13-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['命题与谓词', '什么时候有真假'],
        script:
          '这一页从集合语言进入逻辑语言。我们要分清楚，哪些东西已经有真假，哪些还缺少变量信息。',
      },
      {
        id: 'p13-proposition',
        label: '命题',
        role: 'definition',
        color: 'lime',
        visibleText: ['2 是偶数', '可以判断：真', '命题'],
        script:
          '二是偶数是一句完整的话，而且能判断为真，所以它是命题。',
      },
      {
        id: 'p13-predicate',
        label: '谓词',
        role: 'definition',
        color: 'blue',
        visibleText: ['x 是偶数', '还不知道 x 是谁'],
        script:
          'x 是偶数还不能立刻判断真假，因为 x 没有固定。它是一个带变量的条件。',
      },
      {
        id: 'p13-expression',
        label: '不是命题',
        role: 'pitfall',
        color: 'cyan',
        visibleText: ['x + 1', '只是表达式', '不是一句话'],
        script:
          'x 加一甚至不是一句可以判断的话，它只是一个表达式。表达式和命题要分清。',
      },
      {
        id: 'p13-flow',
        label: '判断流程',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['完整句子', '变量固定', '能判真假'],
        script:
          '判断一个东西是不是命题，可以按这个流程：它是不是完整句子，变量是否固定，最后能不能判真或假。',
      },
      {
        id: 'p13-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么 x 是偶数不像 2 是偶数那样立刻有真假？'],
        script:
          '因为 x 是谁还没有确定。不同的 x 会给出不同真假，所以它还不是一个固定命题。',
      },
    ],
  },
  {
    title: '让谓词变成命题',
    promptSummary: '代入对象和加量词让谓词有真假。',
    components: [
      {
        id: 'p14-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['让谓词变成命题', '固定变量，或者加上量词'],
        script:
          '谓词本身带变量。要让它变成命题，最常见的方式是代入具体对象，或者加上量词。',
      },
      {
        id: 'p14-substitute',
        label: '代入对象',
        role: 'example',
        color: 'lime',
        visibleText: ['P(x)：x 是偶数', 'P(4) 真', 'P(5) 假'],
        script:
          '代入具体对象后，真假就确定了。四是偶数为真，五是偶数为假。',
      },
      {
        id: 'p14-forall',
        label: '全称量词',
        role: 'formula',
        color: 'blue',
        visibleText: ['对所有 x', '每一个对象都要检查', '∀x'],
        script:
          '全称量词表示对范围内每一个对象都成立。只要有一个反例，整个全称命题就为假。',
      },
      {
        id: 'p14-exists',
        label: '存在量词',
        role: 'formula',
        color: 'cyan',
        visibleText: ['存在 x', '找到一个对象', '∃x'],
        script:
          '存在量词要求至少找到一个对象让条件成立。它不要求每个对象都满足。',
      },
      {
        id: 'p14-domain',
        label: '论域仍然重要',
        role: 'pitfall',
        color: 'magenta',
        visibleText: ['x 在哪个集合里', '量词必须有范围', 'x ∈ Z'],
        script:
          '量词也离不开论域。对所有 x，必须说明 x 在哪个集合里，否则这句话的范围不清楚。',
      },
      {
        id: 'p14-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['同一句 P(x)，为什么换了论域真假可能改变？'],
        script:
          '换论域会改变要检查的对象，所以同一个谓词加上量词以后，真假也可能改变。',
      },
    ],
  },
  {
    title: '且、或、非与真值表',
    promptSummary: '复合命题和真值表。',
    components: [
      {
        id: 'p15-header',
        label: '主题',
        role: 'opening',
        color: 'red',
        visibleText: ['且、或、非与真值表', '复杂句子先拆成小命题'],
        script:
          '这一页讲复合命题。复杂句子不是靠语感判断，而是先拆成小命题，再看连接词。',
      },
      {
        id: 'p15-and',
        label: '且',
        role: 'formula',
        color: 'lime',
        visibleText: ['p 且 q', '两个都真才真', 'p ∧ q'],
        script:
          '且表示两个条件同时成立。只有 p 和 q 都为真，p 且 q 才为真。',
      },
      {
        id: 'p15-or',
        label: '或',
        role: 'formula',
        color: 'blue',
        visibleText: ['p 或 q', '至少一个真就真', 'p ∨ q'],
        script:
          '或表示至少一个成立。p 真或 q 真，复合命题就真。',
      },
      {
        id: 'p15-not',
        label: '非',
        role: 'formula',
        color: 'cyan',
        visibleText: ['非 p', '把真假反过来', '¬p'],
        script:
          '非就是取反。p 为真时非 p 为假，p 为假时非 p 为真。',
      },
      {
        id: 'p15-table',
        label: '真值表',
        role: 'example',
        color: 'magenta',
        visibleText: ['p', 'q', 'p∧q', 'p∨q', '真', '假'],
        script:
          '真值表把所有可能情况列出来。它的力量在于不遗漏任何真假组合。',
      },
      {
        id: 'p15-question',
        label: '底部追问',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['为什么真值表可以证明两个复合命题等价？'],
        script:
          '如果两个复合命题在每一种真假组合下结果都一样，它们就等价。真值表正是在检查全部情况。',
      },
    ],
  },
  {
    title: '总结：集合语言就是证明语言的入口',
    promptSummary: '对象、条件、判断、证明的闭环。',
    components: [
      {
        id: 'p16-header',
        label: '总结主线',
        role: 'opening',
        color: 'red',
        visibleText: ['总结：集合语言就是证明语言的入口', '对象、条件、判断、证明'],
        script:
          '最后一页把整节课收束起来。集合语言不是孤立知识点，它是证明语言的入口。',
      },
      {
        id: 'p16-objects',
        label: '对象要清楚',
        role: 'takeaway',
        color: 'lime',
        visibleText: ['先说对象是谁', '集合必须定义明确'],
        script:
          '第一件事是对象要清楚。集合如果定义不明确，后面所有判断都会失去基础。',
      },
      {
        id: 'p16-conditions',
        label: '条件要能展开',
        role: 'takeaway',
        color: 'blue',
        visibleText: ['x ∈ A∪B', 'x∈A 或 x∈B'],
        script:
          '第二件事是条件要能展开。集合运算最终都要翻译成一个元素满足什么条件。',
      },
      {
        id: 'p16-judgment',
        label: '判断要有真假',
        role: 'takeaway',
        color: 'cyan',
        visibleText: ['命题可以判真或假', '谓词变量固定后再判断'],
        script:
          '第三件事是判断要有真假。命题已经能判断，谓词则需要变量固定或加上量词。',
      },
      {
        id: 'p16-proof',
        label: '证明从定义出发',
        role: 'strategy',
        color: 'magenta',
        visibleText: ['任取 x', '展开定义', '推出目标'],
        script:
          '最后回到证明。标准动作是任取元素，展开定义，推出目标。这个结构会在后面的证明题里反复出现。',
      },
      {
        id: 'p16-challenge',
        label: '最后挑战',
        role: 'takeaway',
        color: 'yellow',
        visibleText: ['给一个集合等式，先说证明策略，再开始计算'],
        script:
          '最后的挑战是：看到集合等式时，先别急着算，先说出证明策略。通常就是双向包含和元素条件翻译。',
      },
    ],
  },
];

function ensureDirs() {
  for (const dir of [OUT_DIR, SOURCE_DIR, RECOVERED_DIR, META_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function markerColorForPixel(data, index) {
  const p = { r: data[index], g: data[index + 1], b: data[index + 2] };
  for (const [name, test] of Object.entries(MARKER_TESTS)) {
    if (test(p)) return name;
  }
  return null;
}

function detectMarkerComponents(data, info) {
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];
  const idx = (x, y) => (y * width + x) * channels;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * width + x;
      if (visited[offset]) continue;
      const color = markerColorForPixel(data, idx(x, y));
      if (!color) {
        visited[offset] = 1;
        continue;
      }

      const queue = [[x, y]];
      visited[offset] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      for (let q = 0; q < queue.length; q += 1) {
        const [cx, cy] = queue[q];
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nOffset = ny * width + nx;
            if (visited[nOffset]) continue;
            if (markerColorForPixel(data, idx(nx, ny)) === color) {
              visited[nOffset] = 1;
              queue.push([nx, ny]);
            }
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fillRatio = count / (boxWidth * boxHeight);
      if (
        count >= 20 &&
        boxWidth >= 6 &&
        boxWidth <= 36 &&
        boxHeight >= 6 &&
        boxHeight <= 36 &&
        fillRatio >= 0.38
      ) {
        components.push({ color, count, minX, minY, maxX, maxY, boxWidth, boxHeight, fillRatio });
      }
    }
  }

  return components;
}

function chooseMarkersByColor(components, color) {
  const candidates = components
    .filter((component) => component.color === color)
    .sort((a, b) => b.count - a.count);
  if (candidates.length <= 4) return candidates;

  const bySpreadScore = candidates
    .map((component) => ({
      component,
      cx: (component.minX + component.maxX) / 2,
      cy: (component.minY + component.maxY) / 2,
    }))
    .sort((a, b) => a.cy - b.cy);
  const top = bySpreadScore.slice(0, Math.ceil(bySpreadScore.length / 2)).sort((a, b) => a.cx - b.cx);
  const bottom = bySpreadScore
    .slice(Math.ceil(bySpreadScore.length / 2))
    .sort((a, b) => a.cx - b.cx);

  const selected = [top[0], top.at(-1), bottom[0], bottom.at(-1)]
    .filter(Boolean)
    .map((item) => item.component);
  return Array.from(new Map(selected.map((component) => [`${component.minX}:${component.minY}`, component])).values()).slice(0, 4);
}

function orderMarkerPoints(markers) {
  const points = markers
    .map((marker) => ({
      x: Math.round((marker.minX + marker.maxX) / 2),
      y: Math.round((marker.minY + marker.maxY) / 2),
      marker,
    }))
    .sort((a, b) => a.y - b.y);
  const top = points.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
  return [
    { ...top[0], corner: 'top-left' },
    { ...top[1], corner: 'top-right' },
    { ...bottom[0], corner: 'bottom-left' },
    { ...bottom[1], corner: 'bottom-right' },
  ];
}

function median(values) {
  if (!values.length) return 248;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function removeMarkers(data, info, markerComponents) {
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const idx = (x, y) => (y * width + x) * channels;

  for (const marker of markerComponents) {
    const pad = 4;
    const x0 = Math.max(0, marker.minX - pad);
    const y0 = Math.max(0, marker.minY - pad);
    const x1 = Math.min(width - 1, marker.maxX + pad);
    const y1 = Math.min(height - 1, marker.maxY + pad);
    const samples = [[], [], []];

    for (let y = Math.max(0, y0 - 14); y <= Math.min(height - 1, y1 + 14); y += 1) {
      for (let x = Math.max(0, x0 - 14); x <= Math.min(width - 1, x1 + 14); x += 1) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        const i = idx(x, y);
        if (markerColorForPixel(data, i)) continue;
        if (data[i] > 178 && data[i + 1] > 178 && data[i + 2] > 178) {
          samples[0].push(data[i]);
          samples[1].push(data[i + 1]);
          samples[2].push(data[i + 2]);
        }
      }
    }

    const fill = [median(samples[0]), median(samples[1]), median(samples[2])];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = idx(x, y);
        out[i] = fill[0];
        out[i + 1] = fill[1];
        out[i + 2] = fill[2];
        if (channels > 3) out[i + 3] = 255;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(x, y);
      if (!markerColorForPixel(out, i)) continue;
      const samples = [[], [], []];
      for (let yy = Math.max(0, y - 8); yy <= Math.min(height - 1, y + 8); yy += 1) {
        for (let xx = Math.max(0, x - 8); xx <= Math.min(width - 1, x + 8); xx += 1) {
          const j = idx(xx, yy);
          if (!markerColorForPixel(out, j) && out[j] > 178 && out[j + 1] > 178 && out[j + 2] > 178) {
            samples[0].push(out[j]);
            samples[1].push(out[j + 1]);
            samples[2].push(out[j + 2]);
          }
        }
      }
      out[i] = median(samples[0]);
      out[i + 1] = median(samples[1]);
      out[i + 2] = median(samples[2]);
      if (channels > 3) out[i + 3] = 255;
    }
  }

  return out;
}

function buildStyleProfile() {
  return {
    id: 'default-hand-drawn-notebook',
    label: '中文手写证明课笔记',
    baselineRules: [
      '白色方格纸背景',
      '黑色马克笔中文讲解',
      '深青色数学符号',
      '普通内容不使用纯色角标颜色',
      '不显示课程号、页码或周次',
    ],
    styleBrief: {
      schemaVersion: 1,
      preset: 'hand-drawn-course-notebook',
      canvas: '16:9',
      background: 'white graph-paper notebook background with faint light-gray grid',
      writingStyle: 'common college-course hand-drawn marker notes with readable Chinese labels',
      colorMood: 'black marker text, deep teal formulas, pale teal fills, muted brown arrows',
      density: 'medium',
      decorationLevel: 'light',
      avoidPureMarkerColors: COLORS.map((color) => color.hex),
      ordinaryContentColorRule:
        'Do not use pure marker colors in ordinary content; those colors are reserved for recoverable corner markers only.',
    },
  };
}

function promptPlanForPage(page, recoveryComponents, sourceUrl) {
  const markerCountsByColor = Object.fromEntries(COLORS.map((color) => [color.hex, 4]));
  return {
    schemaVersion: 1,
    canvas: { width: 1600, height: 900, aspectRatio: '16:9' },
    styleProfile: buildStyleProfile(),
    componentPlans: page.components.map((component, index) => {
      const color = COLOR_BY_NAME.get(component.color);
      return {
        id: component.id,
        label: component.label,
        role: component.role === 'proof' ? 'proof' : component.role === 'pitfall' ? 'pitfall' : component.role === 'takeaway' ? 'takeaway' : component.role === 'formula' ? 'formula' : component.role === 'example' ? 'example' : component.role === 'strategy' ? 'strategy' : component.role === 'definition' ? 'definition' : 'opening',
        order: index + 1,
        layoutSlot: index === 0 ? 'top-full' : index === 5 ? 'bottom-full' : 'free',
        markerColorName: color.name,
        markerColorHex: color.hex,
        visibleText: component.visibleText,
        formulas: component.visibleText.filter((text) => /[∈⊆⊂∩∪∀∃¬∨∧=^{}]/.test(text)),
        participatesInMask: true,
      };
    }),
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 16,
      markerCountPerComponent: 4,
      blankBackgroundPaddingPx: 30,
      maxMaskableComponents: 6,
      colorPool: COLORS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: COLORS.map((color) => color.hex),
    },
    compiledImagePrompt: page.promptSummary,
    promptHash: crypto.createHash('sha1').update(page.title + page.promptSummary).digest('hex'),
    validationTarget: {
      maskableComponentCount: 6,
      totalMarkerCount: 24,
      markerCountsByColor,
      forbiddenVisibleMarks: ['colored connecting lines', 'colored component frames', 'course number', 'page number', 'Week label'],
    },
    recoveryResult: {
      status: recoveryComponents.every((component) => component.markerCount === 4) ? 'passed' : 'partial',
      recoveredAt: Date.now(),
      originalMarkerImageUrl: sourceUrl,
      originalMarkerImageDimensions: { width: 1600, height: 900 },
      components: recoveryComponents,
    },
  };
}

function focusShape(component, bbox) {
  const scaleX = 1000 / 1600;
  const scaleY = 562.5 / 900;
  const [x0, y0, x1, y1] = bbox;
  return {
    id: component.id,
    name: `lecture-focus-generated: ${component.label}`,
    type: 'shape',
    left: Math.round(x0 * scaleX * 10) / 10,
    top: Math.round(y0 * scaleY * 10) / 10,
    width: Math.round((x1 - x0) * scaleX * 10) / 10,
    height: Math.round((y1 - y0) * scaleY * 10) / 10,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function buildActions(page) {
  return page.components.flatMap((component, index) => [
    {
      id: `${component.id}-spotlight`,
      type: 'spotlight',
      title: `聚焦：${component.label}`,
      elementId: component.id,
      dimOpacity: 0.62,
    },
    {
      id: `${component.id}-speech`,
      type: 'speech',
      title: component.label,
      text: component.script,
    },
  ]);
}

function sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents) {
  const imageElementId = `p${String(index + 1).padStart(2, '0')}-full-page-bitmap`;
  const focusById = new Map(recoveryComponents.map((component) => [component.componentId, component]));
  const focusElements = page.components
    .map((component) => {
      const recovered = focusById.get(component.id);
      return recovered?.bbox ? focusShape(component, recovered.bbox) : null;
    })
    .filter(Boolean);

  return {
    id: `${NOTEBOOK_ID}-scene-${String(index + 1).padStart(2, '0')}`,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: {
        id: `${NOTEBOOK_ID}-canvas-${String(index + 1).padStart(2, '0')}`,
        viewportSize: 1000,
        viewportRatio: 0.5625,
        background: { type: 'solid', color: '#ffffff', respectProfileStyle: false },
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#0f172a', '#0f766e', '#b45309', '#f8fafc'],
          fontColor: '#0f172a',
          fontName: 'Microsoft YaHei',
        },
        remark: page.promptSummary,
        elements: [
          {
            id: imageElementId,
            type: 'image',
            name: 'full_page_bitmap',
            left: 0,
            top: 0,
            width: 1000,
            height: 562.5,
            rotate: 0,
            fixedRatio: false,
            src: cleanUrl,
            imageType: 'background',
            lock: true,
          },
          ...focusElements,
        ],
      },
      imageNotebookPromptPlan: promptPlanForPage(page, recoveryComponents, sourceUrl),
    },
    actions: buildActions(page),
    whiteboards: [],
    generationDiagnostics: {
      pipeline: 'image',
      slideGenerationRoute: 'built-in-codex-imagegen',
      generatedAt: Date.now(),
      lectureActionDiagnostics: {
        speechCount: 6,
        focusCount: 6,
        focusTargetCount: focusElements.length,
        unresolvedFocusElementIds: page.components
          .filter((component) => !focusById.get(component.id)?.bbox)
          .map((component) => component.id),
        maxConsecutiveSpeech: 1,
        focusWithoutFollowingSpeech: 0,
        warnings: focusElements.length === 6 ? [] : ['部分角标区域未能自动恢复 bbox'],
      },
    },
  };
}

async function processPage(page, index, sourcePath) {
  const pageNo = String(index + 1).padStart(3, '0');
  const sourceOut = path.join(SOURCE_DIR, `page-${pageNo}-source-marked.png`);
  const cleanOut = path.join(RECOVERED_DIR, `page-${pageNo}-clean.png`);

  await sharp(sourcePath).resize(1600, 900, { fit: 'fill' }).png().toFile(sourceOut);
  const { data, info } = await sharp(sourceOut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const allComponents = detectMarkerComponents(data, info);
  const chosenMarkers = [];
  const recoveryComponents = page.components.map((component) => {
    const color = COLOR_BY_NAME.get(component.color);
    const markers = chooseMarkersByColor(allComponents, component.color);
    chosenMarkers.push(...markers);
    const ordered = markers.length === 4 ? orderMarkerPoints(markers) : [];
    const xs = ordered.map((point) => point.x);
    const ys = ordered.map((point) => point.y);
    return {
      componentId: component.id,
      markerColorHex: color.hex,
      markerCount: markers.length,
      ...(ordered.length === 4
        ? {
            bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
            markerPoints: ordered.map(({ x, y, corner }) => ({ x, y, corner })),
          }
        : {}),
    };
  });
  const cleanData = removeMarkers(data, info, chosenMarkers);
  await sharp(cleanData, { raw: info }).png().toFile(cleanOut);

  const sourceUrl = `/generated-notebooks/mat102-sets-propositions-v1/source/page-${pageNo}-source-marked.png`;
  const cleanUrl = `/generated-notebooks/mat102-sets-propositions-v1/recovered/page-${pageNo}-clean.png`;
  const remaining = await countRemainingMarkerPixels(cleanOut);
  const validation = {
    page: index + 1,
    title: page.title,
    sourcePath,
    sourceUrl,
    cleanUrl,
    detectedCandidateCount: allComponents.length,
    markerCountsByColor: Object.fromEntries(
      COLORS.map((color) => [color.name, recoveryComponents.find((component) => component.markerColorHex === color.hex)?.markerCount ?? 0]),
    ),
    remainingMarkerPixels: remaining,
    status:
      recoveryComponents.every((component) => component.markerCount === 4) &&
      Object.values(remaining).every((count) => count === 0)
        ? 'passed'
        : 'needs-review',
  };
  return {
    validation,
    scene: sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents),
  };
}

async function countRemainingMarkerPixels(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = Object.fromEntries(COLORS.map((color) => [color.name, 0]));
  for (let i = 0; i < data.length; i += info.channels) {
    const color = markerColorForPixel(data, i);
    if (color) counts[color] += 1;
  }
  return counts;
}

async function buildContactSheet(inputGlobDir, filename, label) {
  const files = fs
    .readdirSync(inputGlobDir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => path.join(inputGlobDir, name));
  const thumbW = 320;
  const thumbH = 180;
  const labelH = 34;
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  const composites = [];
  for (let i = 0; i < files.length; i += 1) {
    const thumb = await sharp(files[i]).resize(thumbW, thumbH, { fit: 'cover' }).png().toBuffer();
    const x = (i % cols) * thumbW;
    const y = Math.floor(i / cols) * (thumbH + labelH);
    composites.push({ input: thumb, left: x, top: y });
    const svg = `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="8" y="22" font-family="Arial" font-size="18" fill="white">${label} ${String(i + 1).padStart(2, '0')}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left: x, top: y + thumbH });
  }
  await sharp({
    create: {
      width: cols * thumbW,
      height: rows * (thumbH + labelH),
      channels: 3,
      background: '#f8fafc',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function importToDatabase(scenes) {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const course = await tx.course.findFirst({
        where: { id: COURSE_ID, ownerId: OWNER_ID },
        select: { id: true, ownerId: true, name: true, courseCode: true },
      });
      if (!course) {
        throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);
      }

      await tx.notebook.deleteMany({
        where: { courseId: COURSE_ID, ownerId: OWNER_ID },
      });

      await tx.notebook.create({
        data: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            '从集合、元素条件、子集证明到命题逻辑的中文手写笔记本；每页保留带角标源图、恢复后课堂图和区域聚焦讲解稿。',
          tags: ['MAT102', '集合', '命题', '证明', '中文'],
          language: 'zh-CN',
          style: 'hand-drawn-course-notebook-marker-recovery',
        },
      });

      await tx.scene.createMany({
        data: scenes.map((scene) => ({
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboards,
        })),
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  ensureDirs();
  if (!fs.existsSync(CANDIDATES_PATH)) {
    throw new Error(`Missing candidates manifest: ${CANDIDATES_PATH}`);
  }
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
  const selected = SELECTED_CANDIDATE_INDICES.map((candidateIndex, pageIndex) => {
    const override = PAGE_SOURCE_OVERRIDES[pageIndex + 1];
    if (override) {
      if (!fs.existsSync(override)) throw new Error(`Page ${pageIndex + 1} override is missing`);
      return override;
    }
    const row = candidates[candidateIndex - 1];
    if (!row?.path || !fs.existsSync(row.path)) {
      throw new Error(`Selected candidate ${candidateIndex} is missing`);
    }
    return row.path;
  });
  if (selected.length !== pages.length) {
    throw new Error(`Expected ${pages.length} selected images, got ${selected.length}`);
  }

  const results = [];
  for (let i = 0; i < pages.length; i += 1) {
    results.push(await processPage(pages[i], i, selected[i]));
  }

  const scenes = results.map((result) => result.scene);
  const validations = results.map((result) => result.validation);
  fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
  fs.writeFileSync(
    path.join(META_DIR, 'lecture-script.json'),
    JSON.stringify(
      pages.map((page, pageIndex) => ({
        page: pageIndex + 1,
        title: page.title,
        regions: page.components.map((component) => ({
          id: component.id,
          label: component.label,
          markerColor: COLOR_BY_NAME.get(component.color).hex,
          script: component.script,
        })),
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(META_DIR, 'scenes.json'), JSON.stringify(scenes, null, 2));

  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source-marked.png', 'source');
  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-recovered-clean.png', 'clean');

  if (process.argv.includes('--import-db')) {
    await importToDatabase(scenes);
  }

  const summary = {
    pages: pages.length,
    passed: validations.filter((validation) => validation.status === 'passed').length,
    needsReview: validations.filter((validation) => validation.status !== 'passed'),
    notebookId: NOTEBOOK_ID,
    courseId: COURSE_ID,
    imported: process.argv.includes('--import-db'),
  };
  fs.writeFileSync(path.join(META_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
